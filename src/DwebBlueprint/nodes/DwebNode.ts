import type { Vec2 } from '../types'

export type DwebWorldBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type DwebRenderEnv = {
  dpr: number
  zoom: number
  worldBounds: DwebWorldBounds
}

export type DwebNodeTransform = {
  position: Vec2
  scale: Vec2
  rotation: number
}

export abstract class DwebNode {
  id: string
  name: string
  transform: DwebNodeTransform
  visible = true
  zIndex = 0

  constructor(options: { id: string; name: string; position?: Vec2; scale?: Vec2; rotation?: number }) {
    this.id = options.id
    this.name = options.name
    this.transform = {
      position: options.position ?? { x: 0, y: 0 },
      scale: options.scale ?? { x: 1, y: 1 },
      rotation: options.rotation ?? 0,
    }
  }

  abstract render(ctx: CanvasRenderingContext2D, env: DwebRenderEnv): void
}
