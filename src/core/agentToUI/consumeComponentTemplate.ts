import type { JsonValue } from '../shared/json'
import type { ComponentTemplate } from '../components'
import { instantiateValidatedTemplate, validateComponentTemplate } from '../components'

import type { AgentToUiComponentTemplateMessage } from './types'
import { isAgentToUiComponentTemplateMessage } from './guards'

export type ConsumeComponentTemplateResult =
	| {
			ok: true
			message: AgentToUiComponentTemplateMessage
			intent: 'preview' | 'insert' | undefined
			template: ComponentTemplate
			params: Record<string, JsonValue>
			instantiated: ReturnType<typeof instantiateValidatedTemplate>
		}
	| { ok: false; errors: string[] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const toJsonValue = (v: unknown): JsonValue | undefined => {
	if (v === null) return null
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
	if (Array.isArray(v)) {
		const out: JsonValue[] = []
		for (const it of v) {
			const j = toJsonValue(it)
			if (j === undefined) return undefined
			out.push(j)
		}
		return out
	}
	if (isRecord(v)) {
		const out: Record<string, JsonValue> = {}
		for (const [k, vv] of Object.entries(v)) {
			const j = toJsonValue(vv)
			if (j === undefined) return undefined
			out[k] = j
		}
		return out
	}
	return undefined
}

const toJsonRecord = (v: unknown): Record<string, JsonValue> => {
	if (!isRecord(v)) return {}
	const out: Record<string, JsonValue> = {}
	for (const [k, vv] of Object.entries(v)) {
		const j = toJsonValue(vv)
		if (j === undefined) continue
		out[k] = j
	}
	return out
}

export function consumeAgentToUiComponentTemplateMessage(v: unknown): ConsumeComponentTemplateResult {
	if (!isAgentToUiComponentTemplateMessage(v)) {
		return { ok: false, errors: ['AgentToUI message invalid or not componentTemplate'] }
	}

	const payload = v.payload
	const validated = validateComponentTemplate(payload.template)
	if (!validated.ok) {
		return { ok: false, errors: validated.errors.map((e) => `template: ${e}`) }
	}

	const template = validated.value
	const params = toJsonRecord(payload.params)

	try {
		const instantiated = instantiateValidatedTemplate(template, params)
		return {
			ok: true,
			message: v,
			intent: payload.intent,
			template,
			params,
			instantiated,
		}
	} catch (e) {
		return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
	}
}
