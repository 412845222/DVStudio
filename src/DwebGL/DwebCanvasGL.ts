export type Vec2 = { x: number; y: number }

export type ViewportState = {
	pan: Vec2 // screen-space px
	zoom: number
}

export type ViewportInset = {
	left?: number
	top?: number
	right?: number
	bottom?: number
}

export type RGBA = { r: number; g: number; b: number; a: number }

export type TextureWrapMode = 'clamp' | 'repeat'

export type UvRect = { u0: number; v0: number; u1: number; v1: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

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
		this.colorProg = this.createProgram(
			// vertex
			`#version 300 es
      precision highp float;
      in vec2 a_pos;
      in vec2 a_uv;
      uniform vec2 u_resolution;
      uniform vec2 u_pan;
      uniform float u_zoom;
      out vec2 v_uv;
      void main() {
        vec2 screen = a_pos * u_zoom + u_pan;
        vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
        v_uv = a_uv;
      }`,
			// fragment
			`#version 300 es
      precision highp float;
      uniform vec4 u_color;
      out vec4 outColor;
      void main() {
        outColor = u_color;
      }`,
			true
		)
		this.texProg = this.createProgram(
			`#version 300 es
      precision highp float;
      in vec2 a_pos;
      in vec2 a_uv;
      uniform vec2 u_resolution;
      uniform vec2 u_pan;
      uniform float u_zoom;
      out vec2 v_uv;
      void main() {
        vec2 screen = a_pos * u_zoom + u_pan;
        vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
        v_uv = a_uv;
      }`,
			`#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_sampler;
			uniform float u_alpha;
      out vec4 outColor;
      void main() {
				outColor = texture(u_sampler, v_uv) * vec4(1.0, 1.0, 1.0, u_alpha);
      }`,
			false
		)

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
		const z = this.viewport.zoom
		return { x: (p.x - this.viewport.pan.x) / z, y: (p.y - this.viewport.pan.y) / z }
	}

	worldToScreen(p: Vec2): Vec2 {
		const z = this.viewport.zoom
		return { x: p.x * z + this.viewport.pan.x, y: p.y * z + this.viewport.pan.y }
	}

	panBy(delta: Vec2) {
		this.viewport.pan.x += delta.x
		this.viewport.pan.y += delta.y
		this.onViewportChange?.(this.viewport)
		this.requestRender()
	}

	zoomAt(screenPoint: Vec2, nextZoom: number) {
		const prevZoom = this.viewport.zoom
		const z = clamp(nextZoom, 0.1, 8)
		if (Math.abs(z - prevZoom) < 1e-6) return
		const worldBefore = this.screenToWorld(screenPoint)
		this.viewport.zoom = z
		const screenAfter = this.worldToScreen(worldBefore)
		this.viewport.pan.x += screenPoint.x - screenAfter.x
		this.viewport.pan.y += screenPoint.y - screenAfter.y
		this.onViewportChange?.(this.viewport)
		this.requestRender()
	}

	fitToStage(stageSize: { width: number; height: number }, paddingPx = 24, inset: ViewportInset = {}) {
		const { width: w, height: h } = this.size
		const left = inset.left ?? 0
		const top = inset.top ?? 0
		const right = inset.right ?? 0
		const bottom = inset.bottom ?? 0
		const availableW = Math.max(1, w - left - right - paddingPx * 2)
		const availableH = Math.max(1, h - top - bottom - paddingPx * 2)
		const scaleX = availableW / stageSize.width
		const scaleY = availableH / stageSize.height
		const z = clamp(Math.min(scaleX, scaleY), 0.1, 8)
		this.viewport.zoom = z
		const centerX = left + (w - left - right) / 2
		const centerY = top + (h - top - bottom) / 2
		this.viewport.pan = { x: centerX, y: centerY }
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
		const gl = this.gl
		const tex = gl.createTexture()!
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		const data = new Uint8Array([
			Math.round(color.r * 255),
			Math.round(color.g * 255),
			Math.round(color.b * 255),
			Math.round(color.a * 255),
		])
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
		return tex
	}

	setTextureWrap(tex: WebGLTexture, wrap: TextureWrapMode) {
		const gl = this.gl
		gl.bindTexture(gl.TEXTURE_2D, tex)
		const mode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
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
		const gl = this.gl
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		const wrap = options?.wrap ?? 'clamp'
		const mode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
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
		const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc)
		const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc)
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

	private compileShader(type: number, src: string) {
		const gl = this.gl
		const shader = gl.createShader(type)!
		gl.shaderSource(shader, src)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const msg = gl.getShaderInfoLog(shader) || 'compile failed'
			gl.deleteShader(shader)
			throw new Error(msg)
		}
		return shader
	}
}

export const themeRgba = {
	accent: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border-accent', '#3aa8b4'), alpha),
	border: (alpha = 1) => hexToRgba(cssVarColor('--vscode-border', '#2b2b2b'), alpha),
	bg: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt', '#111111'), alpha),	
	bgDark: (alpha = 1) => hexToRgba(cssVarColor('--dweb-defualt-dark', '#1f1f1f'), alpha),
}

