<template>
	<div class="imp-root">
		<div class="imp-toolbar">
			<div class="imp-toolbar-left">
				<span class="imp-subtitle" v-if="sourceName">{{ sourceName }}</span>
			</div>
			<div class="imp-toolbar-right">
				<button
					class="imp-btn"
					type="button"
					:class="{ active: mode === 'view' }"
					@click="setMode('view')"
					:title="t('nodes.imageMarkup.browseMode')"
				>
					{{ t('nodes.imageMarkup.browse') }}
				</button>
				<button
					class="imp-btn"
					type="button"
					:class="{ active: mode === 'brush' }"
					@click="setMode('brush')"
					:title="t('nodes.imageMarkup.brushMode')"
				>
					{{ t('nodes.imageMarkup.brush') }}
				</button>
				<button
					class="imp-btn"
					type="button"
					:class="{ active: mode === 'screenshot' }"
					@click="setMode('screenshot')"
					:title="t('nodes.imageMarkup.screenshotMode')"
				>
					{{ t('nodes.imageMarkup.screenshot') }}
				</button>
				<span class="imp-sep"></span>
				<button class="imp-btn" type="button" @click="zoomBy(1.2)" :title="t('nodes.imageMarkup.zoomIn')">{{ t('nodes.imageMarkup.zoomIn') }}</button>
				<button class="imp-btn" type="button" @click="zoomBy(1 / 1.2)" :title="t('nodes.imageMarkup.zoomOut')">{{ t('nodes.imageMarkup.zoomOut') }}</button>
				<button class="imp-btn" type="button" @click="resetTransform" :title="t('nodes.imageMarkup.resetTransform')">
					{{ t('nodes.imageMarkup.reset') }}
				</button>
				<button class="imp-btn" type="button" @click="fitToView" :title="t('nodes.imageMarkup.fitToView')">{{ t('nodes.imageMarkup.fitToView') }}</button>
				<span class="imp-sep"></span>
				<button class="imp-btn" type="button" @click="rotateBy(-90)" :title="t('nodes.imageMarkup.rotateLeft')">
					{{ t('nodes.imageMarkup.rotateLeftShort') }}
				</button>
				<button class="imp-btn" type="button" @click="rotateBy(90)" :title="t('nodes.imageMarkup.rotateRight')">
					{{ t('nodes.imageMarkup.rotateRightShort') }}
				</button>
				<template v-if="mode === 'brush'">
					<span class="imp-sep"></span>
					<label class="imp-brush-label">
						{{ t('nodes.imageMarkup.brushSize') }}
						<input
							type="range"
							min="1"
							max="40"
							step="1"
							v-model.number="brushSize"
							class="imp-brush-range"
						/>
						<span class="imp-brush-size">{{ brushSize }}px</span>
					</label>
					<span class="imp-sep"></span>
					<button class="imp-btn" type="button" @click="clearBrush" :title="t('nodes.imageMarkup.clearBrush')">
						{{ t('nodes.imageMarkup.clearMarkup') }}
					</button>
					<button
						class="imp-btn imp-btn-primary"
						type="button"
						@click="onExportMarkup"
						:title="t('nodes.imageMarkup.exportMarkupTooltip')"
					>
						{{ t('nodes.imageMarkup.exportMarkup') }}
					</button>
				</template>
				<template v-if="mode === 'screenshot'">
					<span class="imp-sep"></span>
					<button class="imp-btn" type="button" @click="resetScreenshot" :title="t('nodes.imageMarkup.resetScreenshot')">
						{{ t('nodes.imageMarkup.resetRect') }}
					</button>
					<button
						class="imp-btn imp-btn-primary"
						type="button"
						:disabled="!screenshotRect"
						@click="onExportScreenshot"
						:title="t('nodes.imageMarkup.confirmScreenshot')"
					>
						{{ t('nodes.imageMarkup.confirmScreenshotShort') }}
					</button>
				</template>
			</div>
		</div>

		<div
			ref="viewportRef"
			class="imp-viewport"
			:class="mode"
			@wheel.prevent="onWheel"
			@mousedown="onMouseDown"
			@mousemove="onMouseMove"
			@mouseup="onMouseUp"
			@mouseleave="onMouseUp"
		>
			<canvas ref="canvasRef" class="imp-canvas" :style="canvasStyle"></canvas>
			<canvas ref="overlayRef" class="imp-overlay" :style="canvasStyle"></canvas>
			<div v-if="!imageLoaded" class="imp-loading">
				<div class="imp-loading-text">{{ t('nodes.imageMarkup.loading') }}</div>
			</div>
			<div v-if="imageLoaded && naturalWidth" class="imp-info">
				{{ t('nodes.imageMarkup.originalSize') }}：{{ naturalWidth }} × {{ naturalHeight }} | {{ t('nodes.imageMarkup.zoom') }}：{{ Math.round(zoom * 100) }}% |
				{{ t('nodes.imageMarkup.rotation') }}：{{ rotation }}°
				<span v-if="mode === 'screenshot' && screenshotRect">
					| {{ t('nodes.imageMarkup.screenshotArea') }}：{{ Math.round(screenshotRect.w) }} × {{ Math.round(screenshotRect.h) }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, onMounted } from 'vue'
import { useI18n } from '../i18n'

type Mode = 'view' | 'brush' | 'screenshot'

type ExportImageMarkupPayload = {
	dataUrl: string
	width: number
	height: number
	sourceName: string
	exportType: 'markup' | 'screenshot'
}

type ImageMarkupDwebBridge = {
	dweb?: {
		aiworkflow?: {
			exportImageMarkup?: (payload: ExportImageMarkupPayload) => Promise<unknown>
		}
	}
}

const { t } = useI18n()

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

const screenshotRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const naturalWidth = ref<number>(0)
const naturalHeight = ref<number>(0)
const imageLoaded = ref<boolean>(false)
const sourceImage = ref<HTMLImageElement | null>(null)
const sourceName = ref<string>('')

let dragState: { startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null =
	null
let wheelAccum = 0
let wheelTimer: number | null = null

type ScreenshotDragMode = 'new' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null
let screenshotDrag: {
	mode: ScreenshotDragMode
	startClientX: number
	startClientY: number
	startRect: { x: number; y: number; w: number; h: number }
} | null = null

const HANDLE_SIZE = 14

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
	if (mode.value === m) return
	mode.value = m
	if (m === 'screenshot') {
		resetScreenshot()
	} else {
		screenshotRect.value = null
	}
	redrawOverlay()
}

const resetScreenshot = () => {
	const w = naturalWidth.value
	const h = naturalHeight.value
	if (w > 0 && h > 0) {
		screenshotRect.value = {
			x: Math.round(w * 0.1),
			y: Math.round(h * 0.1),
			w: Math.round(w * 0.8),
			h: Math.round(h * 0.8)
		}
	} else {
		screenshotRect.value = null
	}
	redrawOverlay()
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
	wheelAccum += e.deltaY
	if (wheelTimer != null) return
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

const getScreenshotHandleAt = (px: number, py: number): ScreenshotDragMode => {
	const rect = screenshotRect.value
	if (!rect) return null
	const half = HANDLE_SIZE / 2
	const { x, y, w, h } = rect
	const right = x + w
	const bottom = y + h

	const near = (v: number, target: number) => Math.abs(v - target) <= half

	if (near(px, x) && near(py, y)) return 'nw'
	if (near(px, right) && near(py, y)) return 'ne'
	if (near(px, right) && near(py, bottom)) return 'se'
	if (near(px, x) && near(py, bottom)) return 'sw'
	if (near(py, y) && px > x && px < right) return 'n'
	if (near(px, right) && py > y && py < bottom) return 'e'
	if (near(py, bottom) && px > x && px < right) return 's'
	if (near(px, x) && py > y && py < bottom) return 'w'
	if (px >= x && px <= right && py >= y && py <= bottom) return 'move'
	return null
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
		return
	}
	if (mode.value === 'screenshot') {
		const pt = pointerToImageCoords(e.clientX, e.clientY)
		if (!pt) return
		const handle = getScreenshotHandleAt(pt.x, pt.y)
		if (handle) {
			screenshotDrag = {
				mode: handle,
				startClientX: e.clientX,
				startClientY: e.clientY,
				startRect: screenshotRect.value ? { ...screenshotRect.value } : { x: 0, y: 0, w: 0, h: 0 }
			}
		} else {
			screenshotDrag = {
				mode: 'new',
				startClientX: e.clientX,
				startClientY: e.clientY,
				startRect: { x: pt.x, y: pt.y, w: 0, h: 0 }
			}
			screenshotRect.value = { x: pt.x, y: pt.y, w: 0, h: 0 }
		}
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
		return
	}
	if (mode.value === 'screenshot' && screenshotDrag && screenshotDrag.mode) {
		const pt = pointerToImageCoords(e.clientX, e.clientY)
		if (!pt) return
		const imgW = naturalWidth.value || 1
		const imgH = naturalHeight.value || 1
		const sr = screenshotDrag.startRect
		const minSize = 10

		if (screenshotDrag.mode === 'new') {
			const x = Math.min(pt.x, sr.x)
			const y = Math.min(pt.y, sr.y)
			const w = Math.abs(pt.x - sr.x)
			const h = Math.abs(pt.y - sr.y)
			screenshotRect.value = {
				x: Math.max(0, Math.min(imgW, x)),
				y: Math.max(0, Math.min(imgH, y)),
				w: Math.max(0, Math.min(w, imgW, imgH)),
				h: Math.max(0, Math.min(h, imgW, imgH))
			}
		} else if (screenshotDrag.mode === 'move') {
			const startPt = pointerToImageCoords(screenshotDrag.startClientX, screenshotDrag.startClientY)
			if (startPt) {
				const dx = pt.x - startPt.x
				const dy = pt.y - startPt.y
				let nx = sr.x + dx
				let ny = sr.y + dy
				nx = Math.max(0, Math.min(imgW - sr.w, nx))
				ny = Math.max(0, Math.min(imgH - sr.h, ny))
				screenshotRect.value = { x: nx, y: ny, w: sr.w, h: sr.h }
			}
		} else {
			let { x, y, w, h } = sr
			const right = sr.x + sr.w
			const bottom = sr.y + sr.h

			switch (screenshotDrag.mode) {
				case 'n':
					y = Math.min(pt.y, bottom - minSize)
					h = bottom - y
					break
				case 's':
					h = Math.max(minSize, pt.y - sr.y)
					break
				case 'w':
					x = Math.min(pt.x, right - minSize)
					w = right - x
					break
				case 'e':
					w = Math.max(minSize, pt.x - sr.x)
					break
				case 'nw':
					x = Math.min(pt.x, right - minSize)
					y = Math.min(pt.y, bottom - minSize)
					w = right - x
					h = bottom - y
					break
				case 'ne':
					y = Math.min(pt.y, bottom - minSize)
					w = Math.max(minSize, pt.x - sr.x)
					h = bottom - y
					break
				case 'sw':
					x = Math.min(pt.x, right - minSize)
					w = right - x
					h = Math.max(minSize, pt.y - sr.y)
					break
				case 'se':
					w = Math.max(minSize, pt.x - sr.x)
					h = Math.max(minSize, pt.y - sr.y)
					break
			}

			x = Math.max(0, x)
			y = Math.max(0, y)
			w = Math.max(minSize, Math.min(w, imgW - x))
			h = Math.max(minSize, Math.min(h, imgH - y))

			screenshotRect.value = { x, y, w, h }
		}
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
	if (screenshotDrag) {
		screenshotDrag = null
		if (screenshotRect.value && (screenshotRect.value.w < 10 || screenshotRect.value.h < 10)) {
			screenshotRect.value = null
		}
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

const drawScreenshotOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
		const rect = screenshotRect.value
		if (!rect) return

		ctx.save()
		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
		ctx.fillRect(0, 0, w, rect.y)
		ctx.fillRect(0, rect.y + rect.h, w, h - rect.y - rect.h)
		ctx.fillRect(0, rect.y, rect.x, rect.h)
		ctx.fillRect(rect.x + rect.w, rect.y, w - rect.x - rect.w, rect.h)

		ctx.strokeStyle = '#22d3ee'
		ctx.lineWidth = 3
		ctx.setLineDash([8, 4])
		ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
		ctx.setLineDash([])

		ctx.fillStyle = '#22d3ee'
		ctx.strokeStyle = '#ffffff'
		ctx.lineWidth = 2
		const handles: Array<[number, number]> = [
			[rect.x, rect.y],
			[rect.x + rect.w / 2, rect.y],
			[rect.x + rect.w, rect.y],
			[rect.x + rect.w, rect.y + rect.h / 2],
			[rect.x + rect.w, rect.y + rect.h],
			[rect.x + rect.w / 2, rect.y + rect.h],
			[rect.x, rect.y + rect.h],
			[rect.x, rect.y + rect.h / 2]
		]
		for (const [hx, hy] of handles) {
			ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
			ctx.strokeRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
		}
		ctx.restore()
	}

const redrawOverlay = () => {
	const overlay = overlayRef.value
	const img = sourceImage.value
	if (!overlay || !img || !img.naturalWidth) return
	overlay.width = img.naturalWidth
	overlay.height = img.naturalHeight
	const ctx = overlay.getContext('2d')
	if (!ctx) return
	ctx.clearRect(0, 0, overlay.width, overlay.height)
	for (const stroke of brushStrokes.value) drawStroke(ctx, stroke, brushSize.value)
	if (currentStroke.value && currentStroke.value.length > 0) {
		drawStroke(ctx, currentStroke.value, brushSize.value)
	}
	if (mode.value === 'screenshot') {
		drawScreenshotOverlay(ctx, overlay.width, overlay.height)
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
	screenshotRect.value = null
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

const composeScreenshotDataUrl = (): { dataUrl: string; width: number; height: number } | null => {
	const base = canvasRef.value
	if (!base) return null
	const rect = screenshotRect.value
	if (!rect || rect.w < 10 || rect.h < 10) return null

	const img = sourceImage.value
	if (!img) return null

	const sx = Math.max(0, Math.floor(rect.x))
	const sy = Math.max(0, Math.floor(rect.y))
	const sw = Math.min(base.width - sx, Math.floor(rect.w))
	const sh = Math.min(base.height - sy, Math.floor(rect.h))
	if (sw < 1 || sh < 1) return null

	const exportCanvas = document.createElement('canvas')
	exportCanvas.width = sw
	exportCanvas.height = sh
	const ctx = exportCanvas.getContext('2d')
	if (!ctx) return null

	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

	const dataUrl = exportCanvas.toDataURL('image/png')
	return { dataUrl, width: sw, height: sh }
}

const onExportMarkup = async () => {
	if (!imageLoaded.value) return
	const result = composeExportDataUrl()
	if (!result) return
	try {
		const w = window as Window & ImageMarkupDwebBridge
		if (w.dweb?.aiworkflow && typeof w.dweb.aiworkflow.exportImageMarkup === 'function') {
			await w.dweb.aiworkflow.exportImageMarkup({
				dataUrl: result.dataUrl,
				width: result.width,
				height: result.height,
				sourceName: sourceName.value || 'marked-image',
				exportType: 'markup'
			})
			return
		}
	} catch (err) {
		console.warn('[ImageMarkupPreview] export failed', err)
	}
	alert(t('nodes.imageMarkup.exportNotSupported'))
}

const onExportScreenshot = async () => {
	if (!imageLoaded.value) return
	const result = composeScreenshotDataUrl()
	if (!result) return
	try {
		const w = window as Window & ImageMarkupDwebBridge
		if (w.dweb?.aiworkflow && typeof w.dweb.aiworkflow.exportImageMarkup === 'function') {
			await w.dweb.aiworkflow.exportImageMarkup({
				dataUrl: result.dataUrl,
				width: result.width,
				height: result.height,
				sourceName: sourceName.value || 'screenshot',
				exportType: 'screenshot'
			})
			return
		}
	} catch (err) {
		console.warn('[ImageMarkupPreview] screenshot export failed', err)
	}
	alert(t('nodes.imageMarkup.exportScreenshotNotSupported'))
}

const parseUrlQuery = (): { url: string; name: string } => {
	const raw = window.location.hash || ''
	const qStart = raw.indexOf('?')
	const queryStr = qStart >= 0 ? raw.slice(qStart + 1) : ''
	const params = new URLSearchParams(queryStr)
	return {
		url: decodeURIComponent(params.get('url') || params.get('image_url') || ''),
		name: decodeURIComponent(params.get('name') || params.get('source') || '')
	}
}

onMounted(async () => {
	const { url, name } = parseUrlQuery()
	sourceName.value = name || t('nodes.imageMarkup.defaultTitle')
	document.title = `DVStudio · ${sourceName.value}`
	if (url) {
		try {
			await loadImage(url)
		} catch (err) {
			console.warn('[ImageMarkupPreview] image load failed', err)
		}
	}
})

onBeforeUnmount(() => {
	if (wheelTimer != null) {
		clearTimeout(wheelTimer)
		wheelTimer = null
	}
})
</script>

<style scoped>
.imp-root {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--theme-bg-primary);
	color: var(--theme-text-primary);
	font-family:
		-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
	user-select: none;
}

.imp-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-bottom: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	flex-wrap: wrap;
	gap: 8px;
}

.imp-toolbar-left {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1 1 auto;
	min-width: 200px;
}
.imp-title {
	font-size: 14px;
	font-weight: 600;
}
.imp-subtitle {
	font-size: 12px;
	color: var(--theme-text-secondary);
}

.imp-toolbar-right {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.imp-btn {
	padding: 4px 10px;
	border-radius: 4px;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-primary);
	font-size: 12px;
	cursor: pointer;
	transition:
		background 160ms ease,
		border-color 160ms ease,
		color 160ms ease;
}
.imp-btn:hover {
	background: var(--theme-hover-bg);
	border-color: var(--theme-hover-border);
}
.imp-btn.active {
	background: var(--theme-accent);
	border-color: var(--theme-accent);
	color: #ffffff;
}
.imp-btn-primary {
	background: var(--theme-success);
	border-color: var(--theme-success);
	color: #ffffff;
}
.imp-btn-primary:hover {
	background: color-mix(in srgb, var(--theme-success) 85%, white);
	border-color: color-mix(in srgb, var(--theme-success) 85%, white);
}
.imp-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.imp-sep {
	display: inline-block;
	width: 1px;
	height: 18px;
	background: var(--theme-border);
	margin: 0 4px;
}

.imp-brush-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--theme-text-secondary);
}
.imp-brush-range {
	width: 120px;
}
.imp-brush-size {
	color: var(--theme-text-primary);
	min-width: 32px;
	text-align: right;
}

.imp-viewport {
	position: relative;
	flex: 1 1 auto;
	overflow: hidden;
	background:
		linear-gradient(45deg, color-mix(in srgb, var(--theme-bg-secondary) 50%, transparent) 25%, transparent 25%) 0 0 / 20px 20px,
		linear-gradient(-45deg, color-mix(in srgb, var(--theme-bg-secondary) 50%, transparent) 25%, transparent 25%) 0 10px / 20px 20px,
		linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--theme-bg-secondary) 50%, transparent) 75%) 10px -10px / 20px 20px,
		linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--theme-bg-secondary) 50%, transparent) 75%) -10px 0 / 20px 20px,
		var(--theme-bg-primary);
}
.imp-viewport.brush {
	cursor: crosshair;
}
.imp-viewport.screenshot {
	cursor: crosshair;
}

.imp-canvas,
.imp-overlay {
	position: absolute;
	left: 50%;
	top: 50%;
	pointer-events: none;
	image-rendering: auto;
}
.imp-canvas {
	z-index: 1;
}
.imp-overlay {
	z-index: 2;
}

.imp-loading {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--theme-bg-primary) 75%, transparent);
	z-index: 10;
}
.imp-loading-text {
	color: var(--theme-text-secondary);
	font-size: 13px;
}

.imp-info {
	position: absolute;
	left: 12px;
	bottom: 10px;
	padding: 4px 8px;
	border-radius: 4px;
	background: color-mix(in srgb, var(--theme-bg-tertiary) 85%, transparent);
	color: var(--theme-text-secondary);
	font-size: 12px;
	z-index: 10;
	pointer-events: none;
}
</style>
