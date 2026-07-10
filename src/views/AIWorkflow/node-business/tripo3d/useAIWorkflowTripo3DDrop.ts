import { t } from '../../../../i18n'
import type { Tripo3DStoreLike, Tripo3DTaskPanelItem, CreateImageNodeAtCenterFn, CreateModel3DNodeAtCenterFn } from './types'
import { isTripo3DImageMode } from './types'

export type Tripo3DDraggedTaskPayload = {
	taskId?: string
	title?: string
	mode?: string
	prompt?: string
	thumbnailUrl?: string
	modelUrl?: string
	imageUrls?: string[]
	status?: string
	taskType?: string
}

export type AIWorkflowDraggedTripo3DTaskItem = Tripo3DDraggedTaskPayload & {
	tripo3dSettings?: Record<string, unknown>
}

export const useAIWorkflowTripo3DDrop = (options: {
	store: Tripo3DStoreLike
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	pullTripo3DTaskToNode?: (nodeId: string, taskId: string, mode?: string) => Promise<{ ok: boolean; error?: string; finalStatus?: string }>
	createImageNodeAtCenter?: CreateImageNodeAtCenterFn
	createModel3DNodeAtCenter?: CreateModel3DNodeAtCenterFn
}) => {
	const createNodeFromDraggedTripo3DTask = (payload: {
		item: AIWorkflowDraggedTripo3DTaskItem
		worldX: number
		worldY: number
	}) => {
		const taskId = String(payload.item.taskId ?? '').trim()
		const mode = String(payload.item.mode ?? 'text_to_model').trim()
		const title = String(payload.item.title ?? '').trim()
		const taskStatus = String(payload.item.status ?? '').trim().toLowerCase()
		const isCompleted = taskStatus === 'succeeded' || taskStatus === 'success'
		const isImageTask = isTripo3DImageMode(mode)
		const thumbnailUrl = String(payload.item.thumbnailUrl ?? '').trim()
		const imageUrls = Array.isArray(payload.item.imageUrls)
			? payload.item.imageUrls.filter((u): u is string => typeof u === 'string' && !!u.trim()).map(u => u.trim())
			: []
		const primaryImageUrl = imageUrls.length > 0 ? imageUrls[0] : thumbnailUrl
		const modelUrl = String(payload.item.modelUrl ?? '').trim()

		if (isImageTask && options.createImageNodeAtCenter) {
			const nodeTitle = title || t('tasks.tripo3d.imageTaskNodeName')
			options.store.commit('addNodeAt', {
				worldX: payload.worldX,
				worldY: payload.worldY,
				title: nodeTitle
			})
			const nodeId = options.store.state.selectedNodeId
			if (!nodeId) return true

			options.store.commit('setNodeType', { nodeId, type: 'image' })
			options.store.commit('setNodeAlias', {
				nodeId,
				alias: nodeTitle
			})

			const tripo3dImageSettings: Record<string, unknown> = {
				taskId: taskId || undefined,
				taskFamily: mode || 'text_to_image',
				prompt: String(payload.item.prompt ?? '').trim() || undefined,
				thumbnailUrl: thumbnailUrl || undefined,
				outputImages: imageUrls.length > 0 ? imageUrls : (primaryImageUrl ? [primaryImageUrl] : undefined)
			}

			if (isCompleted) {
				tripo3dImageSettings.taskStatus = 'succeeded'
				tripo3dImageSettings.progress = 100
				tripo3dImageSettings.statusText = t('tasks.tripo3d.statusSuccess')
				if (primaryImageUrl) {
					tripo3dImageSettings.outputImageUrl = primaryImageUrl
				}
			} else {
				tripo3dImageSettings.taskStatus = 'pending'
				tripo3dImageSettings.progress = 0
				tripo3dImageSettings.statusText = t('tasks.tripo3d.pullingImageArtifacts')
			}

			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: {
					imageGenerationSource: 'tripo3d',
					imageUrl: isCompleted ? primaryImageUrl : undefined,
					thumbnailUrl: thumbnailUrl || undefined,
					tripo3dImageSettings
				}
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

		const nodeTitle = title || t('tasks.tripo3d.model3dTaskNodeName')
		options.store.commit('addNodeAt', {
			worldX: payload.worldX,
			worldY: payload.worldY,
			title: nodeTitle
		})
		const nodeId = options.store.state.selectedNodeId
		if (!nodeId) return true

		options.store.commit('setNodeType', { nodeId, type: 'model3d' })
		options.store.commit('setNodeAlias', {
			nodeId,
			alias: nodeTitle
		})

		const initialSettings: Record<string, unknown> = {
			modelGenerationSource: 'tripo3d',
			tripo3dModelSettings: {
				tripo3dTaskId: taskId || undefined,
				tripo3dTaskFamily: mode || 'text_to_model',
				tripo3dPrompt: String(payload.item.prompt ?? '').trim() || undefined,
				tripo3dThumbnailUrl: thumbnailUrl || undefined
			}
		}

		if (isCompleted) {
			initialSettings.tripo3dModelSettings = {
				...(initialSettings.tripo3dModelSettings as Record<string, unknown>),
				tripo3dTaskStatus: 'succeeded',
				tripo3dProgress: 100,
				tripo3dStatusText: t('tasks.tripo3d.statusSuccess'),
				tripo3dModelUrl: modelUrl || undefined
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
	task: Pick<Tripo3DTaskPanelItem, 'taskId' | 'title' | 'mode' | 'promptPreview' | 'thumbnailUrl' | 'modelUrl' | 'status' | 'taskType' | 'imageUrls'>
) => {
	const payload: Tripo3DDraggedTaskPayload = {
		taskId: task.taskId,
		title: task.title,
		mode: task.mode,
		prompt: task.promptPreview,
		thumbnailUrl: task.thumbnailUrl,
		modelUrl: task.modelUrl,
		imageUrls: task.imageUrls,
		status: task.status,
		taskType: task.taskType
	}
	return JSON.stringify(payload)
}

export const TRI_PO3D_TASK_DRAG_MIME = 'application/x-dvstudio-tripo3d-task'
