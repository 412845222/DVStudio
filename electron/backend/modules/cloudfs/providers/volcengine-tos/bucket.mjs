import { getTosClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import logger from '../../../../core/logger.mjs'

export async function listBuckets(credentials, region, endpoint) {
  const finalEndpoint = endpoint || credentials.endpoint || resolveEndpoint(region || 'cn-beijing')
  const client = getTosClient(credentials, region, null, finalEndpoint)
  try {
    const result = await withNoProxyEnv(() => client.listBuckets())
    const data = result.data || result
    const buckets = (data.Buckets || []).map(b => ({
      name: b.Name,
      location: b.Location,
      creationDate: b.CreationDate,
      extranetEndpoint: b.ExtranetEndpoint,
    }))
    logger.info(`[cloudfs:tos] listBuckets success, got ${buckets.length} buckets`)
    return { ok: true, buckets }
  } catch (err) {
    logger.error('[cloudfs:tos] listBuckets failed:', err.message)
    return { ok: false, error: err.message, buckets: [] }
  }
}

export async function bucketExists(client, bucketName) {
  try {
    await client.headBucket(bucketName)
    return true
  } catch {
    return false
  }
}

export async function createBucket(client, bucketName, region) {
  try {
    await client.createBucket({
      bucket: bucketName,
      region: region || 'cn-beijing',
    })
    return { ok: true }
  } catch (err) {
    if (err?.statusCode === 409 || err?.message?.includes('BucketAlreadyExists') || err?.message?.includes('BucketAlreadyOwnedByYou')) {
      return { ok: true, alreadyExists: true }
    }
    logger.error('[cloudfs:tos] createBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function setBucketPublicRead(client, bucketName) {
  try {
    logger.info(`[cloudfs:tos] Setting bucket ${bucketName} ACL to public-read`)
    await withNoProxyEnv(() => client.putBucketAcl({
      bucket: bucketName,
      acl: 'public-read',
    }))
    logger.info(`[cloudfs:tos] Bucket ${bucketName} ACL set to public-read successfully`)
    return { ok: true }
  } catch (err) {
    logger.error('[cloudfs:tos] setBucketPublicRead failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function setObjectPublicRead(client, bucketName, key) {
  try {
    await withNoProxyEnv(() => client.putObjectAcl({
      bucket: bucketName,
      key,
      acl: 'public-read',
    }))
    return { ok: true }
  } catch (err) {
    logger.warn(`[cloudfs:tos] setObjectPublicRead failed for ${key}:`, err.message)
    return { ok: false, error: err.message }
  }
}

export async function getBucketAcl(client, bucketName) {
  try {
    const result = await withNoProxyEnv(() => client.getBucketAcl({
      bucket: bucketName,
    }))
    const data = result.data || result
    const grants = data.Grants || data.grants || []
    const acl = grants.some((g) => {
      const uri = g.Grantee?.URI || g.grantee?.uri || ''
      const permission = (g.Permission || g.permission || '').toUpperCase()
      return uri.includes('AllUsers') && permission === 'READ'
    }) ? 'public-read' : 'private'
    return { ok: true, acl }
  } catch (err) {
    logger.error('[cloudfs:tos] getBucketAcl failed:', err.message)
    return { ok: false, error: err.message, acl: 'unknown' }
  }
}

export async function ensureBucketPublicRead(client, bucketName) {
  try {
    const aclResult = await getBucketAcl(client, bucketName)
    if (!aclResult.ok) {
      return { ok: false, error: aclResult.error }
    }
    if (aclResult.acl === 'public-read') {
      return { ok: true, alreadyPublic: true, acl: 'public-read' }
    }
    const setResult = await setBucketPublicRead(client, bucketName)
    if (!setResult.ok) {
      return { ok: false, error: setResult.error }
    }
    return { ok: true, fixed: true, acl: 'public-read' }
  } catch (err) {
    logger.error('[cloudfs:tos] ensureBucketPublicRead failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function setupLifecycle(client, bucketName, days = 1) {
  try {
    await client.putBucketLifecycle({
      bucket: bucketName,
      rules: [
        {
          id: 'auto-cleanup',
          prefix: '',
          status: 'Enabled',
          expiration: { days },
        },
      ],
    })
    return { ok: true }
  } catch (err) {
    logger.warn('[cloudfs:tos] setupLifecycle failed (non-critical):', err.message)
    return { ok: true, warning: err.message }
  }
}

export async function setupBucket(credentials, region, bucketName, options = {}) {
  const endpoint = options.endpoint || credentials.endpoint || resolveEndpoint(region || 'cn-beijing')
  const client = getTosClient(credentials, region, bucketName, endpoint)

  try {
    const exists = await bucketExists(client, bucketName)
    if (!exists) {
      const createResult = await createBucket(client, bucketName, region)
      if (!createResult.ok) {
        return { ok: false, error: createResult.error }
      }
    }

    if (options.publicRead !== false) {
      const aclResult = await setBucketPublicRead(client, bucketName)
      if (!aclResult.ok) {
        logger.warn('[cloudfs:tos] Failed to set public-read ACL:', aclResult.error)
      }
    }

    if (options.lifecycleDays) {
      await setupLifecycle(client, bucketName, options.lifecycleDays)
    }

    return {
      ok: true,
      bucketName,
      endpoint,
      publicUrlBase: `https://${bucketName}.${endpoint}`,
    }
  } catch (err) {
    logger.error('[cloudfs:tos] setupBucket failed:', err.message)
    return { ok: false, error: err.message }
  }
}
