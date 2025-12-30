import { NodeBase } from './NodeBase'
import { toNumber } from './numbers'
import type { LineNodeDTO, LineNodeProps, LineStyle, NodeBaseDTO, NodeType } from './types'

export class LineNode extends NodeBase {
	static readonly type: NodeType = 'line'

	static defaultProps(transform?: { width?: number; height?: number }): LineNodeProps {
		const w = Math.max(1, Math.floor(Number(transform?.width ?? 200)))
		const h = Math.max(1, Math.floor(Number(transform?.height ?? 120)))
		// 坐标约定：以节点中心为 (0,0)，范围大致在 [-w/2,w/2] / [-h/2,h/2]
		return {
			startX: -w / 2 + 12,
			startY: 0,
			endX: w / 2 - 12,
			endY: 0,
			anchorX: 0,
			anchorY: -h / 4,
			lineColor: '#ffffff',
			lineWidth: 4,
			lineStyle: 'solid',
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): LineNodeDTO {
		const base = dto.props ?? {}
		const d = LineNode.defaultProps(dto.transform)
		const startX = toNumber(base.startX, d.startX)
		const startY = toNumber(base.startY, d.startY)
		const endX = toNumber(base.endX, d.endX)
		const endY = toNumber(base.endY, d.endY)
		const anchorX = toNumber(base.anchorX, d.anchorX)
		const anchorY = toNumber(base.anchorY, d.anchorY)
		const lineColor = typeof base.lineColor === 'string' ? base.lineColor : d.lineColor
		const lineWidth = Math.max(1, toNumber(base.lineWidth, d.lineWidth))
		const lineStyle: LineStyle = base.lineStyle === 'dashed' ? 'dashed' : 'solid'
		return {
			id: dto.id,
			name: dto.name,
			type: 'line',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 260), height: Math.max(1, dto.transform.height ?? 180) },
			props: {
				...d,
				startX,
				startY,
				endX,
				endY,
				anchorX,
				anchorY,
				lineColor,
				lineWidth,
				lineStyle,
			},
		}
	}
}

