import type {
	AgentToUiChatMessage,
	AgentToUiApplyFilterMessage,
	AgentToUiDeleteNodeMessage,
	AgentToUiInsertNodeMessage,
	AgentToUiPatchNodeMessage,
	AgentToUiComponentTemplateMessage,
	AgentToUiErrorMessage,
	AgentToUiMessage,
	AgentToUiSubtitleSummaryDeltaMessage,
	AgentToUiTaskStatusMessage,
	AgentToUiTextMessage,
	AgentToUiVideoScenePlanMessage
} from './types'
import { isRecord, isString, isArray } from '../../types/utils'

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
		case 'agentToUi/videoScenePlan':
			return isAgentToUiVideoScenePlanMessage(v)
		case 'agentToUi/error':
			return isAgentToUiErrorMessage(v)
		case 'agentToUi/componentTemplate':
			return isAgentToUiComponentTemplateMessage(v)
		case 'agentToUi/taskStatus':
			return isAgentToUiTaskStatusMessage(v)
		case 'agentToUi/subtitleSummaryDelta':
			return isAgentToUiSubtitleSummaryDeltaMessage(v)
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

export function isAgentToUiSubtitleSummaryDeltaMessage(
	v: unknown
): v is AgentToUiSubtitleSummaryDeltaMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/subtitleSummaryDelta') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (!('section' in payload)) return false
	if (!isString(payload.section) || !payload.section.trim()) return false
	if (!('data' in payload)) return false
	return true
}

export function isAgentToUiPatchNodeMessage(v: unknown): v is AgentToUiPatchNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/patchNode') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (!('nodeId' in payload)) return false
	if (!isString(payload.nodeId) || !payload.nodeId.trim()) return false
	if (!('patch' in payload)) return false
	if (!isRecord(payload.patch)) return false

	if ('layerId' in payload) {
		if (!isString(payload.layerId) || !payload.layerId.trim()) return false
	}

	const patch = payload.patch
	if ('name' in patch && patch.name !== undefined && !isString(patch.name)) return false
	if ('userType' in patch && patch.userType !== undefined && !isString(patch.userType)) return false
	if ('transform' in patch && patch.transform !== undefined && !isRecord(patch.transform))
		return false
	if ('props' in patch && patch.props !== undefined && !isRecord(patch.props)) return false

	return true
}

export function isAgentToUiDeleteNodeMessage(v: unknown): v is AgentToUiDeleteNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/deleteNode') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v

	if ('layerId' in payload) {
		if (!isString(payload.layerId) || !payload.layerId.trim()) return false
	}

	const hasNodeId = 'nodeId' in payload && payload.nodeId !== null
	const hasNodeIds = 'nodeIds' in payload && payload.nodeIds !== null
	if (!hasNodeId && !hasNodeIds) return false
	if (hasNodeId && (!isString(payload.nodeId) || !payload.nodeId.trim())) return false
	if (hasNodeIds) {
		if (!isArray(payload.nodeIds, isString) || payload.nodeIds.length === 0) return false
		for (const s of payload.nodeIds) {
			if (!s.trim()) return false
		}
	}
	return true
}

export function isAgentToUiInsertNodeMessage(v: unknown): v is AgentToUiInsertNodeMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/insertNode') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (!('node' in payload)) return false

	if ('layerId' in payload) {
		if (!isString(payload.layerId) || !payload.layerId.trim()) return false
	}

	if ('parentId' in payload && payload.parentId !== null) {
		if (!isString(payload.parentId) || !payload.parentId.trim()) return false
	}

	return true
}

export function isAgentToUiApplyFilterMessage(v: unknown): v is AgentToUiApplyFilterMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/applyFilter') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (payload.target !== 'selection' && payload.target !== 'nodeId') return false
	if (payload.target === 'nodeId') {
		if (!isString(payload.nodeId) || !payload.nodeId.trim()) return false
	}
	if (payload.mode !== undefined && payload.mode !== 'append' && payload.mode !== 'replace')
		return false
	if (!isRecord(payload.filter)) return false
	if (!isString(payload.filter.type) || !payload.filter.type.trim()) return false
	return true
}

export function isAgentToUiTaskStatusMessage(v: unknown): v is AgentToUiTaskStatusMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/taskStatus') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (!isString(payload.phase)) return false
	const phase = payload.phase
	if (
		phase !== 'started' &&
		phase !== 'prepare_input' &&
		phase !== 'connect' &&
		phase !== 'submit' &&
		phase !== 'streaming' &&
		phase !== 'writing' &&
		phase !== 'parse' &&
		phase !== 'rewrite' &&
		phase !== 'template' &&
		phase !== 'done' &&
		phase !== 'canceled' &&
		phase !== 'error'
	)
		return false
	if (payload.message !== undefined && !isString(payload.message)) return false
	if ('details' in payload && payload.details !== undefined && !isRecord(payload.details))
		return false
	return true
}

export function isAgentToUiChatMessage(v: unknown): v is AgentToUiChatMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/chatMessage') return false
	if (!isRecord(v.payload)) return false
	return isString(v.payload.content)
}

export function isAgentToUiVideoScenePlanMessage(v: unknown): v is AgentToUiVideoScenePlanMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/videoScenePlan') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v
	if (!('plan' in payload)) return false
	if ('summary' in payload && payload.summary !== undefined && !isString(payload.summary))
		return false
	if (
		'intent' in payload &&
		payload.intent !== undefined &&
		payload.intent !== 'preview' &&
		payload.intent !== 'insert'
	)
		return false
	return true
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

export function isAgentToUiComponentTemplateMessage(
	v: unknown
): v is AgentToUiComponentTemplateMessage {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (v.type !== 'agentToUi/componentTemplate') return false
	if (!isRecord(v.payload)) return false
	const { payload } = v

	if (!('template' in payload)) return false

	if (
		payload.intent !== undefined &&
		payload.intent !== 'preview' &&
		payload.intent !== 'insert' &&
		payload.intent !== 'template'
	)
		return false

	if (payload.params !== undefined && !isRecord(payload.params)) return false

	if ('layerId' in payload) {
		if (!isString(payload.layerId) || !payload.layerId.trim()) return false
	}

	if ('parentId' in payload && payload.parentId !== null) {
		if (!isString(payload.parentId) || !payload.parentId.trim()) return false
	}

	return true
}
