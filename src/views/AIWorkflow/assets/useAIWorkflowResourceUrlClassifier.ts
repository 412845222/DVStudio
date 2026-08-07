import { parseDwebProjectAssetUrl, isDwebProjectAssetUrl } from './useAIWorkflow404Fallback'
import type { WorkflowResource } from '../../../aiworkflow/resource/types'

/**
 * 资源 URL 分类。分类决定了 handle404Error 对该 URL 的处理方式。
 *
 * - transient_blob: 会话级临时对象 URL（blob:/data:）→ 直接忽略不诊断
 * - warmup_artifact: 旧架构预热截图/缩略图缓存 URL → 直接忽略不诊断
 * - static_asset: 真实项目静态资产（Content/Media、Content/Assets 等根目录下的图像/视频/3D 模型）→ 正常诊断缺失
 * - external_http: http(s) 外链 → 不做本地磁盘诊断
 * - non_dweb: 非 dweb://project-assets 协议 → 走旧行为（通常直接 early return）
 * - unknown: 兜底分类 → 旧行为诊断但不做破坏性 commit（由 O4 兜底）
 */
export type UrlCategory =
	| 'static_asset'
	| 'transient_blob'
	| 'warmup_artifact'
	| 'external_http'
	| 'non_dweb'
	| 'unknown'

/**
 * 严格过滤开关（localStorage Feature Flag）。
 * 默认 '1' = 启用；设置 DVS_RESOURCE_MISSING_STRICT_FILTER='0' 可一键回到旧无过滤行为。
 */
const STRICT_FILTER_FLAG = 'DVS_RESOURCE_MISSING_STRICT_FILTER'

export function isStrictResourceMissingFilterEnabled(): boolean {
	if (typeof localStorage === 'undefined') return true
	try {
		const v = localStorage.getItem(STRICT_FILTER_FLAG)
		return v !== '0'
	} catch {
		return true
	}
}

/* ============================================================
 * R1 / R5 基础前缀判断（不依赖 dweb 解析）
 * ============================================================ */

function isTransientBlob(url: string): boolean {
	return url.startsWith('blob:') || url.startsWith('data:')
}

function isExternalHttp(url: string): boolean {
	return url.startsWith('http://') || url.startsWith('https://')
}

/* ============================================================
 * R3 预热截图缓存 URL 特征
 *
 * 注意：必须匹配"带缓存特征的子目录/文件名"，禁止触碰 Content/Media 根
 * 下直接保存的真实用户资产，例如 Content/Media/IMG_0001.png 不得判为缓存。
 * ============================================================ */

const WARMUP_DIRNAME_PATTERNS: ReadonlyArray<RegExp> = [
	// 隐藏目录名：.thumbnails / .screenshot_cache / .warmup_bin 等
	/(^|\/)\.thumbnails[_-]?(\/|$)/i,
	/(^|\/)\.screenshot_cache[_-]?(\/|$)/i,
	/(^|\/)\.warmup[_-]?bin(\/|$)/i,
	// 非隐藏但明确是缓存的目录名
	/(^|\/)_screenshots[_-]?(\/|$)/i,
	/(^|\/)_warmup[_-]?(\/|$)/i,
	/(^|\/)__dvs_warmup[_-]?(\/|$)/i
]

const WARMUP_FILENAME_PATTERNS: ReadonlyArray<RegExp> = [
	// 文件名包含 warmup/screenshot/thumb 标记（需匹配后缀前的关键字，避免误杀
	// 例如用户自定义名为 screenshot-demo.png 的资产）
	/-warmup-[^\/]+\.[a-z0-9]{2,6}$/i,
	/_warmup\.[a-z0-9]{2,6}$/i,
	/-screenshot-[^\/]+\.[a-z0-9]{2,6}$/i,
	/_screenshot_[^\/]+\.[a-z0-9]{2,6}$/i,
	/-thumb-[^\/]+\.[a-z0-9]{2,6}$/i,
	/_thumbnail_[^\/]+\.[a-z0-9]{2,6}$/i
]

function isWarmupArtifactRelPath(relPath: string): boolean {
	const p = String(relPath || '').replace(/\\/g, '/')
	if (!p) return false
	for (const r of WARMUP_DIRNAME_PATTERNS) {
		if (r.test(p)) return true
	}
	const basename = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
	for (const r of WARMUP_FILENAME_PATTERNS) {
		if (r.test('/' + basename)) return true
	}
	return false
}

/* ============================================================
 * R4 静态资产根目录：Content/Media、Content/Assets、
 * Content/Models 等。任何项目存放正式导入的用户资产的顶层目录。
 * ============================================================ */

const STATIC_ASSET_ROOT_PREFIXES: ReadonlyArray<string> = [
	'content/media/',
	'content/assets/',
	'content/models/',
	'content/audio/',
	'content/documents/'
]

function isStaticAssetRelPath(relPath: string): boolean {
	const p = String(relPath || '')
		.replace(/\\/g, '/')
		.toLowerCase()
	return STATIC_ASSET_ROOT_PREFIXES.some((prefix) => p.startsWith(prefix))
}

/* ============================================================
 * 主分类函数
 * ============================================================ */

export function classifyResourceUrl(rawUrl: string): UrlCategory {
	const url = String(rawUrl ?? '')
	if (!url) return 'unknown'

	// R1: blob/data
	if (isTransientBlob(url)) return 'transient_blob'

	// R5: http(s)
	if (isExternalHttp(url)) return 'external_http'

	// R2: 非 dweb project-assets
	if (!isDwebProjectAssetUrl(url)) return 'non_dweb'

	const parsed = parseDwebProjectAssetUrl(url)
	const relPath = parsed?.relPath || ''
	// 虽然 isDwebProjectAssetUrl 返回 true，但 parsed 可能为 null（极端 URL），此时视为 unknown
	if (!parsed) return 'unknown'

	// R3: 缓存目录/文件名命中 → warmup
	if (isWarmupArtifactRelPath(relPath)) return 'warmup_artifact'

	// R4: 静态资产根目录下且非缓存
	if (isStaticAssetRelPath(relPath)) return 'static_asset'

	// 其他 dweb://project-assets（可能是未来新增目录，或 Content/ 下其他非标准目录）
	return 'unknown'
}

/* ============================================================
 * 面板职责边界辅助：WorkflowResource 是否为"需要被资源管理器展示"的真实静态资产
 *
 * 判定优先序：
 *   A. kind ∈ {'image','video','model3d'}（当前 ResourceKind 的全部枚举值）
 *      → 只要是后端登记为这三类的，都视为用户真正导入/创建的静态资产。
 *   B. URL 分类不为 warmup_artifact（兜底 A 不生效的边缘情况）
 *   C. posterUrl/previewUrl 指向 warmup_artifact 不影响"资源本身"的判定，
 *      但上层渲染可以忽略它们的缩略图缺失。
 * ============================================================ */

export function isStaticAssetResource(r: Partial<WorkflowResource> | null | undefined): boolean {
	if (!r) return false
	const k = String(r.kind ?? '').toLowerCase()
	if (k === 'image' || k === 'video' || k === 'model3d') return true
	const url = String(r.url ?? '')
	if (url) return classifyResourceUrl(url) === 'static_asset'
	return false
}

/**
 * 给定一个缩略图/海报 URL，判断它是否指向旧预热缓存。
 * 用于面板 resourceMissingThumb 中：如果 thumbSrc 本身是 warmup_artifact，
 * 则"加载失败"不应算作该资源缺失缩略图（因为预热缓存本就不该存在）。
 */
export function isThumbUrlWarmupArtifact(thumbUrl: string | null | undefined): boolean {
	if (!thumbUrl) return false
	return classifyResourceUrl(thumbUrl) === 'warmup_artifact'
}

/* ============================================================
 * M6: 通用规格化 + assetId 提取 + 3 个新 Feature Flag
 *
 * 所有 Flag 默认 = true（启用严格新行为），异常/不支持环境下也启用
 * （不支持 localStorage 就按真，保证 SSR 下行为一致）。
 * 设为 '0' / 'false'（大小写不敏感）可关闭，秒级回退旧行为。
 * ============================================================ */

const STRICT_SOURCES_FLAG = 'DVS_MISSING_ASSET_STRICT_SOURCES'
const NODE_DEBOUNCE_FLAG = 'DVS_MISSING_ASSET_NODE_SELECTION_DEBOUNCE'
const UNKNOWN_CLEANUP_FLAG = 'DVS_MISSING_ASSET_UNKNOWN_CLEANUP'

const AUTORECOVER_PERSIST_FLAG = 'DVS_MISSING_ASSET_AUTORECOVER_PERSIST'
const AUTORECOVER_NOOP_SUPPRESS_FLAG = 'DVS_MISSING_ASSET_AUTORECOVER_NOOP_SUPPRESS'
const RM_THUMB_SKIP_GLOBAL_FLAG = 'DVS_MISSING_ASSET_RM_THUMB_SKIP_GLOBAL'
const RECOVER_TOAST_BATCH_FLAG = 'DVS_MISSING_ASSET_RECOVER_TOAST_BATCH'
const RECOVERED_PERSIST_FLAG = 'DVS_MISSING_ASSET_RECOVERED_PERSIST'

function readBooleanFlag(key: string, defaultOn = true): boolean {
	if (typeof localStorage === 'undefined') return defaultOn
	try {
		const v = localStorage.getItem(key)
		if (v == null) return defaultOn
		const low = String(v).trim().toLowerCase()
		if (low === '0' || low === 'false' || low === 'off' || low === 'no') return false
		return defaultOn
	} catch {
		return defaultOn
	}
}

/**
 * O1.3：defaultFindBindingSources 是否启用规格化比较 + node.resourceId 两跳关联。
 * 关闭后退回严格等值（===）匹配，旧行为。
 */
export function isStrictMissingSourceBindingEnabled(): boolean {
	return readBooleanFlag(STRICT_SOURCES_FLAG, true)
}

/**
 * O2.1 + O5.2：是否启用 sessionFailedOnceUrls + sessionResolvedUrls 内存防抖/锁。
 * 关闭后每次 img onerror 都会完整走诊断流程。
 */
export function isNodeSelectionDebounceEnabled(): boolean {
	return readBooleanFlag(NODE_DEBOUNCE_FLAG, true)
}

/**
 * O4.2：unknown 兜底分支是否删除 orphan resourcesById（未被任何 node.resourceId 引用的幽灵记录）。
 * 关闭后 unknown 仅写 ignore list，不动 store。
 */
export function isUnknownCleanupEnabled(): boolean {
	return readBooleanFlag(UNKNOWN_CLEANUP_FLAG, true)
}

/**
 * O1：自动恢复产生非空 patch 时触发项目保存持久化。
 * 关闭后退回"只改内存不改盘"的旧行为。
 */
export function isAutoRecoverPersistEnabled(): boolean {
	return readBooleanFlag(AUTORECOVER_PERSIST_FLAG, true)
}

/**
 * O2：规格化比较后若新旧 URL 完全等价且无元信息补全，则静默吞掉整个恢复（不通知、不 patch、不触发回调）。
 * 关闭后所有 diagnose 成功都走恢复。
 */
export function isAutoRecoverNoopSuppressEnabled(): boolean {
	return readBooleanFlag(AUTORECOVER_NOOP_SUPPRESS_FLAG, true)
}

/**
 * O3：全局 404 错误处理器遇到"资源管理器面板缩略图"（元素或祖先带 data-rm-thumb="1"）的 onerror 时，直接 early return 不走 diagnose。
 * 关闭后退回到现有耦合行为。
 */
export function isResourceManagerThumbSkipGlobalEnabled(): boolean {
	return readBooleanFlag(RM_THUMB_SKIP_GLOBAL_FLAG, true)
}

/**
 * O4：同一批自动恢复（窗口 1500ms）聚合为 1~3 条 Toast 提示。
 * 关闭后退回每条恢复各弹 1 条。
 */
export function isRecoverToastBatchEnabled(): boolean {
	return readBooleanFlag(RECOVER_TOAST_BATCH_FLAG, true)
}

/**
 * O5：将"已自动恢复的规格化 URL 集合"持久化到 localStorage（项目级），跨会话命中 early return。
 * 关闭后退回内存 Set（会话级去重）。
 */
export function isRecoveredPersistEnabled(): boolean {
	return readBooleanFlag(RECOVERED_PERSIST_FLAG, true)
}

/**
 * O1.1：规格化用于"绑定定位 / ignore list 匹配 / pending 去重"的 URL 字符串。
 *
 * 处理项：
 *   - 去协议（dweb://xxx/yyy → xxx/yyy）
 *   - 反斜杠 → 正斜杠，合并连续斜杠
 *   - 去尾斜杠
 *   - 去 URL query / fragment
 *   - decodeURIComponent（中文路径一致性），decode 失败保留原串
 *   - 末尾 trim + 全小写（Windows 大小写不敏感；其他平台小写是最安全的公共分母）
 *
 * 该规格化**不用于**真实请求 URL，仅用于"相等比较"，确保跨代码路径生成的同路径字符串能匹配上。
 */
export function normalizeForBindingMatch(raw: string | null | undefined): string {
	if (raw == null) return ''
	let s = String(raw).trim()
	if (!s) return ''
	// 1. 去除 scheme://
	s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+\//, '')
	// 2. 统一正斜杠 + 合并连续斜杠
	s = s.replace(/\\+/g, '/').replace(/\/+/g, '/')
	// 3. 去末尾斜杠
	s = s.replace(/\/+$/, '')
	// 4. 去 query / hash
	const q = s.indexOf('?')
	if (q >= 0) s = s.slice(0, q)
	const h = s.indexOf('#')
	if (h >= 0) s = s.slice(0, h)
	// 5. 解码 percent-encoding（中文路径）
	try {
		s = decodeURIComponent(s)
	} catch {
		/* 保留原串 */
	}
	// 6. 再 trim + 收尾处理一次（decode 可能产生空白）
	s = s.trim().replace(/\/+$/, '')
	if (!s) return ''
	// 7. 全小写（兜底 Windows 大小写不敏感文件系统匹配）
	return s.toLowerCase()
}

/**
 * O3.2：从资源 URL 中提取稳定的资产 ID（用于"URL 路径变了但 asset 仍然是同一个"的匹配）。
 *
 * 识别模式：
 *   Content/Media/asset_79024_msbnqe3s_1785666798563_edmwxb.png
 *   → 提取前缀两段：asset_79024_msbnqe3s（忽略尾部随机后缀 / 扩展名）
 *
 *   Content/Assets/my_custom_id_v2_1234.mp4
 *   → my_custom_id_v2（如果前缀不带 asset_ 也尽量提取"扩展名前去掉最后的数字后缀"段）
 *
 * 识别失败返回 null（调用方降级为仅 URL 精确 / 规格化匹配）。
 */
export function extractAssetIdFromUrl(url: string | null | undefined): string | null {
	const norm = normalizeForBindingMatch(url)
	if (!norm) return null
	const lastSlash = norm.lastIndexOf('/')
	const basename = lastSlash >= 0 ? norm.slice(lastSlash + 1) : norm
	if (!basename) return null
	// 去掉扩展名（最后一个点之后）
	const noExt = basename.includes('.') ? basename.slice(0, basename.lastIndexOf('.')) : basename
	if (!noExt) return null
	if (noExt.startsWith('asset_')) {
		// asset_<id1>_<id2>_<timestamp>_<rand> → 取前 3 段（去掉尾部 rand）
		const parts = noExt.split('_')
		if (parts.length <= 3) return noExt
		return parts.slice(0, 3).join('_')
	}
	// 非 asset_ 前缀：去掉最后一段数字/随机串
	const parts = noExt.split('_')
	if (parts.length >= 2) {
		const last = parts[parts.length - 1]
		if (/^[0-9a-f]{6,}$/i.test(last) || /^[0-9]+$/.test(last)) {
			return parts.slice(0, -1).join('_')
		}
	}
	return noExt
}
