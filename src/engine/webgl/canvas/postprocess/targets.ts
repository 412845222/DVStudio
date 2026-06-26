import type { FilterTargets } from './types'

type Entry = {
	t: FilterTargets
	usedAt: number
	bytes: number
}

type FrameStats = {
	alloc: number
	evict: number
	reuse: number
	clampDim: number
	clampPixels: number
	clampBudget: number
}

type DiagEvent = {
	t: number
	k: 'allocAttempt' | 'allocSuccess' | 'allocFail'
	w: number
	h: number
	bytesNeed: number
	bytesTotalBefore: number
	targetsBefore: number
	bytesPerPixel: number
	format: string
	info?: string
}

const DIAG_KEY = 'dvs.renderDiag.v1'
const diag = (() => {
	const buf: DiagEvent[] = []
	let lastFlushAt = 0
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
	const push = (e: DiagEvent) => {
		buf.push(e)
		if (buf.length > 120) buf.splice(0, buf.length - 120)
		// Flush at low frequency to keep overhead bounded.
		const t = now()
		if (t - lastFlushAt < 900) return
		lastFlushAt = t
		try {
			if (typeof localStorage === 'undefined') return
			// Store only a small tail to keep payload tiny.
			const tail = buf.slice(-80)
			localStorage.setItem(DIAG_KEY, JSON.stringify({ at: Date.now(), tail }))
		} catch {
			// ignore
		}
	}
	return { push }
})()

const TEX_COUNT_PER_TARGET = 3

// Keep these defaults aligned with CanvasPostProcess guardrails (pipeline.ts)
// to avoid step-wise behavior differences between "safe" scale computation
// and the actual pool allocation limits.
const DEFAULT_MAX_DIM_PX = 1280
const DEFAULT_MAX_PIXELS_PER_TEX = 1_000_000
const DIM_QUANT_STEP = 32

// Conservative defaults: avoid GPU OOM when many nodes enable glow/blur.
// Each target allocates 3x RGBA textures.
const DEFAULT_MAX_TARGETS = 32
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024

export class FilterTargetsPool {
	private map = new Map<string, Entry>()
	private tick = 0
	private maxTargets = DEFAULT_MAX_TARGETS
	private maxBytes = DEFAULT_MAX_BYTES
	private maxDimPx = DEFAULT_MAX_DIM_PX
	private maxPixelsPerTex = DEFAULT_MAX_PIXELS_PER_TEX
	private texCfg: {
		internalFormat: number
		format: number
		type: number
		minFilter: number
		magFilter: number
		bytesPerPixel: number
	} | null = null

	private frameStats: FrameStats = {
		alloc: 0,
		evict: 0,
		reuse: 0,
		clampDim: 0,
		clampPixels: 0,
		clampBudget: 0
	}
	private lastFrame: {
		targets: number
		bytes: number
		maxW: number
		maxH: number
		bytesPerPixel: number
		format: string
	} | null = null

	private ensureTexCfg(gl: WebGL2RenderingContext) {
		if (this.texCfg) return
		// Default: RGBA8 UNORM.
		const rgba8 = {
			internalFormat: gl.RGBA,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			bytesPerPixel: 4
		}

		// NOTE: We intentionally force RGBA8 for stability.
		// RGBA16F doubles memory and is a common crash vector when many dashed lines
		// enter the glow/blur pipeline under zoom.
		this.texCfg = rgba8
	}

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
		this.ensureTexCfg(gl)
		this.tick++
		const s = Math.max(1e-3, Number(scale) || 1)
		const gpuMax = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096
		const maxDim = Math.max(256, Math.min(gpuMax, this.maxDimPx))
		const bw = Math.max(1e-3, (Number(contentW) || 0) + (Number(padX) || 0) * 2)
		const bh = Math.max(1e-3, (Number(contentH) || 0) + (Number(padY) || 0) * 2)
		let cw = Math.max(1, Math.floor(bw * s))
		let ch = Math.max(1, Math.floor(bh * s))
		// Clamp by max dimension.
		const beforeDimW = cw
		const beforeDimH = ch
		cw = Math.min(maxDim, cw)
		ch = Math.min(maxDim, ch)
		if (cw !== beforeDimW || ch !== beforeDimH) this.frameStats.clampDim++
		// Clamp by pixel budget (per texture), preserving aspect ratio.
		const maxPixels = Math.max(1, Math.floor(this.maxPixelsPerTex))
		const pixels = cw * ch
		if (pixels > maxPixels) {
			this.frameStats.clampPixels++
			const k = Math.sqrt(maxPixels / pixels)
			cw = Math.max(1, Math.min(maxDim, Math.floor(cw * k)))
			ch = Math.max(1, Math.min(maxDim, Math.floor(ch * k)))
		}
		// Quantize dimensions to reduce re-allocation churn while zooming.
		// Use ceil quantization so we never undershoot and accidentally clip content.
		cw = Math.max(1, Math.min(maxDim, Math.ceil(cw / DIM_QUANT_STEP) * DIM_QUANT_STEP))
		ch = Math.max(1, Math.min(maxDim, Math.ceil(ch / DIM_QUANT_STEP) * DIM_QUANT_STEP))
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

		// If we don't have an exact match, try reusing a slightly larger existing target.
		// This reduces allocation churn while zooming and prevents short-term memory spikes.
		const reused = this.findReusableTarget(key, cw, ch)
		if (reused) {
			reused.usedAt = this.tick
			reused.t.padX = padX
			reused.t.padY = padY
			reused.t.contentW = contentW
			reused.t.contentH = contentH
			reused.t.scale = Math.max(1e-3, Math.min(reused.t.w / bw, reused.t.h / bh))
			this.frameStats.reuse++
			return reused.t
		}

		const cfg = this.texCfg!
		const bytesNeeded = cw * ch * cfg.bytesPerPixel * TEX_COUNT_PER_TARGET
		const bytesBefore = this.totalBytes()
		const targetsBefore = this.map.size
		diag.push({
			t: Date.now(),
			k: 'allocAttempt',
			w: cw,
			h: ch,
			bytesNeed: bytesNeeded,
			bytesTotalBefore: bytesBefore,
			targetsBefore,
			bytesPerPixel: cfg.bytesPerPixel,
			format: cfg.bytesPerPixel === 8 ? 'rgba16f' : 'rgba8'
		})

		// Pre-evict before allocation to avoid GPU/driver OOM crashes.
		this.enforceBudgetWithReservation(gl, bytesNeeded)

		// If a single target would exceed the total budget, clamp it further.
		// Keep aspect ratio and quantization behavior.
		let finalW = cw
		let finalH = ch
		if (bytesNeeded > this.maxBytes) {
			this.frameStats.clampBudget++
			const maxPixelsByBudget = Math.max(
				1,
				Math.floor(this.maxBytes / (cfg.bytesPerPixel * TEX_COUNT_PER_TARGET))
			)
			const p0 = finalW * finalH
			if (p0 > maxPixelsByBudget) {
				const k = Math.sqrt(maxPixelsByBudget / p0)
				finalW = Math.max(1, Math.min(maxDim, Math.floor(finalW * k)))
				finalH = Math.max(1, Math.min(maxDim, Math.floor(finalH * k)))
				finalW = Math.max(1, Math.min(maxDim, Math.ceil(finalW / DIM_QUANT_STEP) * DIM_QUANT_STEP))
				finalH = Math.max(1, Math.min(maxDim, Math.ceil(finalH / DIM_QUANT_STEP) * DIM_QUANT_STEP))
			}
		}

		// Update key after budget clamp.
		const finalKey = `${finalW}x${finalH}`
		const effectiveScale2 = Math.max(1e-3, Math.min(finalW / bw, finalH / bh))
		const existing2 = this.map.get(finalKey)
		if (existing2) {
			existing2.usedAt = this.tick
			existing2.t.padX = padX
			existing2.t.padY = padY
			existing2.t.contentW = contentW
			existing2.t.contentH = contentH
			existing2.t.scale = effectiveScale2
			this.frameStats.reuse++
			return existing2.t
		}
		const mkTex = () => {
			const tex = gl.createTexture()!
			gl.bindTexture(gl.TEXTURE_2D, tex)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.minFilter)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.magFilter)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
			try {
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					cfg.internalFormat,
					finalW,
					finalH,
					0,
					cfg.format,
					cfg.type,
					null
				)
			} catch (e) {
				diag.push({
					t: Date.now(),
					k: 'allocFail',
					w: finalW,
					h: finalH,
					bytesNeed: finalW * finalH * cfg.bytesPerPixel * TEX_COUNT_PER_TARGET,
					bytesTotalBefore: bytesBefore,
					targetsBefore,
					bytesPerPixel: cfg.bytesPerPixel,
					format: cfg.bytesPerPixel === 8 ? 'rgba16f' : 'rgba8',
					info: String((e as any)?.message || e || '')
				})
				try {
					gl.deleteTexture(tex)
				} catch {
					// ignore
				}
				throw e
			}
			return tex
		}
		const mkFbo = (tex: WebGLTexture) => {
			const fbo = gl.createFramebuffer()!
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
			return fbo
		}

		let tex0: WebGLTexture
		let tex1: WebGLTexture
		let tex2: WebGLTexture
		let fbo0: WebGLFramebuffer
		let fbo1: WebGLFramebuffer
		let fbo2: WebGLFramebuffer
		try {
			tex0 = mkTex()
			tex1 = mkTex()
			tex2 = mkTex()
			fbo0 = mkFbo(tex0)
			fbo1 = mkFbo(tex1)
			fbo2 = mkFbo(tex2)
		} catch (e) {
			// As a last resort, avoid hard-crashing the app: return a tiny target.
			// The effect may be degraded/blank, but the editor stays alive.
			this.frameStats.clampBudget++
			const tiny = 32
			let tTiny: FilterTargets | null = null
			try {
				const keyTiny = `${tiny}x${tiny}`
				const existingTiny = this.map.get(keyTiny)
				if (existingTiny) {
					existingTiny.usedAt = this.tick
					existingTiny.t.padX = padX
					existingTiny.t.padY = padY
					existingTiny.t.contentW = contentW
					existingTiny.t.contentH = contentH
					existingTiny.t.scale = Math.max(1e-3, Math.min(tiny / bw, tiny / bh))
					this.frameStats.reuse++
					tTiny = existingTiny.t
				} else {
					const mkTinyTex = () => {
						const tex = gl.createTexture()!
						gl.bindTexture(gl.TEXTURE_2D, tex)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cfg.minFilter)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, cfg.magFilter)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
						gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
						gl.texImage2D(
							gl.TEXTURE_2D,
							0,
							cfg.internalFormat,
							tiny,
							tiny,
							0,
							cfg.format,
							cfg.type,
							null
						)
						return tex
					}
					const texA = mkTinyTex()
					const texB = mkTinyTex()
					const texC = mkTinyTex()
					const fboA = mkFbo(texA)
					const fboB = mkFbo(texB)
					const fboC = mkFbo(texC)
					const tt: FilterTargets = {
						w: tiny,
						h: tiny,
						padX,
						padY,
						contentW,
						contentH,
						scale: Math.max(1e-3, Math.min(tiny / bw, tiny / bh)),
						tex0: texA,
						tex1: texB,
						tex2: texC,
						fbo0: fboA,
						fbo1: fboB,
						fbo2: fboC
					}
					const bytesTiny = tiny * tiny * cfg.bytesPerPixel * TEX_COUNT_PER_TARGET
					this.map.set(keyTiny, { t: tt, usedAt: this.tick, bytes: bytesTiny })
					this.frameStats.alloc++
					tTiny = tt
				}
			} catch {
				// ignore
			}
			diag.push({
				t: Date.now(),
				k: 'allocFail',
				w: finalW,
				h: finalH,
				bytesNeed: finalW * finalH * cfg.bytesPerPixel * TEX_COUNT_PER_TARGET,
				bytesTotalBefore: bytesBefore,
				targetsBefore,
				bytesPerPixel: cfg.bytesPerPixel,
				format: cfg.bytesPerPixel === 8 ? 'rgba16f' : 'rgba8',
				info: 'fallbackTiny'
			})
			if (tTiny) return tTiny
			throw e
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)

		const t: FilterTargets = {
			w: finalW,
			h: finalH,
			padX,
			padY,
			contentW,
			contentH,
			scale: effectiveScale2,
			tex0,
			tex1,
			tex2,
			fbo0,
			fbo1,
			fbo2
		}
		const bytes = finalW * finalH * cfg.bytesPerPixel * TEX_COUNT_PER_TARGET
		this.map.set(finalKey, { t, usedAt: this.tick, bytes })
		this.frameStats.alloc++
		diag.push({
			t: Date.now(),
			k: 'allocSuccess',
			w: finalW,
			h: finalH,
			bytesNeed: bytes,
			bytesTotalBefore: bytesBefore,
			targetsBefore,
			bytesPerPixel: cfg.bytesPerPixel,
			format: cfg.bytesPerPixel === 8 ? 'rgba16f' : 'rgba8'
		})
		this.enforceBudget(gl, finalKey)
		return t
	}

	consumeFrameStats(): {
		frame: FrameStats
		total: {
			targets: number
			bytes: number
			maxW: number
			maxH: number
			bytesPerPixel: number
			format: string
			maxTargets: number
			maxBytes: number
		}
	} {
		const cfg = this.texCfg
		let maxW = 0
		let maxH = 0
		for (const e of this.map.values()) {
			maxW = Math.max(maxW, e.t.w)
			maxH = Math.max(maxH, e.t.h)
		}
		const bytes = this.totalBytes()
		const format = cfg?.bytesPerPixel === 8 ? 'rgba16f' : 'rgba8'
		const total = {
			targets: this.map.size,
			bytes,
			maxW,
			maxH,
			bytesPerPixel: cfg?.bytesPerPixel ?? 4,
			format,
			maxTargets: this.maxTargets,
			maxBytes: this.maxBytes
		}
		this.lastFrame = {
			targets: total.targets,
			bytes: total.bytes,
			maxW: total.maxW,
			maxH: total.maxH,
			bytesPerPixel: total.bytesPerPixel,
			format: total.format
		}
		const frame = this.frameStats
		this.frameStats = { alloc: 0, evict: 0, reuse: 0, clampDim: 0, clampPixels: 0, clampBudget: 0 }
		return { frame, total }
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

	private enforceBudgetWithReservation(gl: WebGL2RenderingContext, reserveBytes: number) {
		if (reserveBytes <= 0) return
		// Evict LRU entries until there is room for the new target.
		while (
			this.map.size + 1 > this.maxTargets ||
			this.totalBytes() + reserveBytes > this.maxBytes
		) {
			if (this.map.size === 0) break
			const entries = [...this.map.entries()]
			entries.sort((a, b) => a[1].usedAt - b[1].usedAt)
			const victim = entries[0]?.[0]
			if (!victim) break
			this.disposeOne(gl, victim)
			this.frameStats.evict++
			this.frameStats.clampBudget++
		}
	}

	private findReusableTarget(excludeKey: string, minW: number, minH: number): Entry | null {
		let best: Entry | null = null
		let bestArea = Number.POSITIVE_INFINITY
		for (const [k, e] of this.map.entries()) {
			if (k === excludeKey) continue
			if (e.t.w < minW || e.t.h < minH) continue
			const area = e.t.w * e.t.h
			if (area < bestArea) {
				best = e
				bestArea = area
			}
		}
		return best
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
