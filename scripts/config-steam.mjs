import readline from 'node:readline'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadSteamEnv } from './steam-env.mjs'

loadSteamEnv()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const steamPipeDir = path.join(repoRoot, 'steam-pipe')
const envPath = path.join(steamPipeDir, '.env')

function readSteamConfigJson() {
	const candidates = [
		path.join(repoRoot, 'steam.config.json'),
		path.join(repoRoot, 'electron', 'steam.config.json')
	]
	for (const p of candidates) {
		try {
			if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
		} catch {
			/* ignore */
		}
	}
	return {}
}

const steamConfig = readSteamConfigJson()

const ENV_EXAMPLE_CONTENT = `# ============================================================
# Steam 构建与上传环境配置
# ============================================================
# 使用方式：
#   1. 运行 npm run config:steam 交互式配置
#   2. 或者直接在命令行通过参数传递（优先级更高）
#   3. 或者设置系统环境变量
#
# 配置优先级：命令行参数 > 环境变量 > .env 文件
#
# ============================================================
# 日常发布命令：
# ============================================================
#
# 🔧 仅构建（不上传）：
#    npm run build:steam
#
# 📤 仅上传（需要已有构建产物 steam-pipe/content/win64）：
#    npm run upload:steam
#
# 🚀 构建 + 上传（推荐日常使用，上传到 beta 分支）：
#    npm run release:steam -- --guard=XXXXX
#
# 🌍 构建 + 上传 + 自动发布到分支：
#    npm run release:steam:live -- --guard=XXXXX --branch=beta
#
# 🧪 试运行（只生成VDF不实际上传）：
#    npm run upload:steam -- --dry-run
#
# ============================================================
# 命令行参数说明（使用 -- 传递给 npm 脚本）：
# ============================================================
#   --guard=XXXXX    Steam Guard 验证码（5位字母，手机APP生成）
#   --user=xxx       Steam 用户名（覆盖 .env 配置）
#   --pass=xxx       Steam 密码（覆盖 .env 配置）
#   --branch=xxx     目标分支名（默认 beta）
#   --set-live       上传后自动发布到指定分支（不指定则仅上传不发布）
#   --desc="xxx"     构建描述文字
#   --appid=xxx      AppID（从 steam.config.json 读取或手动输入）
#   --dry-run        试运行模式，不实际上传
#
# ============================================================
# 环境变量（也可以写在 .env 文件中）：
# ============================================================

# Steam App ID（必填，在 Steamworks 后台获取）
STEAM_APP_ID=

# Depot ID（上传时必填，在 Steamworks 后台创建）
STEAM_DEPOT_ID_WIN=
STEAM_DEPOT_ID_MAC=
STEAM_DEPOT_ID_LINUX=

# Steam 构建账户（建议使用专用构建账户，仅授予发布权限）
# 如果留空，命令行必须传 --user 参数
STEAM_USERNAME=
STEAM_PASSWORD=

# Steam Guard 验证码（可选）
# 注意：验证码每30秒刷新，请获取最新的再运行命令
# 首次成功登录后 steamcmd 会缓存 sentry 文件，后续登录可能不需要验证码
# 建议通过命令行 --guard=XXXXX 传入，避免写在文件中
STEAM_GUARD_CODE=

# Steam 分支（可选，默认为 beta）
# 设置为空字符串 "" 表示发布到默认公开分支（谨慎！）
STEAM_BRANCH=beta

# 构建描述（可选）
STEAM_BUILD_DESC=
`

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
	if (typeof filePath === 'string' && fs.existsSync(filePath)) {
		return parseEnvContent(fs.readFileSync(filePath, 'utf8'))
	}
	return {}
}

function parseEnvContent(content) {
	const result = {}
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
	const exampleContent = ENV_EXAMPLE_CONTENT
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
	const exampleConfig = parseEnvContent(ENV_EXAMPLE_CONTENT)
	const defaults = { ...exampleConfig, ...existingConfig }

	const configAppId = steamConfig.appId ? String(steamConfig.appId) : process.env.STEAM_APP_ID || ''
	const defaultAppId = defaults.STEAM_APP_ID || configAppId || ''
	const steamAppId = await question('Steam App ID', defaultAppId)
	const steamDepotIdWin = await question('Windows Depot ID', defaults.STEAM_DEPOT_ID_WIN || '')
	const steamDepotIdMac = await question(
		'Mac Depot ID (不发布 Mac 可留空)',
		defaults.STEAM_DEPOT_ID_MAC || ''
	)
	const steamDepotIdLinux = await question(
		'Linux Depot ID (不发布 Linux 可留空)',
		defaults.STEAM_DEPOT_ID_LINUX || ''
	)
	const steamBranch = await question(
		'发布分支 (beta=测试, 空=正式)',
		defaults.STEAM_BRANCH || 'beta'
	)

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
		steamGuardCode = await question(
			'Steam Guard 验证码 (首次登录需要)',
			defaults.STEAM_GUARD_CODE || ''
		)
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
	const nativeDir = path.join(
		winContentDir,
		'resources',
		'app.asar.unpacked',
		'electron',
		'platform',
		'native',
		'win32'
	)
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
		process.stdout.write(
			`✅ AppID=${steamAppId}, WinDepot=${steamDepotIdWin}, 分支=${steamBranch || '默认'}\n`
		)
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
			process.stdout.write(
				'下一步：配置 Steam 账号密码后，运行 "npm run upload:steam" 上传构建。\n'
			)
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
