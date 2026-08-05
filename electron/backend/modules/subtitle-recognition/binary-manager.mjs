import fs from 'node:fs'
import path from 'node:path'
import {
	getWhisperBinaryDir,
	getWhisperBinaryPath,
	ensureWhisperDirs,
	getTempDir
} from './paths.mjs'
import { downloadWithFallback } from './downloader.mjs'
import { checkWhisperBinary } from './environment.mjs'

const WHISPER_CPP_VERSION = '1.9.1'
const GITHUB_REPO = 'ggml-org/whisper.cpp'

function getDownloadUrls(config, useMirror) {
	const urls = []
	if (useMirror) {
		if (config.mirrorUrls) {
			urls.push(...config.mirrorUrls)
		}
		if (config.mirrorUrl) {
			urls.push(config.mirrorUrl)
		}
	}
	urls.push(config.url)
	return urls
}

const BINARY_CONFIG = {
	win32: {
		url: `https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`,
		mirrorUrl: `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`,
		mirrorUrls: [
			`https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`,
			`https://ghps.cc/https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`
		],
		archiveName: 'whisper-bin-x64.zip',
		binaryNames: ['whisper-cli.exe', 'main.exe', 'whisper.exe'],
		finalBinaryName: 'whisper-cli.exe'
	},
	darwin: {
		url: `https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-macos-arm64.tar.gz`,
		mirrorUrl: `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-macos-arm64.tar.gz`,
		mirrorUrls: [
			`https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-macos-arm64.tar.gz`
		],
		archiveName: 'whisper-bin-macos-arm64.tar.gz',
		binaryNames: ['whisper-cli', 'main', 'whisper'],
		finalBinaryName: 'whisper-cli'
	},
	linux: {
		url: `https://github.com/${GITHUB_REPO}/releases/download/v${WHISPER_CPP_VERSION}/whisper-bin-ubuntu-x64.tar.gz`,
		mirrorUrl: '',
		mirrorUrls: [],
		archiveName: 'whisper-bin-ubuntu-x64.tar.gz',
		binaryNames: ['whisper-cli', 'main', 'whisper'],
		finalBinaryName: 'whisper-cli'
	}
}

function getPlatformConfig() {
	const platform = process.platform
	return BINARY_CONFIG[platform] || null
}

async function extractZip(zipPath, targetDir, binaryNames, finalBinaryName) {
	const JSZip = (await import('jszip')).default
	const data = fs.readFileSync(zipPath)
	const zip = await JSZip.loadAsync(data)

	console.log(
		'[SubtitleRecog] extracting zip, files in archive:',
		Object.keys(zip.files)
			.filter((f) => !f.endsWith('/'))
			.join(', ')
	)

	let bestBinaryFile = null
	let bestBinarySize = 0
	const binaryNamesLower = binaryNames.map((n) => n.toLowerCase())

	for (const [filename, file] of Object.entries(zip.files)) {
		if (file.dir) continue
		const baseName = path.basename(filename).toLowerCase()

		if (binaryNamesLower.includes(baseName)) {
			const content = await file.async('nodebuffer')
			if (content.length > bestBinarySize) {
				bestBinarySize = content.length
				bestBinaryFile = { filename, file, content }
			}
		}
	}

	if (!bestBinaryFile) {
		for (const [filename, file] of Object.entries(zip.files)) {
			if (file.dir) continue
			const baseName = path.basename(filename).toLowerCase()
			if (
				(baseName.includes('whisper') || baseName === 'main.exe' || baseName === 'main') &&
				!baseName.includes('bench') &&
				!baseName.includes('test') &&
				!baseName.includes('blas') &&
				!baseName.includes('cublas') &&
				!baseName.includes('deprecated') &&
				(process.platform === 'win32' ? baseName.endsWith('.exe') : !baseName.includes('.'))
			) {
				const content = await file.async('nodebuffer')
				if (content.length > bestBinarySize) {
					bestBinarySize = content.length
					bestBinaryFile = { filename, file, content }
				}
			}
		}
	}

	if (!bestBinaryFile) {
		const available = Object.keys(zip.files)
			.filter((f) => !f.endsWith('/'))
			.slice(0, 30)
			.join(', ')
		throw new Error(`Could not find whisper binary in archive. Files: ${available}`)
	}

	console.log('[SubtitleRecog] selected binary:', bestBinaryFile.filename, 'size:', bestBinarySize)

	for (const [filename, file] of Object.entries(zip.files)) {
		if (file.dir) continue

		const baseName = path.basename(filename)
		const lowerBase = baseName.toLowerCase()
		const isWinExe = lowerBase.endsWith('.exe')
		const isDll = lowerBase.endsWith('.dll')
		const isLib = lowerBase.endsWith('.so') || lowerBase.endsWith('.dylib')
		const isBinary = binaryNamesLower.includes(lowerBase)

		if (
			isWinExe ||
			isDll ||
			isLib ||
			isBinary ||
			lowerBase === 'readme.md' ||
			lowerBase === 'license'
		) {
			try {
				const content = await file.async('nodebuffer')
				const targetPath = path.join(targetDir, baseName)
				fs.writeFileSync(targetPath, content)
				if (isWinExe || isLib || isBinary) {
					if (process.platform !== 'win32') {
						try {
							fs.chmodSync(targetPath, 0o755)
						} catch {}
					}
				}
				console.log('[SubtitleRecog] extracted:', baseName, content.length, 'bytes')
			} catch (e) {
				console.warn('[SubtitleRecog] failed to extract', filename, e.message)
			}
		}
	}

	const mainTargetPath = path.join(targetDir, finalBinaryName)
	if (path.basename(bestBinaryFile.filename).toLowerCase() !== finalBinaryName.toLowerCase()) {
		const extractedBinaryPath = path.join(targetDir, path.basename(bestBinaryFile.filename))
		if (fs.existsSync(extractedBinaryPath) && !fs.existsSync(mainTargetPath)) {
			try {
				fs.copyFileSync(extractedBinaryPath, mainTargetPath)
				if (process.platform !== 'win32') {
					try {
						fs.chmodSync(mainTargetPath, 0o755)
					} catch {}
				}
				console.log('[SubtitleRecog] copied main binary to:', mainTargetPath)
			} catch (e) {
				console.warn('[SubtitleRecog] failed to copy main binary:', e.message)
			}
		}
	}

	const deprecatedStub = path.join(
		targetDir,
		process.platform === 'win32' ? 'whisper.exe' : 'whisper'
	)
	if (deprecatedStub !== mainTargetPath && fs.existsSync(deprecatedStub)) {
		try {
			fs.unlinkSync(deprecatedStub)
		} catch {}
		console.log('[SubtitleRecog] removed deprecated stub:', deprecatedStub)
	}

	return mainTargetPath
}

export function getBinaryDownloadConfig(useMirror = true) {
	const config = getPlatformConfig()
	if (!config) {
		return {
			supported: false,
			platform: process.platform,
			message: `Auto-download is not supported on ${process.platform}. Please build whisper.cpp from source or download manually.`
		}
	}

	const urls = getDownloadUrls(config, useMirror)
	return {
		supported: true,
		platform: process.platform,
		version: WHISPER_CPP_VERSION,
		urls,
		url: urls[0],
		fileName: config.archiveName,
		estimatedSize: process.platform === 'win32' ? 8 * 1024 * 1024 : 15 * 1024 * 1024
	}
}

export async function* downloadAndInstallBinary(options = {}) {
	const { useMirror = true, overwrite = false } = options

	const config = getPlatformConfig()
	if (!config) {
		yield { type: 'error', message: `Auto-download is not supported on ${process.platform}` }
		return
	}

	ensureWhisperDirs()

	const currentStatus = checkWhisperBinary()
	if (currentStatus.ok && !overwrite) {
		yield { type: 'progress', percent: 100, message: 'Whisper binary already installed' }
		yield { type: 'done', path: currentStatus.path, size: currentStatus.size }
		return
	}

	const tempDir = getTempDir()
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true })
	}

	const urls = getDownloadUrls(config, useMirror)
	const archivePath = path.join(tempDir, config.archiveName)

	yield { type: 'phase', phase: 'downloading', message: '正在下载 Whisper 引擎...' }

	let downloadSuccess = false
	try {
		for await (const chunk of downloadWithFallback(urls, archivePath, { overwrite: true })) {
			if (chunk.type === 'progress') {
				yield {
					type: 'progress',
					percent: Math.floor(chunk.percent * 0.7),
					downloadedBytes: chunk.downloadedBytes,
					totalBytes: chunk.totalBytes,
					indeterminate: chunk.indeterminate,
					message: chunk.message || '下载中...'
				}
			} else if (chunk.type === 'status') {
				yield { type: 'status', message: chunk.message }
			} else if (chunk.type === 'error') {
				yield { type: 'error', message: chunk.message }
				return
			} else if (chunk.type === 'done') {
				downloadSuccess = true
				yield { type: 'progress', percent: 70, message: '下载完成，正在解压...' }
			}
		}
	} catch (err) {
		yield { type: 'error', message: `下载失败: ${err.message}` }
		return
	}

	if (!downloadSuccess) {
		yield { type: 'error', message: '下载未完成，请重试' }
		return
	}

	if (!fs.existsSync(archivePath)) {
		yield { type: 'error', message: `下载失败：文件未保存到 ${archivePath}` }
		return
	}

	const archiveStat = fs.statSync(archivePath)
	if (archiveStat.size < 100 * 1024) {
		try {
			fs.unlinkSync(archivePath)
		} catch {}
		yield { type: 'error', message: '下载失败：文件大小异常，可能是网络错误或源不可用' }
		return
	}

	yield { type: 'phase', phase: 'extracting', message: '正在解压...' }

	try {
		if (config.archiveName.endsWith('.zip')) {
			await extractZip(
				archivePath,
				getWhisperBinaryDir(),
				config.binaryNames,
				config.finalBinaryName
			)
		} else {
			throw new Error('tar.gz extraction not yet implemented, please download manually')
		}

		try {
			fs.unlinkSync(archivePath)
		} catch {}
	} catch (err) {
		yield { type: 'error', message: `解压失败: ${err.message}` }
		return
	}

	yield { type: 'progress', percent: 90, message: '正在验证...' }

	const finalStatus = checkWhisperBinary()
	if (!finalStatus.ok) {
		yield { type: 'error', message: '安装后验证失败' }
		return
	}

	yield { type: 'progress', percent: 100, message: '安装完成' }
	yield {
		type: 'done',
		path: finalStatus.path,
		size: finalStatus.size,
		version: WHISPER_CPP_VERSION
	}
}

export function removeBinary() {
	const binaryPath = getWhisperBinaryPath()
	if (fs.existsSync(binaryPath)) {
		try {
			fs.unlinkSync(binaryPath)
			return { ok: true }
		} catch (err) {
			return { ok: false, error: err.message }
		}
	}
	return { ok: true, alreadyRemoved: true }
}
