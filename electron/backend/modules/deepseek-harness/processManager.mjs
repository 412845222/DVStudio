import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { commandEnv, spawnManaged } from './commands.mjs'
import { launchArgs, announcedUrl } from './runtimeAdapter.mjs'
import { probeSource } from './sourceManager.mjs'
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
					if (!report.built) throw new Error('缺少构建产物，请先准备环境')
					if (await portOpen(profile.port))
						throw new Error(`端口 ${profile.port} 已被占用（PORT_IN_USE），未停止任何外部进程`)
					signal.throwIfAborted()
					const owned = spawn(report.nodePath, launchArgs(profile), {
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
