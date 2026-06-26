type UvRect = { u0: number; u1: number; v0: number; v1: number }

export type WorkflowImageCrop = { x: number; y: number; width: number; height: number }

const clamp01 = (v: unknown, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, Math.min(1, n))
}

const cropToUv = (crop: WorkflowImageCrop | null | undefined): UvRect => {
	const c = crop ?? { x: 0, y: 0, width: 1, height: 1 }
	const x0 = clamp01(c.x, 0)
	const y0 = clamp01(c.y, 0)
	const x1 = clamp01(x0 + clamp01(c.width, 1), 1)
	const y1 = clamp01(y0 + clamp01(c.height, 1), 1)
	// UI crop y=0 is top; keep it consistent with workflow preview rendering.
	return { u0: x0, u1: x1, v0: y0, v1: y1 }
}

/**
 * Export a cropped image as PNG via offscreen 2D canvas.
 * This is the "node output" primitive for workflow image nodes.
 */
export const exportWorkflowImageOutputPng = async (payload: {
	src: string
	outputWidth: number
	outputHeight: number
	crop?: WorkflowImageCrop | null
}): Promise<Blob | null> => {
	const src = String(payload?.src ?? '').trim()
	const outputWidth = Math.max(1, Math.floor(Number(payload?.outputWidth) || 0))
	const outputHeight = Math.max(1, Math.floor(Number(payload?.outputHeight) || 0))
	if (!src) return null
	if (!outputWidth || !outputHeight) return null

	const uv = cropToUv(payload.crop)

	// outputWidth/outputHeight represent the "quality" size of the full image.
	// We export the cropped region WITHOUT scaling it back up to full output.
	const cropW = Math.max(1, Math.floor((uv.u1 - uv.u0) * outputWidth))
	const cropH = Math.max(1, Math.floor((uv.v1 - uv.v0) * outputHeight))

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

	const loadImage = async (): Promise<LoadedImage | null> => {
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
									;(bitmap as any).close?.()
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
							}
						}
					}
				}
			} catch {
				// fall back to direct image loading below
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
			}
		}
	}

	const image = await loadImage()
	if (!image) return null

	const srcW = Math.max(1, Math.floor(image.width || 1))
	const srcH = Math.max(1, Math.floor(image.height || 1))
	const sx = Math.max(0, Math.min(srcW - 1, Math.floor(uv.u0 * srcW)))
	const sy = Math.max(0, Math.min(srcH - 1, Math.floor(uv.v0 * srcH)))
	const sw = Math.max(1, Math.min(srcW - sx, Math.floor((uv.u1 - uv.u0) * srcW)))
	const sh = Math.max(1, Math.min(srcH - sy, Math.floor((uv.v1 - uv.v0) * srcH)))

	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			const offscreen = new OffscreenCanvas(cropW, cropH)
			const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null
			if (!ctx) return null
			ctx.imageSmoothingEnabled = true
			ctx.clearRect(0, 0, cropW, cropH)
			image.draw(ctx, sx, sy, sw, sh, 0, 0, cropW, cropH)
			const toBlob = (offscreen as any).convertToBlob
			if (typeof toBlob === 'function') {
				const out = await toBlob.call(offscreen, { type: 'image/png' })
				image.cleanup?.()
				return out
			}
		} catch {
			// fallback to HTMLCanvasElement below
		}
	}

	if (typeof document === 'undefined') {
		image.cleanup?.()
		return null
	}
	const canvasEl = document.createElement('canvas')
	canvasEl.width = cropW
	canvasEl.height = cropH
	const ctx = canvasEl.getContext('2d')
	if (!ctx) {
		image.cleanup?.()
		return null
	}
	ctx.imageSmoothingEnabled = true
	ctx.clearRect(0, 0, cropW, cropH)
	image.draw(ctx, sx, sy, sw, sh, 0, 0, cropW, cropH)

	return await new Promise<Blob | null>((resolve) => {
		try {
			canvasEl.toBlob((b) => {
				image.cleanup?.()
				resolve(b)
			}, 'image/png')
		} catch {
			image.cleanup?.()
			resolve(null)
		}
	})
}
