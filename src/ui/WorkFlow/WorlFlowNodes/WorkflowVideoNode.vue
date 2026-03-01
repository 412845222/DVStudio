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
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-media">
        <div
          v-if="resourceUrl"
          class="wf-media-preview"
          @contextmenu.stop.prevent="onPreviewContextMenu"
        >
          <video
            ref="videoEl"
            class="wf-media-video"
            playsinline
            preload="metadata"
            :poster="props.posterUrl || undefined"
          />
        </div>
        <div v-else class="wf-media-empty">
          <div class="wf-media-hint">未上传视频资源</div>
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
          accept="video/*"
          @change="onFileChange"
        />
      </div>
    </template>

    <template #footer>
      <div class="wf-media-footer" @pointerdown.stop>
        <div class="wf-video-toolbar">
          <div class="wf-video-row">
            <VideoController
              class="wf-video-controller"
              :disabled="!resourceUrl || !durationDisplay"
              :playing="playing"
              :duration="durationDisplay"
              :currentTime="seekValue"
              :volume="volume"
              :loop="loopEnabled"
              @toggle-play="togglePlay"
              @toggle-loop="toggleLoop"
              @seek="seekByOverviewTime"
              @update-volume="onControllerVolumeChange"
            />
            <button
              class="wf-toolbar-btn"
              type="button"
              :disabled="!resourceUrl || !screenshotEnabled"
              @click.stop="onScreenshot"
              :title="screenshotEnabled ? '截图' : '仅当视频输出连接到图片节点输入时可用'"
            >
              截图
            </button>
          </div>

          <div class="wf-video-row wf-video-row2">
            <canvas
              ref="timelineCanvas"
              class="wf-timeline-canvas"
              :class="{ disabled: !resourceUrl || !durationDisplay }"
              @pointerdown.stop="onTimelinePointerDown"
              @wheel.prevent.stop="onTimelineWheel"
            />

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
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";
import VideoController from "../../UIComponent/VideoController.vue";
import { DwebCanvasGL } from "../../../engine/webgl/canvas/DwebCanvasGL";

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
  posterUrl?: string | null;
  resourceName?: string | null;
  videoSettings?: {
    outputWidth?: number;
    outputHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  } | null;
  screenshotEnabled?: boolean;
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
  (e: "preview-contextmenu", payload: { clientX: number; clientY: number }): void;
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
  (
    e: "set-type",
    v: "base" | "text" | "text-merge" | "image" | "rotate-image" | "video" | "story" | "comfyui"
  ): void;
  (e: "upload-resource", payload: { file: File; kind: "image" | "video" }): void;
  (e: "clear-resource"): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (
    e: "update-video-settings",
    payload: {
      outputWidth?: number;
      outputHeight?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    }
  ): void;
  (
    e: "screenshot",
    payload: { dataUrl: string; width: number; height: number; time: number }
  ): void;
  (e: "media-ready"): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);

const onPreviewContextMenu = (e: MouseEvent) => {
  emit("select", props.nodeId);
  emit("preview-contextmenu", { clientX: e.clientX, clientY: e.clientY });
};

const videoEl = ref<HTMLVideoElement | null>(null);
const timelineCanvas = ref<HTMLCanvasElement | null>(null);

const playing = ref(false);
const duration = ref(0);
const seekTime = ref(0);
const timelineZoom = ref(6);
const volume = ref(1);
const loopEnabled = ref(false);
let rafId: number | null = null;

let tlCtx: CanvasRenderingContext2D | null = null;
let tlRo: ResizeObserver | null = null;
let tlPointerActive = false;

const screenshotEnabled = computed(() => Boolean(props.screenshotEnabled));

const naturalWidth = computed(() => {
  const v = props.videoSettings?.naturalWidth;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});

const naturalHeight = computed(() => {
  const v = props.videoSettings?.naturalHeight;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});

const outputWidth = computed(() => {
  const v = props.videoSettings?.outputWidth;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});

const outputHeight = computed(() => {
  const v = props.videoSettings?.outputHeight;
  return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null;
});

const outputWidthDisplay = computed(() =>
  outputWidth.value != null ? String(outputWidth.value) : ""
);
const outputHeightDisplay = computed(() =>
  outputHeight.value != null ? String(outputHeight.value) : ""
);

const durationDisplay = computed(() => Math.max(0, Number(duration.value) || 0));
const seekValue = computed(() => {
  const t = Math.max(0, Number(seekTime.value) || 0);
  return Math.min(t, durationDisplay.value || t);
});

const stopRaf = () => {
  if (rafId != null) {
    try {
      cancelAnimationFrame(rafId);
    } catch {
      // ignore
    }
  }
  rafId = null;
};

const tick = () => {
  stopRaf();
  const v = videoEl.value;
  if (!v || !playing.value) return;
  seekTime.value = v.currentTime;
  drawTimeline();
  rafId = requestAnimationFrame(tick);
};

const applyVideoSrc = async () => {
  const v = videoEl.value;
  if (!v) return;
  const src = String(props.resourceUrl ?? "").trim();
  if (!src) return;
  if (v.src !== src) v.src = src;
  try {
    v.load();
  } catch {
    // ignore
  }
  applyLoop();
};

let lastReadySrc = "";
const tryEmitMediaReady = () => {
  const v = videoEl.value;
  if (!v) return;
  const src = String(props.resourceUrl ?? "").trim();
  if (!src) return;
  if (src === lastReadySrc) return;
  // HAVE_CURRENT_DATA (2) means the first frame is available for rendering.
  if ((v.readyState || 0) >= 2) {
    lastReadySrc = src;
    emit("media-ready");
  }
};

const ensureMetadata = async () => {
  const v = videoEl.value;
  if (!v) return;
  // If metadata is already available (possible when src switches fast), sync immediately.
  if (
    v.readyState >= 1 &&
    Number.isFinite(Number(v.duration)) &&
    (v.videoWidth || 0) > 0 &&
    (v.videoHeight || 0) > 0
  ) {
    onLoadedMetadata();
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener("loadedmetadata", onMeta);
      clearTimeout(tid);
      resolve();
    };
    const onMeta = () => {
      finish();
    };
    const tid = setTimeout(() => finish(), 5000);
    v.addEventListener("loadedmetadata", onMeta);
  });
  onLoadedMetadata();
};

const onLoadedMetadata = () => {
  const v = videoEl.value;
  if (!v) return;
  duration.value = Math.max(0, Number(v.duration) || 0);
  const w = Math.max(1, Math.floor(v.videoWidth || 1));
  const h = Math.max(1, Math.floor(v.videoHeight || 1));

  // Avoid emitting redundant settings updates (can cause large update storms on project load).
  const nextOutputW = outputWidth.value ?? w;
  const nextOutputH = outputHeight.value ?? h;
  const prev = props.videoSettings ?? null;
  const sameNatural =
    Number(prev?.naturalWidth) === w && Number(prev?.naturalHeight) === h;
  const sameOutput =
    Number(prev?.outputWidth) === nextOutputW &&
    Number(prev?.outputHeight) === nextOutputH;
  if (!sameNatural || !sameOutput) {
    emit("update-video-settings", {
      naturalWidth: w,
      naturalHeight: h,
      outputWidth: nextOutputW,
      outputHeight: nextOutputH,
    });
  }
  seekTime.value = Math.min(seekValue.value, duration.value || seekValue.value);
  drawTimeline();
};

let srcWatchRunId = 0;

const togglePlay = async () => {
  const v = videoEl.value;
  if (!v) return;
  if (!playing.value) {
    try {
      // default enable sound
      v.muted = false;
      const vv = Number(volume.value);
      v.volume = Number.isFinite(vv) ? Math.max(0, Math.min(1, vv)) : 1;
      await v.play();
      playing.value = true;
      tick();
    } catch {
      playing.value = false;
    }
    return;
  }
  try {
    v.pause();
  } catch {
    // ignore
  }
  playing.value = false;
  stopRaf();
  drawTimeline();
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const applyVolume = () => {
  const v = videoEl.value;
  if (!v) return;
  v.muted = false;
  const vv = Number(volume.value);
  v.volume = Number.isFinite(vv) ? clamp(vv, 0, 1) : 1;
};

const applyLoop = () => {
  const v = videoEl.value;
  if (!v) return;
  v.loop = Boolean(loopEnabled.value);
};

const toggleLoop = () => {
  loopEnabled.value = !loopEnabled.value;
  applyLoop();
};

const onControllerVolumeChange = (vv: number) => {
  volume.value = clamp(Number(vv) || 0, 0, 1);
  applyVolume();
};

const getTimelineWindow = () => {
  const d = durationDisplay.value;
  const z = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20);
  const windowLen = d > 0 ? d / z : 0;
  const center = clamp(seekValue.value, 0, d || 0);
  let start = center - windowLen / 2;
  let end = center + windowLen / 2;
  if (d > 0) {
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > d) {
      start -= end - d;
      end = d;
      start = Math.max(0, start);
    }
  }
  return {
    start: Math.max(0, start),
    end: Math.max(0, end),
    len: Math.max(0, end - start),
  };
};

const resizeTimelineCanvas = () => {
  const el = timelineCanvas.value;
  if (!el) return;
  const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const w = Math.max(1, Math.floor(el.clientWidth || 1));
  const h = Math.max(1, Math.floor(el.clientHeight || 1));
  el.width = Math.max(1, Math.floor(w * dpr));
  el.height = Math.max(1, Math.floor(h * dpr));
  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tlCtx = ctx;
  drawTimeline();
};

const drawTimeline = () => {
  const el = timelineCanvas.value;
  const ctx = tlCtx;
  if (!el || !ctx) return;
  const w = Math.max(1, Math.floor(el.clientWidth || 1));
  const h = Math.max(1, Math.floor(el.clientHeight || 1));
  ctx.clearRect(0, 0, w, h);

  // base rect
  const border =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-border")
      .trim() || "#2b2b2b";
  const bg =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--dweb-defualt")
      .trim() || "#111111";
  const fg =
    getComputedStyle(document.documentElement).getPropertyValue("--vscode-fg").trim() ||
    "#ffffff";
  const muted =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-fg-muted")
      .trim() || "rgba(255,255,255,0.6)";
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-border-accent")
      .trim() || "#3aa8b4";

  ctx.fillStyle = bg;
  ctx.fillRect(0.5, 0.5, w - 1, h - 1);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const d = durationDisplay.value;
  if (!d || !props.resourceUrl) {
    ctx.fillStyle = muted;
    ctx.font = "12px sans-serif";
    ctx.fillText("时间轴", 8, Math.floor(h / 2) + 4);
    return;
  }

  const { start, end, len } = getTimelineWindow();
  const t = clamp(seekValue.value, 0, d);
  const x = len > 0 ? ((t - start) / len) * w : 0;

  // pointer line
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, h);
  ctx.stroke();

  // labels
  ctx.fillStyle = fg;
  ctx.font = "11px sans-serif";
  ctx.fillText(`${start.toFixed(2)}s`, 8, 14);
  const endLabel = `${end.toFixed(2)}s`;
  const endW = ctx.measureText(endLabel).width;
  ctx.fillText(endLabel, Math.max(8, w - 8 - endW), 14);

  // zoom range + precision
  const z = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20);
  const secPerPx = len > 0 ? len / Math.max(1, w) : 0;
  const precisionLabel =
    secPerPx >= 1
      ? `${secPerPx.toFixed(2)}s/px`
      : `${Math.max(0, secPerPx * 1000).toFixed(0)}ms/px`;
  const info = `范围 ${len.toFixed(2)}s  缩放×${z}  精度 ${precisionLabel}`;
  ctx.fillStyle = muted;
  ctx.font = "11px sans-serif";
  ctx.fillText(info, 8, h - 8);
};

const seekByTimelineX = (clientX: number) => {
  const el = timelineCanvas.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  const d = durationDisplay.value;
  if (!d) return;
  const { start, len } = getTimelineWindow();
  const t = clamp(start + (x / Math.max(1, rect.width)) * len, 0, d);
  seekTime.value = t;
  const v = videoEl.value;
  if (!v) return;
  try {
    v.currentTime = t;
  } catch {
    // ignore
  }
  drawTimeline();
};

const seekByOverviewTime = (t: number) => {
  const d = durationDisplay.value;
  if (!d) return;
  const next = clamp(Number(t) || 0, 0, d);
  seekTime.value = next;
  const v = videoEl.value;
  if (!v) return;
  try {
    v.currentTime = next;
  } catch {
    // ignore
  }
  drawTimeline();
};

const onTimelinePointerDown = (e: PointerEvent) => {
  if (!props.resourceUrl || !durationDisplay.value) return;
  const el = timelineCanvas.value;
  if (!el) return;
  tlPointerActive = true;
  el.setPointerCapture(e.pointerId);
  seekByTimelineX(e.clientX);
  const onMove = (ev: PointerEvent) => {
    if (!tlPointerActive) return;
    seekByTimelineX(ev.clientX);
  };
  const onUp = () => {
    tlPointerActive = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
};

const onTimelineWheel = (e: WheelEvent) => {
  if (!props.resourceUrl || !durationDisplay.value) return;
  const delta = e.deltaY;
  const cur = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20);
  const next = clamp(cur + (delta > 0 ? -1 : 1), 1, 20);
  if (next === cur) return;
  timelineZoom.value = next;
  drawTimeline();
};

const onOutputWidthChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const w = Math.max(1, Math.floor(Number(input.value) || 0));
  if (!Number.isFinite(w) || w <= 0) return;
  emit("update-video-settings", { outputWidth: w });
};

const onOutputHeightChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const h = Math.max(1, Math.floor(Number(input.value) || 0));
  if (!Number.isFinite(h) || h <= 0) return;
  emit("update-video-settings", { outputHeight: h });
};

const coverDrawParams = (srcW: number, srcH: number, dstW: number, dstH: number) => {
  const sW = Math.max(1, srcW);
  const sH = Math.max(1, srcH);
  const dW = Math.max(1, dstW);
  const dH = Math.max(1, dstH);
  const scale = Math.max(dW / sW, dH / sH);
  const drawW = dW / scale;
  const drawH = dH / scale;
  const sx = (sW - drawW) / 2;
  const sy = (sH - drawH) / 2;
  return { sx, sy, sw: drawW, sh: drawH };
};

const onScreenshot = () => {
  const v = videoEl.value;
  if (!v) return;
  if (!screenshotEnabled.value) return;
  if (v.readyState < 2) return;
  const capture = async () => {
    const ow = outputWidth.value ?? Math.max(1, Math.floor(v.videoWidth || 1));
    const oh = outputHeight.value ?? Math.max(1, Math.floor(v.videoHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(ow));
    canvas.height = Math.max(1, Math.floor(oh));

    let gl: DwebCanvasGL | null = null;
    let tex: WebGLTexture | null = null;
    try {
      gl = new DwebCanvasGL(canvas);
      gl.setSize(canvas.width, canvas.height, 1);
      tex = gl.createTexture({ wrap: "clamp" });
      gl.updateTextureFromImage(tex, v, { wrap: "clamp" });

      const srcW = Math.max(1, Math.floor(v.videoWidth || 1));
      const srcH = Math.max(1, Math.floor(v.videoHeight || 1));
      const { sx, sy, sw, sh } = coverDrawParams(srcW, srcH, canvas.width, canvas.height);
      const u0 = sx / srcW;
      const v0 = sy / srcH;
      const u1 = (sx + sw) / srcW;
      const v1 = (sy + sh) / srcH;
      const uv = { u0, v0, u1, v1 };

      gl.setScene({
        render: (c) => {
          const target = { w: canvas.width, h: canvas.height, scale: 1 };
          c.drawLocalTexturedRectUv(
            target,
            0,
            0,
            canvas.width,
            canvas.height,
            tex!,
            1,
            0,
            uv
          );
        },
      });
      gl.requestRender();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const dataUrl = canvas.toDataURL("image/png");
      emit("screenshot", {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        time: v.currentTime || seekValue.value,
      });
    } catch {
      // ignore
    } finally {
      try {
        if (gl && tex) gl.deleteTexture(tex);
      } catch {
        // ignore
      }
      try {
        gl?.dispose();
      } catch {
        // ignore
      }
    }
  };

  // If paused and not yet on seek target, seek first then capture.
  if (!playing.value && Math.abs((v.currentTime || 0) - seekValue.value) > 1e-2) {
    const target = seekValue.value;
    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      void capture();
    };
    v.addEventListener("seeked", onSeeked);
    try {
      v.currentTime = target;
    } catch {
      v.removeEventListener("seeked", onSeeked);
    }
    return;
  }

  void capture();
};

const onUploadClick = () => {
  fileInput.value?.click();
};

const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  emit("upload-resource", { file, kind: "video" });
  input.value = "";
};

watch(
  () => props.resourceUrl,
  async () => {
    const runId = ++srcWatchRunId;
    try {
      await nextTick();
      if (runId !== srcWatchRunId) return;

      if (!props.resourceUrl) {
        playing.value = false;
        stopRaf();
        duration.value = 0;
        seekTime.value = 0;
        drawTimeline();
        lastReadySrc = "";
        return;
      }

      // Reset ready marker when src changes.
      lastReadySrc = "";
      await applyVideoSrc();
      if (runId !== srcWatchRunId) return;
      await ensureMetadata();
      if (runId !== srcWatchRunId) return;
      applyVolume();
      applyLoop();
      drawTimeline();
      // Metadata ready doesn't guarantee a visible frame; try to emit when data is available.
      tryEmitMediaReady();
    } catch (err) {
      // Never let async watcher errors bubble to global app error handler.
      // Resource might be missing / permission denied during recovery.
      console.warn("[WorkflowVideoNode] resource watcher failed", err);
    }
  },
  { immediate: true }
);

watch(
  () => volume.value,
  () => {
    applyVolume();
  }
);

onMounted(() => {
  if (videoEl.value) {
    applyLoop();
    applyVolume();
    videoEl.value.addEventListener("loadedmetadata", onLoadedMetadata);
    videoEl.value.addEventListener("loadeddata", tryEmitMediaReady);
    videoEl.value.addEventListener("canplay", tryEmitMediaReady);
    videoEl.value.addEventListener("timeupdate", () => {
      const v = videoEl.value;
      if (!v) return;
      seekTime.value = v.currentTime;
      drawTimeline();
    });
    videoEl.value.addEventListener("seeked", () => {
      drawTimeline();
    });
    videoEl.value.addEventListener("pause", () => {
      playing.value = false;
      stopRaf();
      drawTimeline();
    });
    videoEl.value.addEventListener("play", () => {
      playing.value = true;
      tick();
    });
  }
  // In case resourceUrl was already set and metadata arrived before listeners attached.
  void ensureMetadata();
  if (timelineCanvas.value) {
    resizeTimelineCanvas();
    tlRo = new ResizeObserver(() => resizeTimelineCanvas());
    tlRo.observe(timelineCanvas.value);
  }
});

onBeforeUnmount(() => {
  stopRaf();
  try {
    if (videoEl.value) {
      videoEl.value.removeEventListener("loadeddata", tryEmitMediaReady);
      videoEl.value.removeEventListener("canplay", tryEmitMediaReady);
    }
  } catch {
    // ignore
  }
  try {
    tlRo?.disconnect();
  } catch {
    // ignore
  }
  tlRo = null;
  tlCtx = null;
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

.wf-media-video {
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

.wf-media-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-video-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-video-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.wf-video-controller {
  flex: 1;
  min-width: 320px;
}

.wf-video-row2 {
  flex-wrap: wrap;
}

.wf-toolbar-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-toolbar-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-toolbar-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wf-timeline-canvas {
  flex: 1;
  min-width: 220px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
}

.wf-timeline-canvas.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wf-res {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wf-res-input {
  width: 86px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 6px;
  font-size: 12px;
}

.wf-res-x {
  font-size: 12px;
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
