import { handleListTasks, handleGetTaskDetail, handleDeleteTask, handleRecordTask } from './handlers.mjs'

export const routes = [
	{ channel: 'dweb.ark.listTasks', handler: handleListTasks },
	{ channel: 'dweb.ark.getTaskDetail', handler: handleGetTaskDetail },
	{ channel: 'dweb.ark.deleteTask', handler: handleDeleteTask },
	{ channel: 'dweb.ark.recordTask', handler: handleRecordTask },
]