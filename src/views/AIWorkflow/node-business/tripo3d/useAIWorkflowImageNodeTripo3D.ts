import { ref, computed } from 'vue'
import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { t } from '../../../../i18n'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import type {
	Tripo3DComfyService,
	Tripo3DGeneratePayload,
	Tripo3DGenerateResponse,
	Tripo3DStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'

export const normalizeText = (value: unknown) => String(value ?? '').trim()

type Tripo3DImageNodeSettings = Record<string, unknown>

export const isImageInputAnchor = (anchorId: string): boolean => {
	const id = String(anchorId || '').trim()
	// in-resource已从image节点移除，保留in-image、in-0（多模态）和in-image-N系列
	return id === 'in-image' || id === 'in-0' || /^in-image-\d+$/.test(id)
}

export const getEffectiveImageUrl = (
	node: WorkflowNode,
	store: Tripo3DStoreLike,
	nodeResourceUrl?: (node: WorkflowNode) => string | null
): string | null => {
	const resourceRid = String((node as Record<string, unknown>).resourceId ?? '').trim()
	if (resourceRid) {
		const resourcesById = (store.state as Record<string, unknown>).resourcesById as
			| Record<string, Record<string, unknown>>
			| undefined
		const res = resourcesById?.[resourceRid]
		const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
		if (resUrl) return resUrl
	}
	const imgSettings =
		typeof (node as Record<string, unknown>).imageSettings === 'object' &&
		(node as Record<string, unknown>).imageSettings
			? ((node as Record<string, unknown>).imageSettings as Record<string, unknown>)
			: {}
	const lastGenUrl =
		typeof imgSettings?.lastGeneratedImageUrl === 'string'
			? String(imgSettings.lastGeneratedImageUrl).trim()
			: ''
	if (lastGenUrl) return lastGenUrl
	const tripo3dSettings =
		typeof imgSettings?.tripo3dImageSettings === 'object' && imgSettings.tripo3dImageSettings
			? (imgSettings.tripo3dImageSettings as Record<string, unknown>)
			: {}
	const tripo3dSummary =
		typeof tripo3dSettings?.outputSummary === 'object' && tripo3dSettings.outputSummary
			? (tripo3dSettings.outputSummary as Record<string, unknown>)
			: {}
	const tripo3dUrl =
		typeof tripo3dSummary?.preferredUrl === 'string'
			? String(tripo3dSummary.preferredUrl).trim()
			: ''
	if (tripo3dUrl) return tripo3dUrl
	if (typeof nodeResourceUrl === 'function') {
		const standardUrl = nodeResourceUrl(node)
		if (standardUrl) return standardUrl
	}
	return null
}

export const useAIWorkflowImageNodeTripo3D = (options: {
	nodeId: string
	getNode: () => WorkflowNode | null
	updateNodeSettings: (patch: Record<string, unknown>) => void
	getComfyService: () => Tripo3DComfyService & {
		tripo3dGenerateImage?: (payload: Record<string, unknown>) => Promise<Tripo3DGenerateResponse>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	store: Tripo3DStoreLike
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
	getIncomingEdges?: (nodeId: string) => WorkflowEdge[]
	downloadUrlAsBlob?: (url: string) => Promise<Blob | null>
	nodeResourceUrl?: (node: WorkflowNode) => string | null
	resolveBackendUrl?: (url: string) => string
	resolveBackendFetchUrl?: (url: string) => string
	stopTripo3DPoll: (nodeId: string) => void
	startTripo3DPoll: (nodeId: string, taskId: string, mode: string) => void
	applyTripo3DTaskResult: (nodeId: string, task: unknown) => Promise<string>
}) => {
	const isLoading = ref(false)
	const errorMessage = ref<string | null>(null)

	const tripo3dImageSettings = computed(() => {
		const node = options.getNode()
		const imgSettings = node && isRecord(node.imageSettings) ? node.imageSettings : {}
		return isRecord(imgSettings.tripo3dImageSettings)
			? (imgSettings.tripo3dImageSettings as Tripo3DImageNodeSettings)
			: {}
	})

	const taskStatus = computed(() => String(tripo3dImageSettings.value.taskStatus ?? 'idle').trim())
	const taskProgress = computed(() =>
		Math.max(0, Math.min(100, Number(tripo3dImageSettings.value.progress ?? 0)))
	)
	const taskId = computed(() => String(tripo3dImageSettings.value.taskId ?? '').trim())
	const statusText = computed(() => String(tripo3dImageSettings.value.statusText ?? '').trim())

	const updateTripo3DImageSettings = (patch: Record<string, unknown>) => {
		options.updateNodeSettings({
			imageSettings: {
				tripo3dImageSettings: {
					...tripo3dImageSettings.value,
					...patch
				}
			}
		})
	}

	const collectReferenceImages = async (): Promise<Array<{ name: string; url: string }>> => {
		const node = options.getNode()
		if (!node || !options.getIncomingEdges) return []

		const incoming = options
			.getIncomingEdges(options.nodeId)
			.filter((e) => isImageInputAnchor(String(e.toAnchorId ?? '')))

		const state = options.store.state as {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, Record<string, unknown>>
		}

		const refs: Array<{ name: string; url: string }> = []
		for (const edge of incoming) {
			if (refs.length >= 4) break
			const sourceNode = state.nodesById[String(edge.fromNodeId ?? '')]
			if (!sourceNode) continue

			const candidateUrl = getEffectiveImageUrl(sourceNode, options.store, options.nodeResourceUrl)
			if (!candidateUrl) continue

			const fetchUrl =
				typeof options.resolveBackendFetchUrl === 'function'
					? options.resolveBackendFetchUrl(candidateUrl)
					: typeof options.resolveBackendUrl === 'function'
						? options.resolveBackendUrl(candidateUrl)
						: candidateUrl

			const name = `ref-${String(sourceNode.type || 'image')}-${String(edge.fromNodeId)}-${Date.now()}.png`
			refs.push({ name, url: fetchUrl })
		}
		return refs
	}

	const buildTripo3DImageRequestPayload = async () => {
		const node = options.getNode()
		if (!node) return { ok: false as const, error: t('tasks.tripo3d.nodeNotExist') }

		const chatParams = isRecord(node.nodeChatParams) ? node.nodeChatParams : {}
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const tripo3dImgSettings = isRecord(imgSettings.tripo3dImageSettings)
			? imgSettings.tripo3dImageSettings
			: {}

		const tripo3dImageModel = String(
			chatParams.tripo3dImageModel ?? tripo3dImgSettings.model ?? 'seedream_v4'
		).trim()
		const tripo3dImageSize = String(
			chatParams.tripo3dImageSize ?? tripo3dImgSettings.size ?? ''
		).trim()
		const tripo3dImageAspectRatio = String(
			chatParams.tripo3dImageAspectRatio ??
				(tripo3dImgSettings as Record<string, unknown>).aspectRatio ??
				''
		).trim()
		const tripo3dImageOutputFormat = String(
			chatParams.tripo3dImageOutputFormat ??
				(tripo3dImgSettings as Record<string, unknown>).outputFormat ??
				'png'
		).trim() as 'png' | 'jpeg'
		const tripo3dImageWatermark =
			chatParams.tripo3dImageWatermark ??
			(tripo3dImgSettings as Record<string, unknown>).watermark ??
			false
		const tripo3dImageTemplate = String(
			chatParams.tripo3dImageTemplate ??
				(tripo3dImgSettings as Record<string, unknown>).template ??
				''
		).trim()
		const tripo3dImageNumOutputs = Number(
			chatParams.tripo3dImageNumOutputs ?? tripo3dImgSettings.numOutputs ?? 1
		)
		const tripo3dImageNegativePrompt = String(
			chatParams.tripo3dImageNegativePrompt ?? tripo3dImgSettings.negativePrompt ?? ''
		).trim()
		const tripo3dImageSeed = Number(chatParams.tripo3dImageSeed ?? tripo3dImgSettings.seed ?? -1)
		const tripo3dImageStrength = Number(
			chatParams.tripo3dImageStrength ?? tripo3dImgSettings.strength ?? 0.7
		)

		const isBananaModel = tripo3dImageModel.startsWith('banana')

		const refs = await collectReferenceImages()
		const hasRefImages = refs.length > 0
		const tripo3dImageForceSingleImage = chatParams.tripo3dImageForceSingleImage === true

		let effectiveMode: 'text_to_image' | 'image_to_image' | 'image_to_multiview'
		if (refs.length === 0) {
			effectiveMode = 'text_to_image'
		} else if (refs.length === 1 || tripo3dImageForceSingleImage) {
			effectiveMode = 'image_to_image'
		} else {
			effectiveMode = 'image_to_multiview'
		}

		const prompt = String(chatParams.prompt ?? tripo3dImgSettings.prompt ?? '').trim()
		if (!prompt && effectiveMode === 'text_to_image') {
			return { ok: false as const, error: t('tasks.tripo3d.promptRequired') }
		}

		const tripo3dImageMode = effectiveMode

		console.info('[Tripo3D Image Node] 原始参数:', {
			tripo3dImageMode,
			effectiveMode,
			tripo3dImageModel,
			tripo3dImageSize,
			tripo3dImageAspectRatio,
			tripo3dImageOutputFormat,
			tripo3dImageWatermark,
			tripo3dImageTemplate,
			tripo3dImageNumOutputs,
			tripo3dImageNegativePrompt,
			tripo3dImageSeed,
			tripo3dImageStrength,
			isBananaModel,
			hasRefImages,
			refCount: refs.length,
			nodeId: options.nodeId
		})

		const payload: Tripo3DGeneratePayload = {
			mode: effectiveMode,
			model: tripo3dImageModel,
			prompt
		}

		payload.output_format = tripo3dImageOutputFormat === 'jpeg' ? 'jpeg' : 'png'
		payload.num_outputs =
			Number.isFinite(tripo3dImageNumOutputs) &&
			tripo3dImageNumOutputs >= 1 &&
			tripo3dImageNumOutputs <= 4
				? Math.floor(tripo3dImageNumOutputs)
				: 1

		if (isBananaModel && tripo3dImageAspectRatio) {
			payload.aspect_ratio = tripo3dImageAspectRatio
		} else if (tripo3dImageSize) {
			payload.size = tripo3dImageSize
		}

		if (tripo3dImageModel.startsWith('seedream') && tripo3dImageWatermark !== undefined) {
			payload.watermark = Boolean(tripo3dImageWatermark)
		}

		if (tripo3dImageTemplate) {
			payload.template = tripo3dImageTemplate
		}

		if (tripo3dImageNegativePrompt) {
			payload.negative_prompt = tripo3dImageNegativePrompt
		}
		if (Number.isFinite(tripo3dImageSeed) && tripo3dImageSeed >= 0) {
			payload.seed = Math.floor(tripo3dImageSeed)
		}

		if (effectiveMode === 'image_to_image' || effectiveMode === 'image_to_multiview') {
			if (refs.length === 0) {
				return { ok: false as const, error: t('tasks.tripo3d.imageToModelRequiresImage') }
			}
			if (effectiveMode === 'image_to_multiview' && refs.length >= 2) {
				payload.inputs = refs.map((r) => r.url)
				payload.input = refs[0].url
			} else {
				payload.input = refs[0].url
			}
			const strengthValue =
				Number.isFinite(tripo3dImageStrength) &&
				tripo3dImageStrength >= 0 &&
				tripo3dImageStrength <= 1
					? tripo3dImageStrength
					: 0.7
			payload.strength = strengthValue
		}

		const submittedParams = {
			model: tripo3dImageModel,
			mode: effectiveMode,
			size: payload.size || 'Default',
			aspectRatio: payload.aspect_ratio || 'None',
			outputFormat: payload.output_format,
			watermark: payload.watermark,
			template: payload.template || 'None',
			numOutputs: payload.num_outputs || 1,
			negativePrompt: tripo3dImageNegativePrompt || 'None',
			seed:
				Number.isFinite(tripo3dImageSeed) && tripo3dImageSeed >= 0
					? Math.floor(tripo3dImageSeed)
					: 'Random',
			strength:
				effectiveMode === 'image_to_image' || effectiveMode === 'image_to_multiview'
					? (payload.strength ?? tripo3dImageStrength)
					: undefined,
			referenceImageCount: hasRefImages ? refs.length : 0,
			submittedAt: new Date().toISOString()
		}
		payload.submittedParams = submittedParams

		console.info(
			`[Tripo3D Image Node] 构建${effectiveMode}请求 payload:`,
			JSON.stringify(payload, null, 2)
		)

		return {
			ok: true as const,
			payload,
			promptText: prompt,
			promptSource: 'manual' as const,
			imageCount: refs.length,
			refs,
			submittedParams
		}
	}

	const startGeneration = async () => {
		const node = options.getNode()
		if (!node) return { ok: false, error: t('tasks.tripo3d.nodeNotExist') }

		isLoading.value = true
		errorMessage.value = null

		try {
			const result = await buildTripo3DImageRequestPayload()
			if (!result.ok) {
				errorMessage.value = result.error
				updateTripo3DImageSettings({
					taskStatus: 'failed',
					errorMessage: result.error,
					statusText: result.error
				})
				return result
			}

			options.stopTripo3DPoll(options.nodeId)

			const taskType = result.submittedParams.mode as string
			updateTripo3DImageSettings({
				taskStatus: 'pending',
				taskFamily: taskType,
				progress: 0,
				errorMessage: '',
				statusText: t('tasks.tripo3d.creatingTask'),
				submittedParams: result.submittedParams
			})

			try {
				console.info(
					'[Tripo3D Image Node] 发送请求 payload:',
					JSON.stringify(result.payload, null, 2)
				)

				let res: Tripo3DGenerateResponse
				const comfyService = options.getComfyService()
				const effectiveMode = String(result.payload.mode ?? 'text_to_image').trim()

				if (effectiveMode === 'text_to_image') {
					res = await comfyService.tripo3dGenerateTextToImage(result.payload)
				} else if (effectiveMode === 'image_to_image') {
					res = await comfyService.tripo3dGenerateImageToImage(result.payload)
				} else if (effectiveMode === 'image_to_multiview') {
					res = await comfyService.tripo3dGenerateImageToMultiview(result.payload)
				} else {
					res = await comfyService.tripo3dGenerate(result.payload)
				}

				if (!res.ok) {
					const msg = String(res.error ?? t('tasks.tripo3d.createTaskFailed'))
					errorMessage.value = msg
					updateTripo3DImageSettings({
						taskStatus: 'failed',
						errorMessage: msg,
						statusText: msg
					})
					return { ok: false, error: msg }
				}

				const normalizedStatus = String(res.status ?? 'idle').trim()
				const newTaskId = String(res.taskId ?? '').trim()
				const mode = String(res.mode ?? result.payload.mode ?? taskType).trim()

				updateTripo3DImageSettings({
					taskId: newTaskId,
					taskStatus: normalizedStatus === 'idle' ? 'pending' : normalizedStatus,
					taskFamily: mode,
					progress: normalizedStatus === 'running' ? 5 : 0,
					statusText: t('tasks.tripo3d.taskCreatedPolling'),
					submittedParams: result.submittedParams
				})

				if (!newTaskId) {
					options.pushToast(t('tasks.tripo3d.missingTaskIdToast'), 'warn')
					return { ok: false, error: t('tasks.tripo3d.missingTaskId') }
				}

				options.startTripo3DPoll(options.nodeId, newTaskId, mode)

				return { ok: true, taskId: newTaskId }
			} catch (err: unknown) {
				const msg = t('tasks.tripo3d.createTaskException', { error: getErrorMessage(err) })
				errorMessage.value = msg
				updateTripo3DImageSettings({
					taskStatus: 'failed',
					errorMessage: msg,
					statusText: msg
				})
				return { ok: false, error: msg }
			}
		} finally {
			isLoading.value = false
		}
	}

	const refreshStatus = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		const node = options.getNode()
		if (!node) return

		try {
			const res = await options.getComfyService().tripo3dTask(currentTaskId)
			if (!res.ok) {
				options.pushToast(
					t('tasks.tripo3d.refreshStatusFailed', { error: String(res.error ?? 'unknown') }),
					'warn'
				)
				return
			}
			await options.applyTripo3DTaskResult(options.nodeId, res)
			options.pushToast(t('tasks.tripo3d.statusRefreshed'), 'info')
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.tripo3d.refreshStatusException', { error: getErrorMessage(err) }),
				'warn'
			)
		}
	}

	const stopTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		try {
			const res = await options.getComfyService().tripo3dStop(currentTaskId)
			if (!res.ok) {
				options.pushToast(
					t('tasks.tripo3d.stopTaskFailed', { error: String(res.error ?? 'unknown') }),
					'warn'
				)
				return
			}
			options.stopTripo3DPoll(options.nodeId)
			updateTripo3DImageSettings({
				taskStatus: 'canceled',
				statusText: t('tasks.tripo3d.taskStopped'),
				errorMessage: ''
			})
			options.pushToast(t('tasks.tripo3d.taskStoppedToast'), 'info')
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.tripo3d.stopTaskException', { error: getErrorMessage(err) }),
				'warn'
			)
		}
	}

	const deleteTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		try {
			const res = await options.getComfyService().tripo3dDelete(currentTaskId)
			if (!res.ok) {
				options.pushToast(
					t('tasks.tripo3d.deleteTaskFailed', { error: String(res.error ?? 'unknown') }),
					'warn'
				)
				return
			}
			options.stopTripo3DPoll(options.nodeId)
			updateTripo3DImageSettings({
				taskId: '',
				taskStatus: 'idle',
				progress: 0,
				statusText: t('tasks.tripo3d.taskDeleted'),
				errorMessage: ''
			})
			options.pushToast(t('tasks.tripo3d.taskDeletedToast'), 'info')
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.tripo3d.deleteTaskException', { error: getErrorMessage(err) }),
				'warn'
			)
		}
	}

	return {
		tripo3dImageSettings,
		taskStatus,
		taskProgress,
		taskId,
		statusText,
		isLoading,
		errorMessage,
		startGeneration,
		refreshStatus,
		stopTask,
		deleteTask
	}
}
