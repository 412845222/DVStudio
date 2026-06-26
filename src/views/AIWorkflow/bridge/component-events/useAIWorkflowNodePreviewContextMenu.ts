export const useAIWorkflowNodePreviewContextMenu = (payload: {
	enabled?: boolean
	getNodeWorld: (nodeId: string) => { worldX: number; worldY: number } | null
	onCanvasContextMenu: (menuPayload: {
		clientX: number
		clientY: number
		worldX: number
		worldY: number
	}) => void
}) => {
	const onNodePreviewContextMenu = (
		nodeId: string,
		input: { clientX: number; clientY: number }
	) => {
		if (payload.enabled === false) return
		const world = payload.getNodeWorld(nodeId)
		payload.onCanvasContextMenu({
			clientX: Number(input?.clientX ?? 0),
			clientY: Number(input?.clientY ?? 0),
			worldX: Number(world?.worldX ?? 0),
			worldY: Number(world?.worldY ?? 0)
		})
	}

	return {
		onNodePreviewContextMenu
	}
}
