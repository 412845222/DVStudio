import { computed, reactive, ref, watch, type ComputedRef } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'
import type {
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState
} from '../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'

type InternalPreviewState = WorkflowThreePreviewState & {
	activatedOnce?: boolean
}

const THREE_PREVIEW_TYPES = new Set<WorkflowNode['type']>(['scene-layout', 'model3d'])

const createMaskedState = (canStart: boolean, requestId = 0): InternalPreviewState => ({
	phase: 'masked',
	canStart,
	progress: 0,
	label: '',
	requestId,
	activatedOnce: false
})

const MASKED_FALSE_STATE: WorkflowThreePreviewState = Object.freeze({
	phase: 'masked',
	canStart: false,
	progress: 0,
	label: '',
	requestId: 0
})

export const useAIWorkflowThreejsLifecycleManager = (payload: {
	active3DPreviewNodeId: ComputedRef<string>
	selectedNodeIds: ComputedRef<string[]>
}) => {
	const stateMap = ref<Record<string, InternalPreviewState>>({})
	const exportStateMap = new Map<string, WorkflowThreePreviewState>()

	const activeNodeId = computed(() => {
		if (payload.selectedNodeIds.value.length !== 1) return ''
		return String(payload.active3DPreviewNodeId.value ?? '').trim()
	})

	const getOrCreateExportState = (nodeId: string): WorkflowThreePreviewState => {
		let existing = exportStateMap.get(nodeId)
		if (!existing) {
			const next: WorkflowThreePreviewState = reactive({
				phase: 'masked' as const,
				canStart: false,
				progress: 0,
				label: '',
				requestId: 0
			})
			exportStateMap.set(nodeId, next)
			existing = next
		}
		return existing
	}

	const syncExportState = (target: WorkflowThreePreviewState, source: WorkflowThreePreviewState) => {
		if (target.phase !== source.phase) target.phase = source.phase
		if (target.canStart !== source.canStart) target.canStart = source.canStart
		if (target.progress !== source.progress) target.progress = source.progress
		if (target.label !== source.label) target.label = source.label
		if (target.requestId !== source.requestId) target.requestId = source.requestId
	}

	const ensureState = (nodeId: string, canStart: boolean) => {
		const existing = stateMap.value[nodeId]
		if (existing) {
			existing.canStart = canStart
			return existing
		}
		const next = createMaskedState(canStart)
		stateMap.value[nodeId] = next
		return next
	}

	const setMaskedState = (nodeId: string, canStart: boolean) => {
		const current = ensureState(nodeId, canStart)
		current.phase = 'masked'
		current.canStart = canStart
		current.progress = 0
		current.label = ''
	}

	const kickoffAutoStart = (current: InternalPreviewState) => {
		if (current.phase === 'loading' || current.phase === 'interactive') return
		current.phase = 'loading'
		current.canStart = true
		current.progress = 0.04
		current.label = '准备渲染资源'
		current.requestId = (Number(current.requestId) || 0) + 1
	}

	watch(
		() => [activeNodeId.value, payload.selectedNodeIds.value.join('|')] as const,
		([activeId]) => {
			for (const nodeId of Object.keys(stateMap.value)) {
				if (nodeId === activeId) {
					const current = ensureState(nodeId, true)
					if (current.activatedOnce && current.phase === 'masked') {
						kickoffAutoStart(current)
					}
					const exportState = exportStateMap.get(nodeId)
					if (exportState) syncExportState(exportState, current)
					continue
				}
				setMaskedState(nodeId, false)
				const exportState = exportStateMap.get(nodeId)
				if (exportState) {
					syncExportState(exportState, {
						phase: 'masked',
						canStart: false,
						progress: 0,
						label: '',
						requestId: stateMap.value[nodeId]?.requestId ?? 0
					})
				}
			}
			if (activeId) {
				const current = ensureState(activeId, true)
				if (current.activatedOnce && current.phase === 'masked') {
					kickoffAutoStart(current)
				}
				const exportState = exportStateMap.get(activeId)
				if (exportState) syncExportState(exportState, current)
			}
		},
		{ immediate: true }
	)

	const getNodePreviewState = (
		nodeId: string,
		nodeType: WorkflowNode['type']
	): WorkflowThreePreviewState | null => {
		if (!THREE_PREVIEW_TYPES.has(nodeType)) return null
		const targetId = String(nodeId ?? '').trim()
		if (!targetId) return MASKED_FALSE_STATE
		if (targetId !== activeNodeId.value) {
			const current = stateMap.value[targetId]
			if (!current) return MASKED_FALSE_STATE
			const exportState = getOrCreateExportState(targetId)
			syncExportState(exportState, {
				phase: 'masked',
				canStart: false,
				progress: 0,
				label: '',
				requestId: current.requestId ?? 0
			})
			return exportState
		}
		const current = ensureState(targetId, true)
		if (current.activatedOnce && current.phase === 'masked') {
			kickoffAutoStart(current)
		}
		const exportState = getOrCreateExportState(targetId)
		syncExportState(exportState, current)
		return exportState
	}

	const startPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		if (!targetId || targetId !== activeNodeId.value) return
		const current = ensureState(targetId, true)
		if (current.phase === 'loading' || current.phase === 'interactive') return
		kickoffAutoStart(current)
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	const markPreviewContentChanged = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current) return
		current.activatedOnce = false
		if (current.phase === 'interactive') {
			current.phase = 'masked'
			current.progress = 0
			current.label = ''
		}
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	const updatePreviewProgress = (
		nodeId: string,
		payloadValue?: WorkflowThreePreviewProgressPayload
	) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current || current.phase !== 'loading') return
		let changed = false
		if (payloadValue?.progress != null) {
			const nextProgress = Number(payloadValue.progress)
			if (Number.isFinite(nextProgress)) {
				const normalizedProgress = Math.max(current.progress, Math.min(1, nextProgress))
				if (normalizedProgress !== current.progress) {
					current.progress = normalizedProgress
					changed = true
				}
			}
		}
		if (typeof payloadValue?.label === 'string' && payloadValue.label !== current.label) {
			current.label = payloadValue.label
			changed = true
		}
		if (!changed) return
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	const completePreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current || targetId !== activeNodeId.value) return
		current.activatedOnce = true
		if (current.phase === 'interactive' && current.progress === 1 && current.label === '渲染已就绪')
			return
		current.phase = 'interactive'
		current.canStart = true
		current.progress = 1
		current.label = '渲染已就绪'
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	const failPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current) return
		if (current.phase === 'masked' && current.progress === 0 && current.label === '') return
		current.phase = 'masked'
		current.canStart = true
		current.progress = 0
		current.label = ''
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	return {
		getNodePreviewState,
		startPreviewSession,
		markPreviewContentChanged,
		updatePreviewProgress,
		completePreviewSession,
		failPreviewSession
	}
}
