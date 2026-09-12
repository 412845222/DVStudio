import { isSocket, isRecord } from './historyCatalog.mjs'

export function executionGraph(graph, info) {
	const roots = Object.keys(graph).filter((id) => info?.[graph[id].class_type]?.output_node)
	if (!roots.length) return graph
	const active = new Set()
	const visit = (id) => {
		if (active.has(id) || !graph[id]) return
		active.add(id)
		for (const value of Object.values(graph[id].inputs))
			if (isSocket(value)) visit(String(value[0]))
	}
	roots.forEach(visit)
	return Object.fromEntries(Object.entries(graph).filter(([id]) => active.has(id)))
}

/** Structural validation before upload/POST; ComfyUI still validates files and model availability. */
export function validatePromptInputs(graph, info) {
	if (!isRecord(info) || !Object.keys(info).length) return []
	const errors = []
	for (const [id, node] of Object.entries(graph)) {
		const schema = info[node.class_type]
		if (!schema) {
			errors.push(`${node.class_type}[${id}]: 当前服务未安装该节点`)
			continue
		}
		for (const key of Object.keys(schema.input?.required || {})) {
			const def = schema.input.required[key]
			if (def?.[0] === 'COMFY_AUTOGROW_V3') {
				const count = Object.keys(node.inputs).filter((k) => k.startsWith(key + '.')).length
				if (count < (def[1]?.template?.min ?? 0))
					errors.push(`${node.class_type}[${id}].${key}: 动态输入数量不足`)
				continue
			}
			if (!Object.hasOwn(node.inputs, key))
				errors.push(`${node.class_type}[${id}].${key}: 缺少必填参数`)
		}
		const defs = { ...schema.input?.required, ...schema.input?.optional }
		for (const [key, value] of Object.entries(node.inputs)) {
			if (isSocket(value)) continue
			const def = defs[key]
			if (!Array.isArray(def)) continue
			const [type, config = {}] = def
			const choices = Array.isArray(type) ? type : type === 'COMBO' ? config.options : null
			let valid = true
			if (choices && !config.image_upload && !config.video_upload && !config.audio_upload)
				valid = choices.includes(value)
			if (['INT', 'FLOAT', 'NUMBER'].includes(type))
				valid =
					typeof value === 'number' &&
					Number.isFinite(value) &&
					(type !== 'INT' || Number.isInteger(value)) &&
					(config.min === undefined || value >= config.min) &&
					(config.max === undefined || value <= config.max)
			if (type === 'BOOLEAN') valid = typeof value === 'boolean'
			if (type === 'STRING') valid = typeof value === 'string'
			if (!valid) errors.push(`${node.class_type}[${id}].${key}: 参数类型、枚举或范围不匹配`)
		}
	}
	return errors
}
