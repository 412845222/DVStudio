type Task = {
  id: string
  url: string
  // target max width for poster; preserves aspect
  maxWidth?: number
  timeoutMs?: number
  onResult?: (res: { id: string; posterUrl?: string; error?: string }) => void
}

type Options = {
  concurrency?: number
  defaultTimeoutMs?: number
  defaultMaxWidth?: number
}

export class VideoFirstFrameCaptureQueue {
  private readonly concurrency: number
  private readonly defaultTimeoutMs: number
  private readonly defaultMaxWidth: number

  private cancelled = false
  private active = 0
  private queue: Task[] = []
  private activeEls = new Map<string, HTMLVideoElement>()

  constructor(opts: Options = {}) {
    this.concurrency = Math.max(1, Math.floor(Number(opts.concurrency ?? 1)))
    this.defaultTimeoutMs = Math.max(500, Math.floor(Number(opts.defaultTimeoutMs ?? 12_000)))
    this.defaultMaxWidth = Math.max(64, Math.floor(Number(opts.defaultMaxWidth ?? 360)))
  }

  enqueue(tasks: Task[]) {
    if (this.cancelled) return
    if (!Array.isArray(tasks) || !tasks.length) return
    this.queue.push(...tasks)
    this.pump()
  }

  cancel() {
    this.cancelled = true
    this.queue = []
    for (const [id, el] of this.activeEls.entries()) {
      try {
        el.src = ''
      } catch {
        // ignore
      }
      try {
        el.load?.()
      } catch {
        // ignore
      }
      this.activeEls.delete(id)
    }
  }

  private pump() {
    if (this.cancelled) return
    queueMicrotask(() => this.pumpOnce())
  }

  private pumpOnce() {
    if (this.cancelled) return
    while (this.active < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!
      void this.runOne(task)
    }
  }

  private async runOne(task: Task) {
    if (this.cancelled) return
    this.active += 1

    const done = (res: { id: string; posterUrl?: string; error?: string }) => {
      try {
        task.onResult?.(res)
      } catch {
        // ignore
      }
    }

    const maxWidth = Math.max(64, Math.floor(Number(task.maxWidth ?? this.defaultMaxWidth)))
    const timeoutMs = Math.max(500, Math.floor(Number(task.timeoutMs ?? this.defaultTimeoutMs)))

    const el = document.createElement('video')
    el.preload = 'auto'
    ;(el as any).playsInline = true
    el.muted = true
    this.activeEls.set(task.id, el)

    try {
      const result = await new Promise<{ posterUrl?: string; error?: string }>((resolve) => {
        let finished = false
        const finish = (out: { posterUrl?: string; error?: string }) => {
          if (finished) return
          finished = true
          try {
            el.onloadeddata = null
            el.onerror = null
          } catch {
            // ignore
          }
          resolve(out)
        }

        const tid = window.setTimeout(() => finish({ error: 'timeout' }), timeoutMs)

        const capture = async () => {
          try {
            const vw = Math.max(1, Math.floor((el as any).videoWidth || 1))
            const vh = Math.max(1, Math.floor((el as any).videoHeight || 1))
            const scale = Math.min(1, maxWidth / vw)
            const cw = Math.max(1, Math.floor(vw * scale))
            const ch = Math.max(1, Math.floor(vh * scale))

            const canvas = document.createElement('canvas')
            canvas.width = cw
            canvas.height = ch
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              window.clearTimeout(tid)
              finish({ error: 'no canvas ctx' })
              return
            }

            ctx.drawImage(el, 0, 0, cw, ch)

            canvas.toBlob(
              (blob) => {
                window.clearTimeout(tid)
                if (!blob) {
                  finish({ error: 'toBlob failed' })
                  return
                }
                try {
                  const url = URL.createObjectURL(blob)
                  finish({ posterUrl: url })
                } catch {
                  finish({ error: 'createObjectURL failed' })
                }
              },
              'image/png',
              0.92
            )
          } catch {
            window.clearTimeout(tid)
            finish({ error: 'capture failed' })
          }
        }

        el.onloadeddata = () => {
          void capture()
        }
        el.onerror = () => {
          window.clearTimeout(tid)
          finish({ error: 'error' })
        }

        try {
          el.src = task.url
          el.currentTime = 0
          el.load()
        } catch {
          window.clearTimeout(tid)
          finish({ error: 'load failed' })
        }
      })

      done({ id: task.id, ...result })
    } catch (err: any) {
      done({ id: task.id, error: String(err?.message ?? err ?? 'unknown') })
    } finally {
      const cur = this.activeEls.get(task.id)
      if (cur) {
        try {
          cur.src = ''
        } catch {
          // ignore
        }
        this.activeEls.delete(task.id)
      }
      this.active = Math.max(0, this.active - 1)
      this.pump()
    }
  }
}
