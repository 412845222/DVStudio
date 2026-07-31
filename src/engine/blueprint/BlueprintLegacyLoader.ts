import type {
	BlueprintData,
	BlueprintNodeData,
	LegacyBlueprintData,
	LegacyResourceData,
	SavedSelectionFrameData,
	ConnectionData
} from './types'
import { DEFAULT_NODE_SIZES, CURRENT_SCHEMA_VERSION, clampZoom, clampPan } from './types'

export class BlueprintLegacyLoader {
	static isLegacyFormat(data: any): data is LegacyBlueprintData {
		return (
			data &&
			typeof data === 'object' &&
			(data.schemaVersion === 1 || (data.nodesById && typeof data.nodesById === 'object'))
		)
	}

	static load(legacyData: LegacyBlueprintData): BlueprintData {
		const nodes: BlueprintNodeData[] = []
		const edges: ConnectionData[] = []
		const savedSelectionFrames: SavedSelectionFrameData[] = []
		const legacyResources: Record<string, LegacyResourceData> = {}

		const nodeOrder = legacyData.nodeOrder || Object.keys(legacyData.nodesById || {})
		for (const nodeId of nodeOrder) {
			const legacyNode = legacyData.nodesById[nodeId]
			if (!legacyNode) continue
			const node = this.convertNode(legacyNode)
			nodes.push(node)
		}

		const edgeOrder = legacyData.edgeOrder || Object.keys(legacyData.edgesById || {})
		for (const edgeId of edgeOrder) {
			const legacyEdge = legacyData.edgesById[edgeId]
			if (!legacyEdge) continue
			const migratedEdge = this.migrateEdge(legacyEdge, legacyData.nodesById)
			edges.push(migratedEdge)
		}

		if (legacyData.savedSelectionFrames) {
			for (const frame of legacyData.savedSelectionFrames) {
				savedSelectionFrames.push({ ...frame })
			}
		}

		if (legacyData.selectionTagsByKey) {
			const existingNodeIdSets = new Set(
				savedSelectionFrames.map((f) => [...f.nodeIds].sort().join('|'))
			)
			for (const key of Object.keys(legacyData.selectionTagsByKey)) {
				const tag = legacyData.selectionTagsByKey[key]
				const nodeKey = [...tag.nodeIds].sort().join('|')
				if (!existingNodeIdSets.has(nodeKey)) {
					savedSelectionFrames.push({
						id: tag.key,
						nodeIds: [...tag.nodeIds],
						label: tag.label,
						createdAt: tag.createdAt
					})
				}
			}
		}

		if (legacyData.resourcesById) {
			const resourceOrder = legacyData.resourceOrder || Object.keys(legacyData.resourcesById)
			for (const resId of resourceOrder) {
				const res = legacyData.resourcesById[resId]
				if (res) {
					legacyResources[resId] = { ...res }
				}
			}
		}

		return {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			viewport: legacyData.viewport
				? {
						zoom: clampZoom(legacyData.viewport.zoom ?? 1),
						panX: clampPan(legacyData.viewport.panX ?? 0),
						panY: clampPan(legacyData.viewport.panY ?? 0)
					}
				: { zoom: 1, panX: 0, panY: 0 },
			nodes,
			edges,
			savedSelectionFrames,
			legacyResources
		}
	}

	private static migrateEdge(
		legacyEdge: ConnectionData,
		nodesById: Record<string, any>
	): ConnectionData {
		const edge = { ...legacyEdge }
		const toNodeId = String(edge.toNodeId ?? '')
		const toNode = nodesById[toNodeId]
		// 如果目标节点是image节点，且连接到in-resource锚点，重定向到in-0
		if (
			toNode &&
			String(toNode.type ?? '') === 'image' &&
			String(edge.toAnchorId ?? '') === 'in-resource'
		) {
			edge.toAnchorId = 'in-0'
		}
		return edge
	}

	private static convertNode(legacyNode: any): BlueprintNodeData {
		const type = legacyNode.type || 'generic'
		const defaultSize = DEFAULT_NODE_SIZES[type] ||
			DEFAULT_NODE_SIZES.base || { width: 240, height: 160 }

		// 处理image节点：移除in-resource锚点（如果存在）
		let inputs = legacyNode.inputs || []
		if (type === 'image' && Array.isArray(inputs)) {
			inputs = inputs.filter((p: any) => String(p?.id ?? '') !== 'in-resource')
			// 如果过滤后没有in-0锚点（极端情况），确保有in-0
			const hasIn0 = inputs.some((p: any) => String(p?.id ?? '') === 'in-0')
			if (!hasIn0) {
				inputs = [
					{
						id: 'in-0',
						label: '多模态输入',
						mediaType: 'generic',
						acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
						multiInput: true
					},
					...inputs
				]
			}
		}

		const node: BlueprintNodeData = {
			id: legacyNode.id,
			type,
			title: legacyNode.title || type,
			subtitle: legacyNode.subtitle,
			alias: legacyNode.alias,
			worldX: legacyNode.x ?? legacyNode.worldX ?? 0,
			worldY: legacyNode.y ?? legacyNode.worldY ?? 0,
			width: legacyNode.width ?? defaultSize.width,
			height: legacyNode.height ?? defaultSize.height,
			sizeCustomized:
				legacyNode.sizeCustomized !== undefined
					? legacyNode.sizeCustomized
					: !!(legacyNode.width && legacyNode.height),
			inputs,
			outputs: legacyNode.outputs || [],
			color: legacyNode.color,
			icon: legacyNode.icon,
			selected: false,
			status: legacyNode.status || 'idle',
			resourceId: legacyNode.resourceId,
			textValue: legacyNode.textValue,
			imageSettings: legacyNode.imageSettings,
			videoSettings: legacyNode.videoSettings,
			model3dSettings: legacyNode.model3dSettings,
			meshySettings: legacyNode.meshySettings,
			tripo3dSettings: legacyNode.tripo3dSettings,
			blenderSettings: legacyNode.blenderSettings,
			storySettings: legacyNode.storySettings,
			sceneUnderstandingSettings: legacyNode.sceneUnderstandingSettings,
			sceneLayoutSettings: legacyNode.sceneLayoutSettings,
			sceneDecomposeSettings: legacyNode.sceneDecomposeSettings,
			unrealExportSettings: legacyNode.unrealExportSettings,
			comfyuiSettings: legacyNode.comfyuiSettings,
			nodeChatDraft: legacyNode.nodeChatDraft,
			nodeChatParams: legacyNode.nodeChatParams,
			nodeChatSelectedRefs: legacyNode.nodeChatSelectedRefs,
			resourcePath: legacyNode.resourcePath,
			rotatePromptText: legacyNode.rotatePromptText,
			textMergeItems: legacyNode.textMergeItems,
			branches: legacyNode.branches,
			prompt: legacyNode.prompt,
			createdAt: legacyNode.createdAt
		}

		if (legacyNode.previewContent) {
			node.previewContent = { ...legacyNode.previewContent }
		} else if (type === 'text' && legacyNode.textValue) {
			node.previewContent = {
				kind: 'text',
				text: legacyNode.textValue
			}
		} else if ((type === 'image' || type === 'rotate-image') && legacyNode.resourceId) {
			node.previewContent = {
				kind: 'image'
			}
		} else if (type === 'video') {
			node.previewContent = {
				kind: 'video'
			}
		} else if (type === 'model3d') {
			node.previewContent = {
				kind: 'model3d'
			}
		}

		for (const key of Object.keys(legacyNode)) {
			if (!(key in node)) {
				;(node as any)[key] = legacyNode[key]
			}
		}

		if (legacyNode.x !== undefined) node.worldX = legacyNode.x
		if (legacyNode.y !== undefined) node.worldY = legacyNode.y

		return node
	}
}
