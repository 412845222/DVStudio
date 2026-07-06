import { t } from '../../../../i18n'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import type {
	Tripo3DComfyService,
	Tripo3DStoreLike,
	BuildTripo3DRequestPayloadFn
} from './types'

export const useAIWorkflowTripo3DCommands = (options: {
	store: Tripo3DStoreLike
	getComfyService: () => Tripo3DComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	stopTripo3DPoll: (nodeId: string) => void
	startTripo3DPoll: (nodeId: string, taskId: string, mode: string) => void
	buildTripo3DRequestPayload: BuildTripo3DRequestPayloadFn
	normalizeTripo3DTaskStatus: (status: unknown) => string
	refreshTripo3DTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshTripo3DTaskItems: () => boolean
}) => {
	const onNodeGenerateTripo3D = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		const prepared = await options.buildTripo3DRequestPayload(node)
		if (!prepared.ok) {
			options.pushToast(prepared.error, 'warn')
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: {
					tripo3dTaskStatus: 'failed',
					tripo3dErrorMessage: prepared.error,
					tripo3dStatusText: prepared.error
				}
			})
			return
		}

		options.stopTripo3DPoll(nodeId)
		options.store.commit('setNodeTripo3DSettings', {
			nodeId,
			tripo3dSettings: {
				tripo3dTaskStatus: 'pending',
				tripo3dProgress: 0,
				tripo3dErrorMessage: '',
				tripo3dStatusText: t('tasks.tripo3d.creatingTask')
			}
		})

		try {
			const res = await options.getComfyService().tripo3dGenerate(prepared.payload)
			if (!res.ok) {
				const msg = String(res.error ?? t('tasks.tripo3d.createTaskFailed'))
				options.store.commit('setNodeTripo3DSettings', {
					nodeId,
					tripo3dSettings: {
						tripo3dTaskStatus: 'failed',
						tripo3dErrorMessage: msg,
						tripo3dStatusText: msg
					}
				})
				options.pushToast(msg, 'warn')
				return
			}

			const taskStatus = options.normalizeTripo3DTaskStatus(res.status)
			const taskId = String(res.taskId ?? '').trim()
			const mode = String(res.mode ?? prepared.payload.mode ?? 'text_to_model').trim()
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: {
					tripo3dTaskId: taskId,
					tripo3dTaskStatus: taskStatus === 'idle' ? 'pending' : taskStatus,
					tripo3dProgress: taskStatus === 'running' ? 5 : 0,
					tripo3dStatusText: t('tasks.tripo3d.taskCreatedPolling')
				}
			})
			if (options.shouldRefreshTripo3DTaskItems()) {
				void options.refreshTripo3DTaskItems({ silent: true })
			}
			if (!taskId) {
				options.pushToast(t('tasks.tripo3d.missingTaskIdToast'), 'warn')
				return
			}
			options.startTripo3DPoll(nodeId, taskId, mode)
		} catch (err: unknown) {
			const msg = t('tasks.tripo3d.createTaskException', { error: getErrorMessage(err) })
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: {
					tripo3dTaskStatus: 'failed',
					tripo3dErrorMessage: msg,
					tripo3dStatusText: msg
				}
			})
			options.pushToast(msg, 'warn')
		}
	}

	const onNodeRestartTripo3DTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		const nodeRecord = node as unknown as Record<string, unknown>
		const settings = isRecord(nodeRecord.tripo3dSettings) ? nodeRecord.tripo3dSettings : {}
		const status = String(settings.tripo3dTaskStatus ?? '').trim()
		if (status === 'pending' || status === 'queued' || status === 'running') {
			options.pushToast(t('tasks.tripo3d.taskRunningCannotRestart'), 'warn')
			return
		}

		options.stopTripo3DPoll(nodeId)

		options.store.commit('setNodeTripo3DSettings', {
			nodeId,
			tripo3dSettings: {
				tripo3dTaskId: '',
				tripo3dTaskStatus: 'idle',
				tripo3dProgress: 0,
				tripo3dErrorMessage: '',
				tripo3dStatusText: t('tasks.tripo3d.resetToNewTask'),
				tripo3dThumbnailUrl: '',
				tripo3dModelUrl: ''
			}
		})

		await onNodeGenerateTripo3D(nodeId)
	}

	return {
		onNodeGenerateTripo3D,
		onNodeRestartTripo3DTask
	}
}
