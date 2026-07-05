<template>
	<div
		ref="toolbarWrapRef"
		class="aiwf-floating-rail-wrap"
		data-bp-ui-overlay="true"
		@pointerdown.stop
	>
		<nav class="aiwf-floating-rail" :aria-label="t('aiworkflow.toolbar.ariaLabel')">
			<!-- Sci-fi L corner brackets -->
			<span class="rail-bracket rail-bracket-tl" aria-hidden="true"></span>
			<span class="rail-bracket rail-bracket-tr" aria-hidden="true"></span>
			<span class="rail-bracket rail-bracket-bl" aria-hidden="true"></span>
			<span class="rail-bracket rail-bracket-br" aria-hidden="true"></span>
			<div
				class="aiwf-floating-rail__identity"
				:class="{ unsaved: !hasProjectName }"
				:title="statusTitle"
			>
				<span class="aiwf-floating-rail__status-dot" aria-hidden="true"></span>
				<span class="aiwf-floating-rail__status-main">{{ projectTitle }}</span>
			</div>

			<button
				class="aiwf-floating-rail__btn"
				:class="{ active: activePanel === 'project' }"
				type="button"
				:title="t('aiworkflow.toolbar.project')"
				@click.stop="togglePanel('project')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 4.2h3.6l1.2 1.3H13v6.3H3z" />
					<path d="M4.6 8.6h6.8" />
				</svg>
				<span class="aiwf-floating-rail__label">{{ t('aiworkflow.toolbar.project') }}</span>
				<span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
			</button>

			<span class="aiwf-floating-rail__sep" aria-hidden="true"></span>

			<button
				class="aiwf-floating-rail__btn is-primary"
				:class="{ active: nodeLibraryOpen }"
				type="button"
				:title="t('aiworkflow.toolbar.nodeLibrary')"
				@click.stop="$emit('toggle-node-library')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 3.5h4v4H3zM9 3.5h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
				</svg>
				<span class="aiwf-floating-rail__label">{{ t('aiworkflow.toolbar.nodeLibrary') }}</span>
			</button>

			<span class="aiwf-floating-rail__sep" aria-hidden="true"></span>

			<button
				class="aiwf-floating-rail__btn"
				:class="{ active: activePanel === 'resources' }"
				type="button"
				:title="t('aiworkflow.toolbar.resources')"
				@click.stop="togglePanel('resources')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2.6 5h4l1.2 1.3h5.6v6.2H2.6z" />
					<path d="M4.6 9h2.8" />
				</svg>
				<span class="aiwf-floating-rail__label">{{ t('aiworkflow.toolbar.resources') }}</span>
				<span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
			</button>

			<button
				class="aiwf-floating-rail__btn"
				:class="{ active: backendLogOpen }"
				type="button"
				:title="t('aiworkflow.toolbar.log')"
				@click.stop="$emit('toggle-backend-log')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 3h10v10H3z" />
					<path d="M5 6h6M5 8.5h4M5 11h3" />
				</svg>
				<span class="aiwf-floating-rail__label">{{ t('aiworkflow.toolbar.log') }}</span>
			</button>

			<span class="aiwf-floating-rail__sep" aria-hidden="true"></span>

			<button
				class="aiwf-floating-rail__btn"
				:class="{ active: activePanel === 'tasks' }"
				type="button"
				:title="t('aiworkflow.toolbar.tasks')"
				@click.stop="togglePanel('tasks')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 4h10v8H3z" />
					<path d="M5 7h6M5 9h4" />
				</svg>
				<span class="aiwf-floating-rail__label">{{ t('aiworkflow.toolbar.tasks') }}</span>
				<span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
			</button>
		</nav>

		<Transition name="aiwf-floating-rail-popover">
			<section v-if="activePanel" class="aiwf-floating-rail-popover" :class="`is-${activePanel}`">
				<template v-if="activePanel === 'project'">
					<button class="aiwf-floating-rail-popover__item" type="button" @click="handleSaveProject">
						{{ t('aiworkflow.toolbar.saveProject') }}
					</button>
					<button class="aiwf-floating-rail-popover__item" type="button" @click="openLoadDialog">
						{{ t('aiworkflow.toolbar.loadProject') }}
					</button>
					<div
						v-if="showRepairAssets"
						class="aiwf-floating-rail-popover__sep"
						aria-hidden="true"
					></div>
					<button
						v-if="showRepairAssets"
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-repair-assets')"
					>
						{{ t('aiworkflow.toolbar.repairAssets') }}
					</button>
					<div class="aiwf-floating-rail-popover__sep" aria-hidden="true"></div>
					<button class="aiwf-floating-rail-popover__item" type="button" @click="openImportFile">
						{{ t('aiworkflow.toolbar.importJson') }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="openImportPackageFile"
					>
						{{ t('aiworkflow.toolbar.importZip') }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-export')"
					>
						{{ t('aiworkflow.toolbar.exportJson') }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-export-package')"
					>
						{{ t('aiworkflow.toolbar.exportZip') }}
					</button>
					<div class="aiwf-floating-rail-popover__sep" aria-hidden="true"></div>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-toggle-performance-priority')"
					>
						{{ performancePriorityMode ? t('aiworkflow.toolbar.performancePriorityOn') : t('aiworkflow.toolbar.performancePriorityOff') }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-toggle-screenshot-anchors')"
					>
						{{ anchorsToggleLabel }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-toggle-screenshot-particles')"
					>
						{{ particlesToggleLabel }}
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('request-export-performance-diagnostics')"
					>
						{{ t('aiworkflow.toolbar.exportPerfDiagnostics') }}
					</button>
				</template>

				<template v-else-if="activePanel === 'resources'">
					<div class="aiwf-floating-rail-popover__head">
						<span>{{ t('aiworkflow.toolbar.currentBlueprintResources') }}</span>
						<small>{{ t('aiworkflow.toolbar.resourceCount', { total: resourceList.length, used: usedResourceCount }) }}</small>
					</div>
					<div v-if="!enrichedResources.length" class="aiwf-floating-rail-popover__empty">
						{{ t('aiworkflow.toolbar.noResources') }}
					</div>
					<div
						v-else
						ref="resourceListScrollRef"
						class="aiwf-floating-rail-popover__list"
						@scroll.passive="onResourceListScroll"
					>
						<div
							v-for="r in visibleResources"
							:key="String(r.id)"
							class="aiwf-resource-item"
							:class="{ 'is-unused': r.usageCount === 0 }"
						>
							<button
								class="aiwf-resource-item__cover"
								type="button"
								:title="r.usageCount > 0 ? t('aiworkflow.toolbar.locateReferencingNode') : t('aiworkflow.toolbar.resourceNotReferenced')"
								:disabled="r.usageCount === 0"
								@click.stop="onResourceCoverClick(r)"
							>
								<img
									v-if="resourceThumbUrl(r) && !hasThumbFailed(String(r.id))"
									class="aiwf-resource-item__thumb"
									:src="resourceThumbUrl(r)"
									:alt="r.name || ''"
									loading="lazy"
									draggable="false"
									@error="onThumbError(String(r.id))"
								/>
								<div v-else class="aiwf-resource-item__placeholder">
									<svg viewBox="0 0 24 24" class="aiwf-resource-item__placeholder-icon">
										<path
											:d="resourceKindIconPath(r.kind)"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</div>
								<span v-if="r.usageCount > 0" class="aiwf-resource-item__cover-badge">
									{{ r.usageCount }}
								</span>
							</button>
							<div class="aiwf-resource-item__info">
								<div class="aiwf-resource-item__name" :title="r.name || ''">
									{{ r.name || t('aiworkflow.toolbar.unnamedResource') }}
								</div>
								<div class="aiwf-resource-item__meta">
									<span class="aiwf-resource-item__kind" :data-kind="r.kind">
										{{ resourceKindLabel(r.kind) }}
									</span>
									<span v-if="r.usageCount > 0" class="aiwf-resource-item__usage">
										<template v-if="r.usedBy && r.usedBy.length > 0">
											→
											<button
												class="aiwf-resource-item__node-link"
												type="button"
												:title="t('aiworkflow.toolbar.locateNode', { name: r.usedBy[0].nodeTitle || r.usedBy[0].nodeId })"
												@click.stop="onResourceNodeClick(r.usedBy[0].nodeId)"
											>
												{{ r.usedBy[0].nodeTitle || r.usedBy[0].nodeId }}
											</button>
											<span v-if="r.usedBy.length > 1" class="aiwf-resource-item__more">
												+{{ r.usedBy.length - 1 }}
											</span>
										</template>
									</span>
									<span v-else class="aiwf-resource-item__unused-label">{{ t('aiworkflow.toolbar.unusedResource') }}</span>
								</div>
							</div>
						</div>
						<div v-if="hasMoreResources" class="aiwf-resource-list__footer">
							{{ t('aiworkflow.toolbar.scrollLoadMore') }}
						</div>
						<div
							v-else-if="enrichedResources.length > RESOURCE_PAGE_SIZE"
							class="aiwf-resource-list__footer"
						>
							{{ t('aiworkflow.toolbar.allResourcesLoaded', { count: enrichedResources.length }) }}
						</div>
					</div>
					<button
						class="aiwf-floating-rail-popover__item is-footer"
						type="button"
						@click="emitThenClose('open-resource-manager')"
					>
						{{ t('aiworkflow.toolbar.openResourceManager') }}
					</button>
				</template>

				<template v-else-if="activePanel === 'tasks'">
					<div class="aiwf-floating-rail-popover__head">
						<span>{{ t('aiworkflow.toolbar.taskManagement') }}</span>
					</div>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('open-meshy-task-panel')"
					>
						<span>Meshy</span>
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						disabled
						:title="t('aiworkflow.toolbar.geminiNotImplemented')"
						@click="emitThenClose('open-gemini-task-panel')"
					>
						<span>Gemini</span>
					</button>
					<button
						class="aiwf-floating-rail-popover__item"
						type="button"
						@click="emitThenClose('open-ark-task-panel')"
					>
						<span>{{ t('tasks.ark.volcArk') }}</span>
					</button>
				</template>
			</section>
		</Transition>

		<input
			ref="importInputRef"
			class="aiwf-rail-hidden-input"
			type="file"
			accept="application/json,.json"
			@change="onImportChange"
		/>
		<input
			ref="importPackageInputRef"
			class="aiwf-rail-hidden-input"
			type="file"
			accept="application/zip,.zip"
			@change="onImportPackageChange"
		/>

		<Transition name="aiwf-rail-dialog">
			<div
				v-if="loadDialogOpen"
				class="aiwf-rail-dialog-mask"
				data-bp-ui-overlay="true"
				@pointerdown.stop
				@mousedown.stop
				@contextmenu.prevent.stop
				@click.self="loadDialogOpen = false"
			>
				<div
					class="aiwf-rail-dialog aiwf-rail-dialog--wide"
					data-bp-ui-overlay="true"
					@pointerdown.stop
					@mousedown.stop
					@click.stop
					@contextmenu.prevent.stop
				>
					<!-- Sci-fi L corner brackets -->
					<span class="rail-bracket rail-bracket-tl" aria-hidden="true"></span>
					<span class="rail-bracket rail-bracket-tr" aria-hidden="true"></span>
					<span class="rail-bracket rail-bracket-bl" aria-hidden="true"></span>
					<span class="rail-bracket rail-bracket-br" aria-hidden="true"></span>
					<div class="aiwf-rail-dialog__title">{{ t('aiworkflow.toolbar.loadBlueprintProject') }}</div>

					<!-- 搜索框 -->
					<div class="aiwf-rail-search-wrap">
						<input
							v-model="searchKeyword"
							class="aiwf-rail-search-input"
							type="text"
							:placeholder="t('aiworkflow.toolbar.searchProject')"
						/>
					</div>

					<div class="aiwf-rail-project-list">
						<div
							v-for="(item, idx) in filteredProjects"
							:key="`${String(item.id ?? '')}-${String(item.updatedAt ?? '')}-${idx}`"
							class="aiwf-rail-project-item"
							:class="{ active: selectedProjectId === item.id }"
						>
							<button
								class="aiwf-rail-project-main"
								type="button"
								@click="selectedProjectId = item.id"
							>
								<span class="aiwf-rail-project-icon">
									<svg v-if="item.folderBacked" viewBox="0 0 16 16" aria-hidden="true">
										<path d="M3 4.2h3.6l1.2 1.3H13v6.3H3z" />
										<path d="M4.6 8.6h6.8" />
									</svg>
									<svg v-else viewBox="0 0 16 16" aria-hidden="true">
										<path d="M3 3h10v10H3z" />
										<path d="M5 6h6M5 8.5h4M5 11h3" />
									</svg>
								</span>
								<div class="aiwf-rail-project-info">
									<span class="aiwf-rail-project-name">{{ item.name }}</span>
									<small>{{ formatRelativeTime(item.updatedAt) }}</small>
								</div>
							</button>
							<button
								class="aiwf-rail-project-del"
								type="button"
								@click.stop="onDeleteProject(item.id, item.name)"
							>
								{{ t('aiworkflow.toolbar.deleteProject') }}
							</button>
						</div>
						<div v-if="!filteredProjects.length" class="aiwf-rail-empty">
							{{ searchKeyword ? t('aiworkflow.toolbar.noMatchingProjects') : t('aiworkflow.toolbar.noProjects') }}
						</div>
					</div>
					<div class="aiwf-rail-dialog__actions">
						<button class="aiwf-rail-dialog-btn" type="button" @click="loadDialogOpen = false">
							{{ t('common.cancel') }}
						</button>
						<button
							class="aiwf-rail-dialog-btn is-primary"
							type="button"
							@click="confirmLoad"
							:disabled="selectedProjectId == null"
						>
							{{ t('aiworkflow.toolbar.load') }}
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { sanitizeWorkflowMediaUrl } from '../../aiworkflow/domain/resource/safeWorkflowUrl'
import { analyzeResourceUsage, getUsageInfo } from '../../aiworkflow/resource/usage'
import type { WorkflowResource } from '../../aiworkflow/resource/types'
import type { WorkflowNode } from '../../aiworkflow/types'

const { t } = useI18n()

export type BlueprintProjectListItem = {
	id: number
	name: string
	projectUuid: string
	rootPath: string
	folderBacked: boolean
	createdAt: number
	updatedAt?: number | null
	lastOpenedAt?: number | null
}

export type ToolbarResourceItem = WorkflowResource & {
	usageCount?: number
	usedBy?: Array<{ nodeId: string; nodeTitle: string; nodeType: string }>
}

type FloatingPanel = '' | 'project' | 'resources' | 'tasks'

const props = defineProps<{
	projects: BlueprintProjectListItem[]
	currentProjectName?: string
	performancePriorityMode?: boolean
	screenshotAnchorsEnabled?: boolean
	screenshotParticlesEnabled?: boolean
	electronReady?: boolean
	resources?: ToolbarResourceItem[]
	nodesById?: Record<string, WorkflowNode>
	nodeOrder?: string[]
	currentProjectId?: number | null
	nodeLibraryOpen?: boolean
	backendLogOpen?: boolean
	showRepairAssets?: boolean
}>()

const emit = defineEmits<{
	(e: 'quick-add', event: MouseEvent): void
	(e: 'toggle-node-library'): void
	(e: 'toggle-backend-log'): void
	(e: 'open-resource-manager'): void
	(e: 'focus-node', payload: { nodeId: string }): void
	(e: 'request-save'): void
	(e: 'request-repair-assets'): void
	(e: 'request-toggle-performance-priority'): void
	(e: 'request-toggle-screenshot-anchors'): void
	(e: 'request-toggle-screenshot-particles'): void
	(e: 'request-export-performance-diagnostics'): void
	(e: 'request-load-list'): void
	(e: 'request-load-project', payload: { projectId: number }): void
	(e: 'request-delete-project', payload: { projectId: number }): void
	(e: 'request-import-local', payload: { file: File }): void
	(e: 'request-export'): void
	(e: 'request-import-package', payload: { file: File }): void
	(e: 'request-export-package'): void
	(e: 'open-meshy-task-panel'): void
	(e: 'open-gemini-task-panel'): void
	(e: 'open-ark-task-panel'): void
}>()

const toolbarWrapRef = ref<HTMLElement | null>(null)
const activePanel = ref<FloatingPanel>('')

const loadDialogOpen = ref(false)
const selectedProjectId = ref<number | null>(null)
const searchKeyword = ref('')
const importInputRef = ref<HTMLInputElement | null>(null)
const importPackageInputRef = ref<HTMLInputElement | null>(null)

const resources = computed(() => (Array.isArray(props.resources) ? props.resources : []))
const nodeLibraryOpen = computed(() => props.nodeLibraryOpen === true)
const backendLogOpen = computed(() => props.backendLogOpen === true)
const showRepairAssets = computed(() => props.showRepairAssets === true)

const hasProjectName = computed(() => String(props.currentProjectName ?? '').trim().length > 0)
const projectTitle = computed(() => String(props.currentProjectName ?? '').trim() || t('aiworkflow.toolbar.unsavedProject'))
const statusTitle = computed(() => {
	if (!hasProjectName.value) return t('aiworkflow.toolbar.projectNotSaved')
	return t('aiworkflow.toolbar.currentProject', { name: projectTitle.value })
})

watch(
	() => props.currentProjectName,
	() => {
		// 当前项目名变化时无需特殊处理（保存直接使用 currentProjectName）
	}
)

watch(
	() => props.projects,
	(next) => {
		if (!Array.isArray(next) || !next.length) {
			selectedProjectId.value = null
			return
		}
		if (selectedProjectId.value == null || !next.some((x) => x.id === selectedProjectId.value)) {
			selectedProjectId.value = next[0].id
		}
	},
	{ immediate: true }
)

const togglePanel = (panel: Exclude<FloatingPanel, ''>) => {
	activePanel.value = activePanel.value === panel ? '' : panel
}

const emitThenClose = (
	eventName:
		| 'request-repair-assets'
		| 'request-export'
		| 'request-export-package'
		| 'request-toggle-performance-priority'
		| 'request-toggle-screenshot-anchors'
		| 'request-toggle-screenshot-particles'
		| 'request-export-performance-diagnostics'
		| 'open-resource-manager'
		| 'open-meshy-task-panel'
		| 'open-gemini-task-panel'
		| 'open-ark-task-panel'
) => {
	;(emit as (event: typeof eventName) => void)(eventName)
	activePanel.value = ''
}

const anchorsToggleLabel = computed(() =>
	props.screenshotAnchorsEnabled === false ? t('aiworkflow.toolbar.anchorsOff') : t('aiworkflow.toolbar.anchorsOn')
)
const particlesToggleLabel = computed(() =>
	props.screenshotParticlesEnabled === false ? t('aiworkflow.toolbar.particlesOff') : t('aiworkflow.toolbar.particlesOn')
)

const handleSaveProject = () => {
	emit('request-save')
	activePanel.value = ''
}

const openLoadDialog = () => {
	emit('request-load-list')
	loadDialogOpen.value = true
	activePanel.value = ''
}

const confirmLoad = () => {
	if (selectedProjectId.value == null) return
	emit('request-load-project', { projectId: selectedProjectId.value })
	loadDialogOpen.value = false
}

const onDeleteProject = (projectId: number, projectName: string) => {
	const ok = window.confirm(t('aiworkflow.toolbar.confirmDeleteProject', { name: projectName || `#${projectId}` }))
	if (!ok) return
	emit('request-delete-project', { projectId })
}

const openImportFile = () => {
	importInputRef.value?.click()
	activePanel.value = ''
}

const openImportPackageFile = () => {
	importPackageInputRef.value?.click()
	activePanel.value = ''
}

const onImportChange = (ev: Event) => {
	const input = ev.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	emit('request-import-local', { file })
	if (input) input.value = ''
}

const onImportPackageChange = (ev: Event) => {
	const input = ev.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	emit('request-import-package', { file })
	if (input) input.value = ''
}

const filteredProjects = computed(() => {
	if (!searchKeyword.value.trim()) return props.projects
	const keyword = searchKeyword.value.toLowerCase()
	return props.projects.filter((item) => item.name.toLowerCase().includes(keyword))
})

const formatRelativeTime = (ts?: number | null) => {
	if (!Number.isFinite(Number(ts))) return t('aiworkflow.toolbar.unknownUpdateTime')
	const now = Date.now()
	const diff = now - Number(ts)
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return t('aiworkflow.toolbar.justNow')
	if (minutes < 60) return t('aiworkflow.toolbar.minutesAgo', { count: minutes })
	if (hours < 24) return t('aiworkflow.toolbar.hoursAgo', { count: hours })
	if (days < 7) return t('aiworkflow.toolbar.daysAgo', { count: days })
	return new Date(Number(ts)).toLocaleDateString()
}

const resourceList = computed(() => (Array.isArray(props.resources) ? props.resources : []))

const resourceUsageMap = computed(() =>
	analyzeResourceUsage(
		resourceList.value as WorkflowResource[],
		props.nodesById ?? {},
		props.nodeOrder ?? []
	)
)

const enrichedResources = computed(() => {
	return resourceList.value
		.map((r: ToolbarResourceItem) => {
			const rid = String(r.id ?? '').trim()
			const info = getUsageInfo(resourceUsageMap.value, rid)
			return {
				...r,
				usageCount: info?.usageCount ?? 0,
				usedBy: info?.usedBy ?? []
			}
		})
		.sort(
			(a: ToolbarResourceItem, b: ToolbarResourceItem) =>
				Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)
		)
})

const usedResourceCount = computed(() => {
	let count = 0
	for (const info of resourceUsageMap.value.values()) {
		if (info.isUsed) count++
	}
	return count
})

const RESOURCE_PAGE_SIZE = 30
const resourceListScrollRef = ref<HTMLElement | null>(null)
const visibleCount = ref(RESOURCE_PAGE_SIZE)

const visibleResources = computed(() => {
	return enrichedResources.value.slice(0, visibleCount.value)
})

const hasMoreResources = computed(() => {
	return visibleCount.value < enrichedResources.value.length
})

const onResourceListScroll = (e: Event) => {
	const el = e.target as HTMLElement
	if (!el) return
	if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
		if (hasMoreResources.value) {
			visibleCount.value = Math.min(
				visibleCount.value + RESOURCE_PAGE_SIZE,
				enrichedResources.value.length
			)
		}
	}
}

watch(
	() => activePanel.value,
	(panel) => {
		if (panel === 'resources') {
			visibleCount.value = RESOURCE_PAGE_SIZE
			nextTick(() => {
				if (resourceListScrollRef.value) {
					resourceListScrollRef.value.scrollTop = 0
				}
			})
		}
	}
)

watch(
	() => props.resources,
	() => {
		visibleCount.value = RESOURCE_PAGE_SIZE
	}
)

const resourceThumbUrl = (r: ToolbarResourceItem): string => {
	if (!r) return ''
	if (r.kind === 'video') {
		return sanitizeWorkflowMediaUrl(String(r.posterUrl ?? r.url ?? '').trim())
	}
	return sanitizeWorkflowMediaUrl(String(r.url ?? '').trim())
}

const resourceKindLabel = (kind: string): string => {
	const k = String(kind || '').toLowerCase()
	if (k === 'image') return t('aiworkflow.toolbar.resourceImage')
	if (k === 'video') return t('aiworkflow.toolbar.resourceVideo')
	if (k === 'model3d') return t('aiworkflow.toolbar.resourceModel3d')
	return kind || t('aiworkflow.toolbar.resource')
}

const resourceKindIconPath = (kind: string): string => {
	const k = String(kind || '').toLowerCase()
	if (k === 'video') return 'M2 6h9v6H2zM11 8l4-2v6l-4-2z'
	if (k === 'model3d') return 'M12 2l9 5v8l-9 5-9-5V7z M12 20V10M3 6.5l9 5 9-5'
	return 'M3 4h14v12H3zM3 16l4-4 3 3 4-5 4 5'
}

const onResourceCoverClick = (r: ToolbarResourceItem) => {
	const rid = String(r?.id ?? '').trim()
	if (!rid) return
	const info = getUsageInfo(resourceUsageMap.value, rid)
	if (info?.isUsed && info.usedBy.length > 0) {
		emit('focus-node', { nodeId: info.usedBy[0].nodeId })
		activePanel.value = ''
	}
}

const onResourceNodeClick = (nodeId: string) => {
	if (!nodeId) return
	emit('focus-node', { nodeId })
	activePanel.value = ''
}

const failedThumbIds = ref<Set<string>>(new Set())

const onThumbError = (resourceId: string) => {
	const id = String(resourceId || '').trim()
	if (!id) return
	failedThumbIds.value.add(id)
}

const hasThumbFailed = (resourceId: string): boolean => {
	return failedThumbIds.value.has(String(resourceId || '').trim())
}

const isPointerInsideToolbar = (event: PointerEvent) => {
	const root = toolbarWrapRef.value
	if (!root) return false
	const path = typeof event.composedPath === 'function' ? event.composedPath() : []
	if (path.includes(root)) return true
	const target = event.target
	return target instanceof Node && root.contains(target)
}

const onWindowPointerDown = (event: PointerEvent) => {
	if (!activePanel.value) return
	if (isPointerInsideToolbar(event)) return
	activePanel.value = ''
}

onMounted(() => {
	window.addEventListener('pointerdown', onWindowPointerDown, true)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', onWindowPointerDown, true)
})
</script>

<style scoped>
/* ============================================================
   BlueprintProjectToolbar — Sci-Fi / Cyber Futuristic Style
   Uses project theme tokens: --theme-accent, --wf-*, --sqp-*
   ============================================================ */

/* Sci-fi L corner brackets (shared across toolbar/dialog) */
.rail-bracket {
	position: absolute;
	width: 10px;
	height: 10px;
	pointer-events: none;
	opacity: 0;
	transition: opacity 200ms ease;
	z-index: 3;
}
.rail-bracket-tl {
	top: -2px;
	left: -2px;
	border-top: 1.5px solid var(--theme-accent, #1f9d84);
	border-left: 1.5px solid var(--theme-accent, #1f9d84);
}
.rail-bracket-tr {
	top: -2px;
	right: -2px;
	border-top: 1.5px solid var(--theme-accent, #1f9d84);
	border-right: 1.5px solid var(--theme-accent, #1f9d84);
}
.rail-bracket-bl {
	bottom: -2px;
	left: -2px;
	border-bottom: 1.5px solid var(--theme-accent, #1f9d84);
	border-left: 1.5px solid var(--theme-accent, #1f9d84);
}
.rail-bracket-br {
	bottom: -2px;
	right: -2px;
	border-bottom: 1.5px solid var(--theme-accent, #1f9d84);
	border-right: 1.5px solid var(--theme-accent, #1f9d84);
}

/* Show brackets on hover or when the container is focused */
.aiwf-floating-rail:hover .rail-bracket,
.aiwf-rail-dialog:hover .rail-bracket {
	opacity: 1;
}

/* ── Toolbar wrap ── */
.aiwf-floating-rail-wrap {
	position: absolute;
	left: 56px;
	top: 14px;
	z-index: 1300;
	display: inline-flex;
	align-items: center;
	pointer-events: auto;
}

/* ── Main floating rail (toolbar bar) ── */
.aiwf-floating-rail {
	position: relative;
	display: inline-flex;
	flex-direction: row;
	align-items: center;
	gap: 4px;
	min-height: 34px;
	padding: 4px 6px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 88%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent),
		0 0 16px color-mix(in srgb, var(--theme-accent, #1f9d84) 14%, transparent),
		0 8px 24px rgba(0, 0, 0, 0.4);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	max-width: calc(100vw - 80px);
	flex-wrap: nowrap;
	overflow: visible;
	transition:
		border-color 200ms ease,
		box-shadow 200ms ease;
}

.aiwf-floating-rail:hover {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent),
		0 0 24px color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent),
		0 10px 28px rgba(0, 0, 0, 0.45);
}

/* ── Identity / project title ── */
.aiwf-floating-rail__identity {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 26px;
	padding: 0 10px;
	min-width: 0;
	max-width: 220px;
	color: var(--theme-text-primary, #edf2f4);
	font-size: 12px;
	line-height: 1;
	user-select: none;
}

.aiwf-floating-rail__status-dot {
	width: 7px;
	height: 7px;
	flex: 0 0 7px;
	border-radius: 2px;
	background: #6ee7b7;
	box-shadow:
		0 0 0 3px color-mix(in srgb, #6ee7b7 18%, transparent),
		0 0 8px #6ee7b7;
	transition:
		background 200ms ease,
		box-shadow 200ms ease;
}

.aiwf-floating-rail__identity.unsaved .aiwf-floating-rail__status-dot {
	background: #e5b567;
	box-shadow:
		0 0 0 3px color-mix(in srgb, #e5b567 18%, transparent),
		0 0 8px #e5b567;
}

.aiwf-floating-rail__status-main {
	min-width: 0;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	letter-spacing: 0.01em;
}

/* ── Separator ── */
.aiwf-floating-rail__sep {
	width: 1px;
	height: 20px;
	margin: 0 2px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, transparent);
}

/* ── Buttons ── */
.aiwf-floating-rail__btn {
	position: relative;
	height: 26px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 0 10px;
	border: 1px solid transparent;
	border-radius: 2px;
	outline: none;
	background: transparent;
	color: color-mix(in srgb, var(--theme-text-muted, #aeb8bd) 85%, transparent);
	cursor: pointer;
	font-size: 12px;
	white-space: nowrap;
	flex: 0 0 auto;
	transition:
		border-color 180ms ease,
		background-color 180ms ease,
		color 180ms ease,
		box-shadow 180ms ease;
}

.aiwf-floating-rail__btn:hover,
.aiwf-floating-rail__btn:focus-visible {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
}

.aiwf-floating-rail__btn.active {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 65%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 16%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.aiwf-floating-rail__btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.aiwf-floating-rail__btn.is-primary {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 72%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, transparent);
}

.aiwf-floating-rail__btn.is-primary:hover,
.aiwf-floating-rail__btn.is-primary:focus-visible {
	border-color: var(--theme-accent-hover, #27b99c);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 32%, transparent);
	color: var(--theme-accent-hover, #27b99c);
	box-shadow: 0 0 16px color-mix(in srgb, var(--theme-accent, #1f9d84) 38%, transparent);
}

.aiwf-floating-rail__btn svg {
	width: 14px;
	height: 14px;
	flex: 0 0 auto;
}

.aiwf-floating-rail__btn svg path,
.aiwf-floating-rail__btn svg circle {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.35;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.aiwf-floating-rail__label {
	font-size: 12px;
	line-height: 1;
	white-space: nowrap;
	letter-spacing: 0.01em;
}

.aiwf-floating-rail__caret {
	font-size: 9px;
	line-height: 1;
	opacity: 0.65;
}

/* ── Popover ── */
.aiwf-floating-rail-popover {
	position: absolute;
	top: 100%;
	left: 0;
	z-index: 12;
	margin-top: 6px;
	min-width: 198px;
	max-width: 320px;
	max-height: min(440px, calc(100vh - 88px));
	overflow: hidden;
	display: flex;
	flex-direction: column;
	padding: 6px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 38%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 94%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent),
		0 0 20px color-mix(in srgb, var(--theme-accent, #1f9d84) 16%, transparent),
		0 12px 32px rgba(0, 0, 0, 0.45);
	color: var(--theme-text-primary, #edf2f4);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	will-change: transform, opacity;
}

.aiwf-floating-rail-popover.is-resources {
	width: 302px;
}

.aiwf-floating-rail-popover__head {
	min-height: 28px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 10px 6px 10px;
	border-bottom: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	margin-bottom: 4px;
	color: var(--theme-text-muted, #aeb8bd);
	font-size: 11px;
	line-height: 1;
	font-weight: 700;
	letter-spacing: 0.04em;
}

.aiwf-floating-rail-popover__head small {
	font-size: 11px;
	font-weight: 600;
	color: var(--theme-accent, #1f9d84);
}

.aiwf-floating-rail-popover__item {
	height: 30px;
	padding: 0 10px;
	border: 1px solid transparent;
	border-radius: 2px;
	background: transparent;
	color: var(--theme-text-primary, #edf2f4);
	text-align: left;
	font-size: 12px;
	line-height: 1;
	cursor: pointer;
	white-space: nowrap;
	display: inline-flex;
	align-items: center;
	transition:
		border-color 160ms ease,
		background-color 160ms ease,
		color 160ms ease;
}

.aiwf-floating-rail-popover__item:hover,
.aiwf-floating-rail-popover__item:focus-visible {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	color: var(--theme-accent, #1f9d84);
	outline: none;
}

.aiwf-floating-rail-popover__item:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.aiwf-floating-rail-popover__sep {
	height: 1px;
	margin: 4px 6px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
}

.aiwf-floating-rail-popover__item.is-footer {
	margin-top: 4px;
	border-top: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
	border-radius: 2px;
	padding-top: 6px;
	color: var(--theme-accent, #1f9d84);
}

.aiwf-floating-rail-popover__item.is-footer:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent);
}

.aiwf-floating-rail-popover__empty {
	padding: 16px 12px;
	color: var(--theme-text-muted, #aeb8bd);
	text-align: center;
	font-size: 12px;
}

/* ── Resource quick list ── */
.aiwf-floating-rail-popover__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-height: 340px;
	overflow-y: auto;
	padding: 2px 2px 4px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent) transparent;
}

.aiwf-resource-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 5px 6px;
	border-radius: 3px;
	border: 1px solid transparent;
	transition:
		background-color 140ms ease,
		border-color 140ms ease;
}

.aiwf-resource-item:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.aiwf-resource-item.is-unused {
	opacity: 0.7;
}

.aiwf-resource-item__cover {
	position: relative;
	flex: 0 0 48px;
	width: 48px;
	height: 48px;
	border-radius: 3px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 80%, transparent);
	overflow: hidden;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	transition:
		border-color 140ms ease,
		box-shadow 140ms ease;
}

.aiwf-resource-item__cover:hover:not(:disabled) {
	border-color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}

.aiwf-resource-item__cover:disabled {
	cursor: default;
	opacity: 0.55;
}

.aiwf-resource-item__thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	user-select: none;
}

.aiwf-resource-item__placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
}

.aiwf-resource-item__placeholder-icon {
	width: 26px;
	height: 26px;
}

.aiwf-resource-item__placeholder-icon path {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.3;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.aiwf-resource-item__cover-badge {
	position: absolute;
	top: 2px;
	right: 2px;
	min-width: 16px;
	height: 16px;
	padding: 0 4px;
	border-radius: 8px;
	background: linear-gradient(135deg, rgba(40, 140, 90, 0.95), rgba(30, 110, 70, 0.95));
	color: #e4f6ff;
	font-size: 10px;
	font-weight: 700;
	line-height: 16px;
	text-align: center;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
	pointer-events: none;
}

.aiwf-resource-item__info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.aiwf-resource-item__name {
	font-size: 11.5px;
	color: var(--theme-text-primary, #edf2f4);
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}

.aiwf-resource-item__meta {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 10.5px;
	line-height: 1;
	flex-wrap: wrap;
}

.aiwf-resource-item__kind {
	padding: 1px 6px;
	border-radius: 3px;
	font-weight: 600;
	letter-spacing: 0.02em;
}

.aiwf-resource-item__kind[data-kind='image'] {
	background: color-mix(in srgb, #60a5fa 25%, transparent);
	color: #93c5fd;
}

.aiwf-resource-item__kind[data-kind='video'] {
	background: color-mix(in srgb, #f472b6 25%, transparent);
	color: #f9a8d4;
}

.aiwf-resource-item__kind[data-kind='model3d'] {
	background: color-mix(in srgb, #fbbf24 25%, transparent);
	color: #fcd34d;
}

.aiwf-resource-item__usage {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	color: var(--theme-text-muted, #aeb8bd);
}

.aiwf-resource-item__node-link {
	border: none;
	background: transparent;
	color: var(--theme-accent, #1f9d84);
	font-size: 10.5px;
	padding: 0;
	cursor: pointer;
	max-width: 100px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: left;
	text-decoration: underline;
	text-decoration-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	transition: color 120ms ease;
}

.aiwf-resource-item__node-link:hover {
	color: var(--theme-accent-hover, #27b99c);
}

.aiwf-resource-item__more {
	color: var(--theme-text-muted, #aeb8bd);
	font-size: 10px;
	opacity: 0.7;
}

.aiwf-resource-item__unused-label {
	color: color-mix(in srgb, var(--theme-text-muted, #aeb8bd) 60%, transparent);
	font-size: 10px;
}

.aiwf-floating-rail-popover__icon {
	width: 16px;
	height: 16px;
	flex: 0 0 16px;
	margin-right: 8px;
}

.aiwf-floating-rail-popover__icon path,
.aiwf-floating-rail-popover__icon circle {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.aiwf-floating-rail-popover-enter-active,
.aiwf-floating-rail-popover-leave-active {
	transition:
		opacity 160ms ease,
		transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.aiwf-floating-rail-popover-enter-from,
.aiwf-floating-rail-popover-leave-to {
	opacity: 0;
	transform: translateY(-6px);
}

/* ── Hidden file inputs ── */
.aiwf-rail-hidden-input {
	display: none;
}

/* ── Dialog mask ── */
.aiwf-rail-dialog-mask {
	position: fixed;
	inset: 0;
	z-index: 9200;
	background:
		radial-gradient(
			ellipse at 50% 40%,
			color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent) 0%,
			transparent 60%
		),
		rgba(0, 0, 0, 0.55);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
	display: flex;
	align-items: center;
	justify-content: center;
}

/* ── Dialog box ── */
.aiwf-rail-dialog {
	position: relative;
	width: min(440px, calc(100vw - 32px));
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 48%, transparent);
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 98%, transparent),
			color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 90%, transparent)
		),
		var(--wf-surface-raised, rgba(22, 26, 30, 0.92));
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 14%, transparent),
		0 0 28px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent),
		0 20px 60px rgba(0, 0, 0, 0.5);
	border-radius: 2px;
	padding: 14px;
	color: var(--theme-text-primary, #edf2f4);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	transition:
		border-color 200ms ease,
		box-shadow 200ms ease;
}

.aiwf-rail-dialog:hover .rail-bracket {
	opacity: 1;
}

.aiwf-rail-dialog--wide {
	width: min(560px, calc(100vw - 32px));
}

.aiwf-rail-dialog__title {
	font-size: 14px;
	font-weight: 700;
	margin-bottom: 12px;
	color: var(--theme-text-primary, #edf2f4);
	letter-spacing: 0.02em;
	text-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 28%, transparent);
}

/* ── Input ── */
.aiwf-rail-input {
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 85%, transparent);
	color: var(--theme-text-primary, #edf2f4);
	padding: 8px;
	font-size: 12px;
	transition:
		border-color 180ms ease,
		box-shadow 180ms ease;
}

.aiwf-rail-input:focus {
	outline: none;
	border-color: var(--theme-accent, #1f9d84);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent),
		0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

/* ── Dialog actions ── */
.aiwf-rail-dialog__actions {
	margin-top: 14px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.aiwf-rail-dialog-btn {
	padding: 6px 12px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 85%, transparent);
	color: var(--theme-text-primary, #edf2f4);
	font-size: 12px;
	cursor: pointer;
	transition:
		border-color 160ms ease,
		background-color 160ms ease,
		color 160ms ease,
		box-shadow 160ms ease;
}

.aiwf-rail-dialog-btn:hover,
.aiwf-rail-dialog-btn:focus-visible {
	border-color: var(--theme-accent, #1f9d84);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 14%, transparent);
	color: var(--theme-accent, #1f9d84);
	outline: none;
}

.aiwf-rail-dialog-btn.is-primary {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 72%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.aiwf-rail-dialog-btn.is-primary:hover,
.aiwf-rail-dialog-btn.is-primary:focus-visible {
	border-color: var(--theme-accent-hover, #27b99c);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 32%, transparent);
	color: var(--theme-accent-hover, #27b99c);
	box-shadow: 0 0 14px color-mix(in srgb, var(--theme-accent, #1f9d84) 38%, transparent);
}

/* ── Project list in load dialog ── */
.aiwf-rail-project-list {
	max-height: 340px;
	overflow: auto;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
	border-radius: 2px;
	padding: 6px;
	display: grid;
	gap: 6px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent) transparent;
}

.aiwf-rail-project-item {
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 80%, transparent);
	color: var(--theme-text-primary, #edf2f4);
	padding: 6px;
	display: flex;
	align-items: center;
	gap: 8px;
	transition:
		border-color 160ms ease,
		background 160ms ease;
}

.aiwf-rail-project-item:hover {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
}

.aiwf-rail-project-main {
	flex: 1;
	min-width: 0;
	border: none;
	background: transparent;
	color: inherit;
	text-align: left;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	padding: 2px;
}

.aiwf-rail-project-name {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
}

.aiwf-rail-project-item small {
	color: var(--theme-text-muted, #aeb8bd);
	font-size: 11px;
}

.aiwf-rail-project-del {
	border: 1px solid color-mix(in srgb, var(--aiwf-color-danger, #cf5a46) 35%, transparent);
	border-radius: 2px;
	background: transparent;
	color: color-mix(in srgb, var(--aiwf-color-danger, #cf5a46) 70%, transparent);
	padding: 2px 8px;
	font-size: 11px;
	cursor: pointer;
	transition:
		border-color 160ms ease,
		background-color 160ms ease,
		color 160ms ease;
}

.aiwf-rail-project-del:hover {
	border-color: var(--aiwf-color-danger, #cf5a46);
	color: var(--aiwf-color-danger, #cf5a46);
	background: color-mix(in srgb, var(--aiwf-color-danger, #cf5a46) 12%, transparent);
}

.aiwf-rail-project-item.active {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 68%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 14%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.aiwf-rail-empty {
	color: var(--theme-text-muted, #aeb8bd);
	font-size: 12px;
	padding: 8px;
}

/* ── Search in load dialog ── */
.aiwf-rail-search-wrap {
	margin-bottom: 10px;
}

.aiwf-rail-search-input {
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--theme-bg-primary, #0f0f0f) 85%, transparent);
	color: var(--theme-text-primary, #edf2f4);
	padding: 8px 10px;
	font-size: 12px;
	transition:
		border-color 180ms ease,
		box-shadow 180ms ease;
}

.aiwf-rail-search-input::placeholder {
	color: color-mix(in srgb, var(--theme-text-muted, #aeb8bd) 60%, transparent);
}

.aiwf-rail-search-input:focus {
	outline: none;
	border-color: var(--theme-accent, #1f9d84);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent),
		0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

/* ── Project item with icon & info layout ── */
.aiwf-rail-project-main {
	flex: 1;
	min-width: 0;
	border: none;
	background: transparent;
	color: inherit;
	text-align: left;
	display: flex;
	align-items: center;
	gap: 10px;
	cursor: pointer;
	padding: 4px;
}

.aiwf-rail-project-icon {
	flex: 0 0 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme-accent, #1f9d84);
}

.aiwf-rail-project-icon svg {
	width: 14px;
	height: 14px;
}

.aiwf-rail-project-icon svg path {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.35;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.aiwf-rail-project-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

/* ── Dialog transitions ── */
.aiwf-rail-dialog-enter-active,
.aiwf-rail-dialog-leave-active {
	transition:
		opacity 200ms ease,
		transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.aiwf-rail-dialog-enter-from,
.aiwf-rail-dialog-leave-to {
	opacity: 0;
	transform: scale(0.97);
}

/* ── Responsive ── */
@media (max-width: 920px) {
	.aiwf-floating-rail__identity {
		max-width: 150px;
	}
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
	.aiwf-floating-rail,
	.aiwf-floating-rail:hover,
	.aiwf-floating-rail__btn,
	.aiwf-floating-rail__btn:hover,
	.aiwf-floating-rail-popover,
	.aiwf-rail-dialog,
	.aiwf-rail-dialog-btn {
		transition: none !important;
	}
	.rail-bracket {
		opacity: 1 !important;
	}
}

.aiwf-resource-list__footer {
	padding: 8px 12px;
	text-align: center;
	font-size: 11px;
	color: var(--theme-text-muted, #aeb8bd);
	opacity: 0.7;
}
</style>
