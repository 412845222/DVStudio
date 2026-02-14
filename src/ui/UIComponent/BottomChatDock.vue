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
            <template v-if="modelKey === 'nanobanana'">
              <span>NanoBanana</span>
              <span class="nano-title-tag">{{ nanoProSelected ? "Pro" : "普通" }}</span>
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
          :class="{ nanobanana: modelKey === 'nanobanana' }"
        >
          <template v-if="modelKey === 'nanobanana'">
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
                <div class="nano-field">
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
                    尺寸使用 NanoBanana 默认值（不需要手写宽高）。
                  </div>
                  <button
                    class="nano-pro-btn"
                    type="button"
                    :disabled="sending"
                    @click="toggleNanoPro"
                  >
                    {{ nanoProSelected ? "切回普通" : "使用 NanoBananaPro" }}
                  </button>
                </div>

                <div class="chat-history-status" aria-live="polite">
                  执行状态：{{
                    nanoStatus || (sending ? "NanoBanana：生成中…" : "NanoBanana：待生成")
                  }}
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
                  <img
                    v-if="nanoPreviewUrl"
                    :src="nanoPreviewUrl"
                    alt="preview"
                    draggable="true"
                    @dragstart="onNanoPreviewDragStart"
                    :class="{ loading: !!sending }"
                  />
                  <div v-if="sending" class="nano-preview-loading" aria-hidden="true" />
                  <div v-else class="nano-preview-empty">暂无预览图</div>
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
              <option value="nanobanana">NanoBanana</option>
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
              ? '输入生成图片的提示词（Prompt）…'
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
              ? modelKey === "nanobanana"
                ? "生成中…"
                : "发送中…"
              : modelKey === "nanobanana"
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
  modelKey?: "deepseek" | "nanobanana";
  nanoPreviewUrl?: string;
  nanoStatus?: string;
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
  (e: "update:modelKey", v: "deepseek" | "nanobanana"): void;
  (e: "nanobanana-generate", v: { prompt: string; config: NanoBananaConfig }): void;
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
  () => (props.modelKey ?? "deepseek") as "deepseek" | "nanobanana"
);

const nanoConfig = ref<NanoBananaConfig>({
  aspectRatio: "1:1",
  usePro: false,
});

const nanoProSelected = computed(() => !!nanoConfig.value.usePro);

const nanoModelTag = computed(() => {
  const model = String(props.nanoModelUsed || "").trim();
  if (!model) return "";
  return model === "gemini-3-pro-image-preview" ? "Pro" : "普通";
});

const toggleNanoPro = () => {
  nanoConfig.value = { ...nanoConfig.value, usePro: !nanoConfig.value.usePro };
};

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
  const next = (v === "nanobanana" ? "nanobanana" : "deepseek") as
    | "deepseek"
    | "nanobanana";
  emit("update:modelKey", next);
};

const emitGenerate = () => {
  const prompt = String(props.modelValue || "").trim();
  if (!prompt) return;
  emit("nanobanana-generate", { prompt, config: { ...nanoConfig.value } });
};

const onEnterSend = () => {
  if (modelKey.value === "nanobanana") emitGenerate();
  else emit("send");
};

const onClickSend = () => {
  if (modelKey.value === "nanobanana") emitGenerate();
  else emit("send");
};

const onNanoPreviewDragStart = (e: DragEvent) => {
  const url = String(props.nanoPreviewUrl || "").trim();
  if (!url) return;
  try {
    e.dataTransfer?.setData("application/x-dweb-nanobanana-preview", url);
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
    const isNano = (mk ?? "deepseek") === "nanobanana";
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

.nano-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.nano-preview img.loading {
  filter: blur(6px);
}

.nano-preview-loading {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgb(from var(--dweb-defualt) r g b / 0.12);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}

.nano-preview-loading::before,
.nano-preview-loading::after {
  content: "";
  position: absolute;
  inset: -30%;
  background-size: 200% 200%;
  filter: blur(18px);
  transform: translate3d(0, 0, 0);
  will-change: background-position, opacity, transform;
}

.nano-preview-loading::before {
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

.nano-preview-loading::after {
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
