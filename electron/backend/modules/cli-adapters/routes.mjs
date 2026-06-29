/**
 * CLI 适配器模块路由注册
 */

import * as handlers from './handlers.mjs';

export const routes = [
	{ channel: 'dweb:cli:check-availability', handler: handlers.cliCheckAvailability },
	{ channel: 'dweb:cli:list-adapters', handler: handlers.cliListAdapters },
	{ channel: 'dweb:cli:start-session', handler: handlers.cliStartSession },
	{ channel: 'dweb:cli:stop-session', handler: handlers.cliStopSession },
	{ channel: 'dweb:cli:send-message', handler: handlers.cliSendMessage, stream: true },
	{ channel: 'dweb:cli:cancel', handler: handlers.cliCancel },
	{ channel: 'dweb:cli:get-session', handler: handlers.cliGetSession },
	{ channel: 'dweb:cli:list-sessions', handler: handlers.cliListSessions },
];
