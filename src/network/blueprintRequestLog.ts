import { blueprintLog, shouldSkipRequestLog } from '../views/AIWorkflow/blueprint-core/blueprintLog'

export interface BlueprintRequestLogMeta {
	url: string
	method?: string
	status?: number
	durationMs?: number
	errorMessage?: string
	/** Short free-form tag displayed in the log panel, e.g. `comfyui` */
	tag?: string
}

/**
 * Appends a request log entry to the blueprint log panel.
 * Ping / health / ready endpoints are automatically filtered out
 * to reduce noise from keep-alive traffic.
 *
 * This is intentionally fire-and-forget and will never throw —
 * even if the log store implementation fails internally.
 */
export const logBlueprintRequest = (meta: BlueprintRequestLogMeta): void => {
	try {
		const url = String(meta.url || '')
		if (shouldSkipRequestLog(url)) return

		const method = (meta.method || 'GET').toUpperCase()
		const status = Number.isFinite(meta.status) ? (meta.status as number) : 0
		const durationMs = Number.isFinite(meta.durationMs) ? (meta.durationMs as number) : undefined

		let level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
		if (meta.errorMessage) level = 'ERROR'
		else if (status >= 400) level = 'ERROR'
		else if (status >= 300) level = 'INFO'

		const pathForLog = (() => {
			try {
				return new URL(url, 'http://localhost/').pathname
			} catch {
				return url
			}
		})()

		const statusText = status > 0 ? String(status) : '---'
		const durationText = typeof durationMs === 'number' ? `${durationMs}ms` : ''
		const message = [
			`${method} ${pathForLog}`,
			statusText,
			durationText,
			meta.errorMessage ? `→ ${meta.errorMessage}` : ''
		]
			.filter(Boolean)
			.join(' ')

		blueprintLog.append(message, {
			category: 'request',
			level,
			tag: meta.tag || 'http',
			detail: {
				url,
				method,
				status,
				durationMs,
				error: meta.errorMessage || undefined
			}
		})
	} catch {
		// Never let logging itself cause problems
	}
}

/**
 * A tiny helper for `now()` for measuring request durations.
 */
export const requestTimer = (): { elapsedMs: () => number } => {
	const start =
		typeof performance !== 'undefined' && typeof performance.now === 'function'
			? performance.now()
			: Date.now()
	return {
		elapsedMs: () => {
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			return Math.max(0, Math.round(end - start))
		}
	}
}
