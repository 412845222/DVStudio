import { createRequire } from 'module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let _localModule = null
let _localLoaded = false

function tryLoadLocal() {
	if (_localLoaded) return _localModule
	_localLoaded = true
	try {
		const localPath = path.join(__dirname, 'steam.local.cjs')
		_localModule = require(localPath)
		console.log('[platform:steam] Loaded local Steam provider implementation')
	} catch (err) {
		console.log('[platform:steam] Local Steam provider (steam.local.cjs) not found, Steam integration disabled')
		_localModule = null
	}
	return _localModule
}

export function createSteamProvider(config) {
	const mod = tryLoadLocal()
	if (!mod || typeof mod.createSteamProvider !== 'function') {
		return null
	}
	return mod.createSteamProvider(config)
}
