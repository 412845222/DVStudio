<template>
	<div
		v-if="visible && worldRect"
		class="wf-sel-frame-overlay"
		:style="overlayStyle"
		data-bp-ui-overlay="true"
	>
		<!-- 标签栏 -->
		<div class="wf-sel-frame-tag-bar" :style="tagBarStyle">
			<!-- 编辑模式：输入框 + 保存按钮 -->
			<template v-if="isEditing">
				<input
					ref="editInputRef"
					v-model="editDraft"
					class="wf-sel-frame-edit-input"
					:placeholder="t('aiworkflow.canvas.enterTagName')"
					@keydown.enter="onSave"
					@keydown.esc="onCancelEdit"
				/>
				<button
					class="wf-sel-frame-btn wf-sel-frame-save"
					:title="t('aiworkflow.canvas.save')"
					@click.stop="onSave"
				>
					{{ t('aiworkflow.canvas.save') }}
				</button>
				<button
					class="wf-sel-frame-btn wf-sel-frame-cancel"
					:title="t('aiworkflow.canvas.cancel')"
					@click.stop="onCancelEdit"
				>
					×
				</button>
			</template>
			<!-- 显示模式 -->
			<template v-else>
				<button
					class="wf-sel-frame-btn"
					:title="t('aiworkflow.canvas.editTag')"
					@click.stop="onStartEdit"
				>
					<span class="wf-sel-frame-tag-icon">🏷</span>
					<span class="wf-sel-frame-tag-text">{{ displayLabel }}</span>
				</button>
				<span class="wf-sel-frame-count">
					{{ t('aiworkflow.canvas.nodesSelected', { count: nodeCount }) }}
				</span>
				<button
					class="wf-sel-frame-btn wf-sel-frame-template"
					:title="t('aiworkflow.toolbar.saveAsTemplate')"
					@click.stop="emit('save-template')"
				>
					<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-sel-frame-template-icon">
						<path
							d="M2 3a1 1 0 0 1 1-1h7l4 4v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
						/>
						<path d="M9 2v4h4" fill="none" stroke="currentColor" stroke-width="1.2" />
					</svg>
					{{ t('aiworkflow.toolbar.saveAsTemplate') }}
				</button>
				<button
					class="wf-sel-frame-btn wf-sel-frame-delete"
					:title="t('aiworkflow.canvas.cancelSelection')"
					@click.stop="emit('delete')"
				>
					×
				</button>
			</template>
		</div>

		<!-- 透明可拖拽区域 -->
		<div class="wf-sel-frame-drag-area" @pointerdown="onDragAreaPointerDown" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useI18n } from '../../../i18n'

const { t } = useI18n()

const props = defineProps<{
	visible: boolean
	worldRect: { x0: number; y0: number; x1: number; y1: number } | null
	label?: string
	nodeCount: number
	zoom: number
	panX: number
	panY: number
	canvasWidth: number
	canvasHeight: number
}>()

const emit = defineEmits<{
	(e: 'tag-save', label: string): void
	(e: 'delete'): void
	(e: 'save-template'): void
	(e: 'drag-start'): void
	(e: 'drag-move', payload: { dx: number; dy: number }): void
	(e: 'drag-end'): void
}>()

// 本地维护的已保存标签（优先于 props.label）
const savedLabel = ref<string>('')

const displayLabel = computed(
	() => savedLabel.value || props.label || t('aiworkflow.canvas.editLabel')
)

// 编辑状态
const isEditing = ref(false)
const editDraft = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

// 当 label prop 变化时，同步 editDraft（但不覆盖 savedLabel）
watch(
	() => props.label,
	(newLabel) => {
		if (newLabel && !savedLabel.value) {
			editDraft.value = newLabel
		}
	}
)

// 开始编辑
const onStartEdit = () => {
	editDraft.value = savedLabel.value || props.label || ''
	isEditing.value = true
	nextTick(() => {
		editInputRef.value?.focus()
	})
}

// 取消编辑
const onCancelEdit = () => {
	isEditing.value = false
	editDraft.value = ''
}

// 保存标签 - 更新本地状态并通知父组件持久化
const onSave = () => {
	const label = editDraft.value.trim()
	if (label) {
		savedLabel.value = label // 立即更新本地显示
		emit('tag-save', label) // 通知父组件写入 store/JSON
	} else {
		savedLabel.value = '' // 清空标签
		emit('tag-save', '')
	}
	isEditing.value = false
}

// 拖拽阈值（与画布框选逻辑保持一致）
const DRAG_THRESHOLD_PX = 4

// 拖拽状态
const isDragging = ref(false)

// 拖拽区域 pointerdown 处理
const onDragAreaPointerDown = (event: PointerEvent) => {
	// 忽略非左键
	if (event.button !== 0) return
	// 忽略编辑状态
	if (isEditing.value) return

	event.preventDefault()
	event.stopPropagation()

	const startClient = { x: event.clientX, y: event.clientY }
	let lastClient = { ...startClient }
	let hasStartedDrag = false
	isDragging.value = false

	// 设置指针捕获
	const target = event.currentTarget as HTMLElement | null
	if (target?.setPointerCapture && Number.isFinite(event.pointerId)) {
		try {
			target.setPointerCapture(event.pointerId)
		} catch {
			// ignore pointer capture failure
		}
	}

	const onMove = (moveEvent: PointerEvent) => {
		const dx = moveEvent.clientX - startClient.x
		const dy = moveEvent.clientY - startClient.y

		// 只有移动超过阈值才开始拖拽
		if (!hasStartedDrag && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
			hasStartedDrag = true
			isDragging.value = true
			lastClient = { x: moveEvent.clientX, y: moveEvent.clientY }
			emit('drag-start')
		}

		if (hasStartedDrag) {
			moveEvent.preventDefault()
			const stepDx = moveEvent.clientX - lastClient.x
			const stepDy = moveEvent.clientY - lastClient.y
			lastClient = { x: moveEvent.clientX, y: moveEvent.clientY }
			emit('drag-move', { dx: stepDx, dy: stepDy })
		}
	}

	const onUp = (upEvent: PointerEvent) => {
		window.removeEventListener('pointermove', onMove, { capture: true } as AddEventListenerOptions)
		window.removeEventListener('pointerup', onUp, true)
		window.removeEventListener('pointercancel', onUp, true)
		if (target?.releasePointerCapture && Number.isFinite(upEvent.pointerId)) {
			try {
				target.releasePointerCapture(upEvent.pointerId)
			} catch {
				// ignore release failure
			}
		}

		if (hasStartedDrag) {
			// 真正的拖拽结束
			isDragging.value = false
			emit('drag-end')
		} else {
			// 点击操作（未拖拽）：取消选择
			emit('delete')
		}
	}

	window.addEventListener('pointermove', onMove, { capture: true, passive: false })
	window.addEventListener('pointerup', onUp, true)
	window.addEventListener('pointercancel', onUp, true)
}

// 世界坐标转屏幕坐标
const worldToScreen = (p: { x: number; y: number }) => {
	const c = { x: props.canvasWidth / 2, y: props.canvasHeight / 2 }
	return {
		x: c.x + props.panX + p.x * props.zoom,
		y: c.y + props.panY + p.y * props.zoom
	}
}

const overlayStyle = computed(() => {
	if (!props.worldRect) return { display: 'none' }
	const { x0, y0, x1, y1 } = props.worldRect
	const topLeft = worldToScreen({ x: x0, y: y0 })
	const bottomRight = worldToScreen({ x: x1, y: y1 })

	const left = Math.min(topLeft.x, bottomRight.x)
	const top = Math.min(topLeft.y, bottomRight.y)
	const width = Math.abs(bottomRight.x - topLeft.x)
	const height = Math.abs(bottomRight.y - topLeft.y)

	return {
		left: `${left}px`,
		top: `${top}px`,
		width: `${Math.max(width, 40)}px`,
		height: `${Math.max(height, 20)}px`
	}
})

const tagBarStyle = computed(() => {
	if (!props.worldRect) return { display: 'none' }

	// 标签栏高度约为26px(含padding)，定位在框架顶部上方4px
	const tagHeight = 26

	// 使用相对定位：相对于 overlay 容器定位
	return {
		left: '50%',
		top: `${-tagHeight - 4}px`,
		transform: 'translateX(-50%)'
	}
})
</script>

<style>
.wf-sel-frame-overlay {
	position: absolute;
	pointer-events: auto;
	z-index: 10;
}

.wf-sel-frame-drag-area {
	position: absolute;
	inset: 0;
	cursor: move;
	z-index: 0;
	/* 透明覆盖层，监听拖拽事件 */
}

.wf-sel-frame-tag-bar {
	position: absolute;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	background: rgba(30, 41, 59, 0.95);
	border: 1px solid rgba(59, 130, 246, 0.5);
	border-radius: 4px;
	cursor: pointer;
	pointer-events: auto;
	white-space: nowrap;
	backdrop-filter: blur(8px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	transition:
		background 150ms ease,
		border-color 150ms ease;
	user-select: none;
	z-index: 1;
}

.wf-sel-frame-tag-bar:hover {
	background: rgba(30, 41, 59, 0.98);
	border-color: rgba(59, 130, 246, 0.8);
}

.wf-sel-frame-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	background: transparent;
	border: none;
	border-radius: 3px;
	color: #93c5fd;
	font-size: 12px;
	cursor: pointer;
	transition: background 120ms ease;
}

.wf-sel-frame-btn:hover {
	background: rgba(59, 130, 246, 0.2);
}

.wf-sel-frame-tag-icon {
	font-size: 11px;
}

.wf-sel-frame-tag-text {
	font-weight: 500;
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.wf-sel-frame-count {
	font-size: 11px;
	color: rgba(148, 163, 184, 0.7);
	padding: 0 2px;
}

.wf-sel-frame-delete {
	font-size: 16px;
	font-weight: bold;
	color: #f87171;
	padding: 2px 6px;
	line-height: 1;
}

.wf-sel-frame-delete:hover {
	background: rgba(239, 68, 68, 0.2);
	color: #fca5a5;
}

.wf-sel-frame-template {
	gap: 4px;
	color: #fff;
	background: #1f9d84;
	padding: 2px 8px;
	border-radius: 3px;
	font-weight: 500;
}

.wf-sel-frame-template:hover {
	background: #17806c;
}

.wf-sel-frame-template-icon {
	width: 12px;
	height: 12px;
}

.wf-sel-frame-edit-input {
	width: 120px;
	padding: 2px 6px;
	border: 1px solid rgba(59, 130, 246, 0.6);
	border-radius: 3px;
	background: rgba(15, 23, 42, 0.9);
	color: #f1f5f9;
	font-size: 12px;
	outline: none;
}

.wf-sel-frame-edit-input:focus {
	border-color: #3b82f6;
}

.wf-sel-frame-save {
	background: #3b82f6;
	color: white;
	font-weight: 500;
}

.wf-sel-frame-save:hover {
	background: #2563eb;
}

.wf-sel-frame-cancel {
	color: #94a3b8;
	font-size: 14px;
	padding: 2px 4px;
}

.wf-sel-frame-cancel:hover {
	background: rgba(100, 116, 139, 0.2);
	color: #cbd5e1;
}
</style>
