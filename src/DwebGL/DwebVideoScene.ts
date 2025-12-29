import type { VideoSceneState, VideoSceneTreeNode, VideoSceneUserNodeType, VideoSceneNodeTransform } from '../store/videoscene'
import { DwebCanvasGL, themeRgba, type IDwebGLScene, type Vec2 } from './DwebCanvasGL'
import { DwebImagePool } from './DwebImagePool'
import { vsPostBlur, fsPostBlur } from './shaders/postBlur'
import { vsPostGlowComposite, fsPostGlowComposite } from './shaders/postGlowComposite'

export type HitTestResult = {
	layerId: string
	nodeId: string
}

type RenderNode = {
	layerId: string
	id: string
	type: VideoSceneUserNodeType
	transform: VideoSceneNodeTransform
	props?: Record<string, any>
	text?: string
	fontSize?: number
	imageSrc?: string
}

type FilterTargets = {
	w: number
	h: number
	padX: number
	padY: number
	contentW: number
	contentH: number
	tex0: WebGLTexture
	tex1: WebGLTexture
	tex2: WebGLTexture
	fbo0: WebGLFramebuffer
	fbo1: WebGLFramebuffer
	fbo2: WebGLFramebuffer
}

type PostProg = {
	program: WebGLProgram
	aPos: number
	uSampler: WebGLUniformLocation | null
	uSampler2?: WebGLUniformLocation | null
	uTexel?: WebGLUniformLocation | null
	uDir?: WebGLUniformLocation | null
	uRadius?: WebGLUniformLocation | null
	uColor?: WebGLUniformLocation | null
	uIntensity?: WebGLUniformLocation | null
	uInner?: WebGLUniformLocation | null
	uKnockout?: WebGLUniformLocation | null
}

export class DwebVideoScene implements IDwebGLScene {
	private state: VideoSceneState | null = null
	private stageSize = { width: 1920, height: 1080 }
	private renderOrder: RenderNode[] = []
	private stageBackground: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	} = { type: 'color', color: '#111111', opacity: 1, imageSrc: '', imageFit: 'contain', repeat: false }

	private textCanvas = document.createElement('canvas')
	private textCtx = this.textCanvas.getContext('2d')!
	private rectCanvas = document.createElement('canvas')
	private rectCtx = this.rectCanvas.getContext('2d')!
	private textures = new Map<string, WebGLTexture>()
	private imagePool = new DwebImagePool()
	private filterTargets = new Map<string, FilterTargets>()
	private postVbo: WebGLBuffer | null = null
	private postProgBlur: PostProg | null = null
	private postProgGlowComposite: PostProg | null = null
	private postProgCustomCache = new Map<string, { prog: PostProg; ok: boolean; log: string }>()

	private nodeVbo: WebGLBuffer | null = null
	private nodeProgColor: PostProg | null = null
	private nodeProgTex: PostProg | null = null

	private parseHexColor(hex: string, alpha = 1) {
		const h = (hex || '').trim()
		const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(h)
		if (!m) return themeRgba.accent(alpha)
		const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
		const n = parseInt(s, 16)
		return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha }
	}

	private rgbaToCss(c: { r: number; g: number; b: number; a: number }) {
		const r = Math.round(c.r * 255)
		const g = Math.round(c.g * 255)
		const b = Math.round(c.b * 255)
		return `rgba(${r}, ${g}, ${b}, ${c.a})`
	}

	private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
		ctx.beginPath()
		// @ts-ignore
		if (typeof (ctx as any).roundRect === 'function') {
			// @ts-ignore
			;(ctx as any).roundRect(x, y, w, h, rr)
			return
		}
		const x0 = x
		const y0 = y
		const x1 = x + w
		const y1 = y + h
		ctx.moveTo(x0 + rr, y0)
		ctx.arcTo(x1, y0, x1, y1, rr)
		ctx.arcTo(x1, y1, x0, y1, rr)
		ctx.arcTo(x0, y1, x0, y0, rr)
		ctx.arcTo(x0, y0, x1, y0, rr)
		ctx.closePath()
	}

	private getRoundedRectTexture(
		gl: WebGL2RenderingContext,
		canvas: DwebCanvasGL,
		n: RenderNode,
		radius: number,
		mode: 'fill' | 'stroke'
	): WebGLTexture {
		const fillColor = this.parseHexColor(n.props?.fillColor ?? '#3aa1ff', 1)
		const borderColor = this.parseHexColor(n.props?.borderColor ?? '#9cdcfe', 1)
		const borderW = Math.max(0, Number(n.props?.borderWidth ?? 0))
		const w = Math.max(1, Math.floor(n.transform.width))
		const h = Math.max(1, Math.floor(n.transform.height))
		const rr = Math.max(0, Math.min(Number(radius) || 0, Math.min(w, h) / 2))
		const key = `rect:${n.id}:${mode}:${w}:${h}:${n.props?.fillColor ?? ''}:${n.props?.borderColor ?? ''}:${borderW}:${rr}`
		let tex = this.textures.get(key)
		if (tex) return tex
		for (const k of this.textures.keys()) {
			if (k.startsWith(`rect:${n.id}:`)) {
				gl.deleteTexture(this.textures.get(k)!)
				this.textures.delete(k)
			}
		}
		tex = gl.createTexture()!
		this.rectCanvas.width = w
		this.rectCanvas.height = h
		const ctx = this.rectCtx
		ctx.clearRect(0, 0, w, h)

		if (mode === 'fill') {
			ctx.fillStyle = this.rgbaToCss(fillColor)
			this.roundRectPath(ctx, 0, 0, w, h, rr)
			ctx.fill()
		} else {
			if (borderW > 0) {
				ctx.lineWidth = borderW
				ctx.strokeStyle = this.rgbaToCss(borderColor)
				this.roundRectPath(ctx, borderW / 2, borderW / 2, w - borderW, h - borderW, Math.max(0, rr - borderW / 2))
				ctx.stroke()
			}
		}
		canvas.updateTextureFromCanvas(tex, this.rectCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}

	setStageSize(size: { width: number; height: number }) {
		this.stageSize = { width: size.width, height: size.height }
	}

	setStageBackground(bg: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	}) {
		this.stageBackground = { ...this.stageBackground, ...bg }
	}

	setState(state: VideoSceneState) {
		this.state = state
		this.rebuildRenderOrder()
	}

	private rebuildRenderOrder() {
		if (!this.state) {
			this.renderOrder = []
			return
		}
		const list: RenderNode[] = []
		for (const layer of this.state.layers) {
			for (const root of layer.nodeTree) {
				this.walkBuildRenderOrder(layer.id, root, { x: 0, y: 0 }, list)
			}
		}
		this.renderOrder = list
		// prune filter targets for removed nodes
		const ids = new Set(list.map((n) => n.id))
		for (const id of this.filterTargets.keys()) {
			if (!ids.has(id)) {
				const t = this.filterTargets.get(id)
				// cannot delete GL resources here safely without gl; keep map small anyway
				this.filterTargets.delete(id)
				void t
			}
		}
	}

	private ensurePostResources(gl: WebGL2RenderingContext) {
		if (!this.postVbo) this.postVbo = gl.createBuffer()!
		if (!this.nodeVbo) this.nodeVbo = gl.createBuffer()!
		if (!this.nodeProgColor) {
			this.nodeProgColor = this.createProgram(gl, this.vsNode(), this.fsNodeColor(), {
				aPos: 'a_pos',
				uSampler: null,
				withSampler: false,
			})
		}
		if (!this.nodeProgTex) {
			this.nodeProgTex = this.createProgram(gl, this.vsNode(), this.fsNodeTex(), {
				aPos: 'a_pos',
				uSampler: 'u_sampler',
				withSampler: true,
			})
		}
		if (!this.postProgBlur) {
			this.postProgBlur = this.createProgram(gl, vsPostBlur, fsPostBlur, {
				aPos: 'a_position',
				uSampler: 'u_sampler',
				withSampler: true,
			})
			this.postProgBlur.uTexel = gl.getUniformLocation(this.postProgBlur.program, 'u_texel')
			this.postProgBlur.uDir = gl.getUniformLocation(this.postProgBlur.program, 'u_dir')
			this.postProgBlur.uRadius = gl.getUniformLocation(this.postProgBlur.program, 'u_radius')
		}
		if (!this.postProgGlowComposite) {
			this.postProgGlowComposite = this.createProgram(gl, vsPostGlowComposite, fsPostGlowComposite, {
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

	private ensureFilterTargets(gl: WebGL2RenderingContext, id: string, w: number, h: number): FilterTargets {
		return this.ensureFilterTargetsWithPadding(gl, id, w, h, 0, 0)
	}

	private ensureFilterTargetsWithPadding(gl: WebGL2RenderingContext, id: string, contentW: number, contentH: number, padX: number, padY: number): FilterTargets {
		const cw = Math.max(1, Math.min(4096, Math.floor(contentW + padX * 2)))
		const ch = Math.max(1, Math.min(4096, Math.floor(contentH + padY * 2)))
		const existing = this.filterTargets.get(id)
		if (existing && existing.w === cw && existing.h === ch && existing.padX === padX && existing.padY === padY && existing.contentW === contentW && existing.contentH === contentH) return existing
		if (existing) {
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
		const mkTex = () => {
			const tex = gl.createTexture()!
			gl.bindTexture(gl.TEXTURE_2D, tex)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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
		const t: FilterTargets = { w: cw, h: ch, padX, padY, contentW, contentH, tex0, tex1, tex2, fbo0, fbo1, fbo2 }
		this.filterTargets.set(id, t)
		return t
	}

	private vsNode() {
		return `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_resolution;
out vec2 v_uv;
void main(){
  vec2 screen = a_pos + u_resolution * 0.5;
  vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
}`
	}
	private fsNodeColor() {
		return `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main(){ outColor = u_color; }`
	}
	private fsNodeTex() {
		return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sampler;
uniform float u_alpha;
out vec4 outColor;
void main(){ outColor = texture(u_sampler, v_uv) * vec4(1.0,1.0,1.0,u_alpha); }`
	}
	// post-process shaders moved to src/DwebGL/shaders/*

	private createProgram(
		gl: WebGL2RenderingContext,
		vsSrc: string,
		fsSrc: string,
		opt: { aPos: string; uSampler: string | null; withSampler: boolean }
	): PostProg {
		const vs = gl.createShader(gl.VERTEX_SHADER)!
		gl.shaderSource(vs, vsSrc)
		gl.compileShader(vs)
		if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
			const msg = gl.getShaderInfoLog(vs) || 'vertex compile failed'
			gl.deleteShader(vs)
			throw new Error(msg)
		}
		const fs = gl.createShader(gl.FRAGMENT_SHADER)!
		gl.shaderSource(fs, fsSrc)
		gl.compileShader(fs)
		if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
			const msg = gl.getShaderInfoLog(fs) || 'fragment compile failed'
			gl.deleteShader(vs)
			gl.deleteShader(fs)
			throw new Error(msg)
		}
		const program = gl.createProgram()!
		gl.attachShader(program, vs)
		gl.attachShader(program, fs)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const msg = gl.getProgramInfoLog(program) || 'link failed'
			gl.deleteShader(vs)
			gl.deleteShader(fs)
			gl.deleteProgram(program)
			throw new Error(msg)
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		const aPos = gl.getAttribLocation(program, opt.aPos)
		const uSampler = opt.withSampler && opt.uSampler ? gl.getUniformLocation(program, opt.uSampler) : null
		return { program, aPos, uSampler }
	}

	private drawNodeToTarget(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, n: RenderNode, t: FilterTargets) {
		this.ensurePostResources(gl)
		gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo0)
		gl.viewport(0, 0, t.w, t.h)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		const nodeW = t.contentW
		const nodeH = t.contentH

		// draw node content centered at (0,0) in local space
		const rotation = 0
		const opacity = 1
		if (n.type === 'base') {
			this.drawLocalRect(gl, { w: t.w, h: t.h }, 0, 0, nodeW, nodeH, themeRgba.border(0.25), rotation)
			return
		}
		if (n.type === 'rect') {
			const fillOpacity = Math.max(0, Math.min(1, Number(n.props?.fillOpacity ?? 1)))
			const borderOpacity = Math.max(0, Math.min(1, Number(n.props?.borderOpacity ?? 1)))
			const fillA = Math.max(0, Math.min(1, opacity * fillOpacity))
			const borderA = Math.max(0, Math.min(1, opacity * borderOpacity))
			const cornerRadius = Math.max(0, Number(n.props?.cornerRadius ?? 0))
			if (cornerRadius > 0.5) {
				if (fillA > 0) {
					const fillTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'fill')
					this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, nodeW, nodeH, fillTex, fillA, rotation)
				}
				const borderPx0 = Math.max(0, Number(n.props?.borderWidth ?? 1))
				const bw = Math.max(0, (borderPx0 / canvas.viewport.zoom) || 0)
				if (bw > 0 && borderA > 0) {
					const strokeTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'stroke')
					this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, nodeW, nodeH, strokeTex, borderA, rotation)
				}
				return
			}
			if (fillA > 0) {
				const fillColor = this.parseHexColor(n.props?.fillColor ?? '#3aa1ff', fillA)
				this.drawLocalRect(gl, { w: t.w, h: t.h }, 0, 0, nodeW, nodeH, fillColor, rotation)
			}
			const borderPx = Math.max(0, Number(n.props?.borderWidth ?? 1))
			let bw = borderPx / canvas.viewport.zoom
			bw = Math.max(0, Math.min(bw, Math.min(nodeW, nodeH) / 2))
			if (bw > 0 && borderA > 0) {
				const borderColor = this.parseHexColor(n.props?.borderColor ?? '#9cdcfe', borderA)
				this.drawLocalRect(gl, { w: t.w, h: t.h }, 0, -nodeH / 2 + bw / 2, nodeW, bw, borderColor, rotation)
				this.drawLocalRect(gl, { w: t.w, h: t.h }, 0, nodeH / 2 - bw / 2, nodeW, bw, borderColor, rotation)
				this.drawLocalRect(gl, { w: t.w, h: t.h }, -nodeW / 2 + bw / 2, 0, bw, nodeH, borderColor, rotation)
				this.drawLocalRect(gl, { w: t.w, h: t.h }, nodeW / 2 - bw / 2, 0, bw, nodeH, borderColor, rotation)
			}
			return
		}
		if (n.type === 'text') {
			const tex = this.getTextTexture(gl, canvas, n)
			this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, nodeW, nodeH, tex, 1, rotation)
			return
		}
		// image
		const src = (n.imageSrc ?? '').trim()
		const tex = this.getImageTexture(gl, canvas, n)
		const size = src ? this.imagePool.getSize(src) : null
		const imgW = Math.max(1, size?.width ?? 1)
		const imgH = Math.max(1, size?.height ?? 1)
		const fit = ((n.props as any)?.imageFit ?? 'contain') as 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		const w = Math.max(1, nodeW)
		const h = Math.max(1, nodeH)

		if (fit === 'fill') {
			this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, w, h, tex, 1, rotation)
			return
		}

		if (fit === 'cover') {
			const scale = Math.max(w / imgW, h / imgH)
			const scaledW = imgW * scale
			const scaledH = imgH * scale
			const visU = Math.min(1, w / scaledW)
			const visV = Math.min(1, h / scaledH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			this.drawLocalTexUv(gl, { w: t.w, h: t.h }, 0, 0, w, h, tex, 1, rotation, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		if (fit === 'none') {
			if (imgW <= w && imgH <= h) {
				this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, imgW, imgH, tex, 1, rotation)
				return
			}
			const visU = Math.min(1, w / imgW)
			const visV = Math.min(1, h / imgH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			this.drawLocalTexUv(gl, { w: t.w, h: t.h }, 0, 0, w, h, tex, 1, rotation, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		// contain / scale-down (default)
		let scale = Math.min(w / imgW, h / imgH)
		if (fit === 'scale-down') scale = Math.min(1, scale)
		this.drawLocalTex(gl, { w: t.w, h: t.h }, 0, 0, imgW * scale, imgH * scale, tex, 1, rotation)
	}

	private resolveFilterQuality(filter: any): 'low' | 'mid' | 'high' {
		const q = String(filter?.quality ?? '')
		const v2 = !!filter?.qualityV2
		// v2 quality semantics:
		// - low: previous mid
		// - mid: previous high
		// - high: new higher quality
		if (v2) {
			if (q === 'low' || q === 'mid' || q === 'high') return q
			return 'mid'
		}
		// Legacy (v1) migration mapping (read-only): high -> mid, mid -> low.
		if (q === 'high') return 'mid'
		if (q === 'mid') return 'low'
		if (q === 'low') return 'low'
		return 'mid'
	}

	private getBlurParams(filter: any): { factor: number; baseIterations: number; maxStepPx: number; maxIterations: number } {
		const q = this.resolveFilterQuality(filter)
		if (q === 'high') {
			return { factor: 6, baseIterations: 6, maxStepPx: 6, maxIterations: 14 }
		}
		if (q === 'mid') {
			return { factor: 4, baseIterations: 4, maxStepPx: 8, maxIterations: 12 }
		}
		return { factor: 2, baseIterations: 2, maxStepPx: 10, maxIterations: 10 }
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
		// The shader samples at offsets 1/2/3 * (radius/it). Ensure the furthest tap doesn't jump too much.
		// If 3*sx <= step then sx <= step/3, so it >= 3*radius/step.
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

	private drawLocalRect(
		gl: WebGL2RenderingContext,
		size: { w: number; h: number },
		x: number,
		y: number,
		w: number,
		h: number,
		color: { r: number; g: number; b: number; a: number },
		rotation = 0
	) {
		if (!this.nodeProgColor || !this.nodeVbo) return
		const hw = w / 2
		const hh = h / 2
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const rot = (dx: number, dy: number) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos })
		const p0 = rot(-hw, -hh)
		const p1 = rot(hw, -hh)
		const p2 = rot(hw, hh)
		const p3 = rot(-hw, hh)
		const verts = new Float32Array([
			p0.x,
			p0.y,
			0,
			0,
			p1.x,
			p1.y,
			1,
			0,
			p2.x,
			p2.y,
			1,
			1,
			p0.x,
			p0.y,
			0,
			0,
			p2.x,
			p2.y,
			1,
			1,
			p3.x,
			p3.y,
			0,
			1,
		])
		gl.useProgram(this.nodeProgColor.program)
		const uRes = gl.getUniformLocation(this.nodeProgColor.program, 'u_resolution')
		const uColor = gl.getUniformLocation(this.nodeProgColor.program, 'u_color')
		gl.uniform2f(uRes!, size.w, size.h)
		gl.uniform4f(uColor!, color.r, color.g, color.b, color.a)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeVbo)
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(this.nodeProgColor.aPos)
		gl.vertexAttribPointer(this.nodeProgColor.aPos, 2, gl.FLOAT, false, 16, 0)
		const aUv = gl.getAttribLocation(this.nodeProgColor.program, 'a_uv')
		gl.enableVertexAttribArray(aUv)
		gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private drawLocalTex(
		gl: WebGL2RenderingContext,
		size: { w: number; h: number },
		x: number,
		y: number,
		w: number,
		h: number,
		tex: WebGLTexture,
		alpha: number,
		rotation = 0
	) {
		if (!this.nodeProgTex || !this.nodeVbo) return
		const hw = w / 2
		const hh = h / 2
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const rot = (dx: number, dy: number) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos })
		const p0 = rot(-hw, -hh)
		const p1 = rot(hw, -hh)
		const p2 = rot(hw, hh)
		const p3 = rot(-hw, hh)
		const verts = new Float32Array([
			p0.x,
			p0.y,
			0,
			0,
			p1.x,
			p1.y,
			1,
			0,
			p2.x,
			p2.y,
			1,
			1,
			p0.x,
			p0.y,
			0,
			0,
			p2.x,
			p2.y,
			1,
			1,
			p3.x,
			p3.y,
			0,
			1,
		])
		gl.useProgram(this.nodeProgTex.program)
		const uRes = gl.getUniformLocation(this.nodeProgTex.program, 'u_resolution')
		const uAlpha = gl.getUniformLocation(this.nodeProgTex.program, 'u_alpha')
		gl.uniform2f(uRes!, size.w, size.h)
		gl.uniform1f(uAlpha!, alpha)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.uniform1i(this.nodeProgTex.uSampler!, 0)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeVbo)
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(this.nodeProgTex.aPos)
		gl.vertexAttribPointer(this.nodeProgTex.aPos, 2, gl.FLOAT, false, 16, 0)
		const aUv = gl.getAttribLocation(this.nodeProgTex.program, 'a_uv')
		gl.enableVertexAttribArray(aUv)
		gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private drawLocalTexUv(
		gl: WebGL2RenderingContext,
		size: { w: number; h: number },
		x: number,
		y: number,
		w: number,
		h: number,
		tex: WebGLTexture,
		alpha: number,
		rotation: number,
		uv: { u0: number; v0: number; u1: number; v1: number }
	) {
		if (!this.nodeProgTex || !this.nodeVbo) return
		const hw = w / 2
		const hh = h / 2
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const rot = (dx: number, dy: number) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos })
		const p0 = rot(-hw, -hh)
		const p1 = rot(hw, -hh)
		const p2 = rot(hw, hh)
		const p3 = rot(-hw, hh)
		const verts = new Float32Array([
			p0.x,
			p0.y,
			uv.u0,
			uv.v0,
			p1.x,
			p1.y,
			uv.u1,
			uv.v0,
			p2.x,
			p2.y,
			uv.u1,
			uv.v1,
			p0.x,
			p0.y,
			uv.u0,
			uv.v0,
			p2.x,
			p2.y,
			uv.u1,
			uv.v1,
			p3.x,
			p3.y,
			uv.u0,
			uv.v1,
		])
		gl.useProgram(this.nodeProgTex.program)
		const uRes = gl.getUniformLocation(this.nodeProgTex.program, 'u_resolution')
		const uAlpha = gl.getUniformLocation(this.nodeProgTex.program, 'u_alpha')
		gl.uniform2f(uRes!, size.w, size.h)
		gl.uniform1f(uAlpha!, alpha)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.uniform1i(this.nodeProgTex.uSampler!, 0)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeVbo)
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(this.nodeProgTex.aPos)
		gl.vertexAttribPointer(this.nodeProgTex.aPos, 2, gl.FLOAT, false, 16, 0)
		const aUv = gl.getAttribLocation(this.nodeProgTex.program, 'a_uv')
		gl.enableVertexAttribArray(aUv)
		gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private drawPostPass(gl: WebGL2RenderingContext, prog: PostProg, src: WebGLTexture, dstFbo: WebGLFramebuffer, w: number, h: number, setup?: () => void) {
		if (!this.postVbo) return
		gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
		gl.viewport(0, 0, w, h)
		gl.useProgram(prog.program)
		const quad = new Float32Array([
			-1,
			-1,
			1,
			-1,
			1,
			1,
			-1,
			-1,
			1,
			1,
			-1,
			1,
		])
		gl.bindBuffer(gl.ARRAY_BUFFER, this.postVbo)
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(prog.aPos)
		gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 8, 0)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, src)
		if (prog.uSampler) gl.uniform1i(prog.uSampler, 0)
		setup?.()
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private getCustomProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
		const key = `${vertex}\n---\n${fragment}`
		const cached = this.postProgCustomCache.get(key)
		if (cached) return cached
		try {
			const prog = this.createProgram(gl, vertex, fragment, { aPos: 'a_position', uSampler: 'u_sampler', withSampler: true })
			// optional uniforms
			prog.uTexel = gl.getUniformLocation(prog.program, 'u_texel')
			const it = { prog, ok: true, log: gl.getProgramInfoLog(prog.program) || '' }
			this.postProgCustomCache.set(key, it)
			return it
		} catch (e: any) {
			const dummy: any = { prog: null, ok: false, log: String(e?.message ?? e) }
			this.postProgCustomCache.set(key, dummy)
			return dummy
		}
	}

	private walkBuildRenderOrder(layerId: string, node: VideoSceneTreeNode, parentWorld: Vec2, out: RenderNode[]) {
		const hasTransform = !!node.transform
		const nodeWorld = hasTransform
			? { x: parentWorld.x + (node.transform?.x ?? 0), y: parentWorld.y + (node.transform?.y ?? 0) }
			: parentWorld
		const nextParentWorld = hasTransform ? nodeWorld : parentWorld

		if (node.category === 'user' && node.transform) {
			const type = (node.userType ?? 'base') as VideoSceneUserNodeType
			const props: any = node.props ?? {}
			let imageSrc = props?.imagePath
			const imageId = String(props?.imageId ?? '').trim()
			if (imageId && this.state?.imageAssets?.[imageId]?.url) {
				imageSrc = this.state.imageAssets[imageId].url
			}
			out.push({
				layerId,
				id: node.id,
				type,
				transform: {
					...node.transform,
					x: nodeWorld.x,
					y: nodeWorld.y,
					rotation: (node.transform as any).rotation ?? 0,
					opacity: (node.transform as any).opacity ?? 1,
				},
				props,
				text: node.props?.textContent,
				fontSize: node.props?.fontSize,
				imageSrc,
			})
		}

		if (node.children?.length) {
			for (const child of node.children) {
				this.walkBuildRenderOrder(layerId, child, nextParentWorld, out)
			}
		}
	}

	// findNode 已不再需要：renderOrder 通过一次 DFS 构建

	render(canvas: DwebCanvasGL): void {
		const gl = canvas.getGL()
		this.ensurePostResources(gl)

		// --- canvas background grid (for positioning) ---
		const { width: screenW, height: screenH } = canvas.size
		const tl = canvas.screenToWorld({ x: 0, y: 0 })
		const br = canvas.screenToWorld({ x: screenW, y: screenH })
		const minX = Math.min(tl.x, br.x)
		const maxX = Math.max(tl.x, br.x)
		const minY = Math.min(tl.y, br.y)
		const maxY = Math.max(tl.y, br.y)
		canvas.drawRect((minX + maxX) / 2, (minY + maxY) / 2, maxX - minX, maxY - minY, themeRgba.bg(1))
		const gridStep = 80
		const gridColor = themeRgba.border(0.35)
		const gridW = 1 / canvas.viewport.zoom
		const startX = Math.floor(minX / gridStep) * gridStep
		const endX = Math.ceil(maxX / gridStep) * gridStep
		for (let x = startX; x <= endX; x += gridStep) {
			canvas.drawRect(x, (minY + maxY) / 2, gridW, maxY - minY, gridColor)
		}
		const startY = Math.floor(minY / gridStep) * gridStep
		const endY = Math.ceil(maxY / gridStep) * gridStep
		for (let y = startY; y <= endY; y += gridStep) {
			canvas.drawRect((minX + maxX) / 2, y, maxX - minX, gridW, gridColor)
		}

		// --- stage background (aspect ratio / size defined by stageSize) ---
		const bgOpacity = Math.max(0, Math.min(1, Number(this.stageBackground.opacity ?? 1)))
		const stageBgColor = this.parseHexColor(this.stageBackground.color || '#111111', bgOpacity)
		canvas.drawRect(0, 0, this.stageSize.width, this.stageSize.height, stageBgColor)
		if (this.stageBackground.type === 'image') {
			this.drawStageBackgroundImage(gl, canvas, bgOpacity)
		}
		// stage border (1px in screen space)
		const borderW = 1 / canvas.viewport.zoom
		canvas.drawRect(0, -this.stageSize.height / 2 + borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(0, this.stageSize.height / 2 - borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(-this.stageSize.width / 2 + borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))
		canvas.drawRect(this.stageSize.width / 2 - borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))

		// user nodes in order
		for (const n of this.renderOrder) {
			const rotation = (n.transform as any).rotation ?? 0
			const opacity = Math.max(0, Math.min(1, (n.transform as any).opacity ?? 1))
			const nodeFilters: any[] = Array.isArray((n.props as any)?.filters) ? ((n.props as any).filters as any[]) : []
			const hasFilters = nodeFilters.length > 0
			const nodeW = n.transform.width
			const nodeH = n.transform.height
			if (hasFilters) {
				// compute required padding so blur/glow can extend outside node bounds (Flash-like)
				let maxX = 0
				let maxY = 0
				let maxQuality = 1
				for (const f of nodeFilters) {
					const ft = String(f?.type || '')
					if (ft === 'blur' || ft === 'glow') {
						const p = this.getBlurParams(f)
						// blurX/blurY are in node pixel space (stage units). Viewport zoom naturally scales the final result.
						maxX = Math.max(maxX, Math.max(0, Number(f.blurX ?? 0) || 0) * p.factor)
						maxY = Math.max(maxY, Math.max(0, Number(f.blurY ?? 0) || 0) * p.factor)
						maxQuality = Math.max(maxQuality, p.factor)
					}
				}
				const padX = Math.min(512, Math.ceil(maxX * maxQuality) + 6)
				const padY = Math.min(512, Math.ceil(maxY * maxQuality) + 6)
				const t = this.ensureFilterTargetsWithPadding(gl, n.id, nodeW, nodeH, padX, padY)

				const prevBlend = gl.isEnabled(gl.BLEND)
				gl.disable(gl.BLEND)
				this.drawNodeToTarget(gl, canvas, { ...n, transform: { ...n.transform, width: nodeW, height: nodeH } }, t)

				let currentTex: WebGLTexture = t.tex0
				for (const f of nodeFilters) {
					const ft = String(f?.type || '')
					if (ft === 'blur') {
						const p = this.getBlurParams(f)
						const blurX = Math.max(0, Number(f.blurX ?? 0) || 0) * p.factor
						const blurY = Math.max(0, Number(f.blurY ?? 0) || 0) * p.factor
						const iterations = p.baseIterations
						// alternate buffers to avoid read/write same texture
						if (currentTex === t.tex0) {
							currentTex = this.blurInto(gl, t, currentTex, t.fbo1, t.tex1, t.fbo2, t.tex2, blurX, blurY, iterations, p.maxStepPx, p.maxIterations)
						} else if (currentTex === t.tex1) {
							currentTex = this.blurInto(gl, t, currentTex, t.fbo0, t.tex0, t.fbo2, t.tex2, blurX, blurY, iterations, p.maxStepPx, p.maxIterations)
						} else {
							currentTex = this.blurInto(gl, t, currentTex, t.fbo1, t.tex1, t.fbo0, t.tex0, blurX, blurY, iterations, p.maxStepPx, p.maxIterations)
						}
						continue
					}
					if (ft === 'glow') {
						if (!this.postProgGlowComposite) continue
						const p = this.getBlurParams(f)
						const blurX = Math.max(0, Number(f.blurX ?? 0) || 0) * p.factor
						const blurY = Math.max(0, Number(f.blurY ?? 0) || 0) * p.factor
						const iterations = p.baseIterations
						// ping-pong to avoid read/write same texture when stacking glows
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
							p.maxStepPx,
							p.maxIterations
						)

						// composite current + blurred into outTex
						gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo)
						gl.viewport(0, 0, t.w, t.h)
						gl.useProgram(this.postProgGlowComposite.program)
						// fullscreen quad
						const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
						gl.bindBuffer(gl.ARRAY_BUFFER, this.postVbo!)
						gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
						gl.enableVertexAttribArray(this.postProgGlowComposite.aPos)
						gl.vertexAttribPointer(this.postProgGlowComposite.aPos, 2, gl.FLOAT, false, 8, 0)
						gl.activeTexture(gl.TEXTURE0)
						gl.bindTexture(gl.TEXTURE_2D, currentTex)
						gl.uniform1i(this.postProgGlowComposite.uSampler!, 0)
						gl.activeTexture(gl.TEXTURE1)
						gl.bindTexture(gl.TEXTURE_2D, blurredTex)
						gl.uniform1i(this.postProgGlowComposite.uSampler2!, 1)
						const color = this.parseHexColor(String(f.color ?? '#ffffff'), 1)
						gl.uniform3f(this.postProgGlowComposite.uColor!, color.r, color.g, color.b)
						gl.uniform1f(this.postProgGlowComposite.uIntensity!, Math.max(0, Number(f.intensity ?? 1)))
						gl.uniform1f(this.postProgGlowComposite.uInner!, f.inner ? 1 : 0)
						gl.uniform1f(this.postProgGlowComposite.uKnockout!, f.knockout ? 1 : 0)
						gl.drawArrays(gl.TRIANGLES, 0, 6)
						currentTex = outTex
						continue
					}
					if (ft === 'customShader') {
						const code = this.getCustomProgram(gl, String(f.vertex ?? ''), String(f.fragment ?? '')) as any
						if (!code?.ok || !code?.prog) continue
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
							// optional u_texel
							if (code.prog.uTexel) gl.uniform2f(code.prog.uTexel, 1 / t.w, 1 / t.h)
						})
						currentTex = dstTex
						continue
					}
				}

				// restore main framebuffer viewport
				gl.bindFramebuffer(gl.FRAMEBUFFER, null)
				gl.viewport(0, 0, (gl.canvas as HTMLCanvasElement).width, (gl.canvas as HTMLCanvasElement).height)
				if (prevBlend) gl.enable(gl.BLEND)
				// Textures rendered via FBO use the standard GL texture coordinate origin.
				// Our engine's default quad UV treats v=0 as TOP for DOM-uploaded textures.
				// Flip V here to keep filtered output upright (fixes blur causing text to flip vertically).
				canvas.drawTexturedRectUv(
					n.transform.x,
					n.transform.y,
					nodeW + padX * 2,
					nodeH + padY * 2,
					currentTex,
					opacity,
					rotation,
					{ u0: 0, v0: 1, u1: 1, v1: 0 }
				)
				continue
			}

			if (n.type === 'base') {
				canvas.drawRect(n.transform.x, n.transform.y, n.transform.width, n.transform.height, themeRgba.border(0.25 * opacity), rotation)
				canvas.drawRect(
					n.transform.x,
					n.transform.y,
					n.transform.width,
					Math.max(borderW, 1 / canvas.viewport.zoom),
					themeRgba.border(0.7 * opacity),
					rotation
				)
				continue
			}
			if (n.type === 'rect') {
				const cx = n.transform.x
				const cy = n.transform.y
				const w = n.transform.width
				const h = n.transform.height
				const fillOpacity = Math.max(0, Math.min(1, Number(n.props?.fillOpacity ?? 1)))
				const borderOpacity = Math.max(0, Math.min(1, Number(n.props?.borderOpacity ?? 1)))
				const fillA = Math.max(0, Math.min(1, opacity * fillOpacity))
				const borderA = Math.max(0, Math.min(1, opacity * borderOpacity))
				const cornerRadius = Math.max(0, Number(n.props?.cornerRadius ?? 0))
				if (cornerRadius > 0.5) {
					if (fillA > 0) {
						const fillTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'fill')
						canvas.drawTexturedRect(cx, cy, w, h, fillTex, fillA, rotation)
					}
					const borderPx0 = Math.max(0, Number(n.props?.borderWidth ?? 1))
					if (borderPx0 > 0 && borderA > 0) {
						const strokeTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'stroke')
						canvas.drawTexturedRect(cx, cy, w, h, strokeTex, borderA, rotation)
					}
					continue
				}
				if (fillA > 0) {
					const fillColor = this.parseHexColor(n.props?.fillColor ?? '#3aa1ff', fillA)
					canvas.drawRect(cx, cy, w, h, fillColor, rotation)
				}

				const borderPx = Math.max(0, Number(n.props?.borderWidth ?? 1))
				let bw = borderPx / canvas.viewport.zoom
				bw = Math.max(0, Math.min(bw, Math.min(w, h) / 2))
				if (bw > 0 && borderA > 0) {
					const borderColor = this.parseHexColor(n.props?.borderColor ?? '#9cdcfe', borderA)
					const cos = Math.cos(rotation)
					const sin = Math.sin(rotation)
					const ro = (ox: number, oy: number) => ({ x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos })

					const top = ro(0, -h / 2 + bw / 2)
					canvas.drawRect(top.x, top.y, w, bw, borderColor, rotation)
					const bottom = ro(0, h / 2 - bw / 2)
					canvas.drawRect(bottom.x, bottom.y, w, bw, borderColor, rotation)
					const left = ro(-w / 2 + bw / 2, 0)
					canvas.drawRect(left.x, left.y, bw, h, borderColor, rotation)
					const right = ro(w / 2 - bw / 2, 0)
					canvas.drawRect(right.x, right.y, bw, h, borderColor, rotation)
				}
				continue
			}
			if (n.type === 'text') {
				const tex = this.getTextTexture(gl, canvas, n)
				canvas.drawTexturedRect(n.transform.x, n.transform.y, n.transform.width, n.transform.height, tex, opacity, rotation)
				continue
			}
			// image
			const src = (n.imageSrc ?? '').trim()
			const tex = this.getImageTexture(gl, canvas, n)
			const size = src ? this.imagePool.getSize(src) : null
			const imgW = Math.max(1, size?.width ?? 1)
			const imgH = Math.max(1, size?.height ?? 1)
			const fit = ((n.props as any)?.imageFit ?? 'contain') as 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
			const cx = n.transform.x
			const cy = n.transform.y
			const w = Math.max(1, n.transform.width)
			const h = Math.max(1, n.transform.height)

			if (fit === 'fill') {
				canvas.drawTexturedRect(cx, cy, w, h, tex, opacity, rotation)
				continue
			}

			if (fit === 'cover') {
				const scale = Math.max(w / imgW, h / imgH)
				const scaledW = imgW * scale
				const scaledH = imgH * scale
				const visU = Math.min(1, w / scaledW)
				const visV = Math.min(1, h / scaledH)
				const u0 = (1 - visU) / 2
				const v0 = (1 - visV) / 2
				canvas.drawTexturedRectUv(cx, cy, w, h, tex, opacity, rotation, { u0, v0, u1: u0 + visU, v1: v0 + visV })
				continue
			}

			if (fit === 'none') {
				// draw at natural size; if exceeds node rect, center-crop into node rect
				if (imgW <= w && imgH <= h) {
					canvas.drawTexturedRect(cx, cy, imgW, imgH, tex, opacity, rotation)
					continue
				}
				const visU = Math.min(1, w / imgW)
				const visV = Math.min(1, h / imgH)
				const u0 = (1 - visU) / 2
				const v0 = (1 - visV) / 2
				canvas.drawTexturedRectUv(cx, cy, w, h, tex, opacity, rotation, { u0, v0, u1: u0 + visU, v1: v0 + visV })
				continue
			}

			// contain / scale-down (default)
			let scale = Math.min(w / imgW, h / imgH)
			if (fit === 'scale-down') scale = Math.min(1, scale)
			canvas.drawTexturedRect(cx, cy, imgW * scale, imgH * scale, tex, opacity, rotation)
		}
	}

	private drawStageBackgroundImage(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, opacity: number) {
		const src = (this.stageBackground.imageSrc || '').trim()
		if (!src) return
		const wrap = this.stageBackground.repeat ? 'repeat' : 'clamp'
		const tex = this.imagePool.getTexture(gl, canvas, src, wrap)
		const size = this.imagePool.getSize(src)
		const imgW = Math.max(1, size?.width ?? 1)
		const imgH = Math.max(1, size?.height ?? 1)
		const stageW = this.stageSize.width
		const stageH = this.stageSize.height

		if (this.stageBackground.repeat) {
			const u1 = stageW / imgW
			const v1 = stageH / imgH
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0: 0, v0: 0, u1, v1 })
			return
		}

		const fit = this.stageBackground.imageFit
		if (fit === 'fill') {
			canvas.drawTexturedRect(0, 0, stageW, stageH, tex, opacity, 0)
			return
		}

		if (fit === 'cover') {
			const scale = Math.max(stageW / imgW, stageH / imgH)
			const scaledW = imgW * scale
			const scaledH = imgH * scale
			const visU = Math.min(1, stageW / scaledW)
			const visV = Math.min(1, stageH / scaledH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		if (fit === 'none') {
			if (imgW <= stageW && imgH <= stageH) {
				canvas.drawTexturedRect(0, 0, imgW, imgH, tex, opacity, 0)
				return
			}
			const visU = Math.min(1, stageW / imgW)
			const visV = Math.min(1, stageH / imgH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		// contain / scale-down (default)
		let scale = Math.min(stageW / imgW, stageH / imgH)
		if (fit === 'scale-down') scale = Math.min(1, scale)
		canvas.drawTexturedRect(0, 0, imgW * scale, imgH * scale, tex, opacity, 0)
	}

	hitTest(canvas: DwebCanvasGL, screenPoint: Vec2): HitTestResult | null {
		const world = canvas.screenToWorld(screenPoint)
		for (let i = this.renderOrder.length - 1; i >= 0; i--) {
			const n = this.renderOrder[i]
			const rotation = (n.transform as any).rotation ?? 0
			const w = n.transform.width
			const h = n.transform.height
			// hitTest: 旋转矩形，先把点旋回局部坐标再做 AABB
			const cos = Math.cos(-rotation)
			const sin = Math.sin(-rotation)
			const dx = world.x - n.transform.x
			const dy = world.y - n.transform.y
			const lx = dx * cos - dy * sin
			const ly = dx * sin + dy * cos
			const x0 = -w / 2
			const x1 = w / 2
			const y0 = -h / 2
			const y1 = h / 2
			if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) return { layerId: n.layerId, nodeId: n.id }
		}
		return null
	}

	private getTextTexture(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, n: RenderNode): WebGLTexture {
		const fontColor = n.props?.fontColor ?? '#ffffff'
		const fontStyle = n.props?.fontStyle ?? 'normal'
		const key = `text:${n.id}:${n.text ?? ''}:${n.fontSize ?? 24}:${fontColor}:${fontStyle}:${n.transform.width}:${n.transform.height}`
		let tex = this.textures.get(key)
		if (tex) return tex
		// purge old textures for same node id
		for (const k of this.textures.keys()) {
			if (k.startsWith(`text:${n.id}:`)) {
				gl.deleteTexture(this.textures.get(k)!)
				this.textures.delete(k)
			}
		}

		tex = gl.createTexture()!
		this.textCanvas.width = Math.max(1, Math.floor(n.transform.width))
		this.textCanvas.height = Math.max(1, Math.floor(n.transform.height))
		const ctx = this.textCtx
		ctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height)
		ctx.fillStyle = 'rgba(0,0,0,0)'
		ctx.fillRect(0, 0, this.textCanvas.width, this.textCanvas.height)
		ctx.fillStyle = String(fontColor)
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'center'
		const fontSize = Number(n.fontSize ?? 24)
		ctx.font = `${String(fontStyle)} ${fontSize}px sans-serif`
		const text = String(n.text ?? 'Text')
		const lines = text.split(/\r?\n/)
		const lineH = fontSize * 1.2
		const totalH = Math.max(1, lines.length) * lineH
		let y = this.textCanvas.height / 2 - totalH / 2 + lineH / 2
		for (const line of lines) {
			ctx.fillText(line, this.textCanvas.width / 2, y)
			y += lineH
		}
		canvas.updateTextureFromCanvas(tex, this.textCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}

	private getImageTexture(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, n: RenderNode): WebGLTexture {
		const src = (n.imageSrc ?? '').trim()
		if (!src) {
			// placeholder: gray
			const key = `img:${n.id}:__placeholder__`
			let tex = this.textures.get(key)
			if (tex) return tex
			tex = canvas.createSolidTexture({ r: 0.6, g: 0.6, b: 0.6, a: 1 })
			this.textures.set(key, tex)
			return tex
		}
		return this.imagePool.getTexture(gl, canvas, src, 'clamp')
	}
}

