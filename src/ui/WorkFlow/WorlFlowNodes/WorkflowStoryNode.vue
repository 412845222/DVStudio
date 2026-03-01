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
      <div class="wf-story-body">
        <div ref="playerWrapEl" class="wf-story-player-wrap">
          <div class="wf-story-player" :style="playerStyle">
            <div class="wf-story-preview">
              <div
                v-if="previewKind === 'image' && previewUrl"
                class="wf-story-preview-img"
                :class="{ cropped: !!previewCropEnabled && !!previewCrop }"
              >
                <img :src="previewUrl" alt="剧情预览" :style="previewImgStyle" />
              </div>
              <video
                v-else-if="previewKind === 'video' && previewUrl"
                ref="previewVideoEl"
                :src="previewUrl"
                :muted="previewMuted"
                loop
                playsinline
                @loadedmetadata="onPreviewVideoLoadedMetadata"
                @timeupdate="onPreviewVideoTimeUpdate"
                @pause="onPreviewVideoPause"
                @play="onPreviewVideoPlay"
              />
              <div v-else class="wf-story-placeholder">
                <div class="wf-story-placeholder-title">暂无画面预览</div>
                <div class="wf-story-placeholder-sub">连接图片或视频输入节点</div>
              </div>
            </div>
          </div>
        </div>

        <div class="wf-story-preview-settings" @pointerdown.stop>
          <div class="wf-story-preview-settings-title">画面预览</div>
          <label class="wf-story-preview-field">
            <span class="wf-story-preview-label">宽</span>
            <input
              class="wf-story-preview-input"
              type="number"
              min="1"
              step="1"
              :value="previewWidthDisplay"
              @change="onPreviewWidthChange"
            />
          </label>
          <label class="wf-story-preview-field">
            <span class="wf-story-preview-label">高</span>
            <input
              class="wf-story-preview-input"
              type="number"
              min="1"
              step="1"
              :value="previewHeightDisplay"
              @change="onPreviewHeightChange"
            />
          </label>
          <div class="wf-story-preview-aspect">{{ previewAspectText }}</div>
        </div>

        <div
          v-if="previewKind === 'video' && previewUrl"
          class="wf-story-video-controls"
          @pointerdown.stop
        >
          <VideoController
            :disabled="!previewVideoDuration"
            :playing="previewVideoPlaying"
            :duration="previewVideoDuration"
            :currentTime="previewVideoCurrentTime"
            :volume="previewVideoVolume"
            @toggle-play="togglePreviewVideoPlay"
            @seek="seekPreviewVideo"
            @update-volume="onPreviewVideoVolumeChange"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="wf-story-branches" @pointerdown.stop>
        <div class="wf-story-branches-header">
          <div class="wf-story-branches-title">剧情分支</div>
          <button class="wf-story-branches-add" type="button" @click="emit('add-branch')">
            新增分支
          </button>
        </div>
        <div v-for="(branch, idx) in branches" :key="branch.id" class="wf-story-branch">
          <div class="wf-story-index">{{ idx + 1 }}</div>
          <input
            class="wf-story-input"
            type="text"
            :value="branch.text"
            placeholder="剧情分支描述"
            @input="onBranchInput(branch.id, $event)"
          />
          <button class="wf-story-action" type="button" title="设置">
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-story-icon">
              <path
                d="M7 1h2l.4 1.5 1.6.7 1.3-.8 1.4 1.4-.8 1.3.7 1.6L15 7v2l-1.5.4-.7 1.6.8 1.3-1.4 1.4-1.3-.8-1.6.7L9 15H7l-.4-1.5-1.6-.7-1.3.8-1.4-1.4.8-1.3-.7-1.6L1 9V7l1.5-.4.7-1.6-.8-1.3L3.8 2.3l1.3.8 1.6-.7L7 1z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.1"
              />
              <circle
                cx="8"
                cy="8"
                r="2.2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.1"
              />
            </svg>
          </button>
          <button
            class="wf-story-action danger"
            type="button"
            title="删除"
            @click="emit('remove-branch', branch.id)"
          >
            删除
          </button>
        </div>
      </div>
    </template>
    <template
      #anchors="{
        inputAnchors,
        outputAnchors,
        endLink,
        startLink,
        isInputHover,
        isOutputHover,
      }"
    >
      <div class="wf-story-anchor-inputs">
        <div
          class="wf-story-anchor-in flow"
          :class="{ hovered: isInputHover(flowInputId(inputAnchors)) }"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="flowInputId(inputAnchors)"
          data-wf-dir="in"
          data-wf-anchor-index="0"
          @pointerup.stop="onInputEnd(flowInputId(inputAnchors), endLink)"
        />
        <div
          class="wf-story-anchor-in resource"
          :class="{ hovered: isInputHover(resourceInputId(inputAnchors)) }"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="resourceInputId(inputAnchors)"
          data-wf-dir="in"
          data-wf-anchor-index="1"
          @pointerup.stop="onInputEnd(resourceInputId(inputAnchors), endLink)"
        />
      </div>
      <div class="wf-story-anchors-out">
        <div
          v-for="a in outputAnchors"
          :key="a.id"
          class="wf-story-anchor-out"
          :class="{ hovered: isOutputHover(a.id) }"
          :style="anchorStyle(a)"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="a.id"
          data-wf-dir="out"
          :data-wf-anchor-index="a.index"
          @pointerdown.stop.prevent="startLink(a.id, a.index, $event)"
        />
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";
import VideoController from "../../UIComponent/VideoController.vue";
import type { WorkflowStoryBranch } from "../../../aiworkflow/types";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
};

type PreviewKind = "image" | "video" | null;

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
  branches: WorkflowStoryBranch[];
  previewUrl?: string | null;
  previewKind?: PreviewKind;
  previewCropEnabled?: boolean;
  previewCrop?: { x: number; y: number; width: number; height: number } | null;
  previewWidth?: number;
  previewHeight?: number;
}>();

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const previewImgStyle = computed(() => {
  const enabled = !!props.previewCropEnabled;
  const c = props.previewCrop;
  if (!enabled || !c) return {};
  const w = Math.max(0.01, clamp01(Number(c.width) || 0));
  const h = Math.max(0.01, clamp01(Number(c.height) || 0));
  const x = clamp01(Number(c.x) || 0);
  const y = clamp01(Number(c.y) || 0);
  const scaleW = 100 / w;
  const scaleH = 100 / h;
  return {
    width: `${scaleW}%`,
    height: `${scaleH}%`,
    left: `${-x * scaleW}%`,
    top: `${-y * scaleH}%`,
  } as Record<string, string>;
});

const previewW = computed(() => {
  const v = Number(props.previewWidth);
  return Number.isFinite(v) && v > 0 ? Math.max(1, Math.floor(v)) : 1920;
});

const previewH = computed(() => {
  const v = Number(props.previewHeight);
  return Number.isFinite(v) && v > 0 ? Math.max(1, Math.floor(v)) : 1080;
});

const previewWidthDisplay = computed(() => String(previewW.value));
const previewHeightDisplay = computed(() => String(previewH.value));
const previewAspectText = computed(() => {
  const w = previewW.value;
  const h = previewH.value;
  if (!w || !h) return "";
  const r = w / h;
  return `${w}×${h} (${r.toFixed(3)}:1)`;
});

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
    v: "base" | "text" | "text-merge" | "image" | "rotate-image" | "video" | "story" | "comfyui"
  ): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (e: "update-branch", payload: { branchId: string; text: string }): void;
  (e: "add-branch"): void;
  (e: "remove-branch", branchId: string): void;
  (
    e: "update-preview-settings",
    payload: { previewWidth?: number; previewHeight?: number }
  ): void;
}>();

const onPreviewWidthChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw <= 0) return;
  emit("update-preview-settings", { previewWidth: Math.max(1, Math.floor(raw)) });
};

const onPreviewHeightChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw <= 0) return;
  emit("update-preview-settings", { previewHeight: Math.max(1, Math.floor(raw)) });
};

const previewVideoEl = ref<HTMLVideoElement | null>(null);
const previewVideoPlaying = ref(false);
const previewVideoDuration = ref(0);
const previewVideoCurrentTime = ref(0);
const previewVideoVolume = ref(1);

const previewMuted = computed(() => previewVideoVolume.value <= 0.001);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const applyPreviewVolume = () => {
  const v = previewVideoEl.value;
  if (!v) return;
  v.muted = previewMuted.value;
  v.volume = clamp(Number(previewVideoVolume.value) || 0, 0, 1);
};

const onPreviewVideoLoadedMetadata = () => {
  const v = previewVideoEl.value;
  if (!v) return;
  previewVideoDuration.value = Math.max(0, Number(v.duration) || 0);
  previewVideoCurrentTime.value = clamp(
    Number(v.currentTime) || 0,
    0,
    previewVideoDuration.value || 0
  );
  applyPreviewVolume();
};

const onPreviewVideoTimeUpdate = () => {
  const v = previewVideoEl.value;
  if (!v) return;
  previewVideoCurrentTime.value = clamp(
    Number(v.currentTime) || 0,
    0,
    previewVideoDuration.value || 0
  );
};

const onPreviewVideoPause = () => {
  previewVideoPlaying.value = false;
};

const onPreviewVideoPlay = () => {
  previewVideoPlaying.value = true;
};

const togglePreviewVideoPlay = async () => {
  const v = previewVideoEl.value;
  if (!v || !props.previewUrl) return;
  if (!previewVideoPlaying.value) {
    try {
      applyPreviewVolume();
      await v.play();
      previewVideoPlaying.value = true;
    } catch {
      previewVideoPlaying.value = false;
    }
    return;
  }
  try {
    v.pause();
  } catch {
    // ignore
  }
  previewVideoPlaying.value = false;
};

const seekPreviewVideo = (t: number) => {
  const v = previewVideoEl.value;
  if (!v || !previewVideoDuration.value) return;
  const next = clamp(Number(t) || 0, 0, previewVideoDuration.value);
  previewVideoCurrentTime.value = next;
  try {
    v.currentTime = next;
  } catch {
    // ignore
  }
};

const onPreviewVideoVolumeChange = (vv: number) => {
  previewVideoVolume.value = clamp(Number(vv) || 0, 0, 1);
  applyPreviewVolume();
};

const playerWrapEl = ref<HTMLElement | null>(null);
const playerPx = ref<{ w: number; h: number }>({ w: 0, h: 0 });

const computePlayerSize = () => {
  const el = playerWrapEl.value;
  if (!el) return;
  const cw = Math.max(0, el.clientWidth);
  const ch = Math.max(0, el.clientHeight);
  if (!cw || !ch) {
    playerPx.value = { w: 0, h: 0 };
    return;
  }
  const targetRatio = previewW.value / previewH.value;
  const containerRatio = cw / ch;
  let w = cw;
  let h = ch;
  if (containerRatio > targetRatio) {
    h = ch;
    w = Math.floor(h * targetRatio);
  } else {
    w = cw;
    h = Math.floor(w / targetRatio);
  }
  playerPx.value = { w: Math.max(1, w), h: Math.max(1, h) };
};

let ro: ResizeObserver | null = null;
onMounted(() => {
  computePlayerSize();
  ro = new ResizeObserver(() => computePlayerSize());
  if (playerWrapEl.value) ro.observe(playerWrapEl.value);
});

onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  ro = null;
});

watch(
  () => props.previewUrl,
  async () => {
    const v = previewVideoEl.value;
    if (!v || !props.previewUrl) {
      previewVideoPlaying.value = false;
      previewVideoDuration.value = 0;
      previewVideoCurrentTime.value = 0;
      return;
    }
    previewVideoPlaying.value = false;
    previewVideoCurrentTime.value = 0;
    try {
      v.pause();
    } catch {
      // ignore
    }
    applyPreviewVolume();
  },
  { immediate: true }
);

watch([previewW, previewH], () => computePlayerSize());

const playerStyle = computed(() => {
  const s = playerPx.value;
  if (!s.w || !s.h) return {};
  return { width: `${s.w}px`, height: `${s.h}px` } as Record<string, string>;
});

const onBranchInput = (branchId: string, e: Event) => {
  const v = (e.target as HTMLInputElement).value;
  emit("update-branch", { branchId, text: v });
};

const flowInputId = (inputAnchors: AnchorSpec[]) => {
  const match = inputAnchors.find((a) => a.id === "in-flow");
  return match?.id || inputAnchors[0]?.id;
};

const resourceInputId = (inputAnchors: AnchorSpec[]) => {
  const match = inputAnchors.find((a) => a.id === "in-resource");
  return match?.id || inputAnchors[1]?.id || inputAnchors[0]?.id;
};

const onInputEnd = (
  anchorId: string | undefined,
  endLink: (anchorId: string, anchorIndex: number) => void
) => {
  if (!anchorId) return;
  const index = anchorId === "in-resource" ? 1 : 0;
  endLink(anchorId, index);
};

const anchorStyle = (a: AnchorSpec & { offsetY?: number }) => ({
  top: `calc(50% + ${a.offsetY ?? 0}px)`,
});
</script>

<style scoped>
.wf-story-body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.wf-story-player-wrap {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wf-story-player {
  flex: 0 0 auto;
  min-width: 1px;
  min-height: 1px;
}

.wf-story-preview {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wf-story-preview-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--vscode-fg-muted);
}

.wf-story-preview-settings-title {
  color: var(--vscode-fg-muted);
}

.wf-story-preview-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wf-story-preview-label {
  min-width: 14px;
  text-align: right;
}

.wf-story-preview-input {
  width: 92px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 3px 6px;
  font-size: 12px;
}

.wf-story-preview-aspect {
  margin-left: auto;
  color: var(--vscode-fg-muted);
  font-size: 11px;
}

.wf-story-video-controls {
  flex: 0 0 auto;
}

.wf-story-preview-img {
  width: 100%;
  height: 100%;
}

.wf-story-preview-img.cropped {
  position: relative;
  overflow: hidden;
}

.wf-story-preview-img.cropped img {
  position: absolute;
}

.wf-story-preview img,
.wf-story-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-story-placeholder {
  text-align: center;
  color: var(--vscode-fg-muted);
}

.wf-story-placeholder-title {
  font-size: 12px;
}

.wf-story-placeholder-sub {
  font-size: 11px;
  margin-top: 4px;
}

.wf-story-branches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.wf-story-branches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wf-story-branches-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-story-branches-add {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-story-branches-add:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-story-branch {
  display: grid;
  grid-template-columns: 22px 1fr 26px 48px;
  gap: 6px;
  align-items: center;
  min-height: 32px;
  position: relative;
}

.wf-story-index {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  text-align: center;
}

.wf-story-input {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 6px;
  font-size: 12px;
}

.wf-story-action {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 4px;
  cursor: pointer;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-story-action:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-story-action.danger {
  width: auto;
  padding: 4px 6px;
  color: var(--vscode-fg-muted);
}

.wf-story-icon {
  width: 14px;
  height: 14px;
}

.wf-story-anchors-out {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -10px;
}

.wf-story-anchor-out {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid #f29d38;
  background: #f29d38;
  cursor: crosshair;
  position: absolute;
  transform: translateY(-50%);
}

.wf-story-anchor-out.hovered {
  box-shadow: 0 0 8px rgba(242, 157, 56, 0.65);
}

.wf-story-anchor-inputs {
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-story-anchor-in {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 2px solid #f29d38;
  background: #f29d38;
  cursor: crosshair;
}

.wf-story-anchor-in.resource {
  border-color: var(--dweb-blue);
  background: var(--dweb-blue);
}

.wf-story-anchor-in.hovered {
  box-shadow: 0 0 8px rgba(242, 157, 56, 0.65);
}

.wf-story-anchor-in.resource.hovered {
  box-shadow: 0 0 8px rgba(58, 168, 180, 0.65);
}
</style>
