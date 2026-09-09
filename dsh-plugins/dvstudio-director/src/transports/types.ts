export type TransportType = 'pipe' | 'http'

export interface TransportProbeResult {
	type: TransportType
	available: boolean
	latencyMs?: number
	error?: string
}

export interface ITransport {
	readonly type: TransportType
	probe(timeoutMs?: number): Promise<TransportProbeResult>
	callAction<T = unknown>(
		action: string,
		payload: Record<string, unknown>
	): Promise<{ ok: boolean; data?: T; error?: string }>
	healthCheck(): Promise<boolean>
	dispose?(): Promise<void>
}

export interface ElectronApiResult<T = unknown> {
	ok: boolean
	data?: T
	error?: string
}
