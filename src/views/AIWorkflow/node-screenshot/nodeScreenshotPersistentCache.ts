/**
 * Node Screenshot Persistent Cache - 使用IndexedDB持久化存储截图
 *
 * 跨刷新/重启保留截图缓存，避免每次进入蓝图都重新预热截图。
 * 按项目ID和蓝图ID隔离缓存，使用版本hash失效机制。
 *
 * @deprecated 新架构不再使用截图预热系统。本模块默认走 noop 实现，
 *             仅当 DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP='1' 时恢复旧逻辑。
 */

import { isLegacyScreenshotWarmupEnabled } from '../deprecation'

const DB_NAME = 'dvs_node_screenshots'
const DB_VERSION = 1
const STORE_NAME = 'screenshots'

interface PersistedScreenshotEntry {
	key: string
	nodeId: string
	projectId: string
	blueprintId: string
	version: string
	theme: 'dark' | 'light'
	dataUrl: string
	width: number
	height: number
	capturedAt: number
}

const extractThemeFromVersion = (version: string): 'dark' | 'light' => {
	const m = version.match(/^theme:(dark|light)/)
	return m ? (m[1] as 'dark' | 'light') : 'dark'
}

export const makeDiskCacheKey = (nodeId: string, theme: 'dark' | 'light'): string => {
	return `${nodeId}::${theme}`
}

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
	if (dbPromise) return dbPromise

	dbPromise = new Promise((resolve, reject) => {
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION)
			req.onupgradeneeded = () => {
				const db = req.result
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
					store.createIndex('projectBlueprint', ['projectId', 'blueprintId'], { unique: false })
					store.createIndex('capturedAt', 'capturedAt', { unique: false })
				}
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		} catch (err) {
			reject(err)
		}
	})

	return dbPromise
}

const makeKey = (
	projectId: string,
	blueprintId: string,
	nodeId: string,
	version: string
): string => {
	return `${projectId}:${blueprintId}:${nodeId}:${version}`
}

export const saveScreenshotToDisk = async (
	projectId: string,
	blueprintId: string,
	nodeId: string,
	version: string,
	dataUrl: string,
	width: number,
	height: number
): Promise<void> => {
	if (!isLegacyScreenshotWarmupEnabled()) return Promise.resolve()
	return _legacy_saveScreenshotToDisk(projectId, blueprintId, nodeId, version, dataUrl, width, height)
}

const _legacy_saveScreenshotToDisk = async (
	projectId: string,
	blueprintId: string,
	nodeId: string,
	version: string,
	dataUrl: string,
	width: number,
	height: number
): Promise<void> => {
	try {
		const db = await openDb()
		const tx = db.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const entry: PersistedScreenshotEntry = {
			key: makeKey(projectId, blueprintId, nodeId, version),
			nodeId,
			projectId,
			blueprintId,
			version,
			theme: extractThemeFromVersion(version),
			dataUrl,
			width,
			height,
			capturedAt: Date.now()
		}
		store.put(entry)
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch (err) {
		console.warn('[ScreenshotPersist] save failed:', err)
	}
}

export const loadScreenshotFromDisk = async (
	projectId: string,
	blueprintId: string,
	nodeId: string,
	version: string
): Promise<string | null> => {
	if (!isLegacyScreenshotWarmupEnabled()) return Promise.resolve(null)
	return _legacy_loadScreenshotFromDisk(projectId, blueprintId, nodeId, version)
}

const _legacy_loadScreenshotFromDisk = async (
	projectId: string,
	blueprintId: string,
	nodeId: string,
	version: string
): Promise<string | null> => {
	try {
		const db = await openDb()
		const tx = db.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const key = makeKey(projectId, blueprintId, nodeId, version)
		const req = store.get(key)
		const result = await new Promise<PersistedScreenshotEntry | undefined>((resolve, reject) => {
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		})
		return result?.dataUrl || null
	} catch (err) {
		console.warn('[ScreenshotPersist] load failed:', err)
		return null
	}
}

export const loadAllScreenshotsForBlueprint = async (
	projectId: string,
	blueprintId: string
): Promise<
	Map<
		string,
		{
			dataUrl: string
			version: string
			width: number
			height: number
			theme: 'dark' | 'light'
			nodeId: string
			capturedAt: number
		}
	>
> => {
	if (!isLegacyScreenshotWarmupEnabled()) return Promise.resolve(new Map())
	return _legacy_loadAllScreenshotsForBlueprint(projectId, blueprintId)
}

const _legacy_loadAllScreenshotsForBlueprint = async (
	projectId: string,
	blueprintId: string
): Promise<
	Map<
		string,
		{
			dataUrl: string
			version: string
			width: number
			height: number
			theme: 'dark' | 'light'
			nodeId: string
			capturedAt: number
		}
	>
> => {
	const result = new Map<
		string,
		{
			dataUrl: string
			version: string
			width: number
			height: number
			theme: 'dark' | 'light'
			nodeId: string
			capturedAt: number
		}
	>()
	try {
		const db = await openDb()
		const tx = db.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const index = store.index('projectBlueprint')
		const range = IDBKeyRange.only([projectId, blueprintId])
		const req = index.openCursor(range)
		await new Promise<void>((resolve, reject) => {
			req.onsuccess = () => {
				const cursor = req.result
				if (cursor) {
					const entry = cursor.value as PersistedScreenshotEntry
					const theme = entry.theme || extractThemeFromVersion(entry.version)
					const themeKey = makeDiskCacheKey(entry.nodeId, theme)
					const existing = result.get(themeKey)
					if (!existing || entry.capturedAt > existing.capturedAt) {
						result.set(themeKey, {
							dataUrl: entry.dataUrl,
							version: entry.version,
							width: entry.width,
							height: entry.height,
							theme,
							nodeId: entry.nodeId,
							capturedAt: entry.capturedAt
						})
					}
					cursor.continue()
				} else {
					resolve()
				}
			}
			req.onerror = () => reject(req.error)
		})
	} catch (err) {
		console.warn('[ScreenshotPersist] bulk load failed:', err)
	}
	return result
}

export const cleanupOldScreenshots = async (
	maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<void> => {
	if (!isLegacyScreenshotWarmupEnabled()) return Promise.resolve()
	return _legacy_cleanupOldScreenshots(maxAgeMs)
}

const _legacy_cleanupOldScreenshots = async (
	maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<void> => {
	try {
		const cutoff = Date.now() - maxAgeMs
		const db = await openDb()
		const tx = db.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const index = store.index('capturedAt')
		const range = IDBKeyRange.upperBound(cutoff)
		const req = index.openCursor(range)
		req.onsuccess = () => {
			const cursor = req.result
			if (cursor) {
				cursor.delete()
				cursor.continue()
			}
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch (err) {
		console.warn('[ScreenshotPersist] cleanup failed:', err)
	}
}
