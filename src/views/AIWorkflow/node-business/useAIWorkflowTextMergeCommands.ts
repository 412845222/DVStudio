type TextMergeStore = {
	commit: (type: string, value: unknown) => void
}

export const useAIWorkflowTextMergeCommands = (payload: { store: TextMergeStore }) => {
	const onTextMergeItemAdd = (nodeId: string) => {
		payload.store.commit('textMergeAddItem', { nodeId })
	}

	const onTextMergeItemRemove = (nodeId: string, itemId: string) => {
		payload.store.commit('textMergeRemoveItem', { nodeId, itemId })
	}

	const onTextMergeItemMove = (nodeId: string, input: { itemId: string; dir: 'up' | 'down' }) => {
		payload.store.commit('textMergeMoveItem', { nodeId, itemId: input.itemId, dir: input.dir })
	}

	return {
		onTextMergeItemAdd,
		onTextMergeItemRemove,
		onTextMergeItemMove
	}
}
