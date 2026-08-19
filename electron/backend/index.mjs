import { createRouter } from './router.mjs'
import { createContext } from './context.mjs'
import logger from './core/logger.mjs'
import { routes as systemRoutes } from './modules/system/routes.mjs'
import { routes as projectsRoutes } from './modules/projects/routes.mjs'
import { routes as projectAssetsRoutes } from './modules/project-assets/routes.mjs'
import { routes as meshyRoutes } from './modules/meshy/routes.mjs'
import { routes as tripo3dRoutes } from './modules/tripo3d/routes.mjs'
import { routes as seedanceRoutes } from './modules/seedance/routes.mjs'
import { routes as arkRoutes } from './modules/ark/routes.mjs'
import { routes as geminiRoutes } from './modules/gemini/routes.mjs'
import { routes as editorRoutes } from './modules/editor/routes.mjs'
import { routes as chatRoutes } from './modules/chat/routes.mjs'
import { routes as exportRoutes } from './modules/export/routes.mjs'
import { routes as comfyuiRoutes } from './modules/comfyui/routes.mjs'
import { routes as thirdPartyRoutes } from './modules/third-party/routes.mjs'
import { routes as agentSkillsRoutes } from './modules/agent-skills/routes.mjs'
import { routes as mcpRoutes } from './modules/mcp/routes.mjs'
import { routes as agentRoutes } from './modules/agent/routes.mjs'
import { routes as cliAdapterRoutes } from './modules/cli-adapters/routes.mjs'
import { routes as cliControlRoutes } from './modules/cli-control-server/routes.mjs'
import { initCliControlService, shutdownCliControlService } from './modules/cli-control-server/service.mjs'
import { routes as subtitleRoutes } from './modules/subtitle/routes.mjs'
import { routes as subtitleRecognitionRoutes } from './modules/subtitle-recognition/routes.mjs'
import { routes as cloudTemplatesRoutes } from './modules/cloud-templates/routes.mjs'
import { routes as workshopTemplatesRoutes } from './modules/workshop-templates/routes.mjs'
import { routes as blenderRoutes } from './modules/blender/routes.mjs'
import { routes as cloudfsRoutes } from './modules/cloudfs/routes.mjs'
import { routes as taskQueueRoutes } from './modules/task-queue/routes.mjs'
import { initTaskQueue } from './modules/task-queue/init.mjs'
import { startUnrealHttpServer, stopUnrealHttpServer } from './modules/agent-skills/service.mjs'
import { setProjectRoot } from './projectAssetProtocol.mjs'
import { getRepos } from '../localdb/index.mjs'
import { registerBuiltinTools } from './modules/mcp/builtinTools.mjs'
import { initMCPModule } from './modules/mcp/routes.mjs'

function restoreProjectRoots() {
	try {
		const repos = getRepos()
		const projectsRepo = repos?.projects
		if (!projectsRepo || typeof projectsRepo.list !== 'function') {
			logger.warn('Cannot restore project roots: projects repo not available')
			return 0
		}
		const projects = projectsRepo.list()
		let restored = 0
		for (const project of projects) {
			const id = project?.id
			const rootPath = project?.rootPath
			if (id && rootPath && typeof rootPath === 'string' && rootPath.trim()) {
				try {
					const result = setProjectRoot(id, rootPath.trim())
					if (result?.ok) restored++
				} catch (err) {
					logger.debug(`Failed to restore root for project ${id}: ${String(err?.message || err)}`)
				}
			}
		}
		if (restored > 0) {
			logger.info(`Restored project root registrations for ${restored} folder-backed projects`)
		}
		return restored
	} catch (err) {
		logger.warn(`Failed to restore project roots: ${String(err?.message || err)}`)
		return 0
	}
}

let _router = null

export function initBackend(mainWindow, deps = {}) {
	if (_router) {
		logger.warn('Backend already initialized, skipping')
		return _router
	}

	logger.info('Initializing new backend...')

	const allRoutes = [
		...systemRoutes,
		...projectsRoutes,
		...projectAssetsRoutes,
		...meshyRoutes,
		...tripo3dRoutes,
		...seedanceRoutes,
		...arkRoutes,
		...geminiRoutes,
		...editorRoutes,
		...chatRoutes,
		...exportRoutes,
		...comfyuiRoutes,
		...thirdPartyRoutes,
		...agentSkillsRoutes,
		...mcpRoutes,
		...agentRoutes,
		...cliAdapterRoutes,
		...subtitleRoutes,
		...subtitleRecognitionRoutes,
		...cloudTemplatesRoutes,
		...workshopTemplatesRoutes,
		...blenderRoutes,
		...cloudfsRoutes,
		...taskQueueRoutes,
		...cliControlRoutes
	]

	_router = createRouter({
		routes: allRoutes,
		contextFactory: () => createContext(mainWindow, deps),
		mainWindow
	})

	_router.register()

	restoreProjectRoots()

	registerBuiltinTools()
	initMCPModule()

	initTaskQueue(mainWindow)

	startUnrealHttpServer().then((result) => {
		if (result.ok) {
			logger.info(`Unreal HTTP server listening on port ${result.port}`)
		} else {
			logger.warn(`Failed to start Unreal HTTP server: ${result.error}`)
		}
	})

	// ===== CLI Control Server (独立 try/catch 隔离) =====
	try {
		const appVersion = process.env.npm_package_version || '0.2.4'
		initCliControlService({ appVersion }).then((cliResult) => {
			if (cliResult.ok) {
				logger.info(`CLI control server listening on port ${cliResult.port}`)
			} else if (cliResult.disabled) {
				logger.info('CLI control server disabled via feature flag')
			} else {
				logger.warn(`Failed to start CLI control server: ${cliResult.error || 'unknown'}`)
			}
		}).catch((cliErr) => {
			logger.warn(`CLI control server start error (non-fatal): ${cliErr.message}`)
		})
	} catch (cliInitErr) {
		logger.warn(`CLI control server init error (non-fatal): ${cliInitErr.message}`)
	}

	logger.info(`New backend initialized with ${allRoutes.length} routes`)
	return _router
}

export function getBackendRouter() {
	return _router
}

export function shutdownBackend() {
	if (_router) {
		_router.unregister()
		_router = null
		stopUnrealHttpServer()
		try { shutdownCliControlService() } catch (_) {}
		logger.info('Backend shut down')
	}
}
