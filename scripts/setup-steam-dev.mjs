/**
 * Steam 联调辅助脚本
 *
 * 用法：node scripts/setup-steam-dev.mjs
 *
 * 功能：
 *   1. 在上级目录、当前目录、环境变量 DWEB_STEAMJS_PATH 中查找本地编译好的 DwebSteamJS
 *   2. 通过 npm link 将其链接到本项目，使主进程可以 require('dweb-steamjs')
 *   3. 如果找不到，输出引导信息
 *
 * 无需Steam联调时不需要运行此脚本，应用自动使用Mock平台。
 */
import { execSync } from 'child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const candidates = [
	path.resolve(REPO_ROOT, '..', 'DwebSteamJS'),
	path.resolve(REPO_ROOT, 'DwebSteamJS'),
	process.env.DWEB_STEAMJS_PATH,
].filter(Boolean)

function findDwebSteamJS() {
	for (const dir of candidates) {
		if (!dir) continue
		const pkg = path.join(dir, 'package.json')
		if (fs.existsSync(pkg)) {
			try {
				const json = JSON.parse(fs.readFileSync(pkg, 'utf8'))
				if (json.name === 'dweb-steamjs') return dir
			} catch { /* ignore */ }
		}
	}
	return null
}

console.log('[setup-steam-dev] Looking for local dweb-steamjs...')
const steamjsDir = findDwebSteamJS()

if (!steamjsDir) {
	console.log('')
	console.log('[setup-steam-dev] dweb-steamjs not found locally.')
	console.log('')
	console.log('Without dweb-steamjs the app runs in Mock mode (fully functional).')
	console.log('')
	console.log('To enable Steam integration:')
	console.log('  1. Clone DwebSteamJS repository to a sibling directory of DVStudio:')
	console.log('       cd ..')
	console.log('       git clone <DwebSteamJS-repo-url> DwebSteamJS')
	console.log('  2. Build DwebSteamJS following its README')
	console.log('  3. Run this script again')
	console.log('')
	console.log('Or set DWEB_STEAMJS_PATH environment variable to its location.')
	process.exit(0)
}

console.log(`[setup-steam-dev] Found dweb-steamjs at: ${steamjsDir}`)

try {
	console.log('[setup-steam-dev] Running "npm link" in DwebSteamJS...')
	execSync('npm link', { cwd: steamjsDir, stdio: 'inherit' })

	console.log('[setup-steam-dev] Running "npm link dweb-steamjs" in DVStudio...')
	execSync('npm link dweb-steamjs', { cwd: REPO_ROOT, stdio: 'inherit' })

	const appidPath = path.join(REPO_ROOT, 'steam_appid.txt')
	const exampleAppidPath = path.join(REPO_ROOT, 'steam_appid.txt.example')
	if (!fs.existsSync(appidPath)) {
		if (fs.existsSync(exampleAppidPath)) {
			fs.copyFileSync(exampleAppidPath, appidPath)
			console.log('[setup-steam-dev] Created steam_appid.txt from example (default: 480/SpaceWar)')
		} else {
			fs.writeFileSync(appidPath, '480', 'utf8')
			console.log('[setup-steam-dev] Created steam_appid.txt with default AppID 480 (SpaceWar)')
		}
		console.log('[setup-steam-dev] You can edit steam_appid.txt to use your own AppID.')
	} else {
		console.log('[setup-steam-dev] steam_appid.txt already exists, skipping.')
	}

	console.log('')
	console.log('[setup-steam-dev] SUCCESS! dweb-steamjs is linked.')
	console.log('')
	console.log('Next steps:')
	console.log('  1. Start Steam client and log in')
	console.log('  2. Verify steam_appid.txt contains your AppID (default: 480)')
	console.log('  3. Run "npm run dev:electron" to start the app')
	console.log('  4. Check console for "[platform:steam] initialized" message')
	console.log('  5. Steam friends list should show you as in-game')
	console.log('')
	console.log('To unlink (back to Mock mode): npm unlink dweb-steamjs')
} catch (err) {
	console.error('[setup-steam-dev] FAILED:', err.message)
	process.exit(1)
}
