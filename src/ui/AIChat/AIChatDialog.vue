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
			<div class="ai-chat__title-left">
				<span class="ai-chat__title-text">AI助手</span>
				<span v-if="sending" class="ai-chat__title-status">{{ taskStatusLabel }}</span>
			</div>
			<div class="ai-chat__title-actions">
				<button
					class="ai-chat__icon"
					type="button"
					:title="deepMode ? '深度思考模式：开' : '深度思考模式：关'"
					@click="toggleDeepMode"
				>
					{{ deepMode ? '深' : '浅' }}
				</button>
				<button v-if="sending" class="ai-chat__icon" type="button" title="停止" @click="stopTask">⏹</button>
				<button class="ai-chat__icon" type="button" title="最小化" @click="onMinimize">—</button>
				<button class="ai-chat__icon" type="button" title="关闭" @click="onClose">×</button>
			</div>
		</div>

		<div class="ai-chat__body">
			<div ref="listRef" class="ai-chat__list" @scroll.passive="onListScroll">
				<div v-for="m in messages" :key="m.id" class="ai-chat__msg" :class="[m.role]">
					<div class="ai-chat__bubble">
						<div class="ai-chat__role">{{ m.role === 'user' ? '我' : 'AI' }}</div>
						<div class="ai-chat__text">{{ m.text }}</div>
						<div v-if="isRunning(m) && taskStatusLabel" class="ai-chat__phase">{{ taskStatusLabel }}</div>
						<div v-if="isRunning(m)" class="ai-chat__typing" aria-label="AI 正在处理">
							<span class="ai-chat__dot" />
							<span class="ai-chat__dot" />
							<span class="ai-chat__dot" />
						</div>
						<div v-if="showStageActions(m)" class="ai-chat__actions">
							<button class="ai-chat__action-btn" type="button" :disabled="sending" @click="regenerateLast">
								重新生成
							</button>
							<button class="ai-chat__action-btn" type="button" :disabled="sending" @click="undoStage">
								撤回
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<form class="ai-chat__input" @submit.prevent="send">
			<input
				v-model="draft"
				class="ai-chat__text-input"
				type="text"
				placeholder="输入问题..."
				:disabled="sending"
				@keydown.enter.exact.prevent="send"
			/>
			<button class="ai-chat__send" type="submit" :disabled="!canSend">发送</button>
		</form>

		<div class="ai-chat__thought" :class="{ open: thoughtOpen }" aria-label="思考面板">
			<div class="ai-chat__thought-head">
				<div class="ai-chat__thought-title">思考</div>
				<button class="ai-chat__thought-close" type="button" title="关闭思考" @click="closeThought">×</button>
			</div>
			<div class="ai-chat__thought-text">{{ thoughtText }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { aiChatService } from '../../network/AIChatService'
import type { AgentToUiMessage } from '../../core/agentToUI'
import { componentTemplateApi } from '../../core/components'
import { findLayer, findNode, nodeExistsInAnyLayer } from '../../core/scene'
import { VideoSceneKey, type VideoSceneState } from '../../store/videoscene'
import { editorPersistence } from '../../adapters/editorPersistence'
import { dispatchDvsEditorNodeDeleted, dispatchDvsEditorNodePatched } from '../../adapters/windowEventBridge'
import { DwebCanvasGLKey } from '../VideoScene/VideoSceneRuntime'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
	id: string
	role: ChatRole
	text: string
	at: number
	hasStageResult?: boolean
}

const props = defineProps<{ open: boolean; minimized: boolean; anchor?: { x: number; y: number } | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; 'update:minimized': [boolean] }>()

const store = useStore<VideoSceneState>(VideoSceneKey)

const dwebCanvasRef = inject<any>(DwebCanvasGLKey, null)

const debugAgentToUi = (() => {
	try {
		return (import.meta as any)?.env?.DEV || window.localStorage.getItem('dvs.aiChat.debug') === '1'
	} catch {
		return false
	}
})()

const listRef = ref<HTMLElement | null>(null)
const shellRef = ref<HTMLElement | null>(null)
const draft = ref('')

const thoughtText = ref('')
const thoughtOpen = ref(false)
const thoughtDismissed = ref(false)

const closeThought = () => {
	thoughtOpen.value = false
	thoughtDismissed.value = true
}

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

const deepMode = ref(false)

const loadDeepMode = () => {
	try {
		deepMode.value = window.localStorage.getItem('dvs.aiChat.deepMode') === '1'
	} catch {
		deepMode.value = false
	}
}

const persistDeepMode = () => {
	try {
		window.localStorage.setItem('dvs.aiChat.deepMode', deepMode.value ? '1' : '0')
	} catch {
		// ignore
	}
}

const toggleDeepMode = () => {
	deepMode.value = !deepMode.value
	persistDeepMode()
}

loadDeepMode()

const conversationId = ref<string | null>(null)
const sending = ref(false)
let aborter: AbortController | null = null
const stoppedByUser = ref(false)

const pinnedToBottom = ref(true)

const isNearBottom = (el: HTMLElement, thresholdPx = 24) => {
	const remain = el.scrollHeight - el.scrollTop - el.clientHeight
	return remain <= thresholdPx
}

const onListScroll = () => {
	const el = listRef.value
	if (!el) return
	pinnedToBottom.value = isNearBottom(el)
}

type TaskPhase = 'idle' | 'started' | 'streaming' | 'writing' | 'template' | 'done' | 'stopped' | 'error'
const taskPhase = ref<TaskPhase>('idle')
const taskPhaseMessage = ref<string>('')

const taskStatusLabel = computed(() => {
	if (stoppedByUser.value) return '已停止'
	if (!sending.value) return ''
	if (typeof taskPhaseMessage.value === 'string' && taskPhaseMessage.value.trim()) return taskPhaseMessage.value.trim()
	const p = taskPhase.value
	if (p === 'started') return '已开始…'
	if (p === 'streaming') return '连接模型…'
	if (p === 'writing') return '生成说明…'
	if (p === 'template') return '生成组件…'
	return '任务进行中…'
})

const lastUserText = ref<string>('')

type StageOps = {
	insertedNodeIds: string[]
	filters: Array<{ target: 'selection' | 'nodeId'; nodeId?: string; layerId?: string; mode: 'append' | 'replace'; filter: any }>
}

const lastStageOps = ref<StageOps>({ insertedNodeIds: [], filters: [] })

const selfCheckActive = ref(false)

const activeAssistantId = ref<string | null>(null)
const receivedAnyText = ref(false)

let typingTimer: number | null = null
let typingQueue = ''

const stopTyping = () => {
	if (typingTimer !== null) {
		window.clearInterval(typingTimer)
		typingTimer = null
	}
	typingQueue = ''
}

const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null

const sanitizeComponentTemplate = (template: unknown): unknown => {
	if (!isRecord(template)) return template
	const nodes = (template as any).nodes
	if (!Array.isArray(nodes)) return template
	const rootLocalId = typeof (template as any).rootLocalId === 'string' ? String((template as any).rootLocalId) : ''
	const localIdSet = new Set<string>()
	for (const n of nodes) {
		if (n && typeof n === 'object' && typeof (n as any).localId === 'string') localIdSet.add((n as any).localId)
	}

	const normalizeParentLocalId = (parentLocalId: unknown): string | undefined => {
		if (typeof parentLocalId !== 'string') return undefined
		const raw = parentLocalId.trim()
		if (!raw) return undefined
		if (localIdSet.has(raw)) return raw
		if (raw.includes(':')) {
			const suffix = raw.split(':').pop()?.trim()
			if (suffix && localIdSet.has(suffix)) return suffix
		}
		return undefined
	}

	const nextNodes = nodes.map((n: any) => {
		if (!isRecord(n)) return n
		const next: any = { ...n }
		// validate.ts requires props to be an object for every node.
		if (!isRecord(next.props)) next.props = {}
		// if transform provided but invalid, drop it (validator requires object when provided).
		if (next.transform !== undefined && !isRecord(next.transform)) delete next.transform
		// parentLocalId: must reference an existing localId inside the same template.
		if (typeof next.localId === 'string' && next.localId === rootLocalId) {
			// Root must not have parentLocalId.
			if (next.parentLocalId !== undefined) delete next.parentLocalId
		} else if (next.parentLocalId !== undefined) {
			const normalized = normalizeParentLocalId(next.parentLocalId)
			if (!normalized) {
				if (debugAgentToUi) {
					try {
						console.warn('[AIChat] drop invalid parentLocalId:', next.parentLocalId, 'on node', next.localId)
					} catch {
						// ignore
					}
				}
				delete next.parentLocalId
			} else if (normalized !== next.parentLocalId) {
				if (debugAgentToUi) {
					try {
						console.warn('[AIChat] normalize parentLocalId:', next.parentLocalId, '=>', normalized, 'on node', next.localId)
					} catch {
						// ignore
					}
				}
				next.parentLocalId = normalized
			}
		}
		return next
	})
	return { ...(template as any), nodes: nextNodes }
}

const applyFilterToSelection = async (filter: Record<string, any>, mode: 'append' | 'replace' = 'append') => {
	const layer = findLayer(store.state, store.state.activeLayerId)
	if (!layer) throw new Error('active layer not found')
	const selectedIds = store.state.selectedNodeIds?.length ? store.state.selectedNodeIds : (store.state.selectedNodeId ? [store.state.selectedNodeId] : [])
	if (!selectedIds.length) throw new Error('当前没有选中节点')
	for (const nodeId of selectedIds) {
		const node = findNode(layer.nodeTree, nodeId)
		if (!node || node.category !== 'user') continue
		const prev = Array.isArray((node.props as any)?.filters) ? ((node.props as any).filters as any[]) : []
		const next = mode === 'replace' ? [filter] : [...prev, filter]
		await store.dispatch('updateNodeProps', { nodeId, patch: { filters: next } })
	}
}

const applyFilterToNodeId = async (
	nodeId: string,
	filter: Record<string, any>,
	mode: 'append' | 'replace' = 'append',
	preferredLayerId?: string
) => {
	const tryLayerIds = [preferredLayerId, store.state.activeLayerId].filter((x): x is string => typeof x === 'string' && !!x)
	const visited = new Set<string>()

	const findInLayer = (layerId: string) => {
		const layer = findLayer(store.state, layerId)
		if (!layer) return null
		const node = findNode(layer.nodeTree, nodeId)
		if (!node || node.category !== 'user') return null
		return { layerId, node }
	}

	for (const lid of tryLayerIds) {
		visited.add(lid)
		const hit = findInLayer(lid)
		if (hit) {
			const prev = Array.isArray((hit.node.props as any)?.filters) ? ((hit.node.props as any).filters as any[]) : []
			const next = mode === 'replace' ? [filter] : [...prev, filter]
			await store.dispatch('updateNodeProps', { layerId: hit.layerId, nodeId, patch: { filters: next } })
			return
		}
	}

	for (const layer of store.state.layers) {
		if (visited.has(layer.id)) continue
		const hit = findInLayer(layer.id)
		if (hit) {
			const prev = Array.isArray((hit.node.props as any)?.filters) ? ((hit.node.props as any).filters as any[]) : []
			const next = mode === 'replace' ? [filter] : [...prev, filter]
			await store.dispatch('updateNodeProps', { layerId: hit.layerId, nodeId, patch: { filters: next } })
			return
		}
	}

	throw new Error(`未找到节点：${nodeId}`)
}

const collectNodeIds = (root: any): string[] => {
	const out: string[] = []
	const visit = (n: any) => {
		if (!n || typeof n !== 'object') return
		if (typeof n.id === 'string') out.push(n.id)
		const children = (n as any).children
		if (Array.isArray(children)) children.forEach(visit)
	}
	visit(root)
	return out
}

const buildContextPack = () => {
	const activeLayerId = store.state.activeLayerId
	const layer = findLayer(store.state, activeLayerId)
	const selectedNodeIds = store.state.selectedNodeIds?.length
		? store.state.selectedNodeIds
		: (store.state.selectedNodeId ? [store.state.selectedNodeId] : [])

	let selectedNodes: any[] = []
	if (layer && selectedNodeIds.length) {
		selectedNodes = selectedNodeIds
			.map((id) => findNode(layer.nodeTree, id))
			.filter((n) => !!n)
	}

	return {
		activeLayerId,
		layers: store.state.layers.map((l: any) => ({ id: l.id, name: l.name })),
		selectedNodeIds,
		selectedNodes,
		activeLayer: layer ? { id: layer.id, name: (layer as any).name, nodeTree: layer.nodeTree } : null,
		lastStageOps: lastStageOps.value,
	}
}

const coerceNumber = (v: unknown): number | undefined => {
	if (typeof v === 'number' && Number.isFinite(v)) return v
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v)
		if (Number.isFinite(n)) return n
	}
	return undefined
}

const toComponentTemplateLike = (v: unknown, opts?: { defaultCenterWorld?: { x: number; y: number } }): unknown => {
	let obj: unknown = v
	if (typeof obj === 'string') {
		try {
			obj = JSON.parse(obj)
		} catch {
			return v
		}
	}
	if (!isRecord(obj)) return v

	// Already looks like a ComponentTemplate.
	if (obj.schemaVersion === 1 && typeof obj.templateId === 'string' && Array.isArray(obj.nodes) && typeof obj.rootLocalId === 'string') {
		return obj
	}

	// Heuristic: model returned a single node-like object.
	const nodeType = typeof obj.type === 'string' ? obj.type : 'text'
	const center = opts?.defaultCenterWorld
	const transform = {
		x: coerceNumber(obj.x) ?? center?.x ?? 0,
		y: coerceNumber(obj.y) ?? center?.y ?? 0,
		width: coerceNumber(obj.width),
		height: coerceNumber(obj.height),
		rotation: coerceNumber(obj.rotation),
		opacity: coerceNumber(obj.opacity),
	}

	const reserved = new Set(['type', 'id', 'localId', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'name', 'children', 'parentId'])
	const props: Record<string, any> = isRecord(obj.props) ? { ...obj.props } : {}
	for (const [k, val] of Object.entries(obj)) {
		if (reserved.has(k)) continue
		if (k === 'props') continue
		props[k] = val
	}

	return {
		schemaVersion: 1,
		templateId: `ai_${Date.now()}`,
		name: typeof obj.name === 'string' ? obj.name : 'AI生成节点',
		params: [],
		nodes: [
			{
				localId: 'root',
				type: nodeType,
				props,
				transform,
			},
		],
		rootLocalId: 'root',
	}
}

const normalizeTemplateForViewport = (template: any, opts?: { defaultCenterWorld?: { x: number; y: number } }) => {
	if (!isRecord(template)) return template
	if (!Array.isArray((template as any).nodes)) return template
	const rootId = (template as any).rootLocalId
	if (typeof rootId !== 'string') return template
	const nodes = (template as any).nodes
	const idx = nodes.findIndex((n: any) => n && typeof n === 'object' && n.localId === rootId)
	if (idx < 0) return template
	const node = nodes[idx]
	if (!isRecord(node)) return template
	const t = isRecord((node as any).transform) ? (node as any).transform : {}
	const cx = coerceNumber(t.x)
	const cy = coerceNumber(t.y)
	if (cx != null && cy != null) return template
	const center = opts?.defaultCenterWorld
	if (!center) return template
	const nextNode = { ...node, transform: { ...t, x: cx ?? center.x, y: cy ?? center.y } }
	const nextNodes = nodes.slice()
	nextNodes[idx] = nextNode
	return { ...template, nodes: nextNodes }
}

const ensureTyping = (assistantId: string) => {
	if (typingTimer !== null) return
	typingTimer = window.setInterval(() => {
		if (!typingQueue) {
			if (!sending.value) stopTyping()
			return
		}
		const ch = typingQueue[0]
		typingQueue = typingQueue.slice(1)
		const idx = messages.value.findIndex((x) => x.id === assistantId)
		if (idx >= 0) messages.value[idx].text += ch
		void scrollToBottom()
	}, 22)
}

const extractReadableText = (raw: string): string => {
	const text = String(raw ?? '')
	const trimmed = text.trim()
	if (!trimmed) return ''

	const tryParse = (s: string): any | null => {
		try {
			return JSON.parse(s)
		} catch {
			return null
		}
	}

	// Fast path: exact JSON object/array.
	// If it is JSON but not a known envelope, hide it to prevent leaking raw JSON into the UI.
	if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
		const obj = tryParse(trimmed)
		if (obj) return extractReadableTextFromAgentJson(obj) ?? ''
	}

	// Embedded JSON object within other text (or pretty-printed JSON fragments).
	const first = trimmed.indexOf('{')
	const last = trimmed.lastIndexOf('}')
	if (first >= 0 && last > first) {
		const candidate = trimmed.slice(first, last + 1)
		const obj = tryParse(candidate)
		if (obj) {
			const extracted = extractReadableTextFromAgentJson(obj)
			if (extracted) return extracted
			// Strip JSON fragment to avoid leaking raw JSON into the UI.
			const stripped = (trimmed.slice(0, first) + trimmed.slice(last + 1)).trim()
			return stripped
		}
	}

	return text
}

const extractReadableTextFromAgentJson = (obj: any): string | null => {
	const t = obj?.type
	const p = obj?.payload
	if (t === 'agentToUi/chatMessage' && typeof p?.content === 'string') return p.content
	if (t === 'agentToUi/chat' && typeof p?.message === 'string') return p.message
	if (t === 'agentToUi/chat' && typeof p?.content === 'string') return p.content
	if (t === 'agentToUi/text' && typeof p?.text === 'string') return p.text
	// Some backends/models may embed an envelope under payload.
	if (isRecord(p) && typeof p.text === 'string') {
		const inner = p.text.trim()
		if (inner.startsWith('{') && inner.endsWith('}')) {
			try {
				const innerObj = JSON.parse(inner)
				return extractReadableTextFromAgentJson(innerObj)
			} catch {
				// ignore
			}
		}
	}
	return null
}

const pushStreamText = (assistantId: string, text: string) => {
	if (!text) return
	text = extractReadableText(text)
	if (!text) return
	receivedAnyText.value = true
	typingQueue += text
	ensureTyping(assistantId)
}

const getViewportContext = (): any | null => {
	const canvas = dwebCanvasRef?.value
	if (!canvas) return null
	try {
		const size = canvas.size
		const vp = canvas.viewport
		const centerScreen = { x: size.width / 2, y: size.height / 2 }
		const centerWorld = canvas.screenToWorld(centerScreen)
		return {
			panX: vp?.pan?.x,
			panY: vp?.pan?.y,
			zoom: vp?.zoom,
			screenW: size.width,
			screenH: size.height,
			centerWorld,
		}
	} catch {
		return null
	}
}

const canSend = computed(() => !sending.value && draft.value.trim().length > 0)

const scrollToBottom = async (opts?: { force?: boolean }) => {
	await nextTick()
	const el = listRef.value
	if (!el) return
	if (!opts?.force && !pinnedToBottom.value) return
	el.scrollTop = el.scrollHeight
}

watch(
	() => [props.open, props.minimized],
	() => {
		if (props.open && !props.minimized) void scrollToBottom({ force: true })
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
	thoughtOpen.value = false
	thoughtDismissed.value = false
	thoughtText.value = ''
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
	stopTyping()
	aborter?.abort()
})

const isAbortError = (e: unknown) => {
	return (
		e instanceof DOMException && e.name === 'AbortError'
	) || (
		e instanceof Error && /abort/i.test(e.name + ' ' + e.message)
	)
}

const stopTask = () => {
	if (!sending.value) return
	stoppedByUser.value = true
	taskPhase.value = 'stopped'
	taskPhaseMessage.value = ''
	stopTyping()
	aborter?.abort()
}

const sendText = async (text: string) => {
	if (!text.trim()) return
	if (sending.value) return
	stoppedByUser.value = false
	taskPhase.value = 'started'
	taskPhaseMessage.value = ''
	lastUserText.value = text
	draft.value = ''
	sending.value = true
	lastStageOps.value = { insertedNodeIds: [], filters: [] }

	// cancel any in-flight streaming
	aborter?.abort()
	aborter = new AbortController()
	stopTyping()
	receivedAnyText.value = false

	messages.value.push({ id: `u-${Date.now()}`, role: 'user', text, at: Date.now() })
	await scrollToBottom({ force: true })

	const assistantId = `a-${Date.now()}`
	activeAssistantId.value = assistantId
	messages.value.push({ id: assistantId, role: 'assistant', text: '', at: Date.now() })
	await scrollToBottom({ force: true })

	try {
		if (!conversationId.value) {
			const conv = await aiChatService.createConversation()
			conversationId.value = conv.id
		}

		for await (const ev of aiChatService.streamMessage({
			conversationId: conversationId.value,
			content: text,
			contextPack: buildContextPack(),
			provider: 'deepseek',
			responseMode: 'agentToUi-jsonl',
			viewport: getViewportContext() ?? undefined,
			signal: aborter.signal,
		})) {
			if (ev.type === 'msg') {
				const m = ev.message as AgentToUiMessage
				if (debugAgentToUi) {
					try {
						console.debug('[AIChat] AgentToUI msg:', m.type, m)
					} catch {
						// ignore
					}
				}
				if (m.type === 'agentToUi/applyFilter') {
					taskPhase.value = 'template'
					try {
						const payload: any = (m as any).payload
						const filter = payload?.filter
						const mode = payload?.mode === 'replace' ? 'replace' : 'append'
						if (!isRecord(filter)) throw new Error('filter 必须是对象')
						if (payload?.target === 'nodeId' && typeof payload?.nodeId === 'string') {
							await applyFilterToNodeId(payload.nodeId, filter, mode, typeof payload?.layerId === 'string' ? payload.layerId : undefined)
							lastStageOps.value.filters.push({
								target: 'nodeId',
								nodeId: payload.nodeId,
								layerId: typeof payload?.layerId === 'string' ? payload.layerId : undefined,
								mode,
								filter,
							})
						} else {
							await applyFilterToSelection(filter, mode)
							lastStageOps.value.filters.push({ target: 'selection', mode, filter })
						}
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							const ft = String(filter?.type ?? '')
							const targetLabel = payload?.target === 'nodeId' && typeof payload?.nodeId === 'string' ? `节点 ${payload.nodeId}` : '选中节点'
							messages.value[idx].text = (messages.value[idx].text || '') + `\n\n已为${targetLabel}应用滤镜：${ft || 'filter'}。`
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) messages.value[idx].text = (messages.value[idx].text || '') + `\n\n滤镜应用失败：${err instanceof Error ? err.message : String(err)}`
					}
					continue
				}
				if (m.type === 'agentToUi/taskStatus') {
					const phase = (m as any).payload?.phase
					const msg = (m as any).payload?.message
					if (typeof msg === 'string') taskPhaseMessage.value = msg
					// 思考内容不进聊天记录：仅刷新左侧单一思考栏。
					{
						const text = (typeof msg === 'string' && msg.trim()) ? msg.trim() : String(phase ?? '').trim()
						if (text) {
							thoughtText.value = text
							if (!thoughtDismissed.value) thoughtOpen.value = true
						}
					}
					if (phase === 'started') taskPhase.value = 'started'
					else if (phase === 'streaming') taskPhase.value = 'streaming'
					else if (phase === 'writing') taskPhase.value = 'writing'
					else if (phase === 'template') taskPhase.value = 'template'
					else if (phase === 'done') taskPhase.value = 'done'
					else if (phase === 'error') taskPhase.value = 'error'
					else if (phase === 'canceled') taskPhase.value = 'stopped'
					continue
				}
				if (m.type === 'agentToUi/text') {
					taskPhase.value = 'writing'
					pushStreamText(assistantId, m.payload.text)
					continue
				}
				if (m.type === 'agentToUi/insertNode') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payloadAny: any = (m as any).payload
						const targetLayerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
						const rawParentId = payloadAny?.parentId
						const targetParentId: string | null | undefined =
							rawParentId === null
								? null
								: typeof rawParentId === 'string' && rawParentId.trim()
									? rawParentId.trim()
									: undefined
						const nodeUnknown: unknown = payloadAny?.node
						if (!isRecord(nodeUnknown)) throw new Error('insertNode.payload.node 必须是对象')

						let finalLayerId = targetLayerId
						if (finalLayerId && !findLayer(store.state, finalLayerId)) {
							if (debugAgentToUi) console.warn('[AIChat] insertNode: layerId not found, fallback to activeLayer:', finalLayerId)
							finalLayerId = undefined
						}
						let finalParentId: string | null | undefined = targetParentId
						if (typeof finalParentId === 'string' && finalParentId !== 'root') {
							const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
							const exists = layer ? !!findNode(layer.nodeTree, finalParentId) : nodeExistsInAnyLayer(store.state.layers, finalParentId)
							if (!exists) {
								if (debugAgentToUi) console.warn('[AIChat] insertNode: parentId not found, fallback to root:', finalParentId)
								finalParentId = undefined
							}
						}

						// Minimal normalization: ensure props is object, prefer user nodes.
						const n: any = { ...(nodeUnknown as any) }
						if (!isRecord(n.props)) n.props = {}
						if (typeof n.category !== 'string') n.category = 'user'
						if (n.category === 'user') {
							if (typeof n.userType !== 'string') {
								// Allow shorthand 'type' from template-like payloads.
								if (typeof n.type === 'string') n.userType = n.type
							}
							if (!isRecord(n.transform)) n.transform = { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
						}
						await store.dispatch('addNodeTree', { node: n, layerId: finalLayerId, parentId: finalParentId })

						// best-effort: collect inserted ids if present
						try {
							lastStageOps.value.insertedNodeIds.push(...collectNodeIds(n))
						} catch {
							// ignore
						}

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								`\n\n已插入舞台节点（insertNode${finalParentId !== undefined ? `, parentId=${String(finalParentId)}` : ''}${finalLayerId ? `, layerId=${finalLayerId}` : ''}）。`
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) messages.value[idx].text = `节点插入失败：${err instanceof Error ? err.message : String(err)}`
					}
					continue
				}
				if (m.type === 'agentToUi/patchNode') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payloadAny: any = (m as any).payload
						const nodeId = typeof payloadAny?.nodeId === 'string' ? payloadAny.nodeId.trim() : ''
						if (!nodeId) throw new Error('patchNode.payload.nodeId 必须是非空字符串')
						const patch = payloadAny?.patch
						if (!isRecord(patch)) throw new Error('patchNode.payload.patch 必须是对象')
						const layerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
						dispatchDvsEditorNodePatched({ nodeId, layerId, patch })

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text = (messages.value[idx].text || '') + `\n\n已修改节点：${nodeId}。`
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) messages.value[idx].text = `节点修改失败：${err instanceof Error ? err.message : String(err)}`
					}
					continue
				}
				if (m.type === 'agentToUi/deleteNode') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payloadAny: any = (m as any).payload
						const layerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
						const ids: string[] = []
						if (typeof payloadAny?.nodeId === 'string' && payloadAny.nodeId.trim()) ids.push(payloadAny.nodeId.trim())
						if (Array.isArray(payloadAny?.nodeIds)) {
							for (const s of payloadAny.nodeIds) {
								if (typeof s === 'string' && s.trim()) ids.push(s.trim())
							}
						}
						const uniq = Array.from(new Set(ids))
						if (!uniq.length) throw new Error('deleteNode.payload.nodeId/nodeIds 至少提供一个')
						for (const nodeId of uniq) dispatchDvsEditorNodeDeleted({ nodeId, layerId })

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text = (messages.value[idx].text || '') + `\n\n已删除节点：${uniq.join(', ')}。`
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) messages.value[idx].text = `节点删除失败：${err instanceof Error ? err.message : String(err)}`
					}
					continue
				}
				if (m.type === 'agentToUi/chatMessage') {
					taskPhase.value = 'writing'
					const content = (m as any).payload?.content
					if (typeof content === 'string') pushStreamText(assistantId, content)
					continue
				}
				if (m.type === 'agentToUi/error') {
					taskPhase.value = 'error'
					stopTyping()
					const idx = messages.value.findIndex((x) => x.id === assistantId)
					if (idx >= 0) messages.value[idx].text = `后端错误：${m.payload.code} ${m.payload.message}`
					break
				}
				if (m.type === 'agentToUi/componentTemplate') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					// Instantiate and insert into stage.
					try {
						const payloadAny: any = (m as any).payload
						const targetLayerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
						const rawParentId = payloadAny?.parentId
						const targetParentId: string | null | undefined =
							rawParentId === null
								? null
								: typeof rawParentId === 'string' && rawParentId.trim()
									? rawParentId.trim()
									: undefined

						let template: unknown = m.payload.template
						if (debugAgentToUi) {
							try {
								console.debug('[AIChat] componentTemplate raw:', template)
							} catch {
								// ignore
							}
						}
						try {
							const vp = getViewportContext()
							const center = vp?.centerWorld && typeof vp.centerWorld.x === 'number' && typeof vp.centerWorld.y === 'number' ? vp.centerWorld : undefined
							template = toComponentTemplateLike(template, { defaultCenterWorld: center })
							template = normalizeTemplateForViewport(template as any, { defaultCenterWorld: center })
							template = sanitizeComponentTemplate(template)
							if (debugAgentToUi) {
								try {
									console.debug('[AIChat] componentTemplate normalized:', template)
								} catch {
									// ignore
								}
							}
						} catch {
							// ignore and let instantiateTemplate throw
						}
						const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')
						const instantiated = componentTemplateApi.instantiateTemplate(template as any, {}, {
							getNodeId: ({ templateId, localId }) => {
								const base = safeIdPart(`${templateId}:${localId}`)
								let id = base
								let i = 1
								while (nodeExistsInAnyLayer(store.state.layers, id)) {
									id = `${base}__${i++}`
								}
								return id
							},
						})
						let finalLayerId = targetLayerId
						if (finalLayerId && !findLayer(store.state, finalLayerId)) {
							if (debugAgentToUi) console.warn('[AIChat] componentTemplate: layerId not found, fallback to activeLayer:', finalLayerId)
							finalLayerId = undefined
						}
						let finalParentId: string | null | undefined = targetParentId
						if (typeof finalParentId === 'string' && finalParentId !== 'root') {
							const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
							const exists = layer ? !!findNode(layer.nodeTree, finalParentId) : nodeExistsInAnyLayer(store.state.layers, finalParentId)
							if (!exists) {
								if (debugAgentToUi) console.warn('[AIChat] componentTemplate: parentId not found, fallback to root:', finalParentId)
								finalParentId = undefined
							}
						}
						await store.dispatch('addNodeTree', { node: instantiated.root, layerId: finalLayerId, parentId: finalParentId })
						lastStageOps.value.insertedNodeIds.push(...collectNodeIds(instantiated.root))
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								`\n\n已插入舞台节点（intent=${m.payload.intent ?? 'insert'}${finalParentId !== undefined ? `, parentId=${String(finalParentId)}` : ''}${finalLayerId ? `, layerId=${finalLayerId}` : ''}）。`
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) messages.value[idx].text = `模板插入失败：${err instanceof Error ? err.message : String(err)}`
					}
					const idx = messages.value.findIndex((x) => x.id === assistantId)
					if (idx >= 0) {
						// keep a small marker
						messages.value[idx].text = (messages.value[idx].text || '')
					}
					continue
				}
			}
			if (ev.type === 'error') {
				if (stoppedByUser.value) break
				stopTyping()
				const idx = messages.value.findIndex((x) => x.id === assistantId)
				if (idx >= 0) messages.value[idx].text = `请求失败：${ev.error.message}`
				break
			}
			if (ev.type === 'done') break
		}

		// Auto self-check round (single pass) when stage was changed.
		if (!stoppedByUser.value && taskPhase.value !== 'error') {
			const didMutateStage = lastStageOps.value.insertedNodeIds.length > 0 || lastStageOps.value.filters.length > 0
			if (didMutateStage) {
				selfCheckActive.value = true
				// 不新增“思考/自检”气泡，避免与流式反馈重复；复用主 assistant 消息。
				taskPhase.value = 'writing'
				taskPhaseMessage.value = '自检中…'
				thoughtText.value = '自检中…'
				if (!thoughtDismissed.value) thoughtOpen.value = true
				for await (const ev2 of aiChatService.streamMessage({
					conversationId: conversationId.value,
					content:
						'【自检回合】请基于 contextPack.stage 与 lastStageOps，对刚才插入/修改的节点做一致性检查：\n' +
						'1) 字段名与类型是否符合编辑器（尤其是 text.props.textAlign）。\n' +
						'2) 文本节点是否会被裁切：text 节点通常不需要强行写 transform.width/height；如果写了也要足够容纳 textContent（含\\n换行）。\n' +
							'3) 如果发现问题：优先使用 agentToUi/patchNode 或 agentToUi/deleteNode 按 nodeId 精确修改/删除（避免新建导致错乱）；仅在确实需要新增内容时才用 agentToUi/insertNode 或 agentToUi/componentTemplate(intent="insert")；也可用 agentToUi/applyFilter 做轻量修正；如果无需修改，输出一条 chatMessage 说明“自检通过”。',
					contextPack: buildContextPack(),
					provider: 'deepseek',
					responseMode: 'agentToUi-jsonl',
					viewport: getViewportContext() ?? undefined,
					signal: aborter.signal,
				})) {
					if (ev2.type === 'msg') {
						const m2 = ev2.message as AgentToUiMessage
						if (m2.type === 'agentToUi/taskStatus') {
							const phase = (m2 as any).payload?.phase
							const msg = (m2 as any).payload?.message
							if (typeof msg === 'string') taskPhaseMessage.value = msg
							{
								const text = (typeof msg === 'string' && msg.trim()) ? msg.trim() : String(phase ?? '').trim()
								if (text) {
									thoughtText.value = text
									if (!thoughtDismissed.value) thoughtOpen.value = true
								}
							}
							if (phase === 'started') taskPhase.value = 'started'
							else if (phase === 'streaming') taskPhase.value = 'streaming'
							else if (phase === 'writing') taskPhase.value = 'writing'
							else if (phase === 'template') taskPhase.value = 'template'
							else if (phase === 'done') taskPhase.value = 'done'
							else if (phase === 'error') taskPhase.value = 'error'
							else if (phase === 'canceled') taskPhase.value = 'stopped'
							continue
						}
						if (m2.type === 'agentToUi/applyFilter') {
							const payload: any = (m2 as any).payload
							const filter = payload?.filter
							const mode = payload?.mode === 'replace' ? 'replace' : 'append'
							if (isRecord(filter)) {
								if (payload?.target === 'nodeId' && typeof payload?.nodeId === 'string') {
									await applyFilterToNodeId(payload.nodeId, filter, mode, typeof payload?.layerId === 'string' ? payload.layerId : undefined)
								} else {
									await applyFilterToSelection(filter, mode)
								}
							}
							continue
						}
						if (m2.type === 'agentToUi/componentTemplate') {
							try {
								const payloadAny: any = (m2 as any).payload
								const targetLayerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
								const rawParentId = payloadAny?.parentId
								const targetParentId: string | null | undefined =
									rawParentId === null
										? null
										: typeof rawParentId === 'string' && rawParentId.trim()
											? rawParentId.trim()
											: undefined

								let template: unknown = m2.payload.template
								const vp = getViewportContext()
								const center = vp?.centerWorld && typeof vp.centerWorld.x === 'number' && typeof vp.centerWorld.y === 'number' ? vp.centerWorld : undefined
								template = toComponentTemplateLike(template, { defaultCenterWorld: center })
								template = normalizeTemplateForViewport(template as any, { defaultCenterWorld: center })
								template = sanitizeComponentTemplate(template)
								const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')
								const instantiated = componentTemplateApi.instantiateTemplate(template as any, {}, {
									getNodeId: ({ templateId, localId }) => {
										const base = safeIdPart(`${templateId}:${localId}`)
										let id = base
										let i = 1
										while (nodeExistsInAnyLayer(store.state.layers, id)) {
											id = `${base}__${i++}`
										}
										return id
									},
								})
								let finalLayerId = targetLayerId
								if (finalLayerId && !findLayer(store.state, finalLayerId)) {
									if (debugAgentToUi) console.warn('[AIChat] self-check componentTemplate: layerId not found, fallback to activeLayer:', finalLayerId)
									finalLayerId = undefined
								}
								let finalParentId: string | null | undefined = targetParentId
								if (typeof finalParentId === 'string' && finalParentId !== 'root') {
									const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
									const exists = layer ? !!findNode(layer.nodeTree, finalParentId) : nodeExistsInAnyLayer(store.state.layers, finalParentId)
									if (!exists) {
										if (debugAgentToUi) console.warn('[AIChat] self-check componentTemplate: parentId not found, fallback to root:', finalParentId)
										finalParentId = undefined
									}
								}
								await store.dispatch('addNodeTree', { node: instantiated.root, layerId: finalLayerId, parentId: finalParentId })
							} catch {
								// ignore
							}
							continue
						}
						if (m2.type === 'agentToUi/insertNode') {
							try {
								const payloadAny: any = (m2 as any).payload
								const targetLayerId = typeof payloadAny?.layerId === 'string' && payloadAny.layerId.trim() ? payloadAny.layerId.trim() : undefined
								const rawParentId = payloadAny?.parentId
								const targetParentId: string | null | undefined =
									rawParentId === null
										? null
										: typeof rawParentId === 'string' && rawParentId.trim()
											? rawParentId.trim()
											: undefined
								const nodeUnknown: unknown = payloadAny?.node
								if (!isRecord(nodeUnknown)) throw new Error('insertNode.payload.node 必须是对象')

								let finalLayerId = targetLayerId
								if (finalLayerId && !findLayer(store.state, finalLayerId)) {
									if (debugAgentToUi) console.warn('[AIChat] self-check insertNode: layerId not found, fallback to activeLayer:', finalLayerId)
									finalLayerId = undefined
								}
								let finalParentId: string | null | undefined = targetParentId
								if (typeof finalParentId === 'string' && finalParentId !== 'root') {
									const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
									const exists = layer ? !!findNode(layer.nodeTree, finalParentId) : nodeExistsInAnyLayer(store.state.layers, finalParentId)
									if (!exists) {
										if (debugAgentToUi) console.warn('[AIChat] self-check insertNode: parentId not found, fallback to root:', finalParentId)
										finalParentId = undefined
									}
								}

								const n: any = { ...(nodeUnknown as any) }
								if (!isRecord(n.props)) n.props = {}
								if (typeof n.category !== 'string') n.category = 'user'
								if (n.category === 'user') {
									if (typeof n.userType !== 'string') {
										if (typeof n.type === 'string') n.userType = n.type
									}
									if (!isRecord(n.transform)) n.transform = { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
								}
								await store.dispatch('addNodeTree', { node: n, layerId: finalLayerId, parentId: finalParentId })
							} catch {
								// ignore
							}
							continue
						}
						if (m2.type === 'agentToUi/text') {
							pushStreamText(assistantId, m2.payload.text)
							continue
						}
						if (m2.type === 'agentToUi/chatMessage') {
							const content = (m2 as any).payload?.content
							if (typeof content === 'string') pushStreamText(assistantId, content)
							continue
						}
						if (m2.type === 'agentToUi/error') {
							stopTyping()
							const idx = messages.value.findIndex((x) => x.id === assistantId)
							if (idx >= 0) messages.value[idx].text = (messages.value[idx].text || '') + `\n\n自检失败：${m2.payload.code} ${m2.payload.message}`
							break
						}
					}
					if (ev2.type === 'error') break
					if (ev2.type === 'done') break
				}
				selfCheckActive.value = false
			}
		}
	} catch (e) {
		if (stoppedByUser.value || isAbortError(e)) {
			// User stopped the task (or request aborted). Keep partial output.
			return
		}
		taskPhase.value = 'error'
		stopTyping()
		const idx = messages.value.findIndex((x) => x.id === assistantId)
		if (idx >= 0) messages.value[idx].text = e instanceof Error ? e.message : String(e)
	} finally {
		selfCheckActive.value = false
		sending.value = false
		// 思考面板不自动收起：仅由“关闭思考”按钮或关闭聊天框控制。
		if (taskPhase.value !== 'stopped' && taskPhase.value !== 'error') taskPhase.value = 'done'
		activeAssistantId.value = null
		await scrollToBottom()
	}
}

const send = async () => {
	if (sending.value) return
	const text = draft.value.trim()
	if (!text) return
	// 新的一轮对话：允许思考面板再次自动弹出。
	thoughtDismissed.value = false
	await sendText(text)
}

const regenerateLast = async () => {
	if (sending.value) return
	const t = lastUserText.value.trim()
	if (!t) return
	await sendText(t)
}

const undoStage = () => {
	editorPersistence.undo()
}

const showStageActions = (m: ChatMessage) => {
	if (m.role !== 'assistant') return false
	if (!m.hasStageResult) return false
	// Avoid showing buttons while the same assistant message is actively streaming.
	if (sending.value && activeAssistantId.value === m.id) return false
	return true
}

const isRunning = (m: ChatMessage) => {
	if (m.role !== 'assistant') return false
	if (!sending.value) return false
	if (activeAssistantId.value !== m.id) return false
	return true
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
	overflow: visible;
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

.ai-chat__title-left {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.ai-chat__title-status {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	white-space: nowrap;
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

.ai-chat__msg.thought .ai-chat__bubble {
	border-style: dashed;
	opacity: 0.85;
}

.ai-chat__msg.thought .ai-chat__text {
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.ai-chat__text {
	white-space: pre-wrap;
	word-break: break-word;
}

.ai-chat__phase {
	margin-top: 6px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.ai-chat__typing {
	height: 16px;
	display: flex;
	align-items: center;
	gap: 6px;
}

.ai-chat__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--vscode-fg-muted);
	opacity: 0.25;
	animation: ai-chat-dot 900ms infinite ease-in-out;
}

.ai-chat__dot:nth-child(2) {
	animation-delay: 150ms;
}

.ai-chat__dot:nth-child(3) {
	animation-delay: 300ms;
}

@keyframes ai-chat-dot {
	0%,
	100% {
		opacity: 0.25;
	}
	50% {
		opacity: 1;
	}
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

.ai-chat__actions {
	margin-top: 8px;
	display: flex;
	gap: 8px;
}

.ai-chat__action-btn {
	height: 24px;
	padding: 0 10px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.ai-chat__action-btn:hover {
	border-color: var(--vscode-border-accent);
}

.ai-chat__action-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
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
.ai-chat__body {
	position: relative;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.ai-chat__thought {
	position: absolute;
	left: 0;
	right: 0;
	top: 100%;
	margin-top: 6px;
	max-height: 220px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	padding: 8px;
	box-sizing: border-box;
	transform: translateY(-8px);
	opacity: 0;
	transition: transform 180ms ease, opacity 180ms ease;
	z-index: 3;
	overflow: auto;
	pointer-events: none;
}

.ai-chat__thought.open {
	transform: translateY(0);
	opacity: 1;
	pointer-events: auto;
}

.ai-chat__thought-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}

.ai-chat__thought-title {
	font-size: 12px;
	opacity: 0.8;
}

.ai-chat__thought-close {
	width: 24px;
	height: 24px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	line-height: 1;
}

.ai-chat__thought-close:hover {
	border-color: var(--vscode-border-accent);
}

.ai-chat__thought-text {
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 12px;
	line-height: 1.35;
}

.ai-chat__list {
	min-height: 0;
	position: relative;
	z-index: 2;
}
</style>
