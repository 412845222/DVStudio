import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import {
	makeSyncSceneLayoutNodeToEngine,
	type SceneLayoutEngineApiLike
} from './useAIWorkflowSceneLayoutSync'

// 判断单个item是否携带合法的3D position/size字段（都存在且是有限数）
const hasValid3DFields = (item: unknown): boolean => {
	if (!item || typeof item !== 'object') return false
	const obj = item as Record<string, unknown>
	const pos = obj.position
	const size = obj.size
	if (!pos || typeof pos !== 'object' || !size || typeof size !== 'object') return false
	const p = pos as Record<string, unknown>
	const s = size as Record<string, unknown>
	const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
	return (
		isNum(p.x) &&
		isNum(p.y) &&
		isNum(p.z) &&
		isNum(s.width) &&
		isNum(s.height) &&
		isNum(s.depth) &&
		s.width > 0 &&
		s.height > 0 &&
		s.depth > 0
	)
}

// 归一化layoutItems：对缺少position/size的item填充合理默认值，确保viewer可渲染占位立方体
const normalizeLayoutItemsForPreview = (items: unknown[]): unknown[] => {
	return (Array.isArray(items) ? items : []).map((item, index) => {
		if (!item || typeof item !== 'object') return item
		const obj = { ...(item as Record<string, unknown>) }
		const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
		// 确保有id
		if (!String(obj.id ?? '').trim()) {
			obj.id = `object-${index}`
		}
		// position兜底
		const posRaw = obj.position
		const pos = posRaw && typeof posRaw === 'object' ? (posRaw as Record<string, unknown>) : null
		const px = pos && isNum(pos.x) ? (pos.x as number) : index * 30
		const py = pos && isNum(pos.y) ? (pos.y as number) : 0
		const pz = pos && isNum(pos.z) ? (pos.z as number) : 0
		obj.position = { x: px, y: py, z: pz }
		// size兜底
		const sizeRaw = obj.size
		const size =
			sizeRaw && typeof sizeRaw === 'object' ? (sizeRaw as Record<string, unknown>) : null
		const sw = size && isNum(size.width) ? (size.width as number) : 0
		const sh = size && isNum(size.height) ? (size.height as number) : 0
		const sd = size && isNum(size.depth) ? (size.depth as number) : 0
		obj.size = {
			width: sw > 0 ? sw : 20,
			height: sh > 0 ? sh : 20,
			depth: sd > 0 ? sd : 20
		}
		return obj
	})
}

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
	// 同步Store→Engine：patchBlueprintNodeData优先
	patchBlueprintNodeData?: (nodeId: string) => void
	engineApi?: SceneLayoutEngineApiLike
	hasEngine?: boolean
}) => {
	const syncSceneLayoutNodeToEngine = makeSyncSceneLayoutNodeToEngine({
		store: options.store as any,
		patchBlueprintNodeData: options.patchBlueprintNodeData,
		engineApi: options.engineApi,
		hasEngine: options.hasEngine
	})
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
			// directHasLayout：输入项已有完整layoutItems数组，或者objects/items中每个item都携带合法的3D position/size
			const directItemsAllHave3D =
				directInputItems.length > 0 && directInputItems.every(hasValid3DFields)
			const directHasLayout =
				(Array.isArray(parsedObj?.layoutItems) || directItemsAllHave3D) &&
				directInputItems.length > 0
			const directHasCamera = parsedObj?.camera && typeof parsedObj.camera === 'object'
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ extractSceneLayoutSourceItems result - directInputItems.length:',
				directInputItems.length,
				'parsedObj.layoutItems is array?',
				Array.isArray(parsedObj?.layoutItems),
				'directItemsAllHave3D:',
				directItemsAllHave3D,
				'directHasLayout:',
				directHasLayout,
				'directHasCamera:',
				directHasCamera
			)
			// eslint-disable-next-line no-console
			console.info(
				'[SCENE-LAYOUT-PREVIEW] first 3 direct items sample:',
				directInputItems.slice(0, 3).map((it) => {
					const o = it as Record<string, unknown>
					return {
						id: o.id,
						hasPos: !!o.position,
						hasSize: !!o.size,
						pos: o.position,
						size: o.size
					}
				})
			)
			if (directHasLayout) {
				console.info('【SCENE-LAYOUT-CHAIN】③ Branch: DIRECT LAYOUT (no API call), merging...')
				const mergedLayoutItems = normalizeLayoutItemsForPreview(
					options.mergeSceneLayoutItemsWithMetadata(directInputItems, [directInputItems])
				)
				console.info('【SCENE-LAYOUT-CHAIN】③ mergedLayoutItems.length:', mergedLayoutItems.length)
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT-PREVIEW] direct path normalized items:',
					mergedLayoutItems.slice(0, 3).map((it) => {
						const o = it as Record<string, unknown>
						return { id: o.id, position: o.position, size: o.size }
					})
				)
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
				// 关键：生成布局后立即同步Store→Engine，避免Ctrl+S时Engine旧数据覆盖新布局
				void syncSceneLayoutNodeToEngine(nodeId)
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
			const mergedLayoutItems = normalizeLayoutItemsForPreview(
				options.mergeSceneLayoutItemsWithMetadata(resLayoutItems, [inputMetadataItems])
			)
			console.info(
				'【SCENE-LAYOUT-CHAIN】③ API success - resLayoutItems.length:',
				resLayoutItems.length,
				'mergedLayoutItems.length:',
				mergedLayoutItems.length
			)
			// eslint-disable-next-line no-console
			console.info(
				'[SCENE-LAYOUT-PREVIEW] API path normalized items:',
				mergedLayoutItems.slice(0, 3).map((it) => {
					const o = it as Record<string, unknown>
					return { id: o.id, position: o.position, size: o.size }
				})
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
			// 关键：生成布局后立即同步Store→Engine，避免Ctrl+S时Engine旧数据覆盖新布局
			void syncSceneLayoutNodeToEngine(nodeId)
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
		// 用户拖拽修改布局后也要同步回Engine
		void syncSceneLayoutNodeToEngine(nodeId)
		void options.syncConnectedModel3DTargets(nodeId)
	}

	const onNodeSceneLayoutSelectedPlaceholderOutput = async (nodeId: string, itemId: string) => {
		console.log('[SceneLayout:transfer] onNodeSceneLayoutSelectedPlaceholderOutput called', { nodeId, itemId })
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') {
			console.warn('[SceneLayout:transfer] node not found or not scene-layout', { nodeId, nodeType: node?.type })
			return
		}
		const outputId = String(itemId ?? '').trim()
		if (!outputId) {
			console.warn('[SceneLayout:transfer] empty outputId')
			return
		}
		console.log('[SceneLayout:transfer] committing selectedPlaceholderOutput to store')
		options.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				selectedPlaceholderOutput: outputId,
				selectedLayoutItemId: outputId
			}
		})
		console.log('[SceneLayout:transfer] calling syncConnectedModel3DTargets with forceSceneLayoutExport=true')
		await options.syncConnectedModel3DTargets(nodeId, { forceSceneLayoutExport: true })
		console.log('[SceneLayout:transfer] syncConnectedModel3DTargets completed')
	}

	return {
		onNodeRunSceneLayout,
		onNodeSceneLayoutItemsUpdate,
		onNodeSceneLayoutSelectedPlaceholderOutput
	}
}
