<template>
	<div class="service-center-page">
		<div class="sc-bg-container" aria-hidden="true">
			<div class="sc-bg-bg"></div>
			<div class="sc-bg-grid"></div>
			<div class="sc-bg-glow sc-bg-glow-1"></div>
			<div class="sc-bg-glow sc-bg-glow-2"></div>
			<div class="sc-scanline-top"></div>
		</div>

		<div class="sc-shell">
			<div class="sc-header">
				<div class="sc-title-row">
					<h1 class="sc-title">后端服务中心</h1>
					<span class="sc-status-indicator" :class="anyRunning ? 'is-running' : 'is-idle'">
						<span class="sc-status-dot"></span>
						{{ anyRunning ? '运行中' : '空闲' }}
					</span>
				</div>
				<p class="sc-sub">管理本地 AI 后端进程（ComfyUI 等），实时查看日志与状态。</p>
			</div>

			<div class="sc-layout">
				<aside class="sc-sidebar">
					<div class="sc-sidebar-title">服务列表</div>
					<div class="sc-service-list">
						<div
							v-for="svc in services"
							:key="svc.key"
							class="sc-service-item"
							:class="{ active: svc.key === selectedKey, [svc.status]: true }"
							@click="selectService(svc.key)"
						>
							<div class="sc-service-item-frame" aria-hidden="true">
								<span class="corner tl"></span>
								<span class="corner tr"></span>
								<span class="corner bl"></span>
								<span class="corner br"></span>
							</div>
							<div class="sc-service-item-body">
								<div class="sc-service-item-head">
									<span class="sc-service-icon">⚙</span>
									<span class="sc-service-name">{{ svc.name }}</span>
									<span class="sc-service-badge" :class="svc.status">
										{{ statusLabel(svc.status) }}
									</span>
								</div>
								<div class="sc-service-desc">{{ svc.description }}</div>
								<div class="sc-service-meta">
									<template v-if="svc.pid">
										<span>PID {{ svc.pid }}</span>
									</template>
									<template v-if="svc.port">
										<span>端口 {{ svc.port }}</span>
									</template>
									<template v-if="svc.startTime">
										<span>启动于 {{ formatTime(svc.startTime) }}</span>
									</template>
									<template v-if="!svc.pid && !svc.port">
										<span>等待启动</span>
									</template>
								</div>
							</div>
						</div>
					</div>
				</aside>

				<section class="sc-main">
					<div class="sc-tabs-bar">
						<button
							v-for="tab in tabs"
							:key="tab.key"
							class="sc-tab-btn"
							:class="{ active: activeTab === tab.key }"
							@click="activeTab = tab.key"
						>
							<span class="sc-tab-indicator" v-if="activeTab === tab.key"></span>
							{{ tab.label }}
						</button>
					</div>

					<template v-if="activeTab === 'logs'">
						<div class="sc-panel sc-panel-head">
							<div class="sc-panel-frame" aria-hidden="true">
								<span class="corner tl"></span>
								<span class="corner tr"></span>
								<span class="corner bl"></span>
								<span class="corner br"></span>
							</div>
							<div class="sc-head-row">
								<div class="sc-head-info">
									<div class="sc-head-name">{{ selected.name }}</div>
									<div class="sc-head-desc">{{ selected.description }}</div>
								</div>
								<div class="sc-head-actions">
									<button
										class="sc-btn sc-btn-primary"
										:disabled="
											pendingOp !== null ||
											selected.status === 'running' ||
											selected.status === 'starting'
										"
										@click="startService"
									>
										<span class="sc-btn-icon">▶</span>
										启动
									</button>
									<button
										class="sc-btn sc-btn-warn"
										:disabled="pendingOp !== null || selected.status !== 'running'"
										@click="restartService"
									>
										<span class="sc-btn-icon">↻</span>
										重启
									</button>
									<button
										class="sc-btn sc-btn-danger"
										:disabled="
											pendingOp !== null ||
											selected.status === 'stopped' ||
											selected.status === 'stopping'
										"
										@click="stopService"
									>
										<span class="sc-btn-icon">■</span>
										停止
									</button>
									<button class="sc-btn sc-btn-ghost" @click="onOpenConfig">
										<span class="sc-btn-icon">⚙</span>
										配置
									</button>
									<button
										class="sc-btn sc-btn-ghost"
										@click="clearLogs"
										:disabled="logs.length === 0"
									>
										清空日志
									</button>
								</div>
							</div>

							<div v-if="lastError" class="sc-error-banner">
								<span class="sc-error-icon">!</span>
								<span>{{ lastError }}</span>
							</div>

							<div class="sc-stats-row">
								<div class="sc-stat">
									<span class="sc-stat-label">状态</span>
									<span class="sc-stat-value" :class="selected.status">
										{{ statusLabel(selected.status) }}
									</span>
								</div>
								<div class="sc-stat">
									<span class="sc-stat-label">PID</span>
									<span class="sc-stat-value">{{ selected.pid || '-' }}</span>
								</div>
								<div class="sc-stat">
									<span class="sc-stat-label">端口</span>
									<span class="sc-stat-value">{{ selected.port || '-' }}</span>
								</div>
								<div class="sc-stat">
									<span class="sc-stat-label">运行时长</span>
									<span class="sc-stat-value">{{ uptimeText }}</span>
								</div>
								<div class="sc-stat sc-stat-log-count">
									<span class="sc-stat-label">日志行数</span>
									<span class="sc-stat-value">{{ logs.length }}</span>
								</div>
							</div>
						</div>

						<div class="sc-panel sc-panel-log">
							<div class="sc-panel-frame" aria-hidden="true">
								<span class="corner tl"></span>
								<span class="corner tr"></span>
								<span class="corner bl"></span>
								<span class="corner br"></span>
							</div>
							<div class="sc-log-header">
								<span class="sc-log-title">
									<span class="sc-log-dot"></span>
									进程输出日志
								</span>
								<label class="sc-log-autoscroll">
									<input type="checkbox" v-model="logAutoScroll" />
									<span>自动滚动</span>
								</label>
							</div>
							<div
								class="svc-log-terminal sc-log-terminal"
								ref="terminalEl"
								@scroll="onTerminalScroll"
							>
								<div v-if="loadingInitial" class="sc-log-empty">正在加载历史日志…</div>
								<div v-else-if="logs.length === 0" class="sc-log-empty">
									服务未启动，暂无日志输出。点击「启动」开始运行 ComfyUI。
								</div>
								<pre
									v-for="(line, idx) in logs"
									:key="idx"
									class="sc-log-line"
									:class="`log-${line.stream}`"
									>{{ line.message }}</pre
								>
							</div>
						</div>
					</template>

					<template v-else-if="activeTab === 'terminal'">
						<ComfyUITerminalPanel />
					</template>

					<template v-else-if="activeTab === 'launch-args'">
						<ComfyUILaunchArgsPanel />
					</template>
				</section>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useComfyServiceManager } from '../composables/useComfyServiceManager'
import { openComfySetup } from '../electronBridge'
import type { ComfyServiceLifecycle } from '../electronBridge/types'
import ComfyUITerminalPanel from './ComfyUITerminalPanel.vue'
import ComfyUILaunchArgsPanel from './ComfyUILaunchArgsPanel.vue'

const {
	services,
	selectedKey,
	selected,
	logs,
	logAutoScroll,
	pendingOp,
	lastError,
	loadingInitial,
	selectService,
	startService,
	stopService,
	restartService,
	clearLogs
} = useComfyServiceManager()

const terminalEl = ref<HTMLElement | null>(null)

type ServiceTabKey = 'logs' | 'terminal' | 'launch-args'
const tabs: { key: ServiceTabKey; label: string }[] = [
	{ key: 'logs', label: '运行日志' },
	{ key: 'terminal', label: '终端' },
	{ key: 'launch-args', label: '启动参数' }
]
const activeTab = ref<ServiceTabKey>('logs')

const anyRunning = computed(() => services.value.some((s) => s.status === 'running'))

const uptimeText = computed(() => {
	const st = selected.value.startTime
	if (!st || selected.value.status !== 'running') return '-'
	const ms = Date.now() - st
	const sec = Math.floor(ms / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ${sec % 60}s`
	const hr = Math.floor(min / 60)
	return `${hr}h ${min % 60}m`
})

function padTwo(n: number) {
	return String(n).padStart(2, '0')
}

function formatTime(t: number | null | undefined) {
	if (!t) return '-'
	const d = new Date(t)
	return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`
}

function statusLabel(s: ComfyServiceLifecycle) {
	switch (s) {
		case 'running':
			return '运行中'
		case 'starting':
			return '启动中'
		case 'stopping':
			return '停止中'
		case 'stopped':
			return '已停止'
		default:
			return s
	}
}

function onOpenConfig() {
	openComfySetup({ source: 'service-center' })
}

function onTerminalScroll() {
	if (!terminalEl.value) return
	const el = terminalEl.value
	const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
	logAutoScroll.value = atBottom
}

onMounted(() => {
	if (terminalEl.value) {
		terminalEl.value.scrollTop = terminalEl.value.scrollHeight
	}
})

watch(logs, () => {
	if (!logAutoScroll.value || !terminalEl.value) return
	nextTick(() => {
		if (terminalEl.value) {
			terminalEl.value.scrollTop = terminalEl.value.scrollHeight
		}
	})
})
</script>

<style scoped>
.service-center-page {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 100%;
	overflow: hidden;
	box-sizing: border-box;
	padding: 32px 24px 32px 88px;
	background: linear-gradient(180deg, var(--pl-bg-0) 0%, var(--pl-bg-1) 100%);
	color: var(--pl-fg);
	display: flex;
	flex-direction: column;
}

.sc-bg-container {
	position: fixed;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	overflow: hidden;
}
.sc-bg-bg {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(
			ellipse 80% 60% at 20% 15%,
			color-mix(in srgb, var(--pl-accent) 18%, transparent),
			transparent 60%
		),
		radial-gradient(
			ellipse 60% 50% at 85% 90%,
			color-mix(in srgb, var(--pl-cold) 14%, transparent),
			transparent 55%
		),
		linear-gradient(180deg, var(--pl-bg-0) 0%, var(--pl-bg-1) 100%);
}
.sc-bg-grid {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(
			to right,
			color-mix(in srgb, var(--pl-accent) 8%, transparent) 1px,
			transparent 1px
		),
		linear-gradient(
			to bottom,
			color-mix(in srgb, var(--pl-accent) 8%, transparent) 1px,
			transparent 1px
		);
	background-size: 64px 64px;
	opacity: 0.55;
	mask-image: radial-gradient(ellipse at 50% 40%, #000 55%, transparent 100%);
	-webkit-mask-image: radial-gradient(ellipse at 50% 40%, #000 55%, transparent 100%);
}
.sc-bg-glow {
	position: absolute;
	border-radius: 8px;
	filter: blur(40px);
	will-change: transform;
	animation: sc-drift 20s ease-in-out infinite alternate;
}
.sc-bg-glow-1 {
	top: 8%;
	left: 10%;
	width: 520px;
	height: 320px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-accent) 35%, transparent),
		transparent 70%
	);
}
.sc-bg-glow-2 {
	bottom: 10%;
	right: 8%;
	width: 620px;
	height: 380px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-cold) 28%, transparent),
		transparent 70%
	);
	animation-duration: 24s;
}
@keyframes sc-drift {
	0% {
		transform: translate3d(0, 0, 0);
	}
	100% {
		transform: translate3d(30px, -20px, 0);
	}
}
.sc-scanline-top {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--pl-accent) 55%, transparent) 50%,
		transparent
	);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.sc-shell {
	position: relative;
	z-index: 1;
	max-width: 1400px;
	width: 100%;
	margin: 0 auto;
	display: flex;
	flex-direction: column;
	gap: 20px;
	flex: 1;
	min-height: 0;
}

.sc-header {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-bottom: 18px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
}
.sc-title-row {
	display: flex;
	align-items: center;
	gap: 16px;
}
.sc-title {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 35%, transparent);
	letter-spacing: 0.02em;
}
.sc-status-indicator {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 4px 12px;
	font-size: 11px;
	letter-spacing: 0.06em;
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 40%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
}
.sc-status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--pl-fg-soft);
	box-shadow: 0 0 6px currentColor;
}
.sc-status-indicator.is-running {
	border-color: color-mix(in srgb, #66ff99 50%, transparent);
	color: #66ff99;
}
.sc-status-indicator.is-running .sc-status-dot {
	background: #66ff99;
	animation: sc-pulse-dot 1.6s ease-in-out infinite;
}
.sc-status-indicator.is-idle {
	color: var(--pl-fg-soft);
}
@keyframes sc-pulse-dot {
	0%,
	100% {
		opacity: 1;
		box-shadow: 0 0 6px #66ff99;
	}
	50% {
		opacity: 0.5;
		box-shadow: 0 0 12px #66ff99;
	}
}
.sc-sub {
	margin: 0;
	font-size: 12px;
	color: var(--pl-fg-soft);
	line-height: 1.6;
}
.sc-sub::before {
	content: '';
	display: inline-block;
	width: 6px;
	height: 6px;
	margin-right: 8px;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	vertical-align: middle;
}

.sc-layout {
	display: grid;
	grid-template-columns: 300px 1fr;
	gap: 18px;
	flex: 1;
	min-height: 0;
}

.sc-sidebar {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 0;
	overflow: hidden;
}
.sc-sidebar-title {
	font-size: 11px;
	letter-spacing: 0.14em;
	color: var(--pl-fg-soft);
	padding-left: 4px;
	text-transform: uppercase;
}
.sc-service-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
	overflow-y: auto;
	flex: 1;
	padding-right: 4px;
}

.sc-service-item {
	position: relative;
	padding: 14px;
	cursor: pointer;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 70%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 85%, transparent)
	);
	border: 1px solid var(--pl-card-border);
	border-radius: 2px;
	box-shadow:
		0 2px 10px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 22%, transparent);
	transition:
		transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1),
		box-shadow 220ms ease,
		border-color 220ms ease,
		filter 220ms ease;
}
.sc-service-item:hover {
	transform: translateY(-1px);
	filter: brightness(1.08);
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
}
.sc-service-item.active {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--pl-accent) 40%, transparent),
		0 8px 28px rgba(0, 0, 0, 0.45),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 30%, transparent);
}
.sc-service-item.running {
	border-left: 2px solid #66ff99;
}
.sc-service-item.error,
.sc-service-item.stopped:not(.active) {
	opacity: 0.85;
}

.sc-service-item-frame {
	position: absolute;
	inset: 0;
	pointer-events: none;
}
.sc-service-item-frame .corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--pl-accent);
}
.sc-service-item-frame .corner.tl {
	top: 3px;
	left: 3px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-service-item-frame .corner.tr {
	top: 3px;
	right: 3px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-service-item-frame .corner.bl {
	bottom: 3px;
	left: 3px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-service-item-frame .corner.br {
	bottom: 3px;
	right: 3px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.sc-service-item-body {
	position: relative;
	z-index: 2;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.sc-service-item-head {
	display: flex;
	align-items: center;
	gap: 8px;
}
.sc-service-icon {
	font-size: 14px;
	color: var(--pl-accent);
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 60%, transparent);
}
.sc-service-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg);
	flex: 1;
}
.sc-service-badge {
	font-size: 10px;
	padding: 2px 8px;
	border-radius: 2px;
	letter-spacing: 0.06em;
	background: color-mix(in srgb, var(--pl-fg-soft) 15%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 30%, transparent);
}
.sc-service-badge.running {
	color: #66ff99;
	background: color-mix(in srgb, #66ff99 12%, transparent);
	border-color: color-mix(in srgb, #66ff99 40%, transparent);
}
.sc-service-badge.starting {
	color: #ffd166;
	background: color-mix(in srgb, #ffd166 12%, transparent);
	border-color: color-mix(in srgb, #ffd166 40%, transparent);
}
.sc-service-badge.stopping {
	color: #ff9f6b;
	background: color-mix(in srgb, #ff9f6b 12%, transparent);
	border-color: color-mix(in srgb, #ff9f6b 40%, transparent);
}
.sc-service-badge.stopped {
	color: var(--pl-fg-soft);
}

.sc-service-desc {
	font-size: 11px;
	color: var(--pl-fg-soft);
	line-height: 1.5;
}
.sc-service-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 12px;
	font-size: 10px;
	color: color-mix(in srgb, var(--pl-fg-soft) 80%, transparent);
	letter-spacing: 0.02em;
}
.sc-service-meta span::before {
	content: '›';
	margin-right: 4px;
	color: var(--pl-accent);
	opacity: 0.7;
}

.sc-main {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-height: 0;
	overflow: hidden;
}

.sc-tabs-bar {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
	padding: 4px;
	background: color-mix(in srgb, var(--pl-bg-1) 80%, transparent);
	border: 1px solid var(--pl-card-border);
	border-radius: 2px;
}
.sc-tab-btn {
	position: relative;
	padding: 8px 20px;
	font-size: 12px;
	letter-spacing: 0.04em;
	cursor: pointer;
	border: none;
	background: transparent;
	color: var(--pl-fg-soft);
	transition: all 200ms ease;
	border-radius: 2px;
}
.sc-tab-btn:hover {
	color: var(--pl-fg);
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
}
.sc-tab-btn.active {
	color: var(--pl-fg);
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}
.sc-tab-indicator {
	position: absolute;
	bottom: 4px;
	left: 50%;
	transform: translateX(-50%);
	width: 20px;
	height: 2px;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	border-radius: 1px;
}

.sc-panel {
	position: relative;
	padding: 18px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 60%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 80%, transparent)
	);
	border: 1px solid var(--pl-card-border);
	border-radius: 2px;
	box-shadow:
		0 2px 10px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 22%, transparent);
}
.sc-panel-frame {
	position: absolute;
	inset: 0;
	pointer-events: none;
}
.sc-panel-frame .corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--pl-accent);
}
.sc-panel-frame .corner.tl {
	top: 4px;
	left: 4px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.tr {
	top: 4px;
	right: 4px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.bl {
	bottom: 4px;
	left: 4px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.br {
	bottom: 4px;
	right: 4px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.sc-panel-head {
	flex-shrink: 0;
}
.sc-head-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	flex-wrap: wrap;
}
.sc-head-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.sc-head-name {
	font-size: 16px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}
.sc-head-desc {
	font-size: 12px;
	color: var(--pl-fg-soft);
}

.sc-head-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.sc-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	padding: 0 14px;
	font-size: 12px;
	letter-spacing: 0.04em;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	color: var(--pl-fg);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	transition:
		border-color 200ms ease,
		background 200ms ease,
		box-shadow 200ms ease,
		transform 160ms ease;
}
.sc-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 22%, transparent);
}
.sc-btn:active:not(:disabled) {
	transform: translateY(1px);
}
.sc-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.sc-btn-icon {
	font-size: 10px;
}
.sc-btn-primary {
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-accent) 30%, transparent),
		color-mix(in srgb, var(--pl-accent) 15%, transparent)
	);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	color: #fff;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}
.sc-btn-primary:hover:not(:disabled) {
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-accent) 45%, transparent),
		color-mix(in srgb, var(--pl-accent) 25%, transparent)
	);
	box-shadow: 0 0 20px color-mix(in srgb, var(--pl-accent) 35%, transparent);
}
.sc-btn-warn {
	border-color: color-mix(in srgb, #ffd166 40%, transparent);
	color: #ffd166;
}
.sc-btn-warn:hover:not(:disabled) {
	background: color-mix(in srgb, #ffd166 12%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, #ffd166 22%, transparent);
}
.sc-btn-danger {
	border-color: color-mix(in srgb, #ff6b6b 40%, transparent);
	color: #ff8a8a;
}
.sc-btn-danger:hover:not(:disabled) {
	background: color-mix(in srgb, #ff6b6b 12%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, #ff6b6b 22%, transparent);
}
.sc-btn-ghost {
	border-color: color-mix(in srgb, var(--pl-fg-soft) 25%, transparent);
	color: var(--pl-fg-soft);
}

.sc-error-banner {
	margin-top: 12px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	font-size: 12px;
	color: color-mix(in srgb, #ff6b6b 90%, #fff);
	background: color-mix(in srgb, #ff6b6b 10%, transparent);
	border: 1px solid color-mix(in srgb, #ff6b6b 35%, transparent);
	border-radius: 2px;
}
.sc-error-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #ff6b6b;
	color: #fff;
	font-weight: 700;
	font-size: 12px;
	flex-shrink: 0;
}

.sc-stats-row {
	margin-top: 14px;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	gap: 12px;
}
.sc-stat {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-radius: 2px;
}
.sc-stat-label {
	font-size: 10px;
	letter-spacing: 0.1em;
	color: var(--pl-fg-soft);
	text-transform: uppercase;
}
.sc-stat-value {
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg);
	font-variant-numeric: tabular-nums;
}
.sc-stat-value.running {
	color: #66ff99;
	text-shadow: 0 0 8px color-mix(in srgb, #66ff99 40%, transparent);
}
.sc-stat-value.starting {
	color: #ffd166;
}
.sc-stat-value.stopping {
	color: #ff9f6b;
}
.sc-stat-value.stopped {
	color: var(--pl-fg-soft);
}

.sc-panel-log {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	padding: 14px;
}
.sc-log-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px 10px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	margin-bottom: 8px;
}
.sc-log-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--pl-fg);
	letter-spacing: 0.06em;
}
.sc-log-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	animation: sc-pulse-dot 2s ease-in-out infinite;
}
.sc-log-autoscroll {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	color: var(--pl-fg-soft);
	cursor: pointer;
	user-select: none;
}
.sc-log-autoscroll input {
	accent-color: var(--pl-accent);
}

.sc-log-terminal {
	flex: 1;
	overflow-y: auto;
	padding: 10px 12px;
	background: color-mix(in srgb, #000 50%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	border-radius: 2px;
	font-family: 'JetBrains Mono', 'Consolas', 'Menlo', monospace;
	font-size: 12px;
	line-height: 1.55;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 40%, transparent) transparent;
}
.sc-log-terminal::-webkit-scrollbar {
	width: 8px;
}
.sc-log-terminal::-webkit-scrollbar-track {
	background: transparent;
}
.sc-log-terminal::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	border-radius: 4px;
}
.sc-log-empty {
	color: color-mix(in srgb, var(--pl-fg-soft) 70%, transparent);
	font-style: italic;
	text-align: center;
	padding: 30px 10px;
}
.sc-log-line {
	margin: 0;
	padding: 0;
	white-space: pre-wrap;
	word-break: break-all;
	color: #cfe8ff;
}
.sc-log-line.log-stdout {
	color: #cfe8ff;
}
.sc-log-line.log-stderr {
	color: #ff8a8a;
}
.sc-log-line.log-system {
	color: color-mix(in srgb, var(--pl-accent) 80%, #fff);
}
</style>
