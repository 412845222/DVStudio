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
	WorkflowNodeChatSelectedRef,
	WorkflowNodeGenerationTask,
	WorkflowSelectionTag,
	SavedSelectionFrame,
	WorkflowModel3DNodeSettings,
	WorkflowBlenderNodeSettings,
	WorkflowBlenderChatMessage
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
	const n = Number(v)
	if (!Number.isFinite(n)) return 1
	return Math.max(0.1, Math.min(10, n))
}

const normalizeChatSelectedRefs = (v: unknown): WorkflowNodeChatSelectedRef[] | undefined => {
	if (!Array.isArray(v)) return undefined
	const result: WorkflowNodeChatSelectedRef[] = []
	for (const item of v) {
		if (!item || typeof item !== 'object') continue
		const kind = (item as any).kind || (item as any).type
		if (
			kind !== 'text' &&
			kind !== 'image' &&
			kind !== 'video' &&
			kind !== 'model3d' &&
			kind !== 'blender'
		)
			continue
		const label = isString((item as any).label)
			? String((item as any).label)
			: isString((item as any).name)
				? String((item as any).name)
				: ''
		const edgeId = isString((item as any).edgeId) ? String((item as any).edgeId) : undefined
		const fromNodeId = isString((item as any).fromNodeId)
			? String((item as any).fromNodeId)
			: undefined
		const fromAnchorId = isString((item as any).fromAnchorId)
			? String((item as any).fromAnchorId)
			: undefined
		const name = isString((item as any).name) ? String((item as any).name) : undefined
		const previewUrl = isString((item as any).previewUrl)
			? String((item as any).previewUrl)
			: undefined
		const fromContent = isString((item as any).fromContent)
			? String((item as any).fromContent)
			: undefined
		const id = isString((item as any).id) ? String((item as any).id) : undefined
		const type = isString((item as any).type) ? String((item as any).type) : undefined
		// 保留所有字段，避免previewUrl等数据在规范化时丢失
		result.push({
			kind,
			label,
			edgeId,
			fromNodeId,
			fromAnchorId,
			name,
			previewUrl,
			fromContent,
			id,
			type
		})
	}
	// 空数组保留为[]而非undefined，避免数据不一致
	return result
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
	return {
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById: {},
		nodeOrder: [],
		edgesById: {},
		edgeOrder: [],
		resourcesById: {},
		resourceOrder: [],
		selectedNodeId: null,
		selectedNodeIds: [],
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
			selectedRefs: [] as WorkflowNodeChatSelectedRef[]
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
		case 'blender':
			return 'Blender节点'
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
			inputs: [
				{
					id: 'in-0',
					label: '多模态输入',
					mediaType: 'generic',
					acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
					multiInput: true
				}
			],
			outputs: [{ id: 'out-0', label: '文本输出', mediaType: 'text' }]
		}
	}
	if (type === 'image') {
		return {
			inputs: [
				{
					id: 'in-resource',
					label: '资源输入',
					mediaType: 'resource',
					acceptedMediaTypes: ['image', 'video', 'resource'],
					multiInput: true
				},
				{
					id: 'in-0',
					label: '多模态输入',
					mediaType: 'generic',
					acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
					multiInput: true
				}
			],
			outputs: [{ id: 'out-image', label: '图片输出', mediaType: 'image' }]
		}
	}
	if (type === 'video') {
		return {
			inputs: [
				{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
				{ id: 'in-image', label: '参考图输入', multiInput: true, mediaType: 'image' },
				{ id: 'in-video', label: '参考视频输入', multiInput: true, mediaType: 'video' }
			],
			outputs: [
				{ id: 'out-resource', label: '资源输出', mediaType: 'resource' },
				{ id: 'out-video', label: '视频输出', mediaType: 'video' }
			]
		}
	}
	if (type === 'model3d') {
		return {
			inputs: [
				{ id: 'in-model', label: '模型输入', mediaType: 'model3d' },
				{ id: 'in-text', label: '提示词', mediaType: 'text' },
				{ id: 'in-image-1', label: '参考图 1', mediaType: 'image' },
				{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
				{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
				{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' }
			],
			outputs: [
				{ id: 'out-model', label: '模型输出', mediaType: 'model3d' },
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
		// 旧ID映射: in-text/in-image/in-0 -> in-0 (多模态输入), in-resource保留为资源输入
		if (nextAnchorId === 'in-text' || nextAnchorId === 'in-image' || nextAnchorId === 'in-0')
			return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'video') {
		// 旧的in-0/in-video是视频输入，映射到in-video；text和image是新增锚点无需旧映射
		if (nextAnchorId === 'in-0' || nextAnchorId === 'in-video') return 'in-video'
		return nextAnchorId
	}
	if (nextType === 'text') {
		if (nextAnchorId === 'in-text') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'model3d') {
		// 旧ID映射: in-0/in-resource/in-model -> in-model
		if (nextAnchorId === 'in-0' || nextAnchorId === 'in-resource' || nextAnchorId === 'in-model')
			return 'in-model'
		return nextAnchorId
	}
	if (nextType === 'rotate-image') {
		if (nextAnchorId === 'in-image') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'blender') {
		if (nextAnchorId === 'in-model') return 'in-0'
		return nextAnchorId
	}
	if (nextType === 'comfyui') {
		if (nextAnchorId === 'in-resource' || nextAnchorId === 'in-text') return 'in'
		if (nextAnchorId.startsWith('in-') && nextAnchorId !== 'in') return 'in'
	}
	return nextAnchorId
}

const remapLegacyOutputAnchorId = (nodeType: string, anchorId: string) => {
	const nextType = String(nodeType ?? '').trim()
	const nextAnchorId = String(anchorId ?? '').trim()
	if (!nextAnchorId) return nextAnchorId
	if (nextType === 'image') {
		// 旧的out-0映射到out-image
		if (nextAnchorId === 'out-0' || nextAnchorId === 'out-image') return 'out-image'
		return nextAnchorId
	}
	if (nextType === 'video') {
		// 旧的out-0映射到out-video
		if (nextAnchorId === 'out-0' || nextAnchorId === 'out-video') return 'out-video'
		return nextAnchorId
	}
	if (nextType === 'text') {
		if (nextAnchorId === 'out-text') return 'out-0'
		return nextAnchorId
	}
	if (nextType === 'model3d') {
		// 旧的out-0/out-model/out-render映射到out-model
		if (nextAnchorId === 'out-0' || nextAnchorId === 'out-model' || nextAnchorId === 'out-render')
			return 'out-model'
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
	if (nextType === 'comfyui') {
		if (nextAnchorId === 'out-media') return 'out'
		if (nextAnchorId.startsWith('out-') && nextAnchorId !== 'out') return 'out'
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

const COMFY_INPUT_ANCHOR_ID = 'in'

const comfyInputAnchors = (): WorkflowAnchorSpec[] => {
	return [
		{
			id: COMFY_INPUT_ANCHOR_ID,
			label: '输入',
			mediaType: 'generic',
			acceptedMediaTypes: ['text', 'image', 'video', 'model3d'],
			multiInput: true
		}
	]
}

const comfyDefaultOutputAnchors = (): WorkflowAnchorSpec[] => {
	return [{ id: 'out', label: '输出', mediaType: 'generic' }]
}

const normalizeSceneUnderstandingSettings = (
	rawSettings: unknown
): WorkflowSceneUnderstandingNodeSettings => {
	if (!rawSettings || !isRecord(rawSettings)) {
		return {
			mode: 'scene-layout',
			sceneType: 'auto',
			status: 'idle',
			availableModels: [],
			selectedModel: ''
		}
	}
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
		sceneType: raw.sceneType === 'indoor' || raw.sceneType === 'outdoor' ? raw.sceneType : 'auto',
		detectedSceneType:
			raw.detectedSceneType === 'indoor' ||
			raw.detectedSceneType === 'outdoor' ||
			raw.detectedSceneType === 'semi-outdoor'
				? raw.detectedSceneType
				: undefined,
		sceneTypeConfidence: Number.isFinite(Number(raw.sceneTypeConfidence))
			? Number(raw.sceneTypeConfidence)
			: undefined,
		selectedModel: isString(raw.selectedModel) ? raw.selectedModel : '',
		availableModels: availableModels ?? [],
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
		reasoningText: isString(raw.reasoningText) ? raw.reasoningText : undefined,
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
		assetRootPath:
			isString(raw.assetRootPath) && raw.assetRootPath.trim()
				? raw.assetRootPath.trim()
				: '/Game/DVStudio',
		assetPathValidation:
			raw.assetPathValidation === 'valid' ||
			raw.assetPathValidation === 'invalid' ||
			raw.assetPathValidation === 'checking'
				? raw.assetPathValidation
				: undefined,
		assetPathValidationError: isString(raw.assetPathValidationError)
			? raw.assetPathValidationError
			: undefined
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

const syncBlenderAnchors = (node: WorkflowNode) => {
	const existingIn = Array.isArray(node.inputs) ? node.inputs.find((a) => a.id === 'in-0') : null
	const existingOut = Array.isArray(node.outputs)
		? node.outputs.find((a) => a.id === 'out-0')
		: null
	node.inputs = [
		{
			id: 'in-0',
			label: '输入（文本/图片/3D模型）',
			mediaType: 'generic' as const,
			acceptedMediaTypes: ['text', 'image', 'model3d'] as Array<'text' | 'image' | 'model3d'>,
			...(existingIn ?? {}),
			multiInput: true
		}
	]
	node.outputs = [
		{
			id: 'out-0',
			label: '输出（文本/图片/3D模型）',
			mediaType: 'generic' as const,
			...(existingOut ?? {})
		}
	]
}

const syncTextAnchors = (node: WorkflowNode) => {
	const existingIn = Array.isArray(node.inputs) ? node.inputs.find((a) => a.id === 'in-0') : null
	const existingOut = Array.isArray(node.outputs)
		? node.outputs.find((a) => a.id === 'out-0')
		: null
	node.inputs = [
		{
			id: 'in-0',
			label: '输入（文本/图片/视频/3D模型/音频）',
			mediaType: 'generic' as const,
			acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'] as Array<
				'text' | 'image' | 'video' | 'model3d' | 'audio'
			>,
			...(existingIn ?? {}),
			multiInput: true
		}
	]
	node.outputs = [
		{
			id: 'out-0',
			label: '文本输出',
			mediaType: 'text' as const,
			...(existingOut ?? {})
		}
	]
}

export const syncSceneUnderstandAnchors = (node: WorkflowNode) => {
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
		? node.sceneLayoutSettings!.layoutItems!.filter((item) => String(item?.id ?? '').trim())
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
	// 输出锚点归一：单一out-0锚点，mediaType为text，可连接场景分解或虚幻导出节点
	node.outputs = [
		{ id: 'out-0', label: '布局输出', mediaType: 'text' }
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
	// 场景拆解节点输出锚点归一化：无论拆解出多少对象，只保留一个总输出锚点out-0，
	// 所有自动布线均从该锚点出发，锚点ID保持稳定不随输出状态变化，避免连线错位。
	const hasOutputs = outputs.length > 0
	node.outputs = [
		{ id: 'out-0', label: hasOutputs ? '拆解输出' : '待分解', mediaType: hasOutputs ? 'image' : 'text' }
	]
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

const normalizeTripo3DModelSettings = (rawInput: unknown): Record<string, unknown> | undefined => {
	if (!rawInput || !isRecord(rawInput)) return undefined
	const raw: Record<string, unknown> = { ...rawInput }
	const result: Record<string, unknown> = {}
	// 字段映射：旧无前缀字段名 -> 新带tripo3d前缀字段名
	const legacyFieldMap: Record<string, string> = {
		taskId: 'tripo3dTaskId',
		taskStatus: 'tripo3dTaskStatus',
		taskFamily: 'tripo3dTaskFamily',
		taskMode: 'tripo3dTaskMode',
		statusText: 'tripo3dStatusText',
		errorMessage: 'tripo3dErrorMessage',
		prompt: 'tripo3dPrompt',
		negativePrompt: 'tripo3dNegativePrompt',
		imageUrl: 'tripo3dImageUrl',
		modelSeries: 'tripo3dModelSeries',
		modelVersion: 'tripo3dModelVersion',
		textureAlignment: 'tripo3dTextureAlignment',
		orientation: 'tripo3dOrientation',
		textureQuality: 'tripo3dTextureQuality',
		geometryQuality: 'tripo3dGeometryQuality',
		modelTaskId: 'tripo3dModelTaskId',
		rootTaskId: 'tripo3dRootTaskId',
		parentTaskId: 'tripo3dParentTaskId',
		thumbnailUrl: 'tripo3dThumbnailUrl',
		outputAssetUrl: 'tripo3dOutputAssetUrl',
		outputAssetPath: 'tripo3dOutputAssetPath',
		modelUrl: 'tripo3dModelUrl',
		mode: 'tripo3dMode',
		downloadStage: 'tripo3dDownloadStage',
		downloadError: 'tripo3dDownloadError',
		upstreamTaskId: 'tripo3dUpstreamTaskId',
		upstreamTaskFamily: 'tripo3dUpstreamTaskFamily',
		upstreamTaskStatus: 'tripo3dUpstreamTaskStatus',
		progress: 'tripo3dProgress',
		faceLimit: 'tripo3dFaceLimit',
		modelSeed: 'tripo3dModelSeed',
		textureSeed: 'tripo3dTextureSeed',
		downloadProgress: 'tripo3dDownloadProgress',
		downloadLoadedBytes: 'tripo3dDownloadLoadedBytes',
		downloadTotalBytes: 'tripo3dDownloadTotalBytes',
		downloadSpeedBytesPerSec: 'tripo3dDownloadSpeedBytesPerSec',
		imageCount: 'tripo3dImageCount',
		enabled: 'tripo3dEnabled',
		forceSingleImage: 'tripo3dForceSingleImage',
		texture: 'tripo3dTexture',
		pbr: 'tripo3dPbr',
		enableImageAutofix: 'tripo3dEnableImageAutofix',
		autoSize: 'tripo3dAutoSize',
		quad: 'tripo3dQuad',
		smartLowPoly: 'tripo3dSmartLowPoly',
		generateParts: 'tripo3dGenerateParts',
		compress: 'tripo3dCompress',
		exportUv: 'tripo3dExportUv'
	}
	// 先读取旧无前缀字段
	for (const [legacyKey, newKey] of Object.entries(legacyFieldMap)) {
		if (legacyKey in raw && !(newKey in raw)) {
			const val = raw[legacyKey]
			if (val !== undefined && val !== null) {
				raw[newKey] = val
			}
		}
	}
	const stringFields = [
		'tripo3dTaskFamily',
		'tripo3dTaskId',
		'tripo3dTaskStatus',
		'tripo3dStatusText',
		'tripo3dErrorMessage',
		'tripo3dPrompt',
		'tripo3dNegativePrompt',
		'tripo3dImageUrl',
		'tripo3dModelSeries',
		'tripo3dModelVersion',
		'tripo3dTextureAlignment',
		'tripo3dOrientation',
		'tripo3dTextureQuality',
		'tripo3dGeometryQuality',
		'tripo3dModelTaskId',
		'tripo3dRootTaskId',
		'tripo3dParentTaskId',
		'tripo3dThumbnailUrl',
		'tripo3dOutputAssetUrl',
		'tripo3dOutputAssetPath',
		'tripo3dModelUrl',
		'tripo3dMode',
		'tripo3dDownloadStage',
		'tripo3dDownloadError',
		'tripo3dUpstreamTaskId',
		'tripo3dUpstreamTaskFamily',
		'tripo3dUpstreamTaskStatus',
		'tripo3dTaskMode'
	]
	for (const key of stringFields) {
		const val = raw[key]
		if (isString(val)) result[key] = String(val)
	}
	const numberFields = [
		'tripo3dProgress',
		'tripo3dFaceLimit',
		'tripo3dModelSeed',
		'tripo3dTextureSeed',
		'tripo3dDownloadProgress',
		'tripo3dDownloadLoadedBytes',
		'tripo3dDownloadTotalBytes',
		'tripo3dDownloadSpeedBytesPerSec',
		'tripo3dImageCount'
	]
	for (const key of numberFields) {
		const val = raw[key]
		if (Number.isFinite(Number(val))) result[key] = Number(val)
	}
	const boolFields = [
		'tripo3dEnabled',
		'tripo3dForceSingleImage',
		'tripo3dTexture',
		'tripo3dPbr',
		'tripo3dEnableImageAutofix',
		'tripo3dAutoSize',
		'tripo3dQuad',
		'tripo3dSmartLowPoly',
		'tripo3dGenerateParts',
		'tripo3dCompress',
		'tripo3dExportUv'
	]
	for (const key of boolFields) {
		const val = raw[key]
		if (typeof val === 'boolean') result[key] = val
	}
	if (isArray(raw.tripo3dSelectedImages)) {
		result.tripo3dSelectedImages = raw.tripo3dSelectedImages
			.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
			.map((item) => {
				const normalized: Record<string, unknown> = {}
				if (isString(item.url)) normalized.url = String(item.url)
				if (isString(item.direction)) normalized.direction = String(item.direction)
				if (isString(item.label)) normalized.label = String(item.label)
				if (isString(item.nodeId)) normalized.nodeId = String(item.nodeId)
				return normalized
			})
	}
	if (isArray(raw.tripo3dImageUrls)) {
		result.tripo3dImageUrls = raw.tripo3dImageUrls
			.map((x: unknown) => (isString(x) ? String(x).trim() : ''))
			.filter((x: string) => !!x)
	}
	const recordFields = [
		'tripo3dRelationKind',
		'tripo3dRelationSummary',
		'tripo3dOutputSummary',
		'tripo3dInputSummary',
		'tripo3dRequestPayload',
		'tripo3dResponsePayload'
	]
	for (const key of recordFields) {
		const val = raw[key]
		if (isRecord(val)) result[key] = { ...val }
	}
	// 兼容success状态：映射到succeeded
	if (result.tripo3dTaskStatus === 'success') {
		result.tripo3dTaskStatus = 'succeeded'
	}
	if (result.tripo3dUpstreamTaskStatus === 'success') {
		result.tripo3dUpstreamTaskStatus = 'succeeded'
	}
	// 兼容done状态：映射到succeeded
	if (result.tripo3dTaskStatus === 'done') {
		result.tripo3dTaskStatus = 'succeeded'
	}
	if (result.tripo3dUpstreamTaskStatus === 'done') {
		result.tripo3dUpstreamTaskStatus = 'succeeded'
	}
	return Object.keys(result).length > 0 ? result : undefined
}

const normalizeModel3DSettings = (
	rawSettings: unknown
): WorkflowModel3DNodeSettings | undefined => {
	if (!rawSettings || !isRecord(rawSettings)) return undefined
	const raw = rawSettings
	const genSource = String(raw.modelGenerationSource ?? '').trim()
	const modelGenerationSource: WorkflowModel3DNodeSettings['modelGenerationSource'] =
		genSource === 'upload' ||
		genSource === 'comfyui' ||
		genSource === 'meshy' ||
		genSource === 'tripo3d'
			? genSource
			: undefined
	const tripo3dModelSettings = normalizeTripo3DModelSettings(raw.tripo3dModelSettings)
	const meshyModelSettingsRaw = isRecord(raw.meshyModelSettings)
		? raw.meshyModelSettings
		: undefined
	return {
		modelGenerationSource,
		tripo3dModelSettings:
			tripo3dModelSettings as WorkflowModel3DNodeSettings['tripo3dModelSettings'],
		meshyModelSettings: meshyModelSettingsRaw
			? ({ ...meshyModelSettingsRaw } as WorkflowModel3DNodeSettings['meshyModelSettings'])
			: undefined,
		modelUrl: isString(raw.modelUrl) ? String(raw.modelUrl) : undefined,
		modelProjectRelativePath: isString(raw.modelProjectRelativePath)
			? String(raw.modelProjectRelativePath)
			: undefined,
		modelFormat:
			raw.modelFormat === 'gltf' ? 'gltf' : raw.modelFormat === 'glb' ? 'glb' : undefined,
		modelSourceName: isString(raw.modelSourceName) ? String(raw.modelSourceName) : undefined,
		modelSourcePath: isString(raw.modelSourcePath) ? String(raw.modelSourcePath) : undefined,
		modelAssetUrl: isString(raw.modelAssetUrl) ? String(raw.modelAssetUrl) : undefined,
		modelAssetPath: isString(raw.modelAssetPath) ? String(raw.modelAssetPath) : undefined,
		modelAssetProjectRelativePath: isString(raw.modelAssetProjectRelativePath)
			? String(raw.modelAssetProjectRelativePath)
			: undefined,
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

const normalizeTripo3DImageSettings = (raw: unknown): Record<string, unknown> | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const result: Record<string, unknown> = {}
	const stringFields = [
		'prompt',
		'negativePrompt',
		'taskId',
		'taskStatus',
		'statusText',
		'errorMessage',
		'taskFamily',
		'taskMode',
		'mode',
		'model',
		'size',
		'inputUrl',
		'thumbnailUrl',
		'outputImageUrl'
	]
	for (const key of stringFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (isString(val)) result[key] = String(val)
	}
	const numberFields = ['progress', 'numOutputs', 'seed', 'strength']
	for (const key of numberFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (Number.isFinite(Number(val))) result[key] = Number(val)
	}
	if (isArray((raw as Record<string, unknown>).outputImages)) {
		result.outputImages = ((raw as Record<string, unknown>).outputImages as unknown[])
			.map((x: unknown) => (isString(x) ? String(x).trim() : ''))
			.filter((x: string) => !!x)
	}
	const recordFields = ['submittedParams', 'outputSummary', 'requestPayload', 'responsePayload']
	for (const key of recordFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (isRecord(val)) result[key] = { ...val }
	}
	return Object.keys(result).length > 0 ? result : undefined
}

const normalizeMeshyImageSettings = (raw: unknown): Record<string, unknown> | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const result: Record<string, unknown> = {}
	const stringFields = [
		'prompt',
		'negativePrompt',
		'aiModel',
		'aspectRatio',
		'poseMode',
		'taskId',
		'taskFamily',
		'mode',
		'taskStatus',
		'statusText',
		'errorMessage'
	]
	for (const key of stringFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (isString(val)) result[key] = String(val)
	}
	const numberFields = ['seed', 'outputImageCount', 'outputCount', 'progress']
	for (const key of numberFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (Number.isFinite(Number(val))) result[key] = Number(val)
	}
	const boolFields = ['generateMultiView']
	for (const key of boolFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (typeof val === 'boolean') result[key] = val
	}
	const recordFields = ['submittedParams', 'outputSummary']
	for (const key of recordFields) {
		const val = (raw as Record<string, unknown>)[key]
		if (isRecord(val)) result[key] = { ...val }
	}
	return Object.keys(result).length > 0 ? result : undefined
}

const normalizeImageSettings = (raw: unknown): WorkflowImageNodeSettings | undefined => {
	if (!raw || !isRecord(raw)) return undefined
	const cropObj = isRecord(raw.crop) ? raw.crop : undefined
	const genSource = String(raw.imageGenerationSource ?? '').trim()
	const imageGenerationSource: WorkflowImageNodeSettings['imageGenerationSource'] =
		genSource === 'upload' ||
		genSource === 'comfyui' ||
		genSource === 'meshy' ||
		genSource === 'gemini' ||
		genSource === 'tripo3d'
			? genSource
			: undefined
	const tripo3dImageSettings = normalizeTripo3DImageSettings(raw.tripo3dImageSettings)
	const meshyImageSettings = normalizeMeshyImageSettings(raw.meshyImageSettings)
	return {
		outputWidth: Number.isFinite(Number(raw.outputWidth))
			? Math.max(1, Math.floor(Number(raw.outputWidth)))
			: undefined,
		outputHeight: Number.isFinite(Number(raw.outputHeight))
			? Math.max(1, Math.floor(Number(raw.outputHeight)))
			: undefined,
		outputFormat:
			raw.outputFormat === 'png'
				? 'png'
				: raw.outputFormat === 'jpeg'
					? 'jpeg'
					: raw.outputFormat === 'webp'
						? 'webp'
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
			: undefined,
		imageGenerationSource,
		lastGeneratedImageUrl: isString(raw.lastGeneratedImageUrl)
			? String(raw.lastGeneratedImageUrl)
			: undefined,
		meshyImageSettings: meshyImageSettings as WorkflowImageNodeSettings['meshyImageSettings'],
		tripo3dImageSettings: tripo3dImageSettings as WorkflowImageNodeSettings['tripo3dImageSettings']
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
			: undefined,
		currentTime: Number.isFinite(Number(raw.currentTime))
			? Math.max(0, Number(raw.currentTime))
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
				let model3dSettings = normalizeModel3DSettings(n.model3dSettings)
				const meshySettings = normalizeMeshySettings(n.meshySettings ?? n.model3dSettings)
				const rootTripo3dSettings = normalizeTripo3DModelSettings(n.tripo3dSettings)
				const rawBlenderSettings = isRecord(n.blenderSettings) ? n.blenderSettings : undefined
				const blenderSettings: WorkflowBlenderNodeSettings | undefined =
					type === 'blender'
						? {
								mcpServerId: isString(rawBlenderSettings?.mcpServerId)
									? String(rawBlenderSettings!.mcpServerId)
									: undefined,
								mcpHost: isString(rawBlenderSettings?.mcpHost)
									? String(rawBlenderSettings!.mcpHost)
									: undefined,
								mcpPort: Number.isFinite(Number(rawBlenderSettings?.mcpPort))
									? Number(rawBlenderSettings!.mcpPort)
									: undefined,
								mcpStatus: (isString(rawBlenderSettings?.mcpStatus) &&
								[
									'unchecked',
									'checking',
									'no-blender',
									'no-addon',
									'blender-not-running',
									'addon-not-started',
									'disconnected',
									'connecting',
									'connected',
									'error'
								].includes(String(rawBlenderSettings!.mcpStatus))
									? String(rawBlenderSettings!.mcpStatus)
									: 'unchecked') as WorkflowBlenderNodeSettings['mcpStatus'],
								mcpError: isString(rawBlenderSettings?.mcpError)
									? String(rawBlenderSettings!.mcpError)
									: null,
								blenderPath: isString(rawBlenderSettings?.blenderPath)
									? String(rawBlenderSettings!.blenderPath)
									: null,
								blenderVersion: isString(rawBlenderSettings?.blenderVersion)
									? String(rawBlenderSettings!.blenderVersion)
									: null,
								hasBlender:
									typeof rawBlenderSettings?.hasBlender === 'boolean'
										? Boolean(rawBlenderSettings!.hasBlender)
										: undefined,
								hasAddon:
									typeof rawBlenderSettings?.hasAddon === 'boolean'
										? Boolean(rawBlenderSettings!.hasAddon)
										: undefined,
								blenderRunning:
									typeof rawBlenderSettings?.blenderRunning === 'boolean'
										? Boolean(rawBlenderSettings!.blenderRunning)
										: undefined,
								addonListening:
									typeof rawBlenderSettings?.addonListening === 'boolean'
										? Boolean(rawBlenderSettings!.addonListening)
										: undefined,
								importStatus: (isString(rawBlenderSettings?.importStatus) &&
								['idle', 'downloading', 'importing', 'completed', 'error'].includes(
									String(rawBlenderSettings!.importStatus)
								)
									? String(rawBlenderSettings!.importStatus)
									: 'idle') as WorkflowBlenderNodeSettings['importStatus'],
								importProgress: Number.isFinite(Number(rawBlenderSettings?.importProgress))
									? Math.max(0, Math.min(100, Number(rawBlenderSettings!.importProgress)))
									: 0,
								importError: isString(rawBlenderSettings?.importError)
									? String(rawBlenderSettings!.importError)
									: null,
								chatMessages: Array.isArray(rawBlenderSettings?.chatMessages)
									? (rawBlenderSettings!.chatMessages as unknown[])
											.filter((m) => isRecord(m))
											.map((m) => {
												const rec = m as Record<string, unknown>
												return {
													id: isString(rec.id)
														? String(rec.id)
														: String(Date.now() + Math.random()),
													role: (isString(rec.role) &&
													[
														'user',
														'assistant',
														'system',
														'tool_call',
														'tool_result',
														'tool',
														'thinking',
														'command'
													].includes(String(rec.role))
														? String(rec.role)
														: 'user') as WorkflowBlenderChatMessage['role'],
													content: isString(rec.content) ? String(rec.content) : '',
													timestamp: Number.isFinite(Number(rec.timestamp))
														? Number(rec.timestamp)
														: Date.now(),
													toolName: isString(rec.toolName) ? String(rec.toolName) : undefined,
													toolArgs: isRecord(rec.toolArgs)
														? (rec.toolArgs as Record<string, unknown>)
														: undefined,
													toolResult: rec.toolResult !== undefined ? rec.toolResult : undefined,
													toolError: isString(rec.toolError) ? String(rec.toolError) : undefined,
													toolCallId: isString(rec.toolCallId) ? String(rec.toolCallId) : undefined,
													status: (isString(rec.status) &&
													['running', 'completed', 'error'].includes(String(rec.status))
														? String(rec.status)
														: undefined) as WorkflowBlenderChatMessage['status'],
													isStreaming: Boolean(rec.isStreaming),
													isThinking: Boolean(rec.isThinking),
													isStreamingThinking: Boolean(rec.isStreamingThinking),
													isError: Boolean(rec.isError),
													collapsed:
														typeof rec.collapsed === 'boolean' ? Boolean(rec.collapsed) : undefined,
													thinkingContent: isString(rec.thinkingContent)
														? String(rec.thinkingContent)
														: undefined,
													thinkingCollapsed:
														typeof rec.thinkingCollapsed === 'boolean'
															? Boolean(rec.thinkingCollapsed)
															: undefined,
													command: isString(rec.command) ? String(rec.command) : undefined,
													screenshots: Array.isArray(rec.screenshots)
														? (rec.screenshots as unknown[])
																.filter((s) => isString(s))
																.map((s) => String(s))
														: undefined
												}
											})
									: [],
								isResponding:
									typeof rawBlenderSettings?.isResponding === 'boolean'
										? Boolean(rawBlenderSettings!.isResponding)
										: false,
								chatContextUsage:
									isRecord(rawBlenderSettings?.chatContextUsage) &&
									Number.isFinite(
										Number(
											(rawBlenderSettings!.chatContextUsage as Record<string, unknown>).tokenCount
										)
									) &&
									Number.isFinite(
										Number((rawBlenderSettings!.chatContextUsage as Record<string, unknown>).budget)
									) &&
									Number.isFinite(
										Number((rawBlenderSettings!.chatContextUsage as Record<string, unknown>).usage)
									)
										? {
												tokenCount: Number(
													(rawBlenderSettings!.chatContextUsage as Record<string, unknown>)
														.tokenCount
												),
												budget: Number(
													(rawBlenderSettings!.chatContextUsage as Record<string, unknown>).budget
												),
												usage: Number(
													(rawBlenderSettings!.chatContextUsage as Record<string, unknown>).usage
												),
												truncated: Boolean(
													(rawBlenderSettings!.chatContextUsage as Record<string, unknown>)
														.truncated
												)
											}
										: undefined,
								agentBackend: isString(rawBlenderSettings?.agentBackend)
									? String(rawBlenderSettings!.agentBackend)
									: undefined,
								agentSessionId: isString(rawBlenderSettings?.agentSessionId)
									? String(rawBlenderSettings!.agentSessionId)
									: undefined,
								model: isString(rawBlenderSettings?.model)
									? String(rawBlenderSettings!.model)
									: undefined,
								modelId: isString(rawBlenderSettings?.modelId)
									? String(rawBlenderSettings!.modelId)
									: undefined,
								geminiTextModelVersion: isString(rawBlenderSettings?.geminiTextModelVersion)
									? String(rawBlenderSettings!.geminiTextModelVersion)
									: undefined,
								textModelVersion: isString(rawBlenderSettings?.textModelVersion)
									? String(rawBlenderSettings!.textModelVersion)
									: undefined,
								thinkingEffort: isString(rawBlenderSettings?.thinkingEffort)
									? String(rawBlenderSettings!.thinkingEffort)
									: undefined,
								lastOutputs: isRecord(rawBlenderSettings?.lastOutputs)
									? {
											text: isString(
												(rawBlenderSettings!.lastOutputs as Record<string, unknown>).text
											)
												? String((rawBlenderSettings!.lastOutputs as Record<string, unknown>).text)
												: undefined,
											imageUrl: isString(
												(rawBlenderSettings!.lastOutputs as Record<string, unknown>).imageUrl
											)
												? String(
														(rawBlenderSettings!.lastOutputs as Record<string, unknown>).imageUrl
													)
												: undefined,
											modelPath: isString(
												(rawBlenderSettings!.lastOutputs as Record<string, unknown>).modelPath
											)
												? String(
														(rawBlenderSettings!.lastOutputs as Record<string, unknown>).modelPath
													)
												: undefined,
											updatedAt: Number.isFinite(
												Number(
													(rawBlenderSettings!.lastOutputs as Record<string, unknown>).updatedAt
												)
											)
												? Number(
														(rawBlenderSettings!.lastOutputs as Record<string, unknown>).updatedAt
													)
												: undefined
										}
									: undefined,
								workspacePath: isString(rawBlenderSettings?.workspacePath)
									? String(rawBlenderSettings!.workspacePath)
									: undefined,
								workspaceRelativePath: isString(rawBlenderSettings?.workspaceRelativePath)
									? String(rawBlenderSettings!.workspaceRelativePath)
									: undefined
							}
						: undefined
				// 数据迁移：从model3dSettings根下的tripo3d*字段和根级别tripo3dSettings合并数据
				if (type === 'model3d') {
					const rawModel3d = isRecord(n.model3dSettings) ? n.model3dSettings : {}
					const legacyTripoInModel3d = normalizeTripo3DModelSettings(rawModel3d)
					const mergedTripo: Record<string, unknown> = {
						...(legacyTripoInModel3d || {}),
						...(rootTripo3dSettings || {}),
						...((model3dSettings as Record<string, unknown>)?.tripo3dModelSettings || {})
					}
					if (Object.keys(mergedTripo).length > 0) {
						model3dSettings = {
							...(model3dSettings || {}),
							tripo3dModelSettings:
								mergedTripo as WorkflowModel3DNodeSettings['tripo3dModelSettings'],
							modelGenerationSource:
								(model3dSettings as Record<string, unknown>)?.modelGenerationSource ||
								(mergedTripo.tripo3dTaskId ? 'tripo3d' : undefined)
						} as WorkflowModel3DNodeSettings
					}
				}
				const tripo3dSettings =
					type === 'model3d'
						? (model3dSettings as Record<string, unknown>)?.tripo3dModelSettings
						: rootTripo3dSettings
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
					tripo3dSettings: tripo3dSettings as WorkflowNode['tripo3dSettings'],
					blenderSettings,
					storySettings: normalizeStorySettings(n.storySettings),
					worldX: Number.isFinite(Number(n.worldX)) ? Number(n.worldX) : 0,
					worldY: Number.isFinite(Number(n.worldY)) ? Number(n.worldY) : 0,
					width: Number.isFinite(Number(n.width))
						? Math.max(40, Math.min(2000, Number(n.width)))
						: 240,
					height: Number.isFinite(Number(n.height))
						? Math.max(40, Math.min(2000, Number(n.height)))
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
					comfyuiSettings: normalizeComfyUISettings(n.comfyuiSettings),
					nodeChatDraft: isString(n.nodeChatDraft) ? String(n.nodeChatDraft) : undefined,
					nodeChatParams: isRecord(n.nodeChatParams) ? n.nodeChatParams : undefined,
					nodeChatSelectedRefs: normalizeChatSelectedRefs((n as any).nodeChatSelectedRefs),
					nodeChatVisible: typeof n.nodeChatVisible === 'boolean' ? n.nodeChatVisible : false,
					prompt: isString(n.prompt) ? String(n.prompt) : undefined
				}
				const prevNode = state.nodesById[nodeId]
				const incoming = nextNodesById[nodeId] as any
				const prevDraft = (prevNode as any)?.nodeChatDraft
				const incomingDraft = incoming.nodeChatDraft
				const prevDraftStr = typeof prevDraft === 'string' ? prevDraft : ''
				const incomingDraftStr = typeof incomingDraft === 'string' ? incomingDraft : ''
				const needPreserveDraft = prevDraftStr.length > incomingDraftStr.length
				if (needPreserveDraft) {
					incoming.nodeChatDraft = prevDraftStr
					console.log(
						'[DraftFlow#store hydrateDraft] DEFEND(nodeChatDraft): Vuex longer, preserving Vuex',
						{
							nodeId,
							nodeType: type,
							prevLen: prevDraftStr.length,
							incomingLen: incomingDraftStr.length,
							preservedDraftPreview:
								prevDraftStr.length > 40
									? prevDraftStr.slice(0, 40) + '...'
									: prevDraftStr || '(empty)',
							incomingDraftPreview:
								incomingDraftStr.length > 40
									? incomingDraftStr.slice(0, 40) + '...'
									: incomingDraftStr || '(empty)',
							defendReason: !incomingDraftStr.length
								? 'incoming_empty'
								: 'vuex_longer_than_incoming'
						}
					)
				}
				const prevParams = (prevNode as any)?.nodeChatParams
				const incomingParams = incoming.nodeChatParams
				const prevParamsKeys =
					prevParams && typeof prevParams === 'object'
						? Object.keys(prevParams as Record<string, unknown>)
						: []
				const incomingParamsKeys =
					incomingParams && typeof incomingParams === 'object'
						? Object.keys(incomingParams as Record<string, unknown>)
						: []
				const prevParamsNestedDepth = JSON.stringify(prevParams ?? {}).length
				const incomingParamsNestedDepth = JSON.stringify(incomingParams ?? {}).length
				const needPreserveParams =
					!incomingParamsKeys.length && prevParamsKeys.length
						? true
						: prevParamsNestedDepth > incomingParamsNestedDepth + 10
				if (needPreserveParams) {
					incoming.nodeChatParams = JSON.parse(JSON.stringify(prevParams ?? {}))
					console.log(
						'[DraftFlow#store hydrateDraft] DEFEND(nodeChatParams): Vuex has more/deeper, preserving Vuex',
						{
							nodeId,
							nodeType: type,
							prevKeysLen: prevParamsKeys.length,
							incomingKeysLen: incomingParamsKeys.length,
							prevJsonLen: prevParamsNestedDepth,
							incomingJsonLen: incomingParamsNestedDepth,
							preservedKeys: prevParamsKeys.slice(0, 20)
						}
					)
				}
				const prevRefs = (prevNode as any)?.nodeChatSelectedRefs
				const incomingRefs = incoming.nodeChatSelectedRefs
				const prevRefsLen = Array.isArray(prevRefs) ? prevRefs.length : 0
				const incomingRefsLen = Array.isArray(incomingRefs) ? incomingRefs.length : 0
				const needPreserveRefs = prevRefsLen > incomingRefsLen
				if (needPreserveRefs) {
					incoming.nodeChatSelectedRefs = JSON.parse(JSON.stringify(prevRefs ?? []))
					console.log(
						'[DraftFlow#store hydrateDraft] DEFEND(nodeChatSelectedRefs): Vuex longer, preserving Vuex',
						{
							nodeId,
							nodeType: type,
							prevLen: prevRefsLen,
							incomingLen: incomingRefsLen
						}
					)
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
				if (nextNodesById[nodeId].type === 'blender') syncBlenderAnchors(nextNodesById[nodeId])
				if (nextNodesById[nodeId].type === 'text') syncTextAnchors(nextNodesById[nodeId])
			}

			// 保留当前state中存在但snapshot中不存在的节点（新创建但尚未同步到引擎的节点）
			// 但只保留近期创建的节点（3秒内），避免阻止用户主动删除节点的同步
			// 时间窗口判断：批量导入媒体时，新节点会在极短时间内创建并需要保留；
			// 而用户删除节点时，被删除的节点不可能是3秒内刚创建的（除非刚创建就删除，这种情况可接受）
			// 重要：如果snapshot本身是空对象（清空画布操作），则不保留任何节点
			const snapshotHasNodes = Object.keys(rawNodesById).length > 0
			const preservedNodeIds: string[] = []
			const now = Date.now()
			const NEW_NODE_PRESERVE_WINDOW_MS = 3000
			if (snapshotHasNodes) {
				for (const [existingId, existingNode] of Object.entries(state.nodesById)) {
					if (!nextNodesById[existingId] && existingNode) {
						const createdAt = Number((existingNode as any).createdAt ?? 0)
						const isRecentNew = createdAt > 0 && now - createdAt < NEW_NODE_PRESERVE_WINDOW_MS
						if (isRecentNew) {
							nextNodesById[existingId] = existingNode
							preservedNodeIds.push(existingId)
							console.log(
								'[DraftFlow#store hydrateDraft] PRESERVE(node): keeping recently created node not in snapshot',
								{
									nodeId: existingId,
									nodeType: existingNode.type,
									createdAt,
									ageMs: now - createdAt
								}
							)
						} else {
							console.log(
								'[DraftFlow#store hydrateDraft] REMOVE(node): node not in snapshot and not recent, will be deleted (sync from engine)',
								{
									nodeId: existingId,
									nodeType: existingNode.type,
									createdAt,
									ageMs: createdAt > 0 ? now - createdAt : 'unknown'
								}
							)
						}
					}
				}
			} else {
				console.log(
					'[DraftFlow#store hydrateDraft] CLEAR(nodes): snapshot is empty, clearing all nodes (full reset/empty canvas)'
				)
			}

			const rawNodeOrder = isArray(s.nodeOrder) ? s.nodeOrder : []
			const tempStateForOrder: WorkflowState = { ...state, nodesById: nextNodesById }
			let nextNodeOrder = normalizeNodeIds(
				tempStateForOrder,
				rawNodeOrder.map((x: unknown) => String(x ?? ''))
			)
			// if order missing, fall back to object keys
			let nodeOrder = nextNodeOrder.length ? nextNodeOrder : Object.keys(nextNodesById)
			// 将保留的新节点添加到nodeOrder末尾
			for (const nid of preservedNodeIds) {
				if (!nodeOrder.includes(nid)) {
					nodeOrder = [...nodeOrder, nid]
				}
			}

			state.nodesById = nextNodesById
			state.nodeOrder = nodeOrder

			// ULTIMATE FALLBACK: After replacing entire nodesById, re-apply floating nodeChatDialog
			// values (never cleared by closeNodeChatDialog) back to nodesById — guarantees that
			// the most recent user input cannot be lost even if engine/hydrate has bugs.
			const {
				nodeId: dialogNodeId,
				draft: dialogDraft,
				params: dialogParams,
				selectedRefs: dialogRefs
			} = state.nodeChatDialog
			if (dialogNodeId && state.nodesById[dialogNodeId]) {
				const targetNode = state.nodesById[dialogNodeId] as any
				const curDraft =
					typeof targetNode.nodeChatDraft === 'string' ? targetNode.nodeChatDraft : ''
				const dialogDraftStr = typeof dialogDraft === 'string' ? dialogDraft : ''
				if (dialogDraftStr.length > curDraft.length) {
					targetNode.nodeChatDraft = dialogDraftStr
					console.log(
						'[DraftFlow#store hydrateDraft] ULTIMATE_FALLBACK(nodeChatDraft): re-applied from floating dialog',
						{
							nodeId: dialogNodeId,
							fromNodesByIdLen: curDraft.length,
							fromDialogLen: dialogDraftStr.length,
							appliedPreview:
								dialogDraftStr.length > 40
									? dialogDraftStr.slice(0, 40) + '...'
									: dialogDraftStr || '(empty)'
						}
					)
				}
				const curParamsKeys =
					targetNode.nodeChatParams && typeof targetNode.nodeChatParams === 'object'
						? Object.keys(targetNode.nodeChatParams as Record<string, unknown>)
						: []
				const dialogParamsKeys =
					dialogParams && typeof dialogParams === 'object'
						? Object.keys(dialogParams as Record<string, unknown>)
						: []
				if (dialogParamsKeys.length > 0 && curParamsKeys.length === 0) {
					targetNode.nodeChatParams = JSON.parse(JSON.stringify(dialogParams ?? {}))
					console.log(
						'[DraftFlow#store hydrateDraft] ULTIMATE_FALLBACK(nodeChatParams): re-applied from floating dialog',
						{
							nodeId: dialogNodeId,
							appliedKeys: dialogParamsKeys.slice(0, 20)
						}
					)
				}
				const curRefsLen = Array.isArray(targetNode.nodeChatSelectedRefs)
					? targetNode.nodeChatSelectedRefs.length
					: 0
				const dialogRefsLen = Array.isArray(dialogRefs) ? dialogRefs.length : 0
				if (dialogRefsLen > curRefsLen) {
					targetNode.nodeChatSelectedRefs = JSON.parse(JSON.stringify(dialogRefs ?? []))
					console.log(
						'[DraftFlow#store hydrateDraft] ULTIMATE_FALLBACK(nodeChatSelectedRefs): re-applied from floating dialog',
						{
							nodeId: dialogNodeId,
							fromNodesByIdLen: curRefsLen,
							fromDialogLen: dialogRefsLen
						}
					)
				}
			}

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
			// 保留当前state中存在但snapshot中不存在的资源（新添加但尚未同步到引擎的资源）
			// 但只保留近期添加的资源（5秒内，窗口比节点稍长因为资源绑定可能有延迟）
			// 使用createdAt时间戳（addResource时设置）判断，避免阻止删除同步
			// 重要：如果snapshot本身没有资源（清空画布操作），则不保留任何资源
			const snapshotHasResources = Object.keys(rawResourcesById).length > 0
			const preservedResourceIds: string[] = []
			const NEW_RESOURCE_PRESERVE_WINDOW_MS = 5000
			if (snapshotHasResources) {
				for (const [existingRid, existingRes] of Object.entries(state.resourcesById)) {
					if (!nextResourcesById[existingRid] && existingRes) {
						const createdAt = Number((existingRes as any).createdAt ?? 0)
						const isRecentNew = createdAt > 0 && now - createdAt < NEW_RESOURCE_PRESERVE_WINDOW_MS
						if (isRecentNew) {
							nextResourcesById[existingRid] = existingRes
							preservedResourceIds.push(existingRid)
							console.log(
								'[DraftFlow#store hydrateDraft] PRESERVE(resource): keeping recently added resource not in snapshot',
								{
									resourceId: existingRid,
									resourceKind: existingRes.kind,
									hasUrl: !!existingRes.url,
									ageMs: now - createdAt
								}
							)
						} else {
							console.log(
								'[DraftFlow#store hydrateDraft] REMOVE(resource): resource not in snapshot and not recent, will be deleted (sync from engine)',
								{
									resourceId: existingRid,
									resourceKind: existingRes.kind,
									hasUrl: !!existingRes.url,
									ageMs: createdAt > 0 ? now - createdAt : 'unknown'
								}
							)
						}
					} else if (nextResourcesById[existingRid] && existingRes) {
						// 合并策略：如果现有资源有url而snapshot中没有，保留现有url
						const existingResAny = existingRes as any
						const snapshotResAny = nextResourcesById[existingRid] as any
						if (existingResAny.url && !snapshotResAny.url) {
							snapshotResAny.url = existingResAny.url
							console.log(
								'[DraftFlow#store hydrateDraft] MERGE(resource): preserving existing URL',
								{
									resourceId: existingRid,
									url: String(existingResAny.url || '').slice(0, 80)
								}
							)
						}
					}
				}
			} else {
				console.log(
					'[DraftFlow#store hydrateDraft] CLEAR(resources): snapshot has no resources, clearing all resources (full reset)'
				)
			}
			// 将保留的新资源添加到resourceOrder末尾
			for (const rid of preservedResourceIds) {
				if (!nextResourceOrder.includes(rid)) {
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
			// 确保资源有createdAt时间戳，用于hydrateDraft判断是否为新资源
			const createdAt = Number((payload as any).createdAt)
			const resourceWithTs = {
				...payload,
				createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now()
			}
			state.resourcesById[id] = resourceWithTs as any
			if (!state.resourceOrder.includes(id)) state.resourceOrder = [...state.resourceOrder, id]
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
		mergeTemplateContent(
			state,
			payload: {
				nodes: WorkflowNode[]
				edges: WorkflowEdge[]
				resources: WorkflowResource[]
			}
		) {
			const newNodeIds: string[] = []
			const newResourceIds: string[] = []
			const newEdgeIds: string[] = []
			for (const res of payload.resources) {
				if (!res || !res.id) continue
				state.resourcesById[res.id] = res
				if (!state.resourceOrder.includes(res.id)) newResourceIds.push(res.id)
			}
			for (const node of payload.nodes) {
				if (!node || !node.id) continue
				state.nodesById[node.id] = node
				newNodeIds.push(node.id)
			}
			for (const edge of payload.edges) {
				if (!edge || !edge.id) continue
				if (!state.nodesById[edge.fromNodeId] || !state.nodesById[edge.toNodeId]) continue
				state.edgesById[edge.id] = edge
				newEdgeIds.push(edge.id)
			}
			if (newResourceIds.length > 0) {
				state.resourceOrder = [...state.resourceOrder, ...newResourceIds]
			}
			if (newNodeIds.length > 0) {
				state.nodeOrder = [...state.nodeOrder, ...newNodeIds]
			}
			if (newEdgeIds.length > 0) {
				state.edgeOrder = [...state.edgeOrder, ...newEdgeIds]
			}
			state.selectedNodeIds = newNodeIds
			state.selectedNodeId = newNodeIds[0] ?? null
			state.selectedEdgeId = null
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
					| 'blender'
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
				payload.type !== 'meshy' &&
				payload.type !== 'blender'
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
			if (payload.type !== 'blender') n.blenderSettings = undefined
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
				payload.type === 'meshy' ||
				payload.type === 'blender'
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
				payload.type !== 'meshy' &&
				payload.type !== 'blender' &&
				payload.type !== 'text'
			) {
				n.inputs = [{ id: 'in-0', label: '入口' }]
				n.outputs = [{ id: 'out-0', label: '出口' }]
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
					mock: false,
					sceneType: 'auto'
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
				n.inputs = [
					{
						id: 'in-0',
						label: '多模态输入',
						mediaType: 'generic',
						acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
						multiInput: true
					}
				]
				n.outputs = [{ id: 'out-image', label: '图片输出', mediaType: 'image' }]
			}
			if (payload.type === 'text') {
				n.textValue = typeof n.textValue === 'string' ? n.textValue : ''
				syncTextAnchors(n)
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
				const baseInputs: WorkflowAnchorSpec[] = [...comfyInputAnchors()]
				n.inputs = baseInputs
				n.outputs = comfyDefaultOutputAnchors()
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
			if (payload.type === 'blender') {
				n.blenderSettings = n.blenderSettings ?? {
					mcpStatus: 'unchecked',
					mcpError: null,
					importStatus: 'idle',
					importProgress: 0,
					importError: null,
					chatMessages: []
				}
			}
			if (!String(n.alias ?? '').trim() || String(n.alias) === prevDefaultAlias) {
				n.alias = defaultAliasForType(payload.type)
			}
			enforceSingleIOAnchors(n)
			if (payload.type === 'blender') syncBlenderAnchors(n)
			if (payload.type === 'text') syncTextAnchors(n)
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
					payload.type === 'meshy' ||
					payload.type === 'blender'
				) {
					n.width = 450
					n.height =
						payload.type === 'model3d'
							? 420
							: payload.type === 'meshy'
								? 470
								: payload.type === 'blender'
									? 440
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
				outputs: WorkflowAnchorSpec[]
				warnings?: string[]
				inputRequirements?: import('../../aiworkflow/domain/comfyui/parseWorkflowIO').ComfyInputRequirements
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'comfyui') return
			const outputsRaw = Array.isArray(payload?.outputs) ? payload.outputs : []
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
			n.inputs = [...comfyInputAnchors()]
			n.outputs = outputs.length ? outputs : comfyDefaultOutputAnchors()
			n.comfyuiSettings = {
				...(n.comfyuiSettings ?? {}),
				inputRequirements: payload?.inputRequirements,
				workflowWarnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
				previewStale: true
			}
		},
		setNodeComfyUIPreviewReady(state: WorkflowState, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'comfyui') return
			n.comfyuiSettings = {
				...(n.comfyuiSettings ?? {}),
				previewStale: false
			}
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
				next.imageGenerationSource === 'meshy' ||
				next.imageGenerationSource === 'gemini' ||
				next.imageGenerationSource === 'tripo3d'
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
				next.modelGenerationSource === 'meshy' ||
				next.modelGenerationSource === 'tripo3d'
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

			const patch: Partial<
				WorkflowModel3DNodeSettings & {
					meshyModelSettings?: unknown
					tripo3dModelSettings?: unknown
				}
			> = {
				...next
			}
			if (patch.lightIntensity != null)
				patch.lightIntensity = Math.max(0, Math.min(10, Number(patch.lightIntensity) || 0))
			if (patch.renderWidth != null)
				patch.renderWidth = Math.max(1, Math.floor(Number(patch.renderWidth) || 1))
			if (patch.renderHeight != null)
				patch.renderHeight = Math.max(1, Math.floor(Number(patch.renderHeight) || 1))
			delete patch.meshyModelSettings
			delete patch.tripo3dModelSettings

			const existingMeshy = n.model3dSettings?.meshyModelSettings ?? {}
			const mergedMeshy = meshyModelSettings
				? Object.fromEntries(
						Object.entries({ ...existingMeshy, ...meshyModelSettings }).filter(
							([, v]) => v !== undefined
						)
					)
				: undefined

			const tripo3dModelSettingsRaw = next.tripo3dModelSettings
			const existingTripo3d = n.model3dSettings?.tripo3dModelSettings ?? {}
			const mergedTripo3d =
				tripo3dModelSettingsRaw && typeof tripo3dModelSettingsRaw === 'object'
					? Object.fromEntries(
							Object.entries({ ...existingTripo3d, ...tripo3dModelSettingsRaw }).filter(
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
				...(mergedTripo3d
					? {
							tripo3dModelSettings:
								mergedTripo3d as WorkflowModel3DNodeSettings['tripo3dModelSettings']
						}
					: {}),
				...patch
			}
		},
		setNodeTripo3DSettings(
			state,
			payload: { nodeId: string; tripo3dSettings: Partial<Record<string, unknown>> }
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (n.type === 'model3d' || n.type === 'image') return
			const next = payload?.tripo3dSettings
			if (!next || typeof next !== 'object') return
			const existing = isRecord((n as unknown as Record<string, unknown>).tripo3dSettings)
				? ((n as unknown as Record<string, unknown>).tripo3dSettings as Record<string, unknown>)
				: {}
			const merged = Object.fromEntries(
				Object.entries({ ...existing, ...next }).filter(([, v]) => v !== undefined)
			)
			;(n as unknown as Record<string, unknown>).tripo3dSettings = merged
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
					currentTime?: number
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
			const curTime =
				next.currentTime != null && Number.isFinite(Number(next.currentTime))
					? Math.max(0, Number(next.currentTime))
					: undefined
			n.videoSettings = {
				...(n.videoSettings ?? {}),
				...(outW != null ? { outputWidth: outW } : {}),
				...(outH != null ? { outputHeight: outH } : {}),
				...(natW != null ? { naturalWidth: natW } : {}),
				...(natH != null ? { naturalHeight: natH } : {}),
				...(curTime != null ? { currentTime: curTime } : {})
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
				if (Number.isFinite(w)) n.width = Math.max(80, Math.min(2000, w))
			}
			if (payload.height != null) {
				const h = Number(payload.height)
				if (Number.isFinite(h)) n.height = Math.max(80, h)
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
					newIds.push(id)
				}
				state.nodeOrder = [...state.nodeOrder, ...newIds]
				state.selectedNodeIds = newIds
				state.selectedNodeId = newIds[0] ?? null
				state.selectedEdgeId = null
				state.clipboardNodes = null
				state.clipboardPrimaryNodeId = null
				state.clipboardNode = null
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
			state.nodeOrder = [...state.nodeOrder, id]
			state.selectedNodeId = id
			state.selectedNodeIds = [id]
			state.selectedEdgeId = null
			state.clipboardNode = null
			state.clipboardNodes = null
			state.clipboardPrimaryNodeId = null
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
					params: dialog.params && typeof dialog.params === 'object' ? dialog.params : {},
					selectedRefs: Array.isArray(dialog.selectedRefs) ? dialog.selectedRefs : []
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
			if (!state.nodeOrder.includes(id)) state.nodeOrder = [...state.nodeOrder, id]
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
			state.nodeOrder = [...state.nodeOrder, id]
			state.selectedNodeId = id
			state.selectedNodeIds = [id]
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
			const supportsMultiInput =
				inputAnchor?.multiInput === true ||
				(toNode.type === 'blender' && toAnchorId === 'in-0') ||
				(toNode.type === 'comfyui' && toAnchorId === 'in')
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
			state.edgeOrder = [...state.edgeOrder, id]
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
		openNodeChatDialog(
			state,
			payload: {
				nodeId: string
				nodeType: WorkflowNodeChatType
				engineNodeChatDraft?: string
				engineNodeChatParams?: Record<string, unknown>
				engineNodeChatSelectedRefs?: WorkflowNodeChatSelectedRef[]
			}
		) {
			const prevDialogNodeId = state.nodeChatDialog.nodeId
			const prevDialogDraft = state.nodeChatDialog.draft ?? ''
			const prevDialogParams = state.nodeChatDialog.params ?? ({} as Record<string, unknown>)
			const prevDialogRefs = state.nodeChatDialog.selectedRefs ?? []
			const isReopeningSameNode = prevDialogNodeId === payload.nodeId && prevDialogDraft.length > 0
			if (isReopeningSameNode) {
				const targetNode = state.nodesById[payload.nodeId]
				if (targetNode) {
					const currentNodesByIdDraft = (targetNode as any).nodeChatDraft ?? ''
					const recovered =
						prevDialogDraft.length >= currentNodesByIdDraft.length
							? prevDialogDraft
							: currentNodesByIdDraft
					;(targetNode as any).nodeChatDraft = recovered
					const currentParams = (targetNode as any).nodeChatParams
					const hasCurrentParams =
						currentParams &&
						typeof currentParams === 'object' &&
						Object.keys(currentParams).length > 0
					const hasPrevParams = Object.keys(prevDialogParams).length > 0
					if (!hasCurrentParams && hasPrevParams) {
						;(targetNode as any).nodeChatParams = JSON.parse(JSON.stringify(prevDialogParams))
					}
					const currentRefs = (targetNode as any).nodeChatSelectedRefs
					const hasCurrentRefs = Array.isArray(currentRefs) && currentRefs.length > 0
					const hasPrevRefs = prevDialogRefs.length > 0
					if (!hasCurrentRefs && hasPrevRefs) {
						;(targetNode as any).nodeChatSelectedRefs = JSON.parse(JSON.stringify(prevDialogRefs))
					}
				}
			}

			state.nodeChatDialog.visible = true
			state.nodeChatDialog.nodeId = payload.nodeId
			state.nodeChatDialog.nodeType = payload.nodeType
			const node = state.nodesById[payload.nodeId]

			let draft: string
			const vuexDraft = node?.nodeChatDraft ?? ''
			const engineDraft = payload.engineNodeChatDraft ?? ''
			let recoveredFromPrevDialog = ''
			if (
				isReopeningSameNode &&
				prevDialogDraft.length > vuexDraft.length &&
				prevDialogDraft.length > engineDraft.length
			) {
				recoveredFromPrevDialog = prevDialogDraft
			}
			const candidateFromFour = [vuexDraft, engineDraft, recoveredFromPrevDialog] as const
			draft = candidateFromFour.reduce((best, cur) => (cur.length >= best.length ? cur : best), '')

			const fallbackFromTextValue: string | null = (() => {
				if (draft) return null
				if (payload.nodeType !== 'text') return node?.textValue ?? ''
				return null
			})()
			if (fallbackFromTextValue !== null) draft = fallbackFromTextValue
			const fallbackFromPrompt: string | null = (() => {
				if (draft) return null
				const nodePrompt = (node as Record<string, unknown>).prompt
				return typeof nodePrompt === 'string' ? nodePrompt : null
			})()
			if (fallbackFromPrompt !== null) draft = fallbackFromPrompt
			state.nodeChatDialog.draft = draft

			console.log('[DraftFlow#store openNodeChatDialog] MUTATION', {
				nodeId: payload.nodeId,
				nodeType: payload.nodeType,
				isReopeningSameNode,
				vuexDraftLen: vuexDraft.length,
				engineDraftLen: engineDraft.length,
				floatingDialogDraftLen: prevDialogDraft.length,
				recoveredFromPrevDialogLen: recoveredFromPrevDialog.length,
				vuexDraftPreview:
					vuexDraft.length > 40 ? vuexDraft.slice(0, 40) + '...' : vuexDraft || '(empty)',
				engineDraftPreview:
					engineDraft.length > 40 ? engineDraft.slice(0, 40) + '...' : engineDraft || '(empty)',
				floatingDialogDraftPreview:
					prevDialogDraft.length > 40
						? prevDialogDraft.slice(0, 40) + '...'
						: prevDialogDraft || '(empty)',
				finalDraftLen: draft.length,
				finalDraftPreview: draft.length > 40 ? draft.slice(0, 40) + '...' : draft || '(empty)',
				fallbackFromTextValue:
					fallbackFromTextValue !== null ? String(fallbackFromTextValue.length) : null,
				fallbackFromPromptUsed: fallbackFromPrompt !== null,
				vuexNodeChatParamsKeys: node?.nodeChatParams
					? Object.keys(node.nodeChatParams as Record<string, unknown>)
					: null,
				engineNodeChatParamsKeys: payload.engineNodeChatParams
					? Object.keys(payload.engineNodeChatParams)
					: null,
				vuexSelectedRefsLen: Array.isArray(node?.nodeChatSelectedRefs)
					? node.nodeChatSelectedRefs.length
					: -1,
				engineSelectedRefsLen: Array.isArray(payload.engineNodeChatSelectedRefs)
					? payload.engineNodeChatSelectedRefs.length
					: -1
			})

			const vuexRefs = node?.nodeChatSelectedRefs ?? []
			const engineRefs = payload.engineNodeChatSelectedRefs ?? []
			const resolvedSelectedRefs =
				(Array.isArray(vuexRefs) ? vuexRefs.length : 0) >=
				(Array.isArray(engineRefs) ? engineRefs.length : 0)
					? vuexRefs
						? JSON.parse(JSON.stringify(vuexRefs))
						: []
					: engineRefs
						? JSON.parse(JSON.stringify(engineRefs))
						: []
			state.nodeChatDialog.selectedRefs = normalizeChatSelectedRefs(resolvedSelectedRefs) ?? []
			console.log('[DraftFlow#store openNodeChatDialog] selectedRefs RESOLVED', {
				nodeId: payload.nodeId,
				vuexRefsLen: Array.isArray(vuexRefs) ? vuexRefs.length : -1,
				engineRefsLen: Array.isArray(engineRefs) ? engineRefs.length : -1,
				resolvedRefsLen: state.nodeChatDialog.selectedRefs.length,
				firstResolvedRef:
					state.nodeChatDialog.selectedRefs.length > 0
						? {
								kind: state.nodeChatDialog.selectedRefs[0].kind,
								fromNodeId: state.nodeChatDialog.selectedRefs[0].fromNodeId,
								label: String(state.nodeChatDialog.selectedRefs[0].label ?? '').slice(0, 30)
							}
						: null
			})

			if (payload.nodeType === 'blender') {
				state.nodeChatDialog.submitting = Boolean(node?.blenderSettings?.isSubmitting)
			} else {
				state.nodeChatDialog.submitting = false
			}

			const vuexParams: Record<string, unknown> =
				(node?.nodeChatParams as Record<string, unknown>) ?? {}
			const engineParams = payload.engineNodeChatParams ?? {}
			const existingChatParams: Record<string, unknown> = { ...engineParams, ...vuexParams }
			const typeKey = payload.nodeType
			const existingTypeParams: Record<string, unknown> =
				typeof existingChatParams[typeKey] === 'object' && existingChatParams[typeKey] !== null
					? (existingChatParams[typeKey] as Record<string, unknown>)
					: {}

			const syncedMeshyParams: Record<string, unknown> = {}
			if (typeKey === 'image' && node) {
				const imgSettings = (node as Record<string, unknown>).imageSettings as
					| Record<string, unknown>
					| undefined
				const meshyImgSettings =
					typeof imgSettings === 'object' && imgSettings !== null
						? (imgSettings.meshyImageSettings as Record<string, unknown> | undefined)
						: undefined
				if (meshyImgSettings && typeof meshyImgSettings === 'object') {
					const submittedParams =
						typeof meshyImgSettings.submittedParams === 'object' &&
						meshyImgSettings.submittedParams !== null
							? (meshyImgSettings.submittedParams as Record<string, unknown>)
							: undefined

					if (submittedParams) {
						if (typeof submittedParams.model === 'string' && submittedParams.model) {
							syncedMeshyParams.model = 'meshy'
							syncedMeshyParams.meshyImageAiModel = submittedParams.model
						}
						if (typeof submittedParams.aspectRatio === 'string') {
							const ar = submittedParams.aspectRatio.replace(/\s*\(多视图\)\s*/g, '').trim()
							if (ar) syncedMeshyParams.meshyAspectRatio = ar
						}
						if (typeof submittedParams.generateMultiView === 'boolean') {
							syncedMeshyParams.meshyGenerateMultiView = submittedParams.generateMultiView
						}
						if (
							typeof submittedParams.poseMode === 'string' &&
							submittedParams.poseMode &&
							submittedParams.poseMode !== '无'
						) {
							syncedMeshyParams.meshyPoseMode = submittedParams.poseMode
						}
						if (
							typeof submittedParams.negativePrompt === 'string' &&
							submittedParams.negativePrompt &&
							submittedParams.negativePrompt !== '无'
						) {
							syncedMeshyParams.meshyNegativePrompt = submittedParams.negativePrompt
						}
						if (typeof submittedParams.seed === 'number' && submittedParams.seed >= 0) {
							syncedMeshyParams.meshySeed = submittedParams.seed
						}
						if (
							typeof submittedParams.outputCount === 'number' &&
							submittedParams.outputCount > 0
						) {
							syncedMeshyParams.meshyOutputImageCount = Math.min(
								4,
								Math.floor(submittedParams.outputCount)
							)
						}
					}

					if (
						typeof meshyImgSettings.aiModel === 'string' &&
						meshyImgSettings.aiModel &&
						!syncedMeshyParams.meshyImageAiModel
					) {
						syncedMeshyParams.meshyImageAiModel = meshyImgSettings.aiModel
						syncedMeshyParams.model = 'meshy'
					}
					if (
						typeof meshyImgSettings.aspectRatio === 'string' &&
						meshyImgSettings.aspectRatio &&
						!syncedMeshyParams.meshyAspectRatio
					) {
						syncedMeshyParams.meshyAspectRatio = meshyImgSettings.aspectRatio
					}
					if (
						typeof meshyImgSettings.generateMultiView === 'boolean' &&
						syncedMeshyParams.meshyGenerateMultiView === undefined
					) {
						syncedMeshyParams.meshyGenerateMultiView = meshyImgSettings.generateMultiView
					}
					if (
						typeof meshyImgSettings.poseMode === 'string' &&
						meshyImgSettings.poseMode &&
						!syncedMeshyParams.meshyPoseMode
					) {
						syncedMeshyParams.meshyPoseMode = meshyImgSettings.poseMode
					}
					if (
						typeof meshyImgSettings.negativePrompt === 'string' &&
						meshyImgSettings.negativePrompt &&
						!syncedMeshyParams.meshyNegativePrompt
					) {
						syncedMeshyParams.meshyNegativePrompt = meshyImgSettings.negativePrompt
					}
					if (
						typeof meshyImgSettings.seed === 'number' &&
						meshyImgSettings.seed >= 0 &&
						syncedMeshyParams.meshySeed === undefined
					) {
						syncedMeshyParams.meshySeed = meshyImgSettings.seed
					}
					if (
						typeof meshyImgSettings.outputImageCount === 'number' &&
						meshyImgSettings.outputImageCount > 0 &&
						syncedMeshyParams.meshyOutputImageCount === undefined
					) {
						syncedMeshyParams.meshyOutputImageCount = Math.min(
							4,
							Math.floor(meshyImgSettings.outputImageCount)
						)
					}
				}
			}

			const syncedBlenderParams: Record<string, unknown> = {}
			if (typeKey === 'blender' && node) {
				const blenderSettings = (node as Record<string, unknown>).blenderSettings as
					| Record<string, unknown>
					| undefined
				if (blenderSettings && typeof blenderSettings === 'object') {
					const blenderFields = [
						'agentBackend',
						'agentSessionId',
						'model',
						'modelId',
						'geminiTextModelVersion',
						'textModelVersion',
						'thinkingEffort'
					] as const
					for (const field of blenderFields) {
						if (typeof blenderSettings[field] === 'string' && blenderSettings[field]) {
							syncedBlenderParams[field] = blenderSettings[field]
						}
					}
				}
			}

			const mergedTypeParams = {
				...syncedMeshyParams,
				...syncedBlenderParams,
				...existingTypeParams
			}
			state.nodeChatDialog.params = {
				...existingChatParams,
				[typeKey]: mergedTypeParams
			}
		},
		closeNodeChatDialog(state) {
			const prevNodeId = state.nodeChatDialog.nodeId
			const prevDraft = state.nodeChatDialog.draft ?? ''
			const prevParams = state.nodeChatDialog.params ?? {}
			const prevSelectedRefs = state.nodeChatDialog.selectedRefs ?? []
			const prevDraftLen = prevDraft?.length ?? -1
			const prevDraftPreview =
				(prevDraft || '').length > 40
					? (prevDraft as string).slice(0, 40) + '...'
					: prevDraft || '(empty)'
			console.log('[DraftFlow#store closeNodeChatDialog] MUTATION', {
				prevNodeId,
				prevDraftLen,
				prevDraftPreview,
				prevParamsKeys: Object.keys(prevParams),
				prevSelectedRefsLen: Array.isArray(prevSelectedRefs) ? prevSelectedRefs.length : -1,
				nodesByIdNodeChatDraft:
					prevNodeId && state.nodesById[prevNodeId]
						? ((state.nodesById[prevNodeId] as any).nodeChatDraft?.length ?? -1)
						: -1,
				nodesByIdNodeChatParamsKeys:
					prevNodeId && state.nodesById[prevNodeId]
						? Object.keys((state.nodesById[prevNodeId] as any).nodeChatParams ?? {})
						: null,
				nodesByIdNodeChatSelectedRefsLen:
					prevNodeId && state.nodesById[prevNodeId]
						? Array.isArray((state.nodesById[prevNodeId] as any).nodeChatSelectedRefs)
							? (state.nodesById[prevNodeId] as any).nodeChatSelectedRefs.length
							: -1
						: -1,
				willPreserveNodeIdAndDraft: true
			})
			// 关闭对话框前，显式将所有状态（草稿、参数、@引用）持久化到nodesById
			if (prevNodeId && state.nodesById[prevNodeId]) {
				const targetNode = state.nodesById[prevNodeId] as any
				if (typeof prevDraft === 'string') {
					targetNode.nodeChatDraft = prevDraft
					targetNode.prompt = prevDraft
				}
				if (prevParams && typeof prevParams === 'object') {
					targetNode.nodeChatParams = JSON.parse(JSON.stringify(prevParams))
				}
				if (Array.isArray(prevSelectedRefs)) {
					targetNode.nodeChatSelectedRefs = JSON.parse(JSON.stringify(prevSelectedRefs))
					console.log('[DraftFlow#store closeNodeChatDialog] PERSIST selectedRefs to nodesById', {
						nodeId: prevNodeId,
						refsLen: prevSelectedRefs.length
					})
				}
			}
			state.nodeChatDialog.visible = false
			state.nodeChatDialog.submitting = false
		},
		setNodeChatDraft(state, payload: { text: string }) {
			const curDialogNodeId = state.nodeChatDialog.nodeId
			const prevLen = state.nodeChatDialog.draft.length
			state.nodeChatDialog.draft = payload.text
			const newLen = payload.text.length
			const targetNodeId = curDialogNodeId
			const tryWrite = targetNodeId && state.nodesById[targetNodeId]
			if (tryWrite) {
				;(state.nodesById[targetNodeId] as any).nodeChatDraft = payload.text
				;(state.nodesById[targetNodeId] as any).prompt = payload.text
			}
			if (prevLen !== newLen || !tryWrite) {
				console.log('[DraftFlow#store setNodeChatDraft] MUTATION', {
					nodeId: curDialogNodeId,
					targetNodeId,
					writeSuccess: !!tryWrite,
					prevLen,
					newLen,
					prevPreview:
						prevLen > 40
							? state.nodeChatDialog.draft.slice(0, 40) + '...'
							: state.nodeChatDialog.draft || '(empty)',
					newPreview: newLen > 40 ? payload.text.slice(0, 40) + '...' : payload.text || '(empty)'
				})
			}
		},
		setNodeChatParams(state: WorkflowState, payload: { params: Record<string, unknown> }) {
			state.nodeChatDialog.params = payload.params
			const curNodeId = state.nodeChatDialog.nodeId
			const writeToNodesById = curNodeId && state.nodesById[curNodeId]
			if (writeToNodesById) {
				;(state.nodesById[curNodeId] as any).nodeChatParams = payload.params
			}
			console.log('[DraftFlow#store setNodeChatParams] MUTATION', {
				nodeId: curNodeId,
				writeSuccess: !!writeToNodesById,
				paramsKeys: Object.keys(payload.params)
			})
		},
		setNodeChatSelectedRefs(
			state: WorkflowState,
			payload: { refs: WorkflowNodeChatSelectedRef[] }
		) {
			state.nodeChatDialog.selectedRefs = payload.refs
			const curNodeId = state.nodeChatDialog.nodeId
			const writeToNodesById = curNodeId && state.nodesById[curNodeId]
			if (writeToNodesById) {
				;(state.nodesById[curNodeId] as any).nodeChatSelectedRefs =
					payload.refs.length === 0 ? undefined : payload.refs
				console.log('[DraftFlow#store setNodeChatSelectedRefs] WRITE to nodesById', {
					nodeId: curNodeId,
					refsLen: payload.refs.length,
					firstRefPreview:
						payload.refs.length > 0
							? {
									kind: payload.refs[0].kind,
									fromNodeId: payload.refs[0].fromNodeId,
									label: String(payload.refs[0].label ?? '').slice(0, 30)
								}
							: null
				})
			}
			console.log('[DraftFlow#store setNodeChatSelectedRefs] MUTATION', {
				nodeId: curNodeId,
				writeSuccess: !!writeToNodesById,
				refsLen: payload.refs.length
			})
		},
		setNodeChatSubmitting(state, payload: { submitting: boolean }) {
			state.nodeChatDialog.submitting = payload.submitting
			if (state.nodeChatDialog.nodeId) {
				const node = state.nodesById[state.nodeChatDialog.nodeId]
				if (node && node.type === 'blender') {
					node.blenderSettings = node.blenderSettings ?? {}
					node.blenderSettings.isSubmitting = payload.submitting
				}
			}
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
		},
		setBlenderMcpStatus(
			state: WorkflowState,
			payload: {
				nodeId: string
				status:
					| 'unchecked'
					| 'checking'
					| 'no-blender'
					| 'no-addon'
					| 'blender-not-running'
					| 'addon-not-started'
					| 'disconnected'
					| 'connecting'
					| 'connected'
					| 'error'
				error?: string | null
				serverId?: string | null
				blenderPath?: string | null
				blenderVersion?: string | null
				hasBlender?: boolean
				hasAddon?: boolean
				blenderRunning?: boolean
				addonListening?: boolean
				host?: string | null
				port?: number | null
				toolsReady?: boolean
				toolCount?: number
				missingToolCount?: number
				missingTools?: string[]
			}
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const prev = node.blenderSettings ?? {}
			const next: Record<string, any> = { ...prev }
			if (payload.status !== undefined) {
				next.mcpStatus = payload.status
			}
			if (payload.error !== undefined) {
				next.mcpError = payload.error ?? null
			}
			if (payload.serverId !== undefined) {
				next.mcpServerId = payload.serverId ?? undefined
			}
			if (payload.host !== undefined) {
				next.mcpHost = payload.host ?? undefined
			}
			if (payload.port !== undefined) {
				next.mcpPort = payload.port ?? undefined
			}
			if (payload.blenderPath !== undefined) {
				next.blenderPath = payload.blenderPath
			}
			if (payload.blenderVersion !== undefined) {
				next.blenderVersion = payload.blenderVersion
			}
			if (payload.hasBlender !== undefined) {
				next.hasBlender = payload.hasBlender
			}
			if (payload.hasAddon !== undefined) {
				next.hasAddon = payload.hasAddon
			}
			if (payload.blenderRunning !== undefined) {
				next.blenderRunning = payload.blenderRunning
			}
			if (payload.addonListening !== undefined) {
				next.addonListening = payload.addonListening
			}
			if (payload.toolsReady !== undefined) {
				next.toolsReady = payload.toolsReady
			}
			if (payload.toolCount !== undefined) {
				next.toolCount = payload.toolCount
			}
			if (payload.missingToolCount !== undefined) {
				next.missingToolCount = payload.missingToolCount
			}
			if (payload.missingTools !== undefined) {
				next.missingTools = payload.missingTools
			}
			node.blenderSettings = next as any
		},
		setBlenderResponding(state: WorkflowState, payload: { nodeId: string; responding: boolean }) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.isResponding = payload.responding
		},
		setBlenderChatContextUsage(
			state: WorkflowState,
			payload: {
				nodeId: string
				usage: { tokenCount: number; budget: number; usage: number; truncated: boolean } | null
			}
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.chatContextUsage = payload.usage ?? undefined
		},
		setBlenderLastOutputs(
			state: WorkflowState,
			payload: {
				nodeId: string
				outputs: { text?: string; imageUrl?: string; modelPath?: string }
			}
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.lastOutputs = {
				...(node.blenderSettings.lastOutputs ?? {}),
				...payload.outputs,
				updatedAt: Date.now()
			}
		},
		appendBlenderChatMessage(
			state: WorkflowState,
			payload: {
				nodeId: string
				message: WorkflowBlenderChatMessage
			}
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.chatMessages = node.blenderSettings.chatMessages ?? []
			node.blenderSettings.chatMessages.push(payload.message)
		},
		updateBlenderChatMessage(
			state: WorkflowState,
			payload: { nodeId: string; messageId: string; patch: Record<string, any> }
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const msgs = node.blenderSettings?.chatMessages
			if (!Array.isArray(msgs)) return
			const idx = msgs.findIndex((m: any) => m.id === payload.messageId)
			if (idx < 0) return
			msgs[idx] = { ...msgs[idx], ...payload.patch }
		},
		clearBlenderChatMessages(state: WorkflowState, payload: { nodeId: string }) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.chatMessages = []
		},
		compressBlenderChatContext(state: WorkflowState, payload: { nodeId: string }) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const msgs = node.blenderSettings?.chatMessages
			if (!Array.isArray(msgs) || msgs.length <= 2) return

			const keepCount = Math.max(2, Math.floor(msgs.length * 0.4))
			const preserved = msgs.slice(-keepCount)

			const systemMsg: WorkflowBlenderChatMessage = {
				id: `context-compress-${Date.now().toString(36)}`,
				role: 'system',
				content: `📦 上下文已压缩：保留最近 ${keepCount} 条消息，移除 ${msgs.length - keepCount} 条历史消息`,
				timestamp: Date.now()
			}

			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.chatMessages = [systemMsg, ...preserved]
			node.blenderSettings.chatContextUsage = undefined
		},
		toggleBlenderChatMessageCollapsed(
			state: WorkflowState,
			payload: { nodeId: string; messageId: string }
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const msgs = node.blenderSettings?.chatMessages
			if (!Array.isArray(msgs)) return
			const idx = msgs.findIndex((m: any) => m.id === payload.messageId)
			if (idx < 0) return
			msgs[idx] = { ...msgs[idx], collapsed: !(msgs[idx] as any).collapsed }
		},
		removeBlenderChatMessage(state: WorkflowState, payload: { nodeId: string; messageId: string }) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			const msgs = node.blenderSettings?.chatMessages
			if (!Array.isArray(msgs)) return
			const idx = msgs.findIndex((m: any) => m.id === payload.messageId)
			if (idx < 0) return
			msgs.splice(idx, 1)
		},
		setBlenderImportStatus(
			state: WorkflowState,
			payload: {
				nodeId: string
				status: 'idle' | 'downloading' | 'importing' | 'completed' | 'error'
				progress?: number
				error?: string | null
			}
		) {
			const node = state.nodesById[payload.nodeId]
			if (!node) return
			node.blenderSettings = node.blenderSettings ?? {}
			node.blenderSettings.importStatus = payload.status
			if (payload.progress !== undefined) {
				node.blenderSettings.importProgress = payload.progress
			}
			if (payload.error !== undefined) {
				node.blenderSettings.importError = payload.error ?? null
			}
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
		openNodeChatDialog(
			{ commit, state },
			payload: {
				nodeId: string
				nodeType?: WorkflowNodeChatType
				engineNodeChatDraft?: string
				engineNodeChatParams?: Record<string, unknown>
				engineNodeChatSelectedRefs?: WorkflowNodeChatSelectedRef[]
			}
		) {
			const node = state.nodesById[payload.nodeId]
			const engineDraft = payload.engineNodeChatDraft ?? ''
			const vuexDraft = (node as any)?.nodeChatDraft ?? ''
			console.log('[DraftFlow#store action openNodeChatDialog] START', {
				payloadNodeId: payload.nodeId,
				payloadNodeType: payload.nodeType,
				engineDraftLen: engineDraft.length,
				engineDraftPreview:
					engineDraft.length > 40 ? engineDraft.slice(0, 40) + '...' : engineDraft || '(empty)',
				foundNodeInVuex: !!node,
				vuexNodeType: node?.type,
				vuexDraftLen: vuexDraft.length,
				vuexDraftPreview:
					vuexDraft.length > 40 ? vuexDraft.slice(0, 40) + '...' : vuexDraft || '(empty)'
			})
			if (!node) {
				console.warn(
					'[DraftFlow#store action openNodeChatDialog] ABORT: node not found in state.nodesById',
					{
						nodeId: payload.nodeId,
						nodesByIdKeys: Object.keys(state.nodesById).slice(0, 20),
						totalNodes: Object.keys(state.nodesById).length
					}
				)
				return
			}
			let nodeType: WorkflowNodeChatType
			if (
				typeof payload.nodeType === 'string' &&
				['text', 'image', 'video', 'model3d', 'blender'].includes(payload.nodeType)
			) {
				nodeType = payload.nodeType
			} else {
				nodeType = node.type as WorkflowNodeChatType
			}
			if (
				nodeType !== 'text' &&
				nodeType !== 'image' &&
				nodeType !== 'video' &&
				nodeType !== 'model3d' &&
				nodeType !== 'blender'
			) {
				console.warn('[DraftFlow#store action openNodeChatDialog] ABORT: unsupported nodeType', {
					nodeId: payload.nodeId,
					nodeType,
					passedNodeType: payload.nodeType,
					vuexNodeActualType: node.type
				})
				return
			}
			console.log('[DraftFlow#store action openNodeChatDialog] ABOUT TO COMMIT', {
				nodeId: payload.nodeId,
				resolvedNodeType: nodeType
			})
			commit('openNodeChatDialog', {
				nodeId: payload.nodeId,
				nodeType,
				engineNodeChatDraft: payload.engineNodeChatDraft,
				engineNodeChatParams: payload.engineNodeChatParams,
				engineNodeChatSelectedRefs: payload.engineNodeChatSelectedRefs
			})
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
