import { getActiveUgcAdapter, createMockUgcAdapter } from './adapters/factory.mjs'
import { getManager } from '../../../platform/manager.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class WorkshopTemplatesService {
	constructor() {
		this._adapter = null
		this._platformManager = null
		this._fallbackToMock = false
		this._boundOnPlatformChange = null
	}

	_ensureManager() {
		if (!this._platformManager) {
			this._platformManager = getManager()
			this._boundOnPlatformChange = () => {
				if (this._adapter) {
					const activeProvider = this._platformManager.getActiveProvider()
					const newPlatformId = activeProvider?.id || 'mock'
					const currentPlatformId = this._adapter?.getPlatformId?.()
					const shouldSwitch = (newPlatformId === 'steam' && currentPlatformId !== 'steam') ||
						(newPlatformId !== 'steam' && currentPlatformId === 'steam')
					if (shouldSwitch) {
						console.log('[workshop-templates] Platform changed from', currentPlatformId, 'to', newPlatformId, '- reinitializing adapter')
						this._adapter = null
					}
				}
			}
			this._platformManager.on('status-changed', this._boundOnPlatformChange)
		}
		return this._platformManager
	}

	shutdown() {
		if (this._platformManager && this._boundOnPlatformChange) {
			this._platformManager.off('status-changed', this._boundOnPlatformChange)
		}
		this._adapter = null
	}

	_initAdapter() {
		const mgr = this._ensureManager()
		this._adapter = getActiveUgcAdapter(mgr)
		console.log('[workshop-templates] adapter initialized:', this._adapter?.getPlatformId?.(), 'available:', this._adapter?.isAvailable?.())
	}

	_shouldReinitAdapter() {
		if (!this._adapter) return true
		if (!this._adapter.isAvailable()) return true
		const mgr = this._ensureManager()
		const activeProvider = mgr.getActiveProvider()
		const activeId = activeProvider?.id || 'mock'
		const currentId = this._adapter?.getPlatformId?.()

		if (activeId === 'steam' && currentId !== 'steam') {
			const steamProvider = mgr._providers?.get('steam')
			if (steamProvider && steamProvider.isAvailable() && steamProvider.isInitialized()) {
				console.log('[workshop-templates] Steam is now available, switching from', currentId, 'to steam')
				return true
			}
		}

		if (activeId !== 'steam' && currentId === 'steam') {
			const steamProvider = mgr._providers?.get('steam')
			if (!steamProvider || !steamProvider.isAvailable() || !steamProvider.isInitialized()) {
				console.log('[workshop-templates] Steam is no longer available, switching from steam to', activeId)
				return true
			}
		}

		return false
	}

	getAdapter() {
		if (this._shouldReinitAdapter()) {
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
			const isDev = !!process.env.ELECTRON_DEV
			const baseOptions = { ...options, tag: 'official', limit: options.limit || 50 }
			console.log('[workshop-templates] queryOfficial called, isDev=', isDev)

			let adapter = this.getAdapter()
			console.log('[workshop-templates] Using adapter:', adapter?.getPlatformId?.())

			let result = { ok: false, items: [], totalResults: 0 }

			const queryStrategies = [
				{ queryType: 1, matchingType: 2, allowCachedResponse: 0 },
				{ queryType: 1, matchingType: 0, allowCachedResponse: 0 },
				{ queryType: 1, matchingType: 10, allowCachedResponse: 0 },
				{ queryType: 19, matchingType: 2, allowCachedResponse: 0 },
				{ queryType: 19, matchingType: 0, allowCachedResponse: 0 },
				{ queryType: 2, matchingType: 2, allowCachedResponse: 0 },
				{ queryType: 0, matchingType: 2, allowCachedResponse: 0 },
			]

			let foundAnyItems = false
			let lastError = null
			for (const strategy of queryStrategies) {
				const opts = { ...baseOptions, ...strategy }
				const r = await adapter.queryAll(opts)
				const itemCount = r.items?.length || 0
				if (r.ok) {
					if (itemCount > 0) {
						result = r
						foundAnyItems = true
						break
					}
				} else if (r.errMsg) {
					lastError = r.errMsg
				}
			}

			if (!foundAnyItems) {
				console.log('[workshop-templates] Public queries found 0 official items, checking user published items...')
				try {
					const userItemsResult = await adapter.queryUserItems('published')
					if (userItemsResult.ok && userItemsResult.items && userItemsResult.items.length > 0) {
						console.log('[workshop-templates] User published', userItemsResult.items.length, 'items:')
						for (const item of userItemsResult.items) {
							console.log('  -', item.publishedFileId + ':', '"' + item.title + '"',
								'tags=', JSON.stringify(item.tags), 'isOfficial=', item.isOfficial, 'visibility=', item.visibility)
						}
						const officialItems = userItemsResult.items.filter(i => i.tags?.includes('official') || i.isOfficial)
						if (officialItems.length > 0) {
							console.log('[workshop-templates] Found', officialItems.length, 'official items in user inventory')
							result = { ok: true, items: officialItems, totalResults: officialItems.length }
							foundAnyItems = true
						}
					}
				} catch (err) {
					console.error('[workshop-templates] queryUserItems failed:', err.message)
				}
			}

			if (!foundAnyItems && isDev) {
				console.log('[workshop-templates] All Steam queries returned 0 official items, falling back to Mock data')
				adapter = createMockUgcAdapter()
				result = await adapter.queryAll({ ...baseOptions })
			}

			console.log('[workshop-templates] Final result:', result.ok ? `${result.items?.length || 0} items` : `error: ${result.errMsg || lastError || 'unknown'}`)
			return result
		} catch (err) {
			console.error('[workshop-templates] queryOfficial error:', err.message)
			const isDev = !!process.env.ELECTRON_DEV
			if (isDev) {
				const adapter = createMockUgcAdapter()
				return await adapter.queryAll({ tag: 'official', limit: options.limit || 50 })
			}
			return { ok: false, items: [], totalResults: 0, errMsg: err.message }
		}
	}

	_listDirectoryRecursive(dirPath, prefix = '') {
		const results = []
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true })
			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name)
				const displayPath = prefix ? `${prefix}/${entry.name}` : entry.name
				if (entry.isDirectory()) {
					results.push({ path: displayPath, type: 'dir', fullPath })
					results.push(...this._listDirectoryRecursive(fullPath, displayPath))
				} else {
					try {
						const stat = fs.statSync(fullPath)
						results.push({ path: displayPath, type: 'file', size: stat.size, fullPath })
					} catch {
						results.push({ path: displayPath, type: 'file', size: 0, fullPath })
					}
				}
			}
		} catch (err) {
			console.warn('[workshop-templates] Failed to list directory:', dirPath, err.message)
		}
		return results
	}

	_findContentRoot(startPath) {
		const packageFileName = 'aiwf-project-package.json'

		if (fs.existsSync(path.join(startPath, packageFileName))) {
			console.log('[workshop-templates] Found package file at root:', startPath)
			return startPath
		}

		console.log('[workshop-templates] Searching for content root in subdirectories...')
		const entries = this._listDirectoryRecursive(startPath)
		for (const entry of entries) {
			if (entry.type === 'file' && entry.path.endsWith(packageFileName)) {
				const contentRoot = path.dirname(entry.fullPath)
				console.log('[workshop-templates] Found package file in subdirectory, content root:', contentRoot)
				return contentRoot
			}
		}

		console.log('[workshop-templates] Package file not found in any subdirectory, using startPath as root')
		return startPath
	}

	async downloadItem(publishedFileId) {
		try {
			console.log('[workshop-templates] downloadItem start:', { publishedFileId })

			const adapter = this.getAdapter()

			console.log('[workshop-templates] Checking existing install before download...')
			const preInstallInfo = adapter.getItemInstallInfo(publishedFileId)
			console.log('[workshop-templates] Pre-download install info:', JSON.stringify({
				ok: preInstallInfo?.ok,
				installed: preInstallInfo?.installed,
				installPath: preInstallInfo?.installPath,
				errMsg: preInstallInfo?.errMsg
			}))

			const downloadResult = await adapter.downloadItem(publishedFileId)
			if (!downloadResult.ok) {
				console.error('[workshop-templates] downloadItem failed:', downloadResult.errMsg)
				return downloadResult
			}

			if (downloadResult.zipBuffer) {
				console.log('[workshop-templates] downloadItem using direct buffer from adapter, size:', downloadResult.zipBuffer.length)
				return {
					ok: true,
					publishedFileId,
					metadata: downloadResult.metadata,
					zipBuffer: downloadResult.zipBuffer,
					coverBuffer: downloadResult.coverBuffer,
				}
			}

			const installInfo = await adapter.getItemInstallInfo(publishedFileId)
			console.log('[workshop-templates] Post-download install info:', JSON.stringify({
				ok: installInfo?.ok,
				installed: installInfo?.installed,
				installPath: installInfo?.installPath,
				errMsg: installInfo?.errMsg
			}))

			if (!installInfo.ok || !installInfo.installPath) {
				console.error('[workshop-templates] downloadItem failed to get install path:', installInfo.errMsg)
				return { ok: false, errMsg: 'Failed to get install path' }
			}

			const installPath = installInfo.installPath
			console.log('[workshop-templates] downloadItem install path:', installPath)

			let contentRoot = installPath
			try {
				if (fs.existsSync(installPath)) {
					console.log('[workshop-templates] Recursive directory listing of installPath:')
					const allEntries = this._listDirectoryRecursive(installPath)
					for (const entry of allEntries) {
						const indent = entry.type === 'dir' ? '[DIR] ' : '      '
						const sizeStr = entry.type === 'file' ? ` (${entry.size} bytes)` : ''
						console.log(`[workshop-templates]   ${indent}${entry.path}${sizeStr}`)
					}

					contentRoot = this._findContentRoot(installPath)
					console.log('[workshop-templates] Using content root:', contentRoot)
				} else {
					console.error('[workshop-templates] installPath does not exist:', installPath)
				}
			} catch (err) {
				console.warn('[workshop-templates] Failed to list installPath:', err.message)
				console.warn(err.stack)
			}

			let metadata = null
			const metadataPath = path.join(contentRoot, 'metadata.json')
			if (fs.existsSync(metadataPath)) {
				try {
					const metadataContent = fs.readFileSync(metadataPath, 'utf8')
					metadata = JSON.parse(metadataContent)
					console.log('[workshop-templates] downloadItem metadata:', metadata)
				} catch (err) {
					console.warn('[workshop-templates] Failed to read metadata.json:', err.message)
				}
			} else {
				const altMetadataPath = path.join(installPath, 'metadata.json')
				if (fs.existsSync(altMetadataPath)) {
					try {
						const metadataContent = fs.readFileSync(altMetadataPath, 'utf8')
						metadata = JSON.parse(metadataContent)
						console.log('[workshop-templates] downloadItem metadata (from installPath root):', metadata)
					} catch (err) {
						console.warn('[workshop-templates] Failed to read metadata.json from root:', err.message)
					}
				}
			}

			let zipBuffer = null

			const zipPath = path.join(contentRoot, 'template.zip')
			if (fs.existsSync(zipPath)) {
				try {
					zipBuffer = fs.readFileSync(zipPath)
					console.log('[workshop-templates] downloadItem found pre-built template.zip, size:', zipBuffer.length)
				} catch (err) {
					console.warn('[workshop-templates] Failed to read template.zip:', err.message)
				}
			}

			if (!zipBuffer) {
				const packageJsonPath = path.join(contentRoot, 'aiwf-project-package.json')
				const hasPackageJson = fs.existsSync(packageJsonPath)
				console.log('[workshop-templates] Checking for aiwf-project-package.json at:', packageJsonPath, 'exists:', hasPackageJson)

				if (hasPackageJson) {
					console.log('[workshop-templates] Found aiwf-project-package.json, packing directory contents into zip...')
					try {
						let JSZip
						try {
							JSZip = require('jszip')
							console.log('[workshop-templates] Loaded jszip via local require')
						} catch (requireErr) {
							console.warn('[workshop-templates] Failed to require jszip locally:', requireErr.message)
							try {
								const rootPackagePath = path.resolve(__dirname, '../../../../package.json')
								console.log('[workshop-templates] Trying root package.json at:', rootPackagePath)
								const rootRequire = createRequire(rootPackagePath)
								JSZip = rootRequire('jszip')
								console.log('[workshop-templates] Loaded jszip via root require')
							} catch (rootRequireErr) {
								console.error('[workshop-templates] Failed to require jszip from root:', rootRequireErr.message)
								throw requireErr
							}
						}

						const zip = new JSZip()

						const addDirToZip = (dirPath, zipFolder) => {
							const entries = fs.readdirSync(dirPath, { withFileTypes: true })
							for (const entry of entries) {
								if (entry.name === 'metadata.json') continue
								const fullPath = path.join(dirPath, entry.name)
								if (entry.isDirectory()) {
									addDirToZip(fullPath, zipFolder.folder(entry.name))
								} else {
									const content = fs.readFileSync(fullPath)
									zipFolder.file(entry.name, content)
									console.log('[workshop-templates]  added to zip:', entry.name, content.length, 'bytes')
								}
							}
						}

						addDirToZip(contentRoot, zip)
						zipBuffer = await zip.generateAsync({
							type: 'nodebuffer',
							compression: 'DEFLATE',
							compressionOptions: { level: 6 }
						})
						console.log('[workshop-templates] Directory packed into zip, size:', zipBuffer.length)
					} catch (err) {
						console.error('[workshop-templates] Failed to pack directory into zip:', err.message)
						console.error(err.stack)
					}
				} else {
					console.error('[workshop-templates] aiwf-project-package.json not found in content root!')
					const allFiles = this._listDirectoryRecursive(installPath)
					const jsonFiles = allFiles.filter(e => e.type === 'file' && e.path.endsWith('.json'))
					console.log('[workshop-templates] JSON files in install path:', jsonFiles.map(f => f.path))
				}
			}

			let coverBuffer = null
			const possibleCoverPaths = [
				path.join(contentRoot, 'preview.png'),
				path.join(contentRoot, 'cover.png'),
				path.join(installPath, 'preview.png'),
				path.join(installPath, 'cover.png'),
			]
			for (const coverPath of possibleCoverPaths) {
				if (fs.existsSync(coverPath)) {
					try {
						coverBuffer = fs.readFileSync(coverPath)
						console.log('[workshop-templates] downloadItem cover found at:', coverPath, 'size:', coverBuffer.length)
						break
					} catch (err) {
						console.warn('[workshop-templates] Failed to read cover:', coverPath, err.message)
					}
				}
			}

			if (!zipBuffer) {
				console.error('[workshop-templates] Failed to create zip buffer - no package data found')
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
			console.error(err.stack)
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
