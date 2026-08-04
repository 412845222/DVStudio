/**
 * [3D模型节点诊断脚本] 深入检查 blueprint JSON 中所有 model3d 节点的完整 settings、
 * resourcesById 映射、Content/Media 下的 GLB 文件，以及 LocalDB meshyTasks 表关联。
 *
 * 使用: node scripts/utils/inspect-blueprint-model3d-nodes.mjs
 * 用法: 修改下方 USER_PROJECT_ROOT 即可。
 */
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
const USER_PROJECT_ROOT = 'G:\\DVSTestProject\\复赛视频项目'
const BLUEPRINT_PATH = path.join(USER_PROJECT_ROOT, 'Blueprints', 'main.blueprint.json')
const MEDIA_DIR = path.join(USER_PROJECT_ROOT, 'Content', 'Media')

console.log('[inspect] Blueprint:', BLUEPRINT_PATH, 'exists:', fs.existsSync(BLUEPRINT_PATH))

const bpStr = fs.readFileSync(BLUEPRINT_PATH, 'utf-8')
const bp = JSON.parse(bpStr)
const nodes = bp.nodesById || {}
const resources = bp.resourcesById || {}

console.log('\n[inspect] 总节点数:', Object.keys(nodes).length)
console.log('[inspect] resourcesById 条目数:', Object.keys(resources).length)

console.log('\n=== Content/Media 所有 GLB 文件 ===')
const allGlb = []
if (fs.existsSync(MEDIA_DIR)) {
	for (const name of fs.readdirSync(MEDIA_DIR)) {
		if (!name.toLowerCase().endsWith('.glb')) continue
		const full = path.join(MEDIA_DIR, name)
		const stat = fs.statSync(full)
		const match = name.match(/(?:meshy-3d-|meshy[_-]|tripo3d[_-])([a-f0-9-]+?)(?:_.*)?\.glb$/i)
		const taskId = match ? match[1].toLowerCase() : '(无taskId前缀)'
		allGlb.push({ name, full, size: stat.size, taskId })
		console.log(`  ${name}  (${(stat.size / 1024 / 1024).toFixed(2)} MB)  taskId=${taskId}`)
	}
}

const MODEL_EXT_WHITELIST = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'usdz']
const IMAGE_EXT_BLACKLIST = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff']

function extractExt(urlOrPath) {
	const s = String(urlOrPath || '').trim()
	if (!s) return ''
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

const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i

function extractAnyTaskIdFromObject(obj, acc = []) {
	if (!obj || typeof obj !== 'object') return acc
	for (const [k, v] of Object.entries(obj)) {
		if (typeof v === 'string') {
			const m = v.match(UUID_REGEX)
			if (m) acc.push({ key: k, value: v, taskId: m[0] })
		} else if (typeof v === 'object') {
			extractAnyTaskIdFromObject(v, acc)
		}
	}
	return acc
}

const model3dNodes = Object.entries(nodes).filter(([, n]) => n && n.type === 'model3d')

console.log('\n=== 逐个 Model3D 节点详情 ===')
for (const [nodeId, node] of model3dNodes) {
	console.log(`\n--- 节点 ${nodeId}  alias="${node.alias || node.title || ''}" ---`)
	const s = node.model3dSettings || {}
	for (const k of [
		'modelAssetUrl',
		'modelUrl',
		'modelSourcePath',
		'modelAssetPath',
		'modelProjectRelativePath',
		'modelFormat',
		'modelSourceName',
		'lastInputNodeId',
		'resourceId',
		'modelGenerationSource'
	]) {
		if (s[k] !== undefined && s[k] !== null && s[k] !== '') {
			const ext = extractExt(s[k])
			const isImg = IMAGE_EXT_BLACKLIST.includes(ext)
			const isModel = MODEL_EXT_WHITELIST.includes(ext)
			console.log(
				`  settings.${k}: ${typeof s[k] === 'string' && s[k].length > 200 ? s[k].slice(0, 200) + '...' : JSON.stringify(s[k])}  [ext=${ext} img=${isImg} model=${isModel}]`
			)
		}
	}
	const meshy = s.meshyModelSettings || node.meshySettings || null
	if (meshy && typeof meshy === 'object') {
		console.log(`  [meshyModelSettings] keys=${Object.keys(meshy).slice(0, 40).join(', ')}`)
		const hits = extractAnyTaskIdFromObject(meshy)
		if (hits.length > 0) {
			console.log(`     内嵌taskId:`)
			for (const h of hits.slice(0, 12)) {
				const vShort =
					typeof h.value === 'string' && h.value.length > 150
						? h.value.slice(0, 150) + '...'
						: h.value
				console.log(`       ${h.key}=${JSON.stringify(vShort)}  -> taskId=${h.taskId}`)
			}
		}
		for (const k of [
			'meshyTaskId',
			'taskId',
			'meshyUpstreamTaskId',
			'meshyOutputAssetUrl',
			'assetUrl',
			'meshyOutputAssetPath',
			'assetPath',
			'meshyModelUrl',
			'preferredModelUrl'
		]) {
			if (meshy[k]) {
				const ext = extractExt(meshy[k])
				console.log(
					`     meshy.${k}: ${typeof meshy[k] === 'string' && meshy[k].length > 150 ? meshy[k].slice(0, 150) + '...' : JSON.stringify(meshy[k])}  [ext=${ext}]`
				)
			}
		}
		const rel = meshy.meshyRelationSummary
		if (rel && typeof rel === 'object') {
			console.log(`     meshy.relation keys=${Object.keys(rel).join(', ')}`)
			for (const k of Object.keys(rel)) {
				const v = rel[k]
				if (typeof v === 'string' && v) {
					const ext = extractExt(v)
					console.log(
						`       relation.${k}: ${v.length > 120 ? v.slice(0, 120) + '...' : v}  [ext=${ext}]`
					)
				}
			}
		}
		const out = meshy.meshyOutputSummary
		if (out && typeof out === 'object') {
			console.log(`     meshy.output keys=${Object.keys(out).join(', ')}`)
			for (const k of Object.keys(out)) {
				const v = out[k]
				if (typeof v === 'string' && v) {
					const ext = extractExt(v)
					console.log(
						`       output.${k}: ${v.length > 120 ? v.slice(0, 120) + '...' : v}  [ext=${ext}]`
					)
				}
			}
		}
	}
	const tripo = s.tripo3dModelSettings || node.tripo3dSettings || null
	if (tripo && typeof tripo === 'object') {
		console.log(`  [tripo3dModelSettings] keys=${Object.keys(tripo).slice(0, 40).join(', ')}`)
		const hits = extractAnyTaskIdFromObject(tripo)
		if (hits.length > 0) {
			console.log(`     内嵌taskId:`)
			for (const h of hits.slice(0, 12)) {
				const vShort =
					typeof h.value === 'string' && h.value.length > 150
						? h.value.slice(0, 150) + '...'
						: h.value
				console.log(`       ${h.key}=${JSON.stringify(vShort)}  -> taskId=${h.taskId}`)
			}
		}
	}
	const resId = node.resourceId || s.resourceId
	if (resId && resources[resId]) {
		const r = resources[resId]
		console.log(`  [resourceId=${resId}] 资源 keys=${Object.keys(r).join(', ')}`)
		for (const k of [
			'url',
			'absolutePath',
			'sourcePath',
			'projectRelativePath',
			'name',
			'kind',
			'mediaType',
			'path'
		]) {
			if (r[k] !== undefined && r[k] !== null && r[k] !== '') {
				const ext = extractExt(r[k])
				console.log(
					`     resource.${k}=${typeof r[k] === 'string' && r[k].length > 150 ? r[k].slice(0, 150) + '...' : JSON.stringify(r[k])}  [ext=${ext}]`
				)
			}
		}
	}
	const allTaskIdsInNode = new Set()
	const allNested = extractAnyTaskIdFromObject(node)
	for (const h of allNested) allTaskIdsInNode.add(h.taskId.toLowerCase())
	const resourceHits = extractAnyTaskIdFromObject(resources[resId] || {})
	for (const h of resourceHits) allTaskIdsInNode.add(h.taskId.toLowerCase())

	if (allTaskIdsInNode.size > 0) {
		console.log(`  节点所有可提取的 taskId: ${[...allTaskIdsInNode].join(', ')}`)
		for (const tid of allTaskIdsInNode) {
			const matches = allGlb.filter((g) => g.taskId === tid)
			if (matches.length > 0) {
				console.log(`     -> 磁盘匹配: ${matches.map((m) => m.name).join(', ')}`)
			}
		}
	} else {
		console.log(`  节点未提取到任何 taskId UUID!`)
	}
	const rawSettings = JSON.stringify(s)
	if (rawSettings.length < 4000) {
		console.log(`  [完整 settings JSON] (${rawSettings.length} chars):`, rawSettings.slice(0, 3500))
	} else {
		console.log(
			`  [完整 settings JSON] 太长(${rawSettings.length} chars)，只打印开头1500:`,
			rawSettings.slice(0, 1500)
		)
	}
}

console.log('\n=== 检查本地 DB 中 meshyTasks 表，提取所有 taskId 与 nodeId 关联 ===')
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const dbPath = path.join(projectRoot, 'DVSResource', 'BackendData', 'localdb.sqlite3')
console.log('DB path:', dbPath, 'exists:', fs.existsSync(dbPath))
if (fs.existsSync(dbPath)) {
	try {
		const Database = require(path.join(projectRoot, 'node_modules', 'better-sqlite3'))
		const db = new Database(dbPath)
		const tables = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%task%' OR name LIKE '%meshy%' OR name LIKE '%tripo%'"
			)
			.all()
		console.log('相关表:', tables.map((t) => t.name).join(', '))
		for (const t of tables) {
			try {
				const cols = db
					.prepare(`PRAGMA table_info("${t.name}")`)
					.all()
					.map((c) => c.name)
				console.log(`  ${t.name} cols: ${cols.join(', ')}`)
				const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get().cnt
				console.log(`  ${t.name} rows: ${count}`)
				if (count > 0) {
					const rows = db.prepare(`SELECT * FROM "${t.name}" ORDER BY rowid DESC LIMIT 20`).all()
					for (const r of rows) {
						const display = {}
						for (const c of cols) {
							let v = r[c]
							if (typeof v === 'string' && v.length > 150) v = v.slice(0, 150) + '...'
							if (c === 'responsePayload' || c.endsWith('Payload') || c.includes('json')) {
								try {
									const parsed = typeof v === 'string' ? JSON.parse(v) : v
									const keys = Object.keys(parsed)
									v = `{JSON keys: ${keys.slice(0, 15).join(', ')}}`
								} catch {}
							}
							display[c] = v
						}
						console.log(`    - ${JSON.stringify(display).slice(0, 800)}`)
					}
				}
			} catch (e) {
				console.log(`  读${t.name}失败:`, e.message)
			}
		}
		db.close()
	} catch (e) {
		console.error('DB 读取失败:', e.message)
	}
}

process.exit(0)
