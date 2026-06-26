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
					placeholder="输入标签名称..."
					@keydown.enter="onSave"
					@keydown.esc="onCancelEdit"
				/>
				<button class="wf-sel-frame-btn wf-sel-frame-save" title="保存" @click.stop="onSave">
					保存
				</button>
				<button
					class="wf-sel-frame-btn wf-sel-frame-cancel"
					title="取消"
					@click.stop="onCancelEdit"
				>
					×
				</button>
			</template>
			<!-- 显示模式 -->
			<template v-else>
				<button class="wf-sel-frame-btn" title="编辑标签" @click.stop="onStartEdit">
					<span class="wf-sel-frame-tag-icon">🏷</span>
					<span class="wf-sel-frame-tag-text">{{ displayLabel }}</span>
				</button>
				<span class="wf-sel-frame-count">{{ nodeCount }}个节点</span>
				<button
					class="wf-sel-frame-btn wf-sel-frame-delete"
					title="取消框选"
					@click.stop="emit('delete')"
				>
					×
				</button>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'

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
}>()

// 本地维护的已保存标签（优先于 props.label）
const savedLabel = ref<string>('')

const displayLabel = computed(() => savedLabel.value || props.label || '编辑')

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
