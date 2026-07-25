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
            :chat-state="chatState"
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
            @node-chat-submit="onBusinessChatSubmit"
            @node-chat-close="onBusinessChatClose"
            @node-chat-update-draft="onBusinessChatUpdateDraft"
            @node-chat-update-params="onBusinessChatUpdateParams"
            @node-chat-update-selected-refs="onBusinessChatUpdateSelectedRefs"
            @node-chat-remove-param-ref="onBusinessChatRemoveParamRef"
            @node-chat-stop="onBusinessChatStop"
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
import { MEDIA_TYPE_COLORS } from '../types';
import type { LegacyResourceData } from '../types';
import { NodeComponentResolver, type NodeChatState } from './NodeComponentResolver';
import { UpdateNodeTextCommand } from '../commands/UpdateNodeTextCommand';
import type { WorkflowNodeChatSubmitPayload } from '../../../aiworkflow/types';

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
  (e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void;
  (e: 'node-chat-close', nodeId: string): void;
  (e: 'node-chat-update-draft', payload: { nodeId: string; draft: string }): void;
  (e: 'node-chat-update-params', payload: { nodeId: string; params: Record<string, any> }): void;
  (e: 'node-chat-update-selected-refs', payload: { nodeId: string; selectedRefs: any[] }): void;
  (e: 'node-chat-remove-param-ref', payload: { nodeId: string; refItem: any }): void;
  (e: 'node-chat-stop', nodeId: string): void;
}>();

const props = defineProps<{
  scene: any;
  showDebug?: boolean;
  chatState?: NodeChatState | null;
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

function onBusinessChatSubmit(payload: WorkflowNodeChatSubmitPayload) {
  emit('node-chat-submit', payload);
}

function onBusinessChatClose(nodeId: string) {
  emit('node-chat-close', nodeId);
}

function onBusinessChatUpdateDraft(payload: { nodeId: string; draft: string }) {
  emit('node-chat-update-draft', payload);
}

function onBusinessChatUpdateParams(payload: { nodeId: string; params: Record<string, any> }) {
  emit('node-chat-update-params', payload);
}

function onBusinessChatUpdateSelectedRefs(payload: { nodeId: string; selectedRefs: any[] }) {
  emit('node-chat-update-selected-refs', payload);
}

function onBusinessChatRemoveParamRef(payload: { nodeId: string; refItem: any }) {
  emit('node-chat-remove-param-ref', payload);
}

function onBusinessChatStop(nodeId: string) {
  emit('node-chat-stop', nodeId);
}

const viewportSize = ref({ width: 800, height: 600 });
const cameraState = ref({ x: 0, y: 0, zoom: 1 });
const domNodeRenders = ref<DomNodeRenderData[]>([]);

let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
const prevDomMap = new Map<string, BlueprintNode>();
const lastKnownText = new Map<string, string>();

const overlayStyle = computed(() => ({
  position: 'absolute' as const,
  left: '0',
  top: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none' as const,
  zIndex: 10,
  overflow: 'visible' as const,
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
    overflow: 'visible' as const,
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
