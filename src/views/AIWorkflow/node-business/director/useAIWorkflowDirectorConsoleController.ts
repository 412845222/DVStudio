import type {
	WorkflowNode,
	WorkflowDirectorConsoleNodeSettings
} from '../../../../aiworkflow/types'
import { useDirectorConsole } from '../../../../composables/useDirectorConsole'
import {
	directorConsolePushData,
	directorConsoleSave,
	onDirectorConsoleDataRequest,
	offDirectorConsoleDataRequest,
	onDirectorConsoleSave,
	offDirectorConsoleSave,
	onDirectorConsoleExportDone,
	offDirectorConsoleExportDone,
	type DirectorConsoleScenePayload,
	type DirectorConsoleSavePayload
} from '../../../../electronBridge'
import {
	useAIWorkflowDirectorConsoleInputs,
	type DirectorConsoleInputsDeps
} from './useAIWorkflowDirectorConsoleInputs'

export interface DirectorConsoleControllerDeps extends DirectorConsoleInputsDeps {
	store: DirectorConsoleInputsDeps['store'] & {
		commit: (type: string, value: unknown) => void
	}
	engineApi?: {
		updateNodeData?: (nodeId: string, patch: Record<string, unknown>) => void
		addNode?: (type: string, x: number, y: number, data?: Record<string, unknown>) => string | null
		connectPorts?: (
			fromNodeId: string,
			fromAnchorId: string,
			toNodeId: string,
			toAnchorId: string,
			opts?: { silent?: boolean }
		) => boolean
	}
	currentProjectId?: number
	getProjectId?: () => number | undefined
	uploadProjectAsset?: (payload: {
		projectId: number
		name?: string
		arrayBuffer: ArrayBuffer
		contentType?: string
		subPath?: string
	}) => Promise<{ ok: boolean; error?: string } | null>
	readProjectAssetText?: (payload: {
		projectId: number
		name?: string
		subPath?: string
	}) => Promise<{
		ok: boolean
		resolved?: boolean
		text?: string
		error?: string
	} | null>
	writeProjectAssetText?: (payload: {
		projectId: number
		name?: string
		subPath?: string
		text: string
	}) => Promise<{
		ok: boolean
		absolutePath?: string
		error?: string
	} | null>
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
}

export const useAIWorkflowDirectorConsoleController = (deps: DirectorConsoleControllerDeps) => {
	const inputs = useAIWorkflowDirectorConsoleInputs(deps)
	const directorConsole = useDirectorConsole()

	let dataRequestListenerId = -1
	let saveListenerId = -1
	let exportDoneListenerId = -1

	/** scene-layout.json 落盘节流器 */
	const sceneLayoutThrottleTimers = new Map<string, number>()
	const lastSceneLayoutLen = new Map<string, number>()

	const resolveProjectId = (): number | undefined => {
		if (deps.getProjectId) return deps.getProjectId()
		const pid = Number(deps.currentProjectId)
		return Number.isFinite(pid) && pid > 0 ? pid : undefined
	}

	/** 上游场景布局 JSON 落盘（覆盖写） */
	const persistSceneLayoutJson = async (
		nodeId: string,
		payload: DirectorConsoleScenePayload
	): Promise<void> => {
		const projectId = resolveProjectId()
		if (!projectId) return
		if (typeof deps.writeProjectAssetText !== 'function') return

		try {
			const upstreamNode = inputs.resolveUpstreamSceneLayoutNode(nodeId)
			const fileData = {
				nodeId,
				upstreamNodeId: upstreamNode?.id,
				upstreamNodeType: upstreamNode?.type,
				capturedAt: Date.now(),
				layoutItems: payload.layoutItems || [],
				camera: payload.camera,
				modelBindings: payload.modelBindings
			}
			const result = await deps.writeProjectAssetText({
				projectId,
				name: 'scene-layout.json',
				subPath: `director-console/${nodeId}`,
				text: JSON.stringify(fileData, null, 2)
			})
			if (!result?.ok) {
				console.warn('[DirectorConsole] persistSceneLayoutJson failed', result?.error)
			}
		} catch (err) {
			console.warn('[DirectorConsole] persistSceneLayoutJson error', err)
		}
	}

	/** scene-layout.json 节流落盘（300ms 防抖 + 长度变化阈值） */
	const throttledPersistSceneLayout = (
		nodeId: string,
		payload: DirectorConsoleScenePayload,
		minDelta = 500
	): void => {
		const layoutLen = JSON.stringify(payload.layoutItems || []).length
		const lastLen = lastSceneLayoutLen.get(nodeId) ?? 0
		if (Math.abs(layoutLen - lastLen) < minDelta) return

		const existing = sceneLayoutThrottleTimers.get(nodeId)
		if (existing != null) window.clearTimeout(existing)

		const timer = window.setTimeout(() => {
			sceneLayoutThrottleTimers.delete(nodeId)
			lastSceneLayoutLen.set(nodeId, layoutLen)
			void persistSceneLayoutJson(nodeId, payload)
		}, 300)
		sceneLayoutThrottleTimers.set(nodeId, timer)
	}

	/** 导演工作数据落盘 director-state.json（覆盖写，确保读取时拿到最新数据） */
	const persistDirectorStateJson = async (
		nodeId: string,
		settings: WorkflowDirectorConsoleNodeSettings
	): Promise<void> => {
		const projectId = resolveProjectId()
		console.log('[DirectorConsole:persistDirectorStateJson] start', {
			nodeId,
			projectId,
			hasWriteProjectAssetText: typeof deps.writeProjectAssetText === 'function'
		})
		if (!projectId) {
			console.warn('[DirectorConsole:persistDirectorStateJson] projectId is undefined, abort')
			return
		}
		if (typeof deps.writeProjectAssetText !== 'function') {
			console.warn(
				'[DirectorConsole:persistDirectorStateJson] writeProjectAssetText not injected, abort'
			)
			return
		}

		try {
			const fileData = {
				nodeId,
				savedAt: Date.now(),
				directorDataVersion: settings.directorDataVersion || 0,
				cameraTracks: settings.cameraTracks,
				activeCameraTrackId: settings.activeCameraTrackId,
				lightRig: settings.lightRig,
				characters: settings.characters,
				cameraParentId: settings.cameraParentId,
				fps: settings.fps,
				totalFrames: settings.totalFrames
			}
			const text = JSON.stringify(fileData, null, 2)
			console.log('[DirectorConsole:persistDirectorStateJson] writing file', {
				nodeId,
				projectId,
				subPath: `director-console/${nodeId}`,
				textLength: text.length,
				charactersCount: fileData.characters?.length ?? 0
			})
			const result = await deps.writeProjectAssetText({
				projectId,
				name: 'director-state.json',
				subPath: `director-console/${nodeId}`,
				text
			})
			console.log('[DirectorConsole:persistDirectorStateJson] write result', result)
			if (!result?.ok) {
				console.warn('[DirectorConsole] persistDirectorStateJson failed', result?.error)
			}
		} catch (err) {
			console.warn('[DirectorConsole] persistDirectorStateJson error', err)
		}
	}

	const openDirectorConsole = async (nodeId: string) => {
		const node = deps.store.state.nodesById[nodeId]
		if (!node) {
			deps.pushToast?.('Node not found', 'error')
			return
		}

		// Write snapshot to node settings
		const inputJson = deps.connectedTextInputValue(nodeId, 'in-json')
		if (deps.engineApi?.updateNodeData) {
			deps.engineApi.updateNodeData(nodeId, {
				directorConsoleSettings: {
					...node.directorConsoleSettings,
					inputJson,
					lastOpenedAt: Date.now()
				}
			})
		}

		// Open the window
		const title = String(node.alias || node.title || '导演控制台')
		const result = await directorConsole.open({
			nodeId,
			projectId: deps.currentProjectId,
			title
		})

		if (!result.ok && !result.focused) {
			deps.pushToast?.(result.error || 'Failed to open director console', 'error')
		}
	}

	const onDataRequest = async (payload: { nodeId?: string }) => {
		const nodeId = payload?.nodeId
		console.log('[DirectorConsole:onDataRequest] received data request', { nodeId })
		if (!nodeId) return
		const node = deps.store.state.nodesById[nodeId]
		if (!node) {
			console.warn('[DirectorConsole:onDataRequest] node not found:', nodeId)
			return
		}

		const scenePayload = await inputs.buildScenePayload(nodeId, node.directorConsoleSettings)
		const charactersArr = Array.isArray(scenePayload.characters) ? scenePayload.characters : []
		const cameraTracksArr = Array.isArray(scenePayload.cameraTracks)
			? scenePayload.cameraTracks
			: []
		console.log('[DirectorConsole:onDataRequest] built scene payload', {
			nodeId,
			charactersCount: charactersArr.length,
			hasCameraTracks: cameraTracksArr.length > 0
		})
		directorConsolePushData(scenePayload)

		// 上游 JSON 落盘（节流）
		throttledPersistSceneLayout(nodeId, scenePayload)
	}

	const onSave = async (payload: DirectorConsoleSavePayload) => {
		const nodeId = payload?.nodeId
		console.log('[DirectorConsole:onSave] received save payload', {
			nodeId,
			hasPatch: !!payload?.patch,
			patchKeys: payload?.patch ? Object.keys(payload.patch) : []
		})
		if (!nodeId) {
			console.warn('[DirectorConsole:onSave] missing nodeId, abort')
			return
		}
		const node = deps.store.state.nodesById[nodeId]
		if (!node) {
			console.warn('[DirectorConsole:onSave] node not found in store:', nodeId)
			return
		}

		const patch = (payload.patch || {}) as Partial<WorkflowDirectorConsoleNodeSettings>
		const updatedSettings: WorkflowDirectorConsoleNodeSettings = {
			...node.directorConsoleSettings,
			...patch,
			directorDataVersion:
				(patch.directorDataVersion ?? (node.directorConsoleSettings?.directorDataVersion || 0)) + 1
		}

		// Commit to store
		deps.store.commit('setNodeDirectorConsoleSettings', {
			nodeId,
			settings: updatedSettings
		})

		// Update engine data
		if (deps.engineApi?.updateNodeData) {
			deps.engineApi.updateNodeData(nodeId, {
				directorConsoleSettings: updatedSettings
			})
		}

		// 落盘 director-state.json
		console.log('[DirectorConsole:onSave] calling persistDirectorStateJson', {
			nodeId,
			charactersCount: updatedSettings.characters?.length ?? 0,
			hasCameraTracks:
				Array.isArray(updatedSettings.cameraTracks) && updatedSettings.cameraTracks.length > 0
		})
		await persistDirectorStateJson(nodeId, updatedSettings)
	}

	/**
	 * [v5.0] 视频导出完成：自动创建下游视频节点并绑定导出资产。
	 */
	const onExportDone = (payload: { nodeId: string; assetUrl?: string; assetName?: string }) => {
		const nodeId = payload?.nodeId
		console.log('[DirectorConsole:onExportDone] received', {
			nodeId,
			assetUrl: payload.assetUrl,
			assetName: payload.assetName
		})
		if (!nodeId || !payload.assetUrl) {
			console.warn('[DirectorConsole:onExportDone] missing nodeId or assetUrl')
			return
		}
		const node = deps.store.state.nodesById[nodeId]
		if (!node) {
			console.warn('[DirectorConsole:onExportDone] node not found:', nodeId)
			return
		}
		const { addNode, connectPorts, updateNodeData } = deps.engineApi ?? {}
		if (typeof addNode !== 'function') {
			console.warn('[DirectorConsole:onExportDone] engineApi.addNode not available')
			return
		}

		// 1. 在导演控制台节点右侧创建视频节点
		const offsetX = (node.width || 240) + 80
		const newNodeId = addNode('video', node.worldX + offsetX, node.worldY, {
			title: payload.assetName || '导出视频'
		})
		if (!newNodeId) {
			deps.pushToast?.('创建视频节点失败', 'error')
			return
		}

		// 2. 创建视频资源并绑定到视频节点
		try {
			const resourceId = `director-export-${newNodeId}-${Date.now()}`
			const resource = {
				id: resourceId,
				kind: 'video',
				name: payload.assetName || '导出视频',
				url: payload.assetUrl,
				createdAt: Date.now()
			}
			deps.store.commit('addResource', resource)
			deps.store.commit('setNodeResource', { nodeId: newNodeId, resourceId })
			if (typeof updateNodeData === 'function') {
				updateNodeData(newNodeId, { resourceId })
			}
		} catch (err) {
			console.warn('[DirectorConsole:onExportDone] bind resource failed', err)
		}

		// 3. 连接：导演控制台 out-video → 视频节点 in-video
		if (typeof connectPorts === 'function') {
			const directorOutput =
				(node.outputs ?? []).find((o) => o.mediaType === 'video')?.id || 'out-video'
			connectPorts(nodeId, directorOutput, newNodeId, 'in-video')
		}

		deps.pushToast?.(`已创建视频节点：${payload.assetName || '导出视频'}`, 'info')
	}

	const startSubscriptions = () => {
		console.log('[DirectorConsole:startSubscriptions] registering data-request and save listeners')
		dataRequestListenerId = onDirectorConsoleDataRequest(onDataRequest)
		saveListenerId = onDirectorConsoleSave(onSave)
		exportDoneListenerId = onDirectorConsoleExportDone(onExportDone)
		console.log('[DirectorConsole:startSubscriptions] listeners registered', {
			dataRequestListenerId,
			saveListenerId,
			exportDoneListenerId
		})
	}

	const stopSubscriptions = () => {
		if (dataRequestListenerId >= 0) {
			offDirectorConsoleDataRequest(dataRequestListenerId)
			dataRequestListenerId = -1
		}
		if (saveListenerId >= 0) {
			offDirectorConsoleSave(saveListenerId)
			saveListenerId = -1
		}
		if (exportDoneListenerId >= 0) {
			offDirectorConsoleExportDone(exportDoneListenerId)
			exportDoneListenerId = -1
		}
		// 清理节流定时器
		sceneLayoutThrottleTimers.forEach((timer) => window.clearTimeout(timer))
		sceneLayoutThrottleTimers.clear()
	}

	return {
		openDirectorConsole,
		startSubscriptions,
		stopSubscriptions
	}
}
