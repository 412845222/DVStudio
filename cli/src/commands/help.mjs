import { printText, printJson } from '../core/output.mjs'
import { EXIT_CODES, getExitCodeName } from '../core/exitCodes.mjs'

const CLI_NAME = 'dvscli'
const CLI_VERSION = '0.2.4'
const CLI_DESC =
	'DVStudio 本地跨进程 CLI 控制接口：让其他 Agent/脚本/流水线通过 127.0.0.1 + Token 控制已打开的 DVStudio AI 工作流蓝图'
const DEFAULT_IMAGE_MODEL = 'doubao-seedream-4-5-251128' // 字节方舟 Seedream 4.5

// ————— MCP 风格工具定义（给其他 Agent / MCP Client 动态解析）—————
export const MCP_TOOLS_DEF = [
	{
		name: 'generate_image',
		description:
			'图片生成（P3 后端字节方舟 Seedream 直连优先，失败降级到 P2 Agent Runtime 调用，最后兜底 P1 蓝图节点流水线）。\n' +
			'默认模型：doubao-seedream-4-5-251128。不传 model 或传 gemini/gpt 等非兼容 ID 会被自动回退到默认 Seedream 模型。\n' +
			'不传 outputPath 时默认落盘到 <蓝图项目根>/generated_media/<项目名>/images/，并在蓝图上自动创建 image 类型预览节点。',
		parameters: {
			type: 'object',
			required: ['prompt'],
			properties: {
				prompt: { type: 'string', minLength: 1, description: '图片生成提示词（正向，必填）' },
				width: {
					type: 'number',
					description: '图片宽度像素（例 1024）。与 aspectRatio 二选一，推荐 aspectRatio',
					default: 1024
				},
				height: { type: 'number', description: '图片高度像素（例 1024）', default: 1024 },
				aspectRatio: {
					type: 'string',
					enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
					description: '宽高比（与 width/height 二选一，推荐使用此参数）'
				},
				references: {
					type: 'array',
					items: { type: 'string' },
					description: '参考图本地绝对路径列表（图生图/多参考图模式），每项必须是磁盘绝对路径'
				},
				negativePrompt: { type: 'string', description: '负向提示词（可选）' },
				model: {
					type: 'string',
					default: DEFAULT_IMAGE_MODEL,
					description:
						`生成模型 ID。默认 ${DEFAULT_IMAGE_MODEL}（字节方舟 Seedream）。` +
						'传 gemini / gpt 等非 Seedream 兼容 ID 会被自动回退为默认 Seedream 模型并在日志打 WARN，不会中断任务。' +
						'自定义 Seedream 兼容模型 ID 示例：doubao-seedream-5-0-250528。'
				},
				imageCount: {
					type: 'number',
					minimum: 1,
					maximum: 16,
					description: '生成图片数量（1-16，默认 1）',
					default: 1
				},
				seed: {
					type: 'number',
					description: '随机种子（默认 -1 = 随机；传相同整数可复现输出内容）',
					default: -1
				},
				outputPath: {
					type: 'string',
					description:
						'生成完成后复制到的目标路径（绝对路径）。' +
						'目录：输出按 seedream-<timestamp>-<n>.png 命名；' +
						'文件路径且 imageCount=1：直接复制为指定文件名；多个图时按 outputPath 文件名加 _<n> 后缀。' +
						'⚠️ 不传时默认落盘到 当前蓝图项目根/generated_media/<项目名>/images/（自动 mkdir -p）'
				},
				projectId: {
					type: 'number',
					description: '目标项目 ID（默认使用当前 DVStudio 已打开的蓝图项目）'
				},
				autoExport: {
					type: 'boolean',
					description: '完成后是否自动将结果复制到 outputPath（默认 true）',
					default: true
				}
			}
		},
		returns: {
			type: 'object',
			properties: {
				ok: { type: 'boolean', description: '是否成功' },
				taskId: { type: 'string', description: '任务 ID（可用于 task query/cancel）' },
				nodeId: {
					type: 'string',
					description: '蓝图上自动创建的 image 预览节点 ID（可用于 UI 跳转定位）'
				},
				provider: {
					type: 'string',
					enum: ['seedream', 'node-pipeline'],
					description: '实际使用的执行路径。seedream=字节方舟直连；node-pipeline=P2/P1 蓝图节点执行'
				},
				status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'canceled'] },
				note: { type: 'string', description: '执行备注（直连成功 / 降级原因 / 失败简要信息）' },
				outputFiles: {
					type: 'array',
					items: { type: 'string' },
					description: '内部临时目录生成的原始文件路径列表（可能被清理，不要作为最终结果消费）'
				},
				exportedFiles: {
					type: 'array',
					items: { type: 'string' },
					description:
						'已复制到 outputPath / 项目 generated_media 目录的最终结果文件路径列表（⚠️ 外部集成请优先使用这个字段）'
				}
			}
		},
		cliExample: [
			'dvscli generate-image --prompt "一只布偶猫戴着太空头盔漂浮在星空中" --aspect-ratio 1:1 --seed 42',
			'dvscli generate-image -p "赛博朋克城市天际线，雨天" -a 16:9 -o G:/outputs/city --json',
			'dvscli generate-image -p "转成宫崎骏风格" -r C:/ref/photo.jpg --aspect-ratio 3:4'
		]
	}
]

// ————— 子命令定义 —————
const COMMANDS_DEF = [
	{
		name: 'status',
		usage: 'dvscli status [--json]',
		description:
			'检查 DVStudio 客户端是否运行 + CLI 控制服务器状态 + 当前蓝图项目 + Agent 就绪 + 已注册 MCP 工具数量'
	},
	{
		name: 'generate-image',
		aliases: ['generateImage', 'gen-img'],
		usage:
			'dvscli generate-image --prompt <text> [-a 1:1|16:9|9:16|4:3|3:4] [-w px] [-h px] [-r refPath]... [-o outputPathOrDir] [-n 1..16] [-s seed] [--negative-prompt "..."] [--no-auto-export] [--no-wait] [--json]',
		description:
			'图片生成（P3 字节方舟 Seedream 直连 → P2 Agent Runtime → P1 蓝图节点，逐级降级）。默认模型 doubao-seedream-4-5-251128。默认输出目录 <项目根>/generated_media/<项目名>/images/，默认在蓝图上创建 image 预览节点。'
	},
	{
		name: 'task query',
		usage: 'dvscli task query <taskId> [--json]',
		description: '查询任务状态/进度/输出文件路径列表；用于 --no-wait 提交后轮询'
	},
	{
		name: 'task cancel',
		usage: 'dvscli task cancel <taskId> [--json]',
		description:
			'取消一个 queued/running 任务（best-effort；已进入后端直连阶段的任务将无法中断，会继续运行到结束再回收）'
	},
	{
		name: 'tools list',
		usage: 'dvscli tools list [--json]',
		description:
			'列出所有可用 MCP 风格工具（含 JSON Schema 参数定义 / 返回定义 / CLI 示例）。' +
			'给另一个 Agent / MCP Client / 脚本做动态集成时建议先跑这个命令拿到完整 Schema，不要硬编码字段。'
	},
	{
		name: 'help',
		usage: 'dvscli help [command] [--json]',
		description:
			'显示 CLI 帮助。不带 command 时输出全局摘要；带 command（如 generate-image）时输出该命令的详细参数与示例。'
	}
]

// ————— 全局参数 —————
const GLOBAL_OPTIONS = [
	{
		name: '--json',
		description: '以 JSON 格式输出（建议给其他 Agent / 程序解析时使用；文本模式下是给人读的段落）'
	},
	{
		name: '--host <host>',
		env: 'DVSCLI_HOST',
		description: '自定义控制服务器地址（默认 127.0.0.1）'
	},
	{
		name: '--port <port>',
		env: 'DVSCLI_PORT',
		description: '自定义控制服务器端口（默认自动通过运行时配置文件/端口扫描发现，52300-52399）'
	},
	{
		name: '--token <token>',
		env: 'DVSCLI_TOKEN',
		description:
			'自定义鉴权 Token（默认自动读取 <DWEB_RESOURCE_DIR>/Runtime/cli-control-server.json）'
	},
	{
		name: '--timeout <ms>',
		description: '请求超时（毫秒，默认 600000=10 分钟；生图慢时不要改太小）'
	},
	{ name: '--help, -h', description: '显示帮助' },
	{ name: '--version, -v', description: '显示 CLI 与 Node.js 版本' }
]

// ————— 退出码表 —————
function buildExitCodesTable() {
	return Object.entries(EXIT_CODES)
		.filter(([k]) => typeof EXIT_CODES[k] === 'number' && !k.startsWith('_'))
		.map(([name, code]) => ({ code, name, description: getExitCodeName(code) }))
		.sort((a, b) => a.code - b.code)
}

export function buildHelpJson(subcommand) {
	const base = {
		cliName: CLI_NAME,
		version: CLI_VERSION,
		description: CLI_DESC,
		discovery: {
			priority: [
				'1) CLI 显式参数 --host/--port/--token',
				'2) 环境变量 DVSCLI_HOST / DVSCLI_PORT / DVSCLI_TOKEN',
				'3) <DWEB_RESOURCE_DIR>/Runtime/cli-control-server.json',
				'4) 便携模式 $CWD/DVSResource/Runtime/cli-control-server.json',
				'5) 端口扫描兜底 127.0.0.1:52300-52399 GET /health'
			],
			runtimeFile: {
				schema: {
					host: '127.0.0.1',
					port: 52306,
					token: 'dvs_cli_<random>',
					createdAt: 1787142036205,
					pid: 33124
				}
			},
			healthEndpoint: 'GET http://127.0.0.1:<port>/health (公开，无需 Token)'
		},
		globalOptions: GLOBAL_OPTIONS,
		commands: COMMANDS_DEF,
		mcpStyleTools: MCP_TOOLS_DEF,
		exitCodes: buildExitCodesTable(),
		httpEndpoints: [
			{ method: 'GET', path: '/health', auth: false, description: '健康检查（公开端点）' },
			{
				method: 'GET',
				path: '/v1/status',
				auth: true,
				description: '等价于 status 命令（含 currentProject.id/name/rootDir）'
			},
			{
				method: 'POST',
				path: '/v1/generate-image',
				auth: true,
				description: '提交生图任务，body=MCP TOOL generate_image 参数 JSON'
			},
			{
				method: 'GET',
				path: '/v1/task/:taskId',
				auth: true,
				description: '查询任务（status + outputFiles + exportedFiles）'
			},
			{ method: 'POST', path: '/v1/task/:taskId/cancel', auth: true, description: '取消任务' },
			{
				method: 'GET',
				path: '/v1/tools/list',
				auth: true,
				description: 'MCP 风格工具定义 JSON（等价 dvscli tools list --json）'
			},
			{
				method: 'POST',
				path: '/v1/tools/call',
				auth: true,
				description: '直接后端 in-process 调用工具：{name, args, timeoutMs?}'
			},
			{
				method: 'POST',
				path: '/v1/agent/submit',
				auth: true,
				description: '提交到 Agent 对话框执行（P2 路径，需蓝图页面打开）'
			}
		],
		integrationChecklist: [
			'Run `dvscli status --json` and check running===true before anything else',
			'Use generate-image for assets. Do NOT hand-write create_node+execute_node combo unless you know exactly why.',
			'Omit `model` to use default Seedream 4.5. Do NOT pass "gemini" or chat model IDs for image generation.',
			'Use `exportedFiles[]` not `outputFiles[]` when consuming output.',
			'Poll `task query <id>` every ~2s when submitted with --no-wait.'
		]
	}

	if (
		subcommand === 'generate-image' ||
		subcommand === 'generateImage' ||
		subcommand === 'gen-img'
	) {
		const tool = MCP_TOOLS_DEF[0]
		return {
			...base,
			command: 'generate-image',
			usage: COMMANDS_DEF.find((c) => c.name === 'generate-image').usage,
			aliases: COMMANDS_DEF.find((c) => c.name === 'generate-image').aliases,
			parameters: tool.parameters,
			returns: tool.returns,
			examples: tool.cliExample,
			pipeline: {
				'P3 - Backend Direct (fastest)':
					'generateImageHandler() → generateImageViaSeedream() → VolcanoEngine Ark images/generations API → download → autoExport + create image node',
				'P2 - Agent Runtime (fallback)':
					'useCLIAgentTrigger builds system prompt w/ Seedream model → ToolExecutor calls generate_image in-process',
				'P1 - Blueprint Node (last resort)':
					'create_node(image-generation) → execute_node → frontend poll'
			},
			defaultOutputDir:
				'When outputPath omitted: <当前蓝图项目根目录>/generated_media/<项目名>/images/seedream-<timestamp>-<n>.png. Auto mkdir -p.'
		}
	}

	if (subcommand && typeof subcommand === 'string') {
		// 通用子命令：返回 base + 该命令的 usage/description
		const cmd = COMMANDS_DEF.find((c) => c.name === subcommand || c.aliases?.includes(subcommand))
		if (cmd) return { ...base, command: subcommand, usage: cmd.usage, description: cmd.description }
		return {
			...base,
			command: subcommand,
			unknown: true,
			message: `Unknown subcommand: ${subcommand}`
		}
	}

	return base
}

function padEnd(str, n) {
	const s = String(str || '')
	if (s.length >= n) return s
	return s + ' '.repeat(n - s.length)
}

export function runHelpCommand(ctx, subcommand) {
	const json = buildHelpJson(subcommand)
	if (ctx.isJson) {
		printJson(json)
		return EXIT_CODES.OK
	}

	// ————— 给人读的文本输出 —————
	const lines = []
	lines.push(`${CLI_NAME} v${json.version}`)
	lines.push(json.description)
	lines.push('')

	// 命令特定
	if (json.command === 'generate-image') {
		lines.push(`Command: ${json.command}  (aliases: ${(json.aliases || []).join(', ')})`)
		lines.push(`Usage:   ${json.usage}`)
		lines.push('')
		lines.push('三段流水线（逐级降级，全部自动）:')
		for (const [k, v] of Object.entries(json.pipeline || {})) lines.push(`  - ${k}\n      ${v}`)
		lines.push('')
		lines.push(
			`默认模型: ${DEFAULT_IMAGE_MODEL}（字节方舟 Seedream 4.5，传 gemini/gpt 等非兼容 ID 会自动回退并在后端日志打 WARN）`
		)
		lines.push(`默认输出目录: ${json.defaultOutputDir}`)
		lines.push('')
		lines.push('Parameters:')
		const props = json.parameters.properties
		for (const [k, v] of Object.entries(props)) {
			const cliFlag = '--' + k.replace(/([A-Z])/g, '-$1').toLowerCase()
			const required = json.parameters.required?.includes(k) ? ' (required)' : ''
			const def = v.default !== undefined ? ` [default: ${JSON.stringify(v.default)}]` : ''
			lines.push(`  ${padEnd(cliFlag, 22)} ${v.description}${required}${def}`)
		}
		lines.push('')
		lines.push('Returns:')
		const rets = json.returns.properties
		for (const [k, v] of Object.entries(rets)) {
			lines.push(`  ${padEnd(k, 18)} ${v.description}`)
		}
		lines.push('')
		lines.push('Examples:')
		for (const ex of json.examples) lines.push(`  ${ex}`)
		lines.push('')
		lines.push('Agent 集成快速校验清单:')
		for (const step of json.integrationChecklist) lines.push(`  - ${step}`)
	} else if (json.unknown) {
		lines.push(`未知子命令: ${json.command}`)
		lines.push('可用子命令见下方 Commands 列表，或运行: dvscli help')
	} else {
		// 全局摘要
		lines.push('Global Options:')
		for (const opt of json.globalOptions) {
			const env = opt.env ? ` (env: ${opt.env})` : ''
			lines.push(`  ${padEnd(opt.name, 22)} ${opt.description}${env}`)
		}
		lines.push('')
		lines.push('Commands:')
		for (const cmd of json.commands) {
			lines.push(`  ${padEnd(cmd.usage, 86)} ${cmd.description}`)
		}
		lines.push('')
		lines.push('发现协议（跨进程如何找到 DVStudio 监听端口/Token）:')
		for (const line of json.discovery.priority) lines.push(`  ${line}`)
		lines.push('')
		lines.push('鉴权:')
		lines.push(
			`  所有 /v1/* 请求头必须带 x-dvs-cli-token（从 runtime 文件 ${JSON.stringify(json.discovery.runtimeFile.schema.token).replace(/^"|"$/g, '')} 获取）`
		)
		lines.push('  GET /health 为公开端点，不需要 Token，用于健康检查')
		lines.push('')
		lines.push('Exit Codes（脚本集成请据此判断）:')
		for (const ec of json.exitCodes)
			lines.push(`  ${ec.code}  ${padEnd(ec.name, 22)} ${ec.description}`)
		lines.push('')
		lines.push('HTTP Endpoints（不用 CLI 时直接走 HTTP，详情见 15_CLI_CONTROL_GUIDE.md §5）:')
		for (const ep of json.httpEndpoints) {
			const auth = ep.auth ? '🔒 Token' : '🌐 Public'
			lines.push(
				`  ${padEnd(ep.method, 5)} ${padEnd(ep.path, 30)} ${padEnd(auth, 10)} ${ep.description}`
			)
		}
		lines.push('')
		lines.push('给另一个 Agent 的推荐使用顺序:')
		for (const step of json.integrationChecklist) lines.push(`  ${step}`)
		lines.push('')
		lines.push(`MCP 工具 JSON Schema 获取: ${CLI_NAME} tools list --json`)
		lines.push(
			'详细文档: agent_docs/15_CLI_CONTROL_GUIDE.md（项目根目录 AGENT_GUIDE.md 已更新索引）'
		)
	}

	printText(lines)
	return EXIT_CODES.OK
}
