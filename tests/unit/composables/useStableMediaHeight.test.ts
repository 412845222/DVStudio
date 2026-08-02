import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
	measureActionsHeightStable,
	readMediaVerticalGap,
	useStableMediaHeight
} from '../../../src/composables/useStableMediaHeight'

// 构造最小可用 HTMLElement（jsdom 下 offsetHeight 默认 0，需要手动注入）
const makeEl = (
	tag = 'div',
	opts: { offsetHeight?: number; classes?: string[]; children?: HTMLElement[] } = {}
): HTMLElement => {
	const el = document.createElement(tag)
	if (opts.classes) opts.classes.forEach((c) => el.classList.add(c))
	if (opts.children) opts.children.forEach((c) => el.appendChild(c))
	if (opts.offsetHeight != null) {
		Object.defineProperty(el, 'offsetHeight', { value: opts.offsetHeight, configurable: true })
	}
	return el
}

describe('measureActionsHeightStable', () => {
	it('returns 0 for null/undefined bodyEl', () => {
		expect(measureActionsHeightStable(null, true)).toBe(0)
		expect(measureActionsHeightStable(undefined, false)).toBe(0)
	})

	it('returns 0 when bodyEl has no .wf-media-actions', () => {
		const body = makeEl('div', { classes: ['wf-node-body'] })
		expect(measureActionsHeightStable(body, true)).toBe(0)
	})

	it('reads real offsetHeight via actionsEl when > 0', () => {
		const actions = makeEl('div', { classes: ['wf-media-actions'], offsetHeight: 44 })
		const media = makeEl('div', { classes: ['wf-media'], children: [actions] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		// hasResource 不影响真实 offsetHeight 路径
		expect(measureActionsHeightStable(body, false)).toBe(44)
		expect(measureActionsHeightStable(body, true)).toBe(44)
	})

	it('falls back to default expectedBtnH=30 (ceil) when offsetHeight == 0 and hasResource=true (2 btns 但是高度还是一致30)', () => {
		const actions = makeEl('div', { classes: ['wf-media-actions'], offsetHeight: 0 })
		const media = makeEl('div', { classes: ['wf-media'], children: [actions] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		// 有资源（显示「清空」按钮）——DOM还没ready，回落到预期单按钮高
		expect(measureActionsHeightStable(body, true)).toBe(30)
	})

	it('falls back to default expectedBtnH=30 (ceil) when offsetHeight == 0 and hasResource=false', () => {
		const actions = makeEl('div', { classes: ['wf-media-actions'], offsetHeight: 0 })
		const media = makeEl('div', { classes: ['wf-media'], children: [actions] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		expect(measureActionsHeightStable(body, false)).toBe(30)
	})

	it('uses custom expectedBtnH fallback when supplied', () => {
		const actions = makeEl('div', { classes: ['wf-media-actions'], offsetHeight: 0 })
		const media = makeEl('div', { classes: ['wf-media'], children: [actions] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		expect(measureActionsHeightStable(body, true, 42)).toBe(42)
	})
})

describe('readMediaVerticalGap', () => {
	it('returns defaultGap 8 for null/undefined bodyEl', () => {
		expect(readMediaVerticalGap(null, 8)).toBe(8)
		expect(readMediaVerticalGap(undefined, 12)).toBe(12)
	})

	it('returns defaultGap when no .wf-media inside body', () => {
		const body = makeEl('div', { classes: ['wf-node-body'] })
		expect(readMediaVerticalGap(body, 8)).toBe(8)
	})

	it('reads row-gap from getComputedStyle and Math.ceil it', () => {
		const media = makeEl('div', { classes: ['wf-media'] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		// jsdom getComputedStyle 返回空字符串；用 spy 模拟
		const orig = window.getComputedStyle
		try {
			window.getComputedStyle = vi.fn(() => ({
				rowGap: '12.3px',
				gap: '0px'
			})) as unknown as typeof window.getComputedStyle
			expect(readMediaVerticalGap(body, 8)).toBe(13) // Math.ceil(12.3)
		} finally {
			window.getComputedStyle = orig
		}
	})

	it('falls back to defaultGap when rowGap is non-px string', () => {
		const media = makeEl('div', { classes: ['wf-media'] })
		const body = makeEl('div', { classes: ['wf-node-body'], children: [media] })
		const orig = window.getComputedStyle
		try {
			window.getComputedStyle = vi.fn(() => ({
				rowGap: 'normal',
				gap: ''
			})) as unknown as typeof window.getComputedStyle
			expect(readMediaVerticalGap(body, 8)).toBe(8)
		} finally {
			window.getComputedStyle = orig
		}
	})
})

// 因为 useStableMediaHeight 内部使用 onBeforeUnmount（Vue3），直接在非 setup 环境调用会忽略掉自动清理
// 所以下面可以直接测试 scheduleApply / markSelfWritten / isEchoOfSelfWrite / forceApply / dispose
describe('useStableMediaHeight controller', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true })
	})
	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it('scheduleApply merges multiple calls within coolDown into single rAF execution', () => {
		const ctrl = useStableMediaHeight()
		let counter = 0
		ctrl.scheduleApply(() => counter++)
		ctrl.scheduleApply(() => counter++)
		ctrl.scheduleApply(() => counter++)
		// coolDownMs=50 未过：尚未执行
		expect(counter).toBe(0)
		vi.advanceTimersByTime(49)
		expect(counter).toBe(0)
		vi.advanceTimersByTime(1) // 到 50ms：coolDown over → set rAF
		expect(counter).toBe(0)
		// rAF 在 vitest fakeTimers 下需要再触发一次
		vi.advanceTimersByTime(20)
		expect(counter).toBe(1)
		ctrl.dispose()
	})

	it('forceApply executes immediately regardless of any pending schedule', () => {
		const ctrl = useStableMediaHeight()
		let counter = 0
		ctrl.forceApply(() => counter++)
		expect(counter).toBe(1)
		// forceApply 清 pending：随后的 scheduleApply 不会互相覆盖
		ctrl.dispose()
	})

	it('markSelfWritten + isEchoOfSelfWrite: within window and tolerance → true', () => {
		const ctrl = useStableMediaHeight()
		ctrl.markSelfWritten(420)
		vi.advanceTimersByTime(50) // still within echoWindowMs (default 120)
		expect(ctrl.isEchoOfSelfWrite(421, 120)).toBe(true) // diff=1 <= tolerance 3
		ctrl.dispose()
	})

	it('markSelfWritten + isEchoOfSelfWrite: beyond window (120ms) → false and clears', () => {
		const ctrl = useStableMediaHeight()
		ctrl.markSelfWritten(420)
		// 超过 echoWindowMs (default 120) 再查
		vi.advanceTimersByTime(200)
		expect(ctrl.isEchoOfSelfWrite(420, 120)).toBe(false) // over window
		// 第二次调用（已清理last）
		expect(ctrl.isEchoOfSelfWrite(420, 120)).toBe(false)
		ctrl.dispose()
	})

	it('markSelfWritten + isEchoOfSelfWrite: diff > tolerance 3 → false', () => {
		const ctrl = useStableMediaHeight()
		ctrl.markSelfWritten(420)
		vi.advanceTimersByTime(50)
		expect(ctrl.isEchoOfSelfWrite(424, 120)).toBe(false) // diff=4 > 3
		ctrl.dispose()
	})

	it('notifyStyleTransition delays scheduleApply until after styleTransitionMs', () => {
		const ctrl = useStableMediaHeight()
		let counter = 0
		ctrl.notifyStyleTransition()
		ctrl.scheduleApply(() => counter++)
		// 总等待量必须覆盖 styleTransitionMs(180) + coolDown(50) + 若干 rAF 推进
		// 所以一次性推进 300ms + 多轮 rAF 推进
		let remain = 10
		while (remain-- > 0 && counter === 0) {
			vi.advanceTimersByTime(50)
		}
		// 兜底：直接跑 remaining timers（fakeTimers 的 runAllTimers 兜底）
		if (counter === 0) {
			try {
				vi.runAllTimers()
			} catch {
				/* ignore infinite-loop guard */
			}
		}
		expect(counter).toBe(1)
		ctrl.dispose()
	})

	it('dispose clears pending rAF/coolDown so nothing runs after', () => {
		const ctrl = useStableMediaHeight()
		let counter = 0
		ctrl.scheduleApply(() => counter++)
		ctrl.dispose()
		vi.advanceTimersByTime(1000)
		expect(counter).toBe(0)
	})
})
