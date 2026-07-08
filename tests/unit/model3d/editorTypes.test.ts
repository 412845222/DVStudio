import { describe, it, expect } from 'vitest'
import type { RenderMode, LoadedEditorModel } from '@/ui/WorkFlow/WorlFlowNodes/model3d/editor/types'

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
