import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { filmstripManager } from './FilmstripManager'

type VideoStatus = 'loading' | 'ready' | 'error'

type VideoEntry = {
	id: string
	src: string
	video: HTMLVideoElement | null
	texture: WebGLTexture | null
	width: number
	height: number
	duration: number
	status: VideoStatus
	lastUsedTime: number
	needsRender: boolean
	pendingSeek: { time: number; resolve: () => void; reject: (e: unknown) => void } | null
	pendingFastSeek: { time: number } | null
	canplaythroughHandler: (() => void) | null
	loadedmetadataHandler: (() => void) | null
	errorHandler: (() => void) | null
	seekedHandler: (() => void) | null
	muted: boolean
	loop: boolean
	lastFastSeekTime: number
	isScrubbing: boolean
	scrubTargetTime: number
	filmstripReady: boolean
}

class VideoTexturePoolImpl {
	private videos = new Map<string, VideoEntry>()
	private canvas: DwebCanvasGL | null = null
	private rafId: number | null = null
	private activeScrubId: string | null = null

	setCanvas(canvas: DwebCanvasGL | null) {
		if (canvas) {
			console.log('[VideoTexturePool] setCanvas:', !!canvas)
			this.canvas = canvas
			this.upgradePendingEntries()
			this.startFrameLoop()
		} else {
			console.log('[VideoTexturePool] setCanvas null, clearing', this.videos.size, 'entries')
			this.stopFrameLoop()
			const oldCanvas = this.canvas
			this.canvas = null
			for (const entry of this.videos.values()) {
				this.cleanupEntry(entry, oldCanvas)
			}
			this.videos.clear()
			this.activeScrubId = null
		}
	}

	private cleanupEntry(entry: VideoEntry, canvas?: DwebCanvasGL | null) {
		try {
			entry.video?.pause()
		} catch {}
		if (entry.canplaythroughHandler && entry.video) {
			entry.video.removeEventListener('canplaythrough', entry.canplaythroughHandler)
		}
		if (entry.loadedmetadataHandler && entry.video) {
			entry.video.removeEventListener('loadedmetadata', entry.loadedmetadataHandler)
		}
		if (entry.errorHandler && entry.video) {
			entry.video.removeEventListener('error', entry.errorHandler)
		}
		if (entry.seekedHandler && entry.video) {
			entry.video.removeEventListener('seeked', entry.seekedHandler)
		}
		if (entry.pendingSeek) {
			entry.pendingSeek.reject(new Error('pool reset'))
			entry.pendingSeek = null
		}
		entry.pendingFastSeek = null
		entry.isScrubbing = false
		if (entry.video) {
			try {
				entry.video.src = ''
				entry.video.removeAttribute('src')
				entry.video.load()
			} catch {}
		}
		const targetCanvas = canvas ?? this.canvas
		if (targetCanvas && entry.texture) {
			targetCanvas.deleteTexture(entry.texture)
		}
		filmstripManager.disposeVideo(entry.id)
		entry.video = null
		entry.texture = null
		entry.filmstripReady = false
	}

	private startFrameLoop() {
		if (this.rafId !== null) return
		const tick = () => {
			if (!this.canvas) {
				this.rafId = null
				return
			}
			this.tick()
			this.rafId = requestAnimationFrame(tick)
		}
		this.rafId = requestAnimationFrame(tick)
	}

	private stopFrameLoop() {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId)
			this.rafId = null
		}
	}

	private tick() {
		const canvas = this.canvas
		if (!canvas) return
		let needsRender = false
		for (const entry of this.videos.values()) {
			if (!entry.video || !entry.texture) continue
			if (entry.status !== 'ready') continue
			const v = entry.video

			if (entry.isScrubbing) {
				if (entry.filmstripReady) {
					try {
						const frame = filmstripManager.getFrameAtTime(entry.id, entry.scrubTargetTime)
						if (frame) {
							canvas.updateTextureFromImage(entry.texture, frame)
							needsRender = true
						}
					} catch {}
				} else if (v.readyState >= 2) {
					try {
						canvas.updateTextureFromImage(entry.texture, v)
						needsRender = true
					} catch {}
				}
				if (entry.pendingFastSeek) {
					const target = entry.pendingFastSeek.time
					if (v.readyState >= 2 && Math.abs(v.currentTime - target) < 0.5) {
						entry.pendingFastSeek = null
					}
				}
				continue
			}

			if (v.readyState < 2) continue

			if (entry.pendingFastSeek) {
				const target = entry.pendingFastSeek.time
				const diff = Math.abs(v.currentTime - target)
				if (diff < 0.15 || v.readyState >= 3) {
					try {
						canvas.updateTextureFromImage(entry.texture, v)
						entry.pendingFastSeek = null
						needsRender = true
					} catch {}
				} else if (v.readyState >= 2) {
					try {
						canvas.updateTextureFromImage(entry.texture, v)
						needsRender = true
					} catch {}
				}
			} else if (entry.pendingSeek) {
				const target = entry.pendingSeek.time
				if (Math.abs(v.currentTime - target) < 0.08) {
					const p = entry.pendingSeek
					entry.pendingSeek = null
					try {
						canvas.updateTextureFromImage(entry.texture, v)
					} catch {}
					p.resolve()
					needsRender = true
				}
			} else if (!v.paused && !v.ended) {
				try {
					canvas.updateTextureFromImage(entry.texture, v)
					entry.needsRender = false
					needsRender = true
				} catch {}
			}

			if (entry.needsRender) {
				try {
					canvas.updateTextureFromImage(entry.texture, v)
					entry.needsRender = false
					needsRender = true
				} catch {}
			}
		}
		if (needsRender || this.hasPendingRenders()) {
			canvas.requestRender()
		}
	}

	private createVideoElement(
		src: string,
		opts: { muted: boolean; loop: boolean }
	): HTMLVideoElement {
		const video = document.createElement('video')
		video.preload = 'auto'
		video.muted = opts.muted
		video.loop = opts.loop
		video.playsInline = true
		video.autoplay = false

		const isHttp = src.startsWith('http://') || src.startsWith('https://')
		if (isHttp) {
			video.crossOrigin = 'anonymous'
		}

		return video
	}

	private initEntry(entry: VideoEntry, canvas: DwebCanvasGL) {
		if (entry.video) {
			this.cleanupEntry(entry, canvas)
		}
		console.log('[VideoTexturePool] initEntry:', entry.id, 'src:', entry.src)
		const video = this.createVideoElement(entry.src, { muted: entry.muted, loop: entry.loop })
		entry.video = video
		entry.texture = null
		entry.status = 'loading'
		entry.needsRender = false
		entry.filmstripReady = false

		filmstripManager.requestFilmstrip(entry.id, entry.src, 0, 0).then((ok) => {
			entry.filmstripReady = ok
			if (ok) {
				console.log('[VideoTexturePool] filmstrip ready for:', entry.id)
			}
		})

		let resolved = false

		entry.loadedmetadataHandler = () => {
			if (resolved || !entry.video) return
			console.log(
				'[VideoTexturePool] loadedmetadata:',
				entry.id,
				entry.video.videoWidth,
				entry.video.videoHeight,
				entry.video.duration
			)
			entry.width = entry.video.videoWidth || 0
			entry.height = entry.video.videoHeight || 0
			if (Number.isFinite(entry.video.duration)) {
				entry.duration = entry.video.duration
			}
		}

		entry.canplaythroughHandler = () => {
			if (resolved || entry.status !== 'loading') return
			if (!entry.video) {
				resolved = true
				entry.status = 'error'
				console.error('[VideoTexturePool] canplaythrough but no video:', entry.id)
				return
			}
			try {
				if (!entry.texture) {
					entry.texture = canvas.createTexture()
				}
				entry.status = 'ready'
				entry.width = entry.video.videoWidth || entry.width
				entry.height = entry.video.videoHeight || entry.height
				if (Number.isFinite(entry.video.duration)) {
					entry.duration = entry.video.duration
				}
				resolved = true
				console.log(
					'[VideoTexturePool] video ready:',
					entry.id,
					'size:',
					entry.width,
					'x',
					entry.height,
					'duration:',
					entry.duration
				)
				try {
					canvas.updateTextureFromImage(entry.texture, entry.video)
				} catch (e) {
					console.error('[VideoTexturePool] updateTextureFromImage error:', entry.id, e)
				}
				canvas.requestRender()
			} catch (err) {
				resolved = true
				entry.status = 'error'
				console.error('[VideoTexturePool] canplaythrough error:', entry.id, err)
				entry.pendingSeek?.reject(err)
				entry.pendingSeek = null
			}
		}

		entry.errorHandler = () => {
			if (resolved) return
			resolved = true
			entry.status = 'error'
			const err = entry.video?.error
			console.error('[VideoTexturePool] video error:', entry.id, err?.code, err?.message)
			if (entry.pendingSeek) {
				entry.pendingSeek.reject(
					new Error('video load error: ' + (err?.message || err?.code || 'unknown'))
				)
				entry.pendingSeek = null
			}
		}

		video.addEventListener('loadedmetadata', entry.loadedmetadataHandler)
		video.addEventListener('canplaythrough', entry.canplaythroughHandler)
		video.addEventListener('error', entry.errorHandler)
		video.src = entry.src
	}

	private upgradePendingEntries() {
		const canvas = this.canvas
		if (!canvas) return
		for (const entry of this.videos.values()) {
			if (!entry.video) {
				this.initEntry(entry, canvas)
			}
		}
	}

	getEntry(id: string): VideoEntry | undefined {
		return this.videos.get(id)
	}

	getOrCreate(id: string, src: string, opts: { muted: boolean; loop: boolean }) {
		const existing = this.videos.get(id)
		if (existing) {
			existing.lastUsedTime = performance.now()
			if (existing.src !== src) {
				console.log(
					'[VideoTexturePool] getOrCreate src changed for:',
					id,
					'old:',
					existing.src,
					'new:',
					src
				)
				if (existing.video) {
					this.cleanupEntry(existing, this.canvas)
				}
				existing.src = src
				existing.status = 'loading'
				existing.filmstripReady = false
				const canvas = this.canvas
				if (canvas) this.initEntry(existing, canvas)
			} else if (!existing.video) {
				console.log(
					'[VideoTexturePool] getOrCreate init existing (no video):',
					id,
					'status:',
					existing.status
				)
				const canvas = this.canvas
				if (canvas) this.initEntry(existing, canvas)
			}
			return existing
		}

		console.log('[VideoTexturePool] getOrCreate new:', id, 'src:', src)

		const entry: VideoEntry = {
			id,
			src,
			video: null,
			texture: null,
			width: 0,
			height: 0,
			duration: 0,
			status: 'loading',
			lastUsedTime: performance.now(),
			needsRender: false,
			pendingSeek: null,
			pendingFastSeek: null,
			canplaythroughHandler: null,
			loadedmetadataHandler: null,
			errorHandler: null,
			seekedHandler: null,
			muted: opts.muted,
			loop: opts.loop,
			lastFastSeekTime: 0,
			isScrubbing: false,
			scrubTargetTime: 0,
			filmstripReady: false
		}

		this.videos.set(id, entry)

		const canvas = this.canvas
		if (canvas) {
			this.initEntry(entry, canvas)
		}

		return entry
	}

	hasPendingRenders(): boolean {
		for (const entry of this.videos.values()) {
			if (entry.status === 'error') continue
			if (entry.isScrubbing) return true
			if (entry.needsRender) return true
			if (entry.status === 'loading' && entry.video) return true
			if (entry.pendingSeek) return true
			if (entry.pendingFastSeek) return true
		}
		return false
	}

	clearRenderFlag() {
		for (const entry of this.videos.values()) {
			entry.needsRender = false
		}
	}

	seek(entry: VideoEntry, time: number): Promise<void> {
		if (!entry || entry.status !== 'ready' || !entry.video || !this.canvas) return Promise.resolve()
		const v = entry.video
		const canvas = this.canvas
		const target = Math.max(0, Math.min(time, entry.duration || v.duration || time))

		entry.isScrubbing = false
		this.activeScrubId = null

		if (Math.abs(v.currentTime - target) < 0.08) {
			if (entry.texture) {
				try {
					canvas.updateTextureFromImage(entry.texture, v)
					canvas.requestRender()
				} catch {}
			}
			return Promise.resolve()
		}

		entry.pendingFastSeek = null

		if (entry.pendingSeek) {
			entry.pendingSeek.reject(new Error('seek superseded'))
			entry.pendingSeek = null
		}

		return new Promise<void>((resolve, reject) => {
			entry.pendingSeek = { time: target, resolve, reject }
			const onSeeked = () => {
				v.removeEventListener('seeked', onSeeked)
				if (!entry.pendingSeek) return
				const p = entry.pendingSeek
				entry.pendingSeek = null
				if (entry.texture) {
					try {
						canvas.updateTextureFromImage(entry.texture, v)
					} catch {}
				}
				canvas.requestRender()
				p.resolve()
			}
			entry.seekedHandler = onSeeked
			v.addEventListener('seeked', onSeeked, { once: true })
			try {
				v.currentTime = target
			} catch {
				v.removeEventListener('seeked', onSeeked)
				entry.pendingSeek = null
				resolve()
			}
		})
	}

	startScrubbing(entry: VideoEntry, time: number) {
		if (!entry || !entry.video || !this.canvas) return
		const v = entry.video
		const target = Math.max(0, Math.min(time, entry.duration || v.duration || time))

		if (this.activeScrubId && this.activeScrubId !== entry.id) {
			const prev = this.videos.get(this.activeScrubId)
			if (prev) prev.isScrubbing = false
		}
		this.activeScrubId = entry.id
		entry.isScrubbing = true
		entry.scrubTargetTime = target

		if (entry.pendingSeek) {
			entry.pendingSeek.reject(new Error('seek superseded by scrub'))
			entry.pendingSeek = null
		}

		const now = performance.now()
		if (now - entry.lastFastSeekTime < 32) return
		entry.lastFastSeekTime = now

		entry.pendingFastSeek = { time: target }
		try {
			if (
				typeof (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek === 'function'
			) {
				;(v as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek(target)
			} else {
				v.currentTime = target
			}
		} catch {
			try {
				v.currentTime = target
			} catch {}
		}
	}

	scrubTo(entry: VideoEntry, time: number) {
		if (!entry || !entry.video) return
		const v = entry.video
		const target = Math.max(0, Math.min(time, entry.duration || v.duration || time))
		entry.scrubTargetTime = target

		const now = performance.now()
		if (now - entry.lastFastSeekTime < 64) return
		entry.lastFastSeekTime = now

		entry.pendingFastSeek = { time: target }
		try {
			if (
				typeof (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek === 'function'
			) {
				;(v as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek(target)
			} else {
				v.currentTime = target
			}
		} catch {
			try {
				v.currentTime = target
			} catch {}
		}
	}

	async endScrubbing(entry: VideoEntry): Promise<void> {
		if (!entry || !entry.video) return
		entry.isScrubbing = false
		if (this.activeScrubId === entry.id) this.activeScrubId = null
		const target = entry.scrubTargetTime
		entry.pendingFastSeek = { time: target }
		entry.needsRender = true
		if (this.canvas && entry.texture && entry.video.readyState >= 2) {
			try {
				this.canvas.updateTextureFromImage(entry.texture, entry.video)
				this.canvas.requestRender()
			} catch {}
		}
	}

	seekFast(entry: VideoEntry, time: number): void {
		if (!entry || entry.status !== 'ready' || !entry.video) return
		const v = entry.video
		if (entry.pendingSeek) {
			entry.pendingSeek.reject(new Error('seek superseded by fastSeek'))
			entry.pendingSeek = null
		}
		const target = Math.max(0, Math.min(time, entry.duration || v.duration || time))
		if (Math.abs(v.currentTime - target) < 0.15) return

		const now = performance.now()
		if (now - entry.lastFastSeekTime < 16) return
		entry.lastFastSeekTime = now

		entry.pendingFastSeek = { time: target }
		try {
			if (
				typeof (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek === 'function'
			) {
				;(v as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek(target)
			} else {
				v.currentTime = target
			}
		} catch {
			try {
				v.currentTime = target
			} catch {}
		}
	}

	invalidateVideoCache(videoId: string) {
		filmstripManager.disposeVideo(videoId)
	}

	getDuration(id: string): number {
		return this.videos.get(id)?.duration || 0
	}

	getCurrentTime(id: string): number {
		return this.videos.get(id)?.video?.currentTime || 0
	}

	play(id: string): Promise<void> {
		const entry = this.videos.get(id)
		if (!entry || entry.status !== 'ready' || !entry.video) return Promise.resolve()
		entry.lastUsedTime = performance.now()
		entry.isScrubbing = false
		return entry.video.play().catch(() => {})
	}

	pause(id: string) {
		const entry = this.videos.get(id)
		if (!entry || entry.status !== 'ready' || !entry.video) return
		entry.video.pause()
	}

	getVideoBufferingState(id: string): {
		isBuffering: boolean
		bufferProgress: number
		readyState: number
	} {
		const entry = this.videos.get(id)
		if (!entry || !entry.video) {
			return { isBuffering: false, bufferProgress: 1, readyState: 0 }
		}
		const v = entry.video
		const readyState = v.readyState
		let bufferProgress = 0
		try {
			if (v.buffered.length > 0 && entry.duration > 0) {
				const currentTime = v.currentTime
				let bufferedEnd = 0
				for (let i = 0; i < v.buffered.length; i++) {
					if (v.buffered.start(i) <= currentTime && currentTime <= v.buffered.end(i)) {
						bufferedEnd = v.buffered.end(i)
						break
					}
				}
				bufferProgress = Math.min(1, Math.max(0, bufferedEnd / entry.duration))
			} else if (readyState >= 4) {
				bufferProgress = 1
			}
		} catch {}
		const isBuffering =
			readyState < 4 &&
			(entry.pendingSeek != null ||
				entry.pendingFastSeek != null ||
				(v.paused === false && readyState < 3))
		return { isBuffering, bufferProgress, readyState }
	}
}

export const videoTexturePool = new VideoTexturePoolImpl()
