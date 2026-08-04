import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import ModalDialog from '@/ui/UIComponent/ModalDialog.vue'

describe('ModalDialog', () => {
	describe('rendering', () => {
		it('renders when open prop is true', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true },
				slots: { default: 'Content' }
			})
			expect(wrapper.find('.dvs-modal-overlay').exists()).toBe(true)
			expect(wrapper.find('.dvs-modal').exists()).toBe(true)
		})

		it('does not render when open prop is false', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: false },
				slots: { default: 'Content' }
			})
			expect(wrapper.find('.dvs-modal-overlay').exists()).toBe(false)
			expect(wrapper.find('.dvs-modal').exists()).toBe(false)
		})

		it('displays title', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true, title: 'Test Title' },
				slots: { default: 'Content' }
			})
			expect(wrapper.find('.dvs-modal-title').text()).toBe('Test Title')
		})

		it('displays slot content', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true },
				slots: { default: h('p', 'Slot Content') }
			})
			expect(wrapper.find('.dvs-modal-body').html()).toContain('Slot Content')
		})
	})

	describe('buttons', () => {
		it('displays confirm button with custom text', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true, confirmText: 'Submit' }
			})
			const buttons = wrapper.findAll('.btn')
			expect(buttons[1].text()).toBe('Submit')
		})

		it('displays close button with custom text', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true, closeText: 'Cancel' }
			})
			const buttons = wrapper.findAll('.btn')
			expect(buttons[0].text()).toBe('Cancel')
		})

		it('confirm button is disabled when disableConfirm is true', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true, disableConfirm: true }
			})
			const buttons = wrapper.findAll('.btn')
			expect((buttons[1] as any).attributes('disabled')).toBeDefined()
		})

		it('confirm button is enabled by default', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			const buttons = wrapper.findAll('.btn')
			expect((buttons[1] as any).attributes('disabled')).toBeUndefined()
		})
	})

	describe('events', () => {
		it('emits close when close button is clicked', async () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			const closeButton = wrapper.findAll('.btn')[0]
			await closeButton.trigger('click')
			expect(wrapper.emitted('close')).toBeDefined()
		})

		it('emits close when X button is clicked', async () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			await wrapper.find('.dvs-modal-x').trigger('click')
			expect(wrapper.emitted('close')).toBeDefined()
		})

		it('emits close when overlay is clicked', async () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			await wrapper.find('.dvs-modal-overlay').trigger('click')
			expect(wrapper.emitted('close')).toBeDefined()
		})

		it('emits confirm when confirm button is clicked', async () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			const confirmButton = wrapper.findAll('.btn')[1]
			await confirmButton.trigger('click')
			expect(wrapper.emitted('confirm')).toBeDefined()
		})

		it('confirm click does not emit when disabled', async () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true, disableConfirm: true }
			})
			const confirmButton = wrapper.findAll('.btn')[1]
			await confirmButton.trigger('click')
			expect(wrapper.emitted('confirm')).toBeUndefined()
		})
	})

	describe('accessibility', () => {
		it('has role=dialog on modal', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			expect(wrapper.find('.dvs-modal').attributes('role')).toBe('dialog')
		})

		it('has aria-modal=true on modal', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			expect(wrapper.find('.dvs-modal').attributes('aria-modal')).toBe('true')
		})

		it('close button has aria-label', () => {
			const wrapper = mount(ModalDialog, {
				props: { open: true }
			})
			expect(wrapper.find('.dvs-modal-x').attributes('aria-label')).toBe('关闭')
		})
	})
})
