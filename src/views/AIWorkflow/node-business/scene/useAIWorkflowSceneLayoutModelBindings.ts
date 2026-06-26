import type {
	WorkflowSceneLayoutManualModelBinding,
	WorkflowSceneLayoutModelBinding,
	WorkflowMeshyNodeSettings
} from '../../../../aiworkflow/types'
import type { SceneDecomposeInputItem } from './sceneDecomposeShared'
import { isMeshyRemoteUrl } from '../meshy/useAIWorkflowMeshyAssets'

export const useAIWorkflowSceneLayoutModelBindings = (options: {
	store: {
		state: {
			nodesById: Record<string, Record<string, unknown>>
		}
	}
	isSceneLayoutModelTargetItem: (item: SceneDecomposeInputItem) => boolean
	getIncomingEdges: (nodeId: string, anchorId?: string) => unknown[]
	getMeshyEffectiveModelSource: (settings: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
		preferredUrl?: string | null
		assetUrl?: string | null
		assetPath?: string | null
		format?: 'gltf' | 'glb' | null
	}
}) => {
	const sceneLayoutModelInputAnchorId = (objectId: string) =>
		`in-model-${String(objectId ?? '').trim()}`

	const connectedSceneLayoutModelBindings = (nodeId: string): WorkflowSceneLayoutModelBinding[] => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return []
		const sceneLayoutSettings = node.sceneLayoutSettings as Record<string, unknown> | undefined
		const allLayoutItems = Array.isArray(sceneLayoutSettings?.layoutItems)
			? (sceneLayoutSettings!.layoutItems as unknown[]).filter((item: unknown) =>
					String((item as Record<string, unknown>)?.id ?? '').trim()
				)
			: []

		const manualBindingsMap = new Map<string, WorkflowSceneLayoutManualModelBinding>()
		const rawManualBindings = Array.isArray(sceneLayoutSettings?.manualModelBindings)
			? (sceneLayoutSettings!.manualModelBindings as unknown[])
			: []
		for (const item of rawManualBindings) {
			const itemRecord = item as Record<string, unknown>
			const objectId = String(itemRecord?.objectId ?? '').trim()
			if (!objectId) continue
			const modelUrl = String(itemRecord?.modelUrl ?? '').trim()
			const modelAssetUrl = String(itemRecord?.modelAssetUrl ?? '').trim()
			if (!modelUrl && !modelAssetUrl) continue
			manualBindingsMap.set(objectId, {
				objectId,
				modelUrl: modelUrl || undefined,
				modelAssetUrl: modelAssetUrl || undefined,
				modelSourceName:
					typeof itemRecord?.modelSourceName === 'string' ? itemRecord.modelSourceName : undefined,
				modelSourcePath:
					typeof itemRecord?.modelSourcePath === 'string' ? itemRecord.modelSourcePath : undefined,
				modelAssetPath: typeof itemRecord?.modelAssetPath === 'string' ? itemRecord.modelAssetPath : undefined,
				modelFormat:
					itemRecord?.modelFormat === 'gltf' ? 'gltf' : itemRecord?.modelFormat === 'glb' ? 'glb' : undefined
			})
		}

		const allowedObjectIds = new Set<string>()
		for (const item of allLayoutItems) {
			const objectId = String((item as Record<string, unknown>)?.id ?? '').trim()
			if (!objectId) continue
			if (options.isSceneLayoutModelTargetItem(item as SceneDecomposeInputItem)) allowedObjectIds.add(objectId)
		}
		for (const objectId of manualBindingsMap.keys()) {
			if (objectId) allowedObjectIds.add(objectId)
		}

		const layoutItems = allLayoutItems.filter((item: unknown) =>
			allowedObjectIds.has(String((item as Record<string, unknown>)?.id ?? '').trim())
		)

		return layoutItems.map((item: unknown) => {
			const itemRecord = item as Record<string, unknown>
			const objectId = String(itemRecord.id ?? '').trim()
			const objectName = String(itemRecord.name ?? '').trim() || undefined
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

			const edge = options.getIncomingEdges(nodeId, inputAnchorId)[0] as Record<string, unknown>
			if (!edge) {
				return { objectId, objectName, inputAnchorId, connected: false }
			}

			const fromNodeId = String(edge.fromNodeId ?? '').trim()
			const fromNode = options.store.state.nodesById[fromNodeId] as Record<string, unknown>
			if (!fromNode) {
				return { objectId, objectName, inputAnchorId, connected: false }
			}

			if (fromNode.type === 'model3d') {
				const settings = (fromNode.model3dSettings ?? {}) as Record<string, unknown>
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
				const effective = options.getMeshyEffectiveModelSource(fromNode.meshySettings as Record<string, unknown>)
				const modelAssetUrl = String(effective.assetUrl ?? '').trim()
				const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(effective.assetPath ?? '').trim()
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
