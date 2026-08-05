import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ThinkingBlock from '@/ui/AIChat/ThinkingBlock.vue'

describe('ThinkingBlock', () => {
	const getContentStyle = (wrapper: any) => {
		return wrapper.find('.thinking-block__content').attributes('style') || ''
	}

	describe('rendering', () => {
		it('renders with default props', () => {
			const wrapper = mount(ThinkingBlock)
			expect(wrapper.find('.thinking-block').exists()).toBe(true)
			expect(wrapper.find('.thinking-block__header').exists()).toBe(true)
		})

		it('shows "思考过程" title when not thinking', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: false }
			})
			expect(wrapper.find('.thinking-block__title').text()).toContain('思考过程')
		})

		it('shows "思考中…" title when thinking', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true }
			})
			expect(wrapper.find('.thinking-block__title').text()).toContain('思考中…')
		})

		it('has is-thinking class when isThinking is true', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true }
			})
			expect(wrapper.find('.thinking-block').classes()).toContain('is-thinking')
		})

		it('does not have is-thinking class when isThinking is false', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: false }
			})
			expect(wrapper.find('.thinking-block').classes()).not.toContain('is-thinking')
		})

		it('shows spinner when isThinking is true', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true }
			})
			expect(wrapper.find('.thinking-block__spinner').exists()).toBe(true)
		})

		it('shows icon text when not thinking', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: false }
			})
			expect(wrapper.find('.thinking-block__icon-text').exists()).toBe(true)
			expect(wrapper.find('.thinking-block__icon-text').text()).toBe('💭')
		})
	})

	describe('collapsed state', () => {
		it('is collapsed by default (defaultCollapsed is true)', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { content: 'test content' }
			})
			expect(getContentStyle(wrapper)).toContain('display: none')
		})

		it('is expanded when defaultCollapsed is false', async () => {
			const wrapper = mount(ThinkingBlock, {
				props: { content: 'test content', defaultCollapsed: false }
			})
			expect(getContentStyle(wrapper)).not.toContain('display: none')
		})

		it('toggles collapsed state when header is clicked', async () => {
			const wrapper = mount(ThinkingBlock, {
				props: { content: 'test content', defaultCollapsed: false }
			})
			expect(getContentStyle(wrapper)).not.toContain('display: none')

			await wrapper.find('.thinking-block__header').trigger('click')
			await wrapper.vm.$nextTick()
			expect(getContentStyle(wrapper)).toContain('display: none')

			await wrapper.find('.thinking-block__header').trigger('click')
			await wrapper.vm.$nextTick()
			expect(getContentStyle(wrapper)).not.toContain('display: none')
		})

		it('auto-expands when isThinking becomes true and was collapsed', async () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: false, defaultCollapsed: true }
			})
			expect(getContentStyle(wrapper)).toContain('display: none')

			await wrapper.setProps({ isThinking: true })
			await wrapper.vm.$nextTick()
			expect(getContentStyle(wrapper)).not.toContain('display: none')
		})

		it('does not auto-collapse when isThinking becomes false', async () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true, defaultCollapsed: false }
			})
			expect(getContentStyle(wrapper)).not.toContain('display: none')

			await wrapper.setProps({ isThinking: false })
			await wrapper.vm.$nextTick()
			expect(getContentStyle(wrapper)).not.toContain('display: none')
		})
	})

	describe('content display', () => {
		it('shows content text when content is provided', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { content: 'Hello, this is thinking content', defaultCollapsed: false }
			})
			expect(wrapper.find('.thinking-block__text').text()).toContain(
				'Hello, this is thinking content'
			)
		})

		it('shows typing indicator when thinking and no content', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true, content: '', defaultCollapsed: false }
			})
			expect(wrapper.find('.thinking-block__typing').exists()).toBe(true)
			expect(wrapper.findAll('.thinking-block__typing-dot').length).toBe(3)
		})

		it('shows content text instead of typing when content exists even while thinking', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true, content: 'Some thoughts', defaultCollapsed: false }
			})
			expect(wrapper.find('.thinking-block__text').exists()).toBe(true)
			expect(wrapper.find('.thinking-block__typing').exists()).toBe(false)
		})
	})

	describe('toggle arrow', () => {
		it('has expanded class on svg when not collapsed', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { defaultCollapsed: false }
			})
			const toggleSvg = wrapper.find('.thinking-block__toggle svg')
			expect(toggleSvg.classes()).toContain('expanded')
		})

		it('does not have expanded class on svg when collapsed', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { defaultCollapsed: true }
			})
			const toggleSvg = wrapper.find('.thinking-block__toggle svg')
			expect(toggleSvg.classes()).not.toContain('expanded')
		})
	})

	describe('accessibility', () => {
		it('header is a button element', () => {
			const wrapper = mount(ThinkingBlock)
			expect(wrapper.find('.thinking-block__header').element.tagName).toBe('BUTTON')
		})

		it('spinner svg has aria-hidden', () => {
			const wrapper = mount(ThinkingBlock, {
				props: { isThinking: true }
			})
			expect(wrapper.find('.thinking-block__spinner').attributes('aria-hidden')).toBe('true')
		})

		it('toggle svg has aria-hidden', () => {
			const wrapper = mount(ThinkingBlock)
			expect(wrapper.find('.thinking-block__toggle svg').attributes('aria-hidden')).toBe('true')
		})
	})
})
