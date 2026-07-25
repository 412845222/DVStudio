<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BlueprintEditor from '../../../engine/blueprint/BlueprintEditor.vue'
import type { LegacyBlueprintData } from '../../../engine/blueprint/types'
import type { NodeChatState } from '../../../engine/blueprint/dom/NodeComponentResolver'
import type { WorkflowNodeChatSubmitPayload } from '../../../aiworkflow/types'

interface Props {
  initialData: LegacyBlueprintData
  readonly?: boolean
  theme?: 'light' | 'dark'
  chatState?: NodeChatState | null
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  theme: 'dark',
  chatState: null
})

const emit = defineEmits<{
  change: [data: LegacyBlueprintData]
  'selection-change': [nodeIds: string[]]
  'viewport-change': [zoom: number, panX: number, panY: number]
  'node-double-click': [nodeId: string, event: MouseEvent]
  'node-context-menu': [nodeId: string, event: MouseEvent, worldPos: { x: number; y: number }]
  'canvas-context-menu': [event: MouseEvent, worldPos: { x: number; y: number }]
  'canvas-double-click': [event: MouseEvent, worldPos: { x: number; y: number }]
  'canvas-drop': [event: DragEvent, worldPos: { x: number; y: number }]
  'editor-ready': [editor: any]
  'node-refresh': [nodeId: string]
  'node-chat-submit': [payload: WorkflowNodeChatSubmitPayload]
  'node-chat-close': [nodeId: string]
  'node-chat-update-draft': [payload: { nodeId: string; draft: string }]
  'node-chat-update-params': [payload: { nodeId: string; params: Record<string, any> }]
  'node-chat-update-selected-refs': [payload: { nodeId: string; selectedRefs: any[] }]
  'node-chat-remove-param-ref': [payload: { nodeId: string; refItem: any }]
  'node-chat-stop': [nodeId: string]
}>()

const blueprintEditorRef = ref<InstanceType<typeof BlueprintEditor> | null>(null)
const hostRootRef = ref<HTMLDivElement | null>(null)
let hasRestoredViewport = false
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null

defineExpose({
  resetView() {
    blueprintEditorRef.value?.resetView()
  },
  fitToView() {
    blueprintEditorRef.value?.fitToView()
  },
  setViewport(viewport: { zoom: number; panX: number; panY: number }) {
    blueprintEditorRef.value?.setViewport(viewport)
  },
  getViewport() {
    return blueprintEditorRef.value?.getViewport?.()
  },
  loadBlueprint(data: LegacyBlueprintData) {
    blueprintEditorRef.value?.loadBlueprint(data)
  },
  getInstance() {
    return blueprintEditorRef.value
  },
  getNodeScreenRect(nodeId: string) {
    return blueprintEditorRef.value?.getNodeScreenRect?.(nodeId) ?? null
  }
})

let isEmittingFromEditor = false

function onBlueprintEditorChange(data: LegacyBlueprintData) {
  if (isEmittingFromEditor) return
  isEmittingFromEditor = true
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer)
  syncDebounceTimer = setTimeout(() => {
    emit('change', data)
    isEmittingFromEditor = false
  }, 100)
}

function onBlueprintEditorSelectionChange(nodeIds: string[]) {
  emit('selection-change', nodeIds)
}

function onBlueprintEditorViewportChange(zoom: number, panX: number, panY: number) {
  emit('viewport-change', zoom, panX, panY)
}

function onBlueprintEditorNodeDblClick(nodeId: string, event: MouseEvent) {
  emit('node-double-click', nodeId, event)
}

function onBlueprintEditorNodeContextMenu(nodeId: string, event: MouseEvent, worldPos: { x: number; y: number }) {
  emit('node-context-menu', nodeId, event, worldPos)
}

function onBlueprintEditorCanvasContextMenu(event: MouseEvent, worldPos: { x: number; y: number }) {
  emit('canvas-context-menu', event, worldPos)
}

function onBlueprintEditorCanvasDblClick(event: MouseEvent, worldPos: { x: number; y: number }) {
  emit('canvas-double-click', event, worldPos)
}

function onBlueprintEditorDrop(event: DragEvent, worldPos: { x: number; y: number }) {
  emit('canvas-drop', event, worldPos)
}

function onBlueprintEditorNodeRefresh(nodeId: string) {
  emit('node-refresh', nodeId)
}

watch(blueprintEditorRef, (editor) => {
  if (editor && !hasRestoredViewport) {
    nextTick(() => {
      const storedVp = props.initialData.viewport
      if (storedVp && (Math.abs(storedVp.zoom - 1) > 0.001 || Math.abs(storedVp.panX) > 0.5 || Math.abs(storedVp.panY) > 0.5)) {
        editor.setViewport(storedVp)
      } else {
        editor.fitToView()
      }
      hasRestoredViewport = true
      emit('editor-ready', editor)
    })
  }
}, { immediate: true })
</script>

<template>
  <div ref="hostRootRef" class="bp-editor-root">
    <BlueprintEditor
      ref="blueprintEditorRef"
      class="aiwf-canvas"
      :initial-data="initialData"
      :readonly="readonly"
      :theme="theme"
      :chat-state="chatState"
      @change="onBlueprintEditorChange"
      @selection-change="onBlueprintEditorSelectionChange"
      @viewport-change="onBlueprintEditorViewportChange"
      @node-double-click="onBlueprintEditorNodeDblClick"
      @node-context-menu="onBlueprintEditorNodeContextMenu"
      @canvas-context-menu="onBlueprintEditorCanvasContextMenu"
      @canvas-double-click="onBlueprintEditorCanvasDblClick"
      @canvas-drop="onBlueprintEditorDrop"
      @node-refresh="onBlueprintEditorNodeRefresh"
      @node-chat-submit="(p: WorkflowNodeChatSubmitPayload) => emit('node-chat-submit', p)"
      @node-chat-close="(id: string) => emit('node-chat-close', id)"
      @node-chat-update-draft="(p: any) => emit('node-chat-update-draft', p)"
      @node-chat-update-params="(p: any) => emit('node-chat-update-params', p)"
      @node-chat-update-selected-refs="(p: any) => emit('node-chat-update-selected-refs', p)"
      @node-chat-remove-param-ref="(p: any) => emit('node-chat-remove-param-ref', p)"
      @node-chat-stop="(id: string) => emit('node-chat-stop', id)"
    />
    <div class="bp-overlay-layer">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bp-editor-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.bp-editor-root :deep(.aiwf-canvas) {
  width: 100%;
  height: 100%;
}

.bp-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}

.bp-overlay-layer :deep(> *) {
  pointer-events: auto;
}
</style>
