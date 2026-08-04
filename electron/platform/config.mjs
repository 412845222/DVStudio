import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readJsonConfig(configPath) {
	try {
		if (fs.existsSync(configPath)) {
			const raw = fs.readFileSync(configPath, 'utf8')
			return JSON.parse(raw)
		}
	} catch {
		/* ignore */
	}
	return null
}

function readProjectConfig() {
	const candidates = []

	candidates.push(path.resolve(__dirname, '..', 'steam.config.json'))

	if (!app.isPackaged) {
		candidates.push(path.resolve(__dirname, '..', '..', 'steam.config.json'))
	}

	if (app.isReady()) {
		candidates.push(path.join(path.dirname(process.execPath), 'steam.config.json'))
	}

	for (const configPath of candidates) {
		const cfg = readJsonConfig(configPath)
		if (cfg) return cfg
	}
	return null
}

function readUserDataConfig() {
	try {
		if (!app || !app.isReady()) return null
		const userDataPath = app.getPath('userData')
		const configPath = path.join(userDataPath, 'steam_config.json')
		return readJsonConfig(configPath)
	} catch {
		/* ignore */
	}
	return null
}

function readSteamAppIdTxt() {
	try {
		const candidates = [path.join(process.cwd(), 'steam_appid.txt')]
		if (!app.isPackaged) {
			const nativeWin32Dir = path.join(__dirname, 'native', 'win32')
			candidates.push(path.join(nativeWin32Dir, 'steam_appid.txt'))
		}
		if (app.isReady()) {
			candidates.push(path.join(path.dirname(process.execPath), 'steam_appid.txt'))
		}
		for (const file of candidates) {
			if (fs.existsSync(file)) {
				const content = fs.readFileSync(file, 'utf8').trim()
				const id = parseInt(content, 10)
				if (!isNaN(id) && id > 0) return id
			}
		}
	} catch {
		/* ignore */
	}
	return null
}

export function getSteamConfig() {
	console.log('[platform:config] === Starting Steam configuration lookup ===')
	console.log('[platform:config] isPackaged:', app.isPackaged)
	console.log('[platform:config] process.cwd():', process.cwd())
	console.log('[platform:config] process.execPath:', process.execPath)
	console.log('[platform:config] SteamAppId env:', process.env.SteamAppId || '(not set)')
	console.log('[platform:config] STEAM_APP_ID env:', process.env.STEAM_APP_ID || '(not set)')

	const projectConfigCandidates = [path.resolve(__dirname, '..', 'steam.config.json')]
	if (!app.isPackaged) {
		projectConfigCandidates.push(path.resolve(__dirname, '..', '..', 'steam.config.json'))
	}
	if (app.isReady()) {
		projectConfigCandidates.push(path.join(path.dirname(process.execPath), 'steam.config.json'))
	}
	console.log('[platform:config] Project config candidates:')
	for (const p of projectConfigCandidates) {
		const exists = fs.existsSync(p)
		console.log(`[platform:config]   - ${p} (exists: ${exists})`)
	}

	const projectConfig = readProjectConfig()
	console.log(
		'[platform:config] Project config loaded:',
		projectConfig ? JSON.stringify(projectConfig) : '(none)'
	)

	let userDataPath = '(app not ready)'
	try {
		if (app.isReady()) {
			userDataPath = app.getPath('userData')
		}
	} catch {}
	console.log('[platform:config] userData path:', userDataPath)
	const userConfig = readUserDataConfig()
	console.log(
		'[platform:config] User config loaded:',
		userConfig ? JSON.stringify(userConfig) : '(none)'
	)

	const txtCandidates = [path.join(process.cwd(), 'steam_appid.txt')]
	if (!app.isPackaged) {
		const nativeWin32Dir = path.join(__dirname, 'native', 'win32')
		txtCandidates.push(path.join(nativeWin32Dir, 'steam_appid.txt'))
	}
	if (app.isReady()) {
		txtCandidates.push(path.join(path.dirname(process.execPath), 'steam_appid.txt'))
	}
	console.log('[platform:config] steam_appid.txt candidates:')
	for (const p of txtCandidates) {
		const exists = fs.existsSync(p)
		let content = ''
		if (exists) {
			try {
				content = fs.readFileSync(p, 'utf8').trim()
			} catch {}
		}
		console.log(`[platform:config]   - ${p} (exists: ${exists}, content: ${content || '(empty)'})`)
	}
	const txtAppId = readSteamAppIdTxt()
	console.log('[platform:config] steam_appid.txt AppID:', txtAppId || '(none)')

	let appId = 0
	let configSource = 'disabled (no config found)'

	if (process.env.SteamAppId) {
		const id = parseInt(process.env.SteamAppId, 10)
		if (!isNaN(id) && id > 0) {
			appId = id
			configSource = 'Steam client (SteamAppId env)'
		}
	} else if (process.env.STEAM_APP_ID) {
		const id = parseInt(process.env.STEAM_APP_ID, 10)
		if (!isNaN(id) && id > 0) {
			appId = id
			configSource = 'environment variable STEAM_APP_ID'
		}
	} else if (userConfig?.appId && typeof userConfig.appId === 'number') {
		appId = userConfig.appId
		configSource = 'user config (steam_config.json in userData)'
	} else if (projectConfig?.appId && typeof projectConfig.appId === 'number') {
		appId = projectConfig.appId
		configSource = 'project config (steam.config.json)'
	} else if (txtAppId) {
		appId = txtAppId
		configSource = 'steam_appid.txt'
	}

	const config = {
		appId,
		environment: userConfig?.environment || projectConfig?.environment || 'production'
	}

	if (appId > 0) {
		console.log(`[platform:config] === Steam AppID: ${appId} (source: ${configSource}) ===`)
	} else {
		console.log('[platform:config] === Steam integration disabled (no valid AppID configured) ===')
	}
	return config
}
