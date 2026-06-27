import type { WorkflowNode } from '../../../../aiworkflow/types'

export const useAIWorkflowSceneLayoutSettings = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
		commit: (type: string, value: unknown) => void
	}
}) => {
	const onNodeSceneLayoutLightingPreviewUpdate = (nodeId: string, enabled: boolean) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				lightingPreviewEnabled: enabled === true
			}
		})
	}

	const onNodeSceneLayoutLightingDebugUpdate = (nodeId: string, enabled: boolean) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				lightingDebugEnabled: enabled === true
			}
		})
	}

	const onNodeSceneLayoutLightingControlsUpdate = (
		nodeId: string,
		lightingControls: Record<string, number>
	) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		if (!lightingControls || typeof lightingControls !== 'object') return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				lightingControls
			}
		})
	}

	const onNodeSceneLayoutPreviewModeUpdate = (nodeId: string, previewMode: boolean) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				previewMode: previewMode === true
			}
		})
	}

	const onNodeSceneLayoutSelectedItemUpdate = (nodeId: string, itemId: string) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		const nextSelectedLayoutItemId = String(itemId ?? '').trim()
		const currentSelectedLayoutItemId = String(
			node.sceneLayoutSettings?.selectedLayoutItemId ?? ''
		).trim()
		if (nextSelectedLayoutItemId === currentSelectedLayoutItemId) return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				selectedLayoutItemId: nextSelectedLayoutItemId
			}
		})
	}

	const onNodeSceneLayoutHidePlaceholdersUpdate = (nodeId: string, hidden: boolean) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				hidePlaceholderCubes: hidden === true,
				...(hidden ? { selectedLayoutItemId: '' } : {})
			}
		})
	}

	return {
		onNodeSceneLayoutLightingPreviewUpdate,
		onNodeSceneLayoutLightingDebugUpdate,
		onNodeSceneLayoutLightingControlsUpdate,
		onNodeSceneLayoutPreviewModeUpdate,
		onNodeSceneLayoutSelectedItemUpdate,
		onNodeSceneLayoutHidePlaceholdersUpdate
	}
}
