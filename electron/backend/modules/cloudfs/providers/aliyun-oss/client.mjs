import OSS from 'ali-oss'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import urllib from 'urllib'
import logger from '../../../../core/logger.mjs'

const clients = new Map()

const ALL_PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
  'ALL_PROXY', 'all_proxy', 'FTP_PROXY', 'ftp_proxy',
  'NO_PROXY', 'no_proxy',
  'URLLIB_ENABLE_PROXY', 'URLLIB_PROXY',
  'npm_config_proxy', 'npm_config_https_proxy',
  'YARN_PROXY', 'yarn_proxy',
  'GLOBAL_AGENT_HTTP_PROXY', 'GLOBAL_AGENT_HTTPS_PROXY',
]

function sanitizeEnv() {
  const prev = {}
  for (const key of ALL_PROXY_KEYS) {
    prev[key] = process.env[key]
    delete process.env[key]
  }
  process.env.NO_PROXY = '*'
  process.env.no_proxy = '*'
  return prev
}

function restoreEnv(prev) {
  for (const key of ALL_PROXY_KEYS) {
    if (prev[key] !== undefined) {
      process.env[key] = prev[key]
    } else {
      delete process.env[key]
    }
  }
}

function createCleanUrllib(httpsAgent) {
  const boundRequest = urllib.request.bind(urllib)

  function cleanRequest(url, args, callback) {
    if (arguments.length === 2 && typeof args === 'function') {
      callback = args
      args = {}
    }
    args = args || {}

    const reqArgs = {
      ...args,
      enableProxy: false,
      proxy: null,
      agent: args.agent || http.globalAgent,
      httpsAgent: httpsAgent,
      lookup: undefined,
      checkAddress: undefined,
    }

    const prev = sanitizeEnv()

    let result
    try {
      result = boundRequest(url, reqArgs)
    } catch (syncErr) {
      restoreEnv(prev)
      throw syncErr
    }

    if (callback) {
      result.then(
        res => { restoreEnv(prev); callback(null, res.data, res.res) },
        err => { restoreEnv(prev); callback(err) }
      )
      return
    }

    return result.then(
      res => { restoreEnv(prev); return res },
      err => { restoreEnv(prev); throw err }
    )
  }

  return {
    request: cleanRequest,
  }
}

function getClientKey(credentials, region, bucketName, endpoint) {
  const secretHash = crypto.createHash('sha256').update(credentials.accessKeySecret || '').digest('hex').slice(0, 12)
  return `${credentials.accessKeyId}:${secretHash}:${region}:${bucketName || ''}:${endpoint || ''}`
}

export function getOssClient(credentials, region, bucketName, endpoint) {
  if (!credentials?.accessKeyId || !credentials?.accessKeySecret) {
    throw new Error('OSS credentials are required: accessKeyId and accessKeySecret')
  }
  const regionId = region || 'oss-cn-hangzhou'
  const finalEndpoint = endpoint || credentials.endpoint || resolveEndpoint(regionId)

  const key = getClientKey(credentials, regionId, bucketName, finalEndpoint)
  if (clients.has(key)) {
    return clients.get(key)
  }

  logger.info(`[cloudfs:oss] Creating OSS client: region=${regionId}, endpoint=${finalEndpoint}, bucket=${bucketName || '(none)'}, ak=${credentials.accessKeyId.slice(0, 8)}...`)

  const prev = sanitizeEnv()

  try {
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 50,
      rejectUnauthorized: true,
    })

    const cleanUrllib = createCleanUrllib(httpsAgent)

    const opts = {
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      region: regionId,
      endpoint: finalEndpoint,
      secure: true,
      timeout: 60000,
      httpsAgent,
      urllib: cleanUrllib,
    }
    if (bucketName) {
      opts.bucket = bucketName
    }

    const client = new OSS(opts)

    client._dvCleanup = () => {
      try { httpsAgent.destroy() } catch {}
    }

    clients.set(key, client)
    logger.info(`[cloudfs:oss] OSS client created and cached`)
    return client
  } finally {
    restoreEnv(prev)
  }
}

export { sanitizeEnv, restoreEnv }
export const withNoProxyEnv = (fn) => {
  const prev = sanitizeEnv()
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(
        (val) => { restoreEnv(prev); return val },
        (err) => { restoreEnv(prev); throw err }
      )
    }
    restoreEnv(prev)
    return result
  } catch (err) {
    restoreEnv(prev)
    throw err
  }
}

export function getCachedClient(credentials, region, bucketName) {
  return getOssClient(credentials, region, bucketName)
}

export function clearClientCache() {
  for (const client of clients.values()) {
    try {
      if (client._dvCleanup) client._dvCleanup()
      else if (client.httpsAgent) client.httpsAgent.destroy()
    } catch {}
  }
  clients.clear()
}

export function resolveEndpoint(region) {
  return `${region || 'oss-cn-hangzhou'}.aliyuncs.com`
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
