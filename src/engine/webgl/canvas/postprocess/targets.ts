import type { FilterTargets } from './types'

export class FilterTargetsPool {
	private map = new Map<string, FilterTargets>()

	prune(gl: WebGL2RenderingContext, validIds: Set<string>) {
		for (const id of this.map.keys()) {
			if (validIds.has(id)) continue
			this.disposeOne(gl, id)
		}
	}

	dispose(gl: WebGL2RenderingContext) {
		for (const id of this.map.keys()) this.disposeOne(gl, id)
		this.map.clear()
	}

	ensureWithPadding(
		gl: WebGL2RenderingContext,
		id: string,
		contentW: number,
		contentH: number,
		padX: number,
		padY: number,
		scale: number
	): FilterTargets {
		const s = Math.max(1e-3, Number(scale) || 1)
		const cw = Math.max(1, Math.min(4096, Math.floor((contentW + padX * 2) * s)))
		const ch = Math.max(1, Math.min(4096, Math.floor((contentH + padY * 2) * s)))
		const existing = this.map.get(id)
		if (
			existing &&
			existing.w === cw &&
			existing.h === ch &&
			existing.padX === padX &&
			existing.padY === padY &&
			existing.contentW === contentW &&
			existing.contentH === contentH &&
			existing.scale === s
		)
			return existing

		if (existing) this.disposeOne(gl, id)

		const mkTex = () => {
			const tex = gl.createTexture()!
			gl.bindTexture(gl.TEXTURE_2D, tex)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
			return tex
		}
		const mkFbo = (tex: WebGLTexture) => {
			const fbo = gl.createFramebuffer()!
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
			return fbo
		}

		const tex0 = mkTex()
		const tex1 = mkTex()
		const tex2 = mkTex()
		const fbo0 = mkFbo(tex0)
		const fbo1 = mkFbo(tex1)
		const fbo2 = mkFbo(tex2)
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)

		const t: FilterTargets = { w: cw, h: ch, padX, padY, contentW, contentH, scale: s, tex0, tex1, tex2, fbo0, fbo1, fbo2 }
		this.map.set(id, t)
		return t
	}

	private disposeOne(gl: WebGL2RenderingContext, id: string) {
		const existing = this.map.get(id)
		if (!existing) return
		this.map.delete(id)
		try {
			gl.deleteTexture(existing.tex0)
			gl.deleteTexture(existing.tex1)
			gl.deleteTexture(existing.tex2)
			gl.deleteFramebuffer(existing.fbo0)
			gl.deleteFramebuffer(existing.fbo1)
			gl.deleteFramebuffer(existing.fbo2)
		} catch {
			// ignore
		}
	}
}
