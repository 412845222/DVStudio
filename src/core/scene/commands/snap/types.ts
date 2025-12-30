export type SnapLock = {
	x?: { target: number; mode: 'l' | 'c' | 'r' }
	y?: { target: number; mode: 't' | 'c' | 'b' }
}

export type StageBounds = { left: number; right: number; top: number; bottom: number }

export type SnapContext = {
	nodeLinesX: number[]
	nodeLinesY: number[]
	stage: StageBounds
	threshold: number
}

export type BeginSnapContextArgs = {
	stageWidth: number
	stageHeight: number
	zoom: number
	basePx?: number
}

export type MoveSnapSession = {
	ctx: SnapContext
	lock: SnapLock | null
}

export type MoveSnapResult = {
	worldCx: number
	worldCy: number
	snappedLineX: number | null
	snappedLineY: number | null
	lock: SnapLock | null
}

export type ResizeSnapSession = {
	ctx: SnapContext
	lock: SnapLock | null
}

export type ResizeSnapResolveResult = {
	movingX: number
	movingY: number
	width: number
	height: number
	cx: number
	cy: number
	snappedLineX: number | null
	snappedLineY: number | null
	lock: SnapLock | null
}
