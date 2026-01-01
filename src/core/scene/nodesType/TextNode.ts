import { NodeBase } from './NodeBase'
import type { NodeBaseDTO, NodeType, TextNodeDTO, TextNodeProps } from './types'

export class TextNode extends NodeBase {
	static readonly type: NodeType = 'text'

	static defaultProps(): TextNodeProps {
		return {
			textContent: 'Text',
			fontSize: 24,
			fontColor: '#ffffff',
			fontStyle: 'normal',
			textAlign: 'center',
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): TextNodeDTO {
		const base = dto.props ?? {}
		const textContent = typeof base.textContent === 'string' ? base.textContent : 'Text'
		const fontSize = Number(base.fontSize)
		const fontColor = typeof base.fontColor === 'string' ? base.fontColor : '#ffffff'
		const fontStyle = typeof base.fontStyle === 'string' ? base.fontStyle : 'normal'
		const textAlign = base.textAlign === 'left' || base.textAlign === 'right' || base.textAlign === 'center' ? base.textAlign : 'center'
		return {
			id: dto.id,
			name: dto.name,
			type: 'text',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 240), height: Math.max(1, dto.transform.height ?? 60) },
			props: {
				textContent,
				fontSize: Number.isFinite(fontSize) ? fontSize : 24,
				fontColor,
				fontStyle,
				textAlign,
			},
		}
	}
}

