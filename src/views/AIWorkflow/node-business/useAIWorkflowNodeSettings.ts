import { isRecord } from '../../../types/utils'

type NodeSettingsStore = {
	state: {
		nodesById: Record<string, unknown>
	}
	commit: (type: string, value: unknown) => void
}

type VideoDimensionSettings = {
	outputWidth?: number
	outputHeight?: number
	naturalWidth?: number
	naturalHeight?: number
	currentTime?: number
}

type ImageSettingsUpdate = VideoDimensionSettings & {
	cropEnabled?: boolean
	crop?: { x: number; y: number; width: number; height: number }
	imageGenerationSource?: 'upload' | 'comfyui' | 'meshy'
	meshyImageSettings?: Record<string, unknown>
}

export const useAIWorkflowNodeSettings = (payload: {
	store: NodeSettingsStore
	markViewportMotion: () => void
	scheduleAsyncEdgeRender: () => void
	queueImageDistributeOnPointerUp: (nodeId: string) => void
	autoDistributeImageOutputToConnectedNodes: (nodeId: string) => Promise<void>
}) => {
	const onNodeResize = (
		nodeId: string,
		input: { width: number; height: number; worldX: number; worldY: number }
	) => {
		payload.markViewportMotion()
		payload.store.commit('setNodeSize', { nodeId, width: input.width, height: input.height, customized: false })
		payload.store.commit('setNodePosition', { nodeId, worldX: input.worldX, worldY: input.worldY })
		payload.scheduleAsyncEdgeRender()
	}

	const onNodeAutoResize = (nodeId: string, height: number) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!isRecord(node)) return
		const nextHeight = Math.max(80, Math.floor(Number(height) || 0))
		if (!nextHeight || !Number.isFinite(nextHeight)) return
		const prevHeight = Number(node.height) || 0
		if (Math.abs(nextHeight - prevHeight) < 2) return
		payload.store.commit('setNodeSize', {
			nodeId,
			width: node.width,
			height: nextHeight,
			customized: false
		})
		payload.scheduleAsyncEdgeRender()
	}

	const onNodeTextValueUpdate = (nodeId: string, input: { textValue: string }) => {
		payload.store.commit('setNodeTextValue', { nodeId, textValue: String(input?.textValue ?? '') })
	}

	const onNodeImageSettingsUpdate = (nodeId: string, input: ImageSettingsUpdate) => {
		payload.store.commit('setNodeImageSettings', { nodeId, imageSettings: input })
	}

	const onNodeVideoSettingsUpdate = (nodeId: string, input: VideoDimensionSettings) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!isRecord(node)) return
		const prev: Record<string, unknown> = isRecord(node.videoSettings) ? node.videoSettings : {}
		const next: Record<string, unknown> = isRecord(input) ? input : {}
		const keys: Array<'outputWidth' | 'outputHeight' | 'naturalWidth' | 'naturalHeight' | 'currentTime'> = [
			'outputWidth',
			'outputHeight',
			'naturalWidth',
			'naturalHeight',
			'currentTime'
		]
		let changed = false
		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(next, key)) continue
			const a = Number(prev[key])
			const b = Number(next[key])
			if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 0.001) {
				changed = true
				break
			}
		}
		if (!changed) return
		payload.store.commit('setNodeVideoSettings', { nodeId, videoSettings: input })
	}

	const onNodeModel3DSettingsUpdate = (nodeId: string, input: Record<string, unknown>) => {
		payload.store.commit('setNodeModel3DSettings', { nodeId, model3dSettings: input })
	}

	const onNodeMeshySettingsUpdate = (nodeId: string, input: Record<string, unknown>) => {
		payload.store.commit('setNodeMeshySettings', { nodeId, meshySettings: input })
	}

	return {
		onNodeResize,
		onNodeAutoResize,
		onNodeTextValueUpdate,
		onNodeImageSettingsUpdate,
		onNodeVideoSettingsUpdate,
		onNodeModel3DSettingsUpdate,
		onNodeMeshySettingsUpdate
	}
}
