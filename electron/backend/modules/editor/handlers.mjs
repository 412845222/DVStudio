import * as service from './service.mjs'

export async function listComponents(ctx, payload) {
	return service.listComponents(ctx, payload)
}

export async function saveComponent(ctx, payload) {
	return service.saveComponent(ctx, payload)
}

export async function deleteComponent(ctx, payload) {
	return service.deleteComponent(ctx, payload)
}

export async function getComponent(ctx, payload) {
	return service.getComponent(ctx, payload)
}

export async function importComponents(ctx, payload) {
	return service.importComponents(ctx, payload)
}
