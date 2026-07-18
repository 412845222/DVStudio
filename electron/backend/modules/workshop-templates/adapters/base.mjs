/**
 * @typedef {Object} UgcItem
 * @property {string} publishedFileId
 * @property {string} title
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {number} [fileSize]
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} [previewUrl]
 * @property {string} [author]
 * @property {boolean} isOfficial
 */

/**
 * @typedef {Object} UgcQueryResult
 * @property {boolean} ok
 * @property {UgcItem[]} [items]
 * @property {number} [totalResults]
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} UgcDownloadResult
 * @property {boolean} ok
 * @property {string} [contentPath]
 * @property {string} [errMsg]
 */

/**
 * @class UgcAdapter
 * @description 平台UGC适配器基类 - 所有平台适配器必须继承此类
 */
export class UgcAdapter {
	constructor(options = {}) {
		this._provider = options.provider || null
	}

	getPlatformId() { return 'base' }

	getPlatformName() { return 'Base' }

	isAvailable() { return false }

	async queryAll(options = {}) {
		return { ok: false, items: [], totalResults: 0, errMsg: 'Not implemented' }
	}

	async queryUserItems(listType = 'published') {
		const ugc = this._provider?.ugc
		if (!ugc || typeof ugc.queryUserItems !== 'function') {
			return { ok: false, items: [], totalResults: 0, errMsg: 'queryUserItems not available' }
		}
		try {
			const appId = this._provider?.getAppId?.() || 2475710
			return await ugc.queryUserItems(appId, listType)
		} catch (err) {
			return { ok: false, items: [], totalResults: 0, errMsg: err.message }
		}
	}

	async downloadItem(publishedFileId) {
		return { ok: false, errMsg: 'Not implemented' }
	}

	getDownloadProgress(publishedFileId) {
		return null
	}

	getItemInstallInfo(publishedFileId) {
		return { ok: false, installed: false }
	}
}