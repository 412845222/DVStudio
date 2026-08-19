import { printJson, printText } from '../core/output.mjs'
import { EXIT_CODES } from '../core/exitCodes.mjs'
import { post, mapResponseToExitCode } from '../core/httpClient.mjs'

// 注意：model 默认留空字符串。后端 generate_image 工具会优先走 seedream 直连路径，
// 默认模型 doubao-seedream-4-5-251128 由工具自身/Agent Prompt 构造层决定，避免 CLI 层写死为 gemini。
function parseArgs(argv) {
	const result = {
		prompt: '',
		width: null,
		height: null,
		aspectRatio: null,
		references: [],
		negativePrompt: '',
		model: '',
		imageCount: 1,
		seed: -1,
		outputPath: null,
		projectId: null,
		autoExport: true,
		wait: true,
		stream: false
	}
	let i = 0
	const getNext = (flag) => {
		if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
			const v = argv[i + 1]
			i++
			return v
		}
		const eq = flag?.match(/^--([^=]+)=(.+)$/)
		if (eq) return eq[2]
		return null
	}
	while (i < argv.length) {
		const arg = argv[i]
		const eqMatch = arg.match(/^--([^=]+)=(.+)$/)
		if (eqMatch) {
			const [, k, v] = eqMatch
			switch (k) {
				case 'prompt':
					result.prompt = v
					break
				case 'width':
					result.width = parseInt(v, 10)
					break
				case 'height':
					result.height = parseInt(v, 10)
					break
				case 'aspect-ratio':
					result.aspectRatio = v
					break
				case 'negative-prompt':
					result.negativePrompt = v
					break
				case 'model':
				case 'm':
					result.model = v
					break
				case 'image-count':
				case 'n':
					result.imageCount = parseInt(v, 10)
					break
				case 'seed':
				case 's':
					result.seed = parseInt(v, 10)
					break
				case 'output-path':
				case 'o':
					result.outputPath = v
					break
				case 'project-id':
					result.projectId = parseInt(v, 10)
					break
			}
		} else {
			switch (arg) {
				case '--prompt':
				case '-p':
					result.prompt = getNext() || ''
					break
				case '--width':
				case '-w':
					result.width = parseInt(getNext(), 10)
					break
				case '--height':
				case '-h':
					if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
						result.height = parseInt(argv[i + 1], 10)
						i++
					}
					break
				case '--aspect-ratio':
				case '-a':
					result.aspectRatio = getNext()
					break
				case '--reference':
				case '-r': {
					const ref = getNext()
					if (ref) result.references.push(ref)
					break
				}
				case '--negative-prompt':
					result.negativePrompt = getNext() || ''
					break
				case '--model':
				case '-m': {
					const v = getNext()
					// 传了 --model 但无值时保持空字符串，让后端默认 seedream 生效；避免 fallback 到 gemini
					result.model = v || ''
					break
				}
				case '--image-count':
				case '-n':
					result.imageCount = parseInt(getNext(), 10) || 1
					break
				case '--seed':
				case '-s':
					result.seed = parseInt(getNext(), 10) || -1
					break
				case '--output-path':
				case '-o':
					result.outputPath = getNext()
					break
				case '--project-id':
					result.projectId = parseInt(getNext(), 10)
					break
				case '--no-auto-export':
					result.autoExport = false
					break
				case '--no-wait':
					result.wait = false
					break
				case '--wait':
					result.wait = true
					break
				case '--stream':
					result.stream = true
					break
			}
		}
		i++
	}
	return result
}

export async function runGenerateImageCommand(ctx, cmdArgv) {
	const { instance, isJson, clientRunning, timeoutMs } = ctx
	const args = parseArgs(cmdArgv)

	// 参数校验
	if (!args.prompt || typeof args.prompt !== 'string' || !args.prompt.trim()) {
		if (isJson)
			printJson({
				ok: false,
				error: 'INVALID_PARAMS',
				message: '--prompt is required (non-empty string)'
			})
		else
			printText([
				'错误: --prompt 必须提供（不能为空）',
				'',
				'用法: dvscli generate-image --prompt "..." [options]'
			])
		return EXIT_CODES.INVALID_PARAMS
	}
	// aspectRatio 与 width/height 二选一
	if (args.aspectRatio) {
		const ratios = {
			'1:1': [1024, 1024],
			'16:9': [1920, 1080],
			'9:16': [1080, 1920],
			'4:3': [1536, 1152],
			'3:4': [1152, 1536]
		}
		if (ratios[args.aspectRatio]) {
			if (!args.width) args.width = ratios[args.aspectRatio][0]
			if (!args.height) args.height = ratios[args.aspectRatio][1]
		}
	}
	if (!args.width) args.width = 1024
	if (!args.height) args.height = 1024

	if (!clientRunning) {
		if (isJson) printJson({ ok: false, error: 'CLIENT_NOT_RUNNING' })
		else printText('错误: DVStudio 客户端未运行，请先启动 DVStudio 客户端并打开 AI 工作流蓝图项目')
		return EXIT_CODES.CLIENT_NOT_RUNNING
	}

	const payload = {
		prompt: args.prompt,
		width: args.width,
		height: args.height,
		aspectRatio: args.aspectRatio || null,
		references: args.references && args.references.length ? args.references : null,
		negativePrompt: args.negativePrompt || null,
		model: args.model,
		imageCount: args.imageCount,
		seed: args.seed,
		outputPath: args.outputPath,
		projectId: args.projectId,
		autoExport: args.autoExport,
		wait: args.wait,
		stream: args.stream
	}

	const resp = await post(instance, '/v1/generate-image', payload, timeoutMs)

	if (isJson) {
		printJson(resp.data || { ok: false, raw: resp.raw, status: resp.status })
	} else {
		if (resp.status === 200 && resp.data?.ok) {
			const d = resp.data
			const lines = []
			lines.push('✓ 任务已提交')
			lines.push(`  任务ID: ${d.taskId}`)
			lines.push(`  状态: ${d.status}`)
			if (d.note) lines.push(`  备注: ${d.note}`)
			if (d.nodeId) lines.push(`  节点ID: ${d.nodeId}`)
			printText(lines)
		} else {
			printText(
				`提交失败: HTTP ${resp.status} - ${resp.data?.error || resp.data?.message || resp.connectionError || 'unknown'}`
			)
		}
	}
	return mapResponseToExitCode(resp, EXIT_CODES.OK)
}
