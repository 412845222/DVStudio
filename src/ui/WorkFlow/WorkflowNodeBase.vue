<template>
  <div
    class="wf-node"
    :data-node-id="nodeId"
    :class="[
      { selected: selected },
      {
        'is-primary-selected': isPrimarySelectedResolved,
        'is-secondary-selected': isSecondarySelectedResolved,
        'wf-node-running': visualStatus === 'running',
        'wf-node-error': visualStatus === 'error',
      },
      { 'wf-node-chat-open': nodeChatVisibleResolved },
      `wf-node-${nodeType}`,
    ]"
    :style="style"
    @pointerdown.stop.prevent="onPointerDown"
    @click.stop="onSelect"
  >
    <div v-if="selected && isPrimarySelectedResolved" class="wf-node-toolbar" @pointerdown.stop>
      <button
        class="wf-node-btn"
        type="button"
        title="切换节点类型"
        @click.stop="onOpenNodeLibrary"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <path
            d="M4.2 11.8 11.4 4.6l1.6 1.6-7.2 7.2-2.3.7.7-2.3Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="wf-node-type-label">{{ typeLabel }}</span>
        <span class="wf-node-type-caret">▾</span>
      </button>
      <button class="wf-node-btn" type="button" title="清空节点内容" @click="emit('clear-node')">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <path
            d="M4 5h8l-.8 8.2H4.8L4 5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <path d="M3 5h10M6.2 3.2h3.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M6.2 8.2h3.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
        <span class="wf-node-btn-label">清空</span>
      </button>
      <button class="wf-node-btn" type="button" title="复制节点" @click="emit('copy')">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <rect
            x="5"
            y="5"
            width="9"
            height="9"
            rx="1"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <rect
            x="2"
            y="2"
            width="9"
            height="9"
            rx="1"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
        <span class="wf-node-btn-label">复制节点</span>
      </button>
      <button
        class="wf-node-btn"
        type="button"
        title="刷新节点"
        @click="emit('refresh')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.2-3.4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <path
            d="M10.8 1.9h3.3v3.3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="wf-node-btn-label">刷新节点</span>
      </button>
      <button class="wf-node-btn" type="button" title="删除节点" @click="emit('delete')">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <path d="M4 5h8l-1 9H5z" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path d="M3 5h10" stroke="currentColor" stroke-width="1.2" />
          <path d="M6 5V3h4v2" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <span class="wf-node-btn-label">删除节点</span>
      </button>
    </div>
    <div class="wf-node-header">
      <div class="wf-node-title">{{ alias || title }}</div>
      <div class="wf-node-type">{{ nodeType }}</div>
    </div>
    <div class="wf-node-body">
      <slot name="body">内容占位</slot>
    </div>
    <div class="wf-node-footer">
      <slot name="footer">底部占位</slot>
    </div>

    <NodeChatDialog
      v-if="nodeChatVisibleResolved"
      class="wf-node-inline-chat"
      :visible="nodeChatVisibleResolved"
      :node-id="nodeId"
      :node-type="nodeChatNodeTypeResolved"
      :draft="nodeChatDraft"
      :submitting="nodeChatSubmitting"
      :params="nodeChatParams"
      :node-width="width"
      :input-param-preview-refs="inputParamPreviewRefs"
      @update:draft="(value) => emit('node-chat-update-draft', value)"
      @update:params="(value) => emit('node-chat-update-params', value)"
      @close="emit('node-chat-close')"
      @submit="(payload) => emit('node-chat-submit', payload)"
      @remove-param-ref="(item) => emit('node-chat-remove-param-ref', item)"
    />

    <div
      class="wf-resize wf-resize-nw"
      @pointerdown.stop.prevent="onResizeStart('nw', $event)"
    />
    <div
      class="wf-resize wf-resize-ne"
      @pointerdown.stop.prevent="onResizeStart('ne', $event)"
    />
    <div
      class="wf-resize wf-resize-sw"
      @pointerdown.stop.prevent="onResizeStart('sw', $event)"
    />
    <div
      class="wf-resize wf-resize-se"
      @pointerdown.stop.prevent="onResizeStart('se', $event)"
    />

    <slot
      v-if="hasAnchorSlot"
      name="anchors"
      :inputAnchors="inputAnchors"
      :outputAnchors="outputAnchors"
      :startLink="onStartLink"
      :endLink="onEndLink"
      :isInputHover="isInputHover"
      :isOutputHover="isOutputHover"
    />
    <template v-else>
      <div class="wf-anchors wf-anchors-in" aria-label="入口锚点">
        <div
          v-for="a in inputAnchors"
          :key="a.id"
          class="wf-anchor-hit"
          :class="[anchorClass(a), { hovered: isInputHover(a.id) }]"
          :title="a.label || '入口'"
          :style="anchorStyle(a)"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="a.id"
          :data-wf-anchor-type="anchorTypeAttr(a)"
          data-wf-dir="in"
          data-anchor-direction="in"
          data-anchor-side="left"
          :data-wf-anchor-index="a.index"
          @pointerup.stop="onEndLink(a.id, a.index)"
        />
      </div>
      <div class="wf-anchors wf-anchors-out" aria-label="出口锚点">
        <div
          v-for="a in outputAnchors"
          :key="a.id"
          class="wf-anchor-hit"
          :class="[anchorClass(a), { hovered: isOutputHover(a.id) }]"
          :title="a.label || '出口'"
          :style="anchorStyle(a)"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="a.id"
          :data-wf-anchor-type="anchorTypeAttr(a)"
          data-wf-dir="out"
          data-anchor-direction="out"
          data-anchor-side="right"
          :data-wf-anchor-index="a.index"
          @pointerdown.stop.prevent="onStartLink(a.id, a.index, $event)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";
import type { WorkflowNodeChatType, WorkflowNodeChatSubmitPayload } from "../../aiworkflow/types";
import { NodeChatDialog, type InputParamPreviewRef } from "../BluePrint/node-dialog";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow" | "model3d";
};

type NormalizedAnchor = AnchorSpec & {
  index: number;
  offsetY: number;
};

const props = defineProps<{
  nodeId: string;
  title: string;
  alias?: string;
  nodeType: string;
  subtitle?: string;
  style?: Record<string, string>;
  width: number;
  height: number;
  zoom: number;
  worldX: number;
  worldY: number;
  inputs?: AnchorSpec[];
  outputs?: AnchorSpec[];
  selected?: boolean;
  isPrimarySelected?: boolean;
  isSecondarySelected?: boolean;
  visualStatus?: "idle" | "running" | "error";
  hoverInputAnchorId?: string | null;
  hoverOutputAnchorId?: string | null;
  nodeChatVisible?: boolean;
  nodeChatNodeType?: WorkflowNodeChatType | null;
  nodeChatDraft?: string;
  nodeChatSubmitting?: boolean;
  nodeChatParams?: Record<string, any>;
  inputParamPreviewRefs?: InputParamPreviewRef[];
}>();

const emit = defineEmits<{
  (e: "update:worldX", v: number): void;
  (e: "update:worldY", v: number): void;
  (e: "select", nodeId: string): void;
  (
    e: "start-link",
    payload: {
      nodeId: string;
      anchorId: string;
      anchorIndex: number;
      event: PointerEvent;
    }
  ): void;
  (
    e: "end-link",
    payload: { nodeId: string; anchorId: string; anchorIndex: number }
  ): void;
  (e: "copy"): void;
  (e: "clear-node"): void;
  (e: "refresh"): void;
  (e: "delete"): void;
  (e: "set-type", v: "base" | "text" | "text-merge" | "image" | "rotate-image" | "video" | "scene-understanding" | "scene-decompose" | "scene-layout" | "unreal-export" | "story" | "comfyui" | "model3d" | "meshy"): void;
  (e: "open-node-library"): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (e: "node-chat-update-draft", value: string): void;
  (e: "node-chat-update-params", value: Record<string, any>): void;
  (e: "node-chat-close"): void;
  (e: "node-chat-submit", payload: WorkflowNodeChatSubmitPayload): void;
  (e: "node-chat-remove-param-ref", item: InputParamPreviewRef): void;
}>();

const slots = useSlots();

const hasAnchorSlot = computed(() => !!slots.anchors);

const defaultOffsets = (idx: number, count: number) => {
  const gap = 14;
  const start = -((count - 1) * gap) / 2;
  return start + idx * gap;
};

const normalizeAnchors = (
  anchors: AnchorSpec[] | undefined,
  fallbackId: string
): NormalizedAnchor[] => {
  if (Array.isArray(anchors)) {
    if (!anchors.length) return [];
    return anchors.map((a, index) => ({
      ...a,
      index,
      offsetY:
        typeof a.offsetY === "number" ? a.offsetY : defaultOffsets(index, anchors.length),
    }));
  }
  const list: AnchorSpec[] = [{ id: fallbackId }];
  return list.map((a, index) => ({
    ...a,
    index,
    offsetY: defaultOffsets(index, list.length),
  }));
};

const inputAnchors = computed(() => normalizeAnchors(props.inputs, "in-0"));
const outputAnchors = computed(() => normalizeAnchors(props.outputs, "out-0"));

const isPrimarySelectedResolved = computed(() => {
  if (typeof props.isPrimarySelected === "boolean") return props.isPrimarySelected;
  return Boolean(props.selected);
});

const isSecondarySelectedResolved = computed(() => {
  if (typeof props.isSecondarySelected === "boolean") return props.isSecondarySelected;
  return Boolean(props.selected) && !isPrimarySelectedResolved.value;
});

const visualStatus = computed<"idle" | "running" | "error">(() => {
  const status = props.visualStatus;
  if (status === "running" || status === "error") return status;
  return "idle";
});

const nodeChatDraft = computed(() => String(props.nodeChatDraft ?? ""));
const nodeChatSubmitting = computed(() => props.nodeChatSubmitting === true);
const nodeChatParams = computed(() => props.nodeChatParams ?? {});

const nodeChatNodeTypeResolved = computed<WorkflowNodeChatType | null>(() => {
  const type = props.nodeChatNodeType ?? props.nodeType;
  if (type === "text" || type === "image" || type === "video" || type === "model3d") return type;
  return null;
});

const nodeChatVisibleResolved = computed(() => {
  return Boolean(props.nodeChatVisible && props.selected && isPrimarySelectedResolved.value && nodeChatNodeTypeResolved.value);
});

const typeLabel = computed(() => {
  if (props.nodeType === "text") return "文本";
  if (props.nodeType === "text-merge") return "文本整合";
  if (props.nodeType === "image") return "图片";
  if (props.nodeType === "rotate-image") return "旋转图片";
  if (props.nodeType === "video") return "视频";
  if (props.nodeType === "scene-understanding") return "场景理解";
  if (props.nodeType === "scene-decompose") return "场景分解";
  if (props.nodeType === "scene-layout") return "场景布局";
  if (props.nodeType === "unreal-export") return "虚幻导出";
  if (props.nodeType === "story") return "剧情";
  if (props.nodeType === "comfyui") return "ComfyUI";
  if (props.nodeType === "model3d") return "3D模型";
  if (props.nodeType === "meshy") return "Meshy模型生成";
  return "基础";
});

const onOpenNodeLibrary = () => {
  emit("open-node-library");
};

const anchorStyle = (a: AnchorSpec & { offsetY?: number }) => ({
  top: `calc(50% + ${a.offsetY ?? 0}px)`,
});

const anchorClass = (_a: AnchorSpec) => {
  return "wf-anchor-resource";
};

const anchorTypeAttr = (a: AnchorSpec) => {
  if (a.mediaType === "image") return "image";
  if (a.mediaType === "video") return "video";
  if (a.mediaType === "text") return "text";
  if (a.mediaType === "model3d") return "model3d";
  if (a.mediaType === "flow") return "flow";
  return "resource";
};

let drag: null | {
  startClient: { x: number; y: number };
  startWorld: { x: number; y: number };
} = null;

const MIN_SIZE = 80;

const onResizeStart = (corner: "nw" | "ne" | "sw" | "se", e: PointerEvent) => {
  if (e.button !== 0) return;
  emit("select", props.nodeId);
  const el = e.currentTarget as HTMLElement;
  const z = Math.max(1e-6, props.zoom);
  const start = {
    clientX: e.clientX,
    clientY: e.clientY,
    width: props.width,
    height: props.height,
    worldX: props.worldX,
    worldY: props.worldY,
  };
  el.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    const dx = (ev.clientX - start.clientX) / z;
    const dy = (ev.clientY - start.clientY) / z;
    let nextW = start.width;
    let nextH = start.height;
    let shiftX = 0;
    let shiftY = 0;

    if (corner === "nw" || corner === "sw") {
      nextW = start.width - dx;
      shiftX = dx / 2;
    } else {
      nextW = start.width + dx;
      shiftX = dx / 2;
    }
    if (corner === "nw" || corner === "ne") {
      nextH = start.height - dy;
      shiftY = dy / 2;
    } else {
      nextH = start.height + dy;
      shiftY = dy / 2;
    }

    nextW = Math.max(MIN_SIZE, nextW);
    nextH = Math.max(MIN_SIZE, nextH);

    emit("resize", {
      width: nextW,
      height: nextH,
      worldX: start.worldX + shiftX,
      worldY: start.worldY + shiftY,
    });
  };
  const onUp = (ev: PointerEvent) => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp, { once: true });
  el.addEventListener("pointercancel", onUp, { once: true });
};

const onPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return;
  emit("select", props.nodeId);
  const targetEl = e.target as HTMLElement | null;
  if (targetEl?.closest('[data-wf-node-drag-ignore="true"]')) {
    return;
  }
  const el = e.currentTarget as HTMLElement;
  const z = Math.max(1e-6, props.zoom);
  drag = {
    startClient: { x: e.clientX, y: e.clientY },
    startWorld: { x: props.worldX, y: props.worldY },
  };
  el.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    if (!drag) return;
    const dx = ev.clientX - drag.startClient.x;
    const dy = ev.clientY - drag.startClient.y;
    emit("update:worldX", drag.startWorld.x + dx / z);
    emit("update:worldY", drag.startWorld.y + dy / z);
  };
  const onUp = (ev: PointerEvent) => {
    drag = null;
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp, { once: true });
  el.addEventListener("pointercancel", onUp, { once: true });
};

const onSelect = () => {
  emit("select", props.nodeId);
};

const onStartLink = (anchorId: string, anchorIndex: number, event: PointerEvent) => {
  emit("start-link", { nodeId: props.nodeId, anchorId, anchorIndex, event });
};

const onEndLink = (anchorId: string, anchorIndex: number) => {
  emit("end-link", { nodeId: props.nodeId, anchorId, anchorIndex });
};

const isInputHover = (anchorId: string) => {
  if (!props.hoverInputAnchorId) return false;
  return props.hoverInputAnchorId === anchorId;
};

const isOutputHover = (anchorId: string) => {
  if (!props.hoverOutputAnchorId) return false;
  return props.hoverOutputAnchorId === anchorId;
};
</script>

<style>
.wf-node {
  position: absolute;
  border: 1px solid var(--wf-node-border);
  border-radius: 0;
  background: var(--wf-node-bg);
  box-shadow: var(--wf-node-shadow);
  box-sizing: border-box;
  padding: 8px 10px 10px;
  cursor: grab;
  display: flex;
  flex-direction: column;
  z-index: 1;
  overflow: visible;
}

.wf-node.selected {
  border-color: var(--wf-node-border-selected);
  box-shadow: var(--wf-node-shadow-selected);
}

.wf-node.is-primary-selected {
  z-index: 10;
}

.wf-node.wf-node-chat-open {
  z-index: 1000;
}

.wf-node-toolbar {
  position: absolute;
  top: -48px;
  left: 50%;
  width: max-content;
  max-width: min(560px, calc(100vw - 40px));
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--wf-border) 78%, transparent);
  background: color-mix(in srgb, var(--wf-surface-raised) 92%, transparent);
  border-radius: 0;
  box-shadow: 0 12px 28px color-mix(in srgb, black 32%, transparent), inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: wf-toolbar-in 160ms ease-out both;
  z-index: 90;
}

.wf-node-btn {
  min-height: 24px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--wf-text);
  border-radius: 0;
  padding: 4px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
}

.wf-node-btn:hover {
  border-color: color-mix(in srgb, var(--wf-primary) 42%, transparent);
  background: color-mix(in srgb, var(--wf-primary) 14%, transparent);
  color: var(--wf-primary);
}

.wf-node-icon {
  width: 14px;
  height: 14px;
}

.wf-node-type-menu {
  position: relative;
  display: inline-flex;
}

.wf-node-type-label {
  font-size: 12px;
}

.wf-node-btn-label {
  font-size: 12px;
}

.wf-node-type-caret {
  font-size: 11px;
  margin-left: 1px;
  color: var(--wf-text-muted);
}

.wf-node-type-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  min-width: 132px;
  border: 1px solid var(--wf-border);
  background: var(--wf-surface-raised);
  border-radius: 0;
  box-shadow: var(--aiwf-shadow-sm);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-node-type-item {
  text-align: left;
  border: 1px solid var(--wf-control-border);
  background: var(--wf-control-bg);
  color: var(--wf-text);
  border-radius: 0;
  padding: 6px 8px;
  cursor: pointer;
}

.wf-node-type-item:hover {
  border-color: var(--wf-control-border-hover);
  background: var(--wf-control-bg-hover);
}

@keyframes wf-toolbar-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.wf-node:active {
  cursor: grabbing;
}

.wf-node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.wf-node-body {
  border: 1px solid var(--wf-border-subtle);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  color: var(--wf-text-muted);
  background: var(--wf-surface-base);
  font-size: 12px;
  overflow: hidden;
}

.wf-media {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.wf-media-preview {
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--wf-border-subtle);
  background: var(--wf-surface-base);
}

.wf-media-preview img,
.wf-media-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-media-empty {
  border: 1px dashed var(--wf-border-subtle);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
  color: var(--wf-text-muted);
  background: var(--wf-surface-base);
}

.wf-media-hint {
  font-size: 12px;
}

.wf-media-sub {
  font-size: 11px;
  margin-top: 4px;
}

.wf-media-actions {
  display: flex;
  gap: 8px;
}

.wf-media-btn {
  border: 1px solid var(--wf-control-border);
  background: var(--wf-control-bg);
  color: var(--wf-text);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-media-btn:hover {
  border-color: var(--wf-control-border-hover);
  background: var(--wf-control-bg-hover);
}

.wf-media-btn.ghost {
  color: var(--wf-text-muted);
}

.wf-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.wf-resize {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: transparent;
  border: none;
  opacity: 0;
}

.wf-resize-nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}

.wf-resize-ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}

.wf-resize-sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}

.wf-resize-se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}

.wf-node-title {
  font-size: 13px;
  color: var(--wf-text);
}

.wf-node-type {
  font-size: 11px;
  color: var(--wf-text-muted);
  border: 1px solid var(--wf-border-subtle);
  border-radius: 0;
  padding: 2px 6px;
}

.wf-node-footer {
  font-size: 11px;
  color: var(--wf-text-muted);
}

.wf-node.wf-node-meshy {
  height: auto !important;
  min-height: 470px;
}

.wf-node.wf-node-meshy .wf-node-body {
  overflow: visible;
  align-items: stretch;
  justify-content: flex-start;
  flex: 0 0 auto;
  min-height: auto;
}

.wf-node.wf-node-meshy .wf-node-footer {
  overflow: visible;
}

.wf-anchors {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
}

.wf-anchors-in {
  left: 0;
}

.wf-anchors-out {
  right: 0;
}

.wf-anchor-hit {
  --wf-anchor-side-offset: 0px;
  --wf-anchor-base-x: 0px;
  --wf-anchor-hit-size: 40px;
  width: var(--wf-anchor-hit-size);
  height: var(--wf-anchor-hit-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  cursor: crosshair;
  position: absolute;
  background: transparent;
  border: 0;
  transform: translate(
      calc(var(--wf-anchor-base-x, 0px) + var(--wf-anchor-magnet-x, 0px)),
      calc(-50% + var(--wf-anchor-magnet-y, 0px))
    );
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 160ms ease,
    opacity 160ms ease;
}

.wf-anchors-in .wf-anchor-hit {
  left: 0;
  right: auto;
  --wf-anchor-base-x: calc(-50% - var(--wf-anchor-side-offset, 0px));
}

.wf-anchors-out .wf-anchor-hit {
  right: 0;
  left: auto;
  --wf-anchor-base-x: calc(50% + var(--wf-anchor-side-offset, 0px));
}

.wf-anchor-hit::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dweb-blue);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.26);
  transform: translate(-50%, -50%);
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 160ms ease,
    opacity 160ms ease;
}

.wf-anchor-hit::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.32);
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.13) 0 26%, transparent 28%),
    linear-gradient(180deg, rgba(36, 42, 48, 0.96), rgba(21, 24, 28, 0.78));
  box-shadow: 0 2px 8px rgba(237, 242, 244, 0.12);
  opacity: 0.92;
  transform: translate(-50%, -50%) scale(1);
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.wf-anchor-hit.wf-anchor-resource::before {
  background: var(--dweb-blue);
}

.wf-anchor-hit[data-magnet-phase="armed"]::after,
.wf-anchor-hit[data-magnet-phase="dragging"]::after {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.04);
  border-color: color-mix(in srgb, var(--wf-node-anchor-hover) 72%, transparent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--wf-node-anchor-hover) 18%, transparent);
}

.wf-anchor-hit[data-magnet-phase="snapped"]::after {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.11);
  border-color: color-mix(in srgb, var(--wf-node-anchor-hover) 82%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--wf-node-anchor-hover) 22%, transparent);
}

.wf-anchor-hit[data-magnet-phase="snapped"]::before,
.wf-anchor-hit[data-magnet-phase="dragging"]::before {
  transform: translate(-50%, -50%) scale(1.14);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.6),
    0 0 10px rgba(255, 255, 255, 0.25);
}

.wf-anchor-hit[data-magnet-phase="dragging"]::after {
  transform: translate(-50%, -50%) scale(1.16);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--wf-node-anchor-hover) 28%, transparent));
}

.wf-anchor-hit[data-magnet-phase="release"]::after {
  opacity: 0.72;
  transform: translate(-50%, -50%) scale(0.96);
}

.wf-anchor-hit:hover::before,
.wf-anchor-hit.hovered::before {
  transform: translate(-50%, -50%) scale(1.08);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.66),
    0 0 8px rgba(255, 255, 255, 0.22);
}

.wf-anchor-hit:hover::after,
.wf-anchor-hit.hovered::after {
  transform: translate(-50%, -50%) scale(1.06);
  border-color: color-mix(in srgb, var(--wf-node-anchor-hover) 54%, var(--wf-node-anchor-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wf-node-anchor-hover) 16%, transparent);
}
</style>
