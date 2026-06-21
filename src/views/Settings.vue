<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getClientSettings, saveClientSettings, openExternalUrl } from '../electronBridge'
import type { ClientSettings } from '../electronBridge/types'
import { fetchUserAgreementMarkdown } from '../network/LegalDocService'
import { saveEncryptedAICredentials } from '../network/AICredentialService'
import ModalDialog from '../ui/UIComponent/ModalDialog.vue'
import MarkdownViewer from '../ui/UIComponent/MarkdownViewer.vue'

const FIXED_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const FIXED_DEEPSEEK_MODEL = 'deepseek-chat'
const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'

const loading = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const repoUrl = String((window as any).__DWEB_REPO_URL ?? '').trim()

const agreementOpen = ref(false)
const agreementChecked = ref(false)
const agreementLoading = ref(false)
const agreementMarkdown = ref('')
const agreementError = ref('')

const clearOpen = ref(false)
const clearing = ref(false)

const form = reactive<ClientSettings>({
	defaultResolution: '1920x1080',
	deepseekApiKey: '',
	deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
	deepseekModel: FIXED_DEEPSEEK_MODEL,
	geminiApiKey: '',
	geminiModel: FIXED_GEMINI_MODEL,
	bytedanceApiKey: '',
	meshyApiKey: '',
})

// 模态框状态
const activeProvider = ref<string | null>(null)
const pendingForm = reactive<Record<string, string>>({})

const providers = [
	{
		key: 'deepseek',
		name: 'DeepSeek',
		desc: '中文大模型对话服务',
		accent: '#4d6bfe',
		icon: 'DS',
		fields: [{ key: 'deepseekApiKey', label: 'API Key', placeholder: 'sk-...', mask: true }],
		docsUrl: 'https://platform.deepseek.com/api_keys',
		formKey: 'deepseekApiKey',
		formValue: (s: ClientSettings) => s.deepseekApiKey,
	},
	{
		key: 'gemini',
		name: 'Gemini',
		desc: 'Google 多模态大模型',
		accent: '#22a06b',
		icon: 'GM',
		fields: [{ key: 'geminiApiKey', label: 'API Key', placeholder: 'AIza...', mask: true }],
		docsUrl: 'https://aistudio.google.com/apikey',
		formKey: 'geminiApiKey',
		formValue: (s: ClientSettings) => s.geminiApiKey,
	},
	{
		key: 'bytedance',
		name: '字节方舟',
		desc: '火山引擎大模型服务',
		accent: '#1677ff',
		icon: '方舟',
		fields: [{ key: 'bytedanceApiKey', label: 'API Key', placeholder: 'ark_...', mask: true }],
		docsUrl: 'https://console.volcengine.com/ark/',
		formKey: 'bytedanceApiKey',
		formValue: (s: ClientSettings) => s.bytedanceApiKey,
	},
	{
		key: 'meshy',
		name: 'Meshy',
		desc: 'AI 3D 内容生成',
		accent: '#a855f7',
		icon: '3D',
		fields: [{ key: 'meshyApiKey', label: 'API Key', placeholder: 'mshy_...', mask: true }],
		docsUrl: 'https://docs.meshy.ai/reference/api-key',
		formKey: 'meshyApiKey',
		formValue: (s: ClientSettings) => s.meshyApiKey,
	},
]

const hasPendingKey = (key: string) => {
	const prov = providers.find((p) => p.key === key)
	if (!prov) return false
	return prov.fields.some((f) => String(pendingForm[f.key] || '').trim())
}

function openProvider(key: string) {
	const prov = providers.find((p) => p.key === key)
	if (!prov) return
	for (const f of prov.fields) pendingForm[f.key] = (form as any)[f.key] || ''
	activeProvider.value = key
}

function closeProvider() {
	activeProvider.value = null
	for (const k of Object.keys(pendingForm)) delete pendingForm[k]
}

function saveProvider() {
	const key = activeProvider.value
	const prov = providers.find((p) => p.key === key)
	if (!prov) return
	for (const f of prov.fields) {
		;(form as any)[f.key] = pendingForm[f.key] || ''
	}
	saveMsg.value = '请点击右上角“保存全部”以将凭证加密写入后端。'
	closeProvider()
}

function openSource() {
	if (!repoUrl) return
	void openExternalUrl(repoUrl)
}

function openDocsForProvider(key: string | null) {
	if (!key) return
	const prov = providers.find((p) => p.key === key)
	if (!prov || !prov.docsUrl) return
	void openExternalUrl(prov.docsUrl)
}

async function load() {
	loading.value = true
	const r = await getClientSettings()
	if (r?.ok && r.data) Object.assign(form, r.data)
	form.deepseekBaseUrl = FIXED_DEEPSEEK_BASE_URL
	form.deepseekModel = FIXED_DEEPSEEK_MODEL
	form.geminiModel = FIXED_GEMINI_MODEL
	// Keep API keys from loaded settings - do NOT clear them
	// Keys are stored in client settings alongside encrypted backend storage
	for (const key of ['deepseekApiKey', 'geminiApiKey', 'bytedanceApiKey', 'meshyApiKey']) {
		if (!(key in form) || typeof (form as any)[key] !== 'string') (form as any)[key] = ''
	}
	loading.value = false
}

function needsAgreement() {
	return Boolean(
		String(form.deepseekApiKey || '').trim() ||
			String(form.geminiApiKey || '').trim() ||
			String(form.bytedanceApiKey || '').trim() ||
			String(form.meshyApiKey || '').trim()
	)
}

async function doSubmit() {
	saving.value = true
	saveMsg.value = ''

	// Always include all key fields in saveEncryptedAICredentials.
	// This ensures that clearing a key in the form also clears the encrypted storage.
	const keyPayload: {
		deepseekApiKey: string
		geminiApiKey: string
		bytedanceApiKey: string
		meshyApiKey: string
	} = {
		deepseekApiKey: String(form.deepseekApiKey || '').trim(),
		geminiApiKey: String(form.geminiApiKey || '').trim(),
		bytedanceApiKey: String(form.bytedanceApiKey || '').trim(),
		meshyApiKey: String(form.meshyApiKey || '').trim(),
	}
	const keyRes = await saveEncryptedAICredentials(keyPayload)
	if (!keyRes.ok) {
		saveMsg.value = `保存失败：${keyRes.error || '后端写入失败'}`
		saving.value = false
		return
	}

	const r = await saveClientSettings({
		...form,
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiModel: FIXED_GEMINI_MODEL,
	})

	if (r?.ok) saveMsg.value = '保存成功'
	else if (r === null) saveMsg.value = '保存成功（本地设置已在浏览器中保存）'
	else saveMsg.value = `保存失败：${r?.error || '未知错误'}`

	saving.value = false
}

async function ensureAgreementMarkdownLoaded() {
	if (agreementMarkdown.value || agreementLoading.value) return
	agreementLoading.value = true
	agreementError.value = ''
	const r = await fetchUserAgreementMarkdown()
	if (r.ok && typeof r.markdown === 'string') agreementMarkdown.value = r.markdown
	else agreementError.value = r.error || '协议内容加载失败'
	agreementLoading.value = false
}

async function submit() {
	if (saving.value) return
	saveMsg.value = ''
	if (needsAgreement()) {
		agreementChecked.value = false
		agreementOpen.value = true
		await ensureAgreementMarkdownLoaded()
		return
	}
	await doSubmit()
}

async function confirmAgreementAndSave() {
	if (!agreementChecked.value) return
	agreementOpen.value = false
	await doSubmit()
}

async function confirmClearCredentials() {
	if (clearing.value || saving.value) return
	clearing.value = true
	saveMsg.value = ''
	const r = await saveEncryptedAICredentials({
		deepseekApiKey: '',
		geminiApiKey: '',
		bytedanceApiKey: '',
		meshyApiKey: '',
	})
	if (!r.ok) saveMsg.value = `清空失败：${r.error || '后端写入失败'}`
	else saveMsg.value = '已清空已保存的 API Key'

	form.deepseekApiKey = ''
	form.geminiApiKey = ''
	form.bytedanceApiKey = ''
	form.meshyApiKey = ''
	clearing.value = false
	clearOpen.value = false
}

onMounted(() => {
	load()
})
</script>

<template>
	<div class="settings-root">
		<div class="settings-page" :class="{ loading: loading }">
		<header class="settings-header">
			<div class="settings-header-inner">
				<div class="settings-header-text">
					<h1 class="settings-title">设置</h1>
					<p class="settings-sub">在此管理各供应商的 API 凭证与默认输出分辨率。</p>
				</div>
				<div class="settings-header-actions">
					<button v-if="repoUrl" class="btn btn-ghost" type="button" @click="openSource">
						<svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon-sm">
							<path
								fill="currentColor"
								d="M12 2C6.477 2 2 6.486 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.486 17.522 2 12 2Z"
							/>
						</svg>
						查看源码
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						:disabled="saving || clearing"
						@click="clearOpen = true"
					>
						清空所有凭证
					</button>
					<button class="btn btn-primary" type="button" :disabled="saving" @click="submit">
						{{ saving ? '保存中...' : '保存全部' }}
					</button>
				</div>
			</div>
			<p v-if="saveMsg" class="settings-flash">{{ saveMsg }}</p>
		</header>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">默认输出</h2>
				<p class="section-desc">保存到本地 settings.json</p>
			</div>
			<div class="resolution-card">
				<div class="resolution-row">
					<label class="resolution-label">默认分辨率</label>
					<select v-model="form.defaultResolution" class="resolution-select">
						<option value="1920x1080">1920 × 1080</option>
						<option value="1280x720">1280 × 720</option>
						<option value="1080x1920">1080 × 1920</option>
						<option value="3840x2160">3840 × 2160</option>
					</select>
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">供应商凭证</h2>
				<p class="section-desc">
					API Key 属于你的私有资产。为降低泄露风险，本软件会在本地后端数据库中加密保存；但无法保证在电脑被入侵等极端情况下的绝对安全。
				</p>
			</div>

			<div class="provider-grid">
				<button
					v-for="prov in providers"
					:key="prov.key"
					class="provider-card"
					type="button"
					@click="openProvider(prov.key)"
				>
					<div class="provider-badge" :style="{ '--accent': prov.accent }">
						<span>{{ prov.icon }}</span>
					</div>
					<div class="provider-body">
						<div class="provider-name">{{ prov.name }}</div>
						<div class="provider-desc">{{ prov.desc }}</div>
						<div class="provider-status">
							<span class="status-dot" :class="{ configured: !!prov.formValue(form) }"></span>
							<span class="status-text">{{ prov.formValue(form) ? '已配置' : '未配置' }}</span>
						</div>
					</div>
					<div class="provider-chev" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none">
							<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</div>
				</button>
			</div>
		</section>
	</div>

	<!-- 供应商配置弹窗 -->
	<ModalDialog
		v-if="activeProvider"
		:open="activeProvider !== null"
		:title="providers.find((p) => p.key === activeProvider)?.name + ' · 配置凭证'"
		confirm-text="保存配置"
		close-text="取消"
		:disable-confirm="saving"
		@close="closeProvider"
		@confirm="saveProvider"
	>
		<template v-if="providers.find((p) => p.key === activeProvider)">
			<div class="provider-modal-body">
				<div
					class="provider-modal-head"
					:style="{ '--accent': providers.find((p) => p.key === activeProvider)!.accent }"
				>
					<div class="provider-badge-lg">
						<span>{{ providers.find((p) => p.key === activeProvider)!.icon }}</span>
					</div>
					<div>
						<div class="provider-modal-name">
							{{ providers.find((p) => p.key === activeProvider)!.name }}
						</div>
						<div class="provider-modal-desc">
							{{ providers.find((p) => p.key === activeProvider)!.desc }}
						</div>
					</div>
				</div>

				<div class="provider-modal-fields">
					<label
						v-for="f in providers.find((p) => p.key === activeProvider)!.fields"
						:key="f.key"
						class="field-row"
					>
						<span class="field-label">{{ f.label }}</span>
						<input
							v-model="pendingForm[f.key]"
							class="field-input"
							:type="f.mask ? 'password' : 'text'"
							:placeholder="f.placeholder"
							autocomplete="off"
							spellcheck="false"
						/>
					</label>
				</div>

				<div class="provider-modal-tip">
				<span>未获取到 API Key？</span>
				<button
					type="button"
					class="provider-modal-link"
					@click="openDocsForProvider(activeProvider)"
				>前往官方控制台获取 →</button>
			</div>
			</div>
		</template>
	</ModalDialog>

	<!-- 用户协议弹窗 -->
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

	<!-- 清空确认弹窗 -->
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
				该操作会清空本机后端数据库中加密保存的 DeepSeek / Gemini / 字节方舟 / Meshy API 凭证。清空后，相关 AI 功能将无法使用，直到你重新保存 Key。
			</div>
		</div>
	</ModalDialog>
	</div>
</template>

<style scoped>
.settings-root {
	position: relative;
	width: 100%;
	height: 100%;
}

.settings-page {
	position: relative;
	width: 100%;
	height: 100%;
	overflow-y: auto;
	padding: 32px clamp(24px, 4vw, 64px);
	box-sizing: border-box;
	background:
		radial-gradient(1200px 500px at 10% -10%, rgba(58, 168, 180, 0.12), transparent 60%),
		radial-gradient(900px 400px at 110% 20%, rgba(168, 85, 247, 0.1), transparent 60%),
		var(--theme-bg-secondary);
}

.settings-page.loading {
	opacity: 0.55;
	pointer-events: none;
}

.settings-header {
	position: sticky;
	top: 0;
	z-index: 5;
	margin: -32px calc(-1 * clamp(24px, 4vw, 64px)) 24px;
	padding: 24px clamp(24px, 4vw, 64px) 18px;
	background: linear-gradient(to bottom, var(--theme-bg-secondary) 70%, transparent);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}

.settings-header-inner {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 20px;
	flex-wrap: wrap;
}

.settings-header-text {
	min-width: 0;
}

.settings-title {
	margin: 0;
	font-size: 28px;
	font-weight: 600;
	letter-spacing: 0.3px;
	color: var(--vscode-fg);
}

.settings-sub {
	margin: 6px 0 0;
	font-size: 13px;
	color: var(--vscode-fg-muted);
}

.settings-header-actions {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.settings-flash {
	margin: 12px 0 0;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 13px;
	padding: 8px 14px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease;
}

.btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.btn:active {
	transform: translateY(1px);
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-icon-sm {
	width: 14px;
	height: 14px;
}

.btn-primary {
	background: var(--theme-accent);
	border-color: var(--theme-accent);
	color: #fff;
}

.btn-primary:hover {
	background: var(--theme-accent-hover);
	border-color: var(--theme-accent-hover);
}

.btn-ghost {
	background: transparent;
}

.settings-section {
	margin: 0 0 32px;
}

.section-head {
	margin-bottom: 14px;
}

.section-title {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	letter-spacing: 0.3px;
	color: var(--vscode-fg);
}

.section-desc {
	margin: 4px 0 0;
	font-size: 12.5px;
	color: var(--vscode-fg-muted);
	line-height: 1.55;
	max-width: 760px;
}

.resolution-card {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	padding: 18px 20px;
	max-width: 760px;
}

.resolution-row {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
}

.resolution-label {
	font-size: 13px;
	color: var(--vscode-fg);
	min-width: 80px;
}

.resolution-select {
	flex: 1;
	min-width: 180px;
	max-width: 280px;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border: 1px solid var(--vscode-border);
	padding: 8px 10px;
	font-size: 13px;
	outline: none;
}

.resolution-select:focus {
	border-color: var(--vscode-border-accent);
}

.provider-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 14px;
	max-width: 1200px;
}

.provider-card {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 18px;
	text-align: left;
	display: flex;
	align-items: center;
	gap: 14px;
	cursor: pointer;
	transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
	position: relative;
}

.provider-card:hover {
	transform: translateY(-1px);
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
	box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.provider-badge {
	width: 44px;
	height: 44px;
	flex: 0 0 44px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--accent) 18%, transparent);
	color: var(--accent);
	font-weight: 700;
	font-size: 12px;
	letter-spacing: 0.5px;
	border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
}

.provider-body {
	flex: 1;
	min-width: 0;
}

.provider-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.provider-desc {
	margin-top: 3px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.provider-status {
	margin-top: 10px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 11.5px;
}

.status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--vscode-fg-muted) 60%, transparent);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-fg-muted) 20%, transparent);
}

.status-dot.configured {
	background: #22a06b;
	box-shadow: 0 0 0 2px rgba(34, 160, 107, 0.2);
}

.status-text {
	color: var(--vscode-fg-muted);
}

.status-dot.configured + .status-text {
	color: #22a06b;
}

.provider-chev {
	color: var(--vscode-fg-muted);
	opacity: 0.55;
	display: inline-flex;
}

.provider-chev svg {
	width: 18px;
	height: 18px;
}

.provider-card:hover .provider-chev {
	opacity: 1;
	color: var(--vscode-fg);
}

/* Modal overrides */
.provider-modal-body {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.provider-modal-head {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 14px;
	background: color-mix(in srgb, var(--accent) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}

.provider-badge-lg {
	width: 48px;
	height: 48px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--accent) 22%, transparent);
	color: var(--accent);
	font-weight: 700;
	font-size: 13px;
	letter-spacing: 0.5px;
	border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.provider-modal-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.provider-modal-desc {
	font-size: 12.5px;
	color: var(--vscode-fg-muted);
	margin-top: 2px;
}

.provider-modal-fields {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.field-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.field-label {
	font-size: 12.5px;
	color: var(--vscode-fg);
}

.field-input {
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border: 1px solid var(--vscode-border);
	padding: 10px 12px;
	font-size: 13px;
	outline: none;
	font-family: inherit;
}

.field-input:focus {
	border-color: var(--vscode-border-accent);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 25%, transparent);
}

.provider-modal-tip {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	padding: 10px 12px;
	background: var(--dweb-defualt-dark);
	border: 1px dashed var(--vscode-border);
	font-size: 12.5px;
	color: var(--vscode-fg-muted);
}

.provider-modal-link {
	appearance: none;
	-webkit-appearance: none;
	background: transparent;
	border: 0;
	padding: 0;
	font: inherit;
	cursor: pointer;
	color: var(--theme-accent);
	text-decoration: none;
	font-weight: 500;
}

.provider-modal-link:hover {
	text-decoration: underline;
	color: var(--theme-accent-hover);
}

.agreement-body {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.agreement-loading,
.agreement-error {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg-muted);
	padding: 10px 12px;
	font-size: 12.5px;
	line-height: 1.6;
}

.agreement-check {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--vscode-fg);
	font-size: 12.5px;
}

.agreement-checkbox {
	width: 14px;
	height: 14px;
}

@media (max-width: 720px) {
	.settings-title {
		font-size: 22px;
	}

	.settings-header-inner {
		flex-direction: column;
		align-items: stretch;
	}

	.settings-header-actions {
		justify-content: flex-start;
	}

	.provider-grid {
		grid-template-columns: 1fr;
	}
}
</style>
