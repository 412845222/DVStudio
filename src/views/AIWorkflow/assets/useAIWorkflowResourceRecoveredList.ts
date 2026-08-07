import {
	normalizeForBindingMatch,
	extractAssetIdFromUrl
} from './useAIWorkflowResourceUrlClassifier'
import { parseDwebProjectAssetUrl } from './useAIWorkflow404Fallback'

/**
 * O5：跨会话"已自动恢复 URL"持久化
 *
 * 与 useAIWorkflowResourceIgnoreList.ts 结构一致：双源 projectId 解析 + 全局桶 + 规格化 URL 命中。
 * 用于 handle404Error 入口处 early return —— 即使项目保存失败 / 用户手动改回旧 URL，
 * 跨会话也不再重复弹恢复通知。
 *
 * localStorage key:   `DVS_RECOVERED_ASSETS_${bucketId}`
 * value: JSON -> { v: 1, urls: Record<string, number> }  // key=normUrl, value=timestamp
 */

const KEY_PREFIX = 'DVS_RECOVERED_ASSETS_'
const GLOBAL_BUCKET_ID = '__global__'

type PersistedRecovered = {
	v: 1
	updatedAt: number
	/** key = 规格化 URL, value = timestamp_ms */
	urls: Record<string, number>
	/** assetId 命中桶（URL 路径变化但 asset 本身不变时仍可命中） */
	assetIds?: Record<string, number>
}

const _empty = (): PersistedRecovered => ({
	v: 1,
	updatedAt: 0,
	urls: Object.create(null) as Record<string, number>,
	assetIds: Object.create(null) as Record<string, number>
})

/* ============================================================
 * 内部辅助（复用 ignoreList 同一模式）
 * ============================================================ */

function safeStorageKeyPart(raw: string | number | null | undefined): string {
	const s = raw == null ? '' : String(raw).trim()
	if (!s) return GLOBAL_BUCKET_ID
	const sanitized = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
	return sanitized || GLOBAL_BUCKET_ID
}

function _lightParseProjectIdFromUrl(url: string | null | undefined): string | null {
	const s = String(url || '').trim()
	if (!s) return null
	// 优先从 dweb://project-assets?projectId=X 解析
	const parsed = parseDwebProjectAssetUrl(s)
	if (parsed?.projectId != null) return String(parsed.projectId)
	// 兜底路径模式
	const m = s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/+project-assets\/+([^/?#]+)/i)
	if (!m) return null
	try {
		const id = decodeURIComponent(m[1] || '').trim()
		return id || null
	} catch {
		return null
	}
}

function resolveBucketIds(
	preferredFromVue: string | number | null | undefined,
	fallbackFromUrl?: string | null
): string[] {
	const out: string[] = []
	const p1 = preferredFromVue == null ? '' : String(preferredFromVue).trim()
	if (p1) out.push(safeStorageKeyPart(p1))
	const p2 = _lightParseProjectIdFromUrl(fallbackFromUrl || '')
	if (p2) {
		const key2 = safeStorageKeyPart(p2)
		if (!out.includes(key2)) out.push(key2)
	}
	if (out.length === 0 || !out.includes(GLOBAL_BUCKET_ID)) {
		out.push(GLOBAL_BUCKET_ID)
	}
	return out
}

function _projectKeyForBucket(bucketId: string): string {
	return `${KEY_PREFIX}${bucketId}`
}

function _safeParse(raw: string | null): PersistedRecovered {
	if (!raw) return _empty()
	try {
		const obj = JSON.parse(raw)
		if (!obj || typeof obj !== 'object') return _empty()
		const v = Number(obj.v) || 0
		if (v < 1) return _empty()
		const pickObj = (o: any, fallback: Record<string, any> = Object.create(null)) =>
			o && typeof o === 'object' ? (o as Record<string, any>) : fallback
		return {
			v: 1,
			updatedAt: Number(obj.updatedAt) || 0,
			urls: pickObj(obj.urls),
			assetIds: pickObj(obj.assetIds, Object.create(null))
		}
	} catch {
		return _empty()
	}
}

function _readPersisted(key: string): PersistedRecovered {
	try {
		return _safeParse(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
	} catch {
		return _empty()
	}
}

function _writePersisted(key: string, data: PersistedRecovered): void {
	try {
		data.updatedAt = Date.now()
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, JSON.stringify(data))
		}
	} catch {
		/* ignore quota / private mode */
	}
}

/* ============================================================
 * 公共 API
 * ============================================================ */

/**
 * 加载所有桶的持久化 recovered URL 集合，返回规格化 URL Set。
 * 命中任意一个桶即视为"已恢复过"。
 */
export function loadPersistedRecoveredUrls(
	projectId: string | number | null | undefined,
	fallbackFromUrl?: string | null
): Set<string> {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl)
	const result = new Set<string>()
	for (const bucket of buckets) {
		const data = _readPersisted(_projectKeyForBucket(bucket))
		for (const url of Object.keys(data.urls)) {
			if (data.urls[url] != null) result.add(url)
		}
	}
	return result
}

/**
 * 判断给定的 raw URL 是否已被标记为"已自动恢复"。
 * 使用规格化比较（与 ignoreList 一致）。
 */
export function isUrlRecovered(
	snap: Set<string> | null | undefined,
	url: string | null | undefined
): boolean {
	if (!snap || snap.size === 0) return false
	const norm = normalizeForBindingMatch(url)
	if (!norm) return false
	if (snap.has(norm)) return true
	// 兜底：assetId 匹配
	const assetId = extractAssetIdFromUrl(url)
	if (assetId && snap.has(assetId)) return true
	return false
}

/**
 * 标记一个 URL 为"已自动恢复"。
 * 双写所有桶（与 ignoreList 一致），确保跨 projectId 变化也能命中。
 */
export function markUrlRecovered(
	projectId: string | number | null | undefined,
	url: string,
	fallbackFromUrl?: string | null
): void {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl)
	const norm = normalizeForBindingMatch(url)
	const assetId = extractAssetIdFromUrl(url)
	const now = Date.now()
	for (const bucket of buckets) {
		const key = _projectKeyForBucket(bucket)
		const data = _readPersisted(key)
		if (norm) data.urls[norm] = now
		if (assetId) {
			if (!data.assetIds) data.assetIds = Object.create(null) as Record<string, number>
			data.assetIds[assetId] = now
		}
		_writePersisted(key, data)
	}
}
