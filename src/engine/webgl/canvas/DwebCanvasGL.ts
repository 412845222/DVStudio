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
import { fsBasicColor, fsBasicTexture, vsBasic2d } from '../material'
import { createSolidTexture, setTextureWrap, updateTextureFromCanvas } from '../texture'

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
	private whiteTex: WebGLTexture

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false })
		if (!gl) throw new Error('WebGL2 context is not available')
		this.gl = gl

		this.vbo = gl.createBuffer()!
		this.colorProg = this.createProgram(vsBasic2d, fsBasicColor, true)
		this.texProg = this.createProgram(vsBasic2d, fsBasicTexture, false)

		this.whiteTex = this.createSolidTexture({ r: 1, g: 1, b: 1, a: 1 })
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
	}

	dispose() {
		this.isDisposed = true
		if (this.rafId != null) cancelAnimationFrame(this.rafId)
		this.rafId = null
		try {
			this.gl.deleteBuffer(this.vbo)
			this.gl.deleteTexture(this.whiteTex)
			this.gl.deleteProgram(this.colorProg.program)
			this.gl.deleteProgram(this.texProg.program)
		} catch {
			// ignore
		}
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

	getGL() {
		return this.gl
	}

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

	createSolidTexture(color: RGBA) {
		return createSolidTexture(this.gl, color)
	}

	setTextureWrap(tex: WebGLTexture, wrap: TextureWrapMode) {
		setTextureWrap(this.gl, tex, wrap)
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
		updateTextureFromCanvas(this.gl, tex, canvas, options)
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
}

export const themeRgba = {
	accent: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border-accent', '#3aa8b4'), alpha),
	border: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border', '#2b2b2b'), alpha),
	bg: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt', '#111111'), alpha),	
	bgDark: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt-dark', '#1f1f1f'), alpha),
}
