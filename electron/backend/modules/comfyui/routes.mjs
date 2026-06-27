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
	{ channel: 'dweb:comfyui:runtime:ping', handler: handlers.runtimePing },
	{ channel: 'dweb:comfyui:runtime:workflows:list', handler: handlers.runtimeListWorkflowFiles },
	{ channel: 'dweb:comfyui:runtime:workflows:get', handler: handlers.runtimeGetWorkflowFile },
	{ channel: 'dweb:comfyui:runtime:run', handler: handlers.runtimeRunWorkflow },
	{ channel: 'dweb:comfyui:runtime:outputs', handler: handlers.runtimeGetOutputs },
	{ channel: 'dweb:comfyui:runtime:cancel', handler: handlers.runtimeCancelRun },
	{ channel: 'dweb:comfyui:runtime:job', handler: handlers.runtimeGetJobStatus },
]
