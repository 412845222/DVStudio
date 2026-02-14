<template>
  <teleport to="body">
    <div
      v-if="open"
      ref="panelEl"
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
          <button
            class="wf-resource-icon-btn"
            type="button"
            :title="thumbSize === 'sm' ? '缩略图：小' : '缩略图：大'"
            @click="toggleThumbSize"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
              <path
                d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.1"
              />
              <path
                v-if="thumbSize === 'lg'"
                d="M3.4 4.4h3.2v3.2H3.4z"
                fill="currentColor"
                opacity="0.25"
              />
            </svg>
          </button>
          <button
            class="wf-resource-icon-btn"
            type="button"
            title="刷新并清理无缩略图记录"
            @click="emitRefreshMissing"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.3-3.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
              />
              <path
                d="M10.7 2.7h3v3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            class="wf-resource-icon-btn"
            type="button"
            :title="sortModeTitle"
            @click="cycleSortMode"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
              <path
                d="M4 3h8M4 6h6M4 9h4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
              />
              <path
                v-if="sortMode.endsWith('asc')"
                d="M12 13l-2-2h4z"
                fill="currentColor"
              />
              <path v-else d="M12 11l-2 2h4z" fill="currentColor" />
            </svg>
          </button>
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
        <div v-else class="wf-resource-stats">共 {{ totalCount }} 条，当前显示 {{ visibleCount }} 条</div>
        <div
          v-if="resources.length"
          ref="bodyEl"
          class="wf-resource-grid"
          :class="[thumbSize === 'lg' ? 'thumb-lg' : 'thumb-sm', { reflowing: gridReflowing }]"
        >
          <div
            v-for="r in visibleResources"
            :key="`${String(r.id)}:${layoutEpoch}`"
            class="wf-resource-tile"
            draggable="true"
            @dragstart="onTileDragStart($event, r)"
          >
            <img
              class="wf-resource-thumb"
              :src="thumbSrc(r)"
              :alt="r.name"
              loading="lazy"
              draggable="false"
              @error="onThumbError(String(r.id))"
            />

            <div class="wf-resource-overlay">
              <button
                class="wf-resource-overlay-btn"
                type="button"
                title="查看"
                @click="emit('preview', String(r.id))"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <path
                    d="M8 3c-3.2 0-5.8 2.3-7 5 1.2 2.7 3.8 5 7 5s5.8-2.3 7-5c-1.2-2.7-3.8-5-7-5z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.1"
                  />
                  <path
                    d="M8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                </svg>
              </button>
              <button
                class="wf-resource-overlay-btn danger"
                type="button"
                title="删除"
                @click="emit('remove', String(r.id))"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <path
                    d="M6 2.8h4M3.4 4.4h9.2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.1"
                  />
                  <path
                    d="M6.7 6.4v6.1M9.3 6.4v6.1"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.1"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div ref="sentinelEl" class="wf-resource-sentinel" />
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { WorkflowResource } from "../../aiworkflow/resource/types";

const props = defineProps<{
  open: boolean;
  resources: WorkflowResource[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "remove", resourceId: string): void;
  (e: "preview", resourceId: string): void;
  (e: "refresh-missing", resourceIds: string[]): void;
}>();

const minimized = ref(false);
const maximized = ref(false);
const position = ref({ x: 16, y: 16 });
const size = ref({ w: 420, h: 450 });
const isInteracting = ref(false);

type SortMode = "date-desc" | "date-asc";
const sortMode = ref<SortMode>("date-desc");
const thumbSize = ref<"sm" | "lg">("sm");
const failedThumbIds = ref<Set<string>>(new Set());
const gridReflowing = ref(false);
const layoutEpoch = ref(0);
const panelEl = ref<HTMLElement | null>(null);

const bodyEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;

const PAGE_SIZE = 80;
const loadedCount = ref(PAGE_SIZE);

const TILE_GAP = 10;
const TILE_BASE_HEIGHT_SM = 132;
const TILE_BASE_HEIGHT_LG = 192;
const MAX_FILL_STEPS = 10;
let fillRaf = 0;

const resetPaging = () => {
  loadedCount.value = PAGE_SIZE;
};

const estimateColumns = () => {
  const body = bodyEl.value;
  if (!body) return 1;
  const width = Math.max(1, Math.floor(body.clientWidth));
  const colWidth = thumbSize.value === "lg" ? TILE_BASE_HEIGHT_LG : TILE_BASE_HEIGHT_SM;
  return Math.max(1, Math.floor((width + TILE_GAP) / (colWidth + TILE_GAP)));
};

const scheduleFillVisibleCapacity = () => {
  if (fillRaf) window.cancelAnimationFrame(fillRaf);
  fillRaf = window.requestAnimationFrame(async () => {
    fillRaf = 0;
    await nextTick();
    for (let step = 0; step < MAX_FILL_STEPS; step += 1) {
      if (!props.open || minimized.value) return;
      const total = sortedResources.value.length;
      if (loadedCount.value >= total) return;
      const body = bodyEl.value;
      if (!body) return;

      const clientH = Math.max(0, Math.floor(body.clientHeight));
      const scrollH = Math.max(0, Math.floor(body.scrollHeight));
      if (clientH <= 0) return;
      if (scrollH > clientH + 2) return;

      const cols = estimateColumns();
      const chunk = Math.max(cols * 3, Math.min(PAGE_SIZE, cols * 12));
      loadedCount.value = Math.min(total, loadedCount.value + chunk);
      await nextTick();
    }
  });
};

const toggleThumbSize = () => {
  thumbSize.value = thumbSize.value === "sm" ? "lg" : "sm";
  scheduleFillVisibleCapacity();
};

const cycleSortMode = () => {
  const v = sortMode.value;
  sortMode.value = v === "date-desc" ? "date-asc" : "date-desc";
  scheduleFillVisibleCapacity();
};

const sortModeTitle = computed(() => {
  if (sortMode.value === "date-desc") return "排序：日期（新→旧）";
  return "排序：日期（旧→新）";
});

const dateKeyOf = (ts: any) => {
  const n = Number(ts);
  const d = new Date(Number.isFinite(n) ? n : Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const compareName = (a: WorkflowResource, b: WorkflowResource) => {
  const an = String(a?.name ?? "");
  const bn = String(b?.name ?? "");
  return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
};

const compareCreatedAt = (a: WorkflowResource, b: WorkflowResource) => {
  const at = Number((a as any)?.createdAt ?? 0);
  const bt = Number((b as any)?.createdAt ?? 0);
  return at - bt;
};

const sortedResources = computed(() => {
  const list = Array.isArray(props.resources) ? props.resources.slice() : [];
  if (sortMode.value === "date-desc") list.sort((a, b) => compareCreatedAt(b, a));
  if (sortMode.value === "date-asc") list.sort(compareCreatedAt);
  return list;
});

const visibleResources = computed(() => {
  const list = sortedResources.value;
  const n = Math.max(0, Math.floor(Number(loadedCount.value) || 0));
  return list.slice(0, Math.min(list.length, n));
});

const totalCount = computed(() => sortedResources.value.length);
const visibleCount = computed(() => visibleResources.value.length);

const thumbSrc = (r: WorkflowResource) => {
  if (!r) return "";
  if (r.kind === "video") {
    const poster = String((r as any).posterUrl ?? "").trim();
    return poster || "";
  }
  return String((r as any).url ?? "").trim();
};

const resourceMissingThumb = (r: WorkflowResource) => {
  const rid = String((r as any)?.id ?? "").trim();
  if (!rid) return false;
  if (failedThumbIds.value.has(rid)) return true;
  return !String(thumbSrc(r) || "").trim();
};

const emitRefreshMissing = () => {
  const ids = sortedResources.value
    .filter((r) => resourceMissingThumb(r))
    .map((r) => String((r as any)?.id ?? "").trim())
    .filter((id) => !!id);
  emit("refresh-missing", ids);
};

const onThumbError = (resourceId: string) => {
  const id = String(resourceId || "").trim();
  if (!id) return;
  const next = new Set(failedThumbIds.value);
  next.add(id);
  failedThumbIds.value = next;
};

const onTileDragStart = (event: DragEvent, r: WorkflowResource) => {
  const dt = event.dataTransfer;
  if (!dt) return;
  try {
    dt.effectAllowed = "copy";
    dt.setData(
      "application/x-dweb-resource-item",
      JSON.stringify({
        resourceId: String((r as any).id ?? ""),
        kind: String((r as any).kind ?? ""),
        name: String((r as any).name ?? ""),
        url: String((r as any).url ?? ""),
        sourcePath: String((r as any).sourcePath ?? ""),
      })
    );
    dt.setData("text/plain", String((r as any).url ?? ""));
  } catch {
    // ignore
  }
};

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
			resetPaging();
      scheduleFillVisibleCapacity();
    }
  }
);

watch(
  () => props.resources,
  () => {
    const keep = new Set(
      (props.resources ?? [])
        .map((r: any) => String(r?.id ?? "").trim())
        .filter((id) => !!id)
    );
    const next = new Set<string>();
    for (const id of failedThumbIds.value.values()) {
      if (keep.has(id)) next.add(id);
    }
    failedThumbIds.value = next;
    resetPaging();
    scheduleFillVisibleCapacity();
  }
);

let panelResizeObserver: ResizeObserver | null = null;
let lastPanelWidth = 0;
let reflowTimer = 0;

const triggerGridReflowAnimation = () => {
  layoutEpoch.value += 1;
  gridReflowing.value = true;
  if (reflowTimer) window.clearTimeout(reflowTimer);
  reflowTimer = window.setTimeout(() => {
    gridReflowing.value = false;
    reflowTimer = 0;
  }, 260);
};

onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      if (!props.open) return;
      if (minimized.value) return;
      const hit = entries.some((e) => e.isIntersecting);
      if (!hit) return;
      const total = sortedResources.value.length;
      if (loadedCount.value >= total) return;
      loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE);
    },
    { root: bodyEl.value ?? null, rootMargin: "240px" }
  );

  // observe on next tick-ish: refs may not be ready immediately
  setTimeout(() => {
    if (!io) return;
    if (sentinelEl.value) io.observe(sentinelEl.value);
  }, 0);

  if (typeof ResizeObserver !== "undefined") {
    panelResizeObserver = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      const width = Number(rect?.width || 0);
      const height = Number(rect?.height || 0);
      if (Number.isFinite(height) && height > 0) {
        scheduleFillVisibleCapacity();
      }
      if (!Number.isFinite(width) || width <= 0) return;
      if (!lastPanelWidth) {
        lastPanelWidth = width;
        return;
      }
      if (Math.abs(width - lastPanelWidth) < 2) return;
      lastPanelWidth = width;
      triggerGridReflowAnimation();
    });
    if (panelEl.value) panelResizeObserver.observe(panelEl.value);
  }
});

const toggleMinimize = () => {
  const next = !minimized.value;
  minimized.value = next;
  if (next) {
    maximized.value = false;
    dockMinimized();
    return;
  }
  resetPosition();
  scheduleFillVisibleCapacity();
};

const toggleMaximize = () => {
  const next = !maximized.value;
  maximized.value = next;
  if (next) {
    minimized.value = false;
    scheduleFillVisibleCapacity();
    return;
  }
  resetPosition();
  scheduleFillVisibleCapacity();
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
  if (fillRaf) {
    window.cancelAnimationFrame(fillRaf);
    fillRaf = 0;
  }
  if (io) {
    try {
      io.disconnect();
    } catch {
      // ignore
    }
    io = null;
  }
  if (panelResizeObserver) {
    try {
      panelResizeObserver.disconnect();
    } catch {
      // ignore
    }
    panelResizeObserver = null;
  }
  if (reflowTimer) {
    window.clearTimeout(reflowTimer);
    reflowTimer = 0;
  }
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

.wf-resource-icon-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg);
  width: 22px;
  height: 22px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-resource-icon-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-icon {
  width: 14px;
  height: 14px;
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

.wf-resource-stats {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  margin: 0 0 8px;
}

.wf-resource-grid {
  position: relative;
  width: 100%;
  column-width: var(--wf-col-w, 132px);
  column-gap: 10px;
}

.wf-resource-grid.thumb-sm {
  --wf-col-w: 132px;
}

.wf-resource-grid.thumb-lg {
  --wf-col-w: 192px;
}

.wf-resource-tile {
  position: relative;
  break-inside: avoid;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  border-radius: 8px;
  overflow: hidden;
  margin: 0 0 10px;
  animation: wf-resource-tile-in 180ms ease;
}

.wf-resource-grid.reflowing .wf-resource-tile {
  animation: wf-resource-reflow 220ms ease;
}

.wf-resource-thumb {
  width: 100%;
  height: auto;
  display: block;
  user-select: none;
}

.wf-resource-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  opacity: 0;
  transition: opacity 120ms ease;
  background: rgba(10, 12, 14, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;
}

.wf-resource-tile:hover .wf-resource-overlay {
  opacity: 1;
}

.wf-resource-overlay-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.92);
  color: var(--vscode-fg);
  width: 34px;
  height: 34px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.wf-resource-overlay-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-overlay-btn.danger {
  color: var(--vscode-fg-muted);
}

.wf-resource-overlay-icon {
  width: 18px;
  height: 18px;
}

.wf-resource-sentinel {
  width: 100%;
  height: 1px;
}

@keyframes wf-resource-tile-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes wf-resource-reflow {
  from {
    opacity: 0.85;
    transform: scale(0.988);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
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
