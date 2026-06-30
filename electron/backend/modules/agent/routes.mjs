/**
 * Agent 模块路由注册
 */

import * as handlers from './handlers.mjs';

export const routes = [
	{ channel: 'dweb:agent:stream', handler: handlers.agentStream, stream: true },
	{ channel: 'dweb:agent:context', handler: handlers.agentContext },
	{ channel: 'dweb:agent:abort', handler: handlers.agentAbort },
	{ channel: 'dweb:agent:list-conversations', handler: handlers.agentListConversations },
	{ channel: 'dweb:agent:create-conversation', handler: handlers.agentCreateConversation },
	{ channel: 'dweb:agent:delete-conversation', handler: handlers.agentDeleteConversation },
	{ channel: 'dweb:agent:get-conversation-messages', handler: handlers.agentGetConversationMessages },
	{ channel: 'dweb:agent:add-conversation-message', handler: handlers.agentAddConversationMessage },
];
