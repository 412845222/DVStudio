import { TosClient } from '@volcengine/tos-sdk'
import https from 'https'
import logger from '../../../../core/logger.mjs'

const clients = new Map()

const originalHttpProxy = process.env.HTTP_PROXY || process.env.http_proxy
const originalHttpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy

function withNoProxyEnv(fn) {
  const proxyKeys = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
    'ALL_PROXY', 'all_proxy', 'FTP_PROXY', 'ftp_proxy',
  ]
  const prev = {}
  for (const key of proxyKeys) {
    prev[key] = process.env[key]
    delete process.env[key]
  }
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(
        (val) => {
          for (const key of proxyKeys) {
            if (prev[key] !== undefined) process.env[key] = prev[key]
          }
          return val
        },
        (err) => {
          for (const key of proxyKeys) {
            if (prev[key] !== undefined) process.env[key] = prev[key]
          }
          throw err
        }
      )
    }
    for (const key of proxyKeys) {
      if (prev[key] !== undefined) process.env[key] = prev[key]
    }
    return result
  } catch (err) {
    for (const key of proxyKeys) {
      if (prev[key] !== undefined) process.env[key] = prev[key]
    }
    throw err
  }
}

function getClientKey(credentials, region, bucketName, endpoint) {
  return `${credentials.accessKeyId}:${region}:${bucketName || ''}:${endpoint || ''}`
}

export function getTosClient(credentials, region, bucketName, endpoint) {
  if (!credentials?.accessKeyId || !credentials?.accessKeySecret) {
    throw new Error('TOS credentials are required: accessKeyId and accessKeySecret')
  }
  const regionId = region || 'cn-beijing'
  const finalEndpoint = endpoint || credentials.endpoint || resolveEndpoint(regionId)

  const key = getClientKey(credentials, regionId, bucketName, finalEndpoint)
  if (clients.has(key)) {
    return clients.get(key)
  }

  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    rejectUnauthorized: true,
  })

  const opts = {
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    region: regionId,
    endpoint: finalEndpoint,
    secure: true,
    enableVerifySSL: true,
    requestTimeout: 60000,
    connectionTimeout: 10000,
    httpsAgent,
  }
  if (bucketName) {
    opts.bucket = bucketName
  }

  const client = withNoProxyEnv(() => new TosClient(opts))

  const originalFetch = client.fetch.bind(client)
  client.fetch = function(method, path, query, headers, body, reqOpts) {
    return withNoProxyEnv(() => originalFetch(method, path, query, headers, body, reqOpts))
  }

  clients.set(key, client)
  return client
}

export { withNoProxyEnv }

export function getCachedClient(credentials, region, bucketName) {
  return getTosClient(credentials, region, bucketName)
}

export function clearClientCache() {
  for (const client of clients.values()) {
    try {
      if (client.httpsAgent) client.httpsAgent.destroy()
    } catch {}
  }
  clients.clear()
}

export function resolveEndpoint(region) {
  return `tos-${region || 'cn-beijing'}.volces.com`
}

export function buildPublicUrlBase(bucketName, endpoint) {
  return `https://${bucketName}.${endpoint}`
}

export function buildPublicUrl(bucketName, endpoint, key) {
  const base = buildPublicUrlBase(bucketName, endpoint)
  const safeKey = String(key || '').replace(/^\/+/, '')
  const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/')
  return `${base}/${encodedKey}`
}
