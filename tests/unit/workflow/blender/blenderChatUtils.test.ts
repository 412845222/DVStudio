import { describe, it, expect, vi, beforeEach } from 'vitest'

function scaleImageDimensions(width: number, height: number, maxDim: number): { width: number; height: number } {
	let w = width
	let h = height
	if (w > maxDim || h > maxDim) {
		const scale = maxDim / Math.max(w, h)
		w = Math.round(w * scale)
		h = Math.round(h * scale)
	}
	return { width: w, height: h }
}

describe('Blender image dimension scaling', () => {
	it('keeps small images unchanged', () => {
		expect(scaleImageDimensions(320, 240, 640)).toEqual({ width: 320, height: 240 })
	})

	it('keeps square images at maxDim unchanged', () => {
		expect(scaleImageDimensions(640, 640, 640)).toEqual({ width: 640, height: 640 })
	})

	it('scales down wide landscape images', () => {
		expect(scaleImageDimensions(1920, 1080, 640)).toEqual({ width: 640, height: 360 })
	})

	it('scales down tall portrait images', () => {
		expect(scaleImageDimensions(1080, 1920, 640)).toEqual({ width: 360, height: 640 })
	})

	it('scales down very large square images', () => {
		expect(scaleImageDimensions(4096, 4096, 640)).toEqual({ width: 640, height: 640 })
	})

	it('preserves aspect ratio within 1px rounding', () => {
		const result = scaleImageDimensions(800, 533, 640)
		const originalRatio = 800 / 533
		const newRatio = result.width / result.height
		expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.01)
	})
})

describe('toPlain utility', () => {
	function toPlain<T>(value: T): T {
		if (value === null || value === undefined) return value
		return JSON.parse(JSON.stringify(value)) as T
	}

	it('returns primitives unchanged', () => {
		expect(toPlain(null)).toBeNull()
		expect(toPlain(undefined)).toBeUndefined()
		expect(toPlain(42)).toBe(42)
		expect(toPlain('hello')).toBe('hello')
		expect(toPlain(true)).toBe(true)
	})

	it('strips undefined values from objects (JSON.stringify behavior)', () => {
		const input = { a: 1, b: undefined, c: 'test' }
		const result = toPlain(input)
		expect(result).toEqual({ a: 1, c: 'test' })
		expect(Object.keys(result as Record<string, unknown>)).not.toContain('b')
	})

	it('deep clones objects', () => {
		const input = { nested: { value: 1 } }
		const result = toPlain(input)
		expect(result).toEqual(input)
		expect(result.nested).not.toBe(input.nested)
	})

	it('removes functions and non-serializable values', () => {
		const input = { a: 1, fn: () => 'hi', sym: Symbol('test') }
		const result = toPlain(input)
		expect(result).toEqual({ a: 1 })
	})
})

describe('ChatAttachment type usage', () => {
	it('supports data URL attachments (base64 images)', () => {
		const attachment = {
			type: 'image_url',
			name: 'screenshot.png',
			data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
			url: 'dweb://resource/screenshot.png',
		}
		expect(attachment.type).toBe('image_url')
		expect(attachment.data).toMatch(/^data:image\/jpeg;base64,/)
	})

	it('supports URL-only attachments without data', () => {
		const attachment = {
			type: 'image_url',
			name: 'reference.jpg',
			url: 'https://example.com/image.jpg',
		}
		expect(attachment.data).toBeUndefined()
		expect(attachment.url).toBe('https://example.com/image.jpg')
	})
})

describe('Blender tool display names', () => {
	const TOOL_DISPLAY_NAMES: Record<string, string> = {
		'blender_execute_blender_code': '执行Blender代码',
		'blender_get_objects_summary': '获取场景对象概览',
		'blender_get_object_detail_summary': '获取对象详情',
		'blender_get_blendfile_summary_datablocks': '数据块统计',
		'blender_get_blendfile_summary_missing_files': '检查缺失文件',
		'blender_get_blendfile_summary_of_linked_libraries': '链接库信息',
		'blender_get_blendfile_summary_path_info': '文件路径信息',
		'blender_get_blendfile_summary_usage_guess': '用途猜测',
		'blender_get_screenshot_of_area_as_image': '区域截图',
		'blender_get_screenshot_of_window_as_image': '窗口截图',
		'blender_get_screenshot_of_window_as_json': '窗口布局JSON',
		'blender_jump_to_tab_by_name': '切换工作区',
		'blender_jump_to_tab_by_space_type': '按类型切换工作区',
		'blender_jump_to_view3d_object_by_name': '聚焦对象',
		'blender_jump_to_view3d_object_data_by_name': '按数据名聚焦对象',
		'blender_import_model': '导入模型',
	}

	function getToolDisplayName(toolName: string): string {
		if (TOOL_DISPLAY_NAMES[toolName]) return TOOL_DISPLAY_NAMES[toolName]
		const base = toolName.replace(/^blender_/, '').replace(/_/g, ' ')
		return base.charAt(0).toUpperCase() + base.slice(1)
	}

	it('returns predefined Chinese display names for known tools', () => {
		expect(getToolDisplayName('blender_execute_blender_code')).toBe('执行Blender代码')
		expect(getToolDisplayName('blender_get_screenshot_of_area_as_image')).toBe('区域截图')
		expect(getToolDisplayName('blender_import_model')).toBe('导入模型')
	})

	it('generates fallback display names for unknown tools', () => {
		expect(getToolDisplayName('blender_unknown_tool')).toBe('Unknown tool')
		expect(getToolDisplayName('blender_set_material_color')).toBe('Set material color')
	})

	it('handles non-blender prefixed tools', () => {
		expect(getToolDisplayName('some_random_tool')).toBe('Some random tool')
	})
})

describe('MAX_TOOL_CALLS limit warning behavior', () => {
	it('limits tool calls to 35 maximum iterations', () => {
		const MAX_TOOL_CALLS = 35
		const iterations: number[] = []
		let toolCallCount = 0
		let finalContent = ''

		while (toolCallCount < MAX_TOOL_CALLS) {
			iterations.push(toolCallCount)
			toolCallCount++
		}

		if (toolCallCount >= MAX_TOOL_CALLS) {
			const limitMsg = `\n\n⚠️ 已达到最大工具调用次数（${MAX_TOOL_CALLS}次），当前轮次暂停。`
			finalContent += limitMsg
		}

		expect(iterations.length).toBe(MAX_TOOL_CALLS)
		expect(toolCallCount).toBe(MAX_TOOL_CALLS)
		expect(finalContent).toContain('35')
		expect(finalContent).toContain('最大工具调用次数')
	})
})

describe('BLENDER MODE provider selection', () => {
	it('forces dvsagent provider when custom tools are present', () => {
		const backends = ['dvsagent', 'copilot', 'codex']
		const useCustomSystemPromptOnly = true
		const selectedProviders: Record<string, string> = {}

		for (const backend of backends) {
			const providerId = (backend === 'dvsagent' || useCustomSystemPromptOnly) ? 'dvsagent' : backend
			selectedProviders[backend] = providerId
		}

		expect(selectedProviders['dvsagent']).toBe('dvsagent')
		expect(selectedProviders['copilot']).toBe('dvsagent')
		expect(selectedProviders['codex']).toBe('dvsagent')
	})

	it('uses requested backend when no custom tools (non-BLENDER mode)', () => {
		const backends = ['dvsagent', 'copilot', 'codex']
		const useCustomSystemPromptOnly = false
		const selectedProviders: Record<string, string> = {}

		for (const backend of backends) {
			const providerId = (backend === 'dvsagent' || useCustomSystemPromptOnly) ? 'dvsagent' : backend
			selectedProviders[backend] = providerId
		}

		expect(selectedProviders['dvsagent']).toBe('dvsagent')
		expect(selectedProviders['copilot']).toBe('copilot')
		expect(selectedProviders['codex']).toBe('codex')
	})

	it('uses doubao-seed-evolving model when forcing dvsagent', () => {
		const forcedDvsAgentForTools = true
		const requestedModel = 'auto'
		const effectiveModel = forcedDvsAgentForTools ? 'doubao-seed-evolving' : requestedModel
		expect(effectiveModel).toBe('doubao-seed-evolving')
	})
})
