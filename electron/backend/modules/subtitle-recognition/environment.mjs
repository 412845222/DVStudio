import fs from 'node:fs'
import { spawn } from 'node:child_process'
import {
	getWhisperBinaryPath,
	getWhisperModelPath,
	getWhisperModelDir,
	getWhisperBinaryDir,
	ensureWhisperDirs,
	getFfmpegBinaryPath,
	getFfprobeBinaryPath,
	getFfmpegDir
} from './paths.mjs'
import { ModelSize } from './types.mjs'

function pickFirstLine(text) {
	if (!text) return ''
	const line = text.split(/\r?\n/)[0] || ''
	return line.trim()
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve) => {
		const timeout = options.timeout || 10000
		let stdout = ''
		let stderr = ''
		let exited = false

		try {
			const child = spawn(command, args, {
				timeout,
				windowsHide: true,
				...options.spawnOptions
			})

			child.stdout.on('data', (data) => {
				stdout += data.toString('utf-8')
			})
			child.stderr.on('data', (data) => {
				stderr += data.toString('utf-8')
			})

			child.on('error', (err) => {
				if (exited) return
				exited = true
				resolve({ ok: false, error: err.message, stdout, stderr })
			})

			child.on('close', (code) => {
				if (exited) return
				exited = true
				resolve({ ok: code === 0, code, stdout, stderr })
			})
		} catch (err) {
			resolve({ ok: false, error: err.message, stdout, stderr })
		}
	})
}

export async function checkFfmpeg(customPath) {
	const candidates = []

	if (customPath) {
		candidates.push(customPath)
	} else {
		candidates.push('ffmpeg')
		const privateFfmpeg = getFfmpegBinaryPath()
		if (fs.existsSync(privateFfmpeg)) {
			candidates.unshift(privateFfmpeg)
		}
	}

	for (const cmd of candidates) {
		const result = await runCommand(cmd, ['-version'], { timeout: 15000 })
		if (result.ok) {
			const isPrivate = cmd !== 'ffmpeg'
			return {
				ok: true,
				detail: pickFirstLine(result.stdout || result.stderr) + (isPrivate ? ' (bundled)' : ''),
				path: cmd === 'ffmpeg' ? 'ffmpeg' : cmd
			}
		}
	}

	return {
		ok: false,
		detail: 'FFmpeg not found. Please install it or use auto-download.',
		path: null
	}
}

export function getFfmpegPath() {
	const privatePath = getFfmpegBinaryPath()
	if (fs.existsSync(privatePath)) {
		return privatePath
	}
	return 'ffmpeg'
}

export function getFfprobePath() {
	const privatePath = getFfprobeBinaryPath()
	if (fs.existsSync(privatePath)) {
		return privatePath
	}
	return 'ffprobe'
}

export function checkWhisperBinary() {
	ensureWhisperDirs()
	const binaryPath = getWhisperBinaryPath()

	if (!fs.existsSync(binaryPath)) {
		return {
			ok: false,
			installed: false,
			path: binaryPath,
			detail: 'Whisper binary not found'
		}
	}

	try {
		fs.accessSync(binaryPath, fs.constants.X_OK)
	} catch {
		if (process.platform !== 'win32') {
			return {
				ok: false,
				installed: true,
				path: binaryPath,
				detail: 'Whisper binary is not executable'
			}
		}
	}

	const stat = fs.statSync(binaryPath)
	const minBinarySize = 100 * 1024
	if (stat.size < minBinarySize) {
		return {
			ok: false,
			installed: true,
			path: binaryPath,
			size: stat.size,
			detail: `Whisper binary seems too small (${(stat.size / 1024).toFixed(0)} KB), may be corrupted or deprecated stub`
		}
	}

	return {
		ok: true,
		installed: true,
		path: binaryPath,
		size: stat.size,
		detail: `Whisper binary found (${(stat.size / 1024 / 1024).toFixed(1)} MB)`
	}
}

export function checkModel(size = ModelSize.BASE) {
	const modelPath = getWhisperModelPath(size)

	if (!fs.existsSync(modelPath)) {
		return {
			ok: false,
			installed: false,
			size,
			path: modelPath,
			detail: `Model ${size} not found`
		}
	}

	const stat = fs.statSync(modelPath)
	const minSizes = {
		[ModelSize.TINY]: 70 * 1024 * 1024,
		[ModelSize.BASE]: 140 * 1024 * 1024,
		[ModelSize.SMALL]: 460 * 1024 * 1024
	}
	const minSize = minSizes[size] || 0

	return {
		ok: stat.size >= minSize,
		installed: true,
		size,
		path: modelPath,
		fileSize: stat.size,
		detail:
			stat.size >= minSize
				? `Model ${size} ready (${(stat.size / 1024 / 1024).toFixed(1)} MB)`
				: `Model ${size} file seems too small, may be corrupted`
	}
}

export function listInstalledModels() {
	const models = []
	for (const size of Object.values(ModelSize)) {
		const status = checkModel(size)
		if (status.installed) {
			models.push({
				size,
				path: status.path,
				fileSize: status.fileSize || 0,
				ok: status.ok
			})
		}
	}
	return models
}

export async function verifyEnvironment() {
	const ffmpeg = await checkFfmpeg()
	const binary = checkWhisperBinary()
	const models = listInstalledModels()
	const defaultModel =
		models.find((m) => m.ok && m.size === ModelSize.BASE) || models.find((m) => m.ok) || null

	return {
		ok: ffmpeg.ok && binary.ok && defaultModel !== null,
		ffmpeg,
		binary,
		models,
		defaultModel: defaultModel?.size || null,
		paths: {
			binaryDir: getWhisperBinaryPath().replace(/[\\/][^\\/]+$/, ''),
			modelDir: getWhisperModelDir()
		}
	}
}
