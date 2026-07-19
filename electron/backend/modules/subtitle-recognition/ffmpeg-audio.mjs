import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getTempDir, ensureDir, getFfmpegDir } from './paths.mjs'
import { getFfmpegPath, getFfprobePath } from './environment.mjs'

function getFfmpegEnv() {
  const ffmpegDir = getFfmpegDir()
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const currentPath = process.env[pathKey] || process.env.PATH || ''
  const pathSep = process.platform === 'win32' ? ';' : ':'
  return {
    ...process.env,
    [pathKey]: ffmpegDir + pathSep + currentPath,
  }
}

function parseTimeToMs(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  let seconds = 0
  if (parts.length === 3) {
    seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  } else {
    seconds = parseFloat(parts[0])
  }
  return Math.floor(seconds * 1000)
}

function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath()
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]

    let stdout = ''
    let stderr = ''
    const child = spawn(ffprobePath, args, { windowsHide: true, env: getFfmpegEnv() })

    child.stdout.on('data', (data) => { stdout += data.toString('utf-8') })
    child.stderr.on('data', (data) => { stderr += data.toString('utf-8') })

    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const duration = parseFloat(stdout.trim())
      resolve(isNaN(duration) ? null : duration * 1000)
    })

    child.on('error', (err) => {
      console.error('[SubtitleRecog] ffprobe error:', err.message)
      resolve(null)
    })
  })
}

export async function extractAudio(videoPath, options = {}) {
  const { onProgress, signal, outputPath } = options

  if (!videoPath || typeof videoPath !== 'string') {
    throw new Error('Video path is required')
  }

  const normalizedPath = path.normalize(videoPath)
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Video file not found: ${normalizedPath}`)
  }

  let audioPath
  if (outputPath && typeof outputPath === 'string') {
    const outDir = path.dirname(outputPath)
    ensureDir(outDir)
    audioPath = path.normalize(outputPath)
  } else {
    const tempDir = getTempDir()
    ensureDir(tempDir)
    const videoBasename = path.basename(normalizedPath, path.extname(normalizedPath)).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
    audioPath = path.join(tempDir, `${videoBasename}_${Date.now()}.wav`)
  }

  const duration = await getVideoDuration(normalizedPath)

  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath()
    const args = [
      '-y',
      '-i', normalizedPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      audioPath,
    ]

    let lastProgress = 0
    const env = getFfmpegEnv()
    const child = spawn(ffmpegPath, args, { windowsHide: true, env })

    let stderr = ''
    child.stderr.on('data', (data) => {
      const text = data.toString('utf-8')
      stderr += text

      const timeMatch = text.match(/time=(\d+:\d+:\d+\.\d+|\d+:\d+\.\d+|\d+\.\d+)/)
      if (timeMatch && duration && duration > 0) {
        const currentMs = parseTimeToMs(timeMatch[1])
        const percent = Math.min(99, Math.floor((currentMs / duration) * 100))
        if (percent > lastProgress) {
          lastProgress = percent
          if (onProgress) {
            onProgress({
              phase: 'extracting-audio',
              percent,
              currentMs,
              totalMs: duration,
            })
          }
        }
      }
    })

    child.on('close', (code) => {
      if (code !== 0) {
        try { fs.unlinkSync(audioPath) } catch {}
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`))
        return
      }

      if (!fs.existsSync(audioPath)) {
        reject(new Error('Audio extraction failed: output file not created'))
        return
      }

      const stat = fs.statSync(audioPath)
      if (stat.size < 1024) {
        try { fs.unlinkSync(audioPath) } catch {}
        reject(new Error('Audio extraction failed: output file is empty'))
        return
      }

      if (onProgress) {
        onProgress({ phase: 'extracting-audio', percent: 100 })
      }
      resolve({ audioPath, duration })
    })

    child.on('error', (err) => {
      try { fs.unlinkSync(audioPath) } catch {}
      reject(new Error(`Failed to start ffmpeg: ${err.message}. Please check if FFmpeg is installed correctly.`))
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill()
        try { fs.unlinkSync(audioPath) } catch {}
        reject(new Error('Aborted'))
      })
    }
  })
}

export function cleanupAudio(audioPath) {
  if (audioPath && fs.existsSync(audioPath)) {
    try {
      fs.unlinkSync(audioPath)
    } catch {}
  }
}
