import type { WorkflowNodeChatType } from '../../../aiworkflow/types'

export const NODE_CHAT_TYPE_LABELS: Record<WorkflowNodeChatType, string> = {
	text: 'aiConfig.nodeType.text',
	image: 'aiConfig.nodeType.image',
	video: 'aiConfig.nodeType.video',
	model3d: 'aiConfig.nodeType.model3d'
}

export const NODE_CHAT_TYPE_COLORS: Record<WorkflowNodeChatType, string> = {
	text: '#f59e0b',
	image: '#3b82f6',
	video: '#22c55e',
	model3d: '#a855f7'
}

export const NODE_CHAT_TYPE_ICONS: Record<WorkflowNodeChatType, string> = {
	text: '📝',
	image: '🖼️',
	video: '🎬',
	model3d: '🧊'
}

export const NODE_CHAT_PLACEHOLDERS: Record<WorkflowNodeChatType, string> = {
	text: 'aiConfig.placeholder.text',
	image: 'aiConfig.placeholder.image',
	video: 'aiConfig.placeholder.video',
	model3d: 'aiConfig.placeholder.model3d'
}

export const NODE_CHAT_TYPE_DESCRIPTIONS: Record<WorkflowNodeChatType, string> = {
	text: 'aiConfig.nodeTypeDesc.text',
	image: 'aiConfig.nodeTypeDesc.image',
	video: 'aiConfig.nodeTypeDesc.video',
	model3d: 'aiConfig.nodeTypeDesc.model3d'
}

export const NODE_CHAT_ASPECT_RATIO_OPTIONS = [
	{ value: '1:1', label: 'aiConfig.aspectRatio.square' },
	{ value: '16:9', label: 'aiConfig.aspectRatio.widescreen' },
	{ value: '9:16', label: 'aiConfig.aspectRatio.portrait' },
	{ value: '4:3', label: 'aiConfig.aspectRatio.standard' },
	{ value: '3:4', label: 'aiConfig.aspectRatio.portrait34' },
	{ value: '21:9', label: 'aiConfig.aspectRatio.ultrawide' }
]

export const NODE_CHAT_GEMINI_ASPECT_RATIO_OPTIONS = [
	{ value: '1:1', label: 'aiConfig.aspectRatio.square' },
	{ value: '16:9', label: 'aiConfig.aspectRatio.widescreen' },
	{ value: '9:16', label: 'aiConfig.aspectRatio.portrait' },
	{ value: '4:3', label: 'aiConfig.aspectRatio.standard' },
	{ value: '3:4', label: 'aiConfig.aspectRatio.portrait34' }
]

export const NODE_CHAT_GEMINI_QUANTITY_OPTIONS = [1, 2, 4]

export const NODE_CHAT_RESOLUTION_OPTIONS = [
	{ value: '512x512', label: '512×512' },
	{ value: '768x768', label: '768×768' },
	{ value: '1024x1024', label: '1024×1024' },
	{ value: '1536x1024', label: '1536×1024' },
	{ value: '2048x2048', label: '2048×2048' }
]

export const NODE_CHAT_QUANTITY_OPTIONS = [1, 2, 4, 6, 8]

export const NODE_CHAT_VIDEO_MODE_OPTIONS = [
	{ value: 'auto' as const, label: 'aiConfig.videoMode.auto' },
	{ value: 'text_to_video' as const, label: 'aiConfig.videoMode.textToVideo' },
	{ value: 'image_to_video' as const, label: 'aiConfig.videoMode.imageToVideo' },
	{ value: 'first-last' as const, label: 'aiConfig.videoMode.firstLast' },
	{ value: 'reference' as const, label: 'aiConfig.videoMode.reference' }
]

export const NODE_CHAT_VIDEO_DURATION_OPTIONS = [
	{ value: -1, label: 'aiConfig.videoDuration.auto', isAuto: true },
	{ value: 4, label: 'aiConfig.videoDuration.seconds', seconds: 4 },
	{ value: 5, label: 'aiConfig.videoDuration.seconds', seconds: 5 },
	{ value: 6, label: 'aiConfig.videoDuration.seconds', seconds: 6 },
	{ value: 8, label: 'aiConfig.videoDuration.seconds', seconds: 8 },
	{ value: 10, label: 'aiConfig.videoDuration.seconds', seconds: 10 },
	{ value: 12, label: 'aiConfig.videoDuration.seconds', seconds: 12 },
	{ value: 15, label: 'aiConfig.videoDuration.seconds', seconds: 15 }
]

export const NODE_CHAT_VIDEO_RATIO_OPTIONS = [
	{ value: 'adaptive', label: 'aiConfig.aspectRatio.adaptive' },
	{ value: '16:9', label: '16:9' },
	{ value: '9:16', label: '9:16' },
	{ value: '1:1', label: '1:1' },
	{ value: '4:3', label: '4:3' },
	{ value: '3:4', label: '3:4' }
]

export const NODE_CHAT_MESHY_MODE_OPTIONS = [
	{ value: 'text-to-3d', label: 'aiConfig.meshyMode.textTo3d' },
	{ value: 'image-to-3d', label: 'aiConfig.meshyMode.imageTo3d' },
	{ value: 'multi-image-to-3d', label: 'aiConfig.meshyMode.multiImageTo3d' },
	{ value: 'remesh', label: 'aiConfig.meshyMode.remesh' },
	{ value: 'retexture', label: 'aiConfig.meshyMode.retexture' },
	{ value: 'uv-unwrap', label: 'aiConfig.meshyMode.uvUnwrap' }
]

export const NODE_CHAT_MESHY_AI_MODEL_OPTIONS = [
	{ value: 'latest', label: 'latest' },
	{ value: 'meshy-6', label: 'meshy-6' },
	{ value: 'meshy-5', label: 'meshy-5' }
]

export const NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS = [
	{ value: 'standard', label: 'aiConfig.meshyModelType.standard' },
	{ value: 'lowpoly', label: 'aiConfig.meshyModelType.lowpoly' }
]

export const NODE_CHAT_MESHY_TOPOLOGY_OPTIONS = [
	{ value: 'triangle', label: 'aiConfig.meshyTopology.triangle' },
	{ value: 'quad', label: 'aiConfig.meshyTopology.quad' }
]

export const NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS = [
	{ value: 'auto', label: 'aiConfig.common.auto' },
	{ value: 'on', label: 'aiConfig.common.on' },
	{ value: 'off', label: 'aiConfig.common.off' }
]

export const NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS = [
	{ value: 'bottom', label: 'aiConfig.meshyOrigin.bottom' },
	{ value: 'center', label: 'aiConfig.meshyOrigin.center' }
]

export const NODE_CHAT_MESHY_POSE_MODE_OPTIONS = [
	{ value: '', label: 'aiConfig.meshyPose.none' },
	{ value: 'a-pose', label: 'aiConfig.meshyPose.aPose' },
	{ value: 't-pose', label: 'aiConfig.meshyPose.tPose' }
]

export const NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS = [
	{ value: 'glb', label: 'GLB' },
	{ value: 'fbx', label: 'FBX' },
	{ value: 'obj', label: 'OBJ' },
	{ value: 'stl', label: 'STL' },
	{ value: 'usdz', label: 'USDZ' }
]

export const NODE_CHAT_MESHY_DECIMATION_MODE_OPTIONS = [
	{ value: 'auto', label: 'aiConfig.meshyDecimation.auto' },
	{ value: 'fast', label: 'aiConfig.meshyDecimation.fast' },
	{ value: 'accurate', label: 'aiConfig.meshyDecimation.accurate' }
]

export const NODE_CHAT_TEXT_SPEED_OPTIONS = [
	{ value: 'fast' as const, label: 'aiConfig.textSpeed.fast' },
	{ value: 'normal' as const, label: 'aiConfig.textSpeed.normal' },
	{ value: 'slow' as const, label: 'aiConfig.textSpeed.slow' }
]

export const NODE_CHAT_TEXT_MODEL_OPTIONS = [
	{ value: 'deepseek', label: 'aiConfig.textModel.deepseek' },
	{ value: 'bytedance', label: 'aiConfig.textModel.bytedance' },
	{ value: 'gemini', label: 'aiConfig.textModel.gemini' }
]

export const NODE_CHAT_SEED_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seed-2-0-pro-260215', label: 'aiConfig.seedVersion.pro' },
	{ value: 'doubao-seed-2-0-lite-260428', label: 'aiConfig.seedVersion.lite' },
	{ value: 'doubao-seed-2-0-mini-260428', label: 'aiConfig.seedVersion.mini' },
	{ value: 'doubao-seed-2-0-code-preview-260215', label: 'aiConfig.seedVersion.code' },
	{ value: 'doubao-seed-1-8-251228', label: 'aiConfig.seedVersion.v18' }
]

export const NODE_CHAT_TEXT_THINKING_OPTIONS = [
	{ value: 'enabled', label: 'aiConfig.thinking.enabled' },
	{ value: 'disabled', label: 'aiConfig.thinking.disabled' }
]

export const NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS = [
	{ value: 'text', label: 'aiConfig.responseFormat.text' },
	{ value: 'json_object', label: 'aiConfig.responseFormat.json' }
]

export const NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS = [
	{ value: 2048, label: 'aiConfig.maxTokens.tokens', tokens: 2048 },
	{ value: 4096, label: 'aiConfig.maxTokens.tokens', tokens: 4096 },
	{ value: 8192, label: 'aiConfig.maxTokens.tokens', tokens: 8192 },
	{ value: 16384, label: 'aiConfig.maxTokens.tokens', tokens: 16384 }
]

export const NODE_CHAT_IMAGE_MODEL_OPTIONS = [
	{ value: 'gemini', label: 'aiConfig.imageModel.gemini' },
	{ value: 'seedream', label: 'aiConfig.imageModel.seedream' },
	{ value: 'meshy', label: 'aiConfig.imageModel.meshy' }
]

export const NODE_CHAT_GEMINI_IMAGE_MODEL_VERSION_OPTIONS = [
	{ value: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (Gemini 3.1 Flash)', badge: '推荐', description: '通用主力 - 支持512px~4K分辨率，14张参考图' },
	{ value: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite (Gemini 3.1 Flash-Lite)', description: '快速经济 - 仅1K，适合规模化场景' },
	{ value: 'gemini-3-pro-image', label: 'Nano Banana Pro (Gemini 3 Pro)', badge: 'Pro', description: '专业质量 - 支持1K~4K，含思考流程' },
	{ value: 'gemini-2.5-flash-image', label: 'Nano Banana (Gemini 2.5 Flash)', description: '旧版兼容 - 建议升级到Lite' }
]

export const NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS = NODE_CHAT_GEMINI_IMAGE_MODEL_VERSION_OPTIONS

export const GEMINI_IMAGE_SIZE_OPTIONS: Record<string, Array<{ value: string; label: string; description: string; isDefault?: boolean }>> = {
	'gemini-3.1-flash-image': [
		{ value: '512px', label: '512px', description: '快速预览 (512×512~)' },
		{ value: '1K', label: '1K', description: '标准 (1024×1024~)' },
		{ value: '2K', label: '2K', description: '高清 (2048×2048~)', isDefault: true },
		{ value: '4K', label: '4K', description: '超清 (4096×4096~)' }
	],
	'gemini-3.1-flash-lite-image': [
		{ value: '1K', label: '1K', description: '标准 (1024×1024~)', isDefault: true }
	],
	'gemini-3-pro-image': [
		{ value: '1K', label: '1K', description: '标准 (1024×1024~)' },
		{ value: '2K', label: '2K', description: '高清 (2048×2048~)', isDefault: true },
		{ value: '4K', label: '4K', description: '超清 (4096×4096~)' }
	],
	'gemini-2.5-flash-image': [
		{ value: '1K', label: '1K', description: '标准 (1024×1024~)', isDefault: true }
	]
}

export const GEMINI_ASPECT_RATIO_OPTIONS: Record<string, Array<{ value: string; label: string; labelZh: string }>> = {
	'gemini-3.1-flash-image': [
		{ value: '1:1', label: '1:1', labelZh: '方形' },
		{ value: '16:9', label: '16:9', labelZh: '横屏' },
		{ value: '9:16', label: '9:16', labelZh: '竖屏' },
		{ value: '4:3', label: '4:3', labelZh: '标准横屏' },
		{ value: '3:4', label: '3:4', labelZh: '标准竖屏' },
		{ value: '3:2', label: '3:2', labelZh: '经典横屏' },
		{ value: '2:3', label: '2:3', labelZh: '经典竖屏' },
		{ value: '4:5', label: '4:5', labelZh: '社交竖屏' },
		{ value: '5:4', label: '5:4', labelZh: '社交横屏' },
		{ value: '21:9', label: '21:9', labelZh: '超宽屏' },
		{ value: '1:4', label: '1:4', labelZh: '极竖屏' },
		{ value: '4:1', label: '4:1', labelZh: '极横屏' },
		{ value: '1:8', label: '1:8', labelZh: '超竖屏' },
		{ value: '8:1', label: '8:1', labelZh: '超横屏' }
	],
	'gemini-3.1-flash-lite-image': [
		{ value: '1:1', label: '1:1', labelZh: '方形' },
		{ value: '16:9', label: '16:9', labelZh: '横屏' },
		{ value: '9:16', label: '9:16', labelZh: '竖屏' },
		{ value: '4:3', label: '4:3', labelZh: '标准横屏' },
		{ value: '3:4', label: '3:4', labelZh: '标准竖屏' },
		{ value: '3:2', label: '3:2', labelZh: '经典横屏' },
		{ value: '2:3', label: '2:3', labelZh: '经典竖屏' },
		{ value: '4:5', label: '4:5', labelZh: '社交竖屏' },
		{ value: '5:4', label: '5:4', labelZh: '社交横屏' },
		{ value: '21:9', label: '21:9', labelZh: '超宽屏' }
	],
	'gemini-3-pro-image': [
		{ value: '1:1', label: '1:1', labelZh: '方形' },
		{ value: '16:9', label: '16:9', labelZh: '横屏' },
		{ value: '9:16', label: '9:16', labelZh: '竖屏' },
		{ value: '4:3', label: '4:3', labelZh: '标准横屏' },
		{ value: '3:4', label: '3:4', labelZh: '标准竖屏' },
		{ value: '3:2', label: '3:2', labelZh: '经典横屏' },
		{ value: '2:3', label: '2:3', labelZh: '经典竖屏' },
		{ value: '4:5', label: '4:5', labelZh: '社交竖屏' },
		{ value: '5:4', label: '5:4', labelZh: '社交横屏' },
		{ value: '21:9', label: '21:9', labelZh: '超宽屏' }
	],
	'gemini-2.5-flash-image': [
		{ value: '1:1', label: '1:1', labelZh: '方形' },
		{ value: '16:9', label: '16:9', labelZh: '横屏' },
		{ value: '9:16', label: '9:16', labelZh: '竖屏' },
		{ value: '4:3', label: '4:3', labelZh: '标准横屏' },
		{ value: '3:4', label: '3:4', labelZh: '标准竖屏' },
		{ value: '3:2', label: '3:2', labelZh: '经典横屏' },
		{ value: '2:3', label: '2:3', labelZh: '经典竖屏' },
		{ value: '4:5', label: '4:5', labelZh: '社交竖屏' },
		{ value: '5:4', label: '5:4', labelZh: '社交横屏' },
		{ value: '21:9', label: '21:9', labelZh: '超宽屏' }
	]
}

export const GEMINI_THINKING_LEVEL_OPTIONS: Record<string, Array<{ value: string; label: string; description: string }>> = {
	'gemini-3.1-flash-image': [
		{ value: 'minimal', label: '快速', description: '平衡速度与质量' },
		{ value: 'high', label: '深度', description: '更高质量，较慢' }
	]
}

export const GEMINI_QUANTITY_OPTIONS = [1, 2, 4]

export const getGeminiImageSizeOptions = (modelVersion: string) => {
	return GEMINI_IMAGE_SIZE_OPTIONS[modelVersion] || GEMINI_IMAGE_SIZE_OPTIONS['gemini-3.1-flash-image']
}

export const getGeminiAspectRatioOptions = (modelVersion: string) => {
	return GEMINI_ASPECT_RATIO_OPTIONS[modelVersion] || GEMINI_ASPECT_RATIO_OPTIONS['gemini-3.1-flash-image']
}

export const getGeminiThinkingLevelOptions = (modelVersion: string) => {
	return GEMINI_THINKING_LEVEL_OPTIONS[modelVersion] || []
}

export const getDefaultGeminiImageSize = (modelVersion: string): string => {
	const options = getGeminiImageSizeOptions(modelVersion)
	const defaultOpt = options.find(o => o.isDefault)
	return defaultOpt?.value || '2K'
}

export const supportsGeminiThinkingLevel = (modelVersion: string): boolean => {
	return modelVersion === 'gemini-3.1-flash-image'
}

export const NODE_CHAT_GEMINI_TEXT_MODEL_VERSION_OPTIONS = [
	{ value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (最新推荐)' },
	{ value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (高效低成本)' },
	{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (长上下文)' },
	{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (深度推理)' },
	{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (最快最省)' },
	{ value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (预览版)' },
	{ value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (预览版)' }
]

export const NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS = {
	'nano-banana': [
		{ value: '1:1', label: '1:1' },
		{ value: '16:9', label: '16:9' },
		{ value: '9:16', label: '9:16' },
		{ value: '4:3', label: '4:3' },
		{ value: '3:4', label: '3:4' }
	],
	'nano-banana-2': [
		{ value: '1:1', label: '1:1' },
		{ value: '16:9', label: '16:9' },
		{ value: '9:16', label: '9:16' },
		{ value: '4:3', label: '4:3' },
		{ value: '3:4', label: '3:4' }
	],
	'nano-banana-pro': [
		{ value: '1:1', label: '1:1' },
		{ value: '16:9', label: '16:9' },
		{ value: '9:16', label: '9:16' },
		{ value: '4:3', label: '4:3' },
		{ value: '3:4', label: '3:4' }
	],
	'gpt-image-2': [
		{ value: '1:1', label: '1:1' },
		{ value: '3:2', label: '3:2' },
		{ value: '2:3', label: '2:3' }
	]
}

export const getMeshyImageAspectRatioOptions = (aiModel: string) => {
	return (
		NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS[
			aiModel as keyof typeof NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS
		] || NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS['nano-banana']
	)
}

export const NODE_CHAT_MESHY_IMAGE_OUTPUT_COUNT_OPTIONS = [1, 2, 4]

export const NODE_CHAT_MESHY_IMAGE_OPTIONS = {
	aiModel: [
		{ value: 'nano-banana', label: 'NanoBanana' },
		{ value: 'nano-banana-2', label: 'NanoBanana2' },
		{ value: 'nano-banana-pro', label: 'NanoBananaPro' },
		{ value: 'gpt-image-2', label: 'GPT-Image-2' }
	],
	aspectRatio: NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS['nano-banana'],
	poseMode: [
		{ value: '', label: 'aiConfig.meshyPose.none' },
		{ value: 'a-pose', label: 'aiConfig.meshyPose.aPose' },
		{ value: 't-pose', label: 'aiConfig.meshyPose.tPose' }
	]
}

export const NODE_CHAT_VIDEO_RESOLUTION_OPTIONS = [
	{ value: '480p', label: '480p' },
	{ value: '720p', label: '720p' },
	{ value: '1080p', label: '1080p' },
	{ value: '4k', label: '4K' }
]

export const NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seedream-4-5-251128', label: 'aiConfig.seedreamVersion.v45' },
	{ value: 'doubao-seedream-4-0-250828', label: 'aiConfig.seedreamVersion.v40' },
	{ value: 'doubao-seedream-5-0-260128', label: 'aiConfig.seedreamVersion.v50' },
	{ value: 'doubao-seedream-5-0-lite-260128', label: 'aiConfig.seedreamVersion.v50Lite' }
]

export const NODE_CHAT_SEEDREAM_RESOLUTION_OPTIONS = {
	'doubao-seedream-5-0-260128': [
		{ value: '2K', label: '2K' },
		{ value: '3K', label: '3K' },
		{ value: '4K', label: '4K' }
	],
	'doubao-seedream-5-0-lite-260128': [
		{ value: '2K', label: '2K' },
		{ value: '3K', label: '3K' },
		{ value: '4K', label: '4K' }
	],
	'doubao-seedream-4-5-251128': [
		{ value: '2K', label: '2K' },
		{ value: '4K', label: '4K' }
	],
	'doubao-seedream-4-0-250828': [
		{ value: '1K', label: '1K' },
		{ value: '2K', label: '2K' },
		{ value: '4K', label: '4K' }
	]
}

export const NODE_CHAT_SEEDREAM_OUTPUT_FORMAT_OPTIONS = {
	'doubao-seedream-5-0-260128': [
		{ value: 'png', label: 'PNG' },
		{ value: 'jpeg', label: 'JPEG' }
	],
	'doubao-seedream-5-0-lite-260128': [
		{ value: 'png', label: 'PNG' },
		{ value: 'jpeg', label: 'JPEG' }
	],
	'doubao-seedream-4-5-251128': [
		{ value: 'jpeg', label: 'JPEG' }
	],
	'doubao-seedream-4-0-250828': [
		{ value: 'jpeg', label: 'JPEG' }
	]
}

export const NODE_CHAT_SEEDREAM_QUANTITY_OPTIONS = [1, 2, 4]

export const getSeedreamResolutionOptions = (modelVersion: string) => {
	return (
		NODE_CHAT_SEEDREAM_RESOLUTION_OPTIONS[
			modelVersion as keyof typeof NODE_CHAT_SEEDREAM_RESOLUTION_OPTIONS
		] || NODE_CHAT_SEEDREAM_RESOLUTION_OPTIONS['doubao-seedream-4-5-251128']
	)
}

export const getSeedreamOutputFormatOptions = (modelVersion: string) => {
	return (
		NODE_CHAT_SEEDREAM_OUTPUT_FORMAT_OPTIONS[
			modelVersion as keyof typeof NODE_CHAT_SEEDREAM_OUTPUT_FORMAT_OPTIONS
		] || NODE_CHAT_SEEDREAM_OUTPUT_FORMAT_OPTIONS['doubao-seedream-4-5-251128']
	)
}

export const supportsSeedreamOutputFormat = (modelVersion: string) => {
	return modelVersion.includes('5-0')
}

export const NODE_CHAT_VIDEO_MODEL_OPTIONS = [{ value: 'seedance', label: 'aiConfig.videoModel.seedance' }]

export const NODE_CHAT_MODEL3D_PROVIDER_OPTIONS = [{ value: 'meshy' as const, label: 'aiConfig.model3dProvider.meshy' }]

export const NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
	{ value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
	{ value: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini' },
	{ value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance v1.5 Pro' },
	{ value: 'doubao-seedance-1-0-pro-250312', label: 'Seedance v1.0 Pro' },
	{ value: 'doubao-seedance-1-0-pro-fast-250312', label: 'Seedance v1.0 Pro Fast' },
	{ value: 'doubao-seedance-1-0-lite-i2v-250312', label: 'Seedance v1.0 Lite I2V' },
	{ value: 'doubao-seedance-1-0-lite-t2v-250312', label: 'Seedance v1.0 Lite T2V' }
]

export const getDefaultParamsForType = (type: WorkflowNodeChatType) => {
	switch (type) {
		case 'text':
			return {
				modelId: undefined,
				model: 'gemini',
				textModelVersion: 'gemini-3.5-flash',
				geminiTextModelVersion: 'gemini-3.5-flash',
				speed: 'normal',
				thinking: 'enabled',
				responseFormat: 'text',
				maxTokens: 4096
			}
		case 'image':
			return {
				modelId: undefined,
				model: 'gemini',
				geminiImageModelVersion: 'gemini-3.1-flash-image',
				nanobananaModelVersion: 'gemini-3.1-flash-image',
				geminiImageSize: '2K',
				geminiAspectRatio: '1:1',
				geminiQuantity: 1,
				geminiThinkingLevel: 'minimal',
				geminiNegativePrompt: '',
				meshyImageAiModel: 'nano-banana',
				meshyAspectRatio: '1:1',
				meshyNegativePrompt: '',
				meshyPoseMode: '',
				meshyGenerateMultiView: false,
				meshySeed: -1,
				meshyOutputImageCount: 1,
				seedreamModelVersion: 'doubao-seedream-4-5-251128',
				seedreamSize: '2K',
				seedreamAspectRatio: '1:1',
				seedreamOutputFormat: 'jpeg',
				seedreamQuantity: 1,
				seedreamWatermark: false,
				seedreamSeed: -1,
				seedreamNegativePrompt: '',
				resolution: '1024x1024',
				aspectRatio: '1:1',
				quantity: 1
			}
		case 'video':
			return {
				modelId: undefined,
				model: 'seedance',
				seedanceModelVersion: 'doubao-seedance-2-0-260128',
				mode: 'auto',
				resolution: '720p',
				ratio: '16:9',
				duration: 5,
				seed: -1,
				generateAudio: false,
				watermark: false,
				cameraFixed: false,
				returnLastFrame: false
			}
		case 'model3d':
			return {
				provider: 'meshy',
				meshyMode: 'text-to-3d',
				meshyAiModel: 'latest',
				meshyModelType: 'standard',
				meshyTopology: 'triangle',
				meshySymmetryMode: 'auto',
				meshyOriginAt: 'bottom',
				meshyPoseMode: '',
				meshyOutputFormat: 'glb',
				meshyMultiView: false,
				meshySeed: -1,
				meshyTargetPolycount: 30000,
				meshyDecimationMode: 'auto',
				meshyEnableOriginalUv: true,
				meshyEnablePbr: false,
				meshyHdTexture: false,
				meshyRemoveLighting: true,
				meshyAlphaThumbnail: false,
				meshyStyleSource: 'text',
				meshyTextureImageUrl: '',
				meshyTextureImageNodeId: ''
			}
		default:
			return {}
	}
}

export const isNodeChatTypeSupported = (type: string): boolean => {
	return type === 'text' || type === 'image' || type === 'video' || type === 'model3d'
}

export const normalizeNodeChatType = (type: string): WorkflowNodeChatType | null => {
	if (type === 'text' || type === 'image' || type === 'video' || type === 'model3d') {
		return type
	}
	return null
}
