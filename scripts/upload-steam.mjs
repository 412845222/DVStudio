import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadSteamEnv, getSteamEnvPath } from './steam-env.mjs'

loadSteamEnv()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const steamPipeDir = path.join(repoRoot, 'steam-pipe')

function parseCliArgs(argv) {
	const args = {}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg.startsWith('--')) {
			const eqIdx = arg.indexOf('=')
			if (eqIdx !== -1) {
				const key = arg.slice(2, eqIdx)
				let val = arg.slice(eqIdx + 1)
				if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
					val = val.slice(1, -1)
				}
				args[key] = val
			} else {
				const key = arg.slice(2)
				const nextVal = argv[i + 1]
				if (nextVal && !nextVal.startsWith('--')) {
					args[key] = nextVal
					i++
				} else {
					args[key] = true
				}
			}
		}
	}
	return args
}

const cliArgs = parseCliArgs(process.argv.slice(2))

function resolveConfig(name, cliKey, envKey, fallback = '') {
	if (cliArgs[cliKey] !== undefined && cliArgs[cliKey] !== true && cliArgs[cliKey] !== '') {
		return String(cliArgs[cliKey])
	}
	if (process.env[envKey]) return process.env[envKey]
	return fallback
}

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

	const steamAppId = resolveConfig('AppID', 'appid', 'STEAM_APP_ID', '2475710')
	const steamUsername = resolveConfig('Username', 'user', 'STEAM_USERNAME', '')
	const steamPassword = resolveConfig('Password', 'pass', 'STEAM_PASSWORD', '')
	const steamGuardCode = resolveConfig('GuardCode', 'guard', 'STEAM_GUARD_CODE', '')
	const steamBranch = resolveConfig('Branch', 'branch', 'STEAM_BRANCH', 'beta')
	const steamDepotIdWin = resolveConfig('DepotWin', 'depot-win', 'STEAM_DEPOT_ID_WIN', '')
	const steamDepotIdMac = resolveConfig('DepotMac', 'depot-mac', 'STEAM_DEPOT_ID_MAC', '')
	const steamDepotIdLinux = resolveConfig('DepotLinux', 'depot-linux', 'STEAM_DEPOT_ID_LINUX', '')
	const setLive = cliArgs['set-live'] === true || cliArgs['publish'] === true
	const description = resolveConfig('Description', 'desc', 'STEAM_BUILD_DESC', '')
	const dryRun = cliArgs['dry-run'] === true || cliArgs['dryrun'] === true

	if (!steamAppId || steamAppId === '0') {
		process.stderr.write('[upload:steam] ERROR: Steam AppID is required\n')
		process.stderr.write(`[upload:steam] Set via --appid=<id> or STEAM_APP_ID env var or ${getSteamEnvPath()}\n`)
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

	function toVdfPath(p) {
		return p.replace(/\//g, '\\')
	}

	process.stdout.write('╔══════════════════════════════════════════════════╗\n')
	process.stdout.write('║          Steam Build Upload Pipeline              ║\n')
	process.stdout.write('╚══════════════════════════════════════════════════╝\n\n')
	process.stdout.write(`  AppID:      ${steamAppId}\n`)
	process.stdout.write(`  Version:    ${pkg.version}\n`)
	process.stdout.write(`  Branch:     ${steamBranch}${setLive ? ' (will auto-set live!)' : ''}\n`)
	process.stdout.write(`  Win Depot:  ${steamDepotIdWin || '(not set)'}\n`)
	process.stdout.write(`  Mac Depot:  ${steamDepotIdMac || '(not set)'}\n`)
	process.stdout.write(`  Linux Depot:${steamDepotIdLinux || '(not set)'}\n`)
	process.stdout.write(`  Username:   ${steamUsername || '(not set, anonymous login)'}\n`)
	process.stdout.write(`  Guard Code: ${steamGuardCode ? '***' + steamGuardCode.slice(-2) : '(not needed if sentry cached)'}\n`)
	process.stdout.write(`  Dry Run:    ${dryRun ? 'YES (will not actually upload)' : 'NO'}\n`)
	if (description) process.stdout.write(`  Description:${description}\n`)
	process.stdout.write('\n')

	process.stdout.write('[upload:steam] === Step 1/3: Generating VDF configs ===\n')

	const generatedFiles = []

	function generateDepotVdf(templateName, outputName, depotId, contentSubdir) {
		const templatePath = path.join(steamPipeDir, templateName)
		const outputPath = path.join(steamPipeDir, outputName)
		if (!fs.existsSync(templatePath)) return null
		if (!depotId) return null

		const contentRootAbs = toVdfPath(path.join(steamPipeDir, 'content', contentSubdir))
		let content = fs.readFileSync(templatePath, 'utf8')
		const depIdPlaceholder = content.match(/\{\{DEPOT_ID_[A-Z]+\}\}/)?.[0] || '{{DEPOT_ID_WIN}}'
		content = content.replace(depIdPlaceholder, depotId)
		content = content.replace('"content/win64"', `"${contentRootAbs}"`)
		content = content.replace('"content/mac"', `"${contentRootAbs}"`)
		content = content.replace('"content/linux"', `"${contentRootAbs}"`)
		fs.writeFileSync(outputPath, content, 'utf8')
		generatedFiles.push(outputPath)
		process.stdout.write(`[upload:steam] ✓ Generated: ${outputName}\n`)
		return toVdfPath(outputPath)
	}

	const winDepotFile = generateDepotVdf('depot_build_win.vdf', 'depot_build_win_generated.vdf', steamDepotIdWin, 'win64')
	const macDepotFile = generateDepotVdf('depot_build_mac.vdf', 'depot_build_mac_generated.vdf', steamDepotIdMac, 'mac')
	const linuxDepotFile = generateDepotVdf('depot_build_linux.vdf', 'depot_build_linux_generated.vdf', steamDepotIdLinux, 'linux')

	const appTemplatePath = path.join(steamPipeDir, 'app_build.vdf')
	const appOutputPath = path.join(steamPipeDir, 'app_build_generated.vdf')

	if (!fs.existsSync(appTemplatePath)) {
		process.stderr.write(`[upload:steam] ERROR: App build template not found: ${appTemplatePath}\n`)
		process.exit(1)
	}

	const contentRootAbs = toVdfPath(contentDir)
	const buildOutputAbs = toVdfPath(outputDir)

	const depotEntries = []
	if (winDepotFile) depotEntries.push(`\t\t"${steamDepotIdWin}" "${winDepotFile}"`)
	if (macDepotFile) depotEntries.push(`\t\t"${steamDepotIdMac}" "${macDepotFile}"`)
	if (linuxDepotFile) depotEntries.push(`\t\t"${steamDepotIdLinux}" "${linuxDepotFile}"`)

	let appContent = fs.readFileSync(appTemplatePath, 'utf8')
	appContent = appContent.replace('{{APP_ID}}', steamAppId)
	appContent = appContent.replace(/\{\{VERSION\}\}/g, pkg.version)
	appContent = appContent.replace('{{BUILD_OUTPUT}}', buildOutputAbs)
	appContent = appContent.replace('{{CONTENT_ROOT}}', contentRootAbs)
	appContent = appContent.replace('{{BRANCH}}', steamBranch)
	appContent = appContent.replace('{{DEPOT_ENTRIES}}', depotEntries.join('\n'))
	appContent = appContent.replace('{{DESCRIPTION}}', description || `v${pkg.version} build`)
	const setLiveBlock = setLive ? `\t"SetLive" "${steamBranch}"` : ''
	appContent = appContent.replace('{{SET_LIVE_BLOCK}}', setLiveBlock)

	fs.writeFileSync(appOutputPath, appContent, 'utf8')
	generatedFiles.push(appOutputPath)
	process.stdout.write('[upload:steam] ✓ Generated: app_build_generated.vdf\n')

	const appBuildVdfAbsPath = toVdfPath(appOutputPath)

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
				try { fs.rmSync(f, { force: true }) } catch (_) {}
			}
		}
	}

	if (dryRun) {
		process.stdout.write('\n[upload:steam] === DRY RUN COMPLETE ===\n')
		process.stdout.write('[upload:steam] VDF files generated but not uploaded.\n')
		process.stdout.write(`[upload:steam] App build config: ${appOutputPath}\n`)
		process.stdout.write('\n[upload:steam] To actually upload, remove --dry-run flag.\n')
		process.exit(0)
	}

	process.stdout.write('\n[upload:steam] === Step 2/3: Authenticating & Uploading to SteamPipe ===\n')
	process.stdout.write('─'.repeat(56) + '\n')

	if (!steamUsername) {
		process.stdout.write('  ⚠️  No username provided - will attempt anonymous login\n')
		process.stdout.write('  Note: Anonymous login cannot upload builds!\n')
	}
	if (!steamPassword && steamUsername) {
		process.stdout.write('  ⚠️  No password provided - steamcmd will prompt interactively\n')
	}
	if (!steamGuardCode && steamUsername && steamPassword) {
		process.stdout.write('  ℹ️  No guard code provided - if this is first login,\n')
		process.stdout.write('      steamcmd will prompt for Steam Guard code.\n')
		process.stdout.write('      Tip: Use --guard=XXXXX to pass the code directly.\n')
		process.stdout.write('      (Code is the 5-character code from Steam Mobile Authenticator)\n')
	}
	process.stdout.write('─'.repeat(56) + '\n\n')

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
			'+run_app_build', appBuildVdfAbsPath,
			'+quit'
		], { cwd: steamPipeDir })

		process.stdout.write('\n')
		process.stdout.write('╔══════════════════════════════════════════════════╗\n')
		process.stdout.write('║          ✅ Upload completed successfully!         ║\n')
		process.stdout.write('╚══════════════════════════════════════════════════╝\n\n')

		process.stdout.write('[upload:steam] === Step 3/3: Next Steps ===\n\n')

		if (setLive) {
			process.stdout.write(`  🚀 Build was automatically set live on "${steamBranch}" branch!\n`)
			process.stdout.write('     Wait 5-15 minutes for Steam CDN propagation.\n')
		} else {
			process.stdout.write(`  1. Go to Steamworks Partner backend:\n`)
			process.stdout.write('     https://partner.steamgames.com/\n')
			process.stdout.write(`  2. Navigate to: Apps → ${steamAppId} → Edit Steamworks Settings → SteamPipe → Builds\n`)
			process.stdout.write(`  3. Find the new build (v${pkg.version}) and click "Promote" → select "${steamBranch}"\n`)
			process.stdout.write(`  4. Wait for CDN propagation (5-15 min), then test with beta branch access\n`)
			process.stdout.write(`\n`)
			process.stdout.write(`  💡 To auto-publish in one step, add --set-live flag:\n`)
			process.stdout.write(`     npm run release:steam -- --guard=XXXXX --set-live\n`)
		}

		process.stdout.write(`\n`)
		process.stdout.write(`  📂 Build logs: steam-pipe/output/\n`)
		process.stdout.write(`  🔍 Test the build:\n`)
		process.stdout.write(`     - Switch Steam client DVStudio → Properties → Betas → "${steamBranch}"\n`)
		process.stdout.write(`     - Or for default branch, no beta password needed\n`)

		cleanup()
	} catch (err) {
		process.stderr.write(`\n[upload:steam] ❌ Upload failed: ${err.message}\n\n`)
		process.stderr.write('[upload:steam] === Troubleshooting ===\n\n')
		process.stderr.write('  1. Authentication issues:\n')
		process.stderr.write('     - Double-check STEAM_USERNAME and STEAM_PASSWORD in steam-pipe/.env\n')
		process.stderr.write('     - Get a fresh Steam Guard code from Steam Mobile App and pass it:\n')
		process.stderr.write('       npm run upload:steam -- --guard=XXXXX\n')
		process.stderr.write('     - If login keeps failing, try running steamcmd directly first:\n')
		process.stderr.write(`       "${steamcmdPath}" +login <username> +quit\n\n`)
		process.stderr.write('  2. Guard code tips:\n')
		process.stderr.write('     - The guard code is the 5-letter code (e.g. 7G7QM)\n')
		process.stderr.write('     - It changes every 30 seconds - use a fresh one!\n')
		process.stderr.write('     - After first successful login, steamcmd caches a sentry file\n')
		process.stderr.write('       and future logins may not need the guard code.\n\n')
		process.stderr.write('  3. Other issues:\n')
		process.stderr.write('     - Check build logs in steam-pipe/output/ for VDF errors\n')
		process.stderr.write('     - Ensure your Steam account has "Publish" permission for this app\n')
		process.stderr.write('     - Generated VDF files are kept in steam-pipe/ for debugging\n')

		process.exit(1)
	}
}

main().catch((e) => {
	process.stderr.write(`[upload:steam] FATAL: ${String(e?.message || e)}\n`)
	process.exit(1)
})
