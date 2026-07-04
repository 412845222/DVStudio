import { getErrorMessage } from '../../../types/utils'

export type AIWorkflowDraggedResourceItem = {
	resourceId: string
	kind: 'image' | 'video'
	name?: string
	url?: string
	sourcePath?: string
}

export type AIWorkflowDraggedNanoPreviewMeta = {
	url: string
	kind: 'image' | 'video'
	fallbackUrl?: string
	sourcePath?: string
	localUrl?: string
	remoteUrl?: string
	downloadStatus?: string
	localReady?: boolean
}

export type AIWorkflowDroppedFile = {
	file: File
	relativePath: string
	fsHandle?: FileSystemHandle
}

// File System API minimal type definitions (browser APIs not in standard lib)
interface FileSystemEntry {
	isFile: boolean
	isDirectory: boolean
	name: string
	fullPath?: string
	createReader?: () => FileSystemDirectoryReader
	file?: (successCallback: (file: File) => void, errorCallback?: (err: unknown) => void) => void
}

interface FileSystemDirectoryReader {
	readEntries: (
		successCallback: (entries: FileSystemEntry[]) => void,
		errorCallback?: (err: unknown) => void
	) => void
}

interface FileSystemFileHandle extends FileSystemHandle {
	getFile: () => Promise<File>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
	entries: () => AsyncIterableIterator<[string, FileSystemHandle]> | IterableIterator<[string, FileSystemHandle]>
}

type MeshyTaskItem = {
	taskId?: string
	nodeId?: string
	meshySettings?: Record<string, unknown>
	[key: string]: unknown
}

type AIWorkflowStoreState = {
	resourcesById?: Record<string, { url?: string; name?: string; sourcePath?: string; posterUrl?: string }>
	selectedNodeId?: string | null
	[key: string]: unknown
}

type AIWorkflowStore = {
	state: AIWorkflowStoreState
	commit: (type: string, payload?: Record<string, unknown>) => void
	dispatch?: (type: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown
}

export const useAIWorkflowDropAssets = (options: {
	store: AIWorkflowStore
	makeResourceId: () => string
	setObjectUrl: (key: string, url: string) => void
	resolveBackendUrl: (value: string) => string
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	bindMediaResourceToNode: (
		nodeId: string,
		kind: 'image' | 'video',
		url: string,
		name: string,
		opts?: { posterUrl?: string; sourcePath?: string }
	) => void
	resolveDropWorldFromEvent: (event: DragEvent) => { worldX: number; worldY: number } | null
	createBatchMediaNodesFromFiles: (payload: {
		files: AIWorkflowDroppedFile[]
		worldX: number
		worldY: number
	}) => Promise<void>
	createNodeFromDraggedMeshyTask: (payload: {
		item: MeshyTaskItem
		worldX: number
		worldY: number
	}) => boolean | void
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const getDraggedNanoPreviewUrl = (e: DragEvent): string | null => {
		const dt = e.dataTransfer
		if (!dt) return null
		const url =
			dt.getData('application/x-dweb-nanobanana-preview') ||
			dt.getData('text/uri-list') ||
			dt.getData('text/plain')
		const v = String(url || '').trim()
		return v ? v : null
	}

	const getDraggedNanoPreviewMeta = (e: DragEvent): AIWorkflowDraggedNanoPreviewMeta | null => {
		const dt = e.dataTransfer
		if (!dt) return null
		const raw = dt.getData('application/x-dweb-nanobanana-preview-meta')
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			const url = String(parsed?.url || '').trim()
			const fallbackUrl = String(parsed?.fallbackUrl || '').trim()
			const sourcePath = String(parsed?.sourcePath || '').trim()
			const localUrl = String(parsed?.localUrl || '').trim()
			const remoteUrl = String(parsed?.remoteUrl || '').trim()
			const downloadStatus = String(parsed?.downloadStatus || '').trim()
			const kindText = String(parsed?.kind || '')
				.trim()
				.toLowerCase()
			const kind = kindText === 'video' ? 'video' : kindText === 'image' ? 'image' : null
			if (!url || !kind) return null
			return {
				url,
				kind,
				fallbackUrl: fallbackUrl || undefined,
				sourcePath: sourcePath || undefined,
				localUrl: localUrl || undefined,
				remoteUrl: remoteUrl || undefined,
				downloadStatus: downloadStatus || undefined,
				localReady: !!parsed?.localReady
			}
		} catch {
			return null
		}
	}

	const getDraggedResourceItem = (e: DragEvent): AIWorkflowDraggedResourceItem | null => {
		const dt = e.dataTransfer
		if (!dt) return null
		const raw = dt.getData('application/x-dweb-resource-item')
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			const resourceId = String(parsed?.resourceId ?? '').trim()
			const kind = String(parsed?.kind ?? '')
				.trim()
				.toLowerCase()
			if (!resourceId) return null
			if (kind !== 'image' && kind !== 'video') return null
			return {
				resourceId,
				kind,
				name: String(parsed?.name ?? '').trim() || undefined,
				url: String(parsed?.url ?? '').trim() || undefined,
				sourcePath: String(parsed?.sourcePath ?? '').trim() || undefined
			}
		} catch {
			return null
		}
	}

	const getDraggedMeshyTaskItem = (e: DragEvent): MeshyTaskItem | null => {
		const dt = e.dataTransfer
		if (!dt) return null
		const raw = dt.getData('application/x-dweb-meshy-task-item')
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			if (!parsed || typeof parsed !== 'object') return null
			const taskId = String(parsed?.taskId ?? '').trim()
			const nodeId = String(parsed?.nodeId ?? '').trim()
			const settings = parsed?.meshySettings
			if (!taskId && !nodeId) return null
			if (!settings || typeof settings !== 'object') return null
			return parsed as MeshyTaskItem
		} catch {
			return null
		}
	}

	type AIWorkflowDraggedArkTaskItem = {
		source: string
		nodeId: string
		taskId: string
		apiType: string
		apiAction: string
		model: string
		projectId: number | null
		prompt: string
		resultUrls: string[]
		thumbnailUrl: string
		status: string
		resourceAvailable?: boolean
		resourceUnavailableReason?: string
	}

	const getDraggedArkTaskItem = (e: DragEvent): AIWorkflowDraggedArkTaskItem | null => {
		const dt = e.dataTransfer
		if (!dt) return null
		const raw = dt.getData('application/x-dweb-ark-task-item')
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			if (!parsed || typeof parsed !== 'object') return null
			if (String(parsed?.source ?? '') !== 'ark-task-panel') return null
			return parsed as AIWorkflowDraggedArkTaskItem
		} catch {
			return null
		}
	}

	const inferMediaKindFromFile = (file: File): 'image' | 'video' | null => {
		const mime = String(file?.type ?? '')
		if (mime.startsWith('image/')) return 'image'
		if (mime.startsWith('video/')) return 'video'
		const name = String(file?.name ?? '')
		const ext = name.toLowerCase().split('.').pop() || ''
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return 'image'
		if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) return 'video'
		return null
	}

	const readAllDirectoryEntries = async (dirEntry: FileSystemEntry): Promise<FileSystemEntry[]> => {
		if (!dirEntry.createReader) return []
		const reader = dirEntry.createReader()
		const out: FileSystemEntry[] = []
		// readEntries returns at most 100 entries per call.
		while (true) {
			const batch: FileSystemEntry[] = await new Promise((resolve, reject) => {
				reader.readEntries(
					(entries: FileSystemEntry[]) => resolve(entries || []),
					(err: unknown) => reject(err)
				)
			})
			if (!batch.length) break
			out.push(...batch)
		}
		return out
	}

	const collectDroppedFilesFromEntry = async (
		entry: FileSystemEntry,
		pathPrefix = ''
	): Promise<AIWorkflowDroppedFile[]> => {
		if (!entry) return []
		if (entry.isFile) {
			const file = await new Promise<File>((resolve, reject) => {
				if (!entry.file) return reject(new Error('not a file'))
				entry.file(
					(f: File) => resolve(f),
					(err: unknown) => reject(err)
				)
			})
			const rel = `${pathPrefix}${file.name}`
			return [{ file, relativePath: rel }]
		}
		if (entry.isDirectory) {
			const dirName = String(entry.name ?? '')
			const nextPrefix = dirName ? `${pathPrefix}${dirName}/` : pathPrefix
			const children = await readAllDirectoryEntries(entry)
			const nested = await Promise.all(
				children.map((c: FileSystemEntry) => collectDroppedFilesFromEntry(c, nextPrefix))
			)
			return nested.flat()
		}
		return []
	}

	const collectDroppedFilesFromHandle = async (
		handle: unknown,
		pathPrefix = ''
	): Promise<AIWorkflowDroppedFile[]> => {
		if (!handle || typeof handle !== 'object') return []
		const kind = String((handle as FileSystemHandle).kind || '')
		if (kind === 'file') {
			try {
				const fileHandle = handle as FileSystemFileHandle
				const file = await fileHandle.getFile()
				const h = handle as FileSystemHandle
				const rel = `${pathPrefix}${file.name || String(h.name ?? '')}`
				return [{ file, relativePath: rel, fsHandle: h }]
			} catch {
				return []
			}
		}
		if (kind === 'directory') {
			const dirHandle = handle as FileSystemDirectoryHandle
			const h = handle as FileSystemHandle
			const dirName = String(h.name ?? '')
			const nextPrefix = dirName ? `${pathPrefix}${dirName}/` : pathPrefix
			const out: AIWorkflowDroppedFile[] = []
			try {
				const entries = dirHandle.entries?.()
				if (entries) {
					// Try async iteration first, fall back to sync
					let isAsync = false
					try {
						const asyncIter = (entries as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator]
						isAsync = typeof asyncIter === 'function'
					} catch {
						isAsync = false
					}
					if (isAsync) {
						for await (const [_name, child] of entries as AsyncIterableIterator<
							[string, FileSystemHandle]
						>) {
							out.push(...(await collectDroppedFilesFromHandle(child, nextPrefix)))
						}
					} else {
						for (const [_name, child] of entries as IterableIterator<[string, FileSystemHandle]>) {
							out.push(...(await collectDroppedFilesFromHandle(child, nextPrefix)))
						}
					}
				}
			} catch {
				// ignore
			}
			return out
		}
		return []
	}

	const collectDroppedFiles = async (dt: DataTransfer): Promise<AIWorkflowDroppedFile[]> => {
		// Prefer File System Access API handles (can be persisted via IndexedDB for refresh recovery).
		const itemsWithHandle = Array.from(dt.items ?? []).filter(
			(it) =>
				it.kind === 'file' &&
				typeof (it as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle> })
					.getAsFileSystemHandle === 'function'
		) as Array<DataTransferItem & { getAsFileSystemHandle: () => Promise<FileSystemHandle> }>
		if (itemsWithHandle.length) {
			const handles = await Promise.all(
				itemsWithHandle.map(async (it) => {
					try {
						return await it.getAsFileSystemHandle()
					} catch {
						return null
					}
				})
			)
			const nested = await Promise.all(
				handles.filter((h): h is FileSystemHandle => !!h).map((h) => collectDroppedFilesFromHandle(h, ''))
			)
			const flat = nested.flat()
			if (flat.length) return flat
		}

		// Prefer entries API (Chromium) so we can traverse directories.
		const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file')
		const entries: FileSystemEntry[] = []
		for (const it of items) {
			const e = (it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
				.webkitGetAsEntry?.()
			if (e) entries.push(e)
		}
		if (entries.length) {
			const nested = await Promise.all(entries.map((e) => collectDroppedFilesFromEntry(e, '')))
			return nested.flat()
		}
		// Fallback: plain files (no directory support).
		const files = Array.from(dt.files ?? [])
		return files.map((f) => ({ file: f, relativePath: String(f?.name ?? '') }))
	}

	const snapshotRemoteImageToObjectUrl = async (inputUrl: string, resourceId: string) => {
		const url = String(inputUrl || '').trim()
		if (!url) return ''
		if (url.startsWith('blob:') || url.startsWith('data:')) return url
		try {
			const resp = await fetch(url, { cache: 'no-store' })
			if (!resp.ok) return url
			const blob = await resp.blob()
			const objectUrl = URL.createObjectURL(blob)
			const rid = String(resourceId || '').trim()
			if (rid) options.setObjectUrl(rid, objectUrl)
			return objectUrl
		} catch {
			return url
		}
	}

	const createNodeFromDraggedResource = (payload: {
		item: AIWorkflowDraggedResourceItem
		worldX: number
		worldY: number
	}) => {
		const resource = options.store.state.resourcesById?.[payload.item.resourceId]
		if (!resource) return false

		options.store.commit('addNodeAt', {
			worldX: payload.worldX,
			worldY: payload.worldY,
			title: payload.item.kind === 'image' ? '图片' : '视频'
		})
		const nodeId = options.store.state.selectedNodeId
		if (!nodeId) return true

		options.store.commit('setNodeType', { nodeId, type: payload.item.kind })
		const mediaUrl = String(resource?.url || payload.item.url || '').trim()
		const sourcePath = String(resource?.sourcePath || payload.item.sourcePath || '').trim()
		const posterUrl =
			payload.item.kind === 'video' ? String(resource?.posterUrl || '').trim() : ''

		options.bindMediaResourceToNode(
			nodeId,
			payload.item.kind,
			mediaUrl,
			String(
				resource?.name ||
					payload.item.name ||
					(payload.item.kind === 'image' ? '图片资源' : '视频资源')
			),
			{
				sourcePath: sourcePath || undefined,
				posterUrl: posterUrl || undefined
			}
		)

		if (mediaUrl) {
			options.autoSizeMediaNode(nodeId, mediaUrl, payload.item.kind)
		}
		return true
	}

	const createNodeFromNanoPreview = async (payload: {
		meta: AIWorkflowDraggedNanoPreviewMeta | null
		fallbackUrl: string
		worldX: number
		worldY: number
	}) => {
		const rawUrl = String(payload.meta?.url || payload.fallbackUrl || '').trim()
		if (!rawUrl) return false

		const kind: 'image' | 'video' = payload.meta?.kind === 'video' ? 'video' : 'image'
		const url =
			kind === 'video'
				? options.resolveBackendUrl(String(payload.meta?.localUrl || '').trim())
				: options.resolveBackendUrl(rawUrl)
		if (kind === 'video' && (!payload.meta?.localReady || !url)) {
			const statusText = String(payload.meta?.downloadStatus || '').trim()
			options.pushToast(
				statusText === 'failed'
					? '视频本地化失败，当前不能拖入蓝图，请先重试下载。'
					: '视频仍在下载到项目资源目录，完成后才能拖入蓝图。',
				'warn'
			)
			return false
		}
		if (!url) return false
		const resourceId = `wf-res-nanobanana-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		let storedUrl = url
		if (kind === 'image') {
			const frozenUrl = await snapshotRemoteImageToObjectUrl(url, resourceId)
			storedUrl = frozenUrl || url
		}

		options.store.commit('addNodeAt', {
			worldX: payload.worldX,
			worldY: payload.worldY,
			title: kind === 'video' ? '视频' : '图片'
		})
		const nodeId = options.store.state.selectedNodeId
		if (!nodeId) return true

		options.store.commit('setNodeType', { nodeId, type: kind })
		options.bindMediaResourceToNode(
			nodeId,
			kind,
			storedUrl,
			kind === 'video'
				? `Seedance_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.mp4`
				: `Seedream_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`,
			{
				sourcePath: String(payload.meta?.sourcePath || '').trim() || undefined
			}
		)
		options.autoSizeMediaNode(nodeId, storedUrl, kind)
		return true
	}

	const onCanvasDragOver = (e: DragEvent) => {
		const dt = e.dataTransfer
		const hasFiles =
			!!dt &&
			((dt.items && Array.from(dt.items).some((it) => it.kind === 'file')) ||
				(dt.files && dt.files.length > 0))
		const resourceItem = getDraggedResourceItem(e)
		const meshyTaskItem = getDraggedMeshyTaskItem(e)
		const arkTaskItem = getDraggedArkTaskItem(e)
		const nanoMeta = getDraggedNanoPreviewMeta(e)
		const url = nanoMeta?.url || getDraggedNanoPreviewUrl(e)
		if (!hasFiles && !url && !resourceItem && !meshyTaskItem && !arkTaskItem) return
		try {
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
		} catch {
			// ignore
		}
	}

	const onCanvasDrop = async (e: DragEvent) => {
		const world = options.resolveDropWorldFromEvent(e)
		if (!world) return

		const dt = e.dataTransfer
		const draggedResource = getDraggedResourceItem(e)
		const draggedMeshyTask = getDraggedMeshyTaskItem(e)
		const draggedArkTask = getDraggedArkTaskItem(e)
		const nanoMeta = getDraggedNanoPreviewMeta(e)
		const urlRaw = nanoMeta?.url || getDraggedNanoPreviewUrl(e)
		if (draggedResource) {
			if (
				createNodeFromDraggedResource({
					item: draggedResource,
					worldX: world.worldX,
					worldY: world.worldY
				})
			) {
				return
			}
		}

		if (draggedMeshyTask) {
			options.createNodeFromDraggedMeshyTask({
				item: draggedMeshyTask,
				worldX: world.worldX,
				worldY: world.worldY
			})
			return
		}

		if (draggedArkTask) {
			const apiType = String(draggedArkTask.apiType || '').trim().toLowerCase()
			const kind: 'image' | 'video' = apiType === 'seedance' ? 'video' : 'image'
			const title = apiType === 'seedance' ? '视频' : (apiType === 'seedream' ? '图片' : 'ARK')
			const prompt = String(draggedArkTask.prompt || '').trim()
			const resultUrls = Array.isArray(draggedArkTask.resultUrls) ? draggedArkTask.resultUrls : []
			const firstUrl = resultUrls[0] || ''
			const thumbnailUrl = String(draggedArkTask.thumbnailUrl || '').trim()
			const displayUrl = firstUrl || thumbnailUrl
			const isCompleted = String(draggedArkTask.status || '').trim().toLowerCase() === 'succeeded'

			options.store.commit('addNodeAt', {
				worldX: world.worldX,
				worldY: world.worldY,
				title: prompt ? `${title}：${prompt.slice(0, 20)}` : title
			})
			const nodeId = options.store.state.selectedNodeId
			if (!nodeId) return

			options.store.commit('setNodeType', { nodeId, type: kind })

			if (displayUrl && isCompleted) {
				const fileName = kind === 'video'
					? `Seedance_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.mp4`
					: `Seedream_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`
				options.bindMediaResourceToNode(nodeId, kind, displayUrl, fileName)
				options.autoSizeMediaNode(nodeId, displayUrl, kind)
			} else if (!isCompleted) {
				options.pushToast('任务尚未完成，已创建空节点，完成后可重新拖拽或下载产物。', 'info')
			} else {
				options.pushToast('该任务暂无可用产物，已创建空节点。', 'warn')
			}
			return
		}

		if (urlRaw) {
			await createNodeFromNanoPreview({
				meta: nanoMeta,
				fallbackUrl: urlRaw,
				worldX: world.worldX,
				worldY: world.worldY
			})
			return
		}

		if (dt) {
			try {
				const dropped = await collectDroppedFiles(dt)
				const hasMedia = dropped.some((x) => !!inferMediaKindFromFile(x.file))
				if (hasMedia) {
					await options.createBatchMediaNodesFromFiles({
						files: dropped,
						worldX: world.worldX,
						worldY: world.worldY
					})
					return
				}
			} catch (err: unknown) {
				options.pushToast('拖拽导入失败：' + getErrorMessage(err), 'warn')
				// fall through to image-gen URL if present
			}
		}
	}

	return {
		createNodeFromDraggedResource,
		createNodeFromNanoPreview,
		inferMediaKindFromFile,
		collectDroppedFilesFromHandle,
		onCanvasDragOver,
		onCanvasDrop
	}
}
