import type { VideoSceneState, VideoSceneTreeNode, VideoSceneUserNodeType, VideoSceneNodeTransform } from '../store/videoscene'
import { DwebCanvasGL, themeRgba, type IDwebGLScene, type Vec2 } from './DwebCanvasGL'
import { DwebImagePool } from './DwebImagePool'

export type HitTestResult = {
	layerId: string
	nodeId: string
}

type RenderNode = {
	layerId: string
	id: string
	type: VideoSceneUserNodeType
	transform: VideoSceneNodeTransform
	props?: Record<string, any>
	text?: string
	fontSize?: number
	imageSrc?: string
}

export class DwebVideoScene implements IDwebGLScene {
	private state: VideoSceneState | null = null
	private stageSize = { width: 1920, height: 1080 }
	private renderOrder: RenderNode[] = []
	private stageBackground: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	} = { type: 'color', color: '#111111', opacity: 1, imageSrc: '', imageFit: 'contain', repeat: false }

	private textCanvas = document.createElement('canvas')
	private textCtx = this.textCanvas.getContext('2d')!
	private rectCanvas = document.createElement('canvas')
	private rectCtx = this.rectCanvas.getContext('2d')!
	private textures = new Map<string, WebGLTexture>()
	private imagePool = new DwebImagePool()

	private parseHexColor(hex: string, alpha = 1) {
		const h = (hex || '').trim()
		const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(h)
		if (!m) return themeRgba.accent(alpha)
		const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
		const n = parseInt(s, 16)
		return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha }
	}

	private rgbaToCss(c: { r: number; g: number; b: number; a: number }) {
		const r = Math.round(c.r * 255)
		const g = Math.round(c.g * 255)
		const b = Math.round(c.b * 255)
		return `rgba(${r}, ${g}, ${b}, ${c.a})`
	}

	private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
		ctx.beginPath()
		// @ts-ignore
		if (typeof (ctx as any).roundRect === 'function') {
			// @ts-ignore
			;(ctx as any).roundRect(x, y, w, h, rr)
			return
		}
		const x0 = x
		const y0 = y
		const x1 = x + w
		const y1 = y + h
		ctx.moveTo(x0 + rr, y0)
		ctx.arcTo(x1, y0, x1, y1, rr)
		ctx.arcTo(x1, y1, x0, y1, rr)
		ctx.arcTo(x0, y1, x0, y0, rr)
		ctx.arcTo(x0, y0, x1, y0, rr)
		ctx.closePath()
	}

	private getRoundedRectTexture(
		gl: WebGL2RenderingContext,
		canvas: DwebCanvasGL,
		n: RenderNode,
		radius: number,
		mode: 'fill' | 'stroke'
	): WebGLTexture {
		const fillColor = this.parseHexColor(n.props?.fillColor ?? '#3aa1ff', 1)
		const borderColor = this.parseHexColor(n.props?.borderColor ?? '#9cdcfe', 1)
		const borderW = Math.max(0, Number(n.props?.borderWidth ?? 0))
		const w = Math.max(1, Math.floor(n.transform.width))
		const h = Math.max(1, Math.floor(n.transform.height))
		const rr = Math.max(0, Math.min(Number(radius) || 0, Math.min(w, h) / 2))
		const key = `rect:${n.id}:${mode}:${w}:${h}:${n.props?.fillColor ?? ''}:${n.props?.borderColor ?? ''}:${borderW}:${rr}`
		let tex = this.textures.get(key)
		if (tex) return tex
		for (const k of this.textures.keys()) {
			if (k.startsWith(`rect:${n.id}:`)) {
				gl.deleteTexture(this.textures.get(k)!)
				this.textures.delete(k)
			}
		}
		tex = gl.createTexture()!
		this.rectCanvas.width = w
		this.rectCanvas.height = h
		const ctx = this.rectCtx
		ctx.clearRect(0, 0, w, h)

		if (mode === 'fill') {
			ctx.fillStyle = this.rgbaToCss(fillColor)
			this.roundRectPath(ctx, 0, 0, w, h, rr)
			ctx.fill()
		} else {
			if (borderW > 0) {
				ctx.lineWidth = borderW
				ctx.strokeStyle = this.rgbaToCss(borderColor)
				this.roundRectPath(ctx, borderW / 2, borderW / 2, w - borderW, h - borderW, Math.max(0, rr - borderW / 2))
				ctx.stroke()
			}
		}
		canvas.updateTextureFromCanvas(tex, this.rectCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}

	setStageSize(size: { width: number; height: number }) {
		this.stageSize = { width: size.width, height: size.height }
	}

	setStageBackground(bg: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	}) {
		this.stageBackground = { ...this.stageBackground, ...bg }
	}

	setState(state: VideoSceneState) {
		this.state = state
		this.rebuildRenderOrder()
	}

	private rebuildRenderOrder() {
		if (!this.state) {
			this.renderOrder = []
			return
		}
		const list: RenderNode[] = []
		for (const layer of this.state.layers) {
			for (const root of layer.nodeTree) {
				this.walkBuildRenderOrder(layer.id, root, { x: 0, y: 0 }, list)
			}
		}
		this.renderOrder = list
	}

	private walkBuildRenderOrder(layerId: string, node: VideoSceneTreeNode, parentWorld: Vec2, out: RenderNode[]) {
		const hasTransform = !!node.transform
		const nodeWorld = hasTransform
			? { x: parentWorld.x + (node.transform?.x ?? 0), y: parentWorld.y + (node.transform?.y ?? 0) }
			: parentWorld
		const nextParentWorld = hasTransform ? nodeWorld : parentWorld

		if (node.category === 'user' && node.transform) {
			const type = (node.userType ?? 'base') as VideoSceneUserNodeType
			out.push({
				layerId,
				id: node.id,
				type,
				transform: {
					...node.transform,
					x: nodeWorld.x,
					y: nodeWorld.y,
					rotation: (node.transform as any).rotation ?? 0,
					opacity: (node.transform as any).opacity ?? 1,
				},
				props: node.props ?? {},
				text: node.props?.textContent,
				fontSize: node.props?.fontSize,
				imageSrc: node.props?.imagePath,
			})
		}

		if (node.children?.length) {
			for (const child of node.children) {
				this.walkBuildRenderOrder(layerId, child, nextParentWorld, out)
			}
		}
	}

	// findNode 已不再需要：renderOrder 通过一次 DFS 构建

	render(canvas: DwebCanvasGL): void {
		const gl = canvas.getGL()

		// --- canvas background grid (for positioning) ---
		const { width: screenW, height: screenH } = canvas.size
		const tl = canvas.screenToWorld({ x: 0, y: 0 })
		const br = canvas.screenToWorld({ x: screenW, y: screenH })
		const minX = Math.min(tl.x, br.x)
		const maxX = Math.max(tl.x, br.x)
		const minY = Math.min(tl.y, br.y)
		const maxY = Math.max(tl.y, br.y)
		canvas.drawRect((minX + maxX) / 2, (minY + maxY) / 2, maxX - minX, maxY - minY, themeRgba.bg(1))
		const gridStep = 80
		const gridColor = themeRgba.border(0.35)
		const gridW = 1 / canvas.viewport.zoom
		const startX = Math.floor(minX / gridStep) * gridStep
		const endX = Math.ceil(maxX / gridStep) * gridStep
		for (let x = startX; x <= endX; x += gridStep) {
			canvas.drawRect(x, (minY + maxY) / 2, gridW, maxY - minY, gridColor)
		}
		const startY = Math.floor(minY / gridStep) * gridStep
		const endY = Math.ceil(maxY / gridStep) * gridStep
		for (let y = startY; y <= endY; y += gridStep) {
			canvas.drawRect((minX + maxX) / 2, y, maxX - minX, gridW, gridColor)
		}

		// --- stage background (aspect ratio / size defined by stageSize) ---
		const bgOpacity = Math.max(0, Math.min(1, Number(this.stageBackground.opacity ?? 1)))
		const stageBgColor = this.parseHexColor(this.stageBackground.color || '#111111', bgOpacity)
		canvas.drawRect(0, 0, this.stageSize.width, this.stageSize.height, stageBgColor)
		if (this.stageBackground.type === 'image') {
			this.drawStageBackgroundImage(gl, canvas, bgOpacity)
		}
		// stage border (1px in screen space)
		const borderW = 1 / canvas.viewport.zoom
		canvas.drawRect(0, -this.stageSize.height / 2 + borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(0, this.stageSize.height / 2 - borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(-this.stageSize.width / 2 + borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))
		canvas.drawRect(this.stageSize.width / 2 - borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))

		// user nodes in order
		for (const n of this.renderOrder) {
			const rotation = (n.transform as any).rotation ?? 0
			const opacity = Math.max(0, Math.min(1, (n.transform as any).opacity ?? 1))
			if (n.type === 'base') {
				canvas.drawRect(n.transform.x, n.transform.y, n.transform.width, n.transform.height, themeRgba.border(0.25 * opacity), rotation)
				canvas.drawRect(
					n.transform.x,
					n.transform.y,
					n.transform.width,
					Math.max(borderW, 1 / canvas.viewport.zoom),
					themeRgba.border(0.7 * opacity),
					rotation
				)
				continue
			}
			if (n.type === 'rect') {
				const cx = n.transform.x
				const cy = n.transform.y
				const w = n.transform.width
				const h = n.transform.height
				const fillOpacity = Math.max(0, Math.min(1, Number(n.props?.fillOpacity ?? 1)))
				const borderOpacity = Math.max(0, Math.min(1, Number(n.props?.borderOpacity ?? 1)))
				const fillA = Math.max(0, Math.min(1, opacity * fillOpacity))
				const borderA = Math.max(0, Math.min(1, opacity * borderOpacity))
				const cornerRadius = Math.max(0, Number(n.props?.cornerRadius ?? 0))
				if (cornerRadius > 0.5) {
					if (fillA > 0) {
						const fillTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'fill')
						canvas.drawTexturedRect(cx, cy, w, h, fillTex, fillA, rotation)
					}
					const borderPx0 = Math.max(0, Number(n.props?.borderWidth ?? 1))
					if (borderPx0 > 0 && borderA > 0) {
						const strokeTex = this.getRoundedRectTexture(gl, canvas, n, cornerRadius, 'stroke')
						canvas.drawTexturedRect(cx, cy, w, h, strokeTex, borderA, rotation)
					}
					continue
				}
				if (fillA > 0) {
					const fillColor = this.parseHexColor(n.props?.fillColor ?? '#3aa1ff', fillA)
					canvas.drawRect(cx, cy, w, h, fillColor, rotation)
				}

				const borderPx = Math.max(0, Number(n.props?.borderWidth ?? 1))
				let bw = borderPx / canvas.viewport.zoom
				bw = Math.max(0, Math.min(bw, Math.min(w, h) / 2))
				if (bw > 0 && borderA > 0) {
					const borderColor = this.parseHexColor(n.props?.borderColor ?? '#9cdcfe', borderA)
					const cos = Math.cos(rotation)
					const sin = Math.sin(rotation)
					const ro = (ox: number, oy: number) => ({ x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos })

					const top = ro(0, -h / 2 + bw / 2)
					canvas.drawRect(top.x, top.y, w, bw, borderColor, rotation)
					const bottom = ro(0, h / 2 - bw / 2)
					canvas.drawRect(bottom.x, bottom.y, w, bw, borderColor, rotation)
					const left = ro(-w / 2 + bw / 2, 0)
					canvas.drawRect(left.x, left.y, bw, h, borderColor, rotation)
					const right = ro(w / 2 - bw / 2, 0)
					canvas.drawRect(right.x, right.y, bw, h, borderColor, rotation)
				}
				continue
			}
			if (n.type === 'text') {
				const tex = this.getTextTexture(gl, canvas, n)
				canvas.drawTexturedRect(n.transform.x, n.transform.y, n.transform.width, n.transform.height, tex, opacity, rotation)
				continue
			}
			// image
			const tex = this.getImageTexture(gl, canvas, n)
			const scale = Math.max(0.01, Number(n.props?.scale ?? 1))
			canvas.drawTexturedRect(n.transform.x, n.transform.y, n.transform.width * scale, n.transform.height * scale, tex, opacity, rotation)
		}
	}

	private drawStageBackgroundImage(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, opacity: number) {
		const src = (this.stageBackground.imageSrc || '').trim()
		if (!src) return
		const wrap = this.stageBackground.repeat ? 'repeat' : 'clamp'
		const tex = this.imagePool.getTexture(gl, canvas, src, wrap)
		const size = this.imagePool.getSize(src)
		const imgW = Math.max(1, size?.width ?? 1)
		const imgH = Math.max(1, size?.height ?? 1)
		const stageW = this.stageSize.width
		const stageH = this.stageSize.height

		if (this.stageBackground.repeat) {
			const u1 = stageW / imgW
			const v1 = stageH / imgH
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0: 0, v0: 0, u1, v1 })
			return
		}

		const fit = this.stageBackground.imageFit
		if (fit === 'fill') {
			canvas.drawTexturedRect(0, 0, stageW, stageH, tex, opacity, 0)
			return
		}

		if (fit === 'cover') {
			const scale = Math.max(stageW / imgW, stageH / imgH)
			const scaledW = imgW * scale
			const scaledH = imgH * scale
			const visU = Math.min(1, stageW / scaledW)
			const visV = Math.min(1, stageH / scaledH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		if (fit === 'none') {
			if (imgW <= stageW && imgH <= stageH) {
				canvas.drawTexturedRect(0, 0, imgW, imgH, tex, opacity, 0)
				return
			}
			const visU = Math.min(1, stageW / imgW)
			const visV = Math.min(1, stageH / imgH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, { u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		// contain / scale-down (default)
		let scale = Math.min(stageW / imgW, stageH / imgH)
		if (fit === 'scale-down') scale = Math.min(1, scale)
		canvas.drawTexturedRect(0, 0, imgW * scale, imgH * scale, tex, opacity, 0)
	}

	hitTest(canvas: DwebCanvasGL, screenPoint: Vec2): HitTestResult | null {
		const world = canvas.screenToWorld(screenPoint)
		for (let i = this.renderOrder.length - 1; i >= 0; i--) {
			const n = this.renderOrder[i]
			const rotation = (n.transform as any).rotation ?? 0
			const scale = n.type === 'image' ? Math.max(0.01, Number(n.props?.scale ?? 1)) : 1
			const w = n.transform.width * scale
			const h = n.transform.height * scale
			// hitTest: 旋转矩形，先把点旋回局部坐标再做 AABB
			const cos = Math.cos(-rotation)
			const sin = Math.sin(-rotation)
			const dx = world.x - n.transform.x
			const dy = world.y - n.transform.y
			const lx = dx * cos - dy * sin
			const ly = dx * sin + dy * cos
			const x0 = -w / 2
			const x1 = w / 2
			const y0 = -h / 2
			const y1 = h / 2
			if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) return { layerId: n.layerId, nodeId: n.id }
		}
		return null
	}

	private getTextTexture(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, n: RenderNode): WebGLTexture {
		const fontColor = n.props?.fontColor ?? '#ffffff'
		const fontStyle = n.props?.fontStyle ?? 'normal'
		const key = `text:${n.id}:${n.text ?? ''}:${n.fontSize ?? 24}:${fontColor}:${fontStyle}:${n.transform.width}:${n.transform.height}`
		let tex = this.textures.get(key)
		if (tex) return tex
		// purge old textures for same node id
		for (const k of this.textures.keys()) {
			if (k.startsWith(`text:${n.id}:`)) {
				gl.deleteTexture(this.textures.get(k)!)
				this.textures.delete(k)
			}
		}

		tex = gl.createTexture()!
		this.textCanvas.width = Math.max(1, Math.floor(n.transform.width))
		this.textCanvas.height = Math.max(1, Math.floor(n.transform.height))
		const ctx = this.textCtx
		ctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height)
		ctx.fillStyle = 'rgba(0,0,0,0)'
		ctx.fillRect(0, 0, this.textCanvas.width, this.textCanvas.height)
		ctx.fillStyle = String(fontColor)
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'center'
		const fontSize = Number(n.fontSize ?? 24)
		ctx.font = `${String(fontStyle)} ${fontSize}px sans-serif`
		const text = String(n.text ?? 'Text')
		const lines = text.split(/\r?\n/)
		const lineH = fontSize * 1.2
		const totalH = Math.max(1, lines.length) * lineH
		let y = this.textCanvas.height / 2 - totalH / 2 + lineH / 2
		for (const line of lines) {
			ctx.fillText(line, this.textCanvas.width / 2, y)
			y += lineH
		}
		canvas.updateTextureFromCanvas(tex, this.textCanvas, { wrap: 'clamp' })
		this.textures.set(key, tex)
		return tex
	}

	private getImageTexture(gl: WebGL2RenderingContext, canvas: DwebCanvasGL, n: RenderNode): WebGLTexture {
		const src = (n.imageSrc ?? '').trim()
		if (!src) {
			// placeholder: gray
			const key = `img:${n.id}:__placeholder__`
			let tex = this.textures.get(key)
			if (tex) return tex
			tex = canvas.createSolidTexture({ r: 0.6, g: 0.6, b: 0.6, a: 1 })
			this.textures.set(key, tex)
			return tex
		}
		return this.imagePool.getTexture(gl, canvas, src, 'clamp')
	}
}

