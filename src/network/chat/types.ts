export type AgentBackendType = 'dvsagent' | 'copilot' | 'codex'

export interface ChatSession {
	id: string
	title: string
	backend: AgentBackendType
	model?: string
	status: 'active' | 'stopped' | 'error'
	createdAt?: string
	lastMessageAt?: string
	projectId?: number | null
	source?: string
	metadata?: Record<string, unknown>
}

export type ChatStreamEvent =
	| { type: 'text_delta'; content: string }
	| { type: 'thinking_delta'; content: string }
	| { type: 'thought'; content: string }
	| { type: 'tool_call_start'; toolCallId: string; tool: string; input?: unknown }
	| {
			type: 'tool_call_end'
			toolCallId: string
			tool: string
			output?: unknown
			images?: Array<{ mimeType: string; dataUrl: string; fileName?: string }>
	  }
	| { type: 'tool_call_error'; toolCallId: string; tool: string; error: string }
	| { type: 'plan_update'; explanation: string }
	| { type: 'skill_call'; name: string; status: string; description?: string }
	| { type: 'runtime_context'; skills: unknown[]; mcpServers: unknown[] }
	| { type: 'command_started'; command: string[] | string; messageId?: string }
	| { type: 'command_completed'; status: string; messageId?: string }
	| { type: 'file_change_started'; changes: unknown[]; messageId?: string }
	| { type: 'file_change_completed'; changes: unknown[]; messageId?: string }
	| { type: 'approval_requested'; requestId: string; messageId: string }
	| { type: 'assistant_done'; content: string }
	| { type: 'turn_done' }
	| {
			type: 'context_usage'
			tokenCount: number
			budget: number
			usage: number
			truncated?: boolean
	  }
	| { type: 'error'; message: string; details?: unknown }
	| { type: 'done' }

export interface CreateSessionOptions {
	title?: string
	model?: string
	cwd?: string
	projectId?: number | null
}

export interface ChatAttachment {
	type?: string
	name?: string
	url?: string
	data?: string
	mimeType?: string
}

export interface ChatReference {
	path?: string
	kind?: string
	name?: string
	content?: string
	nodeId?: string
	anchorId?: string
	previewUrl?: string
}

export interface ReferencedOutput {
	kind: string
	nodeId: string
	anchorId: string
	label: string
	text?: string
	previewUrl?: string
	meta?: Record<string, unknown>
	nodeType: string
}

export interface ActiveSkill {
	id: string
	name: string
	description: string
	prompt: string
}

export interface SendMessageOptions {
	content: string
	model?: string
	references?: ChatReference[]
	attachments?: ChatAttachment[]
	skillHints?: string[]
	executionHints?: string[]
	agentMode?: 'agent' | 'ask' | 'plan'
	permissionProfile?: string
	thinkingEffort?: 'disabled' | 'low' | 'medium' | 'high'
	maxToolCalls?: number
	enableToolCallWarning?: boolean
	history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
	context?: unknown
	apiKeys?: Record<string, string>
	apiSource?: string
	systemPrompt?: string
	tools?: string[]
	referencedNodeIds?: string[]
	referencedOutputs?: ReferencedOutput[]
	activeSkills?: ActiveSkill[]
	agentType?: 'workflow' | 'blender' | 'video_editor' | 'node_chat' | 'general'
}

export interface ChatModelInfo {
	id: string
	name: string
	vendor?: string
	contextWindow?: number
	capabilities?: string[]
	recommended?: boolean
}

export interface IChatService {
	readonly backend: AgentBackendType
	isAvailable(): Promise<boolean>
	createSession(options?: CreateSessionOptions): Promise<ChatSession>
	listSessions(projectId?: number | null): Promise<ChatSession[]>
	getSession(sessionId: string): Promise<ChatSession | null>
	deleteSession(sessionId: string, projectId?: number | null): Promise<{ ok: boolean }>
	sendMessage(
		sessionId: string,
		options: SendMessageOptions,
		signal?: AbortSignal
	): AsyncGenerator<ChatStreamEvent, void, void>
	listModels(forceRefresh?: boolean): Promise<{ models: ChatModelInfo[] }>
	abort(sessionId?: string): Promise<void>
}
