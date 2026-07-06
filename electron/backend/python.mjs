import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getStaticRuntimeDir, getPythonBridgeScriptsDir } from '../config.mjs'

const PYTHON_DETECT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
let _pythonDetectCache = null
let _customCacheDir = null

export function setPythonDetectCacheDir(dir) {
	_customCacheDir = dir
}

function _getCacheFilePath() {
	try {
		const baseDir = _customCacheDir || path.resolve(process.cwd(), 'DVSResource', 'BackendData')
		fs.mkdirSync(baseDir, { recursive: true })
		return path.join(baseDir, 'python-detect-cache.json')
	} catch {
		return null
	}
}

function _loadCache() {
	if (_pythonDetectCache) return _pythonDetectCache
	try {
		const cacheFile = _getCacheFilePath()
		if (!cacheFile || !fs.existsSync(cacheFile)) return null
		const raw = fs.readFileSync(cacheFile, 'utf8')
		const cache = JSON.parse(raw)
		if (!cache || typeof cache !== 'object') return null
		const age = Date.now() - Number(cache.timestamp || 0)
		if (age > PYTHON_DETECT_CACHE_TTL_MS) return null
		_pythonDetectCache = cache.result
		return _pythonDetectCache
	} catch {
		return null
	}
}

function _saveCache(result) {
	_pythonDetectCache = result
	try {
		const cacheFile = _getCacheFilePath()
		if (!cacheFile) return
		fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
		fs.writeFileSync(cacheFile, JSON.stringify({
			timestamp: Date.now(),
			platform: process.platform,
			result
		}, null, 2), 'utf8')
	} catch {
	}
}

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

export function detectPythonInfo({ minMajor = 3, minMinor = 11, useCache = true } = {}) {
	if (useCache) {
		const cached = _loadCache()
		if (cached) return { ...cached, fromCache: true }
	}

	const found = detectPythonCommand()
	if (!found) {
		const result = {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: false,
			detail: '不存在 Python 环境（未检测到内置 Python 或系统 python/py 命令）。'
		}
		_saveCache(result)
		return result
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
		const result = {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: !!found.isBundled,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `Python 版本检测失败：${String(e?.message || e)}`
		}
		_saveCache(result)
		return result
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
		const result = {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			isBundled: !!found.isBundled,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `无法解析 Python 版本：${detail || 'unknown'}`
		}
		_saveCache(result)
		return result
	}

	const result = {
		ok: true,
		meetsRequirement,
		recommended,
		isBundled: !!found.isBundled,
		command: found.command,
		argsPrefix: found.argsPrefix,
		version: parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : 'bundled',
		detail: detail || `Python ${parsed?.major || 3}.${parsed?.minor || 11}.${parsed?.patch || 0}`
	}
	_saveCache(result)
	return result
}
