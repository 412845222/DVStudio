import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { protocol, net } from 'electron'

const DWEB_PROJECT_ASSET_HOST = 'project-assets'
const CACHE_DIR = '.dvcache'
const CACHE_BIN_DIR = '.dvcache/bin'

const projectRootById = new Map()

const accessLog = []
const MAX_LOG_ENTRIES = 1000

function logAccess(entry) {
  const now = Date.now()
  accessLog.push({ ...entry, timestamp: now })
  while (accessLog.length > MAX_LOG_ENTRIES) {
    accessLog.shift()
  }
  const status = entry.status || (entry.resolvedPath ? 'FOUND' : 'NOT_FOUND')
  console.debug(`[dweb-access] ${status} | projectId=${entry.projectId} | path=${entry.requestedPath || 'N/A'} | resolved=${entry.resolvedPath || 'N/A'} | candidates=${entry.candidateCount || 0}`)
}

function getRecentAccessLogs(maxEntries = 100) {
  return accessLog.slice(-maxEntries)
}

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
  if (!rootStr) return { resolved: null, reason: 'empty_root', root: rootStr }
  const rel = String(relPath || '').trim().replace(/\\/g, '/')
  if (!rel) return { resolved: null, reason: 'empty_rel_path', root: rootStr, relPath: rel }
  if (rel.startsWith('/')) return { resolved: null, reason: 'absolute_path_rejected', root: rootStr, relPath: rel }
  if (rel.includes('..')) return { resolved: null, reason: 'path_traversal_rejected', root: rootStr, relPath: rel }
  let normalized
  try {
    normalized = path.resolve(rootStr, ...rel.split('/').filter((seg) => seg && seg !== '.'))
  } catch (err) {
    return { resolved: null, reason: 'resolve_error', root: rootStr, relPath: rel, error: String(err?.message || err) }
  }
  const resolvedRoot = path.resolve(rootStr)
  if (normalized !== resolvedRoot && !normalized.startsWith(resolvedRoot + path.sep)) {
    return { resolved: null, reason: 'path_outside_project', root: resolvedRoot, relPath: rel, attempted: normalized }
  }
  return { resolved: normalized, reason: 'success', root: resolvedRoot, relPath: rel }
}

function diagnoseFilePath(root, relPath) {
  const result = []
  const rootStr = String(root || '').trim()
  
  if (!rootStr) {
    result.push({ check: 'project_root', status: 'FAIL', message: '项目根目录为空' })
    return result
  }
  
  try {
    const rootStat = fs.statSync(rootStr)
    if (!rootStat.isDirectory()) {
      result.push({ check: 'project_root_is_dir', status: 'FAIL', message: `项目根目录不是文件夹: ${rootStr}` })
    } else {
      result.push({ check: 'project_root_is_dir', status: 'OK', message: `项目根目录有效: ${rootStr}` })
    }
  } catch (err) {
    result.push({ check: 'project_root_exists', status: 'FAIL', message: `项目根目录不存在或无法访问: ${rootStr} | ${String(err?.message || err)}` })
    return result
  }
  
  const rel = String(relPath || '').trim().replace(/\\/g, '/')
  if (!rel) {
    result.push({ check: 'relative_path', status: 'FAIL', message: '相对路径为空' })
    return result
  }
  
  const resolved = safeResolveProjectFile(rootStr, rel)
  if (!resolved.resolved) {
    result.push({ check: 'path_resolution', status: 'FAIL', message: `路径解析失败: ${resolved.reason}`, detail: resolved })
    return result
  }
  
  const filePath = resolved.resolved
  try {
    const fileStat = fs.statSync(filePath)
    if (!fileStat.isFile()) {
      result.push({ check: 'file_is_file', status: 'FAIL', message: `路径不是文件: ${filePath}` })
    } else {
      result.push({ check: 'file_exists', status: 'OK', message: `文件存在: ${filePath}` })
      result.push({ check: 'file_size', status: 'OK', message: `文件大小: ${fileStat.size} bytes` })
    }
  } catch (err) {
    result.push({ check: 'file_stat', status: 'FAIL', message: `文件状态检查失败: ${filePath} | ${String(err?.message || err)}` })
    
    const mediaDir = path.resolve(rootStr, 'Content', 'Media')
    try {
      if (fs.existsSync(mediaDir)) {
        const entries = fs.readdirSync(mediaDir, { withFileTypes: true })
        const matching = entries.filter(e => e.isFile() && e.name.includes(path.basename(rel)))
        if (matching.length > 0) {
          result.push({ check: 'similar_files_found', status: 'INFO', message: `在 Content/Media 中找到相似文件: ${matching.map(e => e.name).join(', ')}` })
        }
      }
    } catch {
      // ignore
    }
  }
  
  return result
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
    logAccess({ status: 'PARSE_FAILED', projectId: 'N/A', requestedPath: String(request.url || '') })
    return new Response('Bad Request', { status: 400 })
  }
  const root = projectRootById.get(parsed.projectId)
  if (!root) {
    logAccess({ status: 'ROOT_NOT_REGISTERED', projectId: parsed.projectId, requestedPath: parsed.relPath })
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

  const reqExt = path.extname(rel).toLowerCase()
  const isBinRequest = reqExt === '.bin'
  if (isBinRequest && parts.length >= 1) {
    const fileName = parts[parts.length - 1]
    candidates.push(CACHE_BIN_DIR + '/' + fileName)
    candidates.push(CACHE_DIR + '/' + fileName)
  }

  let resolvedPath = null
  let resolvedFromRoot = ''
  const triedCandidates = []
  for (const rootCandidate of rootCandidates) {
    for (const candidate of candidates) {
      if (!candidate) continue
      const resolved = safeResolveProjectFile(rootCandidate, candidate)
      triedCandidates.push({ root: rootCandidate, candidate, resolved: resolved.resolved, reason: resolved.reason })
      if (resolved.resolved && fs.existsSync(resolved.resolved)) {
        try {
          const st = fs.statSync(resolved.resolved)
          if (st && st.isFile()) {
            resolvedPath = resolved.resolved
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
      const resolved = safeResolveProjectFile(rootCandidate, rel)
      if (resolved.resolved) {
        filePath = resolved.resolved
        resolvedFromRoot = String(rootCandidate || '')
        break
      }
    }
    if (!filePath) {
      logAccess({
        status: 'PATH_RESOLUTION_FAILED',
        projectId: parsed.projectId,
        requestedPath: rel,
        candidateCount: candidates.length,
        triedCandidates,
        root,
        rootCandidates,
      })
      const diagnostics = diagnoseFilePath(root, rel)
      const diagText = diagnostics.map(d => `${d.status}: ${d.message}`).join('\n')
      return new Response('Invalid Asset Path:\n' + diagText, { status: 400 })
    }
  }

  if (!fs.existsSync(filePath)) {
    const diagnostics = diagnoseFilePath(root, rel)
    const diagText = diagnostics.map(d => `${d.status}: ${d.message}`).join('\n')
    logAccess({
      status: 'FILE_NOT_FOUND',
      projectId: parsed.projectId,
      requestedPath: rel,
      resolvedPath: filePath,
      candidateCount: candidates.length,
      triedCandidates,
      diagnostics,
    })
    return new Response('Asset Not Found:\n' + diagText, { status: 404 })
  }
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch (err) {
    logAccess({
      status: 'STAT_FAILED',
      projectId: parsed.projectId,
      requestedPath: rel,
      resolvedPath: filePath,
      error: String(err?.message || err),
    })
    return new Response('Asset Stat Failed', { status: 500 })
  }
  if (!stat.isFile()) {
    logAccess({
      status: 'NOT_A_FILE',
      projectId: parsed.projectId,
      requestedPath: rel,
      resolvedPath: filePath,
    })
    return new Response('Asset Is Not A File', { status: 404 })
  }

  logAccess({
    status: 'SUCCESS',
    projectId: parsed.projectId,
    requestedPath: rel,
    resolvedPath: filePath,
    candidateCount: candidates.length,
    size: stat.size,
  })

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

function ensureGitignore(root) {
  const rootStr = String(root || '').trim()
  if (!rootStr) return
  const gitignorePath = path.resolve(rootStr, '.gitignore')
  try {
    if (!fs.existsSync(gitignorePath)) return
    const content = fs.readFileSync(gitignorePath, 'utf8')
    const lines = content.split(/\r?\n/)
    const hasCacheEntry = lines.some(line => {
      const trimmed = line.trim()
      return trimmed === CACHE_DIR + '/' || trimmed === CACHE_DIR || trimmed === CACHE_BIN_DIR
    })
    if (!hasCacheEntry) {
      const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      fs.appendFileSync(gitignorePath, separator + CACHE_DIR + '/\n')
      console.log(`[dweb-protocol] added ${CACHE_DIR}/ to .gitignore`)
    }
  } catch (err) {
    console.debug(`[dweb-protocol] ensureGitignore failed: ${String(err?.message || err)}`)
  }
}

function scanDirForBinFiles(dirPath, options = {}) {
  const recursive = Boolean(options.recursive)
  const result = []
  const skipDirNames = new Set(options.skipDirNames || [])

  function walk(currentDir) {
    let entries
    try {
      if (!fs.existsSync(currentDir)) return
      const stat = fs.statSync(currentDir)
      if (!stat.isDirectory()) return
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.resolve(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (recursive && !skipDirNames.has(entry.name)) {
          walk(fullPath)
        }
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.bin')) continue
      result.push(fullPath)
    }
  }

  walk(dirPath)
  return result
}

export function cleanupProjectRootBinFiles(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'projectId is invalid' }
  }

  const root = projectRootById.get(id)
  if (!root) {
    return { ok: false, error: 'project root not registered' }
  }

  let rootExists = false
  let rootIsDir = false
  try {
    const stat = fs.statSync(root)
    rootExists = true
    rootIsDir = stat.isDirectory()
  } catch {
    rootExists = false
  }

  if (!rootExists || !rootIsDir) {
    return { ok: false, error: 'project root is invalid or not a directory' }
  }

  const cacheBinDir = path.resolve(root, CACHE_DIR, 'bin')
  try {
    fs.mkdirSync(cacheBinDir, { recursive: true })
  } catch (err) {
    return { ok: false, error: `failed to create cache bin directory: ${String(err?.message || err)}` }
  }

  const commonSkipDirs = [CACHE_DIR, '.git', 'node_modules', '.venv', '__pycache__', 'Content']

  const scanTargets = [
    { dir: root, recursive: false },
    { dir: path.resolve(root, 'generated-assets'), recursive: true, skipDirNames: commonSkipDirs },
  ]

  const binFiles = []
  const errors = []

  for (const target of scanTargets) {
    try {
      const found = scanDirForBinFiles(target.dir, {
        recursive: target.recursive,
        skipDirNames: target.skipDirNames,
      })
      binFiles.push(...found)
    } catch (err) {
      errors.push(`failed to scan directory ${target.dir}: ${String(err?.message || err)}`)
    }
  }

  const seen = new Set()
  const uniqueBinFiles = []
  for (const f of binFiles) {
    const resolved = path.resolve(f)
    if (resolved === path.resolve(cacheBinDir, path.basename(resolved))) continue
    if (!seen.has(resolved)) {
      seen.add(resolved)
      uniqueBinFiles.push(resolved)
    }
  }

  let movedCount = 0
  let totalBytes = 0
  let freedBytes = 0
  const cleanedPaths = []

  for (const binFile of uniqueBinFiles) {
    try {
      let fileSize = 0
      try {
        const stat = fs.statSync(binFile)
        fileSize = Number(stat.size || 0)
      } catch (err) {
        errors.push(`failed to stat ${binFile}: ${String(err?.message || err)}`)
        continue
      }

      const fileName = path.basename(binFile)
      const ext = path.extname(fileName)
      const baseName = path.basename(fileName, ext)
      let targetPath = path.resolve(cacheBinDir, fileName)

      if (fs.existsSync(targetPath)) {
        const stamp = Date.now()
        const rand = Math.random().toString(36).slice(2, 8)
        targetPath = path.resolve(cacheBinDir, `${baseName}_${stamp}_${rand}${ext}`)
      }

      let moveSuccess = false
      try {
        fs.renameSync(binFile, targetPath)
        moveSuccess = true
      } catch (renameErr) {
        try {
          fs.copyFileSync(binFile, targetPath)
          fs.unlinkSync(binFile)
          moveSuccess = true
        } catch (copyErr) {
          try {
            fs.unlinkSync(binFile)
            totalBytes += fileSize
            freedBytes += fileSize
            cleanedPaths.push(binFile)
            movedCount++
            continue
          } catch (deleteErr) {
            errors.push(`failed to process ${binFile}: rename=${String(renameErr?.message || renameErr)}, copy=${String(copyErr?.message || copyErr)}, delete=${String(deleteErr?.message || deleteErr)}`)
            continue
          }
        }
      }

      if (moveSuccess) {
        totalBytes += fileSize
        cleanedPaths.push(binFile)
        movedCount++
      }
    } catch (err) {
      errors.push(`unexpected error processing ${binFile}: ${String(err?.message || err)}`)
    }
  }

  return {
    ok: true,
    movedCount,
    totalBytes,
    freedBytes,
    cleanedPaths,
    errors,
  }
}

export function setProjectRoot(projectId, rootPath) {
  const id = Number(projectId)
  const root = String(rootPath || '').trim()
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'projectId is invalid' }
  if (!root) {
    projectRootById.delete(id)
    console.log(`[dweb-protocol] cleared project root for projectId=${id}`)
    return { ok: true, cleared: true }
  }
  
  let resolvedRoot
  try {
    resolvedRoot = path.resolve(root)
  } catch (err) {
    return { ok: false, error: `invalid root path: ${String(err?.message || err)}` }
  }
  
  let isDirectory = false
  let exists = false
  try {
    const stat = fs.statSync(resolvedRoot)
    exists = true
    isDirectory = stat.isDirectory()
  } catch {
    exists = false
  }
  
  if (!exists) {
    try {
      fs.mkdirSync(resolvedRoot, { recursive: true })
      console.log(`[dweb-protocol] created project root directory: ${resolvedRoot}`)
    } catch (err) {
      return { ok: false, error: `failed to create project root: ${String(err?.message || err)}` }
    }
  } else if (!isDirectory) {
    return { ok: false, error: `project root is not a directory: ${resolvedRoot}` }
  }
  
  projectRootById.set(id, resolvedRoot)
  console.log(`[dweb-protocol] registered project root for projectId=${id}: ${resolvedRoot}`)
  
  const mediaDir = path.resolve(resolvedRoot, 'Content', 'Media')
  try {
    fs.mkdirSync(mediaDir, { recursive: true })
  } catch {
    // ignore - media dir creation failure shouldn't block project registration
  }

  const generatedDir = path.resolve(resolvedRoot, 'Content', 'Generated')
  try {
    fs.mkdirSync(generatedDir, { recursive: true })
  } catch {
    // ignore - generated dir creation failure shouldn't block project registration
  }

  const cacheBinDir = path.resolve(resolvedRoot, CACHE_DIR, 'bin')
  try {
    fs.mkdirSync(cacheBinDir, { recursive: true })
  } catch {
    // ignore - cache dir creation failure shouldn't block project registration
  }

  setTimeout(() => {
    try {
      console.log(`[dweb-protocol] bin cleanup probe started for projectId=${id}, root=${resolvedRoot}`)
      const result = cleanupProjectRootBinFiles(id)
      if (result.ok) {
        if (result.movedCount > 0) {
          console.log(`[dweb-protocol] bin cleanup completed for projectId=${id}: moved ${result.movedCount} files, freed ${result.freedBytes} bytes`)
          if (result.cleanedPaths.length > 0 && result.cleanedPaths.length <= 10) {
            result.cleanedPaths.forEach((p, i) => console.log(`[dweb-protocol] cleaned[${i}]: ${p}`))
          }
        } else {
          console.log(`[dweb-protocol] bin cleanup completed for projectId=${id}: no stray .bin files found`)
        }
        if (result.errors && result.errors.length > 0) {
          console.debug(`[dweb-protocol] bin cleanup had ${result.errors.length} non-fatal errors:`, result.errors)
        }
      } else {
        console.warn(`[dweb-protocol] bin cleanup failed for projectId=${id}: ${result.error}`)
      }
    } catch (err) {
      console.warn(`[dweb-protocol] bin cleanup unexpected error for projectId=${id}: ${String(err?.message || err)}`)
    }
  }, 1500)

  ensureGitignore(resolvedRoot)

  return { ok: true, root: resolvedRoot, created: !exists }
}

export function clearProjectRoot(projectId) {
  const id = Number(projectId)
  if (Number.isFinite(id) && id > 0) {
    const oldRoot = projectRootById.get(id)
    projectRootById.delete(id)
    console.log(`[dweb-protocol] cleared project root for projectId=${id}: ${oldRoot || 'N/A'}`)
  }
}

export function getProjectRootSnapshot() {
  const result = {}
  for (const [k, v] of projectRootById.entries()) result[String(k)] = v
  return result
}

export function getProjectRootById(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return null
  return projectRootById.get(id) || null
}

export function validateProjectRoot(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) return { valid: false, error: 'projectId is invalid' }
  
  const root = projectRootById.get(id)
  if (!root) return { valid: false, error: 'project root not registered', projectId: id }
  
  try {
    const stat = fs.statSync(root)
    if (!stat.isDirectory()) {
      return { valid: false, error: 'registered root is not a directory', projectId: id, root }
    }
  } catch (err) {
    return { valid: false, error: `root directory not found or inaccessible: ${String(err?.message || err)}`, projectId: id, root }
  }
  
  const mediaDir = path.resolve(root, 'Content', 'Media')
  let mediaExists = false
  try {
    mediaExists = fs.existsSync(mediaDir) && fs.statSync(mediaDir).isDirectory()
  } catch {
    mediaExists = false
  }
  
  return {
    valid: true,
    projectId: id,
    root,
    mediaDirExists: mediaExists,
    mediaDir: mediaDir,
  }
}

export function getAccessLogs(maxEntries = 100) {
  return getRecentAccessLogs(maxEntries)
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
  const effectiveBucket = ext === '.bin' ? 'cache' : undefined
  const target = resolveAssetTargetDir(id, effectiveBucket)
  if (!target) return { ok: false, error: 'failed to resolve target directory' }

  const absolutePath = path.resolve(target.targetDir, filename)
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

function isPathInsideProject(root, filePath) {
  const resolvedRoot = path.resolve(String(root || '').trim())
  const resolvedFile = path.resolve(String(filePath || '').trim())
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false
  }
  const relativePosix = relative.split(path.sep).join('/')
  if (relativePosix.startsWith(CACHE_DIR + '/')) {
    return false
  }
  return true
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

  const resolvedSource = path.resolve(sourcePath)

  if (isPathInsideProject(root, resolvedSource)) {
    const relativePath = path.relative(root, resolvedSource).split(path.sep).join('/')
    return {
      ok: true,
      absolutePath: resolvedSource,
      relativePath,
      size: sourceStat.size,
      reused: true,
    }
  }

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
  const resolvedTarget = path.resolve(absolutePath)
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')

  if (resolvedSource === resolvedTarget) {
    return {
      ok: true,
      absolutePath,
      relativePath,
      size: sourceStat.size,
    }
  }

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
  if (safeBucket === 'cache') {
    const p = path.resolve(root, CACHE_DIR, 'bin')
    fs.mkdirSync(p, { recursive: true })
    return { root, kind: 'file', targetDir: p }
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
  const safeName = sanitizeFilename(String(name || 'file'))
  const extension = path.extname(safeName) || '.bin'
  const effectiveBucket = bucket || (extension === '.bin' ? 'cache' : undefined)
  const target = resolveAssetTargetDir(id, effectiveBucket)
  if (!target) return { ok: false, error: 'project root not registered' }

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

  const rawSourcePath = String(sourcePath || '').trim()
  const rawSourceUrl = String(sourceUrl || '').trim()

  if (rawSourcePath) {
    const root = projectRootById.get(id)
    if (!root) return { ok: false, error: 'project root not registered' }
    try {
      const src = path.normalize(rawSourcePath)
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        return { ok: false, error: 'sourcePath not found' }
      }
      const resolvedSrc = path.resolve(src)
      const srcName = path.basename(src)
      const safeName = sanitizeFilename(String(name || srcName))

      if (isPathInsideProject(root, resolvedSrc)) {
        const asset = buildAssetPayload(id, resolvedSrc, root, {
          kind: kind || 'file',
          name: safeName,
          contentType: null,
          sourcePath: src,
        })
        asset.reused = true
        return { ok: true, asset }
      }

      const target = resolveAssetTargetDir(id, bucket)
      if (!target) return { ok: false, error: 'project root not registered' }
      const ext = path.extname(safeName) || '.bin'
      const base = path.basename(safeName, ext) || 'asset'
      const finalPath = makeUniqueFilename(target.targetDir, base, ext)
      if (resolvedSrc !== finalPath) {
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
      const effectiveBucket = bucket || (ext === '.bin' ? 'cache' : undefined)
      const target = resolveAssetTargetDir(id, effectiveBucket)
      if (!target) return { ok: false, error: 'project root not registered' }
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
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && isPathInsideProject(root, abs)) {
      const candidate = path.relative(root, abs).split(path.sep).join('/')
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

/**
 * 404 兜底诊断：给定一个 dweb://project-assets URL，返回详细的诊断信息，
 * 包括：项目根是否注册、注册的根路径是否有效、文件是否真实存在于磁盘、
 * 若在磁盘上找到相似文件，则返回候选修复路径。
 */
export function diagnoseDwebAsset({ projectId, relPath, url }) {
  const id = Number(projectId)
  const result = {
    ok: true,
    projectId: Number.isFinite(id) ? id : null,
    requestedPath: String(relPath || ''),
    registered: false,
    root: null,
    rootValid: false,
    rootExists: false,
    resolvedTo: null,
    fileExists: false,
    fileIsFile: false,
    fileSize: 0,
    candidates: [],
    similarFiles: [],
    diagnostics: [],
    suggestion: null,
    repairedAsset: null,
  }

  // --- 1. 从 url 解析参数（若未直接传 projectId/relPath）---
  let parsed = null
  if (url) {
    parsed = parseDwebAssetUrl(String(url))
    if (parsed) {
      if (!Number.isFinite(id) || id <= 0) {
        result.projectId = parsed.projectId
      }
      if (!result.requestedPath) {
        result.requestedPath = parsed.relPath
      }
    }
  }
  const pid = Number(result.projectId)
  if (!Number.isFinite(pid) || pid <= 0) {
    result.ok = false
    result.diagnostics.push({ check: 'projectId', status: 'FAIL', message: 'projectId 无效' })
    return result
  }

  // --- 2. 检查项目根注册 ---
  const root = projectRootById.get(pid)
  result.registered = !!root
  if (!root) {
    result.diagnostics.push({ check: 'root_registered', status: 'FAIL', message: '项目根未注册' })
    result.suggestion = 're_register_root'
    return result
  }
  result.root = root

  // --- 3. 验证注册的根路径在磁盘上是否有效 ---
  try {
    const st = fs.statSync(root)
    result.rootExists = true
    result.rootValid = st.isDirectory()
    if (!result.rootValid) {
      result.diagnostics.push({ check: 'root_is_directory', status: 'FAIL', message: `注册的根路径不是文件夹: ${root}` })
      result.suggestion = 're_register_root'
      return result
    }
    result.diagnostics.push({ check: 'root_is_directory', status: 'OK', message: `项目根有效: ${root}` })
  } catch (err) {
    result.diagnostics.push({ check: 'root_exists', status: 'FAIL', message: `项目根不存在或无法访问: ${root} | ${String(err?.message || err)}` })
    result.suggestion = 're_register_root'
    return result
  }

  // --- 4. 复现 handleProjectAssetRequest 的候选路径搜索逻辑 ---
  const rel = String(result.requestedPath || '').replace(/\\/g, '/').trim()
  if (!rel) {
    result.diagnostics.push({ check: 'rel_path', status: 'FAIL', message: '请求路径为空' })
    return result
  }

  const rootCandidates = [root]
  try {
    const normalizedRoot = String(root).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    if (normalizedRoot.endsWith('/content/media')) {
      rootCandidates.push(path.resolve(String(root), '..', '..'))
    } else if (normalizedRoot.endsWith('/generated-assets')) {
      rootCandidates.push(path.resolve(String(root), '..'))
    }
  } catch { /* ignore */ }

  let cleanRel = rel
  if (cleanRel.startsWith('Content/Media/')) cleanRel = cleanRel.slice('Content/Media/'.length)
  else if (cleanRel.startsWith('content/media/')) cleanRel = cleanRel.slice('content/media/'.length)
  else if (cleanRel.startsWith('Media/')) cleanRel = cleanRel.slice('Media/'.length)
  else if (cleanRel.startsWith('media/')) cleanRel = cleanRel.slice('media/'.length)

  const candidates = [rel, cleanRel]
  const parts = rel.split('/').filter((p) => p && p !== '.')
  if (parts.length >= 2) {
    const firstDir = parts[0].toLowerCase()
    const restPath = parts.slice(1).join('/')
    const fileName = parts[parts.length - 1]
    if (firstDir === 'generated-assets') {
      candidates.push('Content/Media/' + restPath)
      if (restPath !== fileName) candidates.push('Content/Media/' + fileName)
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
  const cleanPartsDiag = cleanRel.split('/').filter((p) => p && p !== '.')
  if (cleanPartsDiag.length >= 1) {
    const fileName = cleanPartsDiag[cleanPartsDiag.length - 1]
    candidates.push('Content/Media/' + fileName)
    candidates.push('Content/Media/' + cleanRel)
  }

  const reqExtDiag = path.extname(rel).toLowerCase()
  if (reqExtDiag === '.bin' && parts.length >= 1) {
    const fileName = parts[parts.length - 1]
    candidates.push(CACHE_BIN_DIR + '/' + fileName)
    candidates.push(CACHE_DIR + '/' + fileName)
  }

  // 去重
  const uniqCandidates = Array.from(new Set(candidates.filter(Boolean)))

  // --- 5. 逐个候选路径尝试解析 ---
  let hitPath = null
  for (const rc of rootCandidates) {
    for (const c of uniqCandidates) {
      const r = safeResolveProjectFile(rc, c)
      const entry = {
        root: rc,
        candidate: c,
        resolved: r.resolved,
        reason: r.reason,
        exists: false,
        isFile: false,
        size: 0,
      }
      if (r.resolved) {
        try {
          const st = fs.statSync(r.resolved)
          entry.exists = true
          entry.isFile = st.isFile()
          entry.size = Number(st.size || 0)
          if (entry.isFile && !hitPath) {
            hitPath = r.resolved
            result.resolvedTo = r.resolved
            result.fileExists = true
            result.fileIsFile = true
            result.fileSize = entry.size
          }
        } catch {
          entry.exists = false
        }
      }
      result.candidates.push(entry)
    }
    if (hitPath) break
  }

  if (hitPath) {
    result.diagnostics.push({ check: 'file_found', status: 'OK', message: `文件可解析至: ${hitPath}` })
    // 文件实际上存在，构造修复后的 asset payload
    try {
      result.repairedAsset = buildAssetPayload(pid, hitPath, root, {
        kind: inferKindFromFile(hitPath),
        name: path.basename(hitPath),
        contentType: null,
        sourcePath: hitPath,
      })
    } catch { /* ignore */ }
    return result
  }

  // --- 6. 文件未找到：在 Content/Media 和 Content/Generated 中模糊搜索同名文件 ---
  result.diagnostics.push({ check: 'file_found', status: 'FAIL', message: `所有候选路径都未找到文件: ${rel}` })
  const targetBase = path.basename(rel).split('?')[0].split('#')[0]
  const searchDirs = [
    path.resolve(root, 'Content', 'Media'),
    path.resolve(root, 'Content', 'Generated'),
    path.resolve(root, 'generated-assets'),
    path.resolve(root, CACHE_BIN_DIR),
    path.resolve(root, CACHE_DIR),
  ]
  const similar = []
  const targetLower = targetBase.toLowerCase()
  for (const dir of searchDirs) {
    collectSimilarFiles(dir, targetBase, targetLower, similar, 20)
    if (similar.length >= 20) break
  }
  result.similarFiles = similar
  if (similar.length > 0) {
    result.diagnostics.push({
      check: 'similar_files',
      status: 'INFO',
      message: `在项目目录找到 ${similar.length} 个相似文件，可作为修复参考`,
    })
    // 尝试按文件名精确匹配修复
    const exactHit = similar.find((s) => s.name === targetBase) || similar[0]
    if (exactHit) {
      try {
        result.repairedAsset = buildAssetPayload(pid, exactHit.path, root, {
          kind: inferKindFromFile(exactHit.path),
          name: exactHit.name,
          contentType: null,
          sourcePath: exactHit.path,
        })
        result.suggestion = 'repair_by_rename'
      } catch { /* ignore */ }
    }
  } else {
    result.suggestion = 'file_missing'
  }

  return result
}

function inferKindFromFile(filePath) {
  return guessMimeType(filePath).startsWith('image/') ? 'image'
    : guessMimeType(filePath).startsWith('video/') ? 'video'
    : filePath.toLowerCase().endsWith('.glb') || filePath.toLowerCase().endsWith('.gltf') ? 'model3d'
    : 'file'
}

function collectSimilarFiles(dir, targetName, targetLower, out, limit) {
  if (out.length >= limit) return
  if (!dir || !fs.existsSync(dir)) return
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= limit) return
    const full = path.resolve(dir, entry.name)
    if (entry.isFile()) {
      const nameLower = entry.name.toLowerCase()
      const baseNoExt = targetLower.replace(/\.[^.]+$/, '')
      const nameNoExt = nameLower.replace(/\.[^.]+$/, '')
      const isSimilar =
        nameLower === targetLower ||
        nameNoExt === baseNoExt ||
        nameLower.includes(baseNoExt) ||
        baseNoExt.includes(nameNoExt)
      if (isSimilar) {
        out.push({ name: entry.name, path: full })
      }
    } else if (entry.isDirectory()) {
      // 避免进入 node_modules / .git 等大目录
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue
      collectSimilarFiles(full, targetName, targetLower, out, limit)
    }
  }
}

export function getProjectCacheStats(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'projectId is invalid' }
  }

  const root = projectRootById.get(id)
  if (!root) {
    return { ok: false, error: `project root not registered for projectId=${id}` }
  }

  const cacheDir = path.resolve(root, CACHE_DIR)
  let fileCount = 0
  let totalBytes = 0

  try {
    if (fs.existsSync(cacheDir)) {
      const stack = [cacheDir]
      while (stack.length > 0) {
        const current = stack.pop()
        let entries
        try {
          entries = fs.readdirSync(current, { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          const fullPath = path.resolve(current, entry.name)
          if (entry.isDirectory()) {
            stack.push(fullPath)
          } else if (entry.isFile()) {
            try {
              const st = fs.statSync(fullPath)
              fileCount += 1
              totalBytes += Number(st.size || 0)
            } catch {
              // ignore single file stat failure
            }
          }
        }
      }
    }
  } catch (err) {
    return { ok: false, error: `failed to scan cache directory: ${String(err?.message || err)}` }
  }

  return { ok: true, fileCount, totalBytes, cacheDir }
}

export function clearProjectCache(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'projectId is invalid' }
  }

  const root = projectRootById.get(id)
  if (!root) {
    return { ok: false, error: `project root not registered for projectId=${id}` }
  }

  const cacheDir = path.resolve(root, CACHE_DIR)
  const cacheBinDir = path.resolve(root, CACHE_BIN_DIR)
  let deletedCount = 0
  let freedBytes = 0

  try {
    if (fs.existsSync(cacheDir)) {
      const stack = [cacheDir]
      const dirsToRemove = []

      while (stack.length > 0) {
        const current = stack.pop()
        let entries
        try {
          entries = fs.readdirSync(current, { withFileTypes: true })
        } catch {
          continue
        }

        let hasFiles = false
        for (const entry of entries) {
          const fullPath = path.resolve(current, entry.name)
          if (entry.isDirectory()) {
            stack.push(fullPath)
          } else if (entry.isFile()) {
            try {
              const st = fs.statSync(fullPath)
              freedBytes += Number(st.size || 0)
              fs.unlinkSync(fullPath)
              deletedCount += 1
              hasFiles = true
            } catch {
              // ignore single file deletion failure
            }
          }
        }

        if (current !== cacheDir) {
          dirsToRemove.push(current)
        }
      }

      for (let i = dirsToRemove.length - 1; i >= 0; i--) {
        try {
          fs.rmdirSync(dirsToRemove[i])
        } catch {
          // ignore empty dir removal failure
        }
      }
    }

    try {
      fs.mkdirSync(cacheBinDir, { recursive: true })
    } catch {
      // ignore dir creation failure
    }
  } catch (err) {
    return { ok: false, error: `failed to clear cache: ${String(err?.message || err)}`, deletedCount, freedBytes }
  }

  return { ok: true, deletedCount, freedBytes }
}

export { DWEB_PROJECT_ASSET_HOST }
