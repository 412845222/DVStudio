import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { Buffer } from 'node:buffer'
import { URL } from 'node:url'
import { getHttpClient } from '../../core/http-client.mjs'
import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'
import { getRepos } from '../../../localdb/index.mjs'
import { downloadUrlToProjectRoot } from '../../projectAssetProtocol.mjs'
import * as cloudfsService from '../cloudfs/service.mjs'
import { getTaskQueueService } from '../task-queue/handlers.mjs'

const SEEDANCE_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'
const SEEDANCE_2_0_MINI_MODEL = 'doubao-seedance-2-0-mini-260615'
const DEFAULT_TIMEOUT = 120000
const POLL_INTERVAL_MS = 5000
const HEARTBEAT_INTERVAL_MS = 30000

function generateMsgId() {
	return `m-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
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

function tryGetKey(ctx, ...names) {
  const repo = ctx.localdb?.apiKeys
  if (!repo) return ''
  for (const name of names) {
    try {
      const r = repo.getPlaintext(name)
      if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
    } catch {}
  }
  return ''
}

function getApiKey(ctx) {
  const key = tryGetKey(ctx, 'seedance', 'bytedance_seedance', 'bytedance_video', 'bytedance_text', 'bytedance', 'doubao')
  if (!key) throw invalidParamsError('bytedance/seedance api key is not configured')
  return key
}

function getHeaders(apiKey) {
  const key = String(apiKey || '').trim()
  return {
    'Authorization': key.startsWith('Bearer ') ? key : `Bearer ${key}`,
  }
}

function isDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:')
}

function isWebUrl(url) {
  if (typeof url !== 'string') return false
  const str = url.trim().toLowerCase()
  return str.startsWith('http://') || str.startsWith('https://')
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1] || 'application/octet-stream',
    base64: match[2],
  }
}

function getFileExtensionFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase()
  const map = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
  }
  return map[mime] || 'bin'
}

async function uploadBufferToArkFiles(apiKey, buffer, fileName, mimeType, extraFormFields) {
  const url = `${SEEDANCE_API_BASE}/files`
  const boundary = '----ArkFileUpload' + Date.now().toString(16)
  const CRLF = '\r\n'

  const parts = []
  parts.push(Buffer.from(`--${boundary}${CRLF}`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="purpose"${CRLF}${CRLF}`))
  parts.push(Buffer.from('user_data'))

  if (extraFormFields && typeof extraFormFields === 'object') {
    for (const [key, value] of Object.entries(extraFormFields)) {
      if (value === undefined || value === null) continue
      parts.push(Buffer.from(`${CRLF}--${boundary}${CRLF}`))
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`))
      parts.push(Buffer.from(String(value)))
    }
  }

  parts.push(Buffer.from(`${CRLF}--${boundary}${CRLF}`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}`))
  parts.push(Buffer.from(`Content-Type: ${mimeType}${CRLF}${CRLF}`))
  parts.push(buffer)
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`))

  const multipartBody = Buffer.concat(parts)

  const parsedUrl = new URL(url)
  const transport = parsedUrl.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = transport.request({
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
      timeout: 180000,
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        let parsedBody
        try {
          parsedBody = JSON.parse(body)
        } catch {
          parsedBody = body
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsedBody)
        } else {
          let errMsg = `HTTP ${res.statusCode}`
          if (typeof parsedBody === 'object' && parsedBody) {
            errMsg = parsedBody.error?.message || parsedBody.message || errMsg
          }
          reject(new Error(`Ark Files upload failed: ${errMsg}`))
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      reject(new Error(`Ark Files upload failed: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy(new Error('Upload timeout'))
    })

    req.write(multipartBody)
    req.end()
  })
}

async function verifyPublicUrl(url, maxRetries = 3, retryDelayMs = 2000) {
  if (!url || typeof url !== 'string') return false
  const upperUrl = url.toUpperCase()
  if (upperUrl.includes('X-TOS-SIGNATURE=') || upperUrl.includes('SIGNATURE=') || upperUrl.includes('X-OSS-EXPIRES=')) {
    console.log('[seedance] Presigned URL detected, skipping HTTP verification')
    return true
  }
  for (let i = 0; i < maxRetries; i++) {
    try {
      const parsedUrl = new URL(url)
      const transport = parsedUrl.protocol === 'https:' ? https : http
      await new Promise((resolve, reject) => {
        const req = transport.request({
          method: 'GET',
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          timeout: 10000,
        }, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve(true)
          } else {
            reject(new Error(`HTTP ${res.statusCode}`))
          }
          res.resume()
        })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('Timeout')))
        req.end()
      })
      return true
    } catch (err) {
      console.log(`[seedance] URL verification attempt ${i + 1}/${maxRetries} failed: ${err.message}`)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }
  console.warn(`[seedance] WARNING: Could not verify URL accessibility after ${maxRetries} attempts, proceeding anyway`)
  return false
}

async function uploadVideoFileAndGetUrl(ctx, apiKey, fileObj, model) {
  const buffer = Buffer.from(fileObj.data)
  const mimeType = String(fileObj.type || 'video/mp4').trim()
  const ext = getFileExtensionFromMime(mimeType)

  const rawName = String(fileObj.name || `video_${Date.now()}`)
  const baseName = rawName.replace(/\.[^.]+$/, '').replace(/[^\w.\-]/g, '_') || `video_${Date.now()}`
  const fileName = `${baseName}.${ext}`

  const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2)
  console.log(`[seedance] Uploading video (${fileSizeMB} MB) as ${fileName} (${mimeType})...`)

  const cloudfsResult = await cloudfsService.uploadFileToPublicUrl(ctx, {
    data: buffer,
    name: fileName,
    mimeType,
  })

  if (!cloudfsResult.ok || !cloudfsResult.publicUrl) {
    const errorMsg = cloudfsResult.error || 'Unknown error'
    console.warn('[seedance] CloudFS upload failed:', errorMsg)
    if (errorMsg.includes('No active cloud storage') || errorMsg.includes('not found') || errorMsg.includes('active')) {
      throw new Error('云存储未配置默认桶，请先在云存储页面选择一个桶作为默认上传桶')
    }
    throw new Error(`云存储上传失败: ${errorMsg}`)
  }

  const providerName = cloudfsResult.providerName || '云存储'
  console.log(`[seedance] Video uploaded via CloudFS (${providerName}), verifying...`)
  await new Promise(resolve => setTimeout(resolve, 1500))
  await verifyPublicUrl(cloudfsResult.publicUrl)
  console.log(`[seedance] Video uploaded via CloudFS: ${cloudfsResult.publicUrl.slice(0, 120)}...`)
  return { url: cloudfsResult.publicUrl, source: 'cloudfs', providerName }
}

function createTaskWithJson(client, apiKey, createPayload) {
  const createUrl = `${SEEDANCE_API_BASE}/contents/generations/tasks`
  return client.post(createUrl, createPayload, {
    headers: getHeaders(apiKey),
    timeout: DEFAULT_TIMEOUT,
  })
}

async function waitForFileReady(apiKey, fileId, maxWaitMs = 60000, pollIntervalMs = 2000) {
  const startTime = Date.now()
  const url = `${SEEDANCE_API_BASE}/files/${encodeURIComponent(fileId)}`
  const client = getHttpClient()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await client.get(url, {
        headers: getHeaders(apiKey),
        timeout: 30000,
      })
      if (res.ok && res.body) {
        const status = String(res.body.status || '').toLowerCase()
        if (status === 'active' || status === 'processed' || status === 'ready' || status === 'uploaded') {
          return res.body
        }
        if (status === 'error' || status === 'failed') {
          throw new Error(`File processing failed: ${JSON.stringify(res.body)}`)
        }
      }
    } catch (err) {
      console.warn(`[seedance] error checking file status: ${err.message}`)
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error(`File ${fileId} processing timeout after ${maxWaitMs}ms`)
}

async function ensureWebUrl(ctx, urlOrData, index, kind) {
  if (isWebUrl(urlOrData)) {
    return urlOrData
  }

  if (isDataUrl(urlOrData)) {
    if (kind === 'image' || kind === 'audio') {
      return urlOrData
    }
    throw new Error(`Video data URL is not supported for ${kind} #${index + 1}, video must be uploaded as file`)
  }

  return String(urlOrData || '').trim()
}

async function ensureWebUrls(ctx, urls, kind) {
  if (!Array.isArray(urls) || urls.length === 0) return []
  const result = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    if (!url) continue
    const webUrl = await ensureWebUrl(ctx, url, i, kind)
    if (webUrl) result.push(webUrl)
  }
  return result
}

function coerceInt(v, defaultValue, minValue, maxValue) {
  try {
    const n = parseInt(String(v).trim(), 10)
    if (!Number.isFinite(n)) return defaultValue
    return Math.max(minValue, Math.min(maxValue, n))
  } catch {
    return defaultValue
  }
}

function truthy(v) {
  if (v === true || v === 1) return true
  const s = String(v || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(s)
}

function extractVideoUrls(obj) {
  if (!obj || typeof obj !== 'object') return { videoUrl: '', lastFrameUrl: '' }
  // 1. content 对象（产物阶段）
  const content = typeof obj.content === 'object' && !Array.isArray(obj.content) ? obj.content : null
  if (content) {
    const v = String(content.video_url || content.videoUrl || '').trim()
    const l = String(content.last_frame_url || content.lastFrameUrl || '').trim()
    if (v || l) return { videoUrl: v, lastFrameUrl: l }
  }
  // 2. result 对象
  const result = typeof obj.result === 'object' && !Array.isArray(obj.result) ? obj.result : null
  if (result) {
    const v = String(result.video_url || result.videoUrl || result.video || '').trim()
    const l = String(result.last_frame_url || result.lastFrameUrl || '').trim()
    if (v || l) return { videoUrl: v, lastFrameUrl: l }
  }
  // 3. 顶层字段
  const tv = String(obj.video_url || obj.videoUrl || obj.video || '').trim()
  const tl = String(obj.last_frame_url || obj.lastFrameUrl || '').trim()
  if (tv || tl) return { videoUrl: tv, lastFrameUrl: tl }
  // 4. content 数组中可能包含产物 URL（某些返回格式）
  if (Array.isArray(obj.content)) {
    for (const item of obj.content) {
      if (item && typeof item === 'object') {
        const v = String(item.video_url || item.videoUrl || item.video || '').trim()
        const l = String(item.last_frame_url || item.lastFrameUrl || '').trim()
        if (v || l) return { videoUrl: v, lastFrameUrl: l }
      }
    }
  }
  return { videoUrl: '', lastFrameUrl: '' }
}

function extractPrompt(obj) {
  if (!obj || typeof obj !== 'object') return ''
  // 1. 直接字段
  if (typeof obj.prompt === 'string' && obj.prompt.trim()) return obj.prompt.trim()
  // 2. content 数组（原始请求格式）
  if (Array.isArray(obj.content)) {
    const textItem = obj.content.find(c => c && c.type === 'text' && typeof c.text === 'string')
    if (textItem?.text?.trim()) return textItem.text.trim()
  }
  // 3. content.text（某些响应格式）
  if (obj.content && typeof obj.content === 'object') {
    if (typeof obj.content.text === 'string' && obj.content.text.trim()) return obj.content.text.trim()
    if (typeof obj.content.prompt === 'string' && obj.content.prompt.trim()) return obj.content.prompt.trim()
  }
  // 4. request / requestPayload 嵌套
  const req = obj.request || obj.requestPayload
  if (req && typeof req === 'object') {
    if (typeof req.prompt === 'string' && req.prompt.trim()) return req.prompt.trim()
    if (Array.isArray(req.content)) {
      const textItem = req.content.find(c => c && c.type === 'text' && typeof c.text === 'string')
      if (textItem?.text?.trim()) return textItem.text.trim()
    }
    if (req.content && typeof req.content === 'object') {
      if (typeof req.content.text === 'string' && req.content.text.trim()) return req.content.text.trim()
      if (typeof req.content.prompt === 'string' && req.content.prompt.trim()) return req.content.prompt.trim()
    }
  }
  return ''
}

function extractUsageText(obj) {
  const usage = obj && typeof obj.usage === 'object' ? obj.usage : null
  if (!usage) return null
  const parts = []
  if (typeof usage.total_tokens === 'number') parts.push(`total=${usage.total_tokens}`)
  if (typeof usage.completion_tokens === 'number') parts.push(`completion=${usage.completion_tokens}`)
  return parts.length ? `tokens: ${parts.join(', ')}` : null
}

function normalizeSeedanceStatus(raw) {
  const s = String(raw || 'queued').trim().toLowerCase()
  if (s === 'success' || s === 'completed' || s === 'processed' || s === 'ready' || s === 'active') return 'succeeded'
  if (s === 'processing' || s === 'in_progress') return 'running'
  if (s === 'error' || s === 'expired') return 'failed'
  if (s === 'cancelled' || s === 'canceled') return 'canceled'
  return s
}

function extractSeedanceErrorMessage(taskObj, status) {
  const s = String(status || '').trim().toLowerCase()
  if (!['failed', 'error'].includes(s)) return ''
  const err = taskObj?.error
  if (!err) return `status=${s}`
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    if (err.message) return String(err.message)
    if (err.code) return `Error ${err.code}: ${JSON.stringify(err)}`
    try { return JSON.stringify(err) } catch { return String(err) }
  }
  return String(err)
}

function parseSeedanceTimestamp(val) {
  if (!val) return null
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000
  if (typeof val === 'string') {
    const ms = new Date(val).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function buildContent(prompt, refImageUrls, refMode, refVideoUrls, refAudioUrls) {
  const content = []
  const text = String(prompt || '').trim()
  if (text) {
    content.push({ type: 'text', text })
  }

  const mode = String(refMode || 'auto').trim().toLowerCase()

  if (Array.isArray(refImageUrls) && refImageUrls.length > 0) {
    const urls = refImageUrls.map(u => String(u || '').trim()).filter(u => u)
    if (urls.length > 0) {
      if (mode === 'first-last' && urls.length >= 2) {
        content.push({ type: 'image_url', image_url: { url: urls[0] }, role: 'first_frame' })
        content.push({ type: 'image_url', image_url: { url: urls[1] }, role: 'last_frame' })
      } else if (mode === 'first') {
        content.push({ type: 'image_url', image_url: { url: urls[0] }, role: 'first_frame' })
      } else if (mode === 'reference' || mode === 'video_edit') {
        for (const url of urls.slice(0, 9)) {
          content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
        }
      } else {
        if (urls.length === 1) {
          content.push({ type: 'image_url', image_url: { url: urls[0] }, role: 'first_frame' })
        } else {
          for (const url of urls.slice(0, 9)) {
            content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
          }
        }
      }
    }
  }

  if (Array.isArray(refVideoUrls) && refVideoUrls.length > 0) {
    const urls = refVideoUrls.map(u => String(u || '').trim()).filter(u => u)
    if (urls.length > 0) {
      if (mode === 'video_edit') {
        content.push({ type: 'video_url', video_url: { url: urls[0] }, role: 'input_video' })
        for (const url of urls.slice(1, 3)) {
          content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
        }
      } else {
        for (const url of urls.slice(0, 3)) {
          content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
        }
      }
    }
  }

  if (Array.isArray(refAudioUrls) && refAudioUrls.length > 0) {
    const urls = refAudioUrls.map(u => String(u || '').trim()).filter(u => u)
    for (const url of urls.slice(0, 3)) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
    }
  }

  return content
}

function msToIsoString(ms) {
  const v = Number(ms)
  if (!Number.isFinite(v) || v <= 0) return new Date().toISOString()
  return new Date(v).toISOString()
}

function serializeVideoTask(row) {
  if (!row) return null
  return {
    id: row.id,
    taskId: row.remoteTaskId,
    provider: row.provider || 'seedance',
    model: row.model || DEFAULT_MODEL,
    taskType: row.taskType || '',
    source: row.source || '',
    status: row.status || 'idle',
    prompt: row.prompt || '',
    ratio: row.ratio || '',
    resolution: row.resolution || '',
    duration: Number(row.duration) || 0,
    seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
    generateAudio: Boolean(row.generateAudio),
    watermark: Boolean(row.watermark),
    cameraFixed: Boolean(row.cameraFixed),
    returnLastFrame: Boolean(row.returnLastFrame),
    enableWebSearch: Boolean(row.enableWebSearch),
    priority: Number(row.priority) || 0,
    serviceTier: row.serviceTier || '',
    tools: Array.isArray(row.tools) ? row.tools : [],
    usage: row.usage && typeof row.usage === 'object' ? row.usage : {},
    videoUrlRemote: row.videoUrlRemote || '',
    videoUrlLocal: row.videoUrlLocal || '',
    videoSourcePathLocal: row.videoSourcePathLocal || '',
    lastFrameUrlRemote: row.lastFrameUrlRemote || '',
    lastFrameUrlLocal: row.lastFrameUrlLocal || '',
    lastFrameSourcePathLocal: row.lastFrameSourcePathLocal || '',
    downloadStatus: row.downloadStatus || 'idle',
    downloadProgress: Number(row.downloadProgress) || 0,
    downloadError: row.downloadError || '',
    errorMessage: row.errorMessage || '',
    statusText: row.statusText || '',
    projectId: row.projectId ?? null,
    remoteCreatedAt: row.remoteCreatedAt ?? null,
    remoteUpdatedAt: row.remoteUpdatedAt ?? null,
    requestPayload: row.requestPayload && typeof row.requestPayload === 'object' ? row.requestPayload : {},
    responsePayload: row.responsePayload && typeof row.responsePayload === 'object' ? row.responsePayload : {},
    refImageUrls: Array.isArray(row.refImageUrls) ? row.refImageUrls : [],
    refVideoUrls: Array.isArray(row.refVideoUrls) ? row.refVideoUrls : [],
    refAudioUrls: Array.isArray(row.refAudioUrls) ? row.refAudioUrls : [],
    createdAt: msToIsoString(row.createdAt),
    updatedAt: msToIsoString(row.updatedAt),
    syncedAt: msToIsoString(row.syncedAt || row.updatedAt),
  }
}

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

export async function* generateVideoStream(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  // 提前声明任务队列服务与全局任务ID，避免后续分支中引用undefined导致"tq is undefined"
  const tq = (() => {
    try {
      return getTaskQueueService() ?? null
    } catch (e) {
      console.warn('[seedance] getTaskQueueService failed, degrading:', e?.message || e)
      return null
    }
  })()
  let globalTaskId = null

  const prompt = String(payload?.prompt || '').trim()
  const model = String(payload?.model || payload?.endpoint_id || payload?.videoModel || '').trim()
  if (!model) {
    yield wrapStreamError('model is required (videoModel/endpoint_id not provided)')
    return
  }

  const ratioRaw = String(payload?.ratio || payload?.aspect_ratio || payload?.aspectRatio || 'auto').trim() || 'auto'
  const ratio = ratioRaw === 'adaptive' ? 'auto' : ratioRaw
  const resolution = String(payload?.resolution || '720p').trim() || '720p'
  let duration = null
  let frames = null
  if (payload?.duration !== undefined && payload?.duration !== null && String(payload.duration).trim() !== '') {
    duration = coerceInt(payload.duration, 5, 4, 15)
  }
  if (payload?.frames) {
    try {
      const n = parseInt(String(payload.frames), 10)
      if (n >= 29 && n <= 289 && ((n - 25) % 4 === 0)) {
        frames = n
      }
    } catch {}
  }
  if (duration === null && frames === null) duration = 5

  let seed = null
  if (payload?.seed !== undefined && payload?.seed !== null && String(payload.seed).trim() !== '') {
    try {
      const s = parseInt(String(payload.seed), 10)
      if (Number.isFinite(s) && s >= 0) seed = s
    } catch {}
  }
  const generateAudio = truthy(payload?.generateAudio ?? payload?.generate_audio ?? true)
  const watermark = truthy(payload?.watermark)
  const cameraFixed = truthy(payload?.cameraFixed ?? payload?.camera_fixed ?? false)
  const returnLastFrame = truthy(payload?.returnLastFrame ?? payload?.return_last_frame ?? false)
  const enableWebSearch = truthy(payload?.enableWebSearch ?? payload?.enable_web_search ?? false)
  const priorityRaw = Number(payload?.priority ?? 0)
  const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.min(9, Math.floor(priorityRaw))) : 0
  const refMode = String(payload?.refMode || 'auto').trim().toLowerCase() || 'auto'
  const source = String(payload?.source || 'bottom-chat').trim() || 'bottom-chat'
  const projectId = payload?.projectId ? Number(payload.projectId) || null : null
  const clientRequestIdRaw = String(payload?.clientRequestId || '').trim()
  // 兜底：当前端漏传clientRequestId时自动生成一个，确保任务队列总能注册，避免"tq is undefined"
  const effectiveClientRequestId = clientRequestIdRaw
    || `seedance-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const clientRequestId = clientRequestIdRaw
  const nodeId = String(payload?.nodeId || '').trim()

  let refImageUrls = []
  if (Array.isArray(payload?.imageUrls)) {
    refImageUrls = payload.imageUrls.map(u => String(u || '').trim()).filter(u => u)
  } else if (Array.isArray(payload?.refImages)) {
    refImageUrls = payload.refImages.map(u => String(u || '').trim()).filter(u => u)
  } else if (Array.isArray(payload?.ref_images)) {
    refImageUrls = payload.ref_images.map(u => {
      if (typeof u === 'string') return u.trim()
      if (u && typeof u.data === 'string') return u.data.trim()
      if (u && typeof u.url === 'string') return u.url.trim()
      return ''
    }).filter(u => u)
  }

  const videoFileObjects = []
  let refVideoUrls = []
  const collectVideoItem = (u) => {
    if (u && typeof u === 'object' && u.__file === true) {
      videoFileObjects.push(u)
      return
    }
    if (typeof u === 'string') {
      const s = u.trim()
      if (s) refVideoUrls.push(s)
    }
  }
  if (Array.isArray(payload?.videoUrls)) {
    payload.videoUrls.forEach(collectVideoItem)
  } else if (Array.isArray(payload?.refVideos)) {
    payload.refVideos.forEach(collectVideoItem)
  } else if (Array.isArray(payload?.ref_videos)) {
    payload.ref_videos.forEach(u => {
      if (u && typeof u === 'object' && u.__file === true) {
        videoFileObjects.push(u)
        return
      }
      if (typeof u === 'string') {
        const s = u.trim()
        if (s) refVideoUrls.push(s)
      } else if (u && typeof u.data === 'string') {
        const s = u.data.trim()
        if (s) refVideoUrls.push(s)
      } else if (u && typeof u.url === 'string') {
        const s = u.url.trim()
        if (s) refVideoUrls.push(s)
      }
    })
  }

  let refAudioUrls = []
  if (Array.isArray(payload?.audioUrls)) {
    refAudioUrls = payload.audioUrls.map(u => String(u || '').trim()).filter(u => u)
  } else if (Array.isArray(payload?.refAudios)) {
    refAudioUrls = payload.refAudios.map(u => String(u || '').trim()).filter(u => u)
  } else if (Array.isArray(payload?.ref_audios)) {
    refAudioUrls = payload.ref_audios.map(u => {
      if (typeof u === 'string') return u.trim()
      if (u && typeof u.data === 'string') return u.data.trim()
      if (u && typeof u.url === 'string') return u.url.trim()
      return ''
    }).filter(u => u)
  }

  const hasRefImages = refImageUrls.length > 0
  const hasRefVideos = refVideoUrls.length > 0 || videoFileObjects.length > 0
  const hasRefAudios = refAudioUrls.length > 0

  if (!prompt && !hasRefImages && !hasRefVideos) {
    yield wrapStreamError('prompt or reference images/videos are required')
    return
  }

  if (hasRefAudios && !hasRefImages && !hasRefVideos) {
    yield wrapStreamError('reference audio must be accompanied by reference image or video')
    return
  }

  yield wrapTaskStatusMsg('Seedance：创建任务中…', 'generating')

  try {
    const [uploadedImageUrls, uploadedVideoStrUrls, uploadedAudioUrls] = await Promise.all([
      ensureWebUrls(ctx, refImageUrls, 'image'),
      ensureWebUrls(ctx, refVideoUrls, 'video'),
      ensureWebUrls(ctx, refAudioUrls, 'audio'),
    ])

    const uploadedVideoFileUrls = []
    const videoUploadSources = []
    for (let i = 0; i < videoFileObjects.length; i++) {
      const fileObj = videoFileObjects[i]
      const fileSizeMB = (Buffer.from(fileObj.data).length / 1024 / 1024).toFixed(2)
      
      yield wrapTaskStatusMsg(`Seedance：准备参考视频 ${i + 1}/${videoFileObjects.length}（${fileSizeMB} MB）…`, 'generating')
      yield wrapTaskStatusMsg(`Seedance：正在上传参考视频到您的云存储（${fileSizeMB} MB）…`, 'generating')
      
      const uploadResult = await uploadVideoFileAndGetUrl(ctx, apiKey, fileObj, model)
      uploadedVideoFileUrls.push(uploadResult.url)
      videoUploadSources.push({ source: uploadResult.source, providerName: uploadResult.providerName })
      
      yield wrapTaskStatusMsg(`Seedance：参考视频上传完成，正在验证访问权限…`, 'generating')
    }

    const allVideoRefs = [...uploadedVideoStrUrls, ...uploadedVideoFileUrls]

    console.log('[seedance] files prepared: images=', uploadedImageUrls.length, 'videos(string)=', uploadedVideoStrUrls.length, 'videos(file)=', videoFileObjects.length, 'audios=', uploadedAudioUrls.length)

    const content = buildContent(prompt, uploadedImageUrls, refMode, allVideoRefs, uploadedAudioUrls)
    const createPayload = {
      model,
      content,
      ratio,
      resolution,
      watermark,
      generate_audio: generateAudio,
      camera_fixed: cameraFixed,
      return_last_frame: returnLastFrame,
      enable_web_search: enableWebSearch,
      priority,
    }
    if (frames !== null) createPayload.frames = frames
    else if (duration !== null) createPayload.duration = duration
    if (seed !== null) createPayload.seed = seed

    console.log('[seedance] creating task, model=', model, 'ratio=', ratio, 'resolution=', resolution, 'duration=', duration, 'hasRefImages=', hasRefImages, 'hasRefVideos=', hasRefVideos, 'hasRefAudios=', hasRefAudios, 'refMode=', refMode, 'generateAudio=', generateAudio)
    const contentForLog = content.map(item => {
      const copy = { ...item }
      if (copy.image_url?.url && typeof copy.image_url.url === 'string' && copy.image_url.url.startsWith('data:')) {
        copy.image_url = { ...copy.image_url, url: copy.image_url.url.slice(0, 50) + '...[base64 truncated]' }
      }
      if (copy.audio_url?.url && typeof copy.audio_url.url === 'string' && copy.audio_url.url.startsWith('data:')) {
        copy.audio_url = { ...copy.audio_url, url: copy.audio_url.url.slice(0, 50) + '...[base64 truncated]' }
      }
      return copy
    })
    console.log('[seedance] content array:', JSON.stringify(contentForLog, null, 2))

    const createRes = await createTaskWithJson(client, apiKey, createPayload)

    if (!createRes.ok) {
      let errMsg = `HTTP ${createRes.status}`
      if (createRes.body) {
        if (createRes.body.error?.message) errMsg = createRes.body.error.message
        else if (createRes.body.message) errMsg = createRes.body.message
        else if (typeof createRes.body === 'object') errMsg = JSON.stringify(createRes.body).slice(0, 500)
        else if (typeof createRes.body === 'string') errMsg = createRes.body.slice(0, 500)
      }
      console.error('[seedance] create task failed:', createRes.status, JSON.stringify(createRes.body?.error || createRes.body || {}).slice(0, 500))
      throw new Error(`Seedance create task failed: ${errMsg}`)
    }

    const createObj = createRes.body || {}
    const taskId = String(createObj.id || '').trim()
    if (!taskId) {
      throw new Error(`Seedance create task failed: invalid response ${JSON.stringify(createObj).slice(0, 500)}`)
    }

    if (tq && effectiveClientRequestId) {
      try {
        const regResult = tq.registerTask({
          provider: 'seedance',
          category: 'video',
          projectId,
          nodeId: nodeId || null,
          clientRequestId: effectiveClientRequestId,
          remoteTaskId: taskId,
          title: (prompt || '').slice(0, 50) || 'Seedance视频生成',
          prompt,
          status: 'running',
          progress: 10,
          statusText: 'Seedance：任务已创建，等待生成…',
          canCancel: false,
        })
        if (regResult?.ok && regResult.task) {
          globalTaskId = regResult.task.id
        }
      } catch (tqErr) {
        console.warn('[seedance] Failed to register with task queue:', tqErr?.message || tqErr)
      }
    }

    const finalVideoUrls = [...uploadedVideoStrUrls, ...uploadedVideoFileUrls]

    let taskType = 'text-to-video'
    if (hasRefVideos) taskType = 'video-to-video'
    else if (hasRefImages) taskType = 'image-to-video'

    repo.upsert({
      remoteTaskId: taskId,
      provider: 'seedance',
      model,
      taskType,
      source,
      status: 'queued',
      prompt,
      ratio,
      resolution,
      duration: duration || frames || 0,
      seed,
      generateAudio,
      watermark,
      cameraFixed,
      returnLastFrame,
      enableWebSearch,
      priority,
      requestPayload: createPayload,
      responsePayload: createObj,
      videoUrlRemote: '',
      videoUrlLocal: '',
      lastFrameUrlRemote: '',
      lastFrameUrlLocal: '',
      downloadStatus: 'idle',
      downloadProgress: 0,
      errorMessage: '',
      statusText: 'Seedance：任务已创建，等待生成',
      projectId,
      remoteCreatedAt: Date.now(),
      remoteUpdatedAt: Date.now(),
      refImageUrls: uploadedImageUrls,
      refVideoUrls: finalVideoUrls,
      refAudioUrls: uploadedAudioUrls,
    })

    recordArkTask({
      taskId: `seedance-${taskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model,
      status: 'queued',
      prompt,
      statusText: 'Seedance：任务已创建，等待生成',
      requestPayload: createPayload,
      responsePayload: createObj,
      projectId,
      remoteTaskId: taskId,
    })

    yield wrapTaskStatusMsg(`Seedance：任务已创建（${taskId}），等待生成…`, 'streaming')

    const startTime = Date.now()
    let billingText = null
    let lastHeartbeatAt = 0

    while (true) {
      const taskUrl = `${SEEDANCE_API_BASE}/contents/generations/tasks/${encodeURIComponent(taskId)}`
      const taskRes = await client.get(taskUrl, {
        headers: getHeaders(apiKey),
        timeout: DEFAULT_TIMEOUT,
      })

      if (!taskRes.ok) {
        if (taskRes.status === 404) throw new Error('Seedance task not found')
        throw new Error(`Seedance get task failed: HTTP ${taskRes.status}`)
      }

      const taskObj = taskRes.body || {}
      const status = String(taskObj.status || '').trim().toLowerCase()

      if (status === 'succeeded' || status === 'success') {
        const { videoUrl, lastFrameUrl } = extractVideoUrls(taskObj)
        if (!videoUrl) throw new Error('Seedance succeeded but content.video_url is empty')

        billingText = extractUsageText(taskObj) || billingText

        repo.upsert({
          remoteTaskId: taskId,
          status,
          videoUrlRemote: videoUrl,
          lastFrameUrlRemote: lastFrameUrl,
          statusText: 'Seedance：完成',
          errorMessage: '',
          usage: taskObj.usage || null,
          responsePayload: taskObj,
          remoteUpdatedAt: Date.now(),
        })

        const resultUrls = [videoUrl]
        if (lastFrameUrl) resultUrls.push(lastFrameUrl)
        recordArkTask({
          taskId: `seedance-${taskId}`,
          provider: 'bytedance',
          apiType: 'seedance',
          apiAction: 'video_generation',
          model,
          status: 'succeeded',
          prompt,
          resultUrls,
          thumbnailUrl: lastFrameUrl || videoUrl,
          statusText: 'Seedance：完成',
          responsePayload: taskObj,
          projectId,
          remoteTaskId: taskId,
        })

        const outPayload = {
          taskId,
          videoUrl,
          videoUrlLocal: '',
          videoUrlRemote: videoUrl,
          videoSourcePath: '',
          lastFrameUrl,
          lastFrameUrlLocal: '',
          lastFrameUrlRemote: lastFrameUrl,
          lastFrameSourcePath: '',
          downloadStatus: 'idle',
          downloadProgress: 0,
          downloadError: '',
          model,
          status,
        }
        if (billingText) outPayload.billing = billingText

        if (globalTaskId) {
          try {
            tq?.completeTask(globalTaskId, {
              resultUrl: videoUrl,
              coverUrl: lastFrameUrl || videoUrl,
              statusText: 'Seedance：完成',
              resultAssets: [
                { type: 'video', url: videoUrl, thumbnailUrl: lastFrameUrl || videoUrl },
                ...(lastFrameUrl ? [{ type: 'image', url: lastFrameUrl, thumbnailUrl: lastFrameUrl }] : []),
              ],
              nodeId: nodeId || null,
              projectId,
            })
          } catch (tqErr) {
            console.warn('[seedance] Failed to complete task in queue:', tqErr?.message || tqErr)
          }
        }

        yield wrapChatMsg(outPayload)
        yield wrapTaskStatusMsg('Seedance：完成', 'done')
        yield wrapDone()
        return
      }

      if (['failed', 'error', 'expired', 'cancelled'].includes(status)) {
        const errObj = taskObj.error
        const errMsg = errObj
          ? (typeof errObj === 'string' ? errObj : JSON.stringify(errObj))
          : `status=${status}`

        repo.upsert({
          remoteTaskId: taskId,
          status,
          errorMessage: errMsg,
          statusText: `Seedance：${status}`,
          responsePayload: taskObj,
          remoteUpdatedAt: Date.now(),
        })

        recordArkTask({
          taskId: `seedance-${taskId}`,
          provider: 'bytedance',
          apiType: 'seedance',
          apiAction: 'video_generation',
          model,
          status: 'failed',
          prompt,
          errorMessage: errMsg,
          statusText: `Seedance：${status}`,
          responsePayload: taskObj,
          projectId,
          remoteTaskId: taskId,
        })

        if (globalTaskId) {
          try {
            tq?.failTask(globalTaskId, errMsg)
          } catch (tqErr) {
            console.warn('[seedance] Failed to fail task in queue:', tqErr?.message || tqErr)
          }
        }

        throw new Error(`Seedance task failed: ${errMsg}`)
      }

      billingText = extractUsageText(taskObj) || billingText
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      const suffix = billingText ? `；计费：${billingText}` : ''
      const statusMsg = `Seedance：${status || 'running'}（${elapsed}s）${suffix}`
      const runningProgress = Math.min(90, 20 + Math.floor(elapsed / 3))

      repo.upsert({
        remoteTaskId: taskId,
        status: status || 'running',
        statusText: statusMsg,
        usage: taskObj.usage || null,
        responsePayload: taskObj,
        remoteUpdatedAt: Date.now(),
      })

      recordArkTask({
        taskId: `seedance-${taskId}`,
        provider: 'bytedance',
        apiType: 'seedance',
        apiAction: 'video_generation',
        model,
        status: 'running',
        prompt,
        statusText: statusMsg,
        responsePayload: taskObj,
        projectId,
        remoteTaskId: taskId,
      })

      if (globalTaskId) {
        try {
          tq?.updateTask(globalTaskId, {
            status: 'running',
            progress: runningProgress,
            statusText: statusMsg,
          })
        } catch (tqErr) {
          // ignore update errors during polling
        }
      }

      yield wrapTaskStatusMsg(statusMsg, 'streaming')

      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt = Date.now()
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } catch (err) {
    const errMsg = String(err?.message || err || 'unknown error')
    if (globalTaskId) {
      try {
        tq?.failTask(globalTaskId, errMsg)
      } catch (tqErr) {
        // ignore
      }
    }
    yield wrapStreamError(errMsg)
    yield wrapDone()
  }
}

export async function listTasks(ctx, payload) {
  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  let rows = repo.list()

  if (payload?.status) {
    const targetStatus = String(payload.status).trim().toLowerCase()
    rows = rows.filter(item => item.status === targetStatus)
  }
  if (payload?.model) {
    const targetModel = String(payload.model).trim()
    rows = rows.filter(item => item.model === targetModel)
  }

  let items = rows.map(serializeVideoTask).filter(Boolean)

  if (payload?.limit) {
    const limit = Math.max(1, Math.min(200, Number(payload.limit) || 80))
    items = items.slice(0, limit)
  }

  return { ok: true, items }
}

export async function getTaskDetail(ctx, payload) {
  const taskId = String(payload?.taskId || payload?.id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')

  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  const local = repo.getByRemoteTaskId(taskId)
  if (!local) throw notFoundError('seedance task not found')

  const item = serializeVideoTask(local)
  return { ok: true, item }
}

export async function syncTasks(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  const taskId = String(payload?.taskId || payload?.id || '').trim()
  const pageNum = Math.max(1, parseInt(String(payload?.pageNum || 1), 10) || 1)
  const pageSize = Math.max(1, Math.min(100, parseInt(String(payload?.pageSize || 20), 10) || 20))
  const status = String(payload?.status || '').trim()
  const model = String(payload?.model || '').trim()
  const projectId = payload?.projectId ? Number(payload.projectId) || null : null
  const saveMedia = truthy(payload?.saveMedia)

  if (taskId) {
    const taskUrl = `${SEEDANCE_API_BASE}/contents/generations/tasks/${encodeURIComponent(taskId)}`
    const taskRes = await client.get(taskUrl, {
      headers: getHeaders(apiKey),
      timeout: DEFAULT_TIMEOUT,
    })
    if (!taskRes.ok) {
      if (taskRes.status === 404) throw notFoundError('seedance task not found')
      throw upstreamError(`Seedance get task failed: HTTP ${taskRes.status}`)
    }
    const taskObj = taskRes.body || {}
    const remoteStatus = normalizeSeedanceStatus(taskObj.status)
    const { videoUrl, lastFrameUrl } = extractVideoUrls(taskObj)
    const billingText = extractUsageText(taskObj)

    const existing = repo.getByRemoteTaskId(taskId)
    const promptText = extractPrompt(taskObj) || (existing?.prompt || '')
    const remoteCreatedAt = parseSeedanceTimestamp(taskObj.created_at || taskObj.createdAt || taskObj.create_time)

    const upsertPayload = {
      remoteTaskId: taskId,
      provider: 'seedance',
      model: String(taskObj.model || existing?.model || model || DEFAULT_MODEL).trim(),
      taskType: String(taskObj.task_type || existing?.taskType || '').trim(),
      source: 'sync',
      status: remoteStatus,
      prompt: promptText,
      videoUrlRemote: videoUrl || (existing?.videoUrlRemote || ''),
      lastFrameUrlRemote: lastFrameUrl || (existing?.lastFrameUrlRemote || ''),
      errorMessage: extractSeedanceErrorMessage(taskObj, remoteStatus),
      statusText: remoteStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${remoteStatus}`,
      usage: taskObj.usage || existing?.usage || null,
      responsePayload: taskObj,
      projectId: existing?.projectId ?? projectId,
      remoteCreatedAt: remoteCreatedAt || existing?.remoteCreatedAt || null,
      remoteUpdatedAt: Date.now(),
    }
    if (existing?.ratio && !taskObj.ratio) upsertPayload.ratio = existing.ratio
    if (existing?.resolution && !taskObj.resolution) upsertPayload.resolution = existing.resolution
    if (existing?.duration && !taskObj.duration) upsertPayload.duration = existing.duration
    if (existing?.refImageUrls) upsertPayload.refImageUrls = existing.refImageUrls
    if (existing?.refVideoUrls) upsertPayload.refVideoUrls = existing.refVideoUrls
    if (existing?.refAudioUrls) upsertPayload.refAudioUrls = existing.refAudioUrls

    repo.upsert(upsertPayload)

    const resultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) resultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${taskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(taskObj.model || model || DEFAULT_MODEL).trim(),
      status: remoteStatus,
      prompt: promptText,
      resultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: upsertPayload.errorMessage,
      statusText: upsertPayload.statusText,
      responsePayload: taskObj,
      projectId: existing?.projectId ?? projectId,
      remoteTaskId: taskId,
    })

    const local = repo.getByRemoteTaskId(taskId)
    const item = serializeVideoTask(local)
    return { ok: true, item, total: 1, remote: taskObj }
  }

  const query = new URLSearchParams({
    page_num: String(pageNum),
    page_size: String(pageSize),
  })
  if (status) query.set('filter.status', status)
  if (model) query.set('filter.model', model)

  const url = `${SEEDANCE_API_BASE}/contents/generations/tasks?${query.toString()}`
  const res = await client.get(url, {
    headers: getHeaders(apiKey),
    timeout: DEFAULT_TIMEOUT,
  })

  if (!res.ok) {
    const errMsg = typeof res.body === 'object' && res.body?.error?.message ? res.body.error.message : `HTTP ${res.status}`
    throw upstreamError(`Seedance list tasks failed: ${errMsg}`)
  }

  const data = res.body || {}
  const remoteItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.data) ? data.data : [])
  const syncedItems = []

  for (const remoteTask of remoteItems) {
    const remoteTaskId = String(remoteTask?.id || '').trim()
    if (!remoteTaskId) continue

    const { videoUrl, lastFrameUrl } = extractVideoUrls(remoteTask)
    const taskStatus = normalizeSeedanceStatus(remoteTask.status)
    const existing = repo.getByRemoteTaskId(remoteTaskId)
    const promptText = extractPrompt(remoteTask) || (existing?.prompt || '')
    const remoteCreatedAt = parseSeedanceTimestamp(remoteTask.created_at || remoteTask.createdAt || remoteTask.create_time)

    const upsertPayload = {
      remoteTaskId,
      provider: 'seedance',
      model: String(remoteTask.model || existing?.model || model || DEFAULT_MODEL).trim(),
      taskType: String(remoteTask.task_type || existing?.taskType || '').trim(),
      source: 'sync',
      status: taskStatus,
      prompt: promptText,
      videoUrlRemote: videoUrl || (existing?.videoUrlRemote || ''),
      lastFrameUrlRemote: lastFrameUrl || (existing?.lastFrameUrlRemote || ''),
      errorMessage: extractSeedanceErrorMessage(remoteTask, taskStatus),
      statusText: taskStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${taskStatus}`,
      usage: remoteTask.usage || existing?.usage || null,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? projectId,
      remoteCreatedAt: remoteCreatedAt || existing?.remoteCreatedAt || null,
      remoteUpdatedAt: Date.now(),
    }
    if (existing?.ratio && !remoteTask.ratio) upsertPayload.ratio = existing.ratio
    if (existing?.resolution && !remoteTask.resolution) upsertPayload.resolution = existing.resolution
    if (existing?.duration && !remoteTask.duration) upsertPayload.duration = existing.duration
    if (existing?.refImageUrls) upsertPayload.refImageUrls = existing.refImageUrls
    if (existing?.refVideoUrls) upsertPayload.refVideoUrls = existing.refVideoUrls
    if (existing?.refAudioUrls) upsertPayload.refAudioUrls = existing.refAudioUrls

    repo.upsert(upsertPayload)

    const batchResultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) batchResultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${remoteTaskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(remoteTask.model || model || DEFAULT_MODEL).trim(),
      status: taskStatus,
      prompt: promptText,
      resultUrls: batchResultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: upsertPayload.errorMessage,
      statusText: upsertPayload.statusText,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? projectId,
      remoteTaskId,
    })

    const local = repo.getByRemoteTaskId(remoteTaskId)
    if (local) {
      syncedItems.push(serializeVideoTask(local))
    }
  }

  return { ok: true, items: syncedItems, total: syncedItems.length, totalCount: Number(data.total || data.total_count || 0) || syncedItems.length, hasMore: Boolean(data.has_more), pageNum, pageSize, remote: data }
}

export async function health(ctx) {
  const key = tryGetKey(ctx, 'seedance', 'bytedance_seedance', 'bytedance_video', 'bytedance_text', 'bytedance', 'doubao')
  return { ok: true, configured: !!key }
}

export async function getTaskDetailRemote(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  const taskId = String(payload?.taskId || payload?.id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')
  const projectId = payload?.projectId ? Number(payload.projectId) || null : null

  const taskUrl = `${SEEDANCE_API_BASE}/contents/generations/tasks/${encodeURIComponent(taskId)}`
  const taskRes = await client.get(taskUrl, {
    headers: getHeaders(apiKey),
    timeout: DEFAULT_TIMEOUT,
  })

  let remoteStatus = 'unknown'
  let videoUrl = ''
  let lastFrameUrl = ''
  let remoteTask = null
  let resourceAvailable = false
  let resourceUnavailableReason = ''

  if (taskRes.status === 404) {
    remoteStatus = 'not_found'
    resourceUnavailableReason = '供应商已删除该任务或任务不存在'
  } else if (!taskRes.ok) {
    remoteStatus = 'error'
    resourceUnavailableReason = `查询失败：HTTP ${taskRes.status}`
  } else {
    remoteTask = taskRes.body || {}
    remoteStatus = normalizeSeedanceStatus(remoteTask.status)
    const extracted = extractVideoUrls(remoteTask)
    videoUrl = extracted.videoUrl
    lastFrameUrl = extracted.lastFrameUrl

    if (remoteStatus === 'succeeded') {
      resourceAvailable = !!videoUrl
      if (!videoUrl) resourceUnavailableReason = '任务已完成但未返回视频地址'
    } else if (['failed', 'error', 'canceled'].includes(remoteStatus)) {
      resourceAvailable = false
      resourceUnavailableReason = extractSeedanceErrorMessage(remoteTask, remoteStatus) || `任务状态：${remoteStatus}`
    } else {
      resourceAvailable = false
      resourceUnavailableReason = '任务尚未完成，暂无可下载产物'
    }

    const existing = repo.getByRemoteTaskId(taskId)
    const promptText = extractPrompt(remoteTask) || (existing?.prompt || '')
    const remoteCreatedAt = parseSeedanceTimestamp(remoteTask.created_at || remoteTask.createdAt || remoteTask.create_time)

    const upsertPayload = {
      remoteTaskId: taskId,
      provider: 'seedance',
      model: String(remoteTask.model || existing?.model || DEFAULT_MODEL).trim(),
      taskType: String(remoteTask.task_type || existing?.taskType || '').trim(),
      source: 'sync',
      status: remoteStatus,
      prompt: promptText,
      videoUrlRemote: videoUrl || (existing?.videoUrlRemote || ''),
      lastFrameUrlRemote: lastFrameUrl || (existing?.lastFrameUrlRemote || ''),
      errorMessage: extractSeedanceErrorMessage(remoteTask, remoteStatus),
      statusText: remoteStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${remoteStatus}`,
      usage: remoteTask.usage || existing?.usage || null,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? projectId,
      remoteCreatedAt: remoteCreatedAt || existing?.remoteCreatedAt || null,
      remoteUpdatedAt: Date.now(),
    }
    if (existing?.ratio && !remoteTask.ratio) upsertPayload.ratio = existing.ratio
    if (existing?.resolution && !remoteTask.resolution) upsertPayload.resolution = existing.resolution
    if (existing?.duration && !remoteTask.duration) upsertPayload.duration = existing.duration
    if (existing?.refImageUrls) upsertPayload.refImageUrls = existing.refImageUrls
    if (existing?.refVideoUrls) upsertPayload.refVideoUrls = existing.refVideoUrls
    if (existing?.refAudioUrls) upsertPayload.refAudioUrls = existing.refAudioUrls

    repo.upsert(upsertPayload)

    const resultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) resultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${taskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(remoteTask.model || DEFAULT_MODEL).trim(),
      status: remoteStatus,
      prompt: promptText,
      resultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: upsertPayload.errorMessage,
      statusText: upsertPayload.statusText,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? projectId,
      remoteTaskId: taskId,
    })
  }

  const local = repo.getByRemoteTaskId(taskId)
  const item = local ? serializeVideoTask(local) : null

  return {
    ok: true,
    item,
    remote: remoteTask,
    remoteStatus,
    resourceAvailable,
    resourceUnavailableReason,
    videoUrlRemote: videoUrl,
    lastFrameUrlRemote: lastFrameUrl,
  }
}

export async function downloadAssetToProject(ctx, payload) {
  const taskId = String(payload?.taskId || '').trim()
  const projectId = Number(payload?.projectId) || 0
  const assetKind = String(payload?.kind || 'video').trim()
  const preferredName = String(payload?.name || '').trim()

  if (!taskId) throw invalidParamsError('taskId is required')
  if (!(projectId > 0)) throw invalidParamsError('projectId is required')

  const detail = await getTaskDetailRemote(ctx, { taskId, projectId })
  if (!detail.resourceAvailable || !detail.videoUrlRemote) {
    return {
      ok: false,
      error: detail.resourceUnavailableReason || '暂无可下载产物',
      resourceAvailable: false,
    }
  }

  const url = assetKind === 'lastFrame' && detail.lastFrameUrlRemote
    ? detail.lastFrameUrlRemote
    : detail.videoUrlRemote

  const baseName = preferredName || `seedance-${taskId}`
  const nameWithExt = assetKind === 'lastFrame' ? `${baseName}.jpg` : `${baseName}.mp4`

  const dl = await downloadUrlToProjectRoot(projectId, url, nameWithExt)
  if (!dl?.ok) {
    return { ok: false, error: dl?.error || '下载失败' }
  }

  const repo = ctx.localdb?.videoTasks
  if (repo) {
    if (assetKind === 'lastFrame') {
      repo.upsert({
        remoteTaskId: taskId,
        lastFrameUrlLocal: dl.absolutePath,
        lastFrameSourcePathLocal: dl.relativePath,
      })
    } else {
      repo.upsert({
        remoteTaskId: taskId,
        videoUrlLocal: dl.absolutePath,
        videoSourcePathLocal: dl.relativePath,
      })
    }
  }

  const dwebUrl = `dweb://project-assets?projectId=${projectId}&path=${encodeURIComponent(dl.relativePath)}`

  return {
    ok: true,
    sourcePath: dl.absolutePath,
    projectRelativePath: dl.relativePath,
    url: dwebUrl,
    size: dl.size || 0,
    kind: assetKind,
    taskId,
  }
}

export async function listAllTasksRemote(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.videoTasks
  if (!repo) throw internalError('videoTasks repo not available')

  const pageNum = Math.max(1, parseInt(String(payload?.pageNum || 1), 10) || 1)
  const requestedPageSize = Math.max(1, Math.min(100, parseInt(String(payload?.pageSize || 50), 10) || 50))
  const pageSize = requestedPageSize
  const status = String(payload?.status || '').trim()
  const model = String(payload?.model || '').trim()
  const autoFetchAll = payload?.fetchAll !== false && pageNum === 1

  const query = new URLSearchParams({
    page_num: String(pageNum),
    page_size: String(pageSize),
  })
  if (status) query.set('filter.status', status)
  if (model) query.set('filter.model', model)

  const url = `${SEEDANCE_API_BASE}/contents/generations/tasks?${query.toString()}`
  const res = await client.get(url, {
    headers: getHeaders(apiKey),
    timeout: DEFAULT_TIMEOUT,
  })

  if (!res.ok) {
    const errMsg = typeof res.body === 'object' && res.body?.error?.message ? res.body.error.message : `HTTP ${res.status}`
    throw upstreamError(`Seedance list tasks failed: ${errMsg}`)
  }

  const data = res.body || {}
  const remoteItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.data) ? data.data : [])
  const syncedItems = []
  const totalFromRemote = Number(data.total || data.total_count || 0) || remoteItems.length

  const syncRemoteTask = (remoteTask) => {
    const remoteTaskId = String(remoteTask?.id || '').trim()
    if (!remoteTaskId) return null

    const { videoUrl, lastFrameUrl } = extractVideoUrls(remoteTask)
    const taskStatus = normalizeSeedanceStatus(remoteTask.status)
    const existing = repo.getByRemoteTaskId(remoteTaskId)

    const extractedPrompt = extractPrompt(remoteTask)
    const fallbackPrompt = extractedPrompt || (existing?.prompt ? String(existing.prompt).trim() : '')

    const remoteCreatedAt = parseSeedanceTimestamp(remoteTask.created_at || remoteTask.createdAt || remoteTask.create_time)
    const remoteUpdatedAt = parseSeedanceTimestamp(remoteTask.updated_at || remoteTask.updatedAt || remoteTask.update_time) || Date.now()

    const upsertPayload = {
      remoteTaskId,
      provider: 'seedance',
      model: String(remoteTask.model || existing?.model || model || DEFAULT_MODEL).trim(),
      taskType: String(remoteTask.task_type || existing?.taskType || existing?.task_type || '').trim(),
      source: 'sync',
      status: taskStatus,
      prompt: fallbackPrompt,
      videoUrlRemote: videoUrl || (existing?.videoUrlRemote || ''),
      lastFrameUrlRemote: lastFrameUrl || (existing?.lastFrameUrlRemote || ''),
      errorMessage: extractSeedanceErrorMessage(remoteTask, taskStatus),
      statusText: taskStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${taskStatus}`,
      usage: remoteTask.usage || existing?.usage || null,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? null,
      remoteCreatedAt: remoteCreatedAt || existing?.remoteCreatedAt || null,
      remoteUpdatedAt,
    }

    if (existing?.ratio && !remoteTask.ratio) upsertPayload.ratio = existing.ratio
    if (existing?.resolution && !remoteTask.resolution) upsertPayload.resolution = existing.resolution
    if (existing?.duration && !remoteTask.duration) upsertPayload.duration = existing.duration
    if (existing?.refImageUrls) upsertPayload.refImageUrls = existing.refImageUrls
    if (existing?.refVideoUrls) upsertPayload.refVideoUrls = existing.refVideoUrls
    if (existing?.refAudioUrls) upsertPayload.refAudioUrls = existing.refAudioUrls

    repo.upsert(upsertPayload)

    const batchResultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) batchResultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${remoteTaskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(remoteTask.model || model || DEFAULT_MODEL).trim(),
      status: taskStatus,
      prompt: fallbackPrompt,
      resultUrls: batchResultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: upsertPayload.errorMessage,
      statusText: upsertPayload.statusText,
      responsePayload: remoteTask,
      projectId: existing?.projectId ?? null,
      remoteTaskId,
    })

    const local = repo.getByRemoteTaskId(remoteTaskId)
    return local ? serializeVideoTask(local) : null
  }

  for (const remoteTask of remoteItems) {
    const item = syncRemoteTask(remoteTask)
    if (item) syncedItems.push(item)
  }

  const hasMore = Boolean(data.has_more) || (totalFromRemote > pageNum * pageSize)

  console.log(`[seedance] listAllTasksRemote: fetched page ${pageNum}, got ${syncedItems.length} items, total=${totalFromRemote}, hasMore=${hasMore}`)

  return {
    ok: true,
    items: syncedItems,
    total: syncedItems.length,
    totalCount: Math.max(totalFromRemote, syncedItems.length),
    hasMore,
    pageNum,
    pageSize,
  }
}
