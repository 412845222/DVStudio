import type { ResourceBindingSource } from './useAIWorkflow404Fallback'
import {
	normalizeForBindingMatch,
	extractAssetIdFromUrl,
} from './useAIWorkflowResourceUrlClassifier'

/**
 * 持久化存储的单条忽略记录（removed 集合）
 */
type RemovedIgnoreEntry = {
	at: number
	assetName?: string
	sources?: Array<{ type: ResourceBindingSource['type']; resourceId?: string; nodeId?: string; field?: string }>
	normUrl?: string        // 新增（v1 兼容，可选）：规格化 URL
	assetId?: string | null // 新增（v1 兼容，可选）：稳定资产 ID
}

/**
 * 持久化存储的单条忽略记录（cancelled 集合，含过期时间以便自动清理）
 */
type CancelledIgnoreEntry = {
	at: number
	/** 过期时间戳（ms since epoch）。到达后自动从集合中剔除，允许再次触发检查。默认点击"暂不处理"后 30 天。 */
	expireAt: number
	assetName?: string
	normUrl?: string        // 新增
	assetId?: string | null // 新增
}

/**
 * localStorage 持久化对象结构（v1，向后兼容：所有新增字段皆可选）
 */
type PersistedIgnoreList = {
	version: 1
	updatedAt: number
	removed: Record<string, RemovedIgnoreEntry>
	cancelled: Record<string, CancelledIgnoreEntry>
	/* 规格化后的 Sets：v1 新增，可选，有则优先命中 */
	normRemoved?: Record<string, RemovedIgnoreEntry>
	normCancelled?: Record<string, CancelledIgnoreEntry>
	/* assetId 命中桶：v1 新增，可选 */
	assetIdRemoved?: Record<string, RemovedIgnoreEntry>
	assetIdCancelled?: Record<string, CancelledIgnoreEntry>
}

const KEY_PREFIX = 'DVS_IGNORED_MISSING_ASSETS_'
const CANCELLED_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
const GLOBAL_BUCKET_ID = '__global__'

/**
 * 忽略表在内存中的快取：2 个精确 Set + 2 个规格化 Set + 2 个 assetId Set 方便 O(1) 命中判断。
 * meta 中保留完整结构便于面板 UI 展示"当前项目忽略了哪些 URL"。
 */
export type IgnoreListSnapshot = {
	projectId: string | null
	/** 精确 URL（raw 原样）命中桶 */
	removed: Set<string>
	cancelled: Set<string>
	/** O3.2 新增：规格化 URL 命中桶（大小写/分隔符/百分号编码等归一化） */
	normRemoved: Set<string>
	normCancelled: Set<string>
	/** O3.2 新增：稳定资产 ID 命中桶（URL 路径变化但 asset 本身不变时仍可命中） */
	assetIdRemoved: Set<string>
	assetIdCancelled: Set<string>
	meta: PersistedIgnoreList
	/** 仅在 session 内有效的 URL（projectId 缺失时使用，不写 localStorage） */
	sessionOnly: boolean
}

const _emptyMeta = (): PersistedIgnoreList => ({
	version: 1,
	updatedAt: 0,
	removed: Object.create(null) as Record<string, RemovedIgnoreEntry>,
	cancelled: Object.create(null) as Record<string, CancelledIgnoreEntry>,
	normRemoved: Object.create(null) as Record<string, RemovedIgnoreEntry>,
	normCancelled: Object.create(null) as Record<string, CancelledIgnoreEntry>,
	assetIdRemoved: Object.create(null) as Record<string, RemovedIgnoreEntry>,
	assetIdCancelled: Object.create(null) as Record<string, CancelledIgnoreEntry>,
})

const _sessionStore = new Map<string, PersistedIgnoreList>()

/* ============================================================
 * 内部辅助
 * ============================================================ */

/**
 * 确保 localStorage key 不包含特殊字符。
 * 中文/斜杠/反斜杠/空格/冒号全部替换成下划线，长度截断 80 避免 key 过长。
 */
function safeStorageKeyPart(raw: string | number | null | undefined): string {
	const s = raw == null ? '' : String(raw).trim()
	if (!s) return GLOBAL_BUCKET_ID
	const sanitized = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
	return sanitized || GLOBAL_BUCKET_ID
}

/**
 * O3.1：双源 projectId 解析
 *   1. 优先：调用方传入的 currentProjectId.value（Vue 侧的权威 projectId）
 *   2. 回退：从 dweb URL 本身解析出的 projectId（dweb://project-assets/<id>/...）
 *   3. 最终兜底：`__global__`（绝不允许出现 null / "null" / "" / "undefined" 字符串污染 key）
 *
 * 返回需要双写 / 并集读取的所有 bucket id 列表（至少 1 个，最多 2 个）。
 */
function resolveBucketIds(
	preferredFromVue: string | number | null | undefined,
	fallbackFromUrl?: string | null
): string[] {
	const out: string[] = []
	let primary: string | null = null
	const p1 = preferredFromVue == null ? '' : String(preferredFromVue).trim()
	if (p1) {
		primary = safeStorageKeyPart(p1)
		out.push(primary)
	}
	const p2 = _lightParseProjectIdFromUrl(fallbackFromUrl || '')
	if (p2) {
		const key2 = safeStorageKeyPart(p2)
		if (!out.includes(key2)) out.push(key2)
		if (!primary) primary = key2
	}
	if (out.length === 0 || !out.includes(GLOBAL_BUCKET_ID)) {
		out.push(GLOBAL_BUCKET_ID)
	}
	return out
}

/**
 * 轻量级 dweb URL projectId 解析（不依赖 useAIWorkflow404Fallback，避免循环依赖）。
 * 只用于 projectId fallback 解析，不做完整 URL 解析。
 * 支持格式：dweb://project-assets/<projectId>/xxx/yyy（忽略 query/hash）。
 */
function _lightParseProjectIdFromUrl(url: string | null | undefined): string | null {
	const s = String(url || '').trim()
	if (!s) return null
	const m = s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/+project-assets\/+([^/?#]+)/i)
	if (!m) return null
	try {
		const id = decodeURIComponent(m[1] || '').trim()
		return id || null
	} catch {
		return null
	}
}

function _projectKeyForBucket(bucketId: string): string {
	return `${KEY_PREFIX}${bucketId}`
}

function _safeParse(raw: string | null): PersistedIgnoreList {
	if (!raw) return _emptyMeta()
	try {
		const obj = JSON.parse(raw)
		if (!obj || typeof obj !== 'object') return _emptyMeta()
		const version = Number(obj.version) || 0
		if (version < 1) return _emptyMeta()
		const pickObj = (o: any, fallback: Record<string, any> = Object.create(null)) =>
			o && typeof o === 'object' ? (o as Record<string, any>) : fallback
		return {
			version: 1,
			updatedAt: Number(obj.updatedAt) || 0,
			removed: pickObj(obj.removed),
			cancelled: pickObj(obj.cancelled),
			normRemoved: pickObj(obj.normRemoved, Object.create(null)),
			normCancelled: pickObj(obj.normCancelled, Object.create(null)),
			assetIdRemoved: pickObj(obj.assetIdRemoved, Object.create(null)),
			assetIdCancelled: pickObj(obj.assetIdCancelled, Object.create(null)),
		}
	} catch {
		return _emptyMeta()
	}
}

function _pruneExpiredCancelled(meta: PersistedIgnoreList): boolean {
	let changed = false
	const now = Date.now()
	const scan = (rec: Record<string, CancelledIgnoreEntry> | undefined) => {
		if (!rec) return
		for (const url of Object.keys(rec)) {
			const e = rec[url]
			if (e && Number(e.expireAt) && now >= Number(e.expireAt)) {
				delete rec[url]
				changed = true
			}
		}
	}
	scan(meta.cancelled)
	scan(meta.normCancelled)
	scan(meta.assetIdCancelled)
	return changed
}

function _readPersisted(key: string): PersistedIgnoreList {
	let raw: string | null = null
	try {
		raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
	} catch {
		raw = null
	}
	const meta = _safeParse(raw)
	if (_pruneExpiredCancelled(meta)) {
		try {
			if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(meta))
		} catch {
			/* ignore quota */
		}
	}
	return meta
}

function _writePersisted(key: string, meta: PersistedIgnoreList): boolean {
	try {
		if (typeof localStorage === 'undefined') return false
		meta.updatedAt = Date.now()
		_pruneExpiredCancelled(meta)
		localStorage.setItem(key, JSON.stringify(meta))
		return true
	} catch {
		// localStorage 不可用 / 容量超限
		return false
	}
}

/**
 * 合并多个持久化元（OR 关系取并集）：
 * 加载时同时读取 项目桶 + 全局桶，合并成一个 snapshot，保证时序错位下也能命中。
 */
function _mergeMetas(metas: PersistedIgnoreList[]): PersistedIgnoreList {
	if (metas.length === 0) return _emptyMeta()
	if (metas.length === 1) return metas[0]
	const merged = _emptyMeta()
	const copyRemoved = (from: Record<string, RemovedIgnoreEntry>, to: Record<string, RemovedIgnoreEntry>) => {
		for (const k of Object.keys(from)) {
			if (!(k in to)) to[k] = from[k]
		}
	}
	const copyCancelled = (from: Record<string, CancelledIgnoreEntry>, to: Record<string, CancelledIgnoreEntry>) => {
		for (const k of Object.keys(from)) {
			if (!(k in to)) to[k] = from[k]
		}
	}
	for (const m of metas) {
		copyRemoved(m.removed, merged.removed)
		copyCancelled(m.cancelled, merged.cancelled)
		if (m.normRemoved) copyRemoved(m.normRemoved, merged.normRemoved!)
		if (m.normCancelled) copyCancelled(m.normCancelled, merged.normCancelled!)
		if (m.assetIdRemoved) copyRemoved(m.assetIdRemoved, merged.assetIdRemoved!)
		if (m.assetIdCancelled) copyCancelled(m.assetIdCancelled, merged.assetIdCancelled!)
		if (m.updatedAt > merged.updatedAt) merged.updatedAt = m.updatedAt
	}
	return merged
}

function _toSnapshot(
	projectId: string | null,
	meta: PersistedIgnoreList,
	sessionOnly: boolean
): IgnoreListSnapshot {
	const removed = new Set<string>(Object.keys(meta.removed))
	const cancelled = new Set<string>(Object.keys(meta.cancelled))
	const normRemoved = new Set<string>(Object.keys(meta.normRemoved || Object.create(null)))
	const normCancelled = new Set<string>(Object.keys(meta.normCancelled || Object.create(null)))
	const assetIdRemoved = new Set<string>(Object.keys(meta.assetIdRemoved || Object.create(null)))
	const assetIdCancelled = new Set<string>(Object.keys(meta.assetIdCancelled || Object.create(null)))
	return {
		projectId,
		removed,
		cancelled,
		normRemoved,
		normCancelled,
		assetIdRemoved,
		assetIdCancelled,
		meta,
		sessionOnly,
	}
}

/* ============================================================
 * 对外 API
 * ============================================================ */

/**
 * O3.2 新增：通用 ignore 三级命中判定（精确 / 规格化 / assetId）。
 *
 * @param snap  snapshot（loadPersistedIgnoreList 返回值）
 * @param url   待判定 URL
 * @param kind  'removed' | 'cancelled' | 'any'（默认 any，命中任意一种都返回 true）
 */
export function isUrlIgnoredBySnapshot(
	snap: IgnoreListSnapshot | null | undefined,
	url: string | null | undefined,
	kind: 'removed' | 'cancelled' | 'any' = 'any'
): boolean {
	if (!snap) return false
	const raw = String(url || '').trim()
	if (!raw) return false
	const norm = normalizeForBindingMatch(raw)
	const aid = extractAssetIdFromUrl(raw)

	const hitRemoved = () =>
		snap.removed.has(raw) ||
		(norm !== '' && snap.normRemoved.has(norm)) ||
		(!!aid && snap.assetIdRemoved.has(aid))

	const hitCancelled = () =>
		snap.cancelled.has(raw) ||
		(norm !== '' && snap.normCancelled.has(norm)) ||
		(!!aid && snap.assetIdCancelled.has(aid))

	switch (kind) {
		case 'removed':
			return hitRemoved()
		case 'cancelled':
			return hitCancelled()
		case 'any':
		default:
			return hitRemoved() || hitCancelled()
	}
}

/**
 * 读取当前项目的忽略表快照（6 个命中 Set + 完整 meta）。
 *
 * - O3.1：projectId 双源解析 + 多桶并集读取，解决加载时序 null → 实值切换时的 miss 问题
 * - O6.2：同时加载 `__global__` 桶做并集，加载前用户点的确认不丢失
 * - 每次调用都会扫描 cancelled 过期项并剔除
 *
 * @param projectId         Vue 侧权威 projectId（可为 null / 加载中的临时值）
 * @param fallbackFromUrl   兜底解析：当前触发诊断的 dweb URL，从中可解析出 projectId
 */
export function loadPersistedIgnoreList(
	projectId: string | number | null | undefined,
	fallbackFromUrl?: string | null
): IgnoreListSnapshot {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl)
	const primaryBucket = buckets[0] || GLOBAL_BUCKET_ID
	const sessionOnly = primaryBucket === GLOBAL_BUCKET_ID

	const metas: PersistedIgnoreList[] = []
	for (const bucket of buckets) {
		let meta: PersistedIgnoreList
		if (bucket === GLOBAL_BUCKET_ID && sessionOnly) {
			// 全 sessionOnly：所有桶都走内存
			let cached = _sessionStore.get(bucket)
			if (!cached) {
				cached = _emptyMeta()
				_sessionStore.set(bucket, cached)
			}
			meta = cached
		} else {
			try {
				const key = _projectKeyForBucket(bucket)
				meta = _readPersisted(key)
				// 同一份 sessionStore 也保留一份镜像（便于之后 unignore 时同步）
				if (!_sessionStore.has(bucket)) {
					_sessionStore.set(bucket, meta)
				}
			} catch {
				meta = _emptyMeta()
			}
		}
		metas.push(meta)
	}

	const merged = _mergeMetas(metas)
	const primaryId =
		primaryBucket === GLOBAL_BUCKET_ID ? null : primaryBucket
	return _toSnapshot(primaryId, merged, sessionOnly)
}

/**
 * 写回内存中的 meta 变更到持久化层（多桶同时写入）。
 */
function _persistBuckets(bucketIds: string[], meta: PersistedIgnoreList, sessionOnly: boolean): boolean {
	let ok = false
	for (const bucket of bucketIds) {
		if (sessionOnly || bucket === GLOBAL_BUCKET_ID) {
			_sessionStore.set(bucket, meta)
			ok = true
		} else {
			const key = _projectKeyForBucket(bucket)
			if (_writePersisted(key, meta)) ok = true
			// 同步更新 sessionStore 镜像
			_sessionStore.set(bucket, meta)
		}
	}
	return ok
}

/**
 * 向一个 PersistedIgnoreList 写入 removed（精确 + 规格化 + assetId 三套）。
 * 写之前自动生成 norm / assetId 并写对应的子 Record。
 */
function _applyRemoved(
	meta: PersistedIgnoreList,
	url: string,
	entry: RemovedIgnoreEntry
): void {
	const norm = normalizeForBindingMatch(url)
	const aid = extractAssetIdFromUrl(url)
	const entryEx: RemovedIgnoreEntry = { ...entry, normUrl: norm, assetId: aid }
	meta.removed[url] = entryEx
	if (norm && meta.normRemoved) meta.normRemoved[norm] = entryEx
	if (aid && meta.assetIdRemoved) meta.assetIdRemoved[aid] = entryEx
	// 互斥：已移除的 URL 不应该继续存在于 cancelled
	if (meta.cancelled && meta.cancelled[url]) delete meta.cancelled[url]
	if (norm && meta.normCancelled && meta.normCancelled[norm]) delete meta.normCancelled[norm]
	if (aid && meta.assetIdCancelled && meta.assetIdCancelled[aid]) delete meta.assetIdCancelled[aid]
}

/**
 * 向一个 PersistedIgnoreList 写入 cancelled（精确 + 规格化 + assetId 三套）。
 */
function _applyCancelled(
	meta: PersistedIgnoreList,
	url: string,
	entry: CancelledIgnoreEntry
): void {
	const norm = normalizeForBindingMatch(url)
	const aid = extractAssetIdFromUrl(url)
	const entryEx: CancelledIgnoreEntry = { ...entry, normUrl: norm, assetId: aid }
	meta.cancelled[url] = entryEx
	if (norm && meta.normCancelled) meta.normCancelled[norm] = entryEx
	if (aid && meta.assetIdCancelled) meta.assetIdCancelled[aid] = entryEx
	// removed 优先级更高：cancelled 不覆盖 removed，所以 removed 不动
}

function _clearOne(meta: PersistedIgnoreList, url: string): void {
	const norm = normalizeForBindingMatch(url)
	const aid = extractAssetIdFromUrl(url)
	if (meta.removed && meta.removed[url]) delete meta.removed[url]
	if (meta.cancelled && meta.cancelled[url]) delete meta.cancelled[url]
	if (norm) {
		if (meta.normRemoved && meta.normRemoved[norm]) delete meta.normRemoved[norm]
		if (meta.normCancelled && meta.normCancelled[norm]) delete meta.normCancelled[norm]
	}
	if (aid) {
		if (meta.assetIdRemoved && meta.assetIdRemoved[aid]) delete meta.assetIdRemoved[aid]
		if (meta.assetIdCancelled && meta.assetIdCancelled[aid]) delete meta.assetIdCancelled[aid]
	}
}

/**
 * 标记"用户明确点击了移除失效引用"→ 写入 removed 集合，永久忽略（直到手动 unignore）。
 *
 * O3.1：双写"Vue 权威 projectId 桶 + fallback URL 解析桶 + __global__ 桶"，保证
 *       加载时序（projectId 从 null 变实值）/ 不同启动方式（路由 vs Electron 打开目录）都能命中。
 * O3.2：同时写入 exact + norm + assetId 三套命中，解决规格化不一致导致的 miss。
 */
export function markUrlRemoved(
	projectId: string | number | null | undefined,
	url: string,
	info?: { assetName?: string; sources?: ResourceBindingSource[] },
	fallbackFromUrl?: string | null
): IgnoreListSnapshot {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl || url)
	const sessionOnly = (buckets[0] || GLOBAL_BUCKET_ID) === GLOBAL_BUCKET_ID
	const sourcesLite = info?.sources?.map((s) => ({
		type: s.type,
		resourceId: s.resourceId,
		nodeId: s.nodeId,
		field: s.field,
	}))
	const baseEntry: RemovedIgnoreEntry = {
		at: Date.now(),
		assetName: info?.assetName,
		sources: sourcesLite,
	}

	// 对每个 bucket 读取 → apply → 写回（逐一），保证多桶同时更新
	const metas: PersistedIgnoreList[] = []
	for (const bucket of buckets) {
		let meta: PersistedIgnoreList
		if (sessionOnly) {
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		} else {
			// 先从 sessionStore 拿镜像（未加载过时从 localStorage 读）
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		}
		_applyRemoved(meta, String(url || ''), baseEntry)
		_persistBuckets([bucket], meta, sessionOnly)
		metas.push(meta)
	}

	const merged = _mergeMetas(metas)
	const primaryId = sessionOnly ? null : buckets[0] || null
	return _toSnapshot(primaryId, merged, sessionOnly)
}

/**
 * 标记"用户点击了暂不处理"→ 写入 cancelled 集合，默认 30 天内忽略。
 * cancelled 同样双写多桶 + 规格化 + assetId 三级。
 */
export function markUrlCancelled(
	projectId: string | number | null | undefined,
	url: string,
	info?: { assetName?: string; ttlMs?: number },
	fallbackFromUrl?: string | null
): IgnoreListSnapshot {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl || url)
	const sessionOnly = (buckets[0] || GLOBAL_BUCKET_ID) === GLOBAL_BUCKET_ID

	const ttl = Number(info?.ttlMs)
	const expireAt = Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : CANCELLED_DEFAULT_TTL_MS)
	const baseEntry: CancelledIgnoreEntry = {
		at: Date.now(),
		expireAt,
		assetName: info?.assetName,
	}

	const metas: PersistedIgnoreList[] = []
	for (const bucket of buckets) {
		let meta: PersistedIgnoreList
		if (sessionOnly) {
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		} else {
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		}
		_applyCancelled(meta, String(url || ''), baseEntry)
		_persistBuckets([bucket], meta, sessionOnly)
		metas.push(meta)
	}

	const merged = _mergeMetas(metas)
	const primaryId = sessionOnly ? null : buckets[0] || null
	return _toSnapshot(primaryId, merged, sessionOnly)
}

/**
 * 手动取消单个 URL 的忽略（用于面板"右键 → 重新检查此资源"）。
 * 同时从 exact / norm / assetId 三套 removed + cancelled 中移除，并写回所有桶。
 */
export function unignoreUrl(
	projectId: string | number | null | undefined,
	url: string,
	fallbackFromUrl?: string | null
): IgnoreListSnapshot {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl || url)
	const sessionOnly = (buckets[0] || GLOBAL_BUCKET_ID) === GLOBAL_BUCKET_ID
	const metas: PersistedIgnoreList[] = []
	for (const bucket of buckets) {
		let meta: PersistedIgnoreList
		if (sessionOnly) {
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		} else {
			meta = _sessionStore.get(bucket) || _readPersisted(_projectKeyForBucket(bucket)) || _emptyMeta()
		}
		_clearOne(meta, String(url || ''))
		_persistBuckets([bucket], meta, sessionOnly)
		metas.push(meta)
	}
	const merged = _mergeMetas(metas)
	const primaryId = sessionOnly ? null : buckets[0] || null
	return _toSnapshot(primaryId, merged, sessionOnly)
}

/**
 * 清空当前项目忽略表（用于面板设置"清空忽略缓存"）。
 */
export function clearIgnoreList(
	projectId: string | number | null | undefined,
	fallbackFromUrl?: string | null
): IgnoreListSnapshot {
	const buckets = resolveBucketIds(projectId, fallbackFromUrl)
	const sessionOnly = (buckets[0] || GLOBAL_BUCKET_ID) === GLOBAL_BUCKET_ID
	const empty = _emptyMeta()
	for (const bucket of buckets) {
		_persistBuckets([bucket], empty, sessionOnly)
	}
	const primaryId = sessionOnly ? null : buckets[0] || null
	return _toSnapshot(primaryId, empty, sessionOnly)
}
