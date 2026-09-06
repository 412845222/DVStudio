#!/usr/bin/env node
/**
 * DVStudio CLI Control Client — 直接 HTTP 调用已打开的 DVStudio 进程里的 CLI control server。
 *
 * 功能：
 *  - dvs-cli status              → 查询当前打开的 DVStudio /health
 *  - dvs-cli tools               → 查询可调用工具列表（带 token）
 *  - dvs-cli generate-image      → 提交「文生图」任务并等待结果（默认 seedream）
 *        --prompt "..."          ✅ 必填
 *        [--width 1024]
 *        [--height 1024]
 *        [--aspect-ratio 1:1]
 *        [--image-count 1]
 *        [--seed -1]
 *        [--negative-prompt ""]
 *        [--model seedream]      默认字节方舟 seedream
 *        [--project-id 0]        默认自动（当前打开的蓝图项目）
 *        [--output-path "abs/path"]
 *        [--reference "path"]    可重复，作为参考图
 *        [--no-wait]             不等待完成，只返回 taskId
 *        [--timeout 180]         等待超时秒（默认 180）
 *  - dvs-cli list-tasks [--limit 50] [--filter-source cli] [--status running|completed|...]
 *  - dvs-cli get-task --task-id <taskId>
 *  - dvs-cli cancel-task --task-id <taskId>
 *  - dvs-cli wait-task --task-id <taskId> [--timeout 180]
 *  - dvs-cli help
 *
 * 连接发现：
 *  - 优先读 env DWEB_RESOURCE_DIR/Runtime/cli-control-server.json
 *  - 否则读 cwd/DVSResource/Runtime/cli-control-server.json
 *  - 否则读 %APPDATA%/DVSResource/Runtime/cli-control-server.json
 *  - 若设置 DVS_CLI_HOST / DVS_CLI_PORT / DVS_CLI_TOKEN 环境变量，直接使用（跳过文件发现）
 *
 * 返回：stdout 输出 JSON（成功时包含 ok=true + data），非 0 退出码表示失败。
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RUNTIME_FILENAME = 'cli-control-server.json'
const TOKEN_HEADER = 'x-dvs-cli-token'

const HELP_TEXT = `DVStudio CLI (dvs-cli) — 直接调用已打开的 DVStudio 客户端执行 AI 工作流操作。

USAGE:
  dvs-cli <command> [options]

COMMANDS:
  status                               查询 CLI control 服务健康状态（无需 token）
  tools                                查询当前可调用的 Agent 工具列表
  generate-image                       提交文生图任务（默认字节方舟 seedream）
  list-tasks                           列出最近 CLI 任务
  get-task --task-id <ID>              查询单个任务详情
  cancel-task --task-id <ID>           取消任务
  wait-task --task-id <ID>             轮询等待任务完成
  help                                 显示此帮助

GENERATE-IMAGE 常用参数:
  --prompt "..."                       【必填】描述文本
  --width <number>                     默认 1024
  --height <number>                    默认 1024
  --aspect-ratio <s>                   如 1:1 / 16:9 / 3:4
  --image-count <n>                    生成数量，默认 1
  --seed <n>                           随机种子，-1 表示随机
  --negative-prompt "..."              反向提示
  --model <name>                       模型名，默认 seedream
  --project-id <num>                   指定蓝图项目 ID（默认当前打开的项目）
  --output-path <path>                 输出绝对路径或文件名（默认蓝图项目 Content/Media）
  --reference <path>                   可重复，参考图/参考素材路径
  --no-wait                            只提交不等待完成，立即返回 taskId
  --timeout <seconds>                  等待超时，默认 180 秒

连接方式 (自动发现或环境变量覆盖):
  DVS_CLI_HOST=127.0.0.1
  DVS_CLI_PORT=523xx
  DVS_CLI_TOKEN=dvs_cli_...
  DWEB_RESOURCE_DIR=...                 Runtime 所在父目录
`

function logErr(...args) {
	process.stderr.write(args.map(String).join(' ') + '\n')
}

function requestJson({ method, host, port, pathname, token, body, timeoutMs = 15000 }) {
	return new Promise((resolve) => {
		const headers = {}
		let bodyData = null
		if (token) headers[TOKEN_HEADER] = token
		if (body !== undefined) {
			bodyData = JSON.stringify(body)
			headers['Content-Type'] = 'application/json'
		}
		const req = http.request(
			{
				hostname: host || '127.0.0.1',
				port,
				path: pathname,
				method,
				headers,
				timeout: timeoutMs
			},
			(res) => {
				let raw = ''
				res.on('data', (c) => {
					raw += c
				})
				res.on('end', () => {
					let parsed
					try {
						parsed = raw ? JSON.parse(raw) : {}
					} catch (_) {
						parsed = { raw }
					}
					resolve({ status: res.statusCode, data: parsed })
				})
			}
		)
		req.on('error', (e) =>
			resolve({ status: 0, data: { error: 'HTTP_ERROR', code: e.code, message: e.message } })
		)
		req.on('timeout', () => {
			req.destroy(new Error('TIMEOUT'))
		})
		if (bodyData) req.write(bodyData)
		req.end()
	})
}

function discoverRuntimeFile() {
	const candidates = []
	const envResourceDir = String(
		process.env.DWEB_RESOURCE_DIR || process.env.DVS_RESOURCE_DIR || ''
	).trim()
	if (envResourceDir) candidates.push(path.resolve(envResourceDir, 'Runtime', RUNTIME_FILENAME))

	// Portable / installed layout (any drive letter):
	// Packaged layout:  this file lives in  <InstallDir>\resources\app\node_modules\... (via asar)
	//                   OR as <InstallDir>\resources\bin\ -> 2 levels up = <InstallDir>
	// Dev repo layout:  this file lives in  <Repo>\DVStudio\electron\backend\modules\cli-control-server\
	//                   4 levels up = <Repo>\DVStudio = project root
	// Use import.meta.dirname as the stable anchor so runtime discovery doesn't depend on CWD.
	try {
		const here = String(import.meta.dirname || '').trim()
		if (here) {
			// First try packaged bin layout (2 up from ...\resources\bin):
			const binRoot = path.resolve(here, '..', '..')
			candidates.push(path.resolve(binRoot, 'DVSResource', 'Runtime', RUNTIME_FILENAME))
			// Dev repo layout (4 up from electron/backend/modules/cli-control-server):
			const devRoot = path.resolve(here, '..', '..', '..', '..')
			if (devRoot !== binRoot) {
				candidates.push(path.resolve(devRoot, 'DVSResource', 'Runtime', RUNTIME_FILENAME))
			}
		}
	} catch {
		/* ignore */
	}

	candidates.push(path.resolve(process.cwd(), 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	const appData = String(process.env.APPDATA || process.env.XDG_CONFIG_HOME || '').trim()
	if (appData) {
		// Installed Electron app writes runtime here (matches resolveRuntimeDir in httpServer.mjs).
		// APPDATA always lives on the USER PROFILE drive (typically C:) regardless of where the
		// .exe was installed.
		candidates.push(path.resolve(appData, 'DVStudio', 'DVSResource', 'Runtime', RUNTIME_FILENAME))
		candidates.push(path.resolve(appData, 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	}
	candidates.push(path.resolve(os.homedir(), '.dvs', 'DVSResource', 'Runtime', RUNTIME_FILENAME))
	for (const p of candidates) {
		try {
			if (fs.existsSync(p)) return { ok: true, filePath: p }
		} catch {
			/* ignore */
		}
	}
	return { ok: false, candidates }
}

function readRuntime() {
	// 环境变量直接覆盖
	const envHost = String(process.env.DVS_CLI_HOST || '').trim()
	const envPort = Number(process.env.DVS_CLI_PORT || 0)
	const envToken = String(process.env.DVS_CLI_TOKEN || '').trim()
	if (envPort > 0) {
		return {
			ok: true,
			host: envHost || '127.0.0.1',
			port: envPort,
			token: envToken || undefined,
			from: 'env'
		}
	}
	const d = discoverRuntimeFile()
	if (!d.ok) {
		return {
			ok: false,
			error: 'DVStudio not running: CLI control server runtime file not found',
			candidates: d.candidates
		}
	}
	try {
		const raw = fs.readFileSync(d.filePath, 'utf-8')
		const cfg = JSON.parse(raw)
		return {
			ok: true,
			host: String(cfg.host || '127.0.0.1').trim() || '127.0.0.1',
			port: Number(cfg.port || 0),
			token: String(cfg.token || '').trim() || undefined,
			pid: Number(cfg.pid || 0) || undefined,
			version: String(cfg.version || ''),
			startedAt: cfg.startedAt,
			filePath: d.filePath,
			from: 'file'
		}
	} catch (e) {
		return {
			ok: false,
			error: `Runtime file parse failed: ${String(e?.message || e)}`,
			filePath: d.filePath
		}
	}
}

function parseArgs(argv) {
	const arr = [...argv]
	const positional = []
	const opts = {}
	while (arr.length) {
		const a = arr.shift()
		if (!a.startsWith('-')) {
			positional.push(a)
			continue
		}
		// 支持 --flag 或 --key value
		const eqMatch = /^--([^=]+)=(.*)$/.exec(a)
		if (eqMatch) {
			opts[eqMatch[1].replace(/-/g, '')] = eqMatch[2]
			continue
		}
		const key = a.replace(/^-+/, '').replace(/-/g, '')
		if (key === 'help' || key === 'h') {
			opts.help = true
			continue
		}
		// 下一个元素不以 - 开头，就消费它作为 value
		const next = arr[0]
		if (next && !next.startsWith('-')) {
			opts[key] = arr.shift()
		} else {
			// --no-xxx 处理
			if (/^no[A-Z]/.test(key)) {
				const rawKey = key.slice(2).replace(/^[A-Z]/, (c) => c.toLowerCase())
				opts[rawKey] = false
			} else {
				opts[key] = true
			}
		}
	}
	return { positional, opts }
}

function collectMulti(opts, key) {
	// 允许 --reference a --reference b，同时兼容 --references "a;b"
	const v = opts[key]
	if (v === undefined) return []
	if (Array.isArray(v)) return v.filter(Boolean)
	if (typeof v === 'string') {
		return v
			.split(';')
			.map((s) => s.trim())
			.filter(Boolean)
	}
	return [String(v)].filter(Boolean)
}
// 由于上面 parseArgs 只保留最后一个同名项，这里扩展 parseArgs 支持重复
function parseArgsMulti(argv) {
	const arr = [...argv]
	const positional = []
	const opts = {}
	const push = (k, val) => {
		if (k in opts) {
			if (Array.isArray(opts[k])) opts[k].push(val)
			else opts[k] = [opts[k], val]
		} else {
			opts[k] = val
		}
	}
	while (arr.length) {
		const a = arr.shift()
		if (!a.startsWith('-')) {
			positional.push(a)
			continue
		}
		const eqMatch = /^--([^=]+)=(.*)$/.exec(a)
		if (eqMatch) {
			push(eqMatch[1].replace(/-/g, ''), eqMatch[2])
			continue
		}
		const rawKey = a.replace(/^-+/, '')
		const key = rawKey.replace(/-/g, '')
		if (rawKey === 'help' || rawKey === 'h') {
			opts.help = true
			continue
		}
		const next = arr[0]
		if (next && !next.startsWith('-')) {
			push(key, arr.shift())
		} else if (rawKey.startsWith('no-')) {
			const noStripped = rawKey.slice(3).replace(/-/g, '')
			opts[noStripped] = false
		} else {
			push(key, true)
		}
	}
	return { positional, opts }
}

async function waitForTask({ rt, taskId, timeoutS, pollMs = 1000 }) {
	const deadline = Date.now() + timeoutS * 1000
	while (Date.now() < deadline) {
		const r = await requestJson({
			method: 'GET',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: `/v1/tasks/${encodeURIComponent(taskId)}`
		})
		if (r.status === 200 && r.data?.ok && r.data?.task) {
			const st = String(r.data.task.status || '').toLowerCase()
			if (st !== 'running' && st !== 'pending') {
				return { done: true, response: r }
			}
		}
		await new Promise((res) => setTimeout(res, pollMs))
	}
	const last = await requestJson({
		method: 'GET',
		host: rt.host,
		port: rt.port,
		token: rt.token,
		pathname: `/v1/tasks/${encodeURIComponent(taskId)}`
	})
	return { done: false, timeout: true, response: last }
}

async function main() {
	const { positional, opts } = parseArgsMulti(process.argv.slice(2))
	const cmd = positional[0] || 'help'

	if (opts.help || cmd === 'help' || cmd === '--help' || cmd === '-h') {
		process.stdout.write(HELP_TEXT)
		process.exit(0)
	}

	const rt = readRuntime()
	if (!rt.ok) {
		logErr(`[dvs-cli] 无法连接到 DVStudio。请先启动 DVStudio（或 dev:electron）。
  运行时文件发现失败: ${rt.error}
  候选路径: ${JSON.stringify(rt.candidates || [], null, 2)}`)
		process.exit(10)
	}

	if (cmd === 'status' || cmd === 'health') {
		const r = await requestJson({
			method: 'GET',
			host: rt.host,
			port: rt.port,
			pathname: '/health'
		})
		if (r.status === 200) {
			process.stdout.write(JSON.stringify({ ok: true, runtime: rt, data: r.data }, null, 2) + '\n')
			process.exit(0)
		}
		process.stdout.write(
			JSON.stringify({ ok: false, status: r.status, error: r.data, runtime: rt }, null, 2) + '\n'
		)
		process.exit(1)
	}

	if (cmd === 'tools') {
		const r = await requestJson({
			method: 'GET',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: '/tools'
		})
		process.stdout.write(JSON.stringify(r.data, null, 2) + '\n')
		process.exit(r.status === 200 ? 0 : 2)
	}

	if (cmd === 'generate-image') {
		const prompt = String(opts.prompt || '').trim()
		if (!prompt) {
			logErr('[dvs-cli] generate-image 需要 --prompt 参数')
			process.stdout.write(JSON.stringify({ ok: false, error: 'MISSING_PROMPT' }, null, 2) + '\n')
			process.exit(400)
		}
		const payload = { prompt }
		if (opts.width !== undefined) payload.width = Number(opts.width) || undefined
		if (opts.height !== undefined) payload.height = Number(opts.height) || undefined
		if (opts.aspectratio !== undefined) payload.aspectRatio = String(opts.aspectratio)
		if (opts.imagecount !== undefined) payload.imageCount = Number(opts.imagecount) || 1
		if (opts.seed !== undefined) payload.seed = Number(opts.seed)
		if (opts.negativeprompt !== undefined) payload.negativePrompt = String(opts.negativeprompt)
		payload.model =
			typeof opts.model === 'string' && opts.model.trim() ? opts.model.trim() : 'seedream'
		if (opts.projectid !== undefined) payload.projectId = Number(opts.projectid)
		if (opts.outputpath !== undefined) payload.outputPath = String(opts.outputpath)
		const refs = collectMulti(opts, 'reference').concat(collectMulti(opts, 'references'))
		if (refs.length) payload.references = refs

		const create = await requestJson({
			method: 'POST',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: '/v1/generate-image',
			body: payload,
			timeoutMs: 30000
		})
		if (create.status !== 200 || !create.data?.ok) {
			process.stdout.write(
				JSON.stringify({ ok: false, status: create.status, error: create.data, payload }, null, 2) +
					'\n'
			)
			process.exit(3)
		}
		const taskId = create.data.taskId
		const wait = opts.wait === false ? false : true
		if (!wait) {
			process.stdout.write(
				JSON.stringify(
					{ ok: true, taskId, status: create.data.status, submitted: create.data },
					null,
					2
				) + '\n'
			)
			process.exit(0)
		}
		const timeoutS = Number(opts.timeout || 180) || 180
		const w = await waitForTask({ rt, taskId, timeoutS })
		process.stdout.write(
			JSON.stringify(
				{
					ok: w.done && w.response.data?.task?.status === 'completed',
					timeout: !!w.timeout,
					taskId,
					task: w.response.data?.task || null,
					raw: w.response.data
				},
				null,
				2
			) + '\n'
		)
		process.exit(w.done && w.response.data?.task?.status === 'completed' ? 0 : 4)
	}

	if (cmd === 'list-tasks' || cmd === 'list') {
		const limit = Number(opts.limit || 50) || 50
		const offset = Number(opts.offset || 0) || 0
		const qs = new URLSearchParams()
		qs.set('limit', String(limit))
		qs.set('offset', String(offset))
		const fs = String(opts.filtersource || opts.source || '').trim()
		if (fs) qs.set('filterSource', fs)
		const st = String(opts.status || '').trim()
		if (st) qs.set('status', st)
		const r = await requestJson({
			method: 'GET',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: `/v1/tasks?${qs.toString()}`
		})
		process.stdout.write(JSON.stringify(r.data, null, 2) + '\n')
		process.exit(r.status === 200 ? 0 : 5)
	}

	if (cmd === 'get-task') {
		const id = String(opts.taskid || opts.taskId || '').trim()
		if (!id) {
			logErr('[dvs-cli] get-task 需要 --task-id')
			process.exit(400)
		}
		const r = await requestJson({
			method: 'GET',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: `/v1/tasks/${encodeURIComponent(id)}`
		})
		process.stdout.write(JSON.stringify(r.data, null, 2) + '\n')
		process.exit(r.status === 200 ? 0 : 6)
	}

	if (cmd === 'cancel-task') {
		const id = String(opts.taskid || opts.taskId || '').trim()
		if (!id) {
			logErr('[dvs-cli] cancel-task 需要 --task-id')
			process.exit(400)
		}
		const r = await requestJson({
			method: 'POST',
			host: rt.host,
			port: rt.port,
			token: rt.token,
			pathname: `/v1/tasks/${encodeURIComponent(id)}/cancel`,
			body: {}
		})
		process.stdout.write(JSON.stringify(r.data, null, 2) + '\n')
		process.exit(r.status === 200 && r.data?.ok ? 0 : 7)
	}

	if (cmd === 'wait-task') {
		const id = String(opts.taskid || opts.taskId || '').trim()
		if (!id) {
			logErr('[dvs-cli] wait-task 需要 --task-id')
			process.exit(400)
		}
		const timeoutS = Number(opts.timeout || 180) || 180
		const w = await waitForTask({ rt, taskId: id, timeoutS })
		process.stdout.write(
			JSON.stringify(
				{
					ok: w.done && w.response.data?.task?.status === 'completed',
					timeout: !!w.timeout,
					taskId: id,
					task: w.response.data?.task || null,
					raw: w.response.data
				},
				null,
				2
			) + '\n'
		)
		process.exit(w.done && w.response.data?.task?.status === 'completed' ? 0 : 8)
	}

	logErr(`[dvs-cli] 未知命令: ${cmd}。使用 dvs-cli help 查看用法。`)
	process.exit(9)
}

process.on('uncaughtException', (e) => {
	logErr('[dvs-cli][uncaughtException]', e)
	process.exit(99)
})
process.on('unhandledRejection', (e) => {
	logErr('[dvs-cli][unhandledRejection]', e)
	process.exit(98)
})

main()
