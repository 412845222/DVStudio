import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadSteamEnv } from './steam-env.mjs'

loadSteamEnv()

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

	function toVdfPath(p) {
		return p.replace(/\//g, '\\')
	}

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

		const contentRootAbs = toVdfPath(path.join(steamPipeDir, 'content', contentSubdir))
		let content = fs.readFileSync(templatePath, 'utf8')
		const depIdPlaceholder = content.match(/\{\{DEPOT_ID_[A-Z]+\}\}/)?.[0] || '{{DEPOT_ID_WIN}}'
		content = content.replace(depIdPlaceholder, depotId)
		content = content.replace('"content/win64"', `"${contentRootAbs}"`)
		content = content.replace('"content/mac"', `"${contentRootAbs}"`)
		content = content.replace('"content/linux"', `"${contentRootAbs}"`)
		fs.writeFileSync(outputPath, content, 'utf8')
		generatedFiles.push(outputPath)
		process.stdout.write(`[upload:steam] Generated: ${outputName}\n`)
		return toVdfPath(outputPath)
	}

	const winDepotFile = generateDepotVdf('depot_build_win.vdf', 'depot_build_win_generated.vdf', steamDepotIdWin, 'win64')
	const macDepotFile = generateDepotVdf('depot_build_mac.vdf', 'depot_build_mac_generated.vdf', steamDepotIdMac, 'mac')
	const linuxDepotFile = generateDepotVdf('depot_build_linux.vdf', 'depot_build_linux_generated.vdf', steamDepotIdLinux, 'linux')

	const appTemplatePath = path.join(steamPipeDir, 'app_build.vdf')
	const appOutputPath = path.join(steamPipeDir, 'app_build_generated.vdf')

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

	fs.writeFileSync(appOutputPath, appContent, 'utf8')
	generatedFiles.push(appOutputPath)
	process.stdout.write(`[upload:steam] Generated: app_build_generated.vdf\n`)

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
				fs.rmSync(f, { force: true })
			}
		}
	}

	process.stdout.write(`[upload:steam] steamcmd path: ${steamcmdPath}\n`)
	process.stdout.write('\n[upload:steam] === Uploading to SteamPipe ===\n')
	process.stdout.write('\n' + '='.repeat(60) + '\n')
	process.stdout.write('  ⚠️  重要提示：如果你的账号启用了 Steam 手机验证器\n')
	process.stdout.write('  请立即打开手机上的 Steam APP，等待登录确认请求\n')
	process.stdout.write('  看到确认提示后，点击"确认登录"以继续上传\n')
	process.stdout.write('='.repeat(60) + '\n\n')

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
		process.stderr.write('[upload:steam] 2. If Steam Guard mobile confirm is needed, open Steam APP on your phone to approve\n')
		process.stderr.write('[upload:steam] 3. First login may require manual authentication - try running steamcmd.exe directly first:\n')
		process.stderr.write(`[upload:steam]    "${steamcmdPath}" +login <username> +quit\n`)
		process.stderr.write('[upload:steam] 4. Check build logs in steam-pipe/output/ for details\n')
		process.stderr.write('[upload:steam] 5. Generated VDF files kept for debugging in steam-pipe/\n')

		process.exit(1)
	}
}

main().catch((e) => {
	process.stderr.write(`[upload:steam] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
