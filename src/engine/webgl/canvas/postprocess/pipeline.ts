import { fsPostBlur, fsPostGlowComposite, vsPostBlur, vsPostGlowComposite } from '../../shaders'
import type { DwebCanvasGL } from '../DwebCanvasGL'
import { createProgram } from './program'
import { FilterTargetsPool } from './targets'
import type { FilterTargets, PostProg } from './types'

type CustomCached = { prog: PostProg; ok: true; log: string } | { prog: null; ok: false; log: string }

export class CanvasPostProcess {
	private postVbo: WebGLBuffer | null = null
	private postProgBlur: PostProg | null = null
	private postProgGlowComposite: PostProg | null = null
	private postProgCustomCache = new Map<string, CustomCached>()
	private targets = new FilterTargetsPool()

	dispose(gl: WebGL2RenderingContext) {
		try {
			if (this.postVbo) gl.deleteBuffer(this.postVbo)
			if (this.postProgBlur) gl.deleteProgram(this.postProgBlur.program)
			if (this.postProgGlowComposite) gl.deleteProgram(this.postProgGlowComposite.program)
		} catch {
			// ignore
		}
		this.postVbo = null
		this.postProgBlur = null
		this.postProgGlowComposite = null
		this.postProgCustomCache.clear()
		this.targets.dispose(gl)
	}

	prune(gl: WebGL2RenderingContext, validIds: Set<string>) {
		this.targets.prune(gl, validIds)
	}

	applyFilters(
		gl: WebGL2RenderingContext,
		canvas: DwebCanvasGL,
		id: string,
		contentW: number,
		contentH: number,
		padX: number,
		padY: number,
		filters: any[],
		renderLocal: (target: { w: number; h: number; contentW: number; contentH: number }) => void
	): WebGLTexture {
		this.ensureResources(gl)
		const t = this.targets.ensureWithPadding(gl, id, contentW, contentH, padX, padY)

		const prevBlend = gl.isEnabled(gl.BLEND)
		gl.disable(gl.BLEND)

		// initial render
		gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo0)
		gl.viewport(0, 0, t.w, t.h)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		renderLocal({ w: t.w, h: t.h, contentW: t.contentW, contentH: t.contentH })

		let currentTex: WebGLTexture = t.tex0
		for (const f of filters) {
			const ft = String(f?.type || '')
			if (ft === 'blur') {
				const blurX = Math.max(0, Number((f as any).__blurX ?? f.blurX ?? 0) || 0)
				const blurY = Math.max(0, Number((f as any).__blurY ?? f.blurY ?? 0) || 0)
				const iterations = Math.max(1, Math.floor(Number((f as any).__iterations ?? f.iterations ?? 1) || 1))
				const maxStepPx = Math.max(1e-3, Number((f as any).__maxStepPx ?? 8) || 8)
				const maxIterations = Math.max(1, Math.floor(Number((f as any).__maxIterations ?? 12) || 12))
				if (currentTex === t.tex0) {
					currentTex = this.blurInto(gl, t, currentTex, t.fbo1, t.tex1, t.fbo2, t.tex2, blurX, blurY, iterations, maxStepPx, maxIterations)
				} else if (currentTex === t.tex1) {
					currentTex = this.blurInto(gl, t, currentTex, t.fbo0, t.tex0, t.fbo2, t.tex2, blurX, blurY, iterations, maxStepPx, maxIterations)
				} else {
					currentTex = this.blurInto(gl, t, currentTex, t.fbo1, t.tex1, t.fbo0, t.tex0, blurX, blurY, iterations, maxStepPx, maxIterations)
				}
				continue
			}
			if (ft === 'glow') {
				if (!this.postProgGlowComposite) continue
				const blurX = Math.max(0, Number((f as any).__blurX ?? f.blurX ?? 0) || 0)
				const blurY = Math.max(0, Number((f as any).__blurY ?? f.blurY ?? 0) || 0)
				const iterations = Math.max(1, Math.floor(Number((f as any).__iterations ?? f.iterations ?? 1) || 1))
				const maxStepPx = Math.max(1e-3, Number((f as any).__maxStepPx ?? 8) || 8)
				const maxIterations = Math.max(1, Math.floor(Number((f as any).__maxIterations ?? 12) || 12))

				let blurDstFbo: WebGLFramebuffer
				let blurDstTex: WebGLTexture
				let blurTmpFbo: WebGLFramebuffer
				let blurTmpTex: WebGLTexture
				let outFbo: WebGLFramebuffer
				let outTex: WebGLTexture
				if (currentTex === t.tex0) {
					blurDstFbo = t.fbo2
					blurDstTex = t.tex2
					blurTmpFbo = t.fbo1
					blurTmpTex = t.tex1
					outFbo = t.fbo1
					outTex = t.tex1
				} else if (currentTex === t.tex1) {
					blurDstFbo = t.fbo0
					blurDstTex = t.tex0
					blurTmpFbo = t.fbo2
					blurTmpTex = t.tex2
					outFbo = t.fbo2
					outTex = t.tex2
				} else {
					blurDstFbo = t.fbo1
					blurDstTex = t.tex1
					blurTmpFbo = t.fbo0
					blurTmpTex = t.tex0
					outFbo = t.fbo0
					outTex = t.tex0
				}

				const blurredTex = this.blurInto(
					gl,
					t,
					currentTex,
					blurDstFbo,
					blurDstTex,
					blurTmpFbo,
					blurTmpTex,
					blurX,
					blurY,
					iterations,
					maxStepPx,
					maxIterations
				)

				gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo)
				gl.viewport(0, 0, t.w, t.h)
				gl.useProgram(this.postProgGlowComposite.program)
				this.bindFullscreenQuad(gl, this.postProgGlowComposite)
				gl.activeTexture(gl.TEXTURE0)
				gl.bindTexture(gl.TEXTURE_2D, currentTex)
				gl.uniform1i(this.postProgGlowComposite.uSampler!, 0)
				gl.activeTexture(gl.TEXTURE1)
				gl.bindTexture(gl.TEXTURE_2D, blurredTex)
				gl.uniform1i(this.postProgGlowComposite.uSampler2!, 1)
				const color = canvas.parseHexColor(String(f.color ?? '#ffffff'), 1)
				gl.uniform3f(this.postProgGlowComposite.uColor!, color.r, color.g, color.b)
				gl.uniform1f(this.postProgGlowComposite.uIntensity!, Math.max(0, Number(f.intensity ?? 1)))
				gl.uniform1f(this.postProgGlowComposite.uInner!, f.inner ? 1 : 0)
				gl.uniform1f(this.postProgGlowComposite.uKnockout!, f.knockout ? 1 : 0)
				gl.drawArrays(gl.TRIANGLES, 0, 6)
				currentTex = outTex
				continue
			}
			if (ft === 'customShader') {
				const code = this.getCustomProgram(gl, String(f.vertex ?? ''), String(f.fragment ?? ''))
				if (!code.ok || !code.prog) continue
				let dstFbo: WebGLFramebuffer
				let dstTex: WebGLTexture
				if (currentTex === t.tex0) {
					dstFbo = t.fbo2
					dstTex = t.tex2
				} else if (currentTex === t.tex1) {
					dstFbo = t.fbo0
					dstTex = t.tex0
				} else {
					dstFbo = t.fbo1
					dstTex = t.tex1
				}
				this.drawPostPass(gl, code.prog, currentTex, dstFbo, t.w, t.h, () => {
					if (code.prog.uTexel) gl.uniform2f(code.prog.uTexel, 1 / t.w, 1 / t.h)
				})
				currentTex = dstTex
				continue
			}
		}

		// restore main framebuffer/viewport
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)
		gl.viewport(0, 0, (gl.canvas as HTMLCanvasElement).width, (gl.canvas as HTMLCanvasElement).height)
		if (prevBlend) gl.enable(gl.BLEND)

		return currentTex
	}

	private ensureResources(gl: WebGL2RenderingContext) {
		if (!this.postVbo) this.postVbo = gl.createBuffer()!
		if (!this.postProgBlur) {
			this.postProgBlur = createProgram(gl, vsPostBlur, fsPostBlur, {
				aPos: 'a_position',
				uSampler: 'u_sampler',
				withSampler: true,
			})
			this.postProgBlur.uTexel = gl.getUniformLocation(this.postProgBlur.program, 'u_texel')
			this.postProgBlur.uDir = gl.getUniformLocation(this.postProgBlur.program, 'u_dir')
			this.postProgBlur.uRadius = gl.getUniformLocation(this.postProgBlur.program, 'u_radius')
		}
		if (!this.postProgGlowComposite) {
			this.postProgGlowComposite = createProgram(gl, vsPostGlowComposite, fsPostGlowComposite, {
				aPos: 'a_position',
				uSampler: 'u_sampler',
				withSampler: true,
			})
			this.postProgGlowComposite.uSampler2 = gl.getUniformLocation(this.postProgGlowComposite.program, 'u_blur')
			this.postProgGlowComposite.uColor = gl.getUniformLocation(this.postProgGlowComposite.program, 'u_glowColor')
			this.postProgGlowComposite.uIntensity = gl.getUniformLocation(this.postProgGlowComposite.program, 'u_intensity')
			this.postProgGlowComposite.uInner = gl.getUniformLocation(this.postProgGlowComposite.program, 'u_inner')
			this.postProgGlowComposite.uKnockout = gl.getUniformLocation(this.postProgGlowComposite.program, 'u_knockout')
		}
	}

	private bindFullscreenQuad(gl: WebGL2RenderingContext, prog: PostProg) {
		if (!this.postVbo) return
		const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
		gl.bindBuffer(gl.ARRAY_BUFFER, this.postVbo)
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(prog.aPos)
		gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 8, 0)
	}

	private blurInto(
		gl: WebGL2RenderingContext,
		t: FilterTargets,
		srcTex: WebGLTexture,
		dstFbo: WebGLFramebuffer,
		dstTex: WebGLTexture,
		tmpFbo: WebGLFramebuffer,
		tmpTex: WebGLTexture,
		radiusX: number,
		radiusY: number,
		iterations: number,
		maxStepPx: number,
		maxIterations: number
	): WebGLTexture {
		if (!this.postProgBlur) return srcTex
		if (dstTex === srcTex) return srcTex
		const baseIt = Math.max(1, Math.floor(iterations))
		const rx = Math.max(0, Number(radiusX) || 0)
		const ry = Math.max(0, Number(radiusY) || 0)
		const step = Math.max(1e-3, Number(maxStepPx) || 8)
		let it = Math.max(baseIt, Math.ceil((3 * rx) / step), Math.ceil((3 * ry) / step))
		it = Math.max(1, Math.min(it, Math.max(1, Math.floor(maxIterations))))
		const sx = it > 1 ? rx / it : rx
		const sy = it > 1 ? ry / it : ry
		let current = srcTex
		for (let i = 0; i < it; i++) {
			this.drawPostPass(gl, this.postProgBlur, current, tmpFbo, t.w, t.h, () => {
				gl.uniform2f(this.postProgBlur!.uTexel!, 1 / t.w, 1 / t.h)
				gl.uniform2f(this.postProgBlur!.uDir!, 1, 0)
				gl.uniform1f(this.postProgBlur!.uRadius!, sx)
			})
			this.drawPostPass(gl, this.postProgBlur, tmpTex, dstFbo, t.w, t.h, () => {
				gl.uniform2f(this.postProgBlur!.uTexel!, 1 / t.w, 1 / t.h)
				gl.uniform2f(this.postProgBlur!.uDir!, 0, 1)
				gl.uniform1f(this.postProgBlur!.uRadius!, sy)
			})
			current = dstTex
		}
		return current
	}

	private drawPostPass(
		gl: WebGL2RenderingContext,
		prog: PostProg,
		src: WebGLTexture,
		dstFbo: WebGLFramebuffer,
		w: number,
		h: number,
		setup?: () => void
	) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
		gl.viewport(0, 0, w, h)
		gl.useProgram(prog.program)
		this.bindFullscreenQuad(gl, prog)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, src)
		if (prog.uSampler) gl.uniform1i(prog.uSampler, 0)
		setup?.()
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private getCustomProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): CustomCached {
		const key = `${vertex}\n---\n${fragment}`
		const cached = this.postProgCustomCache.get(key)
		if (cached) return cached
		try {
			const prog = createProgram(gl, vertex, fragment, { aPos: 'a_position', uSampler: 'u_sampler', withSampler: true })
			prog.uTexel = gl.getUniformLocation(prog.program, 'u_texel')
			const it: CustomCached = { prog, ok: true, log: gl.getProgramInfoLog(prog.program) || '' }
			this.postProgCustomCache.set(key, it)
			return it
		} catch (e: any) {
			const dummy: CustomCached = { prog: null, ok: false, log: String(e?.message ?? e) }
			this.postProgCustomCache.set(key, dummy)
			return dummy
		}
	}
}
