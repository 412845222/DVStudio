import type { FilterTargets } from './types'

type Entry = {
	t: FilterTargets
	usedAt: number
	bytes: number
}

const BYTES_PER_PIXEL = 4
const TEX_COUNT_PER_TARGET = 3

const DEFAULT_MAX_DIM_PX = 1024
const DEFAULT_MAX_PIXELS_PER_TEX = 800_000
const DIM_QUANT_STEP = 32

// Conservative defaults: avoid GPU OOM when many nodes enable glow/blur.
// Each target allocates 3x RGBA textures.
const DEFAULT_MAX_TARGETS = 48
const DEFAULT_MAX_BYTES = 192 * 1024 * 1024

export class FilterTargetsPool {
	private map = new Map<string, Entry>()
	private tick = 0
	private maxTargets = DEFAULT_MAX_TARGETS
	private maxBytes = DEFAULT_MAX_BYTES
	private maxDimPx = DEFAULT_MAX_DIM_PX
	private maxPixelsPerTex = DEFAULT_MAX_PIXELS_PER_TEX

	prune(gl: WebGL2RenderingContext, _validIds: Set<string>) {
		// Targets are cached by size (not by nodeId). Keep entries and rely on LRU budget.
		this.enforceBudget(gl)
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
		this.tick++
		const s = Math.max(1e-3, Number(scale) || 1)
		const gpuMax = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096
		const maxDim = Math.max(256, Math.min(gpuMax, this.maxDimPx))
		const bw = Math.max(1e-3, (Number(contentW) || 0) + (Number(padX) || 0) * 2)
		const bh = Math.max(1e-3, (Number(contentH) || 0) + (Number(padY) || 0) * 2)
		let cw = Math.max(1, Math.floor(bw * s))
		let ch = Math.max(1, Math.floor(bh * s))
		// Clamp by max dimension.
		cw = Math.min(maxDim, cw)
		ch = Math.min(maxDim, ch)
		// Clamp by pixel budget (per texture), preserving aspect ratio.
		const maxPixels = Math.max(1, Math.floor(this.maxPixelsPerTex))
		const pixels = cw * ch
		if (pixels > maxPixels) {
			const k = Math.sqrt(maxPixels / pixels)
			cw = Math.max(1, Math.min(maxDim, Math.floor(cw * k)))
			ch = Math.max(1, Math.min(maxDim, Math.floor(ch * k)))
		}
		// Quantize dimensions to reduce re-allocation churn while zooming.
		cw = Math.max(1, Math.min(maxDim, Math.round(cw / DIM_QUANT_STEP) * DIM_QUANT_STEP))
		ch = Math.max(1, Math.min(maxDim, Math.round(ch / DIM_QUANT_STEP) * DIM_QUANT_STEP))
		// Cache strictly by allocation size. Scale is derived from allocated pixels.
		const key = `${cw}x${ch}`
		const effectiveScale = Math.max(1e-3, Math.min(cw / bw, ch / bh))
		const existing = this.map.get(key)
		if (existing) {
			existing.usedAt = this.tick
			existing.t.padX = padX
			existing.t.padY = padY
			existing.t.contentW = contentW
			existing.t.contentH = contentH
			existing.t.scale = effectiveScale
			return existing.t
		}

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

		const t: FilterTargets = { w: cw, h: ch, padX, padY, contentW, contentH, scale: effectiveScale, tex0, tex1, tex2, fbo0, fbo1, fbo2 }
		const bytes = cw * ch * BYTES_PER_PIXEL * TEX_COUNT_PER_TARGET
		this.map.set(key, { t, usedAt: this.tick, bytes })
		this.enforceBudget(gl, key)
		return t
	}

	private enforceBudget(gl: WebGL2RenderingContext, protectedId?: string) {
		if (this.map.size <= this.maxTargets && this.totalBytes() <= this.maxBytes) return

		// Evict least-recently-used targets (excluding the one we just returned)
		const entries = [...this.map.entries()]
		entries.sort((a, b) => a[1].usedAt - b[1].usedAt)
		for (const [id] of entries) {
			if (protectedId && id === protectedId) continue
			if (this.map.size <= this.maxTargets && this.totalBytes() <= this.maxBytes) break
			this.disposeOne(gl, id)
		}
	}

	private totalBytes() {
		let sum = 0
		for (const v of this.map.values()) sum += v.bytes
		return sum
	}

	private disposeOne(gl: WebGL2RenderingContext, id: string) {
		const existing = this.map.get(id)
		if (!existing) return
		this.map.delete(id)
		try {
			gl.deleteTexture(existing.t.tex0)
			gl.deleteTexture(existing.t.tex1)
			gl.deleteTexture(existing.t.tex2)
			gl.deleteFramebuffer(existing.t.fbo0)
			gl.deleteFramebuffer(existing.t.fbo1)
			gl.deleteFramebuffer(existing.t.fbo2)
		} catch {
			// ignore
		}
	}
}
