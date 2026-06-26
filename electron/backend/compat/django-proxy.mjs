import http from 'node:http'
import { URL } from 'node:url'
import logger from '../core/logger.mjs'

export function createDjangoProxy({ getBaseUrl }) {
  const log = logger.child('django-proxy')

  return {
    async proxyRequest(channel, payload) {
      const baseUrl = getBaseUrl()
      
      if (!baseUrl) {
        return { ok: false, error: 'Django backend not available' }
      }

      const djangoPath = channelToDjangoPath(channel)
      if (!djangoPath) {
        return { ok: false, error: `No Django route mapping for channel: ${channel}` }
      }

      log.debug(`Proxying ${channel} -> ${djangoPath}`)

      return new Promise((resolve) => {
        const url = new URL(djangoPath, baseUrl)
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }, (res) => {
          const chunks = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body, status: res.statusCode })
            }
          })
          res.on('error', (err) => {
            resolve({ ok: false, error: err.message })
          })
        })

        req.on('error', (err) => {
          resolve({ ok: false, error: err.message })
        })

        req.on('timeout', () => {
          req.destroy()
          resolve({ ok: false, error: 'Request to Django timed out' })
        })

        if (payload) {
          req.write(JSON.stringify(payload))
        }
        req.end()
      })
    },
  }
}

function channelToDjangoPath(channel) {
  if (!channel.startsWith('dweb:')) return null
  const parts = channel.slice(5).split(':')
  
  if (parts.length < 2) return null
  
  const [namespace, action, ...rest] = parts
  
  if (namespace === 'chat') {
    if (action === 'conversations') {
      if (rest.includes('create') || rest.includes('list')) return '/api/ai/chat/conversations'
      if (rest[0] && rest[1] === 'messages') {
        if (rest[2] === 'stream') {
          return `/api/ai/chat/conversations/${rest[0]}/messages/stream`
        }
        return `/api/ai/chat/conversations/${rest[0]}/messages`
      }
    }
  }

  if (namespace === 'subtitle') {
    return '/api/ai/subtitle/'
  }

  if (namespace === 'third-party' || namespace === 'thirdparty') {
    if (action === 'meshy') return '/api/thirdparty/meshy/'
    if (action === 'kling') return '/api/thirdparty/kling/'
    if (action === 'runway') return '/api/thirdparty/runway/'
  }

  if (namespace === 'comfyui') {
    return '/api/ai/comfyui/'
  }

  if (namespace === 'export') {
    return '/api/ai/export/'
  }

  return null
}

export default createDjangoProxy
