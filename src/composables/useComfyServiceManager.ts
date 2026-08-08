import { onBeforeUnmount, ref, computed, nextTick } from 'vue'
import type {
	ComfyForeignKillResult,
	ComfyForeignScanResult,
	ComfyServiceInfo,
	ComfyServiceLogEntry,
	ComfyServiceLifecycle,
	ComfyServiceRuntimeStatus,
	ForeignComfyProcess
} from '../electronBridge/types'

const dweb = (window as any).dweb

const SERVICE_LOG_MAX = 2000

interface ComfyServiceConfig {
	installPath?: string
	pythonPath?: string
	port?: number
	extraArgs?: string[]
	[key: string]: any
}

function cloneValue<T>(v: T): T {
	if (v === null || v === undefined) return v
	return JSON.parse(JSON.stringify(v))
}

function pickLifecycle(
	status: ComfyServiceRuntimeStatus | null,
	pending: 'starting' | 'stopping' | null
): ComfyServiceLifecycle {
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
			exitCode: null
		}
	])
	const selectedKey = ref<string>('comfyui')
	const logs = ref<ComfyServiceLogEntry[]>([])
	const logAutoScroll = ref(true)
	const runtimeStatus = ref<ComfyServiceRuntimeStatus | null>(null)
	const pendingOp = ref<'starting' | 'stopping' | null>(null)
	const lastError = ref<string>('')
	const loadingInitial = ref(true)
	const config = ref<ComfyServiceConfig | null>(null)

	const configured = computed(() => {
		const p = config.value?.installPath
		return !!(p && String(p).trim())
	})

	const selected = computed<ComfyServiceInfo>(() => {
		return services.value.find((s) => s.key === selectedKey.value) || services.value[0]
	})

	let _unsubLog: (() => void) | null = null
	let _unsubStatus: (() => void) | null = null
	let _unsubExit: (() => void) | null = null
	let _unsubClear: (() => void) | null = null
	let _unsubConfig: (() => void) | null = null

	function applyRuntimeStatus(status: ComfyServiceRuntimeStatus) {
		runtimeStatus.value = status
		const svc = services.value.find((s) => s.key === 'comfyui')
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

	function pushLocalSystemLog(message: string, stream: ComfyServiceLogEntry['stream'] = 'system') {
		applyLogEntry({ ts: Date.now(), stream, message })
	}

	async function preflightClearForeignComfy(): Promise<void> {
		try {
			const setup = dweb?.comfyui?.setup
			const scanFn = setup?.scanForeignComfyProcesses
			const killFn = setup?.killForeignComfyProcesses
			if (typeof scanFn !== 'function') return
			pushLocalSystemLog('[启动前扫描] 扫描系统中其他 ComfyUI 进程…')
			const scanR = (await scanFn()) as ComfyForeignScanResult
			if (!scanR?.ok) {
				pushLocalSystemLog(`[启动前扫描] 扫描失败（不影响启动）：${scanR?.error || ''}`, 'stderr')
				return
			}
			const procs: ForeignComfyProcess[] = scanR.processes || []
			if (procs.length === 0) {
				pushLocalSystemLog('[启动前扫描] 未检测到外部 ComfyUI 进程 ✓')
				return
			}
			pushLocalSystemLog(
				`[启动前扫描] 检测到 ${procs.length} 个外部 ComfyUI 进程，前端主动清理：`
			)
			for (const p of procs) {
				pushLocalSystemLog(`  · pid=${p.pid}  ${(p.commandLine || p.exe || '').slice(0, 160)}`)
			}
			if (typeof killFn !== 'function') {
				pushLocalSystemLog('[启动前扫描] 当前版本未暴露清理接口，交由后端启动流程兜底。', 'stderr')
				return
			}
			const killR = (await killFn({ processes: procs })) as ComfyForeignKillResult
			if (!killR?.ok) {
				const remain = Array.isArray(killR?.remaining) ? killR.remaining.length : 0
				pushLocalSystemLog(
					`[启动前扫描] 清理未完全成功（仍残留 ${remain}），交由后端启动流程兜底。`,
					'stderr'
				)
			} else {
				pushLocalSystemLog(
					`[启动前扫描] 清理完成：成功 ${killR.killed?.length ?? 0} 个，失败 ${killR.failed?.length ?? 0} 个`
				)
				await new Promise((r) => setTimeout(r, 800))
			}
		} catch (e: any) {
			pushLocalSystemLog(
				`[启动前扫描] 异常（不影响启动）：${e?.message || String(e)}`,
				'stderr'
			)
		}
	}

	async function refreshConfig() {
		try {
			const setup = dweb?.comfyui?.setup
			if (!setup?.getConfig) {
				config.value = null
				return
			}
			const cfg = await setup.getConfig()
			config.value = cfg?.config || cfg || null
			const svc = services.value.find((s) => s.key === 'comfyui')
			if (svc && config.value?.port && typeof config.value.port === 'number') {
				svc.port = config.value.port
			}
		} catch (e) {
			console.warn('[SvcMgr] getConfig failed:', e)
			config.value = null
		}
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
			await refreshConfig()
			await preflightClearForeignComfy()
			const setup = dweb?.comfyui?.setup
			const cfg = config.value || {}
			const r = await setup.startService(
				cloneValue({
					installPath: cfg.installPath || '',
					port: typeof cfg.port === 'number' ? cfg.port : 8188,
					extraArgs: Array.isArray(cfg.extraArgs) ? [...cfg.extraArgs] : []
				})
			)
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
			await refreshConfig()
			await preflightClearForeignComfy()
			const setup = dweb?.comfyui?.setup
			const cfg = config.value || {}
			const r = await setup.restartService(
				cloneValue({
					installPath: cfg.installPath || '',
					port: typeof cfg.port === 'number' ? cfg.port : 8188,
					extraArgs: Array.isArray(cfg.extraArgs) ? [...cfg.extraArgs] : []
				})
			)
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
			if (setup?.onConfigChange) {
				_unsubConfig = setup.onConfigChange(() => {
					refreshConfig()
				})
			}
			await refreshConfig()
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
		_unsubConfig?.()
		_unsubLog = null
		_unsubStatus = null
		_unsubExit = null
		_unsubClear = null
		_unsubConfig = null
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
		config,
		configured,
		selectService,
		startService,
		stopService,
		restartService,
		clearLogs,
		refreshConfig,
		refreshStatus,
		scrollToBottom
	}
}
