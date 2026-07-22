import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:task-queue:list', handler: handlers.listTasks },
	{ channel: 'dweb:task-queue:list-by-project', handler: handlers.listByProject },
	{ channel: 'dweb:task-queue:list-unbackfilled-completed', handler: handlers.listUnbackfilledCompleted },
	{ channel: 'dweb:task-queue:reconcile', handler: handlers.reconcile },
	{ channel: 'dweb:task-queue:summary', handler: handlers.getSummary },
	{ channel: 'dweb:task-queue:get', handler: handlers.getTask },
	{ channel: 'dweb:task-queue:find-by-unique-key', handler: handlers.findByUniqueKey },
	{ channel: 'dweb:task-queue:find-active-by-node', handler: handlers.findActiveByNodeId },
	{ channel: 'dweb:task-queue:cancel', handler: handlers.cancelTask },
	{ channel: 'dweb:task-queue:dismiss', handler: handlers.dismissTask },
	{ channel: 'dweb:task-queue:delete', handler: handlers.deleteTask },
	{ channel: 'dweb:task-queue:clear-completed', handler: handlers.clearCompleted },
	{ channel: 'dweb:task-queue:mark-backfilled', handler: handlers.markBackfilled },
	{ channel: 'dweb:task-queue:submit', handler: handlers.submitTask },
	{ channel: 'dweb:task-queue:create', handler: handlers.createTask },
	{ channel: 'dweb:task-queue:register', handler: handlers.registerTask },
	{ channel: 'dweb:task-queue:fail', handler: handlers.failTask },
	{ channel: 'dweb:task-queue:complete', handler: handlers.completeTask },
	{ channel: 'dweb:task-queue:bind-remote-task', handler: handlers.bindRemoteTask },
	{ channel: 'dweb:task-queue:update', handler: handlers.updateTask },
]

export { handlers }
