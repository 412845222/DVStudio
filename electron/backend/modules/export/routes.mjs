import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:export:jobs:create', handler: handlers.createJob },
	{ channel: 'dweb:export:jobs:get', handler: handlers.getJob },
	{ channel: 'dweb:export:jobs:finalize', handler: handlers.finalizeJob },
	{ channel: 'dweb:export:jobs:file', handler: handlers.getJobFile },
	{ channel: 'dweb:export:jobs:list-by-project', handler: handlers.listJobsByProject },
	{ channel: 'dweb:export:frames:upload', handler: handlers.uploadFrame },
	{ channel: 'dweb:export:frames:upload-raw', handler: handlers.uploadFrameRaw },
	{ channel: 'dweb:export:frames:upload-batch', handler: handlers.uploadFramesBatch },
	{ channel: 'dweb:export:jobs:stream', handler: handlers.streamJob, stream: true },
]
