import { clamp01, clampPx, toNumber } from './numbers'
import type { NodeBaseDTO, NodeType } from './types'

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

