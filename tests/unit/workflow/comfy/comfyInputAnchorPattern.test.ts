import { describe, it, expect } from 'vitest'

/**
 * 测试：FX5 扩展的 ComfyUI 输入锚点 ID 正则匹配规则
 * 兼容格式：in | in-0 | in-image | in-text | in-video | in-audio | in-model3d | in-resource
 * 不兼容：in-foo、out、in0 (无短横线)
 */
describe('FX5 - COMFY_INPUT_ANCHOR_PATTERN RegExp Compatibility', () => {
	const COMFY_INPUT_ANCHOR_PATTERN = /^in(-(text|image|video|audio|model3d|resource|[0-9]+))?$/

	it('should match legacy single anchor "in"', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in')).toBe(true)
	})

	it('should match legacy numeric anchors (in-0, in-1, in-99)', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-0')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-1')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-99')).toBe(true)
	})

	it('should match semantic media anchors (FX5 extension)', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-image')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-text')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-video')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-audio')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-model3d')).toBe(true)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-resource')).toBe(true)
	})

	it('should NOT match anchors with unknown suffix', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-foo')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-bar')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in-image-extra')).toBe(false)
	})

	it('should NOT match output anchor prefix', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('out')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('out-0')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('out-image')).toBe(false)
	})

	it('should NOT match malformed ids (no dash for suffix)', () => {
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('in0')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('inimage')).toBe(false)
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('In')).toBe(false) // case sensitive
		expect(COMFY_INPUT_ANCHOR_PATTERN.test('IN')).toBe(false)
	})
})
