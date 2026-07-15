import { getActiveUgcAdapter } from './adapters/factory.mjs'
import { getManager } from '../../../platform/manager.mjs'
import fs from 'node:fs'
import path from 'node:path'

export class WorkshopTemplatesService {
	constructor() {
		this._adapter = null
		this._platformManager = null
	}

	_ensureManager() {
		if (!this._platformManager) {
			this._platformManager = getManager()
		}
		return this._platformManager
	}

	_initAdapter() {
		const mgr = this._ensureManager()
		this._adapter = getActiveUgcAdapter(mgr)
		console.log('[workshop-templates] adapter initialized:', this._adapter?.getPlatformId?.(), 'available:', this._adapter?.isAvailable?.())
	}

	getAdapter() {
		if (!this._adapter?.isAvailable()) {
			this._initAdapter()
		}
		return this._adapter
	}

	getPlatformId() {
		const adapter = this.getAdapter()
		return adapter.getPlatformId()
	}

	getPlatformName() {
		const adapter = this.getAdapter()
		return adapter.getPlatformName()
	}

	isAvailable() {
		return this.getAdapter().isAvailable()
	}

	async queryOfficial(options = {}) {
		try {
			console.log('[workshop-templates] queryOfficial called with options:', options)
			const adapter = this.getAdapter()
			const result = await adapter.queryAll(options)
			console.log('[workshop-templates] queryOfficial result:', result.ok ? `${result.items?.length || 0} items` : result.errMsg)
			return result
		} catch (err) {
			console.error('[workshop-templates] queryOfficial error:', err.message)
			return { ok: false, items: [], totalResults: 0, errMsg: err.message }
		}
	}

	async downloadItem(publishedFileId) {
		try {
			console.log('[workshop-templates] downloadItem start:', { publishedFileId })

			const adapter = this.getAdapter()

			const downloadResult = await adapter.downloadItem(publishedFileId)
			if (!downloadResult.ok) {
				console.error('[workshop-templates] downloadItem failed:', downloadResult.errMsg)
				return downloadResult
			}

			const installInfo = await adapter.getItemInstallInfo(publishedFileId)
			if (!installInfo.ok || !installInfo.installPath) {
				console.error('[workshop-templates] downloadItem failed to get install path:', installInfo.errMsg)
				return { ok: false, errMsg: 'Failed to get install path' }
			}

			const installPath = installInfo.installPath
			console.log('[workshop-templates] downloadItem install path:', installPath)

			let metadata = null
			const metadataPath = path.join(installPath, 'metadata.json')
			if (fs.existsSync(metadataPath)) {
				try {
					const metadataContent = fs.readFileSync(metadataPath, 'utf8')
					metadata = JSON.parse(metadataContent)
					console.log('[workshop-templates] downloadItem metadata:', metadata)
				} catch (err) {
					console.warn('[workshop-templates] Failed to read metadata.json:', err.message)
				}
			}

			let zipBuffer = null
			const zipPath = path.join(installPath, 'template.zip')
			if (fs.existsSync(zipPath)) {
				try {
					zipBuffer = fs.readFileSync(zipPath)
					console.log('[workshop-templates] downloadItem zip size:', zipBuffer.length)
				} catch (err) {
					console.warn('[workshop-templates] Failed to read template.zip:', err.message)
				}
			}

			let coverBuffer = null
			const coverPath = path.join(installPath, 'preview.png')
			if (fs.existsSync(coverPath)) {
				try {
					coverBuffer = fs.readFileSync(coverPath)
					console.log('[workshop-templates] downloadItem cover size:', coverBuffer.length)
				} catch (err) {
					console.warn('[workshop-templates] Failed to read preview.png:', err.message)
				}
			}

			if (!zipBuffer) {
				return { ok: false, errMsg: 'Template package not found' }
			}

			return {
				ok: true,
				publishedFileId,
				metadata,
				zipBuffer,
				coverBuffer,
			}
		} catch (err) {
			console.error('[workshop-templates] downloadItem error:', err.message)
			return { ok: false, errMsg: err.message }
		}
	}

	getDownloadProgress(publishedFileId) {
		try {
			const adapter = this.getAdapter()
			return adapter.getDownloadProgress(publishedFileId)
		} catch (err) {
			console.error('[workshop-templates] getDownloadProgress error:', err.message)
			return null
		}
	}

	getItemInstallInfo(publishedFileId) {
		try {
			const adapter = this.getAdapter()
			return adapter.getItemInstallInfo(publishedFileId)
		} catch (err) {
			console.error('[workshop-templates] getItemInstallInfo error:', err.message)
			return { ok: false, installed: false }
		}
	}
}

let _service = null

export function getWorkshopTemplatesService() {
	if (!_service) {
		_service = new WorkshopTemplatesService()
	}
	return _service
}