import { printText, printJson } from '../core/output.mjs'
import { EXIT_CODES } from '../core/exitCodes.mjs'
import { getHealth, mapResponseToExitCode } from '../core/httpClient.mjs'

export async function runStatusCommand(ctx) {
    const { instance, isJson, clientRunning, health } = ctx

    if (!clientRunning) {
        if (isJson) {
            printJson({
                ok: false,
                running: false,
                error: 'CLIENT_NOT_RUNNING',
                discovery: instance.source,
                message: 'DVStudio 客户端未运行或控制服务器不可达'
            })
        } else {
            printText([
                'DVStudio 客户端状态：',
                '  ✗ 未运行（或控制服务器不可达）',
                `  发现方式: ${instance.source}`,
                instance.file ? `  端口文件: ${instance.file}` : ''
            ].filter(Boolean))
        }
        return EXIT_CODES.CLIENT_NOT_RUNNING
    }

    const data = health.data || {}
    if (isJson) {
        printJson(data)
        return EXIT_CODES.OK
    }
    const lines = []
    lines.push('DVStudio 客户端状态：')
    lines.push('  ✓ 运行中')
    if (data.server) lines.push(`  ✓ 控制服务器：http://${data.server.host}:${data.server.port}`)
    if (data.app) {
        const proj = data.app.currentProject
        lines.push(`  ✓ 版本：${data.app.name} v${data.app.version}`)
        if (proj) lines.push(`  ✓ 当前项目：${proj.name} (ID: ${proj.id})`)
    }
    if (data.agent) lines.push(`  ✓ Agent 运行时：${data.agent.ready ? '就绪' : '未就绪'} [${data.agent.runtime}]`)
    if (data.mcp) lines.push(`  ✓ MCP 工具：已注册 ${data.mcp.builtinToolsCount} 个内置工具`)
    lines.push(`  发现方式：${instance.source}`)
    printText(lines)
    return EXIT_CODES.OK
}
