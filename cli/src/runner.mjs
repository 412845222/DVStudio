import { EXIT_CODES, getExitCodeName } from './core/exitCodes.mjs'
import { buildRuntimeContext } from './core/context.mjs'
import { runHelpCommand } from './commands/help.mjs'
import { runStatusCommand } from './commands/status.mjs'
import { runToolsListCommand } from './commands/tools.mjs'
import { runTaskQueryCommand, runTaskCancelCommand } from './commands/task.mjs'
import { runGenerateImageCommand } from './commands/generate-image.mjs'
import { printText, printErrorText } from './core/output.mjs'

export async function runCli(rawArgv) {
	const argv = Array.from(rawArgv || process.argv.slice(2))

	// 全局: --version / -v
	if (argv.includes('--version') || argv.includes('-v')) {
		if (argv.includes('--json')) {
			process.stdout.write(
				JSON.stringify(
					{
						cliName: 'dvscli',
						version: process.env.npm_package_version || '0.2.4',
						nodeVersion: process.version
					},
					null,
					2
				) + '\n'
			)
		} else {
			process.stdout.write(
				`dvscli v${process.env.npm_package_version || '0.2.4'} (Node.js ${process.version})\n`
			)
		}
		return EXIT_CODES.OK
	}

	// 全局: --help / -h (无子命令)
	if (
		argv.includes('--help') ||
		argv.includes('-h') ||
		argv.length === 0 ||
		(argv[0] === 'help' && argv.length === 1)
	) {
		const sub = (() => {
			if (argv[0] === 'help' && argv[1] && !argv[1].startsWith('-')) return argv[1]
			const helpIdx = argv.findIndex((a) => a === '--help' || a === '-h')
			if (helpIdx >= 0 && argv[helpIdx + 1] && !argv[helpIdx + 1].startsWith('-'))
				return argv[helpIdx + 1]
			return null
		})()
		const ctx = {
			argv,
			instance: { host: '127.0.0.1', port: 0, token: '', source: 'help-only' },
			isJson: argv.includes('--json'),
			clientRunning: false,
			version: process.env.npm_package_version || '0.2.4'
		}
		return runHelpCommand(ctx, sub)
	}

	// 子命令分发
	try {
		const runtimeCtx = await buildRuntimeContext(argv)
		let subArgv = []
		let command = argv[0]
		// 支持 "dvscli <sub> [args]" 格式，剥离子命令名
		const skipGlobalFlags = () => {
			let i = 0
			while (i < argv.length) {
				if (argv[i].startsWith('--') || argv[i].match(/^-[a-z]$/i)) {
					// 带值的选项跳过下一个
					if (
						['--host', '--port', '--token', '--timeout'].includes(argv[i]) &&
						!argv[i].includes('=')
					)
						i++
					i++
					continue
				}
				return i
			}
			return i
		}
		const nonFlagIdx = skipGlobalFlags()
		if (nonFlagIdx < argv.length) {
			command = argv[nonFlagIdx]
			subArgv = argv.slice(nonFlagIdx + 1)
		}

		switch (command) {
			case 'status':
				return await runStatusCommand(runtimeCtx)
			case 'help':
				return runHelpCommand(runtimeCtx, subArgv[0])
			case 'generate-image':
			case 'generateImage':
			case 'gen-img':
				return await runGenerateImageCommand(runtimeCtx, subArgv)
			case 'tools': {
				const sub = subArgv[0] || 'list'
				if (sub === 'list') return await runToolsListCommand(runtimeCtx)
				if (runtimeCtx.isJson)
					process.stdout.write(
						JSON.stringify({ ok: false, error: 'NOT_IMPLEMENTED', command: `tools ${sub}` }) + '\n'
					)
				else printText(`未实现的子命令: tools ${sub}`)
				return EXIT_CODES.NOT_IMPLEMENTED
			}
			case 'task': {
				const sub = subArgv[0]
				const taskId = subArgv[1]
				if (sub === 'query') return await runTaskQueryCommand(runtimeCtx, taskId)
				if (sub === 'cancel') return await runTaskCancelCommand(runtimeCtx, taskId)
				if (runtimeCtx.isJson)
					process.stdout.write(
						JSON.stringify({
							ok: false,
							error: 'INVALID_PARAMS',
							message: 'usage: dvscli task <query|cancel> <taskId>'
						}) + '\n'
					)
				else printText('用法: dvscli task <query|cancel> <taskId>')
				return EXIT_CODES.INVALID_PARAMS
			}
			default:
				if (runtimeCtx.isJson) {
					process.stdout.write(
						JSON.stringify({
							ok: false,
							error: 'INVALID_PARAMS',
							message: `Unknown command: ${command}`
						}) + '\n'
					)
				} else {
					printText([`dvscli: 未知命令 '${command}'`, '', `运行 'dvscli help' 查看可用命令列表`])
				}
				return EXIT_CODES.INVALID_PARAMS
		}
	} catch (err) {
		const code = EXIT_CODES.INTERNAL_ERROR
		const name = getExitCodeName(code)
		if (argv.includes('--json')) {
			process.stdout.write(
				JSON.stringify(
					{
						ok: false,
						error: 'INTERNAL_ERROR',
						name,
						message: err?.message || String(err),
						stack: err?.stack || undefined
					},
					null,
					2
				) + '\n'
			)
		} else {
			printErrorText(`${name}: ${err?.message || String(err)}`, name)
			if (err?.stack && argv.includes('--verbose')) process.stderr.write(err.stack + '\n')
		}
		return code
	}
}
