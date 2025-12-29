import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

export type TimelineLayer = { id: string; name: string }

export type TimelineCellKey = string // `${layerId}:${frameIndex}`

export interface TimelineState {
  frameCount: number
  currentFrame: number
  frameWidth: number
  layers: TimelineLayer[]
  selectedLayerIds: string[]
  selectedCellKeys: TimelineCellKey[]
  lastSelectedCellKey: TimelineCellKey | null

  // 关键帧/缓动（占位）：都用 cellKey(`${layerId}:${frameIndex}`) 存储，便于序列化
  keyframeKeys: TimelineCellKey[]

  // 缓动（段）：`${layerId}:${startKeyframeFrame}:${endKeyframeFrame}`
  easingSegmentKeys: string[]

  // 缓动曲线：key 为 easingSegmentKey；value 为三次贝塞尔控制点（0..1）
  easingCurves: Record<string, { x1: number; y1: number; x2: number; y2: number; preset?: string }>
}

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

const createDefaultState = (): TimelineState => ({
  frameCount: 120,
  currentFrame: 0,
  frameWidth: 14,
  layers: [{ id: 'layer-1', name: '图层1' }],
  selectedLayerIds: ['layer-1'],
  selectedCellKeys: [],
  lastSelectedCellKey: null,

  keyframeKeys: [],
  easingSegmentKeys: [],
  easingCurves: {},
})

export const TimelineKey: InjectionKey<Store<TimelineState>> = Symbol('TimelineStore')

export const TimelineStore = createStore<TimelineState>({
  state: createDefaultState,
  mutations: {
    setFrameCount(state, payload: { frameCount: number }) {
      const next = Math.max(1, Math.floor(Number(payload.frameCount) || 1))
      state.frameCount = next
      if (state.currentFrame > next - 1) state.currentFrame = next - 1
      // 裁剪 cell selection（移除越界帧）
      const nextKeys: TimelineCellKey[] = []
      for (const k of state.selectedCellKeys) {
        const parts = k.split(':')
        if (parts.length !== 2) continue
        const layerId = parts[0]
        const frame = clampInt(parts[1], 0, next - 1)
        nextKeys.push(cellKey(layerId, frame))
      }
      state.selectedCellKeys = uniq(nextKeys)

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

      // 裁剪关键帧（移除越界帧）
      const clipCellKeys = (keys: TimelineCellKey[]) => {
        const out: TimelineCellKey[] = []
        for (const k of keys) {
          const parts = k.split(':')
          if (parts.length !== 2) continue
          const layerId = parts[0]
          const frame = clampInt(parts[1], 0, next - 1)
          out.push(cellKey(layerId, frame))
        }
        return uniq(out)
      }
      state.keyframeKeys = clipCellKeys(state.keyframeKeys)

      // 裁剪缓动段：
      // 1) start/end 需要在范围内
      // 2) start < end
      // 3) start/end 必须仍然是关键帧（否则段无意义）
      const keyframeSet = new Set(state.keyframeKeys)
      const nextSegs: string[] = []
      for (const k of state.easingSegmentKeys) {
        const seg = parseSegment(k)
        if (!seg) continue
        const startFrame = clampInt(seg.startFrame, 0, next - 1)
        const endFrame = clampInt(seg.endFrame, 0, next - 1)
        if (!(startFrame < endFrame)) continue
        if (!keyframeSet.has(cellKey(seg.layerId, startFrame))) continue
        if (!keyframeSet.has(cellKey(seg.layerId, endFrame))) continue
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
      state.selectedCellKeys = state.selectedCellKeys.filter((k) => parseLayerIdFromKey(k) !== payload.layerId)

      if (state.lastSelectedCellKey && parseLayerIdFromKey(state.lastSelectedCellKey) === payload.layerId) {
        state.lastSelectedCellKey = null
      }

      state.keyframeKeys = state.keyframeKeys.filter((k) => parseLayerIdFromKey(k) !== payload.layerId)
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
      state.selectedCellKeys = state.selectedCellKeys.filter((k) => !toRemove.has(parseLayerIdFromKey(k)))

      if (state.lastSelectedCellKey && toRemove.has(parseLayerIdFromKey(state.lastSelectedCellKey))) {
        state.lastSelectedCellKey = null
      }

      state.keyframeKeys = state.keyframeKeys.filter((k) => !toRemove.has(parseLayerIdFromKey(k)))
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
      state.selectedCellKeys = []
      state.lastSelectedCellKey = null
    },
    toggleCellSelection(state, payload: { layerId: string; frameIndex: number; additive?: boolean }) {
      const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
      const key = cellKey(payload.layerId, frameIndex)

      if (!payload.additive) {
        state.selectedCellKeys = [key]
        state.selectedLayerIds = [payload.layerId]
        state.lastSelectedCellKey = key
        return
      }

      const set = new Set(state.selectedCellKeys)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      state.selectedCellKeys = Array.from(set)
      state.selectedLayerIds = uniq([payload.layerId, ...state.selectedLayerIds])
      state.lastSelectedCellKey = key
    },
    addRangeSelection(state, payload: { layerIds: string[]; startFrame: number; endFrame: number; additive?: boolean }) {
      const a = clampInt(Math.min(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
      const b = clampInt(Math.max(payload.startFrame, payload.endFrame), 0, state.frameCount - 1)
      const layerIds = uniq(payload.layerIds)

      const next = payload.additive ? new Set(state.selectedCellKeys) : new Set<TimelineCellKey>()
      for (const layerId of layerIds) {
        for (let f = a; f <= b; f++) next.add(cellKey(layerId, f))
      }
      state.selectedCellKeys = Array.from(next)
      state.selectedLayerIds = payload.additive ? uniq([...state.selectedLayerIds, ...layerIds]) : layerIds

      // 约定：范围选择的 lastSelected 取 endFrame（更贴近用户拖拽方向）
      if (layerIds.length) state.lastSelectedCellKey = cellKey(layerIds[0], b)
    },

    // --- 关键帧 ---
    addKeyframe(state, payload: { layerId: string; frameIndex: number }) {
      const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
      const key = cellKey(payload.layerId, frameIndex)
      if (state.keyframeKeys.includes(key)) return
      state.keyframeKeys = [...state.keyframeKeys, key]
      // 新增关键帧会“切段”：移除该层中被插入点切开的缓动段
      const before = state.easingSegmentKeys
      state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
        const seg = parseSegment(k)
        if (!seg) return false
        if (seg.layerId !== payload.layerId) return true
        return !(seg.startFrame < frameIndex && frameIndex < seg.endFrame)
      })
	  for (const k of before) {
		  if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
	  }
    },
    removeKeyframe(state, payload: { layerId: string; frameIndex: number }) {
      const frameIndex = clampInt(payload.frameIndex, 0, state.frameCount - 1)
      const key = cellKey(payload.layerId, frameIndex)
      state.keyframeKeys = state.keyframeKeys.filter((k) => k !== key)
      // 删除关键帧会导致相邻段变化：移除引用该关键帧的缓动段
      const before = state.easingSegmentKeys
      state.easingSegmentKeys = state.easingSegmentKeys.filter((k) => {
        const seg = parseSegment(k)
        if (!seg) return false
        if (seg.layerId !== payload.layerId) return true
        return !(seg.startFrame === frameIndex || seg.endFrame === frameIndex)
      })
	  for (const k of before) {
		  if (!state.easingSegmentKeys.includes(k)) delete state.easingCurves[k]
	  }
    },

    // --- 缓动（段） ---
    enableEasingSegment(state, payload: { layerId: string; startFrame: number; endFrame: number }) {
      const startFrame = clampInt(payload.startFrame, 0, state.frameCount - 1)
      const endFrame = clampInt(payload.endFrame, 0, state.frameCount - 1)
      if (!(startFrame < endFrame)) return
      // 段两端必须是关键帧
      if (!state.keyframeKeys.includes(cellKey(payload.layerId, startFrame))) return
      if (!state.keyframeKeys.includes(cellKey(payload.layerId, endFrame))) return
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
      const keys: TimelineCellKey[] = []
      for (let f = a; f <= b; f++) keys.push(cellKey(payload.layerId, f))
      if (keys.length === 0) return

      const set = new Set(state.selectedCellKeys)
      let allSelected = true
      for (const k of keys) {
        if (!set.has(k)) {
          allSelected = false
          break
        }
      }

      if (allSelected) {
        for (const k of keys) set.delete(k)
      } else {
        for (const k of keys) set.add(k)
      }
      state.selectedCellKeys = Array.from(set)
      state.selectedLayerIds = uniq([payload.layerId, ...state.selectedLayerIds])
      state.lastSelectedCellKey = cellKey(payload.layerId, b)
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
  },
})
