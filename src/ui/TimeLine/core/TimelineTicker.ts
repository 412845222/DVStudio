export type TimelineTickerOptions = {
	getFrameCount: () => number
	getCurrentFrame: () => number
	setCurrentFrame: (frameIndex: number) => void
	fps?: number
	loop?: boolean
	onPlayingChange?: (playing: boolean) => void
	onTick?: (frameIndex: number) => void
}

export class TimelineTicker {
	private readonly getFrameCount: () => number
	private readonly getCurrentFrame: () => number
	private readonly setCurrentFrame: (frameIndex: number) => void
	private readonly onPlayingChange?: (playing: boolean) => void
	private readonly onTick?: (frameIndex: number) => void

	private playing = false
	private raf = 0
	private lastTime = 0
	private accMs = 0
	private fps = 30
	private loop = false

	constructor(opts: TimelineTickerOptions) {
		this.getFrameCount = opts.getFrameCount
		this.getCurrentFrame = opts.getCurrentFrame
		this.setCurrentFrame = opts.setCurrentFrame
		this.onPlayingChange = opts.onPlayingChange
		this.onTick = opts.onTick

		if (typeof opts.fps === 'number') this.setFps(opts.fps)
		if (typeof opts.loop === 'boolean') this.loop = opts.loop
	}

	isPlaying() {
		return this.playing
	}

	setLoop(loop: boolean) {
		this.loop = !!loop
	}

	setFps(fps: number) {
		const next = Math.floor(Number(fps))
		this.fps = Number.isFinite(next) ? Math.max(1, Math.min(240, next)) : 30
	}

	play() {
		if (this.playing) return

		const frameCount = Math.max(0, Math.floor(this.getFrameCount()))
		if (frameCount <= 0) return

		// 如果停在末帧：循环则从 0 开始；否则保持末帧（再次播放不会前进）
		const cur = Math.max(0, Math.floor(this.getCurrentFrame()))
		if (cur >= frameCount - 1 && this.loop) this.setCurrentFrame(0)

		this.playing = true
		this.onPlayingChange?.(true)
		this.lastTime = performance.now()
		this.accMs = 0
		this.schedule()
	}

	pause() {
		if (!this.playing) return
		this.playing = false
		if (this.raf) cancelAnimationFrame(this.raf)
		this.raf = 0
		this.onPlayingChange?.(false)
	}

	stop() {
		this.pause()
		this.setCurrentFrame(0)
	}

	dispose() {
		this.pause()
	}

	private schedule() {
		if (this.raf) return
		this.raf = requestAnimationFrame((t) => this.tick(t))
	}

	private tick(now: number) {
		this.raf = 0
		if (!this.playing) return

		const frameCount = Math.max(0, Math.floor(this.getFrameCount()))
		if (frameCount <= 0) {
			this.pause()
			return
		}

		const msPerFrame = 1000 / Math.max(1, this.fps)
		const dt = Math.max(0, now - this.lastTime)
		this.lastTime = now
		this.accMs += dt

		const steps = Math.floor(this.accMs / msPerFrame)
		if (steps <= 0) {
			this.schedule()
			return
		}
		this.accMs -= steps * msPerFrame

		let next = Math.max(0, Math.floor(this.getCurrentFrame())) + steps
		if (next >= frameCount) {
			if (this.loop) {
				next = frameCount > 0 ? next % frameCount : 0
				this.setCurrentFrame(next)
				this.onTick?.(next)
				this.schedule()
				return
			}
			// 到末尾停止在最后一帧
			next = Math.max(0, frameCount - 1)
			this.setCurrentFrame(next)
			this.onTick?.(next)
			this.pause()
			return
		}

		this.setCurrentFrame(next)
		this.onTick?.(next)
		this.schedule()
	}
}
