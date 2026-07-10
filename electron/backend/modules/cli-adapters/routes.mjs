/**
 * CLI 适配器模块路由注册
 */

import * as handlers from './handlers.mjs';

export const routes = [
	{ channel: 'dweb:cli:check-availability', handler: handlers.cliCheckAvailability },
	{ channel: 'dweb:cli:list-adapters', handler: handlers.cliListAdapters },
	{ channel: 'dweb:cli:start-session', handler: handlers.cliStartSession },
	{ channel: 'dweb:cli:stop-session', handler: handlers.cliStopSession },
	{ channel: 'dweb:cli:send-message:stream', handler: handlers.cliSendMessage, stream: true },
	{ channel: 'dweb:cli:cancel', handler: handlers.cliCancel },
	{ channel: 'dweb:cli:get-session', handler: handlers.cliGetSession },
	{ channel: 'dweb:cli:list-sessions', handler: handlers.cliListSessions },
	{ channel: 'dweb:cli:check-environment', handler: handlers.cliCheckEnvironment },
	{ channel: 'dweb:cli:list-models', handler: handlers.cliListModels },
	{ channel: 'dweb:cli:get-config', handler: handlers.cliGetConfig },
	{ channel: 'dweb:cli:save-config', handler: handlers.cliSaveConfig },
	{ channel: 'dweb:cli:reset-config', handler: handlers.cliResetConfig },
	{ channel: 'dweb:cli:run-fix', handler: handlers.cliRunFix },
	{ channel: 'dweb:cli:start-auth:stream', handler: handlers.cliStartAuth, stream: true },
	{ channel: 'dweb:cli:cancel-auth', handler: handlers.cliCancelAuth },
];
