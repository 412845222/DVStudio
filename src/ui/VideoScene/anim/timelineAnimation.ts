import { TimelineStore } from '../../../store/timeline'
import { VideoSceneStore, type VideoSceneTreeNode } from '../../../store/videoscene'
import { containsFrame, getPrevNext } from '../../../store/timeline/spans'
import { canInterpolateNumber, cubicBezierYforX, lerpNumber } from '../../TimeLine/core/curveTick'
import { cloneJsonSafe } from '../../../core/shared/cloneJsonSafe'
import { interpolateColorString } from './color'
import type { JsonValue } from '../../../core/shared/json'

type NodeSnapshot = { transform?: any; props?: Record<string, any> }

const makeSegmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`

const buildNodeIndex = (nodes: VideoSceneTreeNode[] | undefined, out: Map<string, VideoSceneTreeNode>) => {
	if (!nodes) return
	for (const n of nodes) {
		out.set(n.id, n)
		if (n.children?.length) buildNodeIndex(n.children, out)
	}
}

const getLayerNodeSnapshotAt = (layerId: string, frameIndex: number): Record<string, NodeSnapshot> | null => {
	const map = (TimelineStore.state as any).nodeKeyframesByLayer?.[layerId]
	if (!map) return null
	const snap = map[String(Math.floor(frameIndex))]
	return snap ?? null
}

const getNumeric = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

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

		// 同类型滤镜：对同名数值/颜色字段做 lerp；其它字段跟随 b
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

const applySnapshotToLayer = (layerId: string, snap: Record<string, NodeSnapshot>) => {
	const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
	if (!layer) return
	const index = new Map<string, VideoSceneTreeNode>()
	buildNodeIndex(layer.nodeTree, index)

	for (const [nodeId, s] of Object.entries(snap)) {
		const node = index.get(nodeId)
		if (!node || node.category !== 'user') continue

		const targetT = s.transform as any
		if (targetT && typeof targetT === 'object') {
			const cur = node.transform
			const patch: any = {}
			if (getNumeric(targetT.x) != null && targetT.x !== cur?.x) patch.x = targetT.x
			if (getNumeric(targetT.y) != null && targetT.y !== cur?.y) patch.y = targetT.y
			if (getNumeric(targetT.width) != null && targetT.width !== cur?.width) patch.width = targetT.width
			if (getNumeric(targetT.height) != null && targetT.height !== cur?.height) patch.height = targetT.height
			if (getNumeric(targetT.rotation) != null && (targetT.rotation as any) !== (cur as any)?.rotation) patch.rotation = targetT.rotation
			if (getNumeric(targetT.opacity) != null && (targetT.opacity as any) !== (cur as any)?.opacity) patch.opacity = targetT.opacity
			if (Object.keys(patch).length) VideoSceneStore.dispatch('updateNodeTransform', { layerId, nodeId, patch })
		}

		const targetP = s.props
		if (targetP && typeof targetP === 'object') {
			const curP = node.props ?? {}
			const patch: Record<string, any> = {}
			for (const [k, v] of Object.entries(targetP)) {
				if ((curP as any)[k] !== v) patch[k] = v
			}
			if (Object.keys(patch).length) VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId, patch })
		}
	}
}

const interpolateSnapshots = (a: Record<string, NodeSnapshot>, b: Record<string, NodeSnapshot>, t: number): Record<string, NodeSnapshot> => {
	const out: Record<string, NodeSnapshot> = {}
	const ids = new Set<string>([...Object.keys(a), ...Object.keys(b)])
	for (const nodeId of ids) {
		const sa = a[nodeId]
		const sb = b[nodeId]
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
				const na = getNumeric(va)
				const nb = getNumeric(vb)
				if (na != null && nb != null) tt[k] = lerpNumber(na, nb, t)
				else if (nb != null) tt[k] = nb
				else if (na != null) tt[k] = na
			}
			next.transform = tt
		}

		const propKeys = new Set<string>([...Object.keys(pa), ...Object.keys(pb)])
		if (propKeys.size) {
			const tp: Record<string, any> = {}
			for (const k of propKeys) {
				const va = pa[k]
				const vb = pb[k]
				if (k === 'filters') tp[k] = interpolateFilterList(va, vb, t)
				else if (k === 'lineStyle') tp[k] = va !== undefined ? va : vb
				else {
					const cc = interpolateColorString(va, vb, t)
					if (cc != null) tp[k] = cc
					else if (canInterpolateNumber(va) && canInterpolateNumber(vb)) tp[k] = lerpNumber(va, vb, t)
					else tp[k] = vb !== undefined ? vb : va
				}
			}
			next.props = tp
		}

		out[nodeId] = next
	}
	return out
}

const getStageSnapshotLayersAt = (frameIndex: number) => {
	const map = (TimelineStore.state as any).stageKeyframesByFrame as Record<string, { layers: any[] }> | undefined
	if (!map) return null
	const hit = map[String(Math.floor(frameIndex))]
	return hit?.layers ?? null
}

const getStageKeyframeFrames = () => {
	const map = (TimelineStore.state as any).stageKeyframesByFrame as Record<string, { layers: any[] }> | undefined
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

const applyTimelineAnimationAtFrameLegacy = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const spans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
		if (spans.length === 0) continue

		if (containsFrame(spans, fi)) {
			const snap = getLayerNodeSnapshotAt(layerId, fi)
			if (snap) applySnapshotToLayer(layerId, snap)
			continue
		}

		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null) continue
		const prevSnap = getLayerNodeSnapshotAt(layerId, prev)
		if (!prevSnap) continue

		if (next == null) {
			applySnapshotToLayer(layerId, prevSnap)
			continue
		}
		if (!(prev < fi && fi < next)) {
			applySnapshotToLayer(layerId, prevSnap)
			continue
		}

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = TimelineStore.state.easingSegmentKeys.includes(segKey)
		if (!easingEnabled) {
			applySnapshotToLayer(layerId, prevSnap)
			continue
		}
		const nextSnap = getLayerNodeSnapshotAt(layerId, next)
		if (!nextSnap) {
			applySnapshotToLayer(layerId, prevSnap)
			continue
		}

		const rawT = (fi - prev) / (next - prev)
		const curve = TimelineStore.state.easingCurves[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		const snap = interpolateSnapshots(prevSnap, nextSnap, easedT)
		applySnapshotToLayer(layerId, snap)
	}
}

export const applyTimelineAnimationAtFrame = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	const stageFrames = getStageKeyframeFrames()
	if (stageFrames.length === 0) {
		applyTimelineAnimationAtFrameLegacy(frameIndex)
		return
	}

	const onKeyframeLayers = getStageSnapshotLayersAt(fi)
	if (onKeyframeLayers) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(onKeyframeLayers) })
		return
	}

	const { prev, next } = getPrevNextStageKeyframe(stageFrames, fi)
	if (prev == null) return
	const prevLayers = getStageSnapshotLayersAt(prev)
	if (!prevLayers) return
	if (next == null) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		return
	}
	if (!(prev < fi && fi < next)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		return
	}
	const nextLayers = getStageSnapshotLayersAt(next)
	if (!nextLayers) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		return
	}

	const rawT = (fi - prev) / (next - prev)
	if (!(rawT > 0 && rawT < 1)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		return
	}

	const outLayers = cloneJsonSafe(prevLayers) as any[]
	const outLayerMap = new Map<string, any>()
	for (const l of outLayers) outLayerMap.set(String(l?.id), l)
	const nextLayerMap = new Map<string, any>()
	for (const l of nextLayers as any[]) nextLayerMap.set(String(l?.id), l)

	for (const [layerId, outLayer] of outLayerMap) {
		const nextLayer = nextLayerMap.get(layerId)
		if (!nextLayer) continue

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = TimelineStore.state.easingSegmentKeys.includes(segKey)
		if (!easingEnabled) continue
		const curve = TimelineStore.state.easingCurves[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		if (!Number.isFinite(easedT)) continue

		const outIndex = new Map<string, VideoSceneTreeNode>()
		buildNodeIndex(outLayer?.nodeTree, outIndex)
		const nextIndex = new Map<string, VideoSceneTreeNode>()
		buildNodeIndex(nextLayer?.nodeTree, nextIndex)

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
					const cc = interpolateColorString(va, vb, easedT, (typeof va === 'string' && va.trim().startsWith('#')) ? 'hex' : undefined)
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

	VideoSceneStore.dispatch('applyStageSnapshot', { layers: outLayers })
}
