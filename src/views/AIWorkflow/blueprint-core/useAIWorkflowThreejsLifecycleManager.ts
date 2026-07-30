import { computed, reactive, ref, watch, type ComputedRef } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'
import type {
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState
} from '../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { t } from '../../../i18n'

type InternalPreviewState = WorkflowThreePreviewState & {
	activatedOnce?: boolean
	phaseBeforeMasked?: WorkflowThreePreviewState['phase']
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

const DEBUG_LOG = true
const log = (...args: any[]) => {
	if (DEBUG_LOG) console.log('[ThreejsLifecycle]', ...args)
}

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

	watch(
		() => activeNodeId.value,
		(newId, oldId) => {
			if (newId !== oldId) {
				log('activeNodeId changed:', { from: oldId || '(empty)', to: newId || '(empty)', selectedCount: payload.selectedNodeIds.value.length })
			}
		}
	)

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

	const syncExportState = (target: WorkflowThreePreviewState, source: Partial<WorkflowThreePreviewState>) => {
		let changed = false
		if (source.phase !== undefined && target.phase !== source.phase) { target.phase = source.phase; changed = true }
		if (source.canStart !== undefined && target.canStart !== source.canStart) { target.canStart = source.canStart; changed = true }
		if (source.progress !== undefined && target.progress !== source.progress) { target.progress = source.progress; changed = true }
		if (source.label !== undefined && target.label !== source.label) { target.label = source.label; changed = true }
		if (source.requestId !== undefined && target.requestId !== source.requestId) { target.requestId = source.requestId; changed = true }
		if (changed && DEBUG_LOG) {
			log('exportState synced:', { nodeId: findNodeIdByExport(target), phase: source.phase, canStart: source.canStart })
		}
	}

	const findNodeIdByExport = (target: WorkflowThreePreviewState): string => {
		for (const [id, exp] of exportStateMap.entries()) {
			if (exp === target) return id
		}
		return '(unknown)'
	}

	const ensureState = (nodeId: string, canStart: boolean): InternalPreviewState => {
		const existing = stateMap.value[nodeId]
		if (existing) {
			existing.canStart = canStart
			return existing
		}
		const next = createMaskedState(canStart)
		stateMap.value[nodeId] = next
		log('ensureState created:', { nodeId, canStart })
		return next
	}

	const queueMasked = (nodeId: string, canStart: boolean) => {
		const current = ensureState(nodeId, canStart)
		// 按照用户要求：移除延迟，立即设置masked状态，用户可通过按钮重启
		commitMaskedNow(current, canStart)
		return current
	}

	const commitMaskedNow = (current: InternalPreviewState, canStart: boolean) => {
		const oldPhase = current.phase
		current.phase = 'masked'
		current.canStart = canStart
		current.progress = 0
		current.label = ''
		current.phaseBeforeMasked = undefined
		if (oldPhase !== 'masked') {
			log('commitMaskedNow:', { fromPhase: oldPhase, canStart })
		}
	}

	const cancelPendingMasked = (nodeId: string, current: InternalPreviewState) => {
		current.phaseBeforeMasked = undefined
	}

	const kickoffAutoStart = (current: InternalPreviewState) => {
		if (current.phase === 'loading' || current.phase === 'interactive') return
		const oldPhase = current.phase
		current.phase = 'loading'
		current.canStart = true
		current.progress = 0.04
		current.label = t('aiworkflow.toast.preparingRenderResources')
		current.requestId = (Number(current.requestId) || 0) + 1
		current.phaseBeforeMasked = undefined
		log('kickoffAutoStart:', { oldPhase, newPhase: 'loading', requestId: current.requestId })
	}

	watch(
		() => [activeNodeId.value, payload.selectedNodeIds.value.join('|')] as const,
		([activeId]) => {
			for (const nodeId of Object.keys(stateMap.value)) {
				if (nodeId === activeId) {
					const current = ensureState(nodeId, true)
					cancelPendingMasked(nodeId, current)
					if (current.activatedOnce && current.phase === 'masked') {
						kickoffAutoStart(current)
					}
					const exportState = exportStateMap.get(nodeId)
					if (exportState) syncExportState(exportState, current)
					continue
				}
				const current = stateMap.value[nodeId]
				if (current && current.activatedOnce) {
					// 对于曾经成功启动过预览的节点，保持canStart=true，用户可通过按钮重启
					queueMasked(nodeId, true)
					const exportState = exportStateMap.get(nodeId)
					if (exportState) {
						syncExportState(exportState, {
							phase: 'masked',
							canStart: true,
							progress: 0,
							label: '',
							requestId: current.requestId
						})
					}
				} else {
					commitMaskedNow(current || ensureState(nodeId, false), false)
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
			}
			if (activeId) {
				const current = ensureState(activeId, true)
				cancelPendingMasked(activeId, current)
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

		const current = ensureState(targetId, true)

		// 如果节点正在loading或interactive状态（用户显式启动了预览），直接返回真实状态
		// 不检查activeNodeId，允许非active节点保持预览状态
		if (current.phase === 'loading' || current.phase === 'interactive') {
			cancelPendingMasked(targetId, current)
			const exportState = getOrCreateExportState(targetId)
			syncExportState(exportState, current)
			return exportState
		}

		if (targetId !== activeNodeId.value) {
			if (current.activatedOnce) {
				// 已激活过的节点保持canStart=true，用户可通过按钮重启
				queueMasked(targetId, true)
			}

			const exportState = getOrCreateExportState(targetId)
			syncExportState(exportState, {
				phase: 'masked',
				canStart: current.activatedOnce ? true : false,
				progress: 0,
				label: '',
				requestId: current.requestId ?? 0
			})
			return exportState
		}

		cancelPendingMasked(targetId, current)
		if (current.activatedOnce && current.phase === 'masked') {
			kickoffAutoStart(current)
		}
		const exportState = getOrCreateExportState(targetId)
		syncExportState(exportState, current)
		return exportState
	}

	const startPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		if (!targetId) return
		const current = ensureState(targetId, true)
		cancelPendingMasked(targetId, current)
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
		if (current.phase === 'interactive' || current.phase === 'loading') {
			const oldPhase = current.phase
			current.phase = 'masked'
			current.canStart = true
			current.progress = 0
			current.label = ''
			current.requestId = (Number(current.requestId) || 0) + 1
			current.phaseBeforeMasked = undefined
			log('markPreviewContentChanged:', { nodeId: targetId, oldPhase, newPhase: 'masked', requestId: current.requestId })
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
		if (!current) return
		current.activatedOnce = true
		cancelPendingMasked(targetId, current)
		if (current.phase === 'interactive' && current.progress === 1)
			return
		const oldPhase = current.phase
		current.phase = 'interactive'
		current.canStart = true
		current.progress = 1
		current.label = t('aiworkflow.toast.renderReady')
		log('completePreviewSession:', { nodeId: targetId, oldPhase, newPhase: 'interactive' })
		const exportState = exportStateMap.get(targetId)
		if (exportState) syncExportState(exportState, current)
	}

	const failPreviewSession = (nodeId: string) => {
		const targetId = String(nodeId ?? '').trim()
		const current = stateMap.value[targetId]
		if (!current) return
		if (current.phase === 'masked' && current.progress === 0 && current.label === '') return
		current.activatedOnce = false
		const oldPhase = current.phase
		current.phase = 'masked'
		current.canStart = true
		current.progress = 0
		current.label = ''
		current.requestId = (Number(current.requestId) || 0) + 1
		current.phaseBeforeMasked = undefined
		log('failPreviewSession:', { nodeId: targetId, oldPhase, newPhase: 'masked', requestId: current.requestId })
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
