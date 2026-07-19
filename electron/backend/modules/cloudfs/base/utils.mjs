import path from 'node:path'
import crypto from 'node:crypto'

export function generateKey(prefix, contentType, extension) {
  const timestamp = Date.now()
  const random = crypto.randomBytes(8).toString('hex')
  const ext = extension || guessExtensionFromMime(contentType) || ''
  const safePrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : ''
  return `${safePrefix}${timestamp}-${random}${ext}`
}

export function guessExtensionFromMime(mimeType) {
  const mimeMap = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/octet-stream': '.bin',
    'model/gltf-binary': '.glb',
    'model/gltf+json': '.gltf',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  }
  return mimeMap[mimeType] || ''
}

export function getFileNameFromKey(key) {
  if (!key) return ''
  const parts = key.split('/')
  return parts[parts.length - 1] || key
}

export function getParentPrefix(key) {
  if (!key) return ''
  const parts = key.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}

export function isFolder(key, delimiter = '/') {
  return key.endsWith(delimiter)
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`
}

export function sanitizeBucketName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
}

export function generateDefaultBucketName() {
  const suffix = crypto.randomBytes(6).toString('hex').toLowerCase()
  return sanitizeBucketName(`dvstudio-${suffix}`)
}

export function sanitizeFileName(fileName) {
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

export function buildObjectKey(prefix, fileName) {
  const safePrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : ''
  if (fileName) {
    return `${safePrefix}${sanitizeFileName(fileName)}`
  }
  return generateKey(prefix)
}

export function isValidHttpsUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}
