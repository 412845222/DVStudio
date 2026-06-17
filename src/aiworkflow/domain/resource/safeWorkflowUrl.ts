const trimText = (value: unknown) => String(value ?? '').trim()

const isBlockedScheme = (text: string) => {
  const lower = text.toLowerCase()
  return (
    lower.startsWith('package://') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  )
}

export const sanitizeWorkflowMediaUrl = (value: unknown) => {
  const text = trimText(value)
  if (!text) return ''
  if (isBlockedScheme(text)) return ''
  return text
}

export const sanitizeWorkflowUrlFieldsDeep = <T>(value: T): T => {
  if (!value || typeof value !== 'object') return value

  const walk = (cur: any) => {
    if (!cur || typeof cur !== 'object') return
    if (Array.isArray(cur)) {
      for (const item of cur) walk(item)
      return
    }
    for (const key of Object.keys(cur)) {
      const next = cur[key]
      if (typeof next === 'string') {
        if (/url|poster|thumbnail|preview/i.test(key)) {
          cur[key] = sanitizeWorkflowMediaUrl(next)
        }
        continue
      }
      walk(next)
    }
  }

  walk(value as any)
  return value
}