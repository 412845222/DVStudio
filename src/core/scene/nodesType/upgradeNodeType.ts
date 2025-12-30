import { NodeBase } from './NodeBase'
import { ImageNode } from './ImageNode'
import { LineNode } from './LineNode'
import { RectNode } from './RectNode'
import { TextNode } from './TextNode'
import type { NodeBaseDTO, NodeType } from './types'

export const upgradeNodeType = (dto: NodeBaseDTO, type: NodeType): NodeBaseDTO => {
	const normalized = NodeBase.normalize(dto)
	if (type === 'rect') return RectNode.upgradeFrom(normalized)
	if (type === 'text') return TextNode.upgradeFrom(normalized)
	if (type === 'image') return ImageNode.upgradeFrom(normalized)
	if (type === 'line') return LineNode.upgradeFrom(normalized)
	return { ...normalized, type: 'base', props: normalized.props ?? {} }
}
