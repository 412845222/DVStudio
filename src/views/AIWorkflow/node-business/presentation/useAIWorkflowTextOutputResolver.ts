import { sanitizeWorkflowMediaUrl } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'
import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'

export type InputParamPreviewRef = {
	edgeId?: string
	fromNodeId?: string
	fromAnchorId?: string
	toAnchorId?: string
	kind: 'text' | 'image' | 'video' | 'model3d'
	name?: string
	label?: string
	text?: string
	previewUrl?: string
	meta?: string
}

export type InputTextConnectedRef = InputParamPreviewRef & {
	kind: 'text'
	text: string
}

export const useAIWorkflowTextOutputResolver = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, unknown>
		}
	}
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => unknown
	getIncomingEdges: (nodeId: string, anchorId?: string) => unknown[]
	serializeSceneLayoutSelectedPlaceholder: (nodeId: string) => string
	serializeSceneLayoutOutput: (nodeId: string) => string
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeImagePreviewUrl: (node: WorkflowNode, maxSize: number) => string | null
}) => {
	const previewText = (value: string, maxLength = 80) => {
		const text = String(value ?? '').trim()
		if (!text) return ''
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
	}

	const resolveNodeName = (node: WorkflowNode) =>
		String(node?.alias ?? node?.title ?? '').trim() || undefined

	const resolveVideoPosterUrl = (node: WorkflowNode) => {
		const rid = String(node?.resourceId ?? '').trim()
		if (!rid) return ''
		const resource = payload.store.state.resourcesById[rid] as Record<string, unknown>
		const poster = typeof resource?.posterUrl === 'string' ? String(resource.posterUrl).trim() : ''
		return sanitizeWorkflowMediaUrl(poster) || ''
	}

	const resolveModel3DLabel = (node: WorkflowNode) => {
		const settings = node.model3dSettings
		return String(
			settings?.modelSourceName ??
				settings?.lastInputSourceName ??
				settings?.modelProjectRelativePath ??
				settings?.modelSourcePath ??
				settings?.modelUrl ??
				''
		).trim()
	}

	const connectedTextInputValue = (nodeId: string, inputId: string) => {
		const edge = payload.getFirstIncomingEdge(nodeId, String(inputId ?? '')) as Record<string, unknown> | null
		if (!edge) return ''
		return getTextOutputForNode(String(edge.fromNodeId), undefined, String(edge.fromAnchorId ?? ''))
	}

	const sceneDecomposeTextOutputForAnchor = (node: WorkflowNode, anchorId: string) => {
		if (node.type !== 'scene-decompose') return ''
		const settings = node.sceneDecomposeSettings
		const rawOutputs = settings?.outputs
		const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
		const item = outputs.find(
			(entry) => String(entry?.textAnchorId ?? '') === String(anchorId ?? '')
		)
		if (item) return String(item.description ?? '').trim()
		return String(outputs[0]?.description ?? '').trim()
	}

	function getTextOutputForNode(
		nodeId: string,
		visited?: Set<string>,
		fromAnchorId?: string
	): string {
		const v = visited ?? new Set<string>()
		const visitKey = fromAnchorId ? `${nodeId}:${fromAnchorId}` : nodeId
		if (v.has(visitKey)) return ''
		v.add(visitKey)

		const node = payload.store.state.nodesById[nodeId]
		if (!node) return ''
		if (node.type === 'text') {
			const n = node as Record<string, unknown>
			const inputs = Array.isArray(n.inputs) ? n.inputs : []
			const inputAnchor = inputs.find(
				(anchor: unknown) => {
					const a = anchor as Record<string, unknown>
					return String(a?.mediaType ?? '') === 'text' || String(a?.id ?? '') === 'in-text'
				}
			) as Record<string, unknown> | undefined
			if (inputAnchor?.id) {
				const linkedText = connectedTextInputValue(nodeId, String(inputAnchor.id))
				if (String(linkedText ?? '').trim()) return String(linkedText)
			}
			return String(node.textValue ?? '')
		}
		if (node.type === 'rotate-image') return String(node.rotatePromptText ?? '')
		if (node.type === 'text-merge') return computeMergedText(nodeId, v)
		if (node.type === 'scene-understanding')
			return String(node.sceneUnderstandingSettings?.outputJson ?? '')
		if (node.type === 'scene-decompose')
			return sceneDecomposeTextOutputForAnchor(node, String(fromAnchorId ?? ''))
		if (node.type === 'scene-layout') {
			if (String(fromAnchorId ?? '') === 'out-selected-placeholder') {
				return payload.serializeSceneLayoutSelectedPlaceholder(nodeId)
			}
			return payload.serializeSceneLayoutOutput(nodeId)
		}
		return ''
	}

	function computeMergedText(nodeId: string, visited?: Set<string>): string {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'text-merge') return ''
		const items = node.textMergeItems ?? []
		const parts: string[] = []
		for (const item of items) {
			const itemId = String(item?.id ?? '').trim()
			if (!itemId) continue
			const anchorId = `in-${itemId}`
			const edge = payload.getFirstIncomingEdge(nodeId, anchorId) as Record<string, unknown> | null
			if (!edge) continue
			parts.push(getTextOutputForNode(String(edge.fromNodeId), visited, String(edge.fromAnchorId ?? '')))
		}
		return parts.join('\n')
	}

	const getInputParamPreviewRefs = (nodeId: string): InputParamPreviewRef[] => {
		const refs: InputParamPreviewRef[] = []
		const seen = new Set<string>()
		const incomingEdges = payload.getIncomingEdges(nodeId)
		for (const edge of incomingEdges) {
			const e = edge as Record<string, unknown>
			const fromNodeId = String(e?.fromNodeId ?? '').trim()
			const toAnchorId = String(e?.toAnchorId ?? '').trim()
			const fromAnchorId = String(e?.fromAnchorId ?? '').trim()
			const edgeId = String(e?.id ?? '').trim()
			if (!fromNodeId) continue
			const fromNode = payload.store.state.nodesById[fromNodeId]
			if (!fromNode) continue

			const base = {
				edgeId: edgeId || undefined,
				fromNodeId: fromNodeId || undefined,
				fromAnchorId: fromAnchorId || undefined,
				toAnchorId: toAnchorId || undefined,
				name: resolveNodeName(fromNode)
			}

			if (
				fromNode.type === 'text' ||
				fromNode.type === 'text-merge' ||
				fromNode.type === 'rotate-image' ||
				fromNode.type === 'scene-understanding' ||
				fromNode.type === 'scene-decompose' ||
				fromNode.type === 'scene-layout'
			) {
				const text = getTextOutputForNode(fromNodeId, undefined, fromAnchorId)
				if (!text.trim()) continue
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:text:${text.slice(0, 64)}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'text',
					text,
					label: previewText(text)
				})
				continue
			}

			if (fromNode.type === 'image') {
				const previewUrl =
					sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(fromNode, 160)) ||
					sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(fromNode)) ||
					''
				if (!previewUrl) continue
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:image:${previewUrl}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'image',
					previewUrl,
					label: base.name || '图片输入',
					meta: '图片'
				})
				continue
			}

			if (fromNode.type === 'video') {
				const previewUrl = resolveVideoPosterUrl(fromNode)
				const resourceUrl = sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(fromNode)) || ''
				if (!previewUrl && !resourceUrl) continue
				const dedupeKey =
					edgeId || `${fromNodeId}:${fromAnchorId}:video:${previewUrl || resourceUrl}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'video',
					previewUrl: previewUrl || undefined,
					label: base.name || '视频输入',
					meta: '视频'
				})
				continue
			}

			if (fromNode.type === 'model3d') {
				const modelLabel = resolveModel3DLabel(fromNode)
				if (!modelLabel) continue
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:model3d:${modelLabel}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'model3d',
					label: base.name || '3D 模型输入',
					meta: previewText(modelLabel, 60)
				})
			}
		}
		return refs
	}

	const getInputTextConnectedRefs = (nodeId: string): InputTextConnectedRef[] => {
		return getInputParamPreviewRefs(nodeId).filter(
			(item): item is InputTextConnectedRef => item.kind === 'text' && !!item.text
		)
	}

	return {
		connectedTextInputValue,
		sceneDecomposeTextOutputForAnchor,
		getTextOutputForNode,
		computeMergedText,
		getInputParamPreviewRefs,
		getInputTextConnectedRefs
	}
}
