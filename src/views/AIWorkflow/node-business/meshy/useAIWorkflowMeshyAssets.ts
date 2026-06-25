import type { WorkflowMeshyNodeSettings } from '../../../../aiworkflow/types'
import { isRecord } from '../../../../types/utils'
import type { MeshyEffectiveOutput, MeshyRelationKind, MeshyTaskStatus } from './types'

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

export const getMeshyTaskTarget = (value: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
	const record = isRecord(value) ? value : {}
	const meshyTaskTarget = normalizeText(record.meshyTaskTarget ?? record.target)
	return meshyTaskTarget === 'image' ? 'image' : '3d'
}

export const pickMeshyPreferredFormat = (urls: Record<string, unknown> | null | undefined): 'glb' | 'gltf' => {
	const record = isRecord(urls) ? urls : {}
	const glb = normalizeText(record.glb ?? record.pre_remeshed_glb)
	if (glb) return 'glb'
	return 'gltf'
}

export const pickMeshyPreferredModelUrl = (urls: Record<string, unknown> | null | undefined) => {
	const record = isRecord(urls) ? urls : {}
	const keys = ['glb', 'pre_remeshed_glb', 'fbx', 'obj', 'stl', 'usdz'] as const
	for (const key of keys) {
		const url = normalizeText(record[key])
		if (url) return url
	}
	return ''
}

export const pickMeshyPreferredImageUrl = (urls: unknown[] | null | undefined) => {
	const list = Array.isArray(urls) ? urls : []
	for (const raw of list) {
		const value = normalizeText(raw)
		if (value) return value
	}
	return ''
}

export const getMeshyDisplayThumbnailUrl = (settings: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
	const value = isRecord(settings) ? settings : {}
	const relationSummary = isRecord(value.meshyRelationSummary) ? value.meshyRelationSummary : {}
	const outputSummary = isRecord(value.meshyOutputSummary) ? value.meshyOutputSummary : {}
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

export const getMeshyEffectiveModelSource = (settings: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
	const value = isRecord(settings) ? settings : {}
	const relationSummary = isRecord(value.meshyRelationSummary) ? value.meshyRelationSummary : {}
	const outputSummary = isRecord(value.meshyOutputSummary) ? value.meshyOutputSummary : {}
	const modelUrls = isRecord(value.meshyModelUrls) ? value.meshyModelUrls : {}
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

export const getMeshyEffectiveImageSource = (settings: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
	const value = isRecord(settings) ? settings : {}
	const relationSummary = isRecord(value.meshyRelationSummary) ? value.meshyRelationSummary : {}
	const outputSummary = isRecord(value.meshyOutputSummary) ? value.meshyOutputSummary : {}
	const summaryImageUrls = Array.isArray(outputSummary.imageUrls)
		? outputSummary.imageUrls.map((x: unknown) => normalizeText(x)).filter(Boolean)
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

const normalizeMeshyRelationKind = (value: unknown): MeshyRelationKind => {
	const text = normalizeText(value)
	if (text === 'texture' || text === 'rigging' || text === 'animation' || text === 'remesh') return text
	return 'model'
}

const normalizeMeshyTaskStatus = (value: unknown): MeshyTaskStatus => {
	const text = normalizeText(value)
	if (text === 'pending' || text === 'running' || text === 'succeeded' || text === 'failed' || text === 'canceled') return text
	return 'idle'
}

export const pickMeshyEffectiveOutput = (item: Record<string, unknown>): MeshyEffectiveOutput => {
	const target = getMeshyTaskTarget(item)
	const preferredImageUrl = normalizeText(item.effectivePreferredImageUrl ?? item.preferredImageUrl)
	const preferredModelUrl = normalizeText(item.effectivePreferredModelUrl ?? item.preferredModelUrl ?? item.localAssetUrl)
	const preferredUrl = preferredImageUrl || preferredModelUrl
	const imageUrls = Array.isArray(item.imageUrls)
		? item.imageUrls.map((x: unknown) => normalizeText(x)).filter(Boolean)
		: []
	const localAssetUrl = normalizeText(item.effectiveLocalAssetUrl ?? item.localAssetUrl)
	const localAssetPath = normalizeText(item.effectiveLocalAssetPath ?? item.localAssetPath)
	const thumbnailUrl =
		target === 'image'
			? sanitizeMeshyPreviewUrl(localAssetUrl) || sanitizeMeshyPreviewUrl(item.effectiveThumbnailUrl ?? item.thumbnailUrl)
			: sanitizeMeshyPreviewUrl(item.effectiveThumbnailUrl ?? item.thumbnailUrl)
	const effectiveTaskId = normalizeText(item.effectiveTaskId ?? item.taskId)
	const effectiveRelationKind = normalizeMeshyRelationKind(item.effectiveRelationKind ?? item.relationKind)
	const effectiveStatus = normalizeMeshyTaskStatus(item.effectiveStatus ?? item.status ?? 'idle')
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
