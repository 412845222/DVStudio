import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

export function loadSteamEnv() {
	const envPath = path.join(repoRoot, 'steam-pipe', '.env')
	if (!fs.existsSync(envPath)) return
	const content = fs.readFileSync(envPath, 'utf8')
	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) continue
		const key = trimmed.slice(0, eqIndex).trim()
		let value = trimmed.slice(eqIndex + 1).trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}
		if (process.env[key] === undefined || process.env[key] === '') {
			process.env[key] = value
		}
	}
}

export function getSteamEnvPath() {
	return path.join(repoRoot, 'steam-pipe', '.env')
}

export function getRepoRoot() {
	return repoRoot
}
