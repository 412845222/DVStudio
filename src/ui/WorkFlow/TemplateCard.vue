<template>
	<button
		class="template-card"
		:class="[
			`template-card--${size}`,
			{ selected, 'is-builtin': template.source === 'builtin', 'is-user': template.source === 'user' }
		]"
		type="button"
		@click="$emit('select', template)"
		@dblclick="$emit('apply', template)"
	>
		<div class="card-glow" aria-hidden="true"></div>
		<div class="card-frame" aria-hidden="true">
			<span class="corner tl"></span>
			<span class="corner tr"></span>
			<span class="corner bl"></span>
			<span class="corner br"></span>
		</div>
		<div class="template-card-thumb">
			<div v-if="template.thumbnail" class="template-card-thumb-img">
				<img :src="template.thumbnail" :alt="template.name" />
			</div>
			<div v-else class="template-card-thumb-placeholder">
				<svg viewBox="0 0 24 24" :width="size === 'list' ? 28 : (size === 'small' ? 32 : 48)" :height="size === 'list' ? 28 : (size === 'small' ? 32 : 48)" aria-hidden="true">
					<path d="M4 5h7v7H4zM13 5h7v7h-7zM4 13h7v6H4zM13 11h7v8h-7z" fill="currentColor" opacity="0.6" />
				</svg>
			</div>
			<span class="template-card-source" :class="`is-${template.source}`">
				{{ template.source === 'builtin' ? t('aiworkflow.templateCenter.sourceBuiltin') : t('aiworkflow.templateCenter.sourceUser') }}
			</span>
		</div>
		<div class="template-card-body">
			<div class="template-card-name" :title="template.name">{{ template.name }}</div>
			<div v-if="size !== 'list'" class="template-card-desc" :title="template.description">{{ template.description }}</div>
			<div class="template-card-meta">
				<span v-if="template.nodeCount" class="template-card-meta-item">
					<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
						<circle cx="4" cy="4" r="2" fill="currentColor" />
						<circle cx="12" cy="4" r="2" fill="currentColor" />
						<circle cx="8" cy="12" r="2" fill="currentColor" />
						<path d="M4 6v2M12 6v2M5.5 9.5l2 1.5M10.5 9.5l-2 1.5" stroke="currentColor" stroke-width="1" fill="none" />
					</svg>
					{{ t('aiworkflow.templateCenter.nodeCount', { count: template.nodeCount }) }}
				</span>
				<span v-if="template.author" class="template-card-meta-item template-card-author">
					{{ template.author }}
				</span>
			</div>
			<div v-if="size !== 'list' && template.tags && template.tags.length" class="template-card-tags">
				<span v-for="tag in template.tags.slice(0, size === 'small' ? 2 : 3)" :key="tag" class="template-card-tag">{{ tag }}</span>
			</div>
		</div>
		<div class="template-card-actions">
			<button
				v-if="template.source === 'user'"
				class="template-card-action template-card-action--danger"
				type="button"
				@click.stop="$emit('delete', template)"
				:title="t('common.delete')"
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path d="M4 5h8l-1 9H5z" fill="none" stroke="currentColor" stroke-width="1.2" />
					<path d="M3 5h10M6 5V3h4v2" stroke="currentColor" stroke-width="1.2" />
				</svg>
			</button>
			<button
				class="template-card-action"
				type="button"
				@click.stop="$emit('preview', template)"
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.2" />
					<circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2" />
				</svg>
				{{ size === 'list' ? '' : t('aiworkflow.templateCenter.preview') }}
			</button>
			<button
				class="template-card-action is-primary"
				type="button"
				@click.stop="$emit('apply', template)"
			>
				{{ t('aiworkflow.templateCenter.apply') }}
			</button>
		</div>
	</button>
</template>

<script setup lang="ts">
import type { TemplateItem } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'

defineProps<{
	template: TemplateItem
	selected?: boolean
	size?: 'large' | 'small' | 'list'
}>()

defineEmits<{
	(e: 'select', template: TemplateItem): void
	(e: 'preview', template: TemplateItem): void
	(e: 'apply', template: TemplateItem): void
	(e: 'delete', template: TemplateItem): void
}>()

const { t } = useI18n()
</script>

<style scoped>
.template-card {
	--tc-accent: var(--theme-accent, #1f9d84);
	--tc-accent-hover: var(--theme-accent-hover, #27b99c);
	position: relative;
	display: flex;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 20%, transparent);
	border-radius: 6px;
	background: rgba(15, 15, 15, 0.7);
	backdrop-filter: blur(10px);
	color: var(--theme-text-primary, #edf2f4);
	cursor: pointer;
	overflow: hidden;
	transition: all 0.25s ease;
	text-align: left;
}

.template-card:hover {
	border-color: color-mix(in srgb, var(--tc-accent) 50%, transparent);
	transform: translateY(-2px);
}

.template-card.selected {
	border-color: var(--tc-accent);
	box-shadow: 0 0 20px color-mix(in srgb, var(--tc-accent) 30%, transparent);
}

.card-glow {
	position: absolute;
	inset: -1px;
	border-radius: 7px;
	background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--tc-accent) 15%, transparent) 0%, transparent 60%);
	opacity: 0;
	transition: opacity 0.3s ease;
	pointer-events: none;
}

.template-card:hover .card-glow {
	opacity: 1;
}

.card-frame {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 1;
}

.corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--tc-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.6;
}

.corner.tl {
	top: 4px;
	left: 4px;
	border-top-width: 2px;
	border-left-width: 2px;
}

.corner.tr {
	top: 4px;
	right: 4px;
	border-top-width: 2px;
	border-right-width: 2px;
}

.corner.bl {
	bottom: 4px;
	left: 4px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}

.corner.br {
	bottom: 4px;
	right: 4px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

.template-card-thumb {
	position: relative;
	background: linear-gradient(135deg, color-mix(in srgb, var(--tc-accent) 10%, transparent) 0%, rgba(15, 15, 15, 0.8) 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	flex-shrink: 0;
}

.template-card-thumb-img {
	width: 100%;
	height: 100%;
}

.template-card-thumb-img img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.template-card-thumb-placeholder {
	color: var(--tc-accent);
	opacity: 0.5;
}

.template-card-source {
	position: absolute;
	top: 6px;
	right: 6px;
	padding: 2px 7px;
	border-radius: 3px;
	font-size: 10px;
	font-weight: 500;
	backdrop-filter: blur(4px);
}

.template-card-source.is-builtin {
	background: color-mix(in srgb, var(--tc-accent) 85%, transparent);
	color: #fff;
}

.template-card-source.is-user {
	background: color-mix(in srgb, var(--tc-accent) 70%, #6495ed);
	color: #fff;
}

.template-card-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.template-card-name {
	font-weight: 600;
	color: var(--theme-text-primary, #edf2f4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.template-card-desc {
	color: var(--theme-text-muted, #aeb8bd);
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.template-card-meta {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: auto;
}

.template-card-meta-item {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--theme-text-muted, #aeb8bd);
}

.template-card-author {
	margin-left: auto;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 80px;
}

.template-card-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.template-card-tag {
	padding: 1px 6px;
	border-radius: 3px;
	background: color-mix(in srgb, var(--tc-accent) 15%, transparent);
	color: var(--tc-accent);
	font-size: 10px;
}

.template-card-actions {
	display: flex;
	gap: 6px;
	flex-shrink: 0;
	align-items: center;
}

.template-card-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 4px;
	background: transparent;
	color: var(--theme-text-muted, #aeb8bd);
	cursor: pointer;
	transition: all 0.2s ease;
	white-space: nowrap;
}

.template-card-action:hover {
	border-color: var(--tc-accent);
	color: var(--theme-text-primary, #edf2f4);
}

.template-card-action.is-primary {
	background: var(--tc-accent);
	border-color: var(--tc-accent);
	color: #fff;
}

.template-card-action.is-primary:hover {
	background: var(--tc-accent-hover);
	border-color: var(--tc-accent-hover);
}

.template-card-action--danger {
	color: var(--aiwf-color-danger, #cf5a46);
	border-color: color-mix(in srgb, var(--aiwf-color-danger, #cf5a46) 30%, transparent);
}

.template-card-action--danger:hover {
	border-color: var(--aiwf-color-danger, #cf5a46);
	background: color-mix(in srgb, var(--aiwf-color-danger, #cf5a46) 15%, transparent);
	color: var(--aiwf-color-danger, #cf5a46);
}

.template-card--large {
	flex-direction: column;
	width: 100%;
}
.template-card--large .template-card-thumb {
	width: 100%;
	aspect-ratio: 16/10;
}
.template-card--large .template-card-body {
	padding: 12px;
	gap: 6px;
}
.template-card--large .template-card-name {
	font-size: 14px;
}
.template-card--large .template-card-desc {
	font-size: 12px;
}
.template-card--large .template-card-meta-item {
	font-size: 11px;
}
.template-card--large .template-card-actions {
	padding: 0 12px 12px;
}
.template-card--large .template-card-action {
	padding: 6px 12px;
	font-size: 12px;
	flex: 1;
}
.template-card--large .template-card-action--danger {
	flex: 0 0 auto;
	padding: 6px 8px;
}

.template-card--small {
	flex-direction: column;
	width: 100%;
}
.template-card--small .template-card-thumb {
	width: 100%;
	aspect-ratio: 16/10;
}
.template-card--small .template-card-body {
	padding: 8px 10px;
	gap: 4px;
}
.template-card--small .template-card-name {
	font-size: 13px;
}
.template-card--small .template-card-desc {
	font-size: 11px;
	-webkit-line-clamp: 1;
}
.template-card--small .template-card-meta-item {
	font-size: 10px;
}
.template-card--small .template-card-tag {
	font-size: 9px;
	padding: 0 4px;
}
.template-card--small .template-card-actions {
	padding: 0 10px 10px;
}
.template-card--small .template-card-action {
	padding: 5px 8px;
	font-size: 11px;
	flex: 1;
}
.template-card--small .template-card-action--danger {
	flex: 0 0 auto;
	padding: 5px 6px;
}

.template-card--list {
	flex-direction: row;
	width: 100%;
	padding: 8px;
	gap: 12px;
	align-items: center;
}
.template-card--list .template-card-thumb {
	width: 80px;
	height: 60px;
	border-radius: 4px;
}
.template-card--list .template-card-source {
	font-size: 9px;
	padding: 1px 5px;
}
.template-card--list .template-card-body {
	padding: 0;
	gap: 4px;
	flex: 1;
	min-width: 0;
}
.template-card--list .template-card-name {
	font-size: 13px;
}
.template-card--list .template-card-meta-item {
	font-size: 11px;
}
.template-card--list .template-card-actions {
	padding: 0;
	flex-shrink: 0;
}
.template-card--list .template-card-action {
	padding: 6px 10px;
	font-size: 12px;
}
.template-card--list .template-card-action--danger {
	padding: 6px 8px;
}
</style>
