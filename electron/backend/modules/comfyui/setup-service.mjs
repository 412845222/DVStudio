import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { spawn } from 'node:child_process'
import { app, dialog, shell, BrowserWindow } from 'electron'
import yaml from 'js-yaml'
import { internalError, invalidParamsError } from '../../core/errors.mjs'
import { processStreamData, createLineParserState } from './log-line-parser.mjs'

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
				extraArgs: Array.isArray(parsed.extraArgs) ? parsed.extraArgs : [],
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
		extraArgs: [],
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
		const child = spawn(cmd, args, {
			encoding: 'utf-8',
			...options,
			env: { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' }
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
	const exited = new Promise((resolve) => {
		child = spawn(cmd, args, {
			encoding: 'utf-8',
			...options,
			env: { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' }
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
				critical[pkgName] = exactMatch[2]
			}
		}
	} catch {}
	return critical
}

async function findWorkingPython(comfyDir, installType) {
	const candidates = []
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
			error: undefined
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
									if (!installedVer) {
										versionMismatches.push(`${pkg}==${requiredVer} (未安装)`)
									} else if (installedVer !== requiredVer) {
										versionMismatches.push(`${pkg} 需要 ${requiredVer}，当前 ${installedVer}`)
									}
								}
							} catch {}
						}
					} catch {}
				}

				const versionBlockOk = versionMismatches.length === 0

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
				if (mainR.ok && mainR.stdout.includes('MAIN_OK') && versionBlockOk) {
					info.canStartComfy = true
				} else {
					info.canStartComfy = false
					const errParts = []
					if (versionMismatches.length > 0) {
						errParts.push('依赖版本不匹配: ' + versionMismatches.join(', '))
					}
					const importErrs = (mainR.stderr || mainR.stdout || '')
						.split(/\r?\n/)
						.filter((l) => l.includes('ModuleNotFoundError') || l.includes('ImportError'))
						.slice(0, 3)
						.join('; ')
					if (importErrs) errParts.push(importErrs)
					info.importError = errParts.join('; ')
				}
			}
		} catch {}
		results.push(info)
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
			candidates: pyResult.candidates
		}
		result.pythonInfo = pythonInfo

		const warnings = []
		const needsFix = []
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
			}
		}

		if (result.isDesktop) {
			launchMethod = 'desktop_app'
			warnings.push('检测到ComfyUI桌面版，建议通过桌面应用启动')
		}

		if (!bestPy) {
			needsFix.push('未找到可用的Python环境')
		} else if (!bestPy.hasTorch) {
			needsFix.push('PyTorch未安装或无法导入')
		} else if (!bestPy.canImportComfy) {
			needsFix.push('无法导入comfy模块，依赖可能不完整')
		} else if (bestPy.canStartComfy === false) {
			needsFix.push(
				'启动依赖不完整' + (bestPy.importError ? `（缺少: ${bestPy.importError}）` : '')
			)
		}

		if (bestPy?.hasTorch && bestPy?.canImportComfy && bestPy?.canStartComfy !== false) {
			launchStatus = warnings.length > 0 ? 'partial' : 'full'
		}

		if (needsFix.length > 0) launchStatus = 'none'

		result.launchCompatibility = {
			status: launchStatus,
			method: launchMethod,
			canStart: launchStatus !== 'none',
			warnings: warnings.length > 0 ? warnings : undefined,
			needsFix: needsFix.length > 0 ? needsFix : undefined
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
	if (!args.includes('--disable-cuda-malloc')) {
		args.unshift('--disable-cuda-malloc')
	}

	if (serviceChildProcess && !serviceChildProcess.killed) {
		return { ok: false, error: '服务已在运行中' }
	}
	if (!isComfyUIDir(targetPath)) {
		return { ok: false, error: '无效的ComfyUI目录' }
	}

	const probe = await probeExistingInstall(targetPath)

	if (!probe.launchCompatibility?.canStart) {
		const reasons = probe.launchCompatibility?.needsFix || []
		const reasonStr = reasons.length > 0 ? `: ${reasons.join('；')}` : ''
		appendServiceLog('stderr', `[环境检测] 当前Python环境不满足启动要求${reasonStr}`)
		appendServiceLog('system', '[提示] 请点击「一键配置Python环境」修复依赖后再启动')
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

	try {
		serviceChildProcess = spawn(pythonCmd, spawnArgs, {
			cwd: targetPath,
			env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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

export async function setupCheckVersionUpdate(_ctx, payload) {
	const installPath = payload?.installPath
	if (!installPath || !fs.existsSync(installPath)) {
		return { ok: false, error: '无效的 ComfyUI 目录' }
	}

	let currentVersion = null
	let currentCommit = null
	let upstreamCommit = null
	let latestTag = null
	let updateAvailable = false
	let error = null

	try {
		const versionPath = path.join(installPath, 'version.py')
		if (fs.existsSync(versionPath)) {
			const content = fs.readFileSync(versionPath, 'utf-8')
			const vm = content.match(/__version__\s*=\s*['"]([^'"]+)['"]/)
			if (vm) currentVersion = vm[1]
		}
	} catch {}

	try {
		const headR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', 'HEAD'], {
			timeout: 8000
		})
		if (headR.ok && headR.stdout) currentCommit = headR.stdout.trim()
	} catch {}

	const isGitRepo = fs.existsSync(path.join(installPath, '.git'))

	if (isGitRepo) {
		try {
			await runCommand('git', ['-C', installPath, 'fetch', 'origin', '--tags'], { timeout: 30000 })
			try {
				const upstreamR = await runCommand(
					'git',
					['-C', installPath, 'rev-parse', '--short', '@{upstream}'],
					{ timeout: 8000 }
				)
				if (upstreamR.ok && upstreamR.stdout) {
					upstreamCommit = upstreamR.stdout.trim()
					if (currentCommit && upstreamCommit && currentCommit !== upstreamCommit) {
						updateAvailable = true
					}
				}
			} catch {}
			try {
				const descR = await runCommand(
					'git',
					['-C', installPath, 'describe', '--tags', '--abbrev=0'],
					{ timeout: 8000 }
				)
				if (descR.ok && descR.stdout) latestTag = descR.stdout.trim()
			} catch {}
		} catch (e) {
			try {
				const releaseInfo = await fetchJson(
					'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest',
					8000
				)
				if (releaseInfo?.tag_name) {
					latestTag = releaseInfo.tag_name
					if (currentVersion) {
						const current = currentVersion.replace(/^v/, '')
						const latest = latestTag.replace(/^v/, '')
						if (current !== latest) updateAvailable = true
					} else {
						updateAvailable = true
					}
				}
			} catch (e2) {
				error = '无法连接到 GitHub 检查更新，请检查网络'
			}
		}
	} else {
		try {
			const releaseInfo = await fetchJson(
				'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest',
				8000
			)
			if (releaseInfo?.tag_name) {
				latestTag = releaseInfo.tag_name
				if (currentVersion) {
					const current = currentVersion.replace(/^v/, '')
					const latest = latestTag.replace(/^v/, '')
					if (current !== latest) updateAvailable = true
				} else {
					updateAvailable = true
				}
			}
		} catch (e) {
			error = '无法连接到 GitHub 检查更新，请检查网络'
		}
	}

	return {
		ok: true,
		currentVersion,
		currentCommit,
		latestTag,
		upstreamCommit,
		updateAvailable,
		isGitRepo,
		error,
		releaseUrl: latestTag
			? `https://github.com/comfyanonymous/ComfyUI/releases/tag/${latestTag}`
			: null
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

export async function* setupUpdateComfyUI(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	if (!installPath || !fs.existsSync(installPath)) {
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
	try {
		const headR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', 'HEAD'], {
			timeout: 10000
		})
		if (headR.ok && headR.stdout) currentCommit = headR.stdout.trim()
	} catch {}

	yield { type: 'log', stream: 'stdout', message: `当前版本提交: ${currentCommit || 'unknown'}` }

	yield { type: 'step', step: 'fetching', message: '正在获取远程更新...' }
	yield { type: 'log', stream: 'stdout', message: '执行 git fetch origin...' }

	const fetchMirrors = [{ args: ['fetch', 'origin', '--tags'], label: 'GitHub官方源' }]

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
					'fetch',
					'origin',
					'--tags'
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

	let defaultBranch = 'master'
	let upstreamCommit = null

	if (nonGitInitialized) {
		yield { type: 'step', step: 'updating', message: '正在更新到最新版本...' }
		yield { type: 'log', stream: 'stdout', message: '执行 git checkout 更新源码文件...' }

		let resetOk = false
		let resetErr = null
		const branches = ['master', 'main']
		for (const branch of branches) {
			try {
				const ref = `origin/${branch}`
				const refCheck = await runCommand(
					'git',
					['-C', installPath, 'rev-parse', '--verify', ref],
					{ timeout: 10000 }
				)
				if (!refCheck.ok) continue
				upstreamCommit = refCheck.stdout.trim().slice(0, 7)
				const resetR = await runCommand('git', ['-C', installPath, 'checkout', ref, '--', '.'], {
					timeout: 120000
				})
				if (resetR.ok) {
					resetOk = true
					defaultBranch = branch
					yield { type: 'log', stream: 'stdout', message: `已更新到 ${branch} 分支最新版本` }
					break
				} else {
					resetErr = resetR.stderr || resetR.error
					yield { type: 'log', stream: 'stderr', message: `checkout ${branch}失败: ${resetErr}` }
				}
			} catch (err) {
				resetErr = err.message
			}
		}

		if (!resetOk) {
			restoreUserData(installPath, userDataBackup)
			yield { type: 'error', message: `更新失败: ${resetErr || '无法checkout到远程分支'}` }
			return
		}

		yield { type: 'log', stream: 'stdout', message: '恢复用户数据...' }
		restoreUserData(installPath, userDataBackup)
		writeGitignoreForUserData(installPath)
		yield { type: 'log', stream: 'stdout', message: '用户数据已恢复' }
	} else {
		try {
			const upR = await runCommand(
				'git',
				['-C', installPath, 'rev-parse', '--short', '@{upstream}'],
				{ timeout: 10000 }
			)
			if (upR.ok && upR.stdout) upstreamCommit = upR.stdout.trim()
		} catch {}

		if (currentCommit && upstreamCommit && currentCommit === upstreamCommit) {
			yield { type: 'log', stream: 'stdout', message: '当前已是最新版本，无需更新' }
			yield { type: 'done', message: '已是最新版本' }
			return
		}

		yield { type: 'log', stream: 'stdout', message: `远程最新提交: ${upstreamCommit || 'unknown'}` }

		yield { type: 'step', step: 'checking_changes', message: '检查本地修改...' }
		let hasLocalChanges = false
		try {
			const statusR = await runCommand('git', ['-C', installPath, 'status', '--porcelain'], {
				timeout: 10000
			})
			if (statusR.ok && statusR.stdout && statusR.stdout.trim()) {
				const userDataPaths = new Set([...COMFYUI_USER_DATA_DIRS, ...COMFYUI_USER_DATA_FILES])
				const changedFiles = statusR.stdout.trim().split('\n').filter(Boolean)
				const nonUserDataChanges = changedFiles.filter((line) => {
					const filePath = line.substring(3).trim()
					const firstPart = filePath.split(/[\\/]/)[0]
					return !userDataPaths.has(firstPart) && !userDataPaths.has(filePath)
				})
				if (nonUserDataChanges.length > 0) {
					hasLocalChanges = true
					yield {
						type: 'log',
						stream: 'stdout',
						message: `检测到源码文件有本地修改，将使用stash暂存以避免冲突`
					}
					for (const change of nonUserDataChanges.slice(0, 5)) {
						yield { type: 'log', stream: 'stdout', message: `  修改: ${change}` }
					}
					if (nonUserDataChanges.length > 5) {
						yield {
							type: 'log',
							stream: 'stdout',
							message: `  ... 还有 ${nonUserDataChanges.length - 5} 个修改文件`
						}
					}
				}
			}
		} catch {}

		if (hasLocalChanges) {
			yield { type: 'step', step: 'stashing', message: '暂存本地修改...' }
			try {
				await runCommand(
					'git',
					['-C', installPath, 'stash', 'push', '-m', 'dvstudio-auto-stash-before-update'],
					{ timeout: 15000 }
				)
				yield { type: 'log', stream: 'stdout', message: '本地修改已暂存（git stash）' }
			} catch (err) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `暂存本地修改失败: ${err.message}，继续尝试pull...`
				}
			}
		}

		yield { type: 'step', step: 'pulling', message: '正在拉取最新代码...' }
		yield { type: 'log', stream: 'stdout', message: '执行 git pull --ff-only origin master...' }

		let pullOk = false
		let pullErr = null
		let pullOutput = ''

		try {
			const pullR = await runCommand(
				'git',
				['-C', installPath, 'pull', '--ff-only', 'origin', 'master'],
				{ timeout: 120000 }
			)
			pullOutput = (pullR.stdout || '') + (pullR.stderr || '')
			if (pullR.ok) {
				pullOk = true
				yield { type: 'log', stream: 'stdout', message: pullOutput }
			} else {
				pullErr = pullR.stderr || pullR.error || 'pull failed'
				yield { type: 'log', stream: 'stderr', message: `pull master失败: ${pullErr}` }
			}
		} catch (err) {
			pullErr = err.message
			yield { type: 'log', stream: 'stderr', message: `pull出错: ${err.message}` }
		}

		if (!pullOk) {
			yield { type: 'log', stream: 'stdout', message: '尝试拉取main分支...' }
			try {
				const pullR = await runCommand(
					'git',
					['-C', installPath, 'pull', '--ff-only', 'origin', 'main'],
					{ timeout: 120000 }
				)
				pullOutput = (pullR.stdout || '') + (pullR.stderr || '')
				if (pullR.ok) {
					pullOk = true
					defaultBranch = 'main'
					yield { type: 'log', stream: 'stdout', message: pullOutput }
				} else {
					pullErr = pullR.stderr || pullR.error || 'pull main failed'
					yield { type: 'log', stream: 'stderr', message: `pull main失败: ${pullErr}` }
				}
			} catch (err) {
				pullErr = err.message
				yield { type: 'log', stream: 'stderr', message: `pull main出错: ${err.message}` }
			}
		}

		if (!pullOk) {
			if (hasLocalChanges) {
				yield { type: 'log', stream: 'stdout', message: '尝试恢复暂存的本地修改...' }
				try {
					await runCommand('git', ['-C', installPath, 'stash', 'pop'], { timeout: 10000 })
				} catch {}
			}
			yield {
				type: 'error',
				message: `拉取更新失败: ${pullErr || '未知错误'}\n可能存在冲突，建议手动在目录中执行 git pull 解决冲突后重试。`
			}
			return
		}

		if (hasLocalChanges) {
			yield { type: 'step', step: 'restoring', message: '恢复本地修改...' }
			try {
				await runCommand('git', ['-C', installPath, 'stash', 'pop'], { timeout: 10000 })
				yield { type: 'log', stream: 'stdout', message: '本地修改已恢复' }
			} catch (err) {
				yield {
					type: 'log',
					stream: 'stderr',
					message: `恢复本地修改时出现冲突: ${err.message}\n您的修改已保存在git stash中，可手动执行 git stash pop 恢复`
				}
			}
		}
	}

	yield { type: 'step', step: 'verifying', message: '验证更新结果...' }

	let newCommit = null
	let newVersion = null
	try {
		const headR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', 'HEAD'], {
			timeout: 10000
		})
		if (headR.ok && headR.stdout) newCommit = headR.stdout.trim()
	} catch {}
	try {
		const versionPath = path.join(installPath, 'version.py')
		if (fs.existsSync(versionPath)) {
			const content = fs.readFileSync(versionPath, 'utf-8')
			const vm = content.match(/__version__\s*=\s*['"]([^'"]+)['"]/)
			if (vm) newVersion = vm[1]
		}
	} catch {}

	if (!isComfyUIDir(installPath)) {
		yield { type: 'error', message: '更新后验证失败：ComfyUI核心文件缺失，请检查目录' }
		return
	}

	yield { type: 'log', stream: 'stdout', message: '' }
	yield { type: 'log', stream: 'stdout', message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }
	yield { type: 'log', stream: 'stdout', message: `更新完成！` }
	if (currentCommit && newCommit) {
		yield { type: 'log', stream: 'stdout', message: `  ${currentCommit} → ${newCommit}` }
	}
	if (newVersion) {
		yield { type: 'log', stream: 'stdout', message: `  当前版本: v${newVersion}` }
	}
	yield { type: 'log', stream: 'stdout', message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }
	yield { type: 'log', stream: 'stdout', message: '' }
	yield {
		type: 'log',
		stream: 'stdout',
		message: '注意：更新后可能需要重新安装Python依赖以兼容新版本。'
	}
	yield {
		type: 'log',
		stream: 'stdout',
		message: '您的模型、工作流、自定义节点等用户数据已完整保留。'
	}

	probeCache = { path: null, result: null, time: 0 }

	yield {
		type: 'done',
		message: 'ComfyUI 更新完成',
		newCommit,
		newVersion,
		needDepUpdate: true
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
