import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:seedance:health', handler: handlers.health },
	{ channel: 'dweb:seedance:generate:stream', handler: handlers.generate, stream: true },
	{ channel: 'dweb:seedance:list', handler: handlers.list },
	{ channel: 'dweb:seedance:task-detail', handler: handlers.taskDetail },
	{ channel: 'dweb:seedance:sync', handler: handlers.sync },
	{ channel: 'dweb:seedance:task-detail-remote', handler: handlers.taskDetailRemote },
	{ channel: 'dweb:seedance:download-asset', handler: handlers.downloadAsset },
	{ channel: 'dweb:seedance:list-all-remote', handler: handlers.listAllRemote }
]
