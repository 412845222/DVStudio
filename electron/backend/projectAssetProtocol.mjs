import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { protocol, net } from 'electron'

// 项目静态资产在 Electron 中通过 dweb://project-assets 协议直接读取本地磁盘，
// 不再回落到 Django 的 /api/workflow/projects/assets/file。
// Django 仍负责 upload/import/delete/resolve/repair 等会落盘或远程拉取的操作。

const DWEB_PROJECT_ASSET_HOST = 'project-assets'

// 注册表：projectId (number) -> 项目根目录绝对路径 (string)
// 允许在同一进程中切换/打开不同的项目，只要前端调用 registerProjectRoots IPC。
const projectRootById = new Map()

function parseDwebAssetUrl(rawUrl) {
  const text = String(rawUrl || '').trim()
  if (!text) return null
  let u
  try {
    u = new URL(text)
  } catch {
    return null
  }
  if (String(u.protocol || '').toLowerCase() !== 'dweb:') return null
  if (String(u.hostname || '').toLowerCase() !== DWEB_PROJECT_ASSET_HOST) return null
  const projectIdRaw = String(u.searchParams.get('projectId') || '').trim()
  const relPathRaw = String(u.searchParams.get('path') || '').trim()
  if (!projectIdRaw || !relPathRaw) return null
  const projectId = Number(projectIdRaw)
  if (!Number.isFinite(projectId) || projectId <= 0) return null
  const variant = String(u.searchParams.get('variant') || u.searchParams.get('mode') || '').trim().toLowerCase()
  const maxSizeRaw = String(u.searchParams.get('maxSize') || u.searchParams.get('max_size') || '').trim()
  const versionTag = String(u.searchParams.get('v') || '').trim()
  const maxSize = maxSizeRaw ? Math.max(128, Math.min(4096, Math.floor(Number(maxSizeRaw) || 640))) : null
  return {
    projectId: Math.floor(projectId),
    relPath: relPathRaw,
    variant,
    maxSize,
    versionTag,
  }
}

function safeResolveProjectFile(root, relPath) {
  const rootStr = String(root || '').trim()
  if (!rootStr) return null
  const rel = String(relPath || '').trim().replace(/\\/g, '/')
  if (!rel) return null
  // 拒绝明显的路径穿越或绝对路径
  if (rel.startsWith('/')) return null
  if (rel.includes('..')) return null
  let normalized
  try {
    normalized = path.resolve(rootStr, ...rel.split('/').filter((seg) => seg && seg !== '.'))
  } catch {
    return null
  }
  const resolvedRoot = path.resolve(rootStr)
  if (normalized !== resolvedRoot && !normalized.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  return normalized
}

function guessMimeType(filePath) {
  const lower = String(filePath || '').toLowerCase()
  const extMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.pdf': 'application/pdf',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.obj': 'text/plain',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }
  const ext = path.extname(lower)
  return extMap[ext] || 'application/octet-stream'
}

function readFileSyncSafe(filePath, maxBytes) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return null
    const size = Number(stat.size || 0)
    if (size <= 0) return Buffer.alloc(0)
    if (maxBytes && size > maxBytes) {
      const fd = fs.openSync(filePath, 'r')
      try {
        const buf = Buffer.alloc(maxBytes)
        const read = fs.readSync(fd, buf, 0, maxBytes, 0)
        return read > 0 ? buf.slice(0, read) : null
      } finally {
        fs.closeSync(fd)
      }
    }
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

function makePreviewImage(filePath, maxSize) {
  if (!maxSize || !Number.isFinite(maxSize)) return null
  try {
    const nativeImage = require('electron').nativeImage
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return null
    const img = nativeImage.createFromPath(filePath)
    if (!img || img.isEmpty()) return null
    const size = img.getSize()
    const srcWidth = Number(size.width || 0)
    const srcHeight = Number(size.height || 0)
    if (!srcWidth || !srcHeight) return null
    let targetWidth = srcWidth
    let targetHeight = srcHeight
    if (srcWidth > maxSize || srcHeight > maxSize) {
      const ratio = Math.min(maxSize / srcWidth, maxSize / srcHeight)
      targetWidth = Math.max(1, Math.floor(srcWidth * ratio))
      targetHeight = Math.max(1, Math.floor(srcHeight * ratio))
    }
    const resized = img.resize({ width: targetWidth, height: targetHeight })
    if (resized.isEmpty()) return null
    const png = resized.toPNG()
    if (!png || !png.length) return null
    return { buffer: png, contentType: 'image/png' }
  } catch {
    return null
  }
}

function buildInMemoryResponse(buffer, contentType, status) {
  return new Response(new Blob([buffer], { type: contentType }), {
    status: status || 200,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function handleProjectAssetRequest(request) {
  const parsed = parseDwebAssetUrl(request.url)
  if (!parsed) {
    return new Response('Bad Request', { status: 400 })
  }
  const root = projectRootById.get(parsed.projectId)
  if (!root) {
    return new Response('Project Root Not Registered', { status: 404, statusText: 'Project Root Not Registered' })
  }
  const filePath = safeResolveProjectFile(root, parsed.relPath)
  if (!filePath) {
    return new Response('Invalid Asset Path', { status: 400 })
  }
  if (!fs.existsSync(filePath)) {
    return new Response('Asset Not Found', { status: 404 })
  }
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    return new Response('Asset Stat Failed', { status: 500 })
  }
  if (!stat.isFile()) {
    return new Response('Asset Is Not A File', { status: 404 })
  }

  // 预览/缩略图：只对常见图片做下采样，其它一律按原样返回
  const ext = path.extname(filePath).toLowerCase()
  const isImagePreview =
    parsed.variant === 'preview' || parsed.variant === 'thumb' || parsed.variant === 'thumbnail'
  if (isImagePreview && ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'].includes(ext)) {
    const preview = makePreviewImage(filePath, parsed.maxSize || 640)
    if (preview && preview.buffer) {
      return buildInMemoryResponse(preview.buffer, preview.contentType, 200)
    }
  }

  // 走 Node.js stream -> Blob -> Response 的方式，兼容 protocol.handle
  try {
    const buffer = readFileSyncSafe(filePath, 512 * 1024 * 1024)
    if (buffer === null || !Buffer.isBuffer(buffer)) {
      return new Response('Asset Read Failed', { status: 500 })
    }
    return buildInMemoryResponse(buffer, guessMimeType(filePath), 200)
  } catch {
    return new Response('Asset Read Failed', { status: 500 })
  }
}

export function registerDwebProjectAssetProtocol() {
  try {
    protocol.handle('dweb', async (request) => {
      try {
        const host = String(new URL(request.url).hostname || '').toLowerCase()
        if (host === DWEB_PROJECT_ASSET_HOST) {
          return handleProjectAssetRequest(request)
        }
        return new Response('Not Found', { status: 404 })
      } catch (err) {
        return new Response(String(err?.message || err || 'protocol error'), { status: 500 })
      }
    })
    return true
  } catch (err) {
    console.error('[dweb-protocol] register failed:', err)
    return false
  }
}

export function setProjectRoot(projectId, rootPath) {
  const id = Number(projectId)
  const root = String(rootPath || '').trim()
  if (!Number.isFinite(id) || id <= 0) return false
  if (!root) {
    projectRootById.delete(id)
    return true
  }
  projectRootById.set(id, root)
  return true
}

export function clearProjectRoot(projectId) {
  const id = Number(projectId)
  if (Number.isFinite(id) && id > 0) projectRootById.delete(id)
}

export function getProjectRootSnapshot() {
  const result = {}
  for (const [k, v] of projectRootById.entries()) result[String(k)] = v
  return result
}

// 通过已注册的 projectId 获取项目根目录（供主进程其他模块使用）
export function getProjectRootById(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return null
  return projectRootById.get(id) || null
}

// 将远程 URL 的文件下载到指定项目根目录下的 generated-assets 子目录。
// 返回绝对路径（absolutePath）和相对根目录的相对路径（relativePath）。
export async function downloadUrlToProjectRoot(projectId, rawUrl, desiredFilename) {
  const id = Number(projectId)
  const url = String(rawUrl || '').trim()
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }
  if (!url) return { ok: false, error: 'url is empty' }

  const root = projectRootById.get(id)
  if (!root) return { ok: false, error: `project root not registered for projectId=${id}` }

  const safeName = sanitizeFilename(desiredFilename || url)
  const ext = inferExtension(safeName, url)
  const base = safeName.replace(/\.[^.]+$/, '') || `asset-${Date.now()}`
  const filename = `${base}${ext}`

  const subDir = path.resolve(root, 'generated-assets')
  try {
    fs.mkdirSync(subDir, { recursive: true })
  } catch (err) {
    return { ok: false, error: `mkdir failed: ${String(err?.message || err)}` }
  }

  const absolutePath = path.resolve(subDir, filename)
  const relativePath = path.relative(root, absolutePath)

  try {
    await fetchRemoteUrl(url, absolutePath)
  } catch (err) {
    return { ok: false, error: `download failed: ${String(err?.message || err)}` }
  }

  try {
    const st = fs.statSync(absolutePath)
    if (!st.isFile() || st.size === 0) {
      return { ok: false, error: 'downloaded file is empty or not a regular file' }
    }
  } catch (err) {
    return { ok: false, error: `stat failed: ${String(err?.message || err)}` }
  }

  return {
    ok: true,
    absolutePath,
    relativePath,
    size: fs.statSync(absolutePath).size,
  }
}

function sanitizeFilename(name) {
  const raw = String(name || '').trim()
  if (!raw) return `asset-${Date.now()}`
  let safe = raw.split('?')[0].split('#')[0]
  const idx = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'))
  if (idx >= 0) safe = safe.slice(idx + 1)
  safe = safe.replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_')
  safe = safe.replace(/^[\s.]+/, '')
  if (!safe) return `asset-${Date.now()}`
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
  if (reserved.test(safe)) return `asset-${safe}-${Date.now()}`
  if (safe.length > 128) safe = safe.slice(0, 120) + '-' + Date.now().toString(36)
  return safe
}

function inferExtension(safeName, rawUrl) {
  const lower = String(safeName || '').toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  if (dotIdx > 0 && dotIdx >= lower.length - 8) return lower.slice(dotIdx)
  const urlLower = String(rawUrl || '').toLowerCase()
  const extMap = {
    jpg: '.jpg',
    jpeg: '.jpg',
    png: '.png',
    webp: '.webp',
    gif: '.gif',
    bmp: '.bmp',
    mp4: '.mp4',
    mov: '.mov',
    webm: '.webm',
    mkv: '.mkv',
    m4v: '.m4v',
  }
  for (const [key, ext] of Object.entries(extMap)) {
    if (urlLower.includes(`.${key}`)) return ext
  }
  return '.bin'
}

function fetchRemoteUrl(rawUrl, targetPath) {
  return new Promise((resolve, reject) => {
    let urlObj
    try {
      urlObj = new URL(rawUrl)
    } catch (err) {
      reject(new Error(`invalid url: ${String(err)}`))
      return
    }

    const module = urlObj.protocol === 'https:' ? https : http
    const options = {
      method: 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'DwebVideoStudio/1.0 (Electron)',
      },
      timeout: 120 * 1000,
    }

    const tmpPath = targetPath + '.part'
    const handleError = (err) => {
      try { fs.unlinkSync(tmpPath) } catch {}
      reject(err)
    }

    const req = module.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchRemoteUrl(String(res.headers.location), targetPath).then(resolve, reject)
        return
      }
      if (!res.statusCode || res.statusCode >= 400) {
        handleError(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const file = fs.createWriteStream(tmpPath)
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, targetPath)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })
      file.on('error', handleError)
      res.on('error', handleError)
      res.pipe(file)
    })
    req.on('error', handleError)
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'))
    })
    req.end()
  })
}

export { DWEB_PROJECT_ASSET_HOST }
