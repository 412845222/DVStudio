<template>
	<div class="tool-call-card" :class="[`status-${status}`]">
		<button
			class="tool-call-card__header"
			type="button"
			@click="toggleExpanded"
		>
			<span class="tool-call-card__status-icon">
				<svg v-if="status === 'pending'" class="tool-call-card__spinner" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30 70" stroke-linecap="round" />
				</svg>
				<svg v-else-if="status === 'running'" class="tool-call-card__spinner" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30 70" stroke-linecap="round" />
				</svg>
				<svg v-else-if="status === 'completed'" class="tool-call-card__icon-check" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<svg v-else-if="status === 'error'" class="tool-call-card__icon-error" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 8v5M12 16.5v.5M5 19h14M6 19l1-11a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3l1 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<span v-else class="tool-call-card__icon-dot" />
			</span>
			<span class="tool-call-card__name">{{ displayToolName }}</span>
			<span v-if="executionDescription" class="tool-call-card__description">{{ executionDescription }}</span>
			<span class="tool-call-card__status-text">{{ statusLabel }}</span>
			<span class="tool-call-card__toggle">
				<svg viewBox="0 0 24 24" aria-hidden="true" :class="{ 'expanded': expanded }">
					<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</span>
		</button>
		<Transition name="tool-call-body">
			<div v-show="expanded" class="tool-call-card__body">
				<div v-if="hasArgs" class="tool-call-card__section">
					<div class="tool-call-card__section-title">{{ t('aichat.tools.params') }}</div>
					<pre class="tool-call-card__code">{{ formattedArgs }}</pre>
				</div>
				<div v-if="status === 'completed' && result !== undefined" class="tool-call-card__section">
					<div class="tool-call-card__section-title">{{ t('aichat.tools.result') }}</div>
					<pre class="tool-call-card__code tool-call-card__code--result">{{ formattedResult }}</pre>
				</div>
				<div v-if="status === 'error' && error" class="tool-call-card__section">
					<div class="tool-call-card__section-title">{{ t('aichat.tools.errorInfo') }}</div>
					<pre class="tool-call-card__code tool-call-card__code--error">{{ error }}</pre>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error'

interface Props {
	toolName: string
	status: ToolCallStatus
	args?: Record<string, unknown>
	result?: unknown
	error?: string
	defaultExpanded?: boolean
	autoCollapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	defaultExpanded: false,
	autoCollapsed: false,
})

const expanded = ref(props.defaultExpanded && !props.autoCollapsed)

watch(
	() => props.autoCollapsed,
	(newVal) => {
		if (newVal) {
			setTimeout(() => {
				expanded.value = false
			}, 300)
		}
	}
)

const toggleExpanded = () => {
	expanded.value = !expanded.value
}

const displayToolName = computed(() => {
	const name = props.toolName || 'unknown'
	return name.replace(/_/g, ' ')
})

const statusLabel = computed(() => {
	switch (props.status) {
		case 'pending': return t('aichat.tools.status.pending')
		case 'running': return t('aichat.tools.status.running')
		case 'completed': return t('aichat.tools.status.completed')
		case 'error': return t('aichat.tools.status.failed')
		default: return props.status
	}
})

const executionDescription = computed(() => {
	if (props.status !== 'completed') return ''
	
	const toolDescMap: Record<string, (args: Record<string, unknown>) => string> = {
		create_node: (args) => {
			const type = String(args.type || '')
			const title = String(args.title || '')
			return title ? t('aichat.tools.action.createNode', { title }) : t('aichat.tools.action.createNodeByType', { type: type.replace(/_/g, ' ') })
		},
		update_node_config: (args) => {
			const nodeId = String(args.nodeId || '')
			return t('aichat.tools.action.updateNode', { nodeId: nodeId.slice(-8) })
		},
		delete_node: (args) => {
			const nodeId = String(args.nodeId || '')
			return t('aichat.tools.action.deleteNode', { nodeId: nodeId.slice(-8) })
		},
		connect_nodes: (args) => {
			const from = String(args.fromNodeId || '')
			const to = String(args.toNodeId || '')
			return t('aichat.tools.action.connectNodes', { from: from.slice(-8), to: to.slice(-8) })
		},
		set_node_text: () => t('aichat.tools.action.setNodeText'),
		list_node_types: () => t('aichat.tools.action.listNodeTypes'),
		get_blueprint_state: () => t('aichat.tools.action.getBlueprintState'),
		get_project_info: () => t('aichat.tools.action.getProjectInfo'),
	}
	
	const descFn = toolDescMap[props.toolName]
	if (descFn && props.args) {
		return descFn(props.args)
	}
	
	return ''
})

const hasArgs = computed(() => {
	if (!props.args) return false
	return Object.keys(props.args).length > 0
})

const formattedArgs = computed(() => {
	if (!props.args) return ''
	try {
		return JSON.stringify(props.args, null, 2)
	} catch {
		return String(props.args)
	}
})

const formattedResult = computed(() => {
	if (props.result === undefined || props.result === null) return ''
	if (typeof props.result === 'string') return props.result
	try {
		return JSON.stringify(props.result, null, 2)
	} catch {
		return String(props.result)
	}
})
</script>

<style scoped>
.tool-call-card {
	border: 1px solid var(--tool-border, var(--wf-border-subtle));
	border-radius: 3px;
	background: var(--tool-bg, var(--wf-chat-message-assistant-bg));
	overflow: hidden;
	transition: border-color 200ms ease;
	margin-bottom: 4px;
}

.tool-call-card.status-pending {
	--tool-border: var(--wf-border);
	--tool-bg: var(--wf-surface-muted);
	--tool-accent: var(--wf-text-muted);
}

.tool-call-card.status-running {
	--tool-border: var(--wf-state-running-border);
	--tool-bg: var(--wf-state-running-bg);
	--tool-accent: var(--wf-info);
}

.tool-call-card.status-completed {
	--tool-border: var(--wf-success-soft);
	--tool-bg: var(--wf-success-soft);
	--tool-accent: var(--wf-success);
}

.tool-call-card.status-error {
	--tool-border: var(--wf-state-error-border);
	--tool-bg: var(--wf-state-error-bg);
	--tool-accent: var(--wf-danger);
}

.tool-call-card__header {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	border: none;
	background: transparent;
	color: var(--tool-accent);
	font-size: 11px;
	cursor: pointer;
	text-align: left;
	transition: background-color 150ms ease;
}

.tool-call-card__header:hover {
	background: color-mix(in srgb, var(--tool-accent) 5%, transparent);
}

.tool-call-card__status-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 12px;
	height: 12px;
	flex-shrink: 0;
}

.tool-call-card__spinner {
	width: 10px;
	height: 10px;
	animation: tool-spin 1s linear infinite;
}

@keyframes tool-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.tool-call-card__icon-check {
	width: 12px;
	height: 12px;
}

.tool-call-card__icon-error {
	width: 12px;
	height: 12px;
}

.tool-call-card__icon-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--tool-accent);
}

.tool-call-card__name {
	flex: 1;
	font-weight: 500;
	color: var(--wf-text);
	text-transform: capitalize;
	font-size: 11px;
}

.tool-call-card__description {
	font-size: 10px;
	color: var(--wf-text-muted);
	flex-shrink: 0;
	margin-left: 6px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 180px;
}

.tool-call-card__status-text {
	font-size: 10px;
	color: var(--tool-accent);
	opacity: 0.8;
	flex-shrink: 0;
}

.tool-call-card__toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 12px;
	height: 12px;
	color: var(--wf-text-muted);
	opacity: 0.6;
	flex-shrink: 0;
}

.tool-call-card__toggle svg {
	width: 10px;
	height: 10px;
	transition: transform 200ms ease;
}

.tool-call-card__toggle svg.expanded {
	transform: rotate(180deg);
}

.tool-call-card__body {
	padding: 0 8px 8px;
	border-top: 1px solid var(--tool-border);
}

.tool-call-card__section {
	margin-top: 6px;
}

.tool-call-card__section-title {
	font-size: 9px;
	font-weight: 500;
	color: var(--wf-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 3px;
}

.tool-call-card__code {
	margin: 0;
	padding: 4px 6px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-text) 6%, transparent);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 10px;
	line-height: 1.4;
	color: var(--wf-text);
	white-space: pre-wrap;
	word-break: break-all;
	max-height: 100px;
	overflow-y: auto;
}

.tool-call-card__code--result {
	color: var(--wf-text);
}

.tool-call-card__code--error {
	color: var(--wf-danger);
}

.tool-call-body-enter-active,
.tool-call-body-leave-active {
	transition: all 300ms ease;
	overflow: hidden;
}

.tool-call-body-enter-from,
.tool-call-body-leave-to {
	max-height: 0;
	opacity: 0;
	padding-top: 0;
	padding-bottom: 0;
}

.tool-call-body-enter-to,
.tool-call-body-leave-from {
	max-height: 200px;
	opacity: 1;
}
</style>
