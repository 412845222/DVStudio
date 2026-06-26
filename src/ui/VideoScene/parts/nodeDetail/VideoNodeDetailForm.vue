<template>
	<div class="vs-detail">
		<div class="vs-detail-header">节点属性</div>
		<div v-if="!selected" class="vs-empty">未选中节点</div>
		<form v-else class="vs-form" @submit.prevent>
			<label class="vs-row">
				<span class="vs-k">名称</span>
				<input v-model="draft.name" class="vs-input wide" type="text" @change="applyName" />
			</label>

			<label class="vs-row">
				<span class="vs-k">类型</span>
				<select v-model="draft.type" class="vs-input" @change="applyType">
					<option value="base">基础</option>
					<option value="rect">矩形</option>
					<option value="text">文本</option>
					<option value="image">图片</option>
					<option value="line">线条</option>
				</select>
			</label>

			<CommonTransformForm
				:draft="draft"
				:applyTransform="applyTransform"
				:applyQuick="applyQuick"
				:onNumberScrubPointerDown="onNumberScrubPointerDown"
				:onNumberInputDblClick="onNumberInputDblClick"
				:onNumberInputFocus="onNumberInputFocus"
				:onNumberInputBlur="onNumberInputBlur"
			/>

			<RectNodeForm
				v-if="draft.type === 'rect'"
				:draft="draft"
				:applyRect="() => applyProps('rect')"
				:onNumberScrubPointerDown="onNumberScrubPointerDown"
				:onNumberInputDblClick="onNumberInputDblClick"
				:onNumberInputFocus="onNumberInputFocus"
				:onNumberInputBlur="onNumberInputBlur"
			/>

			<TextNodeForm
				v-else-if="draft.type === 'text'"
				:draft="draft"
				:applyText="() => applyProps('text')"
				:applyTextToAllFrames="applyTextToAllFrames"
				:onNumberScrubPointerDown="onNumberScrubPointerDown"
				:onNumberInputDblClick="onNumberInputDblClick"
				:onNumberInputFocus="onNumberInputFocus"
				:onNumberInputBlur="onNumberInputBlur"
			/>

			<ImageNodeForm
				v-else-if="draft.type === 'image'"
				:draft="draft"
				:currentImageUrl="currentImageUrl"
				@pick-file="onPickNodeImageFile"
				@set-fit="setImageFit"
			/>

			<LineNodeForm
				v-else-if="draft.type === 'line'"
				:draft="draft"
				:applyLine="applyLine"
				:onNumberScrubPointerDown="onNumberScrubPointerDown"
				:onNumberInputDblClick="onNumberInputDblClick"
				:onNumberInputFocus="onNumberInputFocus"
				:onNumberInputBlur="onNumberInputBlur"
			/>

			<NodeFiltersForm :layerId="selected.layerId" :nodeId="selected.node.id" :filters="filters" />
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useStore } from 'vuex'
import {
	VideoSceneKey,
	type VideoSceneState,
	type VideoSceneTreeNode,
	type VideoSceneUserNodeType
} from '../../../../store/videoscene'
import { TimelineStore } from '../../../../store/timeline'
import { VideoStudioKey, type VideoStudioState } from '../../../../store/videostudio'
import type {
	VideoSceneImageAsset,
	VideoSceneNodeTransform,
	VideoSceneNodeProps
} from '../../../../core/scene/types'
import { isNumber, isString } from '../../../../types/utils'
import CommonTransformForm from './forms/CommonTransformForm.vue'
import ImageNodeForm from './forms/ImageNodeForm.vue'
import LineNodeForm from './forms/LineNodeForm.vue'
import NodeFiltersForm from './forms/NodeFiltersForm.vue'
import RectNodeForm from './forms/RectNodeForm.vue'
import TextNodeForm from './forms/TextNodeForm.vue'
import { useNumberScrub } from './forms/useNumberScrub'

defineOptions({ name: 'VideoNodeDetailForm' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

type TextAlign = 'left' | 'center' | 'right'
type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
type LineStyle = 'solid' | 'dashed'

type NodeDraft = {
	name: string
	type: VideoSceneUserNodeType
	x: number
	y: number
	scaleX: number
	scaleY: number
	width: number
	height: number
	rotation: number
	opacity: number
	pivotX: number
	pivotY: number
	fillColor: string
	fillOpacity: number
	borderColor: string
	borderOpacity: number
	borderWidth: number
	cornerRadius: number
	textContent: string
	fontSize: number
	fontColor: string
	fontStyle: string
	textAlign: TextAlign
	imageId: string
	imagePath: string
	imageName: string
	imageFit: ImageFit
	startX: number
	startY: number
	endX: number
	endY: number
	anchorX: number
	anchorY: number
	lineColor: string
	lineWidth: number
	lineStyle: LineStyle
}

const { onNumberScrubPointerDown, onNumberInputDblClick, onNumberInputFocus, onNumberInputBlur } =
	useNumberScrub()

type SelectedInfo = { layerId: string; node: VideoSceneTreeNode; parent: VideoSceneTreeNode | null }

const findSelected = (): SelectedInfo | null => {
	const nodeId = store.state.selectedNodeId
	if (!nodeId) return null
	for (const layer of store.state.layers) {
		const stack: Array<{ node: VideoSceneTreeNode; parent: VideoSceneTreeNode | null }> =
			layer.nodeTree.map((n) => ({ node: n, parent: null }))
		while (stack.length) {
			const it = stack.shift()!
			const n = it.node
			if (n.id === nodeId) return { layerId: layer.id, node: n, parent: it.parent }
			if (n.children?.length) stack.unshift(...n.children.map((c) => ({ node: c, parent: n })))
		}
	}
	return null
}

const selected = computed(() => findSelected())

const draft = reactive<NodeDraft>({
	name: '',
	type: 'base',
	x: 0,
	y: 0,
	scaleX: 1,
	scaleY: 1,
	width: 200,
	height: 120,
	rotation: 0,
	opacity: 1,
	pivotX: 0.5,
	pivotY: 0.5,
	fillColor: '#3aa1ff',
	fillOpacity: 1,
	borderColor: '#9cdcfe',
	borderOpacity: 1,
	borderWidth: 2,
	cornerRadius: 0,
	textContent: 'Text',
	fontSize: 24,
	fontColor: '#ffffff',
	fontStyle: 'normal',
	textAlign: 'center',
	imageId: '',
	imagePath: '',
	imageName: '',
	imageFit: 'contain',
	startX: -88,
	startY: 0,
	endX: 88,
	endY: 0,
	anchorX: 0,
	anchorY: -30,
	lineColor: '#ffffff',
	lineWidth: 4,
	lineStyle: 'solid'
})

const getNumberFromProps = (
	props: VideoSceneNodeProps | undefined,
	key: string,
	fallback: number
): number => {
	if (!props) return fallback
	const v = props[key]
	if (isNumber(v)) return v
	return fallback
}

const getStringFromProps = (
	props: VideoSceneNodeProps | undefined,
	key: string,
	fallback: string
): string => {
	if (!props) return fallback
	const v = props[key]
	if (isString(v)) return v
	return fallback
}

const getTextAlign = (props: VideoSceneNodeProps | undefined, fallback: TextAlign): TextAlign => {
	if (!props) return fallback
	const v = props.textAlign
	if (v === 'left' || v === 'right' || v === 'center') return v
	return fallback
}

const getImageFit = (props: VideoSceneNodeProps | undefined, fallback: ImageFit): ImageFit => {
	if (!props) return fallback
	const v = props.imageFit
	if (v === 'contain' || v === 'cover' || v === 'fill' || v === 'none' || v === 'scale-down')
		return v
	return fallback
}

const getLineStyle = (props: VideoSceneNodeProps | undefined, fallback: LineStyle): LineStyle => {
	if (!props) return fallback
	const v = props.lineStyle
	return v === 'dashed' ? 'dashed' : fallback
}

const currentImageUrl = computed(() => {
	const id = String(draft.imageId || '').trim()
	if (id) {
		const asset: VideoSceneImageAsset | undefined = store.state.imageAssets[id]
		const u = String(asset?.url ?? '').trim()
		if (u) return u
	}
	return String(draft.imagePath || '').trim()
})

const genImageAssetId = () =>
	`img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const onPickNodeImageFile = (file: File) => {
	const url = URL.createObjectURL(file)
	const id = genImageAssetId()

	store.dispatch('upsertImageAsset', { id, url, name: file.name })
	draft.imageId = id
	draft.imagePath = url
	draft.imageName = file.name
	applyProps('image')
}

const setImageFit = (fit: ImageFit) => {
	draft.imageFit = fit
	applyProps('image')
}

const syncFromStore = () => {
	const s = selected.value
	if (!s) return
	const radToDeg = (rad: number) => (Number.isFinite(rad) ? (rad * 180) / Math.PI : 0)
	const clampScale = (v: unknown, fallback = 1) => {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(100, n))
	}
	const getPivot = (v: unknown, fallback: number): number => {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(1, n))
	}
	const getUnitInterval = (v: unknown, fallback: number): number => {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(1, n))
	}
	const n = s.node
	draft.name = n.name ?? ''
	draft.type = n.category === 'user' ? (n.userType ?? 'base') : 'base'
	const t: VideoSceneNodeTransform = n.transform ?? {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		width: 200,
		height: 120,
		rotation: 0,
		opacity: 1,
		pivotX: 0.5,
		pivotY: 0.5
	}
	const legacyScale = clampScale(t.scale, 1)
	draft.x = Number(t.x ?? 0)
	draft.y = Number(t.y ?? 0)
	draft.scaleX = clampScale(t.scaleX, legacyScale)
	draft.scaleY = clampScale(t.scaleY, legacyScale)
	draft.width = Number(t.width ?? 200)
	draft.height = Number(t.height ?? 120)
	draft.rotation = radToDeg(Number(t.rotation ?? 0))
	draft.opacity = Number(t.opacity ?? 1)
	draft.pivotX = getPivot(t.pivotX, 0.5)
	draft.pivotY = getPivot(t.pivotY, 0.5)
	const p: VideoSceneNodeProps = n.props ?? {}
	draft.fillColor = getStringFromProps(p, 'fillColor', draft.fillColor)
	draft.fillOpacity = getUnitInterval(p.fillOpacity, draft.fillOpacity)
	draft.borderColor = getStringFromProps(p, 'borderColor', draft.borderColor)
	draft.borderOpacity = getUnitInterval(p.borderOpacity, draft.borderOpacity)
	draft.borderWidth = getNumberFromProps(p, 'borderWidth', draft.borderWidth)
	draft.cornerRadius = getNumberFromProps(p, 'cornerRadius', draft.cornerRadius)
	draft.textContent = getStringFromProps(p, 'textContent', draft.textContent)
	draft.fontSize = getNumberFromProps(p, 'fontSize', draft.fontSize)
	draft.fontColor = getStringFromProps(p, 'fontColor', draft.fontColor)
	draft.fontStyle = getStringFromProps(p, 'fontStyle', draft.fontStyle)
	draft.textAlign = getTextAlign(p, draft.textAlign)
	draft.imageId = getStringFromProps(p, 'imageId', draft.imageId)
	const fromAsset: VideoSceneImageAsset | undefined = draft.imageId
		? store.state.imageAssets[draft.imageId]
		: undefined
	const assetUrl = String(fromAsset?.url ?? '').trim()
	const assetName = String(fromAsset?.name ?? '').trim()
	draft.imagePath = assetUrl || getStringFromProps(p, 'imagePath', '').trim()
	draft.imageName = assetName || getStringFromProps(p, 'imageName', '').trim()
	draft.imageFit = getImageFit(p, draft.imageFit)
	draft.startX = getNumberFromProps(p, 'startX', draft.startX)
	draft.startY = getNumberFromProps(p, 'startY', draft.startY)
	draft.endX = getNumberFromProps(p, 'endX', draft.endX)
	draft.endY = getNumberFromProps(p, 'endY', draft.endY)
	draft.anchorX = getNumberFromProps(p, 'anchorX', draft.anchorX)
	draft.anchorY = getNumberFromProps(p, 'anchorY', draft.anchorY)
	draft.lineColor = getStringFromProps(p, 'lineColor', draft.lineColor)
	draft.lineWidth = Math.max(1, getNumberFromProps(p, 'lineWidth', draft.lineWidth))
	draft.lineStyle = getLineStyle(p, draft.lineStyle)
}

watch(
	() => store.state.selectedNodeId,
	() => syncFromStore(),
	{ immediate: true }
)

watch(
	() => {
		const s = selected.value
		if (!s) return ''
		const n = s.node
		const t: VideoSceneNodeTransform = n.transform ?? {
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			width: 200,
			height: 120,
			rotation: 0,
			opacity: 1,
			pivotX: 0.5,
			pivotY: 0.5
		}
		const p: VideoSceneNodeProps = n.props ?? {}
		return JSON.stringify({
			id: n.id,
			name: n.name ?? '',
			type: n.userType ?? 'base',
			x: t.x ?? 0,
			y: t.y ?? 0,
			scaleX: t.scaleX ?? t.scale ?? 1,
			scaleY: t.scaleY ?? t.scale ?? 1,
			scale: t.scale ?? 1,
			width: t.width ?? 200,
			height: t.height ?? 120,
			rotation: t.rotation ?? 0,
			opacity: t.opacity ?? 1,
			pivotX: t.pivotX ?? 0.5,
			pivotY: t.pivotY ?? 0.5,
			fillColor: p.fillColor,
			fillOpacity: p.fillOpacity,
			borderColor: p.borderColor,
			borderOpacity: p.borderOpacity,
			borderWidth: p.borderWidth,
			cornerRadius: p.cornerRadius,
			textContent: p.textContent,
			fontSize: p.fontSize,
			fontColor: p.fontColor,
			fontStyle: p.fontStyle,
			textAlign: p.textAlign,
			imagePath: p.imagePath,
			imageFit: p.imageFit,
			imageId: p.imageId,
			imageName: p.imageName,
			startX: p.startX,
			startY: p.startY,
			endX: p.endX,
			endY: p.endY,
			anchorX: p.anchorX,
			anchorY: p.anchorY,
			lineColor: p.lineColor,
			lineWidth: p.lineWidth,
			lineStyle: p.lineStyle
		})
	},
	() => syncFromStore(),
	{ immediate: true }
)

const applyName = () => {
	const s = selected.value
	if (!s) return
	store.dispatch('updateNodeName', { layerId: s.layerId, nodeId: s.node.id, name: draft.name })
}

const applyType = () => {
	const s = selected.value
	if (!s) return
	store.dispatch('setNodeType', { layerId: s.layerId, nodeId: s.node.id, type: draft.type })
	syncFromStore()
}

const applyTransform = () => {
	const s = selected.value
	if (!s) return
	const degToRad = (deg: number) => (Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0)
	const clampScale = (v: unknown, fallback = 1) => {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(100, n))
	}
	store.dispatch('updateNodeTransform', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: {
			x: draft.x,
			y: draft.y,
			scaleX: clampScale(draft.scaleX, 1),
			scaleY: clampScale(draft.scaleY, 1),
			width: draft.width,
			height: draft.height,
			rotation: degToRad(draft.rotation),
			opacity: draft.opacity,
			pivotX: Math.max(0, Math.min(1, Number(draft.pivotX))),
			pivotY: Math.max(0, Math.min(1, Number(draft.pivotY)))
		}
	})
}

type QuickAction = 'left' | 'right' | 'hcenter' | 'vcenter' | 'fillW' | 'fillH'
const applyQuick = (action: QuickAction) => {
	const s = selected.value
	if (!s) return
	const t: VideoSceneNodeTransform = s.node.transform ?? {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		width: 200,
		height: 120,
		rotation: 0,
		opacity: 1,
		pivotX: 0.5,
		pivotY: 0.5
	}
	const parentW = s.parent?.transform?.width ?? studioStore.state.stage.width
	const parentH = s.parent?.transform?.height ?? studioStore.state.stage.height
	const w = Math.max(1, Number(t.width ?? draft.width))
	const h = Math.max(1, Number(t.height ?? draft.height))
	const getPivot = (v: unknown, fallback: number): number => {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(1, n))
	}
	const px = getPivot(t.pivotX, draft.pivotX)
	const py = getPivot(t.pivotY, draft.pivotY)

	let nextX = Number(t.x ?? draft.x)
	let nextY = Number(t.y ?? draft.y)
	let nextW = w
	let nextH = h

	if (action === 'left') nextX = -parentW / 2 + w * px
	if (action === 'right') nextX = parentW / 2 - w * (1 - px)
	if (action === 'hcenter') nextX = -(0.5 - px) * w
	if (action === 'vcenter') nextY = -(0.5 - py) * h
	if (action === 'fillW') {
		nextX = -(0.5 - px) * Math.max(1, Number(parentW) || 1)
		nextW = Math.max(1, Number(parentW) || 1)
	}
	if (action === 'fillH') {
		nextY = -(0.5 - py) * Math.max(1, Number(parentH) || 1)
		nextH = Math.max(1, Number(parentH) || 1)
	}

	draft.x = nextX
	draft.y = nextY
	draft.width = nextW
	draft.height = nextH
	store.dispatch('updateNodeTransform', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: { x: nextX, y: nextY, width: nextW, height: nextH }
	})
}

const applyProps = (kind: 'rect' | 'text' | 'image' | 'line') => {
	const s = selected.value
	if (!s) return
	if (kind === 'rect') {
		store.dispatch('updateNodeProps', {
			layerId: s.layerId,
			nodeId: s.node.id,
			patch: {
				fillColor: draft.fillColor,
				fillOpacity: draft.fillOpacity,
				borderColor: draft.borderColor,
				borderOpacity: draft.borderOpacity,
				borderWidth: draft.borderWidth,
				cornerRadius: draft.cornerRadius
			}
		})
		return
	}
	if (kind === 'text') {
		store.dispatch('updateNodeProps', {
			layerId: s.layerId,
			nodeId: s.node.id,
			patch: {
				textContent: draft.textContent,
				fontSize: draft.fontSize,
				fontColor: draft.fontColor,
				fontStyle: draft.fontStyle,
				textAlign: draft.textAlign
			}
		})
		return
	}
	if (kind === 'line') {
		store.dispatch('updateNodeProps', {
			layerId: s.layerId,
			nodeId: s.node.id,
			patch: {
				startX: draft.startX,
				startY: draft.startY,
				endX: draft.endX,
				endY: draft.endY,
				anchorX: draft.anchorX,
				anchorY: draft.anchorY,
				lineColor: draft.lineColor,
				lineWidth: draft.lineWidth,
				lineStyle: draft.lineStyle
			}
		})
		return
	}
	store.dispatch('updateNodeProps', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: {
			imageId: draft.imageId,
			imagePath: draft.imagePath,
			imageFit: draft.imageFit,
			imageName: draft.imageName
		}
	})
}

const applyLine = () => applyProps('line')

const applyTextToAllFrames = () => {
	const s = selected.value
	if (!s || draft.type !== 'text') return
	store.dispatch('updateNodeProps', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: {
			textContent: draft.textContent
		}
	})
	TimelineStore.dispatch('applyNodeTextContentAcrossKeyframes', {
		layerId: s.layerId,
		nodeId: s.node.id,
		textContent: draft.textContent
	})
}

const filters = computed(() => {
	const s = selected.value
	if (!s) return []
	const p: VideoSceneNodeProps = s.node.props ?? {}
	const filtersVal = p.filters
	return Array.isArray(filtersVal) ? filtersVal : []
})
</script>

<style>
.vs-detail {
	padding: 10px;
	color: var(--vscode-fg);
	font-size: 12px;
}

.vs-detail-header {
	height: 26px;
	display: flex;
	align-items: center;
	margin-bottom: 8px;
	color: var(--vscode-fg);
}

.vs-empty {
	padding: 10px;
	color: var(--vscode-fg-muted);
}

.vs-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.vs-group {
	padding-top: 6px;
	border-top: 1px solid var(--vscode-border);
}

.vs-group-title {
	margin-bottom: 6px;
	color: var(--vscode-fg-muted);
}

.vs-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 8px;
}

.vs-row {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 8px;
	min-width: 0;
	max-width: 100%;
}

.vs-k {
	width: 48px;
	color: var(--vscode-fg-muted);
	flex: 0 0 auto;
}

.vs-image-pick {
	display: flex;
	gap: 10px;
	align-items: center;
	flex: 1;
	min-width: 0;
}

.vs-image-preview {
	width: 56px;
	height: 56px;
	border-radius: 10px;
	border: 1px solid var(--vscode-border);
	overflow: hidden;
	background: var(--dweb-defualt);
	flex: 0 0 auto;
}

.vs-image-preview img {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.vs-image-meta {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	flex: 1;
}

.vs-image-name {
	font-size: 12px;
	color: var(--vscode-fg);
	opacity: 0.9;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vs-hidden-input {
	display: none;
}

.vs-input {
	flex: 1 1 0;
	min-width: 0;
	max-width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	outline: none;
}

.vs-input.wide {
	max-width: 100%;
}

.vs-input:focus {
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-scrub {
	cursor: ew-resize;
}

.vs-scrub:focus {
	cursor: text;
}

.vs-textarea {
	resize: vertical;
	min-height: 72px;
	line-height: 18px;
	white-space: pre-wrap;
}

.vs-color {
	flex: 0 0 auto;
	width: 28px;
	height: 26px;
	padding: 0;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: transparent;
	box-sizing: border-box;
}

.vs-color:focus {
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-quick {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
	flex: 1 1 0;
	min-width: 0;
}

.vs-quick-btn {
	width: 28px;
	height: 26px;
	padding: 0;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.vs-quick-btn:hover {
	border-color: var(--vscode-border-accent);
}

.vs-quick-btn.active {
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-quick-btn:focus {
	outline: none;
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-quick-btn svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
	opacity: 0.9;
}

.vs-filter-title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	position: relative;
}

.vs-filter-title-actions {
	flex: 0 0 auto;
}

.vs-filter-menu {
	position: absolute;
	right: 0;
	top: 24px;
	min-width: 140px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	box-shadow: var(--dweb-shadow);
	z-index: 10;
	display: flex;
	flex-direction: column;
}

.vs-filter-menu-item {
	text-align: left;
	padding: 6px 8px;
	border: none;
	background: transparent;
	color: var(--vscode-fg);
	cursor: pointer;
}

.vs-filter-menu-item:hover {
	background: var(--dweb-defualt-dark);
}

.vs-filter-empty {
	padding: 6px 0;
	color: var(--vscode-fg-muted);
}

.vs-filter-item {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.vs-filter-item + .vs-filter-item {
	margin-top: 8px;
}

.vs-filter-item-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vs-filter-item-title {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--vscode-fg);
}

.vs-filter-drag {
	color: var(--vscode-fg-muted);
	cursor: grab;
	user-select: none;
}

.vs-filter-item-actions {
	display: inline-flex;
	gap: 6px;
}

.vs-filter-icon-btn {
	width: 28px;
	height: 26px;
	padding: 0;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
}

.vs-filter-icon-btn:hover {
	border-color: var(--vscode-border-accent);
}

.vs-filter-icon-btn:focus {
	outline: none;
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-filter-item-body {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.vs-filter-shader-actions {
	display: flex;
	justify-content: flex-end;
}

.vs-filter-btn {
	padding: 6px 10px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
}

.vs-filter-btn:hover {
	border-color: var(--vscode-border-accent);
}

.vs-filter-log {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	padding: 8px;
}

.vs-filter-log-pre {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--vscode-fg);
}
</style>
