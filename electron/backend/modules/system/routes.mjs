import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:system:health', handler: handlers.health },
	{ channel: 'dweb:system:echo', handler: handlers.echo },
	{ channel: 'dweb:system:legal:agreement', handler: handlers.userAgreement },
	{ channel: 'dweb:system:migration-status', handler: handlers.migrationStatus },
	{ channel: 'dweb:system:check-update', handler: handlers.checkUpdate },
	{ channel: 'dweb:system:is-steam', handler: handlers.isSteam }
]
