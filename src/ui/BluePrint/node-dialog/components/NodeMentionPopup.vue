<template>
	<div v-if="visible && items.length > 0" class="bp-mention-popup" @mousedown.prevent.stop>
		<div class="bp-mention-popup-list">
			<div
				v-for="(item, index) in items"
				:key="item.edgeId || `${item.fromNodeId}:${item.fromAnchorId}:${item.kind}` || index"
				class="bp-mention-item"
				:class="{ 'is-selected': index === selectedIndex }"
				@mouseenter="onMouseEnter(index)"
				@mousedown.prevent.stop
				@click.stop="handleSelect(item)"
			>
				<img
					v-if="item.previewUrl"
					class="bp-mention-thumb"
					:src="item.previewUrl"
					:alt="item.label"
					loading="lazy"
					decoding="async"
				/>
				<span v-else class="bp-mention-icon">{{ getTypeIcon(item.kind) }}</span>
				<div class="bp-mention-content">
					<span class="bp-mention-label">
						{{ item.label }}
					</span>
					<span v-if="getSubline(item)" class="bp-mention-sub">
						{{ getSubline(item) }}
					</span>
				</div>
			</div>
			<div v-if="items.length === 0" class="bp-mention-empty">无匹配节点</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { InputParamPreviewRef } from '../index'

interface Props {
	visible: boolean
	items: InputParamPreviewRef[]
	selectedIndex: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
	select: [item: InputParamPreviewRef]
	'update:selectedIndex': [index: number]
}>()

const getTypeIcon = (kind: string) => {
	if (kind === 'image') return '🖼'
	if (kind === 'video') return '🎬'
	if (kind === 'model3d') return '3D'
	if (kind === 'blender') return '🎨'
	if (kind === 'audio') return '🎵'
	return '📝'
}

const getSubline = (item: InputParamPreviewRef) => {
	if (item.kind === 'text') return item.text ? item.text.slice(0, 20) : ''
	return item.name || item.meta || ''
}

const onMouseEnter = (index: number) => {
	emit('update:selectedIndex', index)
}

const handleSelect = (item: InputParamPreviewRef) => {
	emit('select', item)
}
</script>

<style scoped>
.bp-mention-popup {
	position: absolute;
	bottom: 100%;
	left: 0;
	right: 0;
	margin-bottom: -1px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(29, 34, 39, 0.98)) 98%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	border-radius: 2px 2px 0 0;
	box-shadow:
		0 -4px 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent),
		0 -8px 24px rgba(0, 0, 0, 0.4);
	backdrop-filter: blur(8px);
	max-height: 200px;
	overflow: hidden;
	z-index: 100;
}

.bp-mention-popup-list {
	max-height: 200px;
	overflow-y: auto;
}

.bp-mention-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	cursor: pointer;
	transition: background-color 0.15s ease;
}

.bp-mention-item:hover,
.bp-mention-item.is-selected {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.bp-mention-thumb {
	width: 28px;
	height: 28px;
	object-fit: cover;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 2px;
	flex-shrink: 0;
}

.bp-mention-icon {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	font-weight: 600;
	color: var(--wf-primary, #1f9d84);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
	border-radius: 2px;
	flex-shrink: 0;
}

.bp-mention-content {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.bp-mention-label {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.bp-mention-sub {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 60%, transparent);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.bp-mention-empty {
	padding: 12px;
	text-align: center;
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 50%, transparent);
}
</style>
