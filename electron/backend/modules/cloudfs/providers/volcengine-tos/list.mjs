import { getTosClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
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

function extractData(result) {
  return result?.data || result || {}
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

function buildSignedPreviewUrl(client, bucketName, key, fileName, expires = 86400 * 7) {
  return client.getPreSignedUrl({
    method: 'GET',
    bucket: bucketName,
    key,
    expires,
    response: {
      'content-disposition': buildContentDisposition(fileName),
    },
  })
}

function tosObjectToFileItem(obj, bucketName, endpoint, client) {
  const key = obj.Key || ''
  const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0
  const size = Number(obj.Size) || 0
  const etag = obj.ETag ? String(obj.ETag).replace(/"/g, '') : ''
  const contentType = obj.ContentType || guessContentType(key)
  const fileName = getFileNameFromKey(key)

  return createCloudFileItem({
    key,
    name: fileName,
    isFolder: false,
    size,
    contentType,
    lastModified,
    etag,
    publicUrl: buildSignedPreviewUrl(client, bucketName, key, fileName),
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
  const client = getTosClient(credentials, region, bucketName, endpoint)
  const delimiter = options.delimiter || '/'
  const continuationToken = options.continuationToken || ''
  const maxKeys = options.maxKeys || 1000

  try {
    const result = await withNoProxyEnv(() => client.listObjectsType2({
      bucket: bucketName,
      prefix: prefix || '',
      delimiter,
      continuationToken,
      maxKeys,
      listOnlyOnce: true,
    }))

    const data = extractData(result)

    const items = (data.Contents || [])
      .filter(obj => obj.Key && obj.Key !== prefix)
      .map(obj => tosObjectToFileItem(obj, bucketName, endpoint, client))

    const prefixes = (data.CommonPrefixes || [])
      .map(p => p.Prefix)
      .filter(Boolean)

    const folders = prefixes.map(prefixKey => createCloudFileItem({
      key: prefixKey,
      name: getFileNameFromKey(prefixKey.replace(/\/$/, '')),
      isFolder: true,
    }))

    return createCloudListResult({
      ok: true,
      items: [...folders, ...items],
      prefixes,
      nextMarker: data.NextContinuationToken || data.NextMarker,
      isTruncated: Boolean(data.IsTruncated),
    })
  } catch (err) {
    logger.error('[cloudfs:tos] listFiles failed:', err.message)
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
  const client = getTosClient(credentials, region, bucketName, endpoint)
  const fileName = getFileNameFromKey(key)

  try {
    const result = await client.headObject({
      bucket: bucketName,
      key,
    })
    const data = extractData(result)
    const headers = result.headers || data
    const contentType = headers['content-type'] || data.ContentType || guessContentType(key)

    return createCloudFileItem({
      key,
      name: fileName,
      isFolder: false,
      size: Number(headers['content-length'] || data.ContentLength) || 0,
      contentType,
      lastModified: headers['last-modified'] ? new Date(headers['last-modified']).getTime() : 0,
      etag: (headers['etag'] || data.ETag || '').replace(/"/g, ''),
      publicUrl: buildSignedPreviewUrl(client, bucketName, key, fileName),
    })
  } catch (err) {
    logger.error('[cloudfs:tos] getFileMetadata failed:', err.message)
    return null
  }
}

export async function createFolder(config, folderPath) {
  const { credentials, region, bucketName } = config
  const endpoint = config.endpoint || resolveEndpoint(region)
  const client = getTosClient(credentials, region, bucketName, endpoint)

  try {
    let key = folderPath || ''
    if (!key) {
      return createCloudFolderResult({ ok: false, error: 'Folder path is required' })
    }
    if (!key.endsWith('/')) {
      key = key + '/'
    }

    await withNoProxyEnv(() => client.putObject({
      bucket: bucketName,
      key,
      body: '',
      contentType: 'application/x-directory',
      acl: 'public-read',
    }))

    logger.info(`[cloudfs:tos] createFolder success: ${key}`)
    return createCloudFolderResult({
      ok: true,
      key,
    })
  } catch (err) {
    logger.error('[cloudfs:tos] createFolder failed:', err.message)
    return createCloudFolderResult({
      ok: false,
      error: err.message,
    })
  }
}
