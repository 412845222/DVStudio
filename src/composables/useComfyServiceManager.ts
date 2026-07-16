import { onBeforeUnmount, ref, computed, nextTick } from 'vue'
import type {
	ComfyServiceInfo,
	ComfyServiceLogEntry,
	ComfyServiceLifecycle,
	ComfyServiceRuntimeStatus,
} from '../electronBridge/types'

const dweb = (window as any).dweb

const SERVICE_LOG_MAX = 2000

function cloneValue<T>(v: T): T {
	if (v === null || v === undefined) return v
	return JSON.parse(JSON.stringify(v))
}

function pickLifecycle(status: ComfyServiceRuntimeStatus | null, pending: 'starting' | 'stopping' | null): ComfyServiceLifecycle {
	if (pending) return pending
	if (!status) return 'stopped'
	if (status.running) return 'running'
	return 'stopped'
}

export function useComfyServiceManager() {
	const services = ref<ComfyServiceInfo[]>([
		{
			key: 'comfyui',
			name: 'ComfyUI',
			description: '节点式 AI 模型后端',
			status: 'stopped',
			pid: null,
			port: 8188,
			startTime: null,
			exitCode: null,
		},
	])
	const selectedKey = ref<string>('comfyui')
	const logs = ref<ComfyServiceLogEntry[]>([])
	const logAutoScroll = ref(true)
	const runtimeStatus = ref<ComfyServiceRuntimeStatus | null>(null)
	const pendingOp = ref<'starting' | 'stopping' | null>(null)
	const lastError = ref<string>('')
	const loadingInitial = ref(true)

	const selected = computed<ComfyServiceInfo>(() => {
		return services.value.find(s => s.key === selectedKey.value) || services.value[0]
	})

	let _unsubLog: (() => void) | null = null
	let _unsubStatus: (() => void) | null = null
	let _unsubExit: (() => void) | null = null
	let _unsubClear: (() => void) | null = null

	function applyRuntimeStatus(status: ComfyServiceRuntimeStatus) {
		runtimeStatus.value = status
		const svc = services.value.find(s => s.key === 'comfyui')
		if (!svc) return
		svc.running = status.running
		svc.pid = status.pid
		svc.port = status.port
		svc.startTime = status.startTime
		svc.exitCode = status.exitCode
		svc.status = pickLifecycle(status, pendingOp.value)
		if (status.running) {
			pendingOp.value = null
			lastError.value = ''
		}
	}

	function applyLogEntry(entry: ComfyServiceLogEntry) {
		logs.value.push(entry)
		if (logs.value.length > SERVICE_LOG_MAX) {
			logs.value.splice(0, logs.value.length - SERVICE_LOG_MAX)
		}
	}

	function scrollToBottom(el: HTMLElement | null) {
		if (!el || !logAutoScroll.value) return
		nextTick(() => {
			el.scrollTop = el.scrollHeight
		})
	}

	async function refreshStatus() {
		try {
			const setup = dweb?.comfyui?.setup
			if (!setup?.getServiceStatus) return
			const r = await setup.getServiceStatus()
			if (r) applyRuntimeStatus(r)
		} catch (e) {
			console.warn('[SvcMgr] getServiceStatus failed:', e)
		}
	}

	async function loadInitialLogs() {
		try {
			const setup = dweb?.comfyui?.setup
			if (!setup?.getServiceLogs) return
			const r = await setup.getServiceLogs()
			if (r?.status) applyRuntimeStatus(r.status)
			if (Array.isArray(r?.logs)) {
				logs.value = r.logs.slice(-SERVICE_LOG_MAX)
			}
		} catch (e) {
			console.warn('[SvcMgr] getServiceLogs failed:', e)
		} finally {
			loadingInitial.value = false
		}
	}

	async function startService() {
		if (pendingOp.value) return
		if (runtimeStatus.value?.running) return
		pendingOp.value = 'starting'
		lastError.value = ''
		try {
			const setup = dweb?.comfyui?.setup
			const cfg = setup?.getConfig ? await setup.getConfig() : null
			const config = cfg?.config || cfg || {}
			const r = await setup.startService(cloneValue({
				installPath: config.installPath || '',
				port: typeof config.port === 'number' ? config.port : 8188,
				extraArgs: Array.isArray(config.extraArgs) ? [...config.extraArgs] : [],
			}))
			if (r?.ok) {
				await refreshStatus()
			} else {
				lastError.value = r?.error || '启动失败'
				pendingOp.value = null
			}
		} catch (e: any) {
			lastError.value = e?.message || String(e)
			pendingOp.value = null
		}
	}

	async function stopService() {
		if (pendingOp.value) return
		pendingOp.value = 'stopping'
		try {
			await dweb?.comfyui?.setup?.stopService()
		} catch (e: any) {
			lastError.value = e?.message || String(e)
		}
	}

	async function restartService() {
		if (pendingOp.value) return
		pendingOp.value = 'starting'
		lastError.value = ''
		try {
			const setup = dweb?.comfyui?.setup
			const cfg = setup?.getConfig ? await setup.getConfig() : null
			const config = cfg?.config || cfg || {}
			const r = await setup.restartService(cloneValue({
				installPath: config.installPath || '',
				port: typeof config.port === 'number' ? config.port : 8188,
				extraArgs: Array.isArray(config.extraArgs) ? [...config.extraArgs] : [],
			}))
			if (r?.ok) {
				await refreshStatus()
			} else {
				lastError.value = r?.error || '重启失败'
				pendingOp.value = null
			}
		} catch (e: any) {
			lastError.value = e?.message || String(e)
			pendingOp.value = null
		}
	}

	async function clearLogs() {
		logs.value = []
		try {
			await dweb?.comfyui?.setup?.clearServiceLogs()
		} catch {}
	}

	function selectService(key: string) {
		selectedKey.value = key
	}

	let initPromise: Promise<void> | null = null
	async function init() {
		if (initPromise) return initPromise
		initPromise = (async () => {
			const setup = dweb?.comfyui?.setup
			if (setup?.onServiceLog) {
				_unsubLog = setup.onServiceLog((entry: ComfyServiceLogEntry) => {
					applyLogEntry(entry)
				})
			}
			if (setup?.onServiceStatusChange) {
				_unsubStatus = setup.onServiceStatusChange((status: ComfyServiceRuntimeStatus) => {
					applyRuntimeStatus(status)
				})
			}
			if (setup?.onServiceExit) {
				_unsubExit = setup.onServiceExit(() => {
					pendingOp.value = null
					refreshStatus()
				})
			}
			if (setup?.onServiceLogsCleared) {
				_unsubClear = setup.onServiceLogsCleared(() => {
					logs.value = []
				})
			}
			await loadInitialLogs()
			await refreshStatus()
		})()
		return initPromise
	}

	onBeforeUnmount(() => {
		_unsubLog?.()
		_unsubStatus?.()
		_unsubExit?.()
		_unsubClear?.()
		_unsubLog = null
		_unsubStatus = null
		_unsubExit = null
		_unsubClear = null
	})

	init()

	return {
		services,
		selectedKey,
		selected,
		logs,
		logAutoScroll,
		runtimeStatus,
		pendingOp,
		lastError,
		loadingInitial,
		selectService,
		startService,
		stopService,
		restartService,
		clearLogs,
		refreshStatus,
		scrollToBottom,
	}
}
