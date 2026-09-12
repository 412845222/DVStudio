export type HarnessLifecycle =
	| 'unconfigured'
	| 'stopped'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'error'
export interface HarnessProfile {
	id?: string
	name: string
	sourceKind: 'existing' | 'git'
	localPath: string
	repoUrl: string
	requestedRef: string
	nodePath: string
	pnpmPath: string
	port: number
	revision?: number
	createdAt?: number
	updatedAt?: number
}
export interface HarnessProfiles {
	records: HarnessProfile[]
	activeProfileId: string | null
	revision: number
}
export interface HarnessStatus {
	lifecycle: HarnessLifecycle
	pid: number | null
	runId: string | null
	profileId: string | null
	activeConfigRevision: number | null
	startTime: number | null
	exitCode: number | string | null
	port: number
	ready: boolean
	lastError: string
}
export interface HarnessLog {
	seq: number
	epoch: number
	ts: number
	stream: 'stdout' | 'stderr' | 'system'
	message: string
	runId: string | null
}
export interface HarnessSnapshot {
	status: HarnessStatus
	logs: HarnessLog[]
	seq: number
	epoch: number
	preparing: { operationId: string; profileId: string } | null
}
export interface HarnessReport {
	version: string
	adapterVersion: string
	nodeVersion: string
	nodePath: string
	nodeRange: string
	packageManager: string
	pnpmVersion: string
	pnpmError: string
	built: boolean
	validatedAt: number
}
export interface HarnessProgress {
	operationId: string
	phase: string
	message: string
	report?: HarnessReport
}
export interface HarnessDiagnosticAction {
	label: string
	kind: 'link' | 'command' | 'manual'
	value?: string
}
export interface HarnessDiagnosticItem {
	key: string
	status: 'pass' | 'warn' | 'fail'
	title: string
	detail: string
	actions: HarnessDiagnosticAction[]
}
export interface HarnessDiagnosticResult {
	profile: HarnessProfile
	info: HarnessReport | null
	items: HarnessDiagnosticItem[]
	overall: 'ready' | 'auto-fixable' | 'needs-action'
	validatedAt: number
}
export interface HarnessAutoSetupProgress {
	operationId: string
	phase: string
	message?: string
	diagnostics?: HarnessDiagnosticResult
	report?: HarnessReport
}
export type HarnessEvent = { seq: number; epoch: number } & Partial<HarnessStatus>
export type HarnessResult<T> = { ok: true; value: T } | { ok: false; error: string }
export interface HarnessSetupApi {
	listProfiles(): Promise<HarnessResult<HarnessProfiles>>
	saveProfile(payload: {
		profile: HarnessProfile
		expectedRevision: number
	}): Promise<HarnessResult<HarnessProfile>>
	removeProfile(payload: {
		profileId: string
		expectedRevision: number
	}): Promise<HarnessResult<HarnessProfiles>>
	activateProfile(payload: {
		profileId: string
		expectedRevision: number
	}): Promise<HarnessResult<HarnessProfiles>>
	selectPath(): Promise<HarnessResult<{ cancelled: boolean; path: string }>>
	probe(payload: { profile: HarnessProfile }): Promise<HarnessResult<HarnessReport>>
	diagnose(payload: { profile: HarnessProfile }): Promise<HarnessResult<HarnessDiagnosticResult>>
	getServiceStatus(): Promise<HarnessResult<HarnessSnapshot>>
	getServiceLogs(): Promise<HarnessResult<HarnessSnapshot>>
	clearServiceLogs(): Promise<HarnessResult<HarnessSnapshot>>
	startService(payload: {
		profileId: string
		expectedRevision: number
	}): Promise<HarnessResult<HarnessStatus>>
	stopService(payload: { runId: string | null }): Promise<HarnessResult<HarnessStatus>>
	restartService(payload: {
		profileId: string
		expectedRevision: number
		runId: string | null
	}): Promise<HarnessResult<HarnessStatus>>
	prepare(payload: {
		profileId: string
		expectedRevision: number
		operationId: string
	}): AsyncIterable<HarnessProgress>
	autoSetup(payload: {
		profileId: string
		expectedRevision: number
		operationId: string
	}): AsyncIterable<HarnessAutoSetupProgress>
	cancelPrepare(payload: { operationId: string }): Promise<HarnessResult<{ cancelled: boolean }>>
	openUi(payload: { runId: string | null }): Promise<HarnessResult<boolean>>
	getOpenUrl(payload: { runId: string | null }): Promise<HarnessResult<string>>
	proxyCall(payload: { method: string; payload: unknown }): Promise<HarnessResult<unknown>>
	dshAgentStream(payload: {
		sessionId: string
		content: string | Array<{ type: string; text?: string; [key: string]: unknown }>
	}): AsyncIterable<unknown>
	onServiceLog(listener: (entries: HarnessLog[]) => void): () => void
	onServiceStatusChange(listener: (event: HarnessEvent) => void): () => void
	onServiceExit(listener: (event: HarnessEvent) => void): () => void
	onServiceLogsCleared(listener: (event: HarnessEvent) => void): () => void
	onConfigChange(listener: (event: HarnessEvent) => void): () => void
}
