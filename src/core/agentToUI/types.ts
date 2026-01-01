export type AgentToUiSchemaVersion = 1

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type AgentToUiEnvelope<TType extends string, TPayload> = {
	schemaVersion: AgentToUiSchemaVersion
	type: TType
	id: string
	createdAt: string // ISO8601
	source?: {
		agentName?: string
		agentVersion?: string
		model?: string
	}
	payload: TPayload
	meta?: Record<string, unknown>
}

export type AgentToUiTextPayload = {
	text: string
}

export type AgentToUiChatMessagePayload = {
	content: string
}

export type AgentToUiErrorPayload = {
	code: string
	message: string
	details?: Record<string, unknown>
}

export type AgentToUiComponentTemplatePayload = {
	/**
	 * ComponentTemplate JSON。
	 * 结构规范见 aidoc/04-advanced-components-spec.md
	 */
	template: unknown
	/**
	 * 可选：把实例化后的 root 节点树挂到舞台中的某个父节点下。
	 * 注意：这是“舞台 nodeId”，不是 ComponentTemplate 内部的 parentLocalId。
	 * - undefined: 默认挂到当前 layer 的 root（或顶层）。
	 * - null: 显式挂到 root（等价于默认行为）。
	 */
	parentId?: string | null
	/**
	 * 可选：指定插入到哪个 layer。未提供则使用当前 activeLayer。
	 */
	layerId?: string
	intent?: 'preview' | 'insert'
	params?: Record<string, unknown>
}

export type AgentToUiTaskStatusPhase = 'started' | 'streaming' | 'writing' | 'template' | 'done' | 'canceled' | 'error'

export type AgentToUiTaskStatusPayload = {
	phase: AgentToUiTaskStatusPhase
	message?: string
}

export type AgentToUiTextMessage = AgentToUiEnvelope<'agentToUi/text', AgentToUiTextPayload>
export type AgentToUiChatMessage = AgentToUiEnvelope<'agentToUi/chatMessage', AgentToUiChatMessagePayload>
export type AgentToUiErrorMessage = AgentToUiEnvelope<'agentToUi/error', AgentToUiErrorPayload>
export type AgentToUiComponentTemplateMessage = AgentToUiEnvelope<
	'agentToUi/componentTemplate',
	AgentToUiComponentTemplatePayload
>

export type AgentToUiTaskStatusMessage = AgentToUiEnvelope<'agentToUi/taskStatus', AgentToUiTaskStatusPayload>

export type AgentToUiApplyFilterPayload = {
	/**
	 * 当前最小实现：只支持 selection 或指定 nodeId。
	 */
	target: 'selection' | 'nodeId'
	nodeId?: string
	/**
	 * append: 追加到 filters 列表；replace: 直接覆盖 filters。
	 */
	mode?: 'append' | 'replace'
	/**
	 * 例如 {type:'glow', color:'#00ffff', intensity:1, blurX:18, blurY:18, inner:false, knockout:false}
	 */
	filter: Record<string, JsonValue>
}

export type AgentToUiApplyFilterMessage = AgentToUiEnvelope<'agentToUi/applyFilter', AgentToUiApplyFilterPayload>

export type AgentToUiInsertNodePayload = {
	/**
	 * 单节点或节点树（允许 children）。前端会在插入时做最小规范化。
	 * 推荐字段：
	 * - category: 'user' | 'project'
	 * - userType: 'rect' | 'text' | 'image' | 'line' | 'base'
	 * - transform, props, children
	 */
	node: unknown
	/**
	 * 可选：把节点挂到舞台中的某个父节点下（舞台 nodeId，不是模板 localId）。
	 */
	parentId?: string | null
	/**
	 * 可选：指定插入到哪个 layer。
	 */
	layerId?: string
}

export type AgentToUiInsertNodeMessage = AgentToUiEnvelope<'agentToUi/insertNode', AgentToUiInsertNodePayload>

export type AgentToUiPatchNodePayload = {
	/** 舞台 nodeId */
	nodeId: string
	/** 可选：指定 layerId；未提供则由前端自行查找 */
	layerId?: string
	/** 仅修改提供的字段（patch 语义）；禁止把完整节点树当作 patch 覆盖 */
	patch: {
		name?: string
		userType?: string
		transform?: Record<string, JsonValue>
		props?: Record<string, JsonValue>
	}
}

export type AgentToUiPatchNodeMessage = AgentToUiEnvelope<'agentToUi/patchNode', AgentToUiPatchNodePayload>

export type AgentToUiDeleteNodePayload = {
	/** 删除单个节点（推荐） */
	nodeId?: string
	/** 批量删除 */
	nodeIds?: string[]
	/** 可选：指定 layerId */
	layerId?: string
}

export type AgentToUiDeleteNodeMessage = AgentToUiEnvelope<'agentToUi/deleteNode', AgentToUiDeleteNodePayload>

export type AgentToUiMessage =
	| AgentToUiTextMessage
	| AgentToUiChatMessage
	| AgentToUiErrorMessage
	| AgentToUiComponentTemplateMessage
	| AgentToUiTaskStatusMessage
	| AgentToUiApplyFilterMessage
	| AgentToUiInsertNodeMessage
	| AgentToUiPatchNodeMessage
	| AgentToUiDeleteNodeMessage
