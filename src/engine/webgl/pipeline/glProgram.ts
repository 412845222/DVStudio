export type GlProgramPreviewResult = { ok: boolean; log: string }

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
	const shader = gl.createShader(type)
	if (!shader) throw new Error('createShader failed')
	gl.shaderSource(shader, String(src ?? ''))
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const msg = gl.getShaderInfoLog(shader) || 'compile failed'
		gl.deleteShader(shader)
		throw new Error(msg)
	}
	return shader
}

export function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
	const program = gl.createProgram()
	if (!program) throw new Error('createProgram failed')
	gl.attachShader(program, vs)
	gl.attachShader(program, fs)
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const msg = gl.getProgramInfoLog(program) || 'link failed'
		gl.deleteProgram(program)
		throw new Error(msg)
	}
	return program
}

/**
 * 受控的 shader 预览编译：仅编译+链接，返回 ok/log。
 * 不会缓存 program，也不执行绘制。
 */
export function previewCompileAndLinkProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string
): GlProgramPreviewResult {
	let vs: WebGLShader | null = null
	let fs: WebGLShader | null = null
	let program: WebGLProgram | null = null
	try {
		vs = gl.createShader(gl.VERTEX_SHADER)
		if (!vs) return { ok: false, log: 'createShader(VERTEX_SHADER) failed' }
		gl.shaderSource(vs, String(vertexSource ?? ''))
		gl.compileShader(vs)
		if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(vs) || 'vertex compile failed'
			return { ok: false, log }
		}

		fs = gl.createShader(gl.FRAGMENT_SHADER)
		if (!fs) return { ok: false, log: 'createShader(FRAGMENT_SHADER) failed' }
		gl.shaderSource(fs, String(fragmentSource ?? ''))
		gl.compileShader(fs)
		if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(fs) || 'fragment compile failed'
			return { ok: false, log }
		}

		program = gl.createProgram()
		if (!program) return { ok: false, log: 'createProgram failed' }
		gl.attachShader(program, vs)
		gl.attachShader(program, fs)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(program) || 'link failed'
			return { ok: false, log }
		}

		return { ok: true, log: gl.getProgramInfoLog(program) || '' }
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		return { ok: false, log: msg }
	} finally {
		try {
			if (program) gl.deleteProgram(program)
			if (vs) gl.deleteShader(vs)
			if (fs) gl.deleteShader(fs)
		} catch {
			// ignore
		}
	}
}
