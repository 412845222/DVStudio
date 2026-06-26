import type { MediaImportResult, MediaImportTask } from './mediaResourceImportWorker'

type TaskWithCallback = MediaImportTask & {
	onResult?: (res: MediaImportResult) => void
}

type WorkerRequest = {
	type: 'process'
	tasks: MediaImportTask[]
}

type WorkerResponse = {
	type: 'result'
	results: MediaImportResult[]
}

type Options = {
	batchSize?: number
	maxWorkers?: number
	/**
	 * Max number of resources being processed at the same time (in-flight).
	 * Default follows spec: 16 workers * 10 resources = 160.
	 */
	maxInFlight?: number
}

type WorkerSlot = {
	worker: Worker
	busy: boolean
}

// 媒体资源导入 Web Worker 的容错超时。
// 原始值 15 秒对于视频节点的大型资源导入不足。
// 提升到 120 秒，以确保在网络慢或资源体积大的场景下仍能完成。
const FAILSAFE_TIMEOUT_MS = 120_000

export class MediaResourceImportManager {
	private readonly batchSize: number
	private readonly maxWorkers: number
	private readonly maxInFlight: number

	private disposed = false
	private inFlight = 0

	private queue: TaskWithCallback[] = []
	private workers: WorkerSlot[] = []

	constructor(opts: Options = {}) {
		this.batchSize = Math.max(1, Math.floor(Number(opts.batchSize ?? 20)))
		this.maxWorkers = Math.max(1, Math.floor(Number(opts.maxWorkers ?? 16)))
		this.maxInFlight = Math.max(1, Math.floor(Number(opts.maxInFlight ?? this.maxWorkers * 10)))
	}

	dispose() {
		this.disposed = true
		for (const w of this.workers) {
			try {
				w.worker.terminate()
			} catch {
				// ignore
			}
		}
		this.workers = []
		this.queue = []
		this.inFlight = 0
	}

	/**
	 * Best-effort cancel: drop pending tasks and terminate all active workers.
	 * The manager remains usable after cancel (new workers will be created on next enqueue).
	 */
	cancel() {
		if (this.disposed) return
		this.queue = []
		for (const w of this.workers) {
			try {
				w.worker.terminate()
			} catch {
				// ignore
			}
		}
		this.workers = []
		this.inFlight = 0
	}

	enqueue(tasks: Array<TaskWithCallback>) {
		if (this.disposed) return
		if (!Array.isArray(tasks) || !tasks.length) return
		this.queue.push(...tasks)
		this.ensureWorkers()
		this.pump()
	}

	private ensureWorkers() {
		if (this.disposed) return

		const planned = Math.min(this.maxInFlight, this.queue.length + this.inFlight)
		const target = Math.min(this.maxWorkers, Math.max(1, Math.ceil(planned / this.batchSize)))

		while (this.workers.length < target) {
			const worker = new Worker(new URL('./mediaResourceImportWorker.ts', import.meta.url), {
				type: 'module'
			})
			const slot: WorkerSlot = { worker, busy: false }
			this.workers.push(slot)
		}

		// We intentionally do NOT shrink workers aggressively; reuse is cheaper.
	}

	private pump() {
		if (this.disposed) return
		// Avoid deep recursion / tight loops.
		queueMicrotask(() => this.pumpOnce())
	}

	private pumpOnce() {
		if (this.disposed) return

		this.ensureWorkers()

		const availableSlots = this.workers.filter((w) => !w.busy)
		if (!availableSlots.length) return
		if (!this.queue.length) return

		for (const slot of availableSlots) {
			if (!this.queue.length) break
			if (this.inFlight >= this.maxInFlight) break

			const allowed = Math.max(0, this.maxInFlight - this.inFlight)
			const take = Math.max(1, Math.min(this.batchSize, allowed, this.queue.length))
			const batch = this.queue.splice(0, take)
			if (!batch.length) break

			const callbacks = new Map<string, (res: MediaImportResult) => void>()
			for (const t of batch) {
				if (t.onResult) callbacks.set(String(t.resourceId), t.onResult)
			}

			slot.busy = true
			this.inFlight += batch.length

			let timeoutId = 0
			let finished = false

			const failBatch = (reason: string) => {
				for (const t of batch) {
					const resourceId = String(t.resourceId ?? '').trim()
					const kind = t.kind === 'video' ? 'video' : 'image'
					const cb = callbacks.get(resourceId)
					if (!cb) continue
					try {
						cb({ resourceId, kind, url: '', error: reason })
					} catch {
						// ignore
					}
				}
			}

			const finalize = () => {
				if (finished) return
				finished = true
				if (timeoutId) {
					clearTimeout(timeoutId)
					timeoutId = 0
				}
				slot.worker.removeEventListener('message', onMessage as EventListener)
				slot.worker.removeEventListener('error', onError as EventListener)
				slot.worker.removeEventListener('messageerror', onError as EventListener)
				slot.busy = false
				this.inFlight = Math.max(0, this.inFlight - batch.length)
				this.pump()
			}

			const onMessage = (ev: MessageEvent<WorkerResponse>) => {
				const msg = ev.data
				if (!msg || msg.type !== 'result' || !Array.isArray(msg.results)) return

				for (const r of msg.results) {
					const cb = callbacks.get(String(r.resourceId))
					try {
						cb?.(r)
					} catch {
						// ignore callback errors
					}
				}

				// Mark this worker slot free immediately after we got the batch result.
				finalize()
			}

			const onError = () => {
				// Best-effort: mark done; tasks will be effectively skipped.
				failBatch('worker error')
				finalize()
			}

			slot.worker.addEventListener('message', onMessage as EventListener)
			slot.worker.addEventListener('error', onError as EventListener)
			slot.worker.addEventListener('messageerror', onError as EventListener)

			const req: WorkerRequest = {
				type: 'process',
				tasks: batch.map(({ onResult: _cb, ...rest }) => rest)
			}

			try {
				slot.worker.postMessage(req)
			} catch {
				failBatch('postMessage failed')
				finalize()
			}

			// Ensure we release this slot after a response; use a soft timeout fallback.
			timeoutId = setTimeout(() => {
				if (!slot.busy) return
				// Worker likely stuck; terminate and recreate so future batches can proceed.
				failBatch('timeout')
				try {
					slot.worker.terminate()
				} catch {
					// ignore
				}
				try {
					slot.worker = new Worker(new URL('./mediaResourceImportWorker.ts', import.meta.url), {
						type: 'module'
					})
				} catch {
					// ignore
				}
				finalize()
			}, FAILSAFE_TIMEOUT_MS) as unknown as number
		}
	}
}
