import type { WorkflowNodeChatType } from '../../../aiworkflow/types'

export const NODE_CHAT_TYPE_LABELS: Record<WorkflowNodeChatType, string> = {
	text: '文本生成',
	image: '图片生成',
	video: '视频生成',
	model3d: '3D模型生成'
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
	text: '输入文本内容或描述...',
	image: '描述你想生成的图片，如：a beautiful sunset over the ocean...',
	video: '描述你想生成的视频内容，如：a cat running across the beach...',
	model3d: '描述你想生成的3D模型，如：a medieval castle with towers...'
}

export const NODE_CHAT_TYPE_DESCRIPTIONS: Record<WorkflowNodeChatType, string> = {
	text: '输入提示词，AI 将生成文本内容',
	image: '输入提示词，AI 将生成图片',
	video: '输入提示词，AI 将生成视频',
	model3d: '输入提示词，AI 将生成3D模型'
}

export const NODE_CHAT_ASPECT_RATIO_OPTIONS = [
	{ value: '1:1', label: '1:1 正方形' },
	{ value: '16:9', label: '16:9 宽屏' },
	{ value: '9:16', label: '9:16 竖屏' },
	{ value: '4:3', label: '4:3 标准' },
	{ value: '3:4', label: '3:4 竖版' },
	{ value: '21:9', label: '21:9 超宽' }
]

export const NODE_CHAT_RESOLUTION_OPTIONS = [
	{ value: '512x512', label: '512×512' },
	{ value: '768x768', label: '768×768' },
	{ value: '1024x1024', label: '1024×1024' },
	{ value: '1536x1024', label: '1536×1024' },
	{ value: '2048x2048', label: '2048×2048' }
]

export const NODE_CHAT_QUANTITY_OPTIONS = [1, 2, 4, 6, 8]

export const NODE_CHAT_VIDEO_MODE_OPTIONS = [
	{ value: 'auto' as const, label: '自动' },
	{ value: 'text_to_video' as const, label: '文生视频' },
	{ value: 'image_to_video' as const, label: '首帧图生' },
	{ value: 'first-last' as const, label: '首尾帧' },
	{ value: 'reference' as const, label: '多模态参考' }
]

export const NODE_CHAT_VIDEO_DURATION_OPTIONS = [
	{ value: -1, label: '自动' },
	{ value: 4, label: '4秒' },
	{ value: 5, label: '5秒' },
	{ value: 6, label: '6秒' },
	{ value: 8, label: '8秒' },
	{ value: 10, label: '10秒' },
	{ value: 12, label: '12秒' },
	{ value: 15, label: '15秒' }
]

export const NODE_CHAT_VIDEO_RATIO_OPTIONS = [
	{ value: 'adaptive', label: '自适应' },
	{ value: '16:9', label: '16:9' },
	{ value: '9:16', label: '9:16' },
	{ value: '1:1', label: '1:1' },
	{ value: '4:3', label: '4:3' },
	{ value: '3:4', label: '3:4' }
]

export const NODE_CHAT_MESHY_MODE_OPTIONS = [
	{ value: 'text-to-3d', label: 'Text to 3D' },
	{ value: 'image-to-3d', label: 'Image to 3D' },
	{ value: 'multi-image-to-3d', label: 'Multi-Image to 3D' },
	{ value: 'remesh', label: '重建网格 (ReMesh)' },
	{ value: 'retexture', label: '重新纹理 (ReTexture)' },
	{ value: 'uv-unwrap', label: 'UV Unwrap' }
]

export const NODE_CHAT_MESHY_AI_MODEL_OPTIONS = [
	{ value: 'latest', label: 'latest' },
	{ value: 'meshy-6', label: 'meshy-6' },
	{ value: 'meshy-5', label: 'meshy-5' }
]

export const NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS = [
	{ value: 'standard', label: '标准' },
	{ value: 'lowpoly', label: '低模' }
]

export const NODE_CHAT_MESHY_TOPOLOGY_OPTIONS = [
	{ value: 'triangle', label: 'triangle' },
	{ value: 'quad', label: 'quad' }
]

export const NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS = [
	{ value: 'auto', label: 'auto' },
	{ value: 'on', label: 'on' },
	{ value: 'off', label: 'off' }
]

export const NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS = [
	{ value: 'bottom', label: '底部' },
	{ value: 'center', label: '中心' }
]

export const NODE_CHAT_MESHY_POSE_MODE_OPTIONS = [
	{ value: '', label: '无' },
	{ value: 'a-pose', label: 'a-pose' },
	{ value: 't-pose', label: 't-pose' }
]

export const NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS = [
	{ value: 'glb', label: 'GLB' },
	{ value: 'fbx', label: 'FBX' },
	{ value: 'obj', label: 'OBJ' },
	{ value: 'stl', label: 'STL' },
	{ value: 'usdz', label: 'USDZ' }
]

export const NODE_CHAT_MESHY_DECIMATION_MODE_OPTIONS = [
	{ value: 'auto', label: 'auto' },
	{ value: 'fast', label: 'fast' },
	{ value: 'accurate', label: 'accurate' }
]

export const NODE_CHAT_TEXT_SPEED_OPTIONS = [
	{ value: 'fast' as const, label: '快速' },
	{ value: 'normal' as const, label: '标准' },
	{ value: 'slow' as const, label: '精细' }
]

export const NODE_CHAT_TEXT_MODEL_OPTIONS = [
	{ value: 'deepseek', label: 'DeepSeek' },
	{ value: 'bytedance', label: '字节火山方舟' }
]

// Seed 2.0 模型版本选项（字节方舟）
export const NODE_CHAT_SEED_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seed-2-0-pro-260215', label: 'Seed 2.0 Pro（深度思考）' },
	{ value: 'doubao-seed-2-0-lite-260428', label: 'Seed 2.0 Lite（平衡）' },
	{ value: 'doubao-seed-2-0-mini-260428', label: 'Seed 2.0 Mini（快速）' },
	{ value: 'doubao-seed-2-0-code-preview-260215', label: 'Seed 2.0 Code（代码增强）' },
	{ value: 'doubao-seed-1-8-251228', label: 'Seed 1.8（兼容旧版）' }
]

// 深度思考开关
export const NODE_CHAT_TEXT_THINKING_OPTIONS = [
	{ value: 'enabled', label: '开启深度思考' },
	{ value: 'disabled', label: '关闭深度思考' }
]

// 输出格式选项
export const NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS = [
	{ value: 'text', label: '文本' },
	{ value: 'json_object', label: 'JSON 对象' }
]

// 最大输出长度选项
export const NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS = [
	{ value: 2048, label: '2048 tokens' },
	{ value: 4096, label: '4096 tokens' },
	{ value: 8192, label: '8192 tokens' },
	{ value: 16384, label: '16384 tokens' }
]

export const NODE_CHAT_IMAGE_MODEL_OPTIONS = [
	{ value: 'nanobanana', label: 'NanoBanana' },
	{ value: 'seedream', label: 'Seedream (字节方舟)' },
	{ value: 'meshy', label: 'Meshy' }
]

export const NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS = [
	{ value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (NanoBanana)' },
	{ value: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image (NanoBanana2)' },
	{ value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' }
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
		{ value: '', label: '无' },
		{ value: 'a-pose', label: 'a-pose' },
		{ value: 't-pose', label: 't-pose' }
	]
}

export const NODE_CHAT_VIDEO_RESOLUTION_OPTIONS = [
	{ value: '480p', label: '480p' },
	{ value: '720p', label: '720p' },
	{ value: '1080p', label: '1080p' },
	{ value: '4k', label: '4K' }
]

export const NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seedream-4-5-251128', label: 'Seedream v4.5 (推荐)' },
	{ value: 'doubao-seedream-4-0-250828', label: 'Seedream v4.0' },
	{ value: 'doubao-seedream-5-0-260128', label: 'Seedream v5.0' },
	{ value: 'doubao-seedream-5-0-lite-260128', label: 'Seedream v5.0 Lite' }
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

export const NODE_CHAT_VIDEO_MODEL_OPTIONS = [{ value: 'seedance', label: 'Seedance (字节方舟)' }]

export const NODE_CHAT_MODEL3D_PROVIDER_OPTIONS = [{ value: 'meshy' as const, label: 'Meshy' }]

export const NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS = [
	{ value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
	{ value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
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
				model: 'bytedance',
				textModelVersion: 'doubao-seed-2-0-pro-260215',
				speed: 'normal',
				thinking: 'enabled',
				responseFormat: 'text',
				maxTokens: 4096
			}
		case 'image':
			return {
				modelId: undefined,
				model: 'seedream',
				nanobananaModelVersion: 'gemini-2.5-flash-image',
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
