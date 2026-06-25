import { NodeBase } from './NodeBase'
import { toNumber } from './numbers'
import type { LineNodeDTO, LineNodeProps, LineStyle, NodeBaseDTO, NodeType } from './types'
import { normalizeLineLocalPoints } from '../geometry'

export class LineNode extends NodeBase {
	static readonly type: NodeType = 'line'

	static defaultProps(transform?: { width?: number; height?: number }): LineNodeProps {
		const w = Math.max(1, Math.floor(Number(transform?.width ?? 200)))
		const h = Math.max(1, Math.floor(Number(transform?.height ?? 120)))
		const local = normalizeLineLocalPoints({ width: w, height: h })
		// 坐标约定：以节点中心为 (0,0)，范围大致在 [-w/2,w/2] / [-h/2,h/2]
		return {
			startX: local.startX,
			startY: local.startY,
			endX: local.endX,
			endY: local.endY,
			anchorX: local.anchorX,
			anchorY: local.anchorY,
			lineColor: '#ffffff',
			lineWidth: 4,
			lineStyle: 'solid',
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): LineNodeDTO {
		const base = dto.props ?? {}
		const d = LineNode.defaultProps(dto.transform)
		const width = Math.max(1, dto.transform.width ?? 260)
		const height = Math.max(1, dto.transform.height ?? 180)
		const lineProps: Partial<Record<'startX' | 'startY' | 'endX' | 'endY' | 'anchorX' | 'anchorY', unknown>> = base
		const local = normalizeLineLocalPoints({ props: lineProps, width, height })
		const lineColor = typeof base.lineColor === 'string' ? base.lineColor : d.lineColor
		const lineWidth = Math.max(1, toNumber(base.lineWidth, d.lineWidth))
		const lineStyle: LineStyle = base.lineStyle === 'dashed' ? 'dashed' : 'solid'
		return {
			id: dto.id,
			name: dto.name,
			type: 'line',
			transform: { ...dto.transform, width, height },
			props: {
				...d,
				startX: local.startX,
				startY: local.startY,
				endX: local.endX,
				endY: local.endY,
				anchorX: local.anchorX,
				anchorY: local.anchorY,
				lineColor,
				lineWidth,
				lineStyle,
			},
		}
	}
}

