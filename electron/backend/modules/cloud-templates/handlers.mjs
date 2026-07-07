import { getCloudTemplatesService } from './service.mjs'

export async function getPlatform() {
	try {
		const service = getCloudTemplatesService()
		const platformId = service.getPlatformId()
		const platformName = service.getPlatformName()
		console.log('[cloud-templates] getPlatform:', { platformId, platformName })
		return {
			ok: true,
			platformId,
			platformName,
		}
	} catch (err) {
		console.error('[cloud-templates] getPlatform error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function getQuota() {
	try {
		const service = getCloudTemplatesService()
		const result = await service.getQuota()
		console.log('[cloud-templates] getQuota:', result.ok ? 'ok' : result.errMsg)
		return result
	} catch (err) {
		console.error('[cloud-templates] getQuota error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function listTemplates(_ctx, options = {}) {
	try {
		const service = getCloudTemplatesService()
		console.log('[cloud-templates] listTemplates called with options:', options)
		const result = await service.listTemplates(options)
		console.log('[cloud-templates] listTemplates:', result.ok ? `${result.items?.length || 0} items` : result.errMsg)
		return result
	} catch (err) {
		console.error('[cloud-templates] listTemplates error:', err.message)
		return { ok: false, errMsg: err.message, items: [] }
	}
}

export async function uploadTemplate(_ctx, data) {
	try {
		const service = getCloudTemplatesService()

		let zipBuffer = data.zipData
		if (zipBuffer) {
			if (zipBuffer instanceof ArrayBuffer) {
				zipBuffer = Buffer.from(zipBuffer)
			} else if (ArrayBuffer.isView(zipBuffer)) {
				zipBuffer = Buffer.from(zipBuffer.buffer, zipBuffer.byteOffset, zipBuffer.byteLength)
			} else if (Array.isArray(zipBuffer)) {
				zipBuffer = Buffer.from(zipBuffer)
			}
		} else {
			return { ok: false, errMsg: 'Missing zipData' }
		}

		let coverBuffer = null
		if (data.coverData) {
			const cd = data.coverData
			if (cd instanceof ArrayBuffer) {
				coverBuffer = Buffer.from(cd)
			} else if (ArrayBuffer.isView(cd)) {
				coverBuffer = Buffer.from(cd.buffer, cd.byteOffset, cd.byteLength)
			} else if (Array.isArray(cd)) {
				coverBuffer = Buffer.from(cd)
			}
		}

		console.log('[cloud-templates] uploadTemplate start:', { id: data.id, name: data.name, zipSize: zipBuffer.length, hasCover: !!coverBuffer })
		const result = await service.uploadTemplate({
			...data,
			tags: Array.isArray(data.tags) ? [...data.tags] : [],
			nodeCount: data.nodeCount || 0,
			zipBuffer,
			coverBuffer,
		})
		console.log('[cloud-templates] uploadTemplate result:', result.ok ? 'success' : result.errMsg)
		return result
	} catch (err) {
		console.error('[cloud-templates] uploadTemplate error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function downloadTemplate(_ctx, data) {
	try {
		const service = getCloudTemplatesService()
		console.log('[cloud-templates] downloadTemplate start:', { id: data.id })
		const result = await service.downloadTemplate(data.id)
		if (!result.ok) {
			console.error('[cloud-templates] downloadTemplate failed:', result.errMsg)
			return result
		}

		const zipBuffer = result.zipBuffer
		const coverBuffer = result.coverBuffer

		console.log('[cloud-templates] downloadTemplate success:', { id: data.id, zipSize: zipBuffer.length })
		return {
			ok: true,
			meta: result.meta,
			zipData: zipBuffer.buffer.slice(
				zipBuffer.byteOffset,
				zipBuffer.byteOffset + zipBuffer.byteLength
			),
			coverData: coverBuffer ? coverBuffer.buffer.slice(
				coverBuffer.byteOffset,
				coverBuffer.byteOffset + coverBuffer.byteLength
			) : null,
		}
	} catch (err) {
		console.error('[cloud-templates] downloadTemplate error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function deleteTemplate(_ctx, data) {
	try {
		const service = getCloudTemplatesService()
		console.log('[cloud-templates] deleteTemplate start:', { id: data.id })
		const result = await service.deleteTemplate(data.id)
		console.log('[cloud-templates] deleteTemplate result:', result.ok ? 'success' : result.errMsg)
		return result
	} catch (err) {
		console.error('[cloud-templates] deleteTemplate error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}
