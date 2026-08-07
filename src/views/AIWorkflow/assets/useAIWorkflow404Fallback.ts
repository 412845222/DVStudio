import { onBeforeUnmount, ref } from 'vue'
import type { Store } from 'vuex'
import { t } from '../../../i18n'
import {
	isElectron,
	diagnoseDwebAsset,
	validateDwebProjectRoot,
	type DwebAssetDiagnoseResult
} from '../../../electronBridge'
import type { WorkflowResource } from '../../../aiworkflow/resource/types'
import type { WorkflowState } from '../../../aiworkflow/types'
import {
	classifyResourceUrl,
	isStrictResourceMissingFilterEnabled,
	normalizeForBindingMatch,
	extractAssetIdFromUrl,
	isStrictMissingSourceBindingEnabled,
	isNodeSelectionDebounceEnabled,
	isUnknownCleanupEnabled,
	isAutoRecoverPersistEnabled,
	isAutoRecoverNoopSuppressEnabled,
	isResourceManagerThumbSkipGlobalEnabled,
	isRecoverToastBatchEnabled,
	isRecoveredPersistEnabled
} from './useAIWorkflowResourceUrlClassifier'
import {
	loadPersistedIgnoreList,
	markUrlCancelled,
	markUrlRemoved,
	isUrlIgnoredBySnapshot
} from './useAIWorkflowResourceIgnoreList'
import {
	loadPersistedRecoveredUrls,
	markUrlRecovered,
	isUrlRecovered
} from './useAIWorkflowResourceRecoveredList'

/**
 * 404 错误回退处理结果
 */
export type Fallback404Result =
	| { kind: 'recovered'; url: string; assetName: string; repairedUrl: string; newAsset?: unknown }
	| {
			kind: 'missing'
			url: string
			assetName: string
			missingPath: string
			sources: ResourceBindingSource[]
	  }
	| { kind: 'non_dweb'; url: string }
	| { kind: 'ignored'; url: string; reason: string }

/**
 * 错误调用来源（定位到具体节点/资源记录）
 */
export type ResourceBindingSource = {
	type: 'resource' | 'node_input' | 'node_output' | 'node_param' | 'preview' | 'poster' | 'unknown'
	resourceId?: string
	nodeId?: string
	nodeType?: string
	field?: string
	detail?: string
}

type WorkflowNodeLike = {
	type?: string
	nodeType?: string
	inputs?: unknown
	outputs?: unknown
	imageUrl?: string
	videoUrl?: string
	modelUrl?: string
	thumbnailUrl?: string
	src?: string
	url?: string
	posterUrl?: string
	previewUrl?: string
	[key: string]: unknown
}

/**
 * 待用户确认的缺失资产信息
 */
export type PendingMissingAsset = {
	id: string
	url: string
	assetName: string
	requestedPath: string
	absolutePath?: string
	sources: ResourceBindingSource[]
	similarFiles?: Array<{ name: string; path: string }>
	diagnostics?: DwebAssetDiagnoseResult
	/** 撤销快照：执行删除前记录的备份数据，供「撤销」使用 */
	undoSnapshot?: {
		resourcesByIdPatch?: Record<string, WorkflowResource | null>
		nodePatches?: Array<{ nodeId: string; path: string; oldValue: unknown }>
	}
	/** 是否已处理（用户确认或取消） */
	resolved?: boolean
	/** 处理结果：'removed' | 'cancelled' */
	resolution?: 'removed' | 'cancelled'
}

/**
 * 解析 dweb://project-assets URL，提取 projectId 和 path 参数。
 * 纯前端实现，不依赖网络。
 */
export function parseDwebProjectAssetUrl(url: string): {
	projectId: number | null
	relPath: string
	variant?: string
	maxSize?: number
	version?: string
} | null {
	const trimmed = String(url || '').trim()
	if (!trimmed) return null
	if (!trimmed.startsWith('dweb://project-assets') && !trimmed.startsWith('dweb:project-assets'))
		return null
	try {
		const u = new URL(trimmed)
		const projectIdRaw = u.searchParams.get('projectId')
		const relPath = u.searchParams.get('path') || ''
		const variant = u.searchParams.get('variant') || u.searchParams.get('mode') || undefined
		const maxSizeRaw = u.searchParams.get('maxSize') || u.searchParams.get('max_size')
		const version = u.searchParams.get('v') || undefined
		const pid = Number(projectIdRaw)
		return {
			projectId: Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : null,
			relPath,
			variant: variant || undefined,
			maxSize: maxSizeRaw ? Number(maxSizeRaw) : undefined,
			version: version || undefined
		}
	} catch {
		return null
	}
}

/**
 * 判断 URL 是否是 dweb://project-assets 资源 URL
 */
export function isDwebProjectAssetUrl(url: string): boolean {
	return parseDwebProjectAssetUrl(url) !== null
}

/**
 * 404 兜底恢复系统选项
 */
export interface AIWorkflow404FallbackOptions {
	/** 获取当前项目 ID（number），用于调用主进程诊断 */
	getCurrentProjectId: () => number | null
	/** 获取当前项目根路径（磁盘真实路径），用于重注册 projectRoot */
	getCurrentProjectRootPath?: () => string | null
	/** 获取 Vuex store，用于写入资源/节点修复结果 */
	getStore?: () => Store<WorkflowState>
	/** 从 url 查找绑定该 url 的节点/资源（来源定位） */
	findBindingSources?: (url: string) => ResourceBindingSource[]
	/** 恢复成功回调（重新加载资源、刷新节点显示） */
	onRecovered?: (result: {
		url: string
		newUrl: string
		assetName: string
		newAsset?: unknown
	}) => void
	/** 找到缺失资产（文件确实不存在）回调，通常用于弹确认框 */
	onMissingAsset?: (pending: PendingMissingAsset) => void
	/** 用户确认"移除失效引用"完成后的回调（用于触发项目保存、写外部日志等） */
	onAfterConfirmRemove?: (payload: {
		pendingId: string
		url: string
		assetName: string
		undoAvailable: boolean
		skippedDestructiveOps: boolean
	}) => void
	/** O4：批量自动恢复完成回调（一次批的聚合，替代多次 onRecovered，可用于批量持久化） */
	onRecoveredBatch?: (
		batch: Array<{ url: string; newUrl: string; assetName: string; newAsset?: unknown }>
	) => void
	/** 用户点击"暂不处理"完成后的回调（通常不需要特殊操作，留作扩展） */
	onAfterCancel?: (payload: { pendingId: string; url: string; assetName: string }) => void
	/** Toast 通知函数 */
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
	/** 批量窗口（ms）：同一批 404 错误在窗口内合并处理，避免抖动 */
	batchWindowMs?: number
}

export function useAIWorkflow404Fallback(options: AIWorkflow404FallbackOptions) {
	const {
		getCurrentProjectId,
		getCurrentProjectRootPath,
		getStore,
		findBindingSources,
		onRecovered,
		onRecoveredBatch,
		onMissingAsset,
		onAfterConfirmRemove,
		onAfterCancel,
		pushToast
	} = options
	const batchWindowMs = Math.max(50, Number(options?.batchWindowMs) || 400)

	/** 已触发过自动恢复的 URL（去重，避免死循环） */
	const autoRecoveredUrls = new Set<string>()
	/** 当前正在处理中的 URL（防止并发重复诊断） */
	const inflightUrls = new Map<string, Promise<Fallback404Result>>()
	/** 延迟批处理队列 */
	const pendingBatch = new Set<string>()
	let batchTimer: number | null = null

	/**
	 * O2.1：sessionFailedOnceUrls —— 当前会话中至少失败过一次的"规格化 URL"集合。
	 * 命中后直接进入 pending 流程（不再重新诊断磁盘），避免 img onerror 反复触发诊断。
	 * （关闭 isNodeSelectionDebounceEnabled 时此集合不生效）
	 */
	const sessionFailedOnceUrls = new Set<string>()
	/**
	 * O5.2：sessionResolvedUrls —— 当前会话中用户已通过 confirm/cancel 明确处理过的"规格化 URL"集合。
	 * 命中后直接 early return ignored（不再触发任何弹窗/诊断），避免同一 URL 在节点反复选中/切换时重复弹窗。
	 */
	const sessionResolvedUrls = new Set<string>()

	/* ============== O4：Toast 批聚合 + onRecoveredBatch ============== */
	const RECOVER_TOAST_BATCH_WINDOW_MS = 1500
	const RECOVER_TOAST_MAX_INDIVIDUAL = 3
	type RecoverBatchItem = { url: string; newUrl: string; assetName: string; newAsset?: unknown }
	let recoverBatch: RecoverBatchItem[] = []
	let recoverBatchTimer: number | null = null

	const flushRecoverBatch = () => {
		recoverBatchTimer = null
		const items = recoverBatch
		recoverBatch = []
		if (items.length === 0) return

		// O4：聚合 Toast
		if (isRecoverToastBatchEnabled() && items.length > RECOVER_TOAST_MAX_INDIVIDUAL) {
			const top = items
				.slice(0, RECOVER_TOAST_MAX_INDIVIDUAL)
				.map((i) => i.assetName)
				.join('、')
			notify(
				t('aiworkflow.toast.resourceRecoveredBatch', { count: items.length, top }) as string,
				'info'
			)
		} else {
			for (const it of items) {
				notify(t('aiworkflow.toast.resourceRecovered', { name: it.assetName }), 'info')
			}
		}

		// O4：批量回调（供 AIWorkflowPage 做一次 saveProject）
		if (typeof onRecoveredBatch === 'function') {
			try {
				onRecoveredBatch(items)
			} catch (err) {
				console.warn('[404-fallback] onRecoveredBatch hook error:', err)
			}
		}
	}

	const enqueueRecoverBatch = (item: RecoverBatchItem) => {
		recoverBatch.push(item)
		if (recoverBatchTimer !== null) window.clearTimeout(recoverBatchTimer)
		recoverBatchTimer = window.setTimeout(flushRecoverBatch, RECOVER_TOAST_BATCH_WINDOW_MS)
	}

	/** O2.2：onMissingAsset 调用防抖（短时间内同一个 pending 不重复调 callback） */
	let lastMissingAssetEmitAtByNormUrl = new Map<string, number>()
	const MISSING_ASSET_EMIT_MIN_INTERVAL_MS = 800

	/** 缺失资产确认队列（待用户确认） */
	const pendingMissingAssets = ref<PendingMissingAsset[]>([])
	/** 已处理的历史（保留 undo 快照） */
	const removedAssetsHistory: PendingMissingAsset[] = []
	/** 当前是否在恢复流程中（用于禁用重复触发） */
	const recovering = ref(false)

	/** 通知函数封装 */
	const notify = (message: string, tone: 'info' | 'warn' | 'error' = 'info') => {
		if (typeof pushToast === 'function') {
			try {
				pushToast(message, tone)
			} catch {
				/* ignore */
			}
		} else {
			console.log(`[404-fallback:${tone}]`, message)
		}
	}

	/**
	 * 主入口：处理一次 dweb 资源 404 错误。
	 * 返回处理结果（recovered / missing / non_dweb / ignored）。
	 */
	async function handle404Error(
		url: string,
		source?: ResourceBindingSource
	): Promise<Fallback404Result> {
		const trimmed = String(url || '').trim()
		if (!trimmed) return { kind: 'ignored' as const, url: trimmed, reason: 'empty' }
		if (!isDwebProjectAssetUrl(trimmed)) return { kind: 'non_dweb' as const, url: trimmed }

		// 预计算规格化 URL（后续 session / ignore / pending 合并都复用）
		const normUrl = normalizeForBindingMatch(trimmed)
		const debounceOn = isNodeSelectionDebounceEnabled()

		/* ============== O5.2 / O2.1：最高优先级 session 级 early return ==============
		 * 任何情况下（即使 strict filter 全关），只要：
		 *   1) sessionResolvedUrls 命中规格化 URL → 用户本次会话已明确 confirm/cancel，直接忽略
		 *   2) autoRecoveredUrls 命中 raw URL → 已被自动恢复过，避免死循环
		 * ============== */
		if (debounceOn && normUrl !== '' && sessionResolvedUrls.has(normUrl)) {
			return { kind: 'ignored' as const, url: trimmed, reason: 'session:resolved' }
		}
		if (autoRecoveredUrls.has(trimmed)) {
			return { kind: 'ignored' as const, url: trimmed, reason: 'session:auto-recovered' }
		}

		/* ============== O5：跨会话 recovered 持久化 early return ==============
		 * 即使项目保存失败 / 用户手动改回旧 URL，跨会话也不再重复弹恢复通知。
		 * 与内存 autoRecoveredUrls 形成双保险。
		 * ============== */
		if (isRecoveredPersistEnabled()) {
			const pid = getCurrentProjectId?.() ?? null
			const snap = loadPersistedRecoveredUrls(pid, trimmed)
			if (snap.size > 0 && isUrlRecovered(snap, trimmed)) {
				return { kind: 'ignored' as const, url: trimmed, reason: 'persisted:recovered' }
			}
		}

		/* ================= 整改方案 O1.2 + O2.3：URL 分类 + 忽略表 early return =================
		 *
		 * 严格过滤器开启时（默认开）：
		 *   1) 对 transient_blob (blob:/data:) 直接忽略（不诊断、不弹窗）
		 *   2) 对 warmup_artifact (预热截图/缩略图缓存 URL) 直接忽略
		 *   3) 命中"用户已移除/暂不处理"持久化忽略表（三级：精确/规格化/assetId）的 URL 直接忽略
		 *
		 * 关闭 Feature Flag (DVS_RESOURCE_MISSING_STRICT_FILTER='0') 时：
		 *   跳过本节，走 100% 旧诊断行为。
		 */
		const strictFilterOn = isStrictResourceMissingFilterEnabled()
		if (strictFilterOn) {
			const category = classifyResourceUrl(trimmed)
			if (category === 'transient_blob') {
				return { kind: 'ignored' as const, url: trimmed, reason: 'category:transient_blob' }
			}
			if (category === 'warmup_artifact') {
				return { kind: 'ignored' as const, url: trimmed, reason: 'category:warmup_artifact' }
			}
			const pid = getCurrentProjectId?.() ?? null
			try {
				// O3.2：使用 loadPersistedIgnoreList(双源 projectId + 全局桶) + isUrlIgnoredBySnapshot(三级命中)
				const ignore = loadPersistedIgnoreList(pid, trimmed)
				if (isUrlIgnoredBySnapshot(ignore, trimmed, 'removed')) {
					return { kind: 'ignored' as const, url: trimmed, reason: 'ignore:removed' }
				}
				if (isUrlIgnoredBySnapshot(ignore, trimmed, 'cancelled')) {
					return { kind: 'ignored' as const, url: trimmed, reason: 'ignore:cancelled' }
				}
			} catch {
				/* 任何解析异常都不阻塞主流程 */
			}
		}
		/* ============ END O1.2 + O2.3 ============ */

		// 防止对同一个 URL 重复触发诊断
		const inflight = inflightUrls.get(trimmed)
		if (inflight) return inflight

		const promise: Promise<Fallback404Result> = (async () => {
			try {
				recovering.value = true

				// Step 1: 确保项目根正确注册
				const pid = getCurrentProjectId?.() ?? null
				if (pid != null && isElectron()) {
					const expectedRoot = getCurrentProjectRootPath?.() ?? null
					try {
						await validateDwebProjectRoot({
							projectId: pid,
							expectedRootPath: expectedRoot || undefined
						})
					} catch {
						/* ignore */
					}
				}

				// Step 2: 通过主进程 IPC 诊断该 URL 在磁盘上是否真实存在
				let diag: DwebAssetDiagnoseResult | null = null
				if (isElectron()) {
					try {
						diag = await diagnoseDwebAsset({ url: trimmed })
					} catch (err) {
						console.warn('[404-fallback] diagnoseDwebAsset threw:', err)
					}
				}

				const assetName =
					diag?.repairedAsset?.name ||
					parseDwebProjectAssetUrl(trimmed)?.relPath?.split('/').pop() ||
					trimmed.split('/').pop() ||
					trimmed

				// Step 3a: 文件确实存在 → 已被诊断逻辑解析出 repairedAsset，触发自动恢复
				if (diag?.fileExists && diag?.repairedAsset) {
					// ===== O2：伪恢复抑制 =====
					if (isAutoRecoverNoopSuppressEnabled()) {
						const noop = isRepairNoop(trimmed, diag.repairedAsset as any, getStore?.())
						if (noop) {
							autoRecoveredUrls.add(trimmed)
							if (normUrl !== '') sessionFailedOnceUrls.add(normUrl)
							if (isRecoveredPersistEnabled()) {
								const pidO5 = getCurrentProjectId?.() ?? null
								try {
									markUrlRecovered(pidO5, trimmed, trimmed)
								} catch {
									/* ignore */
								}
							}
							recovering.value = false
							return { kind: 'ignored' as const, url: trimmed, reason: 'autorecover:noop' }
						}
					}

					autoRecoveredUrls.add(trimmed)
					const newAsset = diag.repairedAsset
					const newUrl = newAsset.url
					console.info('[404-fallback] recovered via re-resolution:', {
						from: trimmed,
						to: newUrl,
						name: newAsset.name
					})
					// O4：批量聚合 Toast（替代直接 notify）
					enqueueRecoverBatch({ url: trimmed, newUrl, assetName: newAsset.name, newAsset })
					if (typeof onRecovered === 'function') {
						try {
							onRecovered({ url: trimmed, newUrl, assetName: newAsset.name, newAsset })
						} catch (err) {
							console.warn('[404-fallback] onRecovered hook error:', err)
						}
					}
					// O5：跨会话持久化 recovered URL
					if (isRecoveredPersistEnabled()) {
						const pidO5 = getCurrentProjectId?.() ?? null
						try {
							markUrlRecovered(pidO5, trimmed, trimmed)
						} catch {
							/* ignore */
						}
					}
					recovering.value = false
					return {
						kind: 'recovered' as const,
						url: trimmed,
						assetName: newAsset.name,
						repairedUrl: newUrl,
						newAsset
					}
				}

				// Step 3b: 注册丢失/无效 → 尝试重注册后再重试一次 HEAD
				if (diag && (!diag.registered || diag.suggestion === 're_register_root')) {
					const pid2 = diag.projectId || pid
					if (pid2 && isElectron()) {
						const expectedRoot = getCurrentProjectRootPath?.() ?? null
						try {
							const vr = await validateDwebProjectRoot({
								projectId: pid2,
								expectedRootPath: expectedRoot || undefined
							})
							if (vr?.validation?.valid) {
								// 重注册成功后再次诊断
								const diag2 = await diagnoseDwebAsset({ url: trimmed })
								if (diag2?.fileExists && diag2?.repairedAsset) {
									// ===== O2：伪恢复抑制 =====
									if (isAutoRecoverNoopSuppressEnabled()) {
										const noop = isRepairNoop(trimmed, diag2.repairedAsset as any, getStore?.())
										if (noop) {
											autoRecoveredUrls.add(trimmed)
											if (normUrl !== '') sessionFailedOnceUrls.add(normUrl)
											if (isRecoveredPersistEnabled()) {
												const pidO5b = getCurrentProjectId?.() ?? null
												try {
													markUrlRecovered(pidO5b, trimmed, trimmed)
												} catch {
													/* ignore */
												}
											}
											recovering.value = false
											return { kind: 'ignored' as const, url: trimmed, reason: 'autorecover:noop' }
										}
									}

									autoRecoveredUrls.add(trimmed)
									// O4：批量聚合 Toast（替代直接 notify）
									enqueueRecoverBatch({
										url: trimmed,
										newUrl: diag2.repairedAsset.url,
										assetName: diag2.repairedAsset.name,
										newAsset: diag2.repairedAsset
									})
									if (typeof onRecovered === 'function') {
										try {
											onRecovered({
												url: trimmed,
												newUrl: diag2.repairedAsset.url,
												assetName: diag2.repairedAsset.name,
												newAsset: diag2.repairedAsset
											})
										} catch (err) {
											console.warn('[404-fallback] onRecovered hook error:', err)
										}
									}
									// O5：跨会话持久化 recovered URL
									if (isRecoveredPersistEnabled()) {
										const pidO5b = getCurrentProjectId?.() ?? null
										try {
											markUrlRecovered(pidO5b, trimmed, trimmed)
										} catch {
											/* ignore */
										}
									}
									recovering.value = false
									return {
										kind: 'recovered' as const,
										url: trimmed,
										assetName: diag2.repairedAsset.name,
										repairedUrl: diag2.repairedAsset.url,
										newAsset: diag2.repairedAsset
									}
								}
							}
						} catch (err) {
							console.warn('[404-fallback] re-register project root failed:', err)
						}
					}
				}

				// Step 3c: 文件确实不存在 → 定位来源，添加到待确认队列
				//
				// O2.1 快速路径：如果 debounce 开启且 normUrl 已存在于 sessionFailedOnceUrls，
				// 则直接走"入 pending 队列"逻辑，不再重复诊断/定位来源（来源用上次结果）。
				let sources: ResourceBindingSource[]
				let relPath: string
				let usedDiag: DwebAssetDiagnoseResult | null | undefined = diag
				if (
					debounceOn &&
					normUrl !== '' &&
					sessionFailedOnceUrls.has(normUrl) &&
					!findBindingSources
				) {
					// 已失败过 → 来源用 defaultFindBindingSources 快速定位（磁盘诊断已做过）
					const parsed = parseDwebProjectAssetUrl(trimmed)
					relPath = parsed?.relPath || ''
					sources = defaultFindBindingSources(trimmed, getStore?.())
					usedDiag = undefined
				} else {
					const parsed = parseDwebProjectAssetUrl(trimmed)
					relPath = diag?.requestedPath || parsed?.relPath || ''
					sources =
						findBindingSources?.(trimmed) || defaultFindBindingSources(trimmed, getStore?.())
					// 首次失败：写入 sessionFailedOnceUrls，下次相同 normUrl 跳过磁盘诊断
					if (debounceOn && normUrl !== '') {
						sessionFailedOnceUrls.add(normUrl)
					}
				}
				if (source) sources.unshift(source)

				const pendingId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
				const pending: PendingMissingAsset = {
					id: pendingId,
					url: trimmed,
					assetName,
					requestedPath: relPath,
					absolutePath:
						usedDiag?.resolvedTo ||
						(usedDiag?.root && relPath
							? usedDiag.root.replace(/\\/g, '/') + '/' + relPath.replace(/^\/+/, '')
							: undefined),
					sources,
					similarFiles: usedDiag?.similarFiles,
					diagnostics: usedDiag || undefined
				}

				// 检查队列中是否已存在同一 URL（合并 sources 而不是重复添加）
				// O1.1：优先用规格化 URL 比较，兜底 raw URL 等值比较
				const existing = pendingMissingAssets.value.find((p) => {
					if (p.url === trimmed) return true
					if (normUrl !== '') {
						const pNorm = normalizeForBindingMatch(p.url)
						if (pNorm !== '' && pNorm === normUrl) return true
					}
					return false
				})
				if (!existing) {
					pendingMissingAssets.value = [...pendingMissingAssets.value, pending]
					// O2.2：onMissingAsset 防抖 —— 同一 normUrl 在 MISSING_ASSET_EMIT_MIN_INTERVAL_MS 内
					// 最多只 emit 一次，避免 img 反复 onerror 导致弹窗闪烁
					if (typeof onMissingAsset === 'function') {
						let shouldEmit = true
						if (debounceOn && normUrl !== '') {
							const now = Date.now()
							const last = lastMissingAssetEmitAtByNormUrl.get(normUrl) || 0
							if (now - last < MISSING_ASSET_EMIT_MIN_INTERVAL_MS) {
								shouldEmit = false
							} else {
								lastMissingAssetEmitAtByNormUrl.set(normUrl, now)
							}
						}
						if (shouldEmit) {
							try {
								onMissingAsset(pending)
							} catch (err) {
								console.warn('[404-fallback] onMissingAsset hook error:', err)
							}
						}
					}
				} else {
					// 合并 sources
					const existingSourceKeys = new Set(
						existing.sources.map(
							(s) => `${s.type}:${s.resourceId || ''}:${s.nodeId || ''}:${s.field || ''}`
						)
					)
					for (const s of sources) {
						const key = `${s.type}:${s.resourceId || ''}:${s.nodeId || ''}:${s.field || ''}`
						if (!existingSourceKeys.has(key)) existing.sources.push(s)
					}
					// 补齐 diagnostics / absolutePath（首次失败时可能没走诊断）
					if (!existing.diagnostics && pending.diagnostics) {
						existing.diagnostics = pending.diagnostics
						existing.absolutePath = pending.absolutePath
						existing.similarFiles = pending.similarFiles
					}
				}

				notify(t('aiworkflow.toast.resourceMissing', { name: assetName }), 'warn')
				recovering.value = false
				return { kind: 'missing' as const, url: trimmed, assetName, missingPath: relPath, sources }
			} catch (err: unknown) {
				console.warn('[404-fallback] unexpected error:', err)
				recovering.value = false
				let reason = 'unknown error'
				if (err instanceof Error) {
					reason = err.message
				} else {
					reason = String(err)
				}
				return {
					kind: 'ignored' as const,
					url: trimmed,
					reason: `exception: ${reason}`
				}
			} finally {
				inflightUrls.delete(trimmed)
			}
		})()

		inflightUrls.set(trimmed, promise)
		return promise
	}

	/**
	 * 批量处理：在短时间窗口内收集到的多个 404 URL 一起处理。
	 * 适用于 <img>/<video> onerror 批量触发场景。
	 *
	 * O2.1 + O5.2：入队前做 session 级规格化过滤（sessionResolvedUrls / sessionFailedOnceUrls），
	 * 避免 img 反复 onerror 导致诊断队列无限膨胀。
	 */
	function handle404Batch(urls: string[]) {
		const debounceOn = isNodeSelectionDebounceEnabled()
		for (const u of urls) {
			if (!u || !isDwebProjectAssetUrl(u)) continue
			if (autoRecoveredUrls.has(u)) continue
			if (debounceOn) {
				const norm = normalizeForBindingMatch(u)
				if (norm !== '' && sessionResolvedUrls.has(norm)) continue
			}
			pendingBatch.add(u)
		}
		if (batchTimer != null) window.clearTimeout(batchTimer)
		batchTimer = window.setTimeout(() => {
			batchTimer = null
			const batch = Array.from(pendingBatch)
			pendingBatch.clear()
			for (const u of batch) {
				void handle404Error(u)
			}
		}, batchWindowMs)
	}

	/**
	 * 辅助：用规格化 URL 再重新验证一次 sources 中是否真的"没有任何可定位来源"。
	 * 解决 URL 路径格式微小差异导致假 unknown 的问题。
	 */
	function _verifyNoBindingExistsInStore(
		url: string,
		store: Store<WorkflowState> | null | undefined
	): boolean {
		if (!store?.state) return true
		const strict = isStrictMissingSourceBindingEnabled()
		const norm = normalizeForBindingMatch(url)
		const match = (a: string | null | undefined) =>
			_urlsMatch(a, url, strict) || (norm !== '' && normalizeForBindingMatch(a) === norm)
		const { resourcesById = {}, nodesById = {} } = store.state as {
			resourcesById?: Record<string, any>
			nodesById?: Record<string, any>
		}
		for (const res of Object.values(resourcesById)) {
			if (!res) continue
			if (match(res.url) || match(res.previewUrl) || match(res.posterUrl)) return false
		}
		const FIELD_LIST = [
			'imageUrl',
			'videoUrl',
			'modelUrl',
			'thumbnailUrl',
			'src',
			'url',
			'posterUrl',
			'previewUrl'
		]
		for (const node of Object.values(nodesById)) {
			if (!node) continue
			for (const f of FIELD_LIST) if (match((node as any)[f])) return false
			for (const v of Object.values((node as any).inputs || {})) if (match(v as any)) return false
			for (const v of Object.values((node as any).outputs || {})) if (match(v as any)) return false
		}
		return true
	}

	/**
	 * 辅助：O4.2 orphan resources 清理。
	 * 从 resourcesById 中删除：
	 *   A. 其 url/previewUrl/posterUrl 规格化匹配目标 URL；并且
	 *   B. 未被任何 node.resourceId 引用的"幽灵资源"。
	 * 返回删除的 resourceId 列表（供 undo 用）。
	 */
	function _cleanupOrphanResourcesByUrl(
		url: string,
		store: Store<WorkflowState>,
		undoSnapshot: NonNullable<PendingMissingAsset['undoSnapshot']>
	): string[] {
		const strict = isStrictMissingSourceBindingEnabled()
		const norm = normalizeForBindingMatch(url)
		const match = (a: string | null | undefined) =>
			_urlsMatch(a, url, strict) || (norm !== '' && normalizeForBindingMatch(a) === norm)
		const { resourcesById = {}, nodesById = {} } = store.state as {
			resourcesById?: Record<string, any>
			nodesById?: Record<string, any>
		}
		// Step 1: 收集所有 node.resourceId 引用的 resourceId 集合
		const nodeReferencedResourceIds = new Set<string>()
		for (const node of Object.values(nodesById)) {
			const rid = (node as any)?.resourceId
			if (rid != null) nodeReferencedResourceIds.add(String(rid))
		}
		// Step 2: 扫描 resourcesById，命中 match 且未被节点引用的 → 幽灵资源
		const removedRids: string[] = []
		for (const [rid, res] of Object.entries(resourcesById)) {
			if (!res) continue
			const touches = match(res.url) || match(res.previewUrl) || match(res.posterUrl)
			if (!touches) continue
			if (nodeReferencedResourceIds.has(rid)) continue
			undoSnapshot.resourcesByIdPatch![rid] = { ...res }
			try {
				store.commit('removeResource', { resourceId: rid })
				removedRids.push(rid)
			} catch (err) {
				console.warn('[404-fallback] orphan cleanup removeResource failed:', rid, err)
			}
		}
		return removedRids
	}

	/**
	 * 用户确认移除缺失资产调用：从 store 中清理错误引用。
	 * 执行前会记录 undo 快照，以便撤销。
	 *
	 * 整改方案 O4：如果 sources 中只有 {type:'unknown'}（即未能定位到具体引用位置），
	 *              则跳过 store.commit 破坏性操作（定位不到也删不了），只记录忽略 +
	 *              发 Toast 引导用户通过资源管理器重新导入/右键清除。
	 *
	 * M4 升级：
	 *   a) O4.1：unknownOnly 判定收紧 —— 即使 sources 列表里只有 unknown，
	 *      仍然用 _verifyNoBindingExistsInStore 规格化重新验证一次，避免误杀。
	 *      若验证发现实际上有 binding，则纠正 onlyUnknownSources=false，走正常清理分支。
	 *   b) O4.2：unknown 兜底分支在 isUnknownCleanupEnabled() 开启时也执行
	 *      _cleanupOrphanResourcesByUrl 清"幽灵资源"（仅删未被 node.resourceId 引用的）。
	 *   c) O5.2：无论哪个分支结束，都写入 sessionResolvedUrls（规格化 URL）。
	 */
	function confirmRemoveMissingAsset(pendingId: string): { ok: boolean; undoAvailable: boolean } {
		const pending = pendingMissingAssets.value.find((p) => p.id === pendingId)
		if (!pending) return { ok: false, undoAvailable: false }

		const sources = Array.isArray(pending.sources) ? pending.sources : []
		let onlyUnknownSources =
			sources.length > 0 &&
			sources.every((s) => s && String(s.type || '').toLowerCase() === 'unknown')

		const store = getStore?.()
		// O4.1 收紧：验证真的没有任何 store 级绑定（规格化再扫一遍）
		if (onlyUnknownSources && store) {
			const reallyNone = _verifyNoBindingExistsInStore(pending.url, store)
			if (!reallyNone) onlyUnknownSources = false
		}
		const unknownCleanupOn = isUnknownCleanupEnabled()
		const debounceOn = isNodeSelectionDebounceEnabled()

		/* ============ O4 兜底：未知来源不做破坏性 commit ============ */
		if (!store || onlyUnknownSources) {
			pending.resolved = true
			pending.resolution = 'removed'
			pendingMissingAssets.value = pendingMissingAssets.value.filter((p) => p.id !== pendingId)

			// 仍然记录 removed 忽略表（核心：下次不重复弹）
			const projectIdForIgnore = getCurrentProjectId?.() ?? null
			try {
				markUrlRemoved(projectIdForIgnore, pending.url, {
					assetName: pending.assetName,
					sources
				})
			} catch {
				/* ignore */
			}

			let skippedDestructiveOps = true
			let undoAvailableLocal = false

			// O4.2：unknown 兜底 + flag 开 → 清幽灵 orphan resources
			if (onlyUnknownSources && store && unknownCleanupOn) {
				const orphanUndo: NonNullable<PendingMissingAsset['undoSnapshot']> = {
					resourcesByIdPatch: {},
					nodePatches: []
				}
				const removedRids = _cleanupOrphanResourcesByUrl(pending.url, store, orphanUndo)
				const hadOrphans = removedRids.length > 0
				if (hadOrphans) {
					pending.undoSnapshot = orphanUndo
					removedAssetsHistory.push(pending)
					skippedDestructiveOps = false
					undoAvailableLocal = true
				}
			}

			// O5.2：双写 session resolved（规格化 URL）
			if (debounceOn) {
				const norm = normalizeForBindingMatch(pending.url)
				if (norm !== '') sessionResolvedUrls.add(norm)
			}

			if (onlyUnknownSources) {
				notify(
					t('aiworkflow.toast.referenceUnknownLocationIgnored', {
						default:
							'未定位到具体引用位置，已记录忽略；请通过资源管理器重新导入或右键清理该资源以彻底移除。'
					}) as string,
					'warn'
				)
			} else if (!store) {
				notify(t('aiworkflow.toast.referenceRemoved', { name: pending.assetName }), 'info')
			}

			const result = { ok: true, undoAvailable: undoAvailableLocal }
			if (typeof onAfterConfirmRemove === 'function') {
				try {
					onAfterConfirmRemove({
						pendingId,
						url: pending.url,
						assetName: pending.assetName,
						undoAvailable: undoAvailableLocal,
						skippedDestructiveOps
					})
				} catch {
					/* ignore */
				}
			}
			return result
		}

		// 构造撤销快照
		const undoSnapshot: NonNullable<PendingMissingAsset['undoSnapshot']> = {
			resourcesByIdPatch: {},
			nodePatches: []
		}

		const url = pending.url
		const resourcesById = store.state.resourcesById || {}
		const nodesById = store.state.nodesById || {}
		const strictBinding = isStrictMissingSourceBindingEnabled()
		const norm = normalizeForBindingMatch(url)
		const urlMatch = (a: string | null | undefined) =>
			_urlsMatch(a, url, strictBinding) || (norm !== '' && normalizeForBindingMatch(a) === norm)

		// 1) 清理 resourcesById 中对该 url 的直接引用（备份后删除）
		for (const [rid, res] of Object.entries(resourcesById) as Array<
			[string, WorkflowResource | undefined]
		>) {
			if (!res) continue
			const touchesUrl = urlMatch(res.url) || urlMatch(res.previewUrl) || urlMatch(res.posterUrl)
			if (touchesUrl) {
				undoSnapshot.resourcesByIdPatch![rid] = { ...res }
				// 将资源从 store 中移除
				store.commit('removeResource', { resourceId: rid })
			}
		}

		// 2) 清理 nodesById 中对该 url 的字段引用
		for (const [nid, node] of Object.entries(nodesById) as Array<
			[string, WorkflowNodeLike | undefined]
		>) {
			if (!node) continue
			const fieldsToClean: string[] = []
			// 检查常见资源字段
			for (const field of [
				'imageUrl',
				'videoUrl',
				'modelUrl',
				'thumbnailUrl',
				'src',
				'url',
				'posterUrl',
				'previewUrl'
			]) {
				if (urlMatch(node?.[field] as string | null | undefined)) fieldsToClean.push(field)
			}
			// 检查 inputs 对象
			if (node?.inputs && typeof node.inputs === 'object') {
				for (const [key, val] of Object.entries(node.inputs as Record<string, unknown>)) {
					if (typeof val === 'string' && urlMatch(val)) fieldsToClean.push(`inputs.${key}`)
				}
			}
			// 检查 outputs 对象
			if (node?.outputs && typeof node.outputs === 'object') {
				for (const [key, val] of Object.entries(node.outputs as Record<string, unknown>)) {
					if (typeof val === 'string' && urlMatch(val)) fieldsToClean.push(`outputs.${key}`)
				}
			}
			for (const field of fieldsToClean) {
				const oldVal = getDeepValue(node, field)
				undoSnapshot.nodePatches!.push({ nodeId: nid, path: field, oldValue: oldVal })
				setDeepValue(node, field, '')
			}
		}

		pending.undoSnapshot = undoSnapshot
		pending.resolved = true
		pending.resolution = 'removed'
		removedAssetsHistory.push(pending)
		pendingMissingAssets.value = pendingMissingAssets.value.filter((p) => p.id !== pendingId)
		notify(t('aiworkflow.toast.referenceRemoved', { name: pending.assetName }), 'info')

		const undoAvailable =
			Object.keys(undoSnapshot.resourcesByIdPatch || {}).length > 0 ||
			(undoSnapshot.nodePatches?.length || 0) > 0

		// O5.2：双写 session resolved（规格化 URL）
		if (debounceOn) {
			const normP = normalizeForBindingMatch(pending.url)
			if (normP !== '') sessionResolvedUrls.add(normP)
		}

		/* ============ O2.3：removed 忽略表 + 回调 ============ */
		const projectIdForIgnore = getCurrentProjectId?.() ?? null
		try {
			markUrlRemoved(projectIdForIgnore, pending.url, {
				assetName: pending.assetName,
				sources
			})
		} catch {
			/* ignore */
		}
		if (typeof onAfterConfirmRemove === 'function') {
			try {
				onAfterConfirmRemove({
					pendingId,
					url: pending.url,
					assetName: pending.assetName,
					undoAvailable,
					skippedDestructiveOps: false
				})
			} catch {
				/* ignore */
			}
		}

		return {
			ok: true,
			undoAvailable
		}
	}

	/**
	 * 撤销最后一次移除操作（恢复数据）
	 */
	function undoLastRemove(): boolean {
		const pending = removedAssetsHistory.pop()
		if (!pending || pending.resolution !== 'removed' || !pending.undoSnapshot) return false
		return restoreFromSnapshot(pending)
	}

	/**
	 * 撤销指定的移除操作（按 pendingId 查找历史）
	 */
	function undoRemoveMissingAsset(pendingId: string): boolean {
		const idx = removedAssetsHistory.findIndex((p) => p.id === pendingId)
		if (idx < 0) return false
		const pending = removedAssetsHistory[idx]
		if (!pending || pending.resolution !== 'removed' || !pending.undoSnapshot) return false
		removedAssetsHistory.splice(idx, 1)
		return restoreFromSnapshot(pending)
	}

	function restoreFromSnapshot(pending: PendingMissingAsset): boolean {
		const store = getStore?.()
		if (!store || !pending.undoSnapshot) return false
		const snap = pending.undoSnapshot

		if (snap.resourcesByIdPatch) {
			for (const [_rid, backup] of Object.entries(snap.resourcesByIdPatch)) {
				if (backup) {
					try {
						store.commit('addResource', backup)
					} catch (err) {
						console.warn('[404-fallback] undo addResource failed:', err)
					}
				}
			}
		}
		for (const np of snap.nodePatches || []) {
			const nodesById = store.state.nodesById || {}
			const node = nodesById[np.nodeId]
			if (node) setDeepValue(node, np.path, np.oldValue)
		}

		pending.resolved = false
		pending.resolution = undefined
		pending.undoSnapshot = undefined
		notify(t('aiworkflow.toast.referenceRestored', { name: pending.assetName }), 'info')
		return true
	}

	/**
	 * 用户取消处理（不做任何修改）。
	 * 整改方案 O2.3：写入 cancelled 忽略表，当前会话/30 天内不再重复弹窗同 URL。
	 *
	 * M4 升级：
	 *   O5.2：结束前写入 sessionResolvedUrls（规格化 URL），保证当前会话内不再触发。
	 */
	function cancelMissingAsset(pendingId: string) {
		const pending = pendingMissingAssets.value.find((p) => p.id === pendingId)
		if (!pending) return
		pending.resolved = true
		pending.resolution = 'cancelled'
		pendingMissingAssets.value = pendingMissingAssets.value.filter((p) => p.id !== pendingId)

		// O5.2：双写 session resolved（规格化 URL）
		const debounceOn = isNodeSelectionDebounceEnabled()
		if (debounceOn) {
			const norm = normalizeForBindingMatch(pending.url)
			if (norm !== '') sessionResolvedUrls.add(norm)
		}

		/* ============ O2.3：cancelled 忽略表 + 回调 ============ */
		const projectIdForIgnore = getCurrentProjectId?.() ?? null
		try {
			markUrlCancelled(projectIdForIgnore, pending.url, {
				assetName: pending.assetName
			})
		} catch {
			/* ignore */
		}
		if (typeof onAfterCancel === 'function') {
			try {
				onAfterCancel({
					pendingId,
					url: pending.url,
					assetName: pending.assetName
				})
			} catch {
				/* ignore */
			}
		}
	}

	/** 安装全局错误拦截器，自动捕获 dweb 资源 404 */
	function installGlobalErrorHandlers(): () => void {
		const errorHandler = (event: ErrorEvent) => {
			const target = event.target as HTMLElement | null
			if (!target) return

			// ====== O3：资源管理器面板缩略图直接跳过 diagnose ======
			// 缩略图失败只需面板自身降级显示占位符，不应触发全局资源恢复流程。
			if (isResourceManagerThumbSkipGlobalEnabled()) {
				try {
					let el: HTMLElement | null = target as HTMLElement
					while (el) {
						if (
							el.dataset &&
							(el.dataset.rmThumb === '1' || el.dataset.resourceManagerThumb === '1')
						) {
							return
						}
						el = el.parentElement
					}
					// 兼容独立窗口：整份 document.body 被标记为 RM 窗口
					if (typeof document !== 'undefined' && document.body?.dataset?.rmWindow === '1') {
						return
					}
				} catch {
					/* ignore */
				}
			}

			const tag = String(target.tagName || '').toUpperCase()
			let srcUrl = ''
			if (tag === 'IMG') srcUrl = (target as HTMLImageElement).src || ''
			else if (tag === 'VIDEO' || tag === 'AUDIO' || tag === 'SOURCE') {
				srcUrl = (target as HTMLMediaElement).currentSrc || (target as HTMLSourceElement).src || ''
			} else if (tag === 'LINK') {
				srcUrl = (target as HTMLLinkElement).href || ''
			} else if (tag === 'SCRIPT') {
				srcUrl = (target as HTMLScriptElement).src || ''
			}
			if (!srcUrl || !isDwebProjectAssetUrl(srcUrl)) return

			// M5: 节点元素级 failedOnce —— 同一个 DOM 元素对同一个规格化 URL 只触发一次 404 处理。
			// 解决节点选中/取消选中导致 img 重新挂载时，同一元素反复 onerror 触发网络请求的问题。
			const debounceOn = isNodeSelectionDebounceEnabled()
			if (debounceOn) {
				const norm = normalizeForBindingMatch(srcUrl)
				if (norm !== '') {
					// dataset: dvsFailedUrls 是 "|" 分隔的规格化 URL 集合
					const ds = (target as HTMLElement).dataset
					const existing = ds.dvsFailedUrls || ''
					const tagKey = `|${norm}|`
					if (existing.includes(tagKey)) {
						return
					}
					ds.dvsFailedUrls = `${existing}${tagKey}`
				}
			}
			void handle404Error(srcUrl)
		}

		// 资源加载错误（img/video/script/link 等）
		window.addEventListener('error', errorHandler, true)

		// fetch/unhandledrejection 中的 dweb 404 错误
		const rejectionHandler = (event: PromiseRejectionEvent) => {
			const reason = event.reason
			if (!reason) return
			const url = String(
				reason?.url ||
					reason?.resourceUrl ||
					(typeof reason === 'object' ? reason?.message : '') ||
					''
			)
			if (url && isDwebProjectAssetUrl(url)) {
				void handle404Error(url)
			}
		}
		window.addEventListener('unhandledrejection', rejectionHandler)

		// 拦截 fetch 以捕获 dweb 请求的 404 响应
		const originalFetch = window.fetch
		window.fetch = async function patchedFetch(
			input: RequestInfo | URL,
			init?: RequestInit
		): Promise<Response> {
			const response = await originalFetch.call(window, input, init)
			if (!response.ok) {
				let reqUrl = ''
				if (typeof input === 'string') reqUrl = input
				else if (input instanceof Request) reqUrl = input.url
				else if (input instanceof URL) reqUrl = input.toString()
				if (reqUrl && isDwebProjectAssetUrl(reqUrl)) {
					void handle404Error(reqUrl)
				}
			}
			return response
		}

		return () => {
			window.removeEventListener('error', errorHandler, true)
			window.removeEventListener('unhandledrejection', rejectionHandler)
			window.fetch = originalFetch
		}
	}

	onBeforeUnmount(() => {
		if (batchTimer != null) window.clearTimeout(batchTimer)
		if (recoverBatchTimer != null) {
			window.clearTimeout(recoverBatchTimer)
			recoverBatchTimer = null
		}
		recoverBatch = []
		pendingBatch.clear()
		inflightUrls.clear()
	})

	return {
		recovering,
		pendingMissingAssets,
		handle404Error,
		handle404Batch,
		confirmRemoveMissingAsset,
		undoRemoveMissingAsset,
		undoLastRemove,
		cancelMissingAsset,
		installGlobalErrorHandlers,
		isDwebProjectAssetUrl,
		parseDwebProjectAssetUrl
	}
}

/**
 * URL 匹配辅助：严格模式下使用 normalizeForBindingMatch 比较，否则严格等值。
 */
function _urlsMatch(
	a: string | null | undefined,
	b: string | null | undefined,
	strict: boolean
): boolean {
	if (a === b) return true
	if (!a || !b) return false
	if (!strict) return false
	return (
		normalizeForBindingMatch(a) === normalizeForBindingMatch(b) &&
		normalizeForBindingMatch(a) !== ''
	)
}

/**
 * O2：判定自动恢复是否"伪恢复"（noop）。
 *
 * 情况 A：新旧 URL 规格化后完全相等 → 可能是 noop。
 *   但如果修复同时补全了之前缺失的 projectRelativePath / sourcePath 等元信息，
 *   仍视为"有效修复"，返回 false。
 *
 * 情况 B：新旧 URL 规格化不相等 → 绝不是 noop，返回 false。
 *
 * 无法规格化时保守返回 false（走正常恢复）。
 */
function isRepairNoop(
	oldUrl: string,
	repairedAsset:
		| {
				url?: string
				absolutePath?: string
				relativePath?: string
				projectRelativePath?: string
				sourcePath?: string
		  }
		| null
		| undefined,
	store: Store<WorkflowState> | null | undefined
): boolean {
	if (!repairedAsset) return true
	const newUrl = String(repairedAsset.url || '').trim()
	const normOld = normalizeForBindingMatch(oldUrl)
	const normNew = normalizeForBindingMatch(newUrl)
	if (!normOld || !normNew) return false
	// URL 规格化不等 → 确实变了，不是 noop
	if (normOld !== normNew) return false

	// URL 规格化相等 → 检查是否有元信息补全
	if (store?.state) {
		const resourcesById = (store.state as any).resourcesById || {}
		const norm = normOld
		for (const res of Object.values(resourcesById) as any[]) {
			if (!res) continue
			const matchesUrl =
				normalizeForBindingMatch(res.url) === norm ||
				normalizeForBindingMatch(res.previewUrl) === norm ||
				normalizeForBindingMatch(res.posterUrl) === norm
			if (!matchesUrl) continue
			const hadMeta = Boolean(res.projectRelativePath || res.sourcePath || res.absolutePath)
			const willHaveMeta = Boolean(
				repairedAsset.projectRelativePath || repairedAsset.sourcePath || repairedAsset.absolutePath
			)
			// 原来没有元信息、修复后会补 → 有效修复，非 noop
			if (!hadMeta && willHaveMeta) return false
			break
		}
	}
	// 规格化相等 + 没有补全新元信息 → noop
	return true
}

/**
 * 默认来源定位：从 Vuex store 中查找引用了该 URL 的资源和节点。
 *
 * M1 整改：
 *   1. O1.3：isStrictMissingSourceBindingEnabled() 开启（默认开）时，
 *      URL 比较改为 normalizeForBindingMatch 规格化后比较，避免大小写/
 *      分隔符/百分号编码差异导致的 false miss（进而走到 unknown 分支）。
 *   2. O1.4：node.resourceId 两跳关联——先在 resourcesById 中找到所有
 *      url/previewUrl/posterUrl 命中的资源，再反向扫描 nodesById 中
 *      resourceId 等于该资源 id 的节点，标记来源为 node_resource_binding。
 *      这解决了"节点通过 resourceId 间接绑定资产却判为 unknown location"的问题。
 */
function defaultFindBindingSources(
	url: string,
	store: Store<WorkflowState> | null | undefined
): ResourceBindingSource[] {
	const sources: ResourceBindingSource[] = []
	if (!store || !store.state) return sources
	const state = store.state
	const strictBinding = isStrictMissingSourceBindingEnabled()
	const seenKeys = new Set<string>()

	const pushSource = (s: ResourceBindingSource) => {
		const key = `${s.type}:${s.resourceId || ''}:${s.nodeId || ''}:${s.field || ''}`
		if (seenKeys.has(key)) return
		seenKeys.add(key)
		sources.push(s)
	}

	const resourcesById = state.resourcesById || {}
	// Step 1: 扫描 resourcesById 中直接引用该 URL 的资源（同时收集命中的 resourceId 集合，供 Step 3 反向匹配）
	const hitResourceIds = new Set<string>()
	for (const [rid, res] of Object.entries(resourcesById) as Array<
		[string, WorkflowResource | undefined]
	>) {
		if (!res) continue
		let hit = false
		if (_urlsMatch(res.url, url, strictBinding)) {
			pushSource({
				type: 'resource',
				resourceId: rid,
				detail: `resource.url => ${res.name || rid}`
			})
			hit = true
		}
		if (_urlsMatch(res.previewUrl, url, strictBinding)) {
			pushSource({
				type: 'preview',
				resourceId: rid,
				detail: `resource.previewUrl => ${res.name || rid}`
			})
			hit = true
		}
		if (_urlsMatch(res.posterUrl, url, strictBinding)) {
			pushSource({
				type: 'poster',
				resourceId: rid,
				detail: `resource.posterUrl => ${res.name || rid}`
			})
			hit = true
		}
		if (hit) hitResourceIds.add(rid)
	}

	const nodesById = state.nodesById || {}
	// Step 2: 扫描 nodesById 中字段直接等于该 URL 的情况（inputs / outputs / 直接字段）
	for (const [nid, node] of Object.entries(nodesById) as Array<
		[string, WorkflowNodeLike | undefined]
	>) {
		if (!node) continue
		const nodeType = String(node.type || node.nodeType || '')
		for (const field of [
			'imageUrl',
			'videoUrl',
			'modelUrl',
			'thumbnailUrl',
			'src',
			'url',
			'posterUrl',
			'previewUrl'
		]) {
			if (_urlsMatch(node?.[field] as string | null | undefined, url, strictBinding)) {
				pushSource({ type: 'node_param', nodeId: nid, nodeType, field, detail: `node.${field}` })
			}
		}
		if (node?.inputs && typeof node.inputs === 'object') {
			for (const [key, val] of Object.entries(node.inputs as Record<string, unknown>)) {
				if (typeof val === 'string' && _urlsMatch(val, url, strictBinding)) {
					pushSource({
						type: 'node_input',
						nodeId: nid,
						nodeType,
						field: `inputs.${key}`,
						detail: `node.inputs.${key}`
					})
				}
			}
		}
		if (node?.outputs && typeof node.outputs === 'object') {
			for (const [key, val] of Object.entries(node.outputs as Record<string, unknown>)) {
				if (typeof val === 'string' && _urlsMatch(val, url, strictBinding)) {
					pushSource({
						type: 'node_output',
						nodeId: nid,
						nodeType,
						field: `outputs.${key}`,
						detail: `node.outputs.${key}`
					})
				}
			}
		}
	}

	// Step 3: O1.4 —— node.resourceId 两跳反向关联
	if (hitResourceIds.size > 0) {
		for (const [nid, node] of Object.entries(nodesById) as Array<
			[string, WorkflowNodeLike | undefined]
		>) {
			if (!node) continue
			const nodeType = String(node.type || node.nodeType || '')
			const nodeResourceId = (node as any).resourceId
			if (nodeResourceId != null && hitResourceIds.has(String(nodeResourceId))) {
				const res = resourcesById[String(nodeResourceId)]
				pushSource({
					type: 'preview',
					resourceId: String(nodeResourceId),
					nodeId: nid,
					nodeType,
					field: 'resourceId',
					detail: `node.resourceId => resource(${res?.name || nodeResourceId}) indirect binding`
				})
			}
		}
	}

	if (sources.length === 0) {
		pushSource({ type: 'unknown', detail: t('aiworkflow.toast.unknownLocation') })
	}
	return sources
}

function getDeepValue(obj: Record<string, unknown>, path: string): unknown {
	if (!obj || !path) return undefined
	const parts = path.split('.')
	let cur: Record<string, unknown> | unknown = obj
	for (const p of parts) {
		if (cur == null) return undefined
		cur = (cur as Record<string, unknown>)[p]
	}
	return cur
}

function setDeepValue(obj: Record<string, unknown>, path: string, value: unknown) {
	if (!obj || !path) return
	const parts = path.split('.')
	let cur: Record<string, unknown> = obj
	for (let i = 0; i < parts.length - 1; i++) {
		if (cur[parts[i]] == null) cur[parts[i]] = {}
		cur = cur[parts[i]] as Record<string, unknown>
	}
	cur[parts[parts.length - 1]] = value
}
