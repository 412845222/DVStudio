import type { Store } from 'vuex'
import type { WorkflowState, WorkflowNode, WorkflowBlenderNodeSettings, WorkflowBlenderChatMessage } from '../aiworkflow/types'
import { AIWorkflowStore } from '../store/aiworkflow/store'
import { cloneJsonSafe } from '../core/shared/cloneJsonSafe'

const TRANSIENT_STATE_KEYS = new Set([
	'viewport',
	'selectedNodeId',
	'selectedNodeIds',
	'selectedEdgeId',
	'clipboardNode',
	'clipboardNodes',
	'clipboardPrimaryNodeId',
	'chatDraft',
	'nodeChatDialog',
	'nodeGenerationTasksById',
	'nodeGenerationTaskIdsByNodeId',
	'selectionTagsByKey',
	'nodeCheckboxVisible',
])

const TRANSIENT_NODE_KEYS = new Set([
	'isResponding',
	'isSubmitting',
	'nodeChatDraft',
])

const TRANSIENT_MUTATIONS = new Set([
	'setViewport',
	'resetViewport',
	'setSelectedNode',
	'setSelectedNodes',
	'setSelectedEdge',
	'clearSelection',
	'toggleNodeSelection',
	'setChatDraft',
	'setNodeChatDraft',
	'setNodeChatSubmitting',
	'setBlenderResponding',
	'setBlenderMcpStatus',
	'setBlenderChatContextUsage',
	'setBlenderLastOutputs',
	'setBlenderImportStatus',
	'appendBlenderChatMessage',
	'updateBlenderChatMessage',
	'clearBlenderChatMessages',
	'compressBlenderChatContext',
	'toggleBlenderChatMessageCollapsed',
	'registerNodeGenerationTask',
	'appendNodeGenerationDetail',
	'setNodeCheckboxVisible',
	'openNodeChatDialog',
	'closeNodeChatDialog',
	'removeSelectionTag',
])

const sanitizeBlenderChatMessage = (msg: WorkflowBlenderChatMessage): WorkflowBlenderChatMessage => {
	return {
		id: msg.id,
		role: msg.role,
		content: msg.content,
		timestamp: msg.timestamp,
		toolName: msg.toolName,
		toolCallId: msg.toolCallId,
		status: msg.status === 'running' ? 'completed' : msg.status,
		collapsed: true,
		thinkingCollapsed: true,
		command: msg.command,
	}
}

const sanitizeBlenderSettings = (settings: WorkflowBlenderNodeSettings | undefined): WorkflowBlenderNodeSettings | undefined => {
	if (!settings) return settings
	const out = { ...settings }
	out.isResponding = false
	out.isSubmitting = false
	out.importStatus =
		out.importStatus === 'downloading' || out.importStatus === 'importing' ? 'idle' : out.importStatus
	out.importProgress = 0
	out.lastOutputs = undefined
	if (out.chatMessages && out.chatMessages.length > 0) {
		out.chatMessages = out.chatMessages.map(sanitizeBlenderChatMessage)
	}
	return out
}

const sanitizeGenericSettings = <T extends Record<string, unknown>>(settings: T | undefined, transientKeys: Set<string>): T | undefined => {
	if (!settings) return settings
	const out = { ...settings }
	for (const key of Object.keys(out)) {
		if (transientKeys.has(key)) {
			delete out[key]
		}
	}
	return out
}

const IMAGE_SETTINGS_TRANSIENT = new Set([
	'lastGeneratedImageUrl',
	'meshyImageSettings',
	'geminiImageSettings',
	'tripo3dImageSettings',
])

const MESHY_SETTINGS_TRANSIENT = new Set([
	'taskStatus',
	'progress',
	'statusText',
	'errorMessage',
	'downloadStage',
	'downloadProgress',
	'downloadLoadedBytes',
	'downloadTotalBytes',
	'downloadSpeedBytesPerSec',
	'downloadError',
	'meshyThumbnailUrl',
	'meshyModelUrls',
	'meshyOutputAssetUrl',
	'meshyOutputAssetPath',
	'meshyInputSummary',
	'meshyOutputSummary',
	'meshyRelationSummary',
])

const TRIPO3D_SETTINGS_TRANSIENT = new Set([
	'tripo3dTaskStatus',
	'tripo3dProgress',
	'tripo3dStatusText',
	'tripo3dErrorMessage',
	'tripo3dThumbnailUrl',
	'tripo3dOutputAssetUrl',
	'tripo3dOutputAssetPath',
	'tripo3dOutputSummary',
	'tripo3dInputSummary',
	'tripo3dModelUrl',
	'tripo3dRequestPayload',
	'tripo3dResponsePayload',
	'tripo3dDownloadStage',
	'tripo3dDownloadProgress',
	'tripo3dDownloadLoadedBytes',
	'tripo3dDownloadTotalBytes',
	'tripo3dDownloadSpeedBytesPerSec',
	'tripo3dDownloadError',
	'tripo3dRelationSummary',
	'tripo3dImageUrls',
	'tripo3dUpstreamTaskId',
	'tripo3dUpstreamTaskFamily',
	'tripo3dUpstreamTaskStatus',
])

const COMFYUI_SETTINGS_TRANSIENT = new Set([
	'status',
	'message',
	'lastCheckedAt',
	'runStatus',
	'promptId',
	'progress',
	'statusText',
	'outputs',
	'lastUpdateAt',
])

const SCENEUNDERSTANDING_SETTINGS_TRANSIENT = new Set([
	'status',
	'message',
	'statusText',
	'progress',
	'outputJson',
	'rawOutput',
	'resultSummary',
	'reasoningText',
	'lastRunAt',
	'lastInputImageUrl',
	'lastInputImageUrls',
])

const SCENELAYOUT_SETTINGS_TRANSIENT = new Set([
	'status',
	'message',
	'lastRunAt',
	'selectedLayoutItemId',
	'selectedPlaceholderOutput',
	'layoutItems',
])

const SCENEDECOMPOSE_SETTINGS_TRANSIENT = new Set([
	'status',
	'message',
	'progress',
	'currentStep',
	'totalTasks',
	'completedTasks',
	'croppedCount',
	'fallbackCount',
	'inputJson',
	'lastRunAt',
	'outputs',
	'lastExpandedAt',
	'lastExpandedCount',
])

const UNREALEXPORT_SETTINGS_TRANSIENT = new Set([
	'connectionStatus',
	'statusText',
	'message',
	'lastHeartbeatAt',
	'lastExportMode',
	'lastExportJobId',
	'lastExportStatus',
	'lastExportStage',
	'lastExportProgress',
	'lastExportMessage',
	'lastBlueprintAssetPath',
	'lastModelsAssetPath',
	'lastActorBaseClass',
	'lastSpawnedLightCount',
	'lastLightingTargetActor',
	'lastSlotCount',
	'lastAppliedSlotCount',
	'lastMaterialOverrideCount',
	'lastExportAt',
	'autoPoll',
	'editorStatus',
	'editorCheckedAt',
	'editorProcess',
	'editorProcesses',
	'pluginStatus',
	'pluginCheckedAt',
	'pluginVersion',
	'pluginInstallError',
	'pluginInstallConfig',
	'assetPathValidation',
	'assetPathValidationError',
	'connectedSession',
])

const MODEL3D_SETTINGS_TRANSIENT = new Set([
	'backgroundColor',
	'lightIntensity',
	'gridVisible',
	'axesVisible',
	'autoRotate',
	'renderWidth',
	'renderHeight',
	'lastInputSignature',
	'lastInputNodeId',
	'lastInputSourceUrl',
	'lastInputSourcePath',
	'lastInputSourceName',
	'lastInputPlaceholderId',
	'lastInputPlaceholderJson',
])

const sanitizeNode = (node: WorkflowNode): WorkflowNode => {
	const out = { ...node }
	for (const key of TRANSIENT_NODE_KEYS) {
		delete (out as Record<string, unknown>)[key]
	}
	if (out.imageSettings) {
		out.imageSettings = sanitizeGenericSettings(out.imageSettings, IMAGE_SETTINGS_TRANSIENT)
	}
	if (out.blenderSettings) {
		out.blenderSettings = sanitizeBlenderSettings(out.blenderSettings)
	}
	if (out.meshySettings) {
		out.meshySettings = sanitizeGenericSettings(out.meshySettings, MESHY_SETTINGS_TRANSIENT)
	}
	if (out.tripo3dSettings) {
		out.tripo3dSettings = sanitizeGenericSettings(out.tripo3dSettings, TRIPO3D_SETTINGS_TRANSIENT)
	}
	if (out.comfyuiSettings) {
		out.comfyuiSettings = sanitizeGenericSettings(out.comfyuiSettings, COMFYUI_SETTINGS_TRANSIENT)
	}
	if (out.sceneUnderstandingSettings) {
		out.sceneUnderstandingSettings = sanitizeGenericSettings(out.sceneUnderstandingSettings, SCENEUNDERSTANDING_SETTINGS_TRANSIENT)
	}
	if (out.sceneLayoutSettings) {
		out.sceneLayoutSettings = sanitizeGenericSettings(out.sceneLayoutSettings, SCENELAYOUT_SETTINGS_TRANSIENT)
	}
	if (out.sceneDecomposeSettings) {
		out.sceneDecomposeSettings = sanitizeGenericSettings(out.sceneDecomposeSettings, SCENEDECOMPOSE_SETTINGS_TRANSIENT)
	}
	if (out.unrealExportSettings) {
		out.unrealExportSettings = sanitizeGenericSettings(out.unrealExportSettings, UNREALEXPORT_SETTINGS_TRANSIENT)
	}
	if (out.model3dSettings) {
		out.model3dSettings = sanitizeGenericSettings(out.model3dSettings, MODEL3D_SETTINGS_TRANSIENT)
		if (out.model3dSettings?.meshyModelSettings) {
			out.model3dSettings.meshyModelSettings = sanitizeGenericSettings(
				out.model3dSettings.meshyModelSettings,
				MESHY_SETTINGS_TRANSIENT
			)
		}
		if (out.model3dSettings?.tripo3dModelSettings) {
			out.model3dSettings.tripo3dModelSettings = sanitizeGenericSettings(
				out.model3dSettings.tripo3dModelSettings,
				TRIPO3D_SETTINGS_TRANSIENT
			)
		}
	}
	return out
}

const sanitizeStateForHistory = (state: WorkflowState): WorkflowState => {
	const sanitizedNodesById: Record<string, WorkflowNode> = {}
	for (const nodeId of Object.keys(state.nodesById)) {
		sanitizedNodesById[nodeId] = sanitizeNode(state.nodesById[nodeId])
	}
	return {
		...state,
		nodesById: sanitizedNodesById,
	}
}

const fingerprintReplacer = (key: string, value: unknown): unknown => {
	if (TRANSIENT_STATE_KEYS.has(key)) return undefined
	if (TRANSIENT_NODE_KEYS.has(key)) return undefined
	if (key === 'screenshots') return undefined
	if (key === 'screenshot') return undefined
	if (key === 'thinkingContent') return undefined
	if (key === 'toolArgs') return undefined
	if (key === 'toolResult') return undefined
	if (key === 'toolError') return undefined
	if (key === 'isStreaming') return undefined
	if (key === 'isThinking') return undefined
	if (key === 'isStreamingThinking') return undefined
	if (key === 'isError') return undefined
	if (key === 'requestPayload') return undefined
	if (key === 'responsePayload') return undefined
	if (key === 'downloadSpeedBytesPerSec') return undefined
	if (key === 'downloadLoadedBytes') return undefined
	if (key === 'downloadTotalBytes') return undefined
	return value
}

const computeFingerprint = (state: unknown): string => {
	try {
		return JSON.stringify(state, fingerprintReplacer)
	} catch {
		return ''
	}
}

const scheduleIdle = (cb: () => void, timeout: number): number => {
	const ric = (globalThis as unknown as {
		requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
	}).requestIdleCallback
	if (typeof ric === 'function') {
		return ric(cb, { timeout }) as unknown as number
	}
	return window.setTimeout(cb, timeout)
}

const cancelIdle = (id: number | null): void => {
	if (id === null) return
	const cic = (globalThis as unknown as {
		cancelIdleCallback?: (id: number) => void
	}).cancelIdleCallback
	if (typeof cic === 'function') {
		cic(id)
	} else {
		window.clearTimeout(id)
	}
}

export type AIWorkflowHistoryOptions = {
	maxHistory?: number
	debounceMs?: number
}

const createCore = (options: AIWorkflowHistoryOptions = {}) => {
	const maxHistory =
		typeof options.maxHistory === 'number' && options.maxHistory > 0 ? options.maxHistory : 60
	const debounceMs =
		typeof options.debounceMs === 'number' && options.debounceMs >= 0 ? options.debounceMs : 200

	const past: unknown[] = []
	const future: unknown[] = []
	let isRestoring = false
	let captureTimer: number | null = null
	let lastFingerprint = ''
	let revision = 0
	let lastCapturedRevision = -1

	const captureNow = (getSnapshot: () => unknown) => {
		if (isRestoring) return
		if (revision === lastCapturedRevision) return
		const snap = getSnapshot() as WorkflowState
		const sanitized = sanitizeStateForHistory(snap)
		const fingerprint = computeFingerprint(sanitized)
		if (fingerprint && fingerprint === lastFingerprint) {
			lastCapturedRevision = revision
			return
		}
		const cloned = cloneJsonSafe(sanitized)
		past.push(cloned)
		if (past.length > maxHistory) past.splice(0, past.length - maxHistory)
		future.length = 0
		lastFingerprint = fingerprint
		lastCapturedRevision = revision
	}

	const schedule = (getSnapshot: () => unknown) => {
		if (isRestoring) return
		revision++
		if (captureTimer !== null) return
		const id = scheduleIdle(() => {
			captureTimer = null
			captureNow(getSnapshot)
		}, debounceMs)
		captureTimer = id
	}

	const flush = (getSnapshot: () => unknown) => {
		if (captureTimer === null) return
		cancelIdle(captureTimer)
		captureTimer = null
		captureNow(getSnapshot)
	}

	const apply = (
		fromStack: unknown[],
		toStack: unknown[],
		getSnapshot: () => unknown,
		applySnapshot: (snap: unknown) => void
	) => {
		if (fromStack.length === 0) return false
		isRestoring = true
		try {
			const current = getSnapshot() as WorkflowState
			const currentSanitized = sanitizeStateForHistory(current)
			toStack.push(cloneJsonSafe(currentSanitized))
			const snap = fromStack.pop()!
			lastFingerprint = computeFingerprint(snap)
			lastCapturedRevision = revision
			applySnapshot(cloneJsonSafe(snap))
		} finally {
			isRestoring = false
		}
		return true
	}

	return {
		canUndo: () => past.length > 0,
		canRedo: () => future.length > 0,
		schedule,
		commitCaptureNow: (getSnapshot: () => unknown) => captureNow(getSnapshot),
		flush,
		undo: (getSnapshot: () => unknown, applySnapshot: (snap: unknown) => void) =>
			apply(past, future, getSnapshot, applySnapshot),
		redo: (getSnapshot: () => unknown, applySnapshot: (snap: unknown) => void) =>
			apply(future, past, getSnapshot, applySnapshot),
	}
}

type Core = ReturnType<typeof createCore>

const attach = (store: Store<WorkflowState>, options: AIWorkflowHistoryOptions = {}) => {
	const core = createCore(options)
	const getSnapshot = () => store.state
	const applySnapshot = (snap: unknown) => {
		store.commit('replaceWorkflowState', { snapshot: snap })
	}
	store.subscribe((mutation) => {
		if (TRANSIENT_MUTATIONS.has(mutation.type)) return
		core.schedule(getSnapshot)
	})
	return {
		canUndo: () => core.canUndo(),
		canRedo: () => core.canRedo(),
		undo: () => {
			core.flush(getSnapshot)
			return core.undo(getSnapshot, applySnapshot)
		},
		redo: () => {
			core.flush(getSnapshot)
			return core.redo(getSnapshot, applySnapshot)
		},
		commitCaptureNow: () => core.commitCaptureNow(getSnapshot),
	}
}

const shared: { api: ReturnType<typeof attach> | null } = { api: null }

export const ensureAIWorkflowHistory = (options: AIWorkflowHistoryOptions = {}) => {
	if (shared.api) return shared.api
	shared.api = attach(AIWorkflowStore, options)
	return shared.api
}

export const aiWorkflowHistory = {
	canUndo: () => {
		const api = ensureAIWorkflowHistory()
		return api.canUndo()
	},
	canRedo: () => {
		const api = ensureAIWorkflowHistory()
		return api.canRedo()
	},
	undo: () => {
		const api = ensureAIWorkflowHistory()
		return api.undo()
	},
	redo: () => {
		const api = ensureAIWorkflowHistory()
		return api.redo()
	},
	commitCaptureNow: () => {
		const api = ensureAIWorkflowHistory()
		return api.commitCaptureNow()
	},
}

export const createAIWorkflowHistoryForStore = (
	store: Store<WorkflowState>,
	options: AIWorkflowHistoryOptions = {}
) => attach(store, options)

export type { Core as AIWorkflowHistoryCore }
