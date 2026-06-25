<template>
  <div class="imp-root">
    <div class="imp-toolbar">
      <div class="imp-toolbar-left">
        <span class="imp-title">图片预览与标记</span>
        <span v-if="sourceName" class="imp-subtitle">{{ sourceName }}</span>
      </div>
      <div class="imp-toolbar-right">
        <button class="imp-btn" type="button" :class="{ active: mode === 'view' }" @click="setMode('view')" title="浏览模式：拖拽移动">浏览</button>
        <button class="imp-btn" type="button" :class="{ active: mode === 'brush' }" @click="setMode('brush')" title="画笔模式：红色画笔标记">画笔</button>
        <span class="imp-sep"></span>
        <button class="imp-btn" type="button" @click="zoomBy(1.2)" title="放大">放大</button>
        <button class="imp-btn" type="button" @click="zoomBy(1 / 1.2)" title="缩小">缩小</button>
        <button class="imp-btn" type="button" @click="resetTransform" title="重置为原始大小">重置</button>
        <button class="imp-btn" type="button" @click="fitToView" title="适应窗口">适应</button>
        <span class="imp-sep"></span>
        <button class="imp-btn" type="button" @click="rotateBy(-90)" title="向左旋转 90°">左旋</button>
        <button class="imp-btn" type="button" @click="rotateBy(90)" title="向右旋转 90°">右旋</button>
        <span class="imp-sep"></span>
        <label class="imp-brush-label">
          画笔粗细：
          <input type="range" min="1" max="40" step="1" v-model.number="brushSize" class="imp-brush-range" />
          <span class="imp-brush-size">{{ brushSize }}px</span>
        </label>
        <span class="imp-sep"></span>
        <button class="imp-btn" type="button" @click="clearBrush" title="清除所有画笔标记">清除标记</button>
        <button class="imp-btn imp-btn-primary" type="button" @click="onExportMarkup" title="导出带有标记的图像，作为新节点连入原图片节点下游">导出标记</button>
        <button class="imp-btn" type="button" @click="onClose" title="关闭窗口">关闭</button>
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
        <div class="imp-loading-text">图片加载中…</div>
      </div>
      <div v-if="imageLoaded && naturalWidth" class="imp-info">
        原始尺寸：{{ naturalWidth }} × {{ naturalHeight }} | 缩放：{{ Math.round(zoom * 100) }}% | 旋转：{{ rotation }}°
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, onMounted } from 'vue'

type Mode = 'view' | 'brush'

type ExportImageMarkupPayload = {
  dataUrl: string
  width: number
  height: number
  sourceName: string
}

type ImageMarkupDwebBridge = {
  dweb?: {
    aiworkflow?: {
      exportImageMarkup?: (payload: ExportImageMarkupPayload) => Promise<unknown>
    }
  }
}

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
const sourceName = ref<string>('')

let dragState: { startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null = null
let wheelAccum = 0
let wheelTimer: number | null = null

const canvasStyle = computed(() => {
  const w = naturalWidth.value || 1
  const h = naturalHeight.value || 1
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `translate(-50%, -50%) translate(${offsetX.value}px, ${offsetY.value}px) rotate(${rotation.value}deg) scale(${zoom.value})`,
    transformOrigin: '50% 50%',
  } as Record<string, string>
})

const setMode = (m: Mode) => { mode.value = m }

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
  rotation.value = ((rotation.value + deg) % 360 + 360) % 360
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

const pointerToImageCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
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
      origOffsetY: offsetY.value,
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

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Array<{ x: number; y: number }>, size: number) => {
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
  overlay.width = img.naturalWidth
  overlay.height = img.naturalHeight
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
      })
      return
    }
  } catch (err) {
    console.warn('[ImageMarkupPreview] export failed', err)
  }
  alert('当前环境不支持直接导出到原工作流。您仍可右键保存图像。')
}

const onClose = () => {
  try {
    if (typeof window.close === 'function') {
      window.close()
    }
  } catch { /* ignore */ }
}

const parseUrlQuery = (): { url: string; name: string } => {
  const raw = window.location.hash || ''
  const qStart = raw.indexOf('?')
  const queryStr = qStart >= 0 ? raw.slice(qStart + 1) : ''
  const params = new URLSearchParams(queryStr)
  return {
    url: decodeURIComponent(params.get('url') || params.get('image_url') || ''),
    name: decodeURIComponent(params.get('name') || params.get('source') || ''),
  }
}

onMounted(async () => {
  const { url, name } = parseUrlQuery()
  sourceName.value = name || '图片预览'
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
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #16181d;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  user-select: none;
}

.imp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #2a2d33;
  background: #1e1f22;
  flex-wrap: wrap;
  gap: 8px;
}

.imp-toolbar-left { display: flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 200px; }
.imp-title { font-size: 14px; font-weight: 600; }
.imp-subtitle { font-size: 12px; color: #a6a9af; }

.imp-toolbar-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.imp-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #3a3d42;
  background: #2a2d33;
  color: #e6e6e6;
  font-size: 12px;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}
.imp-btn:hover { background: #353840; border-color: #4a4d55; }
.imp-btn.active { background: #3b5bdb; border-color: #4c6ef5; color: #ffffff; }
.imp-btn-primary {
  background: #2b8a3e;
  border-color: #37b24d;
  color: #ffffff;
}
.imp-btn-primary:hover { background: #2f9e44; border-color: #51cf66; }

.imp-sep {
  display: inline-block;
  width: 1px;
  height: 18px;
  background: #3a3d42;
  margin: 0 4px;
}

.imp-brush-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #bfc3cc;
}
.imp-brush-range { width: 120px; }
.imp-brush-size { color: #e6e6e6; min-width: 32px; text-align: right; }

.imp-viewport {
  position: relative;
  flex: 1 1 auto;
  overflow: hidden;
  background:
    linear-gradient(45deg, #1f2126 25%, transparent 25%) 0 0 / 20px 20px,
    linear-gradient(-45deg, #1f2126 25%, transparent 25%) 0 10px / 20px 20px,
    linear-gradient(45deg, transparent 75%, #1f2126 75%) 10px -10px / 20px 20px,
    linear-gradient(-45deg, transparent 75%, #1f2126 75%) -10px 0 / 20px 20px,
    #121317;
}
.imp-viewport.brush { cursor: crosshair; }

.imp-canvas,
.imp-overlay {
  position: absolute;
  left: 50%;
  top: 50%;
  pointer-events: none;
  image-rendering: auto;
}
.imp-canvas { z-index: 1; }
.imp-overlay { z-index: 2; }

.imp-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 16, 20, 0.55);
  z-index: 10;
}
.imp-loading-text { color: #a6a9af; font-size: 13px; }

.imp-info {
  position: absolute;
  left: 12px;
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(20, 22, 28, 0.75);
  color: #bfc3cc;
  font-size: 12px;
  z-index: 10;
  pointer-events: none;
}
</style>
