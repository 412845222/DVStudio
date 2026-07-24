<template>
  <div class="blueprint-test-page">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">AI工作流蓝图编辑器测试</span>
        <span class="stats">FPS: {{ fps }} | Nodes: {{ nodeCount }} | Edges: {{ edgeCount }}</span>
      </div>
      <div class="toolbar-right">
        <button @click="resetView">重置视图</button>
        <button @click="fitToContent">适应内容</button>
        <button @click="zoomIn">放大</button>
        <button @click="zoomOut">缩小</button>
        <button @click="saveSelection" :disabled="!canSaveSelection">保存分组 (Ctrl+G)</button>
        <button @click="clearAll">清空</button>
        <button @click="reloadData">重新加载测试数据</button>
        <button @click="loadLegacyDemo">加载演示项目(v1格式)</button>
        <button @click="loadFile">加载蓝图文件</button>
        <button @click="saveLegacy">保存为v1格式</button>
        <span class="divider">|</span>
        <button @click="setSelectedNodeStatus('idle')" :disabled="!selectedNodeForStatus">状态: idle</button>
        <button @click="setSelectedNodeStatus('running')" :disabled="!selectedNodeForStatus">状态: running</button>
        <button @click="setSelectedNodeStatus('success')" :disabled="!selectedNodeForStatus">状态: success</button>
        <button @click="setSelectedNodeStatus('error')" :disabled="!selectedNodeForStatus">状态: error</button>
        <span class="zoom-info">{{ Math.round(zoom * 100) }}%</span>
      </div>
    </div>
    <div class="canvas-container" ref="containerRef">
      <canvas ref="canvasRef"></canvas>
      <BlueprintDomOverlay 
        :scene="scene" 
        @node-dblclick="onNodeDblClick"
        @node-contextmenu="onNodeContextMenu"
        @node-copy="onNodeCopy"
        @node-delete="onNodeDelete"
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
      <input type="file" ref="fileInputRef" accept=".json" style="display: none" @change="handleFileLoad" />
      <div class="hint-overlay" v-if="showHint">
        <div class="hint-content">
          <h3>操作提示</h3>
          <ul>
            <li>🖱️ <b>左键拖拽节点</b>：移动节点</li>
            <li>📐 <b>选中节点后拖拽四角</b>：调整节点尺寸（最小180x120）</li>
            <li>🔗 <b>从端口拖拽到另一端口</b>：创建连线（DOM端口事件穿透复用Canvas逻辑）</li>
            <li>🖱️ <b>双击节点</b>：触发双击事件（控制台输出）</li>
            <li>🖱️ <b>右键点击</b>：打开右键菜单（节点菜单/空白菜单）</li>
            <li>🖱️ <b>右键拖拽</b>：平移画布（移动超过4px开始平移，平移后不弹菜单）</li>
            <li>🎨 <b>选中单个节点后点击状态按钮</b>：切换节点状态（idle/running/success/error）</li>
            <li>🖱️ <b>左键空白拖拽</b>：框选</li>
            <li>🟦 <b>选中≥2节点显示蓝色多选框</b>：拖拽蓝色框区域可整体移动</li>
            <li>🟩 <b>Ctrl+G 保存分组</b>：显示绿色保存分组框，可拖拽/删除</li>
            <li>🖱️ <b>中键/右键/空格+左键拖拽</b>：平移画布</li>
            <li>🔍 <b>滚轮</b>：缩放视图（以鼠标位置为中心）</li>
            <li>⌫ <b>Delete/Backspace</b>：删除选中节点或连线</li>
            <li>⎋ <b>Esc</b>：取消选择/连线</li>
            <li>🔄 <b>Ctrl+A</b>：全选</li>
            <li>📂 <b>加载蓝图文件</b>：支持v1旧格式和v2新格式自动识别</li>
          </ul>
          <button @click="showHint = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { BlueprintScene, BlueprintNode } from '../engine/blueprint';
import type { GraphPointerEvent } from '../engine/graphbase/input/events';
import BlueprintDomOverlay from '../engine/blueprint/dom/BlueprintDomOverlay.vue';
import BlueprintContextMenu from '../engine/blueprint/dom/BlueprintContextMenu.vue';
import { DeleteSelectionCommand } from '../engine/blueprint/commands/DeleteSelectionCommand';
import type { BlueprintData } from '../engine/blueprint';
import testData from '../../samples/blueprint_test_data.json';
import legacyDemoData from '../../samples/legacy_demo.blueprint.json';

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const scene = ref<BlueprintScene | null>(null);
const fps = ref(60);
const zoom = ref(1);
const showHint = ref(true);
const selectedNodeCount = ref(0);

let frameCount = 0;
let lastFpsTime = performance.now();
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

const nodeCount = computed(() => {
  if (!scene.value) return 0;
  return (scene.value as any)._nodeMap?.size ?? 0;
});

const edgeCount = computed(() => {
  if (!scene.value) return 0;
  return (scene.value as any)._connectionMap?.size ?? 0;
});

const canSaveSelection = computed(() => {
  return selectedNodeCount.value >= 2;
});

const selectedNodeForStatus = computed(() => {
  if (!scene.value) return null;
  const sel = scene.value.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
  return sel.length === 1 ? sel[0] : null;
});

function setSelectedNodeStatus(status: 'idle' | 'running' | 'success' | 'error') {
  const node = selectedNodeForStatus.value;
  if (!node) return;
  (node.data as any).status = status;
  scene.value!.requestRedraw();
  console.log(`节点 ${node.id} 状态设为: ${status}`);
}

function onNodeDblClick(nodeId: string, event: MouseEvent) {
  console.log('[DOM事件] 双击节点:', nodeId, event);
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

function onNodeContextMenu(nodeId: string, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  openCtxMenu(event.clientX, event.clientY, nodeId);
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

function onNodeCopy(nodeId: string) {
  if (!scene.value) return;
  const s = scene.value;
  const node = s.getBlueprintNode(nodeId);
  if (node) {
    s.copySelection([node]);
  }
}

function onNodeDelete(nodeId: string) {
  if (!scene.value) return;
  const s = scene.value;
  s.executeCommand(new DeleteSelectionCommand(s as any, [nodeId], []));
  s.selection.clearSelection();
  s.updateAllConnectionEndpoints();
  s.requestRedraw();
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
  }
}
function onCtxSelectAll() {
  closeCtxMenu();
  if (!scene.value) return;
  const s = scene.value;
  s.selection.setSelection(s.getAllBlueprintNodes().map(n => n.id));
  s.requestRedraw();
}

function saveSelection() {
  if (!scene.value) return;
  const s = scene.value;
  const selectedNodes = s.selection.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
  if (selectedNodes.length >= 2) {
    const defaultLabel = `分组 ${s.getSavedSelectionFrames().length + 1}`;
    s.saveSelectionFrame(selectedNodes.map(n => n.id), defaultLabel);
    s.requestRedraw();
  }
}

function updateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps.value = frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }
  if (scene.value) {
    zoom.value = scene.value.camera.zoom;
  }
  rafId = requestAnimationFrame(updateFps);
}

function handleResize() {
  if (!containerRef.value || !canvasRef.value || !scene.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  scene.value.resize(rect.width, rect.height);
  scene.value.onResize(rect.width, rect.height);
}

function resetView() {
  if (!scene.value) return;
  scene.value.setViewport({ zoom: 1, panX: 0, panY: 0 });
  scene.value.onViewportChanged();
}

function fitToContent() {
  if (!scene.value) return;
  scene.value.fitToContent(100);
  scene.value.onViewportChanged();
}

function zoomIn() {
  if (!scene.value) return;
  scene.value.setZoom(scene.value.camera.zoom * 1.2);
  scene.value.onViewportChanged();
}

function zoomOut() {
  if (!scene.value) return;
  scene.value.setZoom(scene.value.camera.zoom / 1.2);
  scene.value.onViewportChanged();
}

function clearAll() {
  if (!scene.value) return;
  const s = scene.value;
  s.loadBlueprint({ viewport: { zoom: 1, panX: 0, panY: 0 }, nodes: [], edges: [] });
  s.selection.clearSelection();
  s.requestRedraw();
}

function reloadData() {
  if (!scene.value) return;
  clearAll();
  scene.value.loadBlueprint(testData as BlueprintData);
  scene.value.fitToContent(100);
  scene.value.onViewportChanged();
}

function loadLegacyDemo() {
  if (!scene.value) return;
  clearAll();
  scene.value.loadBlueprint(legacyDemoData as any);
  scene.value.fitToContent(80);
  scene.value.onViewportChanged();
  const nodeCount = (scene.value as any)._nodeMap?.size ?? 0;
  const edgeCount = (scene.value as any)._connectionMap?.size ?? 0;
  const frameCount = (scene.value as any)._savedSelectionFrames?.size ?? 0;
  console.log(`演示项目加载成功: ${nodeCount}个节点, ${edgeCount}条连线, ${frameCount}个分组`);
}

function loadFile() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function handleFileLoad(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !scene.value) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);
      clearAll();
      scene.value!.loadBlueprint(data);
      scene.value!.fitToContent(100);
      scene.value!.onViewportChanged();
      console.log('蓝图加载成功，节点数:', (scene.value as any)._nodeMap?.size, '连线数:', (scene.value as any)._connectionMap?.size);
    } catch (err) {
      console.error('蓝图加载失败:', err);
      alert('加载失败: ' + (err as Error).message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function saveLegacy() {
  if (!scene.value) return;
  const data = scene.value.serializeLegacy();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'main.blueprint.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log('已保存为v1格式');
}

let ctxOutsidePointerDown: ((e: PointerEvent) => void) | null = null;
let ctxCaptureKeyDown: ((e: KeyboardEvent) => void) | null = null;
let unsubToolContextMenu: (() => void) | null = null;

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return;

  const s = new BlueprintScene(canvasRef.value);
  scene.value = s;
  (window as any).__scene = s;
  (window as any).__canvas = canvasRef.value;

  handleResize();
  s.loadBlueprint(testData as BlueprintData);
  s.fitToContent(100);
  s.start();

  s.on.on('viewport-change', () => {
    zoom.value = s.camera.zoom;
    s.onViewportChanged();
  });

  s.selection.on.on('select', () => {
    selectedNodeCount.value = s.selection.getSelection().filter(n => n instanceof BlueprintNode).length;
  });
  s.selection.on.on('deselect', () => {
    selectedNodeCount.value = s.selection.getSelection().filter(n => n instanceof BlueprintNode).length;
  });

  const handleToolContextMenu = (e: unknown) => onToolContextMenu(e as GraphPointerEvent);
  unsubToolContextMenu = s.tools.on.on('context-menu', handleToolContextMenu);

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(containerRef.value);

  window.addEventListener('resize', handleResize);
  rafId = requestAnimationFrame(updateFps);

  ctxOutsidePointerDown = (e: PointerEvent) => {
    if (!ctxMenu.visible) return;
    const target = e.target as HTMLElement;
    if (target.closest('.bp-ctx-menu')) return;
    closeCtxMenu();
  };
  window.addEventListener('pointerdown', ctxOutsidePointerDown, true);

  ctxCaptureKeyDown = (e: KeyboardEvent) => {
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
      }
      return;
    }
  };
  window.addEventListener('keydown', ctxCaptureKeyDown, true);
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('resize', handleResize);
  if (ctxOutsidePointerDown) window.removeEventListener('pointerdown', ctxOutsidePointerDown, true);
  if (ctxCaptureKeyDown) window.removeEventListener('keydown', ctxCaptureKeyDown, true);
  if (unsubToolContextMenu) unsubToolContextMenu();
  if (scene.value) {
    scene.value.dispose();
  }
});
</script>

<style scoped>
.blueprint-test-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #15181c;
  color: #edf2f4;
  font-family: system-ui, -apple-system, sans-serif;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #1a1f25;
  border-bottom: 1px solid rgba(31, 157, 132, 0.2);
  flex-shrink: 0;
  z-index: 10;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: #1f9d84;
}

.stats {
  font-size: 12px;
  color: #aeb8bd;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right button {
  padding: 6px 12px;
  background: rgba(31, 157, 132, 0.1);
  color: #edf2f4;
  border: 1px solid rgba(31, 157, 132, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.toolbar-right button:hover {
  background: rgba(31, 157, 132, 0.25);
  border-color: #1f9d84;
}

.toolbar-right .divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

.toolbar-right button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-info {
  font-size: 12px;
  color: #aeb8bd;
  min-width: 50px;
  text-align: right;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-container canvas {
  display: block;
  cursor: default;
}

.hint-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(21, 24, 28, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.hint-content {
  background: #1a1f25;
  border: 1px solid rgba(31, 157, 132, 0.3);
  border-radius: 12px;
  padding: 24px 32px;
  max-width: 420px;
}

.hint-content h3 {
  margin: 0 0 16px 0;
  color: #1f9d84;
  font-size: 18px;
}

.hint-content ul {
  margin: 0 0 20px 0;
  padding: 0;
  list-style: none;
}

.hint-content li {
  padding: 6px 0;
  font-size: 13px;
  color: #aeb8bd;
}

.hint-content button {
  width: 100%;
  padding: 10px;
  background: #1f9d84;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s;
}

.hint-content button:hover {
  background: #2dd4bf;
}
</style>
