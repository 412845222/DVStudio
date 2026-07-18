import { describe, it, expect } from 'vitest'

function encodeRfc5987Value(str: string): string {
  return encodeURIComponent(str).replace(/['()]/g, escape).replace(/\*/g, '%2A')
}

function buildContentDisposition(fileName: string | undefined | null): string {
  if (!fileName) return 'inline'
  const encodedName = encodeRfc5987Value(fileName)
  const simpleName = fileName.replace(/[^\x20-\x7E]/g, '_')
  return `inline; filename="${simpleName}"; filename*=UTF-8''${encodedName}`
}

function isRetryableError(err: any): boolean {
  const msg = String(err?.message || err || '')
  return (
    msg.includes('socket hang up') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('EPIPE') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('network timeout') ||
    msg.includes('socket disconnected') ||
    (err?.status === 429) ||
    (err?.status >= 500 && err?.status < 600)
  )
}

function sanitizeFileName(fileName: string): string {
  if (!fileName) return 'file'
  let name = String(fileName)
    .replace(/[\\/]/g, '_')
    .replace(/\.\.+/g, '_')
    .trim()
  while (name.length > 0 && (name[0] === '.' || name[0] === '_')) {
    name = name.slice(1)
  }
  name = name.trim()
  return name || 'file'
}

function buildObjectKey(prefix: string, fileName?: string): string {
  const safePrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : ''
  if (fileName) {
    return `${safePrefix}${sanitizeFileName(fileName)}`
  }
  return `${safePrefix}${Date.now()}`
}

describe('buildContentDisposition', () => {
  it('returns inline for empty/null/undefined filename', () => {
    expect(buildContentDisposition('')).toBe('inline')
    expect(buildContentDisposition(null as unknown as string)).toBe('inline')
    expect(buildContentDisposition(undefined)).toBe('inline')
  })

  it('builds inline disposition with RFC 5987 encoding for Chinese filenames', () => {
    const cd = buildContentDisposition('测试文件.png')
    expect(cd.startsWith('inline;')).toBe(true)
    expect(cd).toContain("filename*=UTF-8''")
    expect(cd).not.toContain('attachment')
  })

  it('uses ASCII fallback filename replacing non-ASCII with underscores', () => {
    const cd = buildContentDisposition('测试文件.png')
    expect(cd).toMatch(/filename="____\.png"/)
  })

  it('preserves ASCII filenames in the simple filename field', () => {
    const cd = buildContentDisposition('photo.jpg')
    expect(cd).toContain('filename="photo.jpg"')
    expect(cd.startsWith('inline;')).toBe(true)
  })

  it('encodes spaces in RFC 5987 field', () => {
    const cd = buildContentDisposition('my photo.jpg')
    expect(cd).toContain("filename*=UTF-8''my%20photo.jpg")
  })

  it('sets inline for preview rather than attachment', () => {
    const cd = buildContentDisposition('document.pdf')
    expect(cd.startsWith('inline;')).toBe(true)
    expect(cd).not.toContain('attachment')
  })

  it('handles filenames with parentheses and quotes correctly', () => {
    const cd = buildContentDisposition("file (1).png")
    expect(cd.startsWith('inline;')).toBe(true)
    expect(cd).toContain('filename*=UTF-8')
  })
})

describe('isRetryableError', () => {
  it('returns true for socket hang up errors', () => {
    expect(isRetryableError(new Error('socket hang up'))).toBe(true)
    expect(isRetryableError({ message: 'socket hang up, PUT https://...' })).toBe(true)
  })

  it('returns true for connection reset/timeout errors', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true)
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isRetryableError(new Error('EPIPE'))).toBe(true)
    expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true)
  })

  it('returns true for network timeout messages', () => {
    expect(isRetryableError(new Error('network timeout'))).toBe(true)
    expect(isRetryableError(new Error('socket disconnected'))).toBe(true)
  })

  it('returns true for HTTP 429 (rate limit) and 5xx errors', () => {
    expect(isRetryableError({ status: 429, message: 'Too Many Requests' })).toBe(true)
    expect(isRetryableError({ status: 500, message: 'Internal Server Error' })).toBe(true)
    expect(isRetryableError({ status: 502, message: 'Bad Gateway' })).toBe(true)
    expect(isRetryableError({ status: 503, message: 'Service Unavailable' })).toBe(true)
    expect(isRetryableError({ status: 504, message: 'Gateway Timeout' })).toBe(true)
  })

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('AccessDenied'))).toBe(false)
    expect(isRetryableError(new Error('InvalidAccessKeyId'))).toBe(false)
    expect(isRetryableError(new Error('SignatureDoesNotMatch'))).toBe(false)
    expect(isRetryableError({ status: 400, message: 'Bad Request' })).toBe(false)
    expect(isRetryableError({ status: 403, message: 'Forbidden' })).toBe(false)
    expect(isRetryableError({ status: 404, message: 'Not Found' })).toBe(false)
  })

  it('handles string error input', () => {
    expect(isRetryableError('socket hang up')).toBe(true)
    expect(isRetryableError('some other error')).toBe(false)
  })

  it('handles null/undefined gracefully', () => {
    expect(isRetryableError(null)).toBe(false)
    expect(isRetryableError(undefined)).toBe(false)
  })
})

describe('buildObjectKey with fileName', () => {
  it('uses the sanitized original filename when provided', () => {
    expect(buildObjectKey('image', 'photo.jpg')).toBe('image/photo.jpg')
    expect(buildObjectKey('uploads', '测试文件.png')).toBe('uploads/测试文件.png')
  })

  it('handles nested prefixes', () => {
    expect(buildObjectKey('a/b/c', 'file.txt')).toBe('a/b/c/file.txt')
  })

  it('strips leading/trailing slashes from prefix', () => {
    expect(buildObjectKey('/uploads/', 'photo.jpg')).toBe('uploads/photo.jpg')
    expect(buildObjectKey('//images///', 'pic.png')).toBe('images/pic.png')
  })

  it('sanitizes path traversal attempts in filename', () => {
    const key = buildObjectKey('uploads', '../etc/passwd')
    expect(key).not.toContain('..')
    expect(key.startsWith('uploads/')).toBe(true)
  })

  it('replaces backslashes in filename', () => {
    expect(buildObjectKey('docs', 'path\\to\\file.txt')).toBe('docs/path_to_file.txt')
  })
})
