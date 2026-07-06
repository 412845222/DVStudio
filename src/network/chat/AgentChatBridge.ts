import type {
	AgentBackendType,
	IChatService,
	ChatSession,
	ChatStreamEvent,
	CreateSessionOptions,
	SendMessageOptions,
	ChatModelInfo
} from './types'
import { DVSAgentChatService } from './DVSAgentChatService'
import { CopilotChatService } from './CopilotChatService'
import { CodexChatService } from './CodexChatService'

export class AgentChatBridge {
	private services: Map<AgentBackendType, IChatService>

	constructor() {
		this.services = new Map()
		this.services.set('dvsagent', new DVSAgentChatService())
		this.services.set('copilot', new CopilotChatService())
		this.services.set('codex', new CodexChatService())
	}

	getService(backend: AgentBackendType): IChatService {
		const svc = this.services.get(backend)
		if (!svc) throw new Error(`Unknown chat backend: ${backend}`)
		return svc
	}

	async isAvailable(backend: AgentBackendType): Promise<boolean> {
		return this.getService(backend).isAvailable()
	}

	async createSession(
		backend: AgentBackendType,
		options?: CreateSessionOptions
	): Promise<ChatSession> {
		return this.getService(backend).createSession(options)
	}

	async listSessions(
		backend: AgentBackendType,
		projectId?: number | null
	): Promise<ChatSession[]> {
		return this.getService(backend).listSessions(projectId)
	}

	async getSession(
		backend: AgentBackendType,
		sessionId: string
	): Promise<ChatSession | null> {
		return this.getService(backend).getSession(sessionId)
	}

	async deleteSession(
		backend: AgentBackendType,
		sessionId: string,
		projectId?: number | null
	): Promise<{ ok: boolean }> {
		return this.getService(backend).deleteSession(sessionId, projectId)
	}

	async *sendMessage(
		backend: AgentBackendType,
		sessionId: string,
		options: SendMessageOptions,
		signal?: AbortSignal
	): AsyncGenerator<ChatStreamEvent, void, void> {
		yield* this.getService(backend).sendMessage(sessionId, options, signal)
	}

	async listModels(
		backend: AgentBackendType,
		forceRefresh?: boolean
	): Promise<{ models: ChatModelInfo[] }> {
		return this.getService(backend).listModels(forceRefresh)
	}

	async abort(backend: AgentBackendType, sessionId?: string): Promise<void> {
		return this.getService(backend).abort(sessionId)
	}
}

let _instance: AgentChatBridge | null = null

export function getAgentChatBridge(): AgentChatBridge {
	if (!_instance) {
		_instance = new AgentChatBridge()
	}
	return _instance
}
