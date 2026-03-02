<template>
  <div
    ref="dockRef"
    class="chat-dock"
    :class="{ 'history-expanded': historyExpanded, collapsed: !!collapsed }"
    :style="dockStyle"
    @pointerdown.stop
    @wheel.stop
  >
    <button class="chat-collapsed-handle" type="button" @click="requestExpand">
      AI 对话
    </button>

    <div class="chat-content" :aria-hidden="collapsed ? 'true' : 'false'">
      <div class="chat-history">
        <div class="chat-history-bar" @pointerdown="onDockDragStart">
          <div class="chat-history-title">
            <template v-if="isVisualGenMode">
              <span>{{ visualPanelTitle }}</span>
              <span class="nano-title-tag">{{ nanoInterfaceLabel }}</span>
              <span v-if="nanoModelTag" class="nano-title-tag"
                >实际：{{ nanoModelTag }}</span
              >
            </template>
            <template v-else>对话历史</template>
          </div>
          <button
            class="chat-history-minimize"
            type="button"
            title="最小化"
            @pointerdown.stop
            @click.stop="requestCollapse"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 12h12v2H6z" />
            </svg>
          </button>
          <button
            class="chat-history-expand"
            type="button"
            :title="historyExpanded ? '还原高度' : '放大高度'"
            @click="toggleHistory"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 3H3v4h2V5h2V3zm14 0h-4v2h2v2h2V3zM5 17H3v4h4v-2H5v-2zm16 0h-2v2h-2v2h4v-4z"
              />
            </svg>
          </button>
        </div>
        <div
          ref="historyBodyRef"
          class="chat-history-body"
          :class="{ nanobanana: isVisualGenMode }"
        >
          <template v-if="isVisualGenMode">
            <div class="nano-panel">
              <div
                v-if="nanoAnchorNodeId && nanoRefAnchors?.length"
                class="nano-anchor-col"
              >
                <div class="nano-anchor-col-title">参考图</div>
                <div class="nano-anchor-col-list">
                  <div
                    v-for="(a, i) in nanoRefAnchors"
                    :key="a.id"
                    class="nano-anchor-item"
                    :class="{
                      hover: nanoHoverAnchorId === a.id,
                      connected: !!a.connected,
                    }"
                  >
                    <div
                      class="nano-ref-dot"
                      :data-wf-node-id="nanoAnchorNodeId"
                      :data-wf-anchor-id="a.id"
                      data-wf-dir="in"
                      :title="
                        a.connected ? '已连接：' + (a.connectedFrom || '') : '未连接'
                      "
                      @pointerup.stop="emitWorkflowEndLink(a.id, i)"
                    />
                    <div class="nano-anchor-label">{{ a.label }}</div>
                  </div>
                </div>
              </div>

              <div class="nano-left">
                <div class="nano-field" v-if="modelKey === 'nanobanana'">
                  <div class="nano-label">比例</div>
                  <select
                    class="nano-input"
                    :disabled="sending"
                    v-model="nanoConfig.aspectRatio"
                  >
                    <option value="1:1">1:1</option>
                    <option value="2:3">2:3</option>
                    <option value="3:2">3:2</option>
                    <option value="3:4">3:4</option>
                    <option value="4:3">4:3</option>
                    <option value="4:5">4:5</option>
                    <option value="5:4">5:4</option>
                    <option value="9:16">9:16</option>
                    <option value="16:9">16:9</option>
                    <option value="21:9">21:9</option>
                  </select>
                  <div class="nano-hint">
                    按 Gemini 官方 imageConfig 提交比例；两张参考图 + 文本提示词。
                  </div>
                </div>

                <div class="nano-field">
                  <div class="nano-label">数量</div>
                  <select
                    v-if="modelKey === 'nanobanana'"
                    class="nano-input"
                    :disabled="sending"
                    v-model.number="nanoConfig.quantity"
                  >
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                    <option :value="3">3</option>
                    <option :value="4">4</option>
                  </select>
                  <select
                    v-else
                    class="nano-input"
                    :disabled="sending"
                    v-model.number="seedanceConfig.referenceCount"
                  >
                    <option :value="1">1（优先首帧）</option>
                    <option :value="2">2（首帧+尾帧）</option>
                    <option :value="3">3</option>
                    <option :value="4">4</option>
                  </select>
                </div>

                <template v-if="modelKey === 'seedance'">
                  <div class="nano-field">
                    <div class="nano-label">时长</div>
                    <select
                      class="nano-input"
                      :disabled="sending"
                      v-model.number="seedanceConfig.duration"
                    >
                      <option :value="2">2s</option>
                      <option :value="3">3s</option>
                      <option :value="4">4s</option>
                      <option :value="5">5s</option>
                      <option :value="6">6s</option>
                      <option :value="8">8s</option>
                      <option :value="10">10s</option>
                      <option :value="12">12s</option>
                    </select>
                  </div>

                  <div class="nano-field">
                    <div class="nano-label">分辨率</div>
                    <select
                      class="nano-input"
                      :disabled="sending"
                      v-model="seedanceConfig.resolution"
                    >
                      <option value="">模型默认</option>
                      <option value="480p">480p</option>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </div>

                  <div class="nano-field">
                    <div class="nano-label">宽高比</div>
                    <select
                      class="nano-input"
                      :disabled="sending"
                      v-model="seedanceConfig.ratio"
                    >
                      <option value="adaptive">adaptive</option>
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                      <option value="16:9">16:9</option>
                      <option value="3:4">3:4</option>
                      <option value="9:16">9:16</option>
                      <option value="21:9">21:9</option>
                    </select>
                  </div>

                  <div class="nano-field">
                    <div class="nano-label">参考图模式</div>
                    <select
                      class="nano-input"
                      :disabled="sending"
                      v-model="seedanceConfig.refMode"
                    >
                      <option value="auto">自动</option>
                      <option value="first">首帧</option>
                      <option value="first-last">首尾帧</option>
                      <option value="reference">参考图</option>
                    </select>
                  </div>

                  <div class="nano-field">
                    <div class="nano-label">附加</div>
                    <select
                      class="nano-input"
                      :disabled="sending"
                      v-model="seedanceConfig.flags"
                    >
                      <option value="none">无</option>
                      <option value="audio">生成音频</option>
                      <option value="watermark">带水印</option>
                      <option value="camera-fixed">固定镜头</option>
                      <option value="draft">Draft 模式</option>
                    </select>
                  </div>
                </template>

                <div class="chat-history-status" aria-live="polite">
                  执行状态：{{
                    nanoStatus ||
                    (sending
                      ? modelKey === "seedance"
                        ? "Seedance：生成中…"
                        : "Gemini：生成中…"
                      : modelKey === "seedance"
                      ? "Seedance：待生成"
                      : "Gemini：待生成")
                  }}
                </div>
                <div v-if="nanoDetail" class="nano-detail" aria-live="polite">
                  {{ nanoDetail }}
                </div>
                <div class="nano-billing" aria-live="polite">
                  用时：{{ nanoElapsedText }}；预计：{{ nanoEstimateText }}
                </div>
                <div class="nano-billing" aria-live="polite">
                  费用（usage）：{{ nanoBilling || "—" }}
                </div>
              </div>

              <div class="nano-right">
                <div class="nano-preview">
                  <div
                    class="nano-preview-grid"
                    :class="`count-${nanoPreviewSlots.length}`"
                  >
                    <div
                      v-for="(slot, idx) in nanoPreviewSlots"
                      :key="`slot-${idx}`"
                      class="nano-preview-item"
                      :class="{ loading: !!slot.loading }"
                    >
                      <template v-if="slot.url">
                        <video
                          v-if="modelKey === 'seedance'"
                          :src="slot.url"
                          controls
                          preload="metadata"
                          draggable="true"
                          @dragstart="onNanoPreviewDragStart($event, slot.url, 'video')"
                          class="nano-preview-video"
                        />
                        <img
                          v-else
                          :src="slot.url"
                          :alt="`preview-${idx + 1}`"
                          draggable="true"
                          @dragstart="onNanoPreviewDragStart($event, slot.url, 'image')"
                          :class="{ loading: !!slot.loading && !slot.url }"
                        />
                      </template>
                      <div v-else class="nano-preview-empty">
                        暂无预览图 {{ idx + 1 }}
                      </div>
                      <div
                        v-if="slot.loading && !slot.url"
                        class="nano-preview-item-loading"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-if="!messages?.length" class="chat-history-empty">
              暂无对话，先在下方输入并发送。
            </div>
            <div v-else class="chat-history-list">
              <div
                v-for="m in messages"
                :key="m.id"
                class="chat-msg"
                :class="
                  m.role === 'user'
                    ? 'user'
                    : m.role === 'assistant'
                    ? 'assistant'
                    : 'system'
                "
              >
                <div class="chat-msg-bubble">
                  <div class="chat-msg-role">
                    {{
                      m.role === "user" ? "你" : m.role === "assistant" ? "AI" : "系统"
                    }}
                  </div>
                  <div class="chat-msg-content">{{ m.content }}</div>
                </div>
              </div>
            </div>

            <div class="chat-history-status" aria-live="polite">
              {{ taskStatus || (sending ? "AI 任务：生成中…" : "AI 任务：空闲") }}
            </div>
          </template>
        </div>
      </div>

      <div class="chat-dock-body">
        <div class="chat-dock-toolbar">
          <div class="chat-dock-toolbar-item">
            <div class="chat-dock-toolbar-label">模型</div>
            <select
              class="chat-dock-toolbar-select"
              :value="modelKey"
              :disabled="sending"
              @change="onModelChange"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="nanobanana">Gemini（NanoBanana）</option>
              <option value="seedance">字节（Seedance 生视频）</option>
            </select>
          </div>
          <div v-if="modelKey === 'nanobanana'" class="chat-dock-toolbar-item">
            <div class="chat-dock-toolbar-label">图片接口</div>
            <select
              class="chat-dock-toolbar-select"
              v-model="nanoConfig.imageModel"
              :disabled="sending"
            >
              <option value="gemini-2.5-flash-image">
                NanoBanana（Gemini 2.5 Flash Image）
              </option>
              <option value="gemini-3.1-flash-image-preview">
                NanoBanana 2（Gemini 3.1 Flash Image 预览版）
              </option>
              <option value="gemini-3-pro-image-preview">
                NanoBanana Pro（Gemini 3 Pro Image 预览版）
              </option>
            </select>
          </div>
          <div v-if="modelKey === 'seedance'" class="chat-dock-toolbar-item">
            <div class="chat-dock-toolbar-label">视频接口</div>
            <select
              class="chat-dock-toolbar-select"
              v-model="seedanceConfig.model"
              :disabled="sending"
            >
              <option value="doubao-seedance-1-5-pro-251215">Seedance 1.5 Pro</option>
              <option value="doubao-seedance-1-0-pro-250528">Seedance 1.0 Pro</option>
              <option value="doubao-seedance-1-0-pro-fast-251015">
                Seedance 1.0 Pro Fast
              </option>
              <option value="doubao-seedance-1-0-lite-i2v-250428">
                Seedance 1.0 Lite I2V
              </option>
              <option value="doubao-seedance-1-0-lite-t2v-250428">
                Seedance 1.0 Lite T2V
              </option>
            </select>
          </div>
        </div>

        <textarea
          ref="inputRef"
          :value="modelValue"
          class="chat-dock-input"
          rows="3"
          :placeholder="
            modelKey === 'nanobanana'
              ? '输入 Gemini 图片提示词（两图参考+角度描述）…'
              : modelKey === 'seedance'
              ? '输入 Seedance 生视频提示词（支持文字+参考图）…'
              : '在这里输入需求，后续会驱动工作流生成…'
          "
          :disabled="sending"
          @focus="emit('focus-input')"
          @input="onInput"
          @keydown.enter.exact.prevent="onEnterSend"
          @keydown.enter.shift.exact.stop
        />
        <button
          class="chat-dock-send"
          type="button"
          :disabled="sending"
          @click="onClickSend"
        >
          {{
            sending
              ? modelKey === "nanobanana" || modelKey === "seedance"
                ? "生成中…"
                : "发送中…"
              : modelKey === "nanobanana" || modelKey === "seedance"
              ? "生成"
              : "发送"
          }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

export type BottomChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export type NanoBananaConfig = {
  aspectRatio: string;
  usePro?: boolean;
  quantity?: 1 | 2 | 3 | 4;
  imageModel?:
    | "gemini-2.5-flash-image"
    | "gemini-3.1-flash-image-preview"
    | "gemini-3-pro-image-preview";
};

export type SeedanceConfig = {
  model: string;
  ratio: string;
  resolution: string;
  duration: number;
  refMode: "auto" | "first" | "first-last" | "reference";
  referenceCount: number;
  flags: "none" | "audio" | "watermark" | "camera-fixed" | "draft";
};

export type NanoBananaRefAnchor = {
  id: string;
  label: string;
  connected?: boolean;
  connectedFrom?: string;
};

const props = defineProps<{
  modelValue: string;
  messages?: BottomChatMessage[];
  sending?: boolean;
  collapsed?: boolean;
  taskStatus?: string;
  modelKey?: "deepseek" | "nanobanana" | "seedance";
  nanoPreviewUrls?: string[];
  nanoPreviewLoadingStates?: boolean[];
  nanoPreviewUrl?: string;
  nanoStatus?: string;
  nanoDetail?: string;
  nanoBilling?: string;
  nanoModelUsed?: string;

  nanoAnchorNodeId?: string;
  nanoRefAnchors?: NanoBananaRefAnchor[];
  nanoHoverAnchorId?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "send"): void;
  (e: "request-expand"): void;
  (e: "request-collapse"): void;
  (e: "focus-input"): void;
  (e: "update:modelKey", v: "deepseek" | "nanobanana" | "seedance"): void;
  (e: "nanobanana-generate", v: { prompt: string; config: NanoBananaConfig }): void;
  (e: "seedance-generate", v: { prompt: string; config: SeedanceConfig }): void;
  (
    e: "workflow-end-link",
    v: { nodeId: string; anchorId: string; anchorIndex: number }
  ): void;
  (e: "layout-changed"): void;
}>();

const historyExpanded = ref(false);
const historyBodyRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const pendingFocus = ref(false);

const dockRef = ref<HTMLElement | null>(null);
const dockLeftPx = ref<number | null>(null);
let dragCleanup: (() => void) | null = null;

let layoutRaf = 0;
const emitLayoutChanged = () => {
  if (layoutRaf) return;
  layoutRaf = window.requestAnimationFrame(() => {
    layoutRaf = 0;
    emit("layout-changed");
  });
};

const clampDockLeft = (left: number) => {
  const w = window.innerWidth || 0;
  const rect = dockRef.value?.getBoundingClientRect();
  const half = rect ? rect.width / 2 : 460;
  const min = Math.max(half, 20);
  const max = Math.max(min, w - half);
  return Math.max(min, Math.min(max, left));
};

const dockStyle = computed(() => {
  if (dockLeftPx.value == null) return {} as Record<string, string>;
  return {
    left: `${dockLeftPx.value}px`,
    transform: "translateX(-50%)",
  } as Record<string, string>;
});

const modelKey = computed(
  () => (props.modelKey ?? "deepseek") as "deepseek" | "nanobanana" | "seedance"
);

const isVisualGenMode = computed(
  () => modelKey.value === "nanobanana" || modelKey.value === "seedance"
);

const nanoConfig = ref<NanoBananaConfig>({
  aspectRatio: "1:1",
  usePro: false,
  quantity: 1,
  imageModel: "gemini-2.5-flash-image",
});

const seedanceConfig = ref<SeedanceConfig>({
  model: "doubao-seedance-1-5-pro-251215",
  ratio: "adaptive",
  resolution: "",
  duration: 5,
  refMode: "auto",
  referenceCount: 4,
  flags: "none",
});

const normalizedNanoQuantity = computed(() => {
  if (modelKey.value === "seedance") return 1;
  const n = Number(nanoConfig.value.quantity ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
});

const nanoPreviewUrls = computed(() => {
  const list = Array.isArray(props.nanoPreviewUrls)
    ? props.nanoPreviewUrls.map((v) => String(v ?? "").trim())
    : [];
  if (list.length) return list;
  const single = String(props.nanoPreviewUrl ?? "").trim();
  return single ? [single] : [];
});

const nanoPreviewSlots = computed(() => {
  const count = normalizedNanoQuantity.value;
  const urls = nanoPreviewUrls.value;
  const loadingStates = Array.isArray(props.nanoPreviewLoadingStates)
    ? props.nanoPreviewLoadingStates.map((v) => !!v)
    : [];
  return Array.from({ length: count }, (_, idx) => ({
    url: urls[idx] || "",
    loading: !!loadingStates[idx],
  }));
});

const nanoProSelected = computed(
  () => String(nanoConfig.value.imageModel || "").trim() === "gemini-3-pro-image-preview"
);

const nanoInterfaceLabel = computed(() => {
  if (modelKey.value === "seedance") return "Seedance";
  const model = String(nanoConfig.value.imageModel || "").trim();
  if (model === "gemini-3-pro-image-preview") return "NanoBanana Pro";
  if (model === "gemini-3.1-flash-image-preview") return "NanoBanana 2";
  return "NanoBanana";
});

const nanoModelTag = computed(() => {
  if (modelKey.value === "seedance") {
    const model = String(props.nanoModelUsed || "").trim();
    if (!model) return "";
    return model;
  }
  const model = String(props.nanoModelUsed || "").trim();
  if (!model) return "";
  if (model === "gemini-3-pro-image-preview") return "Pro";
  if (model === "gemini-3.1-flash-image-preview") return "NanoBanana 2";
  return "NanoBanana";
});

const nanoStartAt = ref<number | null>(null);
const nanoElapsedSec = ref(0);
let nanoTimer: number | null = null;

const nanoElapsedText = computed(() => {
  if (!nanoStartAt.value) return "—";
  const s = Math.max(0, Math.floor(nanoElapsedSec.value));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return mm > 0 ? `${mm}m${String(ss).padStart(2, "0")}s` : `${ss}s`;
});

const nanoConnectedCount = computed(() => {
  const list = Array.isArray(props.nanoRefAnchors) ? props.nanoRefAnchors : [];
  return list.filter((a) => !!a?.connected).length;
});

const nanoEstimateText = computed(() => {
  if (modelKey.value === "seedance") {
    const sec = Math.max(8, Number(seedanceConfig.value.duration || 5) * 3);
    return `${sec}-${sec + 24}s（估算）`;
  }
  // No official ETA API. Provide a lightweight heuristic based on ref count.
  const n = nanoConnectedCount.value;
  const low = 8 + n * 2;
  const high = 25 + n * 4;
  return `${low}-${high}s（估算）`;
});

const onDockDragStart = (ev: PointerEvent) => {
  const target = ev.target as HTMLElement | null;
  // Don't hijack clicks on interactive controls.
  if (target?.closest("button,select,input,textarea,a")) return;
  if (!dockRef.value) return;

  if (dockLeftPx.value == null) {
    dockLeftPx.value = window.innerWidth / 2;
  }
  const startX = ev.clientX;
  const startLeft = dockLeftPx.value ?? window.innerWidth / 2;

  const onMove = (e: PointerEvent) => {
    const dx = e.clientX - startX;
    dockLeftPx.value = clampDockLeft(startLeft + dx);
    emitLayoutChanged();
  };
  const onUp = () => {
    if (dragCleanup) dragCleanup();
    dragCleanup = null;
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("pointercancel", onUp, { once: true });
  dragCleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
};

const toggleHistory = () => {
  historyExpanded.value = !historyExpanded.value;
  void nextTick().then(() => emitLayoutChanged());
};

const scrollHistoryToBottom = async () => {
  await nextTick();
  const el = historyBodyRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

watch(
  () => props.messages?.length ?? 0,
  () => {
    void scrollHistoryToBottom();
  }
);

watch(
  () => props.modelKey,
  () => {
    void scrollHistoryToBottom();
  }
);

watch(
  () => !!props.collapsed,
  (v) => {
    if (v) return;
    if (!pendingFocus.value) return;
    pendingFocus.value = false;
    void nextTick().then(() => inputRef.value?.focus());
  }
);

const requestExpand = () => {
  pendingFocus.value = true;
  emit("request-expand");
  void nextTick().then(() => emitLayoutChanged());
};

const requestCollapse = () => {
  emit("request-collapse");
  void nextTick().then(() => emitLayoutChanged());
};

const onInput = (e: Event) => {
  const v = (e.target as HTMLTextAreaElement).value;
  emit("update:modelValue", v);
};

const onModelChange = (e: Event) => {
  const v = String((e.target as HTMLSelectElement).value || "deepseek");
  const next = (v === "nanobanana"
    ? "nanobanana"
    : v === "seedance"
    ? "seedance"
    : "deepseek") as "deepseek" | "nanobanana" | "seedance";
  emit("update:modelKey", next);
};

const emitGenerate = () => {
  const prompt = String(props.modelValue || "").trim();
  if (!prompt) return;
  if (modelKey.value === "seedance") {
    emit("seedance-generate", {
      prompt,
      config: { ...seedanceConfig.value },
    });
    return;
  }
  const selected = String(nanoConfig.value.imageModel || "").trim();
  const imageModel =
    selected === "gemini-3-pro-image-preview"
      ? "gemini-3-pro-image-preview"
      : selected === "gemini-3.1-flash-image-preview"
      ? "gemini-3.1-flash-image-preview"
      : "gemini-2.5-flash-image";
  const usePro = imageModel === "gemini-3-pro-image-preview";
  const quantity = normalizedNanoQuantity.value as 1 | 2 | 3 | 4;
  emit("nanobanana-generate", {
    prompt,
    config: { ...nanoConfig.value, imageModel, usePro, quantity },
  });
};

const onEnterSend = () => {
  if (modelKey.value === "nanobanana" || modelKey.value === "seedance") emitGenerate();
  else emit("send");
};

const onClickSend = () => {
  if (modelKey.value === "nanobanana" || modelKey.value === "seedance") emitGenerate();
  else emit("send");
};

const visualPanelTitle = computed(() =>
  modelKey.value === "seedance" ? "Seedance 生视频" : "Gemini 图片生成"
);

const onNanoPreviewDragStart = (
  e: DragEvent,
  inputUrl?: string,
  kind: "image" | "video" = "image"
) => {
  const url = String(inputUrl || "").trim();
  if (!url) return;
  try {
    e.dataTransfer?.setData("application/x-dweb-nanobanana-preview", url);
    e.dataTransfer?.setData(
      "application/x-dweb-nanobanana-preview-meta",
      JSON.stringify({ url, kind })
    );
    e.dataTransfer?.setData("text/uri-list", url);
    e.dataTransfer?.setData("text/plain", url);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  } catch {
    // ignore
  }
};

const nanoAnchorNodeId = computed(() => String(props.nanoAnchorNodeId || "").trim());
const nanoRefAnchors = computed(
  () =>
    (Array.isArray(props.nanoRefAnchors)
      ? props.nanoRefAnchors
      : []) as NanoBananaRefAnchor[]
);
const nanoHoverAnchorId = computed(() =>
  props.nanoHoverAnchorId == null ? null : String(props.nanoHoverAnchorId)
);

const emitWorkflowEndLink = (anchorId: string, anchorIndex: number) => {
  const nodeId = nanoAnchorNodeId.value;
  if (!nodeId) return;
  emit("workflow-end-link", {
    nodeId,
    anchorId: String(anchorId || ""),
    anchorIndex: Number(anchorIndex) || 0,
  });
};

watch(
  () => dockRef.value,
  (el) => {
    if (!el) return;
    if (dockLeftPx.value == null) {
      dockLeftPx.value = clampDockLeft(window.innerWidth / 2);
    }
  },
  { immediate: true }
);

window.addEventListener("resize", () => {
  if (dockLeftPx.value == null) return;
  dockLeftPx.value = clampDockLeft(dockLeftPx.value);
  emitLayoutChanged();
});

watch(
  () => [props.sending, props.modelKey] as const,
  ([sending, mk], [prevSending]) => {
    const isNano =
      (mk ?? "deepseek") === "nanobanana" || (mk ?? "deepseek") === "seedance";
    if (!isNano) return;
    if (sending && !prevSending) {
      nanoStartAt.value = Date.now();
      nanoElapsedSec.value = 0;
      if (nanoTimer != null) window.clearInterval(nanoTimer);
      nanoTimer = window.setInterval(() => {
        if (!nanoStartAt.value) return;
        nanoElapsedSec.value = (Date.now() - nanoStartAt.value) / 1000;
      }, 250);
      return;
    }
    if (!sending && prevSending) {
      if (nanoTimer != null) window.clearInterval(nanoTimer);
      nanoTimer = null;
    }
  }
);
</script>

<style scoped>
.chat-dock {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(920px, calc(100% - 48px));
  border: 1px solid var(--vscode-border-accent);
  background: transparent;
  box-shadow: var(--dweb-shadow);
  border-radius: 0;
  overflow: hidden;
  transition: border-color 160ms ease;
  user-select: text;
  display: flex;
  flex-direction: column;
}

.chat-dock.collapsed {
  border: none;
  box-shadow: none;
}

.chat-collapsed-handle {
  order: 2;
  width: 140px;
  height: 34px;
  display: grid;
  place-items: center;
  margin: 10px auto;
  border: 1px solid var(--vscode-border-accent);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
  border-radius: 0;
  transition: opacity 180ms ease;
}

.chat-collapsed-handle:hover {
  background: var(--vscode-hover-bg);
}

.chat-dock:not(.collapsed) .chat-collapsed-handle {
  display: none;
}

.chat-content {
  order: 1;
  display: grid;
  grid-template-rows: auto auto;
  /* Avoid clipping on tall screens when history is maximized. */
  max-height: calc(100vh - 24px);
  opacity: 1;
  transform: translateY(0);
  overflow: hidden;
  transition: max-height 220ms ease, opacity 200ms ease, transform 220ms ease;
}

.chat-dock.collapsed .chat-content {
  max-height: 0;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
}

.chat-dock:hover {
  border-color: var(--vscode-hover-border);
}

.chat-history {
  border-bottom: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.52);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  /* 默认高度 600px；但要适配小屏幕 */
  height: min(600px, calc(100vh - 140px));
  display: grid;
  grid-template-rows: auto 1fr;
  transition: height 220ms ease;
  position: relative;
}

.chat-history-body.nanobanana {
  padding: 0;
  user-select: none;
}

.nano-panel {
  display: grid;
  grid-template-columns: 140px 340px 1fr;
  gap: 0;
  min-height: 0;
}

.nano-anchor-col {
  border-right: 1px solid var(--vscode-border);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.nano-anchor-col-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.nano-anchor-col-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  min-height: 0;
  padding-right: 2px;
}

.nano-anchor-item {
  display: grid;
  grid-template-columns: 14px 1fr;
  align-items: center;
  gap: 8px;
}

.nano-anchor-item.hover .nano-ref-dot {
  border-color: var(--vscode-border-accent);
}

.nano-anchor-label {
  font-size: 12px;
  color: var(--vscode-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nano-left {
  border-right: 1px solid var(--vscode-border);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.nano-ref-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-purple);
}

.nano-right {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.nano-field {
  display: grid;
  grid-template-columns: 88px 1fr;
  align-items: center;
  gap: 10px;
}

.nano-label {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.nano-input {
  width: 100%;
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.55);
  color: var(--vscode-fg);
  padding: 6px 8px;
  outline: none;
  border-radius: 0;
}

.nano-input:focus {
  border-color: var(--vscode-border-accent);
}

.nano-hint {
  grid-column: 2;
  font-size: 12px;
  color: var(--vscode-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nano-pro-btn {
  grid-column: 2;
  height: 30px;
  border: 1px solid var(--vscode-border-accent);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
}

.nano-pro-btn:hover {
  background: var(--vscode-hover-bg);
}

.nano-pro-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.nano-billing {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.nano-detail {
  font-size: 12px;
  color: var(--vscode-fg);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.45);
  border: 1px solid var(--vscode-border);
  padding: 8px;
  white-space: pre-wrap;
  line-height: 1.35;
  max-height: 92px;
  overflow: auto;
}

.nano-preview {
  position: relative;
  flex: 1;
  min-height: 240px;
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt-light) r g b / 0.25);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.nano-preview-grid {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.nano-preview-grid.count-1 {
  grid-template-columns: 1fr;
}

.nano-preview-item {
  position: relative;
  min-height: 0;
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.3);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.nano-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.nano-preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.3);
}

.nano-preview-item img.loading {
  filter: blur(6px);
}

.nano-preview-item-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: rgb(from var(--dweb-defualt) r g b / 0.12);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}

.nano-preview-item-loading::before,
.nano-preview-item-loading::after {
  content: "";
  position: absolute;
  inset: -30%;
  background-size: 200% 200%;
  filter: blur(18px);
  transform: translate3d(0, 0, 0);
  will-change: background-position, opacity, transform;
}

.nano-preview-item-loading::before {
  background-image: linear-gradient(
    135deg,
    rgb(from var(--dweb-blue) r g b / 0.85),
    rgb(from var(--dweb-purple-light) r g b / 0.75),
    rgb(from var(--dweb-blue) r g b / 0.85)
  );
  mix-blend-mode: screen;
  animation: nanoPreviewGlassMove 3.2s ease-in-out infinite,
    nanoPreviewGlassFadeA 4.8s ease-in-out infinite;
}

.nano-preview-item-loading::after {
  background-image: linear-gradient(
    135deg,
    rgb(from var(--dweb-pink) r g b / 0.8),
    rgb(from var(--dweb-orange) r g b / 0.78),
    rgb(from var(--dweb-pink) r g b / 0.8)
  );
  mix-blend-mode: screen;
  animation: nanoPreviewGlassMove 3.2s ease-in-out infinite reverse,
    nanoPreviewGlassFadeB 4.8s ease-in-out infinite;
}

@keyframes nanoPreviewGlassMove {
  0% {
    background-position: 0% 20%;
    transform: translate3d(-1.5%, -0.5%, 0) scale(1.02);
  }
  50% {
    background-position: 100% 80%;
    transform: translate3d(1.5%, 0.5%, 0) scale(1.06);
  }
  100% {
    background-position: 0% 20%;
    transform: translate3d(-1.5%, -0.5%, 0) scale(1.02);
  }
}

@keyframes nanoPreviewGlassFadeA {
  0%,
  45% {
    opacity: 0.75;
  }
  55%,
  100% {
    opacity: 0;
  }
}

@keyframes nanoPreviewGlassFadeB {
  0%,
  45% {
    opacity: 0;
  }
  55%,
  100% {
    opacity: 0.75;
  }
}

.nano-preview-empty {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.chat-dock.history-expanded .chat-history {
  /* 仅放大历史区高度，不放大输入区 */
  height: calc(100vh - 140px);
}

.chat-history-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-border);
}

.chat-history-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.chat-history-expand {
  width: 34px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--vscode-border-accent);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
}

.chat-history-minimize {
  width: 34px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--vscode-border-accent);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
}

.chat-history-expand:hover {
  background: var(--vscode-hover-bg);
}

.chat-history-minimize:hover {
  background: var(--vscode-hover-bg);
}

.chat-history-expand svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.chat-history-minimize svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.chat-history-body {
  overflow: auto;
  min-height: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-history-empty {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.chat-history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-msg {
  max-width: min(760px, 86%);
  display: flex;
  flex-direction: column;
}

.chat-msg.user {
  align-self: flex-end;
}

.chat-msg.assistant {
  align-self: flex-start;
}

.chat-msg.system {
  align-self: center;
}

.chat-msg-bubble {
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt-light) r g b / 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 10px 12px;
}

.chat-msg.user .chat-msg-bubble {
  border-color: var(--vscode-border-accent);
}

.chat-history-status {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: 8px 10px;
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.48);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.nano-title-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  margin-left: 8px;
  border: 1px solid var(--vscode-border);
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.chat-msg-role {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  margin-bottom: 6px;
}

.chat-msg-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vscode-fg);
}

.chat-msg.assistant .chat-msg-content {
  user-select: text;
}

.chat-dock-body {
  display: grid;
  grid-template-columns: 1fr 96px;
  grid-template-rows: auto auto;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.52);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.chat-dock-toolbar {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
}

.chat-dock-toolbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-dock-toolbar-label {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.chat-dock-toolbar-select {
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.55);
  color: var(--vscode-fg);
  padding: 6px 8px;
  outline: none;
  border-radius: 0;
}

.chat-dock-toolbar-select:focus {
  border-color: var(--vscode-border-accent);
}

.chat-dock-input {
  resize: none;
  width: 100%;
  border: 1px solid var(--vscode-border);
  background: rgb(from var(--dweb-defualt) r g b / 0.55);
  color: var(--vscode-fg);
  padding: 10px 12px;
  outline: none;
  border-radius: 0;
}

.chat-dock-input:focus {
  border-color: var(--vscode-border-accent);
}

.chat-dock-send {
  border: 1px solid var(--vscode-border-accent);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
  border-radius: 0;
}

.chat-dock-send:hover {
  background: var(--vscode-hover-bg);
}

.chat-dock-send:disabled,
.chat-dock-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
