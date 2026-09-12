const record = (v) => v && typeof v === 'object' && !Array.isArray(v)
const controls = new Set(['fixed', 'randomize', 'increment', 'decrement'])
const scalar = (def) =>
	Array.isArray(def?.[0]) ||
	['STRING', 'INT', 'FLOAT', 'NUMBER', 'BOOLEAN', 'COMBO'].includes(def?.[0])

function normalize(def, value) {
	if (
		['INT', 'FLOAT', 'NUMBER'].includes(def?.[0]) &&
		typeof value === 'string' &&
		value.trim() &&
		Number.isFinite(Number(value))
	)
		return Number(value)
	const options = Array.isArray(def?.[0]) ? def[0] : def?.[0] === 'COMBO' ? def[1]?.options : null
	if (options && !options.includes(value) && typeof value === 'string') {
		// Some extensions save "API_VALUE — translated label" but serialize the API value.
		const matches = options.filter((o) => typeof o === 'string' && value.startsWith(o + ' — '))
		if (matches.length === 1) return matches[0]
	}
	return value
}
function fits(def, value) {
	if (!def) return true // Explicit frontend-only widget still occupies a serialized slot.
	const [type, config = {}] = def
	const options = Array.isArray(type) ? type : type === 'COMBO' ? config.options : null
	if (options)
		return config.image_upload || config.video_upload || config.audio_upload
			? typeof value === 'string'
			: options.includes(value)
	if (type === 'STRING') return typeof value === 'string'
	if (type === 'BOOLEAN') return typeof value === 'boolean'
	if (['INT', 'FLOAT', 'NUMBER'].includes(type))
		return (
			typeof value === 'number' &&
			Number.isFinite(value) &&
			(type !== 'INT' || Number.isInteger(value)) &&
			(config.min === undefined || value >= config.min) &&
			(config.max === undefined || value <= config.max)
		)
	return true
}

/** Consume serialized slots, including linked widgets. Never slide values to a different field. */
export function readUiWidgets(node, info, linkedNames) {
	const defs = { ...info?.input?.required, ...info?.input?.optional }
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const values = node.widgets_values
	const explicit = inputs.filter((i) => i?.widget?.name)
	const names = explicit.length
		? explicit.map((i) => i.widget.name)
		: Object.keys(defs).filter((k) => scalar(defs[k]) && !defs[k]?.[1]?.forceInput)
	const result = {},
		warnings = []
	if (record(values)) {
		for (const name of new Set([...names, ...Object.keys(defs)])) {
			if (linkedNames.has(name) || !Object.hasOwn(values, name)) continue
			result[name] = normalize(defs[name], values[name])
		}
	} else if (Array.isArray(values)) {
		const decode = (includeLinked) => {
			let cursor = 0
			const decoded = {},
				errors = []
			for (const name of names) {
				if (!includeLinked && linkedNames.has(name)) continue
				const value = normalize(defs[name], values[cursor++])
				if (!linkedNames.has(name) && defs[name] && !fits(defs[name], value)) errors.push(name)
				if (
					!linkedNames.has(name) &&
					value !== undefined &&
					(defs[name] || inputs.some((i) => i.name === name && i.widget))
				)
					decoded[name] = value
				// control_after_generate isn't an API input. Older seed widgets omit the flag in object_info.
				if (
					(defs[name]?.[1]?.control_after_generate || /seed/.test(name)) &&
					controls.has(values[cursor])
				)
					cursor++
			}
			return { decoded, errors, remaining: Math.abs(values.length - cursor) }
		}
		const candidates = [decode(true), decode(false)].sort(
			(a, b) => a.errors.length + a.remaining - (b.errors.length + b.remaining)
		)
		Object.assign(result, candidates[0].decoded)
		if (
			Object.keys(defs).length &&
			names.some((name) => !linkedNames.has(name)) &&
			(candidates[0].errors.length || candidates[0].remaining)
		)
			warnings.push(
				`widget layout cannot be validated for ${node.type}[${node.id}]: ${candidates[0].errors.join(', ')}`
			)
	}
	for (const input of inputs) {
		if (
			record(input?.widget) &&
			Object.hasOwn(input.widget, 'value') &&
			!linkedNames.has(input.name)
		)
			result[input.name] = normalize(defs[input.name], input.widget.value)
	}
	// Only declared widgets are API values (upload/audioUI controls are not).
	for (const name of Object.keys(result)) {
		if (
			!defs[name] &&
			!inputs.some((i) => i.name === name && i.widget && !/upload|audioUI/i.test(name))
		)
			delete result[name]
		else if (defs[name] && !fits(defs[name], result[name])) {
			warnings.push(`invalid widget ${node.type}[${node.id}].${name}`)
			if (defs[name][1]?.default !== undefined) result[name] = defs[name][1].default
		}
	}
	return { inputs: result, warnings }
}
