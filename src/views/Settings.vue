<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { getClientSettings, saveClientSettings, openExternalUrl } from '../electronBridge'
import type { ClientSettings } from '../electronBridge/types'
import { saveEncryptedAICredentials } from '../network/AICredentialService'
import ModalDialog from '../ui/UIComponent/ModalDialog.vue'
import { usePlatform } from '../platformBridge'
import { useI18n } from '../i18n'

const { t, locale } = useI18n()

const FIXED_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const FIXED_DEEPSEEK_MODEL = 'deepseek-chat'
const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'
const API_KEY_AGREEMENT_VERSION = '1.0'

type ClientSettingsKey = keyof ClientSettings
type ApiKeyFieldKey = 'deepseekApiKey' | 'geminiApiKey' | 'bytedanceApiKey' | 'meshyApiKey' | 'githubToken' | 'anthropicApiKey'

type ProviderConfig = {
	key: string
	name: string
	descKey: string
	accent: string
	icon: string
	fields: Array<{ key: ApiKeyFieldKey; label: string; placeholder: string; mask: boolean }>
	docsUrl: string
	formKey: ApiKeyFieldKey
	formValue: (s: ClientSettings) => string
}

const loading = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const saveMsgTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const repoUrl = String(window.__DWEB_REPO_URL__ ?? '').trim()

const securityAgreementOpen = ref(false)
const securityAgreementChecked = ref(false)
const pendingProviderKey = ref<string | null>(null)
const pendingFieldKey = ref<ApiKeyFieldKey | null>(null)
const pendingFieldValue = ref('')

const clearOpen = ref(false)
const clearing = ref(false)

const form = reactive<ClientSettings>({
	defaultResolution: '1920x1080',
	deepseekApiKey: '',
	deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
	deepseekModel: FIXED_DEEPSEEK_MODEL,
	geminiApiKey: '',
	geminiModel: FIXED_GEMINI_MODEL,
	geminiBaseUrl: '',
	httpProxy: '',
	bytedanceApiKey: '',
	meshyApiKey: '',
	githubToken: '',
	anthropicApiKey: '',
	ui: {
		locale: '',
	},
	apiKeySecurityAgreement: {
		accepted: false,
		acceptedAt: 0,
		acceptedVersion: '',
	},
})

const activeProvider = ref<string | null>(null)
const pendingForm = reactive<Partial<Record<ApiKeyFieldKey, string>>>({})

const hasAcceptedAgreement = computed(() => {
	return Boolean(form.apiKeySecurityAgreement?.accepted)
})

const providers = computed<ProviderConfig[]>(() => [
	{
		key: 'deepseek',
		name: t('settings.providers.deepseek.name'),
		descKey: 'settings.providers.deepseek.desc',
		accent: '#4d6bfe',
		icon: t('settings.providers.deepseek.icon'),
		fields: [{ key: 'deepseekApiKey', label: t('settings.fields.apiKey'), placeholder: 'sk-...', mask: true }],
		docsUrl: 'https://platform.deepseek.com/api_keys',
		formKey: 'deepseekApiKey',
		formValue: (s: ClientSettings) => s.deepseekApiKey,
	},
	{
		key: 'gemini',
		name: t('settings.providers.gemini.name'),
		descKey: 'settings.providers.gemini.desc',
		accent: '#22a06b',
		icon: t('settings.providers.gemini.icon'),
		fields: [{ key: 'geminiApiKey', label: t('settings.fields.apiKey'), placeholder: 'AIza...', mask: true }],
		docsUrl: 'https://aistudio.google.com/apikey',
		formKey: 'geminiApiKey',
		formValue: (s: ClientSettings) => s.geminiApiKey,
	},
	{
		key: 'bytedance',
		name: t('settings.providers.bytedance.name'),
		descKey: 'settings.providers.bytedance.desc',
		accent: '#1677ff',
		icon: t('settings.providers.bytedance.icon'),
		fields: [{ key: 'bytedanceApiKey', label: t('settings.fields.apiKey'), placeholder: 'ark_...', mask: true }],
		docsUrl: 'https://console.volcengine.com/ark/',
		formKey: 'bytedanceApiKey',
		formValue: (s: ClientSettings) => s.bytedanceApiKey,
	},
	{
		key: 'meshy',
		name: t('settings.providers.meshy.name'),
		descKey: 'settings.providers.meshy.desc',
		accent: '#a855f7',
		icon: t('settings.providers.meshy.icon'),
		fields: [{ key: 'meshyApiKey', label: t('settings.fields.apiKey'), placeholder: 'mshy_...', mask: true }],
		docsUrl: 'https://docs.meshy.ai/reference/api-key',
		formKey: 'meshyApiKey',
		formValue: (s: ClientSettings) => s.meshyApiKey,
	},
	{
		key: 'github',
		name: t('settings.providers.github.name'),
		descKey: 'settings.providers.github.desc',
		accent: '#24292e',
		icon: t('settings.providers.github.icon'),
		fields: [{ key: 'githubToken', label: t('settings.fields.personalAccessToken'), placeholder: 'ghp_...', mask: true }],
		docsUrl: 'https://github.com/settings/tokens',
		formKey: 'githubToken',
		formValue: (s: ClientSettings) => s.githubToken,
	},
	{
		key: 'anthropic',
		name: t('settings.providers.anthropic.name'),
		descKey: 'settings.providers.anthropic.desc',
		accent: '#cc785c',
		icon: t('settings.providers.anthropic.icon'),
		fields: [{ key: 'anthropicApiKey', label: t('settings.fields.apiKey'), placeholder: 'sk-ant-...', mask: true }],
		docsUrl: 'https://console.anthropic.com/keys',
		formKey: 'anthropicApiKey',
		formValue: (s: ClientSettings) => s.anthropicApiKey,
	},
])

function showSaveMessage(msg: string, duration = 3000) {
	saveMsg.value = msg
	if (saveMsgTimer.value) clearTimeout(saveMsgTimer.value)
	saveMsgTimer.value = setTimeout(() => {
		saveMsg.value = ''
	}, duration)
}

function buildSavePayload(overrides: Partial<ClientSettings> = {}): ClientSettings {
	const payload: ClientSettings = {
		defaultResolution: form.defaultResolution,
		deepseekApiKey: form.deepseekApiKey,
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiApiKey: form.geminiApiKey,
		geminiModel: FIXED_GEMINI_MODEL,
		geminiBaseUrl: String(form.geminiBaseUrl || '').trim(),
		httpProxy: String(form.httpProxy || '').trim(),
		bytedanceApiKey: form.bytedanceApiKey,
		meshyApiKey: form.meshyApiKey,
		githubToken: form.githubToken,
		anthropicApiKey: form.anthropicApiKey,
		ui: {
			locale: form.ui?.locale || '',
		},
		apiKeySecurityAgreement: form.apiKeySecurityAgreement
			? {
					accepted: form.apiKeySecurityAgreement.accepted,
					acceptedAt: form.apiKeySecurityAgreement.acceptedAt,
					acceptedVersion: form.apiKeySecurityAgreement.acceptedVersion,
				}
			: {
					accepted: false,
					acceptedAt: 0,
					acceptedVersion: '',
				},
		...overrides,
	}
	return payload
}

function getProvider(key: string | null) {
	return providers.value.find((p) => p.key === key) || null
}

const hasPendingKey = (key: string) => {
	const prov = providers.value.find((p) => p.key === key)
	if (!prov) return false
	return prov.fields.some((f) => String(pendingForm[f.key] || '').trim())
}

function openProvider(key: string) {
	const prov = providers.value.find((p) => p.key === key)
	if (!prov) return
	for (const f of prov.fields) pendingForm[f.key] = form[f.key] || ''
	activeProvider.value = key
}

function closeProvider() {
	activeProvider.value = null
	for (const k of Object.keys(pendingForm) as ApiKeyFieldKey[]) delete pendingForm[k]
}

function handleFieldInput(fieldKey: ApiKeyFieldKey) {
	const value = String(pendingForm[fieldKey] || '')
	if (!hasAcceptedAgreement.value && value.trim()) {
		pendingProviderKey.value = activeProvider.value
		pendingFieldKey.value = fieldKey
		pendingFieldValue.value = value
		securityAgreementOpen.value = true
		securityAgreementChecked.value = false
		return
	}
}

async function saveProviderConfig() {
	if (!activeProvider.value || saving.value) return
	const prov = getProvider(activeProvider.value)
	if (!prov) return

	saving.value = true
	try {
		const keyPayload: Record<string, string> = {
			deepseekApiKey: String(form.deepseekApiKey || ''),
			geminiApiKey: String(form.geminiApiKey || ''),
			bytedanceApiKey: String(form.bytedanceApiKey || ''),
			meshyApiKey: String(form.meshyApiKey || ''),
			githubToken: String(form.githubToken || ''),
			anthropicApiKey: String(form.anthropicApiKey || ''),
		}

		for (const f of prov.fields) {
			const val = String(pendingForm[f.key] || '').trim()
			keyPayload[String(f.key)] = val
			form[f.key] = val as ClientSettings[typeof f.key]
		}

		const keyRes = await saveEncryptedAICredentials(keyPayload as any)
		if (!keyRes.ok) {
			showSaveMessage(t('settings.saveFailed', { msg: keyRes.error || t('common.error') }))
			return
		}

		await saveClientSettings(buildSavePayload())
		showSaveMessage(t('settings.saveSuccess'))
		closeProvider()
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }))
	} finally {
		saving.value = false
	}
}

async function saveResolution() {
	if (saving.value) return
	saving.value = true
	try {
		const r = await saveClientSettings(buildSavePayload())
		if (r?.ok) showSaveMessage(t('settings.saveSuccess'))
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }))
	} finally {
		saving.value = false
	}
}

function handleResolutionChange() {
	saveResolution()
}

async function saveNetworkSettings() {
	if (saving.value) return
	saving.value = true
	try {
		const r = await saveClientSettings(buildSavePayload())
		if (r?.ok) showSaveMessage(t('settings.saveSuccess'))
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }))
	} finally {
		saving.value = false
	}
}

function openSource() {
	if (!repoUrl) return
	void openExternalUrl(repoUrl)
}

function openDocsForProvider(key: string | null) {
	if (!key) return
	const prov = providers.value.find((p) => p.key === key)
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
	form.geminiBaseUrl = String(form.geminiBaseUrl || '')
	form.httpProxy = String(form.httpProxy || '')
	for (const key of ['deepseekApiKey', 'geminiApiKey', 'bytedanceApiKey', 'meshyApiKey', 'githubToken', 'anthropicApiKey'] as const) {
		if (!(key in form) || typeof form[key] !== 'string') form[key] = ''
	}
	if (!form.ui) form.ui = { locale: '' }
	if (!form.apiKeySecurityAgreement) {
		form.apiKeySecurityAgreement = {
			accepted: false,
			acceptedAt: 0,
			acceptedVersion: '',
		}
	}
	loading.value = false
}

async function acceptSecurityAgreement() {
	if (!securityAgreementChecked.value) return

	form.apiKeySecurityAgreement = {
		accepted: true,
		acceptedAt: Date.now(),
		acceptedVersion: API_KEY_AGREEMENT_VERSION,
	}

	await saveClientSettings(buildSavePayload())

	securityAgreementOpen.value = false

	if (pendingFieldKey.value && pendingFieldValue.value !== undefined) {
		pendingForm[pendingFieldKey.value] = pendingFieldValue.value
		pendingFieldKey.value = null
		pendingFieldValue.value = ''
		pendingProviderKey.value = null
	}
}

function cancelSecurityAgreement() {
	securityAgreementOpen.value = false
	if (pendingFieldKey.value) {
		pendingForm[pendingFieldKey.value] = form[pendingFieldKey.value] || ''
	}
	pendingFieldKey.value = null
	pendingFieldValue.value = ''
	pendingProviderKey.value = null
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
		githubToken: '',
		anthropicApiKey: '',
	})
	if (!r.ok) showSaveMessage(t('settings.clearFailed', { msg: r.error || t('common.error') }))
	else {
		form.deepseekApiKey = ''
		form.geminiApiKey = ''
		form.bytedanceApiKey = ''
		form.meshyApiKey = ''
		form.githubToken = ''
		form.anthropicApiKey = ''

		await saveClientSettings(buildSavePayload())

		showSaveMessage(t('settings.clearedSuccess'))
	}
	clearing.value = false
	clearOpen.value = false
}

onMounted(() => {
	load()
})

onUnmounted(() => {
	if (saveMsgTimer.value) clearTimeout(saveMsgTimer.value)
})

watch(locale, () => {
})

const {
	status: platformStatus,
	isSteam: platformIsSteam,
	isMock: platformIsMock,
	isRealPlatform: platformIsReal,
	displayName: platformDisplayName,
	overlayEnabled: platformOverlayEnabled,
	overlayActive: platformOverlayActive,
	overlayActivate,
} = usePlatform()

const agreementItemKeys = ['storage', 'risk', 'permission', 'transmission', 'disclaimer'] as const

function getAgreementItemKey(itemKey: string, field: 'title' | 'desc') {
	return `settings.securityAgreement.items.${itemKey}.${field}` as const
}

const platformStatusClass = computed(() => {
	const s = platformStatus.value
	if (!s) return 'unknown'
	if (s.available && s.initialized && s.loggedIn) return 'ok'
	if (s.available && !s.loggedIn) return 'warn'
	return 'mock'
})

const platformStatusText = computed(() => {
	const s = platformStatus.value
	if (!s) return t('settings.platform.detecting')
	if (platformIsSteam.value) {
		return s.user?.displayName ? t('settings.platform.steamUser', { name: s.user.displayName }) : 'Steam'
	}
	if (platformIsReal.value) return platformDisplayName.value
	return t('settings.platform.mockMode')
})

const platformHintText = computed(() => {
	const s = platformStatus.value
	if (!s) return ''
	if (platformIsMock.value) {
		return t('settings.platform.mockHint')
	}
	if (platformIsSteam.value && !s.loggedIn) {
		return t('settings.platform.steamNotLoggedIn')
	}
	if (platformIsSteam.value && s.loggedIn) {
		return t('settings.platform.steamLoggedIn', { name: s.user?.displayName || t('settings.platform.steamUserUnknown') })
	}
	return ''
})

const activeProviderConfig = computed(() => getProvider(activeProvider.value))

async function handleOpenOverlayStore() {
	if (!platformOverlayEnabled.value) return
	await overlayActivate('steam')
}

async function handleOpenOverlayCommunity() {
	if (!platformOverlayEnabled.value) return
	await overlayActivate('community')
}
</script>

<template>
	<div class="settings-root">
		<div class="settings-page" :class="{ loading: loading }">
		<header class="settings-header">
			<div class="settings-header-inner">
				<div class="settings-header-text">
					<h1 class="settings-title">{{ t('settings.title') }}</h1>
					<p class="settings-sub">{{ t('settings.subtitle') }}</p>
				</div>
				<div class="settings-header-actions">
					<button v-if="repoUrl" class="btn btn-ghost" type="button" @click="openSource">
						<svg viewBox="0 0 24 24" aria-hidden="true" class="btn-icon-sm">
							<path
								fill="currentColor"
								d="M12 2C6.477 2 2 6.486 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.486 17.522 2 12 2Z"
							/>
						</svg>
						{{ t('settings.viewSource') }}
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						:disabled="saving || clearing"
						@click="clearOpen = true"
					>
						{{ t('settings.clearAllCredentials') }}
					</button>
				</div>
			</div>
			<p v-if="saveMsg" class="settings-flash">{{ saveMsg }}</p>
		</header>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">{{ t('settings.defaultOutput') }}</h2>
				<p class="section-desc">{{ t('settings.defaultOutputDesc') }}</p>
			</div>
			<div class="resolution-card">
				<div class="resolution-row">
					<label class="resolution-label">{{ t('settings.defaultResolution') }}</label>
					<select v-model="form.defaultResolution" class="resolution-select" @change="handleResolutionChange">
						<option value="1920x1080">{{ t('settings.resolutions.1080p') }}</option>
						<option value="1280x720">{{ t('settings.resolutions.720p') }}</option>
						<option value="1080x1920">{{ t('settings.resolutions.portrait') }}</option>
						<option value="3840x2160">{{ t('settings.resolutions.4k') }}</option>
					</select>
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">{{ t('settings.platformIntegration') }}</h2>
				<p class="section-desc">{{ t('settings.platformDesc') }}</p>
			</div>
			<div class="platform-card">
				<div class="platform-header">
					<div class="platform-info">
						<div class="platform-badge" :class="platformStatusClass">
							<span class="platform-dot" />
							<span class="platform-name">{{ platformStatusText }}</span>
						</div>
						<div v-if="platformStatus" class="platform-meta">
							<span v-if="platformStatus.available">{{ t('settings.platformAvailable') }}</span>
							<span v-if="platformStatus.initialized">{{ t('settings.platformInitialized') }}</span>
							<span v-if="platformStatus.loggedIn">{{ t('settings.platformLoggedIn') }}</span>
						</div>
					</div>
				</div>

				<div v-if="platformHintText" class="platform-hint">
					{{ platformHintText }}
				</div>

				<div v-if="platformIsSteam && platformStatus?.user" class="platform-user">
					<div class="platform-avatar">
						{{ platformStatus.user.displayName?.charAt(0) || '?' }}
					</div>
					<div class="platform-user-info">
						<div class="platform-user-name">{{ platformStatus.user.displayName }}</div>
						<div v-if="platformStatus.user.steamId" class="platform-user-id">Steam ID: {{ platformStatus.user.steamId }}</div>
					</div>
				</div>

				<div v-if="platformStatus?.installedDlcs?.length" class="platform-dlcs">
					<div class="platform-dlcs-label">{{ t('settings.installedDlcs') }}</div>
					<div class="platform-dlc-tags">
						<span v-for="dlc in platformStatus.installedDlcs" :key="dlc.appId" class="platform-dlc-tag">
							{{ dlc.name }}
						</span>
					</div>
				</div>

				<div v-if="platformOverlayEnabled" class="platform-overlay">
					<div class="platform-overlay-status">
						<span class="overlay-dot" :class="{ active: platformOverlayActive }" />
						Steam Overlay {{ platformOverlayActive ? t('settings.overlayActive') : t('settings.overlayAvailable') }}
					</div>
					<div class="platform-overlay-actions">
						<button class="btn btn-sm" type="button" @click="handleOpenOverlayStore">
							{{ t('settings.openStore') }}
						</button>
						<button class="btn btn-sm" type="button" @click="handleOpenOverlayCommunity">
							{{ t('settings.openCommunity') }}
						</button>
					</div>
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">{{ t('settings.network.title') }}</h2>
				<p class="section-desc">{{ t('settings.network.desc') }}</p>
			</div>
			<div class="network-card">
				<div class="network-row">
					<label class="network-label">
						<span>{{ t('settings.network.httpProxyLabel') }}</span>
						<small style="color: var(--vscode-fg-muted); font-size: 11px;">{{ t('settings.network.httpProxyHint') }}</small>
					</label>
					<input
						v-model="form.httpProxy"
						class="network-input"
						type="text"
						placeholder="http://127.0.0.1:7890"
						autocomplete="off"
						spellcheck="false"
						@blur="saveNetworkSettings"
					/>
				</div>
				<div class="network-row">
					<label class="network-label">
						<span>{{ t('settings.network.geminiBaseUrlLabel') }}</span>
						<small style="color: var(--vscode-fg-muted); font-size: 11px;">{{ t('settings.network.geminiBaseUrlHint') }}</small>
					</label>
					<input
						v-model="form.geminiBaseUrl"
						class="network-input"
						type="text"
						placeholder="https://generativelanguage.googleapis.com/v1beta"
						autocomplete="off"
						spellcheck="false"
						@blur="saveNetworkSettings"
					/>
				</div>
				<div class="network-tip" style="margin-top: 12px; padding: 12px; background: rgba(34,160,107,0.08); border-radius: 6px; font-size: 12px; color: var(--vscode-fg-muted); line-height: 1.6;">
					<div style="font-weight: 600; color: #22a06b; margin-bottom: 6px;">{{ t('settings.network.proxyGuideTitle') }}</div>
					<div>{{ t('settings.network.proxyGuideStep1') }}</div>
					<div>{{ t('settings.network.proxyGuideStep2') }}</div>
					<div>{{ t('settings.network.proxyGuideStep3') }}</div>
					<div>{{ t('settings.network.proxyGuideStep4') }}</div>
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">{{ t('settings.aiServices') }}</h2>
				<p class="section-desc">
					{{ t('settings.aiServicesDesc') }}
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
						<div class="provider-desc">{{ t(prov.descKey) }}</div>
						<div class="provider-status">
							<span class="status-dot" :class="{ configured: !!prov.formValue(form) }"></span>
							<span class="status-text">{{ prov.formValue(form) ? t('settings.configured') : t('settings.notConfigured') }}</span>
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

	<ModalDialog
		v-if="activeProvider"
		:open="activeProvider !== null"
		:title="(activeProviderConfig?.name || '') + ' · ' + t('settings.configCredentials')"
		:show-confirm="true"
		:confirm-text="t('settings.save')"
		:close-text="t('common.cancel')"
		:disable-confirm="saving"
		@close="closeProvider"
		@confirm="saveProviderConfig"
	>
		<template v-if="activeProviderConfig">
			<div class="provider-modal-body">
				<div
					class="provider-modal-head"
					:style="{ '--accent': activeProviderConfig.accent }"
				>
					<div class="provider-badge-lg">
						<span>{{ activeProviderConfig.icon }}</span>
					</div>
					<div>
						<div class="provider-modal-name">
							{{ activeProviderConfig.name }}
						</div>
						<div class="provider-modal-desc">
							{{ t(activeProviderConfig.descKey) }}
						</div>
					</div>
				</div>

				<div class="provider-modal-fields">
					<label
						v-for="f in activeProviderConfig.fields"
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
							@input="handleFieldInput(f.key)"
						/>
					</label>
				</div>

				<div class="provider-modal-tip">
				<span>{{ t('settings.noApiKey') }}</span>
				<button
					type="button"
					class="provider-modal-link"
					@click="openDocsForProvider(activeProvider)"
				>{{ t('settings.getFromConsole') }}</button>
			</div>
			</div>
		</template>
	</ModalDialog>

	<ModalDialog
		:open="securityAgreementOpen"
		:title="t('settings.securityAgreement.title')"
		:confirm-text="t('settings.securityAgreement.agree')"
		:close-text="t('common.cancel')"
		:disable-confirm="!securityAgreementChecked"
		@close="cancelSecurityAgreement"
		@confirm="acceptSecurityAgreement"
	>
		<div class="agreement-body">
			<div class="agreement-content">
				<div class="agreement-section">
					<h3 class="agreement-h3">🔒 {{ t('settings.securityAgreement.title') }}</h3>
					<p class="agreement-p">{{ t('settings.securityAgreement.intro') }}</p>
					<ol class="agreement-list">
						<li v-for="key in agreementItemKeys" :key="key">
							<strong>{{ t(getAgreementItemKey(key, 'title')) }}</strong>{{ t(getAgreementItemKey(key, 'desc')) }}
						</li>
					</ol>
					<p class="agreement-p">{{ t('settings.securityAgreement.conclusion') }}</p>
				</div>
			</div>

			<label class="agreement-check">
				<input v-model="securityAgreementChecked" type="checkbox" class="agreement-checkbox" />
				<span>{{ t('settings.securityAgreement.readAndAgree') }}</span>
			</label>
		</div>
	</ModalDialog>

	<ModalDialog
		:open="clearOpen"
		:title="t('settings.clearCredentialsTitle')"
		:confirm-text="t('settings.confirmClear')"
		:close-text="t('common.cancel')"
		:disable-confirm="clearing || saving"
		@close="clearOpen = false"
		@confirm="confirmClearCredentials"
	>
		<div class="agreement-body">
			<div class="agreement-loading">
				{{ t('settings.clearCredentialsWarning') }}
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
	padding: 32px clamp(24px, 4vw, 64px) 32px 88px;
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
	margin: -32px calc(-1 * clamp(24px, 4vw, 64px)) 24px -88px;
	padding: 24px clamp(24px, 4vw, 64px) 18px 88px;
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
	color: #22a06b;
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

.network-card {
	background: var(--dweb-defualt);
	border: 1px solid var(--vscode-border);
	border-radius: 10px;
	padding: 20px;
	max-width: 600px;
}

.network-row {
	margin-bottom: 16px;
}

.network-row:last-child {
	margin-bottom: 0;
}

.network-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 8px;
	font-size: 13px;
	font-weight: 500;
	color: var(--vscode-fg);
}

.network-input {
	width: 100%;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--vscode-border);
	background: var(--vscode-input-bg, var(--dweb-defualt-dark));
	color: var(--vscode-fg);
	font-size: 13px;
	padding: 10px 12px;
	border-radius: 6px;
	outline: none;
	font-family: var(--vscode-editor-font-family, monospace);
}

.network-input:focus {
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
	gap: 16px;
}

.agreement-content {
	max-height: 400px;
	overflow-y: auto;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	padding: 16px;
	font-size: 13px;
	line-height: 1.7;
	color: var(--vscode-fg);
}

.agreement-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.agreement-h3 {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	color: var(--theme-accent);
}

.agreement-p {
	margin: 0;
	color: var(--vscode-fg);
}

.agreement-list {
	margin: 0;
	padding-left: 20px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.agreement-list li {
	color: var(--vscode-fg-muted);
}

.agreement-list li strong {
	color: var(--vscode-fg);
}

.agreement-loading {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg-muted);
	padding: 10px 12px;
	font-size: 12.5px;
	line-height: 1.6;
}

.agreement-check {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	color: var(--vscode-fg);
	font-size: 13px;
	cursor: pointer;
	user-select: none;
}

.agreement-checkbox {
	width: 16px;
	height: 16px;
	margin-top: 2px;
	flex-shrink: 0;
	cursor: pointer;
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

.platform-card {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	padding: 20px;
	max-width: 760px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.platform-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.platform-info {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.platform-badge {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	padding: 6px 12px;
	border-radius: 4px;
	background: var(--dweb-defualt-dark);
}

.platform-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
}

.platform-badge.unknown .platform-dot {
	background: var(--vscode-fg-muted);
}

.platform-badge.ok .platform-dot {
	background: #22a06b;
}

.platform-badge.warn .platform-dot {
	background: #f0ad4e;
}

.platform-badge.mock .platform-dot {
	background: #6e7681;
}

.platform-meta {
	display: flex;
	gap: 12px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.platform-meta span {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.platform-meta span::before {
	content: '';
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #22a06b;
}

.platform-hint {
	font-size: 12.5px;
	color: var(--vscode-fg);
	padding: 12px;
	background: rgba(60, 148, 255, 0.12);
	border: 1px solid rgba(60, 148, 255, 0.32);
	line-height: 1.5;
}

.platform-user {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px;
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
}

.platform-avatar {
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: linear-gradient(135deg, #1b2838, #2a475e);
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	font-weight: 600;
	flex-shrink: 0;
}

.platform-user-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.platform-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.platform-user-id {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	font-family: monospace;
}

.platform-dlcs {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.platform-dlcs-label {
	font-size: 12.5px;
	color: var(--vscode-fg-muted);
	font-weight: 500;
}

.platform-dlc-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.platform-dlc-tag {
	font-size: 12px;
	padding: 4px 10px;
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	color: var(--vscode-fg);
}

.platform-overlay {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
	padding: 12px;
	background: rgba(94, 196, 127, 0.08);
	border: 1px solid rgba(94, 196, 127, 0.25);
}

.platform-overlay-status {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: var(--vscode-fg);
}

.overlay-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--vscode-fg-muted);
}

.overlay-dot.active {
	background: #22a06b;
	box-shadow: 0 0 8px rgba(34, 160, 107, 0.5);
}

.platform-overlay-actions {
	display: flex;
	gap: 8px;
}

.btn-sm {
	padding: 6px 12px;
	font-size: 12px;
}
</style>
