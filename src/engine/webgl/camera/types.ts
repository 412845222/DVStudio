export type Vec2 = { x: number; y: number }

export type ViewportState = {
	pan: Vec2 // screen-space px
	zoom: number
}

export type ViewportInset = {
	left?: number
	top?: number
	right?: number
	bottom?: number
}
