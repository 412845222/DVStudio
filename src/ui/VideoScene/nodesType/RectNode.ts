import { NodeBase, type NodeBaseDTO, type NodeType } from './NodeBase'

export type RectNodeProps = {
	fillColor: string
	fillOpacity: number
	borderColor: string
	borderOpacity: number
	borderWidth: number
	cornerRadius: number
}

export type RectNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'rect'
	props: RectNodeProps
}

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
		return {
			id: dto.id,
			name: dto.name,
			type: 'rect',
			transform: { ...dto.transform },
			props: { ...RectNode.defaultProps(), ...(dto.props as any) },
		}
	}
}
