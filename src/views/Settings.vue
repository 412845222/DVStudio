<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { getClientSettings, saveClientSettings } from "../electronBridge";
import type { ClientSettings } from "../electronBridge/types";
import { fetchUserAgreementMarkdown } from "../network/LegalDocService";
import { saveEncryptedAICredentials } from "../network/AICredentialService";
import ModalDialog from "../ui/UIComponent/ModalDialog.vue";
import MarkdownViewer from "../ui/UIComponent/MarkdownViewer.vue";

const FIXED_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const FIXED_DEEPSEEK_MODEL = "deepseek-chat";
const FIXED_GEMINI_MODEL = "gemini-2.5-flash-image";

const PAGE_HINT_TEXT =
  "API Key 属于你的私有资产。为降低泄露风险，本软件会在本地后端数据库中加密保存；但无法保证在电脑被入侵等极端情况下的绝对安全。";

const loading = ref(false);
const saving = ref(false);
const saveMsg = ref("");

const clearOpen = ref(false);
const clearing = ref(false);

const repoUrl = String(__DWEB_REPO_URL__ ?? "").trim();

const agreementOpen = ref(false);
const agreementChecked = ref(false);
const agreementLoading = ref(false);
const agreementMarkdown = ref("");
const agreementError = ref("");

const form = reactive<ClientSettings>({
  defaultResolution: "1920x1080",
  deepseekApiKey: "",
  deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
  deepseekModel: FIXED_DEEPSEEK_MODEL,
  geminiApiKey: "",
  geminiModel: FIXED_GEMINI_MODEL,
  bytedanceApiKey: "",
});

async function load() {
  loading.value = true;
  const r = await getClientSettings();
  if (r?.ok && r.data) {
    Object.assign(form, r.data);
  }

  // 后端固定：不暴露给用户编辑
  form.deepseekBaseUrl = FIXED_DEEPSEEK_BASE_URL;
  form.deepseekModel = FIXED_DEEPSEEK_MODEL;
  form.geminiModel = FIXED_GEMINI_MODEL;

  // Key 不从 settings.json 回显：避免前端/磁盘明文暴露。
  form.deepseekApiKey = "";
  form.geminiApiKey = "";
  form.bytedanceApiKey = "";

  loading.value = false;
}

function needsAgreement() {
  return Boolean(
    String(form.deepseekApiKey || "").trim() || String(form.geminiApiKey || "").trim()
  );
}

async function doSubmit() {
  saving.value = true;
  saveMsg.value = "";

  // 1) API Key 写入后端（加密存储）
  const deepseekKey = String(form.deepseekApiKey || "").trim();
  const geminiKey = String(form.geminiApiKey || "").trim();
  const bytedanceKey = String(form.bytedanceApiKey || "").trim();
  const keyPayload: {
    deepseekApiKey?: string;
    geminiApiKey?: string;
    bytedanceApiKey?: string;
  } = {};
  if (deepseekKey) keyPayload.deepseekApiKey = deepseekKey;
  if (geminiKey) keyPayload.geminiApiKey = geminiKey;
  if (bytedanceKey) keyPayload.bytedanceApiKey = bytedanceKey;

  if (Object.keys(keyPayload).length > 0) {
    const keyRes = await saveEncryptedAICredentials(keyPayload);
    if (!keyRes.ok) {
      saveMsg.value = `保存失败：${keyRes.error || "后端写入失败"}`;
      saving.value = false;
      return;
    }
  }

  // 2) settings.json 仅保存“非敏感配置”（不落盘 API Key）
  const r = await saveClientSettings({
    ...form,
    deepseekApiKey: "",
    geminiApiKey: "",
    bytedanceApiKey: "",
    deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
    deepseekModel: FIXED_DEEPSEEK_MODEL,
    geminiModel: FIXED_GEMINI_MODEL,
  });
  if (r?.ok) saveMsg.value = "保存成功";
  else saveMsg.value = `保存失败：${r?.error || "未知错误"}`;

  if (r?.ok) {
    form.deepseekApiKey = "";
    form.geminiApiKey = "";
    form.bytedanceApiKey = "";
  }

  saving.value = false;
}

async function ensureAgreementMarkdownLoaded() {
  if (agreementMarkdown.value || agreementLoading.value) return;
  agreementLoading.value = true;
  agreementError.value = "";
  const r = await fetchUserAgreementMarkdown();
  if (r.ok && typeof r.markdown === "string") agreementMarkdown.value = r.markdown;
  else agreementError.value = r.error || "协议内容加载失败";
  agreementLoading.value = false;
}

async function submit() {
  if (saving.value) return;
  saveMsg.value = "";

  if (needsAgreement()) {
    agreementChecked.value = false;
    agreementOpen.value = true;
    await ensureAgreementMarkdownLoaded();
    return;
  }

  await doSubmit();
}

async function confirmAgreementAndSave() {
  if (!agreementChecked.value) return;
  agreementOpen.value = false;
  await doSubmit();
}

function openSource() {
  if (!repoUrl) return;
  window.open(repoUrl, "_blank", "noopener,noreferrer");
}

async function confirmClearCredentials() {
  if (clearing.value || saving.value) return;
  clearing.value = true;
  saveMsg.value = "";

  const r = await saveEncryptedAICredentials({
    deepseekApiKey: "",
    geminiApiKey: "",
    bytedanceApiKey: "",
  });
  if (!r.ok) saveMsg.value = `清空失败：${r.error || "后端写入失败"}`;
  else saveMsg.value = "已清空已保存的 API Key";

  form.deepseekApiKey = "";
  form.geminiApiKey = "";
  form.bytedanceApiKey = "";

  clearing.value = false;
  clearOpen.value = false;
}

onMounted(() => {
  load();
});
</script>

<template>
  <div class="settings-page bg-vscode">
    <div class="settings-shell">
      <div class="settings-title">客户端设置</div>
      <div class="settings-sub">
        默认分辨率保存到 DVSResource/UserSettings/settings.json；API Key
        会在本地后端数据库中加密保存。
      </div>

      <div class="settings-warning">
        {{ PAGE_HINT_TEXT }}
      </div>

      <div class="settings-form" :class="{ loading: loading }">
        <label class="field">
          <span class="label">默认分辨率</span>
          <select v-model="form.defaultResolution" class="input">
            <option value="1920x1080">1920 x 1080</option>
            <option value="1280x720">1280 x 720</option>
            <option value="1080x1920">1080 x 1920</option>
            <option value="3840x2160">3840 x 2160</option>
          </select>
        </label>

        <label class="field">
          <span class="label">DeepSeek API Key</span>
          <input
            v-model.trim="form.deepseekApiKey"
            class="input"
            type="password"
            placeholder="sk-..."
          />
        </label>

        <label class="field">
          <span class="label">Gemini API Key</span>
          <input
            v-model.trim="form.geminiApiKey"
            class="input"
            type="password"
            placeholder="AIza..."
          />
        </label>

        <label class="field">
          <span class="label">字节方舟 API Key (ARK_API_KEY)</span>
          <input
            v-model.trim="form.bytedanceApiKey"
            class="input"
            type="password"
            placeholder="ark_..."
          />
        </label>

        <div class="actions">
          <button class="btn" type="button" :disabled="saving" @click="submit">
            {{ saving ? "保存中..." : "保存设置" }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="saving || clearing"
            @click="clearOpen = true"
          >
            {{ clearing ? "清空中..." : "清空记录" }}
          </button>
          <button class="btn btn-icon" type="button" :disabled="!repoUrl" @click="openSource">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2C6.477 2 2 6.486 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.486 17.522 2 12 2Z"
              />
            </svg>
            <span>查看源码</span>
          </button>
          <span class="msg">{{ saveMsg }}</span>
        </div>
      </div>
    </div>

    <ModalDialog
      :open="agreementOpen"
      title="用户协议与安全声明"
      confirm-text="同意并保存"
      close-text="取消"
      :disable-confirm="saving || !agreementChecked"
      @close="agreementOpen = false"
      @confirm="confirmAgreementAndSave"
    >
      <div class="agreement-body">
        <div v-if="agreementLoading" class="agreement-loading">协议加载中...</div>
        <div v-else-if="agreementError" class="agreement-error">{{ agreementError }}</div>
        <MarkdownViewer v-else :markdown="agreementMarkdown" />

        <label class="agreement-check">
          <input v-model="agreementChecked" type="checkbox" class="agreement-checkbox" />
          <span>我已阅读并同意以上协议与安全声明</span>
        </label>
      </div>
    </ModalDialog>

    <ModalDialog
      :open="clearOpen"
      title="清空已保存的 API Key"
      confirm-text="确认清空"
      close-text="取消"
      :disable-confirm="clearing || saving"
      @close="clearOpen = false"
      @confirm="confirmClearCredentials"
    >
      <div class="agreement-body">
        <div class="agreement-loading">
          该操作会清空本机后端数据库中加密保存的 DeepSeek/Gemini/字节方舟 API Key。清空后，相关 AI 功能将无法使用，直到你重新保存 Key。
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.settings-page {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 18px;
  box-sizing: border-box;
}

.settings-shell {
  max-width: 980px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  box-shadow: var(--vscode-shadow);
  padding: 14px;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.settings-sub {
  margin-top: 4px;
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.settings-warning {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg-muted);
  font-size: 12px;
  line-height: 1.6;
}

.settings-form {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-form.loading {
  opacity: 0.6;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  color: var(--vscode-fg);
  font-size: 12px;
}

.input {
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  border: 1px solid var(--vscode-border);
  padding: 8px 10px;
  outline: none;
}

.input:focus {
  border-color: var(--vscode-border-accent);
  box-shadow: var(--dweb-shadow);
}

.actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.btn {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  border-radius: 0;
  padding: 8px 12px;
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  cursor: pointer;
}

.btn:hover {
  box-shadow: var(--dweb-shadow);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.msg {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

@media (max-width: 900px) {
  .settings-form {
    grid-template-columns: 1fr;
  }
}

.agreement-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agreement-loading,
.agreement-error {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg-muted);
  padding: 10px 12px;
  font-size: 12px;
}

.agreement-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-fg);
  font-size: 12px;
}

.agreement-checkbox {
  width: 14px;
  height: 14px;
}
</style>
