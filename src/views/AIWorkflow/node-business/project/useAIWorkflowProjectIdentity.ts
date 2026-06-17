import type { Ref } from 'vue'

export const useAIWorkflowProjectIdentity = (payload: {
  currentProjectId: Ref<number | null>
  currentProjectName: Ref<string>
  lastProjectStorageKey: string
}) => {
  const setSavedProject = (project: { id?: unknown; name?: unknown }, fallbackName = '') => {
    const id = Number(project?.id)
    payload.currentProjectId.value = Number.isFinite(id) && id > 0 ? id : null
    payload.currentProjectName.value = String(project?.name ?? fallbackName).trim() || String(fallbackName || '').trim()
    if (payload.currentProjectId.value) {
      localStorage.setItem(payload.lastProjectStorageKey, String(payload.currentProjectId.value))
    } else {
      localStorage.removeItem(payload.lastProjectStorageKey)
    }
  }

  const setUnsavedProject = (name = '') => {
    payload.currentProjectId.value = null
    payload.currentProjectName.value = String(name || '').trim()
    localStorage.removeItem(payload.lastProjectStorageKey)
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
