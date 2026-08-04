import { getTosClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import { buildObjectKey } from '../../base/utils.mjs'
import { createCloudUploadResult } from '../../types.mjs'
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

function guessContentType(fileName) {
	const ext = fileName?.split('.').pop()?.toLowerCase()
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
		html: 'text/html'
	}
	return map[ext] || 'application/octet-stream'
}

function buildSignedPreviewUrl(client, bucketName, key, fileName, expires = 86400 * 7) {
	return client.getPreSignedUrl({
		method: 'GET',
		bucket: bucketName,
		key,
		expires
	})
}

function isRetryableError(err) {
	const msg = String(err?.message || err || '')
	return (
		msg.includes('socket hang up') ||
		msg.includes('ECONNRESET') ||
		msg.includes('ETIMEDOUT') ||
		msg.includes('ECONNREFUSED') ||
		msg.includes('EPIPE') ||
		msg.includes('ENOTFOUND') ||
		msg.includes('network timeout') ||
		msg.includes('socket disconnected') ||
		err?.statusCode === 429 ||
		(err?.statusCode >= 500 && err?.statusCode < 600)
	)
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function uploadFile(config, data, options = {}) {
	const { credentials, region, bucketName } = config
	const endpoint = config.endpoint || resolveEndpoint(region)
	const client = getTosClient(credentials, region, bucketName, endpoint)

	const contentType = options.contentType || guessContentType(options.fileName)
	const key = options.key || buildObjectKey(options.prefix || 'uploads', options.fileName)
	const fileName = options.fileName || key.split('/').pop() || key

	const putOptions = {
		bucket: bucketName,
		key,
		body: data,
		contentType,
		contentDisposition: buildContentDisposition(fileName)
	}

	const maxRetries = 2
	let lastErr = null

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger.warn(`[cloudfs:tos] Upload retry ${attempt}/${maxRetries} for key: ${key}`)
				await sleep(300 * attempt)
			} else {
				logger.debug(
					`[cloudfs:tos] Uploading to key: ${key}, type: ${contentType}, fileName: ${fileName}`
				)
			}

			const result = await withNoProxyEnv(() => client.putObject(putOptions))

			const publicUrl = buildSignedPreviewUrl(client, bucketName, key, fileName)
			const headers = result.headers || {}
			const etag = (headers['etag'] || result?.data?.ETag || '').replace(/"/g, '')

			logger.debug(`[cloudfs:tos] Upload success: ${key}, etag: ${etag}`)

			return createCloudUploadResult({
				ok: true,
				key,
				publicUrl,
				etag
			})
		} catch (err) {
			lastErr = err
			const errMsg = String(err?.message || err)

			if (attempt < maxRetries && isRetryableError(err)) {
				logger.warn(`[cloudfs:tos] Retryable error on attempt ${attempt + 1}: ${errMsg}`)
				continue
			}

			break
		}
	}

	logger.error('[cloudfs:tos] uploadFile failed:', lastErr?.message || lastErr)
	return createCloudUploadResult({
		ok: false,
		error: lastErr?.message || String(lastErr)
	})
}

export async function getPublicUrl(config, key, options = {}) {
	const { credentials, region, bucketName } = config
	const endpoint = config.endpoint || resolveEndpoint(region)
	const client = getTosClient(credentials, region, bucketName, endpoint)
	const expires = options.expires || 86400 * 7

	try {
		let fileName = options.fileName
		if (!fileName) {
			try {
				const headResult = await withNoProxyEnv(() =>
					client.headObject({
						bucket: bucketName,
						key
					})
				)
				const headers = headResult.headers || {}
				const contentDisposition = headers['content-disposition'] || ''
				if (contentDisposition) {
					const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
					if (match) {
						try {
							fileName = decodeURIComponent(match[1])
						} catch {
							fileName = match[1]
						}
					}
				}
			} catch (headErr) {
				logger.warn(
					'[cloudfs:tos] getPublicUrl head failed, using key as filename:',
					headErr.message
				)
			}
		}
		if (!fileName) {
			const parts = key.split('/')
			fileName = parts[parts.length - 1] || key
		}
		return buildSignedPreviewUrl(client, bucketName, key, fileName, expires)
	} catch (err) {
		logger.error('[cloudfs:tos] getPublicUrl failed:', err.message)
		try {
			const parts = key.split('/')
			const fileName = options.fileName || parts[parts.length - 1] || key
			return buildSignedPreviewUrl(client, bucketName, key, fileName, expires)
		} catch (err2) {
			logger.error('[cloudfs:tos] getPublicUrl fallback failed:', err2.message)
			return client.getPreSignedUrl({
				method: 'GET',
				bucket: bucketName,
				key,
				expires
			})
		}
	}
}
