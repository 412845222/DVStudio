import { extractCheckpointsFromObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { ComfyObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'
import type {
	LocalComfyWorkflow,
	ResolveHistoryResponse
} from '../../../../network/ComfyUIBridgeService'

type ComfyWorkflowSource = 'local' | 'userdata' | 'history'

type ComfyWorkflowListItemLite = {
	path: string
	name: string
	source?: ComfyWorkflowSource
	localId?: string
	updatedAt?: number
}

export const useAIWorkflowComfyConnection = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	comfyService: {
		ping: (baseUrl: string) => Promise<{
			ok: boolean
			error?: string
			systemInfo?: unknown
			comfyui?: {
				version?: string
				os?: string
				deviceName?: string
				devices?: Array<{ name?: string; type?: string }>
			}
			nodeCount?: number
			[key: string]: unknown
		}>
		listWorkflows: (baseUrl: string) => Promise<{
			ok: boolean
			error?: string
			workflows?: ComfyWorkflowListItemLite[]
			[key: string]: unknown
		}>
		getWorkflow: (
			baseUrl: string,
			workflowPath: string
		) => Promise<{
			ok: boolean
			error?: string
			workflowPath?: string
			workflow?: unknown
			[key: string]: unknown
		}>
		getObjectInfo: (baseUrl: string) => Promise<{
			ok: boolean
			error?: string
			objectInfo?: ComfyObjectInfo
			[key: string]: unknown
		}>
		resolveHistory: (baseUrl: string, workflowPath: string) => Promise<ResolveHistoryResponse>
		clearHistoryCache: (
			baseUrl: string,
			workflowPath: string
		) => Promise<{ ok: boolean; error?: string }>
		listLocalWorkflows: () => Promise<
			{ ok: true; items: LocalComfyWorkflow[] } | { ok: false; error: string }
		>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	getSessionKey?: () => unknown
	onWorkflowChanged?: (nodeId: string, workflowPath: string) => void
}) => {
	const requestEpoch = new Map<string, number>()
	let generation = 0
	const connectionEpoch = new Map<string, number>()
	const disposeComfyConnection = () => {
		generation++
		requestEpoch.clear()
	}
	// 将本地模板列表映射为下拉项
	const mapLocalWorkflowsToListItems = (
		items: LocalComfyWorkflow[]
	): ComfyWorkflowListItemLite[] => {
		return (items || []).map((w) => ({
			path: `local://${w.id}`,
			name: w.name || '未命名工作流',
			source: 'local',
			localId: w.id,
			updatedAt: Number(w.updatedAt) || 0
		}))
	}

	// 从 store 节点状态读取已缓存的本地模板列表项
	const readCachedLocalWorkflowItems = (nodeId: string): ComfyWorkflowListItemLite[] => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as
			| { comfyuiSettings?: { localWorkflows?: LocalComfyWorkflow[] } }
			| undefined
		const localItems = node?.comfyuiSettings?.localWorkflows
		return localItems ? mapLocalWorkflowsToListItems(localItems) : []
	}

	// 节点是否已存在非空的 workflows 列表（含 userdata/history/任意远程项）
	// 用于失败路径下判断是否需要"用本地模板兜底覆盖"，避免把已成功获取的远程列表清空
	const hasExistingWorkflows = (nodeId: string): boolean => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as { comfyuiSettings?: { workflows?: unknown[] } } | undefined
		const workflows = node?.comfyuiSettings?.workflows
		return Array.isArray(workflows) && workflows.length > 0
	}

	// 失败兜底：仅在节点 workflows 列表原本为空时，才用本地模板列表填充；
	// 已有 userdata/history 等远程列表项时保留原值不动，只让上层 pushToast 提示错误
	const applyLocalWorkflowsFallbackIfEmpty = (nodeId: string) => {
		if (hasExistingWorkflows(nodeId)) return
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { workflows: readCachedLocalWorkflowItems(nodeId) }
		})
	}

	// 预加载本地模板：在 ping 前填充下拉框，确保离线可浏览
	const preloadLocalWorkflows = async (nodeId: string) => {
		const gen = generation,
			session = payload.getSessionKey?.()
		const current = () =>
			gen === generation &&
			session === payload.getSessionKey?.() &&
			Boolean(payload.store.state.nodesById[nodeId])
		try {
			const localWf = await payload.comfyService.listLocalWorkflows()
			if (!current()) return
			if (localWf.ok) {
				const items = localWf.items || []
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: { localWorkflows: items }
				})
				const existing =
					(
						payload.store.state.nodesById[nodeId] as {
							comfyuiSettings?: { workflows?: ComfyWorkflowListItemLite[] }
						}
					)?.comfyuiSettings?.workflows || []
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						workflows: [
							...mapLocalWorkflowsToListItems(items),
							...existing.filter((w) => w.source !== 'local')
						]
					}
				})
			}
		} catch (err: unknown) {
			if (!current()) return
			payload.pushToast(
				t('nodes.comfyui.listLocalWorkflowsFailed', { error: getErrorMessage(err) }),
				'warn'
			)
		}
	}
	const onComfyUISettingsUpdate = (
		nodeId: string,
		input: {
			baseUrl?: string
			positivePrompt?: string
			negativePrompt?: string
			autoWireEnabled?: boolean
			inputBindings?: Record<string, string>
		}
	) => {
		const previous = payload.store.state.nodesById[nodeId] as
			| { comfyuiSettings?: { baseUrl?: string } }
			| undefined
		const changedServer =
			input.baseUrl !== undefined &&
			input.baseUrl.trim() !== previous?.comfyuiSettings?.baseUrl?.trim()
		if (changedServer) requestEpoch.set(nodeId, (requestEpoch.get(nodeId) || 0) + 1)
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
				...input,
				...(changedServer
					? {
							status: 'idle',
							templateResolution: undefined,
							historyChecked: false,
							historyInputMappings: undefined,
							inputBindings: undefined
						}
					: {}),
				...(Object.prototype.hasOwnProperty.call(input, 'positivePrompt')
					? { positivePromptEdited: true }
					: {}),
				...(Object.prototype.hasOwnProperty.call(input, 'negativePrompt')
					? { negativePromptEdited: true }
					: {})
			}
		})
	}

	const onComfyUIConnect = async (nodeId: string, input: { baseUrl: string }) => {
		const baseUrl = String(input?.baseUrl ?? '').trim()
		if (!baseUrl) return
		const epoch = (connectionEpoch.get(nodeId) || 0) + 1
		connectionEpoch.set(nodeId, epoch)
		const gen = generation,
			session = payload.getSessionKey?.()
		const current = () => {
			const node = payload.store.state.nodesById[nodeId] as
				| { comfyuiSettings?: { baseUrl?: string } }
				| undefined
			return (
				gen === generation &&
				session === payload.getSessionKey?.() &&
				connectionEpoch.get(nodeId) === epoch &&
				node?.comfyuiSettings?.baseUrl?.trim() === baseUrl
			)
		}
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { status: 'connecting', message: '', baseUrl, lastCheckedAt: Date.now() }
		})
		// 预加载本地模板：即便 ComfyUI 服务不可达，下拉框仍能展示本地模板（离线可浏览）
		await preloadLocalWorkflows(nodeId)
		if (!current()) return
		try {
			const res = await payload.comfyService.ping(baseUrl)
			if (!current()) return
			if (res.ok) {
				const systemInfo = res.systemInfo
					? {
							...(res.systemInfo as object),
							nodeCount: typeof res.nodeCount === 'number' ? res.nodeCount : undefined
						}
					: {
							system: {
								comfyui_version: res.comfyui?.version,
								os: res.comfyui?.os
							},
							devices: res.comfyui?.devices || [],
							nodeCount: typeof res.nodeCount === 'number' ? res.nodeCount : undefined
						}

				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						status: 'connected',
						message: '',
						lastCheckedAt: Date.now(),
						systemInfo
					}
				})

				try {
					const objInfoRes = await payload.comfyService.getObjectInfo(baseUrl)
					if (!current()) return
					if (objInfoRes.ok && objInfoRes.objectInfo) {
						const checkpoints = extractCheckpointsFromObjectInfo(objInfoRes.objectInfo)
						payload.store.commit('setNodeComfyUISettings', {
							nodeId,
							comfyuiSettings: {
								objectInfo: objInfoRes.objectInfo,
								checkpoints
							}
						})
					} else if (objInfoRes.error) {
						payload.pushToast(
							t('nodes.comfyui.getObjectInfoFailed', { error: objInfoRes.error }),
							'warn'
						)
					}
				} catch (err: unknown) {
					if (!current()) return
					payload.pushToast(
						t('nodes.comfyui.getObjectInfoFailed', { error: getErrorMessage(err) }),
						'warn'
					)
				}

				try {
					const wf = await payload.comfyService.listWorkflows(baseUrl)
					if (!current()) return
					if (wf.ok) {
						// 后端 runtimeListWorkflowFiles 已合并本地模板置顶；这里保留前端兜底：
						// 若远程结果未携带本地项，则用已缓存的本地模板补齐，保证本地模板始终可见
						const remoteItems = (wf.workflows || []) as ComfyWorkflowListItemLite[]
						const hasLocalInRemote = remoteItems.some((w) => w.source === 'local')
						const merged = hasLocalInRemote
							? remoteItems
							: [...readCachedLocalWorkflowItems(nodeId), ...remoteItems]
						payload.store.commit('setNodeComfyUISettings', {
							nodeId,
							comfyuiSettings: { workflows: merged }
						})
					} else if (wf.error) {
						payload.pushToast(t('nodes.comfyui.listWorkflowsFailed', { error: wf.error }), 'warn')
						// 失败兜底：仅当 workflows 原本为空时才用本地模板填充，
						// 已有 userdata/history 列表时保留不动，避免把远程工作流清空
						applyLocalWorkflowsFallbackIfEmpty(nodeId)
					}
				} catch (err: unknown) {
					if (!current()) return
					payload.pushToast(
						t('nodes.comfyui.listWorkflowsFailed', { error: getErrorMessage(err) }),
						'warn'
					)
					applyLocalWorkflowsFallbackIfEmpty(nodeId)
				}
			} else {
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						status: 'error',
						message: res.error || t('nodes.comfyui.getConnectionFailed'),
						lastCheckedAt: Date.now()
					}
				})
			}
		} catch (err: unknown) {
			if (!current()) return
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					status: 'error',
					message: getErrorMessage(err),
					lastCheckedAt: Date.now()
				}
			})
		}
	}

	const resolveHistoryForWorkflow = async (
		nodeId: string,
		baseUrl: string,
		workflowPath: string,
		workflowSource: ComfyWorkflowSource
	) => {
		const epoch = (requestEpoch.get(nodeId) || 0) + 1
		requestEpoch.set(nodeId, epoch)
		const session = payload.getSessionKey?.()
		const gen = generation
		const current = () => {
			const node = payload.store.state.nodesById[nodeId] as
				| { comfyuiSettings?: { baseUrl?: string; workflowPath?: string } }
				| undefined
			return (
				generation === gen &&
				requestEpoch.get(nodeId) === epoch &&
				session === payload.getSessionKey?.() &&
				node?.comfyuiSettings?.baseUrl?.trim() === baseUrl &&
				node?.comfyuiSettings?.workflowPath === workflowPath
			)
		}
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { historyChecked: false, historyError: undefined }
		})
		try {
			const res = await payload.comfyService.resolveHistory(baseUrl, workflowPath)
			if (!current()) return false
			if (!res.ok) {
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						historyChecked: true,
						hasHistory: false,
						historyError: res.error,
						historyGuideMessage: res.message || res.error,
						historyGuideBaseUrl: baseUrl
					}
				})
				return false
			}
			const outputs = (res.outputs || []).map((out) => ({
				id: 'out-' + out.nodeId,
				label: out.displayName || out.mediaKind,
				mediaType: out.mediaKind
			}))
			payload.store.commit('setNodeComfyUIWorkflowIO', {
				nodeId,
				workflowPath,
				outputs: outputs.length ? outputs : [{ id: 'out', label: 'Output', mediaType: 'generic' }],
				warnings: [],
				inputRequirements: {
					images: res.imageInputs.length,
					videos: res.videoInputs.length,
					models: 0,
					requiresPrompts: false
				}
			})
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					workflowPath,
					workflowSource,
					historyChecked: true,
					hasHistory: res.hasHistory,
					templateResolution: res.resolution,
					historyPromptId: res.promptId,
					historyTimestamp: res.timestamp,
					historyMatchType: res.matchType,
					imageInputCount: res.imageInputs.length,
					videoInputCount: res.videoInputs.length,
					hasTextPromptInput: res.hasTextPrompt,
					textNodeCount: res.textNodeCount,
					positiveTextCount: res.positiveTextCount,
					negativeTextCount: res.negativeTextCount,
					historyNodeCount: res.nodeCount,
					historyInputMappings: {
						imageInputs: res.imageInputs,
						videoInputs: res.videoInputs,
						textNodes: res.textNodes,
						seedNodes: res.seedNodes
					},
					historyOutputNodes: res.outputs || [],
					hasImageOutput: res.hasImageOutput,
					hasVideoOutput: res.hasVideoOutput,
					hasModel3dOutput: res.hasModel3dOutput,
					historyError: undefined,
					historyGuideMessage: undefined,
					historyGuideBaseUrl: undefined
				}
			})
			return true
		} catch (err) {
			if (!current()) return false
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					historyChecked: true,
					historyError: getErrorMessage(err),
					historyGuideMessage: getErrorMessage(err)
				}
			})
			return false
		}
	}

	const onComfyUISelectWorkflow = async (nodeId: string, input: { workflowPath: string }) => {
		const workflowPath = String(input?.workflowPath ?? '').trim()
		if (!workflowPath) return
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as { type?: string; comfyuiSettings?: { baseUrl?: string } } | undefined
		const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
		if (!node || node.type !== 'comfyui' || !baseUrl) return

		// local:// 本地模板 / history:// 历史记录 / 其它为 userdata
		const workflowSource: ComfyWorkflowSource = workflowPath.startsWith('local://')
			? 'local'
			: workflowPath.startsWith('history://')
				? 'history'
				: 'userdata'

		// F8-C1：在异步 resolveHistory 之前，立刻把 workflowPath/workflowSource 写入 store，
		// 并重置历史相关状态 & 运行时状态。避免 IPC 耗时期间用户点击运行时，store 中仍残留
		// 旧 workflow 的 workflowPath + hasHistory + runStatus='running'，造成按钮错误禁用。
		// （resolveHistoryForWorkflow 内部也会再次重置历史字段；但 runStatus 等运行时字段必须这里重置。）
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
				workflowPath,
				workflowSource,
				templateResolution: undefined,
				inputBindings: undefined,
				// 运行时状态：切换工作流必须重置，防止上一工作流的 running / canceling 残留
				// 导致 runDisabled 仍为 true（修改后按钮禁用只剩 status!='connected'/无workflow/运行中 三条件）
				runStatus: 'idle',
				progress: 0,
				promptId: undefined,
				outputs: [],
				statusText: '正在解析工作流历史记录...',
				lastUpdateAt: Date.now(),
				// 历史记录相关状态：清空所有旧值
				historyChecked: false,
				hasHistory: undefined,
				historyError: undefined,
				historyGuideMessage: undefined,
				historyGuideBaseUrl: undefined,
				historyPromptId: undefined,
				historyTimestamp: undefined,
				historyMatchType: undefined,
				imageInputCount: undefined,
				videoInputCount: undefined,
				hasTextPromptInput: undefined,
				textNodeCount: undefined,
				positiveTextCount: undefined,
				negativeTextCount: undefined,
				historyNodeCount: undefined,
				historyInputMappings: undefined,
				historyOutputNodes: undefined,
				hasImageOutput: undefined,
				hasVideoOutput: undefined,
				hasModel3dOutput: undefined
			}
		})

		const selected = await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)

		if (selected && payload.onWorkflowChanged) {
			try {
				payload.onWorkflowChanged(nodeId, workflowPath)
			} catch {}
		}
	}

	const onRefreshHistoryCheck = async (nodeId: string) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as
			| {
					type?: string
					comfyuiSettings?: {
						baseUrl?: string
						workflowPath?: string
						workflowSource?: ComfyWorkflowSource
					}
			  }
			| undefined
		const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
		const workflowPath = String(node?.comfyuiSettings?.workflowPath ?? '').trim()
		if (!node || node.type !== 'comfyui' || !baseUrl) return

		const workflowSource: ComfyWorkflowSource = workflowPath.startsWith('local://')
			? 'local'
			: workflowPath.startsWith('history://')
				? 'history'
				: 'userdata'
		const session = payload.getSessionKey?.()
		const gen = generation
		const list = await payload.comfyService.listWorkflows(baseUrl)
		const latest = payload.store.state.nodesById[nodeId] as typeof node
		if (
			generation !== gen ||
			session !== payload.getSessionKey?.() ||
			latest?.comfyuiSettings?.baseUrl !== baseUrl ||
			String(latest?.comfyuiSettings?.workflowPath || '') !== workflowPath
		)
			return
		if (list.ok) {
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: { workflows: list.workflows || [] }
			})
			const warnings = list.warnings
			if (Array.isArray(warnings) && warnings.length) payload.pushToast(warnings.join('；'), 'warn')
		}
		if (!workflowPath) return
		const ok = await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)
		if (ok) {
			payload.pushToast(t('nodes.comfyui.historyFound'), 'info')
		}
	}

	const onClearHistoryCache = async (nodeId: string) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as
			| { type?: string; comfyuiSettings?: { baseUrl?: string; workflowPath?: string } }
			| undefined
		if (!node || node.type !== 'comfyui') return
		const baseUrl = String(node.comfyuiSettings?.baseUrl ?? '').trim()
		const workflowPath = String(node.comfyuiSettings?.workflowPath ?? '').trim()
		if (!baseUrl || !workflowPath) return
		const gen = generation,
			session = payload.getSessionKey?.()

		try {
			const result = await payload.comfyService.clearHistoryCache(baseUrl, workflowPath)
			const latest = payload.store.state.nodesById[nodeId] as typeof node
			if (
				gen !== generation ||
				session !== payload.getSessionKey?.() ||
				latest?.comfyuiSettings?.baseUrl !== baseUrl ||
				latest?.comfyuiSettings?.workflowPath !== workflowPath
			)
				return
			if (result.ok) {
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						historyChecked: false,
						templateResolution: undefined,
						historyError: undefined
					}
				})
				const workflowSource: ComfyWorkflowSource = workflowPath.startsWith('local://')
					? 'local'
					: workflowPath.startsWith('history://')
						? 'history'
						: 'userdata'
				await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)
				payload.pushToast(t('nodes.comfyui.historyCacheCleared'), 'info')
			} else {
				payload.pushToast(result.error || t('nodes.comfyui.historyCacheClearFailed'), 'warn')
			}
		} catch (err) {
			payload.pushToast(t('nodes.comfyui.historyCacheClearFailed'), 'warn')
		}
	}

	// 重新加载本地模板并刷新下拉框：供本地模板管理面板在 CRUD 后调用
	const reloadLocalWorkflows = async (nodeId: string) => {
		const previous =
			(
				payload.store.state.nodesById[nodeId] as {
					comfyuiSettings?: { workflows?: ComfyWorkflowListItemLite[] }
				}
			)?.comfyuiSettings?.workflows || []
		await preloadLocalWorkflows(nodeId)
		// 用刷新前的列表保留远程项，与 preload 写入的本地缓存合并后重新提交
		const remoteItems = previous.filter((w) => w.source !== 'local')
		const localItems = readCachedLocalWorkflowItems(nodeId)
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { workflows: [...localItems, ...remoteItems] }
		})
	}

	const ensureComfyTemplate = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId] as
			| {
					comfyuiSettings?: {
						baseUrl?: string
						workflowPath?: string
						templateResolution?: unknown
						historyError?: string
					}
			  }
			| undefined
		const settings = node?.comfyuiSettings
		if (!settings?.baseUrl || !settings.workflowPath) return false
		if (settings.templateResolution && !settings.historyError) return true
		const path = settings.workflowPath
		return resolveHistoryForWorkflow(
			nodeId,
			settings.baseUrl.trim(),
			path,
			path.startsWith('local://') ? 'local' : path.startsWith('history://') ? 'history' : 'userdata'
		)
	}
	return {
		ensureComfyTemplate,
		disposeComfyConnection,
		onComfyUISettingsUpdate,
		onComfyUIConnect,
		onComfyUISelectWorkflow,
		onRefreshHistoryCheck,
		onClearHistoryCache,
		reloadLocalWorkflows
	}
}
