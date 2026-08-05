import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getDvsResourceDir } from './paths.mjs'

function getUserSettingsDir() {
	return path.resolve(getDvsResourceDir(), 'UserSettings')
}

function getUserSettingsFilePath() {
	return path.resolve(getUserSettingsDir(), 'settings.json')
}

let _settingsCache = null
let _settingsCacheTime = 0
const SETTINGS_CACHE_TTL = 5000

export function getClientSettings() {
	const now = Date.now()
	if (_settingsCache && now - _settingsCacheTime < SETTINGS_CACHE_TTL) {
		return _settingsCache
	}

	try {
		const settingsPath = getUserSettingsFilePath()
		if (fs.existsSync(settingsPath)) {
			const raw = fs.readFileSync(settingsPath, 'utf-8')
			_settingsCache = JSON.parse(raw)
			_settingsCacheTime = now
			return _settingsCache
		}
	} catch (err) {
		console.error('[subtitle-recog] Failed to read client settings:', err.message)
	}

	_settingsCache = {}
	_settingsCacheTime = now
	return _settingsCache
}

export function getProxyUrl() {
	const settings = getClientSettings()
	const configuredProxy = String((settings && settings.httpProxy) || '').trim()
	if (configuredProxy) {
		return configuredProxy
	}
	return (
		process.env.HTTPS_PROXY ||
		process.env.HTTP_PROXY ||
		process.env.https_proxy ||
		process.env.http_proxy ||
		''
	)
}

export function getAgentForUrl(url) {
	try {
		const u = new URL(url)
		const isHttps = u.protocol === 'https:'
		const proxyUrl = getProxyUrl()

		if (proxyUrl) {
			console.log(`[subtitle-recog] Using proxy: ${proxyUrl} for ${url}`)
			return new HttpsProxyAgent(proxyUrl, { keepAlive: true })
		}

		return isHttps
			? new https.Agent({ keepAlive: true, keepAliveMsecs: 300 * 1000 })
			: new http.Agent({ keepAlive: true, keepAliveMsecs: 300 * 1000 })
	} catch (err) {
		console.error('[subtitle-recog] Failed to create agent:', err.message)
		return new https.Agent({ keepAlive: true })
	}
}

export async function checkUrlAvailable(url, timeoutMs = 8000) {
	return new Promise((resolve) => {
		try {
			const parsedUrl = new URL(url)
			const transport = parsedUrl.protocol === 'https:' ? https : http
			const agent = getAgentForUrl(url)

			const req = transport.request(
				{
					method: 'HEAD',
					hostname: parsedUrl.hostname,
					port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
					path: parsedUrl.pathname + parsedUrl.search,
					agent,
					timeout: timeoutMs,
					headers: {
						'User-Agent': 'DVStudio-SubtitleRecog/1.0'
					}
				},
				(res) => {
					res.resume()
					const ok = res.statusCode >= 200 && res.statusCode < 400
					resolve({
						ok,
						status: res.statusCode,
						contentLength: res.headers['content-length']
							? parseInt(res.headers['content-length'], 10)
							: null,
						supportsRange: res.headers['accept-ranges'] === 'bytes'
					})
				}
			)

			req.on('error', (err) => {
				resolve({ ok: false, error: err.message })
			})

			req.on('timeout', () => {
				req.destroy()
				resolve({ ok: false, error: 'timeout' })
			})

			req.end()
		} catch (err) {
			resolve({ ok: false, error: err.message })
		}
	})
}
