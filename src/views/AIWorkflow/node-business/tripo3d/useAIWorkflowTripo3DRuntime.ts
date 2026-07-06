import { isNumber, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	Tripo3DComfyService,
	Tripo3DStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'
import { extractTripo3DTaskResultFields } from './types'

type WorkflowNodeLike = {
	id: string
	type: string
	alias?: string
	title?: string
	imageSettings?: Record<string, unknown>
	model3dSettings?: Record<string, unknown>
	tripo3dSettings?: Record<string, unknown>
	resourceId?: string | null
	createdAt?: number
	[key: string]: unknown
}

export const useAIWorkflowTripo3DRuntime = (options: {
	store: Tripo3DStoreLike
	getComfyService: () => Tripo3DComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	normalizeTripo3DTaskStatus: (raw: unknown) => string
	pickTripo3DPreferredModelUrl: (urls: Record<string, string> | null | undefined) => string
	fileExtensionFromUrl: (url: string, fallbackExt: string) => string
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<unknown>
	refreshTripo3DTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshTripo3DTaskItems: () => boolean
}) => {
	const normalizeText = (value: unknown) => String(value ?? '').trim()

	const tripo3dPollTimers = new Map<string, number>()
	const tripo3dPollErrorCounts = new Map<string, number>()
	const tripo3dTerminalNotified = new Set<string>()

	const stopTripo3DPoll = (nodeId: string) => {
		const timer = tripo3dPollTimers.get(nodeId)
		if (timer != null) {
			window.clearInterval(timer)
			tripo3dPollTimers.delete(nodeId)
		}
		tripo3dPollErrorCounts.delete(nodeId)
	}

	const getNodeFromStore = (nodeId: string): WorkflowNodeLike | null => {
		const node = options.store.state.nodesById[nodeId]
		return (node as unknown as WorkflowNodeLike) ?? null
	}

	const getTripo3DSettings = (n: WorkflowNodeLike | null | undefined): Record<string, unknown> => {
		if (!n) return {}
		if (n.type === 'model3d') {
			const m3dSettings = isRecord(n.model3dSettings) ? n.model3dSettings : {}
			return isRecord(m3dSettings.tripo3dModelSettings) ? m3dSettings.tripo3dModelSettings as Record<string, unknown> : {}
		}
		return isRecord(n.tripo3dSettings) ? n.tripo3dSettings as Record<string, unknown> : {}
	}

	const applyTripo3DTaskResult = async (nodeId: string, taskRaw: unknown) => {
		const task = extractTripo3DTaskResultFields(taskRaw)
		const normalized = options.normalizeTripo3DTaskStatus(task.status)
		const node = getNodeFromStore(nodeId)
		if (!node) return normalized

		const existingSettings = getTripo3DSettings(node)
		const modelUrl = task.modelUrl
		const thumbnailUrl = task.thumbnailUrl
		const statusText = task.statusText
		const errorMessage = task.errorMessage
		const rawProgress = task.progress
		const finalProgress = normalized === 'succeeded' ? 100 : Math.max(0, Math.min(100, rawProgress))

		const patch: Record<string, unknown> = {
			tripo3dTaskId: task.taskId,
			tripo3dRelationKind: String(existingSettings.tripo3dRelationKind ?? 'model').trim() || 'model',
			tripo3dRootTaskId: String(existingSettings.tripo3dRootTaskId ?? task.taskId ?? '').trim() || undefined,
			tripo3dParentTaskId: String(existingSettings.tripo3dParentTaskId ?? '').trim() || undefined,
			tripo3dTaskStatus: normalized,
			tripo3dProgress: finalProgress,
			tripo3dStatusText: statusText,
			tripo3dThumbnailUrl: thumbnailUrl || undefined,
			tripo3dModelUrl: modelUrl || undefined,
			tripo3dErrorMessage: errorMessage,
			tripo3dOutputSummary: {
				outputKind: '3d-model',
				preferredUrl: modelUrl || undefined,
				thumbnailUrl: thumbnailUrl || undefined,
				format: 'glb',
				assetUrl: modelUrl || undefined
			},
			tripo3dRelationSummary: {
				...(isRecord(existingSettings.tripo3dRelationSummary) ? existingSettings.tripo3dRelationSummary as Record<string, unknown> : {}),
				relationKind: String(existingSettings.tripo3dRelationKind ?? 'model').trim() || 'model',
				rootTaskId: String(existingSettings.tripo3dRootTaskId ?? task.taskId ?? '').trim() || undefined,
				parentTaskId: String(existingSettings.tripo3dParentTaskId ?? '').trim() || undefined,
				effectiveTaskId: task.taskId || undefined,
				effectiveRelationKind: String(existingSettings.tripo3dRelationKind ?? 'model').trim() || 'model',
				effectiveStatus: normalized,
				effectiveProgress: task.progress,
				effectiveModelUrl: modelUrl || undefined,
				effectiveLocalAssetUrl: String(existingSettings.tripo3dOutputAssetUrl ?? '').trim() || undefined,
				effectiveLocalAssetPath: String(existingSettings.tripo3dOutputAssetPath ?? '').trim() || undefined,
				effectiveThumbnailUrl: thumbnailUrl || undefined
			}
		}

		if (normalized === 'succeeded' && modelUrl) {
			try {
				const fileName = `tripo3d_${task.taskId || nodeId}.glb`
				const persisted = await options.persistExternalAssetToProject({
					kind: 'file',
					name: fileName,
					sourceUrl: modelUrl
				})
				patch.tripo3dOutputAssetUrl = String(persisted?.url || modelUrl)
				patch.tripo3dOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined

				if (!thumbnailUrl) {
					try {
						const thumbName = `tripo3d_${task.taskId || nodeId}_preview.png`
						if (thumbnailUrl) {
							const persistedThumb = await options.persistExternalAssetToProject({
								kind: 'image',
								name: thumbName,
								sourceUrl: thumbnailUrl
							})
							const localThumb = String(persistedThumb?.url || '').trim()
							if (localThumb) {
								patch.tripo3dThumbnailUrl = localThumb
							}
						}
					} catch {
					}
				}

				patch.tripo3dOutputSummary = {
					...(isRecord(patch.tripo3dOutputSummary) ? patch.tripo3dOutputSummary as Record<string, unknown> : {}),
					outputKind: '3d-model',
					preferredUrl: modelUrl,
					assetUrl: String(persisted?.url || modelUrl),
					assetPath: String(persisted?.absolutePath || '').trim() || undefined,
					thumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
					format: 'glb'
				}
				patch.tripo3dRelationSummary = {
					...(isRecord(patch.tripo3dRelationSummary) ? patch.tripo3dRelationSummary as Record<string, unknown> : {}),
					effectiveLocalAssetUrl: String(persisted?.url || modelUrl),
					effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
					effectiveThumbnailUrl: patch.tripo3dThumbnailUrl || undefined
				}

				if (node.type === 'model3d' && persisted?.url) {
					const resourceId = `tripo3d-model-${task.taskId || nodeId}-${Date.now()}`
					const resourceName = `tripo3d_model_${resourceId.slice(-8)}`

					const resourceBase = {
						id: resourceId,
						kind: 'model3d',
						name: resourceName,
						url: String(persisted.url || modelUrl),
						sourcePath: String(persisted.absolutePath || '').trim() || undefined,
						projectRelativePath: String(persisted.projectRelativePath || '').trim() || undefined,
						posterUrl: patch.tripo3dThumbnailUrl as string | undefined,
						createdAt: Date.now()
					}

					const state = options.store.state as unknown as Record<string, unknown>
					const resourcesById = isRecord(state.resourcesById) ? state.resourcesById : {}
					const existingResource =
						resourcesById[resourceId] ||
						(Array.isArray(state.resources) &&
							(state.resources as Array<{ id: string }>).find((r) => r.id === resourceId))
					if (!existingResource) {
						options.store.commit('addResource', resourceBase)
					}

					options.store.commit('setNodeResource', { nodeId, resourceId })
				}
			} catch (e: unknown) {
				console.error('[Tripo3D Runtime] 产物下载/绑定失败，状态仍标记为成功:', e)
				if (!patch.tripo3dOutputAssetUrl) {
					patch.tripo3dOutputAssetUrl = modelUrl
					patch.tripo3dOutputSummary = {
						...(isRecord(patch.tripo3dOutputSummary) ? patch.tripo3dOutputSummary as Record<string, unknown> : {}),
						outputKind: '3d-model',
						preferredUrl: modelUrl,
						assetUrl: modelUrl,
						thumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
						format: 'glb'
					}
					patch.tripo3dRelationSummary = {
						...(isRecord(patch.tripo3dRelationSummary) ? patch.tripo3dRelationSummary as Record<string, unknown> : {}),
						effectiveLocalAssetUrl: modelUrl,
						effectiveThumbnailUrl: patch.tripo3dThumbnailUrl || undefined
					}
				}
			}
		}

		const targetNode = getNodeFromStore(nodeId)
		if (targetNode?.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					tripo3dModelSettings: patch
				}
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', { nodeId, tripo3dSettings: patch })
		}
		if (options.shouldRefreshTripo3DTaskItems()) {
			try {
				void options.refreshTripo3DTaskItems({ silent: true })
			} catch (e: unknown) {
				console.warn('[Tripo3D Runtime] 刷新任务列表失败:', e)
			}
		}
		if (normalized === 'succeeded') {
			try {
				if (modelUrl) {
					await options.syncConnectedModel3DTargets(nodeId)
				}
			} catch (e: unknown) {
				console.warn('[Tripo3D Runtime] 同步下游节点失败，不影响任务状态:', e)
			}
		}
		return normalized
	}

	const getNodeTripo3DTaskStatus = (node: WorkflowNodeLike | null): string => {
		if (!node) return 'idle'
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
				? m3dSettings.tripo3dModelSettings as Record<string, unknown>
				: {}
			return String(tripo3dM3d.tripo3dTaskStatus ?? 'idle').trim()
		}
		const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
		return String(tripo3dSettings.tripo3dTaskStatus ?? 'idle').trim()
	}

	const commitTripo3DTaskFailed = (nid: string, node: WorkflowNodeLike | null, msg: string) => {
		const patch: Record<string, unknown> = {
			tripo3dTaskStatus: 'failed',
			tripo3dStatusText: msg,
			tripo3dErrorMessage: ''
		}
		if (node?.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId: nid,
				model3dSettings: { tripo3dModelSettings: patch }
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', {
				nodeId: nid,
				tripo3dSettings: { tripo3dTaskStatus: 'failed', tripo3dStatusText: msg, tripo3dErrorMessage: '' }
			})
		}
	}

	const getNodeTripo3DTaskId = (node: WorkflowNodeLike | null): string => {
		if (!node) return ''
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
				? m3dSettings.tripo3dModelSettings as Record<string, unknown>
				: {}
			return String(tripo3dM3d.tripo3dTaskId ?? '').trim()
		}
		const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
		return String(tripo3dSettings.tripo3dTaskId ?? '').trim()
	}

	const getNodeTripo3DTaskFamily = (node: WorkflowNodeLike | null): string => {
		if (!node) return ''
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
				? m3dSettings.tripo3dModelSettings as Record<string, unknown>
				: {}
			return String(tripo3dM3d.tripo3dTaskFamily ?? 'text_to_model').trim()
		}
		const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
		return String(tripo3dSettings.tripo3dTaskFamily ?? '').trim()
	}

	const startTripo3DPoll = (nodeId: string, taskId: string) => {
		stopTripo3DPoll(nodeId)
		tripo3dTerminalNotified.delete(nodeId)
		tripo3dPollErrorCounts.delete(nodeId)

		const tick = async () => {
			const currentNode = getNodeFromStore(nodeId)
			if (!currentNode) {
				stopTripo3DPoll(nodeId)
				return
			}
			const currentStatus = getNodeTripo3DTaskStatus(currentNode)
			if (
				currentStatus === 'succeeded' ||
				currentStatus === 'success' ||
				currentStatus === 'failed' ||
				currentStatus === 'cancelled' ||
				currentStatus === 'canceled'
			) {
				stopTripo3DPoll(nodeId)
				return
			}

			try {
				const res = await options.getComfyService().tripo3dTask(taskId)
				if (!res.ok) {
					const nextCount = Number(tripo3dPollErrorCounts.get(nodeId) ?? 0) + 1
					tripo3dPollErrorCounts.set(nodeId, nextCount)
					if (nextCount >= 4) {
						stopTripo3DPoll(nodeId)
						commitTripo3DTaskFailed(nodeId, currentNode, t('tasks.tripo3d.pollStatusFailedConsecutive'))
						options.pushToast(t('tasks.tripo3d.pollStatusFailedConsecutiveToast'), 'warn')
					}
					return
				}

				tripo3dPollErrorCounts.delete(nodeId)
				const finalStatus = await applyTripo3DTaskResult(nodeId, res)
				if (finalStatus === 'succeeded' || finalStatus === 'success' || finalStatus === 'failed' || finalStatus === 'cancelled' || finalStatus === 'canceled') {
					if (!tripo3dTerminalNotified.has(nodeId)) {
						tripo3dTerminalNotified.add(nodeId)
						if (finalStatus === 'succeeded' || finalStatus === 'success') {
							options.pushToast(t('tasks.tripo3d.model3dTaskCompleted'), 'info')
						} else if (finalStatus === 'failed') {
							options.pushToast(t('tasks.tripo3d.model3dTaskFailed'), 'warn')
						} else {
							options.pushToast(t('tasks.tripo3d.taskCanceled'), 'warn')
						}
					}
					stopTripo3DPoll(nodeId)
				}
			} catch (err: unknown) {
				const nextCount = Number(tripo3dPollErrorCounts.get(nodeId) ?? 0) + 1
				tripo3dPollErrorCounts.set(nodeId, nextCount)
				if (nextCount >= 4) {
					stopTripo3DPoll(nodeId)
					const currentNodeForFail = getNodeFromStore(nodeId)
					commitTripo3DTaskFailed(nodeId, currentNodeForFail, t('tasks.tripo3d.pollStatusException'))
					options.pushToast(t('tasks.tripo3d.pollStatusExceptionToast'), 'warn')
				}
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), 2000)
		tripo3dPollTimers.set(nodeId, timer)
	}

	const recoverTripo3DTaskStates = async (opts?: { silent?: boolean }) => {
		const tripo3dNodes: WorkflowNodeLike[] = []
		for (const id of options.store.state.nodeOrder) {
			const n = options.store.state.nodesById[id] as WorkflowNodeLike | undefined
			if (n && n.type === 'model3d') {
				const status = getNodeTripo3DTaskStatus(n)
				if (status === 'pending' || status === 'running' || status === 'queued') {
					tripo3dNodes.push(n)
				}
			}
		}

		for (const node of tripo3dNodes) {
			const nodeId = node.id as string
			const taskId = getNodeTripo3DTaskId(node)
			if (!taskId) {
				commitTripo3DTaskFailed(nodeId, node, t('tasks.tripo3d.taskIdLostCannotRecover'))
				continue
			}

			try {
				const res = await options.getComfyService().tripo3dTask(taskId)
				if (!res.ok) {
					if (!opts?.silent) {
						options.pushToast(t('aiworkflow.toast.tripo3dQueryFailed', { name: node.alias || node.title || nodeId }), 'warn')
					}
					continue
				}

				const finalStatus = await applyTripo3DTaskResult(nodeId, res)
				if (finalStatus === 'pending' || finalStatus === 'running' || finalStatus === 'queued') {
					startTripo3DPoll(nodeId, taskId)
				}
			} catch {
				if (!opts?.silent) {
					options.pushToast(t('aiworkflow.toast.tripo3dResumeFailed', { name: node.alias || node.title || nodeId }), 'warn')
				}
			}
		}
	}

	const clearTripo3DRuntime = () => {
		for (const timer of tripo3dPollTimers.values()) window.clearInterval(timer)
		tripo3dPollTimers.clear()
		tripo3dPollErrorCounts.clear()
		tripo3dTerminalNotified.clear()
	}

	return {
		stopTripo3DPoll,
		applyTripo3DTaskResult,
		startTripo3DPoll,
		recoverTripo3DTaskStates,
		clearTripo3DRuntime
	}
}
