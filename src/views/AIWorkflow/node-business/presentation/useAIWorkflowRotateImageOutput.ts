type RotateImageNode = { type: 'rotate-image'; resourceId?: string }
type ImageNode = { type: 'image'; id: string }

export const useAIWorkflowRotateImageOutput = (payload: {
	getNode: (nodeId: string) => Record<string, unknown> | null | undefined
	getResource: (resourceId: string) => Record<string, unknown> | null | undefined
	getEdges: () => Array<{ fromNodeId: string; fromAnchorId: string; toNodeId: string }>
	commitSetRotatePromptText: (input: { nodeId: string; text: string }) => void
	makeResourceId: () => string
	setNodeResourceWithCleanup: (input: {
		nodeId: string
		resourceId: string | null
		resourcePath?: string
	}) => void
	onNodeUploadResource: (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: { autoDistribute?: boolean }
	) => void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	dataUrlToBlob: (dataUrl: string) => Blob
	commitPatchResource: (input: {
		resourceId: string
		patch: Partial<{ name?: string; url?: string }>
	}) => void
	commitAddResource: (input: {
		id: string
		kind: 'image' | 'video'
		name: string
		url: string
		createdAt: number
	}) => void
}) => {
	const onRotateImageOutput = (
		nodeId: string,
		input: {
			dataUrl: string
			promptText: string
			yaw: number
			pitch: number
			width: number
			height: number
		}
	) => {
		const node = payload.getNode(nodeId)
		if (!node || node.type !== 'rotate-image') return

		const promptText = String(input?.promptText ?? '')
		payload.commitSetRotatePromptText({ nodeId, text: promptText })

		const dataUrl = String(input?.dataUrl ?? '').trim()
		if (!dataUrl) return

		const name = `rotate_${nodeId}.png`
		const existingResourceId = String(node.resourceId ?? '').trim()
		let outputResourceId = existingResourceId
		const existing = existingResourceId ? payload.getResource(existingResourceId) : null

		if (existing && existing.kind === 'image') {
			payload.commitPatchResource({
				resourceId: existingResourceId,
				patch: { name, url: dataUrl }
			})
		} else {
			outputResourceId = payload.makeResourceId()
			payload.commitAddResource({
				id: outputResourceId,
				kind: 'image',
				name,
				url: dataUrl,
				createdAt: Date.now()
			})
			payload.setNodeResourceWithCleanup({ nodeId, resourceId: outputResourceId })
		}

		for (const edge of payload.getEdges()) {
			if (edge.fromNodeId !== nodeId) continue
			if (edge.fromAnchorId !== 'out-image') continue
			const toNode = payload.getNode(edge.toNodeId)
			if (!toNode || toNode.type !== 'image') continue
			const toNodeId = String(toNode.id ?? '')
			if (!toNodeId) continue

			const cloned = new File(
				[payload.dataUrlToBlob(dataUrl)],
				`rotate_${nodeId}_${toNodeId}.png`,
				{
					type: 'image/png'
				}
			)
			payload.onNodeUploadResource(toNodeId, cloned, 'image', { autoDistribute: false })
			payload.autoSizeMediaNode(toNodeId, dataUrl, 'image')
		}
	}

	return {
		onRotateImageOutput
	}
}
