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
		const msg = String(e?.message || e)
		// --- ABI 版本不匹配（最常见错误） ---
		// 例如："was compiled against a different Node.js version using NODE_MODULE_VERSION 127.
		//       This version of Node.js requires NODE_MODULE_VERSION 119"
		if (msg.includes('NODE_MODULE_VERSION') || msg.includes('was compiled against a different') || msg.includes('NODE_MODULE')) {
			const runtimeAbi = String(process.versions?.modules || 'unknown')
			const expectedMatch = msg.match(/NODE_MODULE_VERSION\s+(\d+)/)
			const expectedAbi = expectedMatch ? expectedMatch[1] : 'unknown'
			const electronVer = String(process.versions?.electron || 'unknown')
			const nodeVer = String(process.versions?.node || process.version || 'unknown')
			const rebuildCmd = `npx --yes @electron/rebuild -f -v ${electronVer !== 'unknown' ? electronVer : '<你的Electron版本>'} -w better-sqlite3`
			throw new Error(
				`[localdb] better-sqlite3 原生模块 ABI 版本不匹配。\n` +
					`  当前运行时：Electron ${electronVer} / Node ${nodeVer} (需要 ABI ${runtimeAbi})\n` +
					`  模块编译时：ABI ${expectedAbi}\n` +
					`  请在项目根目录执行以下命令重编译：\n` +
					`    ${rebuildCmd}\n` +
					`  （备选：npm rebuild better-sqlite3 --runtime=electron --target=${electronVer !== 'unknown' ? electronVer : '<你的Electron版本>'} --disturl=https://electronjs.org/headers --build-from-source）\n` +
					`  原始错误：${msg}`,
			)
		}
		// --- 模块不存在 ---
		if (msg.includes("Cannot find module") || msg.includes("找不到模块")) {
			throw new Error(
				`[localdb] 缺少 better-sqlite3 原生模块（${msg}）。` +
					'请先在项目根执行 npm install better-sqlite3。',
			)
		}
		// --- 其他原生加载错误 ---
		if (msg.includes('DLOPEN_FAILED') || msg.toLowerCase().includes('dlopen') || msg.includes('.node') || msg.toLowerCase().includes('native')) {
			throw new Error(
				`[localdb] better-sqlite3 原生模块加载失败（${msg}）。` +
					'请执行：npx --yes @electron/rebuild -f -v ' +
					String(process.versions?.electron || '28.2.0') + ' -w better-sqlite3',
			)
		}
		// --- 通用兜底 ---
		throw new Error(
			`[localdb] 缺少 better-sqlite3 原生模块（${msg}）。` +
				'请先在项目根执行 npm install better-sqlite3，并在打包前运行 electron-rebuild。',
		)
	}
}

export function resolveLocalDbFilePath({ backendDataDir, userDataDir } = {}) {
	const raw = backendDataDir ?? userDataDir ?? ''
	const baseDir = String(raw).trim()
	if (!baseDir) {
		throw new Error('[localdb] resolveLocalDbFilePath: 所有目录参数均为空（backendDataDir/userDataDir）')
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
	const raw = typeof dbFilePath === 'string' ? dbFilePath.trim() : ''
	if (!raw) {
		throw new Error('[localdb] openLocalDb: 传入的 dbFilePath 为空字符串或非字符串')
	}
	const filePath = path.resolve(raw)
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
