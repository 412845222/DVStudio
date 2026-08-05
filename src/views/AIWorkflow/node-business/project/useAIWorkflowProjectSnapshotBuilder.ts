import type { WorkflowState } from '../../../../aiworkflow/types'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { t } from '../../../../i18n'

type UseAIWorkflowProjectSnapshotBuilderOptions = {
	store: {
		state: WorkflowState
		commit: (type: string, payload: unknown) => void
	}
	currentProjectId: { value: number | null }
	resolveBackendUrl: (value: string) => string
	uploadLocalResourceAndGetUrl: (
		url: string,
		kind: 'image' | 'video' | 'file',
		name: string,
		opts?: { projectId?: number | null }
	) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
	toProjectAssetRuntimeUrl?: (
		projectId: number,
		projectRelativePath: string,
		fallbackUrl?: string
	) => string
	persistExternalAssetToProject?: (payload: {
		kind: 'image' | 'video' | 'file'
		name: string
		sourceUrl?: string
		sourcePath?: string
	}) => Promise<{
		url: string
		absolutePath: string
		projectRelativePath?: string
	} | null>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	stripUnrealExportRuntimeFromNodes?: (
		nodesById: WorkflowState['nodesById']
	) => WorkflowState['nodesById']
}

export const useAIWorkflowProjectSnapshotBuilder = (
	payload: UseAIWorkflowProjectSnapshotBuilderOptions
) => {
	const buildPersistableSnapshotWithOptions = async (opts?: {
		uploadLocalResources?: boolean
	}): Promise<AIWorkflowDraftSnapshot> => {
		const resourcesById: WorkflowState['resourcesById'] = {}
		const resourceOrder: string[] = []
		let uploadedCount = 0
		const uploadLocal = opts?.uploadLocalResources === true
		const omittedResourceIds = new Set<string>()

		const projectAssetRuntimeUrl = (projectRelativePath: string, fallbackUrl = '') => {
			const pid = Number(payload.currentProjectId.value || 0)
			const rel = String(projectRelativePath || '').trim()
			if (!Number.isFinite(pid) || pid <= 0 || !rel) return fallbackUrl
			return payload.toProjectAssetRuntimeUrl
				? payload.toProjectAssetRuntimeUrl(pid, rel, fallbackUrl)
				: `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
		}

		for (const rid of payload.store.state.resourceOrder) {
			const resource = payload.store.state.resourcesById[rid]
			if (!resource) continue
			const rawUrl = typeof resource.url === 'string' ? String(resource.url) : ''
			const sourcePath =
				typeof resource.sourcePath === 'string' ? String(resource.sourcePath).trim() : ''
			const projectRelativePath =
				typeof resource.projectRelativePath === 'string'
					? String(resource.projectRelativePath).trim()
					: ''
			const localFileKey =
				typeof resource.localFileKey === 'string' ? String(resource.localFileKey).trim() : ''

			// Skip resources that have projectRelativePath but no sourcePath and no valid URL
			// This handles the case where the file was deleted or never existed on disk
			if (projectRelativePath && !sourcePath && !localFileKey) {
				const hasValidUrl =
					rawUrl &&
					(rawUrl.toLowerCase().startsWith('dweb://project-assets') ||
						rawUrl.toLowerCase().startsWith('http://') ||
						rawUrl.toLowerCase().startsWith('https://'))
				if (!hasValidUrl) {
					omittedResourceIds.add(rid)
					continue
				}
			}

			// Keep resource if it has a usable url, an absolute sourcePath, a project asset path, or an IndexedDB handle.
			if (!rawUrl && !sourcePath && !projectRelativePath && !localFileKey) continue

			const isLocal = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
			if (isLocal && !uploadLocal) {
				// Prefer persisting local resources by absolute path (backend recovery) or localFileKey (IndexedDB handle recovery).
				if (!sourcePath && !localFileKey) {
					// If we don't have an OS path, we can't recover after refresh, so keep previous lightweight behavior.
					omittedResourceIds.add(rid)
					continue
				}
			}

			let persistUrl = rawUrl ? payload.resolveBackendUrl(rawUrl) : ''
			let backendAbsolutePath = ''
			let backendProjectRelativePath = projectRelativePath
			const kind = (resource.kind === 'video' ? 'video' : 'image') as 'image' | 'video'

			if (
				!isLocal &&
				backendProjectRelativePath &&
				!rawUrl.toLowerCase().startsWith('dweb://project-assets')
			) {
				persistUrl = projectAssetRuntimeUrl(backendProjectRelativePath, persistUrl)
			}

			if (uploadLocal && isLocal) {
				if (backendProjectRelativePath) {
					persistUrl = projectAssetRuntimeUrl(backendProjectRelativePath, '')
				} else {
					try {
						const uploaded = await payload.uploadLocalResourceAndGetUrl(
							rawUrl,
							kind,
							String(resource.name || kind),
							{
								projectId: payload.currentProjectId.value
							}
						)
						persistUrl = uploaded.url
						backendAbsolutePath = uploaded.absolutePath
						backendProjectRelativePath =
							String(uploaded.projectRelativePath || '').trim() || backendProjectRelativePath
						uploadedCount += 1
					} catch {
						if (sourcePath || localFileKey) {
							persistUrl = ''
						} else if (rawUrl.startsWith('data:')) {
							persistUrl = rawUrl
						} else {
							omittedResourceIds.add(rid)
							continue
						}
					}
				}
			}

			// When not uploading local resources but sourcePath exists, do not persist blob/data urls.
			if (!uploadLocal && isLocal && (sourcePath || localFileKey)) {
				persistUrl = ''
			}

			resourcesById[rid] = {
				...resource,
				url: persistUrl,
				// Prefer backend absolute path when uploaded; otherwise keep existing (local) sourcePath.
				sourcePath: backendAbsolutePath || sourcePath || '',
				projectRelativePath: backendProjectRelativePath || undefined,
				localFileKey: localFileKey || undefined,
				// posterUrl is usually blob: and can't survive refresh; keep it only when we have a stable url.
				posterUrl: persistUrl ? resource.posterUrl : undefined
			}
			resourceOrder.push(rid)
		}

		if (uploadLocal && uploadedCount > 0) {
			payload.pushToast(t('aiworkflow.toast.resourcesUploaded', { count: uploadedCount }), 'info')
		}

		let nodesById: WorkflowState['nodesById'] = payload.store.state.nodesById
		if (!uploadLocal && omittedResourceIds.size) {
			const next: WorkflowState['nodesById'] = {}
			for (const id of payload.store.state.nodeOrder) {
				const node = payload.store.state.nodesById[id]
				if (!node) continue
				const resourceId = String(node.resourceId ?? '').trim()
				if (resourceId && omittedResourceIds.has(resourceId)) {
					next[id] = { ...node, resourceId: undefined }
				} else {
					next[id] = node
				}
			}
			nodesById = next
		}

		const snapshot: AIWorkflowDraftSnapshot = {
			schemaVersion: AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION,
			savedAt: Date.now(),
			viewport: payload.store.state.viewport,
			nodesById,
			nodeOrder: payload.store.state.nodeOrder,
			edgesById: payload.store.state.edgesById,
			edgeOrder: payload.store.state.edgeOrder,
			resourcesById,
			resourceOrder,
			selectedNodeId: payload.store.state.selectedNodeId,
			selectedNodeIds: payload.store.state.selectedNodeIds
		}

		// 多选标签持久化
		if (
			payload.store.state.selectionTagsByKey &&
			Object.keys(payload.store.state.selectionTagsByKey).length
		) {
			snapshot.selectionTagsByKey = payload.store.state.selectionTagsByKey
		}

		// 已保存选区框持久化
		if (
			payload.store.state.savedSelectionFrames &&
			payload.store.state.savedSelectionFrames.length
		) {
			snapshot.savedSelectionFrames = payload.store.state.savedSelectionFrames
		}

		snapshot.nodeCheckboxVisible = payload.store.state.nodeCheckboxVisible

		return snapshot
	}

	return {
		buildPersistableSnapshotWithOptions
	}
}
