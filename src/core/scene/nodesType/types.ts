import type { JsonValue } from '../../shared/json'

export type NodeType = 'base' | 'rect' | 'text' | 'image' | 'line'

export type NodeTransform = {
	x: number
	y: number
	width: number
	height: number
	rotation: number
	opacity: number
}

export type NodeBaseDTO = {
	id: string
	name: string
	type: NodeType
	transform: NodeTransform
	props?: Record<string, JsonValue>
}

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

export type TextNodeProps = {
	textContent: string
	fontSize: number
	fontColor: string
	fontStyle: string
	textAlign: 'left' | 'center' | 'right'
}

export type TextNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'text'
	props: TextNodeProps
}

export type ImageNodeProps = {
	imageId?: string
	imagePath: string
	imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
}

export type ImageNodeDTO = Omit<NodeBaseDTO, 'type' | 'props'> & {
	type: 'image'
	props: ImageNodeProps
}

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
