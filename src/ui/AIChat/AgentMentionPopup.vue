<template>
	<div
		v-if="visible && items.length > 0"
		class="agent-mention-popup"
		@mousedown.prevent.stop
	>
		<div class="agent-mention-header">{{ t('aichat.mention.title') }}</div>
		<div class="agent-mention-list">
			<div
				v-for="(item, index) in items"
				:key="item.id"
				class="agent-mention-item"
				:class="[`is-${item.kind}`, { 'is-selected': index === selectedIndex }]"
				@mouseenter="emit('update:selectedIndex', index)"
				@mousedown.prevent.stop
				@click.stop="emit('select', item)"
			>
				<img
					v-if="hasPreview(item)"
					class="agent-mention-thumb"
					:src="getPreviewUrl(item)"
					:alt="item.label"
					loading="lazy"
					decoding="async"
				/>
				<span v-else class="agent-mention-icon">{{ getTypeIcon(item.kind) }}</span>
				<div class="agent-mention-content">
					<span class="agent-mention-label">{{ item.label }}</span>
					<span class="agent-mention-sub">{{ getSubline(item) }}</span>
				</div>
				<span class="agent-mention-type" :class="`kind-${item.kind}`">{{ getKindLabel(item.kind) }}</span>
			</div>
			<div v-if="items.length === 0" class="agent-mention-empty">
				{{ t('aichat.mention.noMatch') }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface MentionItem {
	id: string
	kind: string
	label: string
	name?: string
	text?: string
	previewUrl?: string
	dataUrl?: string
	url?: string
	nodeType?: string
	mimeType?: string
	description?: string
}

interface Props {
	visible: boolean
	items: MentionItem[]
	selectedIndex: number
}

defineProps<Props>()

const emit = defineEmits<{
	select: [item: MentionItem]
	'update:selectedIndex': [index: number]
}>()

const hasPreview = (item: MentionItem): boolean => {
	if (item.kind === 'image' && (item.dataUrl || item.url || item.previewUrl)) return true
	if ((item.kind === 'image' || item.kind === 'video') && item.previewUrl) return true
	return false
}

const getPreviewUrl = (item: MentionItem): string => {
	return item.dataUrl || item.previewUrl || item.url || ''
}

const getTypeIcon = (kind: string): string => {
	if (kind === 'image') return '🖼'
	if (kind === 'video') return '🎬'
	if (kind === 'model3d') return '🧊'
	if (kind === 'blender') return '🎨'
	if (kind === 'audio') return '🎵'
	if (kind === 'file') return '📎'
	if (kind === 'skill') return '⚡'
	if (kind === 'node' || kind === 'nodeOutput') return '📦'
	return '📝'
}

const getKindLabel = (kind: string): string => {
	if (kind === 'image') return t('aichat.mention.kindImage')
	if (kind === 'video') return t('aichat.mention.kindVideo')
	if (kind === 'model3d') return t('aichat.mention.kindModel3d')
	if (kind === 'blender') return t('aichat.mention.kindBlender')
	if (kind === 'audio') return t('aichat.mention.kindAudio')
	if (kind === 'file') return t('aichat.mention.kindFile')
	if (kind === 'skill') return t('aichat.mention.kindSkill')
	if (kind === 'node' || kind === 'nodeOutput') return t('aichat.mention.kindNode')
	if (kind === 'text') return t('aichat.mention.kindText')
	return kind
}

const getSubline = (item: MentionItem): string => {
	if (item.description) return item.description
	if (item.kind === 'text' && item.text) {
		return item.text.slice(0, 40) + (item.text.length > 40 ? '...' : '')
	}
	if (item.nodeType) return item.nodeType
	if (item.mimeType) return item.mimeType
	return item.name || ''
}
</script>

<style scoped>
.agent-mention-popup {
	position: absolute;
	bottom: 100%;
	left: 0;
	right: 0;
	margin-bottom: 4px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.98)) 98%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	border-radius: 6px;
	box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4), 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
	backdrop-filter: blur(12px);
	max-height: 260px;
	overflow: hidden;
	z-index: 100;
	display: flex;
	flex-direction: column;
}

.agent-mention-header {
	padding: 6px 10px;
	font-size: 11px;
	font-weight: 600;
	color: var(--wf-primary, #1f9d84);
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.agent-mention-list {
	flex: 1;
	overflow-y: auto;
	max-height: 220px;
}

.agent-mention-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	cursor: pointer;
	transition: background-color 0.15s ease;
}

.agent-mention-item:hover,
.agent-mention-item.is-selected {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.agent-mention-thumb {
	width: 28px;
	height: 28px;
	object-fit: cover;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 2px;
	flex-shrink: 0;
}

.agent-mention-icon {
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

.agent-mention-content {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.agent-mention-label {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.agent-mention-sub {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 60%, transparent);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.agent-mention-type {
	font-size: 10px;
	padding: 1px 4px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
	color: var(--wf-primary, #1f9d84);
	flex-shrink: 0;
}

.agent-mention-empty {
	padding: 12px;
	text-align: center;
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 50%, transparent);
}

.agent-mention-type.kind-image { color: #60a5fa; background: color-mix(in srgb, #60a5fa 15%, transparent); }
.agent-mention-type.kind-video { color: #4ade80; background: color-mix(in srgb, #4ade80 15%, transparent); }
.agent-mention-type.kind-model3d { color: #c084fc; background: color-mix(in srgb, #c084fc 15%, transparent); }
.agent-mention-type.kind-file { color: #fbbf24; background: color-mix(in srgb, #fbbf24 15%, transparent); }
.agent-mention-type.kind-skill { color: #c084fc; background: color-mix(in srgb, #c084fc 15%, transparent); }
.agent-mention-type.kind-text { color: #f59e0b; background: color-mix(in srgb, #f59e0b 15%, transparent); }
.agent-mention-type.kind-node,
.agent-mention-type.kind-nodeOutput { color: #f59e0b; background: color-mix(in srgb, #f59e0b 15%, transparent); }
</style>
