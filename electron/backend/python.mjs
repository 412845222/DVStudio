import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getStaticRuntimeDir, getPythonBridgeScriptsDir } from '../config.mjs'

function _getBundledPythonDir() {
	return path.resolve(getStaticRuntimeDir(), 'python-win32-x64')
}

function _getBundledPythonExe() {
	return path.resolve(_getBundledPythonDir(), 'python.exe')
}

function _hasBundledPython() {
	if (process.platform !== 'win32') return false
	try {
		const pyExe = _getBundledPythonExe()
		const marker = path.resolve(_getBundledPythonDir(), '.dweb-prepared')
		return fs.existsSync(pyExe) && fs.existsSync(marker)
	} catch {
		return false
	}
}

function _canRun(cmd, args) {
	try {
		const r = spawnSync(cmd, args, { encoding: 'utf-8', windowsHide: true })
		return r.status === 0
	} catch {
		return false
	}
}

export function detectPythonCommand() {
	if (_hasBundledPython()) {
		const bundledPy = _getBundledPythonExe()
		return {
			command: bundledPy,
			argsPrefix: [],
			isBundled: true,
			pythonDir: _getBundledPythonDir()
		}
	}

	if (_canRun('py', ['-3', '--version']))
		return { command: 'py', argsPrefix: ['-3'], isBundled: false }
	if (_canRun('python', ['--version']))
		return { command: 'python', argsPrefix: [], isBundled: false }
	if (_canRun('python3', ['--version']))
		return { command: 'python3', argsPrefix: [], isBundled: false }
	return null
}

export function getPythonSubprocessEnv(pyInfo, baseEnv = process.env) {
	const env = { ...baseEnv }

	const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH'
	const existingPath = env[pathKey] || ''

	if (pyInfo?.isBundled && pyInfo.pythonDir) {
		env[pathKey] =
			`${pyInfo.pythonDir}${path.delimiter}${pyInfo.pythonDir}${path.sep}Scripts${path.delimiter}${existingPath}`
		env.PYTHONHOME = pyInfo.pythonDir
	}

	// Add Python Bridge scripts directory to PYTHONPATH
	const pythonBridgeScriptsDir = getPythonBridgeScriptsDir()
	const pythonPathKey =
		Object.keys(env).find((k) => k.toLowerCase() === 'pythonpath') || 'PYTHONPATH'
	const existingPythonPath = env[pythonPathKey] || ''
	const paths = [pythonBridgeScriptsDir]
	if (existingPythonPath) {
		paths.push(existingPythonPath)
	}
	env[pythonPathKey] = paths.join(path.delimiter)

	return env
}

function _firstLine(s) {
	return String(s || '')
		.split(/\r?\n/)
		.map((v) => v.trim())
		.find(Boolean)
}

function _parseVersion(v) {
	const m = String(v || '').match(/Python\s+(\d+)\.(\d+)\.(\d+)/i)
	if (!m) return null
	return {
		major: Number(m[1]),
		minor: Number(m[2]),
		patch: Number(m[3])
	}
}

export function detectPythonInfo({ minMajor = 3, minMinor = 11 } = {}) {
	const found = detectPythonCommand()
	if (!found) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: false,
			detail: '不存在 Python 环境（未检测到内置 Python 或系统 python/py 命令）。'
		}
	}

	let detail = ''
	let parsed = null
	try {
		const env = getPythonSubprocessEnv(found)
		const r = spawnSync(found.command, [...found.argsPrefix, '--version'], {
			encoding: 'utf-8',
			windowsHide: true,
			env
		})
		detail = _firstLine(r.stdout || r.stderr) || ''
		parsed = _parseVersion(detail)
	} catch (e) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: !!found.isBundled,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `Python 版本检测失败：${String(e?.message || e)}`
		}
	}

	let meetsRequirement = false
	let recommended = false

	if (found.isBundled) {
		meetsRequirement = true
		recommended = true
		if (!detail) detail = '内置 Python 运行时'
	} else {
		meetsRequirement =
			!!parsed &&
			(parsed.major > minMajor || (parsed.major === minMajor && parsed.minor >= minMinor))
		recommended = !!parsed && parsed.major === 3 && parsed.minor === 11
	}

	if (!parsed && !found.isBundled) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: !!found.isBundled,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `无法解析 Python 版本：${detail || 'unknown'}`
		}
	}

	return {
		ok: true,
		meetsRequirement,
		recommended,
		isBundled: !!found.isBundled,
		command: found.command,
		argsPrefix: found.argsPrefix,
		version: parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : 'bundled',
		detail: detail || `Python ${parsed?.major || 3}.${parsed?.minor || 11}.${parsed?.patch || 0}`
	}
}
