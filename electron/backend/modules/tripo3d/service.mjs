import { getHttpClient } from '../../core/http-client.mjs'
import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'
import logger from '../../core/logger.mjs'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const TRIPO3D_API_BASE = 'https://openapi.tripo3d.com/v3'

function getApiKey(ctx) {
  const repo = ctx.localdb?.apiKeys
  if (!repo) throw internalError('apiKeys repo not available')
  const result = repo.getPlaintext('tripo3d')
  if (!result.ok) throw internalError(result.error || 'failed to read tripo3d api key')
  const key = String(result.plaintext || '').trim()
  if (!key) throw invalidParamsError('tripo3d api key is not configured')
  return key
}

function tryGetApiKey(ctx) {
  try {
    const repo = ctx.localdb?.apiKeys
    if (!repo) {
      logger.warn('[tripo3d] apiKeys repo not available in context')
      return { configured: false, available: false, apiKey: '' }
    }
    const result = repo.getPlaintext('tripo3d')
    if (!result.ok) {
      logger.warn('[tripo3d] failed to read api key from localdb:', result.error)
      return { configured: false, available: false, apiKey: '', error: result.error }
    }
    const key = String(result.plaintext || '').trim()
    if (!key) {
      return { configured: false, available: false, apiKey: '' }
    }
    logger.info('[tripo3d] api key found in localdb, key prefix:', key.slice(0, 8) + '...')
    return { configured: true, available: true, apiKey: key }
  } catch (err) {
    logger.error('[tripo3d] unexpected error reading api key:', err?.message || String(err))
    return { configured: false, available: false, apiKey: '', error: err?.message || String(err) }
  }
}

function normalizeTask(taskId, obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: true, taskId, status: 'unknown', progress: 0, thumbnailUrl: '', modelUrl: '', imageUrls: [], statusText: 'invalid response', errorMessage: '' }
  }

  const rawStatus = String(obj.status || '').trim().toLowerCase()
  const status = rawStatus || 'unknown'
  let progress = 0
  try {
    progress = Math.max(0, Math.min(100, parseInt(String(obj.progress || '0'), 10)))
  } catch {
    progress = 0
  }

  const inputObj = obj.input && typeof obj.input === 'object' ? obj.input : {}
  const outputObj = obj.output && typeof obj.output === 'object' ? obj.output : {}

  const prompt = String(inputObj.prompt || obj.prompt || '').trim()
  const negativePrompt = String(inputObj.negative_prompt || obj.negative_prompt || '').trim()
  const mode = String(obj.type || inputObj.type || 'text_to_model').trim()
  const modelVersion = String(inputObj.model || inputObj.model_version || '').trim()
  const isImageMode = mode === 'text_to_image' || mode === 'image_to_image' || mode === 'image_to_multiview'

  let thumbnailUrl = String(
    outputObj.thumbnail ||
    outputObj.thumbnail_url ||
    outputObj.rendered_image_url ||
    outputObj.preview_url ||
    obj.thumbnail_url ||
    ''
  ).trim()

  let modelUrl = ''
  if (!isImageMode) {
    if (outputObj.model && typeof outputObj.model === 'object') {
      modelUrl = String(outputObj.model.url || outputObj.model.glb || '').trim()
    }
    if (!modelUrl) {
      modelUrl = String(outputObj.model_url || outputObj.pbr_model_url || '').trim()
    }
    if (!modelUrl && Array.isArray(outputObj.model_urls) && outputObj.model_urls.length > 0) {
      modelUrl = String(outputObj.model_urls[0] || '').trim()
    }
  }

  let imageUrls = []
  const isImageUrl = (s) => {
    if (!s || typeof s !== 'string') return false
    const str = s.trim().toLowerCase()
    if (!str) return false
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:image/')) {
      if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(str)) return true
      if (str.includes('/generation/') || str.includes('/image/') || str.includes('tripo')) return true
    }
    return false
  }

  const collectImageUrl = (val) => {
    if (!val) return
    if (typeof val === 'string') {
      const s = val.trim()
      if (s && isImageUrl(s)) imageUrls.push(s)
    } else if (typeof val === 'object') {
      const u = String(val.url || val.image_url || val.src || val.image || val.uri || '').trim()
      if (u && isImageUrl(u)) imageUrls.push(u)
    }
  }

  const collectFromObject = (target, depth = 0) => {
    if (!target || typeof target !== 'object' || depth > 5) return
    if (Array.isArray(target)) {
      for (const item of target) {
        collectFromObject(item, depth + 1)
      }
      return
    }
    for (const [key, value] of Object.entries(target)) {
      const keyLower = key.toLowerCase()
      if (keyLower === 'images' || keyLower === 'image_urls' || keyLower === 'results' ||
          keyLower === 'image' || keyLower === 'image_url' || keyLower === 'output_images' ||
          keyLower === 'generated_images' || keyLower === 'result') {
        if (Array.isArray(value)) {
          for (const item of value) collectImageUrl(item)
        } else {
          collectImageUrl(value)
        }
      }
      if (typeof value === 'string' && isImageUrl(value)) {
        imageUrls.push(value.trim())
      } else if (typeof value === 'object' && value !== null) {
        collectFromObject(value, depth + 1)
      }
    }
  }

  collectFromObject(outputObj)
  if (isImageMode) {
    collectFromObject(obj)
  }

  if (outputObj.url && isImageMode) {
    collectImageUrl(outputObj.url)
  }
  if (obj.url && isImageMode) {
    collectImageUrl(obj.url)
  }

  imageUrls = [...new Set(imageUrls)]

  if (!thumbnailUrl && imageUrls.length > 0) {
    thumbnailUrl = imageUrls[0]
  }

  if (isImageMode) {
    console.log(`[Tripo3D Backend] normalizeTask image mode=${mode} status=${status} imageUrls count=${imageUrls.length} thumbnail=${thumbnailUrl ? 'yes' : 'no'}`)
    if (imageUrls.length === 0 && (status === 'success' || status === 'succeeded' || status === 'completed')) {
      console.log(`[Tripo3D Backend] normalizeTask - Task success but no images found. Full response:`, JSON.stringify(obj, null, 2).slice(0, 5000))
    }
  }

  const errorMessage = String(obj.error || obj.error_message || outputObj.error || '').trim()

  let statusText = String(obj.status_text || '').trim()
  if (!statusText) {
    if (status === 'queued') statusText = 'Tripo3D：任务排队中'
    else if (status === 'running') statusText = `Tripo3D：生成中 ${progress}%`
    else if (status === 'success' || status === 'succeeded' || status === 'completed') statusText = isImageMode ? 'Tripo3D：图片生成完成' : 'Tripo3D：生成完成'
    else if (status === 'failed' || status === 'error') statusText = errorMessage || 'Tripo3D：生成失败'
    else if (status === 'cancelled' || status === 'canceled') statusText = 'Tripo3D：任务已取消'
  }

  return {
    ok: true,
    taskId,
    mode,
    status,
    progress,
    prompt,
    negativePrompt,
    modelVersion,
    thumbnailUrl,
    modelUrl,
    imageUrls,
    statusText,
    errorMessage,
    raw: obj,
  }
}

function serializeRepoTask(row) {
  if (!row) return null
  return {
    id: row.id,
    taskId: row.taskId,
    mode: row.mode,
    status: row.status || 'queued',
    progress: Number(row.progress) || 0,
    prompt: row.prompt || '',
    negativePrompt: row.negativePrompt || '',
    modelVersion: row.modelVersion || '',
    faceLimit: Number(row.faceLimit) || 0,
    texture: Boolean(row.texture),
    pbr: Boolean(row.pbr),
    thumbnailUrl: row.thumbnailUrl || '',
    modelUrl: row.modelUrl || '',
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
    localAssetUrl: row.localAssetUrl || '',
    localAssetPath: row.localAssetPath || '',
    errorMessage: row.errorMessage || '',
    statusText: row.statusText || '',
    nodeId: row.nodeId || '',
    projectId: row.projectId ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : '',
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : '',
    requestPayload: row.requestPayload && typeof row.requestPayload === 'object' ? row.requestPayload : {},
    responsePayload: row.responsePayload && typeof row.responsePayload === 'object' ? row.responsePayload : {},
  }
}

function buildCreatePayload(payload) {
  const mode = String(payload.mode || 'text_to_model').trim().toLowerCase()
  const validModes = ['text_to_model', 'image_to_model', 'multiview_to_model', 'texture', 'refine']
  if (!validModes.includes(mode)) {
    return [null, null, `invalid mode: ${mode}, valid modes: ${validModes.join(', ')}`]
  }

  const body = {
    type: mode,
  }

  const prompt = String(payload.prompt || '').trim()
  const negativePrompt = String(payload.negative_prompt || payload.negativePrompt || '').trim()
  const modelVersion = String(payload.model_version || payload.model || payload.modelVersion || 'v3.1-20260211').trim()

  let faceLimit = Number(payload.face_limit || payload.faceLimit || 0)
  let texture = payload.texture !== false
  let pbr = payload.pbr !== false
  const enableImageAutofix = payload.enable_image_autofix === true
  const textureAlignment = String(payload.texture_alignment || '').trim()
  const orientation = String(payload.orientation || '').trim()
  let textureQuality = String(payload.texture_quality || 'standard').trim()
  let geometryQuality = String(payload.geometry_quality || 'standard').trim()
  let autoSize = payload.auto_size === true
  let quad = payload.quad === true
  let smartLowPoly = payload.smart_low_poly === true
  let generateParts = payload.generate_parts === true
  let compress = String(payload.compress || '').trim()
  const exportUv = payload.export_uv !== false

  const isPSeries = modelVersion.startsWith('P')
  const isV3OrLater = modelVersion === 'v3.1-20260211' || modelVersion === 'v3.0-20250812'
  const isV25 = modelVersion === 'v2.5-20250123'
  const supportsAdvancedFeatures = isV3OrLater || isPSeries

  if (isPSeries) {
    smartLowPoly = false
    generateParts = false
    autoSize = false
    compress = ''
    geometryQuality = 'standard'
  } else if (isV25) {
    smartLowPoly = false
    generateParts = false
    autoSize = false
    compress = ''
    geometryQuality = 'standard'
    quad = false
  } else if (!isV3OrLater) {
    smartLowPoly = false
    generateParts = false
    autoSize = false
    compress = ''
    geometryQuality = 'standard'
    quad = false
  }

  if (generateParts) {
    texture = false
    pbr = false
    quad = false
    smartLowPoly = false
  }

  if (pbr) {
    texture = true
  }

  if (smartLowPoly) {
    quad = false
  }

  if (mode === 'text_to_model') {
    if (!prompt) return [null, null, 'prompt is required for text_to_model mode']
    body.prompt = prompt
  } else if (mode === 'image_to_model') {
    const fileToken = String(payload.fileToken || payload.file_token || '').trim()
    const inputUrl = String(payload.input || payload.image_url || payload.file?.url || '').trim()
    const fileData = payload.file
    if (!fileToken && !inputUrl && (!fileData || !fileData.type || !fileData.data)) {
      return [null, null, 'fileToken, image_url or file is required for image_to_model mode']
    }
    if (prompt) body.prompt = prompt
    if (fileToken) {
      body.input = fileToken
    } else if (fileData && fileData.type && fileData.data) {
      body.file = { type: fileData.type, data: fileData.data }
    } else {
      body.input = inputUrl
    }
  } else if (mode === 'multiview_to_model') {
    const fileTokens = payload.fileTokens || payload.file_tokens
    const inputs = payload.inputs
    const files = payload.files
    if (Array.isArray(fileTokens) && fileTokens.length >= 2) {
      body.inputs = fileTokens.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return item
        }
        return String(item)
      })
    } else if (Array.isArray(inputs) && inputs.length >= 2) {
      body.inputs = inputs.map((item) => {
        if (typeof item === 'object' && item !== null) {
          if (item.url) {
            return item.url
          }
          const viewKey = Object.keys(item)[0]
          return item[viewKey]
        }
        return item
      })
    } else if (Array.isArray(files) && files.length >= 2) {
      body.files = files.map(f => ({
        type: f.type || 'png',
        ...(f.data ? { data: f.data } : { url: f.url }),
        ...(f.view ? { view: f.view } : {})
      }))
    } else {
      return [null, null, 'at least 2 images are required for multiview_to_model mode']
    }
    if (prompt) body.prompt = prompt
  } else if (mode === 'texture') {
    const modelTaskId = String(payload.model_task_id || payload.original_model_task_id || '').trim()
    const modelUrl = String(payload.model_url || '').trim()
    if (!modelTaskId && !modelUrl) {
      return [null, null, 'model_task_id or model_url is required for texture mode']
    }
    if (modelTaskId) body.original_model_task_id = modelTaskId
    if (modelUrl) body.model_url = modelUrl
    if (prompt) body.texture_prompt = prompt
  } else if (mode === 'refine') {
    const modelTaskId = String(payload.model_task_id || '').trim()
    if (!modelTaskId) return [null, null, 'model_task_id is required for refine mode']
    body.model_task_id = modelTaskId
    if (prompt) body.prompt = prompt
  }

  if (negativePrompt) body.negative_prompt = negativePrompt
  if (modelVersion) body.model_version = modelVersion

  if (Number.isFinite(faceLimit) && faceLimit > 0) {
    let minLimit = 1000
    let maxLimit = 2000000
    if (isPSeries) {
      minLimit = 50
      maxLimit = quad ? 10000 : 20000
    } else if (smartLowPoly) {
      minLimit = 500
      maxLimit = quad ? 10000 : 20000
    } else if (quad) {
      minLimit = 1000
      maxLimit = 150000
    } else if (isV25) {
      minLimit = 1000
      maxLimit = 500000
    }
    body.face_limit = Math.max(minLimit, Math.min(maxLimit, Math.floor(faceLimit)))
  }

  body.texture = texture
  body.pbr = pbr
  if (enableImageAutofix) body.enable_image_autofix = true
  if (textureAlignment) body.texture_alignment = textureAlignment
  if (orientation && texture) body.orientation = orientation
  if (textureQuality) body.texture_quality = textureQuality
  if (isV3OrLater && geometryQuality) body.geometry_quality = geometryQuality
  if (isV3OrLater && autoSize) body.auto_size = true
  if (supportsAdvancedFeatures && !generateParts && !smartLowPoly && quad) body.quad = true
  if (isV3OrLater && !isPSeries && smartLowPoly) body.smart_low_poly = true
  if (isV3OrLater && generateParts) body.generate_parts = true
  if (isV3OrLater && compress) body.compress = compress
  if (exportUv) body.export_uv = true

  if (typeof payload.model_seed === 'number' && Number.isFinite(payload.model_seed) && payload.model_seed >= 0) {
    body.model_seed = Math.floor(payload.model_seed)
  }
  if (typeof payload.texture_seed === 'number' && Number.isFinite(payload.texture_seed) && payload.texture_seed >= 0) {
    body.texture_seed = Math.floor(payload.texture_seed)
  }

  return [mode, body, null]
}

export async function generateModel(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  console.log('[Tripo3D Backend] 接收到生成请求 payload:', JSON.stringify(payload, null, 2))

  const [mode, body, buildErr] = buildCreatePayload(payload || {})
  if (buildErr) throw invalidParamsError(buildErr)

  if (body.model_version && !body.model) {
    body.model = body.model_version
    delete body.model_version
  }

  console.log('[Tripo3D Backend] 构建的请求 body (mode=' + mode + '):', JSON.stringify(body, null, 2))

  const endpointMap = {
    text_to_model: '/generation/text-to-model',
    image_to_model: '/generation/image-to-model',
    multiview_to_model: '/generation/multiview-to-model',
    texture: '/generation/texture',
    refine: '/generation/refine',
  }
  const endpoint = endpointMap[mode] || '/generation/text-to-model'
  const url = `${TRIPO3D_API_BASE}${endpoint}`

  console.log('[Tripo3D Backend] 请求端点:', url)

  const res = await client.post(url, body, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 60000,
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    if (typeof res.body === 'object' && res.body) {
      errMsg = res.body.message || res.body.error || res.body.msg || errMsg
    }
    throw upstreamError(`tripo3d generate failed: ${errMsg}`)
  }

  const responseData = res.body
  let taskId = ''
  if (responseData && typeof responseData === 'object') {
    if (responseData.code === 0 && responseData.data && typeof responseData.data === 'object') {
      taskId = String(responseData.data.task_id || '').trim()
    } else {
      taskId = String(responseData.task_id || responseData.id || '').trim()
    }
  }

  if (!taskId) throw upstreamError('tripo3d generate failed: no task_id in response')

  repo.upsert({
    taskId,
    mode,
    status: 'queued',
    progress: 0,
    prompt: body.prompt || '',
    negativePrompt: body.negative_prompt || '',
    modelVersion: body.model_version || '',
    faceLimit: body.face_limit || 0,
    texture: body.texture ? 1 : 0,
    pbr: body.pbr ? 1 : 0,
    thumbnailUrl: '',
    modelUrl: '',
    errorMessage: '',
    statusText: 'Tripo3D：任务已创建',
    requestPayload: {
      ...(payload || {}),
      _requestBody: body,
      _requestUrl: url,
      _submittedAt: new Date().toISOString()
    },
    responsePayload: res.body,
    projectId: payload?.projectId || payload?.project_id,
    nodeId: payload?.nodeId || payload?.node_id || '',
    startedAt: new Date().toISOString(),
  })

  return { ok: true, mode, taskId, status: 'queued', raw: res.body }
}

export async function getTask(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const taskId = String(payload?.taskId || payload?.task_id || payload?.id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')

  const url = `${TRIPO3D_API_BASE}/tasks/${encodeURIComponent(taskId)}`

  const res = await client.get(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 30000,
  })

  if (!res.ok) {
    if (res.status === 404) throw notFoundError('tripo3d task not found')
    let errMsg = `HTTP ${res.status}`
    if (typeof res.body === 'object' && res.body) {
      errMsg = res.body.message || res.body.error || errMsg
    }
    throw upstreamError(`tripo3d getTask failed: ${errMsg}`)
  }

  let taskData = res.body
  if (taskData && typeof taskData === 'object' && taskData.code === 0 && taskData.data) {
    taskData = taskData.data
  }

  const normalized = normalizeTask(taskId, taskData)

  repo.upsert({
    taskId,
    mode: normalized.mode,
    status: normalized.status,
    progress: normalized.progress,
    prompt: normalized.prompt,
    negativePrompt: normalized.negativePrompt,
    modelVersion: normalized.modelVersion,
    thumbnailUrl: normalized.thumbnailUrl,
    modelUrl: normalized.modelUrl,
    imageUrls: normalized.imageUrls || [],
    errorMessage: normalized.errorMessage,
    statusText: normalized.statusText,
    responsePayload: res.body,
    completedAt: ['success', 'succeeded', 'completed', 'failed', 'error', 'cancelled', 'canceled'].includes(normalized.status)
      ? new Date().toISOString()
      : null,
  })

  return normalized
}

export async function listTasks(ctx, payload) {
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  let rows = repo.list({ limit: payload?.limit })

  if (payload?.status) {
    const targetStatus = String(payload.status).trim().toLowerCase()
    rows = rows.filter(item => item.status === targetStatus)
  }

  const items = rows.map(serializeRepoTask)

  return { ok: true, items }
}

export async function getTaskDetail(ctx, payload) {
  const taskId = String(payload?.taskId || payload?.task_id || payload?.id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')

  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const local = repo.getByTaskId(taskId)
  if (!local) {
    throw notFoundError('tripo3d task not found')
  }

  let normalized
  try {
    normalized = await getTask(ctx, { taskId })
  } catch {
    normalized = null
  }

  let item = serializeRepoTask(local)
  if (normalized) {
    item = { ...item, ...normalized }
  }
  item.selectedTaskId = taskId

  return { ok: true, item }
}

export async function stopTask(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const taskId = String(payload?.taskId || payload?.task_id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')

  const url = `${TRIPO3D_API_BASE}/tasks/${encodeURIComponent(taskId)}/cancel`

  let stopOk = true
  try {
    const res = await client.post(url, {}, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 15000,
    })
    if (!res.ok) stopOk = false
  } catch {
    stopOk = false
  }

  repo.upsert({
    taskId,
    status: 'cancelled',
    statusText: 'Tripo3D：任务已取消',
    errorMessage: stopOk ? '' : 'cancel request failed, marked as cancelled locally',
    completedAt: new Date().toISOString(),
  })

  return { ok: true, taskId, status: 'cancelled' }
}

export async function deleteTask(ctx, payload) {
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const taskId = String(payload?.taskId || payload?.task_id || '').trim()
  if (!taskId) throw invalidParamsError('taskId is required')

  const existing = repo.getByTaskId(taskId)
  if (!existing) throw notFoundError('tripo3d task not found')

  repo.remove(taskId)

  return { ok: true, taskId, deleted: true }
}

export async function getBalance(ctx) {
  logger.info('[tripo3d] getBalance called')

  const keyInfo = tryGetApiKey(ctx)
  if (!keyInfo.configured) {
    const detail = keyInfo.error || ''
    logger.info('[tripo3d] api key not configured, detail:', detail)
    return {
      ok: true,
      available: false,
      configured: false,
      displayText: detail ? `API Key读取失败: ${detail.slice(0, 60)}` : '未配置Tripo3D API Key',
      detail
    }
  }

  const apiKey = keyInfo.apiKey
  const client = getHttpClient()
  const url = `${TRIPO3D_API_BASE}/account/balance`

  logger.info('[tripo3d] fetching balance from:', url)

  try {
    const res = await client.get(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000,
    })

    logger.info('[tripo3d] balance response status:', res.status, 'ok:', res.ok)

    if (!res.ok) {
      const detail = `HTTP ${res.status}`
      logger.warn('[tripo3d] balance query failed:', detail)
      return { ok: true, available: false, configured: true, displayText: '无法查询余额', detail }
    }

    let balanceData = res.body
    if (balanceData && typeof balanceData === 'object' && balanceData.code === 0 && balanceData.data) {
      balanceData = balanceData.data
    }

    const balanceValue = typeof balanceData === 'object' && balanceData !== null
      ? (typeof balanceData.balance === 'number' ? balanceData.balance : null)
      : null
    const frozenValue = typeof balanceData === 'object' && balanceData !== null
      ? (typeof balanceData.frozen === 'number' ? balanceData.frozen : null)
      : null
    const displayText = balanceValue !== null
      ? (frozenValue !== null && frozenValue > 0
          ? `余额: ${balanceValue} credits（冻结 ${frozenValue}）`
          : `余额: ${balanceValue} credits`)
      : '余额查询成功（无法解析余额数值）'

    logger.info('[tripo3d] balance parsed:', balanceValue, 'displayText:', displayText)

    return { ok: true, available: true, configured: true, displayText, detail: balanceData }
  } catch (err) {
    const detail = err?.message || String(err)
    logger.error('[tripo3d] balance query error:', detail)
    return { ok: true, available: false, configured: true, displayText: '余额查询失败', detail }
  }
}

export async function uploadFile(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const url = `${TRIPO3D_API_BASE}/files`

  const fileName = String(payload?.fileName || payload?.name || 'upload.png').trim()
  const fileData = payload?.fileData || payload?.data
  const fileType = String(payload?.fileType || payload?.type || 'image/png').trim()

  if (!fileData) {
    throw invalidParamsError('fileData is required for file upload')
  }

  let buffer
  if (Buffer.isBuffer(fileData)) {
    buffer = fileData
  } else if (typeof fileData === 'string') {
    if (fileData.startsWith('data:')) {
      const base64Match = fileData.match(/^data:[^;]+;base64,(.+)$/)
      if (base64Match) {
        buffer = Buffer.from(base64Match[1], 'base64')
      } else {
        throw invalidParamsError('invalid data URI format')
      }
    } else {
      buffer = Buffer.from(fileData, 'base64')
    }
  } else if (fileData instanceof Uint8Array) {
    buffer = Buffer.from(fileData)
  } else {
    throw invalidParamsError('unsupported fileData format')
  }

  const boundary = '----Tripo3DFileUpload' + Date.now().toString(16)
  const CRLF = '\r\n'

  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}`),
    Buffer.from(`Content-Type: ${fileType}${CRLF}${CRLF}`),
    buffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ])

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
      timeout: 120000,
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
          const data = parsedBody?.data || {}
          const fileToken = String(data.file_token || '').trim()
          if (!fileToken) {
            reject(upstreamError('tripo3d upload failed: no file_token in response'))
            return
          }
          resolve({ ok: true, fileToken, raw: parsedBody })
        } else {
          let errMsg = `HTTP ${res.statusCode}`
          if (typeof parsedBody === 'object' && parsedBody) {
            errMsg = parsedBody.message || parsedBody.error || errMsg
          }
          reject(upstreamError(`tripo3d upload failed: ${errMsg}`))
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      reject(upstreamError(`tripo3d upload failed: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy(new Error('Upload timeout'))
    })

    req.write(multipartBody)
    req.end()
  })
}

function buildImageCreatePayload(payload, mode) {
  const model = String(payload.model || payload.model_version || 'seedream_v4').trim()
  const isBananaModel = model.startsWith('banana')
  const isSeedreamModel = model.startsWith('seedream')

  const body = {
    model,
  }

  const prompt = String(payload.prompt || '').trim()
  const negativePrompt = String(payload.negative_prompt || payload.negativePrompt || '').trim()
  const size = String(payload.size || '').trim()
  const aspectRatio = String(payload.aspect_ratio || payload.aspectRatio || '').trim()
  const outputFormat = String(payload.output_format || payload.outputFormat || 'png').trim()
  const watermark = payload.watermark === true
  const template = String(payload.template || '').trim()
  const numOutputs = Number(payload.num_outputs || payload.numOutputs || 1)
  const seed = typeof payload.seed === 'number' && payload.seed >= 0 ? Math.floor(payload.seed) : undefined
  const input = String(payload.input || payload.image_url || payload.input_url || '').trim()
  const strength = typeof payload.strength === 'number' && payload.strength >= 0 && payload.strength <= 1
    ? payload.strength
    : 0.7

  if (mode !== 'image_to_multiview') {
    if (prompt) body.prompt = prompt
    if (negativePrompt) body.negative_prompt = negativePrompt

    if (isBananaModel && aspectRatio) {
      body.aspect_ratio = aspectRatio
    } else if (size) {
      body.size = size
    }

    body.output_format = outputFormat === 'jpeg' ? 'jpeg' : 'png'
    body.num_outputs = numOutputs >= 1 && numOutputs <= 4 ? numOutputs : 1

    if (isSeedreamModel) {
      body.watermark = watermark
    }

    if (template && (mode === 'text_to_image' || mode === 'image_to_image')) {
      body.template = template
    }

    if (seed !== undefined) {
      body.seed = seed
    }
  }

  if (mode === 'image_to_image' || mode === 'image_to_multiview') {
    body.input = input
    if (mode === 'image_to_image') {
      body.strength = strength
    }
  }

  return body
}

export async function generateTextToImage(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const mode = 'text_to_image'
  const prompt = String(payload.prompt || '').trim()

  if (!prompt) throw invalidParamsError('prompt is required for text_to_image mode')

  const body = buildImageCreatePayload(payload, mode)

  const endpoint = '/generation/text-to-image'
  const url = `${TRIPO3D_API_BASE}${endpoint}`

  console.log('[Tripo3D Backend] text-to-image body:', JSON.stringify(body, null, 2))

  const res = await client.post(url, body, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 60000,
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    if (typeof res.body === 'object' && res.body) {
      errMsg = res.body.message || res.body.error || res.body.msg || errMsg
    }
    throw upstreamError(`tripo3d text-to-image failed: ${errMsg}`)
  }

  const responseData = res.body
  let taskId = ''
  if (responseData && typeof responseData === 'object') {
    if (responseData.code === 0 && responseData.data && typeof responseData.data === 'object') {
      taskId = String(responseData.data.task_id || '').trim()
    } else {
      taskId = String(responseData.task_id || responseData.id || '').trim()
    }
  }

  if (!taskId) throw upstreamError('tripo3d text-to-image failed: no task_id in response')

  repo.upsert({
    taskId,
    mode,
    status: 'queued',
    progress: 0,
    prompt,
    negativePrompt: body.negative_prompt || '',
    modelVersion: body.model,
    thumbnailUrl: '',
    modelUrl: '',
    imageUrls: [],
    errorMessage: '',
    statusText: 'Tripo3D：图片生成任务已创建',
    requestPayload: {
      ...(payload || {}),
      _requestBody: body,
      _requestUrl: url,
      _submittedAt: new Date().toISOString()
    },
    responsePayload: res.body,
    projectId: payload?.projectId || payload?.project_id,
    nodeId: payload?.nodeId || payload?.node_id || '',
    startedAt: new Date().toISOString(),
  })

  return { ok: true, mode, taskId, status: 'queued', raw: res.body }
}

export async function generateImageToImage(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const mode = 'image_to_image'
  const input = String(payload.input || payload.image_url || payload.input_url || '').trim()

  if (!input) throw invalidParamsError('input is required for image_to_image mode')

  const body = buildImageCreatePayload(payload, mode)

  if (!body.input) {
    throw invalidParamsError('input is required for image_to_image mode')
  }

  const endpoint = '/generation/image-to-image'
  const url = `${TRIPO3D_API_BASE}${endpoint}`

  console.log('[Tripo3D Backend] image-to-image body:', JSON.stringify(body, null, 2))

  const res = await client.post(url, body, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 60000,
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    if (typeof res.body === 'object' && res.body) {
      errMsg = res.body.message || res.body.error || res.body.msg || errMsg
    }
    throw upstreamError(`tripo3d image-to-image failed: ${errMsg}`)
  }

  const responseData = res.body
  let taskId = ''
  if (responseData && typeof responseData === 'object') {
    if (responseData.code === 0 && responseData.data && typeof responseData.data === 'object') {
      taskId = String(responseData.data.task_id || '').trim()
    } else {
      taskId = String(responseData.task_id || responseData.id || '').trim()
    }
  }

  if (!taskId) throw upstreamError('tripo3d image-to-image failed: no task_id in response')

  repo.upsert({
    taskId,
    mode,
    status: 'queued',
    progress: 0,
    prompt: body.prompt || '',
    negativePrompt: body.negative_prompt || '',
    modelVersion: body.model,
    thumbnailUrl: '',
    modelUrl: '',
    imageUrls: [],
    errorMessage: '',
    statusText: 'Tripo3D：图生图任务已创建',
    requestPayload: {
      ...(payload || {}),
      _requestBody: body,
      _requestUrl: url,
      _submittedAt: new Date().toISOString()
    },
    responsePayload: res.body,
    projectId: payload?.projectId || payload?.project_id,
    nodeId: payload?.nodeId || payload?.node_id || '',
    startedAt: new Date().toISOString(),
  })

  return { ok: true, mode, taskId, status: 'queued', raw: res.body }
}

export async function generateImageToMultiview(ctx, payload) {
  const apiKey = getApiKey(ctx)
  const client = getHttpClient()
  const repo = ctx.localdb?.tripo3dTasks
  if (!repo) throw internalError('tripo3dTasks repo not available')

  const mode = 'image_to_multiview'
  const input = String(payload.input || payload.image_url || payload.input_url || '').trim()

  if (!input) throw invalidParamsError('input is required for image_to_multiview mode')

  const body = buildImageCreatePayload(payload, mode)

  if (!body.input) {
    throw invalidParamsError('input is required for image_to_multiview mode')
  }

  const endpoint = '/generation/image-to-multiview'
  const url = `${TRIPO3D_API_BASE}${endpoint}`

  console.log('[Tripo3D Backend] image-to-multiview body:', JSON.stringify(body, null, 2))

  const res = await client.post(url, body, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 60000,
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    if (typeof res.body === 'object' && res.body) {
      errMsg = res.body.message || res.body.error || res.body.msg || errMsg
    }
    throw upstreamError(`tripo3d image-to-multiview failed: ${errMsg}`)
  }

  const responseData = res.body
  let taskId = ''
  if (responseData && typeof responseData === 'object') {
    if (responseData.code === 0 && responseData.data && typeof responseData.data === 'object') {
      taskId = String(responseData.data.task_id || '').trim()
    } else {
      taskId = String(responseData.task_id || responseData.id || '').trim()
    }
  }

  if (!taskId) throw upstreamError('tripo3d image-to-multiview failed: no task_id in response')

  repo.upsert({
    taskId,
    mode,
    status: 'queued',
    progress: 0,
    prompt: '',
    negativePrompt: '',
    modelVersion: body.model,
    thumbnailUrl: '',
    modelUrl: '',
    imageUrls: [],
    errorMessage: '',
    statusText: 'Tripo3D：多视图生图任务已创建',
    requestPayload: {
      ...(payload || {}),
      _requestBody: body,
      _requestUrl: url,
      _submittedAt: new Date().toISOString()
    },
    responsePayload: res.body,
    projectId: payload?.projectId || payload?.project_id,
    nodeId: payload?.nodeId || payload?.node_id || '',
    startedAt: new Date().toISOString(),
  })

  return { ok: true, mode, taskId, status: 'queued', raw: res.body }
}

export async function health(ctx) {
  const repo = ctx.localdb?.apiKeys
  if (!repo) return { ok: true, configured: false }
  const keyResult = repo.getPlaintext('tripo3d')
  return { ok: true, configured: !!(keyResult.ok && keyResult.plaintext) }
}
