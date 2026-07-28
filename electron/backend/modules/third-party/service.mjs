import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { internalError, invalidParamsError, upstreamError } from '../../core/errors.mjs'
import { getHttpClient } from '../../core/http-client.mjs'
import { getLocalDbFilePath } from '../../../localdb/db.mjs'
import { getRepos } from '../../../localdb/index.mjs'
import * as geminiTaskService from '../gemini/service.mjs'

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

const isDevMockMode = () => {
	return (
		process.env.ELECTRON_DEV === '1' || process.env.NODE_ENV === 'development' || !app.isPackaged
	)
}

const crc32 = (buf) => {
	let crc = 0xffffffff
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

const MOCK_TEXT_RESPONSE = `这是DVStudio开发环境的Mock响应。

✅ 文本生成链路验证成功！
- 任务提交：正常
- 流式传输：正常
- Canvas预览更新：待验证
- 双面板同步：待验证

你可以继续测试图片生成、3D模型生成等其他功能。当前是开发Mock模式，配置真实API密钥后将使用实际AI服务。`

const MOCK_IMAGE_DATA_URL = (() => {
	const size = 512
	const channels = 4
	const data = Buffer.alloc(size * size * channels)
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const idx = (y * size + x) * channels
			const t = (x + y) / (size * 2)
			data[idx] = Math.floor(40 + t * 80)
			data[idx + 1] = Math.floor(180 + t * 50)
			data[idx + 2] = Math.floor(120 + t * 60)
			data[idx + 3] = 255
		}
	}
	const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
	const ihdr = Buffer.alloc(25)
	ihdr.writeUInt32BE(13, 0)
	ihdr.write('IHDR', 4)
	ihdr.writeUInt32BE(size, 8)
	ihdr.writeUInt32BE(size, 12)
	ihdr[16] = 8
	ihdr[17] = 6
	ihdr[18] = 0
	ihdr[19] = 0
	ihdr[20] = 0
	const ihdrCrc = crc32(ihdr.subarray(4, 21))
	ihdr.writeUInt32BE(ihdrCrc, 21)

	const compressed = zlib.deflateRawSync(data, { level: 9 })
	const idat = Buffer.alloc(compressed.length + 12)
	idat.writeUInt32BE(compressed.length, 0)
	idat.write('IDAT', 4)
	compressed.copy(idat, 8)
	const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]))
	idat.writeUInt32BE(idatCrc, compressed.length + 8)

	const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
	const png = Buffer.concat([pngSignature, ihdr, idat, iend])
	return `data:image/png;base64,${png.toString('base64')}`
})()

async function* mockTextStream() {
	const chars = MOCK_TEXT_RESPONSE.split('')
	for (let i = 0; i < chars.length; i++) {
		yield wrapTextMsg(chars[i])
		await new Promise((r) => setTimeout(r, 15))
	}
	yield wrapDone()
}

async function* mockImageStream() {
	yield wrapTaskStatusMsg('Mock: 正在生成图片...', 'generating')
	await new Promise((r) => setTimeout(r, 500))
	yield wrapTaskStatusMsg('Mock: 处理中...', 'processing')
	await new Promise((r) => setTimeout(r, 500))
	yield wrapChatMsg({ imageUrl: MOCK_IMAGE_DATA_URL })
	yield wrapDone()
}

const defaultHttpsAgent = new https.Agent({
	keepAlive: true,
	keepAliveMsecs: 300 * 1000
})

const defaultHttpAgent = new http.Agent({
	keepAlive: true,
	keepAliveMsecs: 300 * 1000
})

function getProxyUrl() {
	const settings = getClientSettings()
	const configuredProxy = String(settings.httpProxy || '').trim()
	if (configuredProxy) {
		return configuredProxy
	}
	return (
		process.env.HTTPS_PROXY ||
		process.env.HTTP_PROXY ||
		process.env.https_proxy ||
		process.env.http_proxy ||
		''
	)
}

function getAgentForUrl(url) {
	try {
		const u = new URL(url)
		const isHttps = u.protocol === 'https:'
		const proxyUrl = getProxyUrl()

		if (proxyUrl) {
			console.log(`[gemini] Using proxy: ${proxyUrl}`)
			return new HttpsProxyAgent(proxyUrl, {
				keepAlive: true
			})
		}

		return isHttps ? defaultHttpsAgent : defaultHttpAgent
	} catch {
		return defaultHttpsAgent
	}
}

function getServiceRepoRoot() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	return path.resolve(here, '..', '..', '..', '..')
}

function findNearestGitRoot(startDir) {
	let current = path.resolve(startDir)
	while (true) {
		if (fs.existsSync(path.resolve(current, '.git'))) return current
		const parent = path.dirname(current)
		if (parent === current) return ''
		current = parent
	}
}

function getClientRootDir() {
	if (app.isPackaged) return path.dirname(process.execPath)
	const repoRoot = getServiceRepoRoot()
	const gitRoot = findNearestGitRoot(repoRoot)
	return gitRoot || repoRoot
}

function getDvsResourceDir() {
	const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
	if (envResourceDir) return path.resolve(envResourceDir)
	return path.resolve(getClientRootDir(), 'DVSResource')
}

function getUserSettingsDir() {
	return path.resolve(getDvsResourceDir(), 'UserSettings')
}

function getUserSettingsFilePath() {
	return path.resolve(getUserSettingsDir(), 'settings.json')
}

function getClientSettings() {
	try {
		const settingsPath = getUserSettingsFilePath()
		console.log(`[gemini] Reading settings from: ${settingsPath}`)
		if (fs.existsSync(settingsPath)) {
			const raw = fs.readFileSync(settingsPath, 'utf-8')
			const settings = JSON.parse(raw)
			console.log(
				`[gemini] Settings loaded, httpProxy: ${settings.httpProxy || '(not set)'}, geminiBaseUrl: ${settings.geminiBaseUrl || '(default)'}`
			)
			return settings
		} else {
			console.log(`[gemini] Settings file not found at: ${settingsPath}`)
		}
	} catch (err) {
		console.error(`[gemini] Failed to read settings:`, err.message)
	}
	return {}
}

function getGeminiBaseUrl() {
	const settings = getClientSettings()
	const customUrl = String(settings.geminiBaseUrl || '').trim()
	if (customUrl) {
		return customUrl.replace(/\/+$/, '')
	}
	const envUrl = String(process.env.GEMINI_API_BASE || '').trim()
	if (envUrl) {
		return envUrl.replace(/\/+$/, '')
	}
	return GEMINI_DEFAULT_BASE_URL
}

function redactUrl(url) {
	try {
		const u = new URL(url)
		if (u.searchParams.has('key')) {
			u.searchParams.set('key', '***')
		}
		return u.toString()
	} catch {
		return String(url || '')
	}
}

async function geminiFetch(url, options = {}) {
	const method = options.method || 'GET'
	const redactedUrl = redactUrl(url)
	const proxyUrl = getProxyUrl()
	console.log(`[gemini] ========== REQUEST START ==========`)
	console.log(`[gemini] Method: ${method}`)
	console.log(`[gemini] URL: ${redactedUrl}`)
	console.log(`[gemini] Proxy: ${proxyUrl || 'direct (no proxy)'}`)
	console.log(
		`[gemini] Environment proxy vars: HTTPS_PROXY=${process.env.HTTPS_PROXY || 'not set'}, HTTP_PROXY=${process.env.HTTP_PROXY || 'not set'}`
	)
	if (options.body) {
		try {
			let bodyStr = options.body
			if (typeof options.body === 'string') {
				bodyStr = options.body
			} else {
				bodyStr = JSON.stringify(options.body, null, 2)
			}
			console.log(`[gemini] Request Body:`)
			console.log(bodyStr.length > 2000 ? bodyStr.slice(0, 2000) + '\n... (truncated)' : bodyStr)
		} catch (bodyErr) {
			console.log(`[gemini] Could not log request body:`, bodyErr.message)
		}
	}

	const headers = {
		'User-Agent': 'DVSBackend/1.0 (Electron)',
		...(options.headers || {})
	}
	console.log(`[gemini] Request Headers:`, JSON.stringify(headers, null, 2))
	console.log(`[gemini] ========== SENDING REQUEST ==========`)

	const u = new URL(url)
	const isHttps = u.protocol === 'https:'
	const agent = getAgentForUrl(url)

	return new Promise((resolve, reject) => {
		const reqOptions = {
			hostname: u.hostname,
			port: u.port || (isHttps ? 443 : 80),
			path: u.pathname + u.search,
			method,
			headers,
			agent
		}

		const req = (isHttps ? https : http).request(reqOptions, (res) => {
			console.log(`[gemini] ========== RESPONSE RECEIVED ==========`)
			console.log(`[gemini] Status: ${res.statusCode} ${res.statusMessage}`)
			console.log(`[gemini] Response Headers:`)
			for (const [key, value] of Object.entries(res.headers)) {
				console.log(`[gemini]   ${key}: ${value}`)
			}

			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))

			res.on('end', () => {
				const body = Buffer.concat(chunks)
				const textBody = body.toString('utf-8')

				const response = {
					ok: res.statusCode >= 200 && res.statusCode < 300,
					status: res.statusCode,
					statusText: res.statusMessage,
					headers: res.headers,
					url,
					text: async () => textBody,
					json: async () => JSON.parse(textBody),
					body: null
				}

				let streamController
				const readableStream = new ReadableStream({
					start(controller) {
						streamController = controller
						for (const chunk of chunks) {
							controller.enqueue(new Uint8Array(chunk))
						}
						controller.close()
					}
				})
				response.body = readableStream

				resolve(response)
			})
		})

		req.on('error', (err) => {
			console.error(`[gemini] ========== FETCH ERROR ==========`)
			console.error(`[gemini] Request failed for: ${redactedUrl}`)
			console.error(`[gemini] Error name: ${err?.name}`)
			console.error(`[gemini] Error message: ${err?.message}`)
			console.error(`[gemini] Error stack:`, err?.stack)
			reject(err)
		})

		if (options.body) {
			const bodyBuffer = typeof options.body === 'string' ? Buffer.from(options.body) : options.body
			req.write(bodyBuffer)
		}
		req.end()
	})
}

async function geminiFetchStream(url, options = {}) {
	const method = options.method || 'GET'
	const redactedUrl = redactUrl(url)
	const proxyUrl = getProxyUrl()
	console.log(`[gemini:stream] ========== STREAM REQUEST START ==========`)
	console.log(`[gemini:stream] Method: ${method}`)
	console.log(`[gemini:stream] URL: ${redactedUrl}`)
	console.log(`[gemini:stream] Proxy: ${proxyUrl || 'direct (no proxy)'}`)

	const headers = {
		'User-Agent': 'DVSBackend/1.0 (Electron)',
		...(options.headers || {})
	}

	const u = new URL(url)
	const isHttps = u.protocol === 'https:'
	const agent = getAgentForUrl(url)

	return new Promise((resolve, reject) => {
		const reqOptions = {
			hostname: u.hostname,
			port: u.port || (isHttps ? 443 : 80),
			path: u.pathname + u.search,
			method,
			headers,
			agent
		}

		const req = (isHttps ? https : http).request(reqOptions, (res) => {
			console.log(`[gemini:stream] ========== STREAM RESPONSE RECEIVED ==========`)
			console.log(`[gemini:stream] Status: ${res.statusCode} ${res.statusMessage}`)

			let streamController
			const readableStream = new ReadableStream({
				start(controller) {
					streamController = controller
				},
				cancel() {
					req.destroy()
				}
			})

			const response = {
				ok: res.statusCode >= 200 && res.statusCode < 300,
				status: res.statusCode,
				statusText: res.statusMessage,
				headers: res.headers,
				url,
				body: readableStream
			}

			res.on('data', (chunk) => {
				if (streamController) {
					streamController.enqueue(new Uint8Array(chunk))
				}
			})

			res.on('end', () => {
				if (streamController) {
					streamController.close()
				}
			})

			res.on('error', (err) => {
				console.error(`[gemini:stream] Response error:`, err)
				if (streamController) {
					streamController.error(err)
				}
				reject(err)
			})

			if (!response.ok) {
				const chunks = []
				res.on('data', (chunk) => chunks.push(chunk))
				res.on('end', () => {
					const errorBody = Buffer.concat(chunks).toString('utf-8')
					response.text = async () => errorBody
					resolve(response)
				})
			} else {
				resolve(response)
			}
		})

		req.on('error', (err) => {
			console.error(`[gemini:stream] ========== STREAM FETCH ERROR ==========`)
			console.error(`[gemini:stream] Request failed for: ${redactedUrl}`)
			console.error(`[gemini:stream] Error:`, err)
			reject(err)
		})

		if (options.body) {
			const bodyBuffer = typeof options.body === 'string' ? Buffer.from(options.body) : options.body
			req.write(bodyBuffer)
		}
		req.end()
	})
}

function generateMsgId() {
	return `m-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

function wrapTextMsg(text) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/text',
			payload: { text: String(text || '') }
		}
	})
}

function wrapChatMsg(content) {
	const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/chatMessage',
			payload: { content: contentStr }
		}
	})
}

function wrapTaskStatusMsg(message, phase, extra = null) {
	const payload = { phase: phase || 'streaming', message: String(message || '') }
	if (extra && typeof extra === 'object') {
		Object.assign(payload, extra)
	}
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/taskStatus',
			payload
		}
	})
}

function wrapErrorMsg(code, message) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/error',
			payload: { code: code || 'STREAM_ERROR', message: String(message || 'unknown error') }
		}
	})
}

function wrapStreamError(message) {
	return JSON.stringify({ type: 'error', error: { message: String(message || 'unknown error') } })
}

function wrapDone() {
	return JSON.stringify({ type: 'done' })
}

function wrapResultMsg(data) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/result',
			payload: data
		}
	})
}

function wrapGeminiEvent(eventType, data) {
	return JSON.stringify({
		type: 'gemini_event',
		eventType,
		data
	})
}

const GEMINI_MODEL_CONFIG = {
	'gemini-3.1-flash-image': {
		label: 'Nano Banana 2',
		supportedSizes: ['512px', '1K', '2K', '4K'],
		defaultSize: '2K',
		supportedAspectRatios: [
			'1:1',
			'1:4',
			'1:8',
			'2:3',
			'3:2',
			'3:4',
			'4:1',
			'4:3',
			'4:5',
			'5:4',
			'8:1',
			'9:16',
			'16:9',
			'21:9'
		],
		supportsThinkingLevel: true
	},
	'gemini-3.1-flash-lite-image': {
		label: 'Nano Banana 2 Lite',
		supportedSizes: ['1K'],
		defaultSize: '1K',
		supportedAspectRatios: [
			'1:1',
			'2:3',
			'3:2',
			'3:4',
			'4:3',
			'4:5',
			'5:4',
			'9:16',
			'16:9',
			'21:9'
		],
		supportsThinkingLevel: false
	},
	'gemini-3-pro-image': {
		label: 'Nano Banana Pro',
		supportedSizes: ['1K', '2K', '4K'],
		defaultSize: '2K',
		supportedAspectRatios: [
			'1:1',
			'2:3',
			'3:2',
			'3:4',
			'4:3',
			'4:5',
			'5:4',
			'9:16',
			'16:9',
			'21:9'
		],
		supportsThinkingLevel: true
	},
	'gemini-2.5-flash-image': {
		label: 'Nano Banana',
		supportedSizes: ['1K'],
		defaultSize: '1K',
		supportedAspectRatios: [
			'1:1',
			'2:3',
			'3:2',
			'3:4',
			'4:3',
			'4:5',
			'5:4',
			'9:16',
			'16:9',
			'21:9'
		],
		supportsThinkingLevel: false
	}
}

function normalizeGeminiModelId(modelId) {
	const raw = String(modelId || '').trim()
	const withoutPreview = raw.replace(/-preview$/, '')
	if (GEMINI_MODEL_CONFIG[withoutPreview]) {
		return withoutPreview
	}
	if (GEMINI_MODEL_CONFIG[raw]) {
		return raw
	}
	return withoutPreview || 'gemini-3.1-flash-image'
}

function getGeminiModelLabel(modelId) {
	const normalized = normalizeGeminiModelId(modelId)
	return GEMINI_MODEL_CONFIG[normalized]?.label || normalized
}

function validateGeminiImageParams(modelId, imageSize, aspectRatio) {
	const normalized = normalizeGeminiModelId(modelId)
	const config = GEMINI_MODEL_CONFIG[normalized]
	if (!config) {
		return {
			valid: true,
			modelId: normalized,
			imageSize: imageSize || '2K',
			aspectRatio: aspectRatio || '1:1'
		}
	}
	let finalSize = String(imageSize || config.defaultSize).trim()
	if (!config.supportedSizes.includes(finalSize)) {
		finalSize = config.defaultSize
	}
	let finalRatio = String(aspectRatio || '1:1').trim()
	if (!config.supportedAspectRatios.includes(finalRatio)) {
		finalRatio = '1:1'
	}
	return { valid: true, modelId: normalized, imageSize: finalSize, aspectRatio: finalRatio, config }
}

const NANOBANANA_API_BASE = 'https://api.meshy.ai/openapi'
const SEEDREAM_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const JIMENG_API_BASE = 'https://visual.volcengineapi.com'

function convertMessagesToGemini(messages) {
	const contents = []
	let systemInstruction = null
	for (const msg of messages) {
		if (!msg || !msg.role) continue
		if (msg.role === 'system') {
			systemInstruction = { parts: [{ text: String(msg.content || '') }] }
			continue
		}
		const role = msg.role === 'assistant' ? 'model' : 'user'
		const parts = []
		const content = msg.content
		if (typeof content === 'string') {
			parts.push({ text: content })
		} else if (Array.isArray(content)) {
			for (const part of content) {
				if (!part) continue
				if (part.type === 'text' && part.text) {
					parts.push({ text: part.text })
				} else if (part.type === 'image_url' && part.image_url?.url) {
					const url = part.image_url.url
					if (url.startsWith('data:')) {
						const matches = url.match(/^data:([^;]+);base64,(.+)$/)
						if (matches) {
							parts.push({ inlineData: { mimeType: matches[1] || 'image/jpeg', data: matches[2] } })
						}
					}
				}
			}
		}
		if (parts.length > 0) {
			contents.push({ role, parts })
		}
	}
	return { contents, systemInstruction }
}

/**
 * 记录火山方舟任务到 ark_tasks 表
 */
function recordArkTask(params) {
	try {
		const repos = getRepos()
		const repo = repos?.arkTasks
		if (!repo) return
		repo.upsert(params)
	} catch {
		// 忽略记录错误，不影响主流程
	}
}

function getApiKeyRepo(ctx) {
	const repo = ctx.localdb?.apiKeys
	if (!repo) throw internalError('apiKeys repo not available')
	return repo
}

function getKey(ctx, provider) {
	const repo = getApiKeyRepo(ctx)
	const result = repo.getPlaintext(provider)
	if (!result.ok) throw internalError(result.error || `failed to read ${provider} api key`)
	const key = String(result.plaintext || '').trim()
	return key
}

function tryGetKey(ctx, ...names) {
	const repo = getApiKeyRepo(ctx)
	for (const name of names) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
	}
	return ''
}

function getCacheDir(ctx, provider) {
	let baseDir = ''
	try {
		const dbPath = getLocalDbFilePath()
		if (dbPath) baseDir = path.dirname(dbPath)
	} catch {}
	if (!baseDir) {
		try {
			baseDir = path.join(os.homedir(), '.dweb', 'backend-data')
		} catch {
			baseDir = os.tmpdir()
		}
	}
	const dir = path.resolve(baseDir, 'cache', 'third-party', String(provider || 'ref'))
	fs.mkdirSync(dir, { recursive: true })
	return dir
}

function sha256Hex(data) {
	return crypto.createHash('sha256').update(data).digest('hex')
}

function extFromBase64(dataUrl) {
	const m = /^data:image\/(\w+);base64,/.exec(String(dataUrl || ''))
	if (m) return '.' + m[1]
	return '.png'
}

function saveBase64Image(baseDir, data, preferredName) {
	let buf
	let ext = '.png'
	const dataStr = String(data || '')
	if (dataStr.startsWith('data:')) {
		ext = extFromBase64(dataStr)
		const b64 = dataStr.split(',')[1] || ''
		buf = Buffer.from(b64, 'base64')
	} else {
		buf = Buffer.from(dataStr, 'base64')
		const head = buf.slice(0, 12)
		if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) ext = '.png'
		else if (head[0] === 0xff && head[1] === 0xd8) ext = '.jpg'
		else if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46)
			ext = '.webp'
		else if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) ext = '.gif'
	}
	const hash = sha256Hex(buf).slice(0, 16)
	const name = String(preferredName || '')
		.trim()
		.replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_')
		.slice(0, 40)
	const fileName = name ? `${name}_${hash}${ext}` : `${hash}${ext}`
	const filePath = path.resolve(baseDir, fileName)
	fs.writeFileSync(filePath, buf)
	return { filePath, hash, ext, fileName }
}

export function nanobananaRefCache(ctx, payload) {
	const p = payload || {}
	const images = Array.isArray(p.images) ? p.images : []
	const files = Array.isArray(p.files) ? p.files : []
	if (!images.length && !files.length) throw invalidParamsError('images or files are required')
	const cacheDir = getCacheDir(ctx, 'nanobanana')
	const cacheIds = []
	for (const img of images) {
		if (!img) continue
		const data = typeof img === 'string' ? img : img.data
		const name = typeof img === 'object' ? img.name : ''
		const saved = saveBase64Image(cacheDir, data, name)
		cacheIds.push(saved.hash)
	}
	for (const f of files) {
		const fp = String(f?.path || f?.filePath || '').trim()
		if (fp && fs.existsSync(fp)) {
			const hash = sha256Hex(fs.readFileSync(fp)).slice(0, 16)
			const ext = path.extname(fp) || '.png'
			const dest = path.resolve(cacheDir, `${hash}${ext}`)
			if (!fs.existsSync(dest)) fs.copyFileSync(fp, dest)
			cacheIds.push(hash)
		}
	}
	return { ok: true, cacheIds }
}

export function seedreamRefCache(ctx, payload) {
	const p = payload || {}
	const images = Array.isArray(p.images) ? p.images : []
	const files = Array.isArray(p.files) ? p.files : []
	if (!images.length && !files.length) throw invalidParamsError('images or files are required')
	const cacheDir = getCacheDir(ctx, 'seedream')
	const cacheIds = []
	for (const img of images) {
		if (!img) continue
		const data = typeof img === 'string' ? img : img.data
		const name = typeof img === 'object' ? img.name : ''
		const saved = saveBase64Image(cacheDir, data, name)
		cacheIds.push(saved.hash)
	}
	for (const f of files) {
		const fp = String(f?.path || f?.filePath || '').trim()
		if (fp && fs.existsSync(fp)) {
			const hash = sha256Hex(fs.readFileSync(fp)).slice(0, 16)
			const ext = path.extname(fp) || '.png'
			const dest = path.resolve(cacheDir, `${hash}${ext}`)
			if (!fs.existsSync(dest)) fs.copyFileSync(fp, dest)
			cacheIds.push(hash)
		}
	}
	return { ok: true, cacheIds }
}

export async function nanobananaGenerate(ctx, payload) {
	const client = getHttpClient()
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) throw invalidParamsError('prompt is required')
	let apiKey = tryGetKey(ctx, 'meshy', 'nanobanana')
	if (!apiKey) throw invalidParamsError('meshy/nanobanana api key is not configured')
	let aiModel = String(p.ai_model || p.model || 'nano-banana')
		.trim()
		.toLowerCase()
	if (!['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'gpt-image-2'].includes(aiModel))
		aiModel = 'nano-banana'
	const body = { prompt, ai_model: aiModel }
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || '').trim()
	if (aspectRatio) body.aspect_ratio = aspectRatio
	const imageSize = String(p.image_size || p.imageSize || '').trim()
	if (imageSize) body.image_size = imageSize
	if (p.width !== undefined) body.width = Number(p.width)
	if (p.height !== undefined) body.height = Number(p.height)
	const refs = Array.isArray(p.reference_image_urls) ? p.reference_image_urls.filter(Boolean) : []
	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const refImagesAlt = Array.isArray(p.ref_images) ? p.ref_images.filter(Boolean) : []
	for (const img of refImages) {
		if (typeof img === 'string' && img.startsWith('http')) refs.push(img)
	}
	for (const img of refImagesAlt) {
		if (typeof img === 'string' && img.startsWith('http')) refs.push(img)
	}
	if (refs.length) body.reference_image_urls = refs.slice(0, 5)
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	if (negativePrompt) body.negative_prompt = negativePrompt
	if (p.seed !== undefined && p.seed !== null) body.seed = p.seed
	const refCacheIds = Array.isArray(p.refCacheIds) ? p.refCacheIds.filter(Boolean) : []
	if (refCacheIds.length) {
		const cacheDir = getCacheDir(ctx, 'nanobanana')
		const cacheUrls = refCacheIds
			.map((id) => {
				try {
					const files = fs.readdirSync(cacheDir).filter((f) => f.includes(String(id)))
					if (files.length > 0) return `file://${path.resolve(cacheDir, files[0])}`
				} catch {}
				return null
			})
			.filter(Boolean)
		if (cacheUrls.length)
			body.reference_image_urls = [...(body.reference_image_urls || []), ...cacheUrls].slice(0, 5)
	}
	const res = await client.post(`${NANOBANANA_API_BASE}/v1/text-to-image`, body, {
		headers: { Authorization: `Bearer ${apiKey}` },
		timeout: 120000
	})
	if (!res.ok) {
		const errMsg =
			typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
		throw upstreamError(`nanobanana generate failed: ${errMsg}`)
	}
	const result = res.body
	const imageUrl = result?.image_url || result?.imageUrl || result?.url || ''
	return { ok: true, imageUrl, raw: result }
}

function jimengHmacSha256(key, data) {
	return crypto.createHmac('sha256', key).update(data).digest()
}

function jimengSha256Hex(data) {
	return crypto.createHash('sha256').update(data).digest('hex')
}

function jimengSigningKey(secretKey, dateStamp, region, service) {
	const kDate = jimengHmacSha256(secretKey, dateStamp)
	const kRegion = jimengHmacSha256(kDate, region)
	const kService = jimengHmacSha256(kRegion, service)
	const kSigning = jimengHmacSha256(kService, 'request')
	return kSigning
}

function buildJimengSignedRequest({ accessKeyId, secretKey, method, path, query, headers, body }) {
	const service = 'cv'
	const region = 'cn-north-1'
	const now = new Date()
	const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '')
	const amzDate = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '')
	const host = 'visual.volcengineapi.com'
	const contentType = 'application/json'
	const allHeaders = {
		Host: host,
		'X-Date': amzDate,
		'Content-Type': contentType,
		...(headers || {})
	}
	const signedHeaders = Object.keys(allHeaders)
		.map((k) => k.toLowerCase())
		.sort()
		.join(';')
	const canonicalHeaders = Object.keys(allHeaders)
		.sort()
		.map((k) => `${k.toLowerCase()}:${String(allHeaders[k]).trim()}\n`)
		.join('')
	const queryString = query
		? Object.keys(query)
				.sort()
				.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
				.join('&')
		: ''
	const payloadHash = jimengSha256Hex(body || '')
	const canonicalRequest = [
		method.toUpperCase(),
		path,
		queryString,
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n')
	const algorithm = 'HMAC-SHA256'
	const credentialScope = `${dateStamp}/${region}/${service}/request`
	const stringToSign = [
		algorithm,
		amzDate,
		credentialScope,
		jimengSha256Hex(canonicalRequest)
	].join('\n')
	const signingKey = jimengSigningKey(secretKey, dateStamp, region, service)
	const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
	const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
	allHeaders['Authorization'] = authorization
	return {
		url: `https://${host}${path}${queryString ? '?' + queryString : ''}`,
		headers: allHeaders
	}
}

async function* streamSse(client, url, body, headers) {
	const stream = client.postStream(url, {
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body),
		timeout: 120000
	})
	for await (const rawLine of stream) {
		const line = String(rawLine || '').trim()
		if (!line) continue
		if (line.startsWith('data:')) {
			const data = line.slice(5).trim()
			if (data === '[DONE]') break
			try {
				const parsed = JSON.parse(data)
				yield parsed
			} catch {}
		}
	}
}

export async function* nanobananaGenerateStream(ctx, payload) {
	const client = getHttpClient()
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) {
		yield wrapStreamError('prompt is required')
		return
	}
	const apiKey = tryGetKey(ctx, 'meshy', 'nanobanana')
	if (!apiKey) {
		if (isDevMockMode()) {
			console.log(
				'[third-party:mock] Using mock image stream for nanobananaGenerateStream (no API key configured, dev mode)'
			)
			yield* mockImageStream()
			return
		}
		yield wrapStreamError('meshy/nanobanana api key is not configured')
		return
	}
	let aiModel = String(p.ai_model || p.model || 'nano-banana')
		.trim()
		.toLowerCase()
	if (!['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'gpt-image-2'].includes(aiModel))
		aiModel = 'nano-banana'
	const body = { prompt, ai_model: aiModel, stream: true }
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || '').trim()
	if (aspectRatio) body.aspect_ratio = aspectRatio
	const imageSize = String(p.image_size || p.imageSize || '').trim()
	if (imageSize) body.image_size = imageSize
	if (p.width !== undefined) body.width = Number(p.width)
	if (p.height !== undefined) body.height = Number(p.height)
	const refs = Array.isArray(p.reference_image_urls) ? p.reference_image_urls.filter(Boolean) : []
	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const refImagesAlt = Array.isArray(p.ref_images) ? p.ref_images.filter(Boolean) : []
	for (const img of refImages) {
		if (typeof img === 'string' && img.startsWith('http')) refs.push(img)
	}
	for (const img of refImagesAlt) {
		if (typeof img === 'string' && img.startsWith('http')) refs.push(img)
	}
	if (refs.length) body.reference_image_urls = refs.slice(0, 5)
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	if (negativePrompt) body.negative_prompt = negativePrompt
	if (p.seed !== undefined && p.seed !== null) body.seed = p.seed
	const refCacheIds = Array.isArray(p.refCacheIds) ? p.refCacheIds.filter(Boolean) : []
	if (refCacheIds.length) {
		const cacheDir = getCacheDir(ctx, 'nanobanana')
		const cacheUrls = refCacheIds
			.map((id) => {
				try {
					const files = fs.readdirSync(cacheDir).filter((f) => f.includes(String(id)))
					if (files.length > 0) return `file://${path.resolve(cacheDir, files[0])}`
				} catch {}
				return null
			})
			.filter(Boolean)
		if (cacheUrls.length)
			body.reference_image_urls = [...(body.reference_image_urls || []), ...cacheUrls].slice(0, 5)
	}
	try {
		yield wrapTaskStatusMsg('Generating image...', 'generating')
		const stream = client.postStream(`${NANOBANANA_API_BASE}/v1/text-to-image`, {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' },
			body: JSON.stringify(body),
			timeout: 120000
		})
		let finalData = null
		for await (const rawLine of stream) {
			const line = String(rawLine || '').trim()
			if (!line.startsWith('data:')) continue
			const data = line.slice(5).trim()
			if (data === '[DONE]') break
			try {
				const parsed = JSON.parse(data)
				if (parsed.status === 'succeeded' || parsed.image_url) {
					finalData = parsed
				}
				if (parsed.progress !== undefined || parsed.status) {
					const pct = parsed.progress ? `${Math.round(Number(parsed.progress) * 100)}%` : ''
					yield wrapTaskStatusMsg(
						`Status: ${parsed.status || 'processing'}${pct ? ' ' + pct : ''}...`,
						'streaming'
					)
				}
			} catch {}
		}
		if (finalData) {
			const imageUrl = String(finalData.image_url || finalData.imageUrl || '').trim()
			if (imageUrl) {
				yield wrapChatMsg({ imageUrl })
			} else {
				yield wrapChatMsg(finalData)
			}
		}
		yield wrapDone()
	} catch (err) {
		yield wrapStreamError(String(err?.message || err))
	}
}

const SEEDREAM_SIZE_MAP = {
	'1K': {
		'1:1': '1024x1024',
		'4:3': '1152x864',
		'3:4': '864x1152',
		'16:9': '1280x720',
		'9:16': '720x1280',
		'3:2': '1248x832',
		'2:3': '832x1248',
		'21:9': '1512x648'
	},
	'2K': {
		'1:1': '2048x2048',
		'4:3': '2304x1728',
		'3:4': '1728x2304',
		'16:9': '2848x1600',
		'9:16': '1600x2848',
		'3:2': '2496x1664',
		'2:3': '1664x2496',
		'21:9': '3136x1344'
	},
	'3K': {
		'1:1': '3072x3072',
		'4:3': '3456x2592',
		'3:4': '2592x3456',
		'16:9': '4096x2304',
		'9:16': '2304x4096',
		'3:2': '3744x2496',
		'2:3': '2496x3744',
		'21:9': '4704x2016'
	},
	'4K': {
		'1:1': '4096x4096',
		'4:3': '4704x3520',
		'3:4': '3520x4704',
		'16:9': '5504x3040',
		'9:16': '3040x5504',
		'3:2': '4992x3328',
		'2:3': '3328x4992',
		'21:9': '6240x2656'
	}
}

function resolveSeedreamSize(sizePreset, aspectRatio) {
	const preset = String(sizePreset || '2K')
		.trim()
		.toUpperCase()
	const ar = String(aspectRatio || '1:1')
		.trim()
		.replace(/\s/g, '')

	if (SEEDREAM_SIZE_MAP[preset]) {
		const exactSize = SEEDREAM_SIZE_MAP[preset][ar]
		if (exactSize) return exactSize
		if (ar === '1:1') return preset
	}

	if (preset === '1K') return '1024x1024'
	if (preset === '3K') return '3072x3072'
	if (preset === '4K') return '4096x4096'
	return '2048x2048'
}

function isSeedream5Model(modelId) {
	const m = String(modelId || '').toLowerCase()
	return m.includes('5-0') || m.includes('seedream-5')
}

export async function* seedreamGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || p.text || '').trim()
	if (!prompt) {
		yield wrapStreamError('prompt is required')
		return
	}
	const repo = getApiKeyRepo(ctx)
	let apiKey = ''
	for (const name of [
		'seedream',
		'bytedance_seedream',
		'bytedance_image',
		'bytedance_text',
		'bytedance',
		'doubao'
	]) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) {
				apiKey = String(r.plaintext).trim()
				break
			}
		} catch {}
	}
	if (!apiKey) {
		if (isDevMockMode()) {
			console.log(
				'[third-party:mock] Using mock image stream for seedreamGenerateStream (no API key configured, dev mode)'
			)
			yield* mockImageStream()
			return
		}
		yield wrapStreamError('seedream api key (ark api key) is not configured')
		return
	}
	const model = String(p.model || p.imageModel || p.endpoint_id || '').trim()
	if (!model) {
		yield wrapStreamError('model is required (imageModel/endpoint_id not provided)')
		return
	}

	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const refImagesAlt = Array.isArray(p.ref_images) ? p.ref_images.filter(Boolean) : []
	const allRefImages = [...refImages]
	for (const ref of refImagesAlt) {
		if (typeof ref === 'string') allRefImages.push(ref)
		else if (ref && typeof ref.data === 'string') allRefImages.push(ref.data)
		else if (ref && typeof ref.url === 'string') allRefImages.push(ref.url)
	}

	const sizePreset = String(p.size || '2K').trim()
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || p.ratio || '1:1').trim()
	const size = resolveSeedreamSize(sizePreset, aspectRatio)

	const quantity = Number.isFinite(Number(p.n))
		? Number(p.n)
		: Number.isFinite(Number(p.quantity))
			? Number(p.quantity)
			: 1
	const n = Math.min(4, Math.max(1, Math.floor(quantity)))
	const seed = Number(p.seed)
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	const watermark =
		p.watermark === true || p.watermark === 'true' || p.watermark === 1 || p.watermark === '1'
	const outputFormat = String(p.output_format || p.outputFormat || 'jpeg')
		.trim()
		.toLowerCase()
	const is5Model = isSeedream5Model(model)
	const hasRefImages = allRefImages.length > 0

	const body = {
		model,
		prompt,
		size,
		response_format: 'url',
		watermark
	}

	if (n > 1) {
		body.n = n
	}
	if (negativePrompt) body.negative_prompt = negativePrompt
	if (Number.isFinite(seed) && seed >= 0) body.seed = Math.floor(seed)
	if (is5Model && (outputFormat === 'png' || outputFormat === 'jpeg')) {
		body.output_format = outputFormat
	}

	if (hasRefImages) {
		const refImage = allRefImages[0]
		if (typeof refImage === 'string' && refImage.startsWith('data:')) {
			body.image = refImage
		} else if (typeof refImage === 'string') {
			body.image = refImage
		}
	}

	console.log(
		'[seedream] generating, model=',
		model,
		'size=',
		size,
		'n=',
		n,
		'watermark=',
		watermark,
		'hasRefImages=',
		hasRefImages,
		'is5Model=',
		is5Model
	)

	const taskId = `seedream-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
	const projectId = p.projectId ? Number(p.projectId) : null
	const nodeId = String(p.nodeId || '').trim()
	recordArkTask({
		taskId,
		provider: 'bytedance',
		apiType: 'seedream',
		apiAction: 'image_generation',
		model,
		status: 'queued',
		prompt,
		negativePrompt,
		statusText: '正在提交图片生成任务…',
		requestPayload: { model, prompt, size, n, watermark, hasRefImages },
		projectId,
		nodeId
	})

	try {
		yield wrapTaskStatusMsg(`正在使用 ${model} 生成图片…`, 'generating')
		const client = getHttpClient()
		const apiPath = `${SEEDREAM_API_BASE}/images/generations`

		const resp = await client.post(apiPath, body, {
			headers: {
				Authorization: `Bearer ${apiKey}`
			},
			timeout: 120000
		})

		if (!resp.ok) {
			const errMsg = resp.body?.error?.message || resp.body?.message || `HTTP ${resp.status}`
			console.error(
				'[seedream] API error:',
				resp.status,
				JSON.stringify(resp.body?.error || resp.body || {}).slice(0, 500)
			)
			recordArkTask({
				taskId,
				status: 'failed',
				errorMessage: errMsg,
				statusText: '生成失败',
				responsePayload: { status: resp.status, body: resp.body }
			})
			throw new Error(errMsg)
		}

		let imageUrls = []
		if (resp.body && Array.isArray(resp.body.data)) {
			imageUrls = resp.body.data
				.map((item) => {
					if (item.url) return item.url
					if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
					return ''
				})
				.filter(Boolean)
		}

		if (imageUrls.length === 0) {
			recordArkTask({
				taskId,
				status: 'failed',
				errorMessage: 'seedream returned no images',
				statusText: '未返回图片'
			})
			yield wrapStreamError('seedream returned no images')
			return
		}

		recordArkTask({
			taskId,
			status: 'succeeded',
			resultUrls: imageUrls,
			thumbnailUrl: imageUrls[0] || '',
			statusText: `已生成 ${imageUrls.length} 张图片`,
			responsePayload: { imageCount: imageUrls.length }
		})

		for (const imgUrl of imageUrls) {
			yield wrapChatMsg({ imageUrl: imgUrl })
		}
		yield wrapDone()
	} catch (err) {
		console.error('[seedream] generation error:', err)
		recordArkTask({
			taskId,
			status: 'failed',
			errorMessage: String(err?.message || err),
			statusText: '生成异常'
		})
		yield wrapStreamError(String(err?.message || err))
	}
}

function resolveJimengKeys(ctx) {
	const keyRepo = getApiKeyRepo(ctx)
	let accessKeyId = ''
	let secretKey = ''
	const akResult = keyRepo.getPlaintext('jimeng-access-key')
	const skResult = keyRepo.getPlaintext('jimeng-secret-key')
	if (akResult.ok && akResult.plaintext) accessKeyId = String(akResult.plaintext).trim()
	if (skResult.ok && skResult.plaintext) secretKey = String(skResult.plaintext).trim()
	if (!accessKeyId) {
		const r = keyRepo.getPlaintext('jimengAccessKeyId')
		if (r.ok && r.plaintext) accessKeyId = String(r.plaintext).trim()
	}
	if (!secretKey) {
		const r = keyRepo.getPlaintext('jimengSecretKey')
		if (r.ok && r.plaintext) secretKey = String(r.plaintext).trim()
	}
	return { accessKeyId, secretKey }
}

export async function* jimengImageGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) {
		yield wrapStreamError('prompt is required')
		return
	}
	const { accessKeyId, secretKey } = resolveJimengKeys(ctx)
	if (!accessKeyId || !secretKey) {
		yield wrapStreamError('jimeng access key / secret key is not configured')
		return
	}
	const reqKey = String(p.req_key || p.reqKey || p.model || p.imageModel || 'high_aes').trim()
	const body = {
		req_key: reqKey,
		prompt,
		return_url: true
	}
	if (p.width !== undefined) body.width = Number(p.width)
	if (p.height !== undefined) body.height = Number(p.height)
	if (p.seed !== undefined && p.seed !== null) body.seed = Number(p.seed)
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || p.ratio || '').trim()
	if (aspectRatio && body.width === undefined && body.height === undefined) {
		body.aspect_ratio = aspectRatio
	}
	const refImages = Array.isArray(p.ref_images) ? p.ref_images.filter(Boolean) : []
	const refImagesAlt = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const allRefImages = [...refImages]
	for (const ref of refImagesAlt) {
		if (typeof ref === 'string') allRefImages.push(ref)
		else if (ref && typeof ref.data === 'string') allRefImages.push(ref.data)
	}
	if (allRefImages.length) body.ref_images = allRefImages
	const taskId = `jimeng-img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
	const projectId = p.projectId ? Number(p.projectId) : null
	const nodeId = String(p.nodeId || '').trim()
	recordArkTask({
		taskId,
		provider: 'bytedance',
		apiType: 'jimeng',
		apiAction: 'image_generation',
		model: reqKey,
		status: 'queued',
		prompt,
		statusText: '正在提交即梦图片生成任务…',
		requestPayload: { reqKey: reqKey, prompt, aspectRatio },
		projectId,
		nodeId
	})
	try {
		yield wrapTaskStatusMsg('Generating image with Jimeng...', 'generating')
		const signed = buildJimengSignedRequest({
			accessKeyId,
			secretKey,
			method: 'POST',
			path: '/',
			query: { Action: 'CVProcess', Version: '2022-08-31' },
			body: JSON.stringify(body)
		})
		const client = getHttpClient()
		const res = await client.post(signed.url, body, {
			headers: signed.headers,
			timeout: 60000
		})
		if (!res.ok) {
			recordArkTask({
				taskId,
				status: 'failed',
				errorMessage: `HTTP ${res.status}`,
				statusText: '生成失败'
			})
			yield wrapStreamError(`HTTP ${res.status}`)
			return
		}
		const result = res.body || {}
		const imageUrl = String(
			result?.data?.image_url || result?.image_url || result?.url || ''
		).trim()
		if (imageUrl) {
			recordArkTask({
				taskId,
				status: 'succeeded',
				resultUrls: [imageUrl],
				thumbnailUrl: imageUrl,
				statusText: '已生成图片',
				responsePayload: { imageUrl }
			})
			yield wrapChatMsg({ imageUrl })
		} else {
			recordArkTask({
				taskId,
				status: 'succeeded',
				resultText: JSON.stringify(result),
				statusText: '已生成',
				responsePayload: result
			})
			yield wrapChatMsg(result)
		}
		yield wrapDone()
	} catch (err) {
		recordArkTask({
			taskId,
			status: 'failed',
			errorMessage: String(err?.message || err),
			statusText: '生成异常'
		})
		yield wrapStreamError(String(err?.message || err))
	}
}

export async function* jimengVideoGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) {
		yield wrapStreamError('prompt is required')
		return
	}
	const { accessKeyId, secretKey } = resolveJimengKeys(ctx)
	if (!accessKeyId || !secretKey) {
		yield wrapStreamError('jimeng access key / secret key is not configured')
		return
	}
	const reqKey = String(p.req_key || p.reqKey || p.model || 'jimeng_video_gen').trim()
	const body = {
		req_key: reqKey,
		prompt,
		return_url: true
	}
	if (p.duration !== undefined) body.duration = Number(p.duration)
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || p.ratio || '').trim()
	if (aspectRatio) body.aspect_ratio = aspectRatio
	if (p.resolution) {
		const resStr = String(p.resolution).trim()
		const parts = resStr.split('x').map((s) => Number(s.trim()))
		if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
			body.width = parts[0]
			body.height = parts[1]
		}
	}
	if (p.width !== undefined) body.width = Number(p.width)
	if (p.height !== undefined) body.height = Number(p.height)
	if (p.seed !== undefined && p.seed !== null) body.seed = Number(p.seed)
	const taskId = `jimeng-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
	const projectId = p.projectId ? Number(p.projectId) : null
	const nodeId = String(p.nodeId || '').trim()
	recordArkTask({
		taskId,
		provider: 'bytedance',
		apiType: 'jimeng',
		apiAction: 'video_generation',
		model: reqKey,
		status: 'queued',
		prompt,
		statusText: '正在提交即梦视频生成任务…',
		requestPayload: { reqKey: reqKey, prompt, width: body.width, height: body.height },
		projectId,
		nodeId
	})
	try {
		yield wrapTaskStatusMsg('Generating video with Jimeng...', 'generating')
		const signed = buildJimengSignedRequest({
			accessKeyId,
			secretKey,
			method: 'POST',
			path: '/',
			query: { Action: 'CVProcess', Version: '2022-08-31' },
			body: JSON.stringify(body)
		})
		const client = getHttpClient()
		const res = await client.post(signed.url, body, {
			headers: signed.headers,
			timeout: 120000
		})
		if (!res.ok) {
			recordArkTask({
				taskId,
				status: 'failed',
				errorMessage: `HTTP ${res.status}`,
				statusText: '生成失败'
			})
			yield wrapStreamError(`HTTP ${res.status}`)
			return
		}
		const result = res.body || {}
		const videoUrl = String(
			result?.data?.video_url || result?.video_url || result?.url || ''
		).trim()
		if (videoUrl) {
			recordArkTask({
				taskId,
				status: 'succeeded',
				resultUrls: [videoUrl],
				thumbnailUrl: '',
				statusText: '已生成视频',
				responsePayload: { videoUrl }
			})
			yield wrapChatMsg({ videoUrl, videoUrlRemote: videoUrl })
		} else {
			recordArkTask({
				taskId,
				status: 'succeeded',
				resultText: JSON.stringify(result),
				statusText: '已生成',
				responsePayload: result
			})
			yield wrapChatMsg(result)
		}
		yield wrapDone()
	} catch (err) {
		recordArkTask({
			taskId,
			status: 'failed',
			errorMessage: String(err?.message || err),
			statusText: '生成异常'
		})
		yield wrapStreamError(String(err?.message || err))
	}
}

export async function* blueprintChatStream(ctx, payload) {
	const p = payload || {}
	const message = String(p.message || p.prompt || p.content || '').trim()
	if (!message) {
		yield wrapStreamError('message is required')
		return
	}
	const messages = Array.isArray(p.messages) ? p.messages : []
	const history = Array.isArray(p.history) ? p.history : []
	const systemPrompt = String(
		p.systemPrompt || p.system_prompt || '你是DVStudio蓝图助手，帮助用户构建AI工作流。'
	).trim()
	const requestedProvider = String(p.provider || '')
		.toLowerCase()
		.trim()

	const repo = getApiKeyRepo(ctx)

	function getKeyFor(name) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
		return ''
	}

	const geminiBaseUrl = getGeminiBaseUrl()
	const providerConfigs = [
		{
			prov: 'gemini',
			names: ['gemini', 'GeminiApiKey', 'gemini_api_key'],
			baseUrl: geminiBaseUrl,
			model: 'gemini-3.5-flash',
			isNative: true
		},
		{
			prov: 'bytedance',
			names: ['bytedance_text', 'bytedance', 'doubao', 'seedream', 'bytedanceApiKey'],
			baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
			model: 'doubao-seed-evolving'
		},
		{
			prov: 'openai',
			names: ['openai'],
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini'
		}
	]

	let cfg = null
	let provider = ''
	let apiKey = ''

	if (requestedProvider) {
		for (const pc of providerConfigs) {
			if (
				pc.prov === requestedProvider ||
				requestedProvider.includes(pc.prov) ||
				pc.names.some((n) => requestedProvider.includes(n))
			) {
				for (const name of pc.names) {
					const k = getKeyFor(name)
					if (k) {
						cfg = pc
						provider = pc.prov
						apiKey = k
						break
					}
				}
				if (!cfg || !apiKey) {
					yield wrapStreamError(
						`No API key configured for requested provider: ${requestedProvider}. Please configure it in Settings.`
					)
					return
				}
				break
			}
		}
	}

	if (!cfg) {
		for (const pc of providerConfigs) {
			for (const name of pc.names) {
				const k = getKeyFor(name)
				if (k) {
					cfg = pc
					provider = pc.prov
					apiKey = k
					break
				}
			}
			if (cfg) break
		}
	}

	if (!cfg || !apiKey) {
		if (isDevMockMode()) {
			console.log(
				'[third-party:mock] Using mock text stream for blueprintChatStream (no API key configured, dev mode)'
			)
			const taskId = `mock-chat-${Date.now()}`
			const projectId = p.projectId ? Number(p.projectId) : null
			const nodeId = String(p.nodeId || '').trim()
			recordArkTask({
				taskId,
				provider: 'mock',
				apiType: 'blueprintChat',
				apiAction: 'text_chat',
				model: 'mock-dev',
				status: 'running',
				prompt: message,
				statusText: 'Mock模式：正在生成文本…',
				requestPayload: { model: 'mock-dev', messageLength: message.length },
				projectId,
				nodeId
			})
			yield* mockTextStream()
			recordArkTask({
				taskId,
				status: 'succeeded',
				resultText: MOCK_TEXT_RESPONSE,
				statusText: 'Mock文本生成完成',
				responsePayload: { contentLength: MOCK_TEXT_RESPONSE.length }
			})
			return
		}
		yield wrapStreamError('No LLM API key configured (gemini/bytedance/openai)')
		return
	}

	const useModel = String(p.modelId || p.model || cfg.model).trim()
	const temperature = p.temperature !== undefined && p.temperature !== null ? Number(p.temperature) : undefined
	const maxTokens = p.maxTokens !== undefined && p.maxTokens !== null ? Number(p.maxTokens) : undefined
	const topP = p.topP !== undefined && p.topP !== null ? Number(p.topP) : undefined
	const taskId = `chat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
	const projectId = p.projectId ? Number(p.projectId) : null
	const nodeId = String(p.nodeId || '').trim()

	// Build user message: support multimodal (image + text) when refImages are provided
	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []

	const requestPayload = {
		model: useModel,
		messageLength: message.length,
		provider,
		temperature,
		maxTokens,
		topP,
		refImageCount: refImages.length
	}
	recordArkTask({
		taskId,
		provider,
		apiType: 'blueprintChat',
		apiAction: 'text_chat',
		model: useModel,
		status: 'queued',
		prompt: message,
		statusText: '正在调用文本模型…',
		requestPayload,
		projectId,
		nodeId
	})
	const chatMessages = [{ role: 'system', content: systemPrompt }]
	const allHistory = history.length > 0 ? history : messages
	for (const m of allHistory) {
		if (m && m.role && m.content) chatMessages.push({ role: m.role, content: String(m.content) })
	}

	const hasRefImages = refImages.length > 0
	if (hasRefImages) {
		const userContent = []
		for (const img of refImages) {
			userContent.push({
				type: 'image_url',
				image_url: { url: String(img) }
			})
		}
		userContent.push({ type: 'text', text: message })
		chatMessages.push({ role: 'user', content: userContent })
	} else {
		chatMessages.push({ role: 'user', content: message })
	}

	let fullContent = ''
	let fullImages = []
	try {
		const client = getHttpClient()
		if (cfg.isNative && provider === 'gemini') {
			const { contents, systemInstruction } = convertMessagesToGemini(chatMessages)
			const geminiBody = {
				contents,
				generationConfig: {
					responseModalities: ['TEXT']
				}
			}
			if (systemInstruction) {
				geminiBody.systemInstruction = systemInstruction
			}
			if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
				geminiBody.generationConfig.temperature = Math.max(0, Math.min(2, temperature))
			}
			if (typeof maxTokens === 'number' && !Number.isNaN(maxTokens) && maxTokens > 0) {
				geminiBody.generationConfig.maxOutputTokens = Math.floor(maxTokens)
			}
			if (typeof topP === 'number' && !Number.isNaN(topP)) {
				geminiBody.generationConfig.topP = Math.max(0, Math.min(1, topP))
			}
			const url = `${cfg.baseUrl}/models/${useModel}:streamGenerateContent?alt=sse&key=${apiKey}`

			const fetchOptions = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream'
				},
				body: JSON.stringify(geminiBody)
			}

			const response = await geminiFetchStream(url, fetchOptions)

			if (!response.ok) {
				let errBody = ''
				try {
					errBody = await response.text()
				} catch (textErr) {
					console.error('[gemini:chat] Failed to read error response body:', textErr)
				}
				console.error(`[gemini:chat] ========== HTTP ERROR RESPONSE BODY ==========`)
				console.error(`[gemini:chat] Status: ${response.status} ${response.statusText}`)
				console.error(`[gemini:chat] Full error body:`)
				console.error(errBody)
				console.error(`[gemini:chat] ========== END ERROR RESPONSE ==========`)
				let detail = ''
				try {
					const parsed = JSON.parse(errBody)
					detail =
						parsed?.error?.message ||
						parsed?.message ||
						JSON.stringify(parsed?.error || parsed, null, 2)
				} catch {
					detail = errBody
				}
				throw new Error(`Gemini API HTTP ${response.status}: ${detail}`)
			}

			if (!response.body) {
				throw new Error('Response body is null')
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder('utf-8')
			let buffer = ''

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split(/\r?\n/)
				buffer = lines.pop() || ''

				for (const rawLine of lines) {
					const line = String(rawLine || '').trim()
					if (!line.startsWith('data:')) continue
					const data = line.slice(5).trim()
					if (!data || data === '[DONE]') continue
					try {
						const parsed = JSON.parse(data)
						const candidates = parsed?.candidates || []
						for (const candidate of candidates) {
							const parts = candidate?.content?.parts || []
							for (const part of parts) {
								if (part.text) {
									fullContent += part.text
									yield wrapTextMsg(part.text)
								}
							}
						}
					} catch (parseErr) {
						console.warn('[gemini:chat] Failed to parse SSE chunk:', parseErr?.message)
						console.warn('[gemini:chat] Raw chunk data:', data?.slice(0, 500))
					}
				}
			}
		} else {
			const openaiBody = { model: useModel, messages: chatMessages, stream: true }
			if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
				openaiBody.temperature = Math.max(0, Math.min(2, temperature))
			}
			if (typeof maxTokens === 'number' && !Number.isNaN(maxTokens) && maxTokens > 0) {
				openaiBody.max_tokens = Math.floor(maxTokens)
			}
			if (typeof topP === 'number' && !Number.isNaN(topP)) {
				openaiBody.top_p = Math.max(0, Math.min(1, topP))
			}
			const stream = client.postStream(`${cfg.baseUrl}/chat/completions`, {
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(openaiBody),
				timeout: 120000
			})
			for await (const rawLine of stream) {
				const line = String(rawLine || '').trim()
				if (!line.startsWith('data:')) continue
				const data = line.slice(5).trim()
				if (data === '[DONE]') break
				try {
					const parsed = JSON.parse(data)
					const delta = parsed?.choices?.[0]?.delta?.content
					if (delta) {
						fullContent += delta
						yield wrapTextMsg(delta)
					}
				} catch {}
			}
		}
		yield wrapDone()
		recordArkTask({
			taskId,
			status: 'succeeded',
			resultText: fullContent,
			statusText: '文本生成完成',
			responsePayload: { contentLength: fullContent.length }
		})
	} catch (err) {
		recordArkTask({
			taskId,
			status: 'failed',
			errorMessage: String(err?.message || err),
			statusText: '文本生成失败'
		})
		yield wrapStreamError(String(err?.message || err))
	}
}

export async function blueprintChat(ctx, payload) {
	const p = payload || {}
	const message = String(p.message || p.prompt || p.content || '').trim()
	if (!message) return { ok: false, error: 'message is required' }
	const history = Array.isArray(p.history) ? p.history : []
	const systemPrompt = String(
		p.systemPrompt || p.system_prompt || '你是DVStudio蓝图助手，帮助用户构建AI工作流。'
	).trim()
	const requestedProvider = String(p.provider || '')
		.toLowerCase()
		.trim()

	const repo = getApiKeyRepo(ctx)

	function getKeyFor(name) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
		return ''
	}

	const geminiBaseUrl = getGeminiBaseUrl()
	const providerConfigs = [
		{
			prov: 'gemini',
			names: ['gemini', 'GeminiApiKey', 'gemini_api_key'],
			baseUrl: geminiBaseUrl,
			model: 'gemini-3.5-flash',
			isNative: true
		},
		{
			prov: 'bytedance',
			names: ['bytedance_text', 'bytedance', 'doubao', 'seedream', 'bytedanceApiKey'],
			baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
			model: 'doubao-seed-evolving'
		},
		{
			prov: 'openai',
			names: ['openai'],
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini'
		}
	]

	let cfg = null
	if (requestedProvider) {
		for (const pc of providerConfigs) {
			if (
				pc.prov === requestedProvider ||
				requestedProvider.includes(pc.prov) ||
				pc.names.some((n) => requestedProvider.includes(n))
			) {
				for (const name of pc.names) {
					const k = getKeyFor(name)
					if (k) {
						cfg = { ...pc, apiKey: k }
						break
					}
				}
				if (!cfg) {
					return {
						ok: false,
						error: `No API key configured for requested provider: ${requestedProvider}. Please configure it in Settings.`
					}
				}
				break
			}
		}
	}
	if (!cfg) {
		for (const pc of providerConfigs) {
			for (const name of pc.names) {
				const k = getKeyFor(name)
				if (k) {
					cfg = { ...pc, apiKey: k }
					break
				}
			}
			if (cfg) break
		}
	}
	if (!cfg) return { ok: false, error: 'No LLM API key configured (gemini/bytedance/openai)' }

	const useModel = String(p.modelId || p.model || cfg.model).trim()
	const temperature = p.temperature !== undefined && p.temperature !== null ? Number(p.temperature) : undefined
	const maxTokens = p.maxTokens !== undefined && p.maxTokens !== null ? Number(p.maxTokens) : undefined
	const topP = p.topP !== undefined && p.topP !== null ? Number(p.topP) : undefined
	const chatMessages = [{ role: 'system', content: systemPrompt }]
	for (const m of history) {
		if (m && m.role && m.content) chatMessages.push({ role: m.role, content: String(m.content) })
	}

	// Build user message: support multimodal (image + text) when refImages are provided
	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const hasRefImages = refImages.length > 0
	if (hasRefImages) {
		const userContent = []
		for (const img of refImages) {
			userContent.push({
				type: 'image_url',
				image_url: { url: String(img) }
			})
		}
		userContent.push({ type: 'text', text: message })
		chatMessages.push({ role: 'user', content: userContent })
	} else {
		chatMessages.push({ role: 'user', content: message })
	}

	try {
		const client = getHttpClient()
		let assistant = ''
		let images = []
		if (cfg.isNative && cfg.prov === 'gemini') {
			const { contents, systemInstruction } = convertMessagesToGemini(chatMessages)
			const geminiBody = {
				contents,
				generationConfig: {
					responseModalities: ['TEXT']
				}
			}
			if (systemInstruction) {
				geminiBody.systemInstruction = systemInstruction
			}
			if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
				geminiBody.generationConfig.temperature = Math.max(0, Math.min(2, temperature))
			}
			if (typeof maxTokens === 'number' && !Number.isNaN(maxTokens) && maxTokens > 0) {
				geminiBody.generationConfig.maxOutputTokens = Math.floor(maxTokens)
			}
			if (typeof topP === 'number' && !Number.isNaN(topP)) {
				geminiBody.generationConfig.topP = Math.max(0, Math.min(1, topP))
			}
			const url = `${cfg.baseUrl}/models/${useModel}:generateContent?key=${cfg.apiKey}`

			console.log('[gemini:chat:nonstream] Fetching from:', redactUrl(url))
			const response = await geminiFetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'DVSBackend/1.0 (Electron)'
				},
				body: JSON.stringify(geminiBody)
			})

			let resBody = null
			try {
				resBody = await response.json()
			} catch {
				resBody = await response.text()
			}

			if (!response.ok) {
				let errMsg = `HTTP ${response.status}`
				if (typeof resBody === 'object' && resBody?.error) {
					errMsg = String(resBody.error.message || JSON.stringify(resBody.error))
				} else if (typeof resBody === 'string') {
					errMsg = resBody.slice(0, 500)
				}
				console.error('[gemini:chat:nonstream] HTTP error:', response.status, errMsg)
				return { ok: false, error: errMsg, status: response.status }
			}

			const candidates = resBody?.candidates || []
			for (const candidate of candidates) {
				const parts = candidate?.content?.parts || []
				for (const part of parts) {
					if (part.text) {
						assistant += part.text
					}
				}
			}
			assistant = assistant.trim()
		} else {
			const openaiBody = { model: useModel, messages: chatMessages, stream: false }
			if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
				openaiBody.temperature = Math.max(0, Math.min(2, temperature))
			}
			if (typeof maxTokens === 'number' && !Number.isNaN(maxTokens) && maxTokens > 0) {
				openaiBody.max_tokens = Math.floor(maxTokens)
			}
			if (typeof topP === 'number' && !Number.isNaN(topP)) {
				openaiBody.top_p = Math.max(0, Math.min(1, topP))
			}
			const res = await client.post(
				`${cfg.baseUrl}/chat/completions`,
				openaiBody,
				{
					headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
					timeout: 120000
				}
			)
			if (!res.ok) {
				const errMsg =
					typeof res.body === 'object' && res.body?.error
						? String(res.body.error.message || JSON.stringify(res.body.error))
						: `HTTP ${res.status}`
				return { ok: false, error: errMsg, status: res.status }
			}
			assistant = String(res.body?.choices?.[0]?.message?.content || '').trim()
		}
		return { ok: true, assistant, model: useModel }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function* geminiImageGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || p.message || '').trim()
	if (!prompt) {
		yield wrapStreamError('prompt is required')
		return
	}
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	const rawAspectRatio = String(p.aspect_ratio || p.aspectRatio || '1:1').trim()
	const rawImageSize = String(p.image_size || p.imageSize || '').trim()
	const thinkingLevel = String(p.thinking_level || p.thinkingLevel || 'minimal').trim()
	const numImages = Math.max(1, Math.min(4, Number(p.num_images || p.numImages || p.quantity || 1)))
	const referenceImages = Array.isArray(p.reference_images)
		? p.reference_images.filter(Boolean)
		: []
	const refImages = Array.isArray(p.refImages) ? p.refImages.filter(Boolean) : []
	const allRefImages = [...referenceImages]
	for (const img of refImages) {
		if (typeof img === 'string') allRefImages.push(img)
	}
	const rawModelId = String(p.modelId || p.model || 'gemini-3.1-flash-image').trim()
	const validation = validateGeminiImageParams(rawModelId, rawImageSize, rawAspectRatio)
	const modelId = validation.modelId
	const imageSize = validation.imageSize
	const aspectRatio = validation.aspectRatio
	const modelConfig = validation.config
	const modelLabel = getGeminiModelLabel(modelId)

	const repo = getApiKeyRepo(ctx)
	function getKeyFor(name) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
		return ''
	}
	const apiKey = getKeyFor('gemini') || getKeyFor('GeminiApiKey') || getKeyFor('gemini_api_key')
	if (!apiKey) {
		yield wrapStreamError('No Gemini API key configured. Please configure it in Settings.')
		return
	}

	const taskId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
	const projectId =
		p.projectId !== undefined && p.projectId !== null && p.projectId !== ''
			? Number(p.projectId) || null
			: null
	const nodeId = String(p.nodeId || '').trim()

	try {
		const taskRecord = geminiTaskService.createTaskRecord(ctx, {
			taskId,
			model: modelId,
			modelLabel,
			prompt,
			negativePrompt,
			aspectRatio,
			imageSize,
			thinkingLevel: modelConfig?.supportsThinkingLevel ? thinkingLevel : undefined,
			numImages,
			projectId,
			nodeId,
			statusText: '正在提交任务到Google Gemini...'
		})

		yield wrapTaskStatusMsg(`正在使用 ${modelLabel} 生成图片…`, 'generating', {
			taskId,
			progress: 10
		})

		const userParts = []

		geminiTaskService.updateTaskStatus(ctx, taskId, {
			status: 'processing',
			progress: 10,
			statusText: '正在处理参考图片...'
		})
		yield wrapTaskStatusMsg('正在处理参考图片...', 'processing', { taskId, progress: 10 })

		if (allRefImages.length > 0) {
			for (const img of allRefImages) {
				const imgStr = String(img)
				if (imgStr.startsWith('data:')) {
					const matches = imgStr.match(/^data:([^;]+);base64,(.+)$/)
					if (matches) {
						userParts.push({
							inlineData: { mimeType: matches[1] || 'image/jpeg', data: matches[2] }
						})
					}
				} else if (imgStr.startsWith('http://') || imgStr.startsWith('https://')) {
					userParts.push({ fileData: { mimeType: 'image/jpeg', fileUri: imgStr } })
				}
			}
		}

		let imagePrompt = prompt
		if (negativePrompt) {
			imagePrompt = `${imagePrompt}\n\nNegative prompt: ${negativePrompt}`
		}
		userParts.push({ text: imagePrompt })

		const geminiBody = {
			contents: [{ role: 'user', parts: userParts }],
			generationConfig: {
				responseModalities: ['image', 'text'],
				candidateCount: numImages,
				imageConfig: {
					aspectRatio: aspectRatio,
					imageSize: imageSize
				}
			}
		}

		if (modelConfig?.supportsThinkingLevel && thinkingLevel === 'high') {
			geminiBody.generationConfig.thinkingConfig = {
				thinkingBudget: -1
			}
		}

		geminiTaskService.updateTaskStatus(ctx, taskId, {
			progress: 20,
			statusText: '正在调用Gemini API生成图片...'
		})
		yield wrapTaskStatusMsg('正在调用Gemini API生成图片...', 'processing', { taskId, progress: 20 })

		const geminiBaseUrl = getGeminiBaseUrl()
		const url = `${geminiBaseUrl}/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`

		let generatedImages = []
		let generatedText = ''
		let chunkCount = 0

		try {
			const fetchOptions = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream'
				},
				body: JSON.stringify(geminiBody)
			}

			const response = await geminiFetchStream(url, fetchOptions)

			if (!response.ok) {
				let errBody = ''
				try {
					errBody = await response.text()
				} catch (textErr) {
					console.error('[gemini] Failed to read error response body:', textErr)
				}
				console.error(`[gemini] ========== HTTP ERROR RESPONSE BODY ==========`)
				console.error(`[gemini] Status: ${response.status} ${response.statusText}`)
				console.error(`[gemini] Full error body:`)
				console.error(errBody)
				console.error(`[gemini] ========== END ERROR RESPONSE ==========`)
				let detail = ''
				try {
					const parsed = JSON.parse(errBody)
					detail =
						parsed?.error?.message ||
						parsed?.message ||
						JSON.stringify(parsed?.error || parsed, null, 2)
				} catch {
					detail = errBody
				}
				throw new Error(`Gemini API HTTP ${response.status}: ${detail}`)
			}

			if (!response.body) {
				throw new Error('Response body is null')
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder('utf-8')
			let buffer = ''

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split(/\r?\n/)
				buffer = lines.pop() || ''

				for (const rawLine of lines) {
					const line = String(rawLine || '').trim()
					if (!line.startsWith('data:')) continue
					const data = line.slice(5).trim()
					if (!data || data === '[DONE]') continue
					try {
						const parsed = JSON.parse(data)
						chunkCount++

						const progress = Math.min(90, 20 + chunkCount * 5)
						geminiTaskService.updateTaskStatus(ctx, taskId, {
							progress,
							statusText: `正在接收图片数据... (${chunkCount} chunks)`
						})

						yield wrapTaskStatusMsg(`正在接收图片数据... (${chunkCount} chunks)`, 'streaming', {
							taskId,
							progress
						})
						const candidates = parsed?.candidates || []
						for (const candidate of candidates) {
							const parts = candidate?.content?.parts || []
							for (const part of parts) {
								if (part.inlineData && part.inlineData.data) {
									generatedImages.push({
										mimeType: part.inlineData.mimeType || 'image/png',
										data: part.inlineData.data
									})
								}
								if (part.text) {
									generatedText += part.text
								}
							}
						}
					} catch (parseErr) {
						console.warn('[gemini] Failed to parse SSE chunk:', parseErr?.message)
						console.warn('[gemini] Raw chunk data:', data?.slice(0, 500))
					}
				}
			}
		} catch (fetchErr) {
			console.error('[gemini] SSE stream processing error:', fetchErr)
			throw fetchErr
		}

		if (generatedImages.length === 0 && generatedText) {
			const imgRegex = /!\[.*?\]\((data:image\/[^)]+)\)/g
			let match
			while (
				(match = imgRegex.exec(generatedText)) !== null &&
				generatedImages.length < numImages
			) {
				const dataUrl = match[1]
				const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
				if (matches) {
					generatedImages.push({
						mimeType: matches[1] || 'image/png',
						data: matches[2]
					})
				}
			}
		}

		if (generatedImages.length === 0) {
			geminiTaskService.failTask(ctx, taskId, 'No images were generated', 'NO_IMAGES')
			yield wrapStreamError('No images were generated')
			yield wrapGeminiEvent('task_failed', { taskId, error: 'No images were generated' })
			return
		}

		yield wrapTaskStatusMsg('正在保存图片到本地…', 'saving', { taskId, progress: 95 })

		const completedTask = geminiTaskService.completeTask(ctx, taskId, generatedImages, {
			generatedText,
			chunkCount,
			imageCount: generatedImages.length
		})
		yield wrapTaskStatusMsg('生成完成', 'completed', { taskId, progress: 100 })

		const totalImages = completedTask.resultImages.length
		for (let i = 0; i < completedTask.resultImages.length; i++) {
			const img = completedTask.resultImages[i]
			const imageUrl = img.dwebUrl || `file://${img.localPath.replace(/\\/g, '/')}`
			yield wrapChatMsg({
				imageUrl: imageUrl,
				localPath: img.localPath,
				filename: img.filename,
				mimeType: img.mimeType,
				dwebUrl: img.dwebUrl,
				imageIndex: i,
				totalImages: totalImages
			})
		}

		yield wrapGeminiEvent('task_completed', {
			taskId,
			imageCount: completedTask.resultImages.length,
			images: completedTask.resultImages
		})

		yield wrapDone()
	} catch (err) {
		console.error('[gemini] Image generation error:', err)
		try {
			geminiTaskService.failTask(ctx, taskId, String(err?.message || err), 'STREAM_ERROR')
		} catch {}
		yield wrapStreamError(String(err?.message || err))
		yield wrapGeminiEvent('task_failed', { taskId, error: String(err?.message || err) })
	}
}
