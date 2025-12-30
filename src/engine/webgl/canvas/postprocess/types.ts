export type PostProg = {
	program: WebGLProgram
	aPos: number
	uSampler: WebGLUniformLocation | null
	uTexel?: WebGLUniformLocation | null
	uDir?: WebGLUniformLocation | null
	uRadius?: WebGLUniformLocation | null
	uSampler2?: WebGLUniformLocation | null
	uColor?: WebGLUniformLocation | null
	uIntensity?: WebGLUniformLocation | null
	uInner?: WebGLUniformLocation | null
	uKnockout?: WebGLUniformLocation | null
}

export type FilterTargets = {
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
