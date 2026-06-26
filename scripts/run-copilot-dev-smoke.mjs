import { spawn } from 'node:child_process'
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const timeoutMs = Number(process.env.DWEB_COPILOT_DEV_SMOKE_TIMEOUT_MS || 180000)
const children = []
const backendCandidates = String(
	process.env.DWEB_COPILOT_DEV_BACKEND_PORTS || '5800,5810,5811,5812'
)
	.split(',')
	.map((item) => Number(item.trim()))
	.filter((item) => Number.isFinite(item) && item > 0)
const frontendCandidates = String(
	process.env.DWEB_COPILOT_DEV_FRONTEND_PORTS || '5173,5174,5175,5176'
)
	.split(',')
	.map((item) => Number(item.trim()))
	.filter((item) => Number.isFinite(item) && item > 0)

const isPortOpen = (port) =>
	new Promise((resolve) => {
		const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1200 }, (res) => {
			res.resume()
			resolve(true)
		})
		req.on('error', () => resolve(false))
		req.on('timeout', () => {
			req.destroy()
			resolve(false)
		})
	})

const getJson = (port, path) =>
	new Promise((resolve, reject) => {
		const req = http.get({ host: '127.0.0.1', port, path, timeout: 2500 }, (res) => {
			let raw = ''
			res.setEncoding('utf8')
			res.on('data', (chunk) => {
				raw += chunk
			})
			res.on('end', () => {
				if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
					reject(new Error(`${path} status ${res.statusCode}`))
					return
				}
				try {
					resolve(JSON.parse(raw))
				} catch {
					reject(new Error(`invalid json from ${path}`))
				}
			})
		})
		req.on('error', reject)
		req.on('timeout', () => req.destroy(new Error(`${path} timeout`)))
	})

const isCopilotBackend = async (port) => {
	try {
		const health = await getJson(port, '/api/workflow/copilot/health')
		return health?.provider === 'copilot-cli'
	} catch {
		return false
	}
}

const pickBackendPort = async () => {
	for (const port of backendCandidates) {
		if (await isCopilotBackend(port)) return { port, reuse: true }
		if (!(await isPortOpen(port))) return { port, reuse: false }
	}
	throw new Error(`no usable backend port from ${backendCandidates.join(',')}`)
}

const pickFrontendPort = async () => {
	for (const port of frontendCandidates) {
		if (!(await isPortOpen(port))) return { port, reuse: false }
	}
	return { port: frontendCandidates[0] || 5173, reuse: true }
}

const waitFor = async (label, test) => {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (await test()) return
		await delay(500)
	}
	throw new Error(`${label} did not become ready`)
}

const spawnChild = (name, command, args, env = {}) => {
	const child = spawn(command, args, {
		cwd: root,
		env: { ...process.env, ...env },
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: process.platform !== 'win32'
	})
	child.__dwebName = name
	child.__dwebExited = false
	children.push(child)
	child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`))
	child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`))
	child.on('exit', (code, signal) => {
		child.__dwebExited = true
		if (code !== null && code !== 0) console.error(`[${name}] exited with ${code}`)
		else if (signal) console.error(`[${name}] exited by ${signal}`)
	})
	return child
}

const signalChild = (child, signal) => {
	try {
		if (process.platform !== 'win32' && child.pid) {
			process.kill(-child.pid, signal)
		} else {
			child.kill(signal)
		}
	} catch {
		try {
			child.kill(signal)
		} catch {
			// ignore cleanup failures
		}
	}
}

const stopChildren = async () => {
	for (const child of children.reverse()) {
		if (child.killed || child.__dwebExited) continue
		signalChild(child, 'SIGTERM')
	}
	await delay(1200)
	for (const child of children.reverse()) {
		if (child.killed || child.__dwebExited) continue
		console.error(`[${child.__dwebName || 'child'}] did not exit after SIGTERM; sending SIGKILL`)
		signalChild(child, 'SIGKILL')
	}
}

const cleanup = () => {
	for (const child of children.reverse()) {
		if (!child.killed && !child.__dwebExited) {
			signalChild(child, 'SIGTERM')
		}
	}
}

process.on('SIGINT', () => {
	cleanup()
	process.exit(130)
})
process.on('SIGTERM', () => {
	cleanup()
	process.exit(143)
})
process.on('exit', cleanup)

const main = async () => {
	console.log(`[copilot-dev-smoke] root=${root}`)
	await new Promise((resolve, reject) => {
		const migrate = spawn('python', ['django-app/manage.py', 'migrate'], {
			cwd: root,
			stdio: 'inherit'
		})
		migrate.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`))
		)
	})

	const backend = await pickBackendPort()
	const frontend = await pickFrontendPort()

	if (!backend.reuse) {
		spawnChild('django', 'python', [
			'django-app/manage.py',
			'runserver',
			String(backend.port),
			'--noreload'
		])
	} else {
		console.log(`[copilot-dev-smoke] reusable django already listening on ${backend.port}`)
	}

	if (!frontend.reuse) {
		spawnChild('vite', 'npx', [
			'--no-install',
			'vite',
			'--host',
			'127.0.0.1',
			'--port',
			String(frontend.port),
			'--strictPort'
		])
	} else {
		console.log(`[copilot-dev-smoke] vite already listening on ${frontend.port}`)
	}

	await waitFor(`django:${backend.port}`, () => isCopilotBackend(backend.port))
	await waitFor(`vite:${frontend.port}`, () => isPortOpen(frontend.port))
	console.log(`[copilot-dev-smoke] servers ready backend=${backend.port} frontend=${frontend.port}`)

	await new Promise((resolve, reject) => {
		const check = spawn('node', ['scripts/check-copilot-sse.mjs'], {
			cwd: root,
			stdio: 'inherit',
			env: {
				...process.env,
				DWEB_COPILOT_TEST_BASE_URL: `http://127.0.0.1:${backend.port}`
			}
		})
		check.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`copilot sse check exited ${code}`))
		)
	})

	await new Promise((resolve, reject) => {
		const autoHelloText = String(process.env.DWEB_COPILOT_DEV_AUTO_TEXT || '你好').trim() || '你好'
		const electron = spawn('npx', ['--no-install', 'electron', 'electron/main.mjs'], {
			cwd: root,
			stdio: 'inherit',
			env: {
				...process.env,
				DWEB_RESOURCE_DIR: 'DVSResource',
				ELECTRON_DEV: '1',
				ELECTRON_RENDERER_URL: `http://127.0.0.1:${frontend.port}/`,
				DWEB_AIWF_AUTO_HELLO: '1',
				DWEB_AIWF_AUTO_HELLO_TEXT: autoHelloText
			}
		})

		const timer = setTimeout(
			() => {
				try {
					electron.kill('SIGTERM')
				} catch {
					/* ignore */
				}
			},
			Number(process.env.DWEB_COPILOT_DEV_ELECTRON_SMOKE_MS || 45000)
		)

		electron.on('exit', (code) => {
			clearTimeout(timer)
			if (code === 0) resolve()
			else reject(new Error(`electron auto-chat smoke exited ${code}`))
		})
	})

	const verifyDeadline =
		Date.now() + Number(process.env.DWEB_COPILOT_DEV_VERIFY_TIMEOUT_MS || 30000)
	let seenAutoChatMessage = false
	const preferredProjectId = Number(process.env.DWEB_COPILOT_DEV_PROJECT_ID || 0)
	const autoHelloText = String(process.env.DWEB_COPILOT_DEV_AUTO_TEXT || '你好').trim() || '你好'
	while (Date.now() < verifyDeadline) {
		try {
			const projectsRes = await getJson(backend.port, '/api/workflow/projects/list')
			const projects = Array.isArray(projectsRes?.projects) ? projectsRes.projects : []
			const candidateProjectIds = []
			if (Number.isFinite(preferredProjectId) && preferredProjectId > 0) {
				candidateProjectIds.push(preferredProjectId)
			}
			for (const project of projects) {
				const pid = Number(project?.id || 0)
				if (!Number.isFinite(pid) || pid <= 0) continue
				if (!candidateProjectIds.includes(pid)) candidateProjectIds.push(pid)
			}

			for (const projectId of candidateProjectIds) {
				const sessionsRes = await getJson(
					backend.port,
					`/api/workflow/copilot/sessions?projectId=${encodeURIComponent(String(projectId))}`
				)
				const sessions = Array.isArray(sessionsRes?.items) ? sessionsRes.items : []
				for (const item of sessions) {
					const sid = String(item?.id || '').trim()
					if (!sid) continue
					const messagesRes = await getJson(
						backend.port,
						`/api/workflow/copilot/sessions/${encodeURIComponent(sid)}/messages?projectId=${encodeURIComponent(String(projectId))}`
					)
					const messages = Array.isArray(messagesRes?.items) ? messagesRes.items : []
					const hasUserHello = messages.some((msg) => {
						if (String(msg?.role || '') !== 'user') return false
						const content = String(msg?.content || '')
						return content.includes(autoHelloText)
					})
					const hasAssistant = messages.some((msg) => {
						if (String(msg?.role || '') !== 'assistant') return false
						return String(msg?.content || '').trim().length > 0
					})
					if (hasUserHello && hasAssistant) {
						seenAutoChatMessage = true
						break
					}
				}
				if (seenAutoChatMessage) break
			}
			if (seenAutoChatMessage) break
		} catch {
			// ignore and retry
		}
		await delay(700)
	}

	if (!seenAutoChatMessage) {
		throw new Error('electron auto-chat smoke did not produce user+assistant messages')
	}

	console.log('[copilot-dev-smoke] ok')
	await stopChildren()
}

main().catch((err) => {
	console.error(`[copilot-dev-smoke] failed: ${err?.message || err}`)
	cleanup()
	process.exit(1)
})
