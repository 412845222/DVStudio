import { NodeBase } from './NodeBase'
import type { NodeBaseDTO, NodeType, RectNodeDTO, RectNodeProps } from './types'

export class RectNode extends NodeBase {
	static readonly type: NodeType = 'rect'

	static defaultProps(): RectNodeProps {
		return {
			fillColor: '#3aa1ff',
			fillOpacity: 1,
			borderColor: '#9cdcfe',
			borderOpacity: 1,
			borderWidth: 2,
			cornerRadius: 0,
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): RectNodeDTO {
		const base = dto.props ?? {}
		const fillColor = typeof base.fillColor === 'string' ? base.fillColor : '#3aa1ff'
		const borderColor = typeof base.borderColor === 'string' ? base.borderColor : '#9cdcfe'
		const fillOpacity = Number(base.fillOpacity)
		const borderOpacity = Number(base.borderOpacity)
		const borderWidth = Number(base.borderWidth)
		const cornerRadius = Number(base.cornerRadius)
		return {
			id: dto.id,
			name: dto.name,
			type: 'rect',
			transform: { ...dto.transform },
			props: {
				fillColor,
				fillOpacity: Number.isFinite(fillOpacity) ? Math.max(0, Math.min(1, fillOpacity)) : 1,
				borderColor,
				borderOpacity: Number.isFinite(borderOpacity) ? Math.max(0, Math.min(1, borderOpacity)) : 1,
				borderWidth: Number.isFinite(borderWidth) ? Math.max(0, borderWidth) : 2,
				cornerRadius: Number.isFinite(cornerRadius) ? Math.max(0, cornerRadius) : 0,
			},
		}
	}
}

