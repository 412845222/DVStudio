import type { Ref } from 'vue'
import { isElectron, registerProjectRoot, clearProjectRoot } from '../../../../electronBridge'

export const useAIWorkflowProjectIdentity = (payload: {
  currentProjectId: Ref<number | null>
  currentProjectName: Ref<string>
  currentProjectRootPath?: Ref<string>
  lastProjectStorageKey: string
}) => {
  const setSavedProject = (project: { id?: unknown; name?: unknown; rootPath?: unknown }, fallbackName = '') => {
    const id = Number(project?.id)
    const validId = Number.isFinite(id) && id > 0 ? id : null
    payload.currentProjectId.value = validId
    payload.currentProjectName.value = String(project?.name ?? fallbackName).trim() || String(fallbackName || '').trim()
    if (payload.currentProjectRootPath) {
      payload.currentProjectRootPath.value = String((project as any)?.rootPath ?? '').trim()
    }
    if (validId && isElectron()) {
      const rootPath = String((project as any)?.rootPath ?? '').trim()
      void registerProjectRoot(validId, rootPath)
    }
    if (payload.currentProjectId.value) {
      localStorage.setItem(payload.lastProjectStorageKey, String(payload.currentProjectId.value))
    } else {
      localStorage.removeItem(payload.lastProjectStorageKey)
    }
  }
  const setUnsavedProject = (name = '') => {
    const oldId = Number(payload.currentProjectId.value || 0)
    payload.currentProjectId.value = null
    payload.currentProjectName.value = String(name || '').trim()
    if (payload.currentProjectRootPath) {
      payload.currentProjectRootPath.value = ''
    }
    localStorage.removeItem(payload.lastProjectStorageKey)
    if (Number.isFinite(oldId) && oldId > 0 && isElectron()) {
      void clearProjectRoot(oldId)
    }
  }

  const readLastProjectId = () => {
    const raw = localStorage.getItem(payload.lastProjectStorageKey)
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  }

  const forgetLastProjectId = () => {
    localStorage.removeItem(payload.lastProjectStorageKey)
  }

  return {
    setSavedProject,
    setUnsavedProject,
    readLastProjectId,
    forgetLastProjectId,
  }
}
