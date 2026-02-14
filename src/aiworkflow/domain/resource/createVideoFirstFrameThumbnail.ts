export type VideoThumbnailResult = {
  blob: Blob
  width: number
  height: number
  mime: string
}

const blobFromCanvas = (canvas: HTMLCanvasElement, mime: string, quality: number) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('canvas.toBlob returned null'))
      },
      mime,
      quality
    )
  })
}

export const createVideoFirstFrameThumbnail = async (opts: {
  url: string
  targetWidth?: number
  mime?: string
  quality?: number
  timeoutMs?: number
}): Promise<VideoThumbnailResult> => {
  const url = String(opts?.url ?? '').trim()
  if (!url) throw new Error('url is required')

  const targetWidth = Math.max(32, Math.floor(Number(opts?.targetWidth ?? 360)))
  const mime = String(opts?.mime ?? 'image/jpeg')
  const quality = Math.min(0.95, Math.max(0.5, Number(opts?.quality ?? 0.82)))
  const timeoutMs = Math.max(1500, Math.floor(Number(opts?.timeoutMs ?? 12000)))

  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  ;(video as any).playsInline = true
  ;(video as any).crossOrigin = 'anonymous'

  const cleanup = () => {
    try {
      video.pause()
    } catch {
      // ignore
    }
    try {
      video.removeAttribute('src')
      video.load()
    } catch {
      // ignore
    }
  }

  try {
    const ready = await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('thumbnail timeout')), timeoutMs)

      const onError = () => {
        window.clearTimeout(t)
        reject(new Error('video load failed'))
      }

      const onLoadedMeta = () => {
        // Ensure we can render a frame.
        try {
          video.currentTime = 0
        } catch {
          // ignore
        }
      }

      const onSeeked = () => {
        window.clearTimeout(t)
        resolve()
      }

      const onLoadedData = () => {
        // Some browsers don't fire seeked reliably for 0; loadeddata is good enough.
        window.clearTimeout(t)
        resolve()
      }

      video.addEventListener('error', onError, { once: true })
      video.addEventListener('loadedmetadata', onLoadedMeta, { once: true })
      video.addEventListener('seeked', onSeeked, { once: true })
      video.addEventListener('loadeddata', onLoadedData, { once: true })

      video.src = url
      video.load()
    })

    void ready

    const vw = Math.max(1, Math.floor(video.videoWidth || 1))
    const vh = Math.max(1, Math.floor(video.videoHeight || 1))

    const outW = targetWidth
    const outH = Math.max(1, Math.round((vh * outW) / Math.max(1, vw)))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context not available')

    ctx.drawImage(video, 0, 0, outW, outH)

    const blob = await blobFromCanvas(canvas, mime, quality)
    return { blob, width: outW, height: outH, mime }
  } finally {
    cleanup()
  }
}
