type Port = {
	id?: string
	label?: string
	name?: string
	mediaType?: string
	acceptedMediaTypes?: string[]
}
type Node = {
	type?: string
	inputs?: Port[]
	outputs?: Port[]
	textValue?: string
	prompt?: string
	rotatePromptText?: string
	mergedText?: string
	sceneUnderstandingSettings?: { outputJson?: string }
}
type Edge = { fromNodeId?: string; fromAnchorId?: string; toNodeId?: string; toAnchorId?: string }
export type ComfyPromptInputs = {
	positive: string[]
	negative: string[]
	positiveConnected: boolean
	negativeConnected: boolean
}
/** Older saved ComfyUI ports lack acceptedMediaTypes/multiInput. Their canonical input still accepts text. */
export function collectComfyPromptInputs(options: {
	nodeId: string
	nodesById: Record<string, unknown>
	edgesById: Record<string, unknown>
	edgeOrder: string[]
	resolveText?: (id: string, visited?: Set<string>, anchorId?: string) => string
}): ComfyPromptInputs {
	const result: ComfyPromptInputs = {
		positive: [],
		negative: [],
		positiveConnected: false,
		negativeConnected: false
	}
	const node = options.nodesById[options.nodeId] as Node | undefined
	if (!node) return result
	for (const id of options.edgeOrder) {
		const edge = options.edgesById[id] as Edge | undefined
		if (!edge || edge.toNodeId !== options.nodeId || !edge.fromNodeId) continue
		const anchor = node.inputs?.find((a) => a.id === edge.toAnchorId)
		if (!anchor) continue
		const canonical =
			node.type === 'comfyui' &&
			(!anchor.mediaType || ['generic', 'text'].includes(anchor.mediaType)) &&
			['in', 'in-0', 'in-resource', 'in-text'].includes(anchor.id || '')
		if (!(canonical || anchor.mediaType === 'text' || anchor.acceptedMediaTypes?.includes('text')))
			continue
		const source = options.nodesById[edge.fromNodeId] as Node | undefined
		if (!source) throw new Error('ComfyUI 文本输入节点已不存在: ' + edge.fromNodeId)
		const output = source.outputs?.find((a) => a.id === edge.fromAnchorId)
		// Never mistake image/video node descriptions or chat drafts for text output.
		const textSource =
			output?.mediaType === 'text' ||
			source.type === 'text' ||
			(!output?.mediaType &&
				['text-merge', 'rotate-image', 'scene-understanding'].includes(source.type || ''))
		if (!textSource) continue
		const role = /negative|neg_prompt|negprompt|反向|负面|负向/i.test(
			`${anchor.id} ${anchor.name || anchor.label || ''}`
		)
			? 'negative'
			: 'positive'
		result[role === 'positive' ? 'positiveConnected' : 'negativeConnected'] = true
		const fallback =
			source.type === 'rotate-image'
				? source.rotatePromptText
				: source.type === 'scene-understanding'
					? source.sceneUnderstandingSettings?.outputJson
					: (source.textValue ?? source.mergedText ?? source.prompt)
		const text = options.resolveText
			? options.resolveText(edge.fromNodeId, undefined, edge.fromAnchorId)
			: fallback
		result[role].push(String(text ?? ''))
	}
	return result
}
/** A connected empty string explicitly clears the template; no connection keeps configured/template defaults. */
export function comfyPromptOverride(
	connected: boolean,
	texts: string[],
	configured: string,
	edited?: boolean
): string | undefined {
	if (connected) return texts.join('\n\n')
	return configured || edited ? configured : undefined
}
