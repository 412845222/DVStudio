import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorToolbar from '@/ui/UIComponent/Model3DEditor/EditorToolbar.vue'
import type {
	RenderMode,
	LightingPreset,
	TransformMode
} from '@/ui/WorkFlow/WorlFlowNodes/model3d/editor/types'

describe('EditorToolbar', () => {
	const defaultProps = {
		currentRenderMode: 'pbr' as RenderMode,
		currentLighting: 'studio' as LightingPreset,
		currentTransformMode: 'translate' as TransformMode,
		shadowsEnabled: false,
		gridVisible: true,
		axesVisible: false,
		bloomEnabled: false,
		wireframeOverlay: false
	}

	describe('render mode buttons', () => {
		it('renders pbr, solid-white, normal, unlit buttons but no wireframe mode button', () => {
			const wrapper = mount(EditorToolbar, { props: defaultProps })
			const buttons = wrapper.findAll('.m3de-toolbar-btn')
			const modeValues = buttons.map((b) => b.text())
			expect(modeValues).toContain('PBR')
			expect(modeValues).toContain('白模')
			expect(modeValues).toContain('法线')
			expect(modeValues).toContain('无光照')
			const wireframeBtn = buttons.find(
				(b) => b.text() === '线框' && b.classes().includes('m3de-toolbar-btn')
			)
			expect(wireframeBtn).toBeUndefined()
		})

		it('marks the active render mode button with active class', () => {
			const wrapper = mount(EditorToolbar, {
				props: { ...defaultProps, currentRenderMode: 'solid-white' }
			})
			const buttons = wrapper.findAll('.m3de-toolbar-btn')
			const whiteBtn = buttons.find((b) => b.text() === '白模')
			expect(whiteBtn?.classes()).toContain('active')
			const pbrBtn = buttons.find((b) => b.text() === 'PBR')
			expect(pbrBtn?.classes()).not.toContain('active')
		})

		it('emits update:renderMode when a mode button is clicked', async () => {
			const wrapper = mount(EditorToolbar, { props: defaultProps })
			const buttons = wrapper.findAll('.m3de-toolbar-btn')
			const normalBtn = buttons.find((b) => b.text() === '法线')
			await normalBtn?.trigger('click')
			expect(wrapper.emitted('update:renderMode')).toBeDefined()
			expect(wrapper.emitted('update:renderMode')?.[0]).toEqual(['normal'])
		})
	})

	describe('wireframe overlay checkbox', () => {
		it('renders wireframe checkbox in the display group', () => {
			const wrapper = mount(EditorToolbar, { props: defaultProps })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const wireframeCheckbox = checkboxes.find((cb) => cb.text().includes('线框'))
			expect(wireframeCheckbox).toBeDefined()
		})

		it('wireframe checkbox is unchecked when wireframeOverlay is false', () => {
			const wrapper = mount(EditorToolbar, { props: { ...defaultProps, wireframeOverlay: false } })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const wireframeCheckbox = checkboxes.find((cb) => cb.text().includes('线框'))
			const input = wireframeCheckbox?.find('input[type="checkbox"]')
			expect((input?.element as HTMLInputElement).checked).toBe(false)
		})

		it('wireframe checkbox is checked when wireframeOverlay is true', () => {
			const wrapper = mount(EditorToolbar, { props: { ...defaultProps, wireframeOverlay: true } })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const wireframeCheckbox = checkboxes.find((cb) => cb.text().includes('线框'))
			const input = wireframeCheckbox?.find('input[type="checkbox"]')
			expect((input?.element as HTMLInputElement).checked).toBe(true)
		})

		it('emits update:wireframeOverlay with true when checkbox is checked', async () => {
			const wrapper = mount(EditorToolbar, { props: { ...defaultProps, wireframeOverlay: false } })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const wireframeCheckbox = checkboxes.find((cb) => cb.text().includes('线框'))
			const input = wireframeCheckbox?.find('input[type="checkbox"]')
			await input?.setValue(true)
			expect(wrapper.emitted('update:wireframeOverlay')).toBeDefined()
			expect(wrapper.emitted('update:wireframeOverlay')?.[0]).toEqual([true])
		})

		it('emits update:wireframeOverlay with false when checkbox is unchecked', async () => {
			const wrapper = mount(EditorToolbar, { props: { ...defaultProps, wireframeOverlay: true } })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const wireframeCheckbox = checkboxes.find((cb) => cb.text().includes('线框'))
			const input = wireframeCheckbox?.find('input[type="checkbox"]')
			await input?.setValue(false)
			expect(wrapper.emitted('update:wireframeOverlay')).toBeDefined()
			expect(wrapper.emitted('update:wireframeOverlay')?.[0]).toEqual([false])
		})
	})

	describe('display checkboxes', () => {
		it('renders shadows, grid, axes, bloom, wireframe checkboxes', () => {
			const wrapper = mount(EditorToolbar, { props: defaultProps })
			const checkboxes = wrapper.findAll('.m3de-toolbar-checkbox')
			const labels = checkboxes.map((cb) => cb.text().trim())
			expect(labels).toContain('阴影')
			expect(labels).toContain('网格')
			expect(labels).toContain('坐标轴')
			expect(labels).toContain('泛光')
			expect(labels).toContain('线框')
		})
	})

	describe('action buttons', () => {
		it('emits resetCamera when reset button is clicked', async () => {
			const wrapper = mount(EditorToolbar, { props: defaultProps })
			const actionBtns = wrapper.findAll('.m3de-toolbar-action-btn')
			const resetBtn = actionBtns[0]
			await resetBtn.trigger('click')
			expect(wrapper.emitted('resetCamera')).toBeDefined()
		})
	})
})
