import { describe, it, expect, vi, beforeEach } from 'vitest'

// Dynamic import for ESM module
let parseToolCallsFromText: (
	text: string
) => Array<{ id: string; name: string; arguments: Record<string, unknown> }>

beforeEach(async () => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
	const mod = await import('@electron/backend/modules/agent/providers/toolOutputParser.mjs')
	parseToolCallsFromText = mod.parseToolCallsFromText
})

describe('toolOutputParser', () => {
	describe('parseToolCallsFromText', () => {
		it('returns empty array for null/undefined/non-string input', () => {
			expect(parseToolCallsFromText(null as any)).toEqual([])
			expect(parseToolCallsFromText(undefined as any)).toEqual([])
			expect(parseToolCallsFromText(123 as any)).toEqual([])
			expect(parseToolCallsFromText({} as any)).toEqual([])
		})

		it('returns empty array for plain text without tool calls', () => {
			expect(parseToolCallsFromText('Hello, how can I help you?')).toEqual([])
			expect(parseToolCallsFromText('')).toEqual([])
		})

		it('parses single tool call correctly', () => {
			const text = `Let me create a node for you.
<|FunctionCallBegin|>[{"name": "create_node", "parameters": {"nodeType": "text", "title": "Hello"}}]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('create_node')
			expect(result[0].arguments).toEqual({ nodeType: 'text', title: 'Hello' })
			expect(result[0].id).toMatch(/^call_/)
		})

		it('parses multiple tool calls in one block', () => {
			const text = `<|FunctionCallBegin|>[
        {"name": "create_node", "parameters": {"nodeType": "text"}},
        {"name": "get_blueprint_state", "parameters": {}}
      ]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(2)
			expect(result[0].name).toBe('create_node')
			expect(result[1].name).toBe('get_blueprint_state')
		})

		it('handles whitespace around JSON', () => {
			const text = `<|FunctionCallBegin|>
        [
          {"name": "list_nodes", "parameters": {}}
        ]
      <|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('list_nodes')
		})

		it('handles string parameters', () => {
			const text = `<|FunctionCallBegin|>[{"name": "test", "parameters": "{\\"key\\":\\"value\\"}"}]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('test')
			expect(result[0].arguments).toEqual({ key: 'value' })
		})

		it('returns empty array for invalid JSON', () => {
			const text = `<|FunctionCallBegin|>not json<|FunctionCallEnd|>`
			expect(parseToolCallsFromText(text)).toEqual([])
		})

		it('returns empty array for non-array JSON', () => {
			const text = `<|FunctionCallBegin|>{"name": "test"}<|FunctionCallEnd|>`
			expect(parseToolCallsFromText(text)).toEqual([])
		})

		it('filters out calls with empty name', () => {
			const text = `<|FunctionCallBegin|>[{"name": "", "parameters": {}}, {"name": "valid", "parameters": {}}]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('valid')
		})

		it('handles tool call with no parameters field', () => {
			const text = `<|FunctionCallBegin|>[{"name": "get_state"}]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('get_state')
			expect(result[0].arguments).toEqual({})
		})

		it('handles text before and after tool call', () => {
			const text = `I'll help you with that.
<|FunctionCallBegin|>[{"name": "delete_node", "parameters": {"nodeId": "node123"}}]<|FunctionCallEnd|>
The node has been deleted.`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('delete_node')
			expect(result[0].arguments).toEqual({ nodeId: 'node123' })
		})

		it('handles invalid string parameters gracefully', () => {
			const text = `<|FunctionCallBegin|>[{"name": "test", "parameters": "not valid json"}]<|FunctionCallEnd|>`
			const result = parseToolCallsFromText(text)
			expect(result).toHaveLength(1)
			expect(result[0].arguments).toEqual({ _raw: 'not valid json' })
		})
	})
})
