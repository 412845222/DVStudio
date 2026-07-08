/**
 * MCP 模块路由注册
 */

import * as handlers from './handlers.mjs';

export const routes = [
  { channel: 'dweb:mcp:connect', handler: handlers.mcpConnect },
  { channel: 'dweb:mcp:disconnect', handler: handlers.mcpDisconnect },
  { channel: 'dweb:mcp:list-tools', handler: handlers.mcpListTools },
  { channel: 'dweb:mcp:call-tool', handler: handlers.mcpCallTool },
  { channel: 'dweb:mcp:register-builtin', handler: handlers.mcpRegisterBuiltin },
  { channel: 'dweb:mcp:get-status', handler: handlers.mcpGetStatus },
  { channel: 'dweb:mcp:list-servers', handler: handlers.mcpListServers },
  { channel: 'dweb:mcp:get-bridge-status', handler: handlers.mcpGetBridgeStatus },
  { channel: 'dweb:mcp:get-bridge-script', handler: handlers.mcpGetBridgeScriptPath },
];

export { initMCPModule } from './handlers.mjs';
