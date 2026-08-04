export type BatchedStoreMutation = {
	type: string
	payload?: unknown
}

export type BatchedFlushHandler = (mutations: BatchedStoreMutation[]) => void

export class StateUpdateBatcher {
	private windowMs: number
	private flushHandler: BatchedFlushHandler
	private queue: BatchedStoreMutation[] = []
	private timer: number | null = null
	private lastFlushAt = 0
	private maxBatchSize: number
	private forceFlushTimer: number | null = null
	private forceFlushMaxDelayMs: number

	constructor(
		flushHandler: BatchedFlushHandler,
		options?: {
			windowMs?: number
			maxBatchSize?: number
			forceFlushMaxDelayMs?: number
		}
	) {
		this.flushHandler = flushHandler
		this.windowMs = options?.windowMs ?? 100
		this.maxBatchSize = options?.maxBatchSize ?? 50
		this.forceFlushMaxDelayMs = options?.forceFlushMaxDelayMs ?? 500
	}

	push(type: string, payload?: unknown): void {
		this.queue.push({ type, payload })
		if (this.queue.length >= this.maxBatchSize) {
			this.flush()
			return
		}
		if (this.timer == null) {
			this.timer = window.setTimeout(() => this.flush(), this.windowMs)
		}
		if (this.forceFlushTimer == null) {
			this.forceFlushTimer = window.setTimeout(() => this.flush(), this.forceFlushMaxDelayMs)
		}
	}

	flush(): void {
		if (this.queue.length === 0) {
			this.clearTimers()
			return
		}
		const snapshot = this.queue
		this.queue = []
		this.lastFlushAt = Date.now()
		this.clearTimers()
		try {
			this.flushHandler(snapshot)
		} catch (e) {
			console.error('[StateUpdateBatcher] flushHandler error:', e)
		}
	}

	size(): number {
		return this.queue.length
	}

	dispose(): void {
		this.flush()
		this.clearTimers()
	}

	private clearTimers(): void {
		if (this.timer != null) {
			window.clearTimeout(this.timer)
			this.timer = null
		}
		if (this.forceFlushTimer != null) {
			window.clearTimeout(this.forceFlushTimer)
			this.forceFlushTimer = null
		}
	}
}
