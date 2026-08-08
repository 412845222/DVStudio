const DEFAULT_COMFYUI_PORT = 8188
const CORE_TAGS = [
	{
		key: 'disable-cuda-malloc',
		arg: '--disable-cuda-malloc',
		labelI18nKey: 'comfyui.launchArgs.tag.disableCudaMalloc',
		label: '禁用 CUDA malloc',
		description: '显存稳定策略（默认开启）',
		isDefault: true
	},
	{
		key: 'enable-manager',
		arg: '--enable-manager',
		labelI18nKey: 'comfyui.launchArgs.tag.enableManager',
		label: '启用 Manager 菜单',
		description: '开启 ComfyUI Manager 扩展管理界面',
		isDefault: false
	}
]

const REFERENCE_ARGS = [
	{ arg: '--lowvram', description: '低显存模式 (<6G)' },
	{ arg: '--medvram', description: '中显存模式 (6-8G)' },
	{ arg: '--novram', description: '无显存模式（纯 CPU）' },
	{ arg: '--gpu-only', description: '仅 GPU 推理' },
	{ arg: '--enable-cors-header', description: '允许跨域请求' },
	{ arg: '--verbose', description: '详细日志输出' },
	{ arg: '--dont-upcast-attention', description: '跳过 attention upcast' },
	{ arg: '--preview-method <method>', description: '预览方式：auto/none/taesd/latent' },
	{ arg: '--front-end-lang <lang>', description: '前端语言：zh_CN / en' },
	{ arg: '--output-directory <path>', description: '自定义输出目录' }
]

export function getCoreTags() {
	return JSON.parse(JSON.stringify(CORE_TAGS))
}

export function getReferenceArgs() {
	return JSON.parse(JSON.stringify(REFERENCE_ARGS))
}

export function getDefaultRecommendedArgs() {
	return ['--disable-cuda-malloc']
}

export function buildArgsTextFromExtraArgs(extraArgs) {
	if (Array.isArray(extraArgs) && extraArgs.length > 0) {
		return extraArgs.join(' ')
	}
	return ''
}

export function parseArgsText(text) {
	const warnings = []
	if (typeof text !== 'string') {
		return { ok: false, error: '参数文本必须是字符串', extraArgs: [], warnings }
	}
	const rawTokens = text.split(/[\s,]+/).filter(t => t && t.trim())
	const seen = new Set()
	const extraArgs = []
	for (const token of rawTokens) {
		const trimmed = token.trim()
		if (!trimmed) continue
		if (seen.has(trimmed)) {
			warnings.push(`检测到重复参数: ${trimmed}，已保留首次出现`)
			continue
		}
		seen.add(trimmed)
		extraArgs.push(trimmed)
	}
	return { ok: true, extraArgs, warnings }
}
