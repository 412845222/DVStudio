<template>
	<div class="vs-subtitle">
		<div class="vs-subtitle-left">
			<div class="vs-subtitle-head">
				<div class="vs-subtitle-title">字幕段落</div>
				<div class="vs-subtitle-meta">{{ cues.length }} 条</div>
				<button v-if="showAiSummaryBtn" class="vs-btn vs-ai-summary-btn" type="button" @click="openAiSummary">AI总结</button>
			</div>
			<div ref="listEl" class="vs-subtitle-list">
				<button
					v-for="(c, i) in cues"
					:key="i"
					class="vs-subtitle-item"
					:class="{ active: i === selectedIndex }"
					type="button"
					@click="select(i)"
				>
					<div class="vs-subtitle-item-top">
						<span class="vs-subtitle-time">{{ cueTimeText(i) }}</span>
						<span v-if="hasOverride(i)" class="vs-subtitle-badge">单独</span>
					</div>
					<div class="vs-subtitle-preview">{{ (c.text || '').trim() || '（空字幕）' }}</div>
				</button>
				<div v-if="!cues.length" class="vs-subtitle-empty">当前图层没有字幕段落</div>
			</div>
		</div>

		<div class="vs-subtitle-right">
			<div class="vs-subtitle-head">
				<div class="vs-subtitle-title">编辑</div>
				<div class="vs-subtitle-meta">图层：{{ layerId || '未选择' }}</div>
			</div>

			<div v-if="!layerId" class="vs-subtitle-empty">请先选择字幕图层</div>
			<div v-else-if="!cues.length" class="vs-subtitle-empty">没有可编辑的字幕段落</div>
			<div v-else class="vs-subtitle-editor">
				<div class="vs-form-row">
					<label class="vs-label">文本</label>
					<textarea v-model="editText" class="vs-textarea" rows="4" @input="scheduleCommitText" />
				</div>

				<div class="vs-form-row">
					<label class="vs-label">样式</label>
					<div class="vs-style-row">
						<select v-model="editFontStyle" class="vs-input" @change="commitStyle('fontStyle', editFontStyle)">
							<option value="normal">normal</option>
							<option value="bold">bold</option>
							<option value="italic">italic</option>
							<option value="bold italic">bold italic</option>
						</select>
						<input v-model.number="editFontSize" class="vs-input" type="number" min="1" step="1" @change="commitStyle('fontSize', editFontSize)" />
						<input v-model="editFontColor" class="vs-input vs-color" type="color" @change="commitStyle('fontColor', editFontColor)" />
						<select v-model="editTextAlign" class="vs-input" @change="commitStyle('textAlign', editTextAlign)">
							<option value="left">left</option>
							<option value="center">center</option>
							<option value="right">right</option>
						</select>
					</div>
				</div>

				<div class="vs-actions">
					<button v-if="!isPerCue" class="vs-btn" type="button" @click="enablePerCue">单独配置</button>
					<button v-else class="vs-btn" type="button" @click="clearPerCue">恢复默认</button>
					<button class="vs-btn" type="button" @click="applyToAll">应用到所有</button>
					<span class="vs-actions-hint">{{ isPerCue ? '当前：仅作用于该条字幕' : '当前：默认样式（作用于所有字幕）' }}</span>
				</div>

				<div class="vs-form-row">
					<label class="vs-label">文本节点</label>
					<div v-if="!boundNodeId" class="vs-subtitle-empty" style="padding: 0">未绑定文本节点</div>
					<div v-else class="vs-node-grid">
						<label class="vs-node-field">
							<span class="vs-node-k">X</span>
							<input v-model.number="nodeX" class="vs-input" type="number" step="1" @change="applyNodeTransform" />
						</label>
						<label class="vs-node-field">
							<span class="vs-node-k">Y</span>
							<input v-model.number="nodeY" class="vs-input" type="number" step="1" @change="applyNodeTransform" />
						</label>
						<label class="vs-node-field">
							<span class="vs-node-k">宽</span>
							<input v-model.number="nodeW" class="vs-input" type="number" min="1" step="1" @change="applyNodeTransform" />
						</label>
						<label class="vs-node-field">
							<span class="vs-node-k">高</span>
							<input v-model.number="nodeH" class="vs-input" type="number" min="1" step="1" @change="applyNodeTransform" />
						</label>
						<label class="vs-node-field">
							<span class="vs-node-k">透明</span>
							<input v-model.number="nodeOpacity" class="vs-input" type="number" min="0" max="1" step="0.01" @change="applyNodeOpacity" />
						</label>
					</div>
				</div>

				<NodeFiltersForm
					v-if="layerId && boundNodeId"
					:layerId="layerId"
					:nodeId="boundNodeId"
					:filters="boundFilters"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DVS_EVENTS, type DvsSubtitleCueSelectDetail } from '../../../core/events/dvsEvents'
import { TimelineStore } from '../../../store/timeline'
import { VideoSceneStore } from '../../../store/videoscene'
import { findLayer, findNode, type VideoSceneNodeTransform } from '../../../core/scene'
import { buildSubtitleGeneratedKeyframes } from '../../../core/subtitle/subtitleKeyframes'
import NodeFiltersForm from '../parts/nodeDetail/forms/NodeFiltersForm.vue'

const props = defineProps<{ layerId: string | null }>()

const cues = computed(() => (props.layerId ? (TimelineStore.state.subtitleCuesByLayer?.[props.layerId] ?? []) : []))
const cueRanges = computed(() => (props.layerId ? (TimelineStore.state.subtitleCueRangesByLayer?.[props.layerId] ?? []) : []))

const showAiSummaryBtn = computed(() => !!props.layerId && cues.value.length > 0)

const openAiSummary = () => {
	if (!props.layerId) return
	if (!cues.value.length) return
	void VideoSceneStore.dispatch('openLeftPanel', { mode: 'subtitle-ai', layerId: props.layerId })
}

const boundNodeId = computed(() => (props.layerId ? (TimelineStore.state.subtitleTextNodeIdByLayer?.[props.layerId] ?? null) : null))
const boundNode = computed(() => {
	const layerId = props.layerId
	const nodeId = boundNodeId.value
	if (!layerId || !nodeId) return null
	const layer = findLayer(VideoSceneStore.state, layerId)
	if (!layer) return null
	return findNode(layer.nodeTree, nodeId)
})

const boundFilters = computed(() => {
	const p: any = (boundNode.value as any)?.props
	return Array.isArray(p?.filters) ? (p.filters as any[]) : []
})

const selectedIndex = ref(0)

const listEl = ref<HTMLDivElement | null>(null)

const ensureCueVisible = (idx: number, paddingPx?: number) => {
	const el = listEl.value
	if (!el) return
	const items = el.querySelectorAll<HTMLButtonElement>('button.vs-subtitle-item')
	const item = items[idx]
	if (!item) return
	const rawPad = Number(paddingPx)
	// 自适应：默认取容器高度的 20%，并做上下限，避免过大/过小
	const pad = Number.isFinite(rawPad)
		? Math.max(0, Math.floor(rawPad))
		: Math.max(24, Math.min(96, Math.floor(el.clientHeight * 0.2)))
	let viewTop = el.scrollTop
	let viewBottom = viewTop + el.clientHeight
	const targetTop = item.offsetTop
	const targetBottom = targetTop + item.offsetHeight

	// 1) 先确保“完整可见”（不考虑留白）
	if (item.offsetHeight >= el.clientHeight) {
		// 项目比容器还高：只能尽量对齐顶部
		el.scrollTop = Math.max(0, targetTop)
		return
	}
	if (targetTop < viewTop) {
		el.scrollTop = Math.max(0, targetTop)
		viewTop = el.scrollTop
		viewBottom = viewTop + el.clientHeight
	} else if (targetBottom > viewBottom) {
		el.scrollTop = Math.max(0, targetBottom - el.clientHeight)
		viewTop = el.scrollTop
		viewBottom = viewTop + el.clientHeight
	}

	// 2) 再尝试满足“带留白可视区”（能做到就滚；做不到就保持完整可见即可）
	const minTop = viewTop + pad
	const maxBottom = viewBottom - pad
	if (el.clientHeight <= pad * 2 + item.offsetHeight) return
	if (targetTop >= minTop && targetBottom <= maxBottom) return
	if (targetTop < minTop) el.scrollTop = Math.max(0, targetTop - pad)
	else if (targetBottom > maxBottom) el.scrollTop = Math.max(0, targetBottom + pad - el.clientHeight)
}

const getDefaultStyle = (layerId: string) =>
	TimelineStore.state.subtitleDefaultStyleByLayer?.[layerId] ?? ({ fontSize: 36, fontColor: '#ffffff', fontStyle: 'normal', textAlign: 'center' } as any)

const getOverride = (layerId: string, idx: number) => TimelineStore.state.subtitleOverrideStyleByLayer?.[layerId]?.[String(idx)] ?? null

const effectiveStyle = computed(() => {
	const layerId = props.layerId
	const idx = selectedIndex.value
	if (!layerId) return getDefaultStyle('')
	return { ...getDefaultStyle(layerId), ...(getOverride(layerId, idx) ?? {}) }
})

const isPerCue = computed(() => {
	const layerId = props.layerId
	if (!layerId) return false
	return !!getOverride(layerId, selectedIndex.value)
})

const hasOverride = (idx: number) => {
	const layerId = props.layerId
	if (!layerId) return false
	return !!getOverride(layerId, idx)
}

const editText = ref('')
const editFontSize = ref<number>(36)
const editFontColor = ref<string>('#ffffff')
const editFontStyle = ref<string>('normal')
const editTextAlign = ref<'left' | 'center' | 'right'>('center')

const nodeX = ref<number>(0)
const nodeY = ref<number>(0)
const nodeW = ref<number>(600)
const nodeH = ref<number>(120)
const nodeOpacity = ref<number>(1)

const syncNodeFromStore = () => {
	const t: any = (boundNode.value as any)?.transform
	if (!t) return
	nodeX.value = Number(t.x ?? 0) || 0
	nodeY.value = Number(t.y ?? 0) || 0
	nodeW.value = Math.max(1, Number(t.width ?? 1) || 1)
	nodeH.value = Math.max(1, Number(t.height ?? 1) || 1)
	const op = Number(t.opacity)
	// default to 1 if unset/invalid
	nodeOpacity.value = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1
}

const applyNodeTransform = async () => {
	const layerId = props.layerId
	const nodeId = boundNodeId.value
	if (!layerId || !nodeId) return
	await VideoSceneStore.dispatch('updateNodeTransform', {
		layerId,
		nodeId,
		patch: {
			x: Number(nodeX.value) || 0,
			y: Number(nodeY.value) || 0,
			width: Math.max(1, Number(nodeW.value) || 1),
			height: Math.max(1, Number(nodeH.value) || 1),
		},
	})
}

const applyNodeOpacity = async () => {
	const layerId = props.layerId
	const nodeId = boundNodeId.value
	if (!layerId || !nodeId) return
	const op = Number(nodeOpacity.value)
	const opacity = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1
	await VideoSceneStore.dispatch('updateNodeTransform', { layerId, nodeId, patch: { opacity } })
	// 透明会参与字幕“显示帧”的生成关键帧
	await regen()
}

function syncEditorFromStore() {
	const layerId = props.layerId
	if (!layerId) return
	const idx = Math.max(0, Math.min(selectedIndex.value, cues.value.length - 1))
	selectedIndex.value = idx

	editText.value = String(cues.value[idx]?.text ?? '')
	const s = effectiveStyle.value as any
	editFontSize.value = Number(s.fontSize ?? 36)
	editFontColor.value = String(s.fontColor ?? '#ffffff')
	editFontStyle.value = String(s.fontStyle ?? 'normal')
	editTextAlign.value =
		(String(s.textAlign ?? 'center') as any) === 'left'
			? 'left'
			: (String(s.textAlign ?? 'center') as any) === 'right'
				? 'right'
				: 'center'

		syncNodeFromStore()
}

watch(
	() => props.layerId,
	() => {
		selectedIndex.value = 0
		syncEditorFromStore()
	},
	{ immediate: true }
)

watch(
	() => [cues.value.length, TimelineStore.state.subtitleVersion] as const,
	() => syncEditorFromStore()
)

const select = (idx: number, opts?: { jump?: boolean; scroll?: boolean; paddingPx?: number }) => {
	selectedIndex.value = Math.max(0, Math.min(idx, cues.value.length - 1))
	syncEditorFromStore()
	if (opts?.scroll) ensureCueVisible(selectedIndex.value, opts?.paddingPx ?? 48)
	const layerId = props.layerId
	if (!layerId) return
	if (opts?.jump === false) return
	const r: any = cueRanges.value[selectedIndex.value]
	const startFrame = Number(r?.startFrame)
	if (Number.isFinite(startFrame)) {
		void TimelineStore.dispatch('jumpToFrameCentered', { frameIndex: Math.floor(startFrame) })
	}
}

const onExternalCueSelect = (ev: Event) => {
	const ce = ev as CustomEvent<DvsSubtitleCueSelectDetail>
	const d: any = ce?.detail
	const layerId = props.layerId
	if (!layerId || !d) return
	if (String(d.layerId) !== layerId) return
	const idx = Math.floor(Number(d.cueIndex))
	if (!Number.isFinite(idx)) return
	select(idx, { jump: false, scroll: true, paddingPx: Number(d.paddingPx) })
}

onMounted(() => {
	window.addEventListener(DVS_EVENTS.SubtitleCueSelect, onExternalCueSelect as any)
})

const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0')
const formatMs = (ms: number) => {
	const v = Math.max(0, Math.floor(Number(ms) || 0))
	const hh = Math.floor(v / 3600000)
	const mm = Math.floor((v % 3600000) / 60000)
	const ss = Math.floor((v % 60000) / 1000)
	const mmm = v % 1000
	return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${String(mmm).padStart(3, '0')}`
}

const cueTimeText = (idx: number) => {
	const c: any = cues.value[idx]
	if (c && typeof c.startMs === 'number' && typeof c.endMs === 'number') return `${formatMs(c.startMs)} → ${formatMs(c.endMs)}`
	const r: any = cueRanges.value[idx]
	if (r && Number.isFinite(r.startFrame) && Number.isFinite(r.endFrame)) return `F${r.startFrame} → F${r.endFrame}`
	return `#${idx + 1}`
}

const regen = async () => {
	const layerId = props.layerId
	if (!layerId) return
	const nodeId = TimelineStore.state.subtitleTextNodeIdByLayer?.[layerId]
	if (!nodeId) return
	const sceneLayer = findLayer(VideoSceneStore.state, layerId)
	if (!sceneLayer) return
	const node = findNode(sceneLayer.nodeTree, nodeId)
	if (!node?.transform) return

	const defaultStyle = getDefaultStyle(layerId)
	const overridesByCueIndex = TimelineStore.state.subtitleOverrideStyleByLayer?.[layerId] ?? {}
	const gen = buildSubtitleGeneratedKeyframes({
		layerId,
		nodeId,
		cues: cues.value as any,
		cueRanges: cueRanges.value as any,
		defaultStyle,
		overridesByCueIndex,
		nodeTransform: node.transform as VideoSceneNodeTransform,
	})
	await TimelineStore.dispatch('setSubtitleGeneratedKeyframes', { layerId, frames: gen.frames, nodeKeyframesByFrame: gen.nodeKeyframesByFrame })
}

let textTimer: number | null = null
const scheduleCommitText = () => {
	if (textTimer != null) window.clearTimeout(textTimer)
	textTimer = window.setTimeout(async () => {
		textTimer = null
		const layerId = props.layerId
		if (!layerId) return
		await TimelineStore.dispatch('setSubtitleCueText', { layerId, cueIndex: selectedIndex.value, text: editText.value })
		await regen()
	}, 180)
}

onBeforeUnmount(() => {
	if (textTimer != null) window.clearTimeout(textTimer)
	window.removeEventListener(DVS_EVENTS.SubtitleCueSelect, onExternalCueSelect as any)
})

const commitStyle = async (key: 'fontSize' | 'fontColor' | 'fontStyle' | 'textAlign', value: any) => {
	const layerId = props.layerId
	if (!layerId) return
	const patch: any = { [key]: value }
	if (isPerCue.value) await TimelineStore.dispatch('setSubtitleOverrideStyle', { layerId, cueIndex: selectedIndex.value, style: patch })
	else await TimelineStore.dispatch('setSubtitleDefaultStyle', { layerId, style: patch })
	await regen()
}

const enablePerCue = async () => {
	const layerId = props.layerId
	if (!layerId) return
	await TimelineStore.dispatch('setSubtitleOverrideStyle', { layerId, cueIndex: selectedIndex.value, style: {} })
	syncEditorFromStore()
}

const clearPerCue = async () => {
	const layerId = props.layerId
	if (!layerId) return
	await TimelineStore.dispatch('setSubtitleOverrideStyle', { layerId, cueIndex: selectedIndex.value, style: null })
	syncEditorFromStore()
	await regen()
}

const applyToAll = async () => {
	const layerId = props.layerId
	if (!layerId) return
	await TimelineStore.dispatch('applySubtitleStyleToAll', { layerId, style: effectiveStyle.value as any })
	syncEditorFromStore()
	await regen()
}
</script>

<style scoped>
.vs-subtitle {
	flex: 1;
	min-height: 0;
	display: flex;
	min-width: 0;
}

.vs-subtitle-left {
	flex: 0 0 44%;
	min-width: 0;
	border-right: 1px solid var(--vscode-border);
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.vs-subtitle-right {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.vs-subtitle-head {
	flex: 0 0 auto;
	padding: 10px 12px;
	border-bottom: 1px solid var(--vscode-border);
	display: flex;
	align-items: baseline;
	gap: 8px;
}

.vs-subtitle-title {
	font-size: 12px;
	color: var(--vscode-fg);
}

.vs-subtitle-meta {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-subtitle-list {
	flex: 1;
	min-height: 0;
	overflow: auto;
	padding: 6px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.vs-subtitle-item {
	text-align: left;
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	padding: 8px 10px;
	cursor: pointer;
}

.vs-subtitle-item.active {
	border-color: var(--vscode-border-accent);
}

.vs-subtitle-item-top {
	display: flex;
	align-items: center;
	gap: 8px;
}

.vs-subtitle-time {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-subtitle-badge {
	font-size: 11px;
	padding: 1px 6px;
	border-radius: 999px;
	border: 1px solid var(--vscode-border);
	color: var(--vscode-fg);
}

.vs-subtitle-preview {
	margin-top: 6px;
	font-size: 12px;
	color: var(--vscode-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vs-subtitle-empty {
	padding: 12px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-subtitle-editor {
	flex: 1;
	min-height: 0;
	overflow: auto;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.vs-form-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.vs-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-input {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border-radius: 8px;
	height: 28px;
	padding: 0 8px;
	font-size: 12px;
}

.vs-color {
	padding: 0 2px;
	width: 40px;
}

.vs-textarea {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border-radius: 8px;
	padding: 8px;
	font-size: 12px;
	resize: vertical;
}

.vs-style-row {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	align-items: center;
}

.vs-actions {
	display: flex;
	gap: 8px;
	align-items: center;
	flex-wrap: wrap;
}

.vs-btn {
	height: 28px;
	padding: 0 10px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.vs-btn:hover {
	border-color: var(--vscode-border-accent);
}

.vs-ai-summary-btn {
	margin-left: auto;
}

.vs-actions-hint {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-node-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.vs-node-field {
	display: flex;
	align-items: center;
	gap: 8px;
}

.vs-node-k {
	width: 28px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}
</style>
