<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import {
  cleanupOldProject,
  clearBackendLogs,
  getBackendBaseUrl,
  getBackendLogs,
  getBackendStatus,
  getSetupState,
  isElectron,
  pingBackend,
  restartBackend,
  revealUserDataDir,
  runSetupWorkflow,
  startBackend,
} from "../electronBridge";

import { usePlatform } from "../platformBridge";
import { useI18n } from "../i18n";

import EnvCheckList from "../ui/Electron/EnvCheckList.vue";
import CommandConsole from "../ui/Electron/CommandConsole.vue";
import type { SetupState, SetupStep } from "../electronBridge/types";

const { t } = useI18n();

type EnvItem = {
  key: string;
  label: string;
  status: "ok" | "warn" | "error" | "unknown" | "running";
  detail?: string;
  progress?: number;
  retrying?: boolean;
  canRetry?: boolean;
};

const baseUrl = ref("");
const backendRunning = ref(false);
const backendLastError = ref("");
const backendPort = ref<number | null>(null);
const setupState = ref<SetupState>({ running: false, updatedAt: 0, steps: [] });
const retryingStepKey = ref("");
const startupSetupHintVisible = ref(false);
const startupSetupCompletedHintVisible = ref(false);

const pingOk = ref<"ok" | "error" | "unknown">("unknown");
const pingDetail = ref("");

const logLines = ref<string[]>([]);
const logTotal = ref(0);
const logBuffering = ref(false);
const logQueueSize = ref(0);
const backendActionBusy = ref<"" | "start" | "restart">("");
let backendActionLastAt = 0;

const LOG_VISIBLE_MAX = 1200;
const LOG_FLUSH_CHUNK = 24;
const LOG_FLUSH_INTERVAL_MS = 90;
const BACKEND_ACTION_DEBOUNCE_MS = 1200;

const pendingLogQueue: string[] = [];
let statusLogsPollTimer: number | null = null;
let pingTimer: number | null = null;
let logFlushTimer: number | null = null;

const router = useRouter();

const {
  status: platformStatus,
  isSteam: platformIsSteam,
  isMock: platformIsMock,
  isRealPlatform: platformIsReal,
  displayName: platformDisplayName,
  overlayEnabled: platformOverlayEnabled,
} = usePlatform();

const platformStatusClass = computed(() => {
  const s = platformStatus.value;
  if (!s) return "unknown";
  if (s.available && s.initialized && s.loggedIn) return "ok";
  if (s.available && !s.loggedIn) return "warn";
  return "mock";
});

const platformStatusText = computed(() => {
  const s = platformStatus.value;
  if (!s) return t("welcome.platformDetecting");
  if (platformIsSteam.value) {
    return s.user?.displayName ? `Steam: ${s.user.displayName}` : "Steam";
  }
  if (platformIsReal.value) return platformDisplayName.value;
  return t("welcome.platformMockMode");
});

const platformHintText = computed(() => {
  const s = platformStatus.value;
  if (!s) return "";
  if (platformIsMock.value) {
    return t("welcome.platformMockHint");
  }
  if (platformIsSteam.value && !s.loggedIn) {
    return t("welcome.platformSteamNotLoggedIn");
  }
  if (platformIsSteam.value && s.loggedIn) {
    return t("welcome.platformSteamLoggedIn", { name: s.user?.displayName || t("welcome.platformSteamUserUnknown") });
  }
  return "";
});

const envItems = computed<EnvItem[]>(() => {
  const steps = setupState.value.steps || [];
  return steps.map((s: SetupStep) => ({
    key: s.key,
    label: s.label,
    status: s.status,
    detail: s.detail || "",
    progress: s.progress,
    retrying: retryingStepKey.value === s.key,
    canRetry: s.status === "error" && !setupState.value.running,
  }));
});

const backendStatusText = computed(() => {
  if (backendRunning.value) return t("welcome.runningOnPort", { port: backendPort.value ?? "-" });
  if (backendLastError.value) return t("welcome.notRunningWithError", { error: backendLastError.value });
  return t("welcome.notRunning");
});

const setupProgressText = computed(() => {
  if (setupState.value.running) return t("welcome.preparingEnv");
  const hasError = setupState.value.steps.some((s) => s.status === "error");
  if (hasError) return t("welcome.someItemsFailed");
  return t("welcome.envSetupComplete");
});

const startupSetupHintText = computed(() => {
  if (setupState.value.running) {
    return t("welcome.startupPreparing");
  }
  if (startupSetupCompletedHintVisible.value) {
    return t("welcome.startupAlreadyChecked");
  }
  return "";
});

const isReadyToEnter = computed(() => backendRunning.value && pingOk.value === "ok");

const logStatusText = computed(() => {
  const shown = logLines.value.length;
  const queue = logQueueSize.value;
  if (queue > 0) return t("welcome.showingLinesBuffered", { shown, queue });
  return t("welcome.showingLines", { shown });
});

async function refreshBaseUrl() {
  baseUrl.value = await getBackendBaseUrl();
}

async function refreshBackendStatus() {
  const st = await getBackendStatus();
  if (!st) return;
  backendRunning.value = !!st.running;
  backendLastError.value = st.lastError || "";
  backendPort.value = typeof st.port === "number" ? st.port : null;
  if (st.baseUrl) baseUrl.value = st.baseUrl;
}

async function refreshPing() {
  if (!backendRunning.value) {
    pingOk.value = "unknown";
    pingDetail.value = "";
    return;
  }
  const r = await pingBackend();
  if (r.ok) {
    pingOk.value = "ok";
    pingDetail.value = `HTTP ${r.status}`;
  } else {
    pingOk.value = "error";
    pingDetail.value = r.error || "Ping failed";
  }
}

function schedulePing(delayMs: number) {
  if (pingTimer != null) window.clearTimeout(pingTimer);
  pingTimer = window.setTimeout(async () => {
    await refreshPing();
    const nextDelay = isReadyToEnter.value ? 30_000 : 6_000;
    schedulePing(nextDelay);
  }, delayMs);
}

async function refreshLogs() {
  const r = await getBackendLogs({ since: logTotal.value });
  if (!r?.ok) return;
  if (r.lines?.length) enqueueLogs(r.lines);
  logTotal.value = r.total;

  if (r.baseUrl) baseUrl.value = r.baseUrl;
  backendRunning.value = r.running;
  backendLastError.value = r.lastError || "";
  backendPort.value = r.port;
}

function isCmdProgressLine(line: string): { key: string } | null {
  const m = String(line || "").match(/^\[cmd\]\s+\[[^\]]+\]\s+(.+?)\s+\(\d+s\)$/);
  if (!m) return null;
  return { key: m[1] };
}

function enqueueLogs(lines: string[]) {
  for (const raw of lines || []) {
    const line = String(raw || "").trimEnd();
    if (!line) continue;

    // Coalesce high-frequency progress bars of the same command to reduce flicker/spam.
    const curr = isCmdProgressLine(line);
    const last =
      pendingLogQueue.length > 0 ? pendingLogQueue[pendingLogQueue.length - 1] : "";
    const prev = isCmdProgressLine(last);
    if (curr && prev && curr.key === prev.key) {
      pendingLogQueue[pendingLogQueue.length - 1] = line;
    } else {
      pendingLogQueue.push(line);
    }
  }
  logQueueSize.value = pendingLogQueue.length;
  logBuffering.value = pendingLogQueue.length > 0;
}

function flushLogQueue() {
  if (pendingLogQueue.length <= 0) {
    logQueueSize.value = 0;
    logBuffering.value = false;
    return;
  }

  const chunk = pendingLogQueue.splice(0, LOG_FLUSH_CHUNK);
  let next = logLines.value.concat(chunk);
  if (next.length > LOG_VISIBLE_MAX) {
    next = next.slice(next.length - LOG_VISIBLE_MAX);
  }
  logLines.value = next;
  logQueueSize.value = pendingLogQueue.length;
  logBuffering.value = pendingLogQueue.length > 0;
}

function appendLocalLog(message: string) {
  const line = `[ui] ${message}`;
  enqueueLogs([line]);
}

async function handleStartBackend() {
  const now = Date.now();
  if (backendActionBusy.value) return;
  if (now - backendActionLastAt < BACKEND_ACTION_DEBOUNCE_MS) return;
  backendActionLastAt = now;
  backendActionBusy.value = "start";
  try {
    const r = await startBackend();
    if (r?.ok && r.baseUrl) baseUrl.value = r.baseUrl;
    await refreshBackendStatus();
    await refreshPing();
  } finally {
    backendActionBusy.value = "";
  }
}

async function handleRestartBackend() {
  const now = Date.now();
  if (backendActionBusy.value) return;
  if (now - backendActionLastAt < BACKEND_ACTION_DEBOUNCE_MS) return;
  backendActionLastAt = now;
  backendActionBusy.value = "restart";
  try {
    const r = await restartBackend();
    if (r?.ok && r.baseUrl) baseUrl.value = r.baseUrl;
    logLines.value = [];
    logTotal.value = 0;
    pendingLogQueue.length = 0;
    logQueueSize.value = 0;
    logBuffering.value = false;
    await refreshBackendStatus();
    await refreshPing();
  } finally {
    backendActionBusy.value = "";
  }
}

async function handleEnterProject() {
  if (!isReadyToEnter.value) return;
  await router.push("/");
}

async function refreshSetupStateOnly() {
  const st = await getSetupState();
  if (!st) return;
  const wasRunning = setupState.value.running;
  setupState.value = st;
  if (st.running) {
    startupSetupHintVisible.value = true;
    startupSetupCompletedHintVisible.value = false;
    return;
  }
  if (wasRunning) {
    startupSetupCompletedHintVisible.value = true;
  }
}

async function runSetup(reason: string, retryKey = "") {
  const result = await runSetupWorkflow({ reason, retryKey });
  if (result?.state) setupState.value = result.state;
  if (result?.ok === false) {
    appendLocalLog(t("welcome.setupFailed", { error: result.error || "Unknown error" }));
  }
  await refreshBackendStatus();
  await refreshPing();
}

function getRetrySuggestion(stepKey: string): string {
  switch (stepKey) {
    case "python":
      return t("welcome.retrySuggestion.python");
    case "venv":
      return t("welcome.retrySuggestion.venv");
    case "django":
      return t("welcome.retrySuggestion.django");
    case "dependencyInstall":
      return t("welcome.retrySuggestion.dependencyInstall");
    default:
      return t("welcome.retrySuggestion.default");
  }
}

async function handleRetryStep(stepKey: string) {
  retryingStepKey.value = stepKey;
  await runSetup("retry", stepKey);
  await refreshLogs();
  const failed = (setupState.value.steps || []).find(
    (s) => s.key === stepKey && s.status === "error"
  );
  if (failed) {
    appendLocalLog(t("welcome.retryFailed", { label: failed.label, suggestion: getRetrySuggestion(stepKey) }));
  }
  retryingStepKey.value = "";
}

async function handleRunSetupWorkflow() {
  await runSetup("manual");
  await refreshLogs();
}

async function handleCleanupOldProject() {
  const ok = window.confirm(
    t("welcome.cleanupConfirmMessage")
  );
  if (!ok) return;

  const r = await cleanupOldProject();
  if (r?.ok) {
    appendLocalLog(
      t("welcome.cleanupSuccess")
    );
  } else {
    appendLocalLog(t("welcome.cleanupFailed", { error: r?.error || "Unknown error" }));
  }

  logLines.value = [];
  logTotal.value = 0;
  pendingLogQueue.length = 0;
  logQueueSize.value = 0;
  logBuffering.value = false;
  await refreshAll();
}

async function handleRevealUserDataDir() {
  await revealUserDataDir();
}

async function handleCopyLogs() {
  try {
    await navigator.clipboard.writeText(logLines.value.join("\n"));
  } catch {
    // ignore
  }
}

async function handleClearLogs() {
  logLines.value = [];
  logTotal.value = 0;
  pendingLogQueue.length = 0;
  logQueueSize.value = 0;
  logBuffering.value = false;
  await clearBackendLogs();
}

async function refreshAll() {
  await refreshBaseUrl();
  await refreshSetupStateOnly();
  await refreshBackendStatus();
  await refreshPing();
  await refreshLogs();
}

onMounted(async () => {
  await refreshAll();
  if (isElectron()) {
    statusLogsPollTimer = window.setInterval(() => {
      refreshSetupStateOnly();
      refreshBackendStatus();
      refreshLogs();
    }, 1000);

    logFlushTimer = window.setInterval(() => {
      flushLogQueue();
    }, LOG_FLUSH_INTERVAL_MS);

    schedulePing(1200);
  }
});

onBeforeUnmount(() => {
  if (statusLogsPollTimer != null) window.clearInterval(statusLogsPollTimer);
  statusLogsPollTimer = null;
  if (pingTimer != null) window.clearTimeout(pingTimer);
  pingTimer = null;
  if (logFlushTimer != null) window.clearInterval(logFlushTimer);
  logFlushTimer = null;
});
</script>

<template>
  <div class="root bg-vscode">
    <div class="layout row">
      <div class="col left">
        <EnvCheckList :items="envItems" :title="t('welcome.envCheckTitle')" @retry="handleRetryStep" />
      </div>
      <div class="col right">
        <div class="rightTop">
          <div class="topTitle">{{ t('welcome.backendControl') }}</div>
          <div class="topSub">{{ backendStatusText }} ｜ {{ setupProgressText }}</div>
          <div
            v-if="startupSetupHintVisible || startupSetupCompletedHintVisible"
            class="setup-startup-banner"
            :class="{ done: startupSetupCompletedHintVisible && !setupState.running }"
          >
            {{ startupSetupHintText }}
          </div>
          <div class="buttons">
            <button class="btn" type="button" @click="handleRunSetupWorkflow">
              {{ t('welcome.runSetup') }}
            </button>
            <button class="btn" type="button" @click="handleCleanupOldProject">
              {{ t('welcome.cleanupOldProject') }}
            </button>
            <button
              class="btn"
              type="button"
              :disabled="!!backendActionBusy"
              @click="handleStartBackend"
            >
              {{ backendActionBusy === "start" ? t('welcome.starting') : t('welcome.startBackend') }}
            </button>
            <button
              class="btn"
              type="button"
              :disabled="!!backendActionBusy"
              @click="handleRestartBackend"
            >
              {{ backendActionBusy === "restart" ? t('welcome.restarting') : t('welcome.restartBackend') }}
            </button>
            <button
              class="btn"
              type="button"
              :disabled="!isReadyToEnter"
              @click="handleEnterProject"
            >
              {{ t('welcome.enterProject') }}
            </button>
            <button class="btn" type="button" @click="handleRevealUserDataDir">
              {{ t('welcome.revealDataDir') }}
            </button>
          </div>
        </div>

        <div class="platformCard">
          <div class="platformCardHeader">
            <div class="platformCardTitle">{{ t('welcome.platformStatus') }}</div>
            <div class="platformStatusBadge" :class="platformStatusClass">
              <span class="platformStatusDot" />
              <span>{{ platformStatusText }}</span>
            </div>
          </div>
          <div v-if="platformHintText" class="platformHint">
            {{ platformHintText }}
          </div>
          <div v-if="platformStatus?.installedDlcs?.length" class="platformDlcs">
            <span class="platformDlcsLabel">{{ t('welcome.installedDlcs') }}</span>
            <span
              v-for="dlc in platformStatus.installedDlcs"
              :key="dlc.appId"
              class="platformDlcTag"
            >{{ dlc.name }}</span>
          </div>
          <div v-if="platformOverlayEnabled" class="platformOverlayInfo">
            Steam Overlay {{ platformStatus?.overlayActive ? t('welcome.steamOverlayActive') : t('welcome.steamOverlayAvailable') }}
          </div>
        </div>
        <div class="rightBottom">
          <CommandConsole
            :title="t('welcome.consoleTitle')"
            :status-text="logStatusText"
            :lines="logLines"
            @copy="handleCopyLogs"
            @clear="handleClearLogs"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.layout {
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  min-height: 0;
}

.left,
.right {
  min-height: 0;
}

.right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.rightTop {
  flex: 0 0 auto;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  padding: 12px;
}

.setup-startup-banner {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(60, 148, 255, 0.32);
  background: rgba(60, 148, 255, 0.12);
  color: var(--vscode-text);
  font-size: 12px;
  line-height: 1.5;
}

.setup-startup-banner.done {
  border-color: rgba(94, 196, 127, 0.28);
  background: rgba(94, 196, 127, 0.12);
}

.topTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.topSub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-fg-muted);
  word-break: break-word;
}

.buttons {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  border-radius: 0;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: none;
}

.btn:hover {
  background: var(--dweb-defualt);
  box-shadow: var(--dweb-shadow);
}

.btn:focus-visible {
  outline: none;
  box-shadow: var(--dweb-shadow);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.rightBottom {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.platformCard {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  padding: 12px;
}

.platformCardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.platformCardTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.platformStatusBadge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--dweb-defualt-dark);
}

.platformStatusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.platformStatusBadge.unknown .platformStatusDot {
  background: var(--vscode-fg-muted);
}

.platformStatusBadge.ok .platformStatusDot {
  background: #5ec47f;
}

.platformStatusBadge.warn .platformStatusDot {
  background: #f0ad4e;
}

.platformStatusBadge.mock .platformStatusDot {
  background: #6e7681;
}

.platformHint {
  font-size: 12px;
  color: var(--vscode-fg);
  padding: 8px;
  background: rgba(60, 148, 255, 0.12);
  border: 1px solid rgba(60, 148, 255, 0.32);
  margin-bottom: 8px;
}

.platformDlcs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}

.platformDlcsLabel {
  color: var(--vscode-fg-muted);
}

.platformDlcTag {
  padding: 2px 6px;
  background: var(--dweb-defualt-dark);
  border-radius: 4px;
}

.platformOverlayInfo {
  margin-top: 8px;
  font-size: 12px;
  color: var(--vscode-fg-muted);
}
</style>
