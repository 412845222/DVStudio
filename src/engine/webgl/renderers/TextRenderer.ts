import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

export class TextRenderer extends NodeRenderer {
	readonly type = 'text' as const

	private textCanvas = document.createElement('canvas')
	private textCtx = this.textCanvas.getContext('2d')!
	private textures = new Map<string, WebGLTexture>()

	prune(canvas: DwebCanvasGL, validNodeIds: Set<string>) {
		for (const k of this.textures.keys()) {
			// key: text:<id>:...
			const m = /^text:([^:]+):/.exec(k)
			if (!m) continue
			const id = m[1]
			if (validNodeIds.has(id)) continue
			const tex = this.textures.get(k)
			this.textures.delete(k)
			if (tex) canvas.deleteTexture(tex)
		}
	}

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		const tex = this.getTextTexture(canvas, node)
		canvas.drawTexturedRect(node.transform.x, node.transform.y, node.transform.width, node.transform.height, tex, ctx.opacity, ctx.rotation)
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		const tex = this.getTextTexture(canvas, node)
		canvas.drawLocalTexturedRect(
			target,
			node.transform.x,
			node.transform.y,
			Math.max(1, Number(node.transform.width ?? 1)),
			Math.max(1, Number(node.transform.height ?? 1)),
			tex,
			ctx.opacity,
			ctx.rotation
		)
	}

	private getTextTexture(canvas: DwebCanvasGL, node: RenderNode): WebGLTexture {
		const fontColor = node.props?.fontColor ?? '#ffffff'
		const fontStyle = node.props?.fontStyle ?? 'normal'
		const key = `text:${node.id}:${node.text ?? ''}:${node.fontSize ?? 24}:${fontColor}:${fontStyle}:${node.transform.width}:${node.transform.height}`
		let tex = this.textures.get(key)
		if (tex) return tex

		// invalidate textures for same node id
		for (const k of this.textures.keys()) {
			if (k.startsWith(`text:${node.id}:`)) {
				const old = this.textures.get(k)
				this.textures.delete(k)
				if (old) canvas.deleteTexture(old)
			}
		}

		tex = canvas.createTexture()
		const w = Math.max(1, Math.floor(node.transform.width))
		const h = Math.max(1, Math.floor(node.transform.height))
		this.textCanvas.width = w
		this.textCanvas.height = h

		const ctx2d = this.textCtx
		ctx2d.clearRect(0, 0, w, h)
		ctx2d.textBaseline = 'middle'
		ctx2d.textAlign = 'center'
		const fontSize = Math.max(1, Number(node.fontSize ?? 24))
		ctx2d.font = `${String(fontStyle)} ${fontSize}px sans-serif`
		ctx2d.fillStyle = String(fontColor)
		ctx2d.fillText(String(node.text ?? ''), w / 2, h / 2)

		canvas.updateTextureFromCanvas(tex, this.textCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}
}
