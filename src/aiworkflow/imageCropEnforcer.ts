export type PixelRect = {
	sx: number
	sy: number
	sw: number
	sh: number
}

export type EnforcedCropResult = {
	sourceCrop: PixelRect
	outputWidth: number
	outputHeight: number
	adjusted: boolean
	reason?: 'narrow' | 'portrait' | 'both' | 'too-wide'
}

const MIN_OUTPUT_WIDTH = 350
const MIN_ASPECT_RATIO = 1.0
const MAX_ASPECT_RATIO = 16 / 9

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export const computeEnforcedLandscapeCrop = (
	sourceWidth: number,
	sourceHeight: number,
	originalCrop: PixelRect,
	options: { minWidth?: number } = {}
): EnforcedCropResult => {
	const minWidth = Math.max(1, Math.floor(options.minWidth ?? MIN_OUTPUT_WIDTH))
	const srcW = Math.max(1, Math.floor(sourceWidth || 1))
	const srcH = Math.max(1, Math.floor(sourceHeight || 1))

	const sx = clamp(Math.floor(originalCrop.sx), 0, srcW - 1)
	const sy = clamp(Math.floor(originalCrop.sy), 0, srcH - 1)
	const sw = clamp(Math.floor(originalCrop.sw), 1, srcW - sx)
	const sh = clamp(Math.floor(originalCrop.sh), 1, srcH - sy)

	const currentAspect = sw / sh
	const isPortrait = currentAspect < MIN_ASPECT_RATIO
	const isNarrow = sw < minWidth
	const isTooWide = currentAspect > MAX_ASPECT_RATIO

	if (!isPortrait && !isNarrow && !isTooWide) {
		return {
			sourceCrop: { sx, sy, sw, sh },
			outputWidth: sw,
			outputHeight: sh,
			adjusted: false,
		}
	}

	const cx = sx + sw / 2
	const cy = sy + sh / 2

	let targetW: number = sw
	let targetH: number = sh
	let reason: 'narrow' | 'portrait' | 'both' | 'too-wide' = 'narrow'

	if (isPortrait && isNarrow) {
		reason = 'both'
		targetW = Math.max(minWidth, sw)
		targetH = targetW
	} else if (isPortrait) {
		reason = 'portrait'
		targetW = Math.max(sw, minWidth)
		targetH = targetW
	} else if (isNarrow) {
		reason = 'narrow'
		targetW = minWidth
		targetH = Math.max(sh, Math.ceil(targetW / MAX_ASPECT_RATIO))
		if (targetH > targetW) {
			targetH = targetW
		}
	} else if (isTooWide) {
		reason = 'too-wide'
		targetW = sw
		targetH = Math.ceil(targetW / MAX_ASPECT_RATIO)
	}

	targetH = Math.max(targetH, Math.ceil(targetW / MAX_ASPECT_RATIO))
	targetW = Math.max(targetW, minWidth)
	if (targetH < targetW / MAX_ASPECT_RATIO) {
		targetH = Math.ceil(targetW / MAX_ASPECT_RATIO)
	}
	if (targetW < minWidth) {
		targetW = minWidth
	}

	let newSx = Math.floor(cx - targetW / 2)
	let newSy = Math.floor(cy - targetH / 2)
	let newSw = targetW
	let newSh = targetH

	if (newSx < 0) {
		newSx = 0
	}
	if (newSy < 0) {
		newSy = 0
	}
	if (newSx + newSw > srcW) {
		newSx = Math.max(0, srcW - newSw)
	}
	if (newSy + newSh > srcH) {
		newSy = Math.max(0, srcH - newSh)
	}

	newSw = Math.min(newSw, srcW - newSx)
	newSh = Math.min(newSh, srcH - newSy)

	let finalOutputW = newSw
	let finalOutputH = newSh
	const finalAspect = finalOutputW / finalOutputH
	if (finalAspect > MAX_ASPECT_RATIO) {
		finalOutputH = Math.ceil(finalOutputW / MAX_ASPECT_RATIO)
	} else if (finalAspect < MIN_ASPECT_RATIO) {
		finalOutputW = finalOutputH
	}
	if (finalOutputW < minWidth) {
		finalOutputW = minWidth
		finalOutputH = Math.max(finalOutputH, Math.ceil(finalOutputW / MAX_ASPECT_RATIO))
	}

	return {
		sourceCrop: { sx: newSx, sy: newSy, sw: newSw, sh: newSh },
		outputWidth: finalOutputW,
		outputHeight: finalOutputH,
		adjusted: true,
		reason,
	}
}

type LoadedImage = {
	width: number
	height: number
	draw: (
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number
	) => void
	cleanup?: () => void
}

const loadImageForCrop = async (src: string): Promise<LoadedImage | null> => {
	const canFetch = typeof fetch !== 'undefined'
	const canBitmap = typeof createImageBitmap !== 'undefined'
	const isRemote = /^https?:\/\//i.test(src)

	if (isRemote && canFetch) {
		try {
			const resp = await fetch(src, { credentials: 'include' })
			if (resp.ok) {
				const blob = await resp.blob()
				if (canBitmap) {
					const bitmap = await createImageBitmap(blob)
					return {
						width: Math.max(1, Math.floor((bitmap as any).width || 1)),
						height: Math.max(1, Math.floor((bitmap as any).height || 1)),
						draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
							ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
						},
						cleanup: () => {
							try {
								(bitmap as any).close?.()
							} catch {
								// ignore
							}
						},
					}
				}
				if (typeof Image !== 'undefined') {
					const objectUrl = URL.createObjectURL(blob)
					const img = await new Promise<HTMLImageElement | null>((resolve) => {
						const next = new Image()
						next.onload = () => resolve(next)
						next.onerror = () => resolve(null)
						next.src = objectUrl
					})
					if (!img) {
						URL.revokeObjectURL(objectUrl)
						return null
					}
					return {
						width: Math.max(1, Math.floor(img.naturalWidth || img.width || 1)),
						height: Math.max(1, Math.floor(img.naturalHeight || img.height || 1)),
						draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
							ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
						},
						cleanup: () => {
							try {
								URL.revokeObjectURL(objectUrl)
							} catch {
								// ignore
							}
						},
					}
				}
			}
		} catch {
			// fall through
		}
	}

	if (typeof Image === 'undefined') return null
	const img = await new Promise<HTMLImageElement | null>((resolve) => {
		const next = new Image()
		if (isRemote) next.crossOrigin = 'anonymous'
		next.onload = () => resolve(next)
		next.onerror = () => resolve(null)
		next.src = src
	})
	if (!img) return null
	return {
		width: Math.max(1, Math.floor(img.naturalWidth || img.width || 1)),
		height: Math.max(1, Math.floor(img.naturalHeight || img.height || 1)),
		draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
			ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
		},
	}
}

export const exportWorkflowImageEnforcedPng = async (payload: {
	src: string
	crop: PixelRect
	minWidth?: number
}): Promise<Blob | null> => {
	const src = String(payload?.src ?? '').trim()
	if (!src) return null

	const image = await loadImageForCrop(src)
	if (!image) return null

	const srcW = Math.max(1, Math.floor(image.width || 1))
	const srcH = Math.max(1, Math.floor(image.height || 1))

	const enforced = computeEnforcedLandscapeCrop(srcW, srcH, payload.crop, {
		minWidth: payload.minWidth,
	})

	const outW = Math.max(1, enforced.outputWidth)
	const outH = Math.max(1, enforced.outputHeight)
	const { sx, sy, sw, sh } = enforced.sourceCrop

	try {
		if (typeof OffscreenCanvas !== 'undefined') {
			try {
				const offscreen = new OffscreenCanvas(outW, outH)
				const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null
				if (ctx) {
					ctx.imageSmoothingEnabled = true
					ctx.imageSmoothingQuality = 'high'
					ctx.clearRect(0, 0, outW, outH)
					image.draw(ctx, sx, sy, sw, sh, 0, 0, outW, outH)
					const toBlob = (offscreen as any).convertToBlob
					if (typeof toBlob === 'function') {
						const out = await toBlob.call(offscreen, { type: 'image/png' })
						image.cleanup?.()
						return out
					}
				}
			} catch {
				// fallback to HTMLCanvasElement
			}
		}

		if (typeof document === 'undefined') {
			image.cleanup?.()
			return null
		}

		const canvasEl = document.createElement('canvas')
		canvasEl.width = outW
		canvasEl.height = outH
		const ctx = canvasEl.getContext('2d') as CanvasRenderingContext2D | null
		if (!ctx) {
			image.cleanup?.()
			return null
		}
		ctx.imageSmoothingEnabled = true
		ctx.clearRect(0, 0, outW, outH)
		image.draw(ctx, sx, sy, sw, sh, 0, 0, outW, outH)

		return await new Promise<Blob | null>((resolve) => {
			try {
				canvasEl.toBlob(
					(b) => {
						image.cleanup?.()
						resolve(b)
					},
					'image/png'
				)
			} catch {
				image.cleanup?.()
				resolve(null)
			}
		})
	} finally {
		image.cleanup?.()
	}
}

export const uvCropToPixelRect = (
	sourceWidth: number,
	sourceHeight: number,
	uvCrop: { x: number; y: number; width: number; height: number }
): PixelRect => {
	const srcW = Math.max(1, Math.floor(sourceWidth || 1))
	const srcH = Math.max(1, Math.floor(sourceHeight || 1))
	const u0 = clamp(uvCrop.x, 0, 1)
	const v0 = clamp(uvCrop.y, 0, 1)
	const u1 = clamp(u0 + clamp(uvCrop.width, 0, 1), 0, 1)
	const v1 = clamp(v0 + clamp(uvCrop.height, 0, 1), 0, 1)
	const sx = Math.floor(u0 * srcW)
	const sy = Math.floor(v0 * srcH)
	const sw = Math.max(1, Math.floor((u1 - u0) * srcW))
	const sh = Math.max(1, Math.floor((v1 - v0) * srcH))
	return {
		sx: clamp(sx, 0, srcW - 1),
		sy: clamp(sy, 0, srcH - 1),
		sw: clamp(sw, 1, srcW - sx),
		sh: clamp(sh, 1, srcH - sy),
	}
}
