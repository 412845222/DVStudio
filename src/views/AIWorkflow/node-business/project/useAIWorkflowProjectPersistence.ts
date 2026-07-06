import type { Ref } from 'vue'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { blueprintLog } from '../../blueprint-core/blueprintLog'
import { getErrorMessage, isNumber, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'

type AssetRecord = {
	url?: unknown
	projectRelativePath?: unknown
	relativePath?: unknown
	absolutePath?: unknown
	name?: unknown
	sourcePath?: unknown
}

type ProjectServiceResult = {
	ok?: unknown
	error?: unknown
	project?: unknown
	snapshot?: unknown
	projects?: unknown
	resolved?: unknown
	repaired?: unknown
	asset?: AssetRecord
}

type PersistenceResource = {
	kind?: unknown
	name?: unknown
	url?: unknown
	sourcePath?: unknown
	projectRelativePath?: unknown
	posterSourcePath?: unknown
	posterUrl?: unknown
	posterProjectRelativePath?: unknown
	[key: string]: unknown
}

type PersistenceStoreState = {
	nodesById: Record<string, unknown>
	nodeOrder: string[]
	resourcesById: Record<string, PersistenceResource>
	resourceOrder: string[]
}

type PersistenceStore = {
	state: PersistenceStoreState
	commit: (type: string, payload?: unknown) => void
}

type RecoverySession = Record<string, unknown>

type ProjectPersistencePayload = {
	blueprintProjectService: {
		loadProject: (projectId: number) => Promise<ProjectServiceResult>
		listProjects: () => Promise<ProjectServiceResult>
		saveProject: (input: {
			name: string
			snapshot: AIWorkflowDraftSnapshot
			projectId?: number
		}) => Promise<ProjectServiceResult>
		resolveAsset: (input: {
			projectId?: number | null
			kind?: 'image' | 'video' | 'file' | 'model'
			name?: string
			sourcePath?: string
			sourceUrl?: string
			projectRelativePath?: string
		}) => Promise<ProjectServiceResult>
		repairAsset: (input: {
			projectId?: number | null
			kind?: 'image' | 'video' | 'file' | 'model'
			name?: string
			projectRelativePath?: string
		}) => Promise<ProjectServiceResult>
	}
	currentProjectId: Ref<number | null>
	currentProjectName: Ref<string>
	setSavedProject: (
		project: { id?: unknown; name?: unknown; rootPath?: unknown },
		fallbackName?: string
	) => Promise<void>
	readLastProjectId: () => number | null
	forgetLastProjectId: () => void
	refreshProjectList: () => Promise<void>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	isValidBlueprintSnapshot: (snapshot: unknown) => boolean
	stripUnrealExportRuntimeFromSnapshot: (
		snapshot: AIWorkflowDraftSnapshot
	) => AIWorkflowDraftSnapshot
	normalizeSnapshotResourceUrls: (
		snapshot: AIWorkflowDraftSnapshot,
		resolveBackendUrl: (value: string) => string
	) => AIWorkflowDraftSnapshot
	sanitizeBlueprintSnapshotForRuntime: (
		snapshot: AIWorkflowDraftSnapshot
	) => AIWorkflowDraftSnapshot
	hydrateBlueprintSnapshotSafely: (
		snapshot: AIWorkflowDraftSnapshot,
		sourceLabel: string
	) => boolean
	resetCurrentUnrealExportNodeRuntimeState: () => void
	resolveBackendUrl: (value: string) => string
	toProjectAssetRuntimeUrl?: (
		projectId: number,
		projectRelativePath: string,
		fallbackUrl?: string
	) => string
	cancelActiveRecoverySession: () => void
	startRecoverySessionFromCurrentState: (payload: {
		nodesById: Record<string, unknown>
		nodeOrder: string[]
		resourcesById: Record<string, PersistenceResource>
	}) => string | null
	refreshRecoveryUrlReady: (
		sessionId: string,
		getResourceUrl: (resourceId: string) => string
	) => void
	finalizeRecoverySessionAfterUrlRecoveryAttempt: (
		sessionId: string,
		getResourceUrl: (resourceId: string) => string
	) => void
	recoverLocalResourcesFromHandles: (opts?: { silent?: boolean }) => Promise<
		| {
				missingHandle: number
				permissionDenied: number
		  }
		| null
		| undefined
	>
	migrateCurrentResourcesToProjectScope: (
		projectId: number,
		opts?: { silent?: boolean; projectRootPath?: string }
	) => Promise<{ changed: number }>
	repairAllProjectAssetsBeforeHydrate?: (
		projectId: number,
		snapshot: AIWorkflowDraftSnapshot
	) => Promise<AIWorkflowDraftSnapshot>
	buildPersistableSnapshotWithOptions: (opts: {
		uploadLocalResources: boolean
	}) => Promise<AIWorkflowDraftSnapshot>
	isElectron: () => boolean
	activeRecoverySession: Ref<RecoverySession | null>
	store: PersistenceStore
	uploadLocalResourceAndGetUrl: (
		localUrl: string,
		kind: 'image' | 'video' | 'file',
		resourceName: string,
		opts?: { projectId?: number | null }
	) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
	getCurrentProjectRootPath?: () => string
}

type ResourcePatch = Record<string, unknown>

export const useAIWorkflowProjectPersistence = (payload: ProjectPersistencePayload) => {
	const resolveOrRepairProjectScopedResources = async (
		projectId: number,
		opts?: { silent?: boolean; projectRootPath?: string }
	) => {
		const pid = Number(projectId)
		if (!Number.isFinite(pid) || pid <= 0) return { changed: 0, failed: 0 }

		const patches: Array<{ resourceId: string; patch: ResourcePatch }> = []
		let failed = 0
		const projectRoot =
			typeof opts?.projectRootPath === 'string'
				? opts.projectRootPath.replace(/\\/g, '/').replace(/\/+$/, '')
				: ''

		const buildDwebUrl = (relPath: string): string => {
			if (!relPath || !Number.isFinite(pid) || pid <= 0) return ''
			return `dweb://project-assets?projectId=${encodeURIComponent(String(pid))}&path=${encodeURIComponent(relPath)}`
		}

		for (const rid of payload.store.state.resourceOrder) {
			const resource = payload.store.state.resourcesById?.[rid]
			if (!resource) continue

			const kindRaw = String(resource.kind ?? '')
				.trim()
				.toLowerCase()
			const kind = (kindRaw === 'video' ? 'video' : kindRaw === 'image' ? 'image' : 'file') as
				| 'image'
				| 'video'
				| 'file'
			const rawName = String(resource.name || '').trim()
			const sourcePath = String(resource.sourcePath || '')
				.replace(/\\/g, '/')
				.trim()
			const rawUrl = String(resource.url || '').trim()
			const projectRelativePath = String(resource.projectRelativePath || '').trim()
			const posterSourcePath = String(resource.posterSourcePath || '')
				.replace(/\\/g, '/')
				.trim()
			const posterUrl = String(resource.posterUrl || '').trim()
			const posterProjectRelativePath = String(resource.posterProjectRelativePath || '').trim()

			const nextPatch: ResourcePatch = {}

			const hasChineseInName = /[\u4e00-\u9fff]/.test(rawName)
			if (hasChineseInName || !rawName) {
				const safeName = `${kind}_${String(rid).slice(-8)}`
				nextPatch.name = safeName
			}

			const isFileProtocol = rawUrl.toLowerCase().startsWith('file://')

			let inferredRelPath = projectRelativePath
			if (!inferredRelPath && sourcePath && projectRoot) {
				const normalizedSource = sourcePath.toLowerCase()
				const normalizedRoot = projectRoot.toLowerCase()
				if (normalizedSource.startsWith(normalizedRoot + '/')) {
					inferredRelPath = sourcePath.slice(projectRoot.length + 1)
				}
			}

			const needsUrlFromRelPath =
				inferredRelPath &&
				(!rawUrl || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:') || isFileProtocol)
			const needsFileProtocolFix = isFileProtocol
			const needsUrlFix = needsUrlFromRelPath || needsFileProtocolFix

			if (needsUrlFix) {
				if (inferredRelPath) {
					nextPatch.url = buildDwebUrl(inferredRelPath)
					nextPatch.projectRelativePath = inferredRelPath
				} else if (sourcePath) {
					try {
						const resolved = await payload.blueprintProjectService.resolveAsset({
							projectId: pid,
							kind,
							name: rawName || undefined,
							sourcePath: sourcePath || undefined,
							projectRelativePath: projectRelativePath || undefined
						})
						const asset = resolved.ok && resolved.resolved ? resolved.asset : null
						if (asset) {
							const nextUrl = isString(asset.url) ? asset.url.trim() : ''
							const nextRel = isString(asset.projectRelativePath)
								? asset.projectRelativePath.trim()
								: isString(asset.relativePath)
									? asset.relativePath.trim()
									: ''
							if (nextUrl) {
								nextPatch.url = payload.toProjectAssetRuntimeUrl
									? payload.toProjectAssetRuntimeUrl(
											pid,
											nextRel || inferredRelPath,
											payload.resolveBackendUrl(nextUrl)
										)
									: payload.resolveBackendUrl(nextUrl)
							}
							if (nextRel) nextPatch.projectRelativePath = nextRel
							if (isString(asset.absolutePath)) nextPatch.sourcePath = asset.absolutePath
						}
					} catch {
						failed += 1
					}
				}
			}

			const needsResourceFix =
				!rawUrl || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:') || isFileProtocol
			if (needsResourceFix && !needsUrlFix && (projectRelativePath || sourcePath || rawUrl)) {
				try {
					const resolved = await payload.blueprintProjectService.resolveAsset({
						projectId: pid,
						kind,
						name: rawName || undefined,
						sourcePath: sourcePath || undefined,
						sourceUrl: !isFileProtocol ? rawUrl : undefined,
						projectRelativePath: projectRelativePath || undefined
					})
					let asset = resolved.ok && resolved.resolved ? resolved.asset : null

					if (!asset && projectRelativePath) {
						const repaired = await payload.blueprintProjectService.repairAsset({
							projectId: pid,
							kind,
							name: rawName || undefined,
							projectRelativePath: projectRelativePath || undefined
						})
						asset = repaired.ok && repaired.repaired ? repaired.asset : null
					}

					if (asset) {
						const nextUrl = isString(asset.url) ? asset.url.trim() : ''
						const nextAbs = isString(asset.absolutePath) ? asset.absolutePath.trim() : ''
						const nextRel = isString(asset.projectRelativePath)
							? asset.projectRelativePath.trim()
							: isString(asset.relativePath)
								? asset.relativePath.trim()
								: ''
						if (nextUrl) {
							const resolvedHttpUrl = payload.resolveBackendUrl(nextUrl)
							nextPatch.url = payload.toProjectAssetRuntimeUrl
								? payload.toProjectAssetRuntimeUrl(
										pid,
										nextRel || projectRelativePath,
										resolvedHttpUrl
									)
								: resolvedHttpUrl
						}
						if (nextAbs) nextPatch.sourcePath = nextAbs
						if (nextRel) nextPatch.projectRelativePath = nextRel
					}
				} catch {
					failed += 1
				}
			}

			const posterIsFileProtocol = posterUrl.toLowerCase().startsWith('file://')
			const needsPosterUrlFix = posterIsFileProtocol
			const posterHasNoValidUrl =
				!posterUrl || posterUrl.startsWith('blob:') || posterUrl.startsWith('data:')
			const needsPosterFix = kind === 'video' && (posterHasNoValidUrl || needsPosterUrlFix)
			if (needsPosterFix && (posterProjectRelativePath || posterSourcePath || posterUrl)) {
				let inferredPosterRelPath = posterProjectRelativePath
				if (!inferredPosterRelPath && posterSourcePath && projectRoot) {
					const normalizedSource = posterSourcePath.toLowerCase()
					const normalizedRoot = projectRoot.toLowerCase()
					if (normalizedSource.startsWith(normalizedRoot + '/')) {
						inferredPosterRelPath = posterSourcePath.slice(projectRoot.length + 1)
					}
				}

				if (inferredPosterRelPath && (needsPosterUrlFix || !posterUrl)) {
					nextPatch.posterUrl = buildDwebUrl(inferredPosterRelPath)
					nextPatch.posterProjectRelativePath = inferredPosterRelPath
				} else {
					try {
						const posterResolved = await payload.blueprintProjectService.resolveAsset({
							projectId: pid,
							kind: 'image',
							name: `poster_${String(rid).slice(-8)}.jpg`,
							sourcePath: posterSourcePath || undefined,
							sourceUrl: !posterIsFileProtocol ? posterUrl : undefined,
							projectRelativePath: posterProjectRelativePath || undefined
						})
						let posterAsset =
							posterResolved.ok && posterResolved.resolved ? posterResolved.asset : null

						if (!posterAsset && posterProjectRelativePath) {
							const posterRepaired = await payload.blueprintProjectService.repairAsset({
								projectId: pid,
								kind: 'image',
								name: `poster_${String(rid).slice(-8)}.jpg`,
								projectRelativePath: posterProjectRelativePath
							})
							posterAsset =
								posterRepaired.ok && posterRepaired.repaired ? posterRepaired.asset : null
						}

						if (posterAsset) {
							const nextPosterUrl = isString(posterAsset.url) ? posterAsset.url.trim() : ''
							const nextPosterAbs = isString(posterAsset.absolutePath)
								? posterAsset.absolutePath.trim()
								: ''
							const nextPosterRel = isString(posterAsset.projectRelativePath)
								? posterAsset.projectRelativePath.trim()
								: isString(posterAsset.relativePath)
									? posterAsset.relativePath.trim()
									: ''
							if (nextPosterUrl) {
								const resolvedPosterHttpUrl = payload.resolveBackendUrl(nextPosterUrl)
								nextPatch.posterUrl = payload.toProjectAssetRuntimeUrl
									? payload.toProjectAssetRuntimeUrl(
											pid,
											nextPosterRel || posterProjectRelativePath,
											resolvedPosterHttpUrl
										)
									: resolvedPosterHttpUrl
							}
							if (nextPosterAbs) nextPatch.posterSourcePath = nextPosterAbs
							if (nextPosterRel) nextPatch.posterProjectRelativePath = nextPosterRel
						}
					} catch {
						failed += 1
					}
				}
			}

			if (Object.keys(nextPatch).length > 0) {
				patches.push({ resourceId: rid, patch: nextPatch })
			}
		}

		if (patches.length) {
			payload.store.commit('patchResourcesBatch', { patches })
		}

		if (failed > 0 && !opts?.silent) {
			payload.pushToast(t('aiworkflow.toast.resourceAutoFixFailed', { count: failed }), 'warn')
		}
		return { changed: patches.length, failed }
	}

	const persistUnstableImagesForSave = async () => {
		const resourcesById = payload.store.state.resourcesById ?? {}
		const resourceOrder = Array.isArray(payload.store.state.resourceOrder)
			? payload.store.state.resourceOrder
			: Object.keys(resourcesById)

		const toUpload: Array<{
			id: string
			url: string
			name: string
			projectRelativePath: string
			sourcePath: string
			localFileKey: string
		}> = []
		for (const rid of resourceOrder) {
			const r = resourcesById?.[rid]
			if (!r) continue
			const kind = String(r.kind ?? '').toLowerCase()
			if (kind !== 'image') continue
			const url = isString(r.url) ? String(r.url).trim() : ''
			if (!url) continue
			if (!url.startsWith('data:') && !url.startsWith('blob:')) continue

			const sourcePath = isString(r.sourcePath) ? String(r.sourcePath).trim() : ''
			const projectRelativePath = isString(r.projectRelativePath)
				? String(r.projectRelativePath).trim()
				: ''
			const localFileKey = isString(r.localFileKey) ? String(r.localFileKey).trim() : ''
			if (sourcePath || projectRelativePath || localFileKey) continue

			const name = String(r.name ?? `image_${rid}`).trim() || `image_${rid}`
			toUpload.push({ id: String(rid), url, name, projectRelativePath, sourcePath, localFileKey })
		}
		if (!toUpload.length) return true

		for (const item of toUpload) {
			try {
				const uploaded = await payload.uploadLocalResourceAndGetUrl(item.url, 'image', item.name, {
					projectId: payload.currentProjectId.value
				})
				payload.store.commit('patchResource', {
					resourceId: item.id,
					patch: {
						url: uploaded.url,
						sourcePath: uploaded.absolutePath || undefined,
						projectRelativePath: uploaded.projectRelativePath || undefined
					}
				})
			} catch {
				payload.pushToast(t('aiworkflow.toast.invalidResourceDeleted', { name: item.name }), 'info')
				blueprintLog.append(t('aiworkflow.toast.invalidResourceDeleted', { name: item.name }), {
					category: 'operation',
					level: 'INFO',
					tag: 'project-save',
					detail: { resourceId: item.id, name: item.name }
				})
				payload.store.commit('removeResource', { resourceId: item.id })
			}
		}

		return true
	}

	const loadProjectById = async (
		projectId: number,
		opts?: { silent?: boolean; suppressErrorToast?: boolean }
	) => {
		payload.cancelActiveRecoverySession()
		const res = await payload.blueprintProjectService.loadProject(projectId)
		if (!res.ok) {
			if (!opts?.suppressErrorToast) {
				payload.pushToast(t('aiworkflow.runtime.loadProjectFailed', { error: String(res.error || 'unknown') }), 'error')
			}
			blueprintLog.append(t('aiworkflow.runtime.loadProjectFailed', { error: String(res.error || 'unknown') }), {
				category: 'operation',
				level: 'ERROR',
				tag: 'project-load',
				detail: { projectId }
			})
			return false
		}
		if (!payload.isValidBlueprintSnapshot(res.snapshot)) {
			payload.pushToast(t('aiworkflow.runtime.loadProjectInvalidStructure'), 'error')
			blueprintLog.append(t('aiworkflow.runtime.loadProjectInvalidStructure'), {
				category: 'operation',
				level: 'ERROR',
				tag: 'project-load',
				detail: { projectId }
			})
			return false
		}

		const project = isRecord(res.project) ? res.project : {}
		const loadedProjectId = Number(project?.id)
		const fallbackLoadedId =
			Number.isFinite(loadedProjectId) && loadedProjectId > 0 ? loadedProjectId : projectId
		await payload.setSavedProject({ ...project, id: fallbackLoadedId })

		const normalizedSnapshot = payload.stripUnrealExportRuntimeFromSnapshot(
			payload.normalizeSnapshotResourceUrls(
				res.snapshot as AIWorkflowDraftSnapshot,
				payload.resolveBackendUrl
			)
		)
		let runtimeSafeSnapshot = payload.sanitizeBlueprintSnapshotForRuntime(normalizedSnapshot)
		const projectIdForAssetRepair = Number(
			isRecord(project) && isNumber(project.id)
				? project.id
				: payload.currentProjectId.value || projectId || 0
		)
		if (
			typeof payload.repairAllProjectAssetsBeforeHydrate === 'function' &&
			Number.isFinite(projectIdForAssetRepair) &&
			projectIdForAssetRepair > 0
		) {
			try {
				runtimeSafeSnapshot = await payload.repairAllProjectAssetsBeforeHydrate(
					projectIdForAssetRepair,
					runtimeSafeSnapshot
				)
			} catch {
				// keep load flow resilient if static asset canonicalization fails
			}
		}
		if (!payload.hydrateBlueprintSnapshotSafely(runtimeSafeSnapshot, t('aiworkflow.runtime.loadProjectSource'))) return false
		payload.resetCurrentUnrealExportNodeRuntimeState()

		const recoverySessionId = payload.startRecoverySessionFromCurrentState({
			nodesById: payload.store.state.nodesById ?? {},
			nodeOrder: Array.isArray(payload.store.state.nodeOrder)
				? payload.store.state.nodeOrder
				: Object.keys(payload.store.state.nodesById ?? {}),
			resourcesById: payload.store.state.resourcesById ?? {}
		})
		if (recoverySessionId) {
			payload.refreshRecoveryUrlReady(recoverySessionId, (resourceId) => {
				const resource = payload.store.state.resourcesById?.[resourceId]
				return resource && isString(resource.url) ? String(resource.url).trim() : ''
			})
		}

		const repairProjectId = Number(payload.currentProjectId.value || 0)
		if (Number.isFinite(repairProjectId) && repairProjectId > 0) {
			try {
				const projectRoot =
					typeof payload.getCurrentProjectRootPath === 'function'
						? payload.getCurrentProjectRootPath()
						: ''
				await resolveOrRepairProjectScopedResources(repairProjectId, {
					silent: true,
					projectRootPath: projectRoot
				})
			} catch {
				// keep load flow resilient if auto repair fails
			}
		}

		try {
			const st = await payload.recoverLocalResourcesFromHandles({ silent: Boolean(opts?.silent) })
			if (opts?.silent && st && (st.missingHandle || st.permissionDenied)) {
				payload.pushToast(
					t('aiworkflow.runtime.localResourcesNeedAuth', { missingHandle: String(st.missingHandle), permissionDenied: String(st.permissionDenied) }),
					'warn'
				)
			}
		} catch {
			// ignore
		}

		if (recoverySessionId) {
			payload.refreshRecoveryUrlReady(recoverySessionId, (resourceId) => {
				const resource = payload.store.state.resourcesById?.[resourceId]
				return resource && isString(resource.url) ? String(resource.url).trim() : ''
			})
			payload.finalizeRecoverySessionAfterUrlRecoveryAttempt(recoverySessionId, (resourceId) => {
				const resource = payload.store.state.resourcesById?.[resourceId]
				return resource && isString(resource.url) ? String(resource.url).trim() : ''
			})
		}

		if (Number.isFinite(loadedProjectId) && loadedProjectId > 0) {
			const projectRootPath =
				typeof payload.getCurrentProjectRootPath === 'function'
					? payload.getCurrentProjectRootPath()
					: ''
			const migratedOnLoad = await payload.migrateCurrentResourcesToProjectScope(loadedProjectId, {
				silent: true,
				projectRootPath
			})
			if (migratedOnLoad.changed > 0) {
				try {
					const migratedSnapshot = await payload.buildPersistableSnapshotWithOptions({
						uploadLocalResources: false
					})
					await payload.blueprintProjectService.saveProject({
						name: payload.currentProjectName.value || `project_${loadedProjectId}`,
						snapshot: migratedSnapshot,
						projectId: loadedProjectId
					})
				} catch {
					// ignore migration save-back failure on load path
				}
			}
		}

		if (!opts?.silent)
			payload.pushToast(
				t('aiworkflow.runtime.loadProjectSuccess', { name: payload.currentProjectName.value || `#${projectId}` }),
				'info'
			)
		blueprintLog.append(t('aiworkflow.runtime.loadProjectSuccess', { name: payload.currentProjectName.value || `#${projectId}` }), {
			category: 'operation',
			level: 'INFO',
			tag: 'project-load',
			detail: { projectId }
		})
		return true
	}

	const saveProjectToBackend = async (nameInput?: string, opts?: { silent?: boolean }) => {
		const silent = Boolean(opts?.silent)
		const wasUnsavedProject = !payload.currentProjectId.value

		if (wasUnsavedProject) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.saveProjectFirst'), 'warn')
			return false
		}

		const nextName = String(nameInput ?? payload.currentProjectName.value ?? '').trim()
		if (!nextName) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.enterProjectName'), 'warn')
			return false
		}

		if (payload.activeRecoverySession.value) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.recoveryInProgress'), 'warn')
			return false
		}

		const persisted = await persistUnstableImagesForSave()
		if (!persisted) return false

		const uploadLocalResources = payload.isElectron()

		let snapshot: AIWorkflowDraftSnapshot
		try {
			snapshot = await payload.buildPersistableSnapshotWithOptions({ uploadLocalResources })
		} catch (err: unknown) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.saveProjectFailed', { error: getErrorMessage(err) }), 'error')
			return false
		}
		const res = await payload.blueprintProjectService.saveProject({
			name: nextName,
			snapshot,
			projectId: payload.currentProjectId.value ?? undefined
		})
		if (!res.ok) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.saveProjectFailed', { error: String(res.error || 'unknown') }), 'error')
			blueprintLog.append(t('aiworkflow.runtime.saveProjectFailed', { error: String(res.error || 'unknown') }), {
				category: 'operation',
				level: 'ERROR',
				tag: 'project-save',
				detail: { name: nextName, projectId: payload.currentProjectId.value }
			})
			return false
		}

		const project = isRecord(res.project) ? res.project : {}
		const savedProjectId = Number(project?.id)
		const fallbackId =
			Number.isFinite(savedProjectId) && savedProjectId > 0
				? savedProjectId
				: payload.currentProjectId.value
		await payload.setSavedProject({ ...project, id: fallbackId }, nextName)

		const projectId = Number(payload.currentProjectId.value || 0)
		if (wasUnsavedProject && Number.isFinite(projectId) && projectId > 0) {
			const projectRootPath =
				typeof payload.getCurrentProjectRootPath === 'function'
					? payload.getCurrentProjectRootPath()
					: ''
			const migrated = await payload.migrateCurrentResourcesToProjectScope(projectId, {
				silent,
				projectRootPath
			})
			if (migrated.changed > 0) {
				try {
					const migratedSnapshot = await payload.buildPersistableSnapshotWithOptions({
						uploadLocalResources
					})
					const second = await payload.blueprintProjectService.saveProject({
						name: payload.currentProjectName.value,
						snapshot: migratedSnapshot,
						projectId
					})
					if (!second.ok && !silent) {
						payload.pushToast(t('aiworkflow.runtime.saveProjectMigrateFailed', { error: String(second.error || 'unknown') }), 'warn')
						blueprintLog.append(t('aiworkflow.runtime.saveProjectMigrateFailed', { error: String(second.error || 'unknown') }), {
							category: 'operation',
							level: 'WARN',
							tag: 'project-save',
							detail: { projectId }
						})
					}
				} catch (err: unknown) {
					if (!silent) {
						payload.pushToast(t('aiworkflow.runtime.saveProjectMigrateFailed', { error: getErrorMessage(err) }), 'warn')
					}
				}
			}
		}

		await payload.refreshProjectList()
		if (!silent) payload.pushToast(t('aiworkflow.toast.projectSaved', { name: payload.currentProjectName.value }), 'info')
		blueprintLog.append(t('aiworkflow.toast.projectSaved', { name: payload.currentProjectName.value || nextName }), {
			category: 'operation',
			level: 'INFO',
			tag: 'project-save',
			detail: { projectId: payload.currentProjectId.value, name: nextName }
		})
		return true
	}

	const tryAutoLoadLastProject = async () => {
		const id = payload.readLastProjectId()
		const listRes = await payload.blueprintProjectService.listProjects()
		if (!listRes?.ok) {
			if (id) {
				const ok = await loadProjectById(id, { silent: true, suppressErrorToast: true })
				if (!ok) payload.forgetLastProjectId()
			}
			return
		}

		const projects = Array.isArray(listRes.projects) ? listRes.projects : []
		if (!projects.length) {
			payload.forgetLastProjectId()
			return
		}

		const fallbackId = Number((projects[0] as Record<string, unknown>)?.id || 0)
		const targetId =
			id &&
			projects.some((p: unknown) => {
				const rec = isRecord(p) ? p : {}
				return Number(rec?.id || 0) === id
			})
				? id
				: Number.isFinite(fallbackId) && fallbackId > 0
					? fallbackId
					: null

		if (!targetId) {
			payload.forgetLastProjectId()
			return
		}

		const ok = await loadProjectById(targetId, {
			silent: true,
			suppressErrorToast: targetId !== id
		})
		if (!ok) {
			payload.forgetLastProjectId()
			if (targetId !== fallbackId && Number.isFinite(fallbackId) && fallbackId > 0) {
				await loadProjectById(fallbackId, { silent: true, suppressErrorToast: true })
			}
		}
	}

	const repairProjectAssetsNow = async (opts?: { silent?: boolean }) => {
		const silent = Boolean(opts?.silent)
		const pid = Number(payload.currentProjectId.value || 0)
		if (!Number.isFinite(pid) || pid <= 0) {
			if (!silent) payload.pushToast(t('aiworkflow.runtime.repairAssetsFirst'), 'warn')
			return { ok: false as const, changed: 0, failed: 0 }
		}
		const result = await resolveOrRepairProjectScopedResources(pid, { silent })
		if (!silent) {
			if (result.changed > 0) {
				payload.pushToast(t('aiworkflow.toast.resourceFixComplete', { count: result.changed }), 'info')
			} else {
				payload.pushToast(t('aiworkflow.runtime.resourceCheckComplete'), 'info')
			}
		}
		return { ok: true as const, ...result }
	}

	return {
		loadProjectById,
		saveProjectToBackend,
		tryAutoLoadLastProject,
		repairProjectAssetsNow
	}
}
