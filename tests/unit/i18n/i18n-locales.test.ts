import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

function flattenMessageKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      keys.add(fullKey)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flattenMessageKeys(value as Record<string, unknown>, fullKey)) {
        keys.add(nested)
      }
    }
  }
  return keys
}

function checkEmptyValues(obj: Record<string, unknown>, prefix = ''): string[] {
  const empty: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string' && value.trim() === '') {
      empty.push(fullKey)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      empty.push(...checkEmptyValues(value as Record<string, unknown>, fullKey))
    }
  }
  return empty
}

describe('i18n translation keys consistency', () => {
  const zhKeys = flattenMessageKeys(zhCN.messages)
  const enKeys = flattenMessageKeys(enUS.messages)

  it('en-US has all keys that zh-CN has', () => {
    const missing = [...zhKeys].filter(k => !enKeys.has(k))
    expect(missing, `Missing keys in en-US (${missing.length}): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`).toHaveLength(0)
  })

  it('zh-CN has all keys that en-US has', () => {
    const extra = [...enKeys].filter(k => !zhKeys.has(k))
    expect(extra, `Extra keys in en-US (${extra.length}): ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? '...' : ''}`).toHaveLength(0)
  })

  it('no translation value is empty in zh-CN', () => {
    const empty = checkEmptyValues(zhCN.messages)
    expect(empty, `Empty translation values in zh-CN: ${empty.join(', ')}`).toHaveLength(0)
  })

  it('no translation value is empty in en-US', () => {
    const empty = checkEmptyValues(enUS.messages)
    expect(empty, `Empty translation values in en-US: ${empty.join(', ')}`).toHaveLength(0)
  })

  it('has meta information in both locales', () => {
    expect(zhCN.meta).toBeDefined()
    expect(enUS.meta).toBeDefined()
    expect(zhCN.meta.code).toBe('zh-CN')
    expect(enUS.meta.code).toBe('en-US')
  })

  it('has substantial number of translation keys', () => {
    expect(zhKeys.size).toBeGreaterThan(500)
    expect(enKeys.size).toBeGreaterThan(500)
  })

  it('key counts match between locales', () => {
    expect(zhKeys.size).toBe(enKeys.size)
  })
})
