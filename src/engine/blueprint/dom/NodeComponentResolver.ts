import { defineAsyncComponent, type Component } from 'vue'
import type { BlueprintNodeData, LegacyResourceData, PortSpec } from '../types'
import type { BlueprintNode } from '../BlueprintNode'
import { resolveWorkflowResourceUrl } from '../../../aiworkflow/domain/resource/safeWorkflowUrl'
import type { WorkflowNodeGenerationTask } from '../../../aiworkflow/types'

type WorkflowAnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?:
		| 'generic'
		| 'image'
		| 'video'
		| 'text'
		| 'flow'
		| 'model3d'
		| 'audio'
		| 'meta'
		| 'resource'
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
	/** 蓝图项目相对路径：形如 Content/Media/meshy-3d-xxx.glb，拼接 projectRoot 可得到本地绝对路径 */
	resourceProjectRelativePath?: string
	/** 本地绝对路径：形如 G:\DVSTestProject\复赛视频项目\Content\Media\xxx.glb */
	resourceAbsolutePath?: string
	/**
	 * 提示组件：存在 resourceUrl 但尚未生成 posterUrl，
	 * 业务层可据此在渲染前主动触发首帧捕获。
	 * 由 resolveResourceProps 在 video/image/model3d 类 resource 无 poster 时置位。
	 */
	triggerCapture?: boolean
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
	comfyui: () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'),
	'director-console': () =>
		import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowDirectorConsoleNode.vue')
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

		// ===== 2026-08 字段优先级约定（方案 P1/P2/P3 共享）=====
		// 消费端（3D 模型面板、右键打开、Blender 导入）应以如下顺序选择"真实资产路径"：
		//   1. resourceAbsolutePath（本机绝对路径，最直接）
		//   2. resourceSourcePath（本机绝对路径，广泛存在）
		//   3. projectRoot + resourceProjectRelativePath（跨机器可移植）
		//   4. resourceUrl → 反解 dweb/file 路径（兜底）
		// settings.modelSourcePath/modelAssetPath 等字段仅作兼容 fallback，不得绕过 resourcesById。
		if (res.url) props.resourceUrl = resolveWorkflowResourceUrl(res.url)
		if (res.sourcePath) props.resourceSourcePath = res.sourcePath
		// ===== 2026-08-03 修复：3D模型节点需要拿到 projectRelativePath 和 absolutePath
		// 以便拼接 projectRoot → 本地绝对路径 → file:/// URL，彻底绕开 dweb 协议代理与 CORS
		// resourcesById 中实际存储了 projectRelativePath 和 absolutePath（保存蓝图时写入）
		if (res.projectRelativePath) props.resourceProjectRelativePath = String(res.projectRelativePath)
		if (res.absolutePath) props.resourceAbsolutePath = String(res.absolutePath)
		if (res.posterUrl) props.posterUrl = resolveWorkflowResourceUrl(res.posterUrl)
		if (res.name) props.resourceName = res.name
		if (res.previewUrl320)
			props.resourcePreviewUrl320 = resolveWorkflowResourceUrl(res.previewUrl320)
		if (res.previewUrl640)
			props.resourcePreviewUrl640 = resolveWorkflowResourceUrl(res.previewUrl640)

		// 针对拖拽时已生成海报但远程生成视频没有的场景，
		// 如果是 video/image/model3d 且无 poster 但有 resourceUrl，则下发 triggerCapture
		const kind = String(res.kind || '').toLowerCase()
		if (props.resourceUrl && !props.posterUrl) {
			if (
				kind === 'video' ||
				kind === 'image' ||
				kind === 'model3d' ||
				kind === '3d' ||
				kind === 'scene'
			) {
				props.triggerCapture = true
			} else if (
				data.type === 'video' ||
				data.type === 'image' ||
				data.type === 'rotate-image' ||
				data.type === 'model3d' ||
				data.type === 'scene-decompose'
			) {
				props.triggerCapture = true
			}
		}

		return props
	}

	static resolveNodeProps(
		node: BlueprintNode,
		zoom: number = 1,
		legacyResources: Record<string, LegacyResourceData> = {},
		isSelected: boolean = false,
		chatState?: NodeChatState | null,
		generationTasksById?: Record<string, WorkflowNodeGenerationTask>,
		inputParamPreviewRefs?: any[],
		generationTaskIdsByNodeId?: Record<string, string[]>
	): ResolvedWorkflowNodeProps {
		const data = node.data
		const isChatActive =
			(chatState && chatState.visible && chatState.nodeId === data.id) || !!data.nodeChatVisible

		let nodeTask: WorkflowNodeGenerationTask | null = null
		if (generationTasksById) {
			const nodeId = data.id
			const allNodeTasks = Object.values(generationTasksById).filter((t) => t.nodeId === nodeId)
			if (allNodeTasks.length > 0) {
				// 1. 优先找活跃任务（submitting/running）
				const activeTask = allNodeTasks.find(
					(t) => t.status === 'submitting' || t.status === 'running'
				)
				if (activeTask) {
					nodeTask = activeTask
				} else {
					// 2. 没有活跃任务时，按权威任务顺序取最新已结束任务
					const taskIds = generationTaskIdsByNodeId?.[nodeId]
					if (taskIds && taskIds.length > 0) {
						for (const tid of taskIds) {
							const t = generationTasksById[tid]
							if (t && (t.status === 'error' || t.status === 'completed')) {
								nodeTask = t
								break
							}
						}
					}
					// 3. 回退：按startedAt降序取最新已结束任务
					if (!nodeTask) {
						const sorted = [...allNodeTasks]
							.filter((t) => t.status === 'error' || t.status === 'completed')
							.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
						nodeTask = sorted[0] || null
					}
				}
			}
		}
		const generationTask = nodeTask

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
			autoHeight: !data.sizeCustomized
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
				break
			case 'video':
				if (data.videoSettings) typeSpecificProps.videoSettings = data.videoSettings
				typeSpecificProps.screenshotEnabled = true
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
				typeSpecificProps.sceneUnderstandingSettings = data.sceneUnderstandingSettings || {
					mode: 'scene-layout',
					sceneType: 'auto',
					status: 'idle',
					availableModels: [],
					selectedModel: ''
				}
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
			case 'director-console':
				if (data.directorConsoleSettings)
					typeSpecificProps.directorConsoleSettings = data.directorConsoleSettings
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
