import logger from '../../core/logger.mjs'
import { createTaskQueueService } from './service.mjs'
import { MeshyProvider } from './providers/meshyProvider.mjs'
import { Tripo3DProvider } from './providers/tripo3dProvider.mjs'
import { handlers } from './routes.mjs'
import { getRepos } from '../../../localdb/index.mjs'

let _initialized = false

function createGetApiKey(provider) {
	return () => {
		try {
			const repos = getRepos()
			if (!repos || !repos.apiKeys) return ''
			const result = repos.apiKeys.getPlaintext(provider)
			if (!result || !result.ok) return ''
			return String(result.plaintext || '').trim()
		} catch {
			return ''
		}
	}
}

export function initTaskQueue(mainWindow) {
	if (_initialized) {
		logger.warn('[TaskQueue] Already initialized, skipping')
		return null
	}

	logger.info('[TaskQueue] Initializing...')

	const svc = createTaskQueueService({ mainWindow })

	try {
		const meshyProvider = new MeshyProvider({
			getApiKey: createGetApiKey('meshy')
		})
		svc.registerProvider(meshyProvider)

		const tripo3dProvider = new Tripo3DProvider({
			getApiKey: createGetApiKey('tripo3d')
		})
		svc.registerProvider(tripo3dProvider)
	} catch (err) {
		logger.warn(`[TaskQueue] Failed to register some providers: ${err.message}`)
	}

	handlers.setTaskQueueService(svc)
	svc.restoreTasks()

	_initialized = true
	logger.info('[TaskQueue] Initialized successfully')
	return svc
}

export function shutdownTaskQueue(svc) {
	if (svc && typeof svc.shutdown === 'function') {
		svc.shutdown()
	}
	_initialized = false
}
