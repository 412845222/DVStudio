/**
 * CLI 工具输出解析器
 *
 * 从 CLI 模型输出文本中解析 <|FunctionCallBegin|>...<|FunctionCallEnd|> 包裹的工具调用 JSON。
 */

const TOOL_CALL_REGEX = /<\|FunctionCallBegin\|>\s*(\[[\s\S]*?\])\s*<\|FunctionCallEnd\|>/

/**
 * 从完整输出文本中解析工具调用
 * @param {string} text - 模型输出的完整文本
 * @returns {Array<{id: string, name: string, arguments: object}>}
 */
export function parseToolCallsFromText(text) {
	if (!text || typeof text !== 'string') return []

	const match = text.match(TOOL_CALL_REGEX)
	if (!match) return []

	try {
		const jsonStr = match[1].trim()
		const calls = JSON.parse(jsonStr)
		if (!Array.isArray(calls)) return []

		return calls
			.map((call, i) => ({
				id: `call_${Date.now()}_${i}`,
				name: String(call.name || ''),
				arguments: safeParseArgs(call.parameters)
			}))
			.filter((c) => c.name)
	} catch {
		return []
	}
}

function safeParseArgs(args) {
	if (!args) return {}
	if (typeof args === 'object') return args
	if (typeof args === 'string') {
		try {
			return JSON.parse(args)
		} catch {
			return { _raw: args }
		}
	}
	return {}
}
