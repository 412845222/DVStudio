import { Vector2 } from '../graphbase/core/Vector2'
import { Rect } from '../graphbase/core/Rect'
import { Node } from '../graphbase/scene/Node'
import type { RenderContext } from '../graphbase/renderer/RenderContext'
import type { HitTestResult, HitTestable } from '../graphbase/scene/interfaces'
import type { Camera } from '../graphbase/renderer/Camera'
import type { Scene } from '../graphbase/scene/Scene'
import { MEDIA_TYPE_COLORS } from './types'
import { getThemeManager } from './theme'

const LINE_WIDTH = 2.5
const LINE_WIDTH_SELECTED = 4
const LINE_WIDTH_HOVER = 3.5
const BEZIER_CONTROL_DISTANCE = 80
const HIT_SCREEN_PX = 8
const HIT_MIN_WORLD = 6
const SELECTED_GLOW_SIZE = 14
const HOVER_GLOW_SIZE = 8
const BEZIER_COARSE_STEPS = 40
const BEZIER_REFINE_STEPS = 12

export interface ConnectionEndpoints {
	fromWorld: Vector2
	toWorld: Vector2
	mediaType?: string
	color?: string
}

export class Connection extends Node {
	data: {
		id: string
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
	}
	selected: boolean = false
	private _endpoints: ConnectionEndpoints | null = null
	private _mediaType: string = 'generic'

	constructor(data: {
		id: string
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
	}) {
		super('connection', data.id)
		this.data = data
		this.selectable = true
		this.draggable = false
		this.layer = 5
	}

	setEndpoints(endpoints: ConnectionEndpoints): void {
		this._endpoints = endpoints
		if (endpoints.mediaType) {
			this._mediaType = endpoints.mediaType
		}
		this.markDirty(1)
	}

	updateEndpoints(fromNode: any, toNode: any): void {
		const fromPort = fromNode.getOutputPort(this.data.fromAnchorId)
		const toPort = toNode.getInputPort(this.data.toAnchorId)
		if (fromPort && toPort) {
			this._endpoints = {
				fromWorld: fromPort.getWorldPosition(),
				toWorld: toPort.getWorldPosition(),
				mediaType: fromPort.mediaType
			}
			this._mediaType = fromPort.mediaType || 'generic'
			this.markDirty(1)
		}
	}

	private getColor(): string {
		const theme = getThemeManager()
		return (
			MEDIA_TYPE_COLORS[this._mediaType as keyof typeof MEDIA_TYPE_COLORS] ||
			theme.tokens.connectionLine
		)
	}

	private hexToRgba(hex: string, alpha: number): string {
		if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
		const h = hex.replace('#', '')
		const r = parseInt(h.substring(0, 2), 16)
		const g = parseInt(h.substring(2, 4), 16)
		const b = parseInt(h.substring(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	private getBezierPoints(from: Vector2, to: Vector2): { cp1: Vector2; cp2: Vector2 } {
		const dx = Math.abs(to.x - from.x)
		const dy = Math.abs(to.y - from.y)
		const controlDist = Math.max(BEZIER_CONTROL_DISTANCE, dx * 0.4, dy * 0.3)
		const dirX = to.x > from.x ? 1 : -1
		return {
			cp1: new Vector2(from.x + controlDist * dirX, from.y),
			cp2: new Vector2(to.x - controlDist * dirX, to.y)
		}
	}

	protected renderSelf(ctx: RenderContext): void {
		const c = ctx.ctx
		const camera = ctx.camera
		if (!this._endpoints) return

		const from = this._endpoints.fromWorld
		const to = this._endpoints.toWorld
		const color = this.getColor()
		const { cp1, cp2 } = this.getBezierPoints(from, to)

		const invZoom = 1 / camera.zoom
		let baseLineWidth = LINE_WIDTH
		let alpha = 0.85
		let glowAlpha = 0
		let glowSize = 0

		if (this.selected) {
			baseLineWidth = LINE_WIDTH_SELECTED
			alpha = 1
			glowAlpha = 0.45
			glowSize = SELECTED_GLOW_SIZE
		} else if (this.hovered) {
			baseLineWidth = LINE_WIDTH_HOVER
			alpha = 0.95
			glowAlpha = 0.25
			glowSize = HOVER_GLOW_SIZE
		}

		c.save()

		if (glowAlpha > 0) {
			c.shadowColor = color
			c.shadowBlur = glowSize
			c.strokeStyle = this.hexToRgba(color, glowAlpha)
			c.lineWidth = baseLineWidth + glowSize
			c.lineCap = 'round'
			c.beginPath()
			c.moveTo(from.x, from.y)
			c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y)
			c.stroke()
			c.shadowBlur = 0
		}

		c.strokeStyle = this.hexToRgba(color, alpha)
		c.lineWidth = baseLineWidth
		c.lineCap = 'round'
		c.beginPath()
		c.moveTo(from.x, from.y)
		c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y)
		c.stroke()

		const theme = getThemeManager()
		const highlightColor = theme.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)'
		c.strokeStyle = highlightColor
		c.lineWidth = Math.max(1, baseLineWidth * 0.4)
		c.beginPath()
		c.moveTo(from.x, from.y)
		c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y)
		c.stroke()

		c.restore()
	}

	private _evalBezier(t: number, from: Vector2, cp1: Vector2, cp2: Vector2, to: Vector2): Vector2 {
		const mt = 1 - t
		const mt2 = mt * mt
		const t2 = t * t
		const x = mt2 * mt * from.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t2 * t * to.x
		const y = mt2 * mt * from.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t2 * t * to.y
		return new Vector2(x, y)
	}

	private distanceToBezier(
		point: Vector2,
		from: Vector2,
		cp1: Vector2,
		cp2: Vector2,
		to: Vector2
	): number {
		let bestT = 0
		let minDist = Infinity
		for (let i = 0; i <= BEZIER_COARSE_STEPS; i++) {
			const t = i / BEZIER_COARSE_STEPS
			const p = this._evalBezier(t, from, cp1, cp2, to)
			const dist = Math.hypot(point.x - p.x, point.y - p.y)
			if (dist < minDist) {
				minDist = dist
				bestT = t
			}
		}

		const refineRadius = 1 / BEZIER_COARSE_STEPS
		const lo = Math.max(0, bestT - refineRadius)
		const hi = Math.min(1, bestT + refineRadius)
		for (let i = 1; i < BEZIER_REFINE_STEPS; i++) {
			const t = lo + (hi - lo) * (i / BEZIER_REFINE_STEPS)
			const p = this._evalBezier(t, from, cp1, cp2, to)
			const dist = Math.hypot(point.x - p.x, point.y - p.y)
			if (dist < minDist) {
				minDist = dist
			}
		}

		return minDist
	}

	getLocalBounds(): Rect {
		if (!this._endpoints) return new Rect(0, 0, 0, 0)
		const zoom = this.getCameraZoom()
		const hitWidthWorld = Math.max(HIT_SCREEN_PX / zoom, HIT_MIN_WORLD)
		const pad = Math.max(hitWidthWorld, 15)
		const fromLocal = this.worldToLocal(this._endpoints.fromWorld)
		const toLocal = this.worldToLocal(this._endpoints.toWorld)
		const minX = Math.min(fromLocal.x, toLocal.x) - pad
		const minY = Math.min(fromLocal.y, toLocal.y) - pad
		const maxX = Math.max(fromLocal.x, toLocal.x) + pad
		const maxY = Math.max(fromLocal.y, toLocal.y) + pad
		return Rect.fromPoints(new Vector2(minX, minY), new Vector2(maxX, maxY))
	}

	private getCameraZoom(): number {
		let p = this.parent
		while (p) {
			if ('camera' in p) return (p as Scene).camera.zoom
			p = (p as Node).parent
		}
		return 1
	}

	hitTest(localPoint: Vector2): HitTestResult | null {
		if (!this.visible) return null

		for (let i = this.children.length - 1; i >= 0; i--) {
			const child = this.children[i]
			if (child.visible && 'hitTest' in child) {
				const childLocal = child.worldToLocal(this.localToWorld(localPoint))
				const childHit = (child as unknown as HitTestable).hitTest(childLocal)
				if (childHit) return childHit
			}
		}

		const hitBounds = this.getHitBounds()
		if (!hitBounds.containsPoint(localPoint)) return null

		return this.hitTestSelf(localPoint)
	}

	getHitBounds(): Rect {
		return this.getLocalBounds()
	}

	isInFrustum(camera: Camera): boolean {
		if (!this._endpoints) return false
		return (
			camera.isWorldPointVisible(this._endpoints.fromWorld, 50) ||
			camera.isWorldPointVisible(this._endpoints.toWorld, 50)
		)
	}

	protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
		if (!this._endpoints) return null
		const worldPoint = this.localToWorld(localPoint)
		const from = this._endpoints.fromWorld
		const to = this._endpoints.toWorld
		const { cp1, cp2 } = this.getBezierPoints(from, to)
		const dist = this.distanceToBezier(worldPoint, from, cp1, cp2, to)
		const zoom = this.getCameraZoom()
		const hitWidthWorld = Math.max(HIT_SCREEN_PX / zoom, HIT_MIN_WORLD)
		if (dist <= hitWidthWorld) {
			return {
				node: this,
				localPoint: localPoint.clone(),
				worldPoint: worldPoint.clone(),
				cursor: 'pointer'
			}
		}
		return null
	}

	onSelect(): void {
		this.selected = true
		this.markDirty(1)
	}

	onDeselect(): void {
		this.selected = false
		this.markDirty(1)
	}
}

export class TempConnection extends Node {
	fromWorld: Vector2 | null = null
	toWorld: Vector2 | null = null
	mediaType: string = 'generic'
	valid: boolean = true

	constructor() {
		super('tempconnection', 'temp-connection')
		this.selectable = false
		this.draggable = false
		this.layer = 4
	}

	setPoints(
		from: Vector2,
		to: Vector2,
		mediaType: string = 'generic',
		valid: boolean = true
	): void {
		this.fromWorld = from.clone()
		this.toWorld = to.clone()
		this.mediaType = mediaType
		this.valid = valid
		this.markDirty(1)
	}

	clear(): void {
		this.fromWorld = null
		this.toWorld = null
		this.markDirty(1)
	}

	private hexToRgba(hex: string, alpha: number): string {
		if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
		const h = hex.replace('#', '')
		const r = parseInt(h.substring(0, 2), 16)
		const g = parseInt(h.substring(2, 4), 16)
		const b = parseInt(h.substring(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	protected renderSelf(ctx: RenderContext): void {
		const c = ctx.ctx
		const camera = ctx.camera
		if (!this.fromWorld || !this.toWorld) return

		const theme = getThemeManager()
		const defaultColor = theme.tokens.connectionLine
		const color = this.valid
			? MEDIA_TYPE_COLORS[this.mediaType as keyof typeof MEDIA_TYPE_COLORS] || defaultColor
			: '#e74c3c'
		const dx = Math.abs(this.toWorld.x - this.fromWorld.x)
		const dy = Math.abs(this.toWorld.y - this.fromWorld.y)
		const controlDist = Math.max(BEZIER_CONTROL_DISTANCE, dx * 0.4, dy * 0.3)
		const dirX = this.toWorld.x > this.fromWorld.x ? 1 : -1
		const cp1 = new Vector2(this.fromWorld.x + controlDist * dirX, this.fromWorld.y)
		const cp2 = new Vector2(this.toWorld.x - controlDist * dirX, this.toWorld.y)

		const invZoom = 1 / camera.zoom

		c.save()

		if (!this.valid) {
			c.shadowColor = '#e74c3c'
			c.shadowBlur = 8
		}

		c.strokeStyle = this.hexToRgba(color, this.valid ? 0.8 : 0.9)
		c.lineWidth = LINE_WIDTH
		c.lineCap = 'round'
		c.setLineDash([8, 5])
		c.beginPath()
		c.moveTo(this.fromWorld.x, this.fromWorld.y)
		c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, this.toWorld.x, this.toWorld.y)
		c.stroke()
		c.setLineDash([])
		c.shadowBlur = 0
		c.restore()
	}

	getLocalBounds(): Rect {
		if (!this.fromWorld || !this.toWorld) return new Rect(0, 0, 0, 0)
		const pad = 30
		const minX = Math.min(this.fromWorld.x, this.toWorld.x) - pad
		const minY = Math.min(this.fromWorld.y, this.toWorld.y) - pad
		const maxX = Math.max(this.fromWorld.x, this.toWorld.x) + pad
		const maxY = Math.max(this.fromWorld.y, this.toWorld.y) + pad
		return Rect.fromPoints(new Vector2(minX, minY), new Vector2(maxX, maxY))
	}

	getHitBounds(): Rect {
		return new Rect(0, 0, 0, 0)
	}

	isInFrustum(camera: Camera): boolean {
		if (!this.fromWorld || !this.toWorld) return false
		return (
			camera.isWorldPointVisible(this.fromWorld, 50) || camera.isWorldPointVisible(this.toWorld, 50)
		)
	}

	protected hitTestSelf(_localPoint: Vector2): HitTestResult | null {
		return null
	}
}
