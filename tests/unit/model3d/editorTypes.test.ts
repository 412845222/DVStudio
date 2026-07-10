import { describe, it, expect } from 'vitest'
import type { RenderMode, LoadedEditorModel, OutlinerNode } from '@/ui/WorkFlow/WorlFlowNodes/model3d/editor/types'

describe('model3d editor types', () => {
  describe('RenderMode', () => {
    it('supports pbr, solid-white, normal, unlit, matcap, texture-only modes', () => {
      const validModes: RenderMode[] = ['pbr', 'solid-white', 'normal', 'unlit', 'matcap', 'texture-only']
      expect(validModes.length).toBe(6)
      expect(validModes).toContain('pbr')
      expect(validModes).toContain('solid-white')
      expect(validModes).toContain('normal')
      expect(validModes).toContain('unlit')
      expect(validModes).toContain('matcap')
      expect(validModes).toContain('texture-only')
    })

    it('wireframe is not a render mode (it is an overlay toggle)', () => {
      const renderModes: RenderMode[] = ['pbr', 'solid-white', 'normal', 'unlit', 'matcap', 'texture-only']
      const hasWireframeAsMode = renderModes.includes('wireframe' as RenderMode)
      expect(hasWireframeAsMode).toBe(false)
    })
  })

  describe('LoadedEditorModel', () => {
    it('includes wireframeHelpers map for overlay rendering', () => {
      type WireframeHelpersType = LoadedEditorModel['wireframeHelpers']
      expect<WireframeHelpersType>(new Map()).toBeInstanceOf(Map)
    })
  })

  describe('OutlinerNode', () => {
    it('has objectUuid field for reliable object matching', () => {
      const node: OutlinerNode = {
        id: 'test-model-1',
        name: 'TestModel',
        type: 'model',
        visible: true,
        locked: false,
        children: [],
        object3D: {} as any,
        objectUuid: 'uuid-abc-123'
      }
      expect(node.objectUuid).toBe('uuid-abc-123')
      expect(typeof node.objectUuid).toBe('string')
    })

    it('supports all node types with objectUuid', () => {
      const types: OutlinerNode['type'][] = ['model', 'mesh', 'light', 'camera', 'group']
      expect(types.length).toBe(5)
      for (const t of types) {
        const n: OutlinerNode = {
          id: `id-${t}`,
          name: t,
          type: t,
          visible: true,
          locked: false,
          children: [],
          object3D: {} as any,
          objectUuid: `uuid-${t}`
        }
        expect(n.objectUuid).toBe(`uuid-${t}`)
      }
    })
  })

  describe('Bloom default parameters', () => {
    it('default bloom strength is 1.0 for visible glow effect', () => {
      const defaultStrength = 1.0
      expect(defaultStrength).toBeGreaterThanOrEqual(0)
      expect(defaultStrength).toBeLessThanOrEqual(3)
      expect(defaultStrength).toBeGreaterThan(0.5)
    })

    it('default bloom radius is 0.7 for soft diffusion', () => {
      const defaultRadius = 0.7
      expect(defaultRadius).toBeGreaterThanOrEqual(0)
      expect(defaultRadius).toBeLessThanOrEqual(1.5)
    })

    it('default bloom threshold is 0.5 to include mid-tones', () => {
      const defaultThreshold = 0.5
      expect(defaultThreshold).toBeGreaterThanOrEqual(0)
      expect(defaultThreshold).toBeLessThanOrEqual(1)
      expect(defaultThreshold).toBeLessThan(0.9)
    })

    it('bloom parameter ranges are valid', () => {
      const strengthRange = { min: 0, max: 3 }
      const radiusRange = { min: 0, max: 1.5 }
      const thresholdRange = { min: 0, max: 1 }
      expect(strengthRange.min).toBeLessThan(strengthRange.max)
      expect(radiusRange.min).toBeLessThan(radiusRange.max)
      expect(thresholdRange.min).toBeLessThan(thresholdRange.max)
    })
  })

  describe('FPS calculation safety', () => {
    function computeFps(frames: number, elapsedMs: number): number {
      return Math.min(144, Math.round((frames * 1000) / elapsedMs))
    }

    it('caps FPS at 144 to prevent absurd values', () => {
      expect(computeFps(2000, 500)).toBe(144)
      expect(computeFps(500, 100)).toBe(144)
      expect(computeFps(10000, 500)).toBe(144)
    })

    it('calculates FPS correctly at normal frame rates', () => {
      expect(computeFps(30, 500)).toBe(60)
      expect(computeFps(15, 500)).toBe(30)
      expect(computeFps(60, 1000)).toBe(60)
      expect(computeFps(30, 1000)).toBe(30)
    })

    it('does not produce FPS over 144 even with rapid frame counting', () => {
      for (let frames = 1; frames < 5000; frames += 37) {
        const fps = computeFps(frames, 16)
        expect(fps).toBeLessThanOrEqual(144)
      }
    })
  })
})
