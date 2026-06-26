<template>
	<div v-if="visible" class="imd-mask" @mousedown.self="onClose">
		<div class="imd-dialog" role="dialog" aria-label="图片预览与标记">
			<div class="imd-toolbar">
				<div class="imd-toolbar-left">
					<span class="imd-title">图片预览与标记</span>
				</div>
				<div class="imd-toolbar-right">
					<button
						class="imd-btn"
						type="button"
						:class="{ active: mode === 'view' }"
						@click="setMode('view')"
						title="浏览模式：拖拽移动"
					>
						浏览
					</button>
					<button
						class="imd-btn"
						type="button"
						:class="{ active: mode === 'brush' }"
						@click="setMode('brush')"
						title="画笔模式：红色画笔标记"
					>
						画笔
					</button>
					<span class="imd-sep"></span>
					<button class="imd-btn" type="button" @click="zoomBy(1.2)" title="放大">放大</button>
					<button class="imd-btn" type="button" @click="zoomBy(1 / 1.2)" title="缩小">缩小</button>
					<button class="imd-btn" type="button" @click="resetTransform" title="重置为原始大小">
						重置
					</button>
					<button class="imd-btn" type="button" @click="fitToView" title="适应窗口">适应</button>
					<span class="imd-sep"></span>
					<button class="imd-btn" type="button" @click="rotateBy(-90)" title="向左旋转 90°">
						左旋
					</button>
					<button class="imd-btn" type="button" @click="rotateBy(90)" title="向右旋转 90°">
						右旋
					</button>
					<span class="imd-sep"></span>
					<label class="imd-brush-label">
						画笔粗细：
						<input
							type="range"
							min="1"
							max="40"
							step="1"
							v-model.number="brushSize"
							class="imd-brush-range"
						/>
						<span class="imd-brush-size">{{ brushSize }}px</span>
					</label>
					<span class="imd-sep"></span>
					<button class="imd-btn" type="button" @click="clearBrush" title="清除所有画笔标记">
						清除标记
					</button>
					<button
						class="imd-btn imd-btn-primary"
						type="button"
						@click="onExportMarkup"
						title="将带有画笔标记的图像导出为新的图片节点，并自动连接当前图片节点"
					>
						导出标记
					</button>
					<button class="imd-btn" type="button" @click="onClose" title="关闭">关闭</button>
				</div>
			</div>

			<div
				ref="viewportRef"
				class="imd-viewport"
				:class="mode"
				@wheel.prevent="onWheel"
				@mousedown="onMouseDown"
				@mousemove="onMouseMove"
				@mouseup="onMouseUp"
				@mouseleave="onMouseUp"
			>
				<canvas ref="canvasRef" class="imd-canvas" :style="canvasStyle"></canvas>
				<canvas ref="overlayRef" class="imd-overlay" :style="canvasStyle"></canvas>
				<div v-if="!imageLoaded" class="imd-loading">
					<div class="imd-loading-text">图片加载中…</div>
				</div>
				<div v-if="imageLoaded && naturalWidth" class="imd-info">
					原始尺寸：{{ naturalWidth }} × {{ naturalHeight }} | 缩放：{{ Math.round(zoom * 100) }}% |
					旋转：{{ rotation }}°
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
	visible: boolean
	imageUrl: string | null
	sourceName?: string | null
}>()

const emit = defineEmits<{
	(e: 'update:visible', v: boolean): void
	(
		e: 'export-markup',
		payload: { file: File; dataUrl: string; width: number; height: number }
	): void
}>()

type Mode = 'view' | 'brush'

const viewportRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const overlayRef = ref<HTMLCanvasElement | null>(null)

const mode = ref<Mode>('view')
const zoom = ref<number>(1)
const rotation = ref<number>(0)
const offsetX = ref<number>(0)
const offsetY = ref<number>(0)

const brushSize = ref<number>(6)
const brushStrokes = ref<Array<Array<{ x: number; y: number }>>>([])
const currentStroke = ref<Array<{ x: number; y: number }> | null>(null)

const naturalWidth = ref<number>(0)
const naturalHeight = ref<number>(0)
const imageLoaded = ref<boolean>(false)
const sourceImage = ref<HTMLImageElement | null>(null)

let dragState: { startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null =
	null
let wheelAccum = 0
let wheelTimer: number | null = null

const canvasStyle = computed(() => {
	const w = naturalWidth.value || 1
	const h = naturalHeight.value || 1
	return {
		width: `${w}px`,
		height: `${h}px`,
		transform: `translate(-50%, -50%) translate(${offsetX.value}px, ${offsetY.value}px) rotate(${rotation.value}deg) scale(${zoom.value})`,
		transformOrigin: '50% 50%'
	} as Record<string, string>
})

const setMode = (m: Mode) => {
	mode.value = m
}

const zoomBy = (factor: number) => {
	const next = Math.max(0.05, Math.min(20, zoom.value * factor))
	zoom.value = next
}

const resetTransform = () => {
	zoom.value = 1
	rotation.value = 0
	offsetX.value = 0
	offsetY.value = 0
}

const fitToView = async () => {
	await nextTick()
	const vp = viewportRef.value
	const img = sourceImage.value
	if (!vp || !img || !img.naturalWidth) return
	const vpRect = vp.getBoundingClientRect()
	const padX = 40
	const padY = 80
	const availableW = Math.max(1, vpRect.width - padX)
	const availableH = Math.max(1, vpRect.height - padY)
	const scale = Math.min(availableW / img.naturalWidth, availableH / img.naturalHeight, 1)
	zoom.value = scale
	rotation.value = 0
	offsetX.value = 0
	offsetY.value = 0
}

const rotateBy = (deg: number) => {
	rotation.value = (((rotation.value + deg) % 360) + 360) % 360
}

const clearBrush = () => {
	brushStrokes.value = []
	redrawOverlay()
}

const onWheel = (e: WheelEvent) => {
	// Use smooth accumulation: negative deltaY means scroll down -> zoom out (inverted).
	wheelAccum += e.deltaY
	if (wheelTimer != null) {
		return
	}
	wheelTimer = window.setTimeout(() => {
		wheelTimer = null
		const delta = wheelAccum
		wheelAccum = 0
		const factor = Math.exp(-delta / 600)
		zoomBy(factor)
	}, 20)
}

const pointerToImageCoords = (
	clientX: number,
	clientY: number
): { x: number; y: number } | null => {
	const canvas = canvasRef.value
	if (!canvas) return null
	const rect = canvas.getBoundingClientRect()
	const localX = clientX - rect.left
	const localY = clientY - rect.top
	const imgW = naturalWidth.value || 1
	const imgH = naturalHeight.value || 1
	const scaleX = imgW / rect.width
	const scaleY = imgH / rect.height
	return { x: localX * scaleX, y: localY * scaleY }
}

const onMouseDown = (e: MouseEvent) => {
	if (e.button !== 0) return
	if (mode.value === 'view') {
		dragState = {
			startX: e.clientX,
			startY: e.clientY,
			origOffsetX: offsetX.value,
			origOffsetY: offsetY.value
		}
		return
	}
	if (mode.value === 'brush') {
		const pt = pointerToImageCoords(e.clientX, e.clientY)
		if (!pt) return
		currentStroke.value = [pt]
		redrawOverlay()
	}
}

const onMouseMove = (e: MouseEvent) => {
	if (mode.value === 'view' && dragState) {
		offsetX.value = dragState.origOffsetX + (e.clientX - dragState.startX)
		offsetY.value = dragState.origOffsetY + (e.clientY - dragState.startY)
		return
	}
	if (mode.value === 'brush' && currentStroke.value) {
		const pt = pointerToImageCoords(e.clientX, e.clientY)
		if (!pt) return
		currentStroke.value.push(pt)
		redrawOverlay()
	}
}

const onMouseUp = () => {
	if (dragState) {
		dragState = null
	}
	if (mode.value === 'brush' && currentStroke.value && currentStroke.value.length > 0) {
		brushStrokes.value.push(currentStroke.value)
		currentStroke.value = null
		redrawOverlay()
	}
}

const drawStroke = (
	ctx: CanvasRenderingContext2D,
	stroke: Array<{ x: number; y: number }>,
	size: number
) => {
	if (!stroke.length) return
	ctx.save()
	ctx.strokeStyle = '#ff2d2d'
	ctx.lineWidth = size
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	ctx.globalCompositeOperation = 'source-over'
	if (stroke.length === 1) {
		const pt = stroke[0]
		ctx.beginPath()
		ctx.arc(pt.x, pt.y, Math.max(1, size / 2), 0, Math.PI * 2)
		ctx.fillStyle = '#ff2d2d'
		ctx.fill()
		ctx.restore()
		return
	}
	ctx.beginPath()
	ctx.moveTo(stroke[0].x, stroke[0].y)
	for (let i = 1; i < stroke.length; i++) {
		ctx.lineTo(stroke[i].x, stroke[i].y)
	}
	ctx.stroke()
	ctx.restore()
}

const redrawOverlay = () => {
	const overlay = overlayRef.value
	const img = sourceImage.value
	if (!overlay || !img || !img.naturalWidth) return
	const dpr = 1
	overlay.width = img.naturalWidth * dpr
	overlay.height = img.naturalHeight * dpr
	const ctx = overlay.getContext('2d')
	if (!ctx) return
	ctx.clearRect(0, 0, overlay.width, overlay.height)
	for (const stroke of brushStrokes.value) drawStroke(ctx, stroke, brushSize.value)
	if (currentStroke.value && currentStroke.value.length > 0) {
		drawStroke(ctx, currentStroke.value, brushSize.value)
	}
}

const drawBaseImage = async () => {
	const canvas = canvasRef.value
	const img = sourceImage.value
	if (!canvas || !img || !img.naturalWidth) return
	canvas.width = img.naturalWidth
	canvas.height = img.naturalHeight
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.drawImage(img, 0, 0)
	naturalWidth.value = img.naturalWidth
	naturalHeight.value = img.naturalHeight
}

const loadImage = async (url: string) => {
	imageLoaded.value = false
	naturalWidth.value = 0
	naturalHeight.value = 0
	brushStrokes.value = []
	currentStroke.value = null
	const img = new Image()
	img.crossOrigin = 'anonymous'
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve()
		img.onerror = () => reject(new Error('image load failed'))
		img.src = url
	})
	sourceImage.value = img
	await drawBaseImage()
	redrawOverlay()
	imageLoaded.value = true
	await fitToView()
}

const composeExportDataUrl = (): { dataUrl: string; width: number; height: number } | null => {
	const base = canvasRef.value
	const overlay = overlayRef.value
	if (!base || !overlay) return null
	const exportCanvas = document.createElement('canvas')
	exportCanvas.width = base.width
	exportCanvas.height = base.height
	const ctx = exportCanvas.getContext('2d')
	if (!ctx) return null
	ctx.save()
	const centerX = base.width / 2
	const centerY = base.height / 2
	if (rotation.value !== 0) {
		const temp = document.createElement('canvas')
		temp.width = base.width
		temp.height = base.height
		const tempCtx = temp.getContext('2d')
		if (!tempCtx) return null
		tempCtx.drawImage(base, 0, 0)
		tempCtx.drawImage(overlay, 0, 0)
		ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height)
		ctx.translate(centerX, centerY)
		ctx.rotate((rotation.value * Math.PI) / 180)
		ctx.drawImage(temp, -centerX, -centerY)
	} else {
		ctx.drawImage(base, 0, 0)
		ctx.drawImage(overlay, 0, 0)
	}
	ctx.restore()
	const dataUrl = exportCanvas.toDataURL('image/png')
	return { dataUrl, width: exportCanvas.width, height: exportCanvas.height }
}

const dataUrlToFile = (dataUrl: string, name: string): File => {
	const byteString = atob(dataUrl.split(',')[1])
	const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]
	const ab = new ArrayBuffer(byteString.length)
	const ia = new Uint8Array(ab)
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i)
	}
	const blob = new Blob([ab], { type: mimeString })
	return new File([blob], name, { type: mimeString })
}

const onExportMarkup = () => {
	if (!imageLoaded.value) return
	const result = composeExportDataUrl()
	if (!result) return
	const baseName = (props.sourceName || 'marked-image.png').replace(/\.[^.]+$/, '')
	const fileName = `${baseName}-marked-${Date.now()}.png`
	const file = dataUrlToFile(result.dataUrl, fileName)
	emit('export-markup', {
		file,
		dataUrl: result.dataUrl,
		width: result.width,
		height: result.height
	})
}

const onClose = () => {
	emit('update:visible', false)
}

watch(
	() => [props.visible, props.imageUrl] as const,
	async ([v, url]) => {
		if (!v) return
		if (!url) return
		try {
			await loadImage(url)
		} catch (err) {
			console.warn('[ImageMarkupDialog] image load failed', err)
		}
	},
	{ immediate: false }
)

onBeforeUnmount(() => {
	if (wheelTimer != null) {
		clearTimeout(wheelTimer)
		wheelTimer = null
	}
})
</script>

<style scoped>
.imd-mask {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.65);
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
}

.imd-dialog {
	width: min(1200px, 94vw);
	height: min(820px, 92vh);
	background: var(--dweb-default, #1e1f22);
	color: var(--vscode-fg, #e6e6e6);
	border: 1px solid var(--vscode-border, #3a3d42);
	border-radius: 6px;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.imd-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-bottom: 1px solid var(--vscode-border, #3a3d42);
	background: var(--dweb-default, #1e1f22);
	flex-wrap: wrap;
	gap: 8px;
}

.imd-toolbar-left {
	display: flex;
	align-items: center;
	gap: 8px;
}

.imd-title {
	font-weight: 600;
	font-size: 14px;
}

.imd-toolbar-right {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.imd-sep {
	width: 1px;
	height: 18px;
	background: var(--vscode-border, #3a3d42);
	margin: 0 4px;
}

.imd-btn {
	border: 1px solid var(--vscode-border, #3a3d42);
	background: transparent;
	color: var(--vscode-fg, #e6e6e6);
	padding: 4px 10px;
	font-size: 12px;
	cursor: pointer;
	border-radius: 3px;
}

.imd-btn:hover {
	border-color: var(--vscode-hover-border, #6b7280);
	background: var(--vscode-hover-bg, #2b2e33);
}

.imd-btn.active {
	background: var(--vscode-hover-bg, #2b2e33);
	border-color: var(--vscode-hover-border, #6b7280);
	color: #ff5a5a;
}

.imd-btn-primary {
	background: #c0392b;
	border-color: #c0392b;
	color: #ffffff;
	font-weight: 600;
}

.imd-btn-primary:hover {
	background: #d94a37;
	border-color: #d94a37;
}

.imd-brush-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--vscode-fg-muted, #b9bbbe);
}

.imd-brush-range {
	width: 120px;
}

.imd-brush-size {
	min-width: 36px;
	text-align: right;
}

.imd-viewport {
	position: relative;
	flex: 1;
	background:
		linear-gradient(45deg, #2a2b2f 25%, transparent 25%) 0 0 / 24px 24px,
		linear-gradient(-45deg, #2a2b2f 25%, transparent 25%) 0 12px / 24px 24px,
		linear-gradient(45deg, transparent 75%, #2a2b2f 75%) 12px -12px / 24px 24px,
		linear-gradient(-135deg, #232427 25%, transparent 25%) 12px 0 / 24px 24px,
		#1e1f22;
	overflow: hidden;
	user-select: none;
}

.imd-viewport.view {
	cursor: grab;
}

.imd-viewport.view:active {
	cursor: grabbing;
}

.imd-viewport.brush {
	cursor: crosshair;
}

.imd-canvas,
.imd-overlay {
	position: absolute;
	left: 50%;
	top: 50%;
	image-rendering: auto;
	pointer-events: none;
}

.imd-overlay {
	z-index: 2;
}

.imd-canvas {
	z-index: 1;
}

.imd-loading {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	pointer-events: none;
}

.imd-loading-text {
	color: var(--vscode-fg-muted, #b9bbbe);
	font-size: 13px;
}

.imd-info {
	position: absolute;
	left: 12px;
	bottom: 8px;
	font-size: 12px;
	color: var(--vscode-fg-muted, #b9bbbe);
	pointer-events: none;
	user-select: none;
	background: rgba(0, 0, 0, 0.35);
	padding: 2px 8px;
	border-radius: 4px;
}
</style>
