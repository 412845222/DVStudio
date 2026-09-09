/**
 * Named Pipe Transport（优先级最高，延迟最低）
 *
 * - Windows: `\\.\pipe\dvstudio-director`（可通过 DVSTUDIO_PIPE_NAME env 覆盖）
 * - macOS/Linux: `${userDataDir}/dvstudio-director.sock`，若 userDataDir 未知则用
 *   `os.tmpdir()/dvstudio-director.sock`（Electron 侧启动时写入相同路径规则）
 *
 * 协议：单行 NDJSON（每行一个请求帧，服务端响应一行 NDJSON）
 *   请求帧支持：
 *     { type: 'health' }
 *     { type: 'op', op: '<action>', payload: {...} }   ← 推荐
 *
 * 并发策略：每次 callAction 独立建连 → 发送请求帧 → 读取首行响应 → 关闭。
 */

import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import type { ElectronApiResult } from './types.ts'
import type { ITransport, TransportProbeResult } from './types.ts'

export class PipeTransport implements ITransport {
	public readonly type = 'pipe' as const

	constructor(private readonly options: PipeTransportOptions = {}) {}

	private resolvePipeName(): string {
		if (this.options.pipeName) return this.options.pipeName
		const env = process.env.DVSTUDIO_PIPE_NAME
		if (env) return env
		if (process.platform === 'win32') return `\\\\.\\pipe\\dvstudio-director`
		const dir = this.options.userDataDir || os.tmpdir()
		return path.join(dir, 'dvstudio-director.sock')
	}

	async probe(timeoutMs: number = 500): Promise<TransportProbeResult> {
		const started = performance.now()
		try {
			const resp = await this.sendRequest({ type: 'health' }, timeoutMs)
			const parsed = safeParse(resp) as { ok?: boolean; error?: unknown } | null
			const ok = !!parsed?.ok
			return {
				type: 'pipe',
				available: ok,
				latencyMs: Math.round(performance.now() - started),
				error: ok ? undefined : (parsed?.error as string | undefined) || 'health not ok'
			}
		} catch (e) {
			return {
				type: 'pipe',
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
		try {
			const raw = await this.sendRequest({ type: 'op', op: action, payload })
			const parsed = safeParse(raw) as ElectronApiResult<T>
			if (!parsed || typeof parsed.ok !== 'boolean') {
				return { ok: false, error: `Pipe 返回无法解析：${raw.slice(0, 200)}` }
			}
			return parsed
		} catch (e) {
			return { ok: false, error: `Pipe 通信失败：${(e as Error)?.message || String(e)}` }
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			const raw = await this.sendRequest({ type: 'health' })
			const parsed = safeParse(raw) as { ok?: boolean } | null
			return !!(parsed && parsed.ok)
		} catch {
			return false
		}
	}

	// ---------------- internal ----------------

	private sendRequest(
		req: unknown,
		timeoutMs: number = this.options.timeoutMs ?? 8000
	): Promise<string> {
		const pipeName = this.resolvePipeName()
		return new Promise((resolve, reject) => {
			const client = net.createConnection(pipeName)
			const timer = setTimeout(() => {
				try {
					client.destroy(new Error(`timeout (${timeoutMs}ms)`))
				} catch {}
			}, timeoutMs)

			client.setEncoding('utf8')
			let firstChunk = ''
			let done = false

			const finishOk = (val: string) => {
				if (done) return
				done = true
				clearTimeout(timer)
				try {
					client.destroy()
				} catch {}
				resolve(val)
			}
			const finishErr = (e: unknown) => {
				if (done) return
				done = true
				clearTimeout(timer)
				try {
					client.destroy()
				} catch {}
				reject(e instanceof Error ? e : new Error(String(e)))
			}

			client.on('error', (e) => finishErr(e))
			client.on('data', (chunk) => {
				firstChunk += chunk
				const idx = firstChunk.indexOf('\n')
				if (idx >= 0) {
					const line = firstChunk.slice(0, idx).replace(/\r$/, '')
					finishOk(line)
				}
			})
			client.on('end', () => {
				if (firstChunk.trim().length > 0 && !done) {
					finishOk(firstChunk.trim())
				} else if (!done) {
					finishErr(new Error('pipe closed without response'))
				}
			})
			client.on('connect', () => {
				const payload = JSON.stringify(req) + '\n'
				client.write(payload, (err) => {
					if (err) finishErr(err)
				})
			})
		})
	}
}

export interface PipeTransportOptions {
	/** 显式指定 pipe 名称（覆盖 env 和默认值） */
	pipeName?: string
	/** Unix 平台下 socket 所在目录（与 Electron 侧对齐） */
	userDataDir?: string
	/** 单次请求超时（默认 8000ms） */
	timeoutMs?: number
}

function safeParse(s: string): unknown {
	if (!s) return null
	try {
		return JSON.parse(s)
	} catch {
		return null
	}
}
