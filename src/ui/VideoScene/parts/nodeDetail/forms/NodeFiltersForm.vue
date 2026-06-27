<template>
	<div class="vs-group vs-filters">
		<div class="vs-group-title vs-filter-title">
			<span>滤镜</span>
			<div class="vs-filter-title-actions">
				<button
					class="vs-quick-btn"
					type="button"
					title="添加滤镜"
					@click="filterMenuOpen = !filterMenuOpen"
				>
					+
				</button>
			</div>
			<div v-if="filterMenuOpen" class="vs-filter-menu" @click.stop>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('blur')">模糊</button>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('glow')">发光</button>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('customShader')">
					自定义 Shader
				</button>
			</div>
		</div>

		<div v-if="filtersUi.length === 0" class="vs-filter-empty">暂无滤镜</div>

		<div
			v-for="f in filtersUi"
			:key="f.id"
			class="vs-filter-item"
			:draggable="true"
			@dragstart="(e: DragEvent) => onFilterDragStart(e, f.id)"
			@dragend="onFilterDragEnd"
			@dragover="onFilterDragOver"
			@drop="(e: DragEvent) => onFilterDrop(e, f.id)"
		>
			<div class="vs-filter-item-header">
				<div class="vs-filter-item-title">
					<span class="vs-filter-drag">≡</span>
					<span v-if="f.type === 'blur'">模糊</span>
					<span v-else-if="f.type === 'glow'">发光</span>
					<span v-else>自定义 Shader</span>
				</div>
				<div class="vs-filter-item-actions">
					<button
						class="vs-filter-icon-btn"
						type="button"
						title="上移"
						@click="moveFilter(f.id, -1)"
					>
						↑
					</button>
					<button
						class="vs-filter-icon-btn"
						type="button"
						title="下移"
						@click="moveFilter(f.id, 1)"
					>
						↓
					</button>
					<button class="vs-filter-icon-btn" type="button" title="删除" @click="deleteFilter(f.id)">
						×
					</button>
				</div>
			</div>

			<div v-if="f.type === 'blur'" class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select
						class="vs-input"
						:value="f.quality"
						@change="
							(e: Event) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })
						"
					>
						<option value="low">低</option>
						<option value="mid">中</option>
						<option value="high">高</option>
					</select>
				</label>
				<label class="vs-row">
					<span class="vs-k">模糊X</span>
					<input
						:value="f.blurX"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="
							(e: Event) => patchFilterNumber(f.id, 'blurX', (e.target as HTMLInputElement).value)
						"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="
							(e: PointerEvent) =>
						onFilterNumberScrubPointerDown(
									e,
									() => f.blurX,
									(v) => patchFilter(f.id, { blurX: v }),
									{ step: 1, min: 0, max: 999999 }
								)
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">模糊Y</span>
					<input
						:value="f.blurY"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="
							(e: Event) => patchFilterNumber(f.id, 'blurY', (e.target as HTMLInputElement).value)
						"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="
							(e: PointerEvent) =>
						onFilterNumberScrubPointerDown(
									e,
									() => f.blurY,
									(v) => patchFilter(f.id, { blurY: v }),
									{ step: 1, min: 0, max: 999999 }
								)
						"
					/>
				</label>
			</div>

			<div v-else-if="f.type === 'glow'" class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select
						class="vs-input"
						:value="f.quality"
						@change="
							(e: Event) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })
						"
					>
						<option value="low">低</option>
						<option value="mid">中</option>
						<option value="high">高</option>
					</select>
				</label>
				<label class="vs-row">
					<span class="vs-k">颜色</span>
					<input
						:value="f.color"
						class="vs-input"
						type="text"
						placeholder="#ffffff"
						@change="(e: Event) => patchFilter(f.id, { color: (e.target as HTMLInputElement).value })"
					/>
					<input
						:value="f.color"
						class="vs-color"
						type="color"
						@input="(e: Event) => patchFilter(f.id, { color: (e.target as HTMLInputElement).value })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">强度</span>
					<input
						:value="f.intensity"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="0.01"
						@change="
							(e: Event) => patchFilterNumber(f.id, 'intensity', (e.target as HTMLInputElement).value)
						"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="
							(e: PointerEvent) =>
						onFilterNumberScrubPointerDown(
									e,
									() => f.intensity,
									(v) => patchFilter(f.id, { intensity: v }),
									{ step: 0.01, min: 0, max: 999999 }
								)
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">模糊X</span>
					<input
						:value="f.blurX"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="
							(e: Event) => patchFilterNumber(f.id, 'blurX', (e.target as HTMLInputElement).value)
						"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="
							(e: PointerEvent) =>
						onFilterNumberScrubPointerDown(
									e,
									() => f.blurX,
									(v) => patchFilter(f.id, { blurX: v }),
									{ step: 1, min: 0, max: 999999 }
								)
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">模糊Y</span>
					<input
						:value="f.blurY"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="1"
						@change="
							(e: Event) => patchFilterNumber(f.id, 'blurY', (e.target as HTMLInputElement).value)
						"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="
							(e: PointerEvent) =>
						onFilterNumberScrubPointerDown(
									e,
									() => f.blurY,
									(v) => patchFilter(f.id, { blurY: v }),
									{ step: 1, min: 0, max: 999999 }
								)
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">内发光</span>
					<input
						:checked="f.inner"
						type="checkbox"
						@change="
							(e: Event) => patchFilter(f.id, { inner: (e.target as HTMLInputElement).checked })
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">挖空</span>
					<input
						:checked="f.knockout"
						type="checkbox"
						@change="
							(e: Event) => patchFilter(f.id, { knockout: (e.target as HTMLInputElement).checked })
						"
					/>
				</label>
			</div>

			<div v-else class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select
						class="vs-input"
						:value="f.quality"
						@change="
							(e: Event) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })
						"
					>
						<option value="low">低</option>
						<option value="mid">中</option>
						<option value="high">高</option>
					</select>
				</label>
				<label class="vs-row">
					<span class="vs-k">顶点</span>
					<textarea
						:value="f.vertex"
						class="vs-input vs-textarea wide"
						rows="6"
						@input="
							(e: Event) => patchFilter(f.id, { vertex: (e.target as HTMLTextAreaElement).value })
						"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">片段</span>
					<textarea
						:value="f.fragment"
						class="vs-input vs-textarea wide"
						rows="6"
						@input="
							(e: Event) => patchFilter(f.id, { fragment: (e.target as HTMLTextAreaElement).value })
						"
					/>
				</label>
				<div class="vs-filter-shader-actions">
					<button class="vs-filter-btn" type="button" @click="compileCustomShader(f)">
						预览编译
					</button>
				</div>
				<div v-if="shaderLogsById[f.id] && shaderOkById[f.id] === false" class="vs-filter-log">
					<pre class="vs-filter-log-pre">{{ shaderLogsById[f.id] }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from 'vue'
import type { Store } from 'vuex'
import {
	VideoSceneKey,
	VideoSceneStore,
	type VideoSceneState
} from '../../../../../store/videoscene'
import { DwebCanvasGLKey } from '../../../VideoSceneRuntime'
import { useNumberScrub } from './useNumberScrub'
import { isObject, isBoolean, isArray, isString } from '../../../../../types/utils'
import type { JsonValue } from '../../../../../core/shared/json'

defineOptions({ name: 'NodeFiltersForm' })

type VideoNodeFilterType = 'blur' | 'glow' | 'customShader'

type FilterQuality = 'low' | 'mid' | 'high'

type VideoNodeBlurFilterUi = {
	id: string
	type: 'blur'
	quality: FilterQuality
	qualityV2: boolean
	blurX: number
	blurY: number
}

type VideoNodeGlowFilterUi = {
	id: string
	type: 'glow'
	quality: FilterQuality
	qualityV2: boolean
	color: string
	intensity: number
	blurX: number
	blurY: number
	inner: boolean
	knockout: boolean
}

type VideoNodeCustomShaderFilterUi = {
	id: string
	type: 'customShader'
	quality: FilterQuality
	qualityV2: boolean
	vertex: string
	fragment: string
}

type VideoNodeFilterUi =
	| VideoNodeBlurFilterUi
	| VideoNodeGlowFilterUi
	| VideoNodeCustomShaderFilterUi

type VideoNodeFilterInput = {
	id?: unknown
	type?: unknown
	quality?: unknown
	qualityV2?: unknown
	blurX?: unknown
	blurY?: unknown
	color?: unknown
	intensity?: unknown
	inner?: unknown
	knockout?: unknown
	vertex?: unknown
	fragment?: unknown
	[k: string]: unknown
}

type VideoNodeFilterPatch = Partial<
	Omit<VideoNodeBlurFilterUi, 'id' | 'type'> &
		Omit<VideoNodeGlowFilterUi, 'id' | 'type'> &
		Omit<VideoNodeCustomShaderFilterUi, 'id' | 'type'> & { [k: string]: unknown }
>

const props = defineProps<{
	layerId: string
	nodeId: string
	filters: unknown[] | null | undefined
}>()

const injectedStore = inject(VideoSceneKey, null)
const store: Store<VideoSceneState> = injectedStore ?? VideoSceneStore
const dwebCanvasRef = inject(DwebCanvasGLKey, null)

const filterMenuOpen = ref(false)
const draggingFilterId = ref<string | null>(null)
const shaderLogsById = reactive<Record<string, string>>({})
const shaderOkById = reactive<Record<string, boolean>>({})

const { onNumberScrubPointerDown, onNumberInputDblClick, onNumberInputFocus, onNumberInputBlur } =
	useNumberScrub()

const createId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const patchNodeProps = (layerId: string, nodeId: string, patch: Record<string, JsonValue>) => {
	store.dispatch('updateNodeProps', { layerId, nodeId, patch })
	dwebCanvasRef?.value?.requestRender?.()
}

const isFilterQuality = (q: unknown): q is FilterQuality => {
	return q === 'low' || q === 'mid' || q === 'high'
}

const normalizeQualityV2 = (q: unknown): FilterQuality => {
	if (isFilterQuality(q)) return q
	return 'mid'
}

const isVideoNodeFilterInput = (f: unknown): f is VideoNodeFilterInput => {
	return isObject(f)
}

const toNumber = (v: unknown, fallback: number): number => {
	const n = Number(v)
	return Number.isFinite(n) ? n : fallback
}

const toBoolean = (v: unknown, fallback: boolean): boolean => {
	if (typeof v === 'boolean') return v
	if (v === 'true') return true
	if (v === 'false') return false
	return fallback
}

const normalizeFilterForUi = (f: unknown): VideoNodeFilterUi => {
	const id = createId()
	if (!isVideoNodeFilterInput(f)) {
		return { id, type: 'blur', quality: 'mid', qualityV2: true, blurX: 0, blurY: 0 }
	}
	const fid = isString(f.id) ? f.id : id
	const q = f.quality
	const v2 = toBoolean(f.qualityV2, true)
	let quality: FilterQuality
	if (v2) {
		quality = normalizeQualityV2(q)
	} else {
		if (q === 'high') quality = 'mid'
		else if (q === 'mid') quality = 'low'
		else quality = 'low'
	}
	const type = f.type === 'glow' ? 'glow' : f.type === 'customShader' ? 'customShader' : 'blur'
	if (type === 'glow') {
		return {
			id: fid,
			type: 'glow',
			quality,
			qualityV2: v2,
			color: isString(f.color) ? f.color : '#ffffff',
			intensity: toNumber(f.intensity, 1),
			blurX: toNumber(f.blurX, 5),
			blurY: toNumber(f.blurY, 5),
			inner: toBoolean(f.inner, false),
			knockout: toBoolean(f.knockout, false)
		}
	}
	if (type === 'customShader') {
		return {
			id: fid,
			type: 'customShader',
			quality,
			qualityV2: v2,
			vertex: isString(f.vertex)
				? f.vertex
				: `#version 300 es\nprecision highp float;\n\nin vec2 a_position;\nout vec2 v_uv;\n\nvoid main(){\n  v_uv = (a_position + 1.0) * 0.5;\n  gl_Position = vec4(a_position, 0.0, 1.0);\n}`,
			fragment: isString(f.fragment)
				? f.fragment
				: `#version 300 es\nprecision highp float;\n\nin vec2 v_uv;\nout vec4 outColor;\n\nvoid main(){\n  outColor = vec4(v_uv, 0.0, 1.0);\n}`
		}
	}
	return {
		id: fid,
		type: 'blur',
		quality,
		qualityV2: v2,
		blurX: toNumber(f.blurX, 5),
		blurY: toNumber(f.blurY, 5)
	}
}

const filtersUi = computed<VideoNodeFilterUi[]>(() => {
	return (isArray(props.filters) ? props.filters : []).map((f: unknown) => normalizeFilterForUi(f))
})

const updateFilters = (next: VideoNodeFilterUi[]) => {
	patchNodeProps(props.layerId, props.nodeId, { filters: next as unknown as JsonValue })
}

const addFilter = (type: VideoNodeFilterType) => {
	const next = [...filtersUi.value]
	const id = createId()
	if (type === 'blur') {
		next.push({ id, type: 'blur', quality: 'mid', qualityV2: true, blurX: 5, blurY: 5 })
	} else if (type === 'glow') {
		next.push({
			id,
			type: 'glow',
			quality: 'mid',
			qualityV2: true,
			color: '#ffffff',
			intensity: 1,
			blurX: 5,
			blurY: 5,
			inner: false,
			knockout: false
		})
	} else {
		next.push({
			id,
			type: 'customShader',
			quality: 'mid',
			qualityV2: true,
			vertex: `#version 300 es\nprecision highp float;\n\nin vec2 a_position;\nout vec2 v_uv;\n\nvoid main(){\n  v_uv = (a_position + 1.0) * 0.5;\n  gl_Position = vec4(a_position, 0.0, 1.0);\n}`,
			fragment: `#version 300 es\nprecision highp float;\n\nin vec2 v_uv;\nout vec4 outColor;\n\nvoid main(){\n  outColor = vec4(v_uv, 0.0, 1.0);\n}`
		})
	}
	updateFilters(next)
	filterMenuOpen.value = false
}

const deleteFilter = (id: string) => {
	const next = filtersUi.value.filter((f) => f.id !== id)
	delete shaderLogsById[id]
	delete shaderOkById[id]
	updateFilters(next)
}

const moveFilter = (id: string, dir: -1 | 1) => {
	const list = [...filtersUi.value]
	const idx = list.findIndex((f) => f.id === id)
	if (idx < 0) return
	const target = idx + dir
	if (target < 0 || target >= list.length) return
	const tmp = list[idx]
	list[idx] = list[target]
	list[target] = tmp
	updateFilters(list)
}

const patchFilter = (id: string, patch: Record<string, unknown>) => {
	const list = filtersUi.value.map((f): VideoNodeFilterUi => {
		if (f.id !== id) return f
		const next = { ...f, ...patch } as Record<string, unknown>
		if (Object.prototype.hasOwnProperty.call(patch, 'quality')) {
			next.quality = normalizeQualityV2(patch.quality)
			next.qualityV2 = true
		}
		return next as VideoNodeFilterUi
	})
	updateFilters(list)
}

const patchFilterNumber = (id: string, key: string, v: string) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return
	patchFilter(id, { [key]: n })
}

const onFilterDragStart = (e: DragEvent, id: string) => {
	draggingFilterId.value = id
	try {
		e.dataTransfer?.setData('text/plain', id)
		e.dataTransfer?.setData('application/x-vs-filter-id', id)
		e.dataTransfer!.effectAllowed = 'move'
	} catch {
		// ignore
	}
}

const onFilterDragEnd = () => {
	draggingFilterId.value = null
}

const onFilterDragOver = (e: DragEvent) => {
	e.preventDefault()
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

const onFilterDrop = (e: DragEvent, targetId: string) => {
	e.preventDefault()
	const fromId =
		e.dataTransfer?.getData('application/x-vs-filter-id') ||
		e.dataTransfer?.getData('text/plain') ||
		draggingFilterId.value
	if (!fromId || fromId === targetId) return
	const list = [...filtersUi.value]
	const fromIdx = list.findIndex((f) => f.id === fromId)
	const toIdx = list.findIndex((f) => f.id === targetId)
	if (fromIdx < 0 || toIdx < 0) return
	const [moved] = list.splice(fromIdx, 1)
	list.splice(toIdx, 0, moved)
	updateFilters(list)
}

const onFilterNumberScrubPointerDown = (
	e: PointerEvent,
	get: () => number,
	commit: (v: number) => void,
	opt: { step: number; min: number; max: number }
) => {
	let latest = Number(get()) || 0
	const setLocal = (v: number) => {
		latest = v
		const target = e.currentTarget as HTMLInputElement | null
		if (target) target.value = String(v)
	}
	onNumberScrubPointerDown(e, () => Number(get()) || 0, setLocal, {
		step: opt.step,
		min: opt.min,
		max: opt.max,
		onCommit: () => commit(latest)
	})
}

type DwebCanvasGl = {
	compileAndLinkProgram?: (
		vertex: string,
		fragment: string
	) => { ok?: boolean; log?: string } | null
	requestRender?: () => void
}

const compileCustomShader = (f: VideoNodeCustomShaderFilterUi) => {
	const canvas = dwebCanvasRef?.value as DwebCanvasGl | null
	if (!canvas) {
		shaderOkById[f.id] = false
		shaderLogsById[f.id] = 'WebGL 上下文未就绪：请先确保舞台已初始化。'
		return
	}
	const res = canvas.compileAndLinkProgram?.(f.vertex, f.fragment)
	if (!res || typeof res !== 'object') {
		shaderOkById[f.id] = false
		shaderLogsById[f.id] = '当前运行时不支持预览编译（缺少 compileAndLinkProgram 接口）。'
		return
	}
	shaderOkById[f.id] = !!res.ok
	shaderLogsById[f.id] = String(res.log ?? '')
	if (shaderOkById[f.id]) {
		delete shaderLogsById[f.id]
	}
}

watch(
	() => filtersUi.value,
	(list) => {
		for (const f of list) {
			if (f.type === 'customShader') {
				compileCustomShader(f)
			}
		}
	},
	{ immediate: true, deep: true }
)
</script>

<style scoped>
.vs-group {
	padding-top: 6px;
	border-top: 1px solid var(--vscode-border);
}

.vs-group-title {
	margin-bottom: 6px;
	color: var(--vscode-fg-muted);
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

.wide {
	max-width: 100%;
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
