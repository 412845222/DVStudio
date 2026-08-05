<template>
	<transition name="cs-drawer">
		<div v-if="visible" class="cs-upload-drawer-overlay" @click.self="$emit('close')">
			<div class="cs-upload-drawer" :class="{ 'is-open': visible }">
				<div class="cs-ud-corners" aria-hidden="true">
					<span class="cs-udc tl"></span>
					<span class="cs-udc tr"></span>
					<span class="cs-udc bl"></span>
					<span class="cs-udc br"></span>
				</div>
				<div class="cs-ud-header">
					<div class="cs-ud-title-row">
						<svg viewBox="0 0 24 24" class="cs-ud-icon" aria-hidden="true">
							<path
								d="M12 2.5v12M7.5 7l4.5-4.5L16.5 7"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
							<path
								d="M4.5 18.5h15"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
							/>
						</svg>
						<h3 class="cs-ud-title">{{ t('cloudStorage.uploadQueue.title') }}</h3>
						<span class="cs-ud-count">{{ completedCount }}/{{ totalCount }}</span>
					</div>
					<div class="cs-ud-actions">
						<button
							v-if="hasCompleted"
							class="cs-ud-btn cs-ud-btn-ghost"
							type="button"
							@click="clearCompleted"
						>
							{{ t('cloudStorage.uploadQueue.clearCompleted') }}
						</button>
						<button
							class="cs-ud-close"
							type="button"
							@click="$emit('close')"
							:title="t('common.close')"
						>
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path
									d="M4 4l8 8M12 4l-8 8"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					</div>
				</div>

				<div class="cs-ud-progress-bar">
					<div class="cs-ud-progress-fill" :style="{ width: overallProgress + '%' }"></div>
				</div>

				<div class="cs-ud-body">
					<div v-if="!tasks.length" class="cs-ud-empty">
						<svg viewBox="0 0 48 48" class="cs-ud-empty-icon" aria-hidden="true">
							<path
								d="M12 8h16l8 8v20a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-dasharray="4 3"
							/>
							<path
								d="M20 20h8M20 26h8M20 32h5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						<p>{{ t('cloudStorage.uploadQueue.empty') }}</p>
					</div>

					<div v-else class="cs-ud-list">
						<div
							v-for="task in tasks"
							:key="task.id"
							class="cs-ud-item"
							:class="{
								uploading: task.status === 'uploading',
								completed: task.status === 'completed',
								error: task.status === 'error',
								pending: task.status === 'pending'
							}"
						>
							<div class="cs-ud-item-icon">
								<svg
									v-if="task.status === 'completed'"
									viewBox="0 0 16 16"
									class="cs-udi-status success"
									aria-hidden="true"
								>
									<path
										d="M3 8l3.5 3.5L13 5"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<svg
									v-else-if="task.status === 'error'"
									viewBox="0 0 16 16"
									class="cs-udi-status error"
									aria-hidden="true"
								>
									<circle
										cx="8"
										cy="8"
										r="6"
										fill="none"
										stroke="currentColor"
										stroke-width="1.3"
									/>
									<path
										d="M5.5 5.5l5 5M10.5 5.5l-5 5"
										stroke="currentColor"
										stroke-width="1.3"
										stroke-linecap="round"
									/>
								</svg>
								<div v-else-if="task.status === 'uploading'" class="cs-udi-spinner"></div>
								<svg v-else viewBox="0 0 16 16" class="cs-udi-status pending" aria-hidden="true">
									<circle
										cx="8"
										cy="8"
										r="6"
										fill="none"
										stroke="currentColor"
										stroke-width="1.3"
										stroke-dasharray="2 2"
									/>
								</svg>
							</div>
							<div class="cs-ud-item-info">
								<div class="cs-ud-item-name" :title="task.name">{{ task.name }}</div>
								<div class="cs-ud-item-meta">
									<span class="cs-ud-item-size">{{ formatSize(task.size) }}</span>
									<span v-if="task.prefix" class="cs-ud-item-prefix">{{ task.prefix }}</span>
									<span v-if="task.status === 'uploading'" class="cs-ud-item-percent">
										{{ Math.round(task.progress) }}%
									</span>
									<span v-else-if="task.status === 'error'" class="cs-ud-item-error">
										{{ task.error }}
									</span>
								</div>
								<div v-if="task.status === 'uploading'" class="cs-ud-item-progress">
									<div
										class="cs-ud-item-progress-fill"
										:style="{ width: task.progress + '%' }"
									></div>
								</div>
							</div>
							<div class="cs-ud-item-actions">
								<button
									v-if="task.status === 'error'"
									class="cs-ud-item-btn retry"
									type="button"
									:title="t('cloudStorage.uploadQueue.retry')"
									@click="retryTask(task.id)"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M13.5 8a5.5 5.5 0 1 1-1.3-3.6"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
										<path
											d="M10.7 2.7h3v3"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
									</svg>
								</button>
								<button
									class="cs-ud-item-btn remove"
									type="button"
									:title="t('cloudStorage.uploadQueue.remove')"
									@click="removeTask(task.id)"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M4 4l8 8M12 4l-8 8"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</transition>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'
import { useUploadQueue } from '../../composables/useUploadQueue'

const { t } = useI18n()

defineProps<{
	visible: boolean
}>()

defineEmits<{
	(e: 'close'): void
}>()

const {
	tasks,
	completedCount,
	totalCount,
	overallProgress,
	hasCompleted,
	retryTask,
	removeTask,
	clearCompleted,
	formatSize
} = useUploadQueue()
</script>

<style scoped>
.cs-upload-drawer-overlay {
	position: fixed;
	top: 40px;
	right: 0;
	bottom: 0;
	left: 0;
	z-index: 2000;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(2px);
	display: flex;
	justify-content: flex-end;
}

.cs-upload-drawer {
	width: 420px;
	max-width: 90vw;
	height: 100%;
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--pl-bg-1) 95%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 98%, transparent)
	);
	border-left: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	box-shadow:
		-8px 0 32px rgba(0, 0, 0, 0.5),
		-4px 0 16px color-mix(in srgb, var(--pl-accent) 10%, transparent);
	display: flex;
	flex-direction: column;
	position: relative;
	transform: translateX(100%);
	transition: transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.cs-upload-drawer.is-open {
	transform: translateX(0);
}

.cs-ud-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 10;
}

.cs-udc {
	position: absolute;
	width: 12px;
	height: 12px;
}

.cs-udc.tl {
	top: 6px;
	left: 6px;
	border-top: 1.5px solid var(--pl-accent);
	border-left: 1.5px solid var(--pl-accent);
	box-shadow: -2px -2px 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-udc.tr {
	top: 6px;
	right: 6px;
	border-top: 1.5px solid var(--pl-accent);
	border-right: 1.5px solid var(--pl-accent);
	box-shadow: 2px -2px 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-udc.bl {
	bottom: 6px;
	left: 6px;
	border-bottom: 1.5px solid var(--pl-accent);
	border-left: 1.5px solid var(--pl-accent);
	box-shadow: -2px 2px 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-udc.br {
	bottom: 6px;
	right: 6px;
	border-bottom: 1.5px solid var(--pl-accent);
	border-right: 1.5px solid var(--pl-accent);
	box-shadow: 2px 2px 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-ud-header {
	flex-shrink: 0;
	padding: 20px 20px 16px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--pl-accent) 8%, transparent),
		transparent
	);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.cs-ud-title-row {
	display: flex;
	align-items: center;
	gap: 10px;
}

.cs-ud-icon {
	width: 20px;
	height: 20px;
	color: var(--pl-accent);
	filter: drop-shadow(0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent));
}

.cs-ud-title {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	color: var(--pl-fg);
	letter-spacing: 0.3px;
}

.cs-ud-count {
	font-size: 11px;
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	color: var(--pl-accent);
	padding: 3px 10px;
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.cs-ud-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.cs-ud-btn {
	height: 26px;
	padding: 0 10px;
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: transparent;
	color: var(--pl-fg-soft);
	transition: all 160ms ease;
}

.cs-ud-btn:hover {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-ud-close {
	width: 28px;
	height: 28px;
	border: none;
	background: transparent;
	color: var(--pl-fg-soft);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 160ms ease;
}

.cs-ud-close:hover {
	color: var(--pl-fg);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
}

.cs-ud-close svg {
	width: 14px;
	height: 14px;
}

.cs-ud-progress-bar {
	flex-shrink: 0;
	height: 3px;
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	position: relative;
	overflow: hidden;
}

.cs-ud-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--pl-accent), var(--pl-cold));
	transition: width 200ms ease;
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 50%, transparent);
}

.cs-ud-body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 12px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 30%, transparent) transparent;
}

.cs-ud-body::-webkit-scrollbar {
	width: 4px;
}

.cs-ud-body::-webkit-scrollbar-track {
	background: transparent;
}

.cs-ud-body::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-radius: 2px;
}

.cs-ud-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 60px 20px;
	color: var(--pl-fg-soft);
	text-align: center;
}

.cs-ud-empty-icon {
	width: 56px;
	height: 56px;
	opacity: 0.3;
	margin-bottom: 16px;
}

.cs-ud-empty p {
	margin: 0;
	font-size: 13px;
	line-height: 1.6;
}

.cs-ud-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.cs-ud-item {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 12%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 50%, transparent);
	transition: all 160ms ease;
}

.cs-ud-item.uploading {
	border-color: color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 5%, transparent);
}

.cs-ud-item.completed {
	border-color: color-mix(in srgb, #22c55e 20%, transparent);
}

.cs-ud-item.error {
	border-color: color-mix(in srgb, #ef4444 30%, transparent);
	background: color-mix(in srgb, #ef4444 5%, transparent);
}

.cs-ud-item-icon {
	width: 24px;
	height: 24px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 2px;
}

.cs-udi-status {
	width: 18px;
	height: 18px;
}

.cs-udi-status.success {
	color: #22c55e;
	filter: drop-shadow(0 0 6px color-mix(in srgb, #22c55e 40%, transparent));
}

.cs-udi-status.error {
	color: #ef4444;
	filter: drop-shadow(0 0 6px color-mix(in srgb, #ef4444 40%, transparent));
}

.cs-udi-status.pending {
	color: var(--pl-fg-soft);
	opacity: 0.5;
}

.cs-udi-spinner {
	width: 18px;
	height: 18px;
	border: 2px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-top-color: var(--pl-accent);
	border-radius: 50%;
	animation: cs-udi-spin 0.8s linear infinite;
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

@keyframes cs-udi-spin {
	to {
		transform: rotate(360deg);
	}
}

.cs-ud-item-info {
	flex: 1;
	min-width: 0;
}

.cs-ud-item-name {
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-bottom: 4px;
}

.cs-ud-item-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 10px;
	color: var(--pl-fg-soft);
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	flex-wrap: wrap;
}

.cs-ud-item-size {
	color: var(--pl-fg-soft);
}

.cs-ud-item-prefix {
	color: var(--pl-accent);
	opacity: 0.7;
	max-width: 100px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cs-ud-item-percent {
	color: var(--pl-accent);
	font-weight: 600;
}

.cs-ud-item-error {
	color: #ef4444;
	max-width: 150px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cs-ud-item-progress {
	margin-top: 6px;
	height: 2px;
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	overflow: hidden;
}

.cs-ud-item-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--pl-accent), var(--pl-cold));
	transition: width 150ms ease;
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-ud-item-actions {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.cs-ud-item-btn {
	width: 24px;
	height: 24px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	background: transparent;
	color: var(--pl-fg-soft);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 140ms ease;
}

.cs-ud-item-btn svg {
	width: 12px;
	height: 12px;
}

.cs-ud-item-btn:hover {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-ud-item-btn.retry:hover {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
}

.cs-ud-item-btn.remove:hover {
	border-color: #ef4444;
	color: #ef4444;
	background: color-mix(in srgb, #ef4444 8%, transparent);
}

.cs-drawer-enter-active,
.cs-drawer-leave-active {
	transition: opacity 200ms ease;
}

.cs-drawer-enter-from,
.cs-drawer-leave-to {
	opacity: 0;
}
</style>
