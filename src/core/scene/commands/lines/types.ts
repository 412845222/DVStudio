export type LinePointKind = 'start' | 'end' | 'anchor'

export type ComputeLinePointPatchArgs = {
	kind: LinePointKind
	worldPoint: { x: number; y: number }
	worldCenter: { x: number; y: number }
	rotation: number
}
