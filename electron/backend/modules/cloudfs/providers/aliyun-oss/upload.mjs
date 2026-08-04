import { getOssClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
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

function buildSignedPreviewUrl(client, key, fileName, expires = 86400 * 7) {
	return client.signatureUrl(key, {
		expires,
		method: 'GET',
		response: {
			'content-disposition': buildContentDisposition(fileName)
		}
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
		err?.status === 429 ||
		(err?.status >= 500 && err?.status < 600)
	)
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function uploadFile(config, data, options = {}) {
	const { credentials, region, bucketName } = config
	const endpoint = config.endpoint || resolveEndpoint(region)
	const client = getOssClient(credentials, region, bucketName, endpoint)

	const contentType = options.contentType || 'application/octet-stream'
	const key = options.key || buildObjectKey(options.prefix || 'uploads', options.fileName)
	const fileName = options.fileName || key.split('/').pop() || key

	const headers = {
		'Content-Type': contentType,
		'Content-Disposition': buildContentDisposition(fileName)
	}

	const maxRetries = 2
	let lastErr = null

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger.warn(`[cloudfs:oss] Upload retry ${attempt}/${maxRetries} for key: ${key}`)
				await sleep(300 * attempt)
			} else {
				logger.debug(
					`[cloudfs:oss] Uploading to key: ${key}, type: ${contentType}, fileName: ${fileName}`
				)
			}

			const result = await withNoProxyEnv(() =>
				client.put(key, data, {
					mime: contentType,
					headers
				})
			)

			const publicUrl = buildSignedPreviewUrl(client, key, fileName)
			const etag = result.etag ? String(result.etag).replace(/"/g, '') : ''

			logger.debug(`[cloudfs:oss] Upload success: ${key}, etag: ${etag}`)

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
				logger.warn(`[cloudfs:oss] Retryable error on attempt ${attempt + 1}: ${errMsg}`)
				continue
			}

			break
		}
	}

	logger.error('[cloudfs:oss] uploadFile failed:', lastErr?.message || lastErr)
	return createCloudUploadResult({
		ok: false,
		error: lastErr?.message || String(lastErr)
	})
}

export async function getPublicUrl(config, key, options = {}) {
	const { credentials, region, bucketName } = config
	const endpoint = config.endpoint || resolveEndpoint(region)
	const client = getOssClient(credentials, region, bucketName, endpoint)
	const expires = options.expires || 86400 * 7

	try {
		let fileName = options.fileName
		if (!fileName) {
			try {
				const headResult = await withNoProxyEnv(() => client.head(key))
				const resHeaders = headResult.res?.headers || {}
				const contentDisposition = resHeaders['content-disposition'] || ''
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
					'[cloudfs:oss] getPublicUrl head failed, using key as filename:',
					headErr.message
				)
			}
		}
		if (!fileName) {
			const parts = key.split('/')
			fileName = parts[parts.length - 1] || key
		}
		return buildSignedPreviewUrl(client, key, fileName, expires)
	} catch (err) {
		logger.error('[cloudfs:oss] getPublicUrl failed:', err.message)
		try {
			const parts = key.split('/')
			const fileName = options.fileName || parts[parts.length - 1] || key
			return buildSignedPreviewUrl(client, key, fileName, expires)
		} catch (err2) {
			logger.error('[cloudfs:oss] getPublicUrl fallback failed:', err2.message)
			return client.signatureUrl(key, { expires, method: 'GET' })
		}
	}
}
