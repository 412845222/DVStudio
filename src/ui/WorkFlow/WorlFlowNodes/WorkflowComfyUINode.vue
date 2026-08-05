<template>
	<WorkflowNodeBase
		ref="baseRef"
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="renderInputs"
		:outputs="outputs"
		:selected="selected"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@update:world-position="(p) => emit('update:worldPosition', p)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-comfy" @pointerdown.stop>
				<div class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.address') }}</div>
					<input
						class="wf-comfy-input"
						type="text"
						:value="baseUrl"
						placeholder="http://127.0.0.1:8188"
						@input="onInput"
					/>
				</div>

				<div class="wf-comfy-svc-actions">
					<button
						class="wf-comfy-btn wf-comfy-btn-sm"
						type="button"
						:disabled="svcStartDisabled"
						:title="svcStartTitle"
						@click.stop="onServiceStart"
					>
						{{
							svcPendingOp === 'starting'
								? t('nodes.comfyui.serviceStarting')
								: t('nodes.comfyui.serviceStart')
						}}
					</button>
					<button
						class="wf-comfy-btn wf-comfy-btn-sm"
						type="button"
						:disabled="svcStopDisabled"
						@click.stop="onServiceStop"
					>
						{{
							svcPendingOp === 'stopping'
								? t('nodes.comfyui.serviceStopping')
								: t('nodes.comfyui.serviceStop')
						}}
					</button>
					<button
						class="wf-comfy-btn wf-comfy-btn-sm wf-comfy-btn-ghost"
						type="button"
						:disabled="svcRestartDisabled"
						@click.stop="onServiceRestart"
					>
						{{ t('nodes.comfyui.serviceRestart') }}
					</button>
					<button
						class="wf-comfy-btn wf-comfy-btn-sm wf-comfy-btn-ghost"
						type="button"
						@click.stop="onToggleLogs"
					>
						{{ showLogs ? t('nodes.comfyui.serviceHideLogs') : t('nodes.comfyui.serviceLogs') }}
					</button>
					<button
						class="wf-comfy-btn wf-comfy-btn-sm wf-comfy-btn-ghost"
						type="button"
						title="ComfyUI 环境设置"
						@click.stop="onOpenSetup"
					>
						⚙️
					</button>
				</div>

				<div class="wf-comfy-svc-status" :class="svcStatusClass">
					<span class="wf-comfy-svc-dot" />
					<span class="wf-comfy-svc-text">{{ svcStatusText }}</span>
					<span v-if="svcRuntime?.running && svcRuntime.pid" class="wf-comfy-svc-meta">
						PID:{{ svcRuntime.pid }} :{{ svcRuntime.port || 8188 }}
					</span>
					<span v-if="svcRuntime?.running && svcUptime" class="wf-comfy-svc-meta">
						{{ t('nodes.comfyui.serviceUptime', { time: svcUptime }) }}
					</span>
				</div>
				<div v-if="svcLastError" class="wf-comfy-svc-error">{{ svcLastError }}</div>
				<div v-if="!svcConfigured" class="wf-comfy-svc-hint">
					{{ t('nodes.comfyui.serviceClickToConfig') }}
				</div>

				<div class="wf-comfy-actions">
					<button
						class="wf-comfy-btn"
						type="button"
						:disabled="!baseUrlTrimmed || status === 'connecting'"
						@click.stop="onConnect"
					>
						{{
							status === 'connecting' ? t('nodes.comfyui.connecting') : t('nodes.comfyui.connect')
						}}
					</button>
					<div class="wf-comfy-status" :class="statusClass">
						{{ connectedStatusText }}
					</div>
				</div>

				<div v-if="status === 'connected' && systemInfo" class="wf-comfy-info">
					<div v-if="comfyUIVersion" class="wf-comfy-info-item">
						<span class="wf-comfy-info-label">ComfyUI</span>
						<span class="wf-comfy-info-value">{{ comfyUIVersion }}</span>
					</div>
					<div v-if="nodeCount > 0" class="wf-comfy-info-item">
						<span class="wf-comfy-info-label">
							{{ t('nodes.comfyui.nodeCount', { count: nodeCount }) }}
						</span>
					</div>
					<div v-if="checkpoints.length > 0" class="wf-comfy-info-item">
						<span class="wf-comfy-info-label">
							{{ t('nodes.comfyui.availableCheckpoints', { count: checkpoints.length }) }}
						</span>
					</div>
				</div>

				<div v-if="status === 'connected'" class="wf-comfy-workflows">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.availableWorkflows') }}</div>
					<select
						class="wf-comfy-select"
						:value="workflowPath"
						:disabled="!workflows.length"
						@change="onWorkflowChange"
					>
						<option value="" disabled>
							{{
								workflows.length
									? t('nodes.comfyui.selectWorkflow')
									: t('nodes.comfyui.noWorkflowsFound')
							}}
						</option>
						<option v-for="wf in workflows" :key="wf.path" :value="wf.path">
							{{ wf.name || wf.path }}
						</option>
					</select>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-history">
					<div v-if="!historyChecked" class="wf-comfy-history-status checking">
						<span class="wf-comfy-history-dot" />
						<span>{{ t('nodes.comfyui.historyChecking') }}</span>
					</div>
					<div v-else-if="hasHistory" class="wf-comfy-history-status ready">
						<span class="wf-comfy-history-dot" />
						<span class="wf-comfy-history-text">{{ historyStatusText }}</span>
						<button
							class="wf-comfy-clear-history-btn"
							type="button"
							:title="t('nodes.comfyui.clearHistoryCache')"
							@click.stop="onClearHistoryCache"
						>
							✕
						</button>
					</div>
					<div v-else class="wf-comfy-history-guide">
						<div class="wf-comfy-history-guide-title">
							⚠️ {{ t('nodes.comfyui.noHistoryTitle') }}
						</div>
						<div class="wf-comfy-history-guide-desc">{{ historyStatusText }}</div>
						<div class="wf-comfy-history-guide-actions">
							<button
								class="wf-comfy-btn wf-comfy-btn-sm"
								type="button"
								@click.stop="onOpenComfyUI"
							>
								{{ t('nodes.comfyui.openComfyUI') }}
							</button>
							<button
								class="wf-comfy-btn wf-comfy-btn-sm wf-comfy-btn-ghost"
								type="button"
								@click.stop="onRefreshHistory"
							>
								{{ t('nodes.comfyui.refreshHistoryCheck') }}
							</button>
						</div>
					</div>
					<div v-if="hasHistory && historyInputSummary" class="wf-comfy-history-inputs">
						{{ historyInputSummary }}
					</div>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.positivePrompt') }}</div>
					<div class="wf-comfy-prompt">
						<div
							v-if="inputAnchorIndex >= 0"
							class="wf-comfy-anchor-hit wf-anchor-text"
							:class="{ hovered: hoverInputAnchorId === 'in' }"
							:title="t('nodes.comfyui.textInputPositive')"
							:data-wf-node-id="nodeId"
							data-wf-anchor-id="in"
							data-wf-dir="in"
							:data-wf-anchor-index="inputAnchorIndex"
							@pointerdown.stop
							@pointerup.stop="
								emit('end-link', {
									nodeId,
									anchorId: 'in',
									anchorIndex: inputAnchorIndex
								})
							"
						/>
						<textarea
							class="wf-comfy-textarea"
							:value="positivePrompt"
							:placeholder="t('nodes.comfyui.leaveBlankWorkflow')"
							@input="onPositivePromptInput"
						/>
					</div>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.negativePrompt') }}</div>
					<div class="wf-comfy-prompt">
						<textarea
							class="wf-comfy-textarea"
							:value="negativePrompt"
							:placeholder="t('nodes.comfyui.leaveBlankWorkflow')"
							@input="onNegativePromptInput"
						/>
					</div>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-row wf-comfy-autowire">
					<label class="wf-comfy-checkbox" @pointerdown.stop>
						<input type="checkbox" :checked="autoWireEnabled" @change="onToggleAutoWire" />
						<span>{{ t('nodes.comfyui.autoWireEnabled') }}</span>
					</label>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-run">
					<div class="wf-comfy-runbar">
						<button class="wf-comfy-btn" type="button" :disabled="runDisabled" @click.stop="onRun">
							{{ t('nodes.comfyui.run') }}
						</button>
						<button
							class="wf-comfy-btn"
							type="button"
							:disabled="cancelDisabled"
							@click.stop="onCancel"
						>
							{{ t('common.cancel') }}
						</button>
					</div>

					<div class="wf-comfy-progress">
						<div class="wf-comfy-progress-track">
							<div class="wf-comfy-progress-bar" :style="{ width: progressWidth }" />
						</div>
						<div class="wf-comfy-progress-text">{{ runStatusTextDisplay }}</div>
					</div>
				</div>

				<div v-if="showLogs" class="wf-comfy-logs-section">
					<div class="wf-comfy-logs-header">
						<span class="wf-comfy-logs-title">
							{{ t('nodes.comfyui.serviceLogsHeader', { count: svcLogs.length }) }}
						</span>
						<button
							class="wf-comfy-btn wf-comfy-btn-xs wf-comfy-btn-ghost"
							type="button"
							@click.stop="onClearLogs"
						>
							{{ t('nodes.comfyui.serviceClearLogs') }}
						</button>
					</div>
					<div ref="logContainerRef" class="wf-comfy-logs" @pointerdown.stop>
						<div v-if="svcLogs.length === 0" class="wf-comfy-logs-empty">—</div>
						<div
							v-for="(entry, idx) in svcLogs"
							:key="idx"
							class="wf-comfy-log-line"
							:class="'wf-comfy-log-' + entry.stream"
						>
							<span class="wf-comfy-log-ts">[{{ formatLogTime(entry.ts) }}]</span>
							<span class="wf-comfy-log-src">{{ entry.stream.toUpperCase() }}</span>
							<span class="wf-comfy-log-msg">{{ entry.message }}</span>
						</div>
					</div>
				</div>

				<div v-if="mediaOutputs.length" class="wf-comfy-outputs">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.outputMedia') }}</div>
					<a
						v-for="(m, idx) in mediaOutputs"
						:key="m.url + idx"
						class="wf-comfy-output-link"
						:href="m.url"
						target="_blank"
						rel="noreferrer"
						@click.stop
					>
						{{
							m.kind === 'video'
								? t('common.video')
								: m.kind === 'model3d'
									? t('common.model3d')
									: t('common.image')
						}}
						· {{ m.filename || `#${idx + 1}` }}
					</a>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-comfy-inputs" @pointerdown.stop>
				<div class="wf-comfy-inputs-header">
					<div class="wf-comfy-inputs-title">{{ t('nodes.comfyui.workflowInputs') }}</div>
				</div>
				<div v-if="!workflowPath" class="wf-comfy-inputs-empty">
					{{ t('nodes.comfyui.workflowInputsHint') }}
				</div>
				<div v-else>
					<div v-for="(a, idx) in displayInputs" :key="a.id" class="wf-comfy-input-item">
						<div class="wf-comfy-input-index">{{ idx + 1 }}</div>
						<div class="wf-comfy-input-text">{{ a.label || a.id }}</div>
					</div>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import { openComfySetup } from '../../../electronBridge'

const { t } = useI18n()

type ServiceLogEntry = {
	ts: number
	stream: 'system' | 'stdout' | 'stderr'
	message: string
}

type ServiceRuntimeStatus = {
	running: boolean
	pid: number | null
	port: number
	startTime: number | null
	exitCode: number | null
}

const showLogs = ref(false)
const svcRuntime = ref<ServiceRuntimeStatus | null>(null)
const svcPendingOp = ref<'starting' | 'stopping' | null>(null)
const svcLastError = ref('')
const svcLogs = ref<ServiceLogEntry[]>([])
const svcConfig = ref<{
	installPath?: string
	pythonPath?: string
	port?: number
	extraArgs?: string[]
} | null>(null)
const svcConfigured = ref(false)
const logContainerRef = ref<HTMLElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)
const tick = ref(0)
let uptimeTimer: ReturnType<typeof setInterval> | null = null
let statusPollTimer: ReturnType<typeof setInterval> | null = null
let logCleanupFn: (() => void) | null = null
let statusCleanupFn: (() => void) | null = null
let exitCleanupFn: (() => void) | null = null
let clearCleanupFn: (() => void) | null = null
let configChangeCleanupFn: (() => void) | null = null
let autoConnectTimer: ReturnType<typeof setTimeout> | null = null

function pad2(n: number) {
	return n < 10 ? '0' + n : '' + n
}

function formatLogTime(ts: number) {
	const d = new Date(ts)
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatUptime(ms: number) {
	const sec = Math.floor(ms / 1000)
	const m = Math.floor(sec / 60)
	const s = sec % 60
	if (m > 0) return `${m}m${s}s`
	return `${s}s`
}

function getSetup() {
	return (window as any).dweb?.comfyui?.setup
}

async function refreshServiceConfig() {
	const setup = getSetup()
	if (!setup?.getConfig) {
		svcConfigured.value = false
		return
	}
	try {
		const cfg = await setup.getConfig()
		const config = cfg?.config || cfg || {}
		svcConfig.value = config
		svcConfigured.value = !!(config.installPath && String(config.installPath).trim())
	} catch {
		svcConfigured.value = false
	}
}

async function refreshServiceStatus() {
	const setup = getSetup()
	if (!setup?.getServiceStatus) return
	try {
		const r = await setup.getServiceStatus()
		if (r) {
			svcRuntime.value = {
				running: !!r.running,
				pid: typeof r.pid === 'number' ? r.pid : null,
				port: typeof r.port === 'number' ? r.port : 8188,
				startTime: typeof r.startTime === 'number' ? r.startTime : null,
				exitCode: typeof r.exitCode === 'number' ? r.exitCode : null
			}
			if (r.running) {
				svcPendingOp.value = null
			} else {
				if (svcPendingOp.value !== 'starting') svcPendingOp.value = null
			}
		}
	} catch {
		// ignore
	}
}

async function loadServiceLogs() {
	const setup = getSetup()
	if (!setup?.getServiceLogs) return
	try {
		const r = await setup.getServiceLogs()
		if (r?.logs && Array.isArray(r.logs)) {
			svcLogs.value = r.logs.slice()
			scrollLogsToBottom()
		}
	} catch {
		// ignore
	}
}

function scrollLogsToBottom() {
	nextTick(() => {
		if (logContainerRef.value) {
			logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
		}
		baseRef.value?.requestAutoResize()
	})
}

function subscribeServiceEvents() {
	const setup = getSetup()
	if (!setup) return

	if (setup.onServiceLog) {
		logCleanupFn = setup.onServiceLog((entry: ServiceLogEntry) => {
			svcLogs.value.push(entry)
			if (svcLogs.value.length > 300) {
				svcLogs.value = svcLogs.value.slice(-200)
			}
			scrollLogsToBottom()
		})
	}
	if (setup.onServiceStatusChange) {
		statusCleanupFn = setup.onServiceStatusChange((status: ServiceRuntimeStatus) => {
			svcRuntime.value = status
			if (status.running) {
				svcPendingOp.value = null
				svcLastError.value = ''
			}
		})
	}
	if (setup.onServiceExit) {
		exitCleanupFn = setup.onServiceExit(() => {
			svcPendingOp.value = null
		})
	}
	if (setup.onServiceLogsCleared) {
		clearCleanupFn = setup.onServiceLogsCleared(() => {
			svcLogs.value = []
		})
	}
	if (setup.onConfigChange) {
		configChangeCleanupFn = setup.onConfigChange(() => {
			refreshServiceConfig()
		})
	}
}

function unsubscribeServiceEvents() {
	logCleanupFn?.()
	statusCleanupFn?.()
	exitCleanupFn?.()
	clearCleanupFn?.()
	configChangeCleanupFn?.()
	logCleanupFn = null
	statusCleanupFn = null
	exitCleanupFn = null
	clearCleanupFn = null
	configChangeCleanupFn = null
}

async function onServiceStart() {
	if (svcPendingOp.value) return
	if (svcRuntime.value?.running) return
	await refreshServiceConfig()
	if (!svcConfigured.value) {
		onOpenSetup()
		return
	}
	const setup = getSetup()
	if (!setup?.startService) return
	svcPendingOp.value = 'starting'
	svcLastError.value = ''
	if (!showLogs.value) showLogs.value = true
	requestResize()
	try {
		const cfg = svcConfig.value || {}
		const port = typeof cfg.port === 'number' ? cfg.port : 8188
		const r = await setup.startService({
			installPath: cfg.installPath || '',
			port,
			extraArgs: Array.isArray(cfg.extraArgs) ? [...cfg.extraArgs] : []
		})
		if (r?.ok) {
			scheduleAutoConnect(port)
		} else {
			svcLastError.value = r?.error || t('nodes.comfyui.serviceStartFailed')
			svcPendingOp.value = null
		}
	} catch (e: any) {
		svcLastError.value = e?.message || String(e)
		svcPendingOp.value = null
	}
}

async function onServiceStop() {
	if (svcPendingOp.value) return
	svcPendingOp.value = 'stopping'
	const setup = getSetup()
	if (!setup?.stopService) {
		svcPendingOp.value = null
		return
	}
	try {
		await setup.stopService()
	} catch (e: any) {
		svcLastError.value = e?.message || String(e)
	} finally {
		svcPendingOp.value = null
	}
}

async function onServiceRestart() {
	if (svcPendingOp.value) return
	svcPendingOp.value = 'starting'
	svcLastError.value = ''
	if (!showLogs.value) showLogs.value = true
	requestResize()
	const setup = getSetup()
	if (!setup?.restartService) return
	try {
		await refreshServiceConfig()
		const cfg = svcConfig.value || {}
		const port = typeof cfg.port === 'number' ? cfg.port : 8188
		const r = await setup.restartService({
			installPath: cfg.installPath || '',
			port,
			extraArgs: Array.isArray(cfg.extraArgs) ? [...cfg.extraArgs] : []
		})
		if (r?.ok) {
			scheduleAutoConnect(port)
		} else {
			svcLastError.value = r?.error || t('nodes.comfyui.serviceStartFailed')
			svcPendingOp.value = null
		}
	} catch (e: any) {
		svcLastError.value = e?.message || String(e)
		svcPendingOp.value = null
	}
}

async function onClearLogs() {
	const setup = getSetup()
	if (!setup?.clearServiceLogs) return
	try {
		await setup.clearServiceLogs()
	} catch {
		// ignore
	}
}

function onToggleLogs() {
	showLogs.value = !showLogs.value
	requestResize()
	if (showLogs.value) {
		loadServiceLogs()
		scrollLogsToBottom()
	}
}

async function waitForServiceReady(port: number, timeoutMs = 30000): Promise<boolean> {
	const startedAt = Date.now()
	const baseUrl = `http://127.0.0.1:${port}`
	const dweb = (window as any).dweb
	const ping = dweb?.comfyui?.runtime?.ping
	while (Date.now() - startedAt < timeoutMs) {
		try {
			const r = ping ? await ping({ baseUrl }) : null
			if (r?.ok) return true
		} catch {}
		await new Promise((r) => setTimeout(r, 1500))
	}
	return false
}

function scheduleAutoConnect(port?: number) {
	if (autoConnectTimer) clearTimeout(autoConnectTimer)
	const runningPort = port || svcRuntime.value?.port || 8188
	const expectedUrl = `http://127.0.0.1:${runningPort}`
	if (baseUrlTrimmed.value !== expectedUrl) {
		emit('update-comfyui-settings', { baseUrl: expectedUrl })
	}
	appendServiceSystemLog(`[连接] 等待ComfyUI服务就绪 (端口 ${runningPort})...`)
	waitForServiceReady(runningPort).then((ready) => {
		if (ready) {
			appendServiceSystemLog(`[连接] ComfyUI服务已就绪，正在连接...`)
			if (status.value !== 'connected' && status.value !== 'connecting') {
				emit('connect-comfyui', { baseUrl: expectedUrl })
			}
		} else {
			appendServiceSystemLog(`[连接] 等待ComfyUI就绪超时，请检查日志或手动点击连接`)
			svcLastError.value = t('nodes.comfyui.serviceStartFailed')
			svcPendingOp.value = null
		}
	})
}

function appendServiceSystemLog(msg: string) {
	svcLogs.value.push({ ts: Date.now(), stream: 'system', message: msg })
	if (svcLogs.value.length > 300) {
		svcLogs.value = svcLogs.value.slice(-200)
	}
	scrollLogsToBottom()
}

function onOpenSetup() {
	openComfySetup({ source: 'node' })
}

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	comfyuiSettings?: {
		baseUrl?: string
		status?: 'idle' | 'connecting' | 'connected' | 'error'
		message?: string
		lastCheckedAt?: number
		workflows?: { path: string; name: string; source?: 'userdata' | 'history' }[]
		workflowPath?: string
		workflowSource?: 'userdata' | 'history'
		positivePrompt?: string
		negativePrompt?: string
		objectInfo?: Record<string, unknown>
		systemInfo?: {
			system?: {
				comfyui_version?: string
				os?: string
				python_version?: string
				pytorch_version?: string
				[key: string]: unknown
			}
			devices?: Array<{
				name: string
				type?: string
				[key: string]: unknown
			}>
			nodeCount?: number
		}
		checkpoints?: string[]
		autoWireEnabled?: boolean
		outputs?: Array<{
			kind: 'image' | 'video' | 'model3d'
			url: string
			filename?: string
			anchorId?: string
			nodeId?: string
			sourcePath?: string
			subfolder?: string
			type?: string
		}>
		runStatus?: 'idle' | 'running' | 'canceling' | 'completed' | 'failed' | 'cancelled'
		promptId?: string
		progress?: number
		statusText?: string
		lastUpdateAt?: number
		hasHistory?: boolean
		historyChecked?: boolean
		historyError?: string
		historyGuideMessage?: string
		historyGuideBaseUrl?: string
		historyPromptId?: string
		historyTimestamp?: number
		historyMatchType?: 'exact' | 'fuzzy' | 'direct'
		imageInputCount?: number
		videoInputCount?: number
		hasTextPromptInput?: boolean
		historyNodeCount?: number
	} | null
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
}>()

const onStartLink = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (
	type:
		| 'base'
		| 'text'
		| 'text-merge'
		| 'image'
		| 'rotate-image'
		| 'video'
		| 'scene-understanding'
		| 'scene-decompose'
		| 'scene-layout'
		| 'unreal-export'
		| 'story'
		| 'comfyui'
		| 'model3d'
		| 'meshy'
		| 'blender'
) => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

let resizeRafId: number | null = null
function requestResize() {
	if (resizeRafId != null) return
	resizeRafId = requestAnimationFrame(() => {
		resizeRafId = null
		baseRef.value?.requestAutoResize()
	})
}

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(
		e: 'start-link',
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
			| 'blender'
	): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(
		e: 'update-comfyui-settings',
		payload: {
			baseUrl?: string
			positivePrompt?: string
			negativePrompt?: string
			autoWireEnabled?: boolean
		}
	): void
	(e: 'connect-comfyui', payload: { baseUrl: string }): void
	(e: 'select-workflow', payload: { workflowPath: string }): void
	(e: 'run-comfyui'): void
	(e: 'cancel-comfyui'): void
	(e: 'refresh-history-check'): void
	(e: 'clear-history-cache'): void
}>()

const baseUrl = computed(() => String(props.comfyuiSettings?.baseUrl ?? ''))
const baseUrlTrimmed = computed(() => baseUrl.value.trim())
const status = computed(
	() => (props.comfyuiSettings?.status ?? 'idle') as 'idle' | 'connecting' | 'connected' | 'error'
)
const message = computed(() => String(props.comfyuiSettings?.message ?? ''))

const workflows = computed(() =>
	Array.isArray(props.comfyuiSettings?.workflows) ? props.comfyuiSettings!.workflows! : []
)
const workflowPath = computed(() => String(props.comfyuiSettings?.workflowPath ?? ''))
const positivePrompt = computed(() => String(props.comfyuiSettings?.positivePrompt ?? ''))
const negativePrompt = computed(() => String(props.comfyuiSettings?.negativePrompt ?? ''))
const allInputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []))
const renderInputs = computed(() => allInputs.value)
const displayInputs = computed(() => renderInputs.value)

const inputAnchorIndex = computed(() => allInputs.value.findIndex((a) => a.id === 'in'))

type ComfyUiOutput = {
	kind: 'image' | 'video' | 'model3d'
	url: string
	filename?: string
	anchorId?: string
	nodeId?: string
	sourcePath?: string
	subfolder?: string
	type?: string
}

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null)
const autoWireEnabled = computed(() => props.comfyuiSettings?.autoWireEnabled !== false)
const mediaOutputs = computed(() => {
	const arr = props.comfyuiSettings?.outputs
	if (!Array.isArray(arr)) return []
	return arr
		.map((m: ComfyUiOutput) => {
			const rawKind = String(m?.kind ?? '')
			let kind: 'image' | 'video' | 'model3d' = 'image'
			if (rawKind === 'video') kind = 'video'
			else if (rawKind === 'model3d') kind = 'model3d'
			return {
				kind,
				url: String(m?.url ?? '').trim(),
				filename: typeof m?.filename === 'string' ? m.filename : '',
				anchorId: typeof m?.anchorId === 'string' ? m.anchorId : ''
			}
		})
		.filter((m: { url: string }) => m.url)
})

const runStatus = computed(
	() =>
		(props.comfyuiSettings?.runStatus ?? 'idle') as
			| 'idle'
			| 'running'
			| 'canceling'
			| 'completed'
			| 'failed'
			| 'cancelled'
)
const promptId = computed(() => String(props.comfyuiSettings?.promptId ?? ''))
const progress = computed(() => {
	const n = Number(props.comfyuiSettings?.progress)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(100, n))
})
const runStatusText = computed(() => String(props.comfyuiSettings?.statusText ?? ''))

const runDisabled = computed(() => {
	if (status.value !== 'connected') return true
	if (!workflowPath.value) return true
	if (historyChecked.value && hasHistory.value === false) return true
	return runStatus.value === 'running' || runStatus.value === 'canceling'
})

const historyChecked = computed(() => props.comfyuiSettings?.historyChecked === true)
const hasHistory = computed(() => props.comfyuiSettings?.hasHistory === true)
const historyError = computed(() => String(props.comfyuiSettings?.historyError ?? ''))
const historyGuideMessage = computed(() => String(props.comfyuiSettings?.historyGuideMessage ?? ''))
const historyGuideBaseUrl = computed(() => String(props.comfyuiSettings?.historyGuideBaseUrl ?? ''))
const historyPromptId = computed(() => String(props.comfyuiSettings?.historyPromptId ?? ''))
const historyTimestamp = computed(() => {
	const ts = Number(props.comfyuiSettings?.historyTimestamp)
	return Number.isFinite(ts) && ts > 0 ? ts : null
})
const imageInputCount = computed(() => {
	const n = Number(props.comfyuiSettings?.imageInputCount)
	return Number.isFinite(n) ? n : 0
})
const videoInputCount = computed(() => {
	const n = Number(props.comfyuiSettings?.videoInputCount)
	return Number.isFinite(n) ? n : 0
})
const hasTextPromptInput = computed(() => props.comfyuiSettings?.hasTextPromptInput === true)

const historyStatusText = computed(() => {
	if (!historyChecked.value) return t('nodes.comfyui.historyChecking')
	if (hasHistory.value) {
		if (historyTimestamp.value) {
			const d = new Date(historyTimestamp.value)
			const pad = (n: number) => (n < 10 ? '0' + n : String(n))
			const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
			return t('nodes.comfyui.historyReady', { time: timeStr })
		}
		return t('nodes.comfyui.historyReadySimple')
	}
	return historyGuideMessage.value || t('nodes.comfyui.noHistoryRecord')
})

const historyInputSummary = computed(() => {
	const parts: string[] = []
	if (imageInputCount.value > 0)
		parts.push(t('nodes.comfyui.imageInputCount', { count: imageInputCount.value }))
	if (videoInputCount.value > 0)
		parts.push(t('nodes.comfyui.videoInputCount', { count: videoInputCount.value }))
	if (hasTextPromptInput.value) parts.push(t('nodes.comfyui.promptInputRequired'))
	return parts.join(' · ')
})

function formatHistoryTime(ts: number | null) {
	if (!ts) return ''
	const d = new Date(ts)
	const pad = (n: number) => (n < 10 ? '0' + n : String(n))
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function onOpenComfyUI() {
	const url = historyGuideBaseUrl.value || baseUrlTrimmed.value
	if (url) window.open(url, '_blank')
}

function onRefreshHistory() {
	emit('refresh-history-check')
}

function onClearHistoryCache() {
	emit('clear-history-cache')
}

const cancelDisabled = computed(() => {
	if (status.value !== 'connected') return true
	if (runStatus.value !== 'running' && runStatus.value !== 'canceling') return true
	return !promptId.value
})

const progressWidth = computed(() => `${progress.value}%`)

const runStatusTextFallback = computed(() => {
	if (runStatus.value === 'running') return t('nodes.comfyui.running')
	if (runStatus.value === 'canceling') return t('nodes.comfyui.statusCanceling')
	if (runStatus.value === 'completed') return t('nodes.comfyui.statusCompleted')
	if (runStatus.value === 'failed') return t('nodes.comfyui.statusFailed')
	if (runStatus.value === 'cancelled') return t('nodes.comfyui.statusCancelled')
	return t('nodes.comfyui.statusNotRunning')
})

const runStatusTextDisplay = computed(() => {
	return runStatusText.value || runStatusTextFallback.value
})

const systemInfo = computed(() => props.comfyuiSettings?.systemInfo ?? null)
const comfyUIVersion = computed(() => String(systemInfo.value?.system?.comfyui_version ?? ''))
const nodeCount = computed(() => {
	const n = Number(systemInfo.value?.nodeCount)
	return Number.isFinite(n) ? n : 0
})
const checkpoints = computed(() => {
	const arr = props.comfyuiSettings?.checkpoints
	return Array.isArray(arr) ? arr : []
})

const connectedStatusText = computed(() => {
	if (!baseUrlTrimmed.value) return t('nodes.comfyui.connNoAddress')
	if (status.value === 'connecting') return t('nodes.comfyui.connConnecting')
	if (status.value === 'connected') {
		return comfyUIVersion.value
			? t('nodes.comfyui.connectedInfo', { version: comfyUIVersion.value })
			: t('nodes.comfyui.connConnected')
	}
	if (status.value === 'error')
		return message.value
			? t('nodes.comfyui.connFailed', { message: message.value })
			: t('nodes.comfyui.connFailed', { message: '' })
	return t('nodes.comfyui.connNotConnected')
})

const svcUptime = computed(() => {
	void tick.value
	const st = svcRuntime.value?.startTime
	if (!svcRuntime.value?.running || !st) return ''
	return formatUptime(Date.now() - st)
})

const svcStatusText = computed(() => {
	if (svcPendingOp.value === 'starting') return t('nodes.comfyui.serviceStateStarting')
	if (svcPendingOp.value === 'stopping') return t('nodes.comfyui.serviceStateStopping')
	if (svcRuntime.value?.running) return t('nodes.comfyui.serviceRunning')
	return t('nodes.comfyui.serviceStopped')
})

const svcStatusClass = computed(() => {
	if (svcPendingOp.value) return 'pending'
	if (svcRuntime.value?.running) return 'ok'
	if (svcLastError.value) return 'err'
	return 'idle'
})

const svcStartDisabled = computed(() => {
	if (svcPendingOp.value) return true
	if (svcRuntime.value?.running) return true
	if (!svcConfigured.value) return false
	return false
})

const svcStartTitle = computed(() => {
	if (!svcConfigured.value) return t('nodes.comfyui.serviceNotConfigured')
	return ''
})

const svcStopDisabled = computed(() => {
	if (svcPendingOp.value) return true
	return !svcRuntime.value?.running
})

const svcRestartDisabled = computed(() => {
	if (svcPendingOp.value) return true
	return !svcRuntime.value?.running
})

const onRun = () => {
	emit('run-comfyui')
}

const onCancel = () => {
	emit('cancel-comfyui')
}

const statusClass = computed(() => {
	if (status.value === 'connected') return 'ok'
	if (status.value === 'error') return 'err'
	if (status.value === 'connecting') return 'pending'
	return 'idle'
})

const onInput = (e: Event) => {
	const v = (e.target as HTMLInputElement).value
	emit('update-comfyui-settings', { baseUrl: v })
}

const onConnect = () => {
	const v = baseUrlTrimmed.value
	if (!v) return
	emit('connect-comfyui', { baseUrl: v })
}

const onWorkflowChange = (e: Event) => {
	const v = String((e.target as HTMLSelectElement).value ?? '').trim()
	if (!v) return
	emit('select-workflow', { workflowPath: v })
}

const onPositivePromptInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-comfyui-settings', { positivePrompt: v })
}

const onNegativePromptInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-comfyui-settings', { negativePrompt: v })
}

const onToggleAutoWire = () => {
	emit('update-comfyui-settings', { autoWireEnabled: !autoWireEnabled.value })
}

watch(showLogs, () => {
	requestResize()
})

onMounted(() => {
	if (!baseUrlTrimmed.value) {
		emit('update-comfyui-settings', { baseUrl: 'http://127.0.0.1:8188' })
	}
	refreshServiceConfig()
	refreshServiceStatus()
	loadServiceLogs()
	subscribeServiceEvents()

	uptimeTimer = setInterval(() => {
		tick.value++
	}, 1000)

	statusPollTimer = setInterval(() => {
		refreshServiceStatus()
	}, 5000)

	const onVisibilityChange = () => {
		if (!document.hidden) {
			refreshServiceConfig()
			refreshServiceStatus()
		}
	}
	document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
	unsubscribeServiceEvents()
	if (autoConnectTimer) {
		clearTimeout(autoConnectTimer)
		autoConnectTimer = null
	}
	if (resizeRafId != null) {
		cancelAnimationFrame(resizeRafId)
		resizeRafId = null
	}
	if (uptimeTimer) {
		clearInterval(uptimeTimer)
		uptimeTimer = null
	}
	if (statusPollTimer) {
		clearInterval(statusPollTimer)
		statusPollTimer = null
	}
})
</script>

<style scoped>
.wf-comfy {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
	align-self: stretch;
}

.wf-comfy-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.wf-comfy-checkbox {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--vscode-foreground);
	cursor: pointer;
	user-select: none;
}

.wf-comfy-checkbox input[type='checkbox'] {
	margin: 0;
	cursor: pointer;
}

.wf-comfy-label {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-input {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
}

.wf-comfy-textarea {
	width: 100%;
	box-sizing: border-box;
	height: 40px;
	min-height: 32px;
	max-height: 120px;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
	resize: vertical;
	font-family: inherit;
	font-size: 12px;
	overflow-y: auto;
}

.wf-comfy-prompt {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	flex-shrink: 0;
}

.wf-comfy-anchor-hit {
	width: 18px;
	height: 18px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 0;
	cursor: crosshair;
	flex: 0 0 auto;
	margin-top: 4px;
}

.wf-comfy-anchor-hit::before {
	content: '';
	width: 10px;
	height: 10px;
	border-radius: 0;
	background: var(--dweb-yellow);
	border: 1px solid transparent;
	box-sizing: border-box;
}

.wf-comfy-anchor-hit:hover::before,
.wf-comfy-anchor-hit.hovered::before {
	border-color: #ffffff;
}

.wf-comfy-textarea:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-input:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-svc-actions {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	flex-shrink: 0;
}

.wf-comfy-svc-status {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	flex-shrink: 0;
	flex-wrap: wrap;
}

.wf-comfy-svc-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #888;
	flex-shrink: 0;
}

.wf-comfy-svc-status.ok .wf-comfy-svc-dot {
	background: #4caf50;
}
.wf-comfy-svc-status.pending .wf-comfy-svc-dot {
	background: #ffc107;
	animation: wf-comfy-pulse 1s infinite;
}
.wf-comfy-svc-status.err .wf-comfy-svc-dot {
	background: #f44336;
}
.wf-comfy-svc-status.idle .wf-comfy-svc-dot {
	background: #888;
}

@keyframes wf-comfy-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.4;
	}
}

.wf-comfy-svc-text {
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-svc-status.ok .wf-comfy-svc-text {
	color: #4caf50;
}
.wf-comfy-svc-status.pending .wf-comfy-svc-text {
	color: #ffc107;
}
.wf-comfy-svc-status.err .wf-comfy-svc-text {
	color: #f44336;
}

.wf-comfy-svc-meta {
	color: var(--vscode-fg-muted);
	font-size: 10px;
	opacity: 0.8;
}

.wf-comfy-svc-error {
	font-size: 11px;
	color: #f48771;
	background: rgba(244, 135, 113, 0.08);
	padding: 4px 6px;
	border-left: 2px solid #f48771;
	flex-shrink: 0;
	word-break: break-all;
}

.wf-comfy-svc-hint {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	opacity: 0.8;
	flex-shrink: 0;
}

.wf-comfy-actions {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-shrink: 0;
}

.wf-comfy-workflows {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex-shrink: 0;
}

.wf-comfy-select {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
}

.wf-comfy-run {
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
}

.wf-comfy-runbar {
	display: flex;
	gap: 10px;
	align-items: center;
	flex-shrink: 0;
}

.wf-comfy-progress {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex-shrink: 0;
}

.wf-comfy-progress-track {
	width: 100%;
	height: 8px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	overflow: hidden;
}

.wf-comfy-progress-bar {
	height: 100%;
	background: var(--vscode-border-accent);
}

.wf-comfy-progress-text {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.85;
}

.wf-comfy-logs-section {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.wf-comfy-logs-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
}

.wf-comfy-logs-title {
	font-size: 11px;
	color: var(--vscode-foreground);
	opacity: 0.85;
}

.wf-comfy-logs {
	background: #1a1a1a;
	border: 1px solid var(--vscode-border);
	padding: 6px;
	font-family: 'Consolas', 'Courier New', monospace;
	font-size: 11px;
	line-height: 1.5;
	flex-shrink: 0;
	overflow: visible;
}

.wf-comfy-logs-empty {
	color: #666;
	font-style: italic;
}

.wf-comfy-log-line {
	white-space: pre-wrap;
	word-break: break-all;
}

.wf-comfy-log-ts {
	color: #666;
	margin-right: 4px;
	user-select: none;
}

.wf-comfy-log-src {
	margin-right: 6px;
	font-weight: 600;
	user-select: none;
}

.wf-comfy-log-stdout .wf-comfy-log-msg {
	color: #d4d4d4;
}
.wf-comfy-log-stdout .wf-comfy-log-src {
	color: #9cdcfe;
}
.wf-comfy-log-stderr .wf-comfy-log-msg {
	color: #f48771;
}
.wf-comfy-log-stderr .wf-comfy-log-src {
	color: #f48771;
}
.wf-comfy-log-system .wf-comfy-log-msg {
	color: #6a9955;
}
.wf-comfy-log-system .wf-comfy-log-src {
	color: #6a9955;
}

.wf-comfy-outputs {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.wf-comfy-output-link {
	color: var(--vscode-link);
	font-size: 11px;
	text-decoration: none;
	word-break: break-all;
}

.wf-comfy-output-link:hover {
	text-decoration: underline;
}

.wf-comfy-select:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	padding: 6px 10px;
	border-radius: 0;
	cursor: pointer;
	font-size: 12px;
}

.wf-comfy-btn-sm {
	padding: 4px 8px;
	font-size: 11px;
}

.wf-comfy-btn-xs {
	padding: 2px 6px;
	font-size: 10px;
}

.wf-comfy-btn-ghost {
	background: transparent;
	border-color: var(--vscode-border);
	opacity: 0.75;
}

.wf-comfy-btn-ghost:hover {
	opacity: 1;
	background: rgba(255, 255, 255, 0.06);
}

.wf-comfy-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.wf-comfy-status {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex: 1;
}

.wf-comfy-status.ok {
	opacity: 1;
}

.wf-comfy-status.err {
	opacity: 1;
}

.wf-comfy-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	flex-shrink: 0;
}

.wf-comfy-info-item {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 11px;
}

.wf-comfy-info-label {
	color: var(--vscode-fg-muted);
}

.wf-comfy-info-value {
	color: var(--vscode-foreground);
	font-weight: 500;
}

.wf-comfy-inputs {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex-shrink: 0;
	width: 100%;
}

.wf-comfy-inputs-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
}

.wf-comfy-inputs-title {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-inputs-empty {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	opacity: 0.9;
}

.wf-comfy-input-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	border-radius: 0;
	background: var(--dweb-defualt-dark);
}

.wf-comfy-input-index {
	width: 18px;
	height: 18px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 11px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-input-text {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.95;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.wf-comfy-history {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex-shrink: 0;
}

.wf-comfy-history-status {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
}

.wf-comfy-history-status.ready {
	border-color: var(--vscode-charts-green, #4caf50);
}

.wf-comfy-history-text {
	flex: 1;
	min-width: 0;
}

.wf-comfy-clear-history-btn {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--vscode-descriptionForeground, #999);
	cursor: pointer;
	border-radius: 3px;
	font-size: 11px;
	line-height: 1;
	padding: 0;
	opacity: 0.6;
	transition:
		opacity 0.15s,
		background 0.15s,
		color 0.15s;
}

.wf-comfy-clear-history-btn:hover {
	opacity: 1;
	background: var(--vscode-errorBackground, rgba(255, 80, 80, 0.15));
	color: var(--vscode-errorForeground, #f48771);
}

.wf-comfy-history-status.checking {
	opacity: 0.8;
}

.wf-comfy-history-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #888;
	flex-shrink: 0;
}

.wf-comfy-history-status.ready .wf-comfy-history-dot {
	background: var(--vscode-charts-green, #4caf50);
}

.wf-comfy-history-status.checking .wf-comfy-history-dot {
	background: var(--vscode-charts-yellow, #ffc107);
	animation: wf-comfy-pulse 1s ease-in-out infinite;
}

@keyframes wf-comfy-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.4;
	}
}

.wf-comfy-history-guide {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px;
	border: 1px solid var(--vscode-inputValidation-warningBorder, #ffc107);
	background: rgba(255, 193, 7, 0.08);
}

.wf-comfy-history-guide-title {
	font-size: 12px;
	font-weight: 500;
	color: var(--vscode-editorWarning-foreground, #ffc107);
}

.wf-comfy-history-guide-desc {
	font-size: 11px;
	color: var(--vscode-foreground);
	opacity: 0.9;
	line-height: 1.5;
}

.wf-comfy-history-guide-actions {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}

.wf-comfy-history-inputs {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	padding: 0 2px;
}
</style>
