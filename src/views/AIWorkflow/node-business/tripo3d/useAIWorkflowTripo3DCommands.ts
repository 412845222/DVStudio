import { t } from '../../../../i18n'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import type { Tripo3DComfyService, Tripo3DStoreLike, BuildTripo3DRequestPayloadFn } from './types'

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
	getProjectId?: () => number | string | null | undefined
	syncConnectedModel3DTargets?: (nodeId: string) => Promise<unknown> | void
}) => {
	const commitTripo3DNodeSettings = (nodeId: string, settingsPatch: Record<string, unknown>) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return
		if (node.type === 'model3d') {
			const existingM3d = isRecord(node.model3dSettings)
				? (node.model3dSettings as Record<string, unknown>)
				: {}
			const existingTripo = isRecord(existingM3d.tripo3dModelSettings)
				? (existingM3d.tripo3dModelSettings as Record<string, unknown>)
				: {}
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelGenerationSource: 'tripo3d',
					tripo3dModelSettings: {
						...existingTripo,
						...settingsPatch
					}
				}
			})
		} else if (node.type === 'image') {
			const imgPatch: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(settingsPatch)) {
				if (key.startsWith('tripo3d')) {
					const newKey = key.replace(/^tripo3d/, '')
					imgPatch[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = value
				}
			}
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { tripo3dImageSettings: imgPatch }
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: settingsPatch
			})
		}
	}

	const getNodeTripo3DSettings = (node: unknown): Record<string, unknown> => {
		const n = node as Record<string, unknown> | null | undefined
		if (!n) return {}
		if (n.type === 'model3d' && isRecord(n.model3dSettings)) {
			return isRecord(n.model3dSettings.tripo3dModelSettings)
				? n.model3dSettings.tripo3dModelSettings
				: {}
		}
		if (n.type === 'image' && isRecord(n.imageSettings)) {
			const imgSettings = isRecord(n.imageSettings.tripo3dImageSettings)
				? n.imageSettings.tripo3dImageSettings
				: {}
			const normalized: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(imgSettings)) {
				normalized[`tripo3d${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value
			}
			return normalized
		}
		return isRecord(n.tripo3dSettings) ? n.tripo3dSettings : {}
	}

	const onNodeGenerateTripo3D = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		const prepared = await options.buildTripo3DRequestPayload(node)
		if (!prepared.ok) {
			options.pushToast(prepared.error, 'warn')
			commitTripo3DNodeSettings(nodeId, {
				tripo3dTaskStatus: 'failed',
				tripo3dErrorMessage: prepared.error,
				tripo3dStatusText: prepared.error
			})
			return
		}

		options.stopTripo3DPoll(nodeId)
		commitTripo3DNodeSettings(nodeId, {
			tripo3dTaskStatus: 'pending',
			tripo3dProgress: 0,
			tripo3dErrorMessage: '',
			tripo3dStatusText: t('tasks.tripo3d.creatingTask')
		})

		try {
			const currentProjectId =
				typeof options.getProjectId === 'function' ? options.getProjectId() : null
			const requestPayload = {
				...prepared.payload,
				nodeId,
				projectId: currentProjectId ?? undefined
			}

			const res = await options.getComfyService().tripo3dGenerate(requestPayload)
			if (!res.ok) {
				const msg = String(res.error ?? t('tasks.tripo3d.createTaskFailed'))
				commitTripo3DNodeSettings(nodeId, {
					tripo3dTaskStatus: 'failed',
					tripo3dErrorMessage: msg,
					tripo3dStatusText: msg
				})
				options.pushToast(msg, 'warn')
				return
			}

			const taskStatus = options.normalizeTripo3DTaskStatus(res.status)
			const taskId = String(res.taskId ?? '').trim()
			const mode = String(res.mode ?? prepared.payload.mode ?? 'text_to_model').trim()
			commitTripo3DNodeSettings(nodeId, {
				tripo3dTaskId: taskId,
				tripo3dTaskStatus: taskStatus === 'idle' ? 'pending' : taskStatus,
				tripo3dProgress: taskStatus === 'running' ? 5 : 0,
				tripo3dStatusText: t('tasks.tripo3d.taskCreatedPolling'),
				tripo3dTaskFamily: mode
			})
			if (options.shouldRefreshTripo3DTaskItems()) {
				void options.refreshTripo3DTaskItems({ silent: true })
			}
			if (!taskId) {
				options.pushToast(t('tasks.tripo3d.missingTaskIdToast'), 'warn')
				return
			}
			if (typeof options.syncConnectedModel3DTargets === 'function') {
				void options.syncConnectedModel3DTargets(nodeId)
			}
			options.startTripo3DPoll(nodeId, taskId, mode)
		} catch (err: unknown) {
			const msg = t('tasks.tripo3d.createTaskException', { error: getErrorMessage(err) })
			commitTripo3DNodeSettings(nodeId, {
				tripo3dTaskStatus: 'failed',
				tripo3dErrorMessage: msg,
				tripo3dStatusText: msg
			})
			options.pushToast(msg, 'warn')
		}
	}

	const onNodeRestartTripo3DTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		const settings = getNodeTripo3DSettings(node)
		const status = String(settings.tripo3dTaskStatus ?? '').trim()
		if (status === 'pending' || status === 'queued' || status === 'running') {
			options.pushToast(t('tasks.tripo3d.taskRunningCannotRestart'), 'warn')
			return
		}

		options.stopTripo3DPoll(nodeId)

		commitTripo3DNodeSettings(nodeId, {
			tripo3dTaskId: '',
			tripo3dTaskStatus: 'idle',
			tripo3dProgress: 0,
			tripo3dErrorMessage: '',
			tripo3dStatusText: t('tasks.tripo3d.resetToNewTask'),
			tripo3dThumbnailUrl: '',
			tripo3dModelUrl: ''
		})

		await onNodeGenerateTripo3D(nodeId)
	}

	return {
		onNodeGenerateTripo3D,
		onNodeRestartTripo3DTask
	}
}
