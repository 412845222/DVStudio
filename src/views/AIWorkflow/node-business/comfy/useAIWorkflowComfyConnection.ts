import { extractCheckpointsFromObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { ComfyObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'
import type { ResolveHistoryResponse } from '../../../../network/ComfyUIBridgeService'

export const useAIWorkflowComfyConnection = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	comfyService: {
		ping: (baseUrl: string) => Promise<{ ok: boolean; error?: string; systemInfo?: unknown; comfyui?: { version?: string; os?: string; deviceName?: string; devices?: Array<{ name?: string; type?: string }> }; nodeCount?: number; [key: string]: unknown }>
		listWorkflows: (baseUrl: string) => Promise<{
			ok: boolean
			error?: string
			workflows?: { path: string; name: string; source?: 'userdata' | 'history' }[]
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
		clearHistoryCache: (baseUrl: string, workflowPath: string) => Promise<{ ok: boolean; error?: string }>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	onWorkflowChanged?: (nodeId: string, workflowPath: string) => void
}) => {
	const onComfyUISettingsUpdate = (
		nodeId: string,
		input: { baseUrl?: string; positivePrompt?: string; negativePrompt?: string; autoWireEnabled?: boolean }
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
		try {
			const res = await payload.comfyService.ping(baseUrl)
			if (res.ok) {
				const systemInfo = res.systemInfo ? {
					...(res.systemInfo as object),
					nodeCount: typeof res.nodeCount === 'number' ? res.nodeCount : undefined
				} : {
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
						payload.pushToast(t('nodes.comfyui.getObjectInfoFailed', { error: objInfoRes.error }), 'warn')
					}
				} catch (err: unknown) {
					payload.pushToast(t('nodes.comfyui.getObjectInfoFailed', { error: getErrorMessage(err) }), 'warn')
				}

				try {
					const wf = await payload.comfyService.listWorkflows(baseUrl)
					if (wf.ok) {
						payload.store.commit('setNodeComfyUISettings', {
							nodeId,
							comfyuiSettings: { workflows: wf.workflows || [] }
						})
					} else if (wf.error) {
						payload.pushToast(t('nodes.comfyui.listWorkflowsFailed', { error: wf.error }), 'warn')
						payload.store.commit('setNodeComfyUISettings', {
							nodeId,
							comfyuiSettings: { workflows: [] }
						})
					}
				} catch (err: unknown) {
					payload.pushToast(t('nodes.comfyui.listWorkflowsFailed', { error: getErrorMessage(err) }), 'warn')
					payload.store.commit('setNodeComfyUISettings', {
						nodeId,
						comfyuiSettings: { workflows: [] }
					})
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

	const resolveHistoryForWorkflow = async (nodeId: string, baseUrl: string, workflowPath: string, workflowSource: 'userdata' | 'history') => {
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
						historyGuideBaseUrl: isNoHistory ? (histRes.baseUrl || baseUrl) : undefined,
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

		const workflowSource: 'userdata' | 'history' = workflowPath.startsWith('history://') ? 'history' : 'userdata'

		await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)

		if (payload.onWorkflowChanged) {
			try { payload.onWorkflowChanged(nodeId, workflowPath) } catch {}
		}
	}

	const onRefreshHistoryCheck = async (nodeId: string) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as { type?: string; comfyuiSettings?: { baseUrl?: string; workflowPath?: string; workflowSource?: 'userdata' | 'history' } } | undefined
		const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
		const workflowPath = String(node?.comfyuiSettings?.workflowPath ?? '').trim()
		if (!node || node.type !== 'comfyui' || !baseUrl || !workflowPath) return

		const workflowSource: 'userdata' | 'history' = workflowPath.startsWith('history://') ? 'history' : 'userdata'
		const ok = await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)
		if (ok) {
			payload.pushToast(t('nodes.comfyui.historyFound'), 'info')
		}
	}

	const onClearHistoryCache = async (nodeId: string) => {
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as { type?: string; comfyuiSettings?: { baseUrl?: string; workflowPath?: string } } | undefined
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
				const workflowSource: 'userdata' | 'history' = workflowPath.startsWith('history://') ? 'history' : 'userdata'
				await resolveHistoryForWorkflow(nodeId, baseUrl, workflowPath, workflowSource)
				payload.pushToast(t('nodes.comfyui.historyCacheCleared'), 'info')
			} else {
				payload.pushToast(result.error || t('nodes.comfyui.historyCacheClearFailed'), 'warn')
			}
		} catch (err) {
			payload.pushToast(t('nodes.comfyui.historyCacheClearFailed'), 'warn')
		}
	}

	return {
		onComfyUISettingsUpdate,
		onComfyUIConnect,
		onComfyUISelectWorkflow,
		onRefreshHistoryCheck,
		onClearHistoryCache
	}
}
