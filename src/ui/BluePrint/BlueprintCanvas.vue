<template>
  <div
    ref="wrapEl"
    class="bp-wrap"
    @pointerdown="onWrapPointerDown"
    @wheel="onWheel"
    @dblclick="onDblClick"
    @contextmenu.prevent="onContextMenu"
  >
    <canvas ref="canvasEl" class="bp-grid-canvas" />
    <div v-if="boxSel" class="bp-boxsel" :style="boxSelStyle" />
    <slot
      :worldToScreen="worldToScreen"
      :screenToWorld="screenToWorld"
      :zoom="viewportZoom"
      :panPx="viewportPanPx"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

export type BlueprintViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

const props = withDefaults(
  defineProps<{
    viewport?: BlueprintViewport;
  }>(),
  {
    viewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
  }
);

const emit = defineEmits<{
  (e: "update:viewport", v: BlueprintViewport): void;
  (
    e: "canvas-contextmenu",
    payload: { clientX: number; clientY: number; worldX: number; worldY: number }
  ): void;
  (
    e: "canvas-dblclick",
    payload: { clientX: number; clientY: number; worldX: number; worldY: number }
  ): void;
  (
    e: "box-select",
    payload: { worldRect: { x0: number; y0: number; x1: number; y1: number } }
  ): void;
}>();

const wrapEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const viewportZoom = computed(() => {
  const z = Number(props.viewport?.zoom ?? 1);
  return Number.isFinite(z) ? clamp(z, 0.2, 6) : 1;
});

const viewportPanPx = computed(() => ({
  x: Number(props.viewport?.panX ?? 0) || 0,
  y: Number(props.viewport?.panY ?? 0) || 0,
}));

const wrapRect = () => wrapEl.value?.getBoundingClientRect() ?? null;
const screenCenter = () => {
  const r = wrapRect();
  return r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
};

const worldToScreen = (p: { x: number; y: number }) => {
  const c = screenCenter();
  const z = viewportZoom.value;
  return {
    x: c.x + viewportPanPx.value.x + p.x * z,
    y: c.y + viewportPanPx.value.y + p.y * z,
  };
};

const screenToWorld = (p: { x: number; y: number }) => {
  const c = screenCenter();
  const z = viewportZoom.value;
  return {
    x: (p.x - c.x - viewportPanPx.value.x) / z,
    y: (p.y - c.y - viewportPanPx.value.y) / z,
  };
};

let raf = 0;
const GRID_DPR = 1;
const requestDraw = () => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    drawGrid();
  });
};

const resizeCanvasToWrap = () => {
  const canvas = canvasEl.value;
  const wrap = wrapEl.value;
  if (!canvas || !wrap) return;
  const dpr = GRID_DPR;
  const r = wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  const nextW = Math.max(1, Math.floor(w * dpr));
  const nextH = Math.max(1, Math.floor(h * dpr));
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  requestDraw();
};

const drawGrid = () => {
  const canvas = canvasEl.value;
  const wrap = wrapEl.value;
  if (!canvas || !wrap) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = GRID_DPR;
  const r = wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue("--dweb-defualt") || "#1e1e1e";
  const border = style.getPropertyValue("--vscode-border") || "#3c3c3c";
  const accent = style.getPropertyValue("--vscode-border-accent") || "#3aa8b4";
  const muted = style.getPropertyValue("--vscode-fg-muted") || "#a0a0a0";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const z = viewportZoom.value;
  const stepWorld = 80;
  const stepPx = Math.max(16, stepWorld * z);
  const majorStepPx = stepPx * 5;
  const c = { x: w / 2 + viewportPanPx.value.x, y: h / 2 + viewportPanPx.value.y };

  const drawLines = (step: number, alpha: number) => {
    ctx.strokeStyle = border;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = ((c.x % step) + step) % step;
    for (let x = startX; x <= w; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    const startY = ((c.y % step) + step) % step;
    for (let y = startY; y <= h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  drawLines(stepPx, 0.25);
  drawLines(majorStepPx, 0.45);

  const origin = worldToScreen({ x: 0, y: 0 });
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(origin.x + 0.5, 0);
  ctx.lineTo(origin.x + 0.5, h);
  ctx.moveTo(0, origin.y + 0.5);
  ctx.lineTo(w, origin.y + 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = muted;
  ctx.font = "12px sans-serif";
  ctx.fillText("0,0", origin.x + 6, origin.y - 6);
};

let ro: ResizeObserver | null = null;
onMounted(() => {
  resizeCanvasToWrap();
  requestDraw();
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => resizeCanvasToWrap());
    if (wrapEl.value) ro.observe(wrapEl.value);
  }
});

watch(
  () => [props.viewport?.zoom, props.viewport?.panX, props.viewport?.panY],
  () => requestDraw()
);

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  ro?.disconnect();
  ro = null;
});

let bgDrag: null | {
  start: { x: number; y: number };
  startPan: { x: number; y: number };
} = null;

// Touch/pen panning state (single finger/stylus on blank area)
let touchDrag: null | {
  start: { x: number; y: number };
  startPan: { x: number; y: number };
  pointerId: number;
} = null;

const DRAG_THRESHOLD_PX = 4;
let suppressContextMenuOnce = false;

const boxSel = ref<null | {
  start: { x: number; y: number };
  cur: { x: number; y: number };
}>(null);

const boxSelStyle = computed(() => {
  if (!boxSel.value) return {};
  const a = boxSel.value.start;
  const b = boxSel.value.cur;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  } as Record<string, string>;
});

const toLocal = (wrap: HTMLElement, client: { x: number; y: number }) => {
  const r = wrap.getBoundingClientRect();
  return { x: client.x - r.left, y: client.y - r.top };
};

const onWrapPointerDown = (e: PointerEvent) => {
  const wrap = wrapEl.value;
  if (!wrap) return;

  const target = e.target as HTMLElement | null;
  if (target?.closest('[data-bp-ui-overlay="true"]')) return;

  // Right button: pan viewport
  if (e.button === 2) {
    e.preventDefault();
    bgDrag = {
      start: { x: e.clientX, y: e.clientY },
      startPan: { ...viewportPanPx.value },
    };
    let moved = false;
    wrap.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!bgDrag) return;
      ev.preventDefault();
      const dx = ev.clientX - bgDrag.start.x;
      const dy = ev.clientY - bgDrag.start.y;
      if (!moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) moved = true;
      const next = {
        x: bgDrag.startPan.x + dx,
        y: bgDrag.startPan.y + dy,
      };
      emit("update:viewport", { zoom: viewportZoom.value, panX: next.x, panY: next.y });
    };
    const onUp = (ev: PointerEvent) => {
      bgDrag = null;
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      try {
        wrap.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      if (moved) suppressContextMenuOnce = true;
    };
    wrap.addEventListener("pointermove", onMove, { passive: false });
    wrap.addEventListener("pointerup", onUp, { once: true });
    wrap.addEventListener("pointercancel", onUp, { once: true });
    return;
  }

  // Touch or pen: pan viewport (single finger/stylus drag on blank area)
  const isTouchOrPen = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (isTouchOrPen && e.button === 0) {
    e.preventDefault();
    touchDrag = {
      start: { x: e.clientX, y: e.clientY },
      startPan: { ...viewportPanPx.value },
      pointerId: e.pointerId,
    };
    wrap.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!touchDrag || ev.pointerId !== touchDrag.pointerId) return;
      ev.preventDefault();
      const dx = ev.clientX - touchDrag.start.x;
      const dy = ev.clientY - touchDrag.start.y;
      const next = {
        x: touchDrag.startPan.x + dx,
        y: touchDrag.startPan.y + dy,
      };
      emit("update:viewport", { zoom: viewportZoom.value, panX: next.x, panY: next.y });
    };
    const onUp = (ev: PointerEvent) => {
      if (touchDrag && ev.pointerId !== touchDrag.pointerId) return;
      touchDrag = null;
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      try {
        wrap.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
    };
    wrap.addEventListener("pointermove", onMove, { passive: false });
    wrap.addEventListener("pointerup", onUp, { once: true });
    wrap.addEventListener("pointercancel", onUp, { once: true });
    return;
  }

  // Left button: box select (mouse only)
  if (e.button === 0) {
    const start = toLocal(wrap, { x: e.clientX, y: e.clientY });
    let moved = false;
    wrap.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const cur = toLocal(wrap, { x: ev.clientX, y: ev.clientY });
      if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) >= DRAG_THRESHOLD_PX) {
        moved = true;
        boxSel.value = { start, cur };
      }
      if (boxSel.value) boxSel.value.cur = cur;
    };
    const onUp = (ev: PointerEvent) => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      try {
        wrap.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      if (boxSel.value) {
        const end = boxSel.value.cur;
        const w0 = screenToWorld({ x: boxSel.value.start.x, y: boxSel.value.start.y });
        const w1 = screenToWorld({ x: end.x, y: end.y });
        emit("box-select", { worldRect: { x0: w0.x, y0: w0.y, x1: w1.x, y1: w1.y } });
        boxSel.value = null;
      }
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp, { once: true });
    wrap.addEventListener("pointercancel", onUp, { once: true });
  }
};

const onWheel = (e: WheelEvent) => {
  const wrap = wrapEl.value;
  if (!wrap) return;
  e.preventDefault();

  const r = wrap.getBoundingClientRect();
  const p = { x: e.clientX - r.left, y: e.clientY - r.top };
  const w0 = screenToWorld(p);
  const z0 = viewportZoom.value;
  const z1 = clamp(z0 * (e.deltaY > 0 ? 0.92 : 1.08), 0.2, 6);
  if (Math.abs(z1 - z0) < 1e-6) return;
  const c = screenCenter();
  const panX1 = p.x - c.x - w0.x * z1;
  const panY1 = p.y - c.y - w0.y * z1;
  emit("update:viewport", { zoom: z1, panX: panX1, panY: panY1 });
};

const onDblClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const path = e.composedPath();
  const isOnNode = path.some((el) => {
    if (el instanceof HTMLElement) {
      return el.classList.contains('wf-node') || el.hasAttribute('data-wf-node-id');
    }
    return false;
  });
  if (isOnNode) return;
  const world = screenToWorld({ x: e.clientX, y: e.clientY });
  emit("canvas-dblclick", {
    clientX: e.clientX,
    clientY: e.clientY,
    worldX: world.x,
    worldY: world.y,
  });
};

const onContextMenu = (e: MouseEvent) => {
  // 只在节点上触发右键菜单，空白区域不触发
  const target = e.target as HTMLElement;
  const path = e.composedPath();
  const isOnNode = path.some((el) => {
    if (el instanceof HTMLElement) {
      return el.classList.contains('wf-node') || el.hasAttribute('data-wf-node-id');
    }
    return false;
  });
  if (!isOnNode) return;
  const world = screenToWorld({ x: e.clientX, y: e.clientY });
  emit("canvas-contextmenu", {
    clientX: e.clientX,
    clientY: e.clientY,
    worldX: world.x,
    worldY: world.y,
  });
};
</script>

<style scoped>
.bp-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.bp-boxsel {
  position: absolute;
  z-index: 999;
  border: 1px dashed var(--vscode-border-accent);
  background: color-mix(in srgb, var(--vscode-border-accent) 15%, transparent);
  pointer-events: none;
}

.bp-grid-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
