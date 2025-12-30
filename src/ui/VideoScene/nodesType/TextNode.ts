import { NodeBase, type NodeBaseDTO, type NodeType } from './NodeBase'

export type TextNodeProps = {
	textContent: string
	fontSize: number
	fontColor: string
	fontStyle: string
}

export type TextNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'text'
	props: TextNodeProps
}

export class TextNode extends NodeBase {
	static readonly type: NodeType = 'text'

	static defaultProps(): TextNodeProps {
		return {
			textContent: 'Text',
			fontSize: 24,
			fontColor: '#ffffff',
			fontStyle: 'normal',
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): TextNodeDTO {
		return {
			id: dto.id,
			name: dto.name,
			type: 'text',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 240), height: Math.max(1, dto.transform.height ?? 60) },
			props: { ...TextNode.defaultProps(), ...(dto.props as any) },
		}
	}
}
