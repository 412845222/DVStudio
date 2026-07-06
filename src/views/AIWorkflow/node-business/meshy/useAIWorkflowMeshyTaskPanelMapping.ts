import type {
	MeshyTaskPanelDetail,
	MeshyTaskPanelItem
} from '../../../../ui/WorkFlow/MeshyTaskPanel.vue'
import { isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { MeshyCapability, MeshyRelationKind, MeshyTaskStatus } from './types'
import { sanitizeMeshyPreviewUrl } from './useAIWorkflowMeshyAssets'

const formatMeshyDetailTime = (raw: unknown) => {
	const text = String(raw ?? '').trim()
	if (!text) return ''
	const parsed = Date.parse(text)
	if (!Number.isFinite(parsed)) return text
	const d = new Date(parsed)
	const yyyy = d.getFullYear()
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const dd = String(d.getDate()).padStart(2, '0')
	const hh = String(d.getHours()).padStart(2, '0')
	const mi = String(d.getMinutes()).padStart(2, '0')
	const ss = String(d.getSeconds()).padStart(2, '0')
	return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

const normalizeMeshyRelationKind = (value: unknown): MeshyRelationKind => {
	const text = String(value ?? '').trim()
	if (text === 'texture' || text === 'rigging' || text === 'animation' || text === 'remesh')
		return text
	return 'model'
}

const normalizeMeshyTaskStatus = (value: unknown): MeshyTaskStatus => {
	const text = String(value ?? '').trim()
	if (
		text === 'pending' ||
		text === 'running' ||
		text === 'succeeded' ||
		text === 'failed' ||
		text === 'canceled'
	)
		return text
	return 'idle'
}

export const useAIWorkflowMeshyTaskPanelMapping = (options: {
	getMeshyDisplayThumbnailUrl: (settings: Record<string, unknown> | null | undefined) => string
	pickMeshyEffectiveOutput: (item: Record<string, unknown>) => {
		preferredImageUrl: string
		preferredModelUrl: string
		preferredUrl: string
		imageUrls: string[]
		localAssetUrl: string
		localAssetPath: string
		thumbnailUrl: string
		effectiveTaskId: string
		effectiveRelationKind: MeshyRelationKind
		effectiveStatus: MeshyTaskStatus
		effectiveProgress: number
	}
	isRemoteLoaded: () => boolean
}) => {
	const familyLabelForMeshy = (family: string) => {
		const value = String(family || '').trim()
		if (value === 'text-to-3d') return 'Text to 3D'
		if (value === 'image-to-3d') return 'Image to 3D'
		if (value === 'multi-image-to-3d') return 'Multi-Image to 3D'
		if (value === 'refine') return 'Refine'
		if (value === 'retexture') return 'Retexture'
		if (value === 'remesh') return 'Remesh'
		if (value === 'text-to-image') return 'Text to Image'
		if (value === 'image-to-image') return 'Image to Image'
		return value || t('tasks.meshy.unnamedTask')
	}

	const statusLabelForMeshy = (status: string) => {
		const value = String(status || '').trim()
		if (value === 'running') return t('tasks.meshy.statusRunning')
		if (value === 'pending') return t('tasks.meshy.statusPending')
		if (value === 'succeeded') return t('tasks.meshy.statusSucceeded')
		if (value === 'failed') return t('tasks.meshy.statusFailed')
		if (value === 'canceled') return t('tasks.meshy.statusCanceled')
		return t('tasks.meshy.statusIdle')
	}

	/**
	 * 从 settings 中读取值，优先使用 meshy 前缀 key（远程 payload），
	 * 回退到原始 key（本地节点 settings）。
	 */
	const getSettingsValue = (
		settings: Record<string, unknown>,
		prefixedKey: string,
		plainKey: string
	): string => {
		const prefixed = String(settings[prefixedKey] ?? '').trim()
		if (prefixed) return prefixed
		return String(settings[plainKey] ?? '').trim()
	}

	const getSettingsNumber = (
		settings: Record<string, unknown>,
		prefixedKey: string,
		plainKey: string,
		fallback = 0
	): number => {
		const prefixed = settings[prefixedKey]
		if (typeof prefixed === 'number' || typeof prefixed === 'string') {
			const parsed = Number(prefixed)
			if (Number.isFinite(parsed)) return parsed
		}
		const plain = settings[plainKey]
		if (typeof plain === 'number' || typeof plain === 'string') {
			const parsed = Number(plain)
			if (Number.isFinite(parsed)) return parsed
		}
		return fallback
	}

	const mapMeshyPanelItemToDetail = (item: MeshyTaskPanelItem): MeshyTaskPanelDetail => {
		const settings =
			item.payload?.meshySettings && typeof item.payload.meshySettings === 'object'
				? (item.payload.meshySettings as Record<string, unknown>)
				: {}

		// 从 settings 中读取 outputSummary 和 relationSummary（兼容两种 key 格式）
		const outputSummary = (settings.meshyOutputSummary ?? settings.outputSummary ?? {}) as Record<
			string,
			unknown
		>
		const relationSummary = (settings.meshyRelationSummary ?? settings.relationSummary ?? {}) as Record<
			string,
			unknown
		>
		const inputSummary = (settings.meshyInputSummary ?? {}) as Record<string, unknown>
		const submittedParams = (settings.submittedParams ?? {}) as Record<string, unknown>
		const requestBody = (settings._requestBody ?? {}) as Record<string, unknown>

		// imageCount: 优先从 meshyInputSummary 读取，其次从 submittedParams，再从 settings 的 outputImageCount / imageCount
		const imageCount =
			Number(inputSummary.imageCount ?? submittedParams.referenceImageCount ?? 0) > 0
				? Number(inputSummary.imageCount ?? submittedParams.referenceImageCount ?? 0)
				: getSettingsNumber(settings, 'meshyOutputImageCount', 'outputImageCount') > 0
					? getSettingsNumber(settings, 'meshyOutputImageCount', 'outputImageCount')
					: getSettingsNumber(settings, 'meshyImageCount', 'imageCount')

		const resolvedTargetLabel = item.target === 'image' ? t('tasks.meshy.imageChain') : t('tasks.meshy.model3dChain')
		const resolvedSourceLabel = options.isRemoteLoaded() ? t('tasks.meshy.backendMirrorList') : t('tasks.meshy.localNodeState')

		// 从 submittedParams 或 requestBody 中提取提交参数
		const aiModel = String(
			submittedParams.model ?? requestBody.ai_model ?? settings.meshyAiModel ?? settings.aiModel ?? ''
		).trim()
		const aspectRatio = String(
			submittedParams.aspectRatio ?? requestBody.aspect_ratio ?? settings.meshyAspectRatio ?? settings.aspectRatio ?? ''
		).trim()
		const outputCount = Number(
			submittedParams.outputCount ?? requestBody.output_image_count ?? settings.meshyOutputImageCount ?? settings.outputImageCount ?? 1
		)
		const poseMode = String(
			submittedParams.poseMode ?? requestBody.pose_mode ?? settings.meshyPoseMode ?? settings.poseMode ?? ''
		).trim()
		const generateMultiView = Boolean(
			submittedParams.generateMultiView ?? requestBody.generate_multi_view ?? settings.meshyGenerateMultiView ?? settings.generateMultiView
		)
		const seed = submittedParams.seed ?? requestBody.seed ?? settings.meshySeed ?? settings.seed
		const submittedAt = String(submittedParams.submittedAt ?? settings.submittedAt ?? '').trim()
		return {
			id: item.id,
			title: item.title,
			taskId: item.taskId,
			nodeId: item.nodeId || String(item.payload?.nodeId ?? '').trim() || undefined,
			targetLabel: resolvedTargetLabel,
			familyLabel: item.familyLabel,
			status: item.status,
			statusLabel: item.statusLabel,
			progress: item.progress,
			prompt: item.promptPreview,
			negativePrompt: getSettingsValue(settings, 'meshyNegativePrompt', 'negativePrompt') || String(submittedParams.negativePrompt ?? requestBody.negative_prompt ?? '').trim() || undefined,
			statusText: getSettingsValue(settings, 'meshyStatusText', 'statusText') || undefined,
			errorMessage: getSettingsValue(settings, 'meshyErrorMessage', 'errorMessage') || undefined,
			preferredModelUrl:
				String(
					relationSummary.effectivePreferredImageUrl ??
						relationSummary.effectivePreferredModelUrl ??
						outputSummary.preferredUrl ??
						''
				).trim() || undefined,
			assetUrl:
				String(
					settings.meshyOutputAssetUrl ??
						settings.outputAssetUrl ??
						outputSummary.assetUrl ??
						''
				).trim() || undefined,
			assetPath:
				String(
					settings.meshyOutputAssetPath ??
						settings.outputAssetPath ??
						outputSummary.assetPath ??
						''
				).trim() || undefined,
			thumbnailUrl: options.getMeshyDisplayThumbnailUrl(settings) || undefined,
			imageCount,
			createdAtLabel: formatMeshyDetailTime(submittedAt || item.createdAt),
			updatedAtLabel: formatMeshyDetailTime(item.createdAt),
			sourceLabel: resolvedSourceLabel,
			requestPayload: {
				...(Object.keys(submittedParams).length > 0 ? { submittedParams } : {}),
				...(Object.keys(requestBody).length > 0 ? { _actualRequestBody: requestBody } : {})
			},
			responsePayload: undefined,
			// 额外的提交参数字段，用于在UI中显示
			...(aiModel ? { aiModel } : {}),
			...(aspectRatio || generateMultiView ? { aspectRatio: generateMultiView ? '1:1 (Multi-View)' : aspectRatio } : {}),
			...(outputCount ? { outputCount } : {}),
			...(poseMode ? { poseMode } : {}),
			...(generateMultiView ? { generateMultiView: true } : {}),
			...(seed != null && seed !== 'Random' ? { seed } : {})
		} as MeshyTaskPanelDetail & {
			aiModel?: string
			aspectRatio?: string
			outputCount?: number
			poseMode?: string
			generateMultiView?: boolean
			seed?: number | string
		}
	}

	const mapMeshyMirrorItemToDetail = (
		item: Record<string, unknown>,
		sourceLabel = t('tasks.meshy.backendMirrorDetail')
	): MeshyTaskPanelDetail => {
		const target = String(item.target ?? '3d').trim() === 'image' ? 'image' : '3d'
		const family = String(
			item.family ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
		).trim()
		const status = String(item.status ?? 'idle').trim()
		const requestPayload = isRecord(item.requestPayload) ? item.requestPayload : {}
		const resolvedTargetLabel = target === 'image' ? t('tasks.meshy.imageChain') : t('tasks.meshy.model3dChain')

		// 从 requestPayload 中提取提交参数
		const actualRequestBody = isRecord(requestPayload._requestBody) ? requestPayload._requestBody : requestPayload
		const submittedParams = isRecord(requestPayload.submittedParams) ? requestPayload.submittedParams : {}
		const aiModel = String(
			submittedParams.model ?? actualRequestBody.ai_model ?? ''
		).trim()
		const aspectRatio = String(
			submittedParams.aspectRatio ?? actualRequestBody.aspect_ratio ?? ''
		).trim()
		const outputCount = Number(
			submittedParams.outputCount ?? actualRequestBody.output_image_count ?? 0
		)
		const poseMode = String(
			submittedParams.poseMode ?? actualRequestBody.pose_mode ?? ''
		).trim()
		const generateMultiView = Boolean(
			submittedParams.generateMultiView ?? actualRequestBody.generate_multi_view
		)
		const seed = submittedParams.seed ?? actualRequestBody.seed
		const negativePrompt = String(
			submittedParams.negativePrompt ?? actualRequestBody.negative_prompt ?? item.negativePrompt ?? ''
		).trim()
		const imageCount = Number(item.imageCount ?? submittedParams.referenceImageCount ?? 0)
		return {
			id: `detail:${String(item.taskId ?? item.id ?? '')}`,
			title:
				String(
					requestPayload.title ?? requestPayload.alias ?? familyLabelForMeshy(family)
				).trim() || familyLabelForMeshy(family),
			taskId: String(item.taskId ?? '').trim() || undefined,
			nodeId: String(item.lastNodeId ?? '').trim() || undefined,
			targetLabel: resolvedTargetLabel,
			familyLabel: familyLabelForMeshy(family),
			status,
			statusLabel: statusLabelForMeshy(status),
			progress: Math.max(0, Math.min(100, Number(item.progress ?? 0))),
			prompt: String(item.prompt ?? '').trim() || undefined,
			negativePrompt: negativePrompt || undefined,
			statusText: String(item.statusText ?? '').trim() || undefined,
			errorMessage: String(item.errorMessage ?? '').trim() || undefined,
			preferredModelUrl:
				String(
					item.effectivePreferredImageUrl ??
						item.effectivePreferredModelUrl ??
						item.preferredModelUrl ??
						''
				).trim() || undefined,
			assetUrl: String(item.effectiveLocalAssetUrl ?? item.localAssetUrl ?? '').trim() || undefined,
			assetPath:
				String(item.effectiveLocalAssetPath ?? item.localAssetPath ?? '').trim() || undefined,
			thumbnailUrl:
				sanitizeMeshyPreviewUrl(
					String(item.effectiveThumbnailUrl ?? item.thumbnailUrl ?? '').trim()
				) || undefined,
			imageCount: Math.max(0, imageCount),
			createdAtLabel: formatMeshyDetailTime(item.remoteCreatedAt ?? item.createdAt),
			updatedAtLabel: formatMeshyDetailTime(item.updatedAt ?? item.remoteFinishedAt),
			sourceLabel,
			requestPayload: isRecord(item.requestPayload) ? item.requestPayload : undefined,
			responsePayload: isRecord(item.responsePayload) ? item.responsePayload : undefined,
			// 额外的提交参数字段，用于在UI中显示
			...(aiModel ? { aiModel } : {}),
			...(aspectRatio || generateMultiView ? { aspectRatio: generateMultiView ? '1:1 (Multi-View)' : aspectRatio } : {}),
			...(outputCount ? { outputCount } : {}),
			...(poseMode ? { poseMode } : {}),
			...(generateMultiView ? { generateMultiView: true } : {}),
			...(seed != null && seed !== 'Random' ? { seed } : {})
		} as MeshyTaskPanelDetail & {
			aiModel?: string
			aspectRatio?: string
			outputCount?: number
			poseMode?: string
			generateMultiView?: boolean
			seed?: number | string
		}
	}

	const buildMeshyTaskPanelPayload = (
		item: Record<string, unknown>,
		target: '3d' | 'image',
		family: string,
		title: string,
		prompt: string,
		createdAt: number
	) => {
		const requestPayload = isRecord(item.requestPayload) ? item.requestPayload : {}
		const responsePayload = isRecord(item.responsePayload) ? item.responsePayload : {}
		const effective = options.pickMeshyEffectiveOutput(item)
		const capabilities = Array.isArray(item.capabilities)
			? (item.capabilities as MeshyCapability[])
			: undefined
		return {
			source: 'meshy-task-panel',
			nodeId: String(item.lastNodeId ?? '').trim() || undefined,
			taskId: effective.effectiveTaskId || String(item.taskId ?? '').trim() || undefined,
			title,
			alias: String(requestPayload.alias ?? '').trim() || undefined,
			meshySettings: {
				meshyTaskId: effective.effectiveTaskId || String(item.taskId ?? '').trim() || undefined,
				meshyTaskTarget: target,
				meshyTaskFamily: family,
				meshyRelationKind: effective.effectiveRelationKind,
				meshyRootTaskId: String(item.rootTaskId ?? item.taskId ?? '').trim() || undefined,
				meshyParentTaskId: String(item.parentTaskId ?? '').trim() || undefined,
				meshyCapabilities: capabilities,
				meshyTaskStatus: effective.effectiveStatus,
				meshyProgress: effective.effectiveProgress,
				meshyPrompt: prompt || undefined,
				meshyNegativePrompt: String(item.negativePrompt ?? '').trim() || undefined,
				meshyThumbnailUrl: effective.thumbnailUrl || undefined,
				meshyStatusText: String(item.statusText ?? '').trim() || undefined,
				meshyErrorMessage: String(item.errorMessage ?? '').trim() || undefined,
				meshyOutputAssetUrl: effective.localAssetUrl || undefined,
				meshyOutputAssetPath: effective.localAssetPath || undefined,
				meshyOutputSummary: {
					outputKind: target === 'image' ? 'image' : '3d-model',
					preferredUrl: effective.preferredUrl || undefined,
					imageUrls:
						target === 'image'
							? effective.imageUrls.length
								? effective.imageUrls.slice(0, 4)
								: effective.preferredUrl
									? [effective.preferredUrl]
									: undefined
							: undefined,
					assetUrl: effective.localAssetUrl || undefined,
					assetPath: effective.localAssetPath || undefined,
					thumbnailUrl: effective.thumbnailUrl || undefined,
					format:
						target === 'image'
							? undefined
							: effective.preferredModelUrl
								? String(effective.preferredModelUrl.split('.').pop() || '')
										.trim()
										.toLowerCase() || undefined
								: undefined
				},
				meshyInputSummary: {
					promptSource: prompt ? 'manual' : 'none',
					promptText: prompt || undefined,
					imageCount: Math.max(0, Number(item.imageCount ?? 0)),
					modelInputConnected: false,
					lastValidatedAt: createdAt
				},
				meshyModelUrls: isRecord(responsePayload.model_urls)
					? responsePayload.model_urls
					: undefined,
				meshyImageUrl: String(requestPayload.image_url ?? '').trim() || undefined,
				meshyImageUrls: Array.isArray(requestPayload.image_urls)
					? (requestPayload.image_urls as string[])
					: undefined,
				meshyPreviewTaskId: String(requestPayload.preview_task_id ?? '').trim() || undefined,
				meshySourceModelUrl:
					String(item.sourceImageUrl ?? item.sourceModelUrl ?? '').trim() || undefined,
				meshyRelationSummary: {
					relationKind: normalizeMeshyRelationKind(item.relationKind),
					rootTaskId: String(item.rootTaskId ?? item.taskId ?? '').trim() || undefined,
					parentTaskId: String(item.parentTaskId ?? '').trim() || undefined,
					capabilities,
					hasTextureChild: item.hasTextureChild === true,
					hasRiggingChild: item.hasRiggingChild === true,
					hasAnimationChild: item.hasAnimationChild === true,
					effectiveTaskId: effective.effectiveTaskId || undefined,
					effectiveRelationKind: effective.effectiveRelationKind,
					effectiveStatus: effective.effectiveStatus,
					effectiveProgress: effective.effectiveProgress,
					effectivePreferredModelUrl: effective.preferredModelUrl || undefined,
					effectivePreferredImageUrl: effective.preferredImageUrl || undefined,
					effectiveLocalAssetUrl: effective.localAssetUrl || undefined,
					effectiveLocalAssetPath: effective.localAssetPath || undefined,
					effectiveThumbnailUrl: effective.thumbnailUrl || undefined
				}
			}
		}
	}

	const mapMeshyRemoteTaskToPanelItem = (item: Record<string, unknown>): MeshyTaskPanelItem => {
		const target = String(item.target ?? '3d').trim() === 'image' ? 'image' : '3d'
		const family = String(
			item.family ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
		).trim()
		const status = normalizeMeshyTaskStatus(item.status ?? 'idle')
		const prompt = String(item.prompt ?? '').trim()
		const taskId = String(item.taskId ?? '').trim()
		const effective = options.pickMeshyEffectiveOutput(item)
		const createdAt =
			Date.parse(String(item.remoteCreatedAt ?? item.createdAt ?? '')) ||
			Date.parse(String(item.updatedAt ?? '')) ||
			Date.now()
		const requestPayload = isRecord(item.requestPayload) ? item.requestPayload : {}
		const title =
			String(requestPayload.title ?? requestPayload.alias ?? familyLabelForMeshy(family)).trim() ||
			familyLabelForMeshy(family)

		// 从 requestPayload 中提取提交参数用于 metaText 显示
		const actualRequestBody = isRecord(requestPayload._requestBody) ? requestPayload._requestBody : requestPayload
		const submittedParams = isRecord(requestPayload.submittedParams) ? requestPayload.submittedParams : {}
		const aiModel = String(
			submittedParams.model ?? actualRequestBody.ai_model ?? ''
		).trim()
		const aspectRatio = String(
			submittedParams.aspectRatio ?? actualRequestBody.aspect_ratio ?? ''
		).trim()
		const outputCount = Number(
			submittedParams.outputCount ?? actualRequestBody.output_image_count ?? 0
		)
		const generateMultiView = Boolean(
			submittedParams.generateMultiView ?? actualRequestBody.generate_multi_view
		)
		const imageCount = Number(item.imageCount ?? submittedParams.referenceImageCount ?? 0)

		// 构建 metaText，显示关键参数
		const metaParts: string[] = []
		if (target === 'image') metaParts.push(t('tasks.meshy.imageChain'))
		else metaParts.push(t('tasks.meshy.model3dChain'))
		if (aiModel) metaParts.push(aiModel)
		if (generateMultiView) {
			metaParts.push(t('tasks.meshy.multiView'))
		} else if (aspectRatio) {
			metaParts.push(aspectRatio)
		}
		if (outputCount > 1) metaParts.push(t('tasks.meshy.outputCountN', { count: String(outputCount) }))
		if (imageCount > 0) metaParts.push(t('tasks.meshy.referenceImagesCount', { count: String(imageCount) }))
		const statusMsg = String(item.statusText ?? item.errorMessage ?? '').trim() || t('tasks.meshy.syncedToLocalMirror')
		metaParts.push(statusMsg)

		const children = Array.isArray(item.children)
			? item.children.map((child) =>
					mapMeshyRemoteTaskToPanelItem(child as Record<string, unknown>)
				)
			: []
		return {
			id: `remote:${taskId || String(item.id ?? createdAt)}`,
			nodeId: String(item.lastNodeId ?? '').trim(),
			title,
			taskId: taskId || undefined,
			target,
			family,
			familyLabel: familyLabelForMeshy(family),
			status: status as MeshyTaskPanelItem['status'],
			statusLabel: statusLabelForMeshy(status),
			progress: Math.max(0, Math.min(100, Number(item.progress ?? 0))),
			promptPreview: prompt || t('tasks.meshy.promptNotFilled'),
			metaText: metaParts.join(' · '),
			relationKind: normalizeMeshyRelationKind(item.relationKind),
			rootTaskId: String(item.rootTaskId ?? item.taskId ?? '').trim() || undefined,
			parentTaskId: String(item.parentTaskId ?? '').trim() || undefined,
			capabilities: Array.isArray(item.capabilities)
				? (item.capabilities as MeshyCapability[])
				: undefined,
			thumbnailUrl: sanitizeMeshyPreviewUrl(effective.thumbnailUrl) || undefined,
			hasTextureChild: item.hasTextureChild === true,
			hasRiggingChild: item.hasRiggingChild === true,
			hasAnimationChild: item.hasAnimationChild === true,
			effectiveTaskId: effective.effectiveTaskId || undefined,
			effectiveRelationKind: effective.effectiveRelationKind,
			effectivePreferredModelUrl: effective.preferredUrl || undefined,
			effectiveThumbnailUrl: sanitizeMeshyPreviewUrl(effective.thumbnailUrl) || undefined,
			children,
			createdAt,
			payload: buildMeshyTaskPanelPayload(item, target, family, title, prompt, createdAt)
		}
	}

	const findMeshyTaskPanelItemById = (
		list: MeshyTaskPanelItem[],
		id: string
	): MeshyTaskPanelItem | null => {
		for (const entry of list) {
			if (entry.id === id) return entry
			if (Array.isArray(entry.children) && entry.children.length) {
				const matched = findMeshyTaskPanelItemById(entry.children, id)
				if (matched) return matched
			}
		}
		return null
	}

	return {
		familyLabelForMeshy,
		statusLabelForMeshy,
		mapMeshyPanelItemToDetail,
		mapMeshyMirrorItemToDetail,
		mapMeshyRemoteTaskToPanelItem,
		findMeshyTaskPanelItemById
	}
}
