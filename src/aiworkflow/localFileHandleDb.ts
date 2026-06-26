interface FileSystemHandleLike {
	kind: 'file' | 'directory'
	name: string
	queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
	requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
}

type AnyFileHandle = FileSystemHandleLike

const DB_NAME = 'dweb-aiworkflow-local-files'
const DB_VERSION = 1
const STORE_NAME = 'fileHandles'

const openDb = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('indexedDB is not available'))
			return
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME)
			}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
	})
}

export const canUseFileSystemHandles = (): boolean => {
	return typeof (window as unknown as { showOpenFilePicker?: Function }).showOpenFilePicker === 'function'
}

export const putLocalFileHandle = async (key: string, handle: unknown): Promise<boolean> => {
	const k = String(key || '').trim()
	if (!k || !handle) return false
	try {
		const db = await openDb()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error ?? new Error('tx failed'))
			tx.objectStore(STORE_NAME).put(handle, k)
		})
		return true
	} catch {
		return false
	}
}

export const getLocalFileHandle = async (key: string): Promise<unknown | null> => {
	const k = String(key || '').trim()
	if (!k) return null
	try {
		const db = await openDb()
		const v = await new Promise<unknown>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly')
			tx.onerror = () => reject(tx.error ?? new Error('tx failed'))
			const req = tx.objectStore(STORE_NAME).get(k)
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error ?? new Error('get failed'))
		})
		return v ?? null
	} catch {
		return null
	}
}

export const deleteLocalFileHandle = async (key: string): Promise<void> => {
	const k = String(key || '').trim()
	if (!k) return
	try {
		const db = await openDb()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error ?? new Error('tx failed'))
			tx.objectStore(STORE_NAME).delete(k)
		})
	} catch {
		// ignore
	}
}

export const ensureReadPermission = async (handle: unknown): Promise<boolean> => {
	if (!handle || typeof handle !== 'object') return false
	try {
		const qp = (handle as FileSystemHandleLike).queryPermission
		const rp = (handle as FileSystemHandleLike).requestPermission
		if (typeof qp === 'function') {
			const s = await qp.call(handle, { mode: 'read' })
			if (s === 'granted') return true
		}
		if (typeof rp === 'function') {
			const s = await rp.call(handle, { mode: 'read' })
			return s === 'granted'
		}
		return true
	} catch {
		return false
	}
}
