import crypto from 'node:crypto'
import { getHttpClient } from '../../core/http-client.mjs'
import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'
import { getRepos } from '../../../localdb/index.mjs'

const SEEDANCE_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'
const DEFAULT_TIMEOUT = 120000
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 900000

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
  const content = obj && typeof obj.content === 'object' ? obj.content : null
  if (!content) return { videoUrl: '', lastFrameUrl: '' }
  return {
    videoUrl: String(content.video_url || '').trim(),
    lastFrameUrl: String(content.last_frame_url || '').trim(),
  }
}

function extractUsageText(obj) {
  const usage = obj && typeof obj.usage === 'object' ? obj.usage : null
  if (!usage) return null
  const parts = []
  if (typeof usage.total_tokens === 'number') parts.push(`total=${usage.total_tokens}`)
  if (typeof usage.completion_tokens === 'number') parts.push(`completion=${usage.completion_tokens}`)
  return parts.length ? `tokens: ${parts.join(', ')}` : null
}

function buildContent(prompt, refImageUrls, refMode) {
  const content = []
  const text = String(prompt || '').trim()
  if (text) {
    content.push({ type: 'text', text })
  }
  if (!Array.isArray(refImageUrls) || !refImageUrls.length) return content

  const urls = refImageUrls.map(u => String(u || '').trim()).filter(u => u)
  if (!urls.length) return content

  const mode = String(refMode || 'auto').trim().toLowerCase()

  if (mode === 'first-last' && urls.length >= 2) {
    content.push({ type: 'image_url', image_url: { url: urls[0] }, role: 'first_frame' })
    content.push({ type: 'image_url', image_url: { url: urls[1] }, role: 'last_frame' })
  } else if (mode === 'first') {
    content.push({ type: 'image_url', image_url: { url: urls[0] }, role: 'first_frame' })
  } else if (mode === 'reference') {
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
  const refMode = String(payload?.refMode || 'auto').trim().toLowerCase() || 'auto'
  const source = String(payload?.source || 'bottom-chat').trim() || 'bottom-chat'
  const projectId = payload?.projectId ? Number(payload.projectId) || null : null

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

  const hasRefImages = refImageUrls.length > 0

  if (!prompt && !hasRefImages) {
    yield wrapStreamError('prompt or reference images are required')
    return
  }

  yield wrapTaskStatusMsg('Seedance：创建任务中…', 'generating')

  try {
    const content = buildContent(prompt, refImageUrls, refMode)
    const createPayload = {
      model,
      content,
      ratio,
      resolution,
      watermark,
      generate_audio: generateAudio,
      camera_fixed: cameraFixed,
      return_last_frame: returnLastFrame,
    }
    if (frames !== null) createPayload.frames = frames
    else if (duration !== null) createPayload.duration = duration
    if (seed !== null) createPayload.seed = seed

    console.log('[seedance] creating task, model=', model, 'ratio=', ratio, 'resolution=', resolution, 'duration=', duration, 'hasRefImages=', hasRefImages, 'refMode=', refMode, 'generateAudio=', generateAudio)
    const createUrl = `${SEEDANCE_API_BASE}/contents/generations/tasks`
    const createRes = await client.post(createUrl, createPayload, {
      headers: getHeaders(apiKey),
      timeout: DEFAULT_TIMEOUT,
    })

    if (!createRes.ok) {
      let errMsg = `HTTP ${createRes.status}`
      if (createRes.body) {
        if (createRes.body.error?.message) errMsg = createRes.body.error.message
        else if (createRes.body.message) errMsg = createRes.body.message
        else if (typeof createRes.body === 'object') errMsg = JSON.stringify(createRes.body).slice(0, 500)
      }
      console.error('[seedance] create task failed:', createRes.status, JSON.stringify(createRes.body?.error || createRes.body || {}).slice(0, 500))
      throw new Error(`Seedance create task failed: ${errMsg}`)
    }

    const createObj = createRes.body || {}
    const taskId = String(createObj.id || '').trim()
    if (!taskId) {
      throw new Error(`Seedance create task failed: invalid response ${JSON.stringify(createObj).slice(0, 500)}`)
    }

    repo.upsert({
      remoteTaskId: taskId,
      provider: 'seedance',
      model,
      taskType: hasRefImages ? 'image-to-video' : 'text-to-video',
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

        throw new Error(`Seedance task failed: ${errMsg}`)
      }

      billingText = extractUsageText(taskObj) || billingText
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      const suffix = billingText ? `；计费：${billingText}` : ''
      const statusMsg = `Seedance：${status || 'running'}（${elapsed}s）${suffix}`

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

      yield wrapTaskStatusMsg(statusMsg, 'streaming')

      if (Date.now() - startTime >= POLL_TIMEOUT_MS) {
        throw new Error(`Seedance task timeout after ${Math.floor(POLL_TIMEOUT_MS / 1000)}s`)
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } catch (err) {
    yield wrapStreamError(String(err?.message || err || 'unknown error'))
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
    const remoteStatus = String(taskObj.status || 'queued').trim().toLowerCase()
    const { videoUrl, lastFrameUrl } = extractVideoUrls(taskObj)
    const billingText = extractUsageText(taskObj)

    repo.upsert({
      remoteTaskId: taskId,
      provider: 'seedance',
      model: String(taskObj.model || model || DEFAULT_MODEL).trim(),
      taskType: String(taskObj.task_type || '').trim(),
      source: 'sync',
      status: remoteStatus,
      prompt: String(taskObj.prompt || '').trim(),
      videoUrlRemote: videoUrl,
      lastFrameUrlRemote: lastFrameUrl,
      errorMessage: ['failed', 'error'].includes(remoteStatus) ? String(taskObj.error || '').trim() : '',
      statusText: remoteStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${remoteStatus}`,
      usage: taskObj.usage || null,
      responsePayload: taskObj,
      projectId,
      remoteUpdatedAt: Date.now(),
    })

    const resultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) resultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${taskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(taskObj.model || model || DEFAULT_MODEL).trim(),
      status: remoteStatus === 'success' || remoteStatus === 'succeeded' ? 'succeeded' : remoteStatus,
      prompt: String(taskObj.prompt || '').trim(),
      resultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: ['failed', 'error'].includes(remoteStatus) ? String(taskObj.error || '').trim() : '',
      statusText: remoteStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${remoteStatus}`,
      responsePayload: taskObj,
      projectId,
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
    const taskStatus = String(remoteTask.status || 'queued').trim().toLowerCase()

    repo.upsert({
      remoteTaskId,
      provider: 'seedance',
      model: String(remoteTask.model || model || DEFAULT_MODEL).trim(),
      taskType: String(remoteTask.task_type || '').trim(),
      source: 'sync',
      status: taskStatus,
      prompt: String(remoteTask.prompt || '').trim(),
      videoUrlRemote: videoUrl,
      lastFrameUrlRemote: lastFrameUrl,
      errorMessage: ['failed', 'error'].includes(taskStatus) ? String(remoteTask.error || '').trim() : '',
      statusText: taskStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${taskStatus}`,
      usage: remoteTask.usage || null,
      responsePayload: remoteTask,
      projectId,
      remoteUpdatedAt: Date.now(),
    })

    const batchResultUrls = videoUrl ? [videoUrl] : []
    if (lastFrameUrl) batchResultUrls.push(lastFrameUrl)
    recordArkTask({
      taskId: `seedance-${remoteTaskId}`,
      provider: 'bytedance',
      apiType: 'seedance',
      apiAction: 'video_generation',
      model: String(remoteTask.model || model || DEFAULT_MODEL).trim(),
      status: taskStatus === 'success' || taskStatus === 'succeeded' ? 'succeeded' : taskStatus,
      prompt: String(remoteTask.prompt || '').trim(),
      resultUrls: batchResultUrls,
      thumbnailUrl: lastFrameUrl || videoUrl || '',
      errorMessage: ['failed', 'error'].includes(taskStatus) ? String(remoteTask.error || '').trim() : '',
      statusText: taskStatus === 'succeeded' ? 'Seedance：完成' : `Seedance：${taskStatus}`,
      responsePayload: remoteTask,
      projectId,
      remoteTaskId,
    })

    const local = repo.getByRemoteTaskId(remoteTaskId)
    if (local) {
      syncedItems.push(serializeVideoTask(local))
    }
  }

  return { ok: true, items: syncedItems, total: syncedItems.length, remote: data }
}

export async function health(ctx) {
  const key = tryGetKey(ctx, 'seedance', 'bytedance_seedance', 'bytedance_video', 'bytedance_text', 'bytedance', 'doubao')
  return { ok: true, configured: !!key }
}
