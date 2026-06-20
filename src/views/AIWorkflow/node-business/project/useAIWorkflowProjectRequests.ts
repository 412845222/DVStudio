import type { Ref } from 'vue'
import { isElectron } from '../../../../electronBridge'

export const useAIWorkflowProjectRequests = (payload: {
  activeRecoverySession: Ref<any>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  cancelActiveRecoverySession: () => void
  createEmptyDraftSnapshot: () => any
  store: {
    commit: (type: string, value: any) => void
  }
  setUnsavedProject: (name?: string) => void
  reuseRecordConfirm: Ref<any>
  resetComfyRuntime: () => void
  comfyAnchorAssignments: Map<string, Map<string, string>>
  comfyAnchorLocalizedOutputs: Map<string, Map<string, any>>
  loadProjectById: (projectId: number) => Promise<boolean>
  recoverComfyUIRunStates: (opts?: { silent?: boolean }) => Promise<void>
  blueprintProjectService: {
    deleteProject: (projectId: number) => Promise<any>
    openProjectFolder: (payload: { rootPath: string; name?: string; create?: boolean }) => Promise<any>
  }
  currentProjectId: Ref<number | null>
  refreshProjectList: () => Promise<void>
  saveProjectToBackend: (nameInput?: string, opts?: { silent?: boolean }) => Promise<boolean>
  currentProjectName: Ref<string>
  repairProjectAssetsNow: (opts?: { silent?: boolean }) => Promise<{ ok: boolean; changed: number; failed: number }>
}) => {
  const pickProjectFolder = async () => {
    const bridge = (window as any)?.dweb?.aiworkflow
    if (!bridge || typeof bridge.selectProjectFolder !== 'function') {
      return { ok: false as const, error: '当前运行环境不支持选择项目文件夹。' }
    }
    const result = await bridge.selectProjectFolder()
    const canceled = Boolean(result?.canceled)
    if (canceled) return { ok: false as const, canceled: true as const, error: '已取消选择文件夹。' }
    const path = String(result?.filePaths?.[0] || '').trim()
    if (!path) return { ok: false as const, error: '未选择有效文件夹。' }
    return { ok: true as const, path }
  }

  const onRequestSaveProject = async (request?: { name?: string }) => {
    const name = String(request?.name ?? '').trim()
    await payload.saveProjectToBackend(name || payload.currentProjectName.value)
  }

  const onRequestNewProject = async () => {
    if (!isElectron()) {
      payload.pushToast('新建项目需选择文件夹，仅支持桌面端。', 'warn')
      return
    }
    if (payload.activeRecoverySession.value) {
      payload.pushToast('资源恢复中，请稍候再新建项目。', 'warn')
      return
    }
    const ok = window.confirm('新建项目将清空当前蓝图未保存改动，是否继续？')
    if (!ok) return

    const picked = await pickProjectFolder()
    if (!picked.ok) {
      if (!('canceled' in picked && picked.canceled)) {
        payload.pushToast(String(picked.error || '选择项目文件夹失败。'), 'warn')
      }
      return
    }
    await createProjectAtRootPath(picked.path)
  }

  const createProjectAtRootPath = async (rootPath: string) => {
    const trimmedRoot = String(rootPath || '').trim()
    if (!trimmedRoot) return

    payload.cancelActiveRecoverySession()
    payload.store.commit('hydrateDraft', { snapshot: payload.createEmptyDraftSnapshot() })
    payload.setUnsavedProject('')
    payload.reuseRecordConfirm.value = null

    payload.resetComfyRuntime()
    payload.comfyAnchorAssignments.clear()
    payload.comfyAnchorLocalizedOutputs.clear()

    const fallbackName = String(payload.currentProjectName.value || '').trim() || '未命名项目'
    const opened = await payload.blueprintProjectService.openProjectFolder({
      rootPath: trimmedRoot,
      name: fallbackName,
      create: true,
    })
    if (!opened?.ok) {
      payload.pushToast(`新建项目失败：${String(opened?.error || 'unknown')}`, 'error')
      return
    }

    const project = (opened as any).project ?? {}
    const projectId = Number(project?.id || 0)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      payload.pushToast('新建项目失败：返回项目ID无效。', 'error')
      return
    }

    const loaded = await payload.loadProjectById(projectId)
    if (!loaded) {
      payload.pushToast('项目已创建，但加载失败。', 'warn')
      return
    }

    await payload.recoverComfyUIRunStates({ silent: true })
    await payload.refreshProjectList()
    payload.pushToast(`已新建项目：${String(project?.name || fallbackName)}`, 'info')
  }

  const onRequestNewProjectFromPath = async (rootPath: string) => {
    if (!String(rootPath || '').trim()) return
    if (!isElectron()) {
      payload.pushToast('新建项目需选择本地文件夹，当前运行环境不支持。', 'warn')
      return
    }
    if (payload.activeRecoverySession.value) {
      payload.pushToast('资源恢复中，请稍候再新建项目。', 'warn')
      return
    }
    await createProjectAtRootPath(rootPath)
  }

  const onRequestLoadProject = async (request: { projectId: number }) => {
    const id = Number(request?.projectId)
    if (!Number.isFinite(id) || id <= 0) return
    const loaded = await payload.loadProjectById(id)
    if (loaded) {
      await payload.recoverComfyUIRunStates({ silent: true })
      await payload.refreshProjectList()
    }
  }

  const onRequestDeleteProject = async (request: { projectId: number }) => {
    const id = Number(request?.projectId)
    if (!Number.isFinite(id) || id <= 0) return

    const res = await payload.blueprintProjectService.deleteProject(id)
    if (!res.ok) {
      payload.pushToast('删除项目失败：' + String((res as any).error || 'unknown'), 'error')
      return
    }

    if (payload.currentProjectId.value === id) {
      payload.setUnsavedProject('')
    }

    await payload.refreshProjectList()
    payload.pushToast('项目已删除。', 'info')
  }

  const onRequestRepairProjectAssets = async () => {
    if (payload.activeRecoverySession.value) {
      payload.pushToast('资源恢复中，请稍候再执行修复。', 'warn')
      return
    }
    await payload.repairProjectAssetsNow({ silent: false })
  }

  return {
    onRequestSaveProject,
    onRequestNewProject,
    onRequestNewProjectFromPath,
    onRequestLoadProject,
    onRequestDeleteProject,
    onRequestRepairProjectAssets,
  }
}
