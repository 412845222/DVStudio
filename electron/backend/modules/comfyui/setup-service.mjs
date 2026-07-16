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
	{ key: 'pip-official', name: 'PyPI 官方', url: 'https://pypi.org/simple', kind: 'pypi', builtin: true },
	{ key: 'pip-tuna', name: '清华 TUNA', url: 'https://pypi.tuna.tsinghua.edu.cn/simple', kind: 'pypi', builtin: true },
	{ key: 'pip-aliyun', name: '阿里云', url: 'https://mirrors.aliyun.com/pypi/simple', kind: 'pypi', builtin: true },
	{ key: 'pip-ustc', name: '中科大 USTC', url: 'https://pypi.mirrors.ustc.edu.cn/simple', kind: 'pypi', builtin: true },
	{ key: 'pip-tencent', name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/pypi/simple', kind: 'pypi', builtin: true },
]

const TORCH_MIRRORS = [
	{ key: 'torch-official', name: 'PyTorch 官方', url: 'https://download.pytorch.org/whl/{cu}', kind: 'torch', builtin: true },
]

const TORCH_CUDA_MAP = [
	{ minCuda: 12.4, suffix: 'cu124', label: 'CUDA 12.4+' },
	{ minCuda: 12.1, suffix: 'cu121', label: 'CUDA 12.1' },
	{ minCuda: 11.8, suffix: 'cu118', label: 'CUDA 11.8' },
]

function getDefaultVenvPath() {
	return path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
}

function getManagedVenvRoot(customPath) {
	if (customPath) return customPath
	const config = loadConfig()
	if (config.venvPath) return config.venvPath
	return getDefaultVenvPath()
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
	} catch { return false }
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
	return mirrorDef.url.replace('{cu}', cuSuffix || 'cpu')
}

function getMirrorDef(kind, key, customUrl) {
	const list = kind === 'torch' ? TORCH_MIRRORS : PIP_MIRRORS
	const found = list.find(m => m.key === key)
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
		const req = lib.get(url, {
			timeout: timeoutMs,
			headers: { 'User-Agent': 'DVStudio-ComfyUI-Setup/1.0' },
		}, (res) => {
			const latency = Date.now() - start
			res.resume()
			resolve({ reachable: res.statusCode < 500, latency, statusCode: res.statusCode })
		})
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
		...PIP_MIRRORS.map(m => ({ key: m.key, name: m.name, url: m.url, kind: 'pypi' })),
		...TORCH_MIRRORS.map(m => ({ key: m.key, name: m.name, url: resolveMirrorUrl(m, cuSuffix), kind: 'torch' })),
	]
	const results = await Promise.all(targets.map(async (t) => {
		const pingUrlStr = t.kind === 'torch' ? t.url : t.url
		const r = await pingUrl(pingUrlStr, 5000)
		return {
			key: t.key,
			name: t.name,
			url: pingUrlStr,
			kind: t.kind,
			latency: r.reachable ? r.latency : null,
			reachable: r.reachable,
		}
	}))
	return results
}

function autoSelectMirrors(pingResults) {
	const pypiResults = pingResults.filter(r => r.kind === 'pypi' && r.reachable).sort((a, b) => (a.latency || 9999) - (b.latency || 9999))
	const torchResults = pingResults.filter(r => r.kind === 'torch' && r.reachable).sort((a, b) => (a.latency || 9999) - (b.latency || 9999))
	const pypiBest = pypiResults[0]
	const torchBest = torchResults[0]
	const officialPypi = pingResults.find(r => r.key === 'pip-official')
	const officialTorch = pingResults.find(r => r.key === 'torch-official')
	const threshold = 800
	let pypiSelection = 'pip-official'
	let torchSelection = 'torch-official'
	if (pypiBest && officialPypi?.reachable) {
		if (pypiBest.key !== 'pip-official' && (officialPypi.latency === null || officialPypi.latency > threshold) && pypiBest.latency < threshold) {
			pypiSelection = pypiBest.key
		}
	} else if (pypiBest) {
		pypiSelection = pypiBest.key
	}
	if (torchBest && officialTorch?.reachable) {
		if (torchBest.key !== 'torch-official' && (officialTorch.latency === null || officialTorch.latency > threshold) && torchBest.latency < threshold) {
			torchSelection = torchBest.key
		}
	} else if (torchBest) {
		torchSelection = torchBest.key
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
		const r = await runCommand(c.cmd, [...c.args, '-c', 'import sys; print(sys.version.split()[0]); import venv; print("venv_ok")'], { timeout: 10000 })
		if (r.ok && r.stdout) {
			const lines = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
			const version = lines[0]
			const hasVenvMod = lines.some(l => l === 'venv_ok')
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
/** @type {Array<{ts:number, stream:'stdout'|'stderr'|'system', message:string}>} */
let serviceLogBuffer = []
/** @type {{buf:string}} */
let _stdoutLineBuffer = { buf: '' }
/** @type {{buf:string}} */
let _stderrLineBuffer = { buf: '' }

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

function processStreamData(rawData, streamName, bufferHolder) {
	const text = rawData.toString('utf-8')
	const merged = bufferHolder.buf + text
	const lines = merged.split(/\r?\n/)
	const last = lines.pop()
	bufferHolder.buf = last || ''
	for (const line of lines) {
		if (line.length > 0) appendServiceLog(streamName, line)
	}
}

function flushLineBuffers() {
	if (_stdoutLineBuffer.buf) {
		appendServiceLog('stdout', _stdoutLineBuffer.buf)
		_stdoutLineBuffer.buf = ''
	}
	if (_stderrLineBuffer.buf) {
		appendServiceLog('stderr', _stderrLineBuffer.buf)
		_stderrLineBuffer.buf = ''
	}
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
				shell: false,
			}).unref()
			return
		} catch {}
	}
	try { child.kill('SIGTERM') } catch {}
	setTimeout(() => {
		try { if (!child.killed) child.kill('SIGKILL') } catch {}
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
				installPath: parsed.installPath || getDefaultInstallPath(),
				venvPath: parsed.venvPath || undefined,
				installType: parsed.installType,
				port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_COMFYUI_PORT,
				autoStart: !!parsed.autoStart,
				mirror: ['github', 'gitee', 'custom'].includes(parsed.mirror) ? parsed.mirror : 'github',
				customMirrorUrl: parsed.customMirrorUrl,
				pythonPath: parsed.pythonPath,
				extraArgs: Array.isArray(parsed.extraArgs) ? parsed.extraArgs : [],
				proxy: parsed.proxy,
				customModelPaths: Array.isArray(parsed.customModelPaths) ? parsed.customModelPaths.filter(p => typeof p === 'string' && p) : [],
				pypiMirror: typeof parsed.pypiMirror === 'string' ? parsed.pypiMirror : 'auto',
				torchMirror: typeof parsed.torchMirror === 'string' ? parsed.torchMirror : 'auto',
				customPypiMirrorUrl: parsed.customPypiMirrorUrl,
				customTorchMirrorUrl: parsed.customTorchMirrorUrl,
			}
		}
	} catch (err) {
		console.warn('[comfyui-setup] failed to load config:', err)
	}
	return {
		installMode: 'new',
		installPath: getDefaultInstallPath(),
		port: DEFAULT_COMFYUI_PORT,
		autoStart: false,
		mirror: 'github',
		extraArgs: [],
		customModelPaths: [],
		pypiMirror: 'auto',
		torchMirror: 'auto',
	}
}

function saveConfig(partial) {
	try {
		const current = loadConfig()
		const updated = { ...current, ...partial }
		const configPath = getConfigPath()
		fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8')
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
			env: { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' },
		})
		let stdout = ''
		let stderr = ''
		let timedOut = false
		const timer = setTimeout(() => {
			timedOut = true
			try { child.kill() } catch {}
			resolve({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: 'timeout' })
		}, timeout)
		child.stdout?.on('data', (d) => { stdout += String(d) })
		child.stderr?.on('data', (d) => { stderr += String(d) })
		child.on('close', (code) => {
			if (timedOut) return
			clearTimeout(timer)
			resolve({
				ok: code === 0,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				code,
			})
		})
		child.on('error', (err) => {
			if (timedOut) return
			clearTimeout(timer)
			resolve({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: String(err.message || err) })
		})
	})
}

async function detectPython() {
	const cmds = process.platform === 'win32'
		? [['python', ['--version']], ['py', ['-3', '--version']]]
		: [['python3', ['--version']], ['python', ['--version']]]
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
			cudaVersion: cudaM ? cudaM[1] : undefined,
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
	} catch { return false }
}

function isPortableInstall(dirPath) {
	try {
		return fs.existsSync(path.join(dirPath, 'python_embeded'))
	} catch { return false }
}

function hasVenv(dirPath) {
	try {
		const venvDir = path.join(dirPath, 'venv')
		if (!fs.existsSync(venvDir)) return false
		if (process.platform === 'win32') {
			return fs.existsSync(path.join(venvDir, 'Scripts', 'python.exe'))
		}
		return fs.existsSync(path.join(venvDir, 'bin', 'python'))
	} catch { return false }
}

const MODEL_EXTENSIONS = {
	checkpoints: new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin']),
	loras: new Set(['.safetensors', '.pt', '.pth']),
	vae: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	controlnet: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	embeddings: new Set(['.safetensors', '.pt', '.bin', '.pth']),
	upscale_models: new Set(['.safetensors', '.pt', '.pth', '.ckpt']),
	clip: new Set(['.safetensors', '.pt', '.pth', '.bin']),
	clip_vision: new Set(['.safetensors', '.pt', '.pth', '.bin']),
}

function isComfyUIDesktop(dirPath) {
	try {
		const indicators = [
			path.join(dirPath, '..', 'ComfyUI Desktop.exe'),
			path.join(dirPath, '..', 'resources'),
			path.join(dirPath, 'desktop'),
		]
		if (indicators.some(p => fs.existsSync(p))) return true
		const parentDir = path.dirname(dirPath)
		if (fs.existsSync(path.join(parentDir, 'ComfyUI Desktop.exe'))) return true
		return false
	} catch { return false }
}

function parseExtraModelPaths(comfyDir) {
	const modelPaths = {}
	const yamlPath = path.join(comfyDir, 'extra_model_paths.yaml')
	const exampleYamlPath = path.join(comfyDir, 'extra_model_paths.yaml.example')
	const configPath = fs.existsSync(yamlPath) ? yamlPath : (fs.existsSync(exampleYamlPath) ? exampleYamlPath : null)
	if (!configPath) return { modelPaths, hasConfig: fs.existsSync(yamlPath) }
	try {
		const content = fs.readFileSync(configPath, 'utf-8')
		const config = yaml.load(content)
		if (!config || typeof config !== 'object') return { modelPaths, hasConfig: fs.existsSync(yamlPath) }
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
				const dirs = rawVal.split('\n').map(s => s.trim()).filter(Boolean)
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
	} catch { return 0 }
}

function collectModelDirs(comfyDir, customRoots) {
	const { modelPaths, hasConfig } = parseExtraModelPaths(comfyDir)
	const modelsDir = path.join(comfyDir, 'models')
	const customModelRoots = Array.isArray(customRoots) ? customRoots.filter(p => typeof p === 'string' && p && fs.existsSync(p)) : []
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
	return { modelDirs: result, hasExtraConfig: hasConfig, extraModelPaths: modelPaths, customRoots: customModelRoots }
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
			env: { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' },
		})
		const timer = setTimeout(() => {
			timedOut = true
			try { child.kill() } catch {}
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
		onStdout(cb) { child.stdout?.on('data', (d) => cb(String(d))) },
		onStderr(cb) { child.stderr?.on('data', (d) => cb(String(d))) },
		kill() { killed = true; try { child?.kill() } catch {} },
	}
}

async function runPythonCheck(pythonCmd, pythonArgs, code, timeout) {
	const args = [...pythonArgs, '-c', code]
	return runCommand(pythonCmd, args, { timeout: timeout || 20000 })
}

async function checkPythonCanImport(pythonExe, code, timeout) {
	return runCommand(pythonExe, ['-c', code], { timeout: timeout || 20000 })
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
		const vpy = process.platform === 'win32'
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
			path.join(parentDir, 'resources', 'app', 'python', 'python.exe'),
		]
		for (const p of possiblePaths) {
			try {
				if (fs.existsSync(p) && !candidates.find(c => c.path === p)) {
					candidates.push({ cmd: p, args: [], type: 'desktop_bundled', path: p })
				}
			} catch {}
		}
	}
	const sysCmds = findSystemPythonCandidates().map(c => ({ cmd: c.cmd, args: c.args, type: c.type, path: c.cmd + (c.args.length ? ' ' + c.args.join(' ') : '') }))
	for (const sc of sysCmds) {
		if (!candidates.find(c => c.cmd === sc.cmd && c.args.join(' ') === sc.args.join(' '))) {
			candidates.push(sc)
		}
	}
	const results = []
	for (const cand of candidates) {
		const info = { path: cand.path, type: cand.type, available: false, version: undefined, hasTorch: false, torchCuda: false, canImportComfy: false, error: undefined }
		try {
			const verR = await runPythonCheck(cand.cmd, cand.args, 'import sys; print(sys.version.split()[0])', 8000)
			if (verR.ok && verR.stdout) {
				info.available = true
				info.version = verR.stdout.trim()
			} else {
				continue
			}
		} catch { continue }
		try {
			const torchR = await runPythonCheck(cand.cmd, cand.args, 'import torch; print(torch.__version__); print("CUDA" if torch.cuda.is_available() else "CPU")', 25000)
			if (torchR.ok && torchR.stdout) {
				info.hasTorch = true
				const lines = torchR.stdout.split('\n').map(s => s.trim()).filter(Boolean)
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
				'import comfy',
				'print("OK")'
			].join(';')
			const comfyR = await runPythonCheck(cand.cmd, cand.args, importCode, 20000)
			if (comfyR.ok && comfyR.stdout.includes('OK')) {
				info.canImportComfy = true
			}
		} catch {}
		results.push(info)
	}
	const bestPick = results.find(r => r.hasTorch && r.canImportComfy)
		|| results.find(r => r.hasTorch)
		|| results.find(r => r.available)
		|| null
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
		const found = PIP_MIRRORS.find(m => m.key === pypiKey)
		if (found) pypiUrl = found.url
	}
	if (torchKey === 'custom' && customTorch) {
		torchUrl = customTorch
	} else if (torchKey && torchKey !== 'auto') {
		const found = TORCH_MIRRORS.find(m => m.key === torchKey)
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
				if (resolveWait) { const r = resolveWait; resolveWait = null; r(true) }
			},
			finish() {
				done = true
				if (resolveWait) { const r = resolveWait; resolveWait = null; r(false) }
			},
			async next() {
				if (buf.length > 0) return { value: buf.shift(), done: false }
				if (done) return { done: true }
				const hasMore = await new Promise(r => { resolveWait = r })
				if (buf.length > 0) return { value: buf.shift(), done: false }
				return { done: !hasMore }
			},
		}
	}

	async function runStreaming(cmd, args, opts) {
		const queue = createStreamQueue()
		const proc = runCommandWithStream(cmd, args, opts)
		proc.onStdout((d) => { queue.push({ stream: 'stdout', data: d }) })
		proc.onStderr((d) => { queue.push({ stream: 'stderr', data: d }) })
		proc.promise.then(
			(res) => { queue.push({ type: 'result', result: res }); queue.finish() },
			(err) => { queue.push({ type: 'error', error: String(err) }); queue.finish() }
		)
		return queue
	}

	yield { type: 'step', step: 'preparing', message: '准备配置 Python 虚拟环境...' }

	let sysPython = null
	yield { type: 'log', stream: 'stdout', message: '查找可用的系统 Python...' }
	const foundPy = await findSystemPythonForVenv()
	if (foundPy) {
		sysPython = foundPy
		yield { type: 'log', stream: 'stdout', message: `找到可用 Python: ${foundPy.cmd} ${foundPy.args.join(' ')} (${foundPy.version})` }
	}
	if (!sysPython) {
		yield { type: 'error', message: '未找到可用的系统 Python（需要 Python 3.10-3.12），请先安装 Python。' }
		return
	}

	let cudaInfo = { available: false }
	try {
		cudaInfo = await detectCuda()
	} catch {}
	const cuSuffix = getTorchCuSuffix(cudaInfo.cudaVersion, cudaInfo.available)
	yield { type: 'log', stream: 'stdout', message: cudaInfo.available ? `检测到 NVIDIA GPU (CUDA ${cudaInfo.cudaVersion || '版本未知'}, 将安装 PyTorch ${cuSuffix})` : '未检测到 NVIDIA GPU，将使用 CPU 版本' }

	const cfg = loadConfig()
	const mirrors = resolveMirrorUrls(cfg, cuSuffix)
	const needAutoPing = (cfg.pypiMirror === 'auto' || !cfg.pypiMirror) || (cfg.torchMirror === 'auto' || !cfg.torchMirror)
	if (needAutoPing) {
		yield { type: 'log', stream: 'stdout', message: '自动检测最快的镜像源...' }
		try {
			const pingResults = await pingAllMirrors(cudaInfo.cudaVersion)
			const autoSel = autoSelectMirrors(pingResults)
			if (!mirrors.pypiUrl) {
				const pypiPick = PIP_MIRRORS.find(m => m.key === autoSel.pypiMirror)
				if (pypiPick) mirrors.pypiUrl = pypiPick.url
			}
			if (!mirrors.torchUrl) {
				const torchPick = TORCH_MIRRORS.find(m => m.key === autoSel.torchMirror)
				if (torchPick) mirrors.torchUrl = resolveMirrorUrl(torchPick, cuSuffix)
			}
		} catch (e) {
			yield { type: 'log', stream: 'stderr', message: '镜像检测失败，使用默认源: ' + e.message }
		}
	}
	if (mirrors.pypiUrl) yield { type: 'log', stream: 'stdout', message: `PyPI 镜像: ${mirrors.pypiUrl}` }
	if (mirrors.torchUrl) yield { type: 'log', stream: 'stdout', message: `PyTorch 镜像: ${mirrors.torchUrl}` }

	const venvExists = fs.existsSync(venvPython)
	if (venvExists && !forceRecreate) {
		yield { type: 'step', step: 'venv_exists', message: '检测到已有的客户端虚拟环境，继续安装依赖...' }
	} else {
		if (venvExists && forceRecreate) {
			yield { type: 'log', stream: 'stdout', message: '删除旧的虚拟环境...' }
			try { fs.rmSync(venvRoot, { recursive: true, force: true }) } catch {}
		} else {
			const legacyVenvPython = process.platform === 'win32'
				? path.join(venvRoot, 'Scripts', 'python.exe')
				: path.join(venvRoot, 'bin', 'python')
			const legacyPyvenv = path.join(venvRoot, 'pyvenv.cfg')
			if (fs.existsSync(legacyVenvPython) || fs.existsSync(legacyPyvenv)) {
				yield { type: 'log', stream: 'stdout', message: '检测到旧版本的虚拟环境结构，正在清理...' }
				try { fs.rmSync(venvRoot, { recursive: true, force: true }) } catch {}
			}
		}
		yield { type: 'step', step: 'creating_venv', message: '创建虚拟环境...' }
		const venvDir = path.join(venvRoot, 'venv')
		if (!fs.existsSync(venvRoot)) {
			fs.mkdirSync(venvRoot, { recursive: true })
		}
		yield { type: 'log', stream: 'stdout', message: `虚拟环境目录: ${venvDir}` }
		const createCmd = sysPython.cmd
		const createArgs = [...sysPython.args, '-m', 'venv', venvDir]
		yield { type: 'log', stream: 'stdout', message: `执行: ${createCmd} ${createArgs.join(' ')}` }
		const createResult = await runCommand(createCmd, createArgs, { timeout: 120000 })
		if (createResult.stdout) yield { type: 'log', stream: 'stdout', message: createResult.stdout }
		if (createResult.stderr) yield { type: 'log', stream: 'stderr', message: createResult.stderr }
		if (!createResult.ok) {
			yield { type: 'error', message: `虚拟环境创建失败: ${createResult.error || 'exit code ' + createResult.code}` }
			return
		}
		if (!fs.existsSync(venvPython)) {
			try {
				if (fs.existsSync(venvDir)) {
					const entries = fs.readdirSync(venvDir, { withFileTypes: true })
					const dirList = entries.map(e => (e.isDirectory() ? '[' + e.name + ']' : e.name)).join(', ')
					yield { type: 'log', stream: 'stderr', message: `venv 目录内容: ${dirList}` }
				}
				const scriptsDir = process.platform === 'win32'
					? path.join(venvDir, 'Scripts')
					: path.join(venvDir, 'bin')
				if (fs.existsSync(scriptsDir)) {
					const scripts = fs.readdirSync(scriptsDir)
					yield { type: 'log', stream: 'stderr', message: `Scripts 目录内容: ${scripts.join(', ')}` }
				} else {
					yield { type: 'log', stream: 'stderr', message: `Scripts/bin 目录不存在，venv 可能未正确创建（期望: ${scriptsDir}）` }
				}
			} catch (e) {
				yield { type: 'log', stream: 'stderr', message: `无法读取 venv 目录: ${e.message}` }
			}
			yield { type: 'error', message: `虚拟环境创建后未找到 python 可执行文件 (期望路径: ${venvPython})` }
			return
		}
		yield { type: 'log', stream: 'stdout', message: `虚拟环境创建成功: ${venvPython}` }
	}

	const pipProgressArg = '--progress-bar=on'
	const pypiExtraArgs = mirrors.pypiUrl ? ['--extra-index-url', mirrors.pypiUrl] : []

	async function* runPipInstall(args, label) {
		yield { type: 'log', stream: 'stdout', message: `[${label}] ${venvPython} ${args.join(' ')}` }
		const queue = await runStreaming(venvPython, args, { timeout: 600000 })
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

	yield { type: 'step', step: 'upgrading_pip', message: '升级 pip...' }
	const pipUpgradeArgs = ['-m', 'pip', 'install', '--upgrade', 'pip', pipProgressArg]
	if (mirrors.pypiUrl) pipUpgradeArgs.push('-i', mirrors.pypiUrl)
	const pipUp = runPipInstall(pipUpgradeArgs, '升级 pip')
	let pipUpResult = null
	while (true) {
		const it = await pipUp.next()
		if (it.done) { pipUpResult = it.value; break }
		yield it.value
	}
	if (!pipUpResult?.result?.ok) {
		const errMsg = pipUpResult.result?.stderr || pipUpResult.stderrText || pipUpResult.result?.error || '未知错误'
		yield { type: 'error', message: 'pip 升级失败: ' + errMsg }
		return
	}

	yield { type: 'step', step: 'installing_torch', message: '安装 PyTorch...' }
	const torchOfficialBaseUrl = 'https://download.pytorch.org/whl/' + cuSuffix
	const torchIndexUrl = mirrors.torchUrl || torchOfficialBaseUrl

	async function* verifyTorchCuda() {
		const verifyCode = cuSuffix === 'cpu'
			? 'import torch; print("torch", torch.__version__); print("cuda_available", torch.cuda.is_available())'
			: 'import torch; print("torch", torch.__version__); print("cuda_available", torch.cuda.is_available()); import sys; sys.exit(0 if torch.cuda.is_available() else 1)'
		const r = await runCommand(venvPython, ['-c', verifyCode], { timeout: 30000 })
		const output = (r.stdout || '').trim()
		if (output) yield { type: 'log', stream: 'stdout', message: `PyTorch 验证: ${output}` }
		if (r.stderr) yield { type: 'log', stream: 'stderr', message: r.stderr.trim() }
		let ok = true
		if (!r.ok && cuSuffix !== 'cpu') {
			yield { type: 'log', stream: 'stderr', message: 'PyTorch CUDA 验证失败，安装的可能是 CPU 版本' }
			ok = false
		}
		return ok
	}

	async function* installTorchFromIndex(indexUrl, label) {
		const torchBaseArgs = ['-m', 'pip', 'install', '--upgrade', '--force-reinstall', '--no-cache-dir', 'torch', 'torchvision', 'torchaudio', pipProgressArg, '--index-url', indexUrl]
		const installer = runPipInstall(torchBaseArgs, label)
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
		return { result, stderrText }
	}

	const torchAttempts = []
	torchAttempts.push({ indexUrl: torchIndexUrl, label: 'PyTorch (' + (cuSuffix === 'cpu' ? 'CPU' : 'CUDA ' + cuSuffix) + ')' })
	if (mirrors.torchUrl && mirrors.torchUrl !== torchOfficialBaseUrl) {
		torchAttempts.push({ indexUrl: torchOfficialBaseUrl, label: 'PyTorch 官方源 (' + (cuSuffix === 'cpu' ? 'CPU' : 'CUDA ' + cuSuffix) + ')' })
	}

	let torchInstallOk = false
	for (let i = 0; i < torchAttempts.length; i++) {
		const attempt = torchAttempts[i]
		if (i > 0) {
			yield { type: 'log', stream: 'stdout', message: '镜像源安装验证失败，切换到官方源重试...' }
		}
		const installer = installTorchFromIndex(attempt.indexUrl, attempt.label)
		let installRes = null
		while (true) {
			const it = await installer.next()
			if (it.done) { installRes = it.value; break }
			yield it.value
		}
		if (!installRes.result?.ok) {
			const errMsg = installRes.result?.stderr || installRes.stderrText || installRes.result?.error || '未知错误'
			yield { type: 'log', stream: 'stderr', message: `安装失败: ${errMsg}` }
			continue
		}
		const verifier = verifyTorchCuda()
		let cudaOk = false
		while (true) {
			const it = await verifier.next()
			if (it.done) { cudaOk = it.value; break }
			yield it.value
		}
		if (cudaOk) {
			torchInstallOk = true
			break
		}
	}

	if (!torchInstallOk) {
		yield { type: 'error', message: 'PyTorch CUDA 版本安装失败，请检查网络连接或手动安装支持 CUDA 的 PyTorch' }
		return
	}

	const reqFile = path.join(installPath, 'requirements.txt')
	if (fs.existsSync(reqFile)) {
		yield { type: 'step', step: 'installing_requirements', message: '安装 ComfyUI 依赖...' }
		const reqArgs = ['-m', 'pip', 'install', '-r', reqFile, pipProgressArg]
		if (mirrors.pypiUrl) reqArgs.push('-i', mirrors.pypiUrl)
		const reqInstaller = runPipInstall(reqArgs, 'ComfyUI 依赖')
		let reqResult = null
		while (true) {
			const it = await reqInstaller.next()
			if (it.done) { reqResult = it.value; break }
			yield it.value
		}
		if (!reqResult?.result?.ok) {
			const errMsg = reqResult.result?.stderr || reqResult.stderrText || reqResult.result?.error || '未知错误'
			yield { type: 'error', message: '依赖安装失败: ' + errMsg }
			return
		}
		if (cuSuffix !== 'cpu') {
			yield { type: 'log', stream: 'stdout', message: '重新安装 PyTorch CUDA 版本（防止依赖安装覆盖）...' }
			const finalInstaller = installTorchFromIndex(torchOfficialBaseUrl, 'PyTorch 最终确认')
			let finalInstallRes = null
			while (true) {
				const it = await finalInstaller.next()
				if (it.done) { finalInstallRes = it.value; break }
				yield it.value
			}
			if (!finalInstallRes.result?.ok) {
				yield { type: 'log', stream: 'stderr', message: 'PyTorch 最终安装遇到问题，继续验证...' }
			}
			const finalVerifier = verifyTorchCuda()
			let finalCudaOk = false
			while (true) {
				const it = await finalVerifier.next()
				if (it.done) { finalCudaOk = it.value; break }
				yield it.value
			}
			if (!finalCudaOk) {
				yield { type: 'error', message: 'PyTorch CUDA 最终验证失败' }
				return
			}
		}
	} else {
		yield { type: 'log', stream: 'stdout', message: '未找到 requirements.txt，跳过' }
	}

	yield { type: 'step', step: 'verifying', message: '验证 Python 环境...' }
	const verifyCode = cuSuffix === 'cpu'
		? `import sys; print(sys.version); import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); import comfy; print('comfy ok')`
		: `import sys; print(sys.version); import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); assert torch.cuda.is_available(), 'CUDA not available'; import comfy; print('comfy ok')`
	const verify = await runCommand(venvPython, ['-c', verifyCode], { timeout: 30000, cwd: installPath })
	if (!verify.ok) {
		if (verify.stderr) yield { type: 'log', stream: 'stderr', message: verify.stderr }
		yield { type: 'error', message: '环境验证失败，CUDA 不可用或依赖不完整' }
		return
	}
	for (const line of verify.stdout.split(/\r?\n/)) {
		if (line) yield { type: 'log', stream: 'stdout', message: line }
	}
	yield { type: 'done', message: 'Python 环境配置完成', pythonPath: venvPython, venvRoot }
}

async function probeExistingInstall(installPath, options) {
	const config = loadConfig()
	const customModelPaths = options?.customModelPaths || config.customModelPaths || []
	const cacheKey = path.normalize(installPath) + '|' + customModelPaths.slice().sort().join(';')
	if (probeCache.path === cacheKey && probeCache.result && (Date.now() - probeCache.time) < PROBE_CACHE_TTL) {
		return probeCache.result
	}
	const result = {
		ok: true,
		isComfyUI: false,
		installType: 'unknown',
		isDesktop: false,
		launchCompatibility: { status: 'none' },
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
			return { ...result, launchCompatibility: { status: 'none', warnings: ['该目录不是有效的ComfyUI安装'] } }
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
			const gitR = await runCommand('git', ['-C', installPath, 'rev-parse', '--short', 'HEAD'], { timeout: 8000 })
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
			candidates: pyResult.candidates,
		}
		result.pythonInfo = pythonInfo

		const warnings = []
		const needsFix = []
		let launchStatus = 'none'
		let launchMethod = 'main_py'

		if (installType === 'portable') {
			const hasBat = fs.existsSync(path.join(installPath, 'run_nvidia_gpu.bat')) || fs.existsSync(path.join(installPath, 'run_cpu.bat'))
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
		}

		if (bestPy?.hasTorch && bestPy?.canImportComfy) {
			launchStatus = warnings.length > 0 ? 'partial' : 'full'
		} else if (bestPy?.available && needsFix.length === 1 && needsFix[0].includes('PyTorch')) {
			launchStatus = 'none'
		}

		if (needsFix.length > 0) launchStatus = 'none'

		result.launchCompatibility = {
			status: launchStatus,
			method: launchMethod,
			canStart: launchStatus !== 'none',
			warnings: warnings.length > 0 ? warnings : undefined,
			needsFix: needsFix.length > 0 ? needsFix : undefined,
		}

		const { modelDirs, hasExtraConfig, extraModelPaths, customRoots } = collectModelDirs(installPath, customModelPaths)
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
				result.customNodeCount = fs.readdirSync(customNodesDir).filter(d => {
					const p = path.join(customNodesDir, d)
					try { return fs.statSync(p).isDirectory() && d !== '__pycache__' } catch { return false }
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
				validation.warning = '目录已存在且不为空，安装时将在此目录下创建ComfyUI'
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
		installMode: config.installMode,
	}

	const python = await detectPython()
	items.push({
		key: 'python',
		label: 'Python',
		status: python.available ? 'ok' : 'error',
		version: python.version,
		detail: python.available ? `已安装 ${python.cmd}` : '未检测到 Python 3.10+',
		canFix: false,
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
	})
	result.gitAvailable = git.available

	const cuda = await detectCuda()
	items.push({
		key: 'cuda',
		label: 'CUDA/GPU',
		status: cuda.available ? 'ok' : 'warn',
		version: cuda.cudaVersion,
		detail: cuda.available ? `驱动 ${cuda.driverVersion}，CUDA ${cuda.cudaVersion}` : '未检测到 NVIDIA GPU，将使用 CPU 模式',
		canFix: false,
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
		detail: comfyFound ? (probe?.version ? `已安装 v${probe.version}` : '已安装') : '未找到 ComfyUI 源码',
		canFix: !comfyFound,
		fixAction: '安装',
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
			fixAction: managedVenvOk && !(bestPy?.hasTorch && bestPy?.canImportComfy) ? '修复依赖' : '配置',
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
			fixAction: '修复',
		})

		const totalModels = probe?.totalModelCount || 0
		items.push({
			key: 'models',
			label: '模型资源',
			status: totalModels > 0 ? 'ok' : 'warn',
			detail: totalModels > 0
				? `共检测到 ${totalModels} 个模型文件（含 extra_model_paths 配置路径）`
				: '未检测到模型文件，请确认模型路径配置',
			canFix: false,
		})
	}

	const service = await checkComfyService(config.port)
	items.push({
		key: 'service',
		label: 'ComfyUI 服务',
		status: service.running ? 'ok' : 'warn',
		detail: service.running ? `运行中 ${service.url}` : '未运行',
		canFix: comfyFound && !service.running,
		fixAction: '启动',
	})
	result.serviceRunning = service.running
	result.serviceUrl = service.url

	return result
}

async function selectInstallPath(title, defaultPath) {
	const mainWindow = BrowserWindow?.getAllWindows?.()?.find(w => w.getTitle?.()?.includes('DVStudio') && !w.isDestroyed?.())
	const options = {
		title: title || '选择目录',
		properties: ['openDirectory', 'createDirectory'],
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
		exitCode: running ? null : serviceExitCode,
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
	flushLineBuffers()
	serviceExitCode = (typeof code === 'number') ? code : (signal ? signal : null)
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
	const args = Array.isArray(extraArgs) ? [...extraArgs] : (Array.isArray(config.extraArgs) ? [...config.extraArgs] : [])

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

	let pythonCmd = 'python'
	let pythonBaseArgs = []
	let spawnArgs = []
	let useShell = false

	if (probe.installType === 'portable' && !isManagedVenvReady()) {
		const batFile = probe.pythonInfo?.torchCuda !== false && fs.existsSync(path.join(targetPath, 'run_nvidia_gpu.bat'))
			? 'run_nvidia_gpu.bat'
			: 'run_cpu.bat'
		pythonCmd = path.join(targetPath, batFile)
		useShell = true
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
			const venvPy = process.platform === 'win32'
				? path.join(targetPath, 'venv', 'Scripts', 'python.exe')
				: path.join(targetPath, 'venv', 'bin', 'python')
			if (fs.existsSync(venvPy)) pythonCmd = venvPy
		}
		spawnArgs = [...pythonBaseArgs, 'main.py', '--listen', '127.0.0.1', '--port', String(p), ...args]
	}

	_stdoutLineBuffer.buf = ''
	_stderrLineBuffer.buf = ''
	serviceExitCode = null
	const cmdDisplay = useShell ? pythonCmd : `"${pythonCmd}" ${spawnArgs.join(' ')}`
	appendServiceLog('system', `[启动] 工作目录: ${targetPath}`)
	appendServiceLog('system', `[启动] 命令: ${cmdDisplay}`)

	try {
		serviceChildProcess = spawn(pythonCmd, spawnArgs, {
			cwd: targetPath,
			env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
			shell: useShell,
			windowsHide: true,
		})
		serviceStartTime = Date.now()
		serviceChildProcess.stdout?.on('data', (data) => {
			processStreamData(data, 'stdout', _stdoutLineBuffer)
		})
		serviceChildProcess.stderr?.on('data', (data) => {
			processStreamData(data, 'stderr', _stderrLineBuffer)
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
		buttonLabel: '选择目录',
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
	const existing = new Set((config.customModelPaths || []).map(p => path.normalize(p)))
	if (existing.has(normalized)) {
		return { ok: false, error: '该目录已添加' }
	}
	const updated = [...(config.customModelPaths || []), normalized]
	saveConfig({ customModelPaths: updated })
	probeCache = { path: null, result: null, time: 0 }
	return { ok: true, customModelPaths: updated }
}

export function setupRemoveCustomModelPath(_ctx, payload) {
	const modelPath = payload?.path
	if (!modelPath || typeof modelPath !== 'string') {
		return { ok: false, error: 'path is required' }
	}
	const config = loadConfig()
	const targetNorm = path.normalize(modelPath)
	const updated = (config.customModelPaths || []).filter(p => path.normalize(p) !== targetNorm)
	saveConfig({ customModelPaths: updated })
	probeCache = { path: null, result: null, time: 0 }
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
	const ok = saveConfig(payload || {})
	return { ok }
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
		try { installChildProcess.kill() } catch {}
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
	yield { type: 'done', message: '安装功能开发中，当前版本仅提供环境检测和路径配置。', progress: 100 }
}

export async function setupPingMirrors() {
	const results = await pingAllMirrors()
	return { ok: true, results }
}

export function setupGetMirrorList() {
	return {
		ok: true,
		pypiMirrors: PIP_MIRRORS.map(m => ({ key: m.key, name: m.name, url: m.url, kind: m.kind, builtin: m.builtin })),
		torchMirrors: TORCH_MIRRORS.map(m => ({ key: m.key, name: m.name, url: m.url, kind: m.kind, builtin: m.builtin })),
	}
}

export function setupSetMirror(_ctx, payload) {
	const updates = {}
	if (payload?.pypiMirror !== undefined) updates.pypiMirror = payload.pypiMirror
	if (payload?.torchMirror !== undefined) updates.torchMirror = payload.torchMirror
	if (payload?.customPypiMirrorUrl !== undefined) updates.customPypiMirrorUrl = payload.customPypiMirrorUrl
	if (payload?.customTorchMirrorUrl !== undefined) updates.customTorchMirrorUrl = payload.customTorchMirrorUrl
	saveConfig(updates)
	probeCache = { path: null, result: null, time: 0 }
	return { ok: true, config: { ...loadConfig() } }
}

export async function* setupFixPythonEnv(_ctx, payload) {
	const installPath = payload?.installPath || loadConfig().installPath
	const forceRecreate = !!payload?.forceRecreate
	const venvPath = payload?.venvPath || loadConfig().venvPath || undefined
	if (!isComfyUIDir(installPath)) {
		yield { type: 'error', message: '无效的 ComfyUI 目录' }
		return
	}
	if (payload?.venvPath) {
		saveConfig({ venvPath: payload.venvPath })
	}
	yield* setupPythonEnv(installPath, { forceRecreate, venvPath })
	probeCache = { path: null, result: null, time: 0 }
	yield { type: 'log', stream: 'stdout', message: '环境配置完成，正在刷新检测结果...' }
}

export function setupGetDefaultVenvPath() {
	return { ok: true, path: getDefaultVenvPath(), currentPath: getManagedVenvRoot() }
}

export async function setupSelectVenvPath(_ctx, payload) {
	const result = await selectInstallPath('选择 Python 虚拟环境安装位置', payload?.defaultPath || getDefaultVenvPath())
	return { ok: true, ...result }
}

export function setupSetVenvPath(_ctx, payload) {
	const venvPath = payload?.path
	if (venvPath) {
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
		status: getServiceStatus(),
	}
}

export function setupClearServiceLogs() {
	serviceLogBuffer = []
	_stdoutLineBuffer.buf = ''
	_stderrLineBuffer.buf = ''
	broadcastToAllWindows(SERVICE_CLEAR_CHANNEL, { ts: Date.now() })
	return { ok: true }
}

export async function setupRestartService(_ctx, payload) {
	const r = await restartService(payload?.installPath, payload?.port, payload?.extraArgs)
	return r
}
