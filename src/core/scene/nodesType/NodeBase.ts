import { clamp01, clampPx, toNumber } from './numbers'
import type { NodeBaseDTO, NodeType } from './types'

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
		const legacyScale = clampScale((dto.transform as any)?.scale, 1)
		return {
			...dto,
			type: dto.type ?? 'base',
			transform: {
				x: toNumber(dto.transform?.x, 0),
				y: toNumber(dto.transform?.y, 0),
				scaleX: clampScale((dto.transform as any)?.scaleX, legacyScale),
				scaleY: clampScale((dto.transform as any)?.scaleY, legacyScale),
				scale: legacyScale,
				pivotX: clamp01(dto.transform?.pivotX, 0.5),
				pivotY: clamp01(dto.transform?.pivotY, 0.5),
				width: clampPx(dto.transform?.width, 200),
				height: clampPx(dto.transform?.height, 120),
				rotation: toNumber(dto.transform?.rotation, 0),
				opacity: clamp01(dto.transform?.opacity, 1),
			},
			props: dto.props ?? {},
		}
	}
}

