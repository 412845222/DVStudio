import { NodeBase, toNumber, type NodeBaseDTO, type NodeType } from './NodeBase'

export type LineStyle = 'solid' | 'dashed'

export type LineNodeProps = {
	startX: number
	startY: number
	endX: number
	endY: number
	anchorX: number
	anchorY: number
	lineColor: string
	lineWidth: number
	lineStyle: LineStyle
}

export type LineNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'line'
	props: LineNodeProps
}

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
		return {
			id: dto.id,
			name: dto.name,
			type: 'line',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 260), height: Math.max(1, dto.transform.height ?? 180) },
			props: {
				...d,
				...(base as any),
				startX: toNumber((base as any).startX, d.startX),
				startY: toNumber((base as any).startY, d.startY),
				endX: toNumber((base as any).endX, d.endX),
				endY: toNumber((base as any).endY, d.endY),
				anchorX: toNumber((base as any).anchorX, d.anchorX),
				anchorY: toNumber((base as any).anchorY, d.anchorY),
				lineColor: String((base as any).lineColor ?? d.lineColor),
				lineWidth: Math.max(1, toNumber((base as any).lineWidth, d.lineWidth)),
				lineStyle: ((base as any).lineStyle === 'dashed' ? 'dashed' : 'solid') as any,
			},
		}
	}
}
