export type Vec2 = { x: number; y: number }

export type RectCorners = {
	tl: Vec2
	tr: Vec2
	bl: Vec2
	br: Vec2
}

export const rotatedRectCorners = (
	center: Vec2,
	size: { width: number; height: number },
	rotation: number
): RectCorners => {
	const cx = center.x
	const cy = center.y
	const w = Number.isFinite(Number(size.width)) ? Number(size.width) : 0
	const h = Number.isFinite(Number(size.height)) ? Number(size.height) : 0
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number): Vec2 => ({
		x: cx + dx * cos - dy * sin,
		y: cy + dx * sin + dy * cos
	})
	return {
		tl: rot(-w / 2, -h / 2),
		tr: rot(w / 2, -h / 2),
		bl: rot(-w / 2, h / 2),
		br: rot(w / 2, h / 2)
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

const toFiniteNumber = (value: unknown, fallback: number): number => {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

export const normalizeLineLocalPoints = (args: {
	props?: Partial<Record<keyof LineLocalPoints, unknown>> | null
	width: number
	height: number
}): LineLocalPoints => {
	const width = Math.max(1, Number(args.width) || 1)
	const height = Math.max(1, Number(args.height) || 1)
	const props = args.props ?? {}
	const defaultStartX = -width / 2 + 12
	const defaultStartY = 0
	const defaultEndX = width / 2 - 12
	const defaultEndY = 0
	const startX = toFiniteNumber(props.startX, defaultStartX)
	const startY = toFiniteNumber(props.startY, defaultStartY)
	const endX = toFiniteNumber(props.endX, defaultEndX)
	const endY = toFiniteNumber(props.endY, defaultEndY)
	const suggestedAnchor = suggestLineAnchorLocal({ startX, startY, endX, endY, width, height })
	return {
		startX,
		startY,
		endX,
		endY,
		anchorX: toFiniteNumber(props.anchorX, suggestedAnchor.anchorX),
		anchorY: toFiniteNumber(props.anchorY, suggestedAnchor.anchorY)
	}
}

export const scaleLineLocalPoints = (
	local: LineLocalPoints,
	scaleX = 1,
	scaleY = 1
): LineLocalPoints => {
	const sx = Number.isFinite(Number(scaleX)) ? Number(scaleX) : 1
	const sy = Number.isFinite(Number(scaleY)) ? Number(scaleY) : 1
	return {
		startX: local.startX * sx,
		startY: local.startY * sy,
		endX: local.endX * sx,
		endY: local.endY * sy,
		anchorX: local.anchorX * sx,
		anchorY: local.anchorY * sy
	}
}

export const suggestLineAnchorLocal = (args: {
	startX: number
	startY: number
	endX: number
	endY: number
	width: number
	height: number
}): { anchorX: number; anchorY: number } => {
	const startX = Number(args.startX) || 0
	const startY = Number(args.startY) || 0
	const endX = Number(args.endX) || 0
	const endY = Number(args.endY) || 0
	const width = Math.max(1, Number(args.width) || 1)
	const height = Math.max(1, Number(args.height) || 1)
	const dx = endX - startX
	const dy = endY - startY
	const len = Math.max(1, Math.hypot(dx, dy))
	let nx = -dy / len
	let ny = dx / len
	const mostlyHorizontal = Math.abs(dy) <= Math.max(8, height * 0.12)
	const mostlyVertical = Math.abs(dx) <= Math.max(8, width * 0.12)
	if (mostlyHorizontal && ny > 0) {
		nx = -nx
		ny = -ny
	} else if (mostlyVertical && nx < 0) {
		nx = -nx
		ny = -ny
	} else if (!mostlyHorizontal && ny > 0) {
		nx = -nx
		ny = -ny
	}
	const bend = Math.max(18, Math.min(Math.max(width, height) * 0.32, len * 0.28, 120))
	return {
		anchorX: (startX + endX) / 2 + nx * bend,
		anchorY: (startY + endY) / 2 + ny * bend
	}
}

export const lineControlPointsWorld = (
	center: Vec2,
	rotation: number,
	local: LineLocalPoints
): LineWorldPoints => {
	const cx = center.x
	const cy = center.y
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number): Vec2 => ({
		x: cx + dx * cos - dy * sin,
		y: cy + dx * sin + dy * cos
	})
	return {
		start: rot(local.startX, local.startY),
		anchor: rot(local.anchorX, local.anchorY),
		end: rot(local.endX, local.endY)
	}
}

export const worldToLocalRotated = (world: Vec2, center: Vec2, rotation: number): Vec2 => {
	const dx = world.x - center.x
	const dy = world.y - center.y
	const cos = Math.cos(-rotation)
	const sin = Math.sin(-rotation)
	return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}
