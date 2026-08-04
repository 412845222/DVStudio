import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { URL } from 'node:url'
import { getAgentForUrl } from './net-utils.mjs'

const CONNECT_TIMEOUT = 20000
const READ_TIMEOUT = 90000
const MAX_REDIRECTS = 10

function httpGet(url, options = {}) {
	return new Promise((resolve, reject) => {
		try {
			const parsedUrl = new URL(url)
			const transport = parsedUrl.protocol === 'https:' ? https : http
			const agent = getAgentForUrl(url)

			const req = transport.request(
				{
					method: 'GET',
					hostname: parsedUrl.hostname,
					port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
					path: parsedUrl.pathname + parsedUrl.search,
					agent,
					timeout: CONNECT_TIMEOUT,
					headers: {
						'User-Agent': 'DVStudio-SubtitleRecog/1.0',
						Accept: '*/*',
						...(options.headers || {})
					}
				},
				(res) => {
					resolve(res)
				}
			)

			req.on('error', reject)
			req.on('timeout', () => {
				req.destroy(new Error('连接超时'))
				reject(new Error('连接超时'))
			})
			req.end()
		} catch (err) {
			reject(err)
		}
	})
}

async function downloadWithRedirects(url, destPath, options = {}) {
	const { onProgress, onStatus, overwrite = false } = options
	const destDir = path.dirname(destPath)
	fs.mkdirSync(destDir, { recursive: true })

	const tempPath = destPath + '.downloading'
	if (overwrite && fs.existsSync(tempPath)) {
		try {
			fs.unlinkSync(tempPath)
		} catch {}
	}
	if (overwrite && fs.existsSync(destPath)) {
		try {
			fs.unlinkSync(destPath)
		} catch {}
	}

	let currentUrl = url
	let redirectCount = 0
	let downloadedBytes = 0
	let totalBytes = 0

	while (redirectCount < MAX_REDIRECTS) {
		if (onStatus)
			onStatus({ type: 'connecting', message: `正在连接 ${new URL(currentUrl).hostname}...` })

		let res
		res = await httpGet(currentUrl, {})

		if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			res.resume()
			currentUrl = new URL(res.headers.location, currentUrl).toString()
			redirectCount++
			res.destroy()
			continue
		}

		if (res.statusCode < 200 || res.statusCode >= 300) {
			res.resume()
			res.destroy()
			throw new Error(`HTTP ${res.statusCode}: ${res.statusMessage || '请求失败'}`)
		}

		const contentLength = res.headers['content-length']
		totalBytes = contentLength ? parseInt(contentLength, 10) : 0

		if (onStatus) onStatus({ type: 'downloading', message: '连接成功，开始下载...' })

		const writeStream = fs.createWriteStream(tempPath, { flags: 'w' })
		let readTimeoutTimer = null

		const resetReadTimeout = () => {
			if (readTimeoutTimer) clearTimeout(readTimeoutTimer)
			readTimeoutTimer = setTimeout(() => {
				res.destroy(new Error('数据接收超时，请检查网络连接或代理设置'))
			}, READ_TIMEOUT)
		}

		resetReadTimeout()

		await new Promise((resolveDownload, rejectDownload) => {
			res.pipe(writeStream)

			res.on('data', (chunk) => {
				resetReadTimeout()
				downloadedBytes += chunk.length
				if (onProgress) {
					const percent =
						totalBytes > 0
							? Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100))
							: Math.min(99, Math.floor(downloadedBytes / (1024 * 1024)))
					onProgress({
						downloadedBytes,
						totalBytes,
						percent: totalBytes > 0 ? percent : Math.min(99, percent),
						indeterminate: totalBytes === 0
					})
				}
			})

			res.on('error', (err) => {
				clearTimeout(readTimeoutTimer)
				writeStream.destroy()
				rejectDownload(err)
			})

			writeStream.on('error', (err) => {
				clearTimeout(readTimeoutTimer)
				res.destroy()
				rejectDownload(err)
			})

			writeStream.on('finish', () => {
				clearTimeout(readTimeoutTimer)
				resolveDownload()
			})
		})

		if (fs.existsSync(destPath)) {
			try {
				fs.unlinkSync(destPath)
			} catch {}
		}
		fs.renameSync(tempPath, destPath)

		return { path: destPath, size: downloadedBytes }
	}

	throw new Error('重定向次数过多')
}

async function downloadToFile(url, destPath, options = {}) {
	const { overwrite = false, onProgress, onStatus } = options

	if (!overwrite && fs.existsSync(destPath)) {
		const stat = fs.statSync(destPath)
		return { path: destPath, size: stat.size }
	}

	return downloadWithRedirects(url, destPath, options)
}

export async function* downloadFileStream(url, destPath, options = {}) {
	const { overwrite = false } = options

	if (!overwrite && fs.existsSync(destPath)) {
		const stat = fs.statSync(destPath)
		yield { type: 'progress', percent: 100, downloadedBytes: stat.size, totalBytes: stat.size }
		yield { type: 'done', path: destPath, size: stat.size }
		return
	}

	yield { type: 'status', message: '正在初始化下载...' }
	yield {
		type: 'progress',
		percent: 0,
		downloadedBytes: 0,
		totalBytes: 0,
		message: '连接中...',
		indeterminate: true
	}

	let errorResult = null
	let doneResult = null
	const queue = []
	let isDone = false

	const onProgress = (progress) => {
		queue.push({ type: 'progress', ...progress })
	}
	const onStatus = (status) => {
		queue.push({ type: 'status', message: status.message, statusType: status.type })
	}

	downloadToFile(url, destPath, { ...options, onProgress, onStatus })
		.then((result) => {
			doneResult = result
			isDone = true
		})
		.catch((err) => {
			errorResult = err
			isDone = true
		})

	const keepAlive = setInterval(() => {
		if (!isDone && queue.length === 0) {
			queue.push({ type: 'status', message: '下载进行中...' })
		}
	}, 2000)

	try {
		while (!isDone || queue.length > 0) {
			if (errorResult) {
				const tempPath = destPath + '.downloading'
				if (fs.existsSync(tempPath)) {
					try {
						fs.unlinkSync(tempPath)
					} catch {}
				}
				yield { type: 'error', message: errorResult.message || String(errorResult) }
				throw errorResult
			}

			while (queue.length > 0) {
				const item = queue.shift()
				yield item
			}

			if (!isDone) {
				await new Promise((resolve) => setTimeout(resolve, 80))
			}
		}
	} finally {
		clearInterval(keepAlive)
	}

	if (doneResult) {
		yield {
			type: 'progress',
			percent: 100,
			downloadedBytes: doneResult.size,
			totalBytes: doneResult.size,
			message: '下载完成'
		}
		yield { type: 'done', path: doneResult.path, size: doneResult.size }
	}
}

export async function* downloadWithFallback(urls, destPath, options = {}) {
	let lastError = null

	for (let i = 0; i < urls.length; i++) {
		const url = urls[i]
		const isLast = i === urls.length - 1

		try {
			if (i > 0) {
				yield { type: 'status', message: '上一个源失败，尝试下一个下载源...' }
			}
			yield { type: 'status', message: `正在尝试: ${new URL(url).hostname}` }

			const tempPath = destPath + '.downloading'
			if (fs.existsSync(tempPath)) {
				try {
					fs.unlinkSync(tempPath)
				} catch {}
			}

			const generator = downloadFileStream(url, destPath, options)
			for await (const chunk of generator) {
				yield chunk
			}
			return
		} catch (err) {
			lastError = err
			console.error(`[downloader] Failed to download from ${url}:`, err.message)
			const tempPath = destPath + '.downloading'
			if (fs.existsSync(tempPath)) {
				try {
					fs.unlinkSync(tempPath)
				} catch {}
			}
			if (isLast) {
				throw err
			}
		}
	}

	if (lastError) throw lastError
}

export function calculateSHA256(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256')
		const stream = fs.createReadStream(filePath)
		stream.on('data', (chunk) => hash.update(chunk))
		stream.on('end', () => resolve(hash.digest('hex')))
		stream.on('error', reject)
	})
}
