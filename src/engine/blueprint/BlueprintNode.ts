import { Vector2 } from '../graphbase/core/Vector2'
import { Rect } from '../graphbase/core/Rect'
import { Node } from '../graphbase/scene/Node'
import type { RenderContext } from '../graphbase/renderer/RenderContext'
import type { HitTestResult } from '../graphbase/scene/interfaces'
import { Port } from './Port'
import { resolveWorkflowResourceUrl } from '../../aiworkflow/domain/resource/safeWorkflowUrl'
import {
	NODE_HEADER_HEIGHT,
	NODE_BRACKET_SIZE,
	NODE_BORDER_WIDTH,
	NODE_INNER_PADDING,
	PORT_SPACING,
	PORT_MIN_MARGIN_TOP,
	PORT_MIN_MARGIN_BOTTOM,
	PORT_SIZE,
	RESIZE_HANDLE_SIZE,
	RESIZE_HANDLE_HIT_SIZE,
	RESIZE_HANDLE_OFFSET,
	MIN_NODE_WIDTH,
	MIN_NODE_HEIGHT,
	type BlueprintNodeData,
	type LegacyResourceData,
	type PortSpec,
	type ResizeCorner
} from './types'
import { getThemeManager } from './theme'
import { t, translateNodeTitle, translatePortLabel } from './i18n'

type TextureState = 'loading' | 'ready' | 'error'

interface CachedBlueprintTexture {
	canvas: HTMLCanvasElement
	naturalWidth: number
	naturalHeight: number
	lastUsed: number
	refCount: number
	state: TextureState
}

const BLUEPRINT_TEXTURE_POOL = new Map<string, CachedBlueprintTexture>()
const MAX_TEXTURE_POOL_SIZE = 100
const TEXTURE_PREVIEW_MAX = 288
const TEXTURE_ERROR_COOLDOWN_MS = 30000

export function clearBlueprintNodeImageCache(): void {
	BLUEPRINT_TEXTURE_POOL.clear()
	textureReadyCallbacks.clear()
}

function evictLRUTextures(): void {
	if (BLUEPRINT_TEXTURE_POOL.size <= MAX_TEXTURE_POOL_SIZE) return
	const target = Math.floor(MAX_TEXTURE_POOL_SIZE * 0.8)
	const entries = Array.from(BLUEPRINT_TEXTURE_POOL.entries())
		.filter(([, t]) => t.refCount <= 0 && t.state !== 'loading')
		.sort((a, b) => a[1].lastUsed - b[1].lastUsed)
	while (BLUEPRINT_TEXTURE_POOL.size > target && entries.length > 0) {
		const [url] = entries.shift()!
		BLUEPRINT_TEXTURE_POOL.delete(url)
		textureReadyCallbacks.delete(url)
	}
	if (BLUEPRINT_TEXTURE_POOL.size > MAX_TEXTURE_POOL_SIZE) {
		const forced = Array.from(BLUEPRINT_TEXTURE_POOL.entries())
			.filter(([, t]) => t.state !== 'loading')
			.sort((a, b) => a[1].lastUsed - b[1].lastUsed)
		while (BLUEPRINT_TEXTURE_POOL.size > target && forced.length > 0) {
			const [url] = forced.shift()!
			BLUEPRINT_TEXTURE_POOL.delete(url)
			textureReadyCallbacks.delete(url)
		}
	}
}

function releaseTexture(url: string): void {
	const tex = BLUEPRINT_TEXTURE_POOL.get(url)
	if (tex && tex.refCount > 0) {
		tex.refCount--
	}
}

type TextureReadyCallback = () => void
const textureReadyCallbacks = new Map<string, TextureReadyCallback[]>()
const loadingUrls = new Set<string>()

function beginLoadTexture(url: string, onReady: TextureReadyCallback): void {
	if (!url) return
	const existing = BLUEPRINT_TEXTURE_POOL.get(url)
	if (existing && existing.state === 'ready') {
		existing.lastUsed = performance.now()
		return
	}
	if (existing && existing.state === 'loading') {
		const cbs = textureReadyCallbacks.get(url)
		if (cbs) {
			cbs.push(onReady)
		} else {
			textureReadyCallbacks.set(url, [onReady])
		}
		return
	}
	if (existing && existing.state === 'error') {
		if (existing.lastUsed + TEXTURE_ERROR_COOLDOWN_MS > performance.now()) {
			return
		}
		BLUEPRINT_TEXTURE_POOL.delete(url)
	}
	evictLRUTextures()
	BLUEPRINT_TEXTURE_POOL.set(url, {
		canvas: null as any,
		naturalWidth: 0,
		naturalHeight: 0,
		lastUsed: performance.now(),
		refCount: 0,
		state: 'loading'
	})
	textureReadyCallbacks.set(url, [onReady])
	loadingUrls.add(url)
	const img = new Image()
	img.crossOrigin = 'anonymous'
	img.onload = () => {
		loadingUrls.delete(url)
		const nw = img.naturalWidth
		const nh = img.naturalHeight
		if (!nw || !nh) {
			const eEntry = BLUEPRINT_TEXTURE_POOL.get(url)
			if (eEntry) {
				eEntry.state = 'error'
				eEntry.lastUsed = performance.now()
			}
			textureReadyCallbacks.delete(url)
			return
		}
		const scale = Math.min(TEXTURE_PREVIEW_MAX / nw, TEXTURE_PREVIEW_MAX / nh, 1)
		const cw = Math.max(1, Math.ceil(nw * scale))
		const ch = Math.max(1, Math.ceil(nh * scale))
		const offscreen = document.createElement('canvas')
		offscreen.width = cw
		offscreen.height = ch
		const octx = offscreen.getContext('2d')
		if (octx) {
			octx.drawImage(img, 0, 0, cw, ch)
		}
		const entry = BLUEPRINT_TEXTURE_POOL.get(url)
		if (entry) {
			entry.canvas = offscreen
			entry.naturalWidth = nw
			entry.naturalHeight = nh
			entry.lastUsed = performance.now()
			entry.state = 'ready'
		} else {
			BLUEPRINT_TEXTURE_POOL.set(url, {
				canvas: offscreen,
				naturalWidth: nw,
				naturalHeight: nh,
				lastUsed: performance.now(),
				refCount: 0,
				state: 'ready'
			})
		}
		evictLRUTextures()
		const callbacks = textureReadyCallbacks.get(url)
		textureReadyCallbacks.delete(url)
		if (callbacks && callbacks.length > 0) {
			requestAnimationFrame(() => {
				for (const cb of callbacks) {
					try {
						cb()
					} catch {
						/* ignore */
					}
				}
			})
		}
	}
	img.onerror = () => {
		loadingUrls.delete(url)
		const entry = BLUEPRINT_TEXTURE_POOL.get(url)
		if (entry) {
			entry.state = 'error'
			entry.lastUsed = performance.now()
			entry.canvas = null as any
		} else {
			BLUEPRINT_TEXTURE_POOL.set(url, {
				canvas: null as any,
				naturalWidth: 0,
				naturalHeight: 0,
				lastUsed: performance.now(),
				refCount: 0,
				state: 'error'
			})
		}
		textureReadyCallbacks.delete(url)
	}
	img.src = url
}

export class BlueprintNode extends Node {
	data: BlueprintNodeData
	inputPorts: Port[] = []
	outputPorts: Port[] = []
	nodeType: string
	title: string
	subtitle?: string
	alias?: string
	icon?: string
	previewText?: string
	hoveredResizeCorner: ResizeCorner | null = null
	domMode: boolean = false

	constructor(data: BlueprintNodeData) {
		super('node', data.id)
		this.data = data
		this.nodeType = data.type
		this.title = data.title
		this.subtitle = data.subtitle
		this.alias = data.alias
		this.icon = data.icon
		this.previewText = data.previewContent?.text
		this.draggable = true
		this.layer = 10
		this.transform.setAnchor(0, 0)
		this.transform.setPosition(data.worldX, data.worldY)
		this.selected = data.selected ?? false
		this.rebuildPorts()
	}

	setPosition(x: number, y: number): this {
		super.setPosition(x, y)
		this.data.worldX = x
		this.data.worldY = y
		this.updatePortPositions()
		return this
	}

	syncDataFromTransform(): void {
		this.data.worldX = this.transform.position.x
		this.data.worldY = this.transform.position.y
	}

	setData(data: Partial<BlueprintNodeData>): void {
		if (data.title !== undefined) {
			this.title = data.title
			this.data.title = data.title
		}
		if (data.subtitle !== undefined) {
			this.subtitle = data.subtitle
			this.data.subtitle = data.subtitle
		}
		if (data.alias !== undefined) {
			this.alias = data.alias
			this.data.alias = data.alias
		}
		if (data.icon !== undefined) {
			this.icon = data.icon
			this.data.icon = data.icon
		}
		if (data.previewContent?.text !== undefined) {
			this.previewText = data.previewContent.text
			this.data.previewContent = data.previewContent
		}
		if (data.textValue !== undefined) {
			this.data.textValue = data.textValue
			this.previewText = data.textValue
		}
		if (data.type !== undefined) {
			this.data.type = data.type
			this.nodeType = data.type
		}
		const newX = data.worldX ?? this.data.worldX
		const newY = data.worldY ?? this.data.worldY
		if (data.worldX !== undefined || data.worldY !== undefined) {
			this.setPosition(newX, newY)
		}
		if (data.width !== undefined || data.height !== undefined) {
			if (data.width !== undefined) this.data.width = data.width
			if (data.height !== undefined) this.data.height = data.height
			this.rebuildPorts()
		}
		if (data.selected !== undefined) {
			this.selected = data.selected
			this.data.selected = data.selected
		}
		if (data.inputs !== undefined) this.data.inputs = data.inputs
		if (data.outputs !== undefined) this.data.outputs = data.outputs
		if (data.sizeCustomized !== undefined) this.data.sizeCustomized = data.sizeCustomized
		if (data.resourceId !== undefined) this.data.resourceId = data.resourceId
		if (data.resourcePath !== undefined) this.data.resourcePath = data.resourcePath
		const knownKeys = new Set([
			'id',
			'type',
			'title',
			'subtitle',
			'alias',
			'icon',
			'previewContent',
			'textValue',
			'worldX',
			'worldY',
			'width',
			'height',
			'selected',
			'inputs',
			'outputs',
			'sizeCustomized',
			'resourceId',
			'resourcePath',
			'createdAt'
		])
		for (const key of Object.keys(data)) {
			if (!knownKeys.has(key)) {
				;(this.data as Record<string, any>)[key] = (data as Record<string, any>)[key]
			}
		}
		this.markDirty(1)
	}

	updateSize(width: number, height: number): void {
		this.data.width = width
		this.data.height = height
		this.updatePortPositions()
		this.markDirty(1)
	}

	setDomMode(active: boolean): void {
		if (this.domMode === active) return
		this.domMode = active
		this.visible = !active
		this.alpha = 1
		this.inputPorts.forEach((port) => {
			port.visible = !active
			port.alpha = 1
		})
		this.outputPorts.forEach((port) => {
			port.visible = !active
			port.alpha = 1
		})
		this.markDirty(1)
	}

	private updatePortPositions(): void {
		const w = this.data.width
		const h = this.data.height
		const inputYs = this.calculatePortYPositions(
			this.inputPorts.map((p) => p.spec),
			h
		)
		const outputYs = this.calculatePortYPositions(
			this.outputPorts.map((p) => p.spec),
			h
		)

		this.inputPorts.forEach((port, i) => {
			port.spec.offsetY = inputYs[i]
			port.updateNodeSize(w, h)
		})
		this.outputPorts.forEach((port, i) => {
			port.spec.offsetY = outputYs[i]
			port.updateNodeSize(w, h)
		})
	}

	private calculatePortYPositions(specs: PortSpec[], h: number): number[] {
		const ys: number[] = []
		let dataPortIndex = 0

		const dataStartY = NODE_HEADER_HEIGHT + PORT_MIN_MARGIN_TOP + PORT_SIZE / 2
		const flowY = h - PORT_MIN_MARGIN_BOTTOM - PORT_SIZE / 2

		for (const spec of specs) {
			if (spec.mediaType === 'flow') {
				ys.push(flowY)
			} else {
				ys.push(dataStartY + dataPortIndex * PORT_SPACING)
				dataPortIndex++
			}
		}

		return ys
	}

	private calculateMinHeight(): number {
		const allPorts = [...this.data.inputs, ...this.data.outputs]
		let dataPortCount = 0

		for (const p of allPorts) {
			if (p.mediaType !== 'flow') {
				dataPortCount++
			}
		}

		const inputDataCount = this.data.inputs.filter((p) => p.mediaType !== 'flow').length
		const outputDataCount = this.data.outputs.filter((p) => p.mediaType !== 'flow').length
		const maxDataCount = Math.max(inputDataCount, outputDataCount)

		const dataPortHeight = maxDataCount > 0 ? (maxDataCount - 1) * PORT_SPACING + PORT_SIZE : 0

		const dataAreaBottom = NODE_HEADER_HEIGHT + PORT_MIN_MARGIN_TOP + PORT_SIZE / 2 + dataPortHeight
		const flowAreaTop = PORT_MIN_MARGIN_BOTTOM + PORT_SIZE + PORT_MIN_MARGIN_TOP

		const requiredByPorts = dataAreaBottom + flowAreaTop

		const baseHeight = NODE_HEADER_HEIGHT + 100

		return Math.max(MIN_NODE_HEIGHT, baseHeight, requiredByPorts)
	}

	rebuildPorts(): void {
		for (const child of [...this.children]) {
			this.removeChild(child)
		}
		this.inputPorts = []
		this.outputPorts = []

		let w = this.data.width
		let h = this.data.height

		const minH = this.calculateMinHeight()
		if (h < minH) {
			h = minH
			this.data.height = h
		}

		const inputYs = this.calculatePortYPositions(this.data.inputs, h)
		const outputYs = this.calculatePortYPositions(this.data.outputs, h)

		this.data.inputs.forEach((spec: PortSpec, i: number) => {
			const port = new Port(
				{ ...spec, offsetY: inputYs[i] },
				true,
				w,
				h,
				`${this.id}-in-${spec.id}`
			)
			this.inputPorts.push(port)
			this.addChild(port)
		})

		this.data.outputs.forEach((spec: PortSpec, i: number) => {
			const port = new Port(
				{ ...spec, offsetY: outputYs[i] },
				false,
				w,
				h,
				`${this.id}-out-${spec.id}`
			)
			this.outputPorts.push(port)
			this.addChild(port)
		})

		this.markDirty(1)
	}

	getPort(portId: string): Port | null {
		return (
			this.inputPorts.find((p) => p.spec.id === portId) ||
			this.outputPorts.find((p) => p.spec.id === portId) ||
			null
		)
	}

	getInputPort(portId: string): Port | null {
		return this.inputPorts.find((p) => p.spec.id === portId) || null
	}

	getOutputPort(portId: string): Port | null {
		return this.outputPorts.find((p) => p.spec.id === portId) || null
	}

	updateConnectionState(): void {
		for (const p of this.inputPorts) p.connected = false
		for (const p of this.outputPorts) p.connected = false
	}

	markPortConnected(portId: string, isInput: boolean): void {
		const ports = isInput ? this.inputPorts : this.outputPorts
		const port = ports.find((p) => p.spec.id === portId)
		if (port) port.connected = true
	}

	getLocalBounds(): Rect {
		return new Rect(0, 0, this.data.width, this.data.height)
	}

	getHitBounds(): Rect {
		return this.getLocalBounds()
	}

	private getStatusColors() {
		const theme = getThemeManager()
		let statusKey = 'idle'
		if (this.data.status === 'error') statusKey = 'error'
		else if (this.data.status === 'success') statusKey = 'success'
		else if (this.data.status === 'running') statusKey = 'running'
		else if (this.selected) statusKey = 'selected'
		else if (this.hovered) statusKey = 'hovered'
		return theme.getStatusColors(statusKey)
	}

	private _breathPhase = 0

	private getBreathIntensity(): number {
		if (this.data.status !== 'running') return 0
		const t = (performance.now() / 1000) % 2
		return (Math.sin(t * Math.PI) - 1) / -2
	}

	private hexToRgba(hex: string, alpha: number): string {
		if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
		const h = hex.replace('#', '')
		const r = parseInt(h.substring(0, 2), 16)
		const g = parseInt(h.substring(2, 4), 16)
		const b = parseInt(h.substring(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	private drawLCorner(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		dirX: number,
		dirY: number,
		length: number,
		color: string,
		lineWidth: number
	): void {
		c.save()
		c.strokeStyle = color
		c.lineWidth = lineWidth
		c.lineCap = 'square'
		c.beginPath()
		c.moveTo(x, y + dirY * length)
		c.lineTo(x, y)
		c.lineTo(x + dirX * length, y)
		c.stroke()
		c.restore()
	}

	private drawParticleDots(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		color: string
	): void {
		const dotSize = 2
		const spacing = 20
		c.save()
		c.fillStyle = color
		for (let px = x + spacing; px < x + w; px += spacing) {
			c.fillRect(px, y, dotSize, dotSize)
			c.fillRect(px, y + h - dotSize, dotSize, dotSize)
		}
		for (let py = y + spacing; py < y + h; py += spacing) {
			c.fillRect(x, py, dotSize, dotSize)
			c.fillRect(x + w - dotSize, py, dotSize, dotSize)
		}
		c.restore()
	}

	protected renderSelf(ctx: RenderContext): void {
		const c = ctx.ctx
		const w = this.data.width
		const h = this.data.height
		const colors = this.getStatusColors()
		const theme = getThemeManager()
		const tokens = theme.tokens
		const invZoom = 1 / ctx.camera.zoom
		const breath = this.getBreathIntensity()
		const isTaskActive = this.data.status === 'running' || this.data.status === 'error'
		const accentColor = this.getNodeTypeColor()

		c.save()

		if (this.selected || isTaskActive) {
			const glowIntensity = this.selected ? 1 : 0.5 + breath * 0.5
			c.shadowColor = colors.glow
			c.shadowBlur = 16 + breath * 16
			c.shadowOffsetX = 0
			c.shadowOffsetY = 0
		}

		c.fillStyle = tokens.nodeBackground
		c.fillRect(0, 0, w, h)

		c.shadowColor = 'transparent'
		c.shadowBlur = 0

		const headerAccent =
			this.data.status === 'running'
				? this.hexToRgba(colors.bracket, 0.12 + breath * 0.12)
				: this.data.status === 'error'
					? this.hexToRgba(colors.bracket, 0.15)
					: this.data.status === 'success'
						? this.hexToRgba(colors.bracket, 0.15)
						: tokens.nodeHeaderBackground
		const headerAccentBottom =
			this.data.status === 'running'
				? this.hexToRgba(colors.bracket, 0.04 + breath * 0.05)
				: this.data.status === 'error'
					? this.hexToRgba(colors.bracket, 0.05)
					: this.data.status === 'success'
						? this.hexToRgba(colors.bracket, 0.05)
						: this.hexToRgba(accentColor, 0.05)
		const headerGradient = c.createLinearGradient(0, 0, 0, NODE_HEADER_HEIGHT)
		headerGradient.addColorStop(0, headerAccent)
		headerGradient.addColorStop(1, headerAccentBottom)
		c.fillStyle = headerGradient
		c.fillRect(0, 0, w, NODE_HEADER_HEIGHT)

		const borderAlpha =
			this.data.status === 'running'
				? 0.45 + breath * 0.35
				: this.data.status === 'error'
					? 0.6
					: this.selected
						? 1
						: 0.6
		c.strokeStyle = this.hexToRgba(colors.border, borderAlpha)
		c.lineWidth = NODE_BORDER_WIDTH + (this.data.status === 'running' ? breath * 1.5 : 0)
		c.strokeRect(0, 0, w, h)

		const bracketAlpha = this.data.status === 'running' ? 0.55 + breath * 0.45 : 1
		this.drawLCorner(
			c,
			0,
			0,
			1,
			1,
			NODE_BRACKET_SIZE,
			this.hexToRgba(colors.bracket, bracketAlpha),
			NODE_BORDER_WIDTH * (1.5 + breath)
		)
		this.drawLCorner(
			c,
			w,
			0,
			-1,
			1,
			NODE_BRACKET_SIZE,
			this.hexToRgba(colors.bracket, bracketAlpha),
			NODE_BORDER_WIDTH * (1.5 + breath)
		)
		this.drawLCorner(
			c,
			0,
			h,
			1,
			-1,
			NODE_BRACKET_SIZE,
			this.hexToRgba(colors.bracket, bracketAlpha),
			NODE_BORDER_WIDTH * (1.5 + breath)
		)
		this.drawLCorner(
			c,
			w,
			h,
			-1,
			-1,
			NODE_BRACKET_SIZE,
			this.hexToRgba(colors.bracket, bracketAlpha),
			NODE_BORDER_WIDTH * (1.5 + breath)
		)

		if (this.selected) {
			this.drawParticleDots(c, 2, 2, w - 4, h - 4, this.hexToRgba(accentColor, 0.3))
		}

		c.strokeStyle = this.hexToRgba(accentColor, 0.2)
		c.lineWidth = 1
		c.beginPath()
		c.moveTo(0, NODE_HEADER_HEIGHT)
		c.lineTo(w, NODE_HEADER_HEIGHT)
		c.stroke()

		const titleX = NODE_INNER_PADDING
		c.fillStyle = tokens.nodeText
		c.font = `500 12px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		c.textBaseline = 'middle'
		c.textAlign = 'left'
		const displayTitle = translateNodeTitle(this.nodeType, this.title, this.alias)
		c.fillText(displayTitle, titleX, NODE_HEADER_HEIGHT / 2)

		const statusDotX = w - NODE_INNER_PADDING - 8
		const statusDotY = NODE_HEADER_HEIGHT / 2
		if (this.data.status === 'running') {
			const pulse = 0.4 + breath * 0.6
			c.save()
			c.shadowColor = colors.badge
			c.shadowBlur = 4 + breath * 6
			c.fillStyle = this.hexToRgba(colors.bracket, pulse)
			const dotSize = 4 + breath * 1
			c.fillRect(statusDotX - dotSize / 2, statusDotY - dotSize / 2, dotSize, dotSize)
			c.restore()
		} else {
			c.fillStyle = colors.badge
			const dotSize = 4
			c.fillRect(statusDotX - dotSize / 2, statusDotY - dotSize / 2, dotSize, dotSize)
		}

		this.renderPreviewArea(c, w, h, invZoom)

		if (!this.domMode && (this.selected || this.hoveredResizeCorner)) {
			const savedAlpha = c.globalAlpha
			c.globalAlpha = this.opacity
			this.renderResizeHandles(c, w, h, invZoom)
			c.globalAlpha = savedAlpha
		}

		c.restore()
	}

	private getResizeHandleRect(corner: ResizeCorner, invZoom: number): Rect {
		const w = this.data.width
		const h = this.data.height
		const handleSize = RESIZE_HANDLE_SIZE
		const offset = RESIZE_HANDLE_OFFSET

		let x: number, y: number
		switch (corner) {
			case 'top-left':
				x = -offset - handleSize / 2
				y = -offset - handleSize / 2
				break
			case 'top-right':
				x = w + offset - handleSize / 2
				y = -offset - handleSize / 2
				break
			case 'bottom-left':
				x = -offset - handleSize / 2
				y = h + offset - handleSize / 2
				break
			case 'bottom-right':
				x = w + offset - handleSize / 2
				y = h + offset - handleSize / 2
				break
		}
		return new Rect(x, y, handleSize, handleSize)
	}

	private renderResizeHandles(
		c: CanvasRenderingContext2D,
		w: number,
		h: number,
		invZoom: number
	): void {
		const corners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
		const handleSize = RESIZE_HANDLE_SIZE
		const theme = getThemeManager()
		const tokens = theme.tokens
		const accentColor = this.getNodeTypeColor()

		c.save()
		c.fillStyle = accentColor
		c.strokeStyle = theme.mode === 'dark' ? '#ffffff' : tokens.nodeBackground
		c.lineWidth = 1

		for (const corner of corners) {
			const rect = this.getResizeHandleRect(corner, invZoom)
			c.fillRect(rect.x, rect.y, rect.width, rect.height)
			c.strokeRect(rect.x, rect.y, rect.width, rect.height)
		}

		if (this.hoveredResizeCorner) {
			const hoveredRect = this.getResizeHandleRect(this.hoveredResizeCorner, invZoom)
			c.shadowColor = accentColor
			c.shadowBlur = 8 * invZoom
			c.fillRect(hoveredRect.x, hoveredRect.y, hoveredRect.width, hoveredRect.height)
			c.shadowBlur = 0
		}

		c.restore()
	}

	getResizeCornerAtPoint(localPoint: Vector2, invZoom: number): ResizeCorner | null {
		if (this.domMode) return null
		const corners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
		const hitSize = RESIZE_HANDLE_HIT_SIZE * invZoom
		const halfHit = hitSize / 2

		for (const corner of corners) {
			const rect = this.getResizeHandleRect(corner, invZoom)
			const expandedRect = new Rect(
				rect.x + rect.width / 2 - halfHit,
				rect.y + rect.height / 2 - halfHit,
				hitSize,
				hitSize
			)
			if (expandedRect.containsPoint(localPoint)) {
				return corner
			}
		}
		return null
	}

	getResizeCursor(corner: ResizeCorner): string {
		switch (corner) {
			case 'top-left':
			case 'bottom-right':
				return 'nwse-resize'
			case 'top-right':
			case 'bottom-left':
				return 'nesw-resize'
		}
	}

	private renderPortLabels(c: CanvasRenderingContext2D, invZoom: number): void {
		const theme = getThemeManager()
		const tokens = theme.tokens
		c.font = `11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		c.textBaseline = 'middle'

		this.inputPorts.forEach((port) => {
			const y = port.spec.offsetY ?? 0
			c.fillStyle = tokens.nodeTextMuted
			c.textAlign = 'left'
			const rawLabel = port.spec.label || port.spec.id
			const label = translatePortLabel(rawLabel, rawLabel)
			c.fillText(label, PORT_SIZE / 2 + NODE_INNER_PADDING / 2, y)
		})

		this.outputPorts.forEach((port) => {
			const y = port.spec.offsetY ?? 0
			c.fillStyle = tokens.nodeTextMuted
			c.textAlign = 'right'
			const rawLabel = port.spec.label || port.spec.id
			const label = translatePortLabel(rawLabel, rawLabel)
			c.fillText(label, this.data.width - PORT_SIZE / 2 - NODE_INNER_PADDING / 2, y)
		})
	}

	private getPreviewKind():
		| 'text'
		| 'image'
		| 'video'
		| 'model3d'
		| 'scene-understanding'
		| 'scene-layout'
		| 'scene-decompose'
		| 'comfyui'
		| 'unreal-export'
		| 'blender'
		| 'icon' {
		if (this.data.previewContent?.kind) return this.data.previewContent.kind as any
		switch (this.nodeType) {
			case 'text':
				return 'text'
			case 'image':
			case 'rotate-image':
				return 'image'
			case 'video':
				return 'video'
			case 'model3d':
				return 'model3d'
			case 'scene-understanding':
				return 'scene-understanding'
			case 'scene-layout':
				return 'scene-layout'
			case 'scene-decompose':
				return 'scene-decompose'
			case 'comfyui':
				return 'comfyui'
			case 'unreal-export':
				return 'unreal-export'
			case 'blender':
				return 'blender'
			default:
				return 'icon'
		}
	}

	private getNodeTypeColor(): string {
		const theme = getThemeManager()
		const tokens = theme.tokens
		switch (this.nodeType) {
			case 'text':
				return '#f1c40f'
			case 'image':
			case 'rotate-image':
				return '#9b59b6'
			case 'video':
				return '#27ae60'
			case 'model3d':
				return '#3498db'
			case 'comfyui':
				return '#e67e22'
			case 'blender':
				return '#e67e22'
			case 'unreal-export':
				return '#3498db'
			case 'scene-understanding':
			case 'scene-layout':
			case 'scene-decompose':
				return tokens.portInner
			default:
				return tokens.portInner
		}
	}

	private getDefaultIcon(): string {
		const icons: Record<string, string> = {
			text: '📝',
			image: '🖼️',
			'rotate-image': '🔄',
			video: '🎬',
			'scene-understanding': '👁️',
			'scene-layout': '📐',
			'scene-decompose': '🔍',
			comfyui: '⚡',
			model3d: '🧊',
			'unreal-export': '🎮',
			blender: '🎨'
		}
		return icons[this.nodeType] || '◇'
	}

	private renderPreviewArea(
		c: CanvasRenderingContext2D,
		w: number,
		h: number,
		invZoom: number
	): void {
		const inputDataCount = this.data.inputs.filter((p) => p.mediaType !== 'flow').length
		const outputDataCount = this.data.outputs.filter((p) => p.mediaType !== 'flow').length
		const maxDataCount = Math.max(inputDataCount, outputDataCount)

		const dataStartY = NODE_HEADER_HEIGHT + PORT_MIN_MARGIN_TOP + PORT_SIZE / 2
		const dataPortBottom =
			maxDataCount > 0
				? dataStartY + (maxDataCount - 1) * PORT_SPACING + PORT_SIZE / 2
				: NODE_HEADER_HEIGHT

		const flowY = h - PORT_MIN_MARGIN_BOTTOM - PORT_SIZE / 2
		const flowPortTop = flowY - PORT_SIZE / 2

		const previewTop = dataPortBottom + 8
		const previewBottom = flowPortTop - 8

		if (previewBottom - previewTop < 40) return

		const previewX = NODE_INNER_PADDING
		const previewW = w - NODE_INNER_PADDING * 2
		const previewH = previewBottom - previewTop

		const kind = this.getPreviewKind()
		const accentColor = this.getNodeTypeColor()

		c.save()
		c.fillStyle = this.hexToRgba(accentColor, 0.04)
		c.fillRect(previewX, previewTop, previewW, previewH)
		c.strokeStyle = this.hexToRgba(accentColor, 0.15)
		c.lineWidth = 1
		c.strokeRect(previewX, previewTop, previewW, previewH)

		const cornerLen = 6
		c.strokeStyle = this.hexToRgba(accentColor, 0.4)
		c.lineWidth = 1.5
		c.beginPath()
		c.moveTo(previewX, previewTop + cornerLen)
		c.lineTo(previewX, previewTop)
		c.lineTo(previewX + cornerLen, previewTop)
		c.moveTo(previewX + previewW - cornerLen, previewTop)
		c.lineTo(previewX + previewW, previewTop)
		c.lineTo(previewX + previewW, previewTop + cornerLen)
		c.moveTo(previewX + previewW, previewTop + previewH - cornerLen)
		c.lineTo(previewX + previewW, previewTop + previewH)
		c.lineTo(previewX + previewW - cornerLen, previewTop + previewH)
		c.moveTo(previewX + cornerLen, previewTop + previewH)
		c.lineTo(previewX, previewTop + previewH)
		c.lineTo(previewX, previewTop + previewH - cornerLen)
		c.stroke()

		if (kind === 'text') {
			this.renderTextPreview(c, previewX, previewTop, previewW, previewH, invZoom)
		} else if (kind === 'image') {
			this.renderImagePreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		} else if (kind === 'video') {
			this.renderVideoPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		} else if (kind === 'model3d') {
			this.renderModel3DPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		} else if (kind === 'scene-understanding') {
			this.renderSceneUnderstandingPreview(
				c,
				previewX,
				previewTop,
				previewW,
				previewH,
				invZoom,
				accentColor
			)
		} else if (kind === 'scene-layout') {
			this.renderSceneLayoutPreview(
				c,
				previewX,
				previewTop,
				previewW,
				previewH,
				invZoom,
				accentColor
			)
		} else if (kind === 'scene-decompose') {
			this.renderSceneDecomposePreview(
				c,
				previewX,
				previewTop,
				previewW,
				previewH,
				invZoom,
				accentColor
			)
		} else if (kind === 'comfyui') {
			this.renderComfyUIPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		} else if (kind === 'unreal-export') {
			this.renderUnrealExportPreview(
				c,
				previewX,
				previewTop,
				previewW,
				previewH,
				invZoom,
				accentColor
			)
		} else if (kind === 'blender') {
			this.renderBlenderPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		} else {
			this.renderIconPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor)
		}

		c.restore()
	}

	private renderIconPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const theme = getThemeManager()
		const tokens = theme.tokens
		const cx = x + w / 2
		const cy = y + h / 2 - 8
		const iconSize = Math.min(40, Math.min(w, h) * 0.45)

		c.save()
		c.fillStyle = this.hexToRgba(accentColor, 0.1)
		c.beginPath()
		c.arc(cx, cy, iconSize * 0.7, 0, Math.PI * 2)
		c.fill()

		c.font = `${iconSize * 0.7}px sans-serif`
		c.textAlign = 'center'
		c.textBaseline = 'middle'
		const icon = this.icon || this.getDefaultIcon()
		c.fillText(icon, cx, cy)

		if (this.subtitle) {
			c.fillStyle = tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.fillText(this.subtitle, cx, cy + iconSize * 0.5 + 16)
		}
		c.restore()
	}

	private renderTextPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number
	): void {
		const padding = 10
		const text = this.previewText || this.data.textValue || t('aiworkflow.canvas.common.empty')
		const fontSize = 11
		const lineHeight = Math.ceil(fontSize * 1.5)
		const theme = getThemeManager()
		const tokens = theme.tokens
		c.fillStyle = tokens.nodeTextMuted
		c.font = `${fontSize}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		c.textAlign = 'left'
		c.textBaseline = 'top'

		const maxWidth = w - padding * 2
		const availableHeight = h - padding * 2
		const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight))
		const lines = this.wrapTextChinese(c, text, maxWidth)
		const displayLines = Math.min(lines.length, maxLines)

		for (let i = 0; i < displayLines; i++) {
			let line = lines[i]
			if (i === maxLines - 1 && lines.length > maxLines) {
				while (c.measureText(line + '...').width > maxWidth && line.length > 0) {
					line = line.slice(0, -1)
				}
				line += '...'
			}
			c.fillText(line, x + padding, y + padding + i * lineHeight)
		}
	}

	private getLegacyResources(): Record<string, LegacyResourceData> {
		let p: any = this.parent
		while (p) {
			const lr = p.legacyResources
			if (lr && typeof lr === 'object') {
				return lr as Record<string, LegacyResourceData>
			}
			p = p.parent
		}
		return {}
	}

	private getResourceData(): LegacyResourceData | null {
		const resourceId = this.data.resourceId
		if (!resourceId) return null
		const resources = this.getLegacyResources()
		return resources[resourceId] || null
	}

	private getResolvedImageUrl(): string {
		const res = this.getResourceData()
		if (!res?.url) return ''
		return resolveWorkflowResourceUrl(res.url)
	}

	private getResolvedPosterUrl(): string {
		const res = this.getResourceData()
		if (res?.posterUrl) {
			const url = resolveWorkflowResourceUrl(res.posterUrl)
			if (url) return url
		}
		return this.getResolvedImageUrl()
	}

	private _cachedScene: any = null

	private beginLoadImage(url: string): void {
		beginLoadTexture(url, () => this.requestSceneRedraw())
	}

	private requestSceneRedraw(): void {
		if (this._cachedScene && typeof this._cachedScene.requestRedraw === 'function') {
			this._cachedScene.requestRedraw(false)
			return
		}
		let p: any = this.parent
		while (p) {
			if (typeof p.requestRedraw === 'function') {
				this._cachedScene = p
				p.requestRedraw(false)
				return
			}
			p = p.parent
		}
	}

	private getCachedTexture(url: string): CachedBlueprintTexture | null {
		const tex = BLUEPRINT_TEXTURE_POOL.get(url)
		if (tex && tex.state === 'ready') {
			tex.lastUsed = performance.now()
			tex.refCount++
			return tex
		}
		return null
	}

	private drawTextureCover(
		c: CanvasRenderingContext2D,
		tex: CachedBlueprintTexture,
		dx: number,
		dy: number,
		dw: number,
		dh: number
	): void {
		const nw = tex.naturalWidth
		const nh = tex.naturalHeight
		const imgRatio = nw / nh
		const boxRatio = dw / dh
		let sx = 0,
			sy = 0,
			sw: number,
			sh: number

		if (imgRatio > boxRatio) {
			sw = nh * boxRatio
			sh = nh
			sx = (nw - sw) / 2
			sy = 0
		} else {
			sw = nw
			sh = nw / boxRatio
			sx = 0
			sy = (nh - sh) / 2
		}

		const cw = tex.canvas.width
		const ch = tex.canvas.height
		const scaleX = cw / nw
		const scaleY = ch / nh

		c.drawImage(tex.canvas, sx * scaleX, sy * scaleY, sw * scaleX, sh * scaleY, dx, dy, dw, dh)
	}

	private drawRoundedRectPath(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	): void {
		const rr = Math.min(r, w / 2, h / 2)
		c.beginPath()
		c.moveTo(x + rr, y)
		c.lineTo(x + w - rr, y)
		c.quadraticCurveTo(x + w, y, x + w, y + rr)
		c.lineTo(x + w, y + h - rr)
		c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
		c.lineTo(x + rr, y + h)
		c.quadraticCurveTo(x, y + h, x, y + h - rr)
		c.lineTo(x, y + rr)
		c.quadraticCurveTo(x, y, x + rr, y)
		c.closePath()
	}

	private renderImagePreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const margin = 6
		const px = x + margin
		const py = y + margin
		const pw = w - margin * 2
		const ph = h - margin * 2

		c.fillStyle = this.hexToRgba(accentColor, 0.08)
		this.drawRoundedRectPath(c, px, py, pw, ph, 4)
		c.fill()

		const imgUrl = this.getResolvedImageUrl()
		if (imgUrl) {
			this.beginLoadImage(imgUrl)
			const tex = this.getCachedTexture(imgUrl)
			if (tex) {
				if (tex.canvas.width > 0) {
					c.save()
					this.drawRoundedRectPath(c, px, py, pw, ph, 4)
					c.clip()
					this.drawTextureCover(c, tex, px, py, pw, ph)
					c.restore()

					c.strokeStyle = this.hexToRgba(accentColor, 0.3)
					c.lineWidth = 1
					c.strokeRect(px, py, pw, ph)

					if (this.nodeType === 'rotate-image') {
						const cx = px + pw / 2
						c.save()
						c.translate(cx, py + ph * 0.15)
						c.strokeStyle = this.hexToRgba(accentColor, 0.7)
						c.lineWidth = 1.5
						c.beginPath()
						c.arc(0, 0, 8, 0.3, Math.PI * 1.7)
						c.stroke()
						c.beginPath()
						c.moveTo(0, -10)
						c.lineTo(3, -6)
						c.lineTo(-3, -6)
						c.closePath()
						c.fillStyle = this.hexToRgba(accentColor, 0.8)
						c.fill()
						c.restore()
					}
					releaseTexture(imgUrl)
					return
				}
				releaseTexture(imgUrl)
			}
		}

		const cx = px + pw / 2
		const cy = py + ph / 2
		const iconSize = Math.min(pw, ph) * 0.35

		c.beginPath()
		c.moveTo(px + pw * 0.15, py + ph * 0.75)
		c.lineTo(px + pw * 0.35, py + ph * 0.45)
		c.lineTo(px + pw * 0.55, py + ph * 0.65)
		c.lineTo(px + pw * 0.7, py + ph * 0.35)
		c.lineTo(px + pw * 0.85, py + ph * 0.75)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.25)
		c.fill()

		c.beginPath()
		c.arc(px + pw * 0.7, py + ph * 0.28, iconSize * 0.12, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.4)
		c.fill()

		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.lineWidth = 1
		c.strokeRect(px, py, pw, ph)

		if (this.nodeType === 'rotate-image') {
			c.save()
			c.translate(cx, py + ph * 0.15)
			c.strokeStyle = this.hexToRgba(accentColor, 0.5)
			c.lineWidth = 1.5
			c.beginPath()
			c.arc(0, 0, 8, 0.3, Math.PI * 1.7)
			c.stroke()
			c.beginPath()
			c.moveTo(0, -10)
			c.lineTo(3, -6)
			c.lineTo(-3, -6)
			c.closePath()
			c.fillStyle = this.hexToRgba(accentColor, 0.6)
			c.fill()
			c.restore()
		}
	}

	private renderVideoPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const margin = 6
		const px = x + margin
		const py = y + margin
		const pw = w - margin * 2
		const ph = h - margin * 2

		c.fillStyle = this.hexToRgba(accentColor, 0.08)
		this.drawRoundedRectPath(c, px, py, pw, ph, 4)
		c.fill()

		const posterUrl = this.getResolvedPosterUrl()
		let hasPoster = false
		if (posterUrl) {
			this.beginLoadImage(posterUrl)
			const tex = this.getCachedTexture(posterUrl)
			if (tex) {
				if (tex.canvas.width > 0) {
					c.save()
					this.drawRoundedRectPath(c, px, py, pw, ph, 4)
					c.clip()
					this.drawTextureCover(c, tex, px, py, pw, ph)
					c.restore()
					c.fillStyle = 'rgba(0,0,0,0.35)'
					c.fillRect(px, py, pw, ph)
					hasPoster = true
				}
				releaseTexture(posterUrl)
			}
		}

		const cx = px + pw / 2
		const cy = py + ph / 2
		const playSize = Math.min(pw, ph) * 0.25

		c.beginPath()
		c.arc(cx, cy, playSize * 0.8, 0, Math.PI * 2)
		c.fillStyle = hasPoster ? 'rgba(0,0,0,0.5)' : this.hexToRgba(accentColor, 0.2)
		c.fill()
		c.strokeStyle = hasPoster ? 'rgba(255,255,255,0.8)' : this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 2
		c.stroke()

		c.beginPath()
		c.moveTo(cx - playSize * 0.3, cy - playSize * 0.4)
		c.lineTo(cx + playSize * 0.5, cy)
		c.lineTo(cx - playSize * 0.3, cy + playSize * 0.4)
		c.closePath()
		c.fillStyle = hasPoster ? 'rgba(255,255,255,0.9)' : this.hexToRgba(accentColor, 0.6)
		c.fill()

		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.lineWidth = 1
		c.strokeRect(px, py, pw, ph)

		const barH = 16
		const barY = py + ph - barH
		c.fillStyle = 'rgba(0,0,0,0.6)'
		c.fillRect(px, barY, pw, barH)

		const progressW = pw * 0.35
		const progressX = px + 6
		const progressY = barY + 6
		const progressH = 4
		c.fillStyle = this.hexToRgba(accentColor, 0.25)
		c.fillRect(progressX, progressY, pw - 30, progressH)
		c.fillStyle = hasPoster ? 'rgba(255,255,255,0.85)' : this.hexToRgba(accentColor, 0.75)
		c.fillRect(progressX, progressY, progressW - 6, progressH)

		c.beginPath()
		c.arc(px + pw - 10, barY + barH / 2, 4, 0, Math.PI * 2)
		c.fillStyle = hasPoster ? 'rgba(255,255,255,0.7)' : this.hexToRgba(accentColor, 0.6)
		c.fill()
	}

	private renderModel3DPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 5
		const size = Math.min(w, h) * 0.3

		c.save()
		c.strokeStyle = this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 1.5
		c.fillStyle = this.hexToRgba(accentColor, 0.1)

		const offset = size * 0.35
		const top = cy - size * 0.6
		const bottom = cy + size * 0.4
		const left = cx - size * 0.5
		const right = cx + size * 0.5
		const back = cy - size * 0.2

		c.beginPath()
		c.moveTo(cx, top)
		c.lineTo(right, cy - size * 0.1)
		c.lineTo(right, bottom)
		c.lineTo(cx, cy + size * 0.1)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.15)
		c.fill()
		c.stroke()

		c.beginPath()
		c.moveTo(cx, top)
		c.lineTo(left, cy - size * 0.1)
		c.lineTo(left, bottom)
		c.lineTo(cx, cy + size * 0.1)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.08)
		c.fill()
		c.stroke()

		c.beginPath()
		c.moveTo(cx, top)
		c.lineTo(right, cy - size * 0.1)
		c.lineTo(right, bottom)
		c.lineTo(cx, cy + size * 0.1)
		c.lineTo(left, bottom)
		c.lineTo(left, cy - size * 0.1)
		c.closePath()
		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.stroke()

		c.beginPath()
		c.moveTo(left, cy - size * 0.1)
		c.lineTo(cx, back - size * 0.1)
		c.lineTo(right, cy - size * 0.1)
		c.strokeStyle = this.hexToRgba(accentColor, 0.25)
		c.stroke()
		c.beginPath()
		c.moveTo(cx, back - size * 0.1)
		c.lineTo(cx, top - offset * 0.3)
		c.stroke()

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, bottom + 12)
		}
		c.restore()
	}

	private renderSceneUnderstandingPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 8
		const size = Math.min(w, h) * 0.35

		c.save()
		c.strokeStyle = this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 1.5

		c.beginPath()
		c.arc(cx, cy, size, 0, Math.PI * 2)
		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.stroke()

		c.beginPath()
		c.arc(cx, cy, size * 0.7, 0, Math.PI * 2)
		c.strokeStyle = this.hexToRgba(accentColor, 0.45)
		c.stroke()

		c.beginPath()
		c.arc(cx, cy, size * 0.35, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.2)
		c.fill()
		c.strokeStyle = this.hexToRgba(accentColor, 0.6)
		c.stroke()

		c.beginPath()
		c.arc(cx, cy, 3, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.9)
		c.fill()

		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2
			const x1 = cx + Math.cos(angle) * size * 0.4
			const y1 = cy + Math.sin(angle) * size * 0.4
			const x2 = cx + Math.cos(angle) * size * 0.9
			const y2 = cy + Math.sin(angle) * size * 0.9
			c.beginPath()
			c.moveTo(x1, y1)
			c.lineTo(x2, y2)
			c.strokeStyle = this.hexToRgba(accentColor, 0.35)
			c.lineWidth = 1
			c.stroke()
		}

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + size + 12)
		}
		c.restore()
	}

	private renderSceneLayoutPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 5
		const size = Math.min(w, h) * 0.3
		const gridSize = size * 0.5

		c.save()
		c.strokeStyle = this.hexToRgba(accentColor, 0.4)
		c.lineWidth = 1

		for (let i = -1; i <= 1; i++) {
			for (let j = -1; j <= 1; j++) {
				const gx = cx + i * gridSize
				const gy = cy + j * gridSize
				c.strokeRect(gx - gridSize * 0.35, gy - gridSize * 0.35, gridSize * 0.7, gridSize * 0.7)
			}
		}

		c.strokeStyle = this.hexToRgba(accentColor, 0.7)
		c.lineWidth = 1.5
		c.strokeRect(cx - size * 0.7, cy - size * 0.5, size * 1.4, size)

		c.fillStyle = this.hexToRgba(accentColor, 0.2)
		c.fillRect(cx - size * 0.5, cy - size * 0.3, size * 0.35, size * 0.25)
		c.fillStyle = this.hexToRgba(accentColor, 0.15)
		c.fillRect(cx - size * 0.1, cy - size * 0.3, size * 0.3, size * 0.4)
		c.fillStyle = this.hexToRgba(accentColor, 0.1)
		c.fillRect(cx + size * 0.25, cy - size * 0.3, size * 0.3, size * 0.6)

		c.beginPath()
		c.moveTo(cx - size * 0.7, cy + size * 0.5)
		c.lineTo(cx - size * 0.35, cy + size * 0.2)
		c.lineTo(cx, cy + size * 0.4)
		c.lineTo(cx + size * 0.35, cy)
		c.lineTo(cx + size * 0.7, cy + size * 0.5)
		c.strokeStyle = this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 1.5
		c.stroke()

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + size * 0.7 + 10)
		}
		c.restore()
	}

	private renderSceneDecomposePreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 5
		const size = Math.min(w, h) * 0.3

		c.save()

		c.beginPath()
		c.rect(cx - size, cy - size * 0.7, size * 2, size * 1.4)
		c.fillStyle = this.hexToRgba(accentColor, 0.08)
		c.fill()
		c.strokeStyle = this.hexToRgba(accentColor, 0.4)
		c.lineWidth = 1.5
		c.stroke()

		const boxSize = size * 0.45
		const boxes = [
			{ x: cx - size * 0.6, y: cy - size * 0.4, label: '1' },
			{ x: cx + size * 0.15, y: cy - size * 0.45, label: '2' },
			{ x: cx - size * 0.3, y: cy + size * 0.1, label: '3' },
			{ x: cx + size * 0.4, y: cy + size * 0.15, label: '4' }
		]

		boxes.forEach((box, i) => {
			const alpha = 0.15 + i * 0.05
			c.fillStyle = this.hexToRgba(accentColor, alpha)
			c.fillRect(box.x, box.y, boxSize, boxSize * 0.75)
			c.strokeStyle = this.hexToRgba(accentColor, 0.5 + i * 0.1)
			c.lineWidth = 1
			c.strokeRect(box.x, box.y, boxSize, boxSize * 0.75)

			const theme = getThemeManager()
			c.fillStyle = this.hexToRgba(theme.tokens.nodeText, 0.7)
			c.font = '10px sans-serif'
			c.textAlign = 'center'
			c.textBaseline = 'middle'
			c.fillText(box.label, box.x + boxSize / 2, box.y + boxSize * 0.375)
		})

		c.strokeStyle = this.hexToRgba(accentColor, 0.25)
		c.lineWidth = 1
		c.setLineDash([3, 3])
		c.beginPath()
		c.moveTo(cx, cy)
		c.lineTo(cx + size * 1.1, cy - size * 0.6)
		c.moveTo(cx, cy)
		c.lineTo(cx + size * 1.1, cy)
		c.moveTo(cx, cy)
		c.lineTo(cx + size * 1.1, cy + size * 0.6)
		c.stroke()
		c.setLineDash([])

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + size * 0.8 + 10)
		}
		c.restore()
	}

	private renderComfyUIPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 5
		const nodeR = Math.min(w, h) * 0.12
		const spacing = nodeR * 2.8

		c.save()

		const nodePositions = [
			{ x: cx - spacing, y: cy - spacing * 0.6, type: 'input' },
			{ x: cx, y: cy - spacing * 0.8, type: 'process' },
			{ x: cx + spacing, y: cy - spacing * 0.5, type: 'model' },
			{ x: cx - spacing * 0.5, y: cy + spacing * 0.3, type: 'process' },
			{ x: cx + spacing * 0.6, y: cy + spacing * 0.5, type: 'output' }
		]

		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.lineWidth = 1.5
		const connections = [
			[0, 1],
			[1, 2],
			[0, 3],
			[1, 3],
			[2, 4],
			[3, 4]
		]
		connections.forEach(([a, b]) => {
			c.beginPath()
			c.moveTo(nodePositions[a].x, nodePositions[a].y)
			c.lineTo(nodePositions[b].x, nodePositions[b].y)
			c.stroke()
		})

		nodePositions.forEach((node, i) => {
			c.beginPath()
			c.arc(node.x, node.y, nodeR, 0, Math.PI * 2)
			const alpha = node.type === 'output' ? 0.25 : node.type === 'model' ? 0.3 : 0.18
			c.fillStyle = this.hexToRgba(accentColor, alpha)
			c.fill()
			c.strokeStyle = this.hexToRgba(accentColor, 0.5 + i * 0.05)
			c.lineWidth = 1.5
			c.stroke()
		})

		c.beginPath()
		c.arc(nodePositions[4].x, nodePositions[4].y, nodeR * 0.5, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.7)
		c.fill()

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + spacing + 8)
		}
		c.restore()
	}

	private renderUnrealExportPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 8
		const size = Math.min(w, h) * 0.3

		c.save()
		c.strokeStyle = this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 1.5

		c.beginPath()
		c.moveTo(cx, cy - size * 0.7)
		c.lineTo(cx + size * 0.6, cy - size * 0.2)
		c.lineTo(cx + size * 0.6, cy + size * 0.5)
		c.lineTo(cx, cy + size * 0.7)
		c.lineTo(cx - size * 0.6, cy + size * 0.5)
		c.lineTo(cx - size * 0.6, cy - size * 0.2)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.12)
		c.fill()
		c.stroke()

		c.beginPath()
		c.moveTo(cx, cy - size * 0.7)
		c.lineTo(cx, cy + size * 0.7)
		c.moveTo(cx - size * 0.6, cy - size * 0.2)
		c.lineTo(cx + size * 0.6, cy - size * 0.2)
		c.moveTo(cx - size * 0.6, cy + size * 0.5)
		c.lineTo(cx + size * 0.6, cy + size * 0.5)
		c.strokeStyle = this.hexToRgba(accentColor, 0.25)
		c.lineWidth = 1
		c.stroke()

		c.fillStyle = this.hexToRgba(accentColor, 0.4)
		c.font = 'bold 14px sans-serif'
		c.textAlign = 'center'
		c.textBaseline = 'middle'
		c.fillText('U', cx, cy - 2)

		c.beginPath()
		c.moveTo(cx + size * 0.8, cy)
		c.lineTo(cx + size * 1.1, cy - size * 0.2)
		c.lineTo(cx + size * 1.1, cy + size * 0.2)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.6)
		c.fill()

		if (this.subtitle) {
			const theme = getThemeManager()
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + size * 0.8 + 10)
		}
		c.restore()
	}

	private renderBlenderPreview(
		c: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		invZoom: number,
		accentColor: string
	): void {
		const cx = x + w / 2
		const cy = y + h / 2 - 5
		const size = Math.min(w, h) * 0.3

		c.save()

		c.beginPath()
		c.ellipse(cx, cy + size * 0.15, size * 0.8, size * 0.25, 0, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.08)
		c.fill()
		c.strokeStyle = this.hexToRgba(accentColor, 0.3)
		c.lineWidth = 1
		c.stroke()

		const cty = cy - size * 0.3
		c.beginPath()
		c.moveTo(cx - size * 0.15, cty - size * 0.1)
		c.lineTo(cx - size * 0.15, cty + size * 0.5)
		c.lineTo(cx + size * 0.15, cty + size * 0.5)
		c.lineTo(cx + size * 0.15, cty - size * 0.1)
		c.lineTo(cx + size * 0.5, cty - size * 0.1)
		c.lineTo(cx + size * 0.5, cty + size * 0.1)
		c.lineTo(cx + size * 0.25, cty + size * 0.1)
		c.lineTo(cx + size * 0.25, cty + size * 0.6)
		c.lineTo(cx - size * 0.25, cty + size * 0.6)
		c.lineTo(cx - size * 0.25, cty + size * 0.1)
		c.lineTo(cx - size * 0.5, cty + size * 0.1)
		c.lineTo(cx - size * 0.5, cty - size * 0.1)
		c.closePath()
		c.fillStyle = this.hexToRgba(accentColor, 0.15)
		c.fill()
		c.strokeStyle = this.hexToRgba(accentColor, 0.5)
		c.lineWidth = 1.5
		c.stroke()

		c.beginPath()
		c.arc(cx, cty - size * 0.25, size * 0.18, 0, Math.PI * 2)
		c.fillStyle = this.hexToRgba(accentColor, 0.25)
		c.fill()
		c.strokeStyle = this.hexToRgba(accentColor, 0.6)
		c.stroke()

		c.beginPath()
		c.moveTo(cx - size * 0.3, cy - size * 0.5)
		c.lineTo(cx, cy - size * 0.65)
		c.lineTo(cx + size * 0.3, cy - size * 0.5)
		c.strokeStyle = this.hexToRgba(accentColor, 0.4)
		c.lineWidth = 2
		c.stroke()

		const theme = getThemeManager()
		c.fillStyle = this.hexToRgba(theme.tokens.nodeText, 0.5)
		c.font = '10px sans-serif'
		c.textAlign = 'center'
		c.textBaseline = 'middle'

		if (this.subtitle) {
			c.fillStyle = theme.tokens.nodeTextMuted
			c.font = `10px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			c.textAlign = 'center'
			c.textBaseline = 'top'
			c.fillText(this.subtitle, cx, cy + size * 0.55 + 8)
		}
		c.restore()
	}

	private wrapTextChinese(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
		const lines: string[] = []
		let current = ''

		for (let i = 0; i < text.length; i++) {
			const char = text[i]
			if (char === '\n') {
				lines.push(current)
				current = ''
				continue
			}
			const test = current + char
			if (c.measureText(test).width > maxWidth && current) {
				lines.push(current)
				current = char
			} else {
				current = test
			}
		}
		if (current) lines.push(current)
		return lines.length ? lines : [text.substring(0, 20)]
	}

	protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
		const bounds = this.getLocalBounds()
		if (bounds.containsPoint(localPoint)) {
			return {
				node: this,
				localPoint: localPoint.clone(),
				worldPoint: this.localToWorld(localPoint)
			}
		}
		return null
	}

	onDragMove(_delta: Vector2): void {
		this.on.emit('nodemoved', { id: this.id, x: this.data.worldX, y: this.data.worldY })
	}

	dispose(): void {
		this._cachedScene = null
		super.dispose()
	}
}
