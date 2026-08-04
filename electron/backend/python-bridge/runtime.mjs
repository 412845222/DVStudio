/**
 * Python Worker Runtime - Process lifecycle management
 *
 * Manages spawning, monitoring, and shutting down Python worker processes.
 * Supports:
 * - Auto-restart on crash (with cooldown period)
 * - Idle timeout auto-exit
 * - Health checks
 * - Multiple concurrent requests (queued in single worker)
 */

import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { detectPythonCommand } from '../python.mjs'
import { getPythonBridgeScriptsDir } from '../../config.mjs'
import { createLineReader, createLineWriter, JsonRpcTransport } from './rpc.mjs'
import { getPipManager } from './pip.mjs'

const SCRIPTS_DIR = getPythonBridgeScriptsDir()
const WORKER_SCRIPT = path.resolve(SCRIPTS_DIR, 'worker.py')

// Constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes idle timeout
const MAX_CRASH_COUNT = 3 // Max crashes before cooldown
const CRASH_COOLDOWN_MS = 60 * 1000 // 1 minute cooldown after repeated crashes
const REQUEST_TIMEOUT_MS = 60 * 1000 // Default request timeout (60s)
const STREAM_KEEPALIVE_MS = 30 * 1000 // Keepalive interval for streaming requests

export class PythonWorkerRuntime {
	constructor(options = {}) {
		this.options = {
			idleTimeout: options.idleTimeout ?? IDLE_TIMEOUT_MS,
			maxCrashCount: options.maxCrashCount ?? MAX_CRASH_COUNT,
			crashCooldown: options.crashCooldown ?? CRASH_COOLDOWN_MS,
			requestTimeout: options.requestTimeout ?? REQUEST_TIMEOUT_MS,
			logLevel: options.logLevel ?? 'INFO',
			devMode: options.devMode ?? process.env.NODE_ENV === 'development',
			onLog: options.onLog ?? (() => {}), // Callback for stderr logs
			onCrash: options.onCrash ?? (() => {}) // Callback for crash notifications
		}

		this.worker = null
		this.transport = null
		this.pipManager = null

		this.state = 'idle' // idle | starting | running | shutting_down | crashed
		this.crashCount = 0
		this.lastCrashTime = 0
		this.lastActivityTime = 0
		this.idleTimer = null

		this.pendingRequests = new Map() // id -> { resolve, reject, timeout, isStream }
		this.requestQueue = [] // Queue for concurrent requests

		this.pythonCommand = null
	}

	/**
	 * Detect and cache Python command
	 */
	async detectPython() {
		if (this.pythonCommand) return this.pythonCommand
		this.pythonCommand = detectPythonCommand()
		return this.pythonCommand
	}

	/**
	 * Check if worker is healthy and running
	 */
	isHealthy() {
		return this.state === 'running' && this.worker && !this.worker.killed
	}

	/**
	 * Get current state
	 */
	getState() {
		return {
			state: this.state,
			pid: this.worker?.pid ?? null,
			crashCount: this.crashCount,
			pendingCount: this.pendingRequests.size,
			queueLength: this.requestQueue.length,
			lastActivity: this.lastActivityTime,
			idleFor: this.lastActivityTime ? Date.now() - this.lastActivityTime : null
		}
	}

	/**
	 * Start the worker process
	 */
	async start() {
		if (this.isHealthy()) return { ok: true, pid: this.worker.pid }
		if (this.state === 'starting') {
			// Wait for existing start attempt
			return new Promise((resolve) => {
				this._onceRunning(resolve)
			})
		}

		// Check crash cooldown
		if (this.crashCount >= this.options.maxCrashCount) {
			const elapsed = Date.now() - this.lastCrashTime
			if (elapsed < this.options.crashCooldown) {
				const wait = this.options.crashCooldown - elapsed
				return { ok: false, error: `In crash cooldown, wait ${Math.round(wait / 1000)}s` }
			}
			// Reset crash count after cooldown
			this.crashCount = 0
		}

		this.state = 'starting'

		try {
			const py = await this.detectPython()
			if (!py) {
				this.state = 'crashed'
				return { ok: false, error: 'Python not found' }
			}

			const env = {
				...process.env,
				DVSTUDIO_PYTHONPATH: this.options.devMode ? this._getDevPythonPath() : ''
			}

			const workerArgs = [...py.argsPrefix, WORKER_SCRIPT, '--log-level', this.options.logLevel]

			this.worker = spawn(py.command, workerArgs, {
				cwd: SCRIPTS_DIR,
				env,
				stdio: ['pipe', 'pipe', 'pipe'],
				windowsHide: true
			})

			// Set up transport
			this.transport = new JsonRpcTransport(
				createLineWriter(this.worker.stdin),
				createLineReader(this.worker.stdout)
			)

			// Handle stderr logs
			this._setupStderrHandler()

			// Handle process events
			this._setupProcessHandlers()

			// Start idle timer
			this._startIdleTimer()

			// Create pip manager
			this.pipManager = getPipManager(py, this.options)

			// Wait for worker to be ready (send ping)
			await this._waitForReady()

			this.state = 'running'
			this.lastActivityTime = Date.now()

			this._notifyRunning()

			return { ok: true, pid: this.worker.pid }
		} catch (err) {
			this.state = 'crashed'
			this.crashCount++
			this.lastCrashTime = Date.now()
			this.options.onCrash(err)
			return { ok: false, error: err.message }
		}
	}

	/**
	 * Stop the worker process
	 */
	async shutdown() {
		if (this.state === 'shutting_down') return
		if (!this.worker) {
			this.state = 'idle'
			return
		}

		this.state = 'shutting_down'
		this._stopIdleTimer()

		// Reject all pending requests
		for (const [id, req] of this.pendingRequests) {
			req.reject(new Error('Worker shutdown'))
			clearTimeout(req.timeout)
		}
		this.pendingRequests.clear()

		// Graceful shutdown: send EOF to stdin, then wait for exit
		try {
			this.worker.stdin?.end()

			// Wait for exit with timeout
			await new Promise((resolve) => {
				const timeout = setTimeout(() => {
					this.worker?.kill('SIGKILL')
					resolve()
				}, 5000)

				this.worker?.once('exit', () => {
					clearTimeout(timeout)
					resolve()
				})
			})
		} catch {}

		this.worker = null
		this.transport = null
		this.state = 'idle'
	}

	/**
	 * Restart the worker (shutdown + start)
	 */
	async restart() {
		await this.shutdown()
		return this.start()
	}

	/**
	 * Warmup: start worker proactively (before first request)
	 */
	async warmup() {
		if (this.isHealthy()) return { ok: true }
		return this.start()
	}

	// === Request handling ===

	/**
	 * Send a request and wait for response
	 */
	async call(method, params, options = {}) {
		const timeout = options.timeout ?? this.options.requestTimeout

		// Ensure worker is running
		const startResult = await this.start()
		if (!startResult.ok) {
			throw new Error(`Failed to start worker: ${startResult.error}`)
		}

		const requestId = this._generateRequestId()

		return new Promise((resolve, reject) => {
			const timeoutHandle = setTimeout(() => {
				this.pendingRequests.delete(requestId)
				reject(new Error(`Request timeout: ${method}`))
			}, timeout)

			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				timeout: timeoutHandle,
				isStream: false
			})

			this.lastActivityTime = Date.now()
			this._resetIdleTimer()

			// Send request
			const request = {
				jsonrpc: '2.0',
				id: requestId,
				method,
				params: params ?? {}
			}

			this.transport.send(request).catch((err) => {
				this.pendingRequests.delete(requestId)
				clearTimeout(timeoutHandle)
				reject(err)
			})
		})
	}

	/**
	 * Send a streaming request and return an async generator
	 */
	async *callStream(method, params, options = {}) {
		// Ensure worker is running
		const startResult = await this.start()
		if (!startResult.ok) {
			throw new Error(`Failed to start worker: ${startResult.error}`)
		}

		const requestId = this._generateRequestId()
		const chunks = []
		let resolveDone = null
		let rejectDone = null
		let streamDone = false

		const donePromise = new Promise((resolve, reject) => {
			resolveDone = resolve
			rejectDone = reject
		})

		// Set up keepalive timer for streaming
		const keepaliveTimer = setInterval(() => {
			if (this.isHealthy()) {
				this.lastActivityTime = Date.now()
				this._resetIdleTimer()
			}
		}, STREAM_KEEPALIVE_MS)

		// Handler for incoming responses
		const responseHandler = (response) => {
			if (response.id !== requestId) return

			if (response.error) {
				clearInterval(keepaliveTimer)
				this.pendingRequests.delete(requestId)
				rejectDone(new Error(response.error.message))
				return
			}

			const result = response.result

			if (result?.type === 'done' || result?.type === 'cancelled') {
				clearInterval(keepaliveTimer)
				this.pendingRequests.delete(requestId)
				streamDone = true
				resolveDone()
				return
			}

			// Push chunk
			chunks.push(result)
			// Signal that a chunk is available
			if (chunks.length === 1) {
				// First chunk - signal generator to yield
			}
		}

		// Register stream handler
		this.transport.onResponse(responseHandler)

		// Send request
		this.lastActivityTime = Date.now()
		this._resetIdleTimer()

		const request = {
			jsonrpc: '2.0',
			id: requestId,
			method,
			params: params ?? {},
			stream: true
		}

		await this.transport.send(request)

		// Yield chunks as they arrive
		while (!streamDone) {
			// Wait for chunk or done
			await new Promise((resolve) => setTimeout(resolve, 10))

			while (chunks.length > 0) {
				yield chunks.shift()
			}

			// Check if done
			if (streamDone) break

			// Wait for more chunks
			await Promise.race([
				new Promise((resolve) => setTimeout(resolve, 100)),
				donePromise.then(() => {
					streamDone = true
				})
			])
		}

		// Yield any remaining chunks
		while (chunks.length > 0) {
			yield chunks.shift()
		}

		clearInterval(keepaliveTimer)
		this.transport.offResponse(responseHandler)
	}

	/**
	 * Cancel a pending request
	 */
	async cancel(requestId) {
		if (!this.pendingRequests.has(requestId)) return false

		// Send cancel notification
		await this.transport.send({
			jsonrpc: '2.0',
			method: '$/cancel',
			params: { id: requestId }
		})

		return true
	}

	// === Private methods ===

	_getDevPythonPath() {
		const scriptsDir = path.resolve(import.meta.dirname, 'scripts')
		return scriptsDir
	}

	_generateRequestId() {
		return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	}

	_setupStderrHandler() {
		const reader = createLineReader(this.worker.stderr)
		reader.onLine((line) => {
			this.options.onLog(line)
		})
	}

	_setupProcessHandlers() {
		this.worker.on('error', (err) => {
			this.state = 'crashed'
			this.crashCount++
			this.lastCrashTime = Date.now()
			this._rejectAllPending(err)
			this.options.onCrash(err)
		})

		this.worker.on('exit', (code, signal) => {
			if (this.state === 'shutting_down') return

			const unexpected = code !== 0 && code !== null
			if (unexpected) {
				this.state = 'crashed'
				this.crashCount++
				this.lastCrashTime = Date.now()
			} else {
				this.state = 'idle'
			}

			this._rejectAllPending(new Error(`Worker exit: code=${code}, signal=${signal}`))
			this._stopIdleTimer()
			this.worker = null
			this.transport = null
		})

		// Handle transport responses
		this.transport.onResponse((response) => {
			const req = this.pendingRequests.get(response.id)
			if (!req) return

			if (response.error) {
				clearTimeout(req.timeout)
				this.pendingRequests.delete(response.id)
				req.reject(new Error(response.error.message))
				return
			}

			// For non-stream requests, single response completes the request
			if (!req.isStream) {
				clearTimeout(req.timeout)
				this.pendingRequests.delete(response.id)
				req.resolve(response.result)
			}
			// Stream requests are handled in callStream generator
		})
	}

	_waitForReady() {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Worker ready timeout'))
			}, 5000)

			// Register listener FIRST before sending ping
			this.transport.onceResponse((response) => {
				if (response.id === 'init-ping' && response.result?.status === 'ok') {
					clearTimeout(timeout)
					resolve()
				}
			}, 'init-ping')

			// Then send ping
			this.transport
				.send({ jsonrpc: '2.0', id: 'init-ping', method: 'ping', params: {} })
				.catch((err) => {
					clearTimeout(timeout)
					reject(err)
				})
		})
	}

	_rejectAllPending(error) {
		for (const [id, req] of this.pendingRequests) {
			clearTimeout(req.timeout)
			req.reject(error)
		}
		this.pendingRequests.clear()
	}

	_startIdleTimer() {
		this._stopIdleTimer()
		this.idleTimer = setInterval(() => {
			const idleFor = Date.now() - this.lastActivityTime
			if (idleFor >= this.options.idleTimeout && this.pendingRequests.size === 0) {
				this.shutdown()
			}
		}, 30 * 1000) // Check every 30 seconds
	}

	_stopIdleTimer() {
		if (this.idleTimer) {
			clearInterval(this.idleTimer)
			this.idleTimer = null
		}
	}

	_resetIdleTimer() {
		// Restart timer to extend idle timeout
		this._startIdleTimer()
	}

	// === Running state notification queue ===

	_runningCallbacks = []

	_onceRunning(callback) {
		if (this.state === 'running') {
			callback({ ok: true, pid: this.worker?.pid })
		} else {
			this._runningCallbacks.push(callback)
		}
	}

	_notifyRunning() {
		while (this._runningCallbacks.length > 0) {
			const cb = this._runningCallbacks.shift()
			cb({ ok: true, pid: this.worker?.pid })
		}
	}
}

/**
 * Create a new Python worker runtime instance
 */
export function createPythonRuntime(options = {}) {
	return new PythonWorkerRuntime(options)
}
