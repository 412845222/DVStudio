import { isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { MeshyDraggedTaskPayload, MeshyStoreLike, MeshyTaskStatus } from './types'

export type AIWorkflowDraggedMeshyTaskItem = MeshyDraggedTaskPayload & {
	meshySettings?: Record<string, unknown>
}

type EngineApi = {
	addNode?: (type: string, x: number, y: number, data?: Record<string, any>) => string | null
}

export const useAIWorkflowMeshyDrop = (options: {
	store: MeshyStoreLike
	engineApi?: EngineApi
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const createNodeFromDraggedMeshyTask = (payload: {
		item: AIWorkflowDraggedMeshyTaskItem
		worldX: number
		worldY: number
	}) => {
		const itemSettings = isRecord(payload.item.meshySettings) ? payload.item.meshySettings : {}
		const taskStatus = String(itemSettings.meshyTaskStatus ?? 'idle').trim() as MeshyTaskStatus
		const meshySettings = {
			...itemSettings,
			meshyTaskStatus: taskStatus,
			meshyTaskId:
				String(payload.item.taskId ?? itemSettings.meshyTaskId ?? '').trim() || undefined,
			meshyStatusText: String(itemSettings.meshyStatusText ?? '').trim() || undefined,
			meshyInputSummary: itemSettings.meshyInputSummary ?? undefined,
			meshyOutputSummary: itemSettings.meshyOutputSummary ?? undefined
		}
		const alias =
			String(
				payload.item.alias ?? payload.item.title ?? t('tasks.meshy.taskNodeDefaultAlias')
			).trim() || t('tasks.meshy.taskNodeDefaultAlias')

		const nodeId =
			options.engineApi?.addNode?.('meshy', payload.worldX, payload.worldY, {
				title: t('tasks.meshy.taskNodeTitle'),
				meshySettings,
				alias
			}) ?? null
		if (!nodeId) {
			options.store.commit('addNodeAt', {
				worldX: payload.worldX,
				worldY: payload.worldY,
				title: t('tasks.meshy.taskNodeTitle')
			})
			const fallbackId = options.store.state.selectedNodeId
			if (fallbackId) {
				options.store.commit('setNodeType', { nodeId: fallbackId, type: 'meshy' })
				options.store.commit('setNodeMeshySettings', { nodeId: fallbackId, meshySettings })
				options.store.commit('setNodeAlias', { nodeId: fallbackId, alias })
			}
		}

		options.pushToast(t('tasks.meshy.nodeCreatedFromTaskCenter'), 'info')
		return true
	}

	return {
		createNodeFromDraggedMeshyTask
	}
}
