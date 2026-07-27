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

export type StartupPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface BlueprintStartupState {
	phase: StartupPhase
	overallProgress: number
	title: string
	currentStepKey: string | null
	steps: StartupStep[]
	error: string | null
	canSkipError: boolean
}

export const STARTUP_STEP_KEYS = {
	INIT: 'init',
	FETCH_PROJECT: 'fetch-project',
	VALIDATE_SNAPSHOT: 'validate-snapshot',
	REPAIR_ASSETS: 'repair-assets-batch',
	HYDRATE_STATE: 'hydrate-state',
	RESOLVE_RESOURCES: 'resolve-resources',
	RECOVER_HANDLES: 'recover-handles',
	MIGRATE_RESOURCES: 'migrate-resources',
	RESTORE_TASKS: 'restore-tasks',
	READY: 'ready'
} as const

export type StartupStepKey = (typeof STARTUP_STEP_KEYS)[keyof typeof STARTUP_STEP_KEYS]
