import { DwebNode } from './DwebNode'
import type { DwebRenderEnv } from './DwebNode'

export class DwebGridNode extends DwebNode {
  spacing = 24
  minorColor = '#3c3c3c'
  majorColor = '#3aa8b4'
  minorAlpha = 0.35
  majorAlpha = 0.12
  majorStep = 5

  constructor(options: { id: string; name?: string }) {
    super({ id: options.id, name: options.name ?? 'Grid' })
    this.zIndex = -100
  }

  render(ctx: CanvasRenderingContext2D, env: DwebRenderEnv) {
    const { minX, maxX, minY, maxY } = env.worldBounds

    const root = getComputedStyle(document.documentElement)
    const gridColor = (root.getPropertyValue('--vscode-border') || this.minorColor).trim() || this.minorColor
    const accent = (root.getPropertyValue('--vscode-accent') || this.majorColor).trim() || this.majorColor

    const spacing = this.spacing
    const majorSpacing = spacing * this.majorStep

    ctx.lineWidth = 1 / env.zoom

    // minor
    ctx.strokeStyle = gridColor
    ctx.globalAlpha = this.minorAlpha
    const startX = Math.floor(minX / spacing) * spacing
    const startY = Math.floor(minY / spacing) * spacing
    for (let x = startX; x <= maxX; x += spacing) {
      ctx.beginPath()
      ctx.moveTo(x, minY)
      ctx.lineTo(x, maxY)
      ctx.stroke()
    }
    for (let y = startY; y <= maxY; y += spacing) {
      ctx.beginPath()
      ctx.moveTo(minX, y)
      ctx.lineTo(maxX, y)
      ctx.stroke()
    }

    // major
    ctx.strokeStyle = accent
    ctx.globalAlpha = this.majorAlpha
    const startMX = Math.floor(minX / majorSpacing) * majorSpacing
    const startMY = Math.floor(minY / majorSpacing) * majorSpacing
    for (let x = startMX; x <= maxX; x += majorSpacing) {
      ctx.beginPath()
      ctx.moveTo(x, minY)
      ctx.lineTo(x, maxY)
      ctx.stroke()
    }
    for (let y = startMY; y <= maxY; y += majorSpacing) {
      ctx.beginPath()
      ctx.moveTo(minX, y)
      ctx.lineTo(maxX, y)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }
}
