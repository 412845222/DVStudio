/**
 * HTTP Transport（最可靠的 fallback）
 *
 * 所有通信经 127.0.0.1 HTTP：
 *   POST /api/director/action   → callAction
 *   GET  /api/director/health   → healthCheck / probe
 *
 * URL 覆盖：DVSTUDIO_ELECTRON_URL 环境变量优先，否则由构造函数传入。
 */

import type { ElectronApiResult } from './types.ts'
import type { ITransport, TransportProbeResult } from './types.ts'

export class HttpTransport implements ITransport {
	public readonly type = 'http' as const

	constructor(private readonly electronUrl: string = '') {}

	async probe(timeoutMs: number = 1000): Promise<TransportProbeResult> {
		const started = performance.now()
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeoutMs)
		try {
			const res = await fetch(`${this.electronUrl}/api/director/health`, {
				signal: controller.signal
			})
			clearTimeout(timer)
			const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
			const ok = res.ok && !!data?.ok
			return {
				type: 'http',
				available: ok,
				latencyMs: Math.round(performance.now() - started),
				error: ok ? undefined : `HTTP ${res.status}`
			}
		} catch (e) {
			clearTimeout(timer)
			return {
				type: 'http',
				available: false,
				latencyMs: Math.round(performance.now() - started),
				error: e instanceof Error ? e.message : String(e)
			}
		}
	}

	async callAction<T = unknown>(
		action: string,
		payload: Record<string, unknown>
	): Promise<ElectronApiResult<T>> {
		const url = `${this.electronUrl}/api/director/action`
		const body = { action, ...payload }
		let res: Response
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			})
		} catch (e) {
			return { ok: false, error: `HTTP fetch 失败：${(e as Error)?.message || String(e)}` }
		}
		if (!res.ok) {
			const text = await res.text().catch(() => '')
			return {
				ok: false,
				error: `Electron API ${action} HTTP ${res.status}: ${text}`
			}
		}
		return (await res.json()) as ElectronApiResult<T>
	}

	async healthCheck(): Promise<boolean> {
		try {
			const res = await fetch(`${this.electronUrl}/api/director/health`)
			const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
			return !!(data && data.ok)
		} catch {
			return false
		}
	}
}
