<template>
  <div
    class="wf-node"
    :class="{ selected: selected }"
    :style="style"
    @pointerdown.stop.prevent="onPointerDown"
    @click.stop="onSelect"
  >
    <div v-if="selected" class="wf-node-toolbar" @pointerdown.stop>
      <div class="wf-node-type-menu" @pointerdown.stop>
        <button
          class="wf-node-btn"
          type="button"
          title="设置类型"
          @click.stop="toggleTypeMenu"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
            <path
              d="M3 4h10M3 8h10M3 12h10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
          <span class="wf-node-type-label">{{ typeLabel }}</span>
          <span class="wf-node-type-caret">▾</span>
        </button>
        <div v-if="typeMenuOpen" class="wf-node-type-dropdown" @pointerdown.stop>
          <button class="wf-node-type-item" type="button" @click="onSetType('base')">
            基础
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('text')">
            文本
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('text-merge')">
            文本整合
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('image')">
            图片
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('video')">
            视频
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('story')">
            剧情
          </button>
          <button class="wf-node-type-item" type="button" @click="onSetType('comfyui')">
            ComfyUI
          </button>
        </div>
      </div>
      <button class="wf-node-btn" type="button" title="复制" @click="emit('copy')">
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
      </button>
      <button
        class="wf-node-btn"
        type="button"
        title="刷新输入资源"
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
      </button>
      <button class="wf-node-btn" type="button" title="删除" @click="emit('delete')">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-node-icon">
          <path d="M4 5h8l-1 9H5z" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path d="M3 5h10" stroke="currentColor" stroke-width="1.2" />
          <path d="M6 5V3h4v2" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
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
          data-wf-dir="in"
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
          data-wf-dir="out"
          :data-wf-anchor-index="a.index"
          @pointerdown.stop.prevent="onStartLink(a.id, a.index, $event)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useSlots, watch } from "vue";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow";
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
  hoverInputAnchorId?: string | null;
  hoverOutputAnchorId?: string | null;
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
  (e: "refresh"): void;
  (e: "delete"): void;
  (e: "set-type", v: "base" | "text" | "text-merge" | "image" | "video" | "story" | "comfyui"): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
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

const typeMenuOpen = ref(false);

const typeLabel = computed(() => {
  if (props.nodeType === "text") return "文本";
  if (props.nodeType === "text-merge") return "文本整合";
  if (props.nodeType === "image") return "图片";
  if (props.nodeType === "video") return "视频";
  if (props.nodeType === "story") return "剧情";
  if (props.nodeType === "comfyui") return "ComfyUI";
  return "基础";
});

const closeTypeMenu = () => {
  typeMenuOpen.value = false;
};

const toggleTypeMenu = () => {
  typeMenuOpen.value = !typeMenuOpen.value;
  if (!typeMenuOpen.value) return;
  window.addEventListener("pointerdown", closeTypeMenu, { once: true });
};

const onSetType = (type: "base" | "text" | "text-merge" | "image" | "video" | "story" | "comfyui") => {
  emit("set-type", type);
  closeTypeMenu();
};

const anchorStyle = (a: AnchorSpec & { offsetY?: number }) => ({
  top: `calc(50% + ${a.offsetY ?? 0}px)`,
});

const anchorClass = (a: AnchorSpec) => {
  if (a.mediaType === "image") return "wf-anchor-image";
  if (a.mediaType === "video") return "wf-anchor-video";
  if (a.mediaType === "text") return "wf-anchor-text";
  if (a.mediaType === "flow") return "wf-anchor-flow";
  return "wf-anchor-resource";
};

watch(
  () => props.selected,
  (val) => {
    if (!val) closeTypeMenu();
  }
);

onBeforeUnmount(() => {
  closeTypeMenu();
});

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

<style scoped>
.wf-node {
  position: absolute;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  box-sizing: border-box;
  padding: 8px 10px 10px;
  cursor: grab;
  display: flex;
  flex-direction: column;
}

.wf-node.selected {
  border-color: var(--vscode-border-accent);
  box-shadow: var(--dweb-shadow);
}

.wf-node-toolbar {
  position: absolute;
  top: -46px;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  box-shadow: var(--vscode-shadow);
  animation: wf-toolbar-in 160ms ease-out both;
}

.wf-node-btn {
  border: none;
  background: transparent;
  color: var(--vscode-fg);
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-node-btn:hover {
  color: var(--vscode-accent);
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
  margin-left: 6px;
}

.wf-node-type-caret {
  font-size: 11px;
  margin-left: 4px;
  color: var(--vscode-fg-muted);
}

.wf-node-type-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 2;
  min-width: 120px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  box-shadow: var(--vscode-shadow);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-node-type-item {
  text-align: left;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
}

.wf-node-type-item:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

@keyframes wf-toolbar-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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
  border: 1px dashed var(--vscode-border);
  padding: 8px;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  color: var(--vscode-fg-muted);
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
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
}

.wf-media-preview img,
.wf-media-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-media-empty {
  border: 1px dashed var(--vscode-border);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
  color: var(--vscode-fg-muted);
  background: var(--dweb-defualt);
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
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-media-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-media-btn.ghost {
  color: var(--vscode-fg-muted);
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
  color: var(--vscode-fg);
}

.wf-node-type {
  font-size: 11px;
  color: var(--vscode-fg-muted);
  border: 1px solid var(--vscode-border);
  padding: 2px 6px;
}

.wf-node-footer {
  font-size: 11px;
  color: var(--vscode-fg-muted);
}

.wf-anchors {
  position: absolute;
  top: 0;
  bottom: 0;
}

.wf-anchors-in {
  left: -10px;
}

.wf-anchors-out {
  right: -10px;
}

.wf-anchor-hit {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  cursor: crosshair;
  position: absolute;
  transform: translateY(-50%);
}

.wf-anchor-hit::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--dweb-blue);
}

.wf-anchor-hit.wf-anchor-resource::before {
  background: var(--dweb-blue);
}

.wf-anchor-hit.wf-anchor-image::before {
  background: var(--dweb-purple);
}

.wf-anchor-hit.wf-anchor-video::before {
  background: var(--dweb-green-main);
}

.wf-anchor-hit.wf-anchor-text::before {
  background: var(--dweb-yellow);
}

.wf-anchor-hit.wf-anchor-flow::before {
  background: var(--dweb-orange);
}

.wf-anchor-hit:hover::before,
.wf-anchor-hit.hovered::before {
  border-color: #ffffff;
}
</style>
