<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { getClientSettings, saveClientSettings, openExternalUrl } from '../electronBridge'
import type { ClientSettings, EnvironmentCheckResult, CliModelInfo, CheckStatus, AgentThinkingEffort } from '../electronBridge/types'
import { saveEncryptedAICredentials } from '../network/AICredentialService'
import { cliCheckEnvironment, cliGetAdapterConfig, cliSaveAdapterConfig, cliRunFixCommand, cliStartAuthFlow, cliCancelAuth, cliResetAdapterConfig, type AuthStreamChunk } from '../network/CLIChatService'
import { setCopilotEnabled, setDynamicCopilotModels, setCodexEnabled, setDynamicCodexModels, convertCliModelsToCatalog, refreshChatModelCatalog } from '../ai/models/chatModels'
import ModalDialog from '../ui/UIComponent/ModalDialog.vue'
import { usePlatform } from '../platformBridge'
import { useI18n } from '../i18n'
import { DEFAULT_AGENT_SETTINGS, AGENT_CONFIG_CONSTRAINTS, validateMaxToolCalls } from '../core/agent/agentConfig'

const { t, locale } = useI18n()

const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'
const API_KEY_AGREEMENT_VERSION = '1.0'

type ClientSettingsKey = keyof ClientSettings
type ApiKeyFieldKey = 'geminiApiKey' | 'bytedanceApiKey' | 'meshyApiKey' | 'tripo3dApiKey' | 'githubToken'

type ProviderType = 'apikey' | 'cli-check'

type ProviderConfig = {
	key: string
	name: string
	descKey: string
	accent: string
	icon: string
	type: ProviderType
	adapterName?: string
	fields?: Array<{ key: ApiKeyFieldKey; label: string; placeholder: string; mask: boolean }>
	docsUrl?: string
	formKey?: ApiKeyFieldKey
	formValue?: (s: ClientSettings) => string
}

const loading = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const saveMsgType = ref<'success' | 'error'>('success')
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
	geminiApiKey: '',
	geminiModel: FIXED_GEMINI_MODEL,
	geminiBaseUrl: '',
	httpProxy: '',
	bytedanceApiKey: '',
	meshyApiKey: '',
	tripo3dApiKey: '',
	githubToken: '',
	ui: {
		locale: '',
	},
	apiKeySecurityAgreement: {
		accepted: false,
		acceptedAt: 0,
		acceptedVersion: '',
	},
	cliAdapters: {},
	agent: { ...DEFAULT_AGENT_SETTINGS },
})

const activeProvider = ref<string | null>(null)
const pendingForm = reactive<Partial<Record<ApiKeyFieldKey, string>>>({})

const copilotChecking = ref(false)
const copilotCheckResult = ref<EnvironmentCheckResult | null>(null)
const copilotCheckError = ref('')
const copilotSavedConfig = ref<{ enabled: boolean; models?: CliModelInfo[] } | null>(null)
const copilotModels = ref<CliModelInfo[]>([])
const copilotFixingKey = ref<string | null>(null)
const copilotFixMessage = ref<{ key: string; ok: boolean; msg: string } | null>(null)

const codexChecking = ref(false)
const codexCheckResult = ref<EnvironmentCheckResult | null>(null)
const codexCheckError = ref('')
const codexSavedConfig = ref<{ enabled: boolean; models?: CliModelInfo[] } | null>(null)
const codexModels = ref<CliModelInfo[]>([])
const codexFixingKey = ref<string | null>(null)
const codexFixMessage = ref<{ key: string; ok: boolean; msg: string } | null>(null)

const codexAuthModalOpen = ref(false)
const codexAuthRunning = ref(false)
const codexAuthState = ref<'idle' | 'starting' | 'spawned' | 'code_ready' | 'browser_opened' | 'browser_open_failed' | 'waiting' | 'success' | 'error' | 'manual_auth' | 'fallback_manual'>('idle')
const codexAuthMessage = ref('')
const codexAuthError = ref('')
const codexAuthVerificationUri = ref('')
const codexAuthUserCode = ref('')
const codexAuthExpiresIn = ref(900)
const codexAuthCopied = ref(false)
const codexAuthCmdCopied = ref(false)
const codexAuthRawOutput = ref('')
const codexAuthDefaultUri = ref('https://auth.openai.com/codex/device')
let codexAuthAbortController: AbortController | null = null

const hasAcceptedAgreement = computed(() => {
	return Boolean(form.apiKeySecurityAgreement?.accepted)
})

const providers = computed<ProviderConfig[]>(() => [
	{
		key: 'gemini',
		name: t('settings.providers.gemini.name'),
		descKey: 'settings.providers.gemini.desc',
		accent: '#22a06b',
		icon: t('settings.providers.gemini.icon'),
		type: 'apikey',
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
		type: 'apikey',
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
		type: 'apikey',
		fields: [{ key: 'meshyApiKey', label: t('settings.fields.apiKey'), placeholder: 'mshy_...', mask: true }],
		docsUrl: 'https://docs.meshy.ai/reference/api-key',
		formKey: 'meshyApiKey',
		formValue: (s: ClientSettings) => s.meshyApiKey,
	},
	{
		key: 'tripo3d',
		name: t('settings.providers.tripo3d.name'),
		descKey: 'settings.providers.tripo3d.desc',
		accent: '#06b6d4',
		icon: t('settings.providers.tripo3d.icon'),
		type: 'apikey',
		fields: [{ key: 'tripo3dApiKey', label: t('settings.fields.apiKey'), placeholder: 'tripo_...', mask: true }],
		docsUrl: 'https://developers.tripo3d.com/zh/docs/quick-start',
		formKey: 'tripo3dApiKey',
		formValue: (s: ClientSettings) => s.tripo3dApiKey || '',
	},
	{
		key: 'github',
		name: 'GitHub Copilot',
		descKey: 'settings.providers.github.desc',
		accent: '#24292e',
		icon: 'CP',
		type: 'cli-check',
		adapterName: 'copilot',
		docsUrl: 'https://cli.github.com/',
	},
	{
		key: 'codex',
		name: 'OpenAI Codex',
		descKey: 'settings.providers.codex.desc',
		accent: '#10a37f',
		icon: 'CDX',
		type: 'cli-check',
		adapterName: 'codex',
		docsUrl: 'https://developers.openai.com/codex',
	},
])

function showSaveMessage(msg: string, type: 'success' | 'error' = 'success', duration = 3000) {
	saveMsg.value = msg
	saveMsgType.value = type
	if (saveMsgTimer.value) clearTimeout(saveMsgTimer.value)
	saveMsgTimer.value = setTimeout(() => {
		saveMsg.value = ''
	}, duration)
}

async function saveAgentSettings() {
	try {
		if (!form.agent) {
			form.agent = { ...DEFAULT_AGENT_SETTINGS }
		}
		form.agent.maxToolCalls = validateMaxToolCalls(form.agent.maxToolCalls)
		await saveClientSettings(buildSavePayload())
		showSaveMessage(t('settings.agent.settingsSaved'))
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	}
}

function onMaxToolCallsInput(event: Event) {
	const input = event.target as HTMLInputElement
	let value = parseInt(input.value, 10)
	if (isNaN(value)) value = DEFAULT_AGENT_SETTINGS.maxToolCalls
	value = validateMaxToolCalls(value)
	if (form.agent) {
		form.agent.maxToolCalls = value
	}
}

function onMaxToolCallsChange() {
	saveAgentSettings()
}

function onAgentSwitchChange() {
	saveAgentSettings()
}

function onThinkingEffortChange() {
	saveAgentSettings()
}

function buildSavePayload(overrides: Partial<ClientSettings> = {}): ClientSettings {
	const payload: ClientSettings = {
		defaultResolution: form.defaultResolution,
		geminiApiKey: form.geminiApiKey,
		geminiModel: FIXED_GEMINI_MODEL,
		geminiBaseUrl: String(form.geminiBaseUrl || '').trim(),
		httpProxy: String(form.httpProxy || '').trim(),
		bytedanceApiKey: form.bytedanceApiKey,
		meshyApiKey: form.meshyApiKey,
		tripo3dApiKey: form.tripo3dApiKey || '',
		githubToken: form.githubToken,
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
		cliAdapters: form.cliAdapters ? JSON.parse(JSON.stringify(form.cliAdapters)) : {},
		agent: form.agent ? { ...form.agent } : { ...DEFAULT_AGENT_SETTINGS },
		...overrides,
	}
	return payload
}

function getProvider(key: string | null) {
	return providers.value.find((p) => p.key === key) || null
}

const hasPendingKey = (key: string) => {
	const prov = providers.value.find((p) => p.key === key)
	if (!prov || prov.type !== 'apikey' || !prov.fields) return false
	return prov.fields.some((f) => String(pendingForm[f.key] || '').trim())
}

function isCopilotConfigured() {
	return Boolean(form.cliAdapters?.copilot?.enabled && form.cliAdapters?.copilot?.models?.length)
}

function isCodexConfigured() {
	return Boolean(form.cliAdapters?.codex?.enabled && form.cliAdapters?.codex?.models?.length)
}

function getProviderStatus(prov: ProviderConfig) {
	if (prov.type === 'cli-check') {
		if (prov.key === 'github') return isCopilotConfigured()
		if (prov.key === 'codex') return isCodexConfigured()
		return false
	}
	return prov.formValue ? !!prov.formValue(form) : false
}

async function runCopilotEnvironmentCheck() {
	if (copilotChecking.value) return
	copilotChecking.value = true
	copilotCheckError.value = ''
	copilotCheckResult.value = null
	try {
		const result = await cliCheckEnvironment('copilot')
		const resultData = (result as any)?.value || (result as any)?.data
		if (result?.ok && resultData) {
			copilotCheckResult.value = resultData
			if (resultData.models && resultData.models.length > 0) {
				copilotModels.value = resultData.models
			}
		} else {
			copilotCheckError.value = result?.error || t('copilot.checkFailed')
		}
	} catch (e: unknown) {
		copilotCheckError.value = e instanceof Error ? e.message : String(e)
	} finally {
		copilotChecking.value = false
	}
}

async function loadCopilotSavedConfig() {
	try {
		const result = await cliGetAdapterConfig('copilot')
		const resultData = (result as any)?.value || (result as any)?.data
		if (result?.ok && resultData?.config) {
			copilotSavedConfig.value = resultData.config
			if (resultData.config.models && resultData.config.models.length > 0) {
				copilotModels.value = resultData.config.models
			}
		}
	} catch {
		copilotSavedConfig.value = null
	}
}

async function enableCopilot() {
	if (!copilotCheckResult.value?.allPassed) return
	saving.value = true
	try {
		const models = copilotCheckResult.value.models || copilotModels.value
		const saveRes = await cliSaveAdapterConfig('copilot', { enabled: true, models })
		if (saveRes?.ok) {
			if (!form.cliAdapters) form.cliAdapters = {}
			form.cliAdapters.copilot = {
				enabled: true,
				configuredAt: new Date().toISOString(),
				lastCheckedAt: copilotCheckResult.value.checkedAt,
				version: copilotCheckResult.value.version,
				models,
			}
			await saveClientSettings(buildSavePayload())
			copilotSavedConfig.value = { enabled: true, models }
			setCopilotEnabled(true)
			if (models?.length) {
				const catalogModels = convertCliModelsToCatalog(models)
				setDynamicCopilotModels(catalogModels)
			}
			refreshChatModelCatalog()
			showSaveMessage(t('settings.saveSuccess'))
			closeProvider()
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: saveRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function disableCopilot() {
	saving.value = true
	try {
		const saveRes = await cliSaveAdapterConfig('copilot', { enabled: false })
		if (saveRes?.ok) {
			if (form.cliAdapters?.copilot) {
				form.cliAdapters.copilot.enabled = false
			}
			await saveClientSettings(buildSavePayload())
			copilotSavedConfig.value = { enabled: false, models: copilotSavedConfig.value?.models }
			setCopilotEnabled(false)
			setDynamicCopilotModels([])
			refreshChatModelCatalog()
			showSaveMessage(t('settings.saveSuccess'))
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: saveRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function resetCopilotConfig() {
	saving.value = true
	try {
		const resetRes = await cliResetAdapterConfig('copilot')
		if (resetRes?.ok) {
			if (form.cliAdapters?.copilot) {
				delete form.cliAdapters.copilot
			}
			await saveClientSettings(buildSavePayload())
			copilotSavedConfig.value = null
			copilotCheckResult.value = null
			copilotCheckError.value = ''
			copilotModels.value = []
			copilotFixMessage.value = null
			setCopilotEnabled(false)
			setDynamicCopilotModels([])
			refreshChatModelCatalog()
			showSaveMessage('Copilot 配置已重置，请重新检测环境')
			setTimeout(() => runCopilotEnvironmentCheck(), 500)
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: resetRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function runCopilotFix(checkKey: string) {
	copilotFixingKey.value = checkKey
	copilotFixMessage.value = null
	try {
		const result = await cliRunFixCommand('copilot', checkKey)
		const resultData = (result as any)?.value || (result as any)?.data
		if (result?.ok && resultData) {
			copilotFixMessage.value = { key: checkKey, ok: resultData.ok, msg: resultData.message || (resultData.ok ? '修复成功' : '修复失败') }
			if (resultData.ok && !resultData.interactive) {
				setTimeout(() => {
					runCopilotEnvironmentCheck()
				}, 800)
			}
		} else {
			copilotFixMessage.value = { key: checkKey, ok: false, msg: result?.error || '修复命令执行失败' }
		}
	} catch (e: unknown) {
		copilotFixMessage.value = { key: checkKey, ok: false, msg: String(e) }
	} finally {
		copilotFixingKey.value = null
	}
}

async function runCodexEnvironmentCheck() {
	if (codexChecking.value) return
	codexChecking.value = true
	codexCheckError.value = ''
	codexCheckResult.value = null
	try {
		const result = await cliCheckEnvironment('codex')
		const resultData = (result as any)?.value || (result as any)?.data
		if (result?.ok && resultData) {
			codexCheckResult.value = resultData
			if (resultData.models && resultData.models.length > 0) {
				codexModels.value = resultData.models
			}
		} else {
			codexCheckError.value = result?.error || t('codex.checkFailed')
		}
	} catch (e: unknown) {
		codexCheckError.value = e instanceof Error ? e.message : String(e)
	} finally {
		codexChecking.value = false
	}
}

async function loadCodexSavedConfig() {
	try {
		const result = await cliGetAdapterConfig('codex')
		const resultData = (result as any)?.value || (result as any)?.data
		if (result?.ok && resultData?.config) {
			codexSavedConfig.value = resultData.config
			if (resultData.config.models && resultData.config.models.length > 0) {
				codexModels.value = resultData.config.models
			}
		}
	} catch {
		codexSavedConfig.value = null
	}
}

async function enableCodex() {
	if (!codexCheckResult.value?.allPassed) return
	saving.value = true
	try {
		const models = codexCheckResult.value.models || codexModels.value
		const saveRes = await cliSaveAdapterConfig('codex', { enabled: true, models })
		if (saveRes?.ok) {
			if (!form.cliAdapters) form.cliAdapters = {}
			form.cliAdapters.codex = {
				enabled: true,
				configuredAt: new Date().toISOString(),
				lastCheckedAt: codexCheckResult.value.checkedAt,
				version: codexCheckResult.value.version,
				models,
			}
			await saveClientSettings(buildSavePayload())
			codexSavedConfig.value = { enabled: true, models }
			setCodexEnabled(true)
			if (models?.length) {
				const catalogModels = convertCliModelsToCatalog(models, 'codex')
				setDynamicCodexModels(catalogModels)
			}
			refreshChatModelCatalog()
			showSaveMessage(t('settings.saveSuccess'))
			closeProvider()
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: saveRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function disableCodex() {
	saving.value = true
	try {
		const saveRes = await cliSaveAdapterConfig('codex', { enabled: false })
		if (saveRes?.ok) {
			if (form.cliAdapters?.codex) {
				form.cliAdapters.codex.enabled = false
			}
			await saveClientSettings(buildSavePayload())
			codexSavedConfig.value = { enabled: false, models: codexSavedConfig.value?.models }
			setCodexEnabled(false)
			setDynamicCodexModels([])
			refreshChatModelCatalog()
			showSaveMessage(t('settings.saveSuccess'))
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: saveRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function resetCodexConfig() {
	saving.value = true
	try {
		const resetRes = await cliResetAdapterConfig('codex')
		if (resetRes?.ok) {
			if (form.cliAdapters?.codex) {
				delete form.cliAdapters.codex
			}
			await saveClientSettings(buildSavePayload())
			codexSavedConfig.value = null
			codexCheckResult.value = null
			codexCheckError.value = ''
			codexModels.value = []
			codexFixMessage.value = null
			setCodexEnabled(false)
			setDynamicCodexModels([])
			refreshChatModelCatalog()
			showSaveMessage('Codex 配置已重置，请重新检测环境')
			setTimeout(() => runCodexEnvironmentCheck(), 500)
		} else {
			showSaveMessage(t('settings.saveFailed', { msg: resetRes?.error || t('common.error') }), 'error')
		}
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
	} finally {
		saving.value = false
	}
}

async function runCodexFix(checkKey: string) {
	codexFixingKey.value = checkKey
	codexFixMessage.value = null
	try {
		const result = await cliRunFixCommand('codex', checkKey)
		const resultData = (result && typeof result === 'object' && 'ok' in result && !('value' in result) && !('data' in result))
			? result
			: ((result as any)?.value || (result as any)?.data)
		if (result?.ok && resultData) {
			if (resultData.requiresStreamAuth) {
				codexFixingKey.value = null
				startCodexAuth()
				return
			}
			codexFixMessage.value = { key: checkKey, ok: resultData.ok, msg: resultData.message || (resultData.ok ? '修复成功' : '修复失败') }
			if (resultData.ok && !resultData.interactive && !resultData.requiresStreamAuth) {
				setTimeout(() => {
					runCodexEnvironmentCheck()
				}, 800)
			}
		} else {
			codexFixMessage.value = { key: checkKey, ok: false, msg: result?.error || '修复命令执行失败' }
		}
	} catch (e: unknown) {
		codexFixMessage.value = { key: checkKey, ok: false, msg: String(e) }
	} finally {
		codexFixingKey.value = null
	}
}

function resetCodexAuthState() {
	codexAuthState.value = 'idle'
	codexAuthMessage.value = ''
	codexAuthError.value = ''
	codexAuthVerificationUri.value = ''
	codexAuthUserCode.value = ''
	codexAuthExpiresIn.value = 900
	codexAuthCopied.value = false
	codexAuthCmdCopied.value = false
	codexAuthRawOutput.value = ''
	codexAuthDefaultUri.value = 'https://auth.openai.com/codex/device'
}

async function copyTextToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text)
			return true
		}
	} catch {}
	try {
		const textarea = document.createElement('textarea')
		textarea.value = text
		textarea.style.position = 'fixed'
		textarea.style.left = '-9999px'
		textarea.style.top = '-9999px'
		document.body.appendChild(textarea)
		textarea.focus()
		textarea.select()
		const ok = document.execCommand('copy')
		document.body.removeChild(textarea)
		return ok
	} catch {
		return false
	}
}

async function startCodexAuth() {
	if (codexAuthRunning.value) return

	resetCodexAuthState()
	codexAuthModalOpen.value = true
	codexAuthRunning.value = true
	codexAuthState.value = 'starting'
	codexAuthMessage.value = '正在启动认证流程...'

	codexAuthAbortController = new AbortController()
	const signal = codexAuthAbortController.signal

	try {
		const generator = cliStartAuthFlow('codex')
		for await (const chunk of generator) {
			if (signal.aborted) break
			handleAuthChunk(chunk)
		}
	} catch (err: unknown) {
		if (!signal.aborted) {
			codexAuthState.value = 'error'
			codexAuthError.value = err instanceof Error ? err.message : String(err)
		}
	} finally {
		codexAuthRunning.value = false
		codexAuthAbortController = null
	}
}

function startManualAuthMode() {
	resetCodexAuthState()
	codexAuthRunning.value = true
	codexAuthState.value = 'manual_auth'
	codexAuthMessage.value = '请在终端执行 codex login --device-auth 完成认证'
}

function handleAuthChunk(chunk: AuthStreamChunk) {
	switch (chunk.type) {
		case 'starting':
			codexAuthState.value = 'starting'
			codexAuthMessage.value = chunk.message
			break
		case 'spawned':
			codexAuthState.value = 'spawned'
			codexAuthMessage.value = chunk.message
			break
		case 'raw_output':
			codexAuthRawOutput.value += chunk.text
			break
		case 'fallback_manual':
			codexAuthState.value = 'fallback_manual'
			codexAuthMessage.value = chunk.message
			codexAuthDefaultUri.value = chunk.defaultUri || 'https://auth.openai.com/codex/device'
			codexAuthRawOutput.value = chunk.rawOutput || codexAuthRawOutput.value
			break
		case 'code_ready':
			codexAuthState.value = 'code_ready'
			codexAuthMessage.value = chunk.message
			codexAuthVerificationUri.value = chunk.verificationUri
			codexAuthUserCode.value = chunk.userCode
			codexAuthExpiresIn.value = chunk.expiresIn || 900
			break
		case 'browser_opened':
			codexAuthState.value = 'browser_opened'
			codexAuthMessage.value = chunk.message
			break
		case 'browser_open_failed':
			codexAuthState.value = 'browser_open_failed'
			codexAuthMessage.value = chunk.message
			codexAuthVerificationUri.value = chunk.verificationUri
			break
		case 'waiting':
			codexAuthState.value = 'waiting'
			codexAuthMessage.value = chunk.message
			break
		case 'success':
			codexAuthState.value = 'success'
			codexAuthMessage.value = chunk.message
			setTimeout(() => {
				codexAuthModalOpen.value = false
				runCodexEnvironmentCheck()
			}, 1500)
			break
		case 'error':
			codexAuthState.value = 'error'
			codexAuthError.value = chunk.message
			break
	}
}

async function cancelCodexAuth() {
	if (codexAuthAbortController) {
		codexAuthAbortController.abort()
	}
	try {
		await cliCancelAuth('codex')
	} catch {}
	codexAuthRunning.value = false
	codexAuthModalOpen.value = false
	resetCodexAuthState()
}

async function copyCodexAuthCode() {
	if (!codexAuthUserCode.value) return
	const ok = await copyTextToClipboard(codexAuthUserCode.value)
	if (ok) {
		codexAuthCopied.value = true
		setTimeout(() => { codexAuthCopied.value = false }, 2000)
	}
}

async function copyManualAuthCommand() {
	const ok = await copyTextToClipboard('codex login --device-auth')
	if (ok) {
		codexAuthCmdCopied.value = true
		setTimeout(() => { codexAuthCmdCopied.value = false }, 2000)
	}
}

async function handleCodexAuthConfirm() {
	if (codexAuthState.value === 'success') {
		codexAuthModalOpen.value = false
		return
	}
	await runCodexEnvironmentCheck()
	if (codexCheckResult.value?.allPassed) {
		codexAuthModalOpen.value = false
	} else {
		codexAuthMessage.value = '尚未检测到认证成功，请确认已在浏览器/终端中完成认证步骤'
	}
}

function openCodexAuthUrl() {
	const url = codexAuthVerificationUri.value || codexAuthDefaultUri.value
	if (!url) return
	openExternalUrl(url)
}

function openProvider(key: string) {
	const prov = providers.value.find((p) => p.key === key)
	if (!prov) return
	if (prov.type === 'apikey' && prov.fields) {
		for (const f of prov.fields) pendingForm[f.key] = form[f.key] || ''
	}
	activeProvider.value = key

	if (key === 'github') {
		copilotCheckResult.value = null
		copilotCheckError.value = ''
		copilotModels.value = []
		copilotFixMessage.value = null
		loadCopilotSavedConfig()
	}
	if (key === 'codex') {
		codexCheckResult.value = null
		codexCheckError.value = ''
		codexModels.value = []
		codexFixMessage.value = null
		loadCodexSavedConfig()
	}
}

function closeProvider() {
	activeProvider.value = null
	for (const k of Object.keys(pendingForm) as ApiKeyFieldKey[]) delete pendingForm[k]
	copilotCheckResult.value = null
	copilotCheckError.value = ''
	copilotChecking.value = false
	codexCheckResult.value = null
	codexCheckError.value = ''
	codexChecking.value = false
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
	if (!prov || prov.type !== 'apikey') return

	saving.value = true
	try {
		const keyPayload: Record<string, string> = {
			geminiApiKey: String(form.geminiApiKey || ''),
			bytedanceApiKey: String(form.bytedanceApiKey || ''),
			meshyApiKey: String(form.meshyApiKey || ''),
			tripo3dApiKey: String(form.tripo3dApiKey || ''),
			githubToken: String(form.githubToken || ''),
		}

		for (const f of prov.fields || []) {
			const val = String(pendingForm[f.key] || '').trim()
			keyPayload[String(f.key)] = val
			;(form as unknown as Record<string, string>)[f.key] = val
		}

		const keyRes = await saveEncryptedAICredentials(keyPayload as any)
		if (!keyRes.ok) {
			showSaveMessage(t('settings.saveFailed', { msg: keyRes.error || t('common.error') }), 'error')
			return
		}

		await saveClientSettings(buildSavePayload())
		showSaveMessage(t('settings.saveSuccess'))
		closeProvider()
	} catch (e: unknown) {
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
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
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
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
		showSaveMessage(t('settings.saveFailed', { msg: String(e) }), 'error')
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

function openHelpUrl(url?: string) {
	if (!url) return
	void openExternalUrl(url)
}

function getCheckStatusClass(status: CheckStatus) {
	switch (status) {
		case 'pass': return 'check-pass'
		case 'fail': return 'check-fail'
		case 'warn': return 'check-warn'
		case 'skipped': return 'check-skipped'
		case 'pending': return 'check-pending'
		default: return 'check-pending'
	}
}

function getCheckStatusIcon(status: CheckStatus) {
	switch (status) {
		case 'pass': return '✓'
		case 'fail': return '✗'
		case 'warn': return '⚠'
		case 'skipped': return '○'
		case 'pending': return '⋯'
		default: return '⋯'
	}
}

function getCheckStatusLabel(status: CheckStatus) {
	switch (status) {
		case 'pass': return t('copilot.checkPass')
		case 'fail': return t('copilot.checkFail')
		case 'warn': return t('copilot.checkWarn')
		case 'skipped': return t('copilot.checkSkipped')
		case 'pending': return t('copilot.checkPending')
		default: return ''
	}
}

function isAutoFixable(checkKey: string): boolean {
	return checkKey === 'copilot_extension' || checkKey === 'gh_auth'
}

async function load() {
	loading.value = true
	const r = await getClientSettings()
	if (r?.ok && r.data) Object.assign(form, r.data)
	form.geminiModel = FIXED_GEMINI_MODEL
	form.geminiBaseUrl = String(form.geminiBaseUrl || '')
	form.httpProxy = String(form.httpProxy || '')
	for (const key of ['geminiApiKey', 'bytedanceApiKey', 'meshyApiKey', 'tripo3dApiKey', 'githubToken'] as const) {
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
	if (!form.cliAdapters) form.cliAdapters = {}
	if (!form.agent) {
		form.agent = { ...DEFAULT_AGENT_SETTINGS }
	} else {
		form.agent = {
			...DEFAULT_AGENT_SETTINGS,
			...form.agent,
		}
		form.agent.maxToolCalls = validateMaxToolCalls(form.agent.maxToolCalls)
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
		geminiApiKey: '',
		bytedanceApiKey: '',
		meshyApiKey: '',
		tripo3dApiKey: '',
		githubToken: '',
	})
	if (!r.ok) showSaveMessage(t('settings.clearFailed', { msg: r.error || t('common.error') }), 'error')
	else {
		form.geminiApiKey = ''
		form.bytedanceApiKey = ''
		form.meshyApiKey = ''
		form.tripo3dApiKey = ''
		form.githubToken = ''

		await saveClientSettings(buildSavePayload())

		showSaveMessage(t('settings.clearedSuccess'))
	}
	clearing.value = false
	clearOpen.value = false
}

onMounted(() => {
	load()
	loadCodexSavedConfig()
})

onUnmounted(() => {
	if (saveMsgTimer.value) clearTimeout(saveMsgTimer.value)
	if (codexAuthRunning.value) {
		cancelCodexAuth()
	}
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

const isActiveProviderCliCheck = computed(() => {
	return activeProviderConfig.value?.type === 'cli-check'
})

const canEnableCopilot = computed(() => {
	return copilotCheckResult.value?.allPassed === true && copilotModels.value.length > 0
})

const canEnableCodex = computed(() => {
	return codexCheckResult.value?.allPassed === true && codexModels.value.length > 0
})
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
			<p v-if="saveMsg" :class="['settings-flash', saveMsgType === 'error' ? 'settings-flash-error' : '']">{{ saveMsg }}</p>
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
							<span class="status-dot" :class="{ configured: getProviderStatus(prov) }"></span>
							<span class="status-text">
								{{ getProviderStatus(prov) ? t('settings.configured') : t('settings.notConfigured') }}
							</span>
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

		<section class="settings-section">
			<div class="section-head">
				<h2 class="section-title">{{ t('settings.agent.title') }}</h2>
				<p class="section-desc">{{ t('settings.agent.desc') }}</p>
			</div>
			<div class="agent-card">
				<div class="agent-group">
					<h3 class="agent-group-title">{{ t('settings.agent.conversationLimits') }}</h3>
					<div class="agent-row">
						<label class="agent-label">
							<span>{{ t('settings.agent.maxToolCalls') }}</span>
							<small class="agent-hint">{{ t('settings.agent.maxToolCallsHint') }}</small>
						</label>
						<div class="agent-number-input">
							<input
								v-model.number="form.agent!.maxToolCalls"
								type="number"
								:min="AGENT_CONFIG_CONSTRAINTS.maxToolCalls.min"
								:max="AGENT_CONFIG_CONSTRAINTS.maxToolCalls.max"
								:step="AGENT_CONFIG_CONSTRAINTS.maxToolCalls.step"
								class="agent-input"
								@input="onMaxToolCallsInput"
								@change="onMaxToolCallsChange"
							/>
							<div class="agent-number-controls">
								<button type="button" class="agent-number-btn" @click="form.agent && (form.agent.maxToolCalls = Math.max(AGENT_CONFIG_CONSTRAINTS.maxToolCalls.min, form.agent.maxToolCalls - AGENT_CONFIG_CONSTRAINTS.maxToolCalls.step)); onMaxToolCallsChange()">−</button>
								<button type="button" class="agent-number-btn" @click="form.agent && (form.agent.maxToolCalls = Math.min(AGENT_CONFIG_CONSTRAINTS.maxToolCalls.max, form.agent.maxToolCalls + AGENT_CONFIG_CONSTRAINTS.maxToolCalls.step)); onMaxToolCallsChange()">+</button>
							</div>
						</div>
					</div>
					<div class="agent-switch-row">
						<label class="agent-switch-label">{{ t('settings.agent.enableToolCallWarning') }}</label>
						<label class="toggle-switch">
							<input type="checkbox" v-model="form.agent!.enableToolCallWarning" @change="onAgentSwitchChange" />
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>

				<div class="agent-group">
					<h3 class="agent-group-title">{{ t('settings.agent.conversationExperience') }}</h3>
					<div class="agent-row">
						<label class="agent-label">
							<span>{{ t('settings.agent.thinkingEffort') }}</span>
							<small class="agent-hint">{{ t('settings.agent.thinkingEffortHint') }}</small>
						</label>
						<select v-model="form.agent!.defaultThinkingEffort" class="agent-select" @change="onThinkingEffortChange">
							<option value="disabled">{{ t('settings.agent.thinkingEffortDisabled') }}</option>
							<option value="low">{{ t('settings.agent.thinkingEffortLow') }}</option>
							<option value="medium">{{ t('settings.agent.thinkingEffortMedium') }}</option>
							<option value="high">{{ t('settings.agent.thinkingEffortHigh') }}</option>
						</select>
					</div>
					<div class="agent-switch-row">
						<label class="agent-switch-label">{{ t('settings.agent.showThoughtProcess') }}</label>
						<label class="toggle-switch">
							<input type="checkbox" v-model="form.agent!.showThoughtProcess" @change="onAgentSwitchChange" />
							<span class="toggle-slider"></span>
						</label>
					</div>
					<div class="agent-switch-row">
						<label class="agent-switch-label">{{ t('settings.agent.autoScrollToBottom') }}</label>
						<label class="toggle-switch">
							<input type="checkbox" v-model="form.agent!.autoScrollToBottom" @change="onAgentSwitchChange" />
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>
			</div>
		</section>
	</div>

	<ModalDialog
		v-if="activeProvider && !isActiveProviderCliCheck"
		:open="activeProvider !== null && !isActiveProviderCliCheck"
		:title="(activeProviderConfig?.name || '') + ' · ' + t('settings.configCredentials')"
		:show-confirm="true"
		:confirm-text="t('settings.save')"
		:close-text="t('common.cancel')"
		:disable-confirm="saving"
		@close="closeProvider"
		@confirm="saveProviderConfig"
	>
		<template v-if="activeProviderConfig && activeProviderConfig.type === 'apikey'">
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
		v-if="activeProvider === 'github' && isActiveProviderCliCheck"
		:open="activeProvider === 'github' && isActiveProviderCliCheck"
		:title="activeProviderConfig?.name + ' · ' + t('copilot.envCheck')"
		:show-confirm="canEnableCopilot"
		:confirm-text="t('copilot.enable')"
		:close-text="t('common.cancel')"
		:disable-confirm="saving || !canEnableCopilot"
		:wider="true"
		@close="closeProvider"
		@confirm="enableCopilot"
	>
		<template v-if="activeProviderConfig">
			<div class="copilot-modal-body">
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
						<div v-if="copilotSavedConfig?.enabled" class="copilot-enabled-badge">
							<span class="copilot-enabled-dot" />
							{{ t('copilot.alreadyEnabled') }}
						</div>
					</div>
				</div>

				<div class="copilot-actions">
					<button
						class="btn btn-primary"
						type="button"
						:disabled="copilotChecking"
						@click="runCopilotEnvironmentCheck"
					>
						<span v-if="copilotChecking" class="btn-spinner" />
						{{ copilotChecking ? t('copilot.checking') : t('copilot.runCheck') }}
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						:disabled="saving || copilotChecking"
						@click="resetCopilotConfig"
						title="重置所有配置和登录状态，重新检测环境"
					>
						<svg v-if="!saving" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;">
							<path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
						</svg>
						<span v-if="saving" class="btn-spinner" />
						{{ saving ? '重置中...' : '重置' }}
					</button>
					<button
						v-if="copilotSavedConfig?.enabled"
						class="btn btn-ghost"
						type="button"
						:disabled="saving"
						@click="disableCopilot"
					>
						{{ t('copilot.disable') }}
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						@click="openDocsForProvider('github')"
					>
						{{ t('copilot.installGuide') }}
					</button>
				</div>

				<div v-if="copilotCheckError" class="copilot-error">
					<div class="copilot-error-title">{{ t('copilot.checkFailed') }}</div>
					<div class="copilot-error-msg">{{ copilotCheckError }}</div>
				</div>

				<div v-if="!copilotCheckResult && !copilotChecking && !copilotCheckError" class="copilot-hint">
					<div class="copilot-hint-title">{{ t('copilot.readyToCheck') }}</div>
					<div class="copilot-hint-steps">
						<div class="copilot-hint-step">1. {{ t('copilot.step1') }}</div>
						<div class="copilot-hint-step">2. {{ t('copilot.step2') }}</div>
						<div class="copilot-hint-step">3. {{ t('copilot.step3') }}</div>
					</div>
				</div>

				<div v-if="copilotCheckResult" class="copilot-checks">
					<div class="copilot-checks-header">
						<span :class="['copilot-overall', copilotCheckResult.allPassed ? 'copilot-overall-pass' : 'copilot-overall-fail']">
							{{ copilotCheckResult.allPassed ? t('copilot.allPassed') : t('copilot.hasIssues') }}
						</span>
						<span v-if="copilotCheckResult.version" class="copilot-version">
							v{{ copilotCheckResult.version }}
						</span>
					</div>
					<div class="copilot-check-list">
						<div
							v-for="check in copilotCheckResult.checks"
							:key="check.key"
							class="copilot-check-item"
							:class="getCheckStatusClass(check.status)"
						>
							<div class="copilot-check-icon">{{ getCheckStatusIcon(check.status) }}</div>
							<div class="copilot-check-body">
								<div class="copilot-check-label">{{ check.label }}</div>
								<div v-if="check.message" class="copilot-check-msg">{{ check.message }}</div>
								<div v-if="check.action" class="copilot-check-action">
									<span>{{ t('copilot.suggestedAction') }}:</span>
									<code class="copilot-check-cmd">{{ check.action.command || check.action.label }}</code>
									<button
										v-if="check.status === 'fail' && isAutoFixable(check.key)"
										class="copilot-fix-btn"
										type="button"
										:disabled="copilotFixingKey === check.key"
										@click="runCopilotFix(check.key)"
									>
										<span v-if="copilotFixingKey === check.key" class="btn-spinner" />
										{{ copilotFixingKey === check.key ? t('copilot.fixing') : t('copilot.fixNow') }}
									</button>
									<button
										v-if="check.helpUrl"
										class="copilot-check-link"
										type="button"
										@click="openHelpUrl(check.helpUrl)"
									>
										{{ check.action.label }} →
									</button>
								</div>
								<div
									v-if="copilotFixMessage && copilotFixMessage.key === check.key"
									class="copilot-fix-result"
									:class="copilotFixMessage.ok ? 'fix-ok' : 'fix-fail'"
								>
									{{ copilotFixMessage.msg }}
								</div>
							</div>
							<div class="copilot-check-status-label">{{ getCheckStatusLabel(check.status) }}</div>
						</div>
					</div>

					<div v-if="copilotModels.length > 0" class="copilot-models">
						<div class="copilot-models-header">
							{{ t('copilot.availableModels') }}
							<span class="copilot-models-count">{{ copilotModels.length }}</span>
						</div>
						<div class="copilot-model-list">
							<div v-for="m in copilotModels" :key="m.id" class="copilot-model-tag" :class="{ recommended: m.recommended }">
								<span class="copilot-model-name">{{ m.label }}</span>
								<span v-if="m.recommended" class="copilot-model-badge">{{ t('copilot.recommended') }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</ModalDialog>

	<ModalDialog
		v-if="activeProvider === 'codex' && isActiveProviderCliCheck"
		:open="activeProvider === 'codex' && isActiveProviderCliCheck"
		:title="activeProviderConfig?.name + ' · ' + t('codex.envCheck')"
		:show-confirm="canEnableCodex"
		:confirm-text="t('codex.enable')"
		:close-text="t('common.cancel')"
		:disable-confirm="saving || !canEnableCodex"
		:wider="true"
		@close="closeProvider"
		@confirm="enableCodex"
	>
		<template v-if="activeProviderConfig">
			<div class="copilot-modal-body">
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
						<div v-if="codexSavedConfig?.enabled" class="copilot-enabled-badge">
							<span class="copilot-enabled-dot" />
							{{ t('codex.alreadyEnabled') }}
						</div>
					</div>
				</div>

				<div class="copilot-actions">
					<button
						class="btn btn-primary"
						type="button"
						:disabled="codexChecking"
						@click="runCodexEnvironmentCheck"
					>
						<span v-if="codexChecking" class="btn-spinner" />
						{{ codexChecking ? t('codex.checking') : t('codex.runCheck') }}
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						:disabled="saving || codexChecking"
						@click="resetCodexConfig"
						title="重置所有配置和登录状态，重新检测环境"
					>
						<svg v-if="!saving" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;">
							<path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
						</svg>
						<span v-if="saving" class="btn-spinner" />
						{{ saving ? '重置中...' : '重置' }}
					</button>
					<button
						v-if="codexSavedConfig?.enabled"
						class="btn btn-ghost"
						type="button"
						:disabled="saving"
						@click="disableCodex"
					>
						{{ t('codex.disable') }}
					</button>
					<button
						class="btn btn-ghost"
						type="button"
						@click="openDocsForProvider('codex')"
					>
						{{ t('codex.installGuide') }}
					</button>
				</div>

				<div v-if="codexCheckError" class="copilot-error">
					<div class="copilot-error-title">{{ t('codex.checkFailed') }}</div>
					<div class="copilot-error-msg">{{ codexCheckError }}</div>
				</div>

				<div v-if="!codexCheckResult && !codexChecking && !codexCheckError" class="copilot-hint">
					<div class="copilot-hint-title">{{ t('codex.readyToCheck') }}</div>
					<div class="copilot-hint-steps">
						<div class="copilot-hint-step">1. {{ t('codex.step1') }}</div>
						<div class="copilot-hint-step">2. {{ t('codex.step2') }}</div>
						<div class="copilot-hint-step">3. {{ t('codex.step3') }}</div>
					</div>
				</div>

				<div v-if="codexCheckResult" class="copilot-checks">
					<div class="copilot-checks-header">
						<span :class="['copilot-overall', codexCheckResult.allPassed ? 'copilot-overall-pass' : 'copilot-overall-fail']">
							{{ codexCheckResult.allPassed ? t('codex.allPassed') : t('codex.hasIssues') }}
						</span>
						<span v-if="codexCheckResult.version" class="copilot-version">
							v{{ codexCheckResult.version }}
						</span>
					</div>
					<div class="copilot-check-list">
						<div
							v-for="check in codexCheckResult.checks"
							:key="check.key"
							class="copilot-check-item"
							:class="getCheckStatusClass(check.status)"
						>
							<div class="copilot-check-icon">{{ getCheckStatusIcon(check.status) }}</div>
							<div class="copilot-check-body">
								<div class="copilot-check-label">{{ check.label }}</div>
								<div v-if="check.message" class="copilot-check-msg">{{ check.message }}</div>
								<div v-if="check.action" class="copilot-check-action">
									<span>{{ t('codex.suggestedAction') }}:</span>
									<code class="copilot-check-cmd">{{ check.action.command || check.action.label }}</code>
									<button
										v-if="check.status === 'fail'"
										class="copilot-fix-btn"
										type="button"
										:disabled="codexFixingKey === check.key"
										@click="runCodexFix(check.key)"
									>
										<span v-if="codexFixingKey === check.key" class="btn-spinner" />
										{{ codexFixingKey === check.key ? t('codex.fixing') : t('codex.fixNow') }}
									</button>
									<button
										v-if="check.helpUrl"
										class="copilot-check-link"
										type="button"
										@click="openHelpUrl(check.helpUrl)"
									>
										{{ check.action.label }} →
									</button>
								</div>
								<div
									v-if="codexFixMessage && codexFixMessage.key === check.key"
									class="copilot-fix-result"
									:class="codexFixMessage.ok ? 'fix-ok' : 'fix-fail'"
								>
									{{ codexFixMessage.msg }}
								</div>
							</div>
							<div class="copilot-check-status-label">{{ getCheckStatusLabel(check.status) }}</div>
						</div>
					</div>

					<div v-if="codexModels.length > 0" class="copilot-models">
						<div class="copilot-models-header">
							{{ t('codex.availableModels') }}
							<span class="copilot-models-count">{{ codexModels.length }}</span>
						</div>
						<div class="copilot-model-list">
							<div v-for="m in codexModels" :key="m.id" class="copilot-model-tag" :class="{ recommended: m.recommended }">
								<span class="copilot-model-name">{{ m.label }}</span>
								<span v-if="m.recommended" class="copilot-model-badge">{{ t('codex.recommended') }}</span>
							</div>
						</div>
					</div>
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

	<ModalDialog
		:open="codexAuthModalOpen"
		title="Codex 登录"
		:confirm-text="codexAuthState === 'success' ? '完成' : (codexAuthState === 'manual_auth' || codexAuthState === 'fallback_manual' ? '我已在浏览器完成认证' : '我已在浏览器完成')"
		:close-text="codexAuthRunning ? '取消认证' : '关闭'"
		:disable-confirm="codexAuthState === 'starting'"
		:show-confirm="codexAuthState !== 'error'"
		:close-on-backdrop="!codexAuthRunning"
		@close="cancelCodexAuth"
		@confirm="handleCodexAuthConfirm"
	>
		<div class="codex-auth-body">
			<div v-if="codexAuthState === 'starting'" class="codex-auth-loading">
				<div class="codex-auth-spinner" />
				<p>{{ codexAuthMessage || '正在启动认证流程...' }}</p>
			</div>

			<div v-else-if="codexAuthState === 'spawned'" class="codex-auth-spawned">
				<div class="codex-auth-spinner" />
				<p>{{ codexAuthMessage || '认证进程已启动...' }}</p>
				<div v-if="codexAuthRawOutput" class="codex-auth-output">
					<div class="codex-auth-output-header">命令行输出：</div>
					<pre class="codex-auth-output-pre">{{ codexAuthRawOutput }}</pre>
				</div>
			</div>

			<div v-else-if="codexAuthState === 'fallback_manual'" class="codex-auth-fallback">
				<div class="codex-auth-fallback-icon">⚠️</div>
				<p class="codex-auth-fallback-title">{{ codexAuthMessage || '自动获取验证码较慢，请手动打开认证页面' }}</p>
				<div v-if="codexAuthRawOutput" class="codex-auth-output">
					<div class="codex-auth-output-header">命令行输出：</div>
					<pre class="codex-auth-output-pre">{{ codexAuthRawOutput }}</pre>
				</div>
				<div class="codex-auth-fallback-actions">
					<button class="btn btn-primary codex-auth-open-btn" type="button" @click="openCodexAuthUrl()">
						手动打开认证页面
					</button>
				</div>
				<p class="codex-auth-fallback-hint">在浏览器中完成认证后，点击下方「我已在浏览器完成认证」按钮</p>
			</div>

			<div v-else-if="codexAuthState === 'error'" class="codex-auth-error">
				<div class="codex-auth-error-icon">✗</div>
				<p class="codex-auth-error-title">认证失败</p>
				<p class="codex-auth-error-msg">{{ codexAuthError }}</p>
				<div class="codex-auth-error-actions">
					<button class="btn btn-primary codex-auth-retry-btn" type="button" @click="startCodexAuth()">
						重试自动认证
					</button>
					<button class="btn codex-auth-manual-btn" type="button" @click="startManualAuthMode()">
						在终端手动认证
					</button>
				</div>
				<p class="codex-auth-error-hint">如果自动认证持续失败，请检查代理设置或使用终端手动执行 <code>codex login --device-auth</code></p>
			</div>

			<div v-else-if="codexAuthState === 'manual_auth'" class="codex-auth-manual">
				<div class="codex-auth-manual-icon">⌨️</div>
				<p class="codex-auth-manual-title">手动终端认证</p>
				<div class="codex-auth-manual-steps">
					<p>1. 打开一个新的终端窗口</p>
					<p>2. 执行命令：<code class="codex-auth-terminal-cmd" @click.stop="copyManualAuthCommand" :title="codexAuthCmdCopied ? '已复制!' : '点击复制'">codex login --device-auth</code><span v-if="codexAuthCmdCopied" style="color: #10a37f; font-size: 12px; margin-left: 6px;">✓ 已复制</span></p>
					<p>3. 按照终端提示在浏览器中完成认证</p>
					<p>4. 认证完成后点击下方「我已在终端完成认证」按钮</p>
				</div>
			</div>

			<div v-else-if="codexAuthState === 'success'" class="codex-auth-success">
				<div class="codex-auth-success-icon">✓</div>
				<p class="codex-auth-success-title">{{ codexAuthMessage || '登录成功！' }}</p>
			</div>

			<div v-else class="codex-auth-steps">
				<div class="codex-auth-step" :class="{ active: codexAuthState === 'code_ready', done: codexAuthState === 'waiting' || codexAuthState === 'browser_opened' }">
					<div class="codex-auth-step-num">1</div>
					<div class="codex-auth-step-content">
						<p class="codex-auth-step-title">复制验证码</p>
						<div v-if="codexAuthUserCode" class="codex-auth-code-box" @click="copyCodexAuthCode" title="点击复制验证码">
							<code class="codex-auth-code">{{ codexAuthUserCode }}</code>
							<button class="codex-auth-copy-btn" type="button" :title="codexAuthCopied ? '已复制!' : '复制'" @click.stop="copyCodexAuthCode">
								{{ codexAuthCopied ? '✓' : '📋' }}
							</button>
							<span v-if="codexAuthCopied" style="color: #10a37f; font-size: 12px;">已复制!</span>
						</div>
						<p v-else class="codex-auth-step-hint">正在获取验证码...</p>
					</div>
				</div>

				<div class="codex-auth-step" :class="{ active: codexAuthState === 'browser_opened' || codexAuthState === 'browser_open_failed' || codexAuthState === 'waiting', done: codexAuthState === 'waiting' }">
					<div class="codex-auth-step-num">2</div>
					<div class="codex-auth-step-content">
						<p class="codex-auth-step-title">打开认证页面</p>
						<div v-if="codexAuthVerificationUri" class="codex-auth-url-section">
							<p v-if="codexAuthState === 'browser_open_failed'" class="codex-auth-url-hint" style="color: #f85149;">⚠️ 自动打开浏览器失败，请手动点击下方链接：</p>
							<p v-else class="codex-auth-url-hint">浏览器应该已自动打开。如果没有打开，请手动点击下方链接：</p>
							<a class="codex-auth-url" href="javascript:void(0)" @click="openCodexAuthUrl()">{{ codexAuthVerificationUri }}</a>
						</div>
					</div>
				</div>

				<div class="codex-auth-step" :class="{ active: codexAuthState === 'waiting' }">
					<div class="codex-auth-step-num">3</div>
					<div class="codex-auth-step-content">
						<p class="codex-auth-step-title">完成登录</p>
						<div class="codex-auth-waiting">
							<div class="codex-auth-waiting-spinner" />
							<p>{{ codexAuthMessage || '请在浏览器中粘贴验证码并完成登录...' }}</p>
						</div>
					</div>
				</div>
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

.settings-flash-error {
	color: #e5484d;
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

.btn-spinner {
	width: 14px;
	height: 14px;
	border: 2px solid rgba(255,255,255,0.3);
	border-top-color: #fff;
	border-radius: 50%;
	animation: spin 0.7s linear infinite;
}

@keyframes spin {
	to { transform: rotate(360deg); }
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

.copilot-modal-body {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-height: 0;
}

.copilot-checks {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 0;
	overflow-y: auto;
	padding-right: 4px;
	max-height: 320px;
}

.copilot-enabled-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 6px;
	font-size: 11.5px;
	color: #22a06b;
	background: rgba(34,160,107,0.1);
	padding: 3px 8px;
	border-radius: 3px;
}

.copilot-enabled-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #22a06b;
}

.copilot-actions {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.copilot-error {
	padding: 12px;
	background: rgba(248, 81, 73, 0.08);
	border: 1px solid rgba(248, 81, 73, 0.25);
	border-radius: 6px;
}

.copilot-error-title {
	font-size: 13px;
	font-weight: 600;
	color: #f85149;
	margin-bottom: 4px;
}

.copilot-error-msg {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	font-family: monospace;
	word-break: break-all;
}

.copilot-hint {
	padding: 16px;
	background: var(--dweb-defualt-dark);
	border: 1px dashed var(--vscode-border);
	border-radius: 6px;
}

.copilot-hint-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--vscode-fg);
	margin-bottom: 10px;
}

.copilot-hint-steps {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.copilot-hint-step {
	font-size: 12.5px;
	color: var(--vscode-fg-muted);
	line-height: 1.5;
}

.copilot-checks-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 0 10px;
	border-bottom: 1px solid var(--vscode-border);
	position: sticky;
	top: 0;
	background: var(--wf-panel-bg-solid, var(--theme-bg-tertiary));
	z-index: 1;
}

.copilot-overall {
	font-size: 14px;
	font-weight: 600;
	padding: 4px 12px;
	border-radius: 4px;
}

.copilot-overall-pass {
	color: #22a06b;
	background: rgba(34,160,107,0.1);
}

.copilot-overall-fail {
	color: #f0ad4e;
	background: rgba(240,173,78,0.1);
}

.copilot-version {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	font-family: monospace;
}

.copilot-check-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.copilot-check-item {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 10px 12px;
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	border-left-width: 3px;
	border-radius: 4px;
}

.copilot-check-item.check-pass {
	border-left-color: #22a06b;
}

.copilot-check-item.check-fail {
	border-left-color: #f85149;
}

.copilot-check-item.check-warn {
	border-left-color: #f0ad4e;
}

.copilot-check-item.check-skipped {
	border-left-color: var(--vscode-fg-muted);
	opacity: 0.6;
}

.copilot-check-item.check-pending {
	border-left-color: var(--vscode-fg-muted);
}

.copilot-check-icon {
	width: 22px;
	height: 22px;
	flex: 0 0 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	font-weight: 700;
	border-radius: 50%;
	margin-top: 1px;
}

.check-pass .copilot-check-icon {
	color: #22a06b;
	background: rgba(34,160,107,0.12);
}

.check-fail .copilot-check-icon {
	color: #f85149;
	background: rgba(248,81,73,0.12);
}

.check-warn .copilot-check-icon {
	color: #f0ad4e;
	background: rgba(240,173,78,0.12);
}

.check-skipped .copilot-check-icon,
.check-pending .copilot-check-icon {
	color: var(--vscode-fg-muted);
	background: color-mix(in srgb, var(--vscode-fg-muted) 12%, transparent);
}

.copilot-check-body {
	flex: 1;
	min-width: 0;
}

.copilot-check-label {
	font-size: 13px;
	font-weight: 500;
	color: var(--vscode-fg);
}

.copilot-check-msg {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	margin-top: 3px;
	word-break: break-all;
}

.copilot-check-action {
	font-size: 11.5px;
	color: var(--vscode-fg-muted);
	margin-top: 6px;
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.copilot-check-cmd {
	font-family: var(--vscode-editor-font-family, monospace);
	font-size: 11px;
	padding: 2px 6px;
	background: rgba(0,0,0,0.2);
	border-radius: 3px;
	color: var(--vscode-fg);
}

.copilot-check-link {
	appearance: none;
	-webkit-appearance: none;
	background: transparent;
	border: 0;
	padding: 0;
	font: inherit;
	cursor: pointer;
	color: var(--theme-accent);
	font-size: 11.5px;
	font-weight: 500;
}

.copilot-check-link:hover {
	text-decoration: underline;
}

.copilot-fix-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid #22a06b;
	background: rgba(34,160,107,0.12);
	color: #22a06b;
	font-size: 11px;
	font-weight: 600;
	padding: 3px 10px;
	border-radius: 3px;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	transition: background 120ms ease;
}

.copilot-fix-btn:hover:not(:disabled) {
	background: rgba(34,160,107,0.25);
}

.copilot-fix-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.copilot-fix-result {
	margin-top: 6px;
	font-size: 11.5px;
	padding: 4px 8px;
	border-radius: 3px;
}

.copilot-fix-result.fix-ok {
	color: #22a06b;
	background: rgba(34,160,107,0.08);
}

.copilot-fix-result.fix-fail {
	color: #f85149;
	background: rgba(248,81,73,0.08);
}

.copilot-check-status-label {
	flex: 0 0 auto;
	font-size: 11px;
	font-weight: 500;
	padding: 2px 8px;
	border-radius: 3px;
	white-space: nowrap;
}

.check-pass .copilot-check-status-label {
	color: #22a06b;
	background: rgba(34,160,107,0.08);
}

.check-fail .copilot-check-status-label {
	color: #f85149;
	background: rgba(248,81,73,0.08);
}

.check-warn .copilot-check-status-label {
	color: #f0ad4e;
	background: rgba(240,173,78,0.08);
}

.check-skipped .copilot-check-status-label,
.check-pending .copilot-check-status-label {
	color: var(--vscode-fg-muted);
	background: color-mix(in srgb, var(--vscode-fg-muted) 8%, transparent);
}

.copilot-models {
	padding: 12px;
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	border-radius: 6px;
}

.copilot-models-header {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	font-weight: 600;
	color: var(--vscode-fg);
	margin-bottom: 10px;
}

.copilot-models-count {
	font-size: 11px;
	font-weight: 400;
	color: var(--vscode-fg-muted);
	background: color-mix(in srgb, var(--vscode-fg-muted) 12%, transparent);
	padding: 1px 7px;
	border-radius: 10px;
}

.copilot-model-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.copilot-model-tag {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	font-size: 12px;
	background: color-mix(in srgb, var(--vscode-fg-muted) 10%, transparent);
	border: 1px solid var(--vscode-border);
	border-radius: 4px;
	color: var(--vscode-fg);
}

.copilot-model-tag.recommended {
	border-color: rgba(34,160,107,0.4);
	background: rgba(34,160,107,0.08);
}

.copilot-model-badge {
	font-size: 10px;
	color: #22a06b;
	font-weight: 600;
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

.codex-auth-body {
	min-width: 420px;
	max-width: 520px;
	padding: 8px 0;
}

.codex-auth-loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
	padding: 32px 16px;
}

.codex-auth-spinner {
	width: 32px;
	height: 32px;
	border: 3px solid var(--vscode-border);
	border-top-color: #10a37f;
	border-radius: 50%;
	animation: codex-spin 0.8s linear infinite;
}

@keyframes codex-spin {
	to { transform: rotate(360deg); }
}

.codex-auth-loading p {
	margin: 0;
	font-size: 14px;
	color: var(--vscode-fg);
}

.codex-auth-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 24px 16px;
	text-align: center;
}

.codex-auth-error-icon {
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: rgba(248, 81, 73, 0.1);
	color: #f85149;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24px;
	font-weight: bold;
}

.codex-auth-error-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.codex-auth-error-msg {
	margin: 0;
	font-size: 13px;
	color: var(--vscode-fg-muted);
	word-break: break-word;
	line-height: 1.5;
}

.codex-auth-retry-btn {
	margin-top: 8px;
}

.codex-auth-error-actions {
	display: flex;
	gap: 10px;
	margin-top: 8px;
	flex-wrap: wrap;
	justify-content: center;
}

.codex-auth-manual-btn {
	margin-top: 8px;
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-button-border, transparent);
}

.codex-auth-manual-btn:hover {
	background: var(--vscode-button-secondaryHoverBackground);
}

.codex-auth-error-hint {
	margin: 4px 0 0;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	opacity: 0.8;
}

.codex-auth-error-hint code {
	background: rgba(255, 255, 255, 0.1);
	padding: 1px 6px;
	border-radius: 3px;
	font-family: monospace;
	font-size: 11px;
}

.codex-auth-manual {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 16px;
	text-align: center;
}

.codex-auth-manual-icon {
	font-size: 40px;
}

.codex-auth-manual-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.codex-auth-manual-steps {
	text-align: left;
	width: 100%;
	max-width: 380px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.codex-auth-manual-steps p {
	margin: 0;
	font-size: 13px;
	color: var(--vscode-fg);
	line-height: 1.6;
}

.codex-auth-terminal-cmd {
	display: inline-block;
	background: rgba(16, 163, 127, 0.12);
	color: #10a37f;
	padding: 3px 10px;
	border-radius: 4px;
	font-family: 'Consolas', 'Courier New', monospace;
	font-size: 12px;
	cursor: pointer;
	transition: background 0.15s;
	margin-left: 4px;
	user-select: all;
}

.codex-auth-terminal-cmd:hover {
	background: rgba(16, 163, 127, 0.25);
}

.codex-auth-success {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 32px 16px;
}

.codex-auth-success-icon {
	width: 56px;
	height: 56px;
	border-radius: 50%;
	background: rgba(16, 163, 127, 0.15);
	color: #10a37f;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 28px;
	font-weight: bold;
}

.codex-auth-success-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.codex-auth-steps {
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.codex-auth-step {
	display: flex;
	gap: 14px;
	opacity: 0.5;
	transition: opacity 0.2s;
}

.codex-auth-step.active,
.codex-auth-step.done {
	opacity: 1;
}

.codex-auth-step-num {
	width: 28px;
	height: 28px;
	border-radius: 50%;
	background: var(--vscode-border);
	color: var(--vscode-fg-muted);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	font-weight: 600;
	flex-shrink: 0;
}

.codex-auth-step.active .codex-auth-step-num {
	background: #10a37f;
	color: white;
}

.codex-auth-step.done .codex-auth-step-num {
	background: rgba(16, 163, 127, 0.2);
	color: #10a37f;
}

.codex-auth-step-content {
	flex: 1;
	min-width: 0;
}

.codex-auth-step-title {
	margin: 0 0 8px 0;
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.codex-auth-step-hint {
	margin: 0;
	font-size: 13px;
	color: var(--vscode-fg-muted);
}

.codex-auth-code-box {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 10px 14px;
	background: var(--dweb-defualt-dark, #1e1e1e);
	border: 1px solid var(--vscode-border);
	border-radius: 6px;
	cursor: pointer;
	user-select: none;
	transition: border-color 0.15s, background 0.15s;
}

.codex-auth-code-box:hover {
	border-color: #10a37f;
	background: rgba(16, 163, 127, 0.06);
}

.codex-auth-code {
	font-size: 22px;
	font-weight: 600;
	letter-spacing: 4px;
	color: #10a37f;
	font-family: 'Consolas', 'Monaco', monospace;
	cursor: pointer;
}

.codex-auth-copy-btn {
	background: none;
	border: none;
	font-size: 16px;
	cursor: pointer;
	padding: 4px 6px;
	border-radius: 4px;
	opacity: 0.7;
	transition: opacity 0.15s;
	color: #10a37f;
}

.codex-auth-copy-btn:hover {
	opacity: 1;
	background: rgba(16, 163, 127, 0.12);
}

.codex-auth-url-section {
	margin-top: 4px;
}

.codex-auth-url-hint {
	margin: 0 0 6px 0;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	line-height: 1.4;
}

.codex-auth-url {
	font-size: 12px;
	color: #58a6ff;
	word-break: break-all;
	text-decoration: underline;
	cursor: pointer;
}

.codex-auth-url:hover {
	color: #79b8ff;
}

.codex-auth-waiting {
	display: flex;
	align-items: center;
	gap: 10px;
}

.codex-auth-waiting-spinner {
	width: 18px;
	height: 18px;
	border: 2px solid var(--vscode-border);
	border-top-color: #10a37f;
	border-radius: 50%;
	animation: codex-spin 0.8s linear infinite;
	flex-shrink: 0;
}

.codex-auth-waiting p {
	margin: 0;
	font-size: 13px;
	color: var(--vscode-fg-muted);
}

.codex-auth-spawned {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 24px 0;
}

.codex-auth-spawned p {
	margin: 0;
	font-size: 14px;
	color: var(--vscode-fg);
}

.codex-auth-output {
	width: 100%;
	margin-top: 12px;
	background: var(--vscode-bg-tertiary, rgba(0, 0, 0, 0.3));
	border-radius: 8px;
	padding: 12px;
	box-sizing: border-box;
}

.codex-auth-output-header {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	margin-bottom: 8px;
	font-weight: 500;
}

.codex-auth-output-pre {
	margin: 0;
	padding: 0;
	font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg);
	white-space: pre-wrap;
	word-break: break-all;
	max-height: 200px;
	overflow-y: auto;
	user-select: text;
}

.codex-auth-fallback {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 20px 0;
}

.codex-auth-fallback-icon {
	font-size: 40px;
}

.codex-auth-fallback-title {
	margin: 0;
	font-size: 14px;
	color: var(--vscode-fg);
	text-align: center;
}

.codex-auth-fallback-actions {
	display: flex;
	gap: 12px;
	margin-top: 8px;
}

.codex-auth-open-btn {
	padding: 8px 20px;
}

.codex-auth-fallback-hint {
	margin: 8px 0 0 0;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	text-align: center;
}

.agent-card {
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.agent-group {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.agent-group-title {
	margin: 0;
	font-size: 13px;
	font-weight: 600;
	color: var(--vscode-fg);
	padding-bottom: 10px;
	border-bottom: 1px solid var(--vscode-border);
}

.agent-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.agent-label {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.agent-label > span {
	font-size: 13px;
	color: var(--vscode-fg);
	font-weight: 500;
}

.agent-hint {
	font-size: 11.5px;
	color: var(--vscode-fg-muted);
	line-height: 1.4;
}

.agent-number-input {
	display: flex;
	align-items: center;
	gap: 0;
}

.agent-input {
	width: 80px;
	background: var(--vscode-input-bg, var(--dweb-defualt-dark));
	color: var(--vscode-fg);
	border: 1px solid var(--vscode-border);
	border-right: none;
	padding: 8px 12px;
	font-size: 13px;
	outline: none;
	font-family: inherit;
	text-align: center;
	border-radius: 4px 0 0 4px;
	-moz-appearance: textfield;
}

.agent-input::-webkit-outer-spin-button,
.agent-input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.agent-input:focus {
	border-color: var(--vscode-border-accent, var(--theme-accent));
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 25%, transparent);
}

.agent-number-controls {
	display: flex;
	flex-direction: column;
}

.agent-number-btn {
	appearance: none;
	-webkit-appearance: none;
	background: var(--vscode-button-bg, rgba(255,255,255,0.06));
	color: var(--vscode-fg);
	border: 1px solid var(--vscode-border);
	width: 28px;
	height: 17px;
	padding: 0;
	font-size: 12px;
	line-height: 1;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.15s;
}

.agent-number-btn:first-child {
	border-radius: 0 4px 0 0;
	border-bottom: none;
}

.agent-number-btn:last-child {
	border-radius: 0 0 4px 0;
}

.agent-number-btn:hover {
	background: var(--vscode-button-hover-bg, rgba(255,255,255,0.12));
}

.agent-select {
	background: var(--vscode-input-bg, var(--dweb-defualt-dark));
	color: var(--vscode-fg);
	border: 1px solid var(--vscode-border);
	padding: 8px 32px 8px 12px;
	font-size: 13px;
	outline: none;
	font-family: inherit;
	border-radius: 4px;
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 10px center;
	min-width: 140px;
}

.agent-select:focus {
	border-color: var(--vscode-border-accent, var(--theme-accent));
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 25%, transparent);
}

.agent-switch-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 0;
}

.agent-switch-label {
	font-size: 13px;
	color: var(--vscode-fg);
}

.toggle-switch {
	position: relative;
	display: inline-block;
	width: 40px;
	height: 22px;
	flex-shrink: 0;
	cursor: pointer;
}

.toggle-switch input {
	opacity: 0;
	width: 0;
	height: 0;
}

.toggle-slider {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: var(--vscode-checkbox-border, rgba(255,255,255,0.2));
	border-radius: 11px;
	transition: background 0.2s;
}

.toggle-slider::before {
	content: '';
	position: absolute;
	height: 16px;
	width: 16px;
	left: 3px;
	top: 3px;
	background: white;
	border-radius: 50%;
	transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
	background: var(--theme-accent, #22a06b);
}

.toggle-switch input:checked + .toggle-slider::before {
	transform: translateX(18px);
}
</style>
