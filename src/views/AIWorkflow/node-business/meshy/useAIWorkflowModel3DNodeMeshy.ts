import type { WorkflowNode } from '../../../../aiworkflow/types'

type Meshy3DTaskMode = 'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d' | 'retexture'

type Meshy3DTaskStatus = 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'

type Meshy3DSettings = {
	meshyTaskTarget?: string
	meshyTaskFamily?: string
	meshyTaskId?: string
	meshyTaskStatus?: Meshy3DTaskStatus
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
	meshyCapabilities?: string[]
	meshyPreviewTaskId?: string
	meshyRootTaskId?: string
	meshyParentTaskId?: string
	meshyRelationKind?: string
	meshyRelationSummary?: {
		relationKind?: string
		rootTaskId?: string
		parentTaskId?: string
		effectiveTaskId?: string
		effectiveRelationKind?: string
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

export type UseAIWorkflowModel3DNodeMeshyOptions = {
	updateNodeSettings: (nodeId: string, settings: Partial<Meshy3DSettings>) => void
	getNodeSettings: (nodeId: string) => Meshy3DSettings | null
	getNode: (nodeId: string) => WorkflowNode | null

	buildMeshyRequestPayload: (node: WorkflowNode) => Promise<{
		ok: boolean
		error?: string
		payload?: Record<string, any>
		promptText?: string
		promptSource?: 'linked' | 'manual' | 'none'
		imageCount?: number
	}>

	meshyGenerate: (payload: Record<string, any>) => Promise<any>
	meshyTask: (taskId: string, mode: string) => Promise<any>

	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void

	connectedMeshyPrompt: (nodeId: string) => string
	connectedMeshyImageInputs: (nodeId: string) => Array<{
		edge: WorkflowEdge
		fromNode: WorkflowNode
		fromAnchorId: string
		url: string
	}>
	connectedMeshyModelInput: (nodeId: string) => Promise<{
		inputTaskId?: string
		modelUrl: string
		sourceName?: string
	} | null>
	buildMeshyImageInputFromNode: (fromNode: WorkflowNode, fromAnchorId: string) => Promise<string>
	normalizeMeshyImageInputValue: (rawValue: string, label: string) => Promise<string>
	hasConnectedMeshyConsumer: (node: WorkflowNode) => boolean
	missingMeshyImageOutputAnchors: (node: WorkflowNode) => string[]
	meshyImageOutputCount: (settings: Record<string, any> | null | undefined) => number
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
	syncConnectedImageTargetsFromMeshy: (nodeId: string) => Promise<any>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<any>
	refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<any> | void
	shouldRefreshMeshyTaskItems: () => boolean

	getComfyService: () => {
		meshyGenerate: (payload: Record<string, any>) => Promise<any>
		meshyTask: (taskId: string, mode: string) => Promise<any>
	}
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

	const applyMeshyTaskResult = async (nodeId: string, task: Record<string, any>) => {
		const normalized = options.normalizeMeshyTaskStatus(task.status)
		const node = options.getNode(nodeId)
		if (!node) return normalized

		const settings = options.getNodeSettings(nodeId) ?? {}
		const target = String(settings.meshyTaskTarget ?? '3d').trim() || '3d'
		const is3DTarget = target === '3d'

		const modelUrls = task.modelUrls && typeof task.modelUrls === 'object' ? task.modelUrls : {}
		const imageUrls = Array.isArray((task as any).imageUrls)
			? (task as any).imageUrls.map((x: any) => String(x ?? '').trim()).filter(Boolean)
			: []
		const preferredImageUrl = String((task as any).preferredImageUrl ?? imageUrls[0] ?? '').trim()
		const preferredModelUrl =
			String(task.preferredModelUrl ?? '').trim() || options.pickMeshyPreferredModelUrl(modelUrls)
		const thumbnailUrl = String(task.thumbnailUrl ?? '').trim()
		const statusText = String(task.statusText ?? '').trim()
		const errorMessage = String(task.errorMessage ?? '').trim()
		const format = options.pickMeshyPreferredFormat(modelUrls)

		const existingLocalThumbnailUrl = pickLocalThumbnailCandidate(
			settings.meshyRelationSummary?.effectiveThumbnailUrl,
			settings.meshyOutputSummary?.thumbnailUrl,
			settings.meshyThumbnailUrl,
		)
		let resolvedThumbnailUrl = is3DTarget ? existingLocalThumbnailUrl : (thumbnailUrl || existingLocalThumbnailUrl)

		const patch: Partial<Meshy3DSettings> = {
			meshyTaskId: String(task.taskId ?? '').trim(),
			meshyRelationKind: String(settings.meshyRelationKind ?? 'model').trim() || 'model',
			meshyRootTaskId: String(settings.meshyRootTaskId ?? task.taskId ?? '').trim() || undefined,
			meshyParentTaskId: String(settings.meshyParentTaskId ?? '').trim() || undefined,
			meshyCapabilities: settings.meshyCapabilities ?? undefined,
			meshyTaskStatus: normalized as Meshy3DTaskStatus,
			meshyProgress: Number(task.progress ?? 0),
			meshyStatusText: statusText,
			meshyThumbnailUrl: resolvedThumbnailUrl || undefined,
			meshyModelUrls: modelUrls,
			meshyErrorMessage: errorMessage,
			meshyOutputSummary: {
				...(settings.meshyOutputSummary ?? {}),
				outputKind: is3DTarget ? '3d-model' : 'image',
				preferredUrl: (is3DTarget ? preferredModelUrl : preferredImageUrl || preferredModelUrl) || undefined,
				imageUrls: is3DTarget ? undefined : imageUrls.slice(0, 4),
				thumbnailUrl: resolvedThumbnailUrl || undefined,
				format: is3DTarget ? format : undefined,
			},
			meshyRelationSummary: {
				...(settings.meshyRelationSummary ?? {}),
				relationKind: String(settings.meshyRelationKind ?? 'model').trim() || 'model',
				rootTaskId: String(settings.meshyRootTaskId ?? task.taskId ?? '').trim() || undefined,
				parentTaskId: String(settings.meshyParentTaskId ?? '').trim() || undefined,
				effectiveTaskId: String(task.taskId ?? '').trim() || undefined,
				effectiveRelationKind: String(settings.meshyRelationKind ?? 'model').trim() || 'model',
				effectiveStatus: normalized,
				effectiveProgress: Number(task.progress ?? 0),
				effectivePreferredModelUrl: preferredModelUrl || undefined,
				effectivePreferredImageUrl: preferredImageUrl || undefined,
				effectiveLocalAssetUrl: String(settings.meshyOutputAssetUrl ?? '').trim() || undefined,
				effectiveLocalAssetPath: String(settings.meshyOutputAssetPath ?? '').trim() || undefined,
				effectiveThumbnailUrl: resolvedThumbnailUrl || undefined,
			},
		}

		if (normalized === 'succeeded') {
			if (is3DTarget && preferredModelUrl) {
				const fileName = `meshy_${String(task.taskId ?? '').trim() || nodeId}.${format}`
				const persisted = await options.persistExternalAssetToProject({
					kind: 'file',
					name: fileName,
					sourceUrl: preferredModelUrl,
					sourcePath: String(task.sourceModelUrl ?? '').trim() || undefined,
				})
				patch.meshyOutputAssetUrl = String(persisted?.url || preferredModelUrl)
				patch.meshyOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined

				if (!resolvedThumbnailUrl && thumbnailUrl) {
					try {
						const thumbName = `meshy_${String(task.taskId ?? '').trim() || nodeId}_preview${options.fileExtensionFromUrl(thumbnailUrl, '.png')}`
						const persistedThumb = await options.persistExternalAssetToProject({
							kind: 'image',
							name: thumbName,
							sourceUrl: thumbnailUrl,
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
					format,
				}
				patch.meshyRelationSummary = {
					...(patch.meshyRelationSummary ?? {}),
					effectiveLocalAssetUrl: String(persisted?.url || preferredModelUrl),
					effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
					effectiveThumbnailUrl: resolvedThumbnailUrl || undefined,
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
			if (currentStatus === 'succeeded' || currentStatus === 'failed' || currentStatus === 'canceled') {
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
							meshyStatusText: 'Meshy 状态连续获取失败',
							meshyErrorMessage: String(res.error ?? 'unknown'),
						})
						options.pushToast('Meshy 状态连续获取失败，请稍后重试。', 'warn')
					}
					return
				}

				pollErrorCounts.delete(nodeId)
				const finalStatus = await applyMeshyTaskResult(nodeId, res as any)
				if (finalStatus === 'succeeded' || finalStatus === 'failed' || finalStatus === 'canceled') {
					if (!terminalNotified.has(nodeId)) {
						terminalNotified.add(nodeId)
						const target = String(options.getNodeSettings(nodeId)?.meshyTaskTarget ?? '3d').trim()
						if (finalStatus === 'succeeded') {
							options.pushToast('Meshy 3D 模型生成完成。', 'info')
						} else if (finalStatus === 'failed') {
							options.pushToast('Meshy 3D 模型生成失败。', 'warn')
						} else {
							options.pushToast('Meshy 任务已取消。', 'warn')
						}
					}
					stopPoll(nodeId)
				}
			} catch (err: any) {
				const nextCount = Number(pollErrorCounts.get(nodeId) ?? 0) + 1
				pollErrorCounts.set(nodeId, nextCount)
				if (nextCount >= MESHY_MAX_POLL_ERRORS) {
					stopPoll(nodeId)
					options.updateNodeSettings(nodeId, {
						meshyTaskStatus: 'failed',
						meshyStatusText: 'Meshy 状态获取异常',
						meshyErrorMessage: String(err?.message ?? err ?? 'unknown'),
					})
					options.pushToast('Meshy 状态获取异常，已停止轮询。', 'warn')
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
			options.pushToast(prepared.error ?? 'Meshy 请求构建失败', 'warn')
			options.updateNodeSettings(nodeId, {
				meshyTaskStatus: 'failed',
				meshyErrorMessage: prepared.error,
				meshyStatusText: prepared.error,
			})
			return
		}

		stopPoll(nodeId)
		options.updateNodeSettings(nodeId, {
			meshyTaskStatus: 'pending',
			meshyProgress: 0,
			meshyErrorMessage: '',
			meshyStatusText: 'Meshy：正在创建任务…',
			meshyInputSummary: {
				promptSource: prepared.promptSource,
				promptText: prepared.promptText || undefined,
				imageCount: prepared.imageCount,
				modelInputConnected: options.hasIncomingEdge(node.id, 'in-model'),
				lastValidatedAt: Date.now(),
			},
		})

		try {
			const res = await options.getComfyService().meshyGenerate(prepared.payload!)
			if (!res.ok) {
				const msg = String(res.error ?? 'Meshy 创建任务失败')
				options.updateNodeSettings(nodeId, {
					meshyTaskStatus: 'failed',
					meshyErrorMessage: msg,
					meshyStatusText: msg,
				})
				options.pushToast(msg, 'warn')
				return
			}

			const taskStatus = options.normalizeMeshyTaskStatus((res as any).status)
			const taskId = String((res as any).taskId ?? '').trim()
			const mode = String((res as any).mode ?? prepared.payload?.mode ?? 'text-to-3d').trim()

			options.updateNodeSettings(nodeId, {
				meshyTaskId: taskId,
				meshyTaskStatus: taskStatus === 'idle' ? 'pending' : (taskStatus as Meshy3DTaskStatus),
				meshyProgress: taskStatus === 'running' ? 5 : 0,
				meshyStatusText: 'Meshy：任务已创建，开始轮询状态…',
			})

			if (options.shouldRefreshMeshyTaskItems()) {
				void options.refreshMeshyTaskItems({ silent: true })
			}

			if (!taskId) {
				options.pushToast('Meshy 返回缺少任务 ID。', 'warn')
				return
			}

			startPoll(nodeId, taskId, mode)
		} catch (err: any) {
			const msg = 'Meshy 创建任务异常：' + String(err?.message ?? err ?? 'unknown')
			options.updateNodeSettings(nodeId, {
				meshyTaskStatus: 'failed',
				meshyErrorMessage: msg,
				meshyStatusText: msg,
			})
			options.pushToast(msg, 'warn')
		}
	}

	const startRetexture = async (nodeId: string) => {
		const settings = options.getNodeSettings(nodeId)
		if (!settings) return

		const currentTaskId = String(settings.meshyRelationSummary?.effectiveTaskId ?? settings.meshyTaskId ?? '').trim()
		const rootTaskId = String(settings.meshyRootTaskId ?? settings.meshyRelationSummary?.rootTaskId ?? currentTaskId).trim()

		if (!currentTaskId) {
			options.pushToast('当前节点还没有可复用的 Meshy 任务结果。', 'warn')
			return
		}

		const taskStatus = String(settings.meshyTaskStatus ?? '').trim()
		if (taskStatus === 'pending' || taskStatus === 'running') {
			options.pushToast('当前 Meshy 任务仍在进行中，请等待结束后再发起贴图任务。', 'warn')
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
				parentTaskId: currentTaskId,
			},
		})

		await startGeneration(nodeId)
	}

	const refreshStatus = async (nodeId: string) => {
		const settings = options.getNodeSettings(nodeId)
		if (!settings) return

		const taskId = String(settings.meshyRelationSummary?.effectiveTaskId ?? settings.meshyTaskId ?? '').trim()
		if (!taskId) {
			options.pushToast('当前节点没有进行中的任务。', 'warn')
			return
		}

		const mode = String(settings.meshyTaskFamily ?? 'text-to-3d').trim()

		try {
			const res = await options.getComfyService().meshyTask(taskId, mode)
			if (!res.ok) {
				options.pushToast('刷新任务状态失败：' + String(res.error ?? 'unknown'), 'warn')
				return
			}
			await applyMeshyTaskResult(nodeId, res as any)
		} catch (err: any) {
			options.pushToast('刷新任务状态异常：' + String(err?.message ?? err ?? 'unknown'), 'warn')
		}
	}

	const stopTask = (nodeId: string) => {
		const node = options.getNode(nodeId)
		if (!node) return

		const status = String(options.getNodeSettings(nodeId)?.meshyTaskStatus ?? '').trim()
		if (status !== 'pending' && status !== 'running') {
			options.pushToast('当前没有进行中的任务。', 'warn')
			return
		}

		stopPoll(nodeId)
		options.updateNodeSettings(nodeId, {
			meshyTaskStatus: 'canceled',
			meshyStatusText: '任务已停止',
		})
		options.pushToast('Meshy 任务已停止。', 'info')
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
				effectiveThumbnailUrl: undefined,
			},
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
		clearAllRuntime,
	}
}

type WorkflowEdge = any
