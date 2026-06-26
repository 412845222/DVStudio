import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { UpstreamError, ValidationError } from './errors.mjs'

const DEFAULT_TIMEOUT = 30000

export class HttpClient {
  constructor(defaultOptions = {}) {
    this.defaultOptions = {
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'User-Agent': 'DVSBackend/1.0 (Electron)',
      },
      ...defaultOptions,
    }
  }

  async request(url, options = {}) {
    const parsedUrl = new URL(url)
    const transport = parsedUrl.protocol === 'https:' ? https : http
    
    const requestOptions = {
      method: options.method || 'GET',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        ...this.defaultOptions.headers,
        ...options.headers,
      },
      timeout: options.timeout || this.defaultOptions.timeout,
    }

    if (options.body) {
      if (typeof options.body === 'object' && !requestOptions.headers['Content-Type']) {
        requestOptions.headers['Content-Type'] = 'application/json'
        options.body = JSON.stringify(options.body)
      }
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body)
    }

    return new Promise((resolve, reject) => {
      const req = transport.request(requestOptions, (res) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const body = buffer.toString('utf-8')
          
          let parsedBody = body
          const contentType = res.headers['content-type'] || ''
          if (contentType.includes('application/json')) {
            try {
              parsedBody = JSON.parse(body)
            } catch {
            }
          }

          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: parsedBody,
            rawBody: buffer,
          })
        })
        res.on('error', reject)
      })

      req.on('error', (err) => {
        reject(new UpstreamError(`HTTP request failed: ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy(new UpstreamError('Request timeout'))
      })

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          req.destroy(new ValidationError('Request aborted'))
        })
      }

      if (options.body) {
        req.write(options.body)
      }
      req.end()
    })
  }

  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' })
  }

  async post(url, body, options = {}) {
    return this.request(url, { ...options, method: 'POST', body })
  }

  postStream(url, options = {}) {
    const parsedUrl = new URL(url)
    const transport = parsedUrl.protocol === 'https:' ? https : http

    const requestOptions = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        ...this.defaultOptions.headers,
        ...options.headers,
        'Accept': 'text/event-stream',
      },
      timeout: options.timeout || 0,
    }

    if (options.body) {
      if (typeof options.body === 'object' && !requestOptions.headers['Content-Type']) {
        requestOptions.headers['Content-Type'] = 'application/json'
        options.body = JSON.stringify(options.body)
      }
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body)
    }

    const queue = []
    let done = false
    let error = null
    let resolveNext = null
    let rejectNext = null
    let buffer = ''
    let req = null
    let started = false

    function pump(line) {
      if (resolveNext) {
        const res = resolveNext
        resolveNext = null
        rejectNext = null
        res({ value: line, done: false })
      } else {
        queue.push(line)
      }
    }

    function flush() {
      while (queue.length > 0 && resolveNext) {
        const res = resolveNext
        resolveNext = null
        rejectNext = null
        res({ value: queue.shift(), done: false })
      }
    }

    function finish() {
      done = true
      if (resolveNext) {
        const res = resolveNext
        resolveNext = null
        rejectNext = null
        res({ value: undefined, done: true })
      }
    }

    function fail(err) {
      error = err
      if (rejectNext) {
        const rej = rejectNext
        resolveNext = null
        rejectNext = null
        rej(err)
      }
    }

    function start() {
      if (started) return
      started = true

      req = transport.request(requestOptions, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let errBody = ''
          response.on('data', (chunk) => { errBody += chunk.toString('utf-8') })
          response.on('end', () => {
            let detail = ''
            try {
              const parsed = JSON.parse(errBody)
              detail = parsed?.error?.message || parsed?.message || JSON.stringify(parsed?.error || parsed)
            } catch {
              detail = errBody.slice(0, 500)
            }
            console.error('[http-client] SSE error response:', response.statusCode, detail)
            fail(new UpstreamError(`SSE request failed with status ${response.statusCode}${detail ? ': ' + detail : ''}`))
          })
          response.resume()
          return
        }

        response.on('data', (chunk) => {
          buffer += chunk.toString('utf-8')
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const line of lines) {
            pump(line)
          }
          flush()
        })

        response.on('end', () => {
          if (buffer.trim()) {
            pump(buffer.trim())
          }
          finish()
        })

        response.on('error', (err) => {
          fail(new UpstreamError(`SSE response error: ${err.message}`))
        })
      })

      req.on('error', (err) => {
        fail(new UpstreamError(`SSE request failed: ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy(new UpstreamError('SSE request timeout'))
      })

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          done = true
          if (req) req.destroy()
        })
      }

      if (options.body) req.write(options.body)
      req.end()
    }

    return {
      [Symbol.asyncIterator]() {
        start()
        return {
          next() {
            return new Promise((resolve, reject) => {
              if (error) {
                reject(error)
                return
              }
              if (done && queue.length === 0) {
                resolve({ value: undefined, done: true })
                return
              }
              if (queue.length > 0) {
                resolve({ value: queue.shift(), done: false })
                return
              }
              resolveNext = resolve
              rejectNext = reject
            })
          },
          return() {
            done = true
            if (req) req.destroy()
            return Promise.resolve({ value: undefined, done: true })
          },
          throw(err) {
            done = true
            if (req) req.destroy()
            return Promise.reject(err)
          },
        }
      },
    }
  }
}

let _defaultClient = null

export function getHttpClient() {
  if (!_defaultClient) {
    _defaultClient = new HttpClient()
  }
  return _defaultClient
}

export default getHttpClient
