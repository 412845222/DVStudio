type Task = {
  id: string
  url: string
  onResult?: (res: { id: string; width?: number; height?: number; error?: string }) => void
}

type Options = {
  concurrency?: number
  timeoutMs?: number
}

export class VideoMetadataReadQueue {
  private readonly concurrency: number
  private readonly timeoutMs: number

  private cancelled = false
  private active = 0
  private queue: Task[] = []
  private activeEls = new Map<string, HTMLVideoElement>()

  constructor(opts: Options = {}) {
    this.concurrency = Math.max(1, Math.floor(Number(opts.concurrency ?? 2)))
    this.timeoutMs = Math.max(500, Math.floor(Number(opts.timeoutMs ?? 8000)))
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

    const done = (res: { id: string; width?: number; height?: number; error?: string }) => {
      try {
        task.onResult?.(res)
      } catch {
        // ignore
      }
    }

    const el = document.createElement('video')
    el.preload = 'metadata'
    // playsinline is harmless here; some browsers behave better.
    ;(el as any).playsInline = true
    this.activeEls.set(task.id, el)

    try {
      const result = await new Promise<{ width?: number; height?: number; error?: string }>((resolve) => {
        let finished = false
        const finish = (out: { width?: number; height?: number; error?: string }) => {
          if (finished) return
          finished = true
          try {
            el.onloadedmetadata = null
            el.onerror = null
          } catch {
            // ignore
          }
          resolve(out)
        }

        const tid = window.setTimeout(() => finish({ error: 'timeout' }), this.timeoutMs)

        el.onloadedmetadata = () => {
          window.clearTimeout(tid)
          const w = Math.max(1, Math.floor((el as any).videoWidth || 1))
          const h = Math.max(1, Math.floor((el as any).videoHeight || 1))
          finish({ width: w, height: h })
        }
        el.onerror = () => {
          window.clearTimeout(tid)
          finish({ error: 'error' })
        }

        try {
          el.src = task.url
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
