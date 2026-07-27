import type { Ref } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'

export const useAIWorkflowNodeResourceCleanup = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
		commit: (type: string, value?: unknown) => void
	}
	selectedNodeIds: Ref<string[]>
	revokeNodeModel3DObjectUrl: (nodeId: string) => void
	revokeSceneLayoutManualModelObjectUrl: (nodeId: string, objectId?: string) => void
	removeResourceByPolicy: (
		resourceId: string,
		opts?: { silent?: boolean }
	) => Promise<{ removed: boolean; reason: 'record' | 'django-file' | 'skip' | 'error' }>
	performDelete?: (nodeIds: string[]) => void
}) => {
	const collectResourceIdsFromNodes = (nodeIds: string[]) => {
		const out = new Set<string>()
		for (const nodeId of nodeIds) {
			const node = payload.store.state.nodesById[String(nodeId || '').trim()]
			if (!node) continue
			const rid = String(node.resourceId ?? '').trim()
			if (rid) out.add(rid)
		}
		return out
	}

	const resourceUsed = (resourceId: string) => {
		return Object.values(payload.store.state.nodesById).some(
			(node) => node.resourceId === resourceId
		)
	}

	const removeSelectedNodesWithResourceCleanup = async (explicitNodeIds?: string[]) => {
		const ids = Array.from(
			new Set(
				(explicitNodeIds && explicitNodeIds.length
					? explicitNodeIds
					: payload.selectedNodeIds.value
				)
					.map((id) => String(id || '').trim())
					.filter(Boolean)
			)
		)
		console.log('[KEY-DEBUG] removeSelectedNodesWithResourceCleanup: ids=' + JSON.stringify(ids) + ', hasPerformDelete=' + !!payload.performDelete)
		if (!ids.length) return

		for (const nodeId of ids) {
			payload.revokeNodeModel3DObjectUrl(nodeId)
			payload.revokeSceneLayoutManualModelObjectUrl(nodeId)
		}

		const affectedResourceIds = collectResourceIdsFromNodes(ids)

		if (payload.performDelete) {
			console.log('[KEY-DEBUG] removeSelectedNodesWithResourceCleanup: calling performDelete')
			payload.performDelete(ids)
		} else {
			payload.store.commit('setSelectedNodes', { nodeIds: ids, primaryNodeId: ids[0] ?? null })
			payload.store.commit('removeSelectedNodes', undefined)
		}

		for (const rid of affectedResourceIds) {
			if (resourceUsed(rid)) continue
			await payload.removeResourceByPolicy(rid, { silent: true })
		}
	}

	const cleanupDetachedResourceIfUnused = async (resourceId: string | null | undefined) => {
		const rid = String(resourceId ?? '').trim()
		if (!rid) return
		if (resourceUsed(rid)) return
		await payload.removeResourceByPolicy(rid, { silent: true })
	}

	const setNodeResourceWithCleanup = (input: {
		nodeId: string
		resourceId: string | null
		resourcePath?: string
	}) => {
		const nodeId = String(input.nodeId ?? '').trim()
		if (!nodeId) return
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return

		const prevRid = String(node.resourceId ?? '').trim()
		const nextRid = input.resourceId ? String(input.resourceId).trim() : ''
		payload.store.commit('setNodeResource', { nodeId, resourceId: nextRid || null })

		const nextPath = String(input.resourcePath ?? '').trim()
		if (nextPath) payload.store.commit('setNodeResourcePath', { nodeId, resourcePath: nextPath })

		if (prevRid && prevRid !== nextRid) {
			void cleanupDetachedResourceIfUnused(prevRid)
		}
	}

	return {
		resourceUsed,
		removeSelectedNodesWithResourceCleanup,
		cleanupDetachedResourceIfUnused,
		setNodeResourceWithCleanup
	}
}
