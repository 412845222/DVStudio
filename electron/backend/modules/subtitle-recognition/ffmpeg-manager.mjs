import fs from 'node:fs'
import path from 'node:path'
import { getFfmpegDir, getFfmpegBinaryPath, getFfprobeBinaryPath, getTempDir, ensureDir } from './paths.mjs'
import { downloadWithFallback } from './downloader.mjs'
import { checkFfmpeg } from './environment.mjs'

const FFMPEG_VERSION = '7.0.2'

function getDownloadUrls(config, useMirror) {
  const urls = []
  if (useMirror) {
    if (config.mirrorUrls) {
      urls.push(...config.mirrorUrls)
    }
    if (config.mirrorUrl) {
      urls.push(config.mirrorUrl)
    }
  }
  urls.push(config.url)
  return urls
}

const FFMPEG_CONFIG = {
  win32: {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
    mirrorUrl: `https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
    mirrorUrls: [
      `https://gh-proxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
      `https://ghps.cc/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
    ],
    archiveName: 'ffmpeg-win64.zip',
    ffmpegBinaryInArchive: 'bin/ffmpeg.exe',
    ffprobeBinaryInArchive: 'bin/ffprobe.exe',
  },
  darwin: {
    url: '',
    mirrorUrl: '',
    mirrorUrls: [],
    archiveName: '',
    ffmpegBinaryInArchive: '',
    ffprobeBinaryInArchive: '',
  },
  linux: {
    url: '',
    mirrorUrl: '',
    mirrorUrls: [],
    archiveName: '',
    ffmpegBinaryInArchive: '',
    ffprobeBinaryInArchive: '',
  },
}

function getPlatformConfig() {
  const platform = process.platform
  return FFMPEG_CONFIG[platform] || null
}

async function extractZip(zipPath, targetDir) {
  const JSZip = (await import('jszip')).default
  const data = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(data)

  const config = getPlatformConfig()
  if (!config) throw new Error(`Unsupported platform: ${process.platform}`)

  let ffmpegFile = null
  let ffprobeFile = null

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const normalizedName = filename.replace(/\\/g, '/').toLowerCase()
    const baseName = path.basename(filename).toLowerCase()
    if (baseName === 'ffmpeg.exe' || (baseName === 'ffmpeg' && process.platform !== 'win32')) {
      ffmpegFile = file
    } else if (baseName === 'ffprobe.exe' || (baseName === 'ffprobe' && process.platform !== 'win32')) {
      ffprobeFile = file
    }
  }

  if (!ffmpegFile) {
    const allFiles = Object.keys(zip.files).filter(f => !f.endsWith('/')).join(', ')
    throw new Error(`Could not find ffmpeg binary in archive. Available files: ${allFiles.slice(0, 500)}`)
  }

  ensureDir(targetDir)

  const ffmpegTargetPath = getFfmpegBinaryPath()
  const ffmpegContent = await ffmpegFile.async('nodebuffer')
  fs.writeFileSync(ffmpegTargetPath, ffmpegContent)

  if (ffprobeFile) {
    const ffprobeTargetPath = getFfprobeBinaryPath()
    const ffprobeContent = await ffprobeFile.async('nodebuffer')
    fs.writeFileSync(ffprobeTargetPath, ffprobeContent)
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(ffmpegTargetPath, 0o755)
      if (ffprobeFile) fs.chmodSync(getFfprobeBinaryPath(), 0o755)
    } catch {}
  }

  return { ffmpegPath: ffmpegTargetPath, ffprobePath: ffprobeFile ? getFfprobeBinaryPath() : null }
}

export function getFfmpegDownloadConfig(useMirror = true) {
  const config = getPlatformConfig()
  if (!config || !config.url) {
    return {
      supported: false,
      platform: process.platform,
      message: `Auto-download FFmpeg is not yet supported on ${process.platform}. Please install FFmpeg manually and add it to PATH.`,
    }
  }

  const urls = getDownloadUrls(config, useMirror)
  return {
    supported: true,
    platform: process.platform,
    version: FFMPEG_VERSION,
    urls,
    url: urls[0],
    fileName: config.archiveName,
    estimatedSize: process.platform === 'win32' ? 120 * 1024 * 1024 : 80 * 1024 * 1024,
  }
}

export async function* downloadAndInstallFfmpeg(options = {}) {
  const { useMirror = true, overwrite = false } = options

  const config = getPlatformConfig()
  if (!config || !config.url) {
    yield { type: 'error', message: `Auto-download FFmpeg is not supported on ${process.platform}` }
    return
  }

  ensureDir(getFfmpegDir())

  const currentStatus = await checkFfmpeg()
  if (currentStatus.ok && !overwrite) {
    yield { type: 'progress', percent: 100, message: 'FFmpeg already installed' }
    yield { type: 'done', path: getFfmpegBinaryPath() }
    return
  }

  const tempDir = getTempDir()
  ensureDir(tempDir)

  const urls = getDownloadUrls(config, useMirror)
  const archivePath = path.join(tempDir, config.archiveName)

  yield { type: 'phase', phase: 'downloading', message: '正在下载 FFmpeg...' }

  let downloadSuccess = false
  try {
    for await (const chunk of downloadWithFallback(urls, archivePath, { overwrite: true })) {
      if (chunk.type === 'progress') {
        yield {
          type: 'progress',
          percent: Math.floor(chunk.percent * 0.8),
          downloadedBytes: chunk.downloadedBytes,
          totalBytes: chunk.totalBytes,
          indeterminate: chunk.indeterminate,
          message: chunk.message || '下载 FFmpeg 中...',
        }
      } else if (chunk.type === 'status') {
        yield { type: 'status', message: chunk.message }
      } else if (chunk.type === 'error') {
        yield { type: 'error', message: chunk.message }
        return
      } else if (chunk.type === 'done') {
        downloadSuccess = true
        yield { type: 'progress', percent: 80, message: '下载完成，正在解压...' }
      }
    }
  } catch (err) {
    yield { type: 'error', message: `下载失败: ${err.message}` }
    return
  }

  if (!downloadSuccess) {
    yield { type: 'error', message: '下载未完成，请重试' }
    return
  }

  if (!fs.existsSync(archivePath)) {
    yield { type: 'error', message: `下载失败：文件未保存到 ${archivePath}` }
    return
  }

  const archiveStat = fs.statSync(archivePath)
  if (archiveStat.size < 1024 * 1024) {
    try { fs.unlinkSync(archivePath) } catch {}
    yield { type: 'error', message: '下载失败：文件大小异常，可能是网络错误或源不可用' }
    return
  }

  yield { type: 'phase', phase: 'extracting', message: '正在解压 FFmpeg...' }

  try {
    await extractZip(archivePath, getFfmpegDir())

    try {
      fs.unlinkSync(archivePath)
    } catch {}
  } catch (err) {
    yield { type: 'error', message: `解压失败: ${err.message}` }
    return
  }

  yield { type: 'progress', percent: 95, message: '正在验证...' }

  const finalStatus = await checkFfmpeg(getFfmpegBinaryPath())
  if (!finalStatus.ok) {
    yield { type: 'error', message: 'FFmpeg 安装后验证失败' }
    return
  }

  yield { type: 'progress', percent: 100, message: 'FFmpeg 安装完成' }
  yield { type: 'done', path: getFfmpegBinaryPath(), version: FFMPEG_VERSION }
}

export function removeFfmpeg() {
  const ffmpegPath = getFfmpegBinaryPath()
  const ffprobePath = getFfprobeBinaryPath()
  const errors = []

  if (fs.existsSync(ffmpegPath)) {
    try {
      fs.unlinkSync(ffmpegPath)
    } catch (err) {
      errors.push(`ffmpeg: ${err.message}`)
    }
  }

  if (fs.existsSync(ffprobePath)) {
    try {
      fs.unlinkSync(ffprobePath)
    } catch (err) {
      errors.push(`ffprobe: ${err.message}`)
    }
  }

  return { ok: errors.length === 0, errors }
}
