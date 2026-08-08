<template>
	<div class="comfy-terminal-panel">
		<div class="sc-panel-frame" aria-hidden="true">
			<span class="corner tl"></span>
			<span class="corner tr"></span>
			<span class="corner bl"></span>
			<span class="corner br"></span>
		</div>

		<div class="ctp-upper-sections">
		<div class="ctp-header">
			<div class="ctp-title-row">
				<span class="ctp-title">
					<span class="ctp-title-dot"></span>
					ComfyUI 终端
				</span>
				<span class="ctp-mode-badge" :class="terminalMode">
					{{ modeLabel }}
				</span>
				<button class="ctp-refresh-btn" @click="refreshEnv" :disabled="isLoadingEnv">
					{{ isLoadingEnv ? '检测中…' : '↻ 刷新环境' }}
				</button>
			</div>
			<p class="ctp-desc">执行诊断命令、更新 ComfyUI 源码或手动安装 ComfyUI-Manager 扩展。所有 pip/python 命令将自动使用配置的虚拟环境。</p>
		</div>

		<!-- Python 环境信息栏 -->
		<div class="ctp-env-bar" :class="{ error: !activePython?.ok }">
			<template v-if="activePython?.ok">
				<span class="ctp-env-icon">🐍</span>
				<div class="ctp-env-info">
					<span class="ctp-env-type">{{ activePython.typeLabel }}</span>
					<span class="ctp-env-version" v-if="activePython.version">Python {{ activePython.version }}</span>
				</div>
				<div class="ctp-env-path" :title="activePython.pythonPath">
					{{ activePython.pythonPath }}
				</div>
			</template>
			<template v-else-if="isLoadingEnv">
				<span class="ctp-env-icon">⏳</span>
				<span class="ctp-env-loading">正在检测 Python 环境…</span>
			</template>
			<template v-else>
				<span class="ctp-env-icon">⚠️</span>
				<span class="ctp-env-error">{{ activePython?.error || '未找到可用的 Python 环境，请先在 ComfyUI 配置中完成环境设置。' }}</span>
			</template>
		</div>

		<!-- ComfyUI 源码更新区域 -->
		<div class="ctp-update-section">
			<div class="ctp-section-title">
				<span>▸ ComfyUI 源码更新</span>
			</div>
			<div class="ctp-update-bar">
				<div class="ctp-update-info" v-if="!isCheckingVersion && !isUpdating">
					<template v-if="versionInfo">
						<span class="ctp-version-badge" :class="{ update: versionInfo.updateAvailable }">
							{{ versionInfo.updateAvailable ? '🔄 有新版本' : '✓ 已是最新' }}
						</span>
						<span class="ctp-version-detail" v-if="versionInfo.currentVersion || versionInfo.currentCommit">
							当前: v{{ versionInfo.currentVersion || versionInfo.currentCommit?.slice(0, 7) }}
						</span>
						<span class="ctp-version-detail" v-if="versionInfo.latestVersion || versionInfo.latestTag">
							最新: {{ versionInfo.latestTag || ('v' + versionInfo.latestVersion) }}
						</span>
						<span class="ctp-version-detail ctp-git-status" v-if="!versionInfo.isGitRepo">
							（非 Git 安装，更新将自动初始化 Git）
						</span>
					</template>
					<template v-else-if="versionCheckError">
						<span class="ctp-version-error">⚠️ {{ versionCheckError }}</span>
					</template>
					<template v-else>
						<span class="ctp-version-hint">点击「检查更新」查看 ComfyUI 版本状态</span>
					</template>
				</div>

				<div class="ctp-update-progress" v-if="isCheckingVersion || isUpdating">
					<span class="ctp-update-spinner"></span>
					<span class="ctp-update-status-text">{{ currentUpdateStep || (isCheckingVersion ? '正在检查版本…' : '正在更新…') }}</span>
				</div>

				<div class="ctp-update-actions">
					<button
						class="ctp-action-btn"
						:disabled="isRunning || isCheckingVersion || isUpdating"
						@click="checkVersion"
					>
						{{ versionInfo ? '↻ 重新检查' : '检查更新' }}
					</button>
					<button
						class="ctp-action-btn ctp-action-btn-primary"
						:disabled="isRunning || isCheckingVersion || isUpdating"
						@click="updateComfyUI"
					>
						更新源码
					</button>
				</div>
			</div>
		</div>

		<div class="ctp-presets-section">
			<div class="ctp-section-title ctp-collapsible-title" @click="managerExpanded = !managerExpanded">
				<span class="ctp-collapse-arrow" :class="{ expanded: managerExpanded }">▸</span>
				<span>Manager 安装向导</span>
			</div>
			<div class="ctp-wizard-steps" v-show="managerExpanded">
				<div
					v-for="(preset, idx) in wizardPresets"
					:key="preset.id"
					class="ctp-wizard-step"
				>
					<button
						class="ctp-step-btn"
						:disabled="isRunning || isUpdating"
						@click="runPreset(preset.id)"
					>
						<span class="ctp-step-num">{{ idx + 1 }}</span>
						<span class="ctp-step-label">{{ preset.label }}</span>
						<span class="ctp-step-arrow">▶</span>
					</button>
				</div>
			</div>

			<div class="ctp-section-title ctp-mt ctp-collapsible-title" @click="generalExpanded = !generalExpanded">
				<span class="ctp-collapse-arrow" :class="{ expanded: generalExpanded }">▸</span>
				<span>通用诊断命令</span>
			</div>
			<div class="ctp-presets-grid" v-show="generalExpanded">
				<button
					v-for="preset in generalPresets"
					:key="preset.id"
					class="ctp-preset-btn"
					:disabled="isRunning || isUpdating"
					@click="runPreset(preset.id)"
				>
					{{ preset.label }}
				</button>
			</div>
		</div>

		<div class="ctp-custom-section">
			<div class="ctp-section-title ctp-collapsible-title" @click="customExpanded = !customExpanded">
				<span class="ctp-collapse-arrow" :class="{ expanded: customExpanded }">▸</span>
				<span>自定义命令</span>
			</div>
			<div class="ctp-custom-input-row" v-show="customExpanded">
				<input
					v-model="customCmd"
					type="text"
					class="ctp-cmd-input"
					placeholder="输入命令（如 dir、pip list 等）"
					@keydown.enter="runCustomCommand"
					:disabled="isRunning || isUpdating"
				/>
				<button
					class="sc-btn sc-btn-primary ctp-run-btn"
					:disabled="isRunning || isUpdating || !customCmd.trim()"
					@click="runCustomCommand"
				>
					<span v-if="!isRunning && !isUpdating">执行</span>
					<span v-else>运行中…</span>
				</button>
			</div>
		</div>
		</div><!-- /.ctp-upper-sections -->

		<div class="ctp-output-section">
			<div class="ctp-output-header">
				<span class="ctp-output-title">
					<span class="ctp-output-dot" :class="{ running: isRunning || isUpdating }"></span>
					{{ isUpdating ? '更新日志' : '命令输出' }}
				</span>
				<button
					class="ctp-clear-btn"
					:disabled="outputLines.length === 0"
					@click="clearOutput"
				>
					清空
				</button>
			</div>
			<div
				class="ctp-terminal sc-log-terminal"
				ref="terminalEl"
			>
				<div v-if="outputLines.length === 0" class="sc-log-empty">
					{{ isUpdating ? '正在更新 ComfyUI 源码...' : '选择预设命令、检查更新或输入自定义命令开始执行。' }}
				</div>
				<pre
					v-for="(line, idx) in outputLines"
					:key="idx"
					class="ctp-log-line"
					:class="`log-${line.type}`"
				>{{ line.text }}</pre>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { ActivePythonInfo, ComfyVersionCheckResult } from '../electronBridge/types'
import { pushToast, showConfirm } from '../ui/UIComponent/useGlobalFeedback'

interface PresetCommand {
	id: string
	category: string
	label: string
	cmd?: string
	args?: string[]
	description?: string
}

interface OutputLine {
	type: 'stdout' | 'stderr' | 'system' | 'error'
	text: string
}

const dweb = (window as any).dweb
const comfySetup = dweb?.comfyui?.setup
const terminalApi = comfySetup?.terminal

const isRunning = ref(false)
const isLoadingEnv = ref(false)
const isCheckingVersion = ref(false)
const isUpdating = ref(false)
const customCmd = ref('')
const outputLines = ref<OutputLine[]>([])
const terminalEl = ref<HTMLElement | null>(null)
const allPresets = ref<PresetCommand[]>([])
const terminalMode = ref<'unknown' | 'restricted' | 'full'>('unknown')
const activePython = ref<ActivePythonInfo | null>(null)
const versionInfo = ref<ComfyVersionCheckResult | null>(null)
const versionCheckError = ref<string | null>(null)
const currentUpdateStep = ref<string | null>(null)

// 折叠状态
const managerExpanded = ref(false)   // Manager 安装向导默认折叠
const generalExpanded = ref(true)    // 通用诊断命令默认展开
const customExpanded = ref(true)     // 自定义命令默认展开

const wizardPresets = computed(() =>
	allPresets.value.filter((p) => p.category === 'manager-guide')
)
const generalPresets = computed(() =>
	allPresets.value.filter((p) => p.category !== 'manager-guide')
)

const modeLabel = computed(() => {
	switch (terminalMode.value) {
		case 'full':
			return '完整模式'
		case 'restricted':
			return '受限模式'
		default:
			return '检测中…'
	}
})

function appendLine(type: OutputLine['type'], text: string) {
	const lines = text.split('\n')
	for (const l of lines) {
		if (l || outputLines.value.length > 0) {
			outputLines.value.push({ type, text: l })
		}
	}
	scrollToBottom()
}

function scrollToBottom() {
	nextTick(() => {
		if (terminalEl.value) {
			terminalEl.value.scrollTop = terminalEl.value.scrollHeight
		}
	})
}

async function loadPresets() {
	if (!terminalApi?.listPresets) return
	try {
		const result = await terminalApi.listPresets()
		if (result?.ok && Array.isArray(result.presets)) {
			allPresets.value = result.presets
		}
	} catch (err) {
		appendLine('error', `[错误] 加载预设命令失败: ${err}`)
	}
}

async function checkMode() {
	if (!terminalApi?.checkMode) return
	try {
		const result = await terminalApi.checkMode()
		terminalMode.value = result?.customCommandEnabled ? 'full' : 'restricted'
	} catch (err) {
		terminalMode.value = 'unknown'
	}
}

async function runPreset(presetId: string) {
	if (isRunning.value || isUpdating.value || !terminalApi?.runPreset) return
	isRunning.value = true
	outputLines.value = []
	appendLine('system', `[系统] 执行预设命令: ${presetId}`)

	try {
		const stream = terminalApi.runPreset({ presetId })
		for await (const chunk of stream) {
			if (chunk?.type === 'log') {
				appendLine(chunk.stream || 'stdout', chunk.message || '')
			} else if (chunk?.type === 'error') {
				appendLine('error', chunk.message || String(chunk))
			} else if (chunk?.type === 'done') {
				appendLine('system', chunk.message || '完成')
			} else if (chunk?.message) {
				appendLine('system', chunk.message)
			}
		}
		appendLine('system', '[系统] 命令执行完成')
	} catch (err) {
		appendLine('error', `[错误] ${err}`)
	} finally {
		isRunning.value = false
	}
}

async function runCustomCommand() {
	const cmd = customCmd.value.trim()
	if (!cmd || isRunning.value || isUpdating.value || !terminalApi?.runCustom) return
	isRunning.value = true
	appendLine('system', `[系统] 执行: ${cmd}`)

	try {
		const stream = terminalApi.runCustom({ commandText: cmd })
		for await (const chunk of stream) {
			if (chunk?.type === 'log') {
				appendLine(chunk.stream || 'stdout', chunk.message || '')
			} else if (chunk?.type === 'error') {
				appendLine('error', chunk.message || String(chunk))
			} else if (chunk?.type === 'done') {
				appendLine('system', chunk.message || '完成')
			} else if (chunk?.message) {
				appendLine('system', chunk.message)
			}
		}
		appendLine('system', '[系统] 命令执行完成')
	} catch (err) {
		appendLine('error', `[错误] ${err}`)
	} finally {
		isRunning.value = false
	}
}

function clearOutput() {
	outputLines.value = []
}

async function loadActivePython() {
	if (!comfySetup?.getActivePython) return
	isLoadingEnv.value = true
	try {
		const result = await comfySetup.getActivePython()
		activePython.value = result
	} catch (err) {
		activePython.value = {
			ok: false,
			error: `检测 Python 环境失败: ${err}`
		}
	} finally {
		isLoadingEnv.value = false
	}
}

function refreshEnv() {
	loadActivePython()
	checkMode()
	checkVersion()
}

async function checkVersion() {
	if (isCheckingVersion.value || isUpdating.value) return
	isCheckingVersion.value = true
	versionCheckError.value = null
	
	try {
		const config = await comfySetup?.getConfig?.()
		const installPath = config?.installPath
		if (!installPath) {
			versionCheckError.value = '未配置 ComfyUI 安装目录'
			return
		}

		const result = await comfySetup.checkVersion({ installPath })
		if (result?.ok) {
			versionInfo.value = result
			versionCheckError.value = null
		} else {
			versionCheckError.value = result?.error || '检查版本失败'
			versionInfo.value = null
		}
	} catch (err) {
		versionCheckError.value = `检查版本失败: ${err}`
		versionInfo.value = null
	} finally {
		isCheckingVersion.value = false
	}
}

async function updateComfyUI() {
	console.error('[DEBUG UPDATE COMFYUI] [Vue] updateComfyUI function ENTERED. Guards: isRunning=', isRunning.value, 'isUpdating=', isUpdating.value)
	if (isRunning.value || isUpdating.value) {
		console.error('[DEBUG UPDATE COMFYUI] [Vue] Guard blocked (already running/updating)')
		pushToast('ComfyUI 正在运行或更新中，请稍候再试', 'warn')
		return
	}

	const confirmed = await showConfirm({
		title: '更新 ComfyUI 源码',
		message:
			'检测到有新版本，是否立即更新？\n\n· 您的模型、工作流、自定义节点等用户数据会自动保留\n· 更新过程中会自动停止 ComfyUI 服务\n· 完成后会自动重启服务并刷新版本信息',
		tone: 'warn',
		confirmText: '立即更新',
		cancelText: '稍后再说',
		showCancel: true
	})
	console.error('[DEBUG UPDATE COMFYUI] [Vue] showConfirm() result =', confirmed)
	if (!confirmed) {
		// 必须给出明确 UI 反馈，否则用户以为"点了没反应"再次点击
		appendLine('system', '[提示] 已取消本次更新操作。若需更新请再次点击「更新源码」按钮。')
		pushToast('已取消更新', 'info')
		return
	}

	isUpdating.value = true
	isRunning.value = true
	outputLines.value = []
	currentUpdateStep.value = '准备更新...'
	appendLine('system', '[系统] 开始更新 ComfyUI 源码...')

	try {
		console.error('[DEBUG UPDATE COMFYUI] [Vue] calling comfySetup.getConfig()...')
		const config = await comfySetup?.getConfig?.()
		console.error('[DEBUG UPDATE COMFYUI] [Vue] getConfig() returned =', JSON.stringify(config).slice(0, 500))
		const installPath = config?.installPath
		if (!installPath) {
			console.error('[DEBUG UPDATE COMFYUI] [Vue] No installPath in config. Appending error + return.')
			appendLine('error', '[错误] 未配置 ComfyUI 安装目录')
			pushToast('未配置 ComfyUI 安装目录', 'error')
			return
		}

		console.error('[DEBUG UPDATE COMFYUI] [Vue] Creating stream via comfySetup.updateComfyUI(). typeof =', typeof comfySetup?.updateComfyUI)
		const stream = comfySetup.updateComfyUI({ installPath })
		console.error('[DEBUG UPDATE COMFYUI] [Vue] Stream object created. Symbol.asyncIterator? =', typeof stream?.[Symbol.asyncIterator])
		let hasError = false
		let isDone = false
		let chunkIndex = 0
		for await (const chunk of stream) {
			chunkIndex++
			console.error(`[DEBUG UPDATE COMFYUI] [Vue] Chunk #${chunkIndex}: type=`, chunk?.type, 'message?', !!chunk?.message, 'stream?', chunk?.stream)
			if (chunk?.type === 'step') {
				currentUpdateStep.value = chunk.message || chunk.step
				appendLine('system', `[步骤] ${chunk.message || chunk.step}`)
			} else if (chunk?.type === 'log') {
				appendLine(chunk.stream || 'stdout', chunk.message || '')
			} else if (chunk?.type === 'error') {
				hasError = true
				appendLine('error', chunk.message || String(chunk))
			} else if (chunk?.type === 'done') {
				isDone = true
				appendLine('system', chunk.message || '更新完成')
			} else if (chunk?.message) {
				appendLine('system', chunk.message)
			}
		}
		console.error(`[DEBUG UPDATE COMFYUI] [Vue] for-await ended. Total chunks: ${chunkIndex}, hasError=${hasError}, isDone=${isDone}`)
		if (!hasError && isDone) {
			appendLine('system', '[系统] ComfyUI 源码更新完成！建议重启服务后使用。')
			pushToast('ComfyUI 源码更新成功', 'success')
			await checkVersion()
		} else if (hasError) {
			pushToast('ComfyUI 源码更新失败，请查看日志', 'error')
		} else if (!isDone) {
			appendLine('stderr', '[提示] 更新流程未返回完成状态，可能需要手动确认。')
		}
	} catch (err) {
		console.error('[DEBUG UPDATE COMFYUI] [Vue] CATCH BLOCK (for-await level):', (err as any)?.stack || err)
		const msg = (err as any)?.message || String(err)
		appendLine('error', `[错误] 更新失败: ${msg}`)
		pushToast('更新失败：' + msg, 'error')
	} finally {
		console.error('[DEBUG UPDATE COMFYUI] [Vue] FINALLY block. Resetting flags.')
		isUpdating.value = false
		isRunning.value = false
		currentUpdateStep.value = null
	}
}

onMounted(() => {
	loadPresets()
	checkMode()
	loadActivePython()
	checkVersion()
})
</script>

<style scoped>
.comfy-terminal-panel {
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
	display: flex;
	flex-direction: column;
	gap: 16px;
	flex: 1;
	min-height: 0;
	overflow: hidden;
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

/* 上半区可滚动容器：窗口高度不足时出现滚动条，终端输出区始终可见 */
.ctp-upper-sections {
	flex-shrink: 1;
	min-height: 0;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 16px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 40%, transparent) transparent;
}
.ctp-upper-sections::-webkit-scrollbar {
	width: 6px;
}
.ctp-upper-sections::-webkit-scrollbar-track {
	background: transparent;
}
.ctp-upper-sections::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	border-radius: 3px;
}

.ctp-header {
	flex-shrink: 0;
}
.ctp-title-row {
	display: flex;
	align-items: center;
	gap: 12px;
}
.ctp-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 15px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}
.ctp-title-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
}
.ctp-mode-badge {
	font-size: 10px;
	padding: 2px 8px;
	border-radius: 2px;
	letter-spacing: 0.06em;
	background: color-mix(in srgb, var(--pl-fg-soft) 15%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 30%, transparent);
}
.ctp-mode-badge.full {
	color: #66ff99;
	background: color-mix(in srgb, #66ff99 12%, transparent);
	border-color: color-mix(in srgb, #66ff99 40%, transparent);
}
.ctp-mode-badge.restricted {
	color: #ffd166;
	background: color-mix(in srgb, #ffd166 12%, transparent);
	border-color: color-mix(in srgb, #ffd166 40%, transparent);
}
.ctp-desc {
	margin: 6px 0 0;
	font-size: 12px;
	color: var(--pl-fg-soft);
}

.ctp-refresh-btn {
	margin-left: auto;
	font-size: 11px;
	padding: 4px 10px;
	cursor: pointer;
	border-radius: 2px;
	background: transparent;
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 25%, transparent);
	transition: all 200ms ease;
}
.ctp-refresh-btn:hover:not(:disabled) {
	color: var(--pl-accent);
	border-color: color-mix(in srgb, var(--pl-accent) 40%, transparent);
}
.ctp-refresh-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.ctp-env-bar {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-radius: 2px;
	flex-shrink: 0;
}
.ctp-env-bar.error {
	background: color-mix(in srgb, #ff6b6b 8%, transparent);
	border-color: color-mix(in srgb, #ff6b6b 40%, transparent);
}
.ctp-env-icon {
	font-size: 16px;
	flex-shrink: 0;
}
.ctp-env-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex-shrink: 0;
}
.ctp-env-type {
	font-size: 11px;
	font-weight: 600;
	color: var(--pl-accent);
	letter-spacing: 0.04em;
}
.ctp-env-bar.error .ctp-env-type {
	color: #ff6b6b;
}
.ctp-env-version {
	font-size: 10px;
	color: var(--pl-fg-soft);
}
.ctp-env-path {
	flex: 1;
	font-size: 11px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	color: var(--pl-fg-soft);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.8;
}
.ctp-env-loading,
.ctp-env-error {
	font-size: 12px;
	color: var(--pl-fg-soft);
}
.ctp-env-error {
	color: #ff8a8a;
}

/* ComfyUI 更新区域 */
.ctp-update-section {
	flex-shrink: 0;
}
.ctp-update-bar {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	background: color-mix(in srgb, var(--pl-cold) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-cold) 25%, transparent);
	border-radius: 2px;
}
.ctp-update-info {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.ctp-version-badge {
	font-size: 11px;
	font-weight: 600;
	padding: 4px 10px;
	border-radius: 2px;
	background: color-mix(in srgb, #66ff99 15%, transparent);
	color: #66ff99;
	border: 1px solid color-mix(in srgb, #66ff99 40%, transparent);
	flex-shrink: 0;
}
.ctp-version-badge.update {
	background: color-mix(in srgb, #ffd166 15%, transparent);
	color: #ffd166;
	border-color: color-mix(in srgb, #ffd166 40%, transparent);
}
.ctp-version-detail {
	font-size: 11px;
	color: var(--pl-fg-soft);
	font-family: 'JetBrains Mono', 'Consolas', monospace;
}
.ctp-git-status {
	font-size: 10px;
	color: color-mix(in srgb, var(--pl-fg-soft) 70%, transparent);
	font-style: italic;
}
.ctp-version-error {
	font-size: 12px;
	color: #ff8a8a;
}
.ctp-version-hint {
	font-size: 12px;
	color: var(--pl-fg-soft);
	font-style: italic;
}
.ctp-update-progress {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 10px;
}
.ctp-update-spinner {
	width: 14px;
	height: 14px;
	border: 2px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-top-color: var(--pl-accent);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	flex-shrink: 0;
}
@keyframes spin {
	to { transform: rotate(360deg); }
}
.ctp-update-status-text {
	font-size: 12px;
	color: var(--pl-accent);
}
.ctp-update-actions {
	display: flex;
	gap: 8px;
	flex-shrink: 0;
}
.ctp-action-btn {
	padding: 6px 14px;
	font-size: 11px;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 25%, transparent);
	transition: all 200ms ease;
	white-space: nowrap;
}
.ctp-action-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-cold) 8%, transparent);
	border-color: color-mix(in srgb, var(--pl-cold) 40%, transparent);
	color: var(--pl-fg);
}
.ctp-action-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.ctp-action-btn-primary {
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-cold) 25%, transparent),
		color-mix(in srgb, var(--pl-cold) 12%, transparent)
	);
	border-color: color-mix(in srgb, var(--pl-cold) 50%, transparent);
	color: #fff;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-cold) 40%, transparent);
}
.ctp-action-btn-primary:hover:not(:disabled) {
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-cold) 35%, transparent),
		color-mix(in srgb, var(--pl-cold) 20%, transparent)
	);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-cold) 25%, transparent);
}

.ctp-section-title {
	font-size: 11px;
	letter-spacing: 0.08em;
	color: var(--pl-accent);
	text-transform: uppercase;
	margin-bottom: 10px;
}
.ctp-mt {
	margin-top: 16px;
}

/* 可折叠标题交互样式 */
.ctp-collapsible-title {
	cursor: pointer;
	user-select: none;
	display: flex;
	align-items: center;
	gap: 6px;
	transition: color 200ms ease;
}
.ctp-collapsible-title:hover {
	color: color-mix(in srgb, var(--pl-accent) 70%, var(--pl-fg));
}
.ctp-collapse-arrow {
	display: inline-block;
	transition: transform 200ms ease;
	font-size: 10px;
}
.ctp-collapse-arrow.expanded {
	transform: rotate(90deg);
}

.ctp-wizard-steps {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.ctp-wizard-step {
	display: flex;
}
.ctp-step-btn {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 10px 14px;
	font-size: 12px;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	transition: all 200ms ease;
	text-align: left;
}
.ctp-step-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 18%, transparent);
}
.ctp-step-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.ctp-step-num {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--pl-accent) 25%, transparent);
	color: var(--pl-accent);
	font-weight: 700;
	font-size: 11px;
	flex-shrink: 0;
}
.ctp-step-label {
	flex: 1;
}
.ctp-step-arrow {
	font-size: 10px;
	color: var(--pl-accent);
	opacity: 0.7;
}

.ctp-presets-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 8px;
}
.ctp-preset-btn {
	padding: 8px 12px;
	font-size: 11px;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 20%, transparent);
	transition: all 200ms ease;
	text-align: left;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.ctp-preset-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-cold) 8%, transparent);
	border-color: color-mix(in srgb, var(--pl-cold) 40%, transparent);
	color: var(--pl-fg);
}
.ctp-preset-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.ctp-custom-input-row {
	display: flex;
	gap: 8px;
}
.ctp-cmd-input {
	flex: 1;
	height: 34px;
	padding: 0 12px;
	font-size: 12px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	background: color-mix(in srgb, #000 40%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	border-radius: 2px;
	color: var(--pl-fg);
	outline: none;
	transition: border-color 200ms ease;
}
.ctp-cmd-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}
.ctp-cmd-input::placeholder {
	color: color-mix(in srgb, var(--pl-fg-soft) 50%, transparent);
}
.ctp-run-btn {
	flex-shrink: 0;
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
.sc-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
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

.ctp-output-section {
	flex: 1;
	min-height: 200px;
	display: flex;
	flex-direction: column;
}
.ctp-output-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px 8px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	margin-bottom: 8px;
}
.ctp-output-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--pl-fg);
	letter-spacing: 0.06em;
}
.ctp-output-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--pl-fg-soft);
}
.ctp-output-dot.running {
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	animation: pulse-dot 1s ease-in-out infinite;
}
@keyframes pulse-dot {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.4; }
}
.ctp-clear-btn {
	font-size: 11px;
	padding: 4px 10px;
	cursor: pointer;
	border-radius: 2px;
	background: transparent;
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 25%, transparent);
	transition: all 200ms ease;
}
.ctp-clear-btn:hover:not(:disabled) {
	color: var(--pl-fg);
	border-color: color-mix(in srgb, var(--pl-fg-soft) 50%, transparent);
}
.ctp-clear-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.ctp-terminal {
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
.ctp-terminal::-webkit-scrollbar {
	width: 8px;
}
.ctp-terminal::-webkit-scrollbar-track {
	background: transparent;
}
.ctp-terminal::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	border-radius: 4px;
}
.sc-log-empty {
	color: color-mix(in srgb, var(--pl-fg-soft) 70%, transparent);
	font-style: italic;
	text-align: center;
	padding: 30px 10px;
}
.ctp-log-line {
	margin: 0;
	padding: 0;
	white-space: pre-wrap;
	word-break: break-all;
	color: #cfe8ff;
}
.ctp-log-line.log-stdout {
	color: #cfe8ff;
}
.ctp-log-line.log-stderr {
	color: #ff8a8a;
}
.ctp-log-line.log-system {
	color: color-mix(in srgb, var(--pl-accent) 80%, #fff);
}
.ctp-log-line.log-error {
	color: #ff6b6b;
	font-weight: 600;
}
</style>
