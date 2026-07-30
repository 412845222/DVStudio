import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'
import type { ComfyLocalizedOutput } from '../comfy/comfyOutputResolver'

/**
 * 将输入锚点ID映射到对应序号的图像输入锚点ID
 * 用于穿透scene-layout/scene-understanding节点时保持图像序号一致
 */
const mapInputAnchorToCorrespondingImageInput = (anchorId: string): string => {
	const id = String(anchorId ?? '').trim()
	// in-json 或文本类输入默认使用第一张参考图
	if (id === 'in-json' || id === 'in-text' || id === 'in-0' || id.startsWith('out-')) {
		return 'in-image'
	}
	// 已经是图像锚点则直接返回
	if (id === 'in-image') return 'in-image'
	// in-image-2 -> in-image-2, in-image-3 -> in-image-3, etc.
	const match = id.match(/^in-image-(\d+)$/)
	if (match) {
		const idx = Math.max(2, Math.min(4, parseInt(match[1], 10)))
		return `in-image-${idx}`
	}
	// 默认返回第一张
	return 'in-image'
}

/**
 * 判断节点类型是否为"场景JSON处理节点"（这些节点接收JSON输入并可能有图像输入）
 */
const isSceneJsonNode = (nodeType: string): boolean => {
	return (
		nodeType === 'scene-layout' ||
		nodeType === 'scene-understanding' ||
		nodeType === 'scene-decompose'
	)
}

/**
 * 获取场景节点的JSON输入锚点ID
 */
const getSceneNodeJsonInputAnchor = (nodeType: string): string | null => {
	if (nodeType === 'scene-layout' || nodeType === 'scene-decompose') return 'in-json'
	if (nodeType === 'scene-understanding') return 'in-layout-json' // 仅灯光模式有，默认模式无JSON输入
	return null
}

export const useAIWorkflowMediaPreviewSources = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<
				string,
				{
					kind?: string
					url?: string
				}
			>
		}
	}
	getFirstIncomingEdge: (
		nodeId: string,
		anchorId?: string
	) => { fromNodeId: string; fromAnchorId?: string } | null | undefined
	nodeResourceUrl: (node: WorkflowNode) => string | null
	connectedImageOutputUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	comfyOutputForAnchor: (
		outputs: ComfyLocalizedOutput[],
		anchorId: string,
		expectedKind: 'image' | 'video'
	) => { url?: string } | null | undefined
}) => {
	const resolveImageUrlFromNode = (fromNode: WorkflowNode, fromAnchorId: string): string | null => {
		if (fromNode.type === 'image' || fromNode.type === 'video') {
			return payload.nodeResourceUrl(fromNode)
		}
		if (fromNode.type === 'comfyui') {
			return payload.connectedImageOutputUrl(fromNode, fromAnchorId)
		}
		if (fromNode.type === 'scene-decompose') {
			return payload.connectedImageOutputUrl(fromNode, fromAnchorId)
		}
		return null
	}

	/**
	 * 判断节点是否为可直接提供图像的源节点
	 */
	const isDirectImageSourceNode = (node: WorkflowNode): boolean => {
		return (
			node.type === 'image' ||
			node.type === 'video' ||
			node.type === 'comfyui' ||
			node.type === 'scene-decompose'
		)
	}

	/**
	 * 追溯图像源，支持递归穿透scene-layout/scene-understanding等场景节点
	 * 追溯链路：沿JSON输出链路反向追溯，在每个场景节点查找对应的图像输入锚点
	 * @param nodeId 起始节点ID
	 * @param startAnchorId 起始锚点ID（可以是图像锚点或JSON锚点）
	 * @param fallbackToJsonAnchor 如果起始锚点没有入边，是否回退检查in-json锚点
	 * @param depth 递归深度，防止无限循环
	 */
	const traceImageSource = (
		nodeId: string,
		startAnchorId: string,
		fallbackToJsonAnchor: boolean = false,
		depth: number = 0
	): { node: WorkflowNode; anchorId: string } | null => {
		if (depth > 10) return null // 防止无限递归

		let edge = payload.getFirstIncomingEdge(nodeId, String(startAnchorId ?? ''))

		// 如果起始锚点没有入边，且允许回退，则检查in-json是否连接
		if (!edge && fallbackToJsonAnchor) {
			const node = payload.store.state.nodesById[nodeId]
			const jsonAnchor = node ? getSceneNodeJsonInputAnchor(node.type) : null
			if (jsonAnchor && startAnchorId !== jsonAnchor) {
				edge = payload.getFirstIncomingEdge(nodeId, jsonAnchor)
			}
		}

		if (!edge) return null
		let fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) return null
		let fromAnchorId = String(edge.fromAnchorId ?? '')

		// 访问集合防止循环
		const visited = new Set<string>()

		// 穿透场景节点：沿JSON链路追溯，在每个场景节点查找对应的图像输入
		while (
			fromNode &&
			isSceneJsonNode(fromNode.type) &&
			!visited.has(`${fromNode.id}:${fromAnchorId}`)
		) {
			visited.add(`${fromNode.id}:${fromAnchorId}`)

			// 计算该场景节点中对应的图像锚点ID
			const targetImageAnchor = mapInputAnchorToCorrespondingImageInput(
				fromAnchorId || startAnchorId
			)

			// 先尝试查找该场景节点的图像输入锚点是否有直接连接
			const imageEdge = payload.getFirstIncomingEdge(fromNode.id, targetImageAnchor)
			if (imageEdge) {
				const imageFromNode = payload.store.state.nodesById[imageEdge.fromNodeId]
				if (imageFromNode) {
					// 递归追溯图像输入的上游
					const imageSource = traceImageSource(fromNode.id, targetImageAnchor, false, depth + 1)
					if (imageSource && isDirectImageSourceNode(imageSource.node)) {
						return imageSource
					}
					// 如果递归结果不是直接图像源（可能又是场景节点），继续循环处理
					if (imageSource) {
						fromNode = imageSource.node
						fromAnchorId = imageSource.anchorId
						continue
					}
				}
			}

			// 当前场景节点的图像锚点没有直接连接，尝试沿其JSON输入继续向上追溯
			const jsonAnchor = getSceneNodeJsonInputAnchor(fromNode.type)
			if (!jsonAnchor) break // 没有JSON输入锚点（如scene-understanding默认模式），停止追溯

			const jsonEdge = payload.getFirstIncomingEdge(fromNode.id, jsonAnchor)
			if (!jsonEdge) break // JSON输入也没有连接，停止追溯

			fromAnchorId = String(jsonEdge.fromAnchorId ?? '')
			const nextFromNode = payload.store.state.nodesById[jsonEdge.fromNodeId]
			if (!nextFromNode) break
			fromNode = nextFromNode
		}

		// 检查最终节点是否是直接图像源
		if (fromNode && isDirectImageSourceNode(fromNode)) {
			return { node: fromNode, anchorId: fromAnchorId }
		}

		return null
	}

	const storyPreview = (node: WorkflowNode) => {
		const resourceInput = node.inputs?.find(
			(a) => a.id === 'in-resource' || a.id === 'in-image' || a.id === 'in-video'
		)
		const inputId = resourceInput?.id || node.inputs?.[0]?.id
		if (!inputId) {
			return {
				kind: null as null,
				url: null as string | null,
				cropEnabled: false,
				crop: null as null | { x: number; y: number; width: number; height: number }
			}
		}

		// 使用统一的图像源追溯逻辑，支持穿透场景节点
		const isSceneNode = isSceneJsonNode(node.type)
		const traced = traceImageSource(node.id, inputId, isSceneNode)
		if (!traced || !(traced.node.type === 'image' || traced.node.type === 'video')) {
			return {
				kind: null as null,
				url: null as string | null,
				cropEnabled: false,
				crop: null as null | { x: number; y: number; width: number; height: number }
			}
		}

		const fromNode = traced.node
		const cropEnabled = !!fromNode.imageSettings?.cropEnabled
		const crop = fromNode.type === 'image' ? (fromNode.imageSettings?.crop ?? null) : null
		return {
			kind: fromNode.type as 'image' | 'video',
			url: payload.nodeResourceUrl(fromNode),
			cropEnabled,
			crop
		}
	}

	const rotateImagePreviewUrl = (node: WorkflowNode) => {
		const inputId = node.inputs?.[0]?.id
		if (!inputId) return null as string | null

		// 使用统一的图像源追溯逻辑
		const traced = traceImageSource(node.id, inputId, false)
		if (!traced) return null

		const fromNode = traced.node
		const fromAnchorId = traced.anchorId

		const rid = String(fromNode.resourceId ?? '').trim()
		if (rid) {
			const r = payload.store.state.resourcesById[rid]
			if (r && String(r.kind ?? '').trim() === 'image') {
				const url = String(r.url ?? '').trim()
				if (url) return url
			}
		}

		if (fromNode.type === 'comfyui') {
			const outputs = Array.isArray(fromNode.comfyuiSettings?.outputs)
				? fromNode.comfyuiSettings!.outputs!
				: []
			const media = payload.comfyOutputForAnchor(outputs, fromAnchorId, 'image')
			const url = String(media?.url ?? '').trim()
			if (url) return url
		}

		const resolvedUrl = resolveImageUrlFromNode(fromNode, fromAnchorId)
		if (resolvedUrl) return resolvedUrl

		return null as string | null
	}

	const connectedImageInputUrl = (nodeId: string, inputId: string): string | null => {
		// 对于场景类节点（scene-decompose/scene-understanding），如果图像锚点没有直接连接，
		// 允许回退检查in-json是否连接到scene-layout节点进行穿透追溯
		const node = payload.store.state.nodesById[nodeId]
		const isSceneNode = node?.type === 'scene-decompose' || node?.type === 'scene-understanding'
		const traced = traceImageSource(nodeId, inputId, isSceneNode)
		if (!traced) return null
		return resolveImageUrlFromNode(traced.node, traced.anchorId)
	}

	const connectedImageInputSource = (nodeId: string, inputId: string) => {
		const node = payload.store.state.nodesById[nodeId]
		const isSceneNode = node?.type === 'scene-decompose' || node?.type === 'scene-understanding'
		const traced = traceImageSource(nodeId, inputId, isSceneNode)
		if (!traced) return null as null | { url: string; width?: number; height?: number }

		const fromNode = traced.node
		const fromAnchorId = traced.anchorId

		if (fromNode.type === 'image') {
			const url = String(payload.nodeResourceUrl(fromNode) ?? '').trim()
			if (!url) return null
			return {
				url,
				width: Number.isFinite(Number(fromNode.imageSettings?.naturalWidth))
					? Number(fromNode.imageSettings?.naturalWidth)
					: undefined,
				height: Number.isFinite(Number(fromNode.imageSettings?.naturalHeight))
					? Number(fromNode.imageSettings?.naturalHeight)
					: undefined
			}
		}

		if (fromNode.type === 'video') {
			const url = String(payload.nodeResourceUrl(fromNode) ?? '').trim()
			if (!url) return null
			return {
				url,
				width: Number.isFinite(Number(fromNode.videoSettings?.naturalWidth))
					? Number(fromNode.videoSettings?.naturalWidth)
					: undefined,
				height: Number.isFinite(Number(fromNode.videoSettings?.naturalHeight))
					? Number(fromNode.videoSettings?.naturalHeight)
					: undefined
			}
		}

		if (fromNode.type === 'comfyui') {
			const url = String(payload.connectedImageOutputUrl(fromNode, fromAnchorId) ?? '').trim()
			if (!url) return null
			return { url }
		}

		if (fromNode.type === 'scene-decompose') {
			const settings = fromNode.sceneDecomposeSettings
			const rawOutputs = settings?.outputs
			const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
			const item = outputs.find((entry) => String(entry?.imageAnchorId ?? '') === fromAnchorId)
			const url = String(payload.connectedImageOutputUrl(fromNode, fromAnchorId) ?? '').trim()
			if (!url) return null
			return {
				url,
				width: Number.isFinite(Number(item?.outputWidth)) ? Number(item?.outputWidth) : undefined,
				height: Number.isFinite(Number(item?.outputHeight)) ? Number(item?.outputHeight) : undefined
			}
		}

		return null as null | { url: string; width?: number; height?: number }
	}

	return {
		storyPreview,
		rotateImagePreviewUrl,
		connectedImageInputUrl,
		connectedImageInputSource
	}
}
