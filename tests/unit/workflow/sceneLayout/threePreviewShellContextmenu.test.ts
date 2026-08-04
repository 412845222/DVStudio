import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import WorkflowThreePreviewShell from '@/ui/WorkFlow/WorlFlowNodes/three-preview/WorkflowThreePreviewShell.vue'

/**
 * 针对 BUGFIX 2026-07：3D预览外壳的 contextmenu 事件必须在根容器处被完全拦截，
 * 否则会冒泡到外层 WorkflowNodeWrapper → 触发节点右键菜单（与"右键平移镜头"冲突）。
 */
describe('WorkflowThreePreviewShell contextmenu 屏蔽', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	it('根容器 wf-three-shell 触发 contextmenu 时，会调用 preventDefault 且事件不冒泡到父级', async () => {
		const parentOnContextMenu = vi.fn()
		const wrapper = mount(
			{
				render() {
					return h(
						'div',
						{
							// 模拟 WorkflowNodeWrapper：在父级监听 contextmenu（代表"节点右键菜单要弹出"）
							onContextmenu: (ev: Event) => parentOnContextMenu(ev)
						},
						[h(WorkflowThreePreviewShell, {}, { default: () => h('span', 'inner-slot') })]
					)
				}
			},
			{ attachTo: document.body }
		)
		await nextTick()

		const shell = wrapper.find('.wf-three-shell')
		expect(shell.exists()).toBe(true)

		const ev = new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			button: 2
		})
		const preventDefaultSpy = vi.spyOn(ev, 'preventDefault')
		const stopPropagationSpy = vi.spyOn(ev, 'stopPropagation')
		;(shell.element as HTMLElement).dispatchEvent(ev)

		// 1) 自己一定拦截：preventDefault + stopPropagation 都调用
		expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
		expect(stopPropagationSpy).toHaveBeenCalledTimes(1)
		// 2) 父级（模拟 WorkflowNodeWrapper）一定收不到 → 不会触发节点右键菜单
		expect(parentOnContextMenu).not.toHaveBeenCalled()
		expect(ev.defaultPrevented).toBe(true)

		wrapper.unmount()
	})

	it('slot 内部的子元素 contextmenu 同样被外壳根容器拦截，不冒泡到父级', async () => {
		const parentOnContextMenu = vi.fn()
		const wrapper = mount(
			{
				render() {
					return h(
						'div',
						{
							// 模拟 WorkflowNodeWrapper
							onContextmenu: (ev: Event) => parentOnContextMenu(ev)
						},
						[
							h(
								WorkflowThreePreviewShell,
								{},
								{
									// 模拟 slot 内的 overlay 元素（例如工具条、灯光面板的任意按钮/空区）
									default: () =>
										h('div', { class: 'fake-overlay-toolbar', 'data-role': 'tools' }, [
											h('button', { class: 'tool-btn' }, 'Btn1'),
											h('div', { class: 'empty-gap-area-between-buttons' }, 'empty space')
										])
								}
							)
						]
					)
				}
			},
			{ attachTo: document.body }
		)
		await nextTick()

		const shell = wrapper.find('.wf-three-shell')
		expect(shell.exists()).toBe(true)

		// Case A：按钮上右键
		const btn = wrapper.find('.tool-btn')
		expect(btn.exists()).toBe(true)
		const evA = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
		const stopA = vi.spyOn(evA, 'stopPropagation')
		;(btn.element as HTMLElement).dispatchEvent(evA)
		// 事件沿 DOM 向上冒泡时，到达 .wf-three-shell 会被 stopPropagation
		expect(stopA).toHaveBeenCalledTimes(1)
		expect(parentOnContextMenu).not.toHaveBeenCalled()

		// Case B：按钮之间的空白区右键
		const gap = wrapper.find('.empty-gap-area-between-buttons')
		expect(gap.exists()).toBe(true)
		const evB = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
		const stopB = vi.spyOn(evB, 'stopPropagation')
		;(gap.element as HTMLElement).dispatchEvent(evB)
		expect(stopB).toHaveBeenCalledTimes(1)
		expect(parentOnContextMenu).not.toHaveBeenCalled()

		wrapper.unmount()
	})

	it('外壳根容器仍应带有 data-wf-node-drag-ignore=true，避免 Blueprint 拖拽识别误吞 3D 预览的拖拽事件', async () => {
		const wrapper = mount(WorkflowThreePreviewShell)
		await nextTick()
		const shell = wrapper.find('.wf-three-shell')
		expect(shell.attributes('data-wf-node-drag-ignore')).toBe('true')
	})
})
