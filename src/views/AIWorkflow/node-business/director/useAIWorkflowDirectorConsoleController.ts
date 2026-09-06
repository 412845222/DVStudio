import type { WorkflowNode } from '../../../../aiworkflow/types'
import { useDirectorConsole } from '../../../../composables/useDirectorConsole'
import {
	directorConsolePushData,
	directorConsoleSave,
	onDirectorConsoleDataRequest,
	offDirectorConsoleDataRequest,
	onDirectorConsoleSave,
	offDirectorConsoleSave,
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
	}
	currentProjectId?: number
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
}

export const useAIWorkflowDirectorConsoleController = (deps: DirectorConsoleControllerDeps) => {
	const inputs = useAIWorkflowDirectorConsoleInputs(deps)
	const directorConsole = useDirectorConsole()

	let dataRequestListenerId = -1
	let saveListenerId = -1

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

	const onDataRequest = (payload: { nodeId?: string }) => {
		const nodeId = payload?.nodeId
		if (!nodeId) return
		const node = deps.store.state.nodesById[nodeId]
		if (!node) return

		const scenePayload = inputs.buildScenePayload(nodeId, node.directorConsoleSettings)
		directorConsolePushData(scenePayload)
	}

	const onSave = (payload: DirectorConsoleSavePayload) => {
		const nodeId = payload?.nodeId
		if (!nodeId) return
		const node = deps.store.state.nodesById[nodeId]
		if (!node) return

		const patch = payload.patch || {}
		const updatedSettings = {
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
	}

	const startSubscriptions = () => {
		dataRequestListenerId = onDirectorConsoleDataRequest(onDataRequest)
		saveListenerId = onDirectorConsoleSave(onSave)
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
	}

	return {
		openDirectorConsole,
		startSubscriptions,
		stopSubscriptions
	}
}
