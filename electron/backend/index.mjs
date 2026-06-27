import { createRouter } from './router.mjs'
import { createContext } from './context.mjs'
import logger from './core/logger.mjs'
import { routes as systemRoutes } from './modules/system/routes.mjs'
import { routes as projectsRoutes } from './modules/projects/routes.mjs'
import { routes as projectAssetsRoutes } from './modules/project-assets/routes.mjs'
import { routes as meshyRoutes } from './modules/meshy/routes.mjs'
import { routes as seedanceRoutes } from './modules/seedance/routes.mjs'
import { routes as editorRoutes } from './modules/editor/routes.mjs'
import { routes as chatRoutes } from './modules/chat/routes.mjs'
import { routes as exportRoutes } from './modules/export/routes.mjs'
import { routes as comfyuiRoutes } from './modules/comfyui/routes.mjs'
import { routes as thirdPartyRoutes } from './modules/third-party/routes.mjs'
import { routes as agentSkillsRoutes } from './modules/agent-skills/routes.mjs'
import { routes as codexRoutes } from './modules/codex/routes.mjs'
import { routes as subtitleRoutes } from './modules/subtitle/routes.mjs'
import { startUnrealHttpServer, stopUnrealHttpServer } from './modules/agent-skills/service.mjs'
import { setProjectRoot } from './projectAssetProtocol.mjs'
import { getRepos } from '../localdb/index.mjs'

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
    ...seedanceRoutes,
    ...editorRoutes,
    ...chatRoutes,
    ...exportRoutes,
    ...comfyuiRoutes,
    ...thirdPartyRoutes,
    ...agentSkillsRoutes,
    ...codexRoutes,
    ...subtitleRoutes,
  ]

  _router = createRouter({
    routes: allRoutes,
    contextFactory: () => createContext(mainWindow, deps),
    mainWindow,
  })

  _router.register()

  restoreProjectRoots()

  startUnrealHttpServer().then(result => {
    if (result.ok) {
      logger.info(`Unreal HTTP server listening on port ${result.port}`)
    } else {
      logger.warn(`Failed to start Unreal HTTP server: ${result.error}`)
    }
  })

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
    logger.info('Backend shut down')
  }
}
