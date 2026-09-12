import { describe, it, expect, vi } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ServiceCenterPage from '../../../src/views/ServiceCenterPage.vue'

const spies = vi.hoisted(() => ({
	comfyStart: vi.fn(),
	harnessStart: vi.fn(),
	comfyConfig: vi.fn()
}))
vi.mock('../../../src/electronBridge', () => ({ openComfySetup: spies.comfyConfig }))
vi.mock('../../../src/views/ComfyUITerminalPanel.vue', () => ({
	default: { template: '<div>COMFY_TERMINAL</div>' }
}))
vi.mock('../../../src/views/ComfyUILaunchArgsPanel.vue', () => ({
	default: { template: '<div>COMFY_ARGS</div>' }
}))
vi.mock('../../../src/views/DeepSeekHarness/DeepSeekHarnessConfigPanel.vue', () => ({
	default: { template: '<div>HARNESS_CONFIG</div>' }
}))
vi.mock('../../../src/composables/useComfyServiceManager', () => ({
	useComfyServiceManager: () => {
		const selected = ref({
			key: 'comfyui',
			name: 'ComfyUI',
			description: 'Comfy',
			status: 'stopped'
		})
		return {
			selected,
			services: computed(() => [selected.value]),
			logs: ref([]),
			logAutoScroll: ref(true),
			pendingOp: ref(null),
			lastError: ref(''),
			loadingInitial: ref(false),
			startService: spies.comfyStart,
			stopService: vi.fn(),
			restartService: vi.fn(),
			clearLogs: vi.fn()
		}
	}
}))
vi.mock('../../../src/composables/useDeepSeekHarnessServiceManager', () => ({
	useDeepSeekHarnessServiceManager: () => ({
		selected: ref({
			key: 'deepseek-harness',
			name: 'DeepSeek-Harness',
			description: 'Harness',
			status: 'stopped'
		}),
		available: ref(true),
		locked: ref(false),
		activeProfile: ref({ id: 'a' }),
		status: ref({ ready: false }),
		logs: ref([]),
		logAutoScroll: ref(true),
		pendingOp: ref(null),
		lastError: ref(''),
		loadingInitial: ref(false),
		startService: spies.harnessStart,
		stopService: vi.fn(),
		restartService: vi.fn(),
		clearLogs: vi.fn(),
		openUi: vi.fn()
	})
}))

async function setup(url = '/services') {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/services', component: ServiceCenterPage }]
	})
	await router.push(url)
	await router.isReady()
	const wrapper = mount(ServiceCenterPage, { global: { plugins: [router] } })
	await nextTick()
	return wrapper
}
describe('Service center dispatch', () => {
	it('keeps ComfyUI default and dispatches Harness without exposing Comfy panels', async () => {
		vi.clearAllMocks()
		const wrapper = await setup()
		await wrapper.get('.sc-btn-primary').trigger('click')
		expect(spies.comfyStart).toHaveBeenCalledTimes(1)
		await wrapper.findAll('.sc-service-item')[1].trigger('click')
		await wrapper.get('.sc-btn-primary').trigger('click')
		expect(spies.harnessStart).toHaveBeenCalledTimes(1)
		expect(spies.comfyStart).toHaveBeenCalledTimes(1)
		expect(wrapper.findAll('.sc-tab-btn').map((b) => b.text())).toEqual(['运行日志', '配置'])
		await wrapper.findAll('.sc-tab-btn')[1].trigger('click')
		expect(wrapper.text()).toContain('HARNESS_CONFIG')
		expect(wrapper.text()).not.toContain('COMFY_TERMINAL')
		expect(spies.comfyConfig).not.toHaveBeenCalled()
		wrapper.unmount()
	})
	it('opens the Harness config deep link', async () => {
		const wrapper = await setup('/services?service=deepseek-harness&tab=config')
		await nextTick()
		expect(wrapper.text()).toContain('HARNESS_CONFIG')
		wrapper.unmount()
	})
})
