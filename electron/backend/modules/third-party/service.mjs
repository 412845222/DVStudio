import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { internalError, invalidParamsError, upstreamError } from '../../core/errors.mjs'
import { getHttpClient } from '../../core/http-client.mjs'
import { getLocalDbFilePath } from '../../../localdb/db.mjs'

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
	const result = []
	for (const img of images) {
		if (!img) continue
		const data = typeof img === 'string' ? img : img.data
		const name = typeof img === 'object' ? img.name : ''
		const saved = saveBase64Image(cacheDir, data, name)
		result.push({ url: `file://${saved.filePath}`, path: saved.filePath, hash: saved.hash })
	}
	for (const f of files) {
		const fp = String(f?.path || f?.filePath || '').trim()
		if (fp && fs.existsSync(fp)) {
			const hash = sha256Hex(fs.readFileSync(fp)).slice(0, 16)
			const ext = path.extname(fp) || '.png'
			const dest = path.resolve(cacheDir, `${hash}${ext}`)
			if (!fs.existsSync(dest)) fs.copyFileSync(fp, dest)
			result.push({ url: `file://${dest}`, path: dest, hash })
		}
	}
	return { ok: true, refs: result }
}

export function seedreamRefCache(ctx, payload) {
	const p = payload || {}
	const images = Array.isArray(p.images) ? p.images : []
	const files = Array.isArray(p.files) ? p.files : []
	if (!images.length && !files.length) throw invalidParamsError('images or files are required')
	const cacheDir = getCacheDir(ctx, 'seedream')
	const result = []
	for (const img of images) {
		if (!img) continue
		const data = typeof img === 'string' ? img : img.data
		const name = typeof img === 'object' ? img.name : ''
		const saved = saveBase64Image(cacheDir, data, name)
		result.push({ url: `file://${saved.filePath}`, path: saved.filePath, hash: saved.hash })
	}
	for (const f of files) {
		const fp = String(f?.path || f?.filePath || '').trim()
		if (fp && fs.existsSync(fp)) {
			const hash = sha256Hex(fs.readFileSync(fp)).slice(0, 16)
			const ext = path.extname(fp) || '.png'
			const dest = path.resolve(cacheDir, `${hash}${ext}`)
			if (!fs.existsSync(dest)) fs.copyFileSync(fp, dest)
			result.push({ url: `file://${dest}`, path: dest, hash })
		}
	}
	return { ok: true, refs: result }
}

export async function nanobananaGenerate(ctx, payload) {
	const client = getHttpClient()
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) throw invalidParamsError('prompt is required')
	let apiKey = getKey(ctx, 'meshy')
	if (!apiKey) apiKey = getKey(ctx, 'nanobanana')
	if (!apiKey) throw invalidParamsError('meshy/nanobanana api key is not configured')
	let aiModel = String(p.ai_model || p.model || 'nano-banana').trim().toLowerCase()
	if (!['nano-banana', 'nano-banana-pro'].includes(aiModel)) aiModel = 'nano-banana'
	const body = { prompt, ai_model: aiModel }
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || '').trim()
	if (aspectRatio) body.aspect_ratio = aspectRatio
	const refs = Array.isArray(p.reference_image_urls) ? p.reference_image_urls.filter(Boolean) : []
	if (refs.length) body.reference_image_urls = refs.slice(0, 5)
	const negativePrompt = String(p.negative_prompt || p.negativePrompt || '').trim()
	if (negativePrompt) body.negative_prompt = negativePrompt
	const seed = p.seed
	if (seed !== undefined && seed !== null) body.seed = seed
	const res = await client.post(`${NANOBANANA_API_BASE}/v1/text-to-image`, body, {
		headers: { 'Authorization': `Bearer ${apiKey}` },
		timeout: 60000
	})
	if (!res.ok) {
		const errMsg = typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
		throw upstreamError(`nanobanana generate failed: ${errMsg}`)
	}
	return { ok: true, raw: res.body }
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
		yield JSON.stringify({ type: 'error', error: 'prompt is required' })
		return
	}
	let apiKey = getKey(ctx, 'meshy')
	if (!apiKey) apiKey = getKey(ctx, 'nanobanana')
	if (!apiKey) {
		yield JSON.stringify({ type: 'error', error: 'meshy/nanobanana api key is not configured' })
		return
	}
	let aiModel = String(p.ai_model || p.model || 'nano-banana').trim().toLowerCase()
	if (!['nano-banana', 'nano-banana-pro'].includes(aiModel)) aiModel = 'nano-banana'
	const body = { prompt, ai_model: aiModel, stream: true }
	const aspectRatio = String(p.aspect_ratio || p.aspectRatio || '').trim()
	if (aspectRatio) body.aspect_ratio = aspectRatio
	const refs = Array.isArray(p.reference_image_urls) ? p.reference_image_urls.filter(Boolean) : []
	if (refs.length) body.reference_image_urls = refs.slice(0, 5)
	try {
		const stream = client.postStream(`${NANOBANANA_API_BASE}/v1/text-to-image`, {
			headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'text/event-stream' },
			body: JSON.stringify(body),
			timeout: 120000
		})
		for await (const rawLine of stream) {
			const line = String(rawLine || '').trim()
			if (!line.startsWith('data:')) continue
			const data = line.slice(5).trim()
			if (data === '[DONE]') break
			yield data
		}
	} catch (err) {
		yield JSON.stringify({ type: 'error', error: String(err?.message || err) })
	}
}

export async function* seedreamGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) {
		yield JSON.stringify({ type: 'error', error: 'prompt is required' })
		return
	}
	const apiKey = getKey(ctx, 'seedream')
	if (!apiKey) {
		yield JSON.stringify({ type: 'error', error: 'seedream api key (ark api key) is not configured' })
		return
	}
	const model = String(p.model || p.endpoint_id || 'seedream-3.0').trim()
	const body = {
		model,
		messages: [{ role: 'user', content: prompt }],
		stream: true
	}
	try {
		const client = getHttpClient()
		for await (const evt of streamSse(client, `${SEEDREAM_API_BASE}/chat/completions`, body, { 'Authorization': `Bearer ${apiKey}` })) {
			yield JSON.stringify(evt)
		}
	} catch (err) {
		yield JSON.stringify({ type: 'error', error: String(err?.message || err) })
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
		yield JSON.stringify({ type: 'error', error: 'prompt is required' })
		return
	}
	const { accessKeyId, secretKey } = resolveJimengKeys(ctx)
	if (!accessKeyId || !secretKey) {
		yield JSON.stringify({ type: 'error', error: 'jimeng access key / secret key is not configured' })
		return
	}
	const reqKey = String(p.req_key || 'high_aes').trim()
	const body = {
		req_key: reqKey,
		prompt,
		return_url: true
	}
	if (p.width) body.width = Number(p.width)
	if (p.height) body.height = Number(p.height)
	if (p.seed !== undefined) body.seed = Number(p.seed)
	const refImages = Array.isArray(p.ref_images) ? p.ref_images.filter(Boolean) : []
	if (refImages.length) body.ref_images = refImages
	try {
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
			yield JSON.stringify({ type: 'error', error: `HTTP ${res.status}` })
			return
		}
		yield JSON.stringify({ type: 'result', data: res.body })
	} catch (err) {
		yield JSON.stringify({ type: 'error', error: String(err?.message || err) })
	}
}

export async function* jimengVideoGenerateStream(ctx, payload) {
	const p = payload || {}
	const prompt = String(p.prompt || '').trim()
	if (!prompt) {
		yield JSON.stringify({ type: 'error', error: 'prompt is required' })
		return
	}
	const { accessKeyId, secretKey } = resolveJimengKeys(ctx)
	if (!accessKeyId || !secretKey) {
		yield JSON.stringify({ type: 'error', error: 'jimeng access key / secret key is not configured' })
		return
	}
	const reqKey = String(p.req_key || 'jimeng_video_gen').trim()
	const body = {
		req_key: reqKey,
		prompt,
		return_url: true
	}
	if (p.duration) body.duration = Number(p.duration)
	if (p.aspect_ratio) body.aspect_ratio = String(p.aspect_ratio)
	try {
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
			yield JSON.stringify({ type: 'error', error: `HTTP ${res.status}` })
			return
		}
		yield JSON.stringify({ type: 'result', data: res.body })
	} catch (err) {
		yield JSON.stringify({ type: 'error', error: String(err?.message || err) })
	}
}

export async function* blueprintChatStream(ctx, payload) {
	const p = payload || {}
	const message = String(p.message || p.prompt || '').trim()
	if (!message) {
		yield JSON.stringify({ type: 'error', error: 'message is required' })
		return
	}
	const messages = Array.isArray(p.messages) ? p.messages : []
	const systemPrompt = String(p.systemPrompt || p.system_prompt || '你是DVStudio蓝图助手，帮助用户构建AI工作流。').trim()
	const { provider, apiKey } = (() => {
		const repo = getApiKeyRepo(ctx)
		let provider = 'deepseek', apiKey = ''
		for (const prov of ['deepseek', 'openai']) {
			const r = repo.getPlaintext(prov)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) {
				provider = prov
				apiKey = String(r.plaintext).trim()
				break
			}
		}
		return { provider, apiKey }
	})()
	if (!apiKey) {
		yield JSON.stringify({ type: 'error', error: 'No LLM API key configured (deepseek/openai)' })
		return
	}
	const cfg = provider === 'openai'
		? { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
		: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }
	const useModel = String(p.model || cfg.model).trim()
	const chatMessages = [{ role: 'system', content: systemPrompt }]
	for (const m of messages) {
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
					yield JSON.stringify({ type: 'delta', content: delta })
				}
			} catch {}
		}
		yield JSON.stringify({ type: 'done', content: fullContent })
	} catch (err) {
		yield JSON.stringify({ type: 'error', error: String(err?.message || err) })
	}
}
