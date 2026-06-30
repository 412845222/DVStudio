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
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutOrientationFix,
	WorkflowUnrealExportNodeSettings,
	WorkflowSceneUnderstandingNodeSettings,
	WorkflowState,
	WorkflowViewport,
	WorkflowComfyUINodeSettings,
	WorkflowImageNodeSettings,
	WorkflowVideoNodeSettings,
	WorkflowMeshyNodeSettings,
	WorkflowMeshyTaskFamily,
	WorkflowMeshyTaskTarget,
	WorkflowNodeChatType,
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowSelectionTag,
	SavedSelectionFrame,
	WorkflowModel3DNodeSettings
} from '../../aiworkflow/types'
import type { WorkflowResource } from '../../aiworkflow/resource/types'
import { canLinkAnchors, normalizeAnchorMediaType } from '../../aiworkflow/domain/link/anchorKinds'
import { isString, isNumber, isBoolean, isRecord, isArray } from '../../types/utils'

export type AIWorkflowState = WorkflowState

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

const normalizeSceneLayoutLightingControls = (
	raw: unknown
): WorkflowSceneLayoutLightingControls => {
	const rawObj = isRecord(raw) ? raw : {}
	const clampControl = (value: unknown, min: number, max: number, fallback: number) => {
		const num = Number(value)
		if (!Number.isFinite(num)) return fallback
		return Math.max(min, Math.min(max, num))
	}
	return {
		masterIntensity: clampControl(rawObj.masterIntensity, 0, 2.5, 1),
		exposure: clampControl(rawObj.exposure, 0.4, 2.5, 1),
		ambient: clampControl(rawObj.ambient, 0, 2.5, 1),
		hemisphere: clampControl(rawObj.hemisphere, 0, 2.5, 1),
		directional: clampControl(rawObj.directional, 0, 2.5, 1),
		point: clampControl(rawObj.point, 0, 2.5, 1),
		spot: clampControl(rawObj.spot, 0, 2.5, 1),
		rectArea: clampControl(rawObj.rectArea, 0, 2.5, 1)
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
		createdAt: Date.now()
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
			params: {}
		},
		nodeGenerationTasksById: {},
		nodeGenerationTaskIdsByNodeId: {},
		selectionTagsByKey: {},
		savedSelectionFrames: [],
		nodeCheckboxVisible: true,
		projectId: null,
		projectRootPath: ''
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
	v: unknown,
	context: { node?: WorkflowNode; nodeType?: string; anchorId?: string } = {}
): WorkflowAnchorSpec['mediaType'] | undefined => normalizeAnchorMediaType(v, context)

const isSingleIOBaseNodeType = (type: string): type is 'text' | 'image' | 'video' | 'model3d' =>
	type === 'text' || type === 'image' || type === 'video' || type === 'model3d'

const singleIOAnchorsForNodeType = (
	type: string
): { inputs: WorkflowAnchorSpec[]; outputs: WorkflowAnchorSpec[] } | null => {
	if (type === 'text') {
		return {
			inputs: [{ id: 'in-0', label: '输入', mediaType: 'text', multiInput: true }],
			outputs: [{ id: 'out-0', label: '文本输出', mediaType: 'text' }]
		}
	}
	if (type === 'image') {
		return {
			inputs: [{ id: 'in-0', label: '图片输入', multiInput: true }],
			outputs: [{ id: 'out-0', label: '图片输出', mediaType: 'image' }]
		}
	}
	if (type === 'video') {
		return {
			inputs: [{ id: 'in-0', label: '视频输入', multiInput: true }],
			outputs: [{ id: 'out-0', label: '视频输出', mediaType: 'video' }]
		}
	}
	if (type === 'model3d') {
		return {
			inputs: [
				{ id: 'in-resource', label: '资源', mediaType: 'generic' },
				{ id: 'in-text', label: '提示词', mediaType: 'text' },
				{ id: 'in-image-1', label: '参考图 1', mediaType: 'image' },
				{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
				{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
				{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' }
			],
			outputs: [
				{ id: 'out-0', label: '模型输出', mediaType: 'model3d' },
				{ id: 'out-image', label: '预览图', mediaType: 'image' }
			]
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
		if (nextAnchorId === 'in-0' || nextAnchorId === 'in-model') return 'in-resource'
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
	const footerHeight =
		STORY_BRANCH_PAD * 2 + rows * STORY_BRANCH_ROW + (rows - 1) * STORY_BRANCH_GAP
	const footerTop = height / 2 - NODE_PADDING_BOTTOM - footerHeight
	return (
		footerTop +
		STORY_BRANCH_PAD +
		STORY_BRANCH_ROW / 2 +
		index * (STORY_BRANCH_ROW + STORY_BRANCH_GAP)
	)
}

const ensureStoryBranches = (node: WorkflowNode) => {
	if (!node.branches || !node.branches.length) {
		node.branches = [{ id: makeId('branch'), text: '剧情分支' }]
	}
}

const ensureTextMergeItems = (node: WorkflowNode) => {
	const raw = node.textMergeItems
	if (!Array.isArray(raw)) {
		node.textMergeItems = [{ id: makeId('merge') }]
		return
	}
	node.textMergeItems = raw
		.map((x: unknown) => {
			const item = isRecord(x) ? x : {}
			return { id: String(item.id ?? '').trim() }
		})
		.filter((x: { id: string }) => x.id)
}

const syncTextMergeAnchors = (node: WorkflowNode) => {
	ensureTextMergeItems(node)
	const items = Array.isArray(node.textMergeItems) ? node.textMergeItems : []
	node.inputs = items.map((it: { id: string }, idx: number) => ({
		id: `in-${String(it.id)}`,
		label: `拼接${idx + 1}`,
		mediaType: 'text' as const
	}))
	node.outputs = [{ id: 'out-text', label: '整合文本', mediaType: 'text' as const }]
}

const syncStoryAnchors = (node: WorkflowNode) => {
	ensureStoryBranches(node)
	const height = Number.isFinite(node.height) ? node.height : 160
	const inputOffset = (STORY_INPUT_SIZE + STORY_INPUT_GAP) / 2
	node.inputs = [
		{ id: 'in-flow', label: '剧情流程', offsetY: -inputOffset, mediaType: 'flow' },
		{ id: 'in-resource', label: '资源来源', offsetY: inputOffset }
	]
	node.outputs = node.branches!.map((b, idx) => ({
		id: `out-${b.id}`,
		label: b.text ? b.text : `分支${idx + 1}`,
		offsetY: storyBranchOffset(idx, node.branches!.length, height),
		mediaType: 'flow'
	}))
}

const COMFY_PROMPT_POSITIVE_ANCHOR_ID = 'in-positive'
const COMFY_PROMPT_NEGATIVE_ANCHOR_ID = 'in-negative'

const comfyPromptAnchors = (): WorkflowAnchorSpec[] => {
	return [
		{ id: COMFY_PROMPT_POSITIVE_ANCHOR_ID, label: '正向提示词', mediaType: 'text' },
		{ id: COMFY_PROMPT_NEGATIVE_ANCHOR_ID, label: '负向提示词', mediaType: 'text' }
	]
}

const normalizeSceneUnderstandingSettings = (
	rawSettings: unknown
): WorkflowSceneUnderstandingNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const availableModels = isArray(raw.availableModels)
		? raw.availableModels
				.map((item: unknown) => {
					const itemObj = isRecord(item) ? item : {}
					return {
						id: String(itemObj.id ?? '').trim(),
						label: String(itemObj.label ?? itemObj.id ?? '').trim(),
						supportsVision: isBoolean(itemObj.supportsVision) ? itemObj.supportsVision : undefined,
						supportsStructuredOutput: isBoolean(itemObj.supportsStructuredOutput)
							? itemObj.supportsStructuredOutput
							: undefined,
						recommended: isBoolean(itemObj.recommended) ? itemObj.recommended : undefined,
						vendor: isString(itemObj.vendor) ? itemObj.vendor : undefined
					}
				})
				.filter((item) => item.id)
		: undefined
	return {
		mode: raw.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout',
		selectedModel: isString(raw.selectedModel) ? raw.selectedModel : undefined,
		availableModels,
		status:
			raw.status === 'loading-models' ||
			raw.status === 'running' ||
			raw.status === 'completed' ||
			raw.status === 'error' ||
			raw.status === 'canceled'
				? raw.status
				: 'idle',
		message: isString(raw.message) ? raw.message : undefined,
		statusText: isString(raw.statusText) ? raw.statusText : undefined,
		progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : undefined,
		provider: isString(raw.provider) ? raw.provider : undefined,
		providerStatusText: isString(raw.providerStatusText) ? raw.providerStatusText : undefined,
		remoteStatusCode: Number.isFinite(Number(raw.remoteStatusCode))
			? Number(raw.remoteStatusCode)
			: undefined,
		outputJson: isString(raw.outputJson) ? raw.outputJson : undefined,
		rawOutput: isString(raw.rawOutput) ? raw.rawOutput : undefined,
		resultSummary: isString(raw.resultSummary) ? raw.resultSummary : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		lastInputImageUrl: isString(raw.lastInputImageUrl) ? raw.lastInputImageUrl : undefined,
		lastInputImageUrls: isArray(raw.lastInputImageUrls)
			? raw.lastInputImageUrls
					.map((x: unknown) => String(x ?? '').trim())
					.filter((x: string) => !!x)
					.slice(0, 4)
			: undefined,
		lastInputPrompt: isString(raw.lastInputPrompt) ? raw.lastInputPrompt : undefined,
		lastInputLayoutJson: isString(raw.lastInputLayoutJson) ? raw.lastInputLayoutJson : undefined,
		rewriteUsed: isBoolean(raw.rewriteUsed) ? raw.rewriteUsed : undefined,
		rewriteAttempts: Number.isFinite(Number(raw.rewriteAttempts))
			? Number(raw.rewriteAttempts)
			: undefined,
		mock: isBoolean(raw.mock) ? raw.mock : undefined
	}
}

const normalizeSceneLayoutSettings = (
	rawSettings: unknown
): WorkflowSceneLayoutNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const normalizeOrientationFix = (fix: unknown): WorkflowSceneLayoutOrientationFix | undefined => {
		if (!fix || !isRecord(fix)) return undefined
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
			updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined
		}
	}
	const layoutItems = isArray(raw.layoutItems)
		? (raw.layoutItems
				.map((item: unknown) => {
					const itemObj = isRecord(item) ? item : {}
					const positionObj = isRecord(itemObj.position) ? itemObj.position : {}
					const sizeObj = isRecord(itemObj.size) ? itemObj.size : {}
					const rotationObj = isRecord(itemObj.rotation) ? itemObj.rotation : undefined
					const scaleObj = isRecord(itemObj.scale) ? itemObj.scale : undefined
					return {
						id: String(itemObj.id ?? '').trim(),
						name: isString(itemObj.name) ? itemObj.name : undefined,
						previewScaleMode:
							itemObj.previewScaleMode === 'model'
								? 'model'
								: itemObj.previewScaleMode === 'placeholder'
									? 'placeholder'
									: undefined,
						orientationFix: normalizeOrientationFix(itemObj.orientationFix),
						fillMode:
							itemObj.fillMode === 'fill-x' ||
							itemObj.fillMode === 'fill-y' ||
							itemObj.fillMode === 'fill-z'
								? itemObj.fillMode
								: undefined,
						fillCount: Number.isFinite(Number(itemObj.fillCount))
							? Math.max(2, Math.min(32, Math.floor(Number(itemObj.fillCount))))
							: undefined,
						fillAxisScale: Number.isFinite(Number(itemObj.fillAxisScale))
							? Number(itemObj.fillAxisScale)
							: undefined,
						fillUpdatedAt: Number.isFinite(Number(itemObj.fillUpdatedAt))
							? Number(itemObj.fillUpdatedAt)
							: undefined,
						fitMode:
							itemObj.fitMode === 'normal' ||
							itemObj.fitMode === 'oriented' ||
							itemObj.fitMode === 'filled' ||
							itemObj.fitMode === 'forced'
								? itemObj.fitMode
								: undefined,
						fitMessage: isString(itemObj.fitMessage) ? itemObj.fitMessage : undefined,
						fitUpdatedAt: Number.isFinite(Number(itemObj.fitUpdatedAt))
							? Number(itemObj.fitUpdatedAt)
							: undefined,
						description: isString(itemObj.description) ? itemObj.description : undefined,
						category: isString(itemObj.category) ? itemObj.category : undefined,
						subCategory: isString(itemObj.subCategory) ? itemObj.subCategory : undefined,
						material: isString(itemObj.material) ? itemObj.material : undefined,
						surfaceType: isString(itemObj.surfaceType) ? itemObj.surfaceType : undefined,
						color: isString(itemObj.color) ? itemObj.color : undefined,
						sameTypeGroupId: isString(itemObj.sameTypeGroupId)
							? itemObj.sameTypeGroupId
							: undefined,
						sameTypeGroupLabel: isString(itemObj.sameTypeGroupLabel)
							? itemObj.sameTypeGroupLabel
							: undefined,
						isKeyElement: isBoolean(itemObj.isKeyElement) ? itemObj.isKeyElement : undefined,
						keyElementType: isString(itemObj.keyElementType) ? itemObj.keyElementType : undefined,
						fixedInRoom: isBoolean(itemObj.fixedInRoom) ? itemObj.fixedInRoom : undefined,
						semanticRole: isString(itemObj.semanticRole) ? itemObj.semanticRole : undefined,
						mountType: isString(itemObj.mountType) ? itemObj.mountType : undefined,
						shouldTouchGround: isBoolean(itemObj.shouldTouchGround)
							? itemObj.shouldTouchGround
							: undefined,
						groundReason: isString(itemObj.groundReason) ? itemObj.groundReason : undefined,
						relationTags: isArray(itemObj.relationTags)
							? itemObj.relationTags
									.map((tag: unknown) => String(tag ?? '').trim())
									.filter((tag: string) => !!tag)
							: undefined,
						layoutPriority: Number.isFinite(Number(itemObj.layoutPriority))
							? Number(itemObj.layoutPriority)
							: undefined,
						parentId: isString(itemObj.parentId) ? itemObj.parentId : undefined,
						placement: isString(itemObj.placement) ? itemObj.placement : undefined,
						supportSurface: isString(itemObj.supportSurface) ? itemObj.supportSurface : undefined,
						anchor: isString(itemObj.anchor) ? itemObj.anchor : undefined,
						wallRole: isString(itemObj.wallRole) ? itemObj.wallRole : undefined,
						proximityGroupId: isString(itemObj.proximityGroupId)
							? itemObj.proximityGroupId
							: undefined,
						relationReason: isString(itemObj.relationReason) ? itemObj.relationReason : undefined,
						inferred: isBoolean(itemObj.inferred) ? itemObj.inferred : undefined,
						sourceImageIndex: Number.isFinite(Number(itemObj.sourceImageIndex))
							? Math.max(1, Math.floor(Number(itemObj.sourceImageIndex)))
							: undefined,
						observedImageIndices: isArray(itemObj.observedImageIndices)
							? itemObj.observedImageIndices
									.map((value: unknown) => Number(value))
									.filter((value: number) => Number.isFinite(value) && value > 0)
							: undefined,
						imageRect: normalizeWorkflowImageCrop(itemObj.imageRect),
						imageRectPixels: normalizeWorkflowPixelRect(itemObj.imageRectPixels),
						position: {
							x: Number.isFinite(Number(positionObj.x)) ? Number(positionObj.x) : 0,
							y: Number.isFinite(Number(positionObj.y)) ? Number(positionObj.y) : 0,
							z: Number.isFinite(Number(positionObj.z)) ? Number(positionObj.z) : 0
						},
						size: {
							width: Math.max(0.05, Number(sizeObj.width) || 1),
							height: Math.max(0.05, Number(sizeObj.height) || 1),
							depth: Math.max(0.05, Number(sizeObj.depth) || 1)
						},
						rotation: rotationObj
							? {
									yaw: Number.isFinite(Number(rotationObj.yaw))
										? Number(rotationObj.yaw)
										: undefined,
									pitch: Number.isFinite(Number(rotationObj.pitch))
										? Number(rotationObj.pitch)
										: undefined,
									roll: Number.isFinite(Number(rotationObj.roll))
										? Number(rotationObj.roll)
										: undefined
								}
							: undefined,
						scale: scaleObj
							? {
									x: Number.isFinite(Number(scaleObj.x)) ? Number(scaleObj.x) : undefined,
									y: Number.isFinite(Number(scaleObj.y)) ? Number(scaleObj.y) : undefined,
									z: Number.isFinite(Number(scaleObj.z)) ? Number(scaleObj.z) : undefined
								}
							: undefined
					}
				})
				.filter((item) => item.id) as WorkflowSceneLayoutItem[])
		: undefined
	const manualModelBindings = isArray(raw.manualModelBindings)
		? raw.manualModelBindings
				.map((item: unknown) => {
					const itemObj = isRecord(item) ? item : {}
					const objectId = String(itemObj.objectId ?? '').trim()
					if (!objectId) return null
					const modelUrl = isString(itemObj.modelUrl) ? String(itemObj.modelUrl).trim() : ''
					const modelAssetUrl = isString(itemObj.modelAssetUrl)
						? String(itemObj.modelAssetUrl).trim()
						: ''
					const modelSourceName = isString(itemObj.modelSourceName)
						? String(itemObj.modelSourceName)
						: undefined
					const modelSourcePath = isString(itemObj.modelSourcePath)
						? String(itemObj.modelSourcePath)
						: undefined
					const modelAssetPath = isString(itemObj.modelAssetPath)
						? String(itemObj.modelAssetPath)
						: undefined
					const modelFormat =
						itemObj.modelFormat === 'gltf'
							? 'gltf'
							: itemObj.modelFormat === 'glb'
								? 'glb'
								: undefined
					if (!modelUrl && !modelAssetUrl) return null
					return {
						objectId,
						modelUrl: modelUrl || undefined,
						modelAssetUrl: modelAssetUrl || undefined,
						modelSourceName,
						modelSourcePath,
						modelAssetPath,
						modelFormat
					} as WorkflowSceneLayoutManualModelBinding
				})
				.filter(
					(
						item: WorkflowSceneLayoutManualModelBinding | null
					): item is WorkflowSceneLayoutManualModelBinding => Boolean(item)
				)
		: undefined
	const normalizedLayoutIds = new Set(
		(layoutItems ?? []).map((item) => String(item?.id ?? '').trim()).filter(Boolean)
	)
	const selectedLayoutItemId = String(raw.selectedLayoutItemId ?? '').trim()
	const selectedPlaceholderOutput = String(raw.selectedPlaceholderOutput ?? '').trim()
	const lightingControls = normalizeSceneLayoutLightingControls(raw.lightingControls)
	const cameraObj = isRecord(raw.camera) ? raw.camera : undefined
	const cameraPositionObj =
		cameraObj && isRecord(cameraObj.position) ? cameraObj.position : undefined
	const cameraTargetObj = cameraObj && isRecord(cameraObj.target) ? cameraObj.target : undefined
	return {
		status:
			raw.status === 'running' || raw.status === 'completed' || raw.status === 'error'
				? raw.status
				: 'idle',
		message: isString(raw.message) ? raw.message : undefined,
		inputJson: isString(raw.inputJson) ? raw.inputJson : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		previewMode: raw.previewMode === true,
		lightingPreviewEnabled: raw.lightingPreviewEnabled === true,
		lightingDebugEnabled: raw.lightingDebugEnabled === true,
		lightingControls,
		hidePlaceholderCubes: raw.hidePlaceholderCubes === true,
		selectedLayoutItemId:
			selectedLayoutItemId &&
			normalizedLayoutIds.has(selectedLayoutItemId) &&
			raw.hidePlaceholderCubes !== true
				? selectedLayoutItemId
				: undefined,
		selectedPlaceholderOutput:
			selectedPlaceholderOutput && normalizedLayoutIds.has(selectedPlaceholderOutput)
				? selectedPlaceholderOutput
				: undefined,
		layoutItems,
		manualModelBindings,
		camera: cameraObj
			? {
					position: cameraPositionObj
						? {
								x: Number.isFinite(Number(cameraPositionObj.x)) ? Number(cameraPositionObj.x) : 0,
								y: Number.isFinite(Number(cameraPositionObj.y)) ? Number(cameraPositionObj.y) : 0,
								z: Number.isFinite(Number(cameraPositionObj.z)) ? Number(cameraPositionObj.z) : 0
							}
						: undefined,
					target: cameraTargetObj
						? {
								x: Number.isFinite(Number(cameraTargetObj.x)) ? Number(cameraTargetObj.x) : 0,
								y: Number.isFinite(Number(cameraTargetObj.y)) ? Number(cameraTargetObj.y) : 0,
								z: Number.isFinite(Number(cameraTargetObj.z)) ? Number(cameraTargetObj.z) : 0
							}
						: undefined
				}
			: undefined
	}
}

const sanitizeSceneLayoutSettings = (
	settings: WorkflowSceneLayoutNodeSettings | undefined
): WorkflowSceneLayoutNodeSettings | undefined => {
	if (!settings) return settings
	const layoutItems = Array.isArray(settings.layoutItems)
		? settings.layoutItems.map((item) => {
				const fix =
					item?.orientationFix && typeof item.orientationFix === 'object'
						? item.orientationFix
						: undefined
				const fillMode =
					item?.fillMode === 'fill-x' || item?.fillMode === 'fill-y' || item?.fillMode === 'fill-z'
						? item.fillMode
						: undefined
				const fillCount = Number(item?.fillCount)
				const fillAxisScale = Number(item?.fillAxisScale)
				const fillUpdatedAt = Number(item?.fillUpdatedAt)
				const fitMode =
					item?.fitMode === 'normal' ||
					item?.fitMode === 'oriented' ||
					item?.fitMode === 'filled' ||
					item?.fitMode === 'forced'
						? item.fitMode
						: undefined
				const fitUpdatedAt = Number(item?.fitUpdatedAt)
				const nextFill = {
					fillMode,
					fillCount:
						fillMode && Number.isFinite(fillCount)
							? Math.max(2, Math.min(32, Math.floor(fillCount)))
							: undefined,
					fillAxisScale: fillMode && Number.isFinite(fillAxisScale) ? fillAxisScale : undefined,
					fillUpdatedAt: fillMode && Number.isFinite(fillUpdatedAt) ? fillUpdatedAt : undefined,
					fitMode,
					fitMessage: fitMode && typeof item?.fitMessage === 'string' ? item.fitMessage : undefined,
					fitUpdatedAt: fitMode && Number.isFinite(fitUpdatedAt) ? fitUpdatedAt : undefined
				}
				if (!fix) {
					return {
						...item,
						...nextFill
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
						confidence:
							fix.confidence === 'low' ? 'low' : fix.confidence === 'high' ? 'high' : undefined,
						updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined
					}
				}
			})
		: []
	const validIds = new Set(layoutItems.map((item) => String(item?.id ?? '').trim()).filter(Boolean))
	const nextManualBindingsMap = new Map<string, WorkflowSceneLayoutManualModelBinding>()
	for (const item of Array.isArray(settings.manualModelBindings)
		? settings.manualModelBindings
		: []) {
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
			modelFormat:
				item?.modelFormat === 'gltf' ? 'gltf' : item?.modelFormat === 'glb' ? 'glb' : undefined
		})
	}
	const manualModelBindings = nextManualBindingsMap.size
		? Array.from(nextManualBindingsMap.values())
		: undefined
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
				: undefined
	}
}

const normalizeUnrealExportSettings = (
	rawSettings: unknown
): WorkflowUnrealExportNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const connectedSessionObj = isRecord(raw.connectedSession) ? raw.connectedSession : null
	const sessionId = String(connectedSessionObj?.sessionId ?? '').trim()
	return {
		connectionStatus:
			raw.connectionStatus === 'waiting' ||
			raw.connectionStatus === 'connected' ||
			raw.connectionStatus === 'exporting' ||
			raw.connectionStatus === 'error'
				? raw.connectionStatus
				: 'idle',
		statusText: isString(raw.statusText) ? raw.statusText : undefined,
		message: isString(raw.message) ? raw.message : undefined,
		targetSessionId: isString(raw.targetSessionId) ? raw.targetSessionId : undefined,
		lastExportMode:
			raw.lastExportMode === 'lighting-only'
				? 'lighting-only'
				: raw.lastExportMode === 'scene-layout'
					? 'scene-layout'
					: undefined,
		connectedSession:
			sessionId && connectedSessionObj
				? {
						sessionId,
						displayName: isString(connectedSessionObj.displayName)
							? connectedSessionObj.displayName
							: undefined,
						projectName: isString(connectedSessionObj.projectName)
							? connectedSessionObj.projectName
							: undefined,
						projectPath: isString(connectedSessionObj.projectPath)
							? connectedSessionObj.projectPath
							: undefined,
						saveDirectory: isString(connectedSessionObj.saveDirectory)
							? connectedSessionObj.saveDirectory
							: undefined,
						assetRootPath: isString(connectedSessionObj.assetRootPath)
							? connectedSessionObj.assetRootPath
							: undefined,
						pluginVersion: isString(connectedSessionObj.pluginVersion)
							? connectedSessionObj.pluginVersion
							: undefined,
						lastSeenAt: Number.isFinite(Number(connectedSessionObj.lastSeenAt))
							? Number(connectedSessionObj.lastSeenAt)
							: undefined,
						connectedAt: Number.isFinite(Number(connectedSessionObj.connectedAt))
							? Number(connectedSessionObj.connectedAt)
							: undefined,
						status: connectedSessionObj.status === 'stale' ? 'stale' : 'connected'
					}
				: undefined,
		lastHeartbeatAt: Number.isFinite(Number(raw.lastHeartbeatAt))
			? Number(raw.lastHeartbeatAt)
			: undefined,
		lastExportJobId: isString(raw.lastExportJobId) ? raw.lastExportJobId : undefined,
		lastExportStatus:
			raw.lastExportStatus === 'queued' ||
			raw.lastExportStatus === 'picked' ||
			raw.lastExportStatus === 'downloading' ||
			raw.lastExportStatus === 'importing' ||
			raw.lastExportStatus === 'assembling-actor' ||
			raw.lastExportStatus === 'applying-lighting' ||
			raw.lastExportStatus === 'completed' ||
			raw.lastExportStatus === 'failed'
				? raw.lastExportStatus
				: undefined,
		lastExportStage: isString(raw.lastExportStage) ? raw.lastExportStage : undefined,
		lastExportProgress: Number.isFinite(Number(raw.lastExportProgress))
			? Math.max(0, Math.min(100, Number(raw.lastExportProgress)))
			: undefined,
		lastExportMessage: isString(raw.lastExportMessage) ? raw.lastExportMessage : undefined,
		lastBlueprintAssetPath: isString(raw.lastBlueprintAssetPath)
			? raw.lastBlueprintAssetPath
			: undefined,
		lastModelsAssetPath: isString(raw.lastModelsAssetPath) ? raw.lastModelsAssetPath : undefined,
		lastActorBaseClass: isString(raw.lastActorBaseClass) ? raw.lastActorBaseClass : undefined,
		lastSpawnedLightCount: Number.isFinite(Number(raw.lastSpawnedLightCount))
			? Number(raw.lastSpawnedLightCount)
			: undefined,
		lastLightingTargetActor: isString(raw.lastLightingTargetActor)
			? raw.lastLightingTargetActor
			: undefined,
		lastLayoutProtocolVersion: Number.isFinite(Number(raw.lastLayoutProtocolVersion))
			? Number(raw.lastLayoutProtocolVersion)
			: undefined,
		lastSlotCount: Number.isFinite(Number(raw.lastSlotCount))
			? Number(raw.lastSlotCount)
			: undefined,
		lastAppliedSlotCount: Number.isFinite(Number(raw.lastAppliedSlotCount))
			? Number(raw.lastAppliedSlotCount)
			: undefined,
		lastMaterialOverrideCount: Number.isFinite(Number(raw.lastMaterialOverrideCount))
			? Number(raw.lastMaterialOverrideCount)
			: undefined,
		lastExportAt: Number.isFinite(Number(raw.lastExportAt)) ? Number(raw.lastExportAt) : undefined,
		autoPoll: raw.autoPoll !== false,
		editorStatus:
			raw.editorStatus === 'checking' ||
			raw.editorStatus === 'not-running' ||
			raw.editorStatus === 'running'
				? raw.editorStatus
				: 'unknown',
		editorCheckedAt: Number.isFinite(Number(raw.editorCheckedAt))
			? Number(raw.editorCheckedAt)
			: undefined,
		editorProcess:
			raw.editorProcess && isRecord(raw.editorProcess)
				? {
						pid: Number.isFinite(Number(raw.editorProcess.pid))
							? Number(raw.editorProcess.pid)
							: undefined,
						projectPath: isString(raw.editorProcess.projectPath)
							? raw.editorProcess.projectPath
							: undefined,
						projectName: isString(raw.editorProcess.projectName)
							? raw.editorProcess.projectName
							: undefined,
						engineVersion: isString(raw.editorProcess.engineVersion)
							? raw.editorProcess.engineVersion
							: undefined
					}
				: null,
		editorProcesses: Array.isArray(raw.editorProcesses)
			? raw.editorProcesses
					.filter((p: unknown) => isRecord(p) && Number.isFinite(Number(p.pid)))
					.map((p: Record<string, unknown>) => ({
						pid: Number(p.pid),
						projectPath: isString(p.projectPath) ? p.projectPath : '',
						projectName: isString(p.projectName) ? p.projectName : ''
					}))
			: undefined,
		pluginStatus:
			raw.pluginStatus === 'checking' ||
			raw.pluginStatus === 'not-installed' ||
			raw.pluginStatus === 'installed' ||
			raw.pluginStatus === 'installing' ||
			raw.pluginStatus === 'install-error' ||
			raw.pluginStatus === 'needs-restart'
				? raw.pluginStatus
				: 'unknown',
		pluginCheckedAt: Number.isFinite(Number(raw.pluginCheckedAt))
			? Number(raw.pluginCheckedAt)
			: undefined,
		pluginVersion: isString(raw.pluginVersion) ? raw.pluginVersion : undefined,
		pluginInstallError: isString(raw.pluginInstallError) ? raw.pluginInstallError : undefined,
		pluginInstallConfig:
			raw.pluginInstallConfig && isRecord(raw.pluginInstallConfig)
				? {
						targetProjectPath: isString(raw.pluginInstallConfig.targetProjectPath)
							? raw.pluginInstallConfig.targetProjectPath
							: undefined
					}
				: undefined,
		assetRootPath: isString(raw.assetRootPath) && raw.assetRootPath.trim() ? raw.assetRootPath.trim() : '/Game/DVStudio',
		assetPathValidation:
			raw.assetPathValidation === 'valid' ||
			raw.assetPathValidation === 'invalid' ||
			raw.assetPathValidation === 'checking'
				? raw.assetPathValidation
				: undefined,
		assetPathValidationError: isString(raw.assetPathValidationError) ? raw.assetPathValidationError : undefined
	}
}

const normalizeWorkflowImageCrop = (rawCrop: unknown): WorkflowImageCrop | undefined => {
	if (!rawCrop || !isRecord(rawCrop)) return undefined
	return {
		x: Number.isFinite(Number(rawCrop.x)) ? Math.max(0, Math.min(1, Number(rawCrop.x))) : 0,
		y: Number.isFinite(Number(rawCrop.y)) ? Math.max(0, Math.min(1, Number(rawCrop.y))) : 0,
		width: Number.isFinite(Number(rawCrop.width))
			? Math.max(0, Math.min(1, Number(rawCrop.width)))
			: 1,
		height: Number.isFinite(Number(rawCrop.height))
			? Math.max(0, Math.min(1, Number(rawCrop.height)))
			: 1
	}
}

const normalizeWorkflowPixelRect = (rawRect: unknown): WorkflowPixelRect | undefined => {
	if (!rawRect || !isRecord(rawRect)) return undefined
	const width = Number(rawRect.width)
	const height = Number(rawRect.height)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
		return undefined
	return {
		x: Number.isFinite(Number(rawRect.x)) ? Number(rawRect.x) : 0,
		y: Number.isFinite(Number(rawRect.y)) ? Number(rawRect.y) : 0,
		width,
		height
	}
}

const normalizeSceneDecomposeSettings = (
	rawSettings: unknown
): WorkflowSceneDecomposeNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const outputs = isArray(raw.outputs)
		? raw.outputs
				.map((item: unknown, index: number) => {
					const itemObj = isRecord(item) ? item : {}
					const rawId = String(itemObj.id ?? '').trim()
					const id = rawId || `object-${index + 1}`
					const imageAnchorId =
						String(itemObj.imageAnchorId ?? `out-image-${id}`).trim() || `out-image-${id}`
					const textAnchorId =
						String(itemObj.textAnchorId ?? `out-text-${id}`).trim() || `out-text-${id}`
					const sourceImageIndex = Number(itemObj.sourceImageIndex)
					return {
						id,
						name: isString(itemObj.name) ? itemObj.name : undefined,
						category: isString(itemObj.category) ? itemObj.category : undefined,
						material: isString(itemObj.material) ? itemObj.material : undefined,
						visualDetails: isString(itemObj.visualDetails) ? itemObj.visualDetails : undefined,
						description: isString(itemObj.description) ? itemObj.description : undefined,
						cropMode: itemObj.cropMode === 'fallback' ? 'fallback' : 'cropped',
						sourceImageIndex: Number.isFinite(sourceImageIndex)
							? Math.max(1, Math.floor(sourceImageIndex))
							: 1,
						observedImageIndices: isArray(itemObj.observedImageIndices)
							? itemObj.observedImageIndices
									.map((value: unknown) => Number(value))
									.filter((value: number) => Number.isFinite(value) && value > 0)
							: undefined,
						imageRect: normalizeWorkflowImageCrop(itemObj.imageRect),
						imageRectPixels: normalizeWorkflowPixelRect(itemObj.imageRectPixels),
						imageAnchorId,
						textAnchorId,
						generatedResourceId: isString(itemObj.generatedResourceId)
							? itemObj.generatedResourceId
							: undefined,
						outputWidth: Number.isFinite(Number(itemObj.outputWidth))
							? Math.max(1, Math.floor(Number(itemObj.outputWidth)))
							: undefined,
						outputHeight: Number.isFinite(Number(itemObj.outputHeight))
							? Math.max(1, Math.floor(Number(itemObj.outputHeight)))
							: undefined
					} as WorkflowSceneDecomposeOutput
				})
				.filter((item: WorkflowSceneDecomposeOutput) => !!item.id)
		: undefined
	return {
		status:
			raw.status === 'running' || raw.status === 'completed' || raw.status === 'error'
				? raw.status
				: 'idle',
		message: isString(raw.message) ? raw.message : undefined,
		progress: Number.isFinite(Number(raw.progress))
			? Math.max(0, Math.min(100, Number(raw.progress)))
			: undefined,
		currentStep: isString(raw.currentStep) ? raw.currentStep : undefined,
		totalTasks: Number.isFinite(Number(raw.totalTasks))
			? Math.max(0, Math.floor(Number(raw.totalTasks)))
			: undefined,
		completedTasks: Number.isFinite(Number(raw.completedTasks))
			? Math.max(0, Math.floor(Number(raw.completedTasks)))
			: undefined,
		croppedCount: Number.isFinite(Number(raw.croppedCount))
			? Math.max(0, Math.floor(Number(raw.croppedCount)))
			: undefined,
		fallbackCount: Number.isFinite(Number(raw.fallbackCount))
			? Math.max(0, Math.floor(Number(raw.fallbackCount)))
			: undefined,
		inputJson: isString(raw.inputJson) ? raw.inputJson : undefined,
		lastRunAt: Number.isFinite(Number(raw.lastRunAt)) ? Number(raw.lastRunAt) : undefined,
		outputs,
		lastExpandedAt: Number.isFinite(Number(raw.lastExpandedAt))
			? Number(raw.lastExpandedAt)
			: undefined,
		lastExpandedCount: Number.isFinite(Number(raw.lastExpandedCount))
			? Math.max(0, Math.floor(Number(raw.lastExpandedCount)))
			: undefined
	}
}

const normalizeMeshyTaskTarget = (value: unknown): WorkflowMeshyTaskTarget | undefined => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	if (raw === 'image') return 'image'
	if (raw === '3d') return '3d'
	return undefined
}

const inferMeshyTargetFromFamily = (family: WorkflowMeshyTaskFamily): WorkflowMeshyTaskTarget => {
	if (family === 'text-to-image' || family === 'image-to-image') return 'image'
	return '3d'
}

const getDefaultMeshyFamilyForTarget = (
	target: WorkflowMeshyTaskTarget
): WorkflowMeshyTaskFamily => {
	return target === 'image' ? 'text-to-image' : 'text-to-3d'
}

const normalizeMeshyTaskFamily = (
	rawFamily: unknown,
	rawTarget: unknown,
	rawMode: unknown,
	rawStage: unknown
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
		family === 'uv-unwrap' ||
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

const meshyLegacyModeForFamily = (
	family: WorkflowMeshyTaskFamily
): WorkflowMeshyNodeSettings['meshyMode'] | undefined => {
	if (family === 'image-to-3d') return 'image-to-3d'
	if (family === 'multi-image-to-3d') return 'multi-image-to-3d'
	if (family === 'text-to-3d' || family === 'refine') return 'text-to-3d'
	if (family === 'remesh') return 'remesh'
	if (family === 'retexture') return 'retexture'
	if (family === 'uv-unwrap') return 'uv-unwrap'
	return undefined
}

const meshyLegacyStageForFamily = (
	family: WorkflowMeshyTaskFamily
): WorkflowMeshyNodeSettings['meshyStage'] | undefined => {
	if (family === 'refine') return 'refine'
	if (family === 'text-to-3d') return 'preview'
	return undefined
}

const syncMeshyAnchors = (node: WorkflowNode) => {
	const target = node.meshySettings?.meshyTaskTarget ?? '3d'
	const family =
		node.meshySettings?.meshyTaskFamily ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
	if (target === 'image') {
		const imageInputCount = family === 'image-to-image' ? 5 : 0
		const imageAnchors: WorkflowAnchorSpec[] = []
		for (let i = 1; i <= imageInputCount; i += 1) {
			imageAnchors.push({ id: `in-image-${i}`, label: `参考图 ${i}`, mediaType: 'image' })
		}
		const outputCountRaw = Number(node.meshySettings?.meshyOutputImageCount ?? 1)
		const outputCount = Number.isFinite(outputCountRaw)
			? Math.max(1, Math.min(4, Math.floor(outputCountRaw)))
			: 1
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
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' }
	]
	node.outputs = [{ id: 'out-model', label: '模型输出', mediaType: 'model3d' }]
}

const syncSceneUnderstandAnchors = (node: WorkflowNode) => {
	const mode =
		node.sceneUnderstandingSettings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
	node.inputs = [
		{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
		{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
		{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
		...(mode === 'scene-lighting'
			? [{ id: 'in-layout-json', label: '布局 JSON', mediaType: 'text' as const }]
			: []),
		{
			id: 'in-text',
			label: mode === 'scene-lighting' ? '灯光补充提示' : '提示词',
			mediaType: 'text'
		}
	]
	node.outputs = [
		{ id: 'out-0', label: mode === 'scene-lighting' ? '灯光JSON' : 'JSON输出', mediaType: 'text' }
	]
}

const isSceneLayoutModelTarget = (item: unknown): boolean => {
	if (!item || !isRecord(item)) return false
	const id = String(item.id ?? '')
		.trim()
		.toLowerCase()
	const semanticRole = String(item.semanticRole ?? '')
		.trim()
		.toLowerCase()
	const keyElementType = String(item.keyElementType ?? '')
		.trim()
		.toLowerCase()
	const relationTags = isArray(item.relationTags)
		? item.relationTags.map((value: unknown) =>
				String(value ?? '')
					.trim()
					.toLowerCase()
			)
		: []
	const observed = isArray(item.observedImageIndices)
		? item.observedImageIndices
				.map((value: unknown) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	if (semanticRole === 'structure-shell') return false
	if (relationTags.includes('structural-shell')) return false
	if (id === 'floor1' || id === 'ceiling1' || /wall\d+$/i.test(id)) return false
	if (!observed.length && !item.imageRect && !item.imageRectPixels) {
		if (keyElementType === 'floor' || keyElementType === 'wall' || keyElementType === 'ceiling')
			return false
	}
	return true
}

const syncSceneLayoutAnchors = (node: WorkflowNode) => {
	const previewMode = node.sceneLayoutSettings?.previewMode === true
	const layoutItems = Array.isArray(node.sceneLayoutSettings?.layoutItems)
		? node
				.sceneLayoutSettings!.layoutItems!.filter((item) => String(item?.id ?? '').trim())
		: []
	const modelInputs = previewMode
		? layoutItems.map((item) => ({
				id: `in-model-${String(item.id ?? '').trim()}`,
				label: `${String(item.name ?? item.id ?? '对象').trim() || '对象'} 模型`,
				mediaType: 'model3d' as const
			}))
		: []
	const lightingInputs =
		previewMode && node.sceneLayoutSettings?.lightingPreviewEnabled === true
			? [{ id: 'in-lighting-json', label: '灯光 JSON', mediaType: 'text' as const }]
			: []
	node.inputs = [
		{ id: 'in-json', label: '布局JSON', mediaType: 'text' },
		...modelInputs,
		...lightingInputs
	]
	node.outputs = [
		{ id: 'out-0', label: '布局输出', mediaType: 'text' },
		...(previewMode
			? [{ id: 'out-selected-placeholder', label: '选中占位体', mediaType: 'model3d' as const }]
			: [])
	]
}

const syncUnrealExportAnchors = (node: WorkflowNode) => {
	node.inputs = [
		{ id: 'in-layout-json', label: '布局 JSON', mediaType: 'text' },
		{ id: 'in-lighting-json', label: '灯光 JSON', mediaType: 'text' }
	]
	node.outputs = []
}

const syncSceneDecomposeAnchors = (node: WorkflowNode) => {
	const settings = node.sceneDecomposeSettings
	const rawOutputs = settings?.outputs
	const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
	node.inputs = [
		{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
		{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
		{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
		{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
		{ id: 'in-json', label: '场景 JSON', mediaType: 'text' }
	]
	// 场景拆解节点输出锚点归一化：无论拆解出多少对象，只保留一个总输出锚点，
	// 所有自动布线均从该锚点出发，避免多锚点位置与连线起点错位的问题。
	const hasOutputs = outputs.length > 0
	node.outputs = hasOutputs
		? [{ id: 'out-main', label: '拆解输出', mediaType: 'image' }]
		: [{ id: 'out-empty', label: '待分解', mediaType: 'text' }]
}

const normalizeMeshyTargetFormats = (
	value: unknown
): WorkflowMeshyNodeSettings['meshyTargetFormats'] | undefined => {
	if (!Array.isArray(value)) return undefined
	const next = value.filter((x: unknown) =>
		['glb', 'obj', 'fbx', 'stl', 'usdz'].includes(String(x))
	)
	return next.length ? (next as WorkflowMeshyNodeSettings['meshyTargetFormats']) : undefined
}

const normalizeModel3DSettings = (
	rawSettings: unknown
): WorkflowModel3DNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	return {
		modelUrl: isString(raw.modelUrl) ? String(raw.modelUrl) : undefined,
		modelFormat:
			raw.modelFormat === 'gltf' ? 'gltf' : raw.modelFormat === 'glb' ? 'glb' : undefined,
		modelSourceName: isString(raw.modelSourceName) ? String(raw.modelSourceName) : undefined,
		modelSourcePath: isString(raw.modelSourcePath) ? String(raw.modelSourcePath) : undefined,
		modelAssetUrl: isString(raw.modelAssetUrl) ? String(raw.modelAssetUrl) : undefined,
		modelAssetPath: isString(raw.modelAssetPath) ? String(raw.modelAssetPath) : undefined,
		backgroundColor: isString(raw.backgroundColor) ? String(raw.backgroundColor) : undefined,
		lightIntensity: Number.isFinite(Number(raw.lightIntensity))
			? Math.max(0, Math.min(10, Number(raw.lightIntensity)))
			: undefined,
		gridVisible: isBoolean(raw.gridVisible) ? Boolean(raw.gridVisible) : undefined,
		axesVisible: isBoolean(raw.axesVisible) ? Boolean(raw.axesVisible) : undefined,
		autoRotate: isBoolean(raw.autoRotate) ? Boolean(raw.autoRotate) : undefined,
		renderWidth: Number.isFinite(Number(raw.renderWidth))
			? Math.max(1, Math.floor(Number(raw.renderWidth)))
			: undefined,
		renderHeight: Number.isFinite(Number(raw.renderHeight))
			? Math.max(1, Math.floor(Number(raw.renderHeight)))
			: undefined,
		lastInputSignature: isString(raw.lastInputSignature)
			? String(raw.lastInputSignature)
			: undefined,
		lastInputNodeId: isString(raw.lastInputNodeId) ? String(raw.lastInputNodeId) : undefined,
		lastInputSourceUrl: isString(raw.lastInputSourceUrl)
			? String(raw.lastInputSourceUrl)
			: undefined,
		lastInputSourcePath: isString(raw.lastInputSourcePath)
			? String(raw.lastInputSourcePath)
			: undefined,
		lastInputSourceName: isString(raw.lastInputSourceName)
			? String(raw.lastInputSourceName)
			: undefined,
		lastInputPlaceholderId: isString(raw.lastInputPlaceholderId)
			? String(raw.lastInputPlaceholderId)
			: undefined,
		lastInputPlaceholderJson: isString(raw.lastInputPlaceholderJson)
			? String(raw.lastInputPlaceholderJson)
			: undefined
	}
}

const normalizeMeshySettings = (rawSettings: unknown): WorkflowMeshyNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const meshyTaskFamily = normalizeMeshyTaskFamily(
		raw.meshyTaskFamily,
		raw.meshyTaskTarget,
		raw.meshyMode,
		raw.meshyStage
	)
	const meshyTaskTarget =
		normalizeMeshyTaskTarget(raw.meshyTaskTarget) ?? inferMeshyTargetFromFamily(meshyTaskFamily)
	const modelUrlsObj = isRecord(raw.meshyModelUrls) ? raw.meshyModelUrls : undefined
	const inputSummaryObj = isRecord(raw.meshyInputSummary) ? raw.meshyInputSummary : undefined
	const outputSummaryObj = isRecord(raw.meshyOutputSummary) ? raw.meshyOutputSummary : undefined
	return {
		meshyApiSource: 'meshy',
		meshyTaskTarget,
		meshyTaskFamily,
		meshyHelpTopic: isString(raw.meshyHelpTopic) ? String(raw.meshyHelpTopic) : undefined,
		meshyMode:
			meshyLegacyModeForFamily(meshyTaskFamily) ??
			(raw.meshyMode === 'image-to-3d'
				? 'image-to-3d'
				: raw.meshyMode === 'multi-image-to-3d'
					? 'multi-image-to-3d'
					: raw.meshyMode === 'text-to-3d'
						? 'text-to-3d'
						: raw.meshyMode === 'remesh'
							? 'remesh'
							: raw.meshyMode === 'retexture'
								? 'retexture'
								: raw.meshyMode === 'uv-unwrap'
									? 'uv-unwrap'
									: undefined),
		meshyStage:
			meshyLegacyStageForFamily(meshyTaskFamily) ??
			(raw.meshyStage === 'refine'
				? 'refine'
				: raw.meshyStage === 'preview'
					? 'preview'
					: undefined),
		meshyPrompt: isString(raw.meshyPrompt) ? String(raw.meshyPrompt) : undefined,
		meshyNegativePrompt: isString(raw.meshyNegativePrompt)
			? String(raw.meshyNegativePrompt)
			: undefined,
		meshyPreviewTaskId: isString(raw.meshyPreviewTaskId)
			? String(raw.meshyPreviewTaskId)
			: undefined,
		meshyImageUrl: isString(raw.meshyImageUrl) ? String(raw.meshyImageUrl) : undefined,
		meshyImageUrls: isArray(raw.meshyImageUrls)
			? raw.meshyImageUrls
					.map((x: unknown) => String(x ?? '').trim())
					.filter((x: string) => !!x)
					.slice(0, 5)
			: undefined,
		meshyTexturePrompt: isString(raw.meshyTexturePrompt)
			? String(raw.meshyTexturePrompt)
			: undefined,
		meshyTextureImageUrl: isString(raw.meshyTextureImageUrl)
			? String(raw.meshyTextureImageUrl)
			: undefined,
		meshyModelType:
			raw.meshyModelType === 'lowpoly'
				? 'lowpoly'
				: raw.meshyModelType === 'standard'
					? 'standard'
					: undefined,
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
		meshyGenerateMultiView: isBoolean(raw.meshyGenerateMultiView)
			? Boolean(raw.meshyGenerateMultiView)
			: undefined,
		meshyOutputImageCount: Number.isFinite(Number(raw.meshyOutputImageCount))
			? (Math.max(1, Math.min(4, Math.floor(Number(raw.meshyOutputImageCount)))) as 1 | 2 | 3 | 4)
			: undefined,
		meshyImageInputCount: Number.isFinite(Number(raw.meshyImageInputCount))
			? Math.max(0, Math.min(5, Math.floor(Number(raw.meshyImageInputCount))))
			: undefined,
		meshySeed: Number.isFinite(Number(raw.meshySeed))
			? Math.max(0, Math.floor(Number(raw.meshySeed)))
			: undefined,
		meshyAnimationActionId: Number.isFinite(Number(raw.meshyAnimationActionId))
			? Math.max(1, Math.floor(Number(raw.meshyAnimationActionId)))
			: undefined,
		meshyTopology:
			raw.meshyTopology === 'quad'
				? 'quad'
				: raw.meshyTopology === 'triangle'
					? 'triangle'
					: undefined,
		meshyTargetPolycount: Number.isFinite(Number(raw.meshyTargetPolycount))
			? Math.max(100, Math.min(300000, Math.floor(Number(raw.meshyTargetPolycount))))
			: undefined,
		meshySymmetryMode:
			raw.meshySymmetryMode === 'off'
				? 'off'
				: raw.meshySymmetryMode === 'on'
					? 'on'
					: raw.meshySymmetryMode === 'auto'
						? 'auto'
						: undefined,
		meshyShouldRemesh: isBoolean(raw.meshyShouldRemesh)
			? Boolean(raw.meshyShouldRemesh)
			: undefined,
		meshySavePreRemeshedModel: isBoolean(raw.meshySavePreRemeshedModel)
			? Boolean(raw.meshySavePreRemeshedModel)
			: undefined,
		meshyShouldTexture: isBoolean(raw.meshyShouldTexture)
			? Boolean(raw.meshyShouldTexture)
			: undefined,
		meshyEnablePbr: isBoolean(raw.meshyEnablePbr) ? Boolean(raw.meshyEnablePbr) : undefined,
		meshyPoseMode:
			raw.meshyPoseMode === 'a-pose'
				? 'a-pose'
				: raw.meshyPoseMode === 't-pose'
					? 't-pose'
					: raw.meshyPoseMode === ''
						? ''
						: undefined,
		meshyModeration: isBoolean(raw.meshyModeration) ? Boolean(raw.meshyModeration) : undefined,
		meshyImageEnhancement: isBoolean(raw.meshyImageEnhancement)
			? Boolean(raw.meshyImageEnhancement)
			: undefined,
		meshyRemoveLighting: isBoolean(raw.meshyRemoveLighting)
			? Boolean(raw.meshyRemoveLighting)
			: undefined,
		meshyAutoSize: isBoolean(raw.meshyAutoSize) ? Boolean(raw.meshyAutoSize) : undefined,
		meshyOriginAt:
			raw.meshyOriginAt === 'center'
				? 'center'
				: raw.meshyOriginAt === 'bottom'
					? 'bottom'
					: undefined,
		meshyTargetFormats: normalizeMeshyTargetFormats(raw.meshyTargetFormats),
		meshyTaskId: isString(raw.meshyTaskId) ? String(raw.meshyTaskId) : undefined,
		meshyTaskStatus: ['idle', 'pending', 'running', 'succeeded', 'failed', 'canceled'].includes(
			String(raw.meshyTaskStatus)
		)
			? (String(raw.meshyTaskStatus) as WorkflowMeshyNodeSettings['meshyTaskStatus'])
			: undefined,
		meshyProgress: Number.isFinite(Number(raw.meshyProgress))
			? Math.max(0, Math.min(100, Number(raw.meshyProgress)))
			: undefined,
		meshyStatusText: isString(raw.meshyStatusText) ? String(raw.meshyStatusText) : undefined,
		meshyThumbnailUrl: isString(raw.meshyThumbnailUrl) ? String(raw.meshyThumbnailUrl) : undefined,
		meshyModelUrls: modelUrlsObj ? { ...modelUrlsObj } : undefined,
		meshyOutputAssetUrl: isString(raw.meshyOutputAssetUrl)
			? String(raw.meshyOutputAssetUrl)
			: undefined,
		meshyOutputAssetPath: isString(raw.meshyOutputAssetPath)
			? String(raw.meshyOutputAssetPath)
			: undefined,
		meshyErrorMessage: isString(raw.meshyErrorMessage) ? String(raw.meshyErrorMessage) : undefined,
		meshyInputSummary: inputSummaryObj ? { ...inputSummaryObj } : undefined,
		meshyOutputSummary: outputSummaryObj ? { ...outputSummaryObj } : undefined
	}
}

const normalizeImageSettings = (raw: unknown): WorkflowImageNodeSettings | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const cropObj = isRecord(raw.crop) ? raw.crop : undefined
	return {
		outputWidth: Number.isFinite(Number(raw.outputWidth))
			? Math.max(1, Math.floor(Number(raw.outputWidth)))
			: undefined,
		outputHeight: Number.isFinite(Number(raw.outputHeight))
			? Math.max(1, Math.floor(Number(raw.outputHeight)))
			: undefined,
		naturalWidth: Number.isFinite(Number(raw.naturalWidth))
			? Math.max(1, Math.floor(Number(raw.naturalWidth)))
			: undefined,
		naturalHeight: Number.isFinite(Number(raw.naturalHeight))
			? Math.max(1, Math.floor(Number(raw.naturalHeight)))
			: undefined,
		cropEnabled: isBoolean(raw.cropEnabled) ? Boolean(raw.cropEnabled) : undefined,
		crop: cropObj
			? {
					x: Number.isFinite(Number(cropObj.x)) ? Math.max(0, Math.min(1, Number(cropObj.x))) : 0,
					y: Number.isFinite(Number(cropObj.y)) ? Math.max(0, Math.min(1, Number(cropObj.y))) : 0,
					width: Number.isFinite(Number(cropObj.width))
						? Math.max(0, Math.min(1, Number(cropObj.width)))
						: 1,
					height: Number.isFinite(Number(cropObj.height))
						? Math.max(0, Math.min(1, Number(cropObj.height)))
						: 1
				}
			: undefined
	}
}

const normalizeVideoSettings = (raw: unknown): WorkflowVideoNodeSettings | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	return {
		outputWidth: Number.isFinite(Number(raw.outputWidth))
			? Math.max(1, Math.floor(Number(raw.outputWidth)))
			: undefined,
		outputHeight: Number.isFinite(Number(raw.outputHeight))
			? Math.max(1, Math.floor(Number(raw.outputHeight)))
			: undefined,
		naturalWidth: Number.isFinite(Number(raw.naturalWidth))
			? Math.max(1, Math.floor(Number(raw.naturalWidth)))
			: undefined,
		naturalHeight: Number.isFinite(Number(raw.naturalHeight))
			? Math.max(1, Math.floor(Number(raw.naturalHeight)))
			: undefined
	}
}

const normalizeStorySettings = (
	raw: unknown
): { previewWidth?: number; previewHeight?: number } | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const pw = Number(raw.previewWidth)
	const ph = Number(raw.previewHeight)
	return {
		previewWidth: Number.isFinite(pw) ? Math.max(1, Math.floor(pw)) : undefined,
		previewHeight: Number.isFinite(ph) ? Math.max(1, Math.floor(ph)) : undefined
	}
}

const normalizeBranches = (raw: unknown): Array<{ id: string; text: string }> | undefined => {
	if (!isArray(raw)) return undefined
	const branches = raw
		.map((b: unknown) =>
			isRecord(b)
				? {
						id: String(b.id ?? '').trim(),
						text: String(b.text ?? '')
					}
				: { id: '', text: '' }
		)
		.filter((b: { id: string }) => b.id)
	return branches.length ? branches : undefined
}

const normalizeAnchors = (
	raw: unknown,
	nodeType: string,
	direction: 'in' | 'out'
): WorkflowAnchorSpec[] => {
	if (!isArray(raw)) {
		return direction === 'in' ? [{ id: 'in-0', label: '入口' }] : [{ id: 'out-0', label: '出口' }]
	}
	return raw
		.map((a: unknown) => {
			if (!isRecord(a)) return { id: '' }
			const anchorId = String(a.id ?? '').trim()
			return {
				id: anchorId,
				label: isString(a.label) ? a.label : undefined,
				offsetY: isNumber(a.offsetY) ? a.offsetY : undefined,
				mediaType: normalizeMediaType(a.mediaType, { nodeType, anchorId })
			}
		})
		.filter((a: WorkflowAnchorSpec) => a.id)
}

const normalizeTextMergeItems = (raw: unknown): Array<{ id: string }> | undefined => {
	if (!isArray(raw)) return undefined
	const items = raw
		.map((x: unknown) =>
			isRecord(x)
				? {
						id: String(x.id ?? '').trim()
					}
				: { id: '' }
		)
		.filter((x: { id: string }) => x.id)
	return items.length ? items : undefined
}

const normalizeComfyUISettings = (raw: unknown): WorkflowComfyUINodeSettings | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const workflows = isArray(raw.workflows)
		? raw.workflows
				.map((w: unknown) =>
					isRecord(w)
						? {
								path: String(w.path ?? ''),
								name: String(w.name ?? '')
							}
						: { path: '', name: '' }
				)
				.filter((w: { path: string }) => w.path)
		: undefined
	const outputs = isArray(raw.outputs)
		? raw.outputs
				.map((o: unknown) =>
					isRecord(o)
						? {
								kind: (o.kind === 'video' ? 'video' : 'image') as 'video' | 'image',
								url: String(o.url ?? ''),
								filename: isString(o.filename) ? o.filename : undefined,
								anchorId: isString(o.anchorId) ? o.anchorId : undefined,
								nodeId: isString(o.nodeId) ? o.nodeId : undefined,
								sourcePath: isString(o.sourcePath) ? o.sourcePath : undefined,
								subfolder: isString(o.subfolder) ? o.subfolder : undefined,
								type: isString(o.type) ? o.type : undefined
							}
						: { kind: 'image' as const, url: '' }
				)
				.filter((o: { url: string }) => o.url)
		: undefined
	const status = raw.status
	return {
		baseUrl: isString(raw.baseUrl) ? raw.baseUrl : undefined,
		status:
			status === 'connecting' || status === 'connected' || status === 'error' ? status : 'idle',
		message: isString(raw.message) ? raw.message : undefined,
		lastCheckedAt: Number.isFinite(Number(raw.lastCheckedAt))
			? Number(raw.lastCheckedAt)
			: undefined,
		workflows,
		workflowPath: isString(raw.workflowPath) ? raw.workflowPath : undefined,
		positivePrompt: isString(raw.positivePrompt) ? raw.positivePrompt : undefined,
		negativePrompt: isString(raw.negativePrompt) ? raw.negativePrompt : undefined,
		runStatus: raw.runStatus as WorkflowComfyUINodeSettings['runStatus'],
		promptId: isString(raw.promptId) ? raw.promptId : undefined,
		progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : undefined,
		statusText: isString(raw.statusText) ? raw.statusText : undefined,
		outputs,
		lastUpdateAt: Number.isFinite(Number(raw.lastUpdateAt)) ? Number(raw.lastUpdateAt) : undefined
	}
}

const normalizeResource = (raw: unknown, id: string): WorkflowResource | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const url = isString(raw.url) ? String(raw.url) : ''
	return { ...(raw as Partial<WorkflowResource>), id, url } as WorkflowResource
}

const normalizeEdge = (
	raw: unknown,
	edgeId: string,
	nodesById: Record<string, WorkflowNode>
): WorkflowEdge | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const fromNodeId = String(raw.fromNodeId ?? '').trim()
	const toNodeId = String(raw.toNodeId ?? '').trim()
	if (!fromNodeId || !toNodeId) return undefined
	if (!nodesById[fromNodeId] || !nodesById[toNodeId]) return undefined
	const fromNodeType = String(nodesById[fromNodeId]?.type ?? '')
	const toNodeType = String(nodesById[toNodeId]?.type ?? '')
	const fromAnchorId = remapLegacyOutputAnchorId(fromNodeType, String(raw.fromAnchorId ?? 'out-0'))
	const toAnchorId = remapLegacyInputAnchorId(toNodeType, String(raw.toAnchorId ?? 'in-0'))
	return {
		id: edgeId,
		fromNodeId,
		fromAnchorId,
		toNodeId,
		toAnchorId,
		createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
	}
}

export const AIWorkflowKey: InjectionKey<Store<WorkflowState>> = Symbol('AIWorkflowStore')

export const AIWorkflowStore = createStore<WorkflowState>({
	state: createDefaultAIWorkflowState,
	mutations: {
		hydrateDraft(state: WorkflowState, payload: { snapshot: unknown }) {
			const s = payload?.snapshot
			if (!s || !isRecord(s)) return

			// viewport
			const viewportObj = isRecord(s.viewport) ? s.viewport : undefined
			if (viewportObj) {
				state.viewport.zoom = clampZoom(Number(viewportObj.zoom))
				state.viewport.panX = clamp(Number(viewportObj.panX), -1e9, 1e9)
				state.viewport.panY = clamp(Number(viewportObj.panY), -1e9, 1e9)
			}

			// nodes
			const nextNodesById: Record<string, WorkflowNode> = {}
			const rawNodesById = isRecord(s.nodesById) ? s.nodesById : {}
			for (const [id, raw] of Object.entries(rawNodesById)) {
				const nodeId = String(id ?? '').trim()
				if (!nodeId) continue
				if (!raw || !isRecord(raw)) continue
				const n = raw
				const type = String(n.type ?? 'base')
				let alias = isString(n.alias) ? n.alias : ''
				if (!alias.trim()) alias = defaultAliasForType(type)
				const imageSettings = normalizeImageSettings(n.imageSettings)
				const videoSettings = normalizeVideoSettings(n.videoSettings)
				const model3dSettings = normalizeModel3DSettings(n.model3dSettings)
				const meshySettings = normalizeMeshySettings(n.meshySettings ?? n.model3dSettings)
				nextNodesById[nodeId] = {
					id: nodeId,
					type,
					title: String(n.title ?? '工作流节点'),
					alias,
					subtitle: isString(n.subtitle) ? n.subtitle : '',
					resourcePath: isString(n.resourcePath) ? String(n.resourcePath) : undefined,
					imageSettings,
					videoSettings,
					model3dSettings,
					meshySettings,
					storySettings: normalizeStorySettings(n.storySettings),
					worldX: Number.isFinite(Number(n.worldX)) ? Number(n.worldX) : 0,
					worldY: Number.isFinite(Number(n.worldY)) ? Number(n.worldY) : 0,
					width: Number.isFinite(Number(n.width))
						? Math.max(80, Math.min(1000, Number(n.width)))
						: 240,
					height: Number.isFinite(Number(n.height))
						? Math.max(80, Math.min(1000, Number(n.height)))
						: 160,
					sizeCustomized: Boolean(n.sizeCustomized),
					resourceId: isString(n.resourceId) ? n.resourceId : null,
					branches: normalizeBranches(n.branches),
					inputs: normalizeAnchors(n.inputs, type, 'in'),
					outputs: normalizeAnchors(n.outputs, type, 'out'),
					createdAt: Number.isFinite(Number(n.createdAt)) ? Number(n.createdAt) : Date.now(),
					rotatePromptText: isString(n.rotatePromptText) ? String(n.rotatePromptText) : undefined,
					textValue: isString(n.textValue) ? String(n.textValue) : undefined,
					textMergeItems: normalizeTextMergeItems(n.textMergeItems),
					sceneUnderstandingSettings: normalizeSceneUnderstandingSettings(
						n.sceneUnderstandingSettings
					),
					sceneLayoutSettings: normalizeSceneLayoutSettings(n.sceneLayoutSettings),
					unrealExportSettings: normalizeUnrealExportSettings(n.unrealExportSettings),
					sceneDecomposeSettings: normalizeSceneDecomposeSettings(n.sceneDecomposeSettings),
					comfyuiSettings: normalizeComfyUISettings(n.comfyuiSettings)
				}
				if (nextNodesById[nodeId].type === 'story') syncStoryAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'text-merge') syncTextMergeAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-understanding')
					syncSceneUnderstandAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-layout')
					syncSceneLayoutAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'unreal-export')
					syncUnrealExportAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'scene-decompose')
					syncSceneDecomposeAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'meshy') syncMeshyAnchors(nextNodesById[nodeId])
				enforceSingleIOAnchors(nextNodesById[nodeId])
			}

			const rawNodeOrder = isArray(s.nodeOrder) ? s.nodeOrder : []
			const tempStateForOrder: WorkflowState = { ...state, nodesById: nextNodesById }
			const nextNodeOrder = normalizeNodeIds(
				tempStateForOrder,
				rawNodeOrder.map((x: unknown) => String(x ?? ''))
			)
			// if order missing, fall back to object keys
			const nodeOrder = nextNodeOrder.length ? nextNodeOrder : Object.keys(nextNodesById)

			state.nodesById = nextNodesById
			state.nodeOrder = nodeOrder

			// resources
			// Keep blob urls during hydrate so imported project packages can use in-memory assets
			// immediately after import. Persisted project loads should already rewrite to backend urls.
			const nextResourcesById: Record<string, WorkflowResource> = {}
			const nextResourceOrder: string[] = []
			const rawResourcesById = isRecord(s.resourcesById) ? s.resourcesById : {}
			const rawResourceOrder = isArray(s.resourceOrder) ? s.resourceOrder : []
			for (const ridRaw of rawResourceOrder.length
				? rawResourceOrder
				: Object.keys(rawResourcesById)) {
				const rid = String(ridRaw ?? '').trim()
				if (!rid) continue
				const r = rawResourcesById[rid]
				const normalized = normalizeResource(r, rid)
				if (normalized) {
					nextResourcesById[rid] = normalized
					nextResourceOrder.push(rid)
				}
			}
			state.resourcesById = nextResourcesById
			state.resourceOrder = uniq(nextResourceOrder)

			// edges
			const nextEdgesById: Record<string, WorkflowEdge> = {}
			const rawEdgesById = isRecord(s.edgesById) ? s.edgesById : {}
			for (const [edgeIdRaw, raw] of Object.entries(rawEdgesById)) {
				const edgeId = String(edgeIdRaw ?? '').trim()
				if (!edgeId) continue
				const normalized = normalizeEdge(raw, edgeId, state.nodesById)
				if (normalized) {
					nextEdgesById[edgeId] = normalized
				}
			}
			const rawEdgeOrder = isArray(s.edgeOrder) ? s.edgeOrder : []
			let edgeOrder = rawEdgeOrder
				.map((x: unknown) => String(x ?? '').trim())
				.filter((id: string) => !!id && !!nextEdgesById[id])
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
				if (
					!canLinkAnchors(state.nodesById, e.fromNodeId, e.fromAnchorId, e.toNodeId, e.toAnchorId)
				)
					delete nextEdgesById[edgeId]
			}
			state.edgesById = nextEdgesById
			state.edgeOrder = edgeOrder.filter((id: string) => !!state.edgesById[id])

			// selection
			const rawSelectedNodeIds = isArray(s.selectedNodeIds) ? s.selectedNodeIds : []
			const ids = normalizeNodeIds(
				state,
				rawSelectedNodeIds.map((x: unknown) => String(x ?? ''))
			)
			const primaryRaw = isString(s.selectedNodeId) ? s.selectedNodeId : null
			state.selectedNodeIds = ids
			state.selectedNodeId =
				primaryRaw && ids.includes(primaryRaw) ? primaryRaw : (ids[0] ?? state.nodeOrder[0] ?? null)
			state.selectedEdgeId = null
			state.clipboardNode = null
			state.clipboardNodes = null
			state.clipboardPrimaryNodeId = null
			state.chatDraft = ''

			// 多选标签和checkbox开关
			if (isRecord(s.selectionTagsByKey)) {
				state.selectionTagsByKey = s.selectionTagsByKey as Record<string, WorkflowSelectionTag>
			} else {
				state.selectionTagsByKey = {}
			}
			state.nodeCheckboxVisible = isBoolean(s.nodeCheckboxVisible) ? s.nodeCheckboxVisible : true
			// 已保存选区框
			if (isArray(s.savedSelectionFrames)) {
				state.savedSelectionFrames = s.savedSelectionFrames as SavedSelectionFrame[]
			} else {
				state.savedSelectionFrames = []
			}
		},
		setChatDraft(state, payload: { text: string }) {
			state.chatDraft =
				typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '')
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
			state.selectedNodeIds = state.selectedNodeId
				? normalizeNodeIds(state, [state.selectedNodeId])
				: []
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
		patchResource(
			state: WorkflowState,
			payload: { resourceId: string; patch: Partial<WorkflowResource> }
		) {
			const id = String(payload?.resourceId ?? '').trim()
			if (!id) return
			const r = state.resourcesById[id]
			if (!r) return
			const patch = (payload?.patch ?? {}) as Partial<WorkflowResource>
			state.resourcesById[id] = { ...r, ...patch, id }
		},
		patchResourcesBatch(
			state: WorkflowState,
			payload: { patches: Array<{ resourceId: string; patch: Partial<WorkflowResource> }> }
		) {
			const list = Array.isArray(payload?.patches) ? payload.patches : []
			if (!list.length) return
			for (const item of list) {
				const id = String(item?.resourceId ?? '').trim()
				if (!id) continue
				const r = state.resourcesById[id]
				if (!r) continue
				const patch = (item?.patch ?? {}) as Partial<WorkflowResource>
				state.resourcesById[id] = { ...r, ...patch, id }
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
		setNodeType(
			state,
			payload: {
				nodeId: string
				type:
					| 'base'
					| 'text'
					| 'text-merge'
					| 'image'
					| 'rotate-image'
					| 'video'
					| 'scene-understanding'
					| 'scene-decompose'
					| 'scene-layout'
					| 'unreal-export'
					| 'story'
					| 'comfyui'
					| 'model3d'
					| 'meshy'
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (
				payload.type !== 'base' &&
				payload.type !== 'text' &&
				payload.type !== 'text-merge' &&
				payload.type !== 'image' &&
				payload.type !== 'rotate-image' &&
				payload.type !== 'video' &&
				payload.type !== 'scene-understanding' &&
				payload.type !== 'scene-decompose' &&
				payload.type !== 'scene-layout' &&
				payload.type !== 'unreal-export' &&
				payload.type !== 'story' &&
				payload.type !== 'comfyui' &&
				payload.type !== 'model3d' &&
				payload.type !== 'meshy'
			)
				return
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
			if (payload.type !== 'rotate-image') n.rotatePromptText = undefined
			if (payload.type !== 'text') n.textValue = undefined
			if (payload.type !== 'text-merge') n.textMergeItems = undefined
			if (
				payload.type === 'base' ||
				payload.type === 'text' ||
				payload.type === 'text-merge' ||
				payload.type === 'comfyui' ||
				payload.type === 'rotate-image' ||
				payload.type === 'scene-understanding' ||
				payload.type === 'scene-decompose' ||
				payload.type === 'scene-layout' ||
				payload.type === 'unreal-export' ||
				payload.type === 'model3d' ||
				payload.type === 'meshy'
			)
				n.resourceId = null
			if (payload.type !== 'story') n.branches = undefined
			if (
				payload.type !== 'story' &&
				payload.type !== 'comfyui' &&
				payload.type !== 'rotate-image' &&
				payload.type !== 'scene-understanding' &&
				payload.type !== 'scene-decompose' &&
				payload.type !== 'scene-layout' &&
				payload.type !== 'unreal-export' &&
				payload.type !== 'model3d' &&
				payload.type !== 'meshy'
			) {
				n.inputs = payload.type === 'text' ? [] : [{ id: 'in-0', label: '入口' }]
				n.outputs =
					payload.type === 'text'
						? [{ id: 'out-text', label: '文本', mediaType: 'text' }]
						: [{ id: 'out-0', label: '出口' }]
			}
			if (payload.type === 'rotate-image') {
				n.inputs = [{ id: 'in-0', label: '图片输入', mediaType: 'image' }]
				n.outputs = [{ id: 'out-0', label: '旋转图片', mediaType: 'image' }]
				n.rotatePromptText =
					typeof n.rotatePromptText === 'string' ? String(n.rotatePromptText) : ''
			}
			if (payload.type === 'text-merge') {
				n.textMergeItems = Array.isArray(n.textMergeItems)
					? n.textMergeItems
					: [{ id: makeId('merge') }]
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
					mock: false
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
						rectArea: 1
					},
					hidePlaceholderCubes: false,
					selectedLayoutItemId: '',
					selectedPlaceholderOutput: '',
					layoutItems: []
				}
				syncSceneLayoutAnchors(n)
			}
			if (payload.type === 'unreal-export') {
				n.unrealExportSettings = n.unrealExportSettings ?? {
					connectionStatus: 'idle',
					statusText: '等待连接',
					message: '',
					autoPoll: true
				}
				syncUnrealExportAnchors(n)
			}
			if (payload.type === 'scene-decompose') {
				n.sceneDecomposeSettings = n.sceneDecomposeSettings ?? {
					status: 'idle',
					message: '',
					inputJson: '',
					outputs: []
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
				n.comfyuiSettings =
					n.comfyuiSettings ??
					({
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
						outputs: []
					} as WorkflowComfyUINodeSettings)
				const baseInputs: WorkflowAnchorSpec[] = [
					...comfyPromptAnchors(),
					{ id: 'in-0', label: '图片输入', mediaType: 'image' }
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
					renderHeight: 1024
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
					meshyProgress: 0
				}
				syncMeshyAnchors(n)
			}
			if (!String(n.alias ?? '').trim() || String(n.alias) === prevDefaultAlias) {
				n.alias = defaultAliasForType(payload.type)
			}
			enforceSingleIOAnchors(n)
			if (!n.sizeCustomized) {
				if (
					payload.type === 'image' ||
					payload.type === 'rotate-image' ||
					payload.type === 'video' ||
					payload.type === 'scene-understanding' ||
					payload.type === 'scene-decompose' ||
					payload.type === 'scene-layout' ||
					payload.type === 'unreal-export' ||
					payload.type === 'story' ||
					payload.type === 'comfyui' ||
					payload.type === 'model3d' ||
					payload.type === 'meshy'
				) {
					n.width = 450
					n.height =
						payload.type === 'model3d'
							? 420
							: payload.type === 'meshy'
								? 470
								: payload.type === 'scene-layout'
									? 430
									: payload.type === 'unreal-export'
										? 320
										: payload.type === 'scene-decompose'
											? 360
											: payload.type === 'scene-understanding'
												? 360
												: 300
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
				if (
					!canLinkAnchors(state.nodesById, e.fromNodeId, e.fromAnchorId, e.toNodeId, e.toAnchorId)
				)
					removeIds.push(edgeId)
			}
			if (removeIds.length) {
				for (const edgeId of removeIds) delete state.edgesById[edgeId]
				state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
				if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId])
					state.selectedEdgeId = null
			}
		},
		textMergeAddItem(state: WorkflowState, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'text-merge') return
			const list = Array.isArray(n.textMergeItems) ? [...n.textMergeItems] : []
			list.push({ id: makeId('merge') })
			n.textMergeItems = list
			syncTextMergeAnchors(n)
		},
		textMergeRemoveItem(state: WorkflowState, payload: { nodeId: string; itemId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const itemId = String(payload?.itemId ?? '').trim()
			if (!id || !itemId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'text-merge') return
			const anchorId = `in-${itemId}`
			const list = Array.isArray(n.textMergeItems) ? n.textMergeItems : []
			n.textMergeItems = list.filter((x: { id?: string }) => String(x?.id ?? '').trim() !== itemId)
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
				if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId])
					state.selectedEdgeId = null
			}
		},
		textMergeMoveItem(
			state: WorkflowState,
			payload: { nodeId: string; itemId: string; dir: 'up' | 'down' }
		) {
			const id = String(payload?.nodeId ?? '').trim()
			const itemId = String(payload?.itemId ?? '').trim()
			const dir = payload?.dir
			if (!id || !itemId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'text-merge') return
			const list = Array.isArray(n.textMergeItems) ? [...n.textMergeItems] : []
			const idx = list.findIndex((x: { id?: string }) => String(x?.id ?? '').trim() === itemId)
			if (idx < 0) return
			const nextIdx = dir === 'up' ? idx - 1 : idx + 1
			if (nextIdx < 0 || nextIdx >= list.length) return
			const tmp = list[idx]
			list[idx] = list[nextIdx]
			list[nextIdx] = tmp
			n.textMergeItems = list
			syncTextMergeAnchors(n)
		},
		setNodeTextValue(state: WorkflowState, payload: { nodeId: string; textValue: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'text') return
			n.textValue =
				typeof payload?.textValue === 'string'
					? payload.textValue
					: String(payload?.textValue ?? '')
		},
		setNodeRotatePromptText(state: WorkflowState, payload: { nodeId: string; text: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'rotate-image') return
			n.rotatePromptText =
				typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '')
		},
		setNodeSceneUnderstandingSettings(
			state,
			payload: {
				nodeId: string
				sceneUnderstandingSettings: Partial<WorkflowSceneUnderstandingNodeSettings>
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'scene-understanding') return
			const next = payload?.sceneUnderstandingSettings
			if (!next || typeof next !== 'object') return
			n.sceneUnderstandingSettings = {
				...(n.sceneUnderstandingSettings ?? {}),
				...next
			}
			syncSceneUnderstandAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeSceneLayoutSettings(
			state: WorkflowState,
			payload: { nodeId: string; sceneLayoutSettings: Partial<WorkflowSceneLayoutNodeSettings> }
		) {
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
				const validIds = new Set(
					layoutItems.map((item: { id?: string }) => String(item?.id ?? '').trim()).filter(Boolean)
				)
				const hidePlaceholderCubes = settings.hidePlaceholderCubes === true
				if (Object.prototype.hasOwnProperty.call(next, 'selectedLayoutItemId')) {
					const rawSelectedLayoutItemId = String(
						(next as { selectedLayoutItemId?: unknown }).selectedLayoutItemId ?? ''
					).trim()
					const normalizedSelectedLayoutItemId =
						!hidePlaceholderCubes &&
						rawSelectedLayoutItemId &&
						validIds.has(rawSelectedLayoutItemId)
							? rawSelectedLayoutItemId
							: ''
					if (normalizedSelectedLayoutItemId)
						settings.selectedLayoutItemId = normalizedSelectedLayoutItemId
					else delete settings.selectedLayoutItemId
				}
				if (Object.prototype.hasOwnProperty.call(next, 'selectedPlaceholderOutput')) {
					const rawSelectedPlaceholderOutput = String(
						(next as { selectedPlaceholderOutput?: unknown }).selectedPlaceholderOutput ?? ''
					).trim()
					const normalizedSelectedPlaceholderOutput =
						rawSelectedPlaceholderOutput && validIds.has(rawSelectedPlaceholderOutput)
							? rawSelectedPlaceholderOutput
							: ''
					if (normalizedSelectedPlaceholderOutput)
						settings.selectedPlaceholderOutput = normalizedSelectedPlaceholderOutput
					else delete settings.selectedPlaceholderOutput
				}
				return
			}
			n.sceneLayoutSettings = sanitizeSceneLayoutSettings({
				...(n.sceneLayoutSettings ?? {}),
				...next
			})
			syncSceneLayoutAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeUnrealExportSettings(
			state,
			payload: { nodeId: string; unrealExportSettings: Partial<WorkflowUnrealExportNodeSettings> }
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'unreal-export') return
			const next = payload?.unrealExportSettings
			if (!next || typeof next !== 'object') return
			n.unrealExportSettings = {
				...(n.unrealExportSettings ?? {}),
				...normalizeUnrealExportSettings({ ...(n.unrealExportSettings ?? {}), ...next })
			}
			syncUnrealExportAnchors(n)
			pruneInvalidEdgesForNode(state, id)
		},
		setNodeSceneDecomposeSettings(
			state,
			payload: {
				nodeId: string
				sceneDecomposeSettings: Partial<WorkflowSceneDecomposeNodeSettings>
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'scene-decompose') return
			const next = payload?.sceneDecomposeSettings
			if (!next || typeof next !== 'object') return
			n.sceneDecomposeSettings = {
				...(n.sceneDecomposeSettings ?? {}),
				...next
			}
			syncSceneDecomposeAnchors(n)
		},
		setNodeComfyUISettings(
			state,
			payload: { nodeId: string; comfyuiSettings: Partial<WorkflowComfyUINodeSettings> }
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'comfyui') return
			const next = payload?.comfyuiSettings
			if (!next || typeof next !== 'object') return
			n.comfyuiSettings = {
				...(n.comfyuiSettings ?? {}),
				...next
			} as WorkflowComfyUINodeSettings
		},
		setNodeComfyUIWorkflowIO(
			state: WorkflowState,
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
				.map((a: unknown) =>
					isRecord(a)
						? {
								id: String(a.id ?? '').trim(),
								label: isString(a.label) ? a.label : undefined,
								offsetY: isNumber(a.offsetY) ? a.offsetY : undefined,
								mediaType: normalizeMediaType(a.mediaType, {
									nodeType: 'comfyui',
									anchorId: String(a.id ?? '')
								})
							}
						: { id: '' }
				)
				.filter(
					(a: { id: string }) =>
						a.id &&
						a.id !== COMFY_PROMPT_POSITIVE_ANCHOR_ID &&
						a.id !== COMFY_PROMPT_NEGATIVE_ANCHOR_ID
				)
			const outputs = outputsRaw
				.map((a: unknown) =>
					isRecord(a)
						? {
								id: String(a.id ?? '').trim(),
								label: isString(a.label) ? a.label : undefined,
								offsetY: isNumber(a.offsetY) ? a.offsetY : undefined,
								mediaType: normalizeMediaType(a.mediaType, {
									nodeType: 'comfyui',
									anchorId: String(a.id ?? '')
								})
							}
						: { id: '' }
				)
				.filter((a: { id: string }) => a.id)
			n.inputs = [...prompt, ...inputs]
			n.outputs = outputs.length
				? outputs
				: [{ id: 'out-0', label: '产物输出', mediaType: 'generic' }]
		},
		setNodeImageSettings(
			state,
			payload: {
				nodeId: string
				imageSettings: Partial<WorkflowImageNodeSettings>
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (n.type !== 'image') return
			const next = payload?.imageSettings
			if (!next || typeof next !== 'object') return

			const outW =
				next.outputWidth != null
					? Math.max(1, Math.floor(Number(next.outputWidth) || 1))
					: undefined
			const outH =
				next.outputHeight != null
					? Math.max(1, Math.floor(Number(next.outputHeight) || 1))
					: undefined
			const natW =
				next.naturalWidth != null
					? Math.max(1, Math.floor(Number(next.naturalWidth) || 1))
					: undefined
			const natH =
				next.naturalHeight != null
					? Math.max(1, Math.floor(Number(next.naturalHeight) || 1))
					: undefined
			const cropEnabled =
				typeof next.cropEnabled === 'boolean' ? Boolean(next.cropEnabled) : undefined

			const cropRaw = next.crop
			const crop =
				cropRaw && typeof cropRaw === 'object'
					? {
							x: Math.max(0, Math.min(1, Number(cropRaw.x) || 0)),
							y: Math.max(0, Math.min(1, Number(cropRaw.y) || 0)),
							width: Math.max(0, Math.min(1, Number(cropRaw.width) || 0)),
							height: Math.max(0, Math.min(1, Number(cropRaw.height) || 0))
						}
					: undefined

			const imageGenerationSource =
				next.imageGenerationSource === 'upload' ||
				next.imageGenerationSource === 'comfyui' ||
				next.imageGenerationSource === 'meshy'
					? next.imageGenerationSource
					: undefined

			const meshyImageSettingsRaw = next.meshyImageSettings
			const meshyImageSettings =
				meshyImageSettingsRaw && typeof meshyImageSettingsRaw === 'object'
					? {
							prompt:
								typeof meshyImageSettingsRaw.prompt === 'string'
									? meshyImageSettingsRaw.prompt
									: undefined,
							negativePrompt:
								typeof meshyImageSettingsRaw.negativePrompt === 'string'
									? meshyImageSettingsRaw.negativePrompt
									: undefined,
							seed: Number.isFinite(Number(meshyImageSettingsRaw.seed))
								? Number(meshyImageSettingsRaw.seed)
								: undefined,
							aiModel:
								meshyImageSettingsRaw.aiModel === 'nano-banana' ||
								meshyImageSettingsRaw.aiModel === 'nano-banana-pro'
									? meshyImageSettingsRaw.aiModel
									: undefined,
							generateMultiView:
								typeof meshyImageSettingsRaw.generateMultiView === 'boolean'
									? Boolean(meshyImageSettingsRaw.generateMultiView)
									: undefined,
							aspectRatio:
								typeof meshyImageSettingsRaw.aspectRatio === 'string'
									? meshyImageSettingsRaw.aspectRatio
									: undefined,
							outputImageCount: Number.isFinite(Number(meshyImageSettingsRaw.outputImageCount))
								? (Math.max(
										1,
										Math.min(4, Math.floor(Number(meshyImageSettingsRaw.outputImageCount)))
									) as 1 | 2 | 3 | 4)
								: undefined,
							poseMode:
								meshyImageSettingsRaw.poseMode === '' ||
								meshyImageSettingsRaw.poseMode === 'a-pose' ||
								meshyImageSettingsRaw.poseMode === 't-pose'
									? meshyImageSettingsRaw.poseMode
									: undefined,
							taskId:
								typeof meshyImageSettingsRaw.taskId === 'string'
									? meshyImageSettingsRaw.taskId
									: undefined,
							taskStatus:
								meshyImageSettingsRaw.taskStatus === 'idle' ||
								meshyImageSettingsRaw.taskStatus === 'pending' ||
								meshyImageSettingsRaw.taskStatus === 'running' ||
								meshyImageSettingsRaw.taskStatus === 'succeeded' ||
								meshyImageSettingsRaw.taskStatus === 'failed' ||
								meshyImageSettingsRaw.taskStatus === 'canceled'
									? meshyImageSettingsRaw.taskStatus
									: undefined,
							progress: Number.isFinite(Number(meshyImageSettingsRaw.progress))
								? Number(meshyImageSettingsRaw.progress)
								: undefined,
							statusText:
								typeof meshyImageSettingsRaw.statusText === 'string'
									? meshyImageSettingsRaw.statusText
									: undefined,
							errorMessage:
								typeof meshyImageSettingsRaw.errorMessage === 'string'
									? meshyImageSettingsRaw.errorMessage
									: undefined,
							outputSummary:
								meshyImageSettingsRaw.outputSummary &&
								typeof meshyImageSettingsRaw.outputSummary === 'object'
									? {
											preferredUrl:
												typeof meshyImageSettingsRaw.outputSummary.preferredUrl === 'string'
													? meshyImageSettingsRaw.outputSummary.preferredUrl
													: undefined,
											imageUrls: Array.isArray(meshyImageSettingsRaw.outputSummary.imageUrls)
												? meshyImageSettingsRaw.outputSummary.imageUrls
														.map((x: unknown) => (typeof x === 'string' ? x : ''))
														.filter((x: string) => !!x)
												: undefined,
											assetUrl:
												typeof meshyImageSettingsRaw.outputSummary.assetUrl === 'string'
													? meshyImageSettingsRaw.outputSummary.assetUrl
													: undefined,
											assetPath:
												typeof meshyImageSettingsRaw.outputSummary.assetPath === 'string'
													? meshyImageSettingsRaw.outputSummary.assetPath
													: undefined,
											thumbnailUrl:
												typeof meshyImageSettingsRaw.outputSummary.thumbnailUrl === 'string'
													? meshyImageSettingsRaw.outputSummary.thumbnailUrl
													: undefined
										}
									: undefined
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
				...(imageGenerationSource != null ? { imageGenerationSource } : {}),
				...(meshyImageSettings ? { meshyImageSettings } : {})
			}
		},
		setNodeModel3DSettings(
			state,
			payload: { nodeId: string; model3dSettings: Partial<WorkflowModel3DNodeSettings> }
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'model3d') return
			const next = payload?.model3dSettings
			if (!next || typeof next !== 'object') return

			const modelGenerationSource =
				next.modelGenerationSource === 'upload' ||
				next.modelGenerationSource === 'comfyui' ||
				next.modelGenerationSource === 'meshy'
					? next.modelGenerationSource
					: undefined

			const meshyModelSettingsRaw = next.meshyModelSettings
			const meshyModelSettings =
				meshyModelSettingsRaw && typeof meshyModelSettingsRaw === 'object'
					? {
							prompt:
								typeof meshyModelSettingsRaw.prompt === 'string'
									? meshyModelSettingsRaw.prompt
									: undefined,
							negativePrompt:
								typeof meshyModelSettingsRaw.negativePrompt === 'string'
									? meshyModelSettingsRaw.negativePrompt
									: undefined,
							seed: Number.isFinite(Number(meshyModelSettingsRaw.seed))
								? Number(meshyModelSettingsRaw.seed)
								: undefined,
							aiModel:
								meshyModelSettingsRaw.aiModel === 'latest' ||
								meshyModelSettingsRaw.aiModel === 'meshy-6' ||
								meshyModelSettingsRaw.aiModel === 'meshy-5'
									? meshyModelSettingsRaw.aiModel
									: undefined,
							taskFamily:
								meshyModelSettingsRaw.taskFamily === 'text-to-3d' ||
								meshyModelSettingsRaw.taskFamily === 'image-to-3d' ||
								meshyModelSettingsRaw.taskFamily === 'multi-image-to-3d' ||
								meshyModelSettingsRaw.taskFamily === 'retexture' ||
								meshyModelSettingsRaw.taskFamily === 'remesh' ||
								meshyModelSettingsRaw.taskFamily === 'uv-unwrap'
									? meshyModelSettingsRaw.taskFamily
									: undefined,
							modelType:
								meshyModelSettingsRaw.modelType === 'standard' ||
								meshyModelSettingsRaw.modelType === 'lowpoly'
									? meshyModelSettingsRaw.modelType
									: undefined,
							topology:
								meshyModelSettingsRaw.topology === 'triangle' ||
								meshyModelSettingsRaw.topology === 'quad'
									? meshyModelSettingsRaw.topology
									: undefined,
							targetPolycount: Number.isFinite(Number(meshyModelSettingsRaw.targetPolycount))
								? Math.max(0, Math.floor(Number(meshyModelSettingsRaw.targetPolycount)))
								: undefined,
							symmetryMode:
								meshyModelSettingsRaw.symmetryMode === 'auto' ||
								meshyModelSettingsRaw.symmetryMode === 'on' ||
								meshyModelSettingsRaw.symmetryMode === 'off'
									? meshyModelSettingsRaw.symmetryMode
									: undefined,
							shouldRemesh:
								typeof meshyModelSettingsRaw.shouldRemesh === 'boolean'
									? Boolean(meshyModelSettingsRaw.shouldRemesh)
									: undefined,
							savePreRemeshedModel:
								typeof meshyModelSettingsRaw.savePreRemeshedModel === 'boolean'
									? Boolean(meshyModelSettingsRaw.savePreRemeshedModel)
									: undefined,
							shouldTexture:
								typeof meshyModelSettingsRaw.shouldTexture === 'boolean'
									? Boolean(meshyModelSettingsRaw.shouldTexture)
									: undefined,
							enablePbr:
								typeof meshyModelSettingsRaw.enablePbr === 'boolean'
									? Boolean(meshyModelSettingsRaw.enablePbr)
									: undefined,
							texturePrompt:
								typeof meshyModelSettingsRaw.texturePrompt === 'string'
									? meshyModelSettingsRaw.texturePrompt
									: undefined,
							textureImageUrl:
								typeof meshyModelSettingsRaw.textureImageUrl === 'string'
									? meshyModelSettingsRaw.textureImageUrl
									: undefined,
							poseMode:
								meshyModelSettingsRaw.poseMode === '' ||
								meshyModelSettingsRaw.poseMode === 'a-pose' ||
								meshyModelSettingsRaw.poseMode === 't-pose'
									? meshyModelSettingsRaw.poseMode
									: undefined,
							autoSize:
								typeof meshyModelSettingsRaw.autoSize === 'boolean'
									? Boolean(meshyModelSettingsRaw.autoSize)
									: undefined,
							originAt:
								meshyModelSettingsRaw.originAt === 'bottom' ||
								meshyModelSettingsRaw.originAt === 'center'
									? meshyModelSettingsRaw.originAt
									: undefined,
							moderation:
								typeof meshyModelSettingsRaw.moderation === 'boolean'
									? Boolean(meshyModelSettingsRaw.moderation)
									: undefined,
							imageEnhancement:
								typeof meshyModelSettingsRaw.imageEnhancement === 'boolean'
									? Boolean(meshyModelSettingsRaw.imageEnhancement)
									: undefined,
							removeLighting:
								typeof meshyModelSettingsRaw.removeLighting === 'boolean'
									? Boolean(meshyModelSettingsRaw.removeLighting)
									: undefined,
							targetFormats: Array.isArray(meshyModelSettingsRaw.targetFormats)
								? meshyModelSettingsRaw.targetFormats
										.map((x: unknown) => (typeof x === 'string' ? x : ''))
										.filter((x: string) => !!x)
								: undefined,
							imageUrl:
								typeof meshyModelSettingsRaw.imageUrl === 'string'
									? meshyModelSettingsRaw.imageUrl
									: undefined,
							imageUrls: Array.isArray(meshyModelSettingsRaw.imageUrls)
								? meshyModelSettingsRaw.imageUrls
										.map((x: unknown) => (typeof x === 'string' ? x : ''))
										.filter((x: string) => !!x)
								: undefined,
							imageCount: Number.isFinite(Number(meshyModelSettingsRaw.imageCount))
								? Number(meshyModelSettingsRaw.imageCount)
								: undefined,
							taskId:
								typeof meshyModelSettingsRaw.taskId === 'string'
									? meshyModelSettingsRaw.taskId
									: undefined,
							taskStatus:
								meshyModelSettingsRaw.taskStatus === 'idle' ||
								meshyModelSettingsRaw.taskStatus === 'pending' ||
								meshyModelSettingsRaw.taskStatus === 'running' ||
								meshyModelSettingsRaw.taskStatus === 'succeeded' ||
								meshyModelSettingsRaw.taskStatus === 'failed' ||
								meshyModelSettingsRaw.taskStatus === 'canceled'
									? meshyModelSettingsRaw.taskStatus
									: undefined,
							progress: Number.isFinite(Number(meshyModelSettingsRaw.progress))
								? Number(meshyModelSettingsRaw.progress)
								: undefined,
							statusText:
								typeof meshyModelSettingsRaw.statusText === 'string'
									? meshyModelSettingsRaw.statusText
									: undefined,
							errorMessage:
								typeof meshyModelSettingsRaw.errorMessage === 'string'
									? meshyModelSettingsRaw.errorMessage
									: undefined,
							outputSummary:
								meshyModelSettingsRaw.outputSummary &&
								typeof meshyModelSettingsRaw.outputSummary === 'object'
									? {
											preferredUrl:
												typeof meshyModelSettingsRaw.outputSummary.preferredUrl === 'string'
													? meshyModelSettingsRaw.outputSummary.preferredUrl
													: undefined,
											assetUrl:
												typeof meshyModelSettingsRaw.outputSummary.assetUrl === 'string'
													? meshyModelSettingsRaw.outputSummary.assetUrl
													: undefined,
											assetPath:
												typeof meshyModelSettingsRaw.outputSummary.assetPath === 'string'
													? meshyModelSettingsRaw.outputSummary.assetPath
													: undefined,
											thumbnailUrl:
												typeof meshyModelSettingsRaw.outputSummary.thumbnailUrl === 'string'
													? meshyModelSettingsRaw.outputSummary.thumbnailUrl
													: undefined,
											format:
												typeof meshyModelSettingsRaw.outputSummary.format === 'string'
													? meshyModelSettingsRaw.outputSummary.format
													: undefined
										}
									: undefined,
							relationKind:
								meshyModelSettingsRaw.relationKind === 'model' ||
								meshyModelSettingsRaw.relationKind === 'texture' ||
								meshyModelSettingsRaw.relationKind === 'rigging' ||
								meshyModelSettingsRaw.relationKind === 'animation'
									? meshyModelSettingsRaw.relationKind
									: undefined,
							rootTaskId:
								typeof meshyModelSettingsRaw.rootTaskId === 'string'
									? meshyModelSettingsRaw.rootTaskId
									: undefined,
							parentTaskId:
								typeof meshyModelSettingsRaw.parentTaskId === 'string'
									? meshyModelSettingsRaw.parentTaskId
									: undefined,
							previewTaskId:
								typeof meshyModelSettingsRaw.previewTaskId === 'string'
									? meshyModelSettingsRaw.previewTaskId
									: undefined
						}
					: undefined

			const patch: Partial<WorkflowModel3DNodeSettings & { meshyModelSettings?: unknown }> = {
				...next
			}
			if (patch.lightIntensity != null)
				patch.lightIntensity = Math.max(0, Math.min(10, Number(patch.lightIntensity) || 0))
			if (patch.renderWidth != null)
				patch.renderWidth = Math.max(1, Math.floor(Number(patch.renderWidth) || 1))
			if (patch.renderHeight != null)
				patch.renderHeight = Math.max(1, Math.floor(Number(patch.renderHeight) || 1))
			delete patch.meshyModelSettings

			const existingMeshy = n.model3dSettings?.meshyModelSettings ?? {}
			const mergedMeshy = meshyModelSettings
				? Object.fromEntries(
						Object.entries({ ...existingMeshy, ...meshyModelSettings }).filter(
							([, v]) => v !== undefined
						)
					)
				: undefined

			n.model3dSettings = {
				...(n.model3dSettings ?? {}),
				...(modelGenerationSource != null ? { modelGenerationSource } : {}),
				...(mergedMeshy
					? { meshyModelSettings: mergedMeshy as WorkflowModel3DNodeSettings['meshyModelSettings'] }
					: {}),
				...patch
			}
		},
		setNodeMeshySettings(
			state,
			payload: { nodeId: string; meshySettings: Partial<WorkflowMeshyNodeSettings> }
		) {
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
			const fallbackFamily =
				current.meshyTaskFamily ?? getDefaultMeshyFamilyForTarget(nextTarget ?? '3d')
			const nextFamily = normalizeMeshyTaskFamily(
				hasFamily ? patch.meshyTaskFamily : fallbackFamily,
				nextTarget,
				patch.meshyMode ?? current.meshyMode,
				patch.meshyStage ?? current.meshyStage
			)
			patch.meshyTaskTarget = nextTarget ?? inferMeshyTargetFromFamily(nextFamily)
			patch.meshyTaskFamily =
				hasTarget && !hasFamily ? getDefaultMeshyFamilyForTarget(patch.meshyTaskTarget) : nextFamily
			patch.meshyHelpTopic = String(patch.meshyHelpTopic ?? current.meshyHelpTopic ?? nextFamily)
			patch.meshyMode = meshyLegacyModeForFamily(nextFamily) ?? patch.meshyMode
			patch.meshyStage = meshyLegacyStageForFamily(nextFamily) ?? patch.meshyStage
			if (patch.meshyTargetPolycount != null)
				patch.meshyTargetPolycount = Math.max(
					100,
					Math.min(300000, Math.floor(Number(patch.meshyTargetPolycount) || 100))
				)
			if (patch.meshyAnimationActionId != null)
				patch.meshyAnimationActionId = Math.max(
					1,
					Math.floor(Number(patch.meshyAnimationActionId) || 1)
				)
			if (patch.meshySeed != null)
				patch.meshySeed = Math.max(0, Math.floor(Number(patch.meshySeed) || 0))
			if (patch.meshyImageInputCount != null)
				patch.meshyImageInputCount = Math.max(
					0,
					Math.min(5, Math.floor(Number(patch.meshyImageInputCount) || 0))
				)
			if (patch.meshyOutputImageCount != null)
				patch.meshyOutputImageCount = Math.max(
					1,
					Math.min(4, Math.floor(Number(patch.meshyOutputImageCount) || 1))
				) as 1 | 2 | 3 | 4
			if (patch.meshyProgress != null)
				patch.meshyProgress = Math.max(0, Math.min(100, Number(patch.meshyProgress) || 0))
			if (patch.meshyImageUrls)
				patch.meshyImageUrls = patch.meshyImageUrls
					.map((x: unknown) => String(x ?? '').trim())
					.filter((x: string) => !!x)
					.slice(0, 5)
			if (patch.meshyTargetFormats)
				patch.meshyTargetFormats = normalizeMeshyTargetFormats(patch.meshyTargetFormats)
			if (patch.meshyGenerateMultiView === true) {
				patch.meshyAspectRatio = undefined
			}

			const mergedPreview = {
				...(n.meshySettings ?? {}),
				...patch
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
				if (
					!mergedPreview.meshyAiModel ||
					!['nano-banana', 'nano-banana-pro'].includes(String(mergedPreview.meshyAiModel))
				) {
					patch.meshyAiModel = 'nano-banana'
				}
			}
			if (patch.meshyOutputSummary && isRecord(patch.meshyOutputSummary)) {
				const outputSummary = patch.meshyOutputSummary
				if (Array.isArray(outputSummary.imageUrls)) {
					outputSummary.imageUrls = outputSummary.imageUrls
						.map((x: unknown) => String(x ?? '').trim())
						.filter((x: string) => !!x)
						.slice(0, 4)
				}
			}

			n.meshySettings = {
				...(n.meshySettings ?? {}),
				...patch
			}
			syncMeshyAnchors(n)
		},
		setNodeVideoSettings(
			state,
			payload: {
				nodeId: string
				videoSettings: {
					outputWidth?: number
					outputHeight?: number
					naturalWidth?: number
					naturalHeight?: number
				}
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'video') return
			const next = payload?.videoSettings
			if (!next || typeof next !== 'object') return
			const outW =
				next.outputWidth != null
					? Math.max(1, Math.floor(Number(next.outputWidth) || 1))
					: undefined
			const outH =
				next.outputHeight != null
					? Math.max(1, Math.floor(Number(next.outputHeight) || 1))
					: undefined
			const natW =
				next.naturalWidth != null
					? Math.max(1, Math.floor(Number(next.naturalWidth) || 1))
					: undefined
			const natH =
				next.naturalHeight != null
					? Math.max(1, Math.floor(Number(next.naturalHeight) || 1))
					: undefined
			n.videoSettings = {
				...(n.videoSettings ?? {}),
				...(outW != null ? { outputWidth: outW } : {}),
				...(outH != null ? { outputHeight: outH } : {}),
				...(natW != null ? { naturalWidth: natW } : {}),
				...(natH != null ? { naturalHeight: natH } : {})
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
			const pw =
				next.previewWidth != null
					? Math.max(1, Math.floor(Number(next.previewWidth) || 1))
					: undefined
			const ph =
				next.previewHeight != null
					? Math.max(1, Math.floor(Number(next.previewHeight) || 1))
					: undefined
			n.storySettings = {
				...(n.storySettings ?? {}),
				...(pw != null ? { previewWidth: pw } : {}),
				...(ph != null ? { previewHeight: ph } : {})
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
		setNodeSize(
			state,
			payload: { nodeId: string; width?: number; height?: number; customized?: boolean }
		) {
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
			state.clipboardPrimaryNodeId =
				state.selectedNodeId && ids.includes(state.selectedNodeId) ? state.selectedNodeId : ids[0]
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
						createdAt: Date.now()
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
				createdAt: Date.now()
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
		replaceWorkflowState(state: WorkflowState, payload: { snapshot: WorkflowState }) {
			// 用于撤销/重做：整份快照写回当前 state。
			const snap = payload?.snapshot
			if (!snap || typeof snap !== 'object') return
			if (snap.viewport && typeof snap.viewport === 'object') {
				state.viewport.zoom = clampZoom(Number(snap.viewport.zoom))
				state.viewport.panX = clamp(Number(snap.viewport.panX), -1e9, 1e9)
				state.viewport.panY = clamp(Number(snap.viewport.panY), -1e9, 1e9)
			} else {
				state.viewport = { zoom: 1, panX: 0, panY: 0 }
			}
			state.nodesById = snap.nodesById && typeof snap.nodesById === 'object' ? snap.nodesById : {}
			state.nodeOrder = Array.isArray(snap.nodeOrder) ? snap.nodeOrder : []
			state.edgesById = snap.edgesById && typeof snap.edgesById === 'object' ? snap.edgesById : {}
			state.edgeOrder = Array.isArray(snap.edgeOrder) ? snap.edgeOrder : []
			state.resourcesById =
				snap.resourcesById && typeof snap.resourcesById === 'object' ? snap.resourcesById : {}
			state.resourceOrder = Array.isArray(snap.resourceOrder) ? snap.resourceOrder : []
			state.selectedNodeId = typeof snap.selectedNodeId === 'string' ? snap.selectedNodeId : null
			state.selectedNodeIds = Array.isArray(snap.selectedNodeIds) ? snap.selectedNodeIds : []
			state.selectedEdgeId = typeof snap.selectedEdgeId === 'string' ? snap.selectedEdgeId : null
			state.clipboardNode = snap.clipboardNode ?? null
			state.clipboardNodes = snap.clipboardNodes ?? null
			state.clipboardPrimaryNodeId =
				typeof snap.clipboardPrimaryNodeId === 'string' ? snap.clipboardPrimaryNodeId : null
			state.chatDraft = typeof snap.chatDraft === 'string' ? snap.chatDraft : ''
			if (snap.nodeChatDialog && typeof snap.nodeChatDialog === 'object') {
				const dialog = snap.nodeChatDialog
				state.nodeChatDialog = {
					visible: Boolean(dialog.visible),
					nodeId: typeof dialog.nodeId === 'string' ? dialog.nodeId : null,
					nodeType: dialog.nodeType ?? null,
					draft: typeof dialog.draft === 'string' ? dialog.draft : '',
					submitting: Boolean(dialog.submitting),
					params: dialog.params && typeof dialog.params === 'object' ? dialog.params : {}
				}
			}
			if (snap.nodeGenerationTasksById && typeof snap.nodeGenerationTasksById === 'object') {
				state.nodeGenerationTasksById = snap.nodeGenerationTasksById
			}
			if (
				snap.nodeGenerationTaskIdsByNodeId &&
				typeof snap.nodeGenerationTaskIdsByNodeId === 'object'
			) {
				state.nodeGenerationTaskIdsByNodeId = snap.nodeGenerationTaskIdsByNodeId
			}
			// 多选标签
			if (snap.selectionTagsByKey && typeof snap.selectionTagsByKey === 'object') {
				state.selectionTagsByKey = snap.selectionTagsByKey as Record<string, WorkflowSelectionTag>
			} else {
				state.selectionTagsByKey = {}
			}
			// 已保存选区框
			if (Array.isArray(snap.savedSelectionFrames)) {
				state.savedSelectionFrames = snap.savedSelectionFrames
			} else {
				state.savedSelectionFrames = []
			}
			state.nodeCheckboxVisible =
				typeof snap.nodeCheckboxVisible === 'boolean' ? snap.nodeCheckboxVisible : true
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
			// 删除节点后，彻底清空选择状态，避免误选中其它节点。
			state.selectedNodeId = null
			state.selectedNodeIds = []
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId])
				state.selectedEdgeId = null
		},
		upsertNode(state: WorkflowState, payload: { node: WorkflowNode }) {
			const n = payload?.node
			if (!n || typeof n !== 'object') return
			const id = String(n.id ?? '').trim()
			if (!id) return
			const prev = state.nodesById[id]
			state.nodesById[id] = {
				...(prev ?? {}),
				...n,
				id,
				worldX: Number.isFinite(Number(n.worldX)) ? Number(n.worldX) : Number(prev?.worldX ?? 0),
				worldY: Number.isFinite(Number(n.worldY)) ? Number(n.worldY) : Number(prev?.worldY ?? 0),
				inputs: Array.isArray(n.inputs) ? n.inputs : (prev?.inputs ?? []),
				outputs: Array.isArray(n.outputs) ? n.outputs : (prev?.outputs ?? []),
				createdAt: Number.isFinite(Number(n.createdAt))
					? Number(n.createdAt)
					: (prev?.createdAt ?? Date.now())
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
				createdAt: Date.now()
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
		moveNodesBy(state, payload: { nodeIds: string[]; dx: number; dy: number }) {
			const ids = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
			const dx = Number(payload?.dx ?? 0)
			const dy = Number(payload?.dy ?? 0)
			if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
			for (const id of ids) {
				const n = state.nodesById[id]
				if (!n) continue
				n.worldX += dx
				n.worldY += dy
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
			// 删除节点后，彻底清空选择状态，避免误选中其它节点。
			state.selectedNodeIds = []
			state.selectedNodeId = null
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId])
				state.selectedEdgeId = null
		},
		addEdge(
			state,
			payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }
		) {
			const fromNodeId = String(payload?.fromNodeId ?? '').trim()
			const toNodeId = String(payload?.toNodeId ?? '').trim()
			if (!fromNodeId || !toNodeId) return
			if (!state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) return
			const toAnchorId = String(payload?.toAnchorId ?? 'in-0')
			// Check if the input anchor supports multiple connections
			const toNode = state.nodesById[toNodeId]
			const inputAnchor = Array.isArray(toNode.inputs)
				? toNode.inputs.find((a) => a.id === toAnchorId)
				: null
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
				createdAt: Date.now()
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
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId])
				state.selectedEdgeId = null
		},
		openNodeChatDialog(state, payload: { nodeId: string; nodeType: WorkflowNodeChatType }) {
			state.nodeChatDialog.visible = true
			state.nodeChatDialog.nodeId = payload.nodeId
			state.nodeChatDialog.nodeType = payload.nodeType
			const node = state.nodesById[payload.nodeId]
			let draft = ''
			if (payload.nodeType !== 'text') {
				draft = node?.textValue ?? ''
			}
			if (!draft) {
				const nodePrompt = (node as Record<string, unknown>).prompt
				draft = typeof nodePrompt === 'string' ? nodePrompt : ''
			}
			if (!draft) {
				draft = node?.nodeChatDraft ?? ''
			}
			state.nodeChatDialog.draft = draft
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
					;(node as Record<string, unknown>).prompt = payload.text
				}
			}
		},
		setNodeChatParams(state: WorkflowState, payload: { params: Record<string, unknown> }) {
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
		registerNodeGenerationTask(state, payload: { task: WorkflowNodeGenerationTask }) {
			const task = payload.task
			if (!task?.id || !task.nodeId) return
			state.nodeGenerationTasksById[task.id] = task
			const list = state.nodeGenerationTaskIdsByNodeId[task.nodeId] || []
			if (!list.includes(task.id)) {
				state.nodeGenerationTaskIdsByNodeId[task.nodeId] = [task.id, ...list]
			}
		},
		patchNodeGenerationTask(
			state,
			payload: { taskId: string; patch: Partial<WorkflowNodeGenerationTask> }
		) {
			const task = state.nodeGenerationTasksById[payload.taskId]
			if (!task) return
			Object.assign(task, payload.patch)
		},
		appendNodeGenerationDetail(state, payload: { taskId: string; line: string }) {
			const task = state.nodeGenerationTasksById[payload.taskId]
			if (!task) return
			const line = String(payload.line ?? '').trim()
			if (!line) return
			task.detailLines = [...task.detailLines, line].slice(-120)
		},
		appendNodeGenerationResult(
			state,
			payload: { taskId: string; result: WorkflowNodeGenerationTask['results'][number] }
		) {
			const task = state.nodeGenerationTasksById[payload.taskId]
			if (!task) return
			task.results = [...task.results, payload.result]
		},
		// —— 多选框显示开关 ——
		setNodeCheckboxVisible(state, payload: { visible: boolean }) {
			state.nodeCheckboxVisible = !!payload?.visible
		},
		// —— 切换单个节点的多选状态 ——
		toggleNodeSelection(state, payload: { nodeId: string; modifier?: boolean; range?: boolean }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id || !state.nodesById[id]) return
			const modifier = !!payload?.modifier
			const range = !!payload?.range

			if (range) {
				// Shift 区间选择
				const order = state.nodeOrder
				const current = state.selectedNodeId
				const curIdx = current ? order.indexOf(current) : -1
				const next = order.indexOf(id)
				if (curIdx >= 0 && next >= 0) {
					const [a, b] = curIdx < next ? [curIdx, next] : [next, curIdx]
					const rangeIds = order.slice(a, b + 1)
					state.selectedNodeIds = rangeIds
					state.selectedNodeId = id
					state.selectedEdgeId = null
					return
				}
			}

			if (modifier) {
				// Ctrl/Cmd：toggle
				if (state.selectedNodeIds.includes(id)) {
					state.selectedNodeIds = state.selectedNodeIds.filter((n) => n !== id)
					if (state.selectedNodeId === id) {
						state.selectedNodeId = state.selectedNodeIds[0] ?? null
					}
				} else {
					state.selectedNodeIds = [...state.selectedNodeIds, id]
					state.selectedNodeId = id
				}
				state.selectedEdgeId = null
				return
			}

			// 默认：单选
			state.selectedNodeId = id
			state.selectedNodeIds = [id]
			state.selectedEdgeId = null
		},
		// —— 多选标签 ——
		upsertSelectionTag(
			state,
			payload: {
				key: string
				label: string
				nodeIds: string[]
				color?: string
				note?: string
			}
		) {
			const key = String(payload?.key ?? '').trim()
			if (!key) return
			const label = String(payload?.label ?? '').trim()
			const nodeIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
			if (!label && !payload?.note) {
				delete state.selectionTagsByKey[key]
				return
			}
			const now = Date.now()
			const existing = state.selectionTagsByKey[key]
			state.selectionTagsByKey[key] = {
				key,
				label,
				nodeIds: nodeIds.slice().sort(),
				color: payload?.color ?? existing?.color,
				note: payload?.note ?? existing?.note,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			}
		},
		removeSelectionTag(state, payload: { key: string }) {
			const key = String(payload?.key ?? '').trim()
			if (!key) return
			delete state.selectionTagsByKey[key]
		},
		// —— 已保存选区框（持久化实体） ——
		upsertSavedSelectionFrame(state, payload: { id: string; label: string; nodeIds: string[] }) {
			const id = String(payload?.id ?? '').trim()
			if (!id) return
			const label = String(payload?.label ?? '').trim()
			const nodeIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds.slice().sort() : []
			const now = Date.now()

			const existingIdx = state.savedSelectionFrames.findIndex(
				(f: SavedSelectionFrame) => f.id === id
			)
			if (existingIdx >= 0) {
				state.savedSelectionFrames[existingIdx] = {
					...state.savedSelectionFrames[existingIdx],
					label,
					nodeIds
				}
			} else {
				state.savedSelectionFrames.push({ id, label, nodeIds, createdAt: now })
			}
		},
		removeSavedSelectionFrame(state: WorkflowState, payload: { id: string }) {
			const id = String(payload?.id ?? '').trim()
			if (!id) return
			state.savedSelectionFrames = state.savedSelectionFrames.filter(
				(f: SavedSelectionFrame) => f.id !== id
			)
		}
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
		moveNodesBy({ commit }, payload: { nodeIds: string[]; dx: number; dy: number }) {
			const ids = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
			const dx = Number(payload?.dx ?? 0)
			const dy = Number(payload?.dy ?? 0)

			if (!Number.isFinite(dx) || !Number.isFinite(dy) || !ids.length) return

			// 只移动直接传入的节点，不自动扩展到其他选区
			// 嵌套选区的联动是自然的：拖动父选区时子选区的节点本来就在父选区中
			commit('moveNodesBy', { nodeIds: ids, dx, dy })
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
			if (
				nodeType !== 'text' &&
				nodeType !== 'image' &&
				nodeType !== 'video' &&
				nodeType !== 'model3d'
			)
				return
			commit('openNodeChatDialog', { nodeId: payload.nodeId, nodeType })
		},
		closeNodeChatDialog({ commit }) {
			commit('closeNodeChatDialog')
		},
		setNodeChatDraft({ commit }, payload: { text: string }) {
			commit('setNodeChatDraft', payload)
		},
		setNodeChatParams({ commit }, payload: { params: Record<string, unknown> }) {
			commit('setNodeChatParams', payload)
		},
		submitNodeChat({ commit }, payload: WorkflowNodeChatSubmitPayload) {
			commit('setNodeChatSubmitting', { submitting: true })
			// The actual API wiring lives in the page-level handler (see AIWorkflowPage.vue)
			// so the store stays free of DOM / runtime-specific dependencies. The page will
			// call runNodeGenerationTask (useAIWorkflowNodeGeneration.ts) after this commit
			// and eventually release the submitting flag on completion.
			console.log('[AIWorkflow] submitNodeChat:', payload)
		},
		async submitNodeChatWithDeps(
			_,
			args: { deps: Record<string, unknown>; payload: WorkflowNodeChatSubmitPayload }
		) {
			const mod =
				await import('../../views/AIWorkflow/node-business/chat/useAIWorkflowNodeGeneration')
			await mod.runNodeGenerationTask(
				args.deps as Parameters<typeof mod.runNodeGenerationTask>[0],
				args.payload
			)
		},
		toggleNodeSelection(
			{ commit },
			payload: { nodeId: string; modifier?: boolean; range?: boolean }
		) {
			commit('toggleNodeSelection', payload)
		},
		upsertSelectionTag(
			{ commit },
			payload: { key: string; label: string; nodeIds: string[]; color?: string; note?: string }
		) {
			commit('upsertSelectionTag', payload)
		},
		removeSelectionTag({ commit }, payload: { key: string }) {
			commit('removeSelectionTag', payload)
		},
		upsertSavedSelectionFrame(
			{ commit },
			payload: { id: string; label: string; nodeIds: string[] }
		) {
			commit('upsertSavedSelectionFrame', payload)
		},
		removeSavedSelectionFrame({ commit }, payload: { id: string }) {
			commit('removeSavedSelectionFrame', payload)
		}
	}
})
