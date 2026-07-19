import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..', '..')
}

function findNearestGitRoot(startDir) {
  let current = path.resolve(startDir)
  while (true) {
    if (fs.existsSync(path.resolve(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return ''
    current = parent
  }
}

function isPackaged() {
  try {
    return !!process.defaultApp
  } catch {
    return false
  }
}

function getClientRootDir() {
  if (isPackaged()) return path.dirname(process.execPath)
  const repoRoot = getRepoRoot()
  const gitRoot = findNearestGitRoot(repoRoot)
  return gitRoot || repoRoot
}

export function getDvsResourceDir() {
  const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
  if (envResourceDir) return path.resolve(envResourceDir)
  return path.resolve(getClientRootDir(), 'DVSResource')
}

export function getSubtitleRecogDir() {
  return path.resolve(getDvsResourceDir(), 'SubtitleRecognition')
}

export function getWhisperBinaryDir() {
  return path.resolve(getSubtitleRecogDir(), 'bin')
}

export function getWhisperBinaryPath() {
  const binaryDir = getWhisperBinaryDir()
  const candidates = process.platform === 'win32'
    ? ['whisper-cli.exe', 'main.exe', 'whisper.exe']
    : ['whisper-cli', 'main', 'whisper']
  for (const name of candidates) {
    const p = path.resolve(binaryDir, name)
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p)
        if (stat.size > 100 * 1024) {
          return p
        }
      } catch {}
    }
  }
  const defaultName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  return path.resolve(binaryDir, defaultName)
}

export function getFfmpegDir() {
  return path.resolve(getSubtitleRecogDir(), 'ffmpeg')
}

export function getFfmpegBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return path.resolve(getFfmpegDir(), binaryName)
}

export function getFfprobeBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  return path.resolve(getFfmpegDir(), binaryName)
}

export function getWhisperModelDir() {
  return path.resolve(getSubtitleRecogDir(), 'models')
}

export function getWhisperModelPath(modelSize) {
  return path.resolve(getWhisperModelDir(), `ggml-${modelSize}.bin`)
}

export function getTempDir() {
  return path.resolve(getSubtitleRecogDir(), 'Temp')
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

export function ensureWhisperDirs() {
  ensureDir(getSubtitleRecogDir())
  ensureDir(getWhisperBinaryDir())
  ensureDir(getWhisperModelDir())
  ensureDir(getFfmpegDir())
  ensureDir(getTempDir())
}
