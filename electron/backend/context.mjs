import { getRepos } from '../localdb/index.mjs'
import { getLocalDb } from '../localdb/db.mjs'
import { getHttpClient } from './core/http-client.mjs'
import logger from './core/logger.mjs'
import {
	setProjectRoot,
	clearProjectRoot,
	validateProjectRoot,
	getProjectRootSnapshot,
	getProjectRootById,
	diagnoseDwebAsset,
	getAccessLogs
} from './projectAssetProtocol.mjs'

export function createContext(mainWindow, deps = {}) {
	const reposResult = (() => {
		try {
			return getRepos()
		} catch {
			return null
		}
	})()

	return {
		mainWindow,
		logger: deps.logger || logger,
		httpClient: deps.httpClient || getHttpClient(),
		pythonBridge: deps.pythonBridge || null,
		localdb: reposResult,
		db: (() => {
			try {
				return getLocalDb()
			} catch {
				return null
			}
		})(),
		protocol: {
			setProjectRoot,
			clearProjectRoot,
			validateProjectRoot,
			getProjectRootSnapshot,
			getProjectRootById,
			diagnoseDwebAsset,
			getAccessLogs
		}
	}
}
