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
			adjusted: false
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
		reason
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
	const protocol = String(src).split('://')[0] || 'unknown'
	console.log(
		`[IMAGE-CROP] loadImageForCrop: src protocol=${protocol}, isRemote=${isRemote}, canFetch=${canFetch}, canBitmap=${canBitmap}, OffscreenCanvas=${typeof OffscreenCanvas !== 'undefined'}`
	)

	if (isRemote && canFetch) {
		try {
			console.log(`[IMAGE-CROP] trying fetch+createImageBitmap for remote URL`)
			const resp = await fetch(src, { credentials: 'include' })
			if (resp.ok) {
				const blob = await resp.blob()
				console.log(`[IMAGE-CROP] fetch ok, blob size=${blob.size}, type=${blob.type}`)
				if (canBitmap) {
					const bitmap = await createImageBitmap(blob)
					console.log(`[IMAGE-CROP] createImageBitmap success: ${bitmap.width}x${bitmap.height}`)
					return {
						width: Math.max(1, Math.floor(bitmap.width || 1)),
						height: Math.max(1, Math.floor(bitmap.height || 1)),
						draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
							ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
						},
						cleanup: () => {
							try {
								bitmap.close?.()
							} catch {
								// ignore
							}
						}
					}
				}
				if (typeof Image !== 'undefined') {
					const objectUrl = URL.createObjectURL(blob)
					const img = await new Promise<HTMLImageElement | null>((resolve) => {
						const next = new Image()
						next.onload = () => resolve(next)
						next.onerror = (e) => {
							console.warn(`[IMAGE-CROP] Image() failed to load objectUrl`, e)
							resolve(null)
						}
						next.src = objectUrl
					})
					if (!img) {
						URL.revokeObjectURL(objectUrl)
						return null
					}
					console.log(
						`[IMAGE-CROP] Image via blob URL loaded: ${img.naturalWidth}x${img.naturalHeight}`
					)
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
						}
					}
				}
			} else {
				console.warn(`[IMAGE-CROP] fetch failed with status ${resp.status}`)
			}
		} catch (err) {
			console.warn(`[IMAGE-CROP] fetch path failed:`, err)
			// fall through
		}
	}

	if (typeof Image === 'undefined') {
		console.warn(`[IMAGE-CROP] Image constructor not available`)
		return null
	}
	console.log(`[IMAGE-CROP] trying direct new Image() with src=`, src.slice(0, 100))
	const img = await new Promise<HTMLImageElement | null>((resolve) => {
		const next = new Image()
		if (isRemote) next.crossOrigin = 'anonymous'
		next.onload = () => {
			console.log(`[IMAGE-CROP] new Image() loaded: ${next.naturalWidth}x${next.naturalHeight}`)
			resolve(next)
		}
		next.onerror = (e) => {
			console.warn(`[IMAGE-CROP] new Image() onerror`, e)
			resolve(null)
		}
		next.src = src
	})
	if (!img) return null
	return {
		width: Math.max(1, Math.floor(img.naturalWidth || img.width || 1)),
		height: Math.max(1, Math.floor(img.naturalHeight || img.height || 1)),
		draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
			ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
		}
	}
}

export const exportWorkflowImageEnforcedPng = async (payload: {
	src: string
	crop: PixelRect
	minWidth?: number
}): Promise<Blob | null> => {
	const src = String(payload?.src ?? '').trim()
	if (!src) return null

	console.log(
		`[IMAGE-CROP] exportWorkflowImageEnforcedPng START: src=`,
		src.slice(0, 100),
		`crop=`,
		payload.crop,
		`minWidth=`,
		payload.minWidth
	)

	const image = await loadImageForCrop(src)
	if (!image) {
		console.warn(`[IMAGE-CROP] loadImageForCrop returned NULL, cannot crop`)
		return null
	}

	const srcW = Math.max(1, Math.floor(image.width || 1))
	const srcH = Math.max(1, Math.floor(image.height || 1))

	const enforced = computeEnforcedLandscapeCrop(srcW, srcH, payload.crop, {
		minWidth: payload.minWidth
	})

	const outW = Math.max(1, enforced.outputWidth)
	const outH = Math.max(1, enforced.outputHeight)
	const { sx, sy, sw, sh } = enforced.sourceCrop
	console.log(
		`[IMAGE-CROP] image loaded: ${srcW}x${srcH}, enforced crop: sx=${sx}, sy=${sy}, sw=${sw}, sh=${sh}, output=${outW}x${outH}, adjusted=${enforced.adjusted}`
	)

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
					console.log(`[IMAGE-CROP] OffscreenCanvas drawImage done, calling convertToBlob`)
					const toBlob = (
						offscreen as unknown as {
							convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>
						}
					).convertToBlob
					if (typeof toBlob === 'function') {
						const out = await toBlob.call(offscreen, { type: 'image/png' })
						console.log(
							`[IMAGE-CROP] convertToBlob success: blob size=${out?.size}, type=${out?.type}`
						)
						image.cleanup?.()
						return out
					} else {
						console.warn(`[IMAGE-CROP] OffscreenCanvas.convertToBlob not available`)
					}
				} else {
					console.warn(`[IMAGE-CROP] OffscreenCanvas.getContext('2d') returned NULL`)
				}
			} catch (err) {
				console.warn(`[IMAGE-CROP] OffscreenCanvas path failed:`, err)
				// fallback to HTMLCanvasElement
			}
		}

		if (typeof document === 'undefined') {
			console.warn(`[IMAGE-CROP] document not available, cannot use HTMLCanvasElement fallback`)
			image.cleanup?.()
			return null
		}

		console.log(`[IMAGE-CROP] falling back to HTMLCanvasElement (${outW}x${outH})`)
		const canvasEl = document.createElement('canvas')
		canvasEl.width = outW
		canvasEl.height = outH
		const ctx = canvasEl.getContext('2d') as CanvasRenderingContext2D | null
		if (!ctx) {
			console.warn(`[IMAGE-CROP] canvas.getContext('2d') returned NULL`)
			image.cleanup?.()
			return null
		}
		ctx.imageSmoothingEnabled = true
		ctx.clearRect(0, 0, outW, outH)
		image.draw(ctx, sx, sy, sw, sh, 0, 0, outW, outH)
		console.log(`[IMAGE-CROP] HTMLCanvasElement drawImage done, calling toBlob`)

		return await new Promise<Blob | null>((resolve) => {
			try {
				canvasEl.toBlob((b) => {
					console.log(`[IMAGE-CROP] toBlob callback: blob size=${b?.size}, type=${b?.type}`)
					image.cleanup?.()
					resolve(b)
				}, 'image/png')
			} catch (err) {
				console.warn(`[IMAGE-CROP] toBlob threw:`, err)
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
		sh: clamp(sh, 1, srcH - sy)
	}
}
