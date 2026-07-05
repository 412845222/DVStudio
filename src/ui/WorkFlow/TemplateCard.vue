<template>
	<div
		class="tcard"
		:class="[`tcard--${size}`, { 'tcard--selected': selected }, { 'tcard--builtin': template.source === 'builtin' }]"
		@click="$emit('select', template)"
	>
		<div v-if="size !== 'list'" class="tcard-cover-wrap">
			<div class="tcard-cover">
				<img v-if="coverUrl" :src="coverUrl" class="tcard-cover-img" alt="" @error="onCoverError" />
				<div v-else class="tcard-cover-placeholder">
					<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
						<rect x="10" y="8" width="28" height="32" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.35" />
						<path d="M10 28l8-8 10 10 10-10" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.35" stroke-linecap="round" />
						<circle cx="19" cy="19" r="3.5" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.35" />
					</svg>
				</div>
				<div v-if="coverLoading" class="tcard-cover-loading">
					<div class="tcard-spinner"></div>
				</div>
			</div>
			<span v-if="template.source === 'builtin'" class="tcard-badge tcard-badge--builtin">
				<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
					<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				{{ t('aiworkflow.templateCenter.builtinTag') }}
			</span>
			<div class="tcard-cover-overlay">
				<button class="tcard-action-btn tcard-action-btn--apply" type="button" @click.stop="$emit('apply', template)">
					<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
						<path d="M4 3l9 5-9 5V3z" fill="currentColor" />
					</svg>
				</button>
				<button class="tcard-action-btn tcard-action-btn--preview" type="button" @click.stop="$emit('preview', template)">
					<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
						<path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" fill="none" stroke="currentColor" stroke-width="1.3" />
						<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3" />
					</svg>
				</button>
				<button
					v-if="template.source !== 'builtin'"
					class="tcard-action-btn tcard-action-btn--delete"
					type="button"
					@click.stop="$emit('delete', template)"
				>
					<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
						<path d="M3 4h10M6 4V3h4v1M5 4l.6 8h4.8L11 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</div>
		</div>

		<div class="tcard-body">
			<template v-if="size === 'list'">
				<div class="tcard-list-cover">
					<img v-if="coverUrl" :src="coverUrl" alt="" @error="onCoverError" />
					<div v-else class="tcard-list-cover-placeholder">
						<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
							<rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35" />
							<path d="M2 11l4-4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35" stroke-linecap="round" />
						</svg>
					</div>
				</div>
				<div class="tcard-list-info">
					<div class="tcard-title-row">
						<div class="tcard-title">{{ template.name }}</div>
						<span v-if="template.source === 'builtin'" class="tcard-badge tcard-badge--builtin tcard-badge--small">
							{{ t('aiworkflow.templateCenter.builtinTag') }}
						</span>
					</div>
					<div v-if="template.description" class="tcard-desc">{{ template.description }}</div>
					<div class="tcard-meta">
						<span class="tcard-meta-item">{{ getCategoryLabel(template.category) }}</span>
						<span class="tcard-meta-dot"></span>
						<span class="tcard-meta-item">{{ t('aiworkflow.templateCenter.nodeCount', { count: template.nodeCount || 0 }) }}</span>
						<span v-if="template.tags && template.tags.length > 0" class="tcard-meta-dot"></span>
						<span v-if="template.tags && template.tags.length > 0" class="tcard-tags-inline">
							<span v-for="tag in template.tags.slice(0, 3)" :key="tag" class="tcard-tag">{{ tag }}</span>
						</span>
					</div>
				</div>
				<div class="tcard-list-actions">
					<button class="tcard-list-btn tcard-list-btn--apply" type="button" @click.stop="$emit('apply', template)">
						<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
							<path d="M4 3l9 5-9 5V3z" fill="currentColor" />
						</svg>
						{{ t('aiworkflow.templateCenter.apply') }}
					</button>
					<button class="tcard-list-btn" type="button" @click.stop="$emit('preview', template)">
						{{ t('aiworkflow.templateCenter.preview') }}
					</button>
					<button
						v-if="template.source !== 'builtin'"
						class="tcard-list-btn tcard-list-btn--danger"
						type="button"
						@click.stop="$emit('delete', template)"
					>
						{{ t('aiworkflow.templateCenter.delete') }}
					</button>
				</div>
			</template>

			<template v-else>
				<div class="tcard-title-row">
					<div class="tcard-title" :title="template.name">{{ template.name }}</div>
				</div>
				<div v-if="template.description" class="tcard-desc" :title="template.description">
					{{ template.description }}
				</div>
				<div class="tcard-meta">
					<span class="tcard-meta-item">{{ getCategoryLabel(template.category) }}</span>
					<span class="tcard-meta-dot"></span>
					<span class="tcard-meta-item">{{ t('aiworkflow.templateCenter.nodeCount', { count: template.nodeCount || 0 }) }}</span>
				</div>
				<div v-if="template.tags && template.tags.length > 0" class="tcard-tags">
					<span v-for="tag in template.tags.slice(0, 3)" :key="tag" class="tcard-tag">{{ tag }}</span>
				</div>
			</template>
		</div>
		<span class="tcard-border-accent" aria-hidden="true"></span>
	</div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useTemplateCenter } from '../../aiworkflow/template/useTemplateCenter'
import type { TemplateItem, TemplateCategory } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'

const props = defineProps<{
	template: TemplateItem
	selected?: boolean
	size: 'large' | 'small' | 'list'
}>()

defineEmits<{
	(e: 'select', template: TemplateItem): void
	(e: 'apply', template: TemplateItem): void
	(e: 'preview', template: TemplateItem): void
	(e: 'delete', template: TemplateItem): void
}>()

const { t } = useI18n()
const { loadTemplateCover, revokeTemplateCover } = useTemplateCenter()

function getCategoryLabel(category: TemplateCategory): string {
	return t(`aiworkflow.templateCategory.${category}`)
}

const coverUrl = ref<string>('')
const coverLoading = ref(false)

async function ensureCover() {
	if (!props.template.id) return
	coverLoading.value = true
	try {
		const url = await loadTemplateCover(props.template)
		coverUrl.value = url || ''
	} finally {
		coverLoading.value = false
	}
}

function onCoverError() {
	coverUrl.value = ''
}

function cleanup() {
	if (coverUrl.value) {
		revokeTemplateCover(props.template.id)
		coverUrl.value = ''
	}
}

onMounted(() => {
	void ensureCover()
})

watch(() => props.template.id, () => {
	cleanup()
	void ensureCover()
})

onUnmounted(() => {
	cleanup()
})
</script>

<style scoped>
.tcard {
	--tcard-accent: var(--theme-accent, #1f9d84);
	--tcard-fg: var(--theme-text-primary, #eaf2f5);
	--tcard-fg-soft: var(--theme-text-secondary, #9aa0a6);
	--tcard-bg: color-mix(in srgb, var(--tcard-fg) 3%, transparent);
	--tcard-border: color-mix(in srgb, var(--tcard-accent) 22%, transparent);
	position: relative;
	display: flex;
	flex-direction: column;
	border: 1px solid var(--tcard-border);
	border-radius: 2px;
	background: var(--tcard-bg);
	cursor: pointer;
	overflow: hidden;
	transition:
		border-color 220ms ease,
		background 220ms ease,
		box-shadow 220ms ease,
		transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tcard::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--tcard-accent) 40%, transparent) 50%,
		transparent 100%
	);
	opacity: 0;
	transition: opacity 220ms ease;
}

.tcard-border-accent {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 0;
	height: 2px;
	background: var(--tcard-accent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--tcard-accent) 50%, transparent);
	transition: width 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tcard:hover {
	border-color: color-mix(in srgb, var(--tcard-accent) 55%, transparent);
	background: color-mix(in srgb, var(--tcard-fg) 5%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--tcard-accent) 12%, transparent),
		0 8px 28px color-mix(in srgb, black 30%, transparent),
		0 0 20px color-mix(in srgb, var(--tcard-accent) 8%, transparent);
	transform: translateY(-2px);
}

.tcard:hover::before {
	opacity: 1;
}

.tcard:hover .tcard-border-accent {
	width: 100%;
}

.tcard--selected {
	border-color: color-mix(in srgb, var(--tcard-accent) 70%, transparent);
	background: color-mix(in srgb, var(--tcard-accent) 6%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--tcard-accent) 25%, transparent),
		0 0 24px color-mix(in srgb, var(--tcard-accent) 14%, transparent);
}

.tcard--selected .tcard-border-accent {
	width: 100%;
}

/* Cover */
.tcard-cover-wrap {
	position: relative;
	aspect-ratio: 16/10;
	overflow: hidden;
	flex-shrink: 0;
}

.tcard-cover {
	width: 100%;
	height: 100%;
	position: relative;
	background: color-mix(in srgb, var(--tcard-accent) 4%, #0a0e14);
}

.tcard-cover-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	transition: transform 300ms ease;
}

.tcard:hover .tcard-cover-img {
	transform: scale(1.04);
}

.tcard-cover-placeholder {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--tcard-fg-soft);
	background:
		linear-gradient(135deg, color-mix(in srgb, var(--tcard-accent) 6%, transparent), color-mix(in srgb, var(--tcard-accent) 2%, transparent));
}

.tcard-cover-loading {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.4);
}

.tcard-spinner {
	width: 22px;
	height: 22px;
	border: 2px solid color-mix(in srgb, var(--tcard-accent) 20%, transparent);
	border-top-color: var(--tcard-accent);
	border-radius: 50%;
	animation: tcard-spin-anim 0.7s linear infinite;
}

@keyframes tcard-spin-anim {
	to { transform: rotate(360deg); }
}

.tcard-badge {
	position: absolute;
	top: 8px;
	left: 8px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 0.03em;
	background: color-mix(in srgb, var(--tcard-accent) 70%, #0a0e14);
	color: #fff;
	border-radius: 2px;
	z-index: 2;
	backdrop-filter: blur(4px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tcard-badge--small {
	position: static;
	font-size: 10px;
	padding: 2px 6px;
}

.tcard-cover-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.6) 100%);
	opacity: 0;
	transition: opacity 220ms ease;
}

.tcard:hover .tcard-cover-overlay {
	opacity: 1;
}

.tcard-action-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.25);
	border-radius: 2px;
	background: rgba(0, 0, 0, 0.35);
	color: #fff;
	cursor: pointer;
	transition: all 200ms ease;
	backdrop-filter: blur(6px);
}

.tcard-action-btn:hover {
	border-color: var(--tcard-accent);
	background: var(--tcard-accent);
	color: #fff;
	box-shadow: 0 0 12px color-mix(in srgb, var(--tcard-accent) 35%, transparent);
}

.tcard-action-btn--delete:hover {
	border-color: #d94b4b;
	background: #d94b4b;
	box-shadow: 0 0 12px rgba(217, 75, 75, 0.35);
}

/* Body */
.tcard-body {
	padding: 10px 12px 12px;
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.tcard-title-row {
	display: flex;
	align-items: center;
	gap: 6px;
}

.tcard-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--tcard-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	letter-spacing: 0.01em;
}

.tcard-desc {
	font-size: 11px;
	color: var(--tcard-fg-soft);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.tcard-meta {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 10px;
	color: var(--tcard-fg-soft);
	margin-top: 2px;
	flex-wrap: wrap;
}

.tcard-meta-dot {
	width: 3px;
	height: 3px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--tcard-accent) 40%, var(--tcard-fg-soft));
	flex-shrink: 0;
}

.tcard-tags {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
	margin-top: 4px;
}

.tcard-tag {
	display: inline-block;
	padding: 1px 6px;
	font-size: 10px;
	color: color-mix(in srgb, var(--tcard-accent) 80%, var(--tcard-fg-soft));
	background: color-mix(in srgb, var(--tcard-accent) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--tcard-accent) 18%, transparent);
	border-radius: 2px;
	line-height: 1.5;
}

/* List mode */
.tcard--list {
	flex-direction: row;
	align-items: center;
	padding: 10px 14px;
	gap: 14px;
}

.tcard--list::before {
	left: 0;
	top: 0;
	bottom: 0;
	right: auto;
	width: 1px;
	height: 100%;
	background: linear-gradient(
		180deg,
		transparent 0%,
		color-mix(in srgb, var(--tcard-accent) 40%, transparent) 50%,
		transparent 100%
	);
}

.tcard--list .tcard-border-accent {
	left: 0;
	top: 0;
	bottom: 0;
	width: 2px;
	height: 0;
	background: var(--tcard-accent);
	transition: height 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tcard--list:hover .tcard-border-accent,
.tcard--list.tcard--selected .tcard-border-accent {
	width: 2px;
	height: 100%;
}

.tcard-list-cover {
	width: 72px;
	height: 48px;
	flex-shrink: 0;
	border-radius: 2px;
	overflow: hidden;
	background: color-mix(in srgb, var(--tcard-accent) 4%, #0a0e14);
}

.tcard-list-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.tcard-list-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--tcard-fg-soft);
	background: linear-gradient(135deg, color-mix(in srgb, var(--tcard-accent) 6%, transparent), color-mix(in srgb, var(--tcard-accent) 2%, transparent));
}

.tcard-list-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.tcard-list-info .tcard-title {
	font-size: 13px;
}

.tcard-list-info .tcard-desc {
	-webkit-line-clamp: 1;
	font-size: 11px;
}

.tcard-list-info .tcard-meta {
	margin-top: 0;
}

.tcard-tags-inline {
	display: inline-flex;
	gap: 4px;
	flex-wrap: wrap;
}

.tcard-list-actions {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}

.tcard-list-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 5px 12px;
	font-size: 11px;
	border: 1px solid color-mix(in srgb, var(--tcard-accent) 25%, transparent);
	border-radius: 2px;
	background: transparent;
	color: var(--tcard-fg-soft);
	cursor: pointer;
	transition: all 200ms ease;
	font-family: inherit;
	white-space: nowrap;
}

.tcard-list-btn:hover {
	border-color: color-mix(in srgb, var(--tcard-accent) 50%, transparent);
	color: var(--tcard-fg);
	background: color-mix(in srgb, var(--tcard-accent) 8%, transparent);
}

.tcard-list-btn--apply {
	background: color-mix(in srgb, var(--tcard-accent) 12%, transparent);
	border-color: color-mix(in srgb, var(--tcard-accent) 50%, transparent);
	color: var(--tcard-accent);
	font-weight: 500;
}

.tcard-list-btn--apply:hover {
	background: var(--tcard-accent);
	border-color: var(--tcard-accent);
	color: #fff;
	box-shadow: 0 0 12px color-mix(in srgb, var(--tcard-accent) 25%, transparent);
}

.tcard-list-btn--danger:hover {
	border-color: #d94b4b;
	background: color-mix(in srgb, #d94b4b 12%, transparent);
	color: #d94b4b;
}

/* Small size */
.tcard--small .tcard-cover-wrap {
	aspect-ratio: 4/3;
}

.tcard--small .tcard-body {
	padding: 8px 10px 10px;
}

.tcard--small .tcard-title {
	font-size: 12px;
}

.tcard--small .tcard-desc {
	display: none;
}

.tcard--small .tcard-meta {
	font-size: 9px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.tcard,
	.tcard::before,
	.tcard-border-accent,
	.tcard-cover-img,
	.tcard-cover-overlay,
	.tcard-action-btn,
	.tcard-list-btn {
		transition: none !important;
	}
	.tcard-spinner { animation: none !important; }
	.tcard:hover { transform: none; }
}
</style>

<style>
/* Light theme — global (unscoped) */
[data-theme='light'] .tcard {
	--tcard-bg: rgba(255, 255, 255, 0.7) !important;
	--tcard-border: rgba(31, 157, 132, 0.2) !important;
	border-color: rgba(31, 157, 132, 0.2) !important;
	background: rgba(255, 255, 255, 0.7) !important;
}
[data-theme='light'] .tcard:hover {
	border-color: rgba(31, 157, 132, 0.45) !important;
	background: rgba(255, 255, 255, 0.9) !important;
	box-shadow:
		0 0 0 1px rgba(31, 157, 132, 0.1),
		0 6px 20px rgba(0, 0, 0, 0.08),
		0 0 14px rgba(31, 157, 132, 0.06) !important;
}
[data-theme='light'] .tcard--selected {
	border-color: rgba(31, 157, 132, 0.55) !important;
	background: rgba(31, 157, 132, 0.06) !important;
	box-shadow: 0 0 0 1px rgba(31, 157, 132, 0.2),
		0 0 18px rgba(31, 157, 132, 0.1) !important;
}
[data-theme='light'] .tcard-cover {
	background: rgba(232, 238, 243, 0.8) !important;
}
[data-theme='light'] .tcard-cover-placeholder,
[data-theme='light'] .tcard-list-cover-placeholder {
	color: #8a9099 !important;
	background: linear-gradient(135deg, rgba(31, 157, 132, 0.04), rgba(31, 157, 132, 0.01)) !important;
}
[data-theme='light'] .tcard-cover-placeholder svg,
[data-theme='light'] .tcard-list-cover-placeholder svg {
	opacity: 0.5;
}
[data-theme='light'] .tcard-cover-loading {
	background: rgba(200, 210, 220, 0.6) !important;
}
[data-theme='light'] .tcard-badge {
	background: #1f9d84 !important;
	color: #fff !important;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12) !important;
}
[data-theme='light'] .tcard-cover-overlay {
	background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.25) 100%) !important;
}
[data-theme='light'] .tcard-action-btn {
	border-color: rgba(255, 255, 255, 0.5) !important;
	background: rgba(30, 40, 50, 0.4) !important;
}
[data-theme='light'] .tcard-action-btn:hover {
	background: #1f9d84 !important;
	border-color: #1f9d84 !important;
}
[data-theme='light'] .tcard-title {
	color: #1a1d21 !important;
}
[data-theme='light'] .tcard-desc,
[data-theme='light'] .tcard-meta {
	color: #4a5058 !important;
}
[data-theme='light'] .tcard-meta-dot {
	background: rgba(31, 157, 132, 0.4) !important;
}
[data-theme='light'] .tcard-tag {
	color: #17806d !important;
	background: rgba(31, 157, 132, 0.08) !important;
	border-color: rgba(31, 157, 132, 0.2) !important;
}
[data-theme='light'] .tcard-list-cover {
	background: rgba(232, 238, 243, 0.8) !important;
}
[data-theme='light'] .tcard-list-btn {
	border-color: rgba(31, 157, 132, 0.25) !important;
	color: #4a5058 !important;
	background: rgba(255, 255, 255, 0.5) !important;
}
[data-theme='light'] .tcard-list-btn:hover {
	border-color: rgba(31, 157, 132, 0.45) !important;
	color: #1a1d21 !important;
	background: rgba(31, 157, 132, 0.07) !important;
}
[data-theme='light'] .tcard-list-btn--apply {
	background: rgba(31, 157, 132, 0.12) !important;
	border-color: rgba(31, 157, 132, 0.45) !important;
	color: #17806d !important;
}
[data-theme='light'] .tcard-list-btn--apply:hover {
	background: #1f9d84 !important;
	border-color: #1f9d84 !important;
	color: #fff !important;
	box-shadow: 0 0 10px rgba(31, 157, 132, 0.2) !important;
}
[data-theme='light'] .tcard-list-btn--danger:hover {
	border-color: #d63030 !important;
	background: rgba(214, 48, 48, 0.08) !important;
	color: #d63030 !important;
}
[data-theme='light'] .tcard-spinner {
	border-color: rgba(31, 157, 132, 0.18) !important;
	border-top-color: #1f9d84 !important;
}
</style>
