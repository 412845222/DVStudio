import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolate, translate, mergeMessages, normalizeLocale, isSupportedLocale, detectSystemLocale } from '@/i18n/helpers'

describe('i18n helpers', () => {
  describe('interpolate', () => {
    it('returns template unchanged when no params provided', () => {
      expect(interpolate('Hello World')).toBe('Hello World')
      expect(interpolate('Hello World', {})).toBe('Hello World')
      expect(interpolate('Hello World', undefined)).toBe('Hello World')
    })

    it('replaces single placeholder', () => {
      expect(interpolate('Hello {name}', { name: 'World' })).toBe('Hello World')
    })

    it('replaces multiple placeholders', () => {
      expect(interpolate('{greeting} {name}!', { greeting: 'Hello', name: 'World' })).toBe('Hello World!')
    })

    it('replaces same placeholder multiple times', () => {
      expect(interpolate('{x} + {x} = {y}', { x: '1', y: '2' })).toBe('1 + 1 = 2')
    })

    it('leaves unmatched placeholders intact', () => {
      expect(interpolate('Hello {name}, age {age}', { name: 'Alice' })).toBe('Hello Alice, age {age}')
    })

    it('converts number params to string', () => {
      expect(interpolate('Count: {count}', { count: 42 })).toBe('Count: 42')
    })

    it('handles null/undefined param values by keeping placeholder', () => {
      expect(interpolate('{a}{b}', { a: null as any, b: undefined as any })).toBe('{a}{b}')
    })

    it('handles empty string template', () => {
      expect(interpolate('', { a: 1 })).toBe('')
    })
  })

  describe('translate', () => {
    const messages = {
      'common.hello': 'Hello',
      'common.greeting': 'Hello {name}',
      'common.items': '{count} items',
    }

    it('returns translated string for existing key', () => {
      expect(translate(messages, 'common.hello')).toBe('Hello')
    })

    it('returns key itself when key not found', () => {
      expect(translate(messages, 'nonexistent.key')).toBe('nonexistent.key')
    })

    it('interpolates params in translated string', () => {
      expect(translate(messages, 'common.greeting', { name: 'Alice' })).toBe('Hello Alice')
    })

    it('handles number params', () => {
      expect(translate(messages, 'common.items', { count: 5 })).toBe('5 items')
    })

    it('returns key when messages is empty', () => {
      expect(translate({}, 'any.key')).toBe('any.key')
    })
  })

  describe('mergeMessages', () => {
    it('merges multiple message objects', () => {
      const a = { 'a.one': '1' }
      const b = { 'b.two': '2' }
      const c = { 'c.three': '3' }
      expect(mergeMessages(a, b, c)).toEqual({
        'a.one': '1',
        'b.two': '2',
        'c.three': '3',
      })
    })

    it('later keys override earlier ones', () => {
      const a = { 'key': 'first' }
      const b = { 'key': 'second' }
      expect(mergeMessages(a, b)).toEqual({ 'key': 'second' })
    })

    it('returns empty object for no arguments', () => {
      expect(mergeMessages()).toEqual({})
    })

    it('does not mutate source objects', () => {
      const a = { 'a': '1' }
      const b = { 'b': '2' }
      const result = mergeMessages(a, b)
      result['c'] = '3'
      expect(a).not.toHaveProperty('c')
      expect(b).not.toHaveProperty('c')
    })
  })

  describe('normalizeLocale', () => {
    it('normalizes Chinese locales to zh-CN', () => {
      expect(normalizeLocale('zh-CN')).toBe('zh-CN')
      expect(normalizeLocale('zh')).toBe('zh-CN')
      expect(normalizeLocale('zh_Hans_CN')).toBe('zh-CN')
      expect(normalizeLocale('zh-cn')).toBe('zh-CN')
    })

    it('normalizes Traditional Chinese to zh-TW', () => {
      expect(normalizeLocale('zh-TW')).toBe('zh-TW')
      expect(normalizeLocale('zh-HK')).toBe('zh-TW')
      expect(normalizeLocale('zh-MO')).toBe('zh-TW')
      expect(normalizeLocale('zh_tw')).toBe('zh-TW')
    })

    it('normalizes English locales to en-US', () => {
      expect(normalizeLocale('en')).toBe('en-US')
      expect(normalizeLocale('en-US')).toBe('en-US')
      expect(normalizeLocale('en-GB')).toBe('en-US')
      expect(normalizeLocale('en_us')).toBe('en-US')
    })

    it('returns normalized form for unknown locales', () => {
      expect(normalizeLocale('ja-JP')).toBe('ja-JP')
      expect(normalizeLocale('ko-KR')).toBe('ko-KR')
    })

    it('returns empty string for null/undefined/empty', () => {
      expect(normalizeLocale(null)).toBe('')
      expect(normalizeLocale(undefined)).toBe('')
      expect(normalizeLocale('')).toBe('')
    })
  })

  describe('isSupportedLocale', () => {
    it('returns true for supported locales', () => {
      expect(isSupportedLocale('zh-CN')).toBe(true)
      expect(isSupportedLocale('en-US')).toBe(true)
    })

    it('returns false for unsupported locales', () => {
      expect(isSupportedLocale('zh-TW')).toBe(false)
      expect(isSupportedLocale('ja-JP')).toBe(false)
      expect(isSupportedLocale('en-GB')).toBe(false)
      expect(isSupportedLocale('')).toBe(false)
    })
  })

  describe('detectSystemLocale', () => {
    it('returns navigator.language when available', () => {
      vi.stubGlobal('navigator', { language: 'en-US' })
      expect(detectSystemLocale()).toBe('en-US')
    })

    it('returns zh-CN as fallback when navigator unavailable', () => {
      vi.stubGlobal('navigator', undefined)
      expect(detectSystemLocale()).toBe('zh-CN')
    })
  })
})
