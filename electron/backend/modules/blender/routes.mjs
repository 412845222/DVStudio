import * as handlers from './handlers.mjs'

export const routes = [
    { channel: 'dweb:blender:status:check', handler: handlers.checkStatus },
    { channel: 'dweb:blender:mcp:connect', handler: handlers.connectMcp },
    { channel: 'dweb:blender:mcp:disconnect', handler: handlers.disconnectMcp },
    { channel: 'dweb:blender:mcp:status', handler: handlers.getMcpStatus },
    { channel: 'dweb:blender:mcp:call-tool', handler: handlers.callTool },
    { channel: 'dweb:blender:import:model', handler: handlers.importModel },
    { channel: 'dweb:blender:tools:check', handler: handlers.checkToolsReady },
    { channel: 'dweb:blender:tools:mount', handler: handlers.mountTools },
    { channel: 'dweb:blender:workspace:init', handler: handlers.workspaceInit },
    { channel: 'dweb:blender:workspace:save-script', handler: handlers.workspaceSaveScript },
    { channel: 'dweb:blender:workspace:save-screenshot', handler: handlers.workspaceSaveScreenshot },
    { channel: 'dweb:blender:workspace:clear', handler: handlers.workspaceClear },
    { channel: 'dweb:blender:workspace:list-scripts', handler: handlers.workspaceListScripts },
    { channel: 'dweb:blender:workspace:get-stats', handler: handlers.workspaceGetStats },
    { channel: 'dweb:blender:workspace:open-folder', handler: handlers.workspaceOpenFolder },
    { channel: 'dweb:blender:workspace:get-path', handler: handlers.workspaceGetPath },
]
