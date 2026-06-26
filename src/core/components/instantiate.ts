import type { JsonValue } from '../shared/json'
import { NodeBase, type NodeBaseDTO, type NodeType, upgradeNodeType } from '../scene/nodesType'
import type { VideoSceneNodeTransform, VideoSceneTreeNode, VideoSceneUserNodeType } from '../scene'
import { normalizeLineLocalPoints } from '../scene/geometry'
import { computeTextAutoSize } from '../scene/commands/nodes/textAutoSize'
import { genId as defaultGenId } from '../scene/commands/nodes/utils'
import { normalizeTextNodeProps } from '../scene/nodesType/TextNode'

import type { ComponentTemplate, InstantiateTemplateOptions, InstantiateTemplateResult, TemplateNodeTransform } from './types'
import { validateComponentTemplate } from './validate'
import { isRecord } from '../../types/utils'

const toUserType = (templateType: string, fallback: VideoSceneUserNodeType): VideoSceneUserNodeType => {
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
	const out: Record<string, JsonValue> = {}
	for (const [k, vv] of Object.entries(v)) {
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
	const clampScale = (v: unknown) => {
		const n = Number(v)
		if (!Number.isFinite(n)) return null
		return Math.max(0, Math.min(100, n))
	}

	const x = patch.x !== undefined ? coerceNumber(patch.x) : null
	if (x !== null) next.x = x
	const y = patch.y !== undefined ? coerceNumber(patch.y) : null
	if (y !== null) next.y = y

	const legacyScale = patch.scale !== undefined ? coerceNumber(patch.scale) : null
	const scaleX = patch.scaleX !== undefined ? coerceNumber(patch.scaleX) : null
	const scaleY = patch.scaleY !== undefined ? coerceNumber(patch.scaleY) : null
	if (scaleX !== null) {
		const v = clampScale(scaleX)
		if (v !== null) next.scaleX = v
	} else if (legacyScale !== null) {
		const v = clampScale(legacyScale)
		if (v !== null) next.scaleX = v
	}
	if (scaleY !== null) {
		const v = clampScale(scaleY)
		if (v !== null) next.scaleY = v
	} else if (legacyScale !== null) {
		const v = clampScale(legacyScale)
		if (v !== null) next.scaleY = v
	}
	if (legacyScale !== null) {
		const v = clampScale(legacyScale)
		if (v !== null) next.scale = v
	}

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
	forcedId: string | undefined,
	userType: VideoSceneUserNodeType,
	name: string,
	props: Record<string, JsonValue>,
	transformPatch: TemplateNodeTransform | undefined,
	genId: (prefix: string) => string
): VideoSceneTreeNode => {
	const id = typeof forcedId === 'string' && forcedId.trim() ? forcedId.trim() : genId(userType)
	const base: NodeBaseDTO = NodeBase.create(id, name)
	const upgraded = upgradeNodeType(base, userType as unknown as NodeType)
	const tr = upgraded.transform
	const baseTransform: VideoSceneNodeTransform = {
		x: tr.x,
		y: tr.y,
		scaleX: tr.scaleX ?? tr.scale ?? 1,
		scaleY: tr.scaleY ?? tr.scale ?? 1,
		scale: tr.scale ?? 1,
		pivotX: tr.pivotX ?? 0.5,
		pivotY: tr.pivotY ?? 0.5,
		width: tr.width,
		height: tr.height,
		rotation: tr.rotation,
		opacity: tr.opacity,
	}
	const transform = applyTransformPatch(baseTransform, transformPatch)
	const finalProps: Record<string, JsonValue> = { ...(upgraded.props ?? {}), ...props }
	if (userType === 'text') {
		Object.assign(finalProps, normalizeTextNodeProps(finalProps))
		const size = computeTextAutoSize(finalProps)
		if (size) {
			transform.width = size.width
			transform.height = size.height
		}
	} else if (userType === 'line') {
		Object.assign(finalProps, normalizeLineLocalPoints({ props: finalProps, width: transform.width, height: transform.height }))
	}
	return {
		id: upgraded.id,
		createdAt: Date.now(),
		name: upgraded.name,
		category: 'user',
		userType: upgraded.type as unknown as VideoSceneUserNodeType,
		transform,
		props: finalProps,
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
	const getNodeId = options.getNodeId

	const params: Record<string, JsonValue> = {
		...buildDefaults(template),
		...paramsInput,
	}

	const localIdToNode: Record<string, VideoSceneTreeNode> = {}
	const localIdToNodeId: Record<string, string> = {}
	const parentLocalIdByLocalId: Record<string, string | undefined> = {}

	for (const n of template.nodes) {
		const userType = toUserType(n.type, fallbackUserType)
		const name = String(n.name ?? defaultNameForType(userType))
		const substitutedProps = deepSubstitute(n.props, params)
		const props = isRecord(substitutedProps) ? substitutedProps : {}

		const substitutedTransform = n.transform ? (deepSubstitute(n.transform as unknown as JsonValue, params)) : undefined
		const transformPatch = substitutedTransform && isRecord(substitutedTransform) ? (substitutedTransform as unknown as TemplateNodeTransform) : n.transform
		const forcedId = getNodeId ? getNodeId({ templateId: template.templateId, localId: n.localId, userType }) : undefined
		const node = createUserNode(forcedId, userType, name, props, transformPatch, genId)
		localIdToNode[n.localId] = node
		localIdToNodeId[n.localId] = node.id
		parentLocalIdByLocalId[n.localId] = n.parentLocalId
	}

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
