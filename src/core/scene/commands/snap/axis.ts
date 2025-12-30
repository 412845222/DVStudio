import type { SnapLock } from './types'
import type { SnapCandidate, SnapCandidateX, SnapCandidateY, SnapMode, SnapModeX, SnapModeY } from './internalTypes'

const defaultCandidates = (axis: 'x' | 'y', center: number, size: number): SnapCandidate[] => {
	if (axis === 'x') {
		return [
			{ mode: 'l', v: center - size / 2 },
			{ mode: 'c', v: center },
			{ mode: 'r', v: center + size / 2 },
		]
	}
	return [
		{ mode: 't', v: center - size / 2 },
		{ mode: 'c', v: center },
		{ mode: 'b', v: center + size / 2 },
	]
}

export function applySnapAxis(
	axis: 'x',
	center: number,
	size: number,
	lines: number[],
	threshold: number,
	lock: SnapLock | null,
	opt?: {
		candidates?: SnapCandidateX[]
	}
): { center: number; snappedLine: number | null; lock: SnapLock['x'] | null; dist: number }

export function applySnapAxis(
	axis: 'y',
	center: number,
	size: number,
	lines: number[],
	threshold: number,
	lock: SnapLock | null,
	opt?: {
		candidates?: SnapCandidateY[]
	}
): { center: number; snappedLine: number | null; lock: SnapLock['y'] | null; dist: number }

export function applySnapAxis(
	axis: 'x' | 'y',
	center: number,
	size: number,
	lines: number[],
	threshold: number,
	lock: SnapLock | null,
	opt?: {
		candidates?: SnapCandidate[]
	}
): { center: number; snappedLine: number | null; lock: SnapLock['x'] | SnapLock['y'] | null; dist: number } {
	const sticky = threshold * 2
	if (axis === 'x' && lock?.x) {
		const line = lock.x.target
		const next = lock.x.mode === 'l' ? line + size / 2 : lock.x.mode === 'r' ? line - size / 2 : line
		const dist = Math.abs(next - center)
		if (dist <= sticky) return { center: next, snappedLine: line, lock: lock.x, dist }
	}
	if (axis === 'y' && lock?.y) {
		const line = lock.y.target
		const next = lock.y.mode === 't' ? line + size / 2 : lock.y.mode === 'b' ? line - size / 2 : line
		const dist = Math.abs(next - center)
		if (dist <= sticky) return { center: next, snappedLine: line, lock: lock.y, dist }
	}

	let best: { dist: number; line: number; mode: SnapMode } | null = null
	const candidates = opt?.candidates ?? defaultCandidates(axis, center, size)

	for (const c of candidates) {
		for (const line of lines) {
			const dist = Math.abs(c.v - line)
			if (dist > threshold) continue
			if (!best || dist < best.dist) best = { dist, line, mode: c.mode }
		}
	}
	if (!best) return { center, snappedLine: null as number | null, lock: null, dist: Number.POSITIVE_INFINITY }
	const next =
		best.mode === 'l' || best.mode === 't'
			? best.line + size / 2
			: best.mode === 'r' || best.mode === 'b'
				? best.line - size / 2
				: best.line
	if (axis === 'x') {
		const mode: SnapModeX = best.mode === 'l' || best.mode === 'c' || best.mode === 'r' ? best.mode : 'c'
		return { center: next, snappedLine: best.line, lock: { target: best.line, mode }, dist: best.dist }
	}
	const mode: SnapModeY = best.mode === 't' || best.mode === 'c' || best.mode === 'b' ? best.mode : 'c'
	return { center: next, snappedLine: best.line, lock: { target: best.line, mode }, dist: best.dist }
}

export function applyResizeSnapAxis(
	axis: 'x',
	fixed: number,
	moving: number,
	lines: number[],
	cand: SnapCandidateX[],
	threshold: number,
	minSize: number,
	lock: SnapLock | null
): { center: number; size: number; moving: number; snappedLine: number | null; lock: SnapLock['x'] | null; dist: number }

export function applyResizeSnapAxis(
	axis: 'y',
	fixed: number,
	moving: number,
	lines: number[],
	cand: SnapCandidateY[],
	threshold: number,
	minSize: number,
	lock: SnapLock | null
): { center: number; size: number; moving: number; snappedLine: number | null; lock: SnapLock['y'] | null; dist: number }

export function applyResizeSnapAxis(
	axis: 'x' | 'y',
	fixed: number,
	moving: number,
	lines: number[],
	cand: Array<{ mode: SnapMode; v: number }>,
	threshold: number,
	minSize: number,
	lock: SnapLock | null
): {
	center: number
	size: number
	moving: number
	snappedLine: number | null
	lock: SnapLock['x'] | SnapLock['y'] | null
	dist: number
} {
	const sticky = threshold * 2
	const axisLock = axis === 'x' ? lock?.x : lock?.y
	if (axisLock) {
		const line = axisLock.target
		const mode = axisLock.mode
		const current = cand.find((c) => c.mode === mode)
		if (current) {
			const dist0 = Math.abs(current.v - line)
			if (dist0 <= sticky) {
				const nextMoving = mode === 'c' ? 2 * line - fixed : line
				const nextSize = Math.max(minSize, Math.abs(fixed - nextMoving))
				const nextCenter = (fixed + nextMoving) / 2
				return { center: nextCenter, size: nextSize, moving: nextMoving, snappedLine: line, lock: axisLock, dist: dist0 }
			}
		}
	}

	let best: { dist: number; line: number; mode: SnapMode } | null = null
	for (const c of cand) {
		for (const line of lines) {
			const dist = Math.abs(c.v - line)
			if (dist > threshold) continue
			if (!best || dist < best.dist) best = { dist, line, mode: c.mode }
		}
	}
	if (!best) {
		return {
			center: (fixed + moving) / 2,
			size: Math.max(minSize, Math.abs(fixed - moving)),
			moving,
			snappedLine: null,
			lock: null,
			dist: Number.POSITIVE_INFINITY,
		}
	}
	const nextMoving = best.mode === 'c' ? 2 * best.line - fixed : best.line
	const nextSize = Math.max(minSize, Math.abs(fixed - nextMoving))
	const nextCenter = (fixed + nextMoving) / 2
	if (axis === 'x') {
		const mode: SnapModeX = best.mode === 'l' || best.mode === 'c' || best.mode === 'r' ? best.mode : 'c'
		return {
			center: nextCenter,
			size: nextSize,
			moving: nextMoving,
			snappedLine: best.line,
			lock: { target: best.line, mode },
			dist: best.dist,
		}
	}
	const mode: SnapModeY = best.mode === 't' || best.mode === 'c' || best.mode === 'b' ? best.mode : 'c'
	return {
		center: nextCenter,
		size: nextSize,
		moving: nextMoving,
		snappedLine: best.line,
		lock: { target: best.line, mode },
		dist: best.dist,
	}
}
