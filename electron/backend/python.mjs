import { spawnSync } from 'node:child_process'

function _canRun(cmd, args) {
	try {
		const r = spawnSync(cmd, args, { encoding: 'utf-8' })
		return r.status === 0
	} catch {
		return false
	}
}

/**
 * Windows 优先用 py -3，其次 python。
 * 这里先做“开发期可运行”的最小实现；后续打包时会切换为内置 python。
 */
export function detectPythonCommand() {
	if (_canRun('py', ['-3', '--version'])) return { command: 'py', argsPrefix: ['-3'] }
	if (_canRun('python', ['--version'])) return { command: 'python', argsPrefix: [] }
	if (_canRun('python3', ['--version'])) return { command: 'python3', argsPrefix: [] }
	return null
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
		patch: Number(m[3]),
	}
}

export function detectPythonInfo({ minMajor = 3, minMinor = 11 } = {}) {
	const found = detectPythonCommand()
	if (!found) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			detail: '不存在 Python 环境（未检测到 python/py 命令）。',
		}
	}

	let detail = ''
	let parsed = null
	try {
		const r = spawnSync(found.command, [...found.argsPrefix, '--version'], {
			encoding: 'utf-8',
			windowsHide: true,
		})
		detail = _firstLine(r.stdout || r.stderr) || ''
		parsed = _parseVersion(detail)
	} catch (e) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `Python 版本检测失败：${String(e?.message || e)}`,
		}
	}

	const meetsRequirement =
		!!parsed && (parsed.major > minMajor || (parsed.major === minMajor && parsed.minor >= minMinor))
	const recommended = !!parsed && parsed.major === 3 && parsed.minor === 11

	if (!parsed) {
		return {
			ok: false,
			meetsRequirement: false,
			recommended: false,
			command: found.command,
			argsPrefix: found.argsPrefix,
			detail: `无法解析 Python 版本：${detail || 'unknown'}`,
		}
	}

	return {
		ok: true,
		meetsRequirement,
		recommended,
		command: found.command,
		argsPrefix: found.argsPrefix,
		version: `${parsed.major}.${parsed.minor}.${parsed.patch}`,
		detail: detail || `Python ${parsed.major}.${parsed.minor}.${parsed.patch}`,
	}
}
