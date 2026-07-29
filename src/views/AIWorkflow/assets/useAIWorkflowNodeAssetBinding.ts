import type { BlueprintProjectService } from '../../../network/BlueprintProjectService'
import type { WorkflowResource, WorkflowNode } from '../../../aiworkflow/types'
import { t } from '../../../i18n'

type UploadedAsset = {
	url?: string
	absolutePath?: string
	projectRelativePath?: string
	relativePath?: string
	[key: string]: unknown
}

type UploadAssetResult = {
	ok: boolean
	asset?: UploadedAsset
	[key: string]: unknown
}

type FileWithPath = File & {
	path?: string
}

type AIWorkflowStore = {
	state: {
		resourcesById: Record<string, WorkflowResource>
		nodesById: Record<string, WorkflowNode>
		[key: string]: unknown
	}
	commit: (type: string, payload?: Record<string, unknown>) => void
}

export const useAIWorkflowNodeAssetBinding = (options: {
	store: AIWorkflowStore
	makeResourceId: () => string
	setObjectUrl: (key: string, url: string) => void
	revokeTrackedObjectUrlsForResource: (key: string) => void
	resolveBackendUrl: (value: string) => string
	blueprintProjectService: Pick<BlueprintProjectService, 'uploadAsset'>
	getCurrentProjectId: () => number | null | undefined
	setNodeResourceWithCleanup: (payload: {
		nodeId: string
		resourceId: string | null
		resourcePath?: string
	}) => void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	autoSizeImageNodeFromDims: (nodeId: string, width: number, height: number) => void
	scheduleVideoMetadataRead: (payload: {
		sessionId?: string
		resourceId: string
		nodeId: string
		url: string
	}) => void
	ensureVideoResourcePoster: (resourceId: string, url: string) => Promise<void>
	revokeNodeModel3DObjectUrl: (nodeId: string) => void
	isDjangoManagedResource: (resource: WorkflowResource | null | undefined) => boolean
}) => {
	const imageResourcePersistingIds = new Set<string>()
	const videoResourcePersistingIds = new Set<string>()

	const shouldUseAnonymousCrossOrigin = (url: string) => {
		const text = String(url || '').trim()
		if (!text) return false
		return !text.startsWith('blob:') && !text.startsWith('data:')
	}

	const nodeStillExists = (nodeId: string) => Boolean(options.store.state.nodesById?.[nodeId])

	const persistNodeImageResourceLocally = async (payload: {
		resourceId: string
		nodeId: string
		file: File
	}) => {
		const resourceId = String(payload.resourceId ?? '').trim()
		if (!resourceId || imageResourcePersistingIds.has(resourceId)) return

		const current = options.store.state.resourcesById?.[resourceId]
		if (!current || current.kind !== 'image' || options.isDjangoManagedResource(current)) return

		imageResourcePersistingIds.add(resourceId)
		try {
			const currentProjectId = Number(options.getCurrentProjectId() ?? 0)
			const uploaded = await options.blueprintProjectService.uploadAsset(
				payload.file,
				'image',
				Number.isFinite(currentProjectId) && currentProjectId > 0
					? { projectId: currentProjectId }
					: undefined
			)
			if (!uploaded.ok) return

			const asset = (uploaded as UploadAssetResult).asset ?? {}
			const localizedUrl = options.resolveBackendUrl(String(asset.url || ''))
			const localizedPath = String(asset.absolutePath || '').trim()
			const localizedProjectRelativePath = String(
				asset.projectRelativePath || asset.relativePath || ''
			).trim()
			if (!localizedUrl) return

			const latest = options.store.state.resourcesById?.[resourceId]
			const previousUrl = String(latest?.url ?? '').trim()
			if (previousUrl.startsWith('blob:')) {
				options.revokeTrackedObjectUrlsForResource(resourceId)
			}

			options.store.commit('patchResource', {
				resourceId,
				patch: {
					url: localizedUrl,
					sourcePath: localizedPath || undefined,
					projectRelativePath: localizedProjectRelativePath || undefined
				}
			})

			const boundNode = options.store.state.nodesById[payload.nodeId]
			if (boundNode && String(boundNode.resourceId ?? '').trim() === resourceId && localizedPath) {
				options.store.commit('setNodeResourcePath', {
					nodeId: payload.nodeId,
					resourcePath: localizedPath
				})
			}
		} catch {
			// Keep the local object url when localization fails.
		} finally {
			imageResourcePersistingIds.delete(resourceId)
		}
	}

	const persistNodeVideoResourceLocally = async (payload: {
		resourceId: string
		nodeId: string
		file: File
	}) => {
		const resourceId = String(payload.resourceId ?? '').trim()
		if (!resourceId || videoResourcePersistingIds.has(resourceId)) return

		const current = options.store.state.resourcesById?.[resourceId]
		if (!current || current.kind !== 'video' || options.isDjangoManagedResource(current)) return

		videoResourcePersistingIds.add(resourceId)
		try {
			const currentProjectId = Number(options.getCurrentProjectId() ?? 0)
			const uploaded = await options.blueprintProjectService.uploadAsset(
				payload.file,
				'video',
				Number.isFinite(currentProjectId) && currentProjectId > 0
					? { projectId: currentProjectId }
					: undefined
			)
			if (!uploaded.ok) return

			const asset = (uploaded as UploadAssetResult).asset ?? {}
			const localizedUrl = options.resolveBackendUrl(String(asset.url || ''))
			const localizedPath = String(asset.absolutePath || '').trim()
			const localizedProjectRelativePath = String(
				asset.projectRelativePath || asset.relativePath || ''
			).trim()
			if (!localizedUrl) return

			const latest = options.store.state.resourcesById?.[resourceId]
			const previousUrl = String(latest?.url ?? '').trim()
			if (previousUrl.startsWith('blob:')) {
				options.revokeTrackedObjectUrlsForResource(resourceId)
			}

			options.store.commit('patchResource', {
				resourceId,
				patch: {
					url: localizedUrl,
					sourcePath: localizedPath || undefined,
					projectRelativePath: localizedProjectRelativePath || undefined
				}
			})

			const boundNode = options.store.state.nodesById[payload.nodeId]
			if (boundNode && String(boundNode.resourceId ?? '').trim() === resourceId && localizedPath) {
				options.store.commit('setNodeResourcePath', {
					nodeId: payload.nodeId,
					resourcePath: localizedPath
				})
			}
		} catch {
			// Keep the local object url when localization fails.
		} finally {
			videoResourcePersistingIds.delete(resourceId)
		}
	}

	const uploadNodeResource = async (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: {
			autoDistribute?: boolean
			onAfterBind?: (payload: { resourceId: string; url: string }) => void
		}
	) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return
		const sourcePath =
			typeof (file as FileWithPath)?.path === 'string'
				? String((file as FileWithPath).path).trim()
				: ''

		let finalUrl = ''
		let assetAbsPath = ''
		let assetRelPath = ''
		let usedBlobUrl = false

		const currentProjectId = Number(options.getCurrentProjectId() ?? 0)
		if (currentProjectId > 0) {
			try {
				const uploaded = await options.blueprintProjectService.uploadAsset(
					file,
					kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file',
					{ projectId: currentProjectId }
				)
				if (uploaded.ok) {
					const asset = (uploaded as UploadAssetResult).asset ?? {}
					finalUrl = options.resolveBackendUrl(String(asset.url || ''))
					assetAbsPath = String(asset.absolutePath || '').trim()
					assetRelPath = String(asset.projectRelativePath || asset.relativePath || '').trim()
				}
			} catch {
				// fall back to blob URL below
			}
		}

		if (!finalUrl) {
			finalUrl = URL.createObjectURL(file)
			usedBlobUrl = true
		}

		const resourceId = options.makeResourceId()
		if (usedBlobUrl) {
			options.setObjectUrl(resourceId, finalUrl)
		}

		options.store.commit('addResource', {
			id: resourceId,
			kind,
			name: file.name || t(`aiworkflow.runtime.${kind}Resource`),
			url: finalUrl,
			...(assetAbsPath ? { sourcePath: assetAbsPath } : sourcePath ? { sourcePath } : {}),
			...(assetRelPath ? { projectRelativePath: assetRelPath } : {}),
			createdAt: Date.now()
		})
		options.setNodeResourceWithCleanup({
			nodeId,
			resourceId,
			resourcePath: assetAbsPath || sourcePath || undefined
		})

		if (kind === 'image') {
			const img = new Image()
			if (shouldUseAnonymousCrossOrigin(finalUrl)) {
				img.crossOrigin = 'anonymous'
			}
			img.onload = () => {
				if (!nodeStillExists(nodeId)) return
				const width = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
				const height = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
				options.store.commit('setNodeImageSettings', {
					nodeId,
					imageSettings: {
						outputWidth: width,
						outputHeight: height,
						naturalWidth: width,
						naturalHeight: height,
						crop: { x: 0, y: 0, width: 1, height: 1 }
					}
				})
			}
			img.onerror = () => {
				if (!nodeStillExists(nodeId)) return
				const fallbackWidth = Math.max(
					1,
					Math.floor(
						Number(node.imageSettings?.outputWidth || node.imageSettings?.naturalWidth || 1) || 1
					)
				)
				const fallbackHeight = Math.max(
					1,
					Math.floor(
						Number(node.imageSettings?.outputHeight || node.imageSettings?.naturalHeight || 1) || 1
					)
				)
				options.store.commit('setNodeImageSettings', {
					nodeId,
					imageSettings: {
						outputWidth: fallbackWidth,
						outputHeight: fallbackHeight,
						naturalWidth: fallbackWidth,
						naturalHeight: fallbackHeight,
						crop: { x: 0, y: 0, width: 1, height: 1 }
					}
				})
				options.autoSizeImageNodeFromDims(nodeId, fallbackWidth, fallbackHeight)
			}
			img.src = finalUrl
		}

		if (kind === 'video') {
			options.scheduleVideoMetadataRead({ resourceId, nodeId, url: finalUrl })
			void persistNodeVideoResourceLocally({ resourceId, nodeId, file })
		}

		options.autoSizeMediaNode(nodeId, finalUrl, kind)
		opts?.onAfterBind?.({ resourceId, url: finalUrl })
	}

	const bindMediaResourceToNode = (
		nodeId: string,
		kind: 'image' | 'video' | 'model3d',
		url: string,
		name: string,
		opts?: {
			posterUrl?: string
			sourcePath?: string
			projectRelativePath?: string
			posterProjectRelativePath?: string
			onAfterBind?: (payload: { resourceId: string; url: string }) => void
		}
	) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		if (kind === 'model3d') {
			options.revokeNodeModel3DObjectUrl(nodeId)
			const lowerName = String(name || url || '').toLowerCase()
			let modelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
			if (lowerName.endsWith('.gltf')) modelFormat = 'gltf'
			else if (lowerName.endsWith('.fbx')) modelFormat = 'fbx'
			else if (lowerName.endsWith('.obj')) modelFormat = 'obj'
			else if (lowerName.endsWith('.stl')) modelFormat = 'stl'
			else if (lowerName.endsWith('.dae')) modelFormat = 'dae'
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelUrl: url,
					modelFormat,
					modelSourceName: String(name || 'model'),
					modelSourcePath: String(opts?.sourcePath ?? '').trim() || undefined,
					modelAssetUrl: String(url || '').trim() || undefined,
					modelAssetPath: String(opts?.sourcePath ?? '').trim() || undefined
				}
			})
			opts?.onAfterBind?.({ resourceId: '', url })
			return
		}

		const resourceId = options.makeResourceId()
		options.store.commit('addResource', {
			id: resourceId,
			kind,
			name,
			url,
			...(opts?.posterUrl ? { posterUrl: String(opts.posterUrl) } : {}),
			...(opts?.sourcePath ? { sourcePath: String(opts.sourcePath) } : {}),
			...(opts?.projectRelativePath
				? { projectRelativePath: String(opts.projectRelativePath) }
				: {}),
			...(opts?.posterProjectRelativePath
				? { posterProjectRelativePath: String(opts.posterProjectRelativePath) }
				: {}),
			createdAt: Date.now()
		})
		options.setNodeResourceWithCleanup({
			nodeId,
			resourceId,
			resourcePath: String(opts?.sourcePath ?? '').trim() || undefined
		})

		if (kind === 'image') {
			const img = new Image()
			if (shouldUseAnonymousCrossOrigin(url)) {
				img.crossOrigin = 'anonymous'
			}
			img.onload = () => {
				if (!nodeStillExists(nodeId)) return
				const width = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
				const height = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
				options.store.commit('setNodeImageSettings', {
					nodeId,
					imageSettings: {
						outputWidth: width,
						outputHeight: height,
						naturalWidth: width,
						naturalHeight: height,
						cropEnabled: false,
						crop: { x: 0, y: 0, width: 1, height: 1 }
					}
				})
				options.autoSizeImageNodeFromDims(nodeId, width, height)
			}
			img.onerror = () => {
				if (!nodeStillExists(nodeId)) return
				const fallbackWidth = Math.max(
					1,
					Math.floor(
						Number(node.imageSettings?.outputWidth || node.imageSettings?.naturalWidth || 1) || 1
					)
				)
				const fallbackHeight = Math.max(
					1,
					Math.floor(
						Number(node.imageSettings?.outputHeight || node.imageSettings?.naturalHeight || 1) || 1
					)
				)
				options.store.commit('setNodeImageSettings', {
					nodeId,
					imageSettings: {
						outputWidth: fallbackWidth,
						outputHeight: fallbackHeight,
						naturalWidth: fallbackWidth,
						naturalHeight: fallbackHeight,
						cropEnabled: false,
						crop: { x: 0, y: 0, width: 1, height: 1 }
					}
				})
				options.autoSizeImageNodeFromDims(nodeId, fallbackWidth, fallbackHeight)
			}
			img.src = url
		}

		if (kind === 'video') {
			const video = document.createElement('video')
			video.preload = 'metadata'
			if (shouldUseAnonymousCrossOrigin(url)) {
				video.crossOrigin = 'anonymous'
			}
			video.onloadedmetadata = () => {
				if (!nodeStillExists(nodeId)) return
				const width = Math.max(1, Math.floor(video.videoWidth || 1))
				const height = Math.max(1, Math.floor(video.videoHeight || 1))
				options.store.commit('setNodeVideoSettings', {
					nodeId,
					videoSettings: {
						outputWidth: width,
						outputHeight: height,
						naturalWidth: width,
						naturalHeight: height
					}
				})
			}
			video.src = url
			video.load()
			if (!opts?.posterUrl) {
				void options.ensureVideoResourcePoster(resourceId, url)
			}
		}

		options.autoSizeMediaNode(nodeId, url, kind)
		opts?.onAfterBind?.({ resourceId, url })
	}

	const uploadNodeModel3DFile = async (nodeId: string, file: File) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'model3d') return

		options.revokeNodeModel3DObjectUrl(nodeId)

		const url = URL.createObjectURL(file)
		const objectKey = `model3d:${nodeId}`
		options.setObjectUrl(objectKey, url)
		const lowerName = String(file.name || '').toLowerCase()
		let modelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
		if (lowerName.endsWith('.gltf')) modelFormat = 'gltf'
		else if (lowerName.endsWith('.fbx')) modelFormat = 'fbx'
		else if (lowerName.endsWith('.obj')) modelFormat = 'obj'
		else if (lowerName.endsWith('.stl')) modelFormat = 'stl'
		else if (lowerName.endsWith('.dae')) modelFormat = 'dae'
		const sourcePath =
			typeof (file as FileWithPath)?.path === 'string'
				? String((file as FileWithPath).path).trim()
				: ''
		let assetUrl = ''
		let assetPath = ''

		try {
			const currentProjectId = Number(options.getCurrentProjectId() ?? 0)
			if (currentProjectId > 0) {
				const uploaded = await options.blueprintProjectService.uploadAsset(file, 'file', {
					projectId: currentProjectId
				})
				if (uploaded.ok) {
					const asset = (uploaded as UploadAssetResult).asset ?? {}
					assetUrl = options.resolveBackendUrl(String(asset.url || ''))
					assetPath = String(asset.absolutePath || '').trim()
				}
			}
		} catch {
			// ignore immediate asset persistence failure; local object url preview still works
		}

		options.store.commit('setNodeModel3DSettings', {
			nodeId,
			model3dSettings: {
				modelUrl: assetUrl || url,
				modelFormat,
				modelSourceName: String(file.name || 'model'),
				modelSourcePath: assetPath || sourcePath || undefined,
				modelAssetUrl: assetUrl || undefined,
				modelAssetPath: assetPath || undefined
			}
		})
	}

	return {
		persistNodeImageResourceLocally,
		persistNodeVideoResourceLocally,
		uploadNodeResource,
		bindMediaResourceToNode,
		uploadNodeModel3DFile
	}
}
