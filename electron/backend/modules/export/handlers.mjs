import * as service from './service.mjs'

export async function createJob(ctx, payload) {
	return service.createJob(ctx, payload)
}

export async function getJob(ctx, payload) {
	return service.getJob(ctx, payload)
}

export async function finalizeJob(ctx, payload) {
	return service.finalizeJob(ctx, payload)
}

export async function getJobFile(ctx, payload) {
	return service.getJobFile(ctx, payload)
}

export async function listJobsByProject(ctx, payload) {
	return service.listJobsByProject(ctx, payload)
}

export async function uploadFrame(ctx, payload) {
	return service.uploadFrame(ctx, payload)
}

export async function uploadFrameRaw(ctx, payload) {
	return service.uploadFrameRaw(ctx, payload)
}

export async function uploadFramesBatch(ctx, payload) {
	return service.uploadFramesBatch(ctx, payload)
}

export async function streamJob(ctx, payload) {
	return service.streamJob(ctx, payload)
}
