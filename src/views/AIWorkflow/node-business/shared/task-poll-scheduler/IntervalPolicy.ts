import type { PollTaskStatus } from './types'
import { isPollTaskTerminal } from './types'

export interface IntervalPolicyParams {
	baseIntervalMs?: number
	minIntervalMs?: number
	maxIntervalMs?: number
	longRunningThresholdMs?: number
	veryLongRunningThresholdMs?: number
	errorBackoffFactor?: number
	errorBackoffMaxMs?: number
	hiddenTabMultiplier?: number
}

export interface IntervalPolicyContext {
	runningMs: number
	errorCount: number
	status: PollTaskStatus
	progress: number
	tabVisible: boolean
	lastTickDurationMs?: number
}

const DEFAULT_BASE_INTERVAL_MS = 1600
const DEFAULT_MIN_INTERVAL_MS = 1500
const DEFAULT_MAX_INTERVAL_MS = 30000
const DEFAULT_LONG_RUNNING_MS = 120000
const DEFAULT_VERY_LONG_RUNNING_MS = 300000
const DEFAULT_ERROR_BACKOFF_FACTOR = 1.8
const DEFAULT_ERROR_BACKOFF_MAX_MS = 20000
const DEFAULT_HIDDEN_TAB_MULTIPLIER = 2

export class IntervalPolicy {
	private baseIntervalMs: number
	private minIntervalMs: number
	private maxIntervalMs: number
	private longRunningThresholdMs: number
	private veryLongRunningThresholdMs: number
	private errorBackoffFactor: number
	private errorBackoffMaxMs: number
	private hiddenTabMultiplier: number

	constructor(params: IntervalPolicyParams = {}) {
		this.baseIntervalMs = params.baseIntervalMs ?? DEFAULT_BASE_INTERVAL_MS
		this.minIntervalMs = params.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
		this.maxIntervalMs = params.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS
		this.longRunningThresholdMs = params.longRunningThresholdMs ?? DEFAULT_LONG_RUNNING_MS
		this.veryLongRunningThresholdMs =
			params.veryLongRunningThresholdMs ?? DEFAULT_VERY_LONG_RUNNING_MS
		this.errorBackoffFactor = params.errorBackoffFactor ?? DEFAULT_ERROR_BACKOFF_FACTOR
		this.errorBackoffMaxMs = params.errorBackoffMaxMs ?? DEFAULT_ERROR_BACKOFF_MAX_MS
		this.hiddenTabMultiplier = params.hiddenTabMultiplier ?? DEFAULT_HIDDEN_TAB_MULTIPLIER
	}

	resolve(ctx: IntervalPolicyContext): number {
		if (isPollTaskTerminal(ctx.status)) return 0

		let interval = this.baseIntervalMs

		if (ctx.runningMs >= this.veryLongRunningThresholdMs) {
			interval = Math.max(interval * 4, 15000)
		} else if (ctx.runningMs >= this.longRunningThresholdMs) {
			interval = Math.max(interval * 2, 5000)
		}

		switch (ctx.status) {
			case 'pending':
			case 'queued':
				interval = Math.max(interval, 2500)
				break
			case 'running':
			case 'processing':
			case 'in_progress':
				if (ctx.progress > 0 && ctx.progress < 100) {
					interval = Math.max(interval, 1800)
				}
				break
			default:
				break
		}

		if (ctx.errorCount > 0) {
			const factor = Math.pow(this.errorBackoffFactor, Math.min(ctx.errorCount, 6))
			const backoffInterval = Math.min(this.baseIntervalMs * factor, this.errorBackoffMaxMs)
			interval = Math.max(interval, backoffInterval)
		}

		if (!ctx.tabVisible) {
			interval = Math.min(interval * this.hiddenTabMultiplier, this.maxIntervalMs)
		}

		if (ctx.lastTickDurationMs != null && ctx.lastTickDurationMs > 800) {
			interval = Math.max(interval, ctx.lastTickDurationMs * 1.2)
		}

		interval = Math.max(interval, this.minIntervalMs)
		interval = Math.min(interval, this.maxIntervalMs)

		return Math.floor(interval)
	}
}
