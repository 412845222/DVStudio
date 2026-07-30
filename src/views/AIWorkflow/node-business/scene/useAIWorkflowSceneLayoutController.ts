import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
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
	mergeSceneLayoutItemsWithMetadata: (
		layoutItems: unknown[],
		metadataSources: unknown[][]
	) => unknown[]
	runSceneLayout: (payload: {
		nodeId: string
		inputJson: string
	}) => Promise<Record<string, unknown>>
	syncConnectedModel3DTargets: (
		nodeId: string,
		opts?: { forceSceneLayoutExport?: boolean }
	) => Promise<void>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const onNodeRunSceneLayout = async (nodeId: string) => {
		console.info('【SCENE-LAYOUT-CHAIN】③ Controller.onNodeRunSceneLayout START, nodeId:', nodeId)
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		console.info('【SCENE-LAYOUT-CHAIN】③ node found?', !!node, 'node.type:', node?.type)
		if (!node || node.type !== 'scene-layout') {
			console.warn('【SCENE-LAYOUT-CHAIN】③ EARLY RETURN: node not found or type mismatch')
			return
		}
		const linkedJson = String(options.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
		const nodeSettings = (node.sceneLayoutSettings ?? null) as Record<string, unknown> | null
		const cachedJson = String(nodeSettings?.inputJson ?? '').trim()
		const inputJson = linkedJson || cachedJson
		console.info(
			'【SCENE-LAYOUT-CHAIN】③ JSON sources - linkedJson len:',
			linkedJson.length,
			'cachedJson len:',
			cachedJson.length,
			'inputJson len:',
			inputJson.length
		)
		if (!inputJson) {
			console.warn('【SCENE-LAYOUT-CHAIN】③ EARLY RETURN: no inputJson')
			options.pushToast(t('aiworkflow.runtime.layoutMissingJson'), 'warn')
			return
		}

		console.info('【SCENE-LAYOUT-CHAIN】③ Committing RUNNING status...')
		options.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				status: 'running',
				message: t('aiworkflow.runtime.layoutGenerating'),
				inputJson
			}
		})

		try {
			let parsedInput: unknown = null
			try {
				parsedInput = JSON.parse(inputJson)
				console.info(
					'【SCENE-LAYOUT-CHAIN】③ JSON.parse SUCCESS, parsed keys:',
					parsedInput && typeof parsedInput === 'object'
						? Object.keys(parsedInput as Record<string, unknown>)
						: '(non-object)'
				)
			} catch (parseErr) {
				console.error('【SCENE-LAYOUT-CHAIN】③ JSON.parse FAILED:', parseErr)
				parsedInput = null
			}

			const parsedObj = parsedInput as Record<string, unknown>
			const directInputItems = options.extractSceneLayoutSourceItems(parsedInput)
			const directHasLayout = Array.isArray(parsedObj?.layoutItems) && directInputItems.length > 0
			const directHasCamera = parsedObj?.camera && typeof parsedObj.camera === 'object'
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ extractSceneLayoutSourceItems result - directInputItems.length:',
				directInputItems.length,
				'parsedObj.layoutItems is array?',
				Array.isArray(parsedObj?.layoutItems),
				'directHasLayout:',
				directHasLayout,
				'directHasCamera:',
				directHasCamera
			)
			if (directHasLayout) {
				console.info('【SCENE-LAYOUT-CHAIN】③ Branch: DIRECT LAYOUT (no API call), merging...')
				const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(directInputItems, [
					directInputItems
				])
				console.info('【SCENE-LAYOUT-CHAIN】③ mergedLayoutItems.length:', mergedLayoutItems.length)
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId,
					sceneLayoutSettings: {
						status: 'completed',
						message: t('aiworkflow.runtime.layoutLoadedDirect', {
							count: String(mergedLayoutItems.length)
						}),
						inputJson,
						layoutItems: mergedLayoutItems,
						camera: directHasCamera ? parsedObj.camera : nodeSettings?.camera,
						lastRunAt: Date.now()
					}
				})
				console.info(
					'【SCENE-LAYOUT-CHAIN】③ Committed COMPLETED (direct), layoutItems count:',
					mergedLayoutItems.length
				)
				options.pushToast(t('aiworkflow.runtime.layoutLoadedDirectToast'), 'info')
				return
			}

			console.info('【SCENE-LAYOUT-CHAIN】③ Branch: API CALL - calling runSceneLayout...')
			const res = await options.runSceneLayout({ nodeId, inputJson })
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ runSceneLayout response - ok:',
				res.ok,
				'keys:',
				Object.keys(res)
			)
			if (!res.ok) {
				console.error('【SCENE-LAYOUT-CHAIN】③ runSceneLayout FAILED:', res.error)
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId,
					sceneLayoutSettings: {
						status: 'error',
						message: String(res.error || t('aiworkflow.runtime.layoutFailed')),
						inputJson
					}
				})
				options.pushToast(
					t('aiworkflow.toast.sceneLayoutFailed', { error: String(res.error || 'unknown') }),
					'warn'
				)
				return
			}
			const inputMetadataItems = options.parseSceneLayoutMetadataItems(inputJson)
			const resLayoutItems = Array.isArray(res.layoutItems) ? (res.layoutItems as unknown[]) : []
			const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(resLayoutItems, [
				inputMetadataItems
			])
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ API success - resLayoutItems.length:',
				resLayoutItems.length,
				'mergedLayoutItems.length:',
				mergedLayoutItems.length
			)
			options.store.commit('setNodeSceneLayoutSettings', {
				nodeId,
				sceneLayoutSettings: {
					status: 'completed',
					message: String(
						res.message ||
							t('aiworkflow.runtime.layoutGeneratedCount', {
								count: String(mergedLayoutItems.length)
							})
					),
					inputJson,
					layoutItems: mergedLayoutItems,
					camera: res.camera,
					lastRunAt: Date.now()
				}
			})
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ Committed COMPLETED (API), layoutItems count:',
				mergedLayoutItems.length
			)
			options.pushToast(t('aiworkflow.runtime.layoutUpdated'), 'info')
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			console.error('【SCENE-LAYOUT-CHAIN】③ CAUGHT ERROR:', message, err)
			options.store.commit('setNodeSceneLayoutSettings', {
				nodeId,
				sceneLayoutSettings: { status: 'error', message, inputJson }
			})
			options.pushToast(t('aiworkflow.toast.sceneLayoutFailed', { error: message }), 'warn')
		}
		console.info('【SCENE-LAYOUT-CHAIN】③ Controller.onNodeRunSceneLayout END')
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
		await options.syncConnectedModel3DTargets(nodeId, { forceSceneLayoutExport: true })
	}

	return {
		onNodeRunSceneLayout,
		onNodeSceneLayoutItemsUpdate,
		onNodeSceneLayoutSelectedPlaceholderOutput
	}
}
