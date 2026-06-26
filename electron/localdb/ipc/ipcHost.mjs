import { getRepos, getReposSafe, ensureLocalDbInitialized } from '../index.mjs'
import os from 'node:os'

let _initOptions = {}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ backendDataDir?: string, userDataDir?: string, appSecret?: string }} initOptions
 */
export function registerLocalDbIpc(ipcMain, initOptions = {}) {
	const tmpDir = os.tmpdir()
	const backendDir = String(initOptions?.backendDataDir || '').trim()
	const userDir = String(initOptions?.userDataDir || '').trim()
	_initOptions = {
		backendDataDir: backendDir || userDir || tmpDir,
		userDataDir: userDir || backendDir || tmpDir,
		appSecret: initOptions?.appSecret || backendDir || userDir || 'localdb'
	}

	function safe(handler) {
		return async (_e, payload) => {
			try {
				const repoStatus = getReposSafe()
				if (!repoStatus.ok) {
					// 确保 _initOptions 至少包含有效路径，绝不传给 ensureLocalDbInitialized 一个空对象
					const opts = {
						backendDataDir: _initOptions.backendDataDir || os.tmpdir(),
						userDataDir: _initOptions.userDataDir || os.tmpdir(),
						appSecret: _initOptions.appSecret || 'localdb'
					}
					const retry = ensureLocalDbInitialized(opts)
					if (!retry.ok)
						return { ok: false, error: `${repoStatus.error}（重试后：${retry.error}）` }
				}
				const result = await handler(payload || {})
				if (result && typeof result === 'object' && 'ok' in result) return result
				return { ok: true, value: result }
			} catch (err) {
				return { ok: false, error: String(err?.message || err) }
			}
		}
	}
	const handlers = {
		// ---- status / init ----
		'dweb:localdb:getInitState': safe(() => {
			const r = getReposSafe()
			if (!r.ok) return { ok: false, error: r.error }
			return {
				ok: true,
				dbFilePath: r.repos.dbFilePath,
				schemaInfo: r.repos.schemaInfo,
				tag: r.repos.tag || ''
			}
		}),
		'dweb:localdb:ensureInitialized': safe((payload) => ensureLocalDbInitialized(payload || {})),
		// ---- projects ----
		'dweb:localdb:projects:list': safe(() => getRepos().projects.list()),
		'dweb:localdb:projects:get': safe((payload) => getRepos().projects.getById(payload?.id)),
		'dweb:localdb:projects:save': safe((payload) =>
			getRepos().projects.saveProject({
				name: payload?.name,
				snapshot: payload?.snapshot,
				projectId: payload?.projectId
			})
		),
		'dweb:localdb:projects:load': safe((payload) => getRepos().projects.loadProject(payload?.id)),
		'dweb:localdb:projects:delete': safe((payload) =>
			getRepos().projects.deleteProject(payload?.id)
		),
		'dweb:localdb:projects:openFolder': safe((payload) =>
			getRepos().projects.openProjectFolder({
				rootPath: payload?.rootPath,
				name: payload?.name,
				create: payload?.create
			})
		),
		// ---- meshy tasks ----
		'dweb:localdb:meshy:list': safe((payload) =>
			getRepos().meshyTasks.list({
				projectId: payload?.projectId,
				limit: payload?.limit
			})
		),
		'dweb:localdb:meshy:get': safe((payload) => getRepos().meshyTasks.getByTaskId(payload?.taskId)),
		'dweb:localdb:meshy:upsert': safe((payload) => getRepos().meshyTasks.upsert(payload)),
		'dweb:localdb:meshy:remove': safe((payload) => getRepos().meshyTasks.remove(payload?.taskId)),
		// ---- video tasks ----
		'dweb:localdb:video:list': safe((payload) =>
			getRepos().videoTasks.list({
				projectId: payload?.projectId,
				limit: payload?.limit
			})
		),
		'dweb:localdb:video:get': safe((payload) =>
			getRepos().videoTasks.getByRemoteTaskId(payload?.remoteTaskId)
		),
		'dweb:localdb:video:upsert': safe((payload) => getRepos().videoTasks.upsert(payload)),
		'dweb:localdb:video:remove': safe((payload) =>
			getRepos().videoTasks.remove(payload?.remoteTaskId)
		),
		// ---- api keys ----
		'dweb:localdb:apiKeys:list': safe(() => getRepos().apiKeys.list()),
		'dweb:localdb:apiKeys:get': safe((payload) => getRepos().apiKeys.get(payload?.provider)),
		'dweb:localdb:apiKeys:set': safe((payload) =>
			getRepos().apiKeys.setPlaintext(payload?.provider, payload?.plaintext)
		),
		'dweb:localdb:apiKeys:getPlaintext': safe((payload) =>
			getRepos().apiKeys.getPlaintext(payload?.provider)
		),
		'dweb:localdb:apiKeys:remove': safe((payload) => getRepos().apiKeys.remove(payload?.provider))
	}

	for (const [channel, handler] of Object.entries(handlers)) {
		ipcMain.handle(channel, handler)
	}
	return { channels: Object.keys(handlers) }
}
