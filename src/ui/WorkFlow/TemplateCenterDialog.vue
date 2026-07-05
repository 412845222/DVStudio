<template>
	<Transition name="aiwf-rail-dialog">
		<div
			v-if="open"
			class="template-center-mask"
			data-bp-ui-overlay="true"
			@pointerdown.stop
			@mousedown.stop
			@contextmenu.prevent.stop
			@click.self="$emit('update:open', false)"
		>
			<div
				class="template-center-dialog"
				data-bp-ui-overlay="true"
				@pointerdown.stop
				@mousedown.stop
				@click.stop
				@contextmenu.prevent.stop
			>
				<span class="rail-bracket rail-bracket-tl" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-tr" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-bl" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-br" aria-hidden="true"></span>

				<div class="template-center-header">
					<div class="template-center-title">{{ t('aiworkflow.templateCenter.title') }}</div>
					<div class="template-center-header-actions">
						<button class="template-new-btn" type="button" @click="$emit('save-template', { scope: 'full' })">
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
								<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
							{{ t('aiworkflow.templateCenter.newTemplate') }}
						</button>
						<button class="template-center-close" type="button" @click="$emit('update:open', false)">
							<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
								<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
					</div>
				</div>

				<div class="template-center-toolbar">
					<div class="template-search-wrap">
						<svg class="template-search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
							<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
						</svg>
						<input
							v-model="searchKeyword"
							class="template-search-input"
							type="text"
							:placeholder="t('aiworkflow.templateCenter.searchPlaceholder')"
						/>
					</div>

					<div class="template-filters">
						<select v-model="selectedSource" class="template-filter-select">
							<option value="all">{{ t('aiworkflow.templateCenter.allSources') }}</option>
							<option value="builtin">{{ t('aiworkflow.templateCenter.sourceBuiltin') }}</option>
							<option value="user">{{ t('aiworkflow.templateCenter.sourceUser') }}</option>
						</select>

						<select v-model="selectedCategory" class="template-filter-select">
							<option value="all">{{ t('aiworkflow.templateCenter.allCategories') }}</option>
							<option value="basic">{{ t('aiworkflow.templateCategory.basic') }}</option>
							<option value="video-generation">{{ t('aiworkflow.templateCategory.video-generation') }}</option>
							<option value="image-to-video">{{ t('aiworkflow.templateCategory.image-to-video') }}</option>
							<option value="text-to-image">{{ t('aiworkflow.templateCategory.text-to-image') }}</option>
							<option value="model3d">{{ t('aiworkflow.templateCategory.model3d') }}</option>
							<option value="comfyui">{{ t('aiworkflow.templateCategory.comfyui') }}</option>
							<option value="other">{{ t('aiworkflow.templateCategory.other') }}</option>
						</select>

						<select v-model="sortBy" class="template-filter-select">
							<option value="newest">{{ t('aiworkflow.templateCenter.sortByNewest') }}</option>
							<option value="name">{{ t('aiworkflow.templateCenter.sortByName') }}</option>
						</select>
					</div>

					<div class="template-view-switch">
						<button
							class="template-view-btn"
							:class="{ active: viewMode === 'grid-large' }"
							type="button"
							@click="setViewMode('grid-large')"
							:title="t('aiworkflow.templateCenter.viewLarge')"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
								<rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
								<rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
								<rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
							</svg>
						</button>
						<button
							class="template-view-btn"
							:class="{ active: viewMode === 'grid-small' }"
							type="button"
							@click="setViewMode('grid-small')"
							:title="t('aiworkflow.templateCenter.viewSmall')"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="6" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="11" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="1" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="11" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="1" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="6" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
								<rect x="11" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
							</svg>
						</button>
						<button
							class="template-view-btn"
							:class="{ active: viewMode === 'list' }"
							type="button"
							@click="setViewMode('list')"
							:title="t('aiworkflow.templateCenter.viewList')"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<rect x="2" y="3" width="3" height="3" rx="0.5" fill="currentColor" />
								<rect x="7" y="3.5" width="7" height="2" rx="0.5" fill="currentColor" />
								<rect x="2" y="7" width="3" height="3" rx="0.5" fill="currentColor" />
								<rect x="7" y="7.5" width="7" height="2" rx="0.5" fill="currentColor" />
								<rect x="2" y="11" width="3" height="3" rx="0.5" fill="currentColor" />
								<rect x="7" y="11.5" width="7" height="2" rx="0.5" fill="currentColor" />
							</svg>
						</button>
					</div>
				</div>

				<div class="template-center-content">
					<div v-if="loading" class="template-center-loading">
						<div class="template-loading-spinner"></div>
					</div>

					<div v-else-if="filteredTemplates.length === 0" class="template-center-empty">
						<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
							<rect x="8" y="8" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
							<rect x="26" y="8" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
							<rect x="8" y="26" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
							<rect x="26" y="26" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
						</svg>
						<p>{{ t('aiworkflow.templateCenter.noTemplates') }}</p>
					</div>

					<div v-else class="template-grid" :class="`template-grid--${viewMode}`">
						<TemplateCard
							v-for="template in filteredTemplates"
							:key="template.id"
							:template="template"
							:selected="selectedTemplate?.id === template.id"
							:size="cardSize"
							@select="selectTemplate"
							@preview="handlePreview"
							@apply="handleApply"
							@delete="handleDelete"
						/>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import TemplateCard from './TemplateCard.vue'
import { useTemplateCenter } from '../../aiworkflow/template/useTemplateCenter'
import type { TemplateItem, SaveTemplateOptions } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'

const props = defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void
	(e: 'apply-template', template: TemplateItem): void
	(e: 'preview-template', template: TemplateItem): void
	(e: 'delete-template', template: TemplateItem): void
	(e: 'save-template', options: Pick<SaveTemplateOptions, 'scope'>): void
}>()

const { t } = useI18n()

const {
	loading,
	searchKeyword,
	selectedCategory,
	selectedSource,
	sortBy,
	viewMode,
	selectedTemplate,
	filteredTemplates,
	loadTemplates,
	selectTemplate,
	setViewMode,
} = useTemplateCenter()

const cardSize = computed(() => {
	if (viewMode.value === 'grid-large') return 'large'
	if (viewMode.value === 'grid-small') return 'small'
	return 'list'
})

watch(
	() => props.open,
	(val) => {
		if (val) {
			loadTemplates()
			selectTemplate(null)
		}
	}
)

function handlePreview(template: TemplateItem) {
	emit('preview-template', template)
}

function handleApply(template: TemplateItem) {
	emit('apply-template', template)
}

function handleDelete(template: TemplateItem) {
	emit('delete-template', template)
}
</script>

<style scoped>
.template-center-mask {
	position: fixed;
	inset: 0;
	z-index: 2000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(4px);
}

.template-center-dialog {
	--tc-accent: var(--theme-accent, #1f9d84);
	--tc-accent-hover: var(--theme-accent-hover, #27b99c);
	position: relative;
	width: 90vw;
	max-width: 1100px;
	height: 80vh;
	max-height: 750px;
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 12px;
	background: rgba(15, 15, 15, 0.95);
	backdrop-filter: blur(20px);
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px color-mix(in srgb, var(--tc-accent) 10%, transparent);
	overflow: hidden;
}

.rail-bracket {
	position: absolute;
	width: 20px;
	height: 20px;
	border-color: var(--tc-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.7;
	pointer-events: none;
	z-index: 10;
}

.rail-bracket.tl {
	top: 8px;
	left: 8px;
	border-top-width: 2px;
	border-left-width: 2px;
}

.rail-bracket.tr {
	top: 8px;
	right: 8px;
	border-top-width: 2px;
	border-right-width: 2px;
}

.rail-bracket.bl {
	bottom: 8px;
	left: 8px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}

.rail-bracket.br {
	bottom: 8px;
	right: 8px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

.template-center-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 15%, transparent);
}

.template-center-title {
	font-size: 18px;
	font-weight: 600;
	color: var(--theme-text-primary, #edf2f4);
}

.template-center-header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.template-new-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 7px 14px;
	border: 1px solid var(--tc-accent);
	border-radius: 6px;
	background: var(--tc-accent);
	color: #fff;
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
}

.template-new-btn:hover {
	background: var(--tc-accent-hover);
	border-color: var(--tc-accent-hover);
}

.template-center-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--theme-text-muted, #aeb8bd);
	cursor: pointer;
	transition: all 0.2s ease;
}

.template-center-close:hover {
	background: rgba(255, 255, 255, 0.1);
	color: var(--theme-text-primary, #edf2f4);
}

.template-center-toolbar {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 10%, transparent);
	flex-wrap: wrap;
}

.template-search-wrap {
	position: relative;
	flex: 1;
	min-width: 200px;
}

.template-search-icon {
	position: absolute;
	left: 10px;
	top: 50%;
	transform: translateY(-50%);
	color: var(--theme-text-muted, #aeb8bd);
	pointer-events: none;
}

.template-search-input {
	width: 100%;
	padding: 8px 12px 8px 34px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 25%, transparent);
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--theme-text-primary, #edf2f4);
	font-size: 13px;
	outline: none;
	transition: border-color 0.2s ease;
	box-sizing: border-box;
}

.template-search-input:focus {
	border-color: var(--tc-accent);
}

.template-search-input::placeholder {
	color: rgba(174, 184, 189, 0.5);
}

.template-filters {
	display: flex;
	gap: 8px;
}

.template-filter-select {
	padding: 8px 28px 8px 12px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 25%, transparent);
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--theme-text-primary, #edf2f4);
	font-size: 12px;
	outline: none;
	cursor: pointer;
	transition: border-color 0.2s ease;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%23aeb8bd' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 8px center;
}

.template-filter-select:focus {
	border-color: var(--tc-accent);
}

.template-filter-select option {
	background: #1a1a1a;
	color: var(--theme-text-primary, #edf2f4);
}

.template-view-switch {
	display: flex;
	gap: 2px;
	padding: 3px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 25%, transparent);
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.2);
}

.template-view-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border: none;
	border-radius: 4px;
	background: transparent;
	color: var(--theme-text-muted, #aeb8bd);
	cursor: pointer;
	transition: all 0.2s ease;
}

.template-view-btn:hover {
	color: var(--theme-text-primary, #edf2f4);
	background: rgba(255, 255, 255, 0.05);
}

.template-view-btn.active {
	background: var(--tc-accent);
	color: #fff;
}

.template-center-content {
	flex: 1;
	overflow-y: auto;
	padding: 20px 24px;
}

.template-center-loading,
.template-center-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	color: var(--theme-text-muted, #aeb8bd);
	gap: 16px;
}

.template-loading-spinner {
	width: 40px;
	height: 40px;
	border: 2px solid color-mix(in srgb, var(--tc-accent) 20%, transparent);
	border-top-color: var(--tc-accent);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.template-center-empty p {
	font-size: 14px;
	margin: 0;
}

.template-grid {
	display: grid;
	gap: 16px;
}

.template-grid--grid-large {
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.template-grid--grid-small {
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 12px;
}

.template-grid--list {
	grid-template-columns: 1fr;
	gap: 8px;
}
</style>
