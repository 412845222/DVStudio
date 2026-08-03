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
const dbPath = path.join(projectRoot, 'DVSResource', 'BackendData', 'localdb.sqlite3')

console.log('[scan-db-direct] Project root:', projectRoot)
console.log('[scan-db-direct] DB path:', dbPath)
console.log('[scan-db-direct] DB exists:', fs.existsSync(dbPath))

const buf = fs.readFileSync(dbPath)
const text = buf.toString('utf-8')

// 扫描 JSON-like objects 中包含 modelAssetUrl|modelUrl|meshyModelSettings|meshySettings 的片段
function extractJsonWindows(str, keyword, windowSize = 4000) {
	const results = []
	const lower = str.toLowerCase()
	const kw = keyword.toLowerCase()
	let idx = 0
	while ((idx = lower.indexOf(kw, idx)) !== -1) {
		const start = Math.max(0, idx - windowSize)
		const end = Math.min(str.length, idx + kw.length + windowSize)
		// 找 JSON 边界 { ... }
		let depth = 0
		let jsonStart = -1
		let jsonEnd = -1
		for (let i = start; i < end; i++) {
			const c = str[i]
			if (c === '{') {
				if (depth === 0) jsonStart = i
				depth++
			} else if (c === '}') {
				depth--
				if (depth === 0 && jsonStart >= 0) {
					jsonEnd = i + 1
					break
				}
			}
		}
		if (jsonStart >= 0 && jsonEnd > jsonStart) {
			try {
				const snippet = str.slice(jsonStart, jsonEnd)
				const parsed = JSON.parse(snippet)
				results.push({ at: idx, parsed })
			} catch {
				// try to sanitize control chars
				try {
					const sanitized = str
						.slice(jsonStart, jsonEnd)
						.replace(/[\x00-\x1F\x7F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ' '))
					const parsed = JSON.parse(sanitized)
					results.push({ at: idx, parsed })
				} catch {}
			}
		}
		idx += kw.length
	}
	return results
}

function deepFind(obj, predicate, path = '', acc = []) {
	if (!obj || typeof obj !== 'object') return acc
	if (predicate(obj, path)) acc.push({ path, value: obj })
	if (Array.isArray(obj)) {
		obj.forEach((v, i) => deepFind(v, predicate, `${path}[${i}]`, acc))
	} else {
		for (const [k, v] of Object.entries(obj)) {
			deepFind(v, predicate, `${path}.${k}`, acc)
		}
	}
	return acc
}

const keywords = [
	'meshyModelSettings',
	'tripo3dModelSettings',
	'modelAssetUrl',
	'modelUrl',
	'modelSourcePath',
	'meshySettings',
	'model3dSettings'
]
const allMatches = []
for (const kw of keywords) {
	const found = extractJsonWindows(text, kw, 6000)
	for (const f of found) {
		allMatches.push({ keyword: kw, ...f })
	}
}

// unique by JSON.stringify
const seen = new Set()
const uniqueNodes = []
for (const m of allMatches) {
	const str = JSON.stringify(m.parsed)
	if (seen.has(str)) continue
	seen.add(str)
	// 只保留看起来像节点settings的对象（有modelAssetUrl/modelUrl/meshyModelSettings等）
	const hits = deepFind(m.parsed, (v) => {
		if (!v || typeof v !== 'object') return false
		return (
			'modelAssetUrl' in v ||
			'modelUrl' in v ||
			'meshyModelSettings' in v ||
			'tripo3dModelSettings' in v ||
			'meshyOutputAssetUrl' in v ||
			'meshyOutputAssetPath' in v ||
			'meshyTaskId' in v
		)
	})
	if (hits.length > 0) {
		uniqueNodes.push({ raw: m.parsed, hits: hits.map((h) => h.path) })
	}
}

console.log('\n=== 疑似节点settings对象（%d个） ===', uniqueNodes.length)

for (let i = 0; i < uniqueNodes.length; i++) {
	const item = uniqueNodes[i]
	console.log(`\n--- 候选节点 #${i + 1} ---`)
	console.log('命中路径:', item.hits)
	// 打印关键字段
	const s = item.raw
	const printField = (name, val) => {
		if (val === undefined || val === null || val === '') return
		const display =
			typeof val === 'string' && val.length > 300
				? val.slice(0, 300) + `...(len=${val.length})`
				: val
		console.log(
			`  ${name}:`,
			typeof display === 'object' ? JSON.stringify(display, null, 2).slice(0, 1500) : display
		)
	}
	printField('nodeId/alias/title', s.nodeId || s.id || s.alias || s.title)
	printField('type', s.type)
	printField('settings.modelAssetUrl', s.modelAssetUrl ?? s.settings?.modelAssetUrl)
	printField('settings.modelUrl', s.modelUrl ?? s.settings?.modelUrl)
	printField('settings.modelSourcePath', s.modelSourcePath ?? s.settings?.modelSourcePath)
	printField('settings.modelAssetPath', s.modelAssetPath ?? s.settings?.modelAssetPath)
	printField(
		'settings.modelProjectRelativePath',
		s.modelProjectRelativePath ?? s.settings?.modelProjectRelativePath
	)
	printField('resourceId', s.resourceId ?? s.settings?.resourceId)
	printField('lastInputNodeId', s.lastInputNodeId ?? s.settings?.lastInputNodeId)
	const mSettings = s.meshyModelSettings ?? s.settings?.meshyModelSettings ?? s.meshySettings
	if (mSettings && typeof mSettings === 'object') {
		console.log('  [meshy*Settings] 存在:', Object.keys(mSettings).slice(0, 30))
		printField('    meshy*Settings.meshyTaskId', mSettings.meshyTaskId ?? mSettings.taskId)
		printField(
			'    meshy*Settings.meshyOutputAssetUrl',
			mSettings.meshyOutputAssetUrl ?? mSettings.assetUrl
		)
		printField(
			'    meshy*Settings.meshyOutputAssetPath',
			mSettings.meshyOutputAssetPath ?? mSettings.assetPath
		)
		const relation = mSettings.meshyRelationSummary
		if (relation && typeof relation === 'object') {
			printField('      relation.effectiveLocalAssetUrl', relation.effectiveLocalAssetUrl)
			printField('      relation.effectiveLocalAssetPath', relation.effectiveLocalAssetPath)
			printField('      relation.effectivePreferredModelUrl', relation.effectivePreferredModelUrl)
		}
		const output = mSettings.meshyOutputSummary
		if (output && typeof output === 'object') {
			printField('      outputSummary.assetUrl', output.assetUrl)
			printField('      outputSummary.preferredUrl', output.preferredUrl)
			printField('      outputSummary.assetPath', output.assetPath)
			printField('      outputSummary.format', output.format)
		}
	}
	const tSettings = s.tripo3dModelSettings ?? s.settings?.tripo3dModelSettings ?? s.tripo3dSettings
	if (tSettings && typeof tSettings === 'object') {
		console.log('  [tripo3d*Settings] 存在:', Object.keys(tSettings).slice(0, 30))
		printField('    tripo*Settings.tripo3dTaskId', tSettings.tripo3dTaskId ?? tSettings.taskId)
		printField('    tripo*Settings.assetUrl', tSettings.assetUrl ?? tSettings.tripo3dAssetUrl)
		printField('    tripo*Settings.assetPath', tSettings.assetPath ?? tSettings.tripo3dAssetPath)
		printField(
			'    tripo*Settings.preferredUrl',
			tSettings.preferredUrl ?? tSettings.tripo3dPreferredModelUrl
		)
	}
}

// 扫描resourcesById中 resource 的 absolutePath
console.log('\n=== 疑似 resourcesById 对象扫描 (resource.absolutePath) ===')
const resourcesByIdMatches = extractJsonWindows(text, 'absolutePath', 3000)
const resSeen = new Set()
let resCount = 0
for (const m of resourcesByIdMatches) {
	const found = deepFind(m.parsed, (v) => {
		if (!v || typeof v !== 'object') return false
		return (
			('absolutePath' in v || 'sourcePath' in v) &&
			('url' in v || 'projectRelativePath' in v || 'name' in v)
		)
	})
	for (const f of found) {
		const key = JSON.stringify(f.value)
		if (resSeen.has(key)) continue
		resSeen.add(key)
		resCount++
		const v = f.value
		console.log(`\n  resource #${resCount}`)
		console.log('    path:', f.path)
		for (const k of [
			'id',
			'name',
			'url',
			'absolutePath',
			'sourcePath',
			'projectRelativePath',
			'kind',
			'mediaType'
		]) {
			if (v[k] !== undefined && v[k] !== null && v[k] !== '') {
				const val =
					typeof v[k] === 'string' && v[k].length > 200 ? v[k].slice(0, 200) + '...' : v[k]
				console.log(`    ${k}:`, val)
			}
		}
	}
}

// 最后：枚举项目真实磁盘上已知的5个GLB文件，结合taskId看能否映射
console.log('\n=== 项目Content/Media实际GLB文件映射推导 ===')
const candidateRoots = [
	'G:\\DVSTestProject\\复赛视频项目',
	'G:/DVSTestProject/复赛视频项目',
	path.join(projectRoot, 'sample-project')
]
let mediaDir = null
for (const r of candidateRoots) {
	const cand = path.join(r, 'Content', 'Media')
	if (fs.existsSync(cand)) {
		mediaDir = cand
		break
	}
}
if (mediaDir) {
	console.log('Media dir:', mediaDir)
	const files = fs.readdirSync(mediaDir).filter((f) => f.toLowerCase().endsWith('.glb'))
	for (const f of files) {
		const full = path.join(mediaDir, f)
		const stat = fs.statSync(full)
		console.log(`  ${f}  (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
		// 提取 taskId
		const match = f.match(/(?:meshy-3d-|meshy[_-]|tripo3d[_-])([a-f0-9-]+)\.glb/i)
		if (match) {
			console.log(`    -> 推断 taskId: ${match[1]}`)
			console.log(`    -> 推断相对 Content/Media 路径: Content/Media/${f}`)
			console.log(
				`    -> 推断 dweb: dweb://project-assets/?projectId=1&path=${encodeURIComponent('Content/Media/' + f)}`
			)
			console.log(`    -> 本地绝对路径: ${full}`)
		}
	}
} else {
	console.log('未找到Media目录，跳过')
}
