<template>
  <teleport to="body">
    <div
      v-if="open"
      class="wf-resource-panel"
      :class="{ animating: !isInteracting }"
      :style="panelStyle"
      @pointerdown.stop
    >
      <div
        class="wf-resource-header"
        @pointerdown="onHeaderPointerDown"
        @dblclick="onHeaderDoubleClick"
      >
        <div class="wf-resource-title">资源管理器</div>
        <div class="wf-resource-actions" @pointerdown.stop>
          <button class="wf-resource-btn" type="button" @click="toggleMinimize">-</button>
          <button class="wf-resource-btn" type="button" @click="toggleMaximize">
            []
          </button>
          <button class="wf-resource-btn danger" type="button" @click="emit('close')">
            x
          </button>
        </div>
      </div>
      <div v-if="!minimized" class="wf-resource-body">
        <div v-if="!resources.length" class="wf-resource-empty">暂无资源</div>
        <div v-else class="wf-resource-list">
          <div v-for="res in resources" :key="res.id" class="wf-resource-item">
            <div class="wf-resource-preview">
              <img v-if="res.kind === 'image'" :src="res.url" :alt="res.name" />
              <video v-else :src="res.url" muted loop playsinline />
            </div>
            <div class="wf-resource-info">
              <div class="wf-resource-name">{{ res.name }}</div>
              <div class="wf-resource-kind">
                {{ res.kind === "image" ? "图片" : "视频" }}
              </div>
            </div>
            <button
              class="wf-resource-delete"
              type="button"
              @click="emit('remove', res.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>
      <div
        class="wf-resize wf-resize-n"
        @pointerdown.prevent="onResizeStart('n', $event)"
      />
      <div
        class="wf-resize wf-resize-s"
        @pointerdown.prevent="onResizeStart('s', $event)"
      />
      <div
        class="wf-resize wf-resize-e"
        @pointerdown.prevent="onResizeStart('e', $event)"
      />
      <div
        class="wf-resize wf-resize-w"
        @pointerdown.prevent="onResizeStart('w', $event)"
      />
      <div
        class="wf-resize wf-resize-nw"
        @pointerdown.prevent="onResizeStart('nw', $event)"
      />
      <div
        class="wf-resize wf-resize-ne"
        @pointerdown.prevent="onResizeStart('ne', $event)"
      />
      <div
        class="wf-resize wf-resize-sw"
        @pointerdown.prevent="onResizeStart('sw', $event)"
      />
      <div
        class="wf-resize wf-resize-se"
        @pointerdown.prevent="onResizeStart('se', $event)"
      />
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { WorkflowResource } from "../../aiworkflow/resource/types";

const props = defineProps<{
  open: boolean;
  resources: WorkflowResource[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "remove", resourceId: string): void;
}>();

const minimized = ref(false);
const maximized = ref(false);
const position = ref({ x: 16, y: 16 });
const size = ref({ w: 420, h: 450 });
const isInteracting = ref(false);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;

const MINIMIZED_HEIGHT = 36;

const resetPosition = () => {
  const w = size.value.w;
  const h = size.value.h;
  const pad = 16;
  const nextX = pad;
  const nextY = clamp(window.innerHeight - h - 64, pad, window.innerHeight - h - pad);
  position.value = { x: nextX, y: nextY };
};

const dockMinimized = () => {
  const pad = 16;
  const nextX = pad;
  const nextY = clamp(
    window.innerHeight - MINIMIZED_HEIGHT - pad,
    pad,
    window.innerHeight - MINIMIZED_HEIGHT - pad
  );
  position.value = { x: nextX, y: nextY };
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      minimized.value = false;
      maximized.value = false;
      size.value = { w: 420, h: 450 };
      resetPosition();
    }
  }
);

const toggleMinimize = () => {
  minimized.value = !minimized.value;
  if (minimized.value) dockMinimized();
};

const toggleMaximize = () => {
  maximized.value = !maximized.value;
  if (maximized.value) minimized.value = false;
  if (!maximized.value) resetPosition();
};

const panelStyle = computed(() => {
  if (maximized.value) {
    return {
      left: "16px",
      top: "16px",
      width: `${window.innerWidth - 32}px`,
      height: `${window.innerHeight - 32}px`,
    };
  }
  const h = minimized.value ? MINIMIZED_HEIGHT : size.value.h;
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
    width: `${size.value.w}px`,
    height: `${h}px`,
  };
});

let drag: null | {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} = null;
let resize: null | {
  dir: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startLeft: number;
  startTop: number;
} = null;

const onHeaderPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return;
  if (maximized.value) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest("button")) return;
  isInteracting.value = true;
  drag = {
    startX: e.clientX,
    startY: e.clientY,
    originX: position.value.x,
    originY: position.value.y,
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag) return;
    const nextX = drag.originX + (ev.clientX - drag.startX);
    const nextY = drag.originY + (ev.clientY - drag.startY);
    const maxX = Math.max(16, window.innerWidth - size.value.w - 16);
    const maxY = Math.max(
      16,
      window.innerHeight - (minimized.value ? 40 : size.value.h) - 16
    );
    position.value = {
      x: clamp(nextX, 16, maxX),
      y: clamp(nextY, 16, maxY),
    };
  };
  const onUp = () => {
    drag = null;
    isInteracting.value = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("pointercancel", onUp, { once: true });
};

const onHeaderDoubleClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (target?.closest("button")) return;
  if (minimized.value) {
    minimized.value = false;
    resetPosition();
    return;
  }
  toggleMaximize();
};

onBeforeUnmount(() => {
  drag = null;
  resize = null;
});

const onResizeStart = (dir: string, e: PointerEvent) => {
  if (e.button !== 0) return;
  if (maximized.value) return;
  isInteracting.value = true;
  resize = {
    dir,
    startX: e.clientX,
    startY: e.clientY,
    startW: size.value.w,
    startH: size.value.h,
    startLeft: position.value.x,
    startTop: position.value.y,
  };
  const onMove = (ev: PointerEvent) => {
    if (!resize) return;
    const dx = ev.clientX - resize.startX;
    const dy = ev.clientY - resize.startY;
    let nextW = resize.startW;
    let nextH = resize.startH;
    let nextLeft = resize.startLeft;
    let nextTop = resize.startTop;

    if (resize.dir.includes("e")) nextW = resize.startW + dx;
    if (resize.dir.includes("s")) nextH = resize.startH + dy;
    if (resize.dir.includes("w")) {
      nextW = resize.startW - dx;
      nextLeft = resize.startLeft + dx;
    }
    if (resize.dir.includes("n")) {
      nextH = resize.startH - dy;
      nextTop = resize.startTop + dy;
    }

    nextW = Math.max(MIN_WIDTH, nextW);
    nextH = Math.max(MIN_HEIGHT, nextH);

    const maxLeft = window.innerWidth - nextW - 16;
    const maxTop = window.innerHeight - nextH - 16;
    nextLeft = clamp(nextLeft, 16, Math.max(16, maxLeft));
    nextTop = clamp(nextTop, 16, Math.max(16, maxTop));

    size.value = { w: nextW, h: nextH };
    position.value = { x: nextLeft, y: nextTop };
  };
  const onUp = () => {
    resize = null;
    isInteracting.value = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("pointercancel", onUp, { once: true });
};
</script>

<style scoped>
.wf-resource-panel {
  position: fixed;
  background: rgba(20, 24, 28, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--vscode-border);
  box-shadow: var(--vscode-shadow);
  display: flex;
  flex-direction: column;
  z-index: 2000;
}

.wf-resource-panel.animating {
  transition: left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease;
}

.wf-resource-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vscode-border);
  cursor: grab;
  user-select: none;
  background: rgba(30, 34, 38, 0.85);
}

.wf-resource-title {
  font-size: 13px;
  color: var(--vscode-fg);
}

.wf-resource-actions {
  display: flex;
  gap: 6px;
}

.wf-resource-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg);
  width: 22px;
  height: 22px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-resource-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-btn.danger {
  color: var(--vscode-fg-muted);
}

.wf-resource-body {
  padding: 10px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.wf-resource-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}

.wf-resource-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-resource-item {
  display: grid;
  grid-template-columns: 84px 1fr auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  padding: 6px;
}

.wf-resource-preview {
  width: 84px;
  height: 52px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
}

.wf-resource-preview img,
.wf-resource-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-resource-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--vscode-fg);
}

.wf-resource-name {
  font-size: 12px;
}

.wf-resource-kind {
  font-size: 11px;
  color: var(--vscode-fg-muted);
}

.wf-resource-delete {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-resource-delete:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resize {
  position: absolute;
  background: transparent;
}

.wf-resize-n,
.wf-resize-s {
  left: 6px;
  right: 6px;
  height: 6px;
}

.wf-resize-n {
  top: -3px;
  cursor: ns-resize;
}

.wf-resize-s {
  bottom: -3px;
  cursor: ns-resize;
}

.wf-resize-e,
.wf-resize-w {
  top: 6px;
  bottom: 6px;
  width: 6px;
}

.wf-resize-e {
  right: -3px;
  cursor: ew-resize;
}

.wf-resize-w {
  left: -3px;
  cursor: ew-resize;
}

.wf-resize-nw,
.wf-resize-ne,
.wf-resize-sw,
.wf-resize-se {
  width: 10px;
  height: 10px;
}

.wf-resize-nw {
  top: -5px;
  left: -5px;
  cursor: nwse-resize;
}

.wf-resize-ne {
  top: -5px;
  right: -5px;
  cursor: nesw-resize;
}

.wf-resize-sw {
  bottom: -5px;
  left: -5px;
  cursor: nesw-resize;
}

.wf-resize-se {
  bottom: -5px;
  right: -5px;
  cursor: nwse-resize;
}
</style>
