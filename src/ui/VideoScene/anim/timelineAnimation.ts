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

const clamp01 = (v: unknown, fallback = 0.5): number => {
	const n = typeof v === 'number' ? v : Number(v)
	if (!Number.isFinite(n)) return fallback
	if (n < 0) return 0
	if (n > 1) return 1
	return n
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
			if (getNumeric((targetT as any).pivotX) != null && clamp01((targetT as any).pivotX) !== clamp01((cur as any)?.pivotX)) patch.pivotX = clamp01((targetT as any).pivotX)
			if (getNumeric((targetT as any).pivotY) != null && clamp01((targetT as any).pivotY) !== clamp01((cur as any)?.pivotY)) patch.pivotY = clamp01((targetT as any).pivotY)
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
			// pivot 是离散属性：关键帧之间保持上一关键帧，达到下一关键帧才切换
			const apx = ta ? getNumeric(ta.pivotX) : null
			const apy = ta ? getNumeric(ta.pivotY) : null
			const bpx = tb ? getNumeric(tb.pivotX) : null
			const bpy = tb ? getNumeric(tb.pivotY) : null
			if (apx != null || bpx != null) tt.pivotX = t >= 1 ? clamp01(bpx, clamp01(apx, 0.5)) : clamp01(apx, 0.5)
			if (apy != null || bpy != null) tt.pivotY = t >= 1 ? clamp01(bpy, clamp01(apy, 0.5)) : clamp01(apy, 0.5)
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
					else {
						// Discrete fallback (strings/enums/objects): hold previous until reaching next keyframe.
						if (vb === undefined) tp[k] = va
						else if (va === undefined) tp[k] = vb
						else tp[k] = t >= 1 ? vb : va
					}
				}
			}
			next.props = tp
		}

		out[nodeId] = next
	}
	return out
}

const findNodeInLayer = (layerId: string, nodeId: string): VideoSceneTreeNode | null => {
	const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
	if (!layer) return null
	const index = new Map<string, VideoSceneTreeNode>()
	buildNodeIndex(layer.nodeTree, index)
	return index.get(nodeId) ?? null
}

const applyProgressStyleFromSpec = (layerId: string) => {
	const spec = (TimelineStore.state as any).progressBarByLayerId?.[layerId]
	if (!spec) return
	const style = (spec as any).style ?? {}
	const nodeIds = (spec as any).nodeIds ?? {}
	const rootId = String(nodeIds.rootId ?? '').trim()
	const playedId = String(nodeIds.playedOverlayId ?? '').trim()
	const segmentIds: string[] = Array.isArray(nodeIds.segmentIds) ? nodeIds.segmentIds : []
	const titleIds: string[] = Array.isArray(nodeIds.titleIds) ? nodeIds.titleIds : []
	const markerIds: string[] = Array.isArray(nodeIds.markerIds) ? nodeIds.markerIds : []

	const bg = typeof style.backgroundColor === 'string' ? style.backgroundColor : null
	const border = typeof style.borderColor === 'string' ? style.borderColor : null
	const text = typeof style.textColor === 'string' ? style.textColor : null
	const played = typeof style.playedOverlayColor === 'string' ? style.playedOverlayColor : null
	const playedBorder = typeof style.playedOverlayBorderColor === 'string' ? style.playedOverlayBorderColor : null
	const bgFilters = Array.isArray(style.backgroundFilters) ? style.backgroundFilters : null
	const segFilters = Array.isArray(style.segmentFilters) ? style.segmentFilters : null
	const titleFilters = Array.isArray(style.titleFilters) ? style.titleFilters : null
	const playedFilters = Array.isArray(style.playedOverlayFilters) ? style.playedOverlayFilters : null

	const patchPropsIf = (nodeId: string, patch: Record<string, any>) => {
		const id = String(nodeId ?? '').trim()
		if (!id) return
		const node = findNodeInLayer(layerId, id)
		if (!node || node.category !== 'user') return
		const cur = (node.props ?? {}) as any
		const out: Record<string, any> = {}
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) continue
			if ((cur as any)[k] !== v) out[k] = v
		}
		if (Object.keys(out).length) VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId: id, patch: out })
	}

	if (rootId) patchPropsIf(rootId, { fillColor: bg ?? undefined, borderColor: border ?? undefined, filters: bgFilters ?? undefined })
	for (const id of segmentIds) patchPropsIf(id, { fillColor: bg ?? undefined, borderColor: border ?? undefined, filters: segFilters ?? undefined })
	for (const id of titleIds) patchPropsIf(id, { fontColor: text ?? undefined, filters: titleFilters ?? undefined })
	if (playedId) {
		patchPropsIf(playedId, {
			fillColor: played ?? undefined,
			borderColor: playedBorder ?? undefined,
			borderWidth: 1,
			borderOpacity: 0.55,
			filters: playedFilters ?? undefined,
		})
	}

	// marker style
	const marker = (style as any).marker ?? {}
	const mShape = String(marker.shape ?? 'circle') === 'square' ? 'square' : 'circle'
	const mSize = Math.max(1, Math.min(64, Math.floor(Number(marker.size ?? 6))))
	const mColor = typeof marker.color === 'string' ? marker.color : null
	const mBorder = typeof marker.borderColor === 'string' ? marker.borderColor : null
	const cr = mShape === 'circle' ? 999 : 0
	for (const id of markerIds) {
		const mid = String(id ?? '').trim()
		if (!mid) continue
		VideoSceneStore.dispatch('updateNodeTransform', { layerId, nodeId: mid, patch: { width: mSize, height: mSize } })
		patchPropsIf(mid, { fillColor: mColor ?? undefined, borderColor: mBorder ?? undefined, borderWidth: 1, borderOpacity: 0.85, cornerRadius: cr })
	}
}

const applySubtitleEmptyOutsideCue = (layerId: string, frameIndex: number) => {
	const kind = (TimelineStore.state as any).layerKindById?.[layerId] ?? 'normal'
	if (kind !== 'subtitle') return
	const spans = (TimelineStore.state as any).subtitleSpansByLayer?.[layerId] ?? []
	const inCue = containsFrame(spans, Math.floor(frameIndex))
	if (inCue) return
	const nodeId = String((TimelineStore.state as any).subtitleTextNodeIdByLayer?.[layerId] ?? '').trim()
	if (!nodeId) return
	const node = findNodeInLayer(layerId, nodeId)
	if (!node || node.category !== 'user') return
	const cur = (node.props as any)?.textContent
	if (String(cur ?? '') !== '') {
		VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId, patch: { textContent: '' } })
	}
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

const applySubtitleLayersAtFrame = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const kind = (TimelineStore.state as any).layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'subtitle') continue

		const spans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
		if (spans.length === 0) {
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		if (containsFrame(spans, fi)) {
			const snap = getLayerNodeSnapshotAt(layerId, fi)
			if (snap) {
				applySnapshotToLayer(layerId, snap)
			} else {
				// Subtitles can have manually added keyframes (spans) without corresponding node snapshots.
				// In that case, hold the previous subtitle snapshot instead of blanking text.
				const { prev } = getPrevNext(spans, fi)
				if (prev != null) {
					const prevSnap = getLayerNodeSnapshotAt(layerId, prev)
					if (prevSnap) applySnapshotToLayer(layerId, prevSnap)
				}
			}
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null) {
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}
		const prevSnap = getLayerNodeSnapshotAt(layerId, prev)
		if (!prevSnap) {
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		if (next == null) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}
		if (!(prev < fi && fi < next)) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		// Subtitles are discrete by nature; keep previous snapshot until next keyframe.
		applySnapshotToLayer(layerId, prevSnap)
		applySubtitleEmptyOutsideCue(layerId, fi)
	}
}

const applyProgressLayersAtFrame = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	const snapPlayedOverlayTransform = (layerId: string) => {
		const kind = (TimelineStore.state as any).layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'progress') return
		const spec = (TimelineStore.state as any).progressBarByLayerId?.[layerId]
		if (!spec) return
		const playedId = String((spec as any)?.nodeIds?.playedOverlayId ?? '').trim()
		if (!playedId) return
		const node = findNodeInLayer(layerId, playedId)
		if (!node || node.category !== 'user') return
		const t = (node.transform ?? {}) as any
		// This overlay is designed to grow left->right with pivotX=0.
		// Quantize to whole pixels to prevent subpixel shimmer in glow/blur.
		if (typeof t.width === 'number' && Number.isFinite(t.width)) t.width = Math.max(0, Math.round(t.width))
		if (typeof t.height === 'number' && Number.isFinite(t.height)) t.height = Math.max(0, Math.round(t.height))
	}

	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const kind = (TimelineStore.state as any).layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'progress') continue

		const spans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
		if (spans.length === 0) continue

		if (containsFrame(spans, fi)) {
			const snap = getLayerNodeSnapshotAt(layerId, fi)
			if (snap) {
				applySnapshotToLayer(layerId, snap)
				applyProgressStyleFromSpec(layerId)
				snapPlayedOverlayTransform(layerId)
			}
			continue
		}

		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null) continue
		const prevSnap = getLayerNodeSnapshotAt(layerId, prev)
		if (!prevSnap) continue

		if (next == null) {
			applySnapshotToLayer(layerId, prevSnap)
			applyProgressStyleFromSpec(layerId)
			snapPlayedOverlayTransform(layerId)
			continue
		}
		if (!(prev < fi && fi < next)) {
			applySnapshotToLayer(layerId, prevSnap)
			applyProgressStyleFromSpec(layerId)
			snapPlayedOverlayTransform(layerId)
			continue
		}

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = TimelineStore.state.easingSegmentKeys.includes(segKey)
		if (!easingEnabled) {
			applySnapshotToLayer(layerId, prevSnap)
			applyProgressStyleFromSpec(layerId)
			snapPlayedOverlayTransform(layerId)
			continue
		}
		const nextSnap = getLayerNodeSnapshotAt(layerId, next)
		if (!nextSnap) {
			applySnapshotToLayer(layerId, prevSnap)
			applyProgressStyleFromSpec(layerId)
			snapPlayedOverlayTransform(layerId)
			continue
		}

		const rawT = (fi - prev) / (next - prev)
		const curve = TimelineStore.state.easingCurves[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		const snap = interpolateSnapshots(prevSnap, nextSnap, easedT)
		applySnapshotToLayer(layerId, snap)
		applyProgressStyleFromSpec(layerId)
		snapPlayedOverlayTransform(layerId)
		continue
	}

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
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null) continue
		const prevSnap = getLayerNodeSnapshotAt(layerId, prev)
		if (!prevSnap) continue

		if (next == null) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}
		if (!(prev < fi && fi < next)) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = TimelineStore.state.easingSegmentKeys.includes(segKey)
		if (!easingEnabled) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}
		const nextSnap = getLayerNodeSnapshotAt(layerId, next)
		if (!nextSnap) {
			applySnapshotToLayer(layerId, prevSnap)
			applySubtitleEmptyOutsideCue(layerId, fi)
			continue
		}

		const rawT = (fi - prev) / (next - prev)
		const curve = TimelineStore.state.easingCurves[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve as any, rawT)
		const snap = interpolateSnapshots(prevSnap, nextSnap, easedT)
		applySnapshotToLayer(layerId, snap)
		applySubtitleEmptyOutsideCue(layerId, fi)
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
		applySubtitleLayersAtFrame(fi)
		applyProgressLayersAtFrame(fi)
		return
	}

	const { prev, next } = getPrevNextStageKeyframe(stageFrames, fi)
	if (prev == null) {
		// Before the first stage keyframe: hold the first snapshot so the stage is deterministic,
		// then re-apply subtitle keyframes (textContent is stripped from stage snapshots).
		if (next != null) {
			const nextLayers = getStageSnapshotLayersAt(next)
			if (nextLayers) VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(nextLayers) })
			applySubtitleLayersAtFrame(fi)
			applyProgressLayersAtFrame(fi)
		}
		return
	}
	const prevLayers = getStageSnapshotLayersAt(prev)
	if (!prevLayers) return
	if (next == null) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		applySubtitleLayersAtFrame(fi)
		applyProgressLayersAtFrame(fi)
		return
	}
	if (!(prev < fi && fi < next)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		applySubtitleLayersAtFrame(fi)
		applyProgressLayersAtFrame(fi)
		return
	}
	const nextLayers = getStageSnapshotLayersAt(next)
	if (!nextLayers) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		applySubtitleLayersAtFrame(fi)
		applyProgressLayersAtFrame(fi)
		return
	}

	const rawT = (fi - prev) / (next - prev)
	if (!(rawT > 0 && rawT < 1)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: cloneJsonSafe(prevLayers) })
		applySubtitleLayersAtFrame(fi)
		applyProgressLayersAtFrame(fi)
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
				// pivot: discrete hold
				if (canInterpolateNumber(ot.pivotX) || canInterpolateNumber(nt.pivotX)) ot.pivotX = easedT >= 1 ? clamp01(nt.pivotX, clamp01(ot.pivotX, 0.5)) : clamp01(ot.pivotX, 0.5)
				if (canInterpolateNumber(ot.pivotY) || canInterpolateNumber(nt.pivotY)) ot.pivotY = easedT >= 1 ? clamp01(nt.pivotY, clamp01(ot.pivotY, 0.5)) : clamp01(ot.pivotY, 0.5)
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
	applySubtitleLayersAtFrame(fi)
	applyProgressLayersAtFrame(fi)
}
