export * from './NodeBase'
export * from './RectNode'
export * from './TextNode'
export * from './ImageNode'

import { NodeBase, type NodeBaseDTO, type NodeType } from './NodeBase'
import { RectNode } from './RectNode'
import { TextNode } from './TextNode'
import { ImageNode } from './ImageNode'

export const upgradeNodeType = (dto: NodeBaseDTO, type: NodeType): NodeBaseDTO => {
	const normalized = NodeBase.normalize(dto)
	if (type === 'rect') return RectNode.upgradeFrom(normalized)
	if (type === 'text') return TextNode.upgradeFrom(normalized)
	if (type === 'image') return ImageNode.upgradeFrom(normalized)
	return { ...normalized, type: 'base', props: normalized.props ?? {} }
}
