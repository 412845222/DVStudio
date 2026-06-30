import type { Ref } from 'vue'
import type {
	WorkflowNode,
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutManualModelBinding
} from '../../../aiworkflow/types'
import type { BlueprintProjectService } from '../../../network/BlueprintProjectService'

export const useAIWorkflowSceneLayoutModelBinding = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
		commit: (type: string, value: unknown) => void
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	revokeSceneLayoutManualModelObjectUrl: (nodeId: string, objectId?: string) => void
	sceneLayoutManualModelObjectKey: (nodeId: string, objectId: string) => string
	setObjectUrl: (key: string, url: string) => void
	currentProjectId: Ref<number | null>
	blueprintProjectService: Pick<BlueprintProjectService, 'uploadAsset'>
	resolveBackendUrl: (value: string) => string
}) => {
	const onNodeUploadSceneLayoutModelFile = async (
		nodeId: string,
		file: File,
		preferredObjectId?: string
	) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return

		const selectedLayoutItemId = String(
			preferredObjectId ?? node.sceneLayoutSettings?.selectedLayoutItemId ?? ''
		).trim()
		if (!selectedLayoutItemId) {
			payload.pushToast('请先选中占位体，再导入模型。', 'warn')
			return
		}

		const lowerName = String(file.name || '').toLowerCase()
		const SUPPORTED_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae']
		const isSupported = SUPPORTED_EXTS.some(ext => lowerName.endsWith(ext))
		if (!isSupported) {
			payload.pushToast('导入模型支持 .glb / .gltf / .fbx / .obj / .stl / .dae 格式。', 'warn')
			return
		}

		const layoutItems = Array.isArray(node.sceneLayoutSettings?.layoutItems)
			? node.sceneLayoutSettings!.layoutItems
			: []
		const selectedLayoutItem = layoutItems.find(
			(item: WorkflowSceneLayoutItem) => String(item?.id ?? '').trim() === selectedLayoutItemId
		)
		if (!selectedLayoutItem) {
			payload.pushToast('当前占位体不存在，请重新选择后再试。', 'warn')
			return
		}

		payload.revokeSceneLayoutManualModelObjectUrl(nodeId, selectedLayoutItemId)

		const objectUrl = URL.createObjectURL(file)
		const objectKey = payload.sceneLayoutManualModelObjectKey(nodeId, selectedLayoutItemId)
		payload.setObjectUrl(objectKey, objectUrl)

		const sourcePath =
			typeof (file as unknown as Record<string, unknown>)?.path === 'string'
				? String((file as unknown as Record<string, unknown>).path).trim()
				: ''
		let modelFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
		if (lowerName.endsWith('.gltf')) modelFormat = 'gltf'
		else if (lowerName.endsWith('.fbx')) modelFormat = 'fbx'
		else if (lowerName.endsWith('.obj')) modelFormat = 'obj'
		else if (lowerName.endsWith('.stl')) modelFormat = 'stl'
		else if (lowerName.endsWith('.dae')) modelFormat = 'dae'
		let assetUrl = ''
		let assetPath = ''

		try {
			const projectId = Number(payload.currentProjectId.value ?? 0)
			if (projectId > 0) {
				const uploaded = await payload.blueprintProjectService.uploadAsset(file, 'file', {
					projectId
				})
				if (uploaded.ok) {
					const asset = uploaded.asset ?? {}
					assetUrl = payload.resolveBackendUrl(String(asset.url || ''))
					assetPath = String(asset.absolutePath || '').trim()
				}
			}
		} catch {
			// 上传失败时仍可使用本地 object url 进行预览。
		}

		const currentBindings = Array.isArray(node.sceneLayoutSettings?.manualModelBindings)
			? (node.sceneLayoutSettings!.manualModelBindings as WorkflowSceneLayoutManualModelBinding[])
			: []
		const nextLayoutItems = layoutItems.map((item: WorkflowSceneLayoutItem) => {
			if (String(item?.id ?? '').trim() !== selectedLayoutItemId) return item
			const nextItem = { ...item } as WorkflowSceneLayoutItem
			delete nextItem.orientationFix
			delete nextItem.fillMode
			delete nextItem.fillCount
			delete nextItem.fillAxisScale
			delete nextItem.fillUpdatedAt
			delete nextItem.fitMode
			delete nextItem.fitMessage
			delete nextItem.fitUpdatedAt
			return nextItem
		})
		const nextBindingsByObjectId = new Map<string, WorkflowSceneLayoutManualModelBinding>()
		for (const binding of currentBindings) {
			const objectId = String(binding?.objectId ?? '').trim()
			if (!objectId) continue
			nextBindingsByObjectId.set(objectId, binding)
		}

		nextBindingsByObjectId.set(selectedLayoutItemId, {
			objectId: selectedLayoutItemId,
			modelUrl: assetUrl || objectUrl,
			modelAssetUrl: assetUrl || undefined,
			modelSourceName: String(file.name || '').trim() || undefined,
			modelSourcePath: assetPath || sourcePath || undefined,
			modelAssetPath: assetPath || undefined,
			modelFormat
		})

		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				layoutItems: nextLayoutItems,
				manualModelBindings: Array.from(nextBindingsByObjectId.values())
			}
		})

		const displayName =
			String(selectedLayoutItem.name ?? selectedLayoutItem.id ?? selectedLayoutItemId).trim() ||
			selectedLayoutItemId
		payload.pushToast(`已为占位体“${displayName}”导入模型。`, 'info')
	}

	const onNodeClearSceneLayoutModelBinding = (nodeId: string, objectIdRaw: string) => {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return

		const objectId = String(objectIdRaw ?? '').trim()
		if (!objectId) return

		const currentBindings = Array.isArray(node.sceneLayoutSettings?.manualModelBindings)
			? (node.sceneLayoutSettings!.manualModelBindings as WorkflowSceneLayoutManualModelBinding[])
			: []
		if (!currentBindings.length) return

		const targetBinding = currentBindings.find(
			(item) => String(item?.objectId ?? '').trim() === objectId
		)
		if (!targetBinding) return

		const nextBindings = currentBindings.filter(
			(item) => String(item?.objectId ?? '').trim() !== objectId
		)
		const nextLayoutItems = (
			Array.isArray(node.sceneLayoutSettings?.layoutItems)
				? node.sceneLayoutSettings!.layoutItems
				: []
		).map((item: WorkflowSceneLayoutItem) => {
			if (String(item?.id ?? '').trim() !== objectId) return item
			const nextItem = { ...item } as WorkflowSceneLayoutItem
			delete nextItem.orientationFix
			delete nextItem.fillMode
			delete nextItem.fillCount
			delete nextItem.fillAxisScale
			delete nextItem.fillUpdatedAt
			delete nextItem.fitMode
			delete nextItem.fitMessage
			delete nextItem.fitUpdatedAt
			return nextItem
		})

		payload.store.commit('setNodeSceneLayoutSettings', {
			nodeId,
			sceneLayoutSettings: {
				layoutItems: nextLayoutItems,
				manualModelBindings: nextBindings
			}
		})

		payload.revokeSceneLayoutManualModelObjectUrl(nodeId, objectId)

		const layoutItems = Array.isArray(node.sceneLayoutSettings?.layoutItems)
			? node.sceneLayoutSettings!.layoutItems
			: []
		const selectedLayoutItem = layoutItems.find(
			(item: WorkflowSceneLayoutItem) => String(item?.id ?? '').trim() === objectId
		)
		const displayName =
			String(selectedLayoutItem?.name ?? selectedLayoutItem?.id ?? objectId).trim() || objectId
		payload.pushToast(`已清除占位体“${displayName}”的手动导入模型。`, 'info')
	}

	return {
		onNodeUploadSceneLayoutModelFile,
		onNodeClearSceneLayoutModelBinding
	}
}
