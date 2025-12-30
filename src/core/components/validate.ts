import type { ComponentTemplate, ComponentTemplateParamType, TemplateNode } from './types'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isArray = Array.isArray

const paramTypes: ComponentTemplateParamType[] = ['string', 'number', 'boolean', 'color', 'asset:image']

export type ValidateResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export function validateComponentTemplate(v: unknown): ValidateResult<ComponentTemplate> {
	const errors: string[] = []
	if (!isRecord(v)) return { ok: false, errors: ['template: not an object'] }
	if (v.schemaVersion !== 1) errors.push('schemaVersion must be 1')
	if (!isString(v.templateId) || !v.templateId.trim()) errors.push('templateId must be non-empty string')
	if (!isString(v.name) || !v.name.trim()) errors.push('name must be non-empty string')
	if (!isString(v.rootLocalId) || !v.rootLocalId.trim()) errors.push('rootLocalId must be non-empty string')

	const params = (v.params ?? [])
	if (!isArray(params)) errors.push('params must be an array')
	const nodes = (v.nodes ?? [])
	if (!isArray(nodes)) errors.push('nodes must be an array')

	const paramKeySet = new Set<string>()
	if (isArray(params)) {
		for (const p of params) {
			if (!isRecord(p)) {
				errors.push('params[] must be objects')
				continue
			}
			if (!isString(p.key) || !p.key.trim()) {
				errors.push('param.key must be non-empty string')
				continue
			}
			if (paramKeySet.has(p.key)) errors.push(`param.key duplicated: ${p.key}`)
			paramKeySet.add(p.key)
			if (!isString(p.type) || !paramTypes.includes(p.type as ComponentTemplateParamType)) {
				errors.push(`param.type invalid: ${String(p.type)}`)
			}
		}
	}

	const nodeLocalIds = new Set<string>()
	const nodeByLocalId: Record<string, TemplateNode> = {}
	if (isArray(nodes)) {
		for (const n of nodes) {
			if (!isRecord(n)) {
				errors.push('nodes[] must be objects')
				continue
			}
			if (!isString(n.localId) || !n.localId.trim()) {
				errors.push('nodes[].localId must be non-empty string')
				continue
			}
			if (nodeLocalIds.has(n.localId)) errors.push(`nodes[].localId duplicated: ${n.localId}`)
			nodeLocalIds.add(n.localId)

			if (!isString(n.type) || !n.type.trim()) errors.push(`nodes[${n.localId}].type must be non-empty string`)
			if (!isRecord(n.props)) errors.push(`nodes[${n.localId}].props must be object`)
			if (n.transform !== undefined) {
				if (!isRecord(n.transform)) {
					errors.push(`nodes[${n.localId}].transform must be object when provided`)
				} else {
					const t = n.transform
					const allow = (key: string) => {
						const v = t[key]
						if (v === undefined) return
						if (typeof v === 'number') return
						if (typeof v === 'string') return
						errors.push(`nodes[${n.localId}].transform.${key} must be number|string when provided`)
					}
					allow('x')
					allow('y')
					allow('width')
					allow('height')
					allow('rotation')
					allow('opacity')
				}
			}

			nodeByLocalId[n.localId] = n as unknown as TemplateNode
		}
	}

	if (isString(v.rootLocalId) && v.rootLocalId.trim() && !nodeLocalIds.has(v.rootLocalId)) {
		errors.push('rootLocalId must exist in nodes[].localId')
	}

	// parentLocalId reference check
	for (const localId of Object.keys(nodeByLocalId)) {
		const n = nodeByLocalId[localId]
		const parentLocalId = n.parentLocalId
		if (parentLocalId === undefined) continue
		if (!isString(parentLocalId) || !parentLocalId.trim()) {
			errors.push(`nodes[${localId}].parentLocalId must be string when provided`)
			continue
		}
		if (parentLocalId === localId) errors.push(`nodes[${localId}].parentLocalId cannot reference itself`)
		if (!nodeLocalIds.has(parentLocalId)) errors.push(`nodes[${localId}].parentLocalId not found: ${parentLocalId}`)
	}

	if (errors.length) return { ok: false, errors }
	return { ok: true, value: v as unknown as ComponentTemplate }
}
