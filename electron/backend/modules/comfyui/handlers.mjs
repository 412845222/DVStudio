import * as service from './service.mjs'

export async function listWorkflows(ctx, payload) {
	return service.listWorkflows(ctx, payload)
}

export async function getWorkflow(ctx, payload) {
	return service.getWorkflow(ctx, payload)
}

export async function saveWorkflow(ctx, payload) {
	return service.saveWorkflow(ctx, payload)
}

export async function deleteWorkflow(ctx, payload) {
	return service.deleteWorkflow(ctx, payload)
}

export async function proxy(ctx, payload) {
	return service.proxyRequest(ctx, payload)
}

export async function listJobs(ctx, payload) {
	return service.listJobs(ctx, payload)
}

export async function getJob(ctx, payload) {
	return service.getJob(ctx, payload)
}

export async function createJob(ctx, payload) {
	return service.createJob(ctx, payload)
}

export async function cancelJob(ctx, payload) {
	return service.cancelJob(ctx, payload)
}
