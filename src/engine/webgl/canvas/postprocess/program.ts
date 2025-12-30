import type { PostProg } from './types'

export function createProgram(
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
