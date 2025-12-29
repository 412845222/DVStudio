export type TimelineFrameSpan = number | { start: number; end: number } // inclusive

export const spanStart = (s: TimelineFrameSpan) => (typeof s === 'number' ? s : s.start)
export const spanEnd = (s: TimelineFrameSpan) => (typeof s === 'number' ? s : s.end)

type Segment = { start: number; end: number } // inclusive

const toSegment = (s: TimelineFrameSpan): Segment => {
	if (typeof s === 'number') return { start: s, end: s }
	const a = Math.floor(Number(s.start))
	const b = Math.floor(Number(s.end))
	if (!Number.isFinite(a) || !Number.isFinite(b)) return { start: 0, end: -1 }
	return a <= b ? { start: a, end: b } : { start: b, end: a }
}

const mergeSegments = (segments: Segment[]): Segment[] => {
	const list = segments
		.map((s) => ({ start: Math.floor(s.start), end: Math.floor(s.end) }))
		.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start <= s.end)
		.sort((a, b) => a.start - b.start || a.end - b.end)
	if (list.length === 0) return []

	const out: Segment[] = []
	let cur = { ...list[0] }
	for (let i = 1; i < list.length; i++) {
		const s = list[i]
		if (s.start <= cur.end + 1) {
			cur.end = Math.max(cur.end, s.end)
		} else {
			out.push(cur)
			cur = { ...s }
		}
	}
	out.push(cur)
	return out
}

const segmentsToSpans = (segments: Segment[]): TimelineFrameSpan[] => {
	const out: TimelineFrameSpan[] = []
	for (const seg of segments) {
		const len = seg.end - seg.start + 1
		if (len >= 3) out.push({ start: seg.start, end: seg.end })
		else if (len === 2) out.push(seg.start, seg.start + 1)
		else out.push(seg.start)
	}
	return out
}

export const normalizeSpans = (spans: TimelineFrameSpan[]): TimelineFrameSpan[] => {
	const segs = mergeSegments(spans.map(toSegment))
	return segmentsToSpans(segs)
}

export const clipSpans = (spans: TimelineFrameSpan[], minFrame: number, maxFrame: number): TimelineFrameSpan[] => {
	const minF = Math.floor(minFrame)
	const maxF = Math.floor(maxFrame)
	if (!Number.isFinite(minF) || !Number.isFinite(maxF) || maxF < minF) return []
	const segs: Segment[] = []
	for (const s of spans) {
		const seg = toSegment(s)
		const a = Math.max(minF, seg.start)
		const b = Math.min(maxF, seg.end)
		if (a <= b) segs.push({ start: a, end: b })
	}
	return segmentsToSpans(mergeSegments(segs))
}

export const addRange = (spans: TimelineFrameSpan[], startFrame: number, endFrame: number): TimelineFrameSpan[] => {
	const a = Math.floor(Math.min(startFrame, endFrame))
	const b = Math.floor(Math.max(startFrame, endFrame))
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return normalizeSpans(spans)
	const segs = mergeSegments([...spans.map(toSegment), { start: a, end: b }])
	return segmentsToSpans(segs)
}

export const removeRange = (spans: TimelineFrameSpan[], startFrame: number, endFrame: number): TimelineFrameSpan[] => {
	const a = Math.floor(Math.min(startFrame, endFrame))
	const b = Math.floor(Math.max(startFrame, endFrame))
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return normalizeSpans(spans)
	const segs = mergeSegments(spans.map(toSegment))
	const next: Segment[] = []
	for (const seg of segs) {
		if (seg.end < a || seg.start > b) {
			next.push(seg)
			continue
		}
		if (seg.start < a) next.push({ start: seg.start, end: a - 1 })
		if (seg.end > b) next.push({ start: b + 1, end: seg.end })
	}
	return segmentsToSpans(next)
}

export const containsFrame = (spans: TimelineFrameSpan[], frameIndex: number): boolean => {
	const fi = Math.floor(frameIndex)
	if (!Number.isFinite(fi)) return false
	const arr = spans
	if (arr.length === 0) return false

	let lo = 0
	let hi = arr.length
	// first spanStart > fi
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (spanStart(arr[mid]) <= fi) lo = mid + 1
		else hi = mid
	}
	const idx = lo - 1
	if (idx < 0) return false
	return fi <= spanEnd(arr[idx])
}

export const rangeIntersects = (spans: TimelineFrameSpan[], startFrame: number, endFrame: number): boolean => {
	const a = Math.floor(Math.min(startFrame, endFrame))
	const b = Math.floor(Math.max(startFrame, endFrame))
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return false
	if (spans.length === 0) return false

	// find first with end >= a
	let lo = 0
	let hi = spans.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (spanEnd(spans[mid]) < a) lo = mid + 1
		else hi = mid
	}
	for (let i = lo; i < spans.length; i++) {
		const s = spans[i]
		if (spanStart(s) > b) break
		return true
	}
	return false
}

export const rangeFullyCovered = (spans: TimelineFrameSpan[], startFrame: number, endFrame: number): boolean => {
	const a = Math.floor(Math.min(startFrame, endFrame))
	const b = Math.floor(Math.max(startFrame, endFrame))
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return false
	if (spans.length === 0) return false

	// find first span that could cover 'a'
	let lo = 0
	let hi = spans.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (spanEnd(spans[mid]) < a) lo = mid + 1
		else hi = mid
	}
	let cur = a
	for (let i = lo; i < spans.length; i++) {
		const s = spans[i]
		const ss = spanStart(s)
		const ee = spanEnd(s)
		if (ss > cur) return false
		if (ee >= cur) cur = ee + 1
		if (cur > b) return true
	}
	return cur > b
}

export const getPrevNext = (spans: TimelineFrameSpan[], frameIndex: number): { prev: number | null; next: number | null } => {
	const fi = Math.floor(frameIndex)
	if (!Number.isFinite(fi) || spans.length === 0) return { prev: null, next: null }

	// first spanStart >= fi
	let lo = 0
	let hi = spans.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (spanStart(spans[mid]) < fi) lo = mid + 1
		else hi = mid
	}

	const next = lo < spans.length ? spanStart(spans[lo]) : null
	const prev = lo > 0 ? spanEnd(spans[lo - 1]) : null
	return { prev, next }
}

export const toggleRange = (spans: TimelineFrameSpan[], startFrame: number, endFrame: number): TimelineFrameSpan[] => {
	const a = Math.floor(Math.min(startFrame, endFrame))
	const b = Math.floor(Math.max(startFrame, endFrame))
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return normalizeSpans(spans)
	return rangeFullyCovered(spans, a, b) ? removeRange(spans, a, b) : addRange(spans, a, b)
}
