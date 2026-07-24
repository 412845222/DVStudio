<template>
  <div
    v-if="scene"
    ref="overlayRef"
    class="bp-dom-overlay"
    :style="overlayStyle"
  >
    <div
      ref="transformLayerRef"
      class="bp-dom-transform-layer"
      :style="transformLayerStyle"
    >
      <TransitionGroup name="dnw">
        <DomNodeWrapper
          v-for="node in domNodeRenders"
          :key="node.nodeId"
          :node-id="node.nodeId"
          :node-type="node.nodeType"
          :title="node.title"
          :x="node.x"
          :y="node.y"
          :width="node.width"
          :height="node.height"
          :selected="node.selected"
          :accent-color="node.accentColor"
          :status="node.status"
          :input-port-renders="node.inputPorts"
          :output-port-renders="node.outputPorts"
          @resize-start="(corner, ev) => onResizeStart(node.nodeId, corner, ev)"
          @dblclick="(ev) => emit('node-dblclick', node.nodeId, ev)"
          @contextmenu="(ev) => emit('node-contextmenu', node.nodeId, ev)"
        >
          <WorkflowNodeWrapper
            v-if="canUseBusinessComponent(node.nodeType)"
            :node="node.node as any"
            :zoom="cameraState.zoom"
            :width="node.width"
            :height="node.height"
            :status="node.status"
            :selected="node.selected"
            :accent-color="node.accentColor"
            :legacy-resources="legacyResources"
            @edit="(id: string) => handleBusinessEdit(id)"
            @contextmenu="handleBusinessContextMenu"
            @update-text="onBusinessUpdateText"
            @node-resize="onBusinessResize"
            @start-link="onBusinessStartLink"
            @end-link="onBusinessEndLink"
            @select="onBusinessSelect"
            @copy="onBusinessCopy"
            @delete="onBusinessDelete"
            @refresh="onBusinessRefresh"
          />
        </DomNodeWrapper>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import DomNodeWrapper, { type NodeStatus } from './DomNodeWrapper.vue';
import WorkflowNodeWrapper from './WorkflowNodeWrapper.vue';
import { BlueprintNode } from '../index';
import { Rect } from '../../graphbase/core/Rect';
import { Vector2 } from '../../graphbase/core/Vector2';
import { MEDIA_TYPE_COLORS, MIN_NODE_WIDTH, MIN_NODE_HEIGHT } from '../types';
import type { ResizeCorner, LegacyResourceData } from '../types';
import { NodeComponentResolver } from './NodeComponentResolver';
import { UpdateNodeTextCommand } from '../commands/UpdateNodeTextCommand';

interface PortRenderData {
  id: string;
  label?: string;
  offsetY: number;
  mediaType: string;
}

interface DomNodeRenderData {
  nodeId: string;
  nodeType: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  accentColor: string;
  status: NodeStatus;
  inputPorts: PortRenderData[];
  outputPorts: PortRenderData[];
  node: BlueprintNode;
}

const emit = defineEmits<{
  (e: 'node-dblclick', nodeId: string, event: MouseEvent): void;
  (e: 'node-contextmenu', nodeId: string, event: MouseEvent): void;
  (e: 'node-update-text', payload: { nodeId: string; textValue: string }): void;
  (e: 'node-start-link', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void;
  (e: 'node-end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void;
  (e: 'node-select', nodeId: string): void;
  (e: 'node-copy', nodeId: string): void;
  (e: 'node-delete', nodeId: string): void;
  (e: 'node-refresh', nodeId: string): void;
}>();

const props = defineProps<{
  scene: any;
  showDebug?: boolean;
}>();

const overlayRef = ref<HTMLDivElement | null>(null);
const transformLayerRef = ref<HTMLDivElement | null>(null);

const legacyResources = computed<Record<string, LegacyResourceData>>(() => {
  if (!props.scene) return {};
  return props.scene.legacyResources || {};
});

function canUseBusinessComponent(nodeType: string): boolean {
  return NodeComponentResolver.hasComponent(nodeType);
}

function onBusinessUpdateText(payload: { nodeId: string; textValue: string }) {
  if (!props.scene) return;
  const node = prevDomMap.get(payload.nodeId);
  if (!node) return;

  const oldText = lastKnownText.get(payload.nodeId) ?? (node.data as any).textValue ?? '';
  const newText = payload.textValue;

  if (oldText === newText) return;

  lastKnownText.set(payload.nodeId, newText);

  const cmd = new UpdateNodeTextCommand(props.scene, payload.nodeId, oldText, newText);
  props.scene.executeCommand(cmd);

  emit('node-update-text', payload);
}

function onBusinessResize(payload: { nodeId: string; width: number; height: number; worldX: number; worldY: number }) {
  if (!props.scene) return;
  const node = prevDomMap.get(payload.nodeId);
  if (node) {
    node.transform.setPosition(payload.worldX, payload.worldY);
    node.updateSize(payload.width, payload.height);
    node.data.worldX = payload.worldX;
    node.data.worldY = payload.worldY;
    node.data.sizeCustomized = true;
    props.scene.updateAllConnectionEndpoints();
    props.scene.requestRedraw();
  }
}

function onBusinessStartLink(payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) {
  emit('node-start-link', payload);
}

function onBusinessEndLink(payload: { nodeId: string; anchorId: string; anchorIndex: number }) {
  emit('node-end-link', payload);
}

function handleBusinessEdit(nodeId: string) {
  emit('node-dblclick', nodeId, new MouseEvent('dblclick'));
}

function handleBusinessContextMenu(payload: { nodeId: string; x: number; y: number }) {
  emit('node-contextmenu', payload.nodeId, new MouseEvent('contextmenu', { clientX: payload.x, clientY: payload.y }));
}

function onBusinessSelect(nodeId: string) {
  emit('node-select', nodeId);
}

function onBusinessCopy(nodeId: string) {
  emit('node-copy', nodeId);
}

function onBusinessDelete(nodeId: string) {
  emit('node-delete', nodeId);
}

function onBusinessRefresh(nodeId: string) {
  emit('node-refresh', nodeId);
}

const viewportSize = ref({ width: 800, height: 600 });
const cameraState = ref({ x: 0, y: 0, zoom: 1 });
const domNodeRenders = ref<DomNodeRenderData[]>([]);

let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
const prevDomMap = new Map<string, BlueprintNode>();
const lastKnownText = new Map<string, string>();

const isResizing = ref(false);
let resizingNode: BlueprintNode | null = null;
let resizingCorner: ResizeCorner | null = null;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

function onResizeStart(nodeId: string, corner: ResizeCorner, event: PointerEvent) {
  if (!props.scene) return;
  const node = prevDomMap.get(nodeId);
  if (!node) return;

  resizingNode = node;
  resizingCorner = corner;
  resizeStartX = node.transform.position.x;
  resizeStartY = node.transform.position.y;
  resizeStartWidth = node.data.width;
  resizeStartHeight = node.data.height;
  isResizing.value = true;

  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', onResizePointerUp, { once: true });
}

function onResizePointerMove(e: PointerEvent) {
  if (!props.scene || !resizingNode || !resizingCorner || !overlayRef.value) return;

  const rect = overlayRef.value.getBoundingClientRect();
  const screenPoint = new Vector2(e.clientX - rect.left, e.clientY - rect.top);
  const mouseWorld = props.scene.camera.screenToWorld(screenPoint);

  let newWidth: number;
  let newHeight: number;
  let newX: number;
  let newY: number;

  switch (resizingCorner) {
    case 'bottom-right': {
      newX = resizeStartX;
      newY = resizeStartY;
      newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - resizeStartX);
      newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - resizeStartY);
      break;
    }
    case 'bottom-left': {
      newY = resizeStartY;
      const rightEdge = resizeStartX + resizeStartWidth;
      newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x);
      newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - resizeStartY);
      newX = rightEdge - newWidth;
      break;
    }
    case 'top-right': {
      newX = resizeStartX;
      const bottomEdge = resizeStartY + resizeStartHeight;
      newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - resizeStartX);
      newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y);
      newY = bottomEdge - newHeight;
      break;
    }
    case 'top-left': {
      const rightEdge = resizeStartX + resizeStartWidth;
      const bottomEdge = resizeStartY + resizeStartHeight;
      newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x);
      newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y);
      newX = rightEdge - newWidth;
      newY = bottomEdge - newHeight;
      break;
    }
  }

  resizingNode.transform.setPosition(newX, newY);
  resizingNode.updateSize(newWidth, newHeight);
  resizingNode.data.worldX = newX;
  resizingNode.data.worldY = newY;
  resizingNode.data.sizeCustomized = true;
  props.scene.updateAllConnectionEndpoints();
  props.scene.requestRedraw();
}

function onResizePointerUp() {
  isResizing.value = false;
  resizingNode = null;
  resizingCorner = null;
  window.removeEventListener('pointermove', onResizePointerMove);
}

const overlayStyle = computed(() => ({
  position: 'absolute' as const,
  left: '0',
  top: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none' as const,
  zIndex: 10,
  overflow: 'hidden' as const,
}));

const transformLayerStyle = computed(() => {
  const { width, height } = viewportSize.value;
  const { x, y, zoom } = cameraState.value;
  return {
    position: 'absolute' as const,
    left: '0',
    top: '0',
    width: '0',
    height: '0',
    transformOrigin: '0 0',
    transform: `translate(${width / 2}px, ${height / 2}px) scale(${zoom}) translate(${-x}px, ${-y}px)`,
    willChange: 'transform',
  };
});

function getNodeStatus(node: BlueprintNode): NodeStatus {
  const status = (node.data as any)?.status;
  if (status === 'running' || status === 'success' || status === 'error') {
    return status;
  }
  return 'idle';
}

function getNodeAccentColor(node: BlueprintNode): string {
  const type = node.nodeType;
  const mediaColors: Record<string, string> = {
    'image': '#9b59b6',
    'rotate-image': '#9b59b6',
    'video': '#27ae60',
    'text': '#f1c40f',
    'text-merge': '#f1c40f',
    'model3d': '#3498db',
    'meshy-model': '#3498db',
    'scene-understanding': '#1f9d84',
    'scene-layout': '#1f9d84',
    'scene-decompose': '#1f9d84',
    'story': '#e67e22',
    'comfyui': '#9b59b6',
    'blender': '#e67e22',
    'unreal-export': '#3498db',
  };
  return mediaColors[type] || '#1f9d84';
}

function syncCamera() {
  if (!props.scene) return;
  const cam = props.scene.camera;
  cameraState.value = {
    x: cam.position.x,
    y: cam.position.y,
    zoom: cam.zoom,
  };
  viewportSize.value = {
    width: cam.viewport.width,
    height: cam.viewport.height,
  };
}

function extractPortData(ports: any[], nodeWorldX: number, nodeWorldY: number): PortRenderData[] {
  return ports.map((p: any) => {
    const wp = p.getWorldPosition();
    return {
      id: p.id,
      label: p.spec?.label,
      offsetY: wp.y - nodeWorldY,
      mediaType: p.spec?.mediaType || 'generic',
    };
  });
}

function syncDomNodes() {
  if (!props.scene) return;
  const s = props.scene;
  const currentLegacyResources = s.legacyResources || {};
  const currentSelected: BlueprintNode[] = (s.selection?.getSelection?.() ?? [])
    .filter((n: any) => n instanceof BlueprintNode) as BlueprintNode[];

  const newRenders: DomNodeRenderData[] = [];
  const currentMap = new Map<string, BlueprintNode>();

  const isSingleSelect = currentSelected.length === 1;
  const nodesToRender: BlueprintNode[] = isSingleSelect ? [currentSelected[0]] : [];

  for (const node of nodesToRender) {
    currentMap.set(node.id, node);
    const wb = node.getWorldBounds();
    newRenders.push({
      nodeId: node.id,
      nodeType: node.nodeType,
      title: node.alias || node.title,
      x: wb.x,
      y: wb.y,
      width: wb.width,
      height: wb.height,
      selected: true,
      accentColor: getNodeAccentColor(node),
      status: getNodeStatus(node),
      inputPorts: extractPortData(node.inputPorts, wb.x, wb.y),
      outputPorts: extractPortData(node.outputPorts, wb.x, wb.y),
      node: node,
    });
    if (!lastKnownText.has(node.id)) {
      lastKnownText.set(node.id, (node.data as any).textValue ?? '');
    }
  }

  for (const [id, node] of prevDomMap) {
    if (!currentMap.has(id)) {
      node.setDomMode(false);
      lastKnownText.delete(id);
    }
  }
  for (const [id, node] of currentMap) {
    if (!prevDomMap.has(id)) {
      node.setDomMode(true);
    }
  }

  prevDomMap.clear();
  currentMap.forEach((node, id) => prevDomMap.set(id, node));
  domNodeRenders.value = newRenders;
}

function tick() {
  syncCamera();
  syncDomNodes();
  rafId = requestAnimationFrame(tick);
}

function handleResize() {
  if (!overlayRef.value || !props.scene) return;
  const rect = overlayRef.value.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    props.scene.camera.setViewport(new Rect(0, 0, rect.width, rect.height));
  }
}

onMounted(() => {
  if (props.scene) {
    handleResize();
    syncCamera();
    syncDomNodes();
  }
  rafId = requestAnimationFrame(tick);

  if (overlayRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(overlayRef.value);
  }
});

onUnmounted(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (props.scene) {
    for (const [, node] of prevDomMap) {
      node.setDomMode(false);
    }
    prevDomMap.clear();
  }
});

watch(() => props.scene, (newScene) => {
  if (newScene) {
    handleResize();
    syncCamera();
    syncDomNodes();
  }
}, { immediate: true });
</script>

<style scoped>
.bp-dom-overlay {
  contain: layout style size;
}

.bp-dom-transform-layer {
  contain: layout style;
}
</style>
