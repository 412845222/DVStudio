<template>
	<header class="global-title-bar" aria-label="窗口标题栏" @dblclick="onDoubleClick">
		<div class="global-title-bar-left">
			<img class="global-title-bar-logo" src="/favicon.ico" alt="" aria-hidden="true" />
			<div class="global-title-bar-title">Dweb Video Studio</div>
		</div>

		<div class="backend-status-wrap" title="后端状态">
			<span class="backend-status-dot" :class="backendStatusClass" aria-hidden="true" />
			<span class="backend-status-text">{{ backendStatusText }}</span>
			<div
				class="setup-progress-chip"
				:class="{ running: setupRunning }"
				:title="setupProgressTitle"
				role="progressbar"
				:aria-valuenow="setupPercent"
				aria-valuemin="0"
				aria-valuemax="100"
			>
				<span class="setup-progress-label">环境 {{ setupPercent }}%</span>
				<span class="setup-progress-track" aria-hidden="true">
					<span class="setup-progress-fill" :style="{ width: setupPercent + '%' }" />
				</span>
			</div>
			<button class="titlebar-btn status-jump" type="button" @click="goWelcome">环境检查</button>
		</div>

		<div class="global-title-bar-right" aria-label="窗口控制">
			<button
				class="theme-toggle-btn"
				type="button"
				aria-label="切换深色/浅色模式"
				title="切换主题"
				@click="toggleTheme"
			>
				<span class="theme-toggle-track" />
				<span class="theme-toggle-knob" />
				<span class="theme-toggle-icons" aria-hidden="true">
					<span class="theme-icon-sun">☀️</span>
					<span class="theme-icon-moon">🌙</span>
				</span>
			</button>
			<button
				class="titlebar-btn"
				type="button"
				aria-label="强制刷新"
				title="强制刷新"
				@click="onReload"
			>
				↻
			</button>
			<button
				class="titlebar-btn"
				type="button"
				aria-label="打开开发者工具"
				title="开发者工具"
				@click="onOpenDevTools"
			>
				🛠
			</button>
			<button class="titlebar-btn" type="button" aria-label="最小化" @click="onMinimize">—</button>
			<button class="titlebar-btn" type="button" aria-label="最大化/还原" @click="onToggleMaximize">
				□
			</button>
			<button class="titlebar-btn danger" type="button" aria-label="关闭" @click="onClose">
				×
			</button>
		</div>
	</header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
	getBackendRuntimeState,
	getSetupState,
	onBackendRuntimeStateChanged,
	minimizeWindow,
	toggleMaximizeWindow,
	closeWindow,
	reloadWindow,
	openDevTools
} from '../../electronBridge'
import type { BackendRuntimeState, SetupState } from '../../electronBridge/types'
import { ThemeStore } from '../../store/theme'

const router = useRouter()

const backendRuntime = ref<BackendRuntimeState | null>(null)

const setupState = ref<SetupState | null>(null)

let offRuntimeListener: (() => void) | null = null
let setupPollTimer: number | null = null

const setupPercent = computed(() => {
	const steps = Array.isArray(setupState.value?.steps) ? setupState.value!.steps : []
	if (!steps.length) return 0
	let sum = 0
	for (const step of steps) {
		const status = String(step?.status || '')
			.trim()
			.toLowerCase()
		if (status === 'ok') {
			sum += 1
			continue
		}
		if (status === 'running') {
			const pRaw = Number(step?.progress ?? 0)
			const p = Number.isFinite(pRaw) ? Math.max(0, Math.min(100, pRaw)) : 0
			sum += p / 100
			continue
		}
		if (status === 'failed') {
			sum += 0
			continue
		}
		const pRaw = Number(step?.progress ?? 0)
		const p = Number.isFinite(pRaw) ? Math.max(0, Math.min(100, pRaw)) : 0
		sum += p / 100
	}
	return Math.max(0, Math.min(100, Math.round((sum / steps.length) * 100)))
})

const setupRunning = computed(() => Boolean(setupState.value?.running))

const setupProgressTitle = computed(() => {
	const steps = Array.isArray(setupState.value?.steps) ? setupState.value!.steps : []
	const running = steps.find(
		(step) =>
			String(step?.status || '')
				.trim()
				.toLowerCase() === 'running'
	)
	if (running) {
		const detail = String(running.detail || '').trim()
		return detail ? `${running.label}：${detail}` : running.label
	}
	return setupRunning.value ? '环境流程执行中' : '环境流程待机'
})

const refreshSetupState = async () => {
	try {
		const st = await getSetupState()
		if (st) setupState.value = st
	} catch {
		// ignore
	}
}

const backendStatusClass = computed(() => {
	const st = backendRuntime.value
	if (!st) return 'bad'
	return st.running && st.healthy ? 'good' : 'bad'
})

const backendStatusText = computed(() => {
	const st = backendRuntime.value
	if (!st) return '后端状态未知'
	if (st.setupRunning) return '环境流程执行中'
	if (st.running && st.healthy) return `后端通畅 :${st.port || '-'}`
	if (st.running && !st.healthy) return '后端异常，请重启'
	return '后端未启动'
})

onMounted(async () => {
	const st = await getBackendRuntimeState()
	if (st) backendRuntime.value = st
	await refreshSetupState()
	offRuntimeListener = onBackendRuntimeStateChanged((next) => {
		backendRuntime.value = next
	})
	setupPollTimer = window.setInterval(() => {
		void refreshSetupState()
	}, 1000)
})

onBeforeUnmount(() => {
	offRuntimeListener?.()
	offRuntimeListener = null
	if (setupPollTimer != null) {
		window.clearInterval(setupPollTimer)
		setupPollTimer = null
	}
})

async function onMinimize() {
	try {
		await minimizeWindow()
	} catch {
		// ignore
	}
}

async function onReload() {
	try {
		await reloadWindow()
	} catch {
		// ignore
	}
}

async function onOpenDevTools() {
	try {
		await openDevTools()
	} catch {
		// ignore
	}
}

async function onToggleMaximize() {
	try {
		await toggleMaximizeWindow()
	} catch {
		// ignore
	}
}

async function onDoubleClick() {
	try {
		await toggleMaximizeWindow()
	} catch {
		// ignore
	}
}

async function onClose() {
	try {
		await closeWindow()
	} catch {
		// ignore
	}
}

function goWelcome() {
	void router.push({ name: 'Welcome' })
}

function toggleTheme() {
	ThemeStore.dispatch('toggleTheme')
}
</script>

<style scoped>
.global-title-bar {
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 8px;
	background: var(--theme-titlebar-bg);
	backdrop-filter: blur(14px) saturate(1.25);
	-webkit-backdrop-filter: blur(14px) saturate(1.25);
	border-bottom: 1px solid var(--theme-titlebar-border);
	box-shadow: var(--theme-shadow);

	user-select: none;
	-webkit-user-select: none;

	/* Electron frameless window drag region */
	-webkit-app-region: drag;
}

/* Theme Toggle Button */
.theme-toggle-btn {
	position: relative;
	width: 52px;
	height: 26px;
	border: 1px solid var(--theme-border);
	border-radius: 13px;
	background: var(--theme-bg-tertiary);
	cursor: pointer;
	overflow: hidden;
	-webkit-app-region: no-drag;
	flex-shrink: 0;
}

.theme-toggle-btn:hover {
	border-color: var(--theme-accent);
}

.theme-toggle-btn:focus {
	outline: none;
	box-shadow: 0 0 0 2px var(--theme-accent-muted);
}

.theme-toggle-track {
	position: absolute;
	inset: 2px;
	border-radius: 11px;
	background: var(--theme-bg-secondary);
}

.theme-toggle-knob {
	position: absolute;
	top: 2px;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: var(--theme-accent);
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

[data-theme='dark'] .theme-toggle-knob {
	left: 3px;
}

[data-theme='light'] .theme-toggle-knob {
	left: 27px;
}

.theme-toggle-icons {
	position: relative;
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 6px;
}

.theme-icon-sun,
.theme-icon-moon {
	font-size: 11px;
	line-height: 1;
}

[data-theme='dark'] .theme-icon-sun {
	opacity: 0.35;
}

[data-theme='dark'] .theme-icon-moon {
	opacity: 1;
}

[data-theme='light'] .theme-icon-sun {
	opacity: 1;
}

[data-theme='light'] .theme-icon-moon {
	opacity: 0.35;
}

.global-title-bar-left {
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 8px;
}

.backend-status-wrap {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	-webkit-app-region: no-drag;
}

.backend-status-dot {
	width: 10px;
	height: 10px;
	border-radius: 999px;
	border: 1px solid var(--theme-border);
	box-sizing: border-box;
}

.backend-status-dot.good {
	background: var(--theme-success);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-success) 68%, transparent);
}

.backend-status-dot.bad {
	background: var(--theme-error);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-error) 68%, transparent);
}

.backend-status-text {
	font-size: 12px;
	color: var(--theme-text-secondary);
	white-space: nowrap;
}

.setup-progress-chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 128px;
	max-width: 180px;
	padding: 2px 6px;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
}

.setup-progress-chip.running {
	border-color: color-mix(in srgb, var(--theme-success) 56%, var(--theme-border));
}

.setup-progress-label {
	font-size: 11px;
	color: var(--theme-text-secondary);
	white-space: nowrap;
}

.setup-progress-track {
	position: relative;
	width: 64px;
	height: 6px;
	background: color-mix(in srgb, var(--theme-text-secondary) 18%, transparent);
	overflow: hidden;
}

.setup-progress-fill {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--theme-success) 82%, #6fd1a0),
		var(--theme-success)
	);
}

.global-title-bar-logo {
	width: 16px;
	height: 16px;
	flex: 0 0 16px;
}

.global-title-bar-title {
	min-width: 0;
	font-size: 12px;
	color: var(--theme-text-primary);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.global-title-bar-right {
	display: flex;
	align-items: stretch;
	gap: 6px;

	/* Buttons must be clickable */
	-webkit-app-region: no-drag;
}

.titlebar-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--theme-border);
	border-radius: 0;
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-primary);
	height: 26px;
	width: 40px;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.titlebar-btn.status-jump {
	width: auto;
	min-width: 72px;
	padding: 0 10px;
	font-size: 12px;
}

.titlebar-btn:hover {
	background: var(--theme-hover-bg);
	border-color: var(--theme-hover-border);
}

.titlebar-btn.danger:hover {
	border-color: var(--theme-error);
}
</style>
