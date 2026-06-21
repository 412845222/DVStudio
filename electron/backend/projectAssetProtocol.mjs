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

  const rootCandidates = [root]
  try {
    const normalizedRoot = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    if (normalizedRoot.endsWith('/content/media')) {
      rootCandidates.push(path.resolve(String(root || ''), '..', '..'))
    } else if (normalizedRoot.endsWith('/generated-assets')) {
      rootCandidates.push(path.resolve(String(root || ''), '..'))
    }
  } catch {
    // ignore
  }

  const rel = String(parsed.relPath || '').trim().replace(/\\/g, '/')
  let cleanRel = rel
  if (cleanRel.startsWith('Content/Media/')) {
    cleanRel = cleanRel.slice('Content/Media/'.length)
  } else if (cleanRel.startsWith('content/media/')) {
    cleanRel = cleanRel.slice('content/media/'.length)
  } else if (cleanRel.startsWith('Media/')) {
    cleanRel = cleanRel.slice('Media/'.length)
  } else if (cleanRel.startsWith('media/')) {
    cleanRel = cleanRel.slice('media/'.length)
  }

  const candidates = [rel, cleanRel]

  const parts = rel.split('/').filter((p) => p && p !== '.')
  if (parts.length >= 2) {
    const firstDir = parts[0].toLowerCase()
    const restPath = parts.slice(1).join('/')
    const fileName = parts[parts.length - 1]

    if (firstDir === 'generated-assets') {
      candidates.push('Content/Media/' + restPath)
      if (restPath !== fileName) {
        candidates.push('Content/Media/' + fileName)
      }
    }
    if (firstDir === 'content' || firstDir === 'media' || firstDir === 'thumbnails') {
      candidates.push('generated-assets/' + fileName)
    }
  } else if (parts.length === 1) {
    candidates.push('Content/Media/' + parts[0])
    candidates.push('generated-assets/' + parts[0])
  }

  if (parts.length >= 2) {
    const firstDir = parts[0].toLowerCase()
    const secondDir = parts[1]?.toLowerCase()
    if (firstDir === 'content' && secondDir === 'media' && parts.length >= 3) {
      candidates.push(parts.slice(2).join('/'))
    } else if (firstDir === 'media' && parts.length >= 2) {
      candidates.push(parts.slice(1).join('/'))
    }
  }

  const cleanParts = cleanRel.split('/').filter((p) => p && p !== '.')
  if (cleanParts.length >= 1) {
    const fileName = cleanParts[cleanParts.length - 1]
    candidates.push('Content/Media/' + fileName)
    candidates.push('Content/Media/' + cleanRel)
  }

  let resolvedPath = null
  let resolvedFromRoot = ''
  for (const rootCandidate of rootCandidates) {
    for (const candidate of candidates) {
      if (!candidate) continue
      const p = safeResolveProjectFile(rootCandidate, candidate)
      if (p && fs.existsSync(p)) {
        try {
          const st = fs.statSync(p)
          if (st && st.isFile()) {
            resolvedPath = p
            resolvedFromRoot = String(rootCandidate || '')
            break
          }
        } catch {
          // ignore
        }
      }
    }
    if (resolvedPath) break
  }

  let filePath = resolvedPath
  if (!filePath) {
    for (const rootCandidate of rootCandidates) {
      filePath = safeResolveProjectFile(rootCandidate, rel)
      if (filePath) {
        resolvedFromRoot = String(rootCandidate || '')
        break
      }
    }
    if (!filePath) {
      return new Response('Invalid Asset Path', { status: 400 })
    }
  }

  if (!fs.existsSync(filePath)) {
    return new Response(
      'Asset Not Found: ' + rel + ' ; root=' + String(root || '') + ' ; resolvedRoot=' + String(resolvedFromRoot || ''),
      { status: 404 }
    )
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

  // 视频/音频/大文件：使用流式传输 + Range 请求支持
  // 小文件 (< 5MB) 仍可使用内存方式，但视频/音频一律走流式以便播放控制
  const videoExts = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi', '.flv'])
  const audioExts = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'])
  const largeThreshold = 5 * 1024 * 1024 // 5MB
  const totalSize = Number(stat.size || 0)
  const useStream = videoExts.has(ext) || audioExts.has(ext) || totalSize > largeThreshold

  if (!useStream) {
    // 小的非媒体文件：保持简单的内存返回
    try {
      const buffer = fs.readFileSync(filePath)
      return buildInMemoryResponse(buffer, guessMimeType(filePath), 200)
    } catch {
      return new Response('Asset Read Failed', { status: 500 })
    }
  }

  // 媒体/大文件：支持 Range 请求
  try {
    // 1) 解析 Range header
    const rangeHeader = request.headers ? String(request.headers.get('range') || '') : ''
    const total = totalSize
    const contentType = guessMimeType(filePath)

    let start = 0
    let end = total - 1
    let isValidRange = false

    if (rangeHeader && /^bytes=\s*(\d*)-(\d*)\s*$/.test(rangeHeader)) {
      const match = rangeHeader.match(/^bytes=\s*(\d*)-(\d*)\s*$/)
      if (match) {
        const startStr = match[1]
        const endStr = match[2]
        if (startStr === '' && endStr !== '') {
          // suffix-byte-range-spec: bytes=-500 -> last 500 bytes
          const suffixLen = Math.min(total, Math.max(1, Number(endStr) || 0))
          start = Math.max(0, total - suffixLen)
          end = total - 1
          isValidRange = total > 0
        } else if (startStr !== '' && endStr === '') {
          start = Math.max(0, Math.min(total - 1, Number(startStr) || 0))
          end = total - 1
          isValidRange = total > 0
        } else if (startStr !== '' && endStr !== '') {
          start = Math.max(0, Math.min(total - 1, Number(startStr) || 0))
          end = Math.min(total - 1, Math.max(start, Number(endStr) || 0))
          isValidRange = total > 0
        }
      }
    }

    // 2) 构建 ReadableStream 包装 fs.createReadStream
    const streamStart = isValidRange ? start : 0
    const streamEnd = isValidRange ? end : total - 1
    const contentLength = Math.max(0, streamEnd - streamStart + 1)

    const nodeStream = fs.createReadStream(filePath, {
      start: streamStart,
      end: Math.max(streamStart, streamEnd),
      highWaterMark: 256 * 1024,
    })

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          // Node.js Buffer -> Uint8Array
          const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          controller.enqueue(bytes)
        })
        nodeStream.on('end', () => {
          controller.close()
        })
        nodeStream.on('error', (err) => {
          console.error('[dweb-protocol] stream error:', err)
          try { controller.error(err) } catch { /* ignore */ }
        })
      },
      cancel() {
        try { nodeStream.destroy() } catch { /* ignore */ }
      },
    })

    // 3) 构建响应头
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Content-Length', String(contentLength))
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
    headers.set('X-Content-Type-Options', 'nosniff')

    const statusCode = isValidRange ? 206 : 200
    if (isValidRange) {
      headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
    } else if (total > 0) {
      // 有些客户端要求完整请求时也能感知文件大小
      headers.set('Content-Range', `bytes 0-${total - 1}/${total}`)
    }

    return new Response(webStream, { status: statusCode, headers })
  } catch (err) {
    console.error('[dweb-protocol] stream build failed:', err)
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
        console.error('[dweb-protocol] request error:', err)
        return new Response(String(err?.message || err || 'protocol error'), { status: 500 })
      }
    })
    console.log('[dweb-protocol] registered successfully')
    return true
  } catch (err) {
    console.error('[dweb-protocol] register failed:', err)
    try {
      protocol.unregisterProtocol('dweb')
    } catch {
      // ignore
    }
    try {
      protocol.handle('dweb', async (request) => {
        try {
          const host = String(new URL(request.url).hostname || '').toLowerCase()
          if (host === DWEB_PROJECT_ASSET_HOST) {
            return handleProjectAssetRequest(request)
          }
          return new Response('Not Found', { status: 404 })
        } catch (err) {
          console.error('[dweb-protocol] retry request error:', err)
          return new Response(String(err?.message || err || 'protocol error'), { status: 500 })
        }
      })
      console.log('[dweb-protocol] registered successfully after retry')
      return true
    } catch (retryErr) {
      console.error('[dweb-protocol] retry register failed:', retryErr)
      return false
    }
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

// 将远程 URL 的文件下载到指定项目根目录下的 Content/Media 子目录。
// 与 Django 后端的 import_project_asset API 使用相同的目录约定，
// 确保右键菜单、资源面板的查看功能能够正确定位文件。
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

  // 与 Django 保持一致：所有资源存放在 Content/Media 目录下
  const subDir = path.resolve(root, 'Content', 'Media')
  try {
    fs.mkdirSync(subDir, { recursive: true })
  } catch (err) {
    return { ok: false, error: `mkdir failed: ${String(err?.message || err)}` }
  }

  const absolutePath = path.resolve(subDir, filename)
  // 统一使用正斜杠表示相对路径，与 Django 端保持一致
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')

  // 如果目标文件已存在且非空，则直接返回已存在的路径，避免重复下载导致副本。
  if (fs.existsSync(absolutePath)) {
    try {
      const st = fs.statSync(absolutePath)
      if (st && st.isFile() && Number(st.size) > 0) {
        return {
          ok: true,
          absolutePath,
          relativePath,
          size: st.size,
        }
      }
    } catch {
      // fall through to redownload
    }
  }

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

function normalizeLocalSourcePath(rawSourcePath) {
  const raw = String(rawSourcePath || '').trim()
  if (!raw) return ''
  if (/^file:\/\//i.test(raw)) {
    try {
      return decodeURI(raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\//g, path.sep))
    } catch {
      return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\//g, path.sep)
    }
  }
  return raw
}

export async function copyFileToProjectRoot(projectId, rawSourcePath, desiredFilename) {
  const id = Number(projectId)
  const sourcePath = normalizeLocalSourcePath(rawSourcePath)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }
  if (!sourcePath) return { ok: false, error: 'sourcePath is empty' }

  const root = projectRootById.get(id)
  if (!root) return { ok: false, error: `project root not registered for projectId=${id}` }

  let sourceStat
  try {
    sourceStat = fs.statSync(sourcePath)
  } catch {
    return { ok: false, error: 'sourcePath not found' }
  }
  if (!sourceStat?.isFile?.()) return { ok: false, error: 'sourcePath is not a file' }

  const sourceBaseName = path.basename(sourcePath)
  const safeName = sanitizeFilename(desiredFilename || sourceBaseName)
  const sourceExt = (path.extname(sourceBaseName) || '').toLowerCase()
  const ext = sourceExt || inferExtension(safeName, sourceBaseName)
  const base = safeName.replace(/\.[^.]+$/, '') || `asset-${Date.now()}`
  const filename = `${base}${ext}`

  const subDir = path.resolve(root, 'Content', 'Media')
  try {
    fs.mkdirSync(subDir, { recursive: true })
  } catch (err) {
    return { ok: false, error: `mkdir failed: ${String(err?.message || err)}` }
  }

  let absolutePath = path.resolve(subDir, filename)
  const resolvedSource = path.resolve(sourcePath)
  const resolvedTarget = path.resolve(absolutePath)
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')

  // 源文件与目标完全相同：直接返回，避免重复复制。
  if (resolvedSource === resolvedTarget) {
    return {
      ok: true,
      absolutePath,
      relativePath,
      size: sourceStat.size,
    }
  }

  // 如果目标文件已经存在且与源文件大小一致，则视为相同资源，直接返回已存在的文件作为结果，避免重复复制。
  // 注意：这里不做字节级比对以保持性能。
  if (fs.existsSync(absolutePath)) {
    let existingStat
    try { existingStat = fs.statSync(absolutePath) } catch { existingStat = null }
    if (existingStat && existingStat.isFile() && Number(existingStat.size) === Number(sourceStat.size)) {
      return {
        ok: true,
        absolutePath,
        relativePath,
        size: existingStat.size,
      }
    }
  }

  try {
    fs.copyFileSync(sourcePath, absolutePath)
  } catch (err) {
    return { ok: false, error: `copy failed: ${String(err?.message || err)}` }
  }

  try {
    const st = fs.statSync(absolutePath)
    if (!st.isFile() || st.size === 0) {
      return { ok: false, error: 'copied file is empty or not a regular file' }
    }
    return {
      ok: true,
      absolutePath,
      relativePath,
      size: st.size,
    }
  } catch (err) {
    return { ok: false, error: `stat failed: ${String(err?.message || err)}` }
  }
}

function sanitizeFilename(name) {
  const raw = String(name || '').trim()
  if (!raw) return `asset-${Date.now()}`
  let safe = raw.split('?')[0].split('#')[0]
  const idx = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'))
  if (idx >= 0) safe = safe.slice(idx + 1)
  // Check for non-ASCII characters (e.g. Chinese/Japanese/Korean) and replace with safe fallback
  if (/[^\x00-\x7F]/.test(safe)) {
    const hash = Math.abs(
      Array.from(safe).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100000
    )
    safe = `asset_${hash}_${Date.now().toString(36)}`
  }
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
    mp3: '.mp3',
    wav: '.wav',
    ogg: '.ogg',
    m4a: '.m4a',
    flac: '.flac',
    pdf: '.pdf',
    glb: '.glb',
    gltf: '.gltf',
    obj: '.obj',
    json: '.json',
  }

  for (const [key, ext] of Object.entries(extMap)) {
    if (urlLower.includes(`.${key}?`)) return ext
    if (urlLower.includes(`.${key}/`)) return ext
    if (urlLower.endsWith(`.${key}`)) return ext
  }

  try {
    const parsed = new URL(rawUrl)
    const pathname = parsed.pathname.toLowerCase()
    const pathExt = pathname.substring(pathname.lastIndexOf('.'))
    if (pathExt && pathExt.length <= 8) {
      const extKey = pathExt.slice(1).toLowerCase()
      if (extMap[extKey]) return extMap[extKey]
    }
  } catch {
    // ignore
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

function buildAssetPayload(projectId, absolutePath, root, { kind, name, contentType, sourcePath }) {
  const resolvedRoot = String(root || '').trim()
  const rel = path.relative(resolvedRoot, absolutePath).split(path.sep).join('/')
  const mimeType = String(contentType || '').trim() || guessMimeType(absolutePath)
  const size = Number(fs.statSync(absolutePath).size || 0)
  const url = 'dweb://project-assets?projectId=' + encodeURIComponent(String(projectId)) + '&path=' + encodeURIComponent(rel)
  return {
    kind: String(kind || 'file').toLowerCase(),
    name: String(name || path.basename(absolutePath)),
    contentType: mimeType,
    size,
    relativePath: rel,
    projectRelativePath: rel,
    absolutePath,
    url,
    sourcePath: sourcePath || absolutePath,
  }
}

function resolveAssetTargetDir(projectId, bucket) {
  const root = projectRootById.get(projectId)
  if (!root) return null
  const safeBucket = String(bucket || 'assets').trim().toLowerCase()
  if (safeBucket === 'thumbnails') {
    const p = path.resolve(root, 'Content', 'Media', 'thumbnails')
    fs.mkdirSync(p, { recursive: true })
    return { root, kind: 'image', targetDir: p }
  }
  const p = path.resolve(root, 'Content', 'Media')
  fs.mkdirSync(p, { recursive: true })
  return { root, kind: 'file', targetDir: p }
}

function makeUniqueFilename(targetDir, baseName, ext) {
  const cleanBase = String(baseName || 'asset').slice(0, 80)
  const primary = path.resolve(targetDir, cleanBase + ext)
  if (!fs.existsSync(primary)) return primary
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return path.resolve(targetDir, `${cleanBase}_${stamp}_${rand}${ext}`)
}

export function uploadProjectAsset({ projectId, kind, name, arrayBuffer, contentType, bucket }) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }
  if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer || (arrayBuffer && typeof arrayBuffer.byteLength === 'number'))) {
    return { ok: false, error: 'file content is required' }
  }
  const target = resolveAssetTargetDir(id, bucket)
  if (!target) return { ok: false, error: 'project root not registered' }

  const safeName = sanitizeFilename(String(name || 'file'))
  const extension = path.extname(safeName) || '.bin'
  const base = path.basename(safeName, extension) || 'asset'
  const finalPath = makeUniqueFilename(target.targetDir, base, extension)

  try {
    fs.writeFileSync(finalPath, Buffer.from(arrayBuffer))
  } catch (err) {
    return { ok: false, error: 'write file failed: ' + String(err?.message || err) }
  }

  const asset = buildAssetPayload(id, finalPath, target.root, {
    kind: kind || target.kind,
    name: safeName,
    contentType,
    sourcePath: finalPath,
  })
  return { ok: true, asset }
}

export async function importProjectAsset({ projectId, kind, name, sourcePath, sourceUrl, bucket }) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }

  const target = resolveAssetTargetDir(id, bucket)
  if (!target) return { ok: false, error: 'project root not registered' }

  const rawSourcePath = String(sourcePath || '').trim()
  const rawSourceUrl = String(sourceUrl || '').trim()

  if (rawSourcePath) {
    try {
      const src = path.normalize(rawSourcePath)
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        return { ok: false, error: 'sourcePath not found' }
      }
      const srcName = path.basename(src)
      const safeName = sanitizeFilename(String(name || srcName))
      const ext = path.extname(safeName) || '.bin'
      const base = path.basename(safeName, ext) || 'asset'
      const finalPath = makeUniqueFilename(target.targetDir, base, ext)
      if (path.resolve(src) !== finalPath) {
        fs.copyFileSync(src, finalPath)
      }
      const asset = buildAssetPayload(id, finalPath, target.root, {
        kind: kind || 'file',
        name: safeName,
        contentType: null,
        sourcePath: src,
      })
      return { ok: true, asset }
    } catch (err) {
      return { ok: false, error: 'import from sourcePath failed: ' + String(err?.message || err) }
    }
  }

  if (rawSourceUrl) {
    try {
      const urlBaseName = path.basename(rawSourceUrl.split('?')[0].split('#')[0]) || 'asset'
      const nameHint = String(name || '').trim() || urlBaseName
      const safeName = sanitizeFilename(nameHint)
      const ext = path.extname(safeName) || inferExtension(safeName, rawSourceUrl) || '.bin'
      const base = path.basename(safeName, ext) || 'asset'
      const finalPath = makeUniqueFilename(target.targetDir, base, ext)
      await fetchRemoteUrl(rawSourceUrl, finalPath)
      const asset = buildAssetPayload(id, finalPath, target.root, {
        kind: kind || 'file',
        name: safeName,
        contentType: null,
        sourcePath: finalPath,
      })
      asset.sourceUrl = rawSourceUrl
      return { ok: true, asset }
    } catch (err) {
      return { ok: false, error: 'download sourceUrl failed: ' + String(err?.message || err) }
    }
  }

  return { ok: false, error: 'sourcePath or sourceUrl is required' }
}

export function deleteProjectAsset({ projectId, relativePath, url, sourcePath }) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }

  const root = projectRootById.get(id)
  if (!root) return { ok: false, error: 'project root not registered' }

  let rel = String(relativePath || '').trim()
  if (!rel && url) {
    try {
      const u = new URL(String(url))
      if (u.hostname === DWEB_PROJECT_ASSET_HOST) {
        rel = String(u.searchParams.get('path') || '').trim()
      }
    } catch {
      // ignore
    }
  }
  if (!rel && sourcePath) {
    try {
      const abs = path.resolve(String(sourcePath))
      const candidate = path.relative(root, abs).split(path.sep).join('/')
      if (!candidate.startsWith('..')) rel = candidate
    } catch {
      // ignore
    }
  }
  if (!rel) return { ok: true, fileDeleted: false, reason: 'no target path provided' }

  const candidate = safeResolveProjectFile(root, rel)
  if (!candidate) return { ok: false, error: 'invalid target path' }
  if (!fs.existsSync(candidate)) return { ok: true, fileDeleted: false, path: candidate }

  try {
    fs.unlinkSync(candidate)
    return { ok: true, fileDeleted: true, path: candidate }
  } catch (err) {
    return { ok: false, error: 'delete failed: ' + String(err?.message || err) }
  }
}

export function resolveProjectAsset({ projectId, kind, name, projectRelativePath, sourcePath }) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }

  const root = projectRootById.get(id)
  if (!root) return { ok: false, error: 'project root not registered' }

  const rel = String(projectRelativePath || '').trim()
  if (rel) {
    const candidate = safeResolveProjectFile(root, rel)
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const asset = buildAssetPayload(id, candidate, root, {
        kind: kind || 'file',
        name: name || path.basename(candidate),
        contentType: null,
        sourcePath: candidate,
      })
      return { ok: true, resolved: true, asset }
    }
  }

  const src = String(sourcePath || '').trim()
  if (src) {
    const abs = path.resolve(src)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const candidate = path.relative(root, abs).split(path.sep).join('/')
      if (!candidate.startsWith('..')) {
        const asset = buildAssetPayload(id, abs, root, {
          kind: kind || 'file',
          name: name || path.basename(abs),
          contentType: null,
          sourcePath: abs,
        })
        asset.projectRelativePath = candidate
        asset.relativePath = candidate
        return { ok: true, resolved: true, asset }
      }
    }
  }

  return { ok: true, resolved: false, reason: 'not_found' }
}

function scanDirForName(dir, targetName) {
  if (!dir || !fs.existsSync(dir)) return null
  try {
    const stack = [dir]
    while (stack.length) {
      const current = stack.pop()
      let entries
      try {
        entries = fs.readdirSync(current, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const full = path.resolve(current, entry.name)
        if (entry.isFile() && entry.name === targetName) return full
        if (entry.isDirectory()) stack.push(full)
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function repairProjectAsset({ projectId, kind, name, projectRelativePath }) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }

  const root = projectRootById.get(id)
  if (!root) return { ok: false, error: 'project root not registered' }

  const targetName = String(name || '').trim() || path.basename(String(projectRelativePath || '')).trim()
  if (!targetName) return { ok: false, error: 'name or projectRelativePath is required' }

  const mediaRoot = path.resolve(root, 'Content', 'Media')
  const generatedRoot = path.resolve(root, 'Content', 'Generated')

  const hit = scanDirForName(mediaRoot, targetName) || scanDirForName(generatedRoot, targetName)
  if (!hit) return { ok: true, repaired: false, reason: 'not_found' }

  const asset = buildAssetPayload(id, hit, root, {
    kind: kind || 'file',
    name: targetName,
    contentType: null,
    sourcePath: hit,
  })
  return { ok: true, repaired: true, asset }
}

export { DWEB_PROJECT_ASSET_HOST }
