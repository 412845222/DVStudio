<template>
	<div class="cs-page">
		<GlobalPageBackground variant="project-list" />

		<div class="cs-scanline-top" aria-hidden="true"></div>
		<div class="cs-scanline-bottom" aria-hidden="true"></div>

		<div class="cs-page-shell">
			<header class="cs-header">
				<div class="cs-title-row">
					<div class="cs-title-icon-wrap">
						<div class="cs-icon-frame" aria-hidden="true">
							<span class="cs-icon-corner tl"></span>
							<span class="cs-icon-corner tr"></span>
							<span class="cs-icon-corner bl"></span>
							<span class="cs-icon-corner br"></span>
						</div>
						<svg viewBox="0 0 24 24" class="cs-title-icon" aria-hidden="true">
							<path
								d="M6.5 19.5a4 4 0 0 1-1.1-7.8 5.5 5.5 0 0 1 10.5-2.2 4 4 0 0 1 .6 7.9"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
							<path
								d="M12 13v6M9 16l3-3 3 3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
					<div class="cs-title-text">
						<h1 class="cs-title">{{ t('cloudStorage.page.title') }}</h1>
						<p class="cs-subtitle">{{ t('cloudStorage.page.subtitle') }}</p>
					</div>
				</div>
				<div class="cs-header-line" aria-hidden="true">
					<span class="cs-hl-left"></span>
					<span class="cs-hl-center"></span>
					<span class="cs-hl-right"></span>
				</div>
			</header>

			<div class="cs-content">
				<aside class="cs-sidebar">
					<div
						class="cs-panel"
						@mouseenter="sidebarHovered = true"
						@mouseleave="sidebarHovered = false"
					>
						<div class="panel-scan-h" aria-hidden="true"></div>
						<div class="panel-scan-v" aria-hidden="true"></div>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in sidebarParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="sidebarParticles.buildHoverStateClass(sidebarHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
							<span class="edge top"></span>
							<span class="edge right"></span>
							<span class="edge bottom"></span>
							<span class="edge left"></span>
						</div>
						<CloudBucketList
							v-if="!showConfigPanel"
							:buckets="configuredBuckets"
							:loading="loadingBuckets"
							@add-bucket="showAddBucket"
							@select-bucket="onSelectBucket"
							@remove-bucket="onRemoveBucket"
							@set-default="onSetDefaultBucket"
						/>
						<CloudStorageConfigPanel v-else @cancel="hideAddBucket" @bucket-added="onBucketAdded" />
					</div>
				</aside>
				<main class="cs-main">
					<div class="cs-panel" @mouseenter="mainHovered = true" @mouseleave="mainHovered = false">
						<div class="panel-scan-h" aria-hidden="true"></div>
						<div class="panel-scan-v" aria-hidden="true"></div>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in mainParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="mainParticles.buildHoverStateClass(mainHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
							<span class="edge top"></span>
							<span class="edge right"></span>
							<span class="edge bottom"></span>
							<span class="edge left"></span>
						</div>
						<CloudFileList
							ref="fileListRef"
							:connected="connected"
							:config="activeBucket"
							:bucket-name="activeBucket?.bucketName || ''"
							:current-prefix="currentPrefix"
							:is-public="Boolean(activeBucket?.is_public)"
							@refresh="loadFiles"
							@upload="handleUpload"
							@delete="handleDelete"
							@navigate="onNavigate"
							@create-folder="onCreateFolder"
							@fix-acl="onFixCurrentBucketAcl"
						/>
					</div>
				</main>
			</div>
		</div>

		<CloudUploadQueue :visible="showQueuePanel" @close="showQueuePanel = false" />

		<div
			v-if="showUploadIndicator"
			class="cs-upload-indicator"
			:class="{ 'has-error': hasErrors }"
			@click="showQueuePanel = true"
		>
			<div class="cs-ui-corners" aria-hidden="true">
				<span class="cs-uic tl"></span>
				<span class="cs-uic tr"></span>
				<span class="cs-uic bl"></span>
				<span class="cs-uic br"></span>
			</div>
			<svg v-if="isActive" viewBox="0 0 16 16" class="cs-ui-spinner-icon" aria-hidden="true">
				<circle
					cx="8"
					cy="8"
					r="6"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-dasharray="20 10"
					stroke-linecap="round"
				/>
			</svg>
			<svg v-else-if="hasErrors" viewBox="0 0 16 16" class="cs-ui-error-icon" aria-hidden="true">
				<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3" />
				<path
					d="M5.5 5.5l5 5M10.5 5.5l-5 5"
					stroke="currentColor"
					stroke-width="1.3"
					stroke-linecap="round"
				/>
			</svg>
			<svg v-else viewBox="0 0 16 16" class="cs-ui-done-icon" aria-hidden="true">
				<path
					d="M3 8l3.5 3.5L13 5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<div class="cs-ui-info">
				<div class="cs-ui-text">
					<span v-if="isActive">{{ t('cloudStorage.uploadQueue.uploading') }}</span>
					<span v-else-if="hasErrors">
						{{
							t('cloudStorage.uploadQueue.someFailed', { failed: errorCount, total: totalCount })
						}}
					</span>
					<span v-else>{{ t('cloudStorage.uploadQueue.completed') }}</span>
					<span class="cs-ui-count">{{ completedCount }}/{{ totalCount }}</span>
				</div>
				<div class="cs-ui-mini-bar">
					<div
						class="cs-ui-mini-fill"
						:class="{ 'has-error': hasErrors && isAllDone }"
						:style="{ width: overallProgress + '%' }"
					></div>
				</div>
			</div>
			<button
				class="cs-ui-expand"
				type="button"
				@click.stop="showQueuePanel = true"
				:title="t('cloudStorage.uploadQueue.viewDetails')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M5.5 3.5l5 4.5-5 4.5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, computed, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { useUploadQueue } from '../../composables/useUploadQueue'
import GlobalPageBackground from '../../ui/UIComponent/GlobalPageBackground.vue'
import CloudStorageConfigPanel from './CloudStorageConfigPanel.vue'
import CloudBucketList from './CloudBucketList.vue'
import CloudFileList from './CloudFileList.vue'
import CloudUploadQueue from './CloudUploadQueue.vue'
import '../../styles/square-particles.css'

const { t } = useI18n()

interface ConfiguredBucket {
	id: number
	configId: number
	bucketName: string
	region: string
	endpoint: string
	aclStatus: string
	akMask?: string
	is_public: boolean
	isActive: boolean
	createdAt: number
	updatedAt: number
}

interface CloudFile {
	key: string
	name: string
	size: number
	lastModified: number
	url?: string
	publicUrl?: string
	contentType?: string
}

const fileListRef = ref<InstanceType<typeof CloudFileList> | null>(null)
const connected = ref(false)
const activeBucket = ref<ConfiguredBucket | null>(null)
const configuredBuckets = ref<ConfiguredBucket[]>([])
const loadingBuckets = ref(false)
const currentPrefix = ref('')
const showConfigPanel = ref(false)
const showQueuePanel = ref(false)

const uploadQueue = useUploadQueue()
const {
	completedCount,
	errorCount,
	totalCount,
	overallProgress,
	isActive,
	hasErrors,
	isAllDone,
	addFiles
} = uploadQueue

const showUploadIndicator = computed(() => totalCount.value > 0)

let refreshTimer: ReturnType<typeof setTimeout> | null = null
watch(completedCount, (newVal, oldVal) => {
	if (newVal > oldVal) {
		if (refreshTimer) clearTimeout(refreshTimer)
		refreshTimer = setTimeout(() => {
			loadFiles()
		}, 500)
	}
})

const sidebarParticles = useSquareParticles({ count: 6, seed: 101 })
const mainParticles = useSquareParticles({ count: 8, seed: 202 })
const sidebarHovered = ref(false)
const mainHovered = ref(false)

const loadConfiguredBuckets = async () => {
	loadingBuckets.value = true
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (!cloudfs?.listConfiguredBuckets) return
		const result = await cloudfs.listConfiguredBuckets()
		if (result?.ok && Array.isArray(result.buckets)) {
			configuredBuckets.value = result.buckets
			const active = result.buckets.find((b: ConfiguredBucket) => b.isActive)
			if (active) {
				const currentId = activeBucket.value?.id
				activeBucket.value = active
				connected.value = true
				if (currentId !== active.id) {
					currentPrefix.value = ''
					nextTick(() => {
						loadFiles()
					})
				}
			} else if (result.buckets.length === 0) {
				activeBucket.value = null
				connected.value = false
			}
		}
	} catch (err) {
		console.error('[CloudStoragePage] loadConfiguredBuckets error:', err)
	} finally {
		loadingBuckets.value = false
	}
}

const showAddBucket = () => {
	showConfigPanel.value = true
}

const hideAddBucket = () => {
	showConfigPanel.value = false
}

const onBucketAdded = async (bucket?: ConfiguredBucket) => {
	showConfigPanel.value = false
	await loadConfiguredBuckets()
	if (bucket) {
		activeBucket.value = bucket
		connected.value = true
		currentPrefix.value = ''
		nextTick(() => {
			loadFiles()
		})
	} else {
		const latest = configuredBuckets.value[0]
		if (latest && !activeBucket.value) {
			await onSelectBucket(latest)
		}
	}
}

const onSelectBucket = async (bucket: ConfiguredBucket) => {
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.fixBucketAcl) {
			await cloudfs.fixBucketAcl({ bucketId: bucket.id })
		}
		await loadConfiguredBuckets()
	} catch (err) {
		console.error('[CloudStoragePage] onSelectBucket error:', err)
	}
}

const onRemoveBucket = async (bucket: ConfiguredBucket) => {
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.removeConfiguredBucket) {
			await cloudfs.removeConfiguredBucket({ bucketId: bucket.id })
		}
		if (activeBucket.value?.id === bucket.id) {
			activeBucket.value = null
			connected.value = false
		}
		await loadConfiguredBuckets()
	} catch (err) {
		console.error('[CloudStoragePage] onRemoveBucket error:', err)
	}
}

const onSetDefaultBucket = async (bucket: ConfiguredBucket) => {
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.fixBucketAcl) {
			const result = await cloudfs.fixBucketAcl({ bucketId: bucket.id })
			if (result?.ok) {
				await loadConfiguredBuckets()
			}
		}
	} catch (err) {
		console.error('[CloudStoragePage] onSetDefaultBucket error:', err)
	}
}

const onFixCurrentBucketAcl = async () => {
	if (activeBucket.value) {
		await onSetDefaultBucket(activeBucket.value)
	}
}

const onNavigate = (prefix: string) => {
	currentPrefix.value = prefix
	loadFiles()
}

const onCreateFolder = async (folderName: string) => {
	if (!activeBucket.value) return
	const fullPath = currentPrefix.value ? `${currentPrefix.value}${folderName}/` : `${folderName}/`
	console.log('[CloudStoragePage] createFolder:', fullPath)
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.createFolder) {
			const result = await cloudfs.createFolder({ folderPath: fullPath })
			console.log('[CloudStoragePage] createFolder result:', result)
			if (result?.ok) {
				await nextTick()
				await loadFiles()
			} else if (result?.error) {
				console.error('[CloudStoragePage] createFolder failed:', result.error)
			}
		}
	} catch (err: any) {
		console.error('[CloudStoragePage] createFolder exception:', err)
	}
}

const loadFiles = async () => {
	if (!activeBucket.value) {
		if (fileListRef.value) {
			fileListRef.value.setFiles([])
		}
		return
	}
	await nextTick()
	if (fileListRef.value) {
		await fileListRef.value.refresh()
	}
}

const handleUpload = (files: File[], prefix?: string) => {
	if (!files.length) return
	if (!activeBucket.value) return

	const uploadPrefix = prefix || currentPrefix.value || ''
	addFiles(files, uploadPrefix)
}

const handleDelete = async (file: CloudFile) => {
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.deleteFile) {
			await cloudfs.deleteFile({ key: file.key })
		}
		await loadFiles()
	} catch {}
}

onMounted(async () => {
	await loadConfiguredBuckets()
})
</script>

<style scoped>
.cs-page {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 100%;
	overflow: hidden;
	box-sizing: border-box;
	padding: 28px 24px 28px 88px;
	background: linear-gradient(180deg, var(--pl-bg-0) 0%, var(--pl-bg-1) 100%);
	color: var(--pl-fg);
}

.cs-scanline-top,
.cs-scanline-bottom {
	position: absolute;
	left: 88px;
	right: 24px;
	height: 1px;
	z-index: 20;
	pointer-events: none;
}

.cs-scanline-top {
	top: 0;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--pl-accent) 55%, transparent) 50%,
		transparent 100%
	);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 40%, transparent);
	animation: cs-scanline-pulse 8s ease-in-out infinite;
}

.cs-scanline-bottom {
	bottom: 0;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--pl-cold) 45%, transparent) 50%,
		transparent 100%
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-cold) 30%, transparent);
	animation: cs-scanline-pulse 10s ease-in-out infinite reverse;
}

@keyframes cs-scanline-pulse {
	0%,
	100% {
		opacity: 0.4;
	}
	50% {
		opacity: 1;
	}
}

.cs-page-shell {
	position: relative;
	z-index: 1;
	height: 100%;
	display: flex;
	flex-direction: column;
	max-width: 1800px;
	margin: 0 auto;
	min-height: 0;
}

.cs-header {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	gap: 0;
	padding-bottom: 16px;
	margin-bottom: 16px;
	position: relative;
}

.cs-title-row {
	display: flex;
	align-items: center;
	gap: 14px;
}

.cs-title-icon-wrap {
	position: relative;
	width: 44px;
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.cs-icon-frame {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-icon-corner {
	position: absolute;
	width: 12px;
	height: 12px;
	border-color: var(--pl-accent);
}

.cs-icon-corner.tl {
	top: 0;
	left: 0;
	border-top: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
	box-shadow: -2px -2px 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-icon-corner.tr {
	top: 0;
	right: 0;
	border-top: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
	box-shadow: 2px -2px 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-icon-corner.bl {
	bottom: 0;
	left: 0;
	border-bottom: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
	box-shadow: -2px 2px 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-icon-corner.br {
	bottom: 0;
	right: 0;
	border-bottom: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
	box-shadow: 2px 2px 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-title-icon {
	width: 22px;
	height: 22px;
	color: var(--pl-accent);
	filter: drop-shadow(0 0 10px color-mix(in srgb, var(--pl-accent) 60%, transparent));
	position: relative;
	z-index: 1;
}

.cs-title-text {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.cs-title {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 40%, transparent);
	letter-spacing: 0.04em;
	line-height: 1.2;
	position: relative;
}

.cs-title::after {
	content: '';
	display: inline-block;
	width: 3px;
	height: 18px;
	margin-left: 8px;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	vertical-align: text-bottom;
	animation: cs-cursor-blink 1s step-end infinite;
}

@keyframes cs-cursor-blink {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0;
	}
}

.cs-subtitle {
	margin: 0;
	font-size: 12px;
	color: var(--pl-fg-soft);
	line-height: 1.6;
	padding-left: 2px;
	letter-spacing: 0.02em;
}

.cs-subtitle::before {
	content: '';
	display: inline-block;
	width: 6px;
	height: 6px;
	margin-right: 8px;
	background: var(--pl-accent);
	box-shadow: 0 0 10px var(--pl-accent);
	vertical-align: middle;
	animation: cs-dot-pulse 2s ease-in-out infinite;
}

@keyframes cs-dot-pulse {
	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.5;
		transform: scale(0.7);
	}
}

.cs-header-line {
	display: flex;
	align-items: center;
	margin-top: 16px;
	height: 1px;
}

.cs-hl-left,
.cs-hl-right {
	flex: 1;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--pl-accent) 25%, transparent)
	);
}

.cs-hl-right {
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--pl-accent) 25%, transparent),
		transparent
	);
}

.cs-hl-center {
	width: 80px;
	height: 2px;
	background: linear-gradient(90deg, transparent, var(--pl-accent), transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 50%, transparent);
	position: relative;
}

.cs-content {
	flex: 1;
	min-height: 0;
	display: flex;
	gap: 16px;
}

.cs-sidebar {
	width: 380px;
	flex-shrink: 0;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.cs-main {
	flex: 1;
	min-width: 0;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.cs-panel {
	position: relative;
	flex: 1;
	min-height: 0;
	height: 100%;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	gap: 0;
	padding: 0;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 75%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 90%, transparent)
	);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	min-height: 0;
	box-sizing: border-box;
	box-shadow:
		0 4px 16px rgba(0, 0, 0, 0.3),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 25%, transparent);
	transition:
		border-color 260ms ease,
		box-shadow 260ms ease,
		transform 260ms ease;
}

.cs-panel::before {
	content: '';
	position: absolute;
	inset: 0;
	background:
		linear-gradient(
			90deg,
			color-mix(in srgb, var(--pl-accent) 3%, transparent) 1px,
			transparent 1px
		),
		linear-gradient(color-mix(in srgb, var(--pl-accent) 3%, transparent) 1px, transparent 1px);
	background-size: 32px 32px;
	opacity: 0.3;
	pointer-events: none;
	z-index: 2;
	mask-image: linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
	-webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
}

.cs-panel:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 50%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--pl-accent) 35%, transparent),
		0 18px 48px rgba(0, 0, 0, 0.5),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 35%, transparent);
	transform: translateY(-2px);
	filter: brightness(1.06);
}

.panel-scan-h,
.panel-scan-v {
	position: absolute;
	z-index: 3;
	pointer-events: none;
	opacity: 0;
	transition: opacity 260ms ease;
}

.cs-panel:hover .panel-scan-h,
.cs-panel:hover .panel-scan-v {
	opacity: 1;
}

.panel-scan-h {
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--pl-accent) 60%, transparent),
		transparent
	);
	animation: cs-panel-scan-h 3s ease-in-out infinite;
}

.panel-scan-v {
	top: 0;
	bottom: 0;
	right: 0;
	width: 1px;
	background: linear-gradient(
		180deg,
		transparent,
		color-mix(in srgb, var(--pl-cold) 50%, transparent),
		transparent
	);
	animation: cs-panel-scan-v 4s ease-in-out infinite;
}

@keyframes cs-panel-scan-h {
	0%,
	100% {
		transform: translateY(0);
		opacity: 0.3;
	}
	50% {
		transform: translateY(100%);
		opacity: 0.8;
	}
}

@keyframes cs-panel-scan-v {
	0%,
	100% {
		transform: translateX(0);
		opacity: 0.3;
	}
	50% {
		transform: translateX(-100%);
		opacity: 0.6;
	}
}

.card-glow {
	position: absolute;
	inset: -1px;
	z-index: 1;
	pointer-events: none;
	background: radial-gradient(
		ellipse at center,
		color-mix(in srgb, var(--pl-accent) 10%, transparent),
		transparent 70%
	);
	opacity: 0;
	transition: opacity 320ms ease;
}

.cs-panel:hover .card-glow,
.cs-panel:focus-within .card-glow {
	opacity: 1;
}

.card-frame {
	position: absolute;
	inset: 0;
	z-index: 10;
	pointer-events: none;
}

.card-frame .corner {
	position: absolute;
	width: 12px;
	height: 12px;
	border-color: var(--pl-accent);
	transition:
		width 260ms cubic-bezier(0.22, 0.61, 0.36, 1),
		height 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.card-frame .corner.tl {
	top: 5px;
	left: 5px;
	border-top: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.tr {
	top: 5px;
	right: 5px;
	border-top: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.bl {
	bottom: 5px;
	left: 5px;
	border-bottom: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.br {
	bottom: 5px;
	right: 5px;
	border-bottom: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.cs-panel:hover .card-frame .corner {
	width: 20px;
	height: 20px;
}

.card-frame .edge {
	position: absolute;
	background: color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.card-frame .edge.top {
	top: 0;
	left: 18px;
	right: 18px;
	height: 1px;
}

.card-frame .edge.bottom {
	bottom: 0;
	left: 18px;
	right: 18px;
	height: 1px;
}

.card-frame .edge.left {
	top: 18px;
	bottom: 18px;
	left: 0;
	width: 1px;
}

.card-frame .edge.right {
	top: 18px;
	bottom: 18px;
	right: 0;
	width: 1px;
}

.cs-upload-indicator {
	position: fixed;
	bottom: 28px;
	right: 28px;
	z-index: 1000;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 92%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 96%, transparent)
	);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	backdrop-filter: blur(16px);
	box-shadow:
		0 6px 28px rgba(0, 0, 0, 0.5),
		0 0 20px color-mix(in srgb, var(--pl-accent) 18%, transparent);
	cursor: pointer;
	transition: all 200ms ease;
	min-width: 200px;
	max-width: 280px;
	animation: cs-ui-slide-in 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.cs-upload-indicator.has-error {
	border-color: color-mix(in srgb, #ef4444 35%, transparent);
	box-shadow:
		0 6px 28px rgba(0, 0, 0, 0.5),
		0 0 20px color-mix(in srgb, #ef4444 18%, transparent);
}

.cs-upload-indicator.has-error:hover {
	border-color: color-mix(in srgb, #ef4444 60%, transparent);
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.55),
		0 0 28px color-mix(in srgb, #ef4444 28%, transparent);
	transform: translateY(-2px);
}

.cs-upload-indicator:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.55),
		0 0 28px color-mix(in srgb, var(--pl-accent) 28%, transparent);
	transform: translateY(-2px);
}

@keyframes cs-ui-slide-in {
	from {
		opacity: 0;
		transform: translateY(12px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.cs-ui-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-uic {
	position: absolute;
	width: 8px;
	height: 8px;
}

.cs-uic.tl {
	top: 2px;
	left: 2px;
	border-top: 1.5px solid var(--pl-accent);
	border-left: 1.5px solid var(--pl-accent);
}

.cs-uic.tr {
	top: 2px;
	right: 2px;
	border-top: 1.5px solid var(--pl-accent);
	border-right: 1.5px solid var(--pl-accent);
}

.cs-uic.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1.5px solid var(--pl-accent);
	border-left: 1.5px solid var(--pl-accent);
}

.cs-uic.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1.5px solid var(--pl-accent);
	border-right: 1.5px solid var(--pl-accent);
}

.cs-ui-spinner-icon {
	width: 18px;
	height: 18px;
	color: var(--pl-accent);
	flex-shrink: 0;
	animation: cs-ui-spin 1s linear infinite;
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent));
}

@keyframes cs-ui-spin {
	to {
		transform: rotate(360deg);
	}
}

.cs-ui-done-icon {
	width: 18px;
	height: 18px;
	color: #22c55e;
	flex-shrink: 0;
	filter: drop-shadow(0 0 6px color-mix(in srgb, #22c55e 50%, transparent));
}

.cs-ui-error-icon {
	width: 18px;
	height: 18px;
	color: #ef4444;
	flex-shrink: 0;
	filter: drop-shadow(0 0 6px color-mix(in srgb, #ef4444 50%, transparent));
}

.cs-ui-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.cs-ui-text {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 11px;
	color: var(--pl-fg);
	letter-spacing: 0.3px;
}

.cs-ui-count {
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	color: var(--pl-accent);
	font-size: 11px;
	font-weight: 600;
}

.cs-ui-mini-bar {
	width: 100%;
	height: 2px;
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	overflow: hidden;
	position: relative;
}

.cs-ui-mini-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--pl-accent), var(--pl-cold));
	transition: width 200ms ease;
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent);
}

.cs-ui-mini-fill.has-error {
	background: linear-gradient(90deg, #ef4444, #f97316);
	box-shadow: 0 0 6px color-mix(in srgb, #ef4444 50%, transparent);
}

.cs-ui-expand {
	width: 24px;
	height: 24px;
	border: none;
	background: transparent;
	color: var(--pl-fg-soft);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: all 160ms ease;
}

.cs-ui-expand:hover {
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
}

.cs-ui-expand svg {
	width: 14px;
	height: 14px;
}

@media (max-width: 1024px) {
	.cs-sidebar {
		width: 340px;
	}
}

@media (max-width: 768px) {
	.cs-page {
		padding: 16px 12px 16px 72px;
	}

	.cs-content {
		flex-direction: column;
	}

	.cs-sidebar {
		width: 100%;
		max-height: 45vh;
	}

	.cs-title {
		font-size: 18px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.cs-panel,
	.cs-panel::before,
	.panel-scan-h,
	.panel-scan-v,
	.card-frame .corner {
		transition: border-color 180ms ease;
		animation: none !important;
	}

	.cs-panel:hover {
		transform: none;
		filter: none;
	}

	.cs-scanline-top,
	.cs-scanline-bottom,
	.cs-title::after,
	.cs-subtitle::before {
		animation: none !important;
	}
}
</style>
