import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { executeNodeConnectionTransaction } from './useAIWorkflowNodeConnectionTransaction'

const LOG_PREFIX = '[VideoScreenshot]'

export const useAIWorkflowVideoScreenshot = (payload: {
	getNode: (nodeId: string) => WorkflowNode | null
	getAllNodes: () => WorkflowNode[]
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	dataUrlToBlob: (dataUrl: string) => Blob
	onNodeUploadResource: (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: {
			autoDistribute?: boolean
			onAfterBind?: (bindPayload: { resourceId: string; url: string }) => void
		}
	) => Promise<void> | void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	commitSetNodeImageSettings: (input: {
		nodeId: string
		imageSettings: {
			outputWidth: number
			outputHeight: number
			naturalWidth: number
			naturalHeight: number
			cropEnabled: boolean
			crop: { x: number; y: number; width: number; height: number }
		}
	}) => void
	commitAddNodeAt?: (payload: {
		worldX: number
		worldY: number
		title?: string
		type?: string
	}) => string | null
	commitSetNodeType?: (payload: { nodeId: string; type: string }) => void
	connectPorts: (
		fId: string,
		fA: string,
		tId: string,
		tA: string,
		opts?: { silent?: boolean }
	) => boolean
	engineApiAddNode: (
		type: string,
		x: number,
		y: number,
		data?: Record<string, any>,
		opts?: { silent?: boolean; skipEditMode?: boolean }
	) => string | null
	engineApiUpdateNodeData?: (
		nodeId: string,
		patch: Record<string, any>,
		opts?: { silent?: boolean }
	) => boolean
	engineApiSetLegacyResource?: (resourceId: string, resourceData: Record<string, any>) => void
	forceSyncToStore: () => Promise<boolean>
	beginBulkUpdate?: () => void
	endBulkUpdate?: () => void
	clearPendingChanges?: () => void
	getNodeResourceUrl?: (nodeId: string) => string | null
	videoScreenshotNodeTitle: string
}) => {
	const VIDEO_OUTPUT_ANCHOR_ID = 'out-resource'
	// image节点已移除in-resource锚点，改用in-0（多模态输入）
	const IMAGE_INPUT_ANCHOR_ID = 'in-0'

	const log = (message: string, ...args: unknown[]) => {
		console.log(`${LOG_PREFIX} ${message}`, ...args)
	}

	const warn = (message: string, ...args: unknown[]) => {
		console.warn(`${LOG_PREFIX} ${message}`, ...args)
	}

	const error = (message: string, ...args: unknown[]) => {
		console.error(`${LOG_PREFIX} ${message}`, ...args)
	}

	const findNonOverlappingPosition = (
		videoNode: WorkflowNode
	): { worldX: number; worldY: number } => {
		const videoWidth = Number(videoNode.width) || 320
		const videoHeight = Number(videoNode.height) || 240
		const spacing = 40
		const imageNodeWidth = 240
		const imageNodeHeight = 160

		// 获取该视频节点下游已连接的图片节点数量，用于计算垂直偏移
		const outgoingEdges = payload.getOutgoingEdges(videoNode.id, VIDEO_OUTPUT_ANCHOR_ID)
		const existingScreenshotCount = outgoingEdges.filter((e) => {
			const toNode = payload.getNode(String(e?.toNodeId ?? ''))
			return toNode && toNode.type === 'image'
		}).length

		log(
			'findNonOverlappingPosition: existing screenshot nodes from this video:',
			existingScreenshotCount
		)

		const baseWorldX = (videoNode.worldX || 0) + videoWidth + spacing
		// 根据已有截图数量计算垂直偏移，每个截图节点垂直排列
		const baseWorldY =
			(videoNode.worldY || 0) + existingScreenshotCount * (imageNodeHeight + spacing)
		const allNodes = payload.getAllNodes()

		const checkOverlap = (x: number, y: number): boolean => {
			return allNodes.some((n) => {
				if (n.id === videoNode.id) return false
				const nx = n.worldX || 0
				const ny = n.worldY || 0
				const nw = Number(n.width) || 240
				const nh = Number(n.height) || 160
				const pad = 16
				return !(
					x + imageNodeWidth + pad < nx ||
					x > nx + nw + pad ||
					y + imageNodeHeight + pad < ny ||
					y > ny + nh + pad
				)
			})
		}

		// 首选位置：根据已有截图数量偏移后的位置
		let worldX = baseWorldX
		let worldY = baseWorldY
		if (!checkOverlap(worldX, worldY)) {
			return { worldX, worldY }
		}

		// 如果首选位置被占用，继续向下搜索
		for (let offset = 1; offset <= 30; offset++) {
			worldY = baseWorldY + offset * (imageNodeHeight + spacing)
			if (!checkOverlap(worldX, worldY)) {
				return { worldX, worldY }
			}
		}

		// 如果第一列都被占满，换到第二列
		worldX = baseWorldX + imageNodeWidth + spacing
		worldY = videoNode.worldY || 0
		for (let offset = 0; offset <= 30; offset++) {
			worldY = (videoNode.worldY || 0) + offset * (imageNodeHeight + spacing)
			if (!checkOverlap(worldX, worldY)) {
				return { worldX, worldY }
			}
		}

		// 最后兜底：返回一个足够远的位置
		return { worldX: baseWorldX, worldY: baseWorldY + 31 * (imageNodeHeight + spacing) }
	}

	const findConnectedImageNode = (videoNodeId: string): WorkflowNode | null => {
		const edges = payload.getOutgoingEdges(videoNodeId, VIDEO_OUTPUT_ANCHOR_ID)
		log(
			'findConnectedImageNode: checking outgoing edges for anchor',
			VIDEO_OUTPUT_ANCHOR_ID,
			'edges:',
			edges.length
		)
		for (const edge of edges) {
			const toNodeId = String(edge?.toNodeId ?? '').trim()
			if (!toNodeId) continue
			const toNode = payload.getNode(toNodeId)
			if (toNode && toNode.type === 'image') {
				log('findConnectedImageNode: found connected image node', toNodeId)
				return toNode
			}
		}
		log('findConnectedImageNode: no connected image node found')
		return null
	}

	const countExistingScreenshotNodes = (videoNodeId: string): number => {
		const edges = payload.getOutgoingEdges(videoNodeId, VIDEO_OUTPUT_ANCHOR_ID)
		let count = 0
		for (const edge of edges) {
			const toNodeId = String(edge?.toNodeId ?? '').trim()
			if (!toNodeId) continue
			const toNode = payload.getNode(toNodeId)
			if (toNode && toNode.type === 'image') {
				count++
			}
		}
		return count
	}

	const createImageNodeWithTransaction = async (
		videoNodeId: string,
		time: number
	): Promise<string | null> => {
		const videoNode = payload.getNode(videoNodeId)
		if (!videoNode) {
			error('createImageNodeWithTransaction: video node not found', videoNodeId)
			return null
		}

		const { worldX, worldY } = findNonOverlappingPosition(videoNode)
		const title = `${payload.videoScreenshotNodeTitle} (${Math.max(0, time).toFixed(2)}s)`

		log('createImageNodeWithTransaction: creating image node at', { worldX, worldY, title })

		const result = await executeNodeConnectionTransaction({
			logPrefix: LOG_PREFIX,
			beginBulkUpdate: payload.beginBulkUpdate,
			endBulkUpdate: payload.endBulkUpdate,
			clearPendingChanges: payload.clearPendingChanges,
			createTargetNode: () => {
				// 优先使用engineApi添加节点（在图形引擎层创建），使用silent模式避免触发enterEditMode和selection事件
				let newNodeId: string | null = null
				if (payload.engineApiAddNode) {
					newNodeId = payload.engineApiAddNode(
						'image',
						worldX,
						worldY,
						{
							title,
							alias: title
						},
						{ silent: true, skipEditMode: true }
					)
					log('createTargetNode: engineApiAddNode (silent) returned', newNodeId)
				}
				// Fallback到store commit
				if (!newNodeId && payload.commitAddNodeAt) {
					newNodeId = payload.commitAddNodeAt({ worldX, worldY, title, type: 'image' })
					log('createTargetNode: commitAddNodeAt returned', newNodeId)
					// 如果是通过store添加的，需要设置节点类型
					if (newNodeId && payload.commitSetNodeType) {
						payload.commitSetNodeType({ nodeId: newNodeId, type: 'image' })
					}
				}
				return newNodeId
			},
			connectNodes: (targetNodeId) => {
				log(
					'connectNodes: connecting',
					videoNodeId,
					VIDEO_OUTPUT_ANCHOR_ID,
					'->',
					targetNodeId,
					IMAGE_INPUT_ANCHOR_ID
				)
				const connected = payload.connectPorts(
					videoNodeId,
					VIDEO_OUTPUT_ANCHOR_ID,
					targetNodeId,
					IMAGE_INPUT_ANCHOR_ID,
					{ silent: true }
				)
				log('connectNodes: result', connected)
				return connected
			},
			forceSyncToStore: async () => {
				log('forceSyncToStore: syncing engine state to store...')
				const ok = await payload.forceSyncToStore()
				log('forceSyncToStore: result', ok)
				return ok
			},
			validate: (targetNodeId) => {
				// 验证节点在store中存在
				const nodeInStore = payload.getNode(targetNodeId)
				log('validate: node in store?', !!nodeInStore, 'nodeId:', targetNodeId)
				if (!nodeInStore) {
					warn('validate: target node not found in store after sync')
					return false
				}
				// 验证连线存在
				const edges = payload.getOutgoingEdges(videoNodeId, VIDEO_OUTPUT_ANCHOR_ID)
				const edgeExists = edges.some((e) => e.toNodeId === targetNodeId)
				log('validate: edge exists in store?', edgeExists, 'edgesCount:', edges.length)
				if (!edgeExists) {
					warn('validate: connection edge not found in store after sync')
					// 打印所有边用于调试
					warn('validate: all outgoing edges for video node:', edges)
					return false
				}
				// 验证节点类型正确
				if (nodeInStore.type !== 'image') {
					warn('validate: target node type is not "image", actual type:', nodeInStore.type)
					return false
				}
				log('validate: all checks passed')
				return true
			}
		})

		if (!result.targetNodeId) {
			error(
				'createImageNodeWithTransaction: transaction failed, no target node created',
				result.error
			)
			return null
		}

		if (result.warning) {
			warn('createImageNodeWithTransaction: transaction completed with warning:', result.warning)
		}

		log('createImageNodeWithTransaction: success, targetNodeId:', result.targetNodeId)
		return result.targetNodeId
	}

	const onVideoScreenshot = async (
		videoNodeId: string,
		input: { dataUrl: string; width: number; height: number; time: number }
	) => {
		const startTime = performance.now()
		log('========== Starting video screenshot ==========', {
			videoNodeId,
			time: input.time,
			width: input.width,
			height: input.height,
			dataUrlPrefix: input.dataUrl.substring(0, 50) + '...'
		})

		try {
			let targetNodeId: string | null = null

			// Step 1: 每次截图都创建新的图片节点（支持多截图，不覆盖已有节点）
			const existingCount = countExistingScreenshotNodes(videoNodeId)
			log(
				'Step 1: Creating new screenshot image node (existing screenshots from this video:',
				existingCount,
				')'
			)
			targetNodeId = await createImageNodeWithTransaction(videoNodeId, input.time)

			if (!targetNodeId) {
				error('Failed to determine target node for screenshot')
				return
			}

			// 再次确认节点在store中存在
			const targetNode = payload.getNode(targetNodeId)
			if (!targetNode) {
				error('Target node not found in store after transaction/wait', targetNodeId)
				return
			}
			log('Target node confirmed in store:', { id: targetNodeId, type: targetNode.type })

			// Step 2: 准备文件
			log('Step 2: Preparing screenshot file...')
			const name = `screenshot_${Math.max(0, input.time).toFixed(3)}.png`
			const blob = payload.dataUrlToBlob(input.dataUrl)
			const clonedFile = new File([blob], name, { type: 'image/png' })
			log('Step 2: File created', { name, size: clonedFile.size, type: clonedFile.type })

			// Step 3: 设置图片参数（在资源上传前设置，这样绑定后尺寸正确）
			log('Step 3: Setting image settings...')
			payload.commitSetNodeImageSettings({
				nodeId: targetNodeId,
				imageSettings: {
					outputWidth: input.width,
					outputHeight: input.height,
					naturalWidth: input.width,
					naturalHeight: input.height,
					cropEnabled: false,
					crop: { x: 0, y: 0, width: 1, height: 1 }
				}
			})
			log('Step 3: Image settings committed')

			// Step 4: 上传资源（使用onAfterBind回调在绑定完成后调整尺寸）
			log('Step 4: Uploading resource and binding to node...')
			const finalTargetNodeId = targetNodeId as string
			await new Promise<void>((resolve) => {
				const onAfterBind = (bindPayload: { resourceId: string; url: string }) => {
					log('Step 4: Resource bound to node, resourceId:', bindPayload.resourceId)

					// 关键修复1：直接同步资源数据到scene._legacyResources（不依赖Vue异步props更新）
					if (payload.engineApiSetLegacyResource) {
						log('Step 4: Syncing resource data directly to scene legacyResources...')
						payload.engineApiSetLegacyResource(bindPayload.resourceId, {
							id: bindPayload.resourceId,
							url: bindPayload.url,
							kind: 'image',
							name: name,
							createdAt: Date.now()
						})
						log('Step 4: engineApiSetLegacyResource completed')
					} else {
						warn(
							'Step 4: engineApiSetLegacyResource not provided, Canvas may not find resource immediately!'
						)
					}

					// 关键修复2：同步resourceId到引擎节点（使用silent:true避免触发emitChange导致状态覆盖）
					if (payload.engineApiUpdateNodeData) {
						log('Step 4: Syncing resourceId to engine node data (silent:true)...')
						const syncOk = payload.engineApiUpdateNodeData(
							finalTargetNodeId,
							{
								resourceId: bindPayload.resourceId
							},
							{ silent: true }
						)
						log('Step 4: engineApiUpdateNodeData result:', syncOk)
					} else {
						warn('Step 4: engineApiUpdateNodeData not provided, resource may not render in Canvas!')
					}

					log('Step 4: Now auto-sizing media node...')
					// 尝试从节点获取资源URL，如果失败则用绑定返回的URL或dataUrl作为fallback
					let resourceUrl: string | null = bindPayload.url
					if (payload.getNodeResourceUrl) {
						const nodeUrl = payload.getNodeResourceUrl(finalTargetNodeId)
						if (nodeUrl) {
							resourceUrl = nodeUrl
						}
						log(
							'Step 4: Resource URL to use:',
							resourceUrl ? resourceUrl.substring(0, 60) + '...' : 'null'
						)
					}
					// Fallback到dataUrl（虽然不理想，但至少能显示）
					const urlToUse = resourceUrl || input.dataUrl
					log(
						'Step 4: Auto-sizing media node with URL type:',
						resourceUrl ? 'resource (dweb)' : 'dataUrl (fallback)'
					)
					try {
						payload.autoSizeMediaNode(finalTargetNodeId, urlToUse, 'image')
						log('Step 4: autoSizeMediaNode completed')
					} catch (err) {
						warn('Step 4: autoSizeMediaNode threw error:', err)
					}
					resolve()
				}

				try {
					const result = payload.onNodeUploadResource(finalTargetNodeId, clonedFile, 'image', {
						autoDistribute: false,
						onAfterBind
					})
					// 如果返回Promise（async函数），等待它
					if (result instanceof Promise) {
						result.catch((err) => {
							error('Step 4: onNodeUploadResource promise rejected:', err)
							resolve()
						})
					} else {
						// 如果是同步函数但没有onAfterBind被调用（不太可能），设置超时
						setTimeout(() => {
							warn('Step 4: onAfterBind not called synchronously, resolving after timeout')
							payload.autoSizeMediaNode(finalTargetNodeId, input.dataUrl, 'image')
							resolve()
						}, 1000)
					}
				} catch (err) {
					error('Step 4: onNodeUploadResource threw error:', err)
					// Fallback: 即使上传失败也尝试用dataUrl显示
					try {
						payload.autoSizeMediaNode(finalTargetNodeId, input.dataUrl, 'image')
					} catch {}
					resolve()
				}
			})

			const elapsed = performance.now() - startTime
			log(`========== Screenshot completed successfully in ${elapsed.toFixed(2)}ms ==========`, {
				targetNodeId
			})
		} catch (err) {
			const elapsed = performance.now() - startTime
			error(`========== Screenshot failed after ${elapsed.toFixed(2)}ms ==========`, err)
		}
	}

	return {
		onVideoScreenshot
	}
}
