<template>
  <div class="blueprint-editor" :class="{ 'bp-readonly': readonly }">
    <div class="bp-canvas-container" ref="containerRef">
      <canvas ref="canvasRef"></canvas>
      <BlueprintDomOverlay 
        :scene="scene" 
        :chat-state="chatState"
        :node-generation-tasks="nodeGenerationTasks"
        :legacy-resources="legacyResources"
        :editing-node-id="editingNodeId"
        @node-click="handleNodeClick"
        @node-contextmenu="handleNodeContextMenu"
        @node-copy="handleNodeCopy"
        @node-delete="handleNodeDelete"
        @node-refresh="(id: string) => emit('nodeRefresh', id)"
        @node-chat-submit="(p: any) => emit('nodeChatSubmit', p)"
        @node-chat-close="(id: string) => emit('nodeChatClose', id)"
        @node-chat-update-draft="(p: any) => emit('nodeChatUpdateDraft', p)"
        @node-chat-update-params="(p: any) => emit('nodeChatUpdateParams', p)"
        @node-chat-update-selected-refs="(p: any) => emit('nodeChatUpdateSelectedRefs', p)"
        @node-chat-remove-param-ref="(p: any) => emit('nodeChatRemoveParamRef', p)"
        @node-chat-stop="(id: string) => emit('nodeChatStop', id)"
        @node-start-link="(p: any) => emit('nodeStartLink', p)"
        @node-end-link="(p: any) => emit('nodeEndLink', p)"
        @node-preview-request="(p: any) => emit('nodePreviewRequest', p)"
        @node-clear-resource="(id: string) => emit('nodeClearResource', id)"
        @node-upload-resource="(p: any) => emit('nodeUploadResource', p)"
        @node-update-image-settings="(p: any) => emit('nodeUpdateImageSettings', p)"
        @node-media-ready="(id: string) => emit('nodeMediaReady', id)"
        @node-invalidate-screenshot="(id: string) => emit('nodeInvalidateScreenshot', id)"
        @node-preview-contextmenu="(p: any) => emit('nodePreviewContextMenu', p)"
        @interaction-end="emitChange"
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
import { BlueprintScene, BlueprintNode, Connection } from './index';
import type { GraphPointerEvent } from '../graphbase/input/events';
import type { LegacyBlueprintData, NodeStatus, BlueprintNodeData, BlueprintData } from './types';
import { DEFAULT_NODE_SIZES, getDefaultNodeData } from './types';
import BlueprintDomOverlay from './dom/BlueprintDomOverlay.vue';
import BlueprintContextMenu from './dom/BlueprintContextMenu.vue';
import type { NodeChatState } from './dom/NodeComponentResolver';
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand';
import { MoveNodeCommand } from '../graphbase/commands/CompositeCommand';
import { Vector2 } from '../graphbase/core/Vector2';
import type { WorkflowNodeChatSubmitPayload, WorkflowNodeGenerationTask } from '../../aiworkflow/types';
import type { LegacyResourceData } from './types';

interface Props {
  initialData?: LegacyBlueprintData;
  projectPath?: string;
  readonly?: boolean;
  theme?: 'light' | 'dark';
  chatState?: NodeChatState | null;
  nodeGenerationTasks?: Record<string, WorkflowNodeGenerationTask>;
  legacyResources?: Record<string, LegacyResourceData>;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  theme: 'dark',
});

interface Emits {
  (e: 'change', data: LegacyBlueprintData): void;
  (e: 'save', data: LegacyBlueprintData): void;
  (e: 'selectionChange', nodeIds: string[]): void;
  (e: 'nodeClick', nodeId: string, event: MouseEvent): void;
  (e: 'nodeContextMenu', nodeId: string, event: MouseEvent, worldPos: { x: number; y: number }): void;
  (e: 'canvasContextMenu', event: MouseEvent, worldPos: { x: number; y: number }): void;
  (e: 'canvasDoubleClick', event: MouseEvent, worldPos: { x: number; y: number }): void;
  (e: 'canvasDrop', event: DragEvent, worldPos: { x: number; y: number }): void;
  (e: 'viewportChange', zoom: number, panX: number, panY: number): void;
  (e: 'nodeRefresh', nodeId: string): void;
  (e: 'nodeChatSubmit', payload: WorkflowNodeChatSubmitPayload): void;
  (e: 'nodeChatClose', nodeId: string): void;
  (e: 'nodeChatUpdateDraft', payload: { nodeId: string; draft: string }): void;
  (e: 'nodeChatUpdateParams', payload: { nodeId: string; params: Record<string, any> }): void;
  (e: 'nodeChatUpdateSelectedRefs', payload: { nodeId: string; selectedRefs: any[] }): void;
  (e: 'nodeChatRemoveParamRef', payload: { nodeId: string; refItem: any }): void;
  (e: 'nodeChatStop', nodeId: string): void;
  (e: 'linkDropOnCanvas', payload: { clientX: number; clientY: number; worldX: number; worldY: number; fromNodeId: string; fromAnchorId: string }): void;
  (e: 'nodeStartLink', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void;
  (e: 'nodeEndLink', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void;
  (e: 'nodePreviewRequest', payload: { nodeId: string; imageUrl: string }): void;
  (e: 'nodeClearResource', nodeId: string): void;
  (e: 'nodeUploadResource', payload: { nodeId: string; file: File; kind: string }): void;
  (e: 'nodeUpdateImageSettings', payload: { nodeId: string; patch: Record<string, any> }): void;
  (e: 'nodeMediaReady', nodeId: string): void;
  (e: 'nodeInvalidateScreenshot', nodeId: string): void;
  (e: 'nodePreviewContextMenu', payload: { nodeId: string; clientX: number; clientY: number }): void;
}

const emit = defineEmits<Emits>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<BlueprintScene | null>(null);
const editingNodeId = ref<string | null>(null);

let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let isUpdatingFromProps = false;
let changeDebounceTimer: number | null = null;
let lastStructureHash: string | null = null;
let hasInitiallyLoaded = false;
let isEnteringEditMode = false;

function applyInitialData(newData: LegacyBlueprintData) {
  if (!scene.value) return;
  const s = scene.value;

  if (s.isEngineDragging || s.isDomInteractionLocked || s.isViewportPanning) return;

  if (editingNodeId.value) return;

  const newHash = computeStructureHash(newData);
  const structureChanged = newHash !== lastStructureHash;

  isUpdatingFromProps = true;

  let needsRedraw = false;

  if (structureChanged || !hasInitiallyLoaded) {
    s.loadBlueprint(newData);
    lastStructureHash = newHash;
    hasInitiallyLoaded = true;
    needsRedraw = true;

    if (newData.selectedNodeIds && newData.selectedNodeIds.length > 0) {
      s.selection.setSelection(newData.selectedNodeIds);
    } else if (newData.selectedNodeId) {
      s.selection.setSelection([newData.selectedNodeId]);
    } else {
      s.selection.clearSelection();
    }
  } else {
    if (newData.viewport) {
      const curVp = s.getViewport();
      if (!viewportEquals(curVp, newData.viewport)) {
        s.setViewport(newData.viewport);
        needsRedraw = true;
      }
    }

    if (newData.selectedNodeIds && newData.selectedNodeIds.length > 0) {
      s.selection.setSelection(newData.selectedNodeIds);
    } else if (newData.selectedNodeId) {
      s.selection.setSelection([newData.selectedNodeId]);
    } else {
      s.selection.clearSelection();
    }
  }

  if (needsRedraw) {
    s.requestRedraw();
  }
  nextTick(() => {
    isUpdatingFromProps = false;
  });
}

function enterEditMode(nodeId: string) {
  if (!scene.value) return;
  const node = scene.value.getBlueprintNode(nodeId);
  if (!node) return;

  if (editingNodeId.value && editingNodeId.value !== nodeId) {
    const prevNode = scene.value.getBlueprintNode(editingNodeId.value);
    if (prevNode) prevNode.setDomMode(false);
    editingNodeId.value = null;
  }

  isEnteringEditMode = true;
  scene.value.selection.setSelection([nodeId]);
  isEnteringEditMode = false;

  editingNodeId.value = nodeId;
  node.setDomMode(true);
  scene.value.isEngineDragging = false;
  scene.value.isDomInteractionLocked = false;
  scene.value.requestRedraw();
}

function exitEditMode() {
  if (editingNodeId.value) {
    if (scene.value) {
      const node = scene.value.getBlueprintNode(editingNodeId.value);
      if (node) node.setDomMode(false);
      scene.value.isEngineDragging = false;
      scene.value.isDomInteractionLocked = false;
      scene.value.tools.drag?.cancelDrag?.();
      scene.value.requestRedraw();
      nextTick(() => {
        if (!isUpdatingFromProps && scene.value) {
          emitChange();
        }
      });
    }
    editingNodeId.value = null;
  }
}

function handleSceneNodeClick(node: BlueprintNode) {
  enterEditMode(node.id);
}

function computeStructureHash(data: LegacyBlueprintData): string {
  const nodeParts: string[] = [];
  for (const id of data.nodeOrder || Object.keys(data.nodesById || {})) {
    const n = data.nodesById[id];
    if (n) {
      const wx = (typeof n.worldX === 'number' && !isNaN(n.worldX)) ? n.worldX : ((n as any).x ?? 0);
      const wy = (typeof n.worldY === 'number' && !isNaN(n.worldY)) ? n.worldY : ((n as any).y ?? 0);
      nodeParts.push(`${id}:${wx.toFixed(1)},${wy.toFixed(1)},${n.width},${n.height}`);
    }
  }
  const edgeSig = (data.edgeOrder || Object.keys(data.edgesById || {})).sort().join(',');
  const resSig = (data.resourceOrder || Object.keys(data.resourcesById || {})).sort().join(',');
  return `${nodeParts.join('|')}||${edgeSig}||${resSig}`;
}

function viewportEquals(a: { zoom: number; panX: number; panY: number }, b: { zoom: number; panX: number; panY: number }): boolean {
  return Math.abs(a.zoom - b.zoom) < 0.001
    && Math.abs(a.panX - b.panX) < 0.5
    && Math.abs(a.panY - b.panY) < 0.5;
}

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
  const worldPos = getWorldPosFromClient(event.clientX, event.clientY);
  emit('nodeContextMenu', nodeId, event, worldPos);
  openCtxMenu(event.clientX, event.clientY, nodeId);
}

function handleNodeClick(nodeId: string, event: MouseEvent) {
  enterEditMode(nodeId);
  emit('nodeClick', nodeId, event);
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

function getWorldPosFromClient(clientX: number, clientY: number): { x: number; y: number } {
  if (!containerRef.value || !scene.value) return { x: 0, y: 0 };
  const rect = containerRef.value.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const worldPos = scene.value.camera.screenToWorld(new Vector2(sx, sy));
  return { x: worldPos.x, y: worldPos.y };
}

function onToolContextMenu(event: GraphPointerEvent) {
  if (ctxMenu.visible) closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  const originalEvent = event.originalEvent as MouseEvent;
  const clientX = originalEvent.clientX;
  const clientY = originalEvent.clientY;
  const worldPos = getWorldPosFromClient(clientX, clientY);

  const hitNode = event.hitResult?.node;
  if (hitNode && hitNode instanceof BlueprintNode) {
    const targetId = hitNode.id;
    const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (!selectedNodes.find(n => n.id === targetId)) {
      s.selection.setSelection([targetId]);
      s.requestRedraw();
    }
    emit('nodeContextMenu', targetId, originalEvent, worldPos);
  } else {
    s.selection.clearSelection();
    s.requestRedraw();
    emit('canvasContextMenu', originalEvent, worldPos);
  }
}

function onCtxUndo() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  if (s.undo()) {
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
  }
}
function onCtxRedo() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  if (s.redo()) {
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
  }
}
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
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
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
  if (!scene.value || props.readonly) return;
  const s = scene.value;
  let newNodeIds: string[];
  const mp = lastMouseWorldPos.value;
  if (mp) {
    newNodeIds = s.pasteAt(mp.x, mp.y);
  } else {
    newNodeIds = s.executePaste(50, 50);
  }
  if (newNodeIds.length > 0) {
    s.selection.setSelection(newNodeIds);
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
  }
}
function onCtxDuplicate() {
  closeCtxMenu();
  if (!scene.value || props.readonly) return;
  const s = scene.value;
  const newNodeIds = s.duplicateSelection(30, 30);
  if (newNodeIds.length > 0) {
    s.selection.setSelection(newNodeIds);
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
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
  if (!scene.value || props.readonly) return;
  const s = scene.value;
  const hadSelection = s.selection.getSelection().length > 0;
  s.deleteSelection();
  if (editingNodeId.value) {
    const stillExists = s.getBlueprintNode(editingNodeId.value);
    if (!stillExists) exitEditMode();
  }
  if (hadSelection) {
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
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
  if (scene.value.isEngineDragging || scene.value.isDomInteractionLocked) return;
  if (changeDebounceTimer) {
    clearTimeout(changeDebounceTimer);
  }
  changeDebounceTimer = window.setTimeout(() => {
    changeDebounceTimer = null;
    if (!scene.value || isUpdatingFromProps) return;
    const data = scene.value.serializeLegacy();
    emit('change', data);
  }, 16);
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
let unsubNodeClick: (() => void) | null = null;
let unsubSelect: (() => void) | null = null;
let unsubDeselect: (() => void) | null = null;
let unsubViewport: (() => void) | null = null;
let unsubAfterCommand: (() => void) | null = null;
let unsubLinkDropOnCanvas: (() => void) | null = null;
let onContainerDragOver: ((e: DragEvent) => void) | null = null;
let onContainerDrop: ((e: DragEvent) => void) | null = null;
let onContainerMouseMove: ((e: MouseEvent) => void) | null = null;
const lastMouseWorldPos = ref<{ x: number; y: number } | null>(null);

function setupKeyboardShortcuts(s: BlueprintScene) {
  ctxCaptureKeyDown = (e: KeyboardEvent) => {
    if (props.readonly) return;
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' ||
      (target as any)?.isContentEditable === true ||
      !!(target && target.closest('.bp-node-chat-dialog'));
    if (isEditable) {
      if (e.key === 'Escape' && !e.repeat && target) {
        (target as HTMLElement).blur();
      }
      return;
    }

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
      const undone = s.undo();
      if (undone) {
        s.updateAllConnectionEndpoints();
        s.requestRedraw();
        emitChange();
      }
      return;
    }
    if ((ctrl && key === 'z' && e.shiftKey) || (ctrl && key === 'y')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const redone = s.redo();
      if (redone) {
        s.updateAllConnectionEndpoints();
        s.requestRedraw();
        emitChange();
      }
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selected = s.selection.getSelection();
      const nodeIdsToRemove: string[] = [];
      const connIdsToRemove: string[] = [];
      for (const item of selected) {
        if (item instanceof BlueprintNode) {
          nodeIdsToRemove.push(item.id);
        } else if (item instanceof Connection) {
          connIdsToRemove.push(item.id);
        }
      }
      if (nodeIdsToRemove.length > 0 || connIdsToRemove.length > 0) {
        s.executeCommand(new DeleteSelectionCommand(s as any, nodeIdsToRemove, connIdsToRemove));
        s.selection.clearSelection();
        if (editingNodeId.value && nodeIdsToRemove.includes(editingNodeId.value)) {
          exitEditMode();
        }
        s.updateAllConnectionEndpoints();
        s.requestRedraw();
        emitChange();
      }
      return;
    }
    if (key === 'enter' && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length === 1) {
        enterEditMode(selectedNodes[0].id);
      }
      return;
    }
    if (key === 'escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (editingNodeId.value) {
        exitEditMode();
      }
      closeCtxMenu();
      return;
    }
    if (ctrl && key === 'a') {
      e.preventDefault();
      e.stopImmediatePropagation();
      s.selection.selectAll();
      s.requestRedraw();
      return;
    }
    if (ctrl && key === 'c') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      s.copySelection(selectedNodes);
      return;
    }
    if (ctrl && key === 'v') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (s.hasClipboardData()) {
        let newNodeIds: string[];
        const mp = lastMouseWorldPos.value;
        if (mp) {
          newNodeIds = s.pasteAt(mp.x, mp.y);
        } else {
          newNodeIds = s.executePaste(50, 50);
        }
        if (newNodeIds.length > 0) {
          s.selection.setSelection(newNodeIds);
        }
        s.updateAllConnectionEndpoints();
        s.requestRedraw();
        emitChange();
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
          emitChange();
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
        emitChange();
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
  };
  window.addEventListener('keydown', ctxCaptureKeyDown, true);
}

watch(() => props.initialData, (newData) => {
  if (!newData || !scene.value) return;
  applyInitialData(newData);
}, { deep: false });

watch(() => props.nodeGenerationTasks, (tasks) => {
  if (!scene.value || !tasks) return;
  const s = scene.value;
  const nodes = s.getAllBlueprintNodes();
  let needsRedraw = false;
  for (const node of nodes) {
    const nodeId = node.id;
    const nodeTasks = Object.values(tasks).filter(t => t.nodeId === nodeId);
    const activeTask = nodeTasks.find(t => t.status === 'submitting' || t.status === 'running')
      || nodeTasks.find(t => t.status === 'error')
      || nodeTasks.find(t => t.status === 'completed')
      || null;
    let nextStatus: 'idle' | 'running' | 'success' | 'error' = 'idle';
    if (activeTask) {
      if (activeTask.status === 'submitting' || activeTask.status === 'running') nextStatus = 'running';
      else if (activeTask.status === 'error') nextStatus = 'error';
      else if (activeTask.status === 'completed') nextStatus = 'success';
    }
    if ((node.data as any).status !== nextStatus) {
      (node.data as any).status = nextStatus;
      needsRedraw = true;
    }
  }
  if (needsRedraw) {
    s.requestRedraw();
  }
}, { deep: true });

watch(() => props.legacyResources, (res) => {
  if (!scene.value || !res) return;
  (scene.value as any)._legacyResources = res;
}, { deep: false });

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return;

  const s = new BlueprintScene(canvasRef.value);
  scene.value = s;

  isUpdatingFromProps = true;

  handleResize();

  if (props.initialData) {
    s.loadBlueprint(props.initialData);
    lastStructureHash = computeStructureHash(props.initialData);
    hasInitiallyLoaded = true;
  }

  s.start();

  unsubViewport = s.on.on('viewport-change', (vp: { zoom: number; panX: number; panY: number }) => {
    if (isUpdatingFromProps) return;
    emit('viewportChange', vp.zoom, vp.panX, vp.panY);
    s.onViewportChanged();
  });

  unsubSelect = s.selection.on.on('select', () => {
    if (isUpdatingFromProps) return;
    const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (editingNodeId.value && selectedNodes.length > 1 && !isEnteringEditMode) {
      exitEditMode();
    }
    emit('selectionChange', getSelectedNodeIds());
  });
  unsubDeselect = s.selection.on.on('deselect', () => {
    if (isUpdatingFromProps) return;
    const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (editingNodeId.value && selectedNodes.length === 0 && !isEnteringEditMode) {
      exitEditMode();
    }
    emit('selectionChange', getSelectedNodeIds());
  });

  const handleToolContextMenu = (e: unknown) => onToolContextMenu(e as GraphPointerEvent);
  unsubToolContextMenu = s.tools.on.on('context-menu', handleToolContextMenu);

  unsubNodeClick = s.on.on('node-click', (node: unknown) => {
    if (node instanceof BlueprintNode) {
      handleSceneNodeClick(node);
    }
  });

  unsubAfterCommand = s.on.on('after-command', () => {
    ctxMenu.canUndo = s.canUndo();
    ctxMenu.canRedo = s.canRedo();
    emitChange();
  });

  unsubLinkDropOnCanvas = s.on.on('link-drop-on-canvas', (payload: unknown) => {
    emit('linkDropOnCanvas', payload as { clientX: number; clientY: number; worldX: number; worldY: number; fromNodeId: string; fromAnchorId: string });
  });

  if (containerRef.value) {
    onContainerDragOver = (e: DragEvent) => {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      e.preventDefault();
    };
    onContainerDrop = (e: DragEvent) => {
      e.preventDefault();
      const worldPos = getWorldPosFromClient(e.clientX, e.clientY);
      emit('canvasDrop', e, worldPos);
    };
    onContainerMouseMove = (e: MouseEvent) => {
      const worldPos = getWorldPosFromClient(e.clientX, e.clientY);
      lastMouseWorldPos.value = worldPos;
    };
    containerRef.value.addEventListener('dragover', onContainerDragOver);
    containerRef.value.addEventListener('drop', onContainerDrop);
    containerRef.value.addEventListener('mousemove', onContainerMouseMove);
  }

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
    if (props.initialData?.viewport) {
      s.setViewport(props.initialData.viewport);
    } else {
      s.fitToContent(100);
    }
    s.onViewportChanged();
    s.requestRedraw();
    nextTick(() => {
      isUpdatingFromProps = false;
      const curVp = s.getViewport();
      emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY);
    });
  });
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('resize', handleResize);
  if (ctxOutsidePointerDown) window.removeEventListener('pointerdown', ctxOutsidePointerDown, true);
  if (ctxCaptureKeyDown) window.removeEventListener('keydown', ctxCaptureKeyDown, true);
  if (unsubToolContextMenu) unsubToolContextMenu();
  if (unsubNodeClick) unsubNodeClick();
  if (unsubSelect) unsubSelect();
  if (unsubDeselect) unsubDeselect();
  if (unsubViewport) unsubViewport();
  if (unsubAfterCommand) unsubAfterCommand();
  if (unsubLinkDropOnCanvas) unsubLinkDropOnCanvas();
  if (containerRef.value) {
    if (onContainerDragOver) containerRef.value.removeEventListener('dragover', onContainerDragOver);
    if (onContainerDrop) containerRef.value.removeEventListener('drop', onContainerDrop);
    if (onContainerMouseMove) containerRef.value.removeEventListener('mousemove', onContainerMouseMove);
  }
  if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
  if (scene.value) {
    scene.value.dispose();
  }
});

defineExpose({
  getViewport() {
    if (!scene.value) return { zoom: 1, panX: 0, panY: 0 };
    return scene.value.getViewport();
  },

  loadBlueprint(data: LegacyBlueprintData, options?: { fitToContent?: boolean }) {
    if (!scene.value) return;
    isUpdatingFromProps = true;
    scene.value.loadBlueprint(data);
    lastStructureHash = computeStructureHash(data);
    hasInitiallyLoaded = true;
    if (options?.fitToContent || !data.viewport) {
      scene.value.fitToContent(100);
    } else if (data.viewport) {
      scene.value.setViewport(data.viewport);
    }
    scene.value.onViewportChanged();
    scene.value.requestRedraw();
    nextTick(() => {
      isUpdatingFromProps = false;
      if (scene.value) {
        const curVp = scene.value.getViewport();
        emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY);
      }
    });
  },

  setViewport(viewport: { zoom: number; panX: number; panY: number }) {
    if (!scene.value) return;
    isUpdatingFromProps = true;
    scene.value.setViewport(viewport);
    scene.value.onViewportChanged();
    scene.value.requestRedraw();
    nextTick(() => {
      isUpdatingFromProps = false;
      if (scene.value) {
        const curVp = scene.value.getViewport();
        emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY);
      }
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
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const baseNodeData = getDefaultNodeData(type, nodeId, x, y, data?.title);
    const nodeData: BlueprintNodeData = {
      ...baseNodeData,
      ...data,
      id: nodeId,
      type,
      worldX: x,
      worldY: y,
      inputs: data?.inputs ?? baseNodeData.inputs,
      outputs: data?.outputs ?? baseNodeData.outputs,
    };
    
    s.createWorkflowNode(nodeData);
    s.selection.setSelection([nodeId]);
    enterEditMode(nodeId);
    s.updateAllConnectionEndpoints();
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
    let newNodeIds: string[];
    const mp = lastMouseWorldPos.value;
    if (mp) {
      newNodeIds = scene.value.pasteAt(mp.x, mp.y);
    } else {
      newNodeIds = scene.value.executePaste(50, 50);
    }
    if (newNodeIds.length > 0) {
      scene.value.selection.setSelection(newNodeIds);
      scene.value.updateAllConnectionEndpoints();
      scene.value.requestRedraw();
      emitChange();
    }
  },

  pasteAt(worldX: number, worldY: number) {
    if (!scene.value || props.readonly) return [];
    const newNodeIds = scene.value.pasteAt(worldX, worldY);
    if (newNodeIds.length > 0) {
      scene.value.selection.setSelection(newNodeIds);
      scene.value.updateAllConnectionEndpoints();
      scene.value.requestRedraw();
      emitChange();
    }
    return newNodeIds;
  },

  duplicate() {
    if (!scene.value || props.readonly) return;
    const newNodeIds = scene.value.duplicateSelection(30, 30);
    if (newNodeIds.length > 0) {
      scene.value.selection.setSelection(newNodeIds);
      scene.value.updateAllConnectionEndpoints();
      scene.value.requestRedraw();
      emitChange();
    }
  },

  createNodeWithConnection(params: {
    type: string;
    x: number;
    y: number;
    title?: string;
    fromNodeId: string;
    fromAnchorId: string;
    findBestInputAnchor?: (nodesById: Record<string, any>, fromNodeId: string, fromAnchorId: string, newNodeId: string) => string | null;
    additionalData?: Record<string, any>;
  }): { nodeId: string | null; connected: boolean } {
    if (!scene.value || props.readonly) return { nodeId: null, connected: false };
    const s = scene.value;
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const baseNodeData = getDefaultNodeData(params.type, nodeId, params.x, params.y, params.title);
    const nodeData: BlueprintNodeData = {
      ...baseNodeData,
      ...(params.additionalData || {}),
      id: nodeId,
      type: params.type,
      worldX: params.x,
      worldY: params.y,
      inputs: params.additionalData?.inputs ?? baseNodeData.inputs,
      outputs: params.additionalData?.outputs ?? baseNodeData.outputs,
    };

    s.createWorkflowNode(nodeData);

    let connected = false;
    if (params.findBestInputAnchor) {
      const currentData = s.serializeLegacy();
      const toAnchorId = params.findBestInputAnchor(currentData.nodesById, params.fromNodeId, params.fromAnchorId, nodeId);
      if (toAnchorId) {
        const conn = s.connectNodes(params.fromNodeId, params.fromAnchorId, nodeId, toAnchorId);
        connected = !!conn;
      }
    }

    s.selection.setSelection([nodeId]);
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
    return { nodeId, connected };
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
    emitChange();
  },

  setSelection(nodeIds: string[]) {
    if (!scene.value) return;
    const validIds = nodeIds.filter(id => scene.value!.getBlueprintNode(id));
    scene.value.selection.setSelection(validIds);
    scene.value.requestRedraw();
    emitChange();
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

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    return getWorldPosFromClient(clientX, clientY);
  },

  getScene(): BlueprintScene | null {
    return scene.value;
  },

  clear() {
    if (!scene.value || props.readonly) return;
    scene.value.loadBlueprint({ viewport: { zoom: 1, panX: 0, panY: 0 }, nodes: [], edges: [] });
    scene.value.selection.clearSelection();
    lastStructureHash = computeStructureHash({
      schemaVersion: 1,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      nodesById: {}, nodeOrder: [],
      edgesById: {}, edgeOrder: [],
      resourcesById: {}, resourceOrder: [],
      selectionTagsByKey: {},
    });
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

  getNodeScreenRect(nodeId: string): { left: number; top: number; width: number; height: number; nodeType?: string } | null {
    if (!scene.value || !containerRef.value) return null;
    const s = scene.value;
    const node = s.getBlueprintNode(nodeId);
    if (!node) return null;
    const nw = node.data.width || DEFAULT_NODE_SIZES.base.width;
    const nh = node.data.height || DEFAULT_NODE_SIZES.base.height;
    const topLeft = s.camera.worldToScreen(new Vector2(node.data.worldX, node.data.worldY));
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: nw * s.camera.zoom,
      height: nh * s.camera.zoom,
      nodeType: node.nodeType || node.data.type
    };
  },

  updateNodeData(nodeId: string, patch: Record<string, any>): boolean {
    if (!scene.value || props.readonly) return false;
    const s = scene.value;
    const node = s.getBlueprintNode(nodeId);
    if (!node) return false;
    node.setData(patch);
    if (patch.inputs || patch.outputs) {
      s.updateAllConnectionEndpoints();
    }
    s.requestRedraw();
    emitChange();
    return true;
  },

  moveNode(nodeId: string, x: number, y: number): boolean {
    if (!scene.value || props.readonly) return false;
    const s = scene.value;
    const node = s.getBlueprintNode(nodeId);
    if (!node) return false;
    const startPositions = new Map<string, Vector2>();
    const endPositions = new Map<string, Vector2>();
    startPositions.set(nodeId, new Vector2(node.data.worldX, node.data.worldY));
    endPositions.set(nodeId, new Vector2(x, y));
    const moveFn = (id: string, pos: Vector2) => {
      const n = s.getBlueprintNode(id);
      if (n) n.setPosition(pos.x, pos.y);
    };
    s.executeCommand(new MoveNodeCommand(startPositions, endPositions, moveFn));
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
    return true;
  },

  moveNodesByDelta(nodeIds: string[], dx: number, dy: number): boolean {
    if (!scene.value || props.readonly) return false;
    const s = scene.value;
    const startPositions = new Map<string, Vector2>();
    const endPositions = new Map<string, Vector2>();
    for (const nodeId of nodeIds) {
      const node = s.getBlueprintNode(nodeId);
      if (node) {
        startPositions.set(nodeId, new Vector2(node.data.worldX, node.data.worldY));
        endPositions.set(nodeId, new Vector2(node.data.worldX + dx, node.data.worldY + dy));
      }
    }
    if (startPositions.size === 0) return false;
    const moveFn = (id: string, pos: Vector2) => {
      const n = s.getBlueprintNode(id);
      if (n) n.setPosition(pos.x, pos.y);
    };
    s.executeCommand(new MoveNodeCommand(startPositions, endPositions, moveFn));
    s.updateAllConnectionEndpoints();
    s.requestRedraw();
    emitChange();
    return true;
  },

  connectPorts(fromNodeId: string, fromAnchorId: string, toNodeId: string, toAnchorId: string): boolean {
    if (!scene.value || props.readonly) return false;
    const conn = scene.value.connectNodes(fromNodeId, fromAnchorId, toNodeId, toAnchorId);
    if (conn) {
      scene.value.updateAllConnectionEndpoints();
      scene.value.requestRedraw();
      emitChange();
      return true;
    }
    return false;
  },

  removeNode(nodeId: string): boolean {
    if (!scene.value || props.readonly) return false;
    const node = scene.value.getBlueprintNode(nodeId);
    if (!node) return false;
    scene.value.executeCommand(new DeleteSelectionCommand(scene.value, [nodeId], []));
    scene.value.selection.clearSelection();
    scene.value.updateAllConnectionEndpoints();
    scene.value.requestRedraw();
    emitChange();
    return true;
  },

  removeEdge(edgeId: string): boolean {
    if (!scene.value || props.readonly) return false;
    const conn = scene.value.getConnection(edgeId);
    if (!conn) return false;
    scene.value.executeCommand(new DeleteSelectionCommand(scene.value, [], [edgeId]));
    scene.value.updateAllConnectionEndpoints();
    scene.value.requestRedraw();
    emitChange();
    return true;
  },
});
</script>

<style scoped>
.blueprint-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--wf-page-bg, #15181c);
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
