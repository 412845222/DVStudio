import { isRecord, isString } from '../types/utils'
import { getBackendBaseUrl } from './backendConfig'
import { hasIpcApi, ipcOrHttp, unwrapIpcResult, type IpcResult } from './ipcClient'

export type AgentStreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; tool: string; input?: unknown }
  | { type: 'tool_call_end'; toolCallId: string; tool: string; output?: unknown }
  | { type: 'tool_call_error'; toolCallId: string; tool: string; error: string }
  | { type: 'tool_call'; tool: string; input?: unknown }
  | { type: 'tool_result'; tool: string; output?: unknown }
  | { type: 'thought'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type AgentContextItem = {
  type: 'file' | 'selection' | 'project' | 'custom'
  label: string
  value: string
}

export type AgentStreamOptions = {
  prompt: string
  model?: string
  context?: unknown
  tools?: string[]
  systemPrompt?: string
  sessionId?: string
  apiSource?: string
  apiKeys?: Record<string, string>
}

type AgentIpcBridge = {
  dweb?: {
    agent?: {
      stream?: (payload: unknown) => AsyncGenerator<unknown>
      getContext?: (payload: unknown) => Promise<unknown>
      abort?: (payload: unknown) => Promise<unknown>
    }
  }
}

function getIpcBridge(): AgentIpcBridge {
  return window as unknown as AgentIpcBridge
}

export async function agentGetContext(projectPath?: string): Promise<IpcResult<{ items: AgentContextItem[] }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.agent?.getContext?.({ projectPath }) as Promise<IpcResult<{ items: AgentContextItem[] }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/agent/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      return res.json()
    }
  )
}

export async function agentAbort(sessionId?: string): Promise<IpcResult<{ aborted: boolean }>> {
  return ipcOrHttp(
    () => getIpcBridge().dweb?.agent?.abort?.({ sessionId }) as Promise<IpcResult<{ aborted: boolean }>>,
    async () => {
      const res = await fetch(`${getBackendBaseUrl()}/api/agent/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      return res.json()
    }
  )
}

export async function* agentStream(options: AgentStreamOptions): AsyncGenerator<AgentStreamChunk> {
  const bridge = getIpcBridge()

  if (hasIpcApi() && bridge.dweb?.agent?.stream) {
    try {
      const gen = bridge.dweb.agent.stream(options)
      if (!gen || typeof gen[Symbol.asyncIterator] !== 'function') {
        yield { type: 'error', message: 'Agent stream not available via IPC' }
        return
      }
      for await (const raw of gen) {
        const chunk = normalizeAgentChunk(raw)
        if (chunk) yield chunk
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      yield { type: 'error', message: msg }
    }
    return
  }

  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/agent/stream`, {
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
          const chunk = normalizeAgentChunk(raw)
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

function normalizeAgentChunk(raw: unknown): AgentStreamChunk | null {
  if (!raw || !isRecord(raw)) return null
  const type = String(raw.type || raw.event || '')
  if (type === 'text' || type === 'content' || type === 'text_delta') {
    const content = String(raw.content || raw.text || raw.delta || '')
    return content ? { type: 'text', content } : null
  }
  if (type === 'thinking_delta' || type === 'reasoning_delta') {
    const content = String(raw.content || raw.text || raw.delta || '')
    return content ? { type: 'thinking_delta', content } : null
  }
  if (type === 'tool_call_start') {
    return {
      type: 'tool_call_start',
      toolCallId: String(raw.toolCallId || raw.id || ''),
      tool: String(raw.tool || raw.name || ''),
      input: raw.input || raw.arguments
    }
  }
  if (type === 'tool_call_end') {
    return {
      type: 'tool_call_end',
      toolCallId: String(raw.toolCallId || raw.id || ''),
      tool: String(raw.tool || raw.name || ''),
      output: raw.output || raw.result
    }
  }
  if (type === 'tool_call_error') {
    return {
      type: 'tool_call_error',
      toolCallId: String(raw.toolCallId || raw.id || ''),
      tool: String(raw.tool || raw.name || ''),
      error: String(raw.error || raw.message || '')
    }
  }
  if (type === 'tool_call' || type === 'tool-call') {
    return { type: 'tool_call', tool: String(raw.tool || raw.name || ''), input: raw.input || raw.arguments }
  }
  if (type === 'tool_result' || type === 'tool-result') {
    return { type: 'tool_result', tool: String(raw.tool || raw.name || ''), output: raw.output || raw.result }
  }
  if (type === 'thought' || type === 'reasoning') {
    return { type: 'thought', content: String(raw.content || raw.text || '') }
  }
  if (type === 'error') {
    return { type: 'error', message: String(raw.message || raw.error || 'Unknown error') }
  }
  if (type === 'done' || type === 'end') {
    return { type: 'done' }
  }
  if (isString(raw)) {
    return { type: 'text', content: raw }
  }
  return null
}
