import type { Ref } from 'vue'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { getErrorMessage } from '../../../../types/utils'

export const useAIWorkflowProjectCatalogImport = (payload: {
  blueprintProjectService: {
    listProjects: () => Promise<any>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  projectList: Ref<any[]>
  isValidBlueprintSnapshot: (snapshot: unknown) => boolean
  stripUnrealExportRuntimeFromSnapshot: (snapshot: any) => any
  sanitizeBlueprintSnapshotForRuntime: (snapshot: any) => AIWorkflowDraftSnapshot
  hydrateBlueprintSnapshotSafely: (snapshot: AIWorkflowDraftSnapshot, sourceLabel: string) => boolean
  resetCurrentUnrealExportNodeRuntimeState: () => void
  setUnsavedProject: (name?: string) => void
  recoverComfyUIRunStates: (opts?: { silent?: boolean }) => Promise<void>
}) => {
  const refreshProjectList = async () => {
    const res = await payload.blueprintProjectService.listProjects()
    if (!res.ok) {
      payload.pushToast('读取项目列表失败：' + String(res.error || 'unknown'), 'warn')
      return
    }
    payload.projectList.value = Array.isArray(res.projects) ? res.projects : []
  }

  const onRequestImportLocalProject = async (request: { file: File }) => {
    const file = request?.file
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!payload.isValidBlueprintSnapshot(parsed)) {
        payload.pushToast('导入失败：JSON 不是有效的蓝图项目结构。', 'error')
        return
      }

      const runtimeSafeSnapshot = payload.sanitizeBlueprintSnapshotForRuntime(
        payload.stripUnrealExportRuntimeFromSnapshot(parsed)
      )
      if (!payload.hydrateBlueprintSnapshotSafely(runtimeSafeSnapshot, '导入本地蓝图')) return

      payload.resetCurrentUnrealExportNodeRuntimeState()
      payload.setUnsavedProject(String(file.name || '').replace(/\.json$/i, '').trim())
      await payload.recoverComfyUIRunStates({ silent: true })
      payload.pushToast('已从本地文件加载蓝图。', 'info')
    } catch (err: unknown) {
      payload.pushToast('导入失败：' + getErrorMessage(err), 'error')
    }
  }

  return {
    refreshProjectList,
    onRequestImportLocalProject,
  }
}
