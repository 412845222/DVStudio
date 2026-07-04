import { isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { MeshyDraggedTaskPayload, MeshyStoreLike, MeshyTaskStatus } from './types'

export type AIWorkflowDraggedMeshyTaskItem = MeshyDraggedTaskPayload & {
	meshySettings?: Record<string, unknown>
}

export const useAIWorkflowMeshyDrop = (options: {
	store: MeshyStoreLike
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const createNodeFromDraggedMeshyTask = (payload: {
		item: AIWorkflowDraggedMeshyTaskItem
		worldX: number
		worldY: number
	}) => {
		options.store.commit('addNodeAt', {
			worldX: payload.worldX,
			worldY: payload.worldY,
			title: t('tasks.meshy.taskNodeTitle')
		})
		const nodeId = options.store.state.selectedNodeId
		if (!nodeId) return true

		const itemSettings = isRecord(payload.item.meshySettings) ? payload.item.meshySettings : {}
		const taskStatus = String(itemSettings.meshyTaskStatus ?? 'idle').trim() as MeshyTaskStatus

		options.store.commit('setNodeType', { nodeId, type: 'meshy' })
		options.store.commit('setNodeMeshySettings', {
			nodeId,
			meshySettings: {
				...itemSettings,
				meshyTaskStatus: taskStatus,
				meshyTaskId:
					String(payload.item.taskId ?? itemSettings.meshyTaskId ?? '').trim() || undefined,
				meshyStatusText: String(itemSettings.meshyStatusText ?? '').trim() || undefined,
				meshyInputSummary: itemSettings.meshyInputSummary ?? undefined,
				meshyOutputSummary: itemSettings.meshyOutputSummary ?? undefined
			}
		})
		options.store.commit('setNodeAlias', {
			nodeId,
			alias:
				String(payload.item.alias ?? payload.item.title ?? t('tasks.meshy.taskNodeDefaultAlias')).trim() ||
				t('tasks.meshy.taskNodeDefaultAlias')
		})
		options.pushToast(t('tasks.meshy.nodeCreatedFromTaskCenter'), 'info')
		return true
	}

	return {
		createNodeFromDraggedMeshyTask
	}
}
