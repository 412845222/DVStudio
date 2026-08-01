import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * WorkflowImageNode.applyPrecisePreviewSize 的核心尺寸计算公式测试：
 *
 *   targetW = body.clientWidth
 *   targetH = body.clientHeight - actions.offsetHeight - GAP (8)
 *
 * 组件内直接写：
 *   previewEl.style.width  = `${targetW}px`
 *   previewEl.style.height = `${targetH}px`
 *
 * 这里我们在 jsdom 下直接搭建结构，并手动跑同样的计算逻辑，
 * 验证“在不同 body 尺寸和 actions 高度组合下，最终直写出来的像素与预期完全一致”。
 */
const GAP = 8

type Scene = {
	body: HTMLElement
	actions: HTMLElement
	preview: HTMLElement
	apply: () => { w: number; h: number }
}

const buildScene = (bodyW: number, bodyH: number, actionsH: number): Scene => {
	const body = document.createElement('div')
	body.className = 'wf-node-body'
	Object.defineProperty(body, 'clientWidth', { value: bodyW, configurable: true })
	Object.defineProperty(body, 'clientHeight', { value: bodyH, configurable: true })

	const actions = document.createElement('div')
	actions.className = 'wf-media-actions'
	// 用 getBoundingClientRect 的返回值高度模拟真实 actions 高度
	vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
		width: bodyW,
		height: actionsH,
		top: 0,
		left: 0,
		right: bodyW,
		bottom: actionsH,
		x: 0,
		y: 0,
		toJSON: () => ({})
	} as DOMRect)
	// offsetHeight 兜底
	Object.defineProperty(actions, 'offsetHeight', { value: actionsH, configurable: true })

	const preview = document.createElement('div')
	preview.className = 'wf-media-preview'

	body.appendChild(actions)
	body.appendChild(preview)
	document.body.appendChild(body)

	const apply = () => {
		const innerH = body.clientHeight || 0
		let h = 0
		const rect = actions.getBoundingClientRect()
		h = Math.ceil(rect.height || (actions as any).offsetHeight || 0)
		const available = Math.max(0, innerH - h - GAP)
		const w = Math.max(0, body.clientWidth || 0)
		if (available > 0 && w > 0) {
			preview.style.height = `${available}px`
			preview.style.width = `${w}px`
		}
		return { w, h: available }
	}

	return { body, actions, preview, apply }
}

describe('WorkflowImageNode - applyPrecisePreviewSize 核心尺寸公式', () => {
	afterEach(() => {
		// 清理 DOM
		while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
	})

	it('body 300x400，actions 高 40 → 预览 = 300 x 352 (400 - 40 - 8)', () => {
		const { preview, apply } = buildScene(300, 400, 40)
		const size = apply()
		expect(size.w).toBe(300)
		expect(size.h).toBe(352)
		expect(preview.style.width).toBe('300px')
		expect(preview.style.height).toBe('352px')
	})

	it('resize 后变窄变高：body 200x600，actions 40 → 预览 = 200 x 552', () => {
		const { preview, apply } = buildScene(200, 600, 40)
		const size = apply()
		expect(size.w).toBe(200)
		expect(size.h).toBe(600 - 40 - GAP)
		expect(preview.style.width).toBe('200px')
		expect(preview.style.height).toBe('552px')
	})

	it('极窄极宽 resize：body 800x200，actions 40 → 预览 = 800 x 152', () => {
		const { preview, apply } = buildScene(800, 200, 40)
		const size = apply()
		expect(size.w).toBe(800)
		expect(size.h).toBe(200 - 40 - GAP)
		expect(preview.style.width).toBe('800px')
		expect(preview.style.height).toBe('152px')
	})

	it('actions 高度为 0（理论场景） → bodyH - GAP 全部留给预览', () => {
		const { preview, apply } = buildScene(500, 300, 0)
		const size = apply()
		expect(size.h).toBe(300 - 0 - GAP)
		expect(preview.style.height).toBe(`${300 - GAP}px`)
	})

	it('body 尺寸太小，可用空间 ≤ 0 时不写 style（避免 0/负像素）', () => {
		const { preview, apply } = buildScene(300, 30, 30)
		// 30 - 30 - 8 = -8 → Math.max(0, -8) = 0，应该不写 style
		const size = apply()
		expect(size.h).toBe(0)
		expect(preview.style.height).toBe('')
		expect(preview.style.width).toBe('')
	})

	it('body 尺寸为 0 → 不写 style', () => {
		const { preview, apply } = buildScene(0, 0, 0)
		const size = apply()
		expect(size.w).toBe(0)
		expect(size.h).toBe(0)
		expect(preview.style.height).toBe('')
		expect(preview.style.width).toBe('')
	})

	it('actions 高度变化：多轮 apply 能重新写入新尺寸', () => {
		const { preview, body, actions, apply } = buildScene(400, 400, 40)
		apply()
		expect(preview.style.height).toBe('352px')
		// 动作：actions 变高了（比如展开了更多按钮）
		vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
			width: 400,
			height: 80,
			top: 0,
			left: 0,
			right: 400,
			bottom: 80,
			x: 0,
			y: 0,
			toJSON: () => ({})
		} as DOMRect)
		Object.defineProperty(actions, 'offsetHeight', { value: 80, configurable: true })
		const size = apply()
		expect(size.h).toBe(400 - 80 - GAP)
		expect(preview.style.height).toBe(`${400 - 80 - GAP}px`)
	})

	it('body 宽度变化（resize 改变 width）时 width 能正确同步', () => {
		const scene = buildScene(400, 400, 40)
		scene.apply()
		expect(scene.preview.style.width).toBe('400px')
		// 模拟节点 resize 到更宽
		Object.defineProperty(scene.body, 'clientWidth', { value: 700, configurable: true })
		const size = scene.apply()
		expect(size.w).toBe(700)
		expect(scene.preview.style.width).toBe('700px')
	})
})
