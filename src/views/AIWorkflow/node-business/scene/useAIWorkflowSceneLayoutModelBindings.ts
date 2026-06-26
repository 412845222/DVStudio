import type {
	WorkflowSceneLayoutManualModelBinding,
	WorkflowSceneLayoutModelBinding
} from '../../../../aiworkflow/types'
import { isMeshyRemoteUrl } from '../meshy/useAIWorkflowMeshyAssets'

export const useAIWorkflowSceneLayoutModelBindings = (options: {
	store: {
		state: {
			nodesById: Record<string, any>
		}
	}
	isSceneLayoutModelTargetItem: (item: any) => boolean
	getIncomingEdges: (nodeId: string, anchorId?: string) => any[]
	getMeshyEffectiveModelSource: (settings: any) => {
		preferredUrl?: string | null
		assetUrl?: string | null
		assetPath?: string | null
		format?: 'gltf' | 'glb' | null
	}
}) => {
	const sceneLayoutModelInputAnchorId = (objectId: string) =>
		`in-model-${String(objectId ?? '').trim()}`

	const connectedSceneLayoutModelBindings = (nodeId: string): WorkflowSceneLayoutModelBinding[] => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-layout') return []
		const allLayoutItems = Array.isArray(node.sceneLayoutSettings?.layoutItems)
			? node.sceneLayoutSettings!.layoutItems!.filter((item: any) => String(item?.id ?? '').trim())
			: []

		const manualBindingsMap = new Map<string, WorkflowSceneLayoutManualModelBinding>()
		const rawManualBindings = Array.isArray(node.sceneLayoutSettings?.manualModelBindings)
			? node.sceneLayoutSettings!.manualModelBindings!
			: []
		for (const item of rawManualBindings) {
			const objectId = String(item?.objectId ?? '').trim()
			if (!objectId) continue
			const modelUrl = String(item?.modelUrl ?? '').trim()
			const modelAssetUrl = String(item?.modelAssetUrl ?? '').trim()
			if (!modelUrl && !modelAssetUrl) continue
			manualBindingsMap.set(objectId, {
				objectId,
				modelUrl: modelUrl || undefined,
				modelAssetUrl: modelAssetUrl || undefined,
				modelSourceName:
					typeof item?.modelSourceName === 'string' ? item.modelSourceName : undefined,
				modelSourcePath:
					typeof item?.modelSourcePath === 'string' ? item.modelSourcePath : undefined,
				modelAssetPath: typeof item?.modelAssetPath === 'string' ? item.modelAssetPath : undefined,
				modelFormat:
					item?.modelFormat === 'gltf' ? 'gltf' : item?.modelFormat === 'glb' ? 'glb' : undefined
			})
		}

		const allowedObjectIds = new Set<string>()
		for (const item of allLayoutItems) {
			const objectId = String(item?.id ?? '').trim()
			if (!objectId) continue
			if (options.isSceneLayoutModelTargetItem(item)) allowedObjectIds.add(objectId)
		}
		for (const objectId of manualBindingsMap.keys()) {
			if (objectId) allowedObjectIds.add(objectId)
		}

		const layoutItems = allLayoutItems.filter((item: any) =>
			allowedObjectIds.has(String(item?.id ?? '').trim())
		)

		return layoutItems.map((item: any) => {
			const objectId = String(item.id ?? '').trim()
			const objectName = String(item.name ?? '').trim() || undefined
			const inputAnchorId = sceneLayoutModelInputAnchorId(objectId)

			const manualBinding = manualBindingsMap.get(objectId)
			if (manualBinding) {
				const modelAssetUrl = String(manualBinding.modelAssetUrl ?? '').trim()
				const modelUrl = String(manualBinding.modelUrl ?? modelAssetUrl ?? '').trim()
				return {
					objectId,
					objectName,
					inputAnchorId,
					connected: !!modelUrl,
					sourceNodeId: nodeId,
					sourceNodeType: 'manual',
					modelUrl: modelUrl || undefined,
					modelAssetUrl: modelAssetUrl || undefined,
					modelSourceName: manualBinding.modelSourceName || undefined,
					modelSourcePath:
						typeof manualBinding.modelSourcePath === 'string'
							? String(manualBinding.modelSourcePath).trim() || undefined
							: undefined,
					modelFormat:
						manualBinding.modelFormat === 'gltf'
							? 'gltf'
							: manualBinding.modelFormat === 'glb'
								? 'glb'
								: undefined
				}
			}

			const edge = options.getIncomingEdges(nodeId, inputAnchorId)[0]
			if (!edge) {
				return { objectId, objectName, inputAnchorId, connected: false }
			}

			const fromNodeId = String((edge as any).fromNodeId ?? '').trim()
			const fromNode = options.store.state.nodesById[fromNodeId]
			if (!fromNode) {
				return { objectId, objectName, inputAnchorId, connected: false }
			}

			if (fromNode.type === 'model3d') {
				const settings = fromNode.model3dSettings ?? {}
				const modelAssetUrl = String(settings.modelAssetUrl ?? '').trim()
				const modelUrl = String(settings.modelUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(settings.modelAssetPath ?? '').trim()
				const modelSourcePath = String(settings.modelSourcePath ?? '').trim()
				return {
					objectId,
					objectName,
					inputAnchorId,
					connected: !!modelUrl,
					sourceNodeId: fromNodeId,
					sourceNodeType: 'model3d',
					modelUrl: modelUrl || undefined,
					modelAssetUrl: modelAssetUrl || undefined,
					modelSourceName: String(settings.modelSourceName ?? '').trim() || undefined,
					modelSourcePath: modelSourcePath || undefined,
					modelAssetPath: modelAssetPath || undefined,
					modelFormat:
						settings.modelFormat === 'gltf'
							? 'gltf'
							: settings.modelFormat === 'glb'
								? 'glb'
								: undefined
				}
			}

			if (fromNode.type === 'meshy') {
				const effective = options.getMeshyEffectiveModelSource(fromNode.meshySettings as any)
				const modelAssetUrl = String(effective.assetUrl ?? '').trim()
				const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(effective.assetPath ?? '').trim()
				// Block remote meshy.ai URLs — they must be localized before reaching Three.js
				const modelUrl = isMeshyRemoteUrl(rawModelUrl) ? '' : rawModelUrl
				const safeAssetUrl = isMeshyRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
				return {
					objectId,
					objectName,
					inputAnchorId,
					connected: !!modelUrl,
					sourceNodeId: fromNodeId,
					sourceNodeType: 'meshy',
					modelUrl: modelUrl || undefined,
					modelAssetUrl: safeAssetUrl || undefined,
					modelSourceName:
						String(fromNode.alias ?? fromNode.title ?? objectName ?? objectId).trim() || undefined,
					modelSourcePath: modelAssetPath || undefined,
					modelAssetPath: modelAssetPath || undefined,
					modelFormat: effective.format === 'gltf' ? 'gltf' : 'glb'
				}
			}

			return {
				objectId,
				objectName,
				inputAnchorId,
				connected: false,
				sourceNodeId: fromNodeId
			}
		})
	}

	return {
		sceneLayoutModelInputAnchorId,
		connectedSceneLayoutModelBindings
	}
}
