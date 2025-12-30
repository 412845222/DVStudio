export type Vec2 = { x: number; y: number }

export type RectCorners = {
	tl: Vec2
	tr: Vec2
	bl: Vec2
	br: Vec2
}

export const rotatedRectCorners = (center: Vec2, size: { width: number; height: number }, rotation: number): RectCorners => {
	const cx = center.x
	const cy = center.y
	const w = Number(size.width) || 0
	const h = Number(size.height) || 0
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number): Vec2 => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos })
	return {
		tl: rot(-w / 2, -h / 2),
		tr: rot(w / 2, -h / 2),
		bl: rot(-w / 2, h / 2),
		br: rot(w / 2, h / 2),
	}
}

export type LineLocalPoints = {
	startX: number
	startY: number
	endX: number
	endY: number
	anchorX: number
	anchorY: number
}

export type LineWorldPoints = {
	start: Vec2
	anchor: Vec2
	end: Vec2
}

export const lineControlPointsWorld = (center: Vec2, rotation: number, local: LineLocalPoints): LineWorldPoints => {
	const cx = center.x
	const cy = center.y
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number): Vec2 => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos })
	return {
		start: rot(local.startX, local.startY),
		anchor: rot(local.anchorX, local.anchorY),
		end: rot(local.endX, local.endY),
	}
}

export const worldToLocalRotated = (world: Vec2, center: Vec2, rotation: number): Vec2 => {
	const dx = world.x - center.x
	const dy = world.y - center.y
	const cos = Math.cos(-rotation)
	const sin = Math.sin(-rotation)
	return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}
