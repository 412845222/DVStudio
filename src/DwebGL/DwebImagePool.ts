import type { DwebCanvasGL } from './DwebCanvasGL'

export type DwebImageWrapMode = 'clamp' | 'repeat'

type CacheEntry = {
	src: string
	tex: WebGLTexture
	width: number
	height: number
	wrap: DwebImageWrapMode
	status: 'loading' | 'ready' | 'error'
}

export class DwebImagePool {
	private entries = new Map<string, CacheEntry>()

	getSize(src: string): { width: number; height: number } | null {
		const key = (src || '').trim()
		if (!key) return null
		const e = this.entries.get(key)
		if (!e) return null
		return { width: e.width, height: e.height }
	}

	getTexture(
		gl: WebGL2RenderingContext,
		canvas: DwebCanvasGL,
		src: string,
		wrap: DwebImageWrapMode = 'clamp'
	): WebGLTexture {
		const key = (src || '').trim()
		if (!key) return canvas.getWhiteTexture()

		const existing = this.entries.get(key)
		if (existing) {
			// 允许同一个 src 在 repeat/clamp 间切换：这里简单按“最后一次请求”的 wrap 设置纹理参数
			if (existing.wrap !== wrap) {
				existing.wrap = wrap
				canvas.setTextureWrap(existing.tex, wrap)
			}
			return existing.tex
		}

		const tex = gl.createTexture()!
		// 先塞一个 1x1 透明像素，避免未完成时采样报错
		canvas.updateTextureFromCanvas(tex, canvas.create1x1TransparentCanvas(), { wrap })

		const entry: CacheEntry = { src: key, tex, width: 1, height: 1, wrap, status: 'loading' }
		this.entries.set(key, entry)

		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			entry.width = Math.max(1, img.naturalWidth || 1)
			entry.height = Math.max(1, img.naturalHeight || 1)
			entry.status = 'ready'
			const tmp = document.createElement('canvas')
			tmp.width = entry.width
			tmp.height = entry.height
			const ctx = tmp.getContext('2d')!
			ctx.clearRect(0, 0, tmp.width, tmp.height)
			ctx.drawImage(img, 0, 0)
			canvas.updateTextureFromCanvas(tex, tmp, { wrap: entry.wrap })
			canvas.requestRender()
		}
		img.onerror = () => {
			entry.status = 'error'
			canvas.requestRender()
		}
		img.src = key

		return tex
	}

	dispose(gl: WebGL2RenderingContext) {
		for (const e of this.entries.values()) {
			try {
				gl.deleteTexture(e.tex)
			} catch {
				// ignore
			}
		}
		this.entries.clear()
	}
}
