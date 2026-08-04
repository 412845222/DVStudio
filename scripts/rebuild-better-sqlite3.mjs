// 自动重建 better-sqlite3 以适配 Electron 运行时的 ABI 版本
// - npm install 的 postinstall 会自动触发
// - dev:electron / dev:electron:app 启动前也会再次触发
// 核心：better-sqlite3 的原生 .node 文件必须与 Electron 内置 Node 的 NODE_MODULE_VERSION 一致，
//      否则主进程里 require('better-sqlite3') 就会报 "was compiled against a different Node.js version..."。
//
// 性能优化：添加缓存机制，避免每次开发启动都启动 Electron 进程做 probe
import { execSync, spawnSync } from 'node:child_process'
import {
	existsSync,
	writeFileSync,
	mkdtempSync,
	rmSync,
	readdirSync,
	readFileSync,
	mkdirSync,
	statSync
} from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const IS_WIN = process.platform === 'win32'
const FAIL_ON_ERROR = process.env.DWEB_FAIL_ON_REBUILD_ERROR === '1'
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache')
const PROBE_CACHE_FILE = path.join(CACHE_DIR, 'dweb-bsqlite3-probe-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24小时缓存

function fail(reason) {
	console.error('[rebuild-better-sqlite3] 致命错误：' + reason)
	process.exit(FAIL_ON_ERROR ? 2 : 0)
}

function getFileHash(filePath) {
	try {
		const stat = statSync(filePath)
		return crypto
			.createHash('sha256')
			.update(String(stat.mtimeMs) + stat.size)
			.digest('hex')
	} catch {
		return null
	}
}

function getBetterSqlite3BinariesHash() {
	const binaries = enumerateBetterSqlite3Binaries()
	const hashes = binaries.map((f) => path.basename(f) + ':' + (getFileHash(f) || '0'))
	return crypto.createHash('sha256').update(hashes.join('|')).digest('hex')
}

function loadProbeCache() {
	try {
		if (!existsSync(PROBE_CACHE_FILE)) return null
		const raw = readFileSync(PROBE_CACHE_FILE, 'utf8')
		const cache = JSON.parse(raw)
		if (!cache || typeof cache !== 'object') return null
		if (!cache.electronVersion || !cache.binariesHash || !cache.timestamp) return null
		const age = Date.now() - Number(cache.timestamp || 0)
		if (age > CACHE_TTL_MS) return null
		return cache
	} catch {
		return null
	}
}

function saveProbeCache(electronVersion, binariesHash, ok) {
	try {
		mkdirSync(CACHE_DIR, { recursive: true })
		writeFileSync(
			PROBE_CACHE_FILE,
			JSON.stringify(
				{
					electronVersion,
					binariesHash,
					ok: !!ok,
					timestamp: Date.now(),
					nodeVersion: process.version,
					modulesVersion: process.versions.modules
				},
				null,
				2
			),
			'utf8'
		)
	} catch {
		// ignore cache write errors
	}
}

function quickAbiCheck(electronVersion) {
	try {
		const pkgPath = path.resolve(ROOT, 'node_modules', 'better-sqlite3', 'package.json')
		if (!existsSync(pkgPath)) return false
		const binaries = enumerateBetterSqlite3Binaries()
		if (binaries.length === 0) return false
		const bindingDir = path.dirname(binaries[0])
		const configPath = path.join(bindingDir, 'binding.gyp')
		if (!existsSync(configPath)) {
			const parentDir = path.dirname(bindingDir)
			const altConfig = path.join(parentDir, 'binding.gyp')
			if (!existsSync(altConfig)) return true
		}
		return true
	} catch {
		return false
	}
}

function readElectronVersion() {
	try {
		const pkg = JSON.parse(readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'))
		const devDeps = pkg.devDependencies || {}
		const deps = pkg.dependencies || {}
		const raw = devDeps.electron || deps.electron || ''
		if (!raw) return null
		const m = raw.match(/(\d+\.\d+\.\d+)/)
		return m ? m[1] : raw.replace(/[^\d.]/g, '')
	} catch {
		return null
	}
}

function enumerateBetterSqlite3Binaries() {
	const result = []
	const root = path.resolve(ROOT, 'node_modules', 'better-sqlite3')
	if (!existsSync(root)) return result
	const walk = (dir, depth) => {
		if (depth > 4) return
		let entries = []
		try {
			entries = readdirSync(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const ent of entries) {
			const full = path.resolve(dir, ent.name)
			if (ent.isDirectory()) walk(full, depth + 1)
			else if (ent.isFile() && ent.name.endsWith('.node')) result.push(full)
		}
	}
	walk(root, 0)
	return result
}

// ============== 权威 probe：直接在 Electron 进程里 require better-sqlite3 ==============
function probeInElectronProcess() {
	const probeDir = mkdtempSync(path.join(tmpdir(), 'dweb-bsqlite3-electron-probe-'))
	const probeScript = path.resolve(probeDir, '_probe_electron.cjs')
	const betterSqlite3Dir = path.resolve(ROOT, 'node_modules', 'better-sqlite3')
	const safeDir = betterSqlite3Dir.replace(/\\/g, '\\\\')
	writeFileSync(
		probeScript,
		[
			'try {',
			"  const Database = require('" + safeDir + "');",
			'  // 关键：better-sqlite3 在 require 时只返回构造函数；' +
				'  //      原生 .node 的真正加载发生在第一次 new Database(...) 时，' +
				'  //      必须显式触发以确保 Electron 运行时的 NODE_MODULE_VERSION 与原生二进制匹配。',
			"  const db = new Database(':memory:');",
			'  db.close();',
			"  process.stdout.write('DWEB_ELECTRON_PROBE_OK NODE_MODULE_VERSION=' + process.versions.modules + ' electron=' + process.versions.electron + '\\n');",
			'} catch (e) {',
			"  process.stdout.write('DWEB_ELECTRON_PROBE_ERR NODE_MODULE_VERSION=' + process.versions.modules + ' electron=' + process.versions.electron + '\\n');",
			"  process.stdout.write('DWEB_ELECTRON_PROBE_ERR msg=' + e.message + '\\n');",
			'}',
			'process.exit(0);'
		].join('\n'),
		'utf-8'
	)

	try {
		// Windows 下优先用 node_modules/.bin/electron.cmd；其他平台走对应 shim；都没有就用 npx
		// 注意：spawnSync 用数组形式 + shell:true 最稳健，避免 PowerShell/cmd 引号混用问题
		const winShim = path.resolve(ROOT, 'node_modules', '.bin', 'electron.cmd')
		const nixShim = path.resolve(ROOT, 'node_modules', '.bin', 'electron')
		const hasWinShim = IS_WIN && existsSync(winShim)
		const hasNixShim = !IS_WIN && existsSync(nixShim)

		let res
		if (hasWinShim || hasNixShim) {
			res = spawnSync(hasWinShim ? winShim : nixShim, [probeScript], {
				cwd: ROOT,
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 90 * 1000,
				encoding: 'utf-8',
				windowsHide: true,
				shell: IS_WIN
			})
		} else {
			// 作为最后的退路：用 npx 直接跑 electron
			res = spawnSync(
				process.platform === 'win32' ? 'npx.cmd' : 'npx',
				['--no-install', 'electron', probeScript],
				{
					cwd: ROOT,
					stdio: ['ignore', 'pipe', 'pipe'],
					timeout: 120 * 1000,
					encoding: 'utf-8',
					windowsHide: true,
					shell: true
				}
			)
		}
		const combined = String(res.stdout || '') + '\n' + String(res.stderr || '')
		if (combined.includes('DWEB_ELECTRON_PROBE_OK'))
			return { ok: true, raw: combined.slice(0, 400) }
		return { ok: false, raw: combined.slice(0, 800) }
	} catch (e) {
		return { ok: false, error: String(e?.message || e) }
	} finally {
		try {
			rmSync(probeDir, { recursive: true, force: true })
		} catch {
			/* ignore */
		}
	}
}

// ============== 实际重建 ==============
function tryElectronRebuild(electronVersion) {
	// 优先：@electron/rebuild（需要本机有能编译 C++ 的工具链：Windows 上一般需要 VS Build Tools + Python）
	const cmd1 = [
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		'--yes',
		'@electron/rebuild',
		'-f',
		'-v',
		electronVersion,
		'-w',
		'better-sqlite3',
		'--only',
		'better-sqlite3'
	].join(' ')
	console.log('[rebuild-better-sqlite3] 执行 @electron/rebuild：' + cmd1)
	try {
		execSync(cmd1, { stdio: 'inherit', cwd: ROOT })
		return true
	} catch (err) {
		console.warn('[rebuild-better-sqlite3] @electron/rebuild 失败：' + String(err?.message || err))
	}

	// 退路：node-gyp rebuild 明确指定 electron 运行时
	const cmd2 =
		'npm rebuild better-sqlite3 --runtime=electron --target=' +
		electronVersion +
		' --disturl=https://electronjs.org/headers --build-from-source'
	console.log('[rebuild-better-sqlite3] 回退到 npm rebuild：' + cmd2)
	try {
		execSync(cmd2, { stdio: 'inherit', cwd: ROOT })
		return true
	} catch (err) {
		console.warn('[rebuild-better-sqlite3] npm rebuild 失败：' + String(err?.message || err))
	}

	return false
}

// ============== 主流程 ==============
const electronVersion = readElectronVersion()
if (!electronVersion) {
	console.log('[rebuild-better-sqlite3] 未在 package.json 中找到 electron 依赖，跳过')
	process.exit(0)
}

console.log(
	'[rebuild-better-sqlite3] target: Electron=' +
		electronVersion +
		' (runtime=' +
		process.platform +
		' node=' +
		process.version +
		' modules=' +
		process.versions.modules +
		')'
)

// Step 1: 若 better-sqlite3 尚未安装，则直接走一次 @electron/rebuild 做首次编译
const pkgPath = path.resolve(ROOT, 'node_modules', 'better-sqlite3', 'package.json')
if (!existsSync(pkgPath)) {
	console.log('[rebuild-better-sqlite3] node_modules/better-sqlite3 不存在，开始首次编译...')
	const ok = tryElectronRebuild(electronVersion)
	if (!ok)
		fail('better-sqlite3 未安装，且首次重建失败。请检查本机是否已安装 VS Build Tools + Python。')
	process.exit(0)
}

// Step 2: 快速检查 + 缓存验证（避免每次都启动 Electron 进程）
const currentBinariesHash = getBetterSqlite3BinariesHash()
const cachedResult = loadProbeCache()
const quickOk = quickAbiCheck(electronVersion)

let electronProbe = null
let usedCache = false

if (
	quickOk &&
	cachedResult &&
	cachedResult.ok &&
	cachedResult.electronVersion === electronVersion &&
	cachedResult.binariesHash === currentBinariesHash
) {
	console.log('[rebuild-better-sqlite3] 缓存命中：better-sqlite3 已验证兼容，跳过 Electron probe')
	electronProbe = { ok: true, fromCache: true }
	usedCache = true
} else {
	// 缓存未命中或快速检查失败：执行权威 probe
	if (cachedResult) {
		console.log('[rebuild-better-sqlite3] 缓存未命中（版本或二进制变化），启动 Electron probe...')
	} else {
		console.log('[rebuild-better-sqlite3] 启动 Electron probe...')
	}
	electronProbe = probeInElectronProcess()
	console.log('[rebuild-better-sqlite3] electron-probe: ' + JSON.stringify(electronProbe))
	saveProbeCache(electronVersion, currentBinariesHash, electronProbe.ok)
}

if (electronProbe.ok) {
	if (usedCache) {
		console.log(
			'[rebuild-better-sqlite3] better-sqlite3 已与 Electron ' +
				electronVersion +
				' 兼容（来自缓存）。'
		)
	} else {
		console.log(
			'[rebuild-better-sqlite3] better-sqlite3 已与 Electron ' +
				electronVersion +
				' 兼容，跳过重建。'
		)
	}
	process.exit(0)
}

// Step 3: 需要重建
console.log(
	'[rebuild-better-sqlite3] 需要重建（当前二进制与 Electron ABI 不兼容）。开始针对 Electron ' +
		electronVersion +
		' 重建...'
)
const rebuiltOk = tryElectronRebuild(electronVersion)

// Step 4: 重建后再次权威 probe 验证
if (rebuiltOk) {
	const after = probeInElectronProcess()
	if (after.ok) {
		console.log(
			'[rebuild-better-sqlite3] 重建后 Electron probe 通过 ✅ (current binaries: ' +
				JSON.stringify(enumerateBetterSqlite3Binaries()) +
				')'
		)
		const newBinariesHash = getBetterSqlite3BinariesHash()
		saveProbeCache(electronVersion, newBinariesHash, true)
		process.exit(0)
	}
	console.warn(
		'[rebuild-better-sqlite3] 警告：重建后 Electron probe 仍未通过：' + (after.raw || after.error)
	)
}

// Step 5: 致命失败
fail(
	'无法为 Electron ' +
		electronVersion +
		' 生成可用的 better-sqlite3 原生二进制。\n' +
		'  请手动执行（任选其一）：\n' +
		'    npx --yes @electron/rebuild -f -v ' +
		electronVersion +
		' -w better-sqlite3\n' +
		'    npm rebuild better-sqlite3 --runtime=electron --target=' +
		electronVersion +
		' --disturl=https://electronjs.org/headers --build-from-source\n' +
		'  如果仍失败，请确认本机已安装：\n' +
		'    Windows: Visual Studio Build Tools (含 Desktop development with C++) + Python 3.x\n' +
		'    macOS: Xcode Command Line Tools (xcode-select --install)\n' +
		'    Linux: build-essential + python3'
)
