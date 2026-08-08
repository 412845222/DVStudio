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
	onWorkflowChanged?: (nodeId: string, workflowPath: string) => void
}) => {
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
		try {
			const localWf = await payload.comfyService.listLocalWorkflows()
			if (localWf.ok) {
				const items = localWf.items || []
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: { localWorkflows: items }
				})
				// 同步把合并列表（仅本地）写入 workflows，避免下拉框为空
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: { workflows: mapLocalWorkflowsToListItems(items) }
				})
			}
		} catch (err: unknown) {
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
		}
	) => {
		payload.store.commit('setNodeComfyUISettings', { nodeId, comfyuiSettings: input })
	}

	const onComfyUIConnect = async (nodeId: string, input: { baseUrl: string }) => {
		const baseUrl = String(input?.baseUrl ?? '').trim()
		if (!baseUrl) return
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { status: 'connecting', message: '', baseUrl, lastCheckedAt: Date.now() }
		})
		// 预加载本地模板：即便 ComfyUI 服务不可达，下拉框仍能展示本地模板（离线可浏览）
		await preloadLocalWorkflows(nodeId)
		try {
			const res = await payload.comfyService.ping(baseUrl)
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
					payload.pushToast(
						t('nodes.comfyui.getObjectInfoFailed', { error: getErrorMessage(err) }),
						'warn'
					)
				}

				try {
					const wf = await payload.comfyService.listWorkflows(baseUrl)
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
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: {
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
				historyNodeCount: undefined,
				historyInputMappings: undefined,
				historyOutputNodes: undefined,
				hasImageOutput: undefined,
				hasVideoOutput: undefined,
				hasModel3dOutput: undefined
			}
		})

		try {
			const histRes = await payload.comfyService.resolveHistory(baseUrl, workflowPath)
			if (histRes.ok) {
				const resolvedOutputs = Array.isArray(histRes.outputs) ? histRes.outputs : []
				const outputAnchors = [] as Array<{ id: string; label: string; mediaType: string }>

				const mediaTypeLabels: Record<string, string> = {
					image: 'Image',
					video: 'Video',
					model3d: '3D Model'
				}

				for (let i = 0; i < resolvedOutputs.length; i++) {
					const out = resolvedOutputs[i]
					const kind = out.mediaKind
					if (kind !== 'image' && kind !== 'video' && kind !== 'model3d') continue
					outputAnchors.push({
						id: `out-${out.nodeId}`,
						label: out.displayName || `${mediaTypeLabels[kind] || kind} ${i + 1}`,
						mediaType: kind
					})
				}

				if (outputAnchors.length === 0) {
					outputAnchors.push({ id: 'out', label: 'Output', mediaType: 'image' })
				}

				const inputMappings = {
					imageInputs: histRes.imageInputs,
					videoInputs: histRes.videoInputs,
					textNodes: histRes.textNodes,
					seedNodes: histRes.seedNodes
				}

				payload.store.commit('setNodeComfyUIWorkflowIO', {
					nodeId,
					outputs: outputAnchors,
					warnings: [],
					inputRequirements: {
						images: histRes.imageInputs.length,
						videos: histRes.videoInputs.length,
						models: 0,
						requiresPrompts: histRes.hasTextPrompt
					},
					workflowPath
				})

				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						workflowPath,
						workflowSource,
						historyChecked: true,
						hasHistory: true,
						historyPromptId: histRes.promptId,
						historyTimestamp: histRes.timestamp,
						historyMatchType: histRes.matchType,
						imageInputCount: histRes.imageInputs.length,
						videoInputCount: histRes.videoInputs.length,
						hasTextPromptInput: histRes.hasTextPrompt,
						historyNodeCount: histRes.nodeCount,
						historyInputMappings: inputMappings,
						historyOutputNodes: resolvedOutputs,
						hasImageOutput: histRes.hasImageOutput,
						hasVideoOutput: histRes.hasVideoOutput,
						hasModel3dOutput: histRes.hasModel3dOutput,
						historyError: undefined,
						historyGuideMessage: undefined,
						historyGuideBaseUrl: undefined
					}
				})
				return true
			} else {
				const isNoHistory = histRes.error === 'NO_HISTORY'
				payload.store.commit('setNodeComfyUIWorkflowIO', {
					nodeId,
					outputs: [{ id: 'out', label: 'Output', mediaType: 'image' }],
					warnings: isNoHistory ? [] : [histRes.message || histRes.error || 'history check failed'],
					inputRequirements: { images: 0, videos: 0, models: 0, requiresPrompts: false },
					workflowPath
				})

				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						workflowPath,
						workflowSource,
						historyChecked: true,
						hasHistory: false,
						historyError: histRes.error || 'history check failed',
						historyGuideMessage: isNoHistory ? histRes.message : undefined,
						historyGuideBaseUrl: isNoHistory ? histRes.baseUrl || baseUrl : undefined,
						historyPromptId: undefined,
						historyTimestamp: undefined,
						historyMatchType: undefined,
						imageInputCount: 0,
						videoInputCount: 0,
						hasTextPromptInput: false,
						historyNodeCount: 0,
						historyInputMappings: undefined,
						historyOutputNodes: undefined,
						hasImageOutput: undefined,
						hasVideoOutput: undefined,
						hasModel3dOutput: undefined
					}
				})

				if (!isNoHistory && histRes.message) {
					payload.pushToast(histRes.message, 'warn')
				}
				return false
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					historyChecked: true,
					hasHistory: false,
					historyError: errMsg
				}
			})
			payload.pushToast(t('nodes.comfyui.resolveHistoryFailed', { error: errMsg }), 'warn')
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
				historyNodeCount: undefined,
				historyInputMappings: undefined,
				historyOutputNodes: undefined,
				hasImageOutput: undefined,
				hasVideoOutput: undefined,
				hasModel3dOutput: undefined
			}
		})

		await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)

		if (payload.onWorkflowChanged) {
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
		if (!node || node.type !== 'comfyui' || !baseUrl || !workflowPath) return

		const workflowSource: ComfyWorkflowSource = workflowPath.startsWith('local://')
			? 'local'
			: workflowPath.startsWith('history://')
				? 'history'
				: 'userdata'
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

		try {
			const result = await payload.comfyService.clearHistoryCache(baseUrl, workflowPath)
			if (result.ok) {
				payload.store.commit('setNodeComfyUIWorkflowIO', {
					nodeId,
					outputs: [{ id: 'out', label: 'Output', mediaType: 'image' }],
					warnings: [],
					inputRequirements: { images: 0, videos: 0, models: 0, requiresPrompts: false },
					workflowPath
				})
				payload.store.commit('setNodeComfyUISettings', {
					nodeId,
					comfyuiSettings: {
						historyChecked: false,
						hasHistory: undefined,
						historyPromptId: undefined,
						historyInputMappings: undefined,
						historyOutputNodes: undefined,
						historyTimestamp: undefined,
						historyError: undefined,
						imageInputCount: undefined,
						videoInputCount: undefined,
						hasTextPromptInput: undefined,
						historyNodeCount: undefined,
						inputRequirements: undefined,
						hasImageOutput: undefined,
						hasVideoOutput: undefined,
						hasModel3dOutput: undefined,
						workflowWarnings: undefined
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
		await preloadLocalWorkflows(nodeId)
		// 若已存在远程列表，则将本地模板与远程合并后写入
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as
			| { comfyuiSettings?: { workflows?: ComfyWorkflowListItemLite[] } }
			| undefined
		const existing = node?.comfyuiSettings?.workflows || []
		const remoteItems = existing.filter((w) => w.source !== 'local')
		const localItems = readCachedLocalWorkflowItems(nodeId)
		payload.store.commit('setNodeComfyUISettings', {
			nodeId,
			comfyuiSettings: { workflows: [...localItems, ...remoteItems] }
		})
	}

	return {
		onComfyUISettingsUpdate,
		onComfyUIConnect,
		onComfyUISelectWorkflow,
		onRefreshHistoryCheck,
		onClearHistoryCache,
		reloadLocalWorkflows
	}
}
