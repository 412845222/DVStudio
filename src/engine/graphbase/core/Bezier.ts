import { Vector2 } from './Vector2'
import { Rect } from './Rect'

export function bezierPoint(
	t: number,
	p0: Vector2,
	p1: Vector2,
	p2: Vector2,
	p3: Vector2
): Vector2 {
	const u = 1 - t
	const tt = t * t
	const uu = u * u
	const uuu = uu * u
	const ttt = tt * t

	return new Vector2(
		uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
		uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
	)
}

export function bezierTangent(
	t: number,
	p0: Vector2,
	p1: Vector2,
	p2: Vector2,
	p3: Vector2
): Vector2 {
	const u = 1 - t
	return new Vector2(
		3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
		3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
	)
}

export function bezierBounds(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2): Rect {
	let minX = Math.min(p0.x, p3.x)
	let maxX = Math.max(p0.x, p3.x)
	let minY = Math.min(p0.y, p3.y)
	let maxY = Math.max(p0.y, p3.y)

	const a = p0.clone().mul(-3).add(p1.mul(9)).add(p2.mul(-9)).add(p3.mul(3))
	const b = p0.mul(6).add(p1.mul(-12)).add(p2.mul(6))
	const c = p0.mul(-3).add(p1.mul(3))

	for (const axis of ['x', 'y'] as const) {
		const aa = a[axis]
		const bb = b[axis]
		const cc = c[axis]

		if (Math.abs(aa) < 1e-8) {
			if (Math.abs(bb) > 1e-8) {
				const t = -cc / bb
				if (t >= 0 && t <= 1) {
					const pt = bezierPoint(t, p0, p1, p2, p3)
					minX = Math.min(minX, pt.x)
					maxX = Math.max(maxX, pt.x)
					minY = Math.min(minY, pt.y)
					maxY = Math.max(maxY, pt.y)
				}
			}
		} else {
			const disc = bb * bb - 4 * aa * cc
			if (disc >= 0) {
				const sqrtDisc = Math.sqrt(disc)
				const t1 = (-bb + sqrtDisc) / (2 * aa)
				const t2 = (-bb - sqrtDisc) / (2 * aa)
				for (const t of [t1, t2]) {
					if (t >= 0 && t <= 1) {
						const pt = bezierPoint(t, p0, p1, p2, p3)
						minX = Math.min(minX, pt.x)
						maxX = Math.max(maxX, pt.x)
						minY = Math.min(minY, pt.y)
						maxY = Math.max(maxY, pt.y)
					}
				}
			}
		}
	}

	return new Rect(minX, minY, maxX - minX, maxY - minY)
}

export function bezierLength(
	p0: Vector2,
	p1: Vector2,
	p2: Vector2,
	p3: Vector2,
	steps = 20
): number {
	let length = 0
	let prev = p0
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const curr = bezierPoint(t, p0, p1, p2, p3)
		length += prev.distanceTo(curr)
		prev = curr
	}
	return length
}

export function bezierClosestPoint(
	point: Vector2,
	p0: Vector2,
	p1: Vector2,
	p2: Vector2,
	p3: Vector2,
	iterations = 30,
	tolerance = 1e-4
): { t: number; point: Vector2; distance: number } {
	let t = 0.5
	let minDist = Infinity
	let bestT = 0
	let bestPoint = p0.clone()

	for (let i = 0; i <= iterations; i++) {
		const ct = i / iterations
		const pt = bezierPoint(ct, p0, p1, p2, p3)
		const dist = pt.distanceToSq(point)
		if (dist < minDist) {
			minDist = dist
			bestT = ct
			bestPoint = pt
		}
	}

	let low = Math.max(0, bestT - 1 / iterations)
	let high = Math.min(1, bestT + 1 / iterations)

	for (let i = 0; i < 20; i++) {
		if (high - low < tolerance) break
		const m1 = low + (high - low) / 3
		const m2 = high - (high - low) / 3
		const p1m = bezierPoint(m1, p0, p1, p2, p3)
		const p2m = bezierPoint(m2, p0, p1, p2, p3)
		const d1 = p1m.distanceToSq(point)
		const d2 = p2m.distanceToSq(point)
		if (d1 < d2) {
			high = m2
		} else {
			low = m1
		}
	}

	bestT = (low + high) / 2
	bestPoint = bezierPoint(bestT, p0, p1, p2, p3)
	minDist = bestPoint.distanceTo(point)

	return { t: bestT, point: bestPoint, distance: minDist }
}

export function buildCubicBezier(
	from: Vector2,
	fromDir: Vector2,
	to: Vector2,
	toDir: Vector2,
	curvature = 0.5
): { p1: Vector2; p2: Vector2 } {
	const dist = from.distanceTo(to)
	const offset = dist * curvature
	return {
		p1: from.add(fromDir.mul(offset)),
		p2: to.add(toDir.mul(offset))
	}
}
