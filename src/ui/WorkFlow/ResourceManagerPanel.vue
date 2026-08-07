<template>
	<div class="wf-resource-panel">
		<div class="wf-resource-header">
			<div class="wf-resource-title">{{ t('resources.panel.title') }}</div>
			<div class="wf-resource-actions">
				<div class="wf-resource-storage-switch">
					<button
						class="wf-resource-storage-btn"
						:class="{ active: storageMode === 'local' }"
						type="button"
						:title="t('resources.panel.localStorage')"
						@click="storageMode = 'local'"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
							<path
								d="M2 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
							/>
							<path d="M2 7h12" fill="none" stroke="currentColor" stroke-width="1.2" />
						</svg>
						{{ t('resources.panel.local') }}
					</button>
					<button
						class="wf-resource-storage-btn"
						:class="{ active: storageMode === 'cloud' }"
						type="button"
						:title="t('resources.panel.cloudStorage')"
						@click="storageMode = 'cloud'"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
							<path
								d="M4.5 12.5a3 3 0 0 1-.8-5.9 4 4 0 0 1 7.6-1.6 3 3 0 0 1 .4 5.9"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
						</svg>
						{{ t('resources.panel.cloud') }}
					</button>
				</div>
				<template v-if="storageMode === 'local'">
					<div class="wf-resource-view-switch">
						<button
							class="wf-resource-icon-btn"
							:class="{ active: viewMode === 'grid' }"
							type="button"
							:title="t('resources.panel.gridViewTitle')"
							@click="viewMode = 'grid'"
						>
							<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
								<path
									d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z"
									fill="none"
									stroke="currentColor"
									stroke-width="1.1"
								/>
							</svg>
						</button>
						<button
							class="wf-resource-icon-btn"
							:class="{ active: viewMode === 'list' }"
							type="button"
							:title="t('resources.panel.listViewTitle')"
							@click="viewMode = 'list'"
						>
							<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
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
					<button
						v-if="viewMode === 'grid'"
						class="wf-resource-icon-btn"
						type="button"
						:title="thumbSizeTitle"
						@click="toggleThumbSize"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
							<path
								d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.1"
							/>
							<path
								v-if="thumbSize === 'lg'"
								d="M3.4 4.4h3.2v3.2H3.4z"
								fill="currentColor"
								opacity="0.25"
							/>
						</svg>
					</button>
					<button
						class="wf-resource-icon-btn"
						type="button"
						:title="t('resources.panel.refreshTitle')"
						@click="emitRefreshMissing"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
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
					<button
						class="wf-resource-icon-btn"
						type="button"
						:title="sortModeTitle"
						@click="cycleSortMode"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
							<path
								d="M4 3h8M4 6h6M4 9h4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
							<path
								v-if="sortMode === 'date-asc' || sortMode === 'name-asc'"
								d="M12 13l-2-2h4z"
								fill="currentColor"
							/>
							<path v-else d="M12 11l-2 2h4z" fill="currentColor" />
						</svg>
					</button>
				</template>
				<button
					class="wf-resource-btn"
					type="button"
					:title="t('resources.panel.close')"
					@click="emit('close')"
				>
					x
				</button>
			</div>
		</div>
		<div ref="scrollBodyEl" class="wf-resource-body">
			<template v-if="storageMode === 'cloud'">
				<div v-if="!cloudConnected" class="wf-cloud-setup">
					<svg viewBox="0 0 48 48" class="wf-cloud-setup-icon" aria-hidden="true">
						<path
							d="M14 37a8 8 0 0 1-2-15.7 11 11 0 0 1 20.8-4.4 8 8 0 0 1 1.2 15.9"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
						<path
							d="M24 22v8M24 34v.5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					<div class="wf-cloud-setup-title">{{ t('resources.panel.cloudNotConfigured') }}</div>
					<div class="wf-cloud-setup-desc">{{ t('resources.panel.cloudSetupDesc') }}</div>
					<button class="wf-cloud-setup-btn" type="button" @click="goToCloudSettings">
						{{ t('resources.panel.goToCloudSettings') }}
					</button>
				</div>
				<CloudFileList
					v-else
					ref="cloudFileListRef"
					:connected="cloudConnected"
					:config="cloudConfig"
					class="wf-cloud-file-list"
					@refresh="onCloudRefresh"
					@upload="onCloudUpload"
					@delete="onCloudDelete"
				/>
			</template>

			<template v-else>
				<!-- 筛选 + 搜索栏 -->
				<div v-if="resources.length" class="wf-resource-filter-bar">
					<div class="wf-resource-filter-group">
						<button
							class="wf-resource-filter-btn"
							:class="{ active: filterMode === 'all' }"
							@click="onFilterChange('all')"
							:title="t('resources.panel.filterAllTitle')"
						>
							{{ t('resources.panel.filterAll') }}
							<span class="wf-resource-filter-num">({{ counts.total }})</span>
						</button>
						<button
							class="wf-resource-filter-btn"
							:class="{ active: filterMode === 'used' }"
							@click="onFilterChange('used')"
							:title="t('resources.panel.filterUsedTitle')"
						>
							{{ t('resources.panel.filterUsed') }}
							<span class="wf-resource-filter-num">({{ counts.used }})</span>
						</button>
						<button
							class="wf-resource-filter-btn"
							:class="{ active: filterMode === 'unused' }"
							@click="onFilterChange('unused')"
							:title="t('resources.panel.filterUnusedTitle')"
						>
							{{ t('resources.panel.filterUnused') }}
							<span class="wf-resource-filter-num">({{ counts.unused }})</span>
						</button>
					</div>
					<div class="wf-resource-filter-divider" />
					<div class="wf-resource-type-group">
						<button
							v-for="tk in typeFilters"
							:key="tk.key"
							class="wf-resource-type-btn"
							:class="{ active: typeFilter === tk.key }"
							:title="tk.label"
							@click="typeFilter = typeFilter === tk.key ? null : tk.key"
						>
							{{ tk.shortLabel }}
						</button>
					</div>
					<div class="wf-resource-search-wrap">
						<svg viewBox="0 0 16 16" class="wf-resource-search-icon" aria-hidden="true">
							<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
							<path
								d="M10.5 10.5L13 13"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
						</svg>
						<input
							v-model="searchKeyword"
							class="wf-resource-search-input"
							type="text"
							:placeholder="t('resources.panel.searchPlaceholder')"
						/>
					</div>
				</div>

				<div v-if="!resources.length" class="wf-resource-empty">
					{{ t('resources.panel.empty') }}
				</div>
				<div v-else class="wf-resource-stats">
					{{ t('resources.panel.statsTotal', { total: counts.total }) }} ·
					{{ t('resources.panel.statsUsed', { used: counts.used }) }} ·
					{{ t('resources.panel.statsUnused', { unused: counts.unused }) }}
					<template v-if="visibleCount < sortedResources.length">
						·
						{{
							t('resources.panel.statsVisible', {
								visible: visibleCount,
								total: sortedResources.length
							})
						}}
					</template>
				</div>

				<!-- 网格视图 -->
				<div
					v-if="resources.length && viewMode === 'grid'"
					class="wf-resource-grid"
					:class="[thumbSize === 'lg' ? 'thumb-lg' : 'thumb-sm', { reflowing: gridReflowing }]"
				>
					<div
						v-for="r in visibleResources"
						:key="`${String(r.id)}:${layoutEpoch}`"
						class="wf-resource-tile"
						:class="isResourceUsed(r.id) ? 'is-used' : 'is-unused'"
						draggable="true"
						@dragstart="onTileDragStart($event, r)"
					>
						<div class="wf-resource-tile__thumb-area">
							<div
								v-if="isResourceUsed(r.id)"
								class="wf-resource-used-badge"
								:title="getUsageSummary(r.id)"
							>
								✔ {{ getUsageCount(r.id) }}
							</div>
							<div
								v-else
								class="wf-resource-unused-badge"
								:title="t('resources.panel.unreferencedInBlueprint')"
							>
								{{ t('resources.panel.unusedBadge') }}
							</div>

							<img
								v-if="thumbSrc(r) && !hasThumbFailed(String(r.id))"
								class="wf-resource-thumb"
								:src="thumbSrc(r)"
								:alt="r.name"
								loading="lazy"
								draggable="false"
								data-rm-thumb="1"
								@error.prevent.stop="onThumbErrorWithEvent($event, String(r.id))"
							/>
							<div v-else class="wf-resource-thumb-placeholder">
								<svg
									viewBox="0 0 24 24"
									class="wf-resource-thumb-placeholder-icon"
									aria-hidden="true"
								>
									<path
										:d="resourceKindIconPath(r.kind)"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>

							<div class="wf-resource-overlay">
								<button
									class="wf-resource-overlay-btn"
									type="button"
									:title="t('resources.panel.preview')"
									@click.stop="emit('preview', String(r.id))"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
										<path
											d="M8 3c-3.2 0-5.8 2.3-7 5 1.2 2.7 3.8 5 7 5s5.8-2.3 7-5c-1.2-2.7-3.8-5-7-5z"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
										<circle cx="8" cy="8" r="1.9" fill="currentColor" opacity="0.9" />
									</svg>
								</button>
								<button
									class="wf-resource-overlay-btn"
									type="button"
									:title="t('resources.panel.addToBlueprint')"
									@click.stop="emit('drop-to-node', String(r.id))"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
										<rect
											x="2.5"
											y="2.5"
											width="4"
											height="4"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
										<rect
											x="9.5"
											y="2.5"
											width="4"
											height="4"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
										<rect
											x="2.5"
											y="9.5"
											width="4"
											height="4"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
										<path
											d="M11 9.5v4M9 11.5h4"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
									</svg>
								</button>
								<button
									v-if="isResourceUsed(r.id)"
									class="wf-resource-overlay-btn wf-resource-overlay-btn--focus"
									type="button"
									:title="getFocusTooltip(r.id)"
									@click.stop="onFocusResourceClick(r)"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
										<path
											d="M2 8h3M11 8h3M8 2v3M8 11v3"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
										<circle
											cx="8"
											cy="8"
											r="2.5"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
									</svg>
								</button>
								<button
									class="wf-resource-overlay-btn danger"
									type="button"
									:title="
										isResourceUsed(r.id)
											? t('resources.panel.deleteUsedWarning')
											: t('resources.panel.delete')
									"
									@click.stop="onRemoveClick(String(r.id))"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
										<path
											d="M6 2.8h4M3.4 4.4h9.2"
											fill="none"
											stroke="currentColor"
											stroke-width="1.2"
											stroke-linecap="round"
										/>
										<path
											d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
										/>
										<path
											d="M6.7 6.4v6.1M9.3 6.4v6.1"
											fill="none"
											stroke="currentColor"
											stroke-width="1.1"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							</div>
						</div>

						<div class="wf-resource-tile__info">
							<div class="wf-resource-tile__name" :title="r.name || ''">
								{{ r.name || t('resources.panel.unnamedResource') }}
							</div>
							<div class="wf-resource-tile__meta-row">
								<span class="wf-resource-tile__kind" :data-kind="r.kind">
									{{ resourceKindLabel(r.kind) }}
								</span>
								<span v-if="isResourceUsed(r.id)" class="wf-resource-tile__usage">
									{{ t('resources.panel.nodeCount', { count: getUsageCount(r.id) }) }}
								</span>
								<span v-else class="wf-resource-tile__unused">
									{{ t('resources.panel.unreferenced') }}
								</span>
							</div>
							<div class="wf-resource-tile__date">{{ formatDate(r.createdAt) }}</div>
						</div>
					</div>

					<div ref="gridSentinelEl" class="wf-resource-sentinel" />
				</div>

				<!-- 列表视图 -->
				<div v-if="resources.length && viewMode === 'list'" class="wf-resource-list">
					<div class="wf-resource-list__header">
						<div class="wf-resource-list__h-name">{{ t('resources.panel.colName') }}</div>
						<div class="wf-resource-list__h-kind">{{ t('resources.panel.colType') }}</div>
						<div class="wf-resource-list__h-usage">{{ t('resources.panel.colUsage') }}</div>
						<div class="wf-resource-list__h-date">{{ t('resources.panel.colDate') }}</div>
						<div class="wf-resource-list__h-actions">{{ t('resources.panel.colActions') }}</div>
					</div>
					<div
						v-for="r in visibleResources"
						:key="`list-${String(r.id)}`"
						class="wf-resource-list__row"
						:class="isResourceUsed(r.id) ? 'is-used' : 'is-unused'"
						draggable="true"
						@dragstart="onTileDragStart($event, r)"
					>
						<div class="wf-resource-list__thumb-wrap">
							<button
								v-if="isResourceUsed(r.id)"
								class="wf-resource-list__thumb-focus"
								type="button"
								:title="getFocusTooltip(r.id)"
								@click.stop="onFocusResourceClick(r)"
							>
								<svg
									viewBox="0 0 16 16"
									aria-hidden="true"
									class="wf-resource-list__thumb-focus-icon"
								>
									<path
										d="M2 8h3M11 8h3M8 2v3M8 11v3"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
									/>
									<circle
										cx="8"
										cy="8"
										r="2.2"
										fill="none"
										stroke="currentColor"
										stroke-width="1.2"
									/>
								</svg>
							</button>
							<img
								v-if="thumbSrc(r) && !hasThumbFailed(String(r.id))"
								class="wf-resource-list__thumb"
								:src="thumbSrc(r)"
								:alt="r.name"
								loading="lazy"
								draggable="false"
								data-rm-thumb="1"
								@error.prevent.stop="onThumbErrorWithEvent($event, String(r.id))"
							/>
							<div v-else class="wf-resource-list__thumb-placeholder">
								<svg
									viewBox="0 0 24 24"
									class="wf-resource-list__thumb-placeholder-icon"
									aria-hidden="true"
								>
									<path
										:d="resourceKindIconPath(r.kind)"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>
							<span v-if="isResourceUsed(r.id)" class="wf-resource-list__badge is-used">
								✔ {{ getUsageCount(r.id) }}
							</span>
							<span v-else class="wf-resource-list__badge is-unused">
								{{ t('resources.panel.unusedBadge') }}
							</span>
						</div>
						<div class="wf-resource-list__name" :title="r.name || ''">
							{{ r.name || t('resources.panel.unnamedResource') }}
						</div>
						<div class="wf-resource-list__kind">
							<span class="wf-resource-list__kind-tag" :data-kind="r.kind">
								{{ resourceKindLabel(r.kind) }}
							</span>
						</div>
						<div class="wf-resource-list__usage">
							<template
								v-if="isResourceUsed(r.id) && getUsageInfoForResource(r.id)?.usedBy?.length"
							>
								<button
									class="wf-resource-list__node-link"
									type="button"
									:title="
										t('resources.panel.locateToNodeTitle', {
											nodeTitle: getUsageInfoForResource(r.id)!.usedBy[0].nodeTitle
										})
									"
									@click.stop="onFocusResourceClick(r)"
								>
									{{ getUsageInfoForResource(r.id)!.usedBy[0].nodeTitle }}
								</button>
								<span v-if="getUsageCount(r.id) > 1" class="wf-resource-list__more">
									+{{ getUsageCount(r.id) - 1 }}
								</span>
							</template>
							<span v-else class="wf-resource-list__unused-text">
								{{ t('resources.panel.unreferenced') }}
							</span>
						</div>
						<div class="wf-resource-list__date">{{ formatDate(r.createdAt) }}</div>
						<div class="wf-resource-list__actions">
							<button
								class="wf-resource-list__action-btn"
								type="button"
								:title="t('resources.panel.preview')"
								@click.stop="emit('preview', String(r.id))"
							>
								👁
							</button>
							<button
								v-if="isResourceUsed(r.id)"
								class="wf-resource-list__action-btn"
								type="button"
								:title="t('resources.panel.locateNode')"
								@click.stop="onFocusResourceClick(r)"
							>
								◎
							</button>
							<button
								class="wf-resource-list__action-btn danger"
								type="button"
								:title="
									isResourceUsed(r.id)
										? t('resources.panel.deleteUsedWarning')
										: t('resources.panel.delete')
								"
								@click.stop="onRemoveClick(String(r.id))"
							>
								✕
							</button>
						</div>
					</div>
					<div ref="listSentinelEl" class="wf-resource-sentinel" />
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { WorkflowResource } from '../../aiworkflow/resource/types'
import type { WorkflowNode } from '../../aiworkflow/types'
import { sanitizeWorkflowMediaUrl } from '../../aiworkflow/domain/resource/safeWorkflowUrl'
import {
	analyzeResourceUsage,
	computeUsageCounts,
	getUsageInfo
} from '../../aiworkflow/resource/usage'
import { useI18n } from '../../i18n'
import CloudFileList from '../../views/CloudStorage/CloudFileList.vue'
import {
	isStaticAssetResource,
	isThumbUrlWarmupArtifact
} from '../../views/AIWorkflow/assets/useAIWorkflowResourceUrlClassifier'

const { t } = useI18n()
const router = useRouter()

const props = defineProps<{
	open?: boolean
	resources: WorkflowResource[]
	nodesById?: Record<string, WorkflowNode>
	nodeOrder?: string[]
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'remove', resourceId: string): void
	(
		e: 'remove-with-warning',
		payload: {
			resourceId: string
			usedBy: Array<{ nodeId: string; nodeTitle: string; nodeType: string; description?: string }>
		}
	): void
	(e: 'preview', resourceId: string): void
	(e: 'refresh-missing', resourceIds: string[]): void
	(e: 'drop-to-node', resourceId: string): void
	(e: 'focus-node', payload: { nodeId: string }): void
}>()

type StorageMode = 'local' | 'cloud'
const storageMode = ref<StorageMode>('local')
const cloudFileListRef = ref<InstanceType<typeof CloudFileList> | null>(null)
const cloudConnected = ref(false)
const cloudConfig = ref<any>(null)
const cloudChecking = ref(false)

const checkCloudConfig = async () => {
	cloudChecking.value = true
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.getConfig) {
			const config = await cloudfs.getConfig()
			if (config && config.connected) {
				cloudConfig.value = config
				cloudConnected.value = true
			} else {
				cloudConnected.value = false
				cloudConfig.value = null
			}
		} else {
			cloudConnected.value = false
			cloudConfig.value = null
		}
	} catch {
		cloudConnected.value = false
		cloudConfig.value = null
	} finally {
		cloudChecking.value = false
	}
}

const goToCloudSettings = () => {
	router.push({ name: 'CloudStorage' })
}

const onCloudRefresh = () => {}

const onCloudUpload = async (files: File[]) => {
	if (!cloudConfig.value || !files.length) return
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.uploadFiles) {
			for (const file of files) {
				if (cloudfs.uploadFile) {
					await cloudfs.uploadFile(cloudConfig.value, file)
				}
			}
		}
		if (cloudFileListRef.value) {
			await cloudFileListRef.value.refresh()
		}
	} catch {}
}

const onCloudDelete = async (file: any) => {
	if (!cloudConfig.value) return
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (cloudfs?.deleteFile) {
			await cloudfs.deleteFile(cloudConfig.value, file.key)
		}
		if (cloudFileListRef.value) {
			await cloudFileListRef.value.refresh()
		}
	} catch {}
}

watch(storageMode, (mode) => {
	if (mode === 'cloud') {
		checkCloudConfig()
	}
})

type FilterMode = 'all' | 'used' | 'unused'
const filterMode = ref<FilterMode>('all')

const searchKeyword = ref('')
const typeFilter = ref<string | null>(null)

const typeFilters = computed(() => [
	{
		key: 'image',
		label: t('resources.panel.typeImage'),
		shortLabel: t('resources.panel.typeImageShort')
	},
	{
		key: 'video',
		label: t('resources.panel.typeVideo'),
		shortLabel: t('resources.panel.typeVideoShort')
	},
	{
		key: 'model3d',
		label: t('resources.panel.typeModel3d'),
		shortLabel: t('resources.panel.typeModel3dShort')
	}
])

const onFilterChange = (m: FilterMode) => {
	if (filterMode.value === m) return
	filterMode.value = m
	resetPaging()
	scheduleFillVisibleCapacity()
}

// 计算资源使用地图
const usageMap = computed(() =>
	analyzeResourceUsage(
		props.resources ?? [],
		props.nodesById ?? ({} as Record<string, WorkflowNode>),
		props.nodeOrder ?? []
	)
)

const counts = computed(() => computeUsageCounts(usageMap.value))

const isResourceUsed = (rid: string): boolean => {
	const info = getUsageInfo(usageMap.value, rid)
	return info?.isUsed ?? false
}

const getUsageCount = (rid: string): number => {
	const info = getUsageInfo(usageMap.value, rid)
	return info?.usageCount ?? 0
}

const getUsageInfoForResource = (rid: string) => {
	return getUsageInfo(usageMap.value, rid)
}

const getUsageSummary = (rid: string): string => {
	const info = getUsageInfo(usageMap.value, rid)
	if (!info || !info.isUsed) return t('resources.panel.notUsed')
	const refs = info.usedBy.slice(0, 5).map((u) => `· ${u.nodeTitle} (${u.nodeType})`)
	const head = t('resources.panel.usedByNodes', { count: info.usageCount }) + '\n'
	const tail =
		info.usedBy.length > 5
			? `\n` + t('resources.panel.moreNodes', { count: info.usedBy.length - 5 })
			: ''
	return head + refs.join('\n') + tail
}

const onRemoveClick = (rid: string) => {
	const info = getUsageInfo(usageMap.value, rid)
	if (info?.isUsed) {
		emit('remove-with-warning', {
			resourceId: rid,
			usedBy: info.usedBy.map((u) => ({
				nodeId: u.nodeId,
				nodeTitle: u.nodeTitle,
				nodeType: u.nodeType,
				description: u.description
			}))
		})
	} else {
		emit('remove', rid)
	}
}

const onFocusResourceClick = (r: WorkflowResource) => {
	const rid = String(r?.id ?? '').trim()
	const info = getUsageInfo(usageMap.value, rid)
	if (!info?.isUsed || !info.usedBy.length) return
	emit('focus-node', { nodeId: info.usedBy[0].nodeId })
}

const getFocusTooltip = (rid: string): string => {
	const info = getUsageInfo(usageMap.value, rid)
	if (!info?.isUsed || !info.usedBy.length) return ''
	const nodeTitle = info.usedBy[0].nodeTitle || info.usedBy[0].nodeId
	if (info.usedBy.length === 1) {
		return t('resources.panel.locateToSingleNode', { nodeTitle })
	}
	return t('resources.panel.locateToFirstNode', { nodeTitle, count: info.usedBy.length })
}

const resourceKindLabel = (kind: string): string => {
	const k = String(kind || '').toLowerCase()
	if (k === 'image') return t('resources.panel.kindImage')
	if (k === 'video') return t('resources.panel.kindVideo')
	if (k === 'model3d') return t('resources.panel.kindModel3d')
	return kind || t('resources.panel.kindDefault')
}

const resourceKindIconPath = (kind: string): string => {
	const k = String(kind || '').toLowerCase()
	if (k === 'video')
		return 'M3 5.5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 12.5z M9.5 8l3.5-2v6l-3.5-2z'
	if (k === 'model3d')
		return 'M12 2l8 4.5v8L12 19l-8-4.5v-8z M12 19v-7.5M4 6.5l8 4.5 8-4.5 M4 13.5l8-4.5 8 4.5'
	return 'M3 5.5c0-.8.7-1.5 1.5-1.5h7c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5z M3 14.5l3-3 2 2 3-4 4 4'
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

const scrollBodyEl = ref<HTMLElement | null>(null)
const gridSentinelEl = ref<HTMLElement | null>(null)
const listSentinelEl = ref<HTMLElement | null>(null)

type ViewMode = 'grid' | 'list'
const viewMode = ref<ViewMode>('grid')

type SortMode = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'usage-desc'
const sortMode = ref<SortMode>('date-desc')
const thumbSize = ref<'sm' | 'lg'>('sm')
const failedThumbIds = ref<Set<string>>(new Set())
const gridReflowing = ref(false)
const layoutEpoch = ref(0)
let io: IntersectionObserver | null = null
let ioObservedSentinel: HTMLElement | null = null

const currentSentinel = computed(() =>
	viewMode.value === 'grid' ? gridSentinelEl.value : listSentinelEl.value
)

const PAGE_SIZE = 80
const loadedCount = ref(PAGE_SIZE)

const resetPaging = () => {
	loadedCount.value = PAGE_SIZE
}

const scheduleFillVisibleCapacity = () => {
	nextTick(() => {
		const total = sortedResources.value.length
		if (loadedCount.value >= total) return
		loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE * 2)
	})
}

const toggleThumbSize = () => {
	thumbSize.value = thumbSize.value === 'sm' ? 'lg' : 'sm'
	scheduleFillVisibleCapacity()
}

const cycleSortMode = () => {
	const order: SortMode[] = ['date-desc', 'date-asc', 'name-asc', 'usage-desc']
	const idx = order.indexOf(sortMode.value)
	sortMode.value = order[(idx + 1) % order.length]
	resetPaging()
	scheduleFillVisibleCapacity()
}

const sortModeTitle = computed(() => {
	switch (sortMode.value) {
		case 'date-desc':
			return t('resources.panel.sortDateDesc')
		case 'date-asc':
			return t('resources.panel.sortDateAsc')
		case 'name-asc':
			return t('resources.panel.sortNameAsc')
		case 'name-desc':
			return t('resources.panel.sortNameDesc')
		case 'usage-desc':
			return t('resources.panel.sortUsageDesc')
		default:
			return t('resources.panel.sortDefault')
	}
})

const hasThumbFailed = (resourceId: string): boolean => {
	return failedThumbIds.value.has(String(resourceId || '').trim())
}

const compareCreatedAt = (a: WorkflowResource, b: WorkflowResource) => {
	const at = Number(a?.createdAt ?? 0)
	const bt = Number(b?.createdAt ?? 0)
	return at - bt
}

const sortedResources = computed(() => {
	let list = Array.isArray(props.resources) ? props.resources.slice() : []

	/* ============ 整改方案 O3.1：面板源头只渲染真实静态资产（图片/视频/3D模型/文档），
	 * 旧预热截图缓存混在 resourcesById 中的记录不再出现在列表里。
	 * （defense-in-depth：ResourceManagerWindow.vue resources computed 也做了同样过滤，双保险。）
	 */
	list = list.filter((r) => isStaticAssetResource(r))

	// 筛选：使用状态
	if (filterMode.value === 'used') {
		list = list.filter((r) => isResourceUsed(String(r.id ?? '')))
	} else if (filterMode.value === 'unused') {
		list = list.filter((r) => !isResourceUsed(String(r.id ?? '')))
	}

	// 筛选：类型
	if (typeFilter.value) {
		const tk = typeFilter.value
		list = list.filter((r) => String(r.kind ?? '').toLowerCase() === tk)
	}

	// 搜索：名称
	const kw = searchKeyword.value.trim().toLowerCase()
	if (kw) {
		list = list.filter((r) =>
			String(r.name ?? '')
				.toLowerCase()
				.includes(kw)
		)
	}

	// 排序
	switch (sortMode.value) {
		case 'date-desc':
			list.sort((a, b) => compareCreatedAt(b, a))
			break
		case 'date-asc':
			list.sort(compareCreatedAt)
			break
		case 'name-asc':
			list.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh'))
			break
		case 'name-desc':
			list.sort((a, b) => String(b.name ?? '').localeCompare(String(a.name ?? ''), 'zh'))
			break
		case 'usage-desc':
			list.sort((a, b) => getUsageCount(String(b.id ?? '')) - getUsageCount(String(a.id ?? '')))
			break
	}

	return list
})

const visibleResources = computed(() => {
	const list = sortedResources.value
	const n = Math.max(0, Math.floor(Number(loadedCount.value) || 0))
	return list.slice(0, Math.min(list.length, n))
})

// 注意：totalCount 指的是当前筛选模式下的总数
// 而 counts.total 指的是全部资源的总数（用于头部显示）
const totalCount = computed(() => sortedResources.value.length)
const visibleCount = computed(() => visibleResources.value.length)

const thumbSizeTitle = computed(() =>
	thumbSize.value === 'sm'
		? t('resources.panel.thumbSizeSmall')
		: t('resources.panel.thumbSizeLarge')
)

const thumbSrc = (r: WorkflowResource) => {
	if (!r) return ''
	if (r.kind === 'video') {
		const poster = String(r.posterUrl ?? '').trim()
		return sanitizeWorkflowMediaUrl(poster)
	}
	return sanitizeWorkflowMediaUrl(String(r.url ?? '').trim())
}

const resourceMissingThumb = (r: WorkflowResource) => {
	const rid = String(r?.id ?? '').trim()
	if (!rid) return false
	const thumb = String(thumbSrc(r) || '').trim()
	/* ============ 整改方案 O3.2：缩略图本身指向预热缓存的不算"缺失"。
	 * 这些 URL 是旧架构残留，失败是预期行为，不应导致"清理无缩略图资源"删除有效资产。
	 */
	if (isThumbUrlWarmupArtifact(thumb)) return false
	if (failedThumbIds.value.has(rid)) return true
	return !thumb
}

const emitRefreshMissing = () => {
	const ids = sortedResources.value
		/* ============ 整改方案 O3.2：只对静态资产（kind = image/video/model3d）执行缩略图缺失清理。
		 * 其他类型（包括混入的缓存占位记录）一律不参与，避免误删。
		 */
		.filter((r) => isStaticAssetResource(r))
		.filter((r) => resourceMissingThumb(r))
		.map((r) => String(r?.id ?? '').trim())
		.filter((id) => !!id)
	emit('refresh-missing', ids)
}

const onThumbError = (resourceId: string) => {
	const id = String(resourceId || '').trim()
	if (!id) return
	const next = new Set(failedThumbIds.value)
	next.add(id)
	failedThumbIds.value = next
}

/* ============ O3：缩略图 onerror 事件阻断 ============
 * 阻止事件继续传播，避免全局 window error handler 捕获后当作"资源丢失"处理。
 * 缩略图失败只需 failedThumbIds 标记 + 显示占位符即可（降级表现已足够）。
 */
const onThumbErrorWithEvent = (event: Event, resourceId: string) => {
	try {
		event.stopPropagation?.()
	} catch {
		/* ignore */
	}
	try {
		event.stopImmediatePropagation?.()
	} catch {
		/* ignore */
	}
	try {
		event.preventDefault?.()
	} catch {
		/* ignore */
	}
	onThumbError(resourceId)
}

const onTileDragStart = (event: DragEvent, r: WorkflowResource) => {
	const dt = event.dataTransfer
	if (!dt) return
	try {
		dt.effectAllowed = 'copy'
		dt.setData(
			'application/x-dweb-resource-item',
			JSON.stringify({
				resourceId: String(r.id ?? ''),
				kind: String(r.kind ?? ''),
				name: String(r.name ?? ''),
				url: String(r.url ?? ''),
				sourcePath: String(r.sourcePath ?? '')
			})
		)
		dt.setData('text/plain', String(r.url ?? ''))
	} catch {
		// ignore
	}
}

watch([() => props.resources, searchKeyword, typeFilter, filterMode], () => {
	const keep = new Set(
		(props.resources ?? [])
			.map((r: WorkflowResource) => String(r?.id ?? '').trim())
			.filter((id) => !!id)
	)
	const next = new Set<string>()
	for (const id of failedThumbIds.value.values()) {
		if (keep.has(id)) next.add(id)
	}
	failedThumbIds.value = next
	resetPaging()
	scheduleFillVisibleCapacity()
})

const setupIo = () => {
	if (io) {
		try {
			io.disconnect()
		} catch {
			/* ignore */
		}
		io = null
	}
	ioObservedSentinel = null

	const root = scrollBodyEl.value
	const sentinel = currentSentinel.value
	if (!sentinel) return

	io = new IntersectionObserver(
		(entries) => {
			const hit = entries.some((e) => e.isIntersecting)
			if (!hit) return
			const total = sortedResources.value.length
			if (loadedCount.value >= total) return
			loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE)
		},
		{ root: root ?? null, rootMargin: '240px' }
	)

	io.observe(sentinel)
	ioObservedSentinel = sentinel
}

watch(viewMode, () => {
	nextTick(() => {
		resetPaging()
		setupIo()
		scheduleFillVisibleCapacity()
		if (scrollBodyEl.value) scrollBodyEl.value.scrollTop = 0
	})
})

onMounted(() => {
	checkCloudConfig()
	nextTick(() => {
		setupIo()
	})

	resetPaging()
	scheduleFillVisibleCapacity()
})

onBeforeUnmount(() => {
	if (io) {
		try {
			io.disconnect()
		} catch {
			// ignore
		}
		io = null
	}
	ioObservedSentinel = null
})
</script>

<style scoped>
/*
 * 资源管理器面板样式
 * 在独立 BrowserWindow 中使用时，由父容器 (.rmw-root) 提供定位和尺寸。
 * 面板本身占满 flex 空间，无 fixed 定位。
 */
.wf-resource-panel {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--theme-bg-primary);
	border: 1px solid var(--theme-border);
	overflow: hidden;
	color: var(--theme-text-primary);
}

.wf-resource-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-bottom: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	flex-shrink: 0;
}

.wf-resource-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--theme-text-primary);
	letter-spacing: 0.3px;
}

.wf-resource-actions {
	display: flex;
	gap: 6px;
	align-items: center;
}

.wf-resource-icon-btn {
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-secondary);
	width: 26px;
	height: 26px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	transition: all 120ms ease;
}

.wf-resource-icon-btn:hover {
	border-color: var(--theme-accent);
	background: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-tertiary));
	color: var(--theme-accent);
}

.wf-resource-icon-btn.active {
	border-color: var(--theme-accent);
	background: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-tertiary));
	color: var(--theme-accent);
}

.wf-resource-view-switch {
	display: flex;
	gap: 2px;
	padding: 2px;
	background: var(--theme-bg-tertiary);
	border-radius: 5px;
	border: 1px solid var(--theme-border);
}

.wf-resource-view-switch .wf-resource-icon-btn {
	border: none;
	background: transparent;
	width: 24px;
	height: 22px;
}

.wf-resource-view-switch .wf-resource-icon-btn:hover {
	background: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-tertiary));
}

.wf-resource-view-switch .wf-resource-icon-btn.active {
	background: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-tertiary));
	color: var(--theme-accent);
	border-radius: 3px;
}

.wf-resource-icon {
	width: 14px;
	height: 14px;
}

.wf-resource-btn {
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-secondary);
	width: 26px;
	height: 26px;
	cursor: pointer;
	font-size: 13px;
	line-height: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	transition: all 120ms ease;
}

.wf-resource-btn:hover {
	border-color: var(--theme-accent);
	background: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-tertiary));
	color: var(--theme-accent);
}

.wf-resource-body {
	padding: 12px;
	overflow: auto;
	flex: 1;
	min-height: 0;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--theme-accent) 40%, transparent) transparent;
}

.wf-resource-empty {
	color: var(--theme-text-secondary);
	font-size: 13px;
	text-align: center;
	padding: 48px 0;
}

.wf-resource-stats {
	color: var(--theme-text-secondary);
	font-size: 11.5px;
	margin: 0 0 10px;
	padding: 0 2px;
}

/* ── Filter bar with search ── */
.wf-resource-filter-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 0 10px;
	padding: 6px 8px;
	background: var(--theme-bg-secondary);
	border: 1px solid var(--theme-border);
	border-radius: 6px;
	flex-wrap: wrap;
}

.wf-resource-filter-group {
	display: flex;
	gap: 4px;
}

.wf-resource-filter-divider {
	width: 1px;
	height: 20px;
	background: var(--theme-border);
	flex-shrink: 0;
}

.wf-resource-type-group {
	display: flex;
	gap: 3px;
}

.wf-resource-filter-btn {
	padding: 3px 10px;
	font-size: 11.5px;
	color: var(--theme-text-secondary);
	background: transparent;
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	cursor: pointer;
	transition: all 120ms ease;
}

.wf-resource-filter-btn:hover {
	background: color-mix(in srgb, var(--theme-accent) 10%, var(--theme-bg-tertiary));
	border-color: color-mix(in srgb, var(--theme-accent) 50%, var(--theme-border));
	color: var(--theme-text-primary);
}

.wf-resource-filter-btn.active {
	background: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-tertiary));
	border-color: var(--theme-accent);
	color: var(--theme-text-primary);
}

.wf-resource-filter-num {
	opacity: 0.6;
	margin-left: 2px;
	font-size: 10.5px;
}

.wf-resource-type-btn {
	width: 26px;
	height: 24px;
	font-size: 11px;
	font-weight: 600;
	color: var(--theme-text-secondary);
	background: transparent;
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	cursor: pointer;
	transition: all 120ms ease;
	padding: 0;
}

.wf-resource-type-btn:hover {
	border-color: color-mix(in srgb, var(--theme-accent) 50%, var(--theme-border));
	color: var(--theme-text-primary);
}

.wf-resource-type-btn.active {
	background: color-mix(in srgb, var(--theme-accent) 18%, var(--theme-bg-tertiary));
	border-color: color-mix(in srgb, var(--theme-accent) 60%, var(--theme-border));
	color: var(--theme-text-primary);
}

.wf-resource-search-wrap {
	position: relative;
	margin-left: auto;
	display: flex;
	align-items: center;
}

.wf-resource-search-icon {
	position: absolute;
	left: 7px;
	width: 13px;
	height: 13px;
	color: var(--theme-text-secondary);
	pointer-events: none;
}

.wf-resource-search-input {
	width: 160px;
	height: 26px;
	padding: 0 8px 0 26px;
	font-size: 11.5px;
	color: var(--theme-text-primary);
	background: var(--theme-bg-tertiary);
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	outline: none;
	transition: border-color 120ms ease;
}

.wf-resource-search-input::placeholder {
	color: var(--theme-text-secondary);
}

.wf-resource-search-input:focus {
	border-color: var(--theme-accent);
}

/* ── CSS Grid layout (replaces column-width waterfall) ── */
.wf-resource-grid {
	display: grid;
	gap: 12px;
	grid-template-columns: repeat(auto-fill, minmax(var(--tile-size, 130px), 1fr));
	align-content: start;
}

.wf-resource-grid.thumb-sm {
	--tile-size: 128px;
}

.wf-resource-grid.thumb-lg {
	--tile-size: 176px;
}

.wf-resource-grid.reflowing .wf-resource-tile {
	animation: wf-resource-reflow 220ms ease;
}

/* ── Resource Tile ── */
.wf-resource-tile {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	border-radius: 6px;
	overflow: hidden;
	cursor: grab;
	animation: wf-resource-tile-in 180ms ease;
	transition:
		border-color 140ms ease,
		box-shadow 140ms ease,
		transform 140ms ease;
}

.wf-resource-tile:hover {
	border-color: color-mix(in srgb, var(--theme-accent) 50%, var(--theme-border));
	box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-text-primary) 10%, transparent);
	transform: translateY(-1px);
}

.wf-resource-tile.is-used {
	border-color: color-mix(in srgb, #4ca0f4 35%, var(--theme-border));
}

.wf-resource-tile.is-unused {
	opacity: 0.75;
}

.wf-resource-tile.is-unused:hover {
	opacity: 0.9;
}

/* Thumb area: forced square */
.wf-resource-tile__thumb-area {
	position: relative;
	width: 100%;
	aspect-ratio: 1 / 1;
	background: var(--theme-bg-tertiary);
	overflow: hidden;
}

.wf-resource-thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	user-select: none;
}

.wf-resource-thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-text-secondary));
	background: var(--theme-bg-tertiary);
}

.wf-resource-thumb-placeholder-icon {
	width: 42px;
	height: 42px;
}

.wf-resource-thumb-placeholder-icon path {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

/* ── Badges ── */
.wf-resource-used-badge {
	position: absolute;
	top: 6px;
	left: 6px;
	z-index: 3;
	padding: 2px 7px;
	font-size: 10px;
	font-weight: 700;
	line-height: 1.3;
	color: #ffffff;
	background: linear-gradient(
		135deg,
		var(--theme-accent),
		color-mix(in srgb, var(--theme-accent) 80%, #000)
	);
	border-radius: 3px;
	user-select: none;
	pointer-events: none;
	letter-spacing: 0.2px;
}

.wf-resource-unused-badge {
	position: absolute;
	top: 6px;
	left: 6px;
	z-index: 3;
	padding: 2px 7px;
	font-size: 10px;
	font-weight: 600;
	line-height: 1.3;
	color: var(--theme-text-secondary);
	background: color-mix(in srgb, var(--theme-bg-tertiary) 90%, transparent);
	border-radius: 3px;
	user-select: none;
	pointer-events: none;
}

/* ── Overlay actions ── */
.wf-resource-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	opacity: 0;
	transition: opacity 140ms ease;
	background: color-mix(in srgb, var(--theme-bg-primary) 55%, transparent);
	pointer-events: none;
}

.wf-resource-tile:hover .wf-resource-overlay {
	opacity: 1;
}

.wf-resource-overlay-btn {
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	color: var(--theme-text-primary);
	width: 32px;
	height: 32px;
	border-radius: 6px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	pointer-events: auto;
	transition: all 120ms ease;
}

.wf-resource-overlay-btn:hover {
	border-color: var(--theme-accent);
	background: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-secondary));
	color: var(--theme-accent);
	transform: scale(1.08);
}

.wf-resource-overlay-btn--focus {
	border-color: color-mix(in srgb, #50b4dc 40%, var(--theme-border));
}

.wf-resource-overlay-btn--focus:hover {
	border-color: #50c8f0;
	background: color-mix(in srgb, #3ca0c8 25%, var(--theme-bg-secondary));
}

.wf-resource-overlay-btn.danger:hover {
	border-color: var(--theme-error);
	background: color-mix(in srgb, var(--theme-error) 20%, var(--theme-bg-secondary));
	color: var(--theme-error);
}

.wf-resource-overlay-icon {
	width: 16px;
	height: 16px;
}

.wf-resource-overlay-icon path,
.wf-resource-overlay-icon rect,
.wf-resource-overlay-icon circle {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.3;
	stroke-linecap: round;
	stroke-linejoin: round;
}

/* ── Info section below thumb ── */
.wf-resource-tile__info {
	padding: 6px 8px 8px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.wf-resource-tile__name {
	font-size: 11.5px;
	font-weight: 500;
	color: var(--theme-text-primary);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}

.wf-resource-tile__meta-row {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 10px;
	line-height: 1;
}

.wf-resource-tile__kind {
	padding: 1px 5px;
	border-radius: 3px;
	font-weight: 600;
	letter-spacing: 0.02em;
}

.wf-resource-tile__kind[data-kind='image'] {
	background: color-mix(in srgb, #60a5fa 20%, transparent);
	color: #60a5fa;
}

.wf-resource-tile__kind[data-kind='video'] {
	background: color-mix(in srgb, #f472b6 20%, transparent);
	color: #f472b6;
}

.wf-resource-tile__kind[data-kind='model3d'] {
	background: color-mix(in srgb, #fbbf24 20%, transparent);
	color: #fbbf24;
}

.wf-resource-tile__usage {
	color: var(--theme-accent);
	font-weight: 600;
}

.wf-resource-tile__unused {
	color: var(--theme-text-secondary);
	font-size: 9.5px;
}

.wf-resource-tile__date {
	font-size: 9.5px;
	color: var(--theme-text-secondary);
	line-height: 1;
}

/* ── Sentinel for infinite scroll ── */
.wf-resource-sentinel {
	width: 100%;
	height: 1px;
	grid-column: 1 / -1;
}

/* ── Animations ── */
@keyframes wf-resource-tile-in {
	from {
		opacity: 0;
		transform: translateY(4px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes wf-resource-reflow {
	from {
		opacity: 0.85;
		transform: scale(0.99);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

/* ── 列表视图 ── */
.wf-resource-list {
	display: flex;
	flex-direction: column;
}

.wf-resource-list__header {
	display: flex;
	align-items: center;
	padding: 8px 12px;
	font-size: 11px;
	color: var(--theme-text-secondary);
	text-transform: uppercase;
	letter-spacing: 0.5px;
	border-bottom: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	flex-shrink: 0;
	gap: 12px;
	position: sticky;
	top: 0;
	z-index: 2;
}

.wf-resource-list__h-name {
	flex: 1;
	min-width: 0;
	padding-left: 68px;
}
.wf-resource-list__h-kind {
	width: 70px;
	flex-shrink: 0;
}
.wf-resource-list__h-usage {
	width: 130px;
	flex-shrink: 0;
}
.wf-resource-list__h-date {
	width: 90px;
	flex-shrink: 0;
}
.wf-resource-list__h-actions {
	width: 90px;
	flex-shrink: 0;
	text-align: right;
}

.wf-resource-list__row {
	display: flex;
	align-items: center;
	padding: 6px 12px;
	gap: 12px;
	border-bottom: 1px solid color-mix(in srgb, var(--theme-border) 60%, transparent);
	transition: background 120ms ease;
	cursor: default;
}

.wf-resource-list__row:hover {
	background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg-secondary));
}

.wf-resource-list__row.is-unused {
	opacity: 0.7;
}

.wf-resource-list__thumb-wrap {
	position: relative;
	width: 48px;
	height: 48px;
	flex-shrink: 0;
	border-radius: 4px;
	overflow: hidden;
	background: var(--theme-bg-tertiary);
	border: 1px solid var(--theme-border);
}

.wf-resource-list__thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.wf-resource-list__thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme-text-secondary);
}

.wf-resource-list__thumb-placeholder-icon {
	width: 24px;
	height: 24px;
}

.wf-resource-list__thumb-focus {
	position: absolute;
	inset: 0;
	border: none;
	background: color-mix(in srgb, var(--theme-bg-primary) 60%, transparent);
	color: var(--theme-accent);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 120ms ease;
	z-index: 2;
}

.wf-resource-list__row:hover .wf-resource-list__thumb-focus {
	opacity: 1;
}

.wf-resource-list__thumb-focus-icon {
	width: 22px;
	height: 22px;
}

.wf-resource-list__badge {
	position: absolute;
	bottom: 2px;
	right: 2px;
	font-size: 9px;
	padding: 1px 4px;
	border-radius: 3px;
	font-weight: 600;
	line-height: 1.3;
	pointer-events: none;
	z-index: 1;
}

.wf-resource-list__badge.is-used {
	background: var(--theme-accent);
	color: #fff;
}

.wf-resource-list__badge.is-unused {
	background: color-mix(in srgb, var(--theme-text-secondary) 80%, var(--theme-bg-tertiary));
	color: var(--theme-bg-primary);
}

.wf-resource-list__name {
	flex: 1;
	min-width: 0;
	font-size: 12px;
	color: var(--theme-text-primary);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.wf-resource-list__kind {
	width: 70px;
	flex-shrink: 0;
}

.wf-resource-list__kind-tag {
	font-size: 10.5px;
	padding: 2px 6px;
	border-radius: 3px;
	display: inline-block;
}

.wf-resource-list__kind-tag[data-kind='image'] {
	background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
	color: var(--theme-accent);
}

.wf-resource-list__kind-tag[data-kind='video'] {
	background: color-mix(in srgb, #f472b6 15%, transparent);
	color: #f472b6;
}

.wf-resource-list__kind-tag[data-kind='model3d'] {
	background: color-mix(in srgb, #fbbf24 15%, transparent);
	color: #fbbf24;
}

.wf-resource-list__usage {
	width: 130px;
	flex-shrink: 0;
	font-size: 11px;
	color: var(--theme-text-secondary);
	display: flex;
	align-items: center;
	gap: 4px;
	white-space: nowrap;
	overflow: hidden;
}

.wf-resource-list__node-link {
	border: none;
	background: transparent;
	color: var(--theme-accent);
	font-size: 11px;
	padding: 0;
	cursor: pointer;
	max-width: 100px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: left;
	text-decoration: underline;
	text-decoration-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
}

.wf-resource-list__node-link:hover {
	color: var(--theme-accent-hover);
}

.wf-resource-list__more {
	color: var(--theme-text-secondary);
	font-size: 10px;
	flex-shrink: 0;
}

.wf-resource-list__unused-text {
	color: var(--theme-text-secondary);
}

.wf-resource-list__date {
	width: 90px;
	flex-shrink: 0;
	font-size: 11px;
	color: var(--theme-text-secondary);
	font-variant-numeric: tabular-nums;
}

.wf-resource-list__actions {
	width: 90px;
	flex-shrink: 0;
	display: flex;
	gap: 4px;
	justify-content: flex-end;
	opacity: 0;
	transition: opacity 120ms ease;
}

.wf-resource-list__row:hover .wf-resource-list__actions {
	opacity: 1;
}

.wf-resource-list__action-btn {
	width: 24px;
	height: 24px;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-secondary);
	border-radius: 3px;
	cursor: pointer;
	font-size: 11px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 100ms ease;
}

.wf-resource-list__action-btn:hover {
	border-color: var(--theme-accent);
	color: var(--theme-accent);
	background: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-tertiary));
}

.wf-resource-list__action-btn.danger:hover {
	border-color: var(--theme-error);
	color: var(--theme-error);
	background: color-mix(in srgb, var(--theme-error) 10%, var(--theme-bg-tertiary));
}

.wf-resource-storage-switch {
	display: flex;
	gap: 2px;
	padding: 2px;
	background: var(--theme-bg-tertiary);
	border-radius: 5px;
	border: 1px solid var(--theme-border);
}

.wf-resource-storage-btn {
	border: none;
	background: transparent;
	color: var(--theme-text-secondary);
	height: 22px;
	padding: 0 8px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	border-radius: 3px;
	transition: all 120ms ease;
	font-size: 11px;
	font-weight: 500;
}

.wf-resource-storage-btn:hover {
	background: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-tertiary));
	color: var(--theme-text-primary);
}

.wf-resource-storage-btn.active {
	background: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-tertiary));
	color: var(--theme-accent);
}

.wf-cloud-setup {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 48px 24px;
	text-align: center;
	gap: 12px;
}

.wf-cloud-setup-icon {
	width: 64px;
	height: 64px;
	color: var(--theme-text-secondary);
	opacity: 0.5;
	margin-bottom: 8px;
}

.wf-cloud-setup-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--theme-text-primary);
}

.wf-cloud-setup-desc {
	font-size: 12px;
	color: var(--theme-text-secondary);
	max-width: 280px;
	line-height: 1.5;
}

.wf-cloud-setup-btn {
	margin-top: 8px;
	padding: 8px 20px;
	font-size: 12px;
	font-weight: 500;
	color: #fff;
	background: var(--theme-accent);
	border: none;
	border-radius: 5px;
	cursor: pointer;
	transition: all 120ms ease;
}

.wf-cloud-setup-btn:hover {
	background: color-mix(in srgb, var(--theme-accent) 85%, #000);
	transform: translateY(-1px);
}

.wf-cloud-file-list {
	height: 100%;
}
</style>
