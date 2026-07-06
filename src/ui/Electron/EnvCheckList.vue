<script setup lang="ts">
import { useI18n } from '../../i18n'

type Item = {
	key: string
	label: string
	status: 'ok' | 'warn' | 'error' | 'unknown' | 'running'
	detail?: string
	progress?: number
	retrying?: boolean
	canRetry?: boolean
}

const { t } = useI18n()

defineProps<{ title?: string; items: Item[] }>()

const emit = defineEmits<{
	(e: 'retry', key: string): void
}>()
</script>

<template>
	<div class="panel">
		<div class="header">{{ title || t('envCheck.defaultTitle') }}</div>
		<div class="list">
			<div v-for="it in items" :key="it.key" class="rowItem">
				<div class="left">
					<div class="label">{{ it.label }}</div>
					<div v-if="it.detail" class="detail">{{ it.detail }}</div>
					<div class="progressWrap">
						<div class="progressTrack">
							<div
								class="progressBar"
								:style="{ width: `${Math.max(0, Math.min(100, Number(it.progress ?? 0)))}%` }"
							/>
						</div>
					</div>
				</div>
				<div class="rightActions">
					<div class="badge" :data-status="it.status">
						{{ t(`envCheck.status.${it.status}`) }}
					</div>
					<button
						v-if="it.status === 'error' && it.canRetry"
						class="retryBtn"
						type="button"
						:disabled="it.retrying"
						@click="emit('retry', it.key)"
					>
						<svg v-if="it.retrying" class="spinIcon" viewBox="0 0 24 24" aria-hidden="true">
							<circle
								cx="12"
								cy="12"
								r="9"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								opacity="0.3"
							/>
							<path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
						<span>{{ it.retrying ? t('envCheck.retrying') : t('envCheck.retry') }}</span>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	background: var(--dweb-defualt-light);
	overflow: hidden;
}

.header {
	padding: 10px 12px;
	border-bottom: 1px solid var(--vscode-border);
	color: var(--vscode-fg);
	font-size: 13px;
	font-weight: 600;
}

.list {
	padding: 8px;
	overflow: auto;
	min-height: 0;
}

.rowItem {
	display: flex;
	gap: 10px;
	align-items: flex-start;
	justify-content: space-between;
	padding: 8px 10px;
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	background: var(--dweb-defualt);
	margin-bottom: 8px;
}

.left {
	min-width: 0;
	flex: 1;
}

.label {
	font-size: 12px;
	color: var(--vscode-fg);
	line-height: 1.3;
}

.detail {
	margin-top: 2px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
	word-break: break-word;
}

.progressWrap {
	margin-top: 8px;
}

.progressTrack {
	height: 6px;
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	overflow: hidden;
}

.progressBar {
	height: 100%;
	background: var(--dweb-green-light);
	box-shadow: var(--dweb-shadow);
	transition: width 0.2s ease;
}

.rightActions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.badge {
	flex: 0 0 auto;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 11px;
	border: 1px solid var(--vscode-border);
	color: var(--vscode-fg);
	text-transform: uppercase;
}

.badge[data-status='ok'] {
	border-color: var(--vscode-success);
	color: var(--vscode-success);
}
.badge[data-status='warn'] {
	border-color: var(--vscode-warning);
	color: var(--vscode-warning);
}
.badge[data-status='error'] {
	border-color: var(--vscode-error);
	color: var(--vscode-error);
}

.badge[data-status='running'] {
	border-color: var(--vscode-accent);
	color: var(--vscode-accent);
}

.retryBtn {
	appearance: none;
	-webkit-appearance: none;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	border: none;
	border-radius: 0;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	padding: 2px 8px;
	cursor: pointer;
	font-size: 11px;
	box-shadow: none;
}

.retryBtn:hover {
	box-shadow: var(--dweb-shadow);
}

.retryBtn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.spinIcon {
	width: 12px;
	height: 12px;
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>
