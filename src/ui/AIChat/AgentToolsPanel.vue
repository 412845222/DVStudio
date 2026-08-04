<template>
	<div class="agent-tools-panel">
		<div class="agent-tools-header">
			<div class="agent-tools-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4 4h16v16H4z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M9 9h6M9 15h6M9 12h6"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<span class="agent-tools-title">{{ t('aichat.toolsPanel.title') }}</span>
			<span class="agent-tools-count">{{ tools.length }}</span>
		</div>

		<div class="agent-tools-list">
			<div
				v-for="tool in tools"
				:key="tool.id"
				class="agent-tool-item"
				:class="[`status-${tool.status}`]"
			>
				<div class="agent-tool-icon">
					<svg
						v-if="tool.status === 'running'"
						class="agent-tool-spinner"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-dasharray="25 75"
							stroke-linecap="round"
						/>
					</svg>
					<svg v-else-if="tool.status === 'completed'" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M5 12l5 5L20 7"
							stroke="currentColor"
							stroke-width="2"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<svg v-else-if="tool.status === 'error'" viewBox="0 0 24 24" aria-hidden="true">
						<circle
							cx="12"
							cy="12"
							r="10"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
						<path
							d="M12 8v5M12 16v.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					<svg v-else viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M4 4h16v16H4z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							d="M9 9h6M9 15h6"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</div>

				<div class="agent-tool-info">
					<div class="agent-tool-name">{{ tool.name }}</div>
					<div class="agent-tool-status">{{ statusLabel(tool.status) }}</div>
				</div>

				<button
					v-if="tool.hasDetails"
					class="agent-tool-toggle"
					type="button"
					@click="toggleTool(tool.id)"
				>
					<svg
						viewBox="0 0 24 24"
						aria-hidden="true"
						:class="{ expanded: expandedTools.has(tool.id) }"
					>
						<path
							d="M6 9l6 6 6-6"
							stroke="currentColor"
							stroke-width="2"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</div>

			<div v-if="tools.length === 0" class="agent-tools-empty">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4 4h16v16H4z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M9 9h6M9 15h6M9 12h6"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				<span>{{ t('aichat.toolsPanel.empty') }}</span>
			</div>
		</div>

		<div v-if="expandedTools.size" class="agent-tools-details">
			<div
				v-for="tool in tools.filter((t) => expandedTools.has(t.id))"
				:key="tool.id"
				class="agent-tool-detail"
			>
				<div class="agent-tool-detail-header">
					<span class="agent-tool-detail-title">{{ tool.name }}</span>
					<button class="agent-tool-detail-close" type="button" @click="toggleTool(tool.id)">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M18 6L6 18M6 6l12 12"
								stroke="currentColor"
								stroke-width="2"
								fill="none"
								stroke-linecap="round"
							/>
						</svg>
					</button>
				</div>

				<div v-if="tool.args" class="agent-tool-detail-section">
					<div class="agent-tool-detail-label">{{ t('aichat.tools.params') }}</div>
					<pre class="agent-tool-detail-code">{{ formatJson(tool.args) }}</pre>
				</div>

				<div v-if="tool.result" class="agent-tool-detail-section">
					<div class="agent-tool-detail-label">{{ t('aichat.tools.result') }}</div>
					<pre class="agent-tool-detail-code agent-tool-detail-code--result">{{
						formatJson(tool.result)
					}}</pre>
				</div>

				<div v-if="tool.error" class="agent-tool-detail-section">
					<div class="agent-tool-detail-label">{{ t('aichat.tools.errorInfo') }}</div>
					<pre class="agent-tool-detail-code agent-tool-detail-code--error">{{ tool.error }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface AgentTool {
	id: string
	name: string
	status: 'pending' | 'running' | 'completed' | 'error'
	args?: Record<string, unknown>
	result?: unknown
	error?: string
	hasDetails?: boolean
}

defineProps<{
	tools: AgentTool[]
}>()

const expandedTools = ref(new Set<string>())

const toggleTool = (id: string) => {
	if (expandedTools.value.has(id)) {
		expandedTools.value.delete(id)
	} else {
		expandedTools.value.add(id)
	}
}

const statusLabel = (status: string) => {
	switch (status) {
		case 'pending':
			return t('aichat.tools.status.pending')
		case 'running':
			return t('aichat.tools.status.running')
		case 'completed':
			return t('aichat.tools.status.completed')
		case 'error':
			return t('aichat.tools.status.failed')
		default:
			return status
	}
}

const formatJson = (data: unknown) => {
	if (!data) return ''
	if (typeof data === 'string') return data
	try {
		return JSON.stringify(data, null, 2)
	} catch {
		return String(data)
	}
}
</script>

<style scoped>
.agent-tools-panel {
	border-radius: 12px;
	background: var(--wf-surface-base);
	border: 1px solid var(--wf-border-subtle);
	backdrop-filter: blur(12px);
	overflow: hidden;
}

.agent-tools-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--wf-border-subtle);
	background: color-mix(in srgb, var(--wf-text) 4%, transparent);
}

.agent-tools-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	color: var(--wf-info);
	flex-shrink: 0;
}

.agent-tools-icon svg {
	width: 16px;
	height: 16px;
}

.agent-tools-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--wf-text);
}

.agent-tools-count {
	font-size: 11px;
	font-weight: 500;
	color: var(--wf-text-muted);
	background: color-mix(in srgb, var(--wf-text-muted) 15%, transparent);
	padding: 2px 6px;
	border-radius: 10px;
}

.agent-tools-list {
	padding: 8px;
}

.agent-tool-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 8px;
	cursor: pointer;
	transition: all 180ms ease;
	background: transparent;
	margin-bottom: 4px;
}

.agent-tool-item:hover {
	background: color-mix(in srgb, var(--wf-info) 8%, transparent);
}

.agent-tool-item.status-pending {
	--tool-color: var(--wf-text-muted);
}

.agent-tool-item.status-running {
	--tool-color: var(--wf-info);
	background: var(--wf-state-running-bg);
}

.agent-tool-item.status-completed {
	--tool-color: var(--wf-success);
	background: var(--wf-success-soft);
}

.agent-tool-item.status-error {
	--tool-color: var(--wf-danger);
	background: var(--wf-danger-soft);
}

.agent-tool-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	color: var(--tool-color);
	flex-shrink: 0;
}

.agent-tool-icon svg {
	width: 16px;
	height: 16px;
}

.agent-tool-spinner {
	animation: tool-spin 1s linear infinite;
}

@keyframes tool-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.agent-tool-info {
	flex: 1;
	min-width: 0;
}

.agent-tool-name {
	font-size: 13px;
	font-weight: 500;
	color: var(--wf-text);
	text-transform: capitalize;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.agent-tool-status {
	font-size: 11px;
	color: var(--tool-color);
	margin-top: 2px;
}

.agent-tool-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border: none;
	background: transparent;
	color: var(--wf-text-muted);
	cursor: pointer;
	border-radius: 4px;
	transition: all 150ms ease;
	flex-shrink: 0;
}

.agent-tool-toggle:hover {
	background: color-mix(in srgb, var(--wf-text-muted) 15%, transparent);
	color: var(--wf-text);
}

.agent-tool-toggle svg {
	width: 14px;
	height: 14px;
	transition: transform 200ms ease;
}

.agent-tool-toggle svg.expanded {
	transform: rotate(180deg);
}

.agent-tools-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 24px;
	color: var(--wf-text-muted);
}

.agent-tools-empty svg {
	width: 24px;
	height: 24px;
	opacity: 0.5;
}

.agent-tools-empty span {
	font-size: 12px;
}

.agent-tools-details {
	padding: 0 8px 8px;
	border-top: 1px solid var(--wf-border-subtle);
}

.agent-tool-detail {
	margin-top: 8px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--wf-text) 4%, transparent);
	border: 1px solid var(--wf-border-subtle);
	overflow: hidden;
}

.agent-tool-detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--wf-info) 6%, transparent);
	border-bottom: 1px solid var(--wf-border-subtle);
}

.agent-tool-detail-title {
	font-size: 12px;
	font-weight: 500;
	color: var(--wf-info);
	text-transform: capitalize;
}

.agent-tool-detail-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border: none;
	background: transparent;
	color: var(--wf-text-muted);
	cursor: pointer;
	border-radius: 4px;
	transition: all 150ms ease;
}

.agent-tool-detail-close:hover {
	background: color-mix(in srgb, var(--wf-text-muted) 15%, transparent);
	color: var(--wf-text);
}

.agent-tool-detail-close svg {
	width: 12px;
	height: 12px;
}

.agent-tool-detail-section {
	padding: 10px 12px;
}

.agent-tool-detail-label {
	font-size: 11px;
	font-weight: 500;
	color: var(--wf-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 6px;
}

.agent-tool-detail-code {
	margin: 0;
	padding: 8px 10px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--wf-text) 6%, transparent);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 11px;
	line-height: 1.5;
	color: var(--wf-text);
	white-space: pre-wrap;
	word-break: break-all;
	max-height: 200px;
	overflow-y: auto;
}

.agent-tool-detail-code--result {
	color: var(--wf-text);
}

.agent-tool-detail-code--error {
	color: var(--wf-danger);
}
</style>
