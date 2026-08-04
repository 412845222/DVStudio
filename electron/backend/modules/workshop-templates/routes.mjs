import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:workshop-templates:get-platform', handler: handlers.getPlatform },
	{ channel: 'dweb:workshop-templates:query', handler: handlers.queryTemplates },
	{ channel: 'dweb:workshop-templates:download', handler: handlers.downloadTemplate },
	{ channel: 'dweb:workshop-templates:progress', handler: handlers.getDownloadProgress },
	{ channel: 'dweb:workshop-templates:install-info', handler: handlers.getInstallInfo }
]
