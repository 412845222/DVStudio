import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const isCI = process.env.CI === 'true'
const steamAppId = process.env.STEAM_APP_ID || '480'

function run(cmd, args, { env } = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, ...(env || {}) },
			windowsHide: true
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
	const repoRoot = process.cwd()
	const buildUnpackedDir = path.resolve(repoRoot, 'steam-pipe', 'build', 'win64-unpacked')
	const contentDir = path.resolve(repoRoot, 'steam-pipe', 'content', 'win64')
	const cacheDir = path.resolve(repoRoot, '.electron-cache')

	fs.mkdirSync(cacheDir, { recursive: true })
	fs.mkdirSync(path.dirname(buildUnpackedDir), { recursive: true })
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
		process.stderr.write('[dist:steam:win] WARNING: Failed to deploy native Steam modules, continuing with Mock mode\n')
	}

	process.stdout.write('\n[dist:steam:win] === Step 2: Frontend build (vite) ===\n')
	code = await run('npx', ['vite', 'build'])
	if (code !== 0) {
		process.stderr.write(`[dist:steam:win] FAILED: vite build exited with code ${code}\n`)
		process.exit(code)
	}

	process.stdout.write('\n[dist:steam:win] === Step 3: Electron packaging (portable dir) ===\n')
	const extraResources = [
		{ from: 'electron/backend/python-bridge/scripts', to: 'python-bridge-scripts' },
		{ from: 'electron/static', to: 'static', filter: ['**/*', '!runtime/**'] },
		{ from: 'electron/static/runtime', to: 'runtime' }
	]

	code = await run(
		'electron-builder',
		[
			'--dir',
			'-w',
			'--publish', 'never',
			'--projectDir', repoRoot,
			'--config.directories.output', buildUnpackedDir,
			'--config.asarUnpack', 'electron/platform/native/**',
			'--config.extraResources', JSON.stringify(extraResources)
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
				'--config.directories.output', buildUnpackedDir,
				'--config.asarUnpack', 'electron/platform/native/**',
				'--config.extraResources', JSON.stringify(extraResources)
			],
			{ env: buildEnv }
		)
	}
	if (code !== 0) {
		process.stderr.write(`[dist:steam:win] FAILED: electron-builder exited with code ${code}\n`)
		process.exit(code)
	}

	process.stdout.write('\n[dist:steam:win] === Step 4: Post-process build artifacts ===\n')

	const winUnpackedDir = path.join(buildUnpackedDir, 'win-unpacked')
	const actualUnpackedDir = fs.existsSync(winUnpackedDir) ? winUnpackedDir : buildUnpackedDir

	if (!fs.existsSync(actualUnpackedDir)) {
		process.stderr.write(`[dist:steam:win] FAILED: Build output not found at ${actualUnpackedDir}\n`)
		process.exit(1)
	}

	process.stdout.write(`[dist:steam:win] Cleaning content dir: ${contentDir}\n`)
	fs.rmSync(contentDir, { recursive: true, force: true })

	process.stdout.write(`[dist:steam:win] Copying: ${actualUnpackedDir} -> ${contentDir}\n`)
	fs.cpSync(actualUnpackedDir, contentDir, { recursive: true })

	const steamAppidPath = path.join(contentDir, 'steam_appid.txt')
	process.stdout.write(`[dist:steam:win] Creating steam_appid.txt (AppID: ${steamAppId}) for local testing\n`)
	fs.writeFileSync(steamAppidPath, steamAppId, 'utf8')

	process.stdout.write('\n[dist:steam:win] === Build completed successfully! ===\n')
	process.stdout.write(`[dist:steam:win] Content directory: ${contentDir}\n`)
	process.stdout.write('[dist:steam:win] NOTE: steam_appid.txt is for local testing only and will be excluded from SteamPipe upload\n')

	process.exit(0)
}

main().catch((e) => {
	process.stderr.write(`[dist:steam:win] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
