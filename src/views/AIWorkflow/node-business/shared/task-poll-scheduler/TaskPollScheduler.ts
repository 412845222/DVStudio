import type {
	PollTask,
	PollTaskCallbacks,
	PollTaskProvider,
	PollTaskState,
	PollTaskStatus
} from './types'
import { isPollTaskTerminal } from './types'
import { IntervalPolicy, type IntervalPolicyParams } from './IntervalPolicy'

type TaskMapKey = string

interface InternalPollTaskEntry {
	task: PollTask
	nextRunAt: number
	lastTickDurationMs?: number
	inFlight: boolean
}

export interface TaskPollSchedulerOptions {
	intervalPolicy?: IntervalPolicyParams
	globalTickThrottleMs?: number
	concurrencyLimit?: number
	visibilityChangeAware?: boolean
	featureFlagKey?: string
	onFeatureFlagDisabledFallback?: () => boolean
}

const DEFAULT_GLOBAL_TICK_THROTTLE_MS = 120
const DEFAULT_CONCURRENCY_LIMIT = 6

export class TaskPollScheduler {
	private static _sharedInstance: TaskPollScheduler | null = null
	private entries = new Map<TaskMapKey, InternalPollTaskEntry>()
	private mainLoopTimer: number | null = null
	private lastLoopAt = 0
	private intervalPolicy: IntervalPolicy
	private globalTickThrottleMs: number
	private concurrencyLimit: number
	private visibilityChangeAware: boolean
	private tabVisible: boolean
	private handleVisibilityChange: () => void
	private featureFlagKey: string
	private onFeatureFlagDisabledFallback: () => boolean
	private inFlightCount = 0

	constructor(options: TaskPollSchedulerOptions = {}) {
		this.intervalPolicy = new IntervalPolicy(options.intervalPolicy)
		this.globalTickThrottleMs = options.globalTickThrottleMs ?? DEFAULT_GLOBAL_TICK_THROTTLE_MS
		this.concurrencyLimit = options.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT
		this.visibilityChangeAware = options.visibilityChangeAware !== false
		this.tabVisible = typeof document !== 'undefined' ? !document.hidden : true
		this.featureFlagKey = options.featureFlagKey ?? 'aiwf:task-poll-scheduler:enabled'
		this.onFeatureFlagDisabledFallback = options.onFeatureFlagDisabledFallback ?? (() => true)

		this.handleVisibilityChange = () => {
			this.tabVisible = !document.hidden
		}
		if (this.visibilityChangeAware && typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange)
		}
	}

	static get shared(): TaskPollScheduler {
		if (!TaskPollScheduler._sharedInstance) {
			TaskPollScheduler._sharedInstance = new TaskPollScheduler()
		}
		return TaskPollScheduler._sharedInstance
	}

	isEnabled(): boolean {
		try {
			const raw =
				typeof localStorage !== 'undefined' ? localStorage.getItem(this.featureFlagKey) : null
			if (raw === '0' || raw === 'false') return false
		} catch {
			// ignore
		}
		return this.onFeatureFlagDisabledFallback()
	}

	register(
		nodeId: string,
		taskId: string,
		provider: PollTaskProvider,
		callbacks: PollTaskCallbacks,
		initialStatus: PollTaskStatus = 'pending',
		initialProgress = 0
	): string {
		const id = this.makeTaskKey(nodeId, taskId)
		const existing = this.entries.get(id)
		if (existing) {
			existing.task.status = initialStatus
			existing.task.progress = initialProgress
			existing.task.errorCount = 0
			existing.task.lastErrorText = undefined
			existing.task.terminalNotified = false
			existing.inFlight = false
			existing.nextRunAt = Date.now()
			this.ensureLoop()
			return id
		}

		const task: PollTask = {
			id,
			nodeId,
			taskId,
			provider,
			createdAt: Date.now(),
			status: initialStatus,
			progress: initialProgress,
			errorCount: 0,
			terminalNotified: false,
			lastTickAt: 0,
			startedAt: Date.now(),
			disposed: false,
			onTick: callbacks.onTick,
			onEnterTerminal: callbacks.onEnterTerminal,
			onError: callbacks.onError
		}
		this.entries.set(id, {
			task,
			nextRunAt: Date.now(),
			inFlight: false
		})
		this.ensureLoop()
		return id
	}

	unregister(nodeId: string, taskId?: string): void {
		if (taskId) {
			const key = this.makeTaskKey(nodeId, taskId)
			this.disposeEntry(key)
			return
		}
		const keysToDelete: string[] = []
		for (const [key, entry] of this.entries) {
			if (entry.task.nodeId === nodeId) keysToDelete.push(key)
		}
		for (const key of keysToDelete) this.disposeEntry(key)
	}

	forceTickNow(nodeId: string, taskId: string): void {
		const key = this.makeTaskKey(nodeId, taskId)
		const entry = this.entries.get(key)
		if (!entry) return
		entry.nextRunAt = 0
	}

	has(nodeId: string, taskId: string): boolean {
		return this.entries.has(this.makeTaskKey(nodeId, taskId))
	}

	taskCount(): number {
		return this.entries.size
	}

	dispose(): void {
		for (const key of Array.from(this.entries.keys())) {
			this.disposeEntry(key)
		}
		if (this.mainLoopTimer != null) {
			window.clearInterval(this.mainLoopTimer)
			this.mainLoopTimer = null
		}
		if (this.visibilityChangeAware && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange)
		}
		if (TaskPollScheduler._sharedInstance === this) {
			TaskPollScheduler._sharedInstance = null
		}
	}

	private makeTaskKey(nodeId: string, taskId: string): TaskMapKey {
		return `${nodeId}::${taskId}`
	}

	private disposeEntry(key: TaskMapKey): void {
		const entry = this.entries.get(key)
		if (!entry) return
		entry.task.disposed = true
		this.entries.delete(key)
	}

	private ensureLoop(): void {
		if (this.mainLoopTimer != null) return
		this.mainLoopTimer = window.setInterval(() => this.loop(), this.globalTickThrottleMs)
	}

	private loop(): void {
		const now = Date.now()
		if (now - this.lastLoopAt < this.globalTickThrottleMs - 5) return
		this.lastLoopAt = now
		if (this.entries.size === 0) {
			if (this.mainLoopTimer != null) {
				window.clearInterval(this.mainLoopTimer)
				this.mainLoopTimer = null
			}
			return
		}

		const dueEntries: InternalPollTaskEntry[] = []
		for (const entry of this.entries.values()) {
			if (entry.inFlight || entry.task.disposed) continue
			if (isPollTaskTerminal(entry.task.status)) {
				this.notifyTerminalOnce(entry)
				this.disposeEntry(entry.task.id)
				continue
			}
			if (entry.nextRunAt <= now) dueEntries.push(entry)
		}

		if (dueEntries.length === 0) return
		const slots = Math.max(1, this.concurrencyLimit - this.inFlightCount)
		if (slots <= 0) return
		dueEntries.sort((a, b) => a.nextRunAt - b.nextRunAt)
		const runnable = dueEntries.slice(0, slots)
		for (const entry of runnable) this.runTick(entry)
	}

	private notifyTerminalOnce(entry: InternalPollTaskEntry): void {
		if (entry.task.terminalNotified) return
		entry.task.terminalNotified = true
		try {
			entry.task.onEnterTerminal?.(this.snapshotState(entry.task))
		} catch (e) {
			console.error('[TaskPollScheduler] onEnterTerminal error:', e)
		}
	}

	private snapshotState(task: PollTask): PollTaskState {
		return {
			taskId: task.taskId,
			nodeId: task.nodeId,
			provider: task.provider,
			status: task.status,
			progress: task.progress,
			terminalNotified: task.terminalNotified,
			lastTickAt: task.lastTickAt,
			startedAt: task.startedAt,
			errorCount: task.errorCount,
			lastErrorText: task.lastErrorText
		}
	}

	private async runTick(entry: InternalPollTaskEntry): Promise<void> {
		if (entry.inFlight || entry.task.disposed) return
		entry.inFlight = true
		this.inFlightCount++
		const startedAt = Date.now()
		const runningMs = startedAt - entry.task.startedAt
		try {
			const prevStatus = entry.task.status
			const prevProgress = entry.task.progress
			const input: PollTaskState = {
				taskId: entry.task.taskId,
				nodeId: entry.task.nodeId,
				provider: entry.task.provider,
				status: entry.task.status,
				progress: entry.task.progress,
				terminalNotified: entry.task.terminalNotified,
				lastTickAt: entry.task.lastTickAt,
				startedAt: entry.task.startedAt,
				errorCount: entry.task.errorCount,
				lastErrorText: entry.task.lastErrorText
			}
			const result = await entry.task.onTick(input)
			entry.task.lastTickAt = Date.now()
			if (result) {
				if (typeof result.status === 'string') entry.task.status = result.status
				if (typeof result.progress === 'number') {
					entry.task.progress = Math.max(0, Math.min(100, result.progress))
				}
				if (typeof result.lastErrorText === 'string') {
					entry.task.lastErrorText = result.lastErrorText
				}
				if (result.errorCount != null) entry.task.errorCount = result.errorCount
			}
			const statusChanged = prevStatus !== entry.task.status
			const progressChanged = Math.abs(prevProgress - entry.task.progress) > 0.1
			if (statusChanged && isPollTaskTerminal(entry.task.status)) {
				this.notifyTerminalOnce(entry)
			}
			void statusChanged
			void progressChanged
		} catch (e) {
			entry.task.errorCount += 1
			entry.task.lastErrorText =
				e instanceof Error ? e.message : typeof e === 'string' ? e : String(e ?? '')
			try {
				entry.task.onError?.(this.snapshotState(entry.task), e)
			} catch (ee) {
				console.error('[TaskPollScheduler] onError handler error:', ee)
			}
		} finally {
			entry.lastTickDurationMs = Date.now() - startedAt
			entry.inFlight = false
			this.inFlightCount = Math.max(0, this.inFlightCount - 1)
			if (!entry.task.disposed && !isPollTaskTerminal(entry.task.status)) {
				const interval = this.intervalPolicy.resolve({
					runningMs,
					errorCount: entry.task.errorCount,
					status: entry.task.status,
					progress: entry.task.progress,
					tabVisible: this.tabVisible,
					lastTickDurationMs: entry.lastTickDurationMs
				})
				entry.nextRunAt = interval > 0 ? Date.now() + interval : 0
			} else {
				this.disposeEntry(entry.task.id)
			}
		}
	}
}
