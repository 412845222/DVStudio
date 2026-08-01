<template>
	<div
		ref="nodeElRef"
		class="wf-node"
		:data-node-id="nodeId"
		:class="[
			{ selected: selected },
			{
				'is-primary-selected': isPrimarySelectedResolved,
				'is-secondary-selected': isSecondarySelectedResolved,
				'wf-node-running':
					visualStatus === 'running' ||
					taskVisualStatus === 'running' ||
					taskVisualStatus === 'submitting',
				'wf-node-error': visualStatus === 'error' || taskVisualStatus === 'error',
				'wf-node-task-running': taskVisualStatus === 'running' || taskVisualStatus === 'submitting',
				'wf-node-task-success': taskVisualStatus === 'success',
				'wf-node-task-error': taskVisualStatus === 'error'
			},
			{ 'wf-node-chat-open': nodeChatVisibleResolved },
			{ 'is-auto-height': autoHeight !== false },
			`wf-node-${nodeType}`
		]"
		:style="style"
		@click.stop="onSelect"
	>
		<div v-if="selected && isPrimarySelectedResolved" class="wf-node-toolbar" @pointerdown.stop>
			<button
				class="wf-node-btn"
				type="button"
				:title="t('aiworkflow.nodeBase.switchNodeType')"
				@click.stop="onOpenNodeLibrary"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
					<path
						d="M4.2 11.8 11.4 4.6l1.6 1.6-7.2 7.2-2.3.7.7-2.3Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="wf-node-type-label">{{ typeLabel }}</span>
				<span class="wf-node-type-caret">▾</span>
			</button>
			<button
				class="wf-node-btn"
				type="button"
				:title="t('aiworkflow.nodeBase.clearNodeContent')"
				@click="emit('clear-node')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
					<path
						d="M4 5h8l-.8 8.2H4.8L4 5Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linejoin="round"
					/>
					<path
						d="M3 5h10M6.2 3.2h3.6"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
					/>
					<path d="M6.2 8.2h3.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
				</svg>
				<span class="wf-node-btn-label">{{ t('aiworkflow.nodeBase.clear') }}</span>
			</button>
			<button
				class="wf-node-btn"
				type="button"
				:title="t('aiworkflow.nodeBase.copyNode')"
				@click="emit('copy')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
					<rect
						x="5"
						y="5"
						width="9"
						height="9"
						rx="1"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
					/>
					<rect
						x="2"
						y="2"
						width="9"
						height="9"
						rx="1"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
					/>
				</svg>
				<span class="wf-node-btn-label">{{ t('aiworkflow.nodeBase.copyNode') }}</span>
			</button>
			<button
				class="wf-node-btn"
				type="button"
				:title="t('aiworkflow.nodeBase.refreshNode')"
				@click="emit('refresh')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
					<path
						d="M13.5 8a5.5 5.5 0 1 1-1.2-3.4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
					/>
					<path
						d="M10.8 1.9h3.3v3.3"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="wf-node-btn-label">{{ t('aiworkflow.nodeBase.refreshNode') }}</span>
			</button>
			<button
				class="wf-node-btn"
				type="button"
				:title="t('aiworkflow.nodeBase.deleteNode')"
				@click="emit('delete')"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
					<path d="M4 5h8l-1 9H5z" fill="none" stroke="currentColor" stroke-width="1.2" />
					<path d="M3 5h10" stroke="currentColor" stroke-width="1.2" />
					<path d="M6 5V3h4v2" fill="none" stroke="currentColor" stroke-width="1.2" />
				</svg>
				<span class="wf-node-btn-label">{{ t('aiworkflow.nodeBase.deleteNode') }}</span>
			</button>
		</div>
		<div class="wf-node-header">
			<div class="wf-node-title">{{ displayTitle }}</div>
			<div class="wf-node-type">{{ nodeType }}</div>
			<div
				v-if="nodeGenerationTask && nodeGenerationTask.status !== 'idle'"
				class="wf-node-generation"
				:class="[`wf-node-generation-${nodeGenerationTask.status}`]"
			>
				<div class="wf-node-generation-label">
					<span class="wf-node-generation-status">{{ generationStatusLabel }}</span>
					<span
						v-if="
							nodeGenerationTask.statusText &&
							nodeGenerationTask.statusText !== generationStatusLabel
						"
						class="wf-node-generation-text"
					>
						· {{ nodeGenerationTask.statusText }}
					</span>
				</div>
				<div class="wf-node-generation-bar">
					<div
						class="wf-node-generation-bar-fill"
						:style="{
							width: `${Math.max(2, Math.min(100, Number(nodeGenerationTask.progress) || 0))}%`
						}"
					/>
				</div>
				<div
					v-if="nodeGenerationTask.results && nodeGenerationTask.results.length"
					class="wf-node-generation-results"
				>
					<span>
						{{
							t('aiworkflow.nodeBase.resultsGenerated', {
								count: nodeGenerationTask.results.length
							})
						}}
					</span>
				</div>
			</div>
		</div>
		<div class="wf-node-body">
			<slot name="body">{{ t('aiworkflow.nodeBase.bodyPlaceholder') }}</slot>
		</div>
		<div class="wf-node-footer">
			<slot name="footer">{{ t('aiworkflow.nodeBase.footerPlaceholder') }}</slot>
		</div>

		<NodeChatDialog
			v-show="nodeChatVisibleResolved"
			class="wf-node-inline-chat"
			:visible="nodeChatVisibleResolved"
			:node-id="nodeId"
			:node-type="nodeChatNodeTypeResolved"
			:draft="nodeChatDraft"
			:submitting="nodeChatSubmitting"
			:params="nodeChatParams"
			:selected-references="nodeChatSelectedRefs"
			:node-width="width"
			:input-param-preview-refs="inputParamPreviewRefs"
		/>

		<div class="wf-resize wf-resize-nw" @pointerdown.stop.prevent="onResizeStart('nw', $event)" />
		<div class="wf-resize wf-resize-ne" @pointerdown.stop.prevent="onResizeStart('ne', $event)" />
		<div class="wf-resize wf-resize-sw" @pointerdown.stop.prevent="onResizeStart('sw', $event)" />
		<div class="wf-resize wf-resize-se" @pointerdown.stop.prevent="onResizeStart('se', $event)" />

		<!-- L-shaped brackets are now CSS ::before / ::after on .wf-node -->
		<!-- Node id badge -->
		<span class="wf-node-id-badge" aria-hidden="true">{{ nodeId }}</span>
		<!-- Particle layer (DOM particles, visible on hover/selected/running/error) -->
		<div class="wf-node-particles" aria-hidden="true">
			<span
				v-for="p in nodeParticles.particles"
				:key="p.id"
				class="sq-particle"
				:class="
					nodeParticles.buildHoverStateClass(false, {
						running: visualStatus === 'running',
						error: visualStatus === 'error'
					})
				"
				:style="p.style"
			></span>
		</div>

		<slot
			v-if="hasAnchorSlot"
			name="anchors"
			:inputAnchors="inputAnchors"
			:outputAnchors="outputAnchors"
			:startLink="onStartLink"
			:endLink="onEndLink"
			:isInputHover="isInputHover"
			:isOutputHover="isOutputHover"
		/>
		<template v-else>
			<div class="wf-anchors wf-anchors-in" :aria-label="t('aiworkflow.nodeBase.inputAnchors')">
				<div
					v-for="a in inputAnchors"
					:key="a.id"
					class="wf-anchor-hit"
					:class="[
						anchorClass(a),
						{
							hovered: isInputHover(a.id),
							compatible: isAnchorCompatible(a.id, 'in'),
							incompatible: isAnchorIncompatible(a.id, 'in')
						}
					]"
					:title="a.label || t('aiworkflow.nodeBase.inputAnchor')"
					:style="anchorStyle(a)"
					:data-wf-node-id="nodeId"
					:data-wf-anchor-id="a.id"
					:data-wf-anchor-type="anchorTypeAttr(a)"
					data-wf-dir="in"
					data-anchor-direction="in"
					data-anchor-side="left"
					:data-wf-anchor-index="a.index"
					@pointerup="onInputAnchorPointerUp(a.id, a.index, $event)"
				/>
			</div>
			<div class="wf-anchors wf-anchors-out" :aria-label="t('aiworkflow.nodeBase.outputAnchors')">
				<div
					v-for="a in outputAnchors"
					:key="a.id"
					class="wf-anchor-hit"
					:class="[
						anchorClass(a),
						{
							hovered: isOutputHover(a.id),
							compatible: isAnchorCompatible(a.id, 'out'),
							incompatible: isAnchorIncompatible(a.id, 'out')
						}
					]"
					:title="a.label || t('aiworkflow.nodeBase.outputAnchor')"
					:style="anchorStyle(a)"
					:data-wf-node-id="nodeId"
					:data-wf-anchor-id="a.id"
					:data-wf-anchor-type="anchorTypeAttr(a)"
					data-wf-dir="out"
					data-anchor-direction="out"
					data-anchor-side="right"
					:data-wf-anchor-index="a.index"
					@pointerdown.stop.prevent="onStartLink(a.id, a.index, $event)"
				/>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, useSlots, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n'
import { useSquareParticles } from '../../composables/useSquareParticles'
import type {
	WorkflowNodeChatType,
	WorkflowNodeChatSelectedRef,
	WorkflowNodeGenerationTask
} from '../../aiworkflow/types'
import { NodeChatDialog, type InputParamPreviewRef } from '../BluePrint/node-dialog'

const { t } = useI18n()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta'
}

type NormalizedAnchor = AnchorSpec & {
	index: number
	offsetY: number
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	isPrimarySelected?: boolean
	isSecondarySelected?: boolean
	visualStatus?: 'idle' | 'running' | 'error'
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, unknown>
	nodeChatSelectedRefs?: WorkflowNodeChatSelectedRef[]
	inputParamPreviewRefs?: InputParamPreviewRef[]
	nodeGenerationTask?: WorkflowNodeGenerationTask | null
	anchorCompatibility?: Record<string, boolean | null>
	isLinking?: boolean
	sizeCustomized?: boolean
	autoHeight?: boolean
}>()

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', payload: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(
		e: 'start-link',
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'clear-node'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
			| 'blender'
	): void
	(e: 'open-node-library'): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'auto-resize', height: number): void
}>()

const slots = useSlots()

// 稳定种子：从 nodeId 派生 — 每个节点有自己的粒子布局
function hashNodeIdToNumber(id: string): number {
	let h = 0
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) | 0
	}
	return Math.abs(h)
}

const nodeParticles = useSquareParticles({
	count: 6,
	seed: hashNodeIdToNumber(props.nodeId)
})

const hasAnchorSlot = computed(() => !!slots.anchors)

const defaultOffsets = (idx: number, count: number) => {
	const gap = 24
	const start = -((count - 1) * gap) / 2
	return start + idx * gap
}

const normalizeAnchors = (
	anchors: AnchorSpec[] | undefined,
	fallbackId: string
): NormalizedAnchor[] => {
	if (Array.isArray(anchors)) {
		if (!anchors.length) return []
		return anchors.map((a, index) => ({
			...a,
			index,
			offsetY: typeof a.offsetY === 'number' ? a.offsetY : defaultOffsets(index, anchors.length)
		}))
	}
	const list: AnchorSpec[] = [{ id: fallbackId }]
	return list.map((a, index) => ({
		...a,
		index,
		offsetY: defaultOffsets(index, list.length)
	}))
}

const inputAnchors = computed(() => normalizeAnchors(props.inputs, 'in-0'))
const outputAnchors = computed(() => normalizeAnchors(props.outputs, 'out-0'))

const isPrimarySelectedResolved = computed(() => {
	if (typeof props.isPrimarySelected === 'boolean') return props.isPrimarySelected
	return Boolean(props.selected)
})

const isSecondarySelectedResolved = computed(() => {
	if (typeof props.isSecondarySelected === 'boolean') return props.isSecondarySelected
	return Boolean(props.selected) && !isPrimarySelectedResolved.value
})

const visualStatus = computed<'idle' | 'running' | 'error'>(() => {
	const status = props.visualStatus
	if (status === 'running' || status === 'error') return status
	return 'idle'
})

const taskVisualStatus = computed<'idle' | 'submitting' | 'running' | 'success' | 'error'>(() => {
	const task = props.nodeGenerationTask
	if (!task) return 'idle'
	if (task.status === 'completed') return 'success'
	if (task.status === 'cancelled' || task.status === 'idle') return 'idle'
	return task.status as 'submitting' | 'running' | 'error'
})

const nodeChatDraft = computed(() => String(props.nodeChatDraft ?? ''))
const nodeChatSubmitting = computed(() => props.nodeChatSubmitting === true)
const nodeChatParams = computed(() => props.nodeChatParams ?? {})
const nodeChatSelectedRefs = computed(() => props.nodeChatSelectedRefs ?? [])

const nodeChatNodeTypeResolved = computed<WorkflowNodeChatType | null>(() => {
	const type = props.nodeChatNodeType ?? props.nodeType
	if (
		type === 'text' ||
		type === 'image' ||
		type === 'video' ||
		type === 'model3d' ||
		type === 'blender'
	)
		return type
	return null
})

const nodeChatVisibleResolved = computed(() => {
	return Boolean(props.nodeChatVisible && nodeChatNodeTypeResolved.value)
})

const typeLabel = computed(() => {
	if (props.nodeType === 'text') return t('nodes.type.text')
	if (props.nodeType === 'text-merge') return t('nodes.type.textMerge')
	if (props.nodeType === 'image') return t('nodes.type.image')
	if (props.nodeType === 'rotate-image') return t('nodes.type.rotateImage')
	if (props.nodeType === 'video') return t('nodes.type.video')
	if (props.nodeType === 'scene-understanding') return t('nodes.type.sceneUnderstanding')
	if (props.nodeType === 'scene-decompose') return t('nodes.type.sceneDecompose')
	if (props.nodeType === 'scene-layout') return t('nodes.type.sceneLayout')
	if (props.nodeType === 'unreal-export') return t('nodes.type.unrealExport')
	if (props.nodeType === 'story') return t('nodes.type.story')
	if (props.nodeType === 'comfyui') return t('nodes.type.comfyui')
	if (props.nodeType === 'model3d') return t('nodes.type.model3d')
	if (props.nodeType === 'meshy') return t('nodes.type.meshy')
	if (props.nodeType === 'blender') return t('nodes.type.blender')
	return t('nodes.type.base')
})

const NODE_TYPE_TO_ACTION_ID: Record<string, string> = {
	text: 'text-generation',
	image: 'image-generation',
	'rotate-image': 'rotate-image',
	video: 'video-generation',
	'scene-understanding': 'scene-understanding',
	'scene-layout': 'scene-layout',
	'scene-decompose': 'scene-decompose',
	comfyui: 'comfyui',
	model3d: 'model3d',
	meshy: 'meshy',
	blender: 'blender',
	'unreal-export': 'unreal-export',
	'text-merge': 'text-merge',
	story: 'story',
	base: 'base'
}

const DEFAULT_ALIASES_ZH = new Set([
	'文本节点',
	'图片节点',
	'旋转图片节点',
	'视频节点',
	'场景理解节点',
	'场景布局节点',
	'场景分解节点',
	'虚幻导出节点',
	'剧情节点',
	'ComfyUI 节点',
	'3D模型节点',
	'Meshy模型生成节点',
	'文本整合节点',
	'工作流节点'
])

const resolvedTitle = computed(() => {
	const actionId = NODE_TYPE_TO_ACTION_ID[props.nodeType]
	if (actionId) {
		const key = `aiworkflow.nodeLibrary.nodes.${actionId}.label`
		const translated = t(key)
		if (translated !== key) return translated
	}
	return props.title
})

const isDefaultAlias = computed(() => {
	const alias = String(props.alias ?? '').trim()
	if (!alias) return true
	return DEFAULT_ALIASES_ZH.has(alias)
})

const displayTitle = computed(() => {
	if (isDefaultAlias.value) {
		return resolvedTitle.value
	}
	return props.alias || resolvedTitle.value
})

const displaySubtitle = computed(() => {
	const key = 'aiworkflow.nodeLibrary.defaultSubtitle'
	const translated = t(key)
	if (translated !== key) return translated
	return props.subtitle
})

const generationStatusLabel = computed(() => {
	const status = props.nodeGenerationTask?.status
	if (status === 'submitting') return t('aiworkflow.nodeBase.taskSubmitting')
	if (status === 'running') return t('aiworkflow.nodeBase.taskRunning')
	if (status === 'completed') return t('aiworkflow.nodeBase.taskCompleted')
	if (status === 'error') return t('aiworkflow.nodeBase.taskError')
	return t('aiworkflow.nodeBase.taskIdle')
})

const onOpenNodeLibrary = () => {
	emit('open-node-library')
}

const anchorStyle = (a: AnchorSpec & { offsetY?: number }) => ({
	top: `calc(50% + ${a.offsetY ?? 0}px)`
})

const anchorClass = (a: AnchorSpec) => {
	if (a.mediaType === 'image') return 'wf-anchor-image'
	if (a.mediaType === 'video') return 'wf-anchor-video'
	if (a.mediaType === 'text') return 'wf-anchor-text'
	if (a.mediaType === 'flow') return 'wf-anchor-flow'
	if (a.mediaType === 'model3d') return 'wf-anchor-model3d'
	if (a.mediaType === 'audio') return 'wf-anchor-audio'
	if (a.mediaType === 'meta') return 'wf-anchor-meta'
	return 'wf-anchor-resource'
}

const anchorTypeAttr = (a: AnchorSpec) => {
	if (a.mediaType === 'image') return 'image'
	if (a.mediaType === 'video') return 'video'
	if (a.mediaType === 'text') return 'text'
	if (a.mediaType === 'model3d') return 'model3d'
	if (a.mediaType === 'flow') return 'flow'
	if (a.mediaType === 'audio') return 'audio'
	if (a.mediaType === 'meta') return 'meta'
	return 'resource'
}

const nodeElRef = ref<HTMLElement | null>(null)

const MIN_AUTO_HEIGHT = 120
const MAX_AUTO_HEIGHT = 10000
const HEIGHT_CHANGE_THRESHOLD = 2

let resizeObserver: ResizeObserver | null = null
let rafId = 0
let lastEmittedHeight = 0
let userResized = false

const measureNaturalHeight = (): number => {
	const el = nodeElRef.value
	if (!el) return props.height
	const prevHeight = el.style.height
	const prevFlexBasis = el.style.flexBasis
	el.style.height = 'auto'
	el.style.flexBasis = 'auto'
	const natural = el.getBoundingClientRect().height
	el.style.height = prevHeight
	if (prevFlexBasis !== undefined) {
		el.style.flexBasis = prevFlexBasis
	} else {
		el.style.flexBasis = ''
	}
	const zoom = Math.max(1e-6, props.zoom || 1)
	const worldHeight = natural / zoom
	const clamped = Math.max(MIN_AUTO_HEIGHT, Math.min(MAX_AUTO_HEIGHT, worldHeight))
	return Math.round(clamped)
}

const requestAutoResize = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		if (userResized) return
		if (props.autoHeight === false) return
		const nextHeight = measureNaturalHeight()
		if (Math.abs(nextHeight - lastEmittedHeight) < HEIGHT_CHANGE_THRESHOLD) return
		if (Math.abs(nextHeight - props.height) < HEIGHT_CHANGE_THRESHOLD) return
		lastEmittedHeight = nextHeight
		emit('auto-resize', nextHeight)
	})
}

const setupResizeObserver = () => {
	if (typeof ResizeObserver === 'undefined') return
	const el = nodeElRef.value
	if (!el) return
	resizeObserver = new ResizeObserver(() => {
		requestAutoResize()
	})
	resizeObserver.observe(el, { box: 'content-box' })
}

const teardownResizeObserver = () => {
	if (resizeObserver) {
		resizeObserver.disconnect()
		resizeObserver = null
	}
	if (rafId) {
		cancelAnimationFrame(rafId)
		rafId = 0
	}
}

const onSelect = () => {
	emit('select', props.nodeId)
}

const MIN_SIZE = 80

const onResizeStart = (corner: 'nw' | 'ne' | 'sw' | 'se', e: PointerEvent) => {
	if (e.button !== 0) return
	console.log('[WorkflowNodeBase] onResizeStart', {
		nodeId: props.nodeId,
		corner,
		nodeChatVisible: nodeChatVisibleResolved.value,
		hasDraft: nodeChatDraft.value.length > 0
	})
	userResized = true
	teardownResizeObserver()
	emit('select', props.nodeId)
	const el = e.currentTarget as HTMLElement
	const z = Math.max(1e-6, props.zoom)
	const start = {
		clientX: e.clientX,
		clientY: e.clientY,
		width: props.width,
		height: props.height,
		worldX: props.worldX,
		worldY: props.worldY
	}
	el.setPointerCapture(e.pointerId)

	const onMove = (ev: PointerEvent) => {
		ev.preventDefault()
		const dx = (ev.clientX - start.clientX) / z
		const dy = (ev.clientY - start.clientY) / z
		let nextW = start.width
		let nextH = start.height
		let shiftX = 0
		let shiftY = 0

		if (corner === 'nw' || corner === 'sw') {
			nextW = start.width - dx
			shiftX = dx / 2
		} else {
			nextW = start.width + dx
			shiftX = dx / 2
		}
		if (corner === 'nw' || corner === 'ne') {
			nextH = start.height - dy
			shiftY = dy / 2
		} else {
			nextH = start.height + dy
			shiftY = dy / 2
		}

		nextW = Math.max(MIN_SIZE, nextW)
		nextH = Math.max(MIN_SIZE, nextH)

		emit('resize', {
			width: nextW,
			height: nextH,
			worldX: start.worldX + shiftX,
			worldY: start.worldY + shiftY
		})
	}
	const onUp = (ev: PointerEvent) => {
		console.log('[WorkflowNodeBase] onResizeEnd', {
			nodeId: props.nodeId,
			nodeChatVisible: nodeChatVisibleResolved.value
		})
		el.removeEventListener('pointermove', onMove)
		el.removeEventListener('pointerup', onUp)
		el.removeEventListener('pointercancel', onUp)
		try {
			el.releasePointerCapture(ev.pointerId)
		} catch {
			// ignore
		}
		if (props.autoHeight !== false) {
			userResized = false
			nextTick(() => {
				setupResizeObserver()
				requestAutoResize()
				setTimeout(requestAutoResize, 50)
				setTimeout(requestAutoResize, 200)
			})
		}
	}
	el.addEventListener('pointermove', onMove)
	el.addEventListener('pointerup', onUp, { once: true })
	el.addEventListener('pointercancel', onUp, { once: true })
}

const onStartLink = (anchorId: string, anchorIndex: number, event: PointerEvent) => {
	emit('start-link', { nodeId: props.nodeId, anchorId, anchorIndex, event })
}

const onEndLink = (anchorId: string, anchorIndex: number) => {
	emit('end-link', { nodeId: props.nodeId, anchorId, anchorIndex })
}

const onInputAnchorPointerUp = (anchorId: string, anchorIndex: number, event: PointerEvent) => {
	if (props.isLinking) {
		return
	}
	event.stopPropagation()
	emit('end-link', { nodeId: props.nodeId, anchorId, anchorIndex })
}

const isInputHover = (anchorId: string) => {
	if (!props.hoverInputAnchorId) return false
	return props.hoverInputAnchorId === anchorId
}

const isOutputHover = (anchorId: string) => {
	if (!props.hoverOutputAnchorId) return false
	return props.hoverOutputAnchorId === anchorId
}

const isAnchorCompatible = (anchorId: string, direction: 'in' | 'out') => {
	if (!props.anchorCompatibility) return false
	const key = `${props.nodeId}-${direction}-${anchorId}`
	return props.anchorCompatibility[key] === true
}

const isAnchorIncompatible = (anchorId: string, direction: 'in' | 'out') => {
	if (!props.anchorCompatibility) return false
	const key = `${props.nodeId}-${direction}-${anchorId}`
	return props.anchorCompatibility[key] === false
}
onMounted(() => {
	if (props.autoHeight === false) return
	nextTick(() => {
		setupResizeObserver()
		requestAutoResize()
		setTimeout(requestAutoResize, 100)
		setTimeout(requestAutoResize, 500)
	})
})

watch(
	() => props.sizeCustomized,
	(customized) => {
		if (customized) {
			teardownResizeObserver()
		} else if (props.autoHeight !== false) {
			nextTick(() => {
				setupResizeObserver()
				requestAutoResize()
			})
		}
	}
)

watch(
	() => props.autoHeight,
	(enabled) => {
		if (enabled === false) {
			teardownResizeObserver()
		} else if (!props.sizeCustomized) {
			nextTick(() => {
				setupResizeObserver()
				requestAutoResize()
			})
		}
	}
)

onBeforeUnmount(() => {
	teardownResizeObserver()
})

defineExpose({
	requestAutoResize
})
</script>

<style>
@import '../../styles/square-particles.css';
.wf-node {
	position: absolute;
	border: 1px solid var(--wf-node-border);
	border-radius: 0;
	background-color: color-mix(in srgb, var(--theme-bg-elevated) 70%, transparent);
	box-shadow: var(--wf-node-shadow);
	box-sizing: border-box;
	padding: 8px 10px 10px;
	cursor: default;
	display: flex;
	flex-direction: column;
	z-index: 1;
	overflow: hidden;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	will-change: transform, width, height;
	backface-visibility: hidden;
	transform-style: preserve-3d;
}

.wf-node.selected {
	border-color: var(--wf-node-border-selected);
	box-shadow: var(--wf-node-shadow-selected);
}

.wf-node.is-primary-selected {
	z-index: 10;
}

.wf-node.wf-node-chat-open {
	z-index: 1000;
}

.wf-node-toolbar {
	position: absolute;
	top: -46px;
	left: 50%;
	width: max-content;
	max-width: min(560px, calc(100vw - 40px));
	box-sizing: border-box;
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 4px;
	padding: 5px 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 50%, transparent) !important;
	background-color: color-mix(in srgb, var(--theme-bg-elevated) 75%, transparent) !important;
	backdrop-filter: blur(20px) saturate(160%) !important;
	-webkit-backdrop-filter: blur(20px) saturate(160%) !important;
	border-radius: 2px !important;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary) 20%, transparent),
		0 0 10px color-mix(in srgb, var(--wf-primary) 15%, transparent),
		0 3px 12px color-mix(in srgb, var(--theme-border) 20%, transparent),
		inset 0 1px 0 var(--wf-inner-highlight) !important;
	animation: wf-toolbar-in 160ms ease-out both;
	z-index: 90;
}

/* L-bracket decorations on toolbar */
.wf-node-toolbar::before,
.wf-node-toolbar::after {
	content: '';
	position: absolute;
	pointer-events: none;
	width: 10px;
	height: 10px;
	border: 2px solid var(--wf-primary) !important;
	box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary) 40%, transparent);
}

.wf-node-toolbar::before {
	top: -2px;
	left: -2px;
	border-right: none;
	border-bottom: none;
}

.wf-node-toolbar::after {
	bottom: -2px;
	right: -2px;
	border-left: none;
	border-top: none;
}

.wf-node-btn {
	min-height: 26px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 38%, transparent) !important;
	background: color-mix(in srgb, var(--wf-primary) 10%, transparent) !important;
	color: var(--wf-text) !important;
	border-radius: 2px !important;
	padding: 4px 8px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	white-space: nowrap;
	font-size: 12px;
	line-height: 1;
	transition:
		border-color 180ms ease,
		background 180ms ease,
		color 180ms ease,
		box-shadow 180ms ease;
}

.wf-node-btn:hover {
	border-color: var(--wf-primary) !important;
	background: color-mix(in srgb, var(--wf-primary) 22%, transparent) !important;
	color: var(--wf-primary) !important;
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary) 35%, transparent) !important;
}

.wf-node-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.wf-node-type-menu {
	position: relative;
	display: inline-flex;
}

.wf-node-type-label {
	font-size: 12px;
}

.wf-node-btn-label {
	font-size: 12px;
}

.wf-node-type-caret {
	font-size: 10px;
	margin-left: 2px;
	color: color-mix(in srgb, var(--wf-primary) 65%, transparent);
}

.wf-node-type-dropdown {
	position: absolute;
	top: calc(100% + 6px);
	left: 50%;
	transform: translateX(-50%);
	z-index: 100;
	min-width: 140px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 55%, transparent) !important;
	background: color-mix(in srgb, var(--theme-bg-elevated) 96%, transparent) !important;
	backdrop-filter: blur(14px) saturate(140%);
	-webkit-backdrop-filter: blur(14px) saturate(140%);
	border-radius: 2px !important;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary) 18%, transparent),
		0 0 14px color-mix(in srgb, var(--wf-primary) 22%, transparent),
		var(--wf-popover-shadow) !important;
	padding: 6px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.wf-node-type-item {
	text-align: left;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 38%, transparent) !important;
	background: color-mix(in srgb, var(--wf-primary) 10%, transparent) !important;
	color: var(--wf-text) !important;
	border-radius: 2px !important;
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
	transition:
		border-color 180ms ease,
		background 180ms ease,
		color 180ms ease,
		box-shadow 180ms ease;
}

.wf-node-type-item:hover {
	border-color: var(--wf-primary) !important;
	background: color-mix(in srgb, var(--wf-primary) 22%, transparent) !important;
	color: var(--wf-primary) !important;
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary) 35%, transparent) !important;
}

@keyframes wf-toolbar-in {
	from {
		opacity: 0;
		transform: translateX(-50%) translateY(6px);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}
}

.wf-node-header {
	display: flex;
	flex-direction: column;
	justify-content: flex-start;
	align-items: stretch;
	gap: 6px;
	margin-bottom: 6px;
}

.wf-node-header > .wf-node-title,
.wf-node-header > .wf-node-type {
	display: inline-block;
}

.wf-node-header > .wf-node-title + .wf-node-type {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.wf-node-generation {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 6px 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 40%, transparent);
	border-radius: 6px;
	background: color-mix(in srgb, var(--wf-primary) 10%, transparent);
	font-size: 11px;
	color: var(--wf-text-muted);
	animation: wf-gen-in 160ms ease-out both;
}

.wf-node-generation-running,
.wf-node-generation-submitting {
	border-color: color-mix(in srgb, var(--wf-primary) 50%, transparent);
}

.wf-node-generation-completed {
	border-color: color-mix(in srgb, #2ea44f 50%, transparent);
	background: color-mix(in srgb, #2ea44f 10%, transparent);
}

.wf-node-generation-error {
	border-color: color-mix(in srgb, #e74c3c 60%, transparent);
	background: color-mix(in srgb, #e74c3c 12%, transparent);
	color: color-mix(in srgb, #e74c3c 90%, black);
}

.wf-node-generation-label {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}

.wf-node-generation-status {
	font-weight: 600;
	color: var(--wf-text);
}

.wf-node-generation-text {
	color: var(--wf-text-muted);
	opacity: 0.9;
}

.wf-node-generation-bar {
	width: 100%;
	height: 4px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-border) 60%, transparent);
	overflow: hidden;
}

.wf-node-generation-bar-fill {
	height: 100%;
	background: var(--wf-primary);
	transition: width 180ms ease;
}

.wf-node-generation-completed .wf-node-generation-bar-fill {
	background: #2ea44f;
}

.wf-node-generation-error .wf-node-generation-bar-fill {
	background: #e74c3c;
}

.wf-node-generation-results {
	font-size: 11px;
	color: var(--wf-text-muted);
}

@keyframes wf-gen-in {
	from {
		opacity: 0;
		transform: translateY(-3px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.wf-node-body {
	border: 1px solid var(--wf-border-subtle);
	border-radius: 8px;
	padding: 8px;
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
	align-items: stretch;
	justify-content: flex-start;
	color: var(--wf-text-muted);
	background: var(--wf-surface-base);
	font-size: 12px;
	overflow: auto;
	box-sizing: border-box;
}

.wf-media {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex: 1 1 auto;
	min-height: 0;
}

.wf-media-preview {
	width: 100%;
	flex: 1 1 auto;
	min-height: 200px;
	max-height: 60%;
	border-radius: 6px;
	overflow: hidden;
	border: 1px solid var(--wf-border-subtle);
	background: var(--wf-surface-base);
	position: relative;
}

.wf-media-preview img,
.wf-media-preview video {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-media-empty {
	border: 1px dashed var(--wf-border-subtle);
	border-radius: 6px;
	padding: 10px;
	text-align: center;
	color: var(--wf-text-muted);
	background: var(--wf-surface-base);
}

.wf-media-hint {
	font-size: 12px;
}

.wf-media-sub {
	font-size: 11px;
	margin-top: 4px;
}

.wf-media-actions {
	display: flex;
	gap: 8px;
}

.wf-media-btn {
	border: 1px solid var(--wf-control-border);
	background: var(--wf-control-bg);
	color: var(--wf-text);
	border-radius: 6px;
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
}

.wf-media-btn:hover {
	border-color: var(--wf-control-border-hover);
	background: var(--wf-control-bg-hover);
}

.wf-media-btn.ghost {
	color: var(--wf-text-muted);
}

.wf-file-input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.wf-resize {
	position: absolute;
	width: 12px;
	height: 12px;
	border-radius: 2px;
	background: transparent;
	border: none;
	opacity: 0;
}

.wf-resize-nw {
	top: -6px;
	left: -6px;
	cursor: nwse-resize;
}

.wf-resize-ne {
	top: -6px;
	right: -6px;
	cursor: nesw-resize;
}

.wf-resize-sw {
	bottom: -6px;
	left: -6px;
	cursor: nesw-resize;
}

.wf-resize-se {
	bottom: -6px;
	right: -6px;
	cursor: nwse-resize;
}

.wf-node-title {
	font-size: 13px;
	color: var(--wf-text);
}

.wf-node-type {
	font-size: 11px;
	color: var(--wf-text-muted);
	border: 1px solid var(--wf-border-subtle);
	border-radius: 0;
	padding: 2px 6px;
}

.wf-node-footer {
	font-size: 11px;
	color: var(--wf-text-muted);
	flex-shrink: 0;
	min-height: 0;
}

.wf-node.wf-node-meshy {
	height: auto !important;
	min-height: 470px;
}

.wf-node.wf-node-meshy .wf-node-body {
	overflow: visible;
	align-items: stretch;
	justify-content: flex-start;
	flex: 0 0 auto;
	min-height: auto;
}

.wf-node.wf-node-meshy .wf-node-footer {
	overflow: visible;
}

.wf-node.wf-node-scene-understanding .wf-node-body,
.wf-node.wf-node-scene-layout .wf-node-body,
.wf-node.wf-node-scene-decompose .wf-node-body {
	flex-direction: column;
	align-items: stretch;
	justify-content: flex-start;
	overflow: visible;
}

.wf-node.is-auto-height .wf-node-body {
	overflow: visible;
	align-items: stretch;
	justify-content: flex-start;
	flex: 0 0 auto;
	min-height: auto;
}

.wf-node.is-auto-height .wf-node-footer {
	overflow: visible;
}

.wf-node.is-auto-height.wf-node-text .wf-node-body {
	overflow: hidden;
	align-items: stretch;
	justify-content: flex-start;
	flex-direction: column;
	flex: 1;
	min-height: 0;
}

.wf-node.is-auto-height.wf-node-text-merge .wf-node-body {
	overflow: visible;
	align-items: stretch;
	justify-content: flex-start;
	flex-direction: column;
	flex: 0 0 auto;
	min-height: auto;
}

.wf-node.is-auto-height.wf-node-text .wf-text {
	flex: 1;
	min-height: 0;
	height: 100%;
}

.wf-node.is-auto-height.wf-node-text-merge .wf-merge {
	flex: 0 0 auto;
	min-height: auto;
	height: auto;
}

.wf-node.is-auto-height.wf-node-text .wf-textarea {
	flex: 1;
	min-height: 0;
}

.wf-node.wf-node-text .wf-node-footer {
	display: none;
}

/* Fixed-size (non-auto-height) image/rotate nodes: fill available body space */
.wf-node:not(.is-auto-height).wf-node-image .wf-node-body,
.wf-node:not(.is-auto-height).wf-node-rotate-image .wf-node-body {
	flex-direction: column;
}

.wf-node:not(.is-auto-height).wf-node-image .wf-media {
	flex: 1;
	min-height: 0;
	flex-shrink: 1;
}

.wf-node:not(.is-auto-height).wf-node-image .wf-media-preview {
	flex: 1 1 auto;
	min-height: 0;
}

.wf-node:not(.is-auto-height).wf-node-rotate-image .wf-rotate-wrap {
	flex: 1;
	min-height: 0;
}

.wf-node.wf-node-blender .wf-node-body {
	padding: 0;
	flex-direction: column;
	align-items: stretch;
	justify-content: flex-start;
	overflow: hidden;
	flex: 1;
	min-height: 0;
}

.wf-node.wf-node-blender .wf-node-footer {
	overflow: hidden;
	flex-shrink: 0;
	padding: 0;
}

.wf-node.wf-node-blender .wf-blender-body {
	flex: 1;
	min-height: 0;
	height: 100%;
	overflow: hidden;
}

.wf-node.wf-node-blender .wf-blender-chat-panel {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
}

.wf-node.wf-node-comfyui .wf-node-body {
	overflow: visible;
	align-items: stretch;
	justify-content: flex-start;
	flex-direction: column;
	flex: 0 0 auto;
	min-height: auto;
	padding: 8px;
}

.wf-node.wf-node-comfyui .wf-node-footer {
	overflow: visible;
	flex-shrink: 0;
	padding: 4px 8px 8px;
}

.wf-node.wf-node-text .wf-text,
.wf-node.wf-node-text-merge .wf-merge {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	min-height: 0;
}

.wf-node.wf-node-text .wf-textarea,
.wf-node.wf-node-text-merge .wf-merge-output {
	width: 100%;
	box-sizing: border-box;
	flex: 1;
	min-height: 0;
}

.wf-anchors {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 0;
}

.wf-anchors-in {
	left: 0;
}

.wf-anchors-out {
	right: 0;
}

.wf-anchor-hit {
	--wf-anchor-side-offset: 0px;
	--wf-anchor-base-x: 0px;
	--wf-anchor-hit-size: 44px;
	width: var(--wf-anchor-hit-size);
	height: var(--wf-anchor-hit-size);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 0;
	cursor: crosshair;
	position: absolute;
	background: transparent;
	border: 0;
	touch-action: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	transform: translate(
		calc(var(--wf-anchor-base-x, 0px) + var(--wf-anchor-magnet-x, 0px)),
		calc(-50% + var(--wf-anchor-magnet-y, 0px))
	);
	transition:
		transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
		filter 160ms ease,
		opacity 160ms ease;
}

.wf-anchors-in .wf-anchor-hit {
	left: 0;
	right: auto;
	--wf-anchor-base-x: calc(-50% - var(--wf-anchor-side-offset, 0px));
}

.wf-anchors-out .wf-anchor-hit {
	right: 0;
	left: auto;
	--wf-anchor-base-x: calc(50% + var(--wf-anchor-side-offset, 0px));
}

.wf-anchor-hit::before {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 1;
	width: 10px;
	height: 10px;
	border-radius: 3px;
	background: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	transform: translate(-50%, -50%) rotate(0deg);
	transform-origin: 50% 50%;
	transition:
		transform 360ms cubic-bezier(0.22, 0.8, 0.25, 1.05),
		box-shadow 220ms ease,
		opacity 220ms ease,
		background-color 220ms ease;
}

.wf-anchor-hit::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 0;
	width: 24px;
	height: 24px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.78)) 90%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent),
		var(--wf-anchor-shadow);
	opacity: 0.92;
	transform: translate(-50%, -50%) scale(1) rotate(0deg);
	transform-origin: 50% 50%;
	transition:
		transform 360ms cubic-bezier(0.22, 0.8, 0.25, 1.05),
		opacity 220ms ease,
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.wf-anchor-hit.wf-anchor-resource::before {
	background: var(--dweb-blue);
}

.wf-anchor-hit[data-magnet-phase='armed']::after,
.wf-anchor-hit[data-magnet-phase='dragging']::after {
	opacity: 1;
	transform: translate(-50%, -50%) scale(1.08) rotate(-2deg);
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 72%, transparent);
	box-shadow:
		0 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 14px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.wf-anchor-hit[data-magnet-phase='snapped']::after {
	opacity: 1;
	transform: translate(-50%, -50%) scale(1.18) rotate(0deg);
	border-color: var(--wf-primary, #1f9d84);
	box-shadow:
		0 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent),
		0 0 22px var(--wf-primary, #1f9d84);
}

.wf-anchor-hit[data-magnet-phase='armed']::before {
	transform: translate(-50%, -50%) scale(1.08) rotate(15deg);
}

.wf-anchor-hit[data-magnet-phase='snapped']::before {
	transform: translate(-50%, -50%) scale(1.2) rotate(90deg);
	box-shadow:
		0 0 0 2px var(--wf-primary, #1f9d84),
		0 0 14px var(--wf-primary, #1f9d84);
	animation: wf-anchor-snap-glow 0.6s cubic-bezier(0.22, 0.8, 0.25, 1.05);
}

.wf-anchor-hit[data-magnet-phase='dragging']::before {
	transform: translate(-50%, -50%) scale(1.14) rotate(45deg);
	box-shadow:
		0 0 0 1px var(--wf-anchor-ring),
		0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	animation: wf-anchor-drag-pulse 0.9s cubic-bezier(0.22, 0.8, 0.25, 1.05) infinite;
}

.wf-anchor-hit[data-magnet-phase='dragging']::after {
	transform: translate(-50%, -50%) scale(1.12) rotate(-10deg);
}

.wf-anchor-hit[data-magnet-phase='release']::after {
	opacity: 0.72;
	transform: translate(-50%, -50%) scale(0.96);
}

.wf-anchor-hit[data-magnet-phase='release']::before {
	transform: translate(-50%, -50%) scale(1) rotate(0deg);
}

.wf-anchor-hit:hover::before,
.wf-anchor-hit.hovered::before {
	transform: translate(-50%, -50%) scale(1.08) rotate(3deg);
	box-shadow:
		0 0 0 1px var(--wf-anchor-ring),
		0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.wf-anchor-hit:hover::after,
.wf-anchor-hit.hovered::after {
	transform: translate(-50%, -50%) scale(1.08) rotate(-2deg);
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 54%, transparent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

@keyframes wf-anchor-drag-pulse {
	0% {
		transform: translate(-50%, -50%) scale(1.14) rotate(30deg);
		opacity: 0.85;
	}
	50% {
		transform: translate(-50%, -50%) scale(1.2) rotate(60deg);
		opacity: 1;
	}
	100% {
		transform: translate(-50%, -50%) scale(1.14) rotate(90deg);
		opacity: 0.85;
	}
}

@keyframes wf-anchor-snap-glow {
	0% {
		transform: translate(-50%, -50%) scale(1.3) rotate(120deg);
		box-shadow: 0 0 0 2px var(--wf-primary, #1f9d84);
	}
	40% {
		transform: translate(-50%, -50%) scale(1.22) rotate(95deg);
		box-shadow:
			0 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent),
			0 0 14px var(--wf-primary, #1f9d84);
	}
	100% {
		transform: translate(-50%, -50%) scale(1.18) rotate(90deg);
		box-shadow:
			0 0 0 2px var(--wf-primary, #1f9d84),
			0 0 14px var(--wf-primary, #1f9d84);
	}
}

@media (prefers-reduced-motion: reduce) {
	.wf-anchor-hit::before,
	.wf-anchor-hit::after {
		transition: none !important;
		animation: none !important;
	}
}

.wf-node-task-running {
	animation: wf-node-breath 2s ease-in-out infinite;
	border-color: color-mix(in srgb, var(--wf-primary) 60%, transparent) !important;
	box-shadow:
		0 0 12px color-mix(in srgb, var(--wf-primary) 30%, transparent),
		0 0 28px color-mix(in srgb, var(--wf-primary) 15%, transparent) !important;
}

.wf-node-task-success {
	animation: wf-node-success-flash 0.8s ease-out;
	border-color: color-mix(in srgb, #2ea44f 65%, transparent) !important;
	box-shadow:
		0 0 12px color-mix(in srgb, #2ea44f 30%, transparent),
		0 0 24px color-mix(in srgb, #2ea44f 15%, transparent) !important;
}

.wf-node-task-error {
	border-color: color-mix(in srgb, #e74c3c 65%, transparent) !important;
	box-shadow:
		0 0 12px color-mix(in srgb, #e74c3c 30%, transparent),
		0 0 24px color-mix(in srgb, #e74c3c 15%, transparent) !important;
	animation: wf-node-error-pulse 1.4s ease-in-out infinite;
}

@keyframes wf-node-breath {
	0%,
	100% {
		border-color: color-mix(in srgb, var(--wf-primary) 40%, transparent);
		box-shadow:
			0 0 6px color-mix(in srgb, var(--wf-primary) 15%, transparent),
			0 0 14px color-mix(in srgb, var(--wf-primary) 8%, transparent);
	}
	50% {
		border-color: color-mix(in srgb, var(--wf-primary) 80%, transparent);
		box-shadow:
			0 0 16px color-mix(in srgb, var(--wf-primary) 40%, transparent),
			0 0 36px color-mix(in srgb, var(--wf-primary) 20%, transparent);
	}
}

@keyframes wf-node-success-flash {
	0% {
		border-color: #2ea44f !important;
		box-shadow:
			0 0 24px color-mix(in srgb, #2ea44f 60%, transparent),
			0 0 48px color-mix(in srgb, #2ea44f 30%, transparent) !important;
	}
	100% {
		border-color: color-mix(in srgb, #2ea44f 65%, transparent) !important;
		box-shadow:
			0 0 12px color-mix(in srgb, #2ea44f 30%, transparent),
			0 0 24px color-mix(in srgb, #2ea44f 15%, transparent) !important;
	}
}

@keyframes wf-node-error-pulse {
	0%,
	100% {
		border-color: color-mix(in srgb, #e74c3c 50%, transparent);
		box-shadow:
			0 0 6px color-mix(in srgb, #e74c3c 15%, transparent),
			0 0 14px color-mix(in srgb, #e74c3c 8%, transparent);
	}
	50% {
		border-color: color-mix(in srgb, #e74c3c 90%, transparent);
		box-shadow:
			0 0 18px color-mix(in srgb, #e74c3c 45%, transparent),
			0 0 36px color-mix(in srgb, #e74c3c 22%, transparent);
	}
}
</style>
