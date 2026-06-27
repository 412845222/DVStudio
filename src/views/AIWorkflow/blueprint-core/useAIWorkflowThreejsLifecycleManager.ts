import { computed, ref, watch, type ComputedRef } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'
import type {
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState
} from '../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'

type InternalPreviewState = WorkflowThreePreviewState

const THREE_PREVIEW_TYPES = new Set<WorkflowNode['type']>(['scene-layout', 'model3d'])

const createMaskedState = (canStart: boolean, requestId = 0): InternalPreviewState => ({
	phase: 'masked',
	canStart,
	progress: 0,
	label: '',
	requestId
})

export const useAIWorkflowThreejsLifecycleManager = (payload: {
	active3DPreviewNodeId: ComputedRef<string>
	selectedNodeIds: ComputedRef<string[]>
}) => {
	const stateMap = ref<Record<string, InternalPreviewState>>({})

	const activeNodeId = computed(() => {
		if (payload.selectedNodeIds.value.length !== 1) return ''
		return String(payload.active3DPreviewNodeId.value ?? '').trim()
	})

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

	watch(
		() => [activeNodeId.value, payload.selectedNodeIds.value.join('|')] as const,
		([activeId]) => {
			const nextMap = { ...stateMap.value }
			for (const nodeId of Object.keys(nextMap)) {
				if (nodeId === activeId) {
					ensureState(nodeId, true)
					continue
				}
				setMaskedState(nodeId, false)
			}
			if (activeId) ensureState(activeId, true)
		},
		{ immediate: true }
	)

	const getNodePreviewState = (
		nodeId: string,
		nodeType: WorkflowNode['type']
	): WorkflowThreePreviewState | null => {
		if (!THREE_PREVIEW_TYPES.has(nodeType)) return null
		const targetId = String(nodeId ?? '').trim()
		if (!targetId) return createMaskedState(false)
		if (targetId !== activeNodeId.value) {
			const current = stateMap.value[targetId]
			if (!current) return createMaskedState(false)
			return { ...current, phase: 'masked', canStart: false, progress: 0, label: '' }
		}
		return { ...ensureState(targetId, true) }
	}

	const startPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		if (!targetId || targetId !== activeNodeId.value) return
		const current = ensureState(targetId, true)
		if (current.phase === 'loading') return
		current.phase = 'loading'
		current.progress = 0.04
		current.label = '准备渲染资源'
		current.requestId += 1
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
	}

	const completePreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current || targetId !== activeNodeId.value) return
		if (current.phase === 'interactive' && current.progress === 1 && current.label === '渲染已就绪')
			return
		current.phase = 'interactive'
		current.canStart = true
		current.progress = 1
		current.label = '渲染已就绪'
	}

	const failPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current) return
		if (current.phase === 'masked' && current.progress === 0 && current.label === '') return
		current.phase = 'masked'
		current.progress = 0
		current.label = ''
	}

	return {
		getNodePreviewState,
		startPreviewSession,
		updatePreviewProgress,
		completePreviewSession,
		failPreviewSession
	}
}
