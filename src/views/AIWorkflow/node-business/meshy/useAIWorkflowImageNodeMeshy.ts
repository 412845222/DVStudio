import { ref, computed } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import { useAIWorkflowMeshyRuntime } from './useAIWorkflowMeshyRuntime'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import type { MeshyComfyService, MeshyGeneratePayload, MeshyStoreLike, PersistExternalAssetPayload, PersistExternalAssetResult } from './types'

const normalizeText = (value: unknown) => String(value ?? '').trim()

type MeshyImageNodeSettings = Record<string, unknown>

export const useAIWorkflowImageNodeMeshy = (options: {
  nodeId: string
  getNode: () => WorkflowNode | null
  updateNodeSettings: (patch: Record<string, unknown>) => void
  getComfyService: () => MeshyComfyService
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  store: MeshyStoreLike
  persistExternalAssetToProject: (payload: PersistExternalAssetPayload) => Promise<PersistExternalAssetResult>
}) => {
  const {
    stopMeshyPoll,
    startMeshyPoll,
    applyMeshyTaskResult,
  } = useAIWorkflowMeshyRuntime({
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
    shouldRefreshMeshyTaskItems: () => false,
  })

  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)

  const meshySettings = computed(() => {
    const node = options.getNode()
    const imgSettings = (node && isRecord(node.imageSettings)) ? node.imageSettings : {}
    return isRecord(imgSettings.meshyImageSettings) ? imgSettings.meshyImageSettings as MeshyImageNodeSettings : {}
  })

  const taskStatus = computed(() => String(meshySettings.value.taskStatus ?? 'idle').trim())
  const taskProgress = computed(() => Math.max(0, Math.min(100, Number(meshySettings.value.progress ?? 0))))
  const taskId = computed(() => String(meshySettings.value.taskId ?? '').trim())
  const statusText = computed(() => String(meshySettings.value.statusText ?? '').trim())

  const updateMeshyImageSettings = (patch: Record<string, unknown>) => {
    options.updateNodeSettings({
      imageSettings: {
        meshyImageSettings: {
          ...meshySettings.value,
          ...patch,
        },
      },
    })
  }

  const buildMeshyImageRequestPayload = () => {
    const node = options.getNode()
    if (!node) return { ok: false as const, error: '节点不存在' }

    const chatParams = isRecord(node.nodeChatParams) ? node.nodeChatParams : {}
    const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
    const meshyImageSettings = isRecord(imgSettings.meshyImageSettings) ? imgSettings.meshyImageSettings : {}

    const prompt = String(chatParams.prompt ?? meshyImageSettings.prompt ?? '').trim()
    if (!prompt) {
      return { ok: false as const, error: '请先填写提示词' }
    }

    const meshyAiModel = String(chatParams.meshyImageAiModel ?? meshyImageSettings.aiModel ?? 'nano-banana').trim()
    const meshyAspectRatio = String(chatParams.meshyAspectRatio ?? chatParams.aspectRatio ?? meshyImageSettings.aspectRatio ?? '1:1').trim()
    const meshyPoseMode = String(chatParams.meshyPoseMode ?? meshyImageSettings.poseMode ?? '').trim()
    const meshyGenerateMultiView = Boolean(chatParams.meshyGenerateMultiView ?? meshyImageSettings.generateMultiView)
    const meshyNegativePrompt = String(chatParams.meshyNegativePrompt ?? meshyImageSettings.negativePrompt ?? '').trim()
    const meshySeed = Number(chatParams.meshySeed ?? meshyImageSettings.seed ?? 0)
    const meshyOutputImageCount = Number(chatParams.meshyOutputImageCount ?? chatParams.quantity ?? meshyImageSettings.outputImageCount ?? 1)

    const payload: MeshyGeneratePayload = {
      target: 'image',
      family: 'text-to-image',
      mode: 'text-to-image',
      stage: 'preview',
      prompt,
      negative_prompt: meshyNegativePrompt,
      output_image_count: meshyOutputImageCount,
      ai_model: meshyAiModel,
    }

    if (meshyPoseMode) payload.pose_mode = meshyPoseMode
    if (meshyGenerateMultiView) {
      payload.generate_multi_view = true
    } else {
      payload.aspect_ratio = meshyAspectRatio
    }
    if (Number.isFinite(meshySeed) && meshySeed > 0) payload.seed = meshySeed

    return {
      ok: true as const,
      payload,
      promptText: prompt,
      promptSource: 'manual' as const,
      imageCount: 0,
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
          statusText: result.error,
        })
        return result
      }

      stopMeshyPoll(options.nodeId)

      updateMeshyImageSettings({
        taskStatus: 'pending',
        progress: 0,
        errorMessage: '',
        statusText: 'Meshy：正在创建任务…',
      })

      try {
        const res = await options.getComfyService().meshyGenerate(result.payload)
        if (!res.ok) {
          const msg = String(res.error ?? 'Meshy 创建任务失败')
          errorMessage.value = msg
          updateMeshyImageSettings({
            taskStatus: 'failed',
            errorMessage: msg,
            statusText: msg,
          })
          return { ok: false, error: msg }
        }

        const normalizedStatus = String(res.status ?? 'idle').trim()
        const newTaskId = String(res.taskId ?? '').trim()
        const mode = String(res.mode ?? result.payload.mode ?? 'text-to-image').trim()

        updateMeshyImageSettings({
          taskId: newTaskId,
          taskStatus: normalizedStatus === 'idle' ? 'pending' : normalizedStatus,
          progress: normalizedStatus === 'running' ? 5 : 0,
          statusText: 'Meshy：任务已创建，开始轮询状态…',
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
          statusText: msg,
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
        errorMessage: '',
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
        errorMessage: '',
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
    deleteTask,
  }
}
