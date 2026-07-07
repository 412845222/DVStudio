import { CloudAdapter } from './base.mjs'

export class SteamCloudAdapter extends CloudAdapter {
	constructor(options = {}) {
		super(options)
		this._provider = options.provider || null
	}

	_getCloud() {
		if (!this._provider || typeof this._provider.isInitialized !== 'function') return null
		if (!this._provider.isInitialized()) return null
		if (typeof this._provider.isLoggedIn === 'function' && !this._provider.isLoggedIn()) return null
		return this._provider.cloud || null
	}

	getPlatformId() { return 'steam' }
	getPlatformName() { return 'Steam Cloud' }

	isAvailable() {
		const cloud = this._getCloud()
		return !!cloud && typeof cloud.fileWrite === 'function'
	}

	async getQuota() {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			console.log('[cloud-templates:steam] Calling cloud.getQuota()...')
			const result = cloud.getQuota()
			console.log('[cloud-templates:steam] getQuota raw result:', JSON.stringify(result))
			if (!result) {
				return { ok: false, errMsg: 'getQuota returned null/undefined' }
			}
			if (result.ok === false) {
				return { ok: false, errMsg: result.errMsg || 'Failed to get quota' }
			}
			const totalBytes = result.totalBytes || result.bytesTotal || result.total || 0
			const availableBytes = result.availableBytes || result.bytesAvailable || result.available || 0
			console.log('[cloud-templates:steam] Parsed quota:', { totalBytes, availableBytes })
			return {
				ok: true,
				quota: {
					totalBytes,
					availableBytes,
				},
			}
		} catch (err) {
			console.error('[cloud-templates:steam] getQuota error:', err)
			return { ok: false, errMsg: err.message }
		}
	}

	async fileWrite(fileName, buffer) {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, errMsg: 'Steam Cloud not available (not logged in)' }
		}
		try {
			console.log('[cloud-templates:steam] fileWrite:', fileName, buffer.length, 'bytes')
			const result = cloud.fileWrite(fileName, buffer)
			console.log('[cloud-templates:steam] fileWrite result:', result)
			return result
		} catch (err) {
			console.error('[cloud-templates:steam] fileWrite error:', err.message)
			return { ok: false, errMsg: err.message }
		}
	}

	async fileRead(fileName) {
		const cloud = this._getCloud()
		if (!cloud) {
			console.error('[cloud-templates:steam] fileRead failed: cloud not available')
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			console.log('[cloud-templates:steam] fileRead:', fileName)
			const result = cloud.fileRead(fileName)
			console.log('[cloud-templates:steam] fileRead result for', fileName, ':', result.ok ? `ok, buffer length: ${result.buffer?.length || 0}` : `failed: ${result.errMsg}`)
			return result
		} catch (err) {
			console.error('[cloud-templates:steam] fileRead error for', fileName, ':', err.message)
			return { ok: false, errMsg: err.message }
		}
	}

	async fileDelete(fileName) {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			console.log('[cloud-templates:steam] fileDelete:', fileName)
			const result = cloud.fileDelete(fileName)
			console.log('[cloud-templates:steam] fileDelete result:', result)
			return result
		} catch (err) {
			console.error('[cloud-templates:steam] fileDelete error:', err.message)
			return { ok: false, errMsg: err.message }
		}
	}

	async fileExists(fileName) {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, exists: false, errMsg: 'Steam Cloud not available' }
		}
		try {
			const result = cloud.fileExists(fileName)
			console.log('[cloud-templates:steam] fileExists:', fileName, '->', result)
			return result
		} catch (err) {
			console.error('[cloud-templates:steam] fileExists error for', fileName, ':', err.message)
			return { ok: false, exists: false, errMsg: err.message }
		}
	}

	async getFileSize(fileName) {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, size: 0 }
		}
		try {
			return cloud.getFileSize(fileName)
		} catch {
			return { ok: true, size: 0 }
		}
	}

	async getFileTimestamp(fileName) {
		const cloud = this._getCloud()
		if (!cloud) {
			return { ok: false, timestamp: 0 }
		}
		try {
			return cloud.getFileTimestamp(fileName)
		} catch {
			return { ok: true, timestamp: 0 }
		}
	}

	getFileCount() {
		const cloud = this._getCloud()
		if (!cloud) return 0
		try {
			return cloud.getFileCount()
		} catch {
			return 0
		}
	}

	getFileNameAndSize(index) {
		const cloud = this._getCloud()
		if (!cloud) return null
		try {
			return cloud.getFileNameAndSize(index)
		} catch {
			return null
		}
	}

	async listFiles(prefix = '') {
		try {
			const cloud = this._getCloud()
			if (!cloud) {
				return { ok: false, items: [], errMsg: 'Steam Cloud not available' }
			}
			const count = cloud.getFileCount()
			console.log('[cloud-templates:steam] fileCount:', count, 'prefix:', prefix)
			const items = []
			for (let i = 0; i < count; i++) {
				const entry = cloud.getFileNameAndSize(i)
				if (entry && entry.name && (!prefix || entry.name.startsWith(prefix))) {
					items.push({
						name: entry.name,
						size: entry.size || 0,
						timestamp: 0,
					})
				}
			}
			console.log('[cloud-templates:steam] listing', items.length, 'files with prefix', prefix)
			return { ok: true, items }
		} catch (err) {
			return { ok: false, items: [], errMsg: err.message }
		}
	}
}

export function createSteamCloudAdapter(options = {}) {
	return new SteamCloudAdapter(options)
}
