import { UgcAdapter } from './base.mjs'
import fs from 'node:fs'
import path from 'node:path'

export class SteamUgcAdapter extends UgcAdapter {
	constructor(options = {}) {
		super(options)
		this._lastGetUgcLogged = 0
	}

	_getUGC() {
		if (!this._provider) return null
		if (typeof this._provider.isInitialized !== 'function' || !this._provider.isInitialized()) {
			return null
		}
		if (!this._provider.ugc) return null

		const userInfo = this._provider.getUserInfo?.()
		const hasUserInfo = userInfo && userInfo.displayName
		const isLogged = typeof this._provider.isLoggedIn === 'function' ? this._provider.isLoggedIn() : false

		const now = Date.now()
		if (now - this._lastGetUgcLogged > 3000) {
			this._lastGetUgcLogged = now
			console.log('[SteamUgcAdapter] _getUGC: isLoggedIn=' + isLogged + ', hasUserInfo=' + !!hasUserInfo)
		}

		if (!isLogged && !hasUserInfo) return null
		return this._provider.ugc
	}

	getPlatformId() { return 'steam' }
	getPlatformName() { return 'Steam Workshop' }

	isAvailable() {
		if (!this._provider) return false
		if (typeof this._provider.isAvailable === 'function' && !this._provider.isAvailable()) return false
		if (!this._provider.ugc) return false
		return typeof this._provider.ugc.queryAll === 'function'
	}

	async _waitForDownload(publishedFileId, maxWaitMs = 120000) {
		const startTime = Date.now()
		const checkInterval = 500

		return new Promise((resolve) => {
			let lastLoggedProgress = -1
			let downloadedNoticed = false
			let postDownloadWaitStart = null
			const postDownloadWaitMs = 2000

			const check = () => {
				const ugc = this._getUGC()
				if (!ugc) {
					resolve(false)
					return
				}

				const installInfo = ugc.getItemInstallInfo(publishedFileId)

				if (installInfo && installInfo.installed && installInfo.installPath) {
					if (!postDownloadWaitStart) {
						postDownloadWaitStart = Date.now()
					}

					try {
						if (fs.existsSync(installInfo.installPath)) {
							const entries = fs.readdirSync(installInfo.installPath)
							if (entries.length > 0) {
								const hasActualFile = entries.some(e => {
									try {
										return fs.statSync(path.join(installInfo.installPath, e)).size > 0
									} catch { return false }
								})
								if (hasActualFile || Date.now() - postDownloadWaitStart >= postDownloadWaitMs) {
									resolve(true)
									return
								}
							}
						}
					} catch {}

					if (Date.now() - postDownloadWaitStart >= postDownloadWaitMs) {
						resolve(true)
						return
					}
				}

				const progress = ugc.getDownloadProgress(publishedFileId)
				if (progress && progress.progress !== lastLoggedProgress) {
					console.log('[SteamUgcAdapter] Download progress:', progress.progress, '%')
					lastLoggedProgress = progress.progress
				}

				if (Date.now() - startTime >= maxWaitMs) {
					resolve(false)
					return
				}

				setTimeout(check, checkInterval)
			}

			check()
		})
	}

	async queryAll(options = {}) {
		const { tag, ...nativeOptions } = options
		const ugc = this._getUGC()

		if (!ugc) {
			return { ok: false, items: [], totalResults: 0, errMsg: 'Steam UGC not available' }
		}

		try {
			const result = await ugc.queryAll(nativeOptions)

			if (!result.ok || !result.items) {
				return result
			}

			if (result.items.length > 0) {
				console.log('[SteamUgcAdapter] Native query returned', result.items.length, 'items:')
				for (const item of result.items) {
					console.log('  -', item.publishedFileId + ':', '"' + item.title + '"',
						'tags=', JSON.stringify(item.tags),
						'isOfficial=', item.isOfficial,
						'visibility=', item.visibility)
				}
			}

			if (tag) {
				let filtered
				if (tag === 'official') {
					filtered = result.items
					for (const item of filtered) {
						item.isOfficial = true
					}
					console.log('[SteamUgcAdapter] Tag filter "official": returning all', filtered.length, 'Steam items as official (admin-publisher only channel)')
				} else {
					filtered = result.items.filter(i => i.tags?.includes(tag))
					console.log('[SteamUgcAdapter] Tag filter "' + tag + '":', filtered.length, 'of', result.items.length, 'items matched')
				}
				return { ok: true, items: filtered, totalResults: filtered.length }
			}

			return result
		} catch (err) {
			console.warn('[SteamUgcAdapter] Native queryAll error:', err.message)
			return { ok: false, items: [], totalResults: 0, errMsg: err.message }
		}
	}

	async downloadItem(publishedFileId) {
		const ugc = this._getUGC()
		if (!ugc) return { ok: false, errMsg: 'Steam UGC not available' }

		const existingInstall = ugc.getItemInstallInfo(publishedFileId)
		let needsDownload = true

		if (existingInstall && existingInstall.installed && existingInstall.installPath) {
			try {
				if (fs.existsSync(existingInstall.installPath)) {
					const entries = fs.readdirSync(existingInstall.installPath)
					if (entries.length > 0) {
						const hasContent = entries.some(e => {
							try { return fs.statSync(path.join(existingInstall.installPath, e)).size > 0 }
							catch { return false }
						})
						if (hasContent) needsDownload = false
					}
				}
			} catch {}
		}

		if (needsDownload) {
			const startResult = ugc.downloadItem(publishedFileId, 0)
			if (!startResult || !startResult.ok) {
				return { ok: false, errMsg: startResult?.errMsg || 'Failed to start download' }
			}
			const completed = await this._waitForDownload(publishedFileId)
			if (!completed) return { ok: false, errMsg: 'Download timeout' }
		}

		return { ok: true }
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
