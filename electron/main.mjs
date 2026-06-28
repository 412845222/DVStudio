import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'

import { app, BrowserWindow, dialog, ipcMain, shell, Menu, protocol } from 'electron'

import { APP_NAME, APP_VERSION, APP_COPYRIGHT, APP_HOMEPAGE, APP_REPO_URL, APP_LICENSE, getRepoRoot, getWindowIconPath } from './config.mjs'
import { collectDiagnostics } from './backend/diagnostics.mjs'
import { detectPythonInfo } from './backend/python.mjs'
import { cleanupOldRuntimeProject } from './backend/runtimeCleanup.mjs'
import {
	registerDwebProjectAssetProtocol,
	setProjectRoot,
	clearProjectRoot,
	getProjectRootSnapshot,
	downloadUrlToProjectRoot,
	copyFileToProjectRoot,
	getProjectRootById,
	repairProjectAsset,
	validateProjectRoot,
	diagnoseDwebAsset,
	getAccessLogs,
	getProjectCacheStats,
	clearProjectCache,
} from './backend/projectAssetProtocol.mjs'
import {
	uploadBufferProjectAsset,
	importUrlProjectAsset,
	importFileProjectAsset,
	deleteStaticProjectAsset,
	resolveStaticProjectAsset,
	repairAllProjectAssets,
} from './backend/projectStaticAssets/service.mjs'
import { initLocalDb, getRepos, getReposSafe, ensureLocalDbInitialized } from './localdb/index.mjs'
import { registerLocalDbIpc } from './localdb/ipc/ipcHost.mjs'
import { initBackend, shutdownBackend } from './backend/index.mjs'
import { getPythonBridge } from './backend/python-bridge/index.mjs'
import { platformPreflight, platformInit, platformShutdown, registerPlatformIpc, setMainWindowForPlatform } from './platform/index.mjs'

try {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: 'dweb',
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				stream: true,
			},
		},
	])
	console.log('[dweb-protocol] privileged scheme registered')
} catch (err) {
	console.error('[dweb-protocol] privileged scheme register failed:', err)
}

function earlySetupSteamEnv() {
	try {
		let appId = 480
		const cwdAppIdPath = path.join(process.cwd(), 'steam_appid.txt')
		if (fs.existsSync(cwdAppIdPath)) {
			const content = fs.readFileSync(cwdAppIdPath, 'utf8').trim()
			const parsed = parseInt(content, 10)
			if (!isNaN(parsed) && parsed > 0) appId = parsed
		}
		process.env.SteamAppId = String(appId)
		process.env.SteamGameId = String(appId)
		console.log('[platform:steam] Early SteamAppId set:', appId)
	} catch (err) {
		console.warn('[platform:steam] Early Steam env setup failed:', err.message)
	}
}
earlySetupSteamEnv()

const isDev = !!process.env.ELECTRON_DEV || !app.isPackaged

let _portableUserDataDir = ''
let _portableWarnOnReady = false

function isDirectoryWritable(dir) {
	try {
		fs.mkdirSync(dir, { recursive: true })
		const testFile = path.join(dir, '.write-test-' + Date.now() + '-' + Math.random().toString(36).slice(2))
		fs.writeFileSync(testFile, 'test')
		fs.unlinkSync(testFile)
		return true
	} catch {
		return false
	}
}

function configurePortablePaths() {
	if (isDev) return
	const installDir = path.dirname(process.execPath)
	const dvsResourceDir = path.resolve(installDir, 'DVSResource')
	const targetUserDataDir = path.resolve(dvsResourceDir, 'UserData')
	const targetLogsDir = path.resolve(dvsResourceDir, 'Logs')

	if (isDirectoryWritable(dvsResourceDir)) {
		app.setPath('userData', targetUserDataDir)
		app.setPath('sessionData', path.resolve(targetUserDataDir, 'Session'))
		try { app.setPath('crashDumps', path.resolve(targetUserDataDir, 'CrashDumps')) } catch {}
		_portableUserDataDir = targetUserDataDir
		fs.mkdirSync(targetLogsDir, { recursive: true })
	} else {
		_portableUserDataDir = app.getPath('userData')
		_portableWarnOnReady = true
	}
}

configurePortablePaths()

let mainWindow = null
let backendLastError = ''
let clientSettings = null

const FIXED_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const FIXED_DEEPSEEK_MODEL = 'deepseek-chat'
const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'

function fetchRawBuffer(rawUrl) {
	return new Promise((resolve, reject) => {
		let parsed
		try {
			parsed = new URL(String(rawUrl || ''))
		} catch (err) {
			reject(err)
			return
		}
		const transport = parsed.protocol === 'https:' ? https : http
		const options = {
			method: 'GET',
			hostname: parsed.hostname,
			port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
			path: parsed.pathname + parsed.search,
			headers: {
				'User-Agent': 'DwebVideoStudio/1.0 (Electron)',
			},
			timeout: 120 * 1000,
		}
		const req = transport.request(options, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers?.location) {
				fetchRawBuffer(String(res.headers.location)).then(resolve, reject)
				return
			}
			if (!res.statusCode || res.statusCode >= 400) {
				reject(new Error(`HTTP ${res.statusCode}`))
				return
			}
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => {
				const buf = Buffer.concat(chunks)
				const mime = String(res.headers?.['content-type'] || '').split(';')[0].trim() || 'application/octet-stream'
				resolve({ buffer: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), mime })
			})
			res.on('error', reject)
		})
		req.on('error', reject)
		req.on('timeout', () => {
			req.destroy(new Error('request timeout'))
		})
		req.end()
	})
}

let bootstrapProc = null

const BACKEND_LOG_MAX_LINES = 2000
const backendLogLines = []

let setupRunning = false
let setupUpdatedAt = 0
let setupSteps = []
let runtimeLogFile = ''
let backendOpLock = Promise.resolve()

let backendRuntimeState = {
	running: false,
	healthy: true,
	baseUrl: '',
	port: 0,
	lastError: '',
	setupRunning: false,
	updatedAt: 0,
	mode: 'ipc',
}

function createDefaultSetupSteps() {
	return [
		{ key: 'python', label: 'Python 环境检查（>=3.11，推荐 3.11）', status: 'unknown', detail: '', progress: 0 },
		{ key: 'resource', label: '创建 DVSResource 目录', status: 'unknown', detail: '', progress: 0 },
		{ key: 'pythonBridge', label: '初始化 Python Bridge 工作进程', status: 'unknown', detail: '', progress: 0 },
		{ key: 'nodeBackend', label: '初始化 Node.js IPC 后端', status: 'unknown', detail: '', progress: 0 },
		{ key: 'ffmpeg', label: 'ffmpeg（可选）', status: 'unknown', detail: '', progress: 0 },
	]
}

setupSteps = createDefaultSetupSteps()

function setStep(key, patch) {
	const idx = setupSteps.findIndex((s) => s.key === key)
	if (idx < 0) return
	setupSteps[idx] = { ...setupSteps[idx], ...patch }
	setupUpdatedAt = Date.now()
}

function snapshotBackendRuntimeState() {
	return { ...backendRuntimeState }
}

function emitBackendRuntimeState() {
	const payload = snapshotBackendRuntimeState()
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			if (!win.isDestroyed()) win.webContents.send('dweb:backendRuntime:changed', payload)
		} catch {
		}
	}
}

function updateBackendRuntimeState(patch) {
	backendRuntimeState = {
		...backendRuntimeState,
		...(patch || {}),
		updatedAt: Date.now(),
	}
	emitBackendRuntimeState()
}

function resetSetupSteps() {
	setupSteps = createDefaultSetupSteps()
	setupUpdatedAt = Date.now()
}

function getSetupState() {
	return {
		running: setupRunning,
		updatedAt: setupUpdatedAt,
		steps: setupSteps,
	}
}

function splitLines(text) {
	return String(text || '')
		.split(/\r?\n/)
		.map((v) => v.trimEnd())
		.filter(Boolean)
}

function makeProgressBar(frame) {
	const size = 14
	const pos = frame % size
	let out = ''
	for (let i = 0; i < size; i++) {
		if (i === pos) out += '>'
		else if (i < pos) out += '='
		else out += '.'
	}
	return `[${out}]`
}

function runSyncWithLogs(cmd, args, { cwd, label, timeoutMs = 0 } = {}) {
	const displayLabel = String(label || `${cmd} ${Array.isArray(args) ? args.join(' ') : ''}`).trim()
	const startedAt = Date.now()
	let frame = 0
	pushBackendLog(`[cmd] start ${displayLabel}`)
	const ticker = setInterval(() => {
		frame += 1
		const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
		pushBackendLog(`[cmd] ${makeProgressBar(frame)} ${displayLabel} (${elapsed}s)`)
	}, 1000)

	const r = spawn(cmd, args, {
		cwd,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let stdout = ''
	let stderr = ''
	let finished = false
	let timeoutId = null

	const finalize = (payload) => {
		if (finished) return
		finished = true
		if (timeoutId) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
		clearInterval(ticker)
		const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
		const ok = !!payload?.ok
		pushBackendLog(`[cmd] ${ok ? '[##############]' : '[!!!!!FAILED!!!]'} ${displayLabel} (${elapsed}s)`)
		return {
			ok,
			code: Number(payload?.code ?? 1),
			stdout,
			stderr,
			error: payload?.error || '',
			timedOut: !!payload?.timedOut,
		}
	}

	r.stdout?.on('data', (s) => {
		stdout += String(s || '')
		onBackendChunk('setup', s)
	})
	r.stderr?.on('data', (s) => {
		stderr += String(s || '')
		onBackendChunk('setup', s)
	})

	return new Promise((resolve) => {
		r.once('error', (err) => {
			stderr += `\n${String(err?.message || err || 'spawn failed')}`
			resolve(finalize({ ok: false, code: 1, error: String(err?.message || err || 'spawn failed') }))
		})
		r.once('exit', (code) => {
			resolve(finalize({ ok: code === 0, code: Number(code || 0) }))
		})

		if (Number(timeoutMs) > 0) {
			timeoutId = setTimeout(() => {
				try {
					r.kill('SIGKILL')
				} catch {
				}
				stderr += `\nTimeout after ${timeoutMs}ms`
				resolve(finalize({ ok: false, code: 124, timedOut: true, error: `timeout ${timeoutMs}ms` }))
			}, Number(timeoutMs))
		}
	})
}

async function tryInstallPythonOnWindows() {
	if (process.platform !== 'win32') {
		return { ok: false, reason: 'unsupported-platform' }
	}

	const wingetCheck = await runSyncWithLogs('winget', ['--version'], {
		label: '检测 winget',
		timeoutMs: 10000,
	})
	if (!wingetCheck.ok) {
		return { ok: false, reason: 'winget-not-found' }
	}

	const install = await runSyncWithLogs(
		'winget',
		['install', '-e', '--id', 'Python.Python.3.12', '--accept-source-agreements', '--accept-package-agreements'],
		{ label: '自动安装 Python（3.12）', timeoutMs: 20 * 60 * 1000 },
	)
	if (!install.ok) {
		return { ok: false, reason: 'python-install-failed' }
	}

	return { ok: true }
}

function pushBackendLog(line) {
	const v = String(line ?? '').replace(/\s+$/g, '')
	if (!v) return
	backendLogLines.push(v)
	appendRuntimeLog(`[backend] ${v}`)
	while (backendLogLines.length > BACKEND_LOG_MAX_LINES) backendLogLines.shift()
}

function nowTs() {
	const d = new Date()
	const pad = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
		d.getSeconds(),
	)}`
}

function appendRuntimeLog(line) {
	if (!runtimeLogFile) return
	try {
		fs.appendFileSync(runtimeLogFile, `[${nowTs()}] ${String(line || '')}\n`, 'utf-8')
	} catch {
	}
}

function initRuntimeLogger() {
	const candidates = [
		path.resolve(getLogsDir(), 'runtime.log'),
		path.resolve(getUserDataDir(), 'dweb-runtime.log'),
	]
	for (const p of candidates) {
		try {
			fs.mkdirSync(path.dirname(p), { recursive: true })
			fs.appendFileSync(p, `\n========== start ${nowTs()} ==========` + '\n', 'utf-8')
			runtimeLogFile = p
			break
		} catch {
		}
	}
	if (runtimeLogFile) {
		appendRuntimeLog(`logger initialized: ${runtimeLogFile}`)
	}
}

function registerRuntimeDiagnostics() {
	process.on('uncaughtException', (err) => {
		appendRuntimeLog(`[uncaughtException] ${String(err?.stack || err?.message || err)}`)
	})
	process.on('unhandledRejection', (reason) => {
		appendRuntimeLog(`[unhandledRejection] ${String(reason)}`)
	})
	app.on('render-process-gone', (_event, webContents, details) => {
		appendRuntimeLog(`[render-process-gone] id=${webContents?.id || 0} reason=${details?.reason || ''} exitCode=${details?.exitCode || 0}`)
	})
	app.on('child-process-gone', (_event, details) => {
		appendRuntimeLog(`[child-process-gone] type=${details?.type || ''} reason=${details?.reason || ''} exitCode=${details?.exitCode || 0}`)
	})
}

function onBackendChunk(kind, chunk) {
	const text = String(chunk ?? '')
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trimEnd()
		if (!line) continue
		pushBackendLog(`[${kind}] ${line}`)
	}
}

function getBootstrapDir() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const repoRoot = path.resolve(here, '..')
	if (app.isPackaged) return path.resolve(process.resourcesPath, 'static', 'bootstrap')
	return path.resolve(repoRoot, 'electron', 'static', 'bootstrap')
}

function resolveBootstrapInstaller() {
	if (process.platform === 'win32') {
		const cmdPath = path.resolve(getBootstrapDir(), 'windows', 'install.cmd')
		return { command: cmdPath, args: [] }
	}
	if (process.platform === 'darwin') {
		const scriptPath = path.resolve(getBootstrapDir(), 'mac', 'install.sh')
		return { command: '/bin/bash', args: [scriptPath] }
	}
	return null
}

async function runBootstrapInstaller() {
	if (bootstrapProc) return { ok: true, running: true }
	ensureClientResourceLayout()
	const installer = resolveBootstrapInstaller()
	if (!installer) {
		return { ok: false, error: `Bootstrap installer not provided for platform: ${process.platform}` }
	}

	const checkPath = process.platform === 'win32' ? installer.command : installer.args[0]
	if (!fs.existsSync(checkPath)) {
		return { ok: false, error: `Installer not found: ${checkPath}` }
	}

	pushBackendLog(`[bootstrap] start: ${installer.command} ${installer.args.join(' ')}`)
	bootstrapProc = spawn(installer.command, installer.args, {
		cwd: path.dirname(checkPath),
		windowsHide: true,
	})

	bootstrapProc.stdout?.on('data', (s) => onBackendChunk('bootstrap', s))
	bootstrapProc.stderr?.on('data', (s) => onBackendChunk('bootstrap', s))
	bootstrapProc.once('exit', (code) => {
		pushBackendLog(`[bootstrap] exit code ${code}`)
		bootstrapProc = null
	})

	return { ok: true, started: true }
}

function getUserDataDir() {
	if (_portableUserDataDir) return _portableUserDataDir
	return app.getPath('userData')
}

function getLogsDir() {
	return path.resolve(getDvsResourceDir(), 'Logs')
}

function findNearestGitRoot(startDir) {
	let current = path.resolve(startDir)
	while (true) {
		if (fs.existsSync(path.resolve(current, '.git'))) return current
		const parent = path.dirname(current)
		if (parent === current) return ''
		current = parent
	}
}

function getClientRootDir() {
	if (app.isPackaged) return path.dirname(process.execPath)
	const repoRoot = getRepoRoot()
	const gitRoot = findNearestGitRoot(repoRoot)
	return gitRoot || repoRoot
}

function getDvsResourceDir() {
	const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
	if (envResourceDir) return path.resolve(envResourceDir)
	if (app.isPackaged) return path.resolve(getClientRootDir(), 'DVSResource')
	return path.resolve(getClientRootDir(), 'DVSResource')
}

function getBackendDataDir() {
	return path.resolve(getDvsResourceDir(), 'BackendData')
}

function getUserSettingsDir() {
	return path.resolve(getDvsResourceDir(), 'UserSettings')
}

function getUserSettingsFilePath() {
	return path.resolve(getUserSettingsDir(), 'settings.json')
}

function getDefaultClientSettings() {
	return {
		defaultResolution: '1920x1080',
		deepseekApiKey: '',
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiApiKey: '',
		geminiModel: FIXED_GEMINI_MODEL,
		bytedanceApiKey: '',
		meshyApiKey: '',
	}
}

function ensureClientResourceLayout() {
	fs.mkdirSync(getDvsResourceDir(), { recursive: true })
	fs.mkdirSync(getUserSettingsDir(), { recursive: true })
	const filePath = getUserSettingsFilePath()
	if (!fs.existsSync(filePath)) {
		fs.writeFileSync(filePath, JSON.stringify(getDefaultClientSettings(), null, 2), 'utf-8')
	}
	return { resourceDir: getDvsResourceDir(), settingsDir: getUserSettingsDir(), settingsFile: filePath }
}

function loadClientSettings() {
	const layout = ensureClientResourceLayout()
	const defaults = getDefaultClientSettings()
	try {
		const raw = fs.readFileSync(layout.settingsFile, 'utf-8')
		const parsed = JSON.parse(raw)
		clientSettings = { ...defaults, ...(parsed || {}) }
	} catch {
		clientSettings = defaults
		fs.writeFileSync(layout.settingsFile, JSON.stringify(clientSettings, null, 2), 'utf-8')
	}
	return { ...clientSettings }
}

function saveClientSettings(next) {
	const layout = ensureClientResourceLayout()
	const defaults = getDefaultClientSettings()
	clientSettings = { ...defaults, ...(clientSettings || {}), ...(next || {}) }
	fs.writeFileSync(layout.settingsFile, JSON.stringify(clientSettings, null, 2), 'utf-8')
	return { ...clientSettings }
}

async function runSetupWorkflow({ reason = 'init', retryKey = '' } = {}) {
	if (setupRunning) return { ok: true, state: getSetupState(), running: true }

	setupRunning = true
	updateBackendRuntimeState({ setupRunning: true })
	resetSetupSteps()
	pushBackendLog(`[setup] 开始执行环境准备流程（reason=${reason}${retryKey ? `, retry=${retryKey}` : ''}）`)

	let pyInfo = null
	const resourceDir = getDvsResourceDir()
	const backendDataDir = getBackendDataDir()

	try {
		setStep('python', { status: 'running', progress: 25, detail: '正在检测 Python 版本...' })
		pyInfo = detectPythonInfo({ minMajor: 3, minMinor: 11 })
		const usingBundledPython = !!pyInfo?.isBundled
		if (!pyInfo.ok || !pyInfo.meetsRequirement) {
			if (usingBundledPython) {
				setStep('python', { status: 'error', progress: 100, detail: '内置 Python 运行时损坏，请重新安装应用。' })
				return { ok: false, state: getSetupState(), error: 'bundled-python-corrupted' }
			}
			const missingPython = !pyInfo.command
			setStep('python', {
				status: 'running',
				progress: 55,
				detail: missingPython
					? '不存在 Python 环境，正在尝试自动安装（Windows）...'
					: `Python 版本不满足要求（当前：${pyInfo.detail || 'unknown'}），正在尝试自动安装（Windows）...`,
			})

			const autoInstall = await tryInstallPythonOnWindows()
			if (autoInstall.ok) {
				pyInfo = detectPythonInfo({ minMajor: 3, minMinor: 11 })
			}
		}
		if (!pyInfo.ok || !pyInfo.meetsRequirement) {
			setStep('python', {
				status: 'error',
				progress: 100,
				detail: !pyInfo.command
					? '不存在 Python 环境。请安装 Python 3.11 及以上版本后重试。'
					: pyInfo.detail || 'Python 版本不满足要求，请安装 Python 3.11 及以上（推荐 3.11）后重试。',
			})
			pushBackendLog('[建议] 不存在可用 Python 环境：请安装 Python 3.11+ 后重试。')
			return { ok: false, state: getSetupState(), error: 'python-check-failed' }
		}
		setStep('python', {
			status: 'ok',
			progress: 100,
			detail: pyInfo.isBundled
				? `${pyInfo.detail}（开箱即用，无需安装）`
				: (pyInfo.recommended
					? `${pyInfo.detail}（推荐版本）`
					: `${pyInfo.detail}（可用，推荐 3.11）`),
		})

		setStep('resource', { status: 'running', progress: 40, detail: '正在创建 DVSResource...' })
		const layout = ensureClientResourceLayout()
		fs.mkdirSync(backendDataDir, { recursive: true })
		setStep('resource', {
			status: 'ok',
			progress: 100,
			detail: `${resourceDir}（含 UserSettings / BackendData）`,
		})
		if (layout.settingsFile) loadClientSettings()

		setStep('pythonBridge', { status: 'running', progress: 60, detail: '正在初始化 Python Bridge...' })
		try {
			const pythonBridge = getPythonBridge()
			setStep('pythonBridge', {
				status: 'ok',
				progress: 100,
				detail: 'Python Bridge 已就绪（使用系统 Python）',
			})
			pushBackendLog('[setup] Python Bridge 初始化完成')
		} catch (e) {
			pushBackendLog(`[setup] Python Bridge 初始化异常：${String(e?.stack || e?.message || e)}`)
			setStep('pythonBridge', {
				status: 'error',
				progress: 100,
				detail: `Python Bridge 初始化失败：${String(e?.message || e)}`,
			})
			return { ok: false, state: getSetupState(), error: 'python-bridge-init-failed' }
		}

		setStep('nodeBackend', { status: 'running', progress: 80, detail: '正在初始化 Node.js IPC 后端...' })
		try {
			if (mainWindow && !mainWindow.isDestroyed()) {
				initBackend(mainWindow)
			}
			updateBackendRuntimeState({
				running: true,
				healthy: true,
				baseUrl: '',
				port: 0,
				lastError: '',
				mode: 'ipc',
			})
			setStep('nodeBackend', {
				status: 'ok',
				progress: 100,
				detail: 'Node.js IPC 后端已就绪',
			})
			pushBackendLog('[setup] Node.js IPC 后端初始化完成')
		} catch (e) {
			pushBackendLog(`[setup] Node.js IPC 后端初始化异常：${String(e?.stack || e?.message || e)}`)
			setStep('nodeBackend', {
				status: 'error',
				progress: 100,
				detail: `Node.js IPC 后端初始化失败：${String(e?.message || e)}`,
			})
			return { ok: false, state: getSetupState(), error: 'node-backend-init-failed' }
		}

		setStep('ffmpeg', { status: 'running', progress: 90, detail: '检测 ffmpeg（可选）...' })
		const ff = await runSyncWithLogs('ffmpeg', ['-version'], { label: '检测 ffmpeg（可选）', timeoutMs: 8000 })
		if (ff.ok) {
			const line = splitLines(ff.stdout || ff.stderr)[0] || 'ffmpeg detected'
			setStep('ffmpeg', { status: 'ok', progress: 100, detail: line })
		} else {
			setStep('ffmpeg', {
				status: 'warn',
				progress: 100,
				detail: '未检测到 ffmpeg（仅影响动画编辑器导出视频，不阻断流程）。',
			})
			pushBackendLog('[提醒] 未检测到 ffmpeg：不阻断流程，但动画编辑器无法导出视频。')
		}

		pushBackendLog('[setup] 环境准备完成。')
		return { ok: true, state: getSetupState() }
	} finally {
		setupRunning = false
		updateBackendRuntimeState({ setupRunning: false })
		setupUpdatedAt = Date.now()
	}
}

async function withBackendOpLock(task) {
	const prev = backendOpLock
	let release
	backendOpLock = new Promise((resolve) => {
		release = resolve
	})
	await prev
	try {
		return await task()
	} finally {
		release?.()
	}
}

async function createWindow() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const repoRoot = path.resolve(here, '..')

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		title: APP_NAME,
		icon: getWindowIconPath(),
		backgroundColor: '#181818',
		frame: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.resolve(here, 'preload.mjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	})

	setMainWindowForPlatform(mainWindow)

	try {
		Menu.setApplicationMenu(null)
	} catch {
	}
	mainWindow.setMenuBarVisibility(false)
	mainWindow.removeMenu()

	mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
		appendRuntimeLog(`[did-fail-load] code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
	})
	mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
		appendRuntimeLog(`[renderer:${level}] ${message} (${sourceId}:${line})`)
	})
	mainWindow.webContents.on('render-process-gone', (_event, details) => {
		appendRuntimeLog(`[window-render-gone] reason=${details?.reason || ''} exitCode=${details?.exitCode || 0}`)
	})
	mainWindow.webContents.on('did-finish-load', () => {
		appendRuntimeLog(`[did-finish-load] url=${mainWindow?.webContents?.getURL?.() || ''}`)
	})
	mainWindow.webContents.on('did-navigate', (_event, url) => {
		appendRuntimeLog(`[did-navigate] ${url}`)
	})

	const normalizeDevRendererUrl = (raw) => {
		const fallback = 'http://localhost:5173/#/'
		const input = String(raw || '').trim()
		if (!input) return fallback
		try {
			const u = new URL(input)
			u.pathname = '/'
			if (String(u.hash || '').trim()) return u.toString()
			u.hash = '#/'
			return u.toString()
		} catch {
			return fallback
		}
	}
	const devUrl = normalizeDevRendererUrl(process.env.ELECTRON_RENDERER_URL)
	const prodIndex = path.resolve(repoRoot, 'dist', 'index.html')
	appendRuntimeLog(`[renderer] mode=${isDev ? 'dev' : 'prod'} repoRoot=${repoRoot}`)
	appendRuntimeLog(`[renderer] devUrl=${devUrl}`)
	appendRuntimeLog(`[renderer] prodIndex=${prodIndex} exists=${fs.existsSync(prodIndex)}`)
	if (isDev) {
		await mainWindow.loadURL(devUrl)
	} else {
		await mainWindow.loadFile(prodIndex)
	}

	if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

	mainWindow.on('closed', () => {
		mainWindow = null
	})

	mainWindow.on('maximize', () => {
	})

	mainWindow.on('unmaximize', () => {
	})
}

let windowAnimating = false
const ANIMATION_DURATION = 200
let lastNormalBounds = null

function lerp(start, end, t) {
	return start + (end - start) * t
}

function easeOutCubic(t) {
	return 1 - Math.pow(1 - t, 3)
}

async function animateWindowBounds(win, targetBounds) {
	if (!win || win.isDestroyed()) return
	if (windowAnimating) return

	windowAnimating = true
	const startBounds = win.getBounds()
	const startX = startBounds.x
	const startY = startBounds.y
	const startWidth = startBounds.width
	const startHeight = startBounds.height

	const startTime = Date.now()

	return new Promise((resolve) => {
		function animate() {
			if (!win || win.isDestroyed()) {
				windowAnimating = false
				resolve()
				return
			}

			const elapsed = Date.now() - startTime
			const t = Math.min(elapsed / ANIMATION_DURATION, 1)
			const easedT = easeOutCubic(t)

			const currentX = lerp(startX, targetBounds.x, easedT)
			const currentY = lerp(startY, targetBounds.y, easedT)
			const currentWidth = lerp(startWidth, targetBounds.width, easedT)
			const currentHeight = lerp(startHeight, targetBounds.height, easedT)

			try {
				win.setBounds({
					x: Math.round(currentX),
					y: Math.round(currentY),
					width: Math.round(currentWidth),
					height: Math.round(currentHeight),
				})
			} catch {
			}

			if (t < 1) {
				requestAnimationFrame(animate)
			} else {
				try {
					win.setBounds(targetBounds)
				} catch {
				}
				windowAnimating = false
				resolve()
			}
		}

		requestAnimationFrame(animate)
	})
}

function registerIpc() {
	const getSenderWindow = (e) => {
		try {
			return BrowserWindow.fromWebContents(e.sender)
		} catch {
			return mainWindow
		}
	}

	ipcMain.handle('dweb:getBackendBaseUrl', async () => '')
	ipcMain.handle('dweb:backendRuntime:getState', async () => snapshotBackendRuntimeState())

	ipcMain.handle('dweb:window:minimize', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		win.minimize()
		return { ok: true }
	})

	ipcMain.handle('dweb:window:toggleMaximize', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }

		if (windowAnimating) return { ok: false, error: 'Animating.' }

		if (win.isMaximized()) {
			const targetBounds = lastNormalBounds || { x: 100, y: 100, width: 1280, height: 800 }
			await animateWindowBounds(win, targetBounds)
			win.unmaximize()
			return { ok: true, maximized: false }
		} else {
			lastNormalBounds = win.getBounds()
			const screen = win.getScreen()
			const display = screen.getDisplayNearestPoint({ x: lastNormalBounds.x, y: lastNormalBounds.y })
			const workArea = display.workArea
			await animateWindowBounds(win, {
				x: workArea.x,
				y: workArea.y,
				width: workArea.width,
				height: workArea.height,
			})
			win.maximize()
			return { ok: true, maximized: true }
		}
	})

	ipcMain.handle('dweb:window:isMaximized', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		return { ok: true, maximized: win.isMaximized() }
	})

	ipcMain.handle('dweb:window:close', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		win.close()
		return { ok: true }
	})

	ipcMain.handle('dweb:window:reload', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		win.webContents.reloadIgnoringCache()
		return { ok: true }
	})

	ipcMain.handle('dweb:window:openDevTools', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		if (win.webContents.isDevToolsOpened()) {
			win.webContents.focus()
			return { ok: true, opened: true }
		}
		win.webContents.openDevTools({ mode: 'detach', activate: true })
		return { ok: true, opened: true }
	})

	ipcMain.handle('dweb:settings:get', async () => {
		try {
			const data = loadClientSettings()
			return { ok: true, data, path: getUserSettingsFilePath() }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:settings:save', async (_e, payload) => {
		try {
			const data = saveClientSettings(payload || {})
			return { ok: true, data, path: getUserSettingsFilePath() }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})
	ipcMain.handle('dweb:backend:getStatus', async () => ({
		running: backendRuntimeState.running,
		baseUrl: '',
		port: 0,
		lastError: backendLastError,
		logLineCount: backendLogLines.length,
		mode: 'ipc',
	}))

	ipcMain.handle('dweb:backend:ping', async () => {
		return { ok: backendRuntimeState.healthy, status: backendRuntimeState.healthy ? 200 : 503, mode: 'ipc' }
	})

	ipcMain.handle('dweb:backend:start', async () => {
		return withBackendOpLock(async () => {
			try {
				const setupResult = await runSetupWorkflow({ reason: 'manual-start' })
				if (!setupResult.ok) {
					return { ok: false, error: setupResult.error || 'setup failed' }
				}
			} catch (e) {
				backendLastError = String(e?.message || e)
				pushBackendLog(`[error] ${backendLastError}`)
				updateBackendRuntimeState({ lastError: backendLastError, healthy: false })
				return { ok: false, error: backendLastError }
			}
			return { ok: true, mode: 'ipc' }
		})
	})

	ipcMain.handle('dweb:backend:restart', async () => {
		return withBackendOpLock(async () => {
			try {
				shutdownBackend()
				const setupResult = await runSetupWorkflow({ reason: 'manual-restart' })
				if (!setupResult.ok) {
					return { ok: false, error: setupResult.error || 'setup failed' }
				}
				return { ok: true, mode: 'ipc' }
			} catch (e) {
				backendLastError = String(e?.message || e)
				pushBackendLog(`[error] ${backendLastError}`)
				updateBackendRuntimeState({ lastError: backendLastError, healthy: false })
				return { ok: false, error: backendLastError }
			}
		})
	})

	ipcMain.handle('dweb:backend:getLogs', async (_e, options) => {
		const since = Number(options?.since || 0)
		const lines = since > 0 ? backendLogLines.slice(since) : backendLogLines.slice()
		return {
			ok: true,
			lines,
			total: backendLogLines.length,
			baseUrl: '',
			port: 0,
			running: backendRuntimeState.running,
			lastError: backendLastError,
			mode: 'ipc',
		}
	})

	ipcMain.handle('dweb:backend:clearLogs', async () => {
		backendLogLines.length = 0
		return { ok: true }
	})

	ipcMain.handle('dweb:diagnostics:collect', async () => {
		try {
			return { ok: true, data: collectDiagnostics() }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:setup:getState', async () => getSetupState())

	ipcMain.handle('dweb:setup:run', async (_e, payload) => {
		try {
			return await runSetupWorkflow({
				reason: payload?.reason || 'manual',
				retryKey: payload?.retryKey || '',
			})
		} catch (e) {
			const msg = String(e?.message || e)
			pushBackendLog(`[error] setup run failed: ${msg}`)
			return { ok: false, error: msg, state: getSetupState() }
		}
	})

	ipcMain.handle('dweb:setup:cleanupOldProject', async () => {
		try {
			const result = cleanupOldRuntimeProject({
				resourceDir: getDvsResourceDir(),
				log: (line) => pushBackendLog(line),
			})
			backendLastError = ''
			return result
		} catch (e) {
			const msg = String(e?.message || e)
			pushBackendLog(`[error] cleanup old project failed: ${msg}`)
			return { ok: false, error: msg }
		}
	})

	ipcMain.handle('dweb:bootstrap:install', async () => {
		try {
			return await runBootstrapInstaller()
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:app:revealUserDataDir', async () => {
		await shell.openPath(getDvsResourceDir())
		return { ok: true }
	})

	ipcMain.handle('dweb:app:openExternalUrl', async (_e, payload) => {
		try {
			const raw = String(payload?.url || '').trim()
			if (!raw) return { ok: false, error: 'empty url' }
			let parsed
			try {
				parsed = new URL(raw)
			} catch {
				return { ok: false, error: 'invalid url' }
			}
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return { ok: false, error: 'unsupported protocol' }
			}
			const openErr = await shell.openExternal(raw, { activate: true })
			if (openErr) return { ok: false, error: String(openErr) }
			return { ok: true }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:app:openFolderForPath', async (_e, payload) => {
		try {
			const raw = String(payload?.path || '').trim()
			if (!raw) return { ok: false, error: 'empty path' }
			const normalized = path.normalize(raw)
			if (!fs.existsSync(normalized)) {
				const dir = path.dirname(normalized)
				if (dir && fs.existsSync(dir)) {
					const openErr = await shell.openPath(dir)
					if (openErr) return { ok: false, error: String(openErr) }
					return { ok: true }
				}
				return { ok: false, error: 'path not found' }
			}
			const stat = fs.statSync(normalized)
			if (stat.isDirectory()) {
				const openErr = await shell.openPath(normalized)
				if (openErr) return { ok: false, error: String(openErr) }
				return { ok: true }
			}
			try {
				shell.showItemInFolder(normalized)
				return { ok: true }
			} catch {
				const dir = path.dirname(normalized)
				const openErr = await shell.openPath(dir)
				if (openErr) return { ok: false, error: String(openErr) }
				return { ok: true }
			}
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:selectMediaFiles', async (_e, options) => {
		if (!mainWindow) return { canceled: true, filePaths: [] }
		const r = await dialog.showOpenDialog(mainWindow, {
			properties: ['openFile', 'multiSelections'],
			filters: options?.filters || [
				{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'mkv'] },
			],
		})
		return r
	})

	ipcMain.handle('dweb:aiworkflow:selectProjectFolder', async () => {
		if (!mainWindow) return { canceled: true, filePaths: [] }
		return dialog.showOpenDialog(mainWindow, {
			properties: ['openDirectory', 'createDirectory'],
		})
	})

	ipcMain.handle('dweb:videostudio:selectExportDir', async () => {
		if (!mainWindow) return { canceled: true, filePaths: [] }
		return dialog.showOpenDialog(mainWindow, {
			properties: ['openDirectory', 'createDirectory'],
		})
	})

	ipcMain.handle('dweb:aiworkflow:registerProjectRoot', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		const rootPath = String(payload?.rootPath || '').trim()
		if (!Number.isFinite(projectId) || projectId <= 0) {
			return { ok: false, error: 'projectId is invalid' }
		}
		if (!rootPath) {
			clearProjectRoot(projectId)
			return { ok: true, cleared: true }
		}
		const result = setProjectRoot(projectId, rootPath)
		return result
	})

	ipcMain.handle('dweb:aiworkflow:clearProjectRoot', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		if (!Number.isFinite(projectId) || projectId <= 0) {
			return { ok: false, error: 'projectId is invalid' }
		}
		clearProjectRoot(projectId)
		return { ok: true }
	})

	ipcMain.handle('dweb:aiworkflow:getProjectRootSnapshot', async () => {
		return getProjectRootSnapshot()
	})

	ipcMain.handle('dweb:aiworkflow:getProjectRootById', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		if (!Number.isFinite(projectId) || projectId <= 0) return null
		return getProjectRootById(projectId)
	})

	ipcMain.handle('dweb:aiworkflow:downloadUrlToProjectRoot', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		const url = String(payload?.url || '').trim()
		const desiredFilename = payload?.desiredFilename ? String(payload.desiredFilename) : undefined
		if (!Number.isFinite(projectId) || projectId <= 0) return { ok: false, error: 'projectId is invalid' }
		if (!url) return { ok: false, error: 'url is empty' }
		try {
			return await downloadUrlToProjectRoot(projectId, url, desiredFilename)
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:copyFileToProjectRoot', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		const sourcePath = String(payload?.sourcePath || '').trim()
		const desiredFilename = payload?.desiredFilename ? String(payload.desiredFilename) : undefined
		if (!Number.isFinite(projectId) || projectId <= 0) return { ok: false, error: 'projectId is invalid' }
		if (!sourcePath) return { ok: false, error: 'sourcePath is empty' }
		try {
			return await copyFileToProjectRoot(projectId, sourcePath, desiredFilename)
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:uploadProjectAsset', async (_e, payload) => {
		try {
			return uploadBufferProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:importProjectAsset', async (_e, payload) => {
		try {
			const p = payload || {}
			if (p.sourcePath || p.path) return await importFileProjectAsset(p)
			return await importUrlProjectAsset(p)
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:deleteProjectAsset', async (_e, payload) => {
		try {
			return deleteStaticProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:resolveProjectAsset', async (_e, payload) => {
		try {
			return resolveStaticProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:repairProjectAsset', async (_e, payload) => {
		try {
			return repairProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:projectAssets:repairAll', async (_e, payload) => {
		try {
			return await repairAllProjectAssets(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:diagnoseAsset', async (_e, payload) => {
		try {
			return diagnoseDwebAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err), diagnostics: [] }
		}
	})

	ipcMain.handle('dweb:aiworkflow:validateProjectRoot', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		if (!Number.isFinite(projectId) || projectId <= 0) {
			return { ok: false, error: 'projectId is invalid' }
		}
		const expected = String(payload?.expectedRootPath || '').trim()
		if (expected) {
			const result = setProjectRoot(projectId, expected)
			return { ok: true, reRegistered: result?.ok, registerResult: result, validation: validateProjectRoot(projectId) }
		}
		return { ok: true, validation: validateProjectRoot(projectId) }
	})

	ipcMain.handle('dweb:aiworkflow:getAssetAccessLogs', async (_e, payload) => {
		const maxEntries = Number(payload?.maxEntries)
		return { ok: true, logs: getAccessLogs(Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 100) }
	})

	ipcMain.handle('dweb:project-cache:stats', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		if (!Number.isFinite(projectId) || projectId <= 0) {
			return { ok: false, error: 'projectId is invalid' }
		}
		try {
			return getProjectCacheStats(projectId)
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:project-cache:clear', async (_e, payload) => {
		const projectId = Number(payload?.projectId)
		if (!Number.isFinite(projectId) || projectId <= 0) {
			return { ok: false, error: 'projectId is invalid' }
		}
		try {
			return clearProjectCache(projectId)
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:fetchAsArrayBuffer', async (_e, payload) => {
		const url = String(payload?.url || '').trim()
		if (!url) return { ok: false, error: 'url is empty' }
		try {
			const { buffer, mime } = await fetchRawBuffer(url)
			return { ok: true, buffer, mime }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})


	try {
		registerLocalDbIpc(ipcMain, {
			backendDataDir: getBackendDataDir() || getUserDataDir(),
			userDataDir: getUserDataDir(),
			appSecret: getBackendDataDir() || getUserDataDir(),
		})
	} catch (err) {
		console.error('[main] localdb ipc register failed:', err)
	}

	let imageMarkupWindow = null
	ipcMain.handle('dweb:image-markup:open', async (_e, payload) => {
		console.log('[main] dweb:image-markup:open payload:', JSON.stringify(payload))
		try {
			const url = String(payload?.url || '').trim()
			const name = String(payload?.name || '图片预览').slice(0, 200)
			console.log('[main] url resolved:', url, 'name:', name)
			if (!url) return { ok: false, error: 'missing url' }

			if (imageMarkupWindow && !imageMarkupWindow.isDestroyed()) {
				try { imageMarkupWindow.close() } catch {}
			}

			const here = path.dirname(fileURLToPath(import.meta.url))
			const repoRoot = path.resolve(here, '..')
			const devUrl = String(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173/').replace(/\/+$/, '')
			const targetUrl = isDev
				? `${devUrl}/#/image-markup-preview?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`
				: `file://${path.resolve(repoRoot, 'dist', 'index.html').replace(/\\/g, '/')}#/image-markup-preview?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`
			console.log('[main] targetUrl:', targetUrl)

			imageMarkupWindow = new BrowserWindow({
				width: 1280,
				height: 820,
				title: `${APP_NAME} · ${name}`,
				icon: getWindowIconPath(),
				backgroundColor: '#181818',
				frame: true,
				autoHideMenuBar: true,
				webPreferences: {
					preload: path.resolve(here, 'preload.mjs'),
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: false,
				},
			})
			console.log('[main] BrowserWindow created, isDestroyed:', imageMarkupWindow.isDestroyed())
			try { imageMarkupWindow.setMenuBarVisibility(false) } catch {}
			try { imageMarkupWindow.removeMenu() } catch {}

			imageMarkupWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
				appendRuntimeLog(`[image-markup:${level}] ${message} (${sourceId}:${line})`)
			})
			imageMarkupWindow.on('closed', () => { imageMarkupWindow = null })

			console.log('[main] about to loadURL:', targetUrl)
			await imageMarkupWindow.loadURL(targetUrl)
			console.log('[main] loadURL done, URL:', imageMarkupWindow.webContents.getURL())
			return { ok: true }
		} catch (err) {
			console.error('[main][image-markup] open failed', err)
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:image-markup:export', async (_e, payload) => {
		try {
			if (!mainWindow || mainWindow.isDestroyed()) {
				return { ok: false, error: 'main window not available' }
			}
			mainWindow.webContents.send('dweb:image-markup:exported', {
				dataUrl: String(payload?.dataUrl || ''),
				width: Number(payload?.width || 0) || 0,
				height: Number(payload?.height || 0) || 0,
				sourceName: String(payload?.sourceName || ''),
			})
			if (imageMarkupWindow && !imageMarkupWindow.isDestroyed()) {
				try { imageMarkupWindow.close() } catch {}
			}
			return { ok: true }
		} catch (err) {
			console.error('[main][image-markup] export failed', err)
			return { ok: false, error: String(err?.message || err) }
		}
	})

	let resourceManagerWindow = null

	ipcMain.handle('dweb:resource-manager:open', async (_e, payload) => {
		console.log('[main] dweb:resource-manager:open payload:', JSON.stringify(payload))
		try {
			const projectId = payload?.projectId ?? null
			const title = String(payload?.title || '资源管理器').slice(0, 200)

			if (resourceManagerWindow && !resourceManagerWindow.isDestroyed()) {
				resourceManagerWindow.focus()
				return { ok: true, focused: true }
			}

			const here = path.dirname(fileURLToPath(import.meta.url))
			const repoRoot = path.resolve(here, '..')
			const devUrl = String(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173/').replace(/\/+$/, '')

			const queryParams = new URLSearchParams()
			if (projectId != null) queryParams.set('projectId', String(projectId))
			if (title) queryParams.set('title', title)
			const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : ''

			const targetUrl = isDev
				? `${devUrl}/#/resource-manager${queryStr}`
				: `file://${path.resolve(repoRoot, 'dist', 'index.html').replace(/\\/g, '/')}#/resource-manager${queryStr}`

			console.log('[main][resource-manager] targetUrl:', targetUrl)

			resourceManagerWindow = new BrowserWindow({
				width: 1100,
				height: 720,
				minWidth: 640,
				minHeight: 480,
				title: `${APP_NAME} · ${title}`,
				icon: getWindowIconPath(),
				backgroundColor: '#181818',
				frame: true,
				autoHideMenuBar: true,
				webPreferences: {
					preload: path.resolve(here, 'preload.mjs'),
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: false,
				},
			})

			try { resourceManagerWindow.setMenuBarVisibility(false) } catch {}
			try { resourceManagerWindow.removeMenu() } catch {}

			resourceManagerWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
				appendRuntimeLog(`[resource-manager:${level}] ${message} (${sourceId}:${line})`)
			})
			resourceManagerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
				appendRuntimeLog(`[resource-manager:fail-load] code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
			})
			resourceManagerWindow.on('closed', () => {
				resourceManagerWindow = null
			})

			await resourceManagerWindow.loadURL(targetUrl)
			console.log('[main][resource-manager] loadURL done, URL:', resourceManagerWindow.webContents.getURL())
			return { ok: true, focused: false }
		} catch (err) {
			console.error('[main][resource-manager] open failed', err)
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:resource-manager:close', async () => {
		if (!resourceManagerWindow || resourceManagerWindow.isDestroyed()) {
			return { ok: true }
		}
		try {
			resourceManagerWindow.close()
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:resource-manager:focus', async () => {
		if (!resourceManagerWindow || resourceManagerWindow.isDestroyed()) {
			return { ok: false, error: 'window not available' }
		}
		resourceManagerWindow.focus()
		return { ok: true }
	})

	ipcMain.handle('dweb:resource-manager:broadcast', async (_e, payload) => {
		const event = String(payload?.event || '').trim()
		if (!event) return { ok: false, error: 'missing event name' }
		if (!mainWindow || mainWindow.isDestroyed()) {
			return { ok: false, error: 'main window not available' }
		}
		try {
			if (event === 'focus-node') {
				if (mainWindow.isMinimized()) mainWindow.restore()
				mainWindow.focus()
			}
			mainWindow.webContents.send('dweb:resource-manager:event', {
				event,
				data: payload?.data ?? null,
			})
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:resource-manager:notify', async (_e, payload) => {
		const event = String(payload?.event || '').trim()
		if (!event) return { ok: false, error: 'missing event name' }
		if (!resourceManagerWindow || resourceManagerWindow.isDestroyed()) {
			return { ok: false, skipped: true }
		}
		try {
			resourceManagerWindow.webContents.send('dweb:resource-manager:notify', {
				event,
				data: payload?.data ?? null,
			})
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	let resourceManagerLatestData = null

	ipcMain.handle('dweb:resource-manager:send-data', async (_e, payload) => {
		resourceManagerLatestData = payload

		if (!resourceManagerWindow || resourceManagerWindow.isDestroyed()) {
			return { ok: true, buffered: true }
		}
		try {
			resourceManagerWindow.webContents.send('dweb:resource-manager:data', payload)
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:resource-manager:request-data', async () => {
		const payload = resourceManagerLatestData
		return { ok: true, data: payload }
	})
}

async function stopBackend() {
	shutdownBackend()
	try {
		const pythonBridge = getPythonBridge()
		await pythonBridge.shutdown()
	} catch {
	}
	updateBackendRuntimeState({
		running: false,
		healthy: false,
		baseUrl: '',
		port: 0,
		lastError: backendLastError || '',
	})
}

async function main() {
	app.setName(APP_NAME)
	app.setAboutPanelOptions({
		applicationName: APP_NAME,
		applicationVersion: APP_VERSION,
		copyright: APP_COPYRIGHT,
		website: APP_HOMEPAGE,
		credits: `${APP_REPO_URL}\nLicensed under ${APP_LICENSE}`,
		version: APP_VERSION,
	})
	initRuntimeLogger()
	registerRuntimeDiagnostics()
	registerDwebProjectAssetProtocol()
	ensureClientResourceLayout()
	loadClientSettings()

	if (_portableWarnOnReady && app.isPackaged) {
		dialog.showMessageBox({
			type: 'warning',
			title: '安装目录权限提示',
			message: '当前安装目录无写入权限',
			detail: `${APP_NAME} 已安装到受系统保护的目录（如 Program Files），应用数据和日志将保存到用户目录（AppData）。\n\n如需完全便携化使用（所有文件保存在安装目录），请重新安装到非系统保护目录。`,
			buttons: ['我知道了'],
			defaultId: 0,
			noLink: true,
		}).catch(() => {})
		_portableWarnOnReady = false
	}

	try {
		const userDir = getUserDataDir()
		const backendDir = getBackendDataDir() || userDir
		const dirOk = typeof userDir === 'string' && userDir.trim().length > 0
		appendRuntimeLog(`[app] localdb init paths: userDir=${userDir} backendDir=${backendDir} ok=${dirOk}`)
		initLocalDb({ backendDataDir: backendDir, userDataDir: userDir, appSecret: backendDir })
		const repos = getRepos()
		appendRuntimeLog(`[app] localdb initialized: ${repos.dbFilePath} (tag=${repos.tag || 'primary'} schema=${repos.schemaInfo?.currentVersion})`)
	} catch (err) {
		appendRuntimeLog(`[app] localdb init failed: ${String(err?.message || err)}`)
		appendRuntimeLog(`[app] 尝试回退初始化 localdb (强制使用 userDataDir)...`)
		const retry = ensureLocalDbInitialized({ userDataDir: getUserDataDir(), backendDataDir: getUserDataDir(), appSecret: getUserDataDir() })
		if (!retry.ok) {
			appendRuntimeLog(`[app] localdb fallback init also failed: ${retry.error}`)
			appendRuntimeLog(`[app] WARNING: localdb 不可用，将使用前端 fallback 路径；项目相关功能可能异常。`)
		} else {
			const r = getReposSafe()
			appendRuntimeLog(`[app] localdb fallback OK: ${r.ok ? r.repos.dbFilePath : 'unknown'}`)
		}
	}

	registerIpc()

	const platStatus = await platformInit()
	registerPlatformIpc()
	if (platStatus?.available) {
		appendRuntimeLog(`[platform] ${platStatus.activeDisplayName} connected. User: ${platStatus.user?.displayName || 'unknown'}`)
	} else {
		appendRuntimeLog(`[platform] Running in ${platStatus?.activeDisplayName || 'Mock'} mode`)
	}

	appendRuntimeLog(`[app] isPackaged=${app.isPackaged} platform=${process.platform} execPath=${process.execPath}`)

	await createWindow()

	updateBackendRuntimeState({
		running: true,
		healthy: true,
		baseUrl: '',
		port: 0,
		lastError: '',
		mode: 'ipc',
	})
	appendRuntimeLog('[app] Node.js IPC backend active (mode=ipc)')

	try {
		await runSetupWorkflow({ reason: 'init' })
	} catch (err) {
		appendRuntimeLog(`[app] setup workflow failed: ${String(err?.message || err)}`)
	}
}

app.on('window-all-closed', () => {
	app.quit()
})

app.on('before-quit', async () => {
	platformShutdown()
	await stopBackend()
})

if (platformPreflight()) {
	app.quit()
} else {
	app.whenReady().then(main)
}
