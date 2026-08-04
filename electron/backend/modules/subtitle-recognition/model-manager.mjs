import fs from 'node:fs'
import path from 'node:path'
import { getWhisperModelDir, getWhisperModelPath, ensureWhisperDirs } from './paths.mjs'
import { downloadWithFallback } from './downloader.mjs'
import { checkModel, listInstalledModels } from './environment.mjs'
import { ModelSize } from './types.mjs'

const MODEL_INFO = {
	[ModelSize.TINY]: {
		size: ModelSize.TINY,
		name: 'Tiny',
		description: '最快，质量较低，适合快速预览',
		fileSize: 75 * 1024 * 1024,
		diskSize: '~75 MB',
		language: 'Multilingual',
		recommendedFor: '快速测试、低资源设备'
	},
	[ModelSize.BASE]: {
		size: ModelSize.BASE,
		name: 'Base',
		description: '平衡速度和质量，推荐首次使用',
		fileSize: 142 * 1024 * 1024,
		diskSize: '~142 MB',
		language: 'Multilingual',
		recommendedFor: '日常使用（推荐）'
	},
	[ModelSize.SMALL]: {
		size: ModelSize.SMALL,
		name: 'Small',
		description: '质量较好，速度较慢',
		fileSize: 466 * 1024 * 1024,
		diskSize: '~466 MB',
		language: 'Multilingual',
		recommendedFor: '高质量识别、长视频'
	}
}

const HF_REPO = 'ggerganov/whisper.cpp'
const HF_MIRRORS = ['hf-mirror.com', 'huggingface.site']

function getModelUrls(size, useMirror = true) {
	const filename = `ggml-${size}.bin`
	const urls = []

	if (useMirror) {
		for (const mirror of HF_MIRRORS) {
			urls.push(`https://${mirror}/${HF_REPO}/resolve/main/${filename}?download=true`)
		}
	}
	urls.push(`https://huggingface.co/${HF_REPO}/resolve/main/${filename}`)

	return urls
}

export function getAvailableModels() {
	return Object.values(MODEL_INFO)
}

export function getModelInfo(size) {
	return MODEL_INFO[size] || null
}

export function getModelDownloadConfig(size = ModelSize.BASE, useMirror = true) {
	const info = MODEL_INFO[size]
	if (!info) {
		return { supported: false, message: `Unknown model size: ${size}` }
	}

	const urls = getModelUrls(size, useMirror)
	return {
		supported: true,
		size,
		name: info.name,
		description: info.description,
		urls,
		url: urls[0],
		fileName: `ggml-${size}.bin`,
		estimatedSize: info.fileSize,
		diskSize: info.diskSize
	}
}

export async function* downloadModel(size = ModelSize.BASE, options = {}) {
	const { useMirror = true, overwrite = false } = options
	const info = MODEL_INFO[size]

	if (!info) {
		yield { type: 'error', message: `Unknown model size: ${size}` }
		return
	}

	ensureWhisperDirs()

	const currentStatus = checkModel(size)
	if (currentStatus.ok && !overwrite) {
		yield { type: 'progress', percent: 100, message: `Model ${size} already installed` }
		yield {
			type: 'done',
			size,
			path: currentStatus.path,
			fileSize: currentStatus.fileSize
		}
		return
	}

	const urls = getModelUrls(size, useMirror)
	const modelPath = getWhisperModelPath(size)

	yield {
		type: 'phase',
		phase: 'downloading',
		message: `正在下载 ${info.name} 模型 (${info.diskSize})...`,
		modelSize: size
	}

	let downloadSuccess = false
	try {
		for await (const chunk of downloadWithFallback(urls, modelPath, {
			expectedSize: info.fileSize,
			overwrite: true
		})) {
			if (chunk.type === 'progress') {
				yield {
					type: 'progress',
					percent: chunk.percent,
					downloadedBytes: chunk.downloadedBytes,
					totalBytes: chunk.totalBytes || info.fileSize,
					indeterminate: chunk.indeterminate,
					message: chunk.message || `正在下载 ${info.name}...`
				}
			} else if (chunk.type === 'status') {
				yield { type: 'status', message: chunk.message }
			} else if (chunk.type === 'error') {
				yield { type: 'error', message: chunk.message }
				return
			} else if (chunk.type === 'done') {
				downloadSuccess = true
				yield { type: 'progress', percent: 95, message: '正在验证...' }
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

	if (!fs.existsSync(modelPath)) {
		yield { type: 'error', message: `下载失败：模型文件未保存到 ${modelPath}` }
		return
	}

	const modelStat = fs.statSync(modelPath)
	if (modelStat.size < info.fileSize * 0.9) {
		try {
			fs.unlinkSync(modelPath)
		} catch {}
		yield { type: 'error', message: '下载失败：模型文件大小异常，可能是网络错误' }
		return
	}

	const finalStatus = checkModel(size)
	if (!finalStatus.ok) {
		yield { type: 'error', message: `模型验证失败: ${finalStatus.detail}` }
		return
	}

	yield { type: 'progress', percent: 100, message: '下载完成' }
	yield {
		type: 'done',
		size,
		path: finalStatus.path,
		fileSize: finalStatus.fileSize
	}
}

export function removeModel(size) {
	const modelPath = getWhisperModelPath(size)
	if (fs.existsSync(modelPath)) {
		try {
			fs.unlinkSync(modelPath)
			return { ok: true, size }
		} catch (err) {
			return { ok: false, size, error: err.message }
		}
	}
	return { ok: true, size, alreadyRemoved: true }
}

export function getInstalledModels() {
	return listInstalledModels()
}
