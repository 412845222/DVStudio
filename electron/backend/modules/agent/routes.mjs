/**
 * Agent 模块路由注册
 */

import * as handlers from './handlers.mjs';

export const routes = [
	{ channel: 'dweb:agent:stream', handler: handlers.agentStream, stream: true },
	{ channel: 'dweb:agent:context', handler: handlers.agentContext },
	{ channel: 'dweb:agent:abort', handler: handlers.agentAbort },
];
