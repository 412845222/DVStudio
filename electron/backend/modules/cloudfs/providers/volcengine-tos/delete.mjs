import { getTosClient } from './client.mjs'
import { resolveEndpoint } from './client.mjs'
import logger from '../../../../core/logger.mjs'

export async function deleteFile(config, key) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getTosClient(credentials, region, bucketName, endpoint)

  try {
    await client.deleteObject({
      bucket: bucketName,
      key,
    })
    logger.debug(`[cloudfs:tos] Deleted: ${key}`)
    return { ok: true }
  } catch (err) {
    logger.error('[cloudfs:tos] deleteFile failed:', err.message)
    return { ok: false, error: err.message }
  }
}
