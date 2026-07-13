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

export async function runtimePing(ctx, payload) {
	return service.runtimePing(ctx, payload)
}

export async function runtimeGetObjectInfo(ctx, payload) {
	return service.runtimeGetObjectInfo(ctx, payload)
}

export async function runtimeListWorkflowFiles(ctx, payload) {
	return service.runtimeListWorkflowFiles(ctx, payload)
}

export async function runtimeGetWorkflowFile(ctx, payload) {
	return service.runtimeGetWorkflowFile(ctx, payload)
}

export async function runtimeGetHistoryWorkflow(ctx, payload) {
	return service.runtimeGetHistoryWorkflow(ctx, payload)
}

export async function runtimeRunWorkflow(ctx, payload) {
	return service.runtimeRunWorkflow(ctx, payload)
}

export async function runtimeGetOutputs(ctx, payload) {
	return service.runtimeGetOutputs(ctx, payload)
}

export async function runtimeCancelRun(ctx, payload) {
	return service.runtimeCancelRun(ctx, payload)
}

export async function runtimeGetJobStatus(ctx, payload) {
	return service.runtimeGetJobStatus(ctx, payload)
}
