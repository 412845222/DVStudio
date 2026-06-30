import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:agent-skills:scene-understand:models', handler: handlers.sceneUnderstandModels },
	{ channel: 'dweb:agent-skills:scene-understand:run', handler: handlers.sceneUnderstandRun },
	{ channel: 'dweb:agent-skills:scene-understand:run:stream', handler: handlers.sceneUnderstandRunStream, stream: true },
	{ channel: 'dweb:agent-skills:scene-lighting:models', handler: handlers.sceneLightingModels },
	{ channel: 'dweb:agent-skills:scene-lighting:run', handler: handlers.sceneLightingRun },
	{ channel: 'dweb:agent-skills:scene-lighting:run:stream', handler: handlers.sceneLightingRunStream, stream: true },
	{ channel: 'dweb:agent-skills:scene-layout:run', handler: handlers.sceneLayoutRun },
	{ channel: 'dweb:agent-skills:unreal:sessions', handler: handlers.unrealSessions },
	{ channel: 'dweb:agent-skills:unreal:register', handler: handlers.unrealRegister },
	{ channel: 'dweb:agent-skills:unreal:session-detail', handler: handlers.unrealSessionDetail },
	{ channel: 'dweb:agent-skills:unreal:create-job', handler: handlers.unrealCreateJob },
	{ channel: 'dweb:agent-skills:unreal:job-detail', handler: handlers.unrealJobDetail },
	{ channel: 'dweb:agent-skills:unreal:heartbeat', handler: handlers.unrealHeartbeat },
	{ channel: 'dweb:agent-skills:unreal:pick-job', handler: handlers.unrealPickJob },
	{ channel: 'dweb:agent-skills:unreal:get-http-port', handler: handlers.unrealGetHttpPort },
	{ channel: 'dweb:agent-skills:unreal:detect-editor', handler: handlers.unrealDetectEditor },
	{ channel: 'dweb:agent-skills:unreal:check-plugin', handler: handlers.unrealCheckPlugin },
	{ channel: 'dweb:agent-skills:unreal:install-plugin', handler: handlers.unrealInstallPlugin },
	{ channel: 'dweb:agent-skills:unreal:get-plugin-info', handler: handlers.unrealGetPluginInfo },
]
