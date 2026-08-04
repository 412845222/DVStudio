import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:chat:conversations:list', handler: handlers.listConversations },
	{ channel: 'dweb:chat:conversations:create', handler: handlers.createConversation },
	{ channel: 'dweb:chat:conversations:get', handler: handlers.getConversation },
	{ channel: 'dweb:chat:conversations:delete', handler: handlers.deleteConversation },
	{ channel: 'dweb:chat:conversations:update-title', handler: handlers.updateTitle },
	{ channel: 'dweb:chat:messages:send', handler: handlers.sendMessage },
	{ channel: 'dweb:chat:messages:stream', handler: handlers.streamMessage, stream: true },
	// Agent 模式支持
	{
		channel: 'dweb:chat:messages:stream-with-tools',
		handler: handlers.streamMessageWithTools,
		stream: true
	},
	{ channel: 'dweb:chat:messages:send-with-tools', handler: handlers.sendMessageWithTools },
	{ channel: 'dweb:chat:models:with-tools', handler: handlers.getModelsWithTools }
]
