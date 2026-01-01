import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

import {
  addRange,
  clipSpans,
  containsFrame,
  normalizeSpans,
  removeRange,
  toggleRange,
  type TimelineFrameSpan,
} from './spans'

import type { VideoSceneLayer, VideoSceneNodeProps, VideoSceneNodeTransform } from '../videoscene'

import type { TimelineCellKey, TimelineLayer, TimelineState } from '../../core/timeline'
import { createDefaultTimelineState } from '../../core/timeline'
import { cloneJsonSafe } from '../../core/shared/cloneJsonSafe'

import type { VideoSceneTreeNode } from '../../core/scene'

export type { TimelineCellKey, TimelineLayer, TimelineState } from '../../core/timeline'

const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

const uniq = (arr: string[]) => Array.from(new Set(arr))

const cellKey = (layerId: string, frameIndex: number): TimelineCellKey => `${layerId}:${frameIndex}`
const parseLayerIdFromKey = (key: TimelineCellKey) => key.split(':', 1)[0]

const segmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`
const parseSegment = (key: string): { layerId: string; startFrame: number; endFrame: number } | null => {
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
    const id = String((n as any).id ?? '')
    if (id && ids.has(id)) {
      changed = true
      continue
    }
    const children = (n as any).children
    if (Array.isArray(children) && children.length) {
      const r = purgeTreeNodesById(children, ids)
      if (r.changed) {
        changed = true
        out.push({ ...(n as any), children: r.nodes })
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

const getLayerSpans = (map: Record<string, TimelineFrameSpan[]>, layerId: string) => map[layerId] ?? []
const setLayerSpans = (map: Record<string, TimelineFrameSpan[]>, layerId: string, spans: TimelineFrameSpan[]) => {
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

export const TimelineKey: InjectionKey<Store<TimelineState>> = Symbol('TimelineStore')

export const TimelineStore = createStore<TimelineState>({
  state: createDefaultTimelineState,
  mutations: {
    setFrameCount(state, payload: { frameCount: number }) {
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
      const out: Record<string, Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>> = {}
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
    },
    setCurrentFrame(state, payload: { frameIndex: number }) {
      state.currentFrame = clampInt(payload.frameIndex, 0, state.frameCount - 1)
    },
    setFrameWidth(state, payload: { frameWidth: number }) {
      const w = Number(payload.frameWidth)
      if (!Number.isFinite(w)) return
      state.frameWidth = Math.max(5, Math.min(20, Math.round(w)))
    },
    addLayer(state) {
      const nextIndex = state.layers.length + 1
      const layer: TimelineLayer = {
        id: `layer-${Date.now()}-${nextIndex}`,
        name: `图层${nextIndex}`,
      }
      state.layers.push(layer)
      state.selectedLayerIds = [layer.id]
    },
    removeLayer(state, payload: { layerId: string }) {
      const idx = state.layers.findIndex((l) => l.id === payload.layerId)
      if (idx < 0) return
      state.layers.splice(idx, 1)
      state.selectedLayerIds = state.selectedLayerIds.filter((id) => id !== payload.layerId)
	  if (state.selectedSpansByLayer[payload.layerId]) {
		  delete state.selectedSpansByLayer[payload.layerId]
		  state.selectionVersion++
	  }

      if (state.lastSelectedCellKey && parseLayerIdFromKey(state.lastSelectedCellKey) === payload.layerId) {
        state.lastSelectedCellKey = null
      }

	  if (state.keyframeSpansByLayer[payload.layerId]) {
		  delete state.keyframeSpansByLayer[payload.layerId]
		  state.keyframeVersion++
	  }
    if (state.nodeKeyframesByLayer[payload.layerId]) {
      delete state.nodeKeyframesByLayer[payload.layerId]
      state.nodeKeyframeVersion++
    }
      state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
        const seg = parseSegment(k)
        return !seg ? false : seg.layerId !== payload.layerId
      })
	  for (const k of Object.keys(state.easingCurves)) {
		  const seg = parseSegment(k)
		  if (seg && seg.layerId === payload.layerId) delete state.easingCurves[k]
	  }
    },
    removeSelectedLayers(state) {
      const toRemove = new Set(state.selectedLayerIds)
      if (toRemove.size === 0) return
      state.layers = state.layers.filter((l) => !toRemove.has(l.id))
      state.selectedLayerIds = []
    let selChanged = false
    for (const layerId of toRemove) {
      if (state.selectedSpansByLayer[layerId]) {
        delete state.selectedSpansByLayer[layerId]
        selChanged = true
      }
    }
    if (selChanged) state.selectionVersion++

      if (state.lastSelectedCellKey && toRemove.has(parseLayerIdFromKey(state.lastSelectedCellKey))) {
        state.lastSelectedCellKey = null
      }

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
    },
    selectLayer(state, payload: { layerId: string; additive?: boolean }) {
      if (payload.additive) {
        state.selectedLayerIds = uniq([...state.selectedLayerIds, payload.layerId])
      } else {
        state.selectedLayerIds = [payload.layerId]
      }
    },
    clearSelection(state) {
	  state.selectedSpansByLayer = {}
	  state.selectionVersion++
      state.lastSelectedCellKey = null
    },
    toggleCellSelection(state, payload: { layerId: string; frameIndex: number; additive?: boolean }) {
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
    addRangeSelection(state, payload: { layerIds: string[]; startFrame: number; endFrame: number; additive?: boolean }) {
      const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
      const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
      const layerIds = uniq(payload.layerIds)

	  const nextMap: Record<string, TimelineFrameSpan[]> = payload.additive ? { ...state.selectedSpansByLayer } : {}
	  for (const layerId of layerIds) {
		  const before = getLayerSpans(nextMap, layerId)
		  nextMap[layerId] = addRange(before, a, b)
	  }
	  state.selectedSpansByLayer = nextMap
	  state.selectionVersion++
      state.selectedLayerIds = payload.additive ? uniq([...state.selectedLayerIds, ...layerIds]) : layerIds

      // 约定：范围选择的 lastSelected 取 endFrame（更贴近用户拖拽方向）
      if (layerIds.length) state.lastSelectedCellKey = cellKey(layerIds[0], b)
    },

    // --- 关键帧 ---
    addKeyframe(state, payload: { layerId: string; frameIndex: number }) {
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
    removeKeyframe(state, payload: { layerId: string; frameIndex: number }) {
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
    enableEasingSegment(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
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
    disableEasingSegment(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
      const startFrame = clampInt(payload.startFrame, 0, state.frameCount - 1)
      const endFrame = clampInt(payload.endFrame, 0, state.frameCount - 1)
      const key = segmentKey(payload.layerId, startFrame, endFrame)
      state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => k !== key)
    delete state.easingCurves[key]
    },

  setEasingCurve(state, payload: { segmentKey: string; curve: { x1: number; y1: number; x2: number; y2: number; preset?: string } }) {
    if (!state.easingSegmentKeys.includes(payload.segmentKey)) return
    state.easingCurves[payload.segmentKey] = {
      x1: clamp01(payload.curve.x1),
      y1: clamp01(payload.curve.y1),
      x2: clamp01(payload.curve.x2),
      y2: clamp01(payload.curve.y2),
      preset: payload.curve.preset,
    }
  },

    // --- 选择：按范围 toggle（用于合并段整体选择） ---
    toggleRangeSelection(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
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
  addKeyframeRange(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
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
  removeKeyframeRange(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
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
    state,
    payload: {
      layerId: string
      startFrame: number
      endFrame: number
      nodesById: Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
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
  setStageKeyframeSnapshotRange(state, payload: { startFrame: number; endFrame: number; layers: VideoSceneLayer[] }) {
    const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
    const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
    if (b < a) return
    const layers = cloneJsonSafe(payload.layers ?? [])
    for (let f = a; f <= b; f++) {
      // 只在该帧确实为关键帧时记录快照
      if (!isAnyKeyframeAt(state, f)) continue
      state.stageKeyframesByFrame[frameKey(f)] = { layers: cloneJsonSafe(layers) }
    }
    state.stageKeyframeVersion++
  },

  // --- 节点删除：清理时间轴快照中的 nodeId ---
  purgeNodeIds(state, payload: { nodeIds: string[] }) {
    const raw = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
    const nodeIds = raw.map((s) => String(s || '').trim()).filter(Boolean)
    if (!nodeIds.length) return
    const ids = new Set(nodeIds)

    // 1) 清理 nodeKeyframesByLayer[layerId][frame] 的 nodesById
    let nodeKfChanged = false
    const nextNodeKf: TimelineState['nodeKeyframesByLayer'] = {}
    for (const [layerId, layerMap] of Object.entries(state.nodeKeyframesByLayer)) {
      let layerChanged = false
      const nextLayerMap: Record<string, Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>> = {}
      for (const [fk, nodesById] of Object.entries(layerMap ?? {})) {
        const before = nodesById ?? {}
        let frameChanged = false
        const nextNodes: Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }> = {}
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
      if (Object.keys(nextLayerMap).length) nextNodeKf[layerId] = layerChanged ? nextLayerMap : (layerMap as any)
      if (layerChanged) nodeKfChanged = true
    }
    if (nodeKfChanged) {
      state.nodeKeyframesByLayer = nextNodeKf
      state.nodeKeyframeVersion++
    }

    // 2) 清理 stageKeyframesByFrame[frame].layers[].nodeTree
    let stageChanged = false
    const nextStage: TimelineState['stageKeyframesByFrame'] = {}
    for (const [fk, v] of Object.entries(state.stageKeyframesByFrame ?? {})) {
      const layers = Array.isArray((v as any)?.layers) ? ((v as any).layers as any[]) : []
      let frameChanged = false
      const nextLayers: any[] = []
      for (const layer of layers) {
        if (!layer || typeof layer !== 'object') {
          nextLayers.push(layer)
          continue
        }
        const tree = (layer as any).nodeTree
        if (Array.isArray(tree) && tree.length) {
          const r = purgeTreeNodesById(tree, ids)
          if (r.changed) {
            frameChanged = true
            nextLayers.push({ ...(layer as any), nodeTree: r.nodes })
          } else {
            nextLayers.push(layer)
          }
        } else {
          nextLayers.push(layer)
        }
      }
      nextStage[fk] = frameChanged ? ({ ...(v as any), layers: nextLayers } as any) : v
      if (frameChanged) stageChanged = true
    }
    if (stageChanged) {
      state.stageKeyframesByFrame = nextStage
      state.stageKeyframeVersion++
    }
  },
  },
  actions: {
    setFrameCount({ commit }, payload: { frameCount: number }) {
      commit('setFrameCount', payload)
    },
    setCurrentFrame({ commit }, payload: { frameIndex: number }) {
      commit('setCurrentFrame', payload)
    },
    setFrameWidth({ commit }, payload: { frameWidth: number }) {
      commit('setFrameWidth', payload)
    },
    addLayer({ commit }) {
      commit('addLayer')
    },
    removeLayer({ commit }, payload: { layerId: string }) {
      commit('removeLayer', payload)
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
    toggleCellSelection({ commit }, payload: { layerId: string; frameIndex: number; additive?: boolean }) {
      commit('toggleCellSelection', payload)
    },
    addRangeSelection({ commit }, payload: { layerIds: string[]; startFrame: number; endFrame: number; additive?: boolean }) {
      commit('addRangeSelection', payload)
    },

    addKeyframe({ commit }, payload: { layerId: string; frameIndex: number }) {
      commit('addKeyframe', payload)
    },
    removeKeyframe({ commit }, payload: { layerId: string; frameIndex: number }) {
      commit('removeKeyframe', payload)
    },
    enableEasingSegment({ commit }, payload: { layerId: string; startFrame: number; endFrame: number }) {
      commit('enableEasingSegment', payload)
    },
    disableEasingSegment({ commit }, payload: { layerId: string; startFrame: number; endFrame: number }) {
      commit('disableEasingSegment', payload)
    },
    toggleRangeSelection({ commit }, payload: { layerId: string; startFrame: number; endFrame: number }) {
      commit('toggleRangeSelection', payload)
    },
	setEasingCurve({ commit }, payload: { segmentKey: string; curve: { x1: number; y1: number; x2: number; y2: number; preset?: string } }) {
		commit('setEasingCurve', payload)
	},
  addKeyframeRange({ commit }, payload: { layerId: string; startFrame: number; endFrame: number }) {
    commit('addKeyframeRange', payload)
  },
  removeKeyframeRange({ commit }, payload: { layerId: string; startFrame: number; endFrame: number }) {
    commit('removeKeyframeRange', payload)
  },

  // --- 舞台节点关键帧快照 ---
  setNodeKeyframeSnapshotRange(
    { commit },
    payload: {
      layerId: string
      startFrame: number
      endFrame: number
      nodesById: Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
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
  purgeNodeIds({ commit }, payload: { nodeIds: string[] }) {
    commit('purgeNodeIds', payload)
  },
  },
})

