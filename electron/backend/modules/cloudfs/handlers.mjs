import * as service from './service.mjs'

export async function listProviders(ctx) {
	try {
		const providers = service.listAvailableProviders()
		return { ok: true, providers }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function getActiveConfig(ctx) {
	try {
		const result = await service.getActiveConfig(ctx)
		return { ok: true, ...result }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function getConfigStatus(ctx) {
	try {
		const result = await service.getConfigStatus(ctx)
		return { ok: true, ...result }
	} catch (err) {
		return {
			ok: false,
			error: String(err?.message || err),
			configured: false,
			hasActiveBucket: false
		}
	}
}

export async function saveConfig(ctx, payload) {
	try {
		const p = payload || {}
		return await service.saveConfig(ctx, p.providerId, p.config, p.lastTestOk || 0)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function clearConfig(ctx) {
	try {
		return await service.clearConfig(ctx)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function testConfig(ctx, payload) {
	try {
		const p = payload || {}
		return await service.testConfig(ctx, p.providerId, p.config)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function validateCredentials(ctx, payload) {
	try {
		const p = payload || {}
		return await service.validateProviderCredentials(
			ctx,
			p.providerId,
			p.credentials,
			p.region,
			p.endpoint
		)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function setupBucket(ctx, payload) {
	try {
		const p = payload || {}
		return await service.setupProviderBucket(
			ctx,
			p.providerId,
			p.credentials,
			p.region,
			p.bucketName,
			p.options
		)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function listBuckets(ctx, payload) {
	try {
		const p = payload || {}
		return await service.listBuckets(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err), buckets: [] }
	}
}

export async function createBucket(ctx, payload) {
	try {
		const p = payload || {}
		return await service.createBucket(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function createFolder(ctx, payload) {
	try {
		const p = payload || {}
		return await service.createFolder(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function updateBucket(ctx, payload) {
	try {
		const p = payload || {}
		return await service.updateActiveBucket(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function listFiles(ctx, payload) {
	try {
		return await service.listFiles(ctx, payload)
	} catch (err) {
		return {
			ok: false,
			error: String(err?.message || err),
			items: [],
			prefixes: [],
			isTruncated: false
		}
	}
}

export async function uploadFile(ctx, payload) {
	try {
		const p = payload || {}
		return await service.uploadFile(ctx, p.data, p.options)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function deleteFile(ctx, payload) {
	try {
		const p = payload || {}
		return await service.deleteFile(ctx, p.key)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function getPublicUrl(ctx, payload) {
	try {
		const p = payload || {}
		return await service.getPublicUrl(ctx, p.key, p.expires)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function uploadToPublicUrl(ctx, payload) {
	try {
		const p = payload || {}
		return await service.uploadFileToPublicUrl(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function listConfiguredBuckets(ctx) {
	try {
		return await service.listConfiguredBuckets(ctx)
	} catch (err) {
		return { ok: false, error: String(err?.message || err), buckets: [] }
	}
}

export async function addBucketFromCloud(ctx, payload) {
	try {
		const p = payload || {}
		return await service.addBucketFromCloud(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function removeConfiguredBucket(ctx, payload) {
	try {
		const p = payload || {}
		return await service.removeConfiguredBucket(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function switchActiveBucket(ctx, payload) {
	try {
		const p = payload || {}
		return await service.switchActiveBucket(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function fixBucketAcl(ctx, payload) {
	try {
		const p = payload || {}
		return await service.fixBucketAcl(ctx, p)
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}
