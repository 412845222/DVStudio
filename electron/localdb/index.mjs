import { closeLocalDb, getLocalDb, getLocalDbFilePath, openLocalDb, resolveLocalDbFilePath } from './db.mjs'
import { ensureLocalDbSchema } from './migrations.mjs'
import { createProjectsRepo } from './repos/projects.mjs'
import { createMeshyTasksRepo } from './repos/meshyTasks.mjs'
import { createVideoTasksRepo } from './repos/videoTasks.mjs'
import { createApiKeysRepo } from './repos/apiKeys.mjs'

let reposSnapshot = null

export function initLocalDb({ backendDataDir, userDataDir, appSecret } = {}) {
	const dbFilePath = resolveLocalDbFilePath({ backendDataDir, userDataDir })
	openLocalDb(dbFilePath)
	const schemaInfo = ensureLocalDbSchema()
	const projects = createProjectsRepo({ backendDataDir: backendDataDir || userDataDir })
	const meshyTasks = createMeshyTasksRepo()
	const videoTasks = createVideoTasksRepo()
	const apiKeys = createApiKeysRepo({ appSecret: appSecret || backendDataDir || userDataDir || 'localdb' })
	reposSnapshot = { projects, meshyTasks, videoTasks, apiKeys, dbFilePath, schemaInfo }
	return reposSnapshot
}

export function getRepos() {
	if (!reposSnapshot) throw new Error('[localdb] 尚未初始化，请先调用 initLocalDb')
	return reposSnapshot
}

export { getLocalDb, closeLocalDb, getLocalDbFilePath, resolveLocalDbFilePath }
