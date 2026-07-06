import { CloudAdapter } from './base.mjs'

export class SteamCloudAdapter extends CloudAdapter {
	constructor(options = {}) {
		super(options)
		this._cloud = options.provider?.cloud || null
	}

	getPlatformId() { return 'steam' }
	getPlatformName() { return 'Steam Cloud' }

	isAvailable() {
		return !!this._cloud && typeof this._cloud.fileWrite === 'function'
	}

	async getQuota() {
		if (!this.isAvailable()) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			const result = this._cloud.getQuota()
			if (!result.ok) {
				return { ok: false, errMsg: result.errMsg }
			}
			return {
				ok: true,
				quota: {
					totalBytes: result.totalBytes || 0,
					availableBytes: result.availableBytes || 0,
				},
			}
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileWrite(fileName, buffer) {
		if (!this.isAvailable()) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			return this._cloud.fileWrite(fileName, buffer)
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileRead(fileName) {
		if (!this.isAvailable()) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			return this._cloud.fileRead(fileName)
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileDelete(fileName) {
		if (!this.isAvailable()) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			return this._cloud.fileDelete(fileName)
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileExists(fileName) {
		if (!this.isAvailable()) {
			return { ok: false, exists: false }
		}
		try {
			return this._cloud.fileExists(fileName)
		} catch {
			return { ok: true, exists: false }
		}
	}

	async getFileSize(fileName) {
		if (!this.isAvailable()) {
			return { ok: false, size: 0 }
		}
		try {
			return this._cloud.getFileSize(fileName)
		} catch {
			return { ok: true, size: 0 }
		}
	}

	async getFileTimestamp(fileName) {
		if (!this.isAvailable()) {
			return { ok: false, timestamp: 0 }
		}
		try {
			return this._cloud.getFileTimestamp(fileName)
		} catch {
			return { ok: true, timestamp: 0 }
		}
	}

	getFileCount() {
		if (!this.isAvailable()) return 0
		try {
			return this._cloud.getFileCount()
		} catch {
			return 0
		}
	}

	getFileNameAndSize(index) {
		if (!this.isAvailable()) return null
		try {
			return this._cloud.getFileNameAndSize(index)
		} catch {
			return null
		}
	}

	async listFiles(prefix = '') {
		try {
			const count = this.getFileCount()
			const items = []
			for (let i = 0; i < count; i++) {
				const entry = this.getFileNameAndSize(i)
				if (entry && entry.name && (!prefix || entry.name.startsWith(prefix))) {
					items.push({
						name: entry.name,
						size: entry.size || 0,
						timestamp: 0,
					})
				}
			}
			return { ok: true, items }
		} catch (err) {
			return { ok: false, items: [], errMsg: err.message }
		}
	}
}

export function createSteamCloudAdapter(options = {}) {
	return new SteamCloudAdapter(options)
}
