import type { JsonValue } from '../shared/json'
import { NodeBase, type NodeBaseDTO, type NodeType, upgradeNodeType } from '../scene/nodesType'
import type { VideoSceneNodeTransform, VideoSceneTreeNode, VideoSceneUserNodeType } from '../scene'
import { genId as defaultGenId } from '../scene/commands/nodes/utils'

import type { ComponentTemplate, InstantiateTemplateOptions, InstantiateTemplateResult, TemplateNodeTransform } from './types'
import { validateComponentTemplate } from './validate'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const toUserType = (templateType: string, fallback: VideoSceneUserNodeType): VideoSceneUserNodeType => {
	// 约定：模板里的 group 先映射为可渲染的 base（未来可引入真正的 group userType 或专用容器节点）
	if (templateType === 'group') return 'base'
	if (templateType === 'base') return 'base'
	if (templateType === 'rect') return 'rect'
	if (templateType === 'text') return 'text'
	if (templateType === 'image') return 'image'
	if (templateType === 'line') return 'line'
	return fallback
}

const buildDefaults = (template: ComponentTemplate): Record<string, JsonValue> => {
	const out: Record<string, JsonValue> = {}
	for (const p of template.params) {
		if (p.default !== undefined) out[p.key] = p.default
	}
	return out
}

const resolveParam = (params: Record<string, JsonValue>, key: string): JsonValue | undefined => params[key]

const substituteInString = (s: string, params: Record<string, JsonValue>): JsonValue => {
	// 如果是纯占位符且对应参数不是 string，则返回原类型的 JsonValue
	const pure = /^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/.exec(s)
	if (pure) {
		const key = pure[1]
		const v = resolveParam(params, key)
		return v !== undefined ? v : s
	}

	return s.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
		const v = resolveParam(params, key)
		return v === undefined ? `{{${key}}}` : String(v)
	})
}

const deepSubstitute = (v: JsonValue, params: Record<string, JsonValue>): JsonValue => {
	if (typeof v === 'string') return substituteInString(v, params)
	if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v
	if (Array.isArray(v)) return v.map((it) => deepSubstitute(it, params)) as JsonValue
	// object
	const out: Record<string, JsonValue> = {}
	for (const [k, vv] of Object.entries(v as Record<string, JsonValue>)) {
		out[k] = deepSubstitute(vv, params)
	}
	return out
}

const coerceNumber = (v: JsonValue): number | null => {
	if (typeof v === 'number' && Number.isFinite(v)) return v
	if (typeof v === 'string') {
		const n = Number(v)
		return Number.isFinite(n) ? n : null
	}
	return null
}

const applyTransformPatch = (base: VideoSceneNodeTransform, patch?: TemplateNodeTransform): VideoSceneNodeTransform => {
	if (!patch) return base
	const next: VideoSceneNodeTransform = { ...base }

	const x = patch.x !== undefined ? coerceNumber(patch.x) : null
	if (x !== null) next.x = x
	const y = patch.y !== undefined ? coerceNumber(patch.y) : null
	if (y !== null) next.y = y

	const width = patch.width !== undefined ? coerceNumber(patch.width) : null
	if (width !== null) next.width = Math.max(1, width)
	const height = patch.height !== undefined ? coerceNumber(patch.height) : null
	if (height !== null) next.height = Math.max(1, height)

	const rotation = patch.rotation !== undefined ? coerceNumber(patch.rotation) : null
	if (rotation !== null) next.rotation = rotation
	const opacity = patch.opacity !== undefined ? coerceNumber(patch.opacity) : null
	if (opacity !== null) next.opacity = Math.max(0, Math.min(1, opacity))

	return next
}

const defaultNameForType = (userType: VideoSceneUserNodeType) =>
	userType === 'rect'
		? 'Rect'
		: userType === 'text'
			? 'Text'
			: userType === 'image'
				? 'Image'
				: userType === 'line'
					? 'Line'
					: 'Node'

const createUserNode = (
	userType: VideoSceneUserNodeType,
	name: string,
	props: Record<string, JsonValue>,
	transformPatch: TemplateNodeTransform | undefined,
	genId: (prefix: string) => string
): VideoSceneTreeNode => {
	const id = genId(userType)
	const base: NodeBaseDTO = NodeBase.create(id, name)
	const upgraded = upgradeNodeType(base, userType as unknown as NodeType)
	const baseTransform: VideoSceneNodeTransform = {
		x: upgraded.transform.x,
		y: upgraded.transform.y,
		width: upgraded.transform.width,
		height: upgraded.transform.height,
		rotation: upgraded.transform.rotation,
		opacity: upgraded.transform.opacity,
	}
	const transform = applyTransformPatch(baseTransform, transformPatch)
	return {
		id: upgraded.id,
		name: upgraded.name,
		category: 'user',
		userType: upgraded.type as unknown as VideoSceneUserNodeType,
		transform,
		props: { ...(upgraded.props ?? {}), ...props },
	}
}

export function instantiateTemplate(
	templateInput: unknown,
	paramsInput: Record<string, JsonValue> = {},
	options: InstantiateTemplateOptions = {}
): InstantiateTemplateResult {
	const validated = validateComponentTemplate(templateInput)
	if (!validated.ok) {
		throw new Error(`ComponentTemplate invalid: ${validated.errors.join('; ')}`)
	}
	return instantiateValidatedTemplate(validated.value, paramsInput, options)
}

export function instantiateValidatedTemplate(
	template: ComponentTemplate,
	paramsInput: Record<string, JsonValue> = {},
	options: InstantiateTemplateOptions = {}
): InstantiateTemplateResult {

	const fallbackUserType = options.fallbackUserType ?? 'base'
	const genId = options.genId ?? defaultGenId

	const params: Record<string, JsonValue> = {
		...buildDefaults(template),
		...paramsInput,
	}

	// 1) create all nodes
	const localIdToNode: Record<string, VideoSceneTreeNode> = {}
	const localIdToNodeId: Record<string, string> = {}
	const parentLocalIdByLocalId: Record<string, string | undefined> = {}

	for (const n of template.nodes) {
		const userType = toUserType(n.type, fallbackUserType)
		const name = String(n.name ?? defaultNameForType(userType))
		const substitutedProps = deepSubstitute(n.props, params)
		const props = isRecord(substitutedProps) ? (substitutedProps as Record<string, JsonValue>) : {}

		const substitutedTransform = n.transform ? (deepSubstitute(n.transform as unknown as JsonValue, params) as JsonValue) : undefined
		const transformPatch = substitutedTransform && isRecord(substitutedTransform) ? (substitutedTransform as unknown as TemplateNodeTransform) : n.transform

		const node = createUserNode(userType, name, props, transformPatch, genId)
		localIdToNode[n.localId] = node
		localIdToNodeId[n.localId] = node.id
		parentLocalIdByLocalId[n.localId] = n.parentLocalId
	}

	// 2) build tree
	for (const n of template.nodes) {
		const parentLocalId = parentLocalIdByLocalId[n.localId]
		if (!parentLocalId) continue
		const parent = localIdToNode[parentLocalId]
		const child = localIdToNode[n.localId]
		if (!parent || !child) continue
		if (!parent.children) parent.children = []
		parent.children.push(child)
	}

	const root = localIdToNode[template.rootLocalId]
	if (!root) throw new Error('ComponentTemplate rootLocalId not found after instantiate')

	return { rootNodeId: root.id, localIdToNodeId, root }
}

export function instantiateTemplateFromTemplate(
	template: ComponentTemplate,
	params: Record<string, JsonValue> = {},
	options: InstantiateTemplateOptions = {}
): InstantiateTemplateResult {
	return instantiateValidatedTemplate(template, params, options)
}
