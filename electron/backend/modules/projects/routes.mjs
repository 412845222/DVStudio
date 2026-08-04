import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:projects:list', handler: handlers.listProjects },
	{ channel: 'dweb:projects:save', handler: handlers.saveProject },
	{ channel: 'dweb:projects:load', handler: handlers.loadProject },
	{ channel: 'dweb:projects:delete', handler: handlers.deleteProject },
	{ channel: 'dweb:projects:open-folder', handler: handlers.openProjectFolder }
]
