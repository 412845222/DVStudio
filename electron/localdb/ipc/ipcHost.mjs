import { getRepos } from '../index.mjs'

function safe(handler) {
	return async (_e, payload) => {
		try {
			const result = await handler(payload || {})
			if (result && typeof result === 'object' && 'ok' in result) return result
			return { ok: true, value: result }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}
}

export function registerLocalDbIpc(ipcMain) {
	const handlers = {
		// ---- projects ----
		'dweb:localdb:projects:list':
			safe(() => getRepos().projects.list()),
		'dweb:localdb:projects:get':
			safe((payload) => getRepos().projects.getById(payload?.id)),
		'dweb:localdb:projects:save':
			safe((payload) => getRepos().projects.saveProject({
				name: payload?.name,
				snapshot: payload?.snapshot,
				projectId: payload?.projectId,
			})),
		'dweb:localdb:projects:load':
			safe((payload) => getRepos().projects.loadProject(payload?.id)),
		'dweb:localdb:projects:delete':
			safe((payload) => getRepos().projects.deleteProject(payload?.id)),
		'dweb:localdb:projects:openFolder':
			safe((payload) => getRepos().projects.openProjectFolder({
				rootPath: payload?.rootPath,
				name: payload?.name,
				create: payload?.create,
			})),
		// ---- meshy tasks ----
		'dweb:localdb:meshy:list':
			safe((payload) => getRepos().meshyTasks.list({
				projectId: payload?.projectId,
				limit: payload?.limit,
			})),
		'dweb:localdb:meshy:get':
			safe((payload) => getRepos().meshyTasks.getByTaskId(payload?.taskId)),
		'dweb:localdb:meshy:upsert':
			safe((payload) => getRepos().meshyTasks.upsert(payload)),
		'dweb:localdb:meshy:remove':
			safe((payload) => getRepos().meshyTasks.remove(payload?.taskId)),
		// ---- video tasks ----
		'dweb:localdb:video:list':
			safe((payload) => getRepos().videoTasks.list({
				projectId: payload?.projectId,
				limit: payload?.limit,
			})),
		'dweb:localdb:video:get':
			safe((payload) => getRepos().videoTasks.getByRemoteTaskId(payload?.remoteTaskId)),
		'dweb:localdb:video:upsert':
			safe((payload) => getRepos().videoTasks.upsert(payload)),
		'dweb:localdb:video:remove':
			safe((payload) => getRepos().videoTasks.remove(payload?.remoteTaskId)),
		// ---- api keys ----
		'dweb:localdb:apiKeys:list':
			safe(() => getRepos().apiKeys.list()),
		'dweb:localdb:apiKeys:get':
			safe((payload) => getRepos().apiKeys.get(payload?.provider)),
		'dweb:localdb:apiKeys:set':
			safe((payload) => getRepos().apiKeys.setPlaintext(payload?.provider, payload?.plaintext)),
		'dweb:localdb:apiKeys:getPlaintext':
			safe((payload) => getRepos().apiKeys.getPlaintext(payload?.provider)),
		'dweb:localdb:apiKeys:remove':
			safe((payload) => getRepos().apiKeys.remove(payload?.provider)),
	}

	for (const [channel, handler] of Object.entries(handlers)) {
		ipcMain.handle(channel, handler)
	}
	return { channels: Object.keys(handlers) }
}
