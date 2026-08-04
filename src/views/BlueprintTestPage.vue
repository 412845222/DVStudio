<template>
  <div class="blueprint-test-page">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">AI工作流蓝图编辑器测试 (Host Overlay)</span>
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
        <button @click="openTextChat">打开text对话框</button>
        <button @click="openImageChat">打开image对话框</button>
        <button @click="closeChat">关闭对话框</button>
        <span class="divider">|</span>
        <button @click="setSelectedNodeStatus('idle')" :disabled="selectedNodeCount !== 1">状态: idle</button>
        <button @click="setSelectedNodeStatus('running')" :disabled="selectedNodeCount !== 1">状态: running</button>
        <button @click="setSelectedNodeStatus('success')" :disabled="selectedNodeCount !== 1">状态: success</button>
        <button @click="setSelectedNodeStatus('error')" :disabled="selectedNodeCount !== 1">状态: error</button>
        <span class="zoom-info">{{ Math.round(zoom * 100) }}%</span>
      </div>
    </div>
    <div class="canvas-container">
      <AIWorkflowBlueprintHost
        ref="hostRef"
        :initial-data="currentData"
        :chat-state="chatState"
        @change="onBlueprintChange"
        @selection-change="onSelectionChange"
        @viewport-change="onViewportChange"
        @node-double-click="onNodeDblClick"
        @node-context-menu="onNodeContextMenu"
        @node-chat-submit="onChatSubmit"
        @node-chat-close="closeChat"
        @node-chat-update-draft="onChatUpdateDraft"
        @node-chat-update-params="onChatUpdateParams"
      >
        <input type="file" ref="fileInputRef" accept=".json" style="display: none" @change="handleFileLoad" />
        <div class="hint-overlay" v-if="showHint">
          <div class="hint-content">
            <h3>操作提示</h3>
            <ul>
              <li>🖱️ <b>双击text/image节点</b>：打开NodeChatDialog对话框（Host Overlay层渲染）</li>
              <li>🖱️ <b>左键拖拽节点</b>：移动节点（对话框跟随移动）</li>
              <li>🔍 <b>滚轮缩放/平移</b>：对话框位置跟随viewport更新</li>
              <li>⎋ <b>Esc</b>：关闭对话框</li>
              <li>🖱️ <b>点击空白处</b>：关闭对话框</li>
            </ul>
            <button @click="showHint = false">知道了</button>
          </div>
        </div>
      </AIWorkflowBlueprintHost>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue';
import AIWorkflowBlueprintHost from './AIWorkflow/components/AIWorkflowBlueprintHost.vue';
import type { LegacyBlueprintData, NodeStatus } from '../engine/blueprint';
import type { NodeChatState } from '../engine/blueprint/dom/NodeComponentResolver';
import type { WorkflowNodeChatType, WorkflowNodeChatParams, WorkflowNodeChatSubmitPayload } from '../aiworkflow/types';
import testData from '../../samples/blueprint_test_data.json';
import legacyDemoData from '../../samples/legacy_demo.blueprint.json';

const hostRef = ref<InstanceType<typeof AIWorkflowBlueprintHost> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const fps = ref(60);
const zoom = ref(1);
const showHint = ref(true);
const selectedNodeCount = ref(0);
const currentData = ref<LegacyBlueprintData>(testData as unknown as LegacyBlueprintData);

const chatState = reactive<NodeChatState>({
  visible: false,
  nodeId: null,
  nodeType: null,
  draft: '',
  submitting: false,
  params: {},
  selectedRefs: []
});

let frameCount = 0;
let lastFpsTime = performance.now();
let rafId: number | null = null;

const editorInstance = computed(() => hostRef.value?.getInstance?.() ?? null);

const nodeCount = computed(() => {
  return editorInstance.value?.getNodeCount?.() ?? 0;
});

const edgeCount = computed(() => {
  return editorInstance.value?.getEdgeCount?.() ?? 0;
});

const canSaveSelection = computed(() => {
  return selectedNodeCount.value >= 2;
});

function isNodeChatType(type: string): type is WorkflowNodeChatType {
  return ['text', 'image', 'video', 'model3d', 'blender'].includes(type);
}

function openTextChat() {
  chatState.visible = true;
  chatState.nodeId = 'node_text_1';
  chatState.nodeType = 'text';
  chatState.draft = '';
  chatState.submitting = false;
  chatState.params = {};
  chatState.selectedRefs = [];
}

function openImageChat() {
  chatState.visible = true;
  chatState.nodeId = 'node_image_1';
  chatState.nodeType = 'image';
  chatState.draft = '';
  chatState.submitting = false;
  chatState.params = {};
  chatState.selectedRefs = [];
}

function closeChat() {
  chatState.visible = false;
  chatState.nodeId = null;
  chatState.nodeType = null;
  chatState.draft = '';
  chatState.submitting = false;
}

function onChatSubmit(payload: WorkflowNodeChatSubmitPayload) {
  console.log('[Chat Submit]', payload);
  chatState.submitting = true;
  setTimeout(() => {
    chatState.submitting = false;
  }, 1500);
}

function onChatUpdateDraft(payload: { nodeId: string; draft: string }) {
  chatState.draft = payload.draft;
}

function onChatUpdateParams(payload: { nodeId: string; params: Record<string, any> }) {
  if (chatState.nodeType) {
    chatState.params = { ...chatState.params, [chatState.nodeType]: payload.params };
  }
}

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
  const ed = editorInstance.value;
  if (!ed) return;
  const scene = ed.getScene?.();
  if (!scene) return;
  const node = scene.getBlueprintNode?.(nodeId);
  if (node && isNodeChatType(node.data.type)) {
    chatState.visible = true;
    chatState.nodeId = nodeId;
    chatState.nodeType = node.data.type;
    chatState.draft = '';
    chatState.submitting = false;
    if (!chatState.params[node.data.type]) chatState.params[node.data.type] = {};
  }
}

function onNodeContextMenu(nodeId: string, event: MouseEvent) {
  console.log('[DOM事件] 右键节点:', nodeId, event);
}

function setSelectedNodeStatus(status: NodeStatus) {
  if (selectedNodeCount.value !== 1 || !editorInstance.value) return;
  const selectedIds = editorInstance.value.getSelectedNodeIds?.();
  if (selectedIds && selectedIds.length === 1) {
    editorInstance.value.setNodeStatus?.(selectedIds[0], status);
    console.log(`节点 ${selectedIds[0]} 状态设为: ${status}`);
  }
}

function saveSelection() {
  editorInstance.value?.saveSelectionFrame?.();
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
  hostRef.value?.resetView?.();
}

function fitToContent() {
  hostRef.value?.fitToView?.();
}

function zoomIn() {
  editorInstance.value?.zoomIn?.();
}

function zoomOut() {
  editorInstance.value?.zoomOut?.();
}

function clearAll() {
  editorInstance.value?.clear?.();
}

function reloadData() {
  currentData.value = testData as unknown as LegacyBlueprintData;
  setTimeout(() => {
    hostRef.value?.fitToView?.();
  }, 50);
}

function loadLegacyDemo() {
  currentData.value = legacyDemoData as unknown as LegacyBlueprintData;
  setTimeout(() => {
    hostRef.value?.fitToView?.();
    console.log(`演示项目加载成功: ${editorInstance.value?.getNodeCount?.()}个节点, ${editorInstance.value?.getEdgeCount?.()}条连线`);
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
        hostRef.value?.fitToView?.();
        console.log('蓝图加载成功，节点数:', editorInstance.value?.getNodeCount?.(), '连线数:', editorInstance.value?.getEdgeCount?.());
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
  const data = editorInstance.value?.saveBlueprint?.();
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
  rafId = requestAnimationFrame(updateFps);
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
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
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #1e2328;
  border-bottom: 1px solid #2d3339;
  flex-shrink: 0;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.stats {
  font-size: 12px;
  color: #8b949e;
}

.zoom-info {
  font-size: 12px;
  color: #8b949e;
  min-width: 50px;
  text-align: right;
}

.divider {
  width: 1px;
  height: 20px;
  background: #2d3339;
  margin: 0 4px;
}

button {
  padding: 4px 10px;
  background: #2d3339;
  color: #edf2f4;
  border: 1px solid #3d444d;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

button:hover {
  background: #3d444d;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.hint-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: auto;
}

.hint-content {
  background: #1e2328;
  border: 1px solid #3d444d;
  border-radius: 8px;
  padding: 20px 24px;
  max-width: 480px;
}

.hint-content h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.hint-content ul {
  margin: 0 0 16px;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.8;
}

.hint-content button {
  padding: 6px 16px;
}
</style>
