import { DwebCanvasGL, type UvRect } from '../engine/webgl/canvas/DwebCanvasGL'

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
	// NOTE: WebGL texture v=0 is bottom, but our UI crop y=0 is top.
	// So we flip v here.
	return { u0: x0, u1: x1, v0: 1 - y0, v1: 1 - y1 }
}

/**
 * Export a cropped image as PNG, rendered via WebGL2 into a canvas of the desired resolution.
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
	if (typeof document === 'undefined') return null

	const canvasEl = document.createElement('canvas')
	canvasEl.width = outputWidth
	canvasEl.height = outputHeight
	const glCanvas = new DwebCanvasGL(canvasEl)
	glCanvas.setSize(outputWidth, outputHeight, 1)

	const uv = cropToUv(payload.crop)

	glCanvas.setScene({
		render: (c) => {
			const tex = c.getImageTexture(src, 'clamp')
			if (!tex) return
			const target = { w: outputWidth, h: outputHeight, scale: 1 }
			// Fill the whole output with the cropped region.
			c.drawLocalTexturedRectUv(target, 0, 0, outputWidth, outputHeight, tex, 1, 0, uv)
		},
	})

	try {
		await glCanvas.preloadImages([{ src, wrap: 'clamp' }], { timeoutMs: 6000 })
	} catch {
		// ignore
	}

	glCanvas.render()

	const blob = await new Promise<Blob | null>((resolve) => {
		try {
			canvasEl.toBlob((b) => resolve(b), 'image/png')
		} catch {
			resolve(null)
		}
	})
	glCanvas.dispose()
	return blob
}
