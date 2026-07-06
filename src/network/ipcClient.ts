export type IpcResult<T = unknown> = {
  ok: boolean
  value?: T
  error?: string
  [key: string]: unknown
}

type DwebGlobal = {
  dweb?: {
    common?: Record<string, unknown>
    chat?: Record<string, unknown>
    export?: Record<string, unknown>
    editor?: Record<string, unknown>
    comfyui?: Record<string, unknown>
    thirdParty?: Record<string, unknown>
    projects?: Record<string, unknown>
    projectAssets?: Record<string, unknown>
    meshy?: Record<string, unknown>
    tripo3d?: Record<string, unknown>
    seedance?: Record<string, unknown>
    agentSkills?: Record<string, unknown>
    codex?: Record<string, unknown>
    aiworkflow?: Record<string, unknown>
  }
  __DWEB_BACKEND_MODE__?: string
}

function getDwebGlobal(): DwebGlobal {
  try {
    return (window as unknown as DwebGlobal)
  } catch {
    return {}
  }
}

export function isMigrationMode(): boolean {
  try {
    const mode = getDwebGlobal().__DWEB_BACKEND_MODE__
    return mode === 'migration'
  } catch {
    return false
  }
}

export function hasIpcApi(): boolean {
  try {
    return typeof getDwebGlobal().dweb === 'object' && getDwebGlobal().dweb !== null
  } catch {
    return false
  }
}

export function hasIpcModule(moduleName: string): boolean {
  if (!hasIpcApi()) return false
  const dweb = getDwebGlobal().dweb
  if (!dweb) return false
  if (moduleName === 'common') return typeof dweb.common === 'object' && dweb.common !== null
  if (moduleName === 'chat') return typeof dweb.chat === 'object' && dweb.chat !== null
  if (moduleName === 'export') return typeof dweb.export === 'object' && dweb.export !== null
  if (moduleName === 'editor') return typeof dweb.editor === 'object' && dweb.editor !== null
  if (moduleName === 'comfyui') return typeof dweb.comfyui === 'object' && dweb.comfyui !== null
  if (moduleName === 'thirdParty' || moduleName === 'third-party') {
    return typeof dweb.thirdParty === 'object' && dweb.thirdParty !== null
  }
  if (moduleName === 'projects') return typeof dweb.projects === 'object' && dweb.projects !== null
  if (moduleName === 'projectAssets' || moduleName === 'project-assets') {
    return typeof dweb.projectAssets === 'object' && dweb.projectAssets !== null
  }
  if (moduleName === 'aiworkflow') return typeof dweb.aiworkflow === 'object' && dweb.aiworkflow !== null
  if (moduleName === 'meshy') return typeof dweb.meshy === 'object' && dweb.meshy !== null
  if (moduleName === 'tripo3d') return typeof dweb.tripo3d === 'object' && dweb.tripo3d !== null
  if (moduleName === 'seedance') return typeof dweb.seedance === 'object' && dweb.seedance !== null
  if (moduleName === 'agentSkills' || moduleName === 'agent-skills') {
    return typeof dweb.agentSkills === 'object' && dweb.agentSkills !== null
  }
  if (moduleName === 'codex') return typeof dweb.codex === 'object' && dweb.codex !== null
  return false
}

export function unwrapIpcResult<T = unknown>(result: IpcResult<T>): T {
  if (result && typeof result === 'object') {
    if (result.ok === false) {
      throw new Error(result.error || 'IPC call failed')
    }
    if ('value' in result) {
      return result.value as T
    }
    if ('ok' in result && result.ok === true) {
      const { ok: _ok, value: _v, error: _e, ...rest } = result
      if (Object.keys(rest).length > 0) return rest as unknown as T
      return true as unknown as T
    }
    return result as unknown as T
  }
  return result as T
}

export async function ipcCall<T = unknown>(ipcFn: () => Promise<unknown>): Promise<T> {
  const result = await ipcFn()
  return unwrapIpcResult(result as IpcResult<T>)
}

export async function ipcOrHttp<T>(
  ipcCall: () => Promise<T>,
  httpCall: () => Promise<T>
): Promise<T> {
  if (isMigrationMode() && hasIpcApi()) {
    try {
      return await ipcCall()
    } catch (err) {
      console.warn('[ipcClient] IPC call failed, falling back to HTTP:', err)
    }
  }
  return httpCall()
}

export async function* ipcStreamOrHttp<T>(
  ipcStream: () => AsyncGenerator<T | string | unknown>,
  httpStream: () => AsyncGenerator<T>,
  parser?: (chunk: unknown) => T | T[] | null
): AsyncGenerator<T> {
  if (isMigrationMode() && hasIpcApi()) {
    try {
      for await (const chunk of ipcStream()) {
        let parsed: unknown = chunk
        if (typeof chunk === 'string') {
          try {
            parsed = JSON.parse(chunk)
          } catch {
            parsed = chunk
          }
        }
        if (parser) {
          const converted = parser(parsed)
          if (Array.isArray(converted)) {
            for (const item of converted) {
              if (item !== null && item !== undefined) yield item
            }
          } else if (converted !== null && converted !== undefined) {
            yield converted
          }
        } else if (parsed !== null && parsed !== undefined) {
          yield parsed as T
        }
      }
      return
    } catch (err) {
      console.warn('[ipcClient] IPC stream failed, falling back to HTTP:', err)
    }
  }
  yield* httpStream()
}

export function normalizeTimestamp(ts: number | string | undefined): string | undefined {
  if (ts === undefined || ts === null || ts === '') return undefined
  if (typeof ts === 'string') return ts
  if (typeof ts === 'number') {
    return new Date(ts > 1e12 ? ts : ts * 1000).toISOString()
  }
  return undefined
}

export function normalizeId(id: number | string | undefined): string | undefined {
  if (id === undefined || id === null) return undefined
  return String(id)
}
