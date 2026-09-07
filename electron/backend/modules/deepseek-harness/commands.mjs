import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'

const commandProcesses = new Set()
export const hasCommandProcesses = () => commandProcesses.size > 0
export const stopCommandProcesses = () =>
	Promise.all([...commandProcesses].map((proc) => proc.stop()))

export function commandEnv(nodePath) {
	const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', CI: '1', NO_COLOR: '1' }
	delete env.ELECTRON_RUN_AS_NODE
	delete env.NODE_OPTIONS
	if (nodePath) {
		const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH'
		env[key] = path.dirname(nodePath) + path.delimiter + (env[key] || '')
	}
	return env
}

export async function resolveExecutable(value, fallback) {
	const name = String(value || fallback).trim()
	if (path.isAbsolute(name)) {
		if (!(await fs.stat(name)).isFile()) throw new Error('可执行文件不存在')
		return fs.realpath(name)
	}
	if (name !== fallback) throw new Error('请填写可执行文件的绝对路径')
	for (const dir of (process.env.PATH || process.env.Path || '').split(path.delimiter)) {
		if (!dir) continue
		for (const ext of process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']) {
			const candidate = path.join(dir.replace(/^"|"$/g, ''), name + ext)
			if (
				await fs
					.stat(candidate)
					.then((s) => s.isFile())
					.catch(() => false)
			)
				return fs.realpath(candidate)
		}
	}
	throw new Error(`未找到 ${fallback}，请先安装或指定绝对路径（ENV_UNAVAILABLE）`)
}

export async function resolvePnpm(value, nodePath) {
	const candidate = await resolveExecutable(value, 'pnpm')
	if (candidate.replace(/\\/g, '/').includes('/corepack/'))
		throw new Error('请选择已安装的 pnpm.cjs；环境检测不会通过 Corepack 自动下载工具')
	if (/\.(c?js|mjs)$/i.test(candidate)) return { command: nodePath, prefix: [candidate] }
	if (/\.exe$/i.test(candidate)) return { command: candidate, prefix: [] }
	const dir = path.dirname(candidate)
	for (const relative of [
		'node_modules/pnpm/bin/pnpm.cjs',
		'../lib/node_modules/pnpm/bin/pnpm.cjs'
	]) {
		const script = path.resolve(dir, relative)
		if (
			await fs
				.stat(script)
				.then((s) => s.isFile())
				.catch(() => false)
		)
			return { command: nodePath, prefix: [script] }
	}
	if (process.platform !== 'win32') return { command: candidate, prefix: [] }
	throw new Error('无法解析 pnpm 启动脚本，请指定 pnpm.cjs 的绝对路径')
}

export function spawnManaged(command, args, { cwd, env, onLine = () => {} } = {}) {
	if (/\.(cmd|bat|ps1)$/i.test(command))
		throw new Error('不支持直接执行 Shell 脚本，请选择 Node/pnpm JS 入口')
	const child = spawn(command, args, {
		cwd,
		env,
		shell: false,
		windowsHide: true,
		detached: process.platform !== 'win32',
		stdio: ['ignore', 'pipe', 'pipe']
	})
	let ended = false
	let closeResult
	const flushers = []
	for (const stream of ['stdout', 'stderr']) {
		const decoder = new StringDecoder('utf8')
		let buffer = ''
		const feed = (text, final = false) => {
			buffer += text
			let index
			while ((index = buffer.search(/[\r\n]/)) >= 0) {
				const line = buffer.slice(0, index)
				buffer = buffer.slice(index + 1)
				if (line) onLine(stream, line.slice(0, 8192))
			}
			if (buffer.length > 8192) {
				onLine(stream, '[超长日志行已省略]')
				buffer = ''
			}
			if (final && buffer) {
				onLine(stream, buffer)
				buffer = ''
			}
		}
		child[stream]?.on('data', (data) => feed(decoder.write(data)))
		flushers.push(() => feed(decoder.end(), true))
	}
	const closed = new Promise((resolve) => {
		const finish = (result) => {
			if (ended) return
			ended = true
			flushers.forEach((flush) => flush())
			closeResult = result
			resolve(result)
		}
		child.once('error', (error) => finish({ code: -1, error: error.message }))
		child.once('close', (code, signal) => finish({ code, signal }))
	})
	const wait = (ms) =>
		new Promise((resolve) => {
			const timer = setTimeout(() => resolve(false), ms)
			closed.then(() => {
				clearTimeout(timer)
				resolve(true)
			})
		})
	let stopping
	return {
		child,
		closed,
		get ended() {
			return ended
		},
		get result() {
			return closeResult
		},
		stop() {
			if (stopping) return stopping
			stopping = (async () => {
				if (ended || !child.pid) return
				const signal = async (force) => {
					// The live ChildProcess handle is the ownership authority; never accept a caller PID.
					if (ended) return
					if (process.platform === 'win32') {
						await new Promise((resolve) => {
							const killer = spawn(
								path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'),
								['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])],
								{ windowsHide: true, shell: false, stdio: 'ignore' }
							)
							const timeout = setTimeout(() => {
								killer.kill()
								resolve()
							}, 2000)
							killer.once('error', () => {
								clearTimeout(timeout)
								resolve()
							})
							killer.once('close', () => {
								clearTimeout(timeout)
								resolve()
							})
						})
					} else {
						try {
							process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
						} catch (error) {
							if (error.code !== 'ESRCH') throw error
						}
					}
				}
				await signal(false)
				if (!(await wait(5500))) {
					await signal(true)
					if (!(await wait(3000))) throw new Error('停止超时，进程仍未退出')
				}
			})().finally(() => {
				stopping = null
			})
			return stopping
		}
	}
}

export async function runCommand(command, args, options = {}) {
	options.signal?.throwIfAborted()
	let output = ''
	const proc = spawnManaged(command, args, {
		...options,
		onLine: (stream, line) => {
			output = (output + line + '\n').slice(-32768)
			options.onLine?.(stream, line)
		}
	})
	commandProcesses.add(proc)
	void proc.closed.then(() => commandProcesses.delete(proc))
	let rejectStop
	const stopFailure = new Promise((_resolve, reject) => {
		rejectStop = reject
	})
	const cancel = () => {
		void proc.stop().catch(rejectStop)
	}
	options.signal?.addEventListener('abort', cancel, { once: true })
	let timedOut = false
	const timeout = setTimeout(() => {
		timedOut = true
		cancel()
	}, options.timeout || 15000)
	try {
		const result = await Promise.race([proc.closed, stopFailure])
		options.signal?.throwIfAborted()
		if (timedOut) throw new Error('命令执行超时')
		if (result.code !== 0)
			throw new Error(result.error || `命令失败（退出码 ${result.code}）：${output.slice(-1000)}`)
		return output.trim()
	} finally {
		clearTimeout(timeout)
		options.signal?.removeEventListener('abort', cancel)
	}
}
