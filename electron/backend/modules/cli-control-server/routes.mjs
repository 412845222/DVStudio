import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:cli-control:status', handler: handlers.cliControlGetStatus },
	{ channel: 'dweb:cli-control:task:get', handler: handlers.cliControlGetTask },
	{ channel: 'dweb:cli-control:task:list', handler: handlers.cliControlListTasks },
	{
		channel: 'dweb:cli-control:task:mark-completed',
		handler: handlers.cliControlMarkTaskCompleted
	},
	{ channel: 'dweb:cli-control:task:mark-failed', handler: handlers.cliControlMarkTaskFailed },
	{
		channel: 'dweb:cli-control:task:acknowledge-meta',
		handler: handlers.cliControlAcknowledgeTaskMeta
	},
	{ channel: 'dweb:cli-control:task:cancel', handler: handlers.cliControlCancelTask }
]
