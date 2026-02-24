import { spawnSync } from 'node:child_process'

import { getDjangoAppDir } from '../config.mjs'
import { detectPythonCommand } from './python.mjs'

function run(cmd, args, options = {}) {
	try {
		const r = spawnSync(cmd, args, {
			encoding: 'utf-8',
			windowsHide: true,
			...options,
		})
		return {
			ok: r.status === 0,
			status: r.status,
			stdout: String(r.stdout || ''),
			stderr: String(r.stderr || ''),
		}
	} catch (e) {
		return { ok: false, status: -1, stdout: '', stderr: String(e?.message || e) }
	}
}

function pickFirstLine(s) {
	return String(s || '')
		.split(/\r?\n/)
		.map((v) => v.trim())
		.find(Boolean)
		?.slice(0, 240) || ''
}

export function collectDiagnostics() {
	const simulateEmpty = process.env.DWEB_SIMULATE_EMPTY_ENV === '1'
	if (simulateEmpty) {
		return {
			python: { ok: false, detail: 'Simulated empty env (DWEB_SIMULATE_EMPTY_ENV=1).' },
			djangoImport: { ok: false, detail: 'Simulated empty env (DWEB_SIMULATE_EMPTY_ENV=1).' },
			ffmpeg: { ok: false, detail: 'Simulated empty env (DWEB_SIMULATE_EMPTY_ENV=1).' },
			djangoCheck: { ok: false, detail: 'Simulated empty env (DWEB_SIMULATE_EMPTY_ENV=1).' },
		}
	}

	const py = detectPythonCommand()

	const python = (() => {
		if (!py) return { ok: false, detail: 'Python not found (install Python3 or enable py launcher).' }
		const v = run(py.command, [...py.argsPrefix, '--version'])
		return {
			ok: v.ok,
			command: py.command,
			argsPrefix: py.argsPrefix,
			detail: pickFirstLine(v.stdout || v.stderr),
		}
	})()

	const djangoImport = (() => {
		if (!py) return { ok: false, detail: 'Python not found.' }
		const r = run(py.command, [...py.argsPrefix, '-c', 'import django; print(django.get_version())'])
		return { ok: r.ok, detail: pickFirstLine(r.stdout || r.stderr) }
	})()

	const ffmpeg = (() => {
		const r = run('ffmpeg', ['-version'])
		return { ok: r.ok, detail: pickFirstLine(r.stdout || r.stderr) }
	})()

	const djangoCheck = (() => {
		if (!py) return { ok: false, detail: 'Python not found.' }
		const djangoDir = getDjangoAppDir()
		const r = run(py.command, [...py.argsPrefix, 'manage.py', 'check'], { cwd: djangoDir })
		return { ok: r.ok, detail: pickFirstLine(r.stderr || r.stdout) || (r.ok ? 'OK' : 'Failed') }
	})()

	return {
		python,
		djangoImport,
		ffmpeg,
		djangoCheck,
	}
}
