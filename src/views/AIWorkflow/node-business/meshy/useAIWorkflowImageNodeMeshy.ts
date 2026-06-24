import { ref, computed } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import { useAIWorkflowMeshyRuntime } from './useAIWorkflowMeshyRuntime'

const normalizeText = (value: unknown) => String(value ?? '').trim()

export const useAIWorkflowImageNodeMeshy = (options: {
  nodeId: string
  getNode: () => WorkflowNode | null
  updateNodeSettings: (patch: Record<string, any>) => void
  getComfyService: () => {
    meshyGenerate: (payload: Record<string, any>) => Promise<any>
    meshyTask: (taskId: string, mode: string) => Promise<any>
    meshyStop: (taskId: string, mode: string) => Promise<any>
    meshyDelete: (taskId: string, mode: string) => Promise<any>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  store: any
  persistExternalAssetToProject: (payload: {
    kind: 'image' | 'file'
    name: string
    sourceUrl?: string
    sourcePath?: string
  }) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string } | null>
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
    return node?.imageSettings?.meshyImageSettings ?? {}
  })

  const taskStatus = computed(() => String(meshySettings.value.taskStatus ?? 'idle').trim())
  const taskProgress = computed(() => Math.max(0, Math.min(100, Number(meshySettings.value.progress ?? 0))))
  const taskId = computed(() => String(meshySettings.value.taskId ?? '').trim())
  const statusText = computed(() => String(meshySettings.value.statusText ?? '').trim())

  const updateMeshyImageSettings = (patch: Record<string, any>) => {
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

    const chatParams = node.nodeChatParams ?? {}
    const meshyImageSettings = node.imageSettings?.meshyImageSettings ?? {}

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

    const payload: Record<string, any> = {
      mode: 'text-to-image',
      ai_model: meshyAiModel,
      prompt,
      negative_prompt: meshyNegativePrompt,
      output_image_count: meshyOutputImageCount,
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

      // 停止之前的轮询
      stopMeshyPoll(options.nodeId)

      // 更新状态为进行中
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

        // 开始轮询任务状态
        startMeshyPoll(options.nodeId, newTaskId, mode)

        return { ok: true, taskId: newTaskId }
      } catch (err: any) {
        const msg = 'Meshy 创建任务异常：' + String(err?.message ?? err ?? 'unknown')
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

  // 刷新任务状态
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
      await applyMeshyTaskResult(options.nodeId, res as Record<string, any>)
      options.pushToast('Meshy 任务状态已刷新。', 'info')
    } catch (err: any) {
      options.pushToast('刷新 Meshy 状态异常：' + String(err?.message ?? err ?? 'unknown'), 'warn')
    }
  }

  // 停止任务
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
    } catch (err: any) {
      options.pushToast('停止 Meshy 任务异常：' + String(err?.message ?? err ?? 'unknown'), 'warn')
    }
  }

  // 删除任务
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
    } catch (err: any) {
      options.pushToast('删除 Meshy 任务异常：' + String(err?.message ?? err ?? 'unknown'), 'warn')
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
