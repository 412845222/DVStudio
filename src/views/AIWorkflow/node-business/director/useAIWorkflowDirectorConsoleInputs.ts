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
	getProjectId?: () => number | undefined
	readProjectAssetText?: (payload: {
		projectId: number
		name?: string
		subPath?: string
	}) => Promise<{
		ok: boolean
		resolved?: boolean
		text?: string
		error?: string
	} | null>
}

/** director-state.json 文件结构 */
type DirectorStateFile = {
	nodeId: string
	savedAt: number
	directorDataVersion?: number
	cameraTracks?: unknown
	activeCameraTrackId?: string
	lightRig?: unknown
	characters?: unknown
	cameraParentId?: string | null
	fps?: number
	totalFrames?: number
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

	/** 读取落盘的 director-state.json */
	const readPersistedDirectorState = async (nodeId: string): Promise<DirectorStateFile | null> => {
		console.log('[DirectorConsole:readPersistedDirectorState] start', {
			nodeId,
			hasReadProjectAssetText: typeof deps.readProjectAssetText === 'function',
			hasGetProjectId: typeof deps.getProjectId === 'function'
		})
		if (!deps.readProjectAssetText || !deps.getProjectId) {
			console.warn('[DirectorConsole:readPersistedDirectorState] missing deps, return null')
			return null
		}
		const projectId = deps.getProjectId()
		if (!projectId) {
			console.warn('[DirectorConsole:readPersistedDirectorState] projectId undefined, return null')
			return null
		}
		try {
			const result = await deps.readProjectAssetText({
				projectId,
				name: 'director-state.json',
				subPath: `director-console/${nodeId}`
			})
			console.log('[DirectorConsole:readPersistedDirectorState] read result', {
				nodeId,
				projectId,
				ok: result?.ok,
				resolved: result?.resolved,
				textLength: result?.text?.length ?? 0
			})
			if (result?.ok && result?.resolved && result.text) {
				const parsed = JSON.parse(result.text) as DirectorStateFile
				const charArr = Array.isArray(parsed.characters) ? parsed.characters : []
				const camArr = Array.isArray(parsed.cameraTracks) ? parsed.cameraTracks : []
				console.log('[DirectorConsole:readPersistedDirectorState] parsed state', {
					nodeId,
					charactersCount: charArr.length,
					hasCameraTracks: camArr.length > 0,
					directorDataVersion: parsed.directorDataVersion
				})
				return parsed
			}
		} catch (err) {
			console.warn('[DirectorConsole] read director-state.json failed', err)
		}
		return null
	}

	const buildScenePayload = async (
		nodeId: string,
		directorConsoleSettings?: WorkflowNode['directorConsoleSettings']
	): Promise<DirectorConsoleScenePayload> => {
		const rawJson = deps.connectedTextInputValue(nodeId, 'in-json')
		const { layoutItems, camera } = parseLayoutJson(rawJson)
		const upstreamNode = resolveUpstreamSceneLayoutNode(nodeId)
		const modelBindings = mapModelBindings(
			upstreamNode?.sceneLayoutSettings?.manualModelBindings,
			deps.store.state.resourcesById || {}
		)
		const projectRoot = deps.store.state.projectRootPath || ''

		// 优先读取落盘的 director-state.json，退化到 node settings
		const persistedState = await readPersistedDirectorState(nodeId)
		const stateSource = persistedState || directorConsoleSettings || {}

		const projectId = deps.getProjectId?.()

		return {
			nodeId,
			projectId,
			layoutItems,
			camera,
			modelBindings,
			projectRoot,
			cameraTracks: stateSource.cameraTracks as DirectorConsoleScenePayload['cameraTracks'],
			activeCameraTrackId: stateSource.activeCameraTrackId,
			lightRig: stateSource.lightRig as DirectorConsoleScenePayload['lightRig'],
			characters: stateSource.characters as DirectorConsoleScenePayload['characters'],
			cameraParentId: stateSource.cameraParentId as string | null | undefined,
			fps: stateSource.fps,
			totalFrames: stateSource.totalFrames,
			directorDataVersion: stateSource.directorDataVersion
		}
	}

	return {
		resolveUpstreamSceneLayoutNode,
		parseLayoutJson,
		mapModelBindings,
		readPersistedDirectorState,
		buildScenePayload
	}
}
