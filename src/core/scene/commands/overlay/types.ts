export type NodeOverlayCorners = {
	tl: { x: number; y: number }
	tr: { x: number; y: number }
	bl: { x: number; y: number }
	br: { x: number; y: number }
}

export type NodeOverlayGeometry = {
	corners: NodeOverlayCorners
	sizeText: string
	linePoints?: { start: { x: number; y: number }; anchor: { x: number; y: number }; end: { x: number; y: number } }
}
