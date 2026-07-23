<template>
  <div class="blueprint-test-page">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">GraphBase 蓝图引擎测试</span>
        <span class="stats">FPS: {{ fps }} | Nodes: {{ nodeCount }} | Edges: {{ edgeCount }}</span>
      </div>
      <div class="toolbar-right">
        <button @click="resetView">重置视图</button>
        <button @click="fitToContent">适应内容</button>
        <button @click="zoomIn">放大</button>
        <button @click="zoomOut">缩小</button>
        <button @click="clearAll">清空</button>
        <button @click="reloadData">重新加载测试数据</button>
        <span class="zoom-info">{{ Math.round(zoom * 100) }}%</span>
      </div>
    </div>
    <div class="canvas-container" ref="containerRef">
      <canvas ref="canvasRef"></canvas>
      <div class="hint-overlay" v-if="showHint">
        <div class="hint-content">
          <h3>操作提示</h3>
          <ul>
            <li>🖱️ <b>左键拖拽节点</b>：移动节点</li>
            <li>🔗 <b>从端口拖拽</b>：创建连线</li>
            <li>🖱️ <b>左键空白拖拽</b>：框选</li>
            <li>🖱️ <b>中键/空格+左键拖拽</b>：平移画布</li>
            <li>🔍 <b>Ctrl+滚轮</b>：缩放视图</li>
            <li>⌫ <b>Delete</b>：删除选中节点</li>
            <li>⎋ <b>Esc</b>：取消选择/连线</li>
          </ul>
          <button @click="showHint = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { BlueprintScene } from '../engine/blueprint';
import type { BlueprintData } from '../engine/blueprint';
import testData from '../../samples/blueprint_test_data.json';

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const scene = ref<BlueprintScene | null>(null);
const fps = ref(60);
const zoom = ref(1);
const showHint = ref(true);

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
  const dpr = window.devicePixelRatio || 1;
  canvasRef.value.width = rect.width * dpr;
  canvasRef.value.height = rect.height * dpr;
  canvasRef.value.style.width = rect.width + 'px';
  canvasRef.value.style.height = rect.height + 'px';
  scene.value.resize(rect.width, rect.height);
}

function resetView() {
  if (!scene.value) return;
  scene.value.setViewport({ zoom: 1, panX: 0, panY: 0 });
}

function fitToContent() {
  if (!scene.value) return;
  scene.value.fitToContent(100);
}

function zoomIn() {
  if (!scene.value) return;
  scene.value.setZoom(scene.value.camera.zoom * 1.2);
}

function zoomOut() {
  if (!scene.value) return;
  scene.value.setZoom(scene.value.camera.zoom / 1.2);
}

function clearAll() {
  if (!scene.value) return;
  scene.value.clearAllNodes();
  (scene.value as any)._nodeMap.clear();
  (scene.value as any)._connectionMap.clear();
  const gridBg = (scene.value as any)._gridBg;
  scene.value.addChild(gridBg);
}

function reloadData() {
  if (!scene.value) return;
  clearAll();
  scene.value.loadBlueprint(testData as BlueprintData);
  scene.value.fitToContent(100);
}

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return;

  const s = new BlueprintScene(canvasRef.value);
  scene.value = s;

  handleResize();
  s.loadBlueprint(testData as BlueprintData);
  s.fitToContent(100);
  s.start();

  s.on.on('viewport-change', () => {
    zoom.value = s.camera.zoom;
  });

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(containerRef.value);

  window.addEventListener('resize', handleResize);
  rafId = requestAnimationFrame(updateFps);
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('resize', handleResize);
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
  background: #0f172a;
  color: #e2e8f0;
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
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
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
  color: #94a3b8;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right button {
  padding: 6px 12px;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.toolbar-right button:hover {
  background: #475569;
  border-color: #1f9d84;
}

.zoom-info {
  font-size: 12px;
  color: #94a3b8;
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
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.hint-content {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 24px 32px;
  max-width: 400px;
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
  color: #cbd5e1;
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
