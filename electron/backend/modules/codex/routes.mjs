import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:codex:health', handler: handlers.codexHealth },
	{ channel: 'dweb:codex:list-sessions', handler: handlers.codexListSessions },
	{ channel: 'dweb:codex:create-session', handler: handlers.codexCreateSession },
	{ channel: 'dweb:codex:list-messages', handler: handlers.codexListMessages },
	{ channel: 'dweb:codex:update-session', handler: handlers.codexUpdateSession },
	{ channel: 'dweb:codex:delete-session', handler: handlers.codexDeleteSession },
	{ channel: 'dweb:codex:submit-approval', handler: handlers.codexSubmitApproval },
	{ channel: 'dweb:codex:send-message:stream', handler: handlers.codexSendMessageStream, stream: true },
	{ channel: 'dweb:codex:cancel', handler: handlers.codexCancel },
]
