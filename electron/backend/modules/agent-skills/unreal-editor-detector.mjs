import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getRepoRoot, isAppPackaged, getResourcesPath } from '../../../config.mjs'

const execFileAsync = promisify(execFile)

const PLUGIN_NAME = 'DwebWorkflowBridge'
const PLUGIN_DESCRIPTOR = `${PLUGIN_NAME}.uplugin`
const PLUGIN_ZIP_FILENAME = `${PLUGIN_NAME}-source.zip`

function getUnrealPluginStaticDir() {
	if (isAppPackaged() && getResourcesPath()) {
		return path.resolve(getResourcesPath(), 'static', 'unreal-plugin')
	}
	return path.resolve(getRepoRoot(), 'electron', 'static', 'unreal-plugin')
}

export function getPluginPackagePath() {
	return path.resolve(getUnrealPluginStaticDir(), PLUGIN_ZIP_FILENAME)
}

function parseWmicOutput(stdout) {
	const processes = []
	const blocks = String(stdout || '').trim().split(/\r?\n\r?\n/)
	for (const block of blocks) {
		const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0)
		if (lines.length < 2) continue
		const info = {}
		for (const line of lines) {
			const eqIdx = line.indexOf('=')
			if (eqIdx <= 0) continue
			const key = line.slice(0, eqIdx).trim()
			const value = line.slice(eqIdx + 1).trim()
			info[key.toLowerCase()] = value
		}
		if (info.processid) {
			processes.push({
				pid: Number(info.processid) || 0,
				commandLine: info.commandline || ''
			})
		}
	}
	return processes
}

function extractUprojectPath(commandLine) {
	if (!commandLine) return ''
	const patterns = [/"([^"]+\.uproject)"/i, /(\S+\.uproject)/i]
	for (const pattern of patterns) {
		const match = commandLine.match(pattern)
		if (match && match[1]) {
			const candidate = match[1].trim()
			if (candidate.toLowerCase().endsWith('.uproject')) {
				return candidate
			}
		}
	}
	return ''
}

function extractProjectName(projectPath) {
	if (!projectPath) return ''
	const base = path.basename(projectPath)
	if (base.toLowerCase().endsWith('.uproject')) {
		return base.slice(0, -'.uproject'.length)
	}
	return path.basename(path.dirname(projectPath)) || base
}

function isValidUprojectPath(projectPath) {
	if (!projectPath) return false
	try {
		return fs.existsSync(projectPath) && projectPath.toLowerCase().endsWith('.uproject')
	} catch {
		return false
	}
}

function resolveProjectRootFromUproject(uprojectPath) {
	if (!uprojectPath) return ''
	const dir = path.dirname(uprojectPath)
	const base = path.basename(uprojectPath)
	if (base.toLowerCase().endsWith('.uproject')) {
		return dir
	}
	return uprojectPath
}

export async function detectUnrealEditorProcesses() {
	if (process.platform !== 'win32') {
		return {
			ok: false,
			running: false,
			processes: [],
			error: `Unreal Editor detection is only supported on Windows (current: ${process.platform})`
		}
	}

	try {
		const { stdout } = await execFileAsync(
			'wmic',
			['process', 'where', "name='UnrealEditor.exe'", 'get', 'commandline,processid', '/FORMAT:LIST'],
			{ timeout: 10000, windowsHide: true }
		)

		const rawProcesses = parseWmicOutput(stdout)
		const processes = []

		for (const proc of rawProcesses) {
			const uprojectPath = extractUprojectPath(proc.commandLine)
			const projectRoot = uprojectPath ? resolveProjectRootFromUproject(uprojectPath) : ''
			const projectName = extractProjectName(uprojectPath || projectRoot)

			processes.push({
				pid: proc.pid,
				projectPath: projectRoot,
				uprojectPath,
				projectName,
				commandLine: proc.commandLine
			})
		}

		return {
			ok: true,
			running: processes.length > 0,
			processes
		}
	} catch (err) {
		try {
			const { stdout: tasklistOut } = await execFileAsync(
				'tasklist',
				['/FI', 'IMAGENAME eq UnrealEditor.exe', '/FO', 'CSV', '/NH'],
				{ timeout: 8000, windowsHide: true }
			)
			const lines = String(tasklistOut || '').split(/\r?\n/).filter((l) => l.trim().length > 0)
			const running = lines.length > 0 && !lines[0].toLowerCase().includes('no tasks')
			if (!running) {
				return { ok: true, running: false, processes: [] }
			}
			return {
				ok: true,
				running: true,
				processes: [],
				warning: 'wmic unavailable, only process existence detected'
			}
		} catch (tasklistErr) {
			return {
				ok: false,
				running: false,
				processes: [],
				error: `Failed to detect Unreal Editor: ${err.message || err}`
			}
		}
	}
}

export function detectProjectRootFromUserInput(inputPath) {
	const trimmed = String(inputPath || '').trim()
	if (!trimmed) return { ok: false, error: '项目路径不能为空' }

	let candidate = trimmed
	if (candidate.toLowerCase().endsWith('.uproject')) {
		if (!fs.existsSync(candidate)) {
			return { ok: false, error: `.uproject 文件不存在: ${candidate}` }
		}
		const projectRoot = path.dirname(candidate)
		return {
			ok: true,
			projectRoot,
			uprojectPath: candidate,
			projectName: extractProjectName(candidate)
		}
	}

	if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
		const files = fs.readdirSync(candidate)
		const uprojectFile = files.find((f) => f.toLowerCase().endsWith('.uproject'))
		if (uprojectFile) {
			return {
				ok: true,
				projectRoot: candidate,
				uprojectPath: path.join(candidate, uprojectFile),
				projectName: extractProjectName(uprojectFile)
			}
		}
		return { ok: false, error: `目录中未找到 .uproject 文件: ${candidate}` }
	}

	return { ok: false, error: `路径无效或不存在: ${candidate}` }
}

export function checkPluginInstalled(projectPath) {
	const resolved = detectProjectRootFromUserInput(projectPath)
	if (!resolved.ok) {
		return { ok: false, installed: false, error: resolved.error }
	}

	const pluginDir = path.join(resolved.projectRoot, 'Plugins', PLUGIN_NAME)
	const upluginPath = path.join(pluginDir, PLUGIN_DESCRIPTOR)

	if (!fs.existsSync(upluginPath)) {
		return {
			ok: true,
			installed: false,
			projectRoot: resolved.projectRoot,
			projectName: resolved.projectName
		}
	}

	let pluginVersion = ''
	try {
		const raw = fs.readFileSync(upluginPath, 'utf-8')
		const json = JSON.parse(raw)
		pluginVersion = String(json.VersionName || json.Version || '').trim()
	} catch {
		// ignore parse errors
	}

	return {
		ok: true,
		installed: true,
		pluginVersion,
		pluginPath: pluginDir,
		upluginPath,
		projectRoot: resolved.projectRoot,
		projectName: resolved.projectName
	}
}

export async function installPluginToProject(projectPath) {
	const resolved = detectProjectRootFromUserInput(projectPath)
	if (!resolved.ok) {
		return { ok: false, installed: false, error: resolved.error }
	}

	const projectRoot = resolved.projectRoot
	const pluginsDir = path.join(projectRoot, 'Plugins')
	const pluginDir = path.join(pluginsDir, PLUGIN_NAME)
	const zipPath = getPluginPackagePath()

	if (!fs.existsSync(zipPath)) {
		return { ok: false, installed: false, error: `插件安装包不存在: ${zipPath}` }
	}

	const existing = checkPluginInstalled(projectRoot)
	let backupDir = ''
	if (existing.ok && existing.installed && existing.pluginPath) {
		backupDir = `${existing.pluginPath}.bak.${Date.now()}`
		try {
			fs.renameSync(existing.pluginPath, backupDir)
		} catch (err) {
			return {
				ok: false,
				installed: false,
				error: `无法备份现有插件: ${err.message || err}`
			}
		}
	}

	try {
		if (!fs.existsSync(pluginsDir)) {
			fs.mkdirSync(pluginsDir, { recursive: true })
		}

		await extractZipWithPowershell(zipPath, pluginsDir)

		const upluginPath = path.join(pluginDir, PLUGIN_DESCRIPTOR)
		if (!fs.existsSync(upluginPath)) {
			if (backupDir && fs.existsSync(backupDir)) {
				try { fs.renameSync(backupDir, pluginDir) } catch { /* ignore */ }
			}
			return { ok: false, installed: false, error: '插件解压失败，未找到 .uplugin 文件' }
		}

		if (backupDir && fs.existsSync(backupDir)) {
			try { fs.rmSync(backupDir, { recursive: true, force: true }) } catch { /* ignore */ }
		}

		let pluginVersion = ''
		try {
			const raw = fs.readFileSync(upluginPath, 'utf-8')
			const json = JSON.parse(raw)
			pluginVersion = String(json.VersionName || json.Version || '').trim()
		} catch { /* ignore */ }

		return {
			ok: true,
			installed: true,
			pluginPath: pluginDir,
			pluginVersion,
			projectRoot,
			projectName: resolved.projectName,
			needsRestart: true
		}
	} catch (err) {
		if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(pluginDir)) {
			try { fs.renameSync(backupDir, pluginDir) } catch { /* ignore */ }
		}
		return {
			ok: false,
			installed: false,
			error: `插件安装失败: ${err.message || err}`
		}
	}
}

export function writePluginConnectionConfig(projectPath, port) {
	const resolved = detectProjectRootFromUserInput(projectPath)
	if (!resolved.ok) {
		return { ok: false, error: resolved.error }
	}

	const pluginDir = path.join(resolved.projectRoot, 'Plugins', PLUGIN_NAME)
	const configPath = path.join(pluginDir, 'connection-config.json')

	try {
		if (!fs.existsSync(pluginDir)) {
			return { ok: false, error: '插件目录不存在，请先安装插件' }
		}

		const config = {
			backendUrl: `http://127.0.0.1:${port}`,
			apiBasePath: '/api/agent-skills/unreal',
			updatedAt: new Date().toISOString()
		}

		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
		return { ok: true, configPath }
	} catch (err) {
		return {
			ok: false,
			error: `写入连接配置失败: ${err.message || err}`
		}
	}
}

function extractZipWithPowershell(zipPath, destDir) {
	return new Promise((resolve, reject) => {
		const psCommand = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
		execFileAsync('powershell', [
			'-NoProfile',
			'-ExecutionPolicy', 'Bypass',
			'-Command', psCommand
		], { timeout: 60000, windowsHide: true })
			.then(({ stdout, stderr }) => {
				if (stderr && stderr.trim().length > 0) {
					console.warn('[unreal-editor-detector] powershell stderr:', stderr)
				}
				resolve({ stdout, stderr })
			})
			.catch(reject)
	})
}

export function getPluginInfo() {
	const zipPath = getPluginPackagePath()
	if (!fs.existsSync(zipPath)) {
		return { ok: false, pluginName: PLUGIN_NAME, pluginVersion: '', error: `插件安装包不存在: ${zipPath}` }
	}

	const stat = fs.statSync(zipPath)
	return {
		ok: true,
		pluginName: PLUGIN_NAME,
		pluginVersion: 'bundled',
		packageSize: stat.size,
		packagePath: zipPath
	}
}
