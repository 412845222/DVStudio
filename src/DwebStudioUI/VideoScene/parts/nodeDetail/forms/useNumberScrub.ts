import { onBeforeUnmount } from 'vue'

export type NumberScrubOptions = {
	step: number
	min: number
	max: number
	onCommit: () => void
}

export function useNumberScrub() {
	let scrubCleanup: (() => void) | null = null

	const onNumberScrubPointerDown = (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => {
		// 仅左键拖拽，且不干扰正在输入/选中文本
		if (e.button !== 0) return
		const target = e.currentTarget as HTMLInputElement | null
		if (!target) return
		if (document.activeElement === target) return
		if (target.dataset.vsEdit === '1') return

		e.preventDefault()

		const startX = e.clientX
		const startVal = Number(get()) || 0
		let latestVal = startVal
		let rafId = 0

		const commit = () => {
			opt.onCommit()
		}
		const scheduleCommit = () => {
			if (rafId) return
			rafId = requestAnimationFrame(() => {
				rafId = 0
				commit()
			})
		}

		const normalize = (v: number) => {
			if (Number.isNaN(v) || !Number.isFinite(v)) return startVal
			const clamped = Math.max(opt.min, Math.min(opt.max, v))
			// 避免浮点抖动
			const stepDigits = String(opt.step).includes('.') ? String(opt.step).split('.')[1].length : 0
			return Number(clamped.toFixed(Math.min(6, stepDigits + 2)))
		}

		const onMove = (ev: PointerEvent) => {
			const dx = ev.clientX - startX
			// 让拖拽更“像 VSCode”的细腻感：每 10px 约等于 1 个 step
			const delta = dx * opt.step * 0.1
			latestVal = normalize(startVal + delta)
			set(latestVal)
			scheduleCommit()
		}

		const onUp = () => {
			if (scrubCleanup) {
				scrubCleanup()
				scrubCleanup = null
			}
			if (rafId) {
				cancelAnimationFrame(rafId)
				rafId = 0
			}
			// 释放时再提交一次，确保最终值落盘
			set(latestVal)
			commit()
		}

		window.addEventListener('pointermove', onMove, { passive: true })
		window.addEventListener('pointerup', onUp, { passive: true, once: true })
		scrubCleanup = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
	}

	const onNumberInputDblClick = (e: MouseEvent) => {
		const target = e.currentTarget as HTMLInputElement | null
		if (!target) return
		target.dataset.vsEdit = '1'
		target.focus()
		try {
			target.select?.()
		} catch {
			// ignore
		}
	}

	const onNumberInputFocus = (e: FocusEvent) => {
		const target = e.currentTarget as HTMLInputElement | null
		if (!target) return
		// 允许键盘编辑（包括 Tab 进入焦点）
		target.dataset.vsEdit = '1'
	}

	const onNumberInputBlur = (e: FocusEvent) => {
		const target = e.currentTarget as HTMLInputElement | null
		if (!target) return
		// 失焦后回到“默认拖拽调值”模式
		delete target.dataset.vsEdit
	}

	onBeforeUnmount(() => {
		if (scrubCleanup) scrubCleanup()
	})

	return {
		onNumberScrubPointerDown,
		onNumberInputDblClick,
		onNumberInputFocus,
		onNumberInputBlur,
	}
}
