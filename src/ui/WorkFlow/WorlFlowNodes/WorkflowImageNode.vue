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
			<div ref="mediaEl" class="wf-media" :class="{ 'is-custom-sized': sizeCustomized }" :style="mediaStyle">
				<div
					v-if="resourceUrl"
					ref="previewWrap"
					class="wf-media-preview"
					:style="previewStyle"
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

				<div ref="actionsEl" class="wf-media-actions" @pointerdown.stop>
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

const { t } = useI18n()

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
	sizeCustomized?: boolean
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
const mediaEl = ref<HTMLElement | null>(null)
const actionsEl = ref<HTMLElement | null>(null)
const lastResourceUrl = ref('')
const pendingResourceReset = ref(false)
const failedPreviewUrl = ref('')
const resourceFallbackUrl = ref('')

/** DOM模式下固定的水平padding开销（来自CSS：wf-node左右padding 20px + body border 2px + body左右padding 16px = 38px） */
const HORIZONTAL_PADDING = 38
/** sizeCustomized模式下一次性测量的垂直固定开销（header + footer + wf-node padding + body border/padding + gap） */
const measuredVerticalOverhead = ref(130)
/** 按钮区域高度（一次性测量后缓存） */
const measuredActionsHeight = ref(32)

/**
 * 计算媒体容器可用宽度（扣除左右padding/border）
 * sizeCustomized和autoHeight模式均使用：直接基于props.width做减法
 */
const availableWidth = computed(() => {
	const w = Number(props.width) || 0
	return Math.max(60, Math.floor(w - HORIZONTAL_PADDING))
})

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

/** 计算预览区像素高度（供wrapSize/displayRect使用） */
const previewHeight = computed(() => {
	const w = availableWidth.value
	const nw = naturalWidth.value
	const nh = naturalHeight.value
	const gapPx = 8
	if (props.sizeCustomized) {
		const nodeH = Number(props.height) || 0
		// 总开销 = 节点级固定开销 + 按钮高度 + gap（按钮始终显示）
		const totalOverhead = measuredVerticalOverhead.value + measuredActionsHeight.value + gapPx
		return Math.max(60, Math.floor(nodeH - totalOverhead))
	}
	if (nw && nh && nw > 0 && nh > 0 && w > 10) {
		return Math.max(60, Math.floor(w / (nw / nh)))
	}
	return Math.max(60, w > 10 ? w : 200)
})

const wrapSize = computed(() => ({ w: availableWidth.value, h: previewHeight.value }))

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

/**
 * .wf-media 容器内联样式
 * - sizeCustomized模式：直接基于props.height减去固定开销设置显式高度，不使用flex:1
 * - autoHeight模式：不设固定高度，由内容撑开
 */
const mediaStyle = computed<Record<string, string>>(() => {
	if (props.sizeCustomized) {
		const nodeH = Number(props.height) || 0
		// media高度 = 节点总高度 - 节点级固定开销（header+footer+wf-node padding+body border/padding）
		const mediaH = Math.max(60, Math.floor(nodeH - measuredVerticalOverhead.value))
		return {
			width: '100%',
			height: `${mediaH}px`,
			flex: '0 0 auto',
			minHeight: `${mediaH}px`,
			maxHeight: `${mediaH}px`,
			overflow: 'hidden'
		} as Record<string, string>
	}
	return {} as Record<string, string>
})

/**
 * 预览区样式 - 直接基于props做减法计算，不使用ResizeObserver，不触发autoResize
 *
 * 两种模式：
 * 1. sizeCustomized=true（手动调整尺寸/锁定比例）：
 *    预览高度 = 节点总高度 - 固定垂直开销 - 按钮高度 - gap
 *    宽度 = 节点宽度 - 水平padding
 *    完全基于props计算，不依赖DOM测量，不会产生反馈循环
 * 2. sizeCustomized=false（自动高度模式）：
 *    预览高度 = 可用宽度 / 图片宽高比（按比例计算）
 */
const previewStyle = computed<Record<string, string>>(() => {
	const w = availableWidth.value
	const nw = naturalWidth.value
	const nh = naturalHeight.value
	const gapPx = 8

	let h: number

	if (props.sizeCustomized) {
		// 手动调整尺寸模式：直接基于props.height做减法
		const nodeH = Number(props.height) || 0
		const totalOverhead = measuredVerticalOverhead.value + measuredActionsHeight.value + gapPx
		h = Math.max(60, Math.floor(nodeH - totalOverhead))
	} else {
		// 自动高度模式：按图片比例计算高度
		if (nw && nh && nw > 0 && nh > 0 && w > 10) {
			const ratio = nw / nh
			h = Math.max(60, Math.floor(w / ratio))
		} else if (w > 10) {
			h = w
		} else {
			h = 200
		}
	}

	return {
		width: '100%',
		height: `${h}px`,
		flex: '0 0 auto',
		minHeight: `${h}px`,
		maxHeight: `${h}px`
	} as Record<string, string>
})

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
	return {
		left: '0px',
		top: '0px',
		width: '100%',
		height: '100%',
		objectFit: 'contain',
		objectPosition: 'center'
	} as Record<string, string>
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

/**
 * autoHeight模式下多次触发autoResize确保节点高度正确
 * sizeCustomized模式下直接return（节点尺寸由蓝图props锁定，绝不能自动调整，否则无限增长）
 */
const triggerAutoResizeMultiple = () => {
	if (props.sizeCustomized) return
	nextTick(() => {
		baseRef.value?.requestAutoResize()
		requestAnimationFrame(() => {
			baseRef.value?.requestAutoResize()
		})
		setTimeout(() => {
			baseRef.value?.requestAutoResize()
		}, 30)
		setTimeout(() => {
			baseRef.value?.requestAutoResize()
		}, 100)
		setTimeout(() => {
			baseRef.value?.requestAutoResize()
		}, 300)
	})
}

/**
 * 一次性测量DOM实际开销（header/footer/wf-node padding/body border+padding/按钮高度）
 * 只在mounted/resource变化后测量若干次，不使用ResizeObserver，不会产生反馈循环
 */
const measureDomOverhead = () => {
	if (!mediaEl.value) return
	const node = mediaEl.value.closest('.wf-node') as HTMLElement | null
	if (!node) return
	const header = node.querySelector('.wf-node-header') as HTMLElement | null
	const footer = node.querySelector('.wf-node-footer') as HTMLElement | null
	const actions = actionsEl.value

	const headerH = header?.offsetHeight || 0
	const footerH = footer?.offsetHeight || 0
	// wf-node padding: 8px top + 10px bottom = 18px
	const nodeVerticalPadding = 18
	// body border(1px*2) + padding(8px*2) = 18px
	const bodyChrome = 18
	// 按钮高度
	const actionsH = actions?.offsetHeight || 32

	// measuredVerticalOverhead = 节点级开销（不含.wf-media内部的按钮和gap）
	// 用于 mediaStyle: media高度 = props.height - measuredVerticalOverhead
	const overhead = headerH + footerH + nodeVerticalPadding + bodyChrome
	if (overhead > 40 && overhead < 800) {
		measuredVerticalOverhead.value = Math.ceil(overhead)
		measuredActionsHeight.value = Math.max(20, Math.ceil(actionsH))
	}
}

const onPreviewImageLoad = () => {
	scheduleInvalidateScreenshot(50)
	if (usingPreviewResource.value) {
		if (!naturalWidth.value || !naturalHeight.value || pendingResourceReset.value) {
			void ensureNaturalSizeFallback()
		}
		emit('media-ready')
		triggerAutoResizeMultiple()
		return
	}

	const img = previewImg.value
	if (img) {
		const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
		const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))

		const needsUpdate = w !== naturalWidth.value || h !== naturalHeight.value
		if (!needsUpdate && !pendingResourceReset.value) {
			emit('media-ready')
			triggerAutoResizeMultiple()
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
	triggerAutoResizeMultiple()
}

const onPreviewImageError = () => {
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
	() => [naturalWidth.value, naturalHeight.value, props.sizeCustomized, props.width, props.height],
	() => {
		// sizeCustomized模式：高度由props.height减法得出，不需要autoResize
		if (props.sizeCustomized) return
		// autoHeight模式：图片尺寸/节点尺寸变化时触发autoResize
		nextTick(() => {
			baseRef.value?.requestAutoResize()
			setTimeout(() => {
				baseRef.value?.requestAutoResize()
			}, 50)
		})
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
			if (!props.sizeCustomized) {
				nextTick(() => baseRef.value?.requestAutoResize())
			}
			return
		}
		if (next !== prev || next !== lastResourceUrl.value) {
			pendingResourceReset.value = true
			lastResourceUrl.value = next
			failedPreviewUrl.value = ''
			resourceFallbackUrl.value = ''
		}
		scheduleInvalidateScreenshot(50)
		nextTick(() => { measureDomOverhead() })
		await ensureNaturalSizeFallback()
		if (!props.sizeCustomized) {
			nextTick(() => {
				baseRef.value?.requestAutoResize()
				setTimeout(() => baseRef.value?.requestAutoResize(), 100)
				setTimeout(() => baseRef.value?.requestAutoResize(), 300)
			})
		}
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
	// 挂载后多次延迟测量DOM开销（确保DOM完全渲染后header/footer高度准确）
	// sizeCustomized模式不触发任何autoResize
	nextTick(() => { measureDomOverhead() })
	requestAnimationFrame(() => { measureDomOverhead() })
	setTimeout(() => { measureDomOverhead() }, 100)
	setTimeout(() => { measureDomOverhead() }, 300)
	setTimeout(() => {
		measureDomOverhead()
		if (!props.sizeCustomized) {
			baseRef.value?.requestAutoResize()
		}
	}, 500)
})

onBeforeUnmount(() => {
	if (invalidateScreenshotTimer != null) {
		clearTimeout(invalidateScreenshotTimer)
		invalidateScreenshotTimer = null
	}
	previewImg.value = null
})
</script>

<style scoped>
.wf-media {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	min-height: 0;
}

.wf-media.is-custom-sized {
	/* 高度由内联style mediaStyle显式控制（基于props.height减法计算） */
	min-height: 0;
	overflow: hidden;
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
	min-height: 80px;
}

.wf-media.is-custom-sized .wf-media-preview {
	/* 高度由内联style previewStyle动态控制（基于.wf-media实际高度计算） */
	min-height: 0;
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
	aspect-ratio: 1 / 1;
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
	flex-shrink: 0;
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
