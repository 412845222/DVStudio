import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadSteamEnv } from './steam-env.mjs'

loadSteamEnv()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const isCI = process.env.CI === 'true'
const steamAppId = process.env.STEAM_APP_ID || ''

if (!steamAppId) {
	process.stderr.write('[dist:steam:win] ERROR: Steam AppID is required. Set it in steam.config.json or STEAM_APP_ID env var.\n')
	process.exit(1)
}

function run(cmd, args, { env, cwd } = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, ...(env || {}) },
			windowsHide: true,
			cwd: cwd || repoRoot
		})
		child.once('exit', (code) => resolve(Number(code || 0)))
	})
}

function getMirrorConfig() {
	if (isCI) {
		return {
			PIP_INDEX_URL: process.env.PIP_INDEX_URL || 'https://pypi.org/simple/',
			ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/',
			ELECTRON_BUILDER_BINARIES_MIRROR:
				process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
				'https://github.com/electron-userland/electron-builder-binaries/releases/download/'
		}
	}
	return {
		PIP_INDEX_URL: process.env.PIP_INDEX_URL || 'https://pypi.tuna.tsinghua.edu.cn/simple',
		ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
		ELECTRON_BUILDER_BINARIES_MIRROR:
			process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
			'https://npmmirror.com/mirrors/electron-builder-binaries/'
	}
}

async function main() {
	const pkgPath = path.join(repoRoot, 'package.json')
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

	const buildUnpackedDir = path.resolve(repoRoot, 'steam-pipe', 'build', 'win64-unpacked')
	const contentDir = path.resolve(repoRoot, 'steam-pipe', 'content', 'win64')
	const cacheDir = path.resolve(repoRoot, '.electron-cache')
	const tempConfigPath = path.join(repoRoot, 'steam-pipe', 'build', 'electron-builder-steam.json')

	fs.mkdirSync(cacheDir, { recursive: true })
	fs.mkdirSync(path.dirname(buildUnpackedDir), { recursive: true })
	fs.mkdirSync(path.dirname(contentDir), { recursive: true })
	fs.mkdirSync(path.dirname(tempConfigPath), { recursive: true })

	process.stdout.write(`[dist:steam:win] Steam AppID: ${steamAppId}\n`)
	process.stdout.write(`[dist:steam:win] environment: ${isCI ? 'CI (GitHub Actions)' : 'local'}\n`)
	process.stdout.write(`[dist:steam:win] build dir: ${buildUnpackedDir}\n`)
	process.stdout.write(`[dist:steam:win] content dir: ${contentDir}\n`)
	process.stdout.write(`[dist:steam:win] electron cache dir: ${cacheDir}\n`)

	const mirrors = getMirrorConfig()
	process.stdout.write(`[dist:steam:win] PIP_INDEX_URL: ${mirrors.PIP_INDEX_URL}\n`)
	process.stdout.write(`[dist:steam:win] ELECTRON_MIRROR: ${mirrors.ELECTRON_MIRROR}\n`)

	const buildEnv = {
		ELECTRON_BUILDER_DISABLE_UPDATES_CHECK: 'true',
		ELECTRON_CACHE: cacheDir,
		ELECTRON_BUILDER_CACHE: cacheDir,
		...mirrors
	}

	process.stdout.write('\n[dist:steam:win] === Step 1: Deploy native modules ===\n')
	let code = await run('node', ['scripts/setup-steam-native.mjs'])
	if (code !== 0) {
		process.stderr.write('[dist:steam:win] WARNING: Failed to deploy native Steam modules, continuing with Mock mode\n')
	}

	process.stdout.write('\n[dist:steam:win] === Step 2: Frontend build (vite) ===\n')
	code = await run('npx', ['vite', 'build'])
	if (code !== 0) {
		process.stderr.write(`[dist:steam:win] FAILED: vite build exited with code ${code}\n`)
		process.exit(code)
	}

	process.stdout.write('\n[dist:steam:win] === Step 3: Electron packaging (portable dir) ===\n')

	const electronBuilderConfig = {
		...pkg.build,
		directories: {
			...pkg.build.directories,
			output: buildUnpackedDir
		},
		asar: true,
		asarUnpack: 'electron/platform/native/**',
		win: {
			...pkg.build.win,
			target: [
				{
					target: 'dir',
					arch: ['x64']
				}
			]
		},
		extraResources: pkg.build.extraResources || []
	}

	delete electronBuilderConfig.nsis
	delete electronBuilderConfig.mac

	fs.writeFileSync(tempConfigPath, JSON.stringify(electronBuilderConfig, null, 2), 'utf8')
	process.stdout.write(`[dist:steam:win] Generated electron-builder config: ${tempConfigPath}\n`)

	code = await run(
		'electron-builder',
		[
			'--dir',
			'-w',
			'--publish', 'never',
			'--projectDir', repoRoot,
			'--config', tempConfigPath
		],
		{ env: buildEnv }
	)
	if (code !== 0) {
		process.stdout.write('[dist:steam:win] retry once...\n')
		code = await run(
			'electron-builder',
			[
				'--dir',
				'-w',
				'--publish', 'never',
				'--projectDir', repoRoot,
				'--config', tempConfigPath
			],
			{ env: buildEnv }
		)
	}
	if (code !== 0) {
		process.stderr.write(`[dist:steam:win] FAILED: electron-builder exited with code ${code}\n`)
		fs.rmSync(tempConfigPath, { force: true })
		process.exit(code)
	}

	fs.rmSync(tempConfigPath, { force: true })

	process.stdout.write('\n[dist:steam:win] === Step 4: Post-process build artifacts ===\n')

	const winUnpackedDir = path.join(buildUnpackedDir, 'win-unpacked')
	const actualUnpackedDir = fs.existsSync(winUnpackedDir) ? winUnpackedDir : buildUnpackedDir

	if (!fs.existsSync(actualUnpackedDir)) {
		process.stderr.write(`[dist:steam:win] FAILED: Build output not found at ${actualUnpackedDir}\n`)
		process.exit(1)
	}

	const tempContentDir = `${contentDir}.tmp-${Date.now()}`
	fs.mkdirSync(tempContentDir, { recursive: true })

	process.stdout.write(`[dist:steam:win] Copying build to staging: ${tempContentDir}\n`)
	fs.cpSync(actualUnpackedDir, tempContentDir, { recursive: true })

	const steamAppidInStaging = path.join(tempContentDir, 'steam_appid.txt')
	if (fs.existsSync(steamAppidInStaging)) {
		fs.rmSync(steamAppidInStaging, { force: true })
		process.stdout.write('[dist:steam:win] Removed steam_appid.txt from build root (Steam auto-generates this)\n')
	}

	const nativeUnpackedAppIdPath = path.join(
		tempContentDir, 'resources', 'app.asar.unpacked',
		'electron', 'platform', 'native', 'win32', 'steam_appid.txt'
	)
	if (fs.existsSync(nativeUnpackedAppIdPath)) {
		fs.writeFileSync(nativeUnpackedAppIdPath, steamAppId, 'utf8')
		process.stdout.write(`[dist:steam:win] Updated native steam_appid.txt to AppID ${steamAppId}\n`)
	}

	function sleepSync(ms) {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
	}

	function removeWithRetry(dir, retries = 8) {
		for (let i = 0; i < retries; i++) {
			try {
				fs.rmSync(dir, { recursive: true, force: true })
				return true
			} catch (e) {
				if (i === retries - 1) return false
				process.stdout.write(`[dist:steam:win] Remove retry (${i + 1}/${retries})...\n`)
				sleepSync(800)
			}
		}
		return false
	}

	if (fs.existsSync(contentDir)) {
		process.stdout.write(`[dist:steam:win] Cleaning old content dir...\n`)
		const removed = removeWithRetry(contentDir)
		if (!removed) {
			process.stdout.write('[dist:steam:win] WARNING: Could not fully remove old content dir (file locked), attempting to overwrite...\n')
		}
	}

	process.stdout.write(`[dist:steam:win] Moving staged content to: ${contentDir}\n`)
	try {
		fs.renameSync(tempContentDir, contentDir)
	} catch (renameErr) {
		process.stdout.write(`[dist:steam:win] Rename failed (${renameErr.message}), using copy...\n`)
		fs.mkdirSync(contentDir, { recursive: true })
		fs.cpSync(tempContentDir, contentDir, { recursive: true, force: true })
		try { fs.rmSync(tempContentDir, { recursive: true, force: true }) } catch (_) {}
	}

	process.stdout.write('\n[dist:steam:win] === Build completed successfully! ===\n')
	process.stdout.write(`[dist:steam:win] Content directory: ${contentDir}\n`)
	process.stdout.write('[dist:steam:win] Note: steam_appid.txt is excluded from depot root (Steam auto-generates it on launch)\n')
	process.stdout.write('[dist:steam:win] Next: Run "npm run upload:steam" to upload to SteamPipe\n')

	process.exit(0)
}

main().catch((e) => {
	process.stderr.write(`[dist:steam:win] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
