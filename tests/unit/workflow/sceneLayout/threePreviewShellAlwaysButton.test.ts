import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick, ref } from 'vue'
import WorkflowThreePreviewShell from '@/ui/WorkFlow/WorlFlowNodes/three-preview/WorkflowThreePreviewShell.vue'
import type { WorkflowThreePreviewState } from '@/ui/WorkFlow/WorlFlowNodes/three-preview/types'

/**
 * 针对 BUGFIX 2026-08：WorkflowThreePreviewShell 常驻启动按钮 + canStart 兼容逻辑。
 *
 * 核心修复点：
 *  1. 新增 shouldShowAlwaysButton = !empty 计算属性：只要有内容就永远显示按钮，
 *     不依赖 phase / canStart，彻底解决"二次激活 loading 竞态导致按钮永久消失"问题。
 *  2. canStart 保留原有计算（兼容其他消费方），但不再是按钮显示的唯一条件。
 *  3. 常驻按钮 z-index=3，位于右下角，不被 overlay(z-index=2) 遮挡。
 */
describe('WorkflowThreePreviewShell 常驻启动按钮 (BUGFIX 2026-08)', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	function makeState(patch: Partial<WorkflowThreePreviewState> = {}): WorkflowThreePreviewState {
		return {
			phase: 'masked',
			canStart: true,
			progress: 0,
			label: '',
			requestId: 0,
			...patch
		}
	}

	describe('shouldShowAlwaysButton = !empty —— 核心常驻条件', () => {
		it('empty=true（无内容）→ 常驻按钮不渲染（用户没有任何可渲染的东西）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: true, state: makeState() }
			})
			await nextTick()
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(false)
		})

		it('empty=false + phase=masked → 常驻按钮必须存在（这是"二次激活后按钮消失"的主修复路径）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState({ phase: 'masked', canStart: true }) }
			})
			await nextTick()
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(true)
			const btn = alwaysDock.find('.wf-three-shell-start')
			expect(btn.exists()).toBe(true)
		})

		it('empty=false + phase=loading（竞态条件！）→ 常驻按钮仍必须存在（旧逻辑因 phase==="loading" 走 loading 分支，按钮在 masked 分支内，导致按钮永久消失）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: {
					empty: false,
					state: makeState({ phase: 'loading', canStart: true, progress: 0.5 })
				}
			})
			await nextTick()
			// 关键断言：loading 阶段按钮仍存在，这样即便 kickoffAutoStart 把 canvas 尺寸为 0 的节点送入 loading，
			// 用户仍可手动点击按钮重试 → 不再依赖 "按钮只能在 masked 分支渲染" 的旧错误设计
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(true)
		})

		it('empty=false + phase=interactive（预览已经成功渲染中）→ 常驻按钮仍存在允许用户重启渲染', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: {
					empty: false,
					state: makeState({ phase: 'interactive', canStart: true, progress: 1 })
				}
			})
			await nextTick()
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(true)
		})

		it('empty 响应式变化：true→false 后按钮应立即出现', async () => {
			const empty = ref(true)
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: empty.value, state: makeState() }
			})
			await nextTick()
			expect(wrapper.find('[data-wf-three-shell-always-dock]').exists()).toBe(false)

			await wrapper.setProps({ empty: false })
			await nextTick()
			expect(wrapper.find('[data-wf-three-shell-always-dock]').exists()).toBe(true)
		})
	})

	describe('canStart 计算兼容（非按钮显示唯一条件，保留给其他消费者）', () => {
		it('empty=true + canStart=false → canStart=false（旧兼容语义：空内容不能启动）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: true, state: makeState({ canStart: false }) }
			})
			await nextTick()
			// 即使 canStart 计算为 false（由 vm 内部），empty=true 时按钮也不渲染（两条路径独立验证一致）
			expect(wrapper.find('[data-wf-three-shell-always-dock]').exists()).toBe(false)
		})

		it('phase=masked + !empty → canStart=true（原始语义保持）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState({ phase: 'masked' }) }
			})
			await nextTick()
			// 同时 showMaskedDock 也应渲染为"左下角提示"
			const maskedDock = wrapper.find('.wf-three-shell-dock.masked')
			expect(maskedDock.exists()).toBe(true)
			// 常驻按钮同样存在（双入口并存，但常驻是永远可用的安全网）
			expect(wrapper.find('[data-wf-three-shell-always-dock]').exists()).toBe(true)
		})
	})

	describe('常驻按钮 DOM 属性与样式合约', () => {
		it('必须带有 data-wf-three-shell-always-dock=true 属性，便于 E2E / 调试定位', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState() }
			})
			await nextTick()
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock="true"]')
			expect(alwaysDock.exists()).toBe(true)
		})

		it('点击常驻按钮必须 emit("start")，且事件被 stopPropagation（不冒泡到 Blueprint 拖拽系统）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState() }
			})
			await nextTick()
			const btn = wrapper.find('[data-wf-three-shell-always-dock] .wf-three-shell-start')
			expect(btn.exists()).toBe(true)

			// 使用原生事件构造，精确捕捉 stopPropagation 调用
			const clickEv = new MouseEvent('click', { bubbles: true, cancelable: true })
			const stopSpy = vi.spyOn(clickEv, 'stopPropagation')
			;(btn.element as HTMLElement).dispatchEvent(clickEv)

			expect(stopSpy).toHaveBeenCalledTimes(1)
			// Vue Test Utils 的 emitted() 也应捕获到 @click.stop="emit('start')"
			expect(wrapper.emitted('start')?.length).toBeGreaterThanOrEqual(1)
		})

		it('自定义 startLabel 应正确显示在按钮上（i18n 覆盖合约）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: {
					empty: false,
					state: makeState(),
					startLabel: '自定义启动文案'
				}
			})
			await nextTick()
			const btn = wrapper.find('[data-wf-three-shell-always-dock] .wf-three-shell-start')
			expect(btn.text()).toContain('自定义启动文案')
		})
	})

	describe('与 overlay 的 z-index 隔离合约（防止按钮被遮罩盖住）', () => {
		it('empty=false + phase=masked + canStart=true：masked dock（左下角提示）与 常驻按钮同时存在，按钮不被遮挡（DOM 结构在 overlay/dock 之后 + z-index=3）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState({ phase: 'masked', canStart: true }) }
			})
			await nextTick()
			const shellHtml = wrapper.find('.wf-three-shell').element.innerHTML
			// 1) canStart=true 时：showMaskedDock=true（而非 showMaskedOverlay，后者只在 canStart=false 时渲染）
			//    模板：v-else-if="showMaskedOverlay" → masked overlay
			//          v-else-if="showMaskedDock"   → masked dock（左下角）
			//    canStart=true && phase=masked && !empty → showMaskedDock=true
			const maskedDock = wrapper.find('.wf-three-shell-dock.masked')
			expect(maskedDock.exists()).toBe(true)
			// 2) 常驻按钮容器存在（注意：是 wf-three-shell-dock always，不是 masked dock）
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(true)
			// 3) DOM 顺序：always dock 在 template 底部，位于 masked dock（第 40-42 行）之后，
			//    在同级流中后写入 = 自然层叠更高；另外显式 z-index:3 vs dock z-index:2 双重保险。
			const maskedDockIdx = shellHtml.indexOf('wf-three-shell-dock masked')
			const alwaysIdx = shellHtml.indexOf('data-wf-three-shell-always-dock')
			expect(maskedDockIdx).toBeGreaterThanOrEqual(0)
			expect(alwaysIdx).toBeGreaterThan(maskedDockIdx)
		})

		it('empty=false + phase=loading：loading overlay 存在，按钮仍在 DOM 中（关键：修复前 loading 分支没有任何按钮入口）', async () => {
			const wrapper = mount(WorkflowThreePreviewShell, {
				props: { empty: false, state: makeState({ phase: 'loading', progress: 0.3 }) }
			})
			await nextTick()
			const loadingOverlay = wrapper.find('.wf-three-shell-overlay.loading')
			expect(loadingOverlay.exists()).toBe(true)
			const alwaysDock = wrapper.find('[data-wf-three-shell-always-dock]')
			expect(alwaysDock.exists()).toBe(true)
		})
	})
})
