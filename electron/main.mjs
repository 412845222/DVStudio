import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'

import { app, BrowserWindow, dialog, ipcMain, shell, Menu, protocol } from 'electron'

import { APP_NAME, getDjangoAppDir, getRepoRoot, getWindowIconPath } from './config.mjs'
import { killExistingDjangoRunservers, pickBackendPort, startDjangoServer, waitForBackendReady } from './backend/django.mjs'
import { collectDiagnostics } from './backend/diagnostics.mjs'
import { detectPythonInfo } from './backend/python.mjs'
import { cleanupOldRuntimeProject } from './backend/runtimeCleanup.mjs'
import {
	copyDjangoTemplateToRuntime,
	syncDjangoTemplateToRuntime,
	ensureRuntimeDjangoProjectScaffold,
	ensureRuntimeRequirements,
	sanitizeRuntimeDjangoDir,
} from './backend/djangoProject.mjs'
import {
	registerDwebProjectAssetProtocol,
	setProjectRoot,
	clearProjectRoot,
	getProjectRootSnapshot,
	downloadUrlToProjectRoot,
	copyFileToProjectRoot,
	getProjectRootById,
	uploadProjectAsset,
	importProjectAsset,
	deleteProjectAsset,
	resolveProjectAsset,
	repairProjectAsset,
} from './backend/projectAssetProtocol.mjs'
import { initLocalDb, getRepos, getReposSafe, ensureLocalDbInitialized } from './localdb/index.mjs'
import { registerLocalDbIpc } from './localdb/ipc/ipcHost.mjs'
import { runLegacyDbMigration } from './localdb/ipc/djangoMigrate.mjs'

// dweb:// must be registered as a privileged scheme before app ready,
// otherwise renderer-side fetch/XHR treats it as unsupported.
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

const isDev = !!process.env.ELECTRON_DEV || !app.isPackaged

let mainWindow = null
let backend = null
let backendBaseUrl = ''
let backendPort = 0
let backendLastError = ''
let backendPythonCommand = ''
let clientSettings = null

const FIXED_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const FIXED_DEEPSEEK_MODEL = 'deepseek-chat'
// Nano Banana image generation requires an image-capable model.
// Ref: https://ai.google.dev/gemini-api/docs/image-generation
const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'

// Download a URL and return { buffer: Uint8Array, mime: string }
// Used to bypass browser CORS when consuming signed CDN URLs (e.g. seedance results).
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
const BACKEND_HEALTH_PING_INTERVAL_MS = 15_000
const backendLogLines = []

let setupRunning = false
let setupUpdatedAt = 0
let setupSteps = []
let runtimeLogFile = ''
let backendOpLock = Promise.resolve()
let backendHealthTimer = null
let backendDjangoDir = ''
let backendPythonForKill = ''

let backendRuntimeState = {
	running: false,
	healthy: false,
	baseUrl: '',
	port: 0,
	lastError: '',
	setupRunning: false,
	updatedAt: 0,
}

function createDefaultSetupSteps() {
	return [
		{ key: 'python', label: 'Python 环境检查（>=3.11，推荐 3.11）', status: 'unknown', detail: '', progress: 0 },
		{ key: 'resource', label: '创建 DVSResource 目录', status: 'unknown', detail: '', progress: 0 },
		{ key: 'venv', label: '创建/复用 Python 虚拟环境', status: 'unknown', detail: '', progress: 0 },
		{ key: 'djangoProject', label: '准备 Django 项目（复制源码/生成配置）', status: 'unknown', detail: '', progress: 0 },
		{ key: 'django', label: '启动 Django 后端', status: 'unknown', detail: '', progress: 0 },
		{ key: 'dependencyCheck', label: '依赖检查', status: 'unknown', detail: '', progress: 0 },
		{ key: 'dependencyInstall', label: '依赖安装', status: 'unknown', detail: '', progress: 0 },
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
			// ignore
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
					// ignore
				}
				stderr += `\nTimeout after ${timeoutMs}ms`
				resolve(finalize({ ok: false, code: 124, timedOut: true, error: `timeout ${timeoutMs}ms` }))
			}, Number(timeoutMs))
		}
	})
}

const DJANGO_RUNTIME_CHECK_CODE = [
	'import django',
	'from django.core.management import execute_from_command_line',
	'import rest_framework',
	'import corsheaders',
	'from cryptography.fernet import Fernet',
	'print(django.get_version())',
].join('; ')

async function checkDjangoRuntimeDependencies(pythonCommand) {
	return await runSyncWithLogs(
		pythonCommand,
		['-c', DJANGO_RUNTIME_CHECK_CODE],
		{ label: '检查 Django 关键依赖' },
	)
}

async function installDjangoRuntimeDependencies({ pythonCommand, djangoRuntimeDir, forceReinstall = false }) {
	const reqPath = path.resolve(djangoRuntimeDir, 'requirements.txt')
	const args = ['-m', 'pip', 'install']
	if (forceReinstall) {
		args.push('--upgrade', '--force-reinstall', '--no-cache-dir')
	}
	args.push('-r', reqPath)
	return await runSyncWithLogs(
		pythonCommand,
		args,
		{
			cwd: djangoRuntimeDir,
			label: forceReinstall ? '强制重装 Django 项目依赖' : '安装 Django 项目依赖',
		},
	)
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
		// ignore logging failure
	}
}

function initRuntimeLogger() {
	const candidates = [
		path.resolve(getClientRootDir(), 'dweb-runtime.log'),
		path.resolve(getUserDataDir(), 'dweb-runtime.log'),
	]
	for (const p of candidates) {
		try {
			fs.mkdirSync(path.dirname(p), { recursive: true })
			fs.appendFileSync(p, `\n========== start ${nowTs()} ==========` + '\n', 'utf-8')
			runtimeLogFile = p
			break
		} catch {
			// try next
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
		// welcome 页会主动 ping，runserver 默认会打印 GET /api/ai/ping；这里过滤掉以免刷屏
		if (line.includes('GET /api/ai/ping')) continue
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
	// Electron 自带 per-user data dir
	return app.getPath('userData')
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
	// 交付客户端：运行时数据固定放在 EXE 同级目录下的 DVSResource。
	if (app.isPackaged) return path.resolve(getClientRootDir(), 'DVSResource')
	return path.resolve(getClientRootDir(), 'DVSResource')
}

function getBackendDataDir() {
	return path.resolve(getDvsResourceDir(), 'BackendData')
}

function getRuntimeDjangoAppDir() {
	return path.resolve(getDvsResourceDir(), 'django-app')
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
		jimengAccessKeyId: '',
		jimengSecretKey: '',
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

function getVenvDir() {
	return path.resolve(getDvsResourceDir(), '.venv')
}

function getVenvPythonPath() {
	if (process.platform === 'win32') return path.resolve(getVenvDir(), 'Scripts', 'python.exe')
	return path.resolve(getVenvDir(), 'bin', 'python')
}

function isCrossPlatformVenv(venvDir) {
	const winPy = path.resolve(venvDir, 'Scripts', 'python.exe')
	const unixPy = path.resolve(venvDir, 'bin', 'python')
	if (process.platform === 'win32') return fs.existsSync(unixPy) && !fs.existsSync(winPy)
	return fs.existsSync(winPy) && !fs.existsSync(unixPy)
}

function countFilesRecursively(dir) {
	if (!fs.existsSync(dir)) return 0
	let count = 0
	const stack = [dir]
	while (stack.length > 0) {
		const current = stack.pop()
		let entries = []
		try {
			entries = fs.readdirSync(current, { withFileTypes: true })
		} catch {
			continue
		}
		for (const ent of entries) {
			const full = path.resolve(current, ent.name)
			if (ent.isDirectory()) {
				stack.push(full)
				continue
			}
			if (ent.isFile()) count += 1
		}
	}
	return count
}

function migrateLegacyRuntimeData({ runtimeDjangoDir, backendDataDir, log = () => {} }) {
	const legacyDb = path.resolve(runtimeDjangoDir, 'db.sqlite3')
	const targetDb = path.resolve(backendDataDir, 'db.sqlite3')
	const legacySecret = path.resolve(runtimeDjangoDir, 'django_secret_key.txt')
	const targetSecret = path.resolve(backendDataDir, 'django_secret_key.txt')
	const legacyMedia = path.resolve(runtimeDjangoDir, 'media')
	const targetMedia = path.resolve(backendDataDir, 'media')

	if (fs.existsSync(legacyDb)) {
		const legacySize = fs.statSync(legacyDb).size
		const targetSize = fs.existsSync(targetDb) ? fs.statSync(targetDb).size : 0
		const shouldCopy = !fs.existsSync(targetDb) || (targetSize < 1024 * 1024 && legacySize > targetSize)
		if (shouldCopy) {
			fs.mkdirSync(backendDataDir, { recursive: true })
			fs.copyFileSync(legacyDb, targetDb)
			log(`[data-migrate] 已迁移历史数据库到 BackendData: ${legacySize} bytes`)
		}
	}

	if (fs.existsSync(legacySecret) && !fs.existsSync(targetSecret)) {
		fs.mkdirSync(backendDataDir, { recursive: true })
		fs.copyFileSync(legacySecret, targetSecret)
		log('[data-migrate] 已迁移历史 django_secret_key.txt 到 BackendData')
	}

	if (fs.existsSync(legacyMedia)) {
		const legacyCount = countFilesRecursively(legacyMedia)
		const targetCount = countFilesRecursively(targetMedia)
		if (legacyCount > targetCount) {
			fs.mkdirSync(targetMedia, { recursive: true })
			fs.cpSync(legacyMedia, targetMedia, { recursive: true, force: false, errorOnExist: false })
			log(`[data-migrate] 已迁移历史 media 到 BackendData（legacy=${legacyCount}, target=${targetCount}）`)
		}
	}
}

function getBackendSettingsEnv() {
	const s = clientSettings || getDefaultClientSettings()
	const safeSettings = {
		...s,
		deepseekApiKey: '',
		geminiApiKey: '',
		bytedanceApiKey: '',
		jimengAccessKeyId: '',
		jimengSecretKey: '',
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiModel: FIXED_GEMINI_MODEL,
	}
	return {
		DEEPSEEK_BASE_URL: FIXED_DEEPSEEK_BASE_URL,
		DEEPSEEK_MODEL: FIXED_DEEPSEEK_MODEL,
		NANOBANANA_MODEL: FIXED_GEMINI_MODEL,
		DWEB_DEFAULT_RESOLUTION: String(s.defaultResolution || ''),
		DWEB_CLIENT_SETTINGS_JSON: JSON.stringify(safeSettings),
	}
}

async function runSetupWorkflow({ reason = 'init', retryKey = '' } = {}) {
	if (setupRunning) return { ok: true, state: getSetupState(), running: true }

	setupRunning = true
	updateBackendRuntimeState({ setupRunning: true })
	resetSetupSteps()
	pushBackendLog(`[setup] 开始执行环境准备流程（reason=${reason}${retryKey ? `, retry=${retryKey}` : ''}）`)

	let pyInfo = null
	const resourceDir = getDvsResourceDir()
	const venvDir = getVenvDir()
	const venvPython = getVenvPythonPath()
	const djangoTemplateDir = app.isPackaged
		? path.resolve(process.resourcesPath, 'django-app')
		: getDjangoAppDir()
	const backendDataDir = getBackendDataDir()
	const djangoRuntimeDir = getRuntimeDjangoAppDir()

	try {
		setStep('python', { status: 'running', progress: 25, detail: '正在检测 Python 版本...' })
		pyInfo = detectPythonInfo({ minMajor: 3, minMinor: 11 })
		if (!pyInfo.ok || !pyInfo.meetsRequirement) {
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
			detail: pyInfo.recommended
				? `${pyInfo.detail}（推荐版本）`
				: `${pyInfo.detail}（可用，推荐 3.11）`,
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

		setStep('venv', { status: 'running', progress: 55, detail: '正在检查虚拟环境...' })
		if (fs.existsSync(venvDir) && isCrossPlatformVenv(venvDir)) {
			setStep('venv', {
				status: 'running',
				progress: 60,
				detail: '检测到跨平台虚拟环境（Windows/macOS 不匹配），正在重建...',
			})
			fs.rmSync(venvDir, { recursive: true, force: true })
		}
		if (!fs.existsSync(venvPython)) {
			const r = await runSyncWithLogs(pyInfo.command, [...(pyInfo.argsPrefix || []), '-m', 'venv', venvDir], {
				label: '创建 Python 虚拟环境',
			})
			if (!r.ok) {
				setStep('venv', {
					status: 'error',
					progress: 100,
					detail: '虚拟环境创建失败，请检查 Python 安装权限和磁盘空间。',
				})
				pushBackendLog('[建议] 虚拟环境创建失败：请尝试“以管理员身份运行”或检查杀毒软件拦截。')
				return { ok: false, state: getSetupState(), error: 'venv-create-failed' }
			}
			setStep('venv', { status: 'ok', progress: 100, detail: `已创建：${venvDir}` })
		} else {
			setStep('venv', { status: 'ok', progress: 100, detail: `已检测到：${venvDir}` })
		}

		if (!fs.existsSync(venvPython)) {
			setStep('venv', {
				status: 'error',
				progress: 100,
				detail: '未找到虚拟环境 Python，可重试创建。',
			})
			return { ok: false, state: getSetupState(), error: 'venv-python-missing' }
		}

		backendPythonCommand = venvPython
		migrateLegacyRuntimeData({
			runtimeDjangoDir: djangoRuntimeDir,
			backendDataDir,
			log: (line) => pushBackendLog(line),
		})

		setStep('djangoProject', {
			status: 'running',
			progress: 65,
			detail: isDev ? '正在同步 Django 开发源码...' : '正在准备 Django 运行时项目...',
		})
		try {
			if (!fs.existsSync(djangoTemplateDir)) {
				throw new Error(`Django template dir not found: ${djangoTemplateDir}`)
			}
			if (isDev) {
				syncDjangoTemplateToRuntime({
					templateDir: djangoTemplateDir,
					runtimeDir: djangoRuntimeDir,
					log: (line) => pushBackendLog(line),
				})
			} else {
				copyDjangoTemplateToRuntime({
					templateDir: djangoTemplateDir,
					runtimeDir: djangoRuntimeDir,
					log: (line) => pushBackendLog(line),
				})
			}
			ensureRuntimeRequirements({
				templateDir: djangoTemplateDir,
				runtimeDir: djangoRuntimeDir,
				log: (line) => pushBackendLog(line),
			})
			ensureRuntimeDjangoProjectScaffold({
				runtimeDir: djangoRuntimeDir,
				log: (line) => pushBackendLog(line),
			})
			const sanitized = sanitizeRuntimeDjangoDir({
				runtimeDir: djangoRuntimeDir,
				log: (line) => pushBackendLog(line),
			})
			setStep('djangoProject', {
				status: 'ok',
				progress: 100,
				detail: `运行时目录：${djangoRuntimeDir}${sanitized?.removed?.length ? `（已清理 ${sanitized.removed.length} 个运行时文件）` : ''}`,
			})
		} catch (e) {
			pushBackendLog(`[setup] Django 项目准备异常：${String(e?.stack || e?.message || e)}`)
			setStep('djangoProject', {
				status: 'error',
				progress: 100,
				detail: `Django 项目准备失败：${String(e?.message || e)}`,
			})
			return { ok: false, state: getSetupState(), error: 'django-project-prepare-failed' }
		}

		setStep('django', { status: 'running', progress: 70, detail: '正在启动 Django...' })
		await stopBackend()
		try {
			await bootBackend({ pythonCommand: venvPython, djangoDir: djangoRuntimeDir })
			setStep('django', {
				status: 'ok',
				progress: 100,
				detail: `启动成功：${backendBaseUrl}`,
			})

			// 即便启动成功，也需要验证关键依赖（例如 cryptography）。否则会出现“能启动但调用接口 500”。
			setStep('dependencyCheck', { status: 'running', progress: 80, detail: '正在检查关键依赖...' })
			const check = await checkDjangoRuntimeDependencies(venvPython)
			if (check.ok) {
				const versionLine = splitLines(check.stdout || check.stderr)[0] || ''
				setStep('dependencyCheck', {
					status: 'ok',
					progress: 100,
					detail: `依赖齐全${versionLine ? `（Django ${versionLine}）` : ''}`,
				})
				setStep('dependencyInstall', { status: 'ok', progress: 100, detail: '无需安装。' })
			} else {
				setStep('dependencyCheck', {
					status: 'error',
					progress: 100,
					detail: '依赖不完整或已损坏（运行时导入失败）。',
				})
				setStep('dependencyInstall', { status: 'running', progress: 90, detail: '正在强制重装项目依赖...' })
				const install = await installDjangoRuntimeDependencies({
					pythonCommand: venvPython,
					djangoRuntimeDir,
					forceReinstall: true,
				})
				if (!install.ok) {
					setStep('dependencyInstall', {
						status: 'error',
						progress: 100,
						detail: '依赖强制重装失败，请检查网络或 pip 源配置。',
					})
					pushBackendLog('[建议] 依赖安装失败：请检查网络，或配置可用的 pip 镜像后重试。')
					return { ok: false, state: getSetupState(), error: 'dependency-install-failed' }
				}
				setStep('dependencyCheck', {
					status: 'ok',
					progress: 100,
					detail: '依赖安装完成并可用。',
				})
				setStep('dependencyInstall', { status: 'ok', progress: 100, detail: '依赖安装完成。' })

				setStep('django', { status: 'running', progress: 95, detail: '依赖已补齐，正在重启 Django...' })
				await stopBackend()
				await bootBackend({ pythonCommand: venvPython, djangoDir: djangoRuntimeDir })
				setStep('django', { status: 'ok', progress: 100, detail: `启动成功：${backendBaseUrl}` })
			}
		} catch (startErr) {
			setStep('django', {
				status: 'error',
				progress: 100,
				detail: `首次启动失败：${String(startErr?.message || startErr)}`,
			})

			setStep('dependencyCheck', { status: 'running', progress: 80, detail: '正在检查关键依赖...' })
			const check = await checkDjangoRuntimeDependencies(venvPython)
			if (!check.ok) {
				setStep('dependencyCheck', {
					status: 'error',
					progress: 100,
					detail: '依赖检查失败（关键模块缺失或包已损坏）。',
				})

				setStep('dependencyInstall', { status: 'running', progress: 90, detail: '正在强制重装项目依赖...' })
				const install = await installDjangoRuntimeDependencies({
					pythonCommand: venvPython,
					djangoRuntimeDir,
					forceReinstall: true,
				})
				if (!install.ok) {
					setStep('dependencyInstall', {
						status: 'error',
						progress: 100,
						detail: '依赖强制重装失败，请检查网络或 pip 源配置。',
					})
					pushBackendLog('[建议] 依赖安装失败：请检查网络，或配置可用的 pip 镜像后重试。')
					return { ok: false, state: getSetupState(), error: 'dependency-install-failed' }
				}
				setStep('dependencyCheck', {
					status: 'ok',
					progress: 100,
					detail: '依赖安装完成并可用。',
				})
				setStep('dependencyInstall', { status: 'ok', progress: 100, detail: '依赖安装完成。' })
			} else {
				const versionLine = splitLines(check.stdout || check.stderr)[0] || ''
				setStep('dependencyCheck', {
					status: 'ok',
					progress: 100,
					detail: `Django 已可用 ${versionLine ? `(${versionLine})` : ''}`,
				})
				setStep('dependencyInstall', { status: 'ok', progress: 100, detail: '无需安装。' })
			}

			setStep('django', { status: 'running', progress: 95, detail: '依赖就绪，正在重新启动 Django...' })
			try {
				await stopBackend()
				await bootBackend({ pythonCommand: venvPython, djangoDir: djangoRuntimeDir })
				setStep('django', {
					status: 'ok',
					progress: 100,
					detail: `启动成功：${backendBaseUrl}`,
				})
			} catch (e2) {
				setStep('django', {
					status: 'error',
					progress: 100,
					detail: `重试启动失败：${String(e2?.message || e2)}`,
				})
				pushBackendLog('[建议] Django 仍启动失败：请查看上方错误，重点关注数据库权限、端口占用和 settings 配置。')
				return { ok: false, state: getSetupState(), error: 'django-restart-failed' }
			}
		}

		setStep('ffmpeg', { status: 'running', progress: 60, detail: '检测 ffmpeg（可选）...' })
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
		return { ok: true, state: getSetupState(), baseUrl: backendBaseUrl, port: backendPort }
	} finally {
		setupRunning = false
		updateBackendRuntimeState({ setupRunning: false })
		setupUpdatedAt = Date.now()
	}
}

async function bootBackend(options = {}) {
	backendLastError = ''
	const pyCommand = options.pythonCommand || backendPythonCommand || ''
	const djangoDir = options.djangoDir || getRuntimeDjangoAppDir()
	backendDjangoDir = djangoDir
	backendPythonForKill = pyCommand
	pushBackendLog('[backend] 启动前清理旧进程...')

	try {
		killExistingDjangoRunservers({
			pythonCommand: pyCommand,
			djangoDir,
			onLog: (line) => pushBackendLog(line),
		})
	} catch (e) {
		pushBackendLog(`[backend] 清理遗留进程失败：${String(e?.message || e)}`)
	}

	backendPort = await pickBackendPort({ preferred: 5800, range: 100 })
	backendBaseUrl = `http://127.0.0.1:${backendPort}`
	pushBackendLog(`[backend] 端口选择：${backendPort}`)

	const child = startDjangoServer({
		port: backendPort,
		djangoDir,
		dataDir: getBackendDataDir(),
		onLog: (line) => pushBackendLog(line),
		extraEnv: {
			...getBackendSettingsEnv(),
			...(pyCommand ? { __DWEB_PYTHON_COMMAND: pyCommand } : {}),
		},
	})
	backend = child
	pushBackendLog(`[backend] Django 进程已启动，pid=${child.pid || 'unknown'}`)

	child.stdout?.on('data', (s) => {
		// 生产可写入 logs/；开发期直接输出到控制台
		process.stdout.write(`[django] ${s}`)
		onBackendChunk('stdout', s)
	})
	child.stderr?.on('data', (s) => {
		process.stderr.write(`[django] ${s}`)
		onBackendChunk('stderr', s)
	})

	child.once('exit', (code) => {
		if (backend === child) backend = null
		pushBackendLog(`[exit] Django exited with code ${code}`)
		updateBackendRuntimeState({
			running: false,
			healthy: false,
			baseUrl: backendBaseUrl,
			port: backendPort,
			lastError: backendLastError || (code && code !== 0 ? `Django exited with code ${code}` : ''),
		})
		if (code && code !== 0) {
			console.error(`Django exited with code ${code}`)
		}
	})

	await waitForBackendReady(backendBaseUrl, { timeoutMs: 25000 })
	updateBackendRuntimeState({
		running: true,
		healthy: true,
		baseUrl: backendBaseUrl,
		port: backendPort,
		lastError: '',
	})
}

async function waitBackendProcessExit(proc, { timeoutMs = 8000 } = {}) {
	if (!proc) return true
	if (proc.killed) return true
	return await new Promise((resolve) => {
		let done = false
		const finish = (ok) => {
			if (done) return
			done = true
			resolve(ok)
		}
		const timer = setTimeout(() => {
			try {
				proc.kill('SIGKILL')
			} catch {
				// ignore
			}
			finish(false)
		}, timeoutMs)
		proc.once('exit', () => {
			clearTimeout(timer)
			finish(true)
		})
	})
}

async function refreshBackendHealth() {
	if (!backend || !backendBaseUrl) {
		updateBackendRuntimeState({
			running: false,
			healthy: false,
			baseUrl: backendBaseUrl,
			port: backendPort,
			lastError: backendLastError || '',
		})
		return
	}
	try {
		const res = await fetch(`${backendBaseUrl}/api/ai/ping`, { method: 'GET' })
		updateBackendRuntimeState({
			running: true,
			healthy: !!res.ok,
			baseUrl: backendBaseUrl,
			port: backendPort,
			lastError: res.ok ? '' : `backend ping status ${res.status}`,
		})
	} catch (e) {
		updateBackendRuntimeState({
			running: !!backend,
			healthy: false,
			baseUrl: backendBaseUrl,
			port: backendPort,
			lastError: String(e?.message || e || 'backend ping failed'),
		})
	}
}

function ensureBackendHealthMonitor() {
	if (backendHealthTimer != null) return
	backendHealthTimer = setInterval(() => {
		void refreshBackendHealth()
	}, BACKEND_HEALTH_PING_INTERVAL_MS)
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

	// Ensure native menu bar stays hidden (Windows/Linux).
	try {
		Menu.setApplicationMenu(null)
	} catch {
		// ignore
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
}

function registerIpc() {
	const getSenderWindow = (e) => {
		try {
			return BrowserWindow.fromWebContents(e.sender)
		} catch {
			return mainWindow
		}
	}

	ipcMain.handle('dweb:getBackendBaseUrl', async () => backendBaseUrl)
	ipcMain.handle('dweb:backendRuntime:getState', async () => snapshotBackendRuntimeState())

	// Window controls (for custom title bar)
	ipcMain.handle('dweb:window:minimize', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		win.minimize()
		return { ok: true }
	})

	ipcMain.handle('dweb:window:toggleMaximize', async (e) => {
		const win = getSenderWindow(e)
		if (!win) return { ok: false, error: 'No window.' }
		if (win.isMaximized()) win.unmaximize()
		else win.maximize()
		return { ok: true, maximized: win.isMaximized() }
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
		running: !!backend,
		baseUrl: backendBaseUrl,
		port: backendPort,
		lastError: backendLastError,
		logLineCount: backendLogLines.length,
	}))

	ipcMain.handle('dweb:backend:ping', async () => {
		try {
			const res = await fetch(`${backendBaseUrl}/api/ai/ping`)
			return { ok: res.ok, status: res.status }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	})

	ipcMain.handle('dweb:backend:start', async () => {
		return withBackendOpLock(async () => {
			await stopBackend()
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
			return { ok: true, baseUrl: backendBaseUrl, port: backendPort }
		})
	})

	ipcMain.handle('dweb:backend:restart', async () => {
		return withBackendOpLock(async () => {
			await stopBackend()
			try {
				const setupResult = await runSetupWorkflow({ reason: 'manual-restart' })
				if (!setupResult.ok) {
					return { ok: false, error: setupResult.error || 'setup failed' }
				}
				return { ok: true, baseUrl: backendBaseUrl, port: backendPort }
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
			baseUrl: backendBaseUrl,
			port: backendPort,
			running: !!backend,
			lastError: backendLastError,
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
			await stopBackend()
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
		await shell.openPath(getUserDataDir())
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
			let target = ''
			if (fs.existsSync(normalized)) {
				try {
					const stat = fs.statSync(normalized)
					target = stat.isDirectory() ? normalized : path.dirname(normalized)
				} catch {
					target = path.dirname(normalized)
				}
			} else {
				target = path.dirname(normalized)
			}
			if (!target || !fs.existsSync(target)) return { ok: false, error: 'path not found' }
			const openErr = await shell.openPath(target)
			if (openErr) return { ok: false, error: String(openErr) }
			return { ok: true }
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
		const ok = setProjectRoot(projectId, rootPath)
		return { ok: !!ok }
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

	// Project asset operations (local only; replaces Django backend assets/* API)
	ipcMain.handle('dweb:aiworkflow:uploadProjectAsset', async (_e, payload) => {
		try {
			return uploadProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:importProjectAsset', async (_e, payload) => {
		try {
			return await importProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:deleteProjectAsset', async (_e, payload) => {
		try {
			return deleteProjectAsset(payload || {})
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	ipcMain.handle('dweb:aiworkflow:resolveProjectAsset', async (_e, payload) => {
		try {
			return resolveProjectAsset(payload || {})
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

	// Fetch a URL in the main process (bypasses browser CORS) and return Uint8Array / mime
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

	ipcMain.handle('dweb:localdb:migrateFromDjango', async (_e, payload) => {
		try {
			const legacy = String(payload?.legacyDbPath || '').trim() || path.resolve(getBackendDataDir(), 'db.sqlite3')
			const result = runLegacyDbMigration({
				legacyDbPath: legacy,
				backendDataDir: payload?.backendDataDir || getBackendDataDir(),
				force: Boolean(payload?.force),
			})
			return result
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	})

	// 图片预览原生窗口
	let imageMarkupWindow = null
	ipcMain.handle('dweb:image-markup:open', async (_e, payload) => {
		console.log('[main] dweb:image-markup:open payload:', JSON.stringify(payload))
		try {
			const url = String(payload?.url || '').trim()
			const name = String(payload?.name || '图片预览').slice(0, 200)
			console.log('[main] url resolved:', url, 'name:', name)
			if (!url) return { ok: false, error: 'missing url' }

			// 如果已存在，则先关闭
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
			// 关闭预览窗口
			if (imageMarkupWindow && !imageMarkupWindow.isDestroyed()) {
				try { imageMarkupWindow.close() } catch {}
			}
			return { ok: true }
		} catch (err) {
			console.error('[main][image-markup] export failed', err)
			return { ok: false, error: String(err?.message || err) }
		}
	})
}

async function stopBackend() {
	const proc = backend
	if (!proc) {
		pushBackendLog('[backend] stopBackend: 当前无活动进程，执行残留清理。')
		try {
			killExistingDjangoRunservers({
				pythonCommand: backendPythonForKill,
				djangoDir: backendDjangoDir || getRuntimeDjangoAppDir(),
				onLog: (line) => pushBackendLog(line),
			})
		} catch {
			// ignore
		}
		return
	}
	pushBackendLog(`[backend] stopBackend: 准备停止 pid=${proc.pid || 'unknown'}`)
	try {
		proc.kill('SIGTERM')
	} catch {
		// ignore
	}
	const exited = await waitBackendProcessExit(proc, { timeoutMs: 8000 })
	if (exited) {
		pushBackendLog('[backend] stopBackend: 进程已退出。')
	}
	if (!exited) {
		pushBackendLog('[backend] 旧 Django 进程未及时退出，已尝试强制结束。')
	}
	backend = null
	try {
		killExistingDjangoRunservers({
			pythonCommand: backendPythonForKill,
			djangoDir: backendDjangoDir || getRuntimeDjangoAppDir(),
			onLog: (line) => pushBackendLog(line),
		})
	} catch {
		// ignore
	}
	updateBackendRuntimeState({
		running: false,
		healthy: false,
		baseUrl: backendBaseUrl,
		port: backendPort,
		lastError: backendLastError || '',
	})
}

async function main() {
	app.setName(APP_NAME)
	initRuntimeLogger()
	registerRuntimeDiagnostics()
	registerDwebProjectAssetProtocol()
	ensureBackendHealthMonitor()
	ensureClientResourceLayout()
	loadClientSettings()

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
	appendRuntimeLog(`[app] isPackaged=${app.isPackaged} platform=${process.platform} execPath=${process.execPath}`)

	await createWindow()
	void withBackendOpLock(async () => {
		try {
			appendRuntimeLog('[app] auto setup workflow start')
			const result = await runSetupWorkflow({ reason: 'app-start' })
			if (!result?.ok) {
				const msg = String(result?.error || 'setup failed')
				backendLastError = msg
				pushBackendLog(`[error] auto setup failed: ${msg}`)
				updateBackendRuntimeState({ lastError: backendLastError, healthy: false })
			}
		} catch (e) {
			backendLastError = String(e?.message || e)
			pushBackendLog(`[error] auto setup exception: ${backendLastError}`)
			updateBackendRuntimeState({ lastError: backendLastError, healthy: false })
		}
	})
}

app.on('window-all-closed', () => {
	// macOS 常规行为是保留；这里先按 Windows 体验直接退出
	app.quit()
})

app.on('before-quit', async () => {
	if (backendHealthTimer != null) {
		clearInterval(backendHealthTimer)
		backendHealthTimer = null
	}
	await stopBackend()
})

app.whenReady().then(main)
