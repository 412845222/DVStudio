import type { Ref } from 'vue'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import type { ListProjectsResponse } from '../../../../network/BlueprintProjectService'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'

export const useAIWorkflowProjectCatalogImport = (payload: {
	blueprintProjectService: {
		listProjects: () => Promise<ListProjectsResponse>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	projectList: Ref<Array<{ id: number; name: string }>>
	isValidBlueprintSnapshot: (snapshot: unknown) => boolean
	stripUnrealExportRuntimeFromSnapshot: (snapshot: AIWorkflowDraftSnapshot) => AIWorkflowDraftSnapshot
	sanitizeBlueprintSnapshotForRuntime: (snapshot: AIWorkflowDraftSnapshot) => AIWorkflowDraftSnapshot
	hydrateBlueprintSnapshotSafely: (
		snapshot: AIWorkflowDraftSnapshot,
		sourceLabel: string
	) => boolean
	resetCurrentUnrealExportNodeRuntimeState: () => void
	setUnsavedProject: (name?: string) => void
	recoverComfyUIRunStates: (opts?: { silent?: boolean }) => Promise<void>
}) => {
	const refreshProjectList = async () => {
		const res = await payload.blueprintProjectService.listProjects()
		if (!res.ok) {
			payload.pushToast(t('aiworkflow.runtime.projectListLoadFailed', { error: String(res.error || 'unknown') }), 'warn')
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
				payload.pushToast(t('aiworkflow.runtime.importInvalidJsonStructure'), 'error')
				return
			}

			const runtimeSafeSnapshot = payload.sanitizeBlueprintSnapshotForRuntime(
				payload.stripUnrealExportRuntimeFromSnapshot(parsed)
			)
			if (!payload.hydrateBlueprintSnapshotSafely(runtimeSafeSnapshot, t('aiworkflow.runtime.importLocalBlueprintSource'))) return

			payload.resetCurrentUnrealExportNodeRuntimeState()
			payload.setUnsavedProject(
				String(file.name || '')
					.replace(/\.json$/i, '')
					.trim()
			)
			await payload.recoverComfyUIRunStates({ silent: true })
			payload.pushToast(t('aiworkflow.runtime.localBlueprintLoaded'), 'info')
		} catch (err: unknown) {
			payload.pushToast(t('aiworkflow.runtime.importFailedWithError', { error: getErrorMessage(err) }), 'error')
		}
	}

	return {
		refreshProjectList,
		onRequestImportLocalProject
	}
}
