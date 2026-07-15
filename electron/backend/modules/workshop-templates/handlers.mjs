import { getWorkshopTemplatesService } from './service.mjs'

export async function getPlatform() {
	try {
		const service = getWorkshopTemplatesService()
		const platformId = service.getPlatformId()
		const platformName = service.getPlatformName()
		const available = service.isAvailable()
		console.log('[workshop-templates] getPlatform:', { platformId, platformName, available })
		return {
			ok: available,
			platformId,
			platformName,
		}
	} catch (err) {
		console.error('[workshop-templates] getPlatform error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function queryTemplates(_ctx, options = {}) {
	try {
		const service = getWorkshopTemplatesService()
		console.log('[workshop-templates] queryTemplates called with options:', options)
		const result = await service.queryOfficial(options)
		console.log('[workshop-templates] queryTemplates:', result.ok ? `${result.items?.length || 0} items` : result.errMsg)
		return result
	} catch (err) {
		console.error('[workshop-templates] queryTemplates error:', err.message)
		return { ok: false, errMsg: err.message, items: [], totalResults: 0 }
	}
}

export async function downloadTemplate(_ctx, data) {
	try {
		const { publishedFileId } = data
		if (!publishedFileId) {
			return { ok: false, errMsg: 'publishedFileId is required' }
		}

		const service = getWorkshopTemplatesService()
		console.log('[workshop-templates] downloadTemplate start:', { publishedFileId })
		const result = await service.downloadItem(publishedFileId)

		if (!result.ok) {
			console.error('[workshop-templates] downloadTemplate failed:', result.errMsg)
			return result
		}

		const { metadata, zipBuffer, coverBuffer } = result

		console.log('[workshop-templates] downloadTemplate success:', { publishedFileId, zipSize: zipBuffer.length })

		return {
			ok: true,
			publishedFileId,
			metadata,
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
		console.error('[workshop-templates] downloadTemplate error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function getDownloadProgress(_ctx, data) {
	try {
		const { publishedFileId } = data
		if (!publishedFileId) {
			return { ok: false, errMsg: 'publishedFileId is required' }
		}

		const service = getWorkshopTemplatesService()
		const progress = service.getDownloadProgress(publishedFileId)
		console.log('[workshop-templates] getDownloadProgress:', { publishedFileId, progress })

		return {
			ok: true,
			publishedFileId,
			progress,
		}
	} catch (err) {
		console.error('[workshop-templates] getDownloadProgress error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}

export async function getInstallInfo(_ctx, data) {
	try {
		const { publishedFileId } = data
		if (!publishedFileId) {
			return { ok: false, errMsg: 'publishedFileId is required' }
		}

		const service = getWorkshopTemplatesService()
		const info = service.getItemInstallInfo(publishedFileId)
		console.log('[workshop-templates] getInstallInfo:', { publishedFileId, installed: info.installed })

		return {
			ok: true,
			...info,
		}
	} catch (err) {
		console.error('[workshop-templates] getInstallInfo error:', err.message)
		return { ok: false, errMsg: err.message }
	}
}