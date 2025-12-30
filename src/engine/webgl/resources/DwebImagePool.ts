import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'

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
		// 先塞一个 1x1 透明像素，避免未完成时采样报错（不依赖 Canvas2D）
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		const initMode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, initMode)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, initMode)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))

		const entry: CacheEntry = { src: key, tex, width: 1, height: 1, wrap, status: 'loading' }
		this.entries.set(key, entry)

		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			entry.width = Math.max(1, img.naturalWidth || 1)
			entry.height = Math.max(1, img.naturalHeight || 1)
			entry.status = 'ready'
			gl.bindTexture(gl.TEXTURE_2D, tex)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
			const mode = entry.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
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
