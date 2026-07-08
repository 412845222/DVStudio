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
				<span class="ai-chat__title-text">{{ t('aichat.dialog.title') }}</span>
				<span v-if="sending" class="ai-chat__title-status">{{ taskStatusLabel }}</span>
			</div>
			<div class="ai-chat__title-actions">
				<button
					class="ai-chat__icon"
					type="button"
					:title="deepMode ? t('aichat.dialog.deepModeOn') : t('aichat.dialog.deepModeOff')"
					@click="toggleDeepMode"
				>
					{{ deepMode ? t('aichat.dialog.deepModeShortOn') : t('aichat.dialog.deepModeShortOff') }}
				</button>
				<button v-if="sending" class="ai-chat__icon" type="button" :title="t('common.stop')" @click="stopTask">
					⏹
				</button>
				<button class="ai-chat__icon" type="button" :title="t('aichat.dialog.minimize')" @click="onMinimize">—</button>
			<button class="ai-chat__icon" type="button" :title="t('common.close')" @click="onClose">×</button>
			</div>
		</div>
		<div
			class="ai-chat__resize ai-chat__resize--right"
			@pointerdown.stop.prevent="onResizePointerDown($event, 'right')"
		/>
		<div
			class="ai-chat__resize ai-chat__resize--bottom"
			@pointerdown.stop.prevent="onResizePointerDown($event, 'bottom')"
		/>
		<div
			class="ai-chat__resize ai-chat__resize--corner"
			@pointerdown.stop.prevent="onResizePointerDown($event, 'corner')"
		/>

		<div class="ai-chat__controls">
			<label class="ai-chat__control">
				<span class="ai-chat__control-label">{{ t('aichat.dialog.sourceLabel') }}</span>
				<select v-model="modelApiSource" class="ai-chat__select" :disabled="sending">
					<option v-for="source in textApiSourceOptions" :key="source.value" :value="source.value">
						{{ source.label }}
					</option>
				</select>
			</label>
			<label class="ai-chat__control ai-chat__control--grow">
				<span class="ai-chat__control-label">{{ t('aichat.dialog.modelLabel') }}</span>
				<select
					v-model="textModelId"
					class="ai-chat__select"
					:disabled="sending || !textModelOptions.length"
				>
					<option v-if="!textModelOptions.length" value="">{{ t('aichat.dialog.noModelAvailable') }}</option>
					<option v-for="model in textModelOptions" :key="model.id" :value="model.id">
						{{ model.label }}
					</option>
				</select>
			</label>
		</div>

		<div class="ai-chat__body">
			<div ref="listRef" class="ai-chat__list" @scroll.passive="onListScroll">
				<div v-for="m in messages" :key="m.id" class="ai-chat__msg" :class="[m.role]">
					<div class="ai-chat__bubble">
						<div class="ai-chat__role">{{ m.role === 'user' ? t('aichat.dialog.roleUser') : t('aichat.dialog.roleAi') }}</div>
						<div class="ai-chat__text">{{ m.text }}</div>
						<div v-if="isRunning(m) && taskStatusLabel" class="ai-chat__phase">
							{{ taskStatusLabel }}
						</div>
						<div v-if="isRunning(m)" class="ai-chat__typing" :aria-label="t('aichat.dialog.aiProcessing')">
							<span class="ai-chat__dot" />
							<span class="ai-chat__dot" />
							<span class="ai-chat__dot" />
						</div>
						<div v-if="showStageActions(m) || !!m.scenePlanJson" class="ai-chat__actions">
							<button
								v-if="canGenerateScenePlanAnimation(m)"
								class="ai-chat__action-btn ai-chat__action-btn--primary"
								type="button"
								:disabled="sending"
								@click="onClickGenerateAnimation(m)"
							>
								{{ t('aichat.dialog.generateAnimation') }}
							</button>
							<button
								v-if="m.scenePlanJson"
								class="ai-chat__action-btn"
								type="button"
								:disabled="sending"
								@click="copyScenePlanJson(m)"
							>
								{{ t('aichat.dialog.copyScenePlanJson') }}
							</button>
							<button
								v-if="showStageActions(m)"
								class="ai-chat__action-btn"
								type="button"
								:disabled="sending"
								@click="(e: MouseEvent) => saveToComponentLibrary(m, e)"
							>
								{{ t('aichat.dialog.saveToLibrary') }}
							</button>
							<button
								v-if="showStageActions(m)"
								class="ai-chat__action-btn"
								type="button"
								:disabled="sending"
								@click="regenerateLast"
							>
								{{ t('aichat.dialog.regenerate') }}
							</button>
							<button
								v-if="showStageActions(m)"
								class="ai-chat__action-btn"
								type="button"
								:disabled="sending"
								@click="undoStage"
							>
								{{ t('aichat.dialog.undo') }}
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
				:placeholder="t('aichat.dialog.inputPlaceholder')"
				:disabled="sending"
				@keydown.enter.exact.prevent="send"
			/>
			<button class="ai-chat__send" type="submit" :disabled="!canSend">{{ t('aichat.dialog.send') }}</button>
		</form>

		<div class="ai-chat__thought" :class="{ open: thoughtOpen }" :aria-label="t('aichat.dialog.thoughtPanel')">
			<div class="ai-chat__thought-head">
				<div class="ai-chat__thought-title">{{ t('aichat.dialog.thoughtTitle') }}</div>
				<button class="ai-chat__thought-close" type="button" :title="t('aichat.dialog.closeThought')" @click="closeThought">
					×
				</button>
			</div>
			<div class="ai-chat__thought-text">{{ thoughtText }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { useStore } from 'vuex'
import { aiChatService } from '../../network/AIChatService'
import type { AgentToUiMessage } from '../../core/agentToUI'
import {
	compileVideoScenePlan,
	normalizeVideoScenePlan,
	type VideoScenePlan
} from '../../core/agentToUI/videoScenePlan'
import {
	getChatApiSourceOptions,
	getChatModelById,
	getChatModelOptions,
	initCopilotConfig,
	isCopilotEnabled,
	type ChatApiSource
} from '../../ai/models/chatModels'
import { cliSendMessage, cliStartSession } from '../../network/CLIChatService'
import { componentTemplateApi, type ComponentTemplate } from '../../core/components'
import { ComponentLibraryService } from '../../network/ComponentLibraryService'
import {
	findLayer,
	findNode,
	nodeExistsInAnyLayer,
	rotatedRectCorners,
	type VideoSceneTreeNode
} from '../../core/scene'
import { TimelineStore } from '../../store/timeline'
import { VideoSceneKey, type VideoSceneState } from '../../store/videoscene'
import { editorPersistence } from '../../adapters/editorPersistence'
import {
	dispatchDvsEditorNodeDeleted,
	dispatchDvsEditorNodePatched
} from '../../adapters/windowEventBridge'
import { DwebCanvasGLKey } from '../VideoScene/VideoSceneRuntime'
import { applyTimelineAnimationAtFrame } from '../VideoScene/anim/timelineAnimation'
import { flyThumbnailPng } from '../VideoScene/parts/flyThumbnail'
import {
	isRecord,
	isString,
	isArray,
	hasKeyOfType,
	isNumber,
	isBoolean,
	isNull
} from '../../types/utils'
import type { JsonValue } from '../../core/shared/json'
import { useI18n } from '../../i18n'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
	id: string
	role: ChatRole
	text: string
	at: number
	hasStageResult?: boolean
	stageOps?: { insertedNodeIds: string[] }
	scenePlanJson?: string
	scenePlanData?: VideoScenePlan
	scenePlanApplyStatus?: 'pending' | 'applied' | 'skipped'
}

type StageFilter = {
	target: 'selection' | 'nodeId'
	nodeId?: string
	layerId?: string
	mode: 'append' | 'replace'
	filter: Record<string, JsonValue>
}

type StageOps = {
	insertedNodeIds: string[]
	filters: StageFilter[]
}

type ViewportContext = {
	panX?: number
	panY?: number
	zoom?: number
	screenW: number
	screenH: number
	centerWorld: { x: number; y: number }
}

type TemplateNodeLike = {
	localId?: unknown
	type?: unknown
	props?: unknown
	transform?: unknown
	parentLocalId?: unknown
	children?: unknown
	[key: string]: unknown
}

const props = defineProps<{
	open: boolean
	minimized: boolean
	anchor?: { x: number; y: number } | null
}>()
const emit = defineEmits<{ 'update:open': [boolean]; 'update:minimized': [boolean] }>()
const { t } = useI18n()

const store = useStore<VideoSceneState>(VideoSceneKey)

const dwebCanvasRef = inject(DwebCanvasGLKey, null)

const debugAgentToUi = (() => {
	try {
		return import.meta.env.DEV || window.localStorage.getItem('dvs.aiChat.debug') === '1'
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

const DEFAULT_DIALOG_W = 560
const DEFAULT_DIALOG_H = 500
const MIN_DIALOG_W = 460
const MIN_DIALOG_H = 420
const MAX_DIALOG_W = 920
const MAX_DIALOG_H = 760
const DIALOG_SIZE_KEY = 'dvs.aiChat.dialogSize'

const pos = ref<{ x: number; y: number }>({ x: 12, y: 12 })
const dialogSize = ref<{ width: number; height: number }>({
	width: DEFAULT_DIALOG_W,
	height: DEFAULT_DIALOG_H
})
const dragged = ref(false)
const entering = ref(false)
const minimizing = ref(false)
const animating = ref(false)
const animTransform = ref<string>('')

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

const getDialogWidth = () =>
	clamp(dialogSize.value.width, MIN_DIALOG_W, Math.min(MAX_DIALOG_W, window.innerWidth - 16))
const getDialogHeight = () =>
	clamp(dialogSize.value.height, MIN_DIALOG_H, Math.min(MAX_DIALOG_H, window.innerHeight - 16))

const clampDialogPosition = (next: { x: number; y: number }) => {
	const w = getDialogWidth()
	const h = getDialogHeight()
	return {
		x: clamp(next.x, 8, Math.max(8, window.innerWidth - w - 8)),
		y: clamp(next.y, 8, Math.max(8, window.innerHeight - h - 8))
	}
}

const loadDialogSize = () => {
	try {
		const raw = window.localStorage.getItem(DIALOG_SIZE_KEY)
		if (!raw) return
		const parsed = JSON.parse(raw)
		dialogSize.value = {
			width: clamp(Number(parsed?.width) || DEFAULT_DIALOG_W, MIN_DIALOG_W, MAX_DIALOG_W),
			height: clamp(Number(parsed?.height) || DEFAULT_DIALOG_H, MIN_DIALOG_H, MAX_DIALOG_H)
		}
	} catch {
		dialogSize.value = { width: DEFAULT_DIALOG_W, height: DEFAULT_DIALOG_H }
	}
}

const persistDialogSize = () => {
	try {
		window.localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify(dialogSize.value))
	} catch {
		// ignore
	}
}

loadDialogSize()

const placeNearAnchor = () => {
	const w = getDialogWidth()
	const h = getDialogHeight()
	const a = props.anchor
	if (!a) {
		pos.value = clampDialogPosition({ x: 12, y: window.innerHeight - h - 52 })
		return
	}
	const x = clamp(a.x - w + 24, 8, Math.max(8, window.innerWidth - w - 8))
	const y = clamp(a.y - h - 12, 8, Math.max(8, window.innerHeight - h - 52))
	pos.value = { x, y }
}

const computeMinimizeTransform = () => {
	const a = props.anchor
	if (!a) return 'scale(0.05)'
	const cx = pos.value.x + getDialogWidth() / 2
	const cy = pos.value.y + getDialogHeight() / 2
	const dx = a.x - cx
	const dy = a.y - cy
	return `translate(${dx}px, ${dy}px) scale(0.05)`
}

const shellStyle = computed<CSSProperties>(() => {
	return {
		left: `${pos.value.x}px`,
		top: `${pos.value.y}px`,
		width: `${getDialogWidth()}px`,
		height: `${getDialogHeight()}px`,
		transform: minimizing.value ? animTransform.value : ''
	}
})

const messages = ref<ChatMessage[]>([
	{
		id: 'm0',
		role: 'assistant',
		text: t('aichat.dialog.welcomeMessage'),
		at: Date.now()
	}
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

const modelApiSource = ref<ChatApiSource>('all')
const textModelId = ref('doubao-seed-evolving')

const loadModelPrefs = () => {
	try {
		const savedSource = window.localStorage.getItem('dvs.aiChat.modelApiSource')
		const savedModel = window.localStorage.getItem('dvs.aiChat.textModelId')
		if (
			savedSource === 'all' ||
			savedSource === 'gemini' ||
			savedSource === 'bytedance' ||
			savedSource === 'copilot'
		) {
			modelApiSource.value = savedSource
		}
		if (typeof savedModel === 'string' && savedModel.trim()) textModelId.value = savedModel.trim()
	} catch {
		modelApiSource.value = 'all'
		textModelId.value = 'doubao-seed-evolving'
	}
}

const persistModelPrefs = () => {
	try {
		window.localStorage.setItem('dvs.aiChat.modelApiSource', modelApiSource.value)
		window.localStorage.setItem('dvs.aiChat.textModelId', textModelId.value)
	} catch {
		// ignore
	}
}

const textApiSourceOptions = computed(() => getChatApiSourceOptions())

const textModelOptions = computed(() =>
	getChatModelOptions('text', modelApiSource.value)
)

const activeTextModel = computed(() => getChatModelById(textModelId.value))
const activeProvider = computed(() => {
	const src = activeTextModel.value?.apiSource
	if (src === 'copilot' || src === 'local-exec') return 'copilot'
	if (src === 'bytedance') return 'bytedance'
	if (src === 'gemini') return 'gemini'
	return 'bytedance'
})
const isCopilotActive = computed(() => activeProvider.value === 'copilot')

const normalizeTextModelSelection = () => {
	let list = textModelOptions.value
	if (!list.length && modelApiSource.value !== 'all') {
		modelApiSource.value = 'all'
		list = textModelOptions.value
	}
	if (!list.length) {
		textModelId.value = ''
		return
	}
	if (!list.some((model) => model.id === textModelId.value)) {
		textModelId.value = list[0].id
	}
}

loadModelPrefs()
normalizeTextModelSelection()

watch(
	() => [modelApiSource.value, textModelOptions.value.map((item) => item.id).join('|')] as const,
	() => {
		normalizeTextModelSelection()
		persistModelPrefs()
	},
	{ immediate: true }
)

watch(textModelId, () => {
	persistModelPrefs()
})

const conversationId = ref<string | null>(null)
const copilotSessionId = ref<string | null>(null)
const copilotReady = ref(false)
const sending = ref(false)
let aborter: AbortController | null = null
const stoppedByUser = ref(false)

const loadCopilotConfig = async () => {
	try {
		await initCopilotConfig()
		copilotReady.value = isCopilotEnabled()
	} catch {
		copilotReady.value = false
	}
}

loadCopilotConfig()

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

type TaskPhase =
	| 'idle'
	| 'started'
	| 'streaming'
	| 'writing'
	| 'template'
	| 'done'
	| 'stopped'
	| 'error'
const taskPhase = ref<TaskPhase>('idle')
const taskPhaseMessage = ref<string>('')

const taskStatusLabel = computed(() => {
	if (stoppedByUser.value) return t('aichat.stages.stopped')
	if (!sending.value) return ''
	if (typeof taskPhaseMessage.value === 'string' && taskPhaseMessage.value.trim())
		return taskPhaseMessage.value.trim()
	const p = taskPhase.value
	if (p === 'started') return t('aichat.stages.started')
	if (p === 'streaming') return t('aichat.stages.connecting')
	if (p === 'writing') return t('aichat.stages.generating')
	if (p === 'template') return t('aichat.stages.templating')
	return t('aichat.stages.inProgress')
})

const lastUserText = ref<string>('')

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

type TemplateLike = {
	nodes?: unknown
	rootLocalId?: unknown
	[key: string]: unknown
}

const sanitizeComponentTemplate = (template: unknown): unknown => {
	if (!isRecord(template)) return template
	const tpl = template as TemplateLike
	const nodes = tpl.nodes
	if (!Array.isArray(nodes)) return template
	const rootLocalId = isString(tpl.rootLocalId) ? tpl.rootLocalId : ''
	const localIdSet = new Set<string>()
	for (const n of nodes) {
		if (isRecord(n) && isString(n.localId)) localIdSet.add(n.localId)
	}

	const normalizeParentLocalId = (parentLocalId: unknown): string | undefined => {
		if (!isString(parentLocalId)) return undefined
		const raw = parentLocalId.trim()
		if (!raw) return undefined
		if (localIdSet.has(raw)) return raw
		if (raw.includes(':')) {
			const suffix = raw.split(':').pop()?.trim()
			if (suffix && localIdSet.has(suffix)) return suffix
		}
		return undefined
	}

	const nextNodes = nodes.map((n: unknown) => {
		if (!isRecord(n)) return n
		const node = n as TemplateNodeLike
		const next: TemplateNodeLike = { ...node }
		if (!isRecord(next.props)) next.props = {}
		if (next.transform !== undefined && !isRecord(next.transform)) delete next.transform
		if (isString(next.localId) && next.localId === rootLocalId) {
			if (next.parentLocalId !== undefined) delete next.parentLocalId
		} else if (next.parentLocalId !== undefined) {
			const normalized = normalizeParentLocalId(next.parentLocalId)
			if (!normalized) {
				if (debugAgentToUi) {
					try {
						console.warn(
							'[AIChat] drop invalid parentLocalId:',
							next.parentLocalId,
							'on node',
							next.localId
						)
					} catch {
						// ignore
					}
				}
				delete next.parentLocalId
			} else if (normalized !== next.parentLocalId) {
				if (debugAgentToUi) {
					try {
						console.warn(
							'[AIChat] normalize parentLocalId:',
							next.parentLocalId,
							'=>',
							normalized,
							'on node',
							next.localId
						)
					} catch {
						// ignore
					}
				}
				next.parentLocalId = normalized
			}
		}
		return next
	})
	return { ...template, nodes: nextNodes }
}

const getNodeFilters = (node: VideoSceneTreeNode): Record<string, JsonValue>[] => {
	const filters = node.props?.filters
	return isArray(filters, (v): v is Record<string, JsonValue> => isRecord(v)) ? filters : []
}

const applyFilterToSelection = async (
	filter: Record<string, JsonValue>,
	mode: 'append' | 'replace' = 'append'
) => {
	const layer = findLayer(store.state, store.state.activeLayerId)
	if (!layer) throw new Error('active layer not found')
	const selectedIds = store.state.selectedNodeIds?.length
		? store.state.selectedNodeIds
		: store.state.selectedNodeId
			? [store.state.selectedNodeId]
			: []
	if (!selectedIds.length) throw new Error(t('aichat.errors.noSelectedNodes'))
	for (const nodeId of selectedIds) {
		const node = findNode(layer.nodeTree, nodeId)
		if (!node || node.category !== 'user') continue
		const prev = getNodeFilters(node)
		const next = mode === 'replace' ? [filter] : [...prev, filter]
		await store.dispatch('updateNodeProps', { nodeId, patch: { filters: next } })
	}
}

const applyFilterToNodeId = async (
	nodeId: string,
	filter: Record<string, JsonValue>,
	mode: 'append' | 'replace' = 'append',
	preferredLayerId?: string
) => {
	const tryLayerIds = [preferredLayerId, store.state.activeLayerId].filter(
		(x): x is string => isString(x) && !!x
	)
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
			const prev = getNodeFilters(hit.node)
			const next = mode === 'replace' ? [filter] : [...prev, filter]
			await store.dispatch('updateNodeProps', {
				layerId: hit.layerId,
				nodeId,
				patch: { filters: next }
			})
			return
		}
	}

	for (const layer of store.state.layers) {
		if (visited.has(layer.id)) continue
		const hit = findInLayer(layer.id)
		if (hit) {
			const prev = getNodeFilters(hit.node)
			const next = mode === 'replace' ? [filter] : [...prev, filter]
			await store.dispatch('updateNodeProps', {
				layerId: hit.layerId,
				nodeId,
				patch: { filters: next }
			})
			return
		}
	}

	throw new Error(t('aichat.errors.nodeNotFound', { nodeId }))
}

type TreeNodeLike = {
	id?: unknown
	children?: unknown
	[key: string]: unknown
}

const collectNodeIds = (root: unknown): string[] => {
	const out: string[] = []
	const visit = (n: unknown) => {
		if (!isRecord(n)) return
		const node = n as TreeNodeLike
		if (isString(node.id)) out.push(node.id)
		const children = node.children
		if (isArray(children)) children.forEach(visit)
	}
	visit(root)
	return out
}

const buildContextPack = () => {
	const activeLayerId = store.state.activeLayerId
	const layer = findLayer(store.state, activeLayerId)
	const selectedNodeIds = store.state.selectedNodeIds?.length
		? store.state.selectedNodeIds
		: store.state.selectedNodeId
			? [store.state.selectedNodeId]
			: []

	let selectedNodes: VideoSceneTreeNode[] = []
	if (layer && selectedNodeIds.length) {
		selectedNodes = selectedNodeIds
			.map((id) => findNode(layer.nodeTree, id))
			.filter((n): n is VideoSceneTreeNode => !!n)
	}

	return {
		activeLayerId,
		layers: store.state.layers.map((l) => ({ id: l.id, name: l.name })),
		selectedNodeIds,
		selectedNodes,
		activeLayer: layer ? { id: layer.id, name: layer.name, nodeTree: layer.nodeTree } : null,
		lastStageOps: lastStageOps.value
	}
}

const buildVideoGuiPromptInput = (text: string) => {
	const contextPack = buildContextPack()
	const viewport = getViewportContext()
	const activeLayer = contextPack.activeLayer
	const selectedNodes = Array.isArray(contextPack.selectedNodes) ? contextPack.selectedNodes : []
	return {
		task: String(text || '').trim(),
		scene: 'video-scene-editor',
		goal: 'generate-video-scene-gui-plan',
		deepMode: deepMode.value,
		activeLayer: activeLayer
			? {
					id: activeLayer.id,
					name: activeLayer.name,
					nodeCount: Array.isArray(activeLayer.nodeTree) ? activeLayer.nodeTree.length : 0
				}
			: null,
		selectedNodeIds: contextPack.selectedNodeIds,
		selectedNodes,
		viewport,
		lastStageOps: contextPack.lastStageOps,
		requirements: {
			output: ['componentTemplate', 'videoScenePlan'],
			animationMode: 'preset-only',
			preferPalette: true,
			preferIncrementalEdit: selectedNodes.length > 0
		}
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

const toComponentTemplateLike = (
	v: unknown,
	opts?: { defaultCenterWorld?: { x: number; y: number } }
): unknown => {
	let obj: unknown = v
	if (isString(obj)) {
		try {
			obj = JSON.parse(obj)
		} catch {
			return v
		}
	}
	if (!isRecord(obj)) return v

	const objRecord = obj as Record<string, unknown>
	if (
		objRecord.schemaVersion === 1 &&
		isString(objRecord.templateId) &&
		isArray(objRecord.nodes) &&
		isString(objRecord.rootLocalId)
	) {
		return obj
	}

	const nodeType = isString(objRecord.type) ? objRecord.type : 'text'
	const center = opts?.defaultCenterWorld
	const transform: Record<string, number | undefined> = {
		x: coerceNumber(objRecord.x) ?? center?.x ?? 0,
		y: coerceNumber(objRecord.y) ?? center?.y ?? 0,
		width: coerceNumber(objRecord.width),
		height: coerceNumber(objRecord.height),
		rotation: coerceNumber(objRecord.rotation),
		opacity: coerceNumber(objRecord.opacity)
	}

	const reserved = new Set([
		'type',
		'id',
		'localId',
		'x',
		'y',
		'width',
		'height',
		'rotation',
		'opacity',
		'name',
		'children',
		'parentId',
		'props'
	])
	const props: Record<string, unknown> = isRecord(objRecord.props) ? { ...objRecord.props } : {}
	for (const [k, val] of Object.entries(objRecord)) {
		if (reserved.has(k)) continue
		props[k] = val
	}

	return {
		schemaVersion: 1,
		templateId: `ai_${Date.now()}`,
		name: isString(objRecord.name) ? objRecord.name : t('aichat.dialog.aiNodeName'),
		params: [],
		nodes: [
			{
				localId: 'root',
				type: nodeType,
				props,
				transform
			}
		],
		rootLocalId: 'root'
	}
}

const normalizeTemplateForViewport = (
	template: unknown,
	opts?: { defaultCenterWorld?: { x: number; y: number } }
) => {
	if (!isRecord(template)) return template
	const tpl = template as TemplateLike
	if (!isArray(tpl.nodes)) return template
	const rootId = tpl.rootLocalId
	if (!isString(rootId)) return template
	const nodes = tpl.nodes
	const idx = nodes.findIndex(
		(n): n is Record<string, unknown> => isRecord(n) && n.localId === rootId
	)
	if (idx < 0) return template
	const node = nodes[idx]
	if (!isRecord(node)) return template
	const nodeRecord = node as Record<string, unknown>
	const t = isRecord(nodeRecord.transform) ? nodeRecord.transform : {}
	const cx = coerceNumber((t as Record<string, unknown>).x)
	const cy = coerceNumber((t as Record<string, unknown>).y)
	if (cx != null && cy != null) return template
	const center = opts?.defaultCenterWorld
	if (!center) return template
	const nextNode = { ...nodeRecord, transform: { ...t, x: cx ?? center.x, y: cy ?? center.y } }
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

	const tryParse = (s: string): unknown => {
		try {
			return JSON.parse(s)
		} catch {
			return null
		}
	}

	if (
		(trimmed.startsWith('{') && trimmed.endsWith('}')) ||
		(trimmed.startsWith('[') && trimmed.endsWith(']'))
	) {
		const obj = tryParse(trimmed)
		if (obj) return extractReadableTextFromAgentJson(obj) ?? ''
	}

	const first = trimmed.indexOf('{')
	const last = trimmed.lastIndexOf('}')
	if (first >= 0 && last > first) {
		const candidate = trimmed.slice(first, last + 1)
		const obj = tryParse(candidate)
		if (obj) {
			const extracted = extractReadableTextFromAgentJson(obj)
			if (extracted) return extracted
			const stripped = (trimmed.slice(0, first) + trimmed.slice(last + 1)).trim()
			return stripped
		}
	}

	return text
}

type AgentJsonEnvelope = {
	type?: unknown
	payload?: unknown
}

const extractReadableTextFromAgentJson = (obj: unknown): string | null => {
	if (!isRecord(obj)) return null
	const envelope = obj as AgentJsonEnvelope
	const t = envelope.type
	const p = envelope.payload
	if (t === 'agentToUi/chatMessage' && isRecord(p) && isString(p.content)) return p.content
	if (t === 'agentToUi/chat' && isRecord(p) && isString(p.message)) return p.message
	if (t === 'agentToUi/chat' && isRecord(p) && isString(p.content)) return p.content
	if (t === 'agentToUi/text' && isRecord(p) && isString(p.text)) return p.text
	if (isRecord(p) && isString(p.text)) {
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

type DwebCanvasLike = {
	size: { width: number; height: number }
	viewport?: { pan?: { x?: number; y?: number }; zoom?: number }
	screenToWorld: (p: { x: number; y: number }) => { x: number; y: number }
}

const getViewportContext = (): ViewportContext | null => {
	const canvas = dwebCanvasRef?.value as DwebCanvasLike | null
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
			centerWorld
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
let resizing: {
	mode: 'right' | 'bottom' | 'corner'
	startX: number
	startY: number
	startWidth: number
	startHeight: number
} | null = null

const onTitlePointerDown = (e: PointerEvent) => {
	if (props.minimized) return
	const el = shellRef.value
	if (!el) return
	;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
	dragging = { px: e.clientX, py: e.clientY, ox: pos.value.x, oy: pos.value.y }
	dragged.value = true
}

const onResizePointerDown = (e: PointerEvent, mode: 'right' | 'bottom' | 'corner') => {
	if (props.minimized) return
	resizing = {
		mode,
		startX: e.clientX,
		startY: e.clientY,
		startWidth: getDialogWidth(),
		startHeight: getDialogHeight()
	}
	;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
}

const onPointerMove = (e: PointerEvent) => {
	if (dragging) {
		const dx = e.clientX - dragging.px
		const dy = e.clientY - dragging.py
		pos.value = clampDialogPosition({ x: dragging.ox + dx, y: dragging.oy + dy })
		return
	}
	if (!resizing) return
	const dx = e.clientX - resizing.startX
	const dy = e.clientY - resizing.startY
	const nextWidth =
		resizing.mode === 'bottom'
			? resizing.startWidth
			: clamp(
					resizing.startWidth + dx,
					MIN_DIALOG_W,
					Math.min(MAX_DIALOG_W, window.innerWidth - pos.value.x - 8)
				)
	const nextHeight =
		resizing.mode === 'right'
			? resizing.startHeight
			: clamp(
					resizing.startHeight + dy,
					MIN_DIALOG_H,
					Math.min(MAX_DIALOG_H, window.innerHeight - pos.value.y - 8)
				)
	dialogSize.value = { width: nextWidth, height: nextHeight }
}

const onPointerUp = () => {
	dragging = null
	if (resizing) persistDialogSize()
	resizing = null
}

const onWindowResize = () => {
	dialogSize.value = { width: getDialogWidth(), height: getDialogHeight() }
	pos.value = clampDialogPosition(pos.value)
	persistDialogSize()
}

window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerup', onPointerUp)
window.addEventListener('resize', onWindowResize)
onBeforeUnmount(() => {
	window.removeEventListener('pointermove', onPointerMove)
	window.removeEventListener('pointerup', onPointerUp)
	window.removeEventListener('resize', onWindowResize)
	stopTyping()
	aborter?.abort()
})

const isAbortError = (e: unknown) => {
	return (
		(e instanceof DOMException && e.name === 'AbortError') ||
		(e instanceof Error && /abort/i.test(e.name + ' ' + e.message))
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
	messages.value.push({
		id: assistantId,
		role: 'assistant',
		text: '',
		at: Date.now(),
		stageOps: { insertedNodeIds: [] }
	})
	await scrollToBottom({ force: true })

	try {
		if (isCopilotActive.value) {
			if (!copilotReady.value) {
				throw new Error(t('copilot.notConfigured'))
			}
			taskPhase.value = 'streaming'
			if (!copilotSessionId.value) {
				const startResult = await cliStartSession('copilot')
				const startData = (startResult as any)?.value || (startResult as any)?.data
				const sid = startData?.sessionId || (startResult as any)?.sessionId
				if (!sid) throw new Error('Failed to start Copilot CLI session')
				copilotSessionId.value = sid
			}

			let currentText = ''
			for await (const chunk of cliSendMessage({
				sessionId: copilotSessionId.value!,
				content: text,
				model: textModelId.value !== 'auto' ? textModelId.value : undefined
			})) {
				if (chunk.type === 'text') {
					taskPhase.value = 'writing'
					currentText += chunk.content
					const idx = messages.value.findIndex((x) => x.id === assistantId)
					if (idx >= 0) {
						messages.value[idx].text = currentText
					}
					void scrollToBottom()
				} else if (chunk.type === 'error') {
					throw new Error(chunk.message)
				} else if (chunk.type === 'done') {
					break
				}
			}
			const idx = messages.value.findIndex((x) => x.id === assistantId)
			if (idx >= 0 && !messages.value[idx].text) {
				messages.value[idx].text = currentText || t('aichat.errors.emptyResponse')
			}
		} else {
		if (!conversationId.value) {
			const conv = await aiChatService.createConversation()
			conversationId.value = conv.id
		}

		for await (const ev of aiChatService.streamMessage({
			conversationId: conversationId.value,
			content: text,
			contextPack: buildContextPack(),
			provider: activeProvider.value,
			model: textModelId.value || undefined,
			responseMode: 'agentToUi-jsonl',
			promptPreset: 'video_scene_plan_v1',
			promptInput: buildVideoGuiPromptInput(text),
			viewport: getViewportContext() ?? undefined,
			signal: aborter.signal
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
						const payload = m.payload
						const filter = payload.filter as Record<string, JsonValue>
						const mode: 'append' | 'replace' = payload.mode === 'replace' ? 'replace' : 'append'
						if (payload.target === 'nodeId' && isString(payload.nodeId)) {
							const layerId = isString(payload.layerId) ? payload.layerId : undefined
							await applyFilterToNodeId(payload.nodeId, filter, mode, layerId)
							lastStageOps.value.filters.push({
								target: 'nodeId',
								nodeId: payload.nodeId,
								layerId,
								mode,
								filter
							})
						} else {
							await applyFilterToSelection(filter, mode)
							lastStageOps.value.filters.push({ target: 'selection', mode, filter })
						}
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							const ft = String(filter.type ?? '')
							const targetLabel =
								payload.target === 'nodeId' && isString(payload.nodeId)
									? t('aichat.dialog.targetNode', { nodeId: payload.nodeId })
									: t('aichat.dialog.targetSelection')
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								'\n\n' + t('aichat.messages.appliedFilter', { target: targetLabel, filter: ft || 'filter' })
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0)
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								'\n\n' + t('aichat.errors.filterFailed', { error: err instanceof Error ? err.message : String(err) })
					}
					continue
				}
				if (m.type === 'agentToUi/taskStatus') {
					const payload = m.payload
					const phase = payload.phase
					const msg = payload.message
					if (isString(msg)) taskPhaseMessage.value = msg
					{
						const text = isString(msg) && msg.trim() ? msg.trim() : String(phase ?? '').trim()
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
						const payload = m.payload
						const targetLayerId =
							isString(payload.layerId) && payload.layerId.trim()
								? payload.layerId.trim()
								: undefined
						const rawParentId = payload.parentId
						const targetParentId: string | null | undefined =
							rawParentId === null
								? null
								: isString(rawParentId) && rawParentId.trim()
									? rawParentId.trim()
									: undefined
						const nodeUnknown = payload.node
						if (!isRecord(nodeUnknown)) throw new Error('insertNode.payload.node 必须是对象')
						const nodeRecord = nodeUnknown as Record<string, unknown>

						let finalLayerId = targetLayerId
						if (finalLayerId && !findLayer(store.state, finalLayerId)) {
							if (debugAgentToUi)
								console.warn(
									'[AIChat] insertNode: layerId not found, fallback to activeLayer:',
									finalLayerId
								)
							finalLayerId = undefined
						}
						let finalParentId: string | null | undefined = targetParentId
						if (isString(finalParentId) && finalParentId !== 'root') {
							const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
							const exists = layer
								? !!findNode(layer.nodeTree, finalParentId)
								: nodeExistsInAnyLayer(store.state.layers, finalParentId)
							if (!exists) {
								if (debugAgentToUi)
									console.warn(
										'[AIChat] insertNode: parentId not found, fallback to root:',
										finalParentId
									)
								finalParentId = undefined
							}
						}

						const n: Record<string, unknown> = { ...nodeRecord }
						if (!isRecord(n.props)) n.props = {}
						if (!isString(n.category)) n.category = 'user'
						if (n.category === 'user') {
							if (!isString(n.userType)) {
								if (isString(n.type)) n.userType = n.type
							}
							if (!isRecord(n.transform))
								n.transform = { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
						}
						await store.dispatch('addNodeTree', {
							node: n as unknown as VideoSceneTreeNode,
							layerId: finalLayerId,
							parentId: finalParentId
						})

						try {
							const inserted = collectNodeIds(n)
							lastStageOps.value.insertedNodeIds.push(...inserted)
							const idx2 = messages.value.findIndex((x) => x.id === assistantId)
							if (idx2 >= 0) {
								const ops = messages.value[idx2].stageOps ?? { insertedNodeIds: [] }
								ops.insertedNodeIds.push(...inserted)
								messages.value[idx2].stageOps = ops
							}
						} catch {
							// ignore
						}

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							const parts = ['insertNode']
							if (finalParentId !== undefined) parts.push(`parentId=${String(finalParentId)}`)
							if (finalLayerId) parts.push(`layerId=${finalLayerId}`)
							const details = parts.join(', ')
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								'\n\n' + t('aichat.messages.insertedNodeWithParent', { details })
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0)
							messages.value[idx].text =
								t('aichat.errors.nodeInsertFailed', { error: err instanceof Error ? err.message : String(err) })
					}
					continue
				}
				if (m.type === 'agentToUi/patchNode') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payload = m.payload
						const nodeId = isString(payload.nodeId) ? payload.nodeId.trim() : ''
						if (!nodeId) throw new Error('patchNode.payload.nodeId 必须是非空字符串')
						const patch = payload.patch
						if (!isRecord(patch)) throw new Error('patchNode.payload.patch 必须是对象')
						const layerId =
							isString(payload.layerId) && payload.layerId.trim()
								? payload.layerId.trim()
								: undefined
						dispatchDvsEditorNodePatched({
							nodeId,
							layerId,
							patch: patch as Record<string, JsonValue>
						})

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text =
								(messages.value[idx].text || '') + '\n\n' + t('aichat.messages.modifiedNode', { nodeId })
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0)
							messages.value[idx].text =
								t('aichat.errors.nodeModifyFailed', { error: err instanceof Error ? err.message : String(err) })
					}
					continue
				}
				if (m.type === 'agentToUi/deleteNode') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payload = m.payload
						const layerId =
							isString(payload.layerId) && payload.layerId.trim()
								? payload.layerId.trim()
								: undefined
						const ids: string[] = []
						if (isString(payload.nodeId) && payload.nodeId.trim()) ids.push(payload.nodeId.trim())
						if (isArray(payload.nodeIds, isString)) {
							for (const s of payload.nodeIds) {
								if (s.trim()) ids.push(s.trim())
							}
						}
						const uniq = Array.from(new Set(ids))
						if (!uniq.length) throw new Error('deleteNode.payload.nodeId/nodeIds 至少提供一个')
						for (const nodeId of uniq) dispatchDvsEditorNodeDeleted({ nodeId, layerId })

						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							messages.value[idx].text =
								(messages.value[idx].text || '') + '\n\n' + t('aichat.messages.deletedNodes', { nodes: uniq.join(', ') })
						}
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0)
							messages.value[idx].text =
								t('aichat.errors.nodeDeleteFailed', { error: err instanceof Error ? err.message : String(err) })
					}
					continue
				}
				if (m.type === 'agentToUi/chatMessage') {
					taskPhase.value = 'writing'
					const content = m.payload.content
					if (isString(content)) pushStreamText(assistantId, content)
					continue
				}
				if (m.type === 'agentToUi/videoScenePlan') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					const payload = m.payload
					const normalizedPlan = normalizeVideoScenePlan(payload.plan)
					const summary =
						isString(payload.summary) && payload.summary.trim()
							? payload.summary.trim()
							: t('aichat.messages.generatedScenePlan')
					let scenePlanJson = ''
					try {
						scenePlanJson = JSON.stringify(payload.plan ?? null, null, 2)
					} catch {
						scenePlanJson = ''
					}
					const idx = messages.value.findIndex((x) => x.id === assistantId)
					if (idx >= 0) {
						messages.value[idx].scenePlanJson = scenePlanJson || undefined
						messages.value[idx].scenePlanData = normalizedPlan ?? undefined
						messages.value[idx].scenePlanApplyStatus = normalizedPlan ? 'pending' : 'skipped'
						messages.value[idx].text = (messages.value[idx].text || '') + `\n\n${summary}`
					}
					updateScenePlanReadyHint(assistantId)
					continue
				}
				if (m.type === 'agentToUi/error') {
					taskPhase.value = 'error'
					stopTyping()
					const idx = messages.value.findIndex((x) => x.id === assistantId)
					if (idx >= 0)
						messages.value[idx].text = t('aichat.errors.backendError', { code: m.payload.code, message: m.payload.message })
					break
				}
				if (m.type === 'agentToUi/componentTemplate') {
					taskPhase.value = 'template'
					receivedAnyText.value = true
					try {
						const payload = m.payload
						const targetLayerId =
							isString(payload.layerId) && payload.layerId.trim()
								? payload.layerId.trim()
								: undefined
						const rawParentId = payload.parentId
						const targetParentId: string | null | undefined =
							rawParentId === null
								? null
								: isString(rawParentId) && rawParentId.trim()
									? rawParentId.trim()
									: undefined

						let template: unknown = payload.template
						if (debugAgentToUi) {
							try {
								console.debug('[AIChat] componentTemplate raw:', template)
							} catch {
								// ignore
							}
						}
						try {
							const vp = getViewportContext()
							const center =
								vp?.centerWorld && isNumber(vp.centerWorld.x) && isNumber(vp.centerWorld.y)
									? vp.centerWorld
									: undefined
							template = toComponentTemplateLike(template, { defaultCenterWorld: center })
							template = normalizeTemplateForViewport(template, { defaultCenterWorld: center })
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
						const instantiated = componentTemplateApi.instantiateTemplate(
							template as ComponentTemplate,
							{},
							{
								getNodeId: ({ templateId, localId }) => {
									const base = safeIdPart(`${templateId}:${localId}`)
									let id = base
									let i = 1
									while (nodeExistsInAnyLayer(store.state.layers, id)) {
										id = `${base}__${i++}`
									}
									return id
								}
							}
						)
						let finalLayerId = targetLayerId
						if (finalLayerId && !findLayer(store.state, finalLayerId)) {
							if (debugAgentToUi)
								console.warn(
									'[AIChat] componentTemplate: layerId not found, fallback to activeLayer:',
									finalLayerId
								)
							finalLayerId = undefined
						}
						let finalParentId: string | null | undefined = targetParentId
						if (isString(finalParentId) && finalParentId !== 'root') {
							const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
							const exists = layer
								? !!findNode(layer.nodeTree, finalParentId)
								: nodeExistsInAnyLayer(store.state.layers, finalParentId)
							if (!exists) {
								if (debugAgentToUi)
									console.warn(
										'[AIChat] componentTemplate: parentId not found, fallback to root:',
										finalParentId
									)
								finalParentId = undefined
							}
						}
						await store.dispatch('addNodeTree', {
							node: instantiated.root,
							layerId: finalLayerId,
							parentId: finalParentId
						})
						{
							const inserted = collectNodeIds(instantiated.root)
							lastStageOps.value.insertedNodeIds.push(...inserted)
							const idx2 = messages.value.findIndex((x) => x.id === assistantId)
							if (idx2 >= 0) {
								const ops = messages.value[idx2].stageOps ?? { insertedNodeIds: [] }
								ops.insertedNodeIds.push(...inserted)
								messages.value[idx2].stageOps = ops
							}
						}
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0) {
							messages.value[idx].hasStageResult = true
							const parts = [`intent=${payload.intent ?? 'insert'}`]
							if (finalParentId !== undefined) parts.push(`parentId=${String(finalParentId)}`)
							if (finalLayerId) parts.push(`layerId=${finalLayerId}`)
							const details = parts.join(', ')
							messages.value[idx].text =
								(messages.value[idx].text || '') +
								'\n\n' + t('aichat.messages.insertedNodeWithParent', { details })
						}
						updateScenePlanReadyHint(assistantId)
					} catch (err) {
						const idx = messages.value.findIndex((x) => x.id === assistantId)
						if (idx >= 0)
							messages.value[idx].text =
								t('aichat.errors.templateInsertFailed', { error: err instanceof Error ? err.message : String(err) })
					}
					continue
				}
			}
			if (ev.type === 'error') {
				if (stoppedByUser.value) break
				stopTyping()
				const idx = messages.value.findIndex((x) => x.id === assistantId)
				if (idx >= 0) messages.value[idx].text = t('aichat.errors.requestFailed', { message: ev.error.message })
				break
			}
			if (ev.type === 'done') break
		}

		// Auto self-check round (single pass) when stage was changed.
		if (!stoppedByUser.value && taskPhase.value !== 'error') {
			const didMutateStage =
				lastStageOps.value.insertedNodeIds.length > 0 || lastStageOps.value.filters.length > 0
			if (didMutateStage) {
				selfCheckActive.value = true
				// 不新增"思考/自检"气泡，避免与流式反馈重复；复用主 assistant 消息。
				taskPhase.value = 'writing'
				taskPhaseMessage.value = t('aichat.stages.selfChecking')
				thoughtText.value = t('aichat.stages.selfChecking')
				if (!thoughtDismissed.value) thoughtOpen.value = true
				for await (const ev2 of aiChatService.streamMessage({
					conversationId: conversationId.value,
					content:
						'【自检回合】请基于 contextPack.stage 与 lastStageOps，对刚才插入/修改的节点做一致性检查：\n' +
						'1) 字段名与类型是否符合编辑器（尤其是 text.props.textAlign）。\n' +
						'2) 文本节点是否会被裁切：text 节点通常不需要强行写 transform.width/height；如果写了也要足够容纳 textContent（含\\n换行）。\n' +
						'3) 如果发现问题：优先使用 agentToUi/patchNode 或 agentToUi/deleteNode 按 nodeId 精确修改/删除（避免新建导致错乱）；仅在确实需要新增内容时才用 agentToUi/insertNode 或 agentToUi/componentTemplate(intent="insert")；也可用 agentToUi/applyFilter 做轻量修正；如果无需修改，输出一条 chatMessage 说明“自检通过”。',
					contextPack: buildContextPack(),
					provider: activeProvider.value,
					model: textModelId.value || undefined,
					responseMode: 'agentToUi-jsonl',
					viewport: getViewportContext() ?? undefined,
					signal: aborter.signal
				})) {
					if (ev2.type === 'msg') {
						const m2 = ev2.message as AgentToUiMessage
						if (m2.type === 'agentToUi/taskStatus') {
							const payload = m2.payload
							const phase = payload.phase
							const msg = payload.message
							if (isString(msg)) taskPhaseMessage.value = msg
							{
								const text = isString(msg) && msg.trim() ? msg.trim() : String(phase ?? '').trim()
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
							const payload = m2.payload
							const filter = payload.filter as Record<string, JsonValue>
							const mode: 'append' | 'replace' = payload.mode === 'replace' ? 'replace' : 'append'
							if (isRecord(filter)) {
								if (payload.target === 'nodeId' && isString(payload.nodeId)) {
									const layerId = isString(payload.layerId) ? payload.layerId : undefined
									await applyFilterToNodeId(payload.nodeId, filter, mode, layerId)
								} else {
									await applyFilterToSelection(filter, mode)
								}
							}
							continue
						}
						if (m2.type === 'agentToUi/componentTemplate') {
							try {
								const payload = m2.payload
								const targetLayerId =
									isString(payload.layerId) && payload.layerId.trim()
										? payload.layerId.trim()
										: undefined
								const rawParentId = payload.parentId
								const targetParentId: string | null | undefined =
									rawParentId === null
										? null
										: isString(rawParentId) && rawParentId.trim()
											? rawParentId.trim()
											: undefined

								let template: unknown = payload.template
								const vp = getViewportContext()
								const center =
									vp?.centerWorld && isNumber(vp.centerWorld.x) && isNumber(vp.centerWorld.y)
										? vp.centerWorld
										: undefined
								template = toComponentTemplateLike(template, { defaultCenterWorld: center })
								template = normalizeTemplateForViewport(template, { defaultCenterWorld: center })
								template = sanitizeComponentTemplate(template)
								const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')
								const instantiated = componentTemplateApi.instantiateTemplate(
									template as ComponentTemplate,
									{},
									{
										getNodeId: ({ templateId, localId }) => {
											const base = safeIdPart(`${templateId}:${localId}`)
											let id = base
											let i = 1
											while (nodeExistsInAnyLayer(store.state.layers, id)) {
												id = `${base}__${i++}`
											}
											return id
										}
									}
								)
								let finalLayerId = targetLayerId
								if (finalLayerId && !findLayer(store.state, finalLayerId)) {
									if (debugAgentToUi)
										console.warn(
											'[AIChat] self-check componentTemplate: layerId not found, fallback to activeLayer:',
											finalLayerId
										)
									finalLayerId = undefined
								}
								let finalParentId: string | null | undefined = targetParentId
								if (isString(finalParentId) && finalParentId !== 'root') {
									const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
									const exists = layer
										? !!findNode(layer.nodeTree, finalParentId)
										: nodeExistsInAnyLayer(store.state.layers, finalParentId)
									if (!exists) {
										if (debugAgentToUi)
											console.warn(
												'[AIChat] self-check componentTemplate: parentId not found, fallback to root:',
												finalParentId
											)
										finalParentId = undefined
									}
								}
								await store.dispatch('addNodeTree', {
									node: instantiated.root,
									layerId: finalLayerId,
									parentId: finalParentId
								})
							} catch {
								// ignore
							}
							continue
						}
						if (m2.type === 'agentToUi/insertNode') {
							try {
								const payload = m2.payload
								const targetLayerId =
									isString(payload.layerId) && payload.layerId.trim()
										? payload.layerId.trim()
										: undefined
								const rawParentId = payload.parentId
								const targetParentId: string | null | undefined =
									rawParentId === null
										? null
										: isString(rawParentId) && rawParentId.trim()
											? rawParentId.trim()
											: undefined
								const nodeUnknown = payload.node
								if (!isRecord(nodeUnknown)) throw new Error('insertNode.payload.node 必须是对象')
								const nodeRecord = nodeUnknown as Record<string, unknown>

								let finalLayerId = targetLayerId
								if (finalLayerId && !findLayer(store.state, finalLayerId)) {
									if (debugAgentToUi)
										console.warn(
											'[AIChat] self-check insertNode: layerId not found, fallback to activeLayer:',
											finalLayerId
										)
									finalLayerId = undefined
								}
								let finalParentId: string | null | undefined = targetParentId
								if (isString(finalParentId) && finalParentId !== 'root') {
									const layer = findLayer(store.state, finalLayerId ?? store.state.activeLayerId)
									const exists = layer
										? !!findNode(layer.nodeTree, finalParentId)
										: nodeExistsInAnyLayer(store.state.layers, finalParentId)
									if (!exists) {
										if (debugAgentToUi)
											console.warn(
												'[AIChat] self-check insertNode: parentId not found, fallback to root:',
												finalParentId
											)
										finalParentId = undefined
									}
								}

								const n: Record<string, unknown> = { ...nodeRecord }
								if (!isRecord(n.props)) n.props = {}
								if (!isString(n.category)) n.category = 'user'
								if (n.category === 'user') {
									if (!isString(n.userType)) {
										if (isString(n.type)) n.userType = n.type
									}
									if (!isRecord(n.transform))
										n.transform = { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
								}
								await store.dispatch('addNodeTree', {
									node: n as unknown as VideoSceneTreeNode,
									layerId: finalLayerId,
									parentId: finalParentId
								})
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
							const content = m2.payload.content
							if (isString(content)) pushStreamText(assistantId, content)
							continue
						}
						if (m2.type === 'agentToUi/error') {
							stopTyping()
							const idx = messages.value.findIndex((x) => x.id === assistantId)
							if (idx >= 0)
								messages.value[idx].text =
									(messages.value[idx].text || '') +
									'\n\n' + t('aichat.errors.selfCheckFailed', { code: m2.payload.code, message: m2.payload.message })
							break
						}
					}
					if (ev2.type === 'error') break
					if (ev2.type === 'done') break
				}
				selfCheckActive.value = false
			}
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

type SavedComponent = {
	id: string
	createdAt: string
	templateId: string
	name: string
	template: ComponentTemplate
	savedAt: string
	thumbAssetId?: string
	thumbDataUrl?: string
	thumbUrl?: string
}

const COMPONENT_LIBRARY_KEY = 'dvs.componentLibrary.v1'
const componentService = new ComponentLibraryService()

const safeNowId = () => `tpl_${Date.now().toString(36)}`

const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')

const findLayerIdForNodeId = (nodeId: string): string | null => {
	const id = String(nodeId || '').trim()
	if (!id) return null
	for (const layer of store.state.layers) {
		try {
			if (findNode(layer.nodeTree, id)) return layer.id
		} catch {
			// ignore
		}
	}
	return null
}

const easingCurveForPreset = (preset?: string) => {
	switch (
		String(preset || '')
			.trim()
			.toLowerCase()
	) {
		case 'ease-out':
			return { x1: 0.16, y1: 1, x2: 0.3, y2: 1, preset: 'ease-out' }
		case 'ease-in-out':
			return { x1: 0.4, y1: 0, x2: 0.2, y2: 1, preset: 'ease-in-out' }
		case 'overshoot':
			return { x1: 0.18, y1: 0.9, x2: 0.2, y2: 1, preset: 'overshoot' }
		case 'linear':
		default:
			return { x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' }
	}
}

type StageKeyframeEntry = {
	layers?: unknown
}

type LayerLike = {
	id?: unknown
}

const layerHasExistingTimelineData = (layerId: string) => {
	const spans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
	if (Array.isArray(spans) && spans.length) return true
	const nodeKeyframesByLayer = TimelineStore.state.nodeKeyframesByLayer as
		| Record<string, unknown>
		| undefined
	const nodeMap = nodeKeyframesByLayer?.[layerId]
	if (nodeMap && isRecord(nodeMap) && Object.keys(nodeMap).length) return true
	const stageKeyframesByFrame = TimelineStore.state.stageKeyframesByFrame as
		| Record<string, StageKeyframeEntry>
		| undefined
	if (stageKeyframesByFrame) {
		for (const entry of Object.values(stageKeyframesByFrame)) {
			const layers = entry?.layers
			if (isArray(layers)) {
				if (
					layers.some(
						(layer: unknown) => isRecord(layer) && String((layer as LayerLike).id ?? '') === layerId
					)
				)
					return true
			}
		}
	}
	return false
}

const appendUniqueMessageNote = (m: ChatMessage, note: string) => {
	const text = String(m.text || '')
	if (text.includes(note)) return
	m.text = text.trim() ? `${text}\n\n${note}` : note
}

const canGenerateScenePlanAnimation = (m: ChatMessage) => {
	if (m.role !== 'assistant') return false
	if (!m.scenePlanData) return false
	const insertedNodeIds = Array.from(
		new Set(
			(m.stageOps?.insertedNodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)
		)
	)
	if (!insertedNodeIds.length) return false
	return m.scenePlanApplyStatus !== 'applied' && m.scenePlanApplyStatus !== 'skipped'
}

const updateScenePlanReadyHint = (assistantId: string) => {
	const idx = messages.value.findIndex((x) => x.id === assistantId)
	if (idx < 0) return
	const message = messages.value[idx]
	if (!canGenerateScenePlanAnimation(message)) return
	appendUniqueMessageNote(
		message,
		t('aichat.messages.scenePlanReady')
	)
}

const generateScenePlanAnimations = async (message: ChatMessage) => {
	if (!message.scenePlanData) return
	if (message.scenePlanApplyStatus === 'applied' || message.scenePlanApplyStatus === 'skipped')
		return
	const insertedNodeIds = Array.from(
		new Set(
			(message.stageOps?.insertedNodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)
		)
	)
	if (!insertedNodeIds.length) {
		message.scenePlanApplyStatus = 'skipped'
		appendUniqueMessageNote(message, t('aichat.errors.animationNoNodes'))
		return
	}

	const layerIds = Array.from(
		new Set(
			insertedNodeIds.map((id) => findLayerIdForNodeId(id)).filter((id): id is string => !!id)
		)
	)
	if (layerIds.length !== 1) {
		message.scenePlanApplyStatus = 'skipped'
		appendUniqueMessageNote(
			message,
			t('aichat.errors.animationMultiLayer')
		)
		return
	}

	const layerId = layerIds[0]
	if (layerHasExistingTimelineData(layerId)) {
		message.scenePlanApplyStatus = 'skipped'
		appendUniqueMessageNote(
			message,
			t('aichat.errors.animationTimelineExists')
		)
		return
	}

	const layer = findLayer(store.state, layerId)
	if (!layer) {
		message.scenePlanApplyStatus = 'skipped'
		appendUniqueMessageNote(message, t('aichat.errors.animationNoLayer'))
		return
	}

	const compiled = compileVideoScenePlan({
		layer,
		insertedNodeIds,
		rootNodeId: insertedNodeIds[0],
		plan: message.scenePlanData
	})
	if (!compiled || !compiled.appliedPlanCount) {
		message.scenePlanApplyStatus = 'skipped'
		appendUniqueMessageNote(message, t('aichat.errors.animationNoTarget'))
		return
	}

	for (const item of compiled.keyframes) {
		await TimelineStore.dispatch('addKeyframeRange', {
			layerId,
			startFrame: item.frame,
			endFrame: item.frame
		})
		await TimelineStore.dispatch('setStageKeyframeSnapshotRange', {
			startFrame: item.frame,
			endFrame: item.frame,
			layers: [item.layerSnapshot]
		})
	}
	for (const seg of compiled.easingSegments) {
		await TimelineStore.dispatch('enableEasingSegment', {
			layerId,
			startFrame: seg.startFrame,
			endFrame: seg.endFrame
		})
		await TimelineStore.dispatch('setEasingCurve', {
			segmentKey: `${layerId}:${seg.startFrame}:${seg.endFrame}`,
			curve: easingCurveForPreset(seg.easingPreset)
		})
	}

	await store.dispatch('setActiveLayer', { layerId })
	await store.dispatch('setSelectedNodes', { nodeIds: compiled.appliedTargetNodeIds })
	await TimelineStore.dispatch('jumpToFrameCentered', { frameIndex: compiled.firstFrame })
	applyTimelineAnimationAtFrame(TimelineStore.state.currentFrame)

	message.scenePlanApplyStatus = 'applied'
	message.hasStageResult = true
	appendUniqueMessageNote(
		message,
		t('aichat.messages.animationGenerated', { count: compiled.appliedPlanCount, nodeCount: compiled.appliedTargetNodeIds.length })
	)
}

const onClickGenerateAnimation = async (m: ChatMessage) => {
	if (sending.value) return
	await generateScenePlanAnimations(m)
}

type MutableTemplate = {
	params: unknown[]
	nodes: unknown[]
}

type MutableTemplateNode = {
	type?: unknown
	props?: Record<string, unknown>
}

const ensureTemplateTextParams = <T,>(template: T): T => {
	if (!isRecord(template)) return template
	const tpl = template as unknown as MutableTemplate
	if (!Array.isArray(tpl.params)) tpl.params = []
	if (!Array.isArray(tpl.nodes)) return template

	const used = new Set<string>(
		tpl.params.map((p: unknown) => (isRecord(p) && isString(p.key) ? p.key : '')).filter(Boolean)
	)
	const baseKeys = ['title', 'subtitle', 'text']
	let seq = 0
	const nextKey = () => {
		seq += 1
		let k = baseKeys[seq - 1] || `text${seq - 2}`
		k = String(k)
		let i = 2
		while (used.has(k)) {
			k = `${k}_${i++}`
		}
		used.add(k)
		return k
	}

	for (const n of tpl.nodes) {
		if (!isRecord(n)) continue
		const node = n as unknown as MutableTemplateNode
		if (String(node.type ?? '') !== 'text') continue
		const props = node.props
		if (!isRecord(props)) continue
		const v = props.textContent
		if (!isString(v)) continue
		const text = v.trim()
		if (!text) continue
		const key = nextKey()
		tpl.params.push({ key, type: 'string', default: v })
		props.textContent = `{{ ${key} }}`
	}
	return template
}

const loadComponentLibrary = (): SavedComponent[] => {
	try {
		const raw = localStorage.getItem(COMPONENT_LIBRARY_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed as SavedComponent[]
	} catch {
		return []
	}
}

const persistComponentLibrary = (list: SavedComponent[]) => {
	try {
		localStorage.setItem(COMPONENT_LIBRARY_KEY, JSON.stringify(list))
	} catch {
		// ignore
	}
}

const saveToComponentLibrary = async (m: ChatMessage, ev?: MouseEvent) => {
	try {
		const idsRaw = m.stageOps?.insertedNodeIds ?? []
		const ids = Array.from(new Set(idsRaw.map((x) => String(x || '').trim()).filter(Boolean)))
		if (!ids.length) {
			m.text = (m.text || '') + '\n\n' + t('aichat.errors.saveNoNodes')
			return
		}

		const layerIds = Array.from(
			new Set(
				ids
					.map((id) => findLayerIdForNodeId(id))
					.filter((x): x is string => typeof x === 'string' && !!x.trim())
			)
		)
		if (layerIds.length !== 1) {
			m.text = (m.text || '') + '\n\n' + t('aichat.errors.saveMultiLayer')
			return
		}
		const layerId = layerIds[0]
		const layer = findLayer(store.state, layerId)
		if (!layer) {
			m.text = (m.text || '') + '\n\n' + t('aichat.errors.saveNoLayer')
			return
		}

		const existing = loadComponentLibrary()
		const existingNames = existing.map((x) => x.name)
		const existingTemplateIds = new Set(existing.map((x) => x.templateId))

		const makeUniqueName = (baseName: string) => {
			const desired = String(baseName || 'Component').trim() || 'Component'
			if (!existingNames.includes(desired)) return desired
			let i = 2
			while (existingNames.includes(`${desired} ${i}`)) i++
			return `${desired} ${i}`
		}
		const makeUniqueTemplateId = (baseId: string) => {
			const desired = safeIdPart(String(baseId || 'tpl').trim() || 'tpl')
			if (!existingTemplateIds.has(desired)) return desired
			let i = 2
			while (existingTemplateIds.has(`${desired}__${i}`)) i++
			return `${desired}__${i}`
		}

		const createdAt = new Date().toISOString()
		const baseTplId = safeNowId()
		const templateId = makeUniqueTemplateId(baseTplId)
		const name = makeUniqueName(`AI组件-${templateId}`)

		let template = componentTemplateApi.exportTemplateFromSelection({
			layerNodeTree: layer.nodeTree,
			selectedNodeIds: ids,
			templateId,
			name
		})
		template = ensureTemplateTextParams(template)

		type Point2D = { x: number; y: number }
		type CanvasWithCapture = DwebCanvasLike & {
			capturePngFromScreenRect: (
				rect: { x: number; y: number; width: number; height: number },
				opts: { maxSidePx: number; padPx: number }
			) => Promise<{ dataUrl?: string } | null>
			worldToScreen: (p: Point2D) => Point2D
		}

		let thumbAssetId: string | undefined
		let thumbDataUrl: string | undefined
		try {
			const dwebCanvas = dwebCanvasRef?.value as CanvasWithCapture | null
			if (dwebCanvas) {
				const pts: Point2D[] = []
				for (const nodeId of ids) {
					const n = findNode(layer.nodeTree ?? [], nodeId)
					const tr = n?.transform
					if (
						!tr ||
						!isNumber(tr.x) ||
						!isNumber(tr.y) ||
						!isNumber(tr.width) ||
						!isNumber(tr.height)
					)
						continue
					const corners = rotatedRectCorners(
						{ x: tr.x, y: tr.y },
						{ width: Math.max(1, tr.width), height: Math.max(1, tr.height) },
						Number(tr.rotation ?? 0)
					)
					const sp = [corners.tl, corners.tr, corners.bl, corners.br].map((p) =>
						dwebCanvas.worldToScreen(p)
					)
					pts.push(...sp)
				}
				if (pts.length) {
					const xs = pts.map((p) => p.x)
					const ys = pts.map((p) => p.y)
					const minX = Math.min(...xs)
					const maxX = Math.max(...xs)
					const minY = Math.min(...ys)
					const maxY = Math.max(...ys)
					const shot = await dwebCanvas.capturePngFromScreenRect(
						{ x: minX, y: minY, width: maxX - minX, height: maxY - minY },
						{ maxSidePx: 240, padPx: 10 }
					)
					if (shot?.dataUrl) {
						thumbAssetId = `thumb:${templateId}:${Date.now().toString(36)}`
						thumbDataUrl = shot.dataUrl
						store.commit('upsertImageAsset', { id: thumbAssetId, url: thumbDataUrl, name })
						const fromEl = (ev?.currentTarget as HTMLElement | null) ?? null
						const fromRect = fromEl?.getBoundingClientRect?.()
						const toEl = document.querySelector(
							'[data-dvs="component-library-btn"]'
						) as HTMLElement | null
						const toRect = toEl?.getBoundingClientRect?.()
						if (fromRect && toRect) {
							void flyThumbnailPng({
								dataUrl: shot.dataUrl,
								from: {
									x: fromRect.left + fromRect.width / 2,
									y: fromRect.top + fromRect.height / 2
								},
								to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
								initialSize: { width: 160, height: 100 },
								ms: 360
							})
						}
					}
				}
			}
		} catch {
			// ignore
		}

		const savedAt = new Date().toISOString()
		let entry: SavedComponent = {
			id: `cmp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
			createdAt,
			templateId,
			name,
			template,
			savedAt,
			thumbAssetId,
			thumbDataUrl
		}
		try {
			const res = await componentService.upsertComponent({
				templateId,
				name,
				template,
				thumbAssetId,
				thumbDataUrl,
				clientId: entry.id,
				createdAt: entry.createdAt
			})
			entry = {
				...entry,
				id: res.item.id || entry.id,
				createdAt: res.item.createdAt || entry.createdAt,
				savedAt: res.item.savedAt || entry.savedAt,
				thumbUrl: res.item.thumbUrl
			}
		} catch {
			// fallback to local storage only
		}

		const list = loadComponentLibrary().filter((x) => x.templateId !== entry.templateId)
		list.unshift(entry)
		persistComponentLibrary(list)
		window.dispatchEvent(
			new CustomEvent('dvs:componentLibrary/refresh', { detail: { templateId } })
		)
		m.text = (m.text || '') + '\n\n' + t('aichat.messages.savedToLibrary', { name })
	} catch (e) {
		m.text = (m.text || '') + '\n\n' + t('aichat.errors.saveFailed', { error: e instanceof Error ? e.message : String(e) })
	}
}

const copyScenePlanJson = async (m: ChatMessage) => {
	const text = String(m.scenePlanJson || '').trim()
	if (!text) return
	try {
		await navigator.clipboard.writeText(text)
		m.text = (m.text || '') + '\n\n' + t('aichat.messages.jsonCopied')
	} catch {
		m.text = (m.text || '') + '\n\n' + t('aichat.errors.jsonCopyFailed')
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
	min-width: 460px;
	min-height: 420px;
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
	transition:
		transform 180ms ease,
		opacity 180ms ease;
}

.ai-chat__resize {
	position: absolute;
	z-index: 2;
}

.ai-chat__resize--right {
	top: 36px;
	right: -2px;
	width: 8px;
	height: calc(100% - 36px);
	cursor: ew-resize;
}

.ai-chat__resize--bottom {
	left: 0;
	bottom: -2px;
	width: 100%;
	height: 8px;
	cursor: ns-resize;
}

.ai-chat__resize--corner {
	right: -2px;
	bottom: -2px;
	width: 14px;
	height: 14px;
	cursor: nwse-resize;
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

.ai-chat__controls {
	display: flex;
	gap: 8px;
	padding: 8px;
	border-bottom: 1px solid var(--vscode-border);
	background: color-mix(in srgb, var(--dweb-defualt-dark) 72%, transparent);
}

.ai-chat__control {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	flex: 0 0 106px;
}

.ai-chat__control--grow {
	flex: 1 1 auto;
}

.ai-chat__control-label {
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.ai-chat__select {
	width: 100%;
	height: 28px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	font-size: 12px;
	padding: 0 8px;
}

.ai-chat__select:focus {
	outline: none;
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
	max-width: 96%;
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
	flex-wrap: wrap;
}

.ai-chat__action-btn {
	min-height: 24px;
	padding: 4px 10px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
	white-space: normal;
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
	transition:
		transform 180ms ease,
		opacity 180ms ease;
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
