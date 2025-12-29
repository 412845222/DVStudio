import { NodeBase, type NodeBaseDTO, type NodeType } from './NodeBase'

export type ImageNodeProps = {
	imagePath: string
	scale: number
}

export type ImageNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'image'
	props: ImageNodeProps
}

export class ImageNode extends NodeBase {
	static readonly type: NodeType = 'image'

	static defaultProps(): ImageNodeProps {
		return {
			imagePath: '',
			scale: 1,
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): ImageNodeDTO {
		return {
			id: dto.id,
			name: dto.name,
			type: 'image',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 240), height: Math.max(1, dto.transform.height ?? 180) },
			props: { ...ImageNode.defaultProps(), ...(dto.props as any) },
		}
	}
}
