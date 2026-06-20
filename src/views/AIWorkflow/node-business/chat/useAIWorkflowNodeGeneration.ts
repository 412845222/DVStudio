import type { Store } from 'vuex'
import type { WorkflowNodeChatSubmitPayload, WorkflowNodeGenerationTask, WorkflowState } from '../../../../aiworkflow/types'
import { ComfyUIBridgeService } from '../../../../network/ComfyUIBridgeService'

export type NodeGenerationApiDeps = {
  store: Store<WorkflowState>
  comfyService?: ComfyUIBridgeService | null
  resolveBackendUrl: (raw: string) => string
  pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
  /** Bind produced asset url to the originating node, e.g. as its resource. */
  bindImageResultToNode?: (nodeId: string, url: string) => void
  bindVideoResultToNode?: (nodeId: string, url: string) => void
  bindTextResultToNode?: (nodeId: string, text: string) => void
}

// Loose alias for store action callers that don't want to import types directly.
export type NodeGenerationApiDepsAny = NodeGenerationApiDeps

const makeTaskId = () => `node-gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const getComfyService = (deps: NodeGenerationApiDeps) => {
  if (deps.comfyService) return deps.comfyService
  // 页面已经传入 comfyService，通常不会走到这里；
  // 兜底构造的服务不写 baseUrl，以避免路径拼接错误（例如 /api/workflow/api/workflow/...）。
  return new ComfyUIBridgeService({ baseUrl: '' })
}

const pushToast = (deps: NodeGenerationApiDeps, message: string, tone: 'info' | 'warn' | 'error' = 'warn') => {
  if (typeof deps.pushToast === 'function') deps.pushToast(message, tone)
}

const updateTask = (deps: NodeGenerationApiDeps, taskId: string, patch: Partial<WorkflowNodeGenerationTask>) => {
  deps.store.commit('patchNodeGenerationTask', { taskId, patch })
}

const appendDetail = (deps: NodeGenerationApiDeps, taskId: string, line: string) => {
  deps.store.commit('appendNodeGenerationDetail', { taskId, line })
}

const appendResult = (deps: NodeGenerationApiDeps, taskId: string, result: WorkflowNodeGenerationTask['results'][number]) => {
  deps.store.commit('appendNodeGenerationResult', { taskId, result })
}

/**
 * Collect reference images from the input anchors of a node.
 *
 * Walks the incoming edges of the node. For each edge whose source node
 * carries an image / video resource (identified via `resourceId`),
 * fetches the media as a Blob so it can be uploaded to the backend API.
 *
 * The resolved url is also run through `deps.resolveBackendUrl` to ensure
 * any relative / project-internal URLs are resolved correctly.
 */
const collectReferenceImages = async (
  deps: NodeGenerationApiDeps,
  nodeId: string,
  maxRefs: number = 4,
): Promise<Array<{ name: string; blob: Blob }>> => {
  const state = deps.store.state as {
    nodesById: Record<string, any>
    edgesById: Record<string, any>
    edgeOrder: string[]
    resourcesById: Record<string, any>
  }
  const node = state.nodesById[nodeId]
  if (!node) return []

  // Find all incoming edges to this node.
  const incoming: Array<any> = []
  for (const edgeId of state.edgeOrder) {
    const edge = state.edgesById[edgeId]
    if (!edge) continue
    if (String(edge.toNodeId ?? '') === String(nodeId)) incoming.push(edge)
  }

  const refs: Array<{ name: string; blob: Blob }> = []
  for (const edge of incoming) {
    if (refs.length >= maxRefs) break
    const sourceNode = state.nodesById[edge.fromNodeId]
    if (!sourceNode) continue

    // Prefer an explicit resource on the source node.
    const resourceRid = String(sourceNode.resourceId ?? '').trim()
    let candidateUrl: string = ''
    if (resourceRid) {
      const res = state.resourcesById[resourceRid]
      candidateUrl = typeof res?.url === 'string' ? String(res.url) : ''
    }
    if (!candidateUrl) {
      // Fallback: try the "last generated" image url if available for image nodes.
      const imageSettings = sourceNode.imageSettings ?? {}
      const lastGenerated = typeof imageSettings?.lastGeneratedImageUrl === 'string'
        ? String(imageSettings.lastGeneratedImageUrl)
        : ''
      candidateUrl = lastGenerated
    }
    if (!candidateUrl) continue

    const resolved = deps.resolveBackendUrl(candidateUrl)
    try {
      const resp = await fetch(resolved)
      if (!resp.ok) continue
      const blob = await resp.blob()
      if (!blob || blob.size === 0) continue
      const name = `ref-${sourceNode.type || 'image'}-${edge.fromNodeId}-${Date.now()}.png`
      refs.push({ name, blob })
    } catch {
      continue
    }
  }
  return refs
}

const normalizeImageModel = (params: Record<string, any>) => {
  const rawModel = String(params?.imageModel ?? params?.model ?? '').trim()
  if (rawModel.startsWith('jimeng')) return { kind: 'jimeng', model: rawModel }
  if (rawModel.startsWith('nanobanana')) return { kind: 'nanobanana', model: rawModel }
  // When user picks 'seedream' as the interface, the actual model ID is in seedreamModelVersion.
  if (rawModel === 'seedream') {
    const seedreamVersion = String(params?.seedreamModelVersion ?? '').trim()
    return { kind: 'seedream', model: seedreamVersion || 'doubao-seedream-4-5-251128' }
  }
  // Default to seedream (Doubao / 字节方舟) when the user did not pick a provider.
  return { kind: 'seedream', model: rawModel || 'doubao-seedream-4-5-251128' }
}

const normalizeVideoModel = (params: Record<string, any>) => {
  const rawModel = String(params?.videoModel ?? params?.model ?? '').trim()
  if (rawModel.startsWith('jimeng')) return { kind: 'jimeng', model: rawModel }
  // When user picks 'seedance' as the interface, the actual model ID is in seedanceModelVersion.
  if (rawModel === 'seedance') {
    const seedanceVersion = String(params?.seedanceModelVersion ?? '').trim()
    return { kind: 'seedance', model: seedanceVersion || 'doubao-seedance-2-0-260128' }
  }
  // Default to seedance (Doubao / 字节方舟) when the user did not pick a provider.
  return { kind: 'seedance', model: rawModel || 'doubao-seedance-2-0-260128' }
}

const createTask = (payload: WorkflowNodeChatSubmitPayload): WorkflowNodeGenerationTask => ({
  id: makeTaskId(),
  nodeId: payload.nodeId,
  nodeType: payload.nodeType,
  status: 'submitting',
  statusText: '正在提交任务…',
  progress: 5,
  startedAt: Date.now(),
  results: [],
  detailLines: [],
})

export const runNodeGenerationTask = async (
  deps: NodeGenerationApiDeps,
  payload: WorkflowNodeChatSubmitPayload,
) => {
  const node = deps.store.state.nodesById[payload.nodeId]
  if (!node) {
    pushToast(deps, '未找到对应节点，无法发起生成任务。', 'error')
    return
  }
  if (!payload.prompt.trim() && payload.nodeType !== 'model3d') {
    pushToast(deps, '请先填写提示词再发起生成。', 'warn')
    return
  }

  const task = createTask(payload)
  deps.store.commit('registerNodeGenerationTask', { task })
  deps.store.commit('setNodeChatSubmitting', { submitting: true })

  try {
    if (payload.nodeType === 'text') {
      await runTextTask(deps, task, payload)
    } else if (payload.nodeType === 'image') {
      await runImageTask(deps, task, payload)
    } else if (payload.nodeType === 'video') {
      await runVideoTask(deps, task, payload)
    } else if (payload.nodeType === 'model3d') {
      // 3D nodes delegate to Meshy integration; mark as a stub so users see status.
      runModel3dStub(deps, task, payload)
    }
  } catch (err: any) {
    const raw = err?.message ? String(err.message) : String(err ?? '生成任务异常')
    // 典型的浏览器网络错误（后端未启、CORS 被拒、或断网）给出更明确的中文提示。
    const looksLikeNetworkError =
      /Failed to fetch/i.test(raw) ||
      /NetworkError/i.test(raw) ||
      /TypeError.*fetch/i.test(raw) ||
      /CORS/i.test(raw) ||
      /Failed to connect/i.test(raw) ||
      /ECONNREFUSED/i.test(raw)
    const message = looksLikeNetworkError
      ? `后端不可达（${raw}）。请确认 django-app 已在 127.0.0.1:5800 启动，或在 Settings 页面设置正确的后端地址。`
      : raw
    appendDetail(deps, task.id, message)
    updateTask(deps, task.id, { status: 'error', statusText: `失败：${message}`, errorMessage: message, finishedAt: Date.now() })
    pushToast(deps, `${labelForType(payload.nodeType)}生成失败：${message}`, 'error')
  } finally {
    deps.store.commit('setNodeChatSubmitting', { submitting: false })
  }
}

const labelForType = (t: WorkflowNodeGenerationTask['nodeType']) => {
  if (t === 'text') return '文本'
  if (t === 'image') return '图片'
  if (t === 'video') return '视频'
  return '3D 模型'
}

const runTextTask = async (
  deps: NodeGenerationApiDeps,
  task: WorkflowNodeGenerationTask,
  payload: WorkflowNodeChatSubmitPayload,
) => {
  const svc = getComfyService(deps)
  updateTask(deps, task.id, { status: 'running', statusText: '正在调用文本模型（字节方舟 Doubao）…', progress: 15 })
  appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

  // Default provider is "bytedance" (Doubao). User params may override to "deepseek".
  const params = payload.params ?? {}
  const provider = String(params.model ?? params.provider ?? 'bytedance').toLowerCase()
  const modelId = String(params.modelId ?? params.textModelVersion ?? '').trim() || (provider === 'deepseek' ? 'deepseek-chat' : 'doubao-seed-2-0-pro-260215')
  const body: Record<string, any> = { content: payload.prompt, provider, modelId }
  if (params.speed) body.speed = params.speed
  if (params.thinking) body.thinking = params.thinking
  if (params.responseFormat) body.responseFormat = params.responseFormat
  if (params.maxTokens) body.maxTokens = params.maxTokens

  let accumulated = ''
	try {
		for await (const ev of svc.blueprintChatStream({ content: String(body.content ?? ''), history: body.history, provider: body.provider, modelId: body.modelId })) {
      if (ev.type === 'done') break
      if (ev.type === 'error') {
        throw new Error(String(ev.error?.message ?? 'unknown'))
      }
      const message = ev.message as any
      if (message?.type === 'agentToUi/text') {
        const delta = String(message.payload?.text ?? '')
        if (delta) accumulated += delta
        updateTask(deps, task.id, { progress: Math.min(75, task.progress + 2), statusText: '文本模型正在生成内容…' })
        continue
      }
      if (message?.type === 'agentToUi/taskStatus') {
        const line = String(message.payload?.message ?? message.payload?.phase ?? '')
        if (line) appendDetail(deps, task.id, line)
        continue
      }
    }
  } catch (err: any) {
    // Fallback: attempt simple non-streaming endpoint to keep the node task observable.
    const fallbackMsg = err?.message ? String(err.message) : String(err ?? 'stream failed')
    appendDetail(deps, task.id, `流式调用失败：${fallbackMsg}`)
    updateTask(deps, task.id, { status: 'running', statusText: '尝试失败回退…' })
    try {
      const plain = await (svc as any).blueprintChat(body)
      const text = typeof plain?.text === 'string' ? plain.text : typeof plain?.content === 'string' ? plain.content : ''
      if (text) accumulated = text
    } catch (fallbackErr: any) {
      appendDetail(deps, task.id, `兜底请求失败：${String(fallbackErr?.message ?? fallbackErr ?? '')}`)
      throw err
    }
  }

  const finalText = accumulated.trim()
  if (!finalText) throw new Error('文本模型返回为空')
  appendResult(deps, task.id, { kind: 'text', url: '', label: finalText.slice(0, 80) })
  if (typeof deps.bindTextResultToNode === 'function') deps.bindTextResultToNode(payload.nodeId, finalText)
  updateTask(deps, task.id, { status: 'completed', statusText: '文本生成完成', progress: 100, finishedAt: Date.now() })
}

const runImageTask = async (
  deps: NodeGenerationApiDeps,
  task: WorkflowNodeGenerationTask,
  payload: WorkflowNodeChatSubmitPayload,
) => {
  const svc = getComfyService(deps)
  const params = payload.params ?? {}
  const { kind, model } = normalizeImageModel(params)
  updateTask(deps, task.id, { status: 'running', statusText: `正在调用图片模型（${kind}）…`, progress: 15 })
  appendDetail(deps, task.id, `模型：${model}`)
  appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

  const form = new FormData()
  form.set('prompt', payload.prompt)
  form.set('imageModel', model)
  if (typeof params.aspectRatio === 'string' && params.aspectRatio) form.set('aspectRatio', params.aspectRatio)
  if (typeof params.resolution === 'string' && params.resolution) form.set('resolution', params.resolution)
  const quantity = Number(params.quantity ?? 1)
  if (Number.isFinite(quantity) && quantity > 0) form.set('quantity', String(Math.min(8, Math.max(1, Math.floor(quantity)))))

  // Collect connected reference images (anchor-based input) for seedream image-to-image.
  if (kind === 'seedream') {
    const refs = await collectReferenceImages(deps, payload.nodeId, 4)
    for (const ref of refs) form.append('refImages', ref.blob, ref.name)
  }

  const stream = kind === 'jimeng'
    ? (svc as any).jimengImageGenerateStream(form)
    : kind === 'nanobanana'
      ? (svc as any).nanoBananaGenerateStream(form)
      : (svc as any).seedreamGenerateStream(form)

  let produced = 0
  for await (const ev of stream) {
    if (ev.type === 'done') break
    if (ev.type === 'error') {
      const message = String(ev.error?.message ?? 'unknown')
      throw new Error(message)
    }
    const message = ev.message as any
    if (message?.type === 'agentToUi/chatMessage') {
      const obj: any = (() => {
        try {
          const raw = String(message.payload?.content ?? '')
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      })()
      if (obj && typeof obj.imageUrl === 'string') {
        const resolved = deps.resolveBackendUrl(obj.imageUrl)
        appendResult(deps, task.id, { kind: 'image', url: resolved, label: `图 ${produced + 1}` })
        if (produced === 0 && typeof deps.bindImageResultToNode === 'function') {
          deps.bindImageResultToNode(payload.nodeId, resolved)
        }
        produced += 1
        updateTask(deps, task.id, { status: 'running', statusText: `已接收图片 ${produced} 张`, progress: Math.min(95, 40 + produced * 12) })
      }
      continue
    }
    if (message?.type === 'agentToUi/taskStatus') {
      const line = String(message.payload?.message ?? message.payload?.phase ?? '')
      if (line) appendDetail(deps, task.id, line)
      continue
    }
    if (message?.type === 'agentToUi/error') {
      const line = String(message.payload?.message ?? 'unknown')
      throw new Error(line)
    }
  }

  if (produced === 0) throw new Error('未接收到图片结果，请检查 API 配置与提示词')
  updateTask(deps, task.id, { status: 'completed', statusText: `图片生成完成（共 ${produced} 张）`, progress: 100, finishedAt: Date.now() })
}

const runVideoTask = async (
  deps: NodeGenerationApiDeps,
  task: WorkflowNodeGenerationTask,
  payload: WorkflowNodeChatSubmitPayload,
) => {
  const svc = getComfyService(deps)
  const params = payload.params ?? {}
  const { kind, model } = normalizeVideoModel(params)
  updateTask(deps, task.id, { status: 'running', statusText: `正在调用视频模型（${kind}）…`, progress: 20 })
  appendDetail(deps, task.id, `模型：${model}`)
  appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

  const form = new FormData()
  form.set('prompt', payload.prompt)
  form.set('model', model)
  if (typeof params.mode === 'string' && params.mode) form.set('mode', params.mode)
  if (typeof params.ratio === 'string' && params.ratio) form.set('ratio', params.ratio)
  if (typeof params.resolution === 'string' && params.resolution) form.set('resolution', params.resolution)
  const duration = Number(params.duration ?? 5)
  if (Number.isFinite(duration) && duration > 0) form.set('duration', String(Math.min(30, Math.max(1, Math.floor(duration)))))
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) form.set('seed', String(params.seed))
  form.set('generateAudio', params.generateAudio ? '1' : '0')
  form.set('watermark', params.watermark ? '1' : '0')

  // Collect connected reference images from input anchors for seedance i2v/r2v.
  if (kind === 'seedance') {
    const refs = await collectReferenceImages(deps, payload.nodeId, 4)
    for (const ref of refs) form.append('refImages', ref.blob, ref.name)
    // Map the panel's "video mode" to the backend refMode semantics:
    //   image_to_video → first (use single anchor image as first frame)
    //   first-last     → first-last
    //   reference      → reference (multi-reference, e.g. consistent character)
    //   text_to_video / auto → auto
    const rawMode = typeof params.mode === 'string' ? params.mode : ''
    if (rawMode === 'image_to_video') form.set('refMode', 'first')
    else if (rawMode === 'first-last') form.set('refMode', 'first-last')
    else if (rawMode === 'reference') form.set('refMode', 'reference')
    else form.set('refMode', 'auto')
  }

  const stream = kind === 'jimeng' ? (svc as any).jimengVideoGenerateStream(form) : (svc as any).seedanceGenerateStream(form)

  let produced = 0
  for await (const ev of stream) {
    if (ev.type === 'done') break
    if (ev.type === 'error') {
      const message = String(ev.error?.message ?? 'unknown')
      throw new Error(message)
    }
    const message = ev.message as any
    if (message?.type === 'agentToUi/chatMessage') {
      const obj: any = (() => {
        try {
          const raw = String(message.payload?.content ?? '')
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      })()
      if (obj) {
        const urlRaw = String(obj.videoUrl ?? obj.videoUrlRemote ?? obj.url ?? '').trim()
        const url = deps.resolveBackendUrl(urlRaw)
        const downloadStatus = String(obj.downloadStatus ?? '').trim()
        const progressRaw = Number(obj.downloadProgress ?? 0)
        const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : task.progress
        if (url) {
          appendResult(deps, task.id, { kind: 'video', url, label: '视频结果' })
          if (produced === 0 && typeof deps.bindVideoResultToNode === 'function') {
            deps.bindVideoResultToNode(payload.nodeId, url)
          }
          produced += 1
        }
        updateTask(deps, task.id, {
          status: produced > 0 ? 'completed' : 'running',
          statusText: downloadStatus || (produced > 0 ? '视频结果已就绪' : '任务处理中…'),
          progress,
          ...(produced > 0 ? { finishedAt: Date.now() } : {}),
        })
      }
      continue
    }
    if (message?.type === 'agentToUi/taskStatus') {
      const line = String(message.payload?.message ?? message.payload?.phase ?? '')
      if (line) {
        appendDetail(deps, task.id, line)
        updateTask(deps, task.id, { status: 'running', statusText: line, progress: Math.min(80, task.progress + 2) })
      }
      continue
    }
    if (message?.type === 'agentToUi/error') {
      const line = String(message.payload?.message ?? 'unknown')
      throw new Error(line)
    }
  }

  if (produced === 0) throw new Error('未接收到视频结果，请检查 API 配置与提示词')
  updateTask(deps, task.id, { status: 'completed', statusText: '视频生成完成', progress: 100, finishedAt: Date.now() })
}

const runModel3dStub = (deps: NodeGenerationApiDeps, task: WorkflowNodeGenerationTask, payload: WorkflowNodeChatSubmitPayload) => {
  appendDetail(deps, task.id, '3D 模型节点暂不直接调用字节方舟接口，请使用 Meshy 节点或本地 ComfyUI 流程。')
  updateTask(deps, task.id, { status: 'error', statusText: '当前节点类型尚未支持直接提交', errorMessage: '3D 生成请使用 Meshy 节点', finishedAt: Date.now() })
  pushToast(deps, `节点「${labelForType(payload.nodeType)}」尚未在此环境中接入`, 'warn')
}

export const getLatestTaskForNode = (state: WorkflowState, nodeId: string): WorkflowNodeGenerationTask | null => {
  const ids = state.nodeGenerationTaskIdsByNodeId?.[nodeId] || []
  if (!ids.length) return null
  const id = ids[0]
  return state.nodeGenerationTasksById?.[id] || null
}

export const getTasksForNode = (state: WorkflowState, nodeId: string): WorkflowNodeGenerationTask[] => {
  const ids = state.nodeGenerationTaskIdsByNodeId?.[nodeId] || []
  return ids.map((id) => state.nodeGenerationTasksById?.[id]).filter((t): t is WorkflowNodeGenerationTask => Boolean(t))
}
