import type {
	AgentToUiChatMessage,
	AgentToUiApplyFilterMessage,
	AgentToUiDeleteNodeMessage,
	AgentToUiInsertNodeMessage,
	AgentToUiPatchNodeMessage,
	AgentToUiComponentTemplateMessage,
	AgentToUiErrorMessage,
	AgentToUiMessage,
	AgentToUiTaskStatusMessage,
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
		case 'agentToUi/chatMessage':
			return isAgentToUiChatMessage(v)
		case 'agentToUi/error':
			return isAgentToUiErrorMessage(v)
		case 'agentToUi/componentTemplate':
			return isAgentToUiComponentTemplateMessage(v)
		case 'agentToUi/taskStatus':
			return isAgentToUiTaskStatusMessage(v)
		case 'agentToUi/applyFilter':
			return isAgentToUiApplyFilterMessage(v)
			case 'agentToUi/insertNode':
				return isAgentToUiInsertNodeMessage(v)
			case 'agentToUi/patchNode':
				return isAgentToUiPatchNodeMessage(v)
			case 'agentToUi/deleteNode':
				return isAgentToUiDeleteNodeMessage(v)
		default:
			return false
	}
}

export function isAgentToUiPatchNodeMessage(v: unknown): v is AgentToUiPatchNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/patchNode') return false
	if (!isRecord(v.payload)) return false
	if (!isString((v.payload as any).nodeId) || !(v.payload as any).nodeId.trim()) return false
	if (!isRecord((v.payload as any).patch)) return false

	const layerId = (v.payload as any).layerId
	if (layerId !== undefined && (!isString(layerId) || !layerId.trim())) return false

	const patch = (v.payload as any).patch
	if (patch.name !== undefined && !isString(patch.name)) return false
	if (patch.userType !== undefined && !isString(patch.userType)) return false
	if (patch.transform !== undefined && !isRecord(patch.transform)) return false
	if (patch.props !== undefined && !isRecord(patch.props)) return false

	return true
}

export function isAgentToUiDeleteNodeMessage(v: unknown): v is AgentToUiDeleteNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/deleteNode') return false
	if (!isRecord(v.payload)) return false

	const layerId = (v.payload as any).layerId
	if (layerId !== undefined && (!isString(layerId) || !layerId.trim())) return false

	const nodeId = (v.payload as any).nodeId
	const nodeIds = (v.payload as any).nodeIds
	const hasNodeId = nodeId !== undefined && nodeId !== null
	const hasNodeIds = nodeIds !== undefined && nodeIds !== null
	if (!hasNodeId && !hasNodeIds) return false
	if (hasNodeId && (!isString(nodeId) || !nodeId.trim())) return false
	if (hasNodeIds) {
		if (!Array.isArray(nodeIds) || nodeIds.length === 0) return false
		for (const s of nodeIds) {
			if (!isString(s) || !s.trim()) return false
		}
	}
	return true
}

export function isAgentToUiInsertNodeMessage(v: unknown): v is AgentToUiInsertNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/insertNode') return false
	if (!isRecord(v.payload)) return false
	if (!('node' in v.payload)) return false

	const layerId = (v.payload as any).layerId
	if (layerId !== undefined && (!isString(layerId) || !layerId.trim())) return false

	const parentId = (v.payload as any).parentId
	if (parentId !== undefined && parentId !== null && (!isString(parentId) || !parentId.trim())) return false

	return true
}

export function isAgentToUiApplyFilterMessage(v: unknown): v is AgentToUiApplyFilterMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/applyFilter') return false
	if (!isRecord(v.payload)) return false
	const target = v.payload.target
	if (target !== 'selection' && target !== 'nodeId') return false
	if (target === 'nodeId') {
		if (!isString(v.payload.nodeId) || !v.payload.nodeId.trim()) return false
	}
	const mode = v.payload.mode
	if (mode !== undefined && mode !== 'append' && mode !== 'replace') return false
	if (!isRecord(v.payload.filter)) return false
	if (!isString((v.payload.filter as any).type) || !(v.payload.filter as any).type.trim()) return false
	return true
}

export function isAgentToUiTaskStatusMessage(v: unknown): v is AgentToUiTaskStatusMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/taskStatus') return false
	if (!isRecord(v.payload)) return false
	if (!isString(v.payload.phase)) return false
	const phase = v.payload.phase
	if (
		phase !== 'started' &&
		phase !== 'streaming' &&
		phase !== 'writing' &&
		phase !== 'template' &&
		phase !== 'done' &&
		phase !== 'canceled' &&
		phase !== 'error'
	)
		return false
	const msg = v.payload.message
	if (msg !== undefined && !isString(msg)) return false
	return true
}

export function isAgentToUiChatMessage(v: unknown): v is AgentToUiChatMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/chatMessage') return false
	if (!isRecord(v.payload)) return false
	return isString(v.payload.content)
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

	const layerId = (v.payload as any).layerId
	if (layerId !== undefined && (!isString(layerId) || !layerId.trim())) return false

	const parentId = (v.payload as any).parentId
	if (parentId !== undefined && parentId !== null && (!isString(parentId) || !parentId.trim())) return false

	return true
}
