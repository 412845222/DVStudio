import type {
	BlueprintAssetKind,
	BlueprintProjectService
} from '../../../network/BlueprintProjectService'
import { uploadProjectAsset } from '../../../electronBridge'

type PersistedAssetReference = {
	url: string
	absolutePath: string
	projectRelativePath?: string
	size?: number
}

export type ExternalAssetProgress = {
	loaded: number
	total: number
	speed: number
	percentage: number
}

type ImportAssetIntoProjectScopePayload = {
	kind: BlueprintAssetKind
	name: string
	projectId: number
	sourcePath?: string
	sourceUrl?: string
	bucket?: 'assets' | 'thumbnails'
}

type UploadAssetResult = {
	ok: boolean
	error?: string
	asset?: {
		url?: string
		absolutePath?: string
		projectRelativePath?: string
		relativePath?: string
		size?: number
	}
}

type ImportAssetResult = {
	url?: string
	sourcePath?: string
	absolutePath?: string
	projectRelativePath?: string
	relativePath?: string
	size?: number
}

type UseAIWorkflowAssetPersistenceOptions = {
	blueprintProjectService: Pick<BlueprintProjectService, 'uploadAsset'>
	getCurrentProjectId: () => number | null | undefined
	resolveBackendUrl: (value: string) => string
	fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
	importAssetIntoProjectScope: (
		payload: ImportAssetIntoProjectScopePayload
	) => Promise<ImportAssetResult | null | undefined>
}

export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return '0 B'
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatSpeed(bytesPerSec: number): string {
	if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
	if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
	if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
	if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
	return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}

async function downloadUrlWithProgress(
	url: string,
	onProgress?: (info: ExternalAssetProgress) => void,
	signal?: AbortSignal
): Promise<{ buffer: ArrayBuffer; contentType: string; totalBytes: number }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open('GET', url, true)
		xhr.responseType = 'arraybuffer'
		xhr.timeout = 0

		let startTime = Date.now()
		let lastLoaded = 0
		let lastTime = startTime
		let speed = 0
		let totalBytes = 0

		const updateSpeed = (loaded: number, now: number) => {
			const elapsed = (now - lastTime) / 1000
			if (elapsed >= 0.3) {
				const delta = loaded - lastLoaded
				speed = delta / elapsed
				lastLoaded = loaded
				lastTime = now
			}
		}

		xhr.onprogress = (event) => {
			if (!onProgress) return
			const loaded = event.loaded
			totalBytes = event.lengthComputable ? event.total : 0
			const now = Date.now()
			updateSpeed(loaded, now)
			const percentage = totalBytes > 0 ? Math.min(99, Math.round((loaded / totalBytes) * 100)) : 0
			onProgress({ loaded, total: totalBytes, speed, percentage })
		}

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const buffer = xhr.response as ArrayBuffer
				const total = buffer.byteLength
				const now = Date.now()
				speed = total / Math.max(0.001, (now - startTime) / 1000)
				onProgress?.({ loaded: total, total, speed, percentage: 100 })
				resolve({
					buffer,
					contentType: xhr.getResponseHeader('Content-Type') || 'application/octet-stream',
					totalBytes: total
				})
			} else {
				reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`))
			}
		}

		xhr.onerror = () => reject(new Error('Network error'))
		xhr.onabort = () => reject(new Error('Download aborted'))

		if (signal) {
			signal.addEventListener('abort', () => xhr.abort())
		}

		xhr.send(null)
	})
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
		const uploaded = (await options.blueprintProjectService.uploadAsset(
			file,
			kind,
			projectId > 0 ? { projectId } : undefined
		)) as UploadAssetResult
		if (!uploaded.ok) {
			throw new Error(String(uploaded.error || 'upload failed'))
		}
		const asset = uploaded.asset ?? {}
		const next = {
			url: options.resolveBackendUrl(String(asset.url || '')),
			absolutePath: String(asset.absolutePath || ''),
			projectRelativePath:
				String(asset.projectRelativePath || asset.relativePath || '').trim() || undefined,
			size: Number(asset.size || 0) || undefined
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
		onProgress?: (info: ExternalAssetProgress) => void
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
				projectRelativePath: uploaded.projectRelativePath,
				size: uploaded.size
			}
		}

		const isExternalHttp = /^https?:\/\//i.test(sourceUrl)

		// For external HTTP URLs (like Meshy CDN), always use IPC download to avoid CORS issues.
		// Do NOT attempt frontend XHR/fetch download for external URLs.
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
					url: options.resolveBackendUrl(String(imported.url || '')),
					absolutePath: String(imported.sourcePath || imported.absolutePath || '').trim(),
					projectRelativePath:
						String(imported.projectRelativePath || imported.relativePath || '').trim() || undefined,
					size: Number(imported.size || 0) || undefined
				}
			}
		}

		// Only fall back to frontend fetch for non-external URLs (local/backend URLs)
		if (sourceUrl && !isExternalHttp) {
			try {
				const uploaded = await uploadLocalResourceAndGetUrl(sourceUrl, payload.kind, safeName, {
					projectId
				})
				return {
					url: uploaded.url,
					absolutePath: uploaded.absolutePath || sourcePath,
					projectRelativePath: uploaded.projectRelativePath,
					size: uploaded.size
				}
			} catch {}
		}

		if (payload.kind === 'image' || payload.kind === 'video') return null

		// For external HTTP that failed IPC download, return null instead of the raw URL
		// to prevent frontend from trying to fetch it directly (which causes CORS)
		if (isExternalHttp) return null

		return sourceUrl
			? { url: sourceUrl, absolutePath: sourcePath, projectRelativePath: undefined }
			: null
	}

	return {
		uploadLocalResourceAndGetUrl,
		persistExternalAssetToProject
	}
}
