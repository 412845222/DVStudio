import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
	getWhisperBinaryPath,
	getWhisperBinaryDir,
	getWhisperModelPath,
	getTempDir,
	getFfmpegDir
} from './paths.mjs'
import { parseSrt } from './srt-parser.mjs'

function parseWhisperProgress(text) {
	const patterns = [
		/progress\s*=\s*(\d+)%/i,
		/\[(\d+)%\]/,
		/(\d+)%\s*complete/i,
		/whisper_print_progress[^:]*:\s*(\d+)%/i
	]
	for (const pattern of patterns) {
		const match = text.match(pattern)
		if (match) {
			return { type: 'progress', percent: parseInt(match[1], 10) }
		}
	}
	return null
}

function parseWhisperPhase(text) {
	if (
		text.includes('load_model') ||
		text.includes('loading model') ||
		text.includes('load_backend')
	)
		return 'Loading model'
	if (text.includes('convert') || text.includes('converting') || text.includes('convert_pcm'))
		return 'Converting audio'
	if (text.includes('mel') || text.includes('spectrogram') || text.includes('log_mel'))
		return 'Processing audio'
	if (text.includes('encode') || text.includes('encoding')) return 'Encoding'
	if (text.includes('decode') || text.includes('decoding') || text.includes('search'))
		return 'Decoding'
	if (
		text.includes('save') ||
		text.includes('writing') ||
		text.includes('output') ||
		text.includes('srt')
	)
		return 'Saving output'
	if (text.includes('language') || text.includes('detect')) return 'Detecting language'
	return null
}

function getSubtitleEnv() {
	const extraPaths = []
	const ffmpegDir = getFfmpegDir()
	if (fs.existsSync(ffmpegDir)) {
		extraPaths.push(ffmpegDir)
	}
	const binaryDir = getWhisperBinaryDir()
	if (fs.existsSync(binaryDir)) {
		extraPaths.push(binaryDir)
	}
	const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
	const currentPath = process.env[pathKey] || process.env.PATH || ''
	const pathSep = process.platform === 'win32' ? ';' : ':'
	const newPath = extraPaths.length > 0 ? [...extraPaths, currentPath].join(pathSep) : currentPath
	return {
		...process.env,
		LC_ALL: 'C.UTF-8',
		PATH: newPath,
		Path: newPath
	}
}

function runWhisperProcess(options) {
	const { audioPath, modelSize = 'base', language = 'auto', signal } = options

	return new Promise((resolve, reject) => {
		const binaryPath = getWhisperBinaryPath()
		const binaryDir = getWhisperBinaryDir()
		const modelPath = getWhisperModelPath(modelSize)
		const tempDir = getTempDir()

		console.log('[SubtitleRecog][whisper] binaryPath:', binaryPath)
		console.log('[SubtitleRecog][whisper] binaryDir:', binaryDir)
		console.log(
			'[SubtitleRecog][whisper] modelPath:',
			modelPath,
			'exists:',
			fs.existsSync(modelPath)
		)
		console.log(
			'[SubtitleRecog][whisper] audioPath:',
			audioPath,
			'exists:',
			fs.existsSync(audioPath)
		)
		console.log(
			'[SubtitleRecog][whisper] audio stat:',
			fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 'N/A',
			'bytes'
		)

		if (!fs.existsSync(binaryPath)) {
			reject(new Error('未找到 Whisper 引擎，请先安装'))
			return
		}

		if (!fs.existsSync(modelPath)) {
			reject(new Error(`未找到 Whisper 模型 ${modelSize}，请先下载`))
			return
		}

		if (!fs.existsSync(audioPath)) {
			reject(new Error(`音频文件不存在: ${audioPath}`))
			return
		}

		const audioBasename = path
			.basename(audioPath, path.extname(audioPath))
			.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
		const outputBase = path.join(tempDir, `whisper_output_${Date.now()}_${audioBasename}`)
		console.log('[SubtitleRecog][whisper] outputBase:', outputBase)

		const threadCount = Math.max(1, Math.min(os.cpus().length - 1, 8))

		const args = [
			'-m',
			modelPath,
			'-f',
			audioPath,
			'-of',
			outputBase,
			'-osrt',
			'-pp',
			'-t',
			String(threadCount),
			'-bs',
			'5'
		]

		const langArg = language && language !== 'auto' ? language : 'auto'
		args.push('-l', langArg)
		console.log('[SubtitleRecog][whisper] language arg:', langArg)

		console.log('[SubtitleRecog][whisper] args:', args.join(' '))

		let stderr = ''
		let stdout = ''
		let lastProgress = 0
		let aborted = false
		let currentPhase = 'starting'

		const env = getSubtitleEnv()
		const cwd = fs.existsSync(binaryDir) ? binaryDir : tempDir
		console.log('[SubtitleRecog][whisper] cwd:', cwd)

		const child = spawn(binaryPath, args, {
			windowsHide: true,
			cwd,
			env
		})

		const handleOutput = (text, isStderr) => {
			if (isStderr) {
				stderr += text
			} else {
				stdout += text
			}

			const lines = text.split(/\r?\n/)
			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed) continue

				if (
					trimmed.includes('error') ||
					trimmed.includes('ERROR') ||
					trimmed.includes('failed') ||
					trimmed.includes('FAILED')
				) {
					console.log(
						'[SubtitleRecog][whisper][output]',
						isStderr ? 'STDERR' : 'STDOUT',
						':',
						trimmed
					)
				}

				const phase = parseWhisperPhase(trimmed)
				if (phase && phase !== currentPhase) {
					currentPhase = phase
					console.log('[SubtitleRecog][whisper] phase:', phase)
					if (options.onProgress) {
						const phaseMessages = {
							'Loading model': '正在加载模型',
							'Detecting language': '正在检测语言',
							'Converting audio': '正在转换音频',
							'Processing audio': '正在处理音频',
							Encoding: '正在编码',
							Decoding: '正在识别',
							'Saving output': '正在保存结果'
						}
						options.onProgress({
							type: 'phase',
							phase: 'recognizing',
							message: phaseMessages[phase] || phase,
							percent: lastProgress
						})
					}
				}

				const progress = parseWhisperProgress(trimmed)
				if (progress && progress.percent >= lastProgress) {
					lastProgress = progress.percent
					if (options.onProgress) {
						options.onProgress({
							type: 'progress',
							percent: progress.percent,
							phase: 'recognizing',
							message: `识别中: ${progress.percent}%`
						})
					}
				}
			}
		}

		child.stdout.on('data', (data) => {
			handleOutput(data.toString('utf-8'), false)
		})

		child.stderr.on('data', (data) => {
			handleOutput(data.toString('utf-8'), true)
		})

		child.on('error', (err) => {
			if (aborted) return
			console.error('[SubtitleRecog][whisper] spawn error:', err.message)
			reject(new Error(`启动 Whisper 进程失败: ${err.message}。请检查 Whisper 引擎是否正确安装。`))
		})

		child.on('close', (code) => {
			if (aborted) return

			console.log('[SubtitleRecog][whisper] process exited with code:', code)
			console.log('[SubtitleRecog][whisper] stderr (last 2000 chars):', stderr.slice(-2000))
			console.log('[SubtitleRecog][whisper] stdout (last 2000 chars):', stdout.slice(-2000))

			if (code !== 0) {
				let errorMsg = `Whisper 退出码: ${code}`
				const errorOutput = (stderr + '\n' + stdout).slice(-2000)
				if (errorOutput.trim()) {
					errorMsg += `: ${errorOutput.trim()}`
				}
				reject(new Error(errorMsg))
				return
			}

			const expectedSrtPath = outputBase + '.srt'
			console.log(
				'[SubtitleRecog][whisper] expected SRT path:',
				expectedSrtPath,
				'exists:',
				fs.existsSync(expectedSrtPath)
			)

			let finalSrtPath = expectedSrtPath

			if (!fs.existsSync(expectedSrtPath)) {
				console.log('[SubtitleRecog][whisper] expected SRT not found, searching tempDir...')
				try {
					const allFiles = fs.readdirSync(tempDir)
					const baseName = path.basename(outputBase)
					console.log(
						'[SubtitleRecog][whisper] tempDir files matching:',
						allFiles.filter((f) => f.includes('whisper_output') || f.endsWith('.srt')).join(', ')
					)

					const possibleFiles = allFiles.filter((f) => {
						return f.startsWith(baseName) && f.endsWith('.srt')
					})
					if (possibleFiles.length > 0) {
						finalSrtPath = path.join(tempDir, possibleFiles[0])
						console.log('[SubtitleRecog][whisper] found SRT via search:', finalSrtPath)
					} else {
						const anySrt = allFiles
							.filter((f) => f.endsWith('.srt'))
							.sort((a, b) => {
								return (
									fs.statSync(path.join(tempDir, b)).mtimeMs -
									fs.statSync(path.join(tempDir, a)).mtimeMs
								)
							})
						if (anySrt.length > 0) {
							finalSrtPath = path.join(tempDir, anySrt[0])
							console.log('[SubtitleRecog][whisper] found most recent SRT:', finalSrtPath)
						}
					}
				} catch (e) {
					console.error('[SubtitleRecog][whisper] error searching for SRT:', e.message)
				}
			}

			if (!fs.existsSync(finalSrtPath)) {
				const allTempFiles = fs.existsSync(tempDir)
					? fs.readdirSync(tempDir).slice(-20).join(', ')
					: 'tempDir not found'
				reject(
					new Error(
						`未找到 SRT 输出文件。期望路径: ${expectedSrtPath}。临时目录文件: ${allTempFiles}`
					)
				)
				return
			}

			try {
				const srtContent = fs.readFileSync(finalSrtPath, 'utf-8')
				console.log('[SubtitleRecog][whisper] SRT content length:', srtContent.length, 'chars')
				console.log(
					'[SubtitleRecog][whisper] SRT preview (first 500 chars):',
					srtContent.slice(0, 500)
				)
				const cues = parseSrt(srtContent)
				console.log('[SubtitleRecog][whisper] parsed cues count:', cues.length)

				try {
					fs.unlinkSync(finalSrtPath)
				} catch {}

				resolve({ cues, rawSrt: srtContent, modelSize })
			} catch (err) {
				console.error('[SubtitleRecog][whisper] SRT parse error:', err.message)
				reject(new Error(`解析 SRT 结果失败: ${err.message}`))
			}
		})

		if (signal) {
			signal.addEventListener(
				'abort',
				() => {
					aborted = true
					child.kill('SIGTERM')
					reject(new Error('Aborted'))
				},
				{ once: true }
			)
		}
	})
}

export async function* runWhisperRecognition(options) {
	yield { type: 'phase', phase: 'recognizing', message: '正在加载 Whisper 引擎...', percent: 0 }

	const queue = []
	let processError = null
	let processDone = false
	let processResult = null

	const onProgress = (progress) => {
		queue.push(progress)
	}

	console.log('[SubtitleRecog][whisper] starting runWhisperProcess...')
	runWhisperProcess({ ...options, onProgress })
		.then((result) => {
			console.log('[SubtitleRecog][whisper] runWhisperProcess resolved, cues:', result.cues.length)
			processResult = result
			processDone = true
		})
		.catch((err) => {
			console.error('[SubtitleRecog][whisper] runWhisperProcess rejected:', err.message)
			processError = err
			processDone = true
		})

	while (!processDone || queue.length > 0) {
		if (processError) {
			yield { type: 'error', message: processError.message || String(processError) }
			return
		}

		while (queue.length > 0) {
			yield queue.shift()
		}

		if (!processDone) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	if (processResult) {
		yield { type: 'phase', phase: 'parsing', message: '正在解析结果...', percent: 95 }
		yield {
			type: 'progress',
			percent: 100,
			phase: 'done',
			message: `识别完成，找到 ${processResult.cues.length} 条字幕`,
			cueCount: processResult.cues.length
		}
		yield { type: 'done', ...processResult }
	}
}
