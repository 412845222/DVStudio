export type StartupStepStatus = 'idle' | 'running' | 'ok' | 'warn' | 'error'

export interface StartupSubProgress {
	current: number
	total: number
}

export interface StartupStep {
	key: string
	label: string
	status: StartupStepStatus
	subProgress?: StartupSubProgress
	detail?: string
	error?: string
}
