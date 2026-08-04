<template>
	<WorkflowNodeBase
		ref="baseRef"
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="inputs"
		:outputs="outputs"
		:selected="selected"
		:isPrimarySelected="selected"
		:isSecondarySelected="false"
		:visualStatus="visualStatus"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		:nodeChatVisible="nodeChatVisible"
		:nodeChatNodeType="nodeChatNodeType"
		:nodeChatDraft="nodeChatDraft"
		:nodeChatSubmitting="nodeChatSubmitting"
		:nodeChatParams="nodeChatParams"
		:nodeChatSelectedRefs="nodeChatSelectedRefs"
		:input-param-preview-refs="inputParamPreviewRefs"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@update:world-position="(p) => emit('update:worldPosition', p)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-media">
				<div
					v-if="resourceUrl"
					ref="previewWrap"
					class="wf-media-preview"
					:style="{ ...previewWrapStyle, ...previewWrapExtraStyle }"
					@contextmenu.stop.prevent="onPreviewContextMenu"
				>
					<img
						ref="previewImg"
						class="wf-media-img"
						:src="displayResourceUrl"
						:style="previewImageStyle"
						alt="image preview"
						loading="lazy"
						decoding="async"
						draggable="false"
						@load="onPreviewImageLoad"
						@error="onPreviewImageError"
					/>
				</div>

				<div v-else class="wf-media-empty">
					<div class="wf-media-hint">{{ t('nodes.image.emptyHint') }}</div>
					<div class="wf-media-sub">{{ t('nodes.image.emptySub') }}</div>
				</div>

				<div class="wf-media-actions" @pointerdown.stop>
					<button class="wf-media-btn" type="button" @click.stop="onUploadClick">
						{{ resourceUrl ? t('nodes.image.replaceResource') : t('nodes.image.uploadResource') }}
					</button>
					<button
						v-if="resourceUrl"
						class="wf-media-btn ghost"
						type="button"
						@click.stop="emit('clear-resource')"
					>
						{{ t('nodes.image.clear') }}
					</button>
				</div>

				<input
					ref="fileInput"
					class="wf-file-input"
					type="file"
					accept="image/*"
					@change="onFileChange"
				/>
			</div>
		</template>

		<template #footer>
			<div class="wf-media-footer" @pointerdown.stop>
				<div class="wf-media-toolbar">
					<button
						class="wf-toolbar-btn"
						type="button"
						:disabled="!resourceUrl"
						@click.stop="onPreviewClick"
						:title="t('nodes.image.previewTooltip')"
					>
						<svg class="wf-icon" viewBox="0 0 24 24" aria-hidden="true">
							<path
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
							/>
							<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
						<span>{{ t('nodes.image.originalImage') }}</span>
					</button>

					<div class="wf-res">
						<input
							class="wf-res-input"
							type="number"
							min="1"
							inputmode="numeric"
							:value="outputWidthDisplay"
							:disabled="!resourceUrl"
							@change="onOutputWidthChange"
						/>
						<span class="wf-res-x">×</span>
						<input
							class="wf-res-input"
							type="number"
							min="1"
							inputmode="numeric"
							:value="outputHeightDisplay"
							:disabled="!resourceUrl"
							@change="onOutputHeightChange"
						/>
					</div>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { exportWorkflowImageOutputPng } from '../../../aiworkflow/imageOutput'
import { useAIWorkflowResourceCache } from '../../../views/AIWorkflow/assets/useAIWorkflowResourceCache'
import { useI18n } from '../../../i18n'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import {
	measureActionsHeightStable,
	readMediaVerticalGap
} from '../../../composables/useStableMediaHeight'

const { t } = useI18n()

// 工具：在 DOM 节点 class 切换后计算 1~2 次高度，避免持续观察导致的循环重绘
// 思路：放弃 ResizeObserver 持续监测，只在明确的「切换节点样式」事件之后各计算一次即可
// 第一次 nextTick 让样式过渡生效；第二次 setTimeout(80ms) 覆盖动画过渡结束后的最终态
const scheduleAfterClassChange = (fn: () => void) => {
	void nextTick(fn)
	window.setTimeout(fn, 80)
}

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	resourceUrl?: string | null
	resourceSourcePath?: string | null
	resourcePreviewUrl320?: string | null
	resourcePreviewUrl640?: string | null
	resourcePreviewVersion?: string | null
	resourceName?: string | null
	imageSettings?: {
		outputWidth?: number
		outputHeight?: number
		naturalWidth?: number
		naturalHeight?: number
		cropEnabled?: boolean
		crop?: { x: number; y: number; width: number; height: number }
	} | null
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
	visualStatus?: 'idle' | 'running' | 'error'
	sizeCustomized?: boolean
	autoHeight?: boolean
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, any>
	nodeChatSelectedRefs?: any[]
	inputParamPreviewRefs?: any[]
}>()

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(e: 'preview-contextmenu', payload: { clientX: number; clientY: number }): void
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
	(e: 'upload-resource', payload: { file: File; kind: 'image' | 'video' }): void
	(e: 'clear-resource'): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(
		e: 'update-image-settings',
		payload: {
			outputWidth?: number
			outputHeight?: number
			naturalWidth?: number
			naturalHeight?: number
			cropEnabled?: boolean
			crop?: { x: number; y: number; width: number; height: number }
		}
	): void
	(e: 'media-ready'): void
	(e: 'preview-request', payload: { imageUrl: string }): void
	(e: 'invalidate-screenshot'): void
}>()

const onStartLink = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (
	type:
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
) => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

let invalidateScreenshotTimer: number | null = null
const scheduleInvalidateScreenshot = (delayMs: number = 150) => {
	if (invalidateScreenshotTimer != null) {
		clearTimeout(invalidateScreenshotTimer)
	}
	invalidateScreenshotTimer = window.setTimeout(() => {
		invalidateScreenshotTimer = null
		emit('invalidate-screenshot')
	}, delayMs)
}

const fileInput = ref<HTMLInputElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)

const onPreviewContextMenu = (e: MouseEvent) => {
	emit('select', props.nodeId)
	emit('preview-contextmenu', { clientX: e.clientX, clientY: e.clientY })
}

const onPreviewClick = () => {
	const src = effectiveSourceUrl.value
	if (!src) return
	emit('select', props.nodeId)
	console.log('[WorkflowImageNode] preview click → nodeId:', props.nodeId, 'url:', src)
	emit('preview-request', { imageUrl: src })
}

const previewWrap = ref<HTMLElement | null>(null)
const previewImg = ref<HTMLImageElement | null>(null)
let ro: ResizeObserver | null = null
const lastResourceUrl = ref('')
const pendingResourceReset = ref(false)
const failedPreviewUrl = ref('')
const resourceFallbackUrl = ref('')

const normalizedResourceUrl = computed(() => String(props.resourceUrl ?? '').trim())
const normalizedResourceSourcePath = computed(() => String(props.resourceSourcePath ?? '').trim())
const effectiveSourceUrl = computed(() => {
	const fallback = String(resourceFallbackUrl.value || '').trim()
	if (fallback) return fallback
	return normalizedResourceUrl.value
})
const normalizedPreview320 = computed(() => String(props.resourcePreviewUrl320 ?? '').trim())
const normalizedPreview640 = computed(() => String(props.resourcePreviewUrl640 ?? '').trim())

const desiredPreviewTier = computed(() => {
	if (props.selected) return 0
	const zoom = Math.max(0.01, Number(props.zoom) || 1)
	if (zoom <= 0.36) return 320
	if (zoom <= 0.65) return 640
	return 0
})

const activePreviewUrl = computed(() => {
	const tier = desiredPreviewTier.value
	if (tier === 320) return normalizedPreview320.value || normalizedPreview640.value
	if (tier === 640) return normalizedPreview640.value || normalizedPreview320.value
	return ''
})

const displayResourceUrl = computed(() => {
	const source = effectiveSourceUrl.value
	if (!source) return ''
	const preview = activePreviewUrl.value
	if (!preview) return source
	if (preview === failedPreviewUrl.value) return source
	return preview
})

const usingPreviewResource = computed(() => {
	const source = effectiveSourceUrl.value
	if (!source) return false
	return displayResourceUrl.value === activePreviewUrl.value && displayResourceUrl.value !== source
})

const wrapSize = ref({ w: 1, h: 1 })

const outputWidth = computed(() => {
	const v = props.imageSettings?.outputWidth
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})
const outputHeight = computed(() => {
	const v = props.imageSettings?.outputHeight
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const naturalWidth = computed(() => {
	const v = props.imageSettings?.naturalWidth
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})
const naturalHeight = computed(() => {
	const v = props.imageSettings?.naturalHeight
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const outputAspect = computed(() => {
	const w = outputWidth.value ?? naturalWidth.value
	const h = outputHeight.value ?? naturalHeight.value
	if (!w || !h) return null
	return Math.max(1e-6, w / h)
})

const outputWidthDisplay = computed(() =>
	outputWidth.value != null ? String(outputWidth.value) : ''
)
const outputHeightDisplay = computed(() =>
	outputHeight.value != null ? String(outputHeight.value) : ''
)

const previewWrapStyle = computed(() => {
	if (props.autoHeight === false) {
		return {
			width: '100%',
			// height 不通过 binding 设置，由 applyPrecisePreviewSize() 直接写入 DOM.style
			flex: '0 0 auto',
			minHeight: '0',
			maxHeight: 'none'
		} as Record<string, string>
	}
	const imgW = naturalWidth.value ?? outputWidth.value
	const imgH = naturalHeight.value ?? outputHeight.value
	if (imgW && imgH && imgW > 0 && imgH > 0) {
		const ratio = imgW / imgH
		return {
			aspectRatio: `${ratio}`,
			width: '100%'
		} as Record<string, string>
	}
	return {
		aspectRatio: '1',
		width: '100%'
	} as Record<string, string>
})

const previewWrapExtraStyle = computed(() => {
	if (props.autoHeight === false) {
		return {} as Record<string, string>
	}
	return {
		flex: '0 0 auto'
	} as Record<string, string>
})

const findNodeRootEl = (): HTMLElement | null => {
	try {
		const b = baseRef.value as any
		return (b?.$el as HTMLElement) || null
	} catch {
		return null
	}
}

const clearPreviewPixelSize = () => {
	const el = previewWrap.value
	if (!el) return
	try {
		el.style.height = ''
		el.style.width = ''
	} catch {}
}

const applyPrecisePreviewSize = () => {
	// 只有用户 resize 过且有图片资源时才用像素级直写
	if (props.autoHeight !== false) {
		clearPreviewPixelSize()
		return
	}
	if (!displayResourceUrl.value) {
		clearPreviewPixelSize()
		return
	}
	const root = findNodeRootEl()
	if (!root) {
		clearPreviewPixelSize()
		return
	}
	const bodyEl = root.querySelector<HTMLElement>(':scope > .wf-node-body')
	if (!bodyEl) {
		clearPreviewPixelSize()
		return
	}
	const previewEl = previewWrap.value
	if (!previewEl) return

	// body 内部 padding 和 border：直接用 clientHeight 已经排除，无需再减
	const bodyInnerH = Math.max(0, Math.floor(bodyEl.clientHeight || 0))
	// 精确测量 actions 高度：优先 offsetHeight，并支持 DOM 未就绪时按按钮数量预判
	const hasResource = !!displayResourceUrl.value
	const actionsH = measureActionsHeightStable(bodyEl, hasResource)
	// 从 getComputedStyle 动态读取 wf-media gap，避免与样式硬编码不同步
	const gap = readMediaVerticalGap(bodyEl, 8)
	const available = Math.max(0, bodyInnerH - actionsH - gap)
	const bodyInnerW = Math.max(0, Math.floor(bodyEl.clientWidth || 0))
	const targetW = Math.max(0, bodyInnerW)

	if (available <= 0 || targetW <= 0) {
		// 空间还没准备好，下一轮再算
		return
	}
	try {
		const prevH = previewEl.style.height
		const prevW = previewEl.style.width
		const nextH = `${available}px`
		const nextW = `${targetW}px`
		// 完全相同就跳过，避免无意义的 DOM 写入
		if (prevH === nextH && prevW === nextW) {
			if (wrapSize.value.w !== targetW || wrapSize.value.h !== available) {
				wrapSize.value = { w: targetW, h: available }
			}
			return
		}
		previewEl.style.height = nextH
		previewEl.style.width = nextW
		if (wrapSize.value.w !== targetW || wrapSize.value.h !== available) {
			wrapSize.value = { w: targetW, h: available }
		}
	} catch {}
}

// 【关键】去掉了之前的 bodySizeRo 持续观察 —— 那是闪烁循环的根因
// 现在只在明确事件触发后调用 scheduleAfterClassChange(applyPrecisePreviewSize) 即可：
// 1) 选中/运行状态等 class 切换 watch 2) props.height/width 外部下发 watch
// 3) 资源加载 displayResourceUrl 变化 watch 4) onMounted 首次挂载 5) 图片 onload
// 这样保证「一次切换 → 1~2 次 apply → 结束」，不会触发循环
const installPreciseSizeLogic = () => {
	// 若 previewWrap 的尺寸同步 RO 还没安装，则安装；但它只更新 wrapSize，不会再反向 apply 高度
	const existingRo = ro
	if (previewWrap.value && !existingRo) {
		initPreviewLayoutObserver()
	} else if (previewWrap.value && existingRo) {
		try {
			existingRo.disconnect()
		} catch {}
		try {
			existingRo.observe(previewWrap.value)
		} catch {}
	}
	// 首次挂载：立即 + nextTick 各计算一次
	applyPrecisePreviewSize()
	void nextTick(() => applyPrecisePreviewSize())
}

type DisplayRect = { x: number; y: number; w: number; h: number }

const displayRect = computed<DisplayRect>(() => {
	const w = Math.max(1, wrapSize.value.w)
	const h = Math.max(1, wrapSize.value.h)
	const imgW = naturalWidth.value ?? 1
	const imgH = naturalHeight.value ?? 1
	const scale = Math.min(w / Math.max(1, imgW), h / Math.max(1, imgH))
	const dw = Math.max(1, imgW * scale)
	const dh = Math.max(1, imgH * scale)
	return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh }
})

const previewImageStyle = computed(() => {
	return {} as Record<string, string>
})

const { getCachedResource, loadResource, getResourceSize } = useAIWorkflowResourceCache()

type ImageSettingsPatch = {
	outputWidth?: number
	outputHeight?: number
	naturalWidth?: number
	naturalHeight?: number
	cropEnabled?: boolean
	crop?: { x: number; y: number; width: number; height: number }
}

const ensureNaturalSizeFallback = async () => {
	const sourceUrl = effectiveSourceUrl.value
	if (!sourceUrl) return
	if (naturalWidth.value && naturalHeight.value && !pendingResourceReset.value) return

	const cachedSize = getResourceSize(sourceUrl)
	if (cachedSize) {
		const patch: ImageSettingsPatch = {
			naturalWidth: cachedSize.width,
			naturalHeight: cachedSize.height
		}
		if (pendingResourceReset.value || !outputWidth.value || !outputHeight.value) {
			patch.outputWidth = cachedSize.width
			patch.outputHeight = cachedSize.height
		}
		emit('update-image-settings', patch)
		pendingResourceReset.value = false
		return
	}

	const cached = getCachedResource(sourceUrl)
	if (cached && cached.loaded && cached.size) {
		const patch: ImageSettingsPatch = {
			naturalWidth: cached.size.width,
			naturalHeight: cached.size.height
		}
		if (pendingResourceReset.value || !outputWidth.value || !outputHeight.value) {
			patch.outputWidth = cached.size.width
			patch.outputHeight = cached.size.height
		}
		emit('update-image-settings', patch)
		pendingResourceReset.value = false
		return
	}

	const resource = await loadResource(sourceUrl, 'image')
	if (!resource.error && resource.size) {
		const patch: ImageSettingsPatch = {
			naturalWidth: resource.size.width,
			naturalHeight: resource.size.height
		}
		if (pendingResourceReset.value || !outputWidth.value || !outputHeight.value) {
			patch.outputWidth = resource.size.width
			patch.outputHeight = resource.size.height
		}
		emit('update-image-settings', patch)
		pendingResourceReset.value = false
	}
}

const toFileUrl = (path: string) => {
	if (!path) return ''
	try {
		return `file:///${path.replace(/\\/g, '/')}`
	} catch {
		return ''
	}
}

const applyOutputQualityByWidth = async (nextW: number) => {
	await ensureNaturalSizeFallback()
	const natW = naturalWidth.value
	const natH = naturalHeight.value
	if (!natW || !natH) return
	const w = Math.max(1, Math.round(Math.max(1, nextW)))
	const h = Math.max(1, Math.round((w * natH) / Math.max(1e-6, natW)))
	emit('update-image-settings', { outputWidth: w, outputHeight: h })
}

const applyOutputQualityByHeight = async (nextH: number) => {
	await ensureNaturalSizeFallback()
	const natW = naturalWidth.value
	const natH = naturalHeight.value
	if (!natW || !natH) return
	const h = Math.max(1, Math.round(Math.max(1, nextH)))
	const w = Math.max(1, Math.round((h * natW) / Math.max(1e-6, natH)))
	emit('update-image-settings', { outputWidth: w, outputHeight: h })
}

const onOutputWidthChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const v = Math.max(1, Math.floor(Number(input.value) || 0))
	if (!v) return
	void applyOutputQualityByWidth(v)
}

const onOutputHeightChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const v = Math.max(1, Math.floor(Number(input.value) || 0))
	if (!v) return
	void applyOutputQualityByHeight(v)
}

const onUploadClick = () => {
	fileInput.value?.click()
}

const onFileChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	emit('upload-resource', { file, kind: 'image' })
	input.value = ''
}

const initPreviewLayoutObserver = () => {
	if (!previewWrap.value) return
	if (ro) return
	ro = new ResizeObserver((entries) => {
		const r = entries[0]?.contentRect
		if (!r) return
		const w = Math.max(1, Math.floor(r.width))
		const h = Math.max(1, Math.floor(r.height))
		wrapSize.value = { w, h }
	})
	ro.observe(previewWrap.value)

	wrapSize.value = {
		w: Math.max(1, Math.floor(previewWrap.value.clientWidth || 1)),
		h: Math.max(1, Math.floor(previewWrap.value.clientHeight || 1))
	}
}

const onPreviewImageLoad = () => {
	scheduleInvalidateScreenshot(50)
	if (usingPreviewResource.value) {
		if (!naturalWidth.value || !naturalHeight.value || pendingResourceReset.value) {
			void ensureNaturalSizeFallback()
		}
		emit('media-ready')
		nextTick(() => baseRef.value?.requestAutoResize())
		return
	}

	const img = previewImg.value
	if (img) {
		const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
		const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))

		const needsUpdate = w !== naturalWidth.value || h !== naturalHeight.value
		if (!needsUpdate && !pendingResourceReset.value) {
			emit('media-ready')
			nextTick(() => baseRef.value?.requestAutoResize())
			return
		}

		const patch: ImageSettingsPatch = { naturalWidth: w, naturalHeight: h }
		if (pendingResourceReset.value || !outputWidth.value || !outputHeight.value) {
			patch.outputWidth = w
			patch.outputHeight = h
		}
		emit('update-image-settings', patch)
		pendingResourceReset.value = false
	} else {
		void ensureNaturalSizeFallback()
	}
	emit('media-ready')
	nextTick(() => baseRef.value?.requestAutoResize())
	// 图片加载完成后重新核对一次预览区高度（尺寸可能会影响 body 实际可用高度）
	scheduleAfterClassChange(applyPrecisePreviewSize)
}

const onPreviewImageError = (event?: Event) => {
	console.error('[WorkflowImageNode] Image load error for node:', props.nodeId, {
		resourceUrl: normalizedResourceUrl.value,
		displayUrl: displayResourceUrl.value,
		activePreviewUrl: activePreviewUrl.value,
		fallbackUrl: resourceFallbackUrl.value,
		target: (event?.target as HTMLImageElement)?.src
	})
	scheduleInvalidateScreenshot(50)
	if (usingPreviewResource.value) {
		failedPreviewUrl.value = activePreviewUrl.value
		scheduleInvalidateScreenshot(100)
		return
	}
	const sourceFilePath = normalizedResourceSourcePath.value
	if (!resourceFallbackUrl.value && sourceFilePath) {
		const fileUrl = toFileUrl(sourceFilePath)
		if (fileUrl) {
			resourceFallbackUrl.value = fileUrl
			scheduleInvalidateScreenshot(100)
			return
		}
	}
	emit('media-ready')
}

watch(
	() => [props.resourcePreviewUrl320, props.resourcePreviewUrl640],
	() => {
		failedPreviewUrl.value = ''
		scheduleInvalidateScreenshot(100)
	}
)

watch(
	() => props.resourceUrl,
	async (nextUrl, prevUrl) => {
		await nextTick()
		const next = String(nextUrl ?? '').trim()
		const prev = String(prevUrl ?? '').trim()
		if (!next) {
			pendingResourceReset.value = false
			lastResourceUrl.value = ''
			failedPreviewUrl.value = ''
			resourceFallbackUrl.value = ''
			scheduleInvalidateScreenshot(50)
			return
		}
		if (next !== prev || next !== lastResourceUrl.value) {
			pendingResourceReset.value = true
			lastResourceUrl.value = next
			failedPreviewUrl.value = ''
			resourceFallbackUrl.value = ''
		}
		scheduleInvalidateScreenshot(50)
		initPreviewLayoutObserver()
		await ensureNaturalSizeFallback()
	},
	{ immediate: true }
)

watch(
	() => [
		props.imageSettings?.outputWidth,
		props.imageSettings?.outputHeight,
		props.imageSettings?.cropEnabled,
		props.imageSettings?.crop
	],
	() => {
		scheduleInvalidateScreenshot(150)
	},
	{ deep: true }
)

watch(
	() => [outputWidth.value, outputHeight.value],
	async () => {
		await nextTick()
		scheduleInvalidateScreenshot(100)
	},
	{ flush: 'post' }
)

watch(
	() => resourceFallbackUrl.value,
	() => {
		scheduleInvalidateScreenshot(100)
	}
)

// 用户 resize 节点 / 切换 autoHeight / 资源变化时，重新计算预览容器尺寸
// 【不使用 ResizeObserver 持续观察】只在外部下发 props 后直接 apply 1~2 次即可
watch(
	() => [props.height, props.width, props.autoHeight],
	async () => {
		await nextTick()
		applyPrecisePreviewSize()
		if (props.autoHeight === false) {
			// 首次切换到固定尺寸模式时，可能尺寸还没稳定，再补一次 80ms 后的最终值
			window.setTimeout(() => applyPrecisePreviewSize(), 80)
			// 确保 previewWrap 的 RO 已装好（仅用于同步 wrapSize 显示尺寸，不反向 apply 高度）
			if (!ro) initPreviewLayoutObserver()
		} else {
			clearPreviewPixelSize()
		}
	},
	{ flush: 'post' }
)

// 图片加载完成后，重新核对尺寸（图片首次显示时可能改变布局）——仅此一次，不循环
watch(
	() => displayResourceUrl.value,
	async () => {
		await nextTick()
		applyPrecisePreviewSize()
		// 图片 DOM 首次出现可能让布局重新计算，再补一次即可
		window.setTimeout(() => applyPrecisePreviewSize(), 80)
	},
	{ flush: 'post' }
)

// 选中/任务状态类名切换：DOM 样式 class 切换之后计算 1~2 次
// 这是本次需求「切换DOM节点样式后才重新获取高度」的核心触发源
watch(
	() => [props.selected, props.visualStatus],
	() => {
		scheduleAfterClassChange(applyPrecisePreviewSize)
	}
)

defineExpose({
	exportPngBlob: async () => {
		const src = effectiveSourceUrl.value
		if (!src) return null
		const w = outputWidth.value
		const h = outputHeight.value
		if (!w || !h) return null
		return exportWorkflowImageOutputPng({
			src,
			outputWidth: w,
			outputHeight: h,
			crop: null
		})
	}
})

onMounted(() => {
	initPreviewLayoutObserver()
	void nextTick(() => installPreciseSizeLogic())
})

onBeforeUnmount(() => {
	try {
		ro?.disconnect()
	} catch {}
	if (invalidateScreenshotTimer != null) {
		clearTimeout(invalidateScreenshotTimer)
		invalidateScreenshotTimer = null
	}
	ro = null
	previewImg.value = null
})
</script>

<style scoped>
.wf-media {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
	align-self: stretch;
}

.wf-media-preview {
	width: 100%;
	flex: 0 0 auto;
	border-radius: 6px;
	overflow: hidden;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	position: relative;
	display: block;
}

.wf-media-img {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	display: block;
	max-width: none;
	object-fit: contain;
	object-position: center;
}

.wf-media-empty {
	width: 100%;
	flex: 1 1 auto;
	min-height: 200px;
	border: 1px dashed var(--vscode-border);
	border-radius: 6px;
	padding: 10px;
	text-align: center;
	color: var(--vscode-fg-muted);
	background: var(--dweb-defualt);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
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
	flex: 0 0 auto;
}

.wf-media-footer {
	width: 100%;
	margin-top: 6px;
	flex: 0 0 auto;
}

.wf-media-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
}

.wf-toolbar-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
}

.wf-toolbar-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.wf-toolbar-btn:hover:not(:disabled) {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.wf-icon {
	width: 16px;
	height: 16px;
}

.wf-res {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.wf-res-input {
	width: 74px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 4px 6px;
	font-size: 12px;
}

.wf-res-input:disabled {
	opacity: 0.6;
}

.wf-res-x {
	color: var(--vscode-fg-muted);
	font-size: 12px;
}

.wf-media-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
}

.wf-media-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.wf-media-btn.ghost {
	color: var(--vscode-fg-muted);
}

.wf-file-input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.wf-toolbar-divider {
	width: 1px;
	height: 24px;
	background: var(--vscode-border);
	margin: 0 4px;
}

.wf-model-select {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 4px 8px;
	font-size: 12px;
	cursor: pointer;
}

.wf-model-select:hover {
	border-color: var(--vscode-hover-border);
}

.wf-meshy-panel {
	margin-top: 10px;
	display: grid;
	gap: 10px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
	padding: 10px;
}

.wf-meshy-row {
	display: grid;
	gap: 10px;
}

.wf-meshy-row-grid {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.wf-meshy-field {
	display: grid;
	gap: 6px;
}

.wf-meshy-label {
	font-size: 11px;
	color: #9ec2dd;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.wf-meshy-input,
.wf-meshy-textarea {
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
	border-radius: 0;
}

.wf-meshy-textarea {
	resize: vertical;
	min-height: 60px;
}

.wf-meshy-textarea.compact {
	min-height: 48px;
}

.wf-meshy-switch-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--vscode-fg);
}

.wf-meshy-status-area {
	display: grid;
	gap: 8px;
	padding: 8px;
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.4);
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.68);
}

.wf-meshy-status-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
}

.wf-meshy-status-label {
	color: var(--vscode-fg-muted);
}

.wf-meshy-status-value {
	color: var(--vscode-fg);
}

.wf-meshy-status-value.is-running,
.wf-meshy-status-value.is-pending {
	color: #5bb6ff;
}

.wf-meshy-status-value.is-succeeded {
	color: #38b98c;
}

.wf-meshy-status-value.is-failed {
	color: #f87171;
}

.wf-meshy-status-value.is-canceled {
	color: var(--vscode-fg-muted);
}

.wf-meshy-progress-bar {
	height: 6px;
	background: rgb(from var(--vscode-border) r g b / 0.4);
	border-radius: 3px;
	overflow: hidden;
}

.wf-meshy-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #5bb6ff, #38b98c);
	transition: width 300ms ease;
}

.wf-meshy-task-id {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	word-break: break-all;
}

.wf-meshy-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
</style>
