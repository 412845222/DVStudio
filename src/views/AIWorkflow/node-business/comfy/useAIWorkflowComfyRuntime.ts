import { ref } from 'vue'
import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	ComfyInputMappings,
	TextWriteDiagnostics,
	TextWrittenDetail
} from '../../../../network/ComfyUIBridgeService'

type RunState = {
	runStatus: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
	progress: number
	text: string
}

type ComfyInputFile = File | { file: File; mediaType: 'image' | 'video' }

type ComfyService = {
	run: (
		baseUrl: string,
		workflowPath: string,
		files: ComfyInputFile[],
		opts?: {
			positivePrompt?: string
			negativePrompt?: string
			historyPromptId?: string
			inputMappings?: ComfyInputMappings
		}
	) => Promise<
		| {
				ok: true
				promptId: string
				result?: Record<string, unknown>
				promptSource?: string
				snapshot?: Record<string, unknown>
				[key: string]: unknown
		  }
		| {
				ok: false
				error: string
				status?: number
				requiresHistorySetup?: boolean
				message?: string
				baseUrl?: string
				comfyuiError?: Record<string, unknown>
				[key: string]: unknown
		  }
	>
	cancel: (
		baseUrl: string,
		promptId: string
	) => Promise<{ ok: boolean; error?: string; [key: string]: unknown }>
	job: (
		baseUrl: string,
		promptId: string
	) => Promise<{
		ok: boolean
		error?: string
		status?: number
		result?: Record<string, unknown>
		[key: string]: unknown
	}>
	outputs: (
		baseUrl: string,
		promptId: string
	) => Promise<{ ok: boolean; error?: string; media?: ComfyBridgeMedia[]; [key: string]: unknown }>
}

type ComfyNode = {
	id: string
	type?: string
	title?: string
	alias?: string
	inputs?: unknown
	outputs?: unknown
	resourceId?: string
	comfyuiSettings?: Record<string, unknown>
	[key: string]: unknown
}
type ComfyEdge = {
	fromNodeId?: string
	toNodeId?: string
	fromAnchorId?: string
	toAnchorId?: string
	[key: string]: unknown
}
type ComfyResource = { kind?: string; url?: string; name?: string; [key: string]: unknown }

type _InputAnchor = { id?: string; [key: string]: unknown }
type JobStatus = { status?: string; outputs_count?: number; [key: string]: unknown }

export const useAIWorkflowComfyRuntime = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
			nodeOrder: string[]
			edgeOrder: string[]
			edgesById: Record<string, unknown>
			resourcesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	comfyService: ComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	routeComfyOutputsToConnectedNodes: (
		comfyNodeId: string,
		media: ComfyBridgeMedia[],
		opts?: { notifyWarnings?: boolean }
	) => Promise<{ alerts: string[]; outputs: ComfyLocalizedOutput[] }>
	clearComfyRouteCache: (nodeId: string) => void
	getIncomingTextValue: (toNodeId: string, toAnchorId: string) => string
	getTextOutputForNode?: (nodeId: string, visited?: Set<string>, fromAnchorId?: string) => string
	autoWireComfyOutputs?: (
		comfyNodeId: string,
		outputs: ComfyLocalizedOutput[]
	) => Promise<{
		createdNodeIds: string[]
		connectedEdgeIds: string[]
		skippedOutputs: Array<{ anchorId: string; reason: string }>
	}>
}) => {
	const comfyPollTimers = new Map<string, number>()
	const comfyTerminalNotified = new Set<string>()
	const comfyPollErrorCounts = new Map<string, number>()

	const stopComfyUIPoll = (nodeId: string) => {
		const timer = comfyPollTimers.get(nodeId)
		if (timer != null) {
			window.clearInterval(timer)
			comfyPollTimers.delete(nodeId)
		}
		comfyPollErrorCounts.delete(nodeId)
	}

	const isLikelyJobMissing = (res: unknown) => {
		if (!isRecord(res)) return false
		const status = Number(res.status)
		if (status === 404) return true
		const msg = String(res.error ?? '').toLowerCase()
		return /not\s*found|404|unknown\s*prompt|missing|不存在|无此/.test(msg)
	}

	const normalizeJobFromResult = (res: unknown, promptId: string): JobStatus | null => {
		if (isRecord(res)) {
			if (isString(res.status)) return res as JobStatus
			const item = res[promptId]
			if (isRecord(item)) return item as JobStatus
		}
		return null
	}

	const deriveRunStateFromJob = (job: JobStatus): RunState => {
		const status = String(job?.status ?? '').toLowerCase()
		if (status === 'not_found' || status === 'missing')
			return { runStatus: 'idle', progress: 0, text: t('nodes.comfyui.jobNotFound') }
		if (status === 'pending')
			return { runStatus: 'running', progress: 10, text: t('nodes.comfyui.pending') }
		if (status === 'in_progress')
			return { runStatus: 'running', progress: 50, text: t('nodes.comfyui.inProgress') }
		if (status === 'completed')
			return { runStatus: 'completed', progress: 100, text: t('nodes.comfyui.completed') }
		if (status === 'failed')
			return { runStatus: 'failed', progress: 100, text: t('nodes.comfyui.failed') }
		if (status === 'cancelled')
			return { runStatus: 'cancelled', progress: 100, text: t('nodes.comfyui.cancelled') }
		return { runStatus: 'running', progress: 30, text: t('nodes.comfyui.running') }
	}

	const resetComfyNodeToIdle = (
		nodeId: string,
		statusText: string,
		tone: 'info' | 'warn' | 'error' = 'warn'
	) => {
		stopComfyUIPoll(nodeId)
		comfyPollErrorCounts.delete(nodeId)
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
				runStatus: 'idle',
				promptId: '',
				progress: 0,
				statusText,
				lastUpdateAt: Date.now()
			}
		})
		if (statusText) payload.pushToast(statusText, tone)
	}

	const startComfyUIPoll = (nodeId: string, baseUrl: string, promptId: string) => {
		stopComfyUIPoll(nodeId)
		comfyTerminalNotified.delete(nodeId)
		comfyPollErrorCounts.delete(nodeId)

		const tick = async () => {
			try {
				const nodeRecord = payload.store.state.nodesById[nodeId]
				const node = nodeRecord as ComfyNode | undefined
				const currentRunStatus = String(node?.comfyuiSettings?.runStatus ?? '').toLowerCase()
				if (
					currentRunStatus === 'completed' ||
					currentRunStatus === 'failed' ||
					currentRunStatus === 'cancelled'
				) {
					stopComfyUIPoll(nodeId)
					return
				}

				const jr = await payload.comfyService.job(baseUrl, promptId)
				if (!jr.ok) {
					if (isLikelyJobMissing(jr)) {
						resetComfyNodeToIdle(nodeId, t('nodes.comfyui.jobMissingRestarted'), 'warn')
						return
					}
					const nextCount = Number(comfyPollErrorCounts.get(nodeId) ?? 0) + 1
					comfyPollErrorCounts.set(nodeId, nextCount)
					if (nextCount >= 4) {
						resetComfyNodeToIdle(nodeId, t('nodes.comfyui.pollingStopped'), 'warn')
						return
					}
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: 'running',
							statusText: t('nodes.comfyui.statusFetchFailed'),
							lastUpdateAt: Date.now()
						}
					})
					return
				}

				comfyPollErrorCounts.delete(nodeId)
				const job = normalizeJobFromResult(jr.result, promptId)
				if (!job) {
					resetComfyNodeToIdle(nodeId, t('nodes.comfyui.jobNotFoundStopped'), 'warn')
					return
				}

				const next = deriveRunStateFromJob(job)
				if (next.runStatus === 'idle') {
					resetComfyNodeToIdle(nodeId, t('nodes.comfyui.jobGoneReset'), 'warn')
					return
				}

				const outputsCount = Number.isFinite(Number(job.outputs_count))
					? Number(job.outputs_count)
					: null
				const suffix =
					outputsCount != null && next.runStatus === 'completed'
						? t('nodes.comfyui.outputsCount', { count: String(outputsCount) })
						: ''
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						runStatus: next.runStatus,
						progress: next.progress,
						statusText: next.text + suffix,
						lastUpdateAt: Date.now()
					}
				})

				let terminalAlerts: string[] = []
				let derivedTerminalStatus = next.runStatus
				let localizedOutputsForAutoWire: ComfyLocalizedOutput[] = []
				if (next.runStatus === 'running' || next.runStatus === 'completed') {
					try {
						if (typeof console !== 'undefined') {
							console.log(
								`%c[ComfyUI][Poll] 📥 comfyService.outputs(baseUrl, promptId) 发起 → promptId=${promptId} runStatus=${next.runStatus}`,
								'color:#0369a1;font-weight:bold'
							)
						}
						const or = await payload.comfyService.outputs(baseUrl, promptId)
						if (or.ok) {
							const media = Array.isArray(or.media) ? or.media : []
							if (typeof console !== 'undefined') {
								console.log('%c[ComfyUI][Poll] 📥 outputs 返回 media 明细：', 'color:#0369a1', {
									promptId,
									mediaCnt: media.length,
									media: media.map((m, idx) => ({
										idx,
										kind: (m as any).kind,
										nodeId: (m as any).nodeId,
										filename: (m as any).filename,
										subfolder: (m as any).subfolder,
										type: (m as any).type,
										url: String((m as any).url ?? '').slice(0, 180)
									}))
								})
							}
							const dispatchRes = await payload.routeComfyOutputsToConnectedNodes(nodeId, media, {
								notifyWarnings: next.runStatus !== 'running'
							})
							const localizedOutputs = Array.isArray(dispatchRes?.outputs)
								? dispatchRes.outputs
								: []
							localizedOutputsForAutoWire = localizedOutputs
							if (typeof console !== 'undefined') {
								console.log(
									'%c[ComfyUI][Poll] 💾 将 outputs 写入 comfyuiSettings.outputs：',
									'color:#0369a1;font-weight:bold',
									{
										promptId,
										localizedCnt: localizedOutputs.length,
										localizedOutputs: localizedOutputs.map((o, idx) => ({
											idx,
											anchorId: o.anchorId,
											kind: o.kind,
											filename: o.filename,
											sourcePath: o.sourcePath,
											url: String(o.url ?? '').slice(0, 200)
										}))
									}
								)
							}
							const runningText = t('nodes.comfyui.importProgress', {
								status: next.text,
								imported: String(localizedOutputs.length),
								total: String(media.length)
							})
							payload.store.commit('setNodeComfyUISettings', {
								nodeId,
								comfyuiSettings: {
									outputs: localizedOutputs,
									statusText: runningText,
									lastUpdateAt: Date.now()
								}
							})

							if (
								next.runStatus === 'running' &&
								outputsCount != null &&
								outputsCount > 0 &&
								media.length >= outputsCount
							) {
								derivedTerminalStatus = 'completed'
								payload.store.commit('setNodeComfyUISettings', {
									nodeId,
									comfyuiSettings: {
										runStatus: 'completed',
										progress: 100,
										statusText: t('nodes.comfyui.completedWithOutputs', {
											count: String(media.length)
										}),
										lastUpdateAt: Date.now()
									}
								})
							}

							if (next.runStatus === 'completed') {
								terminalAlerts = Array.isArray(dispatchRes?.alerts) ? dispatchRes.alerts : []
							}
						}
					} catch {
						// ignore outputs retrieval errors
					}
				}

				if (
					derivedTerminalStatus === 'completed' ||
					derivedTerminalStatus === 'failed' ||
					derivedTerminalStatus === 'cancelled'
				) {
					if (!comfyTerminalNotified.has(nodeId)) {
						comfyTerminalNotified.add(nodeId)
						if (derivedTerminalStatus === 'completed') {
							if (terminalAlerts.length) {
								payload.pushToast(
									t('nodes.comfyui.completedWithWarnings', {
										count: String(terminalAlerts.length)
									}),
									'warn'
								)
							}
							if (payload.autoWireComfyOutputs && localizedOutputsForAutoWire.length > 0) {
								void payload
									.autoWireComfyOutputs(nodeId, localizedOutputsForAutoWire)
									.then((wireResult) => {
										if (wireResult.createdNodeIds.length > 0) {
											payload.pushToast(
												t('nodes.comfyui.autoWireSuccess', {
													count: String(wireResult.createdNodeIds.length)
												}),
												'info'
											)
										}
									})
									.catch((err) => {
										console.error('[ComfyUI] Auto-wire failed', err)
									})
							}
						} else if (derivedTerminalStatus === 'failed') {
							payload.pushToast(t('aiworkflow.toast.comfyTaskFailed'), 'warn')
						} else if (derivedTerminalStatus === 'cancelled') {
							payload.pushToast(t('aiworkflow.toast.comfyTaskCancelled'), 'warn')
						}
					}
					stopComfyUIPoll(nodeId)
				}
			} catch {
				// ignore transient poll errors
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), 900)
		comfyPollTimers.set(nodeId, timer)
	}

	type CollectedResources = {
		images: File[]
		videos: File[]
		texts: string[]
	}

	const resourceToFile = async (
		resource: ComfyResource,
		fallbackName: string
	): Promise<File | null> => {
		const url = String(resource.url ?? '').trim()
		if (!url) {
			console.warn('[ComfyUI][Resource] resource.url is empty', {
				resourceId: (resource as any).id
			})
			return null
		}
		const fileName = String(resource.name ?? fallbackName) || fallbackName
		// 根据扩展名推断 MIME type（兜底方案）
		const ext = fileName.split('.').pop()?.toLowerCase()
		const extToMime: Record<string, string> = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
			mp4: 'video/mp4',
			mov: 'video/quicktime',
			webm: 'video/webm',
			txt: 'text/plain',
			json: 'application/json'
		}
		const fallbackMime = ext ? (extToMime[ext] ?? '') : ''
		let lastError: unknown = null
		// 重试策略：2 次尝试（间隔 200ms），针对文件尚未落盘的竞态
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				const resp = await fetch(url, {
					credentials: url.startsWith('http') ? 'same-origin' : 'omit'
				})
				if (!resp.ok) {
					console.warn(`[ComfyUI][Resource] fetch HTTP ${resp.status} (attempt ${attempt})`, {
						url: url.slice(0, 120),
						resourceId: (resource as any).id
					})
					lastError = new Error(`HTTP ${resp.status}`)
					if (attempt < 2) await new Promise((r) => setTimeout(r, 200))
					continue
				}
				const blob = await resp.blob()
				const mime = blob.type || fallbackMime
				const finalBlob = mime && mime !== blob.type ? new Blob([blob], { type: mime }) : blob
				return new File([finalBlob], fileName, {
					type: finalBlob.type || 'application/octet-stream'
				})
			} catch (err) {
				lastError = err
				console.warn(`[ComfyUI][Resource] fetch failed (attempt ${attempt})`, {
					url: url.slice(0, 120),
					resourceId: (resource as any).id,
					error: err instanceof Error ? err.message : String(err),
					isDwebProtocol: url.startsWith('dweb:')
				})
				if (attempt < 2) await new Promise((r) => setTimeout(r, 200))
			}
		}
		console.error('[ComfyUI][Resource] Unable to convert resource to File after retries', {
			resourceId: (resource as any).id,
			resourceKind: resource.kind,
			url: url.slice(0, 120),
			error: lastError instanceof Error ? lastError.message : String(lastError)
		})
		return null
	}

	// FX5: 扩展正则，兼容 'in'(原始)、'in-0'(数字)、'in-image'/'in-text'/'in-video' 等语义化锚点
	const COMFY_INPUT_ANCHOR_PATTERN = /^in(-(text|image|video|audio|model3d|resource|[0-9]+))?$/

	let lastCollectDiag: {
		totalEdges: number
		matchedEdges: number
		skippedMissingResourceId: number
		skippedMissingResource: number
		skippedFileConversion: number
		collectedImages: number
		collectedVideos: number
		collectedTexts: number
	} | null = null

	const collectComfyUIInputResources = async (nodeId: string): Promise<CollectedResources> => {
		const result: CollectedResources = { images: [], videos: [], texts: [] }
		const diag = {
			totalEdges: 0,
			matchedEdges: 0,
			skippedMissingResourceId: 0,
			skippedMissingResource: 0,
			skippedFileConversion: 0,
			collectedImages: 0,
			collectedVideos: 0,
			collectedTexts: 0
		}
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		if (!node || node.type !== 'comfyui') return result

		const edges = payload.store.state.edgeOrder
			.map((id) => payload.store.state.edgesById[id] as ComfyEdge | undefined)
			.filter((e): e is ComfyEdge =>
				Boolean(
					e &&
					e.toNodeId === nodeId &&
					COMFY_INPUT_ANCHOR_PATTERN.test(String(e.toAnchorId ?? '')) &&
					e.fromNodeId
				)
			)

		diag.totalEdges = payload.store.state.edgeOrder.length
		diag.matchedEdges = edges.length

		for (let i = 0; i < edges.length; i++) {
			const edge = edges[i]
			const fromNodeRecord = payload.store.state.nodesById[edge.fromNodeId ?? '']
			const fromNode = fromNodeRecord as ComfyNode | undefined
			if (!fromNode) continue
			const fromType = String(fromNode.type ?? '').toLowerCase()

			if (fromType === 'text') {
				const textVal = String(fromNode.textValue ?? fromNode.prompt ?? '').trim()
				if (textVal) result.texts.push(textVal)
				diag.collectedTexts++
				continue
			}

			const rid = String(fromNode.resourceId ?? '').trim()
			if (!rid) {
				diag.skippedMissingResourceId++
				continue
			}
			const resourceRecord = payload.store.state.resourcesById[rid]
			const resource = resourceRecord as ComfyResource | undefined
			if (!resource) {
				diag.skippedMissingResource++
				continue
			}
			const kind = String(resource.kind ?? '').toLowerCase()
			const name = String(resource.name ?? `input_${i}`)
			const file = await resourceToFile(resource, name)
			if (!file) {
				diag.skippedFileConversion++
				continue
			}
			if (fromType === 'image' || kind === 'image' || file.type.startsWith('image/')) {
				result.images.push(file)
				diag.collectedImages++
			} else if (fromType === 'video' || kind === 'video' || file.type.startsWith('video/')) {
				result.videos.push(file)
				diag.collectedVideos++
			}
		}

		console.debug('[ComfyUI][CollectResources] Diagnostics:', {
			nodeId,
			...diag,
			expected: {
				images: (node.comfyuiSettings as any)?.imageInputCount,
				videos: (node.comfyuiSettings as any)?.videoInputCount
			}
		})
		lastCollectDiag = diag

		return result
	}

	interface CollectedTexts {
		positive: string[]
		negative: string[]
		inOrder: Array<{ value: string; classified: 'positive' | 'negative' }>
		/** 当前 comfyui 节点声明了多少个 mediaType==='text' 的输入锚点（设计上只允许接收文本节点） */
		textAnchorsSeen: number
		/** 其中实际上游有连接且解析出非空文本的数量 */
		textAnchorsFilled: number
	}
	const collectComfyInputText = (nodeId: string): string => {
		const texts = collectComfyInputTexts(nodeId)
		return texts.positive.join('\n\n')
	}
	const collectComfyInputTexts = (nodeId: string): CollectedTexts => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		const result: CollectedTexts = {
			positive: [],
			negative: [],
			inOrder: [],
			textAnchorsSeen: 0,
			textAnchorsFilled: 0
		}

		const anchors = Array.isArray(node?.inputs)
			? (node!.inputs as Array<Record<string, unknown>>)
			: []
		if (!anchors.length) return result

		const NEGATIVE_ANCHOR_RE = /negative|neg_prompt|negprompt|反向|负面|负向/i

		// 从 state 中预取全部入边（toNodeId === nodeId），用于聚合锚点的逐条边解析
		const incomingEdges = payload.store.state.edgeOrder
			.map((eid) => payload.store.state.edgesById[eid] as ComfyEdge | undefined)
			.filter((e): e is ComfyEdge => Boolean(e && e.toNodeId === nodeId && e.fromNodeId))

		if (typeof console !== 'undefined') {
			console.log(
				`%c[ComfyUI][CollectTexts] STEP-A 初始化: nodeId=${nodeId}, nodeType=${node?.type ?? 'unknown'}, ` +
					`anchors=${anchors.length}, incomingEdges=${incomingEdges.length}, ` +
					`getTextOutputForNode=${typeof payload.getTextOutputForNode === 'function'}, ` +
					`getIncomingTextValue=${typeof payload.getIncomingTextValue === 'function'}`,
				'color:#b45309;font-weight:bold'
			)
			for (const a of anchors) {
				const mediaType = String((a as any)?.mediaType ?? '').toLowerCase()
				const accepted = Array.isArray((a as any)?.acceptedMediaTypes)
					? ((a as any).acceptedMediaTypes as unknown[]).map((v) => String(v ?? ''))
					: []
				console.log(
					`[ComfyUI][CollectTexts]   锚点: id=${(a as any).id}, mediaType=${mediaType}, ` +
						`acceptedMediaTypes=[${accepted.join(',')}], multiInput=${Boolean((a as any)?.multiInput)}`
				)
			}
			for (const e of incomingEdges) {
				const fromNode = payload.store.state.nodesById[String(e.fromNodeId ?? '')] as unknown as
					| Record<string, unknown>
					| undefined
				console.log(
					`[ComfyUI][CollectTexts]   入边: ${String(e.fromNodeId ?? '')}[type=${String(
						fromNode?.type ?? '?'
					)}]::${String(e.fromAnchorId ?? '')}  →  ${String(e.toAnchorId ?? '')}`
				)
			}
		}

		// 官方文本解析器：优先走 payload.getTextOutputForNode（完整解析器，支持 text-merge /
		// scene-understanding 等高级节点），不可用时按节点类型关键字段兜底（仅支持常见
		// 类型；但此时至少能拿到 text / rotate-image 节点的直接文本，不会完全跳过）。
		const resolveUpstreamText = (fromNodeId: string, fromAnchorId?: string): string => {
			if (typeof payload.getTextOutputForNode === 'function') {
				const val = String(
					payload.getTextOutputForNode(fromNodeId, undefined, fromAnchorId) ?? ''
				).trim()
				if (typeof console !== 'undefined') {
					console.log(
						`[ComfyUI][CollectTexts] resolveUpstreamText fromNodeId=${fromNodeId} via getTextOutputForNode → ` +
							`len=${val.length}, preview=${val.slice(0, 80).replace(/\n/g, '\\n')}`
					)
				}
				return val
			}
			const fromNode = payload.store.state.nodesById[fromNodeId] as ComfyNode | undefined
			if (!fromNode) return ''
			const t = String(fromNode.type ?? '').toLowerCase()
			let val = ''
			if (t === 'text')
				val = String(fromNode.textValue ?? fromNode.prompt ?? fromNode.value ?? '').trim()
			else if (t === 'rotate-image') val = String(fromNode.rotatePromptText ?? '').trim()
			else if (t === 'text-merge')
				val = String(fromNode.mergedText ?? fromNode.textValue ?? '').trim()
			else if (t === 'scene-understanding')
				val = String((fromNode.sceneUnderstandingSettings as any)?.outputJson ?? '').trim()
			if (typeof console !== 'undefined') {
				console.log(
					`[ComfyUI][CollectTexts] resolveUpstreamText fromNodeId=${fromNodeId} via FALLBACK (nodeType=${t}) → ` +
						`len=${val.length}, preview=${val.slice(0, 80).replace(/\n/g, '\\n')}`
				)
			}
			return val
		}

		for (const anchor of anchors) {
			const mediaType = String(anchor?.mediaType ?? '').toLowerCase()
			const acceptedRaw = (anchor as any)?.acceptedMediaTypes
			const acceptedList = Array.isArray(acceptedRaw)
				? (acceptedRaw as Array<unknown>).map((v) => String(v ?? '').toLowerCase())
				: []
			const multiInput = Boolean((anchor as any)?.multiInput)
			const acceptsText = mediaType === 'text' || acceptedList.includes('text')

			// —— 两种情况参与文本收集：
			//    1) mediaType==='text' 的普通文本输入锚点（按设计规则，只允许连内置 text 节点）；
			//    2) mediaType==='generic' + acceptedMediaTypes 包含 'text' 的多输入聚合锚点
			//       （典型：ComfyUI / Blender 节点的 "in" 锚点，同时接收 text/image/video/model3d）。
			//    对 image / video / model3d / unknown mediaType，一律跳过不参与提示词拼接。
			if (!acceptsText) continue
			const toAnchorId = String(anchor?.id ?? '').trim()
			if (!toAnchorId) continue
			result.textAnchorsSeen++

			const anchorName = String(anchor?.name ?? anchor?.label ?? '').toLowerCase()
			const classified: 'positive' | 'negative' = NEGATIVE_ANCHOR_RE.test(
				`${toAnchorId} ${anchorName}`
			)
				? 'negative'
				: 'positive'

			// —— 聚合锚点分支（generic + multiInput）：同一个 "in" 下可能连了 text / image /
			//    video 等多条入边，必须逐条遍历 edges 判断上游节点类型，解析文本（若上游
			//    是 image/video 型节点，resolveUpstreamText 返回空字符串，自然被跳过）。
			if (mediaType === 'generic' && multiInput) {
				const anchoredEdges = incomingEdges.filter((e) => String(e.toAnchorId ?? '') === toAnchorId)
				if (typeof console !== 'undefined') {
					console.log(
						`[ComfyUI][CollectTexts] STEP-B anchor=${toAnchorId} classified=${classified} ` +
							`(generic 聚合锚点) → matched edges=${anchoredEdges.length}`
					)
				}
				for (const e of anchoredEdges) {
					const fromNodeId = String(e.fromNodeId ?? '')
					if (!fromNodeId) continue
					const fromAnchorId = String(e.fromAnchorId ?? '') || undefined
					const text = resolveUpstreamText(fromNodeId, fromAnchorId)
					if (!text) continue
					result.textAnchorsFilled++
					if (classified === 'negative') result.negative.push(text)
					else result.positive.push(text)
					result.inOrder.push({ value: text, classified })
				}
				continue
			}

			// —— 普通单文本锚点分支（mediaType==='text'）：走官方 getIncomingTextValue 解析器
			//    （单锚点单连接；若用户仍需额外支持 multiInput 的 text 锚点，已由上层兜底。）
			if (typeof console !== 'undefined') {
				console.log(
					`[ComfyUI][CollectTexts] STEP-B anchor=${toAnchorId} classified=${classified} ` +
						`(普通文本锚点) → via getIncomingTextValue`
				)
			}
			const text =
				typeof payload.getIncomingTextValue === 'function'
					? String(payload.getIncomingTextValue(nodeId, toAnchorId) ?? '').trim()
					: ''
			if (typeof console !== 'undefined') {
				console.log(
					`[ComfyUI][CollectTexts] STEP-C anchor=${toAnchorId} getIncomingTextValue 结果: ` +
						`len=${text.length}, preview=${text.slice(0, 80).replace(/\n/g, '\\n')}`
				)
			}
			if (!text) continue
			result.textAnchorsFilled++
			if (classified === 'negative') result.negative.push(text)
			else result.positive.push(text)
			result.inOrder.push({ value: text, classified })
		}

		if (typeof console !== 'undefined') {
			console.log(
				`%c[ComfyUI][CollectTexts] STEP-D 汇总: ` +
					`textAnchorsSeen=${result.textAnchorsSeen}, textAnchorsFilled=${result.textAnchorsFilled}, ` +
					`positive=${result.positive.length}段(${result.positive.reduce((a, s) => a + s.length, 0)}字), ` +
					`negative=${result.negative.length}段(${result.negative.reduce((a, s) => a + s.length, 0)}字)`,
				'color:#0369a1;font-weight:bold'
			)
			if (result.positive.length > 0) {
				console.log(
					'[ComfyUI][CollectTexts] positive[0] 完整前200字:\n' + result.positive[0].slice(0, 200)
				)
			}
			if (result.negative.length > 0) {
				console.log(
					'[ComfyUI][CollectTexts] negative[0] 完整前200字:\n' + result.negative[0].slice(0, 200)
				)
			}
		}
		return result
	}

	const onComfyUIRun = async (nodeId: string) => {
		if (typeof console !== 'undefined') {
			console.log(
				`%c[ComfyUI][RUN] 🚀 onComfyUIRun STARTED nodeId=${nodeId}. ` +
					`(If this line MISSING in your console → 运行按钮没真正触发 / 代码还没被打包到你当前运行的版本)`,
				'color:#059669;font-weight:bold;font-size:13px'
			)
		}
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		const settings = (node?.comfyuiSettings ?? {}) as {
			baseUrl?: string
			workflowPath?: string
			positivePrompt?: string
			negativePrompt?: string
			inputRequirements?: {
				images?: { min: number; max: number }
				videos?: { min: number; max: number }
				models?: { min: number; max: number }
				positivePrompt?: { required: boolean }
				negativePrompt?: { required: boolean }
			}
			workflowWarnings?: string[]
			hasHistory?: boolean
			historyChecked?: boolean
			historyGuideMessage?: string
			historyGuideBaseUrl?: string
			historyPromptId?: string
			historyInputMappings?: {
				imageInputs: Array<{ nodeId: string; classType: string; inputKey: string }>
				videoInputs: Array<{ nodeId: string; classType: string; inputKey: string }>
				textNodes: {
					positive: Array<{
						nodeId: string
						classType: string
						inputKey?: string
						allTextKeys?: string[]
					}>
					negative: Array<{
						nodeId: string
						classType: string
						inputKey?: string
						allTextKeys?: string[]
					}>
				}
				seedNodes: Array<{ nodeId: string; classType: string; inputKey: string }>
			}
			imageInputCount?: number
			videoInputCount?: number
			hasTextPromptInput?: boolean
		}
		const baseUrl = String(settings.baseUrl ?? '').trim()
		const workflowPath = String(settings.workflowPath ?? '').trim()
		const configuredPositivePrompt = String(settings.positivePrompt ?? '')
		const configuredNegativePrompt = String(settings.negativePrompt ?? '')
		const incomingTexts = collectComfyInputTexts(nodeId)
		const anchorPositiveParts = incomingTexts.positive
		const anchorNegativeParts = incomingTexts.negative
		const positiveCandidateParts = [...anchorPositiveParts, configuredPositivePrompt]
		const negativeCandidateParts = [...anchorNegativeParts, configuredNegativePrompt]
		const finalPositivePrompt = positiveCandidateParts.filter(Boolean).join('\n\n')
		const finalNegativePrompt = negativeCandidateParts.filter(Boolean).join('\n\n')

		// 防御性 WARN：节点声明了 text 类型输入锚点（根据规则：这些锚点只允许连内置 text 节点），
		// 但最终上游连接的文本全部为空（官方解析器没解析出内容），提示用户可能未连线或文本节点未运行
		if (
			incomingTexts.textAnchorsSeen > 0 &&
			incomingTexts.textAnchorsFilled === 0 &&
			finalPositivePrompt.length === 0 &&
			finalNegativePrompt.length === 0 &&
			typeof console !== 'undefined'
		) {
			console.warn(
				`[ComfyUI][CollectTexts] ⚠️ 当前 comfyui 节点声明了 ${incomingTexts.textAnchorsSeen} 个 text 类型输入锚点，` +
					`但没有任何一个锚点解析到非空上游文本（上游只允许连 DVStudio 内置 text / rotate-image / ` +
					`text-merge / scene 节点，不允许连另一个 comfyui 节点）。` +
					`textAnchorsSeen=${incomingTexts.textAnchorsSeen}, textAnchorsFilled=${incomingTexts.textAnchorsFilled}`
			)
		}
		// 提交前打印 payload 中的 positivePrompt 信息（便于审计）
		if (typeof console !== 'undefined') {
			console.log('%c[ComfyUI][RUN] 📝 prompt summary', 'color:#7c3aed;font-weight:bold', {
				finalPositivePromptLen: finalPositivePrompt.length,
				finalNegativePromptLen: finalNegativePrompt.length,
				configuredPromptLen: configuredPositivePrompt.length,
				anchorPositiveParts: anchorPositiveParts.length,
				anchorNegativeParts: incomingTexts.negative.length,
				textAnchorsSeen: incomingTexts.textAnchorsSeen,
				textAnchorsFilled: incomingTexts.textAnchorsFilled,
				hasHistoryPromptId: Boolean(settings.historyPromptId),
				workflowPath
			})
			if (finalPositivePrompt.length > 0) {
				console.log(
					'%c[ComfyUI][RUN] ✅ finalPositivePrompt (前300字):\n' +
						finalPositivePrompt.slice(0, 300),
					'color:#7c3aed'
				)
			} else {
				console.warn(
					'%c[ComfyUI][RUN] ❌ finalPositivePrompt 是空字符串！anchorPositiveParts=' +
						`${anchorPositiveParts.length}, configuredPositivePrompt.len=${configuredPositivePrompt.length}` +
						`\n  若上游确实连接了文本节点 → 请检查 collectComfyInputTexts STEP-A~D 日志`,
					'color:#b91c1c;font-weight:bold'
				)
			}
			if (finalNegativePrompt.length > 0) {
				console.log(
					'%c[ComfyUI][RUN] ➖ finalNegativePrompt (前200字):\n' +
						finalNegativePrompt.slice(0, 200),
					'color:#475569'
				)
			}
		}

		if (!node || node.type !== 'comfyui') return
		if (!baseUrl) {
			payload.pushToast(t('aiworkflow.toast.comfyAddressRequired'), 'warn')
			return
		}
		if (!workflowPath) {
			payload.pushToast(t('aiworkflow.toast.comfyWorkflowRequired'), 'warn')
			return
		}

		// F8-A2：无成功运行历史不再硬阻断，改为 WARN 提示后继续执行
		//   ComfyUI 本身不要求"先成功运行一次"才能提交任务。历史记录仅用于
		//   自动匹配输入节点、输出锚点与回填参数，不是运行的前置条件。
		if (settings.historyChecked && settings.hasHistory === false) {
			const errMsg = settings.historyGuideMessage || t('nodes.comfyui.noHistoryRecord')
			payload.pushToast(
				errMsg + '，将以工作流默认值直接提交给 ComfyUI 执行（输入/输出锚点可能不完全匹配）',
				'warn'
			)
		}

		stopComfyUIPoll(nodeId)
		payload.clearComfyRouteCache(nodeId)
		comfyTerminalNotified.delete(nodeId)
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
				runStatus: 'running',
				progress: 5,
				statusText: t('nodes.comfyui.submitting'),
				outputs: [],
				lastUpdateAt: Date.now()
			}
		})

		try {
			const resources = await collectComfyUIInputResources(nodeId)

			const validationErrors: string[] = []
			const expectedImages =
				typeof settings.imageInputCount === 'number' ? settings.imageInputCount : null
			const expectedVideos =
				typeof settings.videoInputCount === 'number' ? settings.videoInputCount : null
			const needsPrompt = settings.hasTextPromptInput === true

			if (
				expectedImages !== null &&
				expectedImages > 0 &&
				resources.images.length < expectedImages
			) {
				// F7: 增强错误信息，帮助用户定位问题
				const d = lastCollectDiag
				let reason = ''
				if (d && d.matchedEdges === 0) {
					reason = '（未检测到上游节点连线，请检查输入锚点是否已连接）'
				} else if (d && d.skippedMissingResourceId > 0) {
					reason = `（${d.skippedMissingResourceId} 个上游节点未关联资源文件）`
				} else if (d && d.skippedMissingResource > 0) {
					reason = `（${d.skippedMissingResource} 个资源在资源池中找不到）`
				} else if (d && d.skippedFileConversion > 0) {
					reason = `（${d.skippedFileConversion} 个资源文件加载失败）`
				}
				validationErrors.push(
					`工作流需要 ${expectedImages} 张图片输入，当前连接了 ${resources.images.length} 张${reason}`
				)
			}
			if (
				expectedVideos !== null &&
				expectedVideos > 0 &&
				resources.videos.length < expectedVideos
			) {
				validationErrors.push(
					`工作流需要 ${expectedVideos} 个视频输入，当前连接了 ${resources.videos.length} 个`
				)
			}
			if (needsPrompt && !finalPositivePrompt) {
				validationErrors.push('工作流需要提示词输入，请连接文本节点或在设置中填写提示词')
			}

			if (settings.inputRequirements && validationErrors.length === 0) {
				const inputReqs = settings.inputRequirements
				const imgMin = Number(inputReqs.images?.min ?? 0)
				const imgMax = Number(inputReqs.images?.max ?? 999)
				if (resources.images.length < imgMin) {
					validationErrors.push(
						`工作流需要至少 ${imgMin} 张图片输入，当前连接了 ${resources.images.length} 张`
					)
				} else if (resources.images.length > imgMax) {
					validationErrors.push(
						`工作流最多接受 ${imgMax} 张图片输入，当前连接了 ${resources.images.length} 张`
					)
				}

				const vidMin = Number(inputReqs.videos?.min ?? 0)
				const vidMax = Number(inputReqs.videos?.max ?? 999)
				if (resources.videos.length < vidMin) {
					validationErrors.push(
						`工作流需要至少 ${vidMin} 个视频输入，当前连接了 ${resources.videos.length} 个`
					)
				} else if (resources.videos.length > vidMax) {
					validationErrors.push(
						`工作流最多接受 ${vidMax} 个视频输入，当前连接了 ${resources.videos.length} 个`
					)
				}

				if (inputReqs.positivePrompt?.required && !finalPositivePrompt) {
					validationErrors.push('工作流需要正向提示词输入，请连接文本节点或在设置中填写提示词')
				}
			}

			// F8-A2：无 historyInputMappings 不再阻断运行，降级为 WARN 提示
			//   允许用户直接运行（inputMappings 传 undefined 给后端，
			//   后端 comfyService.run 会走默认填充逻辑或直接把文件上传到 ComfyUI
			//   再由工作流解析）。仅当 historyInputMappings 缺失且有输入资源时提示。
			if (validationErrors.length === 0 && !settings.historyInputMappings) {
				const hasInputs =
					resources.images.length > 0 ||
					resources.videos.length > 0 ||
					finalPositivePrompt.length > 0
				if (hasInputs) {
					payload.pushToast(
						'未解析到工作流输入定义，已将资源/提示词按顺序提交，ComfyUI 可能无法正确注入参数。建议先在 ComfyUI 中成功运行一次工作流以建立历史记录。',
						'warn'
					)
				}
			}

			if (validationErrors.length > 0) {
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						runStatus: 'failed',
						progress: 0,
						statusText: '输入参数校验失败',
						lastUpdateAt: Date.now()
					}
				})
				payload.pushToast(
					`输入参数不满足要求：\n${validationErrors.slice(0, 3).join('\n')}`,
					'error'
				)
				return
			}

			const allFiles: ComfyInputFile[] = [
				...resources.images.map((f) => ({ file: f, mediaType: 'image' as const })),
				...resources.videos.map((f) => ({ file: f, mediaType: 'video' as const }))
			]
			const runParams = {
				positivePrompt: finalPositivePrompt,
				negativePrompt: finalNegativePrompt,
				historyPromptId: settings.historyPromptId,
				inputMappings: settings.historyInputMappings
			}
			if (typeof console !== 'undefined') {
				console.log(
					`%c[ComfyUI][RUN] 📤 comfyService.run 即将发起调用: baseUrl=${baseUrl} ` +
						`| workflowPath=${workflowPath} | images=${resources.images.length} videos=${resources.videos.length} ` +
						`| positivePrompt.len=${runParams.positivePrompt.length} | negativePrompt.len=${runParams.negativePrompt.length}`,
					'color:#0ea5e9;font-weight:bold'
				)
				if (runParams.positivePrompt) {
					console.log(
						'[ComfyUI][RUN] 📤 positivePrompt 完整前400字:\n' +
							runParams.positivePrompt.slice(0, 400)
					)
				}
				console.log(
					'[ComfyUI][RUN] 📤 runParams JSON:',
					JSON.stringify(
						{
							...runParams,
							inputMappings: runParams.inputMappings
								? {
										imageInputs: (runParams.inputMappings as any).imageInputs?.length ?? 0,
										videoInputs: (runParams.inputMappings as any).videoInputs?.length ?? 0,
										textNodes_positive:
											((runParams.inputMappings as any).textNodes?.positive as unknown[])?.length ??
											0,
										textNodes_negative:
											((runParams.inputMappings as any).textNodes?.negative as unknown[])?.length ??
											0,
										seedNodes: (runParams.inputMappings as any).seedNodes?.length ?? 0
									}
								: undefined
						},
						null,
						2
					)
				)
			}
			const rr = await payload.comfyService.run(baseUrl, workflowPath, allFiles, runParams)
			if (!rr.ok) {
				if (rr.requiresHistorySetup) {
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: 'idle',
							progress: 0,
							statusText: t('nodes.comfyui.needRunInComfyFirst'),
							lastUpdateAt: Date.now(),
							historyChecked: true,
							hasHistory: false,
							historyGuideMessage: rr.message || t('nodes.comfyui.noHistoryRecord'),
							historyGuideBaseUrl: rr.baseUrl || baseUrl
						}
					})
					payload.pushToast(rr.message || t('nodes.comfyui.noHistoryRecord'), 'warn')
					return
				}
				console.error('[ComfyUI] 运行失败', {
					nodeId,
					baseUrl,
					workflowPath,
					error: rr.error,
					comfyuiError: rr.comfyuiError,
					raw: rr
				})
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						runStatus: 'failed',
						progress: 100,
						statusText: t('nodes.comfyui.submitFailed'),
						lastUpdateAt: Date.now()
					}
				})
				let errorMsg = String(rr.error || 'unknown')
				if (rr.comfyuiError && typeof rr.comfyuiError === 'object') {
					const nodeErrors = (rr.comfyuiError as any).node_errors
					if (nodeErrors && typeof nodeErrors === 'object') {
						const details: string[] = []
						for (const [_nid, errInfo] of Object.entries(nodeErrors)) {
							const info = errInfo as any
							const errors = Array.isArray(info?.errors) ? info.errors : []
							const msg = errors.map((e: any) => e.message || e.details || String(e)).join('; ')
							const classType = info?.class_type ? `(${info.class_type})` : ''
							details.push(`节点${classType}: ${msg}`)
						}
						if (details.length > 0) {
							errorMsg = `${errorMsg}\n${details.slice(0, 3).join('\n')}`
						}
					}
				}
				payload.pushToast(t('aiworkflow.toast.comfyRunFailed', { error: errorMsg }), 'error')
				return
			}

			const pid = String(rr.promptId ?? '')
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					runStatus: 'running',
					promptId: pid,
					progress: 10,
					statusText: pid ? t('nodes.comfyui.submitted') : t('nodes.comfyui.submittedNoPromptId'),
					lastUpdateAt: Date.now()
				}
			})

			// —— Phase 4 前端诊断增强：打印 textWriteDiagnostics 结构化表格 + 异常情况 toast ——
			const d = rr.textWriteDiagnostics as TextWriteDiagnostics | undefined
			if (d) {
				const rows: Record<string, unknown>[] = []
				rows.push({
					metric: 'baselineSource',
					value: d.baselineSource ?? rr.promptSource ?? 'unknown'
				})
				rows.push({
					metric: 'whitelistFiltered (drop UI-only nodes)',
					value: d.whitelistFiltered ?? '—'
				})
				rows.push({ metric: 'classTypeFromHistory', value: d.classTypeFromHistory ?? 0 })
				rows.push({ metric: 'mergedFromHistoryCount', value: d.mergedFromHistoryCount ?? 0 })
				rows.push({ metric: 'positivePromptProvided', value: d.positivePromptProvided })
				rows.push({ metric: 'negativePromptProvided', value: d.negativePromptProvided })
				rows.push({ metric: 'preClearCount (Defense-Clear)', value: d.preClearCount ?? '—' })
				rows.push({
					metric: 'downstreamWrites (Defense-Downstream)',
					value: `pos=${d.downstreamWrites?.positive ?? 0} / neg=${d.downstreamWrites?.negative ?? 0}`
				})
				rows.push({
					metric: 'mappings write',
					value: `pos=${d.positiveWriteCount}/${d.positiveMappingCount}   neg=${d.negativeWriteCount}/${d.negativeMappingCount}`
				})
				rows.push({
					metric: 'fallback fullGraph write',
					value: d.fallbackRan
						? `ran  pos=${d.fallbackWrites?.positive ?? 0} / neg=${d.fallbackWrites?.negative ?? 0}`
						: 'not triggered'
				})
				rows.push({
					metric: 'snapshot nodes',
					value: Object.keys(d.snapshot ?? {}).join(', ') || 'none'
				})
				// eslint-disable-next-line no-console
				console.groupCollapsed(
					`[ComfyUI] Text write diagnostics (node=${nodeId} pid=${pid || '—'})`
				)
				// eslint-disable-next-line no-console
				console.table(rows)
				if (d.writtenDetails && Array.isArray(d.writtenDetails.positive)) {
					// eslint-disable-next-line no-console
					console.log(
						'positive written details:',
						d.writtenDetails.positive.map(
							(x: TextWrittenDetail) => `${x.nodeId}(${x.classType}).${x.key} = "${x.valuePreview}"`
						)
					)
				}
				if (d.writtenDetails && Array.isArray(d.writtenDetails.negative)) {
					// eslint-disable-next-line no-console
					console.log(
						'negative written details:',
						d.writtenDetails.negative.map(
							(x: TextWrittenDetail) => `${x.nodeId}(${x.classType}).${x.key} = "${x.valuePreview}"`
						)
					)
				}
				// eslint-disable-next-line no-console
				console.groupEnd()

				const totalPosWrites =
					Number(d.positiveWriteCount || 0) +
					Number(d.downstreamWrites?.positive || 0) +
					Number(d.fallbackWrites?.positive || 0)
				const totalNegWrites =
					Number(d.negativeWriteCount || 0) +
					Number(d.downstreamWrites?.negative || 0) +
					Number(d.fallbackWrites?.negative || 0)
				const anyPosLeakSuspicious =
					d.positivePromptProvided === true &&
					totalPosWrites === 0 &&
					finalPositivePrompt &&
					finalPositivePrompt.length > 0
				const anyNegLeakSuspicious =
					d.negativePromptProvided === true &&
					totalNegWrites === 0 &&
					finalNegativePrompt &&
					finalNegativePrompt.length > 0
				if (anyPosLeakSuspicious || anyNegLeakSuspicious) {
					const part1 = anyPosLeakSuspicious
						? `⚠️ 正向提示词未写入任何ComfyUI节点（提供了${finalPositivePrompt.length}字符）。`
						: ''
					const part2 = anyNegLeakSuspicious
						? `⚠️ 负向提示词未写入任何ComfyUI节点（提供了${finalNegativePrompt.length}字符）。`
						: ''
					payload.pushToast(
						`${part1}${part2}视频可能会使用ComfyUI工作流中嵌入的旧默认值。请联系开发人员排查节点映射或在ComfyUI中再运行一次。`,
						'error'
					)
				}
			}

			if (pid) startComfyUIPoll(nodeId, baseUrl, pid)
		} catch (err: unknown) {
			console.error('[ComfyUI] 运行异常', {
				nodeId,
				baseUrl,
				workflowPath,
				err
			})
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					runStatus: 'failed',
					progress: 100,
					statusText: t('nodes.comfyui.submitException'),
					lastUpdateAt: Date.now()
				}
			})
			payload.pushToast(
				t('aiworkflow.toast.comfyRunException', { error: getErrorMessage(err) }),
				'error'
			)
		}
	}

	const onComfyUICancel = async (nodeId: string) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		const settings = (node?.comfyuiSettings ?? {}) as { baseUrl?: string; promptId?: string }
		const baseUrl = String(settings.baseUrl ?? '').trim()
		const promptId = String(settings.promptId ?? '').trim()
		if (!node || node.type !== 'comfyui') return
		if (!baseUrl || !promptId) return

		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
				runStatus: 'canceling',
				statusText: t('nodes.comfyui.canceling'),
				lastUpdateAt: Date.now()
			}
		})

		try {
			const res = await payload.comfyService.cancel(baseUrl, promptId)
			if (!res.ok && isLikelyJobMissing(res)) {
				resetComfyNodeToIdle(nodeId, t('nodes.comfyui.jobGoneRunnable'), 'info')
				return
			}

			const jr = await payload.comfyService.job(baseUrl, promptId)
			if (!jr.ok || isLikelyJobMissing(jr) || !normalizeJobFromResult(jr.result, promptId)) {
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						runStatus: 'cancelled',
						promptId: '',
						progress: 100,
						statusText: t('nodes.comfyui.cancelled'),
						lastUpdateAt: Date.now()
					}
				})
				stopComfyUIPoll(nodeId)
				return
			}

			startComfyUIPoll(nodeId, baseUrl, promptId)
		} catch (_err: unknown) {
			resetComfyNodeToIdle(nodeId, t('nodes.comfyui.cancelFailed'), 'warn')
		}
	}

	const recoverComfyUIRunStates = async (opts?: { silent?: boolean }) => {
		const comfyNodes: ComfyNode[] = []
		for (const id of payload.store.state.nodeOrder) {
			const n = payload.store.state.nodesById[id] as ComfyNode | undefined
			if (n && n.type === 'comfyui') comfyNodes.push(n)
		}

		for (const node of comfyNodes) {
			const nodeId = node.id
			const settings = (node.comfyuiSettings ?? {}) as {
				baseUrl?: string
				promptId?: string
				runStatus?: string
			}
			const baseUrl = String(settings.baseUrl ?? '').trim()
			const promptId = String(settings.promptId ?? '').trim()
			const runStatus = String(settings.runStatus ?? '').toLowerCase()
			if (!baseUrl || !promptId) continue
			if (runStatus !== 'running' && runStatus !== 'canceling') continue

			try {
				const jr = await payload.comfyService.job(baseUrl, promptId)
				if (!jr.ok || isLikelyJobMissing(jr)) {
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: 'idle',
							promptId: '',
							progress: 0,
							statusText: t('nodes.comfyui.taskInvalidated'),
							lastUpdateAt: Date.now()
						}
					})
					stopComfyUIPoll(nodeId)
					if (!opts?.silent)
						payload.pushToast(
							t('aiworkflow.toast.nodeTaskReset', {
								name: String(node.alias || node.title || nodeId)
							}),
							'warn'
						)
					continue
				}

				const job = normalizeJobFromResult(jr.result, promptId)
				if (!job) {
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: 'idle',
							promptId: '',
							progress: 0,
							statusText: t('nodes.comfyui.taskNotFoundReset'),
							lastUpdateAt: Date.now()
						}
					})
					stopComfyUIPoll(nodeId)
					continue
				}

				const next = deriveRunStateFromJob(job)
				if (next.runStatus === 'running') {
					startComfyUIPoll(nodeId, baseUrl, promptId)
				} else if (
					next.runStatus === 'completed' ||
					next.runStatus === 'failed' ||
					next.runStatus === 'cancelled'
				) {
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: next.runStatus,
							progress: next.progress,
							statusText: next.text,
							lastUpdateAt: Date.now()
						}
					})
					stopComfyUIPoll(nodeId)
				}
			} catch {
				stopComfyUIPoll(nodeId)
			}
		}
	}

	const disposeComfyRuntime = () => {
		for (const timer of comfyPollTimers.values()) window.clearInterval(timer)
		comfyPollTimers.clear()
		comfyPollErrorCounts.clear()
		comfyTerminalNotified.clear()
	}

	return {
		onComfyUIRun,
		onComfyUICancel,
		recoverComfyUIRunStates,
		stopComfyUIPoll,
		disposeComfyRuntime
	}
}
