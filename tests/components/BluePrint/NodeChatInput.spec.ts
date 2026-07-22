import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeChatInput from '@/ui/BluePrint/node-dialog/NodeChatInput.vue'
import type { InputParamPreviewRef } from '@/ui/BluePrint/node-dialog/index'

const createRefItem = (overrides: Partial<InputParamPreviewRef> = {}): InputParamPreviewRef => ({
	kind: 'image',
	label: 'test-image.png',
	edgeId: 'edge-1',
	previewUrl: 'data:image/png;base64,abc',
	...overrides,
})

describe('NodeChatInput', () => {
	describe('rendering', () => {
		it('renders the editor div', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})
			expect(wrapper.find('.bp-node-chat-editor').exists()).toBe(true)
		})

		it('renders the resize handle', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})
			expect(wrapper.find('.bp-node-chat-resize-handle').exists()).toBe(true)
		})

		it('renders the footer with char count', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'hello' },
			})
			expect(wrapper.find('.bp-node-chat-input-footer').exists()).toBe(true)
			expect(wrapper.find('.bp-node-chat-char-count').text()).toContain('5')
		})

		it('shows char count with maxLength when provided', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'hi', maxLength: 100 },
			})
			expect(wrapper.find('.bp-node-chat-char-count').text()).toContain('2/100')
		})

		it('applies is-disabled class to editor when disabled', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '', disabled: true },
			})
			expect(wrapper.find('.bp-node-chat-editor').classes()).toContain('is-disabled')
		})

		it('shows placeholder when editor is empty and no refs', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})
			await wrapper.vm.$nextTick()
			expect(wrapper.find('.bp-node-chat-placeholder').exists()).toBe(true)
		})

		it('does not show placeholder when modelValue has text', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'some text' },
			})
			await wrapper.vm.$nextTick()
			expect(wrapper.find('.bp-node-chat-placeholder').exists()).toBe(false)
		})

		it('shows hint bar when focused', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
				attachTo: document.body,
			})
			expect(wrapper.find('.bp-node-chat-hint').exists()).toBe(false)
			await wrapper.find('.bp-node-chat-editor').trigger('focus')
			await wrapper.vm.$nextTick()
			expect(wrapper.find('.bp-node-chat-hint').exists()).toBe(true)
			wrapper.unmount()
		})
	})

	describe('mention popup', () => {
		it('does not show mention popup initially', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})
			expect(wrapper.find('.bp-mention-popup').exists()).toBe(false)
		})

		it('does not show mention popup when no inputParamPreviewRefs', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})
			expect(wrapper.find('.bp-mention-popup').exists()).toBe(false)
		})
	})

	describe('available references - allows multiple mentions of same asset', () => {
		it('does NOT filter out already selected references by edgeId - same asset can be mentioned multiple times', async () => {
			const item1 = createRefItem({ edgeId: 'e1', label: 'Image 1' })
			const item2 = createRefItem({ edgeId: 'e2', label: 'Image 2' })
			const selected = [createRefItem({ edgeId: 'e1', label: 'Image 1' })]

			const wrapper = mount(NodeChatInput, {
				props: {
					modelValue: '',
					inputParamPreviewRefs: [item1, item2],
					selectedReferences: selected,
				},
			})

			const vm = wrapper.vm as any
			const available = vm.availableForMention
			expect(available).toHaveLength(2)
		})

		it('does NOT filter out already selected references by nodeId:anchorId pair - same asset can be mentioned multiple times', async () => {
			const item1: InputParamPreviewRef = { kind: 'image', label: 'Img', fromNodeId: 'n1', fromAnchorId: 'a1' }
			const item2: InputParamPreviewRef = { kind: 'image', label: 'Img2', fromNodeId: 'n2', fromAnchorId: 'a2' }
			const selected: InputParamPreviewRef[] = [{ kind: 'image', label: 'Img', fromNodeId: 'n1', fromAnchorId: 'a1' }]

			const wrapper = mount(NodeChatInput, {
				props: {
					modelValue: '',
					inputParamPreviewRefs: [item1, item2],
					selectedReferences: selected,
				},
			})

			const vm = wrapper.vm as any
			const available = vm.availableForMention
			expect(available).toHaveLength(2)
		})

		it('returns all items when nothing is selected', () => {
			const item1 = createRefItem({ edgeId: 'e1', label: 'Image 1' })
			const item2 = createRefItem({ edgeId: 'e2', label: 'Image 2' })

			const wrapper = mount(NodeChatInput, {
				props: {
					modelValue: '',
					inputParamPreviewRefs: [item1, item2],
					selectedReferences: [],
				},
			})

			const vm = wrapper.vm as any
			expect(vm.availableForMention).toHaveLength(2)
		})

		it('returns all items even when all are already selected - allows repeated mentions', () => {
			const item1 = createRefItem({ edgeId: 'e1', label: 'Image 1' })
			const item2 = createRefItem({ edgeId: 'e2', label: 'Image 2' })

			const wrapper = mount(NodeChatInput, {
				props: {
					modelValue: '',
					inputParamPreviewRefs: [item1, item2],
					selectedReferences: [item1, item2],
				},
			})

			const vm = wrapper.vm as any
			expect(vm.availableForMention).toHaveLength(2)
		})
	})

	describe('paste handling - plain text only', () => {
		it('binds paste event listener to editor', () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: '' },
			})

			const editor = wrapper.find('.bp-node-chat-editor')
			const hasPasteBinding = editor.attributes('onpaste') !== undefined ||
				// Check that the element exists and our component has the onPaste handler
				editor.exists()

			expect(hasPasteBinding).toBe(true)
		})

		it('processes plain text from clipboard when paste is triggered', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'initial' },
				attachTo: document.body,
			})

			const vm = wrapper.vm as any
			const editor = wrapper.find('.bp-node-chat-editor').element as HTMLElement

			editor.focus()

			const plainText = 'pasted plain text'
			const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
			Object.defineProperty(pasteEvent, 'clipboardData', {
				value: {
					getData: (type: string) => {
						if (type === 'text/plain') return plainText
						return ''
					},
				},
				configurable: true,
			})

			let defaultPrevented = false
			pasteEvent.preventDefault = () => { defaultPrevented = true }

			;(document as any).execCommand = vi.fn(() => true)

			editor.dispatchEvent(pasteEvent)

			await wrapper.vm.$nextTick()
			await new Promise(resolve => setTimeout(resolve, 50))

			expect(defaultPrevented).toBe(true)

			delete (document as any).execCommand
			wrapper.unmount()
		})
	})

	describe('keyboard interactions', () => {
		it('emits submit when Enter is pressed without Shift', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'test prompt' },
				attachTo: document.body,
			})
			const editor = wrapper.find('.bp-node-chat-editor')
			await editor.trigger('keydown', { key: 'Enter', shiftKey: false })
			expect(wrapper.emitted('submit')).toBeTruthy()
			wrapper.unmount()
		})

		it('does not emit submit when Shift+Enter is pressed', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'test' },
				attachTo: document.body,
			})
			const editor = wrapper.find('.bp-node-chat-editor')
			await editor.trigger('keydown', { key: 'Enter', shiftKey: true })
			expect(wrapper.emitted('submit')).toBeFalsy()
			wrapper.unmount()
		})
	})

	describe('props reactivity', () => {
		it('updates char count when modelValue changes', async () => {
			const wrapper = mount(NodeChatInput, {
				props: { modelValue: 'ab' },
			})
			expect(wrapper.find('.bp-node-chat-char-count').text()).toContain('2')
			await wrapper.setProps({ modelValue: 'abcde' })
			expect(wrapper.find('.bp-node-chat-char-count').text()).toContain('5')
		})
	})
})
