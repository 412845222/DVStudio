import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { internalError, invalidParamsError, upstreamError } from '../../core/errors.mjs'
import { getHttpClient } from '../../core/http-client.mjs'
import { getLocalDbFilePath } from '../../../localdb/db.mjs'

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

function wrapTaskStatusMsg(message, phase) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/taskStatus',
			payload: { phase: phase || 'streaming', message: String(message || '') }
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

const NANOBANANA_API_BASE = 'https://api.meshy.ai/openapi'
const SEEDREAM_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const JIMENG_API_BASE = 'https://visual.volcengineapi.com'

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
		try { baseDir = path.join(os.homedir(), '.dweb', 'backend-data') } catch { baseDir = os.tmpdir() }
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
		else if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) ext = '.webp'
		else if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) ext = '.gif'
	}
	const hash = sha256Hex(buf).slice(0, 16)
	const name = String(preferredName || '').trim().replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_').slice(0, 40)
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
	let aiModel = String(p.ai_model || p.model || 'nano-banana').trim().toLowerCase()
	if (!['nano-banana', 'nano-banana-pro'].includes(aiModel)) aiModel = 'nano-banana'
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
		const cacheUrls = refCacheIds.map(id => {
			try {
				const files = fs.readdirSync(cacheDir).filter(f => f.includes(String(id)))
				if (files.length > 0) return `file://${path.resolve(cacheDir, files[0])}`
			} catch {}
			return null
		}).filter(Boolean)
		if (cacheUrls.length) body.reference_image_urls = [...(body.reference_image_urls || []), ...cacheUrls].slice(0, 5)
	}
	const res = await client.post(`${NANOBANANA_API_BASE}/v1/text-to-image`, body, {
		headers: { 'Authorization': `Bearer ${apiKey}` },
		timeout: 120000
	})
	if (!res.ok) {
		const errMsg = typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
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
	const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
	const host = 'visual.volcengineapi.com'
	const contentType = 'application/json'
	const allHeaders = {
		'Host': host,
		'X-Date': amzDate,
		'Content-Type': contentType,
		...(headers || {})
	}
	const signedHeaders = Object.keys(allHeaders).map(k => k.toLowerCase()).sort().join(';')
	const canonicalHeaders = Object.keys(allHeaders).sort().map(k => `${k.toLowerCase()}:${String(allHeaders[k]).trim()}\n`).join('')
	const queryString = query ? Object.keys(query).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`).join('&') : ''
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
	return { url: `https://${host}${path}${queryString ? '?' + queryString : ''}`, headers: allHeaders }
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
		yield wrapStreamError('meshy/nanobanana api key is not configured')
		return
	}
	let aiModel = String(p.ai_model || p.model || 'nano-banana').trim().toLowerCase()
	if (!['nano-banana', 'nano-banana-pro'].includes(aiModel)) aiModel = 'nano-banana'
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
		const cacheUrls = refCacheIds.map(id => {
			try {
				const files = fs.readdirSync(cacheDir).filter(f => f.includes(String(id)))
				if (files.length > 0) return `file://${path.resolve(cacheDir, files[0])}`
			} catch {}
			return null
		}).filter(Boolean)
		if (cacheUrls.length) body.reference_image_urls = [...(body.reference_image_urls || []), ...cacheUrls].slice(0, 5)
	}
	try {
		yield wrapTaskStatusMsg('Generating image...', 'generating')
		const stream = client.postStream(`${NANOBANANA_API_BASE}/v1/text-to-image`, {
			headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'text/event-stream' },
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
					yield wrapTaskStatusMsg(`Status: ${parsed.status || 'processing'}${pct ? ' ' + pct : ''}...`, 'streaming')
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
	const preset = String(sizePreset || '2K').trim().toUpperCase()
	const ar = String(aspectRatio || '1:1').trim().replace(/\s/g, '')

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
	for (const name of ['seedream', 'bytedance_seedream', 'bytedance_image', 'bytedance_text', 'bytedance', 'doubao']) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) { apiKey = String(r.plaintext).trim(); break }
		} catch {}
	}
	if (!apiKey) {
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

	const quantity = Number.isFinite(Number(p.n)) ? Number(p.n) : (Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : 1)
	const n = Math.min(4, Math.max(1, Math.floor(quantity)))
	const seed = Number(p.seed)
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	const watermark = p.watermark === true || p.watermark === 'true' || p.watermark === 1 || p.watermark === '1'
	const outputFormat = String(p.output_format || p.outputFormat || 'jpeg').trim().toLowerCase()
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

	console.log('[seedream] generating, model=', model, 'size=', size, 'n=', n, 'watermark=', watermark, 'hasRefImages=', hasRefImages, 'is5Model=', is5Model)

	try {
		yield wrapTaskStatusMsg(`正在使用 ${model} 生成图片…`, 'generating')
		const client = getHttpClient()
		const apiPath = `${SEEDREAM_API_BASE}/images/generations`

		const resp = await client.post(apiPath, body, {
			headers: {
				'Authorization': `Bearer ${apiKey}`
			},
			timeout: 120000
		})

		if (!resp.ok) {
			const errMsg = resp.body?.error?.message || resp.body?.message || `HTTP ${resp.status}`
			console.error('[seedream] API error:', resp.status, JSON.stringify(resp.body?.error || resp.body || {}).slice(0, 500))
			throw new Error(errMsg)
		}

		let imageUrls = []
		if (resp.body && Array.isArray(resp.body.data)) {
			imageUrls = resp.body.data.map(item => {
				if (item.url) return item.url
				if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
				return ''
			}).filter(Boolean)
		}

		if (imageUrls.length === 0) {
			yield wrapStreamError('seedream returned no images')
			return
		}

		for (const imgUrl of imageUrls) {
			yield wrapChatMsg({ imageUrl: imgUrl })
		}
		yield wrapDone()
	} catch (err) {
		console.error('[seedream] generation error:', err)
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
	try {
		yield wrapTaskStatusMsg('Generating image with Jimeng...', 'generating')
		const signed = buildJimengSignedRequest({
			accessKeyId,
			secretKey,
			method: 'POST',
			path: '/',
			query: { 'Action': 'CVProcess', 'Version': '2022-08-31' },
			body: JSON.stringify(body)
		})
		const client = getHttpClient()
		const res = await client.post(signed.url, body, {
			headers: signed.headers,
			timeout: 60000
		})
		if (!res.ok) {
			yield wrapStreamError(`HTTP ${res.status}`)
			return
		}
		const result = res.body || {}
		const imageUrl = String(result?.data?.image_url || result?.image_url || result?.url || '').trim()
		if (imageUrl) {
			yield wrapChatMsg({ imageUrl })
		} else {
			yield wrapChatMsg(result)
		}
		yield wrapDone()
	} catch (err) {
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
		const parts = resStr.split('x').map(s => Number(s.trim()))
		if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
			body.width = parts[0]
			body.height = parts[1]
		}
	}
	if (p.width !== undefined) body.width = Number(p.width)
	if (p.height !== undefined) body.height = Number(p.height)
	if (p.seed !== undefined && p.seed !== null) body.seed = Number(p.seed)
	try {
		yield wrapTaskStatusMsg('Generating video with Jimeng...', 'generating')
		const signed = buildJimengSignedRequest({
			accessKeyId,
			secretKey,
			method: 'POST',
			path: '/',
			query: { 'Action': 'CVProcess', 'Version': '2022-08-31' },
			body: JSON.stringify(body)
		})
		const client = getHttpClient()
		const res = await client.post(signed.url, body, {
			headers: signed.headers,
			timeout: 120000
		})
		if (!res.ok) {
			yield wrapStreamError(`HTTP ${res.status}`)
			return
		}
		const result = res.body || {}
		const videoUrl = String(result?.data?.video_url || result?.video_url || result?.url || '').trim()
		if (videoUrl) {
			yield wrapChatMsg({ videoUrl, videoUrlRemote: videoUrl })
		} else {
			yield wrapChatMsg(result)
		}
		yield wrapDone()
	} catch (err) {
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
	const systemPrompt = String(p.systemPrompt || p.system_prompt || '你是DVStudio蓝图助手，帮助用户构建AI工作流。').trim()
	const requestedProvider = String(p.provider || '').toLowerCase().trim()

	const repo = getApiKeyRepo(ctx)

	function getKeyFor(name) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
		return ''
	}

	const providerConfigs = [
		{ prov: 'bytedance', names: ['bytedance_text', 'bytedance', 'doubao', 'seedream'], baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-0-pro-260215' },
		{ prov: 'deepseek', names: ['deepseek'], baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
		{ prov: 'openai', names: ['openai'], baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
	]

	let cfg = null
	let provider = ''
	let apiKey = ''

	if (requestedProvider) {
		for (const pc of providerConfigs) {
			if (pc.prov === requestedProvider || requestedProvider.includes(pc.prov) || pc.names.some(n => requestedProvider.includes(n))) {
				for (const name of pc.names) {
					const k = getKeyFor(name)
					if (k) { cfg = pc; provider = pc.prov; apiKey = k; break }
				}
				if (cfg) break
			}
		}
	}

	if (!cfg) {
		for (const pc of providerConfigs) {
			for (const name of pc.names) {
				const k = getKeyFor(name)
				if (k) { cfg = pc; provider = pc.prov; apiKey = k; break }
			}
			if (cfg) break
		}
	}

	if (!cfg || !apiKey) {
		yield wrapStreamError('No LLM API key configured (bytedance/deepseek/openai)')
		return
	}

	const useModel = String(p.modelId || p.model || cfg.model).trim()
	const chatMessages = [{ role: 'system', content: systemPrompt }]
	const allHistory = history.length > 0 ? history : messages
	for (const m of allHistory) {
		if (m && m.role && m.content) chatMessages.push({ role: m.role, content: String(m.content) })
	}
	chatMessages.push({ role: 'user', content: message })
	let fullContent = ''
	try {
		const client = getHttpClient()
		const stream = client.postStream(`${cfg.baseUrl}/chat/completions`, {
			headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: useModel, messages: chatMessages, stream: true }),
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
		yield wrapDone()
	} catch (err) {
		yield wrapStreamError(String(err?.message || err))
	}
}

export async function blueprintChat(ctx, payload) {
	const p = payload || {}
	const message = String(p.message || p.prompt || p.content || '').trim()
	if (!message) return { ok: false, error: 'message is required' }
	const history = Array.isArray(p.history) ? p.history : []
	const systemPrompt = String(p.systemPrompt || p.system_prompt || '你是DVStudio蓝图助手，帮助用户构建AI工作流。').trim()
	const requestedProvider = String(p.provider || '').toLowerCase().trim()

	const repo = getApiKeyRepo(ctx)

	function getKeyFor(name) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
		return ''
	}

	const providerConfigs = [
		{ prov: 'bytedance', names: ['bytedance_text', 'bytedance', 'doubao', 'seedream'], baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-0-pro-260215' },
		{ prov: 'deepseek', names: ['deepseek'], baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
		{ prov: 'openai', names: ['openai'], baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
	]

	let cfg = null
	for (const pc of providerConfigs) {
		if (requestedProvider && (pc.prov === requestedProvider || requestedProvider.includes(pc.prov) || pc.names.some(n => requestedProvider.includes(n)))) {
			for (const name of pc.names) {
				const k = getKeyFor(name)
				if (k) { cfg = { ...pc, apiKey: k }; break }
			}
			if (cfg) break
		}
	}
	if (!cfg) {
		for (const pc of providerConfigs) {
			for (const name of pc.names) {
				const k = getKeyFor(name)
				if (k) { cfg = { ...pc, apiKey: k }; break }
			}
			if (cfg) break
		}
	}
	if (!cfg) return { ok: false, error: 'No LLM API key configured (bytedance/deepseek/openai)' }

	const useModel = String(p.modelId || p.model || cfg.model).trim()
	const chatMessages = [{ role: 'system', content: systemPrompt }]
	for (const m of history) {
		if (m && m.role && m.content) chatMessages.push({ role: m.role, content: String(m.content) })
	}
	chatMessages.push({ role: 'user', content: message })

	try {
		const client = getHttpClient()
		const res = await client.post(`${cfg.baseUrl}/chat/completions`, {
			model: useModel,
			messages: chatMessages,
			stream: false
		}, {
			headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
			timeout: 120000
		})
		if (!res.ok) {
			const errMsg = typeof res.body === 'object' && res.body?.error
				? String(res.body.error.message || JSON.stringify(res.body.error))
				: `HTTP ${res.status}`
			return { ok: false, error: errMsg, status: res.status }
		}
		const assistant = String(res.body?.choices?.[0]?.message?.content || '').trim()
		return { ok: true, assistant, model: useModel }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}
