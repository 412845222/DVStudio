import logger from '../../core/logger.mjs'
import * as taskStore from './taskStore.mjs'
import {
	startCliControlServer as httpStart,
	stopCliControlServer as httpStop,
	getCliControlServerPort
} from './httpServer.mjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const log = logger.child('cli-control-server:service')

// 外部依赖缓存（由 initBackend 调用时注入）
let _deps = null
let _started = false

// ===== 帮助函数：从 localdb projects 拿最近打开的项目（兜底 currentProject 没推送的情况）=====
function _getReposSafe() {
	try {
		// eslint-disable-next-line no-undef
		const mod = require
		return typeof mod === 'function' ? null : null
	} catch {
		return null
	}
}
function _lastOpenedProjectFromLocaldb() {
	try {
		const ctx = _deps?._ctxRef?.() || null
		const projectsRepo = ctx?.localdb?.projects
		if (!projectsRepo || typeof projectsRepo._internal !== 'object') return null
		const db = ctx?.db
		if (!db || typeof db.prepare !== 'function') return null
		const row = db
			.prepare(
				`SELECT id, name, root_path, last_opened_at FROM projects ORDER BY COALESCE(last_opened_at, created_at) DESC LIMIT 1`
			)
			.get()
		if (!row) return null
		return {
			id: row.id,
			name: row.name || '未命名项目',
			rootPath: row.root_path || '',
			lastOpenedAt: row.last_opened_at || null,
			folderBacked: Boolean(row.root_path && String(row.root_path).trim())
		}
	} catch (err) {
		log.debug(`[default-out] localdb fallback failed (harmless): ${err?.message || err}`)
		return null
	}
}

/**
 * 拿到"当前项目"信息：优先注入的 getCurrentProjectInfo()，否则查 localdb 最近打开。
 * 返回 {id,name,rootDir}，rootDir 为空表示未能确定。
 */
export function resolveCurrentProjectForOutput() {
	// 1) 优先前端 IPC 推送的 currentProject
	const injected = _deps?.getCurrentProjectInfo ? _deps.getCurrentProjectInfo() : null
	if (injected && typeof injected === 'object') {
		const root = injected.rootDir || injected.rootPath || injected.rootDirPath || ''
		if (root && typeof root === 'string') {
			return {
				id: injected.id || injected.projectId || null,
				name: injected.name || injected.projectName || 'project-' + (injected.id || 'local'),
				rootDir: root
			}
		}
	}
	// 2) 兜底 localdb 最近打开的项目（必须是 folderBacked，因为要写入 generated_media 到磁盘根目录）
	const last = _lastOpenedProjectFromLocaldb()
	if (last?.folderBacked && last.rootPath) {
		return { id: last.id, name: last.name, rootDir: last.rootPath }
	}
	// 3) 都没有：返回空 rootDir，调用者会退回到 <tmpdir>/dvs-genimg-outputs/
	return { id: null, name: '未命名项目', rootDir: '' }
}

function _safeFileNameComponent(raw) {
	return (
		String(raw || '未命名项目')
			.replace(/[\\/:*?"<>|]/g, '_')
			.replace(/\s+/g, '_')
			.slice(0, 80) || '未命名项目'
	)
}

/**
 * 生成默认落盘目录：<蓝图项目根>/Content/Media（与蓝图节点自身发起生成任务时的目录一致，
 * 保证右键菜单「文件夹打开」、资源面板、蓝图导出、dweb://project-assets 协议解析一致）。
 * fallback：<tmpdir>/dvs-genimg-outputs/<kind>
 * @param {object} [opts]
 * @param {'images'|'videos'|'models'} [opts.kind]
 * @returns {string} 绝对路径目录（调用方需自己 mkdir -p）
 */
export function resolveDefaultOutputDir(opts = {}) {
	// const kind = opts.kind === 'videos' ? 'videos' : opts.kind === 'models' ? 'models' : 'images'
	const proj = resolveCurrentProjectForOutput()
	if (proj.rootDir) {
		// 统一落在 Content/Media（蓝图自身任务的约定目录），不使用 generated_media，
		// 确保与 importAsset / downloadUrlToProjectRoot / projectAssetProtocol 目录一致。
		return path.resolve(proj.rootDir, 'Content', 'Media')
	}
	// 兜底：临时目录（用户传 outputPath=null 且没打开蓝图项目时）
	const tmpKind = opts.kind === 'videos' ? 'videos' : opts.kind === 'models' ? 'models' : 'images'
	return path.resolve(os.tmpdir(), 'dvs-genimg-outputs', tmpKind)
}

/**
 * @param {string} rawUserOutputPath 用户传的 outputPath（可能是目录、可能是文件、可能 null/空）
 * @param {number} imageCount 生成图片数量
 * @returns {{ kind:'dir'|'file', targetPath:string, autoMkdirParent:string }}
 *   targetPath: 建议传给 autoExport 的目录或文件路径
 *   autoMkdirParent: 在写入前需 mkdir -p 的目录
 */
export function normalizeOutputPathForExport(rawUserOutputPath, imageCount = 1) {
	const s = String(rawUserOutputPath || '').trim()
	if (!s) {
		const dir = resolveDefaultOutputDir({ kind: 'images' })
		return { kind: 'dir', targetPath: dir, autoMkdirParent: dir }
	}
	// 判断是否已有扩展名（粗略），且 imageCount=1 时当作文件路径
	const base = path.basename(s)
	const hasExt = /\.[a-zA-Z0-9]{2,6}$/.test(base)
	if (hasExt && imageCount === 1) {
		return {
			kind: 'file',
			targetPath: path.resolve(s),
			autoMkdirParent: path.dirname(path.resolve(s))
		}
	}
	const dir = hasExt ? path.dirname(path.resolve(s)) : path.resolve(s)
	return { kind: 'dir', targetPath: dir, autoMkdirParent: dir }
}

// ===== 创建 image 节点请求 & 聊天预览块（通过 task.meta 让前端轮询时消费）=====
function _ensureMeta(taskId) {
	const t = taskStore.getTask(taskId)
	if (!t) return null
	if (!t.meta || typeof t.meta !== 'object') {
		taskStore.updateTask(taskId, { meta: {} })
	}
	return taskStore.getTask(taskId)
}

// Provider-only short-name allowlist → 蓝图参数面板 image-model 下拉框的"提供商"短名，不是真实 endpoint ID
const PROVIDER_ONLY_SHORT_NAMES = new Set([
	'seedream',
	'gemini',
	'nanobanana',
	'meshy',
	'tripo3d',
	'seedance',
	'jimeng',
	'bytedance',
	'volcengine',
	'doubao',
	'ark',
	'openai',
	'coze'
])

function _looksLikeRealSeedreamEndpoint(raw) {
	const s = String(raw || '').trim()
	if (!s) return false
	const low = s.toLowerCase()
	if (PROVIDER_ONLY_SHORT_NAMES.has(low)) return false
	if (low.startsWith('ep-')) return true
	if (low.startsWith('doubao-') && low.length >= 15) return true
	if (low.startsWith('jimeng-') && low.length >= 12) return true
	if (low.startsWith('seedance-') && low.length >= 12) return true
	if (low.startsWith('seedream-') && low.length >= 15) return true
	if (low.startsWith('bytedance-') && low.length >= 15) return true
	if (low.length >= 10 && (low.includes('-') || low.includes('_'))) return true
	return false
}

/**
 * 解析 CLI payload，拿到最终作为 Seedream Ark 请求 model 字段的"真实 Endpoint ID"。
 * 优先级同蓝图参数面板 normalizeImageModel：
 *   1) payload.seedreamModelVersion   → 面板参数的 Seedream model version
 *   2) payload.imageModel             → ComfyUI 桥接层约定 key
 *   3) payload.endpoint_id            → ComfyUI 桥接层约定 key
 *   4) payload.model                  → CLI 入参或其他调用方
 * 任何一层若只是 provider-only 短名（seedream/gemini/meshy...）则跳过，回退下一层或默认值。
 */
function resolveSeedreamEndpointFromPayload(payload) {
	const DEFAULT = 'doubao-seedream-4-5-251128'
	const candidates = [
		payload?.seedreamModelVersion,
		payload?.imageModel,
		payload?.endpoint_id,
		payload?.model
	]
	for (const raw of candidates) {
		if (_looksLikeRealSeedreamEndpoint(raw)) return String(raw).trim()
	}
	return DEFAULT
}

/**
 * Seedream 尺寸规范：与 third-party/service.mjs SEEDREAM_SIZE_MAP + 蓝图面板完全一致。
 * 蓝图参数面板：Seedream 只接受"规格档位(seedreamSize: 1K/2K/3K/4K)+比例(seedreamAspectRatio)"，不接受自由 width/height。
 * third-party service.mjs 中的 resolveSeedreamSize(sizePreset, aspectRatio) 会把这两个参数展开成真正的 WxH 像素字符串。
 */
const SEEDREAM_SIZE_ENUM = new Set(['1K', '2K', '3K', '4K'])
const SEEDREAM_ASPECT_RATIO_ENUM = new Set([
	'1:1',
	'16:9',
	'9:16',
	'4:3',
	'3:4',
	'21:9',
	'3:2',
	'2:3'
])
// 完整像素映射：preset(档位) -> ratio -> WxH string（与 third-party 完全一致）
const SEEDREAM_SIZE_PIXEL_MAP = {
	'1K': {
		'1:1': '1024x1024',
		'4:3': '1152x864',
		'3:4': '864x1152',
		'16:9': '1280x720',
		'9:16': '720x1280',
		'3:2': '1248x832',
		'2:3': '832x1248',
		'21:9': '1512x648'
	},
	'2K': {
		'1:1': '2048x2048',
		'4:3': '2304x1728',
		'3:4': '1728x2304',
		'16:9': '2848x1600',
		'9:16': '1600x2848',
		'3:2': '2496x1664',
		'2:3': '1664x2496',
		'21:9': '3136x1344'
	},
	'3K': {
		'1:1': '3072x3072',
		'4:3': '3456x2592',
		'3:4': '2592x3456',
		'16:9': '4096x2304',
		'9:16': '2304x4096',
		'3:2': '3744x2496',
		'2:3': '2496x3744',
		'21:9': '4704x2016'
	},
	'4K': {
		'1:1': '4096x4096',
		'4:3': '4704x3520',
		'3:4': '3520x4704',
		'16:9': '5504x3040',
		'9:16': '3040x5504',
		'3:2': '4992x3328',
		'2:3': '3328x4992',
		'21:9': '6240x2656'
	}
}

// 反向索引：WxH -> { preset, ratio }，用于用户传 --width/--height 时反查最匹配的档位+比例
const _WXH_TO_PRESET_RATIO = (() => {
	const m = new Map()
	for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
		for (const [ratio, wxh] of Object.entries(ratios)) {
			if (!m.has(wxh)) m.set(wxh, { preset, ratio })
		}
	}
	return m
})()

function _gcd(a, b) {
	return b ? _gcd(b, a % b) : a
}
function _simplifyRatio(w, h) {
	if (!w || !h) return null
	const g = _gcd(w, h)
	if (!g) return null
	return `${Math.floor(w / g)}:${Math.floor(h / g)}`
}
/**
 * 根据用户输入的 width/height（可能是任意像素值），反查最匹配的 Seedream 档位(1K/2K/3K/4K) + 官方比例枚举。
 * 匹配优先级：
 *   1) WxH 精确命中 SEEDREAM_SIZE_PIXEL_MAP 中的某个像素组合 → 直接返回对应 preset+ratio
 *   2) 宽高的最简比命中官方枚举 ratio → 按面积最接近的档位返回
 *   3) 面积最接近的档位，取其中 1:1 作为兜底
 * 返回值保证是 seedream 合法的枚举（preset ∈ {1K,2K,3K,4K}, ratio ∈ SEEDREAM_ASPECT_RATIO_ENUM）。
 */
function _matchSeedreamPresetAndRatio(width, height) {
	// 关键：只有当传入的 width/height 是"有效正数（非0、非NaN、非无穷大）"时才 clamp 到最小 64。
	// 如果值为 0、负数、或非数字（例如用户只传一边，另一边是 0/undefined）→ 保持 0，
	// 这样才能正确落入"只有一边"的分支，按 1:1 近似处理。
	const isGoodNumber = (v) => Number.isFinite(v) && v > 0
	const w = isGoodNumber(width) ? Math.max(64, Math.floor(width)) : 0
	const h = isGoodNumber(height) ? Math.max(64, Math.floor(height)) : 0
	if (w > 0 && h > 0) {
		const exactKey = `${w}x${h}`
		if (_WXH_TO_PRESET_RATIO.has(exactKey)) return _WXH_TO_PRESET_RATIO.get(exactKey)
		const simpleRatio = _simplifyRatio(w, h)
		// 策略 A：先按 ratio 过滤（最简比命中官方枚举），再按面积最接近选档位
		let candidates = []
		for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
			for (const [ratio, wxh] of Object.entries(ratios)) {
				if (simpleRatio && ratio !== simpleRatio) continue
				const [rw, rh] = wxh.split('x').map(Number)
				const diff = Math.abs(w * h - rw * rh)
				candidates.push({ preset, ratio, wxh, diff })
			}
		}
		// 策略 B：当 simpleRatio 不命中任何官方枚举时，candidates 会是空数组（因为 continue 过滤掉了所有项）。
		//         此时需要做一次"全局兜底"：不限 ratio，在所有 4*8=32 个预设中按面积差最小选。
		if (candidates.length === 0) {
			for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
				for (const [ratio, wxh] of Object.entries(ratios)) {
					const [rw, rh] = wxh.split('x').map(Number)
					const diff = Math.abs(w * h - rw * rh)
					candidates.push({ preset, ratio, wxh, diff })
				}
			}
		}
		if (candidates.length) {
			candidates.sort((a, b) => a.diff - b.diff)
			return { preset: candidates[0].preset, ratio: candidates[0].ratio }
		}
	} else if (w > 0 || h > 0) {
		// 只有 width 或 只有 height 中的一边（另一边缺失/非法）：假设缺失的一边等于已知的一边（1:1 近似）
		// 这样 width=2000 会按 2000x2000 (面积 4M) → 命中 2K 1:1，而不是之前猜测 1000 导致面积低估命中 1K。
		const known = Math.max(w, h)
		return _matchSeedreamPresetAndRatio(known, known)
	}
	// 兜底：2K 方形
	return { preset: '2K', ratio: '1:1' }
}

/**
 * CLI/脚本提交 payload 的 Seedream 参数统一规范化（服务端兜底，在 precheck 通过之后、submit 之前调用）。
 * 目标：保证 payload 中出现蓝图面板的完整 Seedream 字段：
 *   - seedreamSize(1K/2K/3K/4K)
 *   - seedreamAspectRatio(1:1/16:9/...)
 *   - seedreamQuantity / seedreamWatermark / seedreamOutputFormat / seedreamSeed / seedreamNegativePrompt
 * 这样 builtinTools generateImageViaSeedream 中 seedreamPayload.size/aspect_ratio 可以直接从这些字段取到与面板一致的值。
 */
function normalizeSeedreamPayloadForSubmission(rawPayload) {
	const p = rawPayload || {}
	const out = { ...p }

	// 1) quantity：兼容 imageCount / n / quantity / seedreamQuantity → 统一存到 seedreamQuantity
	const rawN = p.seedreamQuantity ?? p.imageCount ?? p.n ?? p.quantity
	const seedreamQuantity = Number.isFinite(Number(rawN))
		? Math.min(4, Math.max(1, Math.floor(Number(rawN))))
		: 1
	out.seedreamQuantity = seedreamQuantity
	if (out.imageCount === undefined) out.imageCount = seedreamQuantity
	if (out.n === undefined) out.n = seedreamQuantity

	// 2) watermark：默认 false（蓝图面板默认 seedreamWatermark=false）
	out.seedreamWatermark =
		p.seedreamWatermark === true ||
		p.watermark === true ||
		p.watermark === 'true' ||
		p.watermark === 1 ||
		p.watermark === '1'

	// 3) output_format：蓝图面板 seedreamOutputFormat，默认 jpeg；v5 model 才支持 png
	if (typeof p.seedreamOutputFormat === 'string' && p.seedreamOutputFormat.trim()) {
		out.seedreamOutputFormat = p.seedreamOutputFormat.trim().toLowerCase()
	} else if (typeof p.outputFormat === 'string' && p.outputFormat.trim()) {
		out.seedreamOutputFormat = p.outputFormat.trim().toLowerCase()
	} else if (typeof p.output_format === 'string' && p.output_format.trim()) {
		out.seedreamOutputFormat = p.output_format.trim().toLowerCase()
	} else {
		out.seedreamOutputFormat = 'jpeg'
	}

	// 4) seed：兼容 seedreamSeed / seed
	if (typeof p.seedreamSeed === 'number' && Number.isFinite(p.seedreamSeed)) {
		out.seedreamSeed = p.seedreamSeed
	} else if (typeof p.seed === 'number' && Number.isFinite(p.seed) && p.seed >= 0) {
		out.seedreamSeed = Math.floor(p.seed)
	}

	// 5) negative prompt：兼容 seedreamNegativePrompt / negativePrompt / negative_prompt
	const np = String(
		typeof p.seedreamNegativePrompt === 'string'
			? p.seedreamNegativePrompt
			: typeof p.negativePrompt === 'string'
				? p.negativePrompt
				: typeof p.negative_prompt === 'string'
					? p.negative_prompt
					: ''
	).trim()
	if (np) out.seedreamNegativePrompt = np

	// 6) Size + AspectRatio 规范化：
	//    a) 如果用户传了 payload.seedreamSize（CLI --seedream-size 或显式设置）→ 优先
	//    b) 如果用户传了 payload.seedreamAspectRatio → 优先
	//    c) 否则根据 payload.width/height 反查最匹配档位+比例
	//    d) 都没传 → 2K + aspectRatio（如果用户只传了 aspect ratio）或 2K + 1:1
	let sizeFromUser = String(p.seedreamSize || p.size || '')
		.trim()
		.toUpperCase()
	if (!SEEDREAM_SIZE_ENUM.has(sizeFromUser)) sizeFromUser = ''
	let ratioFromUser = String(
		p.seedreamAspectRatio || p.aspectRatio || p.aspect_ratio || p.ratio || ''
	)
		.trim()
		.replace(/\s/g, '')
	if (!SEEDREAM_ASPECT_RATIO_ENUM.has(ratioFromUser)) ratioFromUser = ''

	if (sizeFromUser && ratioFromUser) {
		out.seedreamSize = sizeFromUser
		out.seedreamAspectRatio = ratioFromUser
	} else {
		const hasW = typeof p.width === 'number' && Number.isFinite(p.width)
		const hasH = typeof p.height === 'number' && Number.isFinite(p.height)
		let matched = null
		if (hasW || hasH) {
			// 有 width 或 height（即便只有一边）：直接交给 _matchSeedreamPresetAndRatio 处理
			//   - 两边都有：精确命中 + 最简比命中 + 全局兜底
			//   - 一边有：缺的一边按 1:1 近似（等于已知边），再递归匹配
			const wArg = hasW ? Number(p.width) : 0
			const hArg = hasH ? Number(p.height) : 0
			matched = _matchSeedreamPresetAndRatio(wArg, hArg)
		} else if (ratioFromUser) {
			// 只有比例没宽高 → 默认 2K
			matched = { preset: '2K', ratio: ratioFromUser }
		} else if (sizeFromUser) {
			// 只有档位没比例 → 默认 1:1
			matched = { preset: sizeFromUser, ratio: '1:1' }
		} else {
			matched = { preset: '2K', ratio: '1:1' }
		}
		out.seedreamSize = matched.preset
		out.seedreamAspectRatio = matched.ratio
	}

	// 7) 为了兼容 third-party seedreamGenerateStream 的 size/aspect_ratio 参数读取，同时在顶层也写入对应字段
	//    (third-party 会优先读 p.size / p.aspect_ratio / p.aspectRatio)
	out.size = out.seedreamSize
	out.aspectRatio = out.seedreamAspectRatio
	out.aspect_ratio = out.seedreamAspectRatio

	// 8) 如果 width/height 存在但和映射出来的对不上，就把顶层 width/height 改成映射后的标准像素（防止后面的逻辑用了非标准像素）
	const standardWxh =
		(SEEDREAM_SIZE_PIXEL_MAP[out.seedreamSize] || {})[out.seedreamAspectRatio] || ''
	if (standardWxh) {
		const [sw, sh] = standardWxh.split('x').map(Number)
		out.width = sw
		out.height = sh
	}

	return out
}

/**
 * 同步预检查：在 submit 进入 fire-and-forget 之前：
 *   1) 校验 payload 合法性（prompt、imageCount）
 *   2) 校验最终 seedream endpoint 是否"看似合法"（不是 seedream / gemini / meshy 这种 provider-only 短名）
 *   3) 检查 Seedream/方舟 API key 是否配置（打包环境必填）
 * 任何一项失败直接返回错误（不创建 task、不启动 P3），让 CLI 在 submit 阶段就能报错，避免 silent failure / endpoint-not-exist 拉到 ARK 任务中心才失败。
 * 返回 null 表示检查通过；返回对象表示预检查失败（{ code, message, userAction }）。
 */
function precheckGenerateImagePayload(payload) {
	const prompt = String(payload?.prompt || '').trim()
	if (!prompt) {
		return {
			code: 'INVALID_PROMPT',
			message: 'prompt is required (non-empty string). Please provide --prompt.'
		}
	}
	// imageCount 校验（可选）
	const n = Number(payload?.imageCount)
	if (payload?.imageCount !== undefined && payload?.imageCount !== null) {
		if (!Number.isFinite(n) || n < 1 || n > 16) {
			return {
				code: 'INVALID_IMAGE_COUNT',
				message: `imageCount must be a number between 1 and 16 (got ${JSON.stringify(payload.imageCount)}).`
			}
		}
	}

	// ===== Seedream Endpoint ID 合法性校验（和蓝图节点面板保持一致）=====
	const rawModel = String(payload?.model || '').trim()
	const rawSeedreamVer = String(payload?.seedreamModelVersion || '').trim()
	const resolvedEndpoint = resolveSeedreamEndpointFromPayload(payload || {})
	// 如果用户显式传入了 provider-only 短名（CLI 之前的默认行为）→ 给出明确修复指引。
	const modelIsProviderOnly = rawModel && PROVIDER_ONLY_SHORT_NAMES.has(rawModel.toLowerCase())
	const seedreamVerIsProviderOnly =
		rawSeedreamVer && PROVIDER_ONLY_SHORT_NAMES.has(rawSeedreamVer.toLowerCase())
	if (modelIsProviderOnly || seedreamVerIsProviderOnly) {
		const whichField = seedreamVerIsProviderOnly ? 'seedreamModelVersion' : 'model'
		const whichVal = seedreamVerIsProviderOnly ? rawSeedreamVer : rawModel
		return {
			code: 'SEEDREAM_ENDPOINT_INVALID_SHORT_NAME',
			message:
				`Field '${whichField}' was set to provider-alias '${whichVal}', which is NOT a real Doubao Ark inference endpoint ID. ` +
				`The blueprint node parameter panel (Seedream model dropdown) uses version IDs like 'doubao-seedream-4-5-251128' (Seedream 4.5) / 'doubao-seedream-5-0-260128' (Seedream 5.0) / 'doubao-seedream-5-0-lite-260128' / 'doubao-seedream-4-0-250828'. ` +
				`If you created a custom endpoint in the Volcengine Ark console, paste its 'ep-xxxxx' ID directly. CLI flag: --seedream-endpoint <endpoint-id> (or --seedream-model-version <version-id>).`,
			userAction: 'settings:ai-service:seedream-endpoint-id',
			hint: {
				recommendedDefaults: [
					'doubao-seedream-4-5-251128',
					'doubao-seedream-5-0-260128',
					'doubao-seedream-5-0-lite-260128',
					'doubao-seedream-4-0-250828'
				],
				howToFindCustomEndpoint:
					'Volcengine Ark Console → Inference Endpoints → open your Seedream endpoint → copy Endpoint ID (starts with ep-)'
			}
		}
	}
	// 即便用户没显式传短名，最终 resolved endpoint 仍然"不像 endpoint" → 兜底拦截（避免把 seedream/空 直接发去 Ark）。
	if (!_looksLikeRealSeedreamEndpoint(resolvedEndpoint)) {
		return {
			code: 'SEEDREAM_ENDPOINT_MISSING',
			message:
				`Failed to resolve a valid Doubao Ark Seedream Endpoint ID from payload (looked at seedreamModelVersion/imageModel/endpoint_id/model). ` +
				`Default endpoint 'doubao-seedream-4-5-251128' is used as fallback. If you see 'endpoint does not exist' errors in ARK Task Center, copy your real endpoint ID (ep-xxxxx or doubao-seedream-x-x-xxxxxx) into DVStudio Settings or pass --seedream-endpoint.`,
			userAction: 'settings:ai-service:seedream-endpoint-id'
		}
	}

	// ===== API key 存在性检查 =====
	let ctx = null
	try {
		ctx = _deps?._ctxRef?.() || null
	} catch {
		ctx = null
	}
	const keyRepo = ctx?.localdb?.apiKeys || null
	let hasAnyKey = false
	if (keyRepo && typeof keyRepo.getPlaintext === 'function') {
		const CANDIDATE_NAMES = [
			'seedream',
			'bytedance_seedream',
			'bytedance_image',
			'bytedance_text',
			'bytedance',
			'doubao',
			'meshy',
			'nanobanana',
			'gemini',
			'GeminiApiKey',
			'gemini_api_key',
			'openai'
		]
		for (const name of CANDIDATE_NAMES) {
			try {
				const r = keyRepo.getPlaintext(name)
				if (r && r.ok && r.plaintext && String(r.plaintext).trim()) {
					hasAnyKey = true
					break
				}
			} catch {}
		}
	}
	if (!hasAnyKey) {
		// 打包环境（非 dev mock）下：没有任何可用的 AI API key，P3 直连会抛错 → P2 Agent 也走不通 → 直接告诉用户去配置。
		const isDevMock =
			process.env.ELECTRON_DEV === '1' ||
			process.env.NODE_ENV === 'development' ||
			!require('electron').app.isPackaged
		if (!isDevMock) {
			return {
				code: 'API_KEY_NOT_CONFIGURED',
				message:
					'AI API key (Seedream / Doubao Ark / Gemini / OpenAI) is not configured. ' +
					'Please open DVStudio → Settings → AI Service and add your API key, then retry this command. ' +
					'Endpoint note: after adding your API key, make sure the Seedream Endpoint ID (Seedream model version) is set to the SAME value you use in the blueprint node parameter panel (e.g. doubao-seedream-4-5-251128 or ep-xxxxx).',
				userAction: 'settings:ai-service:add-api-key'
			}
		}
	}
	return null
}

/**
 * 登记"请前端为每张 exportedFile 创建一个蓝图 image 预览节点"的请求。
 * useCLIAgentTrigger 轮询消费后会写入节点 ID 到 .nodeIds[] 并标记 consumed。
 */
export function enqueueCreateImageNodeRequests(taskId, exportedFiles, note) {
	try {
		if (!Array.isArray(exportedFiles) || exportedFiles.length === 0) return
		const t = _ensureMeta(taskId)
		if (!t) return
		const meta = { ...(t.meta || {}) }
		const list = Array.isArray(meta.createImageNodeRequests)
			? [...meta.createImageNodeRequests]
			: []
		for (const fp of exportedFiles) {
			if (!fp || typeof fp !== 'string') continue
			const abs = path.isAbsolute(fp) ? fp : path.resolve(fp)
			const fileUrl = 'file:///' + abs.replace(/\\/g, '/')
			list.push({
				id: 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
				imageUrl: fileUrl, // createImageNodeAtCenter 会自动转成可用的 file:// 显示
				sourceLocalPath: abs,
				name: path.basename(abs),
				imageGenerationSource: 'seedream-cli',
				status: 'pending',
				createdAt: Date.now(),
				promptPreview: typeof note === 'string' ? note.slice(0, 64) : ''
			})
		}
		taskStore.updateTask(taskId, { meta: { ...meta, createImageNodeRequests: list } })
	} catch (err) {
		log.warn(`[create-node-queue] taskId=${taskId} push failed (swallowed): ${err?.message || err}`)
	}
}

/**
 * 登记"请前端在 Agent 对话框（若有）附加 assistant 图片块预览"的请求。
 * 结构对齐 useChatContext / useAIWorkflowChatGeneration 所需的 image_url block。
 */
export function enqueueChatImagePreviewBlocks(taskId, exportedFiles, prompt) {
	try {
		if (!Array.isArray(exportedFiles) || exportedFiles.length === 0) return
		const t = _ensureMeta(taskId)
		if (!t) return
		const meta = { ...(t.meta || {}) }
		const blocks = Array.isArray(meta.chatPreviewBlocks) ? [...meta.chatPreviewBlocks] : []
		const promptText = typeof prompt === 'string' ? prompt : ''
		for (const fp of exportedFiles) {
			if (!fp || typeof fp !== 'string') continue
			const abs = path.isAbsolute(fp) ? fp : path.resolve(fp)
			const fileUrl = 'file:///' + abs.replace(/\\/g, '/')
			blocks.push({
				type: 'image_url',
				url: fileUrl,
				sourceLocalPath: abs,
				title: path.basename(abs),
				promptPreview: promptText.slice(0, 120),
				createdAt: Date.now()
			})
		}
		taskStore.updateTask(taskId, { meta: { ...meta, chatPreviewBlocks: blocks } })
	} catch (err) {
		log.warn(`[chat-preview] taskId=${taskId} push failed (swallowed): ${err?.message || err}`)
	}
}

/**
 * 后端直连执行 generate_image 工具（不依赖前端 Agent Runtime）
 * 优先走 seedream 直连路径，失败再回退到 node pipeline（需要前端页面打开）
 *
 * 直连成功会自动：
 *   1. 把 exportedFiles 复制到 payload.outputPath（未传时默认落到 <项目>/Content/Media）
 *   2. 登记 createImageNodeRequests → 前端轮询创建 image 预览节点
 *   3. 登记 chatPreviewBlocks → 前端在 Agent 对话框显示图片块
 *
 * 幂等：执行前后都会写 task.meta.pipelinePhase 标记，避免 useCLIAgentTrigger 轮询时又把任务
 *      分派到 P2 Agent Runtime 二次执行，或 P2/P1 执行完再重复登记预览节点。
 */
async function tryDirectGenerateImage(taskId, payload) {
	try {
		// ====== 0. 幂等保护：若 meta.pipelinePhase 已表明进入 P3 或已被 P2 标记完成，不重复执行 ======
		try {
			const cur = taskStore.getTask(taskId)
			const phase = String(cur?.meta?.pipelinePhase || '').trim()
			if (
				phase === 'p3-direct-running' ||
				phase === 'p3-direct-completed' ||
				phase === 'p2-runtime-completed' ||
				phase === 'p1-node-completed'
			) {
				log.warn(`[direct-gen] taskId=${taskId} skip (pipelinePhase=${phase})`)
				return (
					phase === 'p3-direct-completed' ||
					phase === 'p2-runtime-completed' ||
					phase === 'p1-node-completed'
				)
			}
			// 先标记 P3 开始（useCLIAgentTrigger 在分派 pending task 时会先 getTask 检查 phase）
			const t = _ensureMeta(taskId)
			if (t) {
				taskStore.updateTask(taskId, {
					meta: {
						...(t.meta || {}),
						pipelinePhase: 'p3-direct-running',
						cliDirectStartedAt: Date.now(),
						cliDirectDispatching: false
					}
				})
			}
		} catch (metaErr) {
			log.warn(
				`[direct-gen] taskId=${taskId} meta guard write failed (continue anyway): ${metaErr?.message || metaErr}`
			)
		}

		// 动态获取 ToolExecutor（避免循环依赖）
		const { getToolExecutor } = await import('../mcp/toolExecutor.mjs')
		const executor = getToolExecutor()
		const tool = executor.getTool?.('generate_image')
		if (!tool || typeof tool.handler !== 'function') {
			log.warn(
				`[direct-gen] generate_image tool not registered or no handler, skipping direct path`
			)
			// 不标记 fallback，因为只是 tool 不存在，让 P2 可以继续接管
			return false
		}

		// ===== 预处理 outputPath：用户没传就落到 <项目>/Content/Media =====
		const resolved = normalizeOutputPathForExport(
			payload?.outputPath,
			Number(payload?.imageCount || 1)
		)
		try {
			if (resolved.autoMkdirParent) fs.mkdirSync(resolved.autoMkdirParent, { recursive: true })
		} catch (mkdirErr) {
			log.warn(
				`[direct-gen] taskId=${taskId}: mkdir default output dir failed (will let tool handle it): ${mkdirErr?.message || mkdirErr}`
			)
		}
		const nextPayload = {
			...(payload || {}),
			outputPath: resolved.targetPath
		}

		log.info(
			`[direct-gen] taskId=${taskId}: calling generate_image handler directly (seedream priority), output=${resolved.targetPath}`
		)
		const result = await tool.handler(nextPayload, { requestId: `cli-${taskId}` })
		if (result?.ok) {
			const exported = Array.isArray(result.exportedFiles) ? result.exportedFiles : []
			const outputFiles = Array.isArray(result.outputFiles) ? result.outputFiles : []
			// 关键兜底：预览节点/对话块使用"导出到目标路径的文件优先，否则使用临时文件"
			// 这样即使用户没设置 --output-path 或 autoExport=false，蓝图仍然可以渲染临时文件
			const previewFiles = exported.length > 0 ? exported : outputFiles
			log.info(
				`[direct-gen] taskId=${taskId}: success, provider=${result.provider || 'unknown'}, outputs=${outputFiles.length}, exported=${exported.length}, renderPreviewFiles=${previewFiles.length}`
			)

			// 登记：蓝图 image 预览节点（由 useCLIAgentTrigger 轮询消费创建）
			enqueueCreateImageNodeRequests(taskId, previewFiles, String(payload?.prompt || ''))
			// 登记：Agent 对话框图片预览块（同上轮询消费，若对话上下文活跃会被渲染）
			enqueueChatImagePreviewBlocks(taskId, previewFiles, String(payload?.prompt || ''))

			taskStore.markTaskCompleted(taskId, outputFiles, exported)
			// 写入返回字段 nodeId / provider 给 HTTP 返回体使用（updateTask patch，不覆盖 completed 状态）
			const extra = {}
			if (result.provider) extra.provider = result.provider
			if (typeof result.nodeId === 'string' && result.nodeId) extra.nodeId = result.nodeId
			extra.pipelinePhase = 'p3-direct-completed'
			// 显式写入 meta：让用户通过 CLI task-status 能看到文件去向
			extra.meta = {
				pipelinePhase: 'p3-direct-completed',
				cliDirectCompletedAt: Date.now(),
				exportedFiles: exported,
				outputFiles: outputFiles,
				targetOutputPath: resolved.targetPath,
				autoExportEffective: exported.length > 0
			}
			const noteParts = []
			noteParts.push(
				`Seedream direct success; ${previewFiles.length} image preview nodes queued for blueprint render`
			)
			if (exported.length > 0)
				noteParts.push(`autoExport OK: ${exported.length} file(s) copied to ${resolved.targetPath}`)
			else
				noteParts.push(
					`autoExport SKIPPED (outputPath empty or autoExport=false); files saved to temp location, still rendered in blueprint`
				)
			extra.note = noteParts.join('; ')
			taskStore.updateTask(taskId, extra)
			return true
		} else {
			log.warn(`[direct-gen] taskId=${taskId}: handler returned ok=false`)
			taskStore.markTaskFailed(taskId, 'generate_image handler returned ok=false')
			try {
				const t = _ensureMeta(taskId)
				if (t)
					taskStore.updateTask(taskId, {
						meta: { ...(t.meta || {}), pipelinePhase: 'p3-direct-failed-complete' }
					})
			} catch {
				/* ignore */
			}
			return true
		}
	} catch (err) {
		log.warn(
			`[direct-gen] taskId=${taskId}: direct execution failed (will fallback to frontend polling): ${err?.message || err}`
		)
		// 把 pipelinePhase 重置为允许 P2 接管的状态
		try {
			const t = _ensureMeta(taskId)
			if (t)
				taskStore.updateTask(taskId, {
					meta: { ...(t.meta || {}), pipelinePhase: 'p3-direct-failed-fallback-to-p2' }
				})
		} catch {
			/* ignore */
		}
		return false
	}
}

function buildDeps(injected = {}) {
	return {
		appVersion: injected.appVersion || process.env.npm_package_version || '0.2.4',
		// 为了让 service 在运行时能拿到 localdb（兜底 lastOpened 项目），保存 _ctxRef 指向 createContext 的结果
		_ctxRef: typeof injected._ctxRef === 'function' ? injected._ctxRef : () => injected.ctx || null,
		isAgentReady: () => {
			if (injected.isAgentReady) return injected.isAgentReady()
			return false
		},
		getBuiltinToolsCount: () =>
			injected.getBuiltinToolsCount ? injected.getBuiltinToolsCount() : 13,
		getCurrentProjectInfo: () => {
			if (injected.getCurrentProjectInfo) return injected.getCurrentProjectInfo()
			return null
		},
		submitGenerateImageTask: async (payload) => {
			// ===== 0) 同步预检查：缺 prompt、缺 API key（打包环境）直接返回错误，不创建 task =====
			const precheckErr = precheckGenerateImagePayload(payload || {})
			if (precheckErr) {
				log.warn(
					`submitGenerateImageTask: precheck failed code=${precheckErr.code} message=${precheckErr.message}`
				)
				return {
					ok: false,
					taskId: null,
					status: 'rejected',
					pipelinePhase: 'precheck-failed',
					submittedAt: new Date().toISOString(),
					error: {
						code: precheckErr.code,
						message: precheckErr.message,
						userAction: precheckErr.userAction || undefined
					},
					note: `Precheck rejected: ${precheckErr.code}. See error.message for instructions.`
				}
			}

			// ===== 0.5) Seedream 参数规范化：服务端兜底，将 width/height/aspect 转成蓝图面板原生的 seedreamSize(1K/2K/3K/4K) + seedreamAspectRatio(1:1/16:9...) 枚举
			//          并兼容 CLI 传入的宽高/比例混合参数。无论输入如何，输出都与蓝图节点底部参数面板完全对齐。
			const normalizedPayload = normalizeSeedreamPayloadForSubmission(payload || {})
			const resolvedEndpoint = resolveSeedreamEndpointFromPayload(normalizedPayload)
			normalizedPayload.seedreamModelVersion = resolvedEndpoint
			if (!normalizedPayload.model) normalizedPayload.model = resolvedEndpoint
			if (!normalizedPayload.imageModel) normalizedPayload.imageModel = resolvedEndpoint

			// ===== 默认 outputPath：用户没传就落到 generated_media/<项目名>/images =====
			const rawOutputPath = normalizedPayload?.outputPath || ''
			const resolved = normalizeOutputPathForExport(
				rawOutputPath,
				Number(normalizedPayload?.seedreamQuantity || normalizedPayload?.imageCount || 1)
			)
			try {
				if (resolved.autoMkdirParent) fs.mkdirSync(resolved.autoMkdirParent, { recursive: true })
			} catch (mkdirErr) {
				log.warn(
					`submitGenerateImageTask: mkdir default output dir warning (harmless): ${mkdirErr?.message || mkdirErr}`
				)
			}
			const safePayload = {
				...normalizedPayload,
				outputPath: resolved.targetPath
			}
			const task = taskStore.createTask('generate-image', safePayload)
			log.info(
				`submitGenerateImageTask: taskId=${task.taskId}, seedream size=${safePayload.seedreamSize} ar=${safePayload.seedreamAspectRatio} quantity=${safePayload.seedreamQuantity} n=${safePayload.n} endpoint=${resolvedEndpoint.slice(0, 30)}..., outputPath=${resolved.targetPath}`
			)
			taskStore.markTaskRunning(task.taskId, null)
			// 登记 promptPreview，给预览节点/对话命名用（尽早写，避免 fire-and-forget 启动前有一段 gap）
			try {
				const t = _ensureMeta(task.taskId)
				if (t) {
					taskStore.updateTask(task.taskId, {
						meta: {
							...(t.meta || {}),
							promptPreview: String(safePayload.prompt || '').slice(0, 120),
							pipelinePhase: 'p3-direct-pending',
							seedreamResolved: {
								size: safePayload.seedreamSize,
								aspectRatio: safePayload.seedreamAspectRatio,
								quantity: safePayload.seedreamQuantity,
								endpoint: resolvedEndpoint,
								width: safePayload.width,
								height: safePayload.height
							}
						}
					})
				}
			} catch {
				/* ignore */
			}

			// ===== FIRE-AND-FORGET =====
			// tryDirectGenerateImage 会真正调用 generate_image tool（seedream 直连），
			// 典型耗时 30s~5min，**绝对不能在 submit 的 HTTP 响应路径里 await**。
			// 之前同步 await 导致客户端 30s 超时把任务提交本身给打断（任务其实创建了但客户端拿不到 taskId）。
			// 现在：HTTP 在 100ms 内返回 taskId，客户端通过 wait-task / get-task 轮询进度。
			// 直连成功 → taskStore.markTaskCompleted；直连失败 → pipelinePhase 复位为 p3-direct-failed-fallback-to-p2（必须是这个名字，P2 分派条件才放行），前端轮询接管；
			// 两种情况都由轮询通道（/v1/tasks/:id）反馈结果。
			Promise.resolve()
				.then(async () => {
					const directOk = await tryDirectGenerateImage(task.taskId, safePayload)
					if (!directOk) {
						log.info(
							`taskId=${task.taskId}: direct execution unavailable, fallback to P2 frontend dispatch`
						)
						try {
							const cur = taskStore.getTask(task.taskId)
							// 若 task 已被别的路径（P2/P1/预检查）标记 completed/failed，不动它
							if (cur && cur.status !== 'running') return
							const t = _ensureMeta(task.taskId)
							if (t) {
								taskStore.updateTask(task.taskId, {
									meta: {
										...(t.meta || {}),
										// 关键：必须是 p3-direct-failed-fallback-to-p2，才能通过 useCLIAgentTrigger 分派守卫
										pipelinePhase: 'p3-direct-failed-fallback-to-p2'
									}
								})
							}
						} catch {
							/* ignore */
						}
					}
				})
				.catch((err) => {
					log.warn(
						`taskId=${task.taskId}: fire-and-forget direct path unhandled error (fallback to P2): ${err?.message || err}`
					)
					try {
						const cur = taskStore.getTask(task.taskId)
						if (cur && cur.status === 'running') {
							const t = _ensureMeta(task.taskId)
							const errMsg = String(err?.message || err || 'P3 unhandled exception')
							if (t) {
								taskStore.updateTask(task.taskId, {
									meta: {
										...(t.meta || {}),
										pipelinePhase: 'p3-direct-failed-fallback-to-p2',
										errorPreview: errMsg,
										errorCode: err?.code || 'P3_UNHANDLED_EXCEPTION'
									},
									note: `P3 direct path threw an error, fallback to P2. Preview: ${errMsg.slice(0, 200)}`
								})
							}
						}
					} catch {
						/* ignore */
					}
				})

			return {
				ok: true,
				taskId: task.taskId,
				status: taskStore.getTask(task.taskId)?.status || 'running',
				pipelinePhase: 'p3-direct-pending',
				submittedAt: new Date().toISOString(),
				note: 'Task queued for direct execution (seedream priority). Poll get-task or use wait-task for progress. If no API key is configured later, poll will surface the failure with an actionable error.'
			}
		},
		getTask: (taskId) => taskStore.getTask(taskId),
		cancelTask: (taskId) => {
			const task = taskStore.markTaskCancelled(taskId)
			return task ? { ok: true, task } : { ok: false, error: 'TASK_NOT_FOUND' }
		}
	}
}

export async function initCliControlService(injected = {}) {
	if (_started) {
		return { ok: true, port: getCliControlServerPort(), alreadyStarted: true }
	}
	try {
		_deps = buildDeps(injected)
		const result = await httpStart(_deps)
		_started = result.ok
		return result
	} catch (err) {
		log.error(`initCliControlService failed: ${err.message}`)
		return { ok: false, error: err.message }
	}
}

export function shutdownCliControlService() {
	try {
		_started = false
		return httpStop()
	} catch (err) {
		log.warn(`shutdownCliControlService error: ${err.message}`)
		return { ok: false, error: err.message }
	}
}

// ===== IPC Handler 可调用的公开方法 =====

export function getServerStatus() {
	const port = getCliControlServerPort()
	const appVersion = _deps?.appVersion || process.env.npm_package_version || '0.2.4'
	// 组装 currentProject：带默认落盘目录方便 status 展示
	const injectedProject = _deps?.getCurrentProjectInfo ? _deps.getCurrentProjectInfo() : null
	const fallbackProject = resolveCurrentProjectForOutput()
	const currentProject =
		injectedProject?.rootDir || injectedProject?.rootPath || injectedProject?.rootDirPath
			? injectedProject
			: {
					id: fallbackProject.id || undefined,
					name: fallbackProject.name,
					rootDir: fallbackProject.rootDir || undefined
				}
	const defaultImageOutputDir = resolveDefaultOutputDir({ kind: 'images' })
	const agentReady = _deps?.isAgentReady ? _deps.isAgentReady() : false
	const builtinToolsCount = _deps?.getBuiltinToolsCount ? _deps.getBuiltinToolsCount() : 13
	const allTasks = taskStore.listTasks({ limit: 500, offset: 0 })
	return {
		ok: true,
		running: !!_started,
		port,
		host: '127.0.0.1',
		started: _started,
		app: {
			name: 'DVStudio',
			version: appVersion,
			currentProject: currentProject || null,
			defaultOutputs: {
				images: defaultImageOutputDir,
				videos: resolveDefaultOutputDir({ kind: 'videos' })
			}
		},
		agent: {
			ready: agentReady,
			runtime: 'dvsagent'
		},
		mcp: {
			builtinToolsCount
		},
		stats: {
			totalTasks: allTasks.total
		}
	}
}

export function getTask(taskId) {
	const task = taskStore.getTask(taskId)
	return { ok: !!task, task }
}

export function listTasks(payload = {}) {
	const result = taskStore.listTasks(payload || {})
	return {
		ok: true,
		tasks: result.tasks,
		total: result.total,
		limit: result.limit,
		offset: result.offset
	}
}

// P2: 前端桥接完成/失败回调（通过 IPC handlers 调用）
export function markTaskCompleted(taskId, outputFiles, exportedFiles, extraMeta) {
	const updated = taskStore.markTaskCompleted(taskId, outputFiles, exportedFiles)
	if (!updated) return null
	// P2/P1 路径也补充图片节点 & 聊天预览块（如果 tool 层未补）：保证三种路径行为一致
	try {
		if (Array.isArray(exportedFiles) && exportedFiles.length > 0) {
			const taskAfter = taskStore.getTask(taskId)
			const hadNodeReqs =
				Array.isArray(taskAfter?.meta?.createImageNodeRequests) &&
				taskAfter.meta.createImageNodeRequests.length > 0
			const hadChatBlocks =
				Array.isArray(taskAfter?.meta?.chatPreviewBlocks) &&
				taskAfter.meta.chatPreviewBlocks.length > 0
			if (!hadNodeReqs)
				enqueueCreateImageNodeRequests(
					taskId,
					exportedFiles,
					String(extraMeta?.prompt || taskAfter?.payload?.prompt || '')
				)
			if (!hadChatBlocks)
				enqueueChatImagePreviewBlocks(
					taskId,
					exportedFiles,
					String(extraMeta?.prompt || taskAfter?.payload?.prompt || '')
				)
		}
		if (extraMeta && typeof extraMeta === 'object') {
			const merged = { ...(taskStore.getTask(taskId)?.meta || {}), ...extraMeta }
			taskStore.updateTask(taskId, { meta: merged })
		}
	} catch (err) {
		log.warn(`markTaskCompleted: post-process enqueue failed (swallowed): ${err?.message || err}`)
	}
	return { ok: true, task: taskStore.getTask(taskId) }
}

export function markTaskFailed(taskId, error) {
	const updated = taskStore.markTaskFailed(taskId, error)
	if (!updated) return null
	return { ok: true, task: updated }
}

/**
 * 前端调用（useCLIAgentTrigger 消费完预览请求后）：把 meta 的增量 patch 写回 task.meta
 * 不允许覆盖 payload/outputFiles/exportedFiles/status 关键状态，仅可写 meta + 自定义非核心字段
 */
export function acknowledgeTaskMeta(taskId, patch) {
	const t = taskStore.getTask(taskId)
	if (!t) return { ok: false, error: 'TASK_NOT_FOUND' }
	const safePatch = { meta: { ...(t.meta || {}) } }
	if (patch && typeof patch === 'object') {
		if (patch.meta && typeof patch.meta === 'object') {
			safePatch.meta = { ...safePatch.meta, ...patch.meta }
		}
		// 支持顶层 meta 字段（如 createImageNodeRequests 直接在 patch 里）
		const META_FIELDS = [
			'createImageNodeRequests',
			'chatPreviewBlocks',
			'_createdImageNodeIds',
			'promptPreview',
			'pipelinePhase',
			'note'
		]
		const metaAny = /** @type {any} */ (safePatch.meta)
		const patchAny = /** @type {any} */ (patch)
		for (const key of META_FIELDS) {
			if (Object.prototype.hasOwnProperty.call(patch, key)) metaAny[key] = patchAny[key]
		}
	}
	const updated = taskStore.updateTask(taskId, safePatch)
	return { ok: true, task: updated }
}

/**
 * 前端调用：取消任务（best-effort；对于已进入 P3 后端直连执行中的任务：标记 cancelled，
 * 若 Ark 直连支持取消 token 则同时取消，否则等执行完后状态依旧保持 cancelled（不再消费预览）。）
 */
export function cancelTaskById(taskId) {
	const t = taskStore.getTask(taskId)
	if (!t) return { ok: false, error: 'TASK_NOT_FOUND' }
	const cancelled = taskStore.markTaskCancelled(taskId)
	return cancelled ? { ok: true, task: cancelled } : { ok: false, error: 'CANCEL_FAILED' }
}
