import { UgcAdapter } from './base.mjs'

export class SteamUgcAdapter extends UgcAdapter {
	_getUGC() {
		if (!this._provider || typeof this._provider.isInitialized !== 'function') return null
		if (!this._provider.isInitialized()) return null
		if (typeof this._provider.isLoggedIn === 'function' && !this._provider.isLoggedIn()) return null
		return this._provider.ugc || null
	}

	getPlatformId() { return 'steam' }

	getPlatformName() { return 'Steam Workshop' }

	isAvailable() {
		if (!this._provider) return false
		if (typeof this._provider.isAvailable === 'function' && !this._provider.isAvailable()) return false
		if (!this._provider.ugc) return false
		return typeof this._provider.ugc.queryAll === 'function'
	}

	async queryAll(options = {}) {
		const ugc = this._getUGC()
		if (!ugc) {
			return { ok: false, items: [], totalResults: 0, errMsg: 'Steam UGC not available' }
		}
		return ugc.queryAll(options)
	}

	async downloadItem(publishedFileId) {
		const ugc = this._getUGC()
		if (!ugc) {
			return { ok: false, errMsg: 'Steam UGC not available' }
		}
		return ugc.downloadItem(publishedFileId)
	}

	getDownloadProgress(publishedFileId) {
		const ugc = this._getUGC()
		if (!ugc) return null
		return ugc.getDownloadProgress(publishedFileId)
	}

	getItemInstallInfo(publishedFileId) {
		const ugc = this._getUGC()
		if (!ugc) return { ok: false, installed: false }
		return ugc.getItemInstallInfo(publishedFileId)
	}
}

export function createSteamUgcAdapter(options = {}) {
	return new SteamUgcAdapter(options)
}