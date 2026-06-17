import type { WorkflowMeshyNodeSettings } from '../../../../aiworkflow/types'

const normalizeText = (value: unknown) => String(value ?? '').trim()

export const isMeshyRemoteUrl = (value: unknown) => {
	const text = normalizeText(value)
	if (!text) return false
	try {
		const url = new URL(text)
		return /(^|\.)meshy\.ai$/i.test(url.hostname)
	} catch {
		return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(text)
	}
}

export const sanitizeMeshyPreviewUrl = (value: unknown) => {
	const text = normalizeText(value)
	if (!text) return ''
	if (isMeshyRemoteUrl(text)) return ''
	if (/^(blob:|data:|file:)/i.test(text)) return text
	if (text.startsWith('/')) return text
	try {
		const url = new URL(text)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
		const host = String(url.hostname || '').toLowerCase()
		if (host === 'localhost' || host === '127.0.0.1') return text
		if (typeof window !== 'undefined' && host === String(window.location.hostname || '').toLowerCase()) return text
		return ''
	} catch {
		return ''
	}
}

export const getMeshyTaskTarget = (value: Record<string, any> | WorkflowMeshyNodeSettings | null | undefined) => {
	return normalizeText((value as any)?.meshyTaskTarget ?? (value as any)?.target) === 'image' ? 'image' : '3d'
}

export const pickMeshyPreferredFormat = (urls: Record<string, string> | null | undefined): 'glb' | 'gltf' => {
	const record = urls && typeof urls === 'object' ? urls : {}
	const glb = normalizeText((record as any)?.glb ?? (record as any)?.pre_remeshed_glb)
	if (glb) return 'glb'
	return 'gltf'
}

export const pickMeshyPreferredModelUrl = (urls: Record<string, string> | null | undefined) => {
	const record = urls && typeof urls === 'object' ? urls : {}
	const keys = ['glb', 'pre_remeshed_glb', 'fbx', 'obj', 'stl', 'usdz'] as const
	for (const key of keys) {
		const url = normalizeText((record as any)?.[key])
		if (url) return url
	}
	return ''
}

export const pickMeshyPreferredImageUrl = (urls: string[] | null | undefined) => {
	const list = Array.isArray(urls) ? urls : []
	for (const raw of list) {
		const value = normalizeText(raw)
		if (value) return value
	}
	return ''
}

export const getMeshyDisplayThumbnailUrl = (settings: WorkflowMeshyNodeSettings | Record<string, any> | null | undefined) => {
	const value = settings && typeof settings === 'object' ? settings : {}
	const relationSummary = value.meshyRelationSummary && typeof value.meshyRelationSummary === 'object' ? value.meshyRelationSummary : {}
	const outputSummary = value.meshyOutputSummary && typeof value.meshyOutputSummary === 'object' ? value.meshyOutputSummary : {}
	const target = getMeshyTaskTarget(value)
	const localAssetUrl = normalizeText(
		relationSummary.effectiveLocalAssetUrl ?? value.meshyOutputAssetUrl ?? outputSummary.assetUrl,
	)
	const has3DModelOutput = target === '3d' && !!normalizeText(
		relationSummary.effectivePreferredModelUrl ?? outputSummary.preferredUrl ?? localAssetUrl,
	)
	const thumbnailUrl = normalizeText(
		relationSummary.effectiveThumbnailUrl ?? outputSummary.thumbnailUrl ?? value.meshyThumbnailUrl,
	)

	if (target === 'image') {
		const localPreviewUrl = sanitizeMeshyPreviewUrl(localAssetUrl)
		if (localPreviewUrl) return localPreviewUrl
	}

	if (has3DModelOutput) {
		return ''
	}

	return sanitizeMeshyPreviewUrl(thumbnailUrl)
}

export const buildMeshyNodePresentationSettings = (settings: WorkflowMeshyNodeSettings | null | undefined) => {
	if (!settings) return null
	const safeThumbnailUrl = getMeshyDisplayThumbnailUrl(settings)
	return {
		...settings,
		meshyThumbnailUrl: safeThumbnailUrl || undefined,
		meshyOutputSummary: settings.meshyOutputSummary
			? {
				...settings.meshyOutputSummary,
				thumbnailUrl: safeThumbnailUrl || undefined,
			}
			: settings.meshyOutputSummary,
		meshyRelationSummary: settings.meshyRelationSummary
			? {
				...settings.meshyRelationSummary,
				effectiveThumbnailUrl: safeThumbnailUrl || undefined,
			}
			: settings.meshyRelationSummary,
	}
}

export const getMeshyEffectiveModelSource = (settings: WorkflowMeshyNodeSettings | Record<string, any> | null | undefined) => {
	const value = settings && typeof settings === 'object' ? settings : {}
	const relationSummary = value.meshyRelationSummary && typeof value.meshyRelationSummary === 'object' ? value.meshyRelationSummary : {}
	const outputSummary = value.meshyOutputSummary && typeof value.meshyOutputSummary === 'object' ? value.meshyOutputSummary : {}
	const modelUrls = value.meshyModelUrls && typeof value.meshyModelUrls === 'object' ? value.meshyModelUrls : {}
	const assetUrl = normalizeText(
		relationSummary.effectiveLocalAssetUrl ?? value.meshyOutputAssetUrl ?? outputSummary.assetUrl,
	)
	const assetPath = normalizeText(
		relationSummary.effectiveLocalAssetPath ?? value.meshyOutputAssetPath ?? outputSummary.assetPath,
	)
	const preferredUrl =
		normalizeText(relationSummary.effectivePreferredModelUrl ?? outputSummary.preferredUrl) ||
		assetUrl ||
		pickMeshyPreferredModelUrl(modelUrls)
	const format = normalizeText(outputSummary.format).toLowerCase() === 'gltf' ? 'gltf' : pickMeshyPreferredFormat(modelUrls)
	return {
		preferredUrl,
		assetUrl,
		assetPath,
		format,
	}
}

export const getMeshyEffectiveImageSource = (settings: WorkflowMeshyNodeSettings | Record<string, any> | null | undefined) => {
	const value = settings && typeof settings === 'object' ? settings : {}
	const relationSummary = value.meshyRelationSummary && typeof value.meshyRelationSummary === 'object' ? value.meshyRelationSummary : {}
	const outputSummary = value.meshyOutputSummary && typeof value.meshyOutputSummary === 'object' ? value.meshyOutputSummary : {}
	const summaryImageUrls = Array.isArray(outputSummary.imageUrls)
		? outputSummary.imageUrls.map((x: any) => normalizeText(x)).filter(Boolean)
		: []
	const preferredUrl =
		normalizeText(
			relationSummary.effectivePreferredImageUrl ??
			relationSummary.effectivePreferredModelUrl ??
			outputSummary.preferredUrl,
		) || pickMeshyPreferredImageUrl(summaryImageUrls)
	const assetUrl =
		normalizeText(
			relationSummary.effectiveLocalAssetUrl ?? value.meshyOutputAssetUrl ?? outputSummary.assetUrl,
		) || preferredUrl
	const assetPath = normalizeText(
		relationSummary.effectiveLocalAssetPath ?? value.meshyOutputAssetPath ?? outputSummary.assetPath,
	)
	const imageUrls = summaryImageUrls.length ? summaryImageUrls : preferredUrl ? [preferredUrl] : []
	return {
		preferredUrl,
		assetUrl,
		assetPath,
		imageUrls,
	}
}

export const pickMeshyEffectiveOutput = (item: Record<string, any>) => {
	const target = getMeshyTaskTarget(item)
	const preferredImageUrl = normalizeText(item.effectivePreferredImageUrl ?? item.preferredImageUrl)
	const preferredModelUrl = normalizeText(item.effectivePreferredModelUrl ?? item.preferredModelUrl ?? item.localAssetUrl)
	const preferredUrl = preferredImageUrl || preferredModelUrl
	const imageUrls = Array.isArray(item.imageUrls)
		? item.imageUrls.map((x: any) => normalizeText(x)).filter(Boolean)
		: []
	const localAssetUrl = normalizeText(item.effectiveLocalAssetUrl ?? item.localAssetUrl)
	const localAssetPath = normalizeText(item.effectiveLocalAssetPath ?? item.localAssetPath)
	const thumbnailUrl =
		target === 'image'
			? sanitizeMeshyPreviewUrl(localAssetUrl) || sanitizeMeshyPreviewUrl(item.effectiveThumbnailUrl ?? item.thumbnailUrl)
			: sanitizeMeshyPreviewUrl(item.effectiveThumbnailUrl ?? item.thumbnailUrl)
	const effectiveTaskId = normalizeText(item.effectiveTaskId ?? item.taskId)
	const effectiveRelationKind = normalizeText(item.effectiveRelationKind ?? item.relationKind)
	const effectiveStatus = normalizeText(item.effectiveStatus ?? item.status ?? 'idle')
	const effectiveProgress = Math.max(0, Math.min(100, Number(item.effectiveProgress ?? item.progress ?? 0)))
	return {
		preferredImageUrl,
		preferredModelUrl,
		preferredUrl,
		imageUrls,
		localAssetUrl,
		localAssetPath,
		thumbnailUrl,
		effectiveTaskId,
		effectiveRelationKind,
		effectiveStatus,
		effectiveProgress,
	}
}
