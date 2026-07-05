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
	onRecovered?: (result: { url: string; newUrl: string; assetName: string; newAsset?: unknown }) => void
	/** 找到缺失资产（文件确实不存在）回调，通常用于弹确认框 */
	onMissingAsset?: (pending: PendingMissingAsset) => void
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
		onMissingAsset,
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
					autoRecoveredUrls.add(trimmed)
					const newAsset = diag.repairedAsset
					const newUrl = newAsset.url
					console.info('[404-fallback] recovered via re-resolution:', {
						from: trimmed,
						to: newUrl,
						name: newAsset.name
					})
					notify(t('aiworkflow.toast.resourceRecovered', { name: newAsset.name }), 'info')
					if (typeof onRecovered === 'function') {
						try {
							onRecovered({ url: trimmed, newUrl, assetName: newAsset.name, newAsset })
						} catch (err) {
							console.warn('[404-fallback] onRecovered hook error:', err)
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
									autoRecoveredUrls.add(trimmed)
									notify(t('aiworkflow.toast.projectRootRecovered', { name: diag2.repairedAsset.name }), 'info')
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
				const parsed = parseDwebProjectAssetUrl(trimmed)
				const relPath = diag?.requestedPath || parsed?.relPath || ''
				const sources =
					findBindingSources?.(trimmed) || defaultFindBindingSources(trimmed, getStore?.())
				if (source) sources.unshift(source)

				const pendingId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
				const pending: PendingMissingAsset = {
					id: pendingId,
					url: trimmed,
					assetName,
					requestedPath: relPath,
					absolutePath:
						diag?.resolvedTo ||
						(diag?.root && relPath
							? diag.root.replace(/\\/g, '/') + '/' + relPath.replace(/^\/+/, '')
							: undefined),
					sources,
					similarFiles: diag?.similarFiles,
					diagnostics: diag || undefined
				}

				// 检查队列中是否已存在同一 URL（合并 sources 而不是重复添加）
				const existing = pendingMissingAssets.value.find((p) => p.url === trimmed)
				if (!existing) {
					pendingMissingAssets.value = [...pendingMissingAssets.value, pending]
					if (typeof onMissingAsset === 'function') {
						try {
							onMissingAsset(pending)
						} catch (err) {
							console.warn('[404-fallback] onMissingAsset hook error:', err)
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
	 */
	function handle404Batch(urls: string[]) {
		for (const u of urls) {
			if (u && isDwebProjectAssetUrl(u) && !autoRecoveredUrls.has(u)) {
				pendingBatch.add(u)
			}
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
	 * 用户确认移除缺失资产调用：从 store 中清理错误引用。
	 * 执行前会记录 undo 快照，以便撤销。
	 */
	function confirmRemoveMissingAsset(pendingId: string): { ok: boolean; undoAvailable: boolean } {
		const pending = pendingMissingAssets.value.find((p) => p.id === pendingId)
		if (!pending) return { ok: false, undoAvailable: false }

		const store = getStore?.()
		if (!store) {
			pending.resolved = true
			pending.resolution = 'removed'
			pendingMissingAssets.value = pendingMissingAssets.value.filter((p) => p.id !== pendingId)
			return { ok: true, undoAvailable: false }
		}

		// 构造撤销快照
		const undoSnapshot: NonNullable<PendingMissingAsset['undoSnapshot']> = {
			resourcesByIdPatch: {},
			nodePatches: []
		}

		const url = pending.url
		const resourcesById = store.state.resourcesById || {}
		const nodesById = store.state.nodesById || {}

		// 1) 清理 resourcesById 中对该 url 的直接引用（备份后删除）
		for (const [rid, res] of Object.entries(resourcesById) as Array<[string, WorkflowResource | undefined]>) {
			if (!res) continue
			const touchesUrl = res.url === url || res.previewUrl === url || res.posterUrl === url
			if (touchesUrl) {
				undoSnapshot.resourcesByIdPatch![rid] = { ...res }
				// 将资源从 store 中移除
				store.commit('removeResource', { resourceId: rid })
			}
		}

		// 2) 清理 nodesById 中对该 url 的字段引用
		for (const [nid, node] of Object.entries(nodesById) as Array<[string, WorkflowNodeLike | undefined]>) {
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
				if (node?.[field] === url) fieldsToClean.push(field)
			}
			// 检查 inputs 对象
			if (node?.inputs && typeof node.inputs === 'object') {
				for (const [key, val] of Object.entries(node.inputs as Record<string, unknown>)) {
					if (val === url) fieldsToClean.push(`inputs.${key}`)
				}
			}
			// 检查 outputs 对象
			if (node?.outputs && typeof node.outputs === 'object') {
				for (const [key, val] of Object.entries(node.outputs as Record<string, unknown>)) {
					if (val === url) fieldsToClean.push(`outputs.${key}`)
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
		return {
			ok: true,
			undoAvailable:
				Object.keys(undoSnapshot.resourcesByIdPatch || {}).length > 0 ||
				(undoSnapshot.nodePatches?.length || 0) > 0
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
	 * 用户取消处理（不做任何修改）
	 */
	function cancelMissingAsset(pendingId: string) {
		const pending = pendingMissingAssets.value.find((p) => p.id === pendingId)
		if (!pending) return
		pending.resolved = true
		pending.resolution = 'cancelled'
		pendingMissingAssets.value = pendingMissingAssets.value.filter((p) => p.id !== pendingId)
	}

	/** 安装全局错误拦截器，自动捕获 dweb 资源 404 */
	function installGlobalErrorHandlers(): () => void {
		const errorHandler = (event: ErrorEvent) => {
			const target = event.target as HTMLElement | null
			if (!target) return
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
			if (srcUrl && isDwebProjectAssetUrl(srcUrl)) {
				void handle404Error(srcUrl)
			}
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
 * 默认来源定位：从 Vuex store 中查找引用了该 URL 的资源和节点
 */
function defaultFindBindingSources(
	url: string,
	store: Store<WorkflowState> | null | undefined
): ResourceBindingSource[] {
	const sources: ResourceBindingSource[] = []
	if (!store || !store.state) return sources
	const state = store.state

	const resourcesById = state.resourcesById || {}
	for (const [rid, res] of Object.entries(resourcesById) as Array<[string, WorkflowResource | undefined]>) {
		if (!res) continue
		if (res.url === url) {
			sources.push({
				type: 'resource',
				resourceId: rid,
				detail: `resource.url => ${res.name || rid}`
			})
		} else if (res.previewUrl === url) {
			sources.push({
				type: 'preview',
				resourceId: rid,
				detail: `resource.previewUrl => ${res.name || rid}`
			})
		} else if (res.posterUrl === url) {
			sources.push({
				type: 'poster',
				resourceId: rid,
				detail: `resource.posterUrl => ${res.name || rid}`
			})
		}
	}

	const nodesById = state.nodesById || {}
	for (const [nid, node] of Object.entries(nodesById) as Array<[string, WorkflowNodeLike | undefined]>) {
		if (!node) continue
		const nodeType = String(node.type || node.nodeType || '')
		for (const field of ['imageUrl', 'videoUrl', 'modelUrl', 'thumbnailUrl', 'src', 'url']) {
			if (node?.[field] === url) {
				sources.push({ type: 'node_param', nodeId: nid, nodeType, field, detail: `node.${field}` })
			}
		}
		if (node?.inputs && typeof node.inputs === 'object') {
			for (const [key, val] of Object.entries(node.inputs as Record<string, unknown>)) {
				if (val === url) {
					sources.push({
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
				if (val === url) {
					sources.push({
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

	if (sources.length === 0) {
		sources.push({ type: 'unknown', detail: t('aiworkflow.toast.unknownLocation') })
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
