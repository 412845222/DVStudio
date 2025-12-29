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

			<NodeFiltersForm :layerId="selected.layerId" :nodeId="selected.node.id" :filters="filters" />
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState, type VideoSceneTreeNode, type VideoSceneUserNodeType } from '../../../../store/videoscene'
import { VideoStudioKey, type VideoStudioState } from '../../../../store/videostudio'
import CommonTransformForm from './forms/CommonTransformForm.vue'
import ImageNodeForm from './forms/ImageNodeForm.vue'
import NodeFiltersForm from './forms/NodeFiltersForm.vue'
import RectNodeForm from './forms/RectNodeForm.vue'
import TextNodeForm from './forms/TextNodeForm.vue'
import { useNumberScrub } from './forms/useNumberScrub'

defineOptions({ name: 'VideoNodeDetailForm' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

type VideoNodeFilter = any

const { onNumberScrubPointerDown, onNumberInputDblClick, onNumberInputFocus, onNumberInputBlur } = useNumberScrub()

type SelectedInfo = { layerId: string; node: VideoSceneTreeNode; parent: VideoSceneTreeNode | null }

const findSelected = (): SelectedInfo | null => {
	const nodeId = store.state.selectedNodeId
	if (!nodeId) return null
	for (const layer of store.state.layers) {
		const stack: Array<{ node: VideoSceneTreeNode; parent: VideoSceneTreeNode | null }> = layer.nodeTree.map((n) => ({ node: n, parent: null }))
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

const draft = reactive({
	name: '',
	type: 'base' as VideoSceneUserNodeType,
	x: 0,
	y: 0,
	width: 200,
	height: 120,
	rotation: 0,
	opacity: 1,
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
	imageId: '',
	imagePath: '',
	imageName: '',
	imageFit: 'contain' as 'contain' | 'cover' | 'fill' | 'none' | 'scale-down',
})

const currentImageUrl = computed(() => {
	const id = String(draft.imageId || '').trim()
	if (id) {
		const asset: any = (store.state as any).imageAssets?.[id]
		const u = String(asset?.url ?? '').trim()
		if (u) return u
	}
	return String(draft.imagePath || '').trim()
})

const genImageAssetId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const onPickNodeImageFile = (file: File) => {
	const url = URL.createObjectURL(file)
	const id = genImageAssetId()

	store.dispatch('upsertImageAsset', { id, url, name: file.name })
	draft.imageId = id
	draft.imagePath = url
	draft.imageName = file.name
	applyProps('image')
}

const setImageFit = (fit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down') => {
	draft.imageFit = fit
	applyProps('image')
}

const syncFromStore = () => {
	const s = selected.value
	if (!s) return
	const n = s.node
	draft.name = n.name ?? ''
	draft.type = (n.category === 'user' ? ((n.userType ?? 'base') as any) : 'base')
	const t: any = n.transform ?? { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
	draft.x = Number(t.x ?? 0)
	draft.y = Number(t.y ?? 0)
	draft.width = Number(t.width ?? 200)
	draft.height = Number(t.height ?? 120)
	draft.rotation = Number(t.rotation ?? 0)
	draft.opacity = Number(t.opacity ?? 1)
	const p: any = n.props ?? {}
	draft.fillColor = p.fillColor ?? draft.fillColor
	draft.fillOpacity = Number.isFinite(p.fillOpacity as any) ? Math.max(0, Math.min(1, Number(p.fillOpacity))) : draft.fillOpacity
	draft.borderColor = p.borderColor ?? draft.borderColor
	draft.borderOpacity = Number.isFinite(p.borderOpacity as any) ? Math.max(0, Math.min(1, Number(p.borderOpacity))) : draft.borderOpacity
	draft.borderWidth = Number(p.borderWidth ?? draft.borderWidth)
	draft.cornerRadius = Number(p.cornerRadius ?? draft.cornerRadius)
	draft.textContent = p.textContent ?? draft.textContent
	draft.fontSize = Number(p.fontSize ?? draft.fontSize)
	draft.fontColor = p.fontColor ?? draft.fontColor
	draft.fontStyle = p.fontStyle ?? draft.fontStyle
	draft.imageId = String(p.imageId ?? draft.imageId)
	const fromAsset = draft.imageId ? (store.state as any).imageAssets?.[draft.imageId] : null
	const assetUrl = String(fromAsset?.url ?? '').trim()
	const assetName = String(fromAsset?.name ?? '').trim()
	draft.imagePath = assetUrl || String(p.imagePath ?? '').trim()
	draft.imageName = assetName || String(p.imageName ?? '').trim()
	draft.imageFit = (p.imageFit ?? draft.imageFit) as any
}

watch(
	() => store.state.selectedNodeId,
	() => syncFromStore(),
	{ immediate: true }
)

// 舞台拖拽/缩放会直接更新 store 内节点数据：这里监听选中节点快照变化以同步表单
watch(
	() => {
		const s = selected.value
		if (!s) return ''
		const n: any = s.node as any
		const t: any = n.transform ?? {}
		const p: any = n.props ?? {}
		return JSON.stringify({
			id: n.id,
			name: n.name ?? '',
			type: n.userType ?? 'base',
			x: t.x ?? 0,
			y: t.y ?? 0,
			width: t.width ?? 200,
			height: t.height ?? 120,
			rotation: t.rotation ?? 0,
			opacity: t.opacity ?? 1,
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
			imagePath: p.imagePath,
			imageFit: p.imageFit,
			imageId: p.imageId,
			imageName: p.imageName,
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
	// 类型转换后同步一次，拿到默认 props
	syncFromStore()
}

const applyTransform = () => {
	const s = selected.value
	if (!s) return
	store.dispatch('updateNodeTransform', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: {
			x: draft.x,
			y: draft.y,
			width: draft.width,
			height: draft.height,
			rotation: draft.rotation,
			opacity: draft.opacity,
		},
	})
}

type QuickAction = 'left' | 'right' | 'hcenter' | 'vcenter' | 'fillW' | 'fillH'
const applyQuick = (action: QuickAction) => {
	const s = selected.value
	if (!s) return
	const t: any = s.node.transform ?? { x: 0, y: 0, width: 200, height: 120 }
	const parentW = s.parent?.transform?.width ?? studioStore.state.stage.width
	const parentH = s.parent?.transform?.height ?? studioStore.state.stage.height
	const w = Math.max(1, Number(t.width ?? draft.width))
	const h = Math.max(1, Number(t.height ?? draft.height))

	let nextX = Number(t.x ?? draft.x)
	let nextY = Number(t.y ?? draft.y)
	let nextW = w
	let nextH = h

	if (action === 'left') nextX = -parentW / 2 + w / 2
	if (action === 'right') nextX = parentW / 2 - w / 2
	if (action === 'hcenter') nextX = 0
	if (action === 'vcenter') nextY = 0
	if (action === 'fillW') {
		nextX = 0
		nextW = Math.max(1, Number(parentW) || 1)
	}
	if (action === 'fillH') {
		nextY = 0
		nextH = Math.max(1, Number(parentH) || 1)
	}

	// update local draft immediately
	draft.x = nextX
	draft.y = nextY
	draft.width = nextW
	draft.height = nextH
	store.dispatch('updateNodeTransform', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: { x: nextX, y: nextY, width: nextW, height: nextH },
	})
}

const applyProps = (kind: 'rect' | 'text' | 'image') => {
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
				cornerRadius: draft.cornerRadius,
			},
		})
		return
	}
	if (kind === 'text') {
		store.dispatch('updateNodeProps', { layerId: s.layerId, nodeId: s.node.id, patch: { textContent: draft.textContent, fontSize: draft.fontSize, fontColor: draft.fontColor, fontStyle: draft.fontStyle } })
		return
	}
	store.dispatch('updateNodeProps', {
		layerId: s.layerId,
		nodeId: s.node.id,
		patch: { imageId: draft.imageId, imagePath: draft.imagePath, imageFit: draft.imageFit, imageName: draft.imageName },
	})
}


const filters = computed<VideoNodeFilter[]>(() => {
	const s = selected.value
	if (!s) return []
	const p: any = s.node.props ?? {}
	return Array.isArray(p.filters) ? (p.filters as VideoNodeFilter[]) : []
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