type Particle = {
  x: number
  y: number
  tx: number
  ty: number
  vx: number
  vy: number
  w: number
  h: number
  life: number
  maxLife: number
  phase: 'gather' | 'spread'
  color: string
}

export interface UseCardParticlesOptions {
  maxParticles?: number
  emitIntervalMs?: number
  colors?: string[]
  accentColor?: string
}

export interface UseCardParticles {
  start: () => void
  stop: () => void
  dispose: () => void
  setHovering: (value: boolean) => void
}

const DEFAULT_COLORS = ['#27b99c', '#4fb7c5', '#e5b567']
const DEFAULT_MAX_PARTICLES = 40
const DEFAULT_EMIT_INTERVAL_MS = 450

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useCardParticles(
  canvas: HTMLCanvasElement,
  options: UseCardParticlesOptions = {},
): UseCardParticles {
  const maxParticles = options.maxParticles ?? DEFAULT_MAX_PARTICLES
  const emitIntervalMs = options.emitIntervalMs ?? DEFAULT_EMIT_INTERVAL_MS
  const colors = options.colors ?? DEFAULT_COLORS
  const reduced = prefersReducedMotion()
  const effectiveMax = reduced ? 8 : maxParticles

  const particles: Particle[] = []
  const ctx = canvas.getContext('2d')!
  if (!ctx) {
    return { start() {}, stop() {}, dispose() {}, setHovering() {} }
  }

  let hovering = false
  let rafId = 0
  let lastEmitTs = 0
  let running = false
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  let cssWidth = 0
  let cssHeight = 0
  let stoppedOnce = false

  function resize() {
    const rect = canvas.getBoundingClientRect()
    cssWidth = Math.max(1, Math.floor(rect.width))
    cssHeight = Math.max(1, Math.floor(rect.height))
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = Math.floor(cssWidth * dpr)
    canvas.height = Math.floor(cssHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function spawn(count: number) {
    const w = cssWidth
    const h = cssHeight
    const cx = w / 2
    const cy = h / 2
    const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left']
    for (let i = 0; i < count; i++) {
      if (particles.length >= effectiveMax) break
      const edge = edges[Math.floor(Math.random() * edges.length)]
      let x = 0
      let y = 0
      if (edge === 'top') {
        x = Math.random() * w
        y = Math.random() * 4
      } else if (edge === 'bottom') {
        x = Math.random() * w
        y = h - Math.random() * 4
      } else if (edge === 'left') {
        x = Math.random() * 4
        y = Math.random() * h
      } else {
        x = w - Math.random() * 4
        y = Math.random() * h
      }
      const pw = 2 + Math.floor(Math.random() * 4)
      const ph = 2 + Math.floor(Math.random() * 4)
      const gatherMs = reduced ? 400 : 600
      const spreadMs = reduced ? 500 : 800
      particles.push({
        x,
        y,
        tx: cx,
        ty: cy,
        vx: 0,
        vy: 0,
        w: pw,
        h: ph,
        life: 0,
        maxLife: gatherMs + spreadMs,
        phase: 'gather',
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
  }

  function update(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.phase === 'gather') {
        const t = Math.min(1, p.life / (reduced ? 400 : 600))
        const ease = 1 - Math.pow(1 - t, 2)
        p.x = p.x + (p.tx - p.x) * ease * 0.35
        p.y = p.y + (p.ty - p.y) * ease * 0.35
        if (p.life >= (reduced ? 400 : 600)) {
          p.phase = 'spread'
          const angle = Math.random() * Math.PI * 2
          const speed = 0.04 + Math.random() * 0.08
          p.vx = Math.cos(angle) * speed * (p.w + 2)
          p.vy = Math.sin(angle) * speed * (p.h + 2)
        }
      } else {
        p.x += p.vx * dt * 0.06
        p.y += p.vy * dt * 0.06
        p.vx *= 1.02
        p.vy *= 1.02
      }
      if (p.life >= p.maxLife || p.x < -20 || p.x > cssWidth + 20 || p.y < -20 || p.y > cssHeight + 20) {
        particles.splice(i, 1)
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    for (const p of particles) {
      let alpha = 1
      if (p.phase === 'gather') {
        alpha = Math.min(1, p.life / (reduced ? 180 : 220))
      } else {
        const spreadLife = p.life - (reduced ? 400 : 600)
        alpha = Math.max(0, 1 - spreadLife / (reduced ? 500 : 800))
      }
      ctx.globalAlpha = alpha * 0.92
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h))
    }
    ctx.globalAlpha = 1
  }

  function loop(ts: number) {
    if (!running) return
    if (document.hidden) {
      rafId = requestAnimationFrame(loop)
      return
    }
    const dt = Math.min(64, ts - (lastTime || ts))
    lastTime = ts
    if (hovering && !reduced) {
      if (ts - lastEmitTs > emitIntervalMs && particles.length < effectiveMax) {
        spawn(3)
        lastEmitTs = ts
      }
    }
    update(dt)
    draw()
    if (particles.length > 0 || hovering) {
      rafId = requestAnimationFrame(loop)
    } else {
      running = false
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      if (!stoppedOnce) stoppedOnce = true
    }
  }

  let lastTime = 0
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => resize())
    : null
  if (ro) ro.observe(canvas)

  function start() {
    resize()
    if (!hovering) return
    if (reduced) {
      spawn(6)
    } else {
      spawn(24)
    }
    if (running) return
    running = true
    lastTime = 0
    rafId = requestAnimationFrame(loop)
  }

  function stop() {
    hovering = false
  }

  function dispose() {
    running = false
    hovering = false
    if (rafId) cancelAnimationFrame(rafId)
    if (ro) ro.disconnect()
    particles.length = 0
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    } catch (_e) {
      // ignore
    }
  }

  function setHovering(value: boolean) {
    hovering = value
    if (value) {
      start()
    }
  }

  return { start, stop, dispose, setHovering }
}
