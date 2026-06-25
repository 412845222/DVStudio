import type { VideoSceneLayer, VideoSceneNodeProps, VideoSceneTreeNode } from '../scene'
import type { JsonValue } from '../shared/json'

type NodeSnapshot = {
	transform?: Record<string, unknown>
	props?: Record<string, JsonValue>
}

const isSubtitleTextProps = (props: unknown): props is VideoSceneNodeProps & { __dvsSubtitleTextNode: true } => {
	return typeof props === 'object' && props !== null && '__dvsSubtitleTextNode' in props && (props as Record<string, unknown>).__dvsSubtitleTextNode === true
}

const stripTextContentInTree = (nodes: VideoSceneTreeNode[] | undefined) => {
	const list = Array.isArray(nodes) ? nodes : []
	for (const n of list) {
		if (!n || typeof n !== 'object') continue
		const props = n.props
		if (isSubtitleTextProps(props)) {
			if (Object.prototype.hasOwnProperty.call(props, 'textContent')) {
				const next = { ...props }
				delete next.textContent
				n.props = next
			}
		}
		if (Array.isArray(n.children) && n.children.length) stripTextContentInTree(n.children)
	}
}

export const stripSubtitleTextContentFromStageLayers = (layers: VideoSceneLayer[], layerId: string): VideoSceneLayer[] => {
	const lid = String(layerId || '').trim()
	if (!lid) return layers
	const layer = Array.isArray(layers) ? layers.find((l) => String(l?.id ?? '') === lid) : null
	if (!layer) return layers
	stripTextContentInTree(layer.nodeTree)
	return layers
}

export const stripSubtitleTextContentFromNodeSnapshots = (
	nodesById: Record<string, NodeSnapshot>,
): Record<string, NodeSnapshot> => {
	const map = nodesById ?? {}
	for (const snap of Object.values(map)) {
		const props = snap?.props
		if (isSubtitleTextProps(props)) {
			if (Object.prototype.hasOwnProperty.call(props, 'textContent')) {
				const next = { ...props }
				delete next.textContent
				snap.props = next
			}
		}
	}
	return map
}
