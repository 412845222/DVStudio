import type { Vec2, ViewportInset, ViewportState } from './types'

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export type ViewportSize = { width: number; height: number }

export function screenToWorld(viewport: ViewportState, p: Vec2): Vec2 {
	const z = viewport.zoom
	return { x: (p.x - viewport.pan.x) / z, y: (p.y - viewport.pan.y) / z }
}

export function worldToScreen(viewport: ViewportState, p: Vec2): Vec2 {
	const z = viewport.zoom
	return { x: p.x * z + viewport.pan.x, y: p.y * z + viewport.pan.y }
}

export function applyPanBy(viewport: ViewportState, delta: Vec2) {
	viewport.pan.x += delta.x
	viewport.pan.y += delta.y
}

export function applyZoomAt(viewport: ViewportState, screenPoint: Vec2, nextZoom: number): boolean {
	const prevZoom = viewport.zoom
	const z = clamp(nextZoom, 0.1, 8)
	if (Math.abs(z - prevZoom) < 1e-6) return false

	const worldBefore = screenToWorld(viewport, screenPoint)
	viewport.zoom = z
	const screenAfter = worldToScreen(viewport, worldBefore)
	viewport.pan.x += screenPoint.x - screenAfter.x
	viewport.pan.y += screenPoint.y - screenAfter.y
	return true
}

export function applyFitToStage(
	viewport: ViewportState,
	viewportSize: ViewportSize,
	stageSize: { width: number; height: number },
	paddingPx = 24,
	inset: ViewportInset = {}
) {
	const { width: w, height: h } = viewportSize
	const left = inset.left ?? 0
	const top = inset.top ?? 0
	const right = inset.right ?? 0
	const bottom = inset.bottom ?? 0
	const availableW = Math.max(1, w - left - right - paddingPx * 2)
	const availableH = Math.max(1, h - top - bottom - paddingPx * 2)
	const scaleX = availableW / stageSize.width
	const scaleY = availableH / stageSize.height
	const z = clamp(Math.min(scaleX, scaleY), 0.1, 8)
	viewport.zoom = z
	const centerX = left + (w - left - right) / 2
	const centerY = top + (h - top - bottom) / 2
	viewport.pan.x = centerX
	viewport.pan.y = centerY
}
