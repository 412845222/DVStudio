import type { WorkflowModelFormat } from '../../../../aiworkflow/types'

export type ComfySupportedMediaType = 'image' | 'video' | 'model3d'

export type ComfyAutoWireResult = {
	createdNodeIds: string[]
	connectedEdgeIds: string[]
	skippedOutputs: Array<{ anchorId: string; reason: ComfyAutoWireSkipReason }>
}

export type ComfyAutoWireSkipReason =
	| 'already-connected'
	| 'unknown-media-type'
	| 'disabled'
	| 'invalid-node'
	| 'model-format-unknown'

export const COMFY_NODE_FOOTPRINT: Record<
	ComfySupportedMediaType,
	{ width: number; height: number }
> = {
	image: { width: 360, height: 280 },
	video: { width: 400, height: 320 },
	model3d: { width: 420, height: 360 }
}

export const COMFY_AUTO_WIRE_HORIZONTAL_GAP = 180
export const COMFY_AUTO_WIRE_VERTICAL_GAP = 80

export const COMFY_TARGET_INPUT_ANCHOR: Record<ComfySupportedMediaType, string> = {
	image: 'in-0',
	video: 'in-video',
	model3d: 'in-model'
}

export const COMFY_TARGET_NODE_TYPE: Record<
	ComfySupportedMediaType,
	'image' | 'video' | 'model3d'
> = {
	image: 'image',
	video: 'video',
	model3d: 'model3d'
}

export const inferComfyModelFormat = (url: string, filename?: string): WorkflowModelFormat => {
	const ref = `${filename ?? ''} ${url}`.toLowerCase()
	if (ref.endsWith('.glb')) return 'glb'
	if (ref.endsWith('.gltf')) return 'gltf'
	if (ref.endsWith('.fbx')) return 'fbx'
	if (ref.endsWith('.obj')) return 'obj'
	if (ref.endsWith('.stl')) return 'stl'
	if (ref.endsWith('.dae')) return 'dae'
	return 'glb'
}
