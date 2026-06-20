export type ChatLegacyModelKey = 'deepseek' | 'nanobanana' | 'seedance' | 'codex'
export type ChatNeedType = 'text' | 'image' | 'video'
export type ChatApiSource = 'all' | 'deepseek' | 'gemini' | 'bytedance' | 'local-exec'

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

const COPILOT_CLI_MODELS: ChatModelCatalogItem[] = [
	{ id: 'auto', label: 'Auto', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI', recommended: true },
	{ id: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI', recommended: true },
	{ id: 'gpt-5.4', label: 'GPT-5.4', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.2', label: 'GPT-5.2', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex Max', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.1-codex', label: 'GPT-5.1-Codex', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.1', label: 'GPT-5.1', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex Mini', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-5-mini', label: 'GPT-5 Mini', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gpt-4.1', label: 'GPT-4.1', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'claude-opus-4.6', label: 'Claude Opus 4.6', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
	{ id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', needType: 'text', apiSource: 'local-exec', legacyModelKey: 'codex', vendor: 'Copilot CLI' },
]

export const CHAT_MODEL_CATALOG: ChatModelCatalogItem[] = [
	...COPILOT_CLI_MODELS,
	{
		id: 'deepseek-chat',
		label: 'DeepSeek Chat',
		needType: 'text',
		apiSource: 'deepseek',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
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
		supportsVision: true,
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
		supportsVision: true,
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
		supportsVision: true,
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
		supportsVision: true,
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
		supportsVision: true,
	},
	{
		id: 'doubao-seed-code-preview-251028',
		label: '豆包 Seed Code Preview',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '字节方舟',
		recommended: true,
	},
	{
		id: 'doubao-seed-1-6-lite-251015',
		label: '豆包 Seed 1.6 Lite',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '字节方舟',
		recommended: true,
		supportsVision: true,
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
		supportsVision: true,
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
		supportsVision: true,
	},
	{
		id: 'doubao-seed-translation-250915',
		label: '豆包 Seed Translation',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '字节方舟',
		recommended: true,
	},
	{
		id: 'glm-4-7-251222',
		label: 'GLM 4.7',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '智谱 AI',
		recommended: true,
	},
	{
		id: 'glm-4-5-air',
		label: 'GLM 4.5 Air',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '智谱 AI',
		recommended: true,
	},
	{
		id: 'deepseek-v3-2-251201',
		label: 'DeepSeek V3.2',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
	},
	{
		id: 'deepseek-v3-1-terminus',
		label: 'DeepSeek V3.1 Terminus',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
	},
	{
		id: 'deepseek-v3-1-250821',
		label: 'DeepSeek V3.1 250821',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
	},
	{
		id: 'deepseek-v3-250324',
		label: 'DeepSeek V3 250324',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
	},
	{
		id: 'deepseek-r1-250528',
		label: 'DeepSeek R1 250528',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: 'DeepSeek',
		recommended: true,
	},
	{
		id: 'kimi-k2-250905',
		label: 'Kimi K2 250905',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '月之暗面',
		recommended: true,
	},
	{
		id: 'qwen3-32b',
		label: 'Qwen3 32B',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '通义千问',
		recommended: true,
	},
	{
		id: 'qwen3-14b',
		label: 'Qwen3 14B',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '通义千问',
		recommended: true,
	},
	{
		id: 'qwen3-8b',
		label: 'Qwen3 8B',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '通义千问',
		recommended: true,
	},
	{
		id: 'qwen3-0-6b',
		label: 'Qwen3 0.6B',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '通义千问',
		recommended: true,
	},
	{
		id: 'qwen2-5-72b',
		label: 'Qwen 2.5 72B',
		needType: 'text',
		apiSource: 'bytedance',
		legacyModelKey: 'deepseek',
		vendor: '通义千问',
		recommended: true,
	},
	{
		id: 'gemini-2.5-flash-image',
		label: 'NanoBanana（Gemini 2.5 Flash Image）',
		needType: 'image',
		apiSource: 'gemini',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'gemini-3.1-flash-image-preview',
		label: 'NanoBanana 2（Gemini 3.1 Flash Image 预览版）',
		needType: 'image',
		apiSource: 'gemini',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'gemini-3-pro-image-preview',
		label: 'NanoBanana Pro（Gemini 3 Pro Image 预览版）',
		needType: 'image',
		apiSource: 'gemini',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'doubao-seedream-4-5-251128',
		label: 'Seedream 4.5 (推荐)',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'doubao-seedream-3-0-t2i-250415',
		label: 'Seedream 3.0',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'doubao-seedream-4-0-250828',
		label: 'Seedream 4.0',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'doubao-seedream-5-0-260128',
		label: 'Seedream 5.0',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'jimeng-image-3.0',
		label: '即梦 图片 3.0',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'jimeng-image-4.0',
		label: '即梦 图片 4.0',
		needType: 'image',
		apiSource: 'bytedance',
		legacyModelKey: 'nanobanana',
	},
	{
		id: 'doubao-seedance-2-0-260128',
		label: 'Seedance 2.0',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-2-0-fast-260128',
		label: 'Seedance 2.0 Fast',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-1-5-pro-251215',
		label: 'Seedance 1.5 Pro',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-1-0-pro-250528',
		label: 'Seedance 1.0 Pro',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-1-0-pro-fast-251015',
		label: 'Seedance 1.0 Pro Fast',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-1-0-lite-i2v-250428',
		label: 'Seedance 1.0 Lite I2V',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'doubao-seedance-1-0-lite-t2v-250428',
		label: 'Seedance 1.0 Lite T2V',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'jimeng-video-3.0',
		label: '即梦 视频 3.0',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
	{
		id: 'jimeng-video-3.0-pro',
		label: '即梦 视频 3.0 Pro',
		needType: 'video',
		apiSource: 'bytedance',
		legacyModelKey: 'seedance',
	},
]

export const CHAT_API_SOURCE_OPTIONS: Array<{ value: ChatApiSource; label: string }> = [
	{ value: 'all', label: '所有' },
	{ value: 'deepseek', label: 'DeepSeek' },
	{ value: 'gemini', label: 'Gemini' },
	{ value: 'bytedance', label: '火山方舟' },
	{ value: 'local-exec', label: '本地执行层' },
]

export const needTypeFromLegacyModel = (mk: ChatLegacyModelKey): ChatNeedType => {
	if (mk === 'nanobanana') return 'image'
	if (mk === 'seedance') return 'video'
	if (mk === 'codex') return 'text'
	return 'text'
}

export const legacyModelFromNeedType = (need: ChatNeedType): ChatLegacyModelKey => {
	if (need === 'image') return 'nanobanana'
	if (need === 'video') return 'seedance'
	return 'deepseek'
}

export const getChatModelOptions = (needType: ChatNeedType, apiSource: ChatApiSource) => {
	return CHAT_MODEL_CATALOG.filter((model) => {
		if (model.needType !== needType) return false
		if (apiSource === 'all') return true
		return model.apiSource === apiSource
	})
}

export const isBytedanceTextModel = (modelId: string) => {
	const model = CHAT_MODEL_CATALOG.find((item) => item.id === modelId)
	return model?.needType === 'text' && model.apiSource === 'bytedance'
}

export const getChatModelById = (modelId: string) => {
	return CHAT_MODEL_CATALOG.find((item) => item.id === modelId) ?? null
}
