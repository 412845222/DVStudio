<template>
	<div v-if="open" class="dvs-export-overlay">
		<div class="dvs-export-dialog" role="dialog" aria-modal="true">
			<div class="dvs-export-head">
				<div class="dvs-export-title">导出视频</div>
				<button
					class="dvs-export-close vs-btn"
					type="button"
					aria-label="关闭"
					@click="$emit('close')"
				>
					×
				</button>
			</div>
			<div class="dvs-export-row">
				<label class="vs-label" style="width: 160px">
					<span>并发</span>
					<select
						:value="concurrency"
						class="vs-select"
						:disabled="isBusy"
						@change="onChangeConcurrency"
					>
						<option :value="4">4</option>
						<option :value="8">8</option>
						<option :value="16">16</option>
					</select>
				</label>

				<label class="vs-label" style="flex: 1; min-width: 0">
					<span>忽略舞台背景</span>
					<input
						class="vs-checkbox"
						type="checkbox"
						:checked="ignoreStageBackground"
						:disabled="isBusy"
						@change="onToggleIgnoreStageBackground"
					/>
				</label>

				<button class="vs-btn" type="button" :disabled="isBusy" @click="$emit('exportFrames')">
					导出序列帧
				</button>
			</div>

			<div class="dvs-export-row" style="margin-top: 10px">
				<label class="vs-label" style="flex: 1; min-width: 0">
					<span>输出格式</span>
					<select :value="format" class="vs-select" :disabled="isBusy" @change="onChangeFormat">
						<option value="mp4">mp4</option>
						<option value="mov">mov</option>
					</select>
				</label>

				<label class="vs-label" style="width: 160px">
					<span>质量</span>
					<select :value="quality" class="vs-select" :disabled="isBusy" @change="onChangeQuality">
						<option value="high">高</option>
						<option value="medium">中</option>
						<option value="low">低</option>
					</select>
				</label>
			</div>

			<div v-if="estimatedSizeText" class="dvs-export-row" style="margin-top: 6px">
				<div class="dvs-export-estimate">预估大小：{{ estimatedSizeText }}</div>
			</div>

			<div class="dvs-export-progress">
				<div class="dvs-export-progress-item">
					<div class="dvs-export-progress-head">
						<span>导出序列帧</span>
						<span class="dvs-export-progress-pct">{{ clampPct(clientProgress) }}%</span>
					</div>
					<div class="dvs-export-progress-track">
						<div
							class="dvs-export-progress-bar is-upload"
							:style="{ width: clampPct(clientProgress) + '%' }"
						/>
					</div>
				</div>

				<div class="dvs-export-progress-item">
					<div class="dvs-export-progress-head">
						<span>渲染视频</span>
						<button
							class="vs-btn"
							type="button"
							:disabled="isBusy || !hasFrames"
							@click="$emit('renderVideo')"
						>
							渲染视频
						</button>
						<span class="dvs-export-progress-pct">{{ clampPct(serverProgress) }}%</span>
					</div>
					<div class="dvs-export-progress-track">
						<div
							class="dvs-export-progress-bar is-encode"
							:style="{ width: clampPct(serverProgress) + '%' }"
						/>
					</div>
				</div>
			</div>

			<div v-if="status === 'done'" class="dvs-export-result">
				<div class="dvs-export-result-line">完成</div>

				<div v-if="serverPath" class="dvs-export-path">
					<div class="dvs-export-path-label">导出文件路径</div>
					<div class="dvs-export-path-value">{{ serverPath }}</div>
				</div>

				<div class="dvs-export-actions" v-if="serverPath">
					<button class="vs-btn" type="button" @click="onOpenOrCopy">
						{{ actionLabel }}
					</button>
				</div>
			</div>

			<div v-else-if="status === 'error'" class="dvs-export-result dvs-export-error">
				失败：{{ errorText }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ExportFormat, ExportJobStatus } from '../../../network/ExportService'

export type ExportUIStatus = ExportJobStatus | 'idle' | 'frames' | 'framesDone' | 'render'
export type ExportQuality = 'high' | 'medium' | 'low'

const props = defineProps<{
	open: boolean
	format: ExportFormat
	quality: ExportQuality
	concurrency: 4 | 8 | 16
	ignoreStageBackground: boolean
	status: ExportUIStatus
	clientProgress: number
	serverProgress: number
	serverPath: string
	estimatedSizeText: string
	errorText: string
}>()

const emit = defineEmits<{
	(e: 'update:format', v: ExportFormat): void
	(e: 'update:quality', v: ExportQuality): void
	(e: 'update:concurrency', v: 4 | 8 | 16): void
	(e: 'update:ignoreStageBackground', v: boolean): void
	(e: 'reset'): void
	(e: 'exportFrames'): void
	(e: 'renderVideo'): void
	(e: 'close'): void
}>()

const isBusy = computed(() => props.status === 'frames' || props.status === 'render')
const hasFrames = computed(
	() => props.status === 'framesDone' || props.status === 'render' || props.status === 'done'
)

const clampPct = (v: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(100, Math.round(n)))
}

const onChangeFormat = (ev: Event) => {
	const v = String((ev.target as HTMLSelectElement)?.value || 'mp4') as ExportFormat
	emit('update:format', v)
}

const onChangeQuality = (ev: Event) => {
	const raw = String((ev.target as HTMLSelectElement)?.value || 'medium')
	const v: ExportQuality = raw === 'high' ? 'high' : raw === 'low' ? 'low' : 'medium'
	emit('update:quality', v)
}

const onChangeConcurrency = (ev: Event) => {
	const raw = Number((ev.target as HTMLSelectElement)?.value || 8)
	const v = raw === 4 ? 4 : raw === 16 ? 16 : 8
	emit('reset')
	emit('update:concurrency', v)
}

const onToggleIgnoreStageBackground = (ev: Event) => {
	const v = !!(ev.target as HTMLInputElement)?.checked
	emit('update:ignoreStageBackground', v)
}

const copied = ref(false)

const canOpenLocalFolder = computed(() => {
	const ua = String(navigator.userAgent || '')
	if (/Electron|Tauri/i.test(ua)) return true
	return window.location.protocol === 'file:'
})

const actionLabel = computed(() => {
	if (copied.value) return '已复制路径'
	return canOpenLocalFolder.value ? '打开文件夹' : '复制路径'
})

const folderPath = computed(() => {
	const p = String(props.serverPath || '').trim()
	if (!p) return ''
	// serverPath is usually a file path, get its directory
	const normalized = p.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	if (idx <= 0) return p
	return normalized.slice(0, idx).replace(/\//g, '\\')
})

const toFileUrl = (path: string) => {
	// best-effort file URL for local environments
	const normalized = path.replace(/\\/g, '/')
	return 'file:///' + encodeURI(normalized)
}

const copyText = async (text: string) => {
	const t = String(text || '').trim()
	if (!t) return false
	try {
		await navigator.clipboard.writeText(t)
		return true
	} catch {
		// fallback
		try {
			const ta = document.createElement('textarea')
			ta.value = t
			ta.style.position = 'fixed'
			ta.style.left = '-99999px'
			ta.style.top = '0'
			document.body.appendChild(ta)
			ta.focus()
			ta.select()
			const ok = document.execCommand('copy')
			ta.remove()
			return ok
		} catch {
			return false
		}
	}
}

const onOpenOrCopy = async () => {
	copied.value = false
	const dir = folderPath.value
	if (!dir) return

	if (canOpenLocalFolder.value) {
		try {
			const win = window.open(toFileUrl(dir) + '/', '_blank', 'noopener')
			if (win) return
		} catch {
			// ignore
		}
	}

	const ok = await copyText(dir)
	copied.value = ok
}
</script>

<style scoped>
.dvs-export-overlay {
	position: fixed;
	left: 0;
	top: 0;
	width: 100vw;
	height: 100vh;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--pl-bg-0) 75%, rgba(0, 0, 0, 0.6));
	backdrop-filter: blur(4px);
}

.dvs-export-dialog {
	position: relative;
	width: 520px;
	max-width: calc(100vw - 24px);
	background: color-mix(in srgb, var(--pl-bg-1) 96%, rgba(0, 0, 0, 0.4));
	border: 1px solid color-mix(in srgb, var(--pl-accent) 32%, transparent);
	box-shadow:
		0 16px 48px rgba(0, 0, 0, 0.6),
		0 0 28px color-mix(in srgb, var(--pl-accent) 14%, transparent);
	padding: 16px 18px;
	border-radius: 4px;
	box-sizing: border-box;
	overflow: hidden;
}

.dvs-export-dialog::before,
.dvs-export-dialog::after {
	content: '';
	position: absolute;
	width: 14px;
	height: 14px;
	border: 1px solid var(--pl-accent);
	pointer-events: none;
}

.dvs-export-dialog::before {
	top: -1px;
	left: -1px;
	border-right: none;
	border-bottom: none;
}

.dvs-export-dialog::after {
	bottom: -1px;
	right: -1px;
	border-left: none;
	border-top: none;
}

.dvs-export-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
	padding-bottom: 10px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	position: relative;
}

.dvs-export-head::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: -1px;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--pl-accent) 55%, transparent),
		transparent
	);
}

.dvs-export-title {
	font-size: 13px;
	color: var(--pl-fg);
	letter-spacing: 0.5px;
	text-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 40%, transparent);
	font-weight: 500;
}

.vs-btn {
	padding: 6px 14px;
	border-radius: 2px;
	border: 1px solid var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	color: var(--pl-fg);
	cursor: pointer;
	font-size: 12px;
	letter-spacing: 0.3px;
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		box-shadow 0.15s ease;
}

.vs-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 22%, transparent);
	box-shadow:
		0 0 12px color-mix(in srgb, var(--pl-accent) 35%, transparent),
		inset 0 0 8px color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.vs-btn:disabled {
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	color: color-mix(in srgb, var(--pl-fg) 30%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 15%, transparent);
	cursor: not-allowed;
	box-shadow: none;
}

.dvs-export-close {
	flex: 0 0 auto;
	width: 28px;
	height: 28px;
	padding: 0;
	line-height: 26px;
	text-align: center;
	font-size: 16px;
}

.vs-label {
	display: flex;
	align-items: center;
	gap: 8px;
	color: color-mix(in srgb, var(--pl-fg) 80%, transparent);
	font-size: 12px;
	letter-spacing: 0.3px;
}

.vs-select {
	flex: 1 1 0;
	min-width: 0;
	height: 28px;
	padding: 0 8px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 5%, transparent);
	color: var(--pl-fg);
	outline: none;
	box-sizing: border-box;
	font-size: 12px;
	transition:
		border-color 0.15s ease,
		box-shadow 0.15s ease;
}

.vs-select:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
}

.vs-select:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 75%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--pl-accent) 40%, transparent),
		0 0 8px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.vs-select:disabled {
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: color-mix(in srgb, var(--pl-fg) 30%, transparent);
}

.vs-checkbox {
	width: 16px;
	height: 16px;
	accent-color: var(--pl-accent);
}

.dvs-export-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.dvs-export-estimate {
	color: color-mix(in srgb, var(--pl-fg) 60%, transparent);
	font-size: 12px;
}

.dvs-export-progress {
	margin-top: 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.dvs-export-progress-item {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.dvs-export-progress-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: var(--pl-fg);
	font-size: 12px;
	letter-spacing: 0.3px;
}

.dvs-export-progress-pct {
	color: var(--pl-accent);
	font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
	text-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent);
}

.dvs-export-progress-track {
	height: 6px;
	background: color-mix(in srgb, var(--pl-fg) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	border-radius: 1px;
	overflow: hidden;
}

.dvs-export-progress-bar {
	height: 100%;
	transition: width 140ms linear;
	border-radius: 1px;
}

.dvs-export-progress-bar.is-upload {
	background: linear-gradient(
		90deg,
		var(--pl-accent),
		color-mix(in srgb, var(--pl-accent) 60%, var(--pl-cold, #3aa8b4))
	);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 60%, transparent);
}

.dvs-export-progress-bar.is-encode {
	background: linear-gradient(
		90deg,
		var(--pl-cold, #3aa8b4),
		color-mix(in srgb, var(--pl-cold, #3aa8b4) 70%, var(--pl-accent))
	);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-cold, #3aa8b4) 60%, transparent);
}

.dvs-export-result {
	margin-top: 12px;
	color: var(--pl-fg);
	font-size: 12px;
	line-height: 1.5;
	letter-spacing: 0.3px;
}

.dvs-export-result-line {
	color: var(--pl-fg);
}

.dvs-export-error {
	color: #e06b6b;
	text-shadow: 0 0 8px rgba(224, 107, 107, 0.4);
}

.dvs-export-actions {
	margin-top: 12px;
}

.dvs-export-path {
	margin-top: 8px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	padding: 8px 10px;
	border-radius: 2px;
}

.dvs-export-path-label {
	color: color-mix(in srgb, var(--pl-fg) 50%, transparent);
	font-size: 11px;
	margin-bottom: 4px;
	letter-spacing: 0.3px;
}

.dvs-export-path-value {
	font-size: 11px;
	color: var(--pl-fg);
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
}
</style>
