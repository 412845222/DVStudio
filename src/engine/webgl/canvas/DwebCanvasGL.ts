import {
	applyFitToStage,
	applyPanBy,
	applyZoomAt,
	screenToWorld as screenToWorldImpl,
	worldToScreen as worldToScreenImpl,
	type Vec2,
	type ViewportInset,
	type ViewportState,
} from '../camera'
import { previewCompileAndLinkProgram, compileShader, linkProgram } from '../pipeline'
import { fsBasicColor, fsBasicTexture, fsRoundedRect, vsBasic2d } from '../material'
import { DwebImagePool, type DwebImageWrapMode } from '../resources/DwebImagePool'
import { createSolidTexture, setTextureWrap as setTextureWrapImpl, updateTextureFromCanvas as updateTextureFromCanvasImpl } from '../texture'
import { CanvasPostProcess } from './postprocess/pipeline'

export type { Vec2, ViewportInset, ViewportState } from '../camera'

export type RGBA = { r: number; g: number; b: number; a: number }

export type TextureWrapMode = 'clamp' | 'repeat'

export type UvRect = { u0: number; v0: number; u1: number; v1: number }

const cssVarColor = (name: string, fallbackHex: string): string => {
	const v = (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim()
	return v || fallbackHex
}

const hexToRgba = (hex: string, alpha = 1): RGBA => {
	const h = hex.replace('#', '').trim()
	const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
	if (!Number.isFinite(n)) return { r: 1, g: 1, b: 1, a: alpha }
	return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha }
}

export interface IDwebGLScene {
	render(canvas: DwebCanvasGL): void
}

type LocalProgramInfo = {
	program: WebGLProgram
	aPos: number
	aUv: number
	uResolution: WebGLUniformLocation
	uColor?: WebGLUniformLocation
	uSampler?: WebGLUniformLocation
	uAlpha?: WebGLUniformLocation
	uSize?: WebGLUniformLocation
	uRadius?: WebGLUniformLocation
	uBorderWidth?: WebGLUniformLocation
	uFillColor?: WebGLUniformLocation
	uBorderColor?: WebGLUniformLocation
}

type ProgramInfo = {
	program: WebGLProgram
	aPos: number
	aUv: number
	uResolution: WebGLUniformLocation
	uPan: WebGLUniformLocation
	uZoom: WebGLUniformLocation
	uColor?: WebGLUniformLocation
	uSampler?: WebGLUniformLocation
	uAlpha?: WebGLUniformLocation
}

type RoundedRectProgramInfo = {
	program: WebGLProgram
	aPos: number
	aUv: number
	uResolution: WebGLUniformLocation
	uPan: WebGLUniformLocation
	uZoom: WebGLUniformLocation
	uSize: WebGLUniformLocation
	uRadius: WebGLUniformLocation
	uBorderWidth: WebGLUniformLocation
	uFillColor: WebGLUniformLocation
	uBorderColor: WebGLUniformLocation
}

export class DwebCanvasGL {
	private canvas: HTMLCanvasElement
	private gl: WebGL2RenderingContext
	private dpr = 1

	viewport: ViewportState = { pan: { x: 0, y: 0 }, zoom: 1 }
	onViewportChange?: (viewport: ViewportState) => void

	private rafId: number | null = null
	private isDisposed = false

	private scene: IDwebGLScene | null = null

	private vbo: WebGLBuffer
	private colorProg: ProgramInfo
	private texProg: ProgramInfo
	private roundedRectProg: RoundedRectProgramInfo
	private whiteTex: WebGLTexture
	private imagePool = new DwebImagePool()
	private postprocess = new CanvasPostProcess()
	private filterNodePressure = 0

	// local-space programs (for offscreen filter targets)
	private localVbo: WebGLBuffer
	private localProgColor: LocalProgramInfo
	private localProgTex: LocalProgramInfo
	private localProgRoundedRect: LocalProgramInfo

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false })
		if (!gl) throw new Error('WebGL2 context is not available')
		this.gl = gl

		this.vbo = gl.createBuffer()!
		this.localVbo = gl.createBuffer()!
		this.colorProg = this.createProgram(vsBasic2d, fsBasicColor, true)
		this.texProg = this.createProgram(vsBasic2d, fsBasicTexture, false)
		this.roundedRectProg = this.createRoundedRectProgram(vsBasic2d, fsRoundedRect)
		this.localProgColor = this.createLocalProgram(this.vsLocal2d(), this.fsLocalColor(), { kind: 'color' })
		this.localProgTex = this.createLocalProgram(this.vsLocal2d(), this.fsLocalTex(), { kind: 'tex' })
		this.localProgRoundedRect = this.createLocalProgram(this.vsLocal2d(), fsRoundedRect, { kind: 'roundedRect' })

		this.whiteTex = this.createSolidTexture({ r: 1, g: 1, b: 1, a: 1 })
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
	}

	dispose() {
		this.isDisposed = true
		if (this.rafId != null) cancelAnimationFrame(this.rafId)
		this.rafId = null
		try {
			this.postprocess.dispose(this.gl)
			this.gl.deleteBuffer(this.vbo)
			this.gl.deleteBuffer(this.localVbo)
			this.gl.deleteTexture(this.whiteTex)
			this.gl.deleteProgram(this.colorProg.program)
			this.gl.deleteProgram(this.texProg.program)
			this.gl.deleteProgram(this.roundedRectProg.program)
			this.gl.deleteProgram(this.localProgColor.program)
			this.gl.deleteProgram(this.localProgTex.program)
			this.gl.deleteProgram(this.localProgRoundedRect.program)
		} catch {
			// ignore
		}
	}

	pruneFilterTargets(validNodeIds: Set<string>) {
		this.postprocess.prune(this.gl, validNodeIds)
	}

	applyFilters(
		id: string,
		contentW: number,
		contentH: number,
		padX: number,
		padY: number,
		filters: any[],
		renderLocal: (target: { w: number; h: number; contentW: number; contentH: number }) => void
	): { tex: WebGLTexture; padX: number; padY: number } {
		return this.postprocess.applyFilters(this.gl, this, id, contentW, contentH, padX, padY, filters, renderLocal)
	}

	setScene(scene: IDwebGLScene | null) {
		this.scene = scene
		this.requestRender()
	}

	setSize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
		this.dpr = dpr
		this.canvas.width = Math.max(1, Math.floor(width * dpr))
		this.canvas.height = Math.max(1, Math.floor(height * dpr))
		this.canvas.style.width = `${Math.max(1, Math.floor(width))}px`
		this.canvas.style.height = `${Math.max(1, Math.floor(height))}px`
		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
		this.requestRender()
	}

	getPixelRatio() {
		return this.dpr
	}

	/**
	 * Offscreen filter targets scale in pixels-per-world-unit.
	 * We use viewport zoom to keep filter results stable in screen space,
	 * and DPR to keep results crisp on HiDPI.
	 */
	getFilterScale() {
		const base = this.viewport.zoom * this.dpr
		// Under heavy filter load (e.g. many glow/blur lines), clamp scale to prevent
		// runaway offscreen allocations and GPU time. This is a controlled quality downgrade.
		let cap = Number.POSITIVE_INFINITY
		if (this.filterNodePressure >= 80) cap = 1.25 * this.dpr
		else if (this.filterNodePressure >= 40) cap = 1.75 * this.dpr
		return Math.max(1e-3, Math.min(base, cap))
	}

	/**
	 * Hint current frame filter pressure (number of nodes with expensive filters).
	 * Used to auto-downgrade offscreen scale for stability.
	 */
	setFilterNodePressure(count: number) {
		this.filterNodePressure = Math.max(0, Math.floor(Number(count) || 0))
	}

	get size() {
		return { width: this.canvas.width / this.dpr, height: this.canvas.height / this.dpr }
	}

	screenToWorld(p: Vec2): Vec2 {
		return screenToWorldImpl(this.viewport, p)
	}

	worldToScreen(p: Vec2): Vec2 {
		return worldToScreenImpl(this.viewport, p)
	}

	panBy(delta: Vec2) {
		applyPanBy(this.viewport, delta)
		this.onViewportChange?.(this.viewport)
		this.requestRender()
	}

	zoomAt(screenPoint: Vec2, nextZoom: number) {
		const changed = applyZoomAt(this.viewport, screenPoint, nextZoom)
		if (!changed) return
		this.onViewportChange?.(this.viewport)
		this.requestRender()
	}

	fitToStage(stageSize: { width: number; height: number }, paddingPx = 24, inset: ViewportInset = {}) {
		applyFitToStage(this.viewport, this.size, stageSize, paddingPx, inset)
		this.onViewportChange?.(this.viewport)
		this.requestRender()
	}

	requestRender() {
		if (this.isDisposed) return
		if (this.rafId != null) return
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null
			this.render()
		})
	}

	render() {
		const gl = this.gl
		gl.viewport(0, 0, this.canvas.width, this.canvas.height)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		this.scene?.render(this)
	}

	// ----- Drawing helpers -----

	// 不再对外暴露 gl：scene 层不应该直接操作 WebGL。

	/**
	 * 受控的 shader 预览编译：仅编译+链接，返回 ok/log。
	 * 不会缓存 program，也不执行绘制。
	 */
	compileAndLinkProgram(vertexSource: string, fragmentSource: string): { ok: boolean; log: string } {
		return previewCompileAndLinkProgram(this.gl, vertexSource, fragmentSource)
	}

	getThemeColor(name: '--vscode-border-accent' | '--vscode-border' | '--dweb-defualt-dark' | '--dweb-defualt') {
		if (name === '--vscode-border-accent') return cssVarColor(name, '#3aa8b4')
		if (name === '--vscode-border') return cssVarColor(name, '#2b2b2b')
		if (name === '--dweb-defualt-dark') return cssVarColor(name, '#1f1f1f')
		return cssVarColor(name, '#111111')
	}

	parseHexColor(hex: string, alpha = 1): RGBA {
		const h = (hex || '').trim()
		const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(h)
		if (!m) return themeRgba.accent(alpha)
		return hexToRgba(m[0].startsWith('#') ? m[0] : `#${m[0]}`, alpha)
	}

	createTexture(): WebGLTexture {
		return this.gl.createTexture()!
	}

	deleteTexture(tex: WebGLTexture) {
		try {
			this.gl.deleteTexture(tex)
		} catch {
			// ignore
		}
	}

	updateTextureFromImage(tex: WebGLTexture, img: TexImageSource, options?: { wrap?: TextureWrapMode }) {
		const gl = this.gl
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		const wrap = options?.wrap ?? 'clamp'
		const mode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
	}

	initTexture1x1Transparent(tex: WebGLTexture, wrap: TextureWrapMode = 'clamp') {
		const gl = this.gl
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		const mode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
	}

	getImageTexture(src: string, wrap: DwebImageWrapMode = 'clamp'): WebGLTexture {
		return this.imagePool.getTexture(this.gl, this, src, wrap)
	}

	getImageSize(src: string): { width: number; height: number } | null {
		return this.imagePool.getSize(src)
	}

	drawRect(x: number, y: number, w: number, h: number, color: RGBA, rotation = 0) {
		this.drawQuad(x, y, w, h, color, rotation)
	}

	drawTexturedRect(x: number, y: number, w: number, h: number, texture: WebGLTexture, opacity = 1, rotation = 0) {
		const gl = this.gl
		this.useProgram(this.texProg)
		this.setCommonUniforms(this.texProg)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.uniform1i(this.texProg.uSampler!, 0)
		gl.uniform1f(this.texProg.uAlpha!, opacity)
		this.uploadQuadVerts(x, y, w, h, rotation)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	drawTexturedRectUv(
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity: number,
		rotation: number,
		uv: UvRect
	) {
		const gl = this.gl
		this.useProgram(this.texProg)
		this.setCommonUniforms(this.texProg)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.uniform1i(this.texProg.uSampler!, 0)
		gl.uniform1f(this.texProg.uAlpha!, opacity)
		this.uploadQuadVerts(x, y, w, h, rotation, uv)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	/**
	 * 纯 WebGL 圆角矩形：支持 fill + border（无需 Canvas2D）。
	 * - size/radius/borderWidth 均为 world units（stage units）。
	 */
	drawRoundedRect(
		x: number,
		y: number,
		w: number,
		h: number,
		radius: number,
		fillColor: RGBA,
		borderColor: RGBA,
		borderWidth: number,
		rotation = 0
	) {
		const gl = this.gl
		this.useRoundedRectProgram(this.roundedRectProg)
		this.setCommonUniforms(this.roundedRectProg)
		gl.uniform2f(this.roundedRectProg.uSize, Math.max(1, w), Math.max(1, h))
		gl.uniform1f(this.roundedRectProg.uRadius, Math.max(0, radius))
		gl.uniform1f(this.roundedRectProg.uBorderWidth, Math.max(0, borderWidth))
		gl.uniform4f(this.roundedRectProg.uFillColor, fillColor.r, fillColor.g, fillColor.b, fillColor.a)
		gl.uniform4f(this.roundedRectProg.uBorderColor, borderColor.r, borderColor.g, borderColor.b, borderColor.a)
		this.uploadQuadVerts(x, y, w, h, rotation)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	// ----- Local drawing helpers (for offscreen targets) -----

	drawLocalRect(target: { w: number; h: number; scale?: number }, x: number, y: number, w: number, h: number, color: RGBA, rotation = 0) {
		this.drawLocalQuad(target, x, y, w, h, color, rotation)
	}

	drawLocalTexturedRect(
		target: { w: number; h: number; scale?: number },
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity = 1,
		rotation = 0
	) {
		const gl = this.gl
		gl.useProgram(this.localProgTex.program)
		gl.uniform2f(this.localProgTex.uResolution!, target.w, target.h)
		gl.uniform1f(this.localProgTex.uAlpha!, opacity)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.uniform1i(this.localProgTex.uSampler!, 0)
		this.uploadLocalQuadVerts(this.localProgTex, x, y, w, h, rotation, undefined, target.scale)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	drawLocalTexturedRectUv(
		target: { w: number; h: number; scale?: number },
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity: number,
		rotation: number,
		uv: UvRect
	) {
		const gl = this.gl
		gl.useProgram(this.localProgTex.program)
		gl.uniform2f(this.localProgTex.uResolution!, target.w, target.h)
		gl.uniform1f(this.localProgTex.uAlpha!, opacity)
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.uniform1i(this.localProgTex.uSampler!, 0)
		this.uploadLocalQuadVerts(this.localProgTex, x, y, w, h, rotation, uv, target.scale)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	drawLocalRoundedRect(
		target: { w: number; h: number; scale?: number },
		x: number,
		y: number,
		w: number,
		h: number,
		radius: number,
		fillColor: RGBA,
		borderColor: RGBA,
		borderWidth: number,
		rotation = 0
	) {
		const scale = Math.max(1e-3, target.scale ?? 1)
		const gl = this.gl
		gl.useProgram(this.localProgRoundedRect.program)
		gl.uniform2f(this.localProgRoundedRect.uResolution!, target.w, target.h)
		gl.uniform2f(this.localProgRoundedRect.uSize!, Math.max(1, w * scale), Math.max(1, h * scale))
		gl.uniform1f(this.localProgRoundedRect.uRadius!, Math.max(0, radius * scale))
		gl.uniform1f(this.localProgRoundedRect.uBorderWidth!, Math.max(0, borderWidth * scale))
		gl.uniform4f(this.localProgRoundedRect.uFillColor!, fillColor.r, fillColor.g, fillColor.b, fillColor.a)
		gl.uniform4f(this.localProgRoundedRect.uBorderColor!, borderColor.r, borderColor.g, borderColor.b, borderColor.a)
		this.uploadLocalQuadVerts(this.localProgRoundedRect, x, y, w, h, rotation, undefined, target.scale)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	createSolidTexture(color: RGBA) {
		return createSolidTexture(this.gl, color)
	}

	setTextureWrap(tex: WebGLTexture, wrap: TextureWrapMode) {
		setTextureWrapImpl(this.gl, tex, wrap)
	}

	create1x1TransparentCanvas() {
		const c = document.createElement('canvas')
		c.width = 1
		c.height = 1
		const ctx = c.getContext('2d')
		if (ctx) ctx.clearRect(0, 0, 1, 1)
		return c
	}

	updateTextureFromCanvas(tex: WebGLTexture, canvas: HTMLCanvasElement, options?: { wrap?: TextureWrapMode }) {
		updateTextureFromCanvasImpl(this.gl, tex, canvas, options)
	}

	getWhiteTexture() {
		return this.whiteTex
	}

	private drawQuad(x: number, y: number, w: number, h: number, color: RGBA, rotation = 0) {
		const gl = this.gl
		this.useProgram(this.colorProg)
		this.setCommonUniforms(this.colorProg)
		gl.uniform4f(this.colorProg.uColor!, color.r, color.g, color.b, color.a)
		this.uploadQuadVerts(x, y, w, h, rotation)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private uploadQuadVerts(x: number, y: number, w: number, h: number, rotation = 0, uv?: UvRect) {
		// (x,y) as center in world
		const hw = w / 2
		const hh = h / 2
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const rot = (dx: number, dy: number) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos })
		const p0 = rot(-hw, -hh)
		const p1 = rot(hw, -hh)
		const p2 = rot(hw, hh)
		const p3 = rot(-hw, hh)
		const u0 = uv?.u0 ?? 0
		const v0 = uv?.v0 ?? 0
		const u1 = uv?.u1 ?? 1
		const v1 = uv?.v1 ?? 1
		// triangles: p0-p1-p2 and p0-p2-p3
		const verts = new Float32Array([
			p0.x,
			p0.y,
			u0,
			v0,
			p1.x,
			p1.y,
			u1,
			v0,
			p2.x,
			p2.y,
			u1,
			v1,
			p0.x,
			p0.y,
			u0,
			v0,
			p2.x,
			p2.y,
			u1,
			v1,
			p3.x,
			p3.y,
			u0,
			v1,
		])
		const gl = this.gl
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(this.colorProg.aPos)
		gl.vertexAttribPointer(this.colorProg.aPos, 2, gl.FLOAT, false, 16, 0)
		gl.enableVertexAttribArray(this.colorProg.aUv)
		gl.vertexAttribPointer(this.colorProg.aUv, 2, gl.FLOAT, false, 16, 8)
		// for texProg too (same locations layout)
		gl.enableVertexAttribArray(this.texProg.aPos)
		gl.vertexAttribPointer(this.texProg.aPos, 2, gl.FLOAT, false, 16, 0)
		gl.enableVertexAttribArray(this.texProg.aUv)
		gl.vertexAttribPointer(this.texProg.aUv, 2, gl.FLOAT, false, 16, 8)
	}

	private setCommonUniforms(p: ProgramInfo) {
		const gl = this.gl
		const { width, height } = this.size
		gl.uniform2f(p.uResolution, width, height)
		gl.uniform2f(p.uPan, this.viewport.pan.x, this.viewport.pan.y)
		gl.uniform1f(p.uZoom, this.viewport.zoom)
	}

	private useProgram(p: ProgramInfo) {
		this.gl.useProgram(p.program)
	}

	private useRoundedRectProgram(p: RoundedRectProgramInfo) {
		this.gl.useProgram(p.program)
	}

	private createProgram(vsSrc: string, fsSrc: string, withColor: boolean): ProgramInfo {
		const gl = this.gl
		const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc)
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)
		let program: WebGLProgram
		try {
			program = linkProgram(gl, vs, fs)
		} catch (e) {
			gl.deleteShader(vs)
			gl.deleteShader(fs)
			throw e
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)

		const aPos = gl.getAttribLocation(program, 'a_pos')
		const aUv = gl.getAttribLocation(program, 'a_uv')
		const uResolution = gl.getUniformLocation(program, 'u_resolution')!
		const uPan = gl.getUniformLocation(program, 'u_pan')!
		const uZoom = gl.getUniformLocation(program, 'u_zoom')!
		const uColor = withColor ? gl.getUniformLocation(program, 'u_color')! : undefined
		const uSampler = !withColor ? gl.getUniformLocation(program, 'u_sampler')! : undefined
		const uAlpha = !withColor ? gl.getUniformLocation(program, 'u_alpha')! : undefined
		return { program, aPos, aUv, uResolution, uPan, uZoom, uColor, uSampler, uAlpha }
	}

	private vsLocal2d() {
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

	private fsLocalColor() {
		return `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main(){ outColor = u_color; }`
	}

	private fsLocalTex() {
		return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sampler;
uniform float u_alpha;
out vec4 outColor;
void main(){ outColor = texture(u_sampler, v_uv) * vec4(1.0,1.0,1.0,u_alpha); }`
	}

	private createLocalProgram(
		vsSrc: string,
		fsSrc: string,
		opt: { kind: 'color' | 'tex' | 'roundedRect' }
	): LocalProgramInfo {
		const gl = this.gl
		const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc)
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)
		let program: WebGLProgram
		try {
			program = linkProgram(gl, vs, fs)
		} catch (e) {
			gl.deleteShader(vs)
			gl.deleteShader(fs)
			throw e
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		const aPos = gl.getAttribLocation(program, 'a_pos')
		const aUv = gl.getAttribLocation(program, 'a_uv')
		const uResolution = gl.getUniformLocation(program, 'u_resolution')!
		const uColor = opt.kind === 'color' ? gl.getUniformLocation(program, 'u_color')! : undefined
		const uSampler = opt.kind !== 'color' ? gl.getUniformLocation(program, 'u_sampler')! : undefined
		const uAlpha = opt.kind !== 'color' ? gl.getUniformLocation(program, 'u_alpha')! : undefined
		const uSize = opt.kind === 'roundedRect' ? gl.getUniformLocation(program, 'u_size')! : undefined
		const uRadius = opt.kind === 'roundedRect' ? gl.getUniformLocation(program, 'u_radius')! : undefined
		const uBorderWidth = opt.kind === 'roundedRect' ? gl.getUniformLocation(program, 'u_borderWidth')! : undefined
		const uFillColor = opt.kind === 'roundedRect' ? gl.getUniformLocation(program, 'u_fillColor')! : undefined
		const uBorderColor = opt.kind === 'roundedRect' ? gl.getUniformLocation(program, 'u_borderColor')! : undefined
		return { program, aPos, aUv, uResolution, uColor, uSampler, uAlpha, uSize, uRadius, uBorderWidth, uFillColor, uBorderColor }
	}

	private drawLocalQuad(target: { w: number; h: number; scale?: number }, x: number, y: number, w: number, h: number, color: RGBA, rotation = 0) {
		const gl = this.gl
		gl.useProgram(this.localProgColor.program)
		gl.uniform2f(this.localProgColor.uResolution!, target.w, target.h)
		gl.uniform4f(this.localProgColor.uColor!, color.r, color.g, color.b, color.a)
		this.uploadLocalQuadVerts(this.localProgColor, x, y, w, h, rotation, undefined, target.scale)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	private uploadLocalQuadVerts(
		prog: Pick<LocalProgramInfo, 'program' | 'aPos' | 'aUv'>,
		x: number,
		y: number,
		w: number,
		h: number,
		rotation = 0,
		uv: UvRect = { u0: 0, v0: 0, u1: 1, v1: 1 },
		scaleMaybe?: number
	) {
		const gl = this.gl
		const s = Math.max(1e-3, scaleMaybe ?? 1)
		const x0 = x * s
		const y0 = y * s
		const hw = (w * s) / 2
		const hh = (h * s) / 2
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const rot = (dx: number, dy: number) => ({ x: x0 + dx * cos - dy * sin, y: y0 + dx * sin + dy * cos })
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
		gl.bindBuffer(gl.ARRAY_BUFFER, this.localVbo)
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(prog.aPos)
		gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 16, 0)
		gl.enableVertexAttribArray(prog.aUv)
		gl.vertexAttribPointer(prog.aUv, 2, gl.FLOAT, false, 16, 8)
	}

	private createRoundedRectProgram(vsSrc: string, fsSrc: string): RoundedRectProgramInfo {
		const gl = this.gl
		const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc)
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)
		let program: WebGLProgram
		try {
			program = linkProgram(gl, vs, fs)
		} catch (e) {
			gl.deleteShader(vs)
			gl.deleteShader(fs)
			throw e
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)

		const aPos = gl.getAttribLocation(program, 'a_pos')
		const aUv = gl.getAttribLocation(program, 'a_uv')
		const uResolution = gl.getUniformLocation(program, 'u_resolution')!
		const uPan = gl.getUniformLocation(program, 'u_pan')!
		const uZoom = gl.getUniformLocation(program, 'u_zoom')!
		const uSize = gl.getUniformLocation(program, 'u_size')!
		const uRadius = gl.getUniformLocation(program, 'u_radius')!
		const uBorderWidth = gl.getUniformLocation(program, 'u_borderWidth')!
		const uFillColor = gl.getUniformLocation(program, 'u_fillColor')!
		const uBorderColor = gl.getUniformLocation(program, 'u_borderColor')!
		return { program, aPos, aUv, uResolution, uPan, uZoom, uSize, uRadius, uBorderWidth, uFillColor, uBorderColor }
	}
}

export const themeRgba = {
	accent: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border-accent', '#3aa8b4'), alpha),
	border: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border', '#2b2b2b'), alpha),
	bg: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt', '#111111'), alpha),	
	bgDark: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt-dark', '#1f1f1f'), alpha),
}
