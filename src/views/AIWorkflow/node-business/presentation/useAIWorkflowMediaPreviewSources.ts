import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'
import type { ComfyLocalizedOutput } from '../comfy/comfyOutputResolver'

export const useAIWorkflowMediaPreviewSources = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, {
				kind?: string
				url?: string
			}>
		}
	}
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => { fromNodeId: string; fromAnchorId?: string } | null | undefined
	nodeResourceUrl: (node: WorkflowNode) => string | null
	connectedImageOutputUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	comfyOutputForAnchor: (
		outputs: ComfyLocalizedOutput[],
		anchorId: string,
		expectedKind: 'image' | 'video'
	) => { url?: string } | null | undefined
}) => {
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
		const edge = payload.getFirstIncomingEdge(node.id, String(inputId ?? ''))
		if (!edge) {
			return {
				kind: null as null,
				url: null as string | null,
				cropEnabled: false,
				crop: null as null | { x: number; y: number; width: number; height: number }
			}
		}
		const fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) {
			return {
				kind: null as null,
				url: null as string | null,
				cropEnabled: false,
				crop: null as null | { x: number; y: number; width: number; height: number }
			}
		}
		if (fromNode.type === 'image' || fromNode.type === 'video') {
			const cropEnabled = !!fromNode.imageSettings?.cropEnabled
			const crop = fromNode.type === 'image' ? (fromNode.imageSettings?.crop ?? null) : null
			return { kind: fromNode.type as 'image' | 'video', url: payload.nodeResourceUrl(fromNode), cropEnabled, crop }
		}
		return {
			kind: null as null,
			url: null as string | null,
			cropEnabled: false,
			crop: null as null | { x: number; y: number; width: number; height: number }
		}
	}

	const rotateImagePreviewUrl = (node: WorkflowNode) => {
		const inputId = node.inputs?.[0]?.id
		if (!inputId) return null as string | null
		const edge = payload.getFirstIncomingEdge(node.id, String(inputId ?? ''))
		if (!edge) return null as string | null
		const fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) return null as string | null

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
			const media = payload.comfyOutputForAnchor(
				outputs,
				String(edge.fromAnchorId ?? ''),
				'image'
			)
			const url = String(media?.url ?? '').trim()
			if (url) return url
		}

		return null as string | null
	}

	const connectedImageInputUrl = (nodeId: string, inputId: string) => {
		const edge = payload.getFirstIncomingEdge(nodeId, String(inputId ?? ''))
		if (!edge) return null as string | null
		const fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) return null as string | null

		if (fromNode.type === 'image' || fromNode.type === 'video') {
			return payload.nodeResourceUrl(fromNode)
		}

		if (fromNode.type === 'comfyui') {
			return payload.connectedImageOutputUrl(fromNode, String(edge.fromAnchorId ?? ''))
		}

		return null as string | null
	}

	const connectedImageInputSource = (nodeId: string, inputId: string) => {
		const edge = payload.getFirstIncomingEdge(nodeId, String(inputId ?? ''))
		if (!edge) return null as null | { url: string; width?: number; height?: number }
		const fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) return null as null | { url: string; width?: number; height?: number }

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
			const url = String(
				payload.connectedImageOutputUrl(fromNode, String(edge.fromAnchorId ?? '')) ?? ''
			).trim()
			if (!url) return null
			return { url }
		}

		if (fromNode.type === 'scene-decompose') {
			const settings = fromNode.sceneDecomposeSettings
			const rawOutputs = settings?.outputs
			const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
			const item = outputs.find(
				(entry) => String(entry?.imageAnchorId ?? '') === String(edge.fromAnchorId ?? '')
			)
			const url = String(
				payload.connectedImageOutputUrl(fromNode, String(edge.fromAnchorId ?? '')) ?? ''
			).trim()
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
