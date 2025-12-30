<template>
	<div
		v-if="open && (!minimized || animating)"
		ref="shellRef"
		class="ai-chat"
		:class="{ entering, minimizing }"
		:style="shellStyle"
		@pointerdown.stop
	>
		<div class="ai-chat__title" @pointerdown.prevent="onTitlePointerDown">
			<span class="ai-chat__title-text">AI助手</span>
			<div class="ai-chat__title-actions">
				<button class="ai-chat__icon" type="button" title="最小化" @click="onMinimize">—</button>
				<button class="ai-chat__icon" type="button" title="关闭" @click="onClose">×</button>
			</div>
		</div>

		<div ref="listRef" class="ai-chat__list">
			<div v-for="m in messages" :key="m.id" class="ai-chat__msg" :class="m.role">
				<div class="ai-chat__bubble">
					<div class="ai-chat__role">{{ m.role === 'user' ? '我' : 'AI' }}</div>
					<div class="ai-chat__text">{{ m.text }}</div>
				</div>
			</div>
		</div>

		<form class="ai-chat__input" @submit.prevent="send">
			<input
				v-model="draft"
				class="ai-chat__text-input"
				type="text"
				placeholder="输入问题..."
				@keydown.enter.exact.prevent="send"
			/>
			<button class="ai-chat__send" type="submit" :disabled="!canSend">发送</button>
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
	id: string
	role: ChatRole
	text: string
	at: number
}

const props = defineProps<{ open: boolean; minimized: boolean; anchor?: { x: number; y: number } | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; 'update:minimized': [boolean] }>()

const listRef = ref<HTMLElement | null>(null)
const shellRef = ref<HTMLElement | null>(null)
const draft = ref('')

const DIALOG_W = 360
const DIALOG_H = 420

const pos = ref<{ x: number; y: number }>({ x: 12, y: 12 })
const dragged = ref(false)
const entering = ref(false)
const minimizing = ref(false)
const animating = ref(false)
const animTransform = ref<string>('')

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

const placeNearAnchor = () => {
	const a = props.anchor
	if (!a) {
		pos.value = { x: 12, y: window.innerHeight - DIALOG_H - 52 }
		return
	}
	const x = clamp(a.x - DIALOG_W + 24, 8, window.innerWidth - DIALOG_W - 8)
	const y = clamp(a.y - DIALOG_H - 12, 8, window.innerHeight - DIALOG_H - 52)
	pos.value = { x, y }
}

const computeMinimizeTransform = () => {
	const a = props.anchor
	if (!a) return 'scale(0.05)'
	const cx = pos.value.x + DIALOG_W / 2
	const cy = pos.value.y + DIALOG_H / 2
	const dx = a.x - cx
	const dy = a.y - cy
	return `translate(${dx}px, ${dy}px) scale(0.05)`
}

const shellStyle = computed(() => {
	return {
		left: `${pos.value.x}px`,
		top: `${pos.value.y}px`,
		transform: minimizing.value ? animTransform.value : '',
	} as any
})

const messages = ref<ChatMessage[]>([
	{
		id: 'm0',
		role: 'assistant',
		text: '你好，我是 AI 助手（待接入模型）。你可以先输入问题，我会把它显示在对话记录中。',
		at: Date.now(),
	},
])

const canSend = computed(() => draft.value.trim().length > 0)

const scrollToBottom = async () => {
	await nextTick()
	const el = listRef.value
	if (!el) return
	el.scrollTop = el.scrollHeight
}

watch(
	() => [props.open, props.minimized],
	() => {
		if (props.open && !props.minimized) void scrollToBottom()
	}
)

watch(
	() => props.open,
	(open) => {
		if (!open) return
		if (!dragged.value) placeNearAnchor()
		entering.value = true
		animating.value = true
		requestAnimationFrame(() => {
			entering.value = false
			animating.value = false
		})
	}
)

watch(
	() => props.minimized,
	(min) => {
		if (!props.open) return
		if (min) {
			// minimize animation toward anchor
			animTransform.value = computeMinimizeTransform()
			minimizing.value = true
			animating.value = true
			window.setTimeout(() => {
				minimizing.value = false
				animating.value = false
			}, 180)
			return
		}
		// restore from minimized: start at anchor then expand back
		if (!dragged.value) placeNearAnchor()
		animTransform.value = computeMinimizeTransform()
		minimizing.value = true
		animating.value = true
		requestAnimationFrame(() => {
			// animate to normal
			minimizing.value = false
			animating.value = false
		})
	}
)

const onMinimize = () => {
	emit('update:minimized', true)
}

const onClose = () => {
	emit('update:open', false)
	emit('update:minimized', false)
}

// ----- dragging -----
let dragging: { px: number; py: number; ox: number; oy: number } | null = null

const onTitlePointerDown = (e: PointerEvent) => {
	if (props.minimized) return
	const el = shellRef.value
	if (!el) return
	;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
	dragging = { px: e.clientX, py: e.clientY, ox: pos.value.x, oy: pos.value.y }
	dragged.value = true
}

const onPointerMove = (e: PointerEvent) => {
	if (!dragging) return
	const dx = e.clientX - dragging.px
	const dy = e.clientY - dragging.py
	pos.value = { x: dragging.ox + dx, y: dragging.oy + dy }
}

const onPointerUp = () => {
	dragging = null
}

window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerup', onPointerUp)
onBeforeUnmount(() => {
	window.removeEventListener('pointermove', onPointerMove)
	window.removeEventListener('pointerup', onPointerUp)
})

const send = async () => {
	const text = draft.value.trim()
	if (!text) return
	draft.value = ''

	messages.value.push({ id: `u-${Date.now()}`, role: 'user', text, at: Date.now() })
	await scrollToBottom()

	// 占位：后续接入真实 AI 服务（Agent / API）
	messages.value.push({
		id: `a-${Date.now()}`,
		role: 'assistant',
		text: '已收到你的问题（AI 接入待实现）。',
		at: Date.now(),
	})
	await scrollToBottom()
}
</script>

<style scoped>
.ai-chat {
	position: fixed;
	left: 12px;
	top: 12px;
	width: 360px;
	height: 420px;
	border: 1px solid var(--vscode-border);
	border-radius: 0;
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	z-index: 6;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	opacity: 1;
	transform: translate(0, 0) scale(1);
	transition: transform 180ms ease, opacity 180ms ease;
}

.ai-chat.entering {
	opacity: 0;
	transform: translate(0, 8px) scale(0.98);
}

.ai-chat__title {
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 10px;
	background: var(--dweb-defualt-dark);
	border-bottom: 1px solid var(--vscode-border);
	cursor: move;
}

.ai-chat__title-text {
	font-size: 12px;
	font-weight: 600;
}

.ai-chat__title-actions {
	display: flex;
	gap: 6px;
}

.ai-chat__icon {
	width: 26px;
	height: 24px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
}

.ai-chat__icon:hover {
	border-color: var(--vscode-border-accent);
}

.ai-chat__list {
	flex: 1;
	min-height: 0;
	overflow: auto;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.ai-chat__msg {
	display: flex;
}

.ai-chat__msg.user {
	justify-content: flex-end;
}

.ai-chat__msg.assistant {
	justify-content: flex-start;
}

.ai-chat__bubble {
	max-width: 90%;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	border-radius: 0;
	padding: 8px 10px;
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-word;
}

.ai-chat__msg.user .ai-chat__bubble {
	border-color: var(--vscode-border-accent);
}

.ai-chat__msg.assistant .ai-chat__bubble {
	border-color: var(--vscode-border);
}

.ai-chat__role {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	margin-bottom: 4px;
}

.ai-chat__input {
	height: 44px;
	display: flex;
	gap: 8px;
	align-items: center;
	padding: 8px;
	border-top: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
}

.ai-chat__text-input {
	flex: 1;
	min-width: 0;
	height: 28px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	padding: 0 10px;
	font-size: 12px;
}

.ai-chat__text-input:focus {
	outline: none;
	border-color: var(--vscode-border-accent);
}

.ai-chat__send {
	height: 28px;
	padding: 0 10px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.ai-chat__send:hover {
	border-color: var(--vscode-border-accent);
}

.ai-chat__send:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
