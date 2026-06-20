import { ref, type Ref } from 'vue'

export type BlueprintLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
export type BlueprintLogCategory = 'runtime' | 'request' | 'operation' | 'system'

export interface BlueprintLogEntry {
  id: string
  timestamp: number
  level: BlueprintLogLevel
  category: BlueprintLogCategory
  tag?: string
  message: string
  detail?: unknown
}

export interface BlueprintLogAppendOptions {
  level?: BlueprintLogLevel
  category?: BlueprintLogCategory
  tag?: string
  detail?: unknown
  timestamp?: number
}

const DEFAULT_MAX_ENTRIES = 2000

const entriesRef: Ref<BlueprintLogEntry[]> = ref<BlueprintLogEntry[]>([])
const maxEntriesRef: Ref<number> = ref<number>(DEFAULT_MAX_ENTRIES)

const sanitizeDetail = (value: unknown): unknown => {
  if (value == null) return value
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  try {
    const serialized = JSON.stringify(value, cycleSafeReplacer(20))
    // Prefer returning original when possible; avoid circulars by returning parsed copy
    return JSON.parse(serialized)
  } catch {
    return String(value)
  }
}

const cycleSafeReplacer = (maxDepth: number) => {
  const seen = new WeakSet()
  let depth = 0
  return (_key: string, value: unknown) => {
    if (value == null) return value
    if (typeof value !== 'object') {
      return value
    }
    if (seen.has(value)) return '[Circular]'
    if (depth >= maxDepth) return '[Truncated]'
    seen.add(value)
    depth += 1
    return value
  }
}

const trimToLimit = () => {
  const limit = Number.isFinite(maxEntriesRef.value) && maxEntriesRef.value > 0 ? maxEntriesRef.value : DEFAULT_MAX_ENTRIES
  const current = entriesRef.value
  if (current.length <= limit) return
  entriesRef.value = current.slice(current.length - limit)
}

const nextId = (): string => {
  const rand = Math.random().toString(36).slice(2, 8)
  return `lg-${Date.now().toString(36)}-${rand}`
}

export const blueprintLog = {
  /** Current entries (observable ref) — do not mutate directly. */
  get entries() {
    return entriesRef
  },
  get maxEntries() {
    return maxEntriesRef.value
  },
  setMaxEntries(value: number) {
    const next = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_ENTRIES
    maxEntriesRef.value = next
    trimToLimit()
  },
  append(message: string, options?: BlueprintLogAppendOptions): BlueprintLogEntry {
    const entry: BlueprintLogEntry = {
      id: nextId(),
      timestamp: options?.timestamp ?? Date.now(),
      level: (options?.level ?? 'INFO') as BlueprintLogLevel,
      category: (options?.category ?? 'system') as BlueprintLogCategory,
      tag: options?.tag,
      message: String(message ?? ''),
      detail: options?.detail !== undefined ? sanitizeDetail(options.detail) : undefined,
    }
    entriesRef.value = [...entriesRef.value, entry]
    trimToLimit()
    return entry
  },
  clear() {
    entriesRef.value = []
  },
  exportAsJson(): string {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        maxEntries: maxEntriesRef.value,
        entries: entriesRef.value,
      },
      null,
      2,
    )
  },
  exportAsText(): string {
    const lines: string[] = []
    lines.push(`# Blueprint Log Export`)
    lines.push(`# Exported at: ${new Date().toISOString()}`)
    lines.push(`# Total entries: ${entriesRef.value.length}`)
    lines.push('')
    for (const e of entriesRef.value) {
      const t = new Date(e.timestamp).toISOString()
      const tagPart = e.tag ? ` [${e.tag}]` : ''
      lines.push(`[${t}] [${e.level}] [${e.category}]${tagPart} ${e.message}`)
      if (e.detail !== undefined) {
        try {
          const detailText = typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail, null, 2)
          for (const ln of detailText.split('\n')) {
            lines.push(`    ${ln}`)
          }
        } catch {
          lines.push(`    ${String(e.detail)}`)
        }
      }
    }
    return lines.join('\n')
  },
}

/** URL matching for requests that should be excluded from the log (ping/health). */
export const shouldSkipRequestLog = (url: string): boolean => {
  if (!url) return true
  try {
    const lower = String(url).toLowerCase()
    // Prefer parsing with a bogus base when relative paths are passed
    const pathname = lower.startsWith('/')
      ? lower
      : (() => {
          try {
            return new URL(lower, 'http://localhost/').pathname
          } catch {
            return lower
          }
        })()
    const stripped = pathname.replace(/\/+$/, '')
    const segments = stripped.split('/').filter(Boolean)
    if (segments.length === 0) return false
    const last = segments[segments.length - 1]
    if (/^(ping|health|ready|heartbeat|alive)$/.test(last)) return true
    return false
  } catch {
    return false
  }
}
