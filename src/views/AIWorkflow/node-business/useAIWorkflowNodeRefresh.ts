import { isRecord, isString } from '../../../types/utils'
import type { WorkflowNode, WorkflowEdge } from '../../../aiworkflow/types'
import type { ComfyLocalizedOutput } from './comfy/comfyOutputResolver'
import { t } from '../../../i18n'

type NodeRefreshStore = {
	state: {
		nodesById: Record<string, WorkflowNode | undefined>
		resourcesById: Record<string, unknown>
	}
	commit: (type: string, value: unknown) => void
}

const getStringField = (obj: unknown, key: string): string => {
	if (isRecord(obj)) {
		const val = obj[key]
		if (isString(val)) return val
	}
	return ''
}

export const useAIWorkflowNodeRefresh = (payload: {
	store: NodeRefreshStore
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	resetSceneUnderstandingNodeState: (nodeId: string) => void
	getIncomingEdges: (nodeId: string) => WorkflowEdge[]
	syncModel3DInputFromUpstream: (nodeId: string, opts?: { warn?: boolean }) => Promise<boolean>
	refreshMeshyTaskToNode: (nodeId: string, taskId: string, mode: string) => Promise<unknown>
	connectedTextInputValue: (nodeId: string, inputId: string) => string | undefined | null
	onNodeRunSceneLayout: (nodeId: string) => Promise<void>
	syncUnrealExportNodes: (opts?: { silent?: boolean; nodeId?: string }) => Promise<void>
	setNodeResourceWithCleanup: (payload: {
		nodeId: string
		resourceId: string | null
		resourcePath?: string
	}) => void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	buildCroppedImageTransferFile: (
		fromNode: WorkflowNode,
		sourceUrl: string,
		sourceName: string
	) => Promise<File | null>
	onNodeUploadResource: (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: { autoDistribute?: boolean }
	) => void
	fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
	forceRefreshCurrentMediaNode: (nodeId: string) => void
	bindMediaResourceToNode: (
		nodeId: string,
		kind: 'image' | 'video',
		url: string,
		name: string,
		opts?: { posterUrl?: string; sourcePath?: string }
	) => void
	comfyOutputForAnchor: (
		outputs: ComfyLocalizedOutput[],
		fromAnchorId: string,
		expectedKind: 'image' | 'video'
	) => ComfyLocalizedOutput | undefined
	connectedImageOutputUrl: (node: WorkflowNode, fromAnchorId: string) => string | null
}) => {
	const onNodeRefresh = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return
		const nodeType = node.type
		if (nodeType === 'video' && String(node.resourceId ?? '').trim()) {
			payload.forceRefreshCurrentMediaNode(nodeId)
			payload.pushToast(t('aiworkflow.runtime.videoNodeRefreshed'), 'info')
			return
		}
		if (nodeType === 'scene-understanding') {
			payload.resetSceneUnderstandingNodeState(nodeId)
			payload.pushToast(t('aiworkflow.runtime.sceneUnderstandingReset'), 'info')
			return
		}
		if (nodeType === 'scene-layout') {
			const incoming = payload.getIncomingEdges(nodeId)
			const upstreamModelNodeIds = new Set<string>()
			for (const edge of incoming) {
				const fromNodeId = String(edge.fromNodeId ?? '').trim()
				const fromNode = payload.store.state.nodesById[fromNodeId]
				if (!fromNode) continue
				const toAnchorId = String(edge.toAnchorId ?? '').trim()
				if (!toAnchorId.startsWith('in-model-')) continue
				upstreamModelNodeIds.add(fromNodeId)
			}

			for (const upstreamNodeId of upstreamModelNodeIds) {
				const upstreamNode = payload.store.state.nodesById[upstreamNodeId]
				if (!upstreamNode) continue
				const upstreamType = upstreamNode.type
				if (upstreamType === 'model3d') {
					await payload.syncModel3DInputFromUpstream(upstreamNodeId, { warn: false })
					continue
				}
				if (upstreamType === 'meshy') {
					const meshySettings = isRecord(upstreamNode.meshySettings)
						? upstreamNode.meshySettings
						: {}
					const meshyRelationSummary = isRecord(meshySettings.meshyRelationSummary)
						? meshySettings.meshyRelationSummary
						: {}
					const taskId = String(
						meshySettings.meshyTaskId ?? meshyRelationSummary.effectiveTaskId ?? ''
					).trim()
					if (!taskId) continue
					const mode = String(meshySettings.meshyTaskFamily ?? 'text-to-3d')
					await payload.refreshMeshyTaskToNode(upstreamNodeId, taskId, mode)
				}
			}

			const linkedJson = String(payload.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
			const sceneLayoutSettings = isRecord(node.sceneLayoutSettings) ? node.sceneLayoutSettings : {}
			const fallbackJson = String(sceneLayoutSettings.inputJson ?? '').trim()
			if (linkedJson || fallbackJson) {
				if (!linkedJson && fallbackJson) {
					payload.store.commit('setNodeSceneLayoutSettings', {
						nodeId,
						sceneLayoutSettings: {
							inputJson: fallbackJson
						}
					})
				}
				await payload.onNodeRunSceneLayout(nodeId)
				payload.pushToast(t('aiworkflow.runtime.sceneLayoutRefreshed'), 'info')
				return
			}

			payload.pushToast(t('aiworkflow.runtime.sceneLayoutRefreshFailed'), 'warn')
			return
		}
		if (nodeType === 'unreal-export') {
			await payload.syncUnrealExportNodes({ silent: false, nodeId })
			payload.pushToast(t('aiworkflow.runtime.unrealConnectionRefreshed'), 'info')
			return
		}
		if (nodeType === 'model3d') {
			const synced = await payload.syncModel3DInputFromUpstream(nodeId, { warn: true })
			if (synced) payload.pushToast(t('aiworkflow.runtime.model3dRefreshed'), 'info')
			return
		}
		if (nodeType !== 'image' && nodeType !== 'video') {
			payload.pushToast(t('aiworkflow.runtime.manualRefreshUnsupported'), 'warn')
			return
		}

		const expectedKind = nodeType === 'image' ? 'image' : 'video'
		const incoming = payload.getIncomingEdges(nodeId)
		if (!incoming.length) {
			payload.pushToast(t('aiworkflow.runtime.noInputConnections'), 'warn')
			return
		}

		const reasons: string[] = []
		for (const e of incoming) {
			const fromNodeId = String(e.fromNodeId ?? '').trim()
			const fromNode = payload.store.state.nodesById[fromNodeId]
			if (!fromNode) continue

			const rid = String(fromNode.resourceId ?? '').trim()
			if (rid) {
				const r = payload.store.state.resourcesById[rid]
				const rKind = getStringField(r, 'kind')
				if (isRecord(r) && rKind === expectedKind) {
					const url = String(r.url ?? '').trim()
					const sourcePath = String(r.sourcePath ?? '').trim()
					const sourceName = String(r.name ?? `${expectedKind}`)
					if (expectedKind === 'image') {
						const fromNodeType = fromNode.type
						if (fromNodeType === 'image' && url) {
							payload.bindMediaResourceToNode(nodeId, 'image', url, sourceName, {
								sourcePath: sourcePath || undefined
							})
							payload.autoSizeMediaNode(nodeId, url, 'image')
							payload.pushToast(t('aiworkflow.runtime.imageResourceReferenced'), 'info')
							return
						}

						if (url) {
							try {
								const cloned = await payload.fileFromUrl(
									url,
									sourceName.replace(/\.[^.]+$/, '') || 'image'
								)
								payload.onNodeUploadResource(nodeId, cloned, 'image', { autoDistribute: false })
								payload.pushToast(t('aiworkflow.runtime.imageResourceRefreshed'), 'info')
								return
							} catch {
								// fallback below
							}
						}

						if (url) {
							payload.bindMediaResourceToNode(nodeId, 'image', url, sourceName, {
								sourcePath: sourcePath || undefined
							})
							payload.autoSizeMediaNode(nodeId, url, 'image')
							payload.pushToast(t('aiworkflow.runtime.imageResourceReferenced'), 'info')
							return
						}
					}

					payload.setNodeResourceWithCleanup({
						nodeId,
						resourceId: rid,
						resourcePath: sourcePath || undefined
					})
					if (url) payload.autoSizeMediaNode(nodeId, url, expectedKind)
					const kindLabel = expectedKind === 'image' ? t('aiworkflow.runtime.imageResource') : t('aiworkflow.runtime.videoResource')
					payload.pushToast(
						t('aiworkflow.runtime.mediaResourceRefreshed', { kind: kindLabel }),
						'info'
					)
					return
				}
				if (isRecord(r) && rKind !== expectedKind) {
					reasons.push(t('aiworkflow.runtime.upstreamTypeMismatch', { sourceKind: rKind, targetKind: expectedKind }))
				}
			}

			const fromNodeType = fromNode.type
			if (fromNodeType === 'comfyui') {
				const comfySettings = isRecord(fromNode.comfyuiSettings) ? fromNode.comfyuiSettings : {}
				const outputs: ComfyLocalizedOutput[] = Array.isArray(comfySettings.outputs)
					? (comfySettings.outputs as ComfyLocalizedOutput[])
					: []
				const fromAnchorId = String(e.fromAnchorId ?? '')
				const media = payload.comfyOutputForAnchor(outputs, fromAnchorId, expectedKind)

				if (media && String(media.url || '').trim()) {
					payload.bindMediaResourceToNode(
						nodeId,
						expectedKind,
						String(media.url),
						String(media.filename || `comfy_${expectedKind}_${Date.now()}`),
						{
							sourcePath: String(media.sourcePath || '').trim() || undefined
						}
					)
					const anchorLabel = String(e.fromAnchorId || t('aiworkflow.runtime.outputAnchor'))
					const mediaKindLabel = expectedKind === 'image' ? t('aiworkflow.runtime.imageResource') : t('aiworkflow.runtime.videoResource')
					payload.pushToast(
						t('aiworkflow.runtime.comfyMediaRefreshed', { anchor: anchorLabel, kind: mediaKindLabel }),
						'info'
					)
					return
				}
				const noOutputKindLabel = expectedKind === 'image' ? t('aiworkflow.runtime.imageResource') : t('aiworkflow.runtime.videoResource')
				reasons.push(t('aiworkflow.runtime.comfyNoOutput', { kind: noOutputKindLabel }))
			}

			if (expectedKind === 'image' && fromNodeType === 'scene-decompose') {
				const fromAnchorId = String(e.fromAnchorId ?? '')
				const outputUrl = String(
					payload.connectedImageOutputUrl(fromNode, fromAnchorId) ?? ''
				).trim()
				if (!outputUrl) {
					reasons.push(t('aiworkflow.runtime.sceneDecomposeNoImage'))
					continue
				}
				try {
					const fromNodeAlias =
						String(fromNode.alias ?? fromNode.title ?? 'decompose').replace(/\s+/g, '_') ||
						'decompose'
					const cloned = await payload.fileFromUrl(outputUrl, fromNodeAlias)
					payload.onNodeUploadResource(nodeId, cloned, 'image', { autoDistribute: false })
					payload.pushToast(t('aiworkflow.runtime.sceneDecomposeImageRefreshed'), 'info')
					return
				} catch {
					reasons.push(t('aiworkflow.runtime.sceneDecomposeCloneFailed'))
					continue
				}
			}
		}

		payload.pushToast(
			reasons.length ? t('aiworkflow.runtime.refreshFailed', { reason: reasons[0] }) : t('aiworkflow.runtime.refreshFailedNoMatch'),
			'warn'
		)
	}

	return {
		onNodeRefresh
	}
}
