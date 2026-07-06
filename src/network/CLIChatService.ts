import { isRecord, isString } from '../types/utils'
import { getBackendBaseUrl } from './backendConfig'
import { hasIpcApi, ipcOrHttp, unwrapIpcResult, type IpcResult } from './ipcClient'
import type { EnvironmentCheckResult, CliModelInfo, CliAdapterSavedConfig, CliFixResult } from '../electronBridge/types'

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
  adapter?: string
  message?: string
  content?: string
  model?: string
  context?: string
  options?: Record<string, unknown>
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
      checkEnvironment?: (payload: unknown) => Promise<unknown>
      listModels?: (payload: unknown) => Promise<unknown>
      getConfig?: (payload: unknown) => Promise<unknown>
      saveConfig?: (payload: unknown) => Promise<unknown>
      runFix?: (payload: unknown) => Promise<unknown>
    }
  }
}

function getIpcBridge(): CLIIpcBridge {
  return window as unknown as CLIIpcBridge
}

function toPlain<T>(value: T): T {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

export async function cliCheckAvailability(name: string = 'all'): Promise<IpcResult<unknown>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.checkAvailability?.({ name }) as Promise<IpcResult<unknown>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/check-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
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

export async function cliStartSession(adapter: string): Promise<IpcResult<{ sessionId: string; adapter: string }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.startSession?.({ adapter }) as Promise<IpcResult<{ sessionId: string; adapter: string }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter }),
      })
      return res.json()
    }
  )
}

export async function cliStopSession(sessionId: string): Promise<IpcResult<{ ok: boolean }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.stopSession?.({ sessionId }) as Promise<IpcResult<{ ok: boolean }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions/${sessionId}/stop`, { method: 'POST' })
      return res.json()
    }
  )
}

export async function cliCancel(sessionId: string): Promise<IpcResult<{ ok: boolean }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.cancel?.({ sessionId }) as Promise<IpcResult<{ ok: boolean }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/sessions/${sessionId}/cancel`, { method: 'POST' })
      return res.json()
    }
  )
}

export async function cliGetSession(sessionId: string): Promise<IpcResult<{ found: boolean; sessionId: string; adapterName?: string }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.getSession?.({ sessionId }) as Promise<IpcResult<{ found: boolean; sessionId: string; adapterName?: string }>>,
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

export async function cliCheckEnvironment(
  adapter: string
): Promise<IpcResult<EnvironmentCheckResult>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.checkEnvironment?.({ adapter }) as Promise<IpcResult<EnvironmentCheckResult>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/check-environment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter }),
      })
      return res.json()
    }
  )
}

export async function cliListModels(
  adapter: string,
  forceRefresh = false
): Promise<IpcResult<{ adapter: string; models: CliModelInfo[] }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.listModels?.({ adapter, forceRefresh }) as Promise<IpcResult<{ adapter: string; models: CliModelInfo[] }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter, forceRefresh }),
      })
      return res.json()
    }
  )
}

export async function cliGetAdapterConfig(
  adapter: string
): Promise<IpcResult<{ adapter: string; config: CliAdapterSavedConfig | null }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.getConfig?.({ adapter }) as Promise<IpcResult<{ adapter: string; config: CliAdapterSavedConfig | null }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/config/${adapter}`)
      return res.json()
    }
  )
}

export async function cliSaveAdapterConfig(
  adapter: string,
  config: { enabled: boolean; models?: CliModelInfo[] }
): Promise<IpcResult<{ ok: boolean; adapter: string; config: CliAdapterSavedConfig }>> {
  const plainConfig = toPlain(config)
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.saveConfig?.({ adapter, config: plainConfig }) as Promise<IpcResult<{ ok: boolean; adapter: string; config: CliAdapterSavedConfig }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/config/${adapter}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: plainConfig }),
      })
      return res.json()
    }
  )
}

export async function cliRunFixCommand(
  adapter: string,
  checkKey: string
): Promise<IpcResult<CliFixResult>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.cli?.runFix?.({ adapter, checkKey }) as Promise<IpcResult<CliFixResult>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/cli/fix/${adapter}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkKey }),
      })
      return res.json()
    }
  )
}

export async function* cliSendMessage(options: CLISendOptions): AsyncGenerator<CLIStreamChunk> {
  const bridge = getIpcBridge()

  const payload = toPlain({
    sessionId: options.sessionId,
    content: options.message || options.content,
    options: {
      model: options.model,
      ...(options.options || {})
    }
  })

  if (hasIpcApi() && bridge.dweb?.cli?.sendMessage) {
    try {
      const gen = bridge.dweb.cli.sendMessage(payload)
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
      body: JSON.stringify(payload),
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
  if (type === 'text_delta' || type === 'textDelta' || type === 'thinking_delta' || type === 'thinkingDelta') {
    const content = String(raw.content || raw.text || raw.delta || '')
    return content ? { type: 'text', content } : null
  }
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
