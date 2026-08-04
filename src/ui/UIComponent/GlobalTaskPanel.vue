<template>
	<Teleport to="body">
		<Transition name="task-panel-fade">
			<div v-if="panelVisible" class="task-panel-overlay" @click.self="onClose">
				<div class="task-panel" :class="{ 'is-electron': isElectron }">
					<div class="card-glow" aria-hidden="true"></div>
					<div class="sq-container" aria-hidden="true">
						<span
							v-for="p in panelParticles"
							:key="p.id"
							class="sq-particle"
							:style="p.style"
						></span>
					</div>
					<div class="card-frame" aria-hidden="true">
						<span class="corner tl"></span>
						<span class="corner tr"></span>
						<span class="corner bl"></span>
						<span class="corner br"></span>
					</div>
					<div class="scanline-top" aria-hidden="true"></div>

					<div class="task-panel-header">
						<div class="task-panel-title">
							<span class="title-indicator"></span>
							<span class="task-panel-title-text">{{ t('taskQueue.title') }}</span>
							<span v-if="activeCount > 0" class="task-panel-badge running">{{ activeCount }}</span>
						</div>
						<div class="task-panel-actions">
							<button
								v-if="completedCount > 0"
								type="button"
								class="task-panel-action-btn"
								:title="t('taskQueue.clearCompleted')"
								@click="onClearCompleted"
							>
								<svg
									viewBox="0 0 24 24"
									width="14"
									height="14"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<polyline points="3 6 5 6 21 6" />
									<path
										d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
									/>
								</svg>
							</button>
							<button
								type="button"
								class="task-panel-action-btn close"
								:aria-label="t('common.close')"
								@click="onClose"
							>
								<svg
									viewBox="0 0 24 24"
									width="14"
									height="14"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>

					<div class="task-panel-overview" v-if="hasTasks">
						<div class="overview-item">
							<span class="overview-value running">{{ runningCount + submittingCount }}</span>
							<span class="overview-label">{{ t('taskQueue.running') }}</span>
						</div>
						<div class="overview-divider"></div>
						<div class="overview-item">
							<span class="overview-value success">{{ completedCount }}</span>
							<span class="overview-label">{{ t('taskQueue.completed') }}</span>
						</div>
						<div class="overview-divider"></div>
						<div class="overview-item">
							<span class="overview-value error">{{ failedCount }}</span>
							<span class="overview-label">{{ t('taskQueue.failed') }}</span>
						</div>
					</div>

					<div class="task-panel-list">
						<div v-if="!hasTasks" class="task-panel-empty">
							<div class="empty-frame" aria-hidden="true">
								<span class="corner tl"></span>
								<span class="corner tr"></span>
								<span class="corner bl"></span>
								<span class="corner br"></span>
							</div>
							<div class="empty-icon">
								<svg
									viewBox="0 0 64 64"
									width="48"
									height="48"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<rect x="12" y="8" width="40" height="48" rx="2" />
									<path d="M20 20h24M20 30h24M20 40h16" />
								</svg>
							</div>
							<div class="empty-text">{{ t('taskQueue.noTasks') }}</div>
							<div class="empty-hint">{{ t('taskQueue.noTasksHint') }}</div>
						</div>

						<template v-for="task in allTasks" :key="task.id">
							<div class="task-item" :class="`status-${task.status}`">
								<div class="task-item-frame" aria-hidden="true">
									<span class="corner tl"></span>
									<span class="corner tr"></span>
									<span class="corner bl"></span>
									<span class="corner br"></span>
								</div>
								<div class="task-item-header">
									<div class="task-item-provider">
										<span class="provider-badge" :class="`provider-${task.provider}`">
											{{ getProviderLabel(task.provider) }}
										</span>
										<span class="task-item-type">
											{{ task.label || getCategoryLabel(task.category) }}
										</span>
									</div>
									<div class="task-item-status">
										<span class="status-dot" />
										<span class="status-text">{{ getStatusText(task) }}</span>
									</div>
								</div>

								<div class="task-item-title" :title="task.title">
									{{ task.title || task.prompt || t('taskQueue.untitled') }}
								</div>

								<div
									v-if="task.status === 'running' || task.status === 'submitting'"
									class="task-item-progress"
								>
									<div class="progress-bar">
										<div class="progress-fill" :style="{ width: task.progress + '%' }" />
										<div class="progress-glow" :style="{ left: task.progress + '%' }" />
									</div>
									<span class="progress-percent">{{ Math.round(task.progress) }}%</span>
								</div>

								<div v-if="task.statusText" class="task-item-status-text">
									{{ task.statusText }}
								</div>

								<div v-if="task.errorMessage" class="task-item-error">
									<span class="error-icon">
										<svg
											viewBox="0 0 24 24"
											width="12"
											height="12"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<circle cx="12" cy="12" r="10" />
											<line x1="12" y1="8" x2="12" y2="12" />
											<line x1="12" y1="16" x2="12.01" y2="16" />
										</svg>
									</span>
									<span class="error-text">{{ task.errorMessage }}</span>
								</div>

								<div
									v-if="task.resultAssets && task.resultAssets.length > 0"
									class="task-item-results"
								>
									<div
										v-for="(asset, idx) in task.resultAssets.slice(0, 4)"
										:key="idx"
										class="result-thumb"
									>
										<div class="thumb-frame" aria-hidden="true">
											<span class="corner tl"></span>
											<span class="corner tr"></span>
											<span class="corner bl"></span>
											<span class="corner br"></span>
										</div>
										<img
											v-if="asset.thumbnailUrl || (asset.url && asset.type === 'image')"
											:src="asset.thumbnailUrl || asset.url"
											:alt="''"
										/>
										<span v-else class="result-icon">{{ getAssetIcon(asset.type) }}</span>
									</div>
								</div>

								<div class="task-item-footer">
									<span class="task-item-time">{{ formatTime(task.updatedAt) }}</span>
									<div class="task-item-actions">
										<button
											v-if="canCancel(task)"
											type="button"
											class="task-item-btn cancel"
											@click="onCancelTask(task.id)"
										>
											{{ t('common.cancel') }}
										</button>
										<button
											type="button"
											class="task-item-btn delete"
											@click="onDeleteTask(task.id)"
										>
											{{ t('common.delete') }}
										</button>
									</div>
								</div>
							</div>
						</template>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { TaskQueueStore } from '../../store/taskqueue'
import { useI18n } from '../../i18n'
import type { GlobalTask } from '../../store/taskqueue'

const { t } = useI18n()

const panelVisible = computed(() => TaskQueueStore.state.panelVisible)

const allTasks = computed<GlobalTask[]>(() => {
	const tasks = Array.from(TaskQueueStore.state.tasks.values())
	return tasks.sort((a, b) => b.createdAt - a.createdAt)
})

const hasTasks = computed(() => allTasks.value.length > 0)

const activeCount = computed(() => TaskQueueStore.state.summary.activeCount || 0)
const runningCount = computed(() => TaskQueueStore.state.summary.runningCount || 0)
const submittingCount = computed(() => TaskQueueStore.state.summary.submittingCount || 0)
const completedCount = computed(() => TaskQueueStore.state.summary.completedCount || 0)
const failedCount = computed(() => TaskQueueStore.state.summary.failedCount || 0)

const isElectron = computed(() => {
	const runtime = (window as any)?.__DWEB_RUNTIME__
	return runtime?.isElectron === true
})

const panelParticles = computed(() => {
	const colors = ['var(--theme-accent)', 'var(--theme-info)', 'var(--theme-accent-hover)']
	return Array.from({ length: 8 }, (_, i) => {
		const size = 2 + Math.random() * 3
		return {
			id: `p-${i}`,
			style: {
				width: `${size}px`,
				height: `${size}px`,
				left: `${Math.random() * 100}%`,
				bottom: `${Math.random() * 100}%`,
				'--sq-color': colors[i % colors.length],
				'--sq-duration': `${6 + Math.random() * 6}s`,
				'--sq-delay': `${Math.random() * -8}s`,
				'--sq-opacity': '0.35',
				'--sq-sway': `${4 + Math.random() * 8}px`
			} as Record<string, string>
		}
	})
})

onMounted(() => {
	TaskQueueStore.dispatch('init')
})

function onClose() {
	TaskQueueStore.dispatch('hidePanel')
}

function onClearCompleted() {
	TaskQueueStore.dispatch('clearCompletedTasks')
}

function onCancelTask(id: string) {
	TaskQueueStore.dispatch('cancelTask', { id })
}

function onDeleteTask(id: string) {
	TaskQueueStore.dispatch('deleteTask', { id })
}

function canCancel(task: GlobalTask) {
	return ['pending', 'submitting', 'running'].includes(task.status)
}

function getStatusText(task: GlobalTask) {
	const map: Record<string, string> = {
		pending: t('taskQueue.statusPending'),
		submitting: t('taskQueue.statusSubmitting'),
		running: t('taskQueue.statusRunning'),
		completed: t('taskQueue.statusCompleted'),
		failed: t('taskQueue.statusFailed'),
		cancelled: t('taskQueue.statusCancelled')
	}
	return map[task.status] || task.status
}

function getProviderLabel(provider: string) {
	const map: Record<string, string> = {
		meshy: 'Meshy',
		tripo3d: 'Tripo3D',
		seedance: 'Seedance',
		gemini: 'Gemini',
		ark: 'Ark',
		comfyui: 'ComfyUI',
		text: t('taskQueue.providerText'),
		frontend: t('taskQueue.providerFrontend')
	}
	return map[provider] || provider
}

function getTaskTypeLabel(type?: string) {
	if (!type) return ''
	const map: Record<string, string> = {
		'text-to-3d': t('taskQueue.typeTextTo3D'),
		'image-to-3d': t('taskQueue.typeImageTo3D'),
		'text-to-image': t('taskQueue.typeTextToImage'),
		'image-to-image': t('taskQueue.typeImageToImage'),
		'text-to-video': t('taskQueue.typeTextToVideo'),
		'image-to-video': t('taskQueue.typeImageToVideo'),
		comfyui: t('taskQueue.typeComfyUI'),
		text: t('taskQueue.taskType.text'),
		image: t('taskQueue.taskType.image'),
		video: t('taskQueue.taskType.video'),
		model3d: t('taskQueue.taskType.model3d')
	}
	return map[type] || type
}

function getCategoryLabel(category?: string) {
	const map: Record<string, string> = {
		image: t('taskQueue.taskType.image'),
		video: t('taskQueue.taskType.video'),
		'3d': t('taskQueue.taskType.model3d'),
		custom: t('taskQueue.taskType.text')
	}
	return map[category || ''] || category || ''
}

function getAssetIcon(type: string) {
	const map: Record<string, string> = {
		image: '▣',
		video: '▶',
		model: '◆',
		text: '▤',
		file: '▥'
	}
	return map[type] || '▥'
}

function formatTime(ts: number | null) {
	if (!ts) return ''
	const d = new Date(ts)
	const now = new Date()
	const diff = now.getTime() - ts
	if (diff < 60000) return t('taskQueue.timeJustNow')
	if (diff < 3600000) return t('taskQueue.timeMinutesAgo', { n: Math.floor(diff / 60000) })
	if (diff < 86400000) return t('taskQueue.timeHoursAgo', { n: Math.floor(diff / 3600000) })
	return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.task-panel-overlay {
	position: fixed;
	inset: 0;
	z-index: 9999;
	background: var(--wf-overlay-bg, rgba(0, 0, 0, 0.45));
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
	display: flex;
	justify-content: flex-end;
	align-items: flex-start;
	padding-top: 38px;
}

.task-panel {
	position: relative;
	width: 400px;
	max-height: calc(100vh - 50px);
	background: var(--theme-card-bg, #23272e);
	border: 1px solid
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c));
	border-radius: 2px;
	box-shadow:
		var(--theme-shadow-elevated, 0 4px 16px rgba(0, 0, 0, 0.24)),
		inset 0 1px 0 color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	display: flex;
	flex-direction: column;
	margin-right: 8px;
	margin-top: 4px;
	overflow: hidden;
}

.task-panel.is-electron {
	margin-top: 0;
}

.card-glow {
	position: absolute;
	inset: -1px;
	z-index: 1;
	pointer-events: none;
	background: radial-gradient(
		ellipse at center,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent),
		transparent 70%
	);
	opacity: 0.5;
}

.scanline-top {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	z-index: 6;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 0%, transparent) 10%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent) 50%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 0%, transparent) 90%,
		transparent 100%
	);
	box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	animation: scanline-pulse 12s ease-in-out infinite;
	pointer-events: none;
}

@keyframes scanline-pulse {
	0%,
	100% {
		opacity: 0.55;
	}
	50% {
		opacity: 1;
	}
}

/* Corner brackets */
.card-frame,
.task-item-frame,
.thumb-frame,
.empty-frame {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
}

.card-frame .corner,
.task-item-frame .corner,
.thumb-frame .corner,
.empty-frame .corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--theme-accent, #1f9d84);
}

.card-frame .corner.tl {
	top: 4px;
	left: 4px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--theme-accent, #1f9d84);
}
.card-frame .corner.tr {
	top: 4px;
	right: 4px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--theme-accent, #1f9d84);
}
.card-frame .corner.bl {
	bottom: 4px;
	left: 4px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--theme-accent, #1f9d84);
}
.card-frame .corner.br {
	bottom: 4px;
	right: 4px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--theme-accent, #1f9d84);
}

.task-item-frame .corner.tl {
	top: 3px;
	left: 3px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}
.task-item-frame .corner.tr {
	top: 3px;
	right: 3px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}
.task-item-frame .corner.bl {
	bottom: 3px;
	left: 3px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}
.task-item-frame .corner.br {
	bottom: 3px;
	right: 3px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}

.task-item:hover .task-item-frame .corner {
	width: 14px;
	height: 14px;
	color: var(--theme-accent-hover, #27b99c);
}

.thumb-frame .corner {
	width: 4px;
	height: 4px;
}
.thumb-frame .corner.tl {
	top: 1px;
	left: 1px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}
.thumb-frame .corner.tr {
	top: 1px;
	right: 1px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}
.thumb-frame .corner.bl {
	bottom: 1px;
	left: 1px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}
.thumb-frame .corner.br {
	bottom: 1px;
	right: 1px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}

.empty-frame .corner.tl {
	top: 3px;
	left: 3px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}
.empty-frame .corner.tr {
	top: 3px;
	right: 3px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}
.empty-frame .corner.bl {
	bottom: 3px;
	left: 3px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}
.empty-frame .corner.br {
	bottom: 3px;
	right: 3px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}

.task-panel-header {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	border-bottom: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	flex-shrink: 0;
}

.task-panel-title {
	display: flex;
	align-items: center;
	gap: 8px;
}

.title-indicator {
	display: inline-block;
	width: 6px;
	height: 6px;
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px var(--theme-accent, #1f9d84);
}

.task-panel-title-text {
	font-size: 14px;
	font-weight: 700;
	color: var(--theme-text-primary, #eaf2f5);
	letter-spacing: 0.04em;
	text-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.task-panel-badge {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	min-width: 22px;
	height: 20px;
	padding: 0 6px;
	border-radius: 2px;
	font-size: 11px;
	line-height: 20px;
	text-align: center;
	font-weight: 700;
	letter-spacing: 0.04em;
}

.task-panel-badge.running {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	color: var(--theme-accent-hover, #27b99c);
}

.task-panel-actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

.task-panel-action-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 4%, transparent);
	color: var(--theme-text-secondary, #9aa0a6);
	width: 28px;
	height: 28px;
	border-radius: 2px;
	cursor: pointer;
	font-size: 14px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transition:
		background 200ms ease,
		border-color 200ms ease,
		color 200ms ease,
		box-shadow 200ms ease;
}

.task-panel-action-btn:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
	color: var(--theme-text-primary, #eaf2f5);
	box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.task-panel-action-btn.close:hover {
	background: color-mix(in srgb, var(--theme-error, #f14c4c) 14%, transparent);
	border-color: color-mix(in srgb, var(--theme-error, #f14c4c) 45%, transparent);
	color: color-mix(in srgb, #ff9f9f 90%, #fff);
	box-shadow: 0 0 12px color-mix(in srgb, var(--theme-error, #f14c4c) 22%, transparent);
}

.task-panel-overview {
	position: relative;
	z-index: 4;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 14px 16px;
	border-bottom: 1px dashed color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
	flex-shrink: 0;
}

.overview-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	flex: 1;
}

.overview-divider {
	width: 1px;
	height: 28px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.overview-value {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 20px;
	font-weight: 700;
	text-shadow: 0 0 10px currentColor;
}

.overview-value.running {
	color: var(--theme-accent, #1f9d84);
}

.overview-value.success {
	color: var(--theme-success, #17a773);
}

.overview-value.error {
	color: var(--theme-error, #f14c4c);
}

.overview-label {
	font-size: 10px;
	color: var(--theme-text-secondary, #9aa0a6);
	letter-spacing: 0.08em;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.task-panel-list {
	position: relative;
	z-index: 4;
	flex: 1;
	overflow-y: auto;
	padding: 10px;
}

.task-panel-empty {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 48px 24px;
	gap: 12px;
	border: 1px dashed color-mix(in srgb, var(--theme-text-secondary, #9aa0a6) 25%, transparent);
	border-radius: 2px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--theme-card-bg, #111a22) 55%, transparent),
		color-mix(in srgb, var(--theme-bg-secondary, #07090d) 80%, transparent)
	);
}

.empty-icon {
	color: var(--theme-accent-hover, #27b99c);
	opacity: 0.6;
	filter: drop-shadow(0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent));
}

.empty-text {
	font-size: 13px;
	font-weight: 600;
	color: var(--theme-text-primary, #eaf2f5);
	letter-spacing: 0.04em;
}

.empty-hint {
	font-size: 11px;
	color: var(--theme-text-secondary, #9aa0a6);
	line-height: 1.6;
	text-align: center;
}

.task-item {
	position: relative;
	padding: 12px;
	border-radius: 2px;
	margin-bottom: 8px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--theme-card-bg, #111a22) 70%, transparent),
		color-mix(in srgb, var(--theme-bg-secondary, #07090d) 85%, transparent)
	);
	border: 1px solid
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c));
	box-shadow:
		0 2px 10px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		filter 220ms ease;
}

.task-item:last-child {
	margin-bottom: 0;
}

.task-item:hover {
	filter: brightness(1.08);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 45%, transparent),
		0 8px 24px rgba(0, 0, 0, 0.35);
}

.task-item.status-completed {
	border-color: color-mix(
		in srgb,
		var(--theme-success, #17a773) 40%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c))
	);
}

.task-item.status-completed .task-item-frame .corner {
	color: color-mix(in srgb, var(--theme-success, #17a773) 50%, transparent);
}

.task-item.status-failed {
	border-color: color-mix(
		in srgb,
		var(--theme-error, #f14c4c) 40%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c))
	);
}

.task-item.status-failed .task-item-frame .corner {
	color: color-mix(in srgb, var(--theme-error, #f14c4c) 50%, transparent);
}

.task-item.status-running {
	border-color: color-mix(
		in srgb,
		var(--theme-accent, #1f9d84) 50%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c))
	);
}

.task-item.status-submitting {
	border-color: color-mix(
		in srgb,
		var(--theme-info, #3aa8b4) 45%,
		color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, var(--theme-border, #3c3c3c))
	);
}

.task-item.status-submitting .task-item-frame .corner {
	color: color-mix(in srgb, var(--theme-info, #3aa8b4) 50%, transparent);
}

.task-item.status-cancelled {
	opacity: 0.6;
}

.task-item-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.task-item-provider {
	display: flex;
	align-items: center;
	gap: 6px;
}

.provider-badge {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	font-weight: 700;
	padding: 2px 6px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 4%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	color: var(--theme-accent-hover, #27b99c);
	letter-spacing: 0.06em;
}

.provider-badge.provider-meshy {
	background: color-mix(in srgb, #6366f1 12%, transparent);
	border-color: color-mix(in srgb, #6366f1 35%, transparent);
	color: #818cf8;
}

.provider-badge.provider-tripo3d {
	background: color-mix(in srgb, #10b981 12%, transparent);
	border-color: color-mix(in srgb, #10b981 35%, transparent);
	color: #34d399;
}

.provider-badge.provider-seedance {
	background: color-mix(in srgb, var(--theme-warning, #e5b567) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-warning, #e5b567) 35%, transparent);
	color: var(--theme-warning, #e5b567);
}

.provider-badge.provider-comfyui {
	background: color-mix(in srgb, var(--theme-info, #3aa8b4) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-info, #3aa8b4) 35%, transparent);
	color: var(--theme-info, #3aa8b4);
}

.task-item-type {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	color: var(--theme-text-secondary, #9aa0a6);
	letter-spacing: 0.04em;
}

.task-item-status {
	display: flex;
	align-items: center;
	gap: 5px;
}

.status-dot {
	width: 6px;
	height: 6px;
	border-radius: 1px;
	background: var(--theme-text-secondary, #9aa0a6);
}

.status-pending .status-dot,
.status-submitting .status-dot,
.status-running .status-dot {
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px var(--theme-accent, #1f9d84);
	animation: status-pulse 1.5s ease-in-out infinite;
}

.status-submitting .status-dot {
	background: var(--theme-info, #3aa8b4);
	box-shadow: 0 0 8px var(--theme-info, #3aa8b4);
}

.status-completed .status-dot {
	background: var(--theme-success, #17a773);
	box-shadow: 0 0 6px var(--theme-success, #17a773);
}

.status-failed .status-dot {
	background: var(--theme-error, #f14c4c);
	box-shadow: 0 0 6px var(--theme-error, #f14c4c);
}

.status-cancelled .status-dot {
	background: var(--theme-text-secondary, #9aa0a6);
}

@keyframes status-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.4;
	}
}

.status-text {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	color: var(--theme-text-secondary, #9aa0a6);
	letter-spacing: 0.06em;
}

.task-item-title {
	font-size: 13px;
	color: var(--theme-text-primary, #eaf2f5);
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-bottom: 8px;
	letter-spacing: 0.01em;
}

.task-item-progress {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}

.progress-bar {
	position: relative;
	flex: 1;
	height: 3px;
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 5%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
	border-radius: 1px;
	overflow: hidden;
}

.progress-fill {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	background: linear-gradient(
		90deg,
		var(--theme-accent, #1f9d84),
		var(--theme-accent-hover, #27b99c)
	);
	border-radius: 1px;
	transition: width 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}

.progress-glow {
	position: absolute;
	top: -2px;
	width: 6px;
	height: 7px;
	background: var(--theme-accent-hover, #27b99c);
	border-radius: 1px;
	filter: blur(3px);
	transform: translateX(-50%);
	transition: left 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.progress-percent {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	color: var(--theme-accent-hover, #27b99c);
	min-width: 36px;
	text-align: right;
	letter-spacing: 0.06em;
	text-shadow: 0 0 6px color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}

.task-item-status-text {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	color: var(--theme-text-secondary, #9aa0a6);
	margin-bottom: 8px;
	letter-spacing: 0.04em;
}

.task-item-error {
	display: flex;
	align-items: flex-start;
	gap: 6px;
	padding: 8px 10px;
	background: color-mix(in srgb, var(--theme-error, #f14c4c) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-error, #f14c4c) 30%, transparent);
	border-radius: 2px;
	margin-bottom: 8px;
}

.error-icon {
	color: var(--theme-error, #f14c4c);
	font-size: 12px;
	flex-shrink: 0;
	margin-top: 1px;
}

.error-text {
	font-size: 11px;
	color: color-mix(in srgb, #ff9f9f 90%, #fff);
	word-break: break-all;
	line-height: 1.5;
}

.task-item-results {
	display: flex;
	gap: 6px;
	margin-bottom: 10px;
}

.result-thumb {
	position: relative;
	width: 44px;
	height: 44px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 4%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
	overflow: hidden;
	display: flex;
	align-items: center;
	justify-content: center;
}

.result-thumb img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.result-icon {
	font-size: 18px;
	color: var(--theme-accent-hover, #27b99c);
}

.task-item-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding-top: 8px;
	border-top: 1px dashed color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
}

.task-item-time {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	color: var(--theme-text-secondary, #9aa0a6);
	letter-spacing: 0.04em;
}

.task-item-actions {
	display: flex;
	gap: 6px;
}

.task-item-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 4%, transparent);
	color: var(--theme-text-secondary, #9aa0a6);
	font-size: 11px;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	padding: 4px 10px;
	border-radius: 2px;
	cursor: pointer;
	letter-spacing: 0.04em;
	transition:
		background 200ms ease,
		border-color 200ms ease,
		color 200ms ease,
		box-shadow 200ms ease,
		transform 160ms ease;
}

.task-item-btn:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
	color: var(--theme-text-primary, #eaf2f5);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent);
}

.task-item-btn:active {
	transform: translateY(1px);
}

.task-item-btn.cancel:hover {
	background: color-mix(in srgb, var(--theme-warning, #cca700) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-warning, #cca700) 45%, transparent);
	color: color-mix(in srgb, var(--theme-warning, #cca700) 90%, #fff);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-warning, #cca700) 20%, transparent);
}

.task-item-btn.delete:hover {
	background: color-mix(in srgb, var(--theme-error, #f14c4c) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-error, #f14c4c) 45%, transparent);
	color: color-mix(in srgb, #ff9f9f 90%, #fff);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-error, #f14c4c) 20%, transparent);
}

/* Scrollbar */
.task-panel-list::-webkit-scrollbar {
	width: 6px;
}

.task-panel-list::-webkit-scrollbar-track {
	background: color-mix(in srgb, var(--theme-text-primary, #eaf2f5) 3%, transparent);
}

.task-panel-list::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	border-radius: 1px;
}

.task-panel-list::-webkit-scrollbar-thumb:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
}

/* Transition */
.task-panel-fade-enter-active,
.task-panel-fade-leave-active {
	transition: opacity 0.2s ease;
}

.task-panel-fade-enter-active .task-panel,
.task-panel-fade-leave-active .task-panel {
	transition:
		transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
		opacity 0.22s ease;
}

.task-panel-fade-enter-from,
.task-panel-fade-leave-to {
	opacity: 0;
}

.task-panel-fade-enter-from .task-panel,
.task-panel-fade-leave-to .task-panel {
	transform: translateX(20px);
	opacity: 0;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.scanline-top,
	.status-dot {
		animation: none !important;
	}
	.sq-particle {
		animation-duration: 30s !important;
	}
	.task-item {
		transition: border-color 180ms ease;
	}
}
</style>
