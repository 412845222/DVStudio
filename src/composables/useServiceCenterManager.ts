import { computed, ref } from 'vue'
import { useComfyServiceManager } from './useComfyServiceManager'
import { useDeepSeekHarnessServiceManager } from './useDeepSeekHarnessServiceManager'

export function useServiceCenterManager() {
	const comfy = useComfyServiceManager()
	const harness = useDeepSeekHarnessServiceManager()
	const selectedKey = ref('comfyui')
	const current = computed(() => (selectedKey.value === 'deepseek-harness' ? harness : comfy))
	return {
		harness,
		selectedKey,
		services: computed(() => [...comfy.services.value, harness.selected.value]),
		selected: computed(() => current.value.selected.value),
		logs: computed(() => current.value.logs.value),
		logAutoScroll: computed({
			get: () => current.value.logAutoScroll.value,
			set: (v: boolean) => {
				current.value.logAutoScroll.value = v
			}
		}),
		pendingOp: computed(() => current.value.pendingOp.value),
		lastError: computed(() => current.value.lastError.value),
		loadingInitial: computed(() => current.value.loadingInitial.value),
		selectService: (key: string) => {
			selectedKey.value = key === 'deepseek-harness' ? key : 'comfyui'
		},
		startService: () => current.value.startService(),
		stopService: () => current.value.stopService(),
		restartService: () => current.value.restartService(),
		clearLogs: () => current.value.clearLogs()
	}
}
