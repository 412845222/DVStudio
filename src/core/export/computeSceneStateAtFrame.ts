import type { VideoSceneState } from '../scene'
import { containsFrame, getPrevNext } from '../../store/timeline/spans'
import {
	canInterpolateNumber,
	cubicBezierYforX,
	lerpNumber
} from '../../ui/TimeLine/core/curveTick'
import type { CubicBezier } from '../../ui/TimeLine/core/curveTick'
import { cloneJsonSafe } from '../shared/cloneJsonSafe'
import { interpolateColorString } from '../../ui/VideoScene/anim/color'
import type { JsonValue } from '../shared/json'
import { isString, isNumber, isRecord } from '../../types/utils'

type NodeTransformLike = {
	x?: number
	y?: number
	scaleX?: number
	scaleY?: number
	scale?: number
	pivotX?: number
	pivotY?: number
	width?: number
	height?: number
	rotation?: number
	opacity?: number
}

type NodePropsLike = Record<string, JsonValue>

type NodeLike = {
	id: string
	category: string
	transform?: NodeTransformLike
	props?: NodePropsLike
	children?: NodeLike[]
}

type LayerLike = {
	id: string
	name?: string
	nodeTree?: NodeLike[]
}

type NodeSnapshot = { transform?: NodeTransformLike; props?: NodePropsLike }

type KeyframeSpanLike = {
	startFrame: number
	endFrame: number
	[key: string]: unknown
}

type SubtitleSpanLike = {
	startFrame: number
	endFrame: number
	[key: string]: unknown
}

type ProgressBarNodeIds = {
	rootId?: unknown
	playedOverlayId?: unknown
	segmentIds?: unknown
	titleIds?: unknown
	markerIds?: unknown
}

type ProgressBarStyle = {
	backgroundColor?: unknown
	borderColor?: unknown
	textColor?: unknown
	playedOverlayColor?: unknown
	playedOverlayBorderColor?: unknown
	backgroundFilters?: unknown
	segmentFilters?: unknown
	titleFilters?: unknown
	playedOverlayFilters?: unknown
	marker?: {
		shape?: unknown
		size?: unknown
		color?: unknown
		borderColor?: unknown
	}
}

type ProgressBarSpec = {
	style?: ProgressBarStyle
	nodeIds?: ProgressBarNodeIds
}

type StageKeyframeSnapshot = {
	layers: LayerLike[]
}

export type TimelineStateLike = {
	layers: LayerLike[]
	keyframeSpansByLayer: Record<string, KeyframeSpanLike[]>
	nodeKeyframesByLayer?: Record<string, Record<string, Record<string, NodeSnapshot>>>
	layerKindById?: Record<string, string>
	subtitleSpansByLayer?: Record<string, SubtitleSpanLike[]>
	subtitleTextNodeIdByLayer?: Record<string, string>
	stageKeyframesByFrame?: Record<string, StageKeyframeSnapshot>
	progressBarByLayerId?: Record<string, ProgressBarSpec>
	easingSegmentKeys: string[]
	easingCurves: Record<string, CubicBezier>
}

const makeSegmentKey = (layerId: string, startFrame: number, endFrame: number) =>
	`${layerId}:${startFrame}:${endFrame}`

const buildNodeIndex = (nodes: NodeLike[] | undefined, out: Map<string, NodeLike>) => {
	if (!nodes) return
	for (const n of nodes) {
		out.set(n.id, n)
		if (n.children?.length) buildNodeIndex(n.children, out)
	}
}

const getLayerNodeSnapshotAt = (
	timeline: TimelineStateLike,
	layerId: string,
	frameIndex: number
): Record<string, NodeSnapshot> | null => {
	const map = timeline.nodeKeyframesByLayer?.[layerId]
	if (!map) return null
	const snap = map[String(Math.floor(frameIndex))]
	return snap ?? null
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
	if (!v || typeof v !== 'object') return false
	const proto = Object.getPrototypeOf(v)
	return proto === Object.prototype || proto === null
}

const interpolateFilterList = (a: JsonValue, b: JsonValue, t: number): JsonValue => {
	if (!Array.isArray(a) || !Array.isArray(b)) return b

	const keyOf = (f: JsonValue, index: number) => {
		if (isRecord(f) && isString(f.id)) return f.id
		return String(index)
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

		const next: NodePropsLike = {}
		const keys = new Set<string>([...Object.keys(fa), ...Object.keys(fb)])
		for (const kk of keys) {
			const va = fa[kk]
			const vb = fb[kk]
			const cc = interpolateColorString(va, vb, t)
			if (cc != null) next[kk] = cc
			else if (canInterpolateNumber(va) && canInterpolateNumber(vb))
				next[kk] = lerpNumber(va, vb, t)
			else next[kk] = vb !== undefined ? vb : va
		}
		out.push(next)
	}
	return out
}

const applySnapshotToLayer = (
	layers: LayerLike[],
	layerId: string,
	snap: Record<string, NodeSnapshot>
) => {
	const layer = layers.find((l) => String(l?.id) === layerId)
	if (!layer) return
	const index = new Map<string, NodeLike>()
	buildNodeIndex(layer.nodeTree, index)

	for (const [nodeId, s] of Object.entries(snap)) {
		const node = index.get(nodeId)
		if (!node || node.category !== 'user') continue

		const targetT = s.transform
		if (targetT && typeof targetT === 'object') {
			node.transform = node.transform ?? {}
			if (isNumber(targetT.scale) && Number.isFinite(targetT.scale)) {
				const legacy = Math.max(0, Math.min(1, targetT.scale))
				if (!(isNumber(targetT.scaleX) && Number.isFinite(targetT.scaleX)))
					node.transform.scaleX = legacy
				if (!(isNumber(targetT.scaleY) && Number.isFinite(targetT.scaleY)))
					node.transform.scaleY = legacy
				node.transform.scale = legacy
			}
			const keys = ['x', 'y', 'scaleX', 'scaleY', 'width', 'height', 'rotation', 'opacity'] as const
			for (const k of keys) {
				const val = targetT[k]
				if (isNumber(val) && Number.isFinite(val)) node.transform[k] = val
			}
		}

		const targetP = s.props
		if (targetP && typeof targetP === 'object') {
			node.props = node.props ?? {}
			for (const [k, v] of Object.entries(targetP)) {
				node.props[k] = v
			}
		}
	}
}

const findNodeInLayers = (
	layers: LayerLike[],
	layerId: string,
	nodeId: string
): NodeLike | null => {
	const layer = layers.find((l) => String(l?.id) === layerId)
	if (!layer) return null
	const index = new Map<string, NodeLike>()
	buildNodeIndex(layer.nodeTree, index)
	return index.get(nodeId) ?? null
}

const applyProgressStyleFromSpecToLayers = (timeline: TimelineStateLike, layers: LayerLike[]) => {
	const map = timeline.progressBarByLayerId
	if (!map || typeof map !== 'object') return

	for (const [layerIdRaw, specRaw] of Object.entries(map)) {
		const layerId = String(layerIdRaw ?? '').trim()
		if (!layerId) continue
		const spec = specRaw && typeof specRaw === 'object' ? specRaw : null
		if (!spec) continue
		const style = spec.style ?? {}
		const nodeIds = spec.nodeIds ?? {}
		const rootId = String(nodeIds.rootId ?? '').trim()
		const playedId = String(nodeIds.playedOverlayId ?? '').trim()
		const segmentIds: string[] = Array.isArray(nodeIds.segmentIds)
			? nodeIds.segmentIds.filter(isString)
			: []
		const titleIds: string[] = Array.isArray(nodeIds.titleIds)
			? nodeIds.titleIds.filter(isString)
			: []
		const markerIds: string[] = Array.isArray(nodeIds.markerIds)
			? nodeIds.markerIds.filter(isString)
			: []

		const bg = isString(style.backgroundColor) ? style.backgroundColor : null
		const border = isString(style.borderColor) ? style.borderColor : null
		const text = isString(style.textColor) ? style.textColor : null
		const played = isString(style.playedOverlayColor) ? style.playedOverlayColor : null
		const playedBorder = isString(style.playedOverlayBorderColor)
			? style.playedOverlayBorderColor
			: null
		const bgFilters = Array.isArray(style.backgroundFilters) ? style.backgroundFilters : null
		const segFilters = Array.isArray(style.segmentFilters) ? style.segmentFilters : null
		const titleFilters = Array.isArray(style.titleFilters) ? style.titleFilters : null
		const playedFilters = Array.isArray(style.playedOverlayFilters)
			? style.playedOverlayFilters
			: null

		const patchPropsIf = (nodeId: string, patch: Record<string, JsonValue | undefined>) => {
			const id = String(nodeId ?? '').trim()
			if (!id) return
			const node = findNodeInLayers(layers, layerId, id)
			if (!node || node.category !== 'user') return
			node.props = node.props ?? {}
			for (const [k, v] of Object.entries(patch)) {
				if (v === undefined) continue
				node.props[k] = v
			}
		}

		if (rootId) {
			const rootPatch: Record<string, JsonValue | undefined> = {}
			if (bg != null) rootPatch.fillColor = bg
			if (border != null) rootPatch.borderColor = border
			if (bgFilters != null) rootPatch.filters = bgFilters
			patchPropsIf(rootId, rootPatch)
		}
		for (const id of segmentIds) {
			const segPatch: Record<string, JsonValue | undefined> = {}
			if (bg != null) segPatch.fillColor = bg
			if (border != null) segPatch.borderColor = border
			if (segFilters != null) segPatch.filters = segFilters
			patchPropsIf(id, segPatch)
		}
		for (const id of titleIds) {
			const titlePatch: Record<string, JsonValue | undefined> = {}
			if (text != null) titlePatch.fontColor = text
			if (titleFilters != null) titlePatch.filters = titleFilters
			patchPropsIf(id, titlePatch)
		}
		if (playedId) {
			const playedPatch: Record<string, JsonValue | undefined> = {
				borderWidth: 1,
				borderOpacity: 0.55
			}
			if (played != null) playedPatch.fillColor = played
			if (playedBorder != null) playedPatch.borderColor = playedBorder
			if (playedFilters != null) playedPatch.filters = playedFilters
			patchPropsIf(playedId, playedPatch)
		}

		const marker = style.marker ?? {}
		const mShape = String(marker.shape ?? 'circle') === 'square' ? 'square' : 'circle'
		const mSize = Math.max(1, Math.min(64, Math.floor(Number(marker.size ?? 6) || 6)))
		const mColor = isString(marker.color) ? marker.color : null
		const mBorder = isString(marker.borderColor) ? marker.borderColor : null
		const cr = mShape === 'circle' ? 999 : 0
		for (const id of markerIds) {
			const mid = String(id ?? '').trim()
			if (!mid) continue
			const node = findNodeInLayers(layers, layerId, mid)
			if (!node || node.category !== 'user') continue
			node.transform = node.transform ?? {}
			node.transform.width = mSize
			node.transform.height = mSize
			node.props = node.props ?? {}
			if (mColor != null) node.props.fillColor = mColor
			if (mBorder != null) node.props.borderColor = mBorder
			node.props.borderWidth = 1
			node.props.borderOpacity = 0.85
			node.props.cornerRadius = cr
		}
	}
}

const snapProgressPlayedOverlayForExport = (timeline: TimelineStateLike, layers: LayerLike[]) => {
	const map = timeline.progressBarByLayerId
	if (!map || typeof map !== 'object') return

	for (const [layerIdRaw, specRaw] of Object.entries(map)) {
		const layerId = String(layerIdRaw ?? '').trim()
		if (!layerId) continue
		const kind = timeline.layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'progress') continue
		const spec = specRaw && typeof specRaw === 'object' ? specRaw : null
		if (!spec) continue
		const playedId = String(spec?.nodeIds?.playedOverlayId ?? '').trim()
		if (!playedId) continue
		const node = findNodeInLayers(layers, layerId, playedId)
		if (!node || node.category !== 'user') continue
		node.transform = node.transform ?? {}
		const t = node.transform
		if (isNumber(t.width) && Number.isFinite(t.width)) t.width = Math.max(0, Math.round(t.width))
		if (isNumber(t.height) && Number.isFinite(t.height))
			t.height = Math.max(0, Math.round(t.height))
	}
}

const applySubtitleEmptyOutsideCue = (
	timeline: TimelineStateLike,
	layers: LayerLike[],
	layerId: string,
	frameIndex: number
) => {
	const kind = timeline.layerKindById?.[layerId] ?? 'normal'
	if (kind !== 'subtitle') return
	const spans = timeline.subtitleSpansByLayer?.[layerId] ?? []
	const inCue = containsFrame(
		spans as unknown as Parameters<typeof containsFrame>[0],
		Math.floor(frameIndex)
	)
	if (inCue) return
	const nodeId = String(timeline.subtitleTextNodeIdByLayer?.[layerId] ?? '').trim()
	if (!nodeId) return
	const node = findNodeInLayers(layers, layerId, nodeId)
	if (!node || node.category !== 'user') return
	node.props = node.props ?? {}
	if (String(node.props?.textContent ?? '') !== '') node.props.textContent = ''
}

const applySubtitleLayersAtFrame = (
	timeline: TimelineStateLike,
	layers: LayerLike[],
	frameIndex: number
) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of timeline.layers) {
		const layerId = layer.id
		const kind = timeline.layerKindById?.[layerId] ?? 'normal'
		if (kind !== 'subtitle') continue

		const spans = timeline.keyframeSpansByLayer?.[layerId] ?? []
		if (spans.length === 0) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		if (containsFrame(spans as unknown as Parameters<typeof containsFrame>[0], fi)) {
			const snap = getLayerNodeSnapshotAt(timeline, layerId, fi)
			if (snap) {
				applySnapshotToLayer(layers, layerId, snap)
			} else {
				const { prev } = getPrevNext(spans as unknown as Parameters<typeof getPrevNext>[0], fi)
				if (prev != null) {
					const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
					if (prevSnap) applySnapshotToLayer(layers, layerId, prevSnap)
				}
			}
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const { prev } = getPrevNext(spans as unknown as Parameters<typeof getPrevNext>[0], fi)
		if (prev == null) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
		if (!prevSnap) {
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}
		applySnapshotToLayer(layers, layerId, prevSnap)
		applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
	}
}

const getStageSnapshotLayersAt = (timeline: TimelineStateLike, frameIndex: number) => {
	const map = timeline.stageKeyframesByFrame
	if (!map) return null
	const hit = map[String(Math.floor(frameIndex))]
	return hit?.layers ?? null
}

const getStageKeyframeFrames = (timeline: TimelineStateLike) => {
	const map = timeline.stageKeyframesByFrame
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

const getPrevNextStageKeyframe = (
	sortedFrames: number[],
	frameIndex: number
): { prev: number | null; next: number | null } => {
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

const applyLegacyNodeKeyframesAtFrame = (
	timeline: TimelineStateLike,
	layers: LayerLike[],
	frameIndex: number
) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return

	for (const layer of timeline.layers) {
		const layerId = layer.id
		const spans = timeline.keyframeSpansByLayer?.[layerId] ?? []
		if (spans.length === 0) continue

		if (containsFrame(spans as unknown as Parameters<typeof containsFrame>[0], fi)) {
			const snap = getLayerNodeSnapshotAt(timeline, layerId, fi)
			if (snap) applySnapshotToLayer(layers, layerId, snap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const { prev, next } = getPrevNext(spans as unknown as Parameters<typeof getPrevNext>[0], fi)
		if (prev == null) continue
		const prevSnap = getLayerNodeSnapshotAt(timeline, layerId, prev)
		if (!prevSnap) continue

		if (next == null || !(prev < fi && fi < next)) {
			applySnapshotToLayer(layers, layerId, prevSnap)
			applySubtitleEmptyOutsideCue(timeline, layers, layerId, fi)
			continue
		}

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = timeline.easingSegmentKeys?.includes?.(segKey)
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
		const curve = timeline.easingCurves?.[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve, rawT)
		const overlay: Record<string, NodeSnapshot> = {}
		const ids = new Set<string>([...Object.keys(prevSnap), ...Object.keys(nextSnap)])
		for (const nodeId of ids) {
			const sa = prevSnap[nodeId]
			const sb = nextSnap[nodeId]
			const ta = sa?.transform
			const tb = sb?.transform
			const pa = sa?.props ?? {}
			const pb = sb?.props ?? {}
			const next: NodeSnapshot = {}
			if (ta || tb) {
				const keys = [
					'x',
					'y',
					'scaleX',
					'scaleY',
					'width',
					'height',
					'rotation',
					'opacity'
				] as const
				const tt: NodeTransformLike = {}
				for (const k of keys) {
					let va = ta ? ta[k] : undefined
					let vb = tb ? tb[k] : undefined
					if (k === 'scaleX') {
						if (va === undefined && ta && canInterpolateNumber(ta.scale)) va = ta.scale
						if (vb === undefined && tb && canInterpolateNumber(tb.scale)) vb = tb.scale
					}
					if (k === 'scaleY') {
						if (va === undefined && ta && canInterpolateNumber(ta.scale)) va = ta.scale
						if (vb === undefined && tb && canInterpolateNumber(tb.scale)) vb = tb.scale
					}
					if (canInterpolateNumber(va) && canInterpolateNumber(vb))
						tt[k] = lerpNumber(va, vb, easedT)
					else if (vb != null) tt[k] = vb
					else if (va != null) tt[k] = va
				}
				next.transform = tt
			}
			const propKeys = new Set<string>([...Object.keys(pa), ...Object.keys(pb)])
			if (propKeys.size) {
				const tp: NodePropsLike = {}
				for (const k of propKeys) {
					const va = pa[k]
					const vb = pb[k]
					if (k === 'filters') tp[k] = interpolateFilterList(va, vb, easedT)
					else {
						const cc = interpolateColorString(va, vb, easedT)
						if (cc != null) tp[k] = cc
						else if (canInterpolateNumber(va) && canInterpolateNumber(vb))
							tp[k] = lerpNumber(va, vb, easedT)
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

const cloneLayers = (layers: LayerLike[]): LayerLike[] => cloneJsonSafe(layers) as LayerLike[]

const buildLayerMap = (layers: LayerLike[]) => {
	const map = new Map<string, LayerLike>()
	for (const l of layers) map.set(String(l?.id), l)
	return map
}

export const computeSceneStateAtFrame = (
	baseState: VideoSceneState,
	timelineState: TimelineStateLike,
	frameIndex: number
): VideoSceneState => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return baseState

	const stageFrames = getStageKeyframeFrames(timelineState)
	if (stageFrames.length === 0) {
		const layers = cloneLayers(baseState.layers as unknown as LayerLike[])
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		applyProgressStyleFromSpecToLayers(timelineState, layers)
		snapProgressPlayedOverlayForExport(timelineState, layers)
		return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
	}

	const onKeyframeLayers = getStageSnapshotLayersAt(timelineState, fi)
	if (onKeyframeLayers) {
		const layers = cloneLayers(onKeyframeLayers)
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		applyProgressStyleFromSpecToLayers(timelineState, layers)
		snapProgressPlayedOverlayForExport(timelineState, layers)
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
	}

	const { prev, next } = getPrevNextStageKeyframe(stageFrames, fi)
	if (prev == null) {
		if (next != null) {
			const nextLayers = getStageSnapshotLayersAt(timelineState, next)
			if (nextLayers) {
				const layers = cloneLayers(nextLayers)
				applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
				applyProgressStyleFromSpecToLayers(timelineState, layers)
				snapProgressPlayedOverlayForExport(timelineState, layers)
				applySubtitleLayersAtFrame(timelineState, layers, fi)
				return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
			}
		}
		return baseState
	}
	const prevLayers = getStageSnapshotLayersAt(timelineState, prev)
	if (!prevLayers) return baseState
	if (next == null || !(prev < fi && fi < next)) {
		const layers = cloneLayers(prevLayers)
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		applyProgressStyleFromSpecToLayers(timelineState, layers)
		snapProgressPlayedOverlayForExport(timelineState, layers)
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
	}
	const nextLayers = getStageSnapshotLayersAt(timelineState, next)
	if (!nextLayers) {
		const layers = cloneLayers(prevLayers)
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		applyProgressStyleFromSpecToLayers(timelineState, layers)
		snapProgressPlayedOverlayForExport(timelineState, layers)
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
	}

	const rawT = (fi - prev) / (next - prev)
	if (!(rawT > 0 && rawT < 1)) {
		const layers = cloneLayers(prevLayers)
		applyLegacyNodeKeyframesAtFrame(timelineState, layers, fi)
		applyProgressStyleFromSpecToLayers(timelineState, layers)
		snapProgressPlayedOverlayForExport(timelineState, layers)
		applySubtitleLayersAtFrame(timelineState, layers, fi)
		return { ...baseState, layers: layers as unknown as VideoSceneState['layers'] }
	}

	const outLayers = cloneLayers(prevLayers)
	const outLayerMap = buildLayerMap(outLayers)
	const nextLayerMap = buildLayerMap(nextLayers)

	for (const [layerId, outLayer] of outLayerMap) {
		const nextLayer = nextLayerMap.get(layerId)
		if (!nextLayer) continue

		const segKey = makeSegmentKey(layerId, prev, next)
		const easingEnabled = timelineState.easingSegmentKeys?.includes?.(segKey)
		if (!easingEnabled) continue
		const curve = timelineState.easingCurves?.[segKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1 }
		const easedT = cubicBezierYforX(curve, rawT)
		if (!Number.isFinite(easedT)) continue

		const outIndex = new Map<string, NodeLike>()
		buildNodeIndex(outLayer?.nodeTree, outIndex)
		const nextIndex = new Map<string, NodeLike>()
		buildNodeIndex(nextLayer?.nodeTree, nextIndex)

		for (const [nodeId, outNode] of outIndex) {
			if (outNode.category !== 'user') continue
			const nextNode = nextIndex.get(nodeId)
			if (!nextNode || nextNode.category !== 'user') continue

			const ot = outNode.transform
			const nt = nextNode.transform
			if (ot && nt) {
				const keys = [
					'x',
					'y',
					'scaleX',
					'scaleY',
					'width',
					'height',
					'rotation',
					'opacity'
				] as const
				for (const k of keys) {
					let va = ot[k]
					let vb = nt[k]
					if (k === 'scaleX') {
						if (va === undefined && canInterpolateNumber(ot.scale)) va = ot.scale
						if (vb === undefined && canInterpolateNumber(nt.scale)) vb = nt.scale
					}
					if (k === 'scaleY') {
						if (va === undefined && canInterpolateNumber(ot.scale)) va = ot.scale
						if (vb === undefined && canInterpolateNumber(nt.scale)) vb = nt.scale
					}
					if (canInterpolateNumber(va) && canInterpolateNumber(vb))
						ot[k] = lerpNumber(va, vb, easedT)
				}
			}

			const op = outNode.props ?? {}
			const np = nextNode.props ?? {}
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
					const cc = interpolateColorString(
						va,
						vb,
						easedT,
						isString(va) && va.trim().startsWith('#') ? 'hex' : undefined
					)
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

	applyLegacyNodeKeyframesAtFrame(timelineState, outLayers, fi)
	applyProgressStyleFromSpecToLayers(timelineState, outLayers)
	snapProgressPlayedOverlayForExport(timelineState, outLayers)
	applySubtitleLayersAtFrame(timelineState, outLayers, fi)
	return { ...baseState, layers: outLayers as unknown as VideoSceneState['layers'] }
}
