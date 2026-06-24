<template>
	<Teleport to="body">
		<div
			v-if="visible"
			class="wf-tag-editor-overlay"
			:style="{ left: screenX + 'px', top: screenY + 'px' }"
			@pointerdown.stop
			@click.stop
		>
			<div class="wf-tag-editor">
				<input
					ref="inputRef"
					v-model="draft"
					class="wf-tag-input"
					placeholder="输入标签名称..."
					@keydown.enter="commit"
					@keydown.esc="cancel"
				/>
				<button class="wf-tag-save-btn" @click.stop="commit">保存</button>
				<div class="wf-tag-editor-hint">Enter 确认 · Esc 取消</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
	visible: boolean
	screenX: number
	screenY: number
	initialLabel?: string
}>()

const emit = defineEmits<{
	(e: 'commit', label: string): void
	(e: 'cancel'): void
	(e: 'update:visible', v: boolean): void
}>()

const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.visible, (v) => {
	if (v) {
		draft.value = props.initialLabel ?? ''
		nextTick(() => {
			inputRef.value?.focus()
		})
	}
})

const commit = () => {
	const label = draft.value.trim()
	emit('commit', label)
	emit('update:visible', false)
}

const cancel = () => {
	emit('cancel')
	emit('update:visible', false)
}
</script>

<style scoped>
.wf-tag-editor-overlay {
	position: fixed;
	z-index: 9999;
}

.wf-tag-editor {
	display: flex;
	align-items: center;
	gap: 8px;
	background: color-mix(in srgb, var(--theme-bg-elevated) 95%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary) 50%, transparent);
	border-radius: 4px;
	padding: 8px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	backdrop-filter: blur(12px);
}

.wf-tag-input {
	width: 180px;
	padding: 6px 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 40%, transparent);
	border-radius: 3px;
	background: transparent;
	color: var(--wf-text);
	font-size: 13px;
	outline: none;
}

.wf-tag-input:focus {
	border-color: var(--wf-primary);
}

.wf-tag-save-btn {
	padding: 6px 12px;
	border: none;
	border-radius: 3px;
	background: var(--wf-primary);
	color: white;
	font-size: 12px;
	cursor: pointer;
	transition: background 150ms ease;
}

.wf-tag-save-btn:hover {
	background: color-mix(in srgb, var(--wf-primary) 80%, black);
}

.wf-tag-editor-hint {
	margin-top: 4px;
	font-size: 11px;
	color: var(--wf-text-muted);
}
</style>