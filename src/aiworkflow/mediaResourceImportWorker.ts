import { getErrorMessage } from '../types/utils'

export type MediaImportKind = 'image' | 'video'

export type MediaImportTask = {
  resourceId: string
  kind: MediaImportKind
  name: string
  file: File
}

export type MediaImportResult = {
  resourceId: string
  kind: MediaImportKind
  url: string
  sourcePath?: string
  width?: number
  height?: number
  error?: string
}

type ProcessMessage = {
  type: 'process'
  tasks: MediaImportTask[]
}

type ResultMessage = {
  type: 'result'
  results: MediaImportResult[]
}

const safeCreateObjectUrl = (file: File): string => {
  try {
    // DedicatedWorkerGlobalScope supports URL.createObjectURL in modern browsers.
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

const safeGetImageSize = async (file: File): Promise<{ width: number; height: number } | null> => {
  try {
    // createImageBitmap can run in workers (off-main-thread decode).
    const bmp = await createImageBitmap(file)
    const width = Math.max(1, Math.floor((bmp as any).width || 1))
    const height = Math.max(1, Math.floor((bmp as any).height || 1))
    try {
      ;(bmp as any).close?.()
    } catch {
      // ignore
    }
    return { width, height }
  } catch {
    return null
  }
}

self.addEventListener('message', async (ev: MessageEvent<ProcessMessage>) => {
  const msg = ev.data
  if (!msg || msg.type !== 'process' || !Array.isArray(msg.tasks)) return

  const results: MediaImportResult[] = []

  for (const t of msg.tasks) {
    const resourceId = String((t as any)?.resourceId ?? '').trim()
    const kind = (t as any)?.kind === 'video' ? 'video' : 'image'
    const file = (t as any)?.file as File | undefined

    if (!resourceId || !file) {
      results.push({
        resourceId: resourceId || `invalid-${Math.random().toString(36).slice(2)}`,
        kind,
        url: '',
        error: 'invalid task',
      })
      continue
    }

    let url = ''
    let sourcePath = ''
    let width: number | undefined
    let height: number | undefined

    try {
      // 1) Create object URL (cheap, no decode).
      url = safeCreateObjectUrl(file)

      // Best-effort: capture absolute source path (Electron / desktop runtimes may provide this).
      const p = (file as any)?.path
      if (typeof p === 'string' && p.trim()) sourcePath = p.trim()

      // 2) For images, decode size off-main-thread.
      if (kind === 'image') {
        const size = await safeGetImageSize(file)
        if (size) {
          width = size.width
          height = size.height
        }
      }

      results.push({ resourceId, kind, url, sourcePath, width, height })
    } catch (err: unknown) {
      results.push({ resourceId, kind, url, sourcePath, error: getErrorMessage(err) })
    }
  }

  const out: ResultMessage = { type: 'result', results }
  ;(self as any).postMessage(out)
})
