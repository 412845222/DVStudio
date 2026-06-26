import * as service from './service.mjs'

export async function nanobananaRefCache(ctx, payload) {
	return service.nanobananaRefCache(ctx, payload)
}

export async function seedreamRefCache(ctx, payload) {
	return service.seedreamRefCache(ctx, payload)
}

export async function nanobananaGenerate(ctx, payload) {
	return service.nanobananaGenerate(ctx, payload)
}

export function nanobananaGenerateStream(ctx, payload) {
	return service.nanobananaGenerateStream(ctx, payload)
}

export function seedreamGenerateStream(ctx, payload) {
	return service.seedreamGenerateStream(ctx, payload)
}

export function jimengImageGenerateStream(ctx, payload) {
	return service.jimengImageGenerateStream(ctx, payload)
}

export function jimengVideoGenerateStream(ctx, payload) {
	return service.jimengVideoGenerateStream(ctx, payload)
}

export async function blueprintChat(ctx, payload) {
	return service.blueprintChat(ctx, payload)
}

export function blueprintChatStream(ctx, payload) {
	return service.blueprintChatStream(ctx, payload)
}
