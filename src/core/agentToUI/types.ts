export type AgentToUiSchemaVersion = 1

export type AgentToUiEnvelope<TType extends string, TPayload> = {
	schemaVersion: AgentToUiSchemaVersion
	type: TType
	id: string
	createdAt: string // ISO8601
	source?: {
		agentName?: string
		agentVersion?: string
		model?: string
	}
	payload: TPayload
	meta?: Record<string, unknown>
}

export type AgentToUiTextPayload = {
	text: string
}

export type AgentToUiErrorPayload = {
	code: string
	message: string
	details?: Record<string, unknown>
}

export type AgentToUiComponentTemplatePayload = {
	/**
	 * ComponentTemplate JSON。
	 * 结构规范见 aidoc/04-advanced-components-spec.md
	 */
	template: unknown
	intent?: 'preview' | 'insert'
	params?: Record<string, unknown>
}

export type AgentToUiTextMessage = AgentToUiEnvelope<'agentToUi/text', AgentToUiTextPayload>
export type AgentToUiErrorMessage = AgentToUiEnvelope<'agentToUi/error', AgentToUiErrorPayload>
export type AgentToUiComponentTemplateMessage = AgentToUiEnvelope<
	'agentToUi/componentTemplate',
	AgentToUiComponentTemplatePayload
>

export type AgentToUiMessage = AgentToUiTextMessage | AgentToUiErrorMessage | AgentToUiComponentTemplateMessage
