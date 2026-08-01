import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoController from '@/ui/UIComponent/VideoController.vue'

// ResizeObserver mock for jsdom
class MockResizeObserver {
	observe = vi.fn()
	unobserve = vi.fn()
	disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock setPointerCapture/releasePointerCapture for canvas (jsdom doesn't support Pointer Capture API)
if (typeof HTMLCanvasElement !== 'undefined') {
	HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
	HTMLCanvasElement.prototype.releasePointerCapture = vi.fn()
	HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false)
}

describe('VideoController', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		// Re-apply canvas mocks after restoreAllMocks wipes them
		HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
		HTMLCanvasElement.prototype.releasePointerCapture = vi.fn()
	})

	describe('rendering', () => {
		it('renders play/pause and loop buttons', () => {
			const wrapper = mount(VideoController, {
				props: { playing: false, duration: 10, currentTime: 0 }
			})
			const buttons = wrapper.findAll('button')
			expect(buttons).toHaveLength(2)
			expect(buttons[0].text()).toBe('播放')
			expect(buttons[1].text()).toBe('循环')
		})

		it('shows pause text when playing', () => {
			const wrapper = mount(VideoController, {
				props: { playing: true, duration: 10, currentTime: 0 }
			})
			expect(wrapper.findAll('button')[0].text()).toBe('暂停')
		})

		it('renders timeline canvas', () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, currentTime: 0 }
			})
			expect(wrapper.find('.vc-timeline').exists()).toBe(true)
		})

		it('renders volume slider', () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, currentTime: 0, volume: 0.8 }
			})
			const volumeInput = wrapper.find('.vc-volume')
			expect(volumeInput.exists()).toBe(true)
			expect((volumeInput.element as HTMLInputElement).value).toBe('80')
		})
	})

	describe('disabled state', () => {
		it('disables buttons when disabled prop is true', () => {
			const wrapper = mount(VideoController, {
				props: { disabled: true, duration: 10 }
			})
			const buttons = wrapper.findAll('button')
			buttons.forEach((btn) => {
				expect(btn.attributes('disabled')).toBeDefined()
			})
		})

		it('disables volume input when disabled', () => {
			const wrapper = mount(VideoController, {
				props: { disabled: true, duration: 10 }
			})
			expect(wrapper.find('.vc-volume').attributes('disabled')).toBeDefined()
		})

		it('adds disabled class to timeline when disabled prop is true', () => {
			const wrapper = mount(VideoController, {
				props: { disabled: true, duration: 10 }
			})
			expect(wrapper.find('.vc-timeline').classes()).toContain('disabled')
		})

		it('does not add disabled class just because duration is 0', () => {
			// disabled class is only controlled by the disabled prop,
			// but onPointerDown/seekByClientX early-return when duration is 0
			const wrapper = mount(VideoController, {
				props: { duration: 0 }
			})
			expect(wrapper.find('.vc-timeline').classes()).not.toContain('disabled')
		})
	})

	describe('button events', () => {
		it('emits toggle-play when play button is clicked', async () => {
			const wrapper = mount(VideoController, {
				props: { playing: false, duration: 10 }
			})
			await wrapper.findAll('button')[0].trigger('click')
			expect(wrapper.emitted('toggle-play')).toBeDefined()
		})

		it('emits toggle-loop when loop button is clicked', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10 }
			})
			await wrapper.findAll('button')[1].trigger('click')
			expect(wrapper.emitted('toggle-loop')).toBeDefined()
		})

		it('does not emit toggle-play when disabled', async () => {
			const wrapper = mount(VideoController, {
				props: { disabled: true, duration: 10 }
			})
			await wrapper.findAll('button')[0].trigger('click')
			expect(wrapper.emitted('toggle-play')).toBeUndefined()
		})
	})

	describe('volume control', () => {
		it('emits update-volume when volume slider changes', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, volume: 0.5 }
			})
			const volumeInput = wrapper.find('.vc-volume')
			;(volumeInput.element as HTMLInputElement).value = '75'
			await volumeInput.trigger('input')
			const emitted = wrapper.emitted('update-volume')
			expect(emitted).toBeDefined()
			expect(emitted![0]).toEqual([0.75])
		})
	})

	describe('timeline seek (pointer interaction)', () => {
		it('emits seek event when clicking on timeline canvas', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')

			// Mock getBoundingClientRect for the canvas (200px wide)
			const mockRect = { left: 0, top: 0, width: 200, height: 26, right: 200, bottom: 26 }
			vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect)

			// Simulate pointerdown at 50% position (100px = 5s)
			await canvas.trigger('pointerdown', {
				clientX: 100,
				clientY: 13,
				pointerId: 1,
				button: 0
			})

			const emitted = wrapper.emitted('seek')
			expect(emitted).toBeDefined()
			expect(emitted!.length).toBeGreaterThanOrEqual(1)
			// At 100/200 = 0.5, seek should be approximately 5s for 10s duration
			expect(emitted![0][0]).toBeCloseTo(5, 0)
		})

		it('clamps seek to 0 when clicking before canvas left edge', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')
			const mockRect = { left: 50, top: 0, width: 100, height: 26, right: 150, bottom: 26 }
			vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect)

			// Click before the canvas start (clientX < left) -> should clamp to 0
			await canvas.trigger('pointerdown', {
				clientX: 0,
				clientY: 13,
				pointerId: 2,
				button: 0
			})

			const emitted = wrapper.emitted('seek')
			expect(emitted).toBeDefined()
			expect(emitted![0][0]).toBe(0)
		})

		it('clamps seek to duration when clicking after canvas right edge', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 10, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')
			const mockRect = { left: 50, top: 0, width: 100, height: 26, right: 150, bottom: 26 }
			vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect)

			// Click past the canvas end (clientX > right) -> should clamp to duration
			await canvas.trigger('pointerdown', {
				clientX: 300,
				clientY: 13,
				pointerId: 3,
				button: 0
			})

			const emitted = wrapper.emitted('seek')
			expect(emitted).toBeDefined()
			expect(emitted![0][0]).toBe(10)
		})

		it('does not emit seek when disabled', async () => {
			const wrapper = mount(VideoController, {
				props: { disabled: true, duration: 10, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')
			await canvas.trigger('pointerdown', { clientX: 50, clientY: 13, pointerId: 4, button: 0 })
			expect(wrapper.emitted('seek')).toBeUndefined()
		})

		it('does not emit seek when duration is 0', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 0, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')
			await canvas.trigger('pointerdown', { clientX: 50, clientY: 13, pointerId: 5, button: 0 })
			expect(wrapper.emitted('seek')).toBeUndefined()
		})

		it('computes correct seek time at 25% position', async () => {
			const wrapper = mount(VideoController, {
				props: { duration: 60, currentTime: 0 }
			})

			const canvas = wrapper.find('.vc-timeline')
			const mockRect = { left: 0, top: 0, width: 200, height: 26, right: 200, bottom: 26 }
			vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect)

			// 50px / 200px = 0.25 * 60s = 15s
			await canvas.trigger('pointerdown', {
				clientX: 50,
				clientY: 13,
				pointerId: 6,
				button: 0
			})

			const emitted = wrapper.emitted('seek')
			expect(emitted).toBeDefined()
			expect(emitted![0][0]).toBeCloseTo(15, 0)
		})
	})
})
