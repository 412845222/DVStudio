import { isSocket } from './historyCatalog.mjs'

export function bindingKey(mapping) {
	return `${mapping.nodeId}:${mapping.inputKey}`
}

// Classify individual fields and follow STRING/conditioning connections. Text contents
// are user data; words such as "negative" in a positive prompt do not define its role.
export function refineTextMappings(graph, info) {
	const consumers = new Map()
	for (const [id, node] of Object.entries(graph)) {
		for (const [key, value] of Object.entries(node.inputs)) {
			if (!isSocket(value)) continue
			const source = String(value[0])
			if (!consumers.has(source)) consumers.set(source, [])
			consumers.get(source).push({ id, key })
		}
	}
	const roleFromKey = (key) =>
		/negative|neg_prompt|cond_negative/i.test(key)
			? 'negative'
			: /positive|pos_prompt|cond_positive/i.test(key)
				? 'positive'
				: null
	const rolesFor = (id, seen = new Set()) => {
		if (seen.has(id)) return new Set()
		seen.add(id)
		const roles = new Set()
		for (const c of consumers.get(id) || []) {
			const role = roleFromKey(c.key)
			if (role) roles.add(role)
			else for (const inherited of rolesFor(c.id, seen)) roles.add(inherited)
		}
		return roles
	}
	const textNodes = { positive: [], negative: [] }
	const seen = new Set()
	for (const item of [...(info.textNodes?.positive || []), ...(info.textNodes?.negative || [])]) {
		for (const key of item.allTextKeys || [item.inputKey]) {
			const id = `${item.nodeId}:${key}`
			if (seen.has(id) || typeof graph[item.nodeId]?.inputs[key] !== 'string') continue
			seen.add(id)
			const roles = rolesFor(String(item.nodeId))
			const explicit = roleFromKey(key)
			const role =
				explicit ||
				(roles.size === 1
					? [...roles][0]
					: /negative|负/i.test(item.title || '')
						? 'negative'
						: 'positive')
			textNodes[role].push({
				...item,
				inputKey: key,
				allTextKeys: [key],
				ambiguous: !explicit && roles.size > 1
			})
		}
	}
	return {
		...info,
		textNodes,
		positiveTextCount: textNodes.positive.length,
		negativeTextCount: textNodes.negative.length,
		textNodeCount: seen.size,
		hasTextPrompt: seen.size > 0
	}
}

export function bindUploadedFiles(graph, mappings, files) {
	const targets = { image: mappings.imageInputs || [], video: mappings.videoInputs || [] }
	const cursors = { image: 0, video: 0 }
	const assigned = new Set()
	for (const file of files) {
		const choices = targets[file.mediaType]
		if (!choices) throw new Error('UNSUPPORTED_INPUT_BINDING: ' + file.mediaType)
		const target = file.bindingId
			? choices.find((m) => bindingKey(m) === file.bindingId)
			: choices[cursors[file.mediaType]++]
		if (!target)
			throw new Error('INVALID_INPUT_BINDING: 无匹配的输入字段，请刷新模板或检查输入数量')
		const key = bindingKey(target)
		const node = graph[target.nodeId]
		if (
			assigned.has(key) ||
			!node ||
			!Object.hasOwn(node.inputs, target.inputKey) ||
			isSocket(node.inputs[target.inputKey])
		) {
			throw new Error('INVALID_INPUT_BINDING: ' + key)
		}
		assigned.add(key)
		node.inputs[target.inputKey] = file.path
	}
}

export function bindText(graph, mappings, overrides) {
	const details = { positive: [], negative: [] }
	for (const role of ['positive', 'negative']) {
		const field = `${role}Prompt`
		if (overrides[field] === undefined) continue
		const text = String(overrides[field])
		const targets = mappings.textNodes?.[role] || []
		if (!targets.length && text) throw new Error(`INVALID_INPUT_BINDING: 没有${role}文本输入字段`)
		for (const target of targets) {
			if (target.ambiguous)
				throw new Error(
					'INVALID_INPUT_BINDING: 文本源同时连接正向与负向分支，请在 ComfyUI 中拆分文本源'
				)
			const node = graph[target.nodeId]
			for (const key of target.allTextKeys?.length ? target.allTextKeys : [target.inputKey]) {
				if (!node || typeof node.inputs[key] !== 'string' || isSocket(node.inputs[key])) {
					throw new Error(`INVALID_INPUT_BINDING: ${target.nodeId}:${key}`)
				}
				node.inputs[key] = text
				details[role].push({ nodeId: target.nodeId, classType: target.classType, key })
			}
		}
	}
	return {
		mappingsUsed: true,
		positivePromptProvided: overrides.positivePrompt !== undefined,
		negativePromptProvided: overrides.negativePrompt !== undefined,
		positiveMappingCount: mappings.textNodes?.positive?.length || 0,
		negativeMappingCount: mappings.textNodes?.negative?.length || 0,
		positiveWriteCount: details.positive.length,
		negativeWriteCount: details.negative.length,
		fallbackRan: false,
		writtenDetails: details
	}
}
