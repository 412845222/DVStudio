import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FrameRunPanel from '../../../src/ui/WorkFlow/selection/FrameRunPanel.vue'

const props = {
	title: '组合',
	frameId: 'f',
	members: [
		{
			id: 'a',
			type: 'text',
			title: '步骤',
			nodeChatDraft: '原提示词',
			inputs: [{ id: 'in' }],
			outputs: [{ id: 'out' }]
		}
	],
	sources: [{ id: 'x', type: 'text', title: '组外文本' }],
	running: false,
	message: '',
	records: [{ id: 'r', status: 'succeeded', recipeHash: 'hash', createdAt: 1 }]
}
describe('frame automation user actions', () => {
	it('keeps history inspection separate from execution and submits explicit step choices', async () => {
		const wrapper = mount(FrameRunPanel, { props })
		const buttons = wrapper.findAll('button')
		await buttons.find((b) => b.text() === '查看 / 导出记录')!.trigger('click')
		expect(wrapper.emitted('inspect')).toEqual([['r']])
		expect(wrapper.emitted('run')).toBeUndefined()
		await wrapper.get('textarea').setValue('修改后的提示词')
		await buttons.find((b) => b.text() === '验证并运行')!.trigger('click')
		expect(wrapper.emitted('run')?.[0]).toEqual([
			{},
			{ a: { action: 'generate', prompt: '修改后的提示词' } }
		])
		wrapper.unmount()
	})
	it('locks editing and replay during a run while leaving stop available', () => {
		const wrapper = mount(FrameRunPanel, { props: { ...props, running: true } })
		for (const button of wrapper
			.findAll('button')
			.filter((b) => ['验证并运行', '按此记录重新执行', '复用结果'].includes(b.text())))
			expect(button.attributes('disabled')).toBeDefined()
		expect(
			wrapper
				.findAll('button')
				.find((b) => b.text().includes('终止本次'))!
				.attributes('disabled')
		).toBeUndefined()
		expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})
})

it('defaults ComfyUI to workflow execution without requiring a chat prompt', async () => {
	const wrapper = mount(FrameRunPanel, {
		props: { ...props, members: [{ id: 'comfy', type: 'comfyui', inputs: [], outputs: [] }] }
	})
	expect(wrapper.text()).toContain('执行 ComfyUI 工作流')
	expect(wrapper.find('textarea').exists()).toBe(false)
	await wrapper
		.findAll('button')
		.find((b) => b.text() === '验证并运行')!
		.trigger('click')
	expect(wrapper.emitted('run')?.[0]).toEqual([{}, { comfy: { action: 'generate', prompt: '' } }])
	wrapper.unmount()
})

it('allows closing an active session immediately', async () => {
	const wrapper = mount(FrameRunPanel, { props: { ...props, running: true } })
	const close = wrapper.findAll('button').find((b) => b.text() === '关闭')!
	expect(close.attributes('disabled')).toBeUndefined()
	await close.trigger('click')
	expect(wrapper.emitted('close')).toHaveLength(1)
	wrapper.unmount()
})
