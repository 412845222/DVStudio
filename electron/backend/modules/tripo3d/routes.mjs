import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:tripo3d:health', handler: handlers.health },
	{ channel: 'dweb:tripo3d:generate', handler: handlers.generate },
	{ channel: 'dweb:tripo3d:generate:text-to-image', handler: handlers.generateTextToImage },
	{ channel: 'dweb:tripo3d:generate:image-to-image', handler: handlers.generateImageToImage },
	{
		channel: 'dweb:tripo3d:generate:image-to-multiview',
		handler: handlers.generateImageToMultiview
	},
	{ channel: 'dweb:tripo3d:get-task', handler: handlers.getTask },
	{ channel: 'dweb:tripo3d:list-tasks', handler: handlers.listTasks },
	{ channel: 'dweb:tripo3d:task-detail', handler: handlers.taskDetail },
	{ channel: 'dweb:tripo3d:stop', handler: handlers.stop },
	{ channel: 'dweb:tripo3d:delete', handler: handlers.deleteTask },
	{ channel: 'dweb:tripo3d:balance', handler: handlers.balance },
	{ channel: 'dweb:tripo3d:upload-file', handler: handlers.uploadFile }
]
