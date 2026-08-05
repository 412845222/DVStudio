import type { WorkflowResource } from '../../../aiworkflow/types'
import { t } from '../../../i18n'

export const useAIWorkflowResourceRecordCleanup = (payload: {
	store: {
		state: {
			resourcesById: Record<string, WorkflowResource>
		}
	}
	currentProjectId: { value: number | null }
	blueprintProjectService: {
		deleteAsset: (input: {
			projectId: number | null
			resourceId?: string
			url?: string
			sourcePath?: string
			relativePath?: string
		}) => Promise<{ ok: boolean; error?: unknown }>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	isComfyForwardResource: (resource: unknown) => boolean
	isDjangoManagedResource: (resource: unknown) => boolean
	mediaRelativePathFromUrl: (rawUrl: string) => string
	removeResourceRecordOnly: (resourceId: string) => void
}) => {
	const removeResourceByPolicy = async (
		resourceId: string,
		opts?: { silent?: boolean }
	): Promise<{ removed: boolean; reason: 'record' | 'django-file' | 'skip' | 'error' }> => {
		const rid = String(resourceId || '').trim()
		if (!rid) return { removed: false, reason: 'skip' }
		const resource = payload.store.state.resourcesById?.[rid]
		if (!resource) return { removed: false, reason: 'skip' }

		const posterUrl = String(resource?.posterUrl || '').trim()
		const posterSourcePath = String(resource?.posterSourcePath || '').trim()

		const deletePosterAssetIfNeeded = async () => {
			if (!posterUrl && !posterSourcePath) return
			const posterRef = { url: posterUrl, sourcePath: posterSourcePath }
			if (!payload.isDjangoManagedResource(posterRef)) return

			const resp = await payload.blueprintProjectService.deleteAsset({
				projectId: payload.currentProjectId.value,
				url: posterUrl || undefined,
				sourcePath: posterSourcePath || undefined,
				relativePath: payload.mediaRelativePathFromUrl(posterUrl) || undefined
			})

			if (!resp.ok && !opts?.silent) {
				payload.pushToast(
					t('aiworkflow.toast.thumbDeleteFailed', { error: String(resp.error || 'unknown') }),
					'warn'
				)
			}
		}

		if (payload.isComfyForwardResource(resource)) {
			await deletePosterAssetIfNeeded()
			payload.removeResourceRecordOnly(rid)
			return { removed: true, reason: 'record' }
		}

		if (!payload.isDjangoManagedResource(resource)) {
			await deletePosterAssetIfNeeded()
			payload.removeResourceRecordOnly(rid)
			return { removed: true, reason: 'record' }
		}

		const resp = await payload.blueprintProjectService.deleteAsset({
			projectId: payload.currentProjectId.value,
			resourceId: rid,
			url: String(resource?.url || '').trim() || undefined,
			sourcePath: String(resource?.sourcePath || '').trim() || undefined,
			relativePath: payload.mediaRelativePathFromUrl(String(resource?.url || '')) || undefined
		})

		if (!resp.ok) {
			if (!opts?.silent)
				payload.pushToast(
					t('aiworkflow.toast.resourceDeleteFailed', { error: String(resp.error || 'unknown') }),
					'error'
				)
			return { removed: false, reason: 'error' }
		}

		await deletePosterAssetIfNeeded()
		payload.removeResourceRecordOnly(rid)
		return { removed: true, reason: 'django-file' }
	}

	const onRemoveResource = async (resourceId: string) => {
		await removeResourceByPolicy(resourceId)
	}

	const onRefreshMissingResourceRecords = async (resourceIds: string[]) => {
		const ids = Array.from(
			new Set((resourceIds ?? []).map((id) => String(id || '').trim()).filter((id) => !!id))
		)
		if (!ids.length) {
			payload.pushToast(t('aiworkflow.toast.noThumblessResources'), 'info')
			return
		}

		let removed = 0
		for (const rid of ids) {
			const result = await removeResourceByPolicy(rid, { silent: true })
			if (result.removed) removed += 1
		}
		payload.pushToast(
			t('aiworkflow.toast.thumblessCleaned', { removed, total: ids.length }),
			'info'
		)
	}

	return {
		removeResourceByPolicy,
		onRemoveResource,
		onRefreshMissingResourceRecords
	}
}
