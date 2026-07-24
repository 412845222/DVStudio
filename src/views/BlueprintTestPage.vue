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
        <button @click="setSelectedNodeStatus('idle')" :disabled="selectedNodeCount !== 1">状态: idle</button>
        <button @click="setSelectedNodeStatus('running')" :disabled="selectedNodeCount !== 1">状态: running</button>
        <button @click="setSelectedNodeStatus('success')" :disabled="selectedNodeCount !== 1">状态: success</button>
        <button @click="setSelectedNodeStatus('error')" :disabled="selectedNodeCount !== 1">状态: error</button>
        <span class="zoom-info">{{ Math.round(zoom * 100) }}%</span>
      </div>
    </div>
    <div class="canvas-container">
      <BlueprintEditor
        ref="editorRef"
        :initial-data="currentData"
        @change="onBlueprintChange"
        @selection-change="onSelectionChange"
        @viewport-change="onViewportChange"
        @node-double-click="onNodeDblClick"
        @node-context-menu="onNodeContextMenu"
      >
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
      </BlueprintEditor>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import BlueprintEditor from '../engine/blueprint/BlueprintEditor.vue';
import type { LegacyBlueprintData, NodeStatus } from '../engine/blueprint';
import testData from '../../samples/blueprint_test_data.json';
import legacyDemoData from '../../samples/legacy_demo.blueprint.json';

const editorRef = ref<InstanceType<typeof BlueprintEditor> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const fps = ref(60);
const zoom = ref(1);
const showHint = ref(true);
const selectedNodeCount = ref(0);
const currentData = ref<LegacyBlueprintData | undefined>(undefined);

let frameCount = 0;
let lastFpsTime = performance.now();
let rafId: number | null = null;

const nodeCount = computed(() => {
  return editorRef.value?.getNodeCount() ?? 0;
});

const edgeCount = computed(() => {
  return editorRef.value?.getEdgeCount() ?? 0;
});

const canSaveSelection = computed(() => {
  return selectedNodeCount.value >= 2;
});

function onBlueprintChange(data: LegacyBlueprintData) {
  currentData.value = data;
}

function onSelectionChange(nodeIds: string[]) {
  selectedNodeCount.value = nodeIds.length;
}

function onViewportChange(newZoom: number, _panX: number, _panY: number) {
  zoom.value = newZoom;
}

function onNodeDblClick(nodeId: string, event: MouseEvent) {
  console.log('[DOM事件] 双击节点:', nodeId, event);
}

function onNodeContextMenu(nodeId: string, event: MouseEvent) {
  console.log('[DOM事件] 右键节点:', nodeId, event);
}

function setSelectedNodeStatus(status: NodeStatus) {
  if (selectedNodeCount.value !== 1 || !editorRef.value) return;
  const selectedIds = editorRef.value.getSelectedNodeIds();
  if (selectedIds.length === 1) {
    editorRef.value.setNodeStatus(selectedIds[0], status);
    console.log(`节点 ${selectedIds[0]} 状态设为: ${status}`);
  }
}

function saveSelection() {
  if (editorRef.value) {
    editorRef.value.saveSelectionFrame();
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
  rafId = requestAnimationFrame(updateFps);
}

function resetView() {
  editorRef.value?.resetView();
}

function fitToContent() {
  editorRef.value?.fitToView();
}

function zoomIn() {
  editorRef.value?.zoomIn();
}

function zoomOut() {
  editorRef.value?.zoomOut();
}

function clearAll() {
  editorRef.value?.clear();
}

function reloadData() {
  currentData.value = testData as unknown as LegacyBlueprintData;
  setTimeout(() => {
    editorRef.value?.fitToView();
  }, 50);
}

function loadLegacyDemo() {
  currentData.value = legacyDemoData as unknown as LegacyBlueprintData;
  setTimeout(() => {
    editorRef.value?.fitToView();
    console.log(`演示项目加载成功: ${editorRef.value?.getNodeCount()}个节点, ${editorRef.value?.getEdgeCount()}条连线`);
  }, 50);
}

function loadFile() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function handleFileLoad(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);
      currentData.value = data;
      setTimeout(() => {
        editorRef.value?.fitToView();
        console.log('蓝图加载成功，节点数:', editorRef.value?.getNodeCount(), '连线数:', editorRef.value?.getEdgeCount());
      }, 50);
    } catch (err) {
      console.error('蓝图加载失败:', err);
      alert('加载失败: ' + (err as Error).message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function saveLegacy() {
  if (!editorRef.value) return;
  const data = editorRef.value.saveBlueprint();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'main.blueprint.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log('已保存为v1格式');
}

onMounted(() => {
  currentData.value = testData as unknown as LegacyBlueprintData;
  rafId = requestAnimationFrame(updateFps);
  window.addEventListener('keydown', onTestPageKeyDown, true);
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  window.removeEventListener('keydown', onTestPageKeyDown, true);
});

function onTestPageKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const tag = (target?.tagName || '').toLowerCase();
  const isEditable = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable === true;
  if (isEditable) return;

  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (ctrl && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    editorRef.value?.undo();
    return;
  }
  if ((ctrl && key === 'z' && e.shiftKey) || (ctrl && key === 'y')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    editorRef.value?.redo();
    return;
  }
  if (ctrl && key === 'a') {
    e.preventDefault();
    e.stopImmediatePropagation();
    editorRef.value?.selectAll();
    return;
  }
  if (ctrl && key === 'c') {
    if (selectedNodeCount.value > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      editorRef.value?.copySelection();
    }
    return;
  }
  if (ctrl && key === 'v') {
    e.preventDefault();
    e.stopImmediatePropagation();
    editorRef.value?.paste();
    return;
  }
  if ((key === 'delete' || key === 'backspace') && !ctrl) {
    if (selectedNodeCount.value > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      editorRef.value?.deleteSelection();
    }
    return;
  }
}
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
