<template>
  <div class="image-markup-page"
    @contextmenu.prevent
  >
    <div class="markup-toolbar-row">
      <div class="markup-toolbar-group left-group">
        <button class="toolbar-btn" :class="{ active: currentTool === 'view' }" @click="setTool('view')" :title="t('nodes.imageMarkup.viewMode')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>
          </svg>
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" :class="{ active: currentTool === 'brush' }" @click="setTool('brush')" :title="t('nodes.imageMarkup.brushTool')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            <path d="m15 5 4 4"/>
          </svg>
        </button>
        <button class="toolbar-btn" :class="{ active: currentTool === 'eraser' }" @click="setTool('eraser')" :title="t('nodes.imageMarkup.eraserTool') || '橡皮擦'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L12 20"/>
            <path d="M6 12l6 6"/>
          </svg>
        </button>
        <button class="toolbar-btn" :class="{ active: currentTool === 'screenshot' }" @click="setTool('screenshot')" :title="t('nodes.imageMarkup.cropTool') || '裁剪'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
          </svg>
        </button>
        <button class="toolbar-btn subject-select-btn" :class="{ active: currentTool === 'subject-select' }" @click="setTool('subject-select')" :title="'主体选择'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
            <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
            <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" :disabled="!canUndo" @click="doUndo" :title="t('nodes.imageMarkup.undo') || '撤销 (Ctrl+Z)'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>
        <button class="toolbar-btn" :disabled="!canRedo" @click="doRedo" :title="t('nodes.imageMarkup.redo') || '重做 (Ctrl+Y)'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
          </svg>
        </button>
      </div>
      <div class="markup-toolbar-group center-group">
        <button class="toolbar-btn" @click="flipHorizontal" :title="t('nodes.imageMarkup.flipH') || '水平翻转'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v18"/>
            <path d="M17 7l4 4-4 4"/>
            <path d="M7 17l-4-4 4-4"/>
            <rect x="3" y="5" width="6" height="14" rx="1"/>
            <rect x="15" y="5" width="6" height="14" rx="1"/>
          </svg>
        </button>
        <button class="toolbar-btn" @click="flipVertical" :title="t('nodes.imageMarkup.flipV') || '垂直翻转'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h18"/>
            <path d="M7 7l4-4 4 4"/>
            <path d="M7 17l4 4 4-4"/>
            <rect x="5" y="3" width="14" height="6" rx="1"/>
            <rect x="5" y="15" width="14" height="6" rx="1"/>
          </svg>
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" @click="rotateLeft" :title="t('nodes.imageMarkup.rotateLeft')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>
        </button>
        <button class="toolbar-btn" @click="rotateRight" :title="t('nodes.imageMarkup.rotateRight')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 3-6.7L21 8"/></svg>
        </button>
      </div>
      <div class="markup-toolbar-group right-group">
        <button class="toolbar-btn" @click="zoomIn" :title="t('nodes.imageMarkup.zoomIn')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="toolbar-btn" @click="zoomOut" :title="t('nodes.imageMarkup.zoomOut')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <span class="zoom-percentage">{{ zoomPercent }}%</span>
        <button class="toolbar-btn" @click="resetView" :title="t('nodes.imageMarkup.resetView')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button class="toolbar-btn" @click="fitToView" :title="t('nodes.imageMarkup.fitToView')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn btn-danger" @click="clearAnnotations" :title="t('nodes.imageMarkup.clearAnnotations')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6l-1 14c0 1-1 2-2 2H8c-1 0-2-1-2-2L5 6"/></svg>
        </button>
        <button class="toolbar-btn btn-export" @click="exportMarkup" :disabled="!isImageLoaded">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {{ t('nodes.imageMarkup.exportMarkup') }}
        </button>
        <button class="toolbar-btn btn-primary" @click="exportScreenshot" :disabled="!hasValidScreenshotRect">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
          {{ t('nodes.imageMarkup.exportScreenshot') }}
        </button>
      </div>
    </div>

    <!-- Sub toolbar for eraser settings -->
    <div class="sub-toolbar" v-if="currentTool === 'eraser'">
      <button class="mode-btn" :class="{ active: eraserMode === 'rect-bg-remove' }" @click="setEraserMode('rect-bg-remove')" :title="t('nodes.imageMarkup.eraserModeRectBg') || '框选去背景'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
        </svg>
        {{ t('nodes.imageMarkup.eraserModeRectBg') || '框选去背景' }}
      </button>
      <button class="mode-btn" :class="{ active: eraserMode === 'click-bg-remove' }" @click="setEraserMode('click-bg-remove')" :title="t('nodes.imageMarkup.eraserModeClickBg') || '一键去背景'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
          <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>
        </svg>
        {{ t('nodes.imageMarkup.eraserModeClickBg') || '一键去背景' }}
      </button>
      <button class="mode-btn" :class="{ active: eraserMode === 'brush' }" @click="setEraserMode('brush')" :title="t('nodes.imageMarkup.eraserModeBrush') || '画笔擦除'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
          <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L12 20"/>
          <path d="M6 12l6 6"/>
        </svg>
        {{ t('nodes.imageMarkup.eraserModeBrush') || '画笔擦除' }}
      </button>
      <div class="toolbar-divider"></div>
      <template v-if="eraserMode === 'brush'">
        <span class="sub-toolbar-label">{{ t('nodes.imageMarkup.eraserSize') || '橡皮擦大小' }}</span>
        <input type="range" min="1" max="100" v-model.number="eraserSize" class="slider" />
        <span class="slider-value">{{ eraserSize }}px</span>
      </template>
      <template v-else>
        <span class="sub-toolbar-label">{{ t('nodes.imageMarkup.tolerance') || '容差' }}</span>
        <input type="range" min="1" max="100" v-model.number="eraserTolerance" class="slider" />
        <span class="slider-value">{{ eraserTolerance }}</span>
        <div class="toolbar-divider"></div>
        <span class="sub-toolbar-label">{{ t('nodes.imageMarkup.feather') || '羽化' }}</span>
        <input type="range" min="0" max="20" v-model.number="eraserFeather" class="slider slider-short" />
        <span class="slider-value">{{ eraserFeather }}px</span>
        <div class="toolbar-divider"></div>
        <label class="checkbox-label">
          <input type="checkbox" v-model="eraserContiguous" />
          <span>{{ t('nodes.imageMarkup.contiguous') || '连续' }}</span>
        </label>
      </template>
    </div>

    <!-- Sub toolbar for brush settings -->
    <div class="sub-toolbar" v-if="currentTool === 'brush'">
      <span class="sub-toolbar-label">{{ t('nodes.imageMarkup.brushSize') }}</span>
      <input type="range" min="1" max="40" v-model.number="brushSize" class="slider" />
      <span class="slider-value">{{ brushSize }}px</span>
    </div>

    <!-- Sub toolbar for subject select -->
    <div class="sub-toolbar" v-if="currentTool === 'subject-select'">
      <span class="sub-toolbar-hint">{{ subjectSelectRect ? '已选中主体（点击其他物体可切换）' : '未检测到主体' }}</span>
      <div class="toolbar-divider"></div>
      <label class="checkbox-label">
        <input type="checkbox" v-model="subjectTightFit" />
        <span>紧密贴合</span>
      </label>
      <template v-if="!subjectTightFit">
        <div class="toolbar-divider"></div>
        <span class="sub-toolbar-label">预览边距</span>
        <input type="range" min="0" max="30" v-model.number="subjectMargin" class="slider slider-short" />
        <span class="slider-value">{{ subjectMargin }}px</span>
      </template>
      <div class="toolbar-divider"></div>
      <button class="mode-btn btn-export-subject" @click="exportSubjectCrop" :disabled="!subjectSelectRect || subjectExporting">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {{ subjectExporting ? '导出中...' : '导出为1:1方形图' }}
      </button>
      <label class="checkbox-label" style="margin-left:6px">
        <input type="checkbox" v-model="subjectExportAll" :disabled="subjectExporting" />
        <span>全部导出</span>
      </label>
    </div>

    <div class="markup-viewport" ref="viewportRef"
      :class="{ 
        'has-subtoolbar': currentTool === 'eraser' || currentTool === 'brush' || currentTool === 'subject-select',
        'tool-brush': currentTool === 'brush',
        'tool-eraser-brush': currentTool === 'eraser' && eraserMode === 'brush',
        'tool-eraser-rect': currentTool === 'eraser' && eraserMode === 'rect-bg-remove',
        'tool-eraser-click': currentTool === 'eraser' && eraserMode === 'click-bg-remove',
        'tool-screenshot': currentTool === 'screenshot',
        'tool-subject-select': currentTool === 'subject-select',
        'tool-view': currentTool === 'view'
      }"
      @wheel.prevent="handleWheel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerLeave"
    >
      <div class="canvas-container" :style="canvasContainerStyle">
        <canvas ref="baseCanvasRef" class="canvas-layer base-canvas"></canvas>
        <canvas ref="overlayCanvasRef" class="canvas-layer overlay-canvas"></canvas>
      </div>
      <div v-if="!isImageLoaded" class="markup-loading">
        <div class="spinner"></div>
        <p>{{ t('nodes.imageMarkup.loading') }}</p>
      </div>
    </div>

    <div class="image-info-bar" v-if="isImageLoaded">
      <span>{{ naturalSize.width }} × {{ naturalSize.height }}</span>
      <span v-if="currentTool === 'screenshot' && screenshotRect">
        | {{ t('nodes.imageMarkup.selectionSize') }}: {{ Math.round(screenshotRect.w) }} × {{ Math.round(screenshotRect.h) }}
      </span>
      <span v-if="currentTool === 'subject-select' && subjectSelectRect">
        | 主体轮廓已框选，导出为1:1方形图
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from '../i18n'
import { ImageEditorEngine, type ToolType, type EraserMode } from './image-editor'

const { t } = useI18n()

const viewportRef = ref<HTMLElement | null>(null)
const baseCanvasRef = ref<HTMLCanvasElement | null>(null)
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)

let engine: ImageEditorEngine | null = null
let isSyncing = false

const isImageLoaded = ref(false)
const currentTool = ref<ToolType>('view')
const zoomValue = ref(1)
const brushSize = ref(6)
const eraserSize = ref(20)
const eraserMode = ref<EraserMode>('rect-bg-remove')
const eraserTolerance = ref(32)
const eraserContiguous = ref(true)
const eraserSampleCorners = ref(true)
const eraserFeather = ref(2)
const naturalSize = ref({ width: 0, height: 0 })
const screenshotRectVal = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const subjectSelectRectVal = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const subjectTightFit = ref(false)
const subjectMargin = ref(5)
const subjectExportAll = ref(false)
const subjectExporting = ref(false)
const canUndoVal = ref(false)
const canRedoVal = ref(false)

const zoomPercent = computed(() => Math.round(zoomValue.value * 100))

const hasValidScreenshotRect = computed(() => {
  const r = screenshotRectVal.value
  return !!r && r.w >= 10 && r.h >= 10
})

const subjectSelectRect = computed(() => subjectSelectRectVal.value)

const canvasContainerStyle = ref<Record<string, string>>({})

const screenshotRect = computed(() => screenshotRectVal.value)

const canUndo = computed(() => canUndoVal.value)
const canRedo = computed(() => canRedoVal.value)

function syncFromEngine() {
  if (!engine) return
  isSyncing = true
  currentTool.value = engine.getTool()
  zoomValue.value = engine.getZoom()
  naturalSize.value = engine.getNaturalSize()
  screenshotRectVal.value = engine.getScreenshotRect()
  subjectSelectRectVal.value = engine.getSubjectSelectRect()
  subjectTightFit.value = engine.getSubjectTightFit()
  subjectMargin.value = engine.getSubjectMargin()
  canUndoVal.value = engine.canUndo()
  canRedoVal.value = engine.canRedo()
  canvasContainerStyle.value = engine.getCanvasStyle()
  
  const bs = engine.getBrushSettings()
  brushSize.value = bs.size
  const es = engine.getEraserSettings()
  eraserSize.value = es.size
  eraserMode.value = es.mode
  eraserTolerance.value = es.tolerance
  eraserContiguous.value = es.contiguous
  eraserSampleCorners.value = es.sampleCorners
  eraserFeather.value = es.feather
  isSyncing = false
}

function setTool(tool: ToolType) {
  if (!engine) return
  engine.setTool(tool)
  syncFromEngine()
}

function zoomIn() {
  if (!engine) return
  engine.setZoom(engine.getZoom() * 1.25)
  syncFromEngine()
}

function zoomOut() {
  if (!engine) return
  engine.setZoom(engine.getZoom() / 1.25)
  syncFromEngine()
}

function resetView() {
  if (!engine) return
  engine.resetView()
  syncFromEngine()
}

function fitToView() {
  if (!engine || !viewportRef.value) return
  engine.fitToView(viewportRef.value.clientWidth, viewportRef.value.clientHeight)
  syncFromEngine()
}

function rotateLeft() {
  if (!engine) return
  engine.rotateBy(-90)
  syncFromEngine()
}

function rotateRight() {
  if (!engine) return
  engine.rotateBy(90)
  syncFromEngine()
}

function flipHorizontal() {
  if (!engine) return
  engine.flipHorizontal()
  syncFromEngine()
}

function flipVertical() {
  if (!engine) return
  engine.flipVertical()
  syncFromEngine()
}

function clearAnnotations() {
  if (!engine) return
  engine.clearAnnotations()
  syncFromEngine()
}

function doUndo() {
  if (!engine) return
  engine.undo()
  syncFromEngine()
}

function doRedo() {
  if (!engine) return
  engine.redo()
  syncFromEngine()
}

function exportMarkup() {
  if (!engine) return
  const result = engine.composeExportDataUrl()
  if (!result) return

  const dweb = (window as any).dweb
  if (!dweb?.aiworkflow?.exportImageMarkup) {
    downloadDataUrl(result.dataUrl, 'edited-image.png')
    return
  }

  dweb.aiworkflow.exportImageMarkup({ imageDataUrl: result.dataUrl, dataUrl: result.dataUrl, width: result.width, height: result.height }).then(() => {
    window.close()
  })
}

function exportScreenshot() {
  if (!engine) return
  const result = engine.composeScreenshotDataUrl()
  if (!result) return

  const dweb = (window as any).dweb
  if (!dweb?.aiworkflow?.exportImageMarkup) {
    downloadDataUrl(result.dataUrl, 'cropped-image.png')
    return
  }

  dweb.aiworkflow.exportImageMarkup({ imageDataUrl: result.dataUrl, dataUrl: result.dataUrl, width: result.width, height: result.height, exportType: 'screenshot' }).then(() => {
    window.close()
  })
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function handleWheel(e: WheelEvent) {
  if (!engine) return
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  engine.zoomBy(factor)
  syncFromEngine()
}

function handlePointerDown(e: PointerEvent) {
  if (!engine || !viewportRef.value) return
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  engine.pointerDown(e.clientX, e.clientY, viewportRef.value)
  syncFromEngine()
}

function handlePointerMove(e: PointerEvent) {
  if (!engine || !viewportRef.value) return
  engine.pointerMove(e.clientX, e.clientY, viewportRef.value)
  syncFromEngine()
}

function handlePointerUp(e: PointerEvent) {
  if (!engine || !viewportRef.value) return
  engine.pointerUp(e.clientX, e.clientY, viewportRef.value)
  syncFromEngine()
}

function handlePointerLeave(e: PointerEvent) {
  if (!engine) return
  engine.pointerLeave()
  if (viewportRef.value) {
    engine.pointerUp(e.clientX, e.clientY, viewportRef.value)
  }
  syncFromEngine()
}

function handleKeyDown(e: KeyboardEvent) {
  if (!engine) return
  const isCtrl = e.ctrlKey || e.metaKey
  if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault()
    engine.undo()
    syncFromEngine()
  } else if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault()
    engine.redo()
    syncFromEngine()
  }
}

function onBrushSizeChange(val: number) {
  if (!engine) return
  engine.setBrushSize(val)
}

function onEraserSizeChange(val: number) {
  if (!engine) return
  engine.setEraserSize(val)
}

function onEraserModeChange(val: EraserMode) {
  if (!engine) return
  engine.setEraserMode(val)
}

function onEraserToleranceChange(val: number) {
  if (!engine) return
  engine.setEraserTolerance(val)
}

function onEraserContiguousChange(val: boolean) {
  if (!engine) return
  engine.setEraserContiguous(val)
}

function onEraserSampleCornersChange(val: boolean) {
  if (!engine) return
  engine.setEraserSampleCorners(val)
}

function onEraserFeatherChange(val: number) {
  if (!engine) return
  engine.setEraserFeather(val)
}

function setEraserMode(mode: EraserMode) {
  if (!engine) return
  engine.setEraserMode(mode)
  syncFromEngine()
}

function onSubjectTightFitChange(val: boolean) {
  if (isSyncing || !engine) return
  engine.setSubjectTightFit(val)
  syncFromEngine()
}

function onSubjectMarginChange(val: number) {
  if (isSyncing || !engine) return
  engine.setSubjectMargin(val)
}

async function exportSubjectCrop() {
  if (!engine || subjectExporting.value) return
  const dweb = (window as any).dweb
  const exporter = dweb?.aiworkflow?.exportImageMarkup

  const doExportOne = async (idx?: number): Promise<boolean> => {
    const result = engine!.composeSubjectCropDataUrl(idx)
    if (!result) return false
    if (typeof exporter === 'function') {
      try {
        await exporter({ imageDataUrl: result.dataUrl, dataUrl: result.dataUrl, width: result.width, height: result.height, exportType: 'screenshot' })
        return true
      } catch {
        return false
      }
    } else {
      const fname = idx != null ? `subject-crop-${idx + 1}.png` : 'subject-crop.png'
      downloadDataUrl(result.dataUrl, fname)
      return true
    }
  }

  subjectExporting.value = true
  try {
    if (subjectExportAll.value) {
      const count = engine.getDetectedSubjectsCount()
      const origIdx = engine.getSelectedSubjectIdx()
      for (let i = 0; i < count; i++) {
        engine.selectSubjectByIndex(i)
        syncFromEngine()
        await doExportOne(i)
        await new Promise(r => setTimeout(r, 350))
      }
      if (origIdx >= 0 && origIdx < count) {
        engine.selectSubjectByIndex(origIdx)
      }
      syncFromEngine()
    } else {
      await doExportOne()
    }
  } finally {
    subjectExporting.value = false
  }
}

watch(brushSize, onBrushSizeChange)
watch(eraserSize, onEraserSizeChange)
watch(eraserMode, onEraserModeChange)
watch(eraserTolerance, onEraserToleranceChange)
watch(eraserContiguous, onEraserContiguousChange)
watch(eraserSampleCorners, onEraserSampleCornersChange)
watch(eraserFeather, onEraserFeatherChange)
watch(subjectTightFit, onSubjectTightFitChange)
watch(subjectMargin, onSubjectMarginChange)

function getImageUrlFromHash(): string | null {
  try {
    const hash = window.location.hash
    const queryIdx = hash.indexOf('?')
    if (queryIdx < 0) return null
    const queryStr = hash.substring(queryIdx + 1)
    const params = new URLSearchParams(queryStr)
    return params.get('url')
  } catch {
    return null
  }
}

async function loadImageFromUrl(url: string) {
  if (!engine || !viewportRef.value) return
  try {
    await engine.loadImage(url)
    isImageLoaded.value = true
    engine.fitToView(viewportRef.value.clientWidth, viewportRef.value.clientHeight)
    engine.on('stateChange', syncFromEngine)
    syncFromEngine()
  } catch (err) {
    console.error('Failed to load image:', err)
  }
}

onMounted(async () => {
  await nextTick()
  if (!baseCanvasRef.value || !overlayCanvasRef.value || !viewportRef.value) return

  engine = new ImageEditorEngine(baseCanvasRef.value, overlayCanvasRef.value)

  const dweb = (window as any).dweb
  let imageUrl: string | null = null

  if (dweb?.aiworkflow?.getImageMarkupInitialData) {
    try {
      const initData = await dweb.aiworkflow.getImageMarkupInitialData()
      if (initData?.imageDataUrl) {
        imageUrl = initData.imageDataUrl
      }
    } catch {
      // ignore, fallback to URL param
    }
  }

  if (!imageUrl) {
    imageUrl = getImageUrlFromHash()
  }

  if (imageUrl) {
    await loadImageFromUrl(imageUrl)
  }

  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (engine) {
    engine.off('stateChange', syncFromEngine)
    engine.destroy()
    engine = null
  }
})
</script>

<style scoped>
.image-markup-page {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  font-family: system-ui, -apple-system, sans-serif;
  position: relative;
}

.markup-toolbar-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: rgba(32, 34, 38, 0.95);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 0;
  z-index: 200;
  backdrop-filter: blur(8px);
  justify-content: space-between;
}

.markup-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
}

.center-group {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.right-group {
  margin-left: auto;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.12);
  margin: 0 6px;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #b4b4b4;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
  gap: 4px;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  color: #ffffff;
}

.toolbar-btn.active {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
}

.toolbar-btn.subject-select-btn.active {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-btn.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.toolbar-btn.btn-export {
  width: auto;
  padding: 0 10px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  gap: 6px;
}

.toolbar-btn.btn-export:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.toolbar-btn.btn-primary {
  width: auto;
  padding: 0 10px;
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  gap: 6px;
}

.toolbar-btn.btn-primary:hover:not(:disabled) {
  background: rgba(34, 211, 238, 0.25);
  color: #67e8f9;
}

.zoom-percentage {
  font-size: 12px;
  color: #888;
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sub-toolbar {
  position: absolute;
  top: 48px;
  left: 0;
  right: 0;
  height: 36px;
  background: rgba(32, 34, 38, 0.9);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  z-index: 199;
  backdrop-filter: blur(6px);
}

.sub-toolbar-label {
  font-size: 12px;
  color: #999;
}

.slider {
  width: 120px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #22d3ee;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider-value {
  font-size: 11px;
  color: #666;
  min-width: 36px;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #ccc;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #22d3ee;
  cursor: pointer;
}

.mode-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  background: transparent;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #ddd;
}

.mode-btn.active {
  background: rgba(249, 115, 22, 0.15);
  border-color: rgba(249, 115, 22, 0.4);
  color: #f97316;
}

.mode-btn.btn-export-subject {
  background: rgba(167, 139, 250, 0.15);
  border-color: rgba(167, 139, 250, 0.4);
  color: #a78bfa;
}

.mode-btn.btn-export-subject:hover:not(:disabled) {
  background: rgba(167, 139, 250, 0.25);
  color: #c4b5fd;
}

.mode-btn.btn-export-subject:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sub-toolbar-hint {
  font-size: 12px;
  color: #888;
  padding: 0 4px;
}

.slider.slider-short {
  width: 80px;
}

.markup-viewport {
  position: absolute;
  top: 48px;
  left: 0;
  right: 0;
  bottom: 28px;
  overflow: hidden;
  background:
    linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
    linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
    linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  background-color: #242424;
  cursor: default;
}

.markup-viewport.has-subtoolbar {
  top: 84px;
}

.markup-viewport.tool-brush {
  cursor: crosshair;
}

.markup-viewport.tool-eraser-brush {
  cursor: cell;
}

.markup-viewport.tool-eraser-rect {
  cursor: crosshair;
}

.markup-viewport.tool-eraser-click {
  cursor: pointer;
}

.markup-viewport.tool-screenshot {
  cursor: crosshair;
}

.markup-viewport.tool-subject-select {
  cursor: pointer;
}

.markup-viewport.tool-view {
  cursor: grab;
}

.markup-viewport.tool-view:active {
  cursor: grabbing;
}

.canvas-container {
  position: absolute;
  left: 50%;
  top: 50%;
}

.canvas-layer {
  position: absolute;
  top: 0;
  left: 0;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.base-canvas {
  z-index: 1;
  box-shadow: 0 4px 40px rgba(0,0,0,0.6);
}

.overlay-canvas {
  z-index: 2;
  pointer-events: none;
}

.markup-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: rgba(255,255,255,0.6);
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #22d3ee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.image-info-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: rgba(32, 34, 38, 0.9);
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  font-size: 11px;
  color: #888;
  z-index: 100;
  font-variant-numeric: tabular-nums;
}
</style>
