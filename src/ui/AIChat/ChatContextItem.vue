<template>
	<div
		class="chat-context-chip"
		:class="[`is-${item.type}`, `is-${(item as any).kind || (item as any).thumbKind || ''}`]"
	>
		<template v-if="item.type === 'image'">
			<img
				v-if="item.dataUrl || item.url"
				class="chat-context-chip-thumb"
				:src="item.dataUrl || item.url"
				:alt="item.name"
			/>
			<span v-else class="chat-context-chip-icon">🖼️</span>
			<span class="chat-context-chip-label">{{ item.name }}</span>
		</template>

		<template v-else-if="item.type === 'file'">
			<span class="chat-context-chip-icon">{{ getFileIcon(item.name, item.mimeType) }}</span>
			<span class="chat-context-chip-label">{{ item.name }}</span>
			<span
				v-if="item.truncated"
				class="chat-context-chip-badge"
				:title="t('aichat.dock.contentTruncated')"
			>
				…
			</span>
		</template>

		<template v-else-if="item.type === 'skill'">
			<span class="chat-context-chip-icon">{{ item.icon || '⚡' }}</span>
			<span class="chat-context-chip-label">{{ item.name }}</span>
		</template>

		<template v-else-if="item.type === 'node'">
			<img
				v-if="(item.thumbKind === 'image' || item.thumbKind === 'video') && item.previewUrl"
				class="chat-context-chip-thumb"
				:src="item.previewUrl"
				:alt="item.label"
			/>
			<span v-else class="chat-context-chip-icon">{{ getNodeKindIcon(item.thumbKind) }}</span>
			<span class="chat-context-chip-label">{{ item.label }}</span>
		</template>

		<template v-else-if="item.type === 'nodeOutput'">
			<img
				v-if="(item.kind === 'image' || item.kind === 'video') && item.previewUrl"
				class="chat-context-chip-thumb"
				:src="item.previewUrl"
				:alt="item.label"
			/>
			<span v-else class="chat-context-chip-icon">{{ getKindIcon(item.kind) }}</span>
			<span class="chat-context-chip-label">{{ item.label }}</span>
			<span class="chat-context-chip-type">@</span>
		</template>

		<button
			class="chat-context-chip-remove"
			@click="emit('remove', item.id)"
			:title="t('aichat.dock.remove')"
		>
			×
		</button>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
	item: import('../../types/agentMention').ChatContextItem
}>()

const emit = defineEmits<{
	(e: 'remove', id: string): void
}>()

const getFileIcon = (name: string, mimeType?: string): string => {
	const ext = name.split('.').pop()?.toLowerCase() || ''
	if (mimeType?.startsWith('image/')) return '🖼️'
	if (mimeType?.startsWith('video/')) return '🎬'
	if (mimeType?.startsWith('audio/')) return '🎵'
	if (['json', 'js', 'ts', 'jsx', 'tsx', 'vue', 'css', 'scss', 'less', 'html', 'xml'].includes(ext))
		return '📄'
	if (['md', 'txt'].includes(ext)) return '📝'
	if (['py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sh'].includes(ext)) return '💻'
	if (['yaml', 'yml'].includes(ext)) return '⚙️'
	return '📎'
}

const getKindIcon = (kind: string): string => {
	if (kind === 'image') return '🖼️'
	if (kind === 'video') return '🎬'
	if (kind === 'model3d') return '🧊'
	if (kind === 'blender') return '🎨'
	if (kind === 'audio') return '🎵'
	return '📝'
}

const getNodeKindIcon = (kind?: string): string => {
	if (kind === 'image') return '🖼️'
	if (kind === 'video') return '🎬'
	if (kind === 'model3d') return '🧊'
	if (kind === 'blender') return '🎨'
	if (kind === 'audio') return '🎵'
	if (kind === 'text') return '📄'
	return '📦'
}
</script>

<style scoped>
.chat-context-chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px 2px 4px;
	margin: 2px;
	border-radius: 4px;
	font-size: 12px;
	line-height: 1.4;
	user-select: none;
	cursor: default;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 80%, transparent);
	max-width: 180px;
	transition: all 0.15s ease;
	white-space: nowrap;
}

.chat-context-chip:hover {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-context-chip-thumb {
	width: 20px;
	height: 20px;
	object-fit: cover;
	border-radius: 2px;
	flex-shrink: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-context-chip-icon {
	width: 20px;
	height: 20px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	flex-shrink: 0;
}

.chat-context-chip-label {
	font-size: 12px;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	color: var(--wf-text, #edf2f4);
}

.chat-context-chip-type {
	font-size: 10px;
	opacity: 0.6;
	margin-left: 2px;
}

.chat-context-chip-badge {
	font-size: 10px;
	opacity: 0.7;
}

.chat-context-chip-remove {
	width: 16px;
	height: 16px;
	border-radius: 2px;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	color: var(--wf-text-muted, #aeb8bd);
	background: transparent;
	border: none;
	padding: 0;
	flex-shrink: 0;
	margin-left: 2px;
	transition: all 0.15s ease;
}

.chat-context-chip-remove:hover {
	background: color-mix(in srgb, var(--wf-danger, #cf5a46) 25%, transparent);
	color: var(--wf-danger, #cf5a46);
}

.chat-context-chip.is-image {
	border-color: color-mix(in srgb, #60a5fa 45%, transparent);
}

.chat-context-chip.is-image:hover {
	border-color: #60a5fa;
	box-shadow: 0 0 6px color-mix(in srgb, #60a5fa 30%, transparent);
}

.chat-context-chip.is-image .chat-context-chip-icon,
.chat-context-chip.is-image .chat-context-chip-label {
	color: #60a5fa;
}

.chat-context-chip.is-image .chat-context-chip-thumb {
	border-color: color-mix(in srgb, #60a5fa 30%, transparent);
}

.chat-context-chip.is-skill {
	border-color: color-mix(in srgb, #c084fc 45%, transparent);
}

.chat-context-chip.is-skill:hover {
	border-color: #c084fc;
	box-shadow: 0 0 6px color-mix(in srgb, #c084fc 30%, transparent);
}

.chat-context-chip.is-skill .chat-context-chip-icon,
.chat-context-chip.is-skill .chat-context-chip-label {
	color: #c084fc;
}

.chat-context-chip.is-node {
	border-color: color-mix(in srgb, #f59e0b 45%, transparent);
}

.chat-context-chip.is-node:hover {
	border-color: #f59e0b;
	box-shadow: 0 0 6px color-mix(in srgb, #f59e0b 30%, transparent);
}

.chat-context-chip.is-node .chat-context-chip-icon,
.chat-context-chip.is-node .chat-context-chip-label {
	color: #f59e0b;
}

.chat-context-chip.is-node.is-image {
	border-color: color-mix(in srgb, #60a5fa 45%, transparent);
}
.chat-context-chip.is-node.is-image:hover {
	border-color: #60a5fa;
	box-shadow: 0 0 6px color-mix(in srgb, #60a5fa 30%, transparent);
}
.chat-context-chip.is-node.is-image .chat-context-chip-icon,
.chat-context-chip.is-node.is-image .chat-context-chip-label {
	color: #60a5fa;
}
.chat-context-chip.is-node.is-image .chat-context-chip-thumb {
	border-color: color-mix(in srgb, #60a5fa 30%, transparent);
}

.chat-context-chip.is-node.is-video {
	border-color: color-mix(in srgb, #4ade80 45%, transparent);
}
.chat-context-chip.is-node.is-video:hover {
	border-color: #4ade80;
	box-shadow: 0 0 6px color-mix(in srgb, #4ade80 30%, transparent);
}
.chat-context-chip.is-node.is-video .chat-context-chip-icon,
.chat-context-chip.is-node.is-video .chat-context-chip-label {
	color: #4ade80;
}
.chat-context-chip.is-node.is-video .chat-context-chip-thumb {
	border-color: color-mix(in srgb, #4ade80 30%, transparent);
}

.chat-context-chip.is-node.is-model3d {
	border-color: color-mix(in srgb, #c084fc 45%, transparent);
}
.chat-context-chip.is-node.is-model3d:hover {
	border-color: #c084fc;
	box-shadow: 0 0 6px color-mix(in srgb, #c084fc 30%, transparent);
}
.chat-context-chip.is-node.is-model3d .chat-context-chip-icon,
.chat-context-chip.is-node.is-model3d .chat-context-chip-label {
	color: #c084fc;
}

.chat-context-chip.is-node.is-text .chat-context-chip-icon,
.chat-context-chip.is-node.is-text .chat-context-chip-label {
	color: #f59e0b;
}

.chat-context-chip.is-nodeOutput.is-image {
	border-color: color-mix(in srgb, #60a5fa 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-image:hover {
	border-color: #60a5fa;
	box-shadow: 0 0 6px color-mix(in srgb, #60a5fa 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-image .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-image .chat-context-chip-label {
	color: #60a5fa;
}

.chat-context-chip.is-nodeOutput.is-image .chat-context-chip-thumb {
	border-color: color-mix(in srgb, #60a5fa 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-video {
	border-color: color-mix(in srgb, #4ade80 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-video:hover {
	border-color: #4ade80;
	box-shadow: 0 0 6px color-mix(in srgb, #4ade80 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-video .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-video .chat-context-chip-label {
	color: #4ade80;
}

.chat-context-chip.is-nodeOutput.is-video .chat-context-chip-thumb {
	border-color: color-mix(in srgb, #4ade80 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-model3d {
	border-color: color-mix(in srgb, #c084fc 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-model3d:hover {
	border-color: #c084fc;
	box-shadow: 0 0 6px color-mix(in srgb, #c084fc 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-model3d .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-model3d .chat-context-chip-label {
	color: #c084fc;
}

.chat-context-chip.is-nodeOutput.is-blender {
	border-color: color-mix(in srgb, #f472b6 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-blender:hover {
	border-color: #f472b6;
	box-shadow: 0 0 6px color-mix(in srgb, #f472b6 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-blender .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-blender .chat-context-chip-label {
	color: #f472b6;
}

.chat-context-chip.is-nodeOutput.is-audio {
	border-color: color-mix(in srgb, #a78bfa 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-audio:hover {
	border-color: #a78bfa;
	box-shadow: 0 0 6px color-mix(in srgb, #a78bfa 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-audio .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-audio .chat-context-chip-label {
	color: #a78bfa;
}

.chat-context-chip.is-nodeOutput.is-text {
	border-color: color-mix(in srgb, #f59e0b 45%, transparent);
}

.chat-context-chip.is-nodeOutput.is-text:hover {
	border-color: #f59e0b;
	box-shadow: 0 0 6px color-mix(in srgb, #f59e0b 30%, transparent);
}

.chat-context-chip.is-nodeOutput.is-text .chat-context-chip-icon,
.chat-context-chip.is-nodeOutput.is-text .chat-context-chip-label {
	color: #f59e0b;
}
</style>
