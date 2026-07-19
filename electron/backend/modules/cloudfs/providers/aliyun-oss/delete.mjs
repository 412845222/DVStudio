import { getOssClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import logger from '../../../../core/logger.mjs'

export async function deleteFile(config, key) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getOssClient(credentials, region, bucketName, endpoint)

  try {
    await withNoProxyEnv(() => client.delete(key))
    logger.debug(`[cloudfs:oss] Deleted: ${key}`)
    return { ok: true }
  } catch (err) {
    logger.error('[cloudfs:oss] deleteFile failed:', err.message)
    return { ok: false, error: err.message }
  }
}
