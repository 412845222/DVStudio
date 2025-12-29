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
					<span class="vs-k">图片</span>
					<div class="vs-image-pick">
						<div v-if="currentImageUrl" class="vs-image-preview" :title="draft.imageName || ''">
							<img :src="currentImageUrl" alt="" />
						</div>
						<div class="vs-image-meta">
							<div class="vs-image-name">{{ draft.imageName || '未选择图片' }}</div>
							<button class="vs-btn" type="button" @click="openNodeImagePicker">选择图片</button>
							<input ref="nodeImageInputRef" class="vs-hidden-input" type="file" accept="image/*" @change="onPickNodeImageFile" />
						</div>
					</div>
				</label>
				<label class="vs-row">
					<span class="vs-k">适配</span>
					<div class="vs-quick">
						<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'contain' }" title="contain" @click="setImageFit('contain')">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 2h8v6H8V9z"/></svg>
						</button>
						<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'cover' }" title="cover" @click="setImageFit('cover')">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm1 1h10v8H7V8z"/></svg>
						</button>
						<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'fill' }" title="fill" @click="setImageFit('fill')">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6z"/></svg>
						</button>
						<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'none' }" title="none" @click="setImageFit('none')">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm7 5h2v4h-2v-4z"/></svg>
						</button>
						<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'scale-down' }" title="scale-down" @click="setImageFit('scale-down')">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm5 2h2v6h-2V9z"/></svg>
						</button>
					</div>
				</label>
			</div>

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
							<textarea
								:value="f.vertex"
								class="vs-input vs-textarea wide"
								rows="6"
								@input="(e) => patchFilter(f.id, { vertex: (e.target as HTMLTextAreaElement).value })"
							/>
						</label>
						<label class="vs-row">
							<span class="vs-k">片段</span>
							<textarea
								:value="f.fragment"
								class="vs-input vs-textarea wide"
								rows="6"
								@input="(e) => patchFilter(f.id, { fragment: (e.target as HTMLTextAreaElement).value })"
							/>
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
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState, type VideoSceneTreeNode, type VideoSceneUserNodeType } from '../../../../store/videoscene'
import { VideoStudioKey, type VideoStudioState } from '../../../../store/videostudio'
import { DwebCanvasGLKey } from '../../VideoSceneRuntime'

defineOptions({ name: 'VideoNodeDetailForm' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

type VideoNodeFilterType = 'blur' | 'glow' | 'customShader'
type VideoNodeFilterBase = { id: string; type: VideoNodeFilterType; qualityV2?: boolean }
type FilterQuality = 'low' | 'mid' | 'high'
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

const createId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const dwebCanvasRef = inject(DwebCanvasGLKey, null)
const filterMenuOpen = ref(false)
const draggingFilterId = ref<string | null>(null)
const shaderLogsById = reactive<Record<string, string>>({})
const shaderOkById = reactive<Record<string, boolean>>({})

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

const filters = computed<VideoNodeFilter[]>(() => {
	const s = selected.value
	if (!s) return []
	const p: any = s.node.props ?? {}
	return Array.isArray(p.filters) ? (p.filters as VideoNodeFilter[]) : []
})

const filtersUi = computed<VideoNodeFilter[]>(() => {
	return filters.value.map((f) => ({ ...(f as any), quality: normalizeQualityForUi(f) })) as any
})

const patchNodeProps = (patch: Record<string, any>) => {
	const s = selected.value
	if (!s) return
	store.dispatch('updateNodeProps', { layerId: s.layerId, nodeId: s.node.id, patch })
	// Ensure immediate visual feedback (avoid stale frame residue)
	dwebCanvasRef?.value?.requestRender?.()
}

const updateFilters = (next: VideoNodeFilter[]) => {
	patchNodeProps({ filters: next })
}

const addFilter = (type: VideoNodeFilterType) => {
	const next = [...filters.value]
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
	const next = filters.value.filter((f) => f.id !== id)
	delete shaderLogsById[id]
	delete shaderOkById[id]
	updateFilters(next)
}

const moveFilter = (id: string, dir: -1 | 1) => {
	const list = [...filters.value]
	const idx = list.findIndex((f) => f.id === id)
	if (idx < 0) return
	const target = idx + dir
	if (target < 0 || target >= list.length) return
	const tmp = list[idx]
	list[idx] = list[target]
	list[target] = tmp
	updateFilters(list)
}

const patchFilter = (id: string, patch: Record<string, any>) => {
	const list = filters.value.map((f) => {
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
	const list = [...filters.value]
	const fromIdx = list.findIndex((f) => f.id === fromId)
	const toIdx = list.findIndex((f) => f.id === targetId)
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

const nodeImageInputRef = ref<HTMLInputElement | null>(null)

const currentImageUrl = computed(() => {
	const id = String(draft.imageId || '').trim()
	if (id) {
		const asset: any = (store.state as any).imageAssets?.[id]
		const u = String(asset?.url ?? '').trim()
		if (u) return u
	}
	return String(draft.imagePath || '').trim()
})

const openNodeImagePicker = () => {
	try {
		nodeImageInputRef.value?.click()
	} catch {
		// ignore
	}
}

const genImageAssetId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const onPickNodeImageFile = (e: Event) => {
	const input = e.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	const url = URL.createObjectURL(file)
	const id = genImageAssetId()

	store.dispatch('upsertImageAsset', { id, url, name: file.name })
	draft.imageId = id
	draft.imagePath = url
	draft.imageName = file.name
	applyProps('image')

	// allow picking the same file again
	try {
		if (input) input.value = ''
	} catch {
		// ignore
	}
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