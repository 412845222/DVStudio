import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

const baseUrl = String(process.env.DWEB_COPILOT_TEST_BASE_URL || 'http://127.0.0.1:5800').replace(/\/$/, '')
const projectId = Number(process.env.DWEB_COPILOT_TEST_PROJECT_ID || 999997)
const model = String(process.env.DWEB_COPILOT_TEST_MODEL || 'gpt-5.3-codex')
const agentMode = String(process.env.DWEB_COPILOT_TEST_AGENT_MODE || 'ask')
const content = String(process.env.DWEB_COPILOT_TEST_PROMPT || '请只回复 PONG')
const timeoutMs = Number(process.env.DWEB_COPILOT_TEST_TIMEOUT_MS || 120000)

const requestJson = (path, payload, method = 'POST') => new Promise((resolve, reject) => {
  const url = new URL(path, baseUrl)
  const body = payload == null ? '' : JSON.stringify(payload)
  const req = http.request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    let raw = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = { raw }
      }
      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        reject(new Error(`${method} ${url.pathname} failed: ${res.statusCode} ${raw.slice(0, 1000)}`))
        return
      }
      resolve(data)
    })
  })
  req.on('error', reject)
  req.end(body)
})

const streamSse = (path, payload) => new Promise((resolve, reject) => {
  const url = new URL(path, baseUrl)
  const body = JSON.stringify(payload)
  const seen = []
  let assistantText = ''
  let buffer = ''
  let eventName = ''
  let dataLines = []
  const startedAt = Date.now()
  const req = http.request(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => reject(new Error(`stream failed: ${res.statusCode} ${raw.slice(0, 1000)}`)))
      return
    }

    const flush = () => {
      if (!eventName && !dataLines.length) return
      const name = eventName || 'message'
      const text = dataLines.join('\n')
      eventName = ''
      dataLines = []
      let data = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { raw: text }
      }
      seen.push(name)
      if (name === 'assistant_delta') assistantText += String(data?.delta || '')
      if (name === 'error') {
        reject(new Error(`SSE error: ${String(data?.message || data?.raw || 'unknown')}`))
        req.destroy()
        return
      }
      if (name === 'turn_done') {
        resolve({ seen, assistantText, elapsedMs: Date.now() - startedAt })
        req.destroy()
      }
    }

    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const rawLine = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        idx = buffer.indexOf('\n')
        const line = rawLine.replace(/\r$/, '')
        if (!line.trim()) {
          flush()
          continue
        }
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart())
        }
      }
    })
    res.on('end', () => {
      flush()
      if (!seen.includes('turn_done')) reject(new Error(`stream ended before turn_done; seen=${seen.join(',')}`))
    })
  })
  req.on('error', reject)
  req.setTimeout(timeoutMs, () => {
    req.destroy(new Error(`stream timed out after ${timeoutMs}ms`))
  })
  req.end(body)
})

const waitForBackend = async () => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const health = await new Promise((resolve, reject) => {
        const url = new URL('/api/workflow/copilot/health', baseUrl)
        const req = http.get(url, (res) => {
          let raw = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => { raw += chunk })
          res.on('end', () => {
            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 500) {
              reject(new Error(`health status ${res.statusCode}`))
              return
            }
            try { resolve(JSON.parse(raw)) } catch { resolve({ raw }) }
          })
        })
        req.on('error', reject)
        req.setTimeout(2500, () => req.destroy(new Error('health timeout')))
      })
      return health
    } catch (err) {
      lastError = err
      await delay(500)
    }
  }
  throw lastError || new Error('backend did not become ready')
}

const main = async () => {
  console.log(`[copilot-sse] base=${baseUrl}`)
  const health = await waitForBackend()
  console.log(`[copilot-sse] health provider=${health?.provider || ''} reachable=${health?.reachable}`)
  if (health?.provider !== 'copilot-cli') throw new Error(`unexpected provider: ${health?.provider}`)
  if (health?.reachable !== true) throw new Error(`copilot health not reachable: ${health?.error || ''}`)

  const session = await requestJson('/api/workflow/copilot/sessions', {
    projectId,
    title: 'copilot sse check',
    model,
  })
  if (!session?.id) throw new Error('create session returned empty id')
  if (session?.provider !== 'copilot-cli') throw new Error(`session provider mismatch: ${session?.provider}`)
  console.log(`[copilot-sse] session=${session.id} model=${session.model_name}`)

  const result = await streamSse(`/api/workflow/copilot/sessions/${encodeURIComponent(session.id)}/messages:stream`, {
    projectId,
    content,
    agentMode,
    permissionProfile: 'default',
  })
  if (!result.seen.includes('assistant_delta')) throw new Error(`assistant_delta missing; seen=${result.seen.join(',')}`)
  if (!result.seen.includes('turn_done')) throw new Error(`turn_done missing; seen=${result.seen.join(',')}`)
  console.log(`[copilot-sse] ok events=${result.seen.join(',')} text=${JSON.stringify(result.assistantText)} elapsed=${result.elapsedMs}ms`)
}

main().catch((err) => {
  console.error(`[copilot-sse] failed: ${err?.message || err}`)
  process.exit(1)
})
