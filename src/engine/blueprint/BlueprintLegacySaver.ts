import type {
	BlueprintData,
	BlueprintNodeData,
	LegacyBlueprintData,
	LegacyResourceData,
	LegacySelectionTag,
	ConnectionData
} from './types'

export class BlueprintLegacySaver {
	static save(data: BlueprintData): LegacyBlueprintData {
		const now = Date.now()

		const nodesById: Record<string, any> = {}
		const nodeOrder: string[] = []
		for (const node of data.nodes) {
			const legacyNode = this.convertNode(node)
			nodesById[node.id] = legacyNode
			nodeOrder.push(node.id)
		}

		const edgesById: Record<string, ConnectionData> = {}
		const edgeOrder: string[] = []
		for (const edge of data.edges) {
			edgesById[edge.id] = {
				...edge,
				createdAt: edge.createdAt || now
			}
			edgeOrder.push(edge.id)
		}

		const resourcesById: Record<string, LegacyResourceData> = {}
		const resourceOrder: string[] = []
		if (data.legacyResources) {
			for (const resId of Object.keys(data.legacyResources)) {
				resourcesById[resId] = { ...data.legacyResources[resId] }
				resourceOrder.push(resId)
			}
		}

		const selectionTagsByKey: Record<string, LegacySelectionTag> = {}
		if (data.savedSelectionFrames) {
			for (const frame of data.savedSelectionFrames) {
				selectionTagsByKey[frame.id] = {
					key: frame.id,
					label: frame.label,
					nodeIds: [...frame.nodeIds],
					color: null,
					note: null,
					createdAt: frame.createdAt || now,
					updatedAt: now
				}
			}
		}

		let selectedNodeId: string | null = null
		const selectedNodeIds: string[] = []
		for (const node of data.nodes) {
			if (node.selected) {
				if (!selectedNodeId) selectedNodeId = node.id
				selectedNodeIds.push(node.id)
			}
		}

		return {
			schemaVersion: 1,
			savedAt: now,
			viewport: data.viewport,
			nodesById,
			nodeOrder,
			edgesById,
			edgeOrder,
			resourcesById,
			resourceOrder,
			selectedNodeId,
			selectedNodeIds: selectedNodeIds.length > 0 ? selectedNodeIds : (null as any),
			selectionTagsByKey,
			savedSelectionFrames: data.savedSelectionFrames?.map((f) => ({ ...f })),
			nodeCheckboxVisible: false
		}
	}

	private static convertNode(node: BlueprintNodeData): any {
		const legacyNode: any = { ...node }

		legacyNode.x = node.worldX
		legacyNode.y = node.worldY

		if (node.previewContent?.kind === 'text' && node.previewContent.text) {
			legacyNode.textValue = node.textValue ?? node.previewContent.text
		}

		if (!legacyNode.createdAt) {
			legacyNode.createdAt = Date.now()
		}

		if (typeof node.nodeChatDraft === 'string') {
			legacyNode.nodeChatDraft = node.nodeChatDraft
		}
		if (node.nodeChatParams && typeof node.nodeChatParams === 'object') {
			legacyNode.nodeChatParams = { ...node.nodeChatParams }
		}
		if (Array.isArray(node.nodeChatSelectedRefs)) {
			legacyNode.nodeChatSelectedRefs = node.nodeChatSelectedRefs.map((r) => ({ ...r }))
		}
		if (typeof node.nodeChatVisible === 'boolean') {
			legacyNode.nodeChatVisible = node.nodeChatVisible
		}

		return legacyNode
	}
}
