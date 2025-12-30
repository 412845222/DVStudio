import { NodeBase } from './NodeBase'
import type { ImageNodeDTO, ImageNodeProps, NodeBaseDTO, NodeType } from './types'

export class ImageNode extends NodeBase {
	static readonly type: NodeType = 'image'

	static defaultProps(): ImageNodeProps {
		return {
			imageId: '',
			imagePath: '',
			imageFit: 'contain',
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): ImageNodeDTO {
		const base = dto.props ?? {}
		const imageId = typeof base.imageId === 'string' ? base.imageId : ''
		const imagePath = typeof base.imagePath === 'string' ? base.imagePath : ''
		const imageFit =
			base.imageFit === 'contain' ||
			base.imageFit === 'cover' ||
			base.imageFit === 'fill' ||
			base.imageFit === 'none' ||
			base.imageFit === 'scale-down'
				? base.imageFit
				: 'contain'
		return {
			id: dto.id,
			name: dto.name,
			type: 'image',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 240), height: Math.max(1, dto.transform.height ?? 180) },
			props: { imageId, imagePath, imageFit },
		}
	}
}

