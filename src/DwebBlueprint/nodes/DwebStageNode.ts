import { DwebNode } from './DwebNode'
import type { Vec2 } from '../types'
import type { DwebRenderEnv } from './DwebNode'

export class DwebStageNode extends DwebNode {
  width = 1920
  height = 1080

  fill = '#181818'
  stroke = '#3c3c3c'
  labelColor = '#d4d4d4'
  subLabelColor = '#a0a0a0'

  constructor(options: { id: string; name?: string; width?: number; height?: number }) {
    super({ id: options.id, name: options.name ?? 'Video Scene' })
    this.width = options.width ?? this.width
    this.height = options.height ?? this.height
    this.zIndex = 10
  }

  setSize(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getWorldCorners(): [Vec2, Vec2, Vec2, Vec2] {
    const { x, y } = this.transform.position
    const rot = this.transform.rotation
    const sx = this.transform.scale.x
    const sy = this.transform.scale.y

    const hw = (this.width / 2) * sx
    const hh = (this.height / 2) * sy

    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const rotate = (p: Vec2): Vec2 => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    })

    const tl = rotate({ x: -hw, y: -hh })
    const tr = rotate({ x: hw, y: -hh })
    const br = rotate({ x: hw, y: hh })
    const bl = rotate({ x: -hw, y: hh })

    return [
      { x: x + tl.x, y: y + tl.y },
      { x: x + tr.x, y: y + tr.y },
      { x: x + br.x, y: y + br.y },
      { x: x + bl.x, y: y + bl.y },
    ]
  }

  render(ctx: CanvasRenderingContext2D, _env: DwebRenderEnv) {
    const { x, y } = this.transform.position

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(this.transform.rotation)
    ctx.scale(this.transform.scale.x, this.transform.scale.y)

    const w = this.width
    const h = this.height

    ctx.fillStyle = this.fill
    ctx.strokeStyle = this.stroke
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.rect(-w / 2, -h / 2, w, h)
    ctx.fill()
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.fillStyle = this.labelColor
    ctx.font = '600 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(this.name, 0, -8)

    ctx.fillStyle = this.subLabelColor
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(`${this.width} × ${this.height}`, 0, 18)

    ctx.restore()
  }
}
