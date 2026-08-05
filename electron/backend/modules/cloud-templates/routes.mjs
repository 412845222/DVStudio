import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:cloud-templates:get-platform', handler: handlers.getPlatform },
	{ channel: 'dweb:cloud-templates:get-quota', handler: handlers.getQuota },
	{ channel: 'dweb:cloud-templates:list', handler: handlers.listTemplates },
	{ channel: 'dweb:cloud-templates:upload', handler: handlers.uploadTemplate },
	{ channel: 'dweb:cloud-templates:download', handler: handlers.downloadTemplate },
	{ channel: 'dweb:cloud-templates:delete', handler: handlers.deleteTemplate }
]
