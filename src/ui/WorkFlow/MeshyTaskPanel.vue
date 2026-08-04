<template>
	<teleport to="body">
		<div
			v-if="open"
			ref="panelEl"
			class="wf-meshy-panel"
			:class="{ animating: !isInteracting }"
			:style="panelStyle"
			@pointerdown.stop
		>
			<div
				class="wf-meshy-panel-header"
				@pointerdown="onHeaderPointerDown"
				@dblclick="onHeaderDoubleClick"
			>
				<div class="wf-meshy-panel-title-wrap">
					<div class="wf-meshy-panel-title">{{ t('tasks.meshy.title') }}</div>
					<div class="wf-meshy-panel-subtitle">{{ t('tasks.meshy.subtitle') }}</div>
				</div>
				<div
					v-if="balanceText"
					class="wf-meshy-panel-balance"
					:class="`is-${balanceTone}`"
					:title="balanceDetail || balanceText"
				>
					<span class="wf-meshy-panel-balance-label">{{ t('tasks.meshy.balance') }}</span>
					<span class="wf-meshy-panel-balance-value">{{ balanceText }}</span>
				</div>
				<div class="wf-meshy-panel-actions" @pointerdown.stop>
					<button
						class="wf-meshy-panel-icon-btn"
						type="button"
						:title="
							targetFilter === 'all'
								? t('tasks.meshy.filterAll')
								: targetFilter === '3d'
									? t('tasks.meshy.filter3d')
									: t('tasks.meshy.filterImage')
						"
						@click="cycleTargetFilter"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-meshy-panel-icon">
							<path
								d="M2.5 3.5h11M4.5 7.5h7M6.5 11.5h3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
						</svg>
					</button>
					<button
						class="wf-meshy-panel-icon-btn"
						type="button"
						:title="sortModeTitle"
						@click="cycleSortMode"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-meshy-panel-icon">
							<path
								d="M4 3h8M4 6h6M4 9h4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
							<path v-if="sortMode === 'date-desc'" d="M12 12l-2-2h4z" fill="currentColor" />
							<path v-else d="M12 10l-2 2h4z" fill="currentColor" />
						</svg>
					</button>
					<button class="wf-meshy-panel-btn" type="button" @click="toggleMinimize">-</button>
					<button class="wf-meshy-panel-btn" type="button" @click="toggleMaximize">[]</button>
					<button class="wf-meshy-panel-btn danger" type="button" @click="emit('close')">x</button>
				</div>
			</div>

			<div v-if="!minimized" class="wf-meshy-panel-body">
				<div v-if="dataStatusText" class="wf-meshy-panel-status">
					{{ dataStatusText }}
				</div>
				<div class="wf-meshy-panel-toolbar">
					<input
						v-model.trim="searchText"
						class="wf-meshy-search"
						type="text"
						:placeholder="t('tasks.meshy.searchPlaceholder')"
					/>
					<button
						class="wf-meshy-panel-btn"
						type="button"
						:disabled="refreshBusy"
						@click="emit('refresh')"
					>
						{{ refreshBusy ? t('tasks.meshy.syncing') : t('tasks.meshy.syncBackend') }}
					</button>
					<div class="wf-meshy-panel-stats">
						{{ t('tasks.meshy.totalCount', { count: visibleTaskCount }) }}
					</div>
				</div>

				<div v-if="!filteredTasks.length" class="wf-meshy-panel-empty">
					{{ t('tasks.meshy.empty') }}
				</div>

				<div v-else class="wf-meshy-task-list">
					<div v-for="task in filteredTasks" :key="task.id" class="wf-meshy-task-tree">
						<div
							class="wf-meshy-task-card wf-meshy-task-card-root"
							draggable="true"
							@dragstart="onTaskDragStart($event, task)"
						>
							<div class="wf-meshy-task-card-top">
								<div class="wf-meshy-task-chip-row">
									<span class="wf-meshy-task-chip">
										{{
											task.target === 'image' ? t('tasks.meshy.typeImage') : t('tasks.meshy.type3d')
										}}
									</span>
									<span class="wf-meshy-task-chip subtle">{{ task.familyLabel }}</span>
									<span v-if="relationLabelForTask(task)" class="wf-meshy-task-chip subtle">
										{{ relationLabelForTask(task) }}
									</span>
									<span class="wf-meshy-task-chip status" :class="`is-${task.status}`">
										{{ task.statusLabel }}
									</span>
								</div>
								<div class="wf-meshy-task-date">{{ formatDate(task.createdAt) }}</div>
							</div>

							<div class="wf-meshy-task-main">
								<div class="wf-meshy-task-copy">
									<div class="wf-meshy-task-title">{{ task.title }}</div>
									<div class="wf-meshy-task-prompt">{{ task.promptPreview }}</div>
									<div class="wf-meshy-task-meta">{{ task.metaText }}</div>
									<div
										v-if="task.hasTextureChild || task.hasRiggingChild || task.hasAnimationChild"
										class="wf-meshy-task-related-row"
									>
										<span v-if="task.hasTextureChild" class="wf-meshy-task-related-chip">
											{{ t('tasks.meshy.hasTexture') }}
										</span>
										<span v-if="task.hasRiggingChild" class="wf-meshy-task-related-chip">
											{{ t('tasks.meshy.hasRigging') }}
										</span>
										<span v-if="task.hasAnimationChild" class="wf-meshy-task-related-chip">
											{{ t('tasks.meshy.hasAnimation') }}
										</span>
									</div>
								</div>
								<div v-if="taskThumbSrc(task)" class="wf-meshy-task-thumb-shell">
									<img
										class="wf-meshy-task-thumb"
										:src="taskThumbSrc(task)"
										alt="thumbnail"
										draggable="false"
										@error="onTaskThumbError(task.id)"
									/>
								</div>
							</div>

							<div class="wf-meshy-task-progress-row">
								<div class="wf-meshy-task-progress-track">
									<div
										class="wf-meshy-task-progress-fill"
										:style="{ width: `${task.progress}%` }"
									/>
								</div>
								<div class="wf-meshy-task-progress-label">{{ task.progress }}%</div>
							</div>

							<div class="wf-meshy-task-foot">
								<div class="wf-meshy-task-footnote">{{ rootFootnoteForTask(task) }}</div>
								<div class="wf-meshy-task-action-row">
									<button
										class="wf-meshy-task-preview-btn"
										type="button"
										@click="onPreviewTask(task.id)"
									>
										{{ t('tasks.meshy.viewDetails') }}
									</button>
									<button
										class="wf-meshy-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'refresh')"
										@click="onTaskAction(task, 'refresh')"
									>
										{{
											isBusy(task, 'refresh')
												? t('tasks.meshy.refreshing')
												: t('tasks.meshy.refreshStatus')
										}}
									</button>
									<button
										class="wf-meshy-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'import-output')"
										@click="onTaskAction(task, 'import-output')"
									>
										{{
											isBusy(task, 'import-output')
												? t('tasks.meshy.pulling')
												: t('tasks.meshy.pullArtifacts')
										}}
									</button>
									<button
										class="wf-meshy-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'stop')"
										@click="onTaskAction(task, 'stop')"
									>
										{{
											isBusy(task, 'stop') ? t('tasks.meshy.stopping') : t('tasks.meshy.stopTask')
										}}
									</button>
									<button
										class="wf-meshy-task-preview-btn danger"
										type="button"
										:disabled="isBusy(task, 'delete')"
										@click="onTaskAction(task, 'delete')"
									>
										{{
											isBusy(task, 'delete')
												? t('tasks.meshy.deleting')
												: t('tasks.meshy.deleteTask')
										}}
									</button>
								</div>
							</div>
						</div>

						<div v-if="task.children?.length" class="wf-meshy-task-children">
							<div
								v-for="child in task.children"
								:key="child.id"
								class="wf-meshy-task-child"
								draggable="true"
								@dragstart="onTaskDragStart($event, child)"
							>
								<div class="wf-meshy-task-child-rail" />
								<div class="wf-meshy-task-child-body">
									<div class="wf-meshy-task-child-top">
										<div class="wf-meshy-task-chip-row">
											<span class="wf-meshy-task-chip subtle">
												{{ relationLabelForTask(child) }}
											</span>
											<span class="wf-meshy-task-chip subtle">{{ child.familyLabel }}</span>
											<span class="wf-meshy-task-chip status" :class="`is-${child.status}`">
												{{ child.statusLabel }}
											</span>
										</div>
										<div class="wf-meshy-task-date">
											{{ formatDate(child.createdAt) }}
										</div>
									</div>
									<div class="wf-meshy-task-child-main">
										<div class="wf-meshy-task-child-copy">
											<div class="wf-meshy-task-child-title">{{ child.title }}</div>
											<div class="wf-meshy-task-child-meta">{{ child.metaText }}</div>
										</div>
										<div class="wf-meshy-task-action-row">
											<button
												class="wf-meshy-task-preview-btn"
												type="button"
												@click="onPreviewTask(child.id)"
											>
												{{ t('tasks.meshy.details') }}
											</button>
											<button
												class="wf-meshy-task-preview-btn"
												type="button"
												:disabled="isBusy(child, 'refresh')"
												@click="onTaskAction(child, 'refresh')"
											>
												{{ t('tasks.meshy.refresh') }}
											</button>
											<button
												class="wf-meshy-task-preview-btn"
												type="button"
												:disabled="isBusy(child, 'import-output')"
												@click="onTaskAction(child, 'import-output')"
											>
												{{ t('tasks.meshy.pull') }}
											</button>
											<button
												class="wf-meshy-task-preview-btn"
												type="button"
												:disabled="isBusy(child, 'stop')"
												@click="onTaskAction(child, 'stop')"
											>
												{{ t('tasks.meshy.stop') }}
											</button>
											<button
												class="wf-meshy-task-preview-btn danger"
												type="button"
												:disabled="isBusy(child, 'delete')"
												@click="onTaskAction(child, 'delete')"
											>
												{{ t('tasks.meshy.delete') }}
											</button>
										</div>
									</div>
									<div class="wf-meshy-task-progress-row wf-meshy-task-progress-row-child">
										<div class="wf-meshy-task-progress-track">
											<div
												class="wf-meshy-task-progress-fill"
												:style="{ width: `${child.progress}%` }"
											/>
										</div>
										<div class="wf-meshy-task-progress-label">{{ child.progress }}%</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div v-if="detailVisible" class="wf-meshy-task-detail-mask" @click.self="closeDetail">
					<div class="wf-meshy-task-detail" @click.stop>
						<div class="wf-meshy-task-detail-header">
							<div class="wf-meshy-task-detail-title-wrap">
								<div class="wf-meshy-task-detail-title">
									{{ detailTask?.title || t('tasks.meshy.detailTitle') }}
								</div>
								<div class="wf-meshy-task-detail-subtitle">
									{{ detailTask?.familyLabel || t('tasks.meshy.detailSubtitle') }} ·
									{{ detailTask?.statusLabel || t('tasks.meshy.loading') }}
								</div>
							</div>
							<div class="wf-meshy-task-action-row">
								<button
									class="wf-meshy-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId || detailLoading"
									@click="onDetailAction('refresh')"
								>
									{{ t('tasks.meshy.refreshStatus') }}
								</button>
								<button
									class="wf-meshy-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('import-output')"
								>
									{{ t('tasks.meshy.pullArtifacts') }}
								</button>
								<button
									class="wf-meshy-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('stop')"
								>
									{{ t('tasks.meshy.stopTask') }}
								</button>
								<button
									class="wf-meshy-task-preview-btn danger"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('delete')"
								>
									{{ t('tasks.meshy.deleteTask') }}
								</button>
								<button class="wf-meshy-panel-btn danger" type="button" @click="closeDetail">
									{{ t('common.close') }}
								</button>
							</div>
						</div>

						<div v-if="detailLoading" class="wf-meshy-task-detail-loading">
							{{ t('tasks.meshy.loadingDetails') }}
						</div>
						<div v-else-if="detailTask" class="wf-meshy-task-detail-body">
							<div class="wf-meshy-task-detail-grid">
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.taskId') }}</div>
									<div class="wf-meshy-task-detail-value monospace">
										{{ detailTask.taskId || t('tasks.meshy.notWritten') }}
									</div>
								</div>
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.source') }}</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.sourceLabel || t('tasks.meshy.localNode') }}
									</div>
								</div>
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.chain') }}</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.targetLabel }}
									</div>
								</div>
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">
										{{ t('tasks.meshy.imageInputCount') }}
									</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.imageCount ?? 0 }}
									</div>
								</div>
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.createdAt') }}</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.createdAtLabel || '-' }}
									</div>
								</div>
								<div class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.updatedAt') }}</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.updatedAtLabel || '-' }}
									</div>
								</div>
								<div v-if="detailTask.aiModel" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">AI 模型</div>
									<div class="wf-meshy-task-detail-value highlight">
										{{ detailTask.aiModel }}
									</div>
								</div>
								<div v-if="detailTask.aspectRatio" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">宽高比</div>
									<div class="wf-meshy-task-detail-value highlight">
										{{ detailTask.aspectRatio }}
									</div>
								</div>
								<div v-if="detailTask.outputCount" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">输出数量</div>
									<div class="wf-meshy-task-detail-value">{{ detailTask.outputCount }} 张</div>
								</div>
								<div v-if="detailTask.poseMode" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">姿态模式</div>
									<div class="wf-meshy-task-detail-value">
										{{ detailTask.poseMode }}
									</div>
								</div>
								<div v-if="detailTask.generateMultiView" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">多视图</div>
									<div class="wf-meshy-task-detail-value highlight">已启用</div>
								</div>
								<div v-if="detailTask.seed != null" class="wf-meshy-task-detail-card">
									<div class="wf-meshy-task-detail-label">随机种子</div>
									<div class="wf-meshy-task-detail-value monospace">
										{{ detailTask.seed }}
									</div>
								</div>
							</div>

							<div v-if="detailTask.prompt" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.prompt') }}</div>
								<div class="wf-meshy-task-detail-block">{{ detailTask.prompt }}</div>
							</div>
							<div v-if="detailTask.negativePrompt" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.negativePrompt') }}</div>
								<div class="wf-meshy-task-detail-block">
									{{ detailTask.negativePrompt }}
								</div>
							</div>
							<div v-if="detailTask.statusText" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.statusDesc') }}</div>
								<div class="wf-meshy-task-detail-block">{{ detailTask.statusText }}</div>
							</div>
							<div v-if="detailTask.errorMessage" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.errorMessage') }}</div>
								<div class="wf-meshy-task-detail-block error">
									{{ detailTask.errorMessage }}
								</div>
							</div>
							<div
								v-if="detailTask.preferredModelUrl || detailTask.assetUrl || detailTask.assetPath"
								class="wf-meshy-task-detail-section"
							>
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.artifacts') }}</div>
								<div class="wf-meshy-task-detail-links">
									<div
										v-if="detailTask.preferredModelUrl"
										class="wf-meshy-task-detail-block monospace"
									>
										{{ t('tasks.meshy.remotePreferred') }}{{ detailTask.preferredModelUrl }}
									</div>
									<div v-if="detailTask.assetUrl" class="wf-meshy-task-detail-block monospace">
										{{ t('tasks.meshy.localMirrorUrl') }}{{ detailTask.assetUrl }}
									</div>
									<div v-if="detailTask.assetPath" class="wf-meshy-task-detail-block monospace">
										{{ t('tasks.meshy.localMirrorPath') }}{{ detailTask.assetPath }}
									</div>
								</div>
							</div>
							<div v-if="detailRequestJson" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.requestPayload') }}</div>
								<pre class="wf-meshy-task-detail-code">{{ detailRequestJson }}</pre>
							</div>
							<div v-if="detailResponseJson" class="wf-meshy-task-detail-section">
								<div class="wf-meshy-task-detail-label">{{ t('tasks.meshy.responsePayload') }}</div>
								<pre class="wf-meshy-task-detail-code">{{ detailResponseJson }}</pre>
							</div>
						</div>
						<div v-else class="wf-meshy-task-detail-empty">{{ t('tasks.meshy.noDetails') }}</div>
					</div>
				</div>
			</div>

			<div
				class="wf-meshy-resize wf-meshy-resize-n"
				@pointerdown.stop="onResizeStart('n', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-s"
				@pointerdown.stop="onResizeStart('s', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-e"
				@pointerdown.stop="onResizeStart('e', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-w"
				@pointerdown.stop="onResizeStart('w', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-ne"
				@pointerdown.stop="onResizeStart('ne', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-nw"
				@pointerdown.stop="onResizeStart('nw', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-se"
				@pointerdown.stop="onResizeStart('se', $event)"
			/>
			<div
				class="wf-meshy-resize wf-meshy-resize-sw"
				@pointerdown.stop="onResizeStart('sw', $event)"
			/>
		</div>
	</teleport>
</template>

<script lang="ts">
export type MeshyTaskPanelItem = {
	id: string
	nodeId: string
	title: string
	taskId?: string
	target: '3d' | 'image'
	family: string
	familyLabel: string
	status: 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
	statusLabel: string
	progress: number
	promptPreview: string
	metaText: string
	relationKind?: string
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: string[]
	thumbnailUrl?: string
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
	effectiveTaskId?: string
	effectiveRelationKind?: string
	effectivePreferredModelUrl?: string
	effectiveThumbnailUrl?: string
	children?: MeshyTaskPanelItem[]
	createdAt: number
	payload: Record<string, unknown>
}

export type MeshyTaskPanelDetail = {
	id: string
	title: string
	taskId?: string
	nodeId?: string
	targetLabel: string
	familyLabel: string
	status: string
	statusLabel: string
	progress: number
	prompt?: string
	negativePrompt?: string
	statusText?: string
	errorMessage?: string
	preferredModelUrl?: string
	assetUrl?: string
	assetPath?: string
	thumbnailUrl?: string
	imageCount?: number
	createdAtLabel?: string
	updatedAtLabel?: string
	sourceLabel?: string
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
	aiModel?: string
	aspectRatio?: string
	outputCount?: number
	poseMode?: string
	generateMultiView?: boolean
	seed?: number | string
}

export type MeshyTaskPanelAction = 'refresh' | 'stop' | 'delete' | 'import-output'
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
	open: boolean
	tasks: MeshyTaskPanelItem[]
	dataStatusText?: string
	balanceText?: string
	balanceDetail?: string
	balanceTone?: 'muted' | 'warn' | 'ok'
	refreshBusy?: boolean
	detailTaskId?: string
	detailTask?: MeshyTaskPanelDetail | null
	detailLoading?: boolean
	actionBusyTaskId?: string
	actionBusyType?: MeshyTaskPanelAction | ''
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'preview-task', taskId: string): void
	(e: 'refresh'): void
	(
		e: 'task-action',
		payload: {
			taskId: string
			mode?: string
			action: MeshyTaskPanelAction
			nodeId?: string
		}
	): void
}>()

const panelEl = ref<HTMLElement | null>(null)
const minimized = ref(false)
const maximized = ref(false)
const position = ref({ x: 452, y: 16 })
const size = ref({ w: 460, h: 520 })
const isInteracting = ref(false)
const searchText = ref('')
const targetFilter = ref<'all' | '3d' | 'image'>('all')
const sortMode = ref<'date-desc' | 'date-asc'>('date-desc')
const openedDetailTaskId = ref('')
const failedTaskThumbIds = ref<Set<string>>(new Set())

const taskThumbSrc = (task: MeshyTaskPanelItem) => {
	const id = String(task?.id ?? '').trim()
	if (!id) return ''
	if (failedTaskThumbIds.value.has(id)) return ''
	return String(task?.thumbnailUrl ?? '').trim()
}

const onTaskThumbError = (taskId: string) => {
	const id = String(taskId || '').trim()
	if (!id) return
	const next = new Set(failedTaskThumbIds.value)
	next.add(id)
	failedTaskThumbIds.value = next
}

let drag: {
	startX: number
	startY: number
	originX: number
	originY: number
} | null = null

let resize: {
	dir: string
	startX: number
	startY: number
	startW: number
	startH: number
	startLeft: number
	startTop: number
} | null = null

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const safeTopInset = () => {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--aiwf-safe-top')
	const parsed = Number.parseFloat(String(raw || '').trim())
	if (!Number.isFinite(parsed)) return 0
	return Math.max(0, parsed)
}
const minTopBound = (pad = 12) => Math.max(pad, Math.round(safeTopInset()) + 8)
const MIN_WIDTH = 360
const MIN_HEIGHT = 240
const MINIMIZED_HEIGHT = 36

const resetPosition = () => {
	const pad = 16
	const minTop = minTopBound(pad)
	const w = size.value.w
	const h = size.value.h
	position.value = {
		x: clamp(window.innerWidth - w - pad, pad, Math.max(pad, window.innerWidth - w - pad)),
		y: minTop
	}
}

watch(
	() => props.open,
	(open) => {
		if (!open) return
		minimized.value = false
		maximized.value = false
		size.value = { w: 460, h: 520 }
		resetPosition()
	}
)

watch(
	() => props.open,
	(open) => {
		if (open) return
		openedDetailTaskId.value = ''
	}
)

watch(
	() => props.tasks,
	(next) => {
		const keep = new Set(
			(Array.isArray(next) ? next : [])
				.map((task) => String(task?.id ?? '').trim())
				.filter((id) => !!id)
		)
		const remained = new Set<string>()
		for (const id of failedTaskThumbIds.value.values()) {
			if (keep.has(id)) remained.add(id)
		}
		failedTaskThumbIds.value = remained
	}
)

const filteredTasks = computed(() => {
	const keyword = searchText.value.trim().toLowerCase()
	let list = Array.isArray(props.tasks) ? props.tasks.slice() : []
	if (targetFilter.value !== 'all') list = list.filter((item) => item.target === targetFilter.value)

	const matchesKeyword = (item: MeshyTaskPanelItem) => {
		const hay = [
			item.title,
			item.familyLabel,
			item.promptPreview,
			item.metaText,
			item.taskId,
			relationLabelForTask(item)
		]
			.map((x) => String(x ?? '').toLowerCase())
			.join('\n')
		return hay.includes(keyword)
	}

	if (keyword) {
		const nextList: MeshyTaskPanelItem[] = []
		for (const item of list) {
			const childList = Array.isArray(item.children) ? item.children.slice() : []
			const matchedChildren = childList.filter(matchesKeyword)
			if (matchesKeyword(item)) {
				nextList.push({ ...item, children: childList })
				continue
			}
			if (matchedChildren.length) {
				nextList.push({ ...item, children: matchedChildren })
			}
		}
		list = nextList
	}

	list.sort((a, b) =>
		sortMode.value === 'date-asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
	)
	return list.map((item) => ({
		...item,
		children: Array.isArray(item.children)
			? item.children
					.slice()
					.sort((a, b) =>
						sortMode.value === 'date-asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
					)
			: []
	}))
})

const visibleTaskCount = computed(() =>
	filteredTasks.value.reduce(
		(sum, item) => sum + 1 + (Array.isArray(item.children) ? item.children.length : 0),
		0
	)
)

const sortModeTitle = computed(() =>
	sortMode.value === 'date-desc' ? t('tasks.meshy.sortDesc') : t('tasks.meshy.sortAsc')
)
const detailTask = computed(() => props.detailTask ?? null)
const detailVisible = computed(() => !!openedDetailTaskId.value)
const detailLoading = computed(
	() => props.detailLoading === true && openedDetailTaskId.value === props.detailTaskId
)
const detailRequestJson = computed(() => {
	if (!detailTask.value?.requestPayload) return ''
	try {
		return JSON.stringify(detailTask.value.requestPayload, null, 2)
	} catch {
		return ''
	}
})
const detailResponseJson = computed(() => {
	if (!detailTask.value?.responsePayload) return ''
	try {
		return JSON.stringify(detailTask.value.responsePayload, null, 2)
	} catch {
		return ''
	}
})

const relationLabelForTask = (task: MeshyTaskPanelItem) => {
	const value = String(task.effectiveRelationKind ?? task.relationKind ?? '').trim()
	if (value === 'texture') return t('tasks.meshy.relation.texture')
	if (value === 'rigging') return t('tasks.meshy.relation.rigging')
	if (value === 'animation') return t('tasks.meshy.relation.animation')
	if (value === 'remesh') return t('tasks.meshy.relation.remesh')
	if (value === 'uv-unwrap') return t('tasks.meshy.relation.uvUnwrap')
	if (value === 'model') return t('tasks.meshy.relation.model')
	return ''
}

const rootFootnoteForTask = (task: MeshyTaskPanelItem) => {
	const effective = String(task.effectiveRelationKind ?? task.relationKind ?? 'model').trim()
	if (effective === 'texture') return t('tasks.meshy.footnote.texture')
	if (effective === 'rigging') return t('tasks.meshy.footnote.rigging')
	if (effective === 'animation') return t('tasks.meshy.footnote.animation')
	return t('tasks.meshy.footnote.model')
}

const cycleSortMode = () => {
	sortMode.value = sortMode.value === 'date-desc' ? 'date-asc' : 'date-desc'
}

const cycleTargetFilter = () => {
	targetFilter.value =
		targetFilter.value === 'all' ? '3d' : targetFilter.value === '3d' ? 'image' : 'all'
}

const toggleMinimize = () => {
	minimized.value = !minimized.value
	if (!minimized.value) return
	const pad = 16
	const minTop = minTopBound(pad)
	position.value = {
		x: clamp(position.value.x, pad, Math.max(pad, window.innerWidth - size.value.w - pad)),
		y: clamp(
			window.innerHeight - MINIMIZED_HEIGHT - pad,
			minTop,
			Math.max(minTop, window.innerHeight - MINIMIZED_HEIGHT - pad)
		)
	}
}

const toggleMaximize = () => {
	maximized.value = !maximized.value
	const pad = 12
	const minTop = minTopBound(pad)
	if (maximized.value) {
		position.value = { x: pad, y: minTop }
		size.value = {
			w: Math.max(MIN_WIDTH, window.innerWidth - pad * 2),
			h: Math.max(MIN_HEIGHT, window.innerHeight - minTop - pad)
		}
		return
	}
	size.value = { w: 460, h: 520 }
	resetPosition()
}

const onTaskDragStart = (event: DragEvent, task: MeshyTaskPanelItem) => {
	const dt = event.dataTransfer
	if (!dt) return
	try {
		dt.effectAllowed = 'copy'
		dt.setData('application/x-dweb-meshy-task-item', JSON.stringify(task.payload))
		dt.setData('text/plain', task.promptPreview || task.title)
	} catch {
		// ignore
	}
}

const formatDate = (ts: number) => {
	const d = new Date(Number(ts) || Date.now())
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const dd = String(d.getDate()).padStart(2, '0')
	const hh = String(d.getHours()).padStart(2, '0')
	const mi = String(d.getMinutes()).padStart(2, '0')
	return `${mm}-${dd} ${hh}:${mi}`
}

const closeDetail = () => {
	openedDetailTaskId.value = ''
}

const onPreviewTask = (taskId: string) => {
	openedDetailTaskId.value = taskId
	emit('preview-task', taskId)
}

const isBusy = (task: MeshyTaskPanelItem, action: MeshyTaskPanelAction) => {
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return false
	return (
		String(props.actionBusyTaskId ?? '').trim() === taskId &&
		String(props.actionBusyType ?? '').trim() === action
	)
}

const onTaskAction = (task: MeshyTaskPanelItem, action: MeshyTaskPanelAction) => {
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return
	emit('task-action', {
		taskId,
		mode: String(task.family ?? '').trim() || undefined,
		action,
		nodeId: String(task.nodeId ?? '').trim() || undefined
	})
}

const onDetailAction = (action: MeshyTaskPanelAction) => {
	const task = detailTask.value
	if (!task) return
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return
	const findById = (list: MeshyTaskPanelItem[], id: string): MeshyTaskPanelItem | null => {
		for (const entry of list) {
			if (entry.id === id) return entry
			if (Array.isArray(entry.children) && entry.children.length) {
				const matched = findById(entry.children, id)
				if (matched) return matched
			}
		}
		return null
	}
	const selected = findById(Array.isArray(props.tasks) ? props.tasks : [], openedDetailTaskId.value)
	emit('task-action', {
		taskId,
		mode: String(selected?.family ?? '').trim() || undefined,
		action,
		nodeId: String(task.nodeId ?? '').trim() || undefined
	})
}

const panelStyle = computed(() => ({
	left: `${position.value.x}px`,
	top: `${position.value.y}px`,
	width: `${size.value.w}px`,
	height: minimized.value ? `${MINIMIZED_HEIGHT}px` : `${size.value.h}px`
}))

const dataStatusText = computed(() => String(props.dataStatusText ?? '').trim())
const balanceText = computed(() => String(props.balanceText ?? '').trim())
const balanceDetail = computed(() => String(props.balanceDetail ?? '').trim())
const balanceTone = computed(() => {
	const value = String(props.balanceTone ?? 'muted').trim()
	return value === 'ok' || value === 'warn' ? value : 'muted'
})

const setGlobalPanelInteraction = (active: boolean) => {
	document.body.classList.toggle('wf-meshy-panel-no-select', active)
}

const onHeaderPointerDown = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (maximized.value) return
	const target = event.target as HTMLElement | null
	if (target?.closest('button, .wf-meshy-resize')) return
	event.preventDefault()
	const startX = event.clientX
	const startY = event.clientY
	const startLeft = position.value.x
	const startTop = position.value.y
	isInteracting.value = true
	setGlobalPanelInteraction(true)
	drag = {
		startX,
		startY,
		originX: startLeft,
		originY: startTop
	}
	const move = (ev: PointerEvent) => {
		if (!drag) return
		const pad = 12
		const minTop = minTopBound(pad)
		const nextX = clamp(
			drag.originX + (ev.clientX - drag.startX),
			pad,
			Math.max(pad, window.innerWidth - size.value.w - pad)
		)
		const currentHeight = minimized.value ? MINIMIZED_HEIGHT : size.value.h
		const nextY = clamp(
			drag.originY + (ev.clientY - drag.startY),
			minTop,
			Math.max(minTop, window.innerHeight - currentHeight - pad)
		)
		position.value = { x: nextX, y: nextY }
	}
	const up = () => {
		drag = null
		isInteracting.value = false
		setGlobalPanelInteraction(false)
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
		window.removeEventListener('pointercancel', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up, { once: true })
	window.addEventListener('pointercancel', up, { once: true })
}

const onHeaderDoubleClick = () => toggleMaximize()

const onResizeStart = (dir: string, event: PointerEvent) => {
	if (event.button !== 0) return
	if (maximized.value) return
	event.preventDefault()
	if (minimized.value) minimized.value = false
	isInteracting.value = true
	setGlobalPanelInteraction(true)
	resize = {
		dir,
		startX: event.clientX,
		startY: event.clientY,
		startW: size.value.w,
		startH: size.value.h,
		startLeft: position.value.x,
		startTop: position.value.y
	}
	const move = (ev: PointerEvent) => {
		if (!resize) return
		const dx = ev.clientX - resize.startX
		const dy = ev.clientY - resize.startY
		let nextW = resize.startW
		let nextH = resize.startH
		let nextLeft = resize.startLeft
		let nextTop = resize.startTop

		if (resize.dir.includes('e')) nextW = resize.startW + dx
		if (resize.dir.includes('s')) nextH = resize.startH + dy
		if (resize.dir.includes('w')) {
			nextW = resize.startW - dx
			nextLeft = resize.startLeft + dx
		}
		if (resize.dir.includes('n')) {
			nextH = resize.startH - dy
			nextTop = resize.startTop + dy
		}

		nextW = Math.max(MIN_WIDTH, nextW)
		nextH = Math.max(MIN_HEIGHT, nextH)

		const minTop = minTopBound(12)
		const maxLeft = Math.max(12, window.innerWidth - nextW - 12)
		const maxTop = Math.max(minTop, window.innerHeight - nextH - 12)
		nextLeft = clamp(nextLeft, 12, maxLeft)
		nextTop = clamp(nextTop, minTop, maxTop)

		size.value = { w: nextW, h: nextH }
		position.value = { x: nextLeft, y: nextTop }
	}
	const up = () => {
		resize = null
		isInteracting.value = false
		setGlobalPanelInteraction(false)
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
		window.removeEventListener('pointercancel', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up, { once: true })
	window.addEventListener('pointercancel', up, { once: true })
}

onBeforeUnmount(() => {
	drag = null
	resize = null
	setGlobalPanelInteraction(false)
})
</script>

<style scoped>
.wf-meshy-panel {
	position: fixed;
	z-index: var(--aiwf-floating-z-index, 101);
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: linear-gradient(
		180deg,
		rgb(from var(--dweb-defualt-dark) r g b / 0.92),
		rgb(from var(--dweb-defualt) r g b / 0.88)
	);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.34);
	backdrop-filter: blur(12px);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.wf-meshy-panel.animating {
	transition:
		left 0.16s ease,
		top 0.16s ease,
		width 0.16s ease,
		height 0.16s ease;
}

.wf-meshy-panel-status {
	margin-bottom: 10px;
	padding: 8px 10px;
	border: 1px solid rgba(99, 162, 255, 0.24);
	background: rgba(99, 162, 255, 0.1);
	color: rgba(231, 238, 255, 0.92);
	font-size: 12px;
	line-height: 1.5;
	min-height: 52px;
	box-sizing: border-box;
	overflow: hidden;
}

.wf-meshy-resize {
	position: absolute;
	z-index: 2;
	background: transparent;
}

.wf-meshy-resize-n,
.wf-meshy-resize-s {
	left: 8px;
	right: 8px;
	height: 6px;
	cursor: ns-resize;
}

.wf-meshy-resize-n {
	top: -3px;
}

.wf-meshy-resize-s {
	bottom: -3px;
}

.wf-meshy-resize-e,
.wf-meshy-resize-w {
	top: 8px;
	bottom: 8px;
	width: 6px;
	cursor: ew-resize;
}

.wf-meshy-resize-e {
	right: -3px;
}

.wf-meshy-resize-w {
	left: -3px;
}

.wf-meshy-resize-ne,
.wf-meshy-resize-nw,
.wf-meshy-resize-se,
.wf-meshy-resize-sw {
	width: 10px;
	height: 10px;
}

.wf-meshy-resize-ne {
	top: -5px;
	right: -5px;
	cursor: nesw-resize;
}

.wf-meshy-resize-nw {
	top: -5px;
	left: -5px;
	cursor: nwse-resize;
}

.wf-meshy-resize-se {
	right: -5px;
	bottom: -5px;
	cursor: nwse-resize;
}

.wf-meshy-resize-sw {
	left: -5px;
	bottom: -5px;
	cursor: nesw-resize;
}

.wf-meshy-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 10px;
	border-bottom: 1px solid var(--vscode-border);
	cursor: move;
	user-select: none;
}

.wf-meshy-panel-title-wrap {
	min-width: 0;
	display: grid;
	gap: 2px;
}

.wf-meshy-panel-title {
	font-size: 13px;
	color: var(--vscode-fg);
}

.wf-meshy-panel-subtitle {
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.wf-meshy-panel-actions {
	display: flex;
	gap: 6px;
	margin-left: auto;
}

.wf-meshy-panel-balance {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 5px 10px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	font-size: 11px;
}

.wf-meshy-panel-balance-label {
	color: var(--vscode-fg-muted);
}

.wf-meshy-panel-balance-value {
	max-width: 120px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wf-meshy-panel-balance.is-ok {
	border-color: rgb(56 189 140 / 0.55);
	color: #bbf7d0;
}

.wf-meshy-panel-balance.is-warn {
	border-color: rgb(248 113 113 / 0.55);
	color: #fecaca;
}

.wf-meshy-panel-btn,
.wf-meshy-panel-icon-btn,
.wf-meshy-task-preview-btn {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.68);
	color: var(--vscode-fg);
	font-size: 12px;
	padding: 4px 8px;
	cursor: pointer;
}

.wf-meshy-panel-btn:disabled,
.wf-meshy-panel-icon-btn:disabled,
.wf-meshy-task-preview-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-meshy-panel-btn.danger {
	color: #fecaca;
}

.wf-meshy-task-preview-btn.danger {
	color: #fecaca;
}

.wf-meshy-panel-icon {
	width: 14px;
	height: 14px;
}

.wf-meshy-panel-body {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px;
	min-height: 0;
	flex: 1;
}

.wf-meshy-panel-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
}

.wf-meshy-search {
	flex: 1;
	min-width: 0;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
}

.wf-meshy-panel-stats,
.wf-meshy-panel-empty,
.wf-meshy-task-meta,
.wf-meshy-task-footnote,
.wf-meshy-task-date,
.wf-meshy-task-progress-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-meshy-task-list {
	min-height: 0;
	overflow: auto;
	display: grid;
	align-content: start;
	grid-auto-rows: max-content;
	gap: 10px;
}

.wf-meshy-task-tree {
	display: grid;
	align-content: start;
	gap: 8px;
}

:global(body.wf-meshy-panel-no-select) {
	user-select: none;
	-webkit-user-select: none;
}

.wf-meshy-task-card {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
	padding: 10px;
	display: grid;
	gap: 10px;
	overflow: hidden;
}

.wf-meshy-task-card-root {
	height: 196px;
	grid-template-rows: auto 1fr auto auto;
}

.wf-meshy-task-card-top,
.wf-meshy-task-foot,
.wf-meshy-task-progress-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wf-meshy-task-action-row {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.wf-meshy-task-chip-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wf-meshy-task-chip {
	padding: 2px 7px;
	border: 1px solid rgb(90 180 255 / 0.48);
	color: #9ed2ff;
	font-size: 11px;
}

.wf-meshy-task-related-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wf-meshy-task-related-chip {
	padding: 2px 7px;
	border: 1px solid rgb(52 211 153 / 0.42);
	color: #bbf7d0;
	font-size: 11px;
}

.wf-meshy-task-chip.subtle {
	border-color: rgb(from var(--vscode-border) r g b / 0.68);
	color: var(--vscode-fg-muted);
}

.wf-meshy-task-chip.status.is-running,
.wf-meshy-task-chip.status.is-pending {
	border-color: rgb(90 180 255 / 0.68);
}

.wf-meshy-task-chip.status.is-succeeded {
	border-color: rgb(56 189 140 / 0.72);
	color: #bbf7d0;
}

.wf-meshy-task-chip.status.is-failed {
	border-color: rgb(248 113 113 / 0.72);
	color: #fecaca;
}

.wf-meshy-task-main {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 90px;
	gap: 10px;
	min-height: 0;
}

.wf-meshy-task-copy {
	min-width: 0;
	display: grid;
	gap: 6px;
}

.wf-meshy-task-title {
	font-size: 13px;
	color: var(--vscode-fg);
	line-height: 1.35;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-meshy-task-prompt {
	font-size: 12px;
	color: var(--vscode-fg);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-meshy-task-thumb-shell {
	width: 90px;
	height: 90px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	overflow: hidden;
	display: grid;
	place-items: center;
}

.wf-meshy-task-thumb {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-meshy-task-progress-track {
	flex: 1;
	height: 6px;
	background: rgb(255 255 255 / 0.08);
	overflow: hidden;
}

.wf-meshy-task-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #38bdf8, #34d399);
}

.wf-meshy-task-children {
	display: grid;
	gap: 6px;
	padding-left: 18px;
}

.wf-meshy-task-child {
	display: grid;
	grid-template-columns: 12px minmax(0, 1fr);
	gap: 8px;
	align-items: stretch;
	min-height: 0;
}

.wf-meshy-task-child-rail {
	position: relative;
}

.wf-meshy-task-child-rail::before {
	content: '';
	position: absolute;
	left: 5px;
	top: 0;
	bottom: 0;
	width: 1px;
	background: rgb(90 180 255 / 0.28);
}

.wf-meshy-task-child-rail::after {
	content: '';
	position: absolute;
	left: 5px;
	top: 18px;
	width: 10px;
	height: 1px;
	background: rgb(90 180 255 / 0.28);
}

.wf-meshy-task-child-body {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.78);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.46);
	padding: 8px 10px;
	display: grid;
	gap: 8px;
	height: 112px;
	box-sizing: border-box;
	overflow: hidden;
	grid-template-rows: auto 1fr auto;
}

.wf-meshy-task-child-top,
.wf-meshy-task-child-main {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wf-meshy-task-child-main .wf-meshy-task-action-row {
	max-width: 58%;
}

.wf-meshy-task-child-copy {
	min-width: 0;
	display: grid;
	gap: 4px;
}

.wf-meshy-task-child-title {
	font-size: 12px;
	color: var(--vscode-fg);
	line-height: 1.35;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-meshy-task-child-meta {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-meshy-task-progress-row-child {
	gap: 8px;
}

.wf-meshy-task-detail-mask {
	position: absolute;
	inset: 0;
	z-index: 4;
	display: flex;
	justify-content: flex-end;
	background: rgba(6, 10, 18, 0.42);
}

.wf-meshy-task-detail {
	width: min(420px, 100%);
	height: 100%;
	display: flex;
	flex-direction: column;
	border-left: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: linear-gradient(
		180deg,
		rgb(from var(--dweb-defualt-dark) r g b / 0.96),
		rgb(from var(--dweb-defualt) r g b / 0.9)
	);
}

.wf-meshy-task-detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 12px;
	border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
}

.wf-meshy-task-detail-title-wrap {
	min-width: 0;
	display: grid;
	gap: 4px;
}

.wf-meshy-task-detail-title {
	font-size: 14px;
	color: var(--vscode-fg);
}

.wf-meshy-task-detail-subtitle,
.wf-meshy-task-detail-loading,
.wf-meshy-task-detail-empty,
.wf-meshy-task-detail-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-meshy-task-detail-loading,
.wf-meshy-task-detail-empty {
	padding: 14px 12px;
}

.wf-meshy-task-detail-body {
	flex: 1;
	min-height: 0;
	overflow: auto;
	display: grid;
	gap: 12px;
	padding: 12px;
}

.wf-meshy-task-detail-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-meshy-task-detail-card,
.wf-meshy-task-detail-block,
.wf-meshy-task-detail-code {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
}

.wf-meshy-task-detail-card {
	padding: 10px;
	display: grid;
	gap: 6px;
}

.wf-meshy-task-detail-value {
	font-size: 12px;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-meshy-task-detail-value.monospace,
.wf-meshy-task-detail-block.monospace,
.wf-meshy-task-detail-code {
	font-family: Consolas, 'Courier New', monospace;
}

.wf-meshy-task-detail-value.highlight {
	color: #9ed2ff;
	font-weight: 500;
}

.wf-meshy-task-detail-section {
	display: grid;
	gap: 6px;
}

.wf-meshy-task-detail-block {
	padding: 10px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-meshy-task-detail-block.error {
	color: #fecaca;
}

.wf-meshy-task-detail-links {
	display: grid;
	gap: 6px;
}

.wf-meshy-task-detail-code {
	margin: 0;
	padding: 10px;
	overflow: auto;
	font-size: 11px;
	line-height: 1.55;
	color: #dbeafe;
	white-space: pre-wrap;
}

@media (max-width: 720px) {
	.wf-meshy-task-main {
		grid-template-columns: 1fr;
	}

	.wf-meshy-task-thumb-shell {
		width: 100%;
		height: 120px;
	}

	.wf-meshy-task-detail {
		width: 100%;
	}

	.wf-meshy-task-detail-grid {
		grid-template-columns: 1fr;
	}
}
</style>
