import type {
	WorkflowNode,
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutManualModelBinding
} from '../../../../aiworkflow/types'
import type {
	DirectorConsoleScenePayload,
	DirectorConsoleModelBinding
} from '../../../../electronBridge'

export interface DirectorConsoleInputsDeps {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			projectRootPath?: string
			resourcesById?: Record<string, unknown>
		}
	}
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => unknown
}

export const useAIWorkflowDirectorConsoleInputs = (deps: DirectorConsoleInputsDeps) => {
	const resolveUpstreamSceneLayoutNode = (nodeId: string): WorkflowNode | null => {
		const edge = deps.getFirstIncomingEdge(nodeId, 'in-json') as { fromNodeId?: string } | null
		if (!edge?.fromNodeId) return null
		const upstream = deps.store.state.nodesById[edge.fromNodeId]
		if (!upstream) return null
		// Accept scene-layout or scene-understanding as upstream
		if (upstream.type === 'scene-layout' || upstream.type === 'scene-understanding') {
			return upstream
		}
		return null
	}

	const parseLayoutJson = (
		rawJson: string
	): {
		layoutItems: WorkflowSceneLayoutItem[]
		camera?: {
			position?: { x: number; y: number; z: number }
			target?: { x: number; y: number; z: number }
		}
	} => {
		if (!rawJson) return { layoutItems: [] }
		try {
			const parsed = JSON.parse(rawJson)
			const items = Array.isArray(parsed?.layoutItems)
				? (parsed.layoutItems as WorkflowSceneLayoutItem[])
				: Array.isArray(parsed?.items)
					? (parsed.items as WorkflowSceneLayoutItem[])
					: []
			const camera = parsed?.camera || undefined
			return { layoutItems: items, camera }
		} catch {
			return { layoutItems: [] }
		}
	}

	const mapModelBindings = (
		bindings: WorkflowSceneLayoutManualModelBinding[] | undefined,
		resourcesById: Record<string, unknown>
	): DirectorConsoleModelBinding[] => {
		if (!bindings || !Array.isArray(bindings)) return []
		return bindings
			.filter((b) => b && b.objectId)
			.map((b) => {
				return {
					objectId: b.objectId,
					objectName: undefined,
					modelUrl: b.modelUrl || b.modelAssetUrl || undefined,
					modelProjectRelativePath:
						b.modelProjectRelativePath || b.modelAssetProjectRelativePath || undefined,
					modelAbsolutePath: b.modelAssetPath || undefined
				}
			})
	}

	const buildScenePayload = (
		nodeId: string,
		directorConsoleSettings?: WorkflowNode['directorConsoleSettings']
	): DirectorConsoleScenePayload => {
		const rawJson = deps.connectedTextInputValue(nodeId, 'in-json')
		const { layoutItems, camera } = parseLayoutJson(rawJson)
		const upstreamNode = resolveUpstreamSceneLayoutNode(nodeId)
		const modelBindings = mapModelBindings(
			upstreamNode?.sceneLayoutSettings?.manualModelBindings,
			deps.store.state.resourcesById || {}
		)
		const projectRoot = deps.store.state.projectRootPath || ''

		return {
			nodeId,
			layoutItems,
			camera,
			modelBindings,
			projectRoot,
			cameraTracks: directorConsoleSettings?.cameraTracks,
			activeCameraTrackId: directorConsoleSettings?.activeCameraTrackId,
			lightRig: directorConsoleSettings?.lightRig,
			directorDataVersion: directorConsoleSettings?.directorDataVersion
		}
	}

	return {
		resolveUpstreamSceneLayoutNode,
		parseLayoutJson,
		mapModelBindings,
		buildScenePayload
	}
}
