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
        <canvas
          ref="canvas"
          class="wf-rotate-canvas"
          :class="{ dragging: dragging }"
          @pointerdown.stop.prevent="onDragStart"
        />
        <div class="wf-rotate-overlay" @pointerdown.stop>
          <div class="wf-view-cube" aria-label="方向立方体">
            <div class="wf-cube-graphic">
              <button
                type="button"
                class="wf-cube-face face-back"
                title="-Z（背面）"
                @click.stop="onQuickView('-z')"
              >
                -Z
              </button>
              <button
                type="button"
                class="wf-cube-face face-left"
                title="-X"
                @click.stop="onQuickView('-x')"
              >
                -X
              </button>
              <button
                type="button"
                class="wf-cube-face face-right"
                title="+X"
                @click.stop="onQuickView('+x')"
              >
                +X
              </button>
              <button
                type="button"
                class="wf-cube-face face-top"
                title="+Y"
                @click.stop="onQuickView('+y')"
              >
                +Y
              </button>
              <button
                type="button"
                class="wf-cube-face face-bottom"
                title="-Y"
                @click.stop="onQuickView('-y')"
              >
                -Y
              </button>
              <button
                type="button"
                class="wf-cube-face face-front"
                title="+Z（正面）"
                @click.stop="onQuickView('+z')"
              >
                +Z
              </button>
            </div>
          </div>

          <button
            type="button"
            class="wf-reset-btn"
            title="复位到正面"
            @click.stop="onResetView"
          >
            复位
          </button>
        </div>
    </template>

    <template #footer>
      <div class="wf-rotate-footer" @pointerdown.stop>
        <span class="wf-rotate-hint"
          >按住并拖拽图片进行 360° 旋转查看（伪 3D 透视）。</span
        >
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow";
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
  inputUrl?: string | null;
  rotatePromptText?: string | null;
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
  (
    e: "set-type",
    v:
      | "base"
      | "text"
      | "text-merge"
      | "image"
      | "video"
      | "scene-understanding"
      | "scene-decompose"
      | "scene-layout"
      | "story"
      | "comfyui"
      | "rotate-image"
      | "unreal-export"
      | "model3d"
      | "meshy"
  ): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (
    e: "update-rotate-output",
    payload: {
      dataUrl: string;
      promptText: string;
      yaw: number;
      pitch: number;
      width: number;
      height: number;
    }
  ): void;
}>();

const PLACEHOLDER_SVG =
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b7cff" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#ff8a00" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="640" height="360" fill="url(#g)"/>
  <rect x="40" y="40" width="560" height="280" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
  <text x="320" y="178" text-anchor="middle" font-size="24" fill="#ffffff" fill-opacity="0.65" font-family="system-ui,Segoe UI,Arial">示例图片（未连接输入）</text>
  <text x="320" y="210" text-anchor="middle" font-size="14" fill="#ffffff" fill-opacity="0.45" font-family="system-ui,Segoe UI,Arial">rotate-image node preview</text>
</svg>`);

const wrap = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const inputSrc = computed(() => {
  const url = String(props.inputUrl ?? "").trim();
  return url || PLACEHOLDER_SVG;
});

let img: HTMLImageElement | null = null;
let ro: ResizeObserver | null = null;
const dragging = ref(false);

const yaw = ref(0);
const pitch = ref(0);
const MAX_PITCH = Math.PI * 0.495;

let dragState: null | {
  pointerId: number;
  lastX: number;
  lastY: number;
} = null;

let rotateAnimRaf = 0;
let outputEmitTimer: ReturnType<typeof setTimeout> | null = null;
let promptEmitTimer: ReturnType<typeof setTimeout> | null = null;
let lastOutputKey = "";
let lastPromptKey = "";
let sourceObjectUrl: string | null = null;
let imageLoadToken = 0;
let loadedImageVersion = 0;
let loadedImageKey = "";

const revokeSourceObjectUrl = () => {
  if (!sourceObjectUrl) return;
  try {
    URL.revokeObjectURL(sourceObjectUrl);
  } catch {
    // ignore
  }
  sourceObjectUrl = null;
};

const setImageElementSource = (src: string, useCrossOrigin: boolean) => {
  const next = new Image();
  if (useCrossOrigin) next.crossOrigin = "anonymous";
  next.onload = () => {
    if (img !== next) return;
    loadedImageVersion += 1;
    loadedImageKey = src;
    lastOutputKey = "";
    draw();
  };
  next.onerror = () => {
    if (img !== next) return;
    loadedImageVersion += 1;
    loadedImageKey = "";
    lastOutputKey = "";
    draw();
  };
  next.src = src;
  img = next;
};

const ensureImage = (src: string) => {
  const normalized = String(src ?? "").trim();
  if (!normalized) return;
  if (img && img.src === normalized) return;

  const token = ++imageLoadToken;
  revokeSourceObjectUrl();

  if (/^https?:\/\//i.test(normalized)) {
    fetch(normalized, { cache: "no-store", mode: "cors", credentials: "include" })
      .then((resp) => {
        if (token !== imageLoadToken) return;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.blob();
      })
      .then((blob) => {
        if (!blob || token !== imageLoadToken) return;
        sourceObjectUrl = URL.createObjectURL(blob);
        setImageElementSource(sourceObjectUrl, false);
      })
      .catch(() => {
        if (token !== imageLoadToken) return;
        // fallback: keep preview available even if CORS blocks export
        setImageElementSource(normalized, true);
      });
    return;
  }

  setImageElementSource(normalized, false);
};

const resizeCanvasToWrap = () => {
  const el = wrap.value;
  const c = canvas.value;
  if (!el || !c) return;
  const r = el.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  const scale = dpr();
  c.width = Math.max(1, Math.floor(w * scale));
  c.height = Math.max(1, Math.floor(h * scale));
  draw();
};

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const project = (p: Vec3, focal: number) => {
  const s = focal / (focal + p.z);
  return { x: p.x * s, y: p.y * s };
};

const affineFromTriangles = (
  s0: Vec2,
  s1: Vec2,
  s2: Vec2,
  d0: Vec2,
  d1: Vec2,
  d2: Vec2
) => {
  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return null;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / det;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / det;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    det;

  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / det;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / det;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    det;

  return { a, b, c, d, e, f };
};

const triangleArea = (a: Vec2, b: Vec2, c: Vec2) => {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
};

const normalizeVec = (v: Vec2) => {
  const len = Math.hypot(v.x, v.y);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

const expandTriangle = (a: Vec2, b: Vec2, c: Vec2, expandPx: number) => {
  const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  const push = (p: Vec2): Vec2 => {
    const n = normalizeVec({ x: p.x - center.x, y: p.y - center.y });
    return { x: p.x + n.x * expandPx, y: p.y + n.y * expandPx };
  };
  return [push(a), push(b), push(c)] as const;
};

const drawTexturedTriangle = (
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement,
  s0: Vec2,
  s1: Vec2,
  s2: Vec2,
  d0: Vec2,
  d1: Vec2,
  d2: Vec2,
  seamExpandPx: number
) => {
  const area = triangleArea(d0, d1, d2);
  if (Math.abs(area) < 1e-6) return;
  const m = affineFromTriangles(s0, s1, s2, d0, d1, d2);
  if (!m) return;

  const [c0, c1, c2] =
    seamExpandPx > 0 ? expandTriangle(d0, d1, d2, seamExpandPx) : ([d0, d1, d2] as const);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(im, 0, 0);
  ctx.restore();
};

const lerpVec2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const toDeg = (r: number) => Math.round((r * 180) / Math.PI);

const normalizeDeg = (deg: number) => {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const buildNanoPrompt = (yawRad: number, pitchRad: number) => {
  const yawDeg = normalizeDeg(toDeg(yawRad));
  const pitchDeg = clamp(toDeg(pitchRad), -89, 89);

  const yawHint =
    yawDeg > 0
      ? "right-side orbit"
      : yawDeg < 0
      ? "left-side orbit"
      : "front-aligned orbit";
  const pitchHint =
    pitchDeg > 0
      ? "high-angle view"
      : pitchDeg < 0
      ? "low-angle view"
      : "eye-level view";

  return [
    "Task intent: produce a camera-reframed variant for storyboard previsualization while preserving the original world identity.",
    "Use descriptive scene-level reasoning, not keyword fragments.",
    "",
    "Input roles:",
    "- Image A = canonical visual source of truth (subject identity, environment, composition logic, materials, lighting, color style).",
    "- Image B = camera orientation guide only.",
    "- Never render, copy, or blend Image B as visible content.",
    "",
    "Camera control:",
    `- Apply a virtual 3D camera orbit only: azimuth ${yawDeg}°, elevation ${pitchDeg}° (observer-space rotation).`,
    `- Shot interpretation: ${yawHint}, ${pitchHint}.`,
    "- Keep world coordinates fixed and re-render perspective from the new camera position.",
    "",
    "Step-by-step execution:",
    "1) Read Image A and lock core invariants: character identity, pose semantics, garment details, background layout, lighting direction, and material response.",
    "2) Apply the target camera orbit and perspective reprojection with physically coherent depth.",
    "3) Preserve continuity of structure, scale, and spatial relationships across all visible elements.",
    "4) If camera movement reveals unseen regions, outpaint those regions seamlessly with the same style, illumination model, and geometry logic from Image A.",
    "5) Return one coherent final frame that matches Image A's artistic intent and production quality.",
    "",
    "Semantic constraints:",
    "- Camera moves; subjects and scene stay in their canonical orientation from Image A.",
    "- Keep canvas upright with no 2D rotation, skew, or tilt artifacts.",
    "- Avoid introducing new objects, text, logos, or unrelated style changes.",
    "- Do not import structural content from Image B.",
  ].join("\n");
};

const emitRotatePromptNow = () => {
  const c = canvas.value;
  if (!c) return;
  const promptText = buildNanoPrompt(yaw.value, pitch.value);
  const yawDeg = normalizeDeg(Math.round((yaw.value * 1800) / Math.PI) / 10);
  const pitchDeg = Math.round(clamp((pitch.value * 1800) / Math.PI, -890, 890)) / 10;
  const promptKey = `${yawDeg}|${pitchDeg}|${String(inputSrc.value).slice(0, 64)}`;
  if (promptKey === lastPromptKey) return;
  lastPromptKey = promptKey;

  emit("update-rotate-output", {
    dataUrl: "",
    promptText,
    yaw: yaw.value,
    pitch: pitch.value,
    width: c.width,
    height: c.height,
  });
};

const exportCanvasDataUrlViaImageData = () => {
  const c = canvas.value;
  if (!c) return "";
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const w = c.width;
  const h = c.height;
  if (!w || !h) return "";
  try {
    const imageData = ctx.getImageData(0, 0, w, h);
    const temp = document.createElement("canvas");
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext("2d");
    if (!tctx) return "";
    tctx.putImageData(imageData, 0, 0);
    return temp.toDataURL("image/png");
  } catch {
    try {
      return c.toDataURL("image/png");
    } catch {
      return "";
    }
  }
};

const emitRotateOutputNow = () => {
  const c = canvas.value;
  if (!c) return;
  const im = img;
  if (!im || !im.complete || !im.naturalWidth || !im.naturalHeight) return;
  const promptText = buildNanoPrompt(yaw.value, pitch.value);
  const yawDeg = normalizeDeg(toDeg(yaw.value));
  const pitchDeg = clamp(toDeg(pitch.value), -89, 89);
  const outputKey = `${yawDeg}|${pitchDeg}|${loadedImageVersion}|${loadedImageKey.slice(
    0,
    96
  )}`;
  if (outputKey === lastOutputKey) return;

  const dataUrl = exportCanvasDataUrlViaImageData();
  if (!dataUrl) return;

  lastOutputKey = outputKey;
  emit("update-rotate-output", {
    dataUrl,
    promptText,
    yaw: yaw.value,
    pitch: pitch.value,
    width: c.width,
    height: c.height,
  });
};

const queueEmitRotateOutput = () => {
  if (outputEmitTimer) {
    clearTimeout(outputEmitTimer);
    outputEmitTimer = null;
  }
  outputEmitTimer = setTimeout(() => {
    outputEmitTimer = null;
    emitRotateOutputNow();
  }, 180);
};

const queueEmitRotatePrompt = () => {
  if (promptEmitTimer) {
    clearTimeout(promptEmitTimer);
    promptEmitTimer = null;
  }
  promptEmitTimer = setTimeout(() => {
    promptEmitTimer = null;
    emitRotatePromptNow();
  }, 40);
};

const draw = () => {
  const c = canvas.value;
  const im = img;
  if (!c || !im) return;

  const ctx = c.getContext("2d");
  if (!ctx) return;

  const scale = dpr();
  const W = c.width;
  const H = c.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Fill 3D software dark background
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, W, H);

  const iw = im.naturalWidth;
  const ih = im.naturalHeight;
  if (!iw || !ih) return;

  const viewW = W / scale;
  const viewH = H / scale;

  const pad = 12;
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2);
  const imgAspect = iw / ih;
  const viewAspect = availW / availH;

  let planeW = availW;
  let planeH = availH;
  if (imgAspect > viewAspect) {
    planeW = availW;
    planeH = availW / imgAspect;
  } else {
    planeH = availH;
    planeW = availH * imgAspect;
  }

  const cx = viewW / 2;
  const cy = viewH / 2;

  const angY = yaw.value;
  const angX = pitch.value;
  const cosY = Math.cos(angY);
  const sinY = Math.sin(angY);
  const cosX = Math.cos(angX);
  const sinX = Math.sin(angX);

  const halfW = planeW / 2;
  const halfH = planeH / 2;
  const halfD = Math.max(20, Math.min(halfW, halfH) * 0.4);

  const localCorners: Vec3[] = [
    { x: -halfW, y: -halfH, z: -halfD }, // 0: front top left
    { x: halfW, y: -halfH, z: -halfD }, // 1: front top right
    { x: halfW, y: halfH, z: -halfD }, // 2: front bottom right
    { x: -halfW, y: halfH, z: -halfD }, // 3: front bottom left
    { x: -halfW, y: -halfH, z: halfD }, // 4: back top left
    { x: halfW, y: -halfH, z: halfD }, // 5: back top right
    { x: halfW, y: halfH, z: halfD }, // 6: back bottom right
    { x: -halfW, y: halfH, z: halfD }, // 7: back bottom left
  ];

  const rotatePoint = (p: Vec3): Vec3 => {
    // yaw around Y
    const x1 = p.x * cosY + p.z * sinY;
    const z1 = -p.x * sinY + p.z * cosY;
    // pitch around X
    const y2 = p.y * cosX - z1 * sinX;
    const z2 = p.y * sinX + z1 * cosX;
    return { x: x1, y: y2, z: z2 };
  };

  const focal = Math.max(220, planeW * 1.35);
  const depthOffset = focal * 0.35;

  const projectedAll = localCorners.map((p) => {
    const r = rotatePoint(p);
    const projected = project({ x: r.x, y: r.y, z: r.z + depthOffset }, focal);
    return { r, p: { x: cx + projected.x, y: cy + projected.y } };
  });

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // Helper to draw a 3D line
  const drawLine = (
    p1: Vec3,
    p2: Vec3,
    color: string,
    width = 1,
    dash: number[] = []
  ) => {
    const r1 = rotatePoint(p1);
    const pr1 = project({ x: r1.x, y: r1.y, z: r1.z + depthOffset }, focal);
    const r2 = rotatePoint(p2);
    const pr2 = project({ x: r2.x, y: r2.y, z: r2.z + depthOffset }, focal);
    ctx.beginPath();
    ctx.moveTo(cx + pr1.x, cy + pr1.y);
    ctx.lineTo(cx + pr2.x, cy + pr2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash.length > 0) ctx.setLineDash(dash);
    else ctx.setLineDash([]);
    ctx.stroke();
  };

  // 1. Draw Ground Grid and Axes
  const yFloor = halfH + halfD + 20;
  const gw = Math.max(planeW, planeH) * 2;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps - 0.5;
    const offset = t * gw;
    drawLine(
      { x: offset, y: yFloor, z: -gw / 2 },
      { x: offset, y: yFloor, z: gw / 2 },
      "rgba(255,255,255,0.1)",
      1
    );
    drawLine(
      { x: -gw / 2, y: yFloor, z: offset },
      { x: gw / 2, y: yFloor, z: offset },
      "rgba(255,255,255,0.1)",
      1
    );
  }

  // Axes (origin is bottom center)
  const axLen = gw * 0.4;
  // X: Red (Right)
  drawLine(
    { x: 0, y: yFloor, z: 0 },
    { x: axLen, y: yFloor, z: 0 },
    "rgba(255, 60, 60, 0.9)",
    2
  );
  // Y: Green (Up -> negative y in canvas)
  drawLine(
    { x: 0, y: yFloor, z: 0 },
    { x: 0, y: yFloor - axLen, z: 0 },
    "rgba(60, 255, 60, 0.9)",
    2
  );
  // Z: Blue (Forward)
  drawLine(
    { x: 0, y: yFloor, z: 0 },
    { x: 0, y: yFloor, z: axLen },
    "rgba(60, 100, 255, 0.9)",
    2
  );

  // 2. Sort and Draw Faces
  const faces = [
    { id: "front", c: [0, 1, 2, 3], z: 0 },
    { id: "back", c: [5, 4, 7, 6], z: 0 },
    { id: "left", c: [4, 0, 3, 7], z: 0 },
    { id: "right", c: [1, 5, 6, 2], z: 0 },
    { id: "top", c: [4, 5, 1, 0], z: 0 },
    { id: "bottom", c: [3, 2, 6, 7], z: 0 },
  ];

  faces.forEach((f) => {
    f.z =
      (projectedAll[f.c[0]].r.z +
        projectedAll[f.c[1]].r.z +
        projectedAll[f.c[2]].r.z +
        projectedAll[f.c[3]].r.z) /
      4;
  });
  // Because larger Z is further away based on our projection, we sort descending to draw back-to-front
  faces.sort((a, b) => b.z - a.z);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (const face of faces) {
    if (face.id === "front") {
      const p0 = projectedAll[0].p;
      const p1 = projectedAll[1].p;
      const p2 = projectedAll[2].p;
      const p3 = projectedAll[3].p;

      const s0 = { x: 0, y: 0 };
      const s1 = { x: iw, y: 0 };
      const s2 = { x: iw, y: ih };
      const s3 = { x: 0, y: ih };

      const perspectiveStrength = Math.max(
        Math.abs(Math.sin(angY)),
        Math.abs(Math.sin(angX))
      );
      const strips = Math.max(
        10,
        Math.min(36, Math.round(12 + perspectiveStrength * 24))
      );
      const seamExpandPx = 1.25;
      const seamSourcePad = 0.42 / strips;

      for (let i = 0; i < strips; i += 1) {
        const t0 = i / strips;
        const t1 = (i + 1) / strips;

        const tt0 = Math.max(0, t0 - seamSourcePad);
        const tt1 = Math.min(1, t1 + seamSourcePad);

        const dt0 = lerpVec2(p0, p1, tt0);
        const dt1 = lerpVec2(p0, p1, tt1);
        const db0 = lerpVec2(p3, p2, tt0);
        const db1 = lerpVec2(p3, p2, tt1);

        const st0 = lerpVec2(s0, s1, tt0);
        const st1 = lerpVec2(s0, s1, tt1);
        const sb0 = lerpVec2(s3, s2, tt0);
        const sb1 = lerpVec2(s3, s2, tt1);

        drawTexturedTriangle(ctx, im, st0, st1, sb1, dt0, dt1, db1, seamExpandPx);
        drawTexturedTriangle(ctx, im, st0, sb1, sb0, dt0, db1, db0, seamExpandPx);
      }
    } else {
      const c0 = projectedAll[face.c[0]].p;
      const c1 = projectedAll[face.c[1]].p;
      const c2 = projectedAll[face.c[2]].p;
      const c3 = projectedAll[face.c[3]].p;

      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.closePath();

      ctx.fillStyle = "rgba(120, 120, 120, 0.15)";
      ctx.fill();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(200, 200, 200, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
  queueEmitRotatePrompt();
  queueEmitRotateOutput();
};

const normalizeRadians = (v: number) => {
  const t = Math.PI * 2;
  let n = v % t;
  if (n > Math.PI) n -= t;
  if (n < -Math.PI) n += t;
  return n;
};

const cancelRotateAnimation = () => {
  if (rotateAnimRaf) {
    cancelAnimationFrame(rotateAnimRaf);
    rotateAnimRaf = 0;
  }
};

const animateTo = (targetYaw: number, targetPitch: number, duration = 320) => {
  cancelRotateAnimation();
  const fromYaw = yaw.value;
  const fromPitch = pitch.value;
  const yawDelta = normalizeRadians(targetYaw - fromYaw);
  const toYaw = fromYaw + yawDelta;
  const toPitch = clamp(targetPitch, -MAX_PITCH, MAX_PITCH);
  const start = performance.now();

  const step = (now: number) => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    yaw.value = normalizeRadians(fromYaw + (toYaw - fromYaw) * eased);
    pitch.value = fromPitch + (toPitch - fromPitch) * eased;
    draw();
    if (t < 1) {
      rotateAnimRaf = requestAnimationFrame(step);
      return;
    }
    rotateAnimRaf = 0;
  };

  rotateAnimRaf = requestAnimationFrame(step);
};

const quickViewAngles: Record<
  "+x" | "-x" | "+y" | "-y" | "+z" | "-z",
  { yaw: number; pitch: number }
> = {
  "+x": { yaw: Math.PI / 2, pitch: 0 },
  "-x": { yaw: -Math.PI / 2, pitch: 0 },
  "+y": { yaw: 0, pitch: -MAX_PITCH },
  "-y": { yaw: 0, pitch: MAX_PITCH },
  "+z": { yaw: 0, pitch: 0 },
  "-z": { yaw: Math.PI, pitch: 0 },
};

const onQuickView = (dir: "+x" | "-x" | "+y" | "-y" | "+z" | "-z") => {
  const t = quickViewAngles[dir];
  if (!t) return;
  animateTo(t.yaw, t.pitch, 360);
};

const onResetView = () => {
  animateTo(0, 0, 280);
};

const onDragStart = (e: PointerEvent) => {
  if (e.button !== 0) return;
  const el = canvas.value;
  if (!el) return;

  cancelRotateAnimation();
  emit("select", props.nodeId);
  dragState = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  dragging.value = true;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }

  const onMove = (ev: PointerEvent) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    const dx = ev.clientX - dragState.lastX;
    const dy = ev.clientY - dragState.lastY;
    dragState.lastX = ev.clientX;
    dragState.lastY = ev.clientY;

    yaw.value = normalizeRadians(yaw.value + dx * 0.012);
    pitch.value = clamp(pitch.value + dy * 0.01, -MAX_PITCH, MAX_PITCH);
    draw();
  };

  const onUp = (ev: PointerEvent) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    dragging.value = false;
    dragState = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
};

watch(
  () => inputSrc.value,
  (src) => {
    lastOutputKey = "";
    lastPromptKey = "";
    loadedImageVersion += 1;
    loadedImageKey = "";
    img = null;
    ensureImage(src);
    draw();
  },
  { immediate: true }
);

onMounted(() => {
  resizeCanvasToWrap();
  ro = new ResizeObserver(() => {
    resizeCanvasToWrap();
  });
  if (wrap.value) ro.observe(wrap.value);
  draw();
});

onBeforeUnmount(() => {
  imageLoadToken += 1;
  revokeSourceObjectUrl();
  cancelRotateAnimation();
  if (outputEmitTimer) {
    clearTimeout(outputEmitTimer);
    outputEmitTimer = null;
  }
  if (promptEmitTimer) {
    clearTimeout(promptEmitTimer);
    promptEmitTimer = null;
  }
  dragging.value = false;
  dragState = null;
  if (ro) {
    try {
      ro.disconnect();
    } catch {
      // ignore
    }
  }
  ro = null;
});
</script>

<style scoped>
.wf-rotate-wrap {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.wf-rotate-canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  cursor: grab;
}

.wf-rotate-canvas.dragging {
  cursor: grabbing;
}

.wf-rotate-overlay {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: flex-end;
  gap: 8px;
  z-index: 2;
}

.wf-view-cube {
  position: relative;
  width: 96px;
  height: 86px;
  border: 1px solid var(--vscode-border);
  background: color-mix(in srgb, var(--dweb-defualt-dark) 80%, transparent);
  backdrop-filter: blur(2px);
  border-radius: 0;
}

.wf-cube-graphic {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38px;
  height: 38px;
  transform: translate(-50%, -50%);
}

.wf-cube-face {
  position: absolute;
  width: 38px;
  height: 38px;
  border: 1px solid var(--vscode-border);
  color: var(--vscode-fg);
  font-size: 10px;
  line-height: 36px;
  text-align: center;
  cursor: pointer;
  padding: 0;
  user-select: none;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.wf-cube-face:hover {
  border-color: var(--vscode-hover-border);
}

.face-front {
  background: color-mix(in srgb, var(--dweb-blue) 35%, var(--dweb-defualt));
  transform: translate(0, 0);
  z-index: 6;
}

.face-back {
  background: color-mix(in srgb, var(--vscode-fg-muted) 18%, var(--dweb-defualt-dark));
  transform: translate(-12px, -12px);
  opacity: 0.9;
  z-index: 1;
}

.face-left {
  width: 20px;
  background: color-mix(in srgb, var(--dweb-purple) 28%, var(--dweb-defualt));
  clip-path: polygon(100% 0, 100% 100%, 0 82%, 0 18%);
  transform: translate(-20px, 0) skewY(16deg);
  line-height: 38px;
  z-index: 4;
}

.face-right {
  width: 20px;
  background: color-mix(in srgb, var(--dweb-green-main) 28%, var(--dweb-defualt));
  clip-path: polygon(0 0, 0 100%, 100% 82%, 100% 18%);
  transform: translate(38px, 0) skewY(-16deg);
  line-height: 38px;
  z-index: 4;
}

.face-top {
  height: 20px;
  background: color-mix(in srgb, var(--dweb-orange) 28%, var(--dweb-defualt));
  clip-path: polygon(18% 100%, 82% 100%, 100% 0, 0 0);
  transform: translate(0, -20px) skewX(-16deg);
  line-height: 20px;
  z-index: 5;
}

.face-bottom {
  height: 20px;
  background: color-mix(in srgb, var(--dweb-yellow) 30%, var(--dweb-defualt));
  clip-path: polygon(0 100%, 100% 100%, 82% 0, 18% 0);
  transform: translate(0, 38px) skewX(16deg);
  line-height: 20px;
  z-index: 3;
}

.wf-cube-face:hover {
  background: var(--vscode-hover-bg);
  transform-origin: center;
}

.wf-reset-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
  border-radius: 0;
  font-size: 11px;
}

.wf-reset-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-rotate-footer {
  font-size: 11px;
  color: var(--vscode-fg-muted);
}

.wf-rotate-hint {
  user-select: none;
}
</style>
