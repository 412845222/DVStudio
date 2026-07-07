import { t } from '../../../../i18n'
import type { Tripo3DStoreLike, Tripo3DTaskPanelItem } from './types'

export type Tripo3DDraggedTaskPayload = {
	taskId?: string
	title?: string
	mode?: string
	prompt?: string
	thumbnailUrl?: string
	modelUrl?: string
	status?: string
}

export type AIWorkflowDraggedTripo3DTaskItem = Tripo3DDraggedTaskPayload & {
	tripo3dSettings?: Record<string, unknown>
}

export const useAIWorkflowTripo3DDrop = (options: {
	store: Tripo3DStoreLike
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	pullTripo3DTaskToNode?: (nodeId: string, taskId: string, mode?: string) => Promise<{ ok: boolean; error?: string; finalStatus?: string }>
}) => {
	const createNodeFromDraggedTripo3DTask = (payload: {
		item: AIWorkflowDraggedTripo3DTaskItem
		worldX: number
		worldY: number
	}) => {
		const taskId = String(payload.item.taskId ?? '').trim()
		const mode = String(payload.item.mode ?? 'text_to_model').trim()
		const title = String(payload.item.title ?? t('tasks.tripo3d.model3dTaskNodeName')).trim()
		const taskStatus = String(payload.item.status ?? '').trim().toLowerCase()
		const isCompleted = taskStatus === 'succeeded' || taskStatus === 'success'

		options.store.commit('addNodeAt', {
			worldX: payload.worldX,
			worldY: payload.worldY,
			title: title || t('tasks.tripo3d.model3dTaskNodeName')
		})
		const nodeId = options.store.state.selectedNodeId
		if (!nodeId) return true

		options.store.commit('setNodeType', { nodeId, type: 'model3d' })
		options.store.commit('setNodeAlias', {
			nodeId,
			alias: title || t('tasks.tripo3d.model3dTaskNodeName')
		})

		const initialSettings: Record<string, unknown> = {
			modelGenerationSource: 'tripo3d',
			tripo3dModelSettings: {
				tripo3dTaskId: taskId || undefined,
				tripo3dTaskFamily: mode || 'text_to_model',
				tripo3dPrompt: String(payload.item.prompt ?? '').trim() || undefined,
				tripo3dThumbnailUrl: String(payload.item.thumbnailUrl ?? '').trim() || undefined
			}
		}

		if (isCompleted) {
			initialSettings.tripo3dModelSettings = {
				...(initialSettings.tripo3dModelSettings as Record<string, unknown>),
				tripo3dTaskStatus: 'succeeded',
				tripo3dProgress: 100,
				tripo3dStatusText: t('tasks.tripo3d.statusSuccess')
			}
		} else {
			initialSettings.tripo3dModelSettings = {
				...(initialSettings.tripo3dModelSettings as Record<string, unknown>),
				tripo3dTaskStatus: 'pending',
				tripo3dProgress: 0,
				tripo3dStatusText: t('tasks.tripo3d.pullingModelArtifacts')
			}
		}

		options.store.commit('setNodeModel3DSettings', {
			nodeId,
			model3dSettings: initialSettings
		})

		if (taskId && typeof options.pullTripo3DTaskToNode === 'function') {
			void options.pullTripo3DTaskToNode(nodeId, taskId, mode).then((res) => {
				if (!res.ok) {
					options.pushToast(t('tasks.tripo3d.pullArtifactsFailed', { error: res.error || 'unknown' }), 'warn')
				}
			})
		}
		options.pushToast(t('tasks.tripo3d.nodeCreatedFromTaskCenter'), 'info')

		return true
	}

	return {
		createNodeFromDraggedTripo3DTask
	}
}

export const buildTripo3DDragDataTransfer = (
	task: Pick<Tripo3DTaskPanelItem, 'taskId' | 'title' | 'mode' | 'promptPreview' | 'thumbnailUrl' | 'modelUrl' | 'status'>
) => {
	const payload: Tripo3DDraggedTaskPayload = {
		taskId: task.taskId,
		title: task.title,
		mode: task.mode,
		prompt: task.promptPreview,
		thumbnailUrl: task.thumbnailUrl,
		modelUrl: task.modelUrl,
		status: task.status
	}
	return JSON.stringify(payload)
}

export const TRI_PO3D_TASK_DRAG_MIME = 'application/x-dvstudio-tripo3d-task'
