import { ref } from 'vue'
import { t } from '../../../../i18n'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import type {
	MeshyComfyService,
	MeshyGenerateResponse,
	MeshyStoreLike,
	BuildMeshyRequestPayloadFn
} from './types'

export const useAIWorkflowMeshyCommands = (options: {
	store: MeshyStoreLike
	getComfyService: () => MeshyComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	stopMeshyPoll: (nodeId: string) => void
	startMeshyPoll: (nodeId: string, taskId: string, mode: string) => void
	buildMeshyRequestPayload: BuildMeshyRequestPayloadFn
	hasIncomingEdge: (nodeId: string, anchorId: string) => boolean
	connectedMeshyImageUrls: (nodeId: string) => string[]
	normalizeMeshyTaskStatus: (status: unknown) => string
	refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshMeshyTaskItems: () => boolean
}) => {
	const meshyTextureConfirm = ref<{
		nodeId: string
		currentTaskId: string
		rootTaskId: string
	} | null>(null)

	const onNodeGenerateMeshy = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'meshy') return

		const prepared = await options.buildMeshyRequestPayload(node)
		if (!prepared.ok) {
			options.pushToast(prepared.error, 'warn')
			options.store.commit('setNodeMeshySettings', {
				nodeId,
				meshySettings: {
					meshyTaskStatus: 'failed',
					meshyErrorMessage: prepared.error,
					meshyStatusText: prepared.error
				}
			})
			return
		}

		options.stopMeshyPoll(nodeId)
		options.store.commit('setNodeMeshySettings', {
			nodeId,
			meshySettings: {
				meshyTaskStatus: 'pending',
				meshyProgress: 0,
				meshyErrorMessage: '',
				meshyStatusText: t('tasks.meshy.creatingTask'),
				meshyInputSummary: {
					promptSource: prepared.promptSource,
					promptText: prepared.promptText || undefined,
					imageCount: prepared.imageCount,
					modelInputConnected: options.hasIncomingEdge(node.id, 'in-model'),
					lastValidatedAt: Date.now()
				}
			}
		})

		try {
			const res = await options.getComfyService().meshyGenerate(prepared.payload)
			if (!res.ok) {
				const msg = String(res.error ?? t('tasks.meshy.createTaskFailed'))
				options.store.commit('setNodeMeshySettings', {
					nodeId,
					meshySettings: {
						meshyTaskStatus: 'failed',
						meshyErrorMessage: msg,
						meshyStatusText: msg
					}
				})
				options.pushToast(msg, 'warn')
				return
			}

			const taskStatus = options.normalizeMeshyTaskStatus(res.status)
			const taskId = String(res.taskId ?? '').trim()
			const mode = String(res.mode ?? prepared.payload.mode ?? 'text-to-3d').trim()
			options.store.commit('setNodeMeshySettings', {
				nodeId,
				meshySettings: {
					meshyTaskId: taskId,
					meshyTaskStatus: taskStatus === 'idle' ? 'pending' : taskStatus,
					meshyProgress: taskStatus === 'running' ? 5 : 0,
					meshyStatusText: t('tasks.meshy.taskCreatedPolling')
				}
			})
			if (options.shouldRefreshMeshyTaskItems()) {
				void options.refreshMeshyTaskItems({ silent: true })
			}
			if (!taskId) {
				options.pushToast(t('tasks.meshy.missingTaskIdToast'), 'warn')
				return
			}
			options.startMeshyPoll(nodeId, taskId, mode)
		} catch (err: unknown) {
			const msg = t('tasks.meshy.createTaskException', { error: getErrorMessage(err) })
			options.store.commit('setNodeMeshySettings', {
				nodeId,
				meshySettings: {
					meshyTaskStatus: 'failed',
					meshyErrorMessage: msg,
					meshyStatusText: msg
				}
			})
			options.pushToast(msg, 'warn')
		}
	}

	const submitMeshyTextureFollowup = async (
		nodeId: string,
		currentTaskId: string,
		rootTaskId: string
	) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'meshy') return
		const nodeRecord = node as unknown as Record<string, unknown>
		const settings = isRecord(nodeRecord.meshySettings) ? nodeRecord.meshySettings : {}
		const relationSummary = isRecord(settings.meshyRelationSummary)
			? settings.meshyRelationSummary
			: {}

		options.store.commit('setNodeMeshySettings', {
			nodeId,
			meshySettings: {
				meshyTaskTarget: '3d',
				meshyTaskFamily: 'retexture',
				meshyRelationKind: 'texture',
				meshyRootTaskId: rootTaskId || currentTaskId,
				meshyParentTaskId: currentTaskId,
				meshyPreviewTaskId: currentTaskId,
				meshyHelpTopic: 'retexture',
				meshyTexturePrompt: String(settings.meshyTexturePrompt ?? '').trim() || undefined,
				meshyRelationSummary: {
					...(relationSummary ?? {}),
					relationKind: 'texture',
					rootTaskId: rootTaskId || currentTaskId,
					parentTaskId: currentTaskId
				}
			}
		})
		await onNodeGenerateMeshy(nodeId)
	}

	const onNodeRunMeshyFollowup = async (
		nodeId: string,
		kind: 'texture' | 'rigging' | 'animation'
	) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'meshy') return
		const nodeRecord = node as unknown as Record<string, unknown>
		const settings = isRecord(nodeRecord.meshySettings) ? nodeRecord.meshySettings : {}
		const relationSummary = isRecord(settings.meshyRelationSummary)
			? settings.meshyRelationSummary
			: {}
		const currentTaskId = String(
			relationSummary.effectiveTaskId ?? settings.meshyTaskId ?? ''
		).trim()
		const rootTaskId = String(
			settings.meshyRootTaskId ?? relationSummary.rootTaskId ?? currentTaskId
		).trim()
		const taskStatus = String(settings.meshyTaskStatus ?? '').trim()

		if (taskStatus === 'pending' || taskStatus === 'running') {
			options.pushToast(t('tasks.meshy.taskInProgressWait'), 'warn')
			return
		}
		if (!currentTaskId) {
			options.pushToast(t('tasks.meshy.noReusableTaskResult'), 'warn')
			return
		}
		if (kind !== 'texture') {
			options.pushToast(t('tasks.meshy.riggingAnimationNotAvailable'), 'warn')
			return
		}

		const hasNewTextureInput =
			!!String(settings.meshyTexturePrompt ?? '').trim() ||
			!!String(settings.meshyTextureImageUrl ?? '').trim() ||
			options.connectedMeshyImageUrls(nodeId).length > 0
		if (!hasNewTextureInput) {
			meshyTextureConfirm.value = { nodeId, currentTaskId, rootTaskId: rootTaskId || currentTaskId }
			return
		}

		await submitMeshyTextureFollowup(nodeId, currentTaskId, rootTaskId || currentTaskId)
	}

	const onNodeRestartMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'meshy') return

		const nodeRecord = node as unknown as Record<string, unknown>
		const settings = isRecord(nodeRecord.meshySettings) ? nodeRecord.meshySettings : {}
		const status = String(settings.meshyTaskStatus ?? '').trim()
		if (status === 'pending' || status === 'running') {
			options.pushToast(t('tasks.meshy.taskRunningCannotRestart'), 'warn')
			return
		}

		options.stopMeshyPoll(nodeId)
		const hasImageRefs = options.connectedMeshyImageUrls(nodeId).length > 0
		const nextFamily = hasImageRefs ? 'image-to-3d' : 'text-to-3d'

		options.store.commit('setNodeMeshySettings', {
			nodeId,
			meshySettings: {
				meshyTaskTarget: '3d',
				meshyTaskFamily: nextFamily,
				meshyRelationKind: 'model',
				meshyTaskId: '',
				meshyTaskStatus: 'idle',
				meshyProgress: 0,
				meshyErrorMessage: '',
				meshyStatusText: t('tasks.meshy.resetToNewTask'),
				meshyPreviewTaskId: '',
				meshyRootTaskId: '',
				meshyParentTaskId: '',
				meshyRelationSummary: {
					relationKind: 'model',
					rootTaskId: undefined,
					parentTaskId: undefined,
					effectiveTaskId: undefined,
					effectiveRelationKind: 'model',
					effectiveStatus: 'idle',
					effectiveProgress: 0,
					effectivePreferredModelUrl: undefined,
					effectivePreferredImageUrl: undefined,
					effectiveLocalAssetUrl: undefined,
					effectiveLocalAssetPath: undefined,
					effectiveThumbnailUrl: undefined
				}
			}
		})

		await onNodeGenerateMeshy(nodeId)
	}

	const cancelMeshyTextureConfirm = () => {
		meshyTextureConfirm.value = null
	}

	const confirmMeshyTextureFollowup = async () => {
		const pending = meshyTextureConfirm.value
		if (!pending) return
		meshyTextureConfirm.value = null
		await submitMeshyTextureFollowup(pending.nodeId, pending.currentTaskId, pending.rootTaskId)
	}

	return {
		meshyTextureConfirm,
		cancelMeshyTextureConfirm,
		confirmMeshyTextureFollowup,
		onNodeGenerateMeshy,
		onNodeRunMeshyFollowup,
		onNodeRestartMeshyTask
	}
}
