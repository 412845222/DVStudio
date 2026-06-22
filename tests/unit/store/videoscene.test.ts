import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VideoSceneStore } from '@/store/videoscene/store'

describe('store/videoscene', () => {
  let store: typeof VideoSceneStore

  beforeEach(() => {
    store = VideoSceneStore
  })

  describe('state', () => {
    it('has default layers', () => {
      expect(store.state.layers).toBeDefined()
      expect(Array.isArray(store.state.layers)).toBe(true)
    })

    it('has default imageAssets', () => {
      expect(store.state.imageAssets).toBeDefined()
      expect(typeof store.state.imageAssets).toBe('object')
    })
  })

  describe('mutations', () => {
    it('upsertImageAsset adds new asset', () => {
      store.commit('upsertImageAsset', { id: 'img1', url: 'http://example.com/img.png', name: 'Test Image' })
      expect(store.state.imageAssets.img1).toBeDefined()
      expect(store.state.imageAssets.img1.url).toBe('http://example.com/img.png')
    })

    it('upsertImageAsset updates existing asset', () => {
      store.commit('upsertImageAsset', { id: 'img1', url: 'http://example.com/img.png' })
      store.commit('upsertImageAsset', { id: 'img1', url: 'http://example.com/img2.png' })
      expect(store.state.imageAssets.img1.url).toBe('http://example.com/img2.png')
    })

    it('upsertImageAsset ignores empty id', () => {
      const initial = { ...store.state.imageAssets }
      store.commit('upsertImageAsset', { id: '', url: 'http://example.com/img.png' })
      expect(store.state.imageAssets).toEqual(initial)
    })

    it('removeImageAsset removes asset', () => {
      store.commit('upsertImageAsset', { id: 'img1', url: 'http://example.com/img.png' })
      store.commit('removeImageAsset', { id: 'img1' })
      expect(store.state.imageAssets.img1).toBeUndefined()
    })

    it('toggleSizePanel toggles showSizePanel', () => {
      const initial = store.state.showSizePanel
      store.commit('toggleSizePanel')
      expect(store.state.showSizePanel).toBe(!initial)
      store.commit('toggleSizePanel')
      expect(store.state.showSizePanel).toBe(initial)
    })

    it('setSizePanelVisible sets visibility', () => {
      store.commit('setSizePanelVisible', { visible: true })
      expect(store.state.showSizePanel).toBe(true)
      store.commit('setSizePanelVisible', { visible: false })
      expect(store.state.showSizePanel).toBe(false)
    })

    it('toggleBackgroundPanel toggles showBackgroundPanel', () => {
      const initial = store.state.showBackgroundPanel
      store.commit('toggleBackgroundPanel')
      expect(store.state.showBackgroundPanel).toBe(!initial)
    })

    it('toggleExportPanel toggles showExportPanel', () => {
      const initial = store.state.showExportPanel
      store.commit('toggleExportPanel')
      expect(store.state.showExportPanel).toBe(!initial)
    })

    it('addLayer adds new layer', () => {
      store.commit('addLayer', { layerId: 'layer-2', name: 'New Layer' })
      expect(store.state.layers.length).toBeGreaterThan(1)
      expect(store.state.layers.find((l: any) => l.id === 'layer-2')).toBeDefined()
    })

    it('addLayer sets it as active', () => {
      store.commit('addLayer', { layerId: 'layer-2', name: 'New Layer' })
      expect(store.state.activeLayerId).toBe('layer-2')
    })

    it('addLayer does not duplicate layer with same id', () => {
      const initialLength = store.state.layers.length
      store.commit('addLayer', { layerId: 'layer-1', name: 'Duplicate' })
      expect(store.state.layers.length).toBe(initialLength)
    })

    it('removeLayer removes layer', () => {
      store.commit('addLayer', { layerId: 'layer-2', name: 'To Remove' })
      store.commit('removeLayer', { layerId: 'layer-2' })
      expect(store.state.layers.find((l: any) => l.id === 'layer-2')).toBeUndefined()
    })

    it('setActiveLayer changes active layer', () => {
      store.commit('addLayer', { layerId: 'layer-2', name: 'Second Layer' })
      store.commit('setActiveLayer', { layerId: 'layer-2' })
      expect(store.state.activeLayerId).toBe('layer-2')
    })

    it('clearSelection clears node selection', () => {
      store.commit('setSelectedNode', { nodeId: 'some-node' })
      store.commit('clearSelection')
      expect(store.state.selectedNodeId).toBeNull()
    })

    it('setLayoutInsets updates panel insets', () => {
      store.commit('setLayoutInsets', { leftPanelWidth: 300 })
      expect(store.state.layoutInsets.leftPanelWidth).toBe(300)
    })

    it('setLayoutInsets ignores invalid values', () => {
      const initial = store.state.layoutInsets.leftPanelWidth
      store.commit('setLayoutInsets', { leftPanelWidth: NaN })
      expect(store.state.layoutInsets.leftPanelWidth).toBe(initial)
    })

    it('openLeftPanel opens left panel', () => {
      store.commit('openLeftPanel', { mode: 'assets' })
      expect(store.state.leftPanel.open).toBe(true)
      expect(store.state.leftPanel.mode).toBe('assets')
    })

    it('openLeftPanel with layerId', () => {
      store.commit('openLeftPanel', { mode: 'properties', layerId: 'layer-1' })
      expect(store.state.leftPanel.layerId).toBe('layer-1')
    })

    it('closeLeftPanel closes left panel', () => {
      store.commit('openLeftPanel', { mode: 'assets' })
      store.commit('closeLeftPanel')
      expect(store.state.leftPanel.open).toBe(false)
      expect(store.state.leftPanel.mode).toBeNull()
    })

    it('setBackgroundPanelVisible sets visibility', () => {
      store.commit('setBackgroundPanelVisible', { visible: true })
      expect(store.state.showBackgroundPanel).toBe(true)
    })

    it('setBackgroundPanelVisible toggles other panels off', () => {
      store.commit('setSizePanelVisible', { visible: true })
      store.commit('setBackgroundPanelVisible', { visible: true })
      expect(store.state.showSizePanel).toBe(false)
    })

    it('setExportPanelVisible sets visibility', () => {
      store.commit('setExportPanelVisible', { visible: true })
      expect(store.state.showExportPanel).toBe(true)
    })

    it('setExportPanelVisible toggles other panels off', () => {
      store.commit('setSizePanelVisible', { visible: true })
      store.commit('setExportPanelVisible', { visible: true })
      expect(store.state.showSizePanel).toBe(false)
    })

    it('setFocusedNode sets focused node', () => {
      store.commit('setFocusedNode', { nodeId: 'focused-node' })
      expect(store.state.focusedNodeId).toBe('focused-node')
    })

    it('setSelectedNodes sets multiple selections', () => {
      store.commit('setSelectedNodes', { nodeIds: ['node-1', 'node-2'] })
      expect(store.state.selectedNodeIds).toContain('node-1')
      expect(store.state.selectedNodeIds).toContain('node-2')
    })
  })

  describe('actions', () => {
    it('upsertImageAsset action commits mutation', () => {
      store.dispatch('upsertImageAsset', { id: 'img1', url: 'http://example.com/img.png' })
      expect(store.state.imageAssets.img1).toBeDefined()
    })

    it('removeImageAsset action commits mutation', () => {
      store.dispatch('upsertImageAsset', { id: 'img1', url: 'http://example.com/img.png' })
      store.dispatch('removeImageAsset', { id: 'img1' })
      expect(store.state.imageAssets.img1).toBeUndefined()
    })

    it('toggleSizePanel action commits mutation', () => {
      const initial = store.state.showSizePanel
      store.dispatch('toggleSizePanel')
      expect(store.state.showSizePanel).toBe(!initial)
    })

    it('setSizePanelVisible action commits mutation', () => {
      store.dispatch('setSizePanelVisible', { visible: true })
      expect(store.state.showSizePanel).toBe(true)
    })

    it('addLayer action commits mutation', () => {
      store.dispatch('addLayer', { layerId: 'layer-2', name: 'New Layer' })
      expect(store.state.layers.find((l: any) => l.id === 'layer-2')).toBeDefined()
    })

    it('removeLayer action commits mutation', () => {
      store.dispatch('addLayer', { layerId: 'layer-2', name: 'To Remove' })
      store.dispatch('removeLayer', { layerId: 'layer-2' })
      expect(store.state.layers.find((l: any) => l.id === 'layer-2')).toBeUndefined()
    })

    it('setActiveLayer action commits mutation', () => {
      store.dispatch('addLayer', { layerId: 'layer-2', name: 'Second Layer' })
      store.dispatch('setActiveLayer', { layerId: 'layer-2' })
      expect(store.state.activeLayerId).toBe('layer-2')
    })

    it('setSelectedNode action commits mutation', () => {
      store.dispatch('setSelectedNode', { nodeId: 'test-node' })
      expect(store.state.selectedNodeId).toBe('test-node')
    })

    it('clearSelection action commits mutation', () => {
      store.dispatch('setSelectedNode', { nodeId: 'test-node' })
      store.dispatch('clearSelection')
      expect(store.state.selectedNodeId).toBeNull()
    })

    it('toggleBackgroundPanel action commits mutation', () => {
      const initial = store.state.showBackgroundPanel
      store.dispatch('toggleBackgroundPanel')
      expect(store.state.showBackgroundPanel).toBe(!initial)
    })

    it('toggleExportPanel action commits mutation', () => {
      const initial = store.state.showExportPanel
      store.dispatch('toggleExportPanel')
      expect(store.state.showExportPanel).toBe(!initial)
    })

    it('setLayoutInsets action commits mutation', () => {
      store.dispatch('setLayoutInsets', { leftPanelWidth: 250 })
      expect(store.state.layoutInsets.leftPanelWidth).toBe(250)
    })

    it('openLeftPanel action commits mutation', () => {
      store.dispatch('openLeftPanel', { mode: 'assets' })
      expect(store.state.leftPanel.open).toBe(true)
    })

    it('closeLeftPanel action commits mutation', () => {
      store.dispatch('openLeftPanel', { mode: 'assets' })
      store.dispatch('closeLeftPanel')
      expect(store.state.leftPanel.open).toBe(false)
    })

    it('setBackgroundPanelVisible action commits mutation', () => {
      store.dispatch('setBackgroundPanelVisible', { visible: true })
      expect(store.state.showBackgroundPanel).toBe(true)
    })

    it('setExportPanelVisible action commits mutation', () => {
      store.dispatch('setExportPanelVisible', { visible: true })
      expect(store.state.showExportPanel).toBe(true)
    })

    it('setSelectedNodes action commits mutation', () => {
      store.dispatch('setSelectedNodes', { nodeIds: ['node-1', 'node-2'] })
      expect(store.state.selectedNodeIds).toContain('node-1')
    })

    it('setFocusedNode action commits mutation', () => {
      store.dispatch('setFocusedNode', { nodeId: 'focused' })
      expect(store.state.focusedNodeId).toBe('focused')
    })
  })
})
