import { nextTick } from 'vue'
import type { WorkflowEdge, WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import { isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { ComfyLocalizedOutput } from './comfyOutputResolver'
import { inferMediaKind } from './comfyOutputResolver'
import {
	COMFY_AUTO_WIRE_HORIZONTAL_GAP,
	COMFY_AUTO_WIRE_VERTICAL_GAP,
	COMFY_NODE_FOOTPRINT,
	COMFY_TARGET_INPUT_ANCHOR,
	COMFY_TARGET_NODE_TYPE,
	inferComfyModelFormat,
	type ComfyAutoWireResult,
	type ComfyAutoWireSkipReason,
	type ComfySupportedMediaType
} from './comfyAutoWireTypes'

const COMFY_AUTO_WIRE_NODE_DELAY_MS = 180

const waitForNodeInStore = (
	store: { state: { nodesById: Record<string, unknown> } },
	nodeId: string,
	timeoutMs = 2000
): Promise<boolean> => {
	if (store.state.nodesById[nodeId]) return Promise.resolve(true)
	const start = Date.now()
	return new Promise((resolve) => {
		const check = () => {
			if (store.state.nodesById[nodeId]) {
				resolve(true)
				return
			}
			if (Date.now() - start >= timeoutMs) {
				console.warn('[ComfyUI AutoWire] waitForNodeInStore timed out', { nodeId, timeoutMs })
				resolve(false)
				return
			}
			requestAnimationFrame(check)
		}
		check()
	})
}

type UseAIWorkflowComfyAutoWireOptions = {
	store: {
		state: WorkflowState
		commit: (mutation: string, payload?: unknown) => void
	}
	engineApi?: {
		addNode?: (type: string, x: number, y: number, data?: Record<string, any>) => string | null
		connectPorts?: (fId: string, fA: string, tId: string, tA: string) => boolean
		updateNodeData?: (nodeId: string, patch: Record<string, any>) => boolean
	}
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	getIncomingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	bindMediaResourceToNode: (
		nodeId: string,
		kind: 'image' | 'video' | 'model3d',
		url: string,
		name: string,
		meta?: { sourcePath?: string }
	) => void
	bindModelResourceToNode: (
		nodeId: string,
		url: string,
		name: string,
		meta?: { sourcePath?: string; format?: ReturnType<typeof inferComfyModelFormat> }
	) => void
	onAutoWireStart?: (sourceNodeId: string) => void
	onAutoWireNodeCreated?: (nodeId: string) => void
	onAutoWireEnd?: () => void
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}

const isComfyAutoWireEnabled = (node: WorkflowNode | null | undefined): boolean => {
	if (!node) return false
	if (node.type !== 'comfyui') return false
	const settings = isRecord(node.comfyuiSettings) ? node.comfyuiSettings : {}
	const enabled = settings.autoWireEnabled
	if (typeof enabled === 'boolean') return enabled
	return true
}

const calculateNodePosition = (
	sourceNode: WorkflowNode,
	outputIndex: number,
	mediaType: ComfySupportedMediaType,
	existingNodeCount: number = 0
) => {
	const footprint = COMFY_NODE_FOOTPRINT[mediaType]
	const startOffset = existingNodeCount * (footprint.height + COMFY_AUTO_WIRE_VERTICAL_GAP)
	return {
		worldX:
			sourceNode.worldX + sourceNode.width + COMFY_AUTO_WIRE_HORIZONTAL_GAP + footprint.width / 2,
		worldY:
			sourceNode.worldY +
			startOffset +
			outputIndex * (footprint.height + COMFY_AUTO_WIRE_VERTICAL_GAP)
	}
}

const hasExistingConnection = (
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[],
	nodeId: string,
	anchorId: string
): boolean => {
	const edges = getOutgoingEdges(nodeId, anchorId)
	return edges.some((edge) => {
		const fromAnchor = String(edge?.fromAnchorId ?? '').trim()
		return fromAnchor === anchorId
	})
}

const getExistingConnectionMediaTypes = (
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[],
	nodesById: Record<string, unknown>,
	nodeId: string,
	anchorId: string
): Set<ComfySupportedMediaType> => {
	const edges = getOutgoingEdges(nodeId, anchorId)
	const types = new Set<ComfySupportedMediaType>()
	for (const edge of edges) {
		if (String(edge?.fromAnchorId ?? '').trim() !== anchorId) continue
		const toNodeId = String(edge?.toNodeId ?? '').trim()
		if (!toNodeId) continue
		const toNode = nodesById[toNodeId] as { type?: string } | undefined
		if (!toNode) continue
		if (toNode.type === 'image') types.add('image')
		else if (toNode.type === 'video') types.add('video')
		else if (toNode.type === 'model3d') types.add('model3d')
	}
	return types
}

export const useAIWorkflowComfyAutoWire = (options: UseAIWorkflowComfyAutoWireOptions) => {
	const createMediaNode = (
		position: { worldX: number; worldY: number },
		mediaType: ComfySupportedMediaType,
		sourceLabel: string
	): string => {
		const titleMap: Record<ComfySupportedMediaType, string> = {
			image: t('nodes.comfyui.autoWireImageTitle'),
			video: t('nodes.comfyui.autoWireVideoTitle'),
			model3d: t('nodes.comfyui.autoWireModel3DTitle')
		}
		const nodeAlias = `${sourceLabel} - ${t('nodes.comfyui.autoWireOutputSuffix')}`
		const nodeType = COMFY_TARGET_NODE_TYPE[mediaType]

		let nodeId: string = ''
		if (options.engineApi?.addNode) {
			const initialData: Record<string, any> = { title: titleMap[mediaType], alias: nodeAlias }
			if (mediaType === 'model3d') {
				initialData.model3dSettings = { modelGenerationSource: 'comfyui' }
			}
			const createdId = options.engineApi.addNode(
				nodeType,
				position.worldX,
				position.worldY,
				initialData
			)
			if (createdId) {
				nodeId = String(createdId).trim()
			}
		}
		if (!nodeId) {
			options.store.commit('addNodeAt', {
				worldX: position.worldX,
				worldY: position.worldY,
				title: titleMap[mediaType]
			})
			nodeId = String(options.store.state.selectedNodeId ?? '').trim()
		}
		if (!nodeId) throw new Error('Failed to create auto-wire node')

		if (!options.engineApi?.addNode) {
			options.store.commit('setNodeType', { nodeId, type: nodeType })
			options.store.commit('setNodeAlias', { nodeId, alias: nodeAlias })
			if (mediaType === 'model3d') {
				const createdNode = options.store.state.nodesById?.[nodeId]
				const currentSettings = isRecord(createdNode?.model3dSettings)
					? createdNode.model3dSettings
					: {}
				options.store.commit('patchNodeSettings', {
					nodeId,
					settings: { ...currentSettings, modelGenerationSource: 'comfyui' }
				})
			}
		}

		options.onAutoWireNodeCreated?.(nodeId)

		return nodeId
	}

	const addEdgeIfMissing = (payload: {
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
	}): boolean => {
		const existingEdges = options.getOutgoingEdges(payload.fromNodeId, payload.fromAnchorId)
		const exists = existingEdges.some(
			(edge) =>
				String(edge?.toNodeId ?? '').trim() === payload.toNodeId &&
				String(edge?.toAnchorId ?? '').trim() === payload.toAnchorId
		)
		if (exists) return false
		if (options.engineApi?.connectPorts) {
			return options.engineApi.connectPorts(
				payload.fromNodeId,
				payload.fromAnchorId,
				payload.toNodeId,
				payload.toAnchorId
			)
		}
		options.store.commit('addEdge', payload)
		return true
	}

	const autoWireComfyOutputs = async (
		comfyNodeId: string,
		outputs: ComfyLocalizedOutput[]
	): Promise<ComfyAutoWireResult> => {
		const result: ComfyAutoWireResult = {
			createdNodeIds: [],
			connectedEdgeIds: [],
			skippedOutputs: []
		}

		const sourceNode = options.store.state.nodesById?.[comfyNodeId]
		if (!sourceNode || sourceNode.type !== 'comfyui') {
			result.skippedOutputs = outputs.map((o) => ({
				anchorId: String(o.anchorId ?? ''),
				reason: 'invalid-node' as ComfyAutoWireSkipReason
			}))
			return result
		}

		if (!isComfyAutoWireEnabled(sourceNode)) {
			result.skippedOutputs = outputs.map((o) => ({
				anchorId: String(o.anchorId ?? ''),
				reason: 'disabled' as ComfyAutoWireSkipReason
			}))
			return result
		}

		const validOutputs = outputs.filter((o) => {
			const url = String(o.url ?? '').trim()
			const kind = inferMediaKind(o)
			return url && kind
		})

		if (validOutputs.length === 0) {
			result.skippedOutputs = outputs.map((o) => ({
				anchorId: String(o.anchorId ?? ''),
				reason: 'unknown-media-type' as ComfyAutoWireSkipReason
			}))
			return result
		}

		const anchorIds = new Set(
			validOutputs.map((o) => String(o.anchorId ?? '').trim()).filter(Boolean)
		)
		const isSingleOutAnchor = anchorIds.size === 1 && anchorIds.has('out')

		type PendingTarget = {
			anchorId: string
			mediaType: ComfySupportedMediaType
			primaryOutput: ComfyLocalizedOutput
			sourceLabel: string
		}
		const pendingTargets: PendingTarget[] = []

		if (isSingleOutAnchor) {
			const existingMediaTypes = getExistingConnectionMediaTypes(
				options.getOutgoingEdges,
				options.store.state.nodesById as Record<string, unknown>,
				comfyNodeId,
				'out'
			)

			const seenMediaTypes = new Set<ComfySupportedMediaType>()

			for (let i = 0; i < validOutputs.length; i++) {
				const output = validOutputs[i]
				const mediaType = inferMediaKind(output)
				if (!mediaType) {
					result.skippedOutputs.push({ anchorId: 'out', reason: 'unknown-media-type' })
					continue
				}
				if (existingMediaTypes.has(mediaType)) {
					result.skippedOutputs.push({ anchorId: 'out', reason: 'already-connected' })
					continue
				}
				if (seenMediaTypes.has(mediaType)) continue
				seenMediaTypes.add(mediaType)
				const sourceLabel =
					String(output.filename ?? '').trim() ||
					`${t('nodes.comfyui.autoWireOutputPrefix')} ${i + 1}`
				pendingTargets.push({ anchorId: 'out', mediaType, primaryOutput: output, sourceLabel })
			}
		} else {
			const outputsByAnchor = new Map<string, ComfyLocalizedOutput[]>()
			for (const output of validOutputs) {
				const anchorId = String(output.anchorId ?? '').trim()
				if (!anchorId) continue
				if (!outputsByAnchor.has(anchorId)) {
					outputsByAnchor.set(anchorId, [])
				}
				outputsByAnchor.get(anchorId)!.push(output)
			}

			for (const [anchorId, anchorOutputs] of outputsByAnchor) {
				if (hasExistingConnection(options.getOutgoingEdges, comfyNodeId, anchorId)) {
					result.skippedOutputs.push({ anchorId, reason: 'already-connected' })
					continue
				}

				const primaryOutput = anchorOutputs.find((m) => String(m.url ?? '').trim())
				if (!primaryOutput) {
					result.skippedOutputs.push({ anchorId, reason: 'unknown-media-type' })
					continue
				}

				const mediaType = inferMediaKind(primaryOutput)
				if (!mediaType) {
					result.skippedOutputs.push({ anchorId, reason: 'unknown-media-type' })
					continue
				}

				const sourceLabel =
					String(primaryOutput.filename ?? '').trim() ||
					`${t('nodes.comfyui.autoWireOutputPrefix')} ${pendingTargets.length + 1}`

				pendingTargets.push({ anchorId, mediaType, primaryOutput, sourceLabel })
			}
		}

		if (pendingTargets.length === 0) {
			return result
		}

		options.onAutoWireStart?.(comfyNodeId)

		try {
			const existingOutgoingCount = options.getOutgoingEdges(comfyNodeId).length

			for (let i = 0; i < pendingTargets.length; i += 1) {
				const { anchorId, mediaType, primaryOutput, sourceLabel } = pendingTargets[i]
				const position = calculateNodePosition(sourceNode, i, mediaType, existingOutgoingCount)

				try {
					const targetNodeId = createMediaNode(position, mediaType, sourceLabel)
					const targetAnchorId = COMFY_TARGET_INPUT_ANCHOR[mediaType]

					addEdgeIfMissing({
						fromNodeId: comfyNodeId,
						fromAnchorId: anchorId,
						toNodeId: targetNodeId,
						toAnchorId: targetAnchorId
					})

					// 等待节点从引擎同步到 Store（engineApi.addNode 触发 onBlueprintEditorChange → hydrateDraft 是异步的）
					await waitForNodeInStore(options.store, targetNodeId, 2000)

					const url = String(primaryOutput.url ?? '').trim()
					const name = String(primaryOutput.filename ?? '').trim() || `comfyui_${Date.now()}`
					const sourcePath = String(primaryOutput.sourcePath ?? '').trim() || undefined

					if (mediaType === 'image' || mediaType === 'video') {
						options.bindMediaResourceToNode(targetNodeId, mediaType, url, name, { sourcePath })
					} else if (mediaType === 'model3d') {
						const format = inferComfyModelFormat(url, name)
						options.bindModelResourceToNode(targetNodeId, url, name, { sourcePath, format })
					}

					result.createdNodeIds.push(targetNodeId)

					await nextTick()
					if (i < pendingTargets.length - 1) {
						await new Promise((resolve) =>
							window.setTimeout(resolve, COMFY_AUTO_WIRE_NODE_DELAY_MS)
						)
					}
				} catch (err) {
					console.error('[ComfyUI AutoWire] Failed to create node for anchor', anchorId, err)
					result.skippedOutputs.push({ anchorId, reason: 'unknown-media-type' })
				}
			}

			if (result.createdNodeIds.length > 0) {
				options.store.commit('patchNodeSettings', {
					nodeId: comfyNodeId,
					settings: {
						autoWireMeta: {
							lastRunCreatedNodeIds: result.createdNodeIds,
							lastRunAt: Date.now()
						}
					}
				})
			}
		} finally {
			options.onAutoWireEnd?.()
		}

		return result
	}

	return {
		autoWireComfyOutputs,
		isComfyAutoWireEnabled
	}
}
