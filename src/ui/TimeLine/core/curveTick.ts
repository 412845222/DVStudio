export type CubicBezier = { x1: number; y1: number; x2: number; y2: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// Cubic bezier helpers based on the standard CSS timing-function implementation pattern.
// Given x in [0,1], solve for t where BezierX(t)=x, then return BezierY(t).
const A = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1
const B = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1
const C = (a1: number) => 3.0 * a1

const calcBezier = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t
const getSlope = (t: number, a1: number, a2: number) => 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1)

const binarySubdivide = (x: number, a: number, b: number, x1: number, x2: number) => {
	let currentX: number
	let currentT: number
	let i = 0
	do {
		currentT = a + (b - a) / 2.0
		currentX = calcBezier(currentT, x1, x2) - x
		if (currentX > 0.0) b = currentT
		else a = currentT
	} while (Math.abs(currentX) > 1e-7 && ++i < 12)
	return currentT
}

const newtonRaphsonIterate = (x: number, guessT: number, x1: number, x2: number) => {
	let t = guessT
	for (let i = 0; i < 8; i++) {
		const slope = getSlope(t, x1, x2)
		if (slope === 0) return t
		const currentX = calcBezier(t, x1, x2) - x
		t -= currentX / slope
	}
	return t
}

export const cubicBezierYforX = (curve: CubicBezier, x: number) => {
	const x1 = clamp01(Number(curve.x1))
	const y1 = clamp01(Number(curve.y1))
	const x2 = clamp01(Number(curve.x2))
	const y2 = clamp01(Number(curve.y2))

	const cx = clamp01(Number(x))
	if (cx === 0 || cx === 1) return cx

	// If it's linear-ish, avoid solver noise.
	if (x1 === y1 && x2 === y2) return cx

	// Precompute sample table for initial guess.
	const kSplineTableSize = 11
	const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0)
	const sampleValues = new Array<number>(kSplineTableSize)
	for (let i = 0; i < kSplineTableSize; i++) {
		sampleValues[i] = calcBezier(i * kSampleStepSize, x1, x2)
	}

	let intervalStart = 0.0
	let currentSample = 1
	const lastSample = kSplineTableSize - 1
	for (; currentSample !== lastSample && sampleValues[currentSample] <= cx; ++currentSample) {
		intervalStart += kSampleStepSize
	}
	--currentSample

	const dist = (cx - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample])
	let guessT = intervalStart + dist * kSampleStepSize

	const initialSlope = getSlope(guessT, x1, x2)
	if (initialSlope >= 1e-3) {
		guessT = newtonRaphsonIterate(cx, guessT, x1, x2)
	} else if (initialSlope === 0.0) {
		// keep guessT
	} else {
		guessT = binarySubdivide(cx, intervalStart, intervalStart + kSampleStepSize, x1, x2)
	}

	const y = calcBezier(guessT, y1, y2)
	return clamp01(y)
}

export const lerpNumber = (a: number, b: number, t: number) => {
	const aa = Number(a)
	const bb = Number(b)
	if (!Number.isFinite(aa) || !Number.isFinite(bb)) return Number.isFinite(bb) ? bb : aa
	return aa + (bb - aa) * t
}

export const canInterpolateNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
