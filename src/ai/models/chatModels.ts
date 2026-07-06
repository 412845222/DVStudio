import { ref, computed } from 'vue'
import type { CliModelInfo } from '../../electronBridge/types'

export type ChatLegacyModelKey = 'deepseek' | 'nanobanana' | 'seedance' | 'codex' | 'meshy'
export type ChatNeedType = 'text' | 'image' | 'video'
export type ChatApiSource = 'all' | 'deepseek' | 'gemini' | 'bytedance' | 'local-exec' | 'copilot'

export type ChatModelCatalogItem = {
	id: string
	label: string
	needType: ChatNeedType
	apiSource: Exclude<ChatApiSource, 'all'>
	legacyModelKey: ChatLegacyModelKey
	vendor?: string
	recommended?: boolean
	supportsStructuredOutput?: boolean
	supportsVision?: boolean
}

const DEFAULT_COPILOT_MODELS: ChatModelCatalogItem[] = [
	{
		id: 'auto',
		label: 'Auto (推荐)',
		needType: 'text',
		apiSource: 'copilot',
		legacyModelKey: 'codex',
		vendor: 'GitHub Copilot',
		recommended: true
	},
	{
		id: 'gpt-5.4-mini',
		label: 'GPT-5.4 Mini',
		needType: 'text',
		apiSource: 'copilot',
		legacyModelKey: 'codex',
		vendor: 'GitHub Copilot',
	},
	{
		id: 'gpt-5.4',
		label: 'GPT-5.4',
		needType: 'text',
		apiSource: 'copilot',
		legacyModelKey: 'codex',
		vendor: 'GitHub Copilot',
		supportsVision: true
	},
	{
		id: 'claude-sonnet-4.5',
		label: 'Claude Sonnet 4.5',
		needType: 'text',
		apiSource: 'copilot',
		legacyModelKey: 'codex',
		vendor: 'GitHub Copilot'
	},
	{
		id: 'o4-mini',
		label: 'o4-mini',
		needType: 'text',
		apiSource: 'copilot',
		legacyModelKey: 'codex',
		vendor: 'GitHub Copilot'
	}
]

const dynamicCopilotModels = ref<ChatModelCatalogItem[]>([])
const copilotEnabled = ref(false)
const copilotModelsLoaded = ref(false)

export function convertCliModelsToCatalog(cliModels: CliModelInfo[]): ChatModelCatalogItem[] {
	return cliModels.map(m => ({
		id: m.id,
		label: m.label || m.id,
		needType: 'text' as const,
		apiSource: 'copilot' as const,
		legacyModelKey: 'codex' as ChatLegacyModelKey,
		vendor: m.vendor || 'GitHub Copilot',
		description: m.description,
		recommended: m.recommended
	}))
}

export function setDynamicCopilotModels(models: ChatModelCatalogItem[]) {
	dynamicCopilotModels.value = models
	copilotModelsLoaded.value = true
}

export function setCopilotEnabled(enabled: boolean) {
	copilotEnabled.value = enabled
}

export function isCopilotEnabled(): boolean {
	return copilotEnabled.value
}

export function getCopilotModels(): ChatModelCatalogItem[] {
	if (copilotModelsLoaded.value && dynamicCopilotModels.value.length > 0) {
		return dynamicCopilotModels.value
	}
	return DEFAULT_COPILOT_MODELS
}

function buildCatalog(): ChatModelCatalogItem[] {
	const models: ChatModelCatalogItem[] = []
	if (copilotEnabled.value) {
		const copilotModels = copilotModelsLoaded.value && dynamicCopilotModels.value.length > 0
			? dynamicCopilotModels.value
			: DEFAULT_COPILOT_MODELS
		models.push(...copilotModels)
	}
	models.push(
		{
			id: 'deepseek-chat',
			label: 'DeepSeek Chat',
			needType: 'text',
			apiSource: 'deepseek',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'doubao-seed-evolving',
			label: '豆包 Seed 快速迭代版',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-1-pro-260628',
			label: '豆包 Seed 2.1 Pro',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-1-turbo-260628',
			label: '豆包 Seed 2.1 Turbo',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-character-260628',
			label: '豆包 Seed 角色版',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-pro-260215',
			label: '豆包 Seed 2.0 Pro',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-lite-260428',
			label: '豆包 Seed 2.0 Lite 新版',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-mini-260428',
			label: '豆包 Seed 2.0 Mini 新版',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-lite-260215',
			label: '豆包 Seed 2.0 Lite',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-mini-260215',
			label: '豆包 Seed 2.0 Mini',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-2-0-code-preview-260215',
			label: '豆包 Seed 2.0 Code Preview',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-1-8-251228',
			label: '豆包 Seed 1.8',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-code-preview-251028',
			label: '豆包 Seed Code Preview',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true
		},
		{
			id: 'doubao-seed-1-6-lite-251015',
			label: '豆包 Seed 1.6 Lite',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-1-6-flash-250828',
			label: '豆包 Seed 1.6 Flash',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-1-6-vision-250815',
			label: '豆包 Seed 1.6 Vision',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true,
			supportsStructuredOutput: true,
			supportsVision: true
		},
		{
			id: 'doubao-seed-translation-250915',
			label: '豆包 Seed Translation',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '字节方舟',
			recommended: true
		},
		{
			id: 'glm-4-7-251222',
			label: 'GLM 4.7',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '智谱 AI',
			recommended: true
		},
		{
			id: 'glm-4-5-air',
			label: 'GLM 4.5 Air',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '智谱 AI',
			recommended: true
		},
		{
			id: 'deepseek-v4-pro-260425',
			label: 'DeepSeek V4 Pro',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-v4-flash-260425',
			label: 'DeepSeek V4 Flash',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-v3-2-251201',
			label: 'DeepSeek V3.2',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-v3-1-terminus',
			label: 'DeepSeek V3.1 Terminus',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-v3-1-250821',
			label: 'DeepSeek V3.1 250821',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-v3-250324',
			label: 'DeepSeek V3 250324',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'deepseek-r1-250528',
			label: 'DeepSeek R1 250528',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: 'DeepSeek',
			recommended: true
		},
		{
			id: 'kimi-k2-250905',
			label: 'Kimi K2 250905',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '月之暗面',
			recommended: true
		},
		{
			id: 'qwen3-32b',
			label: 'Qwen3 32B',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '通义千问',
			recommended: true
		},
		{
			id: 'qwen3-14b',
			label: 'Qwen3 14B',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '通义千问',
			recommended: true
		},
		{
			id: 'qwen3-8b',
			label: 'Qwen3 8B',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '通义千问',
			recommended: true
		},
		{
			id: 'qwen3-0-6b',
			label: 'Qwen3 0.6B',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '通义千问',
			recommended: true
		},
		{
			id: 'qwen2-5-72b',
			label: 'Qwen 2.5 72B',
			needType: 'text',
			apiSource: 'bytedance',
			legacyModelKey: 'deepseek',
			vendor: '通义千问',
			recommended: true
		},
		{
			id: 'gemini-3.5-flash',
			label: 'Gemini 3.5 Flash (最新推荐) ⭐',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			recommended: true,
			supportsVision: true
		},
		{
			id: 'gemini-3.1-flash-lite',
			label: 'Gemini 3.1 Flash-Lite (高效低成本)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-2.5-flash',
			label: 'Gemini 2.5 Flash (长上下文)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-2.5-pro',
			label: 'Gemini 2.5 Pro (深度推理)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-2.5-flash-lite',
			label: 'Gemini 2.5 Flash Lite (最快最省)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-3.1-pro-preview',
			label: 'Gemini 3.1 Pro (预览版)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-3-flash-preview',
			label: 'Gemini 3 Flash (预览版)',
			needType: 'text',
			apiSource: 'gemini',
			legacyModelKey: 'deepseek',
			vendor: 'Google',
			supportsVision: true
		},
		{
			id: 'gemini-3.1-flash-lite-image',
			label: 'Nano Banana Lite（Gemini 3.1 Flash-Lite Image）',
			needType: 'image',
			apiSource: 'gemini',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'gemini-2.5-flash-image',
			label: 'NanoBanana（Gemini 2.5 Flash Image）',
			needType: 'image',
			apiSource: 'gemini',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'gemini-3.1-flash-image-preview',
			label: 'Nano Banana 2（Gemini 3.1 Flash Image）[推荐] 🍌🍌',
			needType: 'image',
			apiSource: 'gemini',
			legacyModelKey: 'nanobanana',
			vendor: 'Google',
			recommended: true
		},
		{
			id: 'gemini-3-pro-image-preview',
			label: 'Nano Banana Pro（Gemini 3 Pro Image）',
			needType: 'image',
			apiSource: 'gemini',
			legacyModelKey: 'nanobanana',
			vendor: 'Google'
		},
		{
			id: 'doubao-seedream-4-5-251128',
			label: 'Seedream 4.5 (推荐)',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'doubao-seedream-3-0-t2i-250415',
			label: 'Seedream 3.0',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'doubao-seedream-4-0-250828',
			label: 'Seedream 4.0',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'doubao-seedream-5-0-260128',
			label: 'Seedream 5.0',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'jimeng-image-3.0',
			label: '即梦 图片 3.0',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'jimeng-image-4.0',
			label: '即梦 图片 4.0',
			needType: 'image',
			apiSource: 'bytedance',
			legacyModelKey: 'nanobanana'
		},
		{
			id: 'doubao-seedance-2-0-260128',
			label: 'Seedance 2.0',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-2-0-fast-260128',
			label: 'Seedance 2.0 Fast',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-2-0-mini-260615',
			label: 'Seedance 2.0 Mini',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-1-5-pro-251215',
			label: 'Seedance 1.5 Pro',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-1-0-pro-250528',
			label: 'Seedance 1.0 Pro',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-1-0-pro-fast-251015',
			label: 'Seedance 1.0 Pro Fast',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-1-0-lite-i2v-250428',
			label: 'Seedance 1.0 Lite I2V',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'doubao-seedance-1-0-lite-t2v-250428',
			label: 'Seedance 1.0 Lite T2V',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'jimeng-video-3.0',
			label: '即梦 视频 3.0',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		},
		{
			id: 'jimeng-video-3.0-pro',
			label: '即梦 视频 3.0 Pro',
			needType: 'video',
			apiSource: 'bytedance',
			legacyModelKey: 'seedance'
		}
	)
	return models
}

export const CHAT_MODEL_CATALOG = computed<ChatModelCatalogItem[]>(() => buildCatalog())

export function getChatModelCatalog(): ChatModelCatalogItem[] {
	return CHAT_MODEL_CATALOG.value
}

export function refreshChatModelCatalog() {
	// refs are reactive - computed will auto-update when dependencies change
	// kept for API compatibility
}

const CHAT_API_SOURCE_OPTIONS_BASE: Array<{ value: ChatApiSource; label: string }> = [
	{ value: 'all', label: '所有' },
	{ value: 'deepseek', label: 'DeepSeek' },
	{ value: 'gemini', label: 'Gemini' },
	{ value: 'bytedance', label: '火山方舟' }
]

export const CHAT_API_SOURCE_OPTIONS = computed<Array<{ value: ChatApiSource; label: string }>>(() => {
	const options = [...CHAT_API_SOURCE_OPTIONS_BASE]
	if (copilotEnabled.value) {
		options.push({ value: 'copilot', label: 'GitHub Copilot' })
	}
	return options
})

export function getChatApiSourceOptions(): Array<{ value: ChatApiSource; label: string }> {
	return CHAT_API_SOURCE_OPTIONS.value
}

export const needTypeFromLegacyModel = (mk: ChatLegacyModelKey): ChatNeedType => {
	if (mk === 'nanobanana') return 'image'
	if (mk === 'seedance') return 'video'
	if (mk === 'codex') return 'text'
	if (mk === 'meshy') return 'image'
	return 'text'
}

export const legacyModelFromNeedType = (need: ChatNeedType): ChatLegacyModelKey => {
	if (need === 'image') return 'nanobanana'
	if (need === 'video') return 'seedance'
	return 'deepseek'
}

export const getChatModelOptions = (needType: ChatNeedType, apiSource: ChatApiSource) => {
	const catalog = buildCatalog()
	return catalog.filter((model) => {
		if (model.needType !== needType) return false
		if (apiSource === 'all') return true
		if (apiSource === 'copilot') {
			return model.apiSource === 'copilot' || model.apiSource === 'local-exec'
		}
		if (apiSource === 'local-exec') {
			return model.apiSource === 'local-exec'
		}
		return model.apiSource === apiSource
	})
}

export const isBytedanceTextModel = (modelId: string) => {
	const catalog = buildCatalog()
	const model = catalog.find((item) => item.id === modelId)
	return model?.needType === 'text' && model.apiSource === 'bytedance'
}

export const isCopilotModel = (modelId: string) => {
	const catalog = buildCatalog()
	const model = catalog.find((item) => item.id === modelId)
	return model?.apiSource === 'copilot' || model?.apiSource === 'local-exec'
}

export const getChatModelById = (modelId: string) => {
	const catalog = buildCatalog()
	return catalog.find((item) => item.id === modelId) ?? null
}

let copilotInitPromise: Promise<void> | null = null

export async function initCopilotConfig(): Promise<void> {
	if (copilotInitPromise) return copilotInitPromise

	copilotInitPromise = (async () => {
		try {
			const { cliGetAdapterConfig, cliListModels } = await import('../../network/CLIChatService')
			const result = await cliGetAdapterConfig('copilot')
			const resultData = (result as any)?.value || (result as any)?.data
			if (result?.ok && resultData?.config?.enabled) {
				setCopilotEnabled(true)
				let models = resultData.config.models
				if (!models || !models.length) {
					try {
						const modelsResult = await cliListModels('copilot', false)
						const modelsData = (modelsResult as any)?.value || (modelsResult as any)?.data
						models = modelsData?.models
					} catch {
						// keep default models
					}
				}
				if (models?.length) {
					const catalogModels = convertCliModelsToCatalog(models)
					setDynamicCopilotModels(catalogModels)
				}
				refreshChatModelCatalog()
			} else {
				setCopilotEnabled(false)
			}
		} catch {
			setCopilotEnabled(false)
		}
	})()

	return copilotInitPromise
}
