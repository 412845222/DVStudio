import { getTosClient, buildPublicUrl, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import { generateKey } from '../../base/utils.mjs'
import { createCloudUploadResult } from '../../types.mjs'
import logger from '../../../../core/logger.mjs'

function extractData(result) {
  return result?.data || result || {}
}

export async function uploadFile(config, data, options = {}) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getTosClient(credentials, region, bucketName, endpoint)

  const contentType = options.contentType || 'application/octet-stream'
  const key = options.key || generateKey(options.prefix || 'uploads', contentType, options.extension)

  try {
    logger.debug(`[cloudfs:tos] Uploading to key: ${key}, type: ${contentType}`)

    const result = await withNoProxyEnv(() => client.putObject({
      bucket: bucketName,
      key,
      body: data,
      contentType,
      acl: options.publicRead !== false ? 'public-read' : undefined,
    }))

    const publicUrl = options.publicRead !== false
      ? buildPublicUrl(bucketName, endpoint, key)
      : null

    const headers = result.headers || {}
    const etag = (headers['etag'] || extractData(result).ETag || '').replace(/"/g, '')

    logger.debug(`[cloudfs:tos] Upload success: ${key}, etag: ${etag}`)

    return createCloudUploadResult({
      ok: true,
      key,
      publicUrl,
      etag,
    })
  } catch (err) {
    logger.error('[cloudfs:tos] uploadFile failed:', err.message)
    return createCloudUploadResult({
      ok: false,
      error: err.message,
    })
  }
}

export async function getPublicUrl(config, key, expires = 86400) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getTosClient(credentials, region, bucketName, endpoint)

  try {
    if (config.publicRead !== false) {
      return buildPublicUrl(bucketName, endpoint, key)
    }

    const signedUrl = client.getPreSignedUrl({
      method: 'GET',
      bucket: bucketName,
      key,
      expires,
    })
    return signedUrl
  } catch (err) {
    logger.error('[cloudfs:tos] getPublicUrl failed:', err.message)
    return buildPublicUrl(bucketName, endpoint, key)
  }
}
