import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'
import type { VideoSceneNodeTransform } from '../../../core/scene'

export class TextRenderer extends NodeRenderer {
	readonly type = 'text' as const

	private textCanvas: HTMLCanvasElement | OffscreenCanvas = (() => {
		if (typeof document !== 'undefined') return document.createElement('canvas')
		if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1)
		// Fallback: should not happen in supported environments.
		throw new Error('No canvas implementation available')
	})()
	private textCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D = (() => {
		const tc = this.textCanvas
		const ctx = tc instanceof HTMLCanvasElement ? tc.getContext('2d') : tc.getContext('2d')
		if (
			!ctx ||
			(!(ctx instanceof CanvasRenderingContext2D) &&
				!(ctx instanceof OffscreenCanvasRenderingContext2D))
		) {
			throw new Error('2D context is not available')
		}
		return ctx
	})()
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
		const w = Math.max(1, Number(node.transform.width ?? 1))
		const h = Math.max(1, Number(node.transform.height ?? 1))
		const px =
			typeof node.transform.pivotX === 'number'
				? Math.max(0, Math.min(1, Number(node.transform.pivotX)))
				: 0.5
		const py =
			typeof node.transform.pivotY === 'number'
				? Math.max(0, Math.min(1, Number(node.transform.pivotY)))
				: 0.5
		const cx = node.transform.x + (0.5 - px) * w
		const cy = node.transform.y + (0.5 - py) * h
		canvas.drawTexturedRect(cx, cy, w, h, tex, ctx.opacity, ctx.rotation)
	}

	renderLocal(
		canvas: DwebCanvasGL,
		target: LocalTargetSize,
		node: RenderNode,
		ctx: RenderContext
	): void {
		const tex = this.getTextTexture(canvas, node)
		const w = Math.max(1, Number(node.transform.width ?? 1))
		const h = Math.max(1, Number(node.transform.height ?? 1))
		const px =
			typeof node.transform.pivotX === 'number'
				? Math.max(0, Math.min(1, Number(node.transform.pivotX)))
				: 0.5
		const py =
			typeof node.transform.pivotY === 'number'
				? Math.max(0, Math.min(1, Number(node.transform.pivotY)))
				: 0.5
		const cx = node.transform.x + (0.5 - px) * w
		const cy = node.transform.y + (0.5 - py) * h
		canvas.drawLocalTexturedRect(target, cx, cy, w, h, tex, ctx.opacity, ctx.rotation)
	}

	private getTextTexture(canvas: DwebCanvasGL, node: RenderNode): WebGLTexture {
		const nodeEx = node as RenderNode & { localTransform?: VideoSceneNodeTransform }
		const localT = nodeEx.localTransform ?? node.transform
		const localW = Math.max(1, Math.floor(Number(localT.width ?? node.transform.width ?? 1)))
		const localH = Math.max(1, Math.floor(Number(localT.height ?? node.transform.height ?? 1)))

		const fontColor = node.props?.fontColor ?? '#ffffff'
		const fontStyle = node.props?.fontStyle ?? 'normal'
		const props = (node.props as Record<string, unknown>) ?? {}
		const textAlignRaw = String(props.textAlign ?? 'center')
		const textAlign: CanvasTextAlign =
			textAlignRaw === 'left' || textAlignRaw === 'right' || textAlignRaw === 'center'
				? textAlignRaw
				: 'center'
		// NOTE: key must include layout-affecting props (e.g. textAlign), otherwise cache will keep old layout.
		// IMPORTANT: texture is generated in *unscaled local* space; do NOT include world width/height in the cache key.
		const key = `text:${node.id}:${node.text ?? ''}:${node.fontSize ?? 24}:${fontColor}:${fontStyle}:${textAlign}:${localW}:${localH}`
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
		const w = localW
		const h = localH
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
