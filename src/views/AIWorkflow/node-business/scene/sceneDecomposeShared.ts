import type { WorkflowImageCrop, WorkflowPixelRect } from '../../../../aiworkflow/types'

const MIN_CROP_WIDTH_PX = 350
const MIN_ASPECT_RATIO = 1.0
const MAX_ASPECT_RATIO = 16 / 9

const sceneDecomposeImageSizeCache = new Map<string, { width: number; height: number }>()

export const slugSceneDecomposeId = (value: unknown, index: number) => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	const slug = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
	return slug || `object-${index + 1}`
}

export const buildSceneDecomposeDescription = (item: any, fallbackName: string) => {
	const lines: string[] = []
	const name = String(item?.name ?? fallbackName).trim()
	const description = String(item?.description ?? '').trim()
	const category = String(item?.category ?? '').trim()
	const subCategory = String(item?.subCategory ?? '').trim()
	const observed = Array.isArray(item?.observedImageIndices)
		? item.observedImageIndices
				.map((value: any) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	if (name) lines.push(name)
	if (description && description !== name) lines.push(description)
	if (category || subCategory)
		lines.push(`分类：${[category, subCategory].filter(Boolean).join(' / ')}`)
	if (observed.length) lines.push(`观测参考图：${observed.join('、')}`)
	return lines.join('\n').trim() || fallbackName
}

export const extractSceneDecomposeItems = (parsed: any) => {
	if (Array.isArray(parsed?.objects)) return parsed.objects as any[]
	if (Array.isArray(parsed?.layoutItems)) return parsed.layoutItems as any[]
	if (Array.isArray(parsed)) return parsed as any[]
	return [] as any[]
}

export const inferSceneDecomposeSourceImageIndex = (item: any) => {
	const direct = Number(item?.sourceImageIndex)
	if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.floor(direct))
	const observed = Array.isArray(item?.observedImageIndices)
		? item.observedImageIndices
				.map((value: any) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []
	if (observed.length) return Math.max(1, Math.floor(observed[0]))
	return 1
}

export const shouldSkipSceneDecomposeItem = (item: any) => {
	const id = String(item?.id ?? '')
		.trim()
		.toLowerCase()
	const semanticRole = String(item?.semanticRole ?? '')
		.trim()
		.toLowerCase()
	const keyElementType = String(item?.keyElementType ?? '')
		.trim()
		.toLowerCase()
	const relationTags = Array.isArray(item?.relationTags)
		? item.relationTags.map((value: any) =>
				String(value ?? '')
					.trim()
					.toLowerCase()
			)
		: []
	const observed = Array.isArray(item?.observedImageIndices)
		? item.observedImageIndices
				.map((value: any) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	if (!item || typeof item !== 'object') return true
	if (semanticRole === 'structure-shell') return true
	if (relationTags.includes('structural-shell')) return true
	if (id === 'floor1' || id === 'ceiling1' || /wall\d+$/i.test(id)) return true
	if (!observed.length && !item?.imageRect && !item?.imageRectPixels) {
		if (keyElementType === 'floor' || keyElementType === 'wall' || keyElementType === 'ceiling')
			return true
	}
	return false
}

export const isSceneLayoutModelTargetItem = (item: any) => !shouldSkipSceneDecomposeItem(item)

export const hasValidSceneDecomposeImageRect = (imageRect: any) => {
	if (!imageRect || typeof imageRect !== 'object') return false
	const x = Number(imageRect.x)
	const y = Number(imageRect.y)
	const width = Number(imageRect.width)
	const height = Number(imageRect.height)
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0
	)
}

export const hasValidSceneDecomposePixelRect = (imageRectPixels: any) => {
	if (!imageRectPixels || typeof imageRectPixels !== 'object') return false
	const x = Number(imageRectPixels.x)
	const y = Number(imageRectPixels.y)
	const width = Number(imageRectPixels.width)
	const height = Number(imageRectPixels.height)
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0
	)
}

export const ensureSceneDecomposeSourceDimensions = async (source: {
	url: string
	width?: number
	height?: number
}) => {
	const knownWidth = Number(source.width ?? 0)
	const knownHeight = Number(source.height ?? 0)
	if (
		Number.isFinite(knownWidth) &&
		knownWidth > 0 &&
		Number.isFinite(knownHeight) &&
		knownHeight > 0
	) {
		return { width: knownWidth, height: knownHeight }
	}

	const key = String(source.url ?? '').trim()
	if (!key) return { width: undefined, height: undefined } as { width?: number; height?: number }

	const cached = sceneDecomposeImageSizeCache.get(key)
	if (cached) {
		source.width = cached.width
		source.height = cached.height
		return cached
	}

	const measured = await new Promise<{ width: number; height: number } | null>((resolve) => {
		const img = new Image()
		img.onload = () => {
			const width = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
			const height = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
			resolve({ width, height })
		}
		img.onerror = () => resolve(null)
		img.src = key
	})

	if (measured) {
		sceneDecomposeImageSizeCache.set(key, measured)
		source.width = measured.width
		source.height = measured.height
		return measured
	}

	return { width: undefined, height: undefined } as { width?: number; height?: number }
}

export const normalizeSceneDecomposeCrop = (
	imageRect: any,
	imageRectPixels: any,
	source: { width?: number; height?: number },
	opts?: { allowFullImageFallback?: boolean }
): {
	crop: WorkflowImageCrop
	pixelRect?: WorkflowPixelRect
	outputWidth: number
	outputHeight: number
	cropMode: 'cropped' | 'fallback'
} | null => {
	const width = Number(source.width ?? 0)
	const height = Number(source.height ?? 0)
	if (hasValidSceneDecomposeImageRect(imageRect)) {
		let crop: WorkflowImageCrop = {
			x: Math.max(0, Math.min(1, Number(imageRect.x))),
			y: Math.max(0, Math.min(1, Number(imageRect.y))),
			width: Math.max(0.0001, Math.min(1, Number(imageRect.width))),
			height: Math.max(0.0001, Math.min(1, Number(imageRect.height)))
		}
		if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
			crop = adjustCropForMinimumSize(crop, width, height)
		}
		const outputWidth =
			Number.isFinite(width) && width > 0
				? Math.max(1, Math.round(width * crop.width))
				: Math.max(1, Math.round(Number(imageRectPixels?.width ?? 1024 * crop.width)))
		const outputHeight =
			Number.isFinite(height) && height > 0
				? Math.max(1, Math.round(height * crop.height))
				: Math.max(1, Math.round(Number(imageRectPixels?.height ?? 1024 * crop.height)))
		const pixelRect = hasValidSceneDecomposePixelRect(imageRectPixels)
			? {
					x: Number(imageRectPixels.x),
					y: Number(imageRectPixels.y),
					width: Math.max(1, Number(imageRectPixels.width)),
					height: Math.max(1, Number(imageRectPixels.height))
				}
			: undefined
		return { crop, pixelRect, outputWidth, outputHeight, cropMode: 'cropped' }
	}

	if (
		hasValidSceneDecomposePixelRect(imageRectPixels) &&
		Number.isFinite(width) &&
		width > 0 &&
		Number.isFinite(height) &&
		height > 0
	) {
		const px = Number(imageRectPixels.x)
		const py = Number(imageRectPixels.y)
		const pw = Math.max(1, Number(imageRectPixels.width))
		const ph = Math.max(1, Number(imageRectPixels.height))
		let crop: WorkflowImageCrop = {
			x: Math.max(0, Math.min(1, px / width)),
			y: Math.max(0, Math.min(1, py / height)),
			width: Math.max(0.0001, Math.min(1, pw / width)),
			height: Math.max(0.0001, Math.min(1, ph / height))
		}
		crop = adjustCropForMinimumSize(crop, width, height)
		const adjustedPx = Math.round(crop.x * width)
		const adjustedPy = Math.round(crop.y * height)
		const adjustedPw = Math.max(1, Math.round(crop.width * width))
		const adjustedPh = Math.max(1, Math.round(crop.height * height))
		return {
			crop,
			pixelRect: { x: adjustedPx, y: adjustedPy, width: adjustedPw, height: adjustedPh },
			outputWidth: adjustedPw,
			outputHeight: adjustedPh,
			cropMode: 'cropped'
		}
	}

	if (opts?.allowFullImageFallback) {
		const fallbackWidth =
			Number.isFinite(width) && width > 0 ? Math.max(1, Math.round(width)) : 1024
		const fallbackHeight =
			Number.isFinite(height) && height > 0 ? Math.max(1, Math.round(height)) : 1024
		return {
			crop: { x: 0, y: 0, width: 1, height: 1 },
			pixelRect: { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight },
			outputWidth: fallbackWidth,
			outputHeight: fallbackHeight,
			cropMode: 'fallback'
		}
	}

	return null
}

interface CropAdjustOptions {
	minWidthPx?: number
	minAspectRatio?: number
	maxAspectRatio?: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const adjustCropForMinimumSize = (
	crop: WorkflowImageCrop,
	sourceWidth: number,
	sourceHeight: number,
	options: CropAdjustOptions = {}
): WorkflowImageCrop => {
	const minWidthPx = options.minWidthPx ?? MIN_CROP_WIDTH_PX
	const minAspectRatio = options.minAspectRatio ?? MIN_ASPECT_RATIO
	const maxAspectRatio = options.maxAspectRatio ?? MAX_ASPECT_RATIO

	if (
		!Number.isFinite(sourceWidth) ||
		sourceWidth <= 0 ||
		!Number.isFinite(sourceHeight) ||
		sourceHeight <= 0
	) {
		return crop
	}

	let { x, y, width, height } = crop
	let pixelWidth = Math.max(1, Math.round(sourceWidth * width))
	let pixelHeight = Math.max(1, Math.round(sourceHeight * height))

	let needsAdjust = false

	if (pixelWidth < minWidthPx) {
		const targetPixelWidth = Math.min(sourceWidth, minWidthPx)
		const targetWidth = targetPixelWidth / sourceWidth
		const centerX = x + width / 2
		x = clamp(centerX - targetWidth / 2, 0, 1 - targetWidth)
		width = targetWidth
		pixelWidth = targetPixelWidth
		needsAdjust = true
	}

	const aspectRatio = pixelWidth / pixelHeight
	if (aspectRatio < minAspectRatio) {
		const targetPixelHeight = Math.max(1, Math.round(pixelWidth / minAspectRatio))
		const maxPixelHeight = Math.round(sourceHeight * (1 - y))
		const finalPixelHeight = Math.min(targetPixelHeight, maxPixelHeight, Math.round(sourceHeight))
		if (finalPixelHeight > pixelHeight) {
			const targetHeight = finalPixelHeight / sourceHeight
			const centerY = y + height / 2
			y = clamp(centerY - targetHeight / 2, 0, 1 - targetHeight)
			height = targetHeight
			needsAdjust = true
		}
	} else if (aspectRatio > maxAspectRatio) {
		const targetPixelWidth = Math.max(1, Math.round(pixelHeight * maxAspectRatio))
		const maxPixelWidth = Math.round(sourceWidth * (1 - x))
		const finalPixelWidth = Math.min(targetPixelWidth, maxPixelWidth, Math.round(sourceWidth))
		if (finalPixelWidth < pixelWidth) {
			const targetWidth = finalPixelWidth / sourceWidth
			const centerX = x + width / 2
			x = clamp(centerX - targetWidth / 2, 0, 1 - targetWidth)
			width = targetWidth
			needsAdjust = true
		}
	}

	if (!needsAdjust) return crop

	x = clamp(x, 0, 1 - width)
	y = clamp(y, 0, 1 - height)
	width = clamp(width, 0.0001, 1 - x)
	height = clamp(height, 0.0001, 1 - y)

	return { x, y, width, height }
}

export const cleanupSceneDecomposeSharedRuntime = () => {
	sceneDecomposeImageSizeCache.clear()
}
