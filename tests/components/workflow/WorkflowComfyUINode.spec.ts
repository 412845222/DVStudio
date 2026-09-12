import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
vi.mock('../../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../../src/electronBridge', () => ({ openComfySetup: vi.fn() }))
vi.mock('../../../src/store/aiworkflow/store', () => ({
	COMFYUI_DEFAULT_BASE_URL: 'http://127.0.0.1:8188'
}))
import Component from '../../../src/ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'

describe('ComfyUI node task controls', () => {
	it('renders API readiness and emits refresh/run through the existing event contract', async () => {
		const wrapper = shallowMount(Component, {
			props: {
				nodeId: 'c',
				title: 'Comfy',
				nodeType: 'comfyui',
				width: 400,
				height: 600,
				zoom: 1,
				worldX: 0,
				worldY: 0,
				comfyuiSettings: {
					baseUrl: 'http://comfy',
					status: 'connected',
					workflowPath: 'api.json',
					historyChecked: true,
					hasHistory: false,
					templateResolution: { contentHash: 'v1', source: 'userdata-api' }
				}
			},
			global: {
				stubs: {
					WorkflowNodeBase: { inheritAttrs: false, template: '<div><slot name="body" /></div>' }
				}
			}
		})
		try {
			expect(wrapper.text()).toContain('模板已就绪')
			expect(wrapper.text()).not.toContain('nodes.comfyui.noHistoryTitle')
			await wrapper
				.findAll('button')
				.find((b) => b.text() === '刷新模板与成功历史')!
				.trigger('click')
			expect(wrapper.emitted('refresh-history-check')).toHaveLength(1)
			const run = wrapper.findAll('button').find((b) => b.text() === 'nodes.comfyui.run')
			expect(run).toBeDefined()
			await run!.trigger('click')
			expect(wrapper.emitted('run-comfyui')).toHaveLength(1)
		} finally {
			wrapper.unmount()
		}
	})
})
