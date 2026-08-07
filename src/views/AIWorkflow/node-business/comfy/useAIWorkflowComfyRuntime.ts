import { ref } from 'vue'
import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { ComfyInputMappings } from '../../../../network/ComfyUIBridgeService'

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
						const or = await payload.comfyService.outputs(baseUrl, promptId)
						if (or.ok) {
							const media = Array.isArray(or.media) ? or.media : []
							const dispatchRes = await payload.routeComfyOutputsToConnectedNodes(nodeId, media, {
								notifyWarnings: next.runStatus !== 'running'
							})
							const localizedOutputs = Array.isArray(dispatchRes?.outputs)
								? dispatchRes.outputs
								: []
							localizedOutputsForAutoWire = localizedOutputs
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
			console.warn('[ComfyUI][Resource] resource.url is empty', { resourceId: (resource as any).id })
			return null
		}
		const fileName = String(resource.name ?? fallbackName) || fallbackName
		// 根据扩展名推断 MIME type（兜底方案）
		const ext = fileName.split('.').pop()?.toLowerCase()
		const extToMime: Record<string, string> = {
			png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
			gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
			mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
			txt: 'text/plain', json: 'application/json'
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
						url: url.slice(0, 120), resourceId: (resource as any).id
					})
					lastError = new Error(`HTTP ${resp.status}`)
					if (attempt < 2) await new Promise((r) => setTimeout(r, 200))
					continue
				}
				const blob = await resp.blob()
				const mime = blob.type || fallbackMime
				const finalBlob = mime && mime !== blob.type ? new Blob([blob], { type: mime }) : blob
				return new File([finalBlob], fileName, { type: finalBlob.type || 'application/octet-stream' })
			} catch (err) {
				lastError = err
				console.warn(`[ComfyUI][Resource] fetch failed (attempt ${attempt})`, {
					url: url.slice(0, 120), resourceId: (resource as any).id,
					error: err instanceof Error ? err.message : String(err),
					isDwebProtocol: url.startsWith('dweb:')
				})
				if (attempt < 2) await new Promise((r) => setTimeout(r, 200))
			}
		}
		console.error('[ComfyUI][Resource] Unable to convert resource to File after retries', {
			resourceId: (resource as any).id, resourceKind: resource.kind,
			url: url.slice(0, 120),
			error: lastError instanceof Error ? lastError.message : String(lastError)
		})
		return null
	}

	// FX5: 扩展正则，兼容 'in'(原始)、'in-0'(数字)、'in-image'/'in-text'/'in-video' 等语义化锚点
	const COMFY_INPUT_ANCHOR_PATTERN = /^in(-(text|image|video|audio|model3d|resource|[0-9]+))?$/

	let lastCollectDiag: {
		totalEdges: number; matchedEdges: number;
		skippedMissingResourceId: number; skippedMissingResource: number;
		skippedFileConversion: number; collectedImages: number; collectedVideos: number; collectedTexts: number
	} | null = null

	const collectComfyUIInputResources = async (nodeId: string): Promise<CollectedResources> => {
		const result: CollectedResources = { images: [], videos: [], texts: [] }
		const diag = {
			totalEdges: 0, matchedEdges: 0,
			skippedMissingResourceId: 0, skippedMissingResource: 0,
			skippedFileConversion: 0, collectedImages: 0, collectedVideos: 0, collectedTexts: 0
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
			if (!rid) { diag.skippedMissingResourceId++; continue }
			const resourceRecord = payload.store.state.resourcesById[rid]
			const resource = resourceRecord as ComfyResource | undefined
			if (!resource) { diag.skippedMissingResource++; continue }
			const kind = String(resource.kind ?? '').toLowerCase()
			const name = String(resource.name ?? `input_${i}`)
			const file = await resourceToFile(resource, name)
			if (!file) { diag.skippedFileConversion++; continue }
			if (fromType === 'image' || kind === 'image' || file.type.startsWith('image/')) {
				result.images.push(file)
				diag.collectedImages++
			} else if (fromType === 'video' || kind === 'video' || file.type.startsWith('video/')) {
				result.videos.push(file)
				diag.collectedVideos++
			}
		}

		console.debug('[ComfyUI][CollectResources] Diagnostics:', {
			nodeId, ...diag,
			expected: {
				images: (node.comfyuiSettings as any)?.imageInputCount,
				videos: (node.comfyuiSettings as any)?.videoInputCount
			}
		})
		lastCollectDiag = diag

		return result
	}

	const collectComfyInputText = (nodeId: string): string => {
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

		for (const edge of edges) {
			const fromNodeRecord = payload.store.state.nodesById[edge.fromNodeId ?? '']
			const fromNode = fromNodeRecord as ComfyNode | undefined
			if (!fromNode) continue
			const fromType = String(fromNode.type ?? '').toLowerCase()
			if (fromType === 'text') {
				return String(fromNode.textValue ?? fromNode.prompt ?? '').trim()
			}
		}
		return ''
	}

	const onComfyUIRun = async (nodeId: string) => {
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
		const incomingText = collectComfyInputText(nodeId)
		const finalPositivePrompt = [incomingText, configuredPositivePrompt].filter(Boolean).join(', ')
		const finalNegativePrompt = configuredNegativePrompt

		if (!node || node.type !== 'comfyui') return
		if (!baseUrl) {
			payload.pushToast(t('aiworkflow.toast.comfyAddressRequired'), 'warn')
			return
		}
		if (!workflowPath) {
			payload.pushToast(t('aiworkflow.toast.comfyWorkflowRequired'), 'warn')
			return
		}

		if (settings.historyChecked && settings.hasHistory === false) {
			const errMsg = settings.historyGuideMessage || t('nodes.comfyui.noHistoryRecord')
			payload.pushToast(errMsg, 'warn')
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					runStatus: 'idle',
					progress: 0,
					statusText: t('nodes.comfyui.needRunInComfyFirst'),
					lastUpdateAt: Date.now()
				}
			})
			return
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

			// 校验工作流输入映射是否存在（确保输入资源能被正确注入 ComfyUI 工作流的对应节点）
			if (validationErrors.length === 0 && !settings.historyInputMappings) {
				validationErrors.push(
					'未解析工作流输入/输出定义，请先在节点设置中点击"解析工作流"以确保输入资源能正确注入'
				)
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
			const rr = await payload.comfyService.run(baseUrl, workflowPath, allFiles, {
				positivePrompt: finalPositivePrompt,
				negativePrompt: finalNegativePrompt,
				historyPromptId: settings.historyPromptId,
				inputMappings: settings.historyInputMappings
			})
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
