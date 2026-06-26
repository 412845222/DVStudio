export const useAIWorkflowVideoScreenshot = (payload: {
	getNode: (nodeId: string) => any
	getEdges: () => Array<any>
	dataUrlToBlob: (dataUrl: string) => Blob
	onNodeUploadResource: (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: { autoDistribute?: boolean }
	) => void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	commitSetNodeImageSettings: (input: {
		nodeId: string
		imageSettings: {
			outputWidth: number
			outputHeight: number
			naturalWidth: number
			naturalHeight: number
			cropEnabled: boolean
			crop: { x: number; y: number; width: number; height: number }
		}
	}) => void
}) => {
	const connectedImageTargetsFromVideo = (videoNodeId: string) => {
		const node = payload.getNode(videoNodeId)
		if (!node || node.type !== 'video') return [] as string[]

		const outIds = new Set(
			(Array.isArray(node.outputs) ? node.outputs : [])
				.map((output: any) => String(output?.id ?? '').trim())
				.filter(Boolean)
		)
		const outIdCheckEnabled = outIds.size > 0
		const targets = new Set<string>()

		for (const edge of payload.getEdges()) {
			if (edge.fromNodeId !== videoNodeId) continue
			if (outIdCheckEnabled && !outIds.has(String(edge.fromAnchorId ?? '').trim())) continue

			const toNode = payload.getNode(edge.toNodeId)
			if (!toNode || toNode.type !== 'image') continue
			const toAnchorId = String(edge.toAnchorId ?? '').trim()
			if (toAnchorId !== 'in-image' && toAnchorId !== 'in-resource') continue
			targets.add(toNode.id)
		}

		return Array.from(targets)
	}

	const onVideoScreenshot = (
		videoNodeId: string,
		input: { dataUrl: string; width: number; height: number; time: number }
	) => {
		void (async () => {
			let targetImageNodeIds = connectedImageTargetsFromVideo(videoNodeId)
			if (!targetImageNodeIds.length) {
				await Promise.resolve()
				targetImageNodeIds = connectedImageTargetsFromVideo(videoNodeId)
			}
			if (!targetImageNodeIds.length) return

			const name = `screenshot_${Math.max(0, input.time).toFixed(3)}.png`
			const blob = payload.dataUrlToBlob(input.dataUrl)

			for (const targetImageNodeId of targetImageNodeIds) {
				const target = payload.getNode(targetImageNodeId)
				if (!target || target.type !== 'image') continue

				const clonedFile = new File([blob], name, { type: 'image/png' })
				payload.onNodeUploadResource(targetImageNodeId, clonedFile, 'image', {
					autoDistribute: false
				})
				payload.commitSetNodeImageSettings({
					nodeId: targetImageNodeId,
					imageSettings: {
						outputWidth: input.width,
						outputHeight: input.height,
						naturalWidth: input.width,
						naturalHeight: input.height,
						cropEnabled: false,
						crop: { x: 0, y: 0, width: 1, height: 1 }
					}
				})
				payload.autoSizeMediaNode(targetImageNodeId, input.dataUrl, 'image')
			}
		})()
	}

	return {
		connectedImageTargetsFromVideo,
		onVideoScreenshot
	}
}
