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
		const textAlignRaw = String((node.props as any)?.textAlign ?? 'center')
		const textAlign: CanvasTextAlign =
			textAlignRaw === 'left' || textAlignRaw === 'right' || textAlignRaw === 'center' ? (textAlignRaw as any) : 'center'
		// NOTE: key must include layout-affecting props (e.g. textAlign), otherwise cache will keep old layout.
		const key = `text:${node.id}:${node.text ?? ''}:${node.fontSize ?? 24}:${fontColor}:${fontStyle}:${textAlign}:${node.transform.width}:${node.transform.height}`
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
		ctx2d.textAlign = textAlign
		const fontSize = Math.max(1, Number(node.fontSize ?? 24))
		ctx2d.font = `${String(fontStyle)} ${fontSize}px sans-serif`
		ctx2d.fillStyle = String(fontColor)

		// Multiline support: split by newline and draw line by line.
		const rawText = String(node.text ?? '')
		const lines = rawText.split(/\r?\n/g)
		const lineHeight = fontSize * 1.4
		const totalH = lines.length * lineHeight
		// center the block vertically
		let y = h / 2 - totalH / 2 + lineHeight / 2
		const padX = Math.max(2, Math.round(fontSize * 0.6))
		const x = textAlign === 'left' ? padX : textAlign === 'right' ? w - padX : w / 2
		for (const line of lines) {
			ctx2d.fillText(line, x, y)
			y += lineHeight
		}

		canvas.updateTextureFromCanvas(tex, this.textCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}
}
