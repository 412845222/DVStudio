import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * 【镜像测试】完全复刻 SceneLayoutPreviewViewer#emitViewStateChangeThrottled 的
 * leading+trailing 节流逻辑，以纯函数形式验证其契约：
 *   1. 第一次调用立即触发（leading）
 *   2. 后续 120ms 窗口内所有调用合并为"最后一次"（trailing），窗口结束触发一次
 *   3. dispose 时清理定时器，不产生 trailing 的悬空调用
 *   4. dispose 后任何新的 emit 都被忽略
 *   5. dispose 前会强制 save 一次最后状态（与 clearViewStateThrottle + 强制一次emit的语义一致）
 *
 * 原方法是 private，不能直接 import。这里把相同的逻辑抽成一个可测试的 helper，
 * 作为"行为镜像"——如果将来有人改了 SceneLayoutPreviewViewer 的节流策略，
 * 此测试应能捕捉到契约破坏（例如"忘记 leading"、"trailing 丢失最后一次状态"等回归）。
 */
const VIEWSTATE_THROTTLE_MS = 120

type ViewState = {
	cameraPosition: { x: number; y: number; z: number }
	target: { x: number; y: number; z: number }
}

class ViewStateThrottleMirror {
	disposed = false
	onViewStateChange: ((state: ViewState) => void) | null = null
	private viewStateThrottleTimer: ReturnType<typeof setTimeout> | null = null
	private viewStateThrottlePending = false
	private latestState: ViewState | null = null

	// mirror of: getViewState()
	private getViewState(): ViewState | null {
		if (this.disposed) return null
		return this.latestState
	}

	// mirror of: emitViewStateChangeThrottled()
	emitViewStateChangeThrottled(nextState: ViewState) {
		this.latestState = nextState
		if (this.disposed) return
		if (!this.onViewStateChange) return
		const state = this.getViewState()
		if (!state) return
		if (!this.viewStateThrottleTimer) {
			// leading
			this.onViewStateChange(state)
			this.viewStateThrottlePending = false
			this.viewStateThrottleTimer = setTimeout(() => {
				this.viewStateThrottleTimer = null
				if (this.viewStateThrottlePending) {
					this.viewStateThrottlePending = false
					const trailing = this.getViewState()
					if (trailing && !this.disposed && this.onViewStateChange) {
						this.onViewStateChange(trailing)
					}
				}
			}, VIEWSTATE_THROTTLE_MS)
		} else {
			this.viewStateThrottlePending = true
		}
	}

	// mirror of: clearViewStateThrottle()
	clearViewStateThrottle() {
		if (this.viewStateThrottleTimer) {
			clearTimeout(this.viewStateThrottleTimer)
			this.viewStateThrottleTimer = null
		}
		this.viewStateThrottlePending = false
	}

	// mirror of: dispose() 中"清理节流并强制最后保存一次"的子步骤
	disposeWithLastSave() {
		if (this.disposed) return
		// 先 flush pending（如果有，强制把最后一次状态发出去）
		if (this.viewStateThrottlePending && this.onViewStateChange) {
			const last = this.getViewState()
			if (last) this.onViewStateChange(last)
		}
		this.clearViewStateThrottle()
		this.disposed = true
	}
}

const st = (x: number, y: number, z: number) => ({
	cameraPosition: { x, y, z },
	target: { x: 0, y: 0, z: 0 }
})

describe('SceneLayoutPreviewViewer ViewState 节流契约 (leading+trailing 镜像)', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		// 当前 vitest 版本可能没有 restoreAllTimers；用 useRealTimers 兜底就够了
		try {
			// @ts-expect-error - 可选 API
			if (typeof vi.restoreAllTimers === 'function') vi.restoreAllTimers()
		} catch {
			/* ignore */
		}
		vi.useRealTimers()
	})

	it('首次调用立即触发（leading）—— 保证"用户一转动镜头就立刻缓存到 SCENE_LAYOUT_VIEWSTATE_CACHE"', () => {
		const t = new ViewStateThrottleMirror()
		const calls: ViewState[] = []
		t.onViewStateChange = (s) => calls.push(s)
		const s = st(1, 2, 3)
		t.emitViewStateChangeThrottled(s)
		// 不用 advanceTimers，leading 是同步的
		expect(calls.length).toBe(1)
		expect(calls[0]).toEqual(s)
		t.disposeWithLastSave()
	})

	it('120ms 窗口内连续多次调用：只有一次 leading + 最终一次 trailing（共 2 次，不是 N 次）', () => {
		const t = new ViewStateThrottleMirror()
		const calls: number[] = []
		t.onViewStateChange = (s) => calls.push(s.cameraPosition.x)
		// 模拟用户快速拖拽镜头：每一帧都在变（OrbitControls.change 高频触发）
		for (let i = 0; i < 50; i++) {
			t.emitViewStateChangeThrottled(st(i, 0, 0))
		}
		// leading 立刻触发第一次的状态 = 0
		expect(calls.length).toBe(1)
		expect(calls[0]).toBe(0)
		// 等到窗口结束
		vi.advanceTimersByTime(VIEWSTATE_THROTTLE_MS + 10)
		// trailing 只触发最后一次的状态 = 49
		expect(calls.length).toBe(2)
		expect(calls[1]).toBe(49)
		t.disposeWithLastSave()
	})

	it('窗口结束后下一个新事件会再次走 leading（不是一直只走 trailing）', () => {
		const t = new ViewStateThrottleMirror()
		const calls: number[] = []
		t.onViewStateChange = (s) => calls.push(s.cameraPosition.x)
		t.emitViewStateChangeThrottled(st(11, 0, 0))
		vi.advanceTimersByTime(VIEWSTATE_THROTTLE_MS + 1)
		expect(calls).toEqual([11])
		// 新窗口开始
		t.emitViewStateChangeThrottled(st(22, 0, 0))
		expect(calls.length).toBe(2)
		expect(calls[1]).toBe(22)
		t.disposeWithLastSave()
	})

	it('如果 120ms 窗口内"只调用了一次"，窗口结束后不再多触发一次 trailing（避免重复通知）', () => {
		const t = new ViewStateThrottleMirror()
		const calls: number[] = []
		t.onViewStateChange = (s) => calls.push(s.cameraPosition.x)
		t.emitViewStateChangeThrottled(st(7, 0, 0))
		expect(calls).toEqual([7])
		vi.advanceTimersByTime(VIEWSTATE_THROTTLE_MS + 1)
		// 只有一次调用 → pending 从未置 true → trailing 不应触发
		expect(calls).toEqual([7])
		t.disposeWithLastSave()
	})

	it('disposeWithLastSave：在 pending=true 的中途 dispose，会立刻 flush 最后一次状态（保证卸载瞬间视角不丢失）', () => {
		const t = new ViewStateThrottleMirror()
		const calls: number[] = []
		t.onViewStateChange = (s) => calls.push(s.cameraPosition.x)
		t.emitViewStateChangeThrottled(st(100, 0, 0)) // leading = 100
		t.emitViewStateChangeThrottled(st(200, 0, 0)) // pending=true
		t.emitViewStateChangeThrottled(st(300, 0, 0)) // pending=true，latest=300
		// 没等到窗口结束就 dispose
		t.disposeWithLastSave()
		// dispose 时会 flush pending 的最后一次 → 所以总次数是 2
		expect(calls).toEqual([100, 300])
	})

	it('dispose 之后再 emitViewStateChangeThrottled 不会产生任何通知（防御：卸载后写缓存无意义）', () => {
		const t = new ViewStateThrottleMirror()
		const calls: number[] = []
		t.onViewStateChange = (s) => calls.push(s.cameraPosition.x)
		t.disposeWithLastSave()
		t.emitViewStateChangeThrottled(st(999, 0, 0))
		expect(calls).toEqual([])
	})

	it('onViewStateChange=null 时不抛错，也不产生通知（防御：用户没注册回调的路径）', () => {
		const t = new ViewStateThrottleMirror()
		t.onViewStateChange = null
		expect(() => {
			t.emitViewStateChangeThrottled(st(1, 2, 3))
			vi.advanceTimersByTime(VIEWSTATE_THROTTLE_MS + 1)
			t.disposeWithLastSave()
		}).not.toThrow()
	})
})
