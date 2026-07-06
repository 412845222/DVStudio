<template>
	<teleport to="body">
		<div
			v-if="open"
			ref="panelEl"
			class="wf-tripo3d-panel"
			:class="{ animating: !isInteracting }"
			:style="panelStyle"
			@pointerdown.stop
		>
			<div
				class="wf-tripo3d-panel-header"
				@pointerdown="onHeaderPointerDown"
				@dblclick="onHeaderDoubleClick"
			>
				<div class="wf-tripo3d-panel-title-wrap">
					<div class="wf-tripo3d-panel-title">{{ t('tasks.tripo3d.title') }}</div>
					<div class="wf-tripo3d-panel-subtitle">{{ t('tasks.tripo3d.subtitle') }}</div>
				</div>
				<div
					v-if="balanceText"
					class="wf-tripo3d-panel-balance"
					:class="`is-${balanceTone}`"
					:title="balanceDetail || balanceText"
				>
					<span class="wf-tripo3d-panel-balance-label">{{ t('tasks.tripo3d.balance') }}</span>
					<span class="wf-tripo3d-panel-balance-value">{{ balanceText }}</span>
				</div>
				<div class="wf-tripo3d-panel-actions" @pointerdown.stop>
					<button
						class="wf-tripo3d-panel-icon-btn"
						type="button"
						:title="sortModeTitle"
						@click="cycleSortMode"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-tripo3d-panel-icon">
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
					<button class="wf-tripo3d-panel-btn" type="button" @click="toggleMinimize">-</button>
					<button class="wf-tripo3d-panel-btn" type="button" @click="toggleMaximize">[]</button>
					<button class="wf-tripo3d-panel-btn danger" type="button" @click="emit('close')">x</button>
				</div>
			</div>

			<div v-if="!minimized" class="wf-tripo3d-panel-body">
				<div v-if="dataStatusText" class="wf-tripo3d-panel-status">
					{{ dataStatusText }}
				</div>
				<div class="wf-tripo3d-panel-toolbar">
					<input
						v-model.trim="searchText"
						class="wf-tripo3d-search"
						type="text"
						:placeholder="t('tasks.tripo3d.searchPlaceholder')"
					/>
					<button
						class="wf-tripo3d-panel-btn"
						type="button"
						:disabled="refreshBusy"
						@click="emit('refresh')"
					>
						{{ refreshBusy ? t('tasks.tripo3d.syncing') : t('tasks.tripo3d.syncBackend') }}
					</button>
					<div class="wf-tripo3d-panel-stats">{{ t('tasks.tripo3d.totalCount', { count: filteredTasks.length }) }}</div>
				</div>

				<div v-if="!filteredTasks.length" class="wf-tripo3d-panel-empty">
					{{ t('tasks.tripo3d.empty') }}
				</div>

				<div v-else class="wf-tripo3d-task-list">
					<div v-for="task in filteredTasks" :key="task.id" class="wf-tripo3d-task-tree">
						<div
							class="wf-tripo3d-task-card wf-tripo3d-task-card-root"
						>
							<div class="wf-tripo3d-task-card-top">
								<div class="wf-tripo3d-task-chip-row">
									<span class="wf-tripo3d-task-chip">
										{{ t('tasks.tripo3d.type3d') }}
									</span>
									<span class="wf-tripo3d-task-chip subtle">{{ task.modeLabel }}</span>
									<span class="wf-tripo3d-task-chip status" :class="`is-${task.status}`">
										{{ task.statusLabel }}
									</span>
								</div>
								<div class="wf-tripo3d-task-date">{{ formatDate(task.createdAt) }}</div>
							</div>

							<div class="wf-tripo3d-task-main">
								<div class="wf-tripo3d-task-copy">
									<div class="wf-tripo3d-task-title">{{ task.title }}</div>
									<div class="wf-tripo3d-task-prompt">{{ task.promptPreview }}</div>
									<div class="wf-tripo3d-task-meta">{{ task.metaText }}</div>
								</div>
								<div v-if="taskThumbSrc(task)" class="wf-tripo3d-task-thumb-shell">
									<img
										class="wf-tripo3d-task-thumb"
										:src="taskThumbSrc(task)"
										alt="thumbnail"
										draggable="false"
										@error="onTaskThumbError(task.id)"
									/>
								</div>
							</div>

							<div class="wf-tripo3d-task-progress-row">
								<div class="wf-tripo3d-task-progress-track">
									<div
										class="wf-tripo3d-task-progress-fill"
										:style="{ width: `${task.progress}%` }"
									/>
								</div>
								<div class="wf-tripo3d-task-progress-label">{{ task.progress }}%</div>
							</div>

							<div class="wf-tripo3d-task-foot">
								<div class="wf-tripo3d-task-footnote">{{ task.footnote }}</div>
								<div class="wf-tripo3d-task-action-row">
									<button
										class="wf-tripo3d-task-preview-btn"
										type="button"
										@click="onPreviewTask(task.id)"
									>
										{{ t('tasks.tripo3d.viewDetails') }}
									</button>
									<button
										class="wf-tripo3d-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'refresh')"
										@click="onTaskAction(task, 'refresh')"
									>
										{{ isBusy(task, 'refresh') ? t('tasks.tripo3d.refreshing') : t('tasks.tripo3d.refreshStatus') }}
									</button>
									<button
										class="wf-tripo3d-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'import-output')"
										@click="onTaskAction(task, 'import-output')"
									>
										{{ isBusy(task, 'import-output') ? t('tasks.tripo3d.pulling') : t('tasks.tripo3d.pullArtifacts') }}
									</button>
									<button
										class="wf-tripo3d-task-preview-btn"
										type="button"
										:disabled="isBusy(task, 'stop')"
										@click="onTaskAction(task, 'stop')"
									>
										{{ isBusy(task, 'stop') ? t('tasks.tripo3d.stopping') : t('tasks.tripo3d.stopTask') }}
									</button>
									<button
										class="wf-tripo3d-task-preview-btn danger"
										type="button"
										:disabled="isBusy(task, 'delete')"
										@click="onTaskAction(task, 'delete')"
									>
										{{ isBusy(task, 'delete') ? t('tasks.tripo3d.deleting') : t('tasks.tripo3d.deleteTask') }}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div v-if="detailVisible" class="wf-tripo3d-task-detail-mask" @click.self="closeDetail">
					<div class="wf-tripo3d-task-detail" @click.stop>
						<div class="wf-tripo3d-task-detail-header">
							<div class="wf-tripo3d-task-detail-title-wrap">
								<div class="wf-tripo3d-task-detail-title">
									{{ detailTask?.title || t('tasks.tripo3d.detailTitle') }}
								</div>
								<div class="wf-tripo3d-task-detail-subtitle">
									{{ detailTask?.modeLabel || t('tasks.tripo3d.detailSubtitle') }} ·
									{{ detailTask?.statusLabel || t('tasks.tripo3d.loading') }}
								</div>
							</div>
							<div class="wf-tripo3d-task-action-row">
								<button
									class="wf-tripo3d-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId || detailLoading"
									@click="onDetailAction('refresh')"
								>
									{{ t('tasks.tripo3d.refreshStatus') }}
								</button>
								<button
									class="wf-tripo3d-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('import-output')"
								>
									{{ t('tasks.tripo3d.pullArtifacts') }}
								</button>
								<button
									class="wf-tripo3d-task-preview-btn"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('stop')"
								>
									{{ t('tasks.tripo3d.stopTask') }}
								</button>
								<button
									class="wf-tripo3d-task-preview-btn danger"
									type="button"
									:disabled="!detailTask?.taskId"
									@click="onDetailAction('delete')"
								>
									{{ t('tasks.tripo3d.deleteTask') }}
								</button>
								<button class="wf-tripo3d-panel-btn danger" type="button" @click="closeDetail">
									{{ t('common.close') }}
								</button>
							</div>
						</div>

						<div v-if="detailLoading" class="wf-tripo3d-task-detail-loading">{{ t('tasks.tripo3d.loadingDetails') }}</div>
						<div v-else-if="detailTask" class="wf-tripo3d-task-detail-body">
							<div class="wf-tripo3d-task-detail-grid">
								<div class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.taskId') }}</div>
									<div class="wf-tripo3d-task-detail-value monospace">
										{{ detailTask.taskId || t('tasks.tripo3d.notWritten') }}
									</div>
								</div>
								<div class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.source') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.sourceLabel || t('tasks.tripo3d.localNode') }}
									</div>
								</div>
								<div class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.mode') }}</div>
									<div class="wf-tripo3d-task-detail-value highlight">
										{{ detailTask.modeLabel }}
									</div>
								</div>
								<div class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.createdAt') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.createdAtLabel || '-' }}
									</div>
								</div>
								<div class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.updatedAt') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.updatedAtLabel || '-' }}
									</div>
								</div>
								<div v-if="detailTask.modelVersion" class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.modelVersion') }}</div>
									<div class="wf-tripo3d-task-detail-value highlight">
										{{ detailTask.modelVersion }}
									</div>
								</div>
								<div v-if="detailTask.texture != null" class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.texture') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.texture ? t('tasks.tripo3d.enabled') : t('tasks.tripo3d.disabled') }}
									</div>
								</div>
								<div v-if="detailTask.pbr != null" class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.pbr') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.pbr ? t('tasks.tripo3d.enabled') : t('tasks.tripo3d.disabled') }}
									</div>
								</div>
								<div v-if="detailTask.faceLimit" class="wf-tripo3d-task-detail-card">
									<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.faceLimit') }}</div>
									<div class="wf-tripo3d-task-detail-value">
										{{ detailTask.faceLimit }}
									</div>
								</div>
							</div>

							<div v-if="detailTask.prompt" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.prompt') }}</div>
								<div class="wf-tripo3d-task-detail-block">{{ detailTask.prompt }}</div>
							</div>
							<div v-if="detailTask.negativePrompt" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.negativePrompt') }}</div>
								<div class="wf-tripo3d-task-detail-block">
									{{ detailTask.negativePrompt }}
								</div>
							</div>
							<div v-if="detailTask.statusText" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.statusDesc') }}</div>
								<div class="wf-tripo3d-task-detail-block">{{ detailTask.statusText }}</div>
							</div>
							<div v-if="detailTask.errorMessage" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.errorMessage') }}</div>
								<div class="wf-tripo3d-task-detail-block error">
									{{ detailTask.errorMessage }}
								</div>
							</div>
							<div
								v-if="detailTask.modelUrl || detailTask.assetUrl || detailTask.assetPath"
								class="wf-tripo3d-task-detail-section"
							>
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.artifacts') }}</div>
								<div class="wf-tripo3d-task-detail-links">
									<div
										v-if="detailTask.modelUrl"
										class="wf-tripo3d-task-detail-block monospace"
									>
										{{ t('tasks.tripo3d.remotePreferred') }}{{ detailTask.modelUrl }}
									</div>
									<div v-if="detailTask.assetUrl" class="wf-tripo3d-task-detail-block monospace">
										{{ t('tasks.tripo3d.localMirrorUrl') }}{{ detailTask.assetUrl }}
									</div>
									<div v-if="detailTask.assetPath" class="wf-tripo3d-task-detail-block monospace">
										{{ t('tasks.tripo3d.localMirrorPath') }}{{ detailTask.assetPath }}
									</div>
								</div>
							</div>
							<div v-if="detailRequestJson" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.requestPayload') }}</div>
								<pre class="wf-tripo3d-task-detail-code">{{ detailRequestJson }}</pre>
							</div>
							<div v-if="detailResponseJson" class="wf-tripo3d-task-detail-section">
								<div class="wf-tripo3d-task-detail-label">{{ t('tasks.tripo3d.responsePayload') }}</div>
								<pre class="wf-tripo3d-task-detail-code">{{ detailResponseJson }}</pre>
							</div>
						</div>
						<div v-else class="wf-tripo3d-task-detail-empty">{{ t('tasks.tripo3d.noDetails') }}</div>
					</div>
				</div>
			</div>

			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-n"
				@pointerdown.stop="onResizeStart('n', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-s"
				@pointerdown.stop="onResizeStart('s', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-e"
				@pointerdown.stop="onResizeStart('e', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-w"
				@pointerdown.stop="onResizeStart('w', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-ne"
				@pointerdown.stop="onResizeStart('ne', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-nw"
				@pointerdown.stop="onResizeStart('nw', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-se"
				@pointerdown.stop="onResizeStart('se', $event)"
			/>
			<div
				class="wf-tripo3d-resize wf-tripo3d-resize-sw"
				@pointerdown.stop="onResizeStart('sw', $event)"
			/>
		</div>
	</teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import type {
	Tripo3DTaskPanelAction,
	Tripo3DTaskPanelDetail,
	Tripo3DTaskPanelItem
} from '../../views/AIWorkflow/node-business/tripo3d/types'

const { t } = useI18n()

const props = defineProps<{
	open: boolean
	tasks: Tripo3DTaskPanelItem[]
	dataStatusText?: string
	balanceText?: string
	balanceDetail?: string
	balanceTone?: 'muted' | 'warn' | 'ok'
	refreshBusy?: boolean
	detailTaskId?: string
	detailTask?: Tripo3DTaskPanelDetail | null
	detailLoading?: boolean
	actionBusyTaskId?: string
	actionBusyType?: Tripo3DTaskPanelAction | ''
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
			action: Tripo3DTaskPanelAction
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
const sortMode = ref<'date-desc' | 'date-asc'>('date-desc')
const openedDetailTaskId = ref('')
const failedTaskThumbIds = ref<Set<string>>(new Set())

const taskThumbSrc = (task: Tripo3DTaskPanelItem) => {
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

	const matchesKeyword = (item: Tripo3DTaskPanelItem) => {
		const hay = [
			item.title,
			item.modeLabel,
			item.promptPreview,
			item.metaText,
			item.taskId
		]
			.map((x) => String(x ?? '').toLowerCase())
			.join('\n')
		return hay.includes(keyword)
	}

	if (keyword) {
		list = list.filter(matchesKeyword)
	}

	list.sort((a, b) =>
		sortMode.value === 'date-asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
	)
	return list
})

const sortModeTitle = computed(() =>
	sortMode.value === 'date-desc' ? t('tasks.tripo3d.sortDesc') : t('tasks.tripo3d.sortAsc')
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

const cycleSortMode = () => {
	sortMode.value = sortMode.value === 'date-desc' ? 'date-asc' : 'date-desc'
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

const isBusy = (task: Tripo3DTaskPanelItem, action: Tripo3DTaskPanelAction) => {
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return false
	return (
		String(props.actionBusyTaskId ?? '').trim() === taskId &&
		String(props.actionBusyType ?? '').trim() === action
	)
}

const onTaskAction = (task: Tripo3DTaskPanelItem, action: Tripo3DTaskPanelAction) => {
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return
	emit('task-action', {
		taskId,
		mode: String(task.mode ?? '').trim() || undefined,
		action,
		nodeId: String(task.nodeId ?? '').trim() || undefined
	})
}

const onDetailAction = (action: Tripo3DTaskPanelAction) => {
	const task = detailTask.value
	if (!task) return
	const taskId = String(task.taskId ?? '').trim()
	if (!taskId) return
	emit('task-action', {
		taskId,
		mode: undefined,
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
	document.body.classList.toggle('wf-tripo3d-panel-no-select', active)
}

const onHeaderPointerDown = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (maximized.value) return
	const target = event.target as HTMLElement | null
	if (target?.closest('button, .wf-tripo3d-resize')) return
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
.wf-tripo3d-panel {
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

.wf-tripo3d-panel.animating {
	transition:
		left 0.16s ease,
		top 0.16s ease,
		width 0.16s ease,
		height 0.16s ease;
}

.wf-tripo3d-panel-status {
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

.wf-tripo3d-resize {
	position: absolute;
	z-index: 2;
	background: transparent;
}

.wf-tripo3d-resize-n,
.wf-tripo3d-resize-s {
	left: 8px;
	right: 8px;
	height: 6px;
	cursor: ns-resize;
}

.wf-tripo3d-resize-n {
	top: -3px;
}

.wf-tripo3d-resize-s {
	bottom: -3px;
}

.wf-tripo3d-resize-e,
.wf-tripo3d-resize-w {
	top: 8px;
	bottom: 8px;
	width: 6px;
	cursor: ew-resize;
}

.wf-tripo3d-resize-e {
	right: -3px;
}

.wf-tripo3d-resize-w {
	left: -3px;
}

.wf-tripo3d-resize-ne,
.wf-tripo3d-resize-nw,
.wf-tripo3d-resize-se,
.wf-tripo3d-resize-sw {
	width: 10px;
	height: 10px;
}

.wf-tripo3d-resize-ne {
	top: -5px;
	right: -5px;
	cursor: nesw-resize;
}

.wf-tripo3d-resize-nw {
	top: -5px;
	left: -5px;
	cursor: nwse-resize;
}

.wf-tripo3d-resize-se {
	right: -5px;
	bottom: -5px;
	cursor: nwse-resize;
}

.wf-tripo3d-resize-sw {
	left: -5px;
	bottom: -5px;
	cursor: nesw-resize;
}

.wf-tripo3d-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 10px;
	border-bottom: 1px solid var(--vscode-border);
	cursor: move;
	user-select: none;
}

.wf-tripo3d-panel-title-wrap {
	min-width: 0;
	display: grid;
	gap: 2px;
}

.wf-tripo3d-panel-title {
	font-size: 13px;
	color: var(--vscode-fg);
}

.wf-tripo3d-panel-subtitle {
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.wf-tripo3d-panel-actions {
	display: flex;
	gap: 6px;
	margin-left: auto;
}

.wf-tripo3d-panel-balance {
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

.wf-tripo3d-panel-balance-label {
	color: var(--vscode-fg-muted);
}

.wf-tripo3d-panel-balance-value {
	max-width: 120px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wf-tripo3d-panel-balance.is-ok {
	border-color: rgb(56 189 140 / 0.55);
	color: #bbf7d0;
}

.wf-tripo3d-panel-balance.is-warn {
	border-color: rgb(248 113 113 / 0.55);
	color: #fecaca;
}

.wf-tripo3d-panel-btn,
.wf-tripo3d-panel-icon-btn,
.wf-tripo3d-task-preview-btn {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.68);
	color: var(--vscode-fg);
	font-size: 12px;
	padding: 4px 8px;
	cursor: pointer;
}

.wf-tripo3d-panel-btn:disabled,
.wf-tripo3d-panel-icon-btn:disabled,
.wf-tripo3d-task-preview-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-tripo3d-panel-btn.danger {
	color: #fecaca;
}

.wf-tripo3d-task-preview-btn.danger {
	color: #fecaca;
}

.wf-tripo3d-panel-icon {
	width: 14px;
	height: 14px;
}

.wf-tripo3d-panel-body {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px;
	min-height: 0;
	flex: 1;
}

.wf-tripo3d-panel-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
}

.wf-tripo3d-search {
	flex: 1;
	min-width: 0;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
}

.wf-tripo3d-panel-stats,
.wf-tripo3d-panel-empty,
.wf-tripo3d-task-meta,
.wf-tripo3d-task-footnote,
.wf-tripo3d-task-date,
.wf-tripo3d-task-progress-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-tripo3d-task-list {
	min-height: 0;
	overflow: auto;
	display: grid;
	align-content: start;
	grid-auto-rows: max-content;
	gap: 10px;
}

.wf-tripo3d-task-tree {
	display: grid;
	align-content: start;
	gap: 8px;
}

:global(body.wf-tripo3d-panel-no-select) {
	user-select: none;
	-webkit-user-select: none;
}

.wf-tripo3d-task-card {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
	padding: 10px;
	display: grid;
	gap: 10px;
	overflow: hidden;
}

.wf-tripo3d-task-card-root {
	height: 196px;
	grid-template-rows: auto 1fr auto auto;
}

.wf-tripo3d-task-card-top,
.wf-tripo3d-task-foot,
.wf-tripo3d-task-progress-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wf-tripo3d-task-action-row {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.wf-tripo3d-task-chip-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wf-tripo3d-task-chip {
	padding: 2px 7px;
	border: 1px solid rgb(90 180 255 / 0.48);
	color: #9ed2ff;
	font-size: 11px;
}

.wf-tripo3d-task-chip.subtle {
	border-color: rgb(from var(--vscode-border) r g b / 0.68);
	color: var(--vscode-fg-muted);
}

.wf-tripo3d-task-chip.status.is-running,
.wf-tripo3d-task-chip.status.is-queued {
	border-color: rgb(90 180 255 / 0.68);
}

.wf-tripo3d-task-chip.status.is-succeeded {
	border-color: rgb(56 189 140 / 0.72);
	color: #bbf7d0;
}

.wf-tripo3d-task-chip.status.is-failed {
	border-color: rgb(248 113 113 / 0.72);
	color: #fecaca;
}

.wf-tripo3d-task-main {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 90px;
	gap: 10px;
	min-height: 0;
}

.wf-tripo3d-task-copy {
	min-width: 0;
	display: grid;
	gap: 6px;
}

.wf-tripo3d-task-title {
	font-size: 13px;
	color: var(--vscode-fg);
	line-height: 1.35;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-tripo3d-task-prompt {
	font-size: 12px;
	color: var(--vscode-fg);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-tripo3d-task-thumb-shell {
	width: 90px;
	height: 90px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	overflow: hidden;
	display: grid;
	place-items: center;
}

.wf-tripo3d-task-thumb {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-tripo3d-task-progress-track {
	flex: 1;
	height: 6px;
	background: rgb(255 255 255 / 0.08);
	overflow: hidden;
}

.wf-tripo3d-task-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #38bdf8, #34d399);
}

.wf-tripo3d-task-detail-mask {
	position: absolute;
	inset: 0;
	z-index: 4;
	display: flex;
	justify-content: flex-end;
	background: rgba(6, 10, 18, 0.42);
}

.wf-tripo3d-task-detail {
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

.wf-tripo3d-task-detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 12px;
	border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
}

.wf-tripo3d-task-detail-title-wrap {
	min-width: 0;
	display: grid;
	gap: 4px;
}

.wf-tripo3d-task-detail-title {
	font-size: 14px;
	color: var(--vscode-fg);
}

.wf-tripo3d-task-detail-subtitle,
.wf-tripo3d-task-detail-loading,
.wf-tripo3d-task-detail-empty,
.wf-tripo3d-task-detail-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-tripo3d-task-detail-loading,
.wf-tripo3d-task-detail-empty {
	padding: 14px 12px;
}

.wf-tripo3d-task-detail-body {
	flex: 1;
	min-height: 0;
	overflow: auto;
	display: grid;
	gap: 12px;
	padding: 12px;
}

.wf-tripo3d-task-detail-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-tripo3d-task-detail-card,
.wf-tripo3d-task-detail-block,
.wf-tripo3d-task-detail-code {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
}

.wf-tripo3d-task-detail-card {
	padding: 10px;
	display: grid;
	gap: 6px;
}

.wf-tripo3d-task-detail-value {
	font-size: 12px;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-tripo3d-task-detail-value.monospace,
.wf-tripo3d-task-detail-block.monospace,
.wf-tripo3d-task-detail-code {
	font-family: Consolas, 'Courier New', monospace;
}

.wf-tripo3d-task-detail-value.highlight {
	color: #9ed2ff;
	font-weight: 500;
}

.wf-tripo3d-task-detail-section {
	display: grid;
	gap: 6px;
}

.wf-tripo3d-task-detail-block {
	padding: 10px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-tripo3d-task-detail-block.error {
	color: #fecaca;
}

.wf-tripo3d-task-detail-links {
	display: grid;
	gap: 6px;
}

.wf-tripo3d-task-detail-code {
	margin: 0;
	padding: 10px;
	overflow: auto;
	font-size: 11px;
	line-height: 1.55;
	color: #dbeafe;
	white-space: pre-wrap;
}

@media (max-width: 720px) {
	.wf-tripo3d-task-main {
		grid-template-columns: 1fr;
	}

	.wf-tripo3d-task-thumb-shell {
		width: 100%;
		height: 120px;
	}

	.wf-tripo3d-task-detail {
		width: 100%;
	}

	.wf-tripo3d-task-detail-grid {
		grid-template-columns: 1fr;
	}
}
</style>
