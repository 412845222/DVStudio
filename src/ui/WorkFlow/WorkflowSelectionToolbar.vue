<template>
	<div v-if="visible" class="wf-toolbar">
		<button class="wf-toolbar-btn" type="button" @click="emit('copy')">
			<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-toolbar-icon">
				<rect
					x="5"
					y="5"
					width="9"
					height="9"
					rx="1"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
				/>
				<rect
					x="2"
					y="2"
					width="9"
					height="9"
					rx="1"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
				/>
			</svg>
			{{ t('aiworkflow.selectionToolbar.copy') }}
		</button>
		<button class="wf-toolbar-btn" type="button" @click="emit('paste')">
			<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-toolbar-icon">
				<path
					d="M4 2h8a1 1 0 0 1 1 1v11l-2-2H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
				/>
				<path
					d="M10 5h3v6h-3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M5 9l3 3 3-3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{{ t('aiworkflow.selectionToolbar.paste') }}
		</button>
		<button class="wf-toolbar-btn wf-toolbar-btn--danger" type="button" @click="emit('delete')">
			<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-toolbar-icon">
				<path d="M4 5h8l-1 9H5z" fill="none" stroke="currentColor" stroke-width="1.2" />
				<path d="M3 5h10" stroke="currentColor" stroke-width="1.2" />
				<path d="M6 5V3h4v2" fill="none" stroke="currentColor" stroke-width="1.2" />
			</svg>
			{{ t('aiworkflow.selectionToolbar.delete') }}
		</button>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
	(e: 'copy'): void
	(e: 'paste'): void
	(e: 'delete'): void
}>()
</script>

<style scoped>
.wf-toolbar {
	position: absolute;
	top: 16px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 6px;
	padding: 5px 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	background: color-mix(in srgb, rgba(21, 24, 28, 0.9) 96%, transparent);
	backdrop-filter: blur(14px) saturate(140%);
	-webkit-backdrop-filter: blur(14px) saturate(140%);
	border-radius: 2px;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent),
		0 0 14px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 8px 20px rgba(0, 0, 0, 0.38);
	z-index: 200;
	animation: wf-selection-toolbar-in 160ms ease-out both;
}

/* L-bracket corners */
.wf-toolbar::before,
.wf-toolbar::after {
	content: '';
	position: absolute;
	pointer-events: none;
	width: 10px;
	height: 10px;
	border: 2px solid var(--wf-primary, #1f9d84);
	box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.wf-toolbar::before {
	top: -2px;
	left: -2px;
	border-right: none;
	border-bottom: none;
}

.wf-toolbar::after {
	bottom: -2px;
	right: -2px;
	border-left: none;
	border-top: none;
}

.wf-toolbar-btn {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 38%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
	color: var(--wf-text, #edf2f4);
	padding: 5px 10px;
	cursor: pointer;
	border-radius: 2px;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-size: 12px;
	transition:
		border-color 180ms ease,
		background 180ms ease,
		color 180ms ease,
		box-shadow 180ms ease;
}

.wf-toolbar-btn:hover {
	border-color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.wf-toolbar-btn--danger:hover {
	border-color: #cf5a46;
	background: color-mix(in srgb, #cf5a46 18%, transparent);
	color: #cf5a46;
	box-shadow: 0 0 10px color-mix(in srgb, #cf5a46 35%, transparent);
}

.wf-toolbar-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

@keyframes wf-selection-toolbar-in {
	from {
		opacity: 0;
		transform: translateX(-50%) translateY(6px);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}
}
</style>
