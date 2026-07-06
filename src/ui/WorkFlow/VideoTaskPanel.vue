<template>
	<div v-if="open" class="video-task-panel">
		<div class="video-task-panel__backdrop" @click="$emit('close')" />
		<div class="video-task-panel__dialog" @pointerdown.stop>
			<div class="video-task-panel__header">
				<div>
					<div class="video-task-panel__title">{{ t('tasks.video.title') }}</div>
					<div class="video-task-panel__status">{{ dataStatusText }}</div>
				</div>
				<div class="video-task-panel__actions">
					<button
						class="video-task-panel__btn"
						type="button"
						:disabled="refreshBusy || syncBusy"
						@click="$emit('refresh')"
					>
						{{ refreshBusy ? t('tasks.video.refreshing') : t('tasks.video.refreshLocal') }}
					</button>
					<button
						class="video-task-panel__btn primary"
						type="button"
						:disabled="refreshBusy || syncBusy"
						@click="$emit('sync-remote')"
					>
						{{ syncBusy ? t('tasks.video.syncing') : t('tasks.video.remoteSync') }}
					</button>
					<button class="video-task-panel__btn" type="button" @click="$emit('close')">{{ t('common.close') }}</button>
				</div>
			</div>

			<div class="video-task-panel__body">
				<div class="video-task-panel__list">
					<button
						v-for="item in tasks"
						:key="item.taskId"
						class="video-task-panel__item"
						:class="{ active: detailTaskId === item.taskId }"
						type="button"
						@click="$emit('select-task', item.taskId)"
					>
						<div class="video-task-panel__item-head">
							<span class="video-task-panel__item-model">{{ item.model || 'Seedance' }}</span>
							<span
								class="video-task-panel__item-status"
								:class="`status-${item.status || 'unknown'}`"
							>
								{{ item.status || 'unknown' }}
							</span>
						</div>
						<div class="video-task-panel__item-prompt">
							{{ item.prompt || t('tasks.video.noPrompt') }}
						</div>
						<div class="video-task-panel__item-meta">
							<span>{{ item.ratio || 'adaptive' }}</span>
							<span>{{ item.duration ? `${item.duration}s` : t('tasks.video.noDuration') }}</span>
							<span>{{ formatDateTime(item.updatedAt) }}</span>
						</div>
					</button>
					<div v-if="!tasks.length" class="video-task-panel__empty">
						{{ t('tasks.video.empty') }}
					</div>
				</div>

				<div class="video-task-panel__detail">
					<div v-if="detailLoading" class="video-task-panel__detail-empty">{{ t('tasks.video.loadingDetails') }}</div>
					<template v-else-if="detailTask">
						<div class="video-task-panel__detail-head">
							<div class="video-task-panel__detail-title">
								{{ detailTask.model || 'Seedance' }}
							</div>
							<div class="video-task-panel__detail-subtitle">{{ t('tasks.video.taskId') }}{{ detailTask.taskId }}</div>
						</div>

						<div v-if="previewVideoUrl(detailTask)" class="video-task-panel__preview-wrap">
							<video
								:key="`${detailTask.taskId}-${previewVideoUrl(detailTask)}`"
								class="video-task-panel__preview"
								:src="previewVideoUrl(detailTask)"
								controls
								preload="metadata"
								@error="onPreviewError(detailTask)"
							/>
						</div>
						<div v-else-if="detailTask.videoUrlRemote" class="video-task-panel__preview-empty">
							{{ t('tasks.video.noLocalPreview') }}
						</div>

						<div class="video-task-panel__kv-grid">
							<div>{{ t('tasks.video.status') }}</div>
							<div>{{ detailTask.status || 'unknown' }}</div>
							<div>{{ t('tasks.video.ratio') }}</div>
							<div>{{ detailTask.ratio || 'adaptive' }}</div>
							<div>{{ t('tasks.video.resolution') }}</div>
							<div>{{ detailTask.resolution || t('tasks.video.defaultRes') }}</div>
							<div>{{ t('tasks.video.duration') }}</div>
							<div>{{ detailTask.duration ? `${detailTask.duration}s` : t('tasks.video.notRecorded') }}</div>
							<div>{{ t('tasks.video.audio') }}</div>
							<div>{{ detailTask.generateAudio ? t('tasks.video.audioOn') : t('tasks.video.audioOff') }}</div>
							<div>{{ t('tasks.video.fixedCamera') }}</div>
							<div>{{ detailTask.cameraFixed ? t('common.yes') : t('common.no') }}</div>
							<div>{{ t('tasks.video.lastSync') }}</div>
							<div>{{ formatDateTime(detailTask.syncedAt || detailTask.updatedAt) }}</div>
						</div>

						<div class="video-task-panel__section">
							<div class="video-task-panel__section-title">{{ t('tasks.video.prompt') }}</div>
							<div class="video-task-panel__section-body text-block">
								{{ detailTask.prompt || t('tasks.video.noPrompt') }}
							</div>
						</div>

						<div
							v-if="detailTask.statusText || detailTask.errorMessage"
							class="video-task-panel__section"
						>
							<div class="video-task-panel__section-title">{{ t('tasks.video.statusInfo') }}</div>
							<div class="video-task-panel__section-body text-block">
								{{ detailTask.errorMessage || detailTask.statusText }}
							</div>
						</div>

						<div class="video-task-panel__section">
							<div class="video-task-panel__section-title">{{ t('tasks.video.resourceLinks') }}</div>
							<div class="video-task-panel__section-body links">
								<a
									v-if="detailTask.videoUrlLocal"
									:href="detailTask.videoUrlLocal"
									target="_blank"
									rel="noreferrer"
								>
									{{ t('tasks.video.localVideo') }}
								</a>
								<a
									v-if="detailTask.videoUrlRemote"
									:href="detailTask.videoUrlRemote"
									target="_blank"
									rel="noreferrer"
								>
									{{ t('tasks.video.remoteVideo') }}
								</a>
								<a
									v-if="detailTask.lastFrameUrlLocal"
									:href="detailTask.lastFrameUrlLocal"
									target="_blank"
									rel="noreferrer"
								>
									{{ t('tasks.video.localLastFrame') }}
								</a>
								<a
									v-if="detailTask.lastFrameUrlRemote"
									:href="detailTask.lastFrameUrlRemote"
									target="_blank"
									rel="noreferrer"
								>
									{{ t('tasks.video.remoteLastFrame') }}
								</a>
							</div>
						</div>
					</template>
					<div v-else class="video-task-panel__detail-empty">{{ t('tasks.video.selectToView') }}</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
export type VideoTaskPanelItem = {
	taskId: string
	model: string
	status: string
	prompt: string
	ratio?: string
	resolution?: string
	duration?: number
	generateAudio?: boolean
	cameraFixed?: boolean
	statusText?: string
	errorMessage?: string
	videoUrlLocal?: string
	videoUrlRemote?: string
	lastFrameUrlLocal?: string
	lastFrameUrlRemote?: string
	updatedAt: string
	syncedAt?: string
}
</script>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
	open: boolean
	tasks: VideoTaskPanelItem[]
	dataStatusText: string
	refreshBusy?: boolean
	syncBusy?: boolean
	detailTaskId?: string
	detailTask?: VideoTaskPanelItem | null
	detailLoading?: boolean
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'refresh'): void
	(e: 'sync-remote'): void
	(e: 'select-task', taskId: string): void
	(e: 'media-error', taskId: string): void
}>()

const formatDateTime = (raw: string | undefined) => {
	const text = String(raw || '').trim()
	if (!text) return '—'
	const date = new Date(text)
	if (Number.isNaN(date.getTime())) return text
	return date.toLocaleString()
}

const previewVideoUrl = (item: VideoTaskPanelItem | null | undefined) => {
	return String(item?.videoUrlLocal || '').trim()
}

const onPreviewError = (item: VideoTaskPanelItem | null | undefined) => {
	const taskId = String(item?.taskId || '').trim()
	if (!taskId) return
	emit('media-error', taskId)
}
</script>
<style scoped>
.video-task-panel {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	top: var(--aiwf-safe-top, 0px);
	z-index: var(--aiwf-popover-z-index, 120);
}

.video-task-panel__backdrop {
	position: absolute;
	inset: 0;
	background: var(--aiwf-dialog-mask-bg, rgb(from var(--dweb-overlay, #05070c) r g b / 0.52));
}

.video-task-panel__dialog {
	position: absolute;
	right: 24px;
	top: 24px;
	bottom: 24px;
	width: min(1100px, calc(100vw - 48px));
	display: grid;
	grid-template-rows: auto 1fr;
	border-radius: var(--aiwf-dialog-radius, var(--wf-panel-radius, 8px));
	overflow: hidden;
	background:
		linear-gradient(
			180deg,
			rgb(from var(--dweb-defualt) r g b / 0.97),
			rgb(from var(--dweb-defualt) r g b / 0.93)
		),
		linear-gradient(90deg, rgba(255, 255, 255, 0.04), transparent 28%);
	border: 1px solid var(--aiwf-dialog-border, rgb(from var(--vscode-border) r g b / 0.92));
	box-shadow: var(
		--aiwf-dialog-shadow-strong,
		0 0 0 1px rgba(255, 255, 255, 0.04),
		0 0 26px rgba(255, 255, 255, 0.05),
		0 18px 48px rgba(0, 0, 0, 0.34)
	);
}

.video-task-panel__header {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	align-items: center;
	padding: var(--aiwf-dialog-head-padding, 12px 14px);
	border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.82);
	background: rgb(from var(--dweb-defualt) r g b / 0.82);
}

.video-task-panel__title {
	font-size: var(--aiwf-dialog-title-size, 14px);
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--vscode-fg);
}

.video-task-panel__status {
	margin-top: 2px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.video-task-panel__actions {
	display: flex;
	gap: var(--aiwf-dialog-actions-gap, 10px);
}

.video-task-panel__btn {
	min-height: var(--aiwf-dialog-button-height, 32px);
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.78);
	background: rgb(from var(--dweb-defualt) r g b / 0.8);
	color: var(--vscode-fg);
	border-radius: var(--aiwf-dialog-button-radius, var(--aiwf-radius-md, 6px));
	padding: var(--aiwf-dialog-button-padding, 0 12px);
	cursor: pointer;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.video-task-panel__btn.primary {
	background: rgba(255, 255, 255, 0.06);
}

.video-task-panel__btn:disabled {
	opacity: 0.6;
	cursor: default;
}

.video-task-panel__body {
	display: grid;
	grid-template-columns: 360px 1fr;
	min-height: 0;
}

.video-task-panel__list,
.video-task-panel__detail {
	min-height: 0;
	overflow: auto;
}

.video-task-panel__list {
	padding: 10px;
	border-right: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
	background: rgb(from var(--dweb-defualt) r g b / 0.5);
}

.video-task-panel__item {
	width: 100%;
	text-align: left;
	margin-bottom: 8px;
	padding: 10px;
	border-radius: 0;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.78);
	background: rgb(from var(--dweb-defualt) r g b / 0.72);
	color: var(--vscode-fg);
	cursor: pointer;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.video-task-panel__item.active {
	border-color: rgba(255, 255, 255, 0.28);
	background: rgb(from var(--vscode-hover-bg) r g b / 0.86);
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.08),
		0 0 18px rgba(255, 255, 255, 0.05);
}

.video-task-panel__item-head,
.video-task-panel__item-meta {
	display: flex;
	justify-content: space-between;
	gap: 8px;
}

.video-task-panel__item-model {
	font-size: 12px;
	font-weight: 700;
}

.video-task-panel__item-status {
	font-size: 11px;
	text-transform: uppercase;
	color: var(--vscode-fg-muted);
}

.video-task-panel__item-status.status-succeeded,
.video-task-panel__item-status.status-success {
	color: #7fd7a8;
}

.video-task-panel__item-status.status-failed,
.video-task-panel__item-status.status-error,
.video-task-panel__item-status.status-expired {
	color: #d88484;
}

.video-task-panel__item-prompt {
	margin-top: 6px;
	font-size: 12px;
	line-height: 1.45;
	color: var(--vscode-fg);
	display: -webkit-box;
	line-clamp: 3;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
}

.video-task-panel__item-meta {
	margin-top: 8px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.video-task-panel__empty,
.video-task-panel__detail-empty {
	color: var(--vscode-fg-muted);
	font-size: 12px;
	line-height: 1.6;
}

.video-task-panel__detail {
	padding: 12px 14px;
	background: rgb(from var(--dweb-defualt) r g b / 0.62);
}

.video-task-panel__detail-head {
	margin-bottom: 12px;
}

.video-task-panel__detail-title {
	font-size: 15px;
	font-weight: 700;
	color: var(--vscode-fg);
}

.video-task-panel__detail-subtitle {
	margin-top: 2px;
	color: var(--vscode-fg-muted);
	font-size: 11px;
}

.video-task-panel__preview-wrap {
	margin-bottom: 12px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.78);
	box-shadow: 0 0 18px rgba(255, 255, 255, 0.04);
}

.video-task-panel__preview {
	width: 100%;
	max-height: 360px;
	background: #05070c;
	border-radius: 0;
	display: block;
}

.video-task-panel__preview-empty {
	margin-bottom: 12px;
	padding: 10px 12px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.7);
	color: var(--vscode-fg-muted);
	font-size: 12px;
	line-height: 1.6;
}

.video-task-panel__kv-grid {
	display: grid;
	grid-template-columns: 120px 1fr;
	gap: 8px 12px;
	margin-bottom: 12px;
	padding: 10px 12px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
	font-size: 12px;
	color: var(--vscode-fg);
}

.video-task-panel__kv-grid > div:nth-child(odd) {
	color: var(--vscode-fg-muted);
}

.video-task-panel__section {
	margin-top: 12px;
	padding: 10px 12px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.video-task-panel__section-title {
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--vscode-fg-muted);
}

.video-task-panel__section-body {
	margin-top: 6px;
	color: var(--vscode-fg);
	font-size: 12px;
}

.video-task-panel__section-body.text-block {
	white-space: pre-wrap;
	line-height: 1.6;
}

.video-task-panel__section-body.links {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}

.video-task-panel__section-body.links a {
	color: var(--vscode-fg);
	text-decoration-color: rgba(255, 255, 255, 0.26);
}

@media (max-width: 960px) {
	.video-task-panel__dialog {
		inset: 12px;
		width: auto;
	}

	.video-task-panel__body {
		grid-template-columns: 1fr;
	}

	.video-task-panel__list {
		max-height: 36vh;
		border-right: 0;
		border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
	}
}
</style>
