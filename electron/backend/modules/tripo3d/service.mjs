import { getHttpClient } from '../../core/http-client.mjs'
import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'

const TRIPO3D_API_BASE = 'https://api.tripo3d.ai/v2/openapi'

function getApiKey(ctx) {
  const repo = ctx.localdb?.apiKeys
  if (!repo) throw internalError('apiKeys repo not available')
  const result = repo.getPlaintext('tripo3d')
  if (!result.ok) throw internalError(result.error || 'failed to read tripo3d api key')
  const key = String(result.plaintext || '').trim()
  if (!key) throw invalidParamsError('tripo3d api key is not configured')
  return key
}

function normalizeTask(taskId, obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: true, taskId, status: 'unknown', progress: 0, thumbnailUrl: '', modelUrl: '', statusText: 'invalid response', errorMessage: '' }
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

  const thumbnailUrl = String(outputObj.thumbnail || outputObj.thumbnail_url || obj.thumbnail_url || '').trim()
  let modelUrl = ''
  if (outputObj.model && typeof outputObj.model === 'object') {
    modelUrl = String(outputObj.model.url || outputObj.model.glb || '').trim()
  }
  if (!modelUrl) {
    modelUrl = String(outputObj.model_url || outputObj.pbr_model_url || '').trim()
  }

  const prompt = String(inputObj.prompt || obj.prompt || '').trim()
  const negativePrompt = String(inputObj.negative_prompt || obj.negative_prompt || '').trim()
  const mode = String(obj.type || inputObj.type || 'text_to_model').trim()
  const modelVersion = String(inputObj.model || inputObj.model_version || '').trim()

  const errorMessage = String(obj.error || obj.error_message || outputObj.error || '').trim()

  let statusText = String(obj.status_text || '').trim()
  if (!statusText) {
    if (status === 'queued') statusText = 'Tripo3D：任务排队中'
    else if (status === 'running') statusText = `Tripo3D：生成中 ${progress}%`
    else if (status === 'success' || status === 'succeeded' || status === 'completed') statusText = 'Tripo3D：生成完成'
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
  const modelVersion = String(payload.model_version || payload.model || payload.modelVersion || 'v2.0-20240919').trim()
  const faceLimit = Number(payload.face_limit || payload.faceLimit || 0)
  const texture = payload.texture !== false
  const pbr = payload.pbr === true
  const enableImageAutofix = payload.enable_image_autofix !== false
  const textureAlignment = String(payload.texture_alignment || '').trim()
  const orientation = String(payload.orientation || '').trim()
  const textureQuality = String(payload.texture_quality || '').trim()
  const geometryQuality = String(payload.geometry_quality || '').trim()
  const autoSize = payload.auto_size !== false
  const quad = payload.quad === true
  const smartLowPoly = payload.smart_low_poly === true
  const generateParts = payload.generate_parts === true
  const compress = String(payload.compress || '').trim()
  const exportUv = payload.export_uv === true

  if (mode === 'text_to_model') {
    if (!prompt) return [null, null, 'prompt is required for text_to_model mode']
    body.prompt = prompt
  } else if (mode === 'image_to_model') {
    const inputUrl = String(payload.input || payload.image_url || payload.file?.url || '').trim()
    const fileData = payload.file
    if (!inputUrl && (!fileData || !fileData.type || !fileData.data)) {
      return [null, null, 'image_url or file is required for image_to_model mode']
    }
    if (prompt) body.prompt = prompt
    if (fileData && fileData.type && fileData.data) {
      body.file = { type: fileData.type, data: fileData.data }
    } else {
      body.file = { type: 'png', url: inputUrl }
    }
  } else if (mode === 'multiview_to_model') {
    const inputs = payload.inputs
    const files = payload.files
    if (Array.isArray(inputs) && inputs.length >= 2) {
      body.files = inputs.map((item) => {
        if (typeof item === 'object' && item !== null) {
          if (item.url) {
            return { type: item.type || 'png', url: item.url, view: item.view }
          }
          const viewKey = Object.keys(item)[0]
          const url = item[viewKey]
          return { type: 'png', url, view: viewKey }
        }
        return { type: 'png', url: item }
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
  if (Number.isFinite(faceLimit) && faceLimit > 0) body.face_limit = Math.floor(faceLimit)
  body.texture = texture
  body.pbr = pbr
  body.enable_image_autofix = enableImageAutofix
  if (textureAlignment) body.texture_alignment = textureAlignment
  if (orientation) body.orientation = orientation
  if (textureQuality) body.texture_quality = textureQuality
  if (geometryQuality) body.geometry_quality = geometryQuality
  body.auto_size = autoSize
  body.quad = quad
  body.smart_low_poly = smartLowPoly
  body.generate_parts = generateParts
  if (compress) body.compress = compress
  body.export_uv = exportUv

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

  console.log('[Tripo3D Backend] 构建的请求 body (mode=' + mode + '):', JSON.stringify(body, null, 2))

  const url = `${TRIPO3D_API_BASE}/task`

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

  const url = `${TRIPO3D_API_BASE}/task/${encodeURIComponent(taskId)}`

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

  const url = `${TRIPO3D_API_BASE}/task/${encodeURIComponent(taskId)}/cancel`

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
  const repo = ctx.localdb?.apiKeys
  if (!repo) throw internalError('apiKeys repo not available')

  const keyResult = repo.getPlaintext('tripo3d')
  if (!keyResult.ok || !keyResult.plaintext) {
    return { ok: true, available: false, configured: false, displayText: '未配置Tripo3D API Key', detail: '' }
  }

  const apiKey = keyResult.plaintext
  const client = getHttpClient()
  const url = `${TRIPO3D_API_BASE}/user/balance`

  try {
    const res = await client.get(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000,
    })

    if (!res.ok) {
      return { ok: true, available: false, configured: true, displayText: '无法查询余额', detail: `HTTP ${res.status}` }
    }

    let balanceData = res.body
    if (balanceData && typeof balanceData === 'object' && balanceData.code === 0 && balanceData.data) {
      balanceData = balanceData.data
    }

    const balanceValue = typeof balanceData === 'object' && balanceData !== null
      ? (typeof balanceData.balance === 'number' ? balanceData.balance : (typeof balanceData.credits === 'number' ? balanceData.credits : null))
      : null
    const displayText = balanceValue !== null
      ? `余额: ${balanceValue} credits`
      : '余额查询成功（无法解析余额数值）'

    return { ok: true, available: true, configured: true, displayText, detail: balanceData }
  } catch (err) {
    return { ok: true, available: false, configured: true, displayText: '余额查询失败', detail: err?.message || String(err) }
  }
}

export async function health(ctx) {
  const repo = ctx.localdb?.apiKeys
  if (!repo) return { ok: true, configured: false }
  const keyResult = repo.getPlaintext('tripo3d')
  return { ok: true, configured: !!(keyResult.ok && keyResult.plaintext) }
}
