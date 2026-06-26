import type {
	BlueprintAssetKind,
	BlueprintProjectService
} from '../../../network/BlueprintProjectService'

type PersistedAssetReference = {
	url: string
	absolutePath: string
	projectRelativePath?: string
}

type ImportAssetIntoProjectScopePayload = {
	kind: BlueprintAssetKind
	name: string
	projectId: number
	sourcePath?: string
	sourceUrl?: string
	bucket?: 'assets' | 'thumbnails'
}

type UseAIWorkflowAssetPersistenceOptions = {
	blueprintProjectService: Pick<BlueprintProjectService, 'uploadAsset'>
	getCurrentProjectId: () => number | null | undefined
	resolveBackendUrl: (value: string) => string
	fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
	importAssetIntoProjectScope: (payload: ImportAssetIntoProjectScopePayload) => Promise<any>
}

export const useAIWorkflowAssetPersistence = (options: UseAIWorkflowAssetPersistenceOptions) => {
	const localUrlUploadedAssetCache = new Map<string, PersistedAssetReference>()

	const sanitizeResourceName = (raw: unknown, fallback: string): string => {
		const name = String(raw ?? '').trim()
		if (!name || /[\u4e00-\u9fff]/.test(name)) {
			return String(fallback || 'resource').replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_')
		}
		return name.replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_').slice(0, 80)
	}

	const uploadLocalResourceAndGetUrl = async (
		localUrl: string,
		kind: BlueprintAssetKind,
		resourceName: string,
		opts?: { projectId?: number | null }
	): Promise<PersistedAssetReference> => {
		const currentProjectId = Number(opts?.projectId ?? options.getCurrentProjectId() ?? 0)
		const projectId =
			Number.isFinite(currentProjectId) && currentProjectId > 0 ? currentProjectId : 0
		const cacheKey = `${projectId}|${localUrl}`
		const cached = localUrlUploadedAssetCache.get(cacheKey)
		if (cached) return cached

		const safeName = sanitizeResourceName(resourceName, `${kind || 'resource'}_${Date.now()}`)
		const file = await options.fileFromUrl(localUrl, safeName.replace(/\.[^.]+$/, ''))
		const uploaded = await options.blueprintProjectService.uploadAsset(
			file,
			kind,
			projectId > 0 ? { projectId } : undefined
		)
		if (!uploaded.ok) {
			throw new Error(String((uploaded as any).error || 'upload failed'))
		}
		const asset = (uploaded as any).asset ?? {}
		const next = {
			url: options.resolveBackendUrl(String(asset.url || '')),
			absolutePath: String(asset.absolutePath || ''),
			projectRelativePath:
				String(asset.projectRelativePath || asset.relativePath || '').trim() || undefined
		}
		if (!next.url) throw new Error('empty uploaded asset url')
		localUrlUploadedAssetCache.set(cacheKey, next)
		return next
	}

	const persistExternalAssetToProject = async (payload: {
		kind: BlueprintAssetKind
		name: string
		sourceUrl?: string
		sourcePath?: string
	}) => {
		const currentProjectId = Number(options.getCurrentProjectId() ?? 0)
		const projectId =
			Number.isFinite(currentProjectId) && currentProjectId > 0 ? currentProjectId : 0
		let sourceUrl = String(payload.sourceUrl ?? '').trim()
		let sourcePath = String(payload.sourcePath ?? '').trim()
		const safeName = sanitizeResourceName(
			payload.name,
			`${payload.kind || 'resource'}_${Date.now()}`
		)
		if (sourceUrl) {
			sourceUrl = options.resolveBackendUrl(sourceUrl)
		}
		if (!sourceUrl && /^https?:\/\//i.test(sourcePath)) {
			sourceUrl = sourcePath
			sourcePath = ''
		}
		if (sourcePath && !/^[a-zA-Z]:[\\/]/.test(sourcePath) && !sourcePath.startsWith('/')) {
			sourcePath = ''
		}
		if (!sourceUrl && !sourcePath) return null

		if (sourceUrl && (sourceUrl.startsWith('blob:') || sourceUrl.startsWith('data:'))) {
			const uploaded = await uploadLocalResourceAndGetUrl(sourceUrl, payload.kind, safeName, {
				projectId
			})
			return {
				url: uploaded.url,
				absolutePath: uploaded.absolutePath,
				projectRelativePath: uploaded.projectRelativePath
			}
		}

		if (projectId > 0) {
			const imported = await options.importAssetIntoProjectScope({
				kind: payload.kind,
				name: safeName,
				projectId,
				sourcePath: sourcePath || undefined,
				sourceUrl: sourceUrl || undefined,
				bucket: 'assets'
			})
			if (imported) {
				return {
					url: options.resolveBackendUrl(String((imported as any).url || '')),
					absolutePath: String(
						(imported as any).sourcePath || (imported as any).absolutePath || ''
					).trim(),
					projectRelativePath:
						String(
							(imported as any).projectRelativePath || (imported as any).relativePath || ''
						).trim() || undefined
				}
			}
		}

		if (sourceUrl) {
			try {
				const uploaded = await uploadLocalResourceAndGetUrl(sourceUrl, payload.kind, safeName, {
					projectId
				})
				return {
					url: uploaded.url,
					absolutePath: uploaded.absolutePath || sourcePath,
					projectRelativePath: uploaded.projectRelativePath
				}
			} catch {
				// Keep original sourceUrl below if fetch/import fails.
			}
		}

		// 图片/视频节点不允许远程地址直渲，导入失败时直接返回空。
		if (payload.kind === 'image' || payload.kind === 'video') return null

		return sourceUrl
			? { url: sourceUrl, absolutePath: sourcePath, projectRelativePath: undefined }
			: null
	}

	return {
		uploadLocalResourceAndGetUrl,
		persistExternalAssetToProject
	}
}
