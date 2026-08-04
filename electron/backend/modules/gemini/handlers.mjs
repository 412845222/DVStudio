import * as service from './service.mjs'

export async function health(ctx) {
	return service.health(ctx)
}

export async function getTask(ctx, payload) {
	return service.getTask(ctx, payload)
}

export async function listTasks(ctx, payload) {
	return service.listTasks(ctx, payload)
}

export async function cancel(ctx, payload) {
	return service.cancelTask(ctx, payload?.taskId)
}

export async function deleteTask(ctx, payload) {
	return service.deleteTask(ctx, payload)
}

export async function clearCompleted(ctx, payload) {
	return service.clearCompleted(ctx, payload)
}

export async function getImagePath(ctx, payload) {
	return service.getImagePath(ctx, payload)
}
