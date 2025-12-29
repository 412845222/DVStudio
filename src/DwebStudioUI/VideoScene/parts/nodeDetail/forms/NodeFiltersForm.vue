<template>
	<div class="vs-group vs-filters">
		<div class="vs-group-title vs-filter-title">
			<span>滤镜</span>
			<div class="vs-filter-title-actions">
				<button class="vs-quick-btn" type="button" title="添加滤镜" @click="filterMenuOpen = !filterMenuOpen">+</button>
			</div>
			<div v-if="filterMenuOpen" class="vs-filter-menu" @click.stop>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('blur')">模糊</button>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('glow')">发光</button>
				<button class="vs-filter-menu-item" type="button" @click="addFilter('customShader')">自定义 Shader</button>
			</div>
		</div>

		<div v-if="filtersUi.length === 0" class="vs-filter-empty">暂无滤镜</div>

		<div
			v-for="f in filtersUi"
			:key="f.id"
			class="vs-filter-item"
			:draggable="true"
			@dragstart="(e) => onFilterDragStart(e, f.id)"
			@dragend="onFilterDragEnd"
			@dragover="onFilterDragOver"
			@drop="(e) => onFilterDrop(e, f.id)"
		>
			<div class="vs-filter-item-header">
				<div class="vs-filter-item-title">
					<span class="vs-filter-drag">≡</span>
					<span v-if="f.type === 'blur'">模糊</span>
					<span v-else-if="f.type === 'glow'">发光</span>
					<span v-else>自定义 Shader</span>
				</div>
				<div class="vs-filter-item-actions">
					<button class="vs-filter-icon-btn" type="button" title="上移" @click="moveFilter(f.id, -1)">↑</button>
					<button class="vs-filter-icon-btn" type="button" title="下移" @click="moveFilter(f.id, 1)">↓</button>
					<button class="vs-filter-icon-btn" type="button" title="删除" @click="deleteFilter(f.id)">×</button>
				</div>
			</div>

			<div v-if="f.type === 'blur'" class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select class="vs-input" :value="f.quality" @change="(e) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })">
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
						@change="(e) => patchFilterNumber(f.id, 'blurX', (e.target as HTMLInputElement).value)"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onFilterNumberScrubPointerDown(e, () => f.blurX, (v) => patchFilter(f.id, { blurX: v }), { step: 1, min: 0, max: 999999 })"
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
						@change="(e) => patchFilterNumber(f.id, 'blurY', (e.target as HTMLInputElement).value)"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onFilterNumberScrubPointerDown(e, () => f.blurY, (v) => patchFilter(f.id, { blurY: v }), { step: 1, min: 0, max: 999999 })"
					/>
				</label>
			</div>

			<div v-else-if="f.type === 'glow'" class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select class="vs-input" :value="f.quality" @change="(e) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })">
						<option value="low">低</option>
						<option value="mid">中</option>
						<option value="high">高</option>
					</select>
				</label>
				<label class="vs-row">
					<span class="vs-k">颜色</span>
					<input :value="f.color" class="vs-input" type="text" placeholder="#ffffff" @change="(e) => patchFilter(f.id, { color: (e.target as HTMLInputElement).value })" />
					<input :value="f.color" class="vs-color" type="color" @input="(e) => patchFilter(f.id, { color: (e.target as HTMLInputElement).value })" />
				</label>
				<label class="vs-row">
					<span class="vs-k">强度</span>
					<input
						:value="f.intensity"
						class="vs-input vs-scrub"
						type="number"
						min="0"
						step="0.01"
						@change="(e) => patchFilterNumber(f.id, 'intensity', (e.target as HTMLInputElement).value)"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onFilterNumberScrubPointerDown(e, () => f.intensity, (v) => patchFilter(f.id, { intensity: v }), { step: 0.01, min: 0, max: 999999 })"
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
						@change="(e) => patchFilterNumber(f.id, 'blurX', (e.target as HTMLInputElement).value)"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onFilterNumberScrubPointerDown(e, () => f.blurX, (v) => patchFilter(f.id, { blurX: v }), { step: 1, min: 0, max: 999999 })"
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
						@change="(e) => patchFilterNumber(f.id, 'blurY', (e.target as HTMLInputElement).value)"
						@dblclick.stop="onNumberInputDblClick"
						@focus="onNumberInputFocus"
						@blur="onNumberInputBlur"
						@pointerdown="(e) => onFilterNumberScrubPointerDown(e, () => f.blurY, (v) => patchFilter(f.id, { blurY: v }), { step: 1, min: 0, max: 999999 })"
					/>
				</label>
				<label class="vs-row">
					<span class="vs-k">内发光</span>
					<input :checked="f.inner" type="checkbox" @change="(e) => patchFilter(f.id, { inner: (e.target as HTMLInputElement).checked })" />
				</label>
				<label class="vs-row">
					<span class="vs-k">挖空</span>
					<input :checked="f.knockout" type="checkbox" @change="(e) => patchFilter(f.id, { knockout: (e.target as HTMLInputElement).checked })" />
				</label>
			</div>

			<div v-else class="vs-filter-item-body">
				<label class="vs-row">
					<span class="vs-k">质量</span>
					<select class="vs-input" :value="f.quality" @change="(e) => patchFilter(f.id, { quality: (e.target as HTMLSelectElement).value })">
						<option value="low">低</option>
						<option value="mid">中</option>
						<option value="high">高</option>
					</select>
				</label>
				<label class="vs-row">
					<span class="vs-k">顶点</span>
					<textarea :value="f.vertex" class="vs-input vs-textarea wide" rows="6" @input="(e) => patchFilter(f.id, { vertex: (e.target as HTMLTextAreaElement).value })" />
				</label>
				<label class="vs-row">
					<span class="vs-k">片段</span>
					<textarea :value="f.fragment" class="vs-input vs-textarea wide" rows="6" @input="(e) => patchFilter(f.id, { fragment: (e.target as HTMLTextAreaElement).value })" />
				</label>
				<div class="vs-filter-shader-actions">
					<button class="vs-filter-btn" type="button" @click="compileCustomShader(f)">预览编译</button>
				</div>
				<div v-if="shaderLogsById[f.id] && shaderOkById[f.id] === false" class="vs-filter-log">
					<pre class="vs-filter-log-pre">{{ shaderLogsById[f.id] }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../../../store/videoscene'
import { DwebCanvasGLKey } from '../../../VideoSceneRuntime'
import { useNumberScrub } from './useNumberScrub'

defineOptions({ name: 'NodeFiltersForm' })

type VideoNodeFilterType = 'blur' | 'glow' | 'customShader'

type FilterQuality = 'low' | 'mid' | 'high'

type VideoNodeFilterBase = { id: string; type: VideoNodeFilterType; qualityV2?: boolean }

type VideoNodeBlurFilter = VideoNodeFilterBase & { type: 'blur'; quality: FilterQuality; blurX: number; blurY: number }

type VideoNodeGlowFilter = VideoNodeFilterBase & {
	type: 'glow'
	quality: FilterQuality
	color: string
	intensity: number
	blurX: number
	blurY: number
	inner: boolean
	knockout: boolean
}

type VideoNodeCustomShaderFilter = VideoNodeFilterBase & { type: 'customShader'; quality: FilterQuality; vertex: string; fragment: string }

type VideoNodeFilter = VideoNodeBlurFilter | VideoNodeGlowFilter | VideoNodeCustomShaderFilter

const props = defineProps<{
	layerId: string
	nodeId: string
	filters: VideoNodeFilter[]
}>()

const store = useStore<VideoSceneState>(VideoSceneKey)
const dwebCanvasRef = inject<any>(DwebCanvasGLKey, null)

const filterMenuOpen = ref(false)
const draggingFilterId = ref<string | null>(null)
const shaderLogsById = reactive<Record<string, string>>({})
const shaderOkById = reactive<Record<string, boolean>>({})

const { onNumberScrubPointerDown, onNumberInputDblClick, onNumberInputFocus, onNumberInputBlur } = useNumberScrub()

const createId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const patchNodeProps = (layerId: string, nodeId: string, patch: Record<string, any>) => {
	store.dispatch('updateNodeProps', { layerId, nodeId, patch })
	// Ensure immediate visual feedback (avoid stale frame residue)
	dwebCanvasRef?.value?.requestRender?.()
}

const normalizeQualityV2 = (q: any): FilterQuality => {
	if (q === 'low' || q === 'mid' || q === 'high') return q
	return 'mid'
}

const normalizeQualityForUi = (f: any): FilterQuality => {
	// UI 展示使用与渲染端一致的“读时兼容”逻辑，但不写回 store。
	const q = (f as any)?.quality
	const v2 = !!(f as any)?.qualityV2
	if (v2) return normalizeQualityV2(q)
	// Legacy (v1) 映射：high -> mid, mid -> low。
	if (q === 'high') return 'mid'
	if (q === 'mid') return 'low'
	if (q === 'low') return 'low'
	return 'mid'
}

const filtersUi = computed<VideoNodeFilter[]>(() => {
	return (Array.isArray(props.filters) ? props.filters : []).map((f: any) => ({ ...(f as any), quality: normalizeQualityForUi(f) })) as any
})

const updateFilters = (next: VideoNodeFilter[]) => {
	patchNodeProps(props.layerId, props.nodeId, { filters: next })
}

const addFilter = (type: VideoNodeFilterType) => {
	const next = [...(props.filters ?? [])]
	const id = createId()
	if (type === 'blur') {
		next.push({ id, type, quality: 'mid', qualityV2: true, blurX: 5, blurY: 5 } as any)
	} else if (type === 'glow') {
		next.push({ id, type, quality: 'mid', qualityV2: true, color: '#ffffff', intensity: 1, blurX: 5, blurY: 5, inner: false, knockout: false } as any)
	} else {
		next.push({
			id,
			type,
			quality: 'mid',
			qualityV2: true,
			vertex: `#version 300 es\nprecision highp float;\n\nin vec2 a_position;\nout vec2 v_uv;\n\nvoid main(){\n  // v=0 is BOTTOM (OpenGL convention; consistent with post-process passes)\n  v_uv = (a_position + 1.0) * 0.5;\n  gl_Position = vec4(a_position, 0.0, 1.0);\n}`,
			fragment: `#version 300 es\nprecision highp float;\n\nin vec2 v_uv;\nout vec4 outColor;\n\nvoid main(){\n  outColor = vec4(v_uv, 0.0, 1.0);\n}`,
		} as any)
	}
	updateFilters(next)
	filterMenuOpen.value = false
}

const deleteFilter = (id: string) => {
	const next = (props.filters ?? []).filter((f: any) => f.id !== id)
	delete shaderLogsById[id]
	delete shaderOkById[id]
	updateFilters(next)
}

const moveFilter = (id: string, dir: -1 | 1) => {
	const list = [...(props.filters ?? [])]
	const idx = list.findIndex((f: any) => f.id === id)
	if (idx < 0) return
	const target = idx + dir
	if (target < 0 || target >= list.length) return
	const tmp = list[idx]
	list[idx] = list[target]
	list[target] = tmp
	updateFilters(list)
}

const patchFilter = (id: string, patch: Record<string, any>) => {
	const list = (props.filters ?? []).map((f: any) => {
		if (f.id !== id) return f
		const next: any = { ...(f as any), ...patch }
		// 用户一旦触发 quality 修改，就使用 v2 语义持久化，避免后续被 legacy 映射影响。
		if (Object.prototype.hasOwnProperty.call(patch, 'quality')) {
			next.quality = normalizeQualityV2((patch as any).quality)
			next.qualityV2 = true
		}
		return next
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
	const fromId = e.dataTransfer?.getData('application/x-vs-filter-id') || e.dataTransfer?.getData('text/plain') || draggingFilterId.value
	if (!fromId || fromId === targetId) return
	const list = [...(props.filters ?? [])]
	const fromIdx = list.findIndex((f: any) => f.id === fromId)
	const toIdx = list.findIndex((f: any) => f.id === targetId)
	if (fromIdx < 0 || toIdx < 0) return
	const [moved] = list.splice(fromIdx, 1)
	list.splice(toIdx, 0, moved)
	updateFilters(list)
}

const onFilterNumberScrubPointerDown = (e: PointerEvent, get: () => number, commit: (v: number) => void, opt: { step: number; min: number; max: number }) => {
	let latest = Number(get()) || 0
	const setLocal = (v: number) => {
		latest = v
		const target = e.currentTarget as HTMLInputElement | null
		if (target) target.value = String(v)
	}
	onNumberScrubPointerDown(e, () => Number(get()) || 0, setLocal, { step: opt.step, min: opt.min, max: opt.max, onCommit: () => commit(latest) })
}

const compileCustomShader = (f: VideoNodeCustomShaderFilter) => {
	const canvas = dwebCanvasRef?.value
	if (!canvas) {
		shaderOkById[f.id] = false
		shaderLogsById[f.id] = 'WebGL 上下文未就绪：请先确保舞台已初始化。'
		return
	}
	const res = (canvas as any).compileAndLinkProgram?.(f.vertex, f.fragment)
	if (!res || typeof res !== 'object') {
		shaderOkById[f.id] = false
		shaderLogsById[f.id] = '当前运行时不支持预览编译（缺少 compileAndLinkProgram 接口）。'
		return
	}
	shaderOkById[f.id] = !!res.ok
	shaderLogsById[f.id] = String(res.log ?? '')
	if (shaderOkById[f.id]) {
		// 成功时隐藏日志
		delete shaderLogsById[f.id]
	}
}
</script>
