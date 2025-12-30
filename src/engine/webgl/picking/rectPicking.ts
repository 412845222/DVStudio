type Vec2 = { x: number; y: number }

export type PickingHit = { layerId: string; nodeId: string }

export type PickableRectNode = {
	layerId: string
	id: string
	transform: { x: number; y: number; width: number; height: number } & Record<string, unknown>
	props?: unknown
}

const getRotation = (transform: PickableRectNode['transform']): number => {
	const rot = transform.rotation
	return typeof rot === 'number' && Number.isFinite(rot) ? rot : 0
}

const isLocked = (props: unknown): boolean => {
	if (!props || typeof props !== 'object') return false
	const p = props as Record<string, unknown>
	return Boolean(p.locked)
}

export function hitTestRotatedRects(nodes: PickableRectNode[], worldPoint: Vec2): PickingHit | null {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i]
		if (isLocked(n.props)) continue
		const rotation = getRotation(n.transform)
		const w = n.transform.width
		const h = n.transform.height

		// hitTest: 旋转矩形，先把点旋回局部坐标再做 AABB
		const cos = Math.cos(-rotation)
		const sin = Math.sin(-rotation)
		const dx = worldPoint.x - n.transform.x
		const dy = worldPoint.y - n.transform.y
		const lx = dx * cos - dy * sin
		const ly = dx * sin + dy * cos
		const x0 = -w / 2
		const x1 = w / 2
		const y0 = -h / 2
		const y1 = h / 2
		if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) return { layerId: n.layerId, nodeId: n.id }
	}
	return null
}

export function queryRotatedRectsInWorldRect(
	nodes: PickableRectNode[],
	worldRect: { x0: number; y0: number; x1: number; y1: number }
): PickingHit[] {
	const x0 = Math.min(worldRect.x0, worldRect.x1)
	const x1 = Math.max(worldRect.x0, worldRect.x1)
	const y0 = Math.min(worldRect.y0, worldRect.y1)
	const y1 = Math.max(worldRect.y0, worldRect.y1)

	const hits: PickingHit[] = []
	for (const n of nodes) {
		if (isLocked(n.props)) continue
		const rotation = getRotation(n.transform)
		const cx = n.transform.x
		const cy = n.transform.y
		const w = n.transform.width
		const h = n.transform.height

		let nx0 = cx - w / 2
		let nx1 = cx + w / 2
		let ny0 = cy - h / 2
		let ny1 = cy + h / 2
		if (rotation) {
			const cos = Math.cos(rotation)
			const sin = Math.sin(rotation)
			const rot = (dx: number, dy: number) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos })
			const p1 = rot(-w / 2, -h / 2)
			const p2 = rot(w / 2, -h / 2)
			const p3 = rot(-w / 2, h / 2)
			const p4 = rot(w / 2, h / 2)
			nx0 = Math.min(p1.x, p2.x, p3.x, p4.x)
			nx1 = Math.max(p1.x, p2.x, p3.x, p4.x)
			ny0 = Math.min(p1.y, p2.y, p3.y, p4.y)
			ny1 = Math.max(p1.y, p2.y, p3.y, p4.y)
		}

		const intersects = nx0 <= x1 && nx1 >= x0 && ny0 <= y1 && ny1 >= y0
		if (!intersects) continue
		hits.push({ layerId: n.layerId, nodeId: n.id })
	}
	return hits
}
