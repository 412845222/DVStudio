import { getOssClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import { getFileNameFromKey } from '../../base/utils.mjs'
import { createCloudFileItem, createCloudListResult, createCloudFolderResult } from '../../types.mjs'
import logger from '../../../../core/logger.mjs'

function encodeRfc5987Value(str) {
  return encodeURIComponent(str).replace(/['()]/g, escape).replace(/\*/g, '%2A')
}

function buildContentDisposition(fileName) {
  if (!fileName) return 'inline'
  const encodedName = encodeRfc5987Value(fileName)
  const simpleName = fileName.replace(/[^\x20-\x7E]/g, '_')
  return `inline; filename="${simpleName}"; filename*=UTF-8''${encodedName}`
}

function guessContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase()
  const map = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    html: 'text/html',
  }
  return map[ext] || 'application/octet-stream'
}

function buildSignedPreviewUrl(client, key, fileName, expires = 86400 * 7) {
  return client.signatureUrl(key, {
    expires,
    method: 'GET',
    response: {
      'content-disposition': buildContentDisposition(fileName),
    },
  })
}

function ossObjectToFileItem(obj, bucketName, endpoint, client) {
  const key = obj.name || ''
  const lastModified = obj.lastModified ? new Date(obj.lastModified).getTime() : 0
  const size = Number(obj.size) || 0
  const etag = obj.etag ? String(obj.etag).replace(/"/g, '') : ''
  const contentType = obj.type || guessContentType(key)
  const fileName = getFileNameFromKey(key)

  return createCloudFileItem({
    key,
    name: fileName,
    isFolder: false,
    size,
    contentType,
    lastModified,
    etag,
    publicUrl: buildSignedPreviewUrl(client, key, fileName),
  })
}

export async function listFiles(config, prefix = '', options = {}) {
  const { credentials, region, bucketName } = config
  if (!bucketName) {
    return createCloudListResult({
      items: [],
      prefixes: [],
      isTruncated: false,
    })
  }
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getOssClient(credentials, region, bucketName, endpoint)
  const delimiter = options.delimiter || '/'
  const continuationToken = options.continuationToken || ''
  const maxKeys = options.maxKeys || 1000

  try {
    const query = {
      prefix: prefix || '',
      delimiter,
      'max-keys': maxKeys,
    }
    if (continuationToken) {
      query['continuation-token'] = continuationToken
    }

    const result = await withNoProxyEnv(() => client.listV2(query))

    const objects = result.objects || []
    const prefixes = result.prefixes || []

    const items = objects
      .filter(obj => obj.name && obj.name !== prefix)
      .map(obj => ossObjectToFileItem(obj, bucketName, endpoint, client))

    const folders = prefixes
      .filter(Boolean)
      .map(prefixKey => createCloudFileItem({
        key: prefixKey,
        name: getFileNameFromKey(prefixKey.replace(/\/$/, '')),
        isFolder: true,
      }))

    return createCloudListResult({
      ok: true,
      items: [...folders, ...items],
      prefixes,
      nextMarker: result.nextContinuationToken || result.nextMarker,
      isTruncated: Boolean(result.isTruncated),
    })
  } catch (err) {
    logger.error('[cloudfs:oss] listFiles failed:', err.message)
    return createCloudListResult({
      ok: false,
      error: err.message,
      items: [],
      prefixes: [],
      isTruncated: false,
    })
  }
}

export async function getFileMetadata(config, key) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getOssClient(credentials, region, bucketName, endpoint)
  const fileName = getFileNameFromKey(key)

  try {
    const result = await withNoProxyEnv(() => client.head(key))
    const headers = result.res?.headers || {}
    const contentType = headers['content-type'] || guessContentType(key)

    return createCloudFileItem({
      key,
      name: fileName,
      isFolder: false,
      size: Number(headers['content-length'] || 0),
      contentType,
      lastModified: headers['last-modified'] ? new Date(headers['last-modified']).getTime() : 0,
      etag: (headers['etag'] || '').replace(/"/g, ''),
      publicUrl: buildSignedPreviewUrl(client, key, fileName),
    })
  } catch (err) {
    logger.error('[cloudfs:oss] getFileMetadata failed:', err.message)
    return null
  }
}

export async function createFolder(config, folderPath) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getOssClient(credentials, region, bucketName, endpoint)

  try {
    let key = folderPath || ''
    if (!key) {
      return createCloudFolderResult({ ok: false, error: 'Folder path is required' })
    }
    if (!key.endsWith('/')) {
      key = key + '/'
    }

    await withNoProxyEnv(() => client.put(key, Buffer.from(''), {
      mime: 'application/x-directory',
    }))

    logger.info(`[cloudfs:oss] createFolder success: ${key}`)
    return createCloudFolderResult({
      ok: true,
      key,
    })
  } catch (err) {
    logger.error('[cloudfs:oss] createFolder failed:', err.message)
    return createCloudFolderResult({
      ok: false,
      error: err.message,
    })
  }
}
