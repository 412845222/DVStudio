import type { InputParamPreviewRef } from './index'
import type { WorkflowNodeChatSelectedRef } from '../../../aiworkflow/types'

/**
 * chatState / refs / params 的规范化与深比较工具集
 * - 避免引用变化导致不必要重渲染
 * - 保证“值相等则序列化稳定”
 * - 纯函数，无副作用
 */

/**
 * NodeChatInput 序列化时用于分隔 chip 的 marker。
 * 注意：必须是一个极不可能在正常用户输入中出现的字符（此处选 U+0001 SOH）。
 * 全仓所有序列化/还原必须共用同一常量。
 */
export const CHIP_MARKER = '\u0001'

export interface SimplifiedNodeChatSubmitRef {
	kind: string
	edgeId?: string
	fromNodeId?: string
	fromAnchorId?: string
	label?: string
	previewUrl?: string
}

export interface SimplifiedNodeChatSubmit {
	prompt: string
	selectedReferences: SimplifiedNodeChatSubmitRef[]
}

const normalizeKind = (kindLike: unknown): string => {
	const raw =
		typeof kindLike === 'string'
			? kindLike
			: typeof (kindLike as any)?.type === 'string'
				? String((kindLike as any).type)
				: ''
	const k = raw.trim().toLowerCase()
	if (!k) return 'other'
	return k
}

const kindToLabelPrefix = (k: string): string => {
	switch (k) {
		case 'image':
			return '参考图'
		case 'video':
			return '参考视频'
		case 'model3d':
		case 'blender':
		case 'tripo3d':
		case 'meshy':
			return '参考模型'
		case 'audio':
			return '参考音频'
		case 'text':
		case 'scene':
			return '参考文本'
		default:
			return '参考'
	}
}

type RefLike =
	| InputParamPreviewRef
	| WorkflowNodeChatSelectedRef
	| {
			kind?: unknown
			type?: unknown
			edgeId?: unknown
			fromNodeId?: unknown
			fromAnchorId?: unknown
			label?: unknown
			name?: unknown
			previewUrl?: unknown
			[other: string]: unknown
	  }
	| null
	| undefined

const pickMinRef = (r: RefLike): SimplifiedNodeChatSubmitRef => {
	const obj = (r ?? {}) as Record<string, unknown>
	const kind = normalizeKind(typeof obj.kind !== 'undefined' ? obj.kind : obj.type)
	return {
		kind,
		edgeId: typeof obj.edgeId === 'string' && obj.edgeId ? obj.edgeId : undefined,
		fromNodeId: typeof obj.fromNodeId === 'string' && obj.fromNodeId ? obj.fromNodeId : undefined,
		fromAnchorId:
			typeof obj.fromAnchorId === 'string' && obj.fromAnchorId ? obj.fromAnchorId : undefined,
		label:
			typeof obj.label === 'string'
				? obj.label
				: typeof obj.name === 'string'
					? obj.name
					: undefined,
		previewUrl: typeof obj.previewUrl === 'string' && obj.previewUrl ? obj.previewUrl : undefined
	}
}

/**
 * 按@引用在 serializedDraft 中出现的顺序（即 CHIP_MARKER 顺序）把 chip 替换为
 * 「（参考图N）/（参考视频N）/（参考模型N）/（参考音频N）/（参考N）」。
 *
 * 返回：
 *   - prompt：可直接发给任务服务 / 大模型的人类可读文本（已替换每个 chip 位置）
 *   - selectedReferences：与 CHIP_MARKER 顺序严格一致的最小化引用数组
 *
 * 保证：
 *   - 同 kind 按首次出现顺序编号
 *   - CHIP_MARKER 数量与 refs 长度不一致时，以较小者为准，避免越界崩溃
 */
export function simplifySelectedRefsForSubmit(
	serializedDraft: string,
	selectedRefs: readonly RefLike[]
): SimplifiedNodeChatSubmit {
	const src = typeof serializedDraft === 'string' ? serializedDraft : ''
	const refs = Array.isArray(selectedRefs) ? selectedRefs : []
	const parts = src.split(CHIP_MARKER)
	const chipCount = Math.max(0, parts.length - 1)
	const safeChipCount = Math.min(chipCount, refs.length)

	const kindCounters = new Map<string, number>()
	const simplifiedRefs: SimplifiedNodeChatSubmitRef[] = []
	let prompt = ''
	for (let i = 0; i < parts.length; i++) {
		prompt += parts[i]
		if (i >= safeChipCount) continue
		const rawRef = refs[i]
		const minRef = pickMinRef(rawRef)
		const prefix = kindToLabelPrefix(minRef.kind)
		const nextIdx = (kindCounters.get(prefix) ?? 0) + 1
		kindCounters.set(prefix, nextIdx)
		simplifiedRefs.push(minRef)
		prompt += `（${prefix}${nextIdx}）`
	}

	// 如果 refs 比 CHIP_MARKER 多，剩余 refs 按出现顺序（在 chip 之后）继续编号并追加到 prompt 末尾（用空格分隔），
	// 避免静默丢失用户显式选择的引用。
	if (refs.length > safeChipCount) {
		for (let i = safeChipCount; i < refs.length; i++) {
			const minRef = pickMinRef(refs[i])
			const prefix = kindToLabelPrefix(minRef.kind)
			const nextIdx = (kindCounters.get(prefix) ?? 0) + 1
			kindCounters.set(prefix, nextIdx)
			simplifiedRefs.push(minRef)
			if (prompt.length) prompt += ' '
			prompt += `（${prefix}${nextIdx}）`
		}
	}

	return { prompt, selectedReferences: simplifiedRefs }
}

type SelectedRefish =
	| InputParamPreviewRef
	| WorkflowNodeChatSelectedRef
	| {
			edgeId?: unknown
			fromNodeId?: unknown
			fromAnchorId?: unknown
			kind?: unknown
			type?: unknown
			label?: unknown
			name?: unknown
			previewUrl?: unknown
			id?: unknown
			fromContent?: unknown
			toAnchorId?: unknown
			[other: string]: unknown
	  }

type Paramsish = Record<string, any> | null | undefined

const normalizeStr = (v: unknown): string => (typeof v === 'string' ? v : '')

const sameStr = (a: unknown, b: unknown) => normalizeStr(a) === normalizeStr(b)

/**
 * 对任意 ref 对象，计算稳定唯一 refKey：
 *   - 优先 edgeId
 *   - 否则 fromNodeId:fromAnchorId
 *   - 最后 fallback `${idx}:${kind}:${label}` 兜底避免空 key
 */
const computeRefKey = (
	r:
		| {
				edgeId?: unknown
				fromNodeId?: unknown
				fromAnchorId?: unknown
				kind?: unknown
				label?: unknown
		  }
		| null
		| undefined,
	fallbackIdx = 0
): string => {
	if (!r || typeof r !== 'object') return `__fallback_${fallbackIdx}__`
	const edgeId = normalizeStr((r as Record<string, unknown>).edgeId)
	if (edgeId) return edgeId
	const fromNodeId = normalizeStr((r as Record<string, unknown>).fromNodeId)
	const fromAnchorId = normalizeStr((r as Record<string, unknown>).fromAnchorId)
	if (fromNodeId || fromAnchorId) return `${fromNodeId}:${fromAnchorId}`
	const kind =
		typeof (r as Record<string, unknown>).kind === 'string'
			? String((r as Record<string, unknown>).kind)
			: typeof (r as Record<string, unknown>).type === 'string'
				? String((r as Record<string, unknown>).type)
				: ''
	const label =
		typeof (r as Record<string, unknown>).label === 'string'
			? String((r as Record<string, unknown>).label)
			: typeof (r as Record<string, unknown>).name === 'string'
				? String((r as Record<string, unknown>).name)
				: ''
	return `__fb_${fallbackIdx}_${kind}_${label}__`
}

/**
 * 对单条 @引用 规范化，返回一个可比较的稳定结构（键顺序固定）
 */
const normalizeRef = (r: SelectedRefish | null | undefined) => {
	if (!r || typeof r !== 'object') {
		return {
			kind: '',
			edgeId: '',
			fromNodeId: '',
			fromAnchorId: '',
			label: '',
			previewUrl: ''
		}
	}
	const raw = r as Record<string, unknown>
	const kind =
		typeof raw.kind === 'string' ? raw.kind : typeof raw.type === 'string' ? raw.type : ''
	return {
		kind,
		edgeId: normalizeStr(raw.edgeId),
		fromNodeId: normalizeStr(raw.fromNodeId),
		fromAnchorId: normalizeStr(raw.fromAnchorId),
		label: normalizeStr(typeof raw.label === 'string' ? raw.label : raw.name),
		previewUrl: normalizeStr(raw.previewUrl)
	}
}

/**
 * 对 @引用数组 排序 key（用于排序后深比较）
 * 优先级：edgeId > fromNodeId:fromAnchorId:kind > label
 */
const refSortKey = (r: ReturnType<typeof normalizeRef>) => {
	return [r.edgeId, `${r.fromNodeId}:${r.fromAnchorId}:${r.kind}`, r.label, r.previewUrl]
		.map((s) => s ?? '')
		.join('|')
}

const sortByKey = <T>(arr: T[], keyFn: (item: T) => string): T[] =>
	[...arr].sort((a, b) => {
		const ka = keyFn(a)
		const kb = keyFn(b)
		if (ka < kb) return -1
		if (ka > kb) return 1
		return 0
	})

/**
 * 深比较两组 @引用，内容相等返回 true
 */
export function areSelectedRefsEqual(
	a: readonly SelectedRefish[] | null | undefined,
	b: readonly SelectedRefish[] | null | undefined
): boolean {
	const arrA = Array.isArray(a) ? a : []
	const arrB = Array.isArray(b) ? b : []
	if (arrA.length !== arrB.length) return false
	const na = sortByKey(arrA.map(normalizeRef), refSortKey)
	const nb = sortByKey(arrB.map(normalizeRef), refSortKey)
	for (let i = 0; i < na.length; i++) {
		const xa = na[i]
		const xb = nb[i]
		if (
			xa.kind !== xb.kind ||
			xa.edgeId !== xb.edgeId ||
			xa.fromNodeId !== xb.fromNodeId ||
			xa.fromAnchorId !== xb.fromAnchorId ||
			xa.label !== xb.label ||
			xa.previewUrl !== xb.previewUrl
		) {
			return false
		}
	}
	return true
}

/**
 * 统一 refs 存储格式：去除 id/name/type/fromContent 等在 save/read 不一致时会导致
 * “相同引用因为字段不同而被误判为有差异 → 后续幂等跳过 emit” 的问题。
 *
 * 同时保证每个 ref 附带 refKey（edgeId 或 fromNodeId:fromAnchorId），
 * 供 NodeChatInput.vue 序列化/反序列化 chip 时一一对应，避免“仅按出现顺序
 * 匹配 refs，保存→回读时顺序变化导致 chip 错配/消失”。
 */
export type StoredNodeChatRef = {
	refKey: string
	kind: string
	label: string
	previewUrl: string
	edgeId?: string
	fromNodeId?: string
	fromAnchorId?: string
}

export function normalizeRefsForStorage(
	refs: readonly SelectedRefish[] | null | undefined
): StoredNodeChatRef[] {
	const src = Array.isArray(refs) ? refs : []
	const out: StoredNodeChatRef[] = []
	for (let i = 0; i < src.length; i++) {
		const n = normalizeRef(src[i])
		const base = {
			kind: n.kind,
			label: n.label,
			previewUrl: n.previewUrl,
			edgeId: n.edgeId ? n.edgeId : undefined,
			fromNodeId: n.fromNodeId ? n.fromNodeId : undefined,
			fromAnchorId: n.fromAnchorId ? n.fromAnchorId : undefined
		}
		const refKey = computeRefKey(base, i)
		out.push({ refKey, ...base })
	}
	return out
}

/**
 * 保证“存储值”与“草稿里的 CHIP_MARKER 顺序”严格对齐：
 *   - 若 draft 里包含 N 个 CHIP_MARKER，则结果长度严格 = N；
 *   - 优先用 chip 在 draft 中的相对顺序 + 引用键 (refKey) 匹配存储的 refs；
 *   - 无法匹配时退化为按出现顺序填充缺省占位，避免二次渲染时 chip 消失。
 *
 * 此函数专门修复：关闭对话框再打开（或 Ctrl+S 后重渲染）时，
 * props.selectedReferences 可能是“已排序的存储值”，而 NodeChatInput 的 renderFromModel
 * 只按出现顺序索引 refs —— 导致 chip 对应关系错位 / 找不到 / 错放。
 */
export function matchSelectedRefsWithSerializedDraft(
	serializedDraft: string,
	storedRefs: readonly SelectedRefish[] | null | undefined
): StoredNodeChatRef[] {
	const normalized = normalizeRefsForStorage(storedRefs)
	const draft = typeof serializedDraft === 'string' ? serializedDraft : ''
	const chipCount = Math.max(0, draft.split(CHIP_MARKER).length - 1)

	// ===== 关键修复：简化对齐逻辑，避免过度 byKey 匹配导致自己把自己坑 =====
	//
	// 背景：serializedDraft 里只有一个一个 \u0001（CHIP_MARKER），没有携带任何 refKey。
	// 因此我们**没有任何办法根据 draft 本身去反推第 i 个 marker 对应的是哪个上游引用**。
	//
	// 这意味着任何 "byKey 对齐" 或 "假设 marker 顺序 ≠ refs 顺序" 的做法，
	// 在缺少额外信息源时，最终都退化为"凭运气匹配"，反而常常把正常能工作的
	// "按顺序填充"搞坏（最终走到 __missing_N__ "引用丢失" 的占位分支）。
	//
	// 保守且稳定的行为：
	//  1. chipCount === 0 → 直接返回 normalized（纯引用无文本的边界场景）
	//  2. chipCount === normalized.length → 按 normalized 原顺序原样返回（长度严格对齐）
	//     （syncFromProps / syncFromEngine / selectedRefsForInput 已确保顺序 = chip 出现顺序，
	//      因为每次 syncFromDOM 也是按 chip 在 DOM 中出现的顺序收集 refs）
	//  3. chipCount < normalized.length → 取前 chipCount 个（截断，避免越界）
	//  4. chipCount > normalized.length → 前 normalized.length 个填真实 ref，
	//     剩余 (chipCount - normalized.length) 个填充缺失占位，保证数量对齐，
	//     不在 DOM 中静默丢掉 marker 位置的 chip

	if (chipCount === 0) return normalized
	if (chipCount === normalized.length) return normalized.slice()

	const result: StoredNodeChatRef[] = []
	const safeCount = Math.min(chipCount, normalized.length)
	for (let i = 0; i < safeCount; i++) result.push(normalized[i])
	const missingCount = Math.max(0, chipCount - normalized.length)
	for (let i = 0; i < missingCount; i++) {
		result.push({
			refKey: `__missing_${safeCount + i}__`,
			kind: '',
			label: '引用丢失',
			previewUrl: '',
			edgeId: undefined,
			fromNodeId: undefined,
			fromAnchorId: undefined
		})
	}
	return result
}

/**
 * 对 params 对象做键排序，返回稳定 JSON 字符串（用于 isEqual / stableParamsKey）
 * - 递归：遇到子对象也键排序
 * - 函数 / undefined / Symbol 等 JSON 不支持值处理为字符串以保持比较稳定
 */
const stableJsonOf = (value: unknown, seen = new WeakSet()): string => {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	const t = typeof value
	if (t === 'string') return JSON.stringify(value)
	if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value)
	if (t === 'function' || t === 'symbol') return JSON.stringify(String(value))
	if (value instanceof Date) return JSON.stringify(value.toISOString())
	if (value instanceof RegExp) return JSON.stringify(String(value))
	if (t === 'object') {
		if (Array.isArray(value)) {
			return `[${value.map((v) => stableJsonOf(v, seen)).join(',')}]`
		}
		if (seen.has(value as object)) return '"[Circular]"'
		seen.add(value as object)
		const keys = Object.keys(value as object).sort()
		const parts = keys.map(
			(k) => `${JSON.stringify(k)}:${stableJsonOf((value as Record<string, unknown>)[k], seen)}`
		)
		return `{${parts.join(',')}}`
	}
	return 'null'
}

/**
 * 深比较两组 params，内容相等返回 true（与默认参数无关的纯内容比较）
 */
export function areParamsEqual(a: Paramsish, b: Paramsish): boolean {
	const left = a && typeof a === 'object' ? (a as Record<string, unknown>) : {}
	const right = b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
	return stableJsonOf(left) === stableJsonOf(right)
}

/**
 * 稳定的 params key（用于替代 NodeChatParamPanel 的 `JSON.stringify(currentParams)`）
 * 保证键顺序变化、NaN/undefined 等不会导致虚假重建
 */
export function stableParamsKey(params: Paramsish): string {
	if (!params || typeof params !== 'object') return 'empty'
	return stableJsonOf(params as Record<string, unknown>)
}

/**
 * 规范化 Vuex 中的 chatState 快照对象，保证字段稳定
 * - selectedRefs 排序 + 字段规范化
 * - params 键排序（通过 normalizeParams）
 * - 未提供字段补默认
 */
export type StoreChatDialogSnapshot = {
	nodeId?: string | null
	visible?: boolean
	draft?: string
	params?: Record<string, any>
	selectedRefs?: WorkflowNodeChatSelectedRef[]
	submitting?: boolean
	nodeType?: string | null
}

const normalizeParamsForStore = (params: unknown) => {
	if (!params || typeof params !== 'object') return {}
	try {
		return JSON.parse(stableJsonOf(params as Record<string, unknown>))
	} catch {
		return {}
	}
}

export function normalizeChatStateForStore(snap: StoreChatDialogSnapshot | null | undefined) {
	const src = (snap ?? {}) as StoreChatDialogSnapshot
	const selectedRaw = Array.isArray(src.selectedRefs) ? src.selectedRefs : []
	const selectedNormalized = sortByKey(selectedRaw.map(normalizeRef), refSortKey).map((r) => ({
		...r,
		// 保留与 Store 兼容的字段冗余（name/type/id），但值一致避免 JSON 序列化差异
		name: r.label,
		type: r.kind,
		id: `${r.edgeId || ''}${r.fromNodeId ? `${r.fromNodeId}:${r.fromAnchorId}` : ''}`
	})) as WorkflowNodeChatSelectedRef[]
	return {
		nodeId: typeof src.nodeId === 'string' ? src.nodeId : (src.nodeId ?? null),
		visible: typeof src.visible === 'boolean' ? src.visible : false,
		nodeType: typeof src.nodeType === 'string' ? src.nodeType : (src.nodeType ?? null),
		draft: typeof src.draft === 'string' ? src.draft : '',
		submitting: typeof src.submitting === 'boolean' ? src.submitting : false,
		params: normalizeParamsForStore(src.params),
		selectedRefs: selectedNormalized
	}
}

export type NormalizedChatStateForStore = ReturnType<typeof normalizeChatStateForStore>

/**
 * 比较两个 Store 规范化后的快照是否内容相等
 */
export function isChatStateSnapshotEqual(
	a: NormalizedChatStateForStore | null | undefined,
	b: NormalizedChatStateForStore | null | undefined
): boolean {
	const left = a ?? normalizeChatStateForStore(null)
	const right = b ?? normalizeChatStateForStore(null)
	return (
		left.nodeId === right.nodeId &&
		left.visible === right.visible &&
		left.nodeType === right.nodeType &&
		left.draft === right.draft &&
		left.submitting === right.submitting &&
		areParamsEqual(left.params, right.params) &&
		areSelectedRefsEqual(left.selectedRefs, right.selectedRefs)
	)
}
