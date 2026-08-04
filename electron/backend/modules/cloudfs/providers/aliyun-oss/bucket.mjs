import { getOssClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import logger from '../../../../core/logger.mjs'

export async function listBuckets(credentials, region, endpoint) {
	const finalEndpoint =
		endpoint || credentials.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')
	const client = getOssClient(credentials, region, null, finalEndpoint)
	try {
		const result = await withNoProxyEnv(() => client.listBuckets())
		const buckets = (result.buckets || []).map((b) => {
			const bucketRegion = b.region || b.location || region || 'oss-cn-hangzhou'
			return {
				name: b.name,
				location: bucketRegion,
				creationDate: b.creationDate,
				extranetEndpoint: b.extranetEndpoint || `${bucketRegion}.aliyuncs.com`
			}
		})
		logger.info(`[cloudfs:oss] listBuckets success, got ${buckets.length} buckets`)
		return { ok: true, buckets }
	} catch (err) {
		logger.error('[cloudfs:oss] listBuckets failed:', err.message)
		return { ok: false, error: err.message, buckets: [] }
	}
}

export async function bucketExistsAndOwned(client, credentials, region, endpoint, bucketName) {
	try {
		const listResult = await listBuckets(credentials, region, endpoint)
		if (!listResult.ok) return false
		return listResult.buckets.some((b) => b.name === bucketName)
	} catch {
		return false
	}
}

export async function createBucket(client, bucketName, region) {
	try {
		await withNoProxyEnv(() =>
			client.putBucket(bucketName, {
				region: region || 'oss-cn-hangzhou'
			})
		)
		logger.info(`[cloudfs:oss] createBucket success: ${bucketName}`)
		return { ok: true }
	} catch (err) {
		const msg = err?.message || ''
		const code = err?.code || ''
		const status = err?.status
		const isOwnedByYou =
			msg.includes('BucketAlreadyOwnedByYou') || code === 'BucketAlreadyOwnedByYou'
		const isExistsButNotOwned =
			(status === 409 || code === 'BucketAlreadyExists' || msg.includes('BucketAlreadyExists')) &&
			!isOwnedByYou

		if (isOwnedByYou) {
			logger.info(`[cloudfs:oss] createBucket: bucket ${bucketName} already owned by us`)
			return { ok: true, alreadyExists: true }
		}

		if (isExistsButNotOwned) {
			const errorMsg = `桶名 "${bucketName}" 已被其他用户占用，请换一个名称`
			logger.error(`[cloudfs:oss] createBucket failed: bucket name taken by others - ${bucketName}`)
			return { ok: false, error: errorMsg, bucketNameTaken: true }
		}

		logger.error('[cloudfs:oss] createBucket failed:', err.message)
		return { ok: false, error: err.message }
	}
}

export async function setBucketPublicRead(client, bucketName) {
	try {
		logger.info(`[cloudfs:oss] Setting bucket ${bucketName} ACL to public-read`)
		await withNoProxyEnv(() => client.putBucketACL(bucketName, 'public-read'))
		logger.info(`[cloudfs:oss] Bucket ${bucketName} ACL set to public-read successfully`)
		return { ok: true }
	} catch (err) {
		logger.error('[cloudfs:oss] setBucketPublicRead failed:', err.message)
		return { ok: false, error: err.message }
	}
}

export async function setObjectPublicRead(client, bucketName, key) {
	try {
		await withNoProxyEnv(() => client.putACL(key, 'public-read'))
		return { ok: true }
	} catch (err) {
		logger.warn(`[cloudfs:oss] setObjectPublicRead failed for ${key}:`, err.message)
		return { ok: false, error: err.message }
	}
}

export async function getBucketAcl(client, bucketName) {
	try {
		const result = await withNoProxyEnv(() => client.getBucketACL(bucketName))
		const aclValue = (result.acl || '').toLowerCase()
		if (aclValue === 'public-read' || aclValue === 'public-read-write') {
			return { ok: true, acl: 'public-read' }
		}
		const grants = result.grants || []
		const acl = grants.some((g) => {
			const grantee = g.grantee || {}
			const uri = grantee.uri || ''
			const permission = (g.permission || '').toUpperCase()
			return (uri.includes('AllUsers') || uri.includes('global/AllUsers')) && permission === 'READ'
		})
			? 'public-read'
			: 'private'
		return { ok: true, acl }
	} catch (err) {
		logger.error('[cloudfs:oss] getBucketAcl failed:', err.message)
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
		logger.error('[cloudfs:oss] ensureBucketPublicRead failed:', err.message)
		return { ok: false, error: err.message }
	}
}

export async function setupLifecycle(client, bucketName, days = 1) {
	try {
		const rules = [
			{
				id: 'auto-cleanup',
				prefix: '',
				status: 'Enabled',
				expiration: { days }
			}
		]
		await withNoProxyEnv(() => client.putBucketLifecycle(bucketName, rules))
		return { ok: true }
	} catch (err) {
		logger.warn('[cloudfs:oss] setupLifecycle failed (non-critical):', err.message)
		return { ok: true, warning: err.message }
	}
}

export async function setupBucket(credentials, region, bucketName, options = {}) {
	const endpoint =
		options.endpoint || credentials.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')
	const client = getOssClient(credentials, region, null, endpoint)

	try {
		const owned = await bucketExistsAndOwned(client, credentials, region, endpoint, bucketName)
		if (!owned) {
			const createResult = await createBucket(client, bucketName, region)
			if (!createResult.ok) {
				return { ok: false, error: createResult.error }
			}
		}

		const bucketClient = getOssClient(credentials, region, bucketName, endpoint)

		if (options.publicRead !== false) {
			const aclResult = await setBucketPublicRead(bucketClient, bucketName)
			if (!aclResult.ok) {
				logger.warn('[cloudfs:oss] Failed to set public-read ACL:', aclResult.error)
			}
		}

		if (options.lifecycleDays) {
			await setupLifecycle(bucketClient, bucketName, options.lifecycleDays)
		}

		return {
			ok: true,
			bucketName,
			endpoint,
			publicUrlBase: `https://${bucketName}.${endpoint}`
		}
	} catch (err) {
		logger.error('[cloudfs:oss] setupBucket failed:', err.message)
		return { ok: false, error: err.message }
	}
}
