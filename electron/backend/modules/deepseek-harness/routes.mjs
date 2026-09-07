import * as handlers from './handlers.mjs'

const actions = {
	'list-profiles': handlers.listProfiles,
	'save-profile': handlers.saveProfile,
	'remove-profile': handlers.removeProfile,
	'activate-profile': handlers.activateProfile,
	'select-path': handlers.selectPath,
	probe: handlers.probe,
	'service-status': handlers.getSnapshot,
	'service-logs': handlers.getSnapshot,
	'clear-logs': handlers.clearLogs,
	'start-service': handlers.startService,
	'stop-service': handlers.stopService,
	'restart-service': handlers.restartService,
	'cancel-prepare': handlers.cancelPrepare,
	'open-ui': handlers.openUi
}
export const routes = [
	...Object.entries(actions).map(([action, handler]) => ({
		channel: `dweb:deepseek-harness:setup:${action}`,
		handler
	})),
	{ channel: 'dweb:deepseek-harness:setup:prepare:stream', handler: handlers.prepare, stream: true }
]
