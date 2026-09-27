import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
vi.mock('../../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import Component from '../../../src/ui/WorkFlow/WorlFlowNodes/comfy/ComfyHistoryCandidateDialog.vue'

describe('Comfy history candidate choice', () => {
	it('requires an explicit choice and clears it when candidates change', async () => {
		const wrapper = mount(Component, {
			props: { candidates: [{ path: 'history://p', name: 'Snapshot' }] }
		})
		try {
			expect(wrapper.find('details').attributes('open')).toBeDefined()
			expect(wrapper.find('button').attributes('disabled')).toBeDefined()
			await wrapper.find('select').setValue('history://p')
			await wrapper.find('button').trigger('click')
			expect(wrapper.emitted('select')).toEqual([['history://p']])
			await wrapper.setProps({ candidates: [{ path: 'history://q', name: 'New' }] })
			expect(wrapper.find('button').attributes('disabled')).toBeDefined()
		} finally {
			wrapper.unmount()
		}
	})
})
