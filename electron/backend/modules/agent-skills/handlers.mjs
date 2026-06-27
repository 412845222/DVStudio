import * as service from './service.mjs'

export function sceneUnderstandModels(ctx) {
	return service.sceneUnderstandModels()
}

export async function sceneUnderstandRun(ctx, payload) {
	return service.sceneUnderstandRun(ctx, payload)
}

export function sceneUnderstandRunStream(ctx, payload) {
	return service.sceneUnderstandRunStream(ctx, payload)
}

export function sceneLightingModels() {
	return service.sceneLightingModels()
}

export async function sceneLightingRun(ctx, payload) {
	return service.sceneLightingRun(ctx, payload)
}

export function sceneLightingRunStream(ctx, payload) {
	return service.sceneLightingRunStream(ctx, payload)
}

export function sceneLayoutRun(ctx, payload) {
	return service.sceneLayoutRun(ctx, payload)
}

export function unrealSessions() {
	return service.unrealSessions()
}

export function unrealRegister(ctx, payload) {
	return service.unrealRegister(ctx, payload)
}

export function unrealSessionDetail(ctx, payload) {
	return service.unrealSessionDetail(ctx, payload)
}

export function unrealCreateJob(ctx, payload) {
	return service.unrealCreateJob(ctx, payload)
}

export function unrealJobDetail(ctx, payload) {
	return service.unrealJobDetail(ctx, payload)
}

export function unrealHeartbeat(ctx, payload) {
	return service.unrealHeartbeat(ctx, payload)
}

export function unrealPickJob(ctx, payload) {
	return service.unrealPickJob(ctx, payload)
}

export function unrealGetHttpPort() {
	return { ok: true, port: service.getUnrealHttpPort() }
}
