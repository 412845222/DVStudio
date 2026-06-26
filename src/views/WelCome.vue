<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
	cleanupOldProject,
	clearBackendLogs,
	getBackendBaseUrl,
	getBackendLogs,
	getBackendStatus,
	getSetupState,
	isElectron,
	pingBackend,
	restartBackend,
	revealUserDataDir,
	runSetupWorkflow,
	startBackend
} from '../electronBridge'

import EnvCheckList from '../ui/Electron/EnvCheckList.vue'
import CommandConsole from '../ui/Electron/CommandConsole.vue'
import type { SetupState, SetupStep } from '../electronBridge/types'

type EnvItem = {
	key: string
	label: string
	status: 'ok' | 'warn' | 'error' | 'unknown' | 'running'
	detail?: string
	progress?: number
	retrying?: boolean
	canRetry?: boolean
}

const baseUrl = ref('')
const backendRunning = ref(false)
const backendLastError = ref('')
const backendPort = ref<number | null>(null)
const setupState = ref<SetupState>({ running: false, updatedAt: 0, steps: [] })
const retryingStepKey = ref('')
const startupSetupHintVisible = ref(false)
const startupSetupCompletedHintVisible = ref(false)

const pingOk = ref<'ok' | 'error' | 'unknown'>('unknown')
const pingDetail = ref('')

const logLines = ref<string[]>([])
const logTotal = ref(0)
const logBuffering = ref(false)
const logQueueSize = ref(0)
const backendActionBusy = ref<'' | 'start' | 'restart'>('')
let backendActionLastAt = 0

const LOG_VISIBLE_MAX = 1200
const LOG_FLUSH_CHUNK = 24
const LOG_FLUSH_INTERVAL_MS = 90
const BACKEND_ACTION_DEBOUNCE_MS = 1200

const pendingLogQueue: string[] = []
let statusLogsPollTimer: number | null = null
let pingTimer: number | null = null
let logFlushTimer: number | null = null

const router = useRouter()

const envItems = computed<EnvItem[]>(() => {
	const steps = setupState.value.steps || []
	return steps.map((s: SetupStep) => ({
		key: s.key,
		label: s.label,
		status: s.status,
		detail: s.detail || '',
		progress: s.progress,
		retrying: retryingStepKey.value === s.key,
		canRetry: s.status === 'error' && !setupState.value.running
	}))
})

const backendStatusText = computed(() => {
	if (backendRunning.value) return `运行中（端口 ${backendPort.value ?? '-'}）`
	if (backendLastError.value) return `未运行：${backendLastError.value}`
	return '未运行'
})

const setupProgressText = computed(() => {
	if (setupState.value.running) return '环境准备中...'
	const hasError = setupState.value.steps.some((s) => s.status === 'error')
	if (hasError) return '存在失败项，可在左侧逐项重试'
	return '环境流程完成'
})

const startupSetupHintText = computed(() => {
	if (setupState.value.running) {
		return '应用启动后正在自动准备本地 DVSResource 运行环境，并同步 Django 源码到运行时目录。'
	}
	if (startupSetupCompletedHintVisible.value) {
		return '应用启动时已自动检查本地运行环境；如需重建运行态，可手动再次执行环境流程。'
	}
	return ''
})

const isReadyToEnter = computed(() => backendRunning.value && pingOk.value === 'ok')

const logStatusText = computed(() => {
	const shown = logLines.value.length
	const queue = logQueueSize.value
	if (queue > 0) return `显示 ${shown} 行，缓冲 ${queue} 行…`
	return `显示 ${shown} 行`
})

async function refreshBaseUrl() {
	baseUrl.value = await getBackendBaseUrl()
}

async function refreshBackendStatus() {
	const st = await getBackendStatus()
	if (!st) return
	backendRunning.value = !!st.running
	backendLastError.value = st.lastError || ''
	backendPort.value = typeof st.port === 'number' ? st.port : null
	if (st.baseUrl) baseUrl.value = st.baseUrl
}

async function refreshPing() {
	if (!backendRunning.value) {
		pingOk.value = 'unknown'
		pingDetail.value = ''
		return
	}
	const r = await pingBackend()
	if (r.ok) {
		pingOk.value = 'ok'
		pingDetail.value = `HTTP ${r.status}`
	} else {
		pingOk.value = 'error'
		pingDetail.value = r.error || 'Ping failed'
	}
}

function schedulePing(delayMs: number) {
	if (pingTimer != null) window.clearTimeout(pingTimer)
	pingTimer = window.setTimeout(async () => {
		await refreshPing()
		const nextDelay = isReadyToEnter.value ? 30_000 : 6_000
		schedulePing(nextDelay)
	}, delayMs)
}

async function refreshLogs() {
	const r = await getBackendLogs({ since: logTotal.value })
	if (!r?.ok) return
	if (r.lines?.length) enqueueLogs(r.lines)
	logTotal.value = r.total

	if (r.baseUrl) baseUrl.value = r.baseUrl
	backendRunning.value = r.running
	backendLastError.value = r.lastError || ''
	backendPort.value = r.port
}

function isCmdProgressLine(line: string): { key: string } | null {
	const m = String(line || '').match(/^\[cmd\]\s+\[[^\]]+\]\s+(.+?)\s+\(\d+s\)$/)
	if (!m) return null
	return { key: m[1] }
}

function enqueueLogs(lines: string[]) {
	for (const raw of lines || []) {
		const line = String(raw || '').trimEnd()
		if (!line) continue

		// Coalesce high-frequency progress bars of the same command to reduce flicker/spam.
		const curr = isCmdProgressLine(line)
		const last = pendingLogQueue.length > 0 ? pendingLogQueue[pendingLogQueue.length - 1] : ''
		const prev = isCmdProgressLine(last)
		if (curr && prev && curr.key === prev.key) {
			pendingLogQueue[pendingLogQueue.length - 1] = line
		} else {
			pendingLogQueue.push(line)
		}
	}
	logQueueSize.value = pendingLogQueue.length
	logBuffering.value = pendingLogQueue.length > 0
}

function flushLogQueue() {
	if (pendingLogQueue.length <= 0) {
		logQueueSize.value = 0
		logBuffering.value = false
		return
	}

	const chunk = pendingLogQueue.splice(0, LOG_FLUSH_CHUNK)
	let next = logLines.value.concat(chunk)
	if (next.length > LOG_VISIBLE_MAX) {
		next = next.slice(next.length - LOG_VISIBLE_MAX)
	}
	logLines.value = next
	logQueueSize.value = pendingLogQueue.length
	logBuffering.value = pendingLogQueue.length > 0
}

function appendLocalLog(message: string) {
	const line = `[ui] ${message}`
	enqueueLogs([line])
}

async function handleStartBackend() {
	const now = Date.now()
	if (backendActionBusy.value) return
	if (now - backendActionLastAt < BACKEND_ACTION_DEBOUNCE_MS) return
	backendActionLastAt = now
	backendActionBusy.value = 'start'
	try {
		const r = await startBackend()
		if (r?.ok && r.baseUrl) baseUrl.value = r.baseUrl
		await refreshBackendStatus()
		await refreshPing()
	} finally {
		backendActionBusy.value = ''
	}
}

async function handleRestartBackend() {
	const now = Date.now()
	if (backendActionBusy.value) return
	if (now - backendActionLastAt < BACKEND_ACTION_DEBOUNCE_MS) return
	backendActionLastAt = now
	backendActionBusy.value = 'restart'
	try {
		const r = await restartBackend()
		if (r?.ok && r.baseUrl) baseUrl.value = r.baseUrl
		logLines.value = []
		logTotal.value = 0
		pendingLogQueue.length = 0
		logQueueSize.value = 0
		logBuffering.value = false
		await refreshBackendStatus()
		await refreshPing()
	} finally {
		backendActionBusy.value = ''
	}
}

async function handleEnterProject() {
	if (!isReadyToEnter.value) return
	await router.push('/')
}

async function refreshSetupStateOnly() {
	const st = await getSetupState()
	if (!st) return
	const wasRunning = setupState.value.running
	setupState.value = st
	if (st.running) {
		startupSetupHintVisible.value = true
		startupSetupCompletedHintVisible.value = false
		return
	}
	if (wasRunning) {
		startupSetupCompletedHintVisible.value = true
	}
}

async function runSetup(reason: string, retryKey = '') {
	const result = await runSetupWorkflow({ reason, retryKey })
	if (result?.state) setupState.value = result.state
	if (result?.ok === false) {
		appendLocalLog(`环境流程失败：${result.error || '未知错误'}`)
	}
	await refreshBackendStatus()
	await refreshPing()
}

function getRetrySuggestion(stepKey: string): string {
	switch (stepKey) {
		case 'python':
			return '建议优先使用 winget 自动安装 Python；若本机无 winget，请手动安装 Python 3.11+ 并确认 python/py 命令可用后重试。'
		case 'venv':
			return '建议检查 DVSResource 目录权限和磁盘空间，再重试创建虚拟环境。'
		case 'django':
			return '建议检查端口占用、数据库权限和 Django 配置；可先点“重启后端”。'
		case 'dependencyInstall':
			return '建议检查网络或 pip 镜像源配置后重试依赖安装。'
		default:
			return '建议查看右侧命令行详细日志并按提示修复后重试。'
	}
}

async function handleRetryStep(stepKey: string) {
	retryingStepKey.value = stepKey
	await runSetup('retry', stepKey)
	await refreshLogs()
	const failed = (setupState.value.steps || []).find(
		(s) => s.key === stepKey && s.status === 'error'
	)
	if (failed) {
		appendLocalLog(`重试失败：${failed.label}。${getRetrySuggestion(stepKey)}`)
	}
	retryingStepKey.value = ''
}

async function handleRunSetupWorkflow() {
	await runSetup('manual')
	await refreshLogs()
}

async function handleCleanupOldProject() {
	const ok = window.confirm(
		'将删除 DVSResource 下旧后端运行数据：.venv、django-app、BackendData。\nUserSettings 会保留。\n\n是否继续？'
	)
	if (!ok) return

	const r = await cleanupOldProject()
	if (r?.ok) {
		appendLocalLog('清理旧项目完成：已删除 .venv / django-app / BackendData（存在则删除）。')
	} else {
		appendLocalLog(`清理旧项目失败：${r?.error || '未知错误'}`)
	}

	logLines.value = []
	logTotal.value = 0
	pendingLogQueue.length = 0
	logQueueSize.value = 0
	logBuffering.value = false
	await refreshAll()
}

async function handleRevealUserDataDir() {
	await revealUserDataDir()
}

async function handleCopyLogs() {
	try {
		await navigator.clipboard.writeText(logLines.value.join('\n'))
	} catch {
		// ignore
	}
}

async function handleClearLogs() {
	logLines.value = []
	logTotal.value = 0
	pendingLogQueue.length = 0
	logQueueSize.value = 0
	logBuffering.value = false
	await clearBackendLogs()
}

async function refreshAll() {
	await refreshBaseUrl()
	await refreshSetupStateOnly()
	await refreshBackendStatus()
	await refreshPing()
	await refreshLogs()
}

onMounted(async () => {
	await refreshAll()
	if (isElectron()) {
		statusLogsPollTimer = window.setInterval(() => {
			refreshSetupStateOnly()
			refreshBackendStatus()
			refreshLogs()
		}, 1000)

		logFlushTimer = window.setInterval(() => {
			flushLogQueue()
		}, LOG_FLUSH_INTERVAL_MS)

		schedulePing(1200)
	}
})

onBeforeUnmount(() => {
	if (statusLogsPollTimer != null) window.clearInterval(statusLogsPollTimer)
	statusLogsPollTimer = null
	if (pingTimer != null) window.clearTimeout(pingTimer)
	pingTimer = null
	if (logFlushTimer != null) window.clearInterval(logFlushTimer)
	logFlushTimer = null
})
</script>

<template>
	<div class="root bg-vscode">
		<div class="layout row">
			<div class="col left">
				<EnvCheckList :items="envItems" title="环境流程检查" @retry="handleRetryStep" />
			</div>
			<div class="col right">
				<div class="rightTop">
					<div class="topTitle">后端控制</div>
					<div class="topSub">{{ backendStatusText }} ｜ {{ setupProgressText }}</div>
					<div
						v-if="startupSetupHintVisible || startupSetupCompletedHintVisible"
						class="setup-startup-banner"
						:class="{ done: startupSetupCompletedHintVisible && !setupState.running }"
					>
						{{ startupSetupHintText }}
					</div>
					<div class="buttons">
						<button class="btn" type="button" @click="handleRunSetupWorkflow">执行环境流程</button>
						<button class="btn" type="button" @click="handleCleanupOldProject">清理旧项目</button>
						<button
							class="btn"
							type="button"
							:disabled="!!backendActionBusy"
							@click="handleStartBackend"
						>
							{{ backendActionBusy === 'start' ? '启动中...' : '手动启动后端' }}
						</button>
						<button
							class="btn"
							type="button"
							:disabled="!!backendActionBusy"
							@click="handleRestartBackend"
						>
							{{ backendActionBusy === 'restart' ? '重启中...' : '重启后端' }}
						</button>
						<button
							class="btn"
							type="button"
							:disabled="!isReadyToEnter"
							@click="handleEnterProject"
						>
							进入项目
						</button>
						<button class="btn" type="button" @click="handleRevealUserDataDir">打开数据目录</button>
					</div>
				</div>
				<div class="rightBottom">
					<CommandConsole
						title="命令行输出（Django）"
						:status-text="logStatusText"
						:lines="logLines"
						@copy="handleCopyLogs"
						@clear="handleClearLogs"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.root {
	height: 100%;
	width: 100%;
	overflow: hidden;
}

.layout {
	height: 100%;
	padding: 12px;
	box-sizing: border-box;
	min-height: 0;
}

.left,
.right {
	min-height: 0;
}

.right {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-height: 0;
}

.rightTop {
	flex: 0 0 auto;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-light);
	padding: 12px;
}

.setup-startup-banner {
	margin-top: 10px;
	padding: 10px 12px;
	border: 1px solid rgba(60, 148, 255, 0.32);
	background: rgba(60, 148, 255, 0.12);
	color: var(--vscode-text);
	font-size: 12px;
	line-height: 1.5;
}

.setup-startup-banner.done {
	border-color: rgba(94, 196, 127, 0.28);
	background: rgba(94, 196, 127, 0.12);
}

.topTitle {
	font-size: 13px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.topSub {
	margin-top: 4px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	word-break: break-word;
}

.buttons {
	margin-top: 10px;
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border-radius: 0;
	padding: 8px 12px;
	font-size: 12px;
	cursor: pointer;
	box-shadow: none;
}

.btn:hover {
	background: var(--dweb-defualt);
	box-shadow: var(--dweb-shadow);
}

.btn:focus-visible {
	outline: none;
	box-shadow: var(--dweb-shadow);
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	box-shadow: none;
}

.rightBottom {
	flex: 1;
	min-height: 0;
	overflow: hidden;
}
</style>
