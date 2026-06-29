import type { Ref } from 'vue'
import type {
	BottomChatMessage,
	LocalExecFlowEvent,
	LocalExecSessionItem,
	NanoBananaConfig,
	SeedanceConfig,
	AgentBackendType
} from '../../../../ui/UIComponent/BottomChatDock.vue'
import type { WorkflowAnchorSpec, WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import type { BlueprintChatStreamEvent } from '../../../../network/ComfyUIBridgeService'
import { agentStream, agentAbort, type AgentStreamChunk } from '../../../../network/AgentChatService'
import { cliSendMessage, cliCancel, type CLIStreamChunk } from '../../../../network/CLIChatService'
import { getErrorMessage, hasKey, isRecord, isString } from '../../../../types/utils'

type LocalExecSessionCreateResult = {
	id?: unknown
	title?: unknown
	status?: unknown
	model_name?: unknown
	error?: unknown
}

type LocalExecStreamEvent =
	| { type: 'done' }
	| { type: 'error'; error?: { message?: unknown } }
	| {
			type: 'event'
			event?: unknown
			data?: unknown
	  }

type CacheRefImagesResult = {
	ok?: unknown
	cacheIds?: unknown
}

type MeshyImageTaskResult = {
	ok?: unknown
	taskId?: unknown
	status?: unknown
	progress?: unknown
	preferredImageUrl?: unknown
	imageUrls?: unknown
	error?: unknown
	errorMessage?: unknown
}

type ChatStreamResult = {
	ok?: unknown
	error?: unknown
}

export type ChatBridgeService = {
	blueprintChatStream: (
		payload: {
			content: string
			history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
		},
		signal?: AbortSignal
	) => AsyncIterable<BlueprintChatStreamEvent>
	localExecCreateSession?: (payload?: {
		title?: string
		cwd?: string
		model?: string
		projectId?: number | null
	}) => Promise<LocalExecSessionCreateResult>
	localExecStreamMessage?: (
		sessionId: string,
		payload: {
			content: string
			references?: Array<{ path: string; kind?: string; name?: string }>
			projectId?: number | null
			skillHints?: string[]
			executionHints?: string[]
			agentMode?: 'agent' | 'ask' | 'plan'
			permissionProfile?: string
		},
		signal?: AbortSignal
	) => AsyncIterable<LocalExecStreamEvent>
	localExecListMessages?: (sessionId: string, projectId: number | null) => Promise<unknown>
	localExecSubmitApproval?: (payload: {
		sessionId: string
		messageId: string
		decision: 'accept' | 'decline'
		projectId?: number | null
	}) => Promise<unknown>
	codexCreateSession: (payload?: {
		title?: string
		cwd?: string
		model?: string
		projectId?: number | null
	}) => Promise<LocalExecSessionCreateResult>
	codexStreamMessage: (
		sessionId: string,
		payload: {
			content: string
			references?: Array<{ path: string; kind?: string; name?: string }>
			projectId?: number | null
			skillHints?: string[]
			executionHints?: string[]
			agentMode?: 'agent' | 'ask' | 'plan'
			permissionProfile?: string
		},
		signal?: AbortSignal
	) => AsyncIterable<LocalExecStreamEvent>
	codexListMessages: (sessionId: string, projectId: number | null) => Promise<unknown>
	codexSubmitApproval: (payload: {
		sessionId: string
		messageId: string
		decision: 'accept' | 'decline'
		projectId?: number | null
	}) => Promise<unknown>
	nanoBananaCacheRefImages: (form: FormData) => Promise<CacheRefImagesResult>
	seedreamCacheRefImages: (form: FormData) => Promise<CacheRefImagesResult>
	nanoBananaGenerateStream: (form: FormData) => AsyncIterable<BlueprintChatStreamEvent>
	seedreamGenerateStream: (form: FormData) => AsyncIterable<BlueprintChatStreamEvent>
	jimengImageGenerateStream: (form: FormData) => AsyncIterable<BlueprintChatStreamEvent>
	jimengVideoGenerateStream: (form: FormData) => AsyncIterable<BlueprintChatStreamEvent>
	seedanceGenerateStream: (form: FormData) => AsyncIterable<BlueprintChatStreamEvent>
	meshyGenerate: (payload: Record<string, unknown>) => Promise<MeshyImageTaskResult>
	meshyGenerateImage: (form: FormData) => Promise<MeshyImageTaskResult>
	meshyTask: (taskId: string, mode: string) => Promise<MeshyImageTaskResult>
}

type WorkflowResourceLike = {
	resourceId?: string
	url?: string
	sourcePath?: string
	projectRelativePath?: string
	kind?: string
	name?: string
	[key: string]: unknown
}

type WorkflowEdgeLike = WorkflowEdge & {
	[key: string]: unknown
}

type ChatGenerationStore = {
	state: {
		nodesById: Record<string, WorkflowNode>
		edgeOrder: string[]
		edgesById: Record<string, WorkflowEdge>
	}
	commit: (type: string, value?: unknown) => void
}

type ChatGenerationPayload = {
	store: ChatGenerationStore
	chatModelKey: Ref<string>
	chatDraft: Ref<string>
	chatModelId: Ref<string>
	chatMessages: Ref<BottomChatMessage[]>
	chatSending: Ref<boolean>
	chatRunState: Ref<'idle' | 'sending' | 'stopping' | 'error'>
	chatTaskStatusText: Ref<string>
	localExecStreamMode: Ref<'real' | 'mock'>
	agentConversationMode: Ref<'agent' | 'ask' | 'plan'>
	agentBackend: Ref<AgentBackendType>
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
	currentProjectName: Ref<string>
	ensureProjectId?: (opts?: { silent?: boolean }) => Promise<number | null>
	NANO_ANCHOR_NODE_ID: string
	NANO_REF_IMAGE_MAX: number
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => WorkflowEdge | null | undefined
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeResourceName: (node: WorkflowNode) => string | null
	buildCroppedImageTransferFile: (
		fromNode: WorkflowNode,
		sourceUrl: string,
		sourceName: string
	) => Promise<File | null>
	fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
	uploadLocalResourceAndGetUrl: (
		localUrl: string,
		kind: 'image' | 'video' | 'file',
		resourceName: string,
		opts?: { projectId?: number | null }
	) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
	resolveBackendUrl: (value: string) => string
	getChatService: () => ChatBridgeService
	onSeedanceTaskObserved?: (taskId: string, stage: 'created' | 'completed') => void
	getSelectedNode?: () => WorkflowNode | null | undefined
	getAllNodes?: () => WorkflowNode[]
	getAllEdges?: () => WorkflowEdge[]
}

export const useAIWorkflowChatGeneration = (payload: ChatGenerationPayload) => {
	const makeChatId = () =>
		`aiwf-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
				content: updater(String(message.content || ''))
			}
		})
		if (!changed) return
	}

	const updateAssistantMessageThinking = (messageId: string, updater: (prev: string) => string) => {
		const id = String(messageId || '').trim()
		if (!id) return
		let changed = false
		payload.chatMessages.value = payload.chatMessages.value.map((message) => {
			if (message.id !== id) return message
			changed = true
			return {
				...message,
				thinkingContent: updater(String(message.thinkingContent || ''))
			}
		})
		if (!changed) return
	}

	const addToolCallToMessage = (
		messageId: string,
		toolCall: { id: string; name: string; status: string; args?: unknown }
	) => {
		const id = String(messageId || '').trim()
		if (!id) return
		let changed = false
		payload.chatMessages.value = payload.chatMessages.value.map((message) => {
			if (message.id !== id) return message
			changed = true
			const existingToolCalls = message.toolCalls ? [...message.toolCalls] : []
			existingToolCalls.push({
				id: toolCall.id,
				name: toolCall.name,
				status: toolCall.status as 'pending' | 'running' | 'completed' | 'error',
				args: toolCall.args as Record<string, unknown> | undefined
			})
			return {
				...message,
				toolCalls: existingToolCalls
			}
		})
		if (!changed) return
	}

	const updateToolCallInMessage = (
		messageId: string,
		toolCallId: string,
		updates: { status?: string; result?: unknown; error?: string }
	) => {
		const id = String(messageId || '').trim()
		const tcId = String(toolCallId || '').trim()
		if (!id || !tcId) return
		let changed = false
		payload.chatMessages.value = payload.chatMessages.value.map((message) => {
			if (message.id !== id || !message.toolCalls) return message
			const updatedToolCalls = message.toolCalls.map((tc) => {
				if (tc.id !== tcId) return tc
				changed = true
				return {
					...tc,
					status: updates.status ? (updates.status as 'pending' | 'running' | 'completed' | 'error') : tc.status,
					result: updates.result !== undefined ? updates.result : tc.result,
					error: updates.error !== undefined ? updates.error : tc.error
				}
			})
			return changed ? { ...message, toolCalls: updatedToolCalls } : message
		})
		if (!changed) return
	}

	const pushAgentFlow = (item: LocalExecFlowEvent) => {
		const existing = payload.codexFlowEvents.value.find((ev) => ev.id === item.id)
		if (existing) {
			payload.codexFlowEvents.value = payload.codexFlowEvents.value.map((ev) =>
				ev.id === item.id ? { ...ev, ...item } : ev
			)
		} else {
			payload.codexFlowEvents.value = [item, ...payload.codexFlowEvents.value]
		}
	}

	const collectBlueprintContext = () => {
		const nodes = typeof payload.getAllNodes === 'function' ? payload.getAllNodes() : []
		const edges = typeof payload.getAllEdges === 'function' ? payload.getAllEdges() : []
		const selectedNode = typeof payload.getSelectedNode === 'function' ? payload.getSelectedNode() : null

		const nodeTypeStats: Record<string, number> = {}
		for (const n of nodes) {
			const t = String(n.type || 'unknown')
			nodeTypeStats[t] = (nodeTypeStats[t] || 0) + 1
		}

		const nodeSummaries = nodes.slice(0, 50).map((n) => ({
			id: String(n.id || ''),
			type: String(n.type || ''),
			label: String((n as { title?: string }).title || (n as { name?: string }).name || n.type || ''),
		}))

		const edgeSummaries = edges.slice(0, 100).map((e) => ({
			from: String(e.fromNodeId || ''),
			to: String(e.toNodeId || ''),
			fromPort: String(e.fromAnchorId || ''),
			toPort: String(e.toAnchorId || ''),
		}))

		const selectedNodeSummary = selectedNode
			? {
					id: String(selectedNode.id || ''),
					type: String(selectedNode.type || ''),
					label: String(
						(selectedNode as { title?: string }).title ||
							(selectedNode as { name?: string }).name ||
							selectedNode.type || ''
					),
					config: (selectedNode as { config?: unknown }).config || {},
				}
			: null

		return {
			blueprint: {
				selectedNode: selectedNodeSummary,
				nodes: nodeSummaries,
				nodeCount: nodes.length,
				nodeTypeStats,
				connections: edgeSummaries,
				edgeCount: edges.length,
			},
			project: {
				id: payload.currentProjectId.value,
				name: payload.currentProjectName.value || '',
			},
			availableActions: [
				'get_blueprint_state',
				'create_node',
				'delete_node',
				'update_node_config',
				'connect_nodes',
				'disconnect_nodes',
				'list_node_types',
				'get_project_info',
			],
			restrictions: {
				maxNodes: 500,
				disallowDeleteSystemNodes: true,
			},
		}
	}

	const handleAgentStream = async (
		content: string,
		history: Array<{ role: string; content: string }>,
		assistantMsgId: string
	) => {
		setTaskStatus('AI 任务：Agent 正在思考…')
		let receivedDone = false
		let receivedError = false

		const context = collectBlueprintContext()

		for await (const chunk of agentStream({
			prompt: content,
			model: payload.chatModelId.value,
			systemPrompt: history.find((h) => h.role === 'system')?.content,
			context,
		})) {
			if (chunk.type === 'done') {
				receivedDone = true
				setTaskStatus('AI 任务：完成')
				break
			}
			if (chunk.type === 'error') {
				receivedError = true
				payload.chatRunState.value = 'error'
				setTaskStatus('AI 任务：错误')
				payload.pushToast('Agent 对话失败：' + chunk.message, 'warn')
				break
			}
			if (chunk.type === 'text') {
				updateAssistantMessageContent(assistantMsgId, (prev) => prev + chunk.content)
				setTaskStatus('AI 任务：Agent 正在生成回复…')
				continue
			}
			if (chunk.type === 'thinking_delta') {
				updateAssistantMessageThinking(assistantMsgId, (prev) => prev + chunk.content)
				setTaskStatus('AI 任务：Agent 正在思考…')
				continue
			}
			if (chunk.type === 'thought') {
				setTaskStatus('AI 任务：Agent 正在思考…')
				continue
			}
			if (chunk.type === 'tool_call_start') {
				const tcId = chunk.toolCallId || `tool-${chunk.tool}-${Date.now()}`
				addToolCallToMessage(assistantMsgId, {
					id: tcId,
					name: chunk.tool,
					status: 'running',
					args: chunk.input
				})
				setTaskStatus(`AI 任务：正在调用工具 ${chunk.tool}…`)
				pushAgentFlow({
					id: tcId,
					kind: 'skill',
					title: `Tool · ${chunk.tool}`,
					detail: '调用中…',
					status: 'pending',
					source: 'copilot-cli',
				})
				continue
			}
			if (chunk.type === 'tool_call_end') {
				const tcId = chunk.toolCallId || `tool-${chunk.tool}-${Date.now()}`
				updateToolCallInMessage(assistantMsgId, tcId, {
					status: 'completed',
					result: chunk.output
				})
				pushAgentFlow({
					id: tcId,
					kind: 'skill',
					title: `Tool · ${chunk.tool}`,
					detail: '完成',
					status: 'completed',
					source: 'copilot-cli',
				})
				continue
			}
			if (chunk.type === 'tool_call_error') {
				const tcId = chunk.toolCallId || `tool-${chunk.tool}-${Date.now()}`
				updateToolCallInMessage(assistantMsgId, tcId, {
					status: 'error',
					error: chunk.error
				})
				pushAgentFlow({
					id: tcId,
					kind: 'skill',
					title: `Tool · ${chunk.tool}`,
					detail: '失败',
					status: 'failed',
					source: 'copilot-cli',
				})
				continue
			}
			if (chunk.type === 'tool_call') {
				const tcId = `tool-${chunk.tool}-${Date.now()}`
				addToolCallToMessage(assistantMsgId, {
					id: tcId,
					name: chunk.tool,
					status: 'running',
					args: chunk.input
				})
				setTaskStatus(`AI 任务：正在调用工具 ${chunk.tool}…`)
				pushAgentFlow({
					id: tcId,
					kind: 'skill',
					title: `Tool · ${chunk.tool}`,
					detail: '调用中…',
					status: 'pending',
					source: 'copilot-cli',
				})
				continue
			}
			if (chunk.type === 'tool_result') {
				const tcId = `tool-${chunk.tool}-${Date.now()}`
				updateToolCallInMessage(assistantMsgId, tcId, {
					status: 'completed',
					result: chunk.output
				})
				pushAgentFlow({
					id: tcId,
					kind: 'skill',
					title: `Tool · ${chunk.tool}`,
					detail: '完成',
					status: 'completed',
					source: 'copilot-cli',
				})
				continue
			}
		}

		const finalText =
			payload.chatMessages.value.find((m) => m.id === assistantMsgId)?.content || ''
		if (!String(finalText).trim() && !receivedError && !receivedDone) {
			payload.pushToast('Agent 返回为空，请重试。', 'warn')
		}
	}

	const handleCLIStream = async (
		content: string,
		history: Array<{ role: string; content: string }>,
		assistantMsgId: string
	) => {
		setTaskStatus('AI 任务：CLI 适配器正在执行…')
		let receivedDone = false
		let receivedError = false

		for await (const chunk of cliSendMessage({
			message: content,
			context: history.map((h) => `${h.role}: ${h.content}`).join('\n'),
		})) {
			if (chunk.type === 'done') {
				receivedDone = true
				setTaskStatus('AI 任务：完成')
				break
			}
			if (chunk.type === 'error') {
				receivedError = true
				payload.chatRunState.value = 'error'
				setTaskStatus('AI 任务：错误')
				payload.pushToast('CLI 对话失败：' + chunk.message, 'warn')
				break
			}
			if (chunk.type === 'text') {
				updateAssistantMessageContent(assistantMsgId, (prev) => prev + chunk.content)
				setTaskStatus('AI 任务：CLI 正在生成回复…')
				continue
			}
			if (chunk.type === 'tool_call') {
				setTaskStatus(`AI 任务：正在调用工具 ${chunk.tool}…`)
				pushAgentFlow({
					id: `cli-tool-${chunk.tool}-${Date.now()}`,
					kind: 'skill',
					title: `CLI Tool · ${chunk.tool}`,
					detail: '调用中…',
					status: 'pending',
					source: 'copilot-cli',
				})
				continue
			}
			if (chunk.type === 'tool_result') {
				pushAgentFlow({
					id: `cli-tool-${chunk.tool}-${Date.now()}`,
					kind: 'skill',
					title: `CLI Tool · ${chunk.tool}`,
					detail: '完成',
					status: 'completed',
					source: 'copilot-cli',
				})
				continue
			}
		}

		const finalText =
			payload.chatMessages.value.find((m) => m.id === assistantMsgId)?.content || ''
		if (!String(finalText).trim() && !receivedError && !receivedDone) {
			payload.pushToast('CLI 返回为空，请重试。', 'warn')
		}
	}

	const seedanceSupportsServiceTier = (modelId: string) =>
		String(modelId || '').trim() === 'doubao-seedance-1-5-pro-251215'

	const appendNanoDetail = (line: string) => {
		const text = String(line || '').trim()
		if (!text) return
		payload.nanoDetail.value = payload.nanoDetail.value
			? `${payload.nanoDetail.value}\n${text}`
			: text
	}

	const pushLocalExecFlow = (event: Omit<LocalExecFlowEvent, 'id'>) => {
		payload.codexFlowEvents.value = payload.codexFlowEvents.value.concat([
			{ id: makeChatId(), ...event }
		])
	}

	const DEBUGGER_NOISE_RE = [
		/^Debugger attached\.?$/i,
		/^Waiting for the debugger to disconnect\.{0,3}$/i,
		/^Debugger listening on ws:\/\/.+$/i,
		/^For help, see:\s*https?:\/\/nodejs\.org\/en\/docs\/inspector\/?$/i,
		/^To start debugging, open the following URL in (?:Chrome|Edge):.+$/i
	]

	const normalizeChatErrorMessage = (input: unknown) => {
		const raw = String(input ?? '')
			.replace(/\r/g, '\n')
			.trim()
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
			executionHints: [] as string[]
		}
		if (!text.startsWith('/')) return out

		const idx = text.indexOf(' ')
		const cmd = (idx > 0 ? text.slice(1, idx) : text.slice(1)).trim().toLowerCase()
		const args = (idx > 0 ? text.slice(idx + 1) : '').trim()

		if (cmd === 'plan') {
			out.content = args
				? `请先输出执行计划，再逐步执行：${args}`
				: '请先输出执行计划，再逐步执行。'
			out.skillHints.push('slash-command:/plan')
			out.executionHints.push('plan-first-before-tool-execution')
			return out
		}
		if (cmd === 'read') {
			out.content = args
				? `请阅读并总结以下目标（文件/目录/关键词）：${args}`
				: '请阅读并总结当前工作区的关键上下文。'
			out.skillHints.push('slash-command:/read')
			out.executionHints.push('prefer-read-only-tooling')
			return out
		}
		if (cmd === 'edit') {
			out.content = args
				? `请对以下目标执行编辑并给出实际变更：${args}`
				: '请执行一次最小可行编辑并返回实际变更。'
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

	const getStringField = (obj: unknown, key: string): string => {
		if (isRecord(obj)) {
			const val = obj[key]
			if (isString(val)) return val
		}
		return ''
	}

	const isUnknown = (_v: unknown): _v is unknown => true

	const getArrayField = <T>(obj: unknown, key: string, itemGuard: (v: unknown) => v is T): T[] => {
		if (isRecord(obj)) {
			const val = obj[key]
			if (Array.isArray(val)) {
				return val.filter(itemGuard)
			}
		}
		return []
	}

	const onSend = async () => {
		if (payload.chatModelKey.value === 'nanobanana' || payload.chatModelKey.value === 'seedance')
			return
		if (payload.chatSending.value) return
		const content = String(payload.chatDraft.value || '').trim()
		if (!content) return

		const history = payload.chatMessages.value
			.filter(
				(message) =>
					message.role === 'user' || message.role === 'assistant' || message.role === 'system'
			)
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
				const backend = payload.agentBackend.value

				if (backend === 'dvsagent') {
					await handleAgentStream(content, history, assistantMsg.id)
					payload.chatSending.value = false
					payload.chatRunState.value = 'idle'
					return
				}

				if (backend === 'cli') {
					await handleCLIStream(content, history, assistantMsg.id)
					payload.chatSending.value = false
					payload.chatRunState.value = 'idle'
					return
				}

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
						projectId
					})
					const createdError = getStringField(created, 'error')
					if (createdError) {
						throw new Error(createdError || 'create codex session failed')
					}
					sessionId = getStringField(created, 'id').trim()
					if (!sessionId) throw new Error('create codex session returned empty id')
					payload.codexActiveSessionId.value = sessionId
					payload.codexSessions.value = [
						{
							id: sessionId,
							title: getStringField(created, 'title').trim() || 'Copilot CLI 会话',
							status: getStringField(created, 'status') || 'active',
							modelName: getStringField(created, 'model_name') || payload.chatModelId.value || '',
							source: 'copilot-cli'
						},
						...payload.codexSessions.value.filter((s) => s.id !== sessionId)
					]
				}

				pushLocalExecFlow({
					kind: 'session',
					title: '会话已就绪',
					detail: sessionId,
					status: 'completed',
					source: 'copilot-cli'
				})
				setTaskStatus('AI 任务：会话已就绪，开始执行…')

				let receivedAssistantDone = false
				let receivedTurnDone = false
				let receivedError = false

				for await (const ev of streamMessage(
					sessionId,
					{
						content: parsed.content,
						references: [],
						projectId,
						skillHints: parsed.skillHints,
						executionHints: parsed.executionHints,
						agentMode: payload.agentConversationMode.value,
						permissionProfile: 'default'
					},
					abortController.signal
				)) {
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
						pushLocalExecFlow({
							kind: 'error',
							title: '流式错误',
							detail: errMsg,
							status: 'failed',
							source: 'copilot-cli'
						})
						break
					}

					if (ev.type !== 'event') continue
					const name = getStringField(ev, 'event')
					const data = isRecord(ev.data) ? ev.data : {}

					if (name === 'assistant_delta') {
						const delta = getStringField(data, 'delta')
						if (delta) {
							updateAssistantMessageContent(assistantMsg.id, (prev) => prev + delta)
						}
						setTaskStatus('AI 任务：正在生成回复…')
						continue
					}

					if (name === 'assistant_done') {
						receivedAssistantDone = true
						const doneTextRaw = getStringField(data, 'content')
						const doneText = doneTextRaw.trim()
						if (doneText) {
							updateAssistantMessageContent(assistantMsg.id, () => doneTextRaw)
						}
						setTaskStatus('AI 任务：回复已生成')
						continue
					}

					if (name === 'plan_update') {
						pushLocalExecFlow({
							kind: 'plan',
							title: '计划更新',
							detail: getStringField(data, 'explanation'),
							status: 'completed',
							source: 'copilot-cli'
						})
						continue
					}

					if (name === 'runtime_context') {
						const skills = getArrayField(data, 'skills', isUnknown)
						const mcpServers = getArrayField(data, 'active_mcp_servers', isUnknown)
						const skillCount = skills.length
						const mcpCount = mcpServers.length
						setTaskStatus('AI 任务：正在加载运行时上下文…')
						pushLocalExecFlow({
							kind: 'runtime',
							title:
								payload.localExecStreamMode.value === 'mock' ? '测试运行时上下文' : '运行时上下文',
							detail: `skills ${skillCount} · mcp ${mcpCount}`,
							status: 'completed',
							source: 'copilot-cli'
						})
						continue
					}

					if (name === 'skill_call') {
						const skillName = getStringField(data, 'name').trim() || 'skill'
						const skillStatusRaw = getStringField(data, 'status').trim().toLowerCase()
						setTaskStatus(`AI 任务：正在调用技能 ${skillName}…`)
						pushLocalExecFlow({
							kind: 'skill',
							title: `Skill · ${skillName}`,
							detail: getStringField(data, 'description'),
							status: skillStatusRaw === 'failed' ? 'failed' : 'completed',
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'command_started') {
						const command = hasKey(data, 'command') ? data.command : ''
						setTaskStatus('AI 任务：正在执行命令…')
						pushLocalExecFlow({
							kind: 'command',
							title: '命令开始',
							detail: Array.isArray(command) ? command.join(' ') : String(command || ''),
							status: 'pending',
							messageId: getStringField(data, 'message_id'),
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'command_completed') {
						setTaskStatus('AI 任务：命令完成，继续处理中…')
						const cmdStatus = getStringField(data, 'status')
						pushLocalExecFlow({
							kind: 'command',
							title: '命令完成',
							detail: cmdStatus || 'completed',
							status: cmdStatus.toLowerCase() === 'completed' ? 'completed' : 'failed',
							messageId: getStringField(data, 'message_id'),
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'file_change_started') {
						const changes = getArrayField(data, 'changes', isUnknown)
						pushLocalExecFlow({
							kind: 'fileChange',
							title: '文件变更准备',
							detail: String(changes.length) + ' 项',
							status: 'pending',
							messageId: getStringField(data, 'message_id'),
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'file_change_completed') {
						const changes = getArrayField(data, 'changes', isUnknown)
						pushLocalExecFlow({
							kind: 'fileChange',
							title: '文件变更',
							detail: String(changes.length) + ' 项',
							status: 'completed',
							messageId: getStringField(data, 'message_id'),
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'approval_requested') {
						const requestId = getStringField(data, 'request_id')
						pushLocalExecFlow({
							kind: 'approval',
							title: '等待审批',
							detail: requestId || 'request',
							status: 'pending',
							messageId: getStringField(data, 'message_id'),
							approvalRequestId: requestId,
							source: 'copilot-cli',
							payload: data
						})
						continue
					}

					if (name === 'error') {
						const errMsg = normalizeChatErrorMessage(getStringField(data, 'message') || 'unknown')
						receivedError = true
						payload.chatRunState.value = 'error'
						setTaskStatus('AI 任务：错误')
						payload.pushToast('Copilot CLI 错误：' + errMsg, 'warn')
						pushLocalExecFlow({
							kind: 'error',
							title: '执行错误',
							detail: errMsg,
							status: 'failed',
							source: 'copilot-cli'
						})
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

				const finalAssistantText =
					payload.chatMessages.value.find((message) => message.id === assistantMsg.id)?.content ||
					''
				if (!String(finalAssistantText).trim() && !receivedError) {
					payload.pushToast('Copilot CLI 返回为空，请重试。', 'warn')
				}
				return
			}

			for await (const ev of svc.blueprintChatStream({ content, history }, activeAbortController?.signal)) {
				if (ev.type === 'done') break
				if (ev.type === 'error') {
					payload.chatRunState.value = 'error'
					setTaskStatus('AI 任务：错误')
					payload.pushToast('AI 对话失败：' + String(ev.error?.message ?? 'unknown'), 'warn')
					break
				}
				if (ev.type === 'msg') {
					const message = ev.message
					if (message.type === 'agentToUi/text') {
						const msgPayload = isRecord(message.payload) ? message.payload : {}
						const delta = getStringField(msgPayload, 'text')
						if (delta) {
							updateAssistantMessageContent(assistantMsg.id, (prev) => prev + delta)
						}
						setTaskStatus('AI 任务：正在生成回复…')
						continue
					}
					if (message.type === 'agentToUi/taskStatus') {
						const msgPayload = isRecord(message.payload) ? message.payload : {}
						const phase = getStringField(msgPayload, 'phase')
						const text = hasKey(msgPayload, 'message') ? msgPayload.message : ''
						setTaskStatus(
							'AI 任务：' +
								String(typeof text === 'string' && text.trim() ? text.trim() : phase || '处理中')
						)
						continue
					}
					if (message.type === 'agentToUi/error') {
						const msgPayload = isRecord(message.payload) ? message.payload : {}
						const text = hasKey(msgPayload, 'message') ? msgPayload.message : 'unknown'
						payload.chatRunState.value = 'error'
						setTaskStatus('AI 任务：错误')
						payload.pushToast(
							'AI 对话失败：' + String(typeof text === 'string' ? text : 'unknown'),
							'warn'
						)
						break
					}
				}
			}

			const finalAssistantText =
				payload.chatMessages.value.find((message) => message.id === assistantMsg.id)?.content || ''
			if (!String(finalAssistantText).trim()) {
				payload.pushToast('AI 返回为空，请重试。', 'warn')
			}
		} catch (err: unknown) {
			const errMsgRaw = getErrorMessage(err)
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

	const parseNanoImageMessage = (content: string): unknown => {
		try {
			const parsed = JSON.parse(content)
			if (isRecord(parsed)) return parsed
		} catch {
			// ignore
		}
		return {}
	}

	const parseSeedanceMessage = (content: string): unknown => {
		try {
			const parsed = JSON.parse(content)
			if (isRecord(parsed)) return parsed
		} catch {
			// ignore
		}
		return {}
	}

	const onNanoBananaGenerate = async (input: {
		prompt: string
		config: NanoBananaConfig & Record<string, unknown>
	}) => {
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
		const requestedCountRaw = Number(hasKey(input.config, 'quantity') ? input.config.quantity : 1)
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
			const inputAnchors = Array.isArray(pseudo?.inputs)
				? (pseudo.inputs as WorkflowAnchorSpec[])
				: ([] as WorkflowAnchorSpec[])
			const sortedAnchors = [...inputAnchors].sort(
				(a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id)
			)
			for (const anchor of sortedAnchors) {
				if (refFiles.length >= payload.NANO_REF_IMAGE_MAX) break
				const edge = payload.getFirstIncomingEdge(
					payload.NANO_ANCHOR_NODE_ID,
					String(anchor.id ?? '')
				)
				if (!edge) continue
				const fromNodeId = getStringField(edge, 'fromNodeId')
				const fromNode = payload.store.state.nodesById[fromNodeId]
				if (!fromNode) continue
				const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
				if (!isImageSource) {
					payload.pushToast(
						`图片生成参考图仅支持连接「图片节点/旋转图片节点」输出（当前：${fromNode.type}）。`,
						'warn'
					)
					continue
				}
				let url = payload.nodeResourceUrl(fromNode)
				if (!url) {
					payload.pushToast('图片生成参考图来源节点缺少图片资源。', 'warn')
					continue
				}
				const nameBase =
					String(
						payload.nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref'
					).trim() || 'ref'
				const idx = anchorIndexFromId(anchor.id)

				if (
					fromNode.type === 'rotate-image' &&
					(String(url).startsWith('blob:') ||
						String(url).startsWith('data:') ||
						String(url).startsWith('file:') ||
						String(url).startsWith('/'))
				) {
					try {
						const uploaded = await payload.uploadLocalResourceAndGetUrl(
							String(url),
							'image',
							`${nameBase}_rot`,
							{ projectId: payload.currentProjectId.value }
						)
						const rid = getStringField(fromNode, 'resourceId').trim()
						if (rid) {
							const patch: Record<string, unknown> = {
								url: uploaded.url,
								sourcePath: uploaded.absolutePath || undefined
							}
							if (isString(uploaded.projectRelativePath)) {
								patch.projectRelativePath = uploaded.projectRelativePath
							}
							payload.store.commit('patchResource', {
								resourceId: rid,
								patch
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

			const rotateRefIdx = refSources
				.filter((source) => source.nodeType === 'rotate-image')
				.map((source) => source.idx)
			const imageRefIdx = refSources
				.filter((source) => source.nodeType === 'image')
				.map((source) => source.idx)
			let finalPrompt = prompt
			if (rotateRefIdx.length) {
				const relLines: string[] = []
				relLines.push('[Reference Relation Rules]')
				if (imageRefIdx.length) {
					relLines.push(`- Original refs: #${imageRefIdx.join(', #')}.`)
				}
				relLines.push(
					`- Rotated refs: #${rotateRefIdx.join(', #')} (these are rotated-view references generated from the same original content).`
				)
				relLines.push(
					'- REQUIRED: Keep the exact identical BACKGROUND, environment, and lighting from original refs.'
				)
				relLines.push(
					'- REQUIRED: Keep exact identity/texture/structure of the subject from original refs, and ONLY align the camera/view/framing to rotated refs.'
				)
				relLines.push(
					'- Do not replace the subject, do not alter the background, do not invent new materials or elements.'
				)
				finalPrompt = `${prompt}\n\n${relLines.join('\n')}`
			}

			const ar = String(
				input?.config?.aspectRatio ??
					(hasKey(input.config, 'meshyAspectRatio') ? input.config.meshyAspectRatio : '')
			).trim()
			const selectedImageModel = String(
				hasKey(input.config, 'imageModel') ? input.config.imageModel : ''
			).trim()
			const selectedMeshyAiModel = String(
				hasKey(input.config, 'meshyImageAiModel') ? input.config.meshyImageAiModel : ''
			).trim()
			const meshyPoseMode = String(
				hasKey(input.config, 'meshyPoseMode') ? input.config.meshyPoseMode : ''
			).trim()
			const meshyGenerateMultiView = Boolean(
				hasKey(input.config, 'meshyGenerateMultiView') ? input.config.meshyGenerateMultiView : false
			)
			const isSeedreamModel = selectedImageModel.startsWith('doubao-seedream-')
			const isJimengImageModel = selectedImageModel.startsWith('jimeng-image-')
			const isMeshyModel = selectedImageModel === 'meshy'
			const imageEngineLabel = isJimengImageModel
				? '即梦图片'
				: isSeedreamModel
					? 'Seedream'
					: isMeshyModel
						? 'Meshy'
						: 'NanoBanana'

			let completedCount = 0
			let failedCount = 0
			const updateProgressStatus = () => {
				payload.nanoStatus.value = `并发请求中（${completedCount}/${requestCount}）`
				if (completedCount >= requestCount) {
					const successCount = requestCount - failedCount
					payload.nanoStatus.value =
						failedCount > 0 ? `完成（成功 ${successCount}，失败 ${failedCount}）` : '完成'
				}
			}

			if (isMeshyModel) {
				const hasRefImages = refFiles.length > 0
				const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'

				const meshyPayload: Record<string, unknown> = {
					mode: taskType,
					prompt: finalPrompt,
					ai_model: selectedMeshyAiModel || 'nano-banana'
				}

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

					const res = await svc.meshyGenerateImage(form)
					if (res.ok) {
						const taskId = String(res.taskId || '').trim()
						if (taskId) {
							appendNanoDetail(`Meshy 任务已创建：${taskId}`)
							payload.nanoStatus.value = `任务已创建（${taskId}）`

							const pollStatus = async () => {
								const taskRes = await svc.meshyTask(taskId, taskType)
								if (taskRes.ok) {
									const status = String(taskRes.status || '')
										.trim()
										.toUpperCase()
									const progress = Number(taskRes.progress || 0)
									payload.nanoStatus.value =
										status === 'SUCCEEDED' ? '完成' : `${status}（${progress}%）`

									if (status === 'SUCCEEDED') {
										const imageUrl =
											taskRes.preferredImageUrl ||
											(Array.isArray(taskRes.imageUrls) ? taskRes.imageUrls[0] : undefined)
										if (imageUrl && isString(imageUrl)) {
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
					const res = await svc.meshyGenerate(meshyPayload)
					if (res.ok) {
						const taskId = String(res.taskId || '').trim()
						if (taskId) {
							appendNanoDetail(`Meshy 任务已创建：${taskId}`)
							payload.nanoStatus.value = `任务已创建（${taskId}）`

							const pollStatus = async () => {
								const taskRes = await svc.meshyTask(taskId, taskType)
								if (taskRes.ok) {
									const status = String(taskRes.status || '')
										.trim()
										.toUpperCase()
									const progress = Number(taskRes.progress || 0)
									payload.nanoStatus.value =
										status === 'SUCCEEDED' ? '完成' : `${status}（${progress}%）`

									if (status === 'SUCCEEDED') {
										const imageUrl =
											taskRes.preferredImageUrl ||
											(Array.isArray(taskRes.imageUrls) ? taskRes.imageUrls[0] : undefined)
										if (imageUrl && isString(imageUrl)) {
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
				if (cacheRes.ok && Array.isArray(cacheRes.cacheIds)) {
					cachedRefIds = cacheRes.cacheIds.map((v) => String(v || '')).filter(Boolean)
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
							const msgPayload = isRecord(message.payload) ? message.payload : {}
							const content = getStringField(msgPayload, 'content')
							const obj = parseNanoImageMessage(content)
							if (isRecord(obj)) {
								const imageUrl = getStringField(obj, 'imageUrl')
								if (imageUrl) {
									const nextUrl = payload.resolveBackendUrl(imageUrl)
									const fallbackUrl = payload.resolveBackendUrl(
										getStringField(obj, 'imageUrlRemote')
									)
									if (nextUrl) {
										payload.nanoPreviewUrls.value = payload.nanoPreviewUrls.value.map((v, i) =>
											i === index ? nextUrl : v
										)
										payload.nanoPreviewFallbackUrls.value =
											payload.nanoPreviewFallbackUrls.value.map((v, i) =>
												i === index ? fallbackUrl : v
											)
										payload.nanoPreviewDownloadStatuses.value =
											payload.nanoPreviewDownloadStatuses.value.map((v, i) =>
												i === index ? 'ready' : v
											)
										payload.nanoPreviewDownloadProgresses.value =
											payload.nanoPreviewDownloadProgresses.value.map((v, i) =>
												i === index ? 100 : v
											)
										payload.nanoPreviewLocalReadyStates.value =
											payload.nanoPreviewLocalReadyStates.value.map((v, i) =>
												i === index ? true : v
											)
										payload.nanoPreviewLoadingStates.value =
											payload.nanoPreviewLoadingStates.value.map((v, i) =>
												i === index ? false : v
											)
										if (!payload.nanoPreviewUrl.value) payload.nanoPreviewUrl.value = nextUrl
									}
								}
								const billing = getStringField(obj, 'billing')
								if (billing) payload.nanoBilling.value = billing
								const model = getStringField(obj, 'model')
								if (model) payload.nanoModelUsed.value = model
							}
							continue
						}

						if (message.type === 'agentToUi/error') {
							const msgPayload = isRecord(message.payload) ? message.payload : {}
							const text = hasKey(msgPayload, 'message') ? msgPayload.message : 'unknown'
							const errMsg = String(typeof text === 'string' ? text : 'unknown')
							requestFailed = true
							appendNanoDetail(`请求 ${requestNo} 错误：${errMsg}`)
							payload.pushToast(`图片生成第 ${requestNo} 张失败：` + errMsg, 'warn')
							break
						}
					}
				} finally {
					payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map(
						(v, i) => (i === index ? false : v)
					)
					if (requestFailed) failedCount += 1
					completedCount += 1
					updateProgressStatus()
				}
			}

			await Promise.all(Array.from({ length: requestCount }, (_, idx) => runSingleRequest(idx)))
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			payload.nanoStatus.value = '失败'
			appendNanoDetail(`错误：${errMsg}`)
			payload.pushToast('图片生成失败：' + errMsg, 'warn')
		} finally {
			const minShowMs = 900
			const elapsed = Date.now() - sendingStartAt
			if (elapsed < minShowMs) {
				await new Promise((r) => setTimeout(r, minShowMs - elapsed))
			}
			payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map(
				() => false
			)
			payload.chatSending.value = false
		}
	}

	const onSeedanceGenerate = async (input: {
		prompt: string
		config: SeedanceConfig & Record<string, unknown>
	}) => {
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
			const inputAnchors = Array.isArray(pseudo?.inputs)
				? (pseudo.inputs as WorkflowAnchorSpec[])
				: ([] as WorkflowAnchorSpec[])
			const sortedAnchors = [...inputAnchors].sort(
				(a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id)
			)
			for (const anchor of sortedAnchors) {
				if (refFiles.length >= 4) break
				const edge = payload.getFirstIncomingEdge(
					payload.NANO_ANCHOR_NODE_ID,
					String(anchor.id ?? '')
				)
				if (!edge) continue
				const fromNodeId = getStringField(edge, 'fromNodeId')
				const fromNode = payload.store.state.nodesById[fromNodeId]
				if (!fromNode) continue
				const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
				if (!isImageSource) continue
				const url = payload.nodeResourceUrl(fromNode)
				if (!url) continue
				const nameBase =
					String(
						payload.nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref'
					).trim() || 'ref'
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

			const useFrames = Boolean(hasKey(input.config, 'useFrames') ? input.config.useFrames : false)
			if (isJimengVideoModel) {
				if (useFrames) {
					const framesText = String(
						hasKey(input.config, 'frames') ? input.config.frames : ''
					).trim()
					if (framesText) form.set('frames', framesText)
				} else {
					form.set('duration', String(Number(input?.config?.duration ?? 5) || 5))
				}
			} else if (useFrames) {
				const framesText = String(hasKey(input.config, 'frames') ? input.config.frames : '').trim()
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
				const templateId = String(
					hasKey(input.config, 'templateId') ? input.config.templateId : ''
				).trim()
				const cameraStrength = String(
					hasKey(input.config, 'cameraStrength') ? input.config.cameraStrength : 'medium'
				)
					.trim()
					.toLowerCase()
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
				const effectiveCount = !hasRefs
					? 0
					: refMode === 'recamera'
						? 1
						: refMode === 'first'
							? 1
							: refMode === 'first-last'
								? Math.min(2, refFiles.length)
								: Math.min(referenceCount, refFiles.length)
				appendNanoDetail(
					`即梦参考图策略：${modeText}（输入 ${refFiles.length} 张，生效 ${effectiveCount} 张）`
				)
				if (refMode === 'first-last' && refFiles.length > 2) {
					appendNanoDetail(
						'提示：首尾帧模式最多使用 2 张参考图；若需超过 2 张请切换到"自动/参考图"模式。'
					)
				}
				if (!hasRefs) appendNanoDetail('即梦模式：当前为纯文本生视频（无参考图）')
			}

			if (!isJimengVideoModel) {
				form.set(
					'generateAudio',
					(hasKey(input.config, 'generateAudio') ? input.config.generateAudio : false)
						? '1'
						: '0'
				)
				form.set(
					'watermark',
					(hasKey(input.config, 'watermark') ? input.config.watermark : false) ? '1' : '0'
				)
				form.set(
					'cameraFixed',
					(hasKey(input.config, 'cameraFixed') ? input.config.cameraFixed : false)
						? '1'
						: '0'
				)
				form.set(
					'draft',
					(hasKey(input.config, 'draft') ? input.config.draft : false) ? '1' : '0'
				)
				form.set(
					'returnLastFrame',
					(hasKey(input.config, 'returnLastFrame') ? input.config.returnLastFrame : false)
						? '1'
						: '0'
				)

				const currentModel = String(hasKey(input.config, 'model') ? input.config.model : '').trim()
				const serviceTier = String(
					hasKey(input.config, 'serviceTier') ? input.config.serviceTier : ''
				).trim()
				if (serviceTier && seedanceSupportsServiceTier(currentModel))
					form.set('serviceTier', serviceTier)
				const executionExpiresAfter = String(
					hasKey(input.config, 'executionExpiresAfter') ? input.config.executionExpiresAfter : ''
				).trim()
				if (executionExpiresAfter) form.set('executionExpiresAfter', executionExpiresAfter)
			}

			for (const rf of refFiles) form.append('refImages', rf.file, rf.file.name)

			const stream = isJimengVideoModel
				? svc.jimengVideoGenerateStream(form)
				: svc.seedanceGenerateStream(form)
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
					const msgPayload = isRecord(message.payload) ? message.payload : {}
					const content = getStringField(msgPayload, 'content')
					const obj = parseSeedanceMessage(content)
					if (isRecord(obj)) {
						const taskId = getStringField(obj, 'taskId').trim()
						const remoteUrl = payload.resolveBackendUrl(getStringField(obj, 'videoUrlRemote'))
						const localUrl = payload.resolveBackendUrl(getStringField(obj, 'videoUrlLocal'))
						const nextUrl = payload.resolveBackendUrl(getStringField(obj, 'videoUrl'))
						const downloadStatus = getStringField(obj, 'downloadStatus').trim() || 'pending'
						const downloadProgressRaw = Number(
							hasKey(obj, 'downloadProgress') ? obj.downloadProgress : 0
						)
						const downloadProgress = Number.isFinite(downloadProgressRaw)
							? Math.max(0, Math.min(100, Math.round(downloadProgressRaw)))
							: 0
						const localReady = !!localUrl && downloadStatus === 'ready'
						const sourcePath = getStringField(obj, 'videoSourcePath').trim()
						const displayUrl = localReady ? localUrl : remoteUrl || nextUrl || localUrl
						payload.nanoPreviewUrls.value = [displayUrl]
						payload.nanoPreviewFallbackUrls.value = [remoteUrl]
						payload.nanoPreviewSourcePaths.value = [localReady ? sourcePath : '']
						payload.nanoPreviewDownloadStatuses.value = [downloadStatus]
						payload.nanoPreviewDownloadProgresses.value = [downloadProgress]
						payload.nanoPreviewLocalReadyStates.value = [localReady]
						payload.nanoPreviewLoadingStates.value = [!displayUrl]
						if (displayUrl) payload.nanoPreviewUrl.value = displayUrl
						const billing = getStringField(obj, 'billing')
						if (billing) payload.nanoBilling.value = billing
						const model = getStringField(obj, 'model')
						if (model) payload.nanoModelUsed.value = model
						if (!isJimengVideoModel && taskId) {
							observedSeedanceTaskId = taskId
							payload.onSeedanceTaskObserved?.(taskId, 'completed')
						}
					}
					continue
				}
				if (message.type === 'agentToUi/taskStatus') {
					const msgPayload = isRecord(message.payload) ? message.payload : {}
					const text = getStringField(msgPayload, 'message').trim()
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
					const msgPayload = isRecord(message.payload) ? message.payload : {}
					const text = getStringField(msgPayload, 'message') ?? 'unknown'
					payload.nanoStatus.value = '失败'
					appendNanoDetail(`错误：${text}`)
					payload.pushToast(videoEngineLabel + ' 生成失败：' + text, 'warn')
					break
				}
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			payload.nanoStatus.value = '失败'
			appendNanoDetail(`错误：${errMsg}`)
			payload.pushToast('视频生成失败：' + errMsg, 'warn')
		} finally {
			const minShowMs = 900
			const elapsed = Date.now() - sendingStartAt
			if (elapsed < minShowMs) {
				await new Promise((r) => setTimeout(r, minShowMs - elapsed))
			}
			payload.nanoPreviewLoadingStates.value = payload.nanoPreviewLoadingStates.value.map(
				() => false
			)
			payload.chatSending.value = false
		}
	}

	return {
		onSend,
		onStop,
		onNanoBananaGenerate,
		onSeedanceGenerate
	}
}
