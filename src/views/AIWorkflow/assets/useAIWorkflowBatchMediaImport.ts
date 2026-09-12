import { t } from '../../../i18n'
import { convertWorkflowResourceToLegacy } from '../blueprint-bridge/workflowStateAdapter'

type FileWithPath = File & {
	path?: string
}

type CopyFileResult = {
	ok: boolean
	relativePath?: string
	[key: string]: unknown
}

type MediaImportTask = {
	resourceId: string
	kind: 'image' | 'video' | 'model3d'
	name: string
	file: File
	onResult?: (result: MediaImportResult) => void
	[key: string]: unknown
}

type MediaImportResult = {
	resourceId: string
	url?: string
	sourcePath?: string
	width?: number
	height?: number
	[key: string]: unknown
}

type AIWorkflowStoreState = {
	selectedNodeId?: string | null
	nodesById: Record<string, unknown>
	[key: string]: unknown
}

type AIWorkflowStore = {
	state: AIWorkflowStoreState
	commit: (type: string, payload?: Record<string, unknown>) => void
}

export type AIWorkflowDroppedFile = {
	file: File
	relativePath: string
	fsHandle?: unknown
}

export const useAIWorkflowBatchMediaImport = (options: {
	store: AIWorkflowStore
	engineApi?: {
		addNode?: (
			type: string,
			x: number,
			y: number,
			data?: Record<string, any>,
			opts?: { silent?: boolean; skipEditMode?: boolean }
		) => string | null
		updateNodeData?: (nodeId: string, patch: Record<string, any>) => boolean
		setSelection?: (nodeIds: string[]) => void
		forceSyncToStore?: () => Promise<boolean>
		setLegacyResource?: (resourceId: string, resourceData: Record<string, any>) => void
		getNode?: (nodeId: string) => Record<string, any> | null
	}
	makeResourceId: () => string
	maxBatchImportMediaCount: number
	inferMediaKindFromFile: (file: File) => 'image' | 'video' | 'model3d' | null
	normalizeFileSignatureKey: (name: unknown, size: unknown, lastModified: unknown) => string
	putLocalFileHandle: (key: string, handle: unknown) => Promise<unknown>
	cancelActiveImportSession: (opts?: { cleanupUnresolved?: boolean }) => void
	startImportSession: (payload: {
		id: string
		resourceIdToNode: Map<string, { nodeId: string; kind: 'image' | 'video' | 'model3d' }>
		nodeIdToResourceId: Map<string, string>
		resourceState: Map<
			string,
			{ kind: 'image' | 'video' | 'model3d'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>
		total: number
	}) => void
	getActiveImportSession: () => {
		id: string
		cancelled: boolean
		resourceState: Map<
			string,
			{ kind: 'image' | 'video' | 'model3d'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>
	} | null
	updateImportProgressIfNeeded: (sessionId: string, resourceId: string) => void
	mediaImportManager: {
		enqueue: (tasks: MediaImportTask[]) => void
	}
	setObjectUrl: (key: string, url: string) => void
	scheduleVideoMetadataRead: (payload: {
		sessionId?: string
		resourceId: string
		nodeId: string
		url: string
	}) => void
	autoSizeImageNodeFromDims: (nodeId: string, width: number, height: number) => void
	autoSizeMediaNode?: (nodeId: string, url: string, kind: 'image' | 'video' | 'model3d') => void
	bindMediaResourceToNode?: (
		nodeId: string,
		kind: 'image' | 'video' | 'model3d',
		url: string,
		name: string,
		opts?: {
			posterUrl?: string
			sourcePath?: string
			projectRelativePath?: string
			absolutePath?: string
			resourceId?: string
		}
	) => void
	onLimitExceeded: (count: number, limit: number) => void
	getProjectId: () => number | null
	copyFileToProjectRoot: (
		projectId: number,
		sourcePath: string,
		desiredFilename: string
	) => Promise<CopyFileResult | null>
	uploadProjectAsset: (payload: {
		projectId: number
		kind?: string
		name?: string
		arrayBuffer: ArrayBuffer
		contentType?: string
		bucket?: string
	}) => Promise<{
		ok: boolean
		asset?: { relativePath: string; [key: string]: unknown }
		error?: string
	} | null>
	resolveBackendUrl: (value: string) => string
}) => {
	/**
	 * Persist a file to the project assets directory.
	 * - If the file has a local sourcePath (native file drop/paste), use copyFileToProjectRoot for efficiency.
	 * - Otherwise (web drag-drop, screenshot paste), read ArrayBuffer from the File object and upload via uploadProjectAsset.
	 * Returns the project-relative path on success, or empty string on failure.
	 */
	const persistFileToProject = async (
		projectId: number,
		file: File,
		desiredName: string,
		sourcePath: string
	): Promise<{ url: string; relPath: string; absPath?: string } | null> => {
		console.log('[AIWorkflow:MediaImport] persistFileToProject called:', {
			name: desiredName,
			type: file.type,
			size: file.size,
			hasSourcePath: !!sourcePath,
			sourcePath: sourcePath || '(blob/web/memory)'
		})

		// Try native copy first when we have a local path
		if (sourcePath) {
			try {
				const copyResult = await options.copyFileToProjectRoot(projectId, sourcePath, desiredName)
				if (copyResult && copyResult.ok) {
					const relPath = String(copyResult.relativePath || '').trim()
					if (relPath) {
						const dwebUrl = `dweb://project-assets?projectId=${projectId}&path=${encodeURIComponent(relPath)}`
						console.log('[AIWorkflow:MediaImport] copyFileToProjectRoot succeeded:', {
							name: desiredName,
							relPath
						})
						// ===== 2026-08-03 修复：copyFileToProjectRoot 可能返回 absolutePath，优先提取 =====
						const abs = String((copyResult as any)?.absolutePath || '').trim()
						return {
							url: options.resolveBackendUrl(dwebUrl),
							relPath,
							...(abs ? { absPath: abs } : {})
						}
					}
				}
				console.warn('[AIWorkflow:MediaImport] copyFileToProjectRoot returned not-ok:', copyResult)
			} catch (err) {
				console.warn(
					'[AIWorkflow:MediaImport] copyFileToProjectRoot failed, falling back to ArrayBuffer upload:',
					err
				)
			}
		}

		// Fallback: read File as ArrayBuffer and upload (for web drag-drop, screenshots, clipboard blobs)
		try {
			const arrayBuffer = await file.arrayBuffer()
			const contentType = file.type || 'application/octet-stream'
			const bucket = file.type.startsWith('image/')
				? 'assets'
				: file.type.startsWith('video/')
					? 'assets'
					: file.type.startsWith('model/')
						? 'assets'
						: 'assets'
			const uploadResult = await options.uploadProjectAsset({
				projectId,
				name: desiredName,
				arrayBuffer,
				contentType,
				bucket
			})
			if (uploadResult?.ok && uploadResult.asset?.relativePath) {
				const relPath = String(uploadResult.asset.relativePath).trim()
				const dwebUrl = `dweb://project-assets?projectId=${projectId}&path=${encodeURIComponent(relPath)}`
				console.log('[AIWorkflow:MediaImport] File uploaded via ArrayBuffer:', {
					name: desiredName,
					relPath,
					size: arrayBuffer.byteLength
				})
				// ===== 2026-08-03 修复：尝试从 uploadProjectAsset 结果中提取 absolutePath =====
				const abs = String((uploadResult.asset as any)?.absolutePath || '').trim()
				return {
					url: options.resolveBackendUrl(dwebUrl),
					relPath,
					...(abs ? { absPath: abs } : {})
				}
			}
			console.warn('[AIWorkflow:MediaImport] uploadProjectAsset returned not-ok:', uploadResult)
		} catch (err) {
			console.warn('[AIWorkflow:MediaImport] uploadProjectAsset via ArrayBuffer failed:', err)
		}
		return null
	}

	/**
	 * 资源写穿：Vuex resourcesById 变更后立即同步到引擎 scene._legacyResources。
	 * 不依赖 Vue 响应式 prop watcher 的 flush 时序，保证 forceSyncToStore/serializeLegacy
	 * 在任何时刻序列化引擎都能拿到资源，避免 hydrateDraft 误判「空快照」而清空资源。
	 */
	const syncResourceToEngine = (resourceId: string) => {
		try {
			const rid = String(resourceId ?? '').trim()
			if (!rid) return
			const res = (options.store.state as any).resourcesById?.[rid]
			if (!res) return
			options.engineApi?.setLegacyResource?.(rid, convertWorkflowResourceToLegacy(res))
		} catch (err) {
			console.warn('[AIWorkflow:MediaImport] syncResourceToEngine failed:', err)
		}
	}

	const createMediaNodesFromFiles = async (opts: {
		files: AIWorkflowDroppedFile[]
		worldX: number
		worldY: number
	}) => {
		console.log('[AIWorkflow:MediaImport] createMediaNodesFromFiles called:', {
			fileCount: opts.files.length,
			worldX: opts.worldX,
			worldY: opts.worldY,
			files: opts.files.map((f) => ({
				name: f.file.name,
				type: f.file.type,
				size: f.file.size,
				hasFsHandle: !!f.fsHandle,
				hasPath:
					typeof (f.file as FileWithPath)?.path === 'string' &&
					String((f.file as FileWithPath).path).trim().length > 0
			}))
		})
		const media = opts.files
			.map((item) => ({ ...item, kind: options.inferMediaKindFromFile(item.file) }))
			.filter(
				(item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'model3d'
			) as Array<AIWorkflowDroppedFile & { kind: 'image' | 'video' | 'model3d' }>
		if (!media.length) return

		if (media.length > options.maxBatchImportMediaCount) {
			options.onLimitExceeded(media.length, options.maxBatchImportMediaCount)
			return
		}

		const COLS = 4
		const CELL_W = 520
		const CELL_H = 380

		const createdNodeIds: string[] = []
		const resourceIdToNode = new Map<
			string,
			{ nodeId: string; kind: 'image' | 'video' | 'model3d' }
		>()
		const nodeIdToResourceId = new Map<string, string>()
		const importTasks: Array<{
			resourceId: string
			kind: 'image' | 'video' | 'model3d'
			name: string
			file: File
		}> = []
		let anyUsedEngine = false

		for (let i = 0; i < media.length; i += 1) {
			const item = media[i]
			const col = i % COLS
			const row = Math.floor(i / COLS)
			const worldX = opts.worldX + col * CELL_W
			const worldY = opts.worldY + row * CELL_H

			const name = String(
				item.relativePath ||
					item.file.name ||
					(item.kind === 'image' ? 'image' : item.kind === 'video' ? 'video' : 'model')
			)
			const absPath =
				typeof (item.file as FileWithPath)?.path === 'string'
					? String((item.file as FileWithPath).path).trim()
					: ''
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
			// P1-1 资源写穿：节点创建阶段即把资源（即使 url 暂空）同步给引擎，
			// 防止 forceSyncToStore 抢先序列化空资源表导致 hydrateDraft 清空资源
			syncResourceToEngine(resourceId)

			const nodeType = item.kind === 'model3d' ? 'model3d' : item.kind
			const title =
				item.kind === 'image'
					? t('common.image')
					: item.kind === 'video'
						? t('common.video')
						: t('nodes.type.model3d')

			// 计算初始 model3dSettings，用于在引擎创建节点时就绑定资源关系，防止 hydrateDraft 覆盖
			const lowerNameInit = String(name || '').toLowerCase()
			let initModelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
			if (lowerNameInit.endsWith('.gltf')) initModelFormat = 'gltf'
			else if (lowerNameInit.endsWith('.fbx')) initModelFormat = 'fbx'
			else if (lowerNameInit.endsWith('.obj')) initModelFormat = 'obj'
			else if (lowerNameInit.endsWith('.stl')) initModelFormat = 'stl'
			else if (lowerNameInit.endsWith('.dae')) initModelFormat = 'dae'

			const nodeCreateData: Record<string, any> = {
				title,
				resourceId: resourceId
			}
			// 对于 model3d，同时传递初始 model3dSettings，确保引擎节点创建时即有数据
			if (item.kind === 'model3d') {
				nodeCreateData.model3dSettings = {
					modelUrl: '',
					modelFormat: initModelFormat,
					modelSourceName: name,
					modelSourcePath: absPath || undefined
				}
				console.log('[AIWorkflow:MediaImport] Creating model3d node with initial data:', {
					resourceId,
					name,
					initModelFormat,
					absPath
				})
			}

			// 批量创建时使用 silent + skipEditMode：
			// 1. 避免6次 enterEditMode 设置 editingNodeId，导致 applyInitialData 被阻止
			//    （applyInitialData 检查 editingNodeId，非空时直接 return，不执行 loadBlueprint）
			// 2. 避免6次 emitChange 的防抖竞争
			// 3. 批量创建后统一 setSelection + forceSyncToStore 同步
			let nodeId: string | null | undefined = options.engineApi?.addNode?.(
				nodeType,
				worldX,
				worldY,
				nodeCreateData,
				{ silent: true, skipEditMode: true }
			)
			console.log('[AIWorkflow:MediaImport] addNode result:', {
				nodeType,
				nodeId,
				resourceId,
				usedEngine: Boolean(nodeId)
			})
			const usedEngine = Boolean(nodeId)
			if (usedEngine) anyUsedEngine = true

			// P3 直接同步（核心修复）：addNode 成功后立即通过 getNode 获取引擎节点数据，
			// 直接 upsert 到 store。这完全绕过 forceSyncToStore 的时序依赖，
			// 确保节点在 store 中立即可用，后续图片结果回调时不会出现 "node not yet in store"
			if (nodeId && options.engineApi?.getNode) {
				try {
					const engineNode = options.engineApi.getNode(nodeId)
					if (engineNode) {
						// BlueprintNode 对象的纯数据在 .data 属性中
						const nodeData =
							(engineNode as any)?.data && typeof (engineNode as any).data === 'object'
								? (engineNode as any).data
								: engineNode
						// 确保 nodeData 有 id 字段
						if (!(nodeData as any).id) (nodeData as any).id = nodeId
						if (!(nodeData as any).type) (nodeData as any).type = nodeType
						options.store.commit('upsertWorkflowNode', { node: nodeData })
						console.log(
							'[AIWorkflow:MediaImport] Immediately upserted node to store:',
							nodeId,
							'inStore:',
							!!options.store.state.nodesById[nodeId]
						)
					} else {
						console.warn(
							'[AIWorkflow:MediaImport] engineApi.getNode returned null immediately after addNode:',
							nodeId
						)
					}
				} catch (upsertErr) {
					console.warn(
						'[AIWorkflow:MediaImport] Immediate upsert failed for node:',
						nodeId,
						upsertErr
					)
				}
			}
			if (!nodeId) {
				options.store.commit('addNodeAt', {
					worldX,
					worldY,
					title
				})
				nodeId = options.store.state.selectedNodeId
				if (!nodeId) continue
				options.store.commit('setNodeType', { nodeId, type: nodeType })
				if (item.kind !== 'model3d') {
					options.store.commit('setNodeResource', { nodeId, resourceId })
				}
				if (absPath) {
					if (item.kind === 'model3d') {
						// For model3d, path is handled in bindMediaResourceToNode
					} else {
						options.store.commit('setNodeResourcePath', { nodeId, resourcePath: absPath })
					}
				}
			} else if (absPath && options.engineApi?.updateNodeData) {
				if (item.kind === 'model3d') {
					// For model3d, will bind later
				} else {
					options.engineApi.updateNodeData(nodeId, { resourceId, resourcePath: absPath })
				}
			} else if (options.engineApi?.updateNodeData && item.kind !== 'model3d') {
				options.engineApi.updateNodeData(nodeId, { resourceId })
			}
			createdNodeIds.push(nodeId)
			resourceIdToNode.set(resourceId, { nodeId, kind: item.kind })
			nodeIdToResourceId.set(nodeId, resourceId)
			importTasks.push({ resourceId, kind: item.kind, name, file: item.file })
		}

		if (createdNodeIds.length) {
			if (anyUsedEngine && options.engineApi?.setSelection) {
				options.engineApi.setSelection(createdNodeIds)
			} else {
				options.store.commit('setSelectedNodes', {
					nodeIds: createdNodeIds,
					primaryNodeId: createdNodeIds[0]
				})
			}

			// 主动强制同步引擎Scene到Vuex store，解决多文件批量创建时isUpdatingFromStore时序竞争
			// 导致change事件被跳过、nodesById中找不到新节点的问题
			if (anyUsedEngine && options.engineApi?.forceSyncToStore) {
				console.log(
					'[AIWorkflow:MediaImport] Forcing engine-to-store sync after batch node creation, node count:',
					createdNodeIds.length
				)
				try {
					let syncOk = await options.engineApi.forceSyncToStore()
					console.log('[AIWorkflow:MediaImport] forceSyncToStore result:', syncOk)
					// 验证所有节点是否已在store中
					let missingNodes = createdNodeIds.filter((id) => !options.store.state.nodesById[id])

					// P2 兜底：如果 forceSyncToStore 后节点仍然不在 store 中，重试最多3次
					let retryCount = 0
					while (missingNodes.length > 0 && retryCount < 3) {
						retryCount++
						console.warn(
							`[AIWorkflow:MediaImport] forceSync retry ${retryCount}/3, missing nodes:`,
							missingNodes
						)
						await new Promise<void>((resolve) => setTimeout(resolve, 100))
						try {
							await options.engineApi.forceSyncToStore()
						} catch (retryErr) {
							console.warn('[AIWorkflow:MediaImport] forceSync retry error:', retryErr)
						}
						missingNodes = createdNodeIds.filter((id) => !options.store.state.nodesById[id])
					}

					// P2 终极兜底：如果重试后节点仍然不在 store 中，通过 engineApi.getNode 获取引擎节点数据，
					// 手动 upsert 到 store。这确保节点一定在 store 中，即使 forceSyncToStore/hydrateDraft 时序失败
					if (missingNodes.length > 0 && options.engineApi?.getNode) {
						console.warn(
							'[AIWorkflow:MediaImport] forceSync failed after retries, manually upserting nodes from engine:',
							missingNodes
						)
						for (const nodeId of missingNodes) {
							try {
								const engineNode = options.engineApi.getNode(nodeId)
								if (engineNode) {
									// BlueprintNode 对象的纯数据在 .data 属性中（见 BlueprintScene.serialize）
									// 如果返回的对象有 .data 属性，取 .data；否则直接用对象本身
									const nodeData =
										(engineNode as any)?.data && typeof (engineNode as any).data === 'object'
											? (engineNode as any).data
											: engineNode
									options.store.commit('upsertWorkflowNode', { node: nodeData })
									console.log(
										'[AIWorkflow:MediaImport] Manually upserted node from engine data:',
										nodeId
									)
								} else {
									console.warn(
										'[AIWorkflow:MediaImport] engineApi.getNode returned null for:',
										nodeId
									)
								}
							} catch (upsertErr) {
								console.error(
									'[AIWorkflow:MediaImport] Manual upsert failed for node:',
									nodeId,
									upsertErr
								)
							}
						}
					}

					missingNodes = createdNodeIds.filter((id) => !options.store.state.nodesById[id])
					if (missingNodes.length > 0) {
						console.error(
							'[AIWorkflow:MediaImport] Nodes still missing from store after all fallbacks:',
							missingNodes
						)
					} else {
						console.log(
							'[AIWorkflow:MediaImport] All created nodes verified in store:',
							createdNodeIds.length
						)
					}
				} catch (err) {
					console.error('[AIWorkflow:MediaImport] forceSyncToStore error:', err)
				}
			} else {
				// Fallback：等待几帧让debounced change事件完成同步
				console.log(
					'[AIWorkflow:MediaImport] No forceSyncToStore available, waiting for debounced sync...'
				)
				await new Promise<void>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							setTimeout(() => resolve(), 50)
						})
					})
				})
			}
		}

		// 先处理3D模型文件（直接绑定，不需要走图片/视频的导入流程）
		const model3dTasks = importTasks.filter((task) => task.kind === 'model3d')
		for (const task of model3dTasks) {
			const info = resourceIdToNode.get(task.resourceId)
			if (!info) {
				console.warn(
					'[AIWorkflow:MediaImport] Model3D task: no node mapping for resourceId:',
					task.resourceId
				)
				continue
			}
			const nodeInStore = !!options.store.state.nodesById[info.nodeId]
			if (!nodeInStore) {
				console.warn(
					'[AIWorkflow:MediaImport] Model3D task: node not yet in store, proceeding via bindMediaResourceToNode:',
					info.nodeId
				)
			}

			const sourcePath =
				typeof (task.file as FileWithPath)?.path === 'string'
					? String((task.file as FileWithPath).path).trim()
					: ''

			// Persist file to project: prefers native copy for local files, falls back to ArrayBuffer upload for web blobs
			const projectId = options.getProjectId?.()
			let projectAssetUrl = ''
			let projectRelPath = ''
			let projectAbsPath = ''
			let fallbackObjectUrl = ''

			if (projectId) {
				const persisted = await persistFileToProject(projectId, task.file, task.name, sourcePath)
				if (persisted) {
					projectAssetUrl = persisted.url
					projectRelPath = persisted.relPath
					projectAbsPath = persisted.absPath || ''
				}
			}

			// Fallback to object URL only if project persistence failed
			if (!projectAssetUrl) {
				try {
					fallbackObjectUrl = URL.createObjectURL(task.file)
				} catch {
					fallbackObjectUrl = ''
				}
			}

			const finalUrl = projectAssetUrl || fallbackObjectUrl
			console.log('[AIWorkflow:MediaImport] Model3D task preparing:', {
				resourceId: task.resourceId,
				nodeId: info.nodeId,
				name: task.name,
				sourcePath: sourcePath || '(blob/web)',
				hasProjectUrl: !!projectAssetUrl,
				usingObjectUrl: !projectAssetUrl && !!fallbackObjectUrl,
				finalUrl: finalUrl ? finalUrl.slice(0, 80) : ''
			})
			if (finalUrl) {
				if (!projectAssetUrl && fallbackObjectUrl) {
					options.setObjectUrl(`model3d:${info.nodeId}`, finalUrl)
				}
				options.store.commit('patchResource', {
					resourceId: task.resourceId,
					patch: {
						url: finalUrl,
						...(sourcePath ? { sourcePath } : {}),
						...(projectRelPath ? { projectRelativePath: projectRelPath } : {}),
						// ===== 2026-08-03 修复：同时传递 absolutePath =====
						...(projectAbsPath ? { absolutePath: projectAbsPath } : {})
					}
				})
				syncResourceToEngine(task.resourceId)

				// 使用bindMediaResourceToNode绑定3D模型资源
				if (options.bindMediaResourceToNode) {
					options.bindMediaResourceToNode(info.nodeId, 'model3d', finalUrl, task.name, {
						sourcePath: sourcePath || undefined,
						projectRelativePath: projectRelPath || undefined,
						absolutePath: projectAbsPath || undefined,
						resourceId: task.resourceId
					})
					console.log('[AIWorkflow:MediaImport] Model3D bound via bindMediaResourceToNode:', {
						nodeId: info.nodeId,
						resourceId: task.resourceId
					})
				} else {
					// Fallback: directly set model3d settings
					const lowerName = String(task.name || '').toLowerCase()
					let modelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
					if (lowerName.endsWith('.gltf')) modelFormat = 'gltf'
					else if (lowerName.endsWith('.fbx')) modelFormat = 'fbx'
					else if (lowerName.endsWith('.obj')) modelFormat = 'obj'
					else if (lowerName.endsWith('.stl')) modelFormat = 'stl'
					else if (lowerName.endsWith('.dae')) modelFormat = 'dae'
					options.store.commit('setNodeModel3DSettings', {
						nodeId: info.nodeId,
						model3dSettings: {
							modelUrl: finalUrl,
							modelFormat,
							modelSourceName: task.name,
							modelSourcePath: sourcePath || undefined,
							modelAssetUrl: projectAssetUrl || undefined,
							modelAssetPath: sourcePath || undefined
						}
					})
					console.log(
						'[AIWorkflow:MediaImport] Model3D bound via fallback setNodeModel3DSettings:',
						{
							nodeId: info.nodeId,
							modelFormat
						}
					)
				}

				if (options.autoSizeMediaNode) {
					options.autoSizeMediaNode(info.nodeId, finalUrl, 'model3d')
				}

				// ===== 关键修复：在资源绑定完成后，立即将最终数据（URL、Path等）强制同步回引擎 =====
				// 防止后续操作（如移动、保存、切换节点）触发 hydrateDraft 时，引擎端空数据覆盖 Store 中的绑定信息
				if (options.engineApi?.updateNodeData) {
					try {
						const finalModelFormat = (() => {
							const lower = String(task.name || '').toLowerCase()
							if (lower.endsWith('.gltf')) return 'gltf'
							if (lower.endsWith('.fbx')) return 'fbx'
							if (lower.endsWith('.obj')) return 'obj'
							if (lower.endsWith('.stl')) return 'stl'
							if (lower.endsWith('.dae')) return 'dae'
							return 'glb'
						})()
						const patchPayload = {
							resourceId: task.resourceId,
							resourcePath: projectAbsPath || sourcePath || undefined,
							model3dSettings: {
								modelUrl: finalUrl,
								modelFormat: finalModelFormat,
								modelSourceName: task.name,
								modelSourcePath: sourcePath || undefined,
								modelAssetUrl: projectAssetUrl || undefined,
								modelAssetPath: projectRelPath || sourcePath || undefined
							}
						}
						const syncOk = options.engineApi.updateNodeData(info.nodeId, patchPayload)
						console.log('[AIWorkflow:MediaImport] Model3D data force-synced to engine:', {
							nodeId: info.nodeId,
							resourceId: task.resourceId,
							syncOk,
							hasUrl: !!finalUrl,
							hasAbsPath: !!projectAbsPath
						})
					} catch (syncErr) {
						console.error(
							'[AIWorkflow:MediaImport] Model3D data force-sync to engine FAILED:',
							syncErr
						)
					}
				}
			} else {
				console.warn('[AIWorkflow:MediaImport] Model3D task failed: no finalUrl:', task.name)
			}
		}

		options.cancelActiveImportSession({ cleanupUnresolved: false })
		const sessionId = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		const resourceState = new Map<
			string,
			{ kind: 'image' | 'video' | 'model3d'; urlReady: boolean; nodeReady: boolean; done: boolean }
		>()
		for (const task of importTasks) {
			resourceState.set(task.resourceId, {
				kind: task.kind,
				urlReady: task.kind === 'model3d', // model3d already handled above
				nodeReady: task.kind === 'model3d',
				done: task.kind === 'model3d'
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
			if (!info) {
				console.warn(
					'[AIWorkflow:MediaImport] Video task: no node mapping for resourceId:',
					task.resourceId
				)
				continue
			}
			const nodeInStore = !!options.store.state.nodesById[info.nodeId]
			if (!nodeInStore) {
				console.warn(
					'[AIWorkflow:MediaImport] Video task: node not yet in store, proceeding:',
					info.nodeId
				)
			}

			const sourcePath =
				typeof (task.file as FileWithPath)?.path === 'string'
					? String((task.file as FileWithPath).path).trim()
					: ''

			// Persist file to project: prefers native copy for local files, falls back to ArrayBuffer upload for web blobs
			const projectId = options.getProjectId?.()
			let projectAssetUrl = ''
			let projectRelPath = ''
			let fallbackObjectUrl = ''

			if (projectId) {
				const persisted = await persistFileToProject(projectId, task.file, task.name, sourcePath)
				if (persisted) {
					projectAssetUrl = persisted.url
					projectRelPath = persisted.relPath
				}
			}

			// Fallback to object URL only if project persistence failed
			if (!projectAssetUrl) {
				try {
					fallbackObjectUrl = URL.createObjectURL(task.file)
				} catch {
					fallbackObjectUrl = ''
				}
			}

			const finalUrl = projectAssetUrl || fallbackObjectUrl
			if (state) state.urlReady = Boolean(finalUrl)
			if (finalUrl) {
				if (!projectAssetUrl && fallbackObjectUrl) {
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
				syncResourceToEngine(task.resourceId)
				console.log('[AIWorkflow:MediaImport] Video task prepared:', {
					resourceId: task.resourceId,
					nodeId: info.nodeId,
					name: task.name,
					sourcePath: sourcePath || '(blob/web)',
					hasProjectUrl: !!projectAssetUrl,
					usingObjectUrl: !projectAssetUrl && !!fallbackObjectUrl,
					finalUrl: finalUrl.slice(0, 80)
				})
				options.scheduleVideoMetadataRead({
					sessionId,
					resourceId: task.resourceId,
					nodeId: info.nodeId,
					url: finalUrl
				})
			}

			// Mark nodeReady immediately (same logic as images: URL set = data ready, metadata loads async)
			if (state && finalUrl) {
				state.nodeReady = true
				console.log('[AIWorkflow:MediaImport] Video node marked ready:', {
					nodeId: info.nodeId,
					resourceId: task.resourceId,
					urlReady: state.urlReady,
					nodeReady: state.nodeReady
				})
			}

			options.updateImportProgressIfNeeded(sessionId, task.resourceId)
		}

		const imageTasks = importTasks.filter((task) => task.kind === 'image')
		if (!imageTasks.length) return

		// Persist image files to project directory before worker processing.
		// Uses persistFileToProject which prefers native copy for local files,
		// falls back to ArrayBuffer upload for web drag-drop / screenshot blobs.
		const projectIdForImages = options.getProjectId?.()
		const projectAssetUrlByResourceId = new Map<string, { url: string; relPath: string }>()
		if (projectIdForImages) {
			for (const task of imageTasks) {
				const sourcePath =
					typeof (task.file as FileWithPath)?.path === 'string'
						? String((task.file as FileWithPath).path).trim()
						: ''

				try {
					const persisted = await persistFileToProject(
						projectIdForImages,
						task.file,
						task.name,
						sourcePath
					)
					if (persisted) {
						projectAssetUrlByResourceId.set(task.resourceId, {
							url: persisted.url,
							relPath: persisted.relPath
						})
						console.log('[AIWorkflow:MediaImport] Image persisted to project:', {
							name: task.name,
							sourcePath: sourcePath || '(blob/web)',
							relPath: persisted.relPath
						})
					}
				} catch (err) {
					console.warn(
						'[AIWorkflow:MediaImport] Image persist failed, will use object URL:',
						task.name,
						err
					)
				}
			}
		}

		// 等待一帧，确保 Vuex store 完成 nodesById 的同步
		// 修复多文件导入时 worker 返回结果早于 store 同步导致的 "node not found" 问题
		// engineApi.addNode 调用 scene.createWorkflowNode 后，store 的响应式同步可能在 microtask 中完成
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

		console.log('[AIWorkflow:MediaImport] About to enqueue image tasks, nodesById sample check:', {
			taskCount: imageTasks.length,
			firstTaskNodeId: resourceIdToNode.get(imageTasks[0]?.resourceId)?.nodeId,
			firstNodeInStore: !!(
				imageTasks[0] &&
				options.store.state.nodesById[resourceIdToNode.get(imageTasks[0].resourceId)?.nodeId ?? '']
			)
		})

		options.mediaImportManager.enqueue(
			imageTasks.map((task) => ({
				...task,
				onResult: (result: MediaImportResult) => {
					const applyResultToNode = () => {
						const session = options.getActiveImportSession()
						if (!session || session.id !== sessionId || session.cancelled) {
							console.log(
								'[AIWorkflow:MediaImport] Image result received but session invalid/cancelled:',
								result.resourceId
							)
							return
						}

						const state = session.resourceState.get(result.resourceId)
						const resourceProject = projectAssetUrlByResourceId.get(result.resourceId)
						const finalUrl = resourceProject?.url || result.url

						console.log('[AIWorkflow:MediaImport] Image task result:', {
							resourceId: result.resourceId,
							name: task.name,
							hasProjectUrl: !!resourceProject,
							finalUrl: finalUrl ? finalUrl.slice(0, 80) : '',
							width: result.width,
							height: result.height,
							sourcePath: result.sourcePath || ''
						})

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
						// P1-1 资源写穿：缩略结果回补 URL/路径后立即同步引擎
						syncResourceToEngine(result.resourceId)

						const info = resourceIdToNode.get(result.resourceId)
						if (!info) {
							console.warn(
								'[AIWorkflow:MediaImport] Image result: no node mapping for resourceId:',
								result.resourceId
							)
							return
						}

						// 不依赖 nodesById 检查来决定是否更新节点。
						// resourceIdToNode 映射是同步构建的，engineApi 直接操作 Scene，不依赖 Vuex store 状态。
						// 即使 store 中 nodesById 尚未同步完成（多文件导入时可能因响应式延迟导致），
						// engineApi.updateNodeData 仍可直接更新蓝图节点数据。
						const nodeInStore = !!options.store.state.nodesById[info.nodeId]
						if (!nodeInStore) {
							console.warn(
								'[AIWorkflow:MediaImport] Image result: node not yet in store, will retry via engineApi:',
								info.nodeId
							)
						}

						const sourcePath =
							typeof result.sourcePath === 'string' ? String(result.sourcePath).trim() : ''
						if (sourcePath) {
							if (options.engineApi?.updateNodeData) {
								options.engineApi.updateNodeData(info.nodeId, { resourcePath: sourcePath })
							} else {
								options.store.commit('setNodeResourcePath', {
									nodeId: info.nodeId,
									resourcePath: sourcePath
								})
							}
						}

						let dimensionsSet = false
						if (info.kind === 'image' && result.width && result.height) {
							const width = Math.max(1, Math.floor(Number(result.width) || 1))
							const height = Math.max(1, Math.floor(Number(result.height) || 1))
							const imageSettings = {
								outputWidth: width,
								outputHeight: height,
								naturalWidth: width,
								naturalHeight: height,
								crop: { x: 0, y: 0, width: 1, height: 1 }
							}
							if (options.engineApi?.updateNodeData) {
								options.engineApi.updateNodeData(info.nodeId, { imageSettings })
							} else {
								options.store.commit('setNodeImageSettings', {
									nodeId: info.nodeId,
									imageSettings
								})
							}
							options.autoSizeImageNodeFromDims(info.nodeId, width, height)
							dimensionsSet = true
						}

						// 无论节点是否已出现在 store 中，都标记 nodeReady = true 并更新进度。
						// 这是修复进度条卡住的关键：数据层面已就绪（URL、尺寸已通过 engineApi 设置），
						// DOM 渲染会通过响应式系统自动跟进，无需等待 node-media-ready 事件。
						if (state && finalUrl) {
							state.nodeReady = true
							console.log('[AIWorkflow:MediaImport] Image node marked ready:', {
								nodeId: info.nodeId,
								resourceId: result.resourceId,
								urlReady: state.urlReady,
								nodeReady: state.nodeReady,
								dimensionsSet,
								nodeInStore
							})
						}

						options.updateImportProgressIfNeeded(sessionId, result.resourceId)
					}

					// 如果节点尚未同步到 store，短暂延迟后重试（最多 20 次，每次 16ms ≈ 一帧，总计约 320ms）
					// 这主要是为了确保 store commit 能正确作用于节点，同时 engineApi 更新会立即执行
					const info = resourceIdToNode.get(result.resourceId)
					if (info && !options.store.state.nodesById[info.nodeId]) {
						let retries = 0
						const tryApply = () => {
							if (options.store.state.nodesById[info.nodeId] || retries >= 20) {
								applyResultToNode()
							} else {
								retries++
								setTimeout(tryApply, 16)
							}
						}
						tryApply()
					} else {
						applyResultToNode()
					}
				}
			}))
		)
	}

	return {
		createMediaNodesFromFiles
	}
}
