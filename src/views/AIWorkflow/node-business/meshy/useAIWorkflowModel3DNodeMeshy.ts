import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	BuildMeshyRequestResult,
	MeshyComfyService,
	MeshyRelationKind,
	MeshyTaskStatus
} from './types'
import { extractMeshyTaskResultFields } from './types'

type Meshy3DTaskMode =
	| 'text-to-3d'
	| 'image-to-3d'
	| 'multi-image-to-3d'
	| 'retexture'
	| 'remesh'
	| 'uv-unwrap'

type Meshy3DSettings = {
	meshyTaskTarget?: string
	meshyTaskFamily?: string
	meshyTaskId?: string
	meshyTaskStatus?: MeshyTaskStatus
	meshyProgress?: number
	meshyStatusText?: string
	meshyErrorMessage?: string
	meshyPrompt?: string
	meshyNegativePrompt?: string
	meshyImageUrl?: string
	meshyImageUrls?: string[]
	meshyTexturePrompt?: string
	meshyTextureImageUrl?: string
	meshyAiModel?: string
	meshyModelType?: string
	meshyTopology?: string
	meshyTargetPolycount?: number
	meshySymmetryMode?: string
	meshyShouldRemesh?: boolean
	meshySavePreRemeshedModel?: boolean
	meshyShouldTexture?: boolean
	meshyEnablePbr?: boolean
	meshyAspectRatio?: string
	meshyPoseMode?: string
	meshyAutoSize?: boolean
	meshyOriginAt?: string
	meshySeed?: number
	meshyModeration?: boolean
	meshyImageEnhancement?: boolean
	meshyRemoveLighting?: boolean
	meshyTargetFormats?: string[]
	meshyCapabilities?: MeshyRelationKind[]
	meshyPreviewTaskId?: string
	meshyRootTaskId?: string
	meshyParentTaskId?: string
	meshyRelationKind?: MeshyRelationKind
	meshyRelationSummary?: {
		relationKind?: MeshyRelationKind
		rootTaskId?: string
		parentTaskId?: string
		effectiveTaskId?: string
		effectiveRelationKind?: MeshyRelationKind
		effectiveStatus?: string
		effectiveProgress?: number
		effectivePreferredModelUrl?: string
		effectivePreferredImageUrl?: string
		effectiveLocalAssetUrl?: string
		effectiveLocalAssetPath?: string
		effectiveThumbnailUrl?: string
	}
	meshyOutputSummary?: {
		outputKind?: string
		preferredUrl?: string
		imageUrls?: string[]
		thumbnailUrl?: string
		format?: string
		assetUrl?: string
		assetPath?: string
	}
	meshyModelUrls?: Record<string, string>
	meshyThumbnailUrl?: string
	meshyOutputAssetUrl?: string
	meshyOutputAssetPath?: string
	meshyInputSummary?: {
		promptSource?: string
		promptText?: string
		imageCount?: number
		modelInputConnected?: boolean
		lastValidatedAt?: number
	}
}

type ConnectedMeshyImageInput = {
	edge: WorkflowEdge
	fromNode: WorkflowNode
	fromAnchorId: string
	url: string
}

type ConnectedMeshyModelInput = {
	inputTaskId?: string
	modelUrl: string
	sourceName?: string
} | null

export type UseAIWorkflowModel3DNodeMeshyOptions = {
	updateNodeSettings: (nodeId: string, settings: Partial<Meshy3DSettings>) => void
	getNodeSettings: (nodeId: string) => Meshy3DSettings | null
	getNode: (nodeId: string) => WorkflowNode | null

	buildMeshyRequestPayload: (node: WorkflowNode) => Promise<BuildMeshyRequestResult>

	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void

	connectedMeshyPrompt: (nodeId: string) => string
	connectedMeshyImageInputs: (nodeId: string) => ConnectedMeshyImageInput[]
	connectedMeshyModelInput: (nodeId: string) => Promise<ConnectedMeshyModelInput>
	buildMeshyImageInputFromNode: (fromNode: WorkflowNode, fromAnchorId: string) => Promise<string>
	normalizeMeshyImageInputValue: (rawValue: string, label: string) => Promise<string>
	hasConnectedMeshyConsumer: (node: WorkflowNode) => boolean
	missingMeshyImageOutputAnchors: (node: WorkflowNode) => string[]
	meshyImageOutputCount: (settings: unknown) => number
	hasIncomingEdge: (nodeId: string, anchorId: string) => boolean

	normalizeMeshyTaskStatus: (status: unknown) => string
	pickMeshyPreferredModelUrl: (urls: Record<string, string> | null | undefined) => string
	pickMeshyPreferredFormat: (urls: Record<string, string> | null | undefined) => 'glb' | 'gltf'
	fileExtensionFromUrl: (url: string, fallbackExt: string) => string
	persistExternalAssetToProject: (payload: {
		kind: 'image' | 'file'
		name: string
		sourceUrl?: string
		sourcePath?: string
	}) => Promise<{ url: string; absolutePath: string } | null>
	syncConnectedImageTargetsFromMeshy: (nodeId: string) => Promise<unknown>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<unknown>
	refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshMeshyTaskItems: () => boolean

	getComfyService: () => MeshyComfyService
}

const MESHY_POLL_INTERVAL = 1600
const MESHY_MAX_POLL_ERRORS = 4

export const useAIWorkflowModel3DNodeMeshy = (options: UseAIWorkflowModel3DNodeMeshyOptions) => {
	const pollTimers = new Map<string, number>()
	const pollErrorCounts = new Map<string, number>()
	const terminalNotified = new Set<string>()

	const normalizeText = (value: unknown) => String(value ?? '').trim()

	const isMeshyRemoteUrl = (value: unknown) => {
		const text = normalizeText(value)
		if (!text) return false
		try {
			const url = new URL(text)
			return /(^|\.)meshy\.ai$/i.test(url.hostname)
		} catch {
			return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(text)
		}
	}

	const pickLocalThumbnailCandidate = (...values: unknown[]) => {
		for (const raw of values) {
			const text = normalizeText(raw)
			if (!text) continue
			if (isMeshyRemoteUrl(text)) continue
			return text
		}
		return ''
	}

	const stopPoll = (nodeId: string) => {
		const timer = pollTimers.get(nodeId)
		if (timer != null) {
			window.clearInterval(timer)
			pollTimers.delete(nodeId)
		}
		pollErrorCounts.delete(nodeId)
	}

	const applyMeshyTaskResult = async (nodeId: string, taskRaw: unknown) => {
		const task = extractMeshyTaskResultFields(taskRaw)
		const normalized = options.normalizeMeshyTaskStatus(task.status)
		const node = options.getNode(nodeId)
		if (!node) return normalized

		const settings = options.getNodeSettings(nodeId) ?? {}
		const target = String(settings.meshyTaskTarget ?? '3d').trim() || '3d'
		const is3DTarget = target === '3d'

		const modelUrls = task.modelUrls
		const imageUrls = task.imageUrls
		const preferredImageUrl = task.preferredImageUrl || (imageUrls[0] ?? '')
		const preferredModelUrl =
			task.preferredModelUrl || options.pickMeshyPreferredModelUrl(modelUrls)
		const thumbnailUrl = task.thumbnailUrl
		const statusText = task.statusText
		const errorMessage = task.errorMessage
		const format = options.pickMeshyPreferredFormat(modelUrls)

		const existingLocalThumbnailUrl = pickLocalThumbnailCandidate(
			settings.meshyRelationSummary?.effectiveThumbnailUrl,
			settings.meshyOutputSummary?.thumbnailUrl,
			settings.meshyThumbnailUrl
		)
		let resolvedThumbnailUrl = is3DTarget
			? existingLocalThumbnailUrl
			: thumbnailUrl || existingLocalThumbnailUrl

		const patch: Partial<Meshy3DSettings> = {
			meshyTaskId: task.taskId,
			meshyRelationKind: (String(settings.meshyRelationKind ?? 'model').trim() ||
				'model') as MeshyRelationKind,
			meshyRootTaskId: String(settings.meshyRootTaskId ?? task.taskId ?? '').trim() || undefined,
			meshyParentTaskId: String(settings.meshyParentTaskId ?? '').trim() || undefined,
			meshyCapabilities: settings.meshyCapabilities ?? undefined,
			meshyTaskStatus: normalized as MeshyTaskStatus,
			meshyProgress: task.progress,
			meshyStatusText: statusText,
			meshyThumbnailUrl: resolvedThumbnailUrl || undefined,
			meshyModelUrls: modelUrls,
			meshyErrorMessage: errorMessage,
			meshyOutputSummary: {
				...(settings.meshyOutputSummary ?? {}),
				outputKind: is3DTarget ? '3d-model' : 'image',
				preferredUrl:
					(is3DTarget ? preferredModelUrl : preferredImageUrl || preferredModelUrl) || undefined,
				imageUrls: is3DTarget ? undefined : imageUrls.slice(0, 4),
				thumbnailUrl: resolvedThumbnailUrl || undefined,
				format: is3DTarget ? format : undefined
			},
			meshyRelationSummary: {
				...(settings.meshyRelationSummary ?? {}),
				relationKind: (String(settings.meshyRelationKind ?? 'model').trim() ||
					'model') as MeshyRelationKind,
				rootTaskId: String(settings.meshyRootTaskId ?? task.taskId ?? '').trim() || undefined,
				parentTaskId: String(settings.meshyParentTaskId ?? '').trim() || undefined,
				effectiveTaskId: task.taskId || undefined,
				effectiveRelationKind: (String(settings.meshyRelationKind ?? 'model').trim() ||
					'model') as MeshyRelationKind,
				effectiveStatus: normalized,
				effectiveProgress: task.progress,
				effectivePreferredModelUrl: preferredModelUrl || undefined,
				effectivePreferredImageUrl: preferredImageUrl || undefined,
				effectiveLocalAssetUrl: String(settings.meshyOutputAssetUrl ?? '').trim() || undefined,
				effectiveLocalAssetPath: String(settings.meshyOutputAssetPath ?? '').trim() || undefined,
				effectiveThumbnailUrl: resolvedThumbnailUrl || undefined
			}
		}

		if (normalized === 'succeeded') {
			if (is3DTarget && preferredModelUrl) {
				const fileName = `meshy_${task.taskId || nodeId}.${format}`
				const persisted = await options.persistExternalAssetToProject({
					kind: 'file',
					name: fileName,
					sourceUrl: preferredModelUrl,
					sourcePath: task.sourceModelUrl || undefined
				})
				patch.meshyOutputAssetUrl = String(persisted?.url || preferredModelUrl)
				patch.meshyOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined

				if (!resolvedThumbnailUrl && thumbnailUrl) {
					try {
						const thumbName = `meshy_${task.taskId || nodeId}_preview${options.fileExtensionFromUrl(thumbnailUrl, '.png')}`
						const persistedThumb = await options.persistExternalAssetToProject({
							kind: 'image',
							name: thumbName,
							sourceUrl: thumbnailUrl
						})
						const localThumb = String(persistedThumb?.url || '').trim()
						if (localThumb) {
							resolvedThumbnailUrl = localThumb
						}
					} catch {
						// Ignore thumbnail persistence errors
					}
				}

				patch.meshyOutputSummary = {
					...(patch.meshyOutputSummary ?? {}),
					outputKind: '3d-model',
					preferredUrl: preferredModelUrl,
					imageUrls: undefined,
					assetUrl: String(persisted?.url || preferredModelUrl),
					assetPath: String(persisted?.absolutePath || '').trim() || undefined,
					thumbnailUrl: resolvedThumbnailUrl || undefined,
					format
				}
				patch.meshyRelationSummary = {
					...(patch.meshyRelationSummary ?? {}),
					effectiveLocalAssetUrl: String(persisted?.url || preferredModelUrl),
					effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
					effectiveThumbnailUrl: resolvedThumbnailUrl || undefined
				}
				patch.meshyThumbnailUrl = resolvedThumbnailUrl || undefined
			}
		}

		options.updateNodeSettings(nodeId, patch)

		if (options.shouldRefreshMeshyTaskItems()) {
			void options.refreshMeshyTaskItems({ silent: true })
		}

		if (normalized === 'succeeded') {
			if (is3DTarget && (preferredModelUrl || String(patch.meshyOutputAssetUrl ?? '').trim())) {
				await options.syncConnectedModel3DTargets(nodeId)
			}
		}

		return normalized
	}

	const startPoll = (nodeId: string, taskId: string, mode: string) => {
		stopPoll(nodeId)
		terminalNotified.delete(nodeId)
		pollErrorCounts.delete(nodeId)

		const tick = async () => {
			const node = options.getNode(nodeId)
			if (!node) {
				stopPoll(nodeId)
				return
			}

			const currentStatus = String(options.getNodeSettings(nodeId)?.meshyTaskStatus ?? 'idle')
			if (
				currentStatus === 'succeeded' ||
				currentStatus === 'failed' ||
				currentStatus === 'canceled'
			) {
				stopPoll(nodeId)
				return
			}

			try {
				const res = await options.getComfyService().meshyTask(taskId, mode)
				if (!res.ok) {
					const nextCount = Number(pollErrorCounts.get(nodeId) ?? 0) + 1
					pollErrorCounts.set(nodeId, nextCount)
					if (nextCount >= MESHY_MAX_POLL_ERRORS) {
						stopPoll(nodeId)
						options.updateNodeSettings(nodeId, {
							meshyTaskStatus: 'failed',
							meshyStatusText: t('tasks.meshy.pollStatusFailedConsecutive'),
							meshyErrorMessage: String(res.error ?? 'unknown')
						})
						options.pushToast(t('tasks.meshy.pollStatusFailedConsecutiveToast'), 'warn')
					}
					return
				}

				pollErrorCounts.delete(nodeId)
				const finalStatus = await applyMeshyTaskResult(nodeId, res)
				if (finalStatus === 'succeeded' || finalStatus === 'failed' || finalStatus === 'canceled') {
					if (!terminalNotified.has(nodeId)) {
						terminalNotified.add(nodeId)
						if (finalStatus === 'succeeded') {
							options.pushToast(t('tasks.meshy.model3dTaskCompleted'), 'info')
						} else if (finalStatus === 'failed') {
							options.pushToast(t('tasks.meshy.model3dTaskFailed'), 'warn')
						} else {
							options.pushToast(t('tasks.meshy.taskCanceled'), 'warn')
						}
					}
					stopPoll(nodeId)
				}
			} catch (err: unknown) {
				const nextCount = Number(pollErrorCounts.get(nodeId) ?? 0) + 1
				pollErrorCounts.set(nodeId, nextCount)
				if (nextCount >= MESHY_MAX_POLL_ERRORS) {
					stopPoll(nodeId)
					options.updateNodeSettings(nodeId, {
						meshyTaskStatus: 'failed',
						meshyStatusText: t('tasks.meshy.pollStatusException'),
						meshyErrorMessage: getErrorMessage(err)
					})
					options.pushToast(t('tasks.meshy.pollStatusExceptionToast'), 'warn')
				}
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), MESHY_POLL_INTERVAL)
		pollTimers.set(nodeId, timer)
	}

	const startGeneration = async (nodeId: string) => {
		const node = options.getNode(nodeId)
		if (!node) return

		const prepared = await options.buildMeshyRequestPayload(node)
		if (!prepared.ok) {
			options.pushToast(prepared.error ?? t('aiworkflow.toast.meshyRequestBuildFailed'), 'warn')
			options.updateNodeSettings(nodeId, {
				meshyTaskStatus: 'failed',
				meshyErrorMessage: prepared.error,
				meshyStatusText: prepared.error
			})
			return
		}

		stopPoll(nodeId)
		options.updateNodeSettings(nodeId, {
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
		})

		try {
			const res = await options.getComfyService().meshyGenerate(prepared.payload)
			if (!res.ok) {
				const msg = String(res.error ?? t('tasks.meshy.createTaskFailed'))
				options.updateNodeSettings(nodeId, {
					meshyTaskStatus: 'failed',
					meshyErrorMessage: msg,
					meshyStatusText: msg
				})
				options.pushToast(msg, 'warn')
				return
			}

			const taskStatus = options.normalizeMeshyTaskStatus(res.status)
			const taskId = String(res.taskId ?? '').trim()
			const mode = String(res.mode ?? prepared.payload.mode ?? 'text-to-3d').trim()

			options.updateNodeSettings(nodeId, {
				meshyTaskId: taskId,
				meshyTaskStatus: taskStatus === 'idle' ? 'pending' : (taskStatus as MeshyTaskStatus),
				meshyProgress: taskStatus === 'running' ? 5 : 0,
				meshyStatusText: t('tasks.meshy.taskCreatedPolling')
			})

			if (options.shouldRefreshMeshyTaskItems()) {
				void options.refreshMeshyTaskItems({ silent: true })
			}

			if (!taskId) {
				options.pushToast(t('tasks.meshy.missingTaskIdToast'), 'warn')
				return
			}

			startPoll(nodeId, taskId, mode)
		} catch (err: unknown) {
			const msg = t('tasks.meshy.createTaskException', { error: getErrorMessage(err) })
			options.updateNodeSettings(nodeId, {
				meshyTaskStatus: 'failed',
				meshyErrorMessage: msg,
				meshyStatusText: msg
			})
			options.pushToast(msg, 'warn')
		}
	}

	const startRetexture = async (nodeId: string) => {
		const settings = options.getNodeSettings(nodeId)
		if (!settings) return

		const currentTaskId = String(
			settings.meshyRelationSummary?.effectiveTaskId ?? settings.meshyTaskId ?? ''
		).trim()
		const rootTaskId = String(
			settings.meshyRootTaskId ?? settings.meshyRelationSummary?.rootTaskId ?? currentTaskId
		).trim()

		if (!currentTaskId) {
			options.pushToast(t('tasks.meshy.noReusableTaskResult'), 'warn')
			return
		}

		const taskStatus = String(settings.meshyTaskStatus ?? '').trim()
		if (taskStatus === 'pending' || taskStatus === 'running') {
			options.pushToast(t('tasks.meshy.retextureTaskInProgressWait'), 'warn')
			return
		}

		options.updateNodeSettings(nodeId, {
			meshyTaskTarget: '3d',
			meshyTaskFamily: 'retexture',
			meshyRelationKind: 'texture',
			meshyRootTaskId: rootTaskId || currentTaskId,
			meshyParentTaskId: currentTaskId,
			meshyPreviewTaskId: currentTaskId,
			meshyRelationSummary: {
				...(settings.meshyRelationSummary ?? {}),
				relationKind: 'texture',
				rootTaskId: rootTaskId || currentTaskId,
				parentTaskId: currentTaskId
			}
		})

		await startGeneration(nodeId)
	}

	const refreshStatus = async (nodeId: string) => {
		const settings = options.getNodeSettings(nodeId)
		if (!settings) return

		const taskId = String(
			settings.meshyRelationSummary?.effectiveTaskId ?? settings.meshyTaskId ?? ''
		).trim()
		if (!taskId) {
			options.pushToast(t('tasks.meshy.noTaskInProgress'), 'warn')
			return
		}

		const mode = String(settings.meshyTaskFamily ?? 'text-to-3d').trim()

		try {
			const res = await options.getComfyService().meshyTask(taskId, mode)
			if (!res.ok) {
				options.pushToast(
					t('tasks.meshy.taskStatusRefreshFailed', { error: String(res.error ?? 'unknown') }),
					'warn'
				)
				return
			}
			await applyMeshyTaskResult(nodeId, res)
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.meshy.refreshTaskException', { error: getErrorMessage(err) }),
				'warn'
			)
		}
	}

	const stopTask = (nodeId: string) => {
		const node = options.getNode(nodeId)
		if (!node) return

		const status = String(options.getNodeSettings(nodeId)?.meshyTaskStatus ?? '').trim()
		if (status !== 'pending' && status !== 'running') {
			options.pushToast(t('tasks.meshy.noRunningTaskGeneric'), 'warn')
			return
		}

		stopPoll(nodeId)
		options.updateNodeSettings(nodeId, {
			meshyTaskStatus: 'canceled',
			meshyStatusText: t('tasks.meshy.taskStoppedGeneric')
		})
		options.pushToast(t('tasks.meshy.taskStoppedToast'), 'info')
	}

	const deleteTask = (nodeId: string) => {
		stopPoll(nodeId)
		terminalNotified.delete(nodeId)

		options.updateNodeSettings(nodeId, {
			meshyTaskId: '',
			meshyTaskStatus: 'idle',
			meshyProgress: 0,
			meshyErrorMessage: '',
			meshyStatusText: '',
			meshyPreviewTaskId: '',
			meshyRootTaskId: '',
			meshyParentTaskId: '',
			meshyModelUrls: {},
			meshyThumbnailUrl: '',
			meshyOutputAssetUrl: '',
			meshyOutputAssetPath: '',
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
		})
	}

	const clearAllRuntime = () => {
		for (const timer of pollTimers.values()) {
			window.clearInterval(timer)
		}
		pollTimers.clear()
		pollErrorCounts.clear()
		terminalNotified.clear()
	}

	return {
		startGeneration,
		startRetexture,
		refreshStatus,
		stopTask,
		deleteTask,
		stopPoll,
		startPoll,
		applyMeshyTaskResult,
		clearAllRuntime
	}
}
