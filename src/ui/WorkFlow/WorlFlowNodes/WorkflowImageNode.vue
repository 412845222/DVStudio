<template>
  <WorkflowNodeBase
    :nodeId="nodeId"
    :title="title"
    :alias="alias"
    :nodeType="nodeType"
    :subtitle="subtitle"
    :style="style"
    :width="width"
    :height="height"
    :zoom="zoom"
    :worldX="worldX"
    :worldY="worldY"
    :inputs="inputs"
    :outputs="outputs"
    :selected="selected"
    :hoverInputAnchorId="hoverInputAnchorId"
    :hoverOutputAnchorId="hoverOutputAnchorId"
    @update:worldX="(v) => emit('update:worldX', v)"
    @update:worldY="(v) => emit('update:worldY', v)"
    @select="(id) => emit('select', id)"
    @start-link="(payload) => emit('start-link', payload)"
    @end-link="(payload) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-media">
        <div
          v-if="resourceUrl"
          ref="previewWrap"
          class="wf-media-preview"
          :style="previewWrapStyle"
        >
          <canvas ref="mainCanvas" class="wf-media-canvas" />

          <div v-if="cropMode" class="wf-crop-overlay" @pointerdown.stop>
            <div class="wf-crop-mask" :style="maskTopStyle" />
            <div class="wf-crop-mask" :style="maskLeftStyle" />
            <div class="wf-crop-mask" :style="maskRightStyle" />
            <div class="wf-crop-mask" :style="maskBottomStyle" />

            <div
              class="wf-crop-box"
              :style="cropBoxStyle"
              @pointerdown.stop="onCropPointerDown($event, 'move')"
            >
              <div
                class="wf-crop-handle nw"
                @pointerdown.stop="onCropPointerDown($event, 'nw')"
              />
              <div
                class="wf-crop-handle ne"
                @pointerdown.stop="onCropPointerDown($event, 'ne')"
              />
              <div
                class="wf-crop-handle sw"
                @pointerdown.stop="onCropPointerDown($event, 'sw')"
              />
              <div
                class="wf-crop-handle se"
                @pointerdown.stop="onCropPointerDown($event, 'se')"
              />
            </div>
          </div>
        </div>

        <div v-else class="wf-media-empty">
          <div class="wf-media-hint">未上传图片资源</div>
          <div class="wf-media-sub">点击按钮选择文件</div>
        </div>

        <div class="wf-media-actions" @pointerdown.stop>
          <button class="wf-media-btn" type="button" @click.stop="onUploadClick">
            {{ resourceUrl ? "更换资源" : "上传资源" }}
          </button>
          <button
            v-if="resourceUrl"
            class="wf-media-btn ghost"
            type="button"
            @click.stop="emit('clear-resource')"
          >
            清空
          </button>
        </div>

        <input
          ref="fileInput"
          class="wf-file-input"
          type="file"
          accept="image/*"
          @change="onFileChange"
        />
      </div>
    </template>

    <template #footer>
      <div class="wf-media-footer" @pointerdown.stop>
        <div class="wf-media-toolbar">
          <button
            class="wf-toolbar-btn"
            type="button"
            :disabled="!resourceUrl"
            @click.stop="toggleCropMode"
            title="裁剪"
          >
            <svg class="wf-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M7 3a1 1 0 0 1 1 1v2h9a1 1 0 0 1 1 1v9h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0v-2H9a1 1 0 0 1-1-1V8H6a1 1 0 1 1 0-2h2V4a1 1 0 0 1 1-1Zm3 5v9h9V8h-9Z"
              />
            </svg>
          </button>

          <div class="wf-res">
            <input
              class="wf-res-input"
              type="number"
              min="1"
              inputmode="numeric"
              :value="outputWidthDisplay"
              :disabled="!resourceUrl"
              @change="onOutputWidthChange"
            />
            <span class="wf-res-x">×</span>
            <input
              class="wf-res-input"
              type="number"
              min="1"
              inputmode="numeric"
              :value="outputHeightDisplay"
              :disabled="!resourceUrl"
              @change="onOutputHeightChange"
            />
          </div>
        </div>
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";
import { DwebCanvasGL } from "../../../engine/webgl/canvas/DwebCanvasGL";
import { exportWorkflowImageOutputPng } from "../../../aiworkflow/imageOutput";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
};

const props = defineProps<{
  nodeId: string;
  title: string;
  alias?: string;
  nodeType: string;
  subtitle?: string;
  style?: Record<string, string>;
  resourceUrl?: string | null;
  resourceName?: string | null;
  imageSettings?: {
    outputWidth?: number;
    outputHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    cropEnabled?: boolean;
    crop?: { x: number; y: number; width: number; height: number };
  } | null;
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
  (e: "delete"): void;
  (e: "set-type", v: "base" | "image" | "video" | "story"): void;
  (e: "upload-resource", payload: { file: File; kind: "image" | "video" }): void;
  (e: "clear-resource"): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (
    e: "update-image-settings",
    payload: {
      outputWidth?: number;
      outputHeight?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      cropEnabled?: boolean;
      crop?: { x: number; y: number; width: number; height: number };
    }
  ): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);

const previewWrap = ref<HTMLElement | null>(null);
const mainCanvas = ref<HTMLCanvasElement | null>(null);
let glMain: DwebCanvasGL | null = null;
let ro: ResizeObserver | null = null;

const wrapSize = ref({ w: 1, h: 1 });

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const outputWidth = computed(() => {
  const v = props.imageSettings?.outputWidth;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});
const outputHeight = computed(() => {
  const v = props.imageSettings?.outputHeight;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});
const outputAspect = computed(() => {
  const w = naturalWidth.value;
  const h = naturalHeight.value;
  if (!w || !h) return null;
  return Math.max(1e-6, w / h);
});

const naturalWidth = computed(() => {
  const v = props.imageSettings?.naturalWidth;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});
const naturalHeight = computed(() => {
  const v = props.imageSettings?.naturalHeight;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});

const hasAspectLock = computed(() => false);

const crop = computed(() => {
  const c = props.imageSettings?.crop;
  if (!c) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: clamp01(Number(c.x) || 0),
    y: clamp01(Number(c.y) || 0),
    width: clamp01(Number(c.width) || 1),
    height: clamp01(Number(c.height) || 1),
  };
});

const cropMode = ref(false);
const cropEnabled = computed(() => Boolean(props.imageSettings?.cropEnabled));

watch(
  () => cropEnabled.value,
  (v) => {
    cropMode.value = v;
  },
  { immediate: true }
);

const outputWidthDisplay = computed(() =>
  outputWidth.value != null ? String(outputWidth.value) : ""
);
const outputHeightDisplay = computed(() =>
  outputHeight.value != null ? String(outputHeight.value) : ""
);

const previewWrapStyle = computed(() => {
  // Lock preview canvas aspect to source image, so when node width changes
  // the canvas height follows proportionally (prevents half-render/cropping).
  if (naturalWidth.value && naturalHeight.value) {
    const a = Math.max(1e-6, naturalWidth.value / naturalHeight.value);
    return { aspectRatio: `${a}` };
  }
  return {};
});

type DisplayRect = { x: number; y: number; w: number; h: number };

const displayRect = computed<DisplayRect>(() => {
  const w = Math.max(1, wrapSize.value.w);
  const h = Math.max(1, wrapSize.value.h);
  const imgW = naturalWidth.value ?? 1;
  const imgH = naturalHeight.value ?? 1;
  const scale = Math.min(w / Math.max(1, imgW), h / Math.max(1, imgH));
  const dw = Math.max(1, imgW * scale);
  const dh = Math.max(1, imgH * scale);
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
});

const cropBoxPx = computed(() => {
  if (!cropMode.value) return null;
  const dr = displayRect.value;
  const c = crop.value;
  return {
    x: dr.x + c.x * dr.w,
    y: dr.y + c.y * dr.h,
    w: c.width * dr.w,
    h: c.height * dr.h,
  };
});

const cropBoxStyle = computed(() => {
  const b = cropBoxPx.value;
  if (!b) return { display: "none" };
  return { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` };
});

const maskTopStyle = computed(() => {
  const b = cropBoxPx.value;
  if (!b) return { display: "none" };
  return { left: "0px", top: "0px", width: "100%", height: `${Math.max(0, b.y)}px` };
});
const maskBottomStyle = computed(() => {
  const b = cropBoxPx.value;
  if (!b) return { display: "none" };
  const y = b.y + b.h;
  return {
    left: "0px",
    top: `${y}px`,
    width: "100%",
    height: `${Math.max(0, wrapSize.value.h - y)}px`,
  };
});
const maskLeftStyle = computed(() => {
  const b = cropBoxPx.value;
  if (!b) return { display: "none" };
  return {
    left: "0px",
    top: `${b.y}px`,
    width: `${Math.max(0, b.x)}px`,
    height: `${b.h}px`,
  };
});
const maskRightStyle = computed(() => {
  const b = cropBoxPx.value;
  if (!b) return { display: "none" };
  const x = b.x + b.w;
  return {
    left: `${x}px`,
    top: `${b.y}px`,
    width: `${Math.max(0, wrapSize.value.w - x)}px`,
    height: `${b.h}px`,
  };
});

const cropToUv = (c: { x: number; y: number; width: number; height: number }) => {
  const x0 = clamp01(c.x);
  const y0 = clamp01(c.y);
  const x1 = clamp01(x0 + clamp01(c.width));
  const y1 = clamp01(y0 + clamp01(c.height));
  // DwebCanvasGL UV uses top-left origin (v=0 at top).
  // So we should NOT flip v here, otherwise the image becomes vertically inverted.
  return { u0: x0, u1: x1, v0: y0, v1: y1 };
};

const requestRender = () => {
  glMain?.requestRender();
};

const ensureNaturalSizeFallback = async () => {
  if (!props.resourceUrl) return;
  if (naturalWidth.value && naturalHeight.value) return;
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1));
      const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1));
      emit("update-image-settings", { naturalWidth: w, naturalHeight: h });
      if (!outputWidth.value || !outputHeight.value) {
        emit("update-image-settings", {
          outputWidth: w,
          outputHeight: h,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        });
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = props.resourceUrl || "";
  });
};

const toggleCropMode = async () => {
  if (!props.resourceUrl) return;
  const next = !cropMode.value;
  cropMode.value = next;
  emit("update-image-settings", { cropEnabled: next });
  if (next) {
    await nextTick();
    await ensureNaturalSizeFallback();
  }
  requestRender();
};

const applyOutputQualityByWidth = async (nextW: number) => {
  await ensureNaturalSizeFallback();
  const natW = naturalWidth.value;
  const natH = naturalHeight.value;
  if (!natW || !natH) return;
  const w = Math.max(1, Math.floor(nextW));
  const h = Math.max(1, Math.round((w * natH) / Math.max(1e-6, natW)));
  emit("update-image-settings", { outputWidth: w, outputHeight: h });
};

const applyOutputQualityByHeight = async (nextH: number) => {
  await ensureNaturalSizeFallback();
  const natW = naturalWidth.value;
  const natH = naturalHeight.value;
  if (!natW || !natH) return;
  const h = Math.max(1, Math.floor(nextH));
  const w = Math.max(1, Math.round((h * natW) / Math.max(1e-6, natH)));
  emit("update-image-settings", { outputWidth: w, outputHeight: h });
};

const onOutputWidthChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const v = Math.max(1, Math.floor(Number(input.value) || 0));
  if (!v) return;
  void applyOutputQualityByWidth(v);
};

const onOutputHeightChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const v = Math.max(1, Math.floor(Number(input.value) || 0));
  if (!v) return;
  void applyOutputQualityByHeight(v);
};

type CropDragMode = "move" | "nw" | "ne" | "sw" | "se";

let drag: {
  mode: CropDragMode;
  startClientX: number;
  startClientY: number;
  startCrop: { x: number; y: number; width: number; height: number };
  startBox: { x: number; y: number; w: number; h: number };
} | null = null;

const emitCrop = (next: { x: number; y: number; width: number; height: number }) => {
  const x = clamp01(next.x);
  const y = clamp01(next.y);
  const w = Math.max(0.01, clamp01(next.width));
  const h = Math.max(0.01, clamp01(next.height));
  let nx = x;
  let ny = y;
  let nw = w;
  let nh = h;
  if (nx + nw > 1) nx = 1 - nw;
  if (ny + nh > 1) ny = 1 - nh;
  emit("update-image-settings", { crop: { x: nx, y: ny, width: nw, height: nh } });
};

const onCropPointerDown = (ev: PointerEvent, mode: CropDragMode) => {
  if (!cropBoxPx.value) return;
  const b = cropBoxPx.value;
  drag = {
    mode,
    startClientX: ev.clientX,
    startClientY: ev.clientY,
    startCrop: { ...crop.value },
    startBox: { ...b },
  };
  (ev.target as HTMLElement | null)?.setPointerCapture?.(ev.pointerId);
  const onMove = (e: PointerEvent) => {
    if (!drag || !cropBoxPx.value) return;
    const dr = displayRect.value;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    const dxN = dxPx / Math.max(1, dr.w);
    const dyN = dyPx / Math.max(1, dr.h);
    const natW = naturalWidth.value;
    const natH = naturalHeight.value;

    if (drag.mode === "move") {
      emitCrop({
        x: drag.startCrop.x + dxN,
        y: drag.startCrop.y + dyN,
        width: drag.startCrop.width,
        height: drag.startCrop.height,
      });
      requestRender();
      return;
    }

    let x0 = drag.startCrop.x;
    let y0 = drag.startCrop.y;
    let x1 = drag.startCrop.x + drag.startCrop.width;
    let y1 = drag.startCrop.y + drag.startCrop.height;
    if (drag.mode === "nw" || drag.mode === "sw") x0 += dxN;
    if (drag.mode === "ne" || drag.mode === "se") x1 += dxN;
    if (drag.mode === "nw" || drag.mode === "ne") y0 += dyN;
    if (drag.mode === "sw" || drag.mode === "se") y1 += dyN;

    x0 = clamp01(x0);
    y0 = clamp01(y0);
    x1 = clamp01(x1);
    y1 = clamp01(y1);
    let w = Math.max(0.01, x1 - x0);
    let h = Math.max(0.01, y1 - y0);

    // Free-form crop: no aspect lock. Output resolution is only quality scaling.

    emitCrop({ x: x0, y: y0, width: w, height: h });
    requestRender();
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    drag = null;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
};

const onUploadClick = () => {
  fileInput.value?.click();
};

const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  emit("upload-resource", { file, kind: "image" });
  input.value = "";
};

const initWebgl = () => {
  if (!previewWrap.value || !mainCanvas.value) return;
  if (glMain) return;
  glMain = new DwebCanvasGL(mainCanvas.value);
  glMain.setScene({
    render: (c) => {
      const src = String(props.resourceUrl ?? "").trim();
      if (!src) return;
      const tex = c.getImageTexture(src, "clamp");
      if (!tex) return;
      const W = Math.max(1, c.size.width);
      const H = Math.max(1, c.size.height);
      const target = { w: W, h: H, scale: 1 };

      // Full image UV (no vertical flip).
      const uvFull = { u0: 0, u1: 1, v0: 0, v1: 1 };

      // Rendering strategy:
      // - cropMode: contain (show full source image, centered)
      // - normal: cover (fill render area with FULL image, no black bars)
      if (cropMode.value) {
        const dr = displayRect.value;
        c.drawLocalTexturedRectUv(target, dr.x, dr.y, dr.w, dr.h, tex, 1, 0, uvFull);
        return;
      }

      // Full image cover (no real crop applied when UI is closed).
      const imgW = naturalWidth.value ?? c.getImageSize(src)?.width ?? 1;
      const imgH = naturalHeight.value ?? c.getImageSize(src)?.height ?? 1;
      const scale = Math.max(W / Math.max(1, imgW), H / Math.max(1, imgH));
      const dw = Math.max(1, imgW * scale);
      const dh = Math.max(1, imgH * scale);
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      c.drawLocalTexturedRectUv(target, dx, dy, dw, dh, tex, 1, 0, uvFull);
    },
  });

  ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (!r) return;
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    wrapSize.value = { w, h };
    glMain?.setSize(w, h);
  });
  ro.observe(previewWrap.value);

  wrapSize.value = {
    // Use layout size (exclude CSS transforms like viewport zoom scaling).
    w: Math.max(1, Math.floor(previewWrap.value.clientWidth || 1)),
    h: Math.max(1, Math.floor(previewWrap.value.clientHeight || 1)),
  };
  glMain.setSize(wrapSize.value.w, wrapSize.value.h);
};

watch(
  () => props.resourceUrl,
  async () => {
    await nextTick();
    if (!props.resourceUrl) {
      cropMode.value = false;
      return;
    }
    initWebgl();
    await ensureNaturalSizeFallback();
    try {
      await glMain?.preloadImages([{ src: props.resourceUrl, wrap: "clamp" }], {
        timeoutMs: 6000,
      });
    } catch {
      // ignore
    }
    requestRender();
  },
  { immediate: true }
);

watch(
  () => [
    cropMode.value,
    crop.value.x,
    crop.value.y,
    crop.value.width,
    crop.value.height,
    outputWidth.value,
    outputHeight.value,
  ],
  async () => {
    await nextTick();
    requestRender();
  },
  { flush: "post" }
);

defineExpose({
  /** Export the node output PNG (WebGL rendered, cropped + scaled to output resolution). */
  exportPngBlob: async () => {
    const src = String(props.resourceUrl ?? "").trim();
    if (!src) return null;
    const w = outputWidth.value;
    const h = outputHeight.value;
    if (!w || !h) return null;
    return exportWorkflowImageOutputPng({
      src,
      outputWidth: w,
      outputHeight: h,
      crop: cropEnabled.value ? crop.value : null,
    });
  },
});

onMounted(() => {
  initWebgl();
});

onBeforeUnmount(() => {
  try {
    ro?.disconnect();
  } catch {
    // ignore
  }
  ro = null;
  try {
    glMain?.dispose();
  } catch {
    // ignore
  }
  glMain = null;
});
</script>

<style scoped>
.wf-media {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  height: 100%;
  align-self: stretch;
}

.wf-media-preview {
  width: 100%;
  flex: 0 0 auto;
  height: auto;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  position: relative;
  display: block;
}

.wf-media-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.wf-crop-overlay {
  position: absolute;
  inset: 0;
  user-select: none;
}

.wf-crop-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.55);
}

.wf-crop-box {
  position: absolute;
  border: 1px solid var(--vscode-border-accent);
  box-shadow: var(--vscode-shadow);
}

.wf-crop-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--dweb-defualt);
  border: 1px solid var(--vscode-border-accent);
}

.wf-crop-handle.nw {
  left: -6px;
  top: -6px;
  cursor: nwse-resize;
}
.wf-crop-handle.ne {
  right: -6px;
  top: -6px;
  cursor: nesw-resize;
}
.wf-crop-handle.sw {
  left: -6px;
  bottom: -6px;
  cursor: nesw-resize;
}
.wf-crop-handle.se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
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
  flex: 0 0 auto;
}

.wf-media-footer {
  width: 100%;
  margin-top: 6px;
}

.wf-media-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.wf-toolbar-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wf-toolbar-btn:hover:not(:disabled) {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-icon {
  width: 16px;
  height: 16px;
}

.wf-res {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wf-res-input {
  width: 74px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 6px;
  font-size: 12px;
}

.wf-res-input:disabled {
  opacity: 0.6;
}

.wf-res-x {
  color: var(--vscode-fg-muted);
  font-size: 12px;
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
</style>
