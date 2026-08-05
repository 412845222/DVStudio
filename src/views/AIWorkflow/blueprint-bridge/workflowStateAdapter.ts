import type {
	LegacyBlueprintData,
	BlueprintNodeData,
	ConnectionData,
	LegacyResourceData,
	SavedSelectionFrameData,
	PortSpec
} from '../../../engine/blueprint/types'
import type {
	WorkflowState,
	WorkflowNode,
	WorkflowEdge,
	SavedSelectionFrame,
	WorkflowAnchorSpec
} from '../../../aiworkflow/types'
import type { WorkflowResource } from '../../../aiworkflow/resource/types'

const LEGACY_SCHEMA_VERSION = 1

let _cachedResult: LegacyBlueprintData | null = null
let _cacheKey: string = ''

export function workflowStateToLegacyBlueprint(state: WorkflowState): LegacyBlueprintData {
	const nodeCount = state.nodeOrder.length
	const edgeCount = state.edgeOrder.length
	const resCount = state.resourceOrder.length
	const nodeSizeSig = state.nodeOrder
		.map((id) => {
			const n = state.nodesById[id]
			return n ? `${id}:${n.width ?? 0}:${n.height ?? 0}:${n.sizeCustomized ? 1 : 0}` : id
		})
		.join(',')
	const structureKey = [
		state.nodeOrder.join(','),
		state.edgeOrder.join(','),
		state.resourceOrder.join(','),
		state.selectedNodeId ?? '',
		(state.selectedNodeIds ?? []).join(','),
		state.nodeCheckboxVisible ? '1' : '0',
		state.savedSelectionFrames?.length ?? 0,
		nodeCount,
		edgeCount,
		resCount,
		nodeSizeSig
	].join('|')

	if (_cachedResult && _cacheKey === structureKey) {
		if (state.viewport) {
			if (!_cachedResult.viewport) {
				_cachedResult.viewport = { zoom: 1, panX: 0, panY: 0 }
			}
			_cachedResult.viewport.zoom = state.viewport.zoom
			_cachedResult.viewport.panX = state.viewport.panX
			_cachedResult.viewport.panY = state.viewport.panY
		}
		// ===== 2026-08-03 修复：缓存路径必须同步所有节点的设置字段（model3dSettings, resourceId 等），
		// 否则当结构不变（仅 settings/resource 变化）时，引擎端 BlueprintNode.data 永远读不到最新值。
		for (const nodeId of state.nodeOrder) {
			const wfNode = state.nodesById[nodeId]
			const cachedNode = _cachedResult.nodesById[nodeId]
			if (wfNode && cachedNode) {
				cachedNode.worldX = wfNode.worldX
				cachedNode.worldY = wfNode.worldY
				cachedNode.x = wfNode.worldX
				cachedNode.y = wfNode.worldY
				cachedNode.width = wfNode.width
				cachedNode.height = wfNode.height
				cachedNode.sizeCustomized = wfNode.sizeCustomized
				cachedNode.title = wfNode.title
				cachedNode.subtitle = wfNode.subtitle
				cachedNode.status = (wfNode as any).status ?? cachedNode.status
				cachedNode.nodeChatDraft = (wfNode as any).nodeChatDraft
				cachedNode.nodeChatParams = (wfNode as any).nodeChatParams
				cachedNode.nodeChatSelectedRefs = (wfNode as any).nodeChatSelectedRefs
				cachedNode.nodeChatVisible = (wfNode as any).nodeChatVisible
				cachedNode.textValue = (wfNode as any).textValue
				// ===== 新增：同步所有节点的 settings 字段（SSOT → 引擎的关键）=====
				if ('resourceId' in wfNode) cachedNode.resourceId = wfNode.resourceId ?? undefined
				if ('resourcePath' in wfNode) {
					;(cachedNode as any).resourcePath = (wfNode as any).resourcePath ?? undefined
				}
				if ('imageSettings' in wfNode) cachedNode.imageSettings = (wfNode as any).imageSettings
				if ('videoSettings' in wfNode) cachedNode.videoSettings = (wfNode as any).videoSettings
				if ('model3dSettings' in wfNode) cachedNode.model3dSettings = (wfNode as any).model3dSettings
				if ('meshySettings' in wfNode) cachedNode.meshySettings = (wfNode as any).meshySettings
				if ('tripo3dSettings' in wfNode) cachedNode.tripo3dSettings = (wfNode as any).tripo3dSettings
				if ('blenderSettings' in wfNode) cachedNode.blenderSettings = (wfNode as any).blenderSettings
				if ('storySettings' in wfNode) cachedNode.storySettings = (wfNode as any).storySettings
				if ('sceneUnderstandingSettings' in wfNode)
					cachedNode.sceneUnderstandingSettings = (wfNode as any).sceneUnderstandingSettings
				if ('sceneLayoutSettings' in wfNode)
					cachedNode.sceneLayoutSettings = (wfNode as any).sceneLayoutSettings
				if ('sceneDecomposeSettings' in wfNode)
					cachedNode.sceneDecomposeSettings = (wfNode as any).sceneDecomposeSettings
				if ('unrealExportSettings' in wfNode)
					cachedNode.unrealExportSettings = (wfNode as any).unrealExportSettings
				if ('comfyuiSettings' in wfNode) cachedNode.comfyuiSettings = (wfNode as any).comfyuiSettings
			}
		}
		// ===== 新增：同步所有资源（resource）数据到缓存，确保 legacyResourcesForDom 计算属性能拿到最新值 =====
		for (const resId of state.resourceOrder) {
			const wfRes = state.resourcesById[resId]
			if (wfRes && _cachedResult.resourcesById) {
				_cachedResult.resourcesById[resId] = convertWorkflowResourceToLegacy(wfRes)
			}
		}
		_cachedResult.savedAt = Date.now()
		return _cachedResult
	}

	const nodesById: Record<string, BlueprintNodeData> = {}
	for (const nodeId of state.nodeOrder) {
		const node = state.nodesById[nodeId]
		if (node) {
			nodesById[nodeId] = convertWorkflowNodeToLegacy(node)
		}
	}

	const edgesById: Record<string, ConnectionData> = {}
	for (const edgeId of state.edgeOrder) {
		const edge = state.edgesById[edgeId]
		if (edge) {
			edgesById[edgeId] = {
				id: edge.id,
				fromNodeId: edge.fromNodeId,
				fromAnchorId: edge.fromAnchorId,
				toNodeId: edge.toNodeId,
				toAnchorId: edge.toAnchorId,
				createdAt: edge.createdAt
			}
		}
	}

	const resourcesById: Record<string, LegacyResourceData> = {}
	for (const resId of state.resourceOrder) {
		const res = state.resourcesById[resId]
		if (res) {
			resourcesById[resId] = convertWorkflowResourceToLegacy(res)
		}
	}

	const savedSelectionFrames: SavedSelectionFrameData[] = []
	if (state.savedSelectionFrames) {
		for (const frame of state.savedSelectionFrames) {
			savedSelectionFrames.push({
				id: frame.id,
				nodeIds: [...frame.nodeIds],
				label: frame.label,
				createdAt: frame.createdAt ?? Date.now()
			})
		}
	}

	const result: LegacyBlueprintData = {
		schemaVersion: LEGACY_SCHEMA_VERSION,
		savedAt: Date.now(),
		viewport: state.viewport ? { ...state.viewport } : { zoom: 1, panX: 0, panY: 0 },
		nodesById,
		nodeOrder: [...state.nodeOrder],
		edgesById,
		edgeOrder: [...state.edgeOrder],
		resourcesById,
		resourceOrder: [...state.resourceOrder],
		selectedNodeId: state.selectedNodeId,
		selectedNodeIds: state.selectedNodeIds ? [...state.selectedNodeIds] : undefined,
		selectionTagsByKey: state.selectionTagsByKey ? { ...state.selectionTagsByKey } : {},
		savedSelectionFrames,
		nodeCheckboxVisible: state.nodeCheckboxVisible
	}

	_cachedResult = result
	_cacheKey = structureKey
	return result
}

export function invalidateWorkflowStateCache(): void {
	_cachedResult = null
	_cacheKey = ''
}

export function legacyBlueprintToWorkflowState(
	legacy: LegacyBlueprintData,
	existingNodesById?: Record<string, WorkflowNode>
): Partial<WorkflowState> {
	const nodesById: Record<string, WorkflowNode> = {}
	for (const nodeId of legacy.nodeOrder || Object.keys(legacy.nodesById || {})) {
		const legacyNode = legacy.nodesById[nodeId]
		if (legacyNode) {
			nodesById[nodeId] = convertLegacyNodeToWorkflow(legacyNode, existingNodesById?.[nodeId])
		}
	}

	const edgesById: Record<string, WorkflowEdge> = {}
	for (const edgeId of legacy.edgeOrder || Object.keys(legacy.edgesById || {})) {
		const legacyEdge = legacy.edgesById[edgeId]
		if (legacyEdge) {
			edgesById[edgeId] = {
				id: legacyEdge.id,
				fromNodeId: legacyEdge.fromNodeId,
				fromAnchorId: legacyEdge.fromAnchorId,
				toNodeId: legacyEdge.toNodeId,
				toAnchorId: legacyEdge.toAnchorId,
				createdAt: legacyEdge.createdAt ?? Date.now()
			}
		}
	}

	const resourcesById: Record<string, WorkflowResource> = {}
	for (const resId of legacy.resourceOrder || Object.keys(legacy.resourcesById || {})) {
		const legacyRes = legacy.resourcesById[resId]
		if (legacyRes) {
			resourcesById[resId] = convertLegacyResourceToWorkflow(legacyRes)
		}
	}

	const savedSelectionFrames: SavedSelectionFrame[] = []
	if (legacy.savedSelectionFrames) {
		for (const frame of legacy.savedSelectionFrames) {
			savedSelectionFrames.push({
				id: frame.id,
				nodeIds: [...frame.nodeIds],
				label: frame.label,
				createdAt: frame.createdAt ?? Date.now()
			})
		}
	}

	return {
		viewport: legacy.viewport ? { ...legacy.viewport } : { zoom: 1, panX: 0, panY: 0 },
		nodesById,
		nodeOrder: [...(legacy.nodeOrder || Object.keys(nodesById))],
		edgesById,
		edgeOrder: [...(legacy.edgeOrder || Object.keys(edgesById))],
		resourcesById,
		resourceOrder: [...(legacy.resourceOrder || Object.keys(resourcesById))],
		selectedNodeId: legacy.selectedNodeId ?? null,
		selectedNodeIds: legacy.selectedNodeIds
			? [...legacy.selectedNodeIds]
			: legacy.selectedNodeId
				? [legacy.selectedNodeId]
				: [],
		savedSelectionFrames,
		nodeCheckboxVisible: legacy.nodeCheckboxVisible
	}
}

function convertAnchorToLegacy(a: WorkflowAnchorSpec): PortSpec {
	return {
		id: a.id,
		label: a.label,
		offsetY: a.offsetY,
		mediaType: a.mediaType as any,
		acceptedMediaTypes: a.acceptedMediaTypes as any,
		multiInput: a.multiInput
	}
}

function convertAnchorToWorkflow(a: PortSpec): WorkflowAnchorSpec {
	return {
		id: a.id,
		label: a.label,
		offsetY: a.offsetY,
		mediaType: a.mediaType as any,
		acceptedMediaTypes: a.acceptedMediaTypes as any,
		multiInput: a.multiInput
	}
}

function convertWorkflowNodeToLegacy(node: WorkflowNode): BlueprintNodeData {
	return {
		id: node.id,
		type: node.type,
		title: node.title,
		subtitle: node.subtitle,
		alias: node.alias,
		worldX: node.worldX,
		worldY: node.worldY,
		x: node.worldX,
		y: node.worldY,
		width: node.width,
		height: node.height,
		sizeCustomized: node.sizeCustomized,
		inputs: node.inputs ? node.inputs.map(convertAnchorToLegacy) : [],
		outputs: node.outputs ? node.outputs.map(convertAnchorToLegacy) : [],
		resourceId: node.resourceId ?? undefined,
		textValue: (node as any).textValue,
		imageSettings: (node as any).imageSettings,
		videoSettings: (node as any).videoSettings,
		model3dSettings: (node as any).model3dSettings,
		meshySettings: (node as any).meshySettings,
		tripo3dSettings: (node as any).tripo3dSettings,
		blenderSettings: (node as any).blenderSettings,
		storySettings: (node as any).storySettings,
		sceneUnderstandingSettings: (node as any).sceneUnderstandingSettings,
		sceneLayoutSettings: (node as any).sceneLayoutSettings,
		sceneDecomposeSettings: (node as any).sceneDecomposeSettings,
		unrealExportSettings: (node as any).unrealExportSettings,
		comfyuiSettings: (node as any).comfyuiSettings,
		nodeChatDraft: (node as any).nodeChatDraft,
		nodeChatParams: (node as any).nodeChatParams,
		nodeChatSelectedRefs: (node as any).nodeChatSelectedRefs,
		nodeChatVisible: (node as any).nodeChatVisible,
		createdAt: node.createdAt,
		status: (node as any).status
	}
}

function convertLegacyNodeToWorkflow(
	legacyNode: BlueprintNodeData,
	existingNode?: WorkflowNode
): WorkflowNode {
	const wx = (legacyNode as any).x ?? legacyNode.worldX ?? 0
	const wy = (legacyNode as any).y ?? legacyNode.worldY ?? 0
	const node: WorkflowNode = {
		id: legacyNode.id,
		type: legacyNode.type,
		title: legacyNode.title,
		subtitle: legacyNode.subtitle,
		alias: legacyNode.alias,
		worldX: wx,
		worldY: wy,
		width: legacyNode.width,
		height: legacyNode.height,
		sizeCustomized: legacyNode.sizeCustomized,
		inputs: legacyNode.inputs ? legacyNode.inputs.map(convertAnchorToWorkflow) : [],
		outputs: legacyNode.outputs ? legacyNode.outputs.map(convertAnchorToWorkflow) : [],
		resourceId: legacyNode.resourceId ?? null,
		createdAt: legacyNode.createdAt ?? Date.now()
	} as WorkflowNode

	if (legacyNode.textValue !== undefined) (node as any).textValue = legacyNode.textValue
	if (legacyNode.imageSettings !== undefined) (node as any).imageSettings = legacyNode.imageSettings
	if (legacyNode.videoSettings !== undefined) (node as any).videoSettings = legacyNode.videoSettings
	if (legacyNode.model3dSettings !== undefined)
		(node as any).model3dSettings = legacyNode.model3dSettings
	if (legacyNode.meshySettings !== undefined) (node as any).meshySettings = legacyNode.meshySettings
	if (legacyNode.tripo3dSettings !== undefined)
		(node as any).tripo3dSettings = legacyNode.tripo3dSettings
	if (legacyNode.blenderSettings !== undefined)
		(node as any).blenderSettings = legacyNode.blenderSettings
	if (legacyNode.storySettings !== undefined) (node as any).storySettings = legacyNode.storySettings
	if (legacyNode.sceneUnderstandingSettings !== undefined)
		(node as any).sceneUnderstandingSettings = legacyNode.sceneUnderstandingSettings
	if (legacyNode.sceneLayoutSettings !== undefined)
		(node as any).sceneLayoutSettings = legacyNode.sceneLayoutSettings
	if (legacyNode.sceneDecomposeSettings !== undefined)
		(node as any).sceneDecomposeSettings = legacyNode.sceneDecomposeSettings
	if (legacyNode.unrealExportSettings !== undefined)
		(node as any).unrealExportSettings = legacyNode.unrealExportSettings
	if (legacyNode.comfyuiSettings !== undefined)
		(node as any).comfyuiSettings = legacyNode.comfyuiSettings

	const incomingDraft = legacyNode.nodeChatDraft
	const hasIncomingDraft = typeof incomingDraft === 'string' && incomingDraft.length > 0
	const existingDraft = (existingNode as any)?.nodeChatDraft
	const hasExistingDraft = typeof existingDraft === 'string' && existingDraft.length > 0
	if (hasIncomingDraft || !hasExistingDraft) {
		if (incomingDraft !== undefined) (node as any).nodeChatDraft = incomingDraft
	} else {
		;(node as any).nodeChatDraft = existingDraft
	}

	const incomingParams = legacyNode.nodeChatParams
	const hasIncomingParams =
		!!incomingParams && typeof incomingParams === 'object' && Object.keys(incomingParams).length > 0
	const existingParams = (existingNode as any)?.nodeChatParams
	const hasExistingParams =
		!!existingParams && typeof existingParams === 'object' && Object.keys(existingParams).length > 0
	if (hasIncomingParams || !hasExistingParams) {
		if (incomingParams !== undefined) (node as any).nodeChatParams = incomingParams
	} else {
		;(node as any).nodeChatParams = existingParams
	}

	const incomingRefs = legacyNode.nodeChatSelectedRefs
	const hasIncomingRefs = Array.isArray(incomingRefs) && incomingRefs.length > 0
	const existingRefs = (existingNode as any)?.nodeChatSelectedRefs
	const hasExistingRefs = Array.isArray(existingRefs) && existingRefs.length > 0
	if (hasIncomingRefs || !hasExistingRefs) {
		if (incomingRefs !== undefined) (node as any).nodeChatSelectedRefs = incomingRefs
	} else {
		;(node as any).nodeChatSelectedRefs = existingRefs
	}

	if (legacyNode.nodeChatVisible !== undefined)
		(node as any).nodeChatVisible = legacyNode.nodeChatVisible
	if (legacyNode.status !== undefined) (node as any).status = legacyNode.status

	return node
}

function convertWorkflowResourceToLegacy(res: WorkflowResource): LegacyResourceData {
	return {
		id: res.id,
		kind: res.kind,
		name: res.name,
		url: res.url,
		projectRelativePath: res.projectRelativePath,
		previewUrl: res.previewUrl,
		previewProjectRelativePath: res.previewProjectRelativePath,
		previewVersion: res.previewVersion,
		posterUrl: res.posterUrl,
		posterProjectRelativePath: res.posterProjectRelativePath,
		posterSourcePath: res.posterSourcePath,
		sourcePath: res.sourcePath,
		sourceFingerprint: res.sourceFingerprint,
		sourceName: res.sourceName,
		sourceSize: res.sourceSize,
		sourceLastModified: res.sourceLastModified,
		localFileKey: res.localFileKey,
		createdAt: res.createdAt,
		// ===== 2026-08-03 修复：显式透传 absolutePath / relativePath / size，
		// 供 NodeComponentResolver.resolveResourceProps 读取 resourceAbsolutePath 等 props
		absolutePath: (res as any).absolutePath ?? undefined,
		relativePath: (res as any).relativePath ?? undefined,
		size: (res as any).size ?? res.sourceSize
	}
}

function convertLegacyResourceToWorkflow(legacyRes: LegacyResourceData): WorkflowResource {
	return {
		id: legacyRes.id,
		kind: legacyRes.kind as any,
		name: legacyRes.name,
		url: legacyRes.url,
		projectRelativePath: legacyRes.projectRelativePath ?? legacyRes.relativePath ?? undefined,
		previewUrl: legacyRes.previewUrl ?? undefined,
		previewProjectRelativePath: legacyRes.previewProjectRelativePath ?? undefined,
		previewVersion: legacyRes.previewVersion ?? undefined,
		posterUrl: legacyRes.posterUrl ?? undefined,
		posterProjectRelativePath: legacyRes.posterProjectRelativePath ?? undefined,
		posterSourcePath: legacyRes.posterSourcePath ?? undefined,
		sourcePath: legacyRes.sourcePath ?? legacyRes.absolutePath ?? undefined,
		sourceFingerprint: legacyRes.sourceFingerprint ?? undefined,
		sourceName: legacyRes.sourceName ?? undefined,
		sourceSize: legacyRes.sourceSize ?? legacyRes.size ?? undefined,
		sourceLastModified: legacyRes.sourceLastModified ?? undefined,
		localFileKey: legacyRes.localFileKey ?? undefined,
		createdAt: legacyRes.createdAt ?? Date.now()
	}
}
