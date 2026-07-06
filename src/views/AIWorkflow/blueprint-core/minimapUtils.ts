export const MINIMAP_WIDTH = 200
export const MINIMAP_HEIGHT = 150
export const MINIMAP_PADDING = 8
export const DEFAULT_WORLD_BOUNDS = { x: -1000, y: -1000, width: 2000, height: 2000 }

export interface MinimapNodeLike {
	worldX?: number
	worldY?: number
	width?: number
	height?: number
}

export interface MinimapViewportLike {
	zoom?: number
	panX?: number
	panY?: number
}

export interface MinimapCanvasSize {
	width: number
	height: number
}

export interface MinimapBounds {
	x: number
	y: number
	width: number
	height: number
}

export const computeWorldBounds = (
	nodes: MinimapNodeLike[],
	padding = 120
): MinimapBounds => {
	if (nodes.length === 0) return DEFAULT_WORLD_BOUNDS

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const node of nodes) {
		const wx = node.worldX ?? 0
		const wy = node.worldY ?? 0
		const nw = node.width ?? 200
		const nh = node.height ?? 160
		const halfW = nw / 2
		const halfH = nh / 2
		minX = Math.min(minX, wx - halfW)
		minY = Math.min(minY, wy - halfH)
		maxX = Math.max(maxX, wx + halfW)
		maxY = Math.max(maxY, wy + halfH)
	}

	if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
		return DEFAULT_WORLD_BOUNDS
	}

	return {
		x: minX - padding,
		y: minY - padding,
		width: (maxX - minX) + padding * 2,
		height: (maxY - minY) + padding * 2
	}
}

export const computeMinimapScale = (bounds: MinimapBounds): number => {
	if (bounds.width <= 0 || bounds.height <= 0) return 0.08
	const scaleX = (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / bounds.width
	const scaleY = (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / bounds.height
	return Math.min(scaleX, scaleY)
}

export const computeMinimapOffset = (bounds: MinimapBounds, scale: number) => {
	const contentWidth = bounds.width * scale
	const contentHeight = bounds.height * scale
	return {
		x: MINIMAP_PADDING + (MINIMAP_WIDTH - MINIMAP_PADDING * 2 - contentWidth) / 2,
		y: MINIMAP_PADDING + (MINIMAP_HEIGHT - MINIMAP_PADDING * 2 - contentHeight) / 2
	}
}

export const worldToMinimap = (
	wx: number,
	wy: number,
	bounds: MinimapBounds,
	scale: number,
	offset: { x: number; y: number }
) => ({
	x: offset.x + (wx - bounds.x) * scale,
	y: offset.y + (wy - bounds.y) * scale
})

export const minimapToWorld = (
	mx: number,
	my: number,
	bounds: MinimapBounds,
	scale: number,
	offset: { x: number; y: number }
) => ({
	x: (mx - offset.x) / scale + bounds.x,
	y: (my - offset.y) / scale + bounds.y
})

export const computeViewportInMinimap = (
	viewport: MinimapViewportLike,
	canvasSize: MinimapCanvasSize,
	bounds: MinimapBounds,
	scale: number,
	offset: { x: number; y: number }
) => {
	const zoom = viewport.zoom || 1
	const panX = viewport.panX || 0
	const panY = viewport.panY || 0

	const centerWorldX = -panX / zoom
	const centerWorldY = -panY / zoom
	const halfWorldW = (canvasSize.width / 2) / zoom
	const halfWorldH = (canvasSize.height / 2) / zoom

	const tl = worldToMinimap(centerWorldX - halfWorldW, centerWorldY - halfWorldH, bounds, scale, offset)
	const br = worldToMinimap(centerWorldX + halfWorldW, centerWorldY + halfWorldH, bounds, scale, offset)

	return {
		x: tl.x,
		y: tl.y,
		width: br.x - tl.x,
		height: br.y - tl.y
	}
}

export const computePanForWorldPoint = (
	worldX: number,
	worldY: number,
	zoom: number
) => ({
	panX: -worldX * zoom,
	panY: -worldY * zoom
})

export const computeFitAllViewport = (
	nodes: MinimapNodeLike[],
	canvasSize: MinimapCanvasSize,
	paddingRatio = 0.85
) => {
	if (nodes.length === 0) {
		return { zoom: 1, panX: 0, panY: 0 }
	}

	const bounds = computeWorldBounds(nodes)
	const scaleX = (canvasSize.width * paddingRatio) / bounds.width
	const scaleY = (canvasSize.height * paddingRatio) / bounds.height
	const zoom = Math.max(0.2, Math.min(6, Math.min(scaleX, scaleY)))
	const centerWorldX = bounds.x + bounds.width / 2
	const centerWorldY = bounds.y + bounds.height / 2
	const { panX, panY } = computePanForWorldPoint(centerWorldX, centerWorldY, zoom)
	return { zoom, panX, panY }
}

export const computeWheelZoomViewport = (
	viewport: MinimapViewportLike,
	canvasSize: MinimapCanvasSize,
	anchorMinimapX: number,
	anchorMinimapY: number,
	bounds: MinimapBounds,
	scale: number,
	offset: { x: number; y: number },
	deltaY: number,
	zoomFactor = 0.92
) => {
	const zoom = viewport.zoom || 1
	const z1 = Math.max(0.2, Math.min(6, zoom * (deltaY > 0 ? zoomFactor : 1 / zoomFactor)))
	if (Math.abs(z1 - zoom) < 1e-6) return { zoom, panX: viewport.panX || 0, panY: viewport.panY || 0 }

	const anchorWorld = minimapToWorld(anchorMinimapX, anchorMinimapY, bounds, scale, offset)
	const { panX, panY } = computePanForWorldPoint(anchorWorld.x, anchorWorld.y, z1)
	return { zoom: z1, panX, panY }
}

export const screenToWorld = (
	screenX: number,
	screenY: number,
	canvasSize: MinimapCanvasSize,
	viewport: MinimapViewportLike
) => {
	const z = viewport.zoom || 1
	const panX = viewport.panX || 0
	const panY = viewport.panY || 0
	return {
		x: (screenX - canvasSize.width / 2 - panX) / z,
		y: (screenY - canvasSize.height / 2 - panY) / z
	}
}

export const worldToScreen = (
	worldX: number,
	worldY: number,
	canvasSize: MinimapCanvasSize,
	viewport: MinimapViewportLike
) => {
	const z = viewport.zoom || 1
	const panX = viewport.panX || 0
	const panY = viewport.panY || 0
	return {
		x: canvasSize.width / 2 + panX + worldX * z,
		y: canvasSize.height / 2 + panY + worldY * z
	}
}
