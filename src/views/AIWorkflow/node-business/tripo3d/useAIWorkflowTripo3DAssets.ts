import { isArray, isRecord } from '../../../../types/utils'
import type { Tripo3DEffectiveOutput, Tripo3DRelationKind, Tripo3DTaskStatus } from './types'
import { isTripo3DImageMode } from './types'

const normalizeText = (value: unknown) => String(value ?? '').trim()

const getSettingsValue = (
	settings: Record<string, unknown>,
	prefixedKey: string,
	plainKey: string
): string => {
	const prefixed = String(settings[prefixedKey] ?? '').trim()
	if (prefixed) return prefixed
	return String(settings[plainKey] ?? '').trim()
}

const getImageUrlsFromSettings = (settings: Record<string, unknown>): string[] => {
	const outputImages = settings.tripo3dOutputImages ?? settings.outputImages
	if (isArray(outputImages)) {
		const urls = outputImages.filter((u): u is string => typeof u === 'string' && !!u.trim())
		if (urls.length > 0) return urls.map(u => u.trim())
	}
	const outputSummary = isRecord(settings.tripo3dOutputSummary)
		? settings.tripo3dOutputSummary
		: isRecord(settings.outputSummary)
			? settings.outputSummary
			: {}
	const summaryImageUrls = outputSummary.imageUrls
	if (isArray(summaryImageUrls)) {
		const urls = summaryImageUrls.filter((u): u is string => typeof u === 'string' && !!u.trim())
		if (urls.length > 0) return urls.map(u => u.trim())
	}
	const singleImage = normalizeText(
		settings.tripo3dOutputImageUrl ??
		settings.outputImageUrl ??
		outputSummary.preferredUrl ??
		settings.imageUrl
	)
	return singleImage ? [singleImage] : []
}

export const isTripo3DRemoteUrl = (value: unknown) => {
	const text = normalizeText(value)
	if (!text) return false
	try {
		const url = new URL(text)
		return /(^|\.)tripo3d\.ai$/i.test(url.hostname) || /(^|\.)tripo3d\.com$/i.test(url.hostname)
	} catch {
		return /https?:\/\/[^\s]*(tripo3d\.ai|tripo3d\.com)(?:\/|$)/i.test(text)
	}
}

export const sanitizeTripo3DPreviewUrl = (value: unknown) => {
	const text = normalizeText(value)
	if (!text) return ''
	if (isTripo3DRemoteUrl(text)) return text
	if (/^(blob:|data:|file:)/i.test(text)) return text
	if (text.startsWith('/')) return text
	try {
		const url = new URL(text)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
		const host = String(url.hostname || '').toLowerCase()
		if (host === 'localhost' || host === '127.0.0.1') return text
		if (
			typeof window !== 'undefined' &&
			host === String(window.location.hostname || '').toLowerCase()
		)
			return text
		return ''
	} catch {
		return ''
	}
}

export const pickTripo3DPreferredFormat = (mode?: string): 'glb' | 'png' => {
	if (isTripo3DImageMode(mode)) return 'png'
	return 'glb'
}

export const pickTripo3DPreferredModelUrl = (value: unknown) => {
	return normalizeText(value)
}

export const getTripo3DDisplayThumbnailUrl = (
	settings: Record<string, unknown> | null | undefined
) => {
	const value = isRecord(settings) ? settings : {}
	const relationSummary = isRecord(value.tripo3dRelationSummary)
		? value.tripo3dRelationSummary
		: isRecord(value.relationSummary)
			? value.relationSummary
			: {}
	const outputSummary = isRecord(value.tripo3dOutputSummary)
		? value.tripo3dOutputSummary
		: isRecord(value.outputSummary)
			? value.outputSummary
			: {}

	const mode = normalizeText(
		value.tripo3dTaskFamily ??
		value.taskFamily ??
		value.tripo3dTaskMode ??
		value.taskMode ??
		outputSummary.mode
	)

	if (isTripo3DImageMode(mode)) {
		const imageUrls = getImageUrlsFromSettings(value)
		if (imageUrls.length > 0) {
			return sanitizeTripo3DPreviewUrl(imageUrls[0])
		}
	}

	const thumbnailUrl = normalizeText(
		relationSummary.effectiveThumbnailUrl ??
			outputSummary.thumbnailUrl ??
			getSettingsValue(value, 'tripo3dThumbnailUrl', 'thumbnailUrl')
	)

	return sanitizeTripo3DPreviewUrl(thumbnailUrl)
}

export const buildTripo3DNodePresentationSettings = (
	settings: Record<string, unknown> | null | undefined
) => {
	if (!settings) return null
	const safeThumbnailUrl = getTripo3DDisplayThumbnailUrl(settings)
	const hasTripo3dPrefix = 'tripo3dThumbnailUrl' in settings
	return {
		...settings,
		...(hasTripo3dPrefix
			? { tripo3dThumbnailUrl: safeThumbnailUrl || undefined }
			: { thumbnailUrl: safeThumbnailUrl || undefined }),
		...(hasTripo3dPrefix
			? {
					tripo3dOutputSummary: isRecord(settings.tripo3dOutputSummary)
						? {
								...settings.tripo3dOutputSummary,
								thumbnailUrl: safeThumbnailUrl || undefined
							}
						: settings.tripo3dOutputSummary
				}
			: {
					outputSummary: isRecord(settings.outputSummary)
						? {
								...settings.outputSummary,
								thumbnailUrl: safeThumbnailUrl || undefined
							}
						: settings.outputSummary
				}),
		...(hasTripo3dPrefix
			? {
					tripo3dRelationSummary: isRecord(settings.tripo3dRelationSummary)
						? {
								...settings.tripo3dRelationSummary,
								effectiveThumbnailUrl: safeThumbnailUrl || undefined
							}
						: settings.tripo3dRelationSummary
				}
			: {
					relationSummary: isRecord(settings.relationSummary)
						? {
								...settings.relationSummary,
								effectiveThumbnailUrl: safeThumbnailUrl || undefined
							}
						: settings.relationSummary
				})
	}
}

export const getTripo3DEffectiveModelSource = (
	settings: Record<string, unknown> | null | undefined
) => {
	const value = isRecord(settings) ? settings : {}
	const relationSummary = isRecord(value.tripo3dRelationSummary)
		? value.tripo3dRelationSummary
		: isRecord(value.relationSummary)
			? value.relationSummary
			: {}
	const outputSummary = isRecord(value.tripo3dOutputSummary)
		? value.tripo3dOutputSummary
		: isRecord(value.outputSummary)
			? value.outputSummary
			: {}
	const modelUrl = normalizeText(
		relationSummary.effectiveModelUrl ??
			getSettingsValue(value, 'tripo3dModelUrl', 'modelUrl') ??
			outputSummary.preferredUrl
	)
	const assetUrl = normalizeText(
		relationSummary.effectiveLocalAssetUrl ??
			getSettingsValue(value, 'tripo3dOutputAssetUrl', 'outputAssetUrl') ??
			outputSummary.assetUrl
	)
	const assetPath = normalizeText(
		relationSummary.effectiveLocalAssetPath ??
			getSettingsValue(value, 'tripo3dOutputAssetPath', 'outputAssetPath') ??
			outputSummary.assetPath
	)
	const preferredUrl =
		normalizeText(relationSummary.effectiveModelUrl ?? outputSummary.preferredUrl) ||
		assetUrl ||
		modelUrl
	const format = 'glb' as const
	return {
		preferredUrl,
		assetUrl,
		assetPath,
		modelUrl,
		format
	}
}

const normalizeTripo3DRelationKind = (value: unknown): Tripo3DRelationKind => {
	const text = normalizeText(value)
	if (text === 'texture' || text === 'refine') return text as Tripo3DRelationKind
	if (text === 'image') return 'model'
	return 'model'
}

const normalizeTripo3DTaskStatus = (value: unknown): Tripo3DTaskStatus => {
	const text = normalizeText(value)
	if (
		text === 'queued' ||
		text === 'running' ||
		text === 'succeeded' ||
		text === 'failed' ||
		text === 'cancelled'
	)
		return text as Tripo3DTaskStatus
	return 'idle'
}

export const pickTripo3DEffectiveOutput = (item: Record<string, unknown>): Tripo3DEffectiveOutput => {
	const mode = normalizeText(item.mode ?? item.tripo3dTaskFamily ?? item.taskFamily)
	const isImageTask = isTripo3DImageMode(mode)

	const imageUrlsFromItem = (() => {
		if (isArray(item.imageUrls)) {
			return item.imageUrls.filter((u): u is string => typeof u === 'string' && !!u.trim()).map(u => u.trim())
		}
		const outputSummary = isRecord(item.outputSummary) ? item.outputSummary :
			isRecord(item.tripo3dOutputSummary) ? item.tripo3dOutputSummary : {}
		if (isArray(outputSummary.imageUrls)) {
			return outputSummary.imageUrls.filter((u): u is string => typeof u === 'string' && !!u.trim()).map(u => u.trim())
		}
		const outputImages = item.tripo3dOutputImages ?? item.outputImages
		if (isArray(outputImages)) {
			return outputImages.filter((u): u is string => typeof u === 'string' && !!u.trim()).map(u => u.trim())
		}
		return []
	})()

	let thumbnailUrl = sanitizeTripo3DPreviewUrl(
		item.effectiveThumbnailUrl ?? item.thumbnailUrl
	)
	if (isImageTask && imageUrlsFromItem.length > 0 && !thumbnailUrl) {
		thumbnailUrl = sanitizeTripo3DPreviewUrl(imageUrlsFromItem[0])
	}

	const modelUrl = normalizeText(
		item.effectiveModelUrl ?? item.modelUrl ?? item.preferredModelUrl ?? item.localAssetUrl
	)
	const localAssetUrl = normalizeText(item.effectiveLocalAssetUrl ?? item.localAssetUrl)
	const localAssetPath = normalizeText(item.effectiveLocalAssetPath ?? item.localAssetPath)

	return {
		modelUrl: isImageTask ? (imageUrlsFromItem[0] || modelUrl) : modelUrl,
		thumbnailUrl,
		imageUrls: isImageTask ? imageUrlsFromItem : [],
		localAssetUrl,
		localAssetPath
	}
}
