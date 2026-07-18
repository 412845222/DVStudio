import { parseComfyWorkflowIO } from '../../../../aiworkflow/domain/comfyui/parseWorkflowIO'
import { extractCheckpointsFromObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { ComfyObjectInfo } from '../../../../aiworkflow/domain/comfyui/objectInfoTypes'

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
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const onComfyUISettingsUpdate = (
		nodeId: string,
		input: { baseUrl?: string; positivePrompt?: string; negativePrompt?: string }
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

	const onComfyUISelectWorkflow = async (nodeId: string, input: { workflowPath: string }) => {
		const workflowPath = String(input?.workflowPath ?? '').trim()
		if (!workflowPath) return
		const nodeRecord = payload.store.state.nodesById[nodeId]
		const node = nodeRecord as { type?: string; comfyuiSettings?: { baseUrl?: string; objectInfo?: ComfyObjectInfo; workflowSource?: 'userdata' | 'history' } } | undefined
		const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
		if (!node || node.type !== 'comfyui' || !baseUrl) return

		const workflowSource: 'userdata' | 'history' = workflowPath.startsWith('history://') ? 'history' : 'userdata'

		try {
			const res = await payload.comfyService.getWorkflow(baseUrl, workflowPath)
			if (!res.ok) {
				payload.pushToast(t('nodes.comfyui.getWorkflowFailed', { error: res.error || 'unknown' }), 'error')
				return
			}
			const objectInfo = node?.comfyuiSettings?.objectInfo || null
			const { inputs, outputs, warnings } = parseComfyWorkflowIO(
				res.workflow as Record<string, unknown>,
				objectInfo
			)
			for (const warning of warnings) payload.pushToast(warning, 'warn')
			payload.store.commit('setNodeComfyUIWorkflowIO', {
				nodeId,
				inputs,
				outputs,
				workflowPath: res.workflowPath || workflowPath
			})
			payload.store.commit('setNodeComfyUISettings', {
				nodeId,
				comfyuiSettings: {
					workflowPath: res.workflowPath || workflowPath,
					workflowSource
				}
			})
		} catch (err: unknown) {
			payload.pushToast(t('nodes.comfyui.getWorkflowFailed', { error: getErrorMessage(err) }), 'error')
		}
	}

	return {
		onComfyUISettingsUpdate,
		onComfyUIConnect,
		onComfyUISelectWorkflow
	}
}
