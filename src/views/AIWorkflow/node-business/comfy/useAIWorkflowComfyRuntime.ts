import { ref } from 'vue'
import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { getErrorMessage, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'

type ReuseRecordConfirmState = {
	nodeId: string
	workflowName?: string
	savedAt?: number
}

type RunState = {
	runStatus: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
	progress: number
	text: string
}

type ComfyService = {
	run: (
		baseUrl: string,
		workflowPath: string,
		files: File[],
		opts?: Record<string, unknown>
	) => Promise<{
		ok: boolean
		error?: string
		promptId?: string
		requiresConfirm?: boolean
		fallbackRecord?: Record<string, unknown>
		result?: Record<string, unknown>
		[key: string]: unknown
	}>
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

type InputAnchor = { id?: string; [key: string]: unknown }
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
}) => {
	const comfyPollTimers = new Map<string, number>()
	const comfyTerminalNotified = new Set<string>()
	const comfyPollErrorCounts = new Map<string, number>()

	const reuseRecordConfirm = ref<ReuseRecordConfirmState | null>(null)

	const formatReuseRecordTime = (value?: number) => {
		const ts = Number(value)
		if (!Number.isFinite(ts) || ts <= 0) return t('aiworkflow.runtime.unknown')
		return new Date(ts).toLocaleString()
	}

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
		if (status === 'pending') return { runStatus: 'running', progress: 10, text: t('nodes.comfyui.pending') }
		if (status === 'in_progress') return { runStatus: 'running', progress: 50, text: t('nodes.comfyui.inProgress') }
		if (status === 'completed') return { runStatus: 'completed', progress: 100, text: t('nodes.comfyui.completed') }
		if (status === 'failed') return { runStatus: 'failed', progress: 100, text: t('nodes.comfyui.failed') }
		if (status === 'cancelled') return { runStatus: 'cancelled', progress: 100, text: t('nodes.comfyui.cancelled') }
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
						resetComfyNodeToIdle(
							nodeId,
							t('nodes.comfyui.pollingStopped'),
							'warn'
						)
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
					outputsCount != null && next.runStatus === 'completed' ? t('nodes.comfyui.outputsCount', { count: String(outputsCount) }) : ''
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
										statusText: t('nodes.comfyui.completedWithOutputs', { count: String(media.length) }),
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
									t('nodes.comfyui.completedWithWarnings', { count: String(terminalAlerts.length) }),
									'warn'
								)
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

	const collectComfyUIInputFiles = async (nodeId: string): Promise<File[]> => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		if (!node || node.type !== 'comfyui') return []
		const inputs = Array.isArray(node.inputs) ? (node.inputs as InputAnchor[]) : []

		const out: File[] = []
		for (let i = 0; i < inputs.length; i += 1) {
			const anchorId = String(inputs[i]?.id ?? '').trim()
			if (!anchorId) continue
			const edge = payload.store.state.edgeOrder
				.map((id) => payload.store.state.edgesById[id] as ComfyEdge | undefined)
				.find((e) => e && e.toNodeId === nodeId && e.toAnchorId === anchorId)
			if (!edge) continue
			const fromNodeRecord = payload.store.state.nodesById[edge.fromNodeId ?? '']
			const fromNode = fromNodeRecord as ComfyNode | undefined
			const rid = String(fromNode?.resourceId ?? '').trim()
			if (!rid) continue
			const resourceRecord = payload.store.state.resourcesById[rid]
			const resource = resourceRecord as ComfyResource | undefined
			if (!resource) continue
			if (resource.kind !== 'image') {
				payload.pushToast(t('aiworkflow.toast.comfyImageOnly'), 'warn')
				continue
			}
			const url = String(resource.url ?? '').trim()
			if (!url) continue
			const resp = await fetch(url)
			const blob = await resp.blob()
			const name = String(resource.name ?? `input_${i}.png`) || `input_${i}.png`
			out.push(new File([blob], name, { type: blob.type || 'image/png' }))
		}
		return out
	}

	const onCancelReuseRecord = () => {
		const target = reuseRecordConfirm.value
		reuseRecordConfirm.value = null
		if (!target) return
		payload.store.commit('setNodeComfyUISettings', {
			nodeId: target.nodeId,
			comfyuiSettings: {
				runStatus: 'idle',
				progress: 0,
				statusText: t('nodes.comfyui.reuseRecordCancelled'),
				lastUpdateAt: Date.now()
			}
		})
	}

	const onComfyUIRun = async (nodeId: string, opts?: { confirmReuseRecord?: boolean }) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as ComfyNode | undefined
		const settings = (node?.comfyuiSettings ?? {}) as {
			baseUrl?: string
			workflowPath?: string
			positivePrompt?: string
			negativePrompt?: string
		}
		const baseUrl = String(settings.baseUrl ?? '').trim()
		const workflowPath = String(settings.workflowPath ?? '').trim()
		const positivePrompt = String(settings.positivePrompt ?? '')
		const negativePrompt = String(settings.negativePrompt ?? '')
		const positiveFromText = payload.getIncomingTextValue(nodeId, 'in-positive')
		const negativeFromText = payload.getIncomingTextValue(nodeId, 'in-negative')
		const finalPositivePrompt = String(positiveFromText).trim() ? positiveFromText : positivePrompt
		const finalNegativePrompt = String(negativeFromText).trim() ? negativeFromText : negativePrompt

		if (!node || node.type !== 'comfyui') return
		if (!baseUrl) {
			payload.pushToast(t('aiworkflow.toast.comfyAddressRequired'), 'warn')
			return
		}
		if (!workflowPath) {
			payload.pushToast(t('aiworkflow.toast.comfyWorkflowRequired'), 'warn')
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
			const files = await collectComfyUIInputFiles(nodeId)
			const rr = await payload.comfyService.run(baseUrl, workflowPath, files, {
				positivePrompt: finalPositivePrompt,
				negativePrompt: finalNegativePrompt,
				confirmReuseRecord: Boolean(opts?.confirmReuseRecord)
			})
			if (!rr.ok) {
				if (rr.requiresConfirm) {
					const fallback = rr.fallbackRecord as
						| { workflowName?: string; savedAt?: number }
						| undefined
					reuseRecordConfirm.value = {
						nodeId,
						workflowName: String(fallback?.workflowName ?? workflowPath),
						savedAt: Number(fallback?.savedAt)
					}
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: {
							runStatus: 'idle',
							progress: 0,
							statusText: t('nodes.comfyui.waitingReuseConfirm'),
							lastUpdateAt: Date.now()
						}
					})
					payload.pushToast(
						t('nodes.comfyui.historyUnavailable'),
						'warn'
					)
					return
				}
				console.error('[ComfyUI] 运行失败', {
					nodeId,
					baseUrl,
					workflowPath,
					error: rr.error,
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
				payload.pushToast(t('aiworkflow.toast.comfyRunFailed', { error: String(rr.error || 'unknown') }), 'error')
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
			payload.pushToast(t('aiworkflow.toast.comfyRunException', { error: getErrorMessage(err) }), 'error')
		}
	}

	const onConfirmReuseRecord = () => {
		const target = reuseRecordConfirm.value
		reuseRecordConfirm.value = null
		if (!target) return
		void onComfyUIRun(target.nodeId, { confirmReuseRecord: true })
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
		} catch (err: unknown) {
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
						payload.pushToast(t('aiworkflow.toast.nodeTaskReset', { name: String(node.alias || node.title || nodeId) }), 'warn')
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
		reuseRecordConfirm.value = null
		for (const timer of comfyPollTimers.values()) window.clearInterval(timer)
		comfyPollTimers.clear()
		comfyPollErrorCounts.clear()
		comfyTerminalNotified.clear()
	}

	return {
		reuseRecordConfirm,
		formatReuseRecordTime,
		onCancelReuseRecord,
		onConfirmReuseRecord,
		onComfyUIRun,
		onComfyUICancel,
		recoverComfyUIRunStates,
		stopComfyUIPoll,
		disposeComfyRuntime
	}
}
