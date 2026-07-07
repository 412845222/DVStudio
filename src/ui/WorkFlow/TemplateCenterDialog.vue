<template>
	<Transition name="tc-dialog">
		<div
			v-if="open"
			class="tc-mask"
			data-bp-ui-overlay="true"
			@pointerdown.stop
			@mousedown.stop
			@contextmenu.prevent.stop
			@click.self="$emit('update:open', false)"
		>
			<div class="tc-dialog" data-bp-ui-overlay="true" @pointerdown.stop @mousedown.stop @click.stop @contextmenu.prevent.stop>
				<div class="tc-bg-layer" aria-hidden="true">
					<div class="tc-bg-gradient"></div>
					<div class="tc-bg-grid"></div>
					<div class="tc-bg-glow tc-bg-glow-1"></div>
					<div class="tc-bg-glow tc-bg-glow-2"></div>
				</div>
				<div class="tc-scanline" aria-hidden="true"></div>
				<div class="sq-container tc-particles" aria-hidden="true">
					<span
						v-for="p in particles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					></span>
				</div>
				<span class="tc-corner tc-corner-tl" aria-hidden="true"></span>
				<span class="tc-corner tc-corner-tr" aria-hidden="true"></span>
				<span class="tc-corner tc-corner-bl" aria-hidden="true"></span>
				<span class="tc-corner tc-corner-br" aria-hidden="true"></span>

				<div class="tc-header">
					<div class="tc-title-wrap">
						<div class="tc-title">{{ t('aiworkflow.templateCenter.title') }}</div>
						<div class="tc-title-sub">{{ t('aiworkflow.templateCenter.subtitle') }}</div>
					</div>
					<div class="tc-header-actions">
						<button class="tc-btn tc-btn-primary" type="button" @click="$emit('save-template', { scope: 'full' })">
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
								<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
							{{ t('aiworkflow.templateCenter.newTemplate') }}
						</button>
						<button class="tc-btn tc-btn-icon tc-btn-close" type="button" @click="$emit('update:open', false)">
							<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
								<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
					</div>
				</div>

				<div class="tc-tabs">
					<button
						v-for="tab in tabs"
						:key="tab.id"
						class="tc-tab"
						:class="{ active: activeTab === tab.id }"
						type="button"
						@click="switchTab(tab.id)"
					>
						<svg v-if="tab.icon" :viewBox="tab.icon.viewBox" width="14" height="14" aria-hidden="true">
							<path :d="tab.icon.d" fill="currentColor" />
						</svg>
						<span>{{ tab.label }}</span>
						<span v-if="cloudAvailable && tab.id === 'cloud'" class="tc-tab-badge">
							{{ cloudPlatform?.platformName || 'Cloud' }}
						</span>
					</button>
				</div>

				<div class="tc-toolbar">
					<div class="tc-search-wrap">
						<svg class="tc-search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
							<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
						</svg>
						<input
							v-model="searchKeyword"
							class="tc-search-input"
							type="text"
							:placeholder="t('aiworkflow.templateCenter.searchPlaceholder')"
						/>
						<button
							v-if="cloudAvailable && activeTab === 'cloud'"
							class="tc-refresh-btn"
							type="button"
							:disabled="cloudSyncing"
							@click="handleRefreshCloud"
							:title="t('aiworkflow.templateCenter.refresh')"
						>
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" :class="{ 'tc-refresh-spin': cloudSyncing }">
								<path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
								<path d="M12.5 1v3h-3M3.5 15v-3h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					</div>

					<div class="tc-filters">
						<select v-model="selectedCategory" class="tc-select">
							<option value="all">{{ t('aiworkflow.templateCenter.allCategories') }}</option>
							<option value="basic">{{ t('aiworkflow.templateCategory.basic') }}</option>
							<option value="video-generation">{{ t('aiworkflow.templateCategory.video-generation') }}</option>
							<option value="image-to-video">{{ t('aiworkflow.templateCategory.image-to-video') }}</option>
							<option value="text-to-image">{{ t('aiworkflow.templateCategory.text-to-image') }}</option>
							<option value="model3d">{{ t('aiworkflow.templateCategory.model3d') }}</option>
							<option value="comfyui">{{ t('aiworkflow.templateCategory.comfyui') }}</option>
							<option value="other">{{ t('aiworkflow.templateCategory.other') }}</option>
						</select>

						<select v-model="sortBy" class="tc-select">
							<option value="newest">{{ t('aiworkflow.templateCenter.sortByNewest') }}</option>
							<option value="name">{{ t('aiworkflow.templateCenter.sortByName') }}</option>
						</select>
					</div>

					<div class="tc-view-switch">
						<button
							class="tc-view-btn"
							:class="{ active: viewMode === 'grid-large' }"
							type="button"
							@click="setViewMode('grid-large')"
							:title="t('aiworkflow.templateCenter.viewLarge')"
						>
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
								<rect x="2" y="2" width="5" height="5" fill="currentColor" />
								<rect x="9" y="2" width="5" height="5" fill="currentColor" />
								<rect x="2" y="9" width="5" height="5" fill="currentColor" />
								<rect x="9" y="9" width="5" height="5" fill="currentColor" />
							</svg>
						</button>
						<button
							class="tc-view-btn"
							:class="{ active: viewMode === 'grid-small' }"
							type="button"
							@click="setViewMode('grid-small')"
							:title="t('aiworkflow.templateCenter.viewSmall')"
						>
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
								<rect x="1" y="1" width="4" height="4" fill="currentColor" />
								<rect x="6" y="1" width="4" height="4" fill="currentColor" />
								<rect x="11" y="1" width="4" height="4" fill="currentColor" />
								<rect x="1" y="6" width="4" height="4" fill="currentColor" />
								<rect x="6" y="6" width="4" height="4" fill="currentColor" />
								<rect x="11" y="6" width="4" height="4" fill="currentColor" />
								<rect x="1" y="11" width="4" height="4" fill="currentColor" />
								<rect x="6" y="11" width="4" height="4" fill="currentColor" />
								<rect x="11" y="11" width="4" height="4" fill="currentColor" />
							</svg>
						</button>
						<button
							class="tc-view-btn"
							:class="{ active: viewMode === 'list' }"
							type="button"
							@click="setViewMode('list')"
							:title="t('aiworkflow.templateCenter.viewList')"
						>
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
								<rect x="2" y="3" width="3" height="3" fill="currentColor" />
								<rect x="7" y="3.5" width="7" height="2" fill="currentColor" />
								<rect x="2" y="7" width="3" height="3" fill="currentColor" />
								<rect x="7" y="7.5" width="7" height="2" fill="currentColor" />
								<rect x="2" y="11" width="3" height="3" fill="currentColor" />
								<rect x="7" y="11.5" width="7" height="2" fill="currentColor" />
							</svg>
						</button>
					</div>
				</div>

				<div class="tc-content">
					<div v-if="activeTab === 'workshop'" class="tc-workshop-placeholder">
						<div class="tc-workshop-icon">
							<svg viewBox="0 0 64 64" width="80" height="80" aria-hidden="true">
								<rect x="8" y="8" width="48" height="48" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
								<path d="M24 28v-8a8 8 0 1 1 16 0v8" fill="none" stroke="currentColor" stroke-width="1.5" />
								<rect x="16" y="28" width="32" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
								<circle cx="32" cy="40" r="4" fill="currentColor" opacity="0.5" />
							</svg>
						</div>
						<h3>{{ t('aiworkflow.templateCenter.workshopTitle') }}</h3>
						<p>{{ t('aiworkflow.templateCenter.workshopDesc') }}</p>
						<div v-if="!cloudAvailable" class="tc-workshop-hint">
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<path d="M8 2L2 14h12L8 2zm0 3l4.5 8h-9L8 5zm-0.5 3v3h1V8h-1zm0 4v1h1v-1h-1z" fill="currentColor" />
							</svg>
							<span>{{ t('aiworkflow.templateCenter.steamRequired') }}</span>
						</div>
					</div>

					<template v-else>
						<div v-if="loading" class="tc-loading">
							<div class="tc-spinner"></div>
						</div>

						<div v-else-if="displayTemplates.length === 0" class="tc-empty">
							<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
								<rect x="8" y="8" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
								<rect x="26" y="8" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
								<rect x="8" y="26" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
								<rect x="26" y="26" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
							</svg>
							<p>{{ currentTabEmptyText }}</p>
						</div>

						<div v-else class="tc-grid" :class="`tc-grid--${viewMode}`">
							<TemplateCard
								v-for="template in displayTemplates"
								:key="template.id"
								:template="template"
								:selected="selectedTemplate?.id === template.id"
								:size="cardSize"
								:uploading="uploadingTemplateId === template.id"
								:downloading="downloadingTemplateId === template.id"
								@select="selectTemplate"
								@preview="handlePreview"
								@apply="handleApply"
								@delete="handleDelete"
								@upload="handleUpload"
								@download="handleDownload"
							/>
						</div>
					</template>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TemplateCard from './TemplateCard.vue'
import { useTemplateCenter } from '../../aiworkflow/template/useTemplateCenter'
import { buildSquareParticles } from '../../composables/useSquareParticles'
import type { TemplateItem, SaveTemplateOptions, TemplateSource } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'
import { toastSuccess, toastError } from '../UIComponent/useGlobalFeedback'

type TabId = 'user' | 'cloud' | 'workshop'

const props = defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void
	(e: 'apply-template', template: TemplateItem): void
	(e: 'preview-template', template: TemplateItem): void
	(e: 'delete-template', template: TemplateItem): void
	(e: 'save-template', options: Pick<SaveTemplateOptions, 'scope'>): void
	(e: 'upload-template', template: TemplateItem): void
	(e: 'download-template', template: TemplateItem): void
}>()

const { t } = useI18n()

const {
	loading,
	searchKeyword,
	selectedCategory,
	sortBy,
	viewMode,
	selectedTemplate,
	templates,
	cloudAvailable,
	cloudPlatform,
	cloudQuota,
	cloudSyncing,
	uploadingTemplateId,
	downloadingTemplateId,
	loadTemplates,
	selectTemplate,
	setViewMode,
	uploadToCloud,
	downloadFromCloud,
	refreshCloud,
} = useTemplateCenter()

const activeTab = ref<TabId>('user')

function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1)
	const val = bytes / Math.pow(1000, i)
	return val.toFixed(i > 0 ? (val < 10 ? 2 : val < 100 ? 1 : 0) : 0) + ' ' + units[i]
}

const cloudQuotaText = computed(() => {
	if (!cloudAvailable.value) return ''
	const q = cloudQuota.value
	if (!q) return t('aiworkflow.templateCenter.loading')
	const used = q.totalBytes - q.availableBytes
	const available = q.availableBytes
	const total = q.totalBytes
	const usedPct = total > 0 ? ((used / total) * 100).toFixed(2) : '0'
	return `${formatBytes(used)} / ${formatBytes(total)} (${t('aiworkflow.templateCenter.storageFree')} ${formatBytes(available)}, ${usedPct}% ${t('aiworkflow.templateCenter.storageUsed')})`
})

const cloudQuotaPercent = computed(() => {
	if (!cloudQuota.value || cloudQuota.value.totalBytes <= 0) return 0
	const used = cloudQuota.value.totalBytes - cloudQuota.value.availableBytes
	const pct = (used / cloudQuota.value.totalBytes) * 100
	return Math.min(100, Math.max(0.5, pct))
})

const tabs = computed(() => [
	{
		id: 'user' as TabId,
		label: t('aiworkflow.templateCenter.tabUser'),
		icon: { viewBox: '0 0 16 16', d: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 14s1-4 5-4 5 4 5 4H3z' },
	},
	{
		id: 'cloud' as TabId,
		label: t('aiworkflow.templateCenter.tabCloud'),
		icon: { viewBox: '0 0 16 16', d: 'M8 3a4 4 0 0 0-3.87 3H4a3 3 0 0 0 0 6h8a2.5 2.5 0 0 0 .5-4.95A4 4 0 0 0 8 3z' },
	},
	{
		id: 'workshop' as TabId,
		label: t('aiworkflow.templateCenter.tabWorkshop'),
		icon: { viewBox: '0 0 16 16', d: 'M8 1l2 5h5l-4 3.5L12.5 15 8 11.5 3.5 15 5 9.5 1 6h5L8 1z' },
	},
])

const tabSourceMap: Record<TabId, TemplateSource | null> = {
	user: 'user',
	cloud: 'steam-user',
	workshop: null,
}

const displayTemplates = computed(() => {
	let result = [...templates.value]

	const targetSource = tabSourceMap[activeTab.value]
	if (targetSource) {
		result = result.filter((t) => t.source === targetSource)
	}

	if (searchKeyword.value.trim()) {
		const keyword = searchKeyword.value.toLowerCase().trim()
		result = result.filter(
			(t) =>
				t.name.toLowerCase().includes(keyword) ||
				t.description.toLowerCase().includes(keyword) ||
				t.tags?.some((tag) => tag.toLowerCase().includes(keyword))
		)
	}

	if (selectedCategory.value !== 'all') {
		result = result.filter((t) => t.category === selectedCategory.value)
	}

	if (sortBy.value === 'name') {
		result.sort((a, b) => a.name.localeCompare(b.name))
	} else {
		result.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
	}

	return result
})

const currentTabEmptyText = computed(() => {
	switch (activeTab.value) {
		case 'user':
			return t('aiworkflow.templateCenter.noUserTemplates')
		case 'cloud':
			return cloudAvailable.value
				? t('aiworkflow.templateCenter.noCloudTemplates')
				: t('aiworkflow.templateCenter.steamRequired')
		default:
			return t('aiworkflow.templateCenter.noTemplates')
	}
})

function switchTab(tabId: TabId) {
	activeTab.value = tabId
	selectTemplate(null)
	if (tabId === 'cloud' && cloudAvailable.value) {
		console.log('[template-center] Switching to cloud tab, refreshing...')
		refreshCloud()
	}
}

async function handleRefreshCloud() {
	if (cloudSyncing.value) return
	console.log('[template-center] Manual refresh triggered')
	await refreshCloud()
}

const particles = buildSquareParticles({ count: 12, seed: 999, baseOpacity: 0.35 })

const cardSize = computed(() => {
	if (viewMode.value === 'grid-large') return 'large'
	if (viewMode.value === 'grid-small') return 'small'
	return 'list'
})

watch(
	() => props.open,
	async (val) => {
		if (val) {
			console.log('[template-center] Dialog opened, loading templates...')
			await loadTemplates({ forceCloudRefresh: true })
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

async function handleUpload(template: TemplateItem) {
	console.log('[template-center-dialog] handleUpload clicked for:', template.id, template.name)
	const result = await uploadToCloud(template)
	console.log('[template-center-dialog] upload result:', result)
	if (result?.ok) {
		toastSuccess(t('aiworkflow.templateCenter.uploadSuccess'))
	} else {
		toastError(result?.errMsg || t('aiworkflow.templateCenter.uploadFailed'))
	}
}

async function handleDownload(template: TemplateItem) {
	console.log('[template-center-dialog] handleDownload clicked for:', template.id, template.name)
	const result = await downloadFromCloud(template)
	console.log('[template-center-dialog] download result:', result ? 'success' : 'failed')
	if (result) {
		toastSuccess(t('aiworkflow.templateCenter.downloadSuccess'))
	} else {
		toastError(t('aiworkflow.templateCenter.downloadFailed'))
	}
}
</script>

<style scoped>
@import '../../styles/square-particles.css';

.tc-mask {
	position: fixed;
	inset: 0;
	z-index: 2000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.65);
	backdrop-filter: blur(6px);
	padding: 24px;
	box-sizing: border-box;
	pointer-events: auto;
}

.tc-dialog {
	--tc-accent: var(--theme-accent, #1f9d84);
	--tc-accent-hover: var(--theme-accent-hover, #27b99c);
	--tc-cold: #3aa8b4;
	--tc-warm: #e5b567;
	--tc-glow: #27b99c;
	--tc-fg: var(--theme-text-primary, #eaf2f5);
	--tc-fg-soft: var(--theme-text-secondary, #9aa0a6);
	--tc-bg-0: #07090d;
	--tc-bg-1: #111a22;
	--tc-card-border: rgba(31, 157, 132, 0.28);
	position: relative;
	width: 100%;
	max-width: 1100px;
	height: 100%;
	max-height: 750px;
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 35%, transparent);
	border-radius: 2px;
	overflow: hidden;
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.55),
		0 0 0 1px color-mix(in srgb, var(--tc-accent) 15%, transparent),
		0 0 60px color-mix(in srgb, var(--tc-accent) 10%, transparent);
}

/* Background layers */
.tc-bg-layer {
	position: absolute;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	overflow: hidden;
}

.tc-bg-gradient {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(ellipse 80% 60% at 20% 15%, color-mix(in srgb, var(--tc-accent) 12%, transparent), transparent 60%),
		radial-gradient(ellipse 60% 50% at 85% 90%, color-mix(in srgb, var(--tc-cold) 10%, transparent), transparent 55%),
		linear-gradient(180deg, var(--tc-bg-0) 0%, var(--tc-bg-1) 100%);
}

.tc-bg-grid {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(to right, color-mix(in srgb, var(--tc-accent) 5%, transparent) 1px, transparent 1px),
		linear-gradient(to bottom, color-mix(in srgb, var(--tc-accent) 5%, transparent) 1px, transparent 1px);
	background-size: 48px 48px;
	opacity: 0.4;
	mask-image: radial-gradient(ellipse at 50% 40%, #000 40%, transparent 100%);
	-webkit-mask-image: radial-gradient(ellipse at 50% 40%, #000 40%, transparent 100%);
}

.tc-bg-glow {
	position: absolute;
	border-radius: 4px;
	filter: blur(50px);
	opacity: 0.6;
	will-change: transform;
}

.tc-bg-glow-1 {
	top: -40px;
	left: 10%;
	width: 500px;
	height: 280px;
	background: linear-gradient(135deg, color-mix(in srgb, var(--tc-accent) 30%, transparent), transparent 70%);
	animation: tc-drift-1 18s ease-in-out infinite;
}

.tc-bg-glow-2 {
	bottom: -60px;
	right: 5%;
	width: 560px;
	height: 340px;
	background: linear-gradient(135deg, color-mix(in srgb, var(--tc-cold) 22%, transparent), transparent 70%);
	animation: tc-drift-2 22s ease-in-out infinite;
}

@keyframes tc-drift-1 {
	0%, 100% { transform: translate3d(0, 0, 0); }
	50% { transform: translate3d(30px, -20px, 0); }
}

@keyframes tc-drift-2 {
	0%, 100% { transform: translate3d(0, 0, 0); }
	50% { transform: translate3d(-25px, 20px, 0); }
}

.tc-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	z-index: 1;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--tc-accent) 50%, transparent) 50%,
		transparent 100%
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--tc-accent) 35%, transparent);
	animation: tc-scan-pulse 10s ease-in-out infinite;
	pointer-events: none;
}

@keyframes tc-scan-pulse {
	0%, 100% { opacity: 0.5; }
	50% { opacity: 1; }
}

.tc-particles {
	z-index: 2;
}

/* Corner brackets */
.tc-corner {
	position: absolute;
	width: 14px;
	height: 14px;
	z-index: 10;
	pointer-events: none;
	border-color: var(--tc-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.8;
	transition: width 220ms cubic-bezier(0.22, 0.61, 0.36, 1),
		height 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tc-corner-tl {
	top: 6px;
	left: 6px;
	border-top-width: 2px;
	border-left-width: 2px;
}
.tc-corner-tr {
	top: 6px;
	right: 6px;
	border-top-width: 2px;
	border-right-width: 2px;
}
.tc-corner-bl {
	bottom: 6px;
	left: 6px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}
.tc-corner-br {
	bottom: 6px;
	right: 6px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

.tc-dialog:hover .tc-corner {
	width: 20px;
	height: 20px;
}

/* Header */
.tc-header {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 18px 24px 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 20%, transparent);
}

.tc-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.tc-title {
	font-size: 20px;
	font-weight: 700;
	color: var(--tc-fg);
	text-shadow: 0 0 12px color-mix(in srgb, var(--tc-accent) 30%, transparent);
	letter-spacing: 0.02em;
}

.tc-title-sub {
	font-size: 11px;
	color: var(--tc-fg-soft);
	display: flex;
	align-items: center;
	gap: 6px;
}
.tc-title-sub::before {
	content: "";
	display: inline-block;
	width: 5px;
	height: 5px;
	background: var(--tc-accent);
	box-shadow: 0 0 6px var(--tc-accent);
}

.tc-header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.tc-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 7px 14px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 35%, transparent);
	background: color-mix(in srgb, var(--tc-fg) 3%, transparent);
	color: var(--tc-fg);
	font-size: 12px;
	letter-spacing: 0.03em;
	cursor: pointer;
	border-radius: 2px;
	transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease, transform 160ms ease;
	font-family: inherit;
}

.tc-btn:hover {
	background: color-mix(in srgb, var(--tc-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--tc-accent) 55%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--tc-accent) 20%, transparent);
}

.tc-btn:active {
	transform: translateY(1px);
}

.tc-btn-primary {
	background: color-mix(in srgb, var(--tc-accent) 15%, transparent);
	border-color: color-mix(in srgb, var(--tc-accent) 55%, transparent);
	color: var(--tc-glow);
	font-weight: 600;
}

.tc-btn-primary:hover {
	background: var(--tc-accent);
	border-color: var(--tc-accent);
	color: #fff;
	box-shadow: 0 0 18px color-mix(in srgb, var(--tc-accent) 30%, transparent);
}

.tc-btn-icon {
	width: 32px;
	height: 32px;
	padding: 0;
}

.tc-btn-close:hover {
	color: var(--tc-accent);
}

/* Tabs */
.tc-tabs {
	position: relative;
	z-index: 5;
	display: flex;
	gap: 0;
	padding: 0 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 12%, transparent);
	background: color-mix(in srgb, var(--tc-bg-1) 60%, transparent);
}

.tc-tab {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 12px 18px;
	border: none;
	background: transparent;
	color: var(--tc-fg-soft);
	font-size: 13px;
	letter-spacing: 0.03em;
	cursor: pointer;
	border-bottom: 2px solid transparent;
	transition: color 200ms ease, border-color 200ms ease, background 200ms ease;
	font-family: inherit;
	position: relative;
}

.tc-tab:hover {
	color: var(--tc-fg);
	background: color-mix(in srgb, var(--tc-accent) 5%, transparent);
}

.tc-tab.active {
	color: var(--tc-glow);
	border-bottom-color: var(--tc-accent);
	background: color-mix(in srgb, var(--tc-accent) 8%, transparent);
}

.tc-tab-badge {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	font-size: 10px;
	background: color-mix(in srgb, var(--tc-accent) 20%, transparent);
	border: 1px solid color-mix(in srgb, var(--tc-accent) 40%, transparent);
	border-radius: 2px;
	color: var(--tc-glow);
	letter-spacing: 0.05em;
	text-transform: uppercase;
}

.tc-quota-bar-wrap {
	padding: 10px 24px 8px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 15%, transparent);
	background: color-mix(in srgb, var(--tc-bg-1) 30%, transparent);
	flex-shrink: 0;
}

.tc-quota-bar-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 6px;
}

.tc-quota-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	color: var(--tc-fg-soft);
	letter-spacing: 0.03em;
}

.tc-quota-bar {
	height: 22px;
	background: color-mix(in srgb, var(--tc-fg) 6%, var(--tc-bg-0));
	border: 1px solid color-mix(in srgb, var(--tc-accent) 25%, transparent);
	border-radius: 3px;
	overflow: hidden;
	position: relative;
	box-shadow: inset 0 1px 3px rgba(0,0,0,0.3), 0 0 6px color-mix(in srgb, var(--tc-accent) 8%, transparent);
}

.tc-quota-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, 
		color-mix(in srgb, var(--tc-accent) 70%, transparent),
		var(--tc-accent),
		color-mix(in srgb, var(--tc-cold) 80%, var(--tc-accent))
	);
	border-radius: 2px;
	transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1);
	box-shadow: 
		0 0 12px color-mix(in srgb, var(--tc-accent) 50%, transparent),
		inset 0 1px 0 rgba(255,255,255,0.15);
	position: relative;
}

.tc-quota-bar-fill::after {
	content: '';
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 20px;
	background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12));
	border-radius: 0 2px 2px 0;
}

.tc-quota-bar-text {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	padding: 0 8px;
	font-size: 10px;
	font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	font-weight: 600;
	letter-spacing: 0.02em;
	color: #fff;
	text-shadow: 0 1px 3px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4);
	z-index: 2;
	pointer-events: none;
	white-space: nowrap;
}

.tc-quota-loading-text {
	opacity: 0.7;
}

.tc-quota-bar-loading {
	height: 100%;
	width: 30%;
	background: linear-gradient(90deg, 
		transparent,
		color-mix(in srgb, var(--tc-accent) 40%, transparent),
		var(--tc-accent),
		color-mix(in srgb, var(--tc-accent) 40%, transparent),
		transparent
	);
	background-size: 200% 100%;
	border-radius: 2px;
	animation: tc-quota-loading 1.4s ease-in-out infinite;
	opacity: 0.5;
}

@keyframes tc-quota-loading {
	0% { background-position: 200% 0; }
	100% { background-position: -200% 0; }
}

.tc-refresh-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 25%, transparent);
	background: color-mix(in srgb, var(--tc-accent) 6%, transparent);
	color: var(--tc-glow);
	border-radius: 2px;
	cursor: pointer;
	transition: all 0.15s ease;
}

.tc-refresh-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--tc-accent) 20%, transparent);
	border-color: color-mix(in srgb, var(--tc-accent) 50%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--tc-accent) 20%, transparent);
}

.tc-refresh-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.tc-refresh-spin {
	animation: tc-refresh-spin 0.8s linear infinite;
}

@keyframes tc-refresh-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.tc-sync-hint {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 6px;
	font-size: 11px;
	color: var(--tc-cold);
}

.tc-spinner-mini {
	width: 12px;
	height: 12px;
	border: 1.5px solid color-mix(in srgb, var(--tc-cold) 20%, transparent);
	border-top-color: var(--tc-cold);
	border-radius: 50%;
	animation: tc-spin 0.7s linear infinite;
}

@keyframes tc-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* Workshop placeholder */
.tc-workshop-placeholder {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	padding: 48px;
	text-align: center;
	color: var(--tc-fg-soft);
}

.tc-workshop-icon {
	color: var(--tc-accent);
	opacity: 0.4;
	margin-bottom: 24px;
}

.tc-workshop-placeholder h3 {
	font-size: 18px;
	font-weight: 600;
	color: var(--tc-fg);
	margin: 0 0 12px;
	letter-spacing: 0.02em;
}

.tc-workshop-placeholder p {
	font-size: 13px;
	max-width: 400px;
	line-height: 1.6;
	margin: 0 0 20px;
}

.tc-workshop-hint {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 10px 16px;
	background: color-mix(in srgb, var(--tc-warm) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--tc-warm) 30%, transparent);
	border-radius: 2px;
	color: var(--tc-warm);
	font-size: 12px;
}

/* Toolbar */
.tc-toolbar {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--tc-accent) 12%, transparent);
	flex-wrap: wrap;
}

.tc-search-wrap {
	position: relative;
	flex: 1;
	min-width: 180px;
	display: flex;
	align-items: center;
	gap: 8px;
}

.tc-search-icon {
	position: absolute;
	left: 10px;
	top: 50%;
	transform: translateY(-50%);
	color: var(--tc-fg-soft);
	pointer-events: none;
}

.tc-search-input {
	flex: 1;
	height: 34px;
	padding: 0 12px 0 32px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 28%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--tc-fg) 3%, transparent);
	color: var(--tc-fg);
	font-size: 12px;
	outline: none;
	box-sizing: border-box;
	transition: border-color 200ms ease, background 200ms ease, box-shadow 200ms ease;
	font-family: inherit;
}

.tc-search-input::placeholder {
	color: color-mix(in srgb, var(--tc-fg-soft) 60%, transparent);
}

.tc-search-input:focus {
	border-color: color-mix(in srgb, var(--tc-accent) 65%, transparent);
	background: color-mix(in srgb, var(--tc-fg) 5%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--tc-accent) 25%, transparent),
		0 0 16px color-mix(in srgb, var(--tc-accent) 12%, transparent);
}

.tc-filters {
	display: flex;
	gap: 6px;
}

.tc-select {
	height: 34px;
	padding: 0 28px 0 10px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 28%, transparent);
	border-radius: 2px;
	background-color: color-mix(in srgb, var(--tc-fg) 3%, transparent);
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5L5 6.5L8 3.5' stroke='%239aa0a6' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 8px center;
	background-size: 10px 10px;
	color: var(--tc-fg);
	font-size: 12px;
	outline: none;
	cursor: pointer;
	appearance: none;
	transition: border-color 200ms ease, box-shadow 200ms ease, background-color 200ms ease;
	font-family: inherit;
}

.tc-select:focus {
	border-color: color-mix(in srgb, var(--tc-accent) 65%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--tc-accent) 25%, transparent);
}

.tc-select option {
	background: var(--tc-bg-1);
	color: var(--tc-fg);
}

.tc-view-switch {
	display: flex;
	gap: 2px;
	padding: 2px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 28%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--tc-fg) 2%, transparent);
}

.tc-view-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border: none;
	border-radius: 2px;
	background: transparent;
	color: var(--tc-fg-soft);
	cursor: pointer;
	transition: all 200ms ease;
}

.tc-view-btn:hover {
	color: var(--tc-fg);
	background: color-mix(in srgb, var(--tc-fg) 5%, transparent);
}

.tc-view-btn.active {
	background: var(--tc-accent);
	color: #fff;
	box-shadow: 0 0 10px color-mix(in srgb, var(--tc-accent) 30%, transparent);
}

/* Content */
.tc-content {
	position: relative;
	z-index: 5;
	flex: 1;
	overflow-y: auto;
	padding: 20px 24px;
}

.tc-loading,
.tc-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	color: var(--tc-fg-soft);
	gap: 16px;
}

.tc-spinner {
	width: 36px;
	height: 36px;
	border: 2px solid color-mix(in srgb, var(--tc-accent) 18%, transparent);
	border-top-color: var(--tc-accent);
	border-radius: 50%;
	animation: tc-spin 0.8s linear infinite;
}

@keyframes tc-spin {
	to { transform: rotate(360deg); }
}

.tc-empty p {
	font-size: 13px;
	margin: 0;
}

.tc-grid {
	display: grid;
	gap: 14px;
}

.tc-grid--grid-large {
	grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}

.tc-grid--grid-small {
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	gap: 10px;
}

.tc-grid--list {
	grid-template-columns: 1fr;
	gap: 6px;
}

/* Transition */
.tc-dialog-enter-active,
.tc-dialog-leave-active {
	transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tc-dialog-enter-from,
.tc-dialog-leave-to {
	opacity: 0;
	transform: scale(0.97) translateY(8px);
}

.tc-dialog-enter-active .tc-bg-glow,
.tc-dialog-leave-active .tc-bg-glow {
	animation-play-state: paused;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.tc-bg-glow { animation: none !important; }
	.tc-scanline { animation: none !important; }
	.tc-corner { transition: none !important; }
	.tc-dialog-enter-active,
	.tc-dialog-leave-active {
		transition: opacity 150ms ease;
	}
	.tc-dialog-enter-from,
	.tc-dialog-leave-to {
		transform: none;
	}
}
</style>

<style>
/* Light theme — global (unscoped) to guarantee cascade works */
[data-theme='light'] .tc-mask {
	background: rgba(180, 190, 200, 0.45) !important;
	backdrop-filter: blur(8px);
}
[data-theme='light'] .tc-dialog {
	--tc-bg-0: #eef2f5 !important;
	--tc-bg-1: #dfe5eb !important;
	--tc-fg: #1a1d21 !important;
	--tc-fg-soft: #4a5058 !important;
	--tc-glow: #17806d !important;
	--tc-card-border: rgba(31, 157, 132, 0.22) !important;
	background: transparent;
	border-color: rgba(31, 157, 132, 0.3) !important;
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.15),
		0 0 0 1px rgba(31, 157, 132, 0.12),
		0 0 40px rgba(31, 157, 132, 0.08) !important;
}
[data-theme='light'] .tc-bg-gradient {
	background:
		radial-gradient(ellipse 80% 60% at 20% 15%, rgba(31, 157, 132, 0.08), transparent 60%),
		radial-gradient(ellipse 60% 50% at 85% 90%, rgba(58, 168, 180, 0.06), transparent 55%),
		linear-gradient(180deg, #f0f3f6 0%, #dde3ea 100%) !important;
}
[data-theme='light'] .tc-bg-grid {
	opacity: 0.25 !important;
	background-image:
		linear-gradient(to right, rgba(31, 157, 132, 0.06) 1px, transparent 1px),
		linear-gradient(to bottom, rgba(31, 157, 132, 0.06) 1px, transparent 1px) !important;
}
[data-theme='light'] .tc-bg-glow-1 {
	background: linear-gradient(135deg, rgba(31, 157, 132, 0.12), transparent 70%) !important;
	opacity: 0.5 !important;
}
[data-theme='light'] .tc-bg-glow-2 {
	background: linear-gradient(135deg, rgba(58, 168, 180, 0.1), transparent 70%) !important;
	opacity: 0.5 !important;
}
[data-theme='light'] .tc-scanline {
	background: linear-gradient(
		90deg,
		transparent 0%,
		rgba(31, 157, 132, 0.35) 50%,
		transparent 100%
	) !important;
	box-shadow: 0 0 8px rgba(31, 157, 132, 0.2) !important;
	opacity: 0.6 !important;
}
[data-theme='light'] .tc-corner {
	border-color: #1f9d84 !important;
	opacity: 0.6 !important;
}
[data-theme='light'] .tc-header {
	border-bottom-color: rgba(31, 157, 132, 0.18) !important;
}
[data-theme='light'] .tc-title {
	color: #1a1d21 !important;
	text-shadow: none !important;
}
[data-theme='light'] .tc-title-sub {
	color: #4a5058 !important;
}
[data-theme='light'] .tc-title-sub::before {
	box-shadow: 0 0 4px rgba(31, 157, 132, 0.4) !important;
}
[data-theme='light'] .tc-btn {
	background: rgba(255, 255, 255, 0.6) !important;
	border-color: rgba(31, 157, 132, 0.3) !important;
	color: #1a1d21 !important;
}
[data-theme='light'] .tc-btn:hover {
	background: rgba(31, 157, 132, 0.1) !important;
	border-color: rgba(31, 157, 132, 0.5) !important;
	box-shadow: 0 0 10px rgba(31, 157, 132, 0.12) !important;
}
[data-theme='light'] .tc-btn-primary {
	background: rgba(31, 157, 132, 0.15) !important;
	border-color: rgba(31, 157, 132, 0.5) !important;
	color: #17806d !important;
	text-shadow: none !important;
}
[data-theme='light'] .tc-btn-primary:hover {
	background: #1f9d84 !important;
	border-color: #1f9d84 !important;
	color: #fff !important;
	box-shadow: 0 0 14px rgba(31, 157, 132, 0.25) !important;
}
[data-theme='light'] .tc-btn-close:hover {
	color: #1f9d84 !important;
	background: rgba(31, 157, 132, 0.1) !important;
}
[data-theme='light'] .tc-toolbar {
	border-bottom-color: rgba(31, 157, 132, 0.12) !important;
}
[data-theme='light'] .tc-search-icon {
	color: #6b7280 !important;
}
[data-theme='light'] .tc-search-input,
[data-theme='light'] .tc-select {
	background-color: rgba(255, 255, 255, 0.8) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
	color: #1a1d21 !important;
}
[data-theme='light'] .tc-search-input::placeholder {
	color: #8a9099 !important;
}
[data-theme='light'] .tc-search-input:focus,
[data-theme='light'] .tc-select:focus {
	border-color: rgba(31, 157, 132, 0.55) !important;
	background-color: #fff !important;
	box-shadow: 0 0 0 1px rgba(31, 157, 132, 0.2), 0 0 12px rgba(31, 157, 132, 0.08) !important;
}
[data-theme='light'] .tc-select {
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5L5 6.5L8 3.5' stroke='%234a5058' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") !important;
	background-repeat: no-repeat !important;
	background-position: right 8px center !important;
	background-size: 10px 10px !important;
}
[data-theme='light'] .tc-select option {
	background: #fff;
	color: #1a1d21;
}
[data-theme='light'] .tc-view-switch {
	background: rgba(0, 0, 0, 0.03) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
}
[data-theme='light'] .tc-view-btn {
	color: #6b7280 !important;
}
[data-theme='light'] .tc-view-btn:hover {
	color: #1a1d21 !important;
	background: rgba(0, 0, 0, 0.05) !important;
}
[data-theme='light'] .tc-view-btn.active {
	background: #1f9d84 !important;
	color: #fff !important;
	box-shadow: 0 0 8px rgba(31, 157, 132, 0.25) !important;
}
[data-theme='light'] .tc-content {
	/* scrollbar will adapt */
}
[data-theme='light'] .tc-loading,
[data-theme='light'] .tc-empty {
	color: #6b7280 !important;
}
[data-theme='light'] .tc-quota-bar-wrap {
	background: rgba(255, 255, 255, 0.5) !important;
	border-bottom-color: rgba(31, 157, 132, 0.12) !important;
}
[data-theme='light'] .tc-quota-label {
	color: #4a5058 !important;
}
[data-theme='light'] .tc-quota-bar {
	background: rgba(0, 0, 0, 0.04) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
	box-shadow: inset 0 1px 2px rgba(0,0,0,0.06), 0 0 4px rgba(31, 157, 132, 0.06) !important;
}
[data-theme='light'] .tc-quota-bar-fill {
	background: linear-gradient(90deg, rgba(31, 157, 132, 0.8), #1f9d84, rgba(59, 130, 246, 0.7)) !important;
	box-shadow: 0 0 8px rgba(31, 157, 132, 0.35), inset 0 1px 0 rgba(255,255,255,0.3) !important;
}
[data-theme='light'] .tc-quota-bar-text {
	color: #fff !important;
	text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
}
[data-theme='light'] .tc-refresh-btn {
	border-color: rgba(31, 157, 132, 0.25) !important;
	background: rgba(31, 157, 132, 0.05) !important;
	color: #17806d !important;
}
[data-theme='light'] .tc-spinner {
	border-color: rgba(31, 157, 132, 0.15) !important;
	border-top-color: #1f9d84 !important;
}
</style>
