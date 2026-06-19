import type { WorkflowNodeChatType } from '../../../aiworkflow/types'

export const NODE_CHAT_TYPE_LABELS: Record<WorkflowNodeChatType, string> = {
  text: '文本生成',
  image: '图片生成',
  video: '视频生成',
  model3d: '3D模型生成',
}

export const NODE_CHAT_TYPE_COLORS: Record<WorkflowNodeChatType, string> = {
  text: '#f59e0b',
  image: '#3b82f6',
  video: '#22c55e',
  model3d: '#a855f7',
}

export const NODE_CHAT_TYPE_ICONS: Record<WorkflowNodeChatType, string> = {
  text: '📝',
  image: '🖼️',
  video: '🎬',
  model3d: '🧊',
}

export const NODE_CHAT_PLACEHOLDERS: Record<WorkflowNodeChatType, string> = {
  text: '输入文本内容或描述...',
  image: '描述你想生成的图片，如：a beautiful sunset over the ocean...',
  video: '描述你想生成的视频内容，如：a cat running across the beach...',
  model3d: '描述你想生成的3D模型，如：a medieval castle with towers...',
}

export const NODE_CHAT_TYPE_DESCRIPTIONS: Record<WorkflowNodeChatType, string> = {
  text: '输入提示词，AI 将生成文本内容',
  image: '输入提示词，AI 将生成图片',
  video: '输入提示词，AI 将生成视频',
  model3d: '输入提示词，AI 将生成3D模型',
}

export const NODE_CHAT_ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '4:3', label: '4:3 标准' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '21:9', label: '21:9 超宽' },
]

export const NODE_CHAT_RESOLUTION_OPTIONS = [
  { value: '512x512', label: '512×512' },
  { value: '768x768', label: '768×768' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '1536x1024', label: '1536×1024' },
  { value: '2048x2048', label: '2048×2048' },
]

export const NODE_CHAT_QUANTITY_OPTIONS = [1, 2, 4, 6, 8]

export const NODE_CHAT_VIDEO_MODE_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'text_to_video', label: '文生视频' },
  { value: 'image_to_video', label: '首帧图生' },
  { value: 'first-last', label: '首尾帧' },
  { value: 'reference', label: '多模态参考' },
]

export const NODE_CHAT_VIDEO_DURATION_OPTIONS = [
  { value: -1, label: '自动' },
  { value: 4, label: '4秒' },
  { value: 5, label: '5秒' },
  { value: 6, label: '6秒' },
  { value: 8, label: '8秒' },
  { value: 10, label: '10秒' },
  { value: 12, label: '12秒' },
  { value: 15, label: '15秒' },
]

export const NODE_CHAT_VIDEO_RATIO_OPTIONS = [
  { value: 'adaptive', label: '自适应' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

export const NODE_CHAT_MODEL3D_PROVIDER_OPTIONS = [
  { value: 'tripo3d', label: 'Tripo3D' },
  { value: 'hunyuan3d', label: 'Hunyuan3D' },
  { value: 'rodin3d', label: 'Rodin 3D' },
  { value: 'meshy', label: 'Meshy' },
]

export const NODE_CHAT_MESHY_MODE_OPTIONS = [
  { value: 'text-to-3d', label: '文本生成' },
  { value: 'image-to-3d', label: '单图生成' },
  { value: 'multi-image-to-3d', label: '多图生成' },
  { value: 'retexture', label: '重新纹理化' },
  { value: 'remesh', label: '重新网格化' },
]

export const NODE_CHAT_MESHY_STAGE_OPTIONS = [
  { value: 'preview', label: '预览' },
  { value: 'refine', label: '精修' },
]

export const NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS = [
  { value: 'glb', label: 'GLB' },
  { value: 'fbx', label: 'FBX' },
  { value: 'obj', label: 'OBJ' },
  { value: 'stl', label: 'STL' },
  { value: 'usdz', label: 'USDZ' },
]

export const NODE_CHAT_TRIPO_MODE_OPTIONS = [
  { value: 'image-to-3d', label: '单图生成' },
  { value: 'multi-image-to-3d', label: '多图生成' },
  { value: 'retopo', label: '模型重拓扑' },
]

export const NODE_CHAT_TRIPO_OUTPUT_FORMAT_OPTIONS = [
  { value: 'fbx', label: 'FBX' },
  { value: 'glb', label: 'GLB' },
]

export const NODE_CHAT_TRIPO_TEXTURE_QUALITY_OPTIONS = [
  { value: 'standard', label: '标准贴图' },
  { value: 'detailed', label: '精细贴图' },
]

export const NODE_CHAT_HUNYUAN_MODE_OPTIONS = [
  { value: 'image-to-3d', label: '单图生模' },
  { value: 'multi-image-to-3d', label: '多图生模' },
  { value: 'hunyuan-reduce-face', label: '减面重拓扑' },
]

export const NODE_CHAT_HUNYUAN_FACE_LEVEL_OPTIONS = [
  { value: 'high', label: '高精度' },
  { value: 'medium', label: '均衡' },
  { value: 'low', label: '轻量' },
]

export const NODE_CHAT_HUNYUAN_POLYGON_TYPE_OPTIONS = [
  { value: 'triangle', label: '三角面' },
  { value: 'quadrilateral', label: '四边面' },
]

export const NODE_CHAT_HUNYUAN_OUTPUT_FORMAT_OPTIONS = [
  { value: 'fbx', label: 'FBX' },
  { value: 'glb', label: 'GLB' },
]

export const NODE_CHAT_RODIN_TIER_OPTIONS = [
  { value: '', label: '默认（让DM/Rodin决定）' },
  { value: 'Gen-2.5-Extreme-Low', label: 'Extreme-Low' },
  { value: 'Gen-2.5-Low', label: 'Low' },
  { value: 'Gen-2.5-Medium', label: 'Medium' },
  { value: 'Gen-2.5-High', label: 'High' },
  { value: 'Gen-2.5-Extreme-High', label: 'Extreme-High' },
]

export const NODE_CHAT_RODIN_QUALITY_OPTIONS = [
  { value: 'extra-low', label: 'extra-low' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
]

export const NODE_CHAT_RODIN_OUTPUT_FORMAT_OPTIONS = [
  { value: 'glb', label: 'GLB' },
  { value: 'usdz', label: 'USDZ' },
  { value: 'fbx', label: 'FBX' },
  { value: 'obj', label: 'OBJ' },
  { value: 'stl', label: 'STL' },
]

export const NODE_CHAT_TEXT_SPEED_OPTIONS = [
  { value: 'fast', label: '快速' },
  { value: 'normal', label: '标准' },
  { value: 'slow', label: '精细' },
]

export const NODE_CHAT_TEXT_MODEL_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'bytedance', label: '字节火山方舟' },
]

// Seed 2.0 模型版本选项（字节方舟）
export const NODE_CHAT_SEED_MODEL_VERSION_OPTIONS = [
  { value: 'doubao-seed-2-0-pro-260215', label: 'Seed 2.0 Pro（深度思考）' },
  { value: 'doubao-seed-2-0-lite-260428', label: 'Seed 2.0 Lite（平衡）' },
  { value: 'doubao-seed-2-0-mini-260428', label: 'Seed 2.0 Mini（快速）' },
  { value: 'doubao-seed-2-0-code-preview-260215', label: 'Seed 2.0 Code（代码增强）' },
  { value: 'doubao-seed-1-8-251228', label: 'Seed 1.8（兼容旧版）' },
]

// 深度思考开关
export const NODE_CHAT_TEXT_THINKING_OPTIONS = [
  { value: 'enabled', label: '开启深度思考' },
  { value: 'disabled', label: '关闭深度思考' },
]

// 输出格式选项
export const NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'json_object', label: 'JSON 对象' },
]

// 最大输出长度选项
export const NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS = [
  { value: 2048, label: '2048 tokens' },
  { value: 4096, label: '4096 tokens' },
  { value: 8192, label: '8192 tokens' },
  { value: 16384, label: '16384 tokens' },
]

export const NODE_CHAT_IMAGE_MODEL_OPTIONS = [
  { value: 'nanobanana', label: 'NanoBanana (Gemini)' },
  { value: 'seedream', label: 'Seedream (字节方舟)' },
]

export const NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS = [
  { value: 'doubao-seedream-3-0-t2i-250415', label: 'Seedream v3.0' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream v4.0' },
  { value: 'doubao-seedream-5-0-260128', label: 'Seedream v5.0' },
  { value: 'doubao-seedream-5-0-lite-260128', label: 'Seedream v5.0 Lite' },
]

export const NODE_CHAT_VIDEO_MODEL_OPTIONS = [
  { value: 'seedance', label: 'Seedance (字节方舟)' },
]

export const NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance v1.5 Pro' },
  { value: 'doubao-seedance-1-0-pro-250312', label: 'Seedance v1.0 Pro' },
  { value: 'doubao-seedance-1-0-pro-fast-250312', label: 'Seedance v1.0 Pro Fast' },
  { value: 'doubao-seedance-1-0-lite-i2v-250312', label: 'Seedance v1.0 Lite I2V' },
  { value: 'doubao-seedance-1-0-lite-t2v-250312', label: 'Seedance v1.0 Lite T2V' },
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
        maxTokens: 4096,
      }
    case 'image':
      return {
        modelId: undefined,
        model: 'nanobanana',
        seedreamModelVersion: 'doubao-seedream-3-0-t2i-250415',
        resolution: '1024x1024',
        aspectRatio: '1:1',
        quantity: 1,
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
      }
    case 'model3d':
      return {
        provider: 'tripo3d',
        tripoProvider: 'dreammaker',
        tripoMode: 'image-to-3d',
        tripoOutputFormat: 'glb',
        tripoTextureQuality: 'standard',
        tripoModelVersion: undefined,
        hunyuanMode: 'image-to-3d',
        hunyuanFaceLevel: 'medium',
        hunyuanPolygonType: 'triangle',
        hunyuanOutputFormat: 'glb',
        rodinTier: '',
        rodinQuality: 'medium',
        rodinOutputFormat: 'glb',
        meshyMode: 'text-to-3d',
        meshyStage: 'preview',
        meshyOutputFormat: 'glb',
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
