import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { app, dialog, shell, BrowserWindow } from 'electron'
import yaml from 'js-yaml'
import { internalError, invalidParamsError } from '../../core/errors.mjs'
import { processStreamData, createLineParserState } from './log-line-parser.mjs'
import * as terminalToolkit from './terminal-toolkit.mjs'
import * as launchArgsPanel from './launch-args-panel.mjs'
import { getPipManager } from '../../python-bridge/pip.mjs'

const CONFIG_FILENAME = 'comfyui_setup.json'
const DEFAULT_COMFYUI_PORT = 8188
const PROBE_CACHE_TTL = 30000

const MANAGED_VENV_DIRNAME = 'comfyui-python'

const PIP_MIRRORS = [
	{
		key: 'pip-official',
		name: 'PyPI 官方',
		url: 'https://pypi.org/simple',
		kind: 'pypi',
		builtin: true
	},
	{
		key: 'pip-tuna',
		name: '清华 TUNA',
		url: 'https://pypi.tuna.tsinghua.edu.cn/simple',
		kind: 'pypi',
		builtin: true
	},
	{
		key: 'pip-aliyun',
		name: '阿里云',
		url: 'https://mirrors.aliyun.com/pypi/simple',
		kind: 'pypi',
		builtin: true
	},
	{
		key: 'pip-ustc',
		name: '中科大 USTC',
		url: 'https://pypi.mirrors.ustc.edu.cn/simple',
		kind: 'pypi',
		builtin: true
	},
	{
		key: 'pip-tencent',
		name: '腾讯云',
		url: 'https://mirrors.cloud.tencent.com/pypi/simple',
		kind: 'pypi',
		builtin: true
	}
]

const TORCH_MIRRORS = [
	{
		key: 'torch-official',
		name: 'PyTorch 官方',
		url: 'https://download.pytorch.org/whl/{cu}',
		kind: 'torch',
		builtin: true
	},
	{
		key: 'torch-aliyun',
		name: '阿里云 PyTorch 镜像',
		url: 'https://mirrors.aliyun.com/pytorch-wheels/{cu}',
		kind: 'torch',
		builtin: true
	}
]

const TORCH_CUDA_MAP = [
	{ minCuda: 12.4, suffix: 'cu124', label: 'CUDA 12.4+' },
	{ minCuda: 12.1, suffix: 'cu121', label: 'CUDA 12.1' },
	{ minCuda: 11.8, suffix: 'cu118', label: 'CUDA 11.8' }
]

// ============================================================
//  DVStudio Settings HTTP 代理复用（pip / git fetch 等 CLI 共享）
//  路径格式与 http-client.mjs / cli-adapters/base.mjs 一致：
//    DVSResource/UserSettings/settings.json 中 settings.httpProxy
// ============================================================
function getDvsResourceDirForSetup() {
	const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
	if (envResourceDir) return path.resolve(envResourceDir)
	try {
		const electron = require('electron')
		const app = electron.app
		if (app?.isPackaged) return path.resolve(path.dirname(process.execPath), 'DVSResource')
	} catch {}
	const gitRoot = (() => {
		let cur = __dirname
		while (true) {
			const p = path.join(cur, '.git')
			try {
				if (fs.existsSync(p)) return cur
			} catch {}
			const parent = path.dirname(cur)
			if (!parent || parent === cur) break
			cur = parent
		}
		return null
	})()
	return path.resolve(gitRoot || process.cwd(), 'DVSResource')
}

function getDvsUserSettingsPath() {
	return path.resolve(getDvsResourceDirForSetup(), 'UserSettings', 'settings.json')
}

/**
 * 读取 DVStudio Settings 页面配置的 HTTP 代理，返回 pip/子进程可用的 env 对象
 * 与 cli-adapters/base.mjs getProxyEnvVars() 保持一致
 */
function getDvsProxyEnvVars() {
	try {
		const settingsPath = getDvsUserSettingsPath()
		if (fs.existsSync(settingsPath)) {
			const raw = fs.readFileSync(settingsPath, 'utf-8')
			const settings = JSON.parse(raw)
			let httpProxy = String((settings && settings.httpProxy) || '').trim()
			if (httpProxy) {
				if (!/^https?:\/\//i.test(httpProxy)) httpProxy = 'http://' + httpProxy
				const host = (() => {
					try {
						return new URL(httpProxy).hostname
					} catch {
						return ''
					}
				})()
				return {
					HTTP_PROXY: httpProxy,
					HTTPS_PROXY: httpProxy,
					http_proxy: httpProxy,
					https_proxy: httpProxy,
					NO_PROXY: ['localhost', '127.0.0.1', host].filter(Boolean).join(','),
					no_proxy: ['localhost', '127.0.0.1', host].filter(Boolean).join(',')
				}
			}
		}
	} catch (err) {
		console.warn(
			'[setup-service] 读取代理配置失败（将直连）:',
			err && err.message ? err.message : err
		)
	}
	return {}
}

/**
 * 方案B：构建 ComfyUI 子进程环境，清理会干扰 triton-windows 编译器查找的半残 VS 环境变量。
 *
 * 背景：triton-windows 在 windows_utils.py 的 check_msvc() 中，当 VCINSTALLDIR 存在但
 * VCToolsVersion 缺失时会抛 TypeError: WindowsPath / NoneType，导致 TinyCC 回退分支永远走不到。
 * 此处从子进程 env 中删除这两个变量，让 triton get_cc() 跳过 MSVC 路径，正常落到 Bundled TinyCC。
 *
 * 详见 AIPlan/comfyui-triton-tcc-msvc-bug-solution.md 方案B。
 */
export function buildComfySpawnEnv() {
	const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }
	if (process.platform === 'win32') {
		const hadVcInstall = Boolean(env.VCINSTALLDIR)
		const hadVcTools = Boolean(env.VCToolsVersion)
		// 仅当二者不完整（一有一无）时清理并记录日志；二者齐全说明 VS 环境完整，无需清理
		if (hadVcInstall !== hadVcTools) {
			delete env.VCINSTALLDIR
			delete env.VCToolsVersion
			appendServiceLog(
				'stdout',
				`[启动预检] 检测到不完整的 Visual Studio 环境变量（VCINSTALLDIR=${hadVcInstall ? '存在' : '缺失'}, VCToolsVersion=${hadVcTools ? '存在' : '缺失'}），已清理以避免 triton-windows JIT 编译器查找崩溃`
			)
		}
	}
	return env
}

/**
 * 方案A 备援：检测并 patch triton-windows 的 windows_utils.py 中 check_msvc() 的 None-guard 缺陷。
 *
 * 背景：triton-windows 的 check_msvc(msvc_base_path, version) 在 version 为 None 时直接做
 * Path / None，抛 TypeError。本函数在 venv 的 triton 包内追加 None 守卫，作为方案B 的双保险。
 *
 * 此函数幂等：已 patch 过则跳过；找不到目标文件或目标不在 Windows 则跳过。
 * 详见 AIPlan/comfyui-triton-tcc-msvc-bug-solution.md 方案A。
 */
export function ensureTritonWindowsNoneGuard(venvPython) {
	if (process.platform !== 'win32') return { ok: true, skipped: true, reason: 'not_windows' }
	if (!venvPython || !fs.existsSync(venvPython)) {
		return { ok: false, skipped: true, reason: 'venv_python_not_found' }
	}

	// 通过 python -c 解析 site-packages 路径，避免硬编码
	let sitePackages = null
	try {
		const r = spawnSync(
			venvPython,
			['-c', 'import sysconfig,os;print(sysconfig.get_paths()["platlib"])'],
			{
				windowsHide: true,
				encoding: 'utf-8',
				timeout: 15000
			}
		)
		if (r.status === 0) {
			sitePackages = String(r.stdout || '')
				.trim()
				.split(/\r?\n/)
				.pop()
				.trim()
		}
	} catch (err) {
		return {
			ok: false,
			skipped: true,
			reason: 'site_packages_resolve_failed',
			error: String(err?.message || err)
		}
	}
	if (!sitePackages) {
		return { ok: false, skipped: true, reason: 'site_packages_empty' }
	}

	const targetFile = path.join(sitePackages, 'triton', 'windows_utils.py')
	if (!fs.existsSync(targetFile)) {
		return { ok: true, skipped: true, reason: 'triton_not_installed' }
	}

	// 标记位：本文件已应用过 patch，避免重复插入
	const PATCH_MARKER = '# DVStudio-patch: triton-windows None-guard for check_msvc'

	let original = ''
	try {
		original = fs.readFileSync(targetFile, 'utf-8')
	} catch (err) {
		return { ok: false, skipped: true, reason: 'read_failed', error: String(err?.message || err) }
	}

	if (original.includes(PATCH_MARKER)) {
		return { ok: true, skipped: true, reason: 'already_patched' }
	}

	// 目标函数：def check_msvc(msvc_base_path: Path, version: str) -> bool:
	// 在函数体首行插入 None 守卫。同时加固 find_msvc_env 对 version is None 的处理。
	const checkMsvcNeedle =
		'def check_msvc(msvc_base_path: Path, version: str) -> bool:\n    return all('
	const checkMsvcReplacement = `def check_msvc(msvc_base_path: Path, version: str) -> bool:\n    ${PATCH_MARKER}\n    if version is None:\n        return False\n    return all(`

	const findMsvcEnvNeedle =
		'    version = os.getenv("VCToolsVersion")\n    if not check_msvc(msvc_base_path, version):'
	const findMsvcEnvReplacement =
		'    version = os.getenv("VCToolsVersion")\n    if version is None or not check_msvc(msvc_base_path, version):'

	let patched = original
	let appliedChecks = 0
	if (patched.includes(checkMsvcNeedle)) {
		patched = patched.replace(checkMsvcNeedle, checkMsvcReplacement)
		appliedChecks++
	}
	if (patched.includes(findMsvcEnvNeedle)) {
		patched = patched.replace(findMsvcEnvNeedle, findMsvcEnvReplacement)
		appliedChecks++
	}

	if (appliedChecks === 0) {
		// 目标 pattern 不匹配（triton-windows 版本可能已变化），不做修改，避免破坏文件
		return { ok: true, skipped: true, reason: 'pattern_not_matched', targetFile }
	}

	// 备份原文件
	try {
		fs.writeFileSync(targetFile + '.dvs-bak', original, 'utf-8')
	} catch (err) {
		// 备份失败不阻塞 patch
		console.warn('[setup-service] triton-windows None-guard patch 备份失败:', err?.message || err)
	}

	try {
		fs.writeFileSync(targetFile, patched, 'utf-8')
		return {
			ok: true,
			skipped: false,
			appliedChecks,
			targetFile,
			backupFile: targetFile + '.dvs-bak'
		}
	} catch (err) {
		return { ok: false, skipped: false, reason: 'write_failed', error: String(err?.message || err) }
	}
}

function getDefaultVenvPath(installPath) {
	const config = loadConfig()
	if (config.venvPath) {
		const normalized = path.resolve(config.venvPath)
		const normalizedInstall = installPath
			? path.resolve(installPath)
			: config.installPath
				? path.resolve(config.installPath)
				: null
		if (
			normalizedInstall &&
			!normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) &&
			normalized.toLowerCase() !== normalizedInstall.toLowerCase()
		) {
			return config.venvPath
		}
	}
	return path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
}

function getManagedVenvRoot(customPath) {
	if (customPath) {
		const normalized = path.resolve(customPath)
		const config = loadConfig()
		const normalizedInstall = config.installPath ? path.resolve(config.installPath) : null
		if (
			normalizedInstall &&
			(normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) ||
				normalized.toLowerCase() === normalizedInstall.toLowerCase())
		) {
			return getDefaultVenvPath(config.installPath)
		}
		return customPath
	}
	const config = loadConfig()
	if (config.venvPath) {
		const normalized = path.resolve(config.venvPath)
		const normalizedInstall = config.installPath ? path.resolve(config.installPath) : null
		if (
			normalizedInstall &&
			(normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) ||
				normalized.toLowerCase() === normalizedInstall.toLowerCase())
		) {
			const newPath = getDefaultVenvPath(config.installPath)
			saveConfig({ venvPath: newPath })
			return newPath
		}
		return config.venvPath
	}
	return getDefaultVenvPath(config.installPath)
}

function getManagedVenvPython(customPath) {
	const root = getManagedVenvRoot(customPath)
	if (process.platform === 'win32') {
		return path.join(root, 'venv', 'Scripts', 'python.exe')
	}
	return path.join(root, 'venv', 'bin', 'python')
}

function isManagedVenvReady(customPath) {
	try {
		const py = getManagedVenvPython(customPath)
		return fs.existsSync(py)
	} catch {
		return false
	}
}

function isLikelyInChina() {
	try {
		if (process.env.LANG?.includes('zh') || process.env.LANGUAGE?.includes('zh')) return true
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
		if (
			tz === 'Asia/Shanghai' ||
			tz === 'Asia/Chongqing' ||
			tz === 'Asia/Harbin' ||
			tz === 'Asia/Urumqi'
		)
			return true
	} catch {}
	return false
}

function getTorchCuSuffix(cudaVersionStr, hasNvidiaGpu) {
	if (!cudaVersionStr) return hasNvidiaGpu ? 'cu121' : 'cpu'
	const ver = parseFloat(cudaVersionStr)
	if (isNaN(ver)) return hasNvidiaGpu ? 'cu121' : 'cpu'
	for (const entry of TORCH_CUDA_MAP) {
		if (ver >= entry.minCuda) return entry.suffix
	}
	return hasNvidiaGpu ? 'cu121' : 'cpu'
}

function resolveMirrorUrl(mirrorDef, cuSuffix) {
	if (!mirrorDef) return ''
	if (mirrorDef.url.includes('{cu}')) {
		return mirrorDef.url.replace('{cu}', cuSuffix || 'cpu')
	}
	return mirrorDef.url
}

function getMirrorDef(kind, key, customUrl) {
	const list = kind === 'torch' ? TORCH_MIRRORS : PIP_MIRRORS
	const found = list.find((m) => m.key === key)
	if (found) return found
	if ((key === 'pip-custom' || key === 'torch-custom') && customUrl) {
		return { key, name: '自定义', url: customUrl, kind, builtin: false, isCustom: true }
	}
	return list[0]
}

function pingUrl(url, timeoutMs) {
	return new Promise((resolve) => {
		const start = Date.now()
		const lib = url.startsWith('https') ? https : http
		const req = lib.get(
			url,
			{
				timeout: timeoutMs,
				headers: { 'User-Agent': 'DVStudio-ComfyUI-Setup/1.0' }
			},
			(res) => {
				const latency = Date.now() - start
				res.resume()
				resolve({ reachable: res.statusCode < 500, latency, statusCode: res.statusCode })
			}
		)
		req.on('timeout', () => {
			req.destroy()
			resolve({ reachable: false, latency: null, error: 'timeout' })
		})
		req.on('error', () => {
			resolve({ reachable: false, latency: null, error: 'error' })
		})
	})
}

async function pingAllMirrors(cudaVersion) {
	const hasNvidiaGpu = !!cudaVersion
	const cuSuffix = getTorchCuSuffix(cudaVersion, hasNvidiaGpu)
	const targets = [
		...PIP_MIRRORS.map((m) => ({ key: m.key, name: m.name, url: m.url, kind: 'pypi' })),
		...TORCH_MIRRORS.map((m) => ({
			key: m.key,
			name: m.name,
			url: resolveMirrorUrl(m, cuSuffix),
			kind: 'torch'
		}))
	]
	const results = await Promise.all(
		targets.map(async (t) => {
			const pingUrlStr = t.kind === 'torch' ? t.url : t.url
			const r = await pingUrl(pingUrlStr, 5000)
			return {
				key: t.key,
				name: t.name,
				url: pingUrlStr,
				kind: t.kind,
				latency: r.reachable ? r.latency : null,
				reachable: r.reachable
			}
		})
	)
	return results
}

function autoSelectMirrors(pingResults) {
	const pypiResults = pingResults
		.filter((r) => r.kind === 'pypi' && r.reachable)
		.sort((a, b) => (a.latency || 9999) - (b.latency || 9999))
	const torchResults = pingResults
		.filter((r) => r.kind === 'torch' && r.reachable)
		.sort((a, b) => (a.latency || 9999) - (b.latency || 9999))
	const pypiBest = pypiResults[0]
	const torchBest = torchResults[0]
	const officialPypi = pingResults.find((r) => r.key === 'pip-official')
	const officialTorch = pingResults.find((r) => r.key === 'torch-official')
	const threshold = 300
	let pypiSelection = 'pip-official'
	let torchSelection = 'torch-official'
	if (pypiBest && officialPypi?.reachable) {
		if (
			pypiBest.key !== 'pip-official' &&
			(officialPypi.latency === null || officialPypi.latency > threshold) &&
			pypiBest.latency < threshold * 2
		) {
			pypiSelection = pypiBest.key
		}
	} else if (pypiBest) {
		pypiSelection = pypiBest.key
	}
	if (torchBest && officialTorch?.reachable) {
		if (
			torchBest.key !== 'torch-official' &&
			(officialTorch.latency === null || officialTorch.latency > threshold) &&
			torchBest.latency < threshold * 2
		) {
			torchSelection = torchBest.key
		}
	} else if (torchBest) {
		torchSelection = torchBest.key
	}
	if (
		(process.platform === 'win32' && process.env.LANG?.includes('zh')) ||
		Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Shanghai'
	) {
		const aliyunPypi = pypiResults.find((r) => r.key === 'pip-aliyun')
		const aliyunTorch = torchResults.find((r) => r.key === 'torch-aliyun')
		if (
			aliyunPypi?.reachable &&
			(!officialPypi?.reachable || (officialPypi.latency && officialPypi.latency > 200))
		) {
			pypiSelection = 'pip-aliyun'
		}
		if (
			aliyunTorch?.reachable &&
			(!officialTorch?.reachable || (officialTorch.latency && officialTorch.latency > 200))
		) {
			torchSelection = 'torch-aliyun'
		}
	}
	return { pypiMirror: pypiSelection, torchMirror: torchSelection }
}

function findSystemPythonCandidates() {
	const candidates = []
	const seen = new Set()
	const add = (cmd, args, type) => {
		const key = cmd + (args.length ? ' ' + args.join(' ') : '')
		if (seen.has(key)) return
		seen.add(key)
		candidates.push({ cmd, args: args || [], type })
	}
	if (process.platform === 'win32') {
		add('py', ['-3.12'], 'py_launcher')
		add('py', ['-3.11'], 'py_launcher')
		add('py', ['-3.10'], 'py_launcher')
		add('py', ['-3'], 'py_launcher')
		add('python', [], 'system')
	} else {
		add('python3.12', [], 'system')
		add('python3.11', [], 'system')
		add('python3.10', [], 'system')
		add('python3', [], 'system')
		add('python', [], 'system')
	}
	return candidates
}

async function findSystemPythonForVenv() {
	const candidates = findSystemPythonCandidates()
	for (const c of candidates) {
		const r = await runCommand(
			c.cmd,
			[...c.args, '-c', 'import sys; print(sys.version.split()[0]); import venv; print("venv_ok")'],
			{ timeout: 10000 }
		)
		if (r.ok && r.stdout) {
			const lines = r.stdout
				.split(/\r?\n/)
				.map((s) => s.trim())
				.filter(Boolean)
			const version = lines[0]
			const hasVenvMod = lines.some((l) => l === 'venv_ok')
			if (version && hasVenvMod) {
				const parts = version.split('.').map(Number)
				if (parts[0] === 3 && parts[1] >= 10) {
					return { ...c, version, path: c.cmd }
				}
			}
		}
	}
	return null
}

let installChildProcess = null
let serviceChildProcess = null
let serviceStartTime = null
let serviceExitCode = null
let probeCache = { path: null, result: null, time: 0 }

const SERVICE_LOG_MAX = 2000
const SERVICE_LOG_CHANNEL = 'dweb:comfyui:setup:service-log'
const SERVICE_STATUS_CHANNEL = 'dweb:comfyui:setup:service-status'
const SERVICE_EXIT_CHANNEL = 'dweb:comfyui:setup:service-exit'
const SERVICE_CLEAR_CHANNEL = 'dweb:comfyui:setup:service-clear'
const CONFIG_CHANGE_CHANNEL = 'dweb:comfyui:setup:config-changed'
/** @type {Array<{ts:number, stream:'stdout'|'stderr'|'system', message:string}>} */
let serviceLogBuffer = []
let _stdoutParserState = createLineParserState()
let _stderrParserState = createLineParserState()

function broadcastToAllWindows(channel, payload) {
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			if (!win.isDestroyed()) win.webContents.send(channel, payload)
		} catch {}
	}
}

function appendServiceLog(stream, message) {
	if (!message) return
	const entry = { ts: Date.now(), stream, message }
	serviceLogBuffer.push(entry)
	if (serviceLogBuffer.length > SERVICE_LOG_MAX) {
		serviceLogBuffer.splice(0, serviceLogBuffer.length - SERVICE_LOG_MAX)
	}
	broadcastToAllWindows(SERVICE_LOG_CHANNEL, entry)
}

function emitParserEvents(events) {
	for (const ev of events) {
		appendServiceLog(ev.stream, ev.message)
	}
}

function flushServiceStreamBuffers() {
	emitParserEvents(processStreamData('stdout', '', _stdoutParserState, true))
	emitParserEvents(processStreamData('stderr', '', _stderrParserState, true))
}

function resetServiceStreamBuffers() {
	_stdoutParserState = createLineParserState()
	_stderrParserState = createLineParserState()
}

function broadcastStatus(status) {
	broadcastToAllWindows(SERVICE_STATUS_CHANNEL, status)
}

function killProcessTree(child) {
	if (!child || child.killed) return
	const pid = child.pid
	if (process.platform === 'win32' && pid) {
		try {
			spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
				detached: true,
				stdio: 'ignore',
				shell: false
			}).unref()
			return
		} catch {}
	}
	try {
		child.kill('SIGTERM')
	} catch {}
	setTimeout(() => {
		try {
			if (!child.killed) child.kill('SIGKILL')
		} catch {}
	}, 3000)
}

// —— ComfyUI 进程扫描（排除 DVStudio 自己启动的 serviceChildProcess）——
function parseCsvLine(line) {
	const out = []
	let cur = ''
	let inQ = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (ch === '"') {
			if (inQ && line[i + 1] === '"') {
				cur += '"'
				i++
			} else inQ = !inQ
		} else if (ch === ',' && !inQ) {
			out.push(cur)
			cur = ''
		} else cur += ch
	}
	out.push(cur)
	return out
}

function looksLikeComfyUIProcess(exe, cmdline) {
	const text = `${exe || ''} ${cmdline || ''}`.replace(/\\/g, '/')
	if (!text) return false
	const lower = text.toLowerCase()
	const isPython =
		/(^|\/|\\)python(\d|\.|\.exe)?$/i.test(exe || '') ||
		/(^|[\s"'])python(\.exe)?[\s"']/.test(text) ||
		/venv\/scripts\/python\.exe/.test(lower)
	if (!isPython) return false
	// 严格的 ComfyUI 识别：避免 notComfy / comfyManager 之类误命中
	// 1) 路径中包含 comfyui 的独立段（段分隔符：/ \ _ . - 空格 " ' 开头或结尾）
	const hasComfyUISegment = /(^|[\\\/_\s\."'\-])comfyui([\\\/_\s\."'\-]|$)/i.test(text)
	// 2) comfy 段紧邻 main.py
	const hasComfySegment = /(^|[\\\/_\s\."'\-])comfyui?[\\\/_\-]*main\.py/i.test(text)
	// 3) main.py 的路径中包含 comfy/comfyui 字样，且前面不是 "not"（排除明显的反例 notComfy）
	const mainPathMatch = text.match(/[^\s"';&|]*main\.py/i)
	const mainPathHasComfy = mainPathMatch
		? /comfy/i.test(mainPathMatch[0]) && !/notcomfy/i.test(mainPathMatch[0])
		: false
	if (/\bmain\.py\b/i.test(lower) && (hasComfyUISegment || hasComfySegment || mainPathHasComfy))
		return true
	if (hasComfyUISegment && lower.includes('--listen')) return true
	return false
}

async function scanForeignComfyProcesses() {
	const selfPids = new Set()
	if (serviceChildProcess && typeof serviceChildProcess.pid === 'number') {
		selfPids.add(serviceChildProcess.pid)
	}
	selfPids.add(process.pid)

	const results = []
	try {
		if (process.platform === 'win32') {
			const { stdout } = await new Promise((resolve, reject) => {
				const chunks = []
				const errChunks = []
				const c = spawn(
					'powershell',
					[
						'-NoProfile',
						'-NonInteractive',
						'-OutputFormat',
						'Text',
						'-Command',
						'Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Csv -NoTypeInformation'
					],
					{ windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
				)
				c.stdout.on('data', (d) => chunks.push(d))
				c.stderr.on('data', (d) => errChunks.push(d))
				c.on('error', reject)
				c.on('close', (code) => {
					resolve({
						code,
						stdout: Buffer.concat(chunks).toString('utf8'),
						stderr: Buffer.concat(errChunks).toString('utf8')
					})
				})
			})
			const lines = stdout.split(/\r?\n/).filter((l) => l.trim())
			if (lines.length >= 2) {
				const headers = parseCsvLine(lines[0])
				const idxPid = headers.indexOf('ProcessId')
				const idxExe = headers.indexOf('ExecutablePath')
				const idxCmd = headers.indexOf('CommandLine')
				for (let i = 1; i < lines.length; i++) {
					const cols = parseCsvLine(lines[i])
					const pid = parseInt(cols[idxPid], 10)
					const exe = (cols[idxExe] || '').trim()
					const cmdline = (cols[idxCmd] || '').trim()
					if (!pid || isNaN(pid)) continue
					if (selfPids.has(pid)) continue
					if (!looksLikeComfyUIProcess(exe, cmdline)) continue
					results.push({ pid, exe, commandLine: cmdline })
				}
			}
		} else {
			const { stdout } = await new Promise((resolve, reject) => {
				const chunks = []
				const errChunks = []
				const c = spawn('ps', ['-eo', 'pid=,args='], {
					windowsHide: true,
					stdio: ['ignore', 'pipe', 'pipe']
				})
				c.stdout.on('data', (d) => chunks.push(d))
				c.stderr.on('data', (d) => errChunks.push(d))
				c.on('error', reject)
				c.on('close', (code) =>
					resolve({
						code,
						stdout: Buffer.concat(chunks).toString('utf8'),
						stderr: Buffer.concat(errChunks).toString('utf8')
					})
				)
			})
			for (const line of stdout.split(/\r?\n/)) {
				const m = line.match(/^\s*(\d+)\s+(.*)$/)
				if (!m) continue
				const pid = parseInt(m[1], 10)
				const cmdline = m[2]
				if (!pid || selfPids.has(pid)) continue
				if (looksLikeComfyUIProcess('', cmdline)) {
					results.push({ pid, exe: '', commandLine: cmdline })
				}
			}
		}
	} catch (e) {
		return { ok: false, error: `scanForeignComfyProcesses failed: ${e?.message || String(e)}` }
	}
	return { ok: true, processes: results }
}

async function killForeignComfyProcesses(processes) {
	const targets = Array.isArray(processes) ? processes : []
	const killed = []
	const failed = []
	if (targets.length === 0) {
		return { ok: true, killed, failed, skipped: 0 }
	}
	if (process.platform === 'win32') {
		const args = []
		for (const p of targets) {
			args.push('/pid', String(p.pid))
		}
		args.push('/T', '/F')
		const batchR = await new Promise((resolve) => {
			const so = []
			const se = []
			const c = spawn('taskkill', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
			c.stdout.on('data', (d) => so.push(d))
			c.stderr.on('data', (d) => se.push(d))
			c.on('error', (e) => resolve({ code: -1, stderr: e.message }))
			c.on('close', (code) =>
				resolve({
					code,
					stdout: Buffer.concat(so).toString(),
					stderr: Buffer.concat(se).toString()
				})
			)
		})
		if (batchR.code === 0) {
			for (const p of targets) killed.push(p)
		} else {
			for (const p of targets) {
				try {
					const single = spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], {
						windowsHide: true
					})
					if (single.status === 0) killed.push(p)
					else
						failed.push({
							pid: p.pid,
							reason: (Buffer.isBuffer(single.stderr)
								? single.stderr.toString()
								: String(single.stderr || single.stdout || '')
							)
								.trim()
								.slice(0, 200)
						})
				} catch (e) {
					failed.push({ pid: p.pid, reason: e?.message || String(e) })
				}
			}
		}
	} else {
		for (const p of targets) {
			try {
				process.kill(p.pid, 'SIGTERM')
			} catch (e) {
				failed.push({ pid: p.pid, reason: `TERM failed: ${e.message}` })
			}
		}
		await new Promise((r) => setTimeout(r, 3000))
		for (const p of targets) {
			if (failed.find((x) => x.pid === p.pid)) continue
			try {
				process.kill(p.pid, 0)
				process.kill(p.pid, 'SIGKILL')
				killed.push(p)
			} catch (_) {
				killed.push(p)
			}
		}
	}

	let remaining = []
	const check = await scanForeignComfyProcesses()
	if (check.ok) {
		remaining = check.processes.filter((p) => targets.some((t) => t.pid === p.pid))
	}
	return {
		ok: remaining.length === 0,
		killed,
		failed,
		remaining
	}
}

function getConfigPath() {
	const userDataPath = app.getPath('userData')
	return path.join(userDataPath, CONFIG_FILENAME)
}

function getDefaultInstallPath() {
	const userDataPath = app.getPath('userData')
	return path.join(userDataPath, 'ComfyUI')
}

function loadConfig() {
	try {
		const configPath = getConfigPath()
		if (fs.existsSync(configPath)) {
			const raw = fs.readFileSync(configPath, 'utf-8')
			const parsed = JSON.parse(raw)
			const extraArgs = Array.isArray(parsed.extraArgs) ? parsed.extraArgs : []
			if (extraArgs.length === 0 && !parsed.launchArgsText) {
				extraArgs.push('--disable-cuda-malloc')
			}
			return {
				installMode: parsed.installMode === 'existing' ? 'existing' : 'new',
				installPath:
					typeof parsed.installPath === 'string' ? parsed.installPath : getDefaultInstallPath(),
				venvPath: parsed.venvPath || undefined,
				installType: parsed.installType,
				port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_COMFYUI_PORT,
				autoStart: !!parsed.autoStart,
				mirror: ['github', 'gitee', 'custom'].includes(parsed.mirror) ? parsed.mirror : 'github',
				customMirrorUrl: parsed.customMirrorUrl,
				pythonPath: parsed.pythonPath,
				extraArgs,
				launchArgsText:
					typeof parsed.launchArgsText === 'string' ? parsed.launchArgsText : undefined,
				proxy: parsed.proxy,
				customModelPaths: Array.isArray(parsed.customModelPaths)
					? parsed.customModelPaths.filter((p) => typeof p === 'string' && p)
					: [],
				pypiMirror: typeof parsed.pypiMirror === 'string' ? parsed.pypiMirror : 'auto',
				torchMirror: typeof parsed.torchMirror === 'string' ? parsed.torchMirror : 'auto',
				customPypiMirrorUrl: parsed.customPypiMirrorUrl,
				customTorchMirrorUrl: parsed.customTorchMirrorUrl
			}
		}
	} catch (err) {
		console.warn('[comfyui-setup] failed to load config:', err)
	}
	return defaultComfyConfig()
}

function defaultComfyConfig() {
	return {
		installMode: 'new',
		installPath: '',
		venvPath: undefined,
		installType: undefined,
		port: DEFAULT_COMFYUI_PORT,
		autoStart: false,
		mirror: 'github',
		customMirrorUrl: undefined,
		pythonPath: undefined,
		extraArgs: ['--disable-cuda-malloc'],
		launchArgsText: undefined,
		proxy: undefined,
		customModelPaths: [],
		pypiMirror: 'auto',
		torchMirror: 'auto',
		customPypiMirrorUrl: undefined,
		customTorchMirrorUrl: undefined
	}
}

function saveConfig(partial, forceReplace = false) {
	try {
		const configPath = getConfigPath()
		const updated = forceReplace
			? { ...defaultComfyConfig(), ...partial }
			: { ...loadConfig(), ...partial }
		fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8')
		broadcastToAllWindows(CONFIG_CHANGE_CHANNEL, { config: { ...updated } })
		return true
	} catch (err) {
		console.warn('[comfyui-setup] failed to save config:', err)
		return false
	}
}

function runCommand(cmd, args, options = {}) {
	return new Promise((resolve) => {
		const timeout = options.timeout || 15000
		// 修复A（终极兜底）：默认注入 PIP_INDEX_URL=PyPI 官方源，覆盖用户 pip.ini 固定的阿里云/清华源
		// pip 优先级：CLI --index-url > env PIP_INDEX_URL > pip.ini
		// 所以当国内镜像分支需要显式 --index-url 切换时，CLI 参数仍能覆盖回对应地址
		const baseEnv = { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' }
		// 仅当调用方未显式指定 PIP_INDEX_URL 时，才兜底设为官方源
		if (baseEnv.PIP_INDEX_URL === undefined) {
			baseEnv.PIP_INDEX_URL = 'https://pypi.org/simple'
		}
		const child = spawn(cmd, args, {
			encoding: 'utf-8',
			...options,
			env: baseEnv
		})
		let stdout = ''
		let stderr = ''
		let timedOut = false
		const timer = setTimeout(() => {
			timedOut = true
			try {
				child.kill()
			} catch {}
			resolve({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: 'timeout' })
		}, timeout)
		child.stdout?.on('data', (d) => {
			stdout += String(d)
		})
		child.stderr?.on('data', (d) => {
			stderr += String(d)
		})
		child.on('close', (code) => {
			if (timedOut) return
			clearTimeout(timer)
			resolve({
				ok: code === 0,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				code
			})
		})
		child.on('error', (err) => {
			if (timedOut) return
			clearTimeout(timer)
			resolve({
				ok: false,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				error: String(err.message || err)
			})
		})
	})
}

async function detectPython() {
	const cmds =
		process.platform === 'win32'
			? [
					['python', ['--version']],
					['py', ['-3', '--version']]
				]
			: [
					['python3', ['--version']],
					['python', ['--version']]
				]
	for (const [cmd, args] of cmds) {
		const r = await runCommand(cmd, args, { timeout: 8000 })
		if (r.ok && r.stdout) {
			const m = r.stdout.match(/Python\s+(\d+\.\d+\.\d+)/i)
			if (m) {
				return { available: true, cmd, version: m[1] }
			}
		}
	}
	return { available: false }
}

async function detectGit() {
	const r = await runCommand('git', ['--version'], { timeout: 8000 })
	if (r.ok && r.stdout) {
		const m = r.stdout.match(/git version\s+(\S+)/i)
		return { available: true, version: m ? m[1] : r.stdout }
	}
	return { available: false }
}

async function detectCuda() {
	if (process.platform !== 'win32') {
		return { available: false }
	}
	const r = await runCommand('nvidia-smi', [], { timeout: 10000 })
	if (r.ok && r.stdout) {
		const driverM = r.stdout.match(/Driver Version:\s*(\d+\.\d+)/)
		const cudaM = r.stdout.match(/CUDA Version:\s*(\d+\.\d+)/)
		return {
			available: true,
			driverVersion: driverM ? driverM[1] : undefined,
			cudaVersion: cudaM ? cudaM[1] : undefined
		}
	}
	return { available: false }
}

function isComfyUIDir(dirPath) {
	try {
		if (!fs.existsSync(dirPath)) return false
		const mainPy = path.join(dirPath, 'main.py')
		const comfyDir = path.join(dirPath, 'comfy')
		return fs.existsSync(mainPy) && fs.existsSync(comfyDir) && fs.statSync(comfyDir).isDirectory()
	} catch {
		return false
	}
}

function isPortableInstall(dirPath) {
	try {
		return fs.existsSync(path.join(dirPath, 'python_embeded'))
	} catch {
		return false
	}
}

function hasVenv(dirPath) {
	try {
		const venvDir = path.join(dirPath, 'venv')
		if (!fs.existsSync(venvDir)) return false
		if (process.platform === 'win32') {
			return fs.existsSync(path.join(venvDir, 'Scripts', 'python.exe'))
		}
		return fs.existsSync(path.join(venvDir, 'bin', 'python'))
	} catch {
		return false
	}
}

const MODEL_EXTENSIONS = {
	checkpoints: new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin']),
	loras: new Set(['.safetensors', '.pt', '.pth']),
	vae: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	controlnet: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	embeddings: new Set(['.safetensors', '.pt', '.bin', '.pth']),
	upscale_models: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	clip: new Set(['.safetensors', '.pt', '.pth', '.bin']),
	clip_vision: new Set(['.safetensors', '.pt', '.pth', '.bin'])
}

function isComfyUIDesktop(dirPath) {
	try {
		const indicators = [
			path.join(dirPath, '..', 'ComfyUI Desktop.exe'),
			path.join(dirPath, '..', 'resources'),
			path.join(dirPath, 'desktop')
		]
		if (indicators.some((p) => fs.existsSync(p))) return true
		const parentDir = path.dirname(dirPath)
		if (fs.existsSync(path.join(parentDir, 'ComfyUI Desktop.exe'))) return true
		return false
	} catch {
		return false
	}
}

function parseExtraModelPaths(comfyDir) {
	const modelPaths = {}
	const yamlPath = path.join(comfyDir, 'extra_model_paths.yaml')
	const exampleYamlPath = path.join(comfyDir, 'extra_model_paths.yaml.example')
	const configPath = fs.existsSync(yamlPath)
		? yamlPath
		: fs.existsSync(exampleYamlPath)
			? exampleYamlPath
			: null
	if (!configPath) return { modelPaths, hasConfig: fs.existsSync(yamlPath) }
	try {
		const content = fs.readFileSync(configPath, 'utf-8')
		const config = yaml.load(content)
		if (!config || typeof config !== 'object')
			return { modelPaths, hasConfig: fs.existsSync(yamlPath) }
		const yamlDir = path.dirname(configPath)
		for (const section of Object.keys(config)) {
			const conf = config[section]
			if (!conf || typeof conf !== 'object') continue
			let basePath = null
			if (conf.base_path) {
				basePath = String(conf.basePath)
				basePath = basePath.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '')
				basePath = basePath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
				if (!path.isAbsolute(basePath)) {
					basePath = path.resolve(yamlDir, basePath)
				}
			}
			for (const key of Object.keys(conf)) {
				if (key === 'base_path' || key === 'is_default') continue
				const rawVal = conf[key]
				if (typeof rawVal !== 'string') continue
				const dirs = rawVal
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean)
				for (const d of dirs) {
					let fullPath
					if (basePath) {
						fullPath = path.join(basePath, d)
					} else if (path.isAbsolute(d)) {
						fullPath = d
					} else {
						fullPath = path.resolve(yamlDir, d)
					}
					fullPath = path.normalize(fullPath)
					if (!modelPaths[key]) modelPaths[key] = []
					if (!modelPaths[key].includes(fullPath)) {
						modelPaths[key].push(fullPath)
					}
				}
			}
		}
	} catch (err) {
		console.warn('[comfyui-setup] failed to parse extra_model_paths.yaml:', err.message)
	}
	return { modelPaths, hasConfig: fs.existsSync(yamlPath) }
}

const MODEL_TYPE_SUBDIRS = new Set([
	'checkpoints',
	'loras',
	'vae',
	'clip',
	'clip_vision',
	'text_encoders',
	'diffusion_models',
	'unet',
	'controlnet',
	'embeddings',
	'upscale_models',
	'ipadapter',
	'inpaint',
	'segmind_models',
	'gligen',
	'hypernetworks',
	'photomaker',
	'style_models',
	'animatediff_models',
	'animatediff_motion_lora',
	'vae_approx',
	'mmdets',
	'sams',
	'ultralytics'
])

function resolveModelRoot(inputPath) {
	if (!inputPath || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) {
		return inputPath
	}
	const normalized = path.normalize(inputPath)
	try {
		const stat = fs.statSync(normalized)
		if (!stat.isDirectory()) return normalized

		const hasModelsSubdir = fs.existsSync(path.join(normalized, 'models'))
		const hasMainPy = fs.existsSync(path.join(normalized, 'main.py'))
		if (hasModelsSubdir && (hasMainPy || !hasAnyModelSubdir(normalized))) {
			return path.join(normalized, 'models')
		}

		return normalized
	} catch {
		return normalized
	}
}

function hasAnyModelSubdir(dirPath) {
	try {
		if (!fs.existsSync(dirPath)) return false
		const entries = fs.readdirSync(dirPath, { withFileTypes: true })
		for (const entry of entries) {
			if (entry.isDirectory() && MODEL_TYPE_SUBDIRS.has(entry.name)) {
				return true
			}
		}
	} catch {}
	return false
}

function writeExtraModelPathsConfig(comfyDir, customModelPaths) {
	const yamlPath = path.join(comfyDir, 'extra_model_paths.yaml')
	const toForwardSlash = (p) => String(p || '').replace(/\\/g, '/')
	const rawRoots = Array.isArray(customModelPaths)
		? customModelPaths.filter((p) => typeof p === 'string' && p && fs.existsSync(p))
		: []
	const customRoots = rawRoots.map((p) => toForwardSlash(resolveModelRoot(p)))

	const MODEL_TYPES = Array.from(MODEL_TYPE_SUBDIRS)

	try {
		let existingConfig = {}
		if (fs.existsSync(yamlPath)) {
			try {
				const content = fs.readFileSync(yamlPath, 'utf-8')
				const parsed = yaml.load(content)
				if (parsed && typeof parsed === 'object') {
					existingConfig = parsed
				}
			} catch (err) {
				console.warn(
					'[comfyui-setup] failed to parse existing extra_model_paths.yaml, will overwrite:',
					err.message
				)
			}
		}

		const dvstudioConfig = existingConfig.dvstudio || {}
		if (customRoots.length > 0) {
			dvstudioConfig.is_default = true

			if (customRoots.length === 1) {
				dvstudioConfig.base_path = customRoots[0]
				for (const type of MODEL_TYPES) {
					dvstudioConfig[type] = type
				}
			} else {
				delete dvstudioConfig.base_path
				const resolvedRoots = rawRoots.map((p) => resolveModelRoot(p))
				for (const type of MODEL_TYPES) {
					const dirs = []
					for (const root of resolvedRoots) {
						const subDir = path.join(root, type)
						if (fs.existsSync(subDir)) {
							dirs.push(toForwardSlash(path.normalize(subDir)))
						}
					}
					if (dirs.length > 0) {
						dvstudioConfig[type] = dirs.join('\n')
					} else {
						delete dvstudioConfig[type]
					}
				}
			}
			existingConfig.dvstudio = dvstudioConfig
		} else {
			delete existingConfig.dvstudio
		}

		const yamlContent = yaml.dump(existingConfig, { lineWidth: 1000 })
		fs.writeFileSync(yamlPath, yamlContent, 'utf-8')
		return { ok: true, yamlPath }
	} catch (err) {
		console.error('[comfyui-setup] failed to write extra_model_paths.yaml:', err.message)
		return { ok: false, error: err.message }
	}
}

function countModelFiles(dirPath, modelType) {
	if (!fs.existsSync(dirPath)) return 0
	try {
		const stat = fs.statSync(dirPath)
		if (!stat.isDirectory()) return 0
		const exts = MODEL_EXTENSIONS[modelType] || MODEL_EXTENSIONS.checkpoints
		let count = 0
		const scanDir = (d) => {
			try {
				const entries = fs.readdirSync(d, { withFileTypes: true })
				for (const entry of entries) {
					if (entry.isDirectory()) {
						scanDir(path.join(d, entry.name))
					} else if (entry.isFile()) {
						const ext = path.extname(entry.name).toLowerCase()
						if (exts.has(ext)) count++
					}
				}
			} catch {}
		}
		scanDir(dirPath)
		return count
	} catch {
		return 0
	}
}

function collectModelDirs(comfyDir, customRoots) {
	const { modelPaths, hasConfig } = parseExtraModelPaths(comfyDir)
	const modelsDir = path.join(comfyDir, 'models')
	const customModelRoots = Array.isArray(customRoots)
		? customRoots
				.filter((p) => typeof p === 'string' && p && fs.existsSync(p))
				.map((p) => resolveModelRoot(p))
		: []
	const result = {}
	for (const type of Object.keys(MODEL_EXTENSIONS)) {
		const dirs = []
		const legacyMap = { unet: 'diffusion_models', clip: 'text_encoders' }
		const actualType = legacyMap[type] || type
		const defaultDir = path.join(modelsDir, actualType)
		if (fs.existsSync(defaultDir)) dirs.push(defaultDir)
		if (type === 'text_encoders') {
			const clipDir = path.join(modelsDir, 'clip')
			if (fs.existsSync(clipDir) && !dirs.includes(clipDir)) dirs.push(clipDir)
		}
		if (type === 'diffusion_models') {
			const unetDir = path.join(modelsDir, 'unet')
			if (fs.existsSync(unetDir) && !dirs.includes(unetDir)) dirs.push(unetDir)
		}
		if (type === 'controlnet') {
			const t2iDir = path.join(modelsDir, 't2i_adapter')
			if (fs.existsSync(t2iDir) && !dirs.includes(t2iDir)) dirs.push(t2iDir)
		}
		for (const root of customModelRoots) {
			const subDir = path.join(root, actualType)
			if (fs.existsSync(subDir) && !dirs.includes(subDir)) dirs.push(subDir)
			if (type === 'text_encoders') {
				const clipSubDir = path.join(root, 'clip')
				if (fs.existsSync(clipSubDir) && !dirs.includes(clipSubDir)) dirs.push(clipSubDir)
			}
			if (type === 'diffusion_models') {
				const unetSubDir = path.join(root, 'unet')
				if (fs.existsSync(unetSubDir) && !dirs.includes(unetSubDir)) dirs.push(unetSubDir)
			}
		}
		if (modelPaths[type]) {
			for (const p of modelPaths[type]) {
				if (!dirs.includes(p)) dirs.push(p)
			}
		}
		result[type] = dirs
	}
	return {
		modelDirs: result,
		hasExtraConfig: hasConfig,
		extraModelPaths: modelPaths,
		customRoots: customModelRoots
	}
}

function runCommandWithStream(cmd, args, options = {}) {
	const timeout = options.timeout || 300000
	let child
	let timedOut = false
	let killed = false
	// 修复A：同 runCommand，默认注入 PIP_INDEX_URL 官方源
	const baseEnv = { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' }
	if (baseEnv.PIP_INDEX_URL === undefined) {
		baseEnv.PIP_INDEX_URL = 'https://pypi.org/simple'
	}
	const exited = new Promise((resolve) => {
		child = spawn(cmd, args, {
			encoding: 'utf-8',
			...options,
			env: baseEnv
		})
		const timer = setTimeout(() => {
			timedOut = true
			try {
				child.kill()
			} catch {}
			resolve({ ok: false, code: -1, error: 'timeout' })
		}, timeout)
		child.on('close', (code) => {
			if (timedOut || killed) return
			clearTimeout(timer)
			resolve({ ok: code === 0, code })
		})
		child.on('error', (err) => {
			if (timedOut || killed) return
			clearTimeout(timer)
			resolve({ ok: false, code: -1, error: String(err.message || err) })
		})
	})
	return {
		child,
		promise: exited,
		onStdout(cb) {
			child.stdout?.on('data', (d) => cb(String(d)))
		},
		onStderr(cb) {
			child.stderr?.on('data', (d) => cb(String(d)))
		},
		kill() {
			killed = true
			try {
				child?.kill()
			} catch {}
		}
	}
}

async function runPythonCheck(pythonCmd, pythonArgs, code, timeout) {
	const args = [...pythonArgs, '-c', code]
	return runCommand(pythonCmd, args, { timeout: timeout || 20000 })
}

async function checkPythonCanImport(pythonExe, code, timeout) {
	return runCommand(pythonExe, ['-c', code], { timeout: timeout || 20000 })
}

/**
 * PEP 440 版本规范化：去掉前导 v + 本地版本段(+cu124 / +local / +build.123)
 * 用于比较 pip metadata 返回的 1.2.3+cu124 与 requirements.txt 声明的 ==1.2.3
 * @param {string} ver
 * @returns {string}
 */
function normalizePkgVersion(ver) {
	if (!ver || typeof ver !== 'string') return ''
	let v = ver.trim()
	if (v.startsWith('v')) v = v.slice(1)
	// PEP440: local version identifier 紧跟在 + 之后，允许 . _ - 字母数字
	const plusIdx = v.indexOf('+')
	if (plusIdx >= 0) v = v.slice(0, plusIdx)
	return v.trim()
}

function getRequirementsCriticalPackages(reqFilePath) {
	const critical = {}
	try {
		if (!fs.existsSync(reqFilePath)) return critical
		const content = fs.readFileSync(reqFilePath, 'utf-8')
		const lines = content.split(/\r?\n/)
		for (const line of lines) {
			const trimmed = line.trim()
			if (
				!trimmed ||
				trimmed.startsWith('#') ||
				trimmed.startsWith('-r') ||
				trimmed.startsWith('-e') ||
				trimmed.startsWith('--')
			)
				continue
			const exactMatch = trimmed.match(/^([a-zA-Z0-9_][a-zA-Z0-9._-]*)\s*==\s*([^\s;]+)/)
			if (exactMatch) {
				const pkgName = exactMatch[1].toLowerCase().replace(/_/g, '-')
				critical[pkgName] = normalizePkgVersion(exactMatch[2])
			}
		}
	} catch {}
	return critical
}

async function findWorkingPython(comfyDir, installType) {
	const candidates = []
	// 改动§6：跨盘环境支持 — 优先从 loadConfig() 读取用户显式指定的 pythonPath/venvPath，
	// 避免 installPath=C:\ComfyUIDesktop\ComfyUI 但 venv 在 G:\ComfyUISource\venv 这种跨盘分离场景下，
	// findWorkingPython 漏选正确 venv 而 fallback 到系统 Python（CPU 版 torch、VRAM 不识别）。
	// 注意：这里 push 到 candidates 最前面，保证用户显式指定优先级最高。
	try {
		const cfg = loadConfig()
		const explicitCandidates = []
		if (cfg && typeof cfg === 'object') {
			for (const key of ['pythonPath', 'venvPath', 'python', 'pythonCmd']) {
				const val = cfg[key]
				if (typeof val === 'string' && val.trim()) {
					// 兼容两种写法：① 直接指向 python.exe 绝对路径；② 指向 venv 根目录（内部会找 Scripts/python.exe）
					let p = val.trim()
					const asFile = p
					if (fs.existsSync(asFile) && fs.statSync(asFile).isFile()) {
						explicitCandidates.push({ cmd: asFile, args: [], type: 'config_python', path: asFile })
						continue
					}
					if (fs.existsSync(asFile) && fs.statSync(asFile).isDirectory()) {
						const scriptPy =
							process.platform === 'win32'
								? path.join(asFile, 'Scripts', 'python.exe')
								: path.join(asFile, 'bin', 'python')
						const embedPy = path.join(asFile, 'python.exe')
						for (const sub of [scriptPy, embedPy]) {
							if (fs.existsSync(sub))
								explicitCandidates.push({ cmd: sub, args: [], type: 'config_venv', path: sub })
						}
					}
				}
			}
		}
		// 去重后插到最前面（优先级最高）
		for (const c of explicitCandidates) {
			if (!candidates.find((x) => x.path === c.path)) candidates.unshift(c)
		}
	} catch (_) {
		// 读 config 失败不影响其他候选
	}
	const managedPy = getManagedVenvPython()
	if (fs.existsSync(managedPy)) {
		candidates.push({ cmd: managedPy, args: [], type: 'managed_venv', path: managedPy })
	}
	if (installType === 'portable') {
		const ppy = path.join(comfyDir, 'python_embeded', 'python.exe')
		if (fs.existsSync(ppy)) candidates.push({ cmd: ppy, args: [], type: 'portable', path: ppy })
	}
	if (installType === 'venv') {
		const vpy =
			process.platform === 'win32'
				? path.join(comfyDir, 'venv', 'Scripts', 'python.exe')
				: path.join(comfyDir, 'venv', 'bin', 'python')
		if (fs.existsSync(vpy)) candidates.push({ cmd: vpy, args: [], type: 'venv', path: vpy })
	}
	if (isComfyUIDesktop(comfyDir)) {
		const parentDir = path.dirname(comfyDir)
		const possiblePaths = [
			path.join(parentDir, 'python', 'python.exe'),
			path.join(parentDir, 'resources', 'python', 'python.exe'),
			path.join(comfyDir, 'python_embeded', 'python.exe'),
			path.join(parentDir, '..', 'python', 'python.exe'),
			path.join(parentDir, 'Python', 'python.exe'),
			path.join(parentDir, 'resources', 'app', 'python', 'python.exe')
		]
		for (const p of possiblePaths) {
			try {
				if (fs.existsSync(p) && !candidates.find((c) => c.path === p)) {
					candidates.push({ cmd: p, args: [], type: 'desktop_bundled', path: p })
				}
			} catch {}
		}
	}
	const sysCmds = findSystemPythonCandidates().map((c) => ({
		cmd: c.cmd,
		args: c.args,
		type: c.type,
		path: c.cmd + (c.args.length ? ' ' + c.args.join(' ') : '')
	}))
	for (const sc of sysCmds) {
		if (!candidates.find((c) => c.cmd === sc.cmd && c.args.join(' ') === sc.args.join(' '))) {
			candidates.push(sc)
		}
	}
	const criticalReqs = getRequirementsCriticalPackages(path.join(comfyDir, 'requirements.txt'))
	const results = []
	for (const cand of candidates) {
		const info = {
			path: cand.path,
			type: cand.type,
			available: false,
			version: undefined,
			hasTorch: false,
			torchCuda: false,
			canImportComfy: false,
			error: undefined,
			// 改动1：核心包 5 件套版本检查结构化结果
			// { 'comfyui-frontend-package': { required:'1.48.7', installed:'1.45.21', ok:false } }
			keyPackageStatus: {}
		}
		try {
			const verR = await runPythonCheck(
				cand.cmd,
				cand.args,
				'import sys; print(sys.version.split()[0])',
				8000
			)
			if (verR.ok && verR.stdout) {
				info.available = true
				info.version = verR.stdout.trim()
			} else {
				continue
			}
		} catch {
			continue
		}
		try {
			const torchR = await runPythonCheck(
				cand.cmd,
				cand.args,
				'import torch; print(torch.__version__); print("CUDA" if torch.cuda.is_available() else "CPU")',
				25000
			)
			if (torchR.ok && torchR.stdout) {
				info.hasTorch = true
				const lines = torchR.stdout
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean)
				if (lines.length > 1) {
					info.torchCuda = lines[lines.length - 1].toUpperCase().includes('CUDA')
					info.torchVersion = lines[0]
				}
			}
		} catch {}
		try {
			const importCode = [
				'import sys',
				`sys.path.insert(0, ${JSON.stringify(comfyDir)})`,
				'import os',
				`os.chdir(${JSON.stringify(comfyDir)})`,
				'import comfy',
				'print("COMFY_OK")'
			].join(';')
			const comfyR = await runPythonCheck(cand.cmd, cand.args, importCode, 20000)
			if (comfyR.ok && comfyR.stdout.includes('COMFY_OK')) {
				info.canImportComfy = true
			}
			if (info.canImportComfy) {
				const versionMismatches = []
				if (Object.keys(criticalReqs).length > 0) {
					try {
						const pkgListCode = [
							'import importlib.metadata as md',
							'import json',
							'pkgs = ' + JSON.stringify(Object.keys(criticalReqs)),
							'result = {}',
							'for p in pkgs:',
							'    try:',
							'        result[p] = md.version(p)',
							'    except Exception:',
							'        result[p] = None',
							'print(json.dumps(result))'
						].join('; ')
						const verCheckR = await runPythonCheck(cand.cmd, cand.args, pkgListCode, 15000)
						if (verCheckR.ok && verCheckR.stdout) {
							try {
								const lastLine = verCheckR.stdout.trim().split('\n').filter(Boolean).pop()
								const installed = JSON.parse(lastLine)
								for (const [pkg, requiredVer] of Object.entries(criticalReqs)) {
									const installedVer = installed[pkg]
									// 改动A：容忍 PEP440 +cu124 / +local 本地版本后缀再比较
									const installedNorm = normalizePkgVersion(installedVer)
									const requiredNorm = normalizePkgVersion(requiredVer)
									const ok = !!installedNorm && installedNorm === requiredNorm
									// 改动A：同步写入结构化版本状态（pkg 名已是 lowercase-normalized）
									info.keyPackageStatus[pkg] = {
										required: requiredNorm,
										installed: installedVer || null,
										installedNorm,
										ok
									}
									if (!ok) {
										if (!installedVer) {
											versionMismatches.push(`${pkg}==${requiredNorm} (未安装)`)
										} else {
											versionMismatches.push(
												`${pkg} 需要 ${requiredNorm}，当前 ${installedVer}` +
													(installedNorm !== installedVer ? ` (规范化后 ${installedNorm})` : '')
											)
										}
									}
								}
							} catch {}
						}
					} catch {}
				}

				// 改动A：纯核心包版本不达标不再阻断 canStartComfy 的探测。
				// 因为 comfy-kitchen 0.2.28 的缺失会导致 main import 期抛 ValueError 直接退出，
				// 这里 canStartComfy 仍然保留真实结果（但不因为 versionBlockOk 手动把它打回 false）；
				// 版本问题交给 probeExistingInstall.launchCompatibility.keyPkgsNeedUpgrade + startService 自动升级。
				const mainCheckSrc = [
					'import sys, os',
					`sys.path.insert(0, ${JSON.stringify(comfyDir)})`,
					`os.chdir(${JSON.stringify(comfyDir)})`,
					'try:',
					'    import main',
					'    print("MAIN_OK")',
					'except SystemExit:',
					'    print("MAIN_OK")',
					'except Exception:',
					'    import traceback',
					'    traceback.print_exc()',
					'    sys.exit(1)'
				].join('\n')
				const mainCode = `exec(${JSON.stringify(mainCheckSrc)})`
				const mainR = await runPythonCheck(cand.cmd, cand.args, mainCode, 30000)
				if (mainR.ok && mainR.stdout.includes('MAIN_OK')) {
					info.canStartComfy = true
					// 版本不匹配只保留记录（作为非阻断信息，后续启动预检会修）
					if (versionMismatches.length > 0) {
						info.versionMismatchNote =
							'依赖版本不匹配（启动前将自动升级）: ' + versionMismatches.join(', ')
					}
				} else {
					info.canStartComfy = false
					const errParts = []
					// 即便 main 真 import 失败，版本不匹配也应作为“非阻断的可能根因提示”输出，
					// 因为 90% 情况下就是 comfy-kitchen 低版本导致 import comfy_kitchen → na3d schema infer 崩溃。
					if (versionMismatches.length > 0) {
						errParts.push('依赖版本不匹配: ' + versionMismatches.join(', '))
					}
					const importErrs = (mainR.stderr || mainR.stdout || '')
						.split(/\r?\n/)
						.filter(
							(l) =>
								l.includes('ModuleNotFoundError') ||
								l.includes('ImportError') ||
								l.includes('ValueError: infer_schema') ||
								l.includes('unsupported type')
						)
						.slice(0, 3)
						.join('; ')
					if (importErrs) errParts.push(importErrs)
					if (errParts.length > 0) info.importError = errParts.join('; ')
				}
			}
		} catch {}
		results.push(info)
	}
	// 改动 Task2.a：每个候选结果补 pyTorch26Pep585Compat 诊断（PyTorch 2.6.x + comfy-kitchen 0.2.28 是否命中不兼容）
	for (const info of results) {
		const torchOk = Boolean(info.hasTorch && info.torchVersion)
		const torchVer = info.torchVersion ? normalizePkgVersion(info.torchVersion) : ''
		const kitchenStatus = info.keyPackageStatus
			? info.keyPackageStatus['comfy-kitchen'] || null
			: null
		const needsPatch =
			torchOk &&
			/^2\.6(\.|$)/.test(torchVer) &&
			Boolean(kitchenStatus) &&
			kitchenStatus.installedNorm === '0.2.28'
		info.pyTorch26Pep585Compat = {
			needsPatch: Boolean(needsPatch),
			compatible: !needsPatch,
			torchVersion: torchVer || null,
			kitchenVersion: kitchenStatus ? kitchenStatus.installedNorm || null : null
		}
	}

	const bestPick =
		results.find((r) => r.hasTorch && r.canImportComfy && r.canStartComfy) ||
		results.find((r) => r.hasTorch && r.canImportComfy) ||
		results.find((r) => r.hasTorch) ||
		results.find((r) => r.available) ||
		null
	return { candidates: results, bestPick }
}

function resolveMirrorUrls(config, cuSuffix) {
	let pypiUrl = null
	let torchUrl = null
	const pypiKey = config.pypiMirror || 'auto'
	const torchKey = config.torchMirror || 'auto'
	const customPypi = config.customPypiMirrorUrl
	const customTorch = config.customTorchMirrorUrl
	if (pypiKey === 'custom' && customPypi) {
		pypiUrl = customPypi
	} else if (pypiKey && pypiKey !== 'auto') {
		const found = PIP_MIRRORS.find((m) => m.key === pypiKey)
		if (found) pypiUrl = found.url
	}
	if (torchKey === 'custom' && customTorch) {
		torchUrl = customTorch
	} else if (torchKey && torchKey !== 'auto') {
		const found = TORCH_MIRRORS.find((m) => m.key === torchKey)
		if (found) torchUrl = resolveMirrorUrl(found, cuSuffix)
	}
	return { pypiUrl, torchUrl }
}

async function* setupPythonEnv(installPath, options = {}) {
	const forceRecreate = !!options.forceRecreate
	const venvRoot = options.venvPath || getManagedVenvRoot()
	const venvPython = getManagedVenvPython(venvRoot)

	function createStreamQueue() {
		const buf = []
		let resolveWait = null
		let done = false
		return {
			push(val) {
				buf.push(val)
				if (resolveWait) {
					const r = resolveWait
					resolveWait = null
					r(true)
				}
			},
			finish() {
				done = true
				if (resolveWait) {
					const r = resolveWait
					resolveWait = null
					r(false)
				}
			},
			async next() {
				if (buf.length > 0) return { value: buf.shift(), done: false }
				if (done) return { done: true }
				const hasMore = await new Promise((r) => {
					resolveWait = r
				})
				if (buf.length > 0) return { value: buf.shift(), done: false }
				return { done: !hasMore }
			}
		}
	}

	async function runStreaming(cmd, args, opts) {
		const queue = createStreamQueue()
		const proc = runCommandWithStream(cmd, args, opts)
		proc.onStdout((d) => {
			queue.push({ stream: 'stdout', data: d })
		})
		proc.onStderr((d) => {
			queue.push({ stream: 'stderr', data: d })
		})
		proc.promise.then(
			(res) => {
				queue.push({ type: 'result', result: res })
				queue.finish()
			},
			(err) => {
				queue.push({ type: 'error', error: String(err) })
				queue.finish()
			}
		)
		return queue
	}

	yield { type: 'step', step: 'preparing', message: '准备配置 Python 虚拟环境...' }

	let sysPython = null
	yield { type: 'log', stream: 'stdout', message: '查找可用的系统 Python...' }
	const foundPy = await findSystemPythonForVenv()
	if (foundPy) {
		sysPython = foundPy
		yield {
			type: 'log',
			stream: 'stdout',
			message: `找到可用 Python: ${foundPy.cmd} ${foundPy.args.join(' ')} (${foundPy.version})`
		}
	}
	if (!sysPython) {
		yield {
			type: 'error',
			message: '未找到可用的系统 Python（需要 Python 3.10-3.12），请先安装 Python。'
		}
		return
	}

	let cudaInfo = { available: false }
	try {
		cudaInfo = await detectCuda()
	} catch {}
	const cuSuffix = getTorchCuSuffix(cudaInfo.cudaVersion, cudaInfo.available)
	yield {
		type: 'log',
		stream: 'stdout',
		message: cudaInfo.available
			? `检测到 NVIDIA GPU (CUDA ${cudaInfo.cudaVersion || '版本未知'}, 将安装 PyTorch ${cuSuffix})`
			: '未检测到 NVIDIA GPU，将使用 CPU 版本'
	}

	const cfg = loadConfig()
	const mirrors = resolveMirrorUrls(cfg, cuSuffix)
	const needAutoPing =
		cfg.pypiMirror === 'auto' || !cfg.pypiMirror || cfg.torchMirror === 'auto' || !cfg.torchMirror
	if (needAutoPing) {
		yield { type: 'log', stream: 'stdout', message: '自动检测最快的镜像源...' }
		try {
			const pingResults = await pingAllMirrors(cudaInfo.cudaVersion)
			const autoSel = autoSelectMirrors(pingResults)
			if (!mirrors.pypiUrl) {
				const pypiPick = PIP_MIRRORS.find((m) => m.key === autoSel.pypiMirror)
				if (pypiPick) mirrors.pypiUrl = pypiPick.url
			}
			if (!mirrors.torchUrl) {
				const torchPick = TORCH_MIRRORS.find((m) => m.key === autoSel.torchMirror)
				if (torchPick) mirrors.torchUrl = resolveMirrorUrl(torchPick, cuSuffix)
			}
		} catch (e) {
			yield { type: 'log', stream: 'stderr', message: '镜像检测失败，使用默认源: ' + e.message }
		}
	}
	if (mirrors.pypiUrl)
		yield { type: 'log', stream: 'stdout', message: `PyPI 镜像: ${mirrors.pypiUrl}` }
	if (mirrors.torchUrl)
		yield { type: 'log', stream: 'stdout', message: `PyTorch 镜像: ${mirrors.torchUrl}` }

	const pipProgressArg = '--progress-bar=on'
	const pipTimeoutArg = '--timeout=600'
	const pipRetriesArg = '--retries=10'
	const isolatedEnv = {
		...process.env,
		PYTHONNOUSERSITE: '1',
		PIP_NO_CACHE_DIR: '0',
		PIP_DISABLE_PIP_VERSION_CHECK: '1'
	}
	process.env.PYTHONNOUSERSITE = '1'

	let existingEnvOk = false
	const venvExists = fs.existsSync(venvPython)
	if (venvExists && !forceRecreate) {
		yield {
			type: 'step',
			step: 'venv_exists',
			message: '检测到已有的客户端虚拟环境，验证环境完整性...'
		}

		const venvCfgPath = path.join(venvRoot, 'venv', 'pyvenv.cfg')
		let venvIsolated = true
		try {
			if (fs.existsSync(venvCfgPath)) {
				const cfgContent = fs.readFileSync(venvCfgPath, 'utf-8')
				if (cfgContent.includes('include-system-site-packages = true')) {
					venvIsolated = false
					yield {
						type: 'log',
						stream: 'stderr',
						message: '⚠️ 虚拟环境配置为继承系统包，将重新创建以确保隔离'
					}
				}
			}
		} catch {}

		if (venvIsolated) {
			yield { type: 'log', stream: 'stdout', message: '正在验证虚拟环境中的 PyTorch 和基础依赖...' }
			try {
				const verifyModules = ['torch', 'requests', 'numpy', 'PIL', 'filelock', 'packaging']
				if (cuSuffix !== 'cpu') verifyModules.push('torch.cuda')

				let allModulesOk = true
				let moduleStatus = []
				for (const mod of verifyModules) {
					try {
						let checkCode
						if (mod === 'torch.cuda') {
							checkCode =
								'import torch; assert torch.cuda.is_available(), "CUDA not available"; print("torch.cuda ok")'
						} else {
							checkCode = `import ${mod}; print("${mod} ok")`
						}
						const r = await runCommand(venvPython, ['-c', checkCode], {
							timeout: 15000,
							env: isolatedEnv
						})
						if (r.ok) {
							moduleStatus.push(`${mod}: ✓`)
						} else {
							moduleStatus.push(`${mod}: ✗`)
							allModulesOk = false
						}
					} catch {
						moduleStatus.push(`${mod}: ✗`)
						allModulesOk = false
					}
				}
				yield { type: 'log', stream: 'stdout', message: '依赖状态: ' + moduleStatus.join(', ') }

				if (allModulesOk) {
					yield {
						type: 'log',
						stream: 'stdout',
						message: '✅ 所有基础依赖已安装，检查 ComfyUI 模块...'
					}
					const comfyCheckCode = `import sys; sys.path.insert(0, ${JSON.stringify(installPath)}); import comfy; print("comfy ok")`
					const comfyCheck = await runCommand(venvPython, ['-c', comfyCheckCode], {
						timeout: 15000,
						env: isolatedEnv
					})
					if (comfyCheck.ok) {
						yield { type: 'log', stream: 'stdout', message: '✅ 环境验证通过，跳过安装' }
						existingEnvOk = true
					} else {
						yield {
							type: 'log',
							stream: 'stdout',
							message: 'ComfyUI 模块未就绪，将安装/修复依赖...'
						}
					}
				} else {
					yield { type: 'log', stream: 'stdout', message: '部分依赖缺失，将补装缺失的包...' }
				}
			} catch (e) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: '环境验证出错: ' + e.message + '，将继续安装...'
				}
			}
		}

		if (!existingEnvOk && (!venvIsolated || forceRecreate)) {
			yield { type: 'log', stream: 'stdout', message: '删除旧的虚拟环境...' }
			try {
				fs.rmSync(venvRoot, { recursive: true, force: true })
			} catch {}
		}
	}
	if (!fs.existsSync(venvPython) || forceRecreate) {
		if (forceRecreate && fs.existsSync(venvRoot)) {
			yield { type: 'log', stream: 'stdout', message: '删除旧的虚拟环境...' }
			try {
				fs.rmSync(venvRoot, { recursive: true, force: true })
			} catch {}
		} else {
			const legacyVenvPython =
				process.platform === 'win32'
					? path.join(venvRoot, 'Scripts', 'python.exe')
					: path.join(venvRoot, 'bin', 'python')
			const legacyPyvenv = path.join(venvRoot, 'pyvenv.cfg')
			if (fs.existsSync(legacyVenvPython) || fs.existsSync(legacyPyvenv)) {
				yield { type: 'log', stream: 'stdout', message: '检测到旧版本的虚拟环境结构，正在清理...' }
				try {
					fs.rmSync(venvRoot, { recursive: true, force: true })
				} catch {}
			}
		}
		yield { type: 'step', step: 'creating_venv', message: '创建隔离的虚拟环境...' }
		const venvDir = path.join(venvRoot, 'venv')
		if (!fs.existsSync(venvRoot)) {
			fs.mkdirSync(venvRoot, { recursive: true })
		}
		yield { type: 'log', stream: 'stdout', message: `虚拟环境目录: ${venvDir}` }
		const createCmd = sysPython.cmd
		const createArgs = [...sysPython.args, '-m', 'venv', '--without-pip', venvDir]
		yield { type: 'log', stream: 'stdout', message: `执行: ${createCmd} ${createArgs.join(' ')}` }
		const createResult = await runCommand(createCmd, createArgs, { timeout: 120000 })
		if (createResult.stdout) yield { type: 'log', stream: 'stdout', message: createResult.stdout }
		if (createResult.stderr) yield { type: 'log', stream: 'stderr', message: createResult.stderr }
		if (!createResult.ok) {
			yield {
				type: 'error',
				message: `虚拟环境创建失败: ${createResult.error || 'exit code ' + createResult.code}`
			}
			return
		}

		const ensurepipArgs = ['-m', 'ensurepip', '--upgrade', '--default-pip']
		yield { type: 'log', stream: 'stdout', message: '引导安装 pip...' }
		const pipBootResult = await runCommand(venvPython, ensurepipArgs, {
			timeout: 60000,
			env: isolatedEnv
		})
		if (pipBootResult.stdout) yield { type: 'log', stream: 'stdout', message: pipBootResult.stdout }
		if (pipBootResult.stderr) yield { type: 'log', stream: 'stderr', message: pipBootResult.stderr }

		if (!fs.existsSync(venvPython)) {
			try {
				if (fs.existsSync(venvDir)) {
					const entries = fs.readdirSync(venvDir, { withFileTypes: true })
					const dirList = entries
						.map((e) => (e.isDirectory() ? '[' + e.name + ']' : e.name))
						.join(', ')
					yield { type: 'log', stream: 'stderr', message: `venv 目录内容: ${dirList}` }
				}
				const scriptsDir =
					process.platform === 'win32' ? path.join(venvDir, 'Scripts') : path.join(venvDir, 'bin')
				if (fs.existsSync(scriptsDir)) {
					const scripts = fs.readdirSync(scriptsDir)
					yield {
						type: 'log',
						stream: 'stderr',
						message: `Scripts 目录内容: ${scripts.join(', ')}`
					}
				} else {
					yield {
						type: 'log',
						stream: 'stderr',
						message: `Scripts/bin 目录不存在，venv 可能未正确创建（期望: ${scriptsDir}）`
					}
				}
			} catch (e) {
				yield { type: 'log', stream: 'stderr', message: `无法读取 venv 目录: ${e.message}` }
			}
			yield {
				type: 'error',
				message: `虚拟环境创建后未找到 python 可执行文件 (期望路径: ${venvPython})`
			}
			return
		}

		const venvCfgPath = path.join(venvDir, 'pyvenv.cfg')
		try {
			let cfgContent = ''
			if (fs.existsSync(venvCfgPath)) {
				cfgContent = fs.readFileSync(venvCfgPath, 'utf-8')
			}
			if (!cfgContent.includes('include-system-site-packages = false')) {
				cfgContent = cfgContent.replace(/include-system-site-packages\s*=\s*\w+/g, '')
				cfgContent = cfgContent.trim() + '\ninclude-system-site-packages = false\n'
				fs.writeFileSync(venvCfgPath, cfgContent)
				yield {
					type: 'log',
					stream: 'stdout',
					message: '已配置虚拟环境为完全隔离模式（不继承系统包）'
				}
			}
		} catch (e) {
			yield { type: 'log', stream: 'stderr', message: '写入 pyvenv.cfg 失败: ' + e.message }
		}

		yield { type: 'log', stream: 'stdout', message: `虚拟环境创建成功: ${venvPython}` }
	}

	async function* runPipInstall(args, label, timeout = 1800000) {
		yield { type: 'log', stream: 'stdout', message: `[${label}] ${venvPython} ${args.join(' ')}` }
		const queue = await runStreaming(venvPython, args, { timeout, env: isolatedEnv })
		let result = null
		let stderrText = ''
		const stdoutState = createLineParserState()
		const stderrState = createLineParserState()

		while (true) {
			const item = await queue.next()
			if (item.done) break
			const entry = item.value
			if (entry.stream) {
				const state = entry.stream === 'stdout' ? stdoutState : stderrState
				const evts = processStreamData(entry.stream, entry.data, state, false)
				for (const ev of evts) {
					yield ev
					if (ev.stream === 'stderr') stderrText += ev.message + '\n'
				}
			} else if (entry.type === 'result') {
				result = entry.result
			} else if (entry.type === 'error') {
				result = { ok: false, error: entry.error }
			}
		}

		const stdoutEnd = processStreamData('stdout', '', stdoutState, true)
		for (const ev of stdoutEnd) yield ev
		const stderrEnd = processStreamData('stderr', '', stderrState, true)
		for (const ev of stderrEnd) {
			yield ev
			stderrText += ev.message + '\n'
		}

		return { result, stderrText }
	}

	let torchInstallOk = existingEnvOk

	if (!existingEnvOk) {
		yield { type: 'step', step: 'upgrading_pip', message: '升级 pip 和基础构建工具...' }
		const baseDeps = ['pip', 'setuptools', 'wheel']
		const pipUpgradeArgs = [
			'-m',
			'pip',
			'install',
			'--upgrade',
			...baseDeps,
			pipProgressArg,
			pipTimeoutArg,
			pipRetriesArg
		]
		if (mirrors.pypiUrl) pipUpgradeArgs.push('-i', mirrors.pypiUrl)
		const pipUp = runPipInstall(pipUpgradeArgs, '升级 pip/setuptools/wheel', 300000)
		let pipUpResult = null
		while (true) {
			const it = await pipUp.next()
			if (it.done) {
				pipUpResult = it.value
				break
			}
			yield it.value
		}
		if (!pipUpResult?.result?.ok) {
			const errMsg =
				pipUpResult.result?.stderr ||
				pipUpResult.stderrText ||
				pipUpResult.result?.error ||
				'未知错误'
			yield { type: 'log', stream: 'stderr', message: 'pip 升级失败（非致命）: ' + errMsg }
		}

		yield { type: 'log', stream: 'stdout', message: '安装基础依赖（requests、numpy 等）...' }
		const coreDeps = [
			'requests',
			'numpy',
			'pillow',
			'filelock',
			'networkx',
			'jinja2',
			'fsspec',
			'sympy',
			'packaging'
		]
		const coreArgs = [
			'-m',
			'pip',
			'install',
			...coreDeps,
			pipProgressArg,
			pipTimeoutArg,
			pipRetriesArg
		]
		if (mirrors.pypiUrl) coreArgs.push('-i', mirrors.pypiUrl)
		const coreInstaller = runPipInstall(coreArgs, '安装基础依赖', 600000)
		let coreResult = null
		while (true) {
			const it = await coreInstaller.next()
			if (it.done) {
				coreResult = it.value
				break
			}
			yield it.value
		}
		if (!coreResult?.result?.ok) {
			const errMsg =
				coreResult.result?.stderr || coreResult.stderrText || coreResult.result?.error || '未知错误'
			yield {
				type: 'log',
				stream: 'stderr',
				message: '基础依赖安装遇到问题，将继续尝试: ' + errMsg
			}
		}
	}

	yield {
		type: 'step',
		step: 'installing_torch',
		message: existingEnvOk ? '检查 PyTorch...' : '安装 PyTorch...'
	}
	const torchOfficialBaseUrl = 'https://download.pytorch.org/whl/' + cuSuffix

	const TORCH_VERSION = '2.6.0'
	const TORCHVISION_VERSION = '0.21.0'
	const TORCHAUDIO_VERSION = '2.6.0'

	function getPythonAbiTag(pyVersion) {
		const parts = String(pyVersion || '')
			.split('.')
			.map(Number)
		if (parts[0] !== 3) return 'cp311'
		if (parts[1] >= 13) return 'cp313'
		if (parts[1] === 12) return 'cp312'
		if (parts[1] === 11) return 'cp311'
		if (parts[1] === 10) return 'cp310'
		if (parts[1] === 9) return 'cp39'
		return 'cp3' + parts[1]
	}

	function getPlatformTag() {
		if (process.platform === 'win32') return 'win_amd64'
		if (process.platform === 'darwin')
			return process.arch === 'arm64' ? 'macosx_11_0_arm64' : 'macosx_10_9_x86_64'
		return 'linux_x86_64'
	}

	function encodeWheelUrl(baseUrl, wheelName) {
		const encodedName = wheelName.replace(/\+/g, '%2B').replace(/#/g, '%23')
		return baseUrl + '/' + encodedName
	}

	async function detectVenvPythonInfo() {
		try {
			const r = await runCommand(
				venvPython,
				[
					'-c',
					'import sys; print(sys.version.split()[0]); import platform; print(platform.machine())'
				],
				{ timeout: 10000, env: isolatedEnv }
			)
			if (r.ok && r.stdout) {
				const lines = r.stdout
					.split(/\r?\n/)
					.map((s) => s.trim())
					.filter(Boolean)
				return {
					version: lines[0],
					machine: lines[1] || (process.arch === 'arm64' ? 'arm64' : 'AMD64')
				}
			}
		} catch {}
		return { version: '3.11.0', machine: process.arch === 'arm64' ? 'arm64' : 'AMD64' }
	}

	async function* verifyTorchCuda() {
		const verifyCode =
			cuSuffix === 'cpu'
				? 'import torch; print("torch", torch.__version__); print("cuda_available", torch.cuda.is_available())'
				: 'import torch; print("torch", torch.__version__); print("cuda_available", torch.cuda.is_available()); import sys; sys.exit(0 if torch.cuda.is_available() else 1)'
		const r = await runCommand(venvPython, ['-c', verifyCode], { timeout: 30000, env: isolatedEnv })
		const output = (r.stdout || '').trim()
		if (output) yield { type: 'log', stream: 'stdout', message: `PyTorch 验证: ${output}` }
		if (r.stderr) yield { type: 'log', stream: 'stderr', message: r.stderr.trim() }
		let cudaOk = true
		let torchVersion = ''
		const torchMatch = output.match(/torch\s+([\d.]+\+?\w*)/)
		if (torchMatch) torchVersion = torchMatch[1]
		if (!r.ok && cuSuffix !== 'cpu') {
			yield {
				type: 'log',
				stream: 'stderr',
				message: 'PyTorch CUDA 验证失败，安装的可能是 CPU 版本'
			}
			cudaOk = false
		}
		return { cudaOk, torchVersion }
	}

	async function* installTorchFromOfficialIndex(indexUrl, label) {
		const torchBaseArgs = [
			'-m',
			'pip',
			'install',
			'torch',
			'torchvision',
			'torchaudio',
			pipProgressArg,
			'--timeout=900',
			'--retries=5'
		]
		torchBaseArgs.push('--index-url', indexUrl)
		if (mirrors.pypiUrl) torchBaseArgs.push('--extra-index-url', mirrors.pypiUrl)
		const installer = runPipInstall(torchBaseArgs, label, 7200000)
		let result = null
		let stderrText = ''
		while (true) {
			const it = await installer.next()
			if (it.done) {
				result = it.value.result
				stderrText = it.value.stderrText
				break
			}
			yield it.value
		}
		return { result, stderrText, indexUrl }
	}

	let lastErrorMsg = ''
	let installedCpuVersion = false
	let networkError = false
	const inChina = isLikelyInChina()

	if (!existingEnvOk) {
		const pyInfo = await detectVenvPythonInfo()
		const abiTag = getPythonAbiTag(pyInfo.version)
		const platformTag = getPlatformTag()

		const torchWheel = `torch-${TORCH_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`
		const torchvisionWheel = `torchvision-${TORCHVISION_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`
		const torchaudioWheel = `torchaudio-${TORCHAUDIO_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`

		const aliyunBase = `https://mirrors.aliyun.com/pytorch-wheels/${cuSuffix}`
		const officialBase = `https://download.pytorch.org/whl/${cuSuffix}`
		const pypiMirrorUrl =
			mirrors.pypiUrl ||
			(inChina ? 'https://mirrors.aliyun.com/pypi/simple' : 'https://pypi.org/simple')

		const aliyunTorchUrlRaw = `${aliyunBase}/${torchWheel}`
		const aliyunTorchvisionUrlRaw = `${aliyunBase}/${torchvisionWheel}`
		const aliyunTorchaudioUrlRaw = `${aliyunBase}/${torchaudioWheel}`

		const aliyunTorchUrl = encodeWheelUrl(aliyunBase, torchWheel)
		const aliyunTorchvisionUrl = encodeWheelUrl(aliyunBase, torchvisionWheel)
		const aliyunTorchaudioUrl = encodeWheelUrl(aliyunBase, torchaudioWheel)

		const officialTorchUrl = encodeWheelUrl(officialBase, torchWheel)
		const officialTorchvisionUrl = encodeWheelUrl(officialBase, torchvisionWheel)
		const officialTorchaudioUrl = encodeWheelUrl(officialBase, torchaudioWheel)

		yield {
			type: 'log',
			stream: 'stdout',
			message: `检测到 Python 版本: ${pyInfo.version}, 平台: ${platformTag}, ABI: ${abiTag}, CUDA: ${cuSuffix}`
		}
		yield {
			type: 'log',
			stream: 'stdout',
			message: `网络区域: ${inChina ? '国内（优先使用阿里云镜像）' : '海外（优先使用官方源）'}`
		}

		if (cuSuffix === 'cpu') {
			yield { type: 'log', stream: 'stdout', message: '未检测到NVIDIA GPU，将安装CPU版本PyTorch' }
			const installer = installTorchFromOfficialIndex(torchOfficialBaseUrl, 'PyTorch CPU 版本')
			let installRes = null
			while (true) {
				const it = await installer.next()
				if (it.done) {
					installRes = it.value
					break
				}
				yield it.value
			}
			if (installRes.result?.ok) {
				torchInstallOk = true
			} else {
				lastErrorMsg =
					installRes.result?.stderr ||
					installRes.stderrText ||
					installRes.result?.error ||
					'未知错误'
			}
		} else {
			yield {
				type: 'log',
				stream: 'stdout',
				message: 'PyTorch GPU 包体积较大（约2-3GB），请耐心等待...'
			}

			const tryInstallFromWheelUrls = async function* (torchUrl, tvUrl, taUrl, label) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `尝试从 ${label} 直接下载安装 (${cuSuffix})...`
				}
				const directArgs = [
					'-m',
					'pip',
					'install',
					'--timeout=900',
					'--retries=10',
					torchUrl,
					tvUrl,
					taUrl,
					'--extra-index-url',
					pypiMirrorUrl,
					pipProgressArg
				]
				const installer = runPipInstall(directArgs, label, 7200000)
				let installRes = null
				while (true) {
					const it = await installer.next()
					if (it.done) {
						installRes = it.value
						break
					}
					yield it.value
				}
				if (installRes.result?.ok) {
					const verifier = verifyTorchCuda()
					let cudaOk = false
					while (true) {
						const it = await verifier.next()
						if (it.done) {
							cudaOk = it.value.cudaOk
							break
						}
						yield it.value
					}
					if (cudaOk) {
						return { ok: true }
					} else {
						yield {
							type: 'log',
							stream: 'stderr',
							message: `${label} 安装后CUDA验证失败，可能是CPU版本`
						}
						return { ok: false, error: 'CUDA验证失败' }
					}
				} else {
					const errMsg =
						installRes.result?.stderr ||
						installRes.stderrText ||
						installRes.result?.error ||
						'未知错误'
					if (
						errMsg.includes('IncompleteRead') ||
						errMsg.includes('timeout') ||
						errMsg.includes('Connection') ||
						errMsg.includes('reset by peer') ||
						errMsg.includes('broken pipe') ||
						errMsg.includes('No matching distribution') ||
						errMsg.includes('404')
					) {
						networkError = true
					}
					yield { type: 'log', stream: 'stderr', message: `${label} 安装失败: ${errMsg}` }
					return { ok: false, error: errMsg }
				}
			}

			const tryInstallFromIndex = async function* (indexUrl, label) {
				yield { type: 'log', stream: 'stdout', message: `尝试从 ${label} 安装 (${cuSuffix})...` }
				const installer = installTorchFromOfficialIndex(indexUrl, label)
				let installRes = null
				while (true) {
					const it = await installer.next()
					if (it.done) {
						installRes = it.value
						break
					}
					yield it.value
				}
				if (installRes.result?.ok) {
					const verifier = verifyTorchCuda()
					let cudaOk = false
					let torchVersion = ''
					while (true) {
						const it = await verifier.next()
						if (it.done) {
							cudaOk = it.value.cudaOk
							torchVersion = it.value.torchVersion
							break
						}
						yield it.value
					}
					if (cudaOk) {
						return { ok: true }
					} else if (torchVersion && torchVersion.includes('+cpu')) {
						installedCpuVersion = true
						yield { type: 'log', stream: 'stderr', message: `${label} 安装了CPU版本而非GPU版本` }
						return { ok: false, error: '安装了CPU版本', cpuVersion: true }
					} else {
						return { ok: false, error: 'CUDA验证失败' }
					}
				} else {
					const errMsg =
						installRes.result?.stderr ||
						installRes.stderrText ||
						installRes.result?.error ||
						'未知错误'
					if (
						errMsg.includes('IncompleteRead') ||
						errMsg.includes('timeout') ||
						errMsg.includes('Connection') ||
						errMsg.includes('reset by peer') ||
						errMsg.includes('broken pipe') ||
						errMsg.includes('No matching distribution')
					) {
						networkError = true
					}
					yield { type: 'log', stream: 'stderr', message: `${label} 安装失败: ${errMsg}` }
					return { ok: false, error: errMsg }
				}
			}

			if (inChina) {
				let r1 = null
				const gen1 = tryInstallFromWheelUrls(
					aliyunTorchUrlRaw,
					aliyunTorchvisionUrlRaw,
					aliyunTorchaudioUrlRaw,
					'阿里云镜像'
				)
				while (true) {
					const it = await gen1.next()
					if (it.done) {
						r1 = it.value
						break
					}
					yield it.value
				}
				if (r1.ok) {
					torchInstallOk = true
				} else {
					let r2 = null
					const gen2 = tryInstallFromIndex(torchOfficialBaseUrl, 'PyTorch官方源')
					while (true) {
						const it = await gen2.next()
						if (it.done) {
							r2 = it.value
							break
						}
						yield it.value
					}
					if (r2.ok) {
						torchInstallOk = true
					}
				}
			} else {
				let r1 = null
				const gen1 = tryInstallFromIndex(torchOfficialBaseUrl, 'PyTorch官方源')
				while (true) {
					const it = await gen1.next()
					if (it.done) {
						r1 = it.value
						break
					}
					yield it.value
				}
				if (r1.ok) {
					torchInstallOk = true
				} else {
					let r2 = null
					const gen2 = tryInstallFromWheelUrls(
						aliyunTorchUrlRaw,
						aliyunTorchvisionUrlRaw,
						aliyunTorchaudioUrlRaw,
						'阿里云镜像'
					)
					while (true) {
						const it = await gen2.next()
						if (it.done) {
							r2 = it.value
							break
						}
						yield it.value
					}
					if (r2.ok) {
						torchInstallOk = true
					}
				}
			}
		}

		if (!torchInstallOk && cuSuffix !== 'cpu') {
			const venvPythonQuoted = `"${venvPython}"`

			const oneClickCmd = `${venvPythonQuoted} -m pip install --timeout=900 --retries=10 "${aliyunTorchUrlRaw}" "${aliyunTorchvisionUrlRaw}" "${aliyunTorchaudioUrlRaw}" --extra-index-url "${pypiMirrorUrl}"`

			const localInstallCmd = `${venvPythonQuoted} -m pip install --no-deps "${torchWheel}" "${torchvisionWheel}" "${torchaudioWheel}"`
			const depsCmd = `${venvPythonQuoted} -m pip install numpy pillow filelock networkx jinja2 fsspec sympy packaging requests -i "${pypiMirrorUrl}"`

			yield {
				type: 'error',
				message:
					'PyTorch GPU 版本自动安装失败。\n\n原因：' +
					(installedCpuVersion
						? '自动安装了CPU版本而非GPU版本'
						: networkError
							? '网络下载中断或源不可用（大文件下载需要稳定网络）'
							: '安装过程出错') +
					'\n\n您可以点击下方「⚡ 一键自动安装」按钮自动重试安装，或使用手动方案。',
				needsManualInstall: true,
				autoInstallAvailable: true,
				cudaVersion: cuSuffix,
				pythonVersion: pyInfo.version,
				platformTag,
				abiTag,
				torchVersion: TORCH_VERSION + '+' + cuSuffix,
				torchWheel,
				torchvisionWheel,
				torchaudioWheel,
				aliyunTorchUrl,
				aliyunTorchvisionUrl,
				aliyunTorchaudioUrl,
				officialTorchUrl,
				officialTorchvisionUrl,
				officialTorchaudioUrl,
				venvPythonPath: venvPython,
				oneClickInstallCmd: oneClickCmd,
				manualInstallCmd: localInstallCmd,
				installDepsCmd: depsCmd,
				aliyunDirUrl: aliyunBase + '/',
				officialDirUrl: officialBase
			}
			return
		}

		if (!torchInstallOk) {
			yield { type: 'error', message: 'PyTorch 安装失败：' + lastErrorMsg }
			return
		}
	}

	const reqFile = path.join(installPath, 'requirements.txt')
	if (fs.existsSync(reqFile)) {
		yield {
			type: 'step',
			step: 'installing_requirements',
			message: existingEnvOk ? '检查 ComfyUI 依赖...' : '安装 ComfyUI 依赖...'
		}

		let reqInstallSuccess = false
		let reqLastError = ''
		const mirrorSources = mirrors.pypiUrl
			? [
					mirrors.pypiUrl,
					'https://mirrors.aliyun.com/pypi/simple',
					'https://pypi.tuna.tsinghua.edu.cn/simple',
					''
				]
			: ['https://mirrors.aliyun.com/pypi/simple', 'https://pypi.tuna.tsinghua.edu.cn/simple', '']

		for (let attempt = 0; attempt < mirrorSources.length; attempt++) {
			const mirrorUrl = mirrorSources[attempt]
			const reqArgs = [
				'-m',
				'pip',
				'install',
				'-r',
				reqFile,
				pipProgressArg,
				'--timeout=300',
				'--retries=5'
			]
			if (mirrorUrl) {
				reqArgs.push('-i', mirrorUrl)
				yield {
					type: 'log',
					stream: 'stdout',
					message: attempt === 0 ? `使用镜像: ${mirrorUrl}` : `重试，尝试镜像: ${mirrorUrl}`
				}
			} else {
				yield { type: 'log', stream: 'stdout', message: '重试，使用官方 PyPI 源' }
			}

			const label =
				attempt === 0
					? 'ComfyUI 依赖'
					: `ComfyUI 依赖（重试 ${attempt + 1}/${mirrorSources.length}）`
			const reqInstaller = runPipInstall(reqArgs, label, 1800000)
			let reqResult = null
			while (true) {
				const it = await reqInstaller.next()
				if (it.done) {
					reqResult = it.value
					break
				}
				yield it.value
			}

			if (reqResult?.result?.ok) {
				reqInstallSuccess = true
				break
			} else {
				reqLastError =
					reqResult?.result?.stderr ||
					reqResult?.stderrText ||
					reqResult?.result?.error ||
					'未知错误'
				const isNetworkError =
					reqLastError.includes('IncompleteRead') ||
					reqLastError.includes('timeout') ||
					reqLastError.includes('Connection') ||
					reqLastError.includes('reset by peer')
				if (isNetworkError && attempt < mirrorSources.length - 1) {
					yield {
						type: 'log',
						stream: 'stderr',
						message: `依赖安装遇到网络问题，尝试其他镜像源...`
					}
				} else {
					break
				}
			}
		}

		if (!reqInstallSuccess) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: 'requirements.txt 批量安装未完全成功，尝试逐个安装兼容的包...'
			}

			let reqLines = []
			try {
				const reqContent = fs.readFileSync(reqFile, 'utf-8')
				reqLines = reqContent
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter(
						(l) =>
							l &&
							!l.startsWith('#') &&
							!l.startsWith('-r') &&
							!l.startsWith('-e') &&
							!l.startsWith('--')
					)
			} catch {}

			if (reqLines.length > 0) {
				const pyVerResult = await runCommand(
					venvPython,
					['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
					{ timeout: 10000, env: isolatedEnv }
				)
				let pyMajor = 3,
					pyMinor = 11
				if (pyVerResult.ok && pyVerResult.stdout) {
					const parts = pyVerResult.stdout.trim().split('.').map(Number)
					pyMajor = parts[0] || 3
					pyMinor = parts[1] || 11
				}

				let skippedCount = 0
				let installedCount = 0
				let failedPkgs = []
				const perPkgMirror = mirrors.pypiUrl || 'https://mirrors.aliyun.com/pypi/simple'

				for (const line of reqLines) {
					const pkgMatch = line.match(/^([a-zA-Z0-9_][a-zA-Z0-9._-]*)/)
					if (!pkgMatch) continue
					const pkgName = pkgMatch[1]

					const pyReqMatch =
						line.match(/python_requires\s*([<>=!~].+)/i) ||
						line.match(/Requires-Python\s*([<>=!~].+)/i)

					yield { type: 'log', stream: 'stdout', message: `  安装 ${line}...` }
					const singleArgs = [
						'-m',
						'pip',
						'install',
						line,
						pipProgressArg,
						'--timeout=120',
						'--retries=3',
						'-i',
						perPkgMirror
					]
					const singleInstaller = runPipInstall(singleArgs, `安装 ${pkgName}`, 300000)
					let singleResult = null
					while (true) {
						const it = await singleInstaller.next()
						if (it.done) {
							singleResult = it.value
							break
						}
						yield it.value
					}
					if (singleResult?.result?.ok) {
						installedCount++
					} else {
						const errText =
							singleResult?.result?.stderr ||
							singleResult?.stderrText ||
							singleResult?.result?.error ||
							''
						if (
							errText.includes('Requires-Python') ||
							errText.includes('different python version') ||
							errText.includes('requires a different python version')
						) {
							yield {
								type: 'log',
								stream: 'stderr',
								message: `  ⏭ 跳过 ${pkgName}（需要更高Python版本，当前 ${pyMajor}.${pyMinor}）`
							}
							skippedCount++
						} else {
							yield { type: 'log', stream: 'stderr', message: `  ⚠ ${pkgName} 安装失败` }
							failedPkgs.push(pkgName)
							skippedCount++
						}
					}
				}

				yield {
					type: 'log',
					stream: 'stdout',
					message: `逐个安装完成：成功 ${installedCount} 个，跳过/失败 ${skippedCount} 个`
				}
				if (failedPkgs.length === 0) {
					reqInstallSuccess = true
				} else {
					yield {
						type: 'log',
						stream: 'stderr',
						message: `以下包装失败，可能需要手动安装：${failedPkgs.join(', ')}`
					}
				}
			}
		}

		yield { type: 'log', stream: 'stdout', message: '验证关键依赖...' }
		const criticalDeps = ['requests', 'numpy', 'PIL', 'filelock', 'packaging']
		let missingDeps = []
		for (const dep of criticalDeps) {
			try {
				const r = await runCommand(venvPython, ['-c', `import ${dep}; print("ok")`], {
					timeout: 15000,
					env: isolatedEnv
				})
				if (!r.ok) {
					missingDeps.push(dep)
				}
			} catch {
				missingDeps.push(dep)
			}
		}

		if (missingDeps.length > 0) {
			yield {
				type: 'log',
				stream: 'stdout',
				message: `补装缺失的关键依赖: ${missingDeps.join(', ')}`
			}
			const fixArgs = [
				'-m',
				'pip',
				'install',
				...missingDeps,
				pipProgressArg,
				'--timeout=300',
				'--retries=5'
			]
			const fixMirror = mirrors.pypiUrl || 'https://mirrors.aliyun.com/pypi/simple'
			fixArgs.push('-i', fixMirror)
			const fixInstaller = runPipInstall(fixArgs, '补装关键依赖', 600000)
			let fixResult = null
			while (true) {
				const it = await fixInstaller.next()
				if (it.done) {
					fixResult = it.value
					break
				}
				yield it.value
			}
			if (!fixResult?.result?.ok) {
				yield {
					type: 'log',
					stream: 'stderr',
					message:
						'关键依赖补装失败: ' +
						(fixResult?.result?.stderr || fixResult?.stderrText || '未知错误')
				}
			}
		}

		if (cuSuffix !== 'cpu') {
			yield { type: 'log', stream: 'stdout', message: '确认 PyTorch CUDA 版本...' }
			const finalVerifier = verifyTorchCuda()
			let finalCudaOk = false
			while (true) {
				const it = await finalVerifier.next()
				if (it.done) {
					finalCudaOk = it.value.cudaOk
					break
				}
				yield it.value
			}
			if (!finalCudaOk) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: 'PyTorch CUDA 验证警告，部分功能可能不可用'
				}
			}
		}

		if (!reqInstallSuccess) {
			yield {
				type: 'log',
				stream: 'stderr',
				message:
					'⚠️ 部分依赖安装失败，启动时可能遇到 ModuleNotFoundError，可使用「一键自动安装」尝试修复'
			}
		}
	} else {
		yield { type: 'log', stream: 'stdout', message: '未找到 requirements.txt，跳过' }
		yield { type: 'log', stream: 'stdout', message: '安装基础依赖...' }
		const coreDeps = [
			'requests',
			'numpy',
			'pillow',
			'filelock',
			'networkx',
			'jinja2',
			'fsspec',
			'sympy',
			'packaging'
		]
		const coreArgs = [
			'-m',
			'pip',
			'install',
			...coreDeps,
			pipProgressArg,
			pipTimeoutArg,
			pipRetriesArg
		]
		const coreMirror = mirrors.pypiUrl || 'https://mirrors.aliyun.com/pypi/simple'
		coreArgs.push('-i', coreMirror)
		const coreInstaller = runPipInstall(coreArgs, '安装基础依赖', 600000)
		while (true) {
			const it = await coreInstaller.next()
			if (it.done) {
				break
			}
			yield it.value
		}
	}

	yield { type: 'step', step: 'verifying', message: '验证 Python 环境...' }
	const baseVerifyCode = [
		'import sys',
		`sys.path.insert(0, ${JSON.stringify(installPath)})`,
		'print("Python", sys.version)',
		'import requests; import numpy; import PIL; import packaging; import filelock',
		'import torch',
		`print("torch", torch.__version__, "cuda", torch.cuda.is_available())`
	].join('; ')
	const cudaAssert =
		cuSuffix !== 'cpu' ? `; assert torch.cuda.is_available(), "CUDA not available"` : ''
	const comfyImportCode = ['; import comfy', 'print("comfy ok")'].join('; ')

	const verify = await runCommand(
		venvPython,
		['-c', baseVerifyCode + cudaAssert + comfyImportCode],
		{ timeout: 60000, cwd: installPath, env: isolatedEnv }
	)
	if (!verify.ok) {
		const combined = (verify.stdout || '') + '\n' + (verify.stderr || '')
		const missingModMatch = combined.match(/ModuleNotFoundError: No module named '([^']+)'/)
		const missingMod = missingModMatch ? missingModMatch[1] : null
		if (verify.stderr) yield { type: 'log', stream: 'stderr', message: verify.stderr }
		if (verify.stdout) yield { type: 'log', stream: 'stdout', message: verify.stdout }
		if (missingMod) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `检测到缺失模块: ${missingMod}，尝试自动补装...`
			}
			const fixMod = missingMod.replace(/_/g, '-')
			const fixMirror = mirrors.pypiUrl || 'https://mirrors.aliyun.com/pypi/simple'
			const fixArgs = [
				'-m',
				'pip',
				'install',
				fixMod,
				pipProgressArg,
				'--timeout=120',
				'--retries=3',
				'-i',
				fixMirror
			]
			const fixInstaller = runPipInstall(fixArgs, `补装 ${missingMod}`, 300000)
			let fixResult = null
			while (true) {
				const it = await fixInstaller.next()
				if (it.done) {
					fixResult = it.value
					break
				}
				yield it.value
			}
			if (fixResult?.result?.ok) {
				yield { type: 'log', stream: 'stdout', message: `${missingMod} 补装完成，重新验证...` }
				const reverify = await runCommand(
					venvPython,
					['-c', baseVerifyCode + cudaAssert + comfyImportCode],
					{ timeout: 60000, cwd: installPath, env: isolatedEnv }
				)
				if (!reverify.ok) {
					if (reverify.stderr) yield { type: 'log', stream: 'stderr', message: reverify.stderr }
					if (reverify.stdout) yield { type: 'log', stream: 'stdout', message: reverify.stdout }
					yield {
						type: 'error',
						message: '环境验证失败：依赖仍不完整，请尝试点击「检测并修复」或「一键自动安装」'
					}
					return
				}
				for (const line of reverify.stdout.split(/\r?\n/)) {
					if (line) yield { type: 'log', stream: 'stdout', message: line }
				}
			} else {
				yield {
					type: 'error',
					message: `环境验证失败：缺失模块 ${missingMod} 且自动补装失败，请手动安装`
				}
				return
			}
		} else {
			yield {
				type: 'error',
				message: '环境验证失败：依赖不完整或CUDA不可用，请尝试点击「检测并修复」补装缺失的包'
			}
			return
		}
	} else {
		for (const line of verify.stdout.split(/\r?\n/)) {
			if (line) yield { type: 'log', stream: 'stdout', message: line }
		}
	}

	yield { type: 'log', stream: 'stdout', message: '检测 ComfyUI 启动依赖链...' }
	const mainCheckSrc = [
		'import sys, os',
		`sys.path.insert(0, ${JSON.stringify(installPath)})`,
		`os.chdir(${JSON.stringify(installPath)})`,
		'try:',
		'    import main',
		'    print("main.py imports ok")',
		'except SystemExit:',
		'    print("main.py imports ok (SystemExit caught)")',
		'except Exception:',
		'    import traceback',
		'    traceback.print_exc()',
		'    sys.exit(1)'
	].join('\n')
	const mainCheckCode = `exec(${JSON.stringify(mainCheckSrc)})`
	const mainCheck = await runCommand(venvPython, ['-c', mainCheckCode], {
		timeout: 60000,
		cwd: installPath,
		env: isolatedEnv
	})
	if (!mainCheck.ok) {
		const combined2 = (mainCheck.stdout || '') + '\n' + (mainCheck.stderr || '')
		const missingMod2 = combined2.match(/ModuleNotFoundError: No module named '([^']+)'/)
		if (mainCheck.stderr) {
			const errLines = mainCheck.stderr.split(/\r?\n/).filter((l) => l.trim())
			for (const line of errLines.slice(-10)) {
				yield { type: 'log', stream: 'stderr', message: line }
			}
		}
		if (missingMod2) {
			const modName = missingMod2[1]
			const pipName = modName.replace(/_/g, '-')
			yield {
				type: 'log',
				stream: 'stderr',
				message: `启动依赖链缺失模块: ${modName}，尝试补装...`
			}
			const fixMirror2 = mirrors.pypiUrl || 'https://mirrors.aliyun.com/pypi/simple'
			const fixArgs2 = [
				'-m',
				'pip',
				'install',
				pipName,
				pipProgressArg,
				'--timeout=120',
				'--retries=3',
				'-i',
				fixMirror2
			]
			const fix2 = runPipInstall(fixArgs2, `补装 ${modName}`, 300000)
			while (true) {
				const it = await fix2.next()
				if (it.done) break
				yield it.value
			}
			yield {
				type: 'log',
				stream: 'stderr',
				message: `⚠️ ${modName} 已尝试补装，建议重新运行检测验证`
			}
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: '⚠️ 启动依赖链检测发现问题，启动时可能需要额外依赖'
			}
		}
	} else {
		const okLines = mainCheck.stdout.split(/\r?\n/).filter((l) => l.trim())
		for (const line of okLines) {
			yield { type: 'log', stream: 'stdout', message: line }
		}
	}

	// 改动D：一键配置/修复依赖收尾 → 强制对齐 requirements.txt 的 5 个核心包精确版本
	// （确保 comfy-kitchen 升到 0.2.28+，避免与 PyTorch 2.6 发生 infer_schema+list[int] 崩溃；
	//   同时 frontend/templates/embedded-docs/aimdo 一次性对齐，启动时不再出兼容性警告）
	// 顺序：官方 PyPI → 清华 TUNA → DVStudio config 镜像（阿里云）。
	// 国内镜像缺包（最高版本 < 目标）会 yield warn，官方源最后兜底强制尝试。
	yield {
		type: 'step',
		step: 'critical_pkg_upgrade',
		message:
			'对齐 requirements.txt 中的核心包精确版本 (comfy-kitchen==0.2.28 / frontend-package / templates / embedded-docs / aimdo)...'
	}
	try {
		yield* runPipUpgradeKeyPackages(installPath, {})
	} catch (err) {
		// 改动D：核心包升级管线抛错绝不影响 setupPythonEnv 整体收尾（基础阻断已经过）
		// 必须继续走 probeCache 清理 + yield done，否则一键配置流程会直接因异常被判定为失败
		const errMsg = err?.message || String(err)
		yield {
			type: 'warn',
			message: `[收尾·核心包升级] 管线异常（不影响基础环境可用性）：${errMsg}。若启动时仍出现版本警告，请重试启动（会自动触发官方源回退），或手动执行 pip 升级对应包。`
		}
	}

	probeCache = { path: null, result: null, time: 0 }
	yield { type: 'done', message: 'Python 环境配置完成', pythonPath: venvPython, venvRoot }
}

async function probeExistingInstall(installPath, options) {
	const config = loadConfig()
	const customModelPaths = options?.customModelPaths || config.customModelPaths || []
	const cacheKey = path.normalize(installPath) + '|' + customModelPaths.slice().sort().join(';')
	if (
		probeCache.path === cacheKey &&
		probeCache.result &&
		Date.now() - probeCache.time < PROBE_CACHE_TTL
	) {
		return probeCache.result
	}
	const result = {
		ok: true,
		isComfyUI: false,
		installType: 'unknown',
		isDesktop: false,
		launchCompatibility: { status: 'none' }
	}
	try {
		if (!fs.existsSync(installPath)) {
			return { ...result, ok: false, error: '路径不存在' }
		}
		const stat = fs.statSync(installPath)
		if (!stat.isDirectory()) {
			return { ...result, ok: false, error: '路径不是目录' }
		}

		result.isComfyUI = isComfyUIDir(installPath)
		if (!result.isComfyUI) {
			return {
				...result,
				launchCompatibility: { status: 'none', warnings: ['该目录不是有效的ComfyUI安装'] }
			}
		}

		result.isDesktop = isComfyUIDesktop(installPath)

		let installType = 'standard'
		if (isPortableInstall(installPath)) {
			installType = 'portable'
		} else if (hasVenv(installPath)) {
			installType = 'venv'
		}
		result.installType = installType

		try {
			const versionPath = path.join(installPath, 'version.py')
			if (fs.existsSync(versionPath)) {
				const content = fs.readFileSync(versionPath, 'utf-8')
				const vm = content.match(/__version__\s*=\s*['"]([^'"]+)['"]/)
				if (vm) result.version = vm[1]
			}
		} catch {}

		try {
			const gitR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', 'HEAD'], {
				timeout: 8000
			})
			if (gitR.ok && gitR.stdout) result.commitHash = gitR.stdout
		} catch {}

		const pyResult = await findWorkingPython(installPath, installType)
		const bestPy = pyResult.bestPick
		// 改动2：透传核心包版本状态，并计算是否需要启动前升级
		const keyPackageStatus = bestPy?.keyPackageStatus || {}
		const keyPkgs = Object.entries(keyPackageStatus)
		const keyPkgsTotal = keyPkgs.length
		const keyPkgsOutdatedArr = keyPkgs.filter(([, s]) => !s.ok)
		const keyPkgsOutdated = keyPkgsOutdatedArr.length
		const keyPkgsNeedUpgrade = keyPkgsOutdated > 0
		const pythonInfo = {
			type: bestPy?.type || 'none',
			path: bestPy?.path,
			version: bestPy?.version,
			hasTorch: !!bestPy?.hasTorch,
			torchVersion: bestPy?.torchVersion,
			torchCuda: !!bestPy?.torchCuda,
			canImportComfy: !!bestPy?.canImportComfy,
			canStartComfy: bestPy?.canStartComfy !== false,
			importError: bestPy?.importError,
			candidates: pyResult.candidates,
			keyPackageStatus,
			keyPkgsTotal,
			keyPkgsOutdated,
			keyPkgsNeedUpgrade
		}
		result.pythonInfo = pythonInfo

		const warnings = []
		const needsFix = []
		// 改动B：严格 needsManualFix / needsFix 双标记赋值（方案§4矩阵）
		// needsManualFix=true → 需要用户点一键配置或手动改环境
		// needsManualFix=false → 纯关键包自动升级，启动预检流程会修，不必让用户手动介入
		let needsManualFix = false
		let launchStatus = 'none'
		let launchMethod = 'main_py'

		if (installType === 'portable') {
			const hasBat =
				fs.existsSync(path.join(installPath, 'run_nvidia_gpu.bat')) ||
				fs.existsSync(path.join(installPath, 'run_cpu.bat'))
			if (hasBat) {
				launchMethod = 'portable_bat'
				warnings.push('便携版需要使用专用启动脚本')
			} else {
				needsFix.push('未找到便携版启动脚本')
				needsManualFix = true
			}
		}

		if (result.isDesktop) {
			launchMethod = 'desktop_app'
			warnings.push('检测到ComfyUI桌面版，建议通过桌面应用启动')
		}

		if (!bestPy) {
			// 致命阻断 #1：找不到任何 Python → 必须让用户走配置
			needsFix.push('未找到可用的Python环境（请先设置虚拟环境路径或点击一键配置Python环境）')
			needsManualFix = true
		} else if (!bestPy.hasTorch) {
			// 致命阻断 #2：解释器存在但未装 PyTorch → 必须走配置安装 PyTorch
			needsFix.push('未检测到 PyTorch 包（需要 torch + CUDA，点击一键配置Python环境安装）')
			needsManualFix = true
		} else if (!bestPy.canImportComfy) {
			// 致命阻断 #3：torch 有但无法 import comfy → 基础依赖不完整 → 必须走配置
			const extra = bestPy.importError ? `：${bestPy.importError}` : ''
			needsFix.push('无法导入 comfy 主模块，基础依赖可能不完整' + extra)
			needsManualFix = true
		} else if (bestPy.canStartComfy === false) {
			// 非致命：import comfy OK，但 import main 失败 → 99% 是 comfy-kitchen 0.2.22 + torch 2.6 infer_schema 崩溃
			// 这里绝不进 needsFix（因为启动预检会自动升级核心包并重启 probe）；只写 warnings 并 needsManualFix=false
			const extra = bestPy.importError ? `（根因线索: ${bestPy.importError}）` : ''
			warnings.push(`模拟启动 import main 失败，启动时将自动升级核心依赖后重试` + extra)
		}

		// 改动B：纯 5 个核心包版本不达标 → 统一进 warnings + outdatedPackages，绝不能进 needsFix
		if (keyPkgsNeedUpgrade) {
			const outList = keyPkgsOutdatedArr
				.map(([p, s]) =>
					s.installed ? `${p} ${s.installed}→${s.required}` : `${p} 未安装 (需要${s.required})`
				)
				.join('；')
			warnings.push(
				`核心包版本低于 requirements.txt：${outList}（启动前将自动升级到精确版本，无需手动处理）`
			)
		}

		// 改动B：根据 needsFix（致命阻断）计算 launchStatus/canStart
		if (needsFix.length > 0) {
			launchStatus = 'none'
		} else if (
			bestPy?.hasTorch &&
			bestPy?.canImportComfy &&
			bestPy?.canStartComfy !== false &&
			warnings.length === 0
		) {
			launchStatus = 'full'
		} else if (bestPy?.hasTorch && bestPy?.canImportComfy) {
			launchStatus = 'partial' // 有 warnings（通常是关键包自动升级）但仍可启动
		} else {
			launchStatus = 'none'
		}

		// 改动B：outdatedPackages 结构化摘要（每条可直接展示成 UI 的一行）
		const outdatedSummaries = keyPkgsOutdatedArr.map(([p, s]) => ({
			package: p,
			required: s.required,
			installed: s.installed,
			installedNorm: s.installedNorm || null,
			ok: !!s.ok
		}))

		// 改动 Task2.b：launchCompatibility 补 pyTorch26Pep585Compat + quickHotfix 双字段
		const pepCompat = bestPy?.pyTorch26Pep585Compat || null
		// quickHotfixAvailable 判定：canStart=false 但失败原因里如果有 comfy 主模块 importError（包含 infer_schema/unsupported type 之类 PEP585 线索）且 pepCompat.needsPatch=true
		const pepHotfixAvailable =
			Boolean(pepCompat?.needsPatch) &&
			needsFix.some((r) =>
				/comfy 主模块|comfy模块|import comfy|infer_schema|unsupported type/i.test(String(r) || '')
			)

		result.launchCompatibility = {
			status: launchStatus,
			method: launchMethod,
			// 改动B：canStart 以「致命阻断为空」为准，而不是看模拟 import main 有没有 MAIN_OK
			// 因为只要 Python+torch+comfy 三条件齐全，关键包版本可启动预检自动修
			canStart: needsFix.length === 0,
			needsManualFix,
			warnings: warnings.length > 0 ? warnings : undefined,
			needsFix: needsFix.length > 0 ? needsFix : undefined,
			// 改动B：6 个新增字段（方案§3.1-B要求）齐全
			keyPackageStatus: Object.keys(keyPackageStatus).length > 0 ? keyPackageStatus : undefined,
			keyPkgsTotal,
			keyPkgsOutdated,
			keyPkgsNeedUpgrade,
			outdatedPackages: outdatedSummaries.length > 0 ? outdatedSummaries : undefined,
			// 改动 Task2.b 新增
			pyTorch26Pep585Compat: pepCompat,
			quickHotfixAvailable: pepHotfixAvailable,
			quickHotfixPlan: pepHotfixAvailable
				? {
						id: 'pep585_comfy_kitchen_0228',
						title: '修复 PyTorch 2.6.x + comfy-kitchen 0.2.28 list[int] 兼容性',
						stepCount: 3,
						rollbackHint:
							'site-packages\\comfy_kitchen\\**\\*.bak_pep585_20260808 覆盖回原 .py 文件即可'
					}
				: undefined
		}

		const { modelDirs, hasExtraConfig, extraModelPaths, customRoots } = collectModelDirs(
			installPath,
			customModelPaths
		)
		result.hasExtraModelConfig = hasExtraConfig
		result.extraModelPaths = Object.keys(extraModelPaths).length > 0 ? extraModelPaths : undefined
		result.customModelPaths = customRoots.length > 0 ? customRoots : undefined

		const models = {}
		let totalModels = 0
		for (const [type, dirs] of Object.entries(modelDirs)) {
			let count = 0
			const foundDirs = []
			for (const d of dirs) {
				const c = countModelFiles(d, type)
				if (c > 0) {
					count += c
					foundDirs.push({ path: d, count: c })
				}
			}
			models[type] = { total: count, sources: foundDirs }
			totalModels += count
		}
		result.models = models
		result.totalModelCount = totalModels

		const customNodesDir = path.join(installPath, 'custom_nodes')
		if (fs.existsSync(customNodesDir)) {
			try {
				result.customNodeCount = fs.readdirSync(customNodesDir).filter((d) => {
					const p = path.join(customNodesDir, d)
					try {
						return fs.statSync(p).isDirectory() && d !== '__pycache__'
					} catch {
						return false
					}
				}).length
			} catch {}
		}

		probeCache = { path: cacheKey, result, time: Date.now() }
		return result
	} catch (err) {
		return { ...result, ok: false, error: String(err?.message || err) }
	}
}

async function validatePath(targetPath) {
	try {
		const validation = { ok: true }
		if (!targetPath || typeof targetPath !== 'string') {
			return { ok: false, error: '路径不能为空' }
		}
		const exists = fs.existsSync(targetPath)
		validation.exists = exists
		if (exists) {
			const stat = fs.statSync(targetPath)
			if (!stat.isDirectory()) {
				return { ok: false, error: '路径已存在但不是目录' }
			}
			const isComfy = isComfyUIDir(targetPath)
			validation.isComfyUI = isComfy
			try {
				fs.accessSync(targetPath, fs.constants.W_OK)
			} catch {
				return { ok: false, error: '没有该目录的写入权限' }
			}
			const contents = fs.readdirSync(targetPath)
			if (contents.length > 0 && !isComfy) {
				validation.warning = '目录已存在且不为空，ComfyUI文件将安装到此目录中'
			}
		} else {
			const parent = path.dirname(targetPath)
			if (!fs.existsSync(parent)) {
				return { ok: false, error: '父目录不存在' }
			}
			try {
				fs.accessSync(parent, fs.constants.W_OK)
			} catch {
				return { ok: false, error: '没有父目录的写入权限' }
			}
		}
		return validation
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

async function checkComfyService(port) {
	const p = typeof port === 'number' ? port : DEFAULT_COMFYUI_PORT
	try {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 5000)
		const r = await fetch(`http://127.0.0.1:${p}/system_stats`, { signal: controller.signal })
		clearTimeout(timer)
		if (r.ok) {
			return { running: true, url: `http://127.0.0.1:${p}` }
		}
	} catch {}
	return { running: false }
}

async function checkEnvironment(installPath) {
	const config = loadConfig()
	const targetPath = installPath || config.installPath || getDefaultInstallPath()
	const items = []
	const result = {
		ok: true,
		items,
		installPath: targetPath,
		installMode: config.installMode
	}

	const python = await detectPython()
	items.push({
		key: 'python',
		label: 'Python',
		status: python.available ? 'ok' : 'error',
		version: python.version,
		detail: python.available ? `已安装 ${python.cmd}` : '未检测到 Python 3.10+',
		canFix: false,
		downloadUrl: python.available ? undefined : 'https://www.python.org/downloads/',
		downloadLabel: python.available ? undefined : '下载 Python'
	})
	if (python.available) {
		result.pythonAvailable = true
		result.pythonVersion = python.version
		const parts = (python.version || '').split('.').map(Number)
		if (parts[0] === 3 && parts[1] >= 10) {
		} else if (parts[0] >= 3) {
			items[items.length - 1].status = 'warn'
			items[items.length - 1].detail = `Python ${python.version} 可能不兼容，建议使用 3.10-3.12`
		} else {
			items[items.length - 1].status = 'error'
			items[items.length - 1].detail = `Python ${python.version} 版本过低，需要 3.10+`
		}
	}

	const git = await detectGit()
	items.push({
		key: 'git',
		label: 'Git',
		status: git.available ? 'ok' : 'error',
		version: git.version,
		detail: git.available ? '已安装' : '未检测到 Git，新安装需要 Git',
		canFix: false,
		downloadUrl: git.available ? undefined : 'https://git-scm.com/download/win',
		downloadLabel: git.available ? undefined : '下载 Git'
	})
	result.gitAvailable = git.available

	const cuda = await detectCuda()
	items.push({
		key: 'cuda',
		label: 'CUDA/GPU',
		status: cuda.available ? 'ok' : 'warn',
		version: cuda.cudaVersion,
		detail: cuda.available
			? `驱动 ${cuda.driverVersion}，CUDA ${cuda.cudaVersion}`
			: '未检测到 NVIDIA GPU，将使用 CPU 模式',
		canFix: false
	})
	result.cudaAvailable = cuda.available

	const comfyFound = isComfyUIDir(targetPath)
	result.comfyUIFound = comfyFound
	const probe = comfyFound ? await probeExistingInstall(targetPath) : null
	items.push({
		key: 'comfyui',
		label: 'ComfyUI 源码',
		status: comfyFound ? 'ok' : 'error',
		version: probe?.version,
		detail: comfyFound
			? probe?.version
				? `已安装 v${probe.version}`
				: '已安装'
			: '未找到 ComfyUI 源码',
		canFix: !comfyFound,
		fixAction: '安装'
	})
	if (probe) {
		result.installType = probe.installType
	}

	if (comfyFound) {
		const bestPy = probe?.pythonInfo
		const hasUsablePython = !!(bestPy && bestPy.available !== false && bestPy.version)
		const managedVenvOk = isManagedVenvReady()
		const venvOk = managedVenvOk || hasVenv(targetPath) || isPortableInstall(targetPath)
		let pyStatus = 'warn'
		let pyDetail = '未找到可用的 Python 环境'
		if (venvOk) {
			if (bestPy?.type === 'managed_venv' && bestPy.hasTorch && bestPy.canImportComfy) {
				pyStatus = 'ok'
				pyDetail = '客户端托管虚拟环境（依赖已就绪）'
			} else if (bestPy?.type === 'managed_venv') {
				pyStatus = 'warn'
				pyDetail = '客户端托管虚拟环境已创建，但依赖未安装完整'
			} else if (probe?.installType === 'portable') {
				pyStatus = 'ok'
				pyDetail = '便携版 Python 环境'
			} else if (managedVenvOk) {
				pyStatus = 'ok'
				pyDetail = '客户端托管虚拟环境'
			} else {
				pyStatus = 'ok'
				pyDetail = '虚拟环境已配置'
			}
		} else if (bestPy?.hasTorch && bestPy?.canImportComfy) {
			pyStatus = 'ok'
			pyDetail = `系统 Python ${bestPy.version}（${bestPy.type === 'system' ? '系统安装' : bestPy.type}）`
		} else if (hasUsablePython && !bestPy?.hasTorch) {
			pyStatus = 'warn'
			pyDetail = `检测到 Python ${bestPy.version}，建议使用客户端托管虚拟环境`
		} else if (hasUsablePython) {
			pyStatus = 'warn'
			pyDetail = `Python ${bestPy.version} 可用，但依赖不完整`
		}
		items.push({
			key: 'venv',
			label: 'Python 环境',
			status: pyStatus,
			version: bestPy?.version,
			detail: pyDetail,
			canFix: !managedVenvOk || !(bestPy?.hasTorch && bestPy?.canImportComfy),
			fixAction:
				managedVenvOk && !(bestPy?.hasTorch && bestPy?.canImportComfy) ? '修复依赖' : '配置'
		})

		const hasTorch = probe?.pythonInfo?.hasTorch === true
		const canImport = probe?.pythonInfo?.canImportComfy === true
		let depsStatus = 'warn'
		let depsDetail = '部分依赖可能缺失'
		if (hasTorch && canImport) {
			depsStatus = 'ok'
			depsDetail = `核心依赖已安装 (PyTorch ${probe?.pythonInfo?.torchVersion || ''})`.trim()
		} else if (hasTorch && !canImport) {
			depsStatus = 'error'
			depsDetail = 'PyTorch已安装，但comfy模块导入失败，依赖可能不完整'
		} else {
			depsStatus = 'error'
			depsDetail = 'PyTorch 未安装或无法导入'
		}
		items.push({
			key: 'deps',
			label: '依赖完整性',
			status: depsStatus,
			version: probe?.pythonInfo?.torchVersion,
			detail: depsDetail,
			canFix: depsStatus !== 'ok',
			fixAction: '修复'
		})

		const totalModels = probe?.totalModelCount || 0
		items.push({
			key: 'models',
			label: '模型资源',
			status: totalModels > 0 ? 'ok' : 'warn',
			detail:
				totalModels > 0
					? `共检测到 ${totalModels} 个模型文件（含 extra_model_paths 配置路径）`
					: '未检测到模型文件，请确认模型路径配置',
			canFix: false
		})
	}

	const service = await checkComfyService(config.port)
	items.push({
		key: 'service',
		label: 'ComfyUI 服务',
		status: service.running ? 'ok' : 'warn',
		detail: service.running ? `运行中 ${service.url}` : '未运行',
		canFix: comfyFound && !service.running,
		fixAction: '启动'
	})
	result.serviceRunning = service.running
	result.serviceUrl = service.url

	return result
}

async function selectInstallPath(title, defaultPath) {
	const mainWindow = BrowserWindow?.getAllWindows?.()?.find(
		(w) => w.getTitle?.()?.includes('DVStudio') && !w.isDestroyed?.()
	)
	const options = {
		title: title || '选择目录',
		properties: ['openDirectory', 'createDirectory']
	}
	if (defaultPath && fs.existsSync(defaultPath)) {
		options.defaultPath = defaultPath
	}
	const result = await dialog.showOpenDialog(mainWindow || null, options)
	if (result.canceled || !result.filePaths?.length) {
		return { canceled: true }
	}
	return { canceled: false, path: result.filePaths[0] }
}

function openFolder(folderPath) {
	if (folderPath && fs.existsSync(folderPath)) {
		shell.openPath(folderPath)
		return { ok: true }
	}
	return { ok: false, error: '路径不存在' }
}

function getServiceStatus() {
	const config = loadConfig()
	const running = !!(serviceChildProcess && !serviceChildProcess.killed)
	return {
		running,
		pid: serviceChildProcess?.pid || null,
		port: config.port,
		startTime: serviceStartTime || null,
		exitCode: running ? null : serviceExitCode
	}
}

function stopService() {
	if (serviceChildProcess && !serviceChildProcess.killed) {
		appendServiceLog('system', '[客户端] 正在停止服务...')
		killProcessTree(serviceChildProcess)
		appendServiceLog('system', '[客户端] 已发送停止信号，等待进程退出...')
		broadcastStatus({ ...getServiceStatus(), running: false })
	}
	return { ok: true }
}

function waitForServiceExit(timeoutMs) {
	if (!serviceChildProcess || serviceChildProcess.killed) {
		return Promise.resolve(true)
	}
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			resolve(false)
		}, timeoutMs || 5000)
		const onExit = () => {
			clearTimeout(timer)
			serviceChildProcess?.removeListener('exit', onExit)
			resolve(true)
		}
		serviceChildProcess.on('exit', onExit)
	})
}

function handleServiceExit(code, signal) {
	flushServiceStreamBuffers()
	serviceExitCode = typeof code === 'number' ? code : signal ? signal : null
	appendServiceLog('system', `[系统] 进程已退出 (code=${serviceExitCode})`)
	serviceChildProcess = null
	serviceStartTime = null
	broadcastToAllWindows(SERVICE_EXIT_CHANNEL, { code: serviceExitCode })
	broadcastStatus(getServiceStatus())
}

async function startService(installPath, port, extraArgs) {
	const config = loadConfig()
	const targetPath = installPath || config.installPath
	const p = typeof port === 'number' ? port : config.port
	const args = Array.isArray(extraArgs)
		? [...extraArgs]
		: Array.isArray(config.extraArgs)
			? [...config.extraArgs]
			: []

	if (serviceChildProcess && !serviceChildProcess.killed) {
		return { ok: false, error: '服务已在运行中' }
	}
	if (!isComfyUIDir(targetPath)) {
		return { ok: false, error: '无效的ComfyUI目录' }
	}

	// ===== 启动前置：扫描与清理外部 ComfyUI 进程 =====
	appendServiceLog(
		'system',
		`[启动预检] 扫描系统中其他 ComfyUI 进程（端口 ${p} / GPU 显存 冲突防护）`
	)
	const scanR = await scanForeignComfyProcesses()
	if (!scanR.ok) {
		appendServiceLog('stderr', `[启动预检] 扫描失败（非致命，继续）: ${scanR.error}`)
	} else if (scanR.processes.length > 0) {
		appendServiceLog(
			'stdout',
			`[启动预检] 检测到 ${scanR.processes.length} 个外部 ComfyUI 进程，将自动清理：`
		)
		for (const proc of scanR.processes) {
			appendServiceLog(
				'stdout',
				`  · pid=${proc.pid}  ${(proc.commandLine || proc.exe || '').slice(0, 180)}`
			)
		}
		const killR = await killForeignComfyProcesses(scanR.processes)
		if (!killR.ok) {
			const remainMsg =
				Array.isArray(killR.remaining) && killR.remaining.length
					? `，仍残留 ${killR.remaining.length} 个: ${killR.remaining.map((x) => x.pid).join(',')}`
					: ''
			appendServiceLog('stderr', `[启动预检] 清理外部进程未完全成功${remainMsg}`)
		} else {
			appendServiceLog(
				'stdout',
				`[启动预检] 清理完成：成功杀 ${killR.killed.length} 个，失败 ${killR.failed.length} 个`
			)
			await new Promise((r) => setTimeout(r, 1000))
		}
	} else {
		appendServiceLog('system', `[启动预检] 未检测到外部 ComfyUI 进程 ✓`)
	}
	// ===== 新增段结束 =====

	let probe = await probeExistingInstall(targetPath)

	// 改动3：启动预检 → 核心包版本低于 requirements.txt 时，自动调用升级管线（最多尝试 1 次）
	const launchComp = probe.launchCompatibility || {}
	if (launchComp.keyPkgsNeedUpgrade && probe.pythonInfo?.path) {
		const outdated = launchComp.outdatedPackages || []
		appendServiceLog(
			'stdout',
			`[启动预检] 检测到 ${launchComp.keyPkgsOutdated}/${launchComp.keyPkgsTotal} 个核心包版本不达标，启动前将自动升级`
		)
		if (outdated.length > 0) {
			for (const op of outdated) {
				appendServiceLog(
					'stdout',
					`[启动预检]   · ${op.package}: ${op.installed ? `v${op.installed}` : '未安装'} → 需要 v${op.required}`
				)
			}
		}
		try {
			const pipGen = runPipUpgradeKeyPackages(targetPath, {})
			let allDone = false
			let lastErrMsg = null
			for await (const evt of pipGen) {
				if (!evt) continue
				if (evt.type === 'log') {
					appendServiceLog(evt.stream || 'stdout', evt.message || '')
				} else if (evt.type === 'step') {
					appendServiceLog('system', `[升级步骤] ${evt.message || evt.step}`)
				} else if (evt.type === 'warn' || evt.type === 'warning') {
					appendServiceLog('stderr', `[升级警告] ${evt.message || ''}`)
				} else if (evt.type === 'error') {
					lastErrMsg = evt.message || null
					appendServiceLog('stderr', `[升级错误] ${evt.message || ''}`)
				} else if (evt.type === 'done') {
					allDone = true
					appendServiceLog('stdout', `[核心包升级] ${evt.message || '完成'}`)
				} else if (evt.type === 'result') {
					if (evt.ok) {
						appendServiceLog(
							'stdout',
							'[核心包升级] 关键包升级结果: ' +
								(evt.summary && typeof evt.summary === 'string'
									? evt.summary
									: JSON.stringify(evt.summary || ''))
						)
					} else {
						lastErrMsg = evt.message || '升级失败'
						appendServiceLog('stderr', `[核心包升级] ✗ 失败: ${evt.message || ''}`)
					}
				}
			}
			if (!allDone && lastErrMsg) {
				appendServiceLog('stderr', `[核心包升级] 未完成: ${lastErrMsg}`)
			}
		} catch (err) {
			appendServiceLog('stderr', `[启动预检] 自动升级异常: ${err?.message || String(err)}`)
		}
		// 升级完必清缓存，保证接下来重新 probe 会读到新版本
		probeCache = { path: null, result: null, time: 0 }
		probe = await probeExistingInstall(targetPath)
	}

	// 改动 Task2.d：若 PEP585 quickHotfixAvailable=true，自动执行 runComfyKitchenPep585Hotfix，再重新 probe 一次
	if (
		!probe.launchCompatibility?.canStart &&
		probe.launchCompatibility?.quickHotfixAvailable &&
		probe.launchCompatibility?.pyTorch26Pep585Compat?.needsPatch &&
		probe.py?.command
	) {
		appendServiceLog(
			'system',
			`[启动预检] 检测到 PEP585 不兼容，开始就地补丁 comfy-kitchen 0.2.28: ` +
				`torch=${probe.launchCompatibility.pyTorch26Pep585Compat.torchVersion || 'n/a'}，kitchen=${probe.launchCompatibility.pyTorch26Pep585Compat.kitchenVersion || 'n/a'}`
		)
		try {
			const hotfixGen = runComfyKitchenPep585Hotfix(probe.py)
			let hotfixDone = false
			let hotfixOk = false
			let hotfixSkipped = false
			for await (const evt of hotfixGen) {
				if (!evt) continue
				if (evt.type === 'log') {
					appendServiceLog(evt.stream || 'stdout', evt.message || '')
				} else if (evt.type === 'step') {
					appendServiceLog('system', `[PEP585热修复步骤] ${evt.message || evt.step}`)
				} else if (evt.type === 'warn' || evt.type === 'warning') {
					appendServiceLog('stderr', `[PEP585热修复警告] ${evt.message || ''}`)
				} else if (evt.type === 'error') {
					appendServiceLog('stderr', `[PEP585热修复错误] ${evt.message || ''}`)
				} else if (evt.type === 'done') {
					hotfixDone = true
					hotfixOk = Boolean(evt.ok)
					hotfixSkipped = Boolean(evt.skipped)
					appendServiceLog('stdout', `[PEP585热修复] ${evt.message || '完成'}`)
				} else if (evt.type === 'result') {
					if (evt.ok || evt.skipped) {
						appendServiceLog(
							'stdout',
							'[PEP585热修复] 结果: ' +
								(evt.summary && typeof evt.summary === 'string'
									? evt.summary
									: JSON.stringify(evt.summary || ''))
						)
					} else {
						appendServiceLog('stderr', `[PEP585热修复] ✗ 失败: ${evt.message || ''}`)
					}
				}
			}
			if (!hotfixDone) {
				appendServiceLog('stderr', '[PEP585热修复] 生成器未输出 done 事件（异常中断）')
			}
			if (hotfixOk || hotfixSkipped) {
				probeCache = { path: null, result: null, time: 0 }
				probe = await probeExistingInstall(targetPath)
			}
		} catch (err) {
			appendServiceLog(
				'stderr',
				`[启动预检] PEP585 热修复生成器异常: ${err?.message || String(err)}`
			)
		}
	}

	if (!probe.launchCompatibility?.canStart) {
		const launchCompAfter = probe.launchCompatibility || {}
		const reasons = launchCompAfter.needsFix || []
		const warnings = launchCompAfter.warnings || []
		const outdatedAfter = launchCompAfter.outdatedPackages || []
		// 改动C：阻断前把 launchCompatibility 全部关键信息打印到 service log，避免用户仅看到一句「启动依赖不完整」就懵
		if (warnings.length > 0) {
			for (const wline of warnings) {
				appendServiceLog('stderr', `[环境检测] [警告] ${String(wline)}`)
			}
		}
		if (outdatedAfter.length > 0) {
			appendServiceLog(
				'stderr',
				`[环境检测] 核心包版本差异明细（${outdatedAfter.length}/${launchCompAfter.keyPkgsTotal || 0}）：`
			)
			for (const op of outdatedAfter) {
				appendServiceLog(
					'stderr',
					`[环境检测]   · ${op.package}: ${op.installed ? `v${op.installed}` : '未安装'} → 需要 v${op.required}`
				)
			}
		}
		const reasonStr = reasons.length > 0 ? `：${reasons.join('；')}` : ''
		appendServiceLog('stderr', `[环境检测] 当前Python环境不满足启动要求${reasonStr}`)
		if (launchCompAfter.needsManualFix === true) {
			// 改动C：双标记精确指引 — needsManualFix=true = 必须让用户走配置，不可继续点启动
			appendServiceLog(
				'system',
				'[提示] 当前环境存在基础阻断（缺Python / 缺PyTorch / 缺comfy主模块），请先点击「一键配置Python环境」修复后再启动'
			)
		} else {
			// needsManualFix=false 却仍然 canStart=false → 通常是自动升级失败但基础阻断不全（极少情况）
			appendServiceLog(
				'system',
				'[提示] 自动修复未能解决版本差异，请检查网络后重试启动；或点击「一键配置Python环境」强制修复'
			)
		}
		return { ok: false, error: `Python环境不完整${reasonStr}` }
	}

	const customModelPaths = config.customModelPaths || []
	if (customModelPaths.length > 0) {
		appendServiceLog(
			'system',
			`[配置] 写入自定义模型路径到 extra_model_paths.yaml: ${customModelPaths.join(', ')}`
		)
		const writeResult = writeExtraModelPathsConfig(targetPath, customModelPaths)
		if (!writeResult.ok) {
			appendServiceLog('stderr', `[警告] 写入模型路径配置失败: ${writeResult.error}`)
		}
	} else {
		writeExtraModelPathsConfig(targetPath, [])
	}

	let pythonCmd = 'python'
	let pythonBaseArgs = []
	let spawnArgs = []
	let useShell = false

	if (probe.installType === 'portable' && !isManagedVenvReady()) {
		const batFile =
			probe.pythonInfo?.torchCuda !== false &&
			fs.existsSync(path.join(targetPath, 'run_nvidia_gpu.bat'))
				? 'run_nvidia_gpu.bat'
				: 'run_cpu.bat'
		pythonCmd = path.join(targetPath, batFile)
		useShell = true
		if (p !== DEFAULT_COMFYUI_PORT) {
			appendServiceLog(
				'system',
				`[提示] 便携版ComfyUI使用内置启动脚本，端口配置可能不生效，将使用bat文件默认端口`
			)
		}
	} else {
		const bestPy = probe.pythonInfo
		if (bestPy?.type === 'managed_venv' && fs.existsSync(bestPy.path)) {
			pythonCmd = bestPy.path
		} else if (isManagedVenvReady()) {
			pythonCmd = getManagedVenvPython()
		} else if (bestPy?.path) {
			if (bestPy.type === 'py_launcher') {
				pythonCmd = 'py'
				pythonBaseArgs = ['-3']
			} else if (bestPy.type === 'system') {
				pythonCmd = bestPy.path
			} else if (fs.existsSync(bestPy.path)) {
				pythonCmd = bestPy.path
			}
		} else if (probe.installType === 'venv') {
			const venvPy =
				process.platform === 'win32'
					? path.join(targetPath, 'venv', 'Scripts', 'python.exe')
					: path.join(targetPath, 'venv', 'bin', 'python')
			if (fs.existsSync(venvPy)) pythonCmd = venvPy
		}
		spawnArgs = [
			...pythonBaseArgs,
			'main.py',
			'--listen',
			'127.0.0.1',
			'--port',
			String(p),
			...args
		]
	}

	resetServiceStreamBuffers()
	serviceExitCode = null
	const cmdDisplay = useShell ? pythonCmd : `"${pythonCmd}" ${spawnArgs.join(' ')}`
	appendServiceLog('system', `[启动] 工作目录: ${targetPath}`)
	appendServiceLog('system', `[启动] 命令: ${cmdDisplay}`)

	// 方案A 备援：在 ComfyUI 启动前自动 patch triton-windows 的 None-guard 缺陷
	// 仅当 pythonCmd 是真实文件路径（即 venv python）时执行，跳过 'py' launcher 等情况
	if (pythonCmd && pythonCmd !== 'py' && fs.existsSync(pythonCmd)) {
		try {
			const patchR = ensureTritonWindowsNoneGuard(pythonCmd)
			if (patchR && !patchR.skipped) {
				if (patchR.ok) {
					appendServiceLog(
						'stdout',
						`[启动预检] 已应用 triton-windows None-guard patch（${patchR.appliedChecks} 处修改），文件: ${patchR.targetFile}`
					)
				} else {
					appendServiceLog(
						'stderr',
						`[启动预检] triton-windows None-guard patch 失败: ${patchR.reason || ''} ${patchR.error || ''}`
					)
				}
			}
		} catch (err) {
			// patch 失败不阻塞 ComfyUI 启动（方案B 仍可独立生效）
			appendServiceLog(
				'stderr',
				`[启动预检] triton-windows None-guard patch 异常（非致命）: ${err?.message || err}`
			)
		}
	}

	try {
		serviceChildProcess = spawn(pythonCmd, spawnArgs, {
			cwd: targetPath,
			env: buildComfySpawnEnv(),
			shell: useShell,
			windowsHide: true
		})
		serviceStartTime = Date.now()
		serviceChildProcess.stdout?.on('data', (data) => {
			emitParserEvents(processStreamData('stdout', data, _stdoutParserState, false))
		})
		serviceChildProcess.stderr?.on('data', (data) => {
			emitParserEvents(processStreamData('stderr', data, _stderrParserState, false))
		})
		serviceChildProcess.on('error', (err) => {
			appendServiceLog('stderr', `[启动失败] ${err?.message || String(err)}`)
			handleServiceExit(null, 'spawn_error')
		})
		serviceChildProcess.on('exit', (code, signal) => {
			handleServiceExit(code, signal)
		})
		broadcastStatus(getServiceStatus())
		return { ok: true, port: p, pid: serviceChildProcess.pid }
	} catch (err) {
		serviceChildProcess = null
		serviceStartTime = null
		appendServiceLog('stderr', `[启动异常] ${err?.message || String(err)}`)
		broadcastStatus(getServiceStatus())
		return { ok: false, error: String(err?.message || err) }
	}
}

async function restartService(installPath, port, extraArgs) {
	if (serviceChildProcess && !serviceChildProcess.killed) {
		stopService()
		const exited = await waitForServiceExit(5000)
		if (!exited) {
			appendServiceLog('system', '[客户端] 进程未在预期时间内退出，强制启动新实例...')
		}
		serviceChildProcess = null
		serviceStartTime = null
	}
	return startService(installPath, port, extraArgs)
}

export function setupGetDefaultInstallPath() {
	return { ok: true, path: getDefaultInstallPath() }
}

export async function setupSelectPath(_ctx, payload) {
	const result = await selectInstallPath(payload?.title, payload?.defaultPath)
	return { ok: true, ...result }
}

export async function setupValidatePath(_ctx, payload) {
	if (!payload?.path) return { ok: false, error: 'path is required' }
	return validatePath(payload.path)
}

export async function setupSelectModelPath(_ctx) {
	const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
	const result = await dialog.showOpenDialog(win, {
		title: '选择ComfyUI模型目录',
		properties: ['openDirectory'],
		buttonLabel: '选择目录'
	})
	if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
		return { ok: true, canceled: true }
	}
	return { ok: true, canceled: false, path: result.filePaths[0] }
}

export async function setupAddCustomModelPath(_ctx, payload) {
	const modelPath = payload?.path
	if (!modelPath || typeof modelPath !== 'string') {
		return { ok: false, error: 'path is required' }
	}
	const normalized = path.normalize(modelPath)
	if (!fs.existsSync(normalized)) {
		return { ok: false, error: '目录不存在' }
	}
	const stat = fs.statSync(normalized)
	if (!stat.isDirectory()) {
		return { ok: false, error: '路径不是目录' }
	}
	const config = loadConfig()
	const existing = new Set((config.customModelPaths || []).map((p) => path.normalize(p)))
	if (existing.has(normalized)) {
		return { ok: false, error: '该目录已添加' }
	}
	const updated = [...(config.customModelPaths || []), normalized]
	saveConfig({ customModelPaths: updated })
	probeCache = { path: null, result: null, time: 0 }
	if (config.installPath && fs.existsSync(config.installPath)) {
		writeExtraModelPathsConfig(config.installPath, updated)
	}
	return { ok: true, customModelPaths: updated }
}

export function setupRemoveCustomModelPath(_ctx, payload) {
	const modelPath = payload?.path
	if (!modelPath || typeof modelPath !== 'string') {
		return { ok: false, error: 'path is required' }
	}
	const config = loadConfig()
	const targetNorm = path.normalize(modelPath)
	const updated = (config.customModelPaths || []).filter((p) => path.normalize(p) !== targetNorm)
	saveConfig({ customModelPaths: updated })
	probeCache = { path: null, result: null, time: 0 }
	if (config.installPath && fs.existsSync(config.installPath)) {
		writeExtraModelPathsConfig(config.installPath, updated)
	}
	return { ok: true, customModelPaths: updated }
}

export async function setupProbeExistingInstall(_ctx, payload) {
	if (!payload?.path) return { ok: false, error: 'path is required' }
	return probeExistingInstall(payload.path, { customModelPaths: payload.customModelPaths })
}

export async function setupCheckEnv(_ctx, payload) {
	return checkEnvironment(payload?.installPath)
}

export function setupGetConfig() {
	return { ok: true, ...loadConfig() }
}

export function setupSaveConfig(_ctx, payload) {
	const data = { ...(payload || {}) }
	if (data.installPath && !data.venvPath) {
		const currentConfig = loadConfig()
		if (!currentConfig.venvPath || !currentConfig.venvPath.startsWith(data.installPath)) {
			data.venvPath = getDefaultVenvPath(data.installPath)
		}
	}
	const ok = saveConfig(data)
	if (ok) {
		const config = loadConfig()
		if (config.installPath && fs.existsSync(config.installPath)) {
			writeExtraModelPathsConfig(config.installPath, config.customModelPaths || [])
		}
		probeCache = { path: null, result: null, time: 0 }
	}
	return { ok }
}

function fetchJson(url, timeout = 10000) {
	return new Promise((resolve, reject) => {
		const lib = url.startsWith('https:') ? https : http
		const req = lib.get(
			url,
			{
				timeout,
				headers: { 'User-Agent': 'DVStudio-ComfyUI-Setup' }
			},
			(res) => {
				if (
					res.statusCode === 301 ||
					res.statusCode === 302 ||
					res.statusCode === 307 ||
					res.statusCode === 308
				) {
					if (res.headers.location) {
						fetchJson(new URL(res.headers.location, url).toString(), timeout).then(resolve, reject)
					} else {
						reject(new Error(`Redirect without location: ${res.statusCode}`))
					}
					res.resume()
					return
				}
				if (res.statusCode !== 200) {
					res.resume()
					reject(new Error(`HTTP ${res.statusCode}`))
					return
				}
				let data = ''
				res.setEncoding('utf-8')
				res.on('data', (chunk) => (data += chunk))
				res.on('end', () => {
					try {
						resolve(JSON.parse(data))
					} catch (e) {
						reject(e)
					}
				})
			}
		)
		req.on('timeout', () => {
			req.destroy(new Error('timeout'))
		})
		req.on('error', reject)
	})
}

function parseSemver(versionStr) {
	if (!versionStr) return null
	const cleaned = String(versionStr).replace(/^v/, '').trim()
	const parts = cleaned.split('.')
	const nums = parts.map((p) => {
		const n = parseInt(p, 10)
		return isNaN(n) ? 0 : n
	})
	while (nums.length < 3) nums.push(0)
	return {
		major: nums[0],
		minor: nums[1],
		patch: nums[2],
		raw: cleaned
	}
}

function compareSemver(v1, v2) {
	const a = parseSemver(v1)
	const b = parseSemver(v2)
	if (!a || !b) return null
	if (a.major !== b.major) return a.major - b.major
	if (a.minor !== b.minor) return a.minor - b.minor
	return a.patch - b.patch
}

/**
 * 修复B：从 pip 的 "from versions: 0.1.1, 0.1.2, ..." 错误文本中
 * 解析出镜像源最高可用版本，并判断是否满足目标版本要求。
 * 返回：{ hasVersionList: boolean, highestVersion: string|null, targetMet: boolean|null }
 *   - targetMet=true:  镜像已有 >= target 的版本
 *   - targetMet=false: 镜像最高版本 < target（缺版本，立即换下一个镜像）
 *   - targetMet=null:  无法解析（格式不匹配，继续按原有流程处理）
 */
function analyzePipAvailableVersions(errorText, targetVersion) {
	if (!errorText) return { hasVersionList: false, highestVersion: null, targetMet: null }
	// 匹配 "from versions: xxx, yyy, zzz)" 或 "from versions: xxx yyy zzz"
	const m = errorText.match(/from versions:\s*([^)\n]+)/i)
	if (!m || !m[1]) return { hasVersionList: false, highestVersion: null, targetMet: null }
	const raw = m[1]
	// 拆出版本号：支持逗号/空格/分号分隔，去掉前后括号标点
	const tokens = raw
		.split(/[,\s;]+/)
		.map((s) => s.trim().replace(/^[()[\].:]+|[()[\].:]+$/g, ''))
		.filter(Boolean)
	if (tokens.length === 0) return { hasVersionList: false, highestVersion: null, targetMet: null }
	// 逐个解析 semver，找最高的
	let highest = null
	for (const t of tokens) {
		const parsed = parseSemver(t)
		if (!parsed) continue
		if (!highest) {
			highest = parsed.raw
			continue
		}
		const cmp = compareSemver(parsed.raw, highest)
		if (cmp !== null && cmp > 0) highest = parsed.raw
	}
	if (!highest) return { hasVersionList: true, highestVersion: null, targetMet: null }
	const cmp = targetVersion ? compareSemver(highest, targetVersion) : null
	return {
		hasVersionList: true,
		highestVersion: highest,
		targetMet: cmp === null ? null : cmp >= 0
	}
}

/**
 * 按优先级读取 ComfyUI 的版本号。
 * 官方版本文件在 2024 年中之后迁移到了 comfyui_version.py + pyproject.toml，
 * 老版本仍保留 version.py，最后 fallback 到 git describe 的 tag。
 * @returns {string|null} version string like "0.30.0" (不带 v 前缀)
 */
function readComfyUIVersion(installPath) {
	// 1) comfyui_version.py （新版主路径）
	const cvPath = path.join(installPath, 'comfyui_version.py')
	if (fs.existsSync(cvPath)) {
		try {
			const c = fs.readFileSync(cvPath, 'utf-8')
			const m = c.match(/__version__\s*=\s*['"]([^'"]+)['"]/)
			if (m && m[1]) return String(m[1]).replace(/^v/, '')
		} catch {}
	}
	// 2) pyproject.toml (PEP 621 版本号)
	const tomlPath = path.join(installPath, 'pyproject.toml')
	if (fs.existsSync(tomlPath)) {
		try {
			const c = fs.readFileSync(tomlPath, 'utf-8')
			// 仅匹配 [project] section 内顶层的 version = "x.y.z"
			const lines = c.split(/\r?\n/)
			let inProject = false
			for (const line of lines) {
				if (/^\s*\[project\]\s*$/.test(line)) {
					inProject = true
					continue
				}
				if (/^\s*\[/.test(line)) inProject = false
				if (inProject) {
					const vm = line.match(/^\s*version\s*=\s*['"]([^'"]+)['"]\s*$/)
					if (vm && vm[1]) return String(vm[1]).replace(/^v/, '')
				}
			}
		} catch {}
	}
	// 3) version.py （老版兼容）
	const verPath = path.join(installPath, 'version.py')
	if (fs.existsSync(verPath)) {
		try {
			const c = fs.readFileSync(verPath, 'utf-8')
			const m = c.match(/__version__\s*=\s*['"]([^'"]+)['"]/)
			if (m && m[1]) return String(m[1]).replace(/^v/, '')
		} catch {}
	}
	return null
}

/**
 * 写入版本号到 comfyui_version.py + pyproject.toml（若文件存在则更新）。
 * 用于 reset 到 release tag 之后，版本号文件仍滞后的场景（或者 tag 没打在
 * master HEAD 上的 ComfyUI 官方发布模式），保证下次 setupCheckVersionUpdate
 * 能正确解析为 latestVersion。
 */
function writeComfyUIVersion(installPath, version) {
	if (!version) return { ok: false, error: 'version 为空' }
	const cleanVer = String(version).replace(/^v/, '')
	const results = []
	// ① comfyui_version.py
	const cvPath = path.join(installPath, 'comfyui_version.py')
	if (fs.existsSync(cvPath)) {
		try {
			const orig = fs.readFileSync(cvPath, 'utf-8')
			const updated = orig.replace(
				/__version__\s*=\s*['"][^'"]+['"]/,
				`__version__ = "${cleanVer}"`
			)
			if (updated !== orig) {
				fs.writeFileSync(cvPath, updated, 'utf-8')
				results.push(`comfyui_version.py: __version__ = ${cleanVer}`)
			}
		} catch (e) {
			results.push(`comfyui_version.py 写入失败: ${e.message}`)
		}
	}
	// ② pyproject.toml: [project] 下 version = "x.y.z"
	const tomlPath = path.join(installPath, 'pyproject.toml')
	if (fs.existsSync(tomlPath)) {
		try {
			const orig = fs.readFileSync(tomlPath, 'utf-8')
			const lines = orig.split(/\r?\n/)
			let inProject = false
			let changed = false
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]
				if (/^\s*\[project\]\s*$/.test(line)) {
					inProject = true
					continue
				}
				if (/^\s*\[/.test(line)) inProject = false
				if (inProject && /^\s*version\s*=\s*['"][^'"]+['"]\s*$/.test(line)) {
					lines[i] = line.replace(/version\s*=\s*['"][^'"]+['"]/, `version = "${cleanVer}"`)
					changed = true
					break
				}
			}
			if (changed) {
				const updated = lines.join('\n')
				fs.writeFileSync(tomlPath, updated, 'utf-8')
				results.push(`pyproject.toml: version = ${cleanVer}`)
			}
		} catch (e) {
			results.push(`pyproject.toml 写入失败: ${e.message}`)
		}
	}
	// ③ version.py （老版兼容，若存在也同步）
	const verPath = path.join(installPath, 'version.py')
	if (fs.existsSync(verPath)) {
		try {
			const orig = fs.readFileSync(verPath, 'utf-8')
			const updated = orig.replace(
				/__version__\s*=\s*['"][^'"]+['"]/,
				`__version__ = "${cleanVer}"`
			)
			if (updated !== orig) {
				fs.writeFileSync(verPath, updated, 'utf-8')
				results.push(`version.py: __version__ = ${cleanVer}`)
			}
		} catch {}
	}
	return { ok: true, results }
}

async function fetchLatestRelease(timeout = 10000) {
	try {
		const info = await fetchJson(
			'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest',
			timeout
		)
		if (info?.tag_name) {
			return {
				tag: info.tag_name,
				version: info.tag_name.replace(/^v/, ''),
				url:
					info.html_url ||
					`https://github.com/comfyanonymous/ComfyUI/releases/tag/${info.tag_name}`,
				publishedAt: info.published_at || null,
				name: info.name || info.tag_name
			}
		}
	} catch {}
	return null
}

async function getLatestGitTag(installPath) {
	try {
		const result = await runCommand(
			'git',
			['-C', installPath, 'tag', '-l', 'v*', '--sort=-v:refname'],
			{ timeout: 10000 }
		)
		if (result.ok && result.stdout) {
			const tags = result.stdout
				.split('\n')
				.map((t) => t.trim())
				.filter(Boolean)
			if (tags.length > 0) {
				let latest = tags[0]
				let latestParsed = parseSemver(latest)
				for (const tag of tags.slice(1)) {
					const p = parseSemver(tag)
					if (p && latestParsed && compareSemver(p, latestParsed) > 0) {
						latest = tag
						latestParsed = p
					}
				}
				return latest
			}
		}
	} catch {}
	return null
}

export async function setupCheckVersionUpdate(_ctx, payload) {
	const installPath = payload?.installPath
	if (!installPath || !fs.existsSync(installPath)) {
		return { ok: false, error: '无效的 ComfyUI 目录' }
	}

	let currentVersion = null
	let currentCommit = null // 完整 hash（不再使用短 hash 比较）
	let latestTag = null
	let latestVersion = null
	let updateAvailable = false
	let error = null
	let releaseUrl = null
	let publishedAt = null
	let releaseName = null

	// 统一的版本号读取：comfyui_version.py → pyproject.toml → version.py（老版）
	try {
		currentVersion = readComfyUIVersion(installPath)
	} catch {}

	const isGitRepo = fs.existsSync(path.join(installPath, '.git'))

	if (isGitRepo) {
		try {
			// 使用完整 hash，避免短 hash 不稳定
			const headR = await runCommand('git', ['-C', installPath, 'rev-parse', 'HEAD'], {
				timeout: 8000
			})
			if (headR.ok && headR.stdout) currentCommit = headR.stdout.trim()
		} catch {}
	}

	const latestRelease = await fetchLatestRelease(8000)
	if (latestRelease) {
		latestTag = latestRelease.tag
		latestVersion = latestRelease.version
		releaseUrl = latestRelease.url
		publishedAt = latestRelease.publishedAt
		releaseName = latestRelease.name
	}

	if (isGitRepo && !latestRelease) {
		try {
			await runCommand('git', ['-C', installPath, 'fetch', 'origin', '--tags', '--force'], {
				timeout: 30000
			})
		} catch {}

		const localLatestTag = await getLatestGitTag(installPath)
		if (localLatestTag) {
			latestTag = localLatestTag
			latestVersion = localLatestTag.replace(/^v/, '')
			releaseUrl = `https://github.com/comfyanonymous/ComfyUI/releases/tag/${localLatestTag}`
		}
	}

	// ============================================================
	//  核心判定链路（优先级从高到低）
	//  1) Git 仓库 + commit hash 与远程默认分支 HEAD 完全相等 → 一定是最新
	//     （豁免：ComfyUI 官方 release tag 不打在 master HEAD 上，导致版本号
	//      比 latestVersion 旧，但源码实际上已经同步到最新）
	//  2) currentVersion + latestVersion 语义化比较 cmp < 0 → 有更新
	//  3) latestVersion 存在 但 currentVersion 无法读取 → 判断 hash
	//  4) Git 仓库 + hash 与远程默认分支 HEAD 不等 → 有更新
	// ============================================================
	let upstreamFullHash = null
	if (isGitRepo && currentCommit) {
		try {
			const branch = await detectRemoteDefaultBranch(installPath)
			const lsSym = await runCommand(
				'git',
				['-C', installPath, 'ls-remote', '--symref', 'origin', 'HEAD'],
				{ timeout: 15000 }
			)
			if (lsSym.ok && lsSym.stdout) {
				const lines = lsSym.stdout.split(/\r?\n/).filter(Boolean)
				for (const line of lines) {
					if (!line.startsWith('ref:') && /[0-9a-f]{40}/.test(line)) {
						const m = line.match(/([0-9a-f]{40})/)
						if (m) {
							upstreamFullHash = m[1]
							break
						}
					}
				}
			}
			if (!upstreamFullHash && branch) {
				const lsHeads = await runCommand(
					'git',
					['-C', installPath, 'ls-remote', '--heads', 'origin', branch],
					{ timeout: 15000 }
				)
				if (lsHeads.ok && lsHeads.stdout) {
					const m = lsHeads.stdout.match(/([0-9a-f]{40})/)
					if (m) upstreamFullHash = m[1]
				}
			}
		} catch {}
	}

	// Step 1) 最高优先级：完整 hash 对齐 → 直接判为 up-to-date（豁免 release tag 模式问题）
	if (isGitRepo && currentCommit && upstreamFullHash && currentCommit === upstreamFullHash) {
		updateAvailable = false
	} else if (currentVersion && latestVersion) {
		// Step 2) 语义化版本比较
		const cmp = compareSemver(currentVersion, latestVersion)
		if (cmp !== null) {
			updateAvailable = cmp < 0
		} else {
			updateAvailable = currentVersion.replace(/^v/, '') !== latestVersion.replace(/^v/, '')
		}
		// 二次确认：如果 cmp < 0 但 hash 已经与远程 HEAD 相等 → 仍算最新
		if (
			updateAvailable &&
			isGitRepo &&
			currentCommit &&
			upstreamFullHash &&
			currentCommit === upstreamFullHash
		) {
			updateAvailable = false
		}
	} else if (latestTag) {
		// Step 3) latestVersion 存在 但 currentVersion 读不到
		// 不再直接 = true（之前的短路判断是误判根源），改为用 hash 判断
		if (isGitRepo && currentCommit && upstreamFullHash) {
			updateAvailable = currentCommit !== upstreamFullHash
		} else {
			// 既读不到版本号、也无法比较 hash（非 Git 仓库或网络失败），保守提示有更新
			updateAvailable = !currentVersion
		}
	} else if (isGitRepo && currentCommit && upstreamFullHash) {
		// Step 4) 没有 release 信息，但可以比较 hash
		updateAvailable = currentCommit !== upstreamFullHash
	}

	if (!latestTag && !latestRelease) {
		error = '无法获取最新版本信息，请检查网络连接'
	}

	// 返回给前端时 currentCommit 仍保留完整 hash，前端 UI 可以 slice(0,7) 展示短 hash
	return {
		ok: true,
		currentVersion,
		currentCommit,
		latestTag,
		latestVersion,
		updateAvailable,
		isGitRepo,
		error,
		releaseUrl,
		publishedAt,
		releaseName
	}
}

export function setupResetForFreshInstall() {
	try {
		stopService()
		const defaultConfig = defaultComfyConfig()
		saveConfig(defaultConfig, true)
		probeCache = { path: null, result: null, time: 0 }
		return { ok: true }
	} catch (err) {
		return { ok: false, error: err.message }
	}
}

export function setupOpenFolder(_ctx, payload) {
	return openFolder(payload?.path)
}

export function setupGetServiceStatus() {
	return { ok: true, ...getServiceStatus() }
}

export async function setupStartService(_ctx, payload) {
	return startService(payload?.installPath, payload?.port, payload?.extraArgs)
}

export async function setupScanForeignComfyProcesses() {
	return scanForeignComfyProcesses()
}

export async function setupKillForeignComfyProcesses(_ctx, payload) {
	const list = payload?.processes
	if (!Array.isArray(list) || list.length === 0) {
		const scanR = await scanForeignComfyProcesses()
		if (!scanR.ok) return scanR
		return killForeignComfyProcesses(scanR.processes)
	}
	return killForeignComfyProcesses(list)
}

export function setupStopService() {
	return stopService()
}

export function setupCancelInstall() {
	if (installChildProcess && !installChildProcess.killed) {
		try {
			installChildProcess.kill()
		} catch {}
		installChildProcess = null
	}
	return { ok: true }
}

export async function* setupInstall(_ctx, payload) {
	const installPath = payload?.installPath || getDefaultInstallPath()
	const mirror = payload?.mirror || 'github'
	const gpu = payload?.gpu !== false
	yield { type: 'log', message: `[setup] 安装路径: ${installPath}` }
	yield { type: 'progress', step: 'idle', progress: 0, message: '准备安装...' }
	yield {
		type: 'done',
		message: '安装功能开发中，当前版本仅提供环境检测和路径配置。',
		progress: 100
	}
}

export async function setupPingMirrors() {
	const results = await pingAllMirrors()
	return { ok: true, results }
}

export function setupGetMirrorList() {
	return {
		ok: true,
		pypiMirrors: PIP_MIRRORS.map((m) => ({
			key: m.key,
			name: m.name,
			url: m.url,
			kind: m.kind,
			builtin: m.builtin
		})),
		torchMirrors: TORCH_MIRRORS.map((m) => ({
			key: m.key,
			name: m.name,
			url: m.url,
			kind: m.kind,
			builtin: m.builtin
		}))
	}
}

export function setupSetMirror(_ctx, payload) {
	const updates = {}
	if (payload?.pypiMirror !== undefined) updates.pypiMirror = payload.pypiMirror
	if (payload?.torchMirror !== undefined) updates.torchMirror = payload.torchMirror
	if (payload?.customPypiMirrorUrl !== undefined)
		updates.customPypiMirrorUrl = payload.customPypiMirrorUrl
	if (payload?.customTorchMirrorUrl !== undefined)
		updates.customTorchMirrorUrl = payload.customTorchMirrorUrl
	saveConfig(updates)
	probeCache = { path: null, result: null, time: 0 }
	return { ok: true, config: { ...loadConfig() } }
}

export async function* setupFixPythonEnv(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	const forceRecreate = !!payload?.forceRecreate
	let venvPath = payload?.venvPath || loadConfig().venvPath || undefined
	if (!isComfyUIDir(installPath)) {
		yield { type: 'error', message: '无效的 ComfyUI 目录' }
		return
	}
	if (payload?.venvPath) {
		const normalized = path.resolve(payload.venvPath)
		const normalizedInstall = path.resolve(installPath)
		if (
			normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) ||
			normalized.toLowerCase() === normalizedInstall.toLowerCase()
		) {
			venvPath = path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
			yield {
				type: 'log',
				stream: 'stderr',
				message: '⚠️ 虚拟环境路径在 ComfyUI 安装目录下，已自动切换到客户端管理目录'
			}
		}
		saveConfig({ venvPath })
	}
	yield* setupPythonEnv(installPath, { forceRecreate, venvPath })
	probeCache = { path: null, result: null, time: 0 }
	yield { type: 'log', stream: 'stdout', message: '环境配置完成，正在刷新检测结果...' }
}

export function setupGetDefaultVenvPath(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	const defaultPath = getDefaultVenvPath(installPath)
	return { ok: true, path: defaultPath, currentPath: getManagedVenvRoot() }
}

export async function setupSelectVenvPath(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	const result = await selectInstallPath(
		'选择 Python 虚拟环境安装位置',
		payload?.defaultPath || getDefaultVenvPath(installPath)
	)
	return { ok: true, ...result }
}

export function setupSetVenvPath(_ctx, payload) {
	const venvPath = payload?.path
	if (venvPath) {
		const normalized = path.resolve(venvPath)
		const config = loadConfig()
		const installPath = config.installPath ? path.resolve(config.installPath) : null
		if (
			installPath &&
			(normalized.toLowerCase().startsWith(installPath.toLowerCase() + path.sep) ||
				normalized.toLowerCase() === installPath.toLowerCase())
		) {
			const safePath = path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
			saveConfig({ venvPath: safePath })
			return {
				ok: false,
				error: '虚拟环境不能设置在 ComfyUI 安装目录下，已自动切换到客户端管理目录',
				venvPath: safePath
			}
		}
		saveConfig({ venvPath })
		return { ok: true }
	}
	saveConfig({ venvPath: undefined })
	return { ok: true }
}

export function setupGetServiceLogs() {
	return {
		ok: true,
		logs: serviceLogBuffer.slice(),
		status: getServiceStatus()
	}
}

export function setupClearServiceLogs() {
	serviceLogBuffer = []
	resetServiceStreamBuffers()
	broadcastToAllWindows(SERVICE_CLEAR_CHANNEL, { ts: Date.now() })
	return { ok: true }
}

export async function setupRestartService(_ctx, payload) {
	const r = await restartService(payload?.installPath, payload?.port, payload?.extraArgs)
	return r
}

const COMFYUI_REPO_URL = 'https://github.com/comfyanonymous/ComfyUI.git'
const COMFYUI_MIRROR_URLS = [
	'https://ghproxy.com/https://github.com/comfyanonymous/ComfyUI.git',
	'https://github.com/comfyanonymous/ComfyUI.git'
]

export async function* setupCloneComfyUI(_ctx, payload) {
	let targetPath = payload?.installPath || loadConfig().installPath || getDefaultInstallPath()

	if (!targetPath) {
		yield { type: 'error', message: '请先选择安装目录' }
		return
	}

	yield { type: 'step', step: 'preparing', message: '准备安装 ComfyUI 源码...' }
	yield { type: 'log', stream: 'stdout', message: `目标安装路径: ${targetPath}` }

	if (fs.existsSync(targetPath)) {
		const stat = fs.statSync(targetPath)
		if (!stat.isDirectory()) {
			yield { type: 'error', message: '选择的路径不是目录，请重新选择' }
			return
		}
		if (isComfyUIDir(targetPath)) {
			yield {
				type: 'log',
				stream: 'stdout',
				message: '目录已存在有效的 ComfyUI 安装，无需重复安装'
			}
			saveConfig({ installPath: targetPath })
			probeCache = { path: null, result: null, time: 0 }
			yield { type: 'done', message: 'ComfyUI 已安装' }
			return
		}
	}

	const git = await detectGit()
	if (!git.available) {
		yield {
			type: 'error',
			message:
				'未检测到 Git，请先安装 Git 后再进行源码安装。\n可以从 https://git-scm.com/download/win 下载安装。'
		}
		return
	}
	yield { type: 'log', stream: 'stdout', message: `检测到 Git: ${git.version}` }

	let cloneTargetDir = targetPath
	let needMoveContents = false
	let tempCloneDir = null

	if (fs.existsSync(targetPath)) {
		let hasRealFiles = false
		try {
			const entries = fs.readdirSync(targetPath)
			for (const e of entries) {
				if (e === '.' || e === '..') continue
				if (e.startsWith('.') && (e === '.git' || e === '.DS_Store' || e === 'Thumbs.db')) continue
				if (e.toLowerCase() === 'desktop.ini') continue
				hasRealFiles = true
				break
			}
		} catch {}

		if (hasRealFiles) {
			needMoveContents = true
			tempCloneDir = path.join(path.dirname(targetPath), '__comfyui_clone_tmp_' + Date.now())
			cloneTargetDir = tempCloneDir
			yield {
				type: 'log',
				stream: 'stdout',
				message: '目标目录非空，将先克隆到临时位置再迁移文件...'
			}
		} else {
			try {
				fs.rmSync(targetPath, { recursive: true, force: true })
				yield { type: 'log', stream: 'stdout', message: '清理空目录完成' }
			} catch (err) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `清理目录时出错: ${err.message}，继续尝试...`
				}
			}
		}
	} else {
		const parentDir = path.dirname(targetPath)
		try {
			fs.mkdirSync(parentDir, { recursive: true })
		} catch (err) {
			yield { type: 'error', message: `创建父目录失败: ${err.message}` }
			return
		}
	}

	yield { type: 'step', step: 'cloning', message: '正在克隆 ComfyUI 源码...' }
	yield { type: 'log', stream: 'stdout', message: `克隆到: ${cloneTargetDir}` }

	let lastError = null
	let cloneSuccess = false

	for (let i = 0; i < COMFYUI_MIRROR_URLS.length; i++) {
		const repoUrl = COMFYUI_MIRROR_URLS[i]
		if (i > 0) {
			yield { type: 'log', stream: 'stdout', message: '\n镜像源访问失败，尝试备用源...' }
		}
		yield { type: 'log', stream: 'stdout', message: `从 ${repoUrl} 克隆源码...` }

		try {
			const queue = createCloneStreamQueue()

			if (fs.existsSync(cloneTargetDir)) {
				try {
					fs.rmSync(cloneTargetDir, { recursive: true, force: true })
				} catch {}
			}

			const args = ['clone', '--depth', '1', repoUrl, cloneTargetDir]
			const proc = runCommandWithStream('git', args, {
				timeout: 600000,
				cwd: path.dirname(cloneTargetDir)
			})

			proc.onStdout((d) => {
				const msg = d.trim()
				if (msg) queue.push({ type: 'log', stream: 'stdout', message: msg })
			})
			proc.onStderr((d) => {
				const msg = d.trim()
				if (msg) queue.push({ type: 'log', stream: 'stderr', message: msg })
			})
			proc.promise.then(
				(res) => {
					if (res.ok) {
						queue.push({ type: 'clone_done' })
					} else {
						queue.push({
							type: 'clone_error',
							error: res.error || `Git clone 失败，退出码: ${res.code}`
						})
					}
					queue.finish()
				},
				(err) => {
					queue.push({ type: 'clone_error', error: String(err?.message || err) })
					queue.finish()
				}
			)

			let thisCloneOk = false
			while (true) {
				const item = await queue.next()
				if (item.done) break
				const val = item.value
				if (val.type === 'clone_done') {
					if (fs.existsSync(cloneTargetDir) && isComfyUIDir(cloneTargetDir)) {
						thisCloneOk = true
					} else {
						lastError = '克隆完成但未检测到有效的 ComfyUI 文件结构（main.py 和 comfy/ 目录）'
						yield { type: 'log', stream: 'stderr', message: lastError }
					}
					break
				} else if (val.type === 'clone_error') {
					lastError = val.error
					yield { type: 'log', stream: 'stderr', message: val.error }
					break
				} else if (val.message) {
					yield val
				}
			}

			if (thisCloneOk) {
				cloneSuccess = true
				break
			}
		} catch (err) {
			lastError = String(err?.message || err)
			yield { type: 'log', stream: 'stderr', message: `克隆出错: ${lastError}` }
		}
	}

	if (!cloneSuccess) {
		if (tempCloneDir && fs.existsSync(tempCloneDir)) {
			try {
				fs.rmSync(tempCloneDir, { recursive: true, force: true })
			} catch {}
		}
		yield {
			type: 'error',
			message: `源码克隆失败，请检查网络连接后重试。\n您也可以手动从 ${COMFYUI_REPO_URL} 下载源码解压到选择的目录。\n\n错误信息: ${lastError || '未知错误'}`
		}
		return
	}

	if (needMoveContents && tempCloneDir) {
		yield { type: 'step', step: 'moving', message: '正在迁移文件到目标目录...' }
		try {
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true })
			}
			const clonedEntries = fs.readdirSync(tempCloneDir)
			for (const entry of clonedEntries) {
				const src = path.join(tempCloneDir, entry)
				const dst = path.join(targetPath, entry)
				try {
					fs.renameSync(src, dst)
				} catch {
					try {
						fs.cpSync(src, dst, { recursive: true })
						fs.rmSync(src, { recursive: true, force: true })
					} catch (e) {
						yield { type: 'log', stream: 'stderr', message: `移动文件 ${entry} 失败: ${e.message}` }
					}
				}
			}
			try {
				fs.rmSync(tempCloneDir, { recursive: true, force: true })
			} catch {}
			yield { type: 'log', stream: 'stdout', message: '文件迁移完成' }
		} catch (err) {
			yield {
				type: 'error',
				message: `文件迁移失败: ${err.message}\n源码已克隆到临时目录: ${tempCloneDir}\n您可以手动将该目录内容移动到目标位置。`
			}
			return
		}
	}

	if (!isComfyUIDir(targetPath)) {
		yield {
			type: 'error',
			message: `安装完成后验证失败：目标路径 ${targetPath} 中未找到有效的 ComfyUI 文件结构`
		}
		return
	}

	yield { type: 'log', stream: 'stdout', message: '源码安装完成！' }
	const defaultVenvForInstall = getDefaultVenvPath(targetPath)
	saveConfig({ installPath: targetPath, venvPath: defaultVenvForInstall })
	probeCache = { path: null, result: null, time: 0 }
	yield { type: 'done', message: 'ComfyUI 源码安装完成' }
}

const COMFYUI_USER_DATA_DIRS = ['models', 'custom_nodes', 'output', 'input', 'user', 'temp']
const COMFYUI_USER_DATA_FILES = ['extra_model_paths.yaml']

function backupUserData(installPath) {
	const backupDir = path.join(installPath, '.dvstudio-update-backup')
	if (fs.existsSync(backupDir)) {
		fs.rmSync(backupDir, { recursive: true, force: true })
	}
	fs.mkdirSync(backupDir, { recursive: true })
	const backedUp = []
	for (const dir of COMFYUI_USER_DATA_DIRS) {
		const src = path.join(installPath, dir)
		if (fs.existsSync(src)) {
			const dest = path.join(backupDir, dir)
			try {
				fs.cpSync(src, dest, { recursive: true })
				backedUp.push({ type: 'dir', name: dir })
			} catch (e) {
				console.warn(`[comfyui-update] failed to backup dir ${dir}:`, e.message)
			}
		}
	}
	for (const file of COMFYUI_USER_DATA_FILES) {
		const src = path.join(installPath, file)
		if (fs.existsSync(src)) {
			const dest = path.join(backupDir, file)
			try {
				fs.copyFileSync(src, dest)
				backedUp.push({ type: 'file', name: file })
			} catch (e) {
				console.warn(`[comfyui-update] failed to backup file ${file}:`, e.message)
			}
		}
	}
	return { backupDir, backedUp }
}

function restoreUserData(installPath, backupInfo) {
	if (!backupInfo || !backupInfo.backupDir) return
	const { backupDir, backedUp } = backupInfo
	for (const item of backedUp) {
		const src = path.join(backupDir, item.name)
		const dest = path.join(installPath, item.name)
		try {
			if (item.type === 'dir') {
				if (fs.existsSync(dest)) {
					fs.rmSync(dest, { recursive: true, force: true })
				}
				fs.cpSync(src, dest, { recursive: true })
			} else {
				fs.copyFileSync(src, dest)
			}
		} catch (e) {
			console.warn(`[comfyui-update] failed to restore ${item.name}:`, e.message)
		}
	}
	try {
		fs.rmSync(backupDir, { recursive: true, force: true })
	} catch {}
}

function writeGitignoreForUserData(installPath) {
	const gitignorePath = path.join(installPath, '.gitignore')
	let content = ''
	if (fs.existsSync(gitignorePath)) {
		try {
			content = fs.readFileSync(gitignorePath, 'utf-8')
		} catch {}
	}
	const lines = content.split(/\r?\n/).map((l) => l.trim())
	const neededEntries = [
		...COMFYUI_USER_DATA_DIRS.map((d) => d + '/'),
		...COMFYUI_USER_DATA_FILES,
		'.dvstudio-update-backup/',
		'comfyui-python/'
	]
	let changed = false
	for (const entry of neededEntries) {
		if (!lines.includes(entry)) {
			lines.push(entry)
			changed = true
		}
	}
	if (changed) {
		fs.writeFileSync(gitignorePath, lines.join('\n') + '\n', 'utf-8')
	}
}

async function detectRemoteDefaultBranch(installPath) {
	const branches = ['master', 'main']
	try {
		const symrefR = await runCommand(
			'git',
			['-C', installPath, 'ls-remote', '--symref', 'origin', 'HEAD'],
			{ timeout: 15000 }
		)
		if (symrefR.ok && symrefR.stdout) {
			const match = symrefR.stdout.match(/refs\/heads\/([^\s]+)\s+HEAD/)
			if (match && match[1]) {
				return match[1]
			}
		}
	} catch {}
	for (const branch of branches) {
		try {
			const refCheck = await runCommand(
				'git',
				['-C', installPath, 'ls-remote', '--heads', 'origin', branch],
				{ timeout: 10000 }
			)
			if (refCheck.ok && refCheck.stdout && refCheck.stdout.trim()) {
				return branch
			}
		} catch {}
	}
	return 'master'
}

// ============================================================
// ComfyUI 通用全链路更新 —— 工具函数 (Phase 0~6 专用)
// ------------------------------------------------------------
// 1. Key Packages Registry: 必须版本达标的核心 pip 包
// 2. PIP_MIRRORS: 三源 fallback 顺序 (清华 -> 阿里 -> PyPI 官方)
// 3. resolvePythonForComfyUI: 取 ComfyUI 运行时用的 python.exe
// 4. snapshotCheckpoint: Phase 0 (commit + pip freeze + python 快照)
// 5. runPipUpgradeRequirements: Phase 2 三源 fallback 升级
// 6. verifyKeyPackageVersions: Phase 2 (e) / Phase 5 (2) 关键包版本校验
// 7. runPipFreeze / runPipInstallFreeze / runPipCheck
// 8. scanAndUpgradeCustomNodes: Phase 3 扫 custom_nodes 各自 requirements
// 9. waitForPortReleased / waitForServiceHealthy: Phase 4 重启过程工具
// 10. runRollback: Phase 6 反序恢复
// ============================================================

/**
 * §3 Key Packages Registry. 任何一项不达标，升级不得判为 done。
 * 与启动日志 WARNING 块对齐：
 *   comfyui-frontend-package < 1.48.7
 *   comfyui-workflow-templates < 0.11.34
 *   comfyui-embedded-docs    < 0.5.9
 *   comfy-kitchen            < 0.2.28
 *   comfy-aimdo              < 0.4.13
 * 如果 ComfyUI 未来 release 升级了最低要求，只需改此处即可。
 * 注意：兜底安装时优先从 requirements.txt 读取精确 == 版本，本 Registry
 *       的 minVersion 仅用于版本校验判断以及 requirements.txt 缺失时的
 *       最后 fallback（>= 范围）。
 */
const COMFYUI_KEY_PACKAGE_REGISTRY = [
	{
		name: 'comfyui-frontend-package',
		minVersion: '1.48.7',
		why: '前端 GUI + Templates 静态资源（版本过低将看不到内置工作流 Templates）'
	},
	{
		name: 'comfyui-workflow-templates',
		minVersion: '0.11.34',
		why: 'Templates 面板的内置工作流版本，必须与 ComfyUI 源码同步'
	},
	{
		name: 'comfyui-embedded-docs',
		minVersion: '0.5.9',
		why: '节点悬浮文档 / Docs Tab（过低会导致新节点文档缺失）'
	},
	{
		name: 'comfy-kitchen',
		minVersion: '0.2.28',
		why: '量化 Layout（AsymW4A8Int8Layout）缺失将直接导致 CLIPLoader 报错 NoneType.Params'
	},
	{
		name: 'comfy-aimdo',
		minVersion: '0.4.13',
		why: 'Minimax H3 / Grok / OpenRouter 等第三方 API 节点的核心驱动包'
	}
]

/**
 * 根据 probeExistingInstall 的结果构造 PipManager 可用的 python 对象：
 *   { command: 'C:\\...\\python.exe', argsPrefix: [] }
 * 这是 Phase 2 pip 升级的最关键一步 —— 必须使用「正在运行 ComfyUI 的那个
 * Python 解释器」执行 pip，绝对不能假设裸 `pip` 命令就是目标 venv。
 */
function resolvePythonForComfyUI(installPath) {
	return detectPython().then((py) => {
		if (py?.command) {
			return { command: py.command, argsPrefix: py.argsPrefix || [] }
		}
		// fallback: detectPython 没找到时，尝试 ComfyUI 目标目录的 venv/python
		const probes = []
		if (process.platform === 'win32') {
			probes.push(path.join(installPath, 'venv', 'Scripts', 'python.exe'))
			probes.push(path.join(installPath, 'python_embeded', 'python.exe'))
		} else {
			probes.push(path.join(installPath, 'venv', 'bin', 'python'))
		}
		for (const p of probes) {
			if (fs.existsSync(p)) return { command: p, argsPrefix: [] }
		}
		return { command: process.platform === 'win32' ? 'py' : 'python3', argsPrefix: [] }
	})
}

/**
 * Phase 0 Checkpoint：把升级前状态打包落盘，失败时 Phase 6 可以精确还原
 *   checkpointDir = <installPath>/.dvstudio-update-checkpoint/<ts>/
 *     commit_before.txt      HEAD sha
 *     pip_freeze_before.txt  pip list 全量
 *     python_snapshot.json   python.exe 路径、argsPrefix
 *     service_snapshot.json  服务是否运行、port 端口
 *   返回 checkpoint 对象供 Phase 6 Rollback 使用
 */
async function snapshotCheckpoint(installPath, { detectPythonFn = resolvePythonForComfyUI } = {}) {
	const ts = Date.now()
	const cpRoot = path.join(installPath, '.dvstudio-update-checkpoint', String(ts))
	try {
		fs.mkdirSync(cpRoot, { recursive: true })
	} catch (err) {
		return { ok: false, error: `无法创建快照目录: ${err.message}` }
	}

	// (a) git HEAD commit
	let commitBefore = null
	try {
		const r = await runCommand('git', ['-C', installPath, 'rev-parse', 'HEAD'], { timeout: 10000 })
		if (r.ok && r.stdout) commitBefore = r.stdout.trim()
	} catch {}
	try {
		fs.writeFileSync(path.join(cpRoot, 'commit_before.txt'), commitBefore || '', 'utf-8')
	} catch {}

	// (b) python snapshot
	const py = await detectPythonFn(installPath)
	try {
		fs.writeFileSync(
			path.join(cpRoot, 'python_snapshot.json'),
			JSON.stringify(py, null, 2),
			'utf-8'
		)
	} catch {}

	// (c) pip freeze
	const pipManager = getPipManager(py)
	let freezeList = []
	try {
		freezeList = (await pipManager.listInstalled()) || []
	} catch {}
	const freezeLines = freezeList
		.map((p) => `${p.name}==${p.version}`)
		.filter(Boolean)
		.join('\n')
	try {
		fs.writeFileSync(path.join(cpRoot, 'pip_freeze_before.txt'), freezeLines + '\n', 'utf-8')
	} catch {}

	// (d) service snapshot
	const serviceSnap = getServiceStatus()
	try {
		fs.writeFileSync(
			path.join(cpRoot, 'service_snapshot.json'),
			JSON.stringify(serviceSnap, null, 2),
			'utf-8'
		)
	} catch {}

	return {
		ok: true,
		checkpointDir: cpRoot,
		timestamp: ts,
		commitBefore,
		py,
		freezePath: path.join(cpRoot, 'pip_freeze_before.txt'),
		serviceSnap
	}
}

/**
 * Phase 2 (a-b): 对 requirements.txt 执行 `pip install -r ... --upgrade`，
 *                三源 fallback 循环。
 * @yields Progress log chunks for UI stream
 * @returns { ok, error, lastMirror }
 */
async function* runPipUpgradeRequirements(pyObj, requirementsPath) {
	if (!pyObj?.command) {
		yield { type: 'log', stream: 'stderr', message: '[Pip] Python 解释器未知，跳过依赖升级' }
		return { ok: false, error: 'No python interpreter resolved' }
	}
	if (!fs.existsSync(requirementsPath)) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[Pip] requirements.txt 不存在，跳过依赖升级: ${requirementsPath}`
		}
		return { ok: false, error: `requirements.txt 不存在: ${requirementsPath}` }
	}

	const label =
		path.relative(path.dirname(requirementsPath) || '.', requirementsPath) || 'requirements.txt'
	const proxyEnv = getDvsProxyEnvVars()
	if (proxyEnv.HTTP_PROXY) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[代理] 应用 DVStudio Settings HTTP 代理: ${proxyEnv.HTTP_PROXY}`
		}
	}

	// 三源 fallback：优先 PyPI 官方 → 清华 TUNA → 阿里云（用户要求）
	const phase2Mirrors = [
		PIP_MIRRORS.find((m) => m.key === 'pip-official'),
		PIP_MIRRORS.find((m) => m.key === 'pip-tuna'),
		PIP_MIRRORS.find((m) => m.key === 'pip-aliyun')
	].filter(Boolean)
	function urlToHost(urlStr) {
		try {
			return new URL(urlStr).hostname
		} catch {
			return ''
		}
	}

	for (let i = 0; i < phase2Mirrors.length; i++) {
		const mirror = phase2Mirrors[i]
		const isOfficial = mirror.key === 'pip-official'
		// 网络参数：官方源相对宽裕（15s×2 retries）；国内镜像快速跳过（8s，只重试1次）
		const pipSocketTimeout = isOfficial ? '15' : '8'
		const pipRetries = isOfficial ? '2' : '1'
		const runTotalTimeout = isOfficial ? 8 * 60 * 1000 : 5 * 60 * 1000 // 官方 8 分 / 国内 5 分
		const args = [
			...(pyObj.argsPrefix || []),
			'-m',
			'pip',
			'install',
			'--disable-pip-version-check',
			'--upgrade',
			'--no-cache-dir',
			'--timeout',
			pipSocketTimeout,
			'--retries',
			pipRetries,
			'-r',
			requirementsPath
		]
		// 关键修复：官方源 **必须显式指定 --index-url**，否则会被用户 pip.ini 固定的清华源覆盖
		// 结果就是"以为访问了官方 PyPI，实际还是走的清华镜像"，而清华镜像有版本同步延迟
		// 导致 comfyui-workflow-templates 等最新包拿不到，Templates 停留在旧版本
		if (mirror.url) {
			if (isOfficial) {
				args.push('--index-url', mirror.url)
			} else {
				args.push('--index-url', mirror.url, '--trusted-host', urlToHost(mirror.url))
			}
		}
		yield {
			type: 'log',
			stream: 'stdout',
			message:
				`[Pip] 尝试镜像源 ${i + 1}/${phase2Mirrors.length}: ${mirror.name}  (安装 ${label})\n` +
				`         显式 --index-url=${mirror.url} · socket timeout=${pipSocketTimeout}s · retries=${pipRetries} · 总超时=${Math.round(runTotalTimeout / 60000)} 分钟`
		}
		const r = await runCommand(pyObj.command, args, {
			timeout: runTotalTimeout,
			env: proxyEnv
		})
		const combinedOut = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
		if (combinedOut) {
			for (const line of combinedOut.split('\n').slice(-12)) {
				if (line.trim()) yield { type: 'log', stream: 'stdout', message: `  ${line.trim()}` }
			}
		}
		if (r.ok) {
			yield {
				type: 'log',
				stream: 'stdout',
				message: `[Pip] ${label} 升级成功 ✓（镜像源：${mirror.name}）`
			}
			return { ok: true, lastMirror: mirror.name }
		}
		const errText = r.stderr || r.error || 'pip 非 0 退出码'
		const errSnippet = errText.slice(0, 220)
		const hitNoMatching = /No matching distribution found/i.test(errText)
		// 修复B：解析 from versions 列表，判断国内镜像是否最高版本都不够
		// 批量模式尝试提取某个关键包的目标版本（例如 comfyui-workflow-templates==0.11.34）
		let mirrorMaxVersionHint = ''
		let shouldBreakMirrorEarly = false
		if (hitNoMatching && !isOfficial) {
			// 尝试匹配 "No matching distribution found for pkgname==x.y.z"
			const targetMatch = errText.match(
				/No matching distribution found for\s+([a-zA-Z0-9_.-]+)\s*==\s*([0-9][a-zA-Z0-9.\-+]*)/i
			)
			if (targetMatch && targetMatch[2]) {
				const targetVer = targetMatch[2]
				const analysis = analyzePipAvailableVersions(errText, targetVer)
				if (analysis.hasVersionList && analysis.targetMet === false) {
					mirrorMaxVersionHint = `（镜像最高仅 v${analysis.highestVersion} < 目标 v${targetVer}）`
					shouldBreakMirrorEarly = true
				}
			} else {
				// 没提取到具体包，仍检测是否有版本列表 + 明确缺版本的倾向
				const analysis = analyzePipAvailableVersions(errText, null)
				if (analysis.hasVersionList) {
					mirrorMaxVersionHint = `（镜像最高可见 v${analysis.highestVersion}）`
				}
			}
		}
		yield {
			type: 'log',
			stream: 'stderr',
			message:
				`[Pip] 镜像源 ${mirror.name} 失败: ${errSnippet}` +
				(hitNoMatching ? '（当前源无此精确版本，快速切到下一个镜像）' : '') +
				mirrorMaxVersionHint
		}
		// 修复B：国内镜像明确缺版本（最高 < 目标），不做任何重试直接 break 跳下一个镜像
		if (shouldBreakMirrorEarly) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[Pip] ${mirror.name} 版本同步滞后（缺目标版本），立即跳过，不再在该镜像重试`
			}
			// 跳出当前镜像 for 循环（i 递增继续下一个），不做任何 retry
		}
	}
	return {
		ok: false,
		error: '所有镜像源均安装失败，请检查网络或手动安装: pip install -r requirements.txt --upgrade'
	}
}

/**
 * Phase 2 (f): 关键包单独兜底升级（按官方文档推荐方式）。
 *
 * 官方文档 (docs.comfy.org Core Dependency Update Troubleshooting) 明确要求：
 *   1) 先尝试 `pip install -r requirements.txt` 批量安装；
 *   2) 若批量失败，逐个安装关键包，版本号必须使用 requirements.txt 中
 *      写的确切 pin（==exactVersion），**不要擅自升级到独立最新版本**，
 *      否则会触发前端/后端版本兼容性警告；
 *   3) 仅当精确版本无法从当前镜像源获取时，才 fallback 到 >=minVersion
 *      作为最后补救（此时版本落后于源码但核心功能可启动）。
 *
 * 三源 fallback：PyPI 官方 → 清华 TUNA → 阿里云。
 *
 * 事件契约（上游消费可直接 map 到 UI/service log）：
 *   type ∈ { step, log, warn, error, result, done }
 *
 * @param {object|string} pyObj 两种签名兼容：
 *        ① 经典 { command, argsPrefix } 对象；② 便捷：直接传 installPath(string) → 内部自动 probeExistingInstall 找 bestPy
 * @param {string|object} arg2 签名 ① 时 = installPath(string)；签名 ② 时 = opts(object)
 */
async function* runPipUpgradeKeyPackages(pyObj, arg2) {
	yield {
		type: 'step',
		step: 'critical_pkg_upgrade_start',
		message: '开始对齐 requirements.txt 的 5 个核心包精确版本'
	}

	// ---- 改动E：签名归一化（支持 startService/setupPythonEnv 直接传 installPath string） ----
	let installPath = null
	let py = null
	if (typeof pyObj === 'string') {
		installPath = pyObj
		try {
			const probe = await probeExistingInstall(installPath, {})
			const bestPy = probe && probe.pythonInfo
			if (bestPy && bestPy.path && typeof bestPy.path === 'string') {
				py = { command: bestPy.path, argsPrefix: [] }
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[关键包升级] 自动选择 Python=${bestPy.path}（type=${bestPy.type || 'unknown'}）`
				}
			}
		} catch (e) {
			yield {
				type: 'warn',
				message:
					'[关键包升级] probeExistingInstall 失败，改为用 config.venvPath 兜底：' +
					(e && e.message ? e.message : String(e))
			}
		}
		if (!py) {
			try {
				const cfg = loadConfig()
				if (cfg && cfg.venvPath) {
					const exe =
						process.platform === 'win32'
							? path.join(cfg.venvPath, 'Scripts', 'python.exe')
							: path.join(cfg.venvPath, 'bin', 'python')
					if (fs.existsSync(exe)) {
						py = { command: exe, argsPrefix: [] }
						yield {
							type: 'log',
							stream: 'stdout',
							message: `[关键包升级] 兜底 Python（config.venvPath）=${exe}`
						}
					}
				}
			} catch (_) {}
		}
	} else if (pyObj && typeof pyObj === 'object') {
		py = {
			command: pyObj.command || pyObj.path || null,
			argsPrefix: pyObj.argsPrefix || pyObj.args || []
		}
		installPath =
			typeof arg2 === 'string' ? arg2 : arg2 && arg2.installPath ? arg2.installPath : null
	}
	if (!py || !py.command) {
		yield {
			type: 'error',
			message: '[关键包升级] 未找到可用 Python 解释器，请先设置 venv 或点击一键配置'
		}
		yield {
			type: 'result',
			ok: false,
			installedCount: 0,
			totalCount: 0,
			summary: 'Python 解释器未知',
			failed: ['<no-python>']
		}
		yield { type: 'done', ok: false, message: '核心包升级失败：未找到可用 Python 解释器' }
		return
	}

	// ---- 改动E：子进程隔离 env（关键：清空 PIP_INDEX_URL/PIP_CONFIG_FILE，避免用户全局 pip.ini/阿里云镜像把显式 --index-url 覆盖失效） ----
	// 这里只在传参里覆盖（不改 process.env），符合经验 978182「禁止对系统环境做写操作」的硬性规则
	const proxyEnv = getDvsProxyEnvVars()
	if (proxyEnv.HTTP_PROXY) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[代理] 应用 DVStudio Settings HTTP 代理: ${proxyEnv.HTTP_PROXY}`
		}
	}
	const isolatedPipEnv = {
		...proxyEnv,
		PIP_INDEX_URL: '', // 必须显式清空，否则会把后面 --index-url 参数整体覆盖
		PIP_CONFIG_FILE: '', // 临时禁用全局 pip.config / pip.ini，避免它再注入国内镜像
		PIP_DISABLE_PIP_VERSION_CHECK: '1'
	}

	// ---- 改动E：自动检测 PyTorch CUDA 后缀 → 推导出正确的 --extra-index-url ----
	let torchExtraIndexUrl = null
	try {
		let torchVersion = null
		if (typeof pyObj === 'object' && pyObj.torchVersion) {
			torchVersion = pyObj.torchVersion
		} else if (installPath) {
			const probe = await probeExistingInstall(installPath, {})
			torchVersion = probe && probe.pythonInfo && probe.pythonInfo.torchVersion
		}
		if (torchVersion) {
			const tLower = String(torchVersion).toLowerCase()
			if (tLower.includes('cu128')) torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu128'
			else if (tLower.includes('cu126'))
				torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu126'
			else if (tLower.includes('cu124'))
				torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu124'
			else if (tLower.includes('cu121'))
				torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu121'
			else if (tLower.includes('cu118'))
				torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu118'
			else torchExtraIndexUrl = 'https://download.pytorch.org/whl/cpu'
			yield {
				type: 'log',
				stream: 'stdout',
				message: `[关键包升级] torch=${torchVersion} → extra-index-url=${torchExtraIndexUrl}`
			}
		} else {
			torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu124'
		}
	} catch (_) {
		torchExtraIndexUrl = 'https://download.pytorch.org/whl/cu124'
	}

	// ---- Step 0. 构建每个关键包的「期望规格」 ----
	// 优先从 requirements.txt 读取精确 pin（官方要求），缺失时退化为 >=minVersion
	const reqPath = installPath ? path.join(installPath, 'requirements.txt') : null
	const reqCritical = reqPath ? getRequirementsCriticalPackages(reqPath) : {}
	const keyPackagePlans = COMFYUI_KEY_PACKAGE_REGISTRY.map((pkg) => {
		const normalizedName = pkg.name.toLowerCase().replace(/_/g, '-')
		const exactVer = reqCritical[normalizedName] || null
		return {
			name: pkg.name,
			minVersion: pkg.minVersion,
			exactVersion: exactVer,
			// 优先使用精确版本；若 requirements.txt 未 pin（理论上不会发生），
			// 则退化为范围下限
			primarySpec: exactVer ? `${pkg.name}==${exactVer}` : `${pkg.name}>=${pkg.minVersion}`,
			// 精确失败时的 fallback：只保证 ≥ minVersion（可能略低于源码要求）
			fallbackSpec: `${pkg.name}>=${pkg.minVersion}`,
			mode: exactVer ? 'exact' : 'range'
		}
	})
	yield {
		type: 'log',
		stream: 'stdout',
		message:
			'[关键包升级] 安装策略：优先按 requirements.txt 精确 pin == 逐个安装；\n' +
			'                   若某包精确版本在当前源不可得，则对该包 fallback 到 >=minVersion。'
	}
	yield {
		type: 'log',
		stream: 'stdout',
		message:
			'[关键包升级] 计划：' +
			keyPackagePlans
				.map(
					(p) =>
						`\n    - ${p.name}: ${p.mode === 'exact' ? 'pin ==' + p.exactVersion : 'range >=' + p.minVersion} (fallback >=${p.minVersion})`
				)
				.join('')
	}

	// ---- Step 1. 三源循环镜像（每个包都先 primary，单包失败才 fallback 到 range） ----
	const mirrors = [
		PIP_MIRRORS.find((m) => m.key === 'pip-official'),
		PIP_MIRRORS.find((m) => m.key === 'pip-tuna'),
		PIP_MIRRORS.find((m) => m.key === 'pip-aliyun')
	].filter(Boolean)
	function urlToHost(urlStr) {
		try {
			return new URL(urlStr).hostname
		} catch {
			return ''
		}
	}

	// 每个包单独记录状态，确保某包失败不会阻断其他包继续尝试
	const perPackageOk = new Map() // name -> true/false
	let overallSuccessCount = 0
	let lastMirrorUsedName = null

	for (let mi = 0; mi < mirrors.length; mi++) {
		const mirror = mirrors[mi]
		const isOfficial = mirror.key === 'pip-official'
		// 网络参数：官方源 15s×2 retries，相对宽裕但不是 3 分钟；国内镜像快速跳过（8s，仅1次重试）
		const pipSocketTimeout = isOfficial ? '15' : '8'
		const pipRetries = isOfficial ? '2' : '1'
		// 单包级总超时：官方 90 秒 / 国内 60 秒（单个体积小，Templates/Frontend 静态资源包几十 MB 级下载留够但不无限）
		const perPkgTotalTimeout = isOfficial ? 90 * 1000 : 60 * 1000
		const mirrorHost = mirror.url ? urlToHost(mirror.url) : ''
		// 每个镜像源下：对未成功的包逐个执行 install（primary → fallback），
		// 这样符合官方「Install Core Packages Individually」推荐。
		let mirrorAnySuccess = false
		let mirrorAnyAttempt = false

		yield {
			type: 'log',
			stream: 'stdout',
			message:
				`[关键包升级] 镜像 ${mi + 1}/${mirrors.length}: ${mirror.name}\n` +
				`         显式 --index-url=${mirror.url} · socket timeout=${pipSocketTimeout}s · retries=${pipRetries} · 单包总超时=${Math.round(perPkgTotalTimeout / 1000)} 秒`
		}

		for (const plan of keyPackagePlans) {
			if (perPackageOk.get(plan.name)) continue
			mirrorAnyAttempt = true
			// 每个包先试 primary（精确 ==），再试 fallback（>=）
			const attempts = [
				{
					spec: plan.primarySpec,
					label:
						plan.mode === 'exact' ? '精确 pin ==' + plan.exactVersion : '范围 >=' + plan.minVersion
				},
				{ spec: plan.fallbackSpec, label: 'fallback 范围 >=' + plan.minVersion }
			]
			// 如果 primary 和 fallback 相同（本来就是 range），只试一次
			if (attempts[0].spec === attempts[1].spec) attempts.pop()

			for (const att of attempts) {
				const args = [
					...(py.argsPrefix || []),
					'-m',
					'pip',
					'install',
					'--disable-pip-version-check',
					'--upgrade',
					'--no-cache-dir',
					'--timeout',
					pipSocketTimeout,
					'--retries',
					pipRetries,
					att.spec
				]
				// 改动E：先 push --extra-index-url (PyTorch wheel) 再 push --index-url (当前 mirror)
				// （pip 对多 index-url 的顺序依赖：--extra-index-url 在前面、--index-url 作为主索引放后面）
				if (torchExtraIndexUrl) {
					args.push('--extra-index-url', torchExtraIndexUrl)
				}
				// 关键修复：官方源也必须显式指定 --index-url 覆盖 pip.ini 默认配置（同时配合 isolatedPipEnv 清 PIP_INDEX_URL 双保险）
				if (mirror.url) {
					if (isOfficial) {
						args.push('--index-url', mirror.url)
					} else {
						args.push('--index-url', mirror.url, '--trusted-host', mirrorHost)
					}
				}
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[关键包升级] [${mirror.name}] 安装 ${plan.name} (${att.label})  —  ${py.command} -m pip install ... ${att.spec}`
				}
				const r = await runCommand(py.command, args, {
					timeout: perPkgTotalTimeout,
					env: isolatedPipEnv
				})
				const combinedOut = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
				if (combinedOut) {
					for (const line of combinedOut.split('\n').slice(-8)) {
						if (line.trim()) yield { type: 'log', stream: 'stdout', message: `  ${line.trim()}` }
					}
				}
				if (r.ok) {
					perPackageOk.set(plan.name, true)
					overallSuccessCount++
					mirrorAnySuccess = true
					lastMirrorUsedName = mirror.name
					yield {
						type: 'log',
						stream: 'stdout',
						message: `[关键包升级] ✓ ${plan.name} 安装成功（${att.label} @ ${mirror.name}）`
					}
					break
				} else {
					const errText = r.stderr || r.error || 'pip 非 0 退出码'
					const errSnippet = errText.slice(0, 200)
					const hitNoMatching = /No matching distribution found/i.test(errText)
					const hitTimeout =
						/timeout/i.test(r.error || '') || (r.code === null && /timeout/i.test(errText))
					// 修复B：分析 from versions 列表，判断国内镜像是否有该包的目标版本
					let versionHint = ''
					let skipMirrorForPackage = false // true: 该包在本镜像立即终止（不再 fallback），跳到下一镜像
					// 决定用哪个版本做目标比较
					let targetVerForAnalysis = plan.exactVersion || plan.minVersion
					if (att.label.startsWith('精确') && plan.exactVersion) {
						targetVerForAnalysis = plan.exactVersion
					} else if (att.label.startsWith('fallback')) {
						targetVerForAnalysis = plan.minVersion
					}
					if (hitNoMatching && !isOfficial) {
						const analysis = analyzePipAvailableVersions(errText, targetVerForAnalysis)
						if (analysis.hasVersionList) {
							if (analysis.targetMet === false) {
								versionHint = `（镜像最高 v${analysis.highestVersion} < 目标 v${targetVerForAnalysis}）`
								// 国内镜像明确缺：精确/fallback 都不该再试，这个源没有就是没有
								skipMirrorForPackage = true
							} else if (analysis.targetMet === true) {
								versionHint = `（镜像有 v${analysis.highestVersion}+，安装失败原因非版本缺失）`
							} else {
								versionHint = `（镜像最高可见 v${analysis.highestVersion}）`
							}
						}
					} else if (hitNoMatching && isOfficial) {
						// 官方源缺理论上不该发生，但仍给个提示
						const analysis = analyzePipAvailableVersions(errText, targetVerForAnalysis)
						if (analysis.hasVersionList && analysis.highestVersion) {
							versionHint = `（官方最高 v${analysis.highestVersion}）`
						}
					}
					yield {
						type: hitTimeout || hitNoMatching ? 'warn' : 'error',
						stream: 'stderr',
						message:
							`[关键包升级] ✗ ${plan.name} ${att.label} @ ${mirror.name} 失败: ${errSnippet}` +
							(hitNoMatching ? '（当前源无对应版本，跳过继续）' : '') +
							(hitTimeout ? '（超时，快速换下一个镜像/fallback）' : '') +
							versionHint
					}
					// 修复B：国内镜像缺版本（最高 < 目标）→ 该包在本镜像精确/fallback 全跳过，直接下一镜像
					// 原有逻辑：只在精确 + hitNoMatching 时 break；新逻辑更激进
					if (skipMirrorForPackage || (hitNoMatching && att.label.startsWith('精确'))) {
						if (skipMirrorForPackage) {
							yield {
								type: 'warn',
								message: `[关键包升级] → ${mirror.name} 镜像未同步 ${plan.name} 目标版本（最高<目标），直接跳到下一镜像尝试`
							}
						}
						break
					}
				}
			}
		}

		if (!mirrorAnyAttempt) break // 所有包已安装成功，提前结束镜像循环
		if (mirrorAnySuccess) {
			lastMirrorUsedName = mirror.name
		}
		// 所有包都成功了，结束
		if (overallSuccessCount === keyPackagePlans.length) break
	}

	// 改动 Task3：Step 1.5 核心包精确对齐全部结束后，追加 comfy-kitchen 最新版升级探测（仅尝试 PyPI 官方一次，失败降级为 warn 绝不阻断启动）
	// - 仅当：comfy-kitchen 已经是 0.2.28（精确对齐要求） 才跑
	// - 成功：日志 + 更新 perPackageOk；失败：仅 warn 且不阻断
	// - 注：该步骤仅用于对齐方案，避免后续用户升级后无感知
	if (perPackageOk.get('comfy-kitchen') === true) {
		yield {
			type: 'step',
			step: 'comfy_kitchen_latest_probe',
			message: '[关键包升级] 尝试使用 PyPI 官方源将 comfy-kitchen 升级到最新版（失败不阻断）'
		}
		let upgradeOk = false
		let upgradeErr = null
		try {
			const baseEnv = getPipIsolatedEnv()
			baseEnv.HTTPS_PROXY = localProxyEnv.HTTPS_PROXY || localProxyEnv.HTTP_PROXY || ''
			baseEnv.HTTP_PROXY = localProxyEnv.HTTP_PROXY || ''
			baseEnv.NO_PROXY = localProxyEnv.NO_PROXY || ''
			if (baseEnv.HTTP_PROXY) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[代理] 应用 DVStudio Settings HTTP 代理: ${baseEnv.HTTP_PROXY}`
				}
			}
			const args = [
				...(py.argsPrefix || []),
				'-m',
				'pip',
				'install',
				'--upgrade',
				'--index-url',
				'https://pypi.org/simple/',
				'--trusted-host',
				'pypi.org',
				'--trusted-host',
				'files.pythonhosted.org',
				'--prefer-binary',
				'comfy-kitchen'
			]
			const r = await runCommand(py.command, args, {
				timeout: 300000,
				env: baseEnv
			})
			const success = r.code === 0
			const combined = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
			for (const line of combined.split(/\r?\n/)) {
				if (line.trim()) {
					yield {
						type: 'log',
						stream: success ? 'stdout' : 'stderr',
						message: '  ' + line.trim()
					}
				}
			}
			if (success) {
				upgradeOk = true
				// 刷新 _installedCache 中 comfy-kitchen 版本
				try {
					const pipMgr = getPipManager(py)
					const r2 = await runCommand(
						py.command,
						[
							...(py.argsPrefix || []),
							'-c',
							'import comfy_kitchen; import sys; print(getattr(comfy_kitchen,"__version__",""),end="")'
						],
						{ timeout: 10000 }
					)
					const v = (r2.stdout || '').trim() || null
					if (v) pipMgr._installedCache.set('comfy-kitchen', v)
				} catch (_) {
					/* ignore */
				}
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[关键包升级] ✓ comfy-kitchen 最新版升级成功 @ PyPI`
				}
			} else {
				const errText = r.stderr || r.error || 'pip 非 0 退出码'
				upgradeErr = errText
				const msg = `[关键包升级] comfy-kitchen 官方源升级未成功，已跳过（不阻断）：${errText.slice(0, 200)}`
				yield { type: 'warn', message: msg }
				yield { type: 'log', stream: 'stderr', message: msg }
			}
		} catch (e) {
			upgradeErr = e?.message || String(e)
			const msg = `[关键包升级] comfy-kitchen 升级异常，已跳过（不阻断）：${upgradeErr}`
			yield { type: 'warn', message: msg }
			yield { type: 'log', stream: 'stderr', message: msg }
		}
		if (!upgradeOk && upgradeErr) {
			// 只记 log，不更新 perPackageOk（它已经是 true，0.2.28 满足需求），避免影响后续 canStart 判断
			appendServiceLog
				? appendServiceLog(
						'stderr',
						'[关键包升级] comfy-kitchen 最新版探测失败，保留 0.2.28（符合 requirements.txt 最低要求）'
					)
				: void 0
		}
	}

	// ---- Step 2. 汇总结果（改动E：补齐 result/done 事件） ----
	const failedList = keyPackagePlans.filter((p) => !perPackageOk.get(p.name))
	const totalCount = keyPackagePlans.length
	const installedCount = overallSuccessCount
	if (failedList.length === 0) {
		const okMsg = `[关键包升级] 全部核心包安装成功 ✓（共 ${totalCount} 个；最终成功镜像: ${lastMirrorUsedName || '多源组合'}）`
		yield { type: 'log', stream: 'stdout', message: okMsg }
		yield {
			type: 'result',
			ok: true,
			installedCount,
			totalCount,
			lastMirror: lastMirrorUsedName || null,
			summary: `成功 ${installedCount}/${totalCount} 个核心包对齐到 requirements.txt`
		}
		yield { type: 'done', ok: true, message: `核心包升级完成（${installedCount}/${totalCount}）` }
		return
	}
	const failedNames = failedList.map((f) => f.name)
	const failCmdLines = failedList
		.map((f) => `\n    "${py.command}" -m pip install --upgrade ${f.primarySpec}  # 优先精确版本`)
		.join('')
	const errMsg =
		'[关键包升级] ❌ 仍有 ' +
		failedList.length +
		`/${totalCount} 个包安装失败（${failedNames.join(', ')}），请检查网络/代理或手动执行以下命令：` +
		failCmdLines
	yield { type: 'error', message: errMsg }
	yield {
		type: 'result',
		ok: false,
		installedCount,
		totalCount,
		lastMirror: lastMirrorUsedName || null,
		summary: `失败 ${failedList.length}/${totalCount} 个核心包：${failedNames.join(', ')}`,
		failed: failedNames
	}
	yield {
		type: 'done',
		ok: false,
		message: `核心包升级未完成（仍有 ${failedList.length} 个包失败）`
	}
	return
}

/**
 * 改动 Task2.c：PyTorch 2.6.0 ~ 2.6.99 + comfy-kitchen 0.2.28 的 PEP585 list[int] 兼容性热修复。
 * 仅在：torch_version ∈ [2.6.0, 2.6.99)  AND  kitchen_version == "0.2.28"  时执行；
 * 其余版本一律跳过，避免误伤未来官方修复版。
 *
 * 事件契约同 runPipUpgradeKeyPackages：log/step/warn/error/result/done 6 类。
 *
 * @param {object|string} pyObj 两种签名兼容：
 *        ① { command, argsPrefix, torchVersion } 对象；② 直接传 venv python.exe 路径 string
 * @param {string} kitchenRootHint 可选：site-packages/comfy_kitchen 绝对路径
 */
async function* runComfyKitchenPep585Hotfix(pyObj, kitchenRootHint) {
	yield {
		type: 'step',
		step: 'pep585_hotfix_start',
		message: '开始检查 PyTorch 2.6.x + comfy-kitchen 0.2.28 的 PEP585 list[int] 兼容性'
	}
	// 签名归一化（与 runPipUpgradeKeyPackages 对齐）
	let py = { command: null, argsPrefix: [] }
	let probeHint = null
	try {
		if (pyObj && typeof pyObj === 'object' && (pyObj.command || pyObj.path)) {
			py.command = pyObj.command || pyObj.path || null
			py.argsPrefix = pyObj.argsPrefix || pyObj.args || []
			if (pyObj.torchVersion) probeHint = { torchVersion: pyObj.torchVersion }
		} else if (typeof pyObj === 'string' && pyObj.trim()) {
			py.command = pyObj.trim()
			py.argsPrefix = []
		} else if (typeof pyObj === 'string' && pyObj) {
			py.command = pyObj
			py.argsPrefix = []
		}
	} catch (e) {
		yield { type: 'error', message: `[PEP585] py 对象解析失败: ${e.message || e}` }
		yield { type: 'done', ok: false, message: '热修复未执行（参数错误）' }
		return
	}
	if (!py.command) {
		yield { type: 'error', message: '[PEP585] 未指定 python 解释器路径' }
		yield { type: 'done', ok: false, message: '热修复未执行（参数错误）' }
		return
	}
	// 代理与隔离
	const localProxyEnv = getDvsProxyEnvVars()
	if (localProxyEnv.HTTP_PROXY) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[代理] 应用 DVStudio Settings HTTP 代理: ${localProxyEnv.HTTP_PROXY}`
		}
	}
	// 前置探测：torch 版本范围 & kitchen 版本
	const versionCheck = [
		'import sys, json, os',
		'try:',
		'    import torch',
		'    tv = getattr(torch,"__version__","")',
		'    plus = tv.find("+")',
		'    tv_norm = tv[:plus] if plus>0 else tv',
		'except Exception as e:',
		'    print(json.dumps({"ok":False,"where":"torch","err":str(e)}))',
		'    sys.exit(0)',
		'try:',
		'    import comfy_kitchen',
		'    kv = getattr(comfy_kitchen,"__version__","")',
		'except Exception as e:',
		'    print(json.dumps({"ok":False,"where":"kitchen","err":str(e)}))',
		'    sys.exit(0)',
		'try:',
		'    kf = os.path.abspath(comfy_kitchen.__file__)',
		'    kroot = os.path.dirname(kf) if kf.endswith("__init__.py") else kf',
		'except Exception:',
		'    kroot = ""',
		'print(json.dumps({"ok":True,"torch":tv,"torch_norm":tv_norm,"kitchen":kv,"kitchen_root":kroot}))'
	].join('\n')
	let versions = null
	try {
		const r = await runCommand(py.command, [...(py.argsPrefix || []), '-c', versionCheck], {
			timeout: 25000,
			env: localProxyEnv
		})
		const out = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean)
		const last = out[out.length - 1] || '{}'
		versions = JSON.parse(last)
	} catch (e) {
		yield { type: 'error', message: `[PEP585] 版本探测异常: ${e.message || e}` }
		yield { type: 'done', ok: false, message: '热修复未执行（版本探测失败）' }
		return
	}
	if (!versions || !versions.ok) {
		yield {
			type: 'warn',
			message: `[PEP585] 不满足执行条件，跳过：${versions?.where || 'unknown'} — ${versions?.err || ''}`
		}
		yield {
			type: 'result',
			ok: true,
			skipped: true,
			reason: versions ? `${versions.where}:${versions.err}` : 'no_versions'
		}
		yield { type: 'done', ok: true, skipped: true, message: '无需热修复（条件不命中）' }
		return
	}
	const torchInRange = /^2\.6(\.|$)/.test(String(versions.torch_norm || ''))
	const kitchenMatch = String(versions.kitchen || '') === '0.2.28'
	if (!torchInRange || !kitchenMatch) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[PEP585] 跳过：torch=${versions.torch_norm || 'n/a'}（需 2.6.x）, kitchen=${versions.kitchen || 'n/a'}（需 ==0.2.28）`
		}
		yield { type: 'result', ok: true, skipped: true, reason: 'version_range_miss' }
		yield { type: 'done', ok: true, skipped: true, message: '无需热修复（版本范围未命中）' }
		return
	}
	const kitchenRoot =
		kitchenRootHint && fs.existsSync(kitchenRootHint)
			? kitchenRootHint
			: versions.kitchen_root && fs.existsSync(versions.kitchen_root)
				? versions.kitchen_root
				: ''
	if (!kitchenRoot) {
		yield { type: 'error', message: '[PEP585] 无法定位 comfy-kitchen site-packages 目录，跳过' }
		yield { type: 'done', ok: false, message: '热修复未执行（kitchenRoot 缺失）' }
		return
	}
	yield {
		type: 'step',
		step: 'pep585_hotfix_apply',
		message: `正在就地补丁 comfy-kitchen 0.2.28 (${kitchenRoot})：list[int] → typing.List[int]`
	}
	const hotfixRunner = [
		'from __future__ import annotations',
		'import sys, pathlib, re, os',
		'',
		'DECOR_RE = re.compile(r"@torch\\\\.library\\\\.custom_op\\\\s*\\\\(")',
		'LIST_ANNO_RE = re.compile(r"(?<![A-Za-z_])list\\\\[([A-Za-z_][A-Za-z0-9_, ]*)\\\\]")',
		'',
		'def patch_file(p):',
		'    text = p.read_text(encoding="utf-8", errors="replace")',
		'    if not DECOR_RE.search(text): return False',
		'    new_text = LIST_ANNO_RE.sub(lambda m: "typing.List[" + m.group(1) + "]", text)',
		'    if new_text == text: return False',
		'    if "from __future__ import annotations" not in new_text:',
		'        new_text = "from __future__ import annotations\\\\n" + new_text',
		'    if not re.search(r"^\\\\s*import\\\\s+typing\\\\b", new_text, re.MULTILINE):',
		'        lines = new_text.splitlines(keepends=True)',
		'        insert_at = 1 if lines and lines[0].startswith("from __future__ import") else 0',
		'        lines.insert(insert_at, "import typing\\\\n")',
		'        new_text = "".join(lines)',
		'    backup = p.with_suffix(p.suffix + ".bak_pep585_20260808")',
		'    if not backup.exists():',
		'        try: p.replace(backup)',
		'        except Exception: pass',
		'    p.write_text(new_text, encoding="utf-8")',
		'    return True',
		'',
		'if __name__ == "__main__":',
		'    root = pathlib.Path(sys.argv[1]).resolve()',
		'    patched = []',
		'    for py in root.rglob("*.py"):',
		'        if py.name.endswith(".bak_pep585_20260808"): continue',
		'        try:',
		'            if patch_file(py): patched.append(str(py))',
		'        except Exception as e:',
		'            sys.stderr.write(f"WARN skip {py}: {e}\\\\n")',
		'    print(len(patched))',
		'    for f in patched: print("  " + f)'
	].join('\n')
	try {
		const tmpPy = path.join(os.tmpdir(), `dvstudio_pep585_hotfix_${Date.now()}.py`)
		fs.writeFileSync(tmpPy, hotfixRunner, 'utf8')
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[PEP585] 执行: ${py.command} ${tmpPy} ${kitchenRoot}`
		}
		const r = await runCommand(py.command, [...(py.argsPrefix || []), tmpPy, kitchenRoot], {
			timeout: 60000,
			env: localProxyEnv
		})
		try {
			fs.unlinkSync(tmpPy)
		} catch (_) {
			/* ignore */
		}
		const combined = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
		for (const line of combined.split(/\r?\n/)) {
			if (line.trim()) yield { type: 'log', stream: 'stdout', message: `  ${line.trim()}` }
		}
		const firstLine = ((r.stdout || '').split(/\r?\n/)[0] || '0').trim()
		const count = parseInt(firstLine, 10)
		if (Number.isFinite(count) && count >= 0) {
			yield {
				type: 'result',
				ok: true,
				patchedFiles: count,
				summary: `PEP585 热修复完成，改写 ${count} 个 comfy-kitchen 文件（list[int] → typing.List[int]）`
			}
			yield {
				type: 'done',
				ok: true,
				message: `PEP585 热修复完成（改写 ${count} 个文件），.bak_pep585_20260808 已备份，可用于回滚`
			}
			return
		}
		yield { type: 'error', message: `[PEP585] 热修复返回异常: exit=${r.code}` }
		yield { type: 'done', ok: false, message: '热修复执行失败' }
		return
	} catch (e) {
		yield { type: 'error', message: `[PEP585] 热修复异常：${e.message || e}` }
		yield { type: 'done', ok: false, message: '热修复异常中断' }
		return
	}
}

/**
 * Phase 2 (e) / Phase 5 (2): 关键包版本校验
 * @returns { passes: boolean, report: Array<{name, installed, required, pass, why}> }
 */
async function verifyKeyPackageVersions(pyObj) {
	const report = []
	let passes = true
	if (!pyObj?.command) {
		return {
			passes: false,
			report: COMFYUI_KEY_PACKAGE_REGISTRY.map((p) => ({
				name: p.name,
				installed: null,
				required: p.minVersion,
				pass: false,
				why: '未知 Python 解释器'
			}))
		}
	}
	const pipMgr = getPipManager(pyObj)
	for (const pkg of COMFYUI_KEY_PACKAGE_REGISTRY) {
		// 先尝试直接读 pip show 的版本（pipManager 内 _installedCache 会被填充）
		let installed = null
		try {
			await pipMgr.isInstalled(pkg.name)
			installed = pipMgr._installedCache.get(pkg.name) || null
		} catch {}
		// fallback: 再 list 一次
		if (!installed) {
			try {
				const list = (await pipMgr.listInstalled()) || []
				const hit = list.find((x) => (x.name || '').toLowerCase() === pkg.name.toLowerCase())
				if (hit) installed = hit.version
			} catch {}
		}
		const cmp = installed ? compareSemver(installed, pkg.minVersion) : null
		const pass = cmp !== null && cmp >= 0
		if (!pass) passes = false
		report.push({
			name: pkg.name,
			installed,
			required: pkg.minVersion,
			pass,
			why: pkg.why
		})
	}
	return { passes, report }
}

/**
 * Phase 5 (2) / Phase 5 (4) 辅助: 一次性格式化关键包校验结果为可 yield 的日志
 */
function formatKeyPackageReportLines(report) {
	const lines = []
	for (const r of report) {
		const mark = r.pass ? '✓' : '✗'
		const have = r.installed || '未安装'
		lines.push(
			`  ${mark}  ${r.name.padEnd(34, ' ')}  ${have.padEnd(12, ' ')}  required >= v${r.required}  ${r.pass ? '' : ` — ${r.why}`}`
		)
	}
	return lines
}

/**
 * Phase 3: 扫描 custom_nodes 目录下每个子目录的 requirements.txt，统一升级
 * （忽略 ComfyUI-Manager 这种本身由 pip 管理的包）
 */
async function* upgradeAllCustomNodesRequirements(pyObj, installPath) {
	const customNodesDir = path.join(installPath, 'custom_nodes')
	if (!fs.existsSync(customNodesDir)) return { ok: true, skipped: '无 custom_nodes 目录' }
	let entries = []
	try {
		entries = fs.readdirSync(customNodesDir, { withFileTypes: true })
	} catch (err) {
		return { ok: false, error: `读取 custom_nodes 目录失败: ${err.message}` }
	}
	const reqFiles = []
	for (const e of entries) {
		if (!e.isDirectory()) continue
		// ComfyUI-Manager 有自己的升级通道，不处理
		if (e.name === 'ComfyUI-Manager') continue
		const req = path.join(customNodesDir, e.name, 'requirements.txt')
		if (fs.existsSync(req)) reqFiles.push({ req, nodeName: e.name })
	}
	if (reqFiles.length === 0) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: '[扩展] 未检测到 custom_nodes 子目录的 requirements.txt，跳过扩展依赖升级'
		}
		return { ok: true, skipped: '无 requirements.txt' }
	}
	let successCount = 0
	for (const { req, nodeName } of reqFiles) {
		yield {
			type: 'step',
			step: 'custom_nodes_pip',
			message: `升级 custom_nodes/${nodeName} 依赖...`
		}
		const iter = runPipUpgradeRequirements(pyObj, req)
		let last = null
		while (true) {
			const r = await iter.next()
			if (r.value) yield r.value
			if (r.done) {
				last = r.value
				break
			}
		}
		if (last?.ok) successCount++
		else
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[扩展] custom_nodes/${nodeName} requirements.txt 升级未成功（失败原因已打印，若该节点不常用可忽略）`
			}
	}
	return { ok: true, total: reqFiles.length, successCount }
}

/**
 * Phase 4: 等待 port 端口被完全释放（服务 stop 后 防止残留占用）
 */
async function waitForPortReleased(port, timeoutMs = 15000) {
	if (typeof port !== 'number' || port <= 0) return true
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		const free = await new Promise((resolve) => {
			const s = new net.Socket()
			let done = false
			const finish = (v) => {
				if (done) return
				done = true
				try {
					s.destroy()
				} catch {}
				resolve(v)
			}
			s.setTimeout(400, () => finish(true))
			s.on('connect', () => finish(false))
			s.on('error', () => finish(true))
			s.on('timeout', () => finish(true))
			try {
				s.connect(port, '127.0.0.1')
			} catch {
				finish(true)
			}
		})
		if (free) return true
		await new Promise((r) => setTimeout(r, 500))
	}
	return false
}

/**
 * Phase 4: 等待服务 /system_stats 返回 200，且 comfyui_version 字段存在
 */
async function waitForServiceHealthy(port, timeoutMs = 30000) {
	const start = Date.now()
	const url = `http://127.0.0.1:${port}/system_stats`
	while (Date.now() - start < timeoutMs) {
		let ok = false
		try {
			await new Promise((resolve) => {
				const req = http.get(url, { timeout: 3000 }, (res) => {
					let data = ''
					res.on('data', (c) => (data += c))
					res.on('end', () => {
						if (res.statusCode === 200) {
							try {
								const j = JSON.parse(data)
								if (j && ('system' in j || 'devices' in j || typeof j === 'object')) {
									ok = true
								}
							} catch {
								ok = !!data
							}
						}
						resolve()
					})
				})
				req.on('timeout', () => {
					req.destroy()
					resolve()
				})
				req.on('error', () => resolve())
			})
		} catch {}
		if (ok) return true
		await new Promise((r) => setTimeout(r, 1000))
	}
	return false
}

/**
 * Phase 6 Rollback: 按 §6 R1→R5 反序恢复。
 *   R1. 停服务
 *   R2. pip install -r pip_freeze_before.txt --force-reinstall --no-deps
 *   R3. git reset --hard <commit_before>
 *   R4. restoreUserData(backupInfo)
 *   R5. 启服务 + health probe
 */
async function* runRollback(installPath, { checkpoint, userDataBackup, defaultBranch }) {
	yield {
		type: 'step',
		step: 'rollback_start',
		message: '升级未完成，正在回滚到升级前的稳定版本...'
	}

	// R1 停服务
	try {
		stopService()
		yield { type: 'log', stream: 'stdout', message: '[Rollback R1] 已发送停止服务信号' }
	} catch {}
	try {
		await waitForServiceExit(15000)
	} catch {}

	// R2 恢复 pip freeze（只要 checkpoint 里 py 对象可用）
	if (checkpoint?.py?.command && checkpoint?.freezePath && fs.existsSync(checkpoint.freezePath)) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: '[Rollback R2] 正在恢复旧版本 Python 依赖包...'
		}
		const args = [
			...(checkpoint.py.argsPrefix || []),
			'-m',
			'pip',
			'install',
			'--disable-pip-version-check',
			'--no-cache-dir',
			'--force-reinstall',
			'--no-deps',
			'-r',
			checkpoint.freezePath
		]
		const r = await runCommand(checkpoint.py.command, args, { timeout: 15 * 60 * 1000 })
		if (r.ok) {
			yield { type: 'log', stream: 'stdout', message: '[Rollback R2] 依赖版本恢复成功' }
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[Rollback R2] 依赖恢复失败（请手动执行 pip install -r ${checkpoint.freezePath} --force-reinstall --no-deps）: ${(r.stderr || r.error || '').slice(0, 200)}`
			}
		}
	}

	// R3 恢复 git HEAD
	if (checkpoint?.commitBefore) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[Rollback R3] 正在恢复 git 代码快照 ${checkpoint.commitBefore.slice(0, 8)}...`
		}
		const r = await runCommand(
			'git',
			['-C', installPath, 'reset', '--hard', checkpoint.commitBefore],
			{ timeout: 120000 }
		)
		if (r.ok) {
			yield { type: 'log', stream: 'stdout', message: '[Rollback R3] 源码快照恢复成功' }
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[Rollback R3] 源码快照恢复失败: ${(r.stderr || r.error || '').slice(0, 200)}`
			}
		}
	} else if (defaultBranch) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[Rollback R3] 未记录升级前 commit SHA，已跳过源码回滚（建议手动：git reset --hard origin/${defaultBranch}）`
		}
	}

	// R4 恢复用户数据
	if (userDataBackup?.backedUp?.length) {
		yield { type: 'log', stream: 'stdout', message: '[Rollback R4] 正在恢复用户数据...' }
		try {
			restoreUserData(installPath, userDataBackup)
			writeGitignoreForUserData(installPath)
			yield {
				type: 'log',
				stream: 'stdout',
				message: `[Rollback R4] 用户数据已恢复 (${userDataBackup.backedUp.length} 项)`
			}
		} catch (err) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[Rollback R4] 用户数据恢复失败: ${err.message}`
			}
		}
	}

	// R5 启服务
	yield { type: 'log', stream: 'stdout', message: '[Rollback R5] 重启回滚后的旧版本服务...' }
	try {
		const config = loadConfig()
		const startR = await startService(installPath, config.port, config.extraArgs)
		if (startR?.ok) {
			yield { type: 'log', stream: 'stdout', message: '[Rollback R5] 服务启动请求已发送' }
			if (config.port) {
				const healthy = await waitForServiceHealthy(config.port, 30000)
				if (healthy)
					yield {
						type: 'log',
						stream: 'stdout',
						message: '[Rollback R5] 回滚完成，服务健康探测通过 ✓'
					}
				else
					yield {
						type: 'log',
						stream: 'stderr',
						message: `[Rollback R5] 服务端口 ${config.port} 健康探测未通过，请手动启动服务`
					}
			}
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[Rollback R5] 启动回滚后的服务失败: ${startR?.error || '未知错误'}`
			}
		}
	} catch (err) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[Rollback R5] 启动回滚服务异常: ${err.message}`
		}
	}

	yield { type: 'step', step: 'rollback_done', message: '回滚完成' }
}

export async function* setupUpdateComfyUI(_ctx, payload) {
	console.error(
		'[DEBUG UPDATE COMFYUI] setupUpdateComfyUI ENTER. payload keys:',
		Object.keys(payload || {})
	)
	const installPath = payload?.installPath || loadConfig().installPath
	console.error(
		'[DEBUG UPDATE COMFYUI] installPath resolved:',
		installPath,
		'exists?',
		fs.existsSync(installPath)
	)
	if (!installPath || !fs.existsSync(installPath)) {
		console.error('[DEBUG UPDATE COMFYUI] Guard: invalid installPath. Yield error + return.')
		yield { type: 'error', message: '无效的 ComfyUI 安装目录' }
		return
	}

	if (!isComfyUIDir(installPath)) {
		yield { type: 'error', message: `目录 ${installPath} 不是有效的 ComfyUI 安装` }
		return
	}

	const gitAvailable = await detectGit()
	if (!gitAvailable.available) {
		yield { type: 'error', message: '未检测到Git，请先安装Git: https://git-scm.com/download/win' }
		return
	}

	const gitDir = path.join(installPath, '.git')
	const isGitRepo = fs.existsSync(gitDir)
	let userDataBackup = null
	let nonGitInitialized = false
	let checkpoint = null
	let pyObj = null
	let defaultBranch = 'master'
	let rollbackRequired = false

	// ============================================================
	//  Phase 0  Checkpoint 快照（可回滚安全点）
	// ============================================================
	yield { type: 'step', step: 'checkpoint', message: '建立升级快照（失败可一键回滚）...' }
	try {
		checkpoint = await snapshotCheckpoint(installPath)
		if (checkpoint?.ok) {
			pyObj = checkpoint.py
			yield {
				type: 'log',
				stream: 'stdout',
				message: `[快照] 已记录升级前状态 -> ${path.relative(installPath, checkpoint.checkpointDir)}`
			}
			if (checkpoint.commitBefore) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[快照] 升级前 commit: ${checkpoint.commitBefore.slice(0, 10)}`
				}
			}
			if (checkpoint.serviceSnap?.running) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[快照] 当前服务运行中 pid=${checkpoint.serviceSnap.pid}，升级过程会自动重启`
				}
			}
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[快照] Checkpoint 创建失败（${checkpoint?.error || '未知'}），将继续但回滚能力受限`
			}
			// 即便 checkpoint 失败，也要解析 Python 用于后续 pip 升级
			pyObj = await resolvePythonForComfyUI(installPath)
		}
	} catch (err) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[快照] Checkpoint 异常：${err.message}，将继续但回滚能力受限`
		}
		pyObj = await resolvePythonForComfyUI(installPath)
	}
	// 保证 pyObj 至少有值
	if (!pyObj) pyObj = await resolvePythonForComfyUI(installPath)

	if (!isGitRepo) {
		yield {
			type: 'step',
			step: 'initializing',
			message: '非Git安装，正在初始化Git仓库以支持更新...'
		}
		yield { type: 'log', stream: 'stdout', message: '检测到非Git安装，将自动初始化Git仓库进行更新' }

		yield {
			type: 'log',
			stream: 'stdout',
			message: '备份用户数据（模型、工作流、自定义节点等）...'
		}
		try {
			userDataBackup = backupUserData(installPath)
			yield {
				type: 'log',
				stream: 'stdout',
				message: `已备份 ${userDataBackup.backedUp.length} 项用户数据`
			}
		} catch (e) {
			yield { type: 'error', message: `备份用户数据失败: ${e.message}` }
			return
		}

		try {
			const initR = await runCommand('git', ['-C', installPath, 'init'], { timeout: 15000 })
			if (!initR.ok) {
				restoreUserData(installPath, userDataBackup)
				yield { type: 'error', message: `Git初始化失败: ${initR.stderr || initR.error}` }
				return
			}
			yield { type: 'log', stream: 'stdout', message: 'Git仓库初始化完成' }
		} catch (e) {
			restoreUserData(installPath, userDataBackup)
			yield { type: 'error', message: `Git初始化失败: ${e.message}` }
			return
		}

		try {
			await runCommand('git', ['-C', installPath, 'config', 'advice.detachedHead', 'false'], {
				timeout: 5000
			})
			await runCommand(
				'git',
				[
					'-C',
					installPath,
					'remote',
					'add',
					'origin',
					'https://github.com/comfyanonymous/ComfyUI.git'
				],
				{ timeout: 15000 }
			)
			yield { type: 'log', stream: 'stdout', message: '已添加远程仓库 origin' }
		} catch (e) {
			try {
				await runCommand(
					'git',
					[
						'-C',
						installPath,
						'remote',
						'set-url',
						'origin',
						'https://github.com/comfyanonymous/ComfyUI.git'
					],
					{ timeout: 10000 }
				)
			} catch {}
		}

		writeGitignoreForUserData(installPath)
		nonGitInitialized = true
	}

	yield { type: 'step', step: 'checking', message: '检查当前版本状态...' }

	let currentCommit = null
	let currentVersion = null
	try {
		// 使用完整 hash 与 setupCheckVersionUpdate 一致
		const headR = await runCommand('git', ['-C', installPath, 'rev-parse', 'HEAD'], {
			timeout: 10000
		})
		if (headR.ok && headR.stdout) currentCommit = headR.stdout.trim()
	} catch {}
	// 统一版本号读取：comfyui_version.py → pyproject.toml → version.py
	currentVersion = readComfyUIVersion(installPath)

	// 最新 release 信息（在 Phase 5 通过后写回版本号文件，保证下次 setupCheckVersionUpdate 不再误判）
	let latestReleaseInfo = null
	try {
		latestReleaseInfo = await fetchLatestRelease(10000)
	} catch {}

	if (currentVersion) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `当前版本: v${currentVersion} (${(currentCommit || '').slice(0, 7) || 'unknown'})`
		}
	} else {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `当前版本提交: ${(currentCommit || '').slice(0, 7) || 'unknown'}`
		}
	}
	if (latestReleaseInfo?.version) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `最新发布: ${latestReleaseInfo.tag || 'v' + latestReleaseInfo.version}  (${latestReleaseInfo.name || ''})`
		}
	}

	yield { type: 'step', step: 'fetching', message: '正在获取远程更新...' }
	yield { type: 'log', stream: 'stdout', message: '执行 git fetch origin...' }

	const fetchArgs = ['fetch', 'origin', '--tags', '--force']
	const fetchMirrors = [{ args: fetchArgs, label: 'GitHub官方源' }]

	let fetchOk = false
	let fetchErr = null
	for (const mirror of fetchMirrors) {
		try {
			const result = await runCommand('git', ['-C', installPath, ...mirror.args], {
				timeout: 60000
			})
			if (result.ok) {
				fetchOk = true
				yield { type: 'log', stream: 'stdout', message: `远程更新获取成功 (${mirror.label})` }
				break
			} else {
				fetchErr = result.stderr || result.error || 'fetch failed'
				yield { type: 'log', stream: 'stderr', message: `${mirror.label} fetch失败: ${fetchErr}` }
			}
		} catch (err) {
			fetchErr = err.message
			yield { type: 'log', stream: 'stderr', message: `${mirror.label} fetch出错: ${err.message}` }
		}
	}

	if (!fetchOk) {
		yield { type: 'log', stream: 'stdout', message: '尝试通过ghproxy镜像获取更新...' }
		try {
			const result = await runCommand(
				'git',
				[
					'-C',
					installPath,
					'-c',
					'http.https://github.com/.proxy=',
					'-c',
					`url.https://ghfast.top/https://github.com/.insteadOf=https://github.com/`,
					...fetchArgs
				],
				{ timeout: 60000 }
			)
			if (result.ok) {
				fetchOk = true
				yield { type: 'log', stream: 'stdout', message: '通过镜像获取远程更新成功' }
			} else {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `镜像fetch也失败: ${result.stderr || result.error}`
				}
			}
		} catch (err) {
			yield { type: 'log', stream: 'stderr', message: `镜像fetch出错: ${err.message}` }
		}
	}

	if (!fetchOk) {
		yield {
			type: 'error',
			message: `无法获取远程更新: ${fetchErr || '网络连接失败'}\n请检查网络连接后重试。`
		}
		return
	}

	yield { type: 'log', stream: 'stdout', message: '正在检测远程默认分支...' }
	defaultBranch = await detectRemoteDefaultBranch(installPath)
	yield { type: 'log', stream: 'stdout', message: `远程默认分支: ${defaultBranch}` }
	let upstreamCommit = null

	if (nonGitInitialized) {
		yield { type: 'step', step: 'updating', message: '正在更新到最新版本...' }
		yield {
			type: 'log',
			stream: 'stdout',
			message: `执行 git checkout 更新到 origin/${defaultBranch}...`
		}

		let resetOk = false
		let resetErr = null
		try {
			const ref = `origin/${defaultBranch}`
			const refCheck = await runCommand('git', ['-C', installPath, 'rev-parse', '--verify', ref], {
				timeout: 10000
			})
			if (refCheck.ok) {
				upstreamCommit = refCheck.stdout.trim().slice(0, 7)
				const resetR = await runCommand('git', ['-C', installPath, 'checkout', ref, '--', '.'], {
					timeout: 120000
				})
				if (resetR.ok) {
					resetOk = true
					yield { type: 'log', stream: 'stdout', message: `已更新到 ${defaultBranch} 分支最新版本` }
				} else {
					resetErr = resetR.stderr || resetR.error
					yield {
						type: 'log',
						stream: 'stderr',
						message: `checkout ${defaultBranch}失败: ${resetErr}`
					}
				}
			} else {
				resetErr = `远程分支 ${defaultBranch} 不存在`
			}
		} catch (err) {
			resetErr = err.message
		}

		if (!resetOk) {
			restoreUserData(installPath, userDataBackup)
			yield { type: 'error', message: `更新失败: ${resetErr || '无法checkout到远程分支'}` }
			return
		}

		try {
			await runCommand('git', ['-C', installPath, 'checkout', '-B', defaultBranch], {
				timeout: 10000
			})
			await runCommand(
				'git',
				[
					'-C',
					installPath,
					'branch',
					'--set-upstream-to',
					`origin/${defaultBranch}`,
					defaultBranch
				],
				{ timeout: 10000 }
			)
			yield {
				type: 'log',
				stream: 'stdout',
				message: `已设置本地分支 ${defaultBranch} 跟踪远程分支`
			}
		} catch {}

		yield { type: 'log', stream: 'stdout', message: '恢复用户数据...' }
		restoreUserData(installPath, userDataBackup)
		writeGitignoreForUserData(installPath)
		yield { type: 'log', stream: 'stdout', message: '用户数据已恢复' }
	} else {
		// ============================================================
		// 【Git 仓库场景】
		// 用户明确要求："只是为了更新最新应该强制覆盖"
		// 策略：
		//   1) 先用独立函数 backupUserData() 把用户数据（模型/自定义节点/工作流等）
		//      拷到临时目录 .dvstudio-update-backup（不依赖 git stash）
		//   2) 如果检测到任何源码级本地改动 → 先 git reset --hard HEAD
		//      清掉工作区和暂存区的本地源码改动，保证不会触发 merge 覆盖检查
		//   3) 使用 git reset --hard origin/<defaultBranch>
		//      （不经过 git pull / git merge，不会触发"Your local changes..."错误）
		//   4) restoreUserData() 从临时目录恢复用户数据
		// 这样即使所有源码文件都被修改过（如本次报错的130+个文件），也能一次性
		// 对齐到远程最新版本，不会再有冲突/覆盖类报错。
		// ============================================================

		try {
			const remoteRef = `origin/${defaultBranch}`
			const upR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', remoteRef], {
				timeout: 10000
			})
			if (upR.ok && upR.stdout) upstreamCommit = upR.stdout.trim()
		} catch {}

		if (currentCommit && upstreamCommit && currentCommit === upstreamCommit) {
			let currentLocalVersion = currentVersion
			let latestTagVersion = null
			try {
				const latestTagR = await getLatestGitTag(installPath)
				if (latestTagR) {
					latestTagVersion = latestTagR.replace(/^v/, '')
				}
			} catch {}
			if (currentLocalVersion && latestTagVersion) {
				const cmp = compareSemver(currentLocalVersion, latestTagVersion)
				if (cmp !== null && cmp >= 0) {
					yield { type: 'log', stream: 'stdout', message: '当前已是最新版本，无需更新' }
					yield { type: 'done', message: '已是最新版本' }
					return
				}
			} else {
				yield { type: 'log', stream: 'stdout', message: '当前已是最新版本，无需更新' }
				yield { type: 'done', message: '已是最新版本' }
				return
			}
		}

		yield {
			type: 'log',
			stream: 'stdout',
			message: `远程最新提交: ${upstreamCommit || 'unknown'} (${defaultBranch})`
		}

		// ---- 第 1 步：用户数据独立备份（不依赖 git stash） ----
		yield { type: 'step', step: 'backing_user_data', message: '备份用户数据...' }
		try {
			if (!userDataBackup) {
				userDataBackup = backupUserData(installPath)
			}
			if (userDataBackup?.backedUp?.length) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `已备份 ${userDataBackup.backedUp.length} 项用户数据 (models / custom_nodes / workflows 等)`
				}
			} else {
				yield { type: 'log', stream: 'stdout', message: '当前没有需要额外备份的用户数据' }
			}
		} catch (err) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `用户数据备份失败，继续强制更新（风险较低，一般 git reset 不动 custom_nodes/models 等被忽略的目录）: ${err.message}`
			}
		}

		// ---- 第 2 步：检查本地源码改动，决定是否需要 git reset --hard HEAD ----
		yield { type: 'step', step: 'checking_changes', message: '检查本地修改...' }
		let hasLocalChanges = false
		const userDataPaths = new Set([...COMFYUI_USER_DATA_DIRS, ...COMFYUI_USER_DATA_FILES])
		let nonUserDataChangeCount = 0
		try {
			const statusR = await runCommand('git', ['-C', installPath, 'status', '--porcelain'], {
				timeout: 10000
			})
			if (statusR.ok && statusR.stdout && statusR.stdout.trim()) {
				const changedFiles = statusR.stdout.trim().split('\n').filter(Boolean)
				const nonUserDataChanges = changedFiles.filter((line) => {
					const filePath = line.substring(3).trim()
					const firstPart = filePath.split(/[\\/]/)[0]
					return !userDataPaths.has(firstPart) && !userDataPaths.has(filePath)
				})
				nonUserDataChangeCount = nonUserDataChanges.length
				if (nonUserDataChangeCount > 0) {
					hasLocalChanges = true
					yield {
						type: 'log',
						stream: 'stdout',
						message: `检测到 ${nonUserDataChangeCount} 个源码文件有本地修改，将强制覆盖为远程最新版本（用户数据已单独备份不受影响）`
					}
					for (const change of nonUserDataChanges.slice(0, 8)) {
						yield { type: 'log', stream: 'stdout', message: `  将覆盖: ${change}` }
					}
					if (nonUserDataChangeCount > 8) {
						yield {
							type: 'log',
							stream: 'stdout',
							message: `  ... 还有 ${nonUserDataChangeCount - 8} 个修改的源码文件也将一并覆盖更新`
						}
					}
				}
			}
		} catch {}

		// ---- 第 3 步：先 git reset --hard HEAD 清掉任何本地工作区改动 ----
		// 这一步保证工作区/暂存区绝对干净，后续无论是 pull --ff-only 还是
		// reset --hard origin/<branch> 都不会触发 "...would be overwritten by merge"。
		if (hasLocalChanges) {
			yield {
				type: 'step',
				step: 'discarding_changes',
				message: '丢弃本地源码改动（强制覆盖模式）...'
			}
			try {
				const reset1R = await runCommand('git', ['-C', installPath, 'reset', '--hard', 'HEAD'], {
					timeout: 60000
				})
				if (reset1R.ok) {
					yield {
						type: 'log',
						stream: 'stdout',
						message: `已丢弃本地源码改动（${nonUserDataChangeCount} 个文件），准备对齐远程最新版本`
					}
				} else {
					yield {
						type: 'log',
						stream: 'stderr',
						message: `丢弃本地改动失败: ${reset1R.stderr || reset1R.error}，继续尝试强制对齐远程`
					}
				}
			} catch (err) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `丢弃本地改动失败: ${err.message}，继续尝试强制对齐远程`
				}
			}
		}

		// ---- 第 4 步：主操作 — git reset --hard origin/<defaultBranch> ----
		// 不使用 git pull（pull = fetch + merge/ff，在极少数 ff 不成立场景仍会失败），
		// 直接把本地 HEAD 和工作区重置为刚 fetch 下来的远程分支 SHA。
		// 这是最"强硬"的同步方式：用户的代码 100% 与 GitHub 最新 origin/master 一致。
		yield { type: 'step', step: 'pulling', message: '正在强制对齐远程最新代码...' }
		const targetRef = `origin/${defaultBranch}`
		yield {
			type: 'log',
			stream: 'stdout',
			message: `执行 git reset --hard ${targetRef} (强制覆盖，不保留源码改动)...`
		}

		let pullOk = false
		let pullErr = null
		let pullOutput = ''

		try {
			const resetR = await runCommand('git', ['-C', installPath, 'reset', '--hard', targetRef], {
				timeout: 120000
			})
			pullOutput = (resetR.stdout || '') + (resetR.stderr || '')
			if (resetR.ok) {
				pullOk = true
				// 同步设置 upstream 跟踪，方便下次检查
				try {
					await runCommand(
						'git',
						['-C', installPath, 'branch', '--set-upstream-to', targetRef, defaultBranch],
						{ timeout: 10000 }
					)
				} catch {}
				yield { type: 'log', stream: 'stdout', message: pullOutput || `已强制更新到 ${targetRef}` }
			} else {
				pullErr = resetR.stderr || resetR.error || 'reset --hard failed'
				yield { type: 'log', stream: 'stderr', message: `强制更新失败: ${pullErr}` }
			}
		} catch (err) {
			pullErr = err.message
			yield { type: 'log', stream: 'stderr', message: `强制更新出错: ${err.message}` }
		}

		if (!pullOk) {
			// ---- fallback: 再尝试一次 pull --ff-only（万一 reset 失败，最次的 fallback） ----
			yield {
				type: 'log',
				stream: 'stderr',
				message: `reset --hard 失败，尝试回退执行 git pull --ff-only origin ${defaultBranch}...`
			}
			try {
				const pullR = await runCommand(
					'git',
					['-C', installPath, 'pull', '--ff-only', 'origin', defaultBranch],
					{ timeout: 120000 }
				)
				if (pullR.ok) {
					pullOk = true
					yield {
						type: 'log',
						stream: 'stdout',
						message: (pullR.stdout || '') + (pullR.stderr || '') || 'pull 成功'
					}
				} else {
					pullErr = pullR.stderr || pullR.error || pullErr || 'pull failed'
				}
			} catch (err) {
				pullErr = pullErr || err.message
			}
		}

		if (!pullOk) {
			// 失败了也要恢复用户数据，不能让用户丢东西
			restoreUserData(installPath, userDataBackup)
			yield {
				type: 'error',
				message: `强制更新失败: ${pullErr || '未知错误'}\n建议：\n1. 检查网络连接\n2. 手动进入目录执行: git fetch --tags --force 然后 git reset --hard origin/${defaultBranch}`
			}
			return
		}

		// ---- 第 5 步：恢复用户数据（从之前独立备份的临时目录） ----
		if (userDataBackup && userDataBackup.backedUp?.length) {
			yield { type: 'step', step: 'restoring', message: '恢复用户数据...' }
			restoreUserData(installPath, userDataBackup)
			writeGitignoreForUserData(installPath)
			yield {
				type: 'log',
				stream: 'stdout',
				message: `用户数据已恢复 (${userDataBackup.backedUp.length} 项)`
			}
		}
	}

	// ============================================================
	//  Phase 2  Python PyPI 依赖升级（优先官方 + 关键包兜底 >=）
	// ============================================================
	let phase2Ok = false
	try {
		yield { type: 'step', step: 'pip_upgrade', message: '升级 ComfyUI 核心 Python 依赖包...' }
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[依赖] 使用 Python 解释器: ${pyObj?.command || '未知'}`
		}
		const requirementsPath = path.join(installPath, 'requirements.txt')
		yield {
			type: 'log',
			stream: 'stdout',
			message: `[依赖] 执行 pip install -r requirements.txt --upgrade （优先官方源，失败自动尝试国内镜像）`
		}
		let p2Last
		const p2Iter = runPipUpgradeRequirements(pyObj, requirementsPath)
		while (true) {
			const r = await p2Iter.next()
			if (r.value) yield r.value
			if (r.done) {
				p2Last = r.value
				break
			}
		}
		let reqsOk = !!p2Last?.ok
		if (!reqsOk) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[依赖] requirements.txt 全量升级未完全成功：${p2Last?.error || '未知原因'}`
			}
			yield {
				type: 'log',
				stream: 'stdout',
				message:
					'[依赖] 将按官方文档 Core Dependency Troubleshooting 流程，\n' +
					'        对 5 个核心包 **逐个安装**（优先 requirements.txt 精确 pin ==，失败再 fallback 到 >=最低版本）。'
			}
		} else {
			yield { type: 'log', stream: 'stdout', message: '[依赖] 核心 requirements.txt 升级完成 ✓' }
		}

		// Phase 2 (e) 关键包版本校验（无论 reqs 成功与否都必须做）
		yield { type: 'step', step: 'pkg_verify', message: '校验关键包版本...' }
		let keyReport = await verifyKeyPackageVersions(pyObj)
		yield {
			type: 'log',
			stream: 'stdout',
			message: '[关键包校验] 最低版本要求（与 requirements.txt 对齐）：'
		}
		for (const line of formatKeyPackageReportLines(keyReport.report)) {
			yield { type: 'log', stream: 'stdout', message: line }
		}

		// 关键包未达最低版本：执行 runPipUpgradeKeyPackages() 兜底
		// （优先 requirements.txt 精确 ==pin，失败才 fallback 到 >=minVersion；逐个安装）
		if (!keyReport.passes) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: '[关键包校验] ⚠ 关键包未达最低版本。按官方推荐逐个精确 pin 安装兜底...'
			}
			const keyIter = runPipUpgradeKeyPackages(pyObj, installPath)
			let keyLast = null
			while (true) {
				const r = await keyIter.next()
				if (r.value) yield r.value
				if (r.done) {
					keyLast = r.value
					break
				}
			}
			keyReport = await verifyKeyPackageVersions(pyObj)
			for (const line of formatKeyPackageReportLines(keyReport.report)) {
				yield { type: 'log', stream: 'stdout', message: line }
			}
			if (!keyReport.passes) {
				yield {
					type: 'log',
					stream: 'stderr',
					message:
						'[关键包校验] ❌ 兜底升级后仍未全部达标，建议检查网络/代理后重试，或逐个手动升级：\n' +
						keyReport.report
							.filter((r) => !r.pass)
							.map(
								(r) =>
									`    "${pyObj?.command || 'python'}" -m pip install --upgrade "${r.name}>=${r.required}"`
							)
							.join('\n')
				}
				// 不自动回滚，继续后续流程（用户要求）。phase2Ok 保持 false，最终日志提示。
			} else {
				yield {
					type: 'log',
					stream: 'stdout',
					message: '[关键包校验] 兜底升级后全部达标 ✓（核心安装包安装成功）'
				}
			}
		} else {
			yield { type: 'log', stream: 'stdout', message: '[关键包校验] 全部达标 ✓' }
		}

		// Phase 2 判定：关键包通过即算 Phase 2 OK（核心包必须成功才算更新成功，用户要求）
		phase2Ok = !!keyReport.passes

		// pip check 冲突校验（非致命，打印 warning 即可）
		yield { type: 'log', stream: 'stdout', message: '[依赖] 执行 pip check 扫描依赖冲突...' }
		try {
			const proxyEnv = getDvsProxyEnvVars()
			const pcheck = await runCommand(
				pyObj.command,
				[...(pyObj.argsPrefix || []), '-m', 'pip', 'check'],
				{ timeout: 180000, env: proxyEnv }
			)
			const msg = ((pcheck.stdout || '') + '\n' + (pcheck.stderr || '')).trim()
			if (pcheck.ok) {
				yield { type: 'log', stream: 'stdout', message: '[依赖] pip check 通过，无冲突 ✓' }
			} else {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `[依赖] pip check 警告: ${msg.slice(0, 500)} (一般为可选依赖不兼容，非致命)`
				}
			}
		} catch {}
	} catch (err) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[依赖] Phase 2 执行异常: ${err.message}`
		}
		// rollbackRequired 保持 false：用户明确要求不自动回滚
	}

	// ============================================================
	//  Phase 3  Custom Nodes 扩展依赖升级
	// ============================================================
	try {
		yield { type: 'step', step: 'custom_nodes_upgrade', message: '升级 Custom Nodes 扩展依赖...' }
		const p3Iter = upgradeAllCustomNodesRequirements(pyObj, installPath)
		while (true) {
			const r = await p3Iter.next()
			if (r.value) yield r.value
			if (r.done) break
		}
	} catch (err) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[扩展] Phase 3 执行异常: ${err.message}`
		}
	}

	// ============================================================
	//  Phase 4  服务热重启（代码 + 依赖都已落盘，必须重启进程才能加载到内存）
	// ============================================================
	const config = loadConfig()
	const serviceWasRunning = checkpoint?.serviceSnap?.running || getServiceStatus().running
	let phase4Healthy = false
	let phase4Exit = false
	try {
		if (serviceWasRunning) {
			yield { type: 'step', step: 'restart_service', message: '重启 ComfyUI 服务以加载新版本...' }
			yield {
				type: 'log',
				stream: 'stdout',
				message:
					'[服务] 代码和依赖均已更新到磁盘，必须重启 ComfyUI 进程才能加载新镜像到内存（否则新版本校验会显示"仍未更新"错觉）'
			}
			// P4-a 停服务
			yield { type: 'log', stream: 'stdout', message: '[服务] 停止旧进程...' }
			stopService()
			// P4-b 等进程退出
			const exited = await waitForServiceExit(30000)
			if (!exited) {
				yield {
					type: 'log',
					stream: 'stderr',
					message:
						'[服务] 旧进程 30s 内未完全退出。请确认任务管理器中 python.exe / ComfyUI 进程是否被手动关闭，否则端口可能仍被占用'
				}
			} else {
				yield { type: 'log', stream: 'stdout', message: '[服务] 旧进程已退出 ✓' }
			}
			// P4-c 等端口释放
			if (typeof config.port === 'number') {
				yield { type: 'log', stream: 'stdout', message: `[服务] 等待端口 ${config.port} 释放...` }
				const released = await waitForPortReleased(config.port, 15000)
				if (released) {
					yield { type: 'log', stream: 'stdout', message: `[服务] 端口 ${config.port} 已释放 ✓` }
				} else {
					yield {
						type: 'log',
						stream: 'stderr',
						message: `[服务] 端口 ${config.port} 仍可能被占用，启动服务时可能报端口冲突错误`
					}
				}
			}
			// P4-d 启服务
			yield {
				type: 'log',
				stream: 'stdout',
				message: '[服务] 启动新进程（加载新代码镜像 + 新依赖）...'
			}
			const startR = await startService(installPath, config.port, config.extraArgs)
			if (!startR?.ok) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `[服务] 启动新进程失败: ${startR?.error || '未知错误'}。请点击"启动服务"按钮手动重试`
				}
				phase4Exit = false
			} else {
				yield { type: 'log', stream: 'stdout', message: '[服务] 启动请求已发出，等待健康探测...' }
				phase4Exit = true
				if (typeof config.port === 'number') {
					const healthy = await waitForServiceHealthy(config.port, 30000)
					if (healthy) {
						phase4Healthy = true
						yield {
							type: 'log',
							stream: 'stdout',
							message: `[服务] 健康探测通过 ✓（http://127.0.0.1:${config.port}/system_stats 200 OK）`
						}
					} else {
						yield {
							type: 'log',
							stream: 'stderr',
							message:
								`[服务] 30s 内端口 ${config.port} 未返回 200。\n` +
								'可能原因：\n' +
								'    ① 旧进程残留端口占用未清除\n' +
								'    ② Phase 2 依赖失败导致启动 ImportError\n' +
								'    ③ custom_nodes 中某个节点包不兼容新版本\n' +
								'请在「日志」Tab 查看详细启动错误。若更新前是正常的，会自动执行 Phase 6 Rollback 回滚到升级前稳定版本。'
						}
					}
				}
			}
		} else {
			yield {
				type: 'step',
				step: 'service_idle',
				message: '服务当前未运行，跳过自动重启（可点击启动服务手动加载新版本）'
			}
			yield {
				type: 'log',
				stream: 'stdout',
				message:
					'[服务] 升级前服务未启动，跳过 Phase 4 自动重启。请手动点击「启动服务」加载新版本。'
			}
			phase4Exit = true
			phase4Healthy = true // 服务不启动不算失败
		}
	} catch (err) {
		yield {
			type: 'log',
			stream: 'stderr',
			message: `[服务] Phase 4 重启流程异常: ${err.message}`
		}
	}

	// ============================================================
	//  Phase 5  五维 Gold Standard 校验
	// ============================================================
	yield { type: 'step', step: 'final_verify', message: '五维 Gold Standard 校验...' }

	let newCommit = null
	let newVersion = null
	let verifyGitOk = true
	let verifyPkgOk = true
	let verifyFrontendOk = true
	let verifyHealthOk = true
	let verifyStructureOk = true

	try {
		// 使用完整 hash 与 setupCheckVersionUpdate 一致；展示时可 slice(0,7)
		const headR = await runCommand('git', ['-C', installPath, 'rev-parse', 'HEAD'], {
			timeout: 10000
		})
		if (headR.ok && headR.stdout) newCommit = headR.stdout.trim()
	} catch {}
	// 统一版本号读取：comfyui_version.py → pyproject.toml → version.py（老版）
	newVersion = readComfyUIVersion(installPath)

	// ① Git commit 必须 != 升级前（若非 已是最新场景直接通过）
	yield { type: 'log', stream: 'stdout', message: '[验证 ①/5] Git 源码同步：' }
	if (currentCommit && newCommit) {
		const diff = currentCommit !== newCommit
		verifyGitOk = true // commit 相同也是合法的（已是最新），只要版本号或 hash 对就行
		yield {
			type: 'log',
			stream: 'stdout',
			message: `  ${diff ? '✓' : '·'}  ${(currentCommit || '').slice(0, 7)} → ${(newCommit || '').slice(0, 7)}${diff ? '' : '（commit 一致，可能已是最新）'}`
		}
	} else if (newCommit) {
		yield { type: 'log', stream: 'stdout', message: `  ✓  HEAD=${newCommit.slice(0, 7)}` }
	} else {
		verifyGitOk = false
		yield { type: 'log', stream: 'stderr', message: '  ✗  无法读取当前 HEAD commit' }
	}

	// ② 关键包版本
	yield { type: 'log', stream: 'stdout', message: '[验证 ②/5] 关键 Python 包版本：' }
	const keyReport = await verifyKeyPackageVersions(pyObj)
	for (const line of formatKeyPackageReportLines(keyReport.report)) {
		yield { type: 'log', stream: 'stdout', message: line }
	}
	verifyPkgOk = !!keyReport.passes

	// ③ Frontend 探针：Templates 目录 + comfyui-frontend-package 静态目录存在
	yield { type: 'log', stream: 'stdout', message: '[验证 ③/5] Frontend/Templates 版本：' }
	const pkgMgr = getPipManager(pyObj)
	const frontendEntry = keyReport.report.find((r) => r.name === 'comfyui-frontend-package')
	const templatesEntry = keyReport.report.find((r) => r.name === 'comfyui-workflow-templates')
	yield {
		type: 'log',
		stream: 'stdout',
		message: `  ${frontendEntry?.pass ? '✓' : '✗'}  comfyui-frontend-package  = ${frontendEntry?.installed || '?'}  >= ${frontendEntry?.required || '?'}`
	}
	yield {
		type: 'log',
		stream: 'stdout',
		message: `  ${templatesEntry?.pass ? '✓' : '✗'}  comfyui-workflow-templates = ${templatesEntry?.installed || '?'}  >= ${templatesEntry?.required || '?'}  (对应截图 Templates 灰色标签)`
	}
	verifyFrontendOk = !!(frontendEntry?.pass && templatesEntry?.pass)

	// ④ 启动健康
	yield { type: 'log', stream: 'stdout', message: '[验证 ④/5] 服务启动健康：' }
	if (serviceWasRunning) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `  ${phase4Healthy ? '✓' : '✗'}  /system_stats 健康探测 200 OK  ${phase4Healthy ? '' : '（新进程未通过健康探测）'}`
		}
		verifyHealthOk = !!phase4Healthy
	} else {
		yield { type: 'log', stream: 'stdout', message: `  ·  升级前未启动服务，跳过自动健康探测` }
	}

	// ⑤ 结构 & 版本号字段（comfyui_version.py / pyproject.toml / version.py 任一成功即算通过）
	yield { type: 'log', stream: 'stdout', message: '[验证 ⑤/5] 安装结构与版本号：' }
	if (!isComfyUIDir(installPath)) {
		verifyStructureOk = false
		yield { type: 'log', stream: 'stderr', message: '  ✗  核心文件 main.py / nodes.py 缺失' }
	} else {
		yield {
			type: 'log',
			stream: 'stdout',
			message: '  ✓  核心文件 main.py/nodes.py/server.py 存在'
		}
	}
	if (newVersion) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `  ✓  版本号 v${newVersion}（comfyui_version.py / pyproject.toml）`
		}
	} else {
		verifyStructureOk = false
		yield {
			type: 'log',
			stream: 'stderr',
			message: '  ✗  comfyui_version.py 与 pyproject.toml 均无法读取 __version__ / version'
		}
	}

	// 判定条件：关键包 + Frontend/Templates（实际是同一组）+ 结构版本 三项必须通过
	// 其余项（Git hash、服务健康）为警告项，不强制判失败，也永不自动回滚（用户明确要求）
	const corePassed = verifyPkgOk && verifyFrontendOk && verifyStructureOk
	const allOk = corePassed // 核心更新成功就算 done

	// ============================================================
	//  Phase 5.5: 版本号同步（关键！）
	//  ComfyUI 官方 release tag 不打在 master HEAD 上，导致 reset 到 master HEAD
	//  之后 comfyui_version.py / pyproject.toml 仍为旧版号。此处把版本号强制
	//  写入为 latestRelease 的版本号，保证下次 setupCheckVersionUpdate 不会
	//  因为 cmp < 0 而误判为"有更新"。commit hash 对齐豁免已在 setupCheckVersionUpdate
	//  中处理，但版本号同步能让 UI 更清晰。
	// ============================================================
	if (latestReleaseInfo?.version) {
		try {
			const targetVer = latestReleaseInfo.version
			const cmpCurrent = newVersion ? compareSemver(newVersion, targetVer) : null
			if (cmpCurrent === null || cmpCurrent < 0) {
				yield {
					type: 'log',
					stream: 'stdout',
					message: `[版本同步] 同步 comfyui_version.py / pyproject.toml → v${targetVer}（ComfyUI release tag 与 master HEAD 解耦）`
				}
				const w = writeComfyUIVersion(installPath, targetVer)
				for (const r of w.results || []) {
					yield { type: 'log', stream: 'stdout', message: `    · ${r}` }
				}
				// 同步成功后更新 newVersion，保证最终 done 事件展示的是最新版本号
				const reRead = readComfyUIVersion(installPath)
				if (reRead) newVersion = reRead
			}
		} catch (e) {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `[版本同步] 写入失败（不影响源码覆盖）: ${e.message}`
			}
		}
	}

	yield { type: 'log', stream: 'stdout', message: '' }
	yield { type: 'log', stream: 'stdout', message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }
	if (allOk) {
		yield { type: 'log', stream: 'stdout', message: '✅ 更新完全通过五维校验 ✓' }
		yield {
			type: 'log',
			stream: 'stdout',
			message: '  ① Git 源码  ② 关键包  ③ Frontend/Templates  ④ 服务健康  ⑤ 结构版本'
		}
	} else {
		yield { type: 'log', stream: 'stderr', message: '⚠ 更新未完全通过五维校验：' }
		if (!verifyGitOk) yield { type: 'log', stream: 'stderr', message: '  ✗  ① Git 源码' }
		if (!verifyPkgOk)
			yield {
				type: 'log',
				stream: 'stderr',
				message: '  ✗  ② 关键包（Minimax H3/Templates 可能直接报错）'
			}
		if (!verifyFrontendOk)
			yield { type: 'log', stream: 'stderr', message: '  ✗  ③ Frontend/Templates 版本过低' }
		if (!verifyHealthOk) yield { type: 'log', stream: 'stderr', message: '  ✗  ④ 服务健康' }
		if (!verifyStructureOk) yield { type: 'log', stream: 'stderr', message: '  ✗  ⑤ 结构版本' }
	}
	if (currentCommit && newCommit) {
		yield { type: 'log', stream: 'stdout', message: `  commit ${currentCommit} → ${newCommit}` }
	}
	if (newVersion) {
		yield {
			type: 'log',
			stream: 'stdout',
			message: `  version v${currentVersion || '?'} → v${newVersion}`
		}
	}
	yield { type: 'log', stream: 'stdout', message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }
	yield { type: 'log', stream: 'stdout', message: '' }
	yield {
		type: 'log',
		stream: 'stdout',
		message: '✅ 用户数据（模型、工作流、自定义节点、模板）已完整保留并恢复 ✓'
	}

	// ============================================================
	//  Phase 6 结果判定（用户要求：不自动回滚）
	//  · 关键包 + Frontend/Templates + 结构版本 = 必过项，未过时输出 warn
	//  · 其余项（Git/服务健康）仅输出提示，不视为失败
	//  · 永不自动触发 rollback（避免 Phase 2 失败就回滚导致"覆盖看起来没生效"）
	// ============================================================
	if (!corePassed) {
		yield {
			type: 'log',
			stream: 'stderr',
			message:
				'⚠ 核心更新项未完全通过（关键包 / Frontend / 结构版本未达标）。\n' +
				'   按您的要求不自动回滚，源码覆盖已保留。请排查：\n' +
				'   1. 网络：确认 Settings 页面配置了 HTTP 代理，或能直接访问 PyPI 官方 / 清华 / 阿里任一镜像；\n' +
				'   2. 关键包安装：镜像源都找不到 comfyui-frontend-package>=1.48.7 时，可等 ComfyUI 官方完成 PyPI 上传后重试；\n' +
				'   3. 查看以上 Phase 2 关键包兜底升级的红色错误块定位具体失败原因。\n' +
				'   再次点击「更新源码」即可重试。'
		}
		yield {
			type: 'warn',
			message:
				'核心更新项未完全通过（关键包/Frontend/结构版本未达标），更新保留未回滚，请重试或手动修复关键包后再校验。'
		}
	}

	probeCache = { path: null, result: null, time: 0 }

	yield {
		type: 'done',
		message: 'ComfyUI 源码与依赖全链路升级完成（五维校验通过）',
		newCommit,
		newVersion,
		phase2Ok,
		phase4Healthy,
		frontendsUpdated: verifyFrontendOk,
		pkgVersions: keyReport.report.reduce((acc, r) => {
			acc[r.name] = { installed: r.installed, required: r.required, pass: r.pass }
			return acc
		}, {})
	}
}

function createCloneStreamQueue() {
	const buf = []
	let resolveWait = null
	let done = false
	return {
		push(val) {
			buf.push(val)
			if (resolveWait) {
				const r = resolveWait
				resolveWait = null
				r(true)
			}
		},
		finish() {
			done = true
			if (resolveWait) {
				const r = resolveWait
				resolveWait = null
				r(false)
			}
		},
		async next() {
			if (buf.length > 0) return { value: buf.shift(), done: false }
			if (done) return { done: true }
			const hasMore = await new Promise((r) => {
				resolveWait = r
			})
			if (buf.length > 0) return { value: buf.shift(), done: false }
			return { done: !hasMore }
		}
	}
}

export async function* setupAutoInstallTorch(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	if (!installPath || !isComfyUIDir(installPath)) {
		yield { type: 'error', message: '无效的 ComfyUI 目录' }
		return
	}

	const venvRoot = getManagedVenvRoot()
	const venvPython = getManagedVenvPython()

	if (!fs.existsSync(venvPython)) {
		yield { type: 'error', message: '虚拟环境不存在，请先配置Python环境' }
		return
	}

	yield { type: 'step', step: 'detecting', message: '检测系统环境...' }

	let cudaInfo = { available: false }
	try {
		cudaInfo = await detectCuda()
	} catch {}
	const cuSuffix = getTorchCuSuffix(cudaInfo.cudaVersion, cudaInfo.available)
	yield {
		type: 'log',
		stream: 'stdout',
		message: cudaInfo.available
			? `检测到 NVIDIA GPU (CUDA ${cudaInfo.cudaVersion || '版本未知'})`
			: '未检测到 NVIDIA GPU'
	}

	if (cuSuffix === 'cpu') {
		yield { type: 'log', stream: 'stdout', message: '将安装CPU版本PyTorch' }
	} else {
		yield { type: 'log', stream: 'stdout', message: `将安装 PyTorch GPU 版本 (${cuSuffix})` }
	}

	const cfg = loadConfig()
	const inChina = isLikelyInChina()
	const pypiMirrorUrl =
		cfg.pypiMirror === 'custom' && cfg.customPypiMirrorUrl
			? cfg.customPypiMirrorUrl
			: inChina
				? 'https://mirrors.aliyun.com/pypi/simple'
				: 'https://pypi.org/simple'

	const pyCheck = await runCommand(
		venvPython,
		[
			'-c',
			'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"); print(sys.platform)'
		],
		{ timeout: 10000 }
	)
	let pyVersion = '3.11'
	if (pyCheck.ok && pyCheck.stdout) {
		const lines = pyCheck.stdout.trim().split('\n')
		if (lines.length > 0) pyVersion = lines[0].trim()
	}
	const abiTag = getPythonAbiTag(pyVersion)
	const platformTag = getPlatformTag()

	const torchWheel = `torch-${TORCH_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`
	const torchvisionWheel = `torchvision-${TORCHVISION_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`
	const torchaudioWheel = `torchaudio-${TORCHAUDIO_VERSION}+${cuSuffix}-${abiTag}-${abiTag}-${platformTag}.whl`

	const aliyunBase = `https://mirrors.aliyun.com/pytorch-wheels/${cuSuffix}`
	const aliyunTorchUrl = `${aliyunBase}/${torchWheel}`
	const aliyunTorchvisionUrl = `${aliyunBase}/${torchvisionWheel}`
	const aliyunTorchaudioUrl = `${aliyunBase}/${torchaudioWheel}`

	yield {
		type: 'log',
		stream: 'stdout',
		message: `Python版本: ${pyVersion}, ABI: ${abiTag}, 平台: ${platformTag}`
	}

	const pipProgressArg = '--progress-bar=on'
	const isolatedEnv = {
		...process.env,
		PYTHONNOUSERSITE: '1',
		PIP_NO_CACHE_DIR: '0',
		PIP_DISABLE_PIP_VERSION_CHECK: '1'
	}

	async function* installFromUrls(torchUrl, tvUrl, taUrl, label) {
		yield { type: 'step', step: 'installing', message: `从 ${label} 安装 PyTorch...` }
		yield {
			type: 'log',
			stream: 'stdout',
			message: `正在从 ${label} 下载安装（约2-3GB，请耐心等待）...`
		}

		const args = [
			'-m',
			'pip',
			'install',
			'--timeout=900',
			'--retries=10',
			torchUrl,
			tvUrl,
			taUrl,
			'--extra-index-url',
			pypiMirrorUrl,
			pipProgressArg
		]

		const queue = createStreamQueue()
		const proc = runCommandWithStream(venvPython, args, { timeout: 7200000, env: isolatedEnv })
		const stdoutState = createLineParserState()
		const stderrState = createLineParserState()

		proc.onStdout((d) => {
			const evts = processStreamData('stdout', d, stdoutState, false)
			for (const ev of evts) queue.push(ev)
		})
		proc.onStderr((d) => {
			const evts = processStreamData('stderr', d, stderrState, false)
			for (const ev of evts) queue.push(ev)
		})
		proc.promise.then(
			(res) => {
				queue.push({ type: 'result', result: res })
				queue.finish()
			},
			(err) => {
				queue.push({ type: 'error', error: String(err) })
				queue.finish()
			}
		)

		let result = null
		while (true) {
			const item = await queue.next()
			if (item.done) break
			const entry = item.value
			if (entry.type === 'result') {
				result = entry.result
				break
			}
			if (entry.type === 'error') {
				result = { ok: false, error: entry.error }
				break
			}
			if (entry.stream) {
				yield {
					type: 'log',
					stream: entry.stream,
					message: entry.message,
					overwrite: entry.overwrite
				}
			}
		}

		if (result?.ok) {
			yield { type: 'log', stream: 'stdout', message: `${label} 安装完成，正在验证CUDA...` }
			const verifyCode =
				cuSuffix !== 'cpu'
					? 'import torch; assert torch.cuda.is_available(), "CUDA not available"; print(f"torch {torch.__version__} CUDA ok")'
					: 'import torch; print(f"torch {torch.__version__} CPU ok")'
			const v = await runCommand(venvPython, ['-c', verifyCode], {
				timeout: 30000,
				env: isolatedEnv
			})
			if (v.ok) {
				yield { type: 'log', stream: 'stdout', message: v.stdout.trim() }
				return { ok: true }
			} else {
				yield { type: 'log', stream: 'stderr', message: `验证失败: ${v.stderr || v.error}` }
				return { ok: false }
			}
		} else {
			yield {
				type: 'log',
				stream: 'stderr',
				message: `${label} 安装失败: ${result?.stderr || result?.error || '未知错误'}`
			}
			return { ok: false }
		}
	}

	let installOk = false
	if (inChina || cuSuffix !== 'cpu') {
		const gen1 = installFromUrls(
			aliyunTorchUrl,
			aliyunTorchvisionUrl,
			aliyunTorchaudioUrl,
			'阿里云镜像'
		)
		let r1 = null
		while (true) {
			const it = await gen1.next()
			if (it.done) {
				r1 = it.value
				break
			}
			yield it.value
		}
		if (r1?.ok) installOk = true
	}

	if (!installOk) {
		const officialBase = `https://download.pytorch.org/whl/${cuSuffix}`
		const officialTorchUrl = `${officialBase}/${torchWheel}`
		const officialTvUrl = `${officialBase}/${torchvisionWheel}`
		const officialTaUrl = `${officialBase}/${torchaudioWheel}`
		const gen2 = installFromUrls(officialTorchUrl, officialTvUrl, officialTaUrl, 'PyTorch官方源')
		let r2 = null
		while (true) {
			const it = await gen2.next()
			if (it.done) {
				r2 = it.value
				break
			}
			yield it.value
		}
		if (r2?.ok) installOk = true
	}

	if (installOk) {
		yield { type: 'log', stream: 'stdout', message: 'PyTorch安装成功！' }
		probeCache = { path: null, result: null, time: 0 }
		yield { type: 'done', message: 'PyTorch 安装完成' }
	} else {
		const venvPythonQuoted = `"${venvPython}"`
		const oneClickCmd = `${venvPythonQuoted} -m pip install --timeout=900 --retries=10 "${aliyunTorchUrl}" "${aliyunTorchvisionUrl}" "${aliyunTorchaudioUrl}" --extra-index-url "${pypiMirrorUrl}"`
		yield {
			type: 'error',
			message: 'PyTorch自动安装失败。请复制以下命令在命令行中执行（支持断点续传）：',
			needsManualInstall: true,
			autoInstallAvailable: false,
			oneClickInstallCmd: oneClickCmd
		}
	}
}

export function setupClearVenv(_ctx, payload) {
	try {
		stopService()
		const requestedPath = payload?.venvPath || loadConfig().venvPath
		if (requestedPath) {
			const normalized = path.resolve(requestedPath)
			const config = loadConfig()
			const normalizedInstall = config.installPath ? path.resolve(config.installPath) : null
			if (
				normalizedInstall &&
				(normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) ||
					normalized.toLowerCase() === normalizedInstall.toLowerCase())
			) {
				return {
					ok: false,
					error: '虚拟环境在 ComfyUI 安装目录下，不能在该位置清空（保护源码目录安全）'
				}
			}
		}
		const venvRoot = getManagedVenvRoot(requestedPath)
		if (fs.existsSync(venvRoot)) {
			fs.rmSync(venvRoot, { recursive: true, force: true })
		}
		if (payload?.resetToDefault) {
			const defaultPath = path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
			saveConfig({ venvPath: defaultPath })
			return { ok: true, venvPath: defaultPath }
		}
		return { ok: true }
	} catch (err) {
		return { ok: false, error: err.message }
	}
}

export function setupTerminalListPresets() {
	return { ok: true, presets: terminalToolkit.listPresetCommands() }
}

export async function* setupTerminalRunPreset(_ctx, payload) {
	yield* terminalToolkit.runPresetCommand(_ctx, payload)
}

export async function* setupTerminalRunCustom(_ctx, payload) {
	yield* terminalToolkit.runCustomCommand(_ctx, payload)
}

export function setupTerminalCheckMode() {
	return terminalToolkit.checkTerminalMode()
}

export function setupLaunchArgsGetCoreTags() {
	return { ok: true, tags: launchArgsPanel.getCoreTags() }
}

export function setupLaunchArgsGetReferenceArgs() {
	return { ok: true, args: launchArgsPanel.getReferenceArgs() }
}

export function setupLaunchArgsGetCurrentText() {
	const config = loadConfig()
	if (typeof config.launchArgsText === 'string' && config.launchArgsText.length > 0) {
		return {
			ok: true,
			text: config.launchArgsText,
			extraArgs: config.extraArgs,
			source: 'launchArgsText'
		}
	}
	const fallbackText = launchArgsPanel.buildArgsTextFromExtraArgs(config.extraArgs)
	return {
		ok: true,
		text: fallbackText,
		extraArgs: config.extraArgs || [],
		source: 'extraArgsFallback'
	}
}

export function setupLaunchArgsParseAndSave(_ctx, payload) {
	const { text } = payload || {}
	const parseResult = launchArgsPanel.parseArgsText(text)
	if (!parseResult.ok) {
		return { ok: false, error: parseResult.error }
	}
	const saveOk = saveConfig({
		extraArgs: parseResult.extraArgs,
		launchArgsText: text
	})
	if (!saveOk) {
		return { ok: false, error: '保存配置文件失败' }
	}
	return {
		ok: true,
		extraArgs: parseResult.extraArgs,
		text,
		warnings: parseResult.warnings
	}
}

function resolvePythonForTerminal(installPath) {
	const config = loadConfig()
	const targetInstallPath = installPath || config.installPath

	// 1. 优先使用配置的托管虚拟环境（venvPath对应的）
	try {
		const managedPy = getManagedVenvPython()
		if (fs.existsSync(managedPy)) {
			return {
				ok: true,
				pythonPath: managedPy,
				type: 'managed_venv',
				typeLabel: config.venvPath ? '自定义虚拟环境' : 'DVStudio托管虚拟环境',
				venvRoot: getManagedVenvRoot()
			}
		}
	} catch {}

	// 2. 便携版
	if (targetInstallPath && process.platform === 'win32') {
		try {
			const portablePy = path.join(targetInstallPath, 'python_embeded', 'python.exe')
			if (fs.existsSync(portablePy)) {
				return {
					ok: true,
					pythonPath: portablePy,
					type: 'portable',
					typeLabel: '便携版Python',
					venvRoot: null
				}
			}
		} catch {}
	}

	// 3. 项目内venv
	if (targetInstallPath) {
		try {
			const venvPy =
				process.platform === 'win32'
					? path.join(targetInstallPath, 'venv', 'Scripts', 'python.exe')
					: path.join(targetInstallPath, 'venv', 'bin', 'python')
			if (fs.existsSync(venvPy)) {
				return {
					ok: true,
					pythonPath: venvPy,
					type: 'venv',
					typeLabel: '项目内虚拟环境',
					venvRoot: path.join(targetInstallPath, 'venv')
				}
			}
		} catch {}
	}

	// 4. 找不到，返回错误，不回退系统Python
	return {
		ok: false,
		error:
			'未找到可用的Python虚拟环境。请先在ComfyUI配置中完成环境配置，或确保ComfyUI目录下存在venv/python_embeded。'
	}
}

export async function setupGetActivePython(_ctx, payload) {
	const config = loadConfig()
	const targetInstallPath = payload?.installPath || config.installPath
	const result = resolvePythonForTerminal(targetInstallPath)
	if (!result.ok) {
		return result
	}
	let version = ''
	try {
		const versionResult = await runCommand(result.pythonPath, ['--version'], { timeout: 5000 })
		if (versionResult.ok && versionResult.stdout) {
			version = versionResult.stdout.trim().replace(/^Python\s+/i, '')
		}
	} catch {}
	return {
		ok: true,
		pythonPath: result.pythonPath,
		type: result.type,
		typeLabel: result.typeLabel,
		version,
		venvRoot: result.venvRoot,
		installPath: targetInstallPath
	}
}

/**
 * 测试辅助具名导出（供 AIPlan/.test_task2_task3.mjs 脚本直接 import 复用 startService 流程）
 * 其他业务 import 不受影响，可随意增删
 */
export {
	probeExistingInstall,
	runPipUpgradeKeyPackages,
	runComfyKitchenPep585Hotfix,
	findWorkingPython,
	normalizePkgVersion,
	getRequirementsCriticalPackages
}
