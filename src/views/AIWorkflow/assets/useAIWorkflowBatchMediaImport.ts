export type AIWorkflowDroppedFile = {
	file: File
	relativePath: string
	fsHandle?: any
}

export const useAIWorkflowBatchMediaImport = (options: {
	store: any
	makeResourceId: () => string
	maxBatchImportMediaCount: number
	inferMediaKindFromFile: (file: File) => 'image' | 'video' | null
	normalizeFileSignatureKey: (name: unknown, size: unknown, lastModified: unknown) => string
	putLocalFileHandle: (key: string, handle: any) => Promise<any>
	cancelActiveImportSession: (opts?: { cleanupUnresolved?: boolean }) => void
	startImportSession: (payload: {
		id: string
		resourceIdToNode: Map<string, { nodeId: string; kind: 'image' | 'video' }>
		nodeIdToResourceId: Map<string, string>
		resourceState: Map<
			string,
			{ kind: 'image' | 'video'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>
		total: number
	}) => void
	getActiveImportSession: () => {
		id: string
		cancelled: boolean
		resourceState: Map<
			string,
			{ kind: 'image' | 'video'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>
	} | null
	updateImportProgressIfNeeded: (sessionId: string, resourceId: string) => void
	mediaImportManager: {
		enqueue: (tasks: Array<any>) => void
	}
	setObjectUrl: (key: string, url: string) => void
	scheduleVideoMetadataRead: (payload: {
		sessionId?: string
		resourceId: string
		nodeId: string
		url: string
	}) => void
	autoSizeImageNodeFromDims: (nodeId: string, width: number, height: number) => void
	onLimitExceeded: (count: number, limit: number) => void
	getProjectId: () => number | null
	copyFileToProjectRoot: (
		projectId: number,
		sourcePath: string,
		desiredFilename: string
	) => Promise<any>
	uploadProjectAsset: (payload: {
		projectId: number
		kind?: string
		name?: string
		arrayBuffer: ArrayBuffer
		contentType?: string
		bucket?: string
	}) => Promise<any>
	resolveBackendUrl: (value: string) => string
}) => {
	const createMediaNodesFromFiles = async (opts: {
		files: AIWorkflowDroppedFile[]
		worldX: number
		worldY: number
	}) => {
		const media = opts.files
			.map((item) => ({ ...item, kind: options.inferMediaKindFromFile(item.file) }))
			.filter((item) => item.kind === 'image' || item.kind === 'video') as Array<
			AIWorkflowDroppedFile & { kind: 'image' | 'video' }
		>
		if (!media.length) return

		if (media.length > options.maxBatchImportMediaCount) {
			options.onLimitExceeded(media.length, options.maxBatchImportMediaCount)
			return
		}

		const COLS = 4
		const CELL_W = 520
		const CELL_H = 380

		const createdNodeIds: string[] = []
		const resourceIdToNode = new Map<string, { nodeId: string; kind: 'image' | 'video' }>()
		const nodeIdToResourceId = new Map<string, string>()
		const importTasks: Array<{
			resourceId: string
			kind: 'image' | 'video'
			name: string
			file: File
		}> = []

		for (let i = 0; i < media.length; i += 1) {
			const item = media[i]
			const col = i % COLS
			const row = Math.floor(i / COLS)
			const worldX = opts.worldX + col * CELL_W
			const worldY = opts.worldY + row * CELL_H

			const name = String(
				item.relativePath || item.file.name || (item.kind === 'image' ? 'image' : 'video')
			)
			const absPath =
				typeof (item.file as any)?.path === 'string' ? String((item.file as any).path).trim() : ''
			const sourceName = String(item.file?.name || name || '').trim()
			const sourceSize = Number(item.file?.size || 0)
			const sourceLastModified = Number(item.file?.lastModified || 0)
			const sourceFingerprint = options.normalizeFileSignatureKey(
				sourceName,
				sourceSize,
				sourceLastModified
			)
			const resourceId = options.makeResourceId()
			const localFileKey = item.fsHandle
				? `lfh:${item.kind}:${sourceFingerprint || `${String(resourceId)}`}`
				: ''

			if (localFileKey) {
				void options.putLocalFileHandle(localFileKey, item.fsHandle)
			}

			options.store.commit('addResource', {
				id: resourceId,
				kind: item.kind,
				name,
				url: '',
				sourcePath: absPath || undefined,
				localFileKey: localFileKey || undefined,
				sourceFingerprint: sourceFingerprint || undefined,
				sourceName: sourceName || undefined,
				sourceSize: Number.isFinite(sourceSize) ? Math.max(0, Math.floor(sourceSize)) : undefined,
				sourceLastModified: Number.isFinite(sourceLastModified)
					? Math.max(0, Math.floor(sourceLastModified))
					: undefined,
				createdAt: Date.now()
			})

			options.store.commit('addNodeAt', {
				worldX,
				worldY,
				title: item.kind === 'image' ? '图片' : '视频'
			})
			const nodeId = options.store.state.selectedNodeId
			if (!nodeId) continue
			createdNodeIds.push(nodeId)
			options.store.commit('setNodeType', { nodeId, type: item.kind })
			options.store.commit('setNodeResource', { nodeId, resourceId })
			if (absPath) {
				options.store.commit('setNodeResourcePath', { nodeId, resourcePath: absPath })
			}
			resourceIdToNode.set(resourceId, { nodeId, kind: item.kind })
			nodeIdToResourceId.set(nodeId, resourceId)
			importTasks.push({ resourceId, kind: item.kind, name, file: item.file })
		}

		if (createdNodeIds.length) {
			options.store.commit('setSelectedNodes', {
				nodeIds: createdNodeIds,
				primaryNodeId: createdNodeIds[0]
			})
		}

		options.cancelActiveImportSession({ cleanupUnresolved: false })
		const sessionId = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		const resourceState = new Map<
			string,
			{ kind: 'image' | 'video'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>()
		for (const task of importTasks) {
			resourceState.set(task.resourceId, {
				kind: task.kind,
				urlReady: false,
				nodeReady: false,
				done: false
			})
		}
		options.startImportSession({
			id: sessionId,
			resourceIdToNode,
			nodeIdToResourceId,
			resourceState,
			total: importTasks.length
		})

		if (!importTasks.length) return

		for (const task of importTasks) {
			if (task.kind !== 'video') continue
			const session = options.getActiveImportSession()
			if (!session || session.id !== sessionId || session.cancelled) break
			const state = session.resourceState.get(task.resourceId)
			const info = resourceIdToNode.get(task.resourceId)
			if (!info || !options.store.state.nodesById[info.nodeId]) continue

			let url = ''
			try {
				url = URL.createObjectURL(task.file)
			} catch {
				url = ''
			}

			const sourcePath =
				typeof (task.file as any)?.path === 'string' ? String((task.file as any).path).trim() : ''

			// 在 Electron 环境中，尝试将本地视频文件复制到项目目录
			const projectId = options.getProjectId?.()
			let projectAssetUrl = ''
			let projectRelPath = ''
			if (projectId && sourcePath) {
				try {
					const copyResult = await options.copyFileToProjectRoot(projectId, sourcePath, task.name)
					if (copyResult && copyResult.ok) {
						projectRelPath = String(copyResult.relativePath || '').trim()
						if (projectRelPath) {
							const dwebUrl = `dweb://project-assets?projectId=${projectId}&path=${encodeURIComponent(projectRelPath)}`
							projectAssetUrl = options.resolveBackendUrl(dwebUrl)
						}
					}
				} catch {
					// 复制失败时回退到 object URL
				}
			}

			const finalUrl = projectAssetUrl || url
			if (state) state.urlReady = Boolean(finalUrl)
			if (finalUrl) {
				if (!projectAssetUrl) {
					options.setObjectUrl(task.resourceId, finalUrl)
				}
				options.store.commit('patchResource', {
					resourceId: task.resourceId,
					patch: {
						url: finalUrl,
						...(sourcePath ? { sourcePath } : {}),
						...(projectRelPath ? { projectRelativePath: projectRelPath } : {})
					}
				})
				options.scheduleVideoMetadataRead({
					sessionId,
					resourceId: task.resourceId,
					nodeId: info.nodeId,
					url: finalUrl
				})
			}
			options.updateImportProgressIfNeeded(sessionId, task.resourceId)
		}

		const imageTasks = importTasks.filter((task) => task.kind === 'image')
		if (!imageTasks.length) return

		// 在 Electron 环境中，预先将本地图片文件复制到项目目录
		const projectIdForImages = options.getProjectId?.()
		const projectAssetUrlByResourceId = new Map<string, { url: string; relPath: string }>()
		if (projectIdForImages) {
			for (const task of imageTasks) {
				const sourcePath =
					typeof (task.file as any)?.path === 'string' ? String((task.file as any).path).trim() : ''

				if (sourcePath) {
					try {
						const copyResult = await options.copyFileToProjectRoot(
							projectIdForImages,
							sourcePath,
							task.name
						)
						if (copyResult && copyResult.ok) {
							const relPath = String(copyResult.relativePath || '').trim()
							if (relPath) {
								const dwebUrl = `dweb://project-assets?projectId=${projectIdForImages}&path=${encodeURIComponent(relPath)}`
								const projectAssetUrl = options.resolveBackendUrl(dwebUrl)
								projectAssetUrlByResourceId.set(task.resourceId, { url: projectAssetUrl, relPath })
							}
						}
					} catch {
						// 复制失败时继续用后续流程
					}
				}
			}
		}

		options.mediaImportManager.enqueue(
			imageTasks.map((task) => ({
				...task,
				onResult: (result: any) => {
					const session = options.getActiveImportSession()
					if (!session || session.id !== sessionId || session.cancelled) return

					const state = session.resourceState.get(result.resourceId)
					const resourceProject = projectAssetUrlByResourceId.get(result.resourceId)
					const finalUrl = resourceProject?.url || result.url

					if (state) {
						state.urlReady = Boolean(finalUrl)
					}

					if (finalUrl) {
						if (!resourceProject) {
							options.setObjectUrl(result.resourceId, finalUrl)
						}
						options.store.commit('patchResource', {
							resourceId: result.resourceId,
							patch: {
								url: finalUrl,
								sourcePath: result.sourcePath || undefined,
								...(resourceProject?.relPath
									? { projectRelativePath: resourceProject.relPath }
									: {})
							}
						})
					} else if (result.sourcePath) {
						options.store.commit('patchResource', {
							resourceId: result.resourceId,
							patch: { sourcePath: result.sourcePath }
						})
					}

					const info = resourceIdToNode.get(result.resourceId)
					if (!info) return
					if (!options.store.state.nodesById[info.nodeId]) return

					const sourcePath =
						typeof result.sourcePath === 'string' ? String(result.sourcePath).trim() : ''
					if (sourcePath) {
						options.store.commit('setNodeResourcePath', {
							nodeId: info.nodeId,
							resourcePath: sourcePath
						})
					}

					if (info.kind === 'image' && result.width && result.height) {
						const width = Math.max(1, Math.floor(Number(result.width) || 1))
						const height = Math.max(1, Math.floor(Number(result.height) || 1))
						options.store.commit('setNodeImageSettings', {
							nodeId: info.nodeId,
							imageSettings: {
								outputWidth: width,
								outputHeight: height,
								naturalWidth: width,
								naturalHeight: height,
								crop: { x: 0, y: 0, width: 1, height: 1 }
							}
						})
						options.autoSizeImageNodeFromDims(info.nodeId, width, height)
					}

					options.updateImportProgressIfNeeded(sessionId, result.resourceId)
				}
			}))
		)
	}

	return {
		createMediaNodesFromFiles
	}
}
