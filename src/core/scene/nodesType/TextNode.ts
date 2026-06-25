import { NodeBase } from './NodeBase'
import type { NodeBaseDTO, NodeType, TextNodeDTO, TextNodeProps } from './types'

export type TextNodePropsInput = {
	textContent?: unknown
	fontSize?: unknown
	fontColor?: unknown
	fontStyle?: unknown
	textAlign?: unknown
}

export const normalizeTextNodeProps = (base: TextNodePropsInput): TextNodeProps => {
	const textContent = typeof base?.textContent === 'string' ? base.textContent : 'Text'
	const fontSizeRaw = Number(base?.fontSize)
	const fontSize = Number.isFinite(fontSizeRaw) ? fontSizeRaw : 24
	const fontColor = typeof base?.fontColor === 'string' ? base.fontColor : '#ffffff'
	const fontStyle = typeof base?.fontStyle === 'string' ? base.fontStyle : 'normal'
	const textAlign = base?.textAlign === 'left' || base?.textAlign === 'right' || base?.textAlign === 'center' ? base.textAlign : 'center'
	return {
		textContent,
		fontSize,
		fontColor,
		fontStyle,
		textAlign,
	}
}

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
		const props = normalizeTextNodeProps(dto.props ?? {})
		return {
			id: dto.id,
			name: dto.name,
			type: 'text',
			transform: { ...dto.transform, width: Math.max(1, dto.transform.width ?? 240), height: Math.max(1, dto.transform.height ?? 60) },
			props,
		}
	}
}
