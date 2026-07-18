import { describe, it, expect } from 'vitest'
import {
  spanStart,
  spanEnd,
  containsFrame,
  normalizeSpans,
  addRange,
  removeRange,
  toggleRange,
  clipSpans,
  rangeIntersects,
  rangeFullyCovered,
  getPrevNext,
  type TimelineFrameSpan,
} from '@/store/timeline/spans'

describe('store/timeline/spans', () => {
  describe('spanStart / spanEnd', () => {
    it('returns the number itself for a single-frame span (number form)', () => {
      expect(spanStart(42)).toBe(42)
      expect(spanEnd(42)).toBe(42)
    })

    it('returns start/end fields for a range span', () => {
      const s: TimelineFrameSpan = { start: 10, end: 25 }
      expect(spanStart(s)).toBe(10)
      expect(spanEnd(s)).toBe(25)
    })

    it('does not swap reversed ranges (caller is responsible for normalization)', () => {
      const s: TimelineFrameSpan = { start: 30, end: 5 }
      expect(spanStart(s)).toBe(30)
      expect(spanEnd(s)).toBe(5)
    })
  })

  describe('normalizeSpans', () => {
    it('returns empty array for empty input', () => {
      expect(normalizeSpans([])).toEqual([])
    })

    it('collapses adjacent single-frame numbers into a range when >= 3 frames', () => {
      // 3 consecutive frames 10,11,12 should become one range span
      const out = normalizeSpans([10, 11, 12])
      expect(out).toEqual([{ start: 10, end: 12 }])
    })

    it('keeps 2 consecutive frames as two single-frame entries', () => {
      const out = normalizeSpans([5, 6])
      expect(out).toEqual([5, 6])
    })

    it('merges overlapping ranges', () => {
      const out = normalizeSpans([
        { start: 0, end: 10 },
        { start: 8, end: 20 },
      ])
      expect(out).toEqual([{ start: 0, end: 20 }])
    })

    it('sorts spans by start frame', () => {
      const out = normalizeSpans([{ start: 30, end: 40 }, 5, { start: 0, end: 10 }])
      expect(out).toEqual([{ start: 0, end: 10 }, { start: 30, end: 40 }])
    })

    it('merges ranges that touch (end+1 adjacent)', () => {
      const out = normalizeSpans([
        { start: 0, end: 9 },
        { start: 10, end: 20 },
      ])
      expect(out).toEqual([{ start: 0, end: 20 }])
    })
  })

  describe('addRange / removeRange / toggleRange', () => {
    it('addRange adds a new range and merges with existing', () => {
      const out = addRange([{ start: 0, end: 5 }], 6, 10)
      expect(out).toEqual([{ start: 0, end: 10 }])
    })

    it('addRange accepts reversed start/end', () => {
      const out = addRange([], 20, 10)
      expect(out).toEqual([{ start: 10, end: 20 }])
    })

    it('removeRange cuts a hole in an existing range', () => {
      const out = removeRange([{ start: 0, end: 20 }], 8, 12)
      // hole at 8..12 leaves 0..7 and 13..20
      expect(containsFrame(out, 7)).toBe(true)
      expect(containsFrame(out, 8)).toBe(false)
      expect(containsFrame(out, 12)).toBe(false)
      expect(containsFrame(out, 13)).toBe(true)
    })

    it('toggleRange toggles coverage: adds when not covered, removes when fully covered', () => {
      let s: TimelineFrameSpan[] = []
      s = toggleRange(s, 0, 10)
      expect(rangeFullyCovered(s, 0, 10)).toBe(true)
      s = toggleRange(s, 0, 10)
      expect(rangeFullyCovered(s, 0, 10)).toBe(false)
      expect(s).toEqual([])
    })
  })

  describe('clipSpans', () => {
    it('clips spans to the given bounds', () => {
      const out = clipSpans([{ start: 0, end: 100 }], 20, 50)
      expect(rangeFullyCovered(out, 20, 50)).toBe(true)
      expect(containsFrame(out, 19)).toBe(false)
      expect(containsFrame(out, 51)).toBe(false)
    })

    it('returns empty when bounds are invalid', () => {
      expect(clipSpans([{ start: 0, end: 10 }], 50, 10)).toEqual([])
    })
  })

  describe('containsFrame / rangeIntersects / rangeFullyCovered / getPrevNext', () => {
    const spans: TimelineFrameSpan[] = [
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ]

    it('containsFrame returns true for frames inside, false outside', () => {
      expect(containsFrame(spans, 0)).toBe(true)
      expect(containsFrame(spans, 10)).toBe(true)
      expect(containsFrame(spans, 15)).toBe(false)
      expect(containsFrame(spans, 25)).toBe(true)
      expect(containsFrame(spans, 31)).toBe(false)
    })

    it('rangeIntersects detects any overlap', () => {
      expect(rangeIntersects(spans, 8, 12)).toBe(true) // touches first span
      expect(rangeIntersects(spans, 11, 19)).toBe(false) // gap
      expect(rangeIntersects(spans, 28, 40)).toBe(true) // touches second span
    })

    it('rangeFullyCovered checks continuous coverage', () => {
      expect(rangeFullyCovered(spans, 0, 10)).toBe(true)
      expect(rangeFullyCovered(spans, 5, 25)).toBe(false) // crosses the gap
      expect(rangeFullyCovered(spans, 20, 30)).toBe(true)
    })

    it('getPrevNext returns adjacent frame boundaries', () => {
      // before both spans
      expect(getPrevNext(spans, -5)).toEqual({ prev: null, next: 0 })
      // inside first span
      expect(getPrevNext(spans, 5)).toEqual({ prev: 10, next: 20 })
      // in the gap
      expect(getPrevNext(spans, 15)).toEqual({ prev: 10, next: 20 })
      // after both spans
      expect(getPrevNext(spans, 50)).toEqual({ prev: 30, next: null })
    })

    it('handles empty spans gracefully', () => {
      expect(containsFrame([], 0)).toBe(false)
      expect(rangeIntersects([], 0, 10)).toBe(false)
      expect(rangeFullyCovered([], 0, 10)).toBe(false)
      expect(getPrevNext([], 5)).toEqual({ prev: null, next: null })
    })
  })
})
