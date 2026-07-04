import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const steamPipeDir = path.join(repoRoot, 'steam-pipe')

function run(cmd, args, { env, cwd } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, ...(env || {}) },
			windowsHide: true,
			cwd: cwd || repoRoot
		})
		child.once('exit', (code) => {
			if (code === 0) {
				resolve(0)
			} else {
				reject(new Error(`Command exited with code ${code}`))
			}
		})
		child.once('error', (err) => reject(err))
	})
}

async function main() {
	const pkgPath = path.join(repoRoot, 'package.json')
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

	const steamAppId = process.env.STEAM_APP_ID
	const steamUsername = process.env.STEAM_USERNAME
	const steamPassword = process.env.STEAM_PASSWORD
	const steamGuardCode = process.env.STEAM_GUARD_CODE
	const steamBranch = process.env.STEAM_BRANCH || 'beta'
	const steamDepotIdWin = process.env.STEAM_DEPOT_ID_WIN || ''
	const steamDepotIdMac = process.env.STEAM_DEPOT_ID_MAC || ''
	const steamDepotIdLinux = process.env.STEAM_DEPOT_ID_LINUX || ''

	if (!steamAppId) {
		process.stderr.write('[upload:steam] ERROR: STEAM_APP_ID environment variable is required\n')
		process.stderr.write('[upload:steam] Set it to your Steam AppID (480 for SpaceWar testing)\n')
		process.exit(1)
	}

	const contentDir = path.join(steamPipeDir, 'content')
	const winContentDir = path.join(contentDir, 'win64')
	const outputDir = path.join(steamPipeDir, 'output')

	if (!fs.existsSync(winContentDir)) {
		process.stderr.write(`[upload:steam] ERROR: Content directory not found: ${winContentDir}\n`)
		process.stderr.write('[upload:steam] Run "npm run dist:steam:win" first to build the Steam version\n')
		process.exit(1)
	}

	fs.mkdirSync(outputDir, { recursive: true })

	process.stdout.write(`[upload:steam] AppID: ${steamAppId}\n`)
	process.stdout.write(`[upload:steam] Version: ${pkg.version}\n`)
	process.stdout.write(`[upload:steam] Branch: ${steamBranch}\n`)
	process.stdout.write(`[upload:steam] Win Depot ID: ${steamDepotIdWin || '(not set, will be skipped)'}\n`)
	process.stdout.write(`[upload:steam] Working directory: ${steamPipeDir}\n`)

	process.stdout.write('\n[upload:steam] === Generating VDF configs ===\n')

	const generatedFiles = []

	function generateDepotVdf(templateName, outputName, depotId, contentSubdir) {
		const templatePath = path.join(steamPipeDir, templateName)
		const outputPath = path.join(steamPipeDir, outputName)
		if (!fs.existsSync(templatePath)) return null
		if (!depotId) return null

		let content = fs.readFileSync(templatePath, 'utf8')
		content = content.replace(/\{\{DEPOT_ID_[A-Z]+\}\}/g, depotId)
		fs.writeFileSync(outputPath, content, 'utf8')
		generatedFiles.push(outputPath)
		process.stdout.write(`[upload:steam] Generated: ${outputName}\n`)
		return outputName
	}

	const winDepotFile = generateDepotVdf('depot_build_win.vdf', 'depot_build_win_generated.vdf', steamDepotIdWin, 'win64')
	const macDepotFile = generateDepotVdf('depot_build_mac.vdf', 'depot_build_mac_generated.vdf', steamDepotIdMac, 'mac')
	const linuxDepotFile = generateDepotVdf('depot_build_linux.vdf', 'depot_build_linux_generated.vdf', steamDepotIdLinux, 'linux')

	const appTemplatePath = path.join(steamPipeDir, 'app_build.vdf')
	const appOutputPath = path.join(steamPipeDir, 'app_build_generated.vdf')

	let appContent = fs.readFileSync(appTemplatePath, 'utf8')
	appContent = appContent.replace(/\{\{APP_ID\}\}/g, steamAppId)
	appContent = appContent.replace(/\{\{VERSION\}\}/g, pkg.version)
	appContent = appContent.replace(/\{\{BUILD_OUTPUT\}\}/g, 'output')
	appContent = appContent.replace(/\{\{BRANCH\}\}/g, steamBranch)
	appContent = appContent.replace(/"\{\{DEPOT_ID_WIN\}\}"\s+"depot_build_win\.vdf"/g, winDepotFile ? `"${steamDepotIdWin}" "${winDepotFile}"` : '')
	appContent = appContent.replace(/"\{\{DEPOT_ID_MAC\}\}"\s+"depot_build_mac\.vdf"/g, macDepotFile ? `"${steamDepotIdMac}" "${macDepotFile}"` : '')
	appContent = appContent.replace(/"\{\{DEPOT_ID_LINUX\}\}"\s+"depot_build_linux\.vdf"/g, linuxDepotFile ? `"${steamDepotIdLinux}" "${linuxDepotFile}"` : '')

	appContent = appContent.replace(/^\s*\n/gm, '')

	fs.writeFileSync(appOutputPath, appContent, 'utf8')
	generatedFiles.push(appOutputPath)
	process.stdout.write(`[upload:steam] Generated: app_build_generated.vdf\n`)

	const steamcmdPath = path.join(
		repoRoot,
		'SteamworksSDK',
		'sdk',
		'sdk',
		'tools',
		'ContentBuilder',
		'builder',
		'steamcmd.exe'
	)

	if (!fs.existsSync(steamcmdPath)) {
		process.stderr.write(`[upload:steam] ERROR: steamcmd.exe not found at: ${steamcmdPath}\n`)
		process.stderr.write('[upload:steam] Make sure SteamworksSDK is present in the project root\n')
		cleanup()
		process.exit(1)
	}

	function cleanup() {
		for (const f of generatedFiles) {
			if (fs.existsSync(f)) {
				fs.rmSync(f, { force: true })
			}
		}
	}

	process.stdout.write(`[upload:steam] steamcmd path: ${steamcmdPath}\n`)
	process.stdout.write('\n[upload:steam] === Uploading to SteamPipe ===\n')

	const loginArgs = ['+login']
	if (steamUsername) {
		loginArgs.push(steamUsername)
		if (steamPassword) {
			loginArgs.push(steamPassword)
			if (steamGuardCode) {
				loginArgs.push(steamGuardCode)
			}
		}
	} else {
		loginArgs.push('anonymous')
	}

	try {
		await run(steamcmdPath, [
			...loginArgs,
			'+run_app_build', 'app_build_generated.vdf',
			'+quit'
		], { cwd: steamPipeDir })

		process.stdout.write('\n[upload:steam] === Upload completed successfully! ===\n')
		process.stdout.write('[upload:steam] Next steps:\n')
		process.stdout.write('[upload:steam] 1. Go to Steamworks Partner backend\n')
		process.stdout.write('[upload:steam] 2. Navigate to your app -> Edit Steamworks Settings -> SteamPipe -> Builds\n')
		process.stdout.write(`[upload:steam] 3. Find the new build and set it live on the "${steamBranch}" branch\n`)
		process.stdout.write('[upload:steam] 4. Test the build using a Steam account with access to the beta branch\n')
		process.stdout.write('[upload:steam] Build logs are in: steam-pipe/output/\n')

		cleanup()
	} catch (err) {
		process.stderr.write(`\n[upload:steam] Upload failed: ${err.message}\n`)
		process.stderr.write('\n[upload:steam] Troubleshooting:\n')
		process.stderr.write('[upload:steam] 1. Check that STEAM_USERNAME and STEAM_PASSWORD are correct\n')
		process.stderr.write('[upload:steam] 2. If Steam Guard is enabled, set STEAM_GUARD_CODE environment variable\n')
		process.stderr.write('[upload:steam] 3. First login may require manual authentication - try running steamcmd.exe directly first:\n')
		process.stderr.write(`[upload:steam]    "${steamcmdPath}" +login <username> +quit\n`)
		process.stderr.write('[upload:steam] 4. Check build logs in steam-pipe/output/ for details\n')
		process.stderr.write('[upload:steam] 5. If using a new account/browser, Steam may block login for 3 days after enabling Steam Guard\n')

		cleanup()
		process.exit(1)
	}
}

main().catch((e) => {
	process.stderr.write(`[upload:steam] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
