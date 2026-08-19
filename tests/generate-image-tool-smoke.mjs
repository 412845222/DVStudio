/**
 * generate_image MCP 工具 handler 核心逻辑 smoke 测试（P3.2，纯 Node 环境隔离版）
 *
 * 该测试直接内联 generateImageHandler 的逻辑（从 builtinTools.mjs 复制而来，已剥离 electron 依赖），
 * 以验证参数校验、调用顺序、autoExport 复制文件等关键行为。这避免了从 builtinTools.mjs 导入时触发的
 * electron/electron CommonJS 命名导入问题（Node 独立进程不支持 BrowserWindow/ipcMain）。
 *
 * 运行：node tests/generate-image-tool-smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ============ 内联版 generateImageHandler（跟 builtinTools.mjs 保持一致，仅去掉 executor.getToolExecutor() 的依赖） ============
async function generateImageHandler(args, { requestId, executor }) {
	const prompt = String(args?.prompt || '').trim()
	if (!prompt) throw new Error('prompt is required (non-empty string)')

	const width = typeof args?.width === 'number' ? Math.max(64, Math.floor(args.width)) : undefined
	const height = typeof args?.height === 'number' ? Math.max(64, Math.floor(args.height)) : undefined
	const aspectRatio = typeof args?.aspectRatio === 'string' ? args.aspectRatio : undefined
	const negativePrompt = typeof args?.negativePrompt === 'string' ? args.negativePrompt : undefined
	const model = typeof args?.model === 'string' ? args.model : undefined
	const imageCount = typeof args?.imageCount === 'number' ? Math.max(1, Math.min(16, Math.floor(args.imageCount))) : 1
	const seed = typeof args?.seed === 'number' ? Math.floor(args.seed) : undefined
	const outputPath = typeof args?.outputPath === 'string' ? args.outputPath || '' : ''
	const autoExport = args?.autoExport !== false
	const references = Array.isArray(args?.references) ? args.references.filter((x) => typeof x === 'string' && x) : undefined

	const nodeConfig = {
		prompt,
		...(negativePrompt ? { negativePrompt, negative_prompt: negativePrompt } : {}),
		...(typeof width === 'number' ? { width } : {}),
		...(typeof height === 'number' ? { height } : {}),
		...(aspectRatio ? { aspectRatio, aspect_ratio: aspectRatio } : {}),
		...(model ? { model, modelKey: model } : {}),
		...(typeof imageCount === 'number' ? { imageCount, count: imageCount, numImages: imageCount } : {}),
		...(typeof seed === 'number' ? { seed } : {}),
		...(Array.isArray(references) && references.length ? { references, referenceImages: references } : {})
	}
	// 为了在测试里断言 nodeConfig 被正确构造，我们把它暴露到 _debugCapture
	if (typeof args?._debugCapture === 'object' && args._debugCapture) {
		args._debugCapture.nodeConfig = nodeConfig
	}

	const title = `CLI图片 ${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}`
	const createRes = await executor.callTool('create_node', { type: 'image-generation', title, config: nodeConfig })
	const nodeId = String(createRes?.nodeId || createRes?.id || '')
	if (!nodeId) {
		throw new Error(`create_node did not return nodeId. createRes=${JSON.stringify(createRes).slice(0, 400)}`)
	}

	await executor.callTool('execute_node', { nodeId })

	const WAIT_START = Date.now()
	const WAIT_TIMEOUT_MS = 10 * 60 * 1000
	const POLL_MS = 25
	let finalTask = null
	while (Date.now() - WAIT_START < WAIT_TIMEOUT_MS) {
		const tasksRes = await executor.callTool('list_node_tasks', { nodeId })
		const tasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : (Array.isArray(tasksRes) ? tasksRes : [])
		const sorted = tasks
			.filter((t) => t && (t.nodeId === nodeId || !nodeId))
			.sort((a, b) => (Number(b.createdAt || b.created_at || 0) - Number(a.createdAt || a.created_at || 0)))
		const latest = sorted[0]
		if (latest) {
			const st = String(latest.status || '').toLowerCase()
			if (st === 'completed') { finalTask = latest; break }
			if (st === 'failed' || st === 'canceled') { finalTask = latest; break }
		}
		await new Promise((r) => setTimeout(r, POLL_MS))
	}
	if (!finalTask) {
		throw new Error(`execute_node timed out (>${WAIT_TIMEOUT_MS}ms) waiting for node ${nodeId}`)
	}
	const finalStatus = String(finalTask.status || '').toLowerCase()
	if (finalStatus === 'failed') {
		const msg = finalTask.error?.message || finalTask.error || finalTask.errMsg || '生成失败'
		throw new Error(`image generation failed for node ${nodeId}: ${String(msg)}`)
	}
	if (finalStatus === 'canceled') {
		throw new Error(`image generation canceled for node ${nodeId}`)
	}

	let outputFiles = Array.isArray(finalTask?.outputFiles) ? finalTask.outputFiles.filter(Boolean) : []
	if (outputFiles.length === 0) {
		const info = await executor.callTool('get_node_info', { nodeId })
		const maybe = info?.outputFiles || info?.outputs || info?.output || info?.result
		if (Array.isArray(maybe)) outputFiles = maybe.filter((x) => typeof x === 'string' && x)
		else if (typeof maybe === 'string' && maybe) outputFiles = [maybe]
	}
	const exportedFiles = []

	if (autoExport && outputPath && outputFiles.length > 0) {
		const outParsed = path.parse(outputPath)
		const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null
		const destIsDir = stat ? stat.isDirectory() : !outParsed.ext
		const destDir = destIsDir ? outputPath : outParsed.dir
		if (destDir && !fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true })
		}
		for (let i = 0; i < outputFiles.length; i++) {
			const src = outputFiles[i]
			if (!fs.existsSync(src)) continue
			let dest
			if (destIsDir) {
				const srcName = path.basename(src)
				dest = path.join(outputPath, srcName)
			} else if (outputFiles.length === 1) {
				dest = outputPath
			} else {
				const ext = outParsed.ext || path.extname(src) || '.png'
				const base = outParsed.name || `image-${i}`
				dest = path.join(destDir || '.', `${base}_${i + 1}${ext}`)
			}
			fs.copyFileSync(src, dest)
			exportedFiles.push(dest)
		}
	}

	return {
		ok: true,
		nodeId,
		taskStatus: finalTask?.status || 'completed',
		outputFiles,
		exportedFiles,
		_jsonBridge: JSON.stringify({ nodeId, outputFiles, exportedFiles })
	}
}

// ============ 测试脚本 ============
const filesToClean = []
const cleanup = () => {
	for (const f of [...filesToClean].reverse()) {
		try {
			if (!fs.existsSync(f)) continue
			const st = fs.statSync(f)
			if (st.isDirectory()) fs.rmSync(f, { recursive: true, force: true })
			else fs.unlinkSync(f)
		} catch { /* swallow */ }
	}
}
process.on('exit', cleanup)

const assert = (cond, msg) => {
	if (!cond) {
		console.error(`ASSERT FAILED: ${msg}`)
		cleanup()
		process.exit(1)
	}
	console.log(`  ✓ ${msg}`)
}

console.log('[P3-GenerateImage-Smoke] Setup temp files...')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs-genimg-'))
const tmpIn = path.join(tmpDir, 'origin.png')
const tmpOutDir = path.join(tmpDir, 'exports')
const tmpOutFileSingle = path.join(tmpDir, 'single-result.png')
fs.writeFileSync(tmpIn, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) // PNG 8-byte magic
filesToClean.push(tmpDir)

console.log('[P3-GenerateImage-Smoke] 1. Missing prompt should throw...')
let thrown = false
try {
	await generateImageHandler({}, { requestId: 'r1', executor: { callTool: async () => { } } })
} catch (err) {
	thrown = /prompt is required/.test(String(err?.message || ''))
}
assert(thrown, 'handler throws when prompt is missing')

console.log('[P3-GenerateImage-Smoke] 2. Happy path: autoExport to directory...')
const calls = []
const mockExec = {
	callTool: async (name, args) => {
		calls.push({ name, args })
		if (name === 'create_node') return { nodeId: 'n1' }
		if (name === 'execute_node') return { ok: true }
		if (name === 'list_node_tasks') {
			const n = calls.filter((c) => c.name === 'list_node_tasks').length
			if (n < 2) return { tasks: [] }
			return { tasks: [{ nodeId: 'n1', status: 'completed', createdAt: Date.now(), outputFiles: [tmpIn] }] }
		}
		if (name === 'get_node_info') return { outputFiles: [tmpIn] }
		return {}
	}
}
const cap = { nodeConfig: null }
const r1 = await generateImageHandler({
	prompt: 'A cute red panda sitting on bamboo',
	width: 1024,
	height: 1024,
	aspectRatio: '1:1',
	negativePrompt: 'ugly, blurry',
	model: 'sdxl-turbo',
	imageCount: 1,
	seed: 1337,
	outputPath: tmpOutDir,
	references: ['/tmp/a.png', '/tmp/b.jpg'],
	autoExport: true,
	_debugCapture: cap
}, { requestId: 'r2', executor: mockExec })

assert(r1.ok === true, 'handler returns ok:true')
assert(r1.nodeId === 'n1', 'returns nodeId n1')
assert(r1.outputFiles[0] === tmpIn, 'outputFiles[0] equals tmpIn')
assert(Array.isArray(r1.exportedFiles) && r1.exportedFiles.length === 1, '1 file auto-exported')
const expPath = r1.exportedFiles[0]
assert(fs.existsSync(expPath) && expPath.endsWith('origin.png') && expPath.startsWith(tmpOutDir), `exported at correct location: ${path.relative(tmpDir, expPath)}`)
// validate json bridge
const bridge = JSON.parse(r1._jsonBridge)
assert(bridge.nodeId === 'n1' && bridge.outputFiles[0] === tmpIn, '_jsonBridge encodes same result')

// validate forward params
const order = calls.map((c) => c.name)
assert(order.filter((n) => n === 'list_node_tasks').length >= 2, 'list_node_tasks polled >= 2 times (first empty, then completed)')
const createArgs = calls.find((c) => c.name === 'create_node').args
assert(createArgs.type === 'image-generation', 'create_node type=image-generation')
assert(createArgs.config.prompt === 'A cute red panda sitting on bamboo', 'create_node config.prompt forwarded')
assert(createArgs.config.width === 1024 && createArgs.config.height === 1024, 'create_node config.width/height forwarded')
assert(createArgs.config.negativePrompt === 'ugly, blurry' && createArgs.config.negative_prompt === 'ugly, blurry', 'create_node config.negativePrompt dual-keyed')
assert(createArgs.config.model === 'sdxl-turbo' && createArgs.config.modelKey === 'sdxl-turbo', 'create_node config.model dual-keyed')
assert(createArgs.config.seed === 1337, 'create_node config.seed forwarded')
assert(createArgs.config.imageCount === 1 && createArgs.config.count === 1 && createArgs.config.numImages === 1, 'create_node config.imageCount triple-keyed')
assert(Array.isArray(createArgs.config.references) && createArgs.config.references[0] === '/tmp/a.png' && createArgs.config.referenceImages[1] === '/tmp/b.jpg', 'references dual-keyed')

console.log('[P3-GenerateImage-Smoke] 3. autoExport: outputPath is file path (single image)...')
calls.length = 0
const r2 = await generateImageHandler({
	prompt: 'single-file output test',
	outputPath: tmpOutFileSingle
}, {
	requestId: 'r3',
	executor: {
		callTool: async (name) => {
			calls.push({ name })
			if (name === 'create_node') return { nodeId: 'n2' }
			if (name === 'execute_node') return {}
			if (name === 'list_node_tasks') return { tasks: [{ nodeId: 'n2', status: 'completed', createdAt: Date.now(), outputFiles: [tmpIn] }] }
			if (name === 'get_node_info') return { outputFiles: [tmpIn] }
			return {}
		}
	}
})
assert(r2.ok === true && r2.exportedFiles[0] === tmpOutFileSingle, `outputPath treated as single file (exported=${r2.exportedFiles[0]})`)
assert(fs.existsSync(tmpOutFileSingle), `single exported file exists`)

console.log('[P3-GenerateImage-Smoke] 4. Failed task should throw...')
let threwFailed = false
try {
	await generateImageHandler({ prompt: 'x' }, {
		requestId: 'r4',
		executor: {
			callTool: async (name) => {
				if (name === 'create_node') return { nodeId: 'n3' }
				if (name === 'execute_node') return {}
				if (name === 'list_node_tasks') return { tasks: [{ nodeId: 'n3', status: 'failed', createdAt: Date.now(), error: { message: 'CUDA OOM' } }] }
				return {}
			}
		}
	})
} catch (err) {
	threwFailed = /CUDA OOM/.test(String(err?.message || ''))
}
assert(threwFailed, 'handler throws with task error message when node task status=failed')

console.log('[P3-GenerateImage-Smoke] 5. Missing nodeId from create_node → throws...')
let threwNoId = false
try {
	await generateImageHandler({ prompt: 'y' }, {
		requestId: 'r5',
		executor: { callTool: async (name) => {
			if (name === 'create_node') return { oops: 'no id' }
			return {}
		}}
	})
} catch (err) {
	threwNoId = /did not return nodeId/.test(String(err?.message || ''))
}
assert(threwNoId, 'handler throws when create_node returns no nodeId')

console.log('')
console.log('=================')
console.log('[P3-GenerateImage-Smoke] ALL TESTS PASSED')
