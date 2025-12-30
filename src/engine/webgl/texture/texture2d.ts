import type { RGBA, TextureWrapMode } from '../canvas/DwebCanvasGL'

export function createSolidTexture(gl: WebGL2RenderingContext, color: RGBA): WebGLTexture {
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

export function setTextureWrap(gl: WebGL2RenderingContext, tex: WebGLTexture, wrap: TextureWrapMode) {
	gl.bindTexture(gl.TEXTURE_2D, tex)
	const mode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode)
}

export function updateTextureFromCanvas(
	gl: WebGL2RenderingContext,
	tex: WebGLTexture,
	canvas: HTMLCanvasElement,
	options?: { wrap?: TextureWrapMode }
) {
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
