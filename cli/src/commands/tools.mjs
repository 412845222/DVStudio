import { printJson, printText } from '../core/output.mjs'
import { EXIT_CODES } from '../core/exitCodes.mjs'
import { MCP_TOOLS_DEF } from './help.mjs'
import { get, mapResponseToExitCode } from '../core/httpClient.mjs'

export async function runToolsListCommand(ctx) {
    const { instance, isJson, clientRunning } = ctx
    // 优先从服务器拉取（保证和服务器版本一致），拉不到则返回 CLI 内置的定义
    if (clientRunning) {
        const resp = await get(instance, '/tools', 10000)
        if (resp.status === 200 && resp.data?.ok) {
            if (isJson) {
                printJson(resp.data)
                return EXIT_CODES.OK
            }
            const lines = []
            lines.push(`可用 MCP 工具（${resp.data.tools.length} 个）：`)
            for (const t of resp.data.tools) {
                lines.push('')
                lines.push(`  ${t.name}`)
                lines.push(`    ${t.description}`)
                if (t.cliExample) lines.push(`    示例: ${t.cliExample}`)
            }
            printText(lines)
            return EXIT_CODES.OK
        }
    }
    // Fallback: CLI 内置定义
    if (isJson) {
        printJson({ ok: true, tools: MCP_TOOLS_DEF, source: 'cli-builtin' })
    } else {
        const lines = []
        lines.push(`可用 MCP 工具（${MCP_TOOLS_DEF.length} 个）：`)
        for (const t of MCP_TOOLS_DEF) {
            lines.push('')
            lines.push(`  ${t.name}`)
            lines.push(`    ${t.description}`)
        }
        lines.push('')
        lines.push('提示: 启动 DVStudio 客户端后再运行可获取服务器端最新工具定义')
        printText(lines)
    }
    return clientRunning ? EXIT_CODES.OK : EXIT_CODES.CLIENT_NOT_RUNNING
}
