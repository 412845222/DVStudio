import { TimelineStore } from '../../../store/timeline'
import { VideoSceneStore, type VideoSceneLayer, type VideoSceneNodeProps, type VideoSceneNodeTransform, type VideoSceneTreeNode } from '../../../store/videoscene'
import { containsFrame, getPrevNext } from '../../../store/timeline/spans'
import { canInterpolateNumber, cubicBezierYforX, lerpNumber, type CubicBezier } from '../../TimeLine/core/curveTick'
import { cloneJsonSafe } from '../../../core/shared/cloneJsonSafe'
import { interpolateColorString } from './color'
import type { JsonValue } from '../../../core/shared/json'
import { createVideoSceneLayer } from '../../../core/scene'
import { isObject, isString } from '../../../types/utils'

type FilterWithId = JsonValue & { id?: string }
type NodeSnapshot = { transform?: Partial<VideoSceneNodeTransform>; props?: VideoSceneNodeProps }
type ProgressBarStyle = {
	backgroundColor?: string
	borderColor?: string
	textColor?: string
	playedOverlayColor?: string
	playedOverlayBorderColor?: string
	backgroundFilters?: JsonValue[]
	segmentFilters?: JsonValue[]
	titleFilters?: JsonValue[]
	playedOverlayFilters?: JsonValue[]
	marker?: {
		shape?: string
		size?: number
		color?: string
		borderColor?: string
	}
}
type ProgressBarSpec = {
	style?: ProgressBarStyle
	nodeIds?: {
		rootId?: string
		playedOverlayId?: string
		segmentIds?: string[]
		titleIds?: string[]
		markerIds?: string[]
	}
}

const makeSegmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`

const buildNodeIndex = (nodes: VideoSceneTreeNode[] | undefined, out: Map<string, VideoSceneTreeNode>) => {
	if (!nodes) return
	for (const n of nodes) {
		out.set(n.id, n)
		if (n.children?.length) buildNodeIndex(n.children, out)
	}
}

const getLayerNodeSnapshotAt = (layerId: string, frameIndex: number): Record<string, NodeSnapshot> | null => {
	const map = TimelineStore.state.nodeKeyframesByLayer?.[layerId]
	if (!map) return null
	const snap = map[String(Math.floor(frameIndex))]
	return snap ?? null
}

const getNumeric = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const lerpAngleRad = (a: number, b: number, t: number): number => {
	// Interpolate using the shortest angular distance to avoid long-way spins across wrap boundaries.
	const twoPi = Math.PI * 2
	let d = (b - a) % twoPi
	if (d > Math.PI) d -= twoPi
	else if (d < -Math.PI) d += twoPi
	return a + d * t
}

const clamp01 = (v: unknown, fallback = 0.5): number => {
	const n = typeof v === 'number' ? v : Number(v)
	if (!Number.isFinite(n)) return fallback
	if (n < 0) return 0
	if (n > 1) return 1
	return n
}

const isPlainObject = (v: unknown): v is Record<string, JsonValue> => {
	if (!v || typeof v !== 'object') return false
	const proto = Object.getPrototypeOf(v)
	return proto === Object.prototype || proto === null
}

const isFilterWithId = (v: unknown): v is FilterWithId => {
	return isObject(v)
}

const interpolateFilterList = (a: JsonValue, b: JsonValue, t: number): JsonValue => {
	if (!Array.isArray(a) || !Array.isArray(b)) return b

	const keyOf = (f: JsonValue, index: number) => {
		const id = isFilterWithId(f) ? f.id : null
		return isString(id) && id ? id : String(index)
	}

	const mapA = new Map<string, JsonValue>()
	const mapB = new Map<string, JsonValue>()
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
			if (fa !== undefined) out.push(fa)
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

		const targetT = s.transform
		if (targetT && typeof targetT === 'object') {
			const cur = node.transform
			const patch: Partial<VideoSceneNodeTransform> = {}
			if (getNumeric(targetT.x) != null && targetT.x !== cur?.x) patch.x = targetT.x
			if (getNumeric(targetT.y) != null && targetT.y !== cur?.y) patch.y = targetT.y
			if (getNumeric(targetT.width) != null && targetT.width !== cur?.width) patch.width = targetT.width
			if (getNumeric(targetT.height) != null && targetT.height !== cur?.height) patch.height = targetT.height
			if (getNumeric(targetT.scale) != null && targetT.scale !== cur?.scale) patch.scale = targetT.scale
			if (getNumeric(targetT.scaleX) != null && targetT.scaleX !== cur?.scaleX) patch.scaleX = targetT.scaleX
			if (getNumeric(targetT.scaleY) != null && targetT.scaleY !== cur?.scaleY) patch.scaleY = targetT.scaleY
			if (getNumeric(targetT.rotation) != null && targetT.rotation !== cur?.rotation) patch.rotation = targetT.rotation
			if (getNumeric(targetT.opacity) != null && targetT.opacity !== cur?.opacity) patch.opacity = targetT.opacity
			if (getNumeric(targetT.pivotX) != null && clamp01(targetT.pivotX) !== clamp01(cur?.pivotX)) patch.pivotX = clamp01(targetT.pivotX)
			if (getNumeric(targetT.pivotY) != null && clamp01(targetT.pivotY) !== clamp01(cur?.pivotY)) patch.pivotY = clamp01(targetT.pivotY)
			if (Object.keys(patch).length) VideoSceneStore.dispatch('updateNodeTransform', { layerId, nodeId, patch })
		}

		const targetP = s.props
		if (targetP && typeof targetP === 'object') {
			const curP = node.props ?? {}
			const patch: VideoSceneNodeProps = {}
			for (const [k, v] of Object.entries(targetP)) {
				if (curP[k] !== v) patch[k] = v
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
		const ta = sa?.transform
		const tb = sb?.transform
		const pa = sa?.props ?? {}
		const pb = sb?.props ?? {}

		const next: NodeSnapshot = {}
		if (ta || tb) {
			const tt: Partial<VideoSceneNodeTransform> = {}
			const numKeys = ['x', 'y', 'width', 'height', 'opacity', 'scale', 'scaleX', 'scaleY'] as const
			for (const k of numKeys) {
				const va = ta ? ta[k] : undefined
				const vb = tb ? tb[k] : undefined
				const na = getNumeric(va)
				const nb = getNumeric(vb)
				if (na != null && nb != null) tt[k] = lerpNumber(na, nb, t)
				else if (nb != null) tt[k] = nb
				else if (na != null) tt[k] = na
			}
			const ra = ta ? getNumeric(ta.rotation) : null
			const rb = tb ? getNumeric(tb.rotation) : null
			if (ra != null && rb != null) tt.rotation = lerpAngleRad(ra, rb, t)
			else if (rb != null) tt.rotation = rb
			else if (ra != null) tt.rotation = ra
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
			const tp: VideoSceneNodeProps = {}
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
	const spec = TimelineStore.state.progressBarByLayerId?.[layerId] as ProgressBarSpec | undefined
	if (!spec) return
	const style = spec.style ?? {}
	const nodeIds = spec.nodeIds ?? {}
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

	const patchPropsIf = (nodeId: string, patch: VideoSceneNodeProps) => {
		const id = String(nodeId ?? '').trim()
		if (!id) return
		const node = findNodeInLayer(layerId, id)
		if (!node || node.category !== 'user') return
		const cur = node.props ?? {}
		const out: VideoSceneNodeProps = {}
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) continue
			if (cur[k] !== v) out[k] = v
		}
		if (Object.keys(out).length) VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId: id, patch: out })
	}

	if (rootId) {
		const patch: VideoSceneNodeProps = {}
		if (bg) patch.fillColor = bg
		if (border) patch.borderColor = border
		if (bgFilters) patch.filters = bgFilters
		patchPropsIf(rootId, patch)
	}
	for (const id of segmentIds) {
		const patch: VideoSceneNodeProps = {}
		if (bg) patch.fillColor = bg
		if (border) patch.borderColor = border
		if (segFilters) patch.filters = segFilters
		patchPropsIf(id, patch)
	}
	for (const id of titleIds) {
		const patch: VideoSceneNodeProps = {}
		if (text) patch.fontColor = text
		if (titleFilters) patch.filters = titleFilters
		patchPropsIf(id, patch)
	}
	if (playedId) {
		const patch: VideoSceneNodeProps = { borderWidth: 1, borderOpacity: 0.55 }
		if (played) patch.fillColor = played
		if (playedBorder) patch.borderColor = playedBorder
		if (playedFilters) patch.filters = playedFilters
		patchPropsIf(playedId, patch)
	}

	const marker = style.marker ?? {}
	const mShape = String(marker.shape ?? 'circle') === 'square' ? 'square' : 'circle'
	const mSize = Math.max(1, Math.min(64, Math.floor(Number(marker.size ?? 6))))
	const mColor = typeof marker.color === 'string' ? marker.color : null
	const mBorder = typeof marker.borderColor === 'string' ? marker.borderColor : null
	const cr = mShape === 'circle' ? 999 : 0
	for (const id of markerIds) {
		const mid = String(id ?? '').trim()
		if (!mid) continue
		VideoSceneStore.dispatch('updateNodeTransform', { layerId, nodeId: mid, patch: { width: mSize, height: mSize } })
		const patch: VideoSceneNodeProps = { borderWidth: 1, borderOpacity: 0.85, cornerRadius: cr }
		if (mColor) patch.fillColor = mColor
		if (mBorder) patch.borderColor = mBorder
		patchPropsIf(mid, patch)
	}
}

const applySubtitleEmptyOutsideCue = (layerId: string, frameIndex: number) => {
	const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
	if (kind !== 'subtitle') return
	const spans = TimelineStore.state.subtitleSpansByLayer?.[layerId] ?? []
	const inCue = containsFrame(spans, Math.floor(frameIndex))
	if (inCue) return
	const nodeId = String(TimelineStore.state.subtitleTextNodeIdByLayer?.[layerId] ?? '').trim()
	if (!nodeId) return
	const node = findNodeInLayer(layerId, nodeId)
	if (!node || node.category !== 'user') return
	const cur = node.props?.textContent
	if (String(cur ?? '') !== '') {
		VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId, patch: { textContent: '' } })
	}
}

const getLayerStageSnapshotAt = (layerId: string, frameIndex: number) => {
	const map = TimelineStore.state.stageKeyframesByFrame as Record<string, { layers: VideoSceneLayer[] }> | undefined
	if (!map) return null
	const hit = map[String(Math.floor(frameIndex))]
	const layers = Array.isArray(hit?.layers) ? hit!.layers : null
	if (!layers) return null
	const found = layers.find((l) => String(l?.id ?? '') === layerId)
	return found ?? null
}

const applyNormalLayerAtFrame = (layerId: string, frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	const spans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
	if (!spans.length) return

	const resetToBaseline = () => {
		const name = TimelineStore.state.layers.find((l) => l.id === layerId)?.name ?? layerId
		const base = createVideoSceneLayer(layerId, name)
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(base)] })
	}

	if (containsFrame(spans, fi)) {
		const snapLayer = getLayerStageSnapshotAt(layerId, fi)
		if (snapLayer) {
			VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(snapLayer)] })
		} else {
			const { prev } = getPrevNext(spans, fi)
			if (prev != null) {
				const prevLayer = getLayerStageSnapshotAt(layerId, prev)
				if (prevLayer) VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
				else resetToBaseline()
			} else {
				resetToBaseline()
			}
		}
		return
	}

	const { prev, next } = getPrevNext(spans, fi)
	if (prev == null) {
		resetToBaseline()
		return
	}
	const prevLayer = getLayerStageSnapshotAt(layerId, prev)
	if (!prevLayer) {
		resetToBaseline()
		return
	}

	if (next == null) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
		return
	}
	if (!(prev < fi && fi < next)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
		return
	}

	const segKey = makeSegmentKey(layerId, prev, next)
	const easingEnabled = TimelineStore.state.easingSegmentKeys.includes(segKey)
	if (!easingEnabled) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
		return
	}

	const nextLayer = getLayerStageSnapshotAt(layerId, next)
	if (!nextLayer) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
		return
	}

	const rawT = (fi - prev) / (next - prev)
	const curve = TimelineStore.state.easingCurves[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
	const easedT = cubicBezierYforX(curve as CubicBezier, rawT)
	if (!(easedT > 0 && easedT < 1)) {
		VideoSceneStore.dispatch('applyStageSnapshot', { layers: [cloneJsonSafe(prevLayer)] })
		return
	}

	const outLayer = cloneJsonSafe(prevLayer)
	const outIndex = new Map<string, VideoSceneTreeNode>()
	buildNodeIndex(outLayer?.nodeTree, outIndex)
	const nextIndex = new Map<string, VideoSceneTreeNode>()
	buildNodeIndex(nextLayer?.nodeTree, nextIndex)

	for (const [nodeId, outNode] of outIndex) {
		if (outNode.category !== 'user') continue
		const n2 = nextIndex.get(nodeId)
		if (!n2 || n2.category !== 'user') continue

		const ot = outNode.transform
		const nt = n2.transform
		if (ot && nt) {
			const numKeys = ['x', 'y', 'width', 'height', 'opacity', 'scale', 'scaleX', 'scaleY'] as const
			for (const k of numKeys) {
				const va = ot[k]
				const vb = nt[k]
				if (canInterpolateNumber(va) && canInterpolateNumber(vb)) ot[k] = lerpNumber(va, vb, easedT)
			}
			const ra = ot.rotation
			const rb = nt.rotation
			if (canInterpolateNumber(ra) && canInterpolateNumber(rb)) ot.rotation = lerpAngleRad(ra, rb, easedT)
			if (canInterpolateNumber(ot.pivotX) || canInterpolateNumber(nt.pivotX)) ot.pivotX = easedT >= 1 ? clamp01(nt.pivotX, clamp01(ot.pivotX, 0.5)) : clamp01(ot.pivotX, 0.5)
			if (canInterpolateNumber(ot.pivotY) || canInterpolateNumber(nt.pivotY)) ot.pivotY = easedT >= 1 ? clamp01(nt.pivotY, clamp01(ot.pivotY, 0.5)) : clamp01(ot.pivotY, 0.5)
		}

		const op = outNode.props ?? {}
		const np = n2.props ?? {}
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

	VideoSceneStore.dispatch('applyStageSnapshot', { layers: [outLayer] })
}

const applySubtitleLayersAtFrame = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
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
		const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'progress') return
		const spec = TimelineStore.state.progressBarByLayerId?.[layerId] as ProgressBarSpec | undefined
		if (!spec) return
		const playedId = String(spec?.nodeIds?.playedOverlayId ?? '').trim()
		if (!playedId) return
		const node = findNodeInLayer(layerId, playedId)
		if (!node || node.category !== 'user') return
		const t = node.transform
		if (t) {
			if (typeof t.width === 'number' && Number.isFinite(t.width)) t.width = Math.max(0, Math.round(t.width))
			if (typeof t.height === 'number' && Number.isFinite(t.height)) t.height = Math.max(0, Math.round(t.height))
		}
	}

	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
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
		const easedT = cubicBezierYforX(curve as CubicBezier, rawT)
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
		const easedT = cubicBezierYforX(curve as CubicBezier, rawT)
		const snap = interpolateSnapshots(prevSnap, nextSnap, easedT)
		applySnapshotToLayer(layerId, snap)
		applySubtitleEmptyOutsideCue(layerId, fi)
	}
}

export const applyTimelineAnimationAtFrame = (frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	// Normal layers: per-layer keyframe rules (hold-left to the right; left side unaffected).
	for (const layer of TimelineStore.state.layers) {
		const layerId = layer.id
		const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'normal') continue
		applyNormalLayerAtFrame(layerId, fi)
	}

	// Special layers: keep existing behavior.
	applySubtitleLayersAtFrame(fi)
	applyProgressLayersAtFrame(fi)
}
