export type PollTaskStatus =
	| 'pending'
	| 'queued'
	| 'running'
	| 'processing'
	| 'in_progress'
	| 'succeeded'
	| 'success'
	| 'completed'
	| 'failed'
	| 'error'
	| 'cancelled'
	| 'canceled'
	| 'expired'
	| 'timeout'
	| 'unknown'

export type PollTaskProvider = 'meshy' | 'tripo3d' | string

export interface PollTaskState {
	taskId: string
	nodeId: string
	provider: PollTaskProvider
	status: PollTaskStatus
	progress: number
	terminalNotified?: boolean
	lastTickAt?: number
	startedAt?: number
	errorCount: number
	lastErrorText?: string
	lastResponseRaw?: unknown
}

export interface PollTaskCallbacks {
	onTick: (task: PollTaskState) => Promise<PollTaskState | null> | PollTaskState | null
	onEnterTerminal?: (task: PollTaskState) => void
	onError?: (task: PollTaskState, error: unknown) => void
}

export interface PollTask extends PollTaskCallbacks {
	readonly id: string
	readonly nodeId: string
	readonly taskId: string
	readonly provider: PollTaskProvider
	readonly createdAt: number
	status: PollTaskStatus
	progress: number
	errorCount: number
	lastErrorText?: string
	terminalNotified: boolean
	lastTickAt: number
	startedAt: number
	disposed: boolean
}

export const POLL_TASK_STATUS_TERMINAL: ReadonlyArray<PollTaskStatus> = [
	'succeeded',
	'success',
	'completed',
	'failed',
	'error',
	'cancelled',
	'canceled',
	'expired',
	'timeout'
]

export const isPollTaskTerminal = (status: PollTaskStatus): boolean => {
	return POLL_TASK_STATUS_TERMINAL.includes(status)
}
