import type { JsonValue } from '../shared/json'
import type { VideoSceneTreeNode, VideoSceneUserNodeType } from '../scene'

export type ComponentTemplateSchemaVersion = 1

export type ComponentTemplateParamType = 'string' | 'number' | 'boolean' | 'color' | 'asset:image'

export type ComponentTemplateParam = {
	key: string
	type: ComponentTemplateParamType
	default?: JsonValue
}

export type TemplateNodeTransform = {
	// 支持 number 或 string（例如 "{{x}}"），实例化时会尝试转换为 number。
	x?: JsonValue
	y?: JsonValue
	width?: JsonValue
	height?: JsonValue
	rotation?: JsonValue
	opacity?: JsonValue
}

export type TemplateNode = {
	localId: string
	type: string
	name?: string
	parentLocalId?: string
	transform?: TemplateNodeTransform
	props: Record<string, JsonValue>
}

export type ComponentTemplate = {
	schemaVersion: ComponentTemplateSchemaVersion
	templateId: string
	name: string
	description?: string
	params: ComponentTemplateParam[]
	nodes: TemplateNode[]
	rootLocalId: string
	bindings?: Record<string, string>
}

export type InstantiateTemplateOptions = {
	/**
	 * 用于生成全局 nodeId。默认使用和 createRenderableNode 相同的规则。
	 */
	genId?: (prefix: string) => string
	/**
	 * 为模板节点生成 nodeId（可用于让舞台节点 id 可由 templateId/localId 推导）。
	 * 如果提供，将优先于 genId。
	 */
	getNodeId?: (args: { templateId: string; localId: string; userType: VideoSceneUserNodeType }) => string
	/**
	 * 当 TemplateNode.type 无法映射到已知 userType 时使用。
	 */
	fallbackUserType?: VideoSceneUserNodeType
}

export type InstantiateTemplateResult = {
	rootNodeId: string
	localIdToNodeId: Record<string, string>
	/**
	 * 返回以 rootLocalId 对应节点为根的树（通常作为插入的 root）。
	 */
	root: VideoSceneTreeNode
}
