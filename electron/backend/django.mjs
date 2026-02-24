import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'

import { getDjangoAppDir } from '../config.mjs'
import { detectPythonCommand } from './python.mjs'

function wait(ms) {
	return new Promise((r) => setTimeout(r, ms))
}

async function isPortFree(port) {
	return new Promise((resolve) => {
		const server = net
			.createServer()
			.once('error', () => resolve(false))
			.once('listening', () => server.close(() => resolve(true)))
			.listen(port, '127.0.0.1')
	})
}

export async function pickBackendPort({ preferred = 5800, range = 100 } = {}) {
	for (let i = 0; i < range; i++) {
		const port = preferred + i
		// eslint-disable-next-line no-await-in-loop
		if (await isPortFree(port)) return port
	}
	throw new Error('No free port found for backend')
}

async function ping(url) {
	const res = await fetch(url, { method: 'GET' })
	return res.ok
}

export async function waitForBackendReady(baseUrl, { timeoutMs = 20000 } = {}) {
	const startedAt = Date.now()
	let lastErr = ''
	while (Date.now() - startedAt < timeoutMs) {
		try {
			// 后端已有 ping endpoint
			// eslint-disable-next-line no-await-in-loop
			if (await ping(`${baseUrl}/api/ai/ping`)) return
		} catch (e) {
			lastErr = String(e?.message || e)
		}
		// eslint-disable-next-line no-await-in-loop
		await wait(250)
	}
	throw new Error(`Backend not ready within ${timeoutMs}ms. ${lastErr}`)
}

export function killExistingDjangoRunservers({ pythonCommand, djangoDir, onLog } = {}) {
	const py = String(pythonCommand || '').trim()
	const workDir = String(djangoDir || '').trim()
	if (!workDir) return { ok: true, killed: [] }

	const log = typeof onLog === 'function' ? onLog : () => {}
	const killed = []

	if (process.platform === 'win32') {
		const safeWorkDir = workDir.replace(/'/g, "''").replace(/\\/g, '\\\\')
		const pyNeedle = py ? py.toLowerCase().replace(/'/g, "''").replace(/\\/g, '\\\\') : ''
		const psScript = [
			"$procs = Get-CimInstance Win32_Process | Where-Object {",
			"  $cmd = [string]$_.CommandLine",
			"  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }",
			"  $cmdL = $cmd.ToLowerInvariant()",
			`  if (-not $cmdL.Contains('${safeWorkDir.toLowerCase()}')) { return $false }`,
			"  if (-not ($cmdL.Contains('manage.py') -and $cmdL.Contains('runserver'))) { return $false }",
			pyNeedle ? `  if (-not $cmdL.Contains('${pyNeedle}')) { return $false }` : '  $true',
			'}',
			'foreach($p in $procs){',
			'  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output $p.ProcessId } catch {}',
			'}',
		].join('; ')

		const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
			encoding: 'utf-8',
			windowsHide: true,
		})
		const out = String(r.stdout || '')
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean)
		for (const pid of out) killed.push(pid)
		if (killed.length > 0) log(`[backend] 已清理遗留 Django 进程：${killed.join(', ')}`)
		return { ok: r.status === 0 || killed.length > 0, killed }
	}

	const pattern = `${workDir}.*manage.py.*runserver`
	const r = spawnSync('pkill', ['-f', pattern], {
		encoding: 'utf-8',
		windowsHide: true,
	})
	if (r.status === 0) log('[backend] 已清理遗留 Django 进程。')
	return { ok: r.status === 0 || r.status === 1, killed }
}

export function startDjangoServer({ port, dataDir, extraEnv = {}, djangoDir, onLog } = {}) {
	const py = extraEnv.__DWEB_PYTHON_COMMAND
		? { command: extraEnv.__DWEB_PYTHON_COMMAND, argsPrefix: [] }
		: detectPythonCommand()
	if (!py) {
		throw new Error('Python not found. Please install Python 3 (or enable py launcher on Windows).')
	}

	const workDir = djangoDir || getDjangoAppDir()
	if (!workDir) throw new Error('Django work dir not resolved')
	const host = '127.0.0.1'
	const bind = `${host}:${port}`

	const args = [...py.argsPrefix, 'manage.py', 'runserver', bind, '--noreload']

	const env = {
		...process.env,
		DJANGO_SETTINGS_MODULE: process.env.DJANGO_SETTINGS_MODULE || 'dwebsite.settings',
		PYTHONUTF8: '1',
		// 先把数据目录注入；后续需要在 Django settings 里真正读取这个变量
		DWEB_DATA_DIR: dataDir || process.env.DWEB_DATA_DIR || '',
		...extraEnv,
	}
	delete env.__DWEB_PYTHON_COMMAND

	// 首次启动/空数据库时需要 migrate，否则 API 会因为缺表直接 500。
	// 这里用同步方式保证 runserver 前完成（避免竞争条件）。
	if (typeof onLog === 'function') onLog('[cmd] [>.............] 执行 Django migrate')
	const mig = spawnSync(py.command, [...py.argsPrefix, 'manage.py', 'migrate', '--noinput'], {
		cwd: workDir,
		env,
		encoding: 'utf-8',
	})
	if (mig.status !== 0) {
		const out = String(mig.stdout || '')
		const err = String(mig.stderr || '')
		if (typeof onLog === 'function') {
			onLog('[cmd] [!!!!!FAILED!!!] Django migrate')
			if (out.trim()) onLog(`[cmd] migrate stdout: ${out.trim()}`)
			if (err.trim()) onLog(`[cmd] migrate stderr: ${err.trim()}`)
		}
		throw new Error(`Django migrate failed (code=${mig.status}).\n${out}\n${err}`)
	}
	if (typeof onLog === 'function') onLog('[cmd] [##############] Django migrate')

	const child = spawn(py.command, args, {
		cwd: workDir,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})

	child.stdout?.setEncoding('utf-8')
	child.stderr?.setEncoding('utf-8')

	return child
}
