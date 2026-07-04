import readline from 'node:readline'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const steamPipeDir = path.join(repoRoot, 'steam-pipe')
const envPath = path.join(steamPipeDir, '.env')
const envExamplePath = path.join(steamPipeDir, 'env.example')

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
})

function question(prompt, defaultValue = '') {
	return new Promise((resolve) => {
		const display = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `
		rl.question(display, (answer) => {
			resolve(answer.trim() || defaultValue)
		})
	})
}

function questionSilent(prompt, defaultValue = '') {
	return new Promise((resolve) => {
		const display = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `
		process.stdout.write(display)
		rl.input.setRawMode(true)
		rl.input.resume()
		rl.input.setEncoding('utf8')
		let input = ''
		const onData = (char) => {
			if (char === '\r' || char === '\n' || char === '\u0004') {
				rl.input.setRawMode(false)
				rl.input.removeListener('data', onData)
				process.stdout.write('\n')
				resolve(input || defaultValue)
			} else if (char === '\u0003') {
				process.exit(1)
			} else if (char === '\b' || char === '\x7f') {
				if (input.length > 0) {
					input = input.slice(0, -1)
					process.stdout.write('\b \b')
				}
			} else {
				input += char
				process.stdout.write('*')
			}
		}
		rl.input.on('data', onData)
	})
}

function parseEnv(filePath) {
	const result = {}
	if (!fs.existsSync(filePath)) return result
	const content = fs.readFileSync(filePath, 'utf8')
	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) continue
		const key = trimmed.slice(0, eqIndex).trim()
		const value = trimmed.slice(eqIndex + 1).trim()
		result[key] = value
	}
	return result
}

function serializeEnv(config) {
	const exampleContent = fs.existsSync(envExamplePath)
		? fs.readFileSync(envExamplePath, 'utf8')
		: ''
	const lines = []
	const written = new Set()
	for (const line of exampleContent.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) {
			lines.push(line)
			continue
		}
		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) {
			lines.push(line)
			continue
		}
		const key = trimmed.slice(0, eqIndex).trim()
		if (key in config) {
			lines.push(`${key}=${config[key]}`)
			written.add(key)
		} else {
			lines.push(line)
		}
	}
	for (const [key, value] of Object.entries(config)) {
		if (!written.has(key)) {
			lines.push(`${key}=${value}`)
		}
	}
	return lines.join('\n') + '\n'
}

async function main() {
	process.stdout.write('\n=== Steam 配置向导 ===\n\n')
	process.stdout.write('此向导将帮助你配置 Steam 上传所需的环境变量。\n')
	process.stdout.write('所有配置将保存到 steam-pipe/.env 文件中（不会被提交到 Git）。\n\n')

	const existingConfig = parseEnv(envPath)
	const exampleConfig = parseEnv(envExamplePath)
	const defaults = { ...exampleConfig, ...existingConfig }

	const steamAppId = await question('Steam App ID', defaults.STEAM_APP_ID || '2475710')
	const steamDepotIdWin = await question('Windows Depot ID', defaults.STEAM_DEPOT_ID_WIN || '2475711')
	const steamDepotIdMac = await question('Mac Depot ID (不发布 Mac 可留空)', defaults.STEAM_DEPOT_ID_MAC || '')
	const steamDepotIdLinux = await question('Linux Depot ID (不发布 Linux 可留空)', defaults.STEAM_DEPOT_ID_LINUX || '')
	const steamBranch = await question('发布分支 (beta=测试, 空=正式)', defaults.STEAM_BRANCH || 'beta')

	process.stdout.write('\n--- Steam 账号信息 ---\n')
	process.stdout.write('提示：建议使用专用构建账号，仅授予 SteamPipe 上传权限。\n')
	process.stdout.write('密码输入时不会显示字符。\n\n')

	const steamUsername = await question('Steam 用户名', defaults.STEAM_USERNAME || '')
	const defaultPassword = existingConfig.STEAM_PASSWORD || ''
	const steamPassword = await questionSilent(
		defaultPassword ? 'Steam 密码 (回车保持不变)' : 'Steam 密码',
		''
	)
	const finalPassword = steamPassword || defaultPassword

	let steamGuardCode = ''
	if (steamUsername) {
		process.stdout.write('\n--- Steam Guard 验证码 ---\n')
		process.stdout.write('如果这是首次在此机器上登录，Steam 会向你的邮箱/手机发送验证码。\n')
		process.stdout.write('如果之前已成功登录过（有 Sentry 文件），可以直接留空跳过。\n\n')
		steamGuardCode = await question('Steam Guard 验证码 (首次登录需要)', defaults.STEAM_GUARD_CODE || '')
	}

	const config = {
		STEAM_APP_ID: steamAppId,
		STEAM_DEPOT_ID_WIN: steamDepotIdWin,
		STEAM_DEPOT_ID_MAC: steamDepotIdMac,
		STEAM_DEPOT_ID_LINUX: steamDepotIdLinux,
		STEAM_BRANCH: steamBranch,
		STEAM_USERNAME: steamUsername,
		STEAM_PASSWORD: finalPassword,
		STEAM_GUARD_CODE: steamGuardCode
	}

	fs.mkdirSync(steamPipeDir, { recursive: true })
	fs.writeFileSync(envPath, serializeEnv(config), 'utf8')
	process.stdout.write(`\n✅ 配置已保存到: ${envPath}\n\n`)

	rl.close()

	process.stdout.write('=== 配置验证 ===\n\n')

	let ok = true

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
	if (fs.existsSync(steamcmdPath)) {
		process.stdout.write('✅ steamcmd.exe 已找到\n')
	} else {
		process.stdout.write(`❌ steamcmd.exe 未找到: ${steamcmdPath}\n`)
		process.stdout.write('   请确保 SteamworksSDK 文件夹存在于项目根目录\n')
		ok = false
	}

	const winContentDir = path.join(steamPipeDir, 'content', 'win64')
	if (fs.existsSync(winContentDir)) {
		process.stdout.write('✅ Windows 构建产物已存在\n')
	} else {
		process.stdout.write('⚠️  Windows 构建产物未找到\n')
		process.stdout.write('   运行 "npm run dist:steam:win" 来构建 Steam 版本\n')
	}

	const appAsarPath = path.join(winContentDir, 'resources', 'app.asar')
	const nativeDir = path.join(winContentDir, 'resources', 'app.asar.unpacked', 'electron', 'platform', 'native', 'win32')
	if (fs.existsSync(appAsarPath) && fs.existsSync(nativeDir)) {
		process.stdout.write('✅ 原生模块已正确解压到 asarUnpacked\n')
	} else if (fs.existsSync(winContentDir)) {
		process.stdout.write('❌ 原生模块路径异常，请重新构建\n')
		ok = false
	}

	if (!steamUsername) {
		process.stdout.write('⚠️  未填写 Steam 用户名，上传时需要手动登录\n')
	} else {
		process.stdout.write(`✅ Steam 用户名已配置: ${steamUsername}\n`)
	}

	if (steamAppId && steamDepotIdWin) {
		process.stdout.write(`✅ AppID=${steamAppId}, WinDepot=${steamDepotIdWin}, 分支=${steamBranch || '默认'}\n`)
	} else {
		process.stdout.write('❌ AppID 或 Depot ID 未配置\n')
		ok = false
	}

	process.stdout.write('\n')

	if (!ok) {
		process.stdout.write('⚠️  配置验证发现问题，请检查后重试。\n')
		process.stdout.write('你可以随时重新运行 "npm run config:steam" 来修改配置。\n\n')
	} else {
		process.stdout.write('🎉 配置验证通过！\n\n')
		if (fs.existsSync(winContentDir) && steamUsername && finalPassword) {
			process.stdout.write('下一步：运行 "npm run upload:steam" 上传构建到 SteamPipe。\n')
		} else if (fs.existsSync(winContentDir)) {
			process.stdout.write('下一步：配置 Steam 账号密码后，运行 "npm run upload:steam" 上传构建。\n')
		} else {
			process.stdout.write('下一步：运行 "npm run dist:steam:win" 构建 Steam 版本，然后上传。\n')
		}
		process.stdout.write('\n')
	}
}

main().catch((e) => {
	process.stderr.write(`[config:steam] 错误: ${String(e?.message || e)}\n`)
	rl.close()
	process.exit(1)
})
