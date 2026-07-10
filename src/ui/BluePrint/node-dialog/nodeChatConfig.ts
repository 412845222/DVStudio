import type { WorkflowNodeChatType, WorkflowNodeChatParamRecord, WorkflowTripo3DMode } from '../../../aiworkflow/types'

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
	{ value: 'meshy', label: 'aiConfig.imageModel.meshy' },
	{ value: 'tripo3d', label: 'aiConfig.imageModel.tripo3d' }
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

export const NODE_CHAT_MODEL3D_PROVIDER_OPTIONS = [
	{ value: 'meshy' as const, label: 'aiConfig.model3dProvider.meshy' },
	{ value: 'tripo3d' as const, label: 'aiConfig.model3dProvider.tripo3d' }
]

export const NODE_CHAT_TRIPO3D_MODEL_SERIES_OPTIONS = [
	{ value: 'h', label: 'aiConfig.tripo3dModelSeries.h', icon: '✨', badge: 'aiConfig.common.recommended' },
	{ value: 'p', label: 'aiConfig.tripo3dModelSeries.p', icon: '🎮', badge: 'aiConfig.tripo3dBadge.game' }
]

export const NODE_CHAT_TRIPO3D_H_MODEL_VERSION_OPTIONS = [
	{ value: 'v3.1-20260211', label: 'v3.1', description: 'aiConfig.tripo3dModelVersion.v31', badge: 'aiConfig.common.recommended' },
	{ value: 'v3.0-20250812', label: 'v3.0', description: 'aiConfig.tripo3dModelVersion.v30' },
	{ value: 'v2.5-20250123', label: 'v2.5', description: 'aiConfig.tripo3dModelVersion.v25' }
]

export const NODE_CHAT_TRIPO3D_P_MODEL_VERSION_OPTIONS = [
	{ value: 'P1-20260311', label: 'P1', description: 'aiConfig.tripo3dModelVersion.p1', badge: 'aiConfig.tripo3dBadge.game' }
]

export const NODE_CHAT_TRIPO3D_FACE_LIMIT_PRESETS = [
	{ value: 10000, label: 'aiConfig.tripo3dFaceLimitPresets.mobile', description: 'aiConfig.tripo3dFaceLimitPresets.mobileDesc' },
	{ value: 30000, label: 'aiConfig.tripo3dFaceLimitPresets.web', description: 'aiConfig.tripo3dFaceLimitPresets.webDesc' },
	{ value: 80000, label: 'aiConfig.tripo3dFaceLimitPresets.game', description: 'aiConfig.tripo3dFaceLimitPresets.gameDesc' },
	{ value: 500000, label: 'aiConfig.tripo3dFaceLimitPresets.film', description: 'aiConfig.tripo3dFaceLimitPresets.filmDesc' },
	{ value: 2000000, label: 'aiConfig.tripo3dFaceLimitPresets.ultra', description: 'aiConfig.tripo3dFaceLimitPresets.ultraDesc', hSeriesOnly: true },
	{ value: 0, label: 'aiConfig.tripo3dFaceLimitPresets.adaptive', description: 'aiConfig.tripo3dFaceLimitPresets.adaptiveDesc' }
]

export const NODE_CHAT_TRIPO3D_TEXTURE_QUALITY_OPTIONS = [
	{ value: 'standard', label: 'aiConfig.tripo3dTextureQuality.standard' },
	{ value: 'detailed', label: 'aiConfig.tripo3dTextureQuality.detailed' },
	{ value: 'extreme', label: 'aiConfig.tripo3dTextureQuality.extreme', badge: 'aiConfig.tripo3dBadge.moreCredits' }
]

export const NODE_CHAT_TRIPO3D_GEOMETRY_QUALITY_OPTIONS = [
	{ value: 'standard', label: 'aiConfig.tripo3dGeometryQuality.standard' },
	{ value: 'detailed', label: 'aiConfig.tripo3dGeometryQuality.detailed' }
]

export const NODE_CHAT_TRIPO3D_TEXTURE_ALIGNMENT_OPTIONS = [
	{ value: 'original_image', label: 'aiConfig.tripo3dTextureAlignment.originalImage' },
	{ value: 'geometry', label: 'aiConfig.tripo3dTextureAlignment.geometry' }
]

export const NODE_CHAT_TRIPO3D_TEXTURE_MODEL_VERSION_OPTIONS = [
	{ value: 'v3.0-20250812', label: 'aiConfig.tripo3dTextureModelVersion.v30' },
	{ value: 'v2.5-20250123', label: 'aiConfig.tripo3dTextureModelVersion.v25' }
]

export const NODE_CHAT_TRIPO3D_ORIENTATION_OPTIONS = [
	{ value: 'default', label: 'aiConfig.tripo3dOrientation.default' },
	{ value: 'align_image', label: 'aiConfig.tripo3dOrientation.alignImage' }
]

export const NODE_CHAT_TRIPO3D_VIEW_OPTIONS = [
	{ key: 'front' as const, label: 'aiConfig.tripo3dViews.front', color: '#3b82f6', required: true, order: 1 },
	{ key: 'left' as const, label: 'aiConfig.tripo3dViews.left', color: '#22c55e', required: false, order: 2 },
	{ key: 'back' as const, label: 'aiConfig.tripo3dViews.back', color: '#f97316', required: false, order: 3 },
	{ key: 'right' as const, label: 'aiConfig.tripo3dViews.right', color: '#a855f7', required: false, order: 4 }
]

export const getTripo3DModelVersionOptions = (series: 'h' | 'p') => {
	return series === 'h' ? NODE_CHAT_TRIPO3D_H_MODEL_VERSION_OPTIONS : NODE_CHAT_TRIPO3D_P_MODEL_VERSION_OPTIONS
}

export const getTripo3DFaceLimitRange = (modelVersion: string, quad: boolean, smartLowPoly: boolean) => {
	const isPSeries = modelVersion.startsWith('P')
	const isV25 = modelVersion === 'v2.5-20250123'
	const isV3OrLater = modelVersion === 'v3.1-20260211' || modelVersion === 'v3.0-20250812'

	if (isPSeries) {
		if (quad) {
			return { min: 50, max: 10000, default: 10000 }
		}
		return { min: 50, max: 20000, default: 10000 }
	}

	if (isV25) {
		return { min: 1000, max: 500000, default: 0 }
	}

	if (!isV3OrLater) {
		return { min: 1000, max: 2000000, default: 0 }
	}

	if (smartLowPoly) {
		if (quad) {
			return { min: 500, max: 10000, default: 10000 }
		}
		return { min: 500, max: 20000, default: 10000 }
	}

	if (quad) {
		return { min: 1000, max: 150000, default: 0 }
	}

	return { min: 1000, max: 2000000, default: 0 }
}

export const isTripo3DPSeries = (modelVersion: string) => {
	return modelVersion.startsWith('P')
}

export const isTripo3DV3OrLater = (modelVersion: string) => {
	return modelVersion === 'v3.1-20260211' || modelVersion === 'v3.0-20250812'
}

export const normalizeTripo3DParams = (params: Record<string, unknown>) => {
	const next = { ...params }
	const modelVersion = String(next.tripo3dModelVersion || 'v3.1-20260211')
	const modelSeries = String(next.tripo3dModelSeries || (isTripo3DPSeries(modelVersion) ? 'p' : 'h'))
	const isPSeries = isTripo3DPSeries(modelVersion)
	const isV3OrLater = isTripo3DV3OrLater(modelVersion)
	const isV25 = modelVersion === 'v2.5-20250123'
	const supportsAdvanced = isV3OrLater || isPSeries

	let quad = Boolean(next.tripo3dQuad)
	let smartLowPoly = Boolean(next.tripo3dSmartLowPoly)
	let generateParts = Boolean(next.tripo3dGenerateParts)
	let texture = next.tripo3dTexture !== false
	let pbr = next.tripo3dPbr !== false
	let autoSize = Boolean(next.tripo3dAutoSize)
	let compress = Boolean(next.tripo3dCompress)
	let geometryQuality = String(next.tripo3dGeometryQuality || 'standard')
	let faceLimit = Number(next.tripo3dFaceLimit) || 0

	if (isPSeries) {
		smartLowPoly = false
		generateParts = false
		autoSize = false
		compress = false
		geometryQuality = 'standard'
	} else if (isV25) {
		smartLowPoly = false
		generateParts = false
		autoSize = false
		compress = false
		geometryQuality = 'standard'
		quad = false
	} else if (!isV3OrLater) {
		smartLowPoly = false
		generateParts = false
		autoSize = false
		compress = false
		geometryQuality = 'standard'
		quad = false
	}

	if (generateParts) {
		texture = false
		pbr = false
		quad = false
		smartLowPoly = false
	}

	if (pbr) {
		texture = true
	}

	if (smartLowPoly) {
		quad = false
	}

	const range = getTripo3DFaceLimitRange(modelVersion, quad, smartLowPoly)
	if (faceLimit !== 0) {
		faceLimit = Math.min(Math.max(faceLimit, range.min), range.max)
	} else {
		faceLimit = 0
	}

	next.tripo3dModelSeries = modelSeries as 'h' | 'p'
	next.tripo3dModelVersion = modelVersion
	next.tripo3dQuad = supportsAdvanced && !generateParts && !smartLowPoly ? quad : false
	next.tripo3dSmartLowPoly = isV3OrLater && !isPSeries ? smartLowPoly : false
	next.tripo3dGenerateParts = isV3OrLater ? generateParts : false
	next.tripo3dTexture = texture
	next.tripo3dPbr = pbr
	next.tripo3dAutoSize = isV3OrLater ? autoSize : false
	next.tripo3dCompress = isV3OrLater ? compress : false
	next.tripo3dGeometryQuality = isV3OrLater && geometryQuality ? geometryQuality : 'standard'
	next.tripo3dFaceLimit = faceLimit
	next.tripo3dTextureQuality = String(next.tripo3dTextureQuality || 'standard')
	next.tripo3dTextureAlignment = String(next.tripo3dTextureAlignment || 'original_image')
	next.tripo3dOrientation = String(next.tripo3dOrientation || 'default')
	next.tripo3dEnableImageAutofix = Boolean(next.tripo3dEnableImageAutofix)
	next.tripo3dExportUv = next.tripo3dExportUv !== false
	next.tripo3dForceSingleImage = Boolean(next.tripo3dForceSingleImage)

	if (!Array.isArray(next.tripo3dSelectedImages)) {
		next.tripo3dSelectedImages = []
	}

	const taskMode = String(next.tripo3dTaskMode || 'image_to_model')
	const validTaskModes = ['text_to_model', 'image_to_model', 'multiview_to_model', 'texture', 'refine', 'mesh_segment', 'mesh_smartsegment', 'mesh_complete', 'mesh_decimate', 'models_convert']
	if (!validTaskModes.includes(taskMode)) {
		next.tripo3dTaskMode = 'image_to_model'
	} else {
		next.tripo3dTaskMode = taskMode as WorkflowTripo3DMode
	}

	if (next.tripo3dSegType && !['image', 'model'].includes(String(next.tripo3dSegType))) {
		delete next.tripo3dSegType
	}

	if (next.tripo3dGranularity && !['coarse', 'medium', 'fine'].includes(String(next.tripo3dGranularity))) {
		delete next.tripo3dGranularity
	}

	if (next.tripo3dDecimateModel && !['v1.0', 'v2.0'].includes(String(next.tripo3dDecimateModel))) {
		delete next.tripo3dDecimateModel
	}

	if (next.tripo3dConvertFormat && !['GLTF', 'FBX', 'USDZ', 'OBJ', 'STL', '3MF'].includes(String(next.tripo3dConvertFormat))) {
		delete next.tripo3dConvertFormat
	}

	next.tripo3dConvertQuad = Boolean(next.tripo3dConvertQuad)
	next.tripo3dConvertFlattenBottom = Boolean(next.tripo3dConvertFlattenBottom)

	if (next.tripo3dConvertFaceLimit !== undefined) {
		const convertFaceLimit = Number(next.tripo3dConvertFaceLimit)
		next.tripo3dConvertFaceLimit = convertFaceLimit > 0 ? convertFaceLimit : undefined
	}

	if (next.tripo3dConvertTextureSize !== undefined) {
		const textureSize = Number(next.tripo3dConvertTextureSize)
		next.tripo3dConvertTextureSize = textureSize > 0 ? textureSize : undefined
	}

	if (next.tripo3dPartNames && !Array.isArray(next.tripo3dPartNames)) {
		delete next.tripo3dPartNames
	}

	if (next.tripo3dHint !== undefined) {
		next.tripo3dHint = String(next.tripo3dHint).trim() || undefined
	}

	if (next.tripo3dTransform !== undefined) {
		const transform = next.tripo3dTransform as number[]
		if (!Array.isArray(transform) || transform.length !== 16) {
			delete next.tripo3dTransform
		}
	}

	next.tripo3dTextureModelVersion = String(next.tripo3dTextureModelVersion || 'v3.0-20250812')
	if (!['v2.5-20250123', 'v3.0-20250812'].includes(String(next.tripo3dTextureModelVersion))) {
		next.tripo3dTextureModelVersion = 'v3.0-20250812'
	}

	if (next.tripo3dTextureBake !== undefined) {
		next.tripo3dTextureBake = next.tripo3dTextureBake !== false
	} else {
		next.tripo3dTextureBake = true
	}

	next.tripo3dTextureForceSingleImage = Boolean(next.tripo3dTextureForceSingleImage)

	if (!Array.isArray(next.tripo3dTextureSelectedImages)) {
		next.tripo3dTextureSelectedImages = []
	}

	return next as WorkflowNodeChatParamRecord
}

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
				tripo3dImageMode: 'text_to_image',
				tripo3dImageModel: 'seedream_v4',
				tripo3dImageSize: '2K',
				tripo3dImageAspectRatio: '',
				tripo3dImageOutputFormat: 'png',
				tripo3dImageWatermark: false,
				tripo3dImageTemplate: '',
				tripo3dImageNumOutputs: 1,
				tripo3dImageNegativePrompt: '',
				tripo3dImageStrength: 0.7,
				tripo3dImageSeed: -1,
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
				meshyTextureImageNodeId: '',
				tripo3dModelSeries: 'h',
				tripo3dModelVersion: 'v3.1-20260211',
				tripo3dForceSingleImage: false,
				tripo3dSelectedImages: [],
				tripo3dFaceLimit: 0,
				tripo3dTexture: true,
				tripo3dPbr: true,
				tripo3dNegativePrompt: '',
				tripo3dEnableImageAutofix: false,
				tripo3dTextureAlignment: 'original_image',
				tripo3dOrientation: 'default',
				tripo3dTextureQuality: 'standard',
				tripo3dGeometryQuality: 'standard',
				tripo3dAutoSize: false,
				tripo3dQuad: false,
				tripo3dSmartLowPoly: false,
				tripo3dGenerateParts: false,
				tripo3dCompress: false,
				tripo3dExportUv: true,
				tripo3dModelSeed: -1,
				tripo3dTextureSeed: -1,
				tripo3dTaskMode: 'text_to_model',
				tripo3dTextureModelVersion: 'v3.0-20250812',
				tripo3dTextureBake: true,
				tripo3dSegType: 'image',
				tripo3dGranularity: 'medium',
				tripo3dDecimateModel: 'v2.0',
				tripo3dConvertFormat: 'GLTF',
				tripo3dConvertQuad: false,
				tripo3dConvertFlattenBottom: false,
				tripo3dConvertFaceLimit: 0,
				tripo3dConvertTextureSize: 2048,
				tripo3dPartNames: [],
				tripo3dHint: '',
				tripo3dTransform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
			}
		default:
			return {}
	}
}

export const isNodeChatTypeSupported = (type: string): boolean => {
	return type === 'text' || type === 'image' || type === 'video' || type === 'model3d'
}

export const NODE_CHAT_TRIPO3D_IMAGE_MODE_OPTIONS = [
	{ value: 'text_to_image', label: 'aiConfig.tripo3dImageMode.textToImage' },
	{ value: 'image_to_image', label: 'aiConfig.tripo3dImageMode.imageToImage' },
	{ value: 'image_to_multiview', label: 'aiConfig.tripo3dImageMode.imageToMultiview' },
]

export const NODE_CHAT_TRIPO3D_IMAGE_MODEL_OPTIONS = [
	{ value: 'seedream_v5', label: 'aiConfig.tripo3dImageModel.seedreamV5', badge: 'aiConfig.common.latest', description: 'aiConfig.tripo3dImageModel.seedreamV5Desc' },
	{ value: 'seedream_v4', label: 'aiConfig.tripo3dImageModel.seedreamV4', description: 'aiConfig.tripo3dImageModel.seedreamV4Desc' },
	{ value: 'banana', label: 'aiConfig.tripo3dImageModel.banana', description: 'aiConfig.tripo3dImageModel.bananaDesc' },
	{ value: 'banana_pro', label: 'aiConfig.tripo3dImageModel.bananaPro', description: 'aiConfig.tripo3dImageModel.bananaProDesc' },
	{ value: 'banana2', label: 'aiConfig.tripo3dImageModel.banana2', description: 'aiConfig.tripo3dImageModel.banana2Desc' },
	{ value: 'chat_image_1', label: 'aiConfig.tripo3dImageModel.chatImage1', description: 'aiConfig.tripo3dImageModel.chatImage1Desc' },
	{ value: 'chat_image_1.5', label: 'aiConfig.tripo3dImageModel.chatImage15', description: 'aiConfig.tripo3dImageModel.chatImage15Desc' },
	{ value: 'chat_image_2', label: 'aiConfig.tripo3dImageModel.chatImage2', badge: 'aiConfig.common.best', description: 'aiConfig.tripo3dImageModel.chatImage2Desc' },
]

export const NODE_CHAT_TRIPO3D_IMAGE_SIZE_OPTIONS: Record<string, Array<{ value: string; label: string; description?: string }>> = {
	seedream_v5: [
		{ value: '2K', label: '2K', description: 'aiConfig.tripo3dImageSize.seedreamV5.2k' },
		{ value: '3K', label: '3K', description: 'aiConfig.tripo3dImageSize.seedreamV5.3k' },
		{ value: '2048x2048', label: '2048×2048', description: '1:1' },
		{ value: '2048x1152', label: '2048×1152', description: '16:9' },
		{ value: '1152x2048', label: '1152×2048', description: '9:16' }
	],
	seedream_v4: [
		{ value: '2K', label: '2K', description: 'aiConfig.tripo3dImageSize.seedreamV4.2k' },
		{ value: '4K', label: '4K', description: 'aiConfig.tripo3dImageSize.seedreamV4.4k' },
		{ value: '2048x2048', label: '2048×2048', description: '1:1' },
		{ value: '2048x1152', label: '2048×1152', description: '16:9' },
		{ value: '1152x2048', label: '1152×2048', description: '9:16' }
	],
	banana: [
		{ value: '1K', label: '1K', description: 'aiConfig.tripo3dImageSize.banana.1k' },
		{ value: '2K', label: '2K', description: 'aiConfig.tripo3dImageSize.banana.2k' },
		{ value: '4K', label: '4K', description: 'aiConfig.tripo3dImageSize.banana.4k' }
	],
	banana_pro: [
		{ value: '1K', label: '1K', description: 'aiConfig.tripo3dImageSize.banana.1k' },
		{ value: '2K', label: '2K', description: 'aiConfig.tripo3dImageSize.banana.2k' },
		{ value: '4K', label: '4K', description: 'aiConfig.tripo3dImageSize.banana.4k' }
	],
	banana2: [
		{ value: '512', label: '512', description: 'aiConfig.tripo3dImageSize.banana2.512' },
		{ value: '1K', label: '1K', description: 'aiConfig.tripo3dImageSize.banana.1k' },
		{ value: '2K', label: '2K', description: 'aiConfig.tripo3dImageSize.banana.2k' },
		{ value: '4K', label: '4K', description: 'aiConfig.tripo3dImageSize.banana.4k' }
	],
	'chat_image_1': [
		{ value: '1024x1024', label: '1024×1024', description: '1:1' },
		{ value: '1024x1536', label: '1024×1536', description: '2:3' },
		{ value: '1536x1024', label: '1536×1024', description: '3:2' },
		{ value: 'auto', label: 'Auto', description: 'aiConfig.tripo3dImageSize.chatImage.auto' }
	],
	'chat_image_1.5': [
		{ value: '1024x1024', label: '1024×1024', description: '1:1' },
		{ value: '1024x1536', label: '1024×1536', description: '2:3' },
		{ value: '1536x1024', label: '1536×1024', description: '3:2' },
		{ value: 'auto', label: 'Auto', description: 'aiConfig.tripo3dImageSize.chatImage.auto' }
	],
	'chat_image_2': [
		{ value: '1024x1024', label: '1024×1024', description: '1:1' },
		{ value: '1024x1536', label: '1024×1536', description: '2:3' },
		{ value: '1536x1024', label: '1536×1024', description: '3:2' },
		{ value: '1024x1792', label: '1024×1792', description: '9:16' },
		{ value: '1792x1024', label: '1792×1024', description: '16:9' },
		{ value: '2048x2048', label: '2048×2048', description: '1:1 HD' },
		{ value: '2560x1440', label: '2560×1440', description: '16:9 2K' },
		{ value: '1440x2560', label: '1440×2560', description: '9:16 2K' }
	]
}

export const NODE_CHAT_TRIPO3D_IMAGE_ASPECT_RATIO_OPTIONS = [
	{ value: '1:1', label: '1:1' },
	{ value: '2:3', label: '2:3' },
	{ value: '3:2', label: '3:2' },
	{ value: '3:4', label: '3:4' },
	{ value: '4:3', label: '4:3' },
	{ value: '4:5', label: '4:5' },
	{ value: '5:4', label: '5:4' },
	{ value: '9:16', label: '9:16' },
	{ value: '16:9', label: '16:9' },
	{ value: '21:9', label: '21:9' }
]

export const NODE_CHAT_TRIPO3D_IMAGE_OUTPUT_FORMAT_OPTIONS = [
	{ value: 'png', label: 'PNG' },
	{ value: 'jpeg', label: 'JPEG' }
]

export const NODE_CHAT_TRIPO3D_IMAGE_WATERMARK_OPTIONS = [
	{ value: false, label: 'aiConfig.common.off' },
	{ value: true, label: 'aiConfig.common.on' }
]

export const NODE_CHAT_TRIPO3D_TEXT_TO_IMAGE_TEMPLATE_OPTIONS = [
	{ value: '', label: 'aiConfig.common.none' },
	{ value: 'asset_extraction', label: 'aiConfig.tripo3dImageTemplate.assetExtraction' },
	{ value: 'character_completion', label: 'aiConfig.tripo3dImageTemplate.characterCompletion' },
	{ value: 't_pose', label: 'aiConfig.tripo3dImageTemplate.tPose' },
	{ value: 'variants', label: 'aiConfig.tripo3dImageTemplate.variants' },
	{ value: 'figure', label: 'aiConfig.tripo3dImageTemplate.figure' }
]

export const NODE_CHAT_TRIPO3D_IMAGE_TO_IMAGE_TEMPLATE_OPTIONS = [
	{ value: '', label: 'aiConfig.common.none' },
	{ value: 't_pose', label: 'aiConfig.tripo3dImageTemplate.tPose' },
	{ value: 'character_completion', label: 'aiConfig.tripo3dImageTemplate.characterCompletion' },
	{ value: '3d_enhance', label: 'aiConfig.tripo3dImageTemplate.3dEnhance' },
	{ value: 'variants', label: 'aiConfig.tripo3dImageTemplate.variants' },
	{ value: 'figure', label: 'aiConfig.tripo3dImageTemplate.figure' }
]

export const NODE_CHAT_TRIPO3D_IMAGE_STRENGTH_OPTIONS = [
	{ value: 0.3, label: '0.3' },
	{ value: 0.5, label: '0.5' },
	{ value: 0.7, label: '0.7' },
	{ value: 0.9, label: '0.9' }
]

export const isTripo3DBananaModel = (model: string): boolean => {
	return model === 'banana' || model === 'banana_pro' || model === 'banana2'
}

export const isTripo3DSeedreamModel = (model: string): boolean => {
	return model === 'seedream_v4' || model === 'seedream_v5'
}

export const isTripo3DChatImageModel = (model: string): boolean => {
	return model === 'chat_image_1' || model === 'chat_image_1.5' || model === 'chat_image_2'
}

export const supportsTripo3DAspectRatio = (model: string): boolean => {
	return isTripo3DBananaModel(model)
}

export const supportsTripo3DWatermark = (model: string): boolean => {
	return isTripo3DSeedreamModel(model)
}

export const getTripo3DImageSizeOptions = (model: string) => {
	return NODE_CHAT_TRIPO3D_IMAGE_SIZE_OPTIONS[model] || NODE_CHAT_TRIPO3D_IMAGE_SIZE_OPTIONS.seedream_v4
}

export const getTripo3DImageDefaultSize = (model: string): string => {
	const options = getTripo3DImageSizeOptions(model)
	return options[0]?.value || '2K'
}

export const getTripo3DImageTemplateOptions = (mode: string) => {
	if (mode === 'image_to_image' || mode === 'image_to_multiview') {
		return NODE_CHAT_TRIPO3D_IMAGE_TO_IMAGE_TEMPLATE_OPTIONS
	}
	return NODE_CHAT_TRIPO3D_TEXT_TO_IMAGE_TEMPLATE_OPTIONS
}

export const NODE_CHAT_TRIPO3D_TASK_MODE_OPTIONS = [
	{ value: 'text_to_model', label: 'aiConfig.tripo3dTaskMode.textToModel' },
	{ value: 'image_to_model', label: 'aiConfig.tripo3dTaskMode.imageToModel' },
	{ value: 'multiview_to_model', label: 'aiConfig.tripo3dTaskMode.multiviewToModel' },
	{ value: 'texture', label: 'aiConfig.tripo3dTaskMode.texture' },
	{ value: 'refine', label: 'aiConfig.tripo3dTaskMode.refine' },
	{ value: 'mesh_segment', label: 'aiConfig.tripo3dTaskMode.meshSegment' },
	{ value: 'mesh_smartsegment', label: 'aiConfig.tripo3dTaskMode.meshSmartsegment' },
	{ value: 'mesh_complete', label: 'aiConfig.tripo3dTaskMode.meshComplete' },
	{ value: 'mesh_decimate', label: 'aiConfig.tripo3dTaskMode.meshDecimate' },
	{ value: 'models_convert', label: 'aiConfig.tripo3dTaskMode.modelsConvert' },
]

export const NODE_CHAT_TRIPO3D_SEG_TYPE_OPTIONS = [
	{ value: 'image', label: 'aiConfig.tripo3dSegType.image' },
	{ value: 'model', label: 'aiConfig.tripo3dSegType.model' },
]

export const NODE_CHAT_TRIPO3D_GRANULARITY_OPTIONS = [
	{ value: 'coarse', label: 'aiConfig.tripo3dGranularity.coarse' },
	{ value: 'medium', label: 'aiConfig.tripo3dGranularity.medium' },
	{ value: 'fine', label: 'aiConfig.tripo3dGranularity.fine' },
]

export const NODE_CHAT_TRIPO3D_DECIMATE_MODEL_OPTIONS = [
	{ value: 'v1.0', label: 'aiConfig.tripo3dDecimateModel.v10' },
	{ value: 'v2.0', label: 'aiConfig.tripo3dDecimateModel.v20', badge: 'aiConfig.common.recommended' },
]

export const NODE_CHAT_TRIPO3D_CONVERT_FORMAT_OPTIONS = [
	{ value: 'GLTF', label: 'GLTF' },
	{ value: 'FBX', label: 'FBX' },
	{ value: 'USDZ', label: 'USDZ' },
	{ value: 'OBJ', label: 'OBJ' },
	{ value: 'STL', label: 'STL' },
	{ value: '3MF', label: '3MF' },
]

export const isTripo3DPostProcessMode = (mode: string): boolean => {
	return ['texture', 'refine', 'mesh_segment', 'mesh_smartsegment', 'mesh_complete', 'mesh_decimate', 'models_convert'].includes(mode)
}

export const isTripo3DGenerateMode = (mode: string): boolean => {
	return ['text_to_model', 'image_to_model', 'multiview_to_model'].includes(mode)
}

export const normalizeNodeChatType = (type: string): WorkflowNodeChatType | null => {
	if (type === 'text' || type === 'image' || type === 'video' || type === 'model3d') {
		return type
	}
	return null
}

export const DIALOG_MIN_WIDTH = 380
export const DIALOG_MAX_WIDTH = 520
export const DIALOG_DEFAULT_NODE_WIDTH = 280

export const calcNodeDialogPosition = (nodeWidth?: number): { left: string; width: string } => {
	const width = nodeWidth || DIALOG_DEFAULT_NODE_WIDTH
	const dialogWidth = Math.min(DIALOG_MAX_WIDTH, Math.max(DIALOG_MIN_WIDTH, width))
	const leftPx = (width - dialogWidth) / 2
	return {
		left: `${leftPx}px`,
		width: `${dialogWidth}px`
	}
}
