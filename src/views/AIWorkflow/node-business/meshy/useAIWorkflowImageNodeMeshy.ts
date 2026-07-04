import { ref, computed } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import { useAIWorkflowMeshyRuntime } from './useAIWorkflowMeshyRuntime'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import type {
	MeshyComfyService,
	MeshyGeneratePayload,
	MeshyStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'

const normalizeText = (value: unknown) => String(value ?? '').trim()

type MeshyImageNodeSettings = Record<string, unknown>

export const useAIWorkflowImageNodeMeshy = (options: {
	nodeId: string
	getNode: () => WorkflowNode | null
	updateNodeSettings: (patch: Record<string, unknown>) => void
	getComfyService: () => MeshyComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	store: MeshyStoreLike
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
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

	const buildMeshyImageRequestPayload = () => {
		const node = options.getNode()
		if (!node) return { ok: false as const, error: '节点不存在' }

		const chatParams = isRecord(node.nodeChatParams) ? node.nodeChatParams : {}
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const meshyImageSettings = isRecord(imgSettings.meshyImageSettings)
			? imgSettings.meshyImageSettings
			: {}

		const prompt = String(chatParams.prompt ?? meshyImageSettings.prompt ?? '').trim()
		if (!prompt) {
			return { ok: false as const, error: '请先填写提示词' }
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

		console.log('[Meshy Image Node] 原始参数:', {
			meshyAiModel,
			meshyAspectRatio,
			meshyPoseMode,
			meshyGenerateMultiView,
			meshyNegativePrompt,
			meshyOutputImageCount,
			meshySeed,
			nodeId: options.nodeId
		})

		// 图片节点直接生成按钮：始终为文生图模式（图生图需要通过连线传入参考图，由聊天面板处理）
		// 严格按照 Meshy 官方文档构建参数
		// text-to-image 支持：ai_model(必选), prompt(必选), aspect_ratio(可选), generate_multi_view(可选), pose_mode(可选), negative_prompt(可选), output_image_count(可选), seed(可选)
		const taskType = 'text-to-image'
		const payload: MeshyGeneratePayload = {
			mode: taskType,
			ai_model: meshyAiModel,
			prompt
		}

		// 参数互斥：generate_multi_view 为 true 时不能设置 aspect_ratio
		if (meshyGenerateMultiView) {
			payload.generate_multi_view = true
		} else {
			payload.aspect_ratio = meshyAspectRatio
			console.log(`[Meshy Image Node] text-to-image: EXPLICITLY setting aspect_ratio=${payload.aspect_ratio}, model=${meshyAiModel}`)
		}
		if (meshyPoseMode) payload.pose_mode = meshyPoseMode

		// 可选参数
		if (meshyNegativePrompt) payload.negative_prompt = meshyNegativePrompt
		if (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 && meshyOutputImageCount <= 4) {
			payload.output_image_count = Math.floor(meshyOutputImageCount)
		}
		if (Number.isFinite(meshySeed) && meshySeed >= 0) {
			payload.seed = Math.floor(meshySeed)
		}

		// 记录完整提交参数（用于任务面板显示，后端会过滤掉不会发送给API）
		const submittedParams = {
			model: meshyAiModel,
			mode: taskType,
			aspectRatio: meshyGenerateMultiView ? '1:1 (多视图)' : meshyAspectRatio,
			poseMode: meshyPoseMode || '无',
			generateMultiView: meshyGenerateMultiView,
			negativePrompt: meshyNegativePrompt || '无',
			outputCount: Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 ? Math.floor(meshyOutputImageCount) : 1,
			seed: Number.isFinite(meshySeed) && meshySeed >= 0 ? Math.floor(meshySeed) : '随机',
			referenceImageCount: 0,
			submittedAt: new Date().toISOString()
		}
		payload.submittedParams = submittedParams

		console.log('[Meshy Image Node] 构建文生图请求 payload:', JSON.stringify(payload, null, 2))

		return {
			ok: true as const,
			payload,
			promptText: prompt,
			promptSource: 'manual' as const,
			imageCount: 0,
			submittedParams
		}
	}

	const startGeneration = async () => {
		const node = options.getNode()
		if (!node) return { ok: false, error: '节点不存在' }

		isLoading.value = true
		errorMessage.value = null

		try {
			const result = buildMeshyImageRequestPayload()
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

			updateMeshyImageSettings({
				taskStatus: 'pending',
				taskFamily: 'text-to-image',
				progress: 0,
				errorMessage: '',
				statusText: 'Meshy：正在创建文生图任务…',
				submittedParams: result.submittedParams
			})

			try {
				console.log('[Meshy Image Node] 发送请求 payload:', JSON.stringify(result.payload, null, 2))
				const res = await options.getComfyService().meshyGenerate(result.payload)
				if (!res.ok) {
					const msg = String(res.error ?? 'Meshy 创建任务失败')
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
				const mode = String(res.mode ?? result.payload.mode ?? 'text-to-image').trim()

				updateMeshyImageSettings({
					taskId: newTaskId,
					taskStatus: normalizedStatus === 'idle' ? 'pending' : normalizedStatus,
					taskFamily: mode,
					progress: normalizedStatus === 'running' ? 5 : 0,
					statusText: 'Meshy：任务已创建，开始轮询状态…',
					submittedParams: result.submittedParams
				})

				if (!newTaskId) {
					options.pushToast('Meshy 返回缺少任务 ID。', 'warn')
					return { ok: false, error: 'Meshy 返回缺少任务 ID' }
				}

				startMeshyPoll(options.nodeId, newTaskId, mode)

				return { ok: true, taskId: newTaskId }
			} catch (err: unknown) {
				const msg = 'Meshy 创建任务异常：' + getErrorMessage(err)
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

		const mode = String(meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyTask(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast('刷新 Meshy 状态失败：' + String(res.error ?? 'unknown'), 'warn')
				return
			}
			await applyMeshyTaskResult(options.nodeId, res)
			options.pushToast('Meshy 任务状态已刷新。', 'info')
		} catch (err: unknown) {
			options.pushToast('刷新 Meshy 状态异常：' + getErrorMessage(err), 'warn')
		}
	}

	const stopTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		const mode = String(meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyStop(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast('停止 Meshy 任务失败：' + String(res.error ?? 'unknown'), 'warn')
				return
			}
			stopMeshyPoll(options.nodeId)
			updateMeshyImageSettings({
				taskStatus: 'canceled',
				statusText: 'Meshy：任务已停止',
				errorMessage: ''
			})
			options.pushToast('已停止 Meshy 任务。', 'info')
		} catch (err: unknown) {
			options.pushToast('停止 Meshy 任务异常：' + getErrorMessage(err), 'warn')
		}
	}

	const deleteTask = async () => {
		const currentTaskId = taskId.value
		if (!currentTaskId) return

		const mode = String(meshySettings.value.mode ?? 'text-to-image').trim()
		try {
			const res = await options.getComfyService().meshyDelete(currentTaskId, mode)
			if (!res.ok) {
				options.pushToast('删除 Meshy 任务失败：' + String(res.error ?? 'unknown'), 'warn')
				return
			}
			stopMeshyPoll(options.nodeId)
			updateMeshyImageSettings({
				taskId: '',
				taskStatus: 'idle',
				progress: 0,
				statusText: 'Meshy：任务已删除',
				errorMessage: ''
			})
			options.pushToast('已删除 Meshy 任务。', 'info')
		} catch (err: unknown) {
			options.pushToast('删除 Meshy 任务异常：' + getErrorMessage(err), 'warn')
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
