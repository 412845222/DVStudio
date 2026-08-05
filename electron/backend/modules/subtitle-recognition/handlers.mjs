import * as service from './service.mjs'

export async function checkEnv(ctx, payload) {
	return service.checkEnv(payload)
}

export async function getBinaryConfig(ctx, payload) {
	const { useMirror = true } = payload || {}
	return service.getBinaryConfig(useMirror)
}

export async function* downloadBinary(ctx, payload) {
	yield* service.downloadBinary(payload)
}

export async function getFfmpegConfig(ctx, payload) {
	const { useMirror = true } = payload || {}
	return service.getFfmpegConfig(useMirror)
}

export async function* downloadFfmpeg(ctx, payload) {
	yield* service.downloadFfmpeg(payload)
}

export async function getAvailableModels(ctx, payload) {
	return service.getAvailableModels()
}

export async function getModelConfig(ctx, payload) {
	const { size, useMirror = true } = payload || {}
	return service.getModelConfig(size, useMirror)
}

export async function* downloadModel(ctx, payload) {
	yield* service.downloadModel(payload)
}

export async function getInstalledModels(ctx, payload) {
	return service.getInstalledModels()
}

export async function* recognize(ctx, payload) {
	yield* service.recognize(payload)
}

export async function readAudioFile(ctx, payload) {
	const { path: audioPath } = payload || {}
	return service.readAudioFile(audioPath)
}

export async function cleanupAudioFile(ctx, payload) {
	const { path: audioPath } = payload || {}
	return service.cleanupAudioFile(audioPath)
}
