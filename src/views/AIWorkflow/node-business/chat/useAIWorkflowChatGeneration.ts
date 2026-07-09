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
import { getAgentChatBridge } from '../../../../network/chat'
import { getErrorMessage, hasKey, isRecord, isString } from '../../../../types/utils'
import { getChatModelById } from '../../../../ai/models/chatModels'
import { t } from '../../../../i18n'

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

type MediaStreamMessage = {
	type: string
	payload?: unknown
}

type MediaStreamEvent = {
	type?: 'done' | 'error' | 'msg'
	error?: { message?: unknown }
	message?: MediaStreamMessage
}

export type MediaGenerationService = {
	nanoBananaCacheRefImages: (form: FormData) => Promise<CacheRefImagesResult>
	seedreamCacheRefImages: (form: FormData) => Promise<CacheRefImagesResult>
	nanoBananaGenerateStream: (form: FormData) => AsyncIterable<MediaStreamEvent>
	seedreamGenerateStream: (form: FormData) => AsyncIterable<MediaStreamEvent>
	jimengImageGenerateStream: (form: FormData) => AsyncIterable<MediaStreamEvent>
	jimengVideoGenerateStream: (form: FormData) => AsyncIterable<MediaStreamEvent>
	seedanceGenerateStream: (form: FormData) => AsyncIterable<MediaStreamEvent>
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
		resourcesById?: Record<string, Record<string, unknown>>
	}
	commit: (type: string, value?: unknown) => void
}

type ChatGenerationPayload = {
	store: ChatGenerationStore
	chatModelKey: Ref<string>
	chatDraft: Ref<string>
	chatModelId: Ref<string>
	chatThinkingEffort: Ref<'disabled' | 'low' | 'medium' | 'high'>
	chatContextUsage: Ref<{ tokenCount: number; budget: number; usage: number; truncated?: boolean } | null>
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
	getMediaService: () => MediaGenerationService
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
			const updatedToolCalls = message.toolCalls.map((tc: any) => {
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

	const setMessageUserChoices = (messageId: string, choices: string[]) => {
		const id = String(messageId || '').trim()
		if (!id) return
		payload.chatMessages.value = payload.chatMessages.value.map((message) => {
			if (message.id !== id) return message
			return { ...message, userChoices: choices, userChoiceSelected: null }
		})
	}

	const setMessageUserChoiceSelected = (messageId: string, choiceIndex: number) => {
		const id = String(messageId || '').trim()
		if (!id) return
		payload.chatMessages.value = payload.chatMessages.value.map((message) => {
			if (message.id !== id) return message
			return { ...message, userChoiceSelected: choiceIndex }
		})
	}

	const extractChoicesFromText = (text: string): string[] => {
		const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
		const choices: string[] = []
		const choicePatterns = [
			/^\d+[.、\)）]\s*(.+)$/,
			/^[①②③④⑤⑥⑦⑧⑨⑩]\s*(.+)$/,
			/^[a-zA-Z][.、\)）]\s*(.+)$/,
		]
		for (const line of lines) {
			for (const pattern of choicePatterns) {
				const match = line.match(pattern)
				if (match && match[1]) {
					choices.push(match[1].trim())
					break
				}
			}
		}
		return choices.length >= 2 ? choices : []
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

	const getSourceLabel = (backend: AgentBackendType): 'dvsagent' | 'copilot-cli' | 'codex-cli' => {
		if (backend === 'copilot') return 'copilot-cli'
		if (backend === 'codex') return 'codex-cli'
		return 'dvsagent'
	}

	const collectBlueprintContext = () => {
		const nodes = typeof payload.getAllNodes === 'function' ? payload.getAllNodes() : []
		const edges = typeof payload.getAllEdges === 'function' ? payload.getAllEdges() : []
		const selectedNode = typeof payload.getSelectedNode === 'function' ? payload.getSelectedNode() : null

		const nodeTypeStats: Record<string, number> = {}
		for (const n of nodes) {
			const nodeType = String(n.type || 'unknown')
			nodeTypeStats[nodeType] = (nodeTypeStats[nodeType] || 0) + 1
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

	const getDwebApiKeys = async (): Promise<Record<string, string>> => {
		const w = window as Window & {
			dweb?: {
				aiworkflow?: {
					db?: {
						apiKeys?: {
							getPlaintext?: (provider: string) => Promise<{ ok?: boolean; plaintext?: string }>
						}
					}
				}
			}
		}
		const apiKeysRepo = w.dweb?.aiworkflow?.db?.apiKeys
		if (!apiKeysRepo?.getPlaintext) return {}

		const providerAliases: Record<string, string[]> = {
			openai: ['openai', 'openai_api'],
			bytedance: ['bytedance_ark', 'bytedance_text', 'bytedance', 'doubao', 'ark', 'volcengine'],
			gemini: ['gemini', 'google_gemini', 'gemini_api']
		}

		const result: Record<string, string> = {}
		for (const [provider, aliases] of Object.entries(providerAliases)) {
			for (const alias of aliases) {
				try {
					const res = await apiKeysRepo.getPlaintext(alias)
					if (res?.ok && res.plaintext) {
						result[provider] = res.plaintext
						break
					}
				} catch {
					// ignore individual alias errors
				}
			}
		}
		return result
	}

	const handleChatStream = async (
		backend: AgentBackendType,
		content: string,
		sessionId: string,
		assistantMsgId: string,
		options: {
			history?: Array<{ role: string; content: string }>
			apiKeys?: Record<string, string>
			apiSource?: string
			model?: string
			thinkingEffort?: 'disabled' | 'low' | 'medium' | 'high'
			context?: unknown
			skillHints?: string[]
			executionHints?: string[]
			agentMode?: 'agent' | 'ask' | 'plan'
			permissionProfile?: string
		} = {}
	) => {
		setTaskStatus(t('aiworkflow.toast.aiTaskThinking'))
		let receivedAnyContent = false
		let receivedError = false
		const signal = activeAbortController?.signal

		const chatBridge = getAgentChatBridge()

		try {
			for await (const ev of chatBridge.sendMessage(backend, sessionId, {
				content,
				model: options.model,
				history: options.history?.map(h => ({
					role: h.role as 'user' | 'assistant' | 'system',
					content: h.content
				})),
				context: options.context,
				apiKeys: options.apiKeys,
				apiSource: options.apiSource,
				thinkingEffort: options.thinkingEffort,
				skillHints: options.skillHints,
				executionHints: options.executionHints,
				agentMode: options.agentMode,
				permissionProfile: options.permissionProfile,
			}, signal)) {
				if (ev.type === 'done' || ev.type === 'turn_done') {
					setTaskStatus(t('aiworkflow.toast.aiTaskComplete'))
					break
				}
				if (ev.type === 'error') {
					receivedError = true
					payload.chatRunState.value = 'error'
					setTaskStatus(t('aiworkflow.toast.aiTaskError'))
					const isCli = backend === 'copilot' || backend === 'codex'
					const errorKey = isCli ? 'aiworkflow.toast.copilotCliFailed' : 'aiworkflow.toast.agentChatFailed'
					payload.pushToast(t(errorKey, { error: ev.message }), 'warn')
					pushLocalExecFlow({
						kind: 'error',
						title: t('aiworkflow.toast.streamErrorTitle'),
						detail: ev.message,
						status: 'failed',
						source: getSourceLabel(backend)
					})
					break
				}
				if (ev.type === 'text_delta') {
					updateAssistantMessageContent(assistantMsgId, (prev) => prev + ev.content)
					receivedAnyContent = true
					const isCli = backend === 'copilot' || backend === 'codex'
					setTaskStatus(isCli
						? t('aiworkflow.toast.aiTaskCliGenerating')
						: t('aiworkflow.toast.aiTaskGenerating'))
					continue
				}
				if (ev.type === 'thinking_delta') {
					updateAssistantMessageThinking(assistantMsgId, (prev) => prev + ev.content)
					setTaskStatus(t('aiworkflow.toast.aiTaskThinking'))
					continue
				}
				if (ev.type === 'thought') {
					setTaskStatus(t('aiworkflow.toast.aiTaskThinking'))
					continue
				}
				if (ev.type === 'context_usage') {
					payload.chatContextUsage.value = ev
					continue
				}
				if (ev.type === 'tool_call_start') {
					const tcId = ev.toolCallId || `tool-${ev.tool}-${Date.now()}`
					addToolCallToMessage(assistantMsgId, {
						id: tcId,
						name: ev.tool,
						status: 'running',
						args: ev.input
					})
					setTaskStatus(t('aiworkflow.toast.aiTaskCallingTool', { tool: ev.tool }))
					pushAgentFlow({
						id: tcId,
						kind: 'skill',
						title: `Tool · ${ev.tool}`,
						detail: t('aiworkflow.toast.aiTaskToolCalling'),
						status: 'pending',
						source: getSourceLabel(backend),
					})
					continue
				}
				if (ev.type === 'tool_call_end') {
					const tcId = ev.toolCallId || `tool-${ev.tool}-${Date.now()}`
					updateToolCallInMessage(assistantMsgId, tcId, {
						status: 'completed',
						result: ev.output
					})
					pushAgentFlow({
						id: tcId,
						kind: 'skill',
						title: `Tool · ${ev.tool}`,
						detail: t('aiworkflow.toast.aiTaskToolComplete'),
						status: 'completed',
						source: getSourceLabel(backend),
					})
					continue
				}
				if (ev.type === 'tool_call_error') {
					const tcId = ev.toolCallId || `tool-${ev.tool}-${Date.now()}`
					updateToolCallInMessage(assistantMsgId, tcId, {
						status: 'error',
						error: ev.error
					})
					pushAgentFlow({
						id: tcId,
						kind: 'skill',
						title: `Tool · ${ev.tool}`,
						detail: t('aiworkflow.toast.aiTaskToolFailed'),
						status: 'failed',
						source: getSourceLabel(backend),
					})
					continue
				}
				if (ev.type === 'plan_update') {
					pushLocalExecFlow({
						kind: 'plan',
						title: t('aiworkflow.toast.planUpdateTitle'),
						detail: ev.explanation,
						status: 'completed',
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'skill_call') {
					const skillName = String(ev.name || 'skill').trim()
					pushLocalExecFlow({
						kind: 'skill',
						title: `Skill · ${skillName}`,
						detail: ev.description || '',
						status: String(ev.status || 'completed').toLowerCase() === 'failed' ? 'failed' : 'completed',
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'runtime_context') {
					setTaskStatus(t('aiworkflow.toast.aiTaskLoadingContext'))
					pushLocalExecFlow({
						kind: 'runtime',
						title: t('aiworkflow.runtime.runtimeContextTitle'),
						detail: `skills ${ev.skills.length} · mcp ${ev.mcpServers.length}`,
						status: 'completed',
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'command_started') {
					setTaskStatus(t('aiworkflow.toast.aiTaskCommand'))
					pushLocalExecFlow({
						kind: 'command',
						title: t('aiworkflow.toast.commandStartTitle'),
						detail: Array.isArray(ev.command) ? ev.command.join(' ') : String(ev.command || ''),
						status: 'pending',
						messageId: ev.messageId,
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'command_completed') {
					setTaskStatus(t('aiworkflow.toast.aiTaskCommandComplete'))
					pushLocalExecFlow({
						kind: 'command',
						title: t('aiworkflow.toast.commandCompleteTitle'),
						detail: ev.status || 'completed',
						status: String(ev.status || 'completed').toLowerCase() === 'completed' ? 'completed' : 'failed',
						messageId: ev.messageId,
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'file_change_started') {
					pushLocalExecFlow({
						kind: 'fileChange',
						title: t('aiworkflow.toast.fileChangePrepareTitle'),
						detail: t('aiworkflow.toast.aiTaskFileChangeCount', { count: ev.changes.length }),
						status: 'pending',
						messageId: ev.messageId,
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'file_change_completed') {
					pushLocalExecFlow({
						kind: 'fileChange',
						title: t('aiworkflow.toast.fileChangeTitle'),
						detail: t('aiworkflow.toast.aiTaskFileChangeCount', { count: ev.changes.length }),
						status: 'completed',
						messageId: ev.messageId,
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'approval_requested') {
					pushLocalExecFlow({
						kind: 'approval',
						title: t('aiworkflow.toast.approvalWaitTitle'),
						detail: ev.requestId || 'request',
						status: 'pending',
						messageId: ev.messageId,
						approvalRequestId: ev.requestId,
						source: getSourceLabel(backend)
					})
					continue
				}
				if (ev.type === 'assistant_done') {
					receivedAnyContent = true
					if (ev.content && ev.content.trim()) {
						updateAssistantMessageContent(assistantMsgId, () => ev.content)
					}
					setTaskStatus(t('aiworkflow.toast.responseGenerated'))
					continue
				}
			}
		} catch (err: unknown) {
			receivedError = true
			const errMsg = normalizeChatErrorMessage(getErrorMessage(err))
			payload.chatRunState.value = 'error'
			setTaskStatus(t('aiworkflow.toast.aiTaskError'))
			payload.pushToast(t('aiworkflow.toast.aiChatFailed', { error: errMsg }), 'warn')
			pushLocalExecFlow({
				kind: 'error',
				title: t('aiworkflow.toast.execErrorTitle'),
				detail: errMsg,
				status: 'failed',
				source: getSourceLabel(backend)
			})
		}

		const finalText =
			payload.chatMessages.value.find((m) => m.id === assistantMsgId)?.content || ''
		if (!String(finalText).trim() && !receivedError && !receivedAnyContent) {
			const isCli = backend === 'copilot' || backend === 'codex'
			const emptyKey = isCli ? 'aiworkflow.toast.copilotCliEmpty' : 'aiworkflow.toast.aiTaskEmptyResponse'
			payload.pushToast(t(emptyKey), 'warn')
		}
		if (finalText) {
			const choices = extractChoicesFromText(finalText)
			if (choices.length > 0) {
				setMessageUserChoices(assistantMsgId, choices)
			}
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
		if (!raw) return t('aiworkflow.toast.localExecError')
		const lines = raw
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
		const cleaned = lines.filter((line) => !DEBUGGER_NOISE_RE.some((re) => re.test(line))).join(' ')
		return cleaned || t('aiworkflow.toast.localExecError')
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
		setTaskStatus(t('aiworkflow.toast.aiTaskPreparing'))
		try {
			const backend = payload.agentBackend.value

			if (backend === 'dvsagent') {
				const modelInfo = getChatModelById(payload.chatModelId.value)
				let apiSource = modelInfo?.apiSource || 'bytedance'
				let apiKeys: Record<string, string> = {}
				try {
					apiKeys = await getDwebApiKeys()
				} catch {
					// ignore frontend api key failure, backend reads from localdb
				}
				const context = collectBlueprintContext()

				let sessionId = String(payload.codexActiveSessionId.value || '').trim()
				const chatBridge = getAgentChatBridge()
				const isNewSession = !sessionId

				if (!sessionId) {
					setTaskStatus(t('aiworkflow.toast.aiTaskCreating'))
					const session = await chatBridge.createSession('dvsagent', {
						title: content.slice(0, 24),
						model: payload.chatModelId.value,
						cwd: undefined,
						projectId: payload.currentProjectId.value
					})
					sessionId = session.id
					payload.codexActiveSessionId.value = sessionId
					payload.codexSessions.value = [
						{
							id: sessionId,
							title: session.title || t('aiworkflow.page.chat.newConversation'),
							modelName: session.model || payload.chatModelId.value || '',
							status: 'active'
						},
						...payload.codexSessions.value.filter((s) => s.id !== sessionId)
					]
				} else {
					const existingSession = payload.codexSessions.value.find((s) => s.id === sessionId)
					if (existingSession && (existingSession.title === t('aiworkflow.page.chat.newConversation') || existingSession.title === '新对话')) {
						const newTitle = content.slice(0, 24)
						existingSession.title = newTitle
						try {
							const dvsagentService = chatBridge.getService('dvsagent') as any
							if (dvsagentService && typeof dvsagentService.renameSession === 'function') {
								await dvsagentService.renameSession(sessionId, newTitle)
							}
						} catch {
							// ignore rename failure
						}
					}
				}

				try {
					const dvsagentService = chatBridge.getService('dvsagent') as any
					if (dvsagentService && typeof dvsagentService.addSessionMessage === 'function') {
						await dvsagentService.addSessionMessage(sessionId, 'user', content, payload.chatModelId.value)
					}
				} catch {
					// ignore message persistence failure
				}

				await handleChatStream('dvsagent', content, sessionId, assistantMsg.id, {
					history,
					apiKeys,
					apiSource,
					model: payload.chatModelId.value,
					thinkingEffort: payload.chatThinkingEffort.value,
					context,
				})

				try {
					const dvsagentService = chatBridge.getService('dvsagent') as any
					if (dvsagentService && typeof dvsagentService.addSessionMessage === 'function') {
						const assistantMsgContent = payload.chatMessages.value.find((m) => m.id === assistantMsg.id)?.content || ''
						if (assistantMsgContent.trim()) {
							await dvsagentService.addSessionMessage(sessionId, 'assistant', assistantMsgContent, payload.chatModelId.value)
						}
					}
				} catch {
					// ignore message persistence failure
				}

				return
			}

			if (backend === 'copilot') {
				let projectId = payload.currentProjectId.value
				if (projectId == null && payload.ensureProjectId) {
					projectId = await payload.ensureProjectId({ silent: true })
				}
				if (projectId == null) {
					payload.pushToast(t('aiworkflow.toast.aiTaskAutoSaveFail'), 'warn')
					payload.chatRunState.value = 'error'
					setTaskStatus(t('aiworkflow.toast.aiTaskStartFailed'))
					return
				}

				const parsed = parseLocalExecSlashCommand(content)
				let sessionId = String(payload.codexActiveSessionId.value || '').trim()

				const chatBridge = getAgentChatBridge()
				if (!sessionId) {
					setTaskStatus(t('aiworkflow.toast.aiTaskCreating'))
					const session = await chatBridge.createSession('copilot', {
						title: content.slice(0, 24),
						model: payload.chatModelId.value || 'auto',
						projectId,
					})
					sessionId = session.id
					payload.codexActiveSessionId.value = sessionId
					payload.codexSessions.value = [
						{
							id: sessionId,
							title: session.title || t('aiworkflow.toast.copilotSession'),
							status: session.status || 'active',
							modelName: session.model || payload.chatModelId.value || '',
							source: 'copilot-cli'
						},
						...payload.codexSessions.value.filter((s) => s.id !== sessionId)
					]
				}

				pushLocalExecFlow({
					kind: 'session',
					title: t('aiworkflow.toast.sessionReadyTitle'),
					detail: sessionId,
					status: 'completed',
					source: 'copilot-cli'
				})
				setTaskStatus(t('aiworkflow.toast.aiTaskSessionReady'))

				await handleChatStream('copilot', parsed.content, sessionId, assistantMsg.id, {
					history,
					model: payload.chatModelId.value || 'auto',
					skillHints: parsed.skillHints,
					executionHints: parsed.executionHints,
					agentMode: payload.agentConversationMode.value,
					permissionProfile: 'default',
				})
				return
			}

			if (backend === 'codex') {
				const chatBridge = getAgentChatBridge()
				setTaskStatus(t('aiworkflow.toast.aiTaskCreating'))
				const session = await chatBridge.createSession('codex', {
					title: content.slice(0, 24),
					model: payload.chatModelId.value,
					projectId: payload.currentProjectId.value
				})
				await handleChatStream('codex', content, session.id, assistantMsg.id, {
					history,
					model: payload.chatModelId.value,
				})
				return
			}

			payload.pushToast(t('aiworkflow.toast.aiTaskUnknownBackend'), 'warn')
			payload.chatRunState.value = 'error'
		} catch (err: unknown) {
			const errMsgRaw = getErrorMessage(err)
			const aborted = abortController.signal.aborted || /abort/i.test(errMsgRaw)
			if (aborted) {
				setTaskStatus(t('aiworkflow.toast.aiTaskStopped'))
			} else {
				const errMsg = normalizeChatErrorMessage(errMsgRaw)
				payload.chatRunState.value = 'error'
				setTaskStatus(t('aiworkflow.toast.aiTaskError'))
				payload.pushToast(t('aiworkflow.toast.aiChatFailed', { error: errMsg }), 'warn')
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
		setTaskStatus(t('aiworkflow.toast.aiTaskStopping'))
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
		payload.nanoStatus.value = t('aiworkflow.toast.aiTaskNanoPreparing')
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
		payload.nanoStatus.value = t('aiworkflow.toast.aiTaskNanoConcurrency', { done: 0, total: requestCount })
		try {
			const svc = payload.getMediaService()

			const anchorIndexFromId = (id: string) => {
				const m = String(id || '').match(/(\d+)/)
				const n = m ? Number(m[1]) : NaN
				return Number.isFinite(n) ? n : 0
			}

			const getEffectiveImageUrl = (node: WorkflowNode): string | null => {
				// 优先级1: resourceId -> resourcesById (本地资产URL)
				const resourceRid = String(node.resourceId ?? '').trim()
				if (resourceRid) {
					const res = payload.store.state.resourcesById?.[resourceRid] as Record<string, unknown> | undefined
					const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
					if (resUrl) return resUrl
				}
				// 优先级2: imageSettings.lastGeneratedImageUrl (最近生成的图片)
				const imgSettings = typeof node.imageSettings === 'object' && node.imageSettings
					? (node.imageSettings as Record<string, unknown>)
					: {}
				const lastGenUrl = typeof imgSettings?.lastGeneratedImageUrl === 'string'
					? String(imgSettings.lastGeneratedImageUrl).trim()
					: ''
				if (lastGenUrl) return lastGenUrl
				// 优先级3: meshySettings.meshyOutputSummary.preferredUrl (Meshy生成结果)
				const meshySettings = typeof imgSettings?.meshyImageSettings === 'object' && imgSettings.meshyImageSettings
					? (imgSettings.meshyImageSettings as Record<string, unknown>)
					: {}
				const meshySummary = typeof meshySettings?.outputSummary === 'object' && meshySettings.outputSummary
					? (meshySettings.outputSummary as Record<string, unknown>)
					: {}
				const meshyUrl = typeof meshySummary?.preferredUrl === 'string'
					? String(meshySummary.preferredUrl).trim()
					: ''
				if (meshyUrl) return meshyUrl
				// 优先级4: nodeResourceUrl (标准方法，但它可能对远程URL返回null，所以作为fallback)
				const standardUrl = payload.nodeResourceUrl(node)
				if (standardUrl) return standardUrl
				return null
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
						t('aiworkflow.toast.imageRefNodeType', { type: fromNode.type }),
						'warn'
					)
					continue
				}
				let url = getEffectiveImageUrl(fromNode)
				if (!url) {
					payload.pushToast(t('aiworkflow.toast.imageRefNoResource'), 'warn')
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

			// 智能检测：如果当前选中的是图片节点，收集该节点输入锚点连接的参考图
			const selectedNode = payload.getSelectedNode?.()
			if (selectedNode && selectedNode.type === 'image' && refFiles.length < payload.NANO_REF_IMAGE_MAX) {
				const imageInputAnchors = Array.isArray(selectedNode.inputs)
					? (selectedNode.inputs as WorkflowAnchorSpec[])
					: ([] as WorkflowAnchorSpec[])
				
				// 筛选图片输入锚点：in-image, in-resource, in-image-N
				const isImageInputAnchor = (anchorId: string): boolean => {
					const id = String(anchorId || '').trim()
					return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
				}
				
				const imageAnchors = imageInputAnchors.filter(a => isImageInputAnchor(String(a.id ?? '')))
				const sortedImageAnchors = [...imageAnchors].sort(
					(a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id)
				)
				
				for (const anchor of sortedImageAnchors) {
					if (refFiles.length >= payload.NANO_REF_IMAGE_MAX) break
					const edge = payload.getFirstIncomingEdge(
						String(selectedNode.id ?? ''),
						String(anchor.id ?? '')
					)
					if (!edge) continue
					const fromNodeId = getStringField(edge, 'fromNodeId')
					const fromNode = payload.store.state.nodesById[fromNodeId]
					if (!fromNode) continue
					const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
					if (!isImageSource) continue
					
					let url = getEffectiveImageUrl(fromNode)
					if (!url) continue
					const nameBase =
						String(
							payload.nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref'
						).trim() || 'ref'
					// 使用偏移后的索引，避免与聊天框锚点冲突
					const idx = 100 + anchorIndexFromId(anchor.id)

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
				
				// 重新排序
				refFiles.sort((a, b) => a.idx - b.idx)
				refSources.sort((a, b) => a.idx - b.idx)
			}

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
				? t('aiworkflow.toast.jimengImage')
				: isSeedreamModel
					? 'Seedream'
					: isMeshyModel
						? 'Meshy'
						: 'NanoBanana'

			let completedCount = 0
			let failedCount = 0
			const updateProgressStatus = () => {
				payload.nanoStatus.value = t('aiworkflow.toast.aiTaskNanoConcurrency', { done: completedCount, total: requestCount })
				if (completedCount >= requestCount) {
					const successCount = requestCount - failedCount
					payload.nanoStatus.value =
						failedCount > 0 ? t('aiworkflow.toast.aiTaskNanoComplete', { success: successCount, failed: failedCount }) : t('aiworkflow.toast.aiTaskComplete')
				}
			}

			if (isMeshyModel) {
				const hasRefImages = refFiles.length > 0
				const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'
				const meshyAspectRatio = ar || '1:1'
				const meshyNegativePrompt = String(
					hasKey(input.config, 'meshyNegativePrompt') ? input.config.meshyNegativePrompt : ''
				).trim()
				const meshyOutputImageCount = Number(
					hasKey(input.config, 'meshyOutputImageCount') ? input.config.meshyOutputImageCount : 1
				)
				const meshySeed = Number(
					hasKey(input.config, 'meshySeed') ? input.config.meshySeed : -1
				)

				console.log('[Meshy Image - Chat] 原始参数:', {
					inputConfigAspectRatio: input?.config?.aspectRatio,
					inputConfigMeshyAspectRatio: input?.config?.meshyAspectRatio,
					ar,
					meshyAspectRatio,
					selectedMeshyAiModel,
					meshyPoseMode,
					meshyGenerateMultiView,
					meshyNegativePrompt,
					meshyOutputImageCount,
					meshySeed,
					hasRefImages,
					refFileCount: refFiles.length,
					taskType
				})

				const meshyPayload: Record<string, unknown> = {
					mode: taskType,
					prompt: finalPrompt,
					ai_model: selectedMeshyAiModel || 'nano-banana'
				}

				// 根据模式和参数互斥规则传递参数
				// text-to-image 和 image-to-image 都支持：aspect_ratio, generate_multi_view, pose_mode, negative_prompt, output_image_count, seed
				//   注意：generate_multi_view 为 true 时不能设置 aspect_ratio
				if (meshyPoseMode) meshyPayload.pose_mode = meshyPoseMode
				if (meshyGenerateMultiView) {
					meshyPayload.generate_multi_view = true
				} else if (meshyAspectRatio) {
					meshyPayload.aspect_ratio = meshyAspectRatio
					console.log(`[Meshy Image - Chat] ${taskType}: EXPLICITLY setting aspect_ratio=${meshyAspectRatio}, model=${selectedMeshyAiModel}`)
				}

				// 通用参数（两种模式都支持）
				if (meshyNegativePrompt) meshyPayload.negative_prompt = meshyNegativePrompt
				if (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 && meshyOutputImageCount <= 4) {
					meshyPayload.output_image_count = Math.floor(meshyOutputImageCount)
				}
				if (Number.isFinite(meshySeed) && meshySeed >= 0) {
					meshyPayload.seed = Math.floor(meshySeed)
				}

				// 记录完整提交参数
				const submittedParams = {
					model: selectedMeshyAiModel || 'nano-banana',
					mode: taskType,
					aspectRatio: meshyGenerateMultiView ? '1:1 (multi-view)' : meshyAspectRatio,
					poseMode: meshyPoseMode || 'None',
					generateMultiView: meshyGenerateMultiView,
					negativePrompt: meshyNegativePrompt || 'None',
					outputCount: Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 ? Math.floor(meshyOutputImageCount) : 1,
					seed: Number.isFinite(meshySeed) && meshySeed >= 0 ? Math.floor(meshySeed) : 'Random',
					referenceImageCount: hasRefImages ? refFiles.length : 0,
					submittedAt: new Date().toISOString()
				}
				meshyPayload.submittedParams = submittedParams

				console.log('[Meshy Image - Chat] 提交参数:', JSON.stringify(meshyPayload, null, 2))

				// 关键修复：统一使用FormData + meshyGenerateImage路径处理所有情况（文生图/图生图）
				// 确保参数类型转换一致（布尔值、数字、JSON对象都经过正确处理）
				const form = new FormData()
				for (const key of Object.keys(meshyPayload)) {
					const value = meshyPayload[key]
					if (typeof value === 'object' && value !== null) {
						form.set(key, JSON.stringify(value))
					} else if (typeof value === 'boolean') {
						form.set(key, value ? 'true' : 'false')
					} else if (typeof value === 'number') {
						form.set(key, String(value))
					} else {
						form.set(key, String(value))
					}
				}
				for (const r of refFiles) {
					form.append('refImages', r.file, r.file.name)
				}

				appendNanoDetail(t('aiworkflow.runtime.detailMeshyMode', { mode: taskType }))
				appendNanoDetail(t('aiworkflow.runtime.detailAiModel', { model: selectedMeshyAiModel || 'nano-banana' }))
				appendNanoDetail(t('aiworkflow.runtime.detailAspectRatio', { ratio: meshyGenerateMultiView ? t('aiworkflow.runtime.multiViewEnabled') : meshyAspectRatio }))
				if (meshyPoseMode) appendNanoDetail(t('aiworkflow.runtime.detailPoseMode', { mode: meshyPoseMode }))
				if (meshyGenerateMultiView) appendNanoDetail(t('aiworkflow.runtime.multiViewEnabled'))
				appendNanoDetail(t('aiworkflow.runtime.detailOutputCount', { count: String(submittedParams.outputCount) }))
				if (meshyNegativePrompt) appendNanoDetail(t('aiworkflow.runtime.detailNegativePrompt', { prompt: meshyNegativePrompt.slice(0, 80) }))
				if (Number.isFinite(meshySeed) && meshySeed >= 0) appendNanoDetail(t('aiworkflow.runtime.detailSeed', { seed: String(meshySeed) }))
				if (hasRefImages) appendNanoDetail(t('aiworkflow.runtime.detailRefImageCount', { count: String(refFiles.length) }))

				console.log('[Meshy Image - Chat] 发送请求（统一FormData路径），hasRefImages:', hasRefImages, 'refCount:', refFiles.length)
				const res = await svc.meshyGenerateImage(form)
				if (res.ok) {
					const taskId = String(res.taskId || '').trim()
					if (taskId) {
						appendNanoDetail(t('aiworkflow.runtime.meshyTaskCreated', { taskId }))
						payload.nanoStatus.value = t('aiworkflow.runtime.nanoTaskCreated', { taskId })

						const pollStatus = async () => {
							const taskRes = await svc.meshyTask(taskId, taskType)
							if (taskRes.ok) {
								const status = String(taskRes.status || '')
									.trim()
									.toUpperCase()
								const progress = Number(taskRes.progress || 0)
								payload.nanoStatus.value =
									status === 'SUCCEEDED' ? t('aiworkflow.runtime.statusSucceeded') : t('aiworkflow.runtime.statusProgress', { status, progress: String(progress) })

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
									const errorMsg = String(taskRes.errorMessage || t('aiworkflow.runtime.unknownError'))
									payload.pushToast(t('aiworkflow.toast.meshyGenerateFailed', { error: errorMsg }), 'warn')
									appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: errorMsg }))
								} else if (status !== 'CANCELED') {
									setTimeout(pollStatus, 2000)
								}
							}
						}
						pollStatus()
					}
				} else {
					const errMsg = String(res.error || t('aiworkflow.runtime.meshyRequestFailed'))
					payload.pushToast(t('aiworkflow.toast.meshyGenerateFailed', { error: errMsg }), 'warn')
					appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: errMsg }))
				}
				completedCount = 1
				updateProgressStatus()
				return
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
					const warnMsg = t('aiworkflow.runtime.refImageCacheFailedFallback')
					appendNanoDetail(t('aiworkflow.runtime.warningPrefix', { msg: warnMsg }))
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
							appendNanoDetail(t('aiworkflow.runtime.requestError', { no: String(requestNo), error: errMsg }))
							payload.pushToast(t('aiworkflow.toast.imageGenFailed', { no: requestNo, error: errMsg }), 'warn')
							break
						}

						const message = ev.message
						if (!message) continue
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
							appendNanoDetail(t('aiworkflow.runtime.requestError', { no: String(requestNo), error: errMsg }))
							payload.pushToast(t('aiworkflow.toast.imageGenFailed', { no: requestNo, error: errMsg }), 'warn')
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
			payload.nanoStatus.value = t('aiworkflow.runtime.statusFailed')
			appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: errMsg }))
			payload.pushToast(t('aiworkflow.toast.imageGenerationFailed', { error: errMsg }), 'warn')
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
		payload.nanoStatus.value = t('aiworkflow.runtime.statusPreparing')
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
			const svc = payload.getMediaService()
			const selectedModel = String(input?.config?.model ?? 'doubao-seedance-2-0-260128').trim()
			const isJimengVideoModel = selectedModel.startsWith('jimeng-video-')
			const videoEngineLabel = isJimengVideoModel ? t('aiworkflow.toast.engineJimengVideo') : 'Seedance'
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
				const msg = t('aiworkflow.runtime.jimengRecameraNeedsRef')
				payload.nanoStatus.value = t('aiworkflow.runtime.statusParamError')
				appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg }))
				payload.pushToast(msg, 'warn')
				return
			}

			if (isJimengVideoModel && isJimengPro && refFiles.length > 1) {
				const msg = t('aiworkflow.runtime.jimengProOnlyOneFirstFrame')
				payload.nanoStatus.value = t('aiworkflow.runtime.statusParamError')
				appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg }))
				payload.pushToast(msg, 'warn')
				return
			}

			if (isJimengVideoModel) {
				const modeText =
					refMode === 'first'
						? t('aiworkflow.runtime.jimengModeFirst')
						: refMode === 'first-last'
							? t('aiworkflow.runtime.jimengModeFirstLast')
							: refMode === 'recamera'
								? t('aiworkflow.runtime.jimengModeRecamera')
								: refMode === 'reference'
									? t('aiworkflow.runtime.jimengModeReference')
									: t('aiworkflow.runtime.jimengModeAuto')
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
					t('aiworkflow.runtime.jimengRefStrategy', { mode: modeText, input: String(refFiles.length), effective: String(effectiveCount) })
				)
				if (refMode === 'first-last' && refFiles.length > 2) {
					appendNanoDetail(
						t('aiworkflow.runtime.jimengFirstLastTip')
					)
				}
				if (!hasRefs) appendNanoDetail(t('aiworkflow.runtime.jimengTextToVideoMode'))
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
					payload.nanoStatus.value = t('aiworkflow.runtime.statusFailed')
					appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: errMsg }))
					payload.pushToast(t('aiworkflow.toast.videoEngineGenFailed', { engine: videoEngineLabel, error: errMsg }), 'warn')
					break
				}
				const message = ev.message
				if (!message) continue
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
					let extractedTaskId = ''
					const directTaskId = getStringField(msgPayload, 'taskId').trim()
					if (directTaskId) {
						extractedTaskId = directTaskId
					} else {
						const detailsVal = hasKey(msgPayload, 'details') ? (msgPayload as Record<string, unknown>).details : {}
						const detailsRecord = isRecord(detailsVal) ? detailsVal : {}
						const detailsTaskId = getStringField(detailsRecord, 'taskId').trim()
						if (detailsTaskId) {
							extractedTaskId = detailsTaskId
						} else if (text) {
							const cnMatch = text.match(/任务已创建（([^）]+)）/)
							const enMatch = text.match(/Task created \(([^)]+)\)/i)
							extractedTaskId = String(cnMatch?.[1] || enMatch?.[1] || '').trim()
						}
					}
					if (extractedTaskId) {
						payload.nanoStatus.value = t('aiworkflow.runtime.nanoTaskCreated', { taskId: extractedTaskId })
					} else if (text) {
						payload.nanoStatus.value = text
					}
					if (!isJimengVideoModel && extractedTaskId && extractedTaskId !== observedSeedanceTaskId) {
						observedSeedanceTaskId = extractedTaskId
						payload.onSeedanceTaskObserved?.(extractedTaskId, 'created')
					}
					continue
				}
				if (message.type === 'agentToUi/error') {
					const msgPayload = isRecord(message.payload) ? message.payload : {}
					const text = getStringField(msgPayload, 'message') ?? 'unknown'
					payload.nanoStatus.value = t('aiworkflow.runtime.statusFailed')
					appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: text }))
					payload.pushToast(t('aiworkflow.toast.videoEngineGenFailed', { engine: videoEngineLabel, error: text }), 'warn')
					break
				}
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			payload.nanoStatus.value = t('aiworkflow.runtime.statusFailed')
			appendNanoDetail(t('aiworkflow.runtime.errorPrefix', { msg: errMsg }))
			payload.pushToast(t('aiworkflow.toast.videoGenerationFailed', { error: errMsg }), 'warn')
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

	const handleUserChoiceSelect = (messageId: string, choiceIndex: number, choiceText: string) => {
		setMessageUserChoiceSelected(messageId, choiceIndex)
		payload.chatDraft.value = choiceText
		setTimeout(() => {
			onSend()
		}, 100)
	}

	return {
		onSend,
		onStop,
		onNanoBananaGenerate,
		onSeedanceGenerate,
		handleUserChoiceSelect
	}
}
