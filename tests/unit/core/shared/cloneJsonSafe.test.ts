import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cloneJsonSafe } from '@/core/shared/cloneJsonSafe'

describe('cloneJsonSafe', () => {
  describe('primitives', () => {
    it('returns primitives as-is', () => {
      expect(cloneJsonSafe(null)).toBe(null)
      expect(cloneJsonSafe(undefined)).toBe(undefined)
      expect(cloneJsonSafe(42)).toBe(42)
      expect(cloneJsonSafe('hello')).toBe('hello')
      expect(cloneJsonSafe(true)).toBe(true)
      expect(cloneJsonSafe(false)).toBe(false)
    })

    it('returns same reference for primitives', () => {
      const num = 123
      expect(cloneJsonSafe(num)).toBe(123)
      const str = 'test'
      expect(cloneJsonSafe(str)).toBe('test')
    })
  })

  describe('plain objects', () => {
    it('clones plain objects', () => {
      const original = { a: 1, b: { c: 2 } }
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
      expect(cloned.b).not.toBe(original.b)
    })

    it('handles empty objects', () => {
      const original = {}
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual({})
      expect(cloned).not.toBe(original)
    })

    it('handles nested objects with various types', () => {
      const original = {
        str: 'hello',
        num: 42,
        bool: true,
        null: null,
        arr: [1, 2, 3],
        nested: { key: 'value' },
      }
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
      expect(cloned.nested).not.toBe(original.nested)
    })

    it('handles objects with undefined values', () => {
      const original = { a: undefined, b: 'defined' }
      const cloned = cloneJsonSafe(original)
      // JSON.stringify removes undefined, so clone may not have 'a'
      expect(cloned).toEqual({ b: 'defined' })
    })

    it('handles circular references by fallback', () => {
      const original: any = { a: 1 }
      original.self = original
      // Should not throw, uses fallback
      expect(() => cloneJsonSafe(original)).not.toThrow()
    })
  })

  describe('arrays', () => {
    it('clones arrays', () => {
      const original = [1, 2, 3]
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
    })

    it('handles nested arrays', () => {
      const original = [[1, 2], [3, 4]]
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
      expect(cloned[0]).not.toBe(original[0])
      expect(cloned[1]).not.toBe(original[1])
    })

    it('handles mixed arrays', () => {
      const original = [1, 'a', true, null, { obj: true }]
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
      expect(cloned[4]).not.toBe(original[4])
    })

    it('handles empty arrays', () => {
      const original: number[] = []
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual([])
      expect(cloned).not.toBe(original)
    })
  })

  describe('Date objects', () => {
    it('clones Date objects', () => {
      const original = new Date('2024-01-01T00:00:00Z')
      const cloned = cloneJsonSafe(original)
      expect(cloned).toBeInstanceOf(Date)
      expect((cloned as Date).getTime()).toBe(original.getTime())
    })

    it('handles invalid dates', () => {
      const original = new Date('invalid')
      const cloned = cloneJsonSafe(original)
      expect(cloned).toBeInstanceOf(Date)
    })
  })

  describe('Vuex Proxy objects', () => {
    it('handles Vuex reactive proxy objects', () => {
      // Simulate Vuex reactive state
      const original = new Proxy({ a: 1, b: { c: 2 } }, {
        get(target, prop) {
          return Reflect.get(target, prop)
        },
      })
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual({ a: 1, b: { c: 2 } })
      expect(cloned).not.toBe(original)
    })
  })

  describe('edge cases', () => {
    it('handles very large objects', () => {
      const largeObj: Record<string, number> = {}
      for (let i = 0; i < 10000; i++) {
        largeObj[`key${i}`] = i
      }
      const cloned = cloneJsonSafe(largeObj)
      expect(Object.keys(cloned).length).toBe(10000)
      expect(cloned).not.toBe(largeObj)
    })

    it('handles objects with special string characters', () => {
      const original = {
        withNewline: 'line1\nline2',
        withTab: 'col1\tcol2',
        withQuotes: '"quoted"',
        withBackslash: 'path\\to\\file',
      }
      const cloned = cloneJsonSafe(original)
      expect(cloned).toEqual(original)
    })

    it('does not share references between clones', () => {
      const shared = { x: 1 }
      const original = { a: shared, b: shared }
      const cloned = cloneJsonSafe(original)
      expect(cloned.a).not.toBe(cloned.b)
      expect(cloned.a).not.toBe(original.a)
    })
  })
})
