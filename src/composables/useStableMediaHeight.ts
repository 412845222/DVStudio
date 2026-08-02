/**
 * useStableMediaHeight
 * ----------------------------------------------------
 * 媒体类节点（图片/视频/旋转图片等）预览容器高度稳定计算 composable。
 *
 * 职责：
 *  1. rAF 防抖调度：合并一帧内多次高度计算请求，只在最后一次 rAF 回调中真正执行
 *  2. 样式切换冷却期：selected / running / error 等 class 变化时跳过动画过渡期的不稳定测量
 *  3. 自写高度追踪：打破「UI 直写 style.height → ResizeObserver 捕获 → emit(auto-resize)
 *     → 引擎下发 height prop → watch 再次 apply 」形成的双向闭环
 *  4. 稳定尺寸测量：优先使用 offsetHeight（不受 zoom/CSS transform 影响），并提供 DOM 未就绪时的预判兜底
 *
 * 设计原则：
 *  - 纯 Vue 渲染进程 composable，不依赖任何 Electron 主进程 / 预加载 API
 *  - 不侵入引擎层；通过标记和时间窗比较在 UI 组件层内部消除回声
 *  - 异常兜底：出错时可退化到「直接执行」模式，永不阻塞业务逻辑
 *
 * 使用示例（在 WorkflowImageNode 等组件中）：
 *
 *   const stable = useStableMediaHeight()
 *   // 代替直接调用 applyPrecisePreviewSize()：
 *   stable.scheduleApply(applyPrecisePreviewSize)
 *   // 每次 DOM 直写完成后：
 *   stable.markSelfWritten(estimatedNodeTotalH)
 *   // 在 watch([props.height, ...]) 开头判断：
 *   if (stable.isEchoOfSelfWrite(props.height, estimatedHeaderFooterH)) return
 *   // 样式将要变化时（例如 watch(selected)）：
 *   stable.notifyStyleTransition()
 *   // 组件卸载：
 *   onBeforeUnmount(() => stable.dispose())
 */
import { onBeforeUnmount } from 'vue'

export interface StableHeightController {
	/** 调度一次高度重新计算（rAF 防抖 + 冷却期合并） */
	scheduleApply: (fn: () => void) => void
	/** 强制立即执行一次（绕过防抖，用于首次挂载） */
	forceApply: (fn: () => void) => void
	/** 通知控制器：刚刚写过一次 DOM 高度，用于闭环回声判断 */
	markSelfWritten: (estimatedNodeTotalH: number) => void
	/** 判断本次引擎回传的 height 是否只是自己刚写入的回声；如是则应跳过 */
	isEchoOfSelfWrite: (propsHeight: number, estimatedHeaderAndFooterH: number) => boolean
	/** 通知：样式类即将变化（进入冷却期，冷却期内 scheduleApply 会推迟执行） */
	notifyStyleTransition: () => void
	/** 销毁：清 rAF / 定时器 */
	dispose: () => void
}

interface UseStableMediaHeightOptions {
	/** rAF 防抖的额外最小冷却窗口（合并多次调用）。默认 50ms */
	coolDownMs?: number
	/** 自写高度回声判断的时间窗口：在此时间内的高度回传都可能是回声。默认 120ms */
	echoWindowMs?: number
	/** 自写高度回声判断容差（像素），考虑 header+footer 估算误差。默认 3px */
	echoTolerancePx?: number
	/** 样式切换过渡期（毫秒），此期间 scheduleApply 会被延迟到结束。默认 180ms */
	styleTransitionMs?: number
}

const DEFAULTS: Required<UseStableMediaHeightOptions> = {
	coolDownMs: 50,
	echoWindowMs: 120,
	echoTolerancePx: 3,
	styleTransitionMs: 180
}

export function useStableMediaHeight(
	options: UseStableMediaHeightOptions = {}
): StableHeightController {
	const cfg: Required<UseStableMediaHeightOptions> = { ...DEFAULTS, ...options }

	// ----------------- 防抖调度 -----------------
	// 运行时环境检测：优先使用 Date.now（与 vitest fakeTimers 行为一致），避免
	// vitest fakeTimers 下 Date.now 被 mock 但 performance.now 未同步导致窗口判定失真。
	const now = () => Date.now()

	let rafId: number | null = null
	let coolDownTimer: number | null = null
	let pendingFn: (() => void) | null = null
	// 如果在样式过渡冷却期，rAF 回调执行时再延后到冷却结束
	let styleCoolDownUntil = 0

	const runPending = () => {
		rafId = null
		const t = now()
		const remainCool = styleCoolDownUntil - t
		if (remainCool > 0) {
			// 仍在样式冷却期，延后再跑
			coolDownTimer = window.setTimeout(() => {
				coolDownTimer = null
				rafId = requestAnimationFrame(runPending)
			}, remainCool)
			return
		}
		const fn = pendingFn
		pendingFn = null
		if (fn) {
			try {
				fn()
			} catch (e) {
				// 兜底：任何异常不影响上层继续执行
				console.warn('[useStableMediaHeight] scheduleApply callback threw:', e)
			}
		}
	}

	const scheduleApply = (fn: () => void) => {
		if (!fn) return
		pendingFn = fn
		// 已有 rAF / coolDown 在排队，直接复用（覆盖 pendingFn 即可）
		if (rafId != null) return
		if (coolDownTimer != null) return
		if (cfg.coolDownMs > 0) {
			coolDownTimer = window.setTimeout(() => {
				coolDownTimer = null
				rafId = requestAnimationFrame(runPending)
			}, cfg.coolDownMs)
		} else {
			rafId = requestAnimationFrame(runPending)
		}
	}

	const forceApply = (fn: () => void) => {
		// 取消尚未执行的排队
		if (rafId != null) {
			cancelAnimationFrame(rafId)
			rafId = null
		}
		if (coolDownTimer != null) {
			clearTimeout(coolDownTimer)
			coolDownTimer = null
		}
		pendingFn = null
		try {
			fn()
		} catch (e) {
			console.warn('[useStableMediaHeight] forceApply callback threw:', e)
		}
	}

	// ----------------- 自写高度追踪（闭环回声判定） -----------------
	// 记录上一次「组件自己通过 style 直写」估算出来的节点总高度
	// 当引擎下发的 height 与此值在容差内、且时间窗内，可判定为回声
	let lastSelfWrittenTotalH: number | null = null
	let lastSelfWrittenAt = 0

	const markSelfWritten = (estimatedNodeTotalH: number) => {
		lastSelfWrittenTotalH = Math.round(Number(estimatedNodeTotalH) || 0)
		lastSelfWrittenAt = now()
	}

	const isEchoOfSelfWrite = (propsHeight: number, estimatedHeaderAndFooterH: number) => {
		if (lastSelfWrittenTotalH == null) return false
		const t = now()
		if (t - lastSelfWrittenAt > cfg.echoWindowMs) {
			// 超过窗口：清空记录，避免旧值干扰
			lastSelfWrittenTotalH = null
			return false
		}
		// estimatedHeaderAndFooterH 由调用方传入（header + footer + 上下 padding/border 等）
		// 我们预期：本次 props.height ≈ lastSelfWrittenPreviewH + estimatedHeaderAndFooterH
		// 但 mark 时我们已经传的是 totalH，因此这里直接拿 propsHeight 与 totalH 比较
		const diff = Math.abs(Number(propsHeight) - lastSelfWrittenTotalH)
		return diff <= cfg.echoTolerancePx
	}

	// ----------------- 样式切换冷却 -----------------
	const notifyStyleTransition = () => {
		styleCoolDownUntil = now() + cfg.styleTransitionMs
	}

	// ----------------- 资源清理 -----------------
	let disposed = false
	const dispose = () => {
		if (disposed) return
		disposed = true
		if (rafId != null) {
			cancelAnimationFrame(rafId)
			rafId = null
		}
		if (coolDownTimer != null) {
			clearTimeout(coolDownTimer)
			coolDownTimer = null
		}
		pendingFn = null
		lastSelfWrittenTotalH = null
		styleCoolDownUntil = 0
	}

	// 兜底：组件卸载自动清理（如果调用方忘记手动 dispose）
	try {
		onBeforeUnmount(dispose)
	} catch {
		// 非组件 setup 环境中使用不会触发自动清理，忽略即可
	}

	return {
		scheduleApply,
		forceApply,
		markSelfWritten,
		isEchoOfSelfWrite,
		notifyStyleTransition,
		dispose
	}
}

/**
 * 稳定测量 .wf-media-actions / 其他操作按钮容器的高度
 * - 优先 offsetHeight（不受 zoom / CSS transform 影响，比 getBoundingClientRect 稳定）
 * - 如 DOM 尚未完成渲染（h=0），使用「按钮数量」+「单按钮预期高度」做预判兜底
 * - 已考虑「清空按钮仅在资源存在时渲染」这一条件
 * - 返回值始终 >= 0，且为整数（Math.ceil），避免小数导致反复 1px 波动
 *
 * @param bodyEl 节点 body DOM（.wf-node-body）
 * @param hasResource 资源是否存在（决定是否显示「清空」按钮）
 * @param expectedBtnH 单个按钮预期高度（可选，默认 30px，对应 padding:6px*2 + ~14px line-height + ~2px border）
 */
export function measureActionsHeightStable(
	bodyEl: HTMLElement | null | undefined,
	hasResource: boolean,
	expectedBtnH: number = 30
): number {
	if (!bodyEl) return 0
	const actionsEl = bodyEl.querySelector<HTMLElement>(':scope .wf-media-actions')
	if (!actionsEl) return 0

	let h = 0
	try {
		h = Math.ceil(Number(actionsEl.offsetHeight) || 0)
	} catch {
		h = 0
	}

	if (h > 0) return h

	// DOM 未挂载完成兜底：根据按钮数量预判
	// wf-media-actions 内部按钮横向排列，高度 = max(按钮高度)
	const btnCount = hasResource ? 2 : 1
	void btnCount // 目前按钮高度一致，数量不影响高度
	return Math.ceil(expectedBtnH)
}

/**
 * 稳定读取 wf-media 的纵向 gap 值（从 getComputedStyle 读取，避免样式定义与硬编码不同步）
 * 失败时回退到 defaultGap（默认 8）
 */
export function readMediaVerticalGap(
	bodyEl: HTMLElement | null | undefined,
	defaultGap: number = 8
): number {
	if (!bodyEl) return defaultGap
	const mediaEl = bodyEl.querySelector<HTMLElement>(':scope .wf-media')
	if (!mediaEl) return defaultGap
	try {
		const cs = getComputedStyle(mediaEl)
		const raw = (cs.rowGap ?? cs.gap ?? '').toString().trim()
		if (!raw) return defaultGap
		if (raw.endsWith('px')) {
			const n = Number.parseFloat(raw.slice(0, -2))
			if (Number.isFinite(n) && n >= 0) return Math.ceil(n)
		}
	} catch {
		/* ignore */
	}
	return defaultGap
}
