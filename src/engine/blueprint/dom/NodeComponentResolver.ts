import { defineAsyncComponent, type Component } from 'vue'
import type { BlueprintNodeData, LegacyResourceData, PortSpec } from '../types'
import type { BlueprintNode } from '../BlueprintNode'
import { resolveWorkflowResourceUrl } from '../../../aiworkflow/domain/resource/safeWorkflowUrl'
import type { WorkflowNodeGenerationTask } from '../../../aiworkflow/types'

type WorkflowAnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta'
}

type WorkflowNodeBaseProps = {
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs: WorkflowAnchorSpec[]
	outputs: WorkflowAnchorSpec[]
	selected?: boolean
	isPrimarySelected?: boolean
	isSecondarySelected?: boolean
	visualStatus?: 'idle' | 'running' | 'error'
	sizeCustomized?: boolean
	autoHeight?: boolean
}

type ResourceRelatedProps = {
	resourceUrl?: string
	resourceSourcePath?: string
	resourcePreviewUrl320?: string
	resourcePreviewUrl640?: string
	posterUrl?: string
	resourceName?: string
}

export type ResolvedWorkflowNodeProps = WorkflowNodeBaseProps &
	ResourceRelatedProps &
	Record<string, unknown>

export type NodeChatState = {
	visible: boolean
	nodeId: string | null
	nodeType: string | null
	draft: string
	submitting: boolean
	params: Record<string, any>
	selectedRefs: any[]
}

const NODE_COMPONENT_MAP: Record<string, () => Promise<Component>> = {
	text: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextNode.vue'),
	'text-merge': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue'),
	image: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'),
	'rotate-image': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'),
	video: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'),
	'scene-understanding': () =>
		import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneUnderstandingNode.vue'),
	'scene-decompose': () =>
		import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneDecomposeNode.vue'),
	'scene-layout': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneLayoutNode.vue'),
	story: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'),
	'unreal-export': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowUnrealExportNode.vue'),
	model3d: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowModel3DNode.vue'),
	meshy: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowMeshyModelNode.vue'),
	blender: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowBlenderNode.vue'),
	comfyui: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue')
}

const ASYNC_COMPONENT_CACHE = new Map<string, Component>()

export class NodeComponentResolver {
	static getComponent(nodeType: string): Component | null {
		const loader = NODE_COMPONENT_MAP[nodeType]
		if (!loader) return null
		if (ASYNC_COMPONENT_CACHE.has(nodeType)) {
			return ASYNC_COMPONENT_CACHE.get(nodeType)!
		}
		const asyncComp = defineAsyncComponent(loader)
		ASYNC_COMPONENT_CACHE.set(nodeType, asyncComp)
		return asyncComp
	}

	static hasComponent(nodeType: string): boolean {
		return nodeType in NODE_COMPONENT_MAP
	}

	static convertPortsToAnchors(ports: PortSpec[]): WorkflowAnchorSpec[] {
		return ports.map((p) => ({
			id: p.id,
			label: p.label,
			offsetY: p.offsetY,
			mediaType: (p.mediaType === 'resource'
				? 'generic'
				: p.mediaType) as WorkflowAnchorSpec['mediaType']
		}))
	}

	static resolveResourceProps(
		data: BlueprintNodeData,
		legacyResources: Record<string, LegacyResourceData>
	): ResourceRelatedProps {
		const resourceId = data.resourceId
		if (!resourceId) return {}
		const res = legacyResources[resourceId]
		if (!res) return {}

		const props: ResourceRelatedProps = {}

		if (res.url) props.resourceUrl = resolveWorkflowResourceUrl(res.url)
		if (res.sourcePath) props.resourceSourcePath = res.sourcePath
		if (res.posterUrl) props.posterUrl = resolveWorkflowResourceUrl(res.posterUrl)
		if (res.name) props.resourceName = res.name
		if (res.previewUrl320)
			props.resourcePreviewUrl320 = resolveWorkflowResourceUrl(res.previewUrl320)
		if (res.previewUrl640)
			props.resourcePreviewUrl640 = resolveWorkflowResourceUrl(res.previewUrl640)

		return props
	}

	static resolveNodeProps(
		node: BlueprintNode,
		zoom: number = 1,
		legacyResources: Record<string, LegacyResourceData> = {},
		isSelected: boolean = false,
		chatState?: NodeChatState | null,
		generationTasksById?: Record<string, WorkflowNodeGenerationTask>,
		inputParamPreviewRefs?: any[]
	): ResolvedWorkflowNodeProps {
		const data = node.data
		const isChatActive =
			(chatState && chatState.visible && chatState.nodeId === data.id) || !!data.nodeChatVisible

		const nodeTask = generationTasksById
			? Object.values(generationTasksById).find(
					(t) =>
						t.nodeId === data.id &&
						(t.status === 'submitting' ||
							t.status === 'running' ||
							t.status === 'error' ||
							t.status === 'completed')
				)
			: null
		const generationTask = nodeTask ?? null

		const baseStatus =
			data.status === 'error' ? 'error' : data.status === 'running' ? 'running' : 'idle'
		const taskStatus = generationTask
			? generationTask.status === 'error'
				? 'error'
				: generationTask.status === 'running' || generationTask.status === 'submitting'
					? 'running'
					: 'idle'
			: 'idle'
		const effectiveStatus: 'idle' | 'running' | 'error' =
			baseStatus === 'error' || taskStatus === 'error'
				? 'error'
				: baseStatus === 'running' || taskStatus === 'running'
					? 'running'
					: 'idle'

		const baseProps: WorkflowNodeBaseProps = {
			nodeId: data.id,
			title: data.title,
			alias: data.alias,
			nodeType: data.type,
			subtitle: data.subtitle,
			width: data.width,
			height: data.height,
			zoom,
			worldX: 0,
			worldY: 0,
			inputs: this.convertPortsToAnchors(data.inputs),
			outputs: this.convertPortsToAnchors(data.outputs),
			selected: isSelected,
			isPrimarySelected: isSelected,
			isSecondarySelected: false,
			visualStatus: effectiveStatus,
			sizeCustomized: data.sizeCustomized,
			autoHeight: data.type === 'image' || data.type === 'rotate-image'
		}

		const resourceProps = this.resolveResourceProps(data, legacyResources)

		const persistedChatDraft = data.nodeChatDraft ?? ''
		const persistedChatParams = data.nodeChatParams ?? {}
		const persistedChatSelectedRefs = data.nodeChatSelectedRefs ?? []

		const chatProps: Record<string, unknown> = {
			nodeChatVisible: !!isChatActive,
			nodeChatNodeType: isChatActive
				? (chatState && chatState.nodeId === data.id ? chatState.nodeType : null) || data.type
				: data.type,
			nodeChatSubmitting:
				isChatActive && chatState && chatState.nodeId === data.id ? chatState.submitting : false,
			nodeChatDraft:
				isChatActive && chatState && chatState.nodeId === data.id
					? chatState.draft != null
						? chatState.draft
						: persistedChatDraft
					: persistedChatDraft,
			nodeChatParams:
				isChatActive && chatState && chatState.nodeId === data.id
					? { ...persistedChatParams, ...(chatState.params || {}) }
					: persistedChatParams,
			nodeChatSelectedRefs:
				isChatActive && chatState && chatState.nodeId === data.id
					? chatState.selectedRefs?.length
						? chatState.selectedRefs
						: persistedChatSelectedRefs
					: persistedChatSelectedRefs
		}

		const typeSpecificProps: Record<string, unknown> = {}
		switch (data.type) {
			case 'text':
				if (data.textValue != null) typeSpecificProps.textValue = data.textValue
				break
			case 'image':
			case 'rotate-image':
				if (data.imageSettings) typeSpecificProps.imageSettings = data.imageSettings
				typeSpecificProps.sizeCustomized = data.sizeCustomized
				break
			case 'video':
				if (data.videoSettings) typeSpecificProps.videoSettings = data.videoSettings
				break
			case 'model3d':
				if (data.model3dSettings) typeSpecificProps.model3dSettings = data.model3dSettings
				break
			case 'meshy':
				if (data.meshySettings) typeSpecificProps.meshySettings = data.meshySettings
				break
			case 'blender':
				if (data.blenderSettings) typeSpecificProps.blenderSettings = data.blenderSettings
				break
			case 'story':
				if (data.storySettings) typeSpecificProps.storySettings = data.storySettings
				break
			case 'scene-understanding':
				if (data.sceneUnderstandingSettings)
					typeSpecificProps.sceneUnderstandingSettings = data.sceneUnderstandingSettings
				break
			case 'scene-layout':
				if (data.sceneLayoutSettings)
					typeSpecificProps.sceneLayoutSettings = data.sceneLayoutSettings
				break
			case 'scene-decompose':
				if (data.sceneDecomposeSettings)
					typeSpecificProps.sceneDecomposeSettings = data.sceneDecomposeSettings
				break
			case 'unreal-export':
				if (data.unrealExportSettings)
					typeSpecificProps.unrealExportSettings = data.unrealExportSettings
				break
			case 'comfyui':
				if (data.comfyuiSettings) typeSpecificProps.comfyuiSettings = data.comfyuiSettings
				break
		}

		if (data.textValue != null) typeSpecificProps.textValue = data.textValue
		if (data.rotatePromptText != null) typeSpecificProps.promptText = data.rotatePromptText
		if (data.textMergeItems != null) typeSpecificProps.textMergeItems = data.textMergeItems
		if (data.prompt != null) typeSpecificProps.prompt = data.prompt

		// 调试日志
		if (inputParamPreviewRefs && inputParamPreviewRefs.length > 0) {
			console.log(
				`[NodeComponentResolver] resolveNodeProps for nodeId=${data.id}, type=${data.type}, inputParamPreviewRefs count=${inputParamPreviewRefs.length}`,
				inputParamPreviewRefs
			)
		}

		return {
			...baseProps,
			...resourceProps,
			...chatProps,
			...typeSpecificProps,
			nodeGenerationTask: generationTask,
			inputParamPreviewRefs: inputParamPreviewRefs || []
		}
	}
}
