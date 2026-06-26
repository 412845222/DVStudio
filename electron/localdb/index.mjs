import {
	closeLocalDb,
	getLocalDb,
	getLocalDbFilePath,
	openLocalDb,
	resolveLocalDbFilePath
} from './db.mjs'
import { ensureLocalDbSchema } from './migrations.mjs'
import { createProjectsRepo } from './repos/projects.mjs'
import { createMeshyTasksRepo } from './repos/meshyTasks.mjs'
import { createVideoTasksRepo } from './repos/videoTasks.mjs'
import { createApiKeysRepo } from './repos/apiKeys.mjs'
import fs from 'node:fs'
import nodePath from 'node:path'
import os from 'node:os'

let reposSnapshot = null
let lastInitError = null

export function getLocalDbInitError() {
	return lastInitError
}

function computeSafeBaseDir(preferredDir) {
	if (typeof preferredDir === 'string' && preferredDir.trim().length > 0) {
		return preferredDir.trim()
	}
	try {
		const td = os.tmpdir()
		if (typeof td === 'string' && td.trim().length > 0) return td.trim()
	} catch {}
	try {
		const cwd = process.cwd()
		if (typeof cwd === 'string' && cwd.trim().length > 0) return cwd.trim()
	} catch {}
	return ''
}

function tryInitOnce(dbFilePath, baseDir, appSecret, tag) {
	try {
		closeLocalDb()
		fs.mkdirSync(nodePath.dirname(dbFilePath), { recursive: true })
		openLocalDb(dbFilePath)
		const schemaInfo = ensureLocalDbSchema()
		const projects = createProjectsRepo({ backendDataDir: baseDir })
		const meshyTasks = createMeshyTasksRepo()
		const videoTasks = createVideoTasksRepo()
		const apiKeys = createApiKeysRepo({ appSecret: appSecret || baseDir || 'localdb' })
		reposSnapshot = { projects, meshyTasks, videoTasks, apiKeys, dbFilePath, schemaInfo, tag }
		lastInitError = null
		return { ok: true, tag, dbFilePath, schemaInfo }
	} catch (err) {
		lastInitError = String(err?.message || err)
		return { ok: false, error: lastInitError, tag }
	}
}

export function initLocalDb({ backendDataDir, userDataDir, appSecret } = {}) {
	// 构造候选路径：优先 backendDataDir → userDataDir → tmpdir → cwd
	// 确保所有路径都是非空字符串，避免 path.resolve(undefined)
	const backendDir = computeSafeBaseDir(backendDataDir)
	const userDir = computeSafeBaseDir(userDataDir)
	const tmpDir = computeSafeBaseDir(undefined)
	const secret = appSecret || backendDir || userDir || 'localdb'

	const candidates = []
	if (backendDir)
		candidates.push({
			dbFilePath: resolveLocalDbFilePath({
				backendDataDir: backendDir,
				userDataDir: userDir || backendDir
			}),
			baseDir: backendDir,
			appSecret: secret,
			tag: 'backend'
		})
	if (userDir && userDir !== backendDir)
		candidates.push({
			dbFilePath: nodePath.resolve(userDir, 'localdb.sqlite3'),
			baseDir: userDir,
			appSecret: secret,
			tag: 'userData'
		})
	if (tmpDir && tmpDir !== backendDir && tmpDir !== userDir)
		candidates.push({
			dbFilePath: nodePath.resolve(tmpDir, 'dweb-localdb.sqlite3'),
			baseDir: tmpDir,
			appSecret: secret,
			tag: 'tmpdir'
		})
	if (candidates.length === 0) {
		const lastResort = nodePath.resolve(
			nodePath.resolve(os.homedir ? os.homedir() : os.tmpdir(), '.dweb'),
			'localdb.sqlite3'
		)
		candidates.push({
			dbFilePath: lastResort,
			baseDir: nodePath.dirname(lastResort),
			appSecret: secret,
			tag: 'homedir'
		})
	}

	let firstErr = null
	for (const c of candidates) {
		const result = tryInitOnce(c.dbFilePath, c.baseDir, c.appSecret, c.tag)
		if (result.ok) return result
		if (!firstErr) firstErr = result.error
	}
	lastInitError = firstErr || 'initLocalDb: 所有候选路径均初始化失败'
	throw new Error(lastInitError)
}

export function ensureLocalDbInitialized(options = {}) {
	if (reposSnapshot) return { ok: true, alreadyInitialized: true, repos: reposSnapshot }
	try {
		const initResult = initLocalDb({
			backendDataDir: options?.backendDataDir,
			userDataDir: options?.userDataDir,
			appSecret: options?.appSecret
		})
		return { ok: true, alreadyInitialized: false, repos: reposSnapshot, init: initResult }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export function getRepos() {
	if (!reposSnapshot) throw new Error('[localdb]尚未初始化，请先调用initLocalDb')
	return reposSnapshot
}

export function getReposSafe() {
	if (!reposSnapshot)
		return { ok: false, error: lastInitError || '[localdb]尚未初始化，请先调用initLocalDb' }
	return { ok: true, repos: reposSnapshot }
}

export function resetLocalDbForTesting() {
	try {
		closeLocalDb()
	} catch {
		/* ignore */
	}
	reposSnapshot = null
	lastInitError = null
}

export { getLocalDb, closeLocalDb, getLocalDbFilePath, resolveLocalDbFilePath }
