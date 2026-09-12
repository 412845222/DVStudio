/**
 * 导演多场景工作台 —— 场景（房间）分组图片输入收集
 *
 * 每个 in-scene-N 锚点代表一个房间，锚点为 multiInput，可接入该房间的多张多视角参考图。
 * 支持图片节点 / 视频节点 / ComfyUI 图片输出 / 场景分解输出等直接图片源。
 */
import type {
	WorkflowDirectorSceneInput,
	WorkflowDirectorSceneSummary,
	WorkflowEdge,
	WorkflowNode
} from '../../../../../aiworkflow/types'
import { directorSceneAnchorIds, isDirectorSceneAnchorId } from './directorWorkbenchShared'

const parseSceneIndex = (anchorId: string): number => {
	const m = String(anchorId || '').match(/(\d+)/)
	return m ? Math.max(1, parseInt(m[1], 10)) : 99
}

export const useAIWorkflowDirectorWorkbenchInputs = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
	}
	getIncomingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	/** 根据上游节点与输出锚点解析图片 URL（复用 meshy 输入解析器的 connectedImageOutputUrl） */
	resolveEdgeImageUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
}) => {
	/**
	 * 收集导演模式下按场景分组的图片输入
	 */
	const connectedDirectorSceneInputs = (nodeId: string): WorkflowDirectorSceneInput[] => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-understanding') return []
		const anchors = (Array.isArray(node.inputs) ? node.inputs : [])
			.filter((a) => isDirectorSceneAnchorId(String(a?.id ?? '')))
			.sort((a, b) => parseSceneIndex(String(a.id)) - parseSceneIndex(String(b.id)))

		const groups: WorkflowDirectorSceneInput[] = []
		for (const anchor of anchors) {
			const anchorId = String(anchor.id)
			const sceneIndex = parseSceneIndex(anchorId)
			const edges = payload.getIncomingEdges(nodeId, anchorId)
			const images: Array<{ url: string; width?: number; height?: number }> = []
			const seen = new Set<string>()
			for (const edge of edges) {
				const fromNodeId = String(edge?.fromNodeId ?? '').trim()
				const fromAnchorId = String(edge?.fromAnchorId ?? '').trim()
				if (!fromNodeId || !fromAnchorId) continue
				const fromNode = payload.store.state.nodesById[fromNodeId]
				if (!fromNode) continue
				const url = String(payload.resolveEdgeImageUrl(fromNode, fromAnchorId) ?? '').trim()
				if (!url || seen.has(url)) continue
				seen.add(url)
				images.push({ url })
			}
			groups.push({ sceneIndex, anchorId, label: anchor.label, images })
		}
		return groups
	}

	/**
	 * 节点面板展示用的场景连接摘要（仅含图片数的场景）
	 */
	const connectedDirectorSceneSummaries = (nodeId: string): WorkflowDirectorSceneSummary[] =>
		connectedDirectorSceneInputs(nodeId)
			.filter((g) => g.images.length > 0)
			.map((g) => ({
				sceneIndex: g.sceneIndex,
				anchorId: g.anchorId,
				label: g.label,
				imageCount: g.images.length
			}))

	/**
	 * 已连接图片总数
	 */
	const connectedDirectorImageCount = (nodeId: string): number =>
		connectedDirectorSceneSummaries(nodeId).reduce((sum, s) => sum + s.imageCount, 0)

	return {
		directorSceneAnchorIds,
		connectedDirectorSceneInputs,
		connectedDirectorSceneSummaries,
		connectedDirectorImageCount
	}
}
