import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { CloudAdapter } from './base.mjs'

export class LocalCloudAdapter extends CloudAdapter {
	constructor(options = {}) {
		super(options)
		this._storageDir = options.storageDir || path.join(os.tmpdir(), 'dvstudio-cloud-storage')
		this._ensureStorageDir()
	}

	async _ensureStorageDir() {
		try {
			await fs.mkdir(this._storageDir, { recursive: true })
		} catch (err) {
			console.warn('[cloud:local] Failed to create storage dir:', err.message)
		}
	}

	_getFullPath(fileName) {
		const safeName = fileName.replace(/[\/\\]/g, '_')
		return path.join(this._storageDir, safeName)
	}

	getPlatformId() {
		return 'local'
	}
	getPlatformName() {
		return 'Local Storage'
	}
	isAvailable() {
		return true
	}

	async getQuota() {
		return {
			ok: true,
			quota: {
				totalBytes: 1024 * 1024 * 1000,
				availableBytes: 1024 * 1024 * 500
			}
		}
	}

	async fileWrite(fileName, buffer) {
		try {
			const fullPath = this._getFullPath(fileName)
			await fs.writeFile(fullPath, buffer)
			return { ok: true }
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileRead(fileName) {
		try {
			const fullPath = this._getFullPath(fileName)
			const buffer = await fs.readFile(fullPath)
			return { ok: true, buffer }
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	async fileDelete(fileName) {
		try {
			const fullPath = this._getFullPath(fileName)
			await fs.unlink(fullPath)
			return { ok: true }
		} catch (err) {
			if (err.code === 'ENOENT') {
				return { ok: true }
			}
			return { ok: false, errMsg: err.message }
		}
	}

	async fileExists(fileName) {
		try {
			const fullPath = this._getFullPath(fileName)
			await fs.access(fullPath)
			return { ok: true, exists: true }
		} catch {
			return { ok: true, exists: false }
		}
	}

	async getFileSize(fileName) {
		try {
			const fullPath = this._getFullPath(fileName)
			const stat = await fs.stat(fullPath)
			return { ok: true, size: stat.size }
		} catch {
			return { ok: true, size: 0 }
		}
	}

	async getFileTimestamp(fileName) {
		try {
			const fullPath = this._getFullPath(fileName)
			const stat = await fs.stat(fullPath)
			return { ok: true, timestamp: Math.floor(stat.mtimeMs) }
		} catch {
			return { ok: true, timestamp: 0 }
		}
	}

	getFileCount() {
		try {
			const files = fs.readdirSync(this._storageDir)
			return files.length
		} catch {
			return 0
		}
	}

	getFileNameAndSize(index) {
		try {
			const files = fs.readdirSync(this._storageDir)
			if (index < 0 || index >= files.length) {
				return null
			}
			const fileName = files[index]
			const fullPath = path.join(this._storageDir, fileName)
			const stat = fs.statSync(fullPath)
			return { name: fileName, size: stat.size }
		} catch {
			return null
		}
	}

	async listFiles(prefix = '') {
		try {
			const files = await fs.readdir(this._storageDir)
			const items = []
			for (const file of files) {
				if (prefix && !file.startsWith(prefix)) continue
				const fullPath = path.join(this._storageDir, file)
				try {
					const stat = await fs.stat(fullPath)
					items.push({
						name: file,
						size: stat.size,
						timestamp: Math.floor(stat.mtimeMs)
					})
				} catch {}
			}
			return { ok: true, items }
		} catch (err) {
			return { ok: false, items: [], errMsg: err.message }
		}
	}
}

export function createLocalCloudAdapter(options = {}) {
	return new LocalCloudAdapter(options)
}
