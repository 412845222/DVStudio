<template>
  <div
    ref="dockRef"
    class="chat-dock"
    data-bp-ui-overlay="true"
    :class="{ 'history-expanded': historyExpanded, collapsed: !!collapsed, 'right-drawer': isRightDrawer }"
    :style="dockStyle"
    @pointerdown.stop
    @wheel.stop
  >
    <button class="chat-collapsed-handle" type="button" @click="requestExpand">
      AI 对话
    </button>

    <div class="chat-content" :aria-hidden="collapsed ? 'true' : 'false'">
      <div class="chat-history">
        <div class="chat-history-bar" @pointerdown.stop="onDockDragStart">
          <div class="chat-history-title">
            <div class="chat-panel-tabs">
              <button
                class="chat-panel-tab"
                :class="{ active: isRegularMode }"
                type="button"
                @pointerdown.stop
                @click.stop="onSwitchPanelMode('regular')"
              >
                常规
              </button>
              <button
                class="chat-panel-tab"
                :class="{ active: isAgentMode }"
                type="button"
                @pointerdown.stop
                @click.stop="onSwitchPanelMode('agent')"
              >
                Agent对话
              </button>
            </div>
            <template v-if="isRegularMode && isVisualGenMode">
              <span>{{ visualPanelTitle }}</span>
              <span class="nano-title-tag">{{ nanoInterfaceLabel }}</span>
              <span v-if="nanoModelTag" class="nano-title-tag"
                >实际：{{ nanoModelTag }}</span
              >
            </template>
            <template v-else-if="isAgentMode">Conversation</template>
            <template v-else>对话历史</template>
          </div>
          <button
            class="chat-history-minimize"
            type="button"
            title="关闭"
            @pointerdown.stop
            @click.stop="requestCollapse"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
            </svg>
          </button>
        </div>
        <div
          ref="historyBodyRef"
          class="chat-history-body"
          :class="{ nanobanana: isVisualGenMode }"
        >
          <template v-if="isRegularMode && isVisualGenMode">
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
                    按 Seedream 接口自动映射输出尺寸；支持参考图 + 文本提示词。
                  </div>
                </div>

                <div class="nano-field" v-if="modelKey === 'nanobanana'">
                  <div class="nano-label">数量</div>
                  <select
                    class="nano-input"
                    :disabled="sending"
                    v-model.number="nanoConfig.quantity"
                  >
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                    <option :value="3">3</option>
                    <option :value="4">4</option>
                  </select>
                </div>

                <SeedanceVideoForm
                  v-if="modelKey === 'seedance'"
                  :config="seedanceConfig"
                  :sending="sending"
                  @update:config="onSeedanceConfigChange"
                />

                <MeshyImageForm
                  v-if="modelKey === 'meshy'"
                  :config="meshyImageConfig"
                  @update:config="onMeshyImageConfigChange"
                />

                <div class="chat-history-status" aria-live="polite">
                  执行状态：{{
                    nanoStatus ||
                    (sending
                      ? modelKey === "seedance"
                        ? "Seedance：生成中…"
                        : "Seedream：生成中…"
                      : modelKey === "seedance"
                      ? "Seedance：待生成"
                      : "Seedream：待生成")
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
                      :class="{ loading: !!slot.loading, 'video-pending': modelKey === 'seedance' && !slot.localReady, 'video-ready': modelKey === 'seedance' && slot.localReady }"
                      :draggable="modelKey === 'seedance' ? !!slot.url && !!slot.localReady : !!slot.url"
                      @dragstart="slot.url ? onNanoPreviewDragStart($event, slot.url, modelKey === 'seedance' ? 'video' : 'image', slot.fallbackUrl, slot.sourcePath, slot.localReady ? slot.url : '', slot.fallbackUrl, slot.downloadStatus, slot.localReady) : undefined"
                    >
                      <template v-if="slot.url">
                        <video
                          v-if="modelKey === 'seedance'"
                          :src="slot.url"
                          controls
                          preload="metadata"
                          draggable="false"
                          class="nano-preview-video"
                        />
                        <img
                          v-else
                          :src="slot.url"
                          :alt="`preview-${idx + 1}`"
                          draggable="false"
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
                      <div v-if="modelKey === 'seedance' && slot.url" class="nano-preview-status">
                        <div class="nano-preview-status-text">
                          {{ slot.localReady ? '已落地到项目资源' : '下载到项目中' }}
                          <span>{{ slot.downloadProgress }}%</span>
                        </div>
                        <div class="nano-preview-progress-track">
                          <div class="nano-preview-progress-fill" :style="{ width: `${slot.downloadProgress}%` }" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isAgentMode">
            <div class="agent-panel">
              <div class="agent-session-bar">
                <div class="agent-session-row">
                  <div class="agent-session-label">对话</div>
                  <button class="codex-mini-btn" type="button" @click="emit('codex-create-session')">
                    New Conversation
                  </button>
                </div>
                <div class="agent-session-controls">
                  <select
                    class="chat-dock-toolbar-select agent-session-select"
                    :value="codexActiveSessionId"
                    @change="onAgentSessionChange"
                  >
                    <option v-if="!codexSessions.length" value="">New Conversation</option>
                    <option v-for="s in codexSessions" :key="s.id" :value="s.id">
                      {{ s.title || 'New Conversation' }}
                    </option>
                  </select>
                  <select
                    class="chat-dock-toolbar-select agent-mode-select"
                    :value="agentMode"
                    @change="onAgentModeChange"
                  >
                    <option value="agent">Agent</option>
                    <option value="ask">Ask</option>
                    <option value="plan">Plan</option>
                  </select>
                  <select
                    class="chat-dock-toolbar-select agent-stream-mode-select"
                    :value="localExecStreamMode"
                    @change="onLocalExecStreamModeChange"
                  >
                    <option value="real">SSE Real</option>
                    <option value="mock">SSE Mock</option>
                  </select>
                  <button
                    class="codex-mini-btn"
                    type="button"
                    :disabled="!codexActiveSessionId"
                    @click.stop="onRenameActiveAgentSession"
                  >
                    改名
                  </button>
                  <button
                    class="codex-mini-btn danger"
                    type="button"
                    :disabled="!codexActiveSessionId"
                    @click.stop="onDeleteActiveAgentSession"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div v-if="!messages?.length" class="agent-empty-state">
                Start a new Agent conversation.
              </div>
              <div v-else class="chat-history-list agent-chat-list">
                <div
                  v-for="m in messages"
                  :key="m.id"
                  class="chat-msg"
                  :class="m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'"
                >
                  <div class="chat-msg-bubble">
                    <div class="chat-msg-role">{{ m.role === "user" ? "你" : m.role === "assistant" ? "Agent" : "系统" }}</div>
                    <div class="chat-msg-content">{{ m.content }}</div>
                  </div>
                </div>
              </div>

              <div v-if="agentApprovalEvents.length" class="agent-flow-list">
                <div
                  v-for="ev in agentApprovalEvents"
                  :key="ev.id"
                  class="codex-flow-item pending"
                >
                  <div class="codex-flow-title">{{ ev.title || '等待审批' }}</div>
                  <div class="codex-flow-meta">
                    {{ agentFlowDetail(ev) || '需要你确认后继续执行' }}
                  </div>
                  <div
                    v-if="ev.approvalRequestId && ev.messageId"
                    class="codex-approval-row"
                  >
                    <button class="codex-mini-btn" type="button" @click="onCodexApproval(ev.messageId!, 'accept')">同意</button>
                    <button class="codex-mini-btn danger" type="button" @click="onCodexApproval(ev.messageId!, 'decline')">拒绝</button>
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

          </template>
        </div>
      </div>

      <div class="chat-dock-body">
        <div v-if="isAgentMode" class="agent-working-dir">
          <span>Working Directory</span>
          <span class="agent-working-dir-path">{{ agentWorkingDirectory }}</span>
        </div>

        <div class="chat-dock-status" aria-live="polite">
          <span class="chat-dock-status-text">{{ displayTaskStatus }}</span>
          <span v-if="showStatusPulse" class="chat-status-dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>

        <textarea
          ref="inputRef"
          :value="modelValue"
          class="chat-dock-input"
          rows="2"
          :placeholder="
            isAgentMode
              ? 'Type a message. Press Enter to send, Shift+Enter for new line.'
              : modelKey === 'nanobanana'
              ? '输入 Seedream 图片提示词（支持参考图）…'
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

        <div class="chat-dock-footer">
          <div class="chat-dock-footer-left">
            <div class="chat-dock-toolbar-item chat-dock-toolbar-item-model">
              <div class="chat-dock-toolbar-label">模型</div>
              <select
                v-if="isAgentMode"
                class="chat-dock-toolbar-select"
                :value="activeModelId"
                :disabled="sending || !modelOptions.length"
                @change="onAgentModelSelectionChange"
              >
                <option v-if="!modelOptions.length" value="">Copilot CLI 默认模型</option>
                <option v-for="model in modelOptions" :key="model.id" :value="model.id">
                  {{ model.label }}
                </option>
              </select>
              <select
                v-else
                class="chat-dock-toolbar-select"
                :value="activeModelId"
                :disabled="sending || !modelOptions.length"
                @change="onModelSelectionChange"
              >
                <option v-if="!modelOptions.length" value="">当前组合暂无模型</option>
                <option v-for="model in modelOptions" :key="model.id" :value="model.id">
                  {{ model.label }}
                </option>
              </select>
            </div>

            <div v-if="!isAgentMode" class="chat-dock-toolbar-item chat-dock-toolbar-item-mini">
              <div class="chat-dock-toolbar-label">来源</div>
              <select
                class="chat-dock-toolbar-select"
                :value="apiSource"
                :disabled="sending"
                @change="onApiSourceChange"
              >
                <option
                  v-for="source in visibleApiSourceOptions"
                  :key="source.value"
                  :value="source.value"
                >
                  {{ source.label }}
                </option>
              </select>
            </div>
          </div>

          <button
            class="chat-dock-send"
            :class="{ stopping: isStoppingState }"
            type="button"
            :disabled="sendButtonDisabled"
            @click="onClickSend"
          >
            {{ sendButtonLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SeedanceVideoForm, { type SeedanceVideoFormConfig } from './SeedanceVideoForm.vue'
import MeshyImageForm, { type MeshyImageConfig } from './MeshyImageForm.vue'
import {
	CHAT_API_SOURCE_OPTIONS,
	CHAT_MODEL_CATALOG,
	getChatModelOptions,
	legacyModelFromNeedType,
	needTypeFromLegacyModel,
	type ChatApiSource,
	type ChatLegacyModelKey,
	type ChatNeedType,
} from '../../ai/models/chatModels'

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
    | "gemini-3-pro-image-preview"
    | "doubao-seedream-4-5-251128"
    | "doubao-seedream-4-0-250828"
    | "doubao-seedream-5-0-260128"
    | "jimeng-image-3.0"
    | "jimeng-image-4.0";
};

export type SeedanceConfig = SeedanceVideoFormConfig;

export type NanoBananaRefAnchor = {
  id: string;
  label: string;
  connected?: boolean;
  connectedFrom?: string;
};

export type LocalExecSource = "copilot-cli" | "legacy-codex";

export type ChatPanelMode = "regular" | "agent";
export type AgentConversationMode = "agent" | "ask" | "plan";

export type LocalExecSessionItem = {
  id: string;
  title: string;
  status?: string;
  modelName?: string;
  source?: LocalExecSource;
};

export type LocalExecFlowEvent = {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  status?: "pending" | "completed" | "failed";
  messageId?: string;
  approvalRequestId?: string;
  source?: LocalExecSource;
  payload?: Record<string, any> | null;
};

export type CodexSessionItem = LocalExecSessionItem;
export type CodexFlowEvent = LocalExecFlowEvent;

const props = defineProps<{
  modelValue: string;
  messages?: BottomChatMessage[];
  sending?: boolean;
  runState?: 'idle' | 'sending' | 'stopping' | 'error';
  collapsed?: boolean;
  taskStatus?: string;
  placement?: 'bottom' | 'right-drawer';
  panelMode?: ChatPanelMode;
  agentMode?: AgentConversationMode;
  localExecStreamMode?: "real" | "mock";
  agentWorkingDirectory?: string;
  modelKey?: ChatLegacyModelKey;
  nanoPreviewUrls?: string[];
  nanoPreviewFallbackUrls?: string[];
  nanoPreviewSourcePaths?: string[];
  nanoPreviewLoadingStates?: boolean[];
  nanoPreviewDownloadStatuses?: string[];
  nanoPreviewDownloadProgresses?: number[];
  nanoPreviewLocalReadyStates?: boolean[];
  nanoPreviewUrl?: string;
  nanoStatus?: string;
  nanoDetail?: string;
  nanoBilling?: string;
  nanoModelUsed?: string;

  nanoAnchorNodeId?: string;
  nanoRefAnchors?: NanoBananaRefAnchor[];
  nanoHoverAnchorId?: string | null;
  codexSessions?: CodexSessionItem[];
  codexActiveSessionId?: string;
  codexFlowEvents?: CodexFlowEvent[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "send"): void;
  (e: "stop"): void;
  (e: "request-expand"): void;
  (e: "request-collapse"): void;
  (e: "focus-input"): void;
  (e: "update:panelMode", v: ChatPanelMode): void;
  (e: "update:agentMode", v: AgentConversationMode): void;
  (e: "update:localExecStreamMode", v: "real" | "mock"): void;
  (e: "update:modelKey", v: ChatLegacyModelKey): void;
  (e: "update:activeModelId", v: string): void;
  (e: "nanobanana-generate", v: { prompt: string; config: NanoBananaConfig }): void;
  (e: "seedance-generate", v: { prompt: string; config: SeedanceConfig }): void;
  (
    e: "workflow-end-link",
    v: { nodeId: string; anchorId: string; anchorIndex: number }
  ): void;
  (e: "codex-create-session"): void;
  (e: "codex-select-session", sessionId: string): void;
  (e: "codex-delete-session", sessionId: string): void;
  (e: "codex-rename-session", v: { sessionId: string; title: string }): void;
  (e: "codex-approval", v: { messageId: string; decision: "accept" | "decline" }): void;
  (e: "layout-changed"): void;
  (e: "safe-area-changed", rect: { width: number; height: number; right: number; top: number }): void;
}>()

const historyExpanded = ref(false);
const historyBodyRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const pendingFocus = ref(false);

const dockRef = ref<HTMLElement | null>(null);
const dockLeftPx = ref<number | null>(null);
let dragCleanup: (() => void) | null = null;

const clampDockLeft = (left: number) => {
  const w = window.innerWidth || 0;
  const rect = dockRef.value?.getBoundingClientRect();
  const half = rect ? rect.width / 2 : 460;
  const min = Math.max(half, 20);
  const max = Math.max(min, w - half);
  return Math.max(min, Math.min(max, left));
};

const dockPlacement = computed(() => (props.placement ?? 'bottom') as 'bottom' | 'right-drawer');
const isRightDrawer = computed(() => dockPlacement.value === 'right-drawer');

const dockStyle = computed(() => {
  if (isRightDrawer.value) return {} as Record<string, string>;
  if (dockLeftPx.value == null) return {} as Record<string, string>;
  return {
    left: `${dockLeftPx.value}px`,
    transform: "translateX(-50%)",
  } as Record<string, string>;
});

const MODEL_CATALOG = CHAT_MODEL_CATALOG;
const apiSourceOptions = CHAT_API_SOURCE_OPTIONS;

const normalizePanelMode = (raw: unknown): ChatPanelMode => {
  const text = String(raw || '').trim().toLowerCase();
  return text === 'agent' ? 'agent' : 'regular';
};

let layoutRaf = 0;
const emitLayoutChanged = () => {
  if (layoutRaf) return;
  layoutRaf = window.requestAnimationFrame(() => {
    layoutRaf = 0;
    emit("layout-changed");
    if (dockPlacement.value === 'right-drawer' && dockRef.value) {
      if (!!props.collapsed) {
        emit('safe-area-changed', {
          width: 0,
          height: 0,
          right: 0,
          top: 0,
        });
        return;
      }
      const rect = dockRef.value.getBoundingClientRect();
      emit('safe-area-changed', {
        width: rect.width,
        height: rect.height,
        right: window.innerWidth - rect.right,
        top: rect.top,
      });
    }
  });
};

const visibleApiSourceOptions = computed(() => {
  if (isAgentMode.value) return apiSourceOptions.filter((item) => item.value === 'local-exec');
  return apiSourceOptions.filter((item) => item.value !== 'local-exec');
});

const modelKey = computed(
  () => (props.modelKey ?? "deepseek") as ChatLegacyModelKey
);

const resolvedPanelMode = computed<ChatPanelMode>(() => {
  if (props.panelMode === 'regular' || props.panelMode === 'agent') {
    return normalizePanelMode(props.panelMode);
  }
  return modelKey.value === 'codex' ? 'agent' : 'regular';
});

const isAgentMode = computed(() => resolvedPanelMode.value === 'agent');
const isRegularMode = computed(() => resolvedPanelMode.value === 'regular');

const agentWorkingDirectory = computed(() => {
  const text = String(props.agentWorkingDirectory || '').trim();
  if (text) return text;
  return '当前项目';
});

const localExecStreamMode = computed<'real' | 'mock'>(() => {
  const mode = String(props.localExecStreamMode || '').trim().toLowerCase();
  return mode === 'mock' ? 'mock' : 'real';
});

const runState = computed<'idle' | 'sending' | 'stopping' | 'error'>(() => {
  const text = String(props.runState || '').trim().toLowerCase();
  if (text === 'sending' || text === 'stopping' || text === 'error') return text;
  return 'idle';
});

const isStoppingState = computed(() => runState.value === 'stopping');
const isSendingState = computed(() => runState.value === 'sending' || (runState.value === 'idle' && !!props.sending));
const showStatusPulse = computed(() => isSendingState.value || isStoppingState.value);

const displayTaskStatus = computed(() => {
  const status = String(props.taskStatus || '').trim();
  if (status) return status;
  if (isStoppingState.value) return '正在停止';
  if (isSendingState.value) return '正在生成';
  if (runState.value === 'error') return '发生错误';
  return '就绪';
});

const sendButtonDisabled = computed(() => {
  if (isStoppingState.value) return true;
  if (isAgentMode.value && isSendingState.value) return false;
  return !!props.sending || (isVisualGenMode.value && !activeModelOption.value);
});

const sendButtonLabel = computed(() => {
  if (isAgentMode.value) {
    if (isStoppingState.value) return '正在停止…';
    if (isSendingState.value) return '停止';
    return '发送';
  }
  if (modelKey.value === 'nanobanana' || modelKey.value === 'seedance') {
    return props.sending ? '生成中…' : '生成';
  }
  return props.sending ? '发送中…' : '发送';
});

const agentMode = computed<AgentConversationMode>(() => {
  const mode = String(props.agentMode || '').trim().toLowerCase();
  if (mode === 'ask' || mode === 'plan') return mode;
  return 'agent';
});

const needType = ref<ChatNeedType>(needTypeFromLegacyModel(modelKey.value));
const apiSource = ref<ChatApiSource>("all");

const isVisualGenMode = computed(
  () => isRegularMode.value && (modelKey.value === "nanobanana" || modelKey.value === "seedance" || modelKey.value === "meshy")
);

const nanoConfig = ref<NanoBananaConfig>({
  aspectRatio: "1:1",
  usePro: false,
  quantity: 1,
  imageModel: "gemini-2.5-flash-image",
});

const seedanceConfig = ref<SeedanceConfig>({
  model: "doubao-seedance-2-0-260128",
  ratio: "adaptive",
  resolution: "",
  refMode: "auto",
  useFrames: false,
  duration: 5,
  frames: '',
  seed: '',
  templateId: '',
  cameraStrength: 'medium',
  generateAudio: false,
  watermark: false,
  cameraFixed: false,
  draft: false,
  returnLastFrame: false,
  serviceTier: '',
  executionExpiresAfter: '',
});

const meshyImageConfig = ref<MeshyImageConfig>({
  prompt: '',
  negativePrompt: '',
  aiModel: 'nano-banana',
  outputImageCount: 1,
  generateMultiView: false,
  aspectRatio: '1:1',
  poseMode: '',
  seed: 0,
});

const onSeedanceConfigChange = (nextConfig: SeedanceConfig) => {
  seedanceConfig.value = { ...nextConfig };
};

const onMeshyImageConfigChange = (nextConfig: MeshyImageConfig) => {
  meshyImageConfig.value = { ...nextConfig };
};

const textModel = ref("auto");

const modelOptions = computed(() => {
  if (isAgentMode.value) {
    return getChatModelOptions('text', 'local-exec');
  }
  return getChatModelOptions(needType.value, apiSource.value);
});

const activeModelId = computed(() => {
  if (isAgentMode.value) return String(textModel.value || "").trim();
  if (needType.value === "image") return String(nanoConfig.value.imageModel || "").trim();
  if (needType.value === "video") return String(seedanceConfig.value.model || "").trim();
  return String(textModel.value || "").trim();
});

const activeModelOption = computed(() => {
  const id = activeModelId.value;
  return modelOptions.value.find((m) => m.id === id) ?? null;
});

watch(
  () => activeModelId.value,
  (v) => {
    emit("update:activeModelId", String(v || "").trim());
  },
  { immediate: true }
);

const applyModelSelection = (modelId: string) => {
  const id = String(modelId || "").trim();
  if (!id) return;
  if (isAgentMode.value) {
    textModel.value = id;
    return;
  }
  if (needType.value === "image") {
    if (
      id === "gemini-2.5-flash-image" ||
      id === "gemini-3.1-flash-image-preview" ||
      id === "gemini-3-pro-image-preview" ||
      id === "doubao-seedream-4-5-251128" ||
      id === "doubao-seedream-4-0-250828" ||
      id === "doubao-seedream-5-0-260128" ||
      id === "jimeng-image-3.0" ||
      id === "jimeng-image-4.0"
    ) {
      nanoConfig.value.imageModel = id;
    }
    return;
  }
  if (needType.value === "video") {
    const isVideoModel = MODEL_CATALOG.some(
      (item) => item.needType === "video" && item.id === id
    );
    if (isVideoModel) {
      seedanceConfig.value.model = id;
    }
    return;
  }
  textModel.value = id;
};

const normalizeModelSelection = () => {
  if (isAgentMode.value) {
    needType.value = 'text';
    if (apiSource.value !== 'local-exec') apiSource.value = 'local-exec';
    const list = modelOptions.value;
    if (!list.length) return;
    if (!list.some((m) => m.id === activeModelId.value)) {
      textModel.value = list[0].id;
    }
    return;
  }

  if (apiSource.value === 'local-exec') {
    apiSource.value = 'all';
  }
  let list = modelOptions.value;
  if (!list.length && apiSource.value !== "all") {
    apiSource.value = "all";
    list = modelOptions.value;
  }
  if (!list.length) return;
  if (!list.some((m) => m.id === activeModelId.value)) {
    applyModelSelection(list[0].id);
  }
};

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
  const fallbackUrls = Array.isArray(props.nanoPreviewFallbackUrls)
    ? props.nanoPreviewFallbackUrls.map((v) => String(v ?? "").trim())
    : [];
  const sourcePaths = Array.isArray(props.nanoPreviewSourcePaths)
    ? props.nanoPreviewSourcePaths.map((v) => String(v ?? "").trim())
    : [];
  const loadingStates = Array.isArray(props.nanoPreviewLoadingStates)
    ? props.nanoPreviewLoadingStates.map((v) => !!v)
    : [];
  const downloadStatuses = Array.isArray(props.nanoPreviewDownloadStatuses)
    ? props.nanoPreviewDownloadStatuses.map((v) => String(v ?? "").trim())
    : [];
  const downloadProgresses = Array.isArray(props.nanoPreviewDownloadProgresses)
    ? props.nanoPreviewDownloadProgresses.map((v) => {
        const n = Number(v ?? 0);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
      })
    : [];
  const localReadyStates = Array.isArray(props.nanoPreviewLocalReadyStates)
    ? props.nanoPreviewLocalReadyStates.map((v) => !!v)
    : [];
  return Array.from({ length: count }, (_, idx) => ({
    url: urls[idx] || "",
    fallbackUrl: fallbackUrls[idx] || "",
    sourcePath: sourcePaths[idx] || "",
    loading: !!loadingStates[idx],
    downloadStatus: downloadStatuses[idx] || "",
    downloadProgress: downloadProgresses[idx] || 0,
    localReady: modelKey.value === 'seedance' ? !!localReadyStates[idx] : true,
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
  if (model === "gemini-2.5-flash-image") return "NanoBanana";
  if (model === "doubao-seedream-4-5-251128") return "Seedream 4.5";
  if (model === "doubao-seedream-4-0-250828") return "Seedream 4.0";
  if (model === "jimeng-image-3.0") return "即梦 图片 3.0";
  if (model === "jimeng-image-4.0") return "即梦 图片 4.0";
  return "Seedream 5.0";
});

const nanoModelTag = computed(() => {
  if (modelKey.value === "seedance") {
    const model = String(props.nanoModelUsed || "").trim();
    if (!model) return "";
    return model;
  }
  const model = String(props.nanoModelUsed || "").trim();
  if (!model) return "";
  if (model === "gemini-3-pro-image-preview") return "NanoBanana Pro";
  if (model === "gemini-3.1-flash-image-preview") return "NanoBanana 2";
  if (model === "gemini-2.5-flash-image") return "NanoBanana";
  if (model === "doubao-seedream-4-5-251128") return "Seedream 4.5";
  if (model === "doubao-seedream-4-0-250828") return "Seedream 4.0";
  if (model === "doubao-seedream-5-0-260128") return "Seedream 5.0";
  if (model === "jimeng-image-3.0") return "即梦 图片 3.0";
  if (model === "jimeng-image-4.0") return "即梦 图片 4.0";
  if (model === "jimeng-video-3.0") return "即梦 视频 3.0";
  if (model === "jimeng-video-3.0-pro") return "即梦 视频 3.0 Pro";
  return model;
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
    const secBase = seedanceConfig.value.useFrames
      ? Math.max(2, Math.floor((Number(seedanceConfig.value.frames || 121) || 121) / 24))
      : Math.max(2, Number(seedanceConfig.value.duration || 5) || 5)
    const sec = Math.max(8, secBase * 3);
    return `${sec}-${sec + 24}s（估算）`;
  }
  // No official ETA API. Provide a lightweight heuristic based on ref count.
  const n = nanoConnectedCount.value;
  const low = 8 + n * 2;
  const high = 25 + n * 4;
  return `${low}-${high}s（估算）`;
});

const onDockDragStart = (ev: PointerEvent) => {
  if (isRightDrawer.value) return;
  ev.stopPropagation();
  const target = ev.target as HTMLElement | null;
  // Don't hijack clicks on interactive controls.
  if (target?.closest("button,select,input,textarea,a")) return;
  if (!dockRef.value) return;

  ev.preventDefault();

  const handle = ev.currentTarget as HTMLElement | null;
  if (!handle) return;

  try {
    handle.setPointerCapture(ev.pointerId);
  } catch {
    // ignore
  }

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
    try {
      handle.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
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
    if (!isAgentMode.value) {
      needType.value = needTypeFromLegacyModel(modelKey.value);
    }
    normalizeModelSelection();
    void scrollHistoryToBottom();
    void nextTick().then(() => emitLayoutChanged());
  }
);

watch(
  () => [needType.value, apiSource.value, resolvedPanelMode.value] as const,
  () => {
    normalizeModelSelection();
  },
  { immediate: true }
);

watch(
  () => resolvedPanelMode.value,
  (mode) => {
    if (mode === 'agent') {
      needType.value = 'text';
      if (apiSource.value !== 'local-exec') apiSource.value = 'local-exec';
      if (modelKey.value !== 'codex') emit('update:modelKey', 'codex');
    } else {
      if (apiSource.value === 'local-exec') apiSource.value = 'all';
      if (modelKey.value === 'codex') emit('update:modelKey', 'deepseek');
    }
    normalizeModelSelection();
    void nextTick().then(() => emitLayoutChanged());
  },
  { immediate: true }
);

watch(
  () => !!props.collapsed,
  (v) => {
    void nextTick().then(() => emitLayoutChanged());
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

const onNeedTypeChange = (e: Event) => {
  if (!isRegularMode.value) return;
  const v = String((e.target as HTMLSelectElement).value || "text");
  const nextNeedType =
    v === "image" ? "image" : v === "video" ? "video" : "text";
  needType.value = nextNeedType;
  const legacy = legacyModelFromNeedType(nextNeedType);
  emit("update:modelKey", legacy);
};

const onApiSourceChange = (e: Event) => {
  if (!isRegularMode.value) return;
  const v = String((e.target as HTMLSelectElement).value || "all");
  apiSource.value =
    v === "deepseek"
      ? "deepseek"
      : v === "gemini"
      ? "gemini"
      : v === "bytedance"
      ? "bytedance"
      : "all";
  normalizeModelSelection();
};

const onModelSelectionChange = (e: Event) => {
  if (!isRegularMode.value) return;
  const id = String((e.target as HTMLSelectElement).value || "").trim();
  if (!id) return;
  applyModelSelection(id);
  const selected = modelOptions.value.find((m) => m.id === id);
  if (selected && selected.legacyModelKey !== modelKey.value) {
    emit("update:modelKey", selected.legacyModelKey);
  }
};

const onAgentModelSelectionChange = (e: Event) => {
  const id = String((e.target as HTMLSelectElement).value || '').trim();
  if (!id) return;
  textModel.value = id;
  emit('update:modelKey', 'codex');
};

const onSwitchPanelMode = (mode: ChatPanelMode) => {
  if (mode === resolvedPanelMode.value) return;
  emit('update:panelMode', mode);
};

const onLocalExecStreamModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value || '').trim().toLowerCase();
  emit('update:localExecStreamMode', value === 'mock' ? 'mock' : 'real');
};

const onAgentModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value || '').trim().toLowerCase();
  emit('update:agentMode', value === 'ask' || value === 'plan' ? value : 'agent');
};

const emitGenerate = () => {
  const prompt = String(props.modelValue || "").trim();
  if (!prompt) return;
  if (!activeModelOption.value) return;
  if (modelKey.value === "seedance") {
    emit("seedance-generate", {
      prompt,
      config: { ...seedanceConfig.value },
    });
    return;
  }
  // Meshy 图片生成分支
  if (modelKey.value === "meshy") {
    const quantity = normalizedNanoQuantity.value as 1 | 2 | 3 | 4;
    emit("nanobanana-generate", {
      prompt,
      config: {
        ...nanoConfig.value,
        imageModel: 'meshy',
        meshyImageAiModel: meshyImageConfig.value.aiModel || 'nano-banana',
        meshyAspectRatio: meshyImageConfig.value.aspectRatio || '1:1',
        meshyPoseMode: meshyImageConfig.value.poseMode || '',
        meshyGenerateMultiView: meshyImageConfig.value.generateMultiView || false,
        meshyOutputImageCount: meshyImageConfig.value.outputImageCount || 1,
        quantity,
      } as any,
    });
    return;
  }
  const selected = String(nanoConfig.value.imageModel || "").trim();
  const imageModel =
    selected === "gemini-2.5-flash-image"
      ? "gemini-2.5-flash-image"
      : selected === "gemini-3.1-flash-image-preview"
      ? "gemini-3.1-flash-image-preview"
      : selected === "gemini-3-pro-image-preview"
      ? "gemini-3-pro-image-preview"
      : selected === "doubao-seedream-4-5-251128"
      ? "doubao-seedream-4-5-251128"
      : selected === "doubao-seedream-4-0-250828"
      ? "doubao-seedream-4-0-250828"
      : selected === "jimeng-image-3.0"
      ? "jimeng-image-3.0"
      : selected === "jimeng-image-4.0"
      ? "jimeng-image-4.0"
      : "doubao-seedream-4-5-251128";
  const usePro = imageModel === "gemini-3-pro-image-preview";
  const quantity = normalizedNanoQuantity.value as 1 | 2 | 3 | 4;
  emit("nanobanana-generate", {
    prompt,
    config: { ...nanoConfig.value, imageModel, usePro, quantity },
  });
};

const onEnterSend = () => {
  if (isAgentMode.value && isSendingState.value) {
    if (!isStoppingState.value) emit('stop');
    return;
  }
  if (isRegularMode.value && (modelKey.value === "nanobanana" || modelKey.value === "seedance" || modelKey.value === "meshy")) emitGenerate();
  else emit("send");
};

const onClickSend = () => {
  if (isAgentMode.value && isSendingState.value) {
    if (!isStoppingState.value) emit('stop');
    return;
  }
  if (isRegularMode.value && (modelKey.value === "nanobanana" || modelKey.value === "seedance" || modelKey.value === "meshy")) emitGenerate();
  else emit("send");
};

const visualPanelTitle = computed(() =>
  modelKey.value === "seedance" ? "Seedance 生视频" : "图片生成"
);

const onNanoPreviewDragStart = (
  e: DragEvent,
  inputUrl?: string,
  kind: "image" | "video" = "image",
  fallbackUrl?: string,
  sourcePath?: string,
  localUrl?: string,
  remoteUrl?: string,
  downloadStatus?: string,
  localReady?: boolean,
) => {
  const url = String(inputUrl || "").trim();
  const backupUrl = String(fallbackUrl || "").trim();
  const localSourcePath = String(sourcePath || "").trim();
  const localVideoUrl = String(localUrl || "").trim();
  const remoteVideoUrl = String(remoteUrl || "").trim();
  const statusText = String(downloadStatus || "").trim();
  const isLocalReady = !!localReady;
  if (kind === 'video' && (!isLocalReady || !localVideoUrl)) {
    e.preventDefault();
    return;
  }
  if (!url) return;
  try {
    e.dataTransfer?.setData("application/x-dweb-nanobanana-preview", url);
    e.dataTransfer?.setData(
      "application/x-dweb-nanobanana-preview-meta",
      JSON.stringify({
        url,
        kind,
        fallbackUrl: backupUrl || undefined,
        sourcePath: localSourcePath || undefined,
        localUrl: localVideoUrl || undefined,
        remoteUrl: remoteVideoUrl || undefined,
        downloadStatus: statusText || undefined,
        localReady: isLocalReady,
      })
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

const codexSessions = computed(() =>
  Array.isArray(props.codexSessions) ? props.codexSessions : []
);
const codexFlowEvents = computed(() =>
  Array.isArray(props.codexFlowEvents) ? props.codexFlowEvents : []
);

const agentApprovalEvents = computed(() =>
  codexFlowEvents.value
    .filter((item) => {
      const kind = String(item?.kind || '').trim();
      return kind === 'approval' && !!String(item?.approvalRequestId || '').trim();
    })
    .slice(-3)
);

const agentFlowDetail = (ev: CodexFlowEvent) => {
  const direct = String(ev.detail || '').trim();
  if (direct) return direct;
  const payloadValue = (ev.payload || {}) as Record<string, any>;
  if (ev.kind === 'command' && Array.isArray(payloadValue.command)) {
    return payloadValue.command.map((item: unknown) => String(item || '')).join(' ').trim();
  }
  if (ev.kind === 'fileChange' && Array.isArray(payloadValue.changes)) {
    return `${payloadValue.changes.length} 项`;
  }
  return '';
};
const codexActiveSessionId = computed(() =>
  String(props.codexActiveSessionId || "").trim()
);

const onSelectCodexSession = (sessionId: string) => {
  const id = String(sessionId || "").trim();
  if (!id) return;
  emit("codex-select-session", id);
};

const onAgentSessionChange = (e: Event) => {
  const id = String((e.target as HTMLSelectElement).value || '').trim();
  if (!id) return;
  onSelectCodexSession(id);
};

const onRenameCodexSession = (sessionId: string, currentTitle: string) => {
  const id = String(sessionId || '').trim();
  if (!id) return;
  const next = window.prompt('请输入新的会话名称', String(currentTitle || '').trim() || 'Copilot CLI 会话');
  if (next == null) return;
  const title = String(next || '').trim();
  if (!title) return;
  emit('codex-rename-session', { sessionId: id, title });
};

const onCodexApproval = (messageId: string, decision: "accept" | "decline") => {
  const id = String(messageId || "").trim();
  if (!id) return;
  emit("codex-approval", { messageId: id, decision });
};

const onRenameActiveAgentSession = () => {
  const sid = codexActiveSessionId.value;
  if (!sid) return;
  const item = codexSessions.value.find((s) => String(s.id || '').trim() === sid);
  onRenameCodexSession(sid, item?.title || 'Copilot CLI 会话');
};

const onDeleteActiveAgentSession = () => {
  const sid = codexActiveSessionId.value;
  if (!sid) return;
  emit('codex-delete-session', sid);
};

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

const onWindowResize = () => {
  if (dockLeftPx.value == null) return;
  dockLeftPx.value = clampDockLeft(dockLeftPx.value);
  emitLayoutChanged();
};

onMounted(() => {
  window.addEventListener("resize", onWindowResize, { passive: true });
  emitLayoutChanged();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowResize);
  if (dragCleanup) {
    dragCleanup();
    dragCleanup = null;
  }
  if (layoutRaf) {
    window.cancelAnimationFrame(layoutRaf);
    layoutRaf = 0;
  }
  if (nanoTimer != null) {
    window.clearInterval(nanoTimer);
    nanoTimer = null;
  }
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
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 96%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
    0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent),
    0 14px 36px rgba(0, 0, 0, 0.4);
  border-radius: 0;
  overflow: hidden;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
  user-select: text;
  display: flex;
  flex-direction: column;
  z-index: 101;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}

.chat-dock:not(.collapsed)::before,
.chat-dock:not(.collapsed)::after {
  content: "";
  position: absolute;
  pointer-events: none;
  z-index: 10;
  width: 14px;
  height: 14px;
  border: 2px solid var(--wf-primary, #1f9d84);
  box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.chat-dock:not(.collapsed)::before {
  top: -2px;
  left: -2px;
  border-right: none;
  border-bottom: none;
}

.chat-dock:not(.collapsed)::after {
  bottom: -2px;
  right: -2px;
  border-left: none;
  border-top: none;
}

.chat-dock:hover {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.chat-dock.right-drawer {
  position: fixed;
  left: auto;
  right: 10px;
  top: var(--aiwf-safe-top, 0px);
  bottom: 10px;
  transform: translateX(0);
  width: min(520px, calc(100vw - 20px));
  height: calc(100vh - var(--aiwf-safe-top, 0px) - 10px);
  max-height: none;
  border-radius: 0;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
    -12px 12px 36px rgba(0, 0, 0, 0.42),
    0 0 32px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
  flex-direction: column;
  z-index: 120;
}

.chat-dock.collapsed {
  border: none;
  box-shadow: none;
  width: auto;
  height: auto;
  background: transparent;
  overflow: visible;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.chat-dock.right-drawer.collapsed {
  top: var(--aiwf-safe-top, 0px);
  right: 10px;
  bottom: 10px;
  width: min(520px, calc(100vw - 20px));
  height: calc(100vh - var(--aiwf-safe-top, 0px) - 10px);
  max-height: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.chat-collapsed-handle {
  order: 2;
  width: 140px;
  height: 34px;
  display: grid;
  place-items: center;
  margin: 10px auto;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 90%, transparent);
  color: var(--wf-primary, #1f9d84);
  cursor: pointer;
  border-radius: 2px;
  transition: border-color 220ms ease, color 220ms ease, background-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease;
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.chat-dock.right-drawer.collapsed .chat-collapsed-handle {
  pointer-events: auto;
  margin: 0;
  position: absolute;
  right: calc(12px + var(--chat-collapsed-safe-right-offset, 0px));
  bottom: 16px;
  min-width: 140px;
  box-shadow: 0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.chat-collapsed-handle:hover {
  border-color: var(--wf-primary, #1f9d84);
  color: var(--wf-primary, #1f9d84);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
}

.chat-dock:not(.collapsed) .chat-collapsed-handle {
  display: none;
}

.chat-content {
  order: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Avoid clipping on tall screens when history is maximized. */
  max-height: calc(100vh - 24px);
  opacity: 1;
  transform: translateY(0);
  overflow: hidden;
  transition: max-height 220ms ease, opacity 200ms ease, transform 220ms ease;
}

.chat-dock.right-drawer .chat-content {
  height: 100%;
  max-height: none;
  min-height: 0;
  transform: translateX(0);
  background: transparent;
  transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.chat-dock.collapsed .chat-content {
  max-height: 0;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
}

.chat-dock.right-drawer.collapsed .chat-content {
  max-height: none;
  transform: translateX(100%);
  opacity: 0;
  pointer-events: none;
}

.chat-history {
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 90%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  flex: 1;
  min-height: 220px;
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
  border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.nano-anchor-col-title {
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
  letter-spacing: 0.5px;
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
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.nano-anchor-label {
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nano-left {
  border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.nano-ref-dot {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.nano-right {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.codex-panel {
  display: grid;
  grid-template-columns: 240px 1fr 300px;
  min-height: 0;
  height: 100%;
}

.codex-col {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.codex-sessions-col,
.codex-chat-col {
  border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.codex-col-head {
  padding: 10px;
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  letter-spacing: 0.5px;
}

.codex-sessions-list,
.codex-flow-list {
  padding: 8px;
  overflow: auto;
  min-height: 0;
}

.codex-session-item {
  width: 100%;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  padding: 6px;
  margin-bottom: 8px;
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.codex-session-main {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 2px;
}

.codex-session-actions {
  margin-top: 6px;
  display: flex;
  gap: 6px;
}

.codex-session-item.active {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-session-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wf-primary, #1f9d84);
}

.codex-session-meta,
.codex-flow-meta {
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  margin-top: 2px;
}

.codex-chat-list {
  padding-right: 8px;
}

.codex-flow-item {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  padding: 8px;
  margin-bottom: 8px;
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.codex-flow-item.completed {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-flow-item.failed {
  border-color: color-mix(in srgb, #b34a4a 65%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, #b34a4a 35%, transparent);
}

.codex-flow-title {
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
}

.codex-approval-row {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}

.codex-mini-btn {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: border-color 220ms ease, color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.codex-mini-btn:hover {
  border-color: var(--wf-primary, #1f9d84);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-mini-btn.danger {
  border-color: color-mix(in srgb, #b34a4a 55%, transparent);
  color: color-mix(in srgb, #e88a8a 90%, transparent);
}

.codex-mini-btn.danger:hover {
  border-color: #b34a4a;
  color: #e88a8a;
  box-shadow: 0 0 8px color-mix(in srgb, #b34a4a 40%, transparent);
}

.codex-empty {
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  font-size: 12px;
  padding: 10px 4px;
}

@media (max-width: 1200px) {
  .codex-panel {
    grid-template-columns: 200px 1fr 240px;
  }
}

@media (max-width: 900px) {
  .codex-panel {
    grid-template-columns: 1fr;
  }

  .codex-sessions-col,
  .codex-chat-col {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  }
}

.nano-field {
  display: grid;
  grid-template-columns: 88px 1fr;
  align-items: center;
  gap: 10px;
}

.nano-label {
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.nano-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  padding: 6px 8px;
  outline: none;
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.nano-input:focus {
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.nano-hint {
  grid-column: 2;
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  white-space: nowrap;
  min-height: 24px;
  padding: 3px 6px;
  border: 1px dashed color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 5%, transparent);
  font-size: 10px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
}

.nano-pro-btn {
  grid-column: 2;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
  color: var(--wf-primary, #1f9d84);
  cursor: pointer;
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.nano-pro-btn:hover {
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.nano-pro-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.nano-billing {
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.nano-detail {
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  padding: 8px;
  white-space: pre-wrap;
  line-height: 1.35;
  max-height: 92px;
  overflow: auto;
  border-radius: 2px;
}

.nano-preview {
  position: relative;
  flex: 1;
  min-height: 240px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 2px;
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
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 90%, transparent);
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 2px;
}

.nano-preview-item.video-pending {
  cursor: progress;
}

.nano-preview-item.video-ready {
  cursor: grab;
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
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.nano-preview-status {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.72));
}

.nano-preview-status-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #f3f5f7;
}

.nano-preview-progress-track {
  width: 100%;
  height: 6px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.nano-preview-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent), var(--wf-primary, #1f9d84));
  box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
}

.chat-dock.history-expanded .chat-history {
  min-height: 320px;
}

.chat-history-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  touch-action: none;
  user-select: none;
}

.chat-history-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
}

.chat-panel-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  border-radius: 2px;
}

.chat-panel-tab {
  border: 1px solid transparent;
  background: transparent;
  color: color-mix(in srgb, var(--wf-text, #edf2f4) 60%, transparent);
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 2px;
  transition: border-color 220ms ease, background-color 220ms ease, color 220ms ease, box-shadow 220ms ease;
}

.chat-panel-tab:hover {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
  color: var(--wf-primary, #1f9d84);
}

.chat-panel-tab.active {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
}

.chat-history-minimize {
  width: 34px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  border-radius: 2px;
  cursor: pointer;
  transition: border-color 220ms ease, color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.chat-history-minimize:hover {
  border-color: var(--wf-primary, #1f9d84);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-history-minimize svg {
  width: 18px;
  height: 18px;
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
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.agent-session-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.agent-session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-session-label {
  font-size: 12px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.agent-session-controls {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto auto auto;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.agent-session-select {
  width: 100%;
  min-width: 160px;
}

.agent-mode-select {
  min-width: 84px;
}

.agent-stream-mode-select {
  min-width: 92px;
}

.agent-session-controls .codex-mini-btn {
  min-width: 44px;
  padding: 3px 6px;
}

.agent-empty-state {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.agent-chat-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}

.agent-runtime-card {
  margin: 0 10px 10px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.agent-runtime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.agent-runtime-title {
  font-size: 12px;
  color: var(--wf-primary, #1f9d84);
  font-weight: 600;
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-runtime-mode {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  padding: 2px 8px;
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-text, #edf2f4) 70%, transparent);
  border-radius: 2px;
}

.agent-runtime-mode.mock {
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-runtime-meta {
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.agent-runtime-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-skill-badge {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 2px;
}

.agent-skill-list {
  margin: 0 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-skill-card {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  padding: 8px;
  border-radius: 2px;
}

.agent-skill-card.completed {
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-skill-card.failed {
  border-color: #e57373;
  box-shadow: 0 0 8px color-mix(in srgb, #e57373 30%, transparent);
}

.agent-skill-title {
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
}

.agent-skill-meta {
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  margin-top: 4px;
}

.agent-flow-list {
  max-height: 128px;
  overflow: auto;
  padding: 0 8px 8px;
  border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.chat-msg {
  max-width: min(720px, 84%);
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
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 8px 10px;
  border-radius: 2px;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.chat-msg.user .chat-msg-bubble {
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent);
}

.chat-dock-status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  padding: 0 1px;
  margin-top: 0;
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-dock-status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status-dots {
  display: inline-flex;
  letter-spacing: 1px;
}

.chat-status-dots span {
  animation: chatStatusDotFade 1.2s infinite ease-in-out;
  color: var(--wf-primary, #1f9d84);
  text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.chat-status-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.chat-status-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

.nano-title-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  margin-left: 8px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  font-size: 11px;
  color: var(--wf-primary, #1f9d84);
  border-radius: 2px;
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-msg-role {
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  margin-bottom: 4px;
}

.chat-msg-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
  color: var(--wf-text, #edf2f4);
}

.chat-msg.assistant .chat-msg-content {
  user-select: text;
}

.chat-dock-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto;
  flex-shrink: 0;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.chat-dock-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.chat-dock-footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.chat-dock-toolbar-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-dock-toolbar-item-model {
  min-width: 200px;
  flex: 1;
}

.chat-dock-toolbar-item-mini {
  min-width: 84px;
}

.chat-dock-toolbar-label {
  font-size: 11px;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-dock-model-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-dock-footer .chat-dock-toolbar-item-model,
.chat-dock-footer .chat-dock-toolbar-item-mini {
  flex-shrink: 0;
}

.agent-working-dir {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 6px;
  border: 1px dashed color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  font-size: 10px;
  line-height: 1.25;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
  border-radius: 2px;
}

.agent-working-dir > span:first-child {
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.agent-working-dir-path {
  color: var(--wf-primary, #1f9d84);
  font-size: 11px;
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-dock-toolbar-select {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  padding: 4px 8px;
  outline: none;
  border-radius: 2px;
  font-size: 11px;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.chat-dock-toolbar-select:focus {
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-dock-input {
  resize: none;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21,24,28,0.9)) 88%, transparent);
  color: var(--wf-text, #edf2f4);
  padding: 8px 10px;
  outline: none;
  border-radius: 2px;
  font-size: 12px;
  line-height: 1.35;
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
}

.chat-dock-input:focus {
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.chat-dock-send {
  border: 1px solid var(--wf-primary, #1f9d84);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 14%, transparent);
  color: var(--wf-primary, #1f9d84);
  cursor: pointer;
  border-radius: 2px;
  padding: 0 12px;
  font-size: 11px;
  min-width: 72px;
  height: 28px;
  text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease, color 220ms ease;
}

.chat-dock-send.stopping {
  border-color: #e57373;
  background: color-mix(in srgb, #e57373 14%, transparent);
  color: #e57373;
  text-shadow: 0 0 4px color-mix(in srgb, #e57373 30%, transparent);
}

.chat-dock-send:hover {
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.chat-dock-send:disabled,
.chat-dock-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@keyframes chatStatusDotFade {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-1px);
  }
}
</style>
