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
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video' | 'model3d') => void
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
	copyFileToProjectRoot?: (
		projectId: number,
		sourcePath: string,
		desiredFilename: string
	) => Promise<{ ok: boolean; relativePath?: string; size?: number } | null>
	uploadProjectAsset?: (payload: {
		projectId: number
		kind?: string
		name?: string
		arrayBuffer: ArrayBuffer
		contentType?: string
		bucket?: string
	}) => Promise<{
		ok: boolean
		asset?: { relativePath: string; [k: string]: unknown }
		error?: string
	} | null>
	/**
	 * 节点资源绑定（resourceId / settings）写入 Vuex Store 完成后，
	 * 调用此函数将变更同步回 BlueprintEngine，
	 * 使 NodeComponentResolver 能从引擎端的 BlueprintNode.data 读取到最新值，
	 * 从而正确渲染节点 UI（修复"空白新建 3D 模型节点上传后不渲染"的根因）。
	 *
	 * 可选参数：不传则保持旧行为（不同步引擎），保证向后兼容。
	 */
	patchBlueprintNodeData?: (nodeId: string) => void
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
			absolutePath?: string
			posterProjectRelativePath?: string
			/** When provided, reuse this existing resourceId instead of creating a new one. */
			resourceId?: string
			onAfterBind?: (payload: { resourceId: string; url: string }) => void
		}
	) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node) return

		if (kind === 'model3d') {
			options.revokeNodeModel3DObjectUrl(nodeId)

			const resourceId = String(opts?.resourceId ?? '').trim() || options.makeResourceId()
			const existing = options.store.state.resourcesById?.[resourceId]
			console.log('[AIWorkflow:BindResource] model3d bindMediaResourceToNode:', {
				nodeId,
				resourceId,
				resourceExists: !!existing,
				url: url ? url.slice(0, 80) : '(empty)',
				name,
				hasSourcePath: !!opts?.sourcePath,
				hasProjectRelativePath: !!opts?.projectRelativePath,
				hasAbsolutePath: !!opts?.absolutePath
			})
			if (existing) {
				options.store.commit('patchResource', {
					resourceId,
					patch: {
						kind: 'model3d',
						name,
						url,
						...(opts?.sourcePath ? { sourcePath: String(opts.sourcePath) } : {}),
						...(opts?.projectRelativePath
							? { projectRelativePath: String(opts.projectRelativePath) }
							: {}),
						// ===== 2026-08-03 修复：传递 absolutePath 供资源解析 =====
						...(opts?.absolutePath ? { absolutePath: String(opts.absolutePath) } : {})
					}
				})
			} else {
				options.store.commit('addResource', {
					id: resourceId,
					kind: 'model3d',
					name,
					url,
					...(opts?.sourcePath ? { sourcePath: String(opts.sourcePath) } : {}),
					...(opts?.projectRelativePath
						? { projectRelativePath: String(opts.projectRelativePath) }
						: {}),
					// ===== 2026-08-03 修复：传递 absolutePath 供资源解析 =====
					...(opts?.absolutePath ? { absolutePath: String(opts.absolutePath) } : {}),
					createdAt: Date.now()
				})
			}
			options.setNodeResourceWithCleanup({
				nodeId,
				resourceId,
				resourcePath: String(opts?.sourcePath ?? '').trim() || undefined
			})

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
					modelSourcePath: opts?.sourcePath || undefined,
					modelAssetUrl: url,
					modelAssetPath: opts?.projectRelativePath || opts?.sourcePath || undefined
				}
			})
			console.log('[AIWorkflow:BindResource] model3d store commits done, syncing to engine...', {
				nodeId,
				resourceId,
				modelFormat,
				modelAssetUrl: url.slice(0, 80)
			})

			try {
				options.autoSizeMediaNode?.(nodeId, url, 'model3d')
			} catch {
				// ignore
			}

			opts?.onAfterBind?.({ resourceId, url })
			// P1-2：所有 Store commits 完成后同步回引擎（SSOT 反向写入，使 NodeComponentResolver 读到最新 data）
			options.patchBlueprintNodeData?.(nodeId)
			console.log(
				'[AIWorkflow:BindResource] model3d engine sync (patchBlueprintNodeData) completed'
			)
			return
		}

		const resourceId = String(opts?.resourceId ?? '').trim() || options.makeResourceId()
		if (options.store.state.resourcesById?.[resourceId]) {
			options.store.commit('patchResource', {
				resourceId,
				patch: {
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
						: {})
				}
			})
		} else {
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
		}
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
		// P1-2：image/video 分支所有 Store commits 完成后同样同步回引擎（顺带修复手动上传 image/video 后也可能不渲染的同类问题）
		options.patchBlueprintNodeData?.(nodeId)
	}

	const uploadNodeModel3DFile = async (nodeId: string, file: File) => {
		console.log('[AIWorkflow:UploadModel3D] uploadNodeModel3DFile called:', {
			nodeId,
			fileName: file.name,
			fileType: file.type,
			fileSize: file.size,
			hasPath: typeof (file as FileWithPath)?.path === 'string'
		})

		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'model3d') {
			console.warn('[AIWorkflow:UploadModel3D] Aborted: node not found or not model3d type:', {
				nodeId,
				nodeExists: !!node,
				nodeType: node?.type
			})
			return
		}

		options.revokeNodeModel3DObjectUrl(nodeId)

		const sourcePath =
			typeof (file as FileWithPath)?.path === 'string'
				? String((file as FileWithPath).path).trim()
				: ''

		type Persisted = { url: string; relPath: string; absPath?: string }
		let persisted: Persisted | null = null
		const currentProjectId = Number(options.getCurrentProjectId?.() ?? 0)
		console.log('[AIWorkflow:UploadModel3D] Persisting file to project:', {
			nodeId,
			currentProjectId,
			hasSourcePath: !!sourcePath,
			sourcePath: sourcePath || '(none)',
			hasCopyFileToProjectRoot: typeof options.copyFileToProjectRoot === 'function',
			hasUploadProjectAsset: typeof options.uploadProjectAsset === 'function'
		})
		if (currentProjectId > 0) {
			try {
				// ===== 路径 1：原生 IPC 文件拷贝（与拖拽导入相同，最高效）=====
				if (sourcePath && typeof options.copyFileToProjectRoot === 'function') {
					console.log('[AIWorkflow:UploadModel3D] Trying copyFileToProjectRoot...')
					const r = await options.copyFileToProjectRoot(currentProjectId, sourcePath, file.name)
					console.log('[AIWorkflow:UploadModel3D] copyFileToProjectRoot result:', r)
					if (r && r.ok && r.relativePath) {
						const rel = String(r.relativePath)
						const abs = String((r as any)?.absolutePath || '').trim()
						persisted = {
							relPath: rel,
							url: `dweb://project-assets?projectId=${currentProjectId}&path=${encodeURIComponent(rel)}`,
							...(abs ? { absPath: abs } : {})
						}
						console.log('[AIWorkflow:UploadModel3D] Persisted via copyFileToProjectRoot:', {
							relPath: rel,
							hasAbsPath: !!abs
						})
					}
				}
				// ===== 路径 2：ArrayBuffer 上传（web 拖拽 / 截图等无本地路径场景）=====
				if (!persisted && typeof options.uploadProjectAsset === 'function') {
					console.log('[AIWorkflow:UploadModel3D] Trying uploadProjectAsset via ArrayBuffer...')
					const buf = await file.arrayBuffer()
					const r = await options.uploadProjectAsset({
						projectId: currentProjectId,
						kind: 'model3d',
						name: file.name,
						arrayBuffer: buf,
						contentType: file.type || 'application/octet-stream',
						bucket: 'assets'
					})
					console.log('[AIWorkflow:UploadModel3D] uploadProjectAsset result:', {
						ok: r?.ok,
						hasAsset: !!r?.asset,
						relativePath: (r?.asset as any)?.relativePath,
						absolutePath: (r?.asset as any)?.absolutePath,
						error: r?.error
					})
					if (r && r.ok && (r.asset as { relativePath?: string } | undefined)?.relativePath) {
						const rel = String((r.asset as { relativePath: string }).relativePath)
						const abs = String((r.asset as any)?.absolutePath || '').trim()
						persisted = {
							relPath: rel,
							url: `dweb://project-assets?projectId=${currentProjectId}&path=${encodeURIComponent(rel)}`,
							...(abs ? { absPath: abs } : {})
						}
						console.log('[AIWorkflow:UploadModel3D] Persisted via uploadProjectAsset:', {
							relPath: rel,
							hasAbsPath: !!abs
						})
					}
				}
				// ===== 路径 3：最后兜底：走原有 uploadAsset API =====
				if (!persisted) {
					console.log(
						'[AIWorkflow:UploadModel3D] Falling back to blueprintProjectService.uploadAsset...'
					)
					const uploaded = await options.blueprintProjectService.uploadAsset(file, 'file', {
						projectId: currentProjectId
					})
					console.log('[AIWorkflow:UploadModel3D] uploadAsset result:', {
						ok: uploaded.ok,
						error: (uploaded as any)?.error,
						assetUrl: (uploaded as UploadAssetResult)?.asset?.url,
						assetAbsPath: (uploaded as UploadAssetResult)?.asset?.absolutePath
					})
					if (uploaded.ok) {
						const asset = (uploaded as UploadAssetResult).asset ?? {}
						const dwebUrl = options.resolveBackendUrl(String(asset.url || ''))
						const rel = String(asset.projectRelativePath || asset.relativePath || '').trim()
						const abs = String(asset.absolutePath || '').trim()
						if (dwebUrl && rel) {
							persisted = { url: dwebUrl, relPath: rel, ...(abs ? { absPath: abs } : {}) }
						} else if (dwebUrl) {
							persisted = {
								url: dwebUrl,
								relPath: String(abs || '').trim(),
								...(abs ? { absPath: abs } : {})
							}
						}
					}
				}
			} catch (e) {
				console.warn(
					'[AIWorkflow:UploadModel3D] persist to project failed, falling back to object url preview:',
					e
				)
			}
		} else {
			console.warn('[AIWorkflow:UploadModel3D] No currentProjectId, skipping persistence')
		}

		let objectUrl = ''
		if (!persisted) {
			objectUrl = URL.createObjectURL(file)
			const objectKey = `model3d:${nodeId}`
			options.setObjectUrl(objectKey, objectUrl)
			console.log('[AIWorkflow:UploadModel3D] Using blob object URL fallback:', {
				nodeId,
				objectKey,
				urlPrefix: objectUrl.slice(0, 50)
			})
		}

		const finalUrl = persisted?.url || objectUrl
		const finalRel = persisted?.relPath || ''
		const finalAbs = persisted?.absPath || ''

		console.log('[AIWorkflow:UploadModel3D] Final URL prepared:', {
			nodeId,
			hasPersisted: !!persisted,
			finalUrl: finalUrl ? finalUrl.slice(0, 100) : '(empty)',
			finalRel,
			hasFinalAbs: !!finalAbs
		})

		if (persisted) {
			console.log('[AIWorkflow:UploadModel3D] Calling bindMediaResourceToNode...', {
				nodeId,
				finalUrl: finalUrl.slice(0, 80),
				projectRelativePath: finalRel,
				absolutePath: finalAbs || '(none)'
			})
			bindMediaResourceToNode(nodeId, 'model3d', finalUrl, file.name, {
				sourcePath: sourcePath || undefined,
				projectRelativePath: finalRel,
				absolutePath: finalAbs || undefined
			})
			console.log(
				'[AIWorkflow:UploadModel3D] bindMediaResourceToNode completed (engine synced via patchBlueprintNodeData)'
			)
		} else {
			const lowerName = String(file.name || '').toLowerCase()
			let modelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
			if (lowerName.endsWith('.gltf')) modelFormat = 'gltf'
			else if (lowerName.endsWith('.fbx')) modelFormat = 'fbx'
			else if (lowerName.endsWith('.obj')) modelFormat = 'obj'
			else if (lowerName.endsWith('.stl')) modelFormat = 'stl'
			else if (lowerName.endsWith('.dae')) modelFormat = 'dae'
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelUrl: finalUrl,
					modelFormat,
					modelSourceName: String(file.name || 'model'),
					modelSourcePath: sourcePath || undefined
				}
			})
			console.log(
				'[AIWorkflow:UploadModel3D] Object URL fallback: setNodeModel3DSettings committed',
				{
					nodeId,
					modelFormat,
					modelUrl: finalUrl.slice(0, 80)
				}
			)
			// P1-3：objectUrl 兜底分支同样同步回引擎
			options.patchBlueprintNodeData?.(nodeId)
			console.log(
				'[AIWorkflow:UploadModel3D] patchBlueprintNodeData completed for object URL fallback'
			)
		}

		// ===== 2026-08-05 关键修复：与拖拽导入保持一致 —— 资源绑定完成后强制将完整数据再次同步回引擎 =====
		// 这一步是额外的保险：bindMediaResourceToNode 内部已调用 patchBlueprintNodeData，
		// 但此处显式再写一次完整的 model3dSettings + resourceId + resourcePath，确保引擎端 BlueprintNode.data 绝对最新
		const storeNodeAfter = options.store.state.nodesById[nodeId] as any
		if (storeNodeAfter) {
			console.log('[AIWorkflow:UploadModel3D] Post-bind store node state:', {
				nodeId,
				resourceId: storeNodeAfter.resourceId ?? '(null)',
				hasModel3dSettings: !!storeNodeAfter.model3dSettings,
				modelUrl: storeNodeAfter.model3dSettings?.modelUrl?.slice(0, 80) ?? '(empty)',
				resourcePath: storeNodeAfter.resourcePath ?? '(none)'
			})
		}
	}

	return {
		persistNodeImageResourceLocally,
		persistNodeVideoResourceLocally,
		uploadNodeResource,
		bindMediaResourceToNode,
		uploadNodeModel3DFile
	}
}
