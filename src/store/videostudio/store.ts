import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

export interface VideoStudioState {
  stage: {
    width: number
    height: number
		background: {
			type: 'color' | 'image'
			color: string
      opacity: number
			imageSrc: string
			imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
			repeat: boolean
		}
    fitRequestedAt: number
    viewport: {
      panX: number
      panY: number
      zoom: number
    }
    showGuides: boolean
    snapEnabled: boolean
  }
  timeline: {
    frameCount: number
    currentFrame: number
    frameWidth: number
    layers: Array<{ id: string; name: string }>
    selected: { layerId: string | null; frameIndex: number | null }
  }
}

const createDefaultState = (): VideoStudioState => ({
  stage: {
    width: 1920,
    height: 1080,
		background: {
			type: 'color',
			color: '#111111',
      opacity: 1,
			imageSrc: '',
			imageFit: 'contain',
			repeat: false,
		},
    fitRequestedAt: 0,
    viewport: { panX: 0, panY: 0, zoom: 1 },
    showGuides: false,
    snapEnabled: false,
  },
  timeline: {
    frameCount: 120,
    currentFrame: 0,
    frameWidth: 14,
    layers: [],
    selected: { layerId: null, frameIndex: null },
  },
})

export const VideoStudioKey: InjectionKey<Store<VideoStudioState>> = Symbol('VideoStudioStore')

export const VideoStudioStore = createStore<VideoStudioState>({
  state: createDefaultState,
  mutations: {
    setStageSize(state, payload: { width: number; height: number }) {
      const width = Number(payload.width)
      const height = Number(payload.height)
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      if (width <= 0 || height <= 0) return
      state.stage.width = Math.round(width)
      state.stage.height = Math.round(height)
    },
    requestStageFit(state) {
      state.stage.fitRequestedAt = Date.now()
    },
    setViewport(state, payload: { panX: number; panY: number; zoom: number }) {
      state.stage.viewport.panX = payload.panX
      state.stage.viewport.panY = payload.panY
      state.stage.viewport.zoom = payload.zoom
    },
    toggleGuides(state) {
      state.stage.showGuides = !state.stage.showGuides
    },
    setGuides(state, payload: { enabled: boolean }) {
      state.stage.showGuides = payload.enabled
    },
    toggleSnap(state) {
      state.stage.snapEnabled = !state.stage.snapEnabled
    },
    setStageBackground(
      state,
      payload: Partial<VideoStudioState['stage']['background']>
    ) {
      const bg = state.stage.background
      if (payload.type === 'color' || payload.type === 'image') bg.type = payload.type
      if (typeof payload.color === 'string') bg.color = payload.color
      if (payload.opacity != null) {
        const o = Number(payload.opacity)
        if (Number.isFinite(o)) bg.opacity = Math.max(0, Math.min(1, o))
      }
      if (typeof payload.imageSrc === 'string') bg.imageSrc = payload.imageSrc
      if (
        payload.imageFit === 'contain' ||
        payload.imageFit === 'cover' ||
        payload.imageFit === 'fill' ||
        payload.imageFit === 'none' ||
        payload.imageFit === 'scale-down'
      )
        bg.imageFit = payload.imageFit
      if (typeof payload.repeat === 'boolean') bg.repeat = payload.repeat
    },
    addLayer(state) {
      const nextIndex = state.timeline.layers.length + 1
      state.timeline.layers.push({
        id: `layer-${Date.now()}-${nextIndex}`,
        name: `图层${nextIndex}`,
      })
    },
    removeLayer(state, payload: { layerId: string }) {
      const idx = state.timeline.layers.findIndex((l) => l.id === payload.layerId)
      if (idx < 0) return
      state.timeline.layers.splice(idx, 1)
      if (state.timeline.selected.layerId === payload.layerId) {
        state.timeline.selected = { layerId: null, frameIndex: null }
      }
    },
    setFrameCount(state, payload: { frameCount: number }) {
      const frameCount = Math.max(1, Math.floor(Number(payload.frameCount) || 1))
      state.timeline.frameCount = frameCount
      if (state.timeline.currentFrame > frameCount - 1) state.timeline.currentFrame = frameCount - 1
      if (state.timeline.selected.frameIndex != null && state.timeline.selected.frameIndex > frameCount - 1) {
        state.timeline.selected.frameIndex = frameCount - 1
      }
    },
    setCurrentFrame(state, payload: { frameIndex: number; layerId?: string | null }) {
      const frameIndex = Math.floor(Number(payload.frameIndex))
      if (!Number.isFinite(frameIndex)) return
      const clamped = Math.max(0, Math.min(state.timeline.frameCount - 1, frameIndex))
      state.timeline.currentFrame = clamped
      // 兼容旧交互：同步 selected
      state.timeline.selected = {
        layerId: payload.layerId ?? state.timeline.selected.layerId,
        frameIndex: clamped,
      }
    },
    setFrameWidth(state, payload: { frameWidth: number }) {
      const w = Number(payload.frameWidth)
      if (!Number.isFinite(w)) return
      state.timeline.frameWidth = Math.max(5, Math.min(20, Math.round(w)))
    },
    selectFrame(state, payload: { layerId: string; frameIndex: number }) {
      const frameIndex = Number(payload.frameIndex)
      if (!Number.isFinite(frameIndex)) return
      if (frameIndex < 0 || frameIndex >= state.timeline.frameCount) return
      state.timeline.selected = { layerId: payload.layerId, frameIndex }
      state.timeline.currentFrame = frameIndex
    },
  },
  actions: {
    setStageSize({ commit }, payload: { width: number; height: number }) {
      commit('setStageSize', payload)
    },
    fitStage({ commit }) {
      commit('requestStageFit')
    },
    setViewport({ commit }, payload: { panX: number; panY: number; zoom: number }) {
      commit('setViewport', payload)
    },
    toggleGuides({ commit }) {
      commit('toggleGuides')
    },
    toggleSnap({ commit }) {
      commit('toggleSnap')
    },
		setStageBackground({ commit }, payload: Partial<VideoStudioState['stage']['background']>) {
			commit('setStageBackground', payload)
		},
    addLayer({ commit }) {
      commit('addLayer')
    },
    removeLayer({ commit }, payload: { layerId: string }) {
      commit('removeLayer', payload)
    },
    setFrameCount({ commit }, payload: { frameCount: number }) {
      commit('setFrameCount', payload)
    },
    setCurrentFrame({ commit }, payload: { frameIndex: number; layerId?: string | null }) {
      commit('setCurrentFrame', payload)
    },
    setFrameWidth({ commit }, payload: { frameWidth: number }) {
      commit('setFrameWidth', payload)
    },
    selectFrame({ commit }, payload: { layerId: string; frameIndex: number }) {
      commit('selectFrame', payload)
    },
  },
  getters: {
    stageAspectRatio(state): number {
      const { width, height } = state.stage
      return height > 0 ? width / height : 16 / 9
    },
  },
})
