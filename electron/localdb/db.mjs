import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let cachedInstance = null
let cachedPath = null

function safeRequireBetterSqlite3() {
	try {
		return require('better-sqlite3')
	} catch (e) {
		throw new Error(
			`[localdb] 缺少 better-sqlite3 原生模块（${String(e?.message || e)}）。` +
				'请先在项目根执行 npm install better-sqlite3，并在打包前运行 electron-rebuild。',
		)
	}
}

export function resolveLocalDbFilePath({ backendDataDir, userDataDir } = {}) {
	const baseDir = String(backendDataDir || userDataDir || '').trim()
	if (!baseDir) {
		throw new Error('[localdb] resolveLocalDbFilePath: 必须提供 backendDataDir 或 userDataDir')
	}
	return path.resolve(baseDir, 'localdb.sqlite3')
}

export function getLocalDbFilePath() {
	return cachedPath
}

function openDatabaseInstance(dbFilePath) {
	const Database = safeRequireBetterSqlite3()
	fs.mkdirSync(path.dirname(dbFilePath), { recursive: true })
	const db = new Database(dbFilePath)
	db.pragma('journal_mode = WAL')
	db.pragma('synchronous = NORMAL')
	db.pragma('foreign_keys = ON')
	return db
}

export function openLocalDb(dbFilePath) {
	const filePath = path.resolve(dbFilePath)
	if (cachedInstance && cachedPath === filePath) return cachedInstance
	cachedInstance = openDatabaseInstance(filePath)
	cachedPath = filePath
	return cachedInstance
}

export function closeLocalDb() {
	if (cachedInstance) {
		try {
			cachedInstance.close()
		} catch (_) {
			/* ignore */
		}
	}
	cachedInstance = null
	cachedPath = null
}

export function getLocalDb() {
	if (!cachedInstance) throw new Error('[localdb] 数据库尚未初始化，请先调用 initLocalDb(options)')
	return cachedInstance
}
