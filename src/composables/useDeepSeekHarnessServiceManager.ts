import { computed, onBeforeUnmount, ref } from 'vue'
import { deepseekHarness as bridge, hasDeepSeekHarness } from '../electronBridge'
import type {
	HarnessProfile,
	HarnessProfiles,
	HarnessSnapshot,
	HarnessStatus,
	HarnessLog,
	HarnessReport,
	HarnessDiagnosticResult,
	HarnessAutoSetupProgress
} from '../electronBridge/deepseekHarnessTypes'

export function useDeepSeekHarnessServiceManager() {
	const available = ref(hasDeepSeekHarness())
	const profiles = ref<HarnessProfiles>({ records: [], activeProfileId: null, revision: 0 })
	const status = ref<HarnessStatus>({
		lifecycle: 'stopped',
		pid: null,
		runId: null,
		profileId: null,
		activeConfigRevision: null,
		startTime: null,
		exitCode: null,
		port: 3080,
		ready: false,
		lastError: ''
	})
	const logs = ref<HarnessLog[]>([])
	const logAutoScroll = ref(true)
	const pendingOp = ref<string | null>(null)
	const lastError = ref('')
	const loadingInitial = ref(true)
	const preparing = ref<HarnessSnapshot['preparing']>(null)
	const progress = ref('')
	const diagnostics = ref<HarnessDiagnosticResult | null>(null)
	const activeProfile = computed(() =>
		profiles.value.records.find((p) => p.id === profiles.value.activeProfileId)
	)
	const locked = computed(() =>
		Boolean(
			pendingOp.value ||
			preparing.value ||
			['starting', 'running', 'stopping'].includes(status.value.lifecycle) ||
			status.value.pid
		)
	)
	const selected = computed(() => ({
		key: 'deepseek-harness',
		name: 'DeepSeek-Harness',
		description: activeProfile.value?.name || '本地 Agent 服务 · 选择源码后启动',
		status:
			!activeProfile.value && status.value.lifecycle === 'stopped'
				? 'unconfigured'
				: status.value.lifecycle,
		pid: status.value.pid,
		port: status.value.port,
		startTime: status.value.startTime,
		exitCode: status.value.exitCode
	}))
	let disposed = false
	let unsubscribe: (() => void) | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let refreshing: Promise<void> | null = null
	let refreshAgain = false
	let seq = -1
	let epoch = -1
	let receivedSeq = -1
	let lastRuntimeError = ''
	let snapshotSeq = -1
	let releasePrepare: (() => void) | undefined
	function scheduleRefresh() {
		if (disposed || timer) return
		timer = setTimeout(() => {
			timer = undefined
			void refresh()
		}, 150)
	}
	async function refresh() {
		if (disposed) return
		available.value = hasDeepSeekHarness()
		if (!available.value) {
			loadingInitial.value = false
			return
		}
		if (!unsubscribe)
			unsubscribe = bridge.subscribe({
				logs(entries) {
					if (disposed) return
					for (const entry of entries) {
						receivedSeq = Math.max(receivedSeq, entry.seq)
						if (entry.epoch !== epoch) {
							scheduleRefresh()
							continue
						}
						if (entry.seq > seq) {
							logs.value.push(entry)
							seq = entry.seq
						}
					}
					if (logs.value.length > 2000) logs.value.splice(0, logs.value.length - 2000)
				},
				changed(event) {
					receivedSeq = Math.max(receivedSeq, event.seq)
					scheduleRefresh()
				}
			})
		if (refreshing) {
			refreshAgain = true
			return refreshing
		}
		refreshing = (async () => {
			try {
				const [snapshot, records] = await Promise.all([bridge.snapshot(), bridge.listProfiles()])
				if (disposed) return
				// An event newer than this response is never overwritten by an old snapshot.
				if (snapshot.seq >= snapshotSeq) {
					snapshotSeq = snapshot.seq
					const newer = logs.value.filter(
						(entry) => entry.epoch === snapshot.epoch && entry.seq > snapshot.seq
					)
					seq = Math.max(seq, snapshot.seq)
					epoch = snapshot.epoch
					logs.value = [...snapshot.logs, ...newer].slice(-2000)
					status.value = snapshot.status
					preparing.value = snapshot.preparing
				}
				if (snapshot.seq < receivedSeq) refreshAgain = true
				profiles.value = records
				if (snapshot.status.lastError || lastError.value === lastRuntimeError)
					lastError.value = snapshot.status.lastError
				lastRuntimeError = snapshot.status.lastError
			} catch (error) {
				if (!disposed) lastError.value = error instanceof Error ? error.message : String(error)
			} finally {
				loadingInitial.value = false
			}
		})().finally(() => {
			refreshing = null
			if (refreshAgain) {
				refreshAgain = false
				scheduleRefresh()
			}
		})
		return refreshing
	}
	async function perform<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
		if (pendingOp.value) return
		pendingOp.value = name
		lastError.value = ''
		try {
			return await fn()
		} catch (error) {
			lastError.value = error instanceof Error ? error.message : String(error)
		} finally {
			pendingOp.value = null
			await refresh()
		}
	}
	function currentPayload() {
		const profile = activeProfile.value
		if (!profile?.id) throw new Error('请先在配置中将一份源码设为当前')
		return { profileId: profile.id, expectedRevision: profile.revision || 0 }
	}
	const startService = () => perform('starting', () => bridge.start(currentPayload()))
	const stopService = () => perform('stopping', () => bridge.stop({ runId: status.value.runId }))
	const restartService = () =>
		perform('starting', () => bridge.restart({ ...currentPayload(), runId: status.value.runId }))
	const clearLogs = () => perform('clear', () => bridge.clearLogs())
	const openUi = () => perform('open', () => bridge.openUi({ runId: status.value.runId }))
	const getOpenUrl = () => bridge.getOpenUrl({ runId: status.value.runId })
	const saveProfile = (profile: HarnessProfile) =>
		perform('save', () =>
			bridge.saveProfile({
				profile: JSON.parse(JSON.stringify(profile)) as HarnessProfile,
				expectedRevision: profile.revision || 0
			})
		)
	const activateProfile = (profileId: string) =>
		perform('activate', () =>
			bridge.activateProfile({ profileId, expectedRevision: profiles.value.revision })
		)
	const removeProfile = (profile: HarnessProfile) =>
		perform('remove', () =>
			bridge.removeProfile({ profileId: profile.id!, expectedRevision: profile.revision || 0 })
		)
	const selectPath = () => perform('select', () => bridge.selectPath())
	const probe = (profile: HarnessProfile): Promise<HarnessReport | undefined> =>
		perform('probe', () =>
			bridge.probe({ profile: JSON.parse(JSON.stringify(profile)) as HarnessProfile })
		)
	const diagnose = (profile: HarnessProfile): Promise<HarnessDiagnosticResult | undefined> =>
		perform('diagnose', async () => {
			const result = await bridge.diagnose({
				profile: JSON.parse(JSON.stringify(profile)) as HarnessProfile
			})
			diagnostics.value = result
			return result
		})
	async function autoSetup(profile: HarnessProfile) {
		return perform('auto-setup', async () => {
			const operationId = crypto.randomUUID()
			preparing.value = { operationId, profileId: profile.id! }
			const iterable = bridge.autoSetup({
				profileId: profile.id!,
				expectedRevision: profile.revision || 0,
				operationId
			})
			const stream = iterable[Symbol.asyncIterator]()
			const detached = new Promise<IteratorResult<HarnessAutoSetupProgress>>((resolve) => {
				releasePrepare = () => {
					void stream.return?.()
					resolve({ done: true, value: undefined })
				}
			})
			try {
				while (!disposed) {
					const item = await Promise.race([stream.next(), detached])
					if (item.done) break
					if (item.value.message) progress.value = item.value.message
					if (item.value.diagnostics) diagnostics.value = item.value.diagnostics
				}
			} finally {
				releasePrepare?.()
				releasePrepare = undefined
			}
		})
	}
	async function prepare(profile: HarnessProfile) {
		return perform('prepare', async () => {
			const operationId = crypto.randomUUID()
			preparing.value = { operationId, profileId: profile.id! }
			const iterable = bridge.prepare({
				profileId: profile.id!,
				expectedRevision: profile.revision || 0,
				operationId
			})
			const stream = iterable[Symbol.asyncIterator]()
			const detached = new Promise<
				IteratorResult<import('../electronBridge/deepseekHarnessTypes').HarnessProgress>
			>((resolve) => {
				releasePrepare = () => {
					void stream.return?.()
					resolve({ done: true, value: undefined })
				}
			})
			try {
				while (!disposed) {
					const item = await Promise.race([stream.next(), detached])
					if (item.done) break
					progress.value = item.value.message
				}
			} finally {
				releasePrepare?.()
				releasePrepare = undefined
			}
		})
	}
	async function cancelPrepare() {
		if (!preparing.value) return
		try {
			await bridge.cancelPrepare({ operationId: preparing.value.operationId })
			progress.value = '正在取消…'
		} catch (error) {
			lastError.value = String(error)
		}
	}
	onBeforeUnmount(() => {
		disposed = true
		unsubscribe?.()
		releasePrepare?.()
		if (timer) clearTimeout(timer)
	})
	void refresh()
	return {
		available,
		profiles,
		status,
		logs,
		logAutoScroll,
		pendingOp,
		lastError,
		loadingInitial,
		selected,
		activeProfile,
		locked,
		preparing,
		progress,
		diagnostics,
		refresh,
		startService,
		stopService,
		restartService,
		clearLogs,
		openUi,
		getOpenUrl,
		saveProfile,
		activateProfile,
		removeProfile,
		selectPath,
		probe,
		diagnose,
		autoSetup,
		prepare,
		cancelPrepare
	}
}
export type HarnessServiceManager = ReturnType<typeof useDeepSeekHarnessServiceManager>
