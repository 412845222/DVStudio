import * as service from './service.mjs'

export async function listConversations(ctx, payload) {
	return service.listConversations(ctx, payload)
}

export async function createConversation(ctx, payload) {
	return service.createConversation(ctx, payload)
}

export async function getConversation(ctx, payload) {
	return service.getConversation(ctx, payload)
}

export async function deleteConversation(ctx, payload) {
	return service.deleteConversation(ctx, payload)
}

export async function updateTitle(ctx, payload) {
	return service.updateConversationTitle(ctx, payload)
}

export async function sendMessage(ctx, payload) {
	return service.sendMessage(ctx, payload)
}

export async function streamMessage(ctx, payload) {
	return service.streamMessage(ctx, payload)
}
