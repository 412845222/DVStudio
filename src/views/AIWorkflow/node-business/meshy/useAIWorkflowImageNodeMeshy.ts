import { ref, computed } from 'vue'
import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { t } from '../../../../i18n'
import { useAIWorkflowMeshyRuntime } from './useAIWorkflowMeshyRuntime'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import type {
	MeshyComfyService,
	MeshyGeneratePayload,
	MeshyGenerateResponse,
	MeshyStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'

const normalizeText = (value: unknown) => String(value ?? '').trim()

type MeshyImageNodeSettings = Record<string, unknown>

const isImageInputAnchor = (anchorId: string): boolean => {
	const id = String(anchorId || '').trim()
	return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
}

const getEffectiveImageUrl = (
	node: WorkflowNode,
	store: MeshyStoreLike,
	nodeResourceUrl?: (node: WorkflowNode) => string | null
): string | null => {
	const resourceRid = String((node as Record<string, unknown>).resourceId ?? '').trim()
	if (resourceRid) {
		const resourcesById = (store.state as Record<string, unknown>).resourcesById as Record<string, Record<string, unknown>> | undefined
		const res = resourcesById?.[resourceRid]
		const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
		if (resUrl) return resUrl
	}
	const imgSettings = typeof (node as Record<string, unknown>).imageSettings === 'object' && (node as Record<string, unknown>).imageSettings
		? ((node as Record<string, unknown>).imageSettings as Record<string, unknown>)
		: {}
	const lastGenUrl = typeof imgSettings?.lastGeneratedImageUrl === 'string'
		? String(imgSettings.lastGeneratedImageUrl).trim()
		: ''
	if (lastGenUrl) return lastGenUrl
	const meshySettings = typeof imgSettings?.meshyImageSettings === 'object' && imgSettings.meshyImageSettings
		? (imgSettings.meshyImageSettings as Record<string, unknown>)
		: {}
	const meshySummary = typeof meshySettings?.outputSummary === 'object' && meshySettings.outputSummary
		? (meshySettings.outputSummary as Record<string, unknown>)
		: {}
	const meshyUrl = typeof meshySummary?.preferredUrl === 'string'
		? String(meshySummary.preferredUrl).trim()
		: ''
	if (meshyUrl) return meshyUrl
	if (typeof nodeResourceUrl === 'function') {
		const standardUrl = nodeResourceUrl(node)
		if (standardUrl) return standardUrl
	}
	return null
}

export const useAIWorkflowImageNodeMeshy = (options: {
	nodeId: string
	getNode: () => WorkflowNode | null
	updateNodeSettings: (patch: Record<string, unknown>) => void
	getComfyService: () => MeshyComfyService & {
		meshyGenerateImage?: (form: FormData) => Promise<MeshyGenerateResponse>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	store: MeshyStoreLike
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
	getIncomingEdges?: (nodeId: string) => WorkflowEdge[]
	downloadUrlAsBlob?: (url: string) => Promise<Blob | null>
	nodeResourceUrl?: (node: WorkflowNode) => string | null
	resolveBackendUrl?: (url: string) => string
	resolveBackendFetchUrl?: (url: string) => string
}) => {
	const { stopMeshyPoll, startMeshyPoll, applyMeshyTaskResult } = useAIWorkflowMeshyRuntime({
		store: options.store,
		getComfyService: options.getComfyService,
		pushToast: options.pushToast,
		normalizeMeshyTaskStatus: (raw: unknown) => String(raw ?? 'idle').trim(),
		pickMeshyPreferredModelUrl: (urls) => String(urls?.glb ?? urls?.gltf ?? '').trim(),
		pickMeshyPreferredFormat: (urls) => (urls?.glb ? 'glb' : 'gltf'),
		fileExtensionFromUrl: (url, fallbackExt) => {
			const text = normalizeText(url)
			if (!text) return fallbackExt
			try {
				const u = new URL(text)
				const base = u.pathname.split('/').pop() ?? ''
				const ext = base.includes('.') ? '.' + base.split('.').pop()!.toLowerCase() : ''
				return ext || fallbackExt
			} catch {
				return fallbackExt
			}
		},
		persistExternalAssetToProject: options.persistExternalAssetToProject,
		syncConnectedImageTargetsFromMeshy: async () => {},
		syncConnectedModel3DTargets: async () => {},
		refreshMeshyTaskItems: () => {},
		shouldRefreshMeshyTaskItems: () => false
	})

	const isLoading = ref(false)
	const errorMessage = ref<string | null>(null)

	const meshySettings = computed(() => {
		const node = options.getNode()
		const imgSettings = node && isRecord(node.imageSettings) ? node.imageSettings : {}
		return isRecord(imgSettings.meshyImageSettings)
			? (imgSettings.meshyImageSettings as MeshyImageNodeSettings)
			: {}
	})

	const taskStatus = computed(() => String(meshySettings.value.taskStatus ?? 'idle').trim())
	const taskProgress = computed(() =>
		Math.max(0, Math.min(100, Number(meshySettings.value.progress ?? 0)))
	)
	const taskId = computed(() => String(meshySettings.value.taskId ?? '').trim())
	const statusText = computed(() => String(meshySettings.value.statusText ?? '').trim())

	const updateMeshyImageSettings = (patch: Record<string, unknown>) => {
		options.updateNodeSettings({
			imageSettings: {
				meshyImageSettings: {
					...meshySettings.value,
					...patch
				}
			}
		})
	}

	const collectReferenceImages = async (): Promise<Array<{ name: string; blob: Blob }>> => {
		const node = options.getNode()
		if (!node || !options.getIncomingEdges) return []

		const incoming = options.getIncomingEdges(options.nodeId).filter((e) =>
			isImageInputAnchor(String(e.toAnchorId ?? ''))
		)

		const state = options.store.state as {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, Record<string, unknown>>
		}

		const refs: Array<{ name: string; blob: Blob }> = []
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

			try {
				let blob: Blob | null = null
				if (typeof options.downloadUrlAsBlob === 'function') {
					blob = await options.downloadUrlAsBlob(fetchUrl)
				}
				if (!blob) {
					const resp = await fetch(fetchUrl)
					if (!resp.ok) continue
					blob = await resp.blob()
				}
				if (!blob || blob.size === 0) continue
				const name = `ref-${String(sourceNode.type || 'image')}-${String(edge.fromNodeId)}-${Date.now()}.png`
				refs.push({ name, blob })
			} catch {
				continue
			}
		}
		return refs
	}

	const buildMeshyImageRequestPayload = async () => {
		const node = options.getNode()
		if (!node) return { ok: false as const, error: t('tasks.meshy.nodeNotExist') }

		const chatParams = isRecord(node.nodeChatParams) ? node.nodeChatParams : {}
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const meshyImageSettings = isRecord(imgSettings.meshyImageSettings)
			? imgSettings.meshyImageSettings
			: {}

		const prompt = String(chatParams.prompt ?? meshyImageSettings.prompt ?? '').trim()
		if (!prompt) {
			return { ok: false as const, error: t('tasks.meshy.promptRequired') }
		}

		const meshyAiModel = String(
			chatParams.meshyImageAiModel ?? meshyImageSettings.aiModel ?? 'nano-banana'
		).trim()
		const meshyAspectRatio = String(
			chatParams.meshyAspectRatio ??
				chatParams.aspectRatio ??
				meshyImageSettings.aspectRatio ??
				'1:1'
		).trim()
		const meshyPoseMode = String(
			chatParams.meshyPoseMode ?? meshyImageSettings.poseMode ?? ''
		).trim()
		const meshyGenerateMultiView = Boolean(
			chatParams.meshyGenerateMultiView ?? meshyImageSettings.generateMultiView
		)
		const meshyNegativePrompt = String(
			chatParams.meshyNegativePrompt ?? meshyImageSettings.negativePrompt ?? ''
		).trim()
		const meshyOutputImageCount = Number(
			chatParams.meshyOutputImageCount ?? meshyImageSettings.outputCount ?? 1
		)
		const meshySeed = Number(
			chatParams.meshySeed ?? meshyImageSettings.seed ?? -1
		)

		const refs = await collectReferenceImages()
		const hasRefImages = refs.length > 0
		const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'

		console.log('[Meshy Image Node] 原始参数:', {
			meshyAiModel,
			meshyAspectRatio,
			meshyPoseMode,
			meshyGenerateMultiView,
			meshyNegativePrompt,
			meshyOutputImageCount,
			meshySeed,
			hasRefImages,
			refCount: refs.length,
			taskType,
			nodeId: options.nodeId
		})

		const payload: MeshyGeneratePayload = {
			mode: taskType,
			ai_model: meshyAiModel,
			prompt
		}

		if (meshyGenerateMultiView) {
			payload.generate_multi_view = true
			payload.output_image_count = 4
		} else {
			payload.aspect_ratio = meshyAspectRatio
			console.log(`[Meshy Image Node] ${taskType}: EXPLICITLY setting aspect_ratio=${payload.aspect_ratio}, model=${meshyAiModel}`)
			if (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 && meshyOutputImageCount <= 4) {
				payload.output_image_count = Math.floor(meshyOutputImageCount)
			}
		}
		if (meshyPoseMode) payload.pose_mode = meshyPoseMode

		if (meshyNegativePrompt) payload.negative_prompt = meshyNegativePrompt
		if (Number.isFinite(meshySeed) && meshySeed >= 0) {
			payload.seed = Math.floor(meshySeed)
		}

		const submittedParams = {
			model: meshyAiModel,
			mode: taskType,
			aspectRatio: meshyGenerateMultiView ? '1:1 (Multi-View)' : meshyAspectRatio,
			poseMode: meshyPoseMode || 'None',
			generateMultiView: meshyGenerateMultiView,
			negativePrompt: meshyNegativePrompt || 'None',
			outputCount: meshyGenerateMultiView ? 4 : (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 ? Math.floor(meshyOutputImageCount) : 1),
			seed: Number.isFinite(meshySeed) && meshySeed >= 0 ? Math.floor(meshySeed) : 'Random',
			referenceImageCount: hasRefImages ? refs.length : 0,
			submittedAt: new Date().toISOString()
		}
		payload.submittedParams = submittedParams

		console.log(`[Meshy Image Node] 构建${taskType}请求 payload:`, JSON.stringify(payload, null, 2))

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
		if (!node) return { ok: false, error: t('tasks.meshy.nodeNotExist') }

		isLoading.value = true
		errorMessage.value = null

		try {
			const result = await buildMeshyImageRequestPayload()
			if (!result.ok) {
				errorMessage.value = result.error
				updateMeshyImageSettings({
					taskStatus: 'failed',
					errorMessage: result.error,
					statusText: result.error
				})
				return result
			}

			stopMeshyPoll(options.nodeId)

			const taskType = result.submittedParams.mode as string
			updateMeshyImageSettings({
				taskStatus: 'pending',
				taskFamily: taskType,
				progress: 0,
				errorMessage: '',
				statusText: t('tasks.meshy.creatingTask'),
				submittedParams: result.submittedParams
			})

			try {
				console.log('[Meshy Image Node] 发送请求 payload:', JSON.stringify(result.payload, null, 2))

				let res: MeshyGenerateResponse
				if (result.refs.length > 0 && typeof options.getComfyService().meshyGenerateImage === 'function') {
					const form = new FormData()
					for (const key of Object.keys(result.payload)) {
						const value = (result.payload as Record<string, unknown>)[key]
						if (typeof value === 'object' && value !== null) {
							form.set(key, JSON.stringify(value))
						} else if (typeof value === 'boolean') {
							form.set(key, value ? 'true' : 'false')
						} else if (typeof value === 'number') {
							form.set(key, String(value))
						} else {
							form.set(key, String(value))
						}
					}
					for (const ref of result.refs) {
						form.append('refImages', ref.blob, ref.name)
					}
					console.log('[Meshy Image Node] 使用meshyGenerateImage（FormData路径），refCount:', result.refs.length)
					res = await options.getComfyService().meshyGenerateImage!(form)
				} else {
					res = await options.getComfyService().meshyGenerate(result.payload)
				}

				if (!res.ok) {
					const msg = String(res.error ?? t('tasks.meshy.createTaskFailed'))
					errorMessage.value = msg
					updateMeshyImageSettings({
						taskStatus: 'failed',
						errorMessage: msg,
						statusText: msg
					})
					return { ok: false, error: msg }
				}

				const normalizedStatus = String(res.status ?? 'idle').trim()
				const newTaskId = String(res.taskId ?? '').trim()
				const mode = String(res.mode ?? result.payload.mode ?? taskType).trim()

				updateMeshyImageSettings({
					taskId: newTaskId,
					taskStatus: normalizedStatus === 'idle' ? 'pending' : normalizedStatus,
					taskFamily: mode,
					progress: normalizedStatus === 'running' ? 5 : 0,
					statusText: t('tasks.meshy.taskCreatedPolling'),
					submittedParams: result.submittedParams
				})

				if (!newTaskId) {
					options.pushToast(t('tasks.meshy.missingTaskIdToast'), 'warn')
					return { ok: false, error: t('tasks.meshy.missingTaskId') }
				}

				startMeshyPoll(options.nodeId, newTaskId, mode)

				return { ok: true, taskId: newTaskId }
			} catch (err: unknown) {
				const msg = t('tasks.meshy.createTaskException', { error: getErrorMessage(err) })
				errorMessage.value = msg
				updateMeshyImageSettings({
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

		const mode = String(meshySettings.value.taskFamily ?? meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyTask(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast(t('tasks.meshy.refreshStatusFailed', { error: String(res.error ?? 'unknown') }), 'warn')
				return
			}
			await applyMeshyTaskResult(options.nodeId, res)
			options.pushToast(t('tasks.meshy.statusRefreshed'), 'info')
		} catch (err: unknown) {
			options.pushToast(t('tasks.meshy.refreshStatusException', { error: getErrorMessage(err) }), 'warn')
		}
	}

	const stopTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		const mode = String(meshySettings.value.taskFamily ?? meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyStop(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast(t('tasks.meshy.stopTaskFailed', { error: String(res.error ?? 'unknown') }), 'warn')
				return
			}
			stopMeshyPoll(options.nodeId)
			updateMeshyImageSettings({
				taskStatus: 'canceled',
				statusText: t('tasks.meshy.taskStopped'),
				errorMessage: ''
			})
			options.pushToast(t('tasks.meshy.taskStoppedToast'), 'info')
		} catch (err: unknown) {
			options.pushToast(t('tasks.meshy.stopTaskException', { error: getErrorMessage(err) }), 'warn')
		}
	}

	const deleteTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		const mode = String(meshySettings.value.taskFamily ?? meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyDelete(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast(t('tasks.meshy.deleteTaskFailed', { error: String(res.error ?? 'unknown') }), 'warn')
				return
			}
			stopMeshyPoll(options.nodeId)
			updateMeshyImageSettings({
				taskId: '',
				taskStatus: 'idle',
				progress: 0,
				statusText: t('tasks.meshy.taskDeleted'),
				errorMessage: ''
			})
			options.pushToast(t('tasks.meshy.taskDeletedToast'), 'info')
		} catch (err: unknown) {
			options.pushToast(t('tasks.meshy.deleteTaskException', { error: getErrorMessage(err) }), 'warn')
		}
	}

	return {
		meshySettings,
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
