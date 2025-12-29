import type { Vec2 } from './types'
import { clamp } from './types'
import type { DwebNode } from './nodes/DwebNode'
import { DwebStageNode } from './nodes/DwebStageNode'
import type { DwebWorldBounds } from './nodes/DwebNode'

export { DwebStageNode } from './nodes/DwebStageNode'

export type ViewportState = {
  pan: Vec2 // screen-space px
  zoom: number
}

export type ViewportInset = {
  left?: number
  top?: number
  right?: number
  bottom?: number
}

export class DwebCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private dpr = 1

  viewport: ViewportState = {
    pan: { x: 0, y: 0 },
    zoom: 1,
  }

  onViewportChange?: (viewport: ViewportState) => void

  private guidesEnabled = false

  private nodes: DwebNode[] = []

  private rafId: number | null = null
  private isDisposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context is not available')
    this.ctx = ctx
  }

  dispose() {
    this.isDisposed = true
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  setSize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.floor(width * dpr))
    this.canvas.height = Math.max(1, Math.floor(height * dpr))
    this.canvas.style.width = `${Math.max(1, Math.floor(width))}px`
    this.canvas.style.height = `${Math.max(1, Math.floor(height))}px`
    this.requestRender()
  }

  setNodes(nodes: DwebNode[]) {
    this.nodes = [...nodes]
    this.requestRender()
  }

  upsertNode(node: DwebNode) {
    const idx = this.nodes.findIndex((n) => n.id === node.id)
    if (idx >= 0) this.nodes[idx] = node
    else this.nodes.push(node)
    this.requestRender()
  }

  getNodeById<T extends DwebNode = DwebNode>(id: string): T | undefined {
    return this.nodes.find((n) => n.id === id) as T | undefined
  }

  screenToWorld(p: Vec2): Vec2 {
    const z = this.viewport.zoom
    return {
      x: (p.x - this.viewport.pan.x) / z,
      y: (p.y - this.viewport.pan.y) / z,
    }
  }

  worldToScreen(p: Vec2): Vec2 {
    const z = this.viewport.zoom
    return {
      x: p.x * z + this.viewport.pan.x,
      y: p.y * z + this.viewport.pan.y,
    }
  }

  panBy(delta: Vec2) {
    this.viewport.pan.x += delta.x
    this.viewport.pan.y += delta.y
    this.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  zoomAt(screenPoint: Vec2, nextZoom: number) {
    const prevZoom = this.viewport.zoom
    const z = clamp(nextZoom, 0.1, 8)
    if (Math.abs(z - prevZoom) < 1e-6) return

    // 保持鼠标指向的 world 点不变：调整 pan
    const worldBefore = this.screenToWorld(screenPoint)
    this.viewport.zoom = z
    const screenAfter = this.worldToScreen(worldBefore)
    this.viewport.pan.x += screenPoint.x - screenAfter.x
    this.viewport.pan.y += screenPoint.y - screenAfter.y

    this.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  fitToStage(stage: DwebStageNode, paddingPx = 24, inset: ViewportInset = {}) {
    const w = this.canvas.width / this.dpr
    const h = this.canvas.height / this.dpr

    const left = inset.left ?? 0
    const top = inset.top ?? 0
    const right = inset.right ?? 0
    const bottom = inset.bottom ?? 0

    const availableW = Math.max(1, w - left - right - paddingPx * 2)
    const availableH = Math.max(1, h - top - bottom - paddingPx * 2)

    const scaleX = availableW / stage.width
    const scaleY = availableH / stage.height
    const z = clamp(Math.min(scaleX, scaleY), 0.1, 8)

    this.viewport.zoom = z
    // stage 默认在 world 原点，居中到“可视区域(扣掉标尺 inset 与 padding)”的中心
    const centerX = left + (w - left - right) / 2
    const centerY = top + (h - top - bottom) / 2
    this.viewport.pan = { x: centerX, y: centerY }

    this.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  setGuidesEnabled(enabled: boolean) {
    this.guidesEnabled = enabled
    this.requestRender()
  }

  requestRender() {
    if (this.isDisposed) return
    if (this.rafId != null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.render()
    })
  }

  render() {
    const ctx = this.ctx

    const w = this.canvas.width / this.dpr
    const h = this.canvas.height / this.dpr

    const worldBounds = this.getWorldBounds(w, h)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 背景在 world-space 绘制
    ctx.save()
    ctx.translate(this.viewport.pan.x, this.viewport.pan.y)
    ctx.scale(this.viewport.zoom, this.viewport.zoom)

    const ordered = this.nodes
      .filter((n) => n.visible)
      .slice()
      .sort((a, b) => a.zIndex - b.zIndex)

    for (const node of ordered) {
      node.render(ctx, { dpr: this.dpr, zoom: this.viewport.zoom, worldBounds })
    }

    if (this.guidesEnabled) {
      const stage = ordered.find((n) => n instanceof DwebStageNode) as DwebStageNode | undefined
      if (stage) this.drawStageGuides(ctx, stage, worldBounds)
    }

    ctx.restore()
  }

  private getWorldBounds(screenW: number, screenH: number): DwebWorldBounds {
    const topLeft = this.screenToWorld({ x: 0, y: 0 })
    const bottomRight = this.screenToWorld({ x: screenW, y: screenH })

    const minX = Math.min(topLeft.x, bottomRight.x)
    const maxX = Math.max(topLeft.x, bottomRight.x)
    const minY = Math.min(topLeft.y, bottomRight.y)
    const maxY = Math.max(topLeft.y, bottomRight.y)

    return { minX, maxX, minY, maxY }
  }

  private drawStageGuides(ctx: CanvasRenderingContext2D, stage: DwebStageNode, bounds: DwebWorldBounds) {
    const root = getComputedStyle(document.documentElement)
    const guideColor = (root.getPropertyValue('--vscode-border-accent') || '#3aa8b4').trim() || '#3aa8b4'

    const corners = stage.getWorldCorners()
    const center = stage.transform.position
    ctx.save()
    ctx.strokeStyle = guideColor
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1 / this.viewport.zoom
    ctx.setLineDash([6 / this.viewport.zoom, 6 / this.viewport.zoom])

    for (const p of corners) {
      // 每个角点延伸到其对应的“最近边”：
      // 左上 -> top + left；右上 -> top + right；右下 -> bottom + right；左下 -> bottom + left
      const edgeX = p.x < center.x ? bounds.minX : bounds.maxX
      const edgeY = p.y < center.y ? bounds.minY : bounds.maxY

      ctx.beginPath()
      ctx.moveTo(p.x, edgeY)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(edgeX, p.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }

    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.restore()
  }
}
