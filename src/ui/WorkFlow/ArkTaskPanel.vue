<template>
	<teleport to="body">
		<div
			v-if="open"
			ref="panelEl"
			class="wf-ark-panel"
			:class="{ animating: !isInteracting }"
			:style="panelStyle"
			@pointerdown.stop
		>
			<div
				class="wf-ark-panel-header"
				@pointerdown="onHeaderPointerDown"
				@dblclick="onHeaderDoubleClick"
			>
				<div class="wf-ark-panel-title-wrap">
					<div class="wf-ark-panel-title">ARK 任务中心</div>
					<div class="wf-ark-panel-subtitle">火山引擎方舟平台 · Seedream / Seedance / 即梦</div>
				</div>
				<div class="wf-ark-panel-actions" @pointerdown.stop>
					<button
						class="wf-ark-panel-icon-btn"
						type="button"
						:title="filterTitle"
						@click="cycleApiTypeFilter"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-ark-panel-icon">
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
						class="wf-ark-panel-icon-btn"
						type="button"
						:title="sortModeTitle"
						@click="cycleSortMode"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-ark-panel-icon">
							<path
								d="M4 3h8M4 6h6M4 9h4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
							<path
								v-if="sortMode === 'date-desc'"
								d="M12 12l-2-2h4z"
								fill="currentColor"
							/>
							<path v-else d="M12 10l-2 2h4z" fill="currentColor" />
						</svg>
					</button>
					<button class="wf-ark-panel-btn" type="button" @click="toggleMinimize">-</button>
					<button class="wf-ark-panel-btn" type="button" @click="toggleMaximize">[]</button>
					<button class="wf-ark-panel-btn danger" type="button" @click="emit('close')">x</button>
				</div>
			</div>

			<div v-if="!minimized" class="wf-ark-panel-body">
				<div v-if="dataStatusText" class="wf-ark-panel-status">
					{{ dataStatusText }}
				</div>
				<div class="wf-ark-panel-toolbar">
					<input
						v-model.trim="searchText"
						class="wf-ark-search"
						type="text"
						placeholder="按提示词搜索"
					/>
					<button
						class="wf-ark-panel-btn"
						type="button"
						:disabled="refreshBusy"
						@click="emit('refresh')"
					>
						{{ refreshBusy ? '刷新中...' : '刷新' }}
					</button>
					<div class="wf-ark-panel-stats">共 {{ filteredTasks.length }} 条</div>
				</div>

				<div v-if="!filteredTasks.length" class="wf-ark-panel-empty">
					暂无 ARK 任务。先在蓝图里创建或运行 ARK 节点。
				</div>

				<div v-else class="wf-ark-task-list">
					<div
						v-for="task in filteredTasks"
						:key="task.id"
						class="wf-ark-task-card"
						draggable="true"
						@dragstart="onTaskDragStart($event, task)"
					>
						<div class="wf-ark-task-card-top">
							<div class="wf-ark-task-chip-row">
								<span class="wf-ark-task-chip api-type">
									{{ apiTypeLabel(task.apiType) }}
								</span>
								<span class="wf-ark-task-chip subtle">
									{{ task.model || '未知模型' }}
								</span>
								<span class="wf-ark-task-chip status" :class="`is-${task.status}`">
									{{ task.statusLabel }}
								</span>
							</div>
							<div class="wf-ark-task-date">{{ formatDate(task.createdAt) }}</div>
						</div>

						<div class="wf-ark-task-main">
							<div class="wf-ark-task-copy">
								<div class="wf-ark-task-prompt">
									{{ task.prompt || '未填写提示词' }}
								</div>
								<div v-if="task.errorMessage" class="wf-ark-task-error">
									{{ task.errorMessage }}
								</div>
								<div v-if="task.statusText" class="wf-ark-task-meta">
									{{ task.statusText }}
								</div>
							</div>
							<div v-if="taskThumbSrc(task)" class="wf-ark-task-thumb-shell">
								<img
									class="wf-ark-task-thumb"
									:src="taskThumbSrc(task)"
									alt="thumbnail"
									draggable="false"
									@error="onTaskThumbError(task.id)"
								/>
							</div>
						</div>

						<div class="wf-ark-task-foot">
							<div class="wf-ark-task-footnote">
								拖拽到蓝图可创建 ARK 引用节点
							</div>
							<div class="wf-ark-task-action-row">
								<button
									class="wf-ark-task-preview-btn"
									type="button"
									@click="onPreviewTask(task.id)"
								>
									详情
								</button>
								<button
									class="wf-ark-task-preview-btn danger"
									type="button"
									@click="onDeleteTask(task.id)"
								>
									删除
								</button>
							</div>
						</div>
					</div>
				</div>

				<div v-if="detailVisible" class="wf-ark-task-detail-mask" @click.self="closeDetail">
					<div class="wf-ark-task-detail" @click.stop>
						<div class="wf-ark-task-detail-header">
							<div class="wf-ark-task-detail-title-wrap">
								<div class="wf-ark-task-detail-title">
									ARK 任务详情
								</div>
								<div class="wf-ark-task-detail-subtitle">
									{{ detailTask?.apiType || 'Unknown' }} ·
									{{ detailTask?.statusLabel || '读取中' }}
								</div>
							</div>
							<div class="wf-ark-task-action-row">
								<button
									class="wf-ark-panel-btn danger"
									type="button"
									@click="closeDetail"
								>
									关闭
								</button>
							</div>
						</div>

						<div v-if="detailLoading" class="wf-ark-task-detail-loading">
							正在读取任务详情...
						</div>
						<div v-else-if="detailTask" class="wf-ark-task-detail-body">
							<div class="wf-ark-task-detail-grid">
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">任务 ID</div>
									<div class="wf-ark-task-detail-value monospace">
										{{ detailTask.taskId || '未写入' }}
									</div>
								</div>
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">API 类型</div>
									<div class="wf-ark-task-detail-value">
										{{ apiTypeLabel(detailTask.apiType) }}
									</div>
								</div>
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">模型</div>
									<div class="wf-ark-task-detail-value">
										{{ detailTask.model || '-' }}
									</div>
								</div>
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">状态</div>
									<div class="wf-ark-task-detail-value">
										{{ detailTask.statusLabel }}
									</div>
								</div>
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">远端任务 ID</div>
									<div class="wf-ark-task-detail-value monospace">
										{{ detailTask.remoteTaskId || '-' }}
									</div>
								</div>
								<div class="wf-ark-task-detail-card">
									<div class="wf-ark-task-detail-label">创建时间</div>
									<div class="wf-ark-task-detail-value">
										{{ formatDate(detailTask.createdAt) }}
									</div>
								</div>
							</div>

							<div v-if="detailTask.prompt" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">提示词</div>
								<div class="wf-ark-task-detail-block">{{ detailTask.prompt }}</div>
							</div>
							<div v-if="detailTask.negativePrompt" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">负向提示词</div>
								<div class="wf-ark-task-detail-block">
									{{ detailTask.negativePrompt }}
								</div>
							</div>
							<div v-if="detailTask.resultText" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">结果文本</div>
								<div class="wf-ark-task-detail-block">{{ detailTask.resultText }}</div>
							</div>
							<div
								v-if="detailTask.resultUrls && detailTask.resultUrls.length"
								class="wf-ark-task-detail-section"
							>
								<div class="wf-ark-task-detail-label">结果链接</div>
								<div class="wf-ark-task-detail-links">
									<a
										v-for="(url, idx) in detailTask.resultUrls"
										:key="idx"
										:href="url"
										class="wf-ark-task-detail-link"
										target="_blank"
										rel="noopener noreferrer"
									>
										{{ url }}
									</a>
								</div>
							</div>
							<div v-if="detailTask.statusText" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">状态说明</div>
								<div class="wf-ark-task-detail-block">{{ detailTask.statusText }}</div>
							</div>
							<div v-if="detailTask.errorMessage" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">错误信息</div>
								<div class="wf-ark-task-detail-block error">
									{{ detailTask.errorMessage }}
								</div>
							</div>
							<div v-if="detailRequestJson" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">请求载荷</div>
								<pre class="wf-ark-task-detail-code">{{ detailRequestJson }}</pre>
							</div>
							<div v-if="detailResponseJson" class="wf-ark-task-detail-section">
								<div class="wf-ark-task-detail-label">响应载荷</div>
								<pre class="wf-ark-task-detail-code">{{ detailResponseJson }}</pre>
							</div>
						</div>
						<div v-else class="wf-ark-task-detail-empty">
							当前任务暂无可展示的详情。
						</div>
					</div>
				</div>
			</div>

			<div
				class="wf-ark-resize wf-ark-resize-n"
				@pointerdown.stop="onResizeStart('n', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-s"
				@pointerdown.stop="onResizeStart('s', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-e"
				@pointerdown.stop="onResizeStart('e', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-w"
				@pointerdown.stop="onResizeStart('w', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-ne"
				@pointerdown.stop="onResizeStart('ne', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-nw"
				@pointerdown.stop="onResizeStart('nw', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-se"
				@pointerdown.stop="onResizeStart('se', $event)"
			/>
			<div
				class="wf-ark-resize wf-ark-resize-sw"
				@pointerdown.stop="onResizeStart('sw', $event)"
			/>
		</div>
	</teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type ArkTaskPanelItem = {
	id: string
	taskId: string
	apiType: string
	apiAction: string
	model: string
	status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
	statusLabel: string
	prompt: string
	resultUrls: string[]
	resultText: string
	thumbnailUrl: string
	errorMessage: string
	statusText: string
	projectId: number | null
	nodeId: string
	createdAt: number
	updatedAt: number
}

export type ArkTaskPanelDetail = {
	id: string
	taskId: string
	apiType: string
	apiAction: string
	model: string
	status: string
	statusLabel: string
	prompt: string
	negativePrompt: string
	resultUrls: string[]
	resultText: string
	thumbnailUrl: string
	errorMessage: string
	statusText: string
	projectId: number | null
	nodeId: string
	remoteTaskId: string
	createdAt: number
	updatedAt: number
	requestPayload: Record<string, unknown> | null
	responsePayload: Record<string, unknown> | null
}

const props = defineProps<{
	open: boolean
	tasks: ArkTaskPanelItem[]
	refreshBusy?: boolean
	detailTaskId?: string
	detailTask?: ArkTaskPanelDetail | null
	detailLoading?: boolean
	dataStatusText?: string
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'refresh'): void
	(
		e: 'task-action',
		payload: { taskId: string; action: 'delete' | 'view-detail' }
	): void
	(e: 'preview-task', taskId: string): void
}>()

const API_TYPE_OPTIONS = ['all', 'seedream', 'seedance', 'jimeng', 'blueprintChat'] as const
type ApiTypeFilter = (typeof API_TYPE_OPTIONS)[number]

const apiTypeLabel = (value: string) => {
	switch (value) {
		case 'seedream':
			return 'Seedream'
		case 'seedance':
			return 'Seedance'
		case 'jimeng':
			return '即梦'
		case 'blueprintChat':
			return '蓝图对话'
		default:
			return value || '未知'
	}
}

const panelEl = ref<HTMLElement | null>(null)
const minimized = ref(false)
const maximized = ref(false)
const position = ref({ x: 452, y: 16 })
const size = ref({ w: 460, h: 520 })
const isInteracting = ref(false)
const searchText = ref('')
const apiTypeFilter = ref<ApiTypeFilter>('all')
const sortMode = ref<'date-desc' | 'date-asc'>('date-desc')
const openedDetailTaskId = ref('')
const failedTaskThumbIds = ref<Set<string>>(new Set())

const taskThumbSrc = (task: ArkTaskPanelItem) => {
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

	if (apiTypeFilter.value !== 'all') {
		list = list.filter((item) => item.apiType === apiTypeFilter.value)
	}

	if (keyword) {
		list = list.filter((item) => {
			const hay = [item.prompt, item.statusText, item.errorMessage, item.model, item.apiType]
				.map((x) => String(x ?? '').toLowerCase())
				.join('\n')
			return hay.includes(keyword)
		})
	}

	list.sort((a, b) =>
		sortMode.value === 'date-asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
	)
	return list
})

const sortModeTitle = computed(() =>
	sortMode.value === 'date-desc' ? '排序：日期（新→旧）' : '排序：日期（旧→新）'
)

const filterTitle = computed(() => {
	switch (apiTypeFilter.value) {
		case 'all':
			return '筛选：全部'
		case 'seedream':
			return '筛选：Seedream'
		case 'seedance':
			return '筛选：Seedance'
		case 'jimeng':
			return '筛选：即梦'
		case 'blueprintChat':
			return '筛选：蓝图对话'
		default:
			return '筛选：全部'
	}
})

const detailVisible = computed(() => !!openedDetailTaskId.value)
const detailLoading = computed(
	() => props.detailLoading === true && openedDetailTaskId.value === props.detailTaskId
)

const detailRequestJson = computed(() => {
	if (!props.detailTask?.requestPayload) return ''
	try {
		return JSON.stringify(props.detailTask.requestPayload, null, 2)
	} catch {
		return ''
	}
})

const detailResponseJson = computed(() => {
	if (!props.detailTask?.responsePayload) return ''
	try {
		return JSON.stringify(props.detailTask.responsePayload, null, 2)
	} catch {
		return ''
	}
})

const cycleSortMode = () => {
	sortMode.value = sortMode.value === 'date-desc' ? 'date-asc' : 'date-desc'
}

const cycleApiTypeFilter = () => {
	const idx = API_TYPE_OPTIONS.indexOf(apiTypeFilter.value)
	apiTypeFilter.value = API_TYPE_OPTIONS[(idx + 1) % API_TYPE_OPTIONS.length]
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

const onTaskDragStart = (event: DragEvent, task: ArkTaskPanelItem) => {
	const dt = event.dataTransfer
	if (!dt) return
	try {
		dt.effectAllowed = 'copy'
		const payload = {
			source: 'ark-task-panel',
			nodeId: task.nodeId,
			taskId: task.taskId,
			apiType: task.apiType,
			apiAction: task.apiAction,
			model: task.model,
			projectId: task.projectId
		}
		dt.setData('application/x-dweb-ark-task-item', JSON.stringify(payload))
		dt.setData('text/plain', task.prompt || task.taskId)
	} catch {
		// ignore
	}
}

const closeDetail = () => {
	openedDetailTaskId.value = ''
}

const onPreviewTask = (taskId: string) => {
	openedDetailTaskId.value = taskId
	emit('preview-task', taskId)
}

const onDeleteTask = (taskId: string) => {
	emit('task-action', { taskId, action: 'delete' })
}

const panelStyle = computed(() => ({
	left: `${position.value.x}px`,
	top: `${position.value.y}px`,
	width: `${size.value.w}px`,
	height: minimized.value ? `${MINIMIZED_HEIGHT}px` : `${size.value.h}px`
}))

const setGlobalPanelInteraction = (active: boolean) => {
	document.body.classList.toggle('wf-ark-panel-no-select', active)
}

const onHeaderPointerDown = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (maximized.value) return
	const target = event.target as HTMLElement | null
	if (target?.closest('button, .wf-ark-resize')) return
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
.wf-ark-panel {
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

.wf-ark-panel.animating {
	transition:
		left 0.16s ease,
		top 0.16s ease,
		width 0.16s ease,
		height 0.16s ease;
}

.wf-ark-panel-status {
	margin-bottom: 10px;
	padding: 8px 10px;
	border: 1px solid rgba(99, 162, 255, 0.24);
	background: rgba(99, 162, 255, 0.1);
	color: rgba(231, 238, 255, 0.92);
	font-size: 12px;
	line-height: 1.5;
	min-height: 36px;
	box-sizing: border-box;
	overflow: hidden;
}

.wf-ark-resize {
	position: absolute;
	z-index: 2;
	background: transparent;
}

.wf-ark-resize-n,
.wf-ark-resize-s {
	left: 8px;
	right: 8px;
	height: 6px;
	cursor: ns-resize;
}

.wf-ark-resize-n {
	top: -3px;
}

.wf-ark-resize-s {
	bottom: -3px;
}

.wf-ark-resize-e,
.wf-ark-resize-w {
	top: 8px;
	bottom: 8px;
	width: 6px;
	cursor: ew-resize;
}

.wf-ark-resize-e {
	right: -3px;
}

.wf-ark-resize-w {
	left: -3px;
}

.wf-ark-resize-ne,
.wf-ark-resize-nw,
.wf-ark-resize-se,
.wf-ark-resize-sw {
	width: 10px;
	height: 10px;
}

.wf-ark-resize-ne {
	top: -5px;
	right: -5px;
	cursor: nesw-resize;
}

.wf-ark-resize-nw {
	top: -5px;
	left: -5px;
	cursor: nwse-resize;
}

.wf-ark-resize-se {
	right: -5px;
	bottom: -5px;
	cursor: nwse-resize;
}

.wf-ark-resize-sw {
	left: -5px;
	bottom: -5px;
	cursor: nesw-resize;
}

.wf-ark-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 10px;
	border-bottom: 1px solid var(--vscode-border);
	cursor: move;
	user-select: none;
}

.wf-ark-panel-title-wrap {
	min-width: 0;
	display: grid;
	gap: 2px;
}

.wf-ark-panel-title {
	font-size: 13px;
	color: var(--vscode-fg);
}

.wf-ark-panel-subtitle {
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.wf-ark-panel-actions {
	display: flex;
	gap: 6px;
	margin-left: auto;
}

.wf-ark-panel-btn,
.wf-ark-panel-icon-btn,
.wf-ark-task-preview-btn {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.68);
	color: var(--vscode-fg);
	font-size: 12px;
	padding: 4px 8px;
	cursor: pointer;
}

.wf-ark-panel-btn:disabled,
.wf-ark-panel-icon-btn:disabled,
.wf-ark-task-preview-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-ark-panel-btn.danger {
	color: #fecaca;
}

.wf-ark-task-preview-btn.danger {
	color: #fecaca;
}

.wf-ark-panel-icon {
	width: 14px;
	height: 14px;
}

.wf-ark-panel-body {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px;
	min-height: 0;
	flex: 1;
}

.wf-ark-panel-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
}

.wf-ark-search {
	flex: 1;
	min-width: 0;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
}

.wf-ark-panel-stats,
.wf-ark-panel-empty,
.wf-ark-task-meta,
.wf-ark-task-footnote,
.wf-ark-task-date {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-ark-task-list {
	min-height: 0;
	overflow: auto;
	display: grid;
	align-content: start;
	grid-auto-rows: max-content;
	gap: 10px;
}

:global(body.wf-ark-panel-no-select) {
	user-select: none;
	-webkit-user-select: none;
}

.wf-ark-task-card {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
	padding: 10px;
	display: grid;
	gap: 10px;
	overflow: hidden;
	grid-template-rows: auto 1fr auto;
}

.wf-ark-task-card-top,
.wf-ark-task-foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wf-ark-task-action-row {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.wf-ark-task-chip-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wf-ark-task-chip {
	padding: 2px 7px;
	border: 1px solid rgb(90 180 255 / 0.48);
	color: #9ed2ff;
	font-size: 11px;
}

.wf-ark-task-chip.api-type {
	border-color: rgb(168 85 247 / 0.55);
	color: #d8b4fe;
}

.wf-ark-task-chip.subtle {
	border-color: rgb(from var(--vscode-border) r g b / 0.68);
	color: var(--vscode-fg-muted);
}

.wf-ark-task-chip.status.is-running,
.wf-ark-task-chip.status.is-queued {
	border-color: rgb(90 180 255 / 0.68);
}

.wf-ark-task-chip.status.is-succeeded {
	border-color: rgb(56 189 140 / 0.72);
	color: #bbf7d0;
}

.wf-ark-task-chip.status.is-failed {
	border-color: rgb(248 113 113 / 0.72);
	color: #fecaca;
}

.wf-ark-task-chip.status.is-canceled {
	border-color: rgb(156 163 175 / 0.72);
	color: #d1d5db;
}

.wf-ark-task-main {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 90px;
	gap: 10px;
	min-height: 0;
}

.wf-ark-task-copy {
	min-width: 0;
	display: grid;
	gap: 6px;
}

.wf-ark-task-prompt {
	font-size: 12px;
	color: var(--vscode-fg);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-ark-task-error {
	font-size: 11px;
	color: #fecaca;
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.wf-ark-task-thumb-shell {
	width: 90px;
	height: 90px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	overflow: hidden;
	display: grid;
	place-items: center;
}

.wf-ark-task-thumb {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-ark-task-detail-mask {
	position: absolute;
	inset: 0;
	z-index: 4;
	display: flex;
	justify-content: flex-end;
	background: rgba(6, 10, 18, 0.42);
}

.wf-ark-task-detail {
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

.wf-ark-task-detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 12px;
	border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
}

.wf-ark-task-detail-title-wrap {
	min-width: 0;
	display: grid;
	gap: 4px;
}

.wf-ark-task-detail-title {
	font-size: 14px;
	color: var(--vscode-fg);
}

.wf-ark-task-detail-subtitle,
.wf-ark-task-detail-loading,
.wf-ark-task-detail-empty,
.wf-ark-task-detail-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-ark-task-detail-loading,
.wf-ark-task-detail-empty {
	padding: 14px 12px;
}

.wf-ark-task-detail-body {
	flex: 1;
	min-height: 0;
	overflow: auto;
	display: grid;
	gap: 12px;
	padding: 12px;
}

.wf-ark-task-detail-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-ark-task-detail-card,
.wf-ark-task-detail-block,
.wf-ark-task-detail-code {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
}

.wf-ark-task-detail-card {
	padding: 10px;
	display: grid;
	gap: 6px;
}

.wf-ark-task-detail-value {
	font-size: 12px;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-ark-task-detail-value.monospace,
.wf-ark-task-detail-block.monospace,
.wf-ark-task-detail-code {
	font-family: Consolas, 'Courier New', monospace;
}

.wf-ark-task-detail-section {
	display: grid;
	gap: 6px;
}

.wf-ark-task-detail-block {
	padding: 10px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-ark-task-detail-block.error {
	color: #fecaca;
}

.wf-ark-task-detail-links {
	display: grid;
	gap: 6px;
}

.wf-ark-task-detail-link {
	font-size: 11px;
	color: #7dd3fc;
	word-break: break-all;
	text-decoration: none;
	padding: 8px 10px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
	display: block;
}

.wf-ark-task-detail-link:hover {
	color: #bae6fd;
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.78);
}

.wf-ark-task-detail-code {
	margin: 0;
	padding: 10px;
	overflow: auto;
	font-size: 11px;
	line-height: 1.55;
	color: #dbeafe;
	white-space: pre-wrap;
}

@media (max-width: 720px) {
	.wf-ark-task-main {
		grid-template-columns: 1fr;
	}

	.wf-ark-task-thumb-shell {
		width: 100%;
		height: 120px;
	}

	.wf-ark-task-detail {
		width: 100%;
	}

	.wf-ark-task-detail-grid {
		grid-template-columns: 1fr;
	}
}
</style>