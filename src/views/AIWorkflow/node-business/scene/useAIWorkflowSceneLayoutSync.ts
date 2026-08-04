/**
 * 共享工具：将Store中场景布局节点的最新数据（含sceneLayoutSettings和动态inputs）
 * 同步回图形引擎的 BlueprintNode.data，确保：
 * 1. BlueprintScene.serialize() 保存时能取到正确的 layoutItems
 * 2. Ctrl+S 后 hydrateDraft 不会用旧值覆盖新布局
 */
export interface SceneLayoutNodeStoreLike {
	state: {
		nodesById: Record<string, any>
	}
}

export interface SceneLayoutEngineApiLike {
	updateNodeData?: (
		nodeId: string,
		patch: Record<string, any>,
		opts?: { silent?: boolean }
	) => boolean
	forceSyncToStore?: () => Promise<boolean>
}

/**
 * 同步场景布局节点：Store → Engine
 * 等待Vuex响应式更新完成后，将完整节点数据推送到引擎，再forceSyncToStore确保双向一致
 */
export function makeSyncSceneLayoutNodeToEngine(params: {
	store: SceneLayoutNodeStoreLike
	patchBlueprintNodeData?: (nodeId: string) => void
	engineApi?: SceneLayoutEngineApiLike
	hasEngine?: boolean
}) {
	return async function syncSceneLayoutNodeToEngine(nodeId: string): Promise<void> {
		if (!nodeId) return
		// 等待Vuex mutation响应式更新完成
		await new Promise((resolve) => setTimeout(resolve, 30))
		const node = params.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return
		const layoutItemsLen = Array.isArray(node.sceneLayoutSettings?.layoutItems)
			? node.sceneLayoutSettings.layoutItems.filter((i: any) => String(i?.id ?? '').trim()).length
			: 0
		console.info('[SCENE-LAYOUT-SYNC] syncSceneLayoutNodeToEngine:', {
			nodeId,
			layoutItemsLen,
			inputsCount: Array.isArray(node.inputs) ? node.inputs.length : 0
		})
		// 优先使用 patchBlueprintNodeData（它会取Store中完整节点数据调用updateNodeData）
		if (params.patchBlueprintNodeData) {
			params.patchBlueprintNodeData(nodeId)
		} else if (params.engineApi?.updateNodeData) {
			const patch: Record<string, any> = { ...node }
			if (patch.resourceId === null) delete patch.resourceId
			params.engineApi.updateNodeData(nodeId, patch, { silent: true })
		}
		// 再 forceSyncToStore 一次，让引擎处理更新后回写到Store
		if (params.hasEngine && params.engineApi?.forceSyncToStore) {
			try {
				await params.engineApi.forceSyncToStore()
			} catch {
				/* ignore */
			}
		}
	}
}
