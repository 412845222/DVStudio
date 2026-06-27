import type {
	MeshyTaskPanelDetail,
	MeshyTaskPanelItem
} from '../../../../ui/WorkFlow/MeshyTaskPanel.vue'
import { isRecord } from '../../../../types/utils'
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
		return value || '未命名任务'
	}

	const statusLabelForMeshy = (status: string) => {
		const value = String(status || '').trim()
		if (value === 'running') return '执行中'
		if (value === 'pending') return '排队中'
		if (value === 'succeeded') return '已完成'
		if (value === 'failed') return '失败'
		if (value === 'canceled') return '已取消'
		return '未启动'
	}

	const mapMeshyPanelItemToDetail = (item: MeshyTaskPanelItem): MeshyTaskPanelDetail => {
		const settings =
			item.payload?.meshySettings && typeof item.payload.meshySettings === 'object'
				? (item.payload.meshySettings as Record<string, unknown>)
				: {}
		const targetLabel = item.target === 'image' ? '图像链路' : '3D链路'
		return {
			id: item.id,
			title: item.title,
			taskId: item.taskId,
			nodeId: item.nodeId || String(item.payload?.nodeId ?? '').trim() || undefined,
			targetLabel,
			familyLabel: item.familyLabel,
			status: item.status,
			statusLabel: item.statusLabel,
			progress: item.progress,
			prompt: item.promptPreview,
			negativePrompt: String(settings.meshyNegativePrompt ?? '').trim() || undefined,
			statusText: String(settings.meshyStatusText ?? '').trim() || undefined,
			errorMessage: String(settings.meshyErrorMessage ?? '').trim() || undefined,
			preferredModelUrl:
				String(
					(settings.meshyRelationSummary as Record<string, unknown>)?.effectivePreferredImageUrl ??
						(settings.meshyOutputSummary as Record<string, unknown>)?.preferredUrl ??
						''
				).trim() || undefined,
			assetUrl:
				String(
					settings.meshyOutputAssetUrl ??
						(settings.meshyOutputSummary as Record<string, unknown>)?.assetUrl ??
						''
				).trim() || undefined,
			assetPath:
				String(
					settings.meshyOutputAssetPath ??
						(settings.meshyOutputSummary as Record<string, unknown>)?.assetPath ??
						''
				).trim() || undefined,
			thumbnailUrl: options.getMeshyDisplayThumbnailUrl(settings) || undefined,
			imageCount: Number((settings.meshyInputSummary as Record<string, unknown>)?.imageCount ?? 0),
			createdAtLabel: formatMeshyDetailTime(item.createdAt),
			updatedAtLabel: formatMeshyDetailTime(item.createdAt),
			sourceLabel: options.isRemoteLoaded() ? '后端镜像列表' : '本地节点状态',
			requestPayload: undefined,
			responsePayload: undefined
		}
	}

	const mapMeshyMirrorItemToDetail = (
		item: Record<string, unknown>,
		sourceLabel = '后端镜像详情'
	): MeshyTaskPanelDetail => {
		const target = String(item.target ?? '3d').trim() === 'image' ? 'image' : '3d'
		const family = String(
			item.family ?? (target === 'image' ? 'text-to-image' : 'text-to-3d')
		).trim()
		const status = String(item.status ?? 'idle').trim()
		const requestPayload = isRecord(item.requestPayload) ? item.requestPayload : {}
		return {
			id: `detail:${String(item.taskId ?? item.id ?? '')}`,
			title:
				String(
					requestPayload.title ?? requestPayload.alias ?? familyLabelForMeshy(family)
				).trim() || familyLabelForMeshy(family),
			taskId: String(item.taskId ?? '').trim() || undefined,
			nodeId: String(item.lastNodeId ?? '').trim() || undefined,
			targetLabel: target === 'image' ? '图像链路' : '3D链路',
			familyLabel: familyLabelForMeshy(family),
			status,
			statusLabel: statusLabelForMeshy(status),
			progress: Math.max(0, Math.min(100, Number(item.progress ?? 0))),
			prompt: String(item.prompt ?? '').trim() || undefined,
			negativePrompt: String(item.negativePrompt ?? '').trim() || undefined,
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
			imageCount: Math.max(0, Number(item.imageCount ?? 0)),
			createdAtLabel: formatMeshyDetailTime(item.remoteCreatedAt ?? item.createdAt),
			updatedAtLabel: formatMeshyDetailTime(item.updatedAt ?? item.remoteFinishedAt),
			sourceLabel,
			requestPayload: isRecord(item.requestPayload) ? item.requestPayload : undefined,
			responsePayload: isRecord(item.responsePayload) ? item.responsePayload : undefined
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
			promptPreview: prompt || '未填写提示词',
			metaText: `${target === 'image' ? '图像链路' : '3D链路'} · ${Number(item.imageCount ?? 0)} 张图片输入 · ${String(item.statusText ?? item.errorMessage ?? '').trim() || '已同步到本地镜像'}`,
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
