<template>
  <div class="blueprint-editor" :class="{ 'bp-readonly': readonly }">
    <div class="bp-canvas-container" ref="containerRef">
      <canvas ref="canvasRef"></canvas>
      <BlueprintDomOverlay 
        :scene="scene" 
        @node-dblclick="handleNodeDblClick"
        @node-contextmenu="handleNodeContextMenu"
        @node-copy="handleNodeCopy"
        @node-delete="handleNodeDelete"
      />
      <BlueprintContextMenu
        :visible="ctxMenu.visible"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :can-undo="ctxMenu.canUndo"
        :can-redo="ctxMenu.canRedo"
        :can-cut="ctxMenu.canCut"
        :can-copy="ctxMenu.canCopy"
        :can-paste="ctxMenu.canPaste"
        :can-duplicate="ctxMenu.canDuplicate"
        :can-delete="ctxMenu.canDelete"
        :can-select-all="ctxMenu.canSelectAll"
        @undo="onCtxUndo"
        @redo="onCtxRedo"
        @cut="onCtxCut"
        @copy="onCtxCopy"
        @paste="onCtxPaste"
        @duplicate="onCtxDuplicate"
        @delete="onCtxDelete"
        @select-all="onCtxSelectAll"
      />
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { BlueprintScene, BlueprintNode } from './index';
import type { GraphPointerEvent } from '../graphbase/input/events';
import type { LegacyBlueprintData, NodeStatus, BlueprintNodeData, BlueprintData } from './types';
import { DEFAULT_NODE_SIZES } from './types';
import BlueprintDomOverlay from './dom/BlueprintDomOverlay.vue';
import BlueprintContextMenu from './dom/BlueprintContextMenu.vue';
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand';

interface Props {
  initialData?: LegacyBlueprintData;
  projectPath?: string;
  readonly?: boolean;
  theme?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  theme: 'dark',
});

interface Emits {
  (e: 'change', data: LegacyBlueprintData): void;
  (e: 'save', data: LegacyBlueprintData): void;
  (e: 'selectionChange', nodeIds: string[]): void;
  (e: 'nodeDoubleClick', nodeId: string, event: MouseEvent): void;
  (e: 'nodeContextMenu', nodeId: string, event: MouseEvent): void;
  (e: 'viewportChange', zoom: number, panX: number, panY: number): void;
}

const emit = defineEmits<Emits>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<BlueprintScene | null>(null);

let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let isUpdatingFromProps = false;
let changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  targetNodeId: null as string | null,
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canDuplicate: false,
  canDelete: false,
  canSelectAll: true,
});

function closeCtxMenu() {
  ctxMenu.visible = false;
  ctxMenu.targetNodeId = null;
}

function openCtxMenu(x: number, y: number, targetNodeId: string | null) {
  if (!scene.value) return;
  const s = scene.value;
  let selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];

  if (targetNodeId) {
    const node = s.getBlueprintNode(targetNodeId);
    if (node && !selectedNodes.find(n => n.id === targetNodeId)) {
      s.selection.setSelection([node.id]);
      selectedNodes = [node];
      s.requestRedraw();
    }
  }

  const hasSelection = selectedNodes.length > 0;
  ctxMenu.visible = true;
  ctxMenu.x = x;
  ctxMenu.y = y;
  ctxMenu.targetNodeId = targetNodeId;
  ctxMenu.canUndo = s.canUndo();
  ctxMenu.canRedo = s.canRedo();
  ctxMenu.canCut = hasSelection;
  ctxMenu.canCopy = hasSelection;
  ctxMenu.canPaste = s.hasClipboardData();
  ctxMenu.canDuplicate = hasSelection;
  ctxMenu.canDelete = hasSelection;
  ctxMenu.canSelectAll = s.getAllBlueprintNodes().length > 0;
}

function handleNodeContextMenu(nodeId: string, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit('nodeContextMenu', nodeId, event);
  openCtxMenu(event.clientX, event.clientY, nodeId);
}

function handleNodeDblClick(nodeId: string, event: MouseEvent) {
  emit('nodeDoubleClick', nodeId, event);
}

function handleNodeCopy(nodeId: string) {
  if (!scene.value) return;
  const s = scene.value;
  const node = s.getBlueprintNode(nodeId);
  if (node) {
    s.copySelection([node]);
  }
}

function handleNodeDelete(nodeId: string) {
  if (!scene.value || props.readonly) return;
  const s = scene.value;
  s.executeCommand(new DeleteSelectionCommand(s as any, [nodeId], []));
  s.selection.clearSelection();
  s.updateAllConnectionEndpoints();
  s.requestRedraw();
  emitChange();
}

function onToolContextMenu(event: GraphPointerEvent) {
  if (ctxMenu.visible) closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const originalEvent = event.originalEvent as MouseEvent;
  const clientX = originalEvent.clientX;
  const clientY = originalEvent.clientY;

  const hitNode = event.hitResult?.node;
  if (hitNode && hitNode instanceof BlueprintNode) {
    const targetId = hitNode.id;
    const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (!selectedNodes.find(n => n.id === targetId)) {
      s.selection.setSelection([targetId]);
      s.requestRedraw();
    }
    openCtxMenu(clientX, clientY, targetId);
  } else {
    s.selection.clearSelection();
    s.requestRedraw();
    openCtxMenu(clientX, clientY, null);
  }
}

function onCtxUndo() { closeCtxMenu(); scene.value?.undo(); }
function onCtxRedo() { closeCtxMenu(); scene.value?.redo(); }
function onCtxCut() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
  if (selectedNodes.length > 0) {
    s.copySelection(selectedNodes);
    const nodeIds = selectedNodes.map(n => n.id);
    const allConns = s.getAllConnections();
    const connIds = allConns.filter(c => nodeIds.includes(c.data.fromNodeId) && nodeIds.includes(c.data.toNodeId)).map(c => c.id);
    s.executeCommand(new DeleteSelectionCommand(s as any, nodeIds, connIds));
    s.selection.clearSelection();
    s.requestRedraw();
  }
}
function onCtxCopy() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
  if (selectedNodes.length > 0) {
    s.copySelection(selectedNodes);
  }
}
function onCtxPaste() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const newNodeIds = s.executePaste(50, 50);
  if (newNodeIds.length > 0) {
    s.selection.setSelection(newNodeIds);
    s.requestRedraw();
  }
}
function onCtxDuplicate() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
  if (selectedNodes.length > 0) {
    s.copySelection(selectedNodes);
    const newNodeIds = s.executePaste(30, 30);
    if (newNodeIds.length > 0) {
      s.selection.setSelection(newNodeIds);
      s.requestRedraw();
    }
  }
}
function onCtxDelete() {
  closeCtxMenu();
  deleteSelection();
}
function onCtxSelectAll() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  s.selection.setSelection(s.getAllBlueprintNodes().map(n => n.id));
  s.requestRedraw();
}

function deleteSelection() {
  if (!scene.value) return;
  const s = scene.value;
  const sel = s.selection.getSelection();
  const nodeIds = sel.filter(n => n instanceof BlueprintNode).map(n => (n as BlueprintNode).id);
  const connIds: string[] = [];
  for (const item of sel) {
    const c = item as any;
    if (c && c.data && typeof c.id === 'string' && c.data.fromNodeId && c.data.toNodeId) {
      connIds.push(c.id);
    }
  }
  if (nodeIds.length > 0 || connIds.length > 0) {
    s.executeCommand(new DeleteSelectionCommand(s as any, nodeIds, connIds));
    s.selection.clearSelection();
    s.requestRedraw();
  }
}

function getSelectedNodeIds(): string[] {
  if (!scene.value) return [];
  return scene.value.selection.getSelection()
    .filter(n => n instanceof BlueprintNode)
    .map(n => (n as BlueprintNode).id);
}

function emitChange() {
  if (isUpdatingFromProps || !scene.value) return;
  if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
  changeDebounceTimer = setTimeout(() => {
    if (!scene.value) return;
    const data = scene.value.serializeLegacy();
    emit('change', data);
  }, 100);
}

function handleResize() {
  if (!containerRef.value || !canvasRef.value || !scene.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  scene.value.resize(rect.width, rect.height);
  scene.value.onResize(rect.width, rect.height);
}

let ctxOutsidePointerDown: ((e: PointerEvent) => void) | null = null;
let ctxCaptureKeyDown: ((e: KeyboardEvent) => void) | null = null;
let unsubToolContextMenu: (() => void) | null = null;
let unsubSelection: (() => void) | null = null;
let unsubViewport: (() => void) | null = null;

function setupKeyboardShortcuts(s: BlueprintScene) {
  ctxCaptureKeyDown = (e: KeyboardEvent) => {
    if (props.readonly) return;
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable === true;
    if (isEditable) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (key === 'escape') {
      if (ctxMenu.visible) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeCtxMenu();
      }
      return;
    }

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      s.undo();
      return;
    }
    if ((ctrl && key === 'z' && e.shiftKey) || (ctrl && key === 'y')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      s.redo();
      return;
    }
    if (ctrl && key === 'a') {
      e.preventDefault();
      e.stopImmediatePropagation();
      s.selection.setSelection(s.getAllBlueprintNodes().map(n => n.id));
      s.requestRedraw();
      return;
    }
    if (ctrl && key === 'c') {
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        s.copySelection(selectedNodes);
      }
      return;
    }
    if (ctrl && key === 'v') {
      if (s.hasClipboardData()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const newNodeIds = s.executePaste(50, 50);
        if (newNodeIds.length > 0) {
          s.selection.setSelection(newNodeIds);
          s.requestRedraw();
        }
      }
      return;
    }
    if (ctrl && key === 'd') {
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        s.copySelection(selectedNodes);
        const newNodeIds = s.executePaste(30, 30);
        if (newNodeIds.length > 0) {
          s.selection.setSelection(newNodeIds);
          s.requestRedraw();
        }
      }
      return;
    }
    if (ctrl && key === 'x') {
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        s.copySelection(selectedNodes);
        const nodeIds = selectedNodes.map(n => n.id);
        const allConns = s.getAllConnections();
        const connIds = allConns.filter(c => nodeIds.includes(c.data.fromNodeId) && nodeIds.includes(c.data.toNodeId)).map(c => c.id);
        s.executeCommand(new DeleteSelectionCommand(s as any, nodeIds, connIds));
        s.selection.clearSelection();
        s.requestRedraw();
      }
      return;
    }
    if (ctrl && key === 'g') {
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length >= 2) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const defaultLabel = `分组 ${s.getSavedSelectionFrames().length + 1}`;
        s.saveSelectionFrame(selectedNodes.map(n => n.id), defaultLabel);
        s.requestRedraw();
        emitChange();
      }
      return;
    }
    if ((key === 'delete' || key === 'backspace') && !ctrl) {
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      const selectedConns = s.selection.getSelection().filter(n => !(n instanceof BlueprintNode));
      if (selectedNodes.length > 0 || selectedConns.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        deleteSelection();
      }
      return;
    }
  };
  window.addEventListener('keydown', ctxCaptureKeyDown, true);
}

watch(() => props.initialData, (newData) => {
  if (newData && scene.value) {
    isUpdatingFromProps = true;
    scene.value.loadBlueprint(newData);
    scene.value.requestRedraw();
    nextTick(() => {
      isUpdatingFromProps = false;
    });
  }
}, { deep: false });

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return;

  const s = new BlueprintScene(canvasRef.value);
  scene.value = s;

  handleResize();

  if (props.initialData) {
    s.loadBlueprint(props.initialData);
  }

  s.start();

  s.on.on('viewport-change', (vp: { zoom: number; panX: number; panY: number }) => {
    emit('viewportChange', vp.zoom, vp.panX, vp.panY);
    s.onViewportChanged();
    emitChange();
  });

  unsubSelection = s.selection.on.on('select', () => {
    emit('selectionChange', getSelectedNodeIds());
    emitChange();
  });
  unsubSelection = s.selection.on.on('deselect', () => {
    emit('selectionChange', getSelectedNodeIds());
    emitChange();
  });

  const handleToolContextMenu = (e: unknown) => onToolContextMenu(e as GraphPointerEvent);
  unsubToolContextMenu = s.tools.on.on('context-menu', handleToolContextMenu);

  s.on.on('after-command', () => {
    ctxMenu.canUndo = s.canUndo();
    ctxMenu.canRedo = s.canRedo();
    emitChange();
  });

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(containerRef.value);
  window.addEventListener('resize', handleResize);

  ctxOutsidePointerDown = (e: PointerEvent) => {
    if (!ctxMenu.visible) return;
    const target = e.target as HTMLElement;
    if (target.closest('.bp-ctx-menu')) return;
    closeCtxMenu();
  };
  window.addEventListener('pointerdown', ctxOutsidePointerDown, true);

  setupKeyboardShortcuts(s);

  nextTick(() => {
    s.fitToContent(100);
    s.onViewportChanged();
  });
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('resize', handleResize);
  if (ctxOutsidePointerDown) window.removeEventListener('pointerdown', ctxOutsidePointerDown, true);
  if (ctxCaptureKeyDown) window.removeEventListener('keydown', ctxCaptureKeyDown, true);
  if (unsubToolContextMenu) unsubToolContextMenu();
  if (unsubSelection) unsubSelection();
  if (unsubViewport) unsubViewport();
  if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
  if (scene.value) {
    scene.value.dispose();
  }
});

defineExpose({
  loadBlueprint(data: LegacyBlueprintData) {
    if (!scene.value) return;
    isUpdatingFromProps = true;
    scene.value.loadBlueprint(data);
    scene.value.fitToContent(100);
    scene.value.onViewportChanged();
    scene.value.requestRedraw();
    nextTick(() => {
      isUpdatingFromProps = false;
    });
  },

  saveBlueprint(): LegacyBlueprintData | null {
    if (!scene.value) return null;
    return scene.value.serializeLegacy();
  },

  fitToView() {
    if (!scene.value) return;
    scene.value.fitToContent(100);
    scene.value.onViewportChanged();
  },

  resetView() {
    if (!scene.value) return;
    scene.value.setViewport({ zoom: 1, panX: 0, panY: 0 });
    scene.value.onViewportChanged();
  },

  zoomIn() {
    if (!scene.value) return;
    scene.value.setZoom(scene.value.camera.zoom * 1.2);
    scene.value.onViewportChanged();
  },

  zoomOut() {
    if (!scene.value) return;
    scene.value.setZoom(scene.value.camera.zoom / 1.2);
    scene.value.onViewportChanged();
  },

  undo() {
    scene.value?.undo();
  },

  redo() {
    scene.value?.redo();
  },

  canUndo(): boolean {
    return scene.value?.canUndo() ?? false;
  },

  canRedo(): boolean {
    return scene.value?.canRedo() ?? false;
  },

  addNode(type: string, x: number, y: number, data?: Record<string, any>): string | null {
    if (!scene.value || props.readonly) return null;
    const s = scene.value;
    const defaultSize = DEFAULT_NODE_SIZES[type] || { width: 240, height: 180 };
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const nodeData: BlueprintNodeData = {
      title: type,
      width: defaultSize.width,
      height: defaultSize.height,
      inputs: [],
      outputs: [],
      ...data,
      id: nodeId,
      type,
      worldX: x,
      worldY: y,
    };
    
    s.addBlueprintNode(nodeData);
    s.selection.setSelection([nodeId]);
    s.requestRedraw();
    emitChange();
    return nodeId;
  },

  deleteSelection() {
    deleteSelection();
  },

  copySelection() {
    if (!scene.value) return;
    const selectedNodes = scene.value.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (selectedNodes.length > 0) {
      scene.value.copySelection(selectedNodes);
    }
  },

  paste() {
    if (!scene.value || props.readonly) return;
    const newNodeIds = scene.value.executePaste(50, 50);
    if (newNodeIds.length > 0) {
      scene.value.selection.setSelection(newNodeIds);
      scene.value.requestRedraw();
    }
  },

  selectAll() {
    if (!scene.value) return;
    scene.value.selection.setSelection(scene.value.getAllBlueprintNodes().map(n => n.id));
    scene.value.requestRedraw();
  },

  clearSelection() {
    if (!scene.value) return;
    scene.value.selection.clearSelection();
    scene.value.requestRedraw();
  },

  setNodeStatus(nodeId: string, status: NodeStatus) {
    if (!scene.value) return;
    const node = scene.value.getBlueprintNode(nodeId);
    if (node) {
      (node.data as any).status = status;
      scene.value.requestRedraw();
    }
  },

  getSelectedNodeIds(): string[] {
    return getSelectedNodeIds();
  },

  getZoom(): number {
    return scene.value?.camera.zoom ?? 1;
  },

  getScene(): BlueprintScene | null {
    return scene.value;
  },

  clear() {
    if (!scene.value || props.readonly) return;
    scene.value.loadBlueprint({ viewport: { zoom: 1, panX: 0, panY: 0 }, nodes: [], edges: [] });
    scene.value.selection.clearSelection();
    scene.value.requestRedraw();
    emitChange();
  },

  saveSelectionFrame(label?: string): string | null {
    if (!scene.value || props.readonly) return null;
    const s = scene.value;
    const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (selectedNodes.length < 2) return null;
    const frameLabel = label || `分组 ${s.getSavedSelectionFrames().length + 1}`;
    const frame = s.saveSelectionFrame(selectedNodes.map(n => n.id), frameLabel);
    s.requestRedraw();
    emitChange();
    return frame.id;
  },

  getSavedSelectionFrames() {
    return scene.value?.getSavedSelectionFrames() ?? [];
  },

  deleteSavedSelectionFrame(frameId: string): boolean {
    if (!scene.value || props.readonly) return false;
    const result = scene.value.deleteSavedSelectionFrame(frameId);
    if (result) {
      scene.value.requestRedraw();
      emitChange();
    }
    return result;
  },

  renameSavedSelectionFrame(frameId: string, newLabel: string): boolean {
    if (!scene.value || props.readonly) return false;
    const result = scene.value.renameSavedSelectionFrame(frameId, newLabel);
    if (result) {
      scene.value.requestRedraw();
      emitChange();
    }
    return result;
  },

  getNodeCount(): number {
    return scene.value?.getAllBlueprintNodes().length ?? 0;
  },

  getEdgeCount(): number {
    return scene.value?.getAllConnections().length ?? 0;
  },
});
</script>

<style scoped>
.blueprint-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #15181c;
  position: relative;
  overflow: hidden;
}

.bp-readonly {
  pointer-events: none;
}

.bp-canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.bp-canvas-container canvas {
  display: block;
  cursor: default;
}
</style>
