import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'
import type {
	WorkflowEdge,
	WorkflowAnchorSpec,
	WorkflowImageCrop,
	WorkflowNode,
	WorkflowPixelRect,
	WorkflowSceneDecomposeNodeSettings,
	WorkflowSceneDecomposeOutput,
	WorkflowSceneLayoutManualModelBinding,
	WorkflowSceneLayoutLightingControls,
	WorkflowSceneLayoutNodeSettings,
	WorkflowSceneLayoutOrientationFix,
	WorkflowUnrealExportNodeSettings,
	WorkflowSceneUnderstandingNodeSettings,
	WorkflowState,
	WorkflowViewport,
	WorkflowStoryBranch,
	WorkflowComfyUINodeSettings,
	WorkflowModel3DNodeSettings,
	WorkflowMeshyNodeSettings,
	WorkflowMeshyTaskFamily,
	WorkflowMeshyTaskTarget,
	WorkflowNodeChatType,
	WorkflowNodeChatParams,
	WorkflowNodeChatSubmitPayload,
} from '../../aiworkflow/types'
import type { WorkflowResource, ResourceKind } from '../../aiworkflow/resource/types'
import { canLinkAnchors, normalizeAnchorMediaType } from '../../aiworkflow/domain/link/anchorKinds'

const clamp = (v: unknown, min: number, max: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const clampZoom = (v: unknown) => {
	// 与 BlueprintCanvas 的交互 clamp 保持一致
	const n = Number(v)
	if (!Number.isFinite(n)) return 1
	return Math.max(0.2, Math.min(6, n))
}

const normalizeSceneLayoutLightingControls = (raw: any): WorkflowSceneLayoutLightingControls => {
	const clampControl = (value: unknown, min: number, max: number, fallback: number) => {
		const num = Number(value)
		if (!Number.isFinite(num)) return fallback
		return Math.max(min, Math.min(max, num))
	}
	return {
		masterIntensity: clampControl(raw?.masterIntensity, 0, 2.5, 1),
		exposure: clampControl(raw?.exposure, 0.4, 2.5, 1),
		ambient: clampControl(raw?.ambient, 0, 2.5, 1),
		hemisphere: clampControl(raw?.hemisphere, 0, 2.5, 1),
		directional: clampControl(raw?.directional, 0, 2.5, 1),
		point: clampControl(raw?.point, 0, 2.5, 1),
		spot: clampControl(raw?.spot, 0, 2.5, 1),
		rectArea: clampControl(raw?.rectArea, 0, 2.5, 1),
	}
}

export const createDefaultAIWorkflowState = (): WorkflowState => {
	const demo: WorkflowNode = {
		id: 'demo',
		type: 'base',
		title: '工作流节点（示意）',
		alias: '工作流节点',
		subtitle: '入口参数 / 出口结果',
		worldX: 120,
		worldY: -40,
		width: 240,
		height: 160,
		sizeCustomized: false,
		resourceId: null,
		inputs: [{ id: 'in-0', label: '入口' }],
		outputs: [{ id: 'out-0', label: '出口' }],
		createdAt: Date.now(),
	}
	return {
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById: { [demo.id]: demo },
		nodeOrder: [demo.id],
		edgesById: {},
		edgeOrder: [],
		resourcesById: {},
		resourceOrder: [],
		selectedNodeId: demo.id,
		selectedNodeIds: [demo.id],
		selectedEdgeId: null,
		clipboardNode: null,
		clipboardNodes: null,
		clipboardPrimaryNodeId: null,
		chatDraft: '',
		nodeChatDialog: {
			visible: false,
			nodeId: null,
			nodeType: null,
			draft: '',
			submitting: false,
			params: {},
		},
	}
}

const uniq = <T>(arr: T[]) => Array.from(new Set(arr))

const normalizeNodeIds = (state: WorkflowState, ids: string[]) => {
	const out: string[] = []
	for (const id of ids) {
		if (typeof id !== 'string') continue
		const key = id.trim()
		if (!key) continue
		if (!state.nodesById[key]) continue
		out.push(key)
	}
	return uniq(out)
}

const makeId = (prefix: string) => {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultAliasForType = (type: string) => {
	switch (type) {
		case 'text':
			return '文本节点'
		case 'text-merge':
			return '文本整合节点'
		case 'image':
			return '图片节点'
		case 'rotate-image':
			return '旋转图片节点'
		case 'video':
			return '视频节点'
		case 'scene-understanding':
			return '场景理解节点'
		case 'scene-decompose':
			return '场景分解节点'
		case 'scene-layout':
			return '场景布局节点'
		case 'unreal-export':
			return '虚幻导出节点'
		case 'story':
			return '剧情节点'
		case 'comfyui':
			return 'ComfyUI 节点'
		case 'model3d':
			return '3D模型节点'
		case 'meshy':
			return 'Meshy模型生成节点'
		case 'base':
		default:
			return '工作流节点'
	}
}

const normalizeMediaType = (
	v: any,
	context: { node?: WorkflowNode; nodeType?: string; anchorId?: string } = {},
): WorkflowAnchorSpec['mediaType'] | undefined => normalizeAnchorMediaType(v, context)

const isSingleIOBaseNodeType = (type: string): type is 'text' | 'image' | 'video' | 'model3d' => (
	type === 'text' || type === 'image' || type === 'video' || type === 'model3d'
)

const singleIOAnchorsForNodeType = (type: string): { inputs: WorkflowAnchorSpec[]; outputs: WorkflowAnchorSpec[] } | null => {
	if (type === 'text') {
		return {
			inputs: [{ id: 'in-0', label: '输入', mediaType: 'text', multiInput: true }],
			outputs: [{ id: 'out-0', label: '文本输出', mediaType: 'text' }],
		}
	}
	if (type === 'image') {
		return {
			inputs: [{ id: 'in-0', label: '图片输入', multiInput: true }],
			outputs: [{ id: 'out-0', label: '图片输出', mediaType: 'image' }],
		}
	}
	if (type === 'video') {
		return {
			inputs: [{ id: 'in-0', label: '视频输入', multiInput: true }],
			outputs: [{ id: 'out-0', label: '视频输出', mediaType: 'video' }],
		}
	}
	if (type === 'model3d') {
		return {
			inputs: [{ id: 'in-0', label: '模型输入', multiInput: true }],
			outputs: [{ id: 'out-0', label: '模型输出', mediaType: 'model3d' }],
		}
	}
	return null
}

const enforceSingleIOAnchors = (node: WorkflowNode) => {
	if (!isSingleIOBaseNodeType(String(node?.type ?? ''))) return
	const next = singleIOAnchorsForNodeType(String(node.type ?? ''))
	if (!next) return
	node.inputs = next.inputs
	node.outputs = next.outputs
}

const remapLegacyInputAnchorId = (nodeType: string, anchorId: string) => {
	const nextType = String(nodeType ?? '').trim()
	const nextAnchorId = String(anchorId ?? '').trim()
	if (!nextAnchorId) return nextAnchorId
	if (nextType === 'image') {
		if (nextAnchorId === 'in-resource' || nextAnchorId === 'in-image') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'video') {
		if (nextAnchorId === 'in-video') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'text') {
		if (nextAnchorId === 'in-text') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'model3d') {
		if (nextAnchorId === 'in-model') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'rotate-image') {
		if (nextAnchorId === 'in-image') return 'in-0'
		return nextAnchorId
	}
	return nextAnchorId
}

const remapLegacyOutputAnchorId = (nodeType: string, anchorId: string) => {
	const nextType = String(nodeType ?? '').trim()
	const nextAnchorId = String(anchorId ?? '').trim()
	if (!nextAnchorId) return nextAnchorId
	if (nextType === 'image') {
		if (nextAnchorId === 'out-image') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'video') {
		if (nextAnchorId === 'out-video') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'text') {
		if (nextAnchorId === 'out-text') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'model3d') {
		if (nextAnchorId === 'out-model' || nextAnchorId === 'out-render') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'rotate-image') {
		if (nextAnchorId === 'out-image') return 'out-0'
		if (nextAnchorId === 'out-text') return 'out-text'
		return nextAnchorId
	}
	if (nextType === 'scene-understanding') {
		if (nextAnchorId === 'out-json' || nextAnchorId === 'out-lighting-json') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'scene-layout') {
		if (nextAnchorId === 'out-json') return 'out-0'
		return nextAnchorId
	}
	return nextAnchorId
}

const hasAnchor = (node: WorkflowNode, direction: 'in' | 'out', anchorId: string) => {
	const list = direction === 'in' ? node.inputs : node.outputs
	return Array.isArray(list) && list.some((a) => a.id === anchorId)
}

const pruneInvalidEdgesForNode = (state: WorkflowState, nodeId: string) => {
	const id = String(nodeId ?? '').trim()
	if (!id) return
	const removeIds: string[] = []
	for (const edgeId of state.edgeOrder) {
		const e = state.edgesById[edgeId]
		if (!e) continue
		if (e.fromNodeId !== id && e.toNodeId !== id) continue
		const fromNode = state.nodesById[e.fromNodeId]
		const toNode = state.nodesById[e.toNodeId]
		if (!fromNode || !toNode) {
			removeIds.push(edgeId)
			continue
		}
		if (!hasAnchor(fromNode, 'out', e.fromAnchorId) || !hasAnchor(toNode, 'in', e.toAnchorId)) {
			removeIds.push(edgeId)
		}
	}
	for (const edgeId of removeIds) {
		delete state.edgesById[edgeId]
	}
	if (removeIds.length) {
		state.edgeOrder = state.edgeOrder.filter((edgeId) => !removeIds.includes(edgeId))
		if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
	}
}

const STORY_BRANCH_ROW = 32
const STORY_BRANCH_GAP = 6
const STORY_BRANCH_PAD = 8
const STORY_INPUT_SIZE = 9
const STORY_INPUT_GAP = 6
const NODE_PADDING_BOTTOM = 10

const storyBranchOffset = (index: number, count: number, height: number) => {
	const rows = Math.max(1, count)
	const footerHeight = STORY_BRANCH_PAD * 2 + rows * STORY_BRANCH_ROW + (rows - 1) * STORY_BRANCH_GAP
	const footerTop = height / 2 - NODE_PADDING_BOTTOM - footerHeight
	return footerTop + STORY_BRANCH_PAD + STORY_BRANCH_ROW / 2 + index * (STORY_BRANCH_ROW + STORY_BRANCH_GAP)
}

const ensureStoryBranches = (node: WorkflowNode) => {
	if (!node.branches || !node.branches.length) {
		node.branches = [{ id: makeId('branch'), text: '剧情分支' }]
	}
}

const ensureTextMergeItems = (node: WorkflowNode) => {
	const raw = (node as any).textMergeItems
	if (!Array.isArray(raw)) {
		;(node as any).textMergeItems = [{ id: makeId('merge') }]
		return
	}
	// allow empty list, but normalize shape
	;(node as any).textMergeItems = raw
		.map((x: any) => ({ id: String(x?.id ?? '').trim() }))
		.filter((x: any) => x.id)
}

const syncTextMergeAnchors = (node: WorkflowNode) => {
	ensureTextMergeItems(node)
	const items = Array.isArray((node as any).textMergeItems) ? (node as any).textMergeItems : []
	node.inputs = items.map((it: any, idx: number) => ({
		id: `in-${String(it.id)}`,
		label: `拼接${idx + 1}`,
		mediaType: 'text',
	}))
	node.outputs = [{ id: 'out-text', label: '整合文本', mediaType: 'text' }]
}

const syncStoryAnchors = (node: WorkflowNode) => {
	ensureStoryBranches(node)
	const height = Number.isFinite(node.height) ? node.height : 160
	const inputOffset = (STORY_INPUT_SIZE + STORY_INPUT_GAP) / 2
	node.inputs = [
		{ id: 'in-flow', label: '剧情流程', offsetY: -inputOffset, mediaType: 'flow' },
		{ id: 'in-resource', label: '资源来源', offsetY: inputOffset },
	]
	node.outputs = node.branches!.map((b, idx) => ({
		id: `out-${b.id}`,
		label: b.text ? b.text : `分支${idx + 1}`,
		offsetY: storyBranchOffset(idx, node.branches!.length, height),
		mediaType: 'flow',
	}))
}

const COMFY_PROMPT_POSITIVE_ANCHOR_ID = 'in-positive'
const COMFY_PROMPT_NEGATIVE_ANCHOR_ID = 'in-negative'

const comfyPromptAnchors = (): WorkflowAnchorSpec[] => {
	return [
		{ id: COMFY_PROMPT_POSITIVE_ANCHOR_ID, label: '正向提示词', mediaType: 'text' },
		{ id: COMFY_PROMPT_NEGATIVE_ANCHOR_ID, label: '负向提示词', mediaType: 'text' },
	]
}

const normalizeSceneUnderstandingSettings = (rawSettings: any): WorkflowSceneUnderstandingNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	const availableModels = Array.isArray(raw.availableModels)
		? raw.availableModels
			.map((item: any) => ({
				id: String(item?.id ?? '').trim(),
				label: String(item?.label ?? item?.id ?? '').trim(),
				supportsVision: typeof item?.supportsVision === 'boolean' ? item.supportsVision : undefined,
				supportsStructuredOutput:
					typeof item?.supportsStructuredOutput === 'boolean' ? item.supportsStructuredOutput : undefined,
				recommended: typeof item?.recommended === 'boolean' ? item.recommended : undefined,
				vendor: typeof item?.vendor === 'string' ? item.vendor : undefined,
			}))
			.filter((item: any) => item.id)
		: undefined
	return {
		mode: raw.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout',
		selectedModel: typeof raw.selectedModel === 'string' ? raw.selectedModel : undefined,
		availableModels,
		status:
			raw.status === 'loading-models' || raw.status === 'running' || raw.status === 'completed' || raw.status === 'error' || raw.status === 'canceled'
				? raw.status
				: 'idle',
		message: typeof raw.message === 'string' ? raw.message : undefined,
		statusText: typeof raw.statusText === 'string' ? raw.statusText : undefined,
		progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : undefined,
		provider: typeof raw.provider === 'string' ? raw.provider : undefined,
		providerStatusText: typeof raw.providerStatusText === 'string' ? raw.providerStatusText : undefined,
		remoteStatusCode: Number.isFinite(Number(raw.remoteStatusCode)) ? Number(raw.remoteStatusCode) : undefined,
		outputJson: typeof raw.outputJson === 'string' ? raw.outputJson : undefined,
		rawOutput: typeof raw.rawOutput === 'string' ? raw.rawOutput : undefined,
		resultSummary: typeof raw.resultSummary === 'string' ? raw.resultSummary : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		lastInputImageUrl: typeof raw.lastInputImageUrl === 'string' ? raw.lastInputImageUrl : undefined,
		lastInputImageUrls: Array.isArray(raw.lastInputImageUrls)
			? raw.lastInputImageUrls.map((x: any) => String(x ?? '').trim()).filter((x: string) => !!x).slice(0, 4)
			: undefined,
		lastInputPrompt: typeof raw.lastInputPrompt === 'string' ? raw.lastInputPrompt : undefined,
		lastInputLayoutJson: typeof raw.lastInputLayoutJson === 'string' ? raw.lastInputLayoutJson : undefined,
		rewriteUsed: typeof raw.rewriteUsed === 'boolean' ? raw.rewriteUsed : undefined,
		rewriteAttempts: Number.isFinite(Number(raw.rewriteAttempts)) ? Number(raw.rewriteAttempts) : undefined,
		mock: typeof raw.mock === 'boolean' ? raw.mock : undefined,
	}
}

const normalizeSceneLayoutSettings = (rawSettings: any): WorkflowSceneLayoutNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	const normalizeOrientationFix = (fix: any): WorkflowSceneLayoutOrientationFix | undefined => {
		if (!fix || typeof fix !== 'object') return undefined
		const yaw = Number(fix.yaw)
		const pitch = Number(fix.pitch)
		const roll = Number(fix.roll)
		const updatedAt = Number(fix.updatedAt)
		return {
			mode: fix.mode === 'manual' ? 'manual' : fix.mode === 'auto' ? 'auto' : undefined,
			yaw: Number.isFinite(yaw) ? yaw : undefined,
			pitch: Number.isFinite(pitch) ? pitch : undefined,
			roll: Number.isFinite(roll) ? roll : undefined,
			confidence: fix.confidence === 'low' ? 'low' : fix.confidence === 'high' ? 'high' : undefined,
			updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
		}
	}
	const layoutItems = Array.isArray(raw.layoutItems)
		? raw.layoutItems
			.map((item: any) => ({
				id: String(item?.id ?? '').trim(),
				name: typeof item?.name === 'string' ? item.name : undefined,
				previewScaleMode: item?.previewScaleMode === 'model' ? 'model' : undefined,
				orientationFix: normalizeOrientationFix(item?.orientationFix),
				fillMode:
					item?.fillMode === 'fill-x' || item?.fillMode === 'fill-y' || item?.fillMode === 'fill-z'
						? item.fillMode
						: undefined,
				fillCount: Number.isFinite(Number(item?.fillCount)) ? Math.max(2, Math.min(32, Math.floor(Number(item.fillCount)))) : undefined,
				fillAxisScale: Number.isFinite(Number(item?.fillAxisScale)) ? Number(item.fillAxisScale) : undefined,
				fillUpdatedAt: Number.isFinite(Number(item?.fillUpdatedAt)) ? Number(item.fillUpdatedAt) : undefined,
				fitMode:
					item?.fitMode === 'normal' || item?.fitMode === 'oriented' || item?.fitMode === 'filled' || item?.fitMode === 'forced'
						? item.fitMode
						: undefined,
				fitMessage: typeof item?.fitMessage === 'string' ? item.fitMessage : undefined,
				fitUpdatedAt: Number.isFinite(Number(item?.fitUpdatedAt)) ? Number(item.fitUpdatedAt) : undefined,
				description: typeof item?.description === 'string' ? item.description : undefined,
				category: typeof item?.category === 'string' ? item.category : undefined,
				subCategory: typeof item?.subCategory === 'string' ? item.subCategory : undefined,
				material: typeof item?.material === 'string' ? item.material : undefined,
				surfaceType: typeof item?.surfaceType === 'string' ? item.surfaceType : undefined,
				color: typeof item?.color === 'string' ? item.color : undefined,
				sameTypeGroupId: typeof item?.sameTypeGroupId === 'string' ? item.sameTypeGroupId : undefined,
				sameTypeGroupLabel: typeof item?.sameTypeGroupLabel === 'string' ? item.sameTypeGroupLabel : undefined,
				isKeyElement: typeof item?.isKeyElement === 'boolean' ? item.isKeyElement : undefined,
				keyElementType: typeof item?.keyElementType === 'string' ? item.keyElementType : undefined,
				fixedInRoom: typeof item?.fixedInRoom === 'boolean' ? item.fixedInRoom : undefined,
				semanticRole: typeof item?.semanticRole === 'string' ? item.semanticRole : undefined,
				mountType: typeof item?.mountType === 'string' ? item.mountType : undefined,
				shouldTouchGround: typeof item?.shouldTouchGround === 'boolean' ? item.shouldTouchGround : undefined,
				groundReason: typeof item?.groundReason === 'string' ? item.groundReason : undefined,
				relationTags: Array.isArray(item?.relationTags)
					? item.relationTags.map((tag: any) => String(tag ?? '').trim()).filter((tag: string) => !!tag)
					: undefined,
				layoutPriority: Number.isFinite(Number(item?.layoutPriority)) ? Number(item.layoutPriority) : undefined,
				parentId: typeof item?.parentId === 'string' ? item.parentId : undefined,
				placement: typeof item?.placement === 'string' ? item.placement : undefined,
				supportSurface: typeof item?.supportSurface === 'string' ? item.supportSurface : undefined,
				anchor: typeof item?.anchor === 'string' ? item.anchor : undefined,
				wallRole: typeof item?.wallRole === 'string' ? item.wallRole : undefined,
				proximityGroupId: typeof item?.proximityGroupId === 'string' ? item.proximityGroupId : undefined,
				relationReason: typeof item?.relationReason === 'string' ? item.relationReason : undefined,
				inferred: typeof item?.inferred === 'boolean' ? item.inferred : undefined,
				sourceImageIndex: Number.isFinite(Number(item?.sourceImageIndex)) ? Math.max(1, Math.floor(Number(item.sourceImageIndex))) : undefined,
				observedImageIndices: Array.isArray(item?.observedImageIndices)
					? item.observedImageIndices
						.map((value: any) => Number(value))
						.filter((value: number) => Number.isFinite(value) && value > 0)
					: undefined,
				imageRect: normalizeWorkflowImageCrop(item?.imageRect),
				imageRectPixels: normalizeWorkflowPixelRect(item?.imageRectPixels),
				position: {
					x: Number.isFinite(Number(item?.position?.x)) ? Number(item.position.x) : 0,
					y: Number.isFinite(Number(item?.position?.y)) ? Number(item.position.y) : 0,
					z: Number.isFinite(Number(item?.position?.z)) ? Number(item.position.z) : 0,
				},
				size: {
					width: Math.max(0.05, Number(item?.size?.width) || 1),
					height: Math.max(0.05, Number(item?.size?.height) || 1),
					depth: Math.max(0.05, Number(item?.size?.depth) || 1),
				},
				rotation: item?.rotation && typeof item.rotation === 'object'
					? {
						yaw: Number.isFinite(Number(item.rotation.yaw)) ? Number(item.rotation.yaw) : undefined,
						pitch: Number.isFinite(Number(item.rotation.pitch)) ? Number(item.rotation.pitch) : undefined,
						roll: Number.isFinite(Number(item.rotation.roll)) ? Number(item.rotation.roll) : undefined,
					}
					: undefined,
				scale: item?.scale && typeof item.scale === 'object'
					? {
						x: Number.isFinite(Number(item.scale.x)) ? Number(item.scale.x) : undefined,
						y: Number.isFinite(Number(item.scale.y)) ? Number(item.scale.y) : undefined,
						z: Number.isFinite(Number(item.scale.z)) ? Number(item.scale.z) : undefined,
					}
					: undefined,
			}))
			.filter((item: any) => item.id)
		: undefined
	const manualModelBindings = Array.isArray(raw.manualModelBindings)
		? raw.manualModelBindings
			.map((item: any) => {
				const objectId = String(item?.objectId ?? '').trim()
				if (!objectId) return null
				const modelUrl = typeof item?.modelUrl === 'string' ? String(item.modelUrl).trim() : ''
				const modelAssetUrl = typeof item?.modelAssetUrl === 'string' ? String(item.modelAssetUrl).trim() : ''
				const modelSourceName = typeof item?.modelSourceName === 'string' ? String(item.modelSourceName) : undefined
				const modelSourcePath = typeof item?.modelSourcePath === 'string' ? String(item.modelSourcePath) : undefined
				const modelAssetPath = typeof item?.modelAssetPath === 'string' ? String(item.modelAssetPath) : undefined
				const modelFormat = item?.modelFormat === 'gltf' ? 'gltf' : item?.modelFormat === 'glb' ? 'glb' : undefined
				if (!modelUrl && !modelAssetUrl) return null
				return {
					objectId,
					modelUrl: modelUrl || undefined,
					modelAssetUrl: modelAssetUrl || undefined,
					modelSourceName,
					modelSourcePath,
					modelAssetPath,
					modelFormat,
				} as WorkflowSceneLayoutManualModelBinding
			})
			.filter((item: WorkflowSceneLayoutManualModelBinding | null): item is WorkflowSceneLayoutManualModelBinding => Boolean(item))
		: undefined
	const normalizedLayoutIds = new Set((layoutItems ?? []).map((item: any) => String(item?.id ?? '').trim()).filter(Boolean))
	const selectedLayoutItemId = String(raw.selectedLayoutItemId ?? '').trim()
	const selectedPlaceholderOutput = String(raw.selectedPlaceholderOutput ?? '').trim()
	const lightingControls = normalizeSceneLayoutLightingControls(raw.lightingControls)
	return {
		status: raw.status === 'running' || raw.status === 'completed' || raw.status === 'error' ? raw.status : 'idle',
		message: typeof raw.message === 'string' ? raw.message : undefined,
		inputJson: typeof raw.inputJson === 'string' ? raw.inputJson : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		previewMode: raw.previewMode === true,
		lightingPreviewEnabled: raw.lightingPreviewEnabled === true,
		lightingDebugEnabled: raw.lightingDebugEnabled === true,
		lightingControls,
		hidePlaceholderCubes: raw.hidePlaceholderCubes === true,
		selectedLayoutItemId:
			selectedLayoutItemId && normalizedLayoutIds.has(selectedLayoutItemId) && raw.hidePlaceholderCubes !== true
				? selectedLayoutItemId
				: undefined,
		selectedPlaceholderOutput:
			selectedPlaceholderOutput && normalizedLayoutIds.has(selectedPlaceholderOutput)
				? selectedPlaceholderOutput
				: undefined,
		layoutItems,
		manualModelBindings,
		camera: raw.camera && typeof raw.camera === 'object'
			? {
				position: raw.camera.position && typeof raw.camera.position === 'object'
					? {
						x: Number.isFinite(Number(raw.camera.position.x)) ? Number(raw.camera.position.x) : 0,
						y: Number.isFinite(Number(raw.camera.position.y)) ? Number(raw.camera.position.y) : 0,
						z: Number.isFinite(Number(raw.camera.position.z)) ? Number(raw.camera.position.z) : 0,
					}
					: undefined,
				target: raw.camera.target && typeof raw.camera.target === 'object'
					? {
						x: Number.isFinite(Number(raw.camera.target.x)) ? Number(raw.camera.target.x) : 0,
						y: Number.isFinite(Number(raw.camera.target.y)) ? Number(raw.camera.target.y) : 0,
						z: Number.isFinite(Number(raw.camera.target.z)) ? Number(raw.camera.target.z) : 0,
					}
					: undefined,
			}
			: undefined,
	}
}

const sanitizeSceneLayoutSettings = (settings: WorkflowSceneLayoutNodeSettings | undefined): WorkflowSceneLayoutNodeSettings | undefined => {
	if (!settings) return settings
	const layoutItems = Array.isArray(settings.layoutItems)
		? settings.layoutItems.map((item) => {
			const fix = item?.orientationFix && typeof item.orientationFix === 'object' ? item.orientationFix : undefined
			const fillMode =
				item?.fillMode === 'fill-x' || item?.fillMode === 'fill-y' || item?.fillMode === 'fill-z'
					? item.fillMode
					: undefined
			const fillCount = Number(item?.fillCount)
			const fillAxisScale = Number(item?.fillAxisScale)
			const fillUpdatedAt = Number(item?.fillUpdatedAt)
			const fitMode =
				item?.fitMode === 'normal' || item?.fitMode === 'oriented' || item?.fitMode === 'filled' || item?.fitMode === 'forced'
					? item.fitMode
					: undefined
			const fitUpdatedAt = Number(item?.fitUpdatedAt)
			const nextFill = {
				fillMode,
				fillCount: fillMode && Number.isFinite(fillCount) ? Math.max(2, Math.min(32, Math.floor(fillCount))) : undefined,
				fillAxisScale: fillMode && Number.isFinite(fillAxisScale) ? fillAxisScale : undefined,
				fillUpdatedAt: fillMode && Number.isFinite(fillUpdatedAt) ? fillUpdatedAt : undefined,
				fitMode,
				fitMessage: fitMode && typeof item?.fitMessage === 'string' ? item.fitMessage : undefined,
				fitUpdatedAt: fitMode && Number.isFinite(fitUpdatedAt) ? fitUpdatedAt : undefined,
			}
			if (!fix) {
				return {
					...item,
					...nextFill,
				}
			}
			const yaw = Number(fix.yaw)
			const pitch = Number(fix.pitch)
			const roll = Number(fix.roll)
			const updatedAt = Number(fix.updatedAt)
			return {
				...item,
				...nextFill,
				orientationFix: {
					mode: fix.mode === 'manual' ? 'manual' : fix.mode === 'auto' ? 'auto' : undefined,
					yaw: Number.isFinite(yaw) ? yaw : undefined,
					pitch: Number.isFinite(pitch) ? pitch : undefined,
					roll: Number.isFinite(roll) ? roll : undefined,
					confidence: fix.confidence === 'low' ? 'low' : fix.confidence === 'high' ? 'high' : undefined,
					updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
				},
			}
		})
		: []
	const validIds = new Set(layoutItems.map((item) => String(item?.id ?? '').trim()).filter(Boolean))
	const nextManualBindingsMap = new Map<string, WorkflowSceneLayoutManualModelBinding>()
	for (const item of Array.isArray(settings.manualModelBindings) ? settings.manualModelBindings : []) {
		const objectId = String(item?.objectId ?? '').trim()
		if (!objectId || !validIds.has(objectId)) continue
		const modelUrl = String(item?.modelUrl ?? '').trim()
		const modelAssetUrl = String(item?.modelAssetUrl ?? '').trim()
		if (!modelUrl && !modelAssetUrl) continue
		nextManualBindingsMap.set(objectId, {
			objectId,
			modelUrl: modelUrl || undefined,
			modelAssetUrl: modelAssetUrl || undefined,
			modelSourceName: typeof item?.modelSourceName === 'string' ? item.modelSourceName : undefined,
			modelSourcePath: typeof item?.modelSourcePath === 'string' ? item.modelSourcePath : undefined,
			modelAssetPath: typeof item?.modelAssetPath === 'string' ? item.modelAssetPath : undefined,
			modelFormat: item?.modelFormat === 'gltf' ? 'gltf' : item?.modelFormat === 'glb' ? 'glb' : undefined,
		})
	}
	const manualModelBindings = nextManualBindingsMap.size ? Array.from(nextManualBindingsMap.values()) : undefined
	const selectedLayoutItemId = String(settings.selectedLayoutItemId ?? '').trim()
	const selectedPlaceholderOutput = String(settings.selectedPlaceholderOutput ?? '').trim()
	const hidePlaceholderCubes = settings.hidePlaceholderCubes === true
	const lightingControls = normalizeSceneLayoutLightingControls(settings.lightingControls)
	return {
		...settings,
		hidePlaceholderCubes,
		lightingControls,
		manualModelBindings,
		selectedLayoutItemId:
			!hidePlaceholderCubes && selectedLayoutItemId && validIds.has(selectedLayoutItemId)
				? selectedLayoutItemId
				: undefined,
		selectedPlaceholderOutput:
			selectedPlaceholderOutput && validIds.has(selectedPlaceholderOutput)
				? selectedPlaceholderOutput
				: undefined,
	}
}

const normalizeUnrealExportSettings = (rawSettings: any): WorkflowUnrealExportNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	const sessionRaw = raw.connectedSession && typeof raw.connectedSession === 'object' ? raw.connectedSession : null
	const sessionId = String(sessionRaw?.sessionId ?? '').trim()
	return {
		connectionStatus:
			raw.connectionStatus === 'waiting' || raw.connectionStatus === 'connected' || raw.connectionStatus === 'exporting' || raw.connectionStatus === 'error'
				? raw.connectionStatus
				: 'idle',
		statusText: typeof raw.statusText === 'string' ? raw.statusText : undefined,
		message: typeof raw.message === 'string' ? raw.message : undefined,
		targetSessionId: typeof raw.targetSessionId === 'string' ? raw.targetSessionId : undefined,
		lastExportMode: raw.lastExportMode === 'lighting-only' ? 'lighting-only' : raw.lastExportMode === 'scene-layout' ? 'scene-layout' : undefined,
		connectedSession: sessionId
			? {
				sessionId,
				displayName: typeof sessionRaw?.displayName === 'string' ? sessionRaw.displayName : undefined,
				projectName: typeof sessionRaw?.projectName === 'string' ? sessionRaw.projectName : undefined,
				projectPath: typeof sessionRaw?.projectPath === 'string' ? sessionRaw.projectPath : undefined,
				saveDirectory: typeof sessionRaw?.saveDirectory === 'string' ? sessionRaw.saveDirectory : undefined,
				assetRootPath: typeof sessionRaw?.assetRootPath === 'string' ? sessionRaw.assetRootPath : undefined,
				pluginVersion: typeof sessionRaw?.pluginVersion === 'string' ? sessionRaw.pluginVersion : undefined,
				lastSeenAt: Number.isFinite(Number(sessionRaw?.lastSeenAt)) ? Number(sessionRaw.lastSeenAt) : undefined,
				connectedAt: Number.isFinite(Number(sessionRaw?.connectedAt)) ? Number(sessionRaw.connectedAt) : undefined,
				status: sessionRaw?.status === 'stale' ? 'stale' : 'connected',
			}
			: undefined,
		lastHeartbeatAt: Number.isFinite(Number(raw.lastHeartbeatAt)) ? Number(raw.lastHeartbeatAt) : undefined,
		lastExportJobId: typeof raw.lastExportJobId === 'string' ? raw.lastExportJobId : undefined,
		lastExportStatus:
			raw.lastExportStatus === 'queued' || raw.lastExportStatus === 'picked' || raw.lastExportStatus === 'downloading' || raw.lastExportStatus === 'importing' || raw.lastExportStatus === 'assembling-actor' || raw.lastExportStatus === 'applying-lighting' || raw.lastExportStatus === 'completed' || raw.lastExportStatus === 'failed'
				? raw.lastExportStatus
				: undefined,
		lastExportStage: typeof raw.lastExportStage === 'string' ? raw.lastExportStage : undefined,
		lastExportProgress: Number.isFinite(Number(raw.lastExportProgress)) ? Math.max(0, Math.min(100, Number(raw.lastExportProgress))) : undefined,
		lastExportMessage: typeof raw.lastExportMessage === 'string' ? raw.lastExportMessage : undefined,
		lastBlueprintAssetPath: typeof raw.lastBlueprintAssetPath === 'string' ? raw.lastBlueprintAssetPath : undefined,
		lastModelsAssetPath: typeof raw.lastModelsAssetPath === 'string' ? raw.lastModelsAssetPath : undefined,
		lastActorBaseClass: typeof raw.lastActorBaseClass === 'string' ? raw.lastActorBaseClass : undefined,
		lastSpawnedLightCount: Number.isFinite(Number(raw.lastSpawnedLightCount)) ? Number(raw.lastSpawnedLightCount) : undefined,
		lastLightingTargetActor: typeof raw.lastLightingTargetActor === 'string' ? raw.lastLightingTargetActor : undefined,
		lastLayoutProtocolVersion: Number.isFinite(Number(raw.lastLayoutProtocolVersion)) ? Number(raw.lastLayoutProtocolVersion) : undefined,
		lastSlotCount: Number.isFinite(Number(raw.lastSlotCount)) ? Number(raw.lastSlotCount) : undefined,
		lastAppliedSlotCount: Number.isFinite(Number(raw.lastAppliedSlotCount)) ? Number(raw.lastAppliedSlotCount) : undefined,
		lastMaterialOverrideCount: Number.isFinite(Number(raw.lastMaterialOverrideCount)) ? Number(raw.lastMaterialOverrideCount) : undefined,
		lastExportAt: Number.isFinite(Number(raw.lastExportAt)) ? Number(raw.lastExportAt) : undefined,
		autoPoll: raw.autoPoll !== false,
	}
}

const normalizeWorkflowImageCrop = (rawCrop: any): WorkflowImageCrop | undefined => {
	if (!rawCrop || typeof rawCrop !== 'object') return undefined
	return {
		x: Number.isFinite(Number(rawCrop.x)) ? Math.max(0, Math.min(1, Number(rawCrop.x))) : 0,
		y: Number.isFinite(Number(rawCrop.y)) ? Math.max(0, Math.min(1, Number(rawCrop.y))) : 0,
		width: Number.isFinite(Number(rawCrop.width)) ? Math.max(0, Math.min(1, Number(rawCrop.width))) : 1,
		height: Number.isFinite(Number(rawCrop.height)) ? Math.max(0, Math.min(1, Number(rawCrop.height))) : 1,
	}
}

const normalizeWorkflowPixelRect = (rawRect: any): WorkflowPixelRect | undefined => {
	if (!rawRect || typeof rawRect !== 'object') return undefined
	const width = Number(rawRect.width)
	const height = Number(rawRect.height)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
	return {
		x: Number.isFinite(Number(rawRect.x)) ? Number(rawRect.x) : 0,
		y: Number.isFinite(Number(rawRect.y)) ? Number(rawRect.y) : 0,
		width,
		height,
	}
}

const normalizeSceneDecomposeSettings = (rawSettings: any): WorkflowSceneDecomposeNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	const outputs = Array.isArray(raw.outputs)
		? raw.outputs
			.map((item: any, index: number) => {
				const rawId = String(item?.id ?? '').trim()
				const id = rawId || `object-${index + 1}`
				const imageAnchorId = String(item?.imageAnchorId ?? `out-image-${id}`).trim() || `out-image-${id}`
				const textAnchorId = String(item?.textAnchorId ?? `out-text-${id}`).trim() || `out-text-${id}`
				const sourceImageIndex = Number(item?.sourceImageIndex)
				return {
					id,
					name: typeof item?.name === 'string' ? item.name : undefined,
					description: typeof item?.description === 'string' ? item.description : undefined,
					cropMode: item?.cropMode === 'fallback' ? 'fallback' : 'cropped',
					sourceImageIndex: Number.isFinite(sourceImageIndex) ? Math.max(1, Math.floor(sourceImageIndex)) : 1,
					observedImageIndices: Array.isArray(item?.observedImageIndices)
						? item.observedImageIndices
							.map((value: any) => Number(value))
							.filter((value: number) => Number.isFinite(value) && value > 0)
						: undefined,
					imageRect: normalizeWorkflowImageCrop(item?.imageRect),
					imageRectPixels: normalizeWorkflowPixelRect(item?.imageRectPixels),
					imageAnchorId,
					textAnchorId,
					generatedResourceId: typeof item?.generatedResourceId === 'string' ? item.generatedResourceId : undefined,
					outputWidth: Number.isFinite(Number(item?.outputWidth)) ? Math.max(1, Math.floor(Number(item.outputWidth))) : undefined,
					outputHeight: Number.isFinite(Number(item?.outputHeight)) ? Math.max(1, Math.floor(Number(item.outputHeight))) : undefined,
				} as WorkflowSceneDecomposeOutput
			})
			.filter((item: WorkflowSceneDecomposeOutput) => !!item.id)
		: undefined
	return {
		status: raw.status === 'running' || raw.status === 'completed' || raw.status === 'error' ? raw.status : 'idle',
		message: typeof raw.message === 'string' ? raw.message : undefined,
		progress: Number.isFinite(Number(raw.progress)) ? Math.max(0, Math.min(100, Number(raw.progress))) : undefined,
		currentStep: typeof raw.currentStep === 'string' ? raw.currentStep : undefined,
		totalTasks: Number.isFinite(Number(raw.totalTasks)) ? Math.max(0, Math.floor(Number(raw.totalTasks))) : undefined,
		completedTasks: Number.isFinite(Number(raw.completedTasks)) ? Math.max(0, Math.floor(Number(raw.completedTasks))) : undefined,
		croppedCount: Number.isFinite(Number(raw.croppedCount)) ? Math.max(0, Math.floor(Number(raw.croppedCount))) : undefined,
		fallbackCount: Number.isFinite(Number(raw.fallbackCount)) ? Math.max(0, Math.floor(Number(raw.fallbackCount))) : undefined,
		inputJson: typeof raw.inputJson === 'string' ? raw.inputJson : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		outputs,
		lastExpandedAt: Number.isFinite(Number(raw.lastExpandedAt)) ? Number(raw.lastExpandedAt) : undefined,
		lastExpandedCount: Number.isFinite(Number(raw.lastExpandedCount)) ? Math.max(0, Math.floor(Number(raw.lastExpandedCount))) : undefined,
	}
}

const normalizeMeshyTaskTarget = (value: any): WorkflowMeshyTaskTarget | undefined => {
	const raw = String(value ?? '').trim().toLowerCase()
	if (raw === 'image') return 'image'
	if (raw === '3d') return '3d'
	return undefined
}

const inferMeshyTargetFromFamily = (family: WorkflowMeshyTaskFamily): WorkflowMeshyTaskTarget => {
	if (family === 'text-to-image' || family === 'image-to-image') return 'image'
	return '3d'
}

const getDefaultMeshyFamilyForTarget = (target: WorkflowMeshyTaskTarget): WorkflowMeshyTaskFamily => {
	return target === 'image' ? 'text-to-image' : 'text-to-3d'
}

const normalizeMeshyTaskFamily = (
	rawFamily: any,
	rawTarget: any,
	rawMode: any,
	rawStage: any,
): WorkflowMeshyTaskFamily => {
	const target = normalizeMeshyTaskTarget(rawTarget)
	const family = String(rawFamily ?? '').trim() as WorkflowMeshyTaskFamily
	if (
		family === 'text-to-3d' ||
		family === 'image-to-3d' ||
		family === 'multi-image-to-3d' ||
		family === 'refine' ||
		family === 'retexture' ||
		family === 'remesh' ||
		family === 'text-to-image' ||
		family === 'image-to-image'
	) {
		if (!target || inferMeshyTargetFromFamily(family) === target) return family
	}
	const mode = String(rawMode ?? '').trim()
	const stage = String(rawStage ?? '').trim()
	if (stage === 'refine') return 'refine'
	if (mode === 'image-to-3d') return 'image-to-3d'
	if (mode === 'multi-image-to-3d') return 'multi-image-to-3d'
	if (mode === 'text-to-3d') return 'text-to-3d'
	return getDefaultMeshyFamilyForTarget(target ?? '3d')
}

const meshyLegacyModeForFamily = (family: WorkflowMeshyTaskFamily): WorkflowMeshyNodeSettings['meshyMode'] | undefined => {
	if (family === 'image-to-3d') return 'image-to-3d'
	if (family === 'multi-image-to-3d') return 'multi-image-to-3d'
	if (family === 'text-to-3d' || family === 'refine') return 'text-to-3d'
	return undefined
}

const meshyLegacyStageForFamily = (family: WorkflowMeshyTaskFamily): WorkflowMeshyNodeSettings['meshyStage'] | undefined => {
	if (family === 'refine') return 'refine'
	if (family === 'text-to-3d') return 'preview'
	return undefined
}

const syncMeshyAnchors = (node: WorkflowNode) => {
	const target = node.meshySettings?.meshyTaskTarget ?? '3d'
	const family = node.meshySettings?.meshyTaskFamily ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
	if (target === 'image') {
		const imageInputCount = family === 'image-to-image' ? 5 : 0
		const imageAnchors: WorkflowAnchorSpec[] = []
		for (let i = 1; i <= imageInputCount; i += 1) {
			imageAnchors.push({ id: `in-image-${i}`, label: `参考图 ${i}`, mediaType: 'image' })
		}
		const outputCountRaw = Number(node.meshySettings?.meshyOutputImageCount ?? 1)
		const outputCount = Number.isFinite(outputCountRaw) ? Math.max(1, Math.min(4, Math.floor(outputCountRaw))) : 1
		const imageOutputs: WorkflowAnchorSpec[] = []
		for (let i = 1; i <= outputCount; i += 1) {
			imageOutputs.push({ id: `out-image-${i}`, label: `图像输出 ${i}`, mediaType: 'image' })
		}
		node.inputs = [{ id: 'in-text', label: '提示词输入', mediaType: 'text' }, ...imageAnchors]
		node.outputs = imageOutputs
		return
	}

	node.inputs = [
		{ id: 'in-model', label: '模型/任务输入', mediaType: 'model3d' },
		{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
		{ id: 'in-image-1', label: '参考图 1', mediaType: 'image' },
		{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
		{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
	]
	node.outputs = [{ id: 'out-model', label: '模型输出', mediaType: 'model3d' }]
}

const syncSceneUnderstandAnchors = (node: WorkflowNode) => {
	const mode = node.sceneUnderstandingSettings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
	node.inputs = [
		{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
		{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
		{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
		...(mode === 'scene-lighting' ? [{ id: 'in-layout-json', label: '布局 JSON', mediaType: 'text' as const }] : []),
		{ id: 'in-text', label: mode === 'scene-lighting' ? '灯光补充提示' : '提示词', mediaType: 'text' },
	]
	node.outputs = [{ id: 'out-0', label: mode === 'scene-lighting' ? '灯光JSON' : 'JSON输出', mediaType: 'text' }]
}

const isSceneLayoutModelTarget = (item: any) => {
	if (!item || typeof item !== 'object') return false
	const id = String(item?.id ?? '').trim().toLowerCase()
	const semanticRole = String(item?.semanticRole ?? '').trim().toLowerCase()
	const keyElementType = String(item?.keyElementType ?? '').trim().toLowerCase()
	const relationTags = Array.isArray(item?.relationTags)
		? item.relationTags.map((value: any) => String(value ?? '').trim().toLowerCase())
		: []
	const observed = Array.isArray(item?.observedImageIndices)
		? item.observedImageIndices.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	if (semanticRole === 'structure-shell') return false
	if (relationTags.includes('structural-shell')) return false
	if (id === 'floor1' || id === 'ceiling1' || /wall\d+$/i.test(id)) return false
	if (!observed.length && !item?.imageRect && !item?.imageRectPixels) {
		if (keyElementType === 'floor' || keyElementType === 'wall' || keyElementType === 'ceiling') return false
	}
	return true
}

const syncSceneLayoutAnchors = (node: WorkflowNode) => {
	const previewMode = node.sceneLayoutSettings?.previewMode === true
	const layoutItems = Array.isArray(node.sceneLayoutSettings?.layoutItems)
		? node.sceneLayoutSettings!.layoutItems!
			.filter((item) => String(item?.id ?? '').trim())
			.filter((item) => isSceneLayoutModelTarget(item))
		: []
	const modelInputs = previewMode
		? layoutItems.map((item) => ({
			id: `in-model-${String(item.id ?? '').trim()}`,
			label: `${String(item.name ?? item.id ?? '对象').trim() || '对象'} 模型`,
			mediaType: 'model3d' as const,
		}))
		: []
	const lightingInputs = previewMode && node.sceneLayoutSettings?.lightingPreviewEnabled === true
		? [{ id: 'in-lighting-json', label: '灯光 JSON', mediaType: 'text' as const }]
		: []
	node.inputs = [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }, ...modelInputs, ...lightingInputs]
	node.outputs = [
		{ id: 'out-0', label: '布局输出', mediaType: 'text' },
		...(previewMode ? [{ id: 'out-selected-placeholder', label: '选中占位体', mediaType: 'model3d' as const }] : []),
	]
}

const syncUnrealExportAnchors = (node: WorkflowNode) => {
	node.inputs = [
		{ id: 'in-layout-json', label: '布局 JSON', mediaType: 'text' },
		{ id: 'in-lighting-json', label: '灯光 JSON', mediaType: 'text' },
	]
	node.outputs = []
}

const syncSceneDecomposeAnchors = (node: WorkflowNode) => {
	const settings = node.sceneDecomposeSettings
	const rawOutputs = settings?.outputs
	const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs)
		? rawOutputs
		: []
	node.inputs = [
		{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
		{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
		{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
		{ id: 'in-json', label: '场景 JSON', mediaType: 'text' },
	]
	const nextOutputs: WorkflowAnchorSpec[] = []
	for (const item of outputs) {
		const id = String(item?.id ?? '').trim()
		if (!id) continue
		nextOutputs.push({
			id: String(item?.imageAnchorId ?? `out-image-${id}`),
			label: item?.name ? `${item.name} 图像` : '图像输出',
			mediaType: 'image',
		})
		nextOutputs.push({
			id: String(item?.textAnchorId ?? `out-text-${id}`),
			label: item?.name ? `${item.name} 文本` : '文本输出',
			mediaType: 'text',
		})
	}
	node.outputs = nextOutputs.length ? nextOutputs : [{ id: 'out-empty', label: '待分解', mediaType: 'text' }]
}

const normalizeMeshyTargetFormats = (value: any): WorkflowMeshyNodeSettings['meshyTargetFormats'] | undefined => {
	if (!Array.isArray(value)) return undefined
	const next = value.filter((x: any) => ['glb', 'obj', 'fbx', 'stl', 'usdz'].includes(String(x)))
	return next.length ? (next as WorkflowMeshyNodeSettings['meshyTargetFormats']) : undefined
}

const normalizeModel3DSettings = (rawSettings: any): WorkflowModel3DNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	return {
		modelUrl: typeof raw.modelUrl === 'string' ? String(raw.modelUrl) : undefined,
		modelFormat: raw.modelFormat === 'gltf' ? 'gltf' : raw.modelFormat === 'glb' ? 'glb' : undefined,
		modelSourceName: typeof raw.modelSourceName === 'string' ? String(raw.modelSourceName) : undefined,
		modelSourcePath: typeof raw.modelSourcePath === 'string' ? String(raw.modelSourcePath) : undefined,
		modelAssetUrl: typeof raw.modelAssetUrl === 'string' ? String(raw.modelAssetUrl) : undefined,
		modelAssetPath: typeof raw.modelAssetPath === 'string' ? String(raw.modelAssetPath) : undefined,
		backgroundColor: typeof raw.backgroundColor === 'string' ? String(raw.backgroundColor) : undefined,
		lightIntensity: Number.isFinite(Number(raw.lightIntensity)) ? Math.max(0, Math.min(10, Number(raw.lightIntensity))) : undefined,
		gridVisible: typeof raw.gridVisible === 'boolean' ? Boolean(raw.gridVisible) : undefined,
		axesVisible: typeof raw.axesVisible === 'boolean' ? Boolean(raw.axesVisible) : undefined,
		autoRotate: typeof raw.autoRotate === 'boolean' ? Boolean(raw.autoRotate) : undefined,
		renderWidth: Number.isFinite(Number(raw.renderWidth)) ? Math.max(1, Math.floor(Number(raw.renderWidth))) : undefined,
		renderHeight: Number.isFinite(Number(raw.renderHeight)) ? Math.max(1, Math.floor(Number(raw.renderHeight))) : undefined,
		lastInputSignature: typeof raw.lastInputSignature === 'string' ? String(raw.lastInputSignature) : undefined,
		lastInputNodeId: typeof raw.lastInputNodeId === 'string' ? String(raw.lastInputNodeId) : undefined,
		lastInputSourceUrl: typeof raw.lastInputSourceUrl === 'string' ? String(raw.lastInputSourceUrl) : undefined,
		lastInputSourcePath: typeof raw.lastInputSourcePath === 'string' ? String(raw.lastInputSourcePath) : undefined,
		lastInputSourceName: typeof raw.lastInputSourceName === 'string' ? String(raw.lastInputSourceName) : undefined,
		lastInputPlaceholderId: typeof raw.lastInputPlaceholderId === 'string' ? String(raw.lastInputPlaceholderId) : undefined,
		lastInputPlaceholderJson: typeof raw.lastInputPlaceholderJson === 'string' ? String(raw.lastInputPlaceholderJson) : undefined,
	}
}

const normalizeMeshySettings = (rawSettings: any): WorkflowMeshyNodeSettings | undefined => {
	if (!rawSettings || typeof rawSettings !== 'object') return undefined
	const raw = rawSettings as any
	const meshyTaskFamily = normalizeMeshyTaskFamily(raw.meshyTaskFamily, raw.meshyTaskTarget, raw.meshyMode, raw.meshyStage)
	const meshyTaskTarget = normalizeMeshyTaskTarget(raw.meshyTaskTarget) ?? inferMeshyTargetFromFamily(meshyTaskFamily)
	return {
		meshyApiSource: 'meshy',
		meshyTaskTarget,
		meshyTaskFamily,
		meshyHelpTopic: typeof raw.meshyHelpTopic === 'string' ? String(raw.meshyHelpTopic) : undefined,
		meshyMode: meshyLegacyModeForFamily(meshyTaskFamily) ?? (raw.meshyMode === 'image-to-3d' ? 'image-to-3d' : raw.meshyMode === 'multi-image-to-3d' ? 'multi-image-to-3d' : raw.meshyMode === 'text-to-3d' ? 'text-to-3d' : undefined),
		meshyStage: meshyLegacyStageForFamily(meshyTaskFamily) ?? (raw.meshyStage === 'refine' ? 'refine' : raw.meshyStage === 'preview' ? 'preview' : undefined),
		meshyPrompt: typeof raw.meshyPrompt === 'string' ? String(raw.meshyPrompt) : undefined,
		meshyNegativePrompt: typeof raw.meshyNegativePrompt === 'string' ? String(raw.meshyNegativePrompt) : undefined,
		meshyPreviewTaskId: typeof raw.meshyPreviewTaskId === 'string' ? String(raw.meshyPreviewTaskId) : undefined,
		meshyImageUrl: typeof raw.meshyImageUrl === 'string' ? String(raw.meshyImageUrl) : undefined,
		meshyImageUrls: Array.isArray(raw.meshyImageUrls) ? raw.meshyImageUrls.map((x: any) => String(x ?? '').trim()).filter((x: string) => !!x).slice(0, 5) : undefined,
		meshyTexturePrompt: typeof raw.meshyTexturePrompt === 'string' ? String(raw.meshyTexturePrompt) : undefined,
		meshyTextureImageUrl: typeof raw.meshyTextureImageUrl === 'string' ? String(raw.meshyTextureImageUrl) : undefined,
		meshyModelType: raw.meshyModelType === 'lowpoly' ? 'lowpoly' : raw.meshyModelType === 'standard' ? 'standard' : undefined,
		meshyAiModel:
			raw.meshyAiModel === 'meshy-5'
				? 'meshy-5'
				: raw.meshyAiModel === 'meshy-6'
					? 'meshy-6'
					: raw.meshyAiModel === 'nano-banana'
						? 'nano-banana'
						: raw.meshyAiModel === 'nano-banana-pro'
							? 'nano-banana-pro'
							: raw.meshyAiModel === 'latest'
								? 'latest'
								: undefined,
			meshyAspectRatio:
				raw.meshyAspectRatio === '1:1'
					? '1:1'
					: raw.meshyAspectRatio === '16:9'
						? '16:9'
						: raw.meshyAspectRatio === '9:16'
							? '9:16'
							: raw.meshyAspectRatio === '4:3'
								? '4:3'
								: raw.meshyAspectRatio === '3:4'
									? '3:4'
									: undefined,
			meshyGenerateMultiView: typeof raw.meshyGenerateMultiView === 'boolean' ? Boolean(raw.meshyGenerateMultiView) : undefined,
			meshyOutputImageCount: Number.isFinite(Number(raw.meshyOutputImageCount))
				? (Math.max(1, Math.min(4, Math.floor(Number(raw.meshyOutputImageCount)))) as 1 | 2 | 3 | 4)
				: undefined,
			meshyImageInputCount: Number.isFinite(Number(raw.meshyImageInputCount)) ? Math.max(0, Math.min(5, Math.floor(Number(raw.meshyImageInputCount)))) : undefined,
			meshySeed: Number.isFinite(Number(raw.meshySeed)) ? Math.max(0, Math.floor(Number(raw.meshySeed))) : undefined,
		meshyAnimationActionId: Number.isFinite(Number(raw.meshyAnimationActionId))
			? Math.max(1, Math.floor(Number(raw.meshyAnimationActionId)))
			: undefined,
		meshyTopology: raw.meshyTopology === 'quad' ? 'quad' : raw.meshyTopology === 'triangle' ? 'triangle' : undefined,
		meshyTargetPolycount: Number.isFinite(Number(raw.meshyTargetPolycount)) ? Math.max(100, Math.min(300000, Math.floor(Number(raw.meshyTargetPolycount)))) : undefined,
		meshySymmetryMode: raw.meshySymmetryMode === 'off' ? 'off' : raw.meshySymmetryMode === 'on' ? 'on' : raw.meshySymmetryMode === 'auto' ? 'auto' : undefined,
		meshyShouldRemesh: typeof raw.meshyShouldRemesh === 'boolean' ? Boolean(raw.meshyShouldRemesh) : undefined,
		meshySavePreRemeshedModel: typeof raw.meshySavePreRemeshedModel === 'boolean' ? Boolean(raw.meshySavePreRemeshedModel) : undefined,
		meshyShouldTexture: typeof raw.meshyShouldTexture === 'boolean' ? Boolean(raw.meshyShouldTexture) : undefined,
		meshyEnablePbr: typeof raw.meshyEnablePbr === 'boolean' ? Boolean(raw.meshyEnablePbr) : undefined,
		meshyPoseMode: raw.meshyPoseMode === 'a-pose' ? 'a-pose' : raw.meshyPoseMode === 't-pose' ? 't-pose' : raw.meshyPoseMode === '' ? '' : undefined,
		meshyModeration: typeof raw.meshyModeration === 'boolean' ? Boolean(raw.meshyModeration) : undefined,
		meshyImageEnhancement: typeof raw.meshyImageEnhancement === 'boolean' ? Boolean(raw.meshyImageEnhancement) : undefined,
		meshyRemoveLighting: typeof raw.meshyRemoveLighting === 'boolean' ? Boolean(raw.meshyRemoveLighting) : undefined,
		meshyAutoSize: typeof raw.meshyAutoSize === 'boolean' ? Boolean(raw.meshyAutoSize) : undefined,
		meshyOriginAt: raw.meshyOriginAt === 'center' ? 'center' : raw.meshyOriginAt === 'bottom' ? 'bottom' : undefined,
		meshyTargetFormats: normalizeMeshyTargetFormats(raw.meshyTargetFormats),
		meshyTaskId: typeof raw.meshyTaskId === 'string' ? String(raw.meshyTaskId) : undefined,
		meshyTaskStatus: ['idle', 'pending', 'running', 'succeeded', 'failed', 'canceled'].includes(String(raw.meshyTaskStatus)) ? String(raw.meshyTaskStatus) as WorkflowMeshyNodeSettings['meshyTaskStatus'] : undefined,
		meshyProgress: Number.isFinite(Number(raw.meshyProgress)) ? Math.max(0, Math.min(100, Number(raw.meshyProgress))) : undefined,
		meshyStatusText: typeof raw.meshyStatusText === 'string' ? String(raw.meshyStatusText) : undefined,
		meshyThumbnailUrl: typeof raw.meshyThumbnailUrl === 'string' ? String(raw.meshyThumbnailUrl) : undefined,
		meshyModelUrls: raw.meshyModelUrls && typeof raw.meshyModelUrls === 'object' ? { ...raw.meshyModelUrls } : undefined,
		meshyOutputAssetUrl: typeof raw.meshyOutputAssetUrl === 'string' ? String(raw.meshyOutputAssetUrl) : undefined,
		meshyOutputAssetPath: typeof raw.meshyOutputAssetPath === 'string' ? String(raw.meshyOutputAssetPath) : undefined,
		meshyErrorMessage: typeof raw.meshyErrorMessage === 'string' ? String(raw.meshyErrorMessage) : undefined,
		meshyInputSummary: raw.meshyInputSummary && typeof raw.meshyInputSummary === 'object' ? { ...raw.meshyInputSummary } : undefined,
		meshyOutputSummary: raw.meshyOutputSummary && typeof raw.meshyOutputSummary === 'object' ? { ...raw.meshyOutputSummary } : undefined,
	}
}

export const AIWorkflowKey: InjectionKey<Store<WorkflowState>> = Symbol('AIWorkflowStore')

export const AIWorkflowStore = createStore<WorkflowState>({
	state: createDefaultAIWorkflowState,
	mutations: {
		hydrateDraft(state, payload: { snapshot: any }) {
			const s = payload?.snapshot
			if (!s || typeof s !== 'object') return

			// viewport
			if (s.viewport && typeof s.viewport === 'object') {
				state.viewport.zoom = clampZoom((s.viewport as any).zoom)
				state.viewport.panX = clamp((s.viewport as any).panX, -1e9, 1e9)
				state.viewport.panY = clamp((s.viewport as any).panY, -1e9, 1e9)
			}

			// nodes
			const nextNodesById: Record<string, WorkflowNode> = {}
			const rawNodesById = (s.nodesById && typeof s.nodesById === 'object') ? (s.nodesById as Record<string, any>) : {}
			for (const [id, raw] of Object.entries(rawNodesById)) {
				const nodeId = String(id ?? '').trim()
				if (!nodeId) continue
				if (!raw || typeof raw !== 'object') continue
				const n = raw as any
				const type = String(n.type ?? 'base')
				let alias = typeof n.alias === 'string' ? n.alias : ''
				if (!alias.trim()) alias = defaultAliasForType(type)
				const rawImg = (n as any).imageSettings
				const imageSettings = rawImg && typeof rawImg === 'object'
					? {
						outputWidth: Number.isFinite(Number((rawImg as any).outputWidth)) ? Math.max(1, Math.floor(Number((rawImg as any).outputWidth))) : undefined,
						outputHeight: Number.isFinite(Number((rawImg as any).outputHeight)) ? Math.max(1, Math.floor(Number((rawImg as any).outputHeight))) : undefined,
						naturalWidth: Number.isFinite(Number((rawImg as any).naturalWidth)) ? Math.max(1, Math.floor(Number((rawImg as any).naturalWidth))) : undefined,
						naturalHeight: Number.isFinite(Number((rawImg as any).naturalHeight)) ? Math.max(1, Math.floor(Number((rawImg as any).naturalHeight))) : undefined,
						cropEnabled: typeof (rawImg as any).cropEnabled === 'boolean' ? Boolean((rawImg as any).cropEnabled) : undefined,
						crop: (rawImg as any).crop && typeof (rawImg as any).crop === 'object'
							? {
								x: Number.isFinite(Number((rawImg as any).crop.x)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.x))) : 0,
								y: Number.isFinite(Number((rawImg as any).crop.y)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.y))) : 0,
								width: Number.isFinite(Number((rawImg as any).crop.width)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.width))) : 1,
								height: Number.isFinite(Number((rawImg as any).crop.height)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.height))) : 1,
							}
							: undefined,
					}
					: undefined
				const rawVideo = (n as any).videoSettings
				const videoSettings = rawVideo && typeof rawVideo === 'object'
					? {
						outputWidth: Number.isFinite(Number((rawVideo as any).outputWidth)) ? Math.max(1, Math.floor(Number((rawVideo as any).outputWidth))) : undefined,
						outputHeight: Number.isFinite(Number((rawVideo as any).outputHeight)) ? Math.max(1, Math.floor(Number((rawVideo as any).outputHeight))) : undefined,
						naturalWidth: Number.isFinite(Number((rawVideo as any).naturalWidth)) ? Math.max(1, Math.floor(Number((rawVideo as any).naturalWidth))) : undefined,
						naturalHeight: Number.isFinite(Number((rawVideo as any).naturalHeight)) ? Math.max(1, Math.floor(Number((rawVideo as any).naturalHeight))) : undefined,
					}
					: undefined
				const rawModel3D = (n as any).model3dSettings
				const rawMeshy = (n as any).meshySettings
				const model3dSettings = normalizeModel3DSettings(rawModel3D)
				const meshySettings = normalizeMeshySettings(rawMeshy ?? rawModel3D)
				nextNodesById[nodeId] = {
					id: nodeId,
					type,
					title: String(n.title ?? '工作流节点'),
					alias,
					subtitle: typeof n.subtitle === 'string' ? n.subtitle : '',
					resourcePath: typeof (n as any).resourcePath === 'string' ? String((n as any).resourcePath) : undefined,
					imageSettings,
					videoSettings,
					model3dSettings,
					meshySettings,
					storySettings: (() => {
						const rawStory = (n as any).storySettings
						if (!rawStory || typeof rawStory !== 'object') return undefined
						const pw = Number((rawStory as any).previewWidth)
						const ph = Number((rawStory as any).previewHeight)
						return {
							previewWidth: Number.isFinite(pw) ? Math.max(1, Math.floor(pw)) : undefined,
							previewHeight: Number.isFinite(ph) ? Math.max(1, Math.floor(ph)) : undefined,
						}
					})(),
					worldX: Number.isFinite(Number(n.worldX)) ? Number(n.worldX) : 0,
					worldY: Number.isFinite(Number(n.worldY)) ? Number(n.worldY) : 0,
					width: Number.isFinite(Number(n.width)) ? Math.max(80, Math.min(1000, Number(n.width))) : 240,
					height: Number.isFinite(Number(n.height)) ? Math.max(80, Math.min(1000, Number(n.height))) : 160,
					sizeCustomized: Boolean(n.sizeCustomized),
					resourceId: typeof n.resourceId === 'string' ? n.resourceId : null,
					branches: Array.isArray(n.branches)
						? n.branches
							.map((b: any) => ({ id: String(b?.id ?? '').trim(), text: String(b?.text ?? '') }))
							.filter((b: any) => b.id)
						: undefined,
					inputs: Array.isArray(n.inputs)
						? n.inputs.map((a: any) => ({
							id: String(a?.id ?? '').trim(),
							label: typeof a?.label === 'string' ? a.label : undefined,
							offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined,
							mediaType: normalizeMediaType(a?.mediaType, { nodeType: type, anchorId: String(a?.id ?? '') }),
						})).filter((a: any) => a.id)
						: [{ id: 'in-0', label: '入口' }],
					outputs: Array.isArray(n.outputs)
						? n.outputs.map((a: any) => ({
							id: String(a?.id ?? '').trim(),
							label: typeof a?.label === 'string' ? a.label : undefined,
							offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined,
							mediaType: normalizeMediaType(a?.mediaType, { nodeType: type, anchorId: String(a?.id ?? '') }),
						})).filter((a: any) => a.id)
						: [{ id: 'out-0', label: '出口' }],
					createdAt: Number.isFinite(Number(n.createdAt)) ? Number(n.createdAt) : Date.now(),
					rotatePromptText: typeof (n as any).rotatePromptText === 'string' ? String((n as any).rotatePromptText) : undefined,
					textValue: typeof (n as any).textValue === 'string' ? String((n as any).textValue) : undefined,
					textMergeItems: Array.isArray((n as any).textMergeItems)
						? (n as any).textMergeItems
							.map((x: any) => ({ id: String(x?.id ?? '').trim() }))
							.filter((x: any) => x.id)
						: undefined,
					sceneUnderstandingSettings: normalizeSceneUnderstandingSettings((n as any).sceneUnderstandingSettings),
					sceneLayoutSettings: normalizeSceneLayoutSettings((n as any).sceneLayoutSettings),
					unrealExportSettings: normalizeUnrealExportSettings((n as any).unrealExportSettings),
					sceneDecomposeSettings: normalizeSceneDecomposeSettings((n as any).sceneDecomposeSettings),
					comfyuiSettings: ((rawSettings: any) => {
						if (!rawSettings || typeof rawSettings !== 'object') return undefined
						const s0 = rawSettings as any
						const workflows = Array.isArray(s0.workflows)
							? s0.workflows
								.map((w: any) => ({ path: String(w?.path ?? ''), name: String(w?.name ?? '') }))
								.filter((w: any) => w.path)
							: undefined
						const outputs = Array.isArray(s0.outputs)
							? s0.outputs
								.map((o: any) => ({
									kind: o?.kind === 'video' ? 'video' : 'image',
									url: String(o?.url ?? ''),
									filename: typeof o?.filename === 'string' ? o.filename : undefined,
									anchorId: typeof o?.anchorId === 'string' ? o.anchorId : undefined,
									nodeId: typeof o?.nodeId === 'string' ? o.nodeId : undefined,
									sourcePath: typeof o?.sourcePath === 'string' ? o.sourcePath : undefined,
									subfolder: typeof o?.subfolder === 'string' ? o.subfolder : undefined,
									type: typeof o?.type === 'string' ? o.type : undefined,
								}))
								.filter((o: any) => o.url)
							: undefined
						return {
							baseUrl: typeof s0.baseUrl === 'string' ? s0.baseUrl : undefined,
							status: s0.status === 'connecting' || s0.status === 'connected' || s0.status === 'error' ? s0.status : 'idle',
							message: typeof s0.message === 'string' ? s0.message : undefined,
							lastCheckedAt: Number.isFinite(Number(s0.lastCheckedAt)) ? Number(s0.lastCheckedAt) : undefined,
							workflows,
							workflowPath: typeof s0.workflowPath === 'string' ? s0.workflowPath : undefined,
							positivePrompt: typeof s0.positivePrompt === 'string' ? s0.positivePrompt : undefined,
							negativePrompt: typeof s0.negativePrompt === 'string' ? s0.negativePrompt : undefined,
							runStatus: s0.runStatus,
							promptId: typeof s0.promptId === 'string' ? s0.promptId : undefined,
							progress: Number.isFinite(Number(s0.progress)) ? Number(s0.progress) : undefined,
							statusText: typeof s0.statusText === 'string' ? s0.statusText : undefined,
							outputs,
							lastUpdateAt: Number.isFinite(Number(s0.lastUpdateAt)) ? Number(s0.lastUpdateAt) : undefined,
						} as WorkflowComfyUINodeSettings
					})((n as any).comfyuiSettings),
				}
				if (nextNodesById[nodeId].type === 'story') syncStoryAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'text-merge') syncTextMergeAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-understanding') syncSceneUnderstandAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-layout') syncSceneLayoutAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'unreal-export') syncUnrealExportAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-decompose') syncSceneDecomposeAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'meshy') syncMeshyAnchors(nextNodesById[nodeId])
				enforceSingleIOAnchors(nextNodesById[nodeId])
			}

			const rawNodeOrder = Array.isArray(s.nodeOrder) ? (s.nodeOrder as any[]) : []
			const nextNodeOrder = normalizeNodeIds({ ...state, nodesById: nextNodesById } as any, rawNodeOrder.map((x) => String(x ?? '')))
			// if order missing, fall back to object keys
			const nodeOrder = nextNodeOrder.length ? nextNodeOrder : Object.keys(nextNodesById)

			state.nodesById = nextNodesById
			state.nodeOrder = nodeOrder

			// resources
			// Keep blob urls during hydrate so imported project packages can use in-memory assets
			// immediately after import. Persisted project loads should already rewrite to backend urls.
			const nextResourcesById: any = {}
			const nextResourceOrder: string[] = []
			const rawResourcesById = (s.resourcesById && typeof s.resourcesById === 'object') ? (s.resourcesById as Record<string, any>) : {}
			const rawResourceOrder = Array.isArray(s.resourceOrder) ? (s.resourceOrder as any[]) : []
			for (const ridRaw of rawResourceOrder.length ? rawResourceOrder : Object.keys(rawResourcesById)) {
				const rid = String(ridRaw ?? '').trim()
				if (!rid) continue
				const r = rawResourcesById[rid]
				if (!r || typeof r !== 'object') continue
				const url = typeof (r as any).url === 'string' ? String((r as any).url) : ''
				nextResourcesById[rid] = { ...(r as any), id: rid, url }
				nextResourceOrder.push(rid)
			}
			state.resourcesById = nextResourcesById
			state.resourceOrder = uniq(nextResourceOrder)

			// edges
			const nextEdgesById: Record<string, WorkflowEdge> = {}
			const rawEdgesById = (s.edgesById && typeof s.edgesById === 'object') ? (s.edgesById as Record<string, any>) : {}
			for (const [edgeIdRaw, raw] of Object.entries(rawEdgesById)) {
				const edgeId = String(edgeIdRaw ?? '').trim()
				if (!edgeId) continue
				if (!raw || typeof raw !== 'object') continue
				const e = raw as any
				const fromNodeId = String(e.fromNodeId ?? '').trim()
				const toNodeId = String(e.toNodeId ?? '').trim()
				if (!fromNodeId || !toNodeId) continue
				if (!state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) continue
				const fromNodeType = String(state.nodesById[fromNodeId]?.type ?? '')
				const toNodeType = String(state.nodesById[toNodeId]?.type ?? '')
				const fromAnchorId = remapLegacyOutputAnchorId(fromNodeType, String(e.fromAnchorId ?? 'out-0'))
				const toAnchorId = remapLegacyInputAnchorId(toNodeType, String(e.toAnchorId ?? 'in-0'))
				nextEdgesById[edgeId] = {
					id: edgeId,
					fromNodeId,
					fromAnchorId,
					toNodeId,
					toAnchorId,
					createdAt: Number.isFinite(Number(e.createdAt)) ? Number(e.createdAt) : Date.now(),
				}
			}
			const rawEdgeOrder = Array.isArray(s.edgeOrder) ? (s.edgeOrder as any[]) : []
			let edgeOrder = rawEdgeOrder.map((x) => String(x ?? '').trim()).filter((id) => !!id && !!nextEdgesById[id])
			if (!edgeOrder.length) edgeOrder = Object.keys(nextEdgesById)

			// Remove edges with missing anchors or kind mismatch.
			for (const edgeId of edgeOrder.slice()) {
				const e = nextEdgesById[edgeId]
				if (!e) continue
				const fromNode = state.nodesById[e.fromNodeId]
				const toNode = state.nodesById[e.toNodeId]
				if (!fromNode || !toNode) {
					delete nextEdgesById[edgeId]
					continue
				}
				if (!hasAnchor(fromNode, 'out', e.fromAnchorId) || !hasAnchor(toNode, 'in', e.toAnchorId)) {
					delete nextEdgesById[edgeId]
					continue
				}
				if (!canLinkAnchors(state.nodesById, e.fromNodeId, e.fromAnchorId, e.toNodeId, e.toAnchorId)) delete nextEdgesById[edgeId]
			}
			state.edgesById = nextEdgesById
			state.edgeOrder = edgeOrder.filter((id) => !!state.edgesById[id])

			// selection
			const ids = normalizeNodeIds(state, Array.isArray(s.selectedNodeIds) ? (s.selectedNodeIds as any[]).map((x) => String(x ?? '')) : [])
			const primaryRaw = typeof s.selectedNodeId === 'string' ? s.selectedNodeId : null
			state.selectedNodeIds = ids
			state.selectedNodeId = primaryRaw && ids.includes(primaryRaw) ? primaryRaw : (ids[0] ?? state.nodeOrder[0] ?? null)
			state.selectedEdgeId = null
			state.clipboardNode = null
			state.clipboardNodes = null
			state.clipboardPrimaryNodeId = null
			state.chatDraft = ''
		},
		setChatDraft(state, payload: { text: string }) {
			state.chatDraft = typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '')
		},
		resetViewport(state) {
			state.viewport = { zoom: 1, panX: 0, panY: 0 }
		},
		setViewport(state, payload: Partial<WorkflowViewport>) {
			const nextZoom = payload.zoom == null ? state.viewport.zoom : clampZoom(payload.zoom)
			const nextPanX = payload.panX == null ? state.viewport.panX : clamp(payload.panX, -1e9, 1e9)
			const nextPanY = payload.panY == null ? state.viewport.panY : clamp(payload.panY, -1e9, 1e9)
			state.viewport.zoom = nextZoom
			state.viewport.panX = nextPanX
			state.viewport.panY = nextPanY
		},
		setSelectedNode(state, payload: { nodeId: string | null }) {
			const id = payload?.nodeId
			state.selectedNodeId = typeof id === 'string' && id.trim() ? id : null
			state.selectedNodeIds = state.selectedNodeId ? normalizeNodeIds(state, [state.selectedNodeId]) : []
			if (state.selectedNodeId) state.selectedEdgeId = null
		},
		setSelectedNodes(state, payload: { nodeIds: string[]; primaryNodeId?: string | null }) {
			const ids = normalizeNodeIds(state, Array.isArray(payload?.nodeIds) ? payload.nodeIds : [])
			state.selectedNodeIds = ids
			const primaryRaw = payload?.primaryNodeId
			const primary = typeof primaryRaw === 'string' && primaryRaw.trim() ? primaryRaw.trim() : null
			state.selectedNodeId = primary && ids.includes(primary) ? primary : (ids[0] ?? null)
			if (ids.length) state.selectedEdgeId = null
		},
		setSelectedEdge(state, payload: { edgeId: string | null }) {
			const id = payload?.edgeId
			state.selectedEdgeId = typeof id === 'string' && id.trim() ? id : null
			if (state.selectedEdgeId) {
				state.selectedNodeId = null
				state.selectedNodeIds = []
			}
		},
		addResource(state, payload: WorkflowResource) {
			const id = String(payload?.id ?? '').trim()
			if (!id) return
			state.resourcesById[id] = payload
			if (!state.resourceOrder.includes(id)) state.resourceOrder.push(id)
		},
		patchResource(state, payload: { resourceId: string; patch: Partial<WorkflowResource> }) {
			const id = String(payload?.resourceId ?? '').trim()
			if (!id) return
			const r = state.resourcesById[id]
			if (!r) return
			const patch = (payload?.patch ?? {}) as Partial<WorkflowResource>
			state.resourcesById[id] = { ...(r as any), ...(patch as any), id }
		},
		patchResourcesBatch(state, payload: { patches: Array<{ resourceId: string; patch: Partial<WorkflowResource> }> }) {
			const list = Array.isArray(payload?.patches) ? payload.patches : []
			if (!list.length) return
			for (const item of list) {
				const id = String((item as any)?.resourceId ?? '').trim()
				if (!id) continue
				const r = state.resourcesById[id]
				if (!r) continue
				const patch = (((item as any)?.patch ?? {}) as Partial<WorkflowResource>)
				state.resourcesById[id] = { ...(r as any), ...(patch as any), id }
			}
		},
		removeResource(state, payload: { resourceId: string }) {
			const id = String(payload?.resourceId ?? '').trim()
			if (!id) return
			delete state.resourcesById[id]
			state.resourceOrder = state.resourceOrder.filter((x) => x !== id)
			for (const node of Object.values(state.nodesById)) {
				if (node.resourceId === id) node.resourceId = null
			}
		},
		setNodeAlias(state, payload: { nodeId: string; alias: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			n.alias = String(payload?.alias ?? '')
		},
		setNodeType(state, payload: { nodeId: string; type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.type !== 'base' && payload.type !== 'text' && payload.type !== 'text-merge' && payload.type !== 'image' && payload.type !== 'rotate-image' && payload.type !== 'video' && payload.type !== 'scene-understanding' && payload.type !== 'scene-decompose' && payload.type !== 'scene-layout' && payload.type !== 'unreal-export' && payload.type !== 'story' && payload.type !== 'comfyui' && payload.type !== 'model3d' && payload.type !== 'meshy') return
			const prevType = String(n.type ?? 'base')
			const prevDefaultAlias = defaultAliasForType(prevType)
			n.type = payload.type
			if (payload.type !== 'image') n.imageSettings = undefined
			if (payload.type !== 'video') n.videoSettings = undefined
			if (payload.type !== 'scene-understanding') n.sceneUnderstandingSettings = undefined
			if (payload.type !== 'scene-decompose') n.sceneDecomposeSettings = undefined
			if (payload.type !== 'scene-layout') n.sceneLayoutSettings = undefined
			if (payload.type !== 'unreal-export') n.unrealExportSettings = undefined
			if (payload.type !== 'story') n.storySettings = undefined
			if (payload.type !== 'comfyui') n.comfyuiSettings = undefined
			if (payload.type !== 'model3d') n.model3dSettings = undefined
			if (payload.type !== 'meshy') n.meshySettings = undefined
				if (payload.type !== 'rotate-image') (n as any).rotatePromptText = undefined
			if (payload.type !== 'text') n.textValue = undefined
			if (payload.type !== 'text-merge') (n as any).textMergeItems = undefined
			if (payload.type === 'base' || payload.type === 'text' || payload.type === 'text-merge' || payload.type === 'comfyui' || payload.type === 'rotate-image' || payload.type === 'scene-understanding' || payload.type === 'scene-decompose' || payload.type === 'scene-layout' || payload.type === 'unreal-export' || payload.type === 'model3d' || payload.type === 'meshy') n.resourceId = null
			if (payload.type !== 'story') n.branches = undefined
			if (payload.type !== 'story' && payload.type !== 'comfyui' && payload.type !== 'rotate-image' && payload.type !== 'scene-understanding' && payload.type !== 'scene-decompose' && payload.type !== 'scene-layout' && payload.type !== 'unreal-export' && payload.type !== 'model3d' && payload.type !== 'meshy') {
				n.inputs = payload.type === 'text' ? [] : [{ id: 'in-0', label: '入口' }]
				n.outputs = payload.type === 'text'
				? [{ id: 'out-text', label: '文本', mediaType: 'text' }]
				: [{ id: 'out-0', label: '出口' }]
			}
			if (payload.type === 'rotate-image') {
				n.inputs = [{ id: 'in-0', label: '图片输入', mediaType: 'image' }]
					n.outputs = [{ id: 'out-0', label: '旋转图片', mediaType: 'image' }]
					;(n as any).rotatePromptText = typeof (n as any).rotatePromptText === 'string' ? String((n as any).rotatePromptText) : ''
			}
			if (payload.type === 'text-merge') {
				;(n as any).textMergeItems = Array.isArray((n as any).textMergeItems) ? (n as any).textMergeItems : [{ id: makeId('merge') }]
				syncTextMergeAnchors(n)
			}
			if (payload.type === 'story') {
				n.storySettings = n.storySettings ?? { previewWidth: 1920, previewHeight: 1080 }
				syncStoryAnchors(n)
			}
			if (payload.type === 'video') {
				n.videoSettings = n.videoSettings ?? { outputWidth: 1920, outputHeight: 1080 }
				n.inputs = [{ id: 'in-0', label: '视频输入' }]
				n.outputs = [{ id: 'out-0', label: '视频输出', mediaType: 'video' }]
			}
			if (payload.type === 'scene-understanding') {
				n.sceneUnderstandingSettings = n.sceneUnderstandingSettings ?? {
					selectedModel: 'doubao-seed-1-6-vision-250815',
					availableModels: [],
					status: 'idle',
					message: '',
						statusText: '',
						progress: 0,
					outputJson: '',
						rawOutput: '',
					resultSummary: '',
						rewriteUsed: false,
						rewriteAttempts: 0,
					mock: false,
				}
				syncSceneUnderstandAnchors(n)
			}
			if (payload.type === 'scene-layout') {
				n.sceneLayoutSettings = n.sceneLayoutSettings ?? {
					status: 'idle',
					message: '',
					inputJson: '',
					previewMode: false,
					lightingControls: {
						masterIntensity: 1,
						exposure: 1,
						ambient: 1,
						hemisphere: 1,
						directional: 1,
						point: 1,
						spot: 1,
						rectArea: 1,
					},
					hidePlaceholderCubes: false,
					selectedLayoutItemId: '',
					selectedPlaceholderOutput: '',
					layoutItems: [],
				}
				syncSceneLayoutAnchors(n)
			}
			if (payload.type === 'unreal-export') {
				n.unrealExportSettings = n.unrealExportSettings ?? {
					connectionStatus: 'idle',
					statusText: '等待连接',
					message: '',
					autoPoll: true,
				}
				syncUnrealExportAnchors(n)
			}
			if (payload.type === 'scene-decompose') {
				n.sceneDecomposeSettings = n.sceneDecomposeSettings ?? {
					status: 'idle',
					message: '',
					inputJson: '',
					outputs: [],
				}
				syncSceneDecomposeAnchors(n)
			}
			if (payload.type === 'image') {
				n.imageSettings = n.imageSettings ?? { outputWidth: 1920, outputHeight: 1080 }
				n.inputs = [{ id: 'in-image', label: '图片输入', mediaType: 'image' }]
				n.outputs = [{ id: 'out-image', label: '图片输出', mediaType: 'image' }]
			}
			if (payload.type === 'text') {
				n.textValue = typeof n.textValue === 'string' ? n.textValue : ''
				n.inputs = [{ id: 'in-text', label: '文本输入', mediaType: 'text' }]
				n.outputs = [{ id: 'out-text', label: '文本输出', mediaType: 'text' }]
			}
			if (payload.type === 'comfyui') {
				n.comfyuiSettings = n.comfyuiSettings ?? {
					baseUrl: '',
					status: 'idle',
					message: '',
					workflows: [],
					workflowPath: '',
					positivePrompt: '',
					negativePrompt: '',
					runStatus: 'idle',
					promptId: '',
					progress: 0,
					statusText: '',
					outputs: [],
				} as WorkflowComfyUINodeSettings
				const baseInputs: WorkflowAnchorSpec[] = [
					...comfyPromptAnchors(),
					{ id: 'in-0', label: '图片输入', mediaType: 'image' },
				]
				n.inputs = baseInputs
				n.outputs = [{ id: 'out-0', label: '产物输出', mediaType: 'generic' }]
			}
			if (payload.type === 'model3d') {
				n.model3dSettings = n.model3dSettings ?? {
					modelAssetUrl: '',
					modelAssetPath: '',
					backgroundColor: '#0f1720',
					lightIntensity: 1.25,
					gridVisible: true,
					axesVisible: true,
					autoRotate: false,
					renderWidth: 1024,
					renderHeight: 1024,
				}
				n.inputs = [{ id: 'in-model', label: '模型输入', mediaType: 'model3d' }]
				n.outputs = [{ id: 'out-model', label: '模型输出', mediaType: 'model3d' }]
			}
			if (payload.type === 'meshy') {
				n.meshySettings = n.meshySettings ?? {
					meshyApiSource: 'meshy',
					meshyTaskTarget: '3d',
					meshyTaskFamily: 'text-to-3d',
					meshyHelpTopic: 'text-to-3d',
					meshyMode: 'text-to-3d',
					meshyStage: 'preview',
					meshyAiModel: 'latest',
					meshyAnimationActionId: 92,
					meshyModelType: 'standard',
					meshyAspectRatio: '1:1',
					meshyGenerateMultiView: false,
					meshyOutputImageCount: 1,
					meshyImageInputCount: 5,
					meshySeed: 0,
					meshyTopology: 'triangle',
					meshyTargetPolycount: 30000,
					meshySymmetryMode: 'auto',
					meshyShouldRemesh: false,
					meshySavePreRemeshedModel: false,
					meshyShouldTexture: true,
					meshyEnablePbr: false,
					meshyPoseMode: '',
					meshyModeration: false,
					meshyImageEnhancement: true,
					meshyRemoveLighting: true,
					meshyAutoSize: false,
					meshyOriginAt: 'bottom',
					meshyTargetFormats: ['glb'],
					meshyTaskStatus: 'idle',
					meshyProgress: 0,
				}
				syncMeshyAnchors(n)
			}
			if (!String(n.alias ?? '').trim() || String(n.alias) === prevDefaultAlias) {
				n.alias = defaultAliasForType(payload.type)
			}
			enforceSingleIOAnchors(n)
			if (!n.sizeCustomized) {
				if (payload.type === 'image' || payload.type === 'rotate-image' || payload.type === 'video' || payload.type === 'scene-understanding' || payload.type === 'scene-decompose' || payload.type === 'scene-layout' || payload.type === 'unreal-export' || payload.type === 'story' || payload.type === 'comfyui' || payload.type === 'model3d' || payload.type === 'meshy') {
					n.width = 450
					n.height = payload.type === 'model3d' ? 420 : payload.type === 'meshy' ? 470 : payload.type === 'scene-layout' ? 430 : payload.type === 'unreal-export' ? 320 : payload.type === 'scene-decompose' ? 360 : payload.type === 'scene-understanding' ? 360 : 300
				} else if (payload.type === 'text-merge') {
					n.width = 420
					n.height = 320
				} else if (payload.type === 'text') {
					n.width = 360
					n.height = 260
				} else {
					n.width = 240
					n.height = 160
				}
			}

			const removeIds: string[] = []
			for (const edgeId of state.edgeOrder) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId !== id && e.toNodeId !== id) continue
				const fromNode = state.nodesById[e.fromNodeId]
				const toNode = state.nodesById[e.toNodeId]
				if (!fromNode || !toNode) {
					removeIds.push(edgeId)
					continue
				}
				if (!hasAnchor(fromNode, 'out', e.fromAnchorId) || !hasAnchor(toNode, 'in', e.toAnchorId)) {
					removeIds.push(edgeId)
					continue
				}
				if (!canLinkAnchors(state.nodesById, e.fromNodeId, e.fromAnchorId, e.toNodeId, e.toAnchorId)) removeIds.push(edgeId)
			}
			if (removeIds.length) {
				for (const edgeId of removeIds) delete state.edgesById[edgeId]
				state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
				if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
			}
		},
		textMergeAddItem(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id] as any
			if (!n || n.type !== 'text-merge') return
			const list = Array.isArray(n.textMergeItems) ? n.textMergeItems : []
			list.push({ id: makeId('merge') })
			n.textMergeItems = list
			syncTextMergeAnchors(n)
		},
		textMergeRemoveItem(state, payload: { nodeId: string; itemId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const itemId = String(payload?.itemId ?? '').trim()
			if (!id || !itemId) return
			const n = state.nodesById[id] as any
			if (!n || n.type !== 'text-merge') return
			const anchorId = `in-${itemId}`
			const list = Array.isArray(n.textMergeItems) ? n.textMergeItems : []
			n.textMergeItems = list.filter((x: any) => String(x?.id ?? '').trim() !== itemId)
			syncTextMergeAnchors(n)

			// cleanup edges bound to the removed input anchor
			const removeIds: string[] = []
			for (const edgeId of state.edgeOrder) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.toNodeId === id && e.toAnchorId === anchorId) removeIds.push(edgeId)
			}
			if (removeIds.length) {
				for (const edgeId of removeIds) delete state.edgesById[edgeId]
				state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
				if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
			}
		},
		textMergeMoveItem(state, payload: { nodeId: string; itemId: string; dir: 'up' | 'down' }) {
			const id = String(payload?.nodeId ?? '').trim()
			const itemId = String(payload?.itemId ?? '').trim()
			const dir = payload?.dir
			if (!id || !itemId) return
			const n = state.nodesById[id] as any
			if (!n || n.type !== 'text-merge') return
			const list = Array.isArray(n.textMergeItems) ? [...n.textMergeItems] : []
			const idx = list.findIndex((x: any) => String(x?.id ?? '').trim() === itemId)
			if (idx < 0) return
			const nextIdx = dir === 'up' ? idx - 1 : idx + 1
			if (nextIdx < 0 || nextIdx >= list.length) return
			const tmp = list[idx]
			list[idx] = list[nextIdx]
			list[nextIdx] = tmp
			n.textMergeItems = list
			syncTextMergeAnchors(n)
		},
		setNodeTextValue(state, payload: { nodeId: string; textValue: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'text') return
			n.textValue = typeof payload?.textValue === 'string' ? payload.textValue : String(payload?.textValue ?? '')
		},
		setNodeRotatePromptText(state, payload: { nodeId: string; text: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id] as any
			if (!n || n.type !== 'rotate-image') return
			n.rotatePromptText = typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '')
		},
		setNodeSceneUnderstandingSettings(state, payload: { nodeId: string; sceneUnderstandingSettings: Partial<WorkflowSceneUnderstandingNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'scene-understanding') return
			const next = payload?.sceneUnderstandingSettings
			if (!next || typeof next !== 'object') return
			n.sceneUnderstandingSettings = {
				...(n.sceneUnderstandingSettings ?? {}),
				...next,
			}
			syncSceneUnderstandAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeSceneLayoutSettings(state, payload: { nodeId: string; sceneLayoutSettings: Partial<WorkflowSceneLayoutNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'scene-layout') return
			const next = payload?.sceneLayoutSettings
			if (!next || typeof next !== 'object') return
			const keys = Object.keys(next as Record<string, unknown>)
			const selectionOnlyUpdate =
				keys.length > 0 &&
				keys.every((key) => key === 'selectedLayoutItemId' || key === 'selectedPlaceholderOutput')
			if (selectionOnlyUpdate) {
				const settings = (n.sceneLayoutSettings ??= {})
				const layoutItems = Array.isArray(settings.layoutItems) ? settings.layoutItems : []
				const validIds = new Set(layoutItems.map((item: any) => String(item?.id ?? '').trim()).filter(Boolean))
				const hidePlaceholderCubes = settings.hidePlaceholderCubes === true
				if (Object.prototype.hasOwnProperty.call(next, 'selectedLayoutItemId')) {
					const rawSelectedLayoutItemId = String((next as any).selectedLayoutItemId ?? '').trim()
					const normalizedSelectedLayoutItemId =
						!hidePlaceholderCubes && rawSelectedLayoutItemId && validIds.has(rawSelectedLayoutItemId)
							? rawSelectedLayoutItemId
							: ''
					if (normalizedSelectedLayoutItemId) settings.selectedLayoutItemId = normalizedSelectedLayoutItemId
					else delete settings.selectedLayoutItemId
				}
				if (Object.prototype.hasOwnProperty.call(next, 'selectedPlaceholderOutput')) {
					const rawSelectedPlaceholderOutput = String((next as any).selectedPlaceholderOutput ?? '').trim()
					const normalizedSelectedPlaceholderOutput =
						rawSelectedPlaceholderOutput && validIds.has(rawSelectedPlaceholderOutput)
							? rawSelectedPlaceholderOutput
							: ''
					if (normalizedSelectedPlaceholderOutput) settings.selectedPlaceholderOutput = normalizedSelectedPlaceholderOutput
					else delete settings.selectedPlaceholderOutput
				}
				return
			}
			n.sceneLayoutSettings = sanitizeSceneLayoutSettings({
				...(n.sceneLayoutSettings ?? {}),
				...next,
			})
			syncSceneLayoutAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeUnrealExportSettings(state, payload: { nodeId: string; unrealExportSettings: Partial<WorkflowUnrealExportNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'unreal-export') return
			const next = payload?.unrealExportSettings
			if (!next || typeof next !== 'object') return
			n.unrealExportSettings = {
				...(n.unrealExportSettings ?? {}),
				...normalizeUnrealExportSettings({ ...(n.unrealExportSettings ?? {}), ...next }),
			}
			syncUnrealExportAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeSceneDecomposeSettings(state, payload: { nodeId: string; sceneDecomposeSettings: Partial<WorkflowSceneDecomposeNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'scene-decompose') return
			const next = payload?.sceneDecomposeSettings
			if (!next || typeof next !== 'object') return
			n.sceneDecomposeSettings = {
				...(n.sceneDecomposeSettings ?? {}),
				...next,
			}
			syncSceneDecomposeAnchors(n)
		},
		setNodeComfyUISettings(state, payload: { nodeId: string; comfyuiSettings: Partial<WorkflowComfyUINodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'comfyui') return
			const next = payload?.comfyuiSettings
			if (!next || typeof next !== 'object') return
			n.comfyuiSettings = {
				...(n.comfyuiSettings ?? {}),
				...next,
			} as WorkflowComfyUINodeSettings
		},
		setNodeComfyUIWorkflowIO(
			state,
			payload: {
				nodeId: string
				workflowPath: string
				inputs: WorkflowAnchorSpec[]
				outputs: WorkflowAnchorSpec[]
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'comfyui') return
			const inputsRaw = Array.isArray(payload?.inputs) ? payload.inputs : []
			const outputsRaw = Array.isArray(payload?.outputs) ? payload.outputs : []
			const prompt = comfyPromptAnchors()
			const inputs = inputsRaw
				.map((a: any) => ({
					id: String(a?.id ?? '').trim(),
					label: typeof a?.label === 'string' ? a.label : undefined,
					offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined,
					mediaType: normalizeMediaType(a?.mediaType, { nodeType: 'comfyui', anchorId: String(a?.id ?? '') }),
				}))
				.filter((a: any) => a.id && a.id !== COMFY_PROMPT_POSITIVE_ANCHOR_ID && a.id !== COMFY_PROMPT_NEGATIVE_ANCHOR_ID)
			const outputs = outputsRaw
				.map((a: any) => ({
					id: String(a?.id ?? '').trim(),
					label: typeof a?.label === 'string' ? a.label : undefined,
					offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined,
					mediaType: normalizeMediaType(a?.mediaType, { nodeType: 'comfyui', anchorId: String(a?.id ?? '') }),
				}))
				.filter((a: any) => a.id)
			n.inputs = [...prompt, ...inputs]
			n.outputs = outputs.length ? outputs : [{ id: 'out-0', label: '产物输出', mediaType: 'generic' }]
		},
		setNodeImageSettings(
			state,
			payload: {
				nodeId: string
				imageSettings: {
					outputWidth?: number
					outputHeight?: number
					naturalWidth?: number
					naturalHeight?: number
					cropEnabled?: boolean
					crop?: { x: number; y: number; width: number; height: number }
				}
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (n.type !== 'image') return
			const next = payload?.imageSettings
			if (!next || typeof next !== 'object') return

			const outW = next.outputWidth != null ? Math.max(1, Math.floor(Number(next.outputWidth) || 1)) : undefined
			const outH = next.outputHeight != null ? Math.max(1, Math.floor(Number(next.outputHeight) || 1)) : undefined
			const natW = next.naturalWidth != null ? Math.max(1, Math.floor(Number(next.naturalWidth) || 1)) : undefined
			const natH = next.naturalHeight != null ? Math.max(1, Math.floor(Number(next.naturalHeight) || 1)) : undefined
			const cropEnabled = typeof next.cropEnabled === 'boolean' ? Boolean(next.cropEnabled) : undefined

			const cropRaw = next.crop
			const crop =
				cropRaw && typeof cropRaw === 'object'
					? {
						x: Math.max(0, Math.min(1, Number(cropRaw.x) || 0)),
						y: Math.max(0, Math.min(1, Number(cropRaw.y) || 0)),
						width: Math.max(0, Math.min(1, Number(cropRaw.width) || 0)),
						height: Math.max(0, Math.min(1, Number(cropRaw.height) || 0)),
					}
					: undefined

			n.imageSettings = {
				...(n.imageSettings ?? {}),
				...(outW != null ? { outputWidth: outW } : {}),
				...(outH != null ? { outputHeight: outH } : {}),
				...(natW != null ? { naturalWidth: natW } : {}),
				...(natH != null ? { naturalHeight: natH } : {}),
				...(cropEnabled != null ? { cropEnabled } : {}),
				...(crop ? { crop } : {}),
			}
		},
		setNodeModel3DSettings(state, payload: { nodeId: string; model3dSettings: Partial<WorkflowModel3DNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'model3d') return
			const next = payload?.model3dSettings
			if (!next || typeof next !== 'object') return

			const patch: Partial<WorkflowModel3DNodeSettings> = { ...next }
			if (patch.lightIntensity != null) patch.lightIntensity = Math.max(0, Math.min(10, Number(patch.lightIntensity) || 0))
			if (patch.renderWidth != null) patch.renderWidth = Math.max(1, Math.floor(Number(patch.renderWidth) || 1))
			if (patch.renderHeight != null) patch.renderHeight = Math.max(1, Math.floor(Number(patch.renderHeight) || 1))

			n.model3dSettings = {
				...(n.model3dSettings ?? {}),
				...patch,
			}
		},
		setNodeMeshySettings(state, payload: { nodeId: string; meshySettings: Partial<WorkflowMeshyNodeSettings> }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'meshy') return
			const next = payload?.meshySettings
			if (!next || typeof next !== 'object') return

			const patch: Partial<WorkflowMeshyNodeSettings> = { ...next }
			const current = n.meshySettings ?? {}
			const hasTarget = Object.prototype.hasOwnProperty.call(patch, 'meshyTaskTarget')
			const hasFamily = Object.prototype.hasOwnProperty.call(patch, 'meshyTaskFamily')
			const nextTarget = normalizeMeshyTaskTarget(patch.meshyTaskTarget) ?? current.meshyTaskTarget
			const fallbackFamily = current.meshyTaskFamily ?? getDefaultMeshyFamilyForTarget(nextTarget ?? '3d')
			const nextFamily = normalizeMeshyTaskFamily(
				hasFamily ? patch.meshyTaskFamily : fallbackFamily,
				nextTarget,
				patch.meshyMode ?? current.meshyMode,
				patch.meshyStage ?? current.meshyStage,
			)
			patch.meshyTaskTarget = nextTarget ?? inferMeshyTargetFromFamily(nextFamily)
			patch.meshyTaskFamily = hasTarget && !hasFamily ? getDefaultMeshyFamilyForTarget(patch.meshyTaskTarget) : nextFamily
			patch.meshyHelpTopic = String(patch.meshyHelpTopic ?? current.meshyHelpTopic ?? nextFamily)
			patch.meshyMode = meshyLegacyModeForFamily(nextFamily) ?? patch.meshyMode
			patch.meshyStage = meshyLegacyStageForFamily(nextFamily) ?? patch.meshyStage
			if (patch.meshyTargetPolycount != null) patch.meshyTargetPolycount = Math.max(100, Math.min(300000, Math.floor(Number(patch.meshyTargetPolycount) || 100)))
			if (patch.meshyAnimationActionId != null) patch.meshyAnimationActionId = Math.max(1, Math.floor(Number(patch.meshyAnimationActionId) || 1))
			if (patch.meshySeed != null) patch.meshySeed = Math.max(0, Math.floor(Number(patch.meshySeed) || 0))
			if (patch.meshyImageInputCount != null) patch.meshyImageInputCount = Math.max(0, Math.min(5, Math.floor(Number(patch.meshyImageInputCount) || 0)))
			if (patch.meshyOutputImageCount != null) patch.meshyOutputImageCount = Math.max(1, Math.min(4, Math.floor(Number(patch.meshyOutputImageCount) || 1))) as 1 | 2 | 3 | 4
			if (patch.meshyProgress != null) patch.meshyProgress = Math.max(0, Math.min(100, Number(patch.meshyProgress) || 0))
			if (patch.meshyImageUrls) patch.meshyImageUrls = patch.meshyImageUrls.map((x) => String(x ?? '').trim()).filter((x) => !!x).slice(0, 5)
			if (patch.meshyTargetFormats) patch.meshyTargetFormats = normalizeMeshyTargetFormats(patch.meshyTargetFormats)
			if (patch.meshyGenerateMultiView === true) {
				patch.meshyAspectRatio = undefined
			}

			const mergedPreview = {
				...(n.meshySettings ?? {}),
				...patch,
			}
			if ((mergedPreview.meshyTaskTarget ?? '3d') === 'image') {
				const family = mergedPreview.meshyTaskFamily ?? 'text-to-image'
				if (family === 'image-to-image') {
					patch.meshyImageInputCount = 5
				} else {
					patch.meshyImageInputCount = 0
				}
				if (patch.meshyOutputImageCount == null && current.meshyOutputImageCount == null) {
					patch.meshyOutputImageCount = 1
				}
				if (!mergedPreview.meshyAiModel || !['nano-banana', 'nano-banana-pro'].includes(String(mergedPreview.meshyAiModel))) {
					patch.meshyAiModel = 'nano-banana'
				}
			}
			if (patch.meshyOutputSummary && Array.isArray((patch.meshyOutputSummary as any).imageUrls)) {
				;(patch.meshyOutputSummary as any).imageUrls = (patch.meshyOutputSummary as any).imageUrls
					.map((x: any) => String(x ?? '').trim())
					.filter((x: string) => !!x)
					.slice(0, 4)
			}

			n.meshySettings = {
				...(n.meshySettings ?? {}),
				...patch,
			}
			syncMeshyAnchors(n)
		},
		setNodeVideoSettings(
			state,
			payload: {
				nodeId: string
				videoSettings: { outputWidth?: number; outputHeight?: number; naturalWidth?: number; naturalHeight?: number }
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'video') return
			const next = payload?.videoSettings
			if (!next || typeof next !== 'object') return
			const outW = next.outputWidth != null ? Math.max(1, Math.floor(Number(next.outputWidth) || 1)) : undefined
			const outH = next.outputHeight != null ? Math.max(1, Math.floor(Number(next.outputHeight) || 1)) : undefined
			const natW = next.naturalWidth != null ? Math.max(1, Math.floor(Number(next.naturalWidth) || 1)) : undefined
			const natH = next.naturalHeight != null ? Math.max(1, Math.floor(Number(next.naturalHeight) || 1)) : undefined
			n.videoSettings = {
				...(n.videoSettings ?? {}),
				...(outW != null ? { outputWidth: outW } : {}),
				...(outH != null ? { outputHeight: outH } : {}),
				...(natW != null ? { naturalWidth: natW } : {}),
				...(natH != null ? { naturalHeight: natH } : {}),
			}
		},
		setNodeStorySettings(
			state,
			payload: {
				nodeId: string
				storySettings: { previewWidth?: number; previewHeight?: number }
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story') return
			const next = payload?.storySettings
			if (!next || typeof next !== 'object') return
			const pw = next.previewWidth != null ? Math.max(1, Math.floor(Number(next.previewWidth) || 1)) : undefined
			const ph = next.previewHeight != null ? Math.max(1, Math.floor(Number(next.previewHeight) || 1)) : undefined
			n.storySettings = {
				...(n.storySettings ?? {}),
				...(pw != null ? { previewWidth: pw } : {}),
				...(ph != null ? { previewHeight: ph } : {}),
			}
		},
		setNodeResource(state, payload: { nodeId: string; resourceId: string | null }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			const rid = payload?.resourceId
				n.resourceId = rid ? String(rid) : null
				if (!n.resourceId) n.resourcePath = undefined
		},
			setNodeResourcePath(state, payload: { nodeId: string; resourcePath?: string | null }) {
				const id = String(payload?.nodeId ?? '').trim()
				if (!id) return
				const n = state.nodesById[id]
				if (!n) return
				const p = payload?.resourcePath
				const next = typeof p === 'string' ? p.trim() : ''
				n.resourcePath = next ? next : undefined
			},
		setNodeSize(state, payload: { nodeId: string; width?: number; height?: number; customized?: boolean }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.width != null) {
				const w = Number(payload.width)
				if (Number.isFinite(w)) n.width = Math.max(80, Math.min(1000, w))
			}
			if (payload.height != null) {
				const h = Number(payload.height)
				if (Number.isFinite(h)) n.height = Math.max(80, Math.min(1000, h))
			}
			if (payload.customized !== false) n.sizeCustomized = true
			if (n.type === 'story') syncStoryAnchors(n)
		},
		addStoryBranch(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story') return
			ensureStoryBranches(n)
			n.branches!.push({ id: makeId('branch'), text: '剧情分支' })
			syncStoryAnchors(n)
		},
		removeStoryBranch(state, payload: { nodeId: string; branchId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const branchId = String(payload?.branchId ?? '').trim()
			if (!id || !branchId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story' || !n.branches) return
			const anchorId = `out-${branchId}`
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === id && e.fromAnchorId === anchorId) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			n.branches = n.branches.filter((b) => b.id !== branchId)
			ensureStoryBranches(n)
			syncStoryAnchors(n)
		},
		updateStoryBranch(state, payload: { nodeId: string; branchId: string; text: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const branchId = String(payload?.branchId ?? '').trim()
			if (!id || !branchId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story' || !n.branches) return
			const branch = n.branches.find((b) => b.id === branchId)
			if (!branch) return
			branch.text = String(payload?.text ?? '')
			syncStoryAnchors(n)
		},
		copyNode(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const selected = state.selectedNodeIds.includes(id) ? state.selectedNodeIds : [id]
			const ids = normalizeNodeIds(state, selected)
			if (!ids.length) return
			if (ids.length === 1) {
				const n = state.nodesById[ids[0]]
				if (!n) return
				state.clipboardNode = { ...n, inputs: [...n.inputs], outputs: [...n.outputs] }
				state.clipboardNodes = null
				state.clipboardPrimaryNodeId = null
				return
			}
			state.clipboardNodes = ids
				.map((nid) => state.nodesById[nid])
				.filter(Boolean)
				.map((n) => ({ ...n, inputs: [...n.inputs], outputs: [...n.outputs] }))
			state.clipboardPrimaryNodeId = state.selectedNodeId && ids.includes(state.selectedNodeId)
				? state.selectedNodeId
				: ids[0]
			state.clipboardNode = null
		},
		pasteNode(state, payload: { worldX?: number; worldY?: number }) {
			if (Array.isArray(state.clipboardNodes) && state.clipboardNodes.length >= 2) {
				const srcNodes = state.clipboardNodes
				const primaryId = state.clipboardPrimaryNodeId
				const primary = (primaryId && srcNodes.find((n) => n.id === primaryId)) ?? srcNodes[0]
				if (!primary) return
				const dx = 20
				const dy = 20
				const targetX = payload?.worldX != null ? Number(payload.worldX) : primary.worldX + dx
				const targetY = payload?.worldY != null ? Number(payload.worldY) : primary.worldY + dy
				if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return
				const shiftX = targetX - primary.worldX
				const shiftY = targetY - primary.worldY

				const newIds: string[] = []
				for (const src of srcNodes) {
					const id = makeId('wf-node')
					const node: WorkflowNode = {
						...src,
						id,
						worldX: src.worldX + shiftX,
						worldY: src.worldY + shiftY,
						createdAt: Date.now(),
					}
					state.nodesById[id] = node
					state.nodeOrder.push(id)
					newIds.push(id)
				}
				state.selectedNodeIds = newIds
				state.selectedNodeId = newIds[0] ?? null
				state.selectedEdgeId = null
				return
			}

			const src = state.clipboardNode
			if (!src) return
			const id = makeId('wf-node')
			const dx = 20
			const dy = 20
			const nextX = payload?.worldX != null ? Number(payload.worldX) : src.worldX + dx
			const nextY = payload?.worldY != null ? Number(payload.worldY) : src.worldY + dy
			const node: WorkflowNode = {
				...src,
				id,
				alias: src.alias ? `${src.alias}` : src.alias,
				worldX: Number.isFinite(nextX) ? nextX : src.worldX + dx,
				worldY: Number.isFinite(nextY) ? nextY : src.worldY + dy,
				createdAt: Date.now(),
			}
			state.nodesById[id] = node
			state.nodeOrder.push(id)
			state.selectedNodeId = id
			state.selectedNodeIds = [id]
			state.selectedEdgeId = null
		},
		clearSelection(state) {
			state.selectedNodeId = null
			state.selectedNodeIds = []
			state.selectedEdgeId = null
		},
		moveSelectedNodesByDelta(state, payload: { dx?: number; dy?: number }) {
			const dx = payload?.dx != null ? Number(payload.dx) : 0
			const dy = payload?.dy != null ? Number(payload.dy) : 0
			if (!Number.isFinite(dx) && !Number.isFinite(dy)) return
			const moveX = Number.isFinite(dx) ? dx : 0
			const moveY = Number.isFinite(dy) ? dy : 0
			const ids = normalizeNodeIds(state, state.selectedNodeIds)
			if (!ids.length) return
			for (const id of ids) {
				const n = state.nodesById[id]
				if (!n) continue
				n.worldX += moveX
				n.worldY += moveY
			}
		},
		removeSelectedNodes(state) {
			const ids = normalizeNodeIds(state, state.selectedNodeIds)
			if (!ids.length) return
			for (const id of ids) {
				delete state.nodesById[id]
			}
			state.nodeOrder = state.nodeOrder.filter((x) => !!state.nodesById[x])
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (!state.nodesById[e.fromNodeId] || !state.nodesById[e.toNodeId]) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			state.selectedNodeId = state.nodeOrder[0] ?? null
			state.selectedNodeIds = state.selectedNodeId ? [state.selectedNodeId] : []
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
		},
		upsertNode(state, payload: { node: WorkflowNode }) {
			const n = payload?.node
			if (!n || typeof n !== 'object') return
			const id = String((n as any).id ?? '').trim()
			if (!id) return
			const prev = state.nodesById[id]
			state.nodesById[id] = {
				...(prev ?? {}),
				...n,
				id,
				worldX: Number.isFinite(Number((n as any).worldX)) ? Number((n as any).worldX) : Number((prev as any)?.worldX ?? 0),
				worldY: Number.isFinite(Number((n as any).worldY)) ? Number((n as any).worldY) : Number((prev as any)?.worldY ?? 0),
				inputs: Array.isArray((n as any).inputs) ? ((n as any).inputs as any) : (prev?.inputs ?? []),
				outputs: Array.isArray((n as any).outputs) ? ((n as any).outputs as any) : (prev?.outputs ?? []),
				createdAt: Number.isFinite(Number((n as any).createdAt)) ? Number((n as any).createdAt) : (prev?.createdAt ?? Date.now()),
			}
			const next = state.nodesById[id]
			if (next.type === 'story') syncStoryAnchors(next)
			if (next.type === 'scene-layout') syncSceneLayoutAnchors(next)
			if (next.type === 'scene-decompose') syncSceneDecomposeAnchors(next)
			enforceSingleIOAnchors(next)
			if (!state.nodeOrder.includes(id)) state.nodeOrder.push(id)
		},
		addNodeAt(state, payload: { worldX: number; worldY: number; title?: string }) {
			const id = makeId('wf-node')
			const title = String(payload?.title ?? '工作流节点')
			const node: WorkflowNode = {
				id,
				type: 'base',
				title,
				alias: defaultAliasForType('base'),
				subtitle: '入口参数 / 出口结果',
				worldX: Number(payload?.worldX ?? 0) || 0,
				worldY: Number(payload?.worldY ?? 0) || 0,
				width: 240,
				height: 160,
				sizeCustomized: false,
				resourceId: null,
				inputs: [{ id: 'in-0', label: '入口' }],
				outputs: [{ id: 'out-0', label: '出口' }],
				createdAt: Date.now(),
			}
			state.nodesById[id] = node
			state.nodeOrder.push(id)
			state.selectedNodeId = id
			state.selectedEdgeId = null
		},
		setNodePosition(state, payload: { nodeId: string; worldX?: number; worldY?: number }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.worldX != null) {
				const x = Number(payload.worldX)
				if (Number.isFinite(x)) n.worldX = x
			}
			if (payload.worldY != null) {
				const y = Number(payload.worldY)
				if (Number.isFinite(y)) n.worldY = y
			}
		},
		removeNode(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			delete state.nodesById[id]
			state.nodeOrder = state.nodeOrder.filter((x) => x !== id)
			// 清理关联连线
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === id || e.toNodeId === id) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			state.selectedNodeIds = state.selectedNodeIds.filter((x) => x !== id)
			if (state.selectedNodeId === id) state.selectedNodeId = state.nodeOrder[0] ?? null
			if (state.selectedNodeId && !state.selectedNodeIds.includes(state.selectedNodeId)) {
				state.selectedNodeIds = [state.selectedNodeId]
			}
		},
		addEdge(state, payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }) {
			const fromNodeId = String(payload?.fromNodeId ?? '').trim()
			const toNodeId = String(payload?.toNodeId ?? '').trim()
			if (!fromNodeId || !toNodeId) return
			if (!state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) return
			const toAnchorId = String(payload?.toAnchorId ?? 'in-0')
			// Check if the input anchor supports multiple connections
			const toNode = state.nodesById[toNodeId]
			const inputAnchor = Array.isArray(toNode.inputs) ? toNode.inputs.find((a) => a.id === toAnchorId) : null
			const supportsMultiInput = inputAnchor?.multiInput === true
			// Only replace existing connection if multiInput is not enabled
			if (!supportsMultiInput) {
				for (const edgeId of state.edgeOrder.slice()) {
					const e = state.edgesById[edgeId]
					if (!e) continue
					if (e.toNodeId === toNodeId && e.toAnchorId === toAnchorId) {
						delete state.edgesById[edgeId]
					}
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			const id = makeId('wf-edge')
			const edge: WorkflowEdge = {
				id,
				fromNodeId,
				fromAnchorId: String(payload?.fromAnchorId ?? 'out-0'),
				toNodeId,
				toAnchorId,
				createdAt: Date.now(),
			}
			state.edgesById[id] = edge
			state.edgeOrder.push(id)
			state.selectedEdgeId = id
			state.selectedNodeId = null
			state.selectedNodeIds = []
		},
		removeEdge(state, payload: { edgeId: string }) {
			const id = String(payload?.edgeId ?? '').trim()
			if (!id) return
			delete state.edgesById[id]
			state.edgeOrder = state.edgeOrder.filter((x) => x !== id)
			if (state.selectedEdgeId === id) state.selectedEdgeId = null
		},
		removeEdgesFromAnchor(state, payload: { nodeId: string; anchorId: string }) {
			const nodeId = String(payload?.nodeId ?? '').trim()
			const anchorId = String(payload?.anchorId ?? '').trim()
			if (!nodeId || !anchorId) return
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === nodeId && e.fromAnchorId === anchorId) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
		},
		openNodeChatDialog(state, payload: { nodeId: string; nodeType: WorkflowNodeChatType }) {
			state.nodeChatDialog.visible = true
			state.nodeChatDialog.nodeId = payload.nodeId
			state.nodeChatDialog.nodeType = payload.nodeType
			const node = state.nodesById[payload.nodeId]
			state.nodeChatDialog.draft = node?.nodeChatDraft ?? ''
			state.nodeChatDialog.submitting = false
			state.nodeChatDialog.params = node?.nodeChatParams ?? {}
		},
		closeNodeChatDialog(state) {
			state.nodeChatDialog.visible = false
			state.nodeChatDialog.nodeId = null
			state.nodeChatDialog.nodeType = null
			state.nodeChatDialog.draft = ''
			state.nodeChatDialog.submitting = false
		},
		setNodeChatDraft(state, payload: { text: string }) {
			state.nodeChatDialog.draft = payload.text
			if (state.nodeChatDialog.nodeId) {
				const node = state.nodesById[state.nodeChatDialog.nodeId]
				if (node) {
					node.nodeChatDraft = payload.text
				}
			}
		},
		setNodeChatParams(state, payload: { params: Record<string, any> }) {
			state.nodeChatDialog.params = payload.params
			if (state.nodeChatDialog.nodeId) {
				const node = state.nodesById[state.nodeChatDialog.nodeId]
				if (node) {
					node.nodeChatParams = payload.params
				}
			}
		},
		setNodeChatSubmitting(state, payload: { submitting: boolean }) {
			state.nodeChatDialog.submitting = payload.submitting
		},
	},
	actions: {
		setChatDraft({ commit }, payload: { text: string }) {
			commit('setChatDraft', payload)
		},
		resetViewport({ commit }) {
			commit('resetViewport')
		},
		setViewport({ commit }, payload: Partial<WorkflowViewport>) {
			commit('setViewport', payload)
		},
		upsertNode({ commit }, payload: { node: WorkflowNode }) {
			commit('upsertNode', payload)
		},
		addNodeAt({ commit }, payload: { worldX: number; worldY: number; title?: string }) {
			commit('addNodeAt', payload)
		},
		setNodePosition({ commit }, payload: { nodeId: string; worldX?: number; worldY?: number }) {
			commit('setNodePosition', payload)
		},
		removeNode({ commit }, payload: { nodeId: string }) {
			commit('removeNode', payload)
		},
		setSelectedNode({ commit }, payload: { nodeId: string | null }) {
			commit('setSelectedNode', payload)
		},
		setSelectedEdge({ commit }, payload: { edgeId: string | null }) {
			commit('setSelectedEdge', payload)
		},
		addEdge(
			{ commit },
			payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }
		) {
			commit('addEdge', payload)
		},
		removeEdge({ commit }, payload: { edgeId: string }) {
			commit('removeEdge', payload)
		},
		openNodeChatDialog({ commit, state }, payload: { nodeId: string }) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const nodeType = node.type as WorkflowNodeChatType
			if (nodeType !== 'text' && nodeType !== 'image' && nodeType !== 'video' && nodeType !== 'model3d') return
			commit('openNodeChatDialog', { nodeId: payload.nodeId, nodeType })
		},
		closeNodeChatDialog({ commit }) {
			commit('closeNodeChatDialog')
		},
		setNodeChatDraft({ commit }, payload: { text: string }) {
			commit('setNodeChatDraft', payload)
		},
		setNodeChatParams({ commit }, payload: { params: Record<string, any> }) {
			commit('setNodeChatParams', payload)
		},
		submitNodeChat({ commit, state }, payload: WorkflowNodeChatSubmitPayload) {
			commit('setNodeChatSubmitting', { submitting: true })
			console.log('[AIWorkflow] submitNodeChat:', payload)
			setTimeout(() => {
				commit('setNodeChatSubmitting', { submitting: false })
				commit('closeNodeChatDialog')
			}, 1500)
		},
	},
})
