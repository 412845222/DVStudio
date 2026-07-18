import type {
	VideoSceneState,
	VideoSceneTreeNode,
	VideoSceneUserNodeType,
	VideoSceneNodeTransform
} from '../../../core/scene'
import { DwebCanvasGL, themeRgba, type IDwebGLScene, type Vec2 } from '../canvas/DwebCanvasGL'
import {
	hitTestRotatedRects,
	queryRotatedRectsInWorldRect,
	type PickableRectNode
} from '../picking'
import type { RenderContext, RenderNode, LocalTargetSize } from '../renderers/types'
import { NodeRenderer } from '../renderers/NodeRenderer'
import { BaseRenderer } from '../renderers/BaseRenderer'
import { RectRenderer } from '../renderers/RectRenderer'
import { TextRenderer } from '../renderers/TextRenderer'
import { ImageRenderer } from '../renderers/ImageRenderer'
import { LineRenderer } from '../renderers/LineRenderer'
import { VideoRenderer } from '../renderers/VideoRenderer'
import { videoTexturePool } from '../renderers/VideoTexturePool'
import { normalizeLineLocalPoints } from '../../../core/scene/geometry'

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
	} = {
		type: 'color',
		color: '#111111',
		opacity: 1,
		imageSrc: '',
		imageFit: 'contain',
		repeat: false
	}

	private readonly baseRenderer = new BaseRenderer()
	private readonly rectRenderer = new RectRenderer()
	private readonly textRenderer = new TextRenderer()
	private readonly imageRenderer = new ImageRenderer()
	private readonly lineRenderer = new LineRenderer()
	private readonly videoRenderer = new VideoRenderer()
	private readonly rendererByType = new Map<VideoSceneUserNodeType, NodeRenderer>([
		['base', this.baseRenderer],
		['rect', this.rectRenderer],
		['text', this.textRenderer],
		['image', this.imageRenderer],
		['line', this.lineRenderer],
		['video', this.videoRenderer]
	])

	private frameFilterQualityMax: 'low' | 'mid' | 'high' = 'high'
	private exportTransparent = false

	setExportTransparent(v: boolean) {
		this.exportTransparent = !!v
	}

	private getLineFilterContentSize(
		node: { transform: { width?: number; height?: number }; props?: Record<string, unknown> },
		zoom: number
	): { w: number; h: number } {
		const zoomSafe = Math.max(1e-3, Number(zoom) || 1)
		const baseW = Math.max(1, Number(node.transform?.width ?? 1))
		const baseH = Math.max(1, Number(node.transform?.height ?? 1))

		const props = node.props as Record<string, unknown> ?? {}
		const p = normalizeLineLocalPoints({ props, width: baseW, height: baseH })
		const startX = p.startX
		const startY = p.startY
		const endX = p.endX
		const endY = p.endY
		const anchorX = p.anchorX
		const anchorY = p.anchorY
		const lineWidthPx = Math.max(1, Number(props?.lineWidth ?? 4))
		const thickness = lineWidthPx / zoomSafe
		const halfT = Math.max(0, thickness / 2)

		const p0 = { x: startX, y: startY }
		const p1 = { x: anchorX, y: anchorY }
		const p2 = { x: endX, y: endY }
		const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
		const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
		const approxLen = d01 + d12
		const segCount = Math.max(8, Math.min(96, Math.floor(approxLen / 18) + 12))

		let minX = Number.POSITIVE_INFINITY
		let minY = Number.POSITIVE_INFINITY
		let maxX = Number.NEGATIVE_INFINITY
		let maxY = Number.NEGATIVE_INFINITY
		for (let i = 0; i <= segCount; i++) {
			const t = i / segCount
			const mt = 1 - t
			const lx = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x
			const ly = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
			if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue
			minX = Math.min(minX, lx)
			minY = Math.min(minY, ly)
			maxX = Math.max(maxX, lx)
			maxY = Math.max(maxY, ly)
		}

		if (
			!Number.isFinite(minX) ||
			!Number.isFinite(minY) ||
			!Number.isFinite(maxX) ||
			!Number.isFinite(maxY)
		) {
			return { w: baseW, h: baseH }
		}

		minX -= halfT
		minY -= halfT
		maxX += halfT
		maxY += halfT

		// Offscreen targets are centered at (0,0). Use symmetric extents to ensure
		// lines remain visible even if anchors are moved outside the default node box.
		const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX))
		const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY))
		return { w: Math.max(1, 2 * maxAbsX), h: Math.max(1, 2 * maxAbsY) }
	}

	private getFilterContentSize(
		node: {
			type: string
			transform: { width?: number; height?: number }
			props?: Record<string, unknown>
		},
		zoom: number
	): { w: number; h: number } {
		const w = Math.max(1, Number(node.transform?.width ?? 1))
		const h = Math.max(1, Number(node.transform?.height ?? 1))
		if (node.type === 'line') return this.getLineFilterContentSize(node, zoom)
		return { w, h }
	}

	private getLocalFilterRenderPivotPos(
		transform: { pivotX?: number; pivotY?: number },
		w: number,
		h: number,
		type: string
	): { x: number; y: number } {
		// Offscreen targets are centered at (0,0). For pivot != 0.5, the node's local geometry
		// is not symmetric around the pivot. If we render with pivot at (0,0), half can be clipped.
		// So we place the pivot so that the geometry center ends up at (0,0).
		if (type === 'line') return { x: 0, y: 0 }
		const px =
			typeof transform.pivotX === 'number' && Number.isFinite(transform.pivotX)
				? Math.max(0, Math.min(1, transform.pivotX))
				: 0.5
		const py =
			typeof transform.pivotY === 'number' && Number.isFinite(transform.pivotY)
				? Math.max(0, Math.min(1, transform.pivotY))
				: 0.5
		return { x: (px - 0.5) * w, y: (py - 0.5) * h }
	}

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

	setCanvas(canvas: DwebCanvasGL | null) {
		videoTexturePool.setCanvas(canvas)
	}

	private videoSourcesSignature = ''

	collectVideoSources(): Array<{ id: string; src: string }> {
		const out = new Map<string, { id: string; src: string }>()
		for (const n of this.renderOrder) {
			if (n.type !== 'video') continue
			const props = n.props as Record<string, unknown> ?? {}
			const videoId = String(props.videoId ?? n.id ?? '').trim()
			const src = (n.imageSrc ?? String(props.videoPath ?? '')).trim()
			if (!videoId || !src) continue
			out.set(videoId, { id: videoId, src })
		}
		return Array.from(out.values())
	}

	initVideoTextures() {
		const videos = this.collectVideoSources()
		const sigParts: string[] = []
		for (const v of videos) sigParts.push(v.id + '=' + v.src)
		const sig = sigParts.join('|')
		if (sig === this.videoSourcesSignature && videos.every(v => !!videoTexturePool.getEntry(v.id))) {
			return
		}
		this.videoSourcesSignature = sig
		for (const v of videos) {
			if (!videoTexturePool.getEntry(v.id)) {
				videoTexturePool.getOrCreate(v.id, v.src, { muted: true, loop: true })
			}
		}
	}

	needsRerenderFromVideo(): boolean {
		return videoTexturePool.hasPendingRenders()
	}

	clearVideoRenderFlag() {
		videoTexturePool.clearRenderFlag()
	}

	seekVideo(id: string, time: number): Promise<void> {
		const entry = videoTexturePool.getEntry(id)
		if (!entry) return Promise.resolve()
		return videoTexturePool.seek(entry, time)
	}

	seekVideoFast(id: string, time: number): void {
		const entry = videoTexturePool.getEntry(id)
		if (!entry) return
		videoTexturePool.seekFast(entry, time)
	}

	startVideoScrubbing(id: string, time: number): void {
		const entry = videoTexturePool.getEntry(id)
		if (!entry) return
		videoTexturePool.startScrubbing(entry, time)
	}

	scrubVideoTo(id: string, time: number): void {
		const entry = videoTexturePool.getEntry(id)
		if (!entry) return
		videoTexturePool.scrubTo(entry, time)
	}

	endVideoScrubbing(id: string): Promise<void> {
		const entry = videoTexturePool.getEntry(id)
		if (!entry) return Promise.resolve()
		return videoTexturePool.endScrubbing(entry)
	}

	getVideoDuration(id: string): number {
		return videoTexturePool.getDuration(id)
	}

	getVideoCurrentTime(id: string): number {
		return videoTexturePool.getCurrentTime(id)
	}

	getVideoBufferingState(id: string): { isBuffering: boolean; bufferProgress: number; readyState: number } {
		return videoTexturePool.getVideoBufferingState(id)
	}

	playVideo(id: string): Promise<void> {
		return videoTexturePool.play(id)
	}

	pauseVideo(id: string) {
		videoTexturePool.pause(id)
	}

	getFirstVideoNode(): { id: string; videoId: string } | null {
		for (const n of this.renderOrder) {
			if (n.type !== 'video') continue
			const props = n.props as Record<string, unknown> ?? {}
			const videoId = String(props.videoId ?? n.id ?? '').trim()
			if (videoId) return { id: n.id, videoId }
		}
		return null
	}

	collectImageSources(): Array<{ src: string; wrap: 'repeat' | 'clamp' }> {
		const out = new Map<string, { src: string; wrap: 'repeat' | 'clamp' }>()
		if (this.stageBackground.type === 'image') {
			const src = (this.stageBackground.imageSrc || '').trim()
			if (src) {
				const wrap = this.stageBackground.repeat ? 'repeat' : 'clamp'
				out.set(`${wrap}|${src}`, { src, wrap })
			}
		}
		for (const n of this.renderOrder) {
			if (n.type !== 'image') continue
			const src = (n.imageSrc || '').trim()
			if (!src) continue
			const props = n.props as Record<string, unknown> ?? {}
			const wrap = props.repeat ? 'repeat' : 'clamp'
			out.set(`${wrap}|${src}`, { src, wrap })
		}
		return Array.from(out.values())
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
				this.walkBuildRenderOrder(
					layer.id,
					root,
					{ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
					list,
					null
				)
			}
		}
		this.renderOrder = list as RenderNodeEx[]
	}

	private clampScale(v: unknown, fallback = 1): number {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(100, n))
	}

	private clampOpacity(v: unknown, fallback = 1): number {
		const n = Number(v)
		if (!Number.isFinite(n)) return fallback
		return Math.max(0, Math.min(1, n))
	}

	private getRenderer(type: VideoSceneUserNodeType): NodeRenderer {
		return this.rendererByType.get(type) ?? this.baseRenderer
	}

	private getPivotCenter(t: VideoSceneNodeTransform | undefined): { cx: number; cy: number } {
		const w = Math.max(1, Number(t?.width ?? 1))
		const h = Math.max(1, Number(t?.height ?? 1))
		const px =
			typeof t?.pivotX === 'number' && Number.isFinite(t.pivotX)
				? Math.max(0, Math.min(1, Number(t.pivotX)))
				: 0.5
		const py =
			typeof t?.pivotY === 'number' && Number.isFinite(t.pivotY)
				? Math.max(0, Math.min(1, Number(t.pivotY)))
				: 0.5
		return { cx: Number(t?.x ?? 0) + (0.5 - px) * w, cy: Number(t?.y ?? 0) + (0.5 - py) * h }
	}

	private drawFilteredTextureToWorld(
		canvas: DwebCanvasGL,
		x: number,
		y: number,
		w: number,
		h: number,
		texture: WebGLTexture,
		opacity: number,
		rotation: number,
		uv?: { u0: number; v0: number; u1: number; v1: number }
	) {
		canvas.drawTexturedRectUv(
			x,
			y,
			w,
			h,
			texture,
			opacity,
			rotation,
			uv ?? { u0: 0, v0: 1, u1: 1, v1: 0 }
		)
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
		rotation: number,
		uv?: { u0: number; v0: number; u1: number; v1: number }
	) {
		canvas.drawLocalTexturedRectUv(
			target,
			x,
			y,
			w,
			h,
			texture,
			opacity,
			rotation,
			uv ?? { u0: 0, v0: 1, u1: 1, v1: 0 }
		)
	}

	private resolveFilterQuality(filter: Record<string, unknown> | undefined): 'low' | 'mid' | 'high' {
		const q = String(filter?.quality ?? '')
		const v2 = !!filter?.qualityV2
		if (v2) {
			if (q === 'low' || q === 'mid' || q === 'high') return q
			return 'mid'
		}
		if (q === 'high') return 'mid'
		if (q === 'mid') return 'low'
		if (q === 'low') return 'low'
		return 'mid'
	}

	private clampQuality(q: 'low' | 'mid' | 'high', max: 'low' | 'mid' | 'high') {
		if (max === 'high') return q
		if (max === 'mid') return q === 'high' ? 'mid' : q
		return 'low'
	}

	private getBlurParams(filter: Record<string, unknown> | undefined): {
		factor: number
		baseIterations: number
		maxStepPx: number
		maxIterations: number
	} {
		const q0 = this.resolveFilterQuality(filter)
		const q = this.clampQuality(q0, this.frameFilterQualityMax)
		if (q === 'high') {
			return { factor: 6, baseIterations: 6, maxStepPx: 6, maxIterations: 14 }
		}
		if (q === 'mid') {
			return { factor: 4, baseIterations: 4, maxStepPx: 8, maxIterations: 12 }
		}
		// extra-low tuning under extreme load
		if (this.frameFilterQualityMax === 'low')
			return { factor: 1.5, baseIterations: 1, maxStepPx: 12, maxIterations: 8 }
		return { factor: 2, baseIterations: 2, maxStepPx: 10, maxIterations: 10 }
	}

	private walkBuildRenderOrder(
		layerId: string,
		node: VideoSceneTreeNode,
		parentWorld: Vec2 & { scaleX: number; scaleY: number; opacity: number },
		out: RenderNode[],
		parentUserId: string | null
	) {
		const hasTransform = !!node.transform

		const dx = hasTransform ? Number(node.transform?.x ?? 0) : 0
		const dy = hasTransform ? Number(node.transform?.y ?? 0) : 0
		const localScaleLegacy = hasTransform ? this.clampScale(Number(node.transform?.scale ?? 1), 1) : 1
		const localScaleX = hasTransform
			? this.clampScale(node.transform?.scaleX, localScaleLegacy)
			: 1
		const localScaleY = hasTransform
			? this.clampScale(node.transform?.scaleY, localScaleLegacy)
			: 1
		const localOpacity = hasTransform ? this.clampOpacity(node.transform?.opacity, 1) : 1

		const nodeWorld = hasTransform
			? {
					x: parentWorld.x + dx * parentWorld.scaleX,
					y: parentWorld.y + dy * parentWorld.scaleY,
					scaleX: parentWorld.scaleX * localScaleX,
					scaleY: parentWorld.scaleY * localScaleY,
					opacity: this.clampOpacity(parentWorld.opacity * localOpacity, 1)
				}
			: parentWorld

		const nextParentWorld = hasTransform ? nodeWorld : parentWorld
		let nextParentUserId = parentUserId

		if (node.category === 'user' && node.transform) {
			const type = (node.userType ?? 'base') as VideoSceneUserNodeType
			const props = node.props as Record<string, unknown> ?? {}
			const textContent =
				typeof node.props?.textContent === 'string' ? node.props.textContent : undefined
			const rawFontSize = Number(node.props?.fontSize)
			const fontSize = Number.isFinite(rawFontSize) ? rawFontSize : undefined
			let imageSrc = typeof props.imagePath === 'string' ? props.imagePath : undefined
			const imageId = String(props?.imageId ?? '').trim()
			if (imageId && this.state?.imageAssets?.[imageId]?.url) {
				imageSrc = this.state.imageAssets[imageId].url
			}
			if (type === 'video') {
				const videoId = String(props?.videoId ?? '').trim()
				const videoPath = String(props?.videoPath ?? '')
				if (videoId && this.state?.videoAssets?.[videoId]?.url) {
					imageSrc = this.state.videoAssets[videoId].url
				} else if (videoPath) {
					imageSrc = videoPath
				}
			}
			const localTransform: VideoSceneNodeTransform = {
				...node.transform,
				x: node.transform.x ?? 0,
				y: node.transform.y ?? 0,
				rotation: node.transform.rotation ?? 0,
				opacity: this.clampOpacity(node.transform.opacity, 1),
				scaleX: this.clampScale(
					node.transform.scaleX,
					this.clampScale(Number(node.transform.scale ?? 1), 1)
				),
				scaleY: this.clampScale(
					node.transform.scaleY,
					this.clampScale(Number(node.transform.scale ?? 1), 1)
				)
			}

			const baseW = Math.max(1, Number(node.transform.width ?? 1))
			const baseH = Math.max(1, Number(node.transform.height ?? 1))
			const worldW = Math.max(1, baseW * nodeWorld.scaleX)
			const worldH = Math.max(1, baseH * nodeWorld.scaleY)
			const entry: RenderNodeEx = {
				layerId,
				id: node.id,
				type,
				transform: {
					...node.transform,
					x: nodeWorld.x,
					y: nodeWorld.y,
					width: worldW,
					height: worldH,
					rotation: node.transform.rotation ?? 0,
					opacity: nodeWorld.opacity,
					scaleX: nodeWorld.scaleX,
					scaleY: nodeWorld.scaleY
				},
				props,
				text: textContent,
				fontSize,
				imageSrc,
				parentId: parentUserId,
				children: [],
				localTransform
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

		// Frame filter pressure: used to auto-downgrade quality for stability.
		let filterNodeCount = 0
		for (const n of this.renderOrder) {
			const props = n.props as Record<string, unknown> ?? {}
			const list = Array.isArray(props.filters) ? props.filters : []
			if (!list.length) continue
			if (
				list.some((f: unknown) => {
					if (f && typeof f === 'object') {
						const fo = f as Record<string, unknown>
						return String(fo.type || '') === 'glow' || String(fo.type || '') === 'blur'
					}
					return false
				})
			)
				filterNodeCount++
		}
		canvas.setFilterNodePressure(filterNodeCount)
		this.frameFilterQualityMax =
			filterNodeCount >= 80 ? 'low' : filterNodeCount >= 40 ? 'mid' : 'high'

		let minX = 0
		let maxX = 0
		let minY = 0
		let maxY = 0
		if (!this.exportTransparent) {
			// --- canvas background grid (for positioning) ---
			const { width: screenW, height: screenH } = canvas.size
			const tl = canvas.screenToWorld({ x: 0, y: 0 })
			const br = canvas.screenToWorld({ x: screenW, y: screenH })
			minX = Math.min(tl.x, br.x)
			maxX = Math.max(tl.x, br.x)
			minY = Math.min(tl.y, br.y)
			maxY = Math.max(tl.y, br.y)
			canvas.drawRect(
				(minX + maxX) / 2,
				(minY + maxY) / 2,
				maxX - minX,
				maxY - minY,
				themeRgba.bg(1)
			)
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
		}

		if (!this.exportTransparent) {
			// --- stage background (aspect ratio / size defined by stageSize) ---
			const bgOpacity = Math.max(0, Math.min(1, Number(this.stageBackground.opacity ?? 1)))
			const stageBgColor = canvas.parseHexColor(this.stageBackground.color || '#111111', bgOpacity)
			canvas.drawRect(0, 0, this.stageSize.width, this.stageSize.height, stageBgColor)
			if (this.stageBackground.type === 'image') {
				this.drawStageBackgroundImage(canvas, bgOpacity)
			}
			// stage border (1px in screen space)
			const borderW = 1 / canvas.viewport.zoom
			canvas.drawRect(
				0,
				-this.stageSize.height / 2 + borderW / 2,
				this.stageSize.width,
				borderW,
				themeRgba.border(1)
			)
			canvas.drawRect(
				0,
				this.stageSize.height / 2 - borderW / 2,
				this.stageSize.width,
				borderW,
				themeRgba.border(1)
			)
			canvas.drawRect(
				-this.stageSize.width / 2 + borderW / 2,
				0,
				borderW,
				this.stageSize.height,
				themeRgba.border(1)
			)
			canvas.drawRect(
				this.stageSize.width / 2 - borderW / 2,
				0,
				borderW,
				this.stageSize.height,
				themeRgba.border(1)
			)
		}

		const zoom = Math.max(1e-3, canvas.viewport.zoom)
		const dpr = Math.max(1, canvas.getPixelRatio())
		// user nodes in order
		const skipped = new Set<string>()
		for (const n of this.renderOrder) {
			if (skipped.has(n.id)) continue
			const rotation = n.transform.rotation ?? 0
			const opacity = Math.max(0, Math.min(1, n.transform.opacity ?? 1))
			const sx0 = Number(n.transform.scaleX ?? 1)
			const sy0 = Number(n.transform.scaleY ?? 1)
			const sxNode = Number.isFinite(sx0) ? Math.max(0, Math.min(100, sx0)) : 1
			const syNode = Number.isFinite(sy0) ? Math.max(0, Math.min(100, sy0)) : 1
			if (opacity <= 1e-5 || sxNode <= 1e-5 || syNode <= 1e-5) {
				skipped.add(n.id)
				this.markDescendantsSkipped(n.id, skipped)
				continue
			}
			const props = n.props as Record<string, unknown> ?? {}
			const nodeFilters = Array.isArray(props.filters) ? props.filters : []
			const contentSize = this.getFilterContentSize(n, zoom)
			const nodeW = contentSize.w
			const nodeH = contentSize.h
			if (nodeFilters.length > 0) {
				// compute required padding so blur/glow can extend outside node bounds (Flash-like)
				let maxXpx = 0
				let maxYpx = 0
				const normalizedFilters = nodeFilters
					.map((f) => (f && typeof f === 'object' ? { ...(f as Record<string, unknown>) } : f))
					.filter(Boolean)
					.filter((f) => {
						if (!f || typeof f !== 'object') return false
						const fo = f as Record<string, unknown>
						const ft = String(fo.type || '')
						if (ft === 'blur') {
							const bx = Math.max(0, Number(fo.blurX ?? 0) || 0)
							const by = Math.max(0, Number(fo.blurY ?? 0) || 0)
							return bx > 0 || by > 0
						}
						if (ft === 'glow') {
							const intensity = Math.max(0, Number(fo.intensity ?? 1))
							const bx = Math.max(0, Number(fo.blurX ?? 0) || 0)
							const by = Math.max(0, Number(fo.blurY ?? 0) || 0)
							return intensity > 0 && (bx > 0 || by > 0)
						}
						return true
					})
				const hasFilters = normalizedFilters.length > 0
				if (!hasFilters) {
					this.getRenderer(n.type).renderWorld(canvas, n, { opacity, rotation })
					continue
				}

				for (const f of normalizedFilters) {
					if (!f || typeof f !== 'object') continue
					const fo = f as Record<string, unknown>
					const ft = String(fo.type || '')
					if (ft === 'blur' || ft === 'glow') {
						const p = this.getBlurParams(fo)
						const sx0 = Number(n.transform.scaleX ?? 1)
						const sy0 = Number(n.transform.scaleY ?? 1)
						const sx = Number.isFinite(sx0) ? Math.max(0, Math.min(100, sx0)) : 1
						const sy = Number.isFinite(sy0) ? Math.max(0, Math.min(100, sy0)) : 1
						const blurXpx = Math.max(0, Number(fo.blurX ?? 0) || 0) * p.factor * sx
						const blurYpx = Math.max(0, Number(fo.blurY ?? 0) || 0) * p.factor * sy
						maxXpx = Math.max(maxXpx, blurXpx)
						maxYpx = Math.max(maxYpx, blurYpx)
						const fo2 = f as Record<string, unknown>
						fo2.__blurX = blurXpx * dpr
						fo2.__blurY = blurYpx * dpr
						fo2.__iterations = p.baseIterations
						fo2.__maxStepPx = p.maxStepPx * dpr
						fo2.__maxIterations = p.maxIterations
					}
				}

				// padding expressed in world units.
				// IMPORTANT: hard-capping padding here causes glow/blur to be clipped.
				// Instead, cap to the offscreen target's max dimension and (if needed)
				// proportionally downscale blur so we never truncate the effect.
				const MAX_FILTER_TARGET_DIM_PX = 1536 // must stay in sync with CanvasPostProcess guardrails
				const desiredPadXpx0 = Math.ceil(maxXpx) + 6
				const desiredPadYpx0 = Math.ceil(maxYpx) + 6
				const contentDevW = nodeW * (canvas.getFilterScale() || zoom * dpr)
				const contentDevH = nodeH * (canvas.getFilterScale() || zoom * dpr)
				const maxPadDevX = Math.max(0, (MAX_FILTER_TARGET_DIM_PX - contentDevW) / 2 - 2)
				const maxPadDevY = Math.max(0, (MAX_FILTER_TARGET_DIM_PX - contentDevH) / 2 - 2)
				const maxPadXpx = maxPadDevX / dpr
				const maxPadYpx = maxPadDevY / dpr
				const padXpx = Math.max(0, Math.min(desiredPadXpx0, maxPadXpx))
				const padYpx = Math.max(0, Math.min(desiredPadYpx0, maxPadYpx))
				const capX = desiredPadXpx0 > 1e-3 ? Math.min(1, padXpx / desiredPadXpx0) : 1
				const capY = desiredPadYpx0 > 1e-3 ? Math.min(1, padYpx / desiredPadYpx0) : 1
				if (capX < 0.999 || capY < 0.999) {
					for (const f of normalizedFilters) {
						if (!f || typeof f !== 'object') continue
						const fo = f as Record<string, unknown>
						const ft = String(fo.type || '')
						if (ft !== 'blur' && ft !== 'glow') continue
						if (typeof fo.__blurX === 'number') fo.__blurX *= capX
						if (typeof fo.__blurY === 'number') fo.__blurY *= capY
						if (typeof fo.__maxStepPx === 'number') fo.__maxStepPx *= Math.min(capX, capY)
					}
				}
				const padX = padXpx / zoom
				const padY = padYpx / zoom
				const out = canvas.applyFilters(
					n.id,
					nodeW,
					nodeH,
					padX,
					padY,
					normalizedFilters,
					(target) => {
						// Filters should affect only the node's own visuals, not its children.
						// Rendering the full subtree into the offscreen target causes child artifacts
						// (inner-glow, clipping to black, text box bleed).
						const entry = this.nodesById.get(n.id)
						const t = entry?.localTransform ?? n.transform
						const p = this.getLocalFilterRenderPivotPos(t, nodeW, nodeH, n.type)
						const sx0 = Number(n.transform.scaleX ?? 1)
						const sy0 = Number(n.transform.scaleY ?? 1)
						const sx = Number.isFinite(sx0) ? Math.max(0, Math.min(100, sx0)) : 1
						const sy = Number.isFinite(sy0) ? Math.max(0, Math.min(100, sy0)) : 1
						this.renderNodeSelfIntoLocalTarget(
							canvas,
							target as LocalTargetSize,
							n.id,
							p.x,
							p.y,
							true,
							{
								width: nodeW,
								height: nodeH,
								scaleX: sx,
								scaleY: sy
							}
						)
					}
				)
				const c = this.getPivotCenter(n.transform)
				const roundedMask = this.getRoundedMaskForWorld(n)
				if (roundedMask) {
					canvas.drawTexturedRectWithRoundedMask(
						c.cx,
						c.cy,
						nodeW + out.padX * 2,
						nodeH + out.padY * 2,
						out.tex,
						opacity,
						rotation,
						roundedMask.cx,
						roundedMask.cy,
						roundedMask.width,
						roundedMask.height,
						roundedMask.radius,
						out.uv ?? { u0: 0, v0: 1, u1: 1, v1: 0 }
					)
				} else {
					this.drawFilteredTextureToWorld(
						canvas,
						c.cx,
						c.cy,
						nodeW + out.padX * 2,
						nodeH + out.padY * 2,
						out.tex,
						opacity,
						rotation,
						out.uv
					)
				}
				continue
			}

			const roundedMask = this.getRoundedMaskForWorld(n)
			this.getRenderer(n.type).renderWorld(canvas, n, { opacity, rotation, roundedMask })
		}

		// --- selection overlay for base nodes ---
		// Base nodes are structural containers and are invisible by default.
		// When selected, draw a border as a top-most overlay (not affected by filters).
		if (this.state) {
			const ids: string[] = []
			if (this.state.selectedNodeIds?.length) ids.push(...this.state.selectedNodeIds)
			else if (this.state.selectedNodeId) ids.push(this.state.selectedNodeId)
			if (ids.length) {
				const zoom2 = Math.max(1e-3, canvas.viewport.zoom)
				const borderW2 = 1 / zoom2
				const borderColor = themeRgba.border(0.95)
				const transparent = { r: 0, g: 0, b: 0, a: 0 }
				for (const id of ids) {
					const entry = this.nodesById.get(id)
					if (!entry) continue
					if (entry.type !== 'base') continue
					const w = Math.max(1, Number(entry.transform.width ?? 1))
					const h = Math.max(1, Number(entry.transform.height ?? 1))
					const rot = Number(entry.transform.rotation ?? 0)
					const c = this.getPivotCenter(entry.transform)
					canvas.drawRoundedRect(c.cx, c.cy, w, h, 0, transparent, borderColor, borderW2, rot)
				}
			}
		}
	}

	private renderNodeSelfIntoLocalTarget(
		canvas: DwebCanvasGL,
		target: LocalTargetSize,
		nodeId: string,
		x: number,
		y: number,
		ignoreSelfOpacityRotation: boolean,
		overrideTransform?: Partial<
			Pick<VideoSceneNodeTransform, 'width' | 'height' | 'scaleX' | 'scaleY'>
		>
	) {
		const entry = this.nodesById.get(nodeId)
		if (!entry) return

		const localW0 = Number(entry.localTransform.width ?? 1)
		const localH0 = Number(entry.localTransform.height ?? 1)
		const localW = Math.max(1, Number(overrideTransform?.width ?? localW0) || 1)
		const localH = Math.max(1, Number(overrideTransform?.height ?? localH0) || 1)
		const nodeOpacity = Math.max(0, Math.min(1, Number(entry.localTransform.opacity ?? 1)))
		const nodeRotation = Number(entry.localTransform.rotation ?? 0)

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
				scaleX: Number(
					overrideTransform?.scaleX ??
						entry.transform.scaleX ??
						entry.localTransform.scaleX ??
						1
				),
				scaleY: Number(
					overrideTransform?.scaleY ??
						entry.transform.scaleY ??
						entry.localTransform.scaleY ??
						1
				),
				rotation: visualRotation,
				opacity: visualOpacity
			}
		}

		// NOTE: do not apply parent mask in the offscreen (filter) pass.
		// Masking (rounded-rect parent clips image child) is applied at world draw time,
		// including when the node has filters (see drawTexturedRectWithRoundedMask above).
		this.getRenderer(entry.type).renderLocal(canvas, target, localNode, {
			opacity: visualOpacity,
			rotation: visualRotation
		} satisfies RenderContext)
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

	private renderSubtreeIntoLocalTarget(
		canvas: DwebCanvasGL,
		target: LocalTargetSize,
		rootId: string,
		ignoreSelfOpacityRotation: boolean
	) {
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
		const nodeOpacity = Math.max(0, Math.min(1, Number(entry.localTransform.opacity ?? 1)))
		const nodeRotation = Number(entry.localTransform.rotation ?? 0)

		// For lines, the visual path can extend outside the default node box.
		// When applying glow/blur, allocate offscreen targets based on the real path bounds.
		const filterContentSize = this.getFilterContentSize(
			{ type: entry.type, transform: { width: localW, height: localH }, props: entry.props as Record<string, unknown> },
			zoom
		)
		const filterW = filterContentSize.w
		const filterH = filterContentSize.h

		const props = entry.props as Record<string, unknown> ?? {}
		const childFilters = Array.isArray(props.filters) ? props.filters : []
		const normalizedChildFilters = childFilters
			.map((f) => (f && typeof f === 'object' ? { ...(f as Record<string, unknown>) } : f))
			.filter(Boolean)
			.filter((f) => {
				if (!f || typeof f !== 'object') return false
				const fo = f as Record<string, unknown>
				const ft = String(fo.type || '')
				if (ft === 'blur') {
					const bx = Math.max(0, Number(fo.blurX ?? 0) || 0)
					const by = Math.max(0, Number(fo.blurY ?? 0) || 0)
					return bx > 0 || by > 0
				}
				if (ft === 'glow') {
					const intensity = Math.max(0, Number(fo.intensity ?? 1))
					const bx = Math.max(0, Number(fo.blurX ?? 0) || 0)
					const by = Math.max(0, Number(fo.blurY ?? 0) || 0)
					return intensity > 0 && (bx > 0 || by > 0)
				}
				return true
			})
		const hasSelfFilters = normalizedChildFilters.length > 0

		if (hasSelfFilters && !ignoreSelfOpacityRotation) {
			// 节点自身带滤镜：只渲染“自身视觉”到离屏，然后贴回。
			// 不把 children 渲染进离屏，否则会产生子节点被父滤镜影响/裁切等问题。
			let maxXpx = 0
			let maxYpx = 0
			const normalizedFilters = normalizedChildFilters

			for (const f of normalizedFilters) {
				if (!f || typeof f !== 'object') continue
				const fo = f as Record<string, unknown>
				const ft = String(fo.type || '')
				if (ft === 'blur' || ft === 'glow') {
					const p = this.getBlurParams(fo)
					const sx0 = Number(entry.transform.scaleX ?? 1)
					const sy0 = Number(entry.transform.scaleY ?? 1)
					const sx = Number.isFinite(sx0) ? Math.max(0, Math.min(100, sx0)) : 1
					const sy = Number.isFinite(sy0) ? Math.max(0, Math.min(100, sy0)) : 1
					const blurXpx = Math.max(0, Number(fo.blurX ?? 0) || 0) * p.factor * sx
					const blurYpx = Math.max(0, Number(fo.blurY ?? 0) || 0) * p.factor * sy
					maxXpx = Math.max(maxXpx, blurXpx)
					maxYpx = Math.max(maxYpx, blurYpx)
					const fo2 = f as Record<string, unknown>
					fo2.__blurX = blurXpx * dpr
					fo2.__blurY = blurYpx * dpr
					fo2.__iterations = p.baseIterations
					fo2.__maxStepPx = p.maxStepPx * dpr
					fo2.__maxIterations = p.maxIterations
				}
			}

			// padding expressed in world units.
			// IMPORTANT: hard-capping padding here causes glow/blur to be clipped.
			// Instead, cap to the offscreen target's max dimension and (if needed)
			// proportionally downscale blur so we never truncate the effect.
			const MAX_FILTER_TARGET_DIM_PX = 1536 // must stay in sync with CanvasPostProcess guardrails
			const desiredPadXpx0 = Math.ceil(maxXpx) + 6
			const desiredPadYpx0 = Math.ceil(maxYpx) + 6
			const desiredScale = canvas.getFilterScale() || zoom * dpr
			const contentDevW = filterW * desiredScale
			const contentDevH = filterH * desiredScale
			const maxPadDevX = Math.max(0, (MAX_FILTER_TARGET_DIM_PX - contentDevW) / 2 - 2)
			const maxPadDevY = Math.max(0, (MAX_FILTER_TARGET_DIM_PX - contentDevH) / 2 - 2)
			const maxPadXpx = maxPadDevX / dpr
			const maxPadYpx = maxPadDevY / dpr
			const padXpx = Math.max(0, Math.min(desiredPadXpx0, maxPadXpx))
			const padYpx = Math.max(0, Math.min(desiredPadYpx0, maxPadYpx))
			const capX = desiredPadXpx0 > 1e-3 ? Math.min(1, padXpx / desiredPadXpx0) : 1
			const capY = desiredPadYpx0 > 1e-3 ? Math.min(1, padYpx / desiredPadYpx0) : 1
			if (capX < 0.999 || capY < 0.999) {
				for (const f of normalizedFilters) {
					if (!f || typeof f !== 'object') continue
					const fo = f as Record<string, unknown>
					const ft = String(fo.type || '')
					if (ft !== 'blur' && ft !== 'glow') continue
					if (typeof fo.__blurX === 'number') fo.__blurX *= capX
					if (typeof fo.__blurY === 'number') fo.__blurY *= capY
					if (typeof fo.__maxStepPx === 'number') fo.__maxStepPx *= Math.min(capX, capY)
				}
			}
			const padX = padXpx / zoom
			const padY = padYpx / zoom
			const out = canvas.applyFilters(
				entry.id,
				filterW,
				filterH,
				padX,
				padY,
				normalizedFilters,
				(childTarget) => {
					const p = this.getLocalFilterRenderPivotPos(
						entry.localTransform,
						filterW,
						filterH,
						entry.type
					)
					this.renderNodeSelfIntoLocalTarget(
						canvas,
						childTarget as LocalTargetSize,
						entry.id,
						p.x,
						p.y,
						true
					)
				}
			)
			const px =
				typeof entry.localTransform.pivotX === 'number'
					? entry.localTransform.pivotX
					: 0.5
			const py =
				typeof entry.localTransform.pivotY === 'number'
					? entry.localTransform.pivotY
					: 0.5
			const cx = x + (0.5 - px) * filterW
			const cy = y + (0.5 - py) * filterH
			this.drawFilteredTextureToLocal(
				canvas,
				target,
				cx,
				cy,
				filterW + out.padX * 2,
				filterH + out.padY * 2,
				out.tex,
				nodeOpacity,
				nodeRotation,
				out.uv
			)

			// children should render normally on top of the filtered parent
			if (entry.children?.length) {
				for (const childId of entry.children) {
					const child = this.nodesById.get(childId)
					if (!child) continue
					const dx = Number(child.localTransform.x ?? 0)
					const dy = Number(child.localTransform.y ?? 0)
					this.renderSubtreeIntoLocalTargetImpl(canvas, target, childId, x + dx, y + dy, false)
				}
			}
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
				opacity: visualOpacity
			}
		}
		const roundedMask = this.getRoundedMaskForLocal(entry, x, y)
		this.getRenderer(entry.type).renderLocal(canvas, target, localNode, {
			opacity: visualOpacity,
			rotation: visualRotation,
			roundedMask
		} satisfies RenderContext)

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

	private getRoundedMaskForWorld(node: RenderNodeEx): RenderContext['roundedMask'] | undefined {
		if (node.type !== 'image' || !node.parentId) return undefined
		const parent = this.nodesById.get(node.parentId)
		if (!parent || parent.type !== 'rect') return undefined
		const parentW = Math.max(1, Number(parent.transform.width ?? 1))
		const parentH = Math.max(1, Number(parent.transform.height ?? 1))
		const parentCenter = this.getPivotCenter(parent.transform)
		const parentProps = parent.props as Record<string, unknown> ?? {}
		const baseRadius = Math.max(0, Number(parentProps.cornerRadius ?? 0))
		const sx = Number(parent.transform.scaleX ?? 1)
		const sy = Number(parent.transform.scaleY ?? 1)
		const rScale =
			Number.isFinite(sx) && Number.isFinite(sy) ? Math.max(0, Math.min(100, Math.min(sx, sy))) : 1
		const radius = baseRadius * rScale
		return { cx: parentCenter.cx, cy: parentCenter.cy, width: parentW, height: parentH, radius }
	}

	private getRoundedMaskForLocal(
		node: RenderNodeEx,
		localX: number,
		localY: number
	): RenderContext['roundedMask'] | undefined {
		if (node.type !== 'image' || !node.parentId) return undefined
		const parent = this.nodesById.get(node.parentId)
		if (!parent || parent.type !== 'rect') return undefined
		const parentW = Math.max(1, Number(parent.localTransform.width ?? 1))
		const parentH = Math.max(1, Number(parent.localTransform.height ?? 1))
		const parentPivotX =
			typeof parent.localTransform.pivotX === 'number'
				? Math.max(0, Math.min(1, Number(parent.localTransform.pivotX)))
				: 0.5
		const parentPivotY =
			typeof parent.localTransform.pivotY === 'number'
				? Math.max(0, Math.min(1, Number(parent.localTransform.pivotY)))
				: 0.5
		const childLocalX = Number(node.localTransform.x ?? 0)
		const childLocalY = Number(node.localTransform.y ?? 0)
		const deltaX = localX - childLocalX
		const deltaY = localY - childLocalY
		const parentBaseX = Number(parent.localTransform.x ?? 0)
		const parentBaseY = Number(parent.localTransform.y ?? 0)
		const parentCx = parentBaseX + deltaX + (0.5 - parentPivotX) * parentW
		const parentCy = parentBaseY + deltaY + (0.5 - parentPivotY) * parentH
		const parentProps = parent.props as Record<string, unknown> ?? {}
		const radius = Math.max(0, Number(parentProps.cornerRadius ?? 0))
		return { cx: parentCx, cy: parentCy, width: parentW, height: parentH, radius }
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
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, {
				u0,
				v0,
				u1: u0 + visU,
				v1: v0 + visV
			})
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
			canvas.drawTexturedRectUv(0, 0, stageW, stageH, tex, opacity, 0, {
				u0,
				v0,
				u1: u0 + visU,
				v1: v0 + visV
			})
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

	queryNodesInWorldRect(worldRect: {
		x0: number
		y0: number
		x1: number
		y1: number
	}): HitTestResult[] {
		return queryRotatedRectsInWorldRect(
			this.renderOrder as unknown as PickableRectNode[],
			worldRect
		)
	}
}
