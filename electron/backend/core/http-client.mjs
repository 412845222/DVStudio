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

  async postStream(url, options = {}) {
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
    }

    return {
      req: null,
      [Symbol.asyncIterator]() {
        let res
        let buffer = ''
        let resolveNext
        let rejectNext
        let done = false

        const processChunk = (chunk) => {
          buffer += chunk.toString('utf-8')
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (resolveNext) {
              const res = resolveNext
              resolveNext = null
              res({ value: line, done: false })
            }
          }
        }

        const req = transport.request(requestOptions, (response) => {
          res = response
          
          if (response.statusCode < 200 || response.statusCode >= 300) {
            if (rejectNext) {
              const rej = rejectNext
              rejectNext = null
              rej(new UpstreamError(`SSE request failed with status ${response.statusCode}`))
            }
            return
          }

          response.on('data', processChunk)
          response.on('end', () => {
            done = true
            if (resolveNext) {
              resolveNext({ done: true })
            }
          })
          response.on('error', (err) => {
            if (rejectNext) rejectNext(err)
          })
        })

        req.on('error', (err) => {
          if (rejectNext) rejectNext(new UpstreamError(`SSE request failed: ${err.message}`))
        })

        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            req.destroy()
            done = true
          })
        }

        if (options.body) req.write(options.body)
        req.end()
        this.req = req

        return {
          next() {
            return new Promise((resolve, reject) => {
              if (done && buffer === '') {
                resolve({ done: true })
              } else if (buffer) {
                const lines = buffer.split(/\r?\n/)
                buffer = lines.pop() || ''
                resolve({ value: lines[0] || '', done: false })
              } else {
                resolveNext = resolve
                rejectNext = reject
              }
            })
          },
          return() {
            req.destroy()
            return Promise.resolve({ done: true })
          },
          throw(err) {
            req.destroy()
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
