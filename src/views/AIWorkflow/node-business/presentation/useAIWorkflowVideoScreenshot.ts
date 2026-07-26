import type { WorkflowNode } from '../../../../aiworkflow/types'

export const useAIWorkflowVideoScreenshot = (payload: {
	getNode: (nodeId: string) => WorkflowNode | null
	getAllNodes: () => WorkflowNode[]
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
	commitAddNodeAt: (payload: { worldX: number; worldY: number; title?: string; type?: string }) => string | null
	commitSetNodeType: (payload: { nodeId: string; type: string }) => void
	videoScreenshotNodeTitle: string
}) => {
	/**
	 * 查找视频节点右侧不与其他节点重叠的位置。
	 * 优先在同一水平线右侧放置，若重叠则向下偏移，直到找到空位。
	 */
	const findNonOverlappingPosition = (
		videoNode: WorkflowNode
	): { worldX: number; worldY: number } => {
		const videoWidth = Number(videoNode.width) || 320
		const videoHeight = Number(videoNode.height) || 240
		const spacing = 40
		const imageNodeWidth = 240
		const imageNodeHeight = 160

		const baseWorldX = (videoNode.worldX || 0) + videoWidth + spacing
		const baseWorldY = videoNode.worldY || 0
		const allNodes = payload.getAllNodes()

		const checkOverlap = (x: number, y: number): boolean => {
			return allNodes.some((n) => {
				if (n.id === videoNode.id) return false
				const nx = n.worldX || 0
				const ny = n.worldY || 0
				const nw = Number(n.width) || 240
				const nh = Number(n.height) || 160
				// 留一点间距，避免贴太近
				const pad = 16
				return !(
					x + imageNodeWidth + pad < nx ||
					x > nx + nw + pad ||
					y + imageNodeHeight + pad < ny ||
					y > ny + nh + pad
				)
			})
		}

		// 先尝试同一 y 坐标
		let worldX = baseWorldX
		let worldY = baseWorldY
		if (!checkOverlap(worldX, worldY)) {
			return { worldX, worldY }
		}

		// 向下逐个偏移尝试
		for (let offset = 1; offset <= 20; offset++) {
			worldY = baseWorldY + offset * (imageNodeHeight + spacing)
			if (!checkOverlap(worldX, worldY)) {
				return { worldX, worldY }
			}
		}

		// 若下方都满了，再向右一列尝试
		worldX = baseWorldX + imageNodeWidth + spacing
		for (let offset = 0; offset <= 20; offset++) {
			worldY = baseWorldY + offset * (imageNodeHeight + spacing)
			if (!checkOverlap(worldX, worldY)) {
				return { worldX, worldY }
			}
		}

		// 兜底：放到很下方
		return { worldX: baseWorldX, worldY: baseWorldY + 21 * (imageNodeHeight + spacing) }
	}

	const createImageNodeForVideoScreenshot = (
		videoNodeId: string,
		time: number
	): string | null => {
		const videoNode = payload.getNode(videoNodeId)
		if (!videoNode) return null

		const { worldX, worldY } = findNonOverlappingPosition(videoNode)

		const title = `${payload.videoScreenshotNodeTitle} (${Math.max(0, time).toFixed(2)}s)`
		const newNodeId = payload.commitAddNodeAt({ worldX, worldY, title, type: 'image' })
		if (!newNodeId) return null

		return newNodeId
	}

	const onVideoScreenshot = (
		videoNodeId: string,
		input: { dataUrl: string; width: number; height: number; time: number }
	) => {
		void (async () => {
			const newNodeId = createImageNodeForVideoScreenshot(videoNodeId, input.time)
			if (!newNodeId) return

			const name = `screenshot_${Math.max(0, input.time).toFixed(3)}.png`
			const blob = payload.dataUrlToBlob(input.dataUrl)
			const clonedFile = new File([blob], name, { type: 'image/png' })

			payload.onNodeUploadResource(newNodeId, clonedFile, 'image', {
				autoDistribute: false
			})
			payload.commitSetNodeImageSettings({
				nodeId: newNodeId,
				imageSettings: {
					outputWidth: input.width,
					outputHeight: input.height,
					naturalWidth: input.width,
					naturalHeight: input.height,
					cropEnabled: false,
					crop: { x: 0, y: 0, width: 1, height: 1 }
				}
			})
			payload.autoSizeMediaNode(newNodeId, input.dataUrl, 'image')
		})()
	}

	return {
		onVideoScreenshot
	}
}
