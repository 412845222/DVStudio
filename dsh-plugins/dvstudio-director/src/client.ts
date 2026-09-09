/**
 * Electron API 客户端
 *
 * 从配置文件发现 Pipe 名称和 HTTP 端口，优先 Pipe，HTTP fallback。
 *
 * 配置发现顺序：
 *   1. 环境变量 DVSTUDIO_PIPE_NAME（直接指定 Pipe 名称）
 *   2. 临时目录下的 dvstudio-director-config.json（由 Electron 启动时写入）
 *   3. 默认 Pipe 名称 \\.\pipe\dvstudio-director（Windows）
 *
 * 调用顺序：
 *   - 先 ping Pipe（无论配置文件 PID 是否存活，Pipe 可能仍然在监听）
 *   - Pipe 可用则优先用 Pipe（延迟最低）
 *   - Pipe 不可用且 HTTP 可用，则降级到 HTTP
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PipeTransport } from './transports/pipeTransport.ts'
import { HttpTransport } from './transports/httpTransport.ts'
import type { ElectronApiResult } from './transports/types.ts'

interface DirectorConfig {
	pipeName: string
	httpPort: number
	pid: number
	updatedAt: number
}

const DEFAULT_PIPE_NAME =
	process.platform === 'win32'
		? '\\\\.\\pipe\\dvstudio-director'
		: path.join(os.tmpdir(), 'dvstudio-director.sock')

const DEFAULT_HTTP_PORT = 51830

function loadDirectorConfig(): DirectorConfig | null {
	// 1. 环境变量直接指定
	if (process.env.DVSTUDIO_PIPE_NAME) {
		return {
			pipeName: process.env.DVSTUDIO_PIPE_NAME,
			httpPort: parseInt(process.env.DVSTUDIO_ELECTRON_PORT || '0', 10) || DEFAULT_HTTP_PORT,
			pid: 0,
			updatedAt: 0
		}
	}

	// 2. 读取配置文件
	const configPath = path.join(os.tmpdir(), 'dvstudio-director-config.json')
	try {
		const raw = fs.readFileSync(configPath, 'utf-8')
		const cfg = JSON.parse(raw) as DirectorConfig
		// 即使 PID 不存活，也尝试连接（Pipe 可能仍然在监听）
		return cfg
	} catch {
		// 配置文件不存在，使用默认值
		return null
	}
}

const config = loadDirectorConfig()

const pipeTransport = new PipeTransport({
	pipeName: config?.pipeName || DEFAULT_PIPE_NAME
})

const httpUrl = config?.httpPort
	? `http://127.0.0.1:${config.httpPort}`
	: process.env.DVSTUDIO_ELECTRON_URL || `http://127.0.0.1:${DEFAULT_HTTP_PORT}`

const httpTransport = new HttpTransport(httpUrl)

// 启动时探测哪个 transport 可用
let preferredTransport: 'pipe' | 'http' | null = null
let probePromise: Promise<'pipe' | 'http' | null> | null = null

async function probeTransport(): Promise<'pipe' | 'http' | null> {
	if (preferredTransport) return preferredTransport
	if (probePromise) return probePromise

	probePromise = (async () => {
		// 先探测 Pipe
		const pipeResult = await pipeTransport.probe(1000)
		if (pipeResult.available) {
			preferredTransport = 'pipe'
			return 'pipe'
		}

		// 再探测 HTTP
		const httpResult = await httpTransport.probe(1000)
		if (httpResult.available) {
			preferredTransport = 'http'
			return 'http'
		}

		return null
	})()

	return probePromise
}

/**
 * 调用 Electron 侧 op 并解包返回渲染进程的真实结果。
 *
 * Pipe/HTTP transport 返回的是外层包装 `{ ok, result|data, error }`，
 * 而工具 render 函数期望的是内层 result 内容（渲染进程返回的纯数据）。
 * 这里解包后返回：
 *   - 成功：渲染进程返回的纯数据（如 `{ ok: true, dataUrl, ... }`）
 *   - 失败：`{ ok: false, error }` 错误对象
 */
export async function callAction<T = unknown>(args: {
	action: string
	[key: string]: unknown
}): Promise<T> {
	const transport = await probeTransport()

	let res: ElectronApiResult<T> | null = null

	if (transport === 'pipe') {
		try {
			res = await pipeTransport.callAction<T>(args.action, args)
		} catch {
			preferredTransport = null
			probePromise = null
		}
	}

	if (!res && transport === 'http') {
		try {
			res = await httpTransport.callAction<T>(args.action, args)
		} catch {
			preferredTransport = null
			probePromise = null
		}
	}

	// 重试一次（可能是 transport 状态变化）
	if (!res) {
		const retry = await probeTransport()
		if (retry === 'pipe') {
			res = await pipeTransport.callAction<T>(args.action, args)
		} else if (retry === 'http') {
			res = await httpTransport.callAction<T>(args.action, args)
		}
	}

	if (!res) {
		return {
			ok: false,
			error: 'DVStudio 未运行或配置不可读（Pipe 和 HTTP 均不可用）'
		} as unknown as T
	}

	if (!res.ok) {
		return { ok: false, error: res.error || '调用失败' } as unknown as T
	}

	// 解包：PipeServer 返回 { ok: true, result: ... }，HttpTransport 返回 { ok: true, data: ... }
	// 兼容两种字段名
	const inner = (res as any).result ?? (res as any).data
	return (inner ?? res) as T
}

/** 重置探测缓存（用于服务重启后重新探测） */
export function resetProbe(): void {
	preferredTransport = null
	probePromise = null
}
