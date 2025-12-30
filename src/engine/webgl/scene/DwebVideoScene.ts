import type { VideoSceneState, VideoSceneTreeNode, VideoSceneUserNodeType, VideoSceneNodeTransform } from '../../../core/scene'
import { DwebCanvasGL, themeRgba, type IDwebGLScene, type Vec2 } from '../canvas/DwebCanvasGL'
import { hitTestRotatedRects, queryRotatedRectsInWorldRect, type PickableRectNode } from '../picking'
import type { RenderContext, RenderNode, LocalTargetSize } from '../renderers/types'
import { NodeRenderer } from '../renderers/NodeRenderer'
import { BaseRenderer } from '../renderers/BaseRenderer'
import { RectRenderer } from '../renderers/RectRenderer'
import { TextRenderer } from '../renderers/TextRenderer'
import { ImageRenderer } from '../renderers/ImageRenderer'
import { LineRenderer } from '../renderers/LineRenderer'

export type HitTestResult = {
	layerId: string
	nodeId: string
}

type RenderNodeEx = RenderNode & {
	parentId: string | null
	children: string[]
	localTransform: VideoSceneNodeTransform
}

export class DwebVideoScene implements IDwebGLScene {
	private state: VideoSceneState | null = null
	private stageSize = { width: 1920, height: 1080 }
	private renderOrder: RenderNodeEx[] = []
	private nodesById = new Map<string, RenderNodeEx>()
	private stageBackground: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	} = { type: 'color', color: '#111111', opacity: 1, imageSrc: '', imageFit: 'contain', repeat: false }

	private readonly baseRenderer = new BaseRenderer()
	private readonly rectRenderer = new RectRenderer()
	private readonly textRenderer = new TextRenderer()
	private readonly imageRenderer = new ImageRenderer()
	private readonly lineRenderer = new LineRenderer()
	private readonly rendererByType = new Map<VideoSceneUserNodeType, NodeRenderer>([
		['base', this.baseRenderer],
		['rect', this.rectRenderer],
		['text', this.textRenderer],
		['image', this.imageRenderer],
		['line', this.lineRenderer],
	])

	// rounded-rect now uses pure WebGL (see drawRoundedRect*)

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
			this.nodesById.clear()
			return
		}
		this.nodesById.clear()
		const list: RenderNode[] = []
		for (const layer of this.state.layers) {
			for (const root of layer.nodeTree) {
				this.walkBuildRenderOrder(layer.id, root, { x: 0, y: 0 }, list, null)
			}
		}
		this.renderOrder = list as RenderNodeEx[]
	}

	private getRenderer(type: VideoSceneUserNodeType): NodeRenderer {
		return this.rendererByType.get(type) ?? this.baseRenderer
	}

	private drawFilteredTextureToWorld(
		canvas: DwebCanvasGL,
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity: number,
		rotation: number
	) {
		canvas.drawTexturedRectUv(x, y, w, h, texture, opacity, rotation, { u0: 0, v0: 1, u1: 1, v1: 0 })
	}

	private drawFilteredTextureToLocal(
		canvas: DwebCanvasGL,
		target: { w: number; h: number },
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity: number,
		rotation: number
	) {
		canvas.drawLocalTexturedRectUv(target, x, y, w, h, texture, opacity, rotation, { u0: 0, v0: 1, u1: 1, v1: 0 })
	}

	private resolveFilterQuality(filter: any): 'low' | 'mid' | 'high' {
		const q = String(filter?.quality ?? '')
		const v2 = !!filter?.qualityV2
		// v2 quality semantics:
		// - low: previous mid
		// - mid: previous high
		// - high: new higher quality
		if (v2) {
			if (q === 'low' || q === 'mid' || q === 'high') return q
			return 'mid'
		}
		// Legacy (v1) migration mapping (read-only): high -> mid, mid -> low.
		if (q === 'high') return 'mid'
		if (q === 'mid') return 'low'
		if (q === 'low') return 'low'
		return 'mid'
	}

	private getBlurParams(filter: any): { factor: number; baseIterations: number; maxStepPx: number; maxIterations: number } {
		const q = this.resolveFilterQuality(filter)
		if (q === 'high') {
			return { factor: 6, baseIterations: 6, maxStepPx: 6, maxIterations: 14 }
		}
		if (q === 'mid') {
			return { factor: 4, baseIterations: 4, maxStepPx: 8, maxIterations: 12 }
		}
		return { factor: 2, baseIterations: 2, maxStepPx: 10, maxIterations: 10 }
	}

	private walkBuildRenderOrder(
		layerId: string,
		node: VideoSceneTreeNode,
		parentWorld: Vec2,
		out: RenderNode[],
		parentUserId: string | null
	) {
		const hasTransform = !!node.transform
		const nodeWorld = hasTransform
			? { x: parentWorld.x + (node.transform?.x ?? 0), y: parentWorld.y + (node.transform?.y ?? 0) }
			: parentWorld
		const nextParentWorld = hasTransform ? nodeWorld : parentWorld
		let nextParentUserId = parentUserId

		if (node.category === 'user' && node.transform) {
			const type = (node.userType ?? 'base') as VideoSceneUserNodeType
			const props: any = node.props ?? {}
			const textContent = typeof node.props?.textContent === 'string' ? node.props.textContent : undefined
			const fontSize = typeof node.props?.fontSize === 'number' ? node.props.fontSize : undefined
			let imageSrc = props?.imagePath
			const imageId = String(props?.imageId ?? '').trim()
			if (imageId && this.state?.imageAssets?.[imageId]?.url) {
				imageSrc = this.state.imageAssets[imageId].url
			}
			const localTransform: VideoSceneNodeTransform = {
				...node.transform,
				x: node.transform.x ?? 0,
				y: node.transform.y ?? 0,
				rotation: (node.transform as any).rotation ?? 0,
				opacity: (node.transform as any).opacity ?? 1,
			}
			const entry: RenderNodeEx = {
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
				props,
				text: textContent,
				fontSize,
				imageSrc,
				parentId: parentUserId,
				children: [],
				localTransform,
			}
			out.push(entry)
			this.nodesById.set(entry.id, entry)
			if (parentUserId) {
				const parent = this.nodesById.get(parentUserId)
				if (parent) parent.children.push(entry.id)
			}
			nextParentUserId = entry.id
		}

		if (node.children?.length) {
			for (const child of node.children) {
				this.walkBuildRenderOrder(layerId, child, nextParentWorld, out, nextParentUserId)
			}
		}
	}

	// findNode 已不再需要：renderOrder 通过一次 DFS 构建

	render(canvas: DwebCanvasGL): void {
		canvas.pruneFilterTargets(new Set(this.renderOrder.map((n) => n.id)))
		this.textRenderer.prune(canvas, new Set(this.renderOrder.map((n) => n.id)))

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
		const stageBgColor = canvas.parseHexColor(this.stageBackground.color || '#111111', bgOpacity)
		canvas.drawRect(0, 0, this.stageSize.width, this.stageSize.height, stageBgColor)
		if (this.stageBackground.type === 'image') {
			this.drawStageBackgroundImage(canvas, bgOpacity)
		}
		// stage border (1px in screen space)
		const borderW = 1 / canvas.viewport.zoom
		canvas.drawRect(0, -this.stageSize.height / 2 + borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(0, this.stageSize.height / 2 - borderW / 2, this.stageSize.width, borderW, themeRgba.border(1))
		canvas.drawRect(-this.stageSize.width / 2 + borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))
		canvas.drawRect(this.stageSize.width / 2 - borderW / 2, 0, borderW, this.stageSize.height, themeRgba.border(1))

		const zoom = Math.max(1e-3, canvas.viewport.zoom)
		const dpr = Math.max(1, canvas.getPixelRatio())
		// user nodes in order
		const skipped = new Set<string>()
		for (const n of this.renderOrder) {
			if (skipped.has(n.id)) continue
			const rotation = (n.transform as any).rotation ?? 0
			const opacity = Math.max(0, Math.min(1, (n.transform as any).opacity ?? 1))
			const nodeFilters: any[] = Array.isArray((n.props as any)?.filters) ? ((n.props as any).filters as any[]) : []
			const nodeW = Math.max(1, Number(n.transform.width ?? 1))
			const nodeH = Math.max(1, Number(n.transform.height ?? 1))
			if (nodeFilters.length > 0) {
				// compute required padding so blur/glow can extend outside node bounds (Flash-like)
				let maxXpx = 0
				let maxYpx = 0
				const normalizedFilters = nodeFilters
					.map((f) => (f && typeof f === 'object' ? { ...(f as any) } : f))
					.filter(Boolean)
					.filter((f: any) => {
						const ft = String(f?.type || '')
						if (ft === 'blur') {
							const bx = Math.max(0, Number(f.blurX ?? 0) || 0)
							const by = Math.max(0, Number(f.blurY ?? 0) || 0)
							return bx > 0 || by > 0
						}
						if (ft === 'glow') {
							const intensity = Math.max(0, Number(f.intensity ?? 1))
							const bx = Math.max(0, Number(f.blurX ?? 0) || 0)
							const by = Math.max(0, Number(f.blurY ?? 0) || 0)
							return intensity > 0 && (bx > 0 || by > 0)
						}
						return true
					}) as any[]
				const hasFilters = normalizedFilters.length > 0
				if (!hasFilters) {
					this.getRenderer(n.type).renderWorld(canvas, n, { opacity, rotation })
					continue
				}

				for (const f of normalizedFilters) {
					const ft = String(f?.type || '')
					if (ft === 'blur' || ft === 'glow') {
						const p = this.getBlurParams(f)
						// blurX/blurY are UI pixels (Flash-like). Keep appearance stable in screen space.
						const blurXpx = Math.max(0, Number(f.blurX ?? 0) || 0) * p.factor
						const blurYpx = Math.max(0, Number(f.blurY ?? 0) || 0) * p.factor
						maxXpx = Math.max(maxXpx, blurXpx)
						maxYpx = Math.max(maxYpx, blurYpx)

						// scene 只负责预归一化参数；具体执行由 canvas/postprocess 实现
						// post-process uses device pixels
						f.__blurX = blurXpx * dpr
						f.__blurY = blurYpx * dpr
						f.__iterations = p.baseIterations
						f.__maxStepPx = p.maxStepPx * dpr
						f.__maxIterations = p.maxIterations
					}
				}

				// padding expressed in world units; clamp in screen px to avoid runaway.
				const padXpx = Math.min(512, Math.ceil(maxXpx) + 6)
				const padYpx = Math.min(512, Math.ceil(maxYpx) + 6)
				const padX = padXpx / zoom
				const padY = padYpx / zoom
				const tex = canvas.applyFilters(n.id, nodeW, nodeH, padX, padY, normalizedFilters, (target) => {
					this.renderSubtreeIntoLocalTarget(canvas, target as LocalTargetSize, n.id, true)
				})
				this.drawFilteredTextureToWorld(
					canvas,
					n.transform.x,
					n.transform.y,
					nodeW + padX * 2,
					nodeH + padY * 2,
					tex,
					opacity,
					rotation
				)

				// 父节点滤镜：输出应覆盖整棵子树，避免子节点后续重复绘制。
				this.markDescendantsSkipped(n.id, skipped)
				continue
			}

			this.getRenderer(n.type).renderWorld(canvas, n, { opacity, rotation })
		}
	}

	private markDescendantsSkipped(rootId: string, skipped: Set<string>) {
		const root = this.nodesById.get(rootId)
		if (!root) return
		const stack = [...root.children]
		while (stack.length) {
			const id = stack.pop()!
			if (skipped.has(id)) continue
			skipped.add(id)
			const n = this.nodesById.get(id)
			if (n?.children?.length) stack.push(...n.children)
		}
	}

	private renderSubtreeIntoLocalTarget(canvas: DwebCanvasGL, target: LocalTargetSize, rootId: string, ignoreSelfOpacityRotation: boolean) {
		this.renderSubtreeIntoLocalTargetImpl(canvas, target, rootId, 0, 0, ignoreSelfOpacityRotation)
	}

	private renderSubtreeIntoLocalTargetImpl(
		canvas: DwebCanvasGL,
		target: LocalTargetSize,
		nodeId: string,
		x: number,
		y: number,
		ignoreSelfOpacityRotation: boolean
	) {
		const entry = this.nodesById.get(nodeId)
		if (!entry) return

		const zoom = Math.max(1e-3, canvas.viewport.zoom)
		const dpr = Math.max(1, canvas.getPixelRatio())

		const localW = Math.max(1, Number(entry.localTransform.width ?? 1))
		const localH = Math.max(1, Number(entry.localTransform.height ?? 1))
		const nodeOpacity = Math.max(0, Math.min(1, Number((entry.localTransform as any).opacity ?? 1)))
		const nodeRotation = Number((entry.localTransform as any).rotation ?? 0)

		const childFilters: any[] = Array.isArray((entry.props as any)?.filters) ? (((entry.props as any).filters as any[]) ?? []) : []
		const normalizedChildFilters = childFilters
			.map((f) => (f && typeof f === 'object' ? { ...(f as any) } : f))
			.filter(Boolean)
			.filter((f: any) => {
				const ft = String(f?.type || '')
				if (ft === 'blur') {
					const bx = Math.max(0, Number(f.blurX ?? 0) || 0)
					const by = Math.max(0, Number(f.blurY ?? 0) || 0)
					return bx > 0 || by > 0
				}
				if (ft === 'glow') {
					const intensity = Math.max(0, Number(f.intensity ?? 1))
					const bx = Math.max(0, Number(f.blurX ?? 0) || 0)
					const by = Math.max(0, Number(f.blurY ?? 0) || 0)
					return intensity > 0 && (bx > 0 || by > 0)
				}
				return true
			}) as any[]
		const hasSelfFilters = normalizedChildFilters.length > 0

		if (hasSelfFilters && !ignoreSelfOpacityRotation) {
			// 子节点自身带滤镜：先离屏渲染该节点子树，再把结果贴回到当前 target。
			let maxXpx = 0
			let maxYpx = 0
			const normalizedFilters = normalizedChildFilters

			for (const f of normalizedFilters) {
				const ft = String(f?.type || '')
				if (ft === 'blur' || ft === 'glow') {
					const p = this.getBlurParams(f)
					const blurXpx = Math.max(0, Number(f.blurX ?? 0) || 0) * p.factor
					const blurYpx = Math.max(0, Number(f.blurY ?? 0) || 0) * p.factor
					maxXpx = Math.max(maxXpx, blurXpx)
					maxYpx = Math.max(maxYpx, blurYpx)

					f.__blurX = blurXpx * dpr
					f.__blurY = blurYpx * dpr
					f.__iterations = p.baseIterations
					f.__maxStepPx = p.maxStepPx * dpr
					f.__maxIterations = p.maxIterations
				}
			}

			const padXpx = Math.min(512, Math.ceil(maxXpx) + 6)
			const padYpx = Math.min(512, Math.ceil(maxYpx) + 6)
			const padX = padXpx / zoom
			const padY = padYpx / zoom
			const tex = canvas.applyFilters(entry.id, localW, localH, padX, padY, normalizedFilters, (childTarget) => {
				this.renderSubtreeIntoLocalTargetImpl(canvas, childTarget as LocalTargetSize, entry.id, 0, 0, true)
			})
			this.drawFilteredTextureToLocal(canvas, target, x, y, localW + padX * 2, localH + padY * 2, tex, nodeOpacity, nodeRotation)
			return
		}

		// 绘制节点自身（不应用自身滤镜；自身滤镜由外层 applyFilters 处理）
		const visualOpacity = ignoreSelfOpacityRotation ? 1 : nodeOpacity
		const visualRotation = ignoreSelfOpacityRotation ? 0 : nodeRotation
		const localNode: RenderNode = {
			...entry,
			transform: {
				...entry.localTransform,
				x,
				y,
				width: localW,
				height: localH,
				rotation: visualRotation,
				opacity: visualOpacity,
			},
		}
		this.getRenderer(entry.type).renderLocal(canvas, target, localNode, { opacity: visualOpacity, rotation: visualRotation } satisfies RenderContext)

		// 绘制子节点：在当前 target 内按“本地平移”累加；子节点自身滤镜在本函数内递归处理。
		if (entry.children?.length) {
			for (const childId of entry.children) {
				const child = this.nodesById.get(childId)
				if (!child) continue
				const dx = Number(child.localTransform.x ?? 0)
				const dy = Number(child.localTransform.y ?? 0)
				this.renderSubtreeIntoLocalTargetImpl(canvas, target, childId, x + dx, y + dy, false)
			}
		}
	}

	private drawStageBackgroundImage(canvas: DwebCanvasGL, opacity: number) {
		const src = (this.stageBackground.imageSrc || '').trim()
		if (!src) return
		const wrap = this.stageBackground.repeat ? 'repeat' : 'clamp'
		const tex = canvas.getImageTexture(src, wrap)
		const size = canvas.getImageSize(src)
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
		return hitTestRotatedRects(this.renderOrder as unknown as PickableRectNode[], world)
	}

	queryNodesInWorldRect(worldRect: { x0: number; y0: number; x1: number; y1: number }): HitTestResult[] {
		return queryRotatedRectsInWorldRect(this.renderOrder as unknown as PickableRectNode[], worldRect)
	}
}

