// 读取蓝图项目 JSON 中的所有 model3d 节点，检查外层 model* 字段，内层 meshy/tripo settings 字段，结合 Content/Media 真实文件
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function findProjectRoot(startDir) {
	let dir = startDir
	for (let i = 0; i < 10; i++) {
		if (fs.existsSync(path.join(dir, 'package.json'))) {
			try {
				const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
				if (pkg.name === 'dvstudio' || pkg.name === 'dweb-video-studio') {
					return dir
				}
			} catch {}
		}
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return startDir
}

const projectRoot = findProjectRoot(__dirname)

// ===== 可根据实际情况修改此项目根 =====
const USER_PROJECT_ROOT = 'G:\\DVSTestProject\\复赛视频项目'
const BLUEPRINT_PATH = path.join(USER_PROJECT_ROOT, 'Blueprints', 'main.blueprint.json')
const MEDIA_DIR = path.join(USER_PROJECT_ROOT, 'Content', 'Media')

console.log('[audit] Blueprint:', BLUEPRINT_PATH, 'exists:', fs.existsSync(BLUEPRINT_PATH))
console.log('[audit] Media dir:', MEDIA_DIR, 'exists:', fs.existsSync(MEDIA_DIR))

const MODEL_EXT_WHITELIST = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'usdz']
const IMAGE_EXT_BLACKLIST = [
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tif',
	'tiff',
	'svg',
	'avif'
]

function extractExt(urlOrPath) {
	const s = String(urlOrPath || '').trim()
	if (!s) return ''
	// dweb 参数优先
	const m1 = s.match(/[?&](?:path|relativePath|assetPath)=([^&]+)/i)
	if (m1) {
		try {
			const p = decodeURIComponent(m1[1]).split('?')[0].split('#')[0]
			const lastDot = p.lastIndexOf('.')
			if (lastDot >= 0) return p.slice(lastDot + 1).toLowerCase()
		} catch {}
	}
	const withoutQuery = s.split('?')[0].split('#')[0]
	const lastSlash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
	const name = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
	const d = name.lastIndexOf('.')
	return d >= 0 ? name.slice(d + 1).toLowerCase() : ''
}

function isImageExt(ext) {
	return ext && IMAGE_EXT_BLACKLIST.includes(String(ext).toLowerCase())
}
function isModelExt(ext) {
	return ext && MODEL_EXT_WHITELIST.includes(String(ext).toLowerCase())
}
function isRemoteHttp(u) {
	const s = String(u || '')
		.toLowerCase()
		.trim()
	return s.startsWith('http://') || s.startsWith('https://')
}
function isDwebProjectAsset(u) {
	const s = String(u || '')
		.toLowerCase()
		.trim()
	return s.startsWith('dweb://project-assets') || s.startsWith('dweb:project-assets')
}

// 实际 Media 目录下所有 glb 文件 + 建立 taskId 映射
const mediaGlbFiles = []
const glbByTaskId = new Map()
if (fs.existsSync(MEDIA_DIR)) {
	for (const entry of fs.readdirSync(MEDIA_DIR, { withFileTypes: true })) {
		if (!entry.isFile()) continue
		const name = entry.name
		if (!name.toLowerCase().endsWith('.glb')) continue
		const full = path.join(MEDIA_DIR, name)
		const stat = fs.statSync(full)
		const obj = { name, full, size: stat.size, relative: 'Content/Media/' + name }
		mediaGlbFiles.push(obj)
		// meshy-3d-<taskId>.glb / meshy_<taskId>.glb / tripo3d-<taskId>.glb / tripo3d_<taskId>.glb
		const m = name.match(/^(?:meshy-3d-|meshy[_-]|tripo3d[_-])([a-f0-9-]+)\.glb$/i)
		if (m) {
			const id = m[1].toLowerCase()
			if (!glbByTaskId.has(id)) glbByTaskId.set(id, [])
			glbByTaskId.get(id).push(obj)
		}
		// 也把带时间戳的变种的任务 id 做索引（去掉尾部 `_1785xxx_xxx`）
		const m2 = name.match(/^(?:meshy-3d-|meshy[_-]|tripo3d[_-])([a-f0-9-]+)_.*\.glb$/i)
		if (m2) {
			const id = m2[1].toLowerCase()
			if (!glbByTaskId.has(id)) glbByTaskId.set(id, [])
			const arr = glbByTaskId.get(id)
			if (!arr.find((x) => x.full === obj.full)) arr.push(obj)
		}
	}
}

// ====== 核心修复策略推导 ======
// 当节点是 model3d 类型且关联了 meshyTaskId/tripo3dTaskId，优先使用 Content/Media 中已存在的对应 glb 文件
// 不进行任何远程 URL 下载或远程请求，直接文件系统匹配

function pickMediaGlbForTask(taskId) {
	if (!taskId) return null
	const id = String(taskId).toLowerCase().trim()
	const arr = glbByTaskId.get(id)
	if (!arr || arr.length === 0) return null
	// 优先选文件名不含 `_` 后缀（即主文件）
	const primary = arr.find((x) =>
		x.name.match(/^(?:meshy-3d-|meshy[_-]|tripo3d[_-])[a-f0-9-]+\.glb$/i)
	)
	return primary || arr[0]
}

// ====== 读取 blueprint ======
const bpStr = fs.readFileSync(BLUEPRINT_PATH, 'utf-8')
const bp = JSON.parse(bpStr)
const nodes = bp.nodesById || {}
const resources = bp.resourcesById || {}

const model3dNodes = []
for (const [id, node] of Object.entries(nodes)) {
	if (node && node.type === 'model3d') {
		model3dNodes.push(node)
	}
}

console.log('\n[audit] 共找到 model3d 节点数量:', model3dNodes.length)

let report = { totalNodes: model3dNodes.length, nodes: [] }

for (const n of model3dNodes) {
	const id = n.id
	const alias = n.alias || n.title || ''
	const m3s = n.model3dSettings || null
	const meshy = (m3s && m3s.meshyModelSettings) || n.meshySettings || null
	const tripo = (m3s && m3s.tripo3dModelSettings) || n.tripo3dSettings || null

	const outer = {
		modelUrl: n.modelUrl,
		modelSourcePath: n.modelSourcePath,
		modelAssetUrl: n.modelAssetUrl,
		modelAssetPath: n.modelAssetPath,
		modelProjectRelativePath: n.modelProjectRelativePath
	}

	const diagnostics = []
	const candidates = []

	// ==== 收集候选 ====
	// 1) 外层 fields
	for (const [k, v] of Object.entries(outer)) {
		if (v) candidates.push({ src: `outer.${k}`, value: v })
	}
	// 2) meshy inner
	if (meshy) {
		const fields = [
			['meshyOutputAssetUrl', meshy.meshyOutputAssetUrl || meshy.assetUrl],
			['meshyOutputAssetPath', meshy.meshyOutputAssetPath || meshy.assetPath],
			['meshyModelUrl', meshy.meshyModelUrl],
			['preferredModelUrl', meshy.preferredModelUrl]
		]
		// relation summary
		const rel = meshy.meshyRelationSummary
		if (rel && typeof rel === 'object') {
			fields.push(['relation.effectiveLocalAssetUrl', rel.effectiveLocalAssetUrl])
			fields.push(['relation.effectiveLocalAssetPath', rel.effectiveLocalAssetPath])
			fields.push(['relation.effectivePreferredModelUrl', rel.effectivePreferredModelUrl])
		}
		const outS = meshy.meshyOutputSummary
		if (outS && typeof outS === 'object') {
			fields.push(['outputSummary.assetUrl', outS.assetUrl])
			fields.push(['outputSummary.assetPath', outS.assetPath])
			fields.push(['outputSummary.preferredUrl', outS.preferredUrl])
		}
		for (const [k, v] of fields) if (v) candidates.push({ src: `meshy.${k}`, value: v })
	}
	// 3) tripo inner
	if (tripo) {
		const fields = [
			['tripo3dOutputAssetUrl', tripo.tripo3dOutputAssetUrl || tripo.assetUrl],
			['tripo3dOutputAssetPath', tripo.tripo3dOutputAssetPath || tripo.assetPath],
			['tripo3dModelUrl', tripo.tripo3dModelUrl],
			['tripo3dPreferredModelUrl', tripo.tripo3dPreferredModelUrl || tripo.preferredUrl]
		]
		for (const [k, v] of fields) if (v) candidates.push({ src: `tripo.${k}`, value: v })
	}

	// ==== 判定每个 candidate ====
	const candidateReports = candidates.map((c) => {
		const ext = extractExt(c.value)
		const isRemote = isRemoteHttp(c.value)
		const isDweb = isDwebProjectAsset(c.value)
		const badExt = isImageExt(ext)
		const goodExt = isModelExt(ext)
		let fileExistsOnDisk = false
		let diskPath = ''
		// 若是本地绝对路径 / dweb path 可以直接尝试判断文件是否存在
		if (isDweb) {
			const m = String(c.value).match(/[?&](?:path|relativePath|assetPath)=([^&]+)/i)
			if (m) {
				try {
					const rel = decodeURIComponent(m[1]).split('?')[0].split('#')[0]
					const full = path.join(USER_PROJECT_ROOT, rel)
					diskPath = full
					fileExistsOnDisk = fs.existsSync(full)
				} catch {}
			}
		} else if (!isRemote && /^[a-zA-Z]:[\\/]/.test(String(c.value))) {
			diskPath = c.value
			fileExistsOnDisk = fs.existsSync(c.value)
		}
		return {
			...c,
			ext,
			isRemote,
			isDweb,
			badExt,
			goodExt,
			fileExistsOnDisk,
			diskPath
		}
	})

	// ==== 推导最佳 dweb URL（不依赖远程）====
	let bestDwebUrl = ''
	let bestLocalAbs = ''
	let bestCandidate = null
	// 策略1：从已有的 candidates 中挑 dweb/本地绝对路径 + model ext + 磁盘存在
	const priority = (c) => {
		let score = 0
		if (c.fileExistsOnDisk) score += 100
		if (c.goodExt) score += 50
		if (c.isDweb) score += 20
		if (!c.isRemote) score += 10
		if (c.badExt) score -= 200
		return score
	}
	candidateReports.sort((a, b) => priority(b) - priority(a))
	if (candidateReports.length > 0 && priority(candidateReports[0]) > 0) {
		bestCandidate = candidateReports[0]
	}

	// 策略2：若有 meshyTaskId / tripo3dTaskId，直接映射到 Content/Media 下的文件
	let mediaGlb = null
	const taskId = meshy?.meshyTaskId || tripo?.tripo3dTaskId
	if (taskId) {
		mediaGlb = pickMediaGlbForTask(taskId)
		if (mediaGlb) {
			// 构造 dweb URL
			const rel = mediaGlb.relative
			const dweb = `dweb://project-assets/?projectId=1&path=${encodeURIComponent(rel)}`
			bestDwebUrl = dweb
			bestLocalAbs = mediaGlb.full
			if (!bestCandidate || bestCandidate.diskPath !== mediaGlb.full) {
				diagnostics.push(
					`taskId=${taskId} 命中 Media 文件:${mediaGlb.name}，优先使用该文件，构造 dweb=${dweb}`
				)
			}
		} else {
			diagnostics.push(`taskId=${taskId} 在 Content/Media 未找到对应 glb（需要先完成任务下载）`)
		}
	} else if (bestCandidate) {
		// 用候选里最好的
		if (bestCandidate.isDweb) bestDwebUrl = bestCandidate.value
		if (bestCandidate.diskPath) bestLocalAbs = bestCandidate.diskPath
		else if (!bestCandidate.isRemote) bestLocalAbs = bestCandidate.value
	}

	// 诊断外层字段
	const outerFieldsReport = {}
	for (const [k, v] of Object.entries(outer)) {
		if (!v) {
			outerFieldsReport[k] = { value: '', status: 'EMPTY' }
			continue
		}
		const ext = extractExt(v)
		if (isImageExt(ext)) {
			outerFieldsReport[k] = {
				value: v,
				ext,
				status: 'BAD_IMAGE_EXT',
				suggestion: '应清除或替换为模型后缀路径'
			}
			diagnostics.push(`[严重] ${k} 被图片后缀(${ext})污染:${v}`)
		} else if (isRemoteHttp(v)) {
			outerFieldsReport[k] = {
				value: v.slice(0, 120),
				ext,
				status: 'REMOTE_URL',
				suggestion: '优先使用 dweb / 本地绝对路径'
			}
			diagnostics.push(`[警告] ${k} 仍为远程URL:${v.slice(0, 80)}...`)
		} else if (isModelExt(ext)) {
			outerFieldsReport[k] = { value: v, ext, status: 'MODEL_EXT_OK' }
		} else {
			outerFieldsReport[k] = { value: v, ext, status: 'UNKNOWN' }
		}
	}

	report.nodes.push({
		id,
		alias,
		taskId: taskId || '',
		sourceProvider: meshy ? 'meshy' : tripo ? 'tripo3d' : 'unknown',
		outerFieldsReport,
		topCandidates: candidateReports.slice(0, 6).map((c) => ({
			src: c.src,
			ext: c.ext,
			isRemote: c.isRemote,
			isDweb: c.isDweb,
			badExt: c.badExt,
			goodExt: c.goodExt,
			fileExistsOnDisk: c.fileExistsOnDisk,
			valuePreview: String(c.value).length > 160 ? String(c.value).slice(0, 160) + '...' : c.value
		})),
		derivedBest: {
			dwebUrl: bestDwebUrl,
			localAbsolutePath: bestLocalAbs,
			fileExistsOnDisk: bestLocalAbs ? fs.existsSync(bestLocalAbs) : false,
			fromTaskIdMatch: !!mediaGlb
		},
		diagnostics
	})
}

const outputDir = path.join(projectRoot, 'AIPlan')
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
const outPath = path.join(outputDir, 'model3d-node-audit.json')
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')

console.log('\n[audit] 结果摘要:')
for (const n of report.nodes) {
	const ok = n.derivedBest.fileExistsOnDisk ? 'OK' : 'MISSING'
	console.log(
		`  - [${ok}] ${n.id.slice(0, 24)}  ${n.alias.slice(0, 24)}  provider=${n.sourceProvider}  taskId=${n.taskId.slice(0, 16)}`
	)
	console.log(`       dweb: ${n.derivedBest.dwebUrl || '(空)'}`)
	console.log(`       file: ${n.derivedBest.localAbsolutePath || '(空)'}`)
	if (n.diagnostics.length > 0) {
		for (const d of n.diagnostics) console.log(`       ! ${d}`)
	}
}
console.log('\n[audit] 完整报告已写入:', outPath)
process.exit(0)
