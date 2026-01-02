import type { VideoSceneLayer, VideoSceneTreeNode } from '../scene'

type NodeSnapshot = { transform?: any; props?: Record<string, any> }

const stripTextContentInTree = (nodes: VideoSceneTreeNode[] | undefined) => {
	const list = Array.isArray(nodes) ? nodes : []
	for (const n of list) {
		if (!n || typeof n !== 'object') continue
		const props: any = (n as any).props
		if (props && typeof props === 'object' && props.__dvsSubtitleTextNode === true) {
			// Subtitle text content is driven by generated keyframes (per cue).
			// Stage snapshots must not override it, otherwise keyframe ops can sync all cues to the same text.
			if (Object.prototype.hasOwnProperty.call(props, 'textContent')) {
				const next = { ...props }
				delete next.textContent
				;(n as any).props = next
			}
		}
		const children = (n as any).children
		if (Array.isArray(children) && children.length) stripTextContentInTree(children)
	}
}

export const stripSubtitleTextContentFromStageLayers = (layers: VideoSceneLayer[], layerId: string): VideoSceneLayer[] => {
	const lid = String(layerId || '').trim()
	if (!lid) return layers
	const layer = Array.isArray(layers) ? layers.find((l: any) => String((l as any)?.id ?? '') === lid) : null
	if (!layer) return layers
	stripTextContentInTree((layer as any).nodeTree)
	return layers
}

export const stripSubtitleTextContentFromNodeSnapshots = (
	nodesById: Record<string, NodeSnapshot>,
): Record<string, NodeSnapshot> => {
	const map = nodesById ?? {}
	for (const snap of Object.values(map)) {
		const props: any = (snap as any)?.props
		if (props && typeof props === 'object' && props.__dvsSubtitleTextNode === true) {
			if (Object.prototype.hasOwnProperty.call(props, 'textContent')) {
				const next = { ...props }
				delete next.textContent
				;(snap as any).props = next
			}
		}
	}
	return map
}
