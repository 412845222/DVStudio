import { t } from './I18nManager'

export const NODE_TYPE_KEY_MAP: Record<string, string> = {
	text: 'aiworkflow.canvas.nodeTypes.text',
	image: 'aiworkflow.canvas.nodeTypes.image',
	'rotate-image': 'aiworkflow.canvas.nodeTypes.rotateImage',
	video: 'aiworkflow.canvas.nodeTypes.video',
	model3d: 'aiworkflow.canvas.nodeTypes.model3d',
	meshy: 'aiworkflow.canvas.nodeTypes.meshy',
	blender: 'aiworkflow.canvas.nodeTypes.blender',
	comfyui: 'aiworkflow.canvas.nodeTypes.comfyui',
	'unreal-export': 'aiworkflow.canvas.nodeTypes.unrealExport',
	'scene-understanding': 'aiworkflow.canvas.nodeTypes.sceneUnderstanding',
	'scene-layout': 'aiworkflow.canvas.nodeTypes.sceneLayout',
	'scene-decompose': 'aiworkflow.canvas.nodeTypes.sceneDecompose',
	'director-console': 'aiworkflow.canvas.nodeTypes.directorConsole',
	story: 'aiworkflow.canvas.nodeTypes.story',
	'text-merge': 'aiworkflow.canvas.nodeTypes.textMerge'
}

export const NODE_TITLE_KEY_MAP: Record<string, string> = {
	text: 'aiworkflow.canvas.nodeTitles.text',
	image: 'aiworkflow.canvas.nodeTitles.image',
	'rotate-image': 'aiworkflow.canvas.nodeTitles.rotateImage',
	video: 'aiworkflow.canvas.nodeTitles.video',
	model3d: 'aiworkflow.canvas.nodeTitles.model3d',
	meshy: 'aiworkflow.canvas.nodeTitles.meshy',
	blender: 'aiworkflow.canvas.nodeTitles.blender',
	comfyui: 'aiworkflow.canvas.nodeTitles.comfyui',
	'unreal-export': 'aiworkflow.canvas.nodeTitles.unrealExport',
	'scene-understanding': 'aiworkflow.canvas.nodeTitles.sceneUnderstanding',
	'scene-layout': 'aiworkflow.canvas.nodeTitles.sceneLayout',
	'scene-decompose': 'aiworkflow.canvas.nodeTitles.sceneDecompose',
	'director-console': 'aiworkflow.canvas.nodeTitles.directorConsole',
	story: 'aiworkflow.canvas.nodeTitles.story',
	'text-merge': 'aiworkflow.canvas.nodeTitles.textMerge',
	base: 'aiworkflow.canvas.nodeTitles.base'
}

// All known default node titles across both locales (zh-CN and en-US)
// Maps title string -> nodeType, used to detect if a title is a default title that should be translated
export const DEFAULT_NODE_TITLES: Record<string, string> = {
	// Raw type
	text: 'text',
	image: 'image',
	'rotate-image': 'rotate-image',
	video: 'video',
	model3d: 'model3d',
	meshy: 'meshy',
	blender: 'blender',
	comfyui: 'comfyui',
	'unreal-export': 'unreal-export',
	'scene-understanding': 'scene-understanding',
	'scene-layout': 'scene-layout',
	'scene-decompose': 'scene-decompose',
	'director-console': 'director-console',
	story: 'story',
	'text-merge': 'text-merge',
	// Chinese short (without suffix)
	文本: 'text',
	图片: 'image',
	旋转图片: 'rotate-image',
	视频: 'video',
	'3D模型': 'model3d',
	Meshy: 'meshy',
	Blender: 'blender',
	ComfyUI: 'comfyui',
	UE导出: 'unreal-export',
	场景理解: 'scene-understanding',
	场景布局: 'scene-layout',
	场景拆解: 'scene-decompose',
	导演控制台: 'director-console',
	故事: 'story',
	文本合并: 'text-merge',
	// Chinese with "节点" suffix
	文本节点: 'text',
	图片节点: 'image',
	旋转图片节点: 'rotate-image',
	视频节点: 'video',
	'3D模型节点': 'model3d',
	Meshy节点: 'meshy',
	Meshy模型生成节点: 'meshy',
	Blender节点: 'blender',
	ComfyUI节点: 'comfyui',
	'ComfyUI 节点': 'comfyui',
	UE导出节点: 'unreal-export',
	虚幻导出节点: 'unreal-export',
	场景理解节点: 'scene-understanding',
	场景布局节点: 'scene-layout',
	场景拆解节点: 'scene-decompose',
	场景分解节点: 'scene-decompose',
	导演控制台节点: 'director-console',
	剧情节点: 'story',
	文本整合节点: 'text-merge',
	文本合并节点: 'text-merge',
	工作流节点: 'base',
	// English short (without suffix)
	Text: 'text',
	Image: 'image',
	'Rotate Image': 'rotate-image',
	Video: 'video',
	'3D Model': 'model3d',
	'UE Export': 'unreal-export',
	'Scene Understanding': 'scene-understanding',
	'Scene Layout': 'scene-layout',
	'Scene Decompose': 'scene-decompose',
	'Director Console': 'director-console',
	Story: 'story',
	'Text Merge': 'text-merge',
	// English with "Node" suffix
	'Text Node': 'text',
	'Image Node': 'image',
	'Rotate Image Node': 'rotate-image',
	'Video Node': 'video',
	'3D Model Node': 'model3d',
	'Meshy Node': 'meshy',
	'Blender Node': 'blender',
	'ComfyUI Node': 'comfyui',
	'UE Export Node': 'unreal-export',
	'Unreal Export Node': 'unreal-export',
	'Scene Understanding Node': 'scene-understanding',
	'Scene Layout Node': 'scene-layout',
	'Scene Decompose Node': 'scene-decompose',
	'Director Console Node': 'director-console',
	'Story Node': 'story',
	'Text Merge Node': 'text-merge',
	'Workflow Node': 'base'
}

export const PORT_LABEL_KEY_MAP: Record<string, string> = {
	多模态输入: 'aiworkflow.canvas.ports.multiInput',
	'Multi-modal Input': 'aiworkflow.canvas.ports.multiInput',
	文本输出: 'aiworkflow.canvas.ports.textOutput',
	'Text Output': 'aiworkflow.canvas.ports.textOutput',
	图片输出: 'aiworkflow.canvas.ports.imageOutput',
	'Image Output': 'aiworkflow.canvas.ports.imageOutput',
	旋转图片: 'aiworkflow.canvas.ports.rotatedImage',
	'Rotated Image': 'aiworkflow.canvas.ports.rotatedImage',
	图片输入: 'aiworkflow.canvas.ports.imageInput',
	'Image Input': 'aiworkflow.canvas.ports.imageInput',
	提示词输入: 'aiworkflow.canvas.ports.promptInput',
	'Prompt Input': 'aiworkflow.canvas.ports.promptInput',
	参考图输入: 'aiworkflow.canvas.ports.referenceImageInput',
	'Reference Image Input': 'aiworkflow.canvas.ports.referenceImageInput',
	参考视频输入: 'aiworkflow.canvas.ports.referenceVideoInput',
	'Reference Video Input': 'aiworkflow.canvas.ports.referenceVideoInput',
	视频输出: 'aiworkflow.canvas.ports.videoOutput',
	'Video Output': 'aiworkflow.canvas.ports.videoOutput',
	模型输入: 'aiworkflow.canvas.ports.modelInput',
	'Model Input': 'aiworkflow.canvas.ports.modelInput',
	提示词: 'aiworkflow.canvas.ports.prompt',
	Prompt: 'aiworkflow.canvas.ports.prompt',
	'参考图 1': 'aiworkflow.canvas.ports.referenceImage1',
	'Reference 1': 'aiworkflow.canvas.ports.referenceImage1',
	'参考图 2': 'aiworkflow.canvas.ports.referenceImage2',
	'Reference 2': 'aiworkflow.canvas.ports.referenceImage2',
	'参考图 3': 'aiworkflow.canvas.ports.referenceImage3',
	'Reference 3': 'aiworkflow.canvas.ports.referenceImage3',
	'参考图 4': 'aiworkflow.canvas.ports.referenceImage4',
	'Reference 4': 'aiworkflow.canvas.ports.referenceImage4',
	模型输出: 'aiworkflow.canvas.ports.modelOutput',
	'Model Output': 'aiworkflow.canvas.ports.modelOutput',
	预览图: 'aiworkflow.canvas.ports.previewImage',
	'Preview Image': 'aiworkflow.canvas.ports.previewImage',
	入口: 'aiworkflow.canvas.inputAnchor',
	Input: 'aiworkflow.canvas.inputAnchor',
	出口: 'aiworkflow.canvas.outputAnchor',
	Output: 'aiworkflow.canvas.outputAnchor',
	布局JSON: 'aiworkflow.canvas.ports.layoutJson',
	'Layout JSON': 'aiworkflow.canvas.ports.layoutJson'
}

export function translateNodeType(type: string): string {
	const key = NODE_TYPE_KEY_MAP[type]
	if (key) {
		const translated = t(key)
		if (translated !== key) return translated
	}
	return type
}

export function translateNodeTitle(nodeType: string, title: string, alias?: string): string {
	if (alias) return alias

	// Check if title is a known default title for this node type
	const defaultNodeType = DEFAULT_NODE_TITLES[title]
	if (defaultNodeType && (defaultNodeType === nodeType || defaultNodeType === 'base')) {
		// It's a default title, translate using full node title key
		const titleKey = NODE_TITLE_KEY_MAP[nodeType] || NODE_TITLE_KEY_MAP.base
		if (titleKey) {
			const translated = t(titleKey)
			if (translated !== titleKey) return translated
		}
		// Fallback to node type translation
		return translateNodeType(nodeType)
	}

	// Also check: if title matches the current translation of nodeTitle, it's still a default
	const titleKey = NODE_TITLE_KEY_MAP[nodeType]
	if (titleKey) {
		const currentTitleTranslation = t(titleKey)
		if (title === currentTitleTranslation) {
			return currentTitleTranslation
		}
	}

	// Check if title matches raw nodeType
	if (title === nodeType) {
		const fallbackKey = NODE_TITLE_KEY_MAP[nodeType]
		if (fallbackKey) {
			const translated = t(fallbackKey)
			if (translated !== fallbackKey) return translated
		}
		return translateNodeType(nodeType)
	}

	// User-customized title, return as-is
	return title
}

export function translatePortLabel(label: string | undefined, fallback: string): string {
	if (!label) return fallback
	const key = PORT_LABEL_KEY_MAP[label]
	if (key) {
		const translated = t(key)
		if (translated !== key) return translated
	}
	return label
}
