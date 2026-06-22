import type { Ref } from 'vue'
import type {
  BottomChatMessage,
  LocalExecFlowEvent,
  LocalExecSessionItem,
  NanoBananaConfig,
  SeedanceConfig,
} from '../../../../ui/UIComponent/BottomChatDock.vue'
import type { WorkflowAnchorSpec, WorkflowNode } from '../../../../aiworkflow/types'

// ChatBridgeService: Transitional compatibility interface for Copilot CLI bridge.
// Method names retain "codex" prefix for backward compatibility with backend adapter.
// Backend implementation uses Copilot CLI subprocess calls, not Codex SDK.
// Planned migration: Rename to "copilotCreateSession" etc. when backend API stabilizes.
type ChatBridgeService = {
  blueprintChatStream: (payload: any) => AsyncIterable<any>
  localExecCreateSession?: (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => Promise<any>
  localExecStreamMessage?: (sessionId: string, payload: any, signal?: AbortSignal) => AsyncIterable<any>
  localExecListMessages?: (sessionId: string, projectId: number | null) => Promise<any>
  localExecSubmitApproval?: (payload: { sessionId: string; messageId: string; decision: 'accept' | 'decline'; projectId?: number | null }) => Promise<any>
  // Codex-compatible session creation (backend: Copilot CLI)
  codexCreateSession: (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => Promise<any>
  // Codex-compatible message stream (backend: Copilot CLI SSE)
  codexStreamMessage: (sessionId: string, payload: any, signal?: AbortSignal) => AsyncIterable<any>
  codexListMessages: (sessionId: string, projectId: number | null) => Promise<any>
  codexSubmitApproval: (payload: { sessionId: string; messageId: string; decision: 'accept' | 'decline'; projectId?: number | null }) => Promise<any>
  nanoBananaCacheRefImages: (form: FormData) => Promise<any>
  seedreamCacheRefImages: (form: FormData) => Promise<any>
  nanoBananaGenerateStream: (form: FormData) => AsyncIterable<any>
  seedreamGenerateStream: (form: FormData) => AsyncIterable<any>
  jimengImageGenerateStream: (form: FormData) => AsyncIterable<any>
  jimengVideoGenerateStream: (form: FormData) => AsyncIterable<any>
  seedanceGenerateStream: (form: FormData) => AsyncIterable<any>
  meshyGenerate: (payload: Record<string, any>) => Promise<any>
  meshyGenerateImage: (form: FormData) => Promise<any>
  meshyTask: (taskId: string, mode: string) => Promise<any>
}

export const useAIWorkflowChatGeneration = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
      edgeOrder: string[]
      edgesById: Record<string, any>
    }
    commit: (type: string, value?: any) => void
  }
  chatModelKey: Ref<string>
  chatDraft: Ref<string>
  chatModelId: Ref<string>
  chatMessages: Ref<BottomChatMessage[]>
  chatSending: Ref<boolean>
  chatRunState: Ref<'idle' | 'sending' | 'stopping' | 'error'>
  chatTaskStatusText: Ref<string>
  localExecStreamMode: Ref<'real' | 'mock'>
  agentConversationMode: Ref<'agent' | 'ask' | 'plan'>
  codexSessions: Ref<LocalExecSessionItem[]>
  codexActiveSessionId: Ref<string>
  codexFlowEvents: Ref<LocalExecFlowEvent[]>
  nanoPreviewUrl: Ref<string>
  nanoPreviewUrls: Ref<string[]>
  nanoPreviewFallbackUrls: Ref<string[]>
  nanoPreviewSourcePaths: Ref<string[]>
  nanoPreviewLoadingStates: Ref<boolean[]>
  nanoPreviewDownloadStatuses: Ref<string[]>
  nanoPreviewDownloadProgresses: Ref<number[]>
  nanoPreviewLocalReadyStates: Ref<boolean[]>
  nanoStatus: Ref<string>
  nanoBilling: Ref<string>
  nanoModelUsed: Ref<string>
  nanoDetail: Ref<string>
  currentProjectId: Ref<number | null>
  ensureProjectId?: (opts?: { silent?: boolean }) => Promise<number | null>
  NANO_ANCHOR_NODE_ID: string
  NANO_REF_IMAGE_MAX: number
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  getFirstIncomingEdge: (nodeId: string, anchorId?: string) => any
  nodeResourceUrl: (node: WorkflowNode) => string | null
  nodeResourceName: (node: WorkflowNode) => string | null
  buildCroppedImageTransferFile: (fromNode: WorkflowNode, sourceUrl: string, sourceName: string) => Promise<File | null>
  fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
  uploadLocalResourceAndGetUrl: (
    localUrl: string,
    kind: 'image' | 'video' | 'file',
    resourceName: string,
    opts?: { projectId?: number | null },
  ) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
  resolveBackendUrl: (value: string) => string
  getChatService: () => ChatBridgeService
  onSeedanceTaskObserved?: (taskId: string, stage: 'created' | 'completed') => void
}) => {
  const makeChatId = () => `aiwf-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let activeAbortController: AbortController | null = null

  const setTaskStatus = (text: string) => {
    payload.chatTaskStatusText.value = text
  }

  const updateAssistantMessageContent = (messageId: string, updater: (prev: string) => string) => {
    const id = String(messageId || '').trim()
    if (!id) return
    let changed = false
    payload.chatMessages.value = payload.chatMessages.value.map((message) => {
      if (message.id !== id) return message
      changed = true
      return {
        ...message,
        content: updater(String(message.content || '')),
      }
    })
    if (!changed) return
  }

  const seedanceSupportsServiceTier = (modelId: string) =>
    String(modelId || '').trim() === 'doubao-seedance-1-5-pro-251215'

  const appendNanoDetail = (line: string) => {
    const text = String(line || '').trim()
    if (!text) return
    payload.nanoDetail.value = payload.nanoDetail.value ? `${payload.nanoDetail.value}\n${text}` : text
  }

  const pushLocalExecFlow = (event: Omit<LocalExecFlowEvent, 'id'>) => {
    payload.codexFlowEvents.value = payload.codexFlowEvents.value.concat([
      { id: makeChatId(), ...event },
    ])
  }

  const DEBUGGER_NOISE_RE = [
    /^Debugger attached\.?$/i,
    /^Waiting for the debugger to disconnect\.{0,3}$/i,
    /^Debugger listening on ws:\/\/.+$/i,
    /^For help, see:\s*https?:\/\/nodejs\.org\/en\/docs\/inspector\/?$/i,
    /^To start debugging, open the following URL in (?:Chrome|Edge):.+$/i,
  ]

  const normalizeChatErrorMessage = (input: unknown) => {
    const raw = String(input ?? '').replace(/\r/g, '\n').trim()
    if (!raw) return '本地执行异常，请重试。'
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const cleaned = lines.filter((line) => !DEBUGGER_NOISE_RE.some((re) => re.test(line))).join(' ')
    return cleaned || '本地执行异常，请重试。'
  }

  const parseLocalExecSlashCommand = (raw: string) => {
    const text = String(raw || '').trim()
    const out = {
      content: text,
      skillHints: [] as string[],
      executionHints: [] as string[],
    }
    if (!text.startsWith('/')) return out

    const idx = text.indexOf(' ')
    const cmd = (idx > 0 ? text.slice(1, idx) : text.slice(1)).trim().toLowerCase()
    const args = (idx > 0 ? text.slice(idx + 1) : '').trim()

    if (cmd === 'plan') {
      out.content = args ? `请先输出执行计划，再逐步执行：${args}` : '请先输出执行计划，再逐步执行。'
      out.skillHints.push('slash-command:/plan')
      out.executionHints.push('plan-first-before-tool-execution')
      return out
    }
    if (cmd === 'read') {
      out.content = args ? `请阅读并总结以下目标（文件/目录/关键词）：${args}` : '请阅读并总结当前工作区的关键上下文。'
      out.skillHints.push('slash-command:/read')
      out.executionHints.push('prefer-read-only-tooling')
      return out
    }
    if (cmd === 'edit') {
      out.content = args ? `请对以下目标执行编辑并给出实际变更：${args}` : '请执行一次最小可行编辑并返回实际变更。'
      out.skillHints.push('slash-command:/edit')
      out.executionHints.push('file-change-first')
      return out
    }
    if (cmd === 'run') {
      out.content = args ? `请执行命令并返回结果：${args}` : '请执行一个必要命令并返回输出。'
      out.skillHints.push('slash-command:/run')
      out.executionHints.push('command-execution-mode')
      return out
    }

    return out
  }

  const onSend = async () => {
    if (payload.chatModelKey.value === 'nanobanana' || payload.chatModelKey.value === 'seedance') return
    if (payload.chatSending.value) return
    const content = String(payload.chatDraft.value || '').trim()
    if (!content) return

    const history = payload.chatMessages.value
      .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
      .map((message) => ({ role: message.role, content: message.content }))

    const userMsg: BottomChatMessage = { id: makeChatId(), role: 'user', content }
    const assistantMsg: BottomChatMessage = { id: makeChatId(), role: 'assistant', content: '' }
    payload.chatMessages.value = payload.chatMessages.value.concat([userMsg, assistantMsg])
    payload.store.commit('setChatDraft', { text: '' })

    const abortController = new AbortController()
    activeAbortController = abortController
    payload.chatSending.value = true
    payload.chatRunState.value = 'sending'
    setTaskStatus('AI 任务：正在准备请求…')
    try {
      const svc = payload.getChatService()

      if (payload.chatModelKey.value === 'codex') {
        let projectId = payload.currentProjectId.value
        if (projectId == null && payload.ensureProjectId) {
          projectId = await payload.ensureProjectId({ silent: true })
        }
        if (projectId == null) {
          payload.pushToast('无法启动 Copilot CLI：自动保存项目失败。', 'warn')
          payload.chatRunState.value = 'error'
          setTaskStatus('AI 任务：启动失败')
          return
        }

        const parsed = parseLocalExecSlashCommand(content)
        let sessionId = String(payload.codexActiveSessionId.value || '').trim()
        const createSession = svc.localExecCreateSession ?? svc.codexCreateSession
        const streamMessage = svc.localExecStreamMessage ?? svc.codexStreamMessage
        if (!sessionId) {
          setTaskStatus('AI 任务：正在创建会话…')
          const created = await createSession({
            title: content.slice(0, 24),
            model: payload.chatModelId.value,
            projectId,
          })
          if ((created as any)?.error) {
            throw new Error(String((created as any).error || 'create codex session failed'))
          }
          sessionId = String((created as any)?.id || '').trim()
          if (!sessionId) throw new Error('create codex session returned empty id')
          payload.codexActiveSessionId.value = sessionId
          payload.codexSessions.value = [
            {
              id: sessionId,
              title: String((created as any)?.title || 'Copilot CLI 会话').trim() || 'Copilot CLI 会话',
              status: String((created as any)?.status || 'active'),
              modelName: String((created as any)?.model_name || payload.chatModelId.value || ''),
              source: 'copilot-cli',
            },
            ...payload.codexSessions.value.filter((s) => s.id !== sessionId),
          ]
        }

        pushLocalExecFlow({
          kind: 'session',
          title: '会话已就绪',
          detail: sessionId,
          status: 'completed',
          source: 'copilot-cli',
        })
        setTaskStatus('AI 任务：会话已就绪，开始执行…')

        let receivedAssistantDone = false
        let receivedTurnDone = false
        let receivedError = false

        for await (const ev of streamMessage(sessionId, {
          content: parsed.content,
          references: [],
          projectId,
          skillHints: parsed.skillHints,
          executionHints: parsed.executionHints,
          agentMode: payload.agentConversationMode.value,
          permissionProfile: 'default',
        }, abortController.signal)) {
          if (ev.type === 'done') break
          if (ev.type === 'error') {
            const errMsgRaw = String(ev.error?.message ?? 'unknown')
            const isAborted = abortController.signal.aborted || /abort/i.test(errMsgRaw)
            if (isAborted) {
              setTaskStatus('AI 任务：已停止')
              break
            }
            const errMsg = normalizeChatErrorMessage(errMsgRaw)
            receivedError = true
            payload.chatRunState.value = 'error'
            setTaskStatus('AI 任务：错误')
            payload.pushToast('Copilot CLI 对话失败：' + errMsg, 'warn')
            pushLocalExecFlow({ kind: 'error', title: '流式错误', detail: errMsg, status: 'failed', source: 'copilot-cli' })
            break
          }

          if (ev.type !== 'event') continue
          const name = String((ev as any).event || '')
          const data = (ev as any).data ?? {}

          if (name === 'assistant_delta') {
            const delta = String((data as any)?.delta || '')
            if (delta) {
              updateAssistantMessageContent(assistantMsg.id, (prev) => prev + delta)
            }
            setTaskStatus('AI 任务：正在生成回复…')
            continue
          }

          if (name === 'assistant_done') {
            receivedAssistantDone = true
            const doneTextRaw = String((data as any)?.content ?? '')
            const doneText = doneTextRaw.trim()
            if (doneText) {
              updateAssistantMessageContent(assistantMsg.id, () => doneTextRaw)
            }
            setTaskStatus('AI 任务：回复已生成')
            continue
          }

          if (name === 'plan_update') {
            pushLocalExecFlow({ kind: 'plan', title: '计划更新', detail: String((data as any)?.explanation || ''), status: 'completed', source: 'copilot-cli' })
            continue
          }

          if (name === 'runtime_context') {
            const skillCount = Array.isArray((data as any)?.skills) ? (data as any).skills.length : 0
            const mcpCount = Array.isArray((data as any)?.active_mcp_servers) ? (data as any).active_mcp_servers.length : 0
            setTaskStatus('AI 任务：正在加载运行时上下文…')
            pushLocalExecFlow({
              kind: 'runtime',
              title: payload.localExecStreamMode.value === 'mock' ? '测试运行时上下文' : '运行时上下文',
              detail: `skills ${skillCount} · mcp ${mcpCount}`,
              status: 'completed',
              source: 'copilot-cli',
            })
            continue
          }

          if (name === 'skill_call') {
            const skillName = String((data as any)?.name || '').trim() || 'skill'
            const skillStatus = String((data as any)?.status || '').trim().toLowerCase()
            setTaskStatus(`AI 任务：正在调用技能 ${skillName}…`)
            pushLocalExecFlow({
              kind: 'skill',
              title: `Skill · ${skillName}`,
              detail: String((data as any)?.description || ''),
              status: skillStatus === 'failed' ? 'failed' : 'completed',
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'command_started') {
            const command = (data as any)?.command
            setTaskStatus('AI 任务：正在执行命令…')
            pushLocalExecFlow({
              kind: 'command',
              title: '命令开始',
              detail: Array.isArray(command) ? command.join(' ') : String(command || ''),
              status: 'pending',
              messageId: String((data as any)?.message_id || ''),
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'command_completed') {
            setTaskStatus('AI 任务：命令完成，继续处理中…')
            pushLocalExecFlow({
              kind: 'command',
              title: '命令完成',
              detail: String((data as any)?.status || 'completed'),
              status: String((data as any)?.status || '').toLowerCase() === 'completed' ? 'completed' : 'failed',
              messageId: String((data as any)?.message_id || ''),
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'file_change_started') {
            pushLocalExecFlow({
              kind: 'fileChange',
              title: '文件变更准备',
              detail: String(((data as any)?.changes || []).length || 0) + ' 项',
              status: 'pending',
              messageId: String((data as any)?.message_id || ''),
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'file_change_completed') {
            pushLocalExecFlow({
              kind: 'fileChange',
              title: '文件变更',
              detail: String(((data as any)?.changes || []).length || 0) + ' 项',
              status: 'completed',
              messageId: String((data as any)?.message_id || ''),
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'approval_requested') {
            const requestId = String((data as any)?.request_id || '')
            pushLocalExecFlow({
              kind: 'approval',
              title: '等待审批',
              detail: requestId || 'request',
              status: 'pending',
              messageId: String((data as any)?.message_id || ''),
              approvalRequestId: requestId,
              source: 'copilot-cli',
              payload: data,
            })
            continue
          }

          if (name === 'error') {
            const errMsg = normalizeChatErrorMessage((data as any)?.message || 'unknown')
            receivedError = true
            payload.chatRunState.value = 'error'
            setTaskStatus('AI 任务：错误')
            payload.pushToast('Copilot CLI 错误：' + errMsg, 'warn')
            pushLocalExecFlow({ kind: 'error', title: '执行错误', detail: errMsg, status: 'failed', source: 'copilot-cli' })
            continue
          }

          if (name === 'turn_done') {
            receivedTurnDone = true
            setTaskStatus('AI 任务：完成')
            continue
          }
        }

        if (abortController.signal.aborted) {
          setTaskStatus('AI 任务：已停止')
          return
        }

        const finalAssistantText = payload.chatMessages.value.find((message) => message.id === assistantMsg.id)?.content || ''
        if (!String(finalAssistantText).trim() && !receivedError) {
          payload.pushToast('Copilot CLI 返回为空，请重试。', 'warn')
        }
        return
      }

      for await (const ev of svc.blueprintChatStream({ content, history })) {
        if (ev.type === 'done') break
        if (ev.type === 'error') {
          payload.chatRunState.value = 'error'
          setTaskStatus('AI 任务：错误')
          payload.pushToast('AI 对话失败：' + String(ev.error?.message ?? 'unknown'), 'warn')
          break
        }
        const message = ev.message
        if (message.type === 'agentToUi/text') {
          const delta = String((message as any)?.payload?.text ?? '')
          if (delta) {
            updateAssistantMessageContent(assistantMsg.id, (prev) => prev + delta)
          }
          setTaskStatus('AI 任务：正在生成回复…')
          continue
        }
        if (message.type === 'agentToUi/taskStatus') {
          const phase = String((message as any)?.payload?.phase ?? '')
          const text = (message as any)?.payload?.message
          setTaskStatus('AI 任务：' + String(typeof text === 'string' && text.trim() ? text.trim() : phase || '处理中'))
          continue
        }
        if (message.type === 'agentToUi/error') {
          const text = (message as any)?.payload?.message
          payload.chatRunState.value = 'error'
          setTaskStatus('AI 任务：错误')
          payload.pushToast('AI 对话失败：' + String(typeof text === 'string' ? text : 'unknown'), 'warn')
          break
        }
      }

      const finalAssistantText = payload.chatMessages.value.find((message) => message.id === assistantMsg.id)?.content || ''
      if (!String(finalAssistantText).trim()) {
        payload.pushToast('AI 返回为空，请重试。', 'warn')
      }
    } catch (err: any) {
      const errMsgRaw = String(err?.message ?? err ?? 'unknown')
      const aborted = abortController.signal.aborted || /abort/i.test(errMsgRaw)
      if (aborted) {
        setTaskStatus('AI 任务：已停止')
      } else {
        const errMsg = normalizeChatErrorMessage(errMsgRaw)
        payload.chatRunState.value = 'error'
        setTaskStatus('AI 任务：错误')
        payload.pushToast('AI 对话失败：' + errMsg, 'warn')
      }
    } finally {
      if (activeAbortController === abortController) activeAbortController = null
      payload.chatSending.value = false
      if (payload.chatRunState.value !== 'error') payload.chatRunState.value = 'idle'
    }
  }

  const onStop = () => {
    if (!payload.chatSending.value) return
    payload.chatRunState.value = 'stopping'
    setTaskStatus('AI 任务：正在停止…')
    activeAbortController?.abort()
  }

  const onNanoBananaGenerate = async (input: { prompt: string; config: NanoBananaConfig }) => {
    if (payload.chatSending.value) return
    const prompt = String(input?.prompt ?? '').trim()
    if (!prompt) return

    const sendingStartAt = Date.now()
    payload.chatSending.value = true
    payload.nanoStatus.value = '准备中…'
    payload.nanoBilling.value = ''
    payload.nanoModelUsed.value = ''
    payload.nanoDetail.value = ''
    payload.nanoPreviewUrl.value = ''
    payload.nanoPreviewFallbackUrls.value = []
    payload.nanoPreviewSourcePaths.value = []
    payload.nanoPreviewDownloadStatuses.value = []
    payload.nanoPreviewDownloadProgresses.value = []
    payload.nanoPreviewLocalReadyStates.value = []
    const requestedCountRaw = Number((input?.config as any)?.quantity ?? 1)
    const requestCount = Number.isFinite(requestedCountRaw)
      ? Math.max(1, Math.min(4, Math.floor(requestedCountRaw)))
      : 1
    payload.nanoPreviewUrls.value = Array.from({ length: requestCount }, () => '')
    payload.nanoPreviewFallbackUrls.value = Array.from({ length: requestCount }, () => '')
    payload.nanoPreviewSourcePaths.value = Array.from({ length: requestCount }, () => '')
    payload.nanoPreviewDownloadStatuses.value = Array.from({ length: requestCount }, () => 'ready')
    payload.nanoPreviewDownloadProgresses.value = Array.from({ length: requestCount }, () => 100)
    payload.nanoPreviewLocalReadyStates.value = Array.from({ length: requestCount }, () => true)
    payload.nanoPreviewLoadingStates.value = Array.from({ length: requestCount }, () => true)
    payload.nanoStatus.value = `并发请求中（0/${requestCount}）`
    try {
      const svc = payload.getChatService()

      const anchorIndexFromId = (id: string) => {
        const m = String(id || '').match(/(\d+)/)
        const n = m ? Number(m[1]) : NaN
        return Number.isFinite(n) ? n : 0
      }

      const refFiles: Array<{ idx: number; file: File }> = []
      const refSources: Array<{ idx: number; nodeType: WorkflowNode['type'] }> = []
      const pseudo = payload.store.state.nodesById[payload.NANO_ANCHOR_NODE_ID]
      const inputAnchors = Array.isArray(pseudo?.inputs) ? pseudo.inputs as WorkflowAnchorSpec[] : ([] as WorkflowAnchorSpec[])
      const sortedAnchors = [...inputAnchors].sort((a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id))
      for (const anchor of sortedAnchors) {
        if (refFiles.length >= payload.NANO_REF_IMAGE_MAX) break
        const edge = payload.getFirstIncomingEdge(payload.NANO_ANCHOR_NODE_ID, String(anchor.id ?? ''))
        if (!edge) continue
        const fromNode = payload.store.state.nodesById[edge.fromNodeId]
        if (!fromNode) continue
        const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
        if (!isImageSource) {
          payload.pushToast(`图片生成参考图仅支持连接「图片节点/旋转图片节点」输出（当前：${fromNode.type}）。`, 'warn')
          continue
        }
        let url = payload.nodeResourceUrl(fromNode)
        if (!url) {
          payload.pushToast('图片生成参考图来源节点缺少图片资源。', 'warn')
          continue
        }
        const nameBase = String(payload.nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref').trim() || 'ref'
        const idx = anchorIndexFromId(anchor.id)

        if (
          fromNode.type === 'rotate-image' &&
          (String(url).startsWith('blob:') || String(url).startsWith('data:') || String(url).startsWith('file:') || String(url).startsWith('/'))
        ) {
          try {
            const uploaded = await payload.uploadLocalResourceAndGetUrl(
              String(url),
              'image',
              `${nameBase}_rot`,
              { projectId: payload.currentProjectId.value }
            )
            const rid = String((fromNode as any).resourceId ?? '').trim()
            if (rid) {
              payload.store.commit('patchResource', {
                resourceId: rid,
                patch: {
                  url: uploaded.url,
                  sourcePath: uploaded.absolutePath || undefined,
                  projectRelativePath: (uploaded as any).projectRelativePath || undefined,
                } as any,
              })
            }
            url = uploaded.url
          } catch {
            // fallback to original local/blob/data URL below
          }
        }

        let file: File | null = null
        try {
          if (fromNode.type === 'image') {
            file = await payload.buildCroppedImageTransferFile(fromNode, url, nameBase)
          }
          if (!file) file = await payload.fileFromUrl(url, nameBase)
        } catch {
          file = null
        }

        if (file) {
          refFiles.push({ idx, file })
          refSources.push({ idx, nodeType: fromNode.type })
        }
      }

      refFiles.sort((a, b) => a.idx - b.idx)
      refSources.sort((a, b) => a.idx - b.idx)

      const rotateRefIdx = refSources.filter((source) => source.nodeType === 'rotate-image').map((source) => source.idx)
      const imageRefIdx = refSources.filter((source) => source.nodeType === 'image').map((source) => source.idx)
      let finalPrompt = prompt
      if (rotateRefIdx.length) {
        const relLines: string[] = []
        relLines.push('[Reference Relation Rules]')
        if (imageRefIdx.length) {
          relLines.push(`- Original refs: #${imageRefIdx.join(', #')}.`)
        }
        relLines.push(`- Rotated refs: #${rotateRefIdx.join(', #')} (these are rotated-view references generated from the same original content).`)
        relLines.push('- REQUIRED: Keep the exact identical BACKGROUND, environment, and lighting from original refs.')
        relLines.push('- REQUIRED: Keep exact identity/texture/structure of the subject from original refs, and ONLY align the camera/view/framing to rotated refs.')
        relLines.push('- Do not replace the subject, do not alter the background, do not invent new materials or elements.')
        finalPrompt = `${prompt}\n\n${relLines.join('\n')}`
      }

      const ar = String(input?.config?.aspectRatio ?? input?.config?.meshyAspectRatio ?? '').trim()
      const selectedImageModel = String((input as any)?.config?.imageModel ?? '').trim()
      const selectedMeshyAiModel = String((input as any)?.config?.meshyImageAiModel ?? '').trim()
      const meshyPoseMode = String((input as any)?.config?.meshyPoseMode ?? '').trim()
      const meshyGenerateMultiView = Boolean((input as any)?.config?.meshyGenerateMultiView)
      const isSeedreamModel = selectedImageModel.startsWith('doubao-seedream-')
      const isJimengImageModel = selectedImageModel.startsWith('jimeng-image-')
      const isMeshyModel = selectedImageModel === 'meshy'
      const imageEngineLabel = isJimengImageModel ? '即梦图片' : isSeedreamModel ? 'Seedream' : isMeshyModel ? 'Meshy' : 'NanoBanana'

      let completedCount = 0
      let failedCount = 0
      const updateProgressStatus = () => {
        payload.nanoStatus.value = `并发请求中（${completedCount}/${requestCount}）`
        if (completedCount >= requestCount) {
          const successCount = requestCount - failedCount
          payload.nanoStatus.value = failedCount > 0 ? `完成（成功 ${successCount}，失败 ${failedCount}）` : '完成'
        }
      }

      if (isMeshyModel) {
        const hasRefImages = refFiles.length > 0
        const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'
        
        // 使用官方 API 参数名（小写下划线格式）
        const meshyPayload: Record<string, any> = {
          mode: taskType,
          prompt: finalPrompt,
          ai_model: selectedMeshyAiModel || 'nano-banana',
        }

        // text-to-image 特有参数
        if (!hasRefImages) {
          if (ar) meshyPayload.aspect_ratio = ar
          if (meshyPoseMode) meshyPayload.pose_mode = meshyPoseMode
          if (meshyGenerateMultiView) meshyPayload.generate_multi_view = true
        }

        if (hasRefImages) {
          const form = new FormData()
          for (const key of Object.keys(meshyPayload)) {
            form.set(key, String(meshyPayload[key]))
          }
          for (const r of refFiles) {
            form.append('refImages', r.file, r.file.name)
          }
          
          const meshyService = svc as any
          const res = await meshyService.meshyGenerateImage(form)
          if (res.ok) {
            const taskId = String(res.taskId || '').trim()
            if (taskId) {
              appendNanoDetail(`Meshy 任务已创建：${taskId}`)
              payload.nanoStatus.value = `任务已创建（${taskId}）`
              
              const pollStatus = async () => {
                const taskRes = await meshyService.meshyTask(taskId, taskType)
                if (taskRes.ok) {
                  const status = String(taskRes.status || '').trim().toUpperCase()
                  const progress = Number(taskRes.progress || 0)
                  payload.nanoStatus.value = status === 'SUCCEEDED' ? '完成' : `${status}（${progress}%）`
                  
                  if (status === 'SUCCEEDED') {
                    const imageUrl = taskRes.preferredImageUrl || taskRes.imageUrls?.[0]
                    if (imageUrl) {
                      const resolvedUrl = payload.resolveBackendUrl(imageUrl)
                      payload.nanoPreviewUrl.value = resolvedUrl
                      payload.nanoPreviewUrls.value = [resolvedUrl]
                      payload.nanoPreviewLoadingStates.value = [false]
                      payload.nanoModelUsed.value = selectedMeshyAiModel
                    }
                  } else if (status === 'FAILED') {
                    const errorMsg = String(taskRes.errorMessage || '未知错误')
                    payload.pushToast(`Meshy 生成失败：${errorMsg}`, 'warn')
                    appendNanoDetail(`错误：${errorMsg}`)
                  } else if (status !== 'CANCELED') {
                    setTimeout(pollStatus, 2000)
                  }
                }
              }
              pollStatus()
            }
          } else {
            const errMsg = String(res.error || 'Meshy 请求失败')
            payload.pushToast(`Meshy 生成失败：${errMsg}`, 'warn')
            appendNanoDetail(`错误：${errMsg}`)
          }
          completedCount = 1
          updateProgressStatus()
          return
        } else {
          const res = await (svc as any).meshyGenerate(meshyPayload)
          if (res.ok) {
            const taskId = String(res.taskId || '').trim()
            if (taskId) {
              appendNanoDetail(`Meshy 任务已创建：${taskId}`)
              payload.nanoStatus.value = `任务已创建（${taskId}）`
              
              const pollStatus = async () => {
                const taskRes = await (svc as any).meshyTask(taskId, taskType)
                if (taskRes.ok) {
                  const status = String(taskRes.status || '').trim().toUpperCase()
                  const progress = Number(taskRes.progress || 0)
                  payload.nanoStatus.value = status === 'SUCCEEDED' ? '完成' : `${status}（${progress}%）`
                  
                  if (status === 'SUCCEEDED') {
                    const imageUrl = taskRes.preferredImageUrl || taskRes.imageUrls?.[0]
                    if (imageUrl) {
                      const resolvedUrl = payload.resolveBackendUrl(imageUrl)
                      payload.nanoPreviewUrl.value = resolvedUrl
                      payload.nanoPreviewUrls.value = [resolvedUrl]
                      payload.nanoPreviewLoadingStates.value = [false]
                      payload.nanoModelUsed.value = selectedMeshyAiModel
                    }
                  } else if (status === 'FAILED') {
                    const errorMsg = String(taskRes.errorMessage || '未知错误')
                    payload.pushToast(`Meshy 生成失败：${errorMsg}`, 'warn')
                    appendNanoDetail(`错误：${errorMsg}`)
                  } else if (status !== 'CANCELED') {
                    setTimeout(pollStatus, 2000)
                  }
                }
              }
              pollStatus()
            }
          } else {
            const errMsg = String(res.error || 'Meshy 请求失败')
            payload.pushToast(`Meshy 生成失败：${errMsg}`, 'warn')
            appendNanoDetail(`错误：${errMsg}`)
          }
          completedCount = 1
          updateProgressStatus()
          return
        }
      }

      let cachedRefIds: string[] = []
      let useDirectRefUpload = isJimengImageModel
      if (refFiles.length) {
        const cacheForm = new FormData()
        for (const r of refFiles) {
          const safeIdx = r.idx > 0 ? r.idx : 0
          const name = safeIdx ? `ref-${safeIdx}-${r.file.name}` : r.file.name
          cacheForm.append('refImages', r.file, name)
        }
        const cacheRes = isJimengImageModel
          ? { ok: false }
          : isSeedreamModel
          ? await svc.seedreamCacheRefImages(cacheForm)
          : await svc.nanoBananaCacheRefImages(cacheForm)
        if (cacheRes.ok && Array.isArray((cacheRes as any).cacheIds)) {
          cachedRefIds = ((cacheRes as any).cacheIds as string[]).map((v) => String(v || '')).filter(Boolean)
        } else {
          const warnMsg = '参考图缓存失败，已回退为直接上传。'
          appendNanoDetail(`警告：${warnMsg}`)
          payload.pushToast(`${imageEngineLabel}：${warnMsg}`, 'warn')
          useDirectRefUpload = true
        }
      }

      const runSingleRequest = async (index: number) => {
        const requestNo = index + 1
        const form = new FormData()
        form.set('prompt', finalPrompt)
        if (ar) form.set('aspectRatio', ar)
        if (selectedImageModel) form.set('imageModel', selectedImageModel)
        if (useDirectRefUpload) {
          for (const r of refFiles) form.append('refImages', r.file, r.file.name)
        } else {
          for (const cid of cachedRefIds) form.append('refCacheIds', cid)
        }

        let requestFailed = false
        try {
          const stream = isJimengImageModel
            ? svc.jimengImageGenerateStream(form)
            : isSeedreamModel
            ? svc.seedreamGenerateStream(form)
            : svc.nanoBananaGenerateStream(form)
          for await (const ev of stream) {
            if (ev.type === 'done') break
            if (ev.type === 'error') {
              const errMsg = String(ev.error?.message ?? 'unknown')
              requestFailed = true
              appendNanoDetail(`请求 ${requestNo} 错误：${errMsg}`)
              payload.pushToast(`图片生成第 ${requestNo} 张失败：` + errMsg, 'warn')
              break
            }

            const message = ev.message
            if (message.type === 'agentToUi/chatMessage') {
              const content = String((message as any)?.payload?.content ?? '')
              try {
                const obj = JSON.parse(content)
                if (obj && typeof obj === 'object') {
                  if (typeof (obj as any).imageUrl === 'string') {
                    const nextUrl = payload.resolveBackendUrl(String((obj as any).imageUrl))
                    const fallbackUrl = payload.resolveBackendUrl(String((obj as any).imageUrlRemote || ''))
                    if (nextUrl) {
                      payload.nanoPreviewUrls.value = payload.nanoPreviewUrls.value.map((v, i) => (i === index ? nextUrl : v))
                      payload.nanoPreviewFallbackUrls.value = payload.nanoPreviewFallbackUrls.value.map((v, i) => (i === index ? fallbackUrl : v))
                      payload.nanoPreviewDownloadStatuses.value = payload.nanoPreviewDownloadStatuses.value.map((v, i) => (i === index ? 'ready' : v))
                      payload.nanoPreviewDownloadProgresses.value = payload.nanoPreviewDownloadProgresses.value.map((v, i) => (i === index ? 100 : v))
                      payload.nanoPreviewLocalReadyStates.value = payload.nanoPreviewLocalReadyStates.value.map((v, i) => (i === index ? true : v))
                      payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map((v, i) => (i === index ? false : v))
                      if (!payload.nanoPreviewUrl.value) payload.nanoPreviewUrl.value = nextUrl
                    }
                  }
                  if (typeof (obj as any).billing === 'string') payload.nanoBilling.value = String((obj as any).billing)
                  if (typeof (obj as any).model === 'string') payload.nanoModelUsed.value = String((obj as any).model)
                }
              } catch {
                // ignore
              }
              continue
            }

            if (message.type === 'agentToUi/error') {
              const text = (message as any)?.payload?.message
              const errMsg = String(typeof text === 'string' ? text : 'unknown')
              requestFailed = true
              appendNanoDetail(`请求 ${requestNo} 错误：${errMsg}`)
              payload.pushToast(`图片生成第 ${requestNo} 张失败：` + errMsg, 'warn')
              break
            }
          }
        } finally {
          payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map((v, i) => (i === index ? false : v))
          if (requestFailed) failedCount += 1
          completedCount += 1
          updateProgressStatus()
        }
      }

      await Promise.all(Array.from({ length: requestCount }, (_, idx) => runSingleRequest(idx)))
    } catch (err: any) {
      const errMsg = String(err?.message ?? err ?? 'unknown')
      payload.nanoStatus.value = '失败'
      appendNanoDetail(`错误：${errMsg}`)
      payload.pushToast('图片生成失败：' + errMsg, 'warn')
    } finally {
      const minShowMs = 900
      const elapsed = Date.now() - sendingStartAt
      if (elapsed < minShowMs) {
        await new Promise((r) => setTimeout(r, minShowMs - elapsed))
      }
      payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map(() => false)
      payload.chatSending.value = false
    }
  }

  const onSeedanceGenerate = async (input: { prompt: string; config: SeedanceConfig }) => {
    if (payload.chatSending.value) return
    const prompt = String(input?.prompt ?? '').trim()
    if (!prompt) return

    const sendingStartAt = Date.now()
    payload.chatSending.value = true
    payload.nanoStatus.value = '准备中…'
    payload.nanoBilling.value = ''
    payload.nanoModelUsed.value = ''
    payload.nanoDetail.value = ''
    payload.nanoPreviewUrl.value = ''
    payload.nanoPreviewUrls.value = ['']
    payload.nanoPreviewFallbackUrls.value = ['']
    payload.nanoPreviewSourcePaths.value = ['']
    payload.nanoPreviewDownloadStatuses.value = ['pending']
    payload.nanoPreviewDownloadProgresses.value = [0]
    payload.nanoPreviewLocalReadyStates.value = [false]
    payload.nanoPreviewLoadingStates.value = [true]

    try {
      const svc = payload.getChatService()
      const selectedModel = String(input?.config?.model ?? 'doubao-seedance-2-0-260128').trim()
      const isJimengVideoModel = selectedModel.startsWith('jimeng-video-')
      const videoEngineLabel = isJimengVideoModel ? '即梦视频' : 'Seedance'
      let observedSeedanceTaskId = ''

      const anchorIndexFromId = (id: string) => {
        const m = String(id || '').match(/(\d+)/)
        const n = m ? Number(m[1]) : NaN
        return Number.isFinite(n) ? n : 0
      }

      const refFiles: Array<{ idx: number; file: File }> = []
      const pseudo = payload.store.state.nodesById[payload.NANO_ANCHOR_NODE_ID]
      const inputAnchors = Array.isArray(pseudo?.inputs) ? pseudo.inputs as WorkflowAnchorSpec[] : ([] as WorkflowAnchorSpec[])
      const sortedAnchors = [...inputAnchors].sort((a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id))
      for (const anchor of sortedAnchors) {
        if (refFiles.length >= 4) break
        const edge = payload.getFirstIncomingEdge(payload.NANO_ANCHOR_NODE_ID, String(anchor.id ?? ''))
        if (!edge) continue
        const fromNode = payload.store.state.nodesById[edge.fromNodeId]
        if (!fromNode) continue
        const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
        if (!isImageSource) continue
        const url = payload.nodeResourceUrl(fromNode)
        if (!url) continue
        const nameBase = String(payload.nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref').trim() || 'ref'
        let file: File | null = null
        try {
          if (fromNode.type === 'image') {
            file = await payload.buildCroppedImageTransferFile(fromNode, url, nameBase)
          }
          if (!file) file = await payload.fileFromUrl(url, nameBase)
        } catch {
          file = null
        }
        if (file) refFiles.push({ idx: anchorIndexFromId(anchor.id), file })
      }
      refFiles.sort((a, b) => a.idx - b.idx)

      const form = new FormData()
      form.set('prompt', prompt)
      form.set('model', selectedModel)
      form.set('source', 'bottom-chat')
      if (payload.currentProjectId.value != null) {
        form.set('projectId', String(payload.currentProjectId.value))
      }
      form.set('ratio', String(input?.config?.ratio ?? 'adaptive'))
      const resolutionText = String(input?.config?.resolution ?? '').trim()
      if (resolutionText) {
        form.set('resolution', resolutionText)
      } else if (isJimengVideoModel) {
        form.set('resolution', '720p')
      }

      const useFrames = !!(input?.config as any)?.useFrames
      if (isJimengVideoModel) {
        if (useFrames) {
          const framesText = String((input?.config as any)?.frames ?? '').trim()
          if (framesText) form.set('frames', framesText)
        } else {
          form.set('duration', String(Number(input?.config?.duration ?? 5) || 5))
        }
      } else if (useFrames) {
        const framesText = String((input?.config as any)?.frames ?? '').trim()
        if (framesText) form.set('frames', framesText)
      } else {
        form.set('duration', String(Number(input?.config?.duration ?? 5) || 5))
      }

      const refMode = String(input?.config?.refMode ?? 'auto')
      form.set('refMode', refMode)
      const isJimengPro = selectedModel === 'jimeng-video-3.0-pro'
      const requestedReferenceCount = refMode === 'recamera' || isJimengPro ? 1 : 4
      const referenceCount = Math.max(1, Math.min(requestedReferenceCount, refFiles.length || 1))
      form.set('referenceCount', String(referenceCount))

      const seedText = String(input?.config?.seed ?? '').trim()
      if (seedText) form.set('seed', seedText)

      if (isJimengVideoModel && refMode === 'recamera') {
        const templateId = String((input?.config as any)?.templateId ?? '').trim()
        const cameraStrength = String((input?.config as any)?.cameraStrength ?? 'medium').trim().toLowerCase()
        if (templateId) form.set('templateId', templateId)
        if (cameraStrength) form.set('cameraStrength', cameraStrength)
      }

      const hasRefs = refFiles.length > 0
      let taskType = 't2v'
      if (hasRefs) {
        if (refMode === 'reference') taskType = 'r2v'
        else if (refMode === 'recamera') taskType = 'recamera'
        else taskType = 'i2v'
      }
      form.set('taskType', taskType)

      if (isJimengVideoModel && refMode === 'recamera' && !hasRefs) {
        const msg = '即梦运镜模式需要 1 张参考图。请先连接参考图后再生成。'
        payload.nanoStatus.value = '参数错误'
        appendNanoDetail(`错误：${msg}`)
        payload.pushToast(msg, 'warn')
        return
      }

      if (isJimengVideoModel && isJimengPro && refFiles.length > 1) {
        const msg = '即梦 3.0 Pro 当前仅支持 1 张首帧参考图。'
        payload.nanoStatus.value = '参数错误'
        appendNanoDetail(`错误：${msg}`)
        payload.pushToast(msg, 'warn')
        return
      }

      if (isJimengVideoModel) {
        const modeText =
          refMode === 'first'
            ? '首帧'
            : refMode === 'first-last'
            ? '首尾帧'
            : refMode === 'recamera'
            ? '运镜'
            : refMode === 'reference'
            ? '参考图'
            : '自动'
        const effectiveCount =
          !hasRefs
            ? 0
            : refMode === 'recamera'
            ? 1
            : refMode === 'first'
            ? 1
            : refMode === 'first-last'
            ? Math.min(2, refFiles.length)
            : Math.min(referenceCount, refFiles.length)
        appendNanoDetail(`即梦参考图策略：${modeText}（输入 ${refFiles.length} 张，生效 ${effectiveCount} 张）`)
        if (refMode === 'first-last' && refFiles.length > 2) {
          appendNanoDetail('提示：首尾帧模式最多使用 2 张参考图；若需超过 2 张请切换到“自动/参考图”模式。')
        }
        if (!hasRefs) appendNanoDetail('即梦模式：当前为纯文本生视频（无参考图）')
      }

      if (!isJimengVideoModel) {
        form.set('generateAudio', (input?.config as any)?.generateAudio ? '1' : '0')
        form.set('watermark', (input?.config as any)?.watermark ? '1' : '0')
        form.set('cameraFixed', (input?.config as any)?.cameraFixed ? '1' : '0')
        form.set('draft', (input?.config as any)?.draft ? '1' : '0')
        form.set('returnLastFrame', (input?.config as any)?.returnLastFrame ? '1' : '0')

        const currentModel = String((input?.config as any)?.model ?? '').trim()
        const serviceTier = String((input?.config as any)?.serviceTier ?? '').trim()
        if (serviceTier && seedanceSupportsServiceTier(currentModel)) form.set('serviceTier', serviceTier)
        const executionExpiresAfter = String((input?.config as any)?.executionExpiresAfter ?? '').trim()
        if (executionExpiresAfter) form.set('executionExpiresAfter', executionExpiresAfter)
      }

      for (const rf of refFiles) form.append('refImages', rf.file, rf.file.name)

      const stream = isJimengVideoModel ? svc.jimengVideoGenerateStream(form) : svc.seedanceGenerateStream(form)
      for await (const ev of stream) {
        if (ev.type === 'done') break
        if (ev.type === 'error') {
          const errMsg = String(ev.error?.message ?? 'unknown')
          payload.nanoStatus.value = '失败'
          appendNanoDetail(`错误：${errMsg}`)
          payload.pushToast(videoEngineLabel + ' 生成失败：' + errMsg, 'warn')
          break
        }
        const message = ev.message
        if (message.type === 'agentToUi/chatMessage') {
          const content = String((message as any)?.payload?.content ?? '')
          try {
            const obj = JSON.parse(content)
            if (obj && typeof obj === 'object') {
              const taskId = String((obj as any).taskId || '').trim()
              const remoteUrl = payload.resolveBackendUrl(String((obj as any).videoUrlRemote || ''))
              const localUrl = payload.resolveBackendUrl(String((obj as any).videoUrlLocal || ''))
              const nextUrl = payload.resolveBackendUrl(String((obj as any).videoUrl || ''))
              const downloadStatus = String((obj as any).downloadStatus || '').trim() || 'pending'
              const downloadProgressRaw = Number((obj as any).downloadProgress ?? 0)
              const downloadProgress = Number.isFinite(downloadProgressRaw)
                ? Math.max(0, Math.min(100, Math.round(downloadProgressRaw)))
                : 0
              const localReady = !!localUrl && downloadStatus === 'ready'
              const sourcePath = String((obj as any).videoSourcePath || '').trim()
              const displayUrl = localReady ? localUrl : (remoteUrl || nextUrl || localUrl)
              payload.nanoPreviewUrls.value = [displayUrl]
              payload.nanoPreviewFallbackUrls.value = [remoteUrl]
              payload.nanoPreviewSourcePaths.value = [localReady ? sourcePath : '']
              payload.nanoPreviewDownloadStatuses.value = [downloadStatus]
              payload.nanoPreviewDownloadProgresses.value = [downloadProgress]
              payload.nanoPreviewLocalReadyStates.value = [localReady]
              payload.nanoPreviewLoadingStates.value = [!displayUrl]
              if (displayUrl) payload.nanoPreviewUrl.value = displayUrl
              if (typeof (obj as any).billing === 'string') payload.nanoBilling.value = String((obj as any).billing)
              if (typeof (obj as any).model === 'string') payload.nanoModelUsed.value = String((obj as any).model)
              if (!isJimengVideoModel && taskId) {
                observedSeedanceTaskId = taskId
                payload.onSeedanceTaskObserved?.(taskId, 'completed')
              }
            }
          } catch {
            // ignore
          }
          continue
        }
        if (message.type === 'agentToUi/taskStatus') {
          const text = String((message as any)?.payload?.message ?? '').trim()
          if (text) payload.nanoStatus.value = text
          if (!isJimengVideoModel && text) {
            const match = text.match(/任务已创建（([^）]+)）/)
            const taskId = String(match?.[1] || '').trim()
            if (taskId && taskId !== observedSeedanceTaskId) {
              observedSeedanceTaskId = taskId
              payload.onSeedanceTaskObserved?.(taskId, 'created')
            }
          }
          continue
        }
        if (message.type === 'agentToUi/error') {
          const text = String((message as any)?.payload?.message ?? 'unknown')
          payload.nanoStatus.value = '失败'
          appendNanoDetail(`错误：${text}`)
          payload.pushToast(videoEngineLabel + ' 生成失败：' + text, 'warn')
          break
        }
      }
    } catch (err: any) {
      const errMsg = String(err?.message ?? err ?? 'unknown')
      payload.nanoStatus.value = '失败'
      appendNanoDetail(`错误：${errMsg}`)
      payload.pushToast('视频生成失败：' + errMsg, 'warn')
    } finally {
      const minShowMs = 900
      const elapsed = Date.now() - sendingStartAt
      if (elapsed < minShowMs) {
        await new Promise((r) => setTimeout(r, minShowMs - elapsed))
      }
      payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map(() => false)
      payload.chatSending.value = false
    }
  }

  return {
    onSend,
    onStop,
    onNanoBananaGenerate,
    onSeedanceGenerate,
  }
}
