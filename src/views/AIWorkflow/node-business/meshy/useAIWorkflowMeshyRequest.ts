import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import type {
	MeshyGeneratePayload,
	MeshyRequestMode,
	BuildMeshyRequestResult,
	MeshyNodeSettingsLike
} from './types'

type LinkedImageInput = {
	edge: WorkflowEdge
	fromNode: WorkflowNode
	fromAnchorId: string
	url: string
}

type LinkedModelInput = {
	inputTaskId?: string
	modelUrl: string
	sourceName?: string
} | null

type ImageDimensions = {
	width: number
	height: number
	ratioOnly?: boolean
}

export const useAIWorkflowMeshyRequest = (options: {
	connectedMeshyPrompt: (nodeId: string) => string
	connectedMeshyImageInputs: (nodeId: string) => LinkedImageInput[]
	connectedMeshyModelInput: (nodeId: string) => Promise<LinkedModelInput>
	buildMeshyImageInputFromNode: (fromNode: WorkflowNode, fromAnchorId: string) => Promise<string>
	normalizeMeshyImageInputValue: (rawValue: string, label: string) => Promise<string>
	hasConnectedMeshyConsumer: (node: WorkflowNode) => boolean
	missingMeshyImageOutputAnchors: (node: WorkflowNode) => string[]
	meshyImageOutputCount: (settings: MeshyNodeSettingsLike) => number
}) => {
	const meshyImageInputDimensions = (
		fromNode: WorkflowNode,
		fromAnchorId: string
	): ImageDimensions | null => {
		if (fromNode.type === 'image') {
			const width = Number(
				fromNode.imageSettings?.outputWidth ?? fromNode.imageSettings?.naturalWidth ?? 0
			)
			const height = Number(
				fromNode.imageSettings?.outputHeight ?? fromNode.imageSettings?.naturalHeight ?? 0
			)
			if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
				return { width: Math.floor(width), height: Math.floor(height) }
			}
		}
		if (fromNode.type === 'scene-decompose') {
			const outputs = Array.isArray(fromNode.sceneDecomposeSettings?.outputs)
				? fromNode.sceneDecomposeSettings?.outputs
				: []
			const item = outputs?.find(
				(entry) => String((entry as Record<string, unknown>)?.imageAnchorId ?? '') === fromAnchorId
			)
			const width = Number((item as Record<string, unknown>)?.outputWidth ?? 0)
			const height = Number((item as Record<string, unknown>)?.outputHeight ?? 0)
			if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
				return { width: Math.floor(width), height: Math.floor(height) }
			}
		}
		if (fromNode.type === 'meshy') {
			const settings = fromNode.meshySettings as Record<string, unknown> | undefined
			const ratio = String(settings?.meshyAspectRatio ?? '').trim()
			if (ratio && /^\d+:\d+$/.test(ratio)) {
				const [rw, rh] = ratio.split(':').map((x) => Number(x))
				if (rw > 0 && rh > 0) return { width: rw, height: rh, ratioOnly: true }
			}
		}
		return null
	}

	const buildMeshyImageConstraintHint = (
		mode: Extract<
			MeshyRequestMode,
			'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d' | 'text-to-image' | 'image-to-image'
		>,
		linkedImageInputs: LinkedImageInput[]
	) => {
		if (mode !== 'image-to-3d' && mode !== 'multi-image-to-3d') return ''
		const first = linkedImageInputs[0]
		if (!first) return ''
		const dim = meshyImageInputDimensions(first.fromNode, first.fromAnchorId)
		if (!dim) return ''
		const width = Math.max(1, Number(dim.width || 0))
		const height = Math.max(1, Number(dim.height || 0))
		const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
		const g = gcd(width, height)
		const ratioText = `${Math.max(1, Math.floor(width / g))}:${Math.max(1, Math.floor(height / g))}`
		if (dim.ratioOnly === true) {
			return `参考图比例 ${ratioText}`
		}
		return `参考图分辨率 ${width}x${height}，比例 ${ratioText}`
	}

	const buildMeshyRequestPayload = async (node: WorkflowNode): Promise<BuildMeshyRequestResult> => {
		const settings = (node.meshySettings ?? {}) as Record<string, unknown>
		const linkedPrompt = options.connectedMeshyPrompt(node.id)
		const linkedImageInputs = options.connectedMeshyImageInputs(node.id)
		let linkedModelInput: LinkedModelInput = null
		try {
			linkedModelInput = await options.connectedMeshyModelInput(node.id)
		} catch (err: unknown) {
			return {
				ok: false,
				error: `模型输入读取失败：${getErrorMessage(err)}`
			}
		}
		const target = String(settings.meshyTaskTarget ?? '3d') as '3d' | 'image'
		const family = String(
			settings.meshyTaskFamily ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
		)
		const relationSummary = isRecord(settings.meshyRelationSummary)
			? settings.meshyRelationSummary
			: {}
		const currentTaskId = String(
			settings.meshyTaskId ?? relationSummary.effectiveTaskId ?? ''
		).trim()
		const rootTaskId = String(
			settings.meshyRootTaskId ?? relationSummary.rootTaskId ?? currentTaskId
		).trim()
		const parentTaskId = String(settings.meshyParentTaskId ?? '').trim()
		const manualPreviewTaskId = String(settings.meshyPreviewTaskId ?? '').trim()
		const outputCount = options.meshyImageOutputCount(node.meshySettings)

		if (!options.hasConnectedMeshyConsumer(node)) {
			return {
				ok: false,
				error:
					target === 'image'
						? '请先把 Meshy 图片输出锚点连接到下游图片输入后再启动任务。'
						: '请先把 Meshy 模型输出锚点连接到下游资源/模型输入后再启动任务。'
			}
		}
		if (target === 'image') {
			const missing = options.missingMeshyImageOutputAnchors(node)
			if (missing.length) {
				return {
					ok: false,
					error: `当前设置需输出 ${outputCount} 张图片，以下输出锚点未连接：${missing.join('、')}`
				}
			}
		}

		if (family === 'remesh') {
			return { ok: false, error: 'Remesh 独立任务接口尚未接入，当前版本先接通主模型与贴图闭环。' }
		}

		const mode = (
			family === 'text-to-image'
				? 'text-to-image'
				: family === 'image-to-image'
					? 'image-to-image'
					: family === 'image-to-3d'
						? 'image-to-3d'
						: family === 'multi-image-to-3d'
							? 'multi-image-to-3d'
							: family === 'retexture'
								? 'retexture'
								: family === 'remesh'
									? 'remesh'
									: family === 'rigging'
										? 'rigging'
										: family === 'animation'
											? 'animation'
											: 'text-to-3d'
		) as MeshyRequestMode

		const stage = family === 'refine' || family === 'retexture' ? 'refine' : 'preview'
		const relationKind =
			family === 'retexture'
				? 'texture'
				: String(settings.meshyRelationKind ?? relationSummary.relationKind ?? 'model').trim() ||
					'model'
		const imageLimit = family === 'image-to-image' ? 5 : 4
		const manualImageUrls = Array.isArray(settings.meshyImageUrls)
			? settings.meshyImageUrls.map((x) => String(x ?? '').trim()).filter(Boolean)
			: []
		const linkedImages: string[] = []
		for (const item of linkedImageInputs.slice(0, imageLimit)) {
			try {
				const normalized = await options.buildMeshyImageInputFromNode(
					item.fromNode,
					item.fromAnchorId
				)
				if (normalized) linkedImages.push(normalized)
			} catch (err: unknown) {
				const label =
					String(item.fromNode.alias ?? item.fromNode.title ?? item.fromNode.id).trim() ||
					item.fromNode.id
				return {
					ok: false,
					error: `参考图「${label}」读取失败：${getErrorMessage(err)}`
				}
			}
		}
		const resolvedManualImageUrls: string[] = []
		for (const rawUrl of manualImageUrls.slice(0, imageLimit)) {
			try {
				const normalized = await options.normalizeMeshyImageInputValue(rawUrl, 'meshy_manual_ref')
				if (normalized) resolvedManualImageUrls.push(normalized)
			} catch (err: unknown) {
				return {
					ok: false,
					error: `手填参考图读取失败：${getErrorMessage(err)}`
				}
			}
		}
		let resolvedSingleImageUrl = ''
		try {
			resolvedSingleImageUrl = String(settings.meshyImageUrl ?? '').trim()
				? await options.normalizeMeshyImageInputValue(
						String(settings.meshyImageUrl ?? '').trim(),
						'meshy_single_ref'
					)
				: ''
		} catch (err: unknown) {
			return {
				ok: false,
				error: `单图参考图读取失败：${getErrorMessage(err)}`
			}
		}
		const imageUrls = linkedImages.length ? linkedImages : resolvedManualImageUrls
		const generateMultiView = settings.meshyGenerateMultiView === true
		const aspectRatio = generateMultiView ? '' : String(settings.meshyAspectRatio ?? '').trim()
		const poseMode = String(settings.meshyPoseMode ?? '').trim()
		const autoSize = settings.meshyAutoSize === true
		const originAt = String(settings.meshyOriginAt ?? '').trim() === 'center' ? 'center' : 'bottom'
		const seed = Number(settings.meshySeed ?? 0)
		let textureImageUrl = ''
		try {
			textureImageUrl = String(settings.meshyTextureImageUrl ?? '').trim()
				? await options.normalizeMeshyImageInputValue(
						String(settings.meshyTextureImageUrl ?? '').trim(),
						'meshy_texture_ref'
					)
				: ''
		} catch (err: unknown) {
			return {
				ok: false,
				error: `贴图参考图读取失败：${getErrorMessage(err)}`
			}
		}
		if (!textureImageUrl && family === 'retexture') {
			textureImageUrl = String(imageUrls[0] || resolvedSingleImageUrl || '').trim()
		}

		const rawPrompt = linkedPrompt || String(settings.meshyPrompt ?? '').trim()
		const sizeConstraintMode =
			mode === 'image-to-3d' ||
			mode === 'multi-image-to-3d' ||
			mode === 'text-to-3d' ||
			mode === 'text-to-image' ||
			mode === 'image-to-image'
				? mode
				: 'text-to-3d'
		const sizeConstraintHint = buildMeshyImageConstraintHint(sizeConstraintMode, linkedImageInputs)
		const promptHasSizeHint = /尺寸|分辨率|宽|高|比例|aspect|ratio/i.test(rawPrompt)
		const promptWithConstraint = sizeConstraintHint
			? rawPrompt
				? promptHasSizeHint
					? rawPrompt
					: `${rawPrompt}。严格保持输入图像尺寸比例（${sizeConstraintHint}）。`
				: `严格保持输入图像尺寸比例（${sizeConstraintHint}）。`
			: rawPrompt

		const payload: MeshyGeneratePayload = {
			target,
			family,
			mode,
			stage,
			prompt: promptWithConstraint,
			negative_prompt: String(settings.meshyNegativePrompt ?? '').trim(),
			preview_task_id: String(settings.meshyPreviewTaskId ?? '').trim(),
			image_url: imageUrls[0] || resolvedSingleImageUrl,
			image_urls: imageUrls,
			reference_image_urls: imageUrls,
			output_image_count: outputCount,
			model_url: String(linkedModelInput?.modelUrl ?? '').trim(),
			texture_prompt: String(settings.meshyTexturePrompt ?? '').trim(),
			texture_image_url: textureImageUrl,
			ai_model:
				target === 'image'
					? String(settings.meshyAiModel ?? 'nano-banana')
					: String(settings.meshyAiModel ?? 'latest'),
			model_type: String(settings.meshyModelType ?? 'standard'),
			topology: String(settings.meshyTopology ?? 'triangle'),
			target_polycount: Number(settings.meshyTargetPolycount ?? 30000),
			symmetry_mode: String(settings.meshySymmetryMode ?? 'auto'),
			should_remesh: settings.meshyShouldRemesh === true,
			save_pre_remeshed_model: settings.meshySavePreRemeshedModel === true,
			should_texture: settings.meshyShouldTexture !== false,
			enable_pbr: settings.meshyShouldTexture !== false && settings.meshyEnablePbr === true,
			pose_mode: poseMode,
			aspect_ratio: aspectRatio,
			generate_multi_view: generateMultiView,
			auto_size: autoSize,
			origin_at: autoSize ? originAt : undefined,
			seed: Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : undefined,
			moderation: settings.meshyModeration === true,
			image_enhancement: settings.meshyImageEnhancement !== false,
			remove_lighting: settings.meshyRemoveLighting !== false,
			target_formats:
				Array.isArray(settings.meshyTargetFormats) && settings.meshyTargetFormats.length
					? (settings.meshyTargetFormats as string[])
					: ['glb'],
			relationKind,
			rootTaskId: rootTaskId || undefined,
			parentTaskId:
				family === 'retexture'
					? parentTaskId || manualPreviewTaskId || undefined
					: parentTaskId || undefined,
			capabilities: Array.isArray(settings.meshyCapabilities)
				? (settings.meshyCapabilities as string[])
				: undefined
		}

		if (family === 'retexture') {
			const linkedInputTaskId = String(linkedModelInput?.inputTaskId ?? '').trim()
			payload.preview_task_id = manualPreviewTaskId || linkedInputTaskId || ''
			payload.should_texture = true
			payload.texture_prompt = String(settings.meshyTexturePrompt ?? '').trim() || payload.prompt
		}

		if (family === 'text-to-3d' || family === 'refine' || family === 'retexture') {
			if (!payload.prompt) return { ok: false, error: '请先填写 Meshy 提示词。' }
			if (family === 'refine' && !payload.preview_task_id && !payload.model_url) {
				return { ok: false, error: 'Refine 阶段需要 Preview Task ID 或上游 3D 模型输入。' }
			}
			if (family === 'retexture' && !payload.preview_task_id && !payload.model_url) {
				return { ok: false, error: 'Retexture 阶段需要 Preview Task ID 或上游 3D 模型输入。' }
			}
		} else if (family === 'text-to-image') {
			if (!payload.prompt) return { ok: false, error: 'Text to Image 需要提示词。' }
			if (generateMultiView && !!aspectRatio) {
				return { ok: false, error: '开启多视图时，不能同时设置固定 aspect_ratio。' }
			}
		} else if (family === 'image-to-image') {
			if (!payload.prompt) return { ok: false, error: 'Image to Image 需要提示词。' }
			const refUrls = payload.reference_image_urls ?? []
			if (!refUrls.length) {
				return { ok: false, error: 'Image to Image 至少需要 1 张参考图。' }
			}
			if (refUrls.length > 5) {
				payload.reference_image_urls = refUrls.slice(0, 5)
			}
		} else if (mode === 'image-to-3d') {
			if (!payload.image_url) return { ok: false, error: 'Image to 3D 需要填写图片 URL。' }
		} else {
			const imgUrls = payload.image_urls ?? []
			if (!imgUrls.length) {
				return { ok: false, error: 'Multi-Image to 3D 至少需要一张图片 URL。' }
			}
		}

		return {
			ok: true,
			payload,
			promptText: String(payload.prompt ?? '').trim(),
			promptSource: linkedPrompt
				? 'linked'
				: String(settings.meshyPrompt ?? '').trim()
					? 'manual'
					: 'none',
			imageCount: imageUrls.length || (payload.image_url ? 1 : 0)
		}
	}

	return {
		buildMeshyRequestPayload
	}
}
