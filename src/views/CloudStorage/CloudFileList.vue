<template>
	<div class="cs-file-list">
		<div class="cs-file-header">
			<div class="cs-file-title">
				<div class="cs-file-icon-box">
					<svg viewBox="0 0 24 24" class="cs-file-icon" aria-hidden="true">
						<path
							d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						/>
					</svg>
				</div>
				<span>{{ t('cloudStorage.fileList.title') }}</span>
				<span v-if="bucketName && allItems.length" class="cs-file-count">{{ allItems.length }}</span>
			</div>
			<div class="cs-file-actions">
				<button
					v-if="bucketName && currentPrefix"
					class="cs-icon-btn"
					type="button"
					:title="t('cloudStorage.fileList.goBack')"
					@click="goBack"
				>
					<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
						<path d="M10.5 3.5L6 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
				<button
					v-if="bucketName"
					class="cs-btn cs-btn-ghost cs-new-folder-btn"
					type="button"
					:disabled="creatingFolder"
					@click="showNewFolder = !showNewFolder"
				>
					<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
						<path d="M2 5.5a1 1 0 0 1 1-1h3l2 2h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z" fill="none" stroke="currentColor" stroke-width="1.2" />
						<path d="M8 7v4M6 9h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
					</svg>
					{{ t('cloudStorage.fileList.newFolder') }}
				</button>
				<div class="cs-view-switch">
					<button
						class="cs-icon-btn"
						:class="{ active: viewMode === 'grid' }"
						type="button"
						:title="t('cloudStorage.fileList.gridView')"
						@click="viewMode = 'grid'"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
							<path
								d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.1"
							/>
						</svg>
					</button>
					<button
						class="cs-icon-btn"
						:class="{ active: viewMode === 'list' }"
						type="button"
						:title="t('cloudStorage.fileList.listView')"
						@click="viewMode = 'list'"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
							<path
								d="M2.5 3.5h3v3h-3zM2.5 7h3v3h-3zM2.5 10.5h3v3h-3zM7 4h7M7 8h7M7 12h7"
								fill="none"
								stroke="currentColor"
								stroke-width="1.1"
								stroke-linecap="round"
							/>
						</svg>
					</button>
				</div>
				<button class="cs-icon-btn" type="button" :title="t('cloudStorage.fileList.refresh')" @click="refresh">
					<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
						<path
							d="M13.5 8a5.5 5.5 0 1 1-1.3-3.6"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
						/>
						<path
							d="M10.7 2.7h3v3"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
						/>
					</svg>
				</button>
				<button v-if="bucketName" class="cs-btn cs-btn-primary cs-upload-btn" type="button" @click="triggerUpload">
					<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-btn-icon">
						<path d="M8 2.5v8M4.5 6L8 2.5 11.5 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
						<path d="M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
					</svg>
					{{ t('cloudStorage.fileList.upload') }}
				</button>
				<input
					ref="fileInputRef"
					type="file"
					class="cs-file-input"
					multiple
					@change="onFileSelected"
				/>
			</div>
		</div>

		<div v-if="bucketName" class="cs-breadcrumb-bar">
			<button class="cs-breadcrumb-item" :class="{ active: !currentPrefix }" type="button" @click="navigateTo('')">
				<svg viewBox="0 0 16 16" class="cs-bc-home-icon" aria-hidden="true">
					<path d="M2.5 8.5l5.5-5 5.5 5M4 7.5v5a.5.5 0 00.5.5h2v-3h3v3h2a.5.5 0 00.5-.5v-5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				{{ t('cloudStorage.fileList.breadcrumbRoot') }}
			</button>
			<template v-for="(segment, idx) in breadcrumbSegments" :key="idx">
				<span class="cs-bc-sep" aria-hidden="true">/</span>
				<button
					class="cs-breadcrumb-item"
					:class="{ active: idx === breadcrumbSegments.length - 1 }"
					type="button"
					@click="navigateTo(getBreadcrumbPrefix(idx))"
				>
					{{ segment }}
				</button>
			</template>
		</div>

		<div v-if="bucketName && !isPublic" class="cs-acl-warning">
			<div class="cs-acl-warn-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>
			<div class="cs-acl-warn-text">
				<strong>{{ t('cloudStorage.aclWarning.title') }}</strong>
				<span>{{ t('cloudStorage.aclWarning.description') }}</span>
			</div>
			<button class="cs-btn cs-btn-primary cs-acl-fix-btn" type="button" @click="emit('fix-acl')">
				{{ t('cloudStorage.aclWarning.fixButton') }}
			</button>
		</div>

		<div v-if="bucketName && showNewFolder" class="cs-new-folder-form">
			<div class="cs-nf-corners" aria-hidden="true">
				<span class="cs-nfc tl"></span>
				<span class="cs-nfc tr"></span>
				<span class="cs-nfc bl"></span>
				<span class="cs-nfc br"></span>
			</div>
			<svg viewBox="0 0 16 16" class="cs-nf-icon" aria-hidden="true">
				<path d="M2 5.5a1 1 0 0 1 1-1h3l2 2h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z" fill="none" stroke="currentColor" stroke-width="1.2" />
				<path d="M8 7v4M6 9h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
			</svg>
			<input
				ref="newFolderInputRef"
				v-model="newFolderName"
				type="text"
				class="cs-input cs-nf-input"
				:placeholder="t('cloudStorage.fileList.folderNamePlaceholder')"
				@keydown.enter="handleCreateFolder"
				@keydown.escape="cancelNewFolder"
			/>
			<button class="cs-btn cs-btn-primary cs-nf-btn" type="button" :disabled="creatingFolder" @click="handleCreateFolder">
				<span v-if="creatingFolder" class="cs-spinner"></span>
				{{ creatingFolder ? t('cloudStorage.fileList.creating') : t('cloudStorage.fileList.confirmCreate') }}
			</button>
			<button class="cs-btn cs-btn-ghost cs-nf-btn" type="button" @click="cancelNewFolder">
				{{ t('cloudStorage.fileList.cancel') }}
			</button>
		</div>

		<div class="cs-file-search" v-if="bucketName">
			<div class="cs-search-wrap">
				<svg viewBox="0 0 16 16" class="cs-search-icon" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
					<path d="M10.5 10.5L13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
				</svg>
				<input
					v-model="searchKeyword"
					class="cs-search-input"
					type="text"
					:placeholder="t('cloudStorage.fileList.searchPlaceholder')"
				/>
				<span class="cs-search-focus-line" aria-hidden="true"></span>
			</div>
		</div>

		<div ref="scrollBodyEl" class="cs-file-body">
			<div v-if="!connected" class="cs-empty-state">
				<div class="cs-empty-icon-wrap">
					<svg viewBox="0 0 48 48" class="cs-empty-icon" aria-hidden="true">
						<path
							d="M8 14a4 4 0 0 1 4-4h8l4 4h12a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V14z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-dasharray="3 3"
						/>
					</svg>
					<div class="cs-empty-icon-ring"></div>
				</div>
				<div class="cs-empty-text">{{ t('cloudStorage.fileList.notConfigured') }}</div>
			</div>

			<div v-else-if="!bucketName" class="cs-empty-state cs-no-bucket">
				<div class="cs-empty-icon-wrap">
					<svg viewBox="0 0 48 48" class="cs-empty-icon" aria-hidden="true">
						<path d="M8 16l4-4h8l4 4h12a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V16z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" />
						<path d="M18 28l4-4 4 4M22 24v8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						<path d="M30 30h4M30 34h2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
					<div class="cs-empty-icon-ring"></div>
					<div class="cs-empty-icon-glow"></div>
				</div>
				<div class="cs-empty-text cs-empty-text-accent">{{ t('cloudStorage.fileList.noBucket') }}</div>
				<div class="cs-empty-hint">{{ t('cloudStorage.fileList.noBucketHint') }}</div>
			</div>

			<div v-else-if="loading" class="cs-empty-state">
				<div class="cs-loading-wrap">
					<div class="cs-loading-ring"></div>
					<div class="cs-loading-spinner"></div>
				</div>
				<div class="cs-empty-text">{{ t('cloudStorage.fileList.loading') }}</div>
			</div>

			<div v-else-if="!filteredItems.length" class="cs-empty-state">
				<div class="cs-empty-icon-wrap">
					<svg viewBox="0 0 48 48" class="cs-empty-icon" aria-hidden="true">
						<path
							d="M8 14a4 4 0 0 1 4-4h8l4 4h12a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V14z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path d="M18 24l4 4 8-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<div class="cs-empty-icon-ring"></div>
				</div>
				<div class="cs-empty-text">{{ t('cloudStorage.fileList.empty') }}</div>
				<div class="cs-empty-hint">{{ t('cloudStorage.fileList.emptyHint') }}</div>
				<button class="cs-btn cs-btn-primary cs-upload-empty-btn" type="button" @click="triggerUpload">
					{{ t('cloudStorage.fileList.upload') }}
				</button>
			</div>

			<template v-else>
				<div v-if="viewMode === 'grid'" class="cs-file-grid">
					<div
						v-for="item in filteredItems"
						:key="item.key"
						class="cs-file-tile"
						:class="{ selected: selectedItem?.key === item.key, folder: item.isFolder }"
						@click="handleItemClick(item)"
						@dblclick="handleItemDblClick(item)"
					>
						<div class="cs-tile-corners" aria-hidden="true">
							<span class="cs-tc tl"></span>
							<span class="cs-tc tr"></span>
							<span class="cs-tc bl"></span>
							<span class="cs-tc br"></span>
						</div>
						<div class="cs-tile-glow" aria-hidden="true"></div>
						<div class="cs-tile-thumb">
							<div v-if="item.isFolder" class="cs-thumb-placeholder cs-folder-thumb">
								<svg viewBox="0 0 24 24" class="cs-thumb-icon cs-folder-icon" aria-hidden="true">
									<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2H19a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
								</svg>
							</div>
							<div v-else-if="isImage(item.name) && item.publicUrl && !hasImageError(item.key)" class="cs-thumb-preview">
								<img :src="item.publicUrl" :alt="item.name" class="cs-thumb-img" @error="handleImageError(item.key)" />
							</div>
							<div v-else-if="isImage(item.name) && hasImageError(item.key)" class="cs-thumb-error">
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
									<path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="1.5"/>
								</svg>
							</div>
							<div v-else class="cs-thumb-placeholder">
								<svg viewBox="0 0 24 24" class="cs-thumb-icon" aria-hidden="true">
									<path :d="getFileIconPath(item.name)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</div>
							<div v-if="!item.isFolder" class="cs-tile-overlay">
								<button
									class="cs-overlay-btn"
									type="button"
									:title="t('cloudStorage.fileList.copyUrl')"
									@click.stop="copyUrl(item)"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-overlay-icon">
										<path d="M6 4.5v-2a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
										<path d="M4.5 6.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.2" />
									</svg>
								</button>
								<button
									class="cs-overlay-btn danger"
									type="button"
									:title="t('cloudStorage.fileList.delete')"
									@click.stop="deleteItem(item)"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-overlay-icon">
										<path d="M6 2.8h4M3.4 4.4h9.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
										<path d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6" fill="none" stroke="currentColor" stroke-width="1.1" />
										<path d="M6.7 6.4v6.1M9.3 6.4v6.1" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
									</svg>
								</button>
							</div>
						</div>
						<div class="cs-tile-info">
							<div class="cs-tile-name" :title="item.name">{{ item.name }}</div>
							<div class="cs-tile-meta">
								<span v-if="item.isFolder" class="cs-tile-folder-hint">{{ t('cloudStorage.fileList.enterFolder') }}</span>
								<template v-else>
									<span class="cs-tile-size">{{ formatSize(item.size) }}</span>
									<span class="cs-tile-date">{{ formatDate(item.lastModified) }}</span>
								</template>
							</div>
						</div>
					</div>
				</div>

				<div v-else class="cs-file-list-view">
					<div class="cs-list-header">
						<div class="cs-list-h-name">{{ t('cloudStorage.fileList.colName') }}</div>
						<div class="cs-list-h-size">{{ t('cloudStorage.fileList.colSize') }}</div>
						<div class="cs-list-h-date">{{ t('cloudStorage.fileList.colDate') }}</div>
						<div class="cs-list-h-actions">{{ t('cloudStorage.fileList.colActions') }}</div>
					</div>
					<div
						v-for="item in filteredItems"
						:key="item.key"
						class="cs-list-row"
						:class="{ selected: selectedItem?.key === item.key, folder: item.isFolder }"
						@click="selectedItem = item"
						@dblclick="handleItemDblClick(item)"
					>
						<div class="cs-list-thumb-wrap">
							<div v-if="item.isFolder" class="cs-list-thumb-placeholder cs-folder-thumb-list">
								<svg viewBox="0 0 24 24" class="cs-list-thumb-icon cs-folder-icon" aria-hidden="true">
									<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2H19a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
								</svg>
							</div>
							<div v-else-if="isImage(item.name) && item.publicUrl && !hasImageError(item.key)" class="cs-list-thumb">
								<img :src="item.publicUrl" :alt="item.name" class="cs-list-thumb-img" @error="handleImageError(item.key)" />
							</div>
							<div v-else-if="isImage(item.name) && hasImageError(item.key)" class="cs-thumb-error" style="position:absolute;inset:0;">
								<svg viewBox="0 0 24 24" style="width:18px;height:18px;opacity:0.6;" aria-hidden="true">
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
									<path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="1.5"/>
								</svg>
							</div>
							<div v-else class="cs-list-thumb-placeholder">
								<svg viewBox="0 0 24 24" class="cs-list-thumb-icon" aria-hidden="true">
									<path :d="getFileIconPath(item.name)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</div>
						</div>
						<div class="cs-list-name" :title="item.name">{{ item.name }}</div>
						<div class="cs-list-size cs-mono">{{ item.isFolder ? '—' : formatSize(item.size) }}</div>
						<div class="cs-list-date cs-mono">{{ item.isFolder ? '—' : formatDate(item.lastModified) }}</div>
						<div class="cs-list-actions">
							<button
								v-if="!item.isFolder"
								class="cs-list-action-btn"
								type="button"
								:title="t('cloudStorage.fileList.copyUrl')"
								@click.stop="copyUrl(item)"
							>
								<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-list-action-icon">
									<path d="M6 4.5v-2a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
									<path d="M4.5 6.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.2" />
								</svg>
							</button>
							<button
								class="cs-list-action-btn danger"
								type="button"
								:title="t('cloudStorage.fileList.delete')"
								@click.stop="deleteItem(item)"
							>
								<svg viewBox="0 0 16 16" aria-hidden="true" class="cs-list-action-icon">
									<path d="M6 2.8h4M3.4 4.4h9.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
									<path d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6" fill="none" stroke="currentColor" stroke-width="1.1" />
								</svg>
							</button>
						</div>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface CloudFileItem {
	key: string
	name: string
	isFolder: boolean
	size: number
	lastModified: number
	publicUrl?: string
	contentType?: string
	etag?: string
}

const props = defineProps<{
	connected: boolean
	config?: any
	bucketName?: string
	currentPrefix?: string
	isPublic?: boolean
}>()

const emit = defineEmits<{
	(e: 'refresh'): void
	(e: 'upload', files: File[], prefix: string): void
	(e: 'delete', item: CloudFileItem): void
	(e: 'navigate', prefix: string): void
	(e: 'create-folder', folderName: string): void
	(e: 'fix-acl'): void
}>()

const isPublic = computed(() => Boolean(props.isPublic))

const viewMode = ref<'grid' | 'list'>('grid')
const searchKeyword = ref('')
const loading = ref(false)
const allItems = ref<CloudFileItem[]>([])
const selectedItem = ref<CloudFileItem | null>(null)
const scrollBodyEl = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const newFolderInputRef = ref<HTMLInputElement | null>(null)
const showNewFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)
const imageLoadErrors = ref<Set<string>>(new Set())

const currentPrefix = computed(() => props.currentPrefix || '')

const breadcrumbSegments = computed(() => {
	const prefix = currentPrefix.value
	if (!prefix) return []
	return prefix.split('/').filter(Boolean)
})

const getBreadcrumbPrefix = (index: number): string => {
	const segments = breadcrumbSegments.value
	if (index < 0 || index >= segments.length) return ''
	return segments.slice(0, index + 1).join('/') + '/'
}

const filteredItems = computed(() => {
	const kw = searchKeyword.value.trim().toLowerCase()
	if (!kw) return allItems.value
	return allItems.value.filter((f) => f.name.toLowerCase().includes(kw))
})

const navigateTo = (prefix: string) => {
	emit('navigate', prefix)
}

const goBack = () => {
	const segments = breadcrumbSegments.value
	if (segments.length <= 1) {
		navigateTo('')
	} else {
		navigateTo(getBreadcrumbPrefix(segments.length - 2))
	}
}

const handleItemClick = (item: CloudFileItem) => {
	selectedItem.value = item
}

const handleItemDblClick = (item: CloudFileItem) => {
	if (item.isFolder) {
		navigateTo(item.key)
	}
}

const refresh = async () => {
	if (!props.bucketName) {
		allItems.value = []
		return
	}
	loading.value = true
	imageLoadErrors.value.clear()
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.listFiles) {
			const result = await cloudfs.listFiles({ prefix: currentPrefix.value })
			console.log('[CloudFileList] listFiles result:', result)
			if (result?.ok && Array.isArray(result.items)) {
				allItems.value = result.items.map((item: any) => ({
					key: item.key || '',
					name: item.name || '',
					isFolder: Boolean(item.isFolder),
					size: Number(item.size) || 0,
					lastModified: Number(item.lastModified) || 0,
					publicUrl: item.publicUrl || '',
					contentType: item.contentType || '',
					etag: item.etag || ''
				}))
			} else if (result?.error) {
				console.error('[CloudFileList] listFiles error:', result.error)
				allItems.value = []
			} else {
				console.warn('[CloudFileList] listFiles returned unexpected result:', result)
				allItems.value = []
			}
		}
	} catch (err: any) {
		console.error('[CloudFileList] listFiles exception:', err)
		allItems.value = []
	} finally {
		loading.value = false
	}
}

const setFiles = (items: CloudFileItem[]) => {
	allItems.value = items
}

const triggerUpload = () => {
	fileInputRef.value?.click()
}

const onFileSelected = (event: Event) => {
	const input = event.target as HTMLInputElement
	const fileList = input.files
	if (!fileList || fileList.length === 0) return
	const selectedFiles = Array.from(fileList)
	emit('upload', selectedFiles, currentPrefix.value)
	input.value = ''
}

const copyUrl = async (item: CloudFileItem) => {
	const url = item.publicUrl
	if (!url) return
	try {
		await navigator.clipboard.writeText(url)
	} catch {
		const textarea = document.createElement('textarea')
		textarea.value = url
		document.body.appendChild(textarea)
		textarea.select()
		document.execCommand('copy')
		document.body.removeChild(textarea)
	}
}

const deleteItem = (item: CloudFileItem) => {
	emit('delete', item)
}

const handleCreateFolder = async () => {
	const name = newFolderName.value.trim()
	if (!name) return
	creatingFolder.value = true
	try {
		await emit('create-folder', name)
		showNewFolder.value = false
		newFolderName.value = ''
	} catch (err: any) {
		console.error('[CloudFileList] createFolder error:', err)
	} finally {
		creatingFolder.value = false
	}
}

const cancelNewFolder = () => {
	showNewFolder.value = false
	newFolderName.value = ''
}

watch(showNewFolder, async (val) => {
	if (val) {
		await nextTick()
		newFolderInputRef.value?.focus()
	}
})

watch(() => props.bucketName, async () => {
	searchKeyword.value = ''
	selectedItem.value = null
	await nextTick()
	refresh()
})

watch(() => props.currentPrefix, async () => {
	searchKeyword.value = ''
	selectedItem.value = null
	await nextTick()
	refresh()
})

const isImage = (name: string): boolean => {
	const ext = name.split('.').pop()?.toLowerCase()
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')
}

const handleImageError = (key: string) => {
	imageLoadErrors.value.add(key)
}

const hasImageError = (key: string): boolean => {
	return imageLoadErrors.value.has(key)
}

const getFileIconPath = (name: string): string => {
	const ext = name.split('.').pop()?.toLowerCase()
	if (isImage(name)) {
		return 'M3 5.5c0-.8.7-1.5 1.5-1.5h7c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5z M3 14.5l3-3 2 2 3-4 4 4'
	}
	if (['mp4', 'avi', 'mov', 'webm', 'mkv'].includes(ext || '')) {
		return 'M3 5.5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 12.5z M9.5 8l3.5-2v6l-3.5-2z'
	}
	if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext || '')) {
		return 'M9 3v10.5a2.5 2.5 0 1 1-2-2.45V5l7-1.5v8a2.5 2.5 0 1 1-2-2.45'
	}
	if (['pdf'].includes(ext || '')) {
		return 'M5 2.5h6.5L15 6v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V4A1.5 1.5 0 0 1 5 2.5z M11 3v3h3 M7 11h4M7 13h3'
	}
	return 'M3 5.5c0-.8.7-1.5 1.5-1.5h4.5l3 3H13c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5H4.5c-.8 0-1.5-.7-1.5-1.5v-10z'
}

const formatSize = (bytes: number): string => {
	if (!bytes || bytes <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

const formatDate = (ts: number | string | null | undefined): string => {
	const n = Number(ts)
	if (!Number.isFinite(n) || n <= 0) return ''
	const d = new Date(n)
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

defineExpose({
	refresh,
	setFiles
})
</script>

<style scoped>
.cs-file-list {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	color: var(--pl-fg);
	position: relative;
	z-index: 5;
}

.cs-file-header {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-accent) 10%, transparent), transparent);
	position: relative;
}

.cs-file-title {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg);
	letter-spacing: 0.5px;
}

.cs-file-icon-box {
	position: relative;
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.cs-file-icon-box::before {
	content: "";
	position: absolute;
	inset: 0;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 40%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
}

.cs-file-icon-box::after {
	content: "";
	position: absolute;
	inset: -3px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.cs-file-icon {
	width: 15px;
	height: 15px;
	color: var(--pl-accent);
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent));
	position: relative;
	z-index: 1;
}

.cs-file-count {
	font-size: 11px;
	font-weight: 400;
	color: var(--pl-accent);
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	padding: 2px 8px;
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	min-width: 24px;
	text-align: center;
}

.cs-file-actions {
	display: flex;
	gap: 8px;
	align-items: center;
}

.cs-view-switch {
	display: flex;
	gap: 1px;
	padding: 2px;
	background: color-mix(in srgb, #161d24 60%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.cs-icon-btn {
	border: none;
	background: transparent;
	color: var(--pl-fg-soft, #8a949c);
	width: 30px;
	height: 28px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transition: all 160ms ease;
	position: relative;
}

.cs-icon-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	color: var(--pl-fg);
}

.cs-icon-btn.active {
	background: color-mix(in srgb, var(--pl-accent) 18%, transparent);
	color: var(--pl-accent);
	box-shadow: inset 0 0 8px color-mix(in srgb, var(--pl-accent) 10%, transparent);
}

.cs-btn-icon {
	width: 14px;
	height: 14px;
}

.cs-btn {
	height: 30px;
	padding: 0 16px;
	font-size: 12px;
	font-weight: 500;
	font-family: inherit;
	cursor: pointer;
	transition: all 200ms ease;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, #161d24 40%, transparent);
	color: var(--pl-fg);
	position: relative;
	letter-spacing: 0.3px;
	overflow: hidden;
}

.cs-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.cs-btn-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-btn-c {
	position: absolute;
	width: 6px;
	height: 6px;
	border-color: var(--pl-accent);
	opacity: 0;
	transition: opacity 200ms ease;
}

.cs-btn:hover .cs-btn-c {
	opacity: 1;
}

.cs-btn-c.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-primary {
	background: linear-gradient(135deg, var(--pl-accent), color-mix(in srgb, var(--pl-accent) 75%, #4fb7c5));
	border-color: var(--pl-accent);
	color: #fff;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 28%, transparent);
}

.cs-btn-primary::before {
	content: "";
	position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 18%, transparent), transparent);
	transition: left 0.5s ease;
}

.cs-btn-primary:hover:not(:disabled)::before {
	left: 100%;
}

.cs-btn-primary:hover:not(:disabled) {
	filter: brightness(1.12);
	box-shadow: 0 0 22px color-mix(in srgb, var(--pl-accent) 38%, transparent);
}

.cs-btn-ghost:hover:not(:disabled) {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.cs-upload-btn {
	height: 28px;
	padding: 0 14px;
}

.cs-new-folder-btn {
	height: 28px;
	padding: 0 12px;
}

.cs-file-input {
	display: none;
}

.cs-breadcrumb-bar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 10px 20px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 10%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 4%, transparent);
	flex-wrap: wrap;
}

.cs-breadcrumb-item {
	border: none;
	background: transparent;
	color: var(--pl-fg-soft, #8a949c);
	font-size: 12px;
	font-family: inherit;
	cursor: pointer;
	padding: 4px 10px;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	transition: all 160ms ease;
	position: relative;
}

.cs-breadcrumb-item:hover {
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-breadcrumb-item.active {
	color: var(--pl-accent);
	font-weight: 500;
}

.cs-bc-home-icon {
	width: 13px;
	height: 13px;
}

.cs-bc-sep {
	color: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	font-size: 11px;
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	user-select: none;
}

.cs-acl-warning {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 20px;
	background: linear-gradient(90deg, color-mix(in srgb, #f59e0b 15%, transparent), color-mix(in srgb, #f59e0b 8%, transparent));
	border-bottom: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
	animation: cs-acl-slide 200ms ease;
}

@keyframes cs-acl-slide {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.cs-acl-warn-icon {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	color: #f59e0b;
	display: flex;
	align-items: center;
	justify-content: center;
	filter: drop-shadow(0 0 6px color-mix(in srgb, #f59e0b 40%, transparent));
}

.cs-acl-warn-icon svg {
	width: 20px;
	height: 20px;
}

.cs-acl-warn-text {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.cs-acl-warn-text strong {
	font-size: 12px;
	font-weight: 600;
	color: #f59e0b;
}

.cs-acl-warn-text span {
	font-size: 11px;
	color: color-mix(in srgb, #f59e0b 80%, var(--pl-fg-soft));
	line-height: 1.4;
}

.cs-acl-fix-btn {
	height: 28px;
	padding: 0 14px;
	font-size: 11px;
	flex-shrink: 0;
	background: linear-gradient(135deg, #f59e0b, #d97706);
	border-color: #f59e0b;
	box-shadow: 0 0 12px color-mix(in srgb, #f59e0b 30%, transparent);
}

.cs-acl-fix-btn:hover:not(:disabled) {
	filter: brightness(1.12);
	box-shadow: 0 0 18px color-mix(in srgb, #f59e0b 40%, transparent);
}

.cs-thumb-img, .cs-list-thumb-img {
	transition: opacity 200ms ease;
}

.cs-thumb-error {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, color-mix(in srgb, #ef4444 8%, #161d24), #161d24);
	color: #ef4444;
}

.cs-thumb-error svg {
	width: 32px;
	height: 32px;
	opacity: 0.6;
}

.cs-new-folder-form {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 20px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 12%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 5%, transparent);
	position: relative;
	animation: cs-nf-slide 200ms ease;
}

@keyframes cs-nf-slide {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.cs-nf-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-nfc {
	position: absolute;
	width: 6px;
	height: 6px;
}

.cs-nfc.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid var(--pl-accent);
	border-left: 1px solid var(--pl-accent);
}

.cs-nfc.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid var(--pl-accent);
	border-right: 1px solid var(--pl-accent);
}

.cs-nfc.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid var(--pl-accent);
	border-left: 1px solid var(--pl-accent);
}

.cs-nfc.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid var(--pl-accent);
	border-right: 1px solid var(--pl-accent);
}

.cs-nf-icon {
	width: 16px;
	height: 16px;
	color: var(--pl-accent);
	flex-shrink: 0;
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 40%, transparent));
}

.cs-input {
	height: 30px;
	padding: 0 12px;
	font-size: 12px;
	color: var(--pl-fg);
	background: color-mix(in srgb, #161d24 65%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	outline: none;
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
	font-family: inherit;
}

.cs-input::placeholder {
	color: #5c6670;
}

.cs-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	background: color-mix(in srgb, #161d24 80%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 20%, transparent),
		0 0 12px color-mix(in srgb, var(--pl-accent) 10%, transparent);
}

.cs-nf-input {
	flex: 1;
}

.cs-nf-btn {
	height: 30px;
	flex-shrink: 0;
}

.cs-spinner {
	width: 12px;
	height: 12px;
	border: 1.5px solid transparent;
	border-top-color: currentColor;
	border-radius: 50%;
	animation: cs-spin 0.7s linear infinite;
	position: relative;
	z-index: 1;
}

@keyframes cs-spin {
	to { transform: rotate(360deg); }
}

.cs-file-search {
	flex-shrink: 0;
	padding: 14px 20px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.cs-search-wrap {
	position: relative;
}

.cs-search-icon {
	position: absolute;
	left: 12px;
	top: 50%;
	transform: translateY(-50%);
	width: 13px;
	height: 13px;
	color: #5c6670;
	pointer-events: none;
	z-index: 1;
}

.cs-search-input {
	width: 100%;
	box-sizing: border-box;
	height: 34px;
	padding: 0 14px 0 34px;
	font-size: 12px;
	color: var(--pl-fg);
	background: color-mix(in srgb, #161d24 60%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	outline: none;
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
	font-family: inherit;
}

.cs-search-input::placeholder {
	color: #5c6670;
}

.cs-search-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
	background: color-mix(in srgb, #161d24 80%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 25%, transparent),
		0 0 16px color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.cs-search-focus-line {
	position: absolute;
	bottom: 0;
	left: 50%;
	width: 0;
	height: 1px;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	transition: width 200ms ease, left 200ms ease;
	pointer-events: none;
}

.cs-search-input:focus ~ .cs-search-focus-line {
	width: 100%;
	left: 0;
}

.cs-file-body {
	flex: 1;
	min-height: 0;
	padding: 18px 20px;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 35%, transparent) transparent;
}

.cs-file-body::-webkit-scrollbar {
	width: 5px;
}

.cs-file-body::-webkit-scrollbar-track {
	background: transparent;
}

.cs-file-body::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 35%, transparent);
	border-radius: 2px;
}

.cs-empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 60px 20px;
	color: var(--pl-fg-soft, #8a949c);
	height: 100%;
	min-height: 280px;
}

.cs-empty-icon-wrap {
	position: relative;
	margin-bottom: 20px;
}

.cs-empty-icon {
	width: 64px;
	height: 64px;
	opacity: 0.35;
	position: relative;
	z-index: 1;
}

.cs-empty-icon-ring {
	position: absolute;
	inset: -12px;
	border: 1px dashed color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-radius: 50%;
	animation: cs-ring-rotate 20s linear infinite;
}

.cs-empty-icon-glow {
	position: absolute;
	inset: -20px;
	background: radial-gradient(circle, color-mix(in srgb, var(--pl-accent) 12%, transparent), transparent 70%);
	pointer-events: none;
}

@keyframes cs-ring-rotate {
	to { transform: rotate(360deg); }
}

.cs-empty-text {
	font-size: 14px;
	font-weight: 500;
	color: var(--pl-fg);
	margin-bottom: 6px;
}

.cs-empty-text-accent {
	color: var(--pl-accent);
	text-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-empty-hint {
	font-size: 12px;
	color: #5c6670;
	margin-bottom: 20px;
	text-align: center;
	max-width: 320px;
	line-height: 1.6;
}

.cs-create-bucket-btn,
.cs-upload-empty-btn {
	height: 36px;
	padding: 0 24px;
	font-size: 13px;
}

.cs-upload-empty-btn {
	margin-top: 4px;
}

.cs-loading-wrap {
	position: relative;
	width: 48px;
	height: 48px;
	margin-bottom: 16px;
}

.cs-loading-ring {
	position: absolute;
	inset: 0;
	border: 2px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	border-radius: 50%;
}

.cs-loading-spinner {
	position: absolute;
	inset: 0;
	border: 2px solid transparent;
	border-top-color: var(--pl-accent);
	border-right-color: var(--pl-accent);
	border-radius: 50%;
	animation: cs-file-spin 0.8s linear infinite;
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

@keyframes cs-file-spin {
	to {
		transform: rotate(360deg);
	}
}

.cs-file-grid {
	display: grid;
	gap: 14px;
	grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
	align-content: start;
}

.cs-file-tile {
	position: relative;
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 70%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 85%, transparent)
	);
	overflow: hidden;
	cursor: pointer;
	animation: cs-tile-in 200ms ease;
	transition: all 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.cs-file-tile:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
	transform: translateY(-3px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4),
		0 0 16px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-file-tile.selected {
	border-color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 45%, transparent),
		0 0 20px color-mix(in srgb, var(--pl-accent) 22%, transparent);
}

.cs-file-tile.folder {
	cursor: pointer;
}

.cs-tile-corners {
	position: absolute;
	inset: 0;
	z-index: 10;
	pointer-events: none;
}

.cs-tc {
	position: absolute;
	width: 0;
	height: 0;
	border-color: var(--pl-accent);
	transition: width 180ms ease, height 180ms ease;
}

.cs-file-tile:hover .cs-tc,
.cs-file-tile.selected .cs-tc {
	width: 10px;
	height: 10px;
}

.cs-tc.tl {
	top: 3px;
	left: 3px;
	border-top: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.cs-tc.tr {
	top: 3px;
	right: 3px;
	border-top: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.cs-tc.bl {
	bottom: 3px;
	left: 3px;
	border-bottom: 1.5px solid currentColor;
	border-left: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.cs-tc.br {
	bottom: 3px;
	right: 3px;
	border-bottom: 1.5px solid currentColor;
	border-right: 1.5px solid currentColor;
	color: var(--pl-accent);
}

.cs-tile-glow {
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
	transition: opacity 280ms ease;
}

.cs-file-tile:hover .cs-tile-glow {
	opacity: 1;
}

@keyframes cs-tile-in {
	from {
		opacity: 0;
		transform: translateY(6px) scale(0.97);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

.cs-tile-thumb {
	position: relative;
	width: 100%;
	aspect-ratio: 1 / 1;
	background: #161d24;
	overflow: hidden;
}

.cs-thumb-preview {
	width: 100%;
	height: 100%;
}

.cs-thumb-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.cs-thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--pl-fg-soft, #8a949c);
	background: linear-gradient(135deg, #161d24, color-mix(in srgb, var(--pl-bg-1) 80%, #161d24));
}

.cs-folder-thumb {
	background: linear-gradient(135deg, color-mix(in srgb, var(--pl-accent) 12%, #161d24), #161d24);
}

.cs-folder-icon {
	color: var(--pl-accent) !important;
	filter: drop-shadow(0 0 10px color-mix(in srgb, var(--pl-accent) 30%, transparent)) !important;
	opacity: 0.9 !important;
}

.cs-thumb-icon {
	width: 48px;
	height: 48px;
	opacity: 0.6;
	filter: drop-shadow(0 0 8px color-mix(in srgb, var(--pl-accent) 20%, transparent));
}

.cs-tile-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	opacity: 0;
	transition: opacity 180ms ease;
	background: color-mix(in srgb, var(--pl-bg-0) 70%, transparent);
	backdrop-filter: blur(2px);
	pointer-events: none;
}

.cs-file-tile:hover .cs-tile-overlay {
	opacity: 1;
}

.cs-overlay-btn {
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 90%, transparent);
	color: var(--pl-fg);
	width: 34px;
	height: 34px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	pointer-events: auto;
	transition: all 160ms ease;
	position: relative;
}

.cs-overlay-btn::before,
.cs-overlay-btn::after {
	content: "";
	position: absolute;
	width: 0;
	height: 0;
	border-color: var(--pl-accent);
	transition: width 120ms ease, height 120ms ease;
}

.cs-overlay-btn::before {
	top: 1px;
	left: 1px;
	border-top: 1px solid var(--pl-accent);
	border-left: 1px solid var(--pl-accent);
}

.cs-overlay-btn::after {
	bottom: 1px;
	right: 1px;
	border-bottom: 1px solid var(--pl-accent);
	border-right: 1px solid var(--pl-accent);
}

.cs-overlay-btn:hover {
	border-color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 15%, transparent);
	color: var(--pl-accent);
	transform: scale(1.1);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.cs-overlay-btn:hover::before,
.cs-overlay-btn:hover::after {
	width: 8px;
	height: 8px;
}

.cs-overlay-btn.danger:hover {
	border-color: #f87171;
	background: color-mix(in srgb, #f87171 15%, transparent);
	color: #f87171;
	box-shadow: 0 0 14px color-mix(in srgb, #f87171 30%, transparent);
}

.cs-overlay-btn.danger:hover::before,
.cs-overlay-btn.danger:hover::after {
	border-color: #f87171;
}

.cs-overlay-icon {
	width: 14px;
	height: 14px;
}

.cs-tile-info {
	padding: 12px 14px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex-shrink: 0;
}

.cs-tile-name {
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}

.cs-tile-meta {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 10px;
	color: #5c6670;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cs-tile-folder-hint {
	color: var(--pl-accent);
	font-size: 10px;
	opacity: 0.8;
}

.cs-file-list-view {
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	overflow: hidden;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 60%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 80%, transparent)
	);
}

.cs-list-header {
	display: flex;
	align-items: center;
	padding: 12px 16px;
	font-size: 10px;
	color: var(--pl-accent);
	text-transform: uppercase;
	letter-spacing: 1px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	flex-shrink: 0;
	gap: 12px;
	position: sticky;
	top: 0;
	z-index: 2;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cs-list-h-name {
	flex: 1;
	min-width: 0;
	padding-left: 56px;
}
.cs-list-h-size {
	width: 80px;
	flex-shrink: 0;
}
.cs-list-h-date {
	width: 100px;
	flex-shrink: 0;
}
.cs-list-h-actions {
	width: 80px;
	flex-shrink: 0;
	text-align: right;
}

.cs-list-row {
	display: flex;
	align-items: center;
	padding: 10px 16px;
	gap: 12px;
	border-bottom: 1px solid color-mix(in srgb, color-mix(in srgb, var(--pl-accent) 35%, transparent) 40%, transparent);
	transition: all 160ms ease;
	cursor: pointer;
	position: relative;
}

.cs-list-row::before {
	content: "";
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 2px;
	background: var(--pl-accent);
	transform: scaleY(0);
	transition: transform 160ms ease;
	box-shadow: 0 0 8px var(--pl-accent);
}

.cs-list-row:last-child {
	border-bottom: none;
}

.cs-list-row:hover {
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-list-row:hover::before,
.cs-list-row.selected::before {
	transform: scaleY(1);
}

.cs-list-row.selected {
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.cs-list-row.folder {
	cursor: pointer;
}

.cs-list-thumb-wrap {
	position: relative;
	width: 40px;
	height: 40px;
	flex-shrink: 0;
	overflow: hidden;
	background: #161d24;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.cs-list-thumb {
	width: 100%;
	height: 100%;
}

.cs-list-thumb-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.cs-list-thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--pl-fg-soft, #8a949c);
}

.cs-folder-thumb-list {
	background: linear-gradient(135deg, color-mix(in srgb, var(--pl-accent) 10%, #161d24), #161d24);
}

.cs-list-thumb-icon {
	width: 22px;
	height: 22px;
	opacity: 0.7;
}

.cs-list-name {
	flex: 1;
	min-width: 0;
	font-size: 12px;
	color: var(--pl-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.cs-list-size {
	width: 80px;
	flex-shrink: 0;
	font-size: 11px;
	color: var(--pl-fg-soft, #8a949c);
}

.cs-list-date {
	width: 100px;
	flex-shrink: 0;
	font-size: 11px;
	color: var(--pl-fg-soft, #8a949c);
}

.cs-mono {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cs-list-actions {
	width: 80px;
	flex-shrink: 0;
	display: flex;
	gap: 6px;
	justify-content: flex-end;
	opacity: 0;
	transition: opacity 160ms ease;
}

.cs-list-row:hover .cs-list-actions {
	opacity: 1;
}

.cs-list-action-btn {
	width: 28px;
	height: 28px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 80%, transparent);
	color: var(--pl-fg-soft, #8a949c);
	cursor: pointer;
	font-size: 11px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 140ms ease;
}

.cs-list-action-btn:hover {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-list-action-btn.danger:hover {
	border-color: #f87171;
	color: #f87171;
	background: color-mix(in srgb, #f87171 12%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #f87171 20%, transparent);
}

.cs-list-action-icon {
	width: 13px;
	height: 13px;
}
</style>
