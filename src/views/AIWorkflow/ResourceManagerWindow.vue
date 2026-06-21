<template>
  <div class="rmw-root">
    <!-- 加载阶段：只显示进度条，不显示面板内容 -->
    <template v-if="loading">
      <div class="rmw-loading-mask">
        <StartupProgressBar :state="progressState" />
      </div>
    </template>

    <!-- 加载完成后：显示资源管理器面板 -->
    <template v-else>
      <div class="rmw-content">
        <ResourceManagerPanel
          :open="true"
          :resources="resources"
          @close="handleClose"
          @remove="handleRemove"
          @preview="handlePreview"
          @refresh-missing="handleRefreshMissing"
          @drop-to-node="handleDropToNode"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import type { StartupProgressState } from '../../ui/UIComponent/StartupProgressBar.vue'
import { useStartupProgress } from '../../composables/useStartupProgress'
import ResourceManagerPanel from '../../ui/WorkFlow/ResourceManagerPanel.vue'
import { AIWorkflowKey } from '../../store/aiworkflow'
import type { WorkflowState } from '../../aiworkflow/types'
import { BlueprintProjectService } from '../../network/BlueprintProjectService'
import { useAIWorkflowResourceRecordCleanup } from './assets/useAIWorkflowResourceRecordCleanup'

// ============ 1. Store & Services ============
const store = useStore<WorkflowState>(AIWorkflowKey)
const blueprintProjectService = new BlueprintProjectService()

// ============ 2. URL Query 解析 ============
const routeParams = (() => {
  const raw = window.location.hash || ''
  const qIdx = raw.indexOf('?')
  if (qIdx < 0) return { projectId: null as number | null, title: '' as string }
  const params = new URLSearchParams(raw.slice(qIdx + 1))
  const rawId = params.get('projectId')
  const projectId = rawId != null ? (Number.isFinite(Number(rawId)) ? Number(rawId) : null) : null
  const title = decodeURIComponent(params.get('title') || '资源管理器')
  return { projectId, title }
})()

// ============ 3. 资源列表（从 store 读取） ============
const resources = computed(() => {
  const byId = (store.state as any).resourcesById as Record<string, any>
  const order = (store.state as any).resourceOrder as string[]
  if (!Array.isArray(order)) return []
  return order.map((id) => byId[id]).filter(Boolean)
})

// ============ 4. 当前项目 ID（从 store 读取） ============
const currentProjectId = computed(() => {
  const id = (store.state as any).projectId
  return Number.isFinite(id) ? id : null
})

// ============ 5. Toast 提示（资源管理器窗口内简单实现） ============
const toastMessage = ref<{ text: string; tone: 'info' | 'warn' | 'error' } | null>(null)
let toastTimer: number | null = null

const pushToast = (text: string, tone: 'info' | 'warn' | 'error' = 'info') => {
  if (toastTimer !== null) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  toastMessage.value = { text, tone }
  toastTimer = window.setTimeout(() => {
    toastMessage.value = null
    toastTimer = null
  }, 3000)
}

// ============ 6. 资源清理 composable ============
const {
  onRemoveResource,
  onRefreshMissingResourceRecords,
} = useAIWorkflowResourceRecordCleanup({
  store: store as any,
  currentProjectId,
  blueprintProjectService,
  pushToast,
  isComfyForwardResource: (resource: any) => {
    const forwardUrls = [
      'result.image',
      'image.upscaled.image',
      'images.output',
      '.intermediate.',
    ]
    const url = String(resource?.url || '').toLowerCase()
    return forwardUrls.some((u) => url.includes(u)) && url.includes('comfyui')
  },
  isDjangoManagedResource: (resource: any) => {
    const url = String(resource?.url || '').trim()
    if (!url) return false
    if (url.startsWith('dweb://')) return true
    if (url.startsWith('file://') || url.startsWith('blob:')) return false
    return true
  },
  mediaRelativePathFromUrl: (rawUrl: string) => {
    const url = String(rawUrl || '').trim()
    if (!url) return ''
    try {
      const u = new URL(url)
      const path = decodeURIComponent(u.pathname || '')
      const parts = path.split('/').filter(Boolean)
      return parts.slice(-3).join('/')
    } catch {
      return ''
    }
  },
  removeResourceRecordOnly: (resourceId: string) => {
    store.commit('removeResource', { resourceId: String(resourceId || '').trim() })
  },
})

// ============ 7. 进度条 ============
const { state: progressStateRaw, show, beginStep, markStepOk, markStepError, updateStep } =
  useStartupProgress()

const progressState = computed<StartupProgressState>(() => ({
  visible: true,
  title: progressStateRaw.value.title || '正在加载项目资源…',
  steps: progressStateRaw.value.steps.map((s: any) => ({
    key: s.key,
    label: s.label,
    status: s.status,
    detail: s.detail || undefined,
  })),
  autoHideMs: null,
}))

// ============ 8. 事件处理 ============
const handleClose = async () => {
  try {
    const w = window as any
    if (w.dweb && w.dweb.aiworkflow && typeof w.dweb.aiworkflow.closeResourceManager === 'function') {
      await w.dweb.aiworkflow.closeResourceManager()
      return
    }
  } catch {
    // ignore
  }
  // Web 环境 fallback：尝试关闭当前窗口
  try {
    window.close()
  } catch {
    // ignore
  }
}

const handleRemove = async (resourceId: string) => {
  await onRemoveResource(resourceId)
  // 通知主窗口资源已删除
  broadcastToMainWindow('remove', { resourceId })
}

const handlePreview = async (resourceId: string) => {
  const r = (store.state as any).resourcesById?.[String(resourceId)] as any
  if (!r) return

  // 优先打开文件所在文件夹
  const sourcePath = String(r.sourcePath || '').trim()
  if (sourcePath) {
    try {
      const w = window as any
      if (w.dweb && w.dweb.common && typeof w.dweb.common.openFolderForPath === 'function') {
        await w.dweb.common.openFolderForPath({ path: sourcePath })
        return
      }
    } catch {
      // ignore
    }
  }

  // Fallback：在新窗口打开 URL
  const kind = String(r.kind || '').toLowerCase()
  const url =
    kind === 'video'
      ? String(r.url || r.posterUrl || '').trim()
      : String(r.url || '').trim()
  if (url) {
    try {
      window.open(url, '_blank')
    } catch {
      // ignore
    }
  }

  // 通知主窗口预览了某个资源
  broadcastToMainWindow('preview', { resourceId })
}

const handleRefreshMissing = async (resourceIds: string[]) => {
  await onRefreshMissingResourceRecords(resourceIds)
}

const handleDropToNode = async (resourceId: string) => {
  // 广播到主窗口，由主窗口在蓝图光标位置创建节点
  broadcastToMainWindow('drop-to-node', { resourceId, position: null })
}

// ============ 9. IPC 广播到主窗口 ============
const broadcastToMainWindow = async (
  event: string,
  data: any
) => {
  try {
    const w = window as any
    if (w.dweb && w.dweb.aiworkflow && typeof w.dweb.aiworkflow.broadcastResourceEvent === 'function') {
      await w.dweb.aiworkflow.broadcastResourceEvent({ event, data })
    }
  } catch {
    // ignore
  }
}

// ============ 10. 监听来自主窗口的通知 ============
let mainWindowNotifyListenerId: number | null = null

const onMainWindowNotify = (payload: { event: string; data: any }) => {
  if (!payload?.event) return
  // 主窗口通知：资源列表可能已变化，触发刷新
  if (payload.event === 'resources-changed') {
    // store 已是响应式的，resources computed 会自动更新
    // 但如果需要强制刷新，可以在这里触发
  }
}

onMounted(async () => {
  // 注册监听主窗口通知
  const w = window as any
  if (w.dweb && w.dweb.aiworkflow && typeof w.dweb.aiworkflow.onResourceManagerNotify === 'function') {
    mainWindowNotifyListenerId = w.dweb.aiworkflow.onResourceManagerNotify(onMainWindowNotify)
  }

  // 加载流程 — 进度条分阶段反馈
  show('正在加载项目资源…', null)

  // Step 1: 注册项目资产根目录
  beginStep('register-root', '注册项目资产根目录')
  try {
    const projectId = currentProjectId.value
    const rootPath = (store.state as any).projectRootPath as string | undefined
    if (projectId != null && rootPath && w.dweb?.aiworkflow?.registerProjectRoot) {
      await w.dweb.aiworkflow.registerProjectRoot({ projectId, rootPath })
    }
    markStepOk('register-root')
  } catch (err) {
    markStepError('register-root', String(err?.message || err || 'failed'))
  }

  // Step 2: 解析资源记录（store 中已有数据）
  beginStep('resolve-assets', '解析资源记录')
  const total = resources.value.length
  markStepOk('resolve-assets', `已加载 ${total} 条资源记录`)

  // Step 3: 等待首帧渲染（DOM ready）
  beginStep('render', '渲染界面')
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  markStepOk('render', '界面渲染完成')

  // Step 4: 准备就绪
  beginStep('ready', '准备就绪')
  markStepOk('ready')

  // 微小延迟确保进度条动画可见，避免快速切换闪烁
  await new Promise<void>((resolve) => setTimeout(resolve, 300))

  // 更新文档标题
  document.title = `DVStudio · ${routeParams.title}`

  loading.value = false
})

onBeforeUnmount(() => {
  if (toastTimer !== null) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  const w = window as any
  if (mainWindowNotifyListenerId !== null && w.dweb?.aiworkflow?.offResourceManagerNotify) {
    w.dweb.aiworkflow.offResourceManagerNotify(mainWindowNotifyListenerId)
    mainWindowNotifyListenerId = null
  }
})

// ============ 11. 加载状态 ============
const loading = ref(true)
</script>

<style scoped>
.rmw-root {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  overflow: hidden;
}

.rmw-loading-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  z-index: 100;
}

.rmw-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 资源面板填满整个窗口 */
.rmw-content :deep(.wf-resource-panel) {
  position: relative;
  top: auto;
  left: auto;
  width: 100%;
  height: 100%;
  border: none;
  box-shadow: none;
  border-radius: 0;
}
</style>
