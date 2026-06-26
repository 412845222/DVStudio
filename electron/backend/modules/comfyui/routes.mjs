import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:comfyui:workflows:list', handler: handlers.listWorkflows },
	{ channel: 'dweb:comfyui:workflows:get', handler: handlers.getWorkflow },
	{ channel: 'dweb:comfyui:workflows:save', handler: handlers.saveWorkflow },
	{ channel: 'dweb:comfyui:workflows:delete', handler: handlers.deleteWorkflow },
	{ channel: 'dweb:comfyui:proxy', handler: handlers.proxy },
	{ channel: 'dweb:comfyui:jobs:list', handler: handlers.listJobs },
	{ channel: 'dweb:comfyui:jobs:get', handler: handlers.getJob },
	{ channel: 'dweb:comfyui:jobs:create', handler: handlers.createJob },
	{ channel: 'dweb:comfyui:jobs:cancel', handler: handlers.cancelJob },
]
