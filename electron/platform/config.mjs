import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const DEFAULT_STEAM_APP_ID = 480

function readUserDataConfig() {
	try {
		const userDataPath = app.getPath('userData')
		const configPath = path.join(userDataPath, 'steam_config.json')
		if (fs.existsSync(configPath)) {
			const raw = fs.readFileSync(configPath, 'utf8')
			return JSON.parse(raw)
		}
	} catch { /* ignore */ }
	return null
}

function readSteamAppIdTxt() {
	try {
		const candidates = [
			path.join(process.cwd(), 'steam_appid.txt'),
		]
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
	} catch { /* ignore */ }
	return null
}

export function getSteamConfig() {
	const userConfig = readUserDataConfig()
	const txtAppId = readSteamAppIdTxt()

	let appId = DEFAULT_STEAM_APP_ID
	let configSource = 'default (480/SpaceWar)'
	if (process.env.STEAM_APP_ID) {
		const id = parseInt(process.env.STEAM_APP_ID, 10)
		if (!isNaN(id) && id > 0) {
			appId = id
			configSource = 'environment variable STEAM_APP_ID'
		}
	} else if (userConfig?.appId && typeof userConfig.appId === 'number') {
		appId = userConfig.appId
		configSource = 'user config (steam_config.json)'
	} else if (txtAppId) {
		appId = txtAppId
		configSource = 'steam_appid.txt'
	}

	const config = {
		appId,
		webApiKey: userConfig?.webApiKey || process.env.STEAM_WEB_API_KEY || '',
		environment: userConfig?.environment || 'development',
	}

	console.log(`[platform:config] Steam AppID: ${appId} (source: ${configSource})`)
	return config
}

export { DEFAULT_STEAM_APP_ID }
