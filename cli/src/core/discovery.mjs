import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const RUNTIME_FILENAME = 'cli-control-server.json'
const PORT_SCAN_START = 52300
const PORT_SCAN_END = 52399

// CLI 自身路径推算项目根目录（bin/dvscli.mjs → ../../ = DVStudio 项目根）
const _cliDir = path.dirname(fileURLToPath(import.meta.url)) // cli/src/core/
const _projectRoot = path.resolve(_cliDir, '..', '..', '..') // DVStudio/

function readJson(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null
		return JSON.parse(fs.readFileSync(filePath, 'utf8'))
	} catch {
		return null
	}
}

function getRuntimeCandidates() {
	const candidates = []
	// 0. CLI 自身路径推算项目根目录（开发模式下最可靠）
	candidates.push(path.resolve(_projectRoot, 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	// 1. 便携模式（当前工作目录）
	candidates.push(path.resolve(process.cwd(), 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	// 2. 环境变量（与 Electron 主进程统一使用 DWEB_RESOURCE_DIR）
	const envResourceDir = process.env.DWEB_RESOURCE_DIR || process.env.DVS_RESOURCE_DIR
	if (envResourceDir) {
		candidates.push(path.resolve(envResourceDir, 'Runtime', RUNTIME_FILENAME))
	}
	// 3. 安装模式
	const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
	candidates.push(path.resolve(appData, 'DVStudio', 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	if (process.platform !== 'win32') {
		candidates.push(
			path.join(os.homedir(), '.dvstudio', 'DVSResource', 'Runtime', RUNTIME_FILENAME)
		)
	}
	return candidates
}

/**
 * 扫描指定端口是否有 DVStudio 控制服务器运行
 */
function scanPort(port, timeoutMs = 500) {
	return new Promise((resolve) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path: '/health',
				timeout: timeoutMs
			},
			(res) => {
				let data = ''
				res.on('data', (c) => {
					data += c
				})
				res.on('end', () => {
					try {
						const parsed = JSON.parse(data)
						if (parsed && parsed.running && parsed.app?.name === 'DVStudio') {
							resolve({ found: true, port, host: '127.0.0.1', needsToken: true })
						} else {
							resolve({ found: false, port })
						}
					} catch {
						resolve({ found: false, port })
					}
				})
			}
		)
		req.on('error', () => resolve({ found: false, port }))
		req.on('timeout', () => {
			req.destroy()
			resolve({ found: false, port })
		})
	})
}

/**
 * 自动发现 DVStudio 运行实例
 * 优先级：argv > 环境变量 > 端口文件 > 端口扫描
 */
export async function discoverInstance(argv = []) {
	// 1. argv 显式参数
	const getArgvValue = (flags) => {
		for (let i = 0; i < argv.length; i++) {
			const idx = flags.indexOf(argv[i])
			if (idx >= 0 && argv[i + 1]) return argv[i + 1]
			const eqMatch = argv[i].match(/^--([\w-]+)=(.+)$/)
			if (eqMatch && flags.includes(`--${eqMatch[1]}`)) return eqMatch[2]
		}
		return null
	}
	const explicitHost = getArgvValue(['--host']) || process.env.DVSCLI_HOST || '127.0.0.1'
	const explicitPort = getArgvValue(['--port']) || process.env.DVSCLI_PORT
	const explicitToken = getArgvValue(['--token']) || process.env.DVSCLI_TOKEN

	if (explicitPort) {
		return {
			host: explicitHost,
			port: parseInt(explicitPort, 10),
			token: explicitToken || '',
			source: explicitToken ? 'argv+token' : 'argv'
		}
	}

	// 2. 端口文件
	const candidates = getRuntimeCandidates()
	for (const file of candidates) {
		const cfg = readJson(file)
		if (cfg && cfg.host && cfg.port && cfg.token) {
			return {
				host: explicitHost && explicitHost !== cfg.host ? explicitHost : cfg.host,
				port: cfg.port,
				token: explicitToken || cfg.token,
				source: 'runtime-file',
				file
			}
		}
	}

	// 3. 端口扫描（慢速兜底）
	for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port++) {
		const r = await scanPort(port)
		if (r.found) {
			return {
				host: '127.0.0.1',
				port,
				token: explicitToken || '',
				source: 'port-scan'
			}
		}
	}

	return {
		found: false,
		host: explicitHost,
		port: 0,
		token: explicitToken || '',
		source: 'not-found'
	}
}
