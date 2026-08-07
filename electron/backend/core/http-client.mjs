import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { createRequire } from 'node:module'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { UpstreamError, ValidationError } from './errors.mjs'

// ESM 模块中 require 并非全局函数，需通过 createRequire 创建，
// 否则打包后 require('electron') 会抛 ReferenceError 被 try/catch 静默吞掉，
// 导致 getClientRootDir / getElectronNet 失效，进而使 meshy 等网络请求在打包 exe 后无法访问。
const require = createRequire(import.meta.url)

const DEFAULT_TIMEOUT = 30000

const defaultHttpsAgent = new https.Agent({
	keepAlive: true,
	keepAliveMsecs: 300 * 1000
})

const defaultHttpAgent = new http.Agent({
	keepAlive: true,
	keepAliveMsecs: 300 * 1000
})

function getElectronNet() {
	try {
		const electron = require('electron')
		if (electron && electron.net) {
			return electron.net
		}
	} catch {}
	return null
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

function getServiceRepoRoot() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	return path.resolve(here, '..', '..', '..')
}

function getClientRootDir() {
	try {
		const electron = require('electron')
		const app = electron.app
		if (app?.isPackaged) {
			return path.dirname(process.execPath)
		}
	} catch {}
	const repoRoot = getServiceRepoRoot()
	const gitRoot = findNearestGitRoot(repoRoot)
	return gitRoot || repoRoot
}

function getDvsResourceDir() {
	const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
	if (envResourceDir) return path.resolve(envResourceDir)
	return path.resolve(getClientRootDir(), 'DVSResource')
}

function getUserSettingsFilePath() {
	return path.resolve(getDvsResourceDir(), 'UserSettings', 'settings.json')
}

let _settingsCache = null
let _settingsCacheTime = 0
const SETTINGS_CACHE_TTL = 5000

function getClientSettings() {
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
		console.error('[HttpClient] Failed to read client settings:', err.message)
	}

	_settingsCache = {}
	_settingsCacheTime = now
	return _settingsCache
}

function getProxyUrl() {
	const settings = getClientSettings()
	const configuredProxy = String((settings && settings.httpProxy) || '').trim()
	if (configuredProxy) {
		return configuredProxy
	}
	const envProxy =
		process.env.HTTPS_PROXY ||
		process.env.HTTP_PROXY ||
		process.env.https_proxy ||
		process.env.http_proxy ||
		''
	return envProxy
}

function getAgentForUrl(url) {
	try {
		const u = new URL(url)
		const isHttps = u.protocol === 'https:'
		const proxyUrl = getProxyUrl()

		if (proxyUrl) {
			console.log(`[HttpClient] Using proxy: ${proxyUrl} for ${u.hostname}`)
			return new HttpsProxyAgent(proxyUrl, {
				keepAlive: true
			})
		}

		console.log(`[HttpClient] No proxy configured, using direct connection for ${u.hostname}`)
		return isHttps ? defaultHttpsAgent : defaultHttpAgent
	} catch (err) {
		console.warn('[HttpClient] Failed to create agent:', err.message)
		return defaultHttpsAgent
	}
}

async function requestWithNode(url, options, defaultHeaders) {
	const parsedUrl = new URL(url)
	const isHttps = parsedUrl.protocol === 'https:'
	const transport = isHttps ? https : http
	const method = options.method || 'GET'

	const headers = {
		...defaultHeaders,
		...options.headers
	}

	const requestOptions = {
		method,
		hostname: parsedUrl.hostname,
		port: parsedUrl.port || (isHttps ? 443 : 80),
		path: parsedUrl.pathname + parsedUrl.search,
		headers,
		timeout: options.timeout || DEFAULT_TIMEOUT,
		agent: getAgentForUrl(url)
	}

	let bodyData = options.body
	if (bodyData) {
		if (typeof bodyData === 'object' && !requestOptions.headers['Content-Type']) {
			requestOptions.headers['Content-Type'] = 'application/json'
			bodyData = JSON.stringify(bodyData)
		}
		requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyData)
	}

	return new Promise((resolve, reject) => {
		const req = transport.request(requestOptions, (res) => {
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => {
				const buffer = Buffer.concat(chunks)
				const body = buffer.toString('utf-8')

				let parsedBody = body
				const contentType = res.headers['content-type'] || ''
				if (contentType.includes('application/json')) {
					try {
						parsedBody = JSON.parse(body)
					} catch {}
				}

				resolve({
					ok: res.statusCode >= 200 && res.statusCode < 300,
					status: res.statusCode,
					statusText: res.statusMessage,
					headers: res.headers,
					body: parsedBody,
					rawBody: buffer
				})
			})
			res.on('error', reject)
		})

		req.on('error', (err) => {
			reject(new UpstreamError(`HTTP request failed: ${err.message}`))
		})

		req.on('timeout', () => {
			req.destroy(new UpstreamError('Request timeout'))
		})

		if (options.signal) {
			options.signal.addEventListener('abort', () => {
				req.destroy(new ValidationError('Request aborted'))
			})
		}

		if (bodyData) {
			req.write(bodyData)
		}
		req.end()
	})
}

async function requestWithElectronNet(net, url, options, defaultHeaders) {
	const method = options.method || 'GET'
	const timeout = options.timeout || DEFAULT_TIMEOUT

	const headers = {
		...defaultHeaders,
		...options.headers
	}

	const fetchOptions = {
		method,
		headers
	}

	if (options.body) {
		if (typeof options.body === 'object' && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json'
			fetchOptions.body = JSON.stringify(options.body)
		} else {
			fetchOptions.body = options.body
		}
	}

	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeout)
	fetchOptions.signal = controller.signal

	try {
		const response = await net.fetch(url, fetchOptions)
		clearTimeout(timeoutId)

		const buffer = Buffer.from(await response.arrayBuffer())
		const bodyText = buffer.toString('utf-8')

		let parsedBody = bodyText
		const contentType = response.headers.get('content-type') || ''
		if (contentType.includes('application/json')) {
			try {
				parsedBody = JSON.parse(bodyText)
			} catch {}
		}

		const responseHeaders = {}
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value
		})

		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
			body: parsedBody,
			rawBody: buffer
		}
	} catch (err) {
		clearTimeout(timeoutId)
		if (err.name === 'AbortError') {
			throw new UpstreamError('Request timeout')
		}
		throw new UpstreamError(`HTTP request failed: ${err.message}`)
	}
}

export class HttpClient {
	constructor(defaultOptions = {}) {
		this.defaultOptions = {
			timeout: DEFAULT_TIMEOUT,
			headers: {
				'User-Agent': 'DVSBackend/1.0 (Electron)',
				Accept: 'application/json, text/plain, */*',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
			},
			...defaultOptions
		}
	}

	async request(url, options = {}) {
		const u = new URL(url)
		const proxyUrl = getProxyUrl()
		console.log(
			`[HttpClient] REQUEST ${options.method || 'GET'} ${u.hostname}${u.pathname} - proxy: ${proxyUrl || 'direct'}`
		)

		try {
			return await requestWithNode(url, options, this.defaultOptions.headers)
		} catch (nodeErr) {
			console.warn(`[HttpClient] Node.js request failed for ${u.hostname}: ${nodeErr.message}`)

			const net = getElectronNet()
			if (net?.fetch) {
				console.log(`[HttpClient] Falling back to Electron net.fetch for ${u.hostname}`)
				try {
					return await requestWithElectronNet(net, url, options, this.defaultOptions.headers)
				} catch (netErr) {
					console.error(
						`[HttpClient] Electron net.fetch also failed for ${u.hostname}: ${netErr.message}`
					)
					throw netErr
				}
			}

			throw nodeErr
		}
	}

	async get(url, options = {}) {
		return this.request(url, { ...options, method: 'GET' })
	}

	async post(url, body, options = {}) {
		return this.request(url, { ...options, method: 'POST', body })
	}

	postStream(url, options = {}) {
		const parsedUrl = new URL(url)
		const isHttps = parsedUrl.protocol === 'https:'
		const transport = isHttps ? https : http

		const headers = {
			...this.defaultOptions.headers,
			...options.headers,
			Accept: 'text/event-stream'
		}

		const requestOptions = {
			method: 'POST',
			hostname: parsedUrl.hostname,
			port: parsedUrl.port || (isHttps ? 443 : 80),
			path: parsedUrl.pathname + parsedUrl.search,
			headers,
			timeout: options.timeout || 0,
			agent: getAgentForUrl(url)
		}

		let bodyData = options.body
		if (bodyData) {
			if (typeof bodyData === 'object' && !requestOptions.headers['Content-Type']) {
				requestOptions.headers['Content-Type'] = 'application/json'
				bodyData = JSON.stringify(bodyData)
			}
			requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyData)
		}

		const queue = []
		let done = false
		let error = null
		let resolveNext = null
		let rejectNext = null
		let buffer = ''
		let req = null
		let started = false

		function pump(line) {
			if (resolveNext) {
				const res = resolveNext
				resolveNext = null
				rejectNext = null
				res({ value: line, done: false })
			} else {
				queue.push(line)
			}
		}

		function flush() {
			while (queue.length > 0 && resolveNext) {
				const res = resolveNext
				resolveNext = null
				rejectNext = null
				res({ value: queue.shift(), done: false })
			}
		}

		function finish() {
			done = true
			if (resolveNext) {
				const res = resolveNext
				resolveNext = null
				rejectNext = null
				res({ value: undefined, done: true })
			}
		}

		function fail(err) {
			error = err
			if (rejectNext) {
				const rej = rejectNext
				resolveNext = null
				rejectNext = null
				rej(err)
			}
		}

		function start() {
			if (started) return
			started = true

			req = transport.request(requestOptions, (response) => {
				if (response.statusCode < 200 || response.statusCode >= 300) {
					let errBody = ''
					response.on('data', (chunk) => {
						errBody += chunk.toString('utf-8')
					})
					response.on('end', () => {
						let detail = ''
						try {
							const parsed = JSON.parse(errBody)
							detail =
								parsed?.error?.message || parsed?.message || JSON.stringify(parsed?.error || parsed)
						} catch {
							detail = errBody.slice(0, 500)
						}
						console.error('[http-client] SSE error response:', response.statusCode, detail)
						fail(
							new UpstreamError(
								`SSE request failed with status ${response.statusCode}${detail ? ': ' + detail : ''}`
							)
						)
					})
					response.resume()
					return
				}

				response.on('data', (chunk) => {
					buffer += chunk.toString('utf-8')
					const lines = buffer.split(/\r?\n/)
					buffer = lines.pop() || ''
					for (const line of lines) {
						pump(line)
					}
					flush()
				})

				response.on('end', () => {
					if (buffer.trim()) {
						pump(buffer.trim())
					}
					finish()
				})

				response.on('error', (err) => {
					fail(new UpstreamError(`SSE response error: ${err.message}`))
				})
			})

			req.on('error', (err) => {
				fail(new UpstreamError(`SSE request failed: ${err.message}`))
			})

			req.on('timeout', () => {
				req.destroy(new UpstreamError('SSE request timeout'))
			})

			if (options.signal) {
				options.signal.addEventListener('abort', () => {
					done = true
					if (req) req.destroy()
				})
			}

			if (bodyData) req.write(bodyData)
			req.end()
		}

		return {
			[Symbol.asyncIterator]() {
				start()
				return {
					next() {
						return new Promise((resolve, reject) => {
							if (error) {
								reject(error)
								return
							}
							if (done && queue.length === 0) {
								resolve({ value: undefined, done: true })
								return
							}
							if (queue.length > 0) {
								resolve({ value: queue.shift(), done: false })
								return
							}
							resolveNext = resolve
							rejectNext = reject
						})
					},
					return() {
						done = true
						if (req) req.destroy()
						return Promise.resolve({ value: undefined, done: true })
					},
					throw(err) {
						done = true
						if (req) req.destroy()
						return Promise.reject(err)
					}
				}
			}
		}
	}
}

let _defaultClient = null

export function getHttpClient() {
	if (!_defaultClient) {
		_defaultClient = new HttpClient()
	}
	return _defaultClient
}

export function resetHttpClient() {
	_defaultClient = null
	_settingsCache = null
	_settingsCacheTime = 0
}

export default getHttpClient
