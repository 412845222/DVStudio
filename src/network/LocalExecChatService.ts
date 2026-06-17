import { ComfyUIBridgeService } from './ComfyUIBridgeService'

export type LocalExecDecision = 'accept' | 'decline'
export type LocalExecStreamMode = 'real' | 'mock'

export type LocalExecChatService = {
	blueprintChatStream: (payload: {
		content: string
		history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
	}, signal?: AbortSignal) => AsyncIterable<any>
	localExecHealth: () => Promise<any>
	localExecListSessions: (projectId: number | null) => Promise<any>
	localExecCreateSession: (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => Promise<any>
	localExecListMessages: (sessionId: string, projectId: number | null) => Promise<any>
	localExecUpdateSession: (payload: { sessionId: string; projectId: number | null; title: string }) => Promise<any>
	localExecDeleteSession: (payload: { sessionId: string; projectId: number | null }) => Promise<any>
	localExecSubmitApproval: (payload: { sessionId: string; messageId: string; decision: LocalExecDecision; projectId?: number | null }) => Promise<any>
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
	) => AsyncIterable<any>
	codexHealth: () => Promise<any>
	codexListSessions: (projectId: number | null) => Promise<any>
	codexCreateSession: (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => Promise<any>
	codexListMessages: (sessionId: string, projectId: number | null) => Promise<any>
	codexUpdateSession: (payload: { sessionId: string; projectId: number | null; title: string }) => Promise<any>
	codexDeleteSession: (payload: { sessionId: string; projectId: number | null }) => Promise<any>
	codexSubmitApproval: (payload: { sessionId: string; messageId: string; decision: LocalExecDecision; projectId?: number | null }) => Promise<any>
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
	) => AsyncIterable<any>
	nanoBananaCacheRefImages: (form: FormData) => Promise<any>
	seedreamCacheRefImages: (form: FormData) => Promise<any>
	nanoBananaGenerateStream: (form: FormData) => AsyncIterable<any>
	seedreamGenerateStream: (form: FormData) => AsyncIterable<any>
	jimengImageGenerateStream: (form: FormData) => AsyncIterable<any>
	jimengVideoGenerateStream: (form: FormData) => AsyncIterable<any>
	seedanceGenerateStream: (form: FormData) => AsyncIterable<any>
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
	const localExecCreateSession = (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => bridge.codexCreateSession(payload)
	const localExecListMessages = (sessionId: string, projectId: number | null) => bridge.codexListMessages(sessionId, projectId)
	const localExecUpdateSession = (payload: { sessionId: string; projectId: number | null; title: string }) => bridge.codexUpdateSession(payload)
	const localExecDeleteSession = (payload: { sessionId: string; projectId: number | null }) => bridge.codexDeleteSession(payload)
	const localExecSubmitApproval = (payload: { sessionId: string; messageId: string; decision: LocalExecDecision; projectId?: number | null }) => bridge.codexSubmitApproval(payload)
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
		jimengImageGenerateStream: (form) => bridge.jimengImageGenerateStream(form),
		jimengVideoGenerateStream: (form) => bridge.jimengVideoGenerateStream(form),
		seedanceGenerateStream: (form) => bridge.seedanceGenerateStream(form),
		setLocalExecStreamMode,
		getLocalExecStreamMode,
	}
}
