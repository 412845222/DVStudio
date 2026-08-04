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
	{ channel: 'dweb:comfyui:runtime:object_info', handler: handlers.runtimeGetObjectInfo },
	{ channel: 'dweb:comfyui:runtime:workflows:list', handler: handlers.runtimeListWorkflowFiles },
	{ channel: 'dweb:comfyui:runtime:workflows:get', handler: handlers.runtimeGetWorkflowFile },
	{
		channel: 'dweb:comfyui:runtime:workflows:get-history',
		handler: handlers.runtimeGetHistoryWorkflow
	},
	{
		channel: 'dweb:comfyui:runtime:workflows:resolve-history',
		handler: handlers.runtimeResolveHistoryPrompt
	},
	{ channel: 'dweb:comfyui:runtime:run', handler: handlers.runtimeRunWorkflow },
	{ channel: 'dweb:comfyui:runtime:outputs', handler: handlers.runtimeGetOutputs },
	{ channel: 'dweb:comfyui:runtime:cancel', handler: handlers.runtimeCancelRun },
	{ channel: 'dweb:comfyui:runtime:job', handler: handlers.runtimeGetJobStatus },
	{ channel: 'dweb:comfyui:runtime:clear-cache', handler: handlers.runtimeClearHistoryCache },
	// Setup routes
	{ channel: 'dweb:comfyui:setup:default-path', handler: handlers.setupGetDefaultInstallPath },
	{ channel: 'dweb:comfyui:setup:select-path', handler: handlers.setupSelectPath },
	{ channel: 'dweb:comfyui:setup:select-model-path', handler: handlers.setupSelectModelPath },
	{ channel: 'dweb:comfyui:setup:validate-path', handler: handlers.setupValidatePath },
	{ channel: 'dweb:comfyui:setup:probe', handler: handlers.setupProbeExistingInstall },
	{ channel: 'dweb:comfyui:setup:check-env', handler: handlers.setupCheckEnv },
	{ channel: 'dweb:comfyui:setup:get-config', handler: handlers.setupGetConfig },
	{ channel: 'dweb:comfyui:setup:save-config', handler: handlers.setupSaveConfig },
	{ channel: 'dweb:comfyui:setup:check-version', handler: handlers.setupCheckVersionUpdate },
	{ channel: 'dweb:comfyui:setup:reset-fresh', handler: handlers.setupResetForFreshInstall },
	{ channel: 'dweb:comfyui:setup:add-model-path', handler: handlers.setupAddCustomModelPath },
	{ channel: 'dweb:comfyui:setup:remove-model-path', handler: handlers.setupRemoveCustomModelPath },
	{ channel: 'dweb:comfyui:setup:open-folder', handler: handlers.setupOpenFolder },
	{ channel: 'dweb:comfyui:setup:service-status', handler: handlers.setupGetServiceStatus },
	{ channel: 'dweb:comfyui:setup:start-service', handler: handlers.setupStartService },
	{ channel: 'dweb:comfyui:setup:stop-service', handler: handlers.setupStopService },
	{ channel: 'dweb:comfyui:setup:cancel-install', handler: handlers.setupCancelInstall },
	{ channel: 'dweb:comfyui:setup:install:stream', handler: handlers.setupInstall, stream: true },
	{ channel: 'dweb:comfyui:setup:ping-mirrors', handler: handlers.setupPingMirrors },
	{ channel: 'dweb:comfyui:setup:get-mirror-list', handler: handlers.setupGetMirrorList },
	{ channel: 'dweb:comfyui:setup:set-mirror', handler: handlers.setupSetMirror },
	{
		channel: 'dweb:comfyui:setup:fix-python-env:stream',
		handler: handlers.setupFixPythonEnv,
		stream: true
	},
	{ channel: 'dweb:comfyui:setup:default-venv-path', handler: handlers.setupGetDefaultVenvPath },
	{ channel: 'dweb:comfyui:setup:select-venv-path', handler: handlers.setupSelectVenvPath },
	{ channel: 'dweb:comfyui:setup:set-venv-path', handler: handlers.setupSetVenvPath },
	{ channel: 'dweb:comfyui:setup:service-logs', handler: handlers.setupGetServiceLogs },
	{ channel: 'dweb:comfyui:setup:clear-logs', handler: handlers.setupClearServiceLogs },
	{ channel: 'dweb:comfyui:setup:restart-service', handler: handlers.setupRestartService },
	{
		channel: 'dweb:comfyui:setup:clone-comfyui:stream',
		handler: handlers.setupCloneComfyUI,
		stream: true
	},
	{
		channel: 'dweb:comfyui:setup:update-comfyui:stream',
		handler: handlers.setupUpdateComfyUI,
		stream: true
	},
	{
		channel: 'dweb:comfyui:setup:auto-install-torch:stream',
		handler: handlers.setupAutoInstallTorch,
		stream: true
	},
	{ channel: 'dweb:comfyui:setup:clear-venv', handler: handlers.setupClearVenv }
]
