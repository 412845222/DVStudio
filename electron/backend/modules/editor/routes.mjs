import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:editor:components:list', handler: handlers.listComponents },
	{ channel: 'dweb:editor:components:save', handler: handlers.saveComponent },
	{ channel: 'dweb:editor:components:delete', handler: handlers.deleteComponent },
	{ channel: 'dweb:editor:components:get', handler: handlers.getComponent },
	{ channel: 'dweb:editor:components:import', handler: handlers.importComponents },
]
