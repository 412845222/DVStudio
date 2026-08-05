import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as env from './environment.mjs'
import * as binaryManager from './binary-manager.mjs'
import * as modelManager from './model-manager.mjs'
import * as ffmpegManager from './ffmpeg-manager.mjs'
import { extractAudio, cleanupAudio } from './ffmpeg-audio.mjs'
import { runWhisperRecognition } from './whisper.mjs'
import { ModelSize } from './types.mjs'
import { ensureWhisperDirs, getWhisperBinaryPath } from './paths.mjs'
import { getProjectRootById, getProjectRootSnapshot } from '../../projectAssetProtocol.mjs'

async function resolveVideoPath(inputPath) {
	if (!inputPath || typeof inputPath !== 'string') {
		throw new Error('视频路径为空')
	}

	const trimmed = inputPath.trim()
	if (!trimmed) {
		throw new Error('视频路径为空')
	}

	if (trimmed.startsWith('dweb://')) {
		return resolveDwebUrl(trimmed)
	}

	if (trimmed.startsWith('file://')) {
		return resolveFileUrl(trimmed)
	}

	const normalized = path.normalize(trimmed)
	if (fs.existsSync(normalized)) {
		return normalized
	}

	const forwardSlash = normalized.replace(/\\/g, '/')
	if (fs.existsSync(forwardSlash)) {
		return forwardSlash
	}

	throw new Error(`视频文件不存在: ${normalized}`)
}

function resolveFileUrl(fileUrl) {
	try {
		const filePath = fileURLToPath(fileUrl)
		const normalized = path.normalize(filePath)
		if (fs.existsSync(normalized)) {
			return normalized
		}
		throw new Error(`文件不存在: ${normalized}`)
	} catch (err) {
		if (err.code === 'ERR_INVALID_URL_SCHEME' || err.message?.includes('Invalid URL')) {
			const cleaned = fileUrl
				.replace(/^file:\/\/\/+/, process.platform === 'win32' ? '' : '/')
				.replace(/^file:\/+/, process.platform === 'win32' ? '' : '/')
			const normalized = path.normalize(decodeURIComponent(cleaned))
			if (fs.existsSync(normalized)) {
				return normalized
			}
		}
		throw new Error(`无法解析file:// URL: ${fileUrl}, ${err.message}`)
	}
}

async function resolveDwebUrl(dwebUrl) {
	console.log('[SubtitleRecog] resolveDwebUrl input:', dwebUrl)
	try {
		const u = new URL(dwebUrl)
		if (u.protocol !== 'dweb:') {
			throw new Error(`不是dweb://协议: ${dwebUrl}`)
		}

		const host = String(u.hostname || '').toLowerCase()
		console.log('[SubtitleRecog] dweb host:', host)
		if (host !== 'project-assets') {
			throw new Error(`不支持的dweb host: ${host}`)
		}

		const projectIdRaw = u.searchParams.get('projectId')
		const relPath = u.searchParams.get('path')
		console.log('[SubtitleRecog] dweb projectIdRaw:', projectIdRaw, 'relPath:', relPath)

		if (!projectIdRaw || !relPath) {
			throw new Error(`dweb:// URL缺少projectId或path参数: ${dwebUrl}`)
		}

		const projectId = Number(projectIdRaw)
		if (!Number.isFinite(projectId) || projectId <= 0) {
			throw new Error(`无效的projectId: ${projectIdRaw}`)
		}

		const rootPath = getProjectRootById(projectId)
		console.log('[SubtitleRecog] getProjectRootById result:', rootPath)
		if (!rootPath) {
			const snapshot = getProjectRootSnapshot()
			console.log('[SubtitleRecog] registered project roots:', JSON.stringify(snapshot))
			throw new Error(
				`项目根目录未注册，projectId: ${projectId}。已注册的项目: ${Object.keys(snapshot).join(', ') || '无'}。请确保项目已正确加载。`
			)
		}

		const normalizedRoot = path.resolve(rootPath)
		console.log('[SubtitleRecog] normalized root:', normalizedRoot)

		const rel = String(relPath)
			.replace(/\\/g, '/')
			.split('/')
			.filter((s) => s && s !== '.')
		if (rel.some((s) => s === '..')) {
			throw new Error('路径包含非法的..遍历')
		}
		console.log('[SubtitleRecog] rel segments:', rel)

		let resolved = path.resolve(normalizedRoot, ...rel)
		let normalized = path.normalize(resolved)
		console.log(
			'[SubtitleRecog] first attempt resolved:',
			normalized,
			'exists:',
			fs.existsSync(normalized)
		)

		if (!fs.existsSync(normalized)) {
			resolved = findFileCaseInsensitive(normalizedRoot, rel)
			if (resolved) {
				normalized = path.normalize(resolved)
				console.log('[SubtitleRecog] case-insensitive match found:', normalized)
			}
		}

		if (!fs.existsSync(normalized)) {
			const parentDir = path.dirname(normalized)
			let parentContents = []
			try {
				if (fs.existsSync(parentDir)) {
					parentContents = fs.readdirSync(parentDir).slice(0, 20)
				}
			} catch (e) {
				parentContents = [`无法读取目录: ${e.message}`]
			}
			console.log(
				'[SubtitleRecog] file NOT found. Parent dir:',
				parentDir,
				'contents:',
				parentContents
			)
			throw new Error(
				`dweb://资源文件不存在: ${normalized}。目录内容: ${parentContents.join(', ')}`
			)
		}

		console.log('[SubtitleRecog] resolved successfully:', normalized)
		return normalized
	} catch (err) {
		console.error('[SubtitleRecog] resolveDwebUrl error:', err.message)
		if (
			err.message?.includes('不存在') ||
			err.message?.includes('未注册') ||
			err.message?.includes('非法') ||
			err.message?.includes('不支持') ||
			err.message?.includes('缺少') ||
			err.message?.includes('无效')
		) {
			throw err
		}
		throw new Error(`解析dweb:// URL失败: ${dwebUrl}, ${err.message}`)
	}
}

function findFileCaseInsensitive(rootPath, relSegments) {
	let current = rootPath
	for (let i = 0; i < relSegments.length; i++) {
		const segment = relSegments[i]
		const isLast = i === relSegments.length - 1
		try {
			if (!fs.existsSync(current)) return null
			const entries = fs.readdirSync(current)
			const lowerSegment = segment.toLowerCase()
			const match = entries.find((e) => e.toLowerCase() === lowerSegment)
			if (match) {
				current = path.join(current, match)
			} else {
				const partialMatch = entries.find((e) =>
					e.toLowerCase().startsWith(lowerSegment.split('.')[0].toLowerCase() + '.')
				)
				if (partialMatch && isLast) {
					current = path.join(current, partialMatch)
				} else {
					return null
				}
			}
		} catch {
			return null
		}
	}
	return fs.existsSync(current) ? current : null
}

export async function checkEnv() {
	ensureWhisperDirs()
	return env.verifyEnvironment()
}

export async function getBinaryConfig(useMirror = true) {
	return binaryManager.getBinaryDownloadConfig(useMirror)
}

export async function* downloadBinary(payload) {
	const { useMirror = true, overwrite = false } = payload || {}
	yield* binaryManager.downloadAndInstallBinary({ useMirror, overwrite })
}

export async function getFfmpegConfig(useMirror = true) {
	return ffmpegManager.getFfmpegDownloadConfig(useMirror)
}

export async function* downloadFfmpeg(payload) {
	const { useMirror = true, overwrite = false } = payload || {}
	yield* ffmpegManager.downloadAndInstallFfmpeg({ useMirror, overwrite })
}

export async function getAvailableModels() {
	return modelManager.getAvailableModels()
}

export async function getModelConfig(size, useMirror = true) {
	return modelManager.getModelDownloadConfig(size || ModelSize.BASE, useMirror)
}

export async function* downloadModel(payload) {
	const { size = ModelSize.BASE, useMirror = true, overwrite = false } = payload || {}
	yield* modelManager.downloadModel(size, { useMirror, overwrite })
}

export async function getInstalledModels() {
	return modelManager.getInstalledModels()
}

export async function* recognize(payload) {
	const { videoPath, modelSize = ModelSize.BASE, language = 'auto', projectId } = payload || {}

	console.log('[SubtitleRecog] recognize received videoPath:', videoPath, 'projectId:', projectId)

	let normalizedVideoPath
	try {
		normalizedVideoPath = await resolveVideoPath(videoPath)
		console.log('[SubtitleRecog] resolved to:', normalizedVideoPath)
	} catch (err) {
		console.error('[SubtitleRecog] resolveVideoPath failed:', err.message)
		yield { type: 'error', message: err.message || String(err) }
		return
	}

	let projectMediaDir = null
	let audioDwebUrl = null
	const numericProjectId = Number(projectId)
	if (Number.isFinite(numericProjectId) && numericProjectId > 0) {
		const projectRoot = getProjectRootById(numericProjectId)
		if (projectRoot) {
			projectMediaDir = path.join(projectRoot, 'Content', 'Media')
			const audioRelative = 'Content/Media/subtitle_extracted_audio.wav'
			audioDwebUrl = `dweb://project-assets?projectId=${numericProjectId}&path=${encodeURIComponent(audioRelative)}`
			console.log(
				'[SubtitleRecog] project root found:',
				projectRoot,
				'audio will be saved to:',
				projectMediaDir
			)
		} else {
			console.warn(
				'[SubtitleRecog] projectId provided but project root not registered:',
				numericProjectId
			)
		}
	}

	console.log('[SubtitleRecog] resolving video path done:', normalizedVideoPath)
	console.log('[SubtitleRecog] verifying environment...')

	let envStatus
	try {
		envStatus = await env.verifyEnvironment()
		console.log('[SubtitleRecog] envStatus:', JSON.stringify(envStatus, null, 2))
	} catch (envErr) {
		console.error('[SubtitleRecog] env.verifyEnvironment() threw:', envErr)
		yield { type: 'error', message: `环境检查失败: ${envErr.message || String(envErr)}` }
		return
	}

	if (!envStatus.ok) {
		const missing = []
		if (!envStatus.ffmpeg?.ok) missing.push('ffmpeg')
		if (!envStatus.binary?.ok) missing.push('whisper binary')
		if (!envStatus.defaultModel) missing.push('whisper model')
		console.log('[SubtitleRecog] environment not ready, missing:', missing)
		yield { type: 'error', message: `环境未就绪，缺少: ${missing.join(', ')}。请先完成环境配置。` }
		return
	}

	console.log('[SubtitleRecog] environment OK, starting audio extraction...')
	console.log('[SubtitleRecog] ffmpeg path:', env.getFfmpegPath?.())
	console.log('[SubtitleRecog] whisper binary:', getWhisperBinaryPath())

	let audioPath = null

	try {
		yield { type: 'phase', phase: 'extracting-audio', message: '正在从视频提取音频...', percent: 0 }

		const audioQueue = []
		let audioError = null
		let audioDone = false
		let audioResult = null

		const extractOptions = {
			onProgress: (progress) => {
				console.log('[SubtitleRecog] audio progress:', progress.percent, '%')
				audioQueue.push({
					type: 'progress',
					...progress,
					percent: Math.floor(progress.percent * 0.3)
				})
			}
		}
		if (projectMediaDir) {
			extractOptions.outputPath = path.join(projectMediaDir, 'subtitle_extracted_audio.wav')
		}

		console.log(
			'[SubtitleRecog] calling extractAudio with:',
			normalizedVideoPath,
			'outputPath:',
			extractOptions.outputPath || '(temp)'
		)
		const audioPromise = extractAudio(normalizedVideoPath, extractOptions)
		console.log('[SubtitleRecog] extractAudio promise created')

		audioPromise
			.then((result) => {
				console.log('[SubtitleRecog] extractAudio resolved:', result?.audioPath)
				audioResult = result
				audioDone = true
			})
			.catch((err) => {
				console.error('[SubtitleRecog] extractAudio rejected:', err?.message || err)
				audioError = err
				audioDone = true
			})

		console.log('[SubtitleRecog] entering audio wait loop...')
		while (!audioDone || audioQueue.length > 0) {
			if (audioError) {
				console.error('[SubtitleRecog] audio error in loop:', audioError.message)
				yield {
					type: 'error',
					message: `音频提取失败: ${audioError.message || String(audioError)}`
				}
				return
			}
			while (audioQueue.length > 0) {
				const qItem = audioQueue.shift()
				yield qItem
			}
			if (!audioDone) {
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}
		console.log(
			'[SubtitleRecog] audio wait loop done, audioResult:',
			!!audioResult,
			'audioPath:',
			audioResult?.audioPath
		)

		if (!audioResult || !audioResult.audioPath) {
			console.log('[SubtitleRecog] audioResult invalid, yielding error')
			yield { type: 'error', message: '音频提取失败：未能生成音频文件' }
			return
		}

		audioPath = audioResult.audioPath
		console.log('[SubtitleRecog] yielding audio-extraction-complete phase')
		yield { type: 'phase', phase: 'extracting-audio', message: '音频提取完成', percent: 30 }

		const effectiveModel = envStatus.models.find((m) => m.ok && m.size === modelSize)
			? modelSize
			: envStatus.defaultModel
		console.log(
			'[SubtitleRecog] effectiveModel:',
			effectiveModel,
			'requested modelSize:',
			modelSize
		)

		console.log('[SubtitleRecog] starting runWhisperRecognition for audioPath:', audioPath)
		let whisperChunkCount = 0
		for await (const chunk of runWhisperRecognition({
			audioPath,
			modelSize: effectiveModel,
			language
		})) {
			whisperChunkCount++
			console.log(
				'[SubtitleRecog] whisper chunk #' + whisperChunkCount + ':',
				chunk.type,
				chunk.percent || '',
				chunk.message || ''
			)
			if (chunk.type === 'progress' && typeof chunk.percent === 'number') {
				yield {
					...chunk,
					percent: 30 + Math.floor(chunk.percent * 0.65)
				}
			} else if (chunk.type === 'done') {
				console.log('[SubtitleRecog] whisper DONE, raw cues (ms):', chunk.cues?.length)
				const cuesInSeconds = (chunk.cues || [])
					.map((c) => ({
						startTime: (c.startTime || 0) / 1000,
						endTime: (c.endTime || 0) / 1000,
						text: String(c.text || '').trim()
					}))
					.filter((c) => c.endTime > c.startTime && c.text)
				console.log('[SubtitleRecog] cues converted to seconds:', cuesInSeconds.length)
				console.log(
					'[SubtitleRecog] audioPath preserved:',
					audioPath,
					'duration:',
					audioResult?.duration,
					'audioDwebUrl:',
					audioDwebUrl
				)
				yield { type: 'phase', phase: 'done', message: '识别完成', percent: 100 }
				yield {
					type: 'done',
					cues: cuesInSeconds,
					modelSize: chunk.modelSize,
					cueCount: cuesInSeconds.length,
					audioPath: audioDwebUrl ? null : audioPath,
					audioUrl: audioDwebUrl,
					duration: audioResult?.duration || 0
				}
			} else {
				yield chunk
			}
		}
		console.log(
			'[SubtitleRecog] whisper for-await loop ended naturally, chunks:',
			whisperChunkCount
		)
	} catch (err) {
		console.error('[SubtitleRecog] UNEXPECTED ERROR in recognize:', err)
		yield { type: 'error', message: err.message || String(err) }
		if (audioPath && !audioDwebUrl) {
			try {
				cleanupAudio(audioPath)
			} catch {}
		}
	}
}

export async function removeBinary() {
	return binaryManager.removeBinary()
}

export async function removeModel(size) {
	return modelManager.removeModel(size)
}

export async function readAudioFile(filePath) {
	if (!filePath || typeof filePath !== 'string') {
		throw new Error('音频文件路径为空')
	}
	const normalized = path.normalize(filePath)
	if (!fs.existsSync(normalized)) {
		throw new Error(`音频文件不存在: ${normalized}`)
	}
	const stat = fs.statSync(normalized)
	if (!stat.isFile()) {
		throw new Error(`路径不是文件: ${normalized}`)
	}
	const fileName = path.basename(normalized)
	const url = `dweb://subtitle-temp?file=${encodeURIComponent(fileName)}`
	console.log('[SubtitleRecog] audio temp URL generated:', url, 'size:', stat.size, 'bytes')
	return {
		url,
		fileName,
		size: stat.size
	}
}

export function cleanupAudioFile(filePath) {
	if (!filePath || typeof filePath !== 'string') return
	try {
		const normalized = path.normalize(filePath)
		if (fs.existsSync(normalized)) {
			fs.unlinkSync(normalized)
			console.log('[SubtitleRecog] cleaned up audio file:', normalized)
		}
	} catch (err) {
		console.warn('[SubtitleRecog] failed to cleanup audio file:', err.message)
	}
}
