<template>
	<div class="node-location-card">
		<div class="node-location-card__icon">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
					fill="currentColor"
				/>
			</svg>
		</div>
		<div class="node-location-card__info">
			<div class="node-location-card__title">{{ nodeTitle }}</div>
			<div class="node-location-card__type">{{ nodeType }}</div>
		</div>
		<button class="node-location-card__action" type="button" @click="$emit('locate')">
			<span class="node-location-card__action-text">{{ t('aichat.nodeLocation.locate') }}</span>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M9.29 6.71a.996.996 0 000 1.41L13.17 12l-3.88 3.88a.996.996 0 101.41 1.41l4.59-4.59a.996.996 0 000-1.41L10.7 6.7c-.38-.38-1.02-.38-1.41.01z"
					fill="currentColor"
				/>
			</svg>
		</button>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface Props {
	nodeId: string
	nodeTitle: string
	nodeType: string
}

defineProps<Props>()

defineEmits<{
	locate: []
}>()
</script>

<style scoped>
.node-location-card {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border-radius: 4px;
	background: var(--wf-info-soft);
	border: 1px solid color-mix(in srgb, var(--wf-info) 30%, transparent);
	margin-top: 6px;
}

.node-location-card__icon {
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--wf-info);
	flex-shrink: 0;
}

.node-location-card__icon svg {
	width: 16px;
	height: 16px;
}

.node-location-card__info {
	flex: 1;
	min-width: 0;
}

.node-location-card__title {
	font-size: 12px;
	font-weight: 500;
	color: var(--wf-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.node-location-card__type {
	font-size: 10px;
	color: var(--wf-text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.node-location-card__action {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	border-radius: 3px;
	background: color-mix(in srgb, var(--wf-info) 18%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-info) 35%, transparent);
	color: var(--wf-info);
	font-size: 11px;
	cursor: pointer;
	transition: background-color 150ms ease;
	flex-shrink: 0;
}

.node-location-card__action:hover {
	background: color-mix(in srgb, var(--wf-info) 28%, transparent);
}

.node-location-card__action-text {
	white-space: nowrap;
}

.node-location-card__action svg {
	width: 12px;
	height: 12px;
}
</style>
