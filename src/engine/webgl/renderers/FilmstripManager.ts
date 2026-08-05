type FilmstripData = {
	spriteDataUrl: string
	frameIntervalSec: number
	thumbWidth: number
	thumbHeight: number
	columns: number
	rows: number
	totalFrames: number
	durationSec: number
}

type FilmstripEntry = {
	videoId: string
	data: FilmstripData | null
	image: HTMLImageElement | null
	loading: boolean
	loaded: boolean
	error: string | null
	lastRequestTime: number
}

export class FilmstripManager {
	private entries = new Map<string, FilmstripEntry>()
	private scratchCanvas: HTMLCanvasElement | null = null
	private scratchCtx: CanvasRenderingContext2D | null = null

	constructor() {
		try {
			this.scratchCanvas = document.createElement('canvas')
			this.scratchCanvas.width = 16
			this.scratchCanvas.height = 16
			this.scratchCtx = this.scratchCanvas.getContext('2d', { willReadFrequently: false })
		} catch {
			this.scratchCanvas = null
			this.scratchCtx = null
		}
	}

	async requestFilmstrip(
		videoId: string,
		videoUrl: string,
		_videoWidth: number,
		_videoHeight: number
	): Promise<boolean> {
		let entry = this.entries.get(videoId)
		if (!entry) {
			entry = {
				videoId,
				data: null,
				image: null,
				loading: false,
				loaded: false,
				error: null,
				lastRequestTime: performance.now()
			}
			this.entries.set(videoId, entry)
		}

		if (entry.loaded || entry.loading) {
			return entry.loaded
		}

		entry.loading = true
		entry.error = null
		entry.lastRequestTime = performance.now()

		try {
			const thumbWidth = 320

			const bridge = (window as any).electronBridge?.videostudio
			if (!bridge?.generateFilmstrip) {
				console.warn('[FilmstripManager] generateFilmstrip not available')
				entry.loading = false
				entry.error = 'no ipc bridge'
				return false
			}

			const result = await bridge.generateFilmstrip({
				videoUrl,
				thumbWidth,
				columns: 10,
				intervalSec: undefined
			})

			if (!result?.ok) {
				console.warn('[FilmstripManager] generateFilmstrip failed:', result?.error)
				entry.loading = false
				entry.error = result?.error || 'unknown error'
				return false
			}

			const img = new Image()
			img.decoding = 'async'

			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve()
				img.onerror = () => reject(new Error('sprite image load failed'))
				img.src = result.spriteDataUrl
			})

			const columns = result.columns
			const rows = result.rows
			const spriteW = img.naturalWidth || img.width
			const spriteH = img.naturalHeight || img.height
			const actualThumbW = Math.floor(spriteW / columns)
			const actualThumbH = Math.floor(spriteH / rows)

			const data: FilmstripData = {
				spriteDataUrl: result.spriteDataUrl,
				frameIntervalSec: result.frameIntervalSec,
				thumbWidth: actualThumbW,
				thumbHeight: actualThumbH,
				columns,
				rows,
				totalFrames: result.totalFrames,
				durationSec: result.durationSec
			}

			entry.data = data
			entry.image = img
			entry.loaded = true
			entry.loading = false
			console.log(
				'[FilmstripManager] loaded for:',
				videoId,
				'frames:',
				data.totalFrames,
				'thumb:',
				actualThumbW + 'x' + actualThumbH,
				'interval:',
				data.frameIntervalSec.toFixed(3) + 's'
			)
			return true
		} catch (err) {
			entry.loading = false
			entry.error = String((err as Error)?.message || err)
			console.error('[FilmstripManager] error loading filmstrip for', videoId, err)
			return false
		}
	}

	getFrameAtTime(videoId: string, time: number): HTMLCanvasElement | null {
		const entry = this.entries.get(videoId)
		if (!entry?.loaded || !entry.data || !entry.image || !this.scratchCanvas || !this.scratchCtx) {
			return null
		}

		const data = entry.data
		const img = entry.image
		const t = Math.max(0, Math.min(time, data.durationSec))
		const frameIndex = Math.min(Math.floor(t / data.frameIntervalSec), data.totalFrames - 1)
		const col = frameIndex % data.columns
		const row = Math.floor(frameIndex / data.columns)

		const sx = col * data.thumbWidth
		const sy = row * data.thumbHeight
		const sw = data.thumbWidth
		const sh = data.thumbHeight

		if (this.scratchCanvas.width !== sw || this.scratchCanvas.height !== sh) {
			this.scratchCanvas.width = sw
			this.scratchCanvas.height = sh
		}

		this.scratchCtx.clearRect(0, 0, sw, sh)
		this.scratchCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

		return this.scratchCanvas
	}

	isReady(videoId: string): boolean {
		const entry = this.entries.get(videoId)
		return !!(entry?.loaded && entry.data && entry.image)
	}

	getFrameInterval(videoId: string): number {
		return this.entries.get(videoId)?.data?.frameIntervalSec || 0
	}

	disposeVideo(videoId: string) {
		const entry = this.entries.get(videoId)
		if (entry) {
			entry.image = null
			entry.data = null
			entry.loaded = false
			entry.loading = false
		}
		this.entries.delete(videoId)
	}

	dispose() {
		for (const id of this.entries.keys()) {
			this.disposeVideo(id)
		}
		if (this.scratchCanvas) {
			this.scratchCanvas.width = 1
			this.scratchCanvas.height = 1
			this.scratchCanvas = null
			this.scratchCtx = null
		}
	}
}

export const filmstripManager = new FilmstripManager()
