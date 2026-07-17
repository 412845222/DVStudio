import crypto from 'node:crypto'
import { registerProvider, getProvider, listProviders } from './registry.mjs'
import volcengineTosProvider from './providers/volcengine-tos/index.mjs'
import customHttpProvider from './providers/custom-http/index.mjs'
import logger from '../../core/logger.mjs'

let initialized = false
let reposModule = null

async function getReposModule() {
  if (!reposModule) {
    reposModule = await import('../../../localdb/index.mjs')
  }
  return reposModule
}

function ensureInitialized() {
  if (initialized) return
  try {
    registerProvider(volcengineTosProvider)
    registerProvider(customHttpProvider)
    initialized = true
    logger.info(`[cloudfs] Registered providers: ${listProviders().map(p => p.id).join(', ')}`)
  } catch (err) {
    logger.error('[cloudfs] Failed to initialize providers:', err.message)
    throw err
  }
}

async function getRepos() {
  const mod = await getReposModule()
  const result = mod.getReposSafe()
  if (!result.ok) {
    throw new Error(`[cloudfs] LocalDB not available: ${result.error}`)
  }
  return result.repos
}

function fingerprintConfig(config) {
  const configToHash = { ...(config || {}) }
  delete configToHash.bucketName
  const text = JSON.stringify(configToHash)
  return crypto.createHash('sha256').update(text).digest('hex')
}

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') return {}
  const safe = { ...config }
  if (safe.credentials) {
    safe.credentials = { ...safe.credentials }
    delete safe.credentials.accessKeySecret
    delete safe.credentials.secretAccessKey
    delete safe.credentials.secretKey
  }
  return safe
}

function normalizeCredentials(config) {
  if (!config || typeof config !== 'object') return config
  if (!config.credentials || typeof config.credentials !== 'object') return config
  const creds = normalizeCredentialsObject(config.credentials)
  return { ...config, credentials: creds }
}

function normalizeCredentialsObject(creds) {
  if (!creds || typeof creds !== 'object') return creds
  const normalized = { ...creds }
  if (normalized.secretAccessKey && !normalized.accessKeySecret) {
    normalized.accessKeySecret = normalized.secretAccessKey
    delete normalized.secretAccessKey
  }
  if (normalized.secretKey && !normalized.accessKeySecret) {
    normalized.accessKeySecret = normalized.secretKey
    delete normalized.secretKey
  }
  return normalized
}

export function listAvailableProviders() {
  ensureInitialized()
  return listProviders()
}

export async function getActiveConfig(ctx) {
  ensureInitialized()
  try {
    const repos = await getRepos()
    const result = repos.cloudStorageConfig.getActive()
    if (!result.configured) {
      return { configured: false }
    }
    const provider = getProvider(result.providerId)
    if (!provider) {
      return { configured: false, error: `Provider not found: ${result.providerId}` }
    }
    return {
      configured: true,
      providerId: result.providerId,
      providerMeta: provider.getMeta(),
      config: sanitizeConfig(result.config),
      lastTestedAt: result.lastTestedAt,
      lastTestOk: result.lastTestOk,
    }
  } catch (err) {
    logger.error('[cloudfs] getActiveConfig failed:', err.message)
    return { configured: false, error: err.message }
  }
}

async function getActiveConfigFull() {
  ensureInitialized()
  const repos = await getRepos()
  const result = repos.cloudStorageConfig.getActiveBucketWithConfig()
  if (!result.ok) {
    return null
  }
  const provider = getProvider(result.providerId)
  if (!provider) {
    return null
  }
  return {
    providerId: result.providerId,
    provider,
    config: normalizeCredentials(result.config),
    bucket: result.bucket,
  }
}

export async function saveConfig(ctx, providerId, config, lastTestOk = 0) {
  ensureInitialized()
  try {
    const provider = getProvider(providerId)
    if (!provider) {
      return { ok: false, error: `Provider not found: ${providerId}` }
    }
    const normalizedConfig = normalizeCredentials(config)
    const repos = await getRepos()
    const result = repos.cloudStorageConfig.setActive(providerId, normalizedConfig, lastTestOk)
    if (!result.ok) {
      return result
    }
    return { ok: true }
  } catch (err) {
    logger.error('[cloudfs] saveConfig failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function clearConfig(ctx) {
  ensureInitialized()
  try {
    const repos = await getRepos()
    return repos.cloudStorageConfig.clear()
  } catch (err) {
    logger.error('[cloudfs] clearConfig failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function testConfig(ctx, providerId, config) {
  ensureInitialized()
  try {
    const active = await getActiveConfigFull()
    let pid = providerId
    let cfg = config

    if (!pid && active) {
      pid = active.providerId
    }
    if (!cfg && active) {
      cfg = active.config
    }

    const provider = getProvider(pid)
    if (!provider) {
      return { ok: false, error: `Provider not found: ${pid}` }
    }

    if (cfg && cfg.credentials) {
      cfg = { ...cfg, credentials: normalizeCredentialsObject(cfg.credentials) }
    }

    const hasCredentials = cfg?.credentials?.accessKeySecret || cfg?.apiKey
    if (!hasCredentials && active) {
      cfg = active.config
    }

    const result = await provider.testConnection(cfg)
    if (result.ok) {
      const repos = await getRepos()
      repos.cloudStorageConfig.updateTestStatus(true)
    }
    return result
  } catch (err) {
    logger.error('[cloudfs] testConfig failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function validateProviderCredentials(ctx, providerId, credentials, region, endpoint) {
  ensureInitialized()
  try {
    const provider = getProvider(providerId)
    if (!provider) {
      return { ok: false, error: `Provider not found: ${providerId}` }
    }
    const normalizedCreds = normalizeCredentialsObject(credentials)
    return await provider.validateCredentials(normalizedCreds, region, endpoint)
  } catch (err) {
    logger.error('[cloudfs] validateProviderCredentials failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function setupProviderBucket(ctx, providerId, credentials, region, bucketName, options) {
  ensureInitialized()
  try {
    const provider = getProvider(providerId)
    if (!provider) {
      return { ok: false, error: `Provider not found: ${providerId}` }
    }
    const normalizedCreds = normalizeCredentialsObject(credentials)
    return await provider.setupBucket(normalizedCreds, region, bucketName, options)
  } catch (err) {
    logger.error('[cloudfs] setupProviderBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function listBuckets(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    let providerId = p.providerId
    let credentials = p.credentials
    let region = p.region
    let endpoint = p.endpoint

    if (!providerId || !credentials) {
      const active = await getActiveConfigFull()
      if (!active) {
        logger.warn('[cloudfs] listBuckets: no active config found')
        return { ok: false, error: 'No active cloud storage config', buckets: [] }
      }
      providerId = active.providerId
      credentials = active.config.credentials
      region = active.config.region
      endpoint = active.config.endpoint
    } else {
      credentials = normalizeCredentialsObject(credentials)
    }

    const provider = getProvider(providerId)
    if (!provider) {
      logger.error(`[cloudfs] listBuckets: provider not found: ${providerId}`)
      return { ok: false, error: `Provider not found: ${providerId}`, buckets: [] }
    }

    logger.info(`[cloudfs] listBuckets: provider=${providerId}, region=${region}, endpoint=${endpoint}, hasCredentials=${!!credentials?.accessKeySecret}`)
    const result = await provider.listBuckets(credentials, region, endpoint)
    if (result.ok) {
      logger.info(`[cloudfs] listBuckets: got ${result.buckets?.length || 0} buckets`)
    } else {
      logger.error(`[cloudfs] listBuckets: provider returned error: ${result.error}`)
    }
    return result
  } catch (err) {
    logger.error('[cloudfs] listBuckets failed:', err.message)
    return { ok: false, error: err.message, buckets: [] }
  }
}

export async function createBucket(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketName = p.bucketName
    const options = p.options || {}

    if (!bucketName) {
      return { ok: false, error: 'Bucket name is required' }
    }

    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }

    const result = await active.provider.createBucket(
      active.config.credentials,
      active.config.region,
      bucketName,
      { publicRead: true, lifecycleDays: 7, ...options }
    )

    if (result.ok) {
      const repos = await getRepos()
      const addResult = repos.cloudStorageConfig.addBucket(
        active.config.id || active.bucket?.configId,
        bucketName,
        active.config.region,
        active.config.endpoint,
        'public-read'
      )
      if (addResult.ok) {
        repos.cloudStorageConfig.setActiveBucket(addResult.bucket.id)
      }
    }

    return result
  } catch (err) {
    logger.error('[cloudfs] createBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function createFolder(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const folderPath = p.folderPath || ''

    if (!folderPath) {
      return { ok: false, error: 'Folder name is required' }
    }

    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }
    if (!active.config.bucketName) {
      return { ok: false, error: 'No bucket selected' }
    }

    let fullPath = folderPath
    if (!fullPath.endsWith('/')) {
      fullPath = fullPath + '/'
    }

    return await active.provider.createFolder(active.config, fullPath)
  } catch (err) {
    logger.error('[cloudfs] createFolder failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function updateActiveBucket(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketId = p.bucketId
    const bucketName = p.bucketName

    if (bucketId) {
      const repos = await getRepos()
      const result = repos.cloudStorageConfig.setActiveBucket(bucketId)
      if (!result.ok) return result
      try {
        const active = await getActiveConfigFull()
        if (active?.provider?.ensureBucketPublicRead) {
          const aclResult = await active.provider.ensureBucketPublicRead(active.config)
          if (aclResult.ok) {
            repos.cloudStorageConfig.updateBucketAcl(bucketId, 'public-read')
            logger.info(`[cloudfs] Bucket ${bucketName} ACL: ${aclResult.alreadyPublic ? 'already public-read' : 'set to public-read'}`)
          } else {
            logger.warn(`[cloudfs] Failed to ensure public-read for bucket ${bucketId}: ${aclResult.error}`)
          }
        }
      } catch (aclErr) {
        logger.warn(`[cloudfs] ACL check failed for bucket ${bucketId}: ${aclErr.message}`)
      }
      return { ok: true, bucket: result.bucket }
    }

    if (!bucketName) {
      return { ok: false, error: 'Bucket name or bucketId is required' }
    }

    const repos = await getRepos()
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }

    const configId = active.config.id || active.bucket?.configId
    const addResult = repos.cloudStorageConfig.addBucket(configId, bucketName, active.config.region, active.config.endpoint, 'unknown')
    if (addResult.ok) {
      repos.cloudStorageConfig.setActiveBucket(addResult.bucket.id)
    }

    try {
      if (active.provider?.ensureBucketPublicRead) {
        const aclResult = await active.provider.ensureBucketPublicRead({ ...active.config, bucketName })
        if (aclResult.ok) {
          repos.cloudStorageConfig.updateBucketAcl(addResult.bucket?.id, 'public-read')
          logger.info(`[cloudfs] Bucket ${bucketName} ACL: ${aclResult.alreadyPublic ? 'already public-read' : 'set to public-read'}`)
        }
      }
    } catch (aclErr) {
      logger.warn(`[cloudfs] ACL check failed for ${bucketName}: ${aclErr.message}`)
    }

    return { ok: true, bucketName }
  } catch (err) {
    logger.error('[cloudfs] updateActiveBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function listFiles(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const prefix = p.prefix || ''
    const options = p.options || {}
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config', items: [], prefixes: [], isTruncated: false }
    }
    if (!active.config.bucketName) {
      return { ok: false, error: 'No bucket selected', items: [], prefixes: [], isTruncated: false }
    }
    return await active.provider.listFiles(active.config, prefix, options)
  } catch (err) {
    logger.error('[cloudfs] listFiles failed:', err.message)
    return { ok: false, error: err.message, items: [], prefixes: [], isTruncated: false }
  }
}

export async function uploadFile(ctx, data, options = {}) {
  ensureInitialized()
  try {
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }
    let buffer = data
    if (data instanceof Uint8Array) {
      buffer = Buffer.from(data)
    }
    const result = await active.provider.uploadFile(active.config, buffer, options)
    return result
  } catch (err) {
    logger.error('[cloudfs] uploadFile failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function deleteFile(ctx, key) {
  ensureInitialized()
  try {
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }
    return await active.provider.deleteFile(active.config, key)
  } catch (err) {
    logger.error('[cloudfs] deleteFile failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function getPublicUrl(ctx, key, expires) {
  ensureInitialized()
  try {
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }
    const url = await active.provider.getPublicUrl(active.config, key, expires)
    return { ok: true, url }
  } catch (err) {
    logger.error('[cloudfs] getPublicUrl failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function uploadFileToPublicUrl(ctx, { data, name, mimeType, prefix }) {
  ensureInitialized()
  try {
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'No active cloud storage config' }
    }
    let buffer = data
    if (data instanceof Uint8Array) {
      buffer = Buffer.from(data)
    }
    const ext = name ? '.' + name.split('.').pop() : undefined
    const keyPrefix = prefix || 'uploads'
    const result = await active.provider.uploadFile(active.config, buffer, {
      contentType: mimeType,
      extension: ext,
      fileName: name,
      prefix: keyPrefix,
      publicRead: true,
    })
    if (!result.ok) {
      return result
    }
    return {
      ok: true,
      publicUrl: result.publicUrl,
      key: result.key,
    }
  } catch (err) {
    logger.error('[cloudfs] uploadFileToPublicUrl failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function listConfiguredBuckets(ctx) {
  ensureInitialized()
  try {
    const repos = await getRepos()
    return repos.cloudStorageConfig.listConfiguredBuckets()
  } catch (err) {
    logger.error('[cloudfs] listConfiguredBuckets failed:', err.message)
    return { ok: false, error: err.message, buckets: [] }
  }
}

export async function addBucketFromCloud(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketName = p.bucketName
    const credentials = p.credentials
    const region = p.region
    const endpoint = p.endpoint || ''
    const providerId = p.providerId || 'volcengine-tos'

    if (!bucketName) {
      return { ok: false, error: 'bucketName is required' }
    }

    const repos = await getRepos()
    let targetConfigId = null
    let targetCreds = null
    let targetRegion = region
    let finalEndpoint = endpoint

    if (credentials) {
      const normalizedCreds = normalizeCredentialsObject(credentials)
      const configToMatch = { credentials: normalizedCreds, region: region || '' }
      const fp = fingerprintConfig(configToMatch)
      logger.info(`[cloudfs] addBucketFromCloud: looking for config with fingerprint ${fp.slice(0, 16)}...`)

      const existingConfig = repos.cloudStorageConfig.findConfigByFingerprint(fp)
      if (existingConfig) {
        logger.info(`[cloudfs] addBucketFromCloud: found existing config id=${existingConfig.id}, reusing`)
        targetConfigId = existingConfig.id
        const fullConfig = repos.cloudStorageConfig.getConfigById(targetConfigId)
        if (fullConfig) {
          targetCreds = fullConfig.config.credentials
          targetRegion = fullConfig.config.region || region
          finalEndpoint = fullConfig.config.endpoint || endpoint
        }
      } else {
        logger.info(`[cloudfs] addBucketFromCloud: no existing config found, creating new one`)
        const configToSave = { credentials: normalizedCreds, region: region || '', endpoint: finalEndpoint }
        const setResult = repos.cloudStorageConfig.setActive(providerId, configToSave, 1)
        if (!setResult.ok) {
          return { ok: false, error: setResult.error || 'Failed to save config' }
        }
        targetConfigId = setResult.config.id
        targetCreds = normalizedCreds
      }
    } else {
      const active = repos.cloudStorageConfig.getActive()
      if (!active.configured) {
        return { ok: false, error: 'No active config and no credentials provided' }
      }
      targetConfigId = active.id
      targetCreds = active.config.credentials
      targetRegion = active.config.region
      finalEndpoint = active.config.endpoint || endpoint
    }

    if (!targetConfigId || !targetCreds) {
      return { ok: false, error: 'Failed to determine config' }
    }

    if (!finalEndpoint) {
      finalEndpoint = `tos-${targetRegion || 'cn-beijing'}.volces.com`
    }

    const existingBucket = repos.cloudStorageConfig.getBucketByName(targetConfigId, bucketName)
    if (existingBucket) {
      logger.info(`[cloudfs] addBucketFromCloud: bucket ${bucketName} already exists in config ${targetConfigId}, switching to it`)
      repos.cloudStorageConfig.setActiveConfigById(targetConfigId)
      repos.cloudStorageConfig.setActiveBucket(existingBucket.id)
      const bucketRow = repos.cloudStorageConfig.listConfiguredBuckets().buckets.find(b => b.id === existingBucket.id)
      return { ok: true, bucket: bucketRow, alreadyExists: true }
    }

    repos.cloudStorageConfig.setActiveConfigById(targetConfigId)
    const addResult = repos.cloudStorageConfig.addBucket(targetConfigId, bucketName, targetRegion || '', finalEndpoint, 'unknown')
    if (!addResult.ok) {
      return { ok: false, error: addResult.error || 'Failed to add bucket' }
    }

    repos.cloudStorageConfig.setActiveBucket(addResult.bucket.id)

    try {
      const active = await getActiveConfigFull()
      if (active?.provider?.ensureBucketPublicRead) {
        const aclResult = await active.provider.ensureBucketPublicRead({ ...active.config, bucketName, endpoint: finalEndpoint })
        if (aclResult.ok) {
          repos.cloudStorageConfig.updateBucketAcl(addResult.bucket.id, 'public-read')
          logger.info(`[cloudfs] addBucketFromCloud: bucket ${bucketName} ACL set to public-read`)
        } else {
          logger.warn(`[cloudfs] addBucketFromCloud: failed to set public-read for ${bucketName}: ${aclResult.error}`)
        }
      }
    } catch (aclErr) {
      logger.warn(`[cloudfs] addBucketFromCloud: ACL check failed for ${bucketName}: ${aclErr.message}`)
    }

    const finalBuckets = repos.cloudStorageConfig.listConfiguredBuckets()
    const finalBucket = finalBuckets.buckets.find(b => b.id === addResult.bucket.id)
    return { ok: true, bucket: finalBucket || addResult.bucket }
  } catch (err) {
    logger.error('[cloudfs] addBucketFromCloud failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function removeConfiguredBucket(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketId = p.bucketId
    if (!bucketId) {
      return { ok: false, error: 'bucketId is required' }
    }
    const repos = await getRepos()
    return repos.cloudStorageConfig.removeBucket(bucketId)
  } catch (err) {
    logger.error('[cloudfs] removeConfiguredBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function switchActiveBucket(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketId = p.bucketId
    if (!bucketId) {
      return { ok: false, error: 'bucketId is required' }
    }
    const repos = await getRepos()
    const result = repos.cloudStorageConfig.setActiveBucket(bucketId)
    if (!result.ok) return result
    try {
      const active = await getActiveConfigFull()
      if (active?.provider?.getBucketAcl) {
        const aclResult = await active.provider.getBucketAcl(active.config)
        if (aclResult.ok) {
          repos.cloudStorageConfig.updateBucketAcl(bucketId, aclResult.acl)
        }
      }
    } catch (aclErr) {
      logger.warn(`[cloudfs] ACL check failed for bucket ${bucketId}: ${aclErr.message}`)
    }
    return result
  } catch (err) {
    logger.error('[cloudfs] switchActiveBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function fixBucketAcl(ctx, payload = {}) {
  ensureInitialized()
  try {
    const p = payload || {}
    const bucketId = p.bucketId
    if (!bucketId) {
      return { ok: false, error: 'bucketId is required' }
    }
    const repos = await getRepos()
    const switchResult = repos.cloudStorageConfig.setActiveBucket(bucketId)
    if (!switchResult.ok) return switchResult
    const active = await getActiveConfigFull()
    if (!active) {
      return { ok: false, error: 'Failed to get active config' }
    }
    if (active.provider?.ensureBucketPublicRead) {
      const aclResult = await active.provider.ensureBucketPublicRead(active.config)
      if (aclResult.ok) {
        repos.cloudStorageConfig.updateBucketAcl(bucketId, 'public-read')
        return { ok: true, acl: 'public-read' }
      }
      return { ok: false, error: aclResult.error }
    }
    return { ok: false, error: 'Provider does not support ACL fix' }
  } catch (err) {
    logger.error('[cloudfs] fixBucketAcl failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export function getProviderById(providerId) {
  ensureInitialized()
  return getProvider(providerId)
}
