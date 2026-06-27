import { getErrorMessage } from '../../../../types/utils'
export const useAIWorkflowSceneLayoutController = (options: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	extractSceneLayoutSourceItems: (parsed: unknown) => unknown[]
	parseSceneLayoutMetadataItems: (inputJson: string) => unknown[]
	mergeSceneLayoutItemsWithMetadata: (layoutItems: unknown[], metadataSources: unknown[][]) => unknown[]
	runSceneLayout: (payload: { nodeId: string; inputJson: string }) => Promise<Record<string, unknown>>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<void>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const onNodeRunSceneLayout = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return
		const linkedJson = String(options.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
		const nodeSettings = (node.sceneLayoutSettings ?? null) as Record<string, unknown> | null
		const cachedJson = String(nodeSettings?.inputJson ?? '').trim()
		const inputJson = linkedJson || cachedJson
		if (!inputJson) {
			options.pushToast('场景布局节点缺少 JSON 文本输入。', 'warn')
			return
		}

		options.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: { status: 'running', message: '正在生成场景布局…', inputJson }
		})

		try {
			let parsedInput: unknown = null
			try {
				parsedInput = JSON.parse(inputJson)
			} catch {
				parsedInput = null
			}

			const parsedObj = parsedInput as Record<string, unknown>
			const directInputItems = options.extractSceneLayoutSourceItems(parsedInput)
			const directHasLayout = Array.isArray(parsedObj?.layoutItems) && directInputItems.length > 0
			const directHasCamera = parsedObj?.camera && typeof parsedObj.camera === 'object'
			if (directHasLayout) {
				const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(directInputItems, [
					directInputItems
				])
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId,
					sceneLayoutSettings: {
						status: 'completed',
						message: `已从输入 JSON 直接载入 ${mergedLayoutItems.length} 个布局对象。`,
						inputJson,
						layoutItems: mergedLayoutItems,
						camera: directHasCamera ? parsedObj.camera : nodeSettings?.camera,
						lastRunAt: Date.now()
					}
				})
				options.pushToast('场景布局已从输入 JSON 载入。', 'info')
				return
			}

			const res = await options.runSceneLayout({ nodeId, inputJson })
			if (!res.ok) {
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId,
					sceneLayoutSettings: { status: 'error', message: String(res.error || '场景布局失败'), inputJson }
				})
				options.pushToast(`场景布局失败：${res.error || 'unknown'}`, 'warn')
				return
			}
			const inputMetadataItems = options.parseSceneLayoutMetadataItems(inputJson)
			const resLayoutItems = Array.isArray(res.layoutItems) ? (res.layoutItems as unknown[]) : []
			const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(resLayoutItems, [
				inputMetadataItems
			])
			options.store.commit('setNodeSceneLayoutSettings', {
				nodeId,
				sceneLayoutSettings: {
					status: 'completed',
					message: String(res.message || `已生成 ${mergedLayoutItems.length} 个占位物体。`),
					inputJson,
					layoutItems: mergedLayoutItems,
					camera: res.camera,
					lastRunAt: Date.now()
				}
			})
			options.pushToast('场景布局已更新。', 'info')
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			options.store.commit('setNodeSceneLayoutSettings', {
				nodeId,
				sceneLayoutSettings: { status: 'error', message, inputJson }
			})
			options.pushToast(`场景布局失败：${message}`, 'warn')
		}
	}

	const onNodeSceneLayoutItemsUpdate = (nodeId: string, layoutItems: unknown[]) => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return
		if (!Array.isArray(layoutItems)) return
		const layoutSettings = (node.sceneLayoutSettings ?? null) as Record<string, unknown> | null
		const inputMetadataItems = options.parseSceneLayoutMetadataItems(
			String(layoutSettings?.inputJson ?? '')
		)
		options.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				layoutItems: options.mergeSceneLayoutItemsWithMetadata(layoutItems, [inputMetadataItems])
			}
		})
		void options.syncConnectedModel3DTargets(nodeId)
	}

	const onNodeSceneLayoutSelectedPlaceholderOutput = async (nodeId: string, itemId: string) => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return
		const outputId = String(itemId ?? '').trim()
		if (!outputId) return
		options.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				selectedPlaceholderOutput: outputId,
				selectedLayoutItemId: outputId
			}
		})
		await options.syncConnectedModel3DTargets(nodeId)
	}

	return {
		onNodeRunSceneLayout,
		onNodeSceneLayoutItemsUpdate,
		onNodeSceneLayoutSelectedPlaceholderOutput
	}
}
