import { clamp01, clampPx, toNumber } from './numbers'
import type { NodeBaseDTO, NodeType } from './types'

type LegacyTransform = {
	x?: unknown
	y?: unknown
	scaleX?: unknown
	scaleY?: unknown
	scale?: unknown
	pivotX?: unknown
	pivotY?: unknown
	width?: unknown
	height?: unknown
	rotation?: unknown
	opacity?: unknown
}

export class NodeBase {
	static readonly type: NodeType = 'base'

	static create(id: string, name = 'Node'): NodeBaseDTO {
		return {
			id,
			name,
			type: 'base',
			transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, pivotX: 0.5, pivotY: 0.5, width: 200, height: 120, rotation: 0, opacity: 1 },
			props: {},
		}
	}

	static normalize(dto: NodeBaseDTO): NodeBaseDTO {
		const clampScale = (v: unknown, fallback = 1) => {
			const n = Number(v)
			if (!Number.isFinite(n)) return fallback
			return Math.max(0, Math.min(100, n))
		}
		const tr = dto.transform as LegacyTransform
		const legacyScale = clampScale(tr.scale, 1)
		return {
			...dto,
			type: dto.type ?? 'base',
			transform: {
				x: toNumber(tr.x, 0),
				y: toNumber(tr.y, 0),
				scaleX: clampScale(tr.scaleX, legacyScale),
				scaleY: clampScale(tr.scaleY, legacyScale),
				scale: legacyScale,
				pivotX: clamp01(tr.pivotX, 0.5),
				pivotY: clamp01(tr.pivotY, 0.5),
				width: clampPx(tr.width, 200),
				height: clampPx(tr.height, 120),
				rotation: toNumber(tr.rotation, 0),
				opacity: clamp01(tr.opacity, 1),
			},
			props: dto.props ?? {},
		}
	}
}
