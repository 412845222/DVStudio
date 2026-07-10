import * as handlers from './handlers.mjs'

export const routes = [
    { channel: 'dweb:blender:status:check', handler: handlers.checkStatus },
    { channel: 'dweb:blender:mcp:connect', handler: handlers.connectMcp },
    { channel: 'dweb:blender:mcp:disconnect', handler: handlers.disconnectMcp },
    { channel: 'dweb:blender:mcp:status', handler: handlers.getMcpStatus },
    { channel: 'dweb:blender:mcp:call-tool', handler: handlers.callTool },
    { channel: 'dweb:blender:import:model', handler: handlers.importModel }
]
