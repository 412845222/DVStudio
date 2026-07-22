/**
 * Warmup Prompt Manager - 管理未预热节点提示逻辑
 *
 * 检测蓝图中未预热的节点，在打开蓝图时提示用户是否需要预热
 */

import { ref } from 'vue'

export interface WarmupPromptState {
	visible: boolean
	projectId: string | null
	blueprintId: string | null
	unwarmedNodeIds: string[]
	totalNodeCount: number
}

const state = ref<WarmupPromptState>({
	visible: false,
	projectId: null,
	blueprintId: null,
	unwarmedNodeIds: [],
	totalNodeCount: 0
})

let currentWarmupHandler: ((nodeIds: string[]) => void) | null = null
let dismissedBlueprints = new Set<string>()

export const useWarmupPrompt = () => {
	const checkUnwarmedNodes = (
		projectId: string,
		blueprintId: string,
		nodeIds: string[],
		hasCachedScreenshot: (nodeId: string) => boolean
	): string[] => {
		const blueprintKey = `${projectId}::${blueprintId}`
		if (dismissedBlueprints.has(blueprintKey)) {
			return []
		}

		const unwarmed = nodeIds.filter((nodeId) => !hasCachedScreenshot(nodeId))
		return unwarmed
	}

	const showPrompt = (
		projectId: string,
		blueprintId: string,
		unwarmedNodeIds: string[],
		totalNodeCount: number,
		onWarmup: (nodeIds: string[]) => void
	) => {
		if (unwarmedNodeIds.length === 0) return

		currentWarmupHandler = onWarmup
		state.value = {
			visible: true,
			projectId,
			blueprintId,
			unwarmedNodeIds,
			totalNodeCount
		}
	}

	const confirmWarmup = () => {
		if (currentWarmupHandler && state.value.unwarmedNodeIds.length > 0) {
			currentWarmupHandler([...state.value.unwarmedNodeIds])
		}
		hidePrompt()
	}

	const dismissPrompt = (rememberDismiss: boolean = false) => {
		if (rememberDismiss && state.value.projectId && state.value.blueprintId) {
			const blueprintKey = `${state.value.projectId}::${state.value.blueprintId}`
			dismissedBlueprints.add(blueprintKey)
		}
		hidePrompt()
	}

	const hidePrompt = () => {
		state.value = {
			visible: false,
			projectId: null,
			blueprintId: null,
			unwarmedNodeIds: [],
			totalNodeCount: 0
		}
		currentWarmupHandler = null
	}

	const resetDismissedBlueprints = () => {
		dismissedBlueprints.clear()
	}

	return {
		state,
		checkUnwarmedNodes,
		showPrompt,
		confirmWarmup,
		dismissPrompt,
		hidePrompt,
		resetDismissedBlueprints
	}
}

export const warmupPromptState = state
