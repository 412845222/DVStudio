import type {
	AgentToUiComponentTemplateMessage,
	AgentToUiErrorMessage,
	AgentToUiMessage,
	AgentToUiTextMessage,
} from './types'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

export function isAgentToUiMessage(v: unknown): v is AgentToUiMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (!isString(v.type)) return false
	if (!isString(v.id)) return false
	if (!isString(v.createdAt)) return false
	if (!('payload' in v)) return false

	switch (v.type) {
		case 'agentToUi/text':
			return isAgentToUiTextMessage(v)
		case 'agentToUi/error':
			return isAgentToUiErrorMessage(v)
		case 'agentToUi/componentTemplate':
			return isAgentToUiComponentTemplateMessage(v)
		default:
			return false
	}
}

export function isAgentToUiTextMessage(v: unknown): v is AgentToUiTextMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/text') return false
	if (!isRecord(v.payload)) return false
	return isString(v.payload.text)
}

export function isAgentToUiErrorMessage(v: unknown): v is AgentToUiErrorMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/error') return false
	if (!isRecord(v.payload)) return false
	return isString(v.payload.code) && isString(v.payload.message)
}

export function isAgentToUiComponentTemplateMessage(v: unknown): v is AgentToUiComponentTemplateMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/componentTemplate') return false
	if (!isRecord(v.payload)) return false

	// template is validated by core/components in later milestone; here only require presence.
	if (!('template' in v.payload)) return false

	const intent = v.payload.intent
	if (intent !== undefined && intent !== 'preview' && intent !== 'insert') return false

	const params = v.payload.params
	if (params !== undefined && !isRecord(params)) return false

	return true
}
