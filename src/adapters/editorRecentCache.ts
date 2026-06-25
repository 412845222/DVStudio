import type { EditorSavePayload, EditorSnapshot } from '../core/editor/types'
import { parseProjectPackageV1 } from '../core/project/package/serialize'
import { isRecord, isNumber, isString, safeJsonParse } from '../types/utils'

type RecentEditCacheV1 = {
	schemaVersion: 1
	savedAt: number
	projectPackageJson: string
}

const STORAGE_KEY = 'dvs:recent-edit-cache:v1'

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

const isRecentEditCacheV1 = (v: unknown): v is RecentEditCacheV1 => {
	if (!isRecord(v)) return false
	if (v.schemaVersion !== 1) return false
	if (!isNumber(v.savedAt)) return false
	if (!isString(v.projectPackageJson)) return false
	return true
}

export const editorRecentCache = {
	save(payload: EditorSavePayload) {
		if (!isBrowser()) return
		const projectPackageJson = String(payload.projectPackageJson ?? '')
		if (!projectPackageJson) return
		const data: RecentEditCacheV1 = {
			schemaVersion: 1,
			savedAt: Number(payload.savedAt ?? Date.now()),
			projectPackageJson,
		}
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
		} catch (err) {
			console.warn('[dvs] save recent edit cache failed', err)
		}
	},

	peekSavedAt(): number | null {
		if (!isBrowser()) return null
		try {
			const raw = localStorage.getItem(STORAGE_KEY)
			if (!raw) return null
			const parsed = safeJsonParse(raw, isRecentEditCacheV1, null)
			if (!parsed) return null
			const savedAt = Number(parsed.savedAt)
			return Number.isFinite(savedAt) ? savedAt : null
		} catch {
			return null
		}
	},

	read(): { savedAt: number; snapshot: EditorSnapshot; projectPackageJson: string } | null {
		if (!isBrowser()) return null
		try {
			const raw = localStorage.getItem(STORAGE_KEY)
			if (!raw) return null
			const parsed = safeJsonParse(raw, isRecentEditCacheV1, null)
			if (!parsed) return null
			const savedAt = Number(parsed.savedAt)
			const projectPackageJson = String(parsed.projectPackageJson)
			if (!Number.isFinite(savedAt) || !projectPackageJson) return null
			const pkg = parseProjectPackageV1(projectPackageJson)
			return { savedAt, snapshot: pkg.project.snapshot, projectPackageJson }
		} catch (err) {
			console.warn('[dvs] read recent edit cache failed', err)
			return null
		}
	},

	clear() {
		if (!isBrowser()) return
		try {
			localStorage.removeItem(STORAGE_KEY)
		} catch {
			// ignore
		}
	},
}
