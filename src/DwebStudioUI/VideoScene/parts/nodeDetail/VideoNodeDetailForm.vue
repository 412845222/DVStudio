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

			<div class="vs-group">
				<div class="vs-group-title">通用</div>
				<div class="vs-grid">
					<label class="vs-row">
						<span class="vs-k">X</span>
						<input
							v-model.number="draft.x"
							class="vs-input vs-scrub"
							type="number"
							step="1"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.x, (v) => (draft.x = v), { step: 1, min: -999999, max: 999999, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">Y</span>
						<input
							v-model.number="draft.y"
							class="vs-input vs-scrub"
							type="number"
							step="1"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.y, (v) => (draft.y = v), { step: 1, min: -999999, max: 999999, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">宽</span>
						<input
							v-model.number="draft.width"
							class="vs-input vs-scrub"
							type="number"
							min="1"
							step="1"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.width, (v) => (draft.width = v), { step: 1, min: 1, max: 999999, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">高</span>
						<input
							v-model.number="draft.height"
							class="vs-input vs-scrub"
							type="number"
							min="1"
							step="1"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.height, (v) => (draft.height = v), { step: 1, min: 1, max: 999999, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">旋转</span>
						<input
							v-model.number="draft.rotation"
							class="vs-input vs-scrub"
							type="number"
							step="0.01"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.rotation, (v) => (draft.rotation = v), { step: 0.01, min: -999999, max: 999999, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">透明</span>
						<input
							v-model.number="draft.opacity"
							class="vs-input vs-scrub"
							type="number"
							min="0"
							max="1"
							step="0.01"
							@change="applyTransform"
							@dblclick.stop="onNumberInputDblClick"
							@focus="onNumberInputFocus"
							@blur="onNumberInputBlur"
							@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.opacity, (v) => (draft.opacity = v), { step: 0.01, min: 0, max: 1, onCommit: applyTransform })"
						/>
					</label>
					<label class="vs-row">
						<span class="vs-k">快捷</span>
						<div class="vs-quick">
							<button class="vs-quick-btn" type="button" title="靠左" @click="applyQuick('left')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16H3V4h2zm16 3v2H9V7h12zm0 8v2H9v-2h12z" /></svg>
							</button>
							<button class="vs-quick-btn" type="button" title="靠右" @click="applyQuick('right')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4v16h-2V4h2zM15 7v2H3V7h12zm0 8v2H3v-2h12z" /></svg>
							</button>
							<button class="vs-quick-btn" type="button" title="水平居中" @click="applyQuick('hcenter')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3h1v18h-1V3zm8 6v2H4V9h16zm0 4v2H4v-2h16z" /></svg>
							</button>
							<button class="vs-quick-btn" type="button" title="垂直居中" @click="applyQuick('vcenter')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18v1H3v-1zM8 4h8v6H8V4zm0 10h8v6H8v-6z" /></svg>
							</button>
							<button class="vs-quick-btn" type="button" title="宽度填充" @click="applyQuick('fillW')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h2v12H4V6zm14 0h2v12h-2V6zM7 9h10v6H7V9z" /></svg>
							</button>
							<button class="vs-quick-btn" type="button" title="高度填充" @click="applyQuick('fillH')">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v2H6V4zm0 14h12v2H6v-2zM9 7h6v10H9V7z" /></svg>
							</button>
						</div>
					</label>
				</div>
			</div>

			<div v-if="draft.type === 'rect'" class="vs-group">
				<div class="vs-group-title">矩形</div>
				<label class="vs-row">
					<span class="vs-k">填充</span>
					<input v-model="draft.fillColor" class="vs-input" type="text" placeholder="#3aa1ff" @change="applyProps('rect')" />
					<input v-model="draft.fillColor" class="vs-color" type="color" @input="applyProps('rect')" />
					<input
						v-model.number="draft.fillOpacity"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						max="1"
						step="0.01"
						@change="applyProps('rect')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.fillOpacity, (v) => (draft.fillOpacity = v), { step: 0.01, min: 0, max: 1, onCommit: () => applyProps('rect') })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">边框色</span>
					<input v-model="draft.borderColor" class="vs-input" type="text" placeholder="#9cdcfe" @change="applyProps('rect')" />
					<input v-model="draft.borderColor" class="vs-color" type="color" @input="applyProps('rect')" />
					<input
						v-model.number="draft.borderOpacity"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						max="1"
						step="0.01"
						@change="applyProps('rect')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.borderOpacity, (v) => (draft.borderOpacity = v), { step: 0.01, min: 0, max: 1, onCommit: () => applyProps('rect') })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">边框宽</span>
					<input
						v-model.number="draft.borderWidth"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="applyProps('rect')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.borderWidth, (v) => (draft.borderWidth = v), { step: 1, min: 0, max: 999999, onCommit: () => applyProps('rect') })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">圆角</span>
					<input
						v-model.number="draft.cornerRadius"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="applyProps('rect')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.cornerRadius, (v) => (draft.cornerRadius = v), { step: 1, min: 0, max: 999999, onCommit: () => applyProps('rect') })"
					/>
				</label>
			</div>

			<div v-else-if="draft.type === 'text'" class="vs-group">
				<div class="vs-group-title">文本</div>
				<label class="vs-row">
					<span class="vs-k">内容</span>
					<textarea v-model="draft.textContent" class="vs-input vs-textarea wide" rows="4" @change="applyProps('text')" />
				</label>
				<label class="vs-row">
					<span class="vs-k">字号</span>
					<input
						v-model.number="draft.fontSize"
						class="vs-input vs-scrub"
						type="number"
						min="1"
						step="1"
						@change="applyProps('text')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.fontSize, (v) => (draft.fontSize = v), { step: 1, min: 1, max: 999999, onCommit: () => applyProps('text') })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">颜色</span>
					<input v-model="draft.fontColor" class="vs-input" type="text" placeholder="#ffffff" @change="applyProps('text')" />
					<input v-model="draft.fontColor" class="vs-color" type="color" @input="applyProps('text')" />
				</label>
				<label class="vs-row">
					<span class="vs-k">样式</span>
					<input v-model="draft.fontStyle" class="vs-input" type="text" placeholder="normal" @change="applyProps('text')" />
				</label>
			</div>

			<div v-else-if="draft.type === 'image'" class="vs-group">
				<div class="vs-group-title">图片</div>
				<label class="vs-row">
					<span class="vs-k">路径</span>
					<input v-model="draft.imagePath" class="vs-input wide" type="text" @change="applyProps('image')" />
				</label>
				<label class="vs-row">
					<span class="vs-k">缩放</span>
					<input
						v-model.number="draft.scale"
						class="vs-input vs-scrub"
						type="number"
						min="0.01"
						step="0.01"
						@change="applyProps('image')"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.scale, (v) => (draft.scale = v), { step: 0.01, min: 0.01, max: 999999, onCommit: () => applyProps('image') })"
					/>
				</label>
			</div>
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState, type VideoSceneTreeNode, type VideoSceneUserNodeType } from '../../../../store/videoscene'
import { VideoStudioKey, type VideoStudioState } from '../../../../store/videostudio'

defineOptions({ name: 'VideoNodeDetailForm' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

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
	imagePath: '',
	scale: 1,
})

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
	draft.imagePath = p.imagePath ?? draft.imagePath
	draft.scale = Number(p.scale ?? draft.scale)
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
			scale: p.scale,
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
	store.dispatch('updateNodeProps', { layerId: s.layerId, nodeId: s.node.id, patch: { imagePath: draft.imagePath, scale: draft.scale } })
}

type NumberScrubOptions = {
	step: number
	min: number
	max: number
	onCommit: () => void
}

let scrubCleanup: (() => void) | null = null
const onNumberScrubPointerDown = (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => {
	// 仅左键拖拽，且不干扰正在输入/选中文本
	if (e.button !== 0) return
	const target = e.currentTarget as HTMLInputElement | null
	if (!target) return
	if (document.activeElement === target) return
	if (target.dataset.vsEdit === '1') return

	e.preventDefault()

	const startX = e.clientX
	const startVal = Number(get()) || 0
	let latestVal = startVal
	let rafId = 0

	const commit = () => {
		opt.onCommit()
	}
	const scheduleCommit = () => {
		if (rafId) return
		rafId = requestAnimationFrame(() => {
			rafId = 0
			commit()
		})
	}

	const normalize = (v: number) => {
		if (Number.isNaN(v) || !Number.isFinite(v)) return startVal
		const clamped = Math.max(opt.min, Math.min(opt.max, v))
		// 避免浮点抖动
		const stepDigits = String(opt.step).includes('.') ? String(opt.step).split('.')[1].length : 0
		return Number(clamped.toFixed(Math.min(6, stepDigits + 2)))
	}

	const onMove = (ev: PointerEvent) => {
		const dx = ev.clientX - startX
		// 让拖拽更“像 VSCode”的细腻感：每 10px 约等于 1 个 step
		const delta = dx * opt.step * 0.1
		latestVal = normalize(startVal + delta)
		set(latestVal)
		scheduleCommit()
	}

	const onUp = () => {
		if (scrubCleanup) {
			scrubCleanup()
			scrubCleanup = null
		}
		if (rafId) {
			cancelAnimationFrame(rafId)
			rafId = 0
		}
		// 释放时再提交一次，确保最终值落盘
		set(latestVal)
		commit()
	}

	window.addEventListener('pointermove', onMove, { passive: true })
	window.addEventListener('pointerup', onUp, { passive: true, once: true })
	scrubCleanup = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
	}
}

const onNumberInputDblClick = (e: MouseEvent) => {
	const target = e.currentTarget as HTMLInputElement | null
	if (!target) return
	target.dataset.vsEdit = '1'
	target.focus()
	try {
		target.select?.()
	} catch {
		// ignore
	}
}

const onNumberInputFocus = (e: FocusEvent) => {
	const target = e.currentTarget as HTMLInputElement | null
	if (!target) return
	// 允许键盘编辑（包括 Tab 进入焦点）
	target.dataset.vsEdit = '1'
}

const onNumberInputBlur = (e: FocusEvent) => {
	const target = e.currentTarget as HTMLInputElement | null
	if (!target) return
	// 失焦后回到“默认拖拽调值”模式
	delete target.dataset.vsEdit
}

onBeforeUnmount(() => {
	if (scrubCleanup) scrubCleanup()
})
</script>

<style scoped>
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
</style>