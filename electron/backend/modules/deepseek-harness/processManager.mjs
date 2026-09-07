import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { commandEnv, spawnManaged } from './commands.mjs'
import { announcedUrl } from './runtimeAdapter.mjs'
import { probeSource } from './sourceManager.mjs'
import { probeSupportedFlags, buildLaunchArgs } from './startupProbe.mjs'
import { redact } from './serviceEvents.mjs'

export const portIsOpen = (port) =>
	new Promise((resolve) => {
		const socket = net.connect({ host: '127.0.0.1', port })
		const finish = (value) => {
			socket.destroy()
			resolve(value)
		}
		socket.setTimeout(500, () => finish(false))
		socket.once('connect', () => finish(true))
		socket.once('error', () => finish(false))
	})

/**
 * 查找监听指定端口的进程 PID。
 * Windows: `netstat -ano | findstr LISTENING` 解析
 * macOS/Linux: `lsof -ti:<port>`
 * 返回 PID 数组（可能多个），失败返回空数组。
 */
function findPidsOnPort(port) {
	const pids = new Set()
	try {
		if (process.platform === 'win32') {
			const netstat = execFileSync('netstat.exe', ['-ano'], { windowsHide: true, encoding: 'utf8' })
			for (const line of netstat.split(/\r?\n/)) {
				// 匹配 LISTENING 行，取最后一列 PID
				// 形如: TCP    127.0.0.1:3080    0.0.0.0:0    LISTENING    12345
				if (!/\bLISTENING\b/i.test(line)) continue
				const m = line.match(/:(\d+)\s+.*?LISTENING\s+(\d+)$/i)
				if (m && Number(m[1]) === port) pids.add(Number(m[2]))
			}
		} else {
			const out = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' })
			for (const p of out.trim().split(/\s+/)) {
				const n = Number(p)
				if (n) pids.add(n)
			}
		}
	} catch {
		/* 无监听进程或命令不可用 */
	}
	return [...pids]
}

/**
 * 强制释放指定端口：杀掉占用该端口的进程，并等待端口真正空闲。
 * @param port 端口号
 * @param events 事件发射器，用于记录日志
 * @param runId 当前运行实例 ID
 * @returns 最终端口是否空闲
 */
async function freePort(port, events, runId) {
	const MAX_RETRIES = 3
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		const pids = findPidsOnPort(port)
		if (pids.length === 0) return true
		events?.log(
			'system',
			`[端口清空] 检测到端口 ${port} 被占用，PIDs=${pids.join(',')}，尝试终止...`,
			runId
		)
		for (const pid of pids) {
			try {
				if (process.platform === 'win32') {
					execFileSync('taskkill.exe', ['/F', '/PID', String(pid), '/T'], {
						windowsHide: true,
						stdio: 'ignore'
					})
				} else {
					process.kill(pid, 'SIGKILL')
				}
			} catch {
				/* 进程可能已退出 */
			}
		}
		// 等待端口释放，最多等 3 秒
		for (let i = 0; i < 15; i++) {
			await new Promise((r) => setTimeout(r, 200))
			const stillOpen = await portIsOpen(port)
			if (!stillOpen) {
				events?.log('system', `[端口清空] 端口 ${port} 已释放`, runId)
				return true
			}
		}
		events?.log('system', `[端口清空] 第 ${attempt} 次尝试后端口 ${port} 仍被占用`, runId)
	}
	return !(await portIsOpen(port))
}

export function createProcessManager(events, deps = {}) {
	const probe = deps.probe || probeSource
	const spawn = deps.spawn || spawnManaged
	const portOpen = deps.portOpen || portIsOpen
	let state = {
		lifecycle: 'stopped',
		pid: null,
		runId: null,
		profileId: null,
		activeConfigRevision: null,
		startTime: null,
		exitCode: null,
		port: 3080,
		ready: false,
		lastError: ''
	}
	let proc = null
	let controller = null
	let launchTask = null
	let stopTask = null
	let timer = null
	let privateUrl = null
	const update = (patch) => {
		state = { ...state, ...patch }
		events.emit('service-status', state)
	}
	const clearTimer = () => {
		if (timer) clearTimeout(timer)
		timer = null
	}
	async function stop() {
		if (stopTask) return stopTask
		stopTask = (async () => {
			controller?.abort()
			clearTimer()
			if (state.lifecycle === 'starting' || (proc && !proc.ended))
				update({ lifecycle: 'stopping', ready: false })
			await launchTask
			try {
				if (proc) await proc.stop()
				privateUrl = null
				proc = null
				update({ lifecycle: 'stopped', pid: null, ready: false })
			} catch (error) {
				update({ lifecycle: 'error', lastError: redact(error.message) })
				throw error
			}
		})().finally(() => {
			stopTask = null
		})
		return stopTask
	}
	return {
		snapshot: () => ({ ...state }),
		isActive: () => Boolean(launchTask || (proc && !proc.ended) || stopTask),
		url: () => (state.ready ? privateUrl : null),
		start(profile) {
			if (launchTask || (proc && !proc.ended) || stopTask) {
				if (
					state.profileId === profile.id &&
					state.activeConfigRevision === profile.revision &&
					['starting', 'running'].includes(state.lifecycle)
				)
					return { ...state }
				throw new Error('服务正在运行或操作中（BUSY）')
			}
			const runId = randomUUID()
			controller = new AbortController()
			const signal = controller.signal
			privateUrl = null
			update({
				lifecycle: 'starting',
				runId,
				profileId: profile.id,
				activeConfigRevision: profile.revision,
				pid: null,
				port: profile.port,
				ready: false,
				startTime: null,
				exitCode: null,
				lastError: ''
			})
			launchTask = (async () => {
				try {
					const report = await probe(profile, signal)
					// Allow dev-mode launch (tsx) when build artifacts are missing.
					if (!report.built && !report.devMode)
						throw new Error('缺少构建产物且不支持开发模式，请先准备环境')
					// 启动前先清空占用端口的进程，避免 PORT_IN_USE 错误
					const freed = await freePort(profile.port, events, runId)
					if (!freed)
						throw new Error(`端口 ${profile.port} 已被占用，且无法自动释放（PORT_IN_USE）`)
					if (await portOpen(profile.port))
						throw new Error(`端口 ${profile.port} 已被占用（PORT_IN_USE），未停止任何外部进程`)
					signal.throwIfAborted()
					const supported = await probeSupportedFlags(report.nodePath, report, { signal })
					const launchArgs = buildLaunchArgs(profile, report, supported)
					const owned = spawn(report.nodePath, launchArgs, {
						cwd: profile.localPath,
						env: commandEnv(report.nodePath),
						onLine: (stream, line) => {
							events.log(stream, line, runId)
							const url = announcedUrl(line, profile.port)
							// Readiness comes from this child's post-boot announcement, not an arbitrary open port.
							if (
								url &&
								state.runId === runId &&
								state.lifecycle === 'starting' &&
								!signal.aborted
							) {
								privateUrl = url
								clearTimer()
								update({ lifecycle: 'running', ready: true })
							}
						}
					})
					proc = owned
					update({ pid: owned.child.pid || null, startTime: Date.now() })
					owned.closed.then((result) => {
						if (state.runId !== runId) return
						clearTimer()
						privateUrl = null
						const stopping = signal.aborted || state.lifecycle === 'stopping'
						update({
							lifecycle: stopping ? 'stopped' : 'error',
							pid: null,
							ready: false,
							exitCode: result.code ?? result.signal,
							lastError: stopping
								? state.lastError
								: redact(result.error || `Harness 意外退出（${result.code ?? result.signal}）`)
						})
						events.emit('service-exit', { runId, exitCode: state.exitCode })
					})
					timer = setTimeout(() => {
						if (state.runId !== runId || state.lifecycle !== 'starting') return
						const message = '启动超时：未收到 Harness 就绪信息（START_TIMEOUT）'
						void stop()
							.then(() => update({ lifecycle: 'error', lastError: message }))
							.catch(() => {})
					}, deps.startTimeout || 60000)
				} catch (error) {
					if (!signal.aborted) {
						update({ lifecycle: 'error', ready: false, lastError: redact(error.message) })
						events.log('system', error.message, runId)
					}
				}
			})().finally(() => {
				launchTask = null
			})
			return { ...state }
		},
		stop
	}
}
