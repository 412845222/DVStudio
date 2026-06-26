import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

import {
	addRange,
	clipSpans,
	containsFrame,
	normalizeSpans,
	removeRange,
	toggleRange,
	type TimelineFrameSpan
} from './spans'

import type {
	VideoSceneLayer,
	VideoSceneNodeProps,
	VideoSceneNodeTransform,
	VideoSceneTreeNode
} from '../videoscene'

import type {
	SubtitleCue,
	SubtitleCueRange,
	SubtitleTextStyle,
	AudioTrack,
	ProgressBarSpec,
	ProgressBarStyle,
	TimelineCellKey,
	TimelineLayer,
	TimelineLayerKind,
	TimelineState
} from '../../core/timeline'

import { createDefaultTimelineState } from '../../core/timeline'
import { cloneJsonSafe } from '../../core/shared/cloneJsonSafe'
import { createVideoSceneLayer } from '../../core/scene'
import { VideoSceneStore } from '../videoscene'
import { isString, isNumber } from '../../types/utils'

type StageSnapshotEntry = { layers: VideoSceneLayer[] }
type NodeKeyframeSnapshot = { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }
type NodeKeyframeLayerMap = TimelineState['nodeKeyframesByLayer'][string]
type NodeKeyframeFrameMap = NodeKeyframeLayerMap[string]

export type {
	SubtitleCue,
	SubtitleCueRange,
	SubtitleTextStyle,
	AudioTrack,
	TimelineCellKey,
	TimelineLayer,
	TimelineLayerKind,
	TimelineState
} from '../../core/timeline'

const clampInt = (v: unknown, min: number, max: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const uniq = (arr: string[]) => Array.from(new Set(arr))

const cellKey = (layerId: string, frameIndex: number): TimelineCellKey => `${layerId}:${frameIndex}`
const parseLayerIdFromKey = (key: TimelineCellKey) => key.split(':', 1)[0]

const segmentKey = (layerId: string, startFrame: number, endFrame: number) =>
	`${layerId}:${startFrame}:${endFrame}`
const parseSegment = (
	key: string
): { layerId: string; startFrame: number; endFrame: number } | null => {
	const parts = key.split(':')
	if (parts.length !== 3) return null
	const layerId = parts[0]
	const startFrame = Math.floor(Number(parts[1]))
	const endFrame = Math.floor(Number(parts[2]))
	if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) return null
	return { layerId, startFrame, endFrame }
}

const clamp01 = (v: unknown) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(1, n))
}

const clampFrameWidth = (v: unknown) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return 8
	// allow ultra-zoom-out for very long timelines
	// max zoom-in should be limited to keep tick labels and cells readable
	const clamped = Math.max(0.0001, Math.min(15, n))
	// keep more precision when zoomed out; avoid quantizing away the ability to fit full duration
	const digits = clamped < 1 ? 4 : 2
	const pow = Math.pow(10, digits)
	return Math.round(clamped * pow) / pow
}

const stageSnapshotsEnsureLayer = (
	state: TimelineState,
	payload: { layerId: string; name: string }
) => {
	const layerId = String(payload.layerId || '').trim()
	if (!layerId) return false
	const name = String(payload.name || '').trim() || layerId
	let changed = false
	const map = state.stageKeyframesByFrame
	if (!map) return false
	for (const [fk, v] of Object.entries(map)) {
		const entry = v
		const layers = Array.isArray(entry?.layers) ? entry.layers : null
		if (!layers) continue
		if (layers.some((l) => String(l?.id) === layerId)) continue
		layers.push({ id: layerId, name, nodeTree: createVideoSceneLayer(layerId, name).nodeTree })
		changed = true
		map[fk] = { ...(entry ?? {}), layers }
	}
	return changed
}

const stageSnapshotsPurgeLayers = (state: TimelineState, layerIds: string[]) => {
	const ids = new Set(layerIds.map((s) => String(s || '').trim()).filter(Boolean))
	if (ids.size === 0) return false
	const map = state.stageKeyframesByFrame
	if (!map) return false
	let changed = false
	for (const [fk, v] of Object.entries(map)) {
		const entry = v
		const layers = Array.isArray(entry?.layers) ? entry.layers : null
		if (!layers) continue
		const nextLayers = layers.filter((l) => !ids.has(String(l?.id ?? '')))
		if (nextLayers.length === layers.length) continue

		changed = true
		if (nextLayers.length === 0) {
			delete map[fk]
			continue
		}

		map[fk] = { ...(entry ?? {}), layers: nextLayers }
	}
	return changed
}

const updateNodeTextContentInTree = (
	nodes: VideoSceneTreeNode[] | undefined,
	nodeId: string,
	textContent: string
): { nodes: VideoSceneTreeNode[]; changed: boolean } => {
	if (!Array.isArray(nodes) || nodes.length === 0)
		return { nodes: Array.isArray(nodes) ? nodes : [], changed: false }
	let changed = false
	const nextNodes = nodes.map((node) => {
		if (!node || typeof node !== 'object') return node
		let nextNode = node
		if (String(node.id ?? '') === nodeId) {
			const props = (node.props ?? {}) as Record<string, unknown>
			if (String(props.textContent ?? '') !== textContent) {
				nextNode = {
					...node,
					props: {
						...props,
						textContent
					}
				}
				changed = true
			}
		}
		if (Array.isArray(nextNode.children) && nextNode.children.length) {
			const childRes = updateNodeTextContentInTree(nextNode.children, nodeId, textContent)
			if (childRes.changed) {
				nextNode = { ...nextNode, children: childRes.nodes }
				changed = true
			}
		}
		return nextNode
	})
	return { nodes: changed ? nextNodes : nodes, changed }
}

const normalizeSubtitleStyle = (
	s: Partial<SubtitleTextStyle> | null | undefined
): SubtitleTextStyle => {
	const raw: Record<string, unknown> = s ?? {}
	const rawSize = raw.fontSize
	const fontSize = isNumber(rawSize)
		? rawSize
		: Number.isFinite(Number(rawSize))
			? Number(rawSize)
			: 36
	const rawFontColor = raw.fontColor
	const fontColor = isString(rawFontColor) ? rawFontColor : '#ffffff'
	const rawFontStyle = raw.fontStyle
	const fontStyle = isString(rawFontStyle) ? rawFontStyle : 'normal'
	const rawTextAlign = raw.textAlign
	const textAlign =
		rawTextAlign === 'left' || rawTextAlign === 'right' || rawTextAlign === 'center'
			? rawTextAlign
			: 'center'
	return {
		fontSize: clampInt(fontSize, 6, 256),
		fontColor,
		fontStyle,
		textAlign
	}
}

const mergeSubtitleStyle = (
	base: SubtitleTextStyle,
	override?: Partial<SubtitleTextStyle> | null
): SubtitleTextStyle => {
	if (!override) return base
	return normalizeSubtitleStyle({ ...base, ...override })
}

const defaultEasingCurve = () => ({ x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' })

const frameKey = (frameIndex: number) => String(Math.floor(frameIndex))

const purgeTreeNodesById = (
	root: VideoSceneTreeNode[] | undefined,
	ids: Set<string>
): { nodes: VideoSceneTreeNode[]; changed: boolean } => {
	const src = Array.isArray(root) ? root : []
	let changed = false
	const out: VideoSceneTreeNode[] = []
	for (const n of src) {
		if (!n || typeof n !== 'object') continue
		const id = String(n.id ?? '')
		if (id && ids.has(id)) {
			changed = true
			continue
		}
		const children = n.children
		if (Array.isArray(children) && children.length) {
			const r = purgeTreeNodesById(children, ids)
			if (r.changed) {
				changed = true
				out.push({ ...n, children: r.nodes })
			} else {
				out.push(n)
			}
		} else {
			out.push(n)
		}
	}
	return { nodes: out, changed }
}

// cloneJsonSafe moved to core/shared for reuse.

const getLayerSpans = (map: Record<string, TimelineFrameSpan[]>, layerId: string) =>
	map[layerId] ?? []
const setLayerSpans = (
	map: Record<string, TimelineFrameSpan[]>,
	layerId: string,
	spans: TimelineFrameSpan[]
) => {
	map[layerId] = normalizeSpans(spans)
}

const isKeyframeAt = (state: TimelineState, layerId: string, frameIndex: number) => {
	const spans = getLayerSpans(state.keyframeSpansByLayer, layerId)
	return containsFrame(spans, frameIndex)
}

const isAnyKeyframeAt = (state: TimelineState, frameIndex: number) => {
	for (const spans of Object.values(state.keyframeSpansByLayer)) {
		if (containsFrame(spans ?? [], frameIndex)) return true
	}
	return false
}

const defaultLayerKind: TimelineLayerKind = 'normal'
const layerKindOf = (state: TimelineState, layerId: string): TimelineLayerKind => {
	return (state.layerKindById?.[layerId] as TimelineLayerKind) ?? defaultLayerKind
}

export const TimelineKey: InjectionKey<Store<TimelineState>> = Symbol('TimelineStore')

export const TimelineStore = createStore<TimelineState>({
	state: createDefaultTimelineState,
	mutations: {
		setUiFocus(state: TimelineState, payload: { focus: 'timeline' | 'stage' | null }) {
			const f = payload?.focus ?? null
			if (f !== 'timeline' && f !== 'stage' && f !== null) return
			state.uiFocus = f
		},
		setLayerKind(state: TimelineState, payload: { layerId: string; kind: TimelineLayerKind }) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const kind = payload.kind
			if (kind !== 'normal' && kind !== 'subtitle' && kind !== 'progress' && kind !== 'audio')
				return
			state.layerKindById[layerId] = kind
		},
		setFps(state: TimelineState, payload: { fps: number }) {
			state.fps = clampInt(payload.fps, 1, 240)
		},

		setFrameCount(state: TimelineState, payload: { frameCount: number }) {
			const next = Math.max(1, Math.floor(Number(payload.frameCount) || 1))
			state.frameCount = next
			if (state.currentFrame > next - 1) state.currentFrame = next - 1

			// 裁剪 selection spans（移除越界帧）
			const nextSel: Record<string, TimelineFrameSpan[]> = {}
			for (const [layerId, spans] of Object.entries(state.selectedSpansByLayer)) {
				const clipped = clipSpans(spans, 0, next - 1)
				if (clipped.length) nextSel[layerId] = clipped
			}
			state.selectedSpansByLayer = nextSel

			state.selectionVersion++

			// lastSelectedCellKey 也需要裁剪
			if (state.lastSelectedCellKey) {
				const parts = state.lastSelectedCellKey.split(':')
				if (parts.length === 2) {
					const layerId = parts[0]
					const frame = clampInt(parts[1], 0, next - 1)
					state.lastSelectedCellKey = cellKey(layerId, frame)
				} else {
					state.lastSelectedCellKey = null
				}
			}

			// 裁剪关键帧 spans（移除越界帧）
			const nextKf: Record<string, TimelineFrameSpan[]> = {}
			for (const [layerId, spans] of Object.entries(state.keyframeSpansByLayer)) {
				const clipped = clipSpans(spans, 0, next - 1)
				if (clipped.length) nextKf[layerId] = clipped
			}
			state.keyframeSpansByLayer = nextKf
			state.keyframeVersion++

			// 裁剪节点关键帧快照（移除越界帧）
			const nextNodeKf: TimelineState['nodeKeyframesByLayer'] = {}
			for (const [layerId, map] of Object.entries(state.nodeKeyframesByLayer)) {
				const out: Record<
					string,
					Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
				> = {}
				for (const [k, v] of Object.entries(map)) {
					const fi = Math.floor(Number(k))
					if (!Number.isFinite(fi)) continue
					if (fi < 0 || fi > next - 1) continue
					out[String(fi)] = v
				}
				if (Object.keys(out).length) nextNodeKf[layerId] = out
			}
			state.nodeKeyframesByLayer = nextNodeKf
			state.nodeKeyframeVersion++

			// 裁剪舞台关键帧快照（移除越界帧）
			const nextStage: TimelineState['stageKeyframesByFrame'] = {}
			for (const [k, v] of Object.entries(state.stageKeyframesByFrame)) {
				const fi = Math.floor(Number(k))
				if (!Number.isFinite(fi)) continue
				if (fi < 0 || fi > next - 1) continue
				nextStage[String(fi)] = v
			}
			state.stageKeyframesByFrame = nextStage
			state.stageKeyframeVersion++

			// 裁剪缓动段：
			// 1) start/end 需要在范围内
			// 2) start < end
			// 3) start/end 必须仍然是关键帧（否则段无意义）
			const nextSegs: string[] = []
			for (const k of state.easingSegmentKeys) {
				const seg = parseSegment(k)
				if (!seg) continue
				const startFrame = clampInt(seg.startFrame, 0, next - 1)
				const endFrame = clampInt(seg.endFrame, 0, next - 1)
				if (!(startFrame < endFrame)) continue
				if (!isKeyframeAt(state, seg.layerId, startFrame)) continue
				if (!isKeyframeAt(state, seg.layerId, endFrame)) continue
				nextSegs.push(segmentKey(seg.layerId, startFrame, endFrame))
			}
			state.easingSegmentKeys = uniq(nextSegs)

			// 同步裁剪曲线：只保留仍存在的段
			const nextCurveMap: TimelineState['easingCurves'] = {}
			for (const k of state.easingSegmentKeys) {
				nextCurveMap[k] = state.easingCurves[k] ?? defaultEasingCurve()
			}
			state.easingCurves = nextCurveMap

			// 裁剪字幕 spans（移除越界帧）
			const nextSub: Record<string, TimelineFrameSpan[]> = {}
			for (const [layerId, spans] of Object.entries(state.subtitleSpansByLayer ?? {})) {
				const clipped = clipSpans(spans ?? [], 0, next - 1)
				if (clipped.length) nextSub[layerId] = clipped
			}
			state.subtitleSpansByLayer = nextSub

			// 裁剪字幕 cueRanges（移除越界段）
			const nextRanges: Record<string, SubtitleCueRange[]> = {}
			for (const [layerId, ranges] of Object.entries(state.subtitleCueRangesByLayer ?? {})) {
				const list = Array.isArray(ranges) ? ranges : []
				const out: SubtitleCueRange[] = []
				for (const r of list) {
					const a = clampInt(r?.startFrame, 0, next - 1)
					const b = clampInt(r?.endFrame, 0, next - 1)
					if (a <= b) out.push({ startFrame: a, endFrame: b })
				}
				if (out.length) nextRanges[layerId] = out
			}
			state.subtitleCueRangesByLayer = nextRanges
			state.subtitleVersion++
		},
		setCurrentFrame(state: TimelineState, payload: { frameIndex: number }) {
			state.currentFrame = clampInt(payload.frameIndex, 0, state.frameCount - 1)
		},
		jumpToFrameCentered(state: TimelineState, payload: { frameIndex: number }) {
			const fi = clampInt(payload.frameIndex, 0, state.frameCount - 1)
			state.currentFrame = fi
			state.uiJumpToFrame = fi
			state.uiJumpVersion++
		},
		setFrameWidth(state: TimelineState, payload: { frameWidth: number }) {
			// 更大范围缩放：允许足够小以容纳超长时间轴，也允许更大以便精细编辑
			state.frameWidth = clampFrameWidth(payload.frameWidth)
		},
		addLayer(state: TimelineState) {
			const nextIndex = state.layers.length + 1
			const layer: TimelineLayer = {
				id: `layer-${Date.now()}-${nextIndex}`,
				name: `图层${nextIndex}`
			}
			state.layers.push(layer)
			state.layerKindById[layer.id] = 'normal'
			state.selectedLayerIds = [layer.id]
		},
		addSubtitleLayer(state: TimelineState, payload?: { name?: string }) {
			const subtitleCount = state.layers.filter(
				(l) => layerKindOf(state, l.id) === 'subtitle'
			).length
			const nextIndex = subtitleCount + 1
			const layer: TimelineLayer = {
				id: `layer-${Date.now()}-subtitle-${nextIndex}`,
				name: String(payload?.name || '').trim() || `字幕${nextIndex}`
			}
			state.layers.push(layer)
			state.layerKindById[layer.id] = 'subtitle'
			state.selectedLayerIds = [layer.id]
		},
		addAudioLayer(state: TimelineState, payload?: { name?: string }) {
			const audioCount = state.layers.filter((l) => layerKindOf(state, l.id) === 'audio').length
			const nextIndex = audioCount + 1
			const layer: TimelineLayer = {
				id: `layer-${Date.now()}-audio-${nextIndex}`,
				name: String(payload?.name || '').trim() || `音频${nextIndex}`
			}
			state.layers.push(layer)
			state.layerKindById[layer.id] = 'audio'
			state.selectedLayerIds = [layer.id]
		},

		// Ensure all recorded stage snapshots contain this layer so applying older keyframes
		// won't wipe newly created layers.
		ensureStageSnapshotsContainLayer(
			state: TimelineState,
			payload: { layerId: string; name: string }
		) {
			// NOTE: Previously we injected the new layer into ALL old stage snapshots to avoid
			// wiping it when applying older snapshots. After switching `applyStageSnapshot` to
			// merge-by-layerId, this is no longer needed.
			// Keeping the old injection logic would actually be harmful: injected empty nodeTree
			// can overwrite the real content of that layer when old snapshots are applied.
			void payload
		},
		renameLayer(state: TimelineState, payload: { layerId: string; name: string }) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const name = String(payload.name || '').trim()
			if (!name) return
			const layer = state.layers.find((l) => l.id === layerId)
			if (!layer) return
			layer.name = name
		},
		removeLayer(state: TimelineState, payload: { layerId: string }) {
			const idx = state.layers.findIndex((l) => l.id === payload.layerId)
			if (idx < 0) return
			state.layers.splice(idx, 1)
			if (state.layerKindById[payload.layerId]) delete state.layerKindById[payload.layerId]
			if (state.audioByLayerId?.[payload.layerId]) {
				delete state.audioByLayerId[payload.layerId]
				state.audioVersion = (state.audioVersion ?? 0) + 1
			}
			if (state.progressBarByLayerId?.[payload.layerId]) {
				delete state.progressBarByLayerId[payload.layerId]
				state.progressVersion = (state.progressVersion ?? 0) + 1
			}
			state.selectedLayerIds = state.selectedLayerIds.filter((id) => id !== payload.layerId)
			if (state.selectedSpansByLayer[payload.layerId]) {
				delete state.selectedSpansByLayer[payload.layerId]
				state.selectionVersion++
			}

			if (
				state.lastSelectedCellKey &&
				parseLayerIdFromKey(state.lastSelectedCellKey) === payload.layerId
			) {
				state.lastSelectedCellKey = null
			}

			if (state.keyframeSpansByLayer[payload.layerId]) {
				delete state.keyframeSpansByLayer[payload.layerId]
				state.keyframeVersion++
			}
			let subtitleChanged = false
			if (state.subtitleSpansByLayer?.[payload.layerId]) {
				delete state.subtitleSpansByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleCuesByLayer?.[payload.layerId]) {
				delete state.subtitleCuesByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleCueRangesByLayer?.[payload.layerId]) {
				delete state.subtitleCueRangesByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleFpsByLayer?.[payload.layerId]) {
				delete state.subtitleFpsByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleTextNodeIdByLayer?.[payload.layerId]) {
				delete state.subtitleTextNodeIdByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleDefaultStyleByLayer?.[payload.layerId]) {
				delete state.subtitleDefaultStyleByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (state.subtitleOverrideStyleByLayer?.[payload.layerId]) {
				delete state.subtitleOverrideStyleByLayer[payload.layerId]
				subtitleChanged = true
			}
			if (subtitleChanged) state.subtitleVersion++
			if (state.nodeKeyframesByLayer[payload.layerId]) {
				delete state.nodeKeyframesByLayer[payload.layerId]
				state.nodeKeyframeVersion++
			}

			// Deleting a layer must also purge it from stage snapshots,
			// otherwise playback/seek may re-apply old snapshots and resurrect the layer.
			if (stageSnapshotsPurgeLayers(state, [payload.layerId])) state.stageKeyframeVersion++

			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				return !seg ? false : seg.layerId !== payload.layerId
			})
			for (const k of Object.keys(state.easingCurves)) {
				const seg = parseSegment(k)
				if (seg && seg.layerId === payload.layerId) delete state.easingCurves[k]
			}
		},
		removeSelectedLayers(state: TimelineState) {
			const toRemove = new Set(state.selectedLayerIds)
			if (toRemove.size === 0) return
			state.layers = state.layers.filter((l) => !toRemove.has(l.id))
			state.selectedLayerIds = []
			for (const layerId of toRemove) {
				if (state.layerKindById[layerId]) delete state.layerKindById[layerId]
			}
			let selChanged = false
			for (const layerId of toRemove) {
				if (state.selectedSpansByLayer[layerId]) {
					delete state.selectedSpansByLayer[layerId]
					selChanged = true
				}
			}
			if (selChanged) state.selectionVersion++

			if (
				state.lastSelectedCellKey &&
				toRemove.has(parseLayerIdFromKey(state.lastSelectedCellKey))
			) {
				state.lastSelectedCellKey = null
			}

			let subtitleChanged = false
			for (const layerId of toRemove) {
				if (state.subtitleSpansByLayer?.[layerId]) {
					delete state.subtitleSpansByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleCuesByLayer?.[layerId]) {
					delete state.subtitleCuesByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleCueRangesByLayer?.[layerId]) {
					delete state.subtitleCueRangesByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleFpsByLayer?.[layerId]) {
					delete state.subtitleFpsByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleTextNodeIdByLayer?.[layerId]) {
					delete state.subtitleTextNodeIdByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleDefaultStyleByLayer?.[layerId]) {
					delete state.subtitleDefaultStyleByLayer[layerId]
					subtitleChanged = true
				}
				if (state.subtitleOverrideStyleByLayer?.[layerId]) {
					delete state.subtitleOverrideStyleByLayer[layerId]
					subtitleChanged = true
				}
			}
			if (subtitleChanged) state.subtitleVersion++

			let kfChanged = false
			for (const layerId of toRemove) {
				if (state.keyframeSpansByLayer[layerId]) {
					delete state.keyframeSpansByLayer[layerId]
					kfChanged = true
				}
			}
			if (kfChanged) state.keyframeVersion++

			let nodeKfChanged = false
			for (const layerId of toRemove) {
				if (state.nodeKeyframesByLayer[layerId]) {
					delete state.nodeKeyframesByLayer[layerId]
					nodeKfChanged = true
				}
			}
			if (nodeKfChanged) state.nodeKeyframeVersion++
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				return !seg ? false : !toRemove.has(seg.layerId)
			})
			for (const k of Object.keys(state.easingCurves)) {
				const seg = parseSegment(k)
				if (seg && toRemove.has(seg.layerId)) delete state.easingCurves[k]
			}

			// Also purge removed layers from stage snapshots to avoid resurrecting them during playback.
			if (stageSnapshotsPurgeLayers(state, Array.from(toRemove))) state.stageKeyframeVersion++
		},
		selectLayer(state: TimelineState, payload: { layerId: string; additive?: boolean }) {
			if (payload.additive) {
				state.selectedLayerIds = uniq([...state.selectedLayerIds, payload.layerId])
			} else {
				state.selectedLayerIds = [payload.layerId]
			}
		},
		clearSelection(state: TimelineState) {
			state.selectedSpansByLayer = {}
			state.selectionVersion++
			state.lastSelectedCellKey = null
		},
		toggleCellSelection(
			state: TimelineState,
			payload: { layerId: string; frameIndex: number; additive?: boolean }
		) {
			const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
			const key = cellKey(payload.layerId, frameIndex)

			if (!payload.additive) {
				state.selectedSpansByLayer = { [payload.layerId]: [frameIndex] }
				state.selectionVersion++
				state.selectedLayerIds = [payload.layerId]
				state.lastSelectedCellKey = key
				return
			}

			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.selectedSpansByLayer }
			const before = getLayerSpans(nextMap, payload.layerId)
			const next = containsFrame(before, frameIndex)
				? removeRange(before, frameIndex, frameIndex)
				: addRange(before, frameIndex, frameIndex)
			if (next.length) nextMap[payload.layerId] = next
			else delete nextMap[payload.layerId]
			state.selectedSpansByLayer = nextMap
			state.selectionVersion++
			state.selectedLayerIds = uniq([payload.layerId, ...state.selectedLayerIds])
			state.lastSelectedCellKey = key
		},
		addRangeSelection(
			state: TimelineState,
			payload: { layerIds: string[]; startFrame: number; endFrame: number; additive?: boolean }
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const layerIds = uniq(payload.layerIds)

			const nextMap: Record<string, TimelineFrameSpan[]> = payload.additive
				? { ...state.selectedSpansByLayer }
				: {}
			for (const layerId of layerIds) {
				const before = getLayerSpans(nextMap, layerId)
				nextMap[layerId] = addRange(before, a, b)
			}
			state.selectedSpansByLayer = nextMap
			state.selectionVersion++
			state.selectedLayerIds = payload.additive
				? uniq([...state.selectedLayerIds, ...layerIds])
				: layerIds

			// 约定：范围选择的 lastSelected 取 endFrame（更贴近用户拖拽方向）
			if (layerIds.length) state.lastSelectedCellKey = cellKey(layerIds[0], b)
		},

		// --- 关键帧 ---
		addKeyframe(state: TimelineState, payload: { layerId: string; frameIndex: number }) {
			const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
			// const key = cellKey(payload.layerId, frameIndex)
			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.keyframeSpansByLayer }
			const beforeSpans = getLayerSpans(nextMap, payload.layerId)
			if (containsFrame(beforeSpans, frameIndex)) return
			setLayerSpans(nextMap, payload.layerId, addRange(beforeSpans, frameIndex, frameIndex))
			state.keyframeSpansByLayer = nextMap
			state.keyframeVersion++

			// 若该帧已不再是“任何图层”的关键帧，则移除全画布快照
			const fk2 = frameKey(frameIndex)
			if (!isAnyKeyframeAt(state, frameIndex) && state.stageKeyframesByFrame[fk2]) {
				delete state.stageKeyframesByFrame[fk2]
				state.stageKeyframeVersion++
			}
			// 新增关键帧会“切段”：移除该层中被插入点切开的缓动段
			const beforeSegs = state.easingSegmentKeys
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				if (!seg) return false
				if (seg.layerId !== payload.layerId) return true
				return !(seg.startFrame < frameIndex && frameIndex < seg.endFrame)
			})
			for (const k of beforeSegs) {
				if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
			}
		},
		removeKeyframe(state: TimelineState, payload: { layerId: string; frameIndex: number }) {
			const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
			// const key = cellKey(payload.layerId, frameIndex)
			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.keyframeSpansByLayer }
			const beforeSpans = getLayerSpans(nextMap, payload.layerId)
			if (!containsFrame(beforeSpans, frameIndex)) return
			const nextSpans = removeRange(beforeSpans, frameIndex, frameIndex)
			if (nextSpans.length) nextMap[payload.layerId] = nextSpans
			else delete nextMap[payload.layerId]
			state.keyframeSpansByLayer = nextMap
			state.keyframeVersion++

			// 若区间内帧已不再是“任何图层”的关键帧，则移除对应全画布快照
			const fk2 = frameKey(frameIndex)
			if (!isAnyKeyframeAt(state, frameIndex) && state.stageKeyframesByFrame[fk2]) {
				delete state.stageKeyframesByFrame[fk2]
				state.stageKeyframeVersion++
			}

			// 同步删除节点快照
			const fk = frameKey(frameIndex)
			const layerMap = state.nodeKeyframesByLayer[payload.layerId]
			if (layerMap && layerMap[fk]) {
				const nextNodeMap = { ...state.nodeKeyframesByLayer }
				const nextLayerMap = { ...layerMap }
				delete nextLayerMap[fk]
				if (Object.keys(nextLayerMap).length) nextNodeMap[payload.layerId] = nextLayerMap
				else delete nextNodeMap[payload.layerId]
				state.nodeKeyframesByLayer = nextNodeMap
				state.nodeKeyframeVersion++
			}
			// 删除关键帧会导致相邻段变化：移除引用该关键帧的缓动段
			const beforeSegs = state.easingSegmentKeys
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				if (!seg) return false
				if (seg.layerId !== payload.layerId) return true
				return !(seg.startFrame === frameIndex || seg.endFrame === frameIndex)
			})
			for (const k of beforeSegs) {
				if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
			}
		},

		// --- 缓动（段） ---
		enableEasingSegment(
			state: TimelineState,
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			const startFrame = clampInt(payload.startFrame, 0, state.frameCount - 1)
			const endFrame = clampInt(payload.endFrame, 0, state.frameCount - 1)
			if (!(startFrame < endFrame)) return
			// 段两端必须是关键帧
			if (!isKeyframeAt(state, payload.layerId, startFrame)) return
			if (!isKeyframeAt(state, payload.layerId, endFrame)) return
			const key = segmentKey(payload.layerId, startFrame, endFrame)
			if (state.easingSegmentKeys.includes(key)) return
			state.easingSegmentKeys = [...state.easingSegmentKeys, key]
			if (!state.easingCurves[key]) state.easingCurves[key] = defaultEasingCurve()
		},
		disableEasingSegment(
			state: TimelineState,
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			const startFrame = clampInt(payload.startFrame, 0, state.frameCount - 1)
			const endFrame = clampInt(payload.endFrame, 0, state.frameCount - 1)
			const key = segmentKey(payload.layerId, startFrame, endFrame)
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => k !== key)
			delete state.easingCurves[key]
		},

		setEasingCurve(
			state: TimelineState,
			payload: {
				segmentKey: string
				curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }
			}
		) {
			if (!state.easingSegmentKeys.includes(payload.segmentKey)) return
			state.easingCurves[payload.segmentKey] = {
				x1: clamp01(payload.curve.x1),
				y1: clamp01(payload.curve.y1),
				x2: clamp01(payload.curve.x2),
				y2: clamp01(payload.curve.y2),
				preset: payload.curve.preset
			}
		},

		setProgressBarSpec(state: TimelineState, payload: { layerId: string; spec: ProgressBarSpec }) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			if (!payload.spec || typeof payload.spec !== 'object') return
			state.progressBarByLayerId[layerId] = payload.spec
			state.progressVersion = (state.progressVersion ?? 0) + 1
		},

		setAudioTrack(state: TimelineState, payload: { layerId: string; track: AudioTrack }) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const track = payload.track
			if (!track || typeof track !== 'object') return
			if (typeof track.objectUrl !== 'string' || !track.objectUrl.trim()) return
			if (typeof track.fileName !== 'string') return
			if (!Number.isFinite(Number(track.durationSec))) return
			if (!Number.isFinite(Number(track.pointsPerSecond))) return
			if (!Array.isArray(track.peaks)) return
			state.audioByLayerId[layerId] = track
			state.audioVersion = (state.audioVersion ?? 0) + 1
		},

		updateProgressBarStyle(
			state: TimelineState,
			payload: { layerId: string; style: Partial<ProgressBarStyle> }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const map = state.progressBarByLayerId as Record<string, ProgressBarSpec>
			const prev = map?.[layerId]
			if (!prev) return
			const next: ProgressBarSpec = { ...prev, style: { ...prev.style, ...payload.style } }
			map[layerId] = next
			state.progressVersion = (state.progressVersion ?? 0) + 1
		},

		updateProgressBarSegments(
			state: TimelineState,
			payload: { layerId: string; segments: ProgressBarSpec['segments'] }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const map = state.progressBarByLayerId as Record<string, ProgressBarSpec>
			const prev = map?.[layerId]
			if (!prev) return
			const segments = Array.isArray(payload.segments) ? payload.segments : []
			const next: ProgressBarSpec = { ...prev, segments }
			map[layerId] = next
			state.progressVersion = (state.progressVersion ?? 0) + 1
		},

		// --- 选择：按范围 toggle（用于合并段整体选择） ---
		toggleRangeSelection(
			state: TimelineState,
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.selectedSpansByLayer }
			const before = getLayerSpans(nextMap, payload.layerId)
			const next = toggleRange(before, a, b)
			if (next.length) nextMap[payload.layerId] = next
			else delete nextMap[payload.layerId]
			state.selectedSpansByLayer = nextMap
			state.selectionVersion++
			state.selectedLayerIds = uniq([payload.layerId, ...state.selectedLayerIds])
			state.lastSelectedCellKey = cellKey(payload.layerId, b)
		},

		// --- 关键帧：范围 ---
		addKeyframeRange(
			state: TimelineState,
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.keyframeSpansByLayer }
			const before = getLayerSpans(nextMap, payload.layerId)
			const next = addRange(before, a, b)
			if (next.length) nextMap[payload.layerId] = next
			else delete nextMap[payload.layerId]
			state.keyframeSpansByLayer = nextMap
			state.keyframeVersion++

			// 关键帧新增可能切段：凡是段内出现新关键帧，则移除该段
			const beforeSegs = state.easingSegmentKeys
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				if (!seg) return false
				if (seg.layerId !== payload.layerId) return true
				// 只要 [a,b] 与 (seg.start, seg.end) 有交集，就会切段
				const innerStart = seg.startFrame + 1
				const innerEnd = seg.endFrame - 1
				if (innerStart > innerEnd) return true
				return !(a <= innerEnd && b >= innerStart)
			})
			for (const k of beforeSegs) {
				if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
			}
		},
		removeKeyframeRange(
			state: TimelineState,
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const nextMap: Record<string, TimelineFrameSpan[]> = { ...state.keyframeSpansByLayer }
			const before = getLayerSpans(nextMap, payload.layerId)
			const next = removeRange(before, a, b)
			if (next.length) nextMap[payload.layerId] = next
			else delete nextMap[payload.layerId]
			state.keyframeSpansByLayer = nextMap
			state.keyframeVersion++

			// 若区间内帧已不再是“任何图层”的关键帧，则移除对应全画布快照
			let removedStage = false
			for (let f = a; f <= b; f++) {
				if (isAnyKeyframeAt(state, f)) continue
				const k = frameKey(f)
				if (state.stageKeyframesByFrame[k]) {
					delete state.stageKeyframesByFrame[k]
					removedStage = true
				}
			}
			if (removedStage) state.stageKeyframeVersion++

			// 同步删除节点快照
			const layerMap = state.nodeKeyframesByLayer[payload.layerId]
			if (layerMap) {
				const nextNodeMap = { ...state.nodeKeyframesByLayer }
				const nextLayerMap = { ...layerMap }
				for (let f = a; f <= b; f++) {
					delete nextLayerMap[frameKey(f)]
				}
				if (Object.keys(nextLayerMap).length) nextNodeMap[payload.layerId] = nextLayerMap
				else delete nextNodeMap[payload.layerId]
				state.nodeKeyframesByLayer = nextNodeMap
				state.nodeKeyframeVersion++
			}

			// 关键帧删除会使端点不再成立：移除引用被删除关键帧的缓动段（端点必须是关键帧）
			const beforeSegs = state.easingSegmentKeys
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				if (!seg) return false
				if (seg.layerId !== payload.layerId) return true
				if (!isKeyframeAt(state, seg.layerId, seg.startFrame)) return false
				if (!isKeyframeAt(state, seg.layerId, seg.endFrame)) return false
				return true
			})
			for (const k of beforeSegs) {
				if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
			}
		},

		// --- 舞台节点关键帧快照 ---
		setNodeKeyframeSnapshotRange(
			state: TimelineState,
			payload: {
				layerId: string
				startFrame: number
				endFrame: number
				nodesById: Record<
					string,
					{ transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }
				>
			}
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			if (b < a) return
			const nodesById = cloneJsonSafe(payload.nodesById ?? {})
			const nextMap: TimelineState['nodeKeyframesByLayer'] = { ...state.nodeKeyframesByLayer }
			const layerMap = { ...(nextMap[payload.layerId] ?? {}) }
			for (let f = a; f <= b; f++) {
				// 内存优先：只允许在“确实是关键帧”的格子记录快照；普通帧/过渡帧不落数据
				if (!isKeyframeAt(state, payload.layerId, f)) continue
				layerMap[frameKey(f)] = nodesById
			}
			nextMap[payload.layerId] = layerMap
			state.nodeKeyframesByLayer = nextMap
			state.nodeKeyframeVersion++
		},

		// --- 舞台关键帧快照（全画布） ---
		setStageKeyframeSnapshotRange(
			state: TimelineState,
			payload: { startFrame: number; endFrame: number; layers: VideoSceneLayer[] }
		) {
			const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
			if (b < a) return

			// IMPORTANT: Stage snapshots are treated as *per-layer* snapshots.
			// - Only layers that are keyframes at this frame are recorded.
			// - Multiple layers can share the same frame; we MERGE by layerId instead of overwriting.
			const incoming: VideoSceneLayer[] = cloneJsonSafe(payload.layers ?? [])
			let changed = false
			for (let f = a; f <= b; f++) {
				const fk = frameKey(f)
				const entry = state.stageKeyframesByFrame[fk]
				const beforeLayers = Array.isArray(entry?.layers) ? entry.layers : []
				let nextLayers = beforeLayers
				let frameChanged = false

				for (const layer of incoming) {
					const layerId = String(layer?.id ?? '').trim()

					if (!layerId) continue
					// Only record for frames where THIS layer is a keyframe.
					if (!isKeyframeAt(state, layerId, f)) continue

					if (nextLayers === beforeLayers) nextLayers = beforeLayers.slice()

					// Replace existing entry (and dedupe any accidental duplicates).
					const firstIdx = nextLayers.findIndex((x) => String(x?.id ?? '') === layerId)
					if (firstIdx >= 0) {
						nextLayers[firstIdx] = layer
						for (let i = nextLayers.length - 1; i > firstIdx; i--) {
							if (String(nextLayers[i]?.id ?? '') === layerId) nextLayers.splice(i, 1)
						}
					} else {
						nextLayers.push(layer)
					}
					frameChanged = true
				}

				if (!frameChanged) continue
				state.stageKeyframesByFrame[fk] = { ...(entry ?? {}), layers: nextLayers }
				changed = true
			}
			if (changed) state.stageKeyframeVersion++
		},

		applyNodeTextContentAcrossKeyframes(
			state: TimelineState,
			payload: { layerId: string; nodeId: string; textContent: string }
		) {
			const layerId = String(payload.layerId || '').trim()
			const nodeId = String(payload.nodeId || '').trim()
			const textContent = String(payload.textContent ?? '')
			if (!layerId || !nodeId) return

			let stageChanged = false
			const stageMap = state.stageKeyframesByFrame
			if (stageMap) {
				for (const [fk, entry] of Object.entries(stageMap)) {
					const layers = Array.isArray(entry?.layers) ? entry.layers : []
					let frameChanged = false
					const nextLayers = layers.map((layer) => {
						if (String(layer?.id ?? '') !== layerId) return layer
						const res = updateNodeTextContentInTree(layer.nodeTree, nodeId, textContent)
						if (!res.changed) return layer
						frameChanged = true
						return { ...layer, nodeTree: res.nodes }
					})
					if (!frameChanged) continue
					stageMap[fk] = { ...(entry ?? {}), layers: nextLayers }
					stageChanged = true
				}
			}

			const layerMap = state.nodeKeyframesByLayer[layerId]
			let nodeChanged = false
			if (layerMap) {
				const nextLayerMap = { ...layerMap }
				for (const [fk, nodesById] of Object.entries(layerMap)) {
					const snap = nodesById?.[nodeId]
					if (!snap) continue
					const curText = String(snap.props?.textContent ?? '')
					if (curText === textContent) continue
					nextLayerMap[fk] = {
						...nodesById,
						[nodeId]: {
							...snap,
							props: {
								...(snap.props ?? {}),
								textContent
							}
						}
					}
					nodeChanged = true
				}
				if (nodeChanged) {
					state.nodeKeyframesByLayer = {
						...state.nodeKeyframesByLayer,
						[layerId]: nextLayerMap
					}
				}
			}

			if (stageChanged) state.stageKeyframeVersion++
			if (nodeChanged) state.nodeKeyframeVersion++
		},

		// --- 节点删除：清理时间轴快照中的 nodeId ---
		purgeNodeIds(state: TimelineState, payload: { nodeIds: string[] }) {
			const raw = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
			const nodeIds = raw.map((s) => String(s || '').trim()).filter(Boolean)
			if (!nodeIds.length) return
			const ids = new Set(nodeIds)

			// 1) 清理 nodeKeyframesByLayer[layerId][frame] 的 nodesById
			let nodeKfChanged = false
			const nextNodeKf: TimelineState['nodeKeyframesByLayer'] = {}
			for (const [layerId, layerMap] of Object.entries(state.nodeKeyframesByLayer)) {
				let layerChanged = false
				const nextLayerMap: NodeKeyframeLayerMap = {}
				for (const [fk, nodesById] of Object.entries(layerMap ?? {})) {
					const before = nodesById ?? {}
					let frameChanged = false
					const nextNodes: NodeKeyframeFrameMap = {}
					for (const [nid, snap] of Object.entries(before)) {
						if (ids.has(nid)) {
							frameChanged = true
							continue
						}
						nextNodes[nid] = snap
					}
					if (frameChanged) layerChanged = true
					if (Object.keys(nextNodes).length) nextLayerMap[fk] = nextNodes
					else if (Object.keys(before).length) layerChanged = true
				}
				if (Object.keys(nextLayerMap).length)
					nextNodeKf[layerId] = layerChanged ? nextLayerMap : layerMap
				if (layerChanged) nodeKfChanged = true
			}
			if (nodeKfChanged) {
				state.nodeKeyframesByLayer = nextNodeKf
				state.nodeKeyframeVersion++
			}

			// 2) 清理 stageKeyframesByFrame[frame].layers[].nodeTree
			let stageChanged = false
			const nextStage: Record<string, StageSnapshotEntry> = {}
			for (const [fk, v] of Object.entries(state.stageKeyframesByFrame ?? {})) {
				const entry: StageSnapshotEntry = v
				const layers = Array.isArray(entry?.layers) ? entry.layers : []
				let frameChanged = false
				const nextLayers: VideoSceneLayer[] = []
				for (const layer of layers) {
					if (!layer || typeof layer !== 'object') {
						nextLayers.push(layer)
						continue
					}
					const tree = layer.nodeTree
					if (Array.isArray(tree) && tree.length) {
						const r = purgeTreeNodesById(tree, ids)
						if (r.changed) {
							frameChanged = true
							nextLayers.push({ ...layer, nodeTree: r.nodes })
						} else {
							nextLayers.push(layer)
						}
					} else {
						nextLayers.push(layer)
					}
				}
				nextStage[fk] = frameChanged ? { ...entry, layers: nextLayers } : v
				if (frameChanged) stageChanged = true
			}
			if (stageChanged) {
				state.stageKeyframesByFrame = nextStage
				state.stageKeyframeVersion++
			}
		},

		// --- 字幕数据 ---
		setSubtitleTrack(
			state: TimelineState,
			payload: {
				layerId: string
				cues: SubtitleCue[]
				cueRanges: SubtitleCueRange[]
				spans: TimelineFrameSpan[]
				fps?: number
			}
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			state.subtitleCuesByLayer[layerId] = Array.isArray(payload.cues) ? payload.cues : []
			state.subtitleCueRangesByLayer[layerId] = Array.isArray(payload.cueRanges)
				? payload.cueRanges
				: []
			state.subtitleSpansByLayer[layerId] = normalizeSpans(
				Array.isArray(payload.spans) ? payload.spans : []
			)
			if (payload.fps != null) state.subtitleFpsByLayer[layerId] = clampInt(payload.fps, 1, 240)
			if (!state.subtitleDefaultStyleByLayer[layerId])
				state.subtitleDefaultStyleByLayer[layerId] = normalizeSubtitleStyle(null)
			if (!state.subtitleOverrideStyleByLayer[layerId])
				state.subtitleOverrideStyleByLayer[layerId] = {}
			state.subtitleVersion++
		},

		setSubtitleTextNodeId(state: TimelineState, payload: { layerId: string; nodeId: string }) {
			const layerId = String(payload.layerId || '').trim()
			const nodeId = String(payload.nodeId || '').trim()
			if (!layerId || !nodeId) return
			state.subtitleTextNodeIdByLayer[layerId] = nodeId
			state.subtitleVersion++
		},

		setSubtitleDefaultStyle(
			state: TimelineState,
			payload: { layerId: string; style: Partial<SubtitleTextStyle> }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			state.subtitleDefaultStyleByLayer[layerId] = normalizeSubtitleStyle(payload.style)
			state.subtitleVersion++
		},

		setSubtitleOverrideStyle(
			state: TimelineState,
			payload: { layerId: string; cueIndex: number; style: Partial<SubtitleTextStyle> | null }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const idx = Math.floor(Number(payload.cueIndex))
			if (!Number.isFinite(idx) || idx < 0) return
			const map = { ...(state.subtitleOverrideStyleByLayer[layerId] ?? {}) }
			if (payload.style && typeof payload.style === 'object')
				map[String(idx)] = { ...(map[String(idx)] ?? {}), ...payload.style }
			else delete map[String(idx)]
			state.subtitleOverrideStyleByLayer[layerId] = map
			state.subtitleVersion++
		},

		setSubtitleCueText(
			state: TimelineState,
			payload: { layerId: string; cueIndex: number; text: string }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const idx = Math.floor(Number(payload.cueIndex))
			if (!Number.isFinite(idx) || idx < 0) return
			const cues = state.subtitleCuesByLayer[layerId]
			if (!Array.isArray(cues) || idx >= cues.length) return
			const next = cues.slice()
			next[idx] = { ...next[idx], text: String(payload.text ?? '') }
			state.subtitleCuesByLayer[layerId] = next
			state.subtitleVersion++
		},

		applySubtitleStyleToAll(
			state: TimelineState,
			payload: { layerId: string; style: Partial<SubtitleTextStyle> }
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			state.subtitleDefaultStyleByLayer[layerId] = normalizeSubtitleStyle(payload.style)
			state.subtitleOverrideStyleByLayer[layerId] = {}
			state.subtitleVersion++
		},

		setSubtitleGeneratedKeyframes(
			state: TimelineState,
			payload: {
				layerId: string
				frames: number[]
				nodeKeyframesByFrame: Record<
					string,
					Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
				>
			}
		) {
			const layerId = String(payload.layerId || '').trim()
			if (!layerId) return
			const frames = Array.isArray(payload.frames) ? payload.frames : []
			const validFrames = Array.from(
				new Set(frames.map((n) => clampInt(n, 0, state.frameCount - 1)))
			).sort((a, b) => a - b)

			// 1) keyframe spans
			const nextKeyframeMap: Record<string, TimelineFrameSpan[]> = { ...state.keyframeSpansByLayer }
			if (validFrames.length) nextKeyframeMap[layerId] = normalizeSpans(validFrames)
			else delete nextKeyframeMap[layerId]
			state.keyframeSpansByLayer = nextKeyframeMap
			state.keyframeVersion++

			// 2) node keyframes
			const nextNodeMap: TimelineState['nodeKeyframesByLayer'] = { ...state.nodeKeyframesByLayer }
			const layerMap: Record<
				string,
				Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
			> = {}
			for (const f of validFrames) {
				const fk = frameKey(f)
				const nodesById = payload.nodeKeyframesByFrame?.[fk]
				if (!nodesById || typeof nodesById !== 'object') continue
				layerMap[fk] = nodesById
			}
			if (Object.keys(layerMap).length) nextNodeMap[layerId] = layerMap
			else delete nextNodeMap[layerId]
			state.nodeKeyframesByLayer = nextNodeMap
			state.nodeKeyframeVersion++

			// 3) subtitles should not carry easing (avoid string props issues)
			const beforeSegs = state.easingSegmentKeys
			state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
				const seg = parseSegment(k)
				if (!seg) return false
				return seg.layerId !== layerId
			})
			for (const k of beforeSegs) {
				if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
			}
		}
	},
	actions: {
		setUiFocus({ commit }, payload: { focus: 'timeline' | 'stage' | null }) {
			commit('setUiFocus', payload)
		},
		setProgressBarSpec({ commit }, payload: { layerId: string; spec: ProgressBarSpec }) {
			commit('setProgressBarSpec', payload)
		},

		updateProgressBarStyle(
			{ commit },
			payload: { layerId: string; style: Partial<ProgressBarStyle> }
		) {
			commit('updateProgressBarStyle', payload)
		},

		updateProgressBarSegments(
			{ commit },
			payload: { layerId: string; segments: ProgressBarSpec['segments'] }
		) {
			commit('updateProgressBarSegments', payload)
		},
		setLayerKind({ commit }, payload: { layerId: string; kind: TimelineLayerKind }) {
			commit('setLayerKind', payload)
		},
		setFps({ commit }, payload: { fps: number }) {
			commit('setFps', payload)
		},
		jumpToFrameCentered({ commit }, payload: { frameIndex: number }) {
			commit('jumpToFrameCentered', payload)
		},
		setFrameCount({ commit }, payload: { frameCount: number }) {
			commit('setFrameCount', payload)
		},
		setCurrentFrame({ commit }, payload: { frameIndex: number }) {
			commit('setCurrentFrame', payload)
		},
		setFrameWidth({ commit }, payload: { frameWidth: number }) {
			commit('setFrameWidth', payload)
		},
		addLayer({ commit, state }) {
			commit('addLayer')
			const layer = state.layers[state.layers.length - 1]
			if (layer) {
				// Keep videoscene layers in sync with timeline layers.
				VideoSceneStore.dispatch('addLayer', { layerId: layer.id, name: layer.name })
				commit('ensureStageSnapshotsContainLayer', { layerId: layer.id, name: layer.name })
			}
		},
		addSubtitleLayer({ commit, state }, payload?: { name?: string }) {
			commit('addSubtitleLayer', payload)
			const layer = state.layers[state.layers.length - 1]
			if (layer) {
				VideoSceneStore.dispatch('addLayer', { layerId: layer.id, name: layer.name })
				commit('ensureStageSnapshotsContainLayer', { layerId: layer.id, name: layer.name })
			}
		},
		addAudioLayer({ commit }, payload?: { name?: string }) {
			commit('addAudioLayer', payload)
		},
		renameLayer({ commit }, payload: { layerId: string; name: string }) {
			commit('renameLayer', payload)
		},
		ensureStageSnapshotsContainLayer({ commit }, payload: { layerId: string; name: string }) {
			commit('ensureStageSnapshotsContainLayer', payload)
		},
		removeLayer({ state, commit }, payload: { layerId: string }) {
			const layerId = String(payload.layerId || '').trim()
			const kind = layerId ? (state.layerKindById?.[layerId] ?? 'normal') : 'normal'
			const url = layerId ? state.audioByLayerId?.[layerId]?.objectUrl : null
			commit('removeLayer', payload)
			// Non-audio layers should exist in videoscene as well.
			if (layerId && kind !== 'audio') VideoSceneStore.dispatch('removeLayer', { layerId })
			return typeof url === 'string' && url.trim() ? url : null
		},
		setAudioTrack({ commit }, payload: { layerId: string; track: AudioTrack }) {
			commit('setAudioTrack', payload)
		},
		removeSelectedLayers({ commit }) {
			commit('removeSelectedLayers')
		},
		selectLayer({ commit }, payload: { layerId: string }) {
			commit('selectLayer', payload)
		},
		clearSelection({ commit }) {
			commit('clearSelection')
		},
		toggleCellSelection(
			{ commit },
			payload: { layerId: string; frameIndex: number; additive?: boolean }
		) {
			commit('toggleCellSelection', payload)
		},
		addRangeSelection(
			{ commit },
			payload: { layerIds: string[]; startFrame: number; endFrame: number; additive?: boolean }
		) {
			commit('addRangeSelection', payload)
		},

		addKeyframe({ commit }, payload: { layerId: string; frameIndex: number }) {
			commit('addKeyframe', payload)
		},
		removeKeyframe({ commit }, payload: { layerId: string; frameIndex: number }) {
			commit('removeKeyframe', payload)
		},
		enableEasingSegment(
			{ commit },
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			commit('enableEasingSegment', payload)
		},
		disableEasingSegment(
			{ commit },
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			commit('disableEasingSegment', payload)
		},
		toggleRangeSelection(
			{ commit },
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			commit('toggleRangeSelection', payload)
		},
		setEasingCurve(
			{ commit },
			payload: {
				segmentKey: string
				curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }
			}
		) {
			commit('setEasingCurve', payload)
		},
		addKeyframeRange(
			{ commit },
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			commit('addKeyframeRange', payload)
		},
		removeKeyframeRange(
			{ commit },
			payload: { layerId: string; startFrame: number; endFrame: number }
		) {
			commit('removeKeyframeRange', payload)
		},

		// --- 舞台节点关键帧快照 ---
		setNodeKeyframeSnapshotRange(
			{ commit },
			payload: {
				layerId: string
				startFrame: number
				endFrame: number
				nodesById: Record<
					string,
					{ transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }
				>
			}
		) {
			commit('setNodeKeyframeSnapshotRange', payload)
		},

		setStageKeyframeSnapshotRange(
			{ commit },
			payload: { startFrame: number; endFrame: number; layers: VideoSceneLayer[] }
		) {
			commit('setStageKeyframeSnapshotRange', payload)
		},
		applyNodeTextContentAcrossKeyframes(
			{ commit },
			payload: { layerId: string; nodeId: string; textContent: string }
		) {
			commit('applyNodeTextContentAcrossKeyframes', payload)
		},
		purgeNodeIds({ commit }, payload: { nodeIds: string[] }) {
			commit('purgeNodeIds', payload)
		},
		setSubtitleTrack(
			{ commit },
			payload: {
				layerId: string
				cues: SubtitleCue[]
				cueRanges: SubtitleCueRange[]
				spans: TimelineFrameSpan[]
				fps?: number
			}
		) {
			commit('setSubtitleTrack', payload)
		},
		setSubtitleTextNodeId({ commit }, payload: { layerId: string; nodeId: string }) {
			commit('setSubtitleTextNodeId', payload)
		},
		setSubtitleDefaultStyle(
			{ commit },
			payload: { layerId: string; style: Partial<SubtitleTextStyle> }
		) {
			commit('setSubtitleDefaultStyle', payload)
		},
		setSubtitleOverrideStyle(
			{ commit },
			payload: { layerId: string; cueIndex: number; style: Partial<SubtitleTextStyle> | null }
		) {
			commit('setSubtitleOverrideStyle', payload)
		},
		setSubtitleCueText({ commit }, payload: { layerId: string; cueIndex: number; text: string }) {
			commit('setSubtitleCueText', payload)
		},
		applySubtitleStyleToAll(
			{ commit },
			payload: { layerId: string; style: Partial<SubtitleTextStyle> }
		) {
			commit('applySubtitleStyleToAll', payload)
		},
		setSubtitleGeneratedKeyframes(
			{ commit },
			payload: {
				layerId: string
				frames: number[]
				nodeKeyframesByFrame: Record<
					string,
					Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
				>
			}
		) {
			commit('setSubtitleGeneratedKeyframes', payload)
		}
	}
})
