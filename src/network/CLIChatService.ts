import { isRecord, isString } from '../types/utils'
import { getBackendBaseUrl } from './backendConfig'
import { hasIpcApi, ipcOrHttp, unwrapIpcResult, type IpcResult } from './ipcClient'

export type CLIAdapterInfo = {
  id: string
  name: string
  description?: string
  version?: string
  available: boolean
  requirements?: string[]
}

export type CLISessionInfo = {
  sessionId: string
  adapterId: string
  createdAt: string
  status: 'active' | 'stopped' | 'error'
  lastMessageAt?: string
}

export type CLIStreamChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: string; input?: unknown }
  | { type: 'tool_result'; tool: string; output?: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type CLISendOptions = {
  sessionId?: string
  adapterId?: string
  message: string
  context?: string
}

type CLIIpcBridge = {
  dweb?: {
    cli?: {
      checkAvailability?: (payload: unknown) => Promise<unknown>
      listAdapters?: () => Promise<unknown>
      startSession?: (payload: unknown) => Promise<unknown>
      stopSession?: (payload: unknown) => Promise<unknown>
      sendMessage?: (payload: unknown) => AsyncGenerator<unknown>
      cancel?: (payload: unknown) => Promise<unknown>
      getSession?: (payload: unknown) => Promise<unknown>
      listSessions?: () => Promise<unknown>
    }
  }
}

function getIpcBridge(): CLIIpcBridge {
  return window as unknown as CLIIpcBridge
}

export async function cliCheckAvailability(adapterId?: string): Promise<IpcResult<{ available: boolean; reason?: string }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.checkAvailability?.({ adapterId }) as Promise<IpcResult<{ available: boolean; reason?: string }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/check-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterId }),
      })
      return res.json()
    }
  )
}

export async function cliListAdapters(): Promise<IpcResult<{ adapters: CLIAdapterInfo[] }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.listAdapters?.() as Promise<IpcResult<{ adapters: CLIAdapterInfo[] }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/adapters`)
      return res.json()
    }
  )
}

export async function cliStartSession(adapterId: string): Promise<IpcResult<{ sessionId: string; adapterId: string }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.startSession?.({ adapterId }) as Promise<IpcResult<{ sessionId: string; adapterId: string }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterId }),
      })
      return res.json()
    }
  )
}

export async function cliStopSession(sessionId: string): Promise<IpcResult<{ stopped: boolean }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.stopSession?.({ sessionId }) as Promise<IpcResult<{ stopped: boolean }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions/${sessionId}/stop`, { method: 'POST' })
      return res.json()
    }
  )
}

export async function cliCancel(sessionId: string): Promise<IpcResult<{ cancelled: boolean }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.cancel?.({ sessionId }) as Promise<IpcResult<{ cancelled: boolean }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions/${sessionId}/cancel`, { method: 'POST' })
      return res.json()
    }
  )
}

export async function cliGetSession(sessionId: string): Promise<IpcResult<{ session: CLISessionInfo }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.getSession?.({ sessionId }) as Promise<IpcResult<{ session: CLISessionInfo }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions/${sessionId}`)
      return res.json()
    }
  )
}

export async function cliListSessions(): Promise<IpcResult<{ sessions: CLISessionInfo[] }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.listSessions?.() as Promise<IpcResult<{ sessions: CLISessionInfo[] }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions`)
      return res.json()
    }
  )
}

export async function* cliSendMessage(options: CLISendOptions): AsyncGenerator<CLIStreamChunk> {
  const bridge = getIpcBridge()

  if (hasIpcApi() && bridge.dweb?.cli?.sendMessage) {
    try {
      const gen = bridge.dweb.cli.sendMessage(options)
      if (!gen || typeof gen[Symbol.asyncIterator] !== 'function') {
        yield { type: 'error', message: 'CLI stream not available via IPC' }
        return
      }
      for await (const raw of gen) {
        const chunk = normalizeCLIChunk(raw)
        if (chunk) yield chunk
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      yield { type: 'error', message: msg }
    }
    return
  }

  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/cli/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
    if (!res.ok || !res.body) {
      yield { type: 'error', message: `HTTP ${res.status}` }
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('data: [DONE]')) continue
        const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
        try {
          const raw = JSON.parse(dataStr)
          const chunk = normalizeCLIChunk(raw)
          if (chunk) yield chunk
        } catch {
          yield { type: 'text', content: dataStr }
        }
      }
    }
    yield { type: 'done' }
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
    yield { type: 'error', message: msg }
  }
}

function normalizeCLIChunk(raw: unknown): CLIStreamChunk | null {
  if (!raw) return null
  if (isString(raw)) {
    return { type: 'text', content: raw }
  }
  if (!isRecord(raw)) return null
  const type = String(raw.type || raw.event || '')
  if (type === 'text' || type === 'content' || type === 'output') {
    const content = String(raw.content || raw.text || raw.delta || raw.output || '')
    return content ? { type: 'text', content } : null
  }
  if (type === 'tool_call' || type === 'tool-call') {
    return { type: 'tool_call', tool: String(raw.tool || raw.name || ''), input: raw.input || raw.arguments }
  }
  if (type === 'tool_result' || type === 'tool-result') {
    return { type: 'tool_result', tool: String(raw.tool || raw.name || ''), output: raw.output || raw.result }
  }
  if (type === 'error') {
    return { type: 'error', message: String(raw.message || raw.error || 'Unknown error') }
  }
  if (type === 'done' || type === 'end') {
    return { type: 'done' }
  }
  return null
}
