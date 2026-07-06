import { ComfyUIBridgeService } from './ComfyUIBridgeService'
import type {
	BlueprintChatStreamEvent,
	CodexSessionDto,
	CodexListSessionsResponse,
	CodexCreateSessionResponse,
	CodexListMessagesResponse,
	CodexUpdateSessionResponse,
	CodexApprovalResponse,
	CodexStreamEvent,
	CodexHealthResponse,
	NanoBananaGenerateStreamEvent,
	SeedanceGenerateStreamEvent,
	JimengGenerateStreamEvent,
	NanoBananaCacheRefsResponse
} from './ComfyUIBridgeService'

export type LocalExecDecision = 'accept' | 'decline'
export type LocalExecStreamMode = 'real' | 'mock'

type MeshyTaskResult = {
	ok?: unknown
	taskId?: unknown
	status?: unknown
	progress?: unknown
	preferredImageUrl?: unknown
	imageUrls?: unknown
	error?: unknown
	errorMessage?: unknown
}

export type LocalExecChatService = {
	blueprintChatStream: (
		payload: {
			content: string
			history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
		},
		signal?: AbortSignal
	) => AsyncGenerator<BlueprintChatStreamEvent, void, void>
	localExecHealth: () => Promise<CodexHealthResponse>
	localExecListSessions: (projectId: number | null) => Promise<CodexListSessionsResponse>
	localExecCreateSession: (payload?: {
		title?: string
		cwd?: string
		model?: string
		projectId?: number | null
	}) => Promise<CodexCreateSessionResponse>
	localExecListMessages: (
		sessionId: string,
		projectId: number | null
	) => Promise<CodexListMessagesResponse>
	localExecUpdateSession: (payload: {
		sessionId: string
		projectId: number | null
		title: string
	}) => Promise<CodexUpdateSessionResponse>
	localExecDeleteSession: (payload: {
		sessionId: string
		projectId: number | null
	}) => Promise<{ ok?: boolean; error?: string }>
	localExecSubmitApproval: (payload: {
		sessionId: string
		messageId: string
		decision: LocalExecDecision
		projectId?: number | null
	}) => Promise<CodexApprovalResponse>
	localExecStreamMessage: (
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
	) => AsyncGenerator<CodexStreamEvent, void, void>
	codexHealth: () => Promise<CodexHealthResponse>
	codexListSessions: (projectId: number | null) => Promise<CodexListSessionsResponse>
	codexCreateSession: (payload?: {
		title?: string
		cwd?: string
		model?: string
		projectId?: number | null
	}) => Promise<CodexCreateSessionResponse>
	codexListMessages: (
		sessionId: string,
		projectId: number | null
	) => Promise<CodexListMessagesResponse>
	codexUpdateSession: (payload: {
		sessionId: string
		projectId: number | null
		title: string
	}) => Promise<CodexUpdateSessionResponse>
	codexDeleteSession: (payload: {
		sessionId: string
		projectId: number | null
	}) => Promise<{ ok?: boolean; error?: string }>
	codexSubmitApproval: (payload: {
		sessionId: string
		messageId: string
		decision: LocalExecDecision
		projectId?: number | null
	}) => Promise<CodexApprovalResponse>
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
	) => AsyncGenerator<CodexStreamEvent, void, void>
	nanoBananaCacheRefImages: (form: FormData) => Promise<NanoBananaCacheRefsResponse>
	seedreamCacheRefImages: (form: FormData) => Promise<NanoBananaCacheRefsResponse>
	nanoBananaGenerateStream: (
		form: FormData
	) => AsyncGenerator<NanoBananaGenerateStreamEvent, void, void>
	seedreamGenerateStream: (
		form: FormData
	) => AsyncGenerator<NanoBananaGenerateStreamEvent, void, void>
	geminiImageGenerateStream: (
		payload: Record<string, unknown>
	) => AsyncGenerator<NanoBananaGenerateStreamEvent, void, void>
	jimengImageGenerateStream: (
		form: FormData
	) => AsyncGenerator<JimengGenerateStreamEvent, void, void>
	jimengVideoGenerateStream: (
		form: FormData
	) => AsyncGenerator<JimengGenerateStreamEvent, void, void>
	seedanceGenerateStream: (
		form: FormData
	) => AsyncGenerator<SeedanceGenerateStreamEvent, void, void>
	meshyGenerate: (payload: Record<string, unknown>) => Promise<MeshyTaskResult>
	meshyGenerateImage: (form: FormData) => Promise<MeshyTaskResult>
	meshyTask: (taskId: string, mode: string) => Promise<MeshyTaskResult>
	setLocalExecStreamMode: (mode: LocalExecStreamMode) => void
	getLocalExecStreamMode: () => LocalExecStreamMode
}

export const createLocalExecChatService = (bridge: ComfyUIBridgeService): LocalExecChatService => {
	let localExecStreamMode: LocalExecStreamMode = 'real'

	const setLocalExecStreamMode = (mode: LocalExecStreamMode) => {
		localExecStreamMode = mode === 'mock' ? 'mock' : 'real'
	}

	const getLocalExecStreamMode = () => localExecStreamMode

	const localExecHealth = () => bridge.codexHealth()
	const localExecListSessions = (projectId: number | null) => bridge.codexListSessions(projectId)
	const localExecCreateSession = (payload?: {
		title?: string
		cwd?: string
		model?: string
		projectId?: number | null
	}) => bridge.codexCreateSession(payload)
	const localExecListMessages = (sessionId: string, projectId: number | null) =>
		bridge.codexListMessages(sessionId, projectId)
	const localExecUpdateSession = (payload: {
		sessionId: string
		projectId: number | null
		title: string
	}) => bridge.codexUpdateSession(payload)
	const localExecDeleteSession = (payload: { sessionId: string; projectId: number | null }) =>
		bridge.codexDeleteSession(payload)
	const localExecSubmitApproval = (payload: {
		sessionId: string
		messageId: string
		decision: LocalExecDecision
		projectId?: number | null
	}) => bridge.codexSubmitApproval(payload)
	const localExecStreamMessage = (
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
	) => bridge.codexStreamMessage(sessionId, payload, signal, localExecStreamMode === 'mock')

	return {
		blueprintChatStream: (payload, signal) => bridge.blueprintChatStream(payload, signal),
		localExecHealth,
		localExecListSessions,
		localExecCreateSession,
		localExecListMessages,
		localExecUpdateSession,
		localExecDeleteSession,
		localExecSubmitApproval,
		localExecStreamMessage,
		codexHealth: localExecHealth,
		codexListSessions: localExecListSessions,
		codexCreateSession: localExecCreateSession,
		codexListMessages: localExecListMessages,
		codexUpdateSession: localExecUpdateSession,
		codexDeleteSession: localExecDeleteSession,
		codexSubmitApproval: localExecSubmitApproval,
		codexStreamMessage: localExecStreamMessage,
		nanoBananaCacheRefImages: (form) => bridge.nanoBananaCacheRefImages(form),
		seedreamCacheRefImages: (form) => bridge.seedreamCacheRefImages(form),
		nanoBananaGenerateStream: (form) => bridge.nanoBananaGenerateStream(form),
		seedreamGenerateStream: (form) => bridge.seedreamGenerateStream(form),
		geminiImageGenerateStream: (payload) => bridge.geminiImageGenerateStream(payload),
		jimengImageGenerateStream: (form) => bridge.jimengImageGenerateStream(form),
		jimengVideoGenerateStream: (form) => bridge.jimengVideoGenerateStream(form),
		seedanceGenerateStream: (form) => bridge.seedanceGenerateStream(form),
		meshyGenerate: (payload) => bridge.meshyGenerate(payload),
		meshyGenerateImage: (form) => bridge.meshyGenerateImage(form),
		meshyTask: (taskId, mode) => bridge.meshyTask(taskId, mode),
		setLocalExecStreamMode,
		getLocalExecStreamMode
	}
}
