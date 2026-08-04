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
	process.stderr.write(
		'[dist:steam:win] ERROR: Steam AppID is required. Set it in steam.config.json or STEAM_APP_ID env var.\n'
	)
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
			ELECTRON_MIRROR:
				process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/',
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

	const buildTimestamp = Date.now()
	const buildBaseDir = path.resolve(repoRoot, 'steam-pipe', 'build')
	const buildUnpackedDir = path.resolve(buildBaseDir, `win64-unpacked-${buildTimestamp}`)
	const contentDir = path.resolve(repoRoot, 'steam-pipe', 'content', 'win64')
	const cacheDir = path.resolve(repoRoot, '.electron-cache')
	const tempConfigPath = path.join(buildBaseDir, `electron-builder-steam-${buildTimestamp}.json`)

	fs.mkdirSync(cacheDir, { recursive: true })
	fs.mkdirSync(buildBaseDir, { recursive: true })
	fs.mkdirSync(path.dirname(contentDir), { recursive: true })

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
		process.stderr.write(
			'[dist:steam:win] WARNING: Failed to deploy native Steam modules, continuing with Mock mode\n'
		)
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
		files: [
			...(pkg.build.files || []),
			'!electron/steam.config.json',
			'!electron/**/steam.config.example.json',
			'!electron/**/*.log',
			'!electron/**/*.map',
			'!**/steam.config.json',
			'!**/*.local.mjs'
		],
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
		['--dir', '-w', '--publish', 'never', '--projectDir', repoRoot, '--config', tempConfigPath],
		{ env: buildEnv }
	)
	if (code !== 0) {
		process.stdout.write('[dist:steam:win] retry once...\n')
		code = await run(
			'electron-builder',
			['--dir', '-w', '--publish', 'never', '--projectDir', repoRoot, '--config', tempConfigPath],
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
		process.stderr.write(
			`[dist:steam:win] FAILED: Build output not found at ${actualUnpackedDir}\n`
		)
		process.exit(1)
	}

	const steamAppidInBuild = path.join(actualUnpackedDir, 'steam_appid.txt')
	if (fs.existsSync(steamAppidInBuild)) {
		fs.rmSync(steamAppidInBuild, { force: true })
		process.stdout.write(
			'[dist:steam:win] Removed steam_appid.txt from build root (Steam auto-generates this)\n'
		)
	}

	const nativeUnpackedAppIdPath = path.join(
		actualUnpackedDir,
		'resources',
		'app.asar.unpacked',
		'electron',
		'platform',
		'native',
		'win32',
		'steam_appid.txt'
	)
	if (fs.existsSync(nativeUnpackedAppIdPath)) {
		fs.writeFileSync(nativeUnpackedAppIdPath, steamAppId, 'utf8')
		process.stdout.write(`[dist:steam:win] Updated native steam_appid.txt to AppID ${steamAppId}\n`)
	}

	function robocopyMirror(src, dst) {
		return new Promise((resolve) => {
			const args = [
				src,
				dst,
				'/MIR',
				'/R:2',
				'/W:1',
				'/NFL',
				'/NDL',
				'/NJH',
				'/NJS',
				'/NP',
				'/XD',
				'*.tmp'
			]
			process.stdout.write(`[dist:steam:win] Mirroring build to content dir via robocopy...\n`)
			const child = spawn('robocopy', args, {
				stdio: 'inherit',
				shell: false,
				windowsHide: true,
				cwd: repoRoot
			})
			child.once('exit', (code) => {
				const exitCode = Number(code || 0)
				if (exitCode >= 8) {
					process.stdout.write(
						`[dist:steam:win] robocopy exited with code ${exitCode} (non-fatal for code < 8)\n`
					)
				}
				resolve(exitCode)
			})
		})
	}

	function sleepSync(ms) {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
	}

	function cleanupOldBuilds() {
		try {
			const entries = fs.readdirSync(buildBaseDir, { withFileTypes: true })
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name.startsWith('win64-unpacked-')) {
					const dirPath = path.join(buildBaseDir, entry.name)
					if (dirPath !== buildUnpackedDir) {
						try {
							fs.rmSync(dirPath, { recursive: true, force: true })
						} catch (_) {}
					}
				} else if (
					entry.isFile() &&
					entry.name.startsWith('electron-builder-steam-') &&
					entry.name.endsWith('.json')
				) {
					const filePath = path.join(buildBaseDir, entry.name)
					if (filePath !== tempConfigPath) {
						try {
							fs.rmSync(filePath, { force: true })
						} catch (_) {}
					}
				}
			}
		} catch (_) {}
	}

	fs.mkdirSync(contentDir, { recursive: true })
	await robocopyMirror(actualUnpackedDir, contentDir)

	try {
		fs.rmSync(tempConfigPath, { force: true })
	} catch (_) {}
	cleanupOldBuilds()

	process.stdout.write('\n[dist:steam:win] === Build completed successfully! ===\n')
	process.stdout.write(`[dist:steam:win] Content directory: ${contentDir}\n`)
	process.stdout.write(
		'[dist:steam:win] Note: steam_appid.txt is excluded from depot root (Steam auto-generates it on launch)\n'
	)
	process.stdout.write('[dist:steam:win] Next: Run "npm run upload:steam" to upload to SteamPipe\n')

	process.exit(0)
}

main().catch((e) => {
	process.stderr.write(`[dist:steam:win] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
