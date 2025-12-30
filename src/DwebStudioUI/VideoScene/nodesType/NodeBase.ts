export type NodeType = 'base' | 'rect' | 'text' | 'image' | 'line'

export type NodeTransform = {
	x: number
	y: number
	width: number
	height: number
	rotation: number
	opacity: number
}

export type NodeBaseDTO = {
	id: string
	name: string
	type: NodeType
	transform: NodeTransform
	props?: Record<string, any>
}

export const clamp01 = (v: unknown, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, Math.min(1, n))
}

export const clampPx = (v: unknown, fallback: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return fallback
	return Math.max(1, n)
}

export const toNumber = (v: unknown, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	return n
}

export class NodeBase {
	static readonly type: NodeType = 'base'

	static create(id: string, name = 'Node'): NodeBaseDTO {
		return {
			id,
			name,
			type: 'base',
			transform: { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 },
			props: {},
		}
	}

	static normalize(dto: NodeBaseDTO): NodeBaseDTO {
		return {
			...dto,
			type: dto.type ?? 'base',
			transform: {
				x: toNumber(dto.transform?.x, 0),
				y: toNumber(dto.transform?.y, 0),
				width: clampPx(dto.transform?.width, 200),
				height: clampPx(dto.transform?.height, 120),
				rotation: toNumber(dto.transform?.rotation, 0),
				opacity: clamp01(dto.transform?.opacity, 1),
			},
			props: dto.props ?? {},
		}
	}
}
