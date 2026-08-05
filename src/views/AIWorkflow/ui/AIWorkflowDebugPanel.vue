<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../../../i18n'
import type { Store } from 'vuex'
import { getErrorMessage } from '../../../types/utils'
import { runtimeDescription } from '../../../network/runtimePlatform'
import type { WorkflowNodeGenerationTask, WorkflowState } from '../../../aiworkflow/types'

type DebugPanelStore = Pick<Store<WorkflowState>, 'state'> & {
	state: Pick<WorkflowState, 'nodeGenerationTasksById' | 'nodeGenerationTaskIdsByNodeId'>
}

const props = defineProps<{
	store: DebugPanelStore
}>()

const { t } = useI18n()

const visible = ref(false)
const collapsed = ref(true)

const platformInfo = computed(() => runtimeDescription())

const backendPingStatus = ref<'idle' | 'checking' | 'reachable' | 'unreachable'>('idle')
const backendPingMessage = ref('')
const lastBackendCheck = ref<number | null>(null)

const backendStatusLabel = computed(() => {
	switch (backendPingStatus.value) {
		case 'idle':
			return t('aiworkflow.page.debugPanel.statusIdle')
		case 'checking':
			return t('aiworkflow.page.debugPanel.statusChecking')
		case 'reachable':
			return t('aiworkflow.page.debugPanel.statusReachable')
		case 'unreachable':
			return t('aiworkflow.page.debugPanel.statusUnreachable')
		default:
			return backendPingStatus.value
	}
})

const backendPingMessageText = computed(() => {
	if (backendPingMessage.value) return backendPingMessage.value
	return t('aiworkflow.page.debugPanel.unchecked')
})

const checkBackend = async () => {
	backendPingStatus.value = 'checking'
	backendPingMessage.value = t('aiworkflow.page.debugPanel.checking')
	const start = Date.now()
	try {
		const res = await fetch('/api/workflow/ping', {
			method: 'GET',
			mode: 'cors',
			cache: 'no-store'
		})
		if (res.ok) {
			backendPingStatus.value = 'reachable'
			backendPingMessage.value = t('aiworkflow.page.debugPanel.reachable', {
				status: String(res.status),
				ms: String(Date.now() - start)
			})
		} else {
			backendPingStatus.value = 'unreachable'
			backendPingMessage.value = t('aiworkflow.page.debugPanel.httpError', {
				status: String(res.status),
				ms: String(Date.now() - start)
			})
		}
	} catch (err: unknown) {
		backendPingStatus.value = 'unreachable'
		const msg = getErrorMessage(err)
		backendPingMessage.value = t('aiworkflow.page.debugPanel.unreachable', { message: msg })
	} finally {
		lastBackendCheck.value = Date.now()
	}
}

// 面板首次展开时自动 ping 一次
let hasAutoPingDone = false
const onPanelToggle = () => {
	if (!collapsed.value && !hasAutoPingDone) {
		hasAutoPingDone = true
		checkBackend()
	}
}

const taskCount = computed(() => {
	const map: Record<string, WorkflowNodeGenerationTask> | undefined =
		props.store?.state?.nodeGenerationTasksById
	if (!map) return 0
	return Object.keys(map).length
})

const taskList = computed(() => {
	const store = props.store
	if (!store?.state) return []
	const idsByNode: Record<string, string[]> = store.state.nodeGenerationTaskIdsByNodeId ?? {}
	const byId: Record<string, WorkflowNodeGenerationTask> = store.state.nodeGenerationTasksById ?? {}
	const nodes = Object.keys(idsByNode)
	const out: {
		nodeId: string
		status: string
		statusText: string
		progress: number
		startedAt: number
		finishedAt?: number
		kind: string
		errorMessage?: string
		results: number
	}[] = []
	for (const nodeId of nodes) {
		const ids = idsByNode[nodeId] || []
		for (const id of ids) {
			const task = byId[id]
			if (!task) continue
			out.push({
				nodeId,
				status: task.status ?? 'idle',
				statusText: task.statusText ?? '',
				progress: task.progress || 0,
				startedAt: task.startedAt || 0,
				finishedAt: task.finishedAt,
				kind: task.nodeType ?? 'unknown',
				errorMessage: task.errorMessage,
				results: task.results.length
			})
		}
	}
	return out
})

const fmtTime = (ms: number) => {
	if (!ms) return '-'
	const d = new Date(ms)
	const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

let keyHandler: ((e: KeyboardEvent) => void) | null = null

onMounted(() => {
	keyHandler = (e: KeyboardEvent) => {
		// Alt+Shift+D toggles the debug panel
		if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
			visible.value = !visible.value
		}
	}
	window.addEventListener('keydown', keyHandler)
})

onUnmounted(() => {
	if (keyHandler) window.removeEventListener('keydown', keyHandler)
})

const toggleCollapsed = () => {
	collapsed.value = !collapsed.value
	onPanelToggle()
}
</script>

<template>
	<div v-if="visible" class="dv-debug-panel" :class="{ 'dv-debug-panel-collapsed': collapsed }">
		<div class="dv-debug-panel-header" @click="toggleCollapsed">
			<span class="dv-debug-panel-title">🌐 {{ t('aiworkflow.page.debugPanel.title') }}</span>
			<span class="dv-debug-panel-toggle">{{ collapsed ? '▸' : '▾' }}</span>
		</div>
		<div v-if="!collapsed" class="dv-debug-panel-body">
			<div class="dv-debug-section">
				<h4>{{ t('aiworkflow.page.debugPanel.backendConnectivity') }}</h4>
				<div class="dv-debug-backend-row">
					<span
						class="dv-debug-backend-status"
						:class="`dv-debug-backend-status-${backendPingStatus}`"
					>
						{{ backendStatusLabel }}
					</span>
					<span class="dv-debug-backend-msg">{{ backendPingMessageText }}</span>
					<button
						class="dv-debug-backend-btn"
						type="button"
						@click.stop="checkBackend"
						:disabled="backendPingStatus === 'checking'"
					>
						{{
							backendPingStatus === 'checking'
								? t('aiworkflow.page.debugPanel.checking')
								: t('aiworkflow.page.debugPanel.recheck')
						}}
					</button>
				</div>
				<div class="dv-debug-backend-hint">
					{{ t('aiworkflow.page.debugPanel.webModeHint') }}
					<code>/api/* → http://127.0.0.1:5800</code>
					。
					{{ t('aiworkflow.page.debugPanel.confirmRunning') }}
					<code>python django-app/manage.py runserver 5800</code>
					{{ t('aiworkflow.page.debugPanel.or') }}
					<code>npm run dev:django</code>
					{{ t('aiworkflow.page.debugPanel.started') }}
				</div>
			</div>
			<div class="dv-debug-section">
				<h4>{{ t('aiworkflow.page.debugPanel.runtimeEnv') }}</h4>
				<dl>
					<dt>platform</dt>
					<dd>{{ platformInfo.platform }}</dd>
					<dt>vitePlatformOverride</dt>
					<dd>{{ platformInfo.vitePlatformOverride || t('aiworkflow.page.debugPanel.notSet') }}</dd>
					<dt>backendBaseUrl</dt>
					<dd>{{ platformInfo.backendBaseUrl || t('aiworkflow.page.debugPanel.notSet') }}</dd>
					<dt>userAgent</dt>
					<dd class="dv-debug-wrap">{{ platformInfo.userAgent }}</dd>
				</dl>
			</div>
			<div class="dv-debug-section">
				<h4>{{ t('aiworkflow.page.debugPanel.nodeTasks', { count: String(taskCount) }) }}</h4>
				<div v-if="!taskList.length" class="dv-debug-empty">
					{{ t('aiworkflow.page.debugPanel.noTasks') }}
				</div>
				<div
					v-for="task in taskList"
					:key="`${task.nodeId}-${task.startedAt}`"
					class="dv-debug-task-row"
				>
					<div class="dv-debug-task-head">
						<span class="dv-debug-task-kind">{{ task.kind }}</span>
						<span class="dv-debug-task-nodeid">({{ task.nodeId.slice(0, 8) }}…)</span>
						<span class="dv-debug-task-status" :class="`dv-debug-task-status-${task.status}`">
							{{ task.status }}
						</span>
						<span class="dv-debug-task-time">
							{{ t('aiworkflow.page.debugPanel.start') }} {{ fmtTime(task.startedAt) }}
						</span>
					</div>
					<div v-if="task.statusText" class="dv-debug-task-text">{{ task.statusText }}</div>
					<div class="dv-debug-task-bar">
						<div
							class="dv-debug-task-bar-fill"
							:style="{ width: Math.min(100, Math.max(0, task.progress)) + '%' }"
						></div>
					</div>
					<div class="dv-debug-task-meta">
						{{ t('aiworkflow.page.debugPanel.progress') }} {{ Math.round(task.progress) }}% ·
						{{ t('aiworkflow.page.debugPanel.results') }} {{ task.results }}
						{{ t('aiworkflow.page.debugPanel.items') }}
					</div>
					<div v-if="task.errorMessage" class="dv-debug-task-error">{{ task.errorMessage }}</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style>
.dv-debug-panel {
	position: fixed;
	right: 16px;
	bottom: 16px;
	width: 360px;
	max-height: 70vh;
	z-index: 9999;
	font-family:
		ui-sans-serif,
		system-ui,
		-apple-system,
		Segoe UI,
		Roboto,
		sans-serif;
	font-size: 12px;
	color: #eee;
	background: rgba(18, 20, 28, 0.92);
	border: 1px solid rgba(120, 160, 220, 0.4);
	border-radius: 8px;
	box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
	overflow: hidden;
	display: flex;
	flex-direction: column;
	backdrop-filter: blur(6px);
}

.dv-debug-panel-header {
	padding: 6px 10px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	cursor: pointer;
	user-select: none;
	border-bottom: 1px solid rgba(120, 160, 220, 0.18);
	background: rgba(120, 160, 220, 0.08);
}

.dv-debug-panel-title {
	font-weight: 600;
}

.dv-debug-panel-body {
	padding: 8px 10px;
	overflow-y: auto;
	flex: 1;
	min-height: 0;
}

.dv-debug-section + .dv-debug-section {
	margin-top: 8px;
	border-top: 1px solid rgba(120, 160, 220, 0.18);
	padding-top: 8px;
}

.dv-debug-section h4 {
	margin: 0 0 4px 0;
	font-size: 12px;
	color: #9ccfff;
}

.dv-debug-section dl {
	margin: 0;
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 2px 10px;
}

.dv-debug-section dt {
	color: #98a3b8;
}

.dv-debug-section dd {
	margin: 0;
	color: #ddd;
}

.dv-debug-wrap {
	word-break: break-all;
	white-space: normal;
}

.dv-debug-backend-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}

.dv-debug-backend-status {
	padding: 2px 8px;
	border-radius: 4px;
	font-weight: 600;
	color: #fff;
	background: rgba(150, 160, 180, 0.25);
}

.dv-debug-backend-status-reachable {
	background: rgba(34, 197, 94, 0.5);
}

.dv-debug-backend-status-unreachable {
	background: rgba(239, 68, 68, 0.55);
}

.dv-debug-backend-status-checking {
	background: rgba(59, 130, 246, 0.5);
	animation: dv-pulse 1.2s ease-in-out infinite;
}

.dv-debug-backend-status-idle {
	background: rgba(150, 160, 180, 0.25);
}

.dv-debug-backend-msg {
	color: #c9d2e5;
	font-size: 11px;
	flex: 1;
	min-width: 160px;
}

.dv-debug-backend-btn {
	padding: 3px 8px;
	font-size: 11px;
	background: rgba(120, 160, 220, 0.2);
	color: #cfe1ff;
	border: 1px solid rgba(120, 160, 220, 0.35);
	border-radius: 4px;
	cursor: pointer;
}

.dv-debug-backend-btn:hover:not(:disabled) {
	background: rgba(120, 160, 220, 0.35);
	color: #fff;
}

.dv-debug-backend-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dv-debug-backend-hint {
	margin-top: 6px;
	font-size: 11px;
	color: #a8b0c0;
	line-height: 1.5;
}

.dv-debug-backend-hint code {
	background: rgba(120, 160, 220, 0.15);
	border: 1px solid rgba(120, 160, 220, 0.25);
	border-radius: 3px;
	padding: 1px 5px;
	color: #cfe1ff;
	font-size: 11px;
}

@keyframes dv-pulse {
	0%,
	100% {
		opacity: 0.6;
	}
	50% {
		opacity: 1;
	}
}

.dv-debug-empty {
	color: #8a92a4;
	font-style: italic;
	padding: 4px 0;
}

.dv-debug-task-row {
	padding: 6px;
	border: 1px solid rgba(120, 160, 220, 0.18);
	border-radius: 6px;
	margin-top: 6px;
	background: rgba(30, 34, 46, 0.6);
}

.dv-debug-task-head {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.dv-debug-task-kind {
	font-weight: 600;
	color: #9ccfff;
}

.dv-debug-task-status {
	padding: 0 6px;
	border-radius: 4px;
	font-weight: 600;
	color: #fff;
	background: rgba(120, 160, 220, 0.35);
}

.dv-debug-task-status-submitting {
	background: rgba(245, 158, 11, 0.55);
}

.dv-debug-task-status-running {
	background: rgba(59, 130, 246, 0.55);
}

.dv-debug-task-status-completed {
	background: rgba(34, 197, 94, 0.55);
}

.dv-debug-task-status-error {
	background: rgba(239, 68, 68, 0.6);
}

.dv-debug-task-time {
	margin-left: auto;
	color: #98a3b8;
}

.dv-debug-task-text {
	margin-top: 2px;
	color: #c7d0de;
}

.dv-debug-task-bar {
	margin-top: 4px;
	height: 4px;
	background: rgba(120, 160, 220, 0.18);
	border-radius: 2px;
	overflow: hidden;
}

.dv-debug-task-bar-fill {
	height: 100%;
	background: #6ea8ff;
	transition: width 180ms ease;
}

.dv-debug-task-meta {
	margin-top: 2px;
	color: #98a3b8;
	font-size: 11px;
}

.dv-debug-task-error {
	margin-top: 4px;
	padding: 4px 6px;
	color: #ffb4a8;
	background: rgba(239, 68, 68, 0.12);
	border: 1px solid rgba(239, 68, 68, 0.35);
	border-radius: 4px;
	word-break: break-word;
}

.dv-debug-panel-collapsed .dv-debug-panel-body {
	display: none;
}
</style>
