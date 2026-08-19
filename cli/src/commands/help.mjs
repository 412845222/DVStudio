import { printText, printJson } from '../core/output.mjs'

const CLI_NAME = 'dvscli'
const CLI_VERSION = '0.2.4'
const CLI_DESC = 'DVStudio 本地跨进程 CLI 控制接口'

export const MCP_TOOLS_DEF = [
    {
        name: 'generate_image',
        description: '在DVStudio AI工作流蓝图中创建图片节点并执行图片生成任务，完成后可复制结果到指定路径。',
        parameters: {
            type: 'object',
            required: ['prompt'],
            properties: {
                prompt: { type: 'string', description: '图片生成提示词' },
                width: { type: 'number', description: '图片宽度像素（如1024）', default: 1024 },
                height: { type: 'number', description: '图片高度像素（如1024）', default: 1024 },
                references: { type: 'array', items: { type: 'string' }, description: '参考图本地绝对路径列表（图生图模式）' },
                outputPath: { type: 'string', description: '生成完成后复制到该本地路径（含文件名）' },
                model: { type: 'string', enum: ['gemini', 'seedream', 'meshy', 'tripo3d'], description: '图片生成模型提供商', default: 'gemini' },
                negativePrompt: { type: 'string', description: '负向提示词' },
                imageCount: { type: 'number', description: '生成图片数量', default: 1 },
                aspectRatio: { type: 'string', enum: ['1:1','16:9','9:16','4:3','3:4'], description: '宽高比（与width/height二选一）' },
                seed: { type: 'number', description: '随机种子', default: -1 },
                projectId: { type: 'number', description: '目标项目ID（默认当前打开项目）' },
                autoExport: { type: 'boolean', description: '完成后是否自动复制到outputPath', default: true }
            }
        },
        returns: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: '任务ID' },
                nodeId: { type: 'string', description: '创建的图片节点ID' },
                status: { type: 'string', enum: ['completed','failed'] },
                outputFiles: { type: 'array', items: { type: 'string' }, description: '生成文件的本地绝对路径列表' },
                exportedFiles: { type: 'array', items: { type: 'string' }, description: '已复制到outputPath的文件路径列表' }
            }
        },
        cliExample: 'dvscli generate-image --prompt "一只可爱的猫咪" --width 1024 --height 1024 --outputPath "C:/outputs/cat.png"'
    }
]

const COMMANDS_DEF = [
    { name: 'status', usage: 'dvscli status [--json]', description: '检查DVStudio客户端是否运行及控制服务器状态' },
    { name: 'generate-image', usage: 'dvscli generate-image [options]', description: '创建图片节点并执行生成任务' },
    { name: 'task query', usage: 'dvscli task query <taskId> [--json]', description: '查询任务执行状态与结果' },
    { name: 'task cancel', usage: 'dvscli task cancel <taskId> [--json]', description: '取消一个正在执行的任务' },
    { name: 'tools list', usage: 'dvscli tools list [--json]', description: '以JSON Schema格式列出所有可用工具（供MCP集成）' },
    { name: 'help', usage: 'dvscli help [command] [--json]', description: '显示帮助信息' }
]

export function buildHelpJson(subcommand) {
    if (subcommand === 'generate-image') {
        return {
            cliName: CLI_NAME,
            version: CLI_VERSION,
            command: 'generate-image',
            usage: 'dvscli generate-image --prompt <text> [--width W] [--height H] [--reference PATH...] [--output-path PATH] [--model gemini|seedream] [--json]',
            parameters: MCP_TOOLS_DEF[0].parameters,
            examples: [
                'dvscli generate-image --prompt "赛博朋克城市" --width 1920 --height 1080 -o C:/out/city.jpg',
                'dvscli generate-image --prompt "转成宫崎骏风格" -r C:/ref/photo.jpg --aspect-ratio 3:4'
            ]
        }
    }
    return {
        cliName: CLI_NAME,
        version: CLI_VERSION,
        description: CLI_DESC,
        globalOptions: [
            { name: '--json', description: '以JSON格式输出（供其他Agent/程序解析）' },
            { name: '--host <host>', description: '自定义控制服务器地址（默认127.0.0.1）' },
            { name: '--port <port>', description: '自定义控制服务器端口（默认自动发现）' },
            { name: '--token <token>', description: '自定义鉴权Token（默认自动发现）' },
            { name: '--timeout <ms>', description: '请求超时（毫秒，默认600000=10分钟）' },
            { name: '--help, -h', description: '显示帮助' },
            { name: '--version, -v', description: '显示版本' }
        ],
        mcpStyleTools: MCP_TOOLS_DEF,
        commands: COMMANDS_DEF
    }
}

export function runHelpCommand(ctx, subcommand) {
    const json = buildHelpJson(subcommand)
    if (ctx.isJson) {
        printJson(json)
        return 0
    }
    // 文本输出
    const lines = []
    lines.push(`${CLI_NAME} v${json.version} - ${json.description}`)
    lines.push('')
    if (subcommand === 'generate-image') {
        lines.push(`Usage: ${json.usage}`)
        lines.push('')
        lines.push('Parameters:')
        const props = json.parameters.properties
        for (const [k, v] of Object.entries(props)) {
            const required = json.parameters.required?.includes(k) ? ' (required)' : ''
            const def = v.default !== undefined ? ` [default: ${v.default}]` : ''
            lines.push(`  --${k.replace(/([A-Z])/g, '-$1').toLowerCase()}\t${v.description}${required}${def}`)
        }
        lines.push('')
        lines.push('Examples:')
        for (const ex of json.examples) lines.push(`  ${ex}`)
    } else {
        lines.push('Global Options:')
        for (const opt of json.globalOptions) lines.push(`  ${opt.name.padEnd(22)} ${opt.description}`)
        lines.push('')
        lines.push('Commands:')
        for (const cmd of json.commands) {
            lines.push(`  ${cmd.usage.padEnd(50)} ${cmd.description}`)
        }
        lines.push('')
        lines.push(`For MCP-style tool definitions, run: ${CLI_NAME} tools list --json`)
    }
    printText(lines)
    return 0
}
