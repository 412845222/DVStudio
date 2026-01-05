import type { VideoSceneState, VideoSceneTreeNode } from '../scene'
import { containsFrame, getPrevNext } from '../../store/timeline/spans'
import { canInterpolateNumber, cubicBezierYforX, lerpNumber } from '../../ui/TimeLine/core/curveTick'
import { cloneJsonSafe } from '../shared/cloneJsonSafe'
import { interpolateColorString } from '../../ui/VideoScene/anim/color'
import type { JsonValue } from '../shared/json'

type NodeSnapshot = { transform?: any; props?: Record<string, any> }

type TimelineStateLike = {
	layers: Array<{ id: string }>
	keyframeSpansByLayer: Record<string, any[]>
	nodeKeyframesByLayer?: Record<string, Record<string, Record<string, NodeSnapshot>>>
	layerKindById?: Record<string, string>
	subtitleSpansByLayer?: Record<string, any[]>
	subtitleTextNodeIdByLayer?: Record<string, string>
	stageKeyframesByFrame?: Record<string, { layers: any[] }>
	easingSegmentKeys: string[]
	easingCurves: Record<string, any>
}

const makeSegmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`

const buildNodeIndex = (nodes: VideoSceneTreeNode[] | undefined, out: Map<string, VideoSceneTreeNode>) => {
	if (!nodes) return
	for (const n of nodes) {
		out.set(n.id, n)
		if (n.children?.length) buildNodeIndex(n.children, out)
	}
}

const getLayerNodeSnapshotAt = (timeline: TimelineStateLike, layerId: string, frameIndex: number): Record<string, NodeSnapshot> | null => {
	const map = (timeline as any).nodeKeyframesByLayer?.[layerId]
	if (!map) return null
	const snap = map[String(Math.floor(frameIndex))]
	return snap ?? null
}

const isPlainObject = (v: unknown): v is Record<string, any> => {
	if (!v || typeof v !== 'object') return false
	const proto = Object.getPrototypeOf(v)
	return proto === Object.prototype || proto === null
}

const interpolateFilterList = (a: JsonValue, b: JsonValue, t: number): JsonValue => {
	if (!Array.isArray(a) || !Array.isArray(b)) return b

	const keyOf = (f: any, index: number) => {
		const id = f && typeof f === 'object' ? (f as any).id : null
		return typeof id === 'string' && id ? id : String(index)
	}

	const mapA = new Map<string, any>()
	const mapB = new Map<string, any>()
	for (let i = 0; i < a.length; i++) mapA.set(keyOf(a[i], i), a[i])
	for (let i = 0; i < b.length; i++) mapB.set(keyOf(b[i], i), b[i])

	const order: string[] = []
	for (let i = 0; i < b.length; i++) order.push(keyOf(b[i], i))
	for (let i = 0; i < a.length; i++) {
		const k = keyOf(a[i], i)
		if (!order.includes(k)) order.push(k)
	}

	const out: JsonValue[] = []
	for (const k of order) {
		const fa = mapA.get(k)
		const fb = mapB.get(k)
		if (fb === undefined) {
			out.push(fa)
			continue
		}
		if (fa === undefined) {
			out.push(fb)
			continue
		}
		if (!isPlainObject(fa) || !isPlainObject(fb)) {
			out.push(fb)
			continue
		}

		const next: Record<string, JsonValue> = {}
		const keys = new Set<string>([...Object.keys(fa), ...Object.keys(fb)])
		for (const kk of keys) {
			const va = (fa as Record<string, JsonValue>)[kk]
			const vb = (fb as Record<string, JsonValue>)[kk]
			const cc = interpolateColorString(va, vb, t)
			if (cc != null) next[kk] = cc
			else if (canInterpolateNumber(va) && canInterpolateNumber(vb)) next[kk] = lerpNumber(va, vb, t)
			else next[kk] = vb !== undefined ? vb : va
		}
		out.push(next)
	}
	return out
}

const applySnapshotToLayer = (layers: any[], layerId: string, snap: Record<string, NodeSnapshot>) => {
	const layer = layers.find((l) => String((l as any)?.id) === layerId)
	if (!layer) return
	const index = new Map<string, any>()
	buildNodeIndex((layer as any).nodeTree, index as any)

	for (const [nodeId, s] of Object.entries(snap)) {
		const node = index.get(nodeId)
		if (!node || node.category !== 'user') continue

		const targetT = s.transform as any
		if (targetT && typeof targetT === 'object') {
			node.transform = node.transform ?? {}
			const keys = ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const
			for (const k of keys) {
				if (typeof targetT[k] === 'number' && Number.isFinite(targetT[k])) (node.transform as any)[k] = targetT[k]
			}
		}

		const targetP = s.props
		if (targetP && typeof targetP === 'object') {
			node.props = node.props ?? {}
			for (const [k, v] of Object.entries(targetP)) {
				;(node.props as any)[k] = v
			}
		}
	}
}

const findNodeInLayers = (layers: any[], layerId: string, nodeId: string): any | null => {
	const layer = layers.find((l) => String((l as any)?.id) === layerId)
	if (!layer) return null
	const index = new Map<string, any>()
	buildNodeIndex((layer as any).nodeTree, index as any)
	return index.get(nodeId) ?? null
}

const applySubtitleEmptyOutsideCue = (timeline: TimelineStateLike, layers: any[], layerId: string, frameIndex: number) => {
	const kind = (timeline as any).layerKindById?.[layerId] ?? 'normal'
	if (kind !== 'subtitle') return
	const spans = (timeline as any).subtitleSpansByLayer?.[layerId] ?? []
	const inCue = containsFrame(spans, Math.floor(frameIndex))
	if (inCue) return
	const nodeId = String((timeline as any).subtitleTextNodeIdByLayer?.[layerId] ?? '').trim()
	if (!nodeId) return
	const node = findNodeInLayers(layers, layerId, nodeId)
	if (!node || node.category !== 'user') return
	node.props = node.props ?? {}
	if (String((node.props as any)?.textContent ?? '') !== '') (node.props as any).textContent = ''
}

const applySubtitleLayersAtFrame = (timeline: TimelineStateLike, layers: any[], frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of timeline.layers) {
		const layerId = layer.id
		const kind = (timeline as any).layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'subtitle') continue

		const spans = (timeline as any).keyframeSpansByLayer?.[layerId] ?? []
		if (spans.length === 0) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		if (containsFrame(spans, fi)) {
			const snap = getLayerNodeSnapshotAt(timeline, layerId, fi)
			if (snap) {
				applySnapshotToLayer(layers, layerId, snap)
			} else {
				const { prev } = getPrevNext(spans, fi)
				if (prev != null) {
					const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
					if (prevSnap) applySnapshotToLayer(layers, layerId, prevSnap)
				}
			}
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const { prev } = getPrevNext(spans, fi)
		if (prev == null) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
		if (!prevSnap) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		// subtitles are discrete
		applySnapshotToLayer(layers, layerId, prevSnap)
		applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
	}
}

const getStageSnapshotLayersAt = (timeline: TimelineStateLike, frameIndex: number) => {
	const map = (timeline as any).stageKeyframesByFrame as Record<string, { layers: any[] }> | undefined
	if (!map) return null
	const hit = map[String(Math.floor(frameIndex))]
	return hit?.layers ?? null
}

const getStageKeyframeFrames = (timeline: TimelineStateLike) => {
	const map = (timeline as any).stageKeyframesByFrame as Record<string, { layers: any[] }> | undefined
	if (!map) return [] as number[]
	const frames = Object.keys(map)
		.map((k) => Math.floor(Number(k)))
		.filter((n) => Number.isFinite(n))
		.sort((a, b) => a - b)
	const out: number[] = []
	for (const f of frames) {
		if (out.length === 0 || out[out.length - 1] !== f) out.push(f)
	}
	return out
}

const getPrevNextStageKeyframe = (sortedFrames: number[], frameIndex: number): { prev: number | null; next: number | null } => {
	const fi = Math.floor(frameIndex)
	if (!Number.isFinite(fi) || sortedFrames.length === 0) return { prev: null, next: null }
	let lo = 0
	let hi = sortedFrames.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (sortedFrames[mid] < fi) lo = mid + 1
		else hi = mid
	}
	const next = lo < sortedFrames.length ? sortedFrames[lo] : null
	const prev = lo > 0 ? sortedFrames[lo - 1] : null
	return { prev, next }
}

const applyLegacyNodeKeyframesAtFrame = (timeline: TimelineStateLike, layers: any[], frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of timeline.layers) {
		const layerId = layer.id
		const spans = (timeline as any).keyframeSpansByLayer?.[layerId] ?? []
		if (spans.length === 0) continue

		if (containsFrame(spans, fi)) {
			const snap = getLayerNodeSnapshotAt(timeline, layerId, fi)
			if (snap) applySnapshotToLayer(layers, layerId, snap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null) continue
		const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
		if (!prevSnap) continue

		if (next == null || !(prev < fi && fi < next)) {
			applySnapshotToLayer(layers, layerId, prevSnap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = (timeline as any).easingSegmentKeys?.includes?.(segKey)
		if (!easingEnabled) {
			applySnapshotToLayer(layers, layerId, prevSnap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		const nextSnap = getLayerNodeSnapshotAt(timeline, layerId, next)
		if (!nextSnap) {
			applySnapshotToLayer(layers, layerId, prevSnap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		const rawT = (fi - prev) / (next - prev)
		const curve = (timeline as any).easingCurves?.[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		// Simple: interpolate snapshots into an overlay snapshot then apply.
		const overlay: Record<string, NodeSnapshot> = {}
		const ids = new Set<string>([...Object.keys(prevSnap), ...Object.keys(nextSnap)])
		for (const nodeId of ids) {
			const sa = prevSnap[nodeId]
			const sb = nextSnap[nodeId]
			const ta = sa?.transform as any
			const tb = sb?.transform as any
			const pa = (sa?.props ?? {}) as Record<string, any>
			const pb = (sb?.props ?? {}) as Record<string, any>
			const next: NodeSnapshot = {}
			if (ta || tb) {
				const keys = ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const
				const tt: any = {}
				for (const k of keys) {
					const va = ta ? ta[k] : undefined
					const vb = tb ? tb[k] : undefined
					if (canInterpolateNumber(va) && canInterpolateNumber(vb)) tt[k] = lerpNumber(va, vb, easedT)
					else if (vb != null) tt[k] = vb
					else if (va != null) tt[k] = va
				}
				next.transform = tt
			}
			const propKeys = new Set<string>([...Object.keys(pa), ...Object.keys(pb)])
			if (propKeys.size) {
				const tp: Record<string, any> = {}
				for (const k of propKeys) {
					const va = pa[k]
					const vb = pb[k]
					if (k === 'filters') tp[k] = interpolateFilterList(va, vb, easedT)
					else {
						const cc = interpolateColorString(va, vb, easedT)
						if (cc != null) tp[k] = cc
						else if (canInterpolateNumber(va) && canInterpolateNumber(vb)) tp[k] = lerpNumber(va, vb, easedT)
						else tp[k] = vb !== undefined ? vb : va
					}
				}
				next.props = tp
			}
			overlay[nodeId] = next
		}
		applySnapshotToLayer(layers, layerId, overlay)
		applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
	}
}

export const computeSceneStateAtFrame = (baseState: VideoSceneState, timelineState: TimelineStateLike, frameIndex: number): VideoSceneState => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return baseState

	const stageFrames = getStageKeyframeFrames(timelineState)
	if (stageFrames.length === 0) {
		const layers = cloneJsonSafe((baseState as any).layers ?? []) as any[]
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		return { ...(baseState as any), layers }
	}

	const onKeyframeLayers = getStageSnapshotLayersAt(timelineState, fi)
	if (onKeyframeLayers) {
		const layers = cloneJsonSafe(onKeyframeLayers) as any[]
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...(baseState as any), layers }
	}

	const { prev, next } = getPrevNextStageKeyframe(stageFrames, fi)
	if (prev == null) {
		if (next != null) {
			const nextLayers = getStageSnapshotLayersAt(timelineState, next)
			if (nextLayers) {
				const layers = cloneJsonSafe(nextLayers) as any[]
				applySubtitleLayersAtFrame(timelineState, layers, fi)
				return { ...(baseState as any), layers }
			}
		}
		return baseState
	}
	const prevLayers = getStageSnapshotLayersAt(timelineState, prev)
	if (!prevLayers) return baseState
	if (next == null || !(prev < fi && fi < next)) {
		const layers = cloneJsonSafe(prevLayers) as any[]
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...(baseState as any), layers }
	}
	const nextLayers = getStageSnapshotLayersAt(timelineState, next)
	if (!nextLayers) {
		const layers = cloneJsonSafe(prevLayers) as any[]
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...(baseState as any), layers }
	}

	const rawT = (fi - prev) / (next - prev)
	if (!(rawT > 0 && rawT < 1)) {
		const layers = cloneJsonSafe(prevLayers) as any[]
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...(baseState as any), layers }
	}

	const outLayers = cloneJsonSafe(prevLayers) as any[]
	const outLayerMap = new Map<string, any>()
	for (const l of outLayers) outLayerMap.set(String((l as any)?.id), l)
	const nextLayerMap = new Map<string, any>()
	for (const l of nextLayers as any[]) nextLayerMap.set(String((l as any)?.id), l)

	for (const [layerId, outLayer] of outLayerMap) {
		const nextLayer = nextLayerMap.get(layerId)
		if (!nextLayer) continue

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = (timelineState as any).easingSegmentKeys?.includes?.(segKey)
		if (!easingEnabled) continue
		const curve = (timelineState as any).easingCurves?.[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		if (!Number.isFinite(easedT)) continue

		const outIndex = new Map<string, any>()
		buildNodeIndex((outLayer as any)?.nodeTree, outIndex as any)
		const nextIndex = new Map<string, any>()
		buildNodeIndex((nextLayer as any)?.nodeTree, nextIndex as any)

		for (const [nodeId, outNode] of outIndex) {
			if (outNode.category !== 'user') continue
			const nextNode = nextIndex.get(nodeId)
			if (!nextNode || nextNode.category !== 'user') continue

			const ot = outNode.transform as any
			const nt = nextNode.transform as any
			if (ot && nt) {
				const keys = ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const
				for (const k of keys) {
					const va = ot[k]
					const vb = nt[k]
					if (canInterpolateNumber(va) && canInterpolateNumber(vb)) ot[k] = lerpNumber(va, vb, easedT)
				}
			}

			const op = (outNode.props ?? {}) as Record<string, any>
			const np = (nextNode.props ?? {}) as Record<string, any>
			const keys = Object.keys(op)
			if (keys.length === 0) continue
			for (const k of keys) {
				if (!(k in np)) continue
				const va = op[k]
				const vb = np[k]
				if (k === 'filters') {
					if (va !== undefined && vb !== undefined) {
						outNode.props = outNode.props ?? {}
						outNode.props[k] = interpolateFilterList(va, vb, easedT)
					}
				} else {
					const cc = interpolateColorString(va, vb, easedT, typeof va === 'string' && va.trim().startsWith('#') ? 'hex' : undefined)
					if (cc != null) {
						outNode.props = outNode.props ?? {}
						outNode.props[k] = cc
					} else if (canInterpolateNumber(va) && canInterpolateNumber(vb)) {
						outNode.props = outNode.props ?? {}
						outNode.props[k] = lerpNumber(va, vb, easedT)
					}
				}
			}
		}
	}

	applySubtitleLayersAtFrame(timelineState, outLayers, fi)
	return { ...(baseState as any), layers: outLayers }
}
