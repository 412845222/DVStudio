type AnyFileHandle = any

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
	// Detect minimal support; we still treat handle types as any.
	return typeof (window as any).showOpenFilePicker === 'function'
}

export const putLocalFileHandle = async (key: string, handle: AnyFileHandle): Promise<boolean> => {
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

export const getLocalFileHandle = async (key: string): Promise<AnyFileHandle | null> => {
	const k = String(key || '').trim()
	if (!k) return null
	try {
		const db = await openDb()
		const v = await new Promise<any>((resolve, reject) => {
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

export const ensureReadPermission = async (handle: AnyFileHandle): Promise<boolean> => {
	if (!handle) return false
	try {
		const qp = (handle as any).queryPermission
		const rp = (handle as any).requestPermission
		if (typeof qp === 'function') {
			const s = await qp.call(handle, { mode: 'read' })
			if (s === 'granted') return true
		}
		if (typeof rp === 'function') {
			const s = await rp.call(handle, { mode: 'read' })
			return s === 'granted'
		}
		// If permission API is absent, assume usable.
		return true
	} catch {
		return false
	}
}
