/**
 * DVStudio 导演控制台 DSH 插件同步脚本
 *
 * 将插件源码同步到 DSH 仓库的 workspace 位置，
 * 并在 DSH profile (~/.dsh/profiles/web/) 注册插件。
 *
 * 用法：
 *   node sync.mjs --src <dir> --dest <dshRepoRoot>
 *
 * 参数：
 *   --src   源插件目录（默认：<脚本所在目录>/dvstudio-director）
 *   --dest  DSH 仓库根目录
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const srcIdx = process.argv.indexOf('--src')
const destIdx = process.argv.indexOf('--dest')
const SRC_DIR =
	srcIdx >= 0
		? path.resolve(process.argv[srcIdx + 1])
		: path.resolve(__dirname, 'dvstudio-director')
const destRoot = destIdx >= 0 ? process.argv[destIdx + 1] : process.env.HARNESS_ROOT
// DSH pnpm-workspace.yaml 的 glob 是 packages/*/*
const DEST_DIR = path.join(destRoot, 'packages', 'dvstudio-director', 'dvstudio-director')
// DSH profile 目录
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', 'web')

const INCLUDE_PATTERNS = [
	/\.ts$/i,
	/\.mjs$/i,
	/\.js$/i,
	/\.cjs$/i,
	/\.json$/i,
	/\.yml$/i,
	/\.yaml$/i,
	/\.md$/i
]
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage'])

async function ensureDir(p) {
	await fs.mkdir(p, { recursive: true })
}

async function syncDir(src, dest) {
	const entries = await fs.readdir(src, { withFileTypes: true })
	for (const ent of entries) {
		const s = path.join(src, ent.name)
		const d = path.join(dest, ent.name)
		if (ent.isDirectory()) {
			if (EXCLUDE_DIRS.has(ent.name)) continue
			await syncDir(s, d)
		} else if (ent.isFile()) {
			if (!INCLUDE_PATTERNS.some((re) => re.test(ent.name))) continue
			await ensureDir(path.dirname(d))
			await fs.copyFile(s, d)
			console.log(`[sync] ${path.relative(SRC_DIR, s)} -> ${path.relative(DEST_DIR, d)}`)
		}
	}
}

async function patchRootPackageJson() {
	const pkgPath = path.join(destRoot, 'package.json')
	const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
	if (!pkg.dependencies || typeof pkg.dependencies !== 'object') pkg.dependencies = {}
	const key = '@dvstudio/director-plugin'
	if (pkg.dependencies[key] !== 'workspace:*') {
		pkg.dependencies[key] = 'workspace:*'
		await fs.writeFile(pkgPath, JSON.stringify(pkg, null, '\t') + '\n', 'utf8')
		console.log(`[sync] patched root package.json (added ${key} → workspace:*)`)
	} else {
		console.log(`[sync] root package.json already declares ${key}`)
	}
}

async function cleanupOldMcpConfig() {
	// 清理 DSH 仓库根目录的旧 MCP 桥接配置
	const cfgPath = path.join(destRoot, 'cordis.patch.yml')

	let content = ''
	try {
		content = await fs.readFile(cfgPath, 'utf8')
	} catch {
		return
	}

	const lines = content.split('\n')
	const filtered = []
	let inMcpBlock = false
	let changed = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]

		if (line.trim().startsWith('# >>>')) {
			inMcpBlock = true
			changed = true
			continue
		}
		if (line.trim().startsWith('# <<<')) {
			inMcpBlock = false
			changed = true
			continue
		}
		if (inMcpBlock) {
			changed = true
			continue
		}
		if (line.includes('dsh-mcp-client')) {
			changed = true
			while (
				i + 1 < lines.length &&
				/^\s+/.test(lines[i + 1]) &&
				!lines[i + 1].trim().startsWith('-') &&
				!lines[i + 1].trim().startsWith('#')
			) {
				i++
			}
			continue
		}
		if (line.includes('自动生成，请勿手动修改')) {
			changed = true
			continue
		}
		filtered.push(line)
	}

	if (changed) {
		const cleaned = filtered.join('\n').trim()
		await fs.writeFile(cfgPath, cleaned + '\n', 'utf8')
		console.log(`[sync] cleaned old MCP config from ${path.relative(destRoot, cfgPath)}`)
	}
}

async function patchProfilePackageJson() {
	// 在 DSH profile (~/.dsh/profiles/web/) 的 package.json 中注册插件
	const pkgPath = path.join(PROFILE_DIR, 'package.json')
	let pkg = {}
	try {
		let content = await fs.readFile(pkgPath, 'utf8')
		// 去除 BOM
		if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
		pkg = JSON.parse(content)
	} catch (e) {
		console.error(`[sync] DSH profile package.json 读取失败: ${pkgPath}`, e.message)
		return
	}

	let changed = false

	// 1. 添加 link: 依赖
	if (!pkg.dependencies || typeof pkg.dependencies !== 'object') pkg.dependencies = {}
	const depKey = '@dvstudio/director-plugin'
	const depValue = `link:${DEST_DIR.replace(/\\/g, '/')}`
	if (pkg.dependencies[depKey] !== depValue) {
		pkg.dependencies[depKey] = depValue
		changed = true
		console.log(`[sync] added ${depKey} → ${depValue} to profile dependencies`)
	}

	// 2. 添加到 dsh.profile.bundles
	if (!pkg.dsh) pkg.dsh = {}
	if (!pkg.dsh.profile) pkg.dsh.profile = {}
	if (!Array.isArray(pkg.dsh.profile.bundles)) pkg.dsh.profile.bundles = []
	const bundles = pkg.dsh.profile.bundles
	if (!bundles.includes(depKey)) {
		bundles.push(depKey)
		changed = true
		console.log(`[sync] added ${depKey} to dsh.profile.bundles`)
	}

	// 3. 清理旧 MCP 桥接依赖
	if (pkg.dependencies['@deepseek-ai/dsh-mcp-client']) {
		delete pkg.dependencies['@deepseek-ai/dsh-mcp-client']
		changed = true
		console.log(`[sync] removed old @deepseek-ai/dsh-mcp-client from profile dependencies`)
	}
	const mcpIdx = bundles.indexOf('@deepseek-ai/dsh-mcp-client')
	if (mcpIdx >= 0) {
		bundles.splice(mcpIdx, 1)
		changed = true
		console.log(`[sync] removed @deepseek-ai/dsh-mcp-client from bundles`)
	}

	if (changed) {
		await fs.writeFile(pkgPath, JSON.stringify(pkg, null, '\t') + '\n', 'utf8')
		console.log(`[sync] patched profile package.json`)
	} else {
		console.log(`[sync] profile package.json already up to date`)
	}
}

async function runPnpmInstall() {
	const { spawn } = await import('child_process')

	// 1. DSH 仓库根目录 pnpm install（workspace 链接）
	console.log('[sync] running pnpm install in DSH repo root...')
	await runPnpm(destRoot)

	// 2. DSH profile 目录 pnpm install（link: 依赖）
	console.log('[sync] running pnpm install in DSH profile dir...')
	await runPnpm(PROFILE_DIR)
}

async function runPnpm(cwd) {
	const { spawn } = await import('child_process')
	const child = spawn('pnpm', ['install', '--no-frozen-lockfile'], {
		cwd,
		shell: process.platform === 'win32',
		stdio: ['pipe', 'pipe', 'pipe']
	})
	const stderrChunks = []
	child.stdout.on('data', (d) => {
		const text = d.toString()
		text.split('\n').forEach((line) => {
			if (
				line.includes('dvstudio') ||
				line.includes('director') ||
				line.includes('Done') ||
				line.includes('ERR')
			) {
				console.log('[pnpm]', line.trim())
			}
		})
	})
	child.stderr.on('data', (d) => {
		stderrChunks.push(d.toString())
	})
	const exitCode = await new Promise((resolve) => {
		child.on('close', resolve)
	})
	if (exitCode !== 0) {
		console.error(`[sync] pnpm install failed in ${cwd} (exit ${exitCode})`)
		console.error(stderrChunks.join(''))
	} else {
		console.log(`[sync] pnpm install completed in ${cwd}`)
	}
}

async function syncAll() {
	console.log(`[dvstudio-sync] ${SRC_DIR} -> ${DEST_DIR}`)
	console.log(`[dvstudio-sync] DSH profile: ${PROFILE_DIR}`)
	try {
		await fs.access(SRC_DIR)
	} catch {
		console.error(`[dvstudio-sync] 源目录不存在: ${SRC_DIR}`)
		process.exit(1)
	}
	if (!destRoot) {
		console.error(`[dvstudio-sync] 未指定宿主根目录：请用 --dest <root>`)
		process.exit(1)
	}

	// 1. 同步插件源码到 DSH 仓库 workspace
	await ensureDir(DEST_DIR)
	await syncDir(SRC_DIR, DEST_DIR)

	// 2. patch DSH 仓库根 package.json
	await patchRootPackageJson()

	// 3. 清理旧 MCP 桥接配置
	await cleanupOldMcpConfig()

	// 4. patch DSH profile package.json（注册插件到 bundles + link: 依赖）
	await patchProfilePackageJson()

	// 5. pnpm install（仓库根 + profile 目录）
	await runPnpmInstall()

	console.log(`[dvstudio-sync] done at ${new Date().toISOString()}`)
}

await syncAll().catch((e) => {
	console.error(e)
	process.exit(1)
})
