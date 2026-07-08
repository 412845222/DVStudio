/**
 * MCP 模块 IPC 处理器
 */

import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { mcpServerManager } from './client.mjs';
import { getToolExecutor } from './toolExecutor.mjs';
import { getMCPBridgeServer } from './server/socketBridge.mjs';
import { getDVStudioMCPServer } from './server/DVStudioMCPServer.mjs';
import { invalidParamsError, internalError } from '../../core/errors.mjs';
import logger from '../../core/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initMCPModule() {
  const bridge = getMCPBridgeServer();
  bridge.start();
  logger.info('[MCP] Module initialized, bridge server started');
}

export async function mcpGetBridgeStatus() {
  const bridge = getMCPBridgeServer();
  const server = getDVStudioMCPServer();
  return {
    bridge: bridge.getStatus(),
    server: server.getStatus(),
  };
}

export async function mcpGetBridgeScriptPath() {
  const scriptPath = path.join(__dirname, 'server', 'stdioBridge.mjs');
  const socketPath = process.platform === 'win32'
    ? '\\\\.\\pipe\\dvstudio-mcp-bridge'
    : path.join(os.tmpdir(), 'dvstudio-mcp-bridge.sock');
  return {
    scriptPath,
    nodePath: process.execPath,
    socketPath
  };
}

/**
 * 列出内置工具（DVStudio自己的工具，不通过外部MCP server）
 */
export async function mcpListBuiltinTools() {
  const executor = getToolExecutor();
  return {
    ok: true,
    tools: executor.getMCPTools()
  };
}

/**
 * 调用内置工具
 */
export async function mcpCallBuiltinTool(ctx, payload) {
  const p = payload || {};
  const toolName = String(p.toolName || '').trim();
  const args = p.arguments || p.args || {};

  if (!toolName) {
    throw invalidParamsError('toolName is required');
  }

  const executor = getToolExecutor();
  if (!executor.hasTool(toolName)) {
    throw invalidParamsError(`Unknown builtin tool: ${toolName}`);
  }

  try {
    const result = await executor.callTool(toolName, args);
    return { ok: true, result };
  } catch (err) {
    logger.error(`[MCP] Builtin tool ${toolName} error: ${err.message}`);
    throw internalError(`Tool execution failed: ${err.message}`);
  }
}

/**
 * 连接 MCP Server (STDIO 或 HTTP)
 */
export async function mcpConnect(ctx, payload) {
  const p = payload || {};
  const serverId = String(p.serverId || '').trim();
  const type = String(p.type || 'stdio').toLowerCase();

  if (!serverId) {
    throw invalidParamsError('serverId is required');
  }

  if (type === 'stdio') {
    const command = String(p.command || '').trim();
    const args = Array.isArray(p.args) ? p.args : [];
    const env = p.env || {};
    const cwd = String(p.cwd || process.cwd()).trim();

    if (!command) {
      throw invalidParamsError('command is required for STDIO connection');
    }

    return await mcpServerManager.connectStdio(serverId, command, args, env, cwd);
  } else if (type === 'http') {
    const url = String(p.url || '').trim();
    const headers = p.headers || {};

    if (!url) {
      throw invalidParamsError('url is required for HTTP connection');
    }

    return await mcpServerManager.connectHttp(serverId, url, headers);
  } else {
    throw invalidParamsError(`Unsupported connection type: ${type}`);
  }
}

/**
 * 断开 MCP Server 连接
 */
export async function mcpDisconnect(ctx, payload) {
  const p = payload || {};
  const serverId = String(p.serverId || '').trim();

  if (!serverId) {
    throw invalidParamsError('serverId is required');
  }

  return await mcpServerManager.disconnect(serverId);
}

/**
 * 列出可用工具（包括内置工具和外部MCP server工具）
 */
export async function mcpListTools(ctx, payload) {
  const p = payload || {};
  const serverId = p.serverId !== undefined ? String(p.serverId || '').trim() : null;

  if (serverId === 'builtin' || serverId === null) {
    const executor = getToolExecutor();
    const builtinTools = executor.getMCPTools().map(t => ({
      ...t,
      serverId: 'builtin'
    }));

    if (serverId === 'builtin') {
      return { tools: builtinTools };
    }

    const externalTools = await mcpServerManager.listTools(null);
    return { tools: [...builtinTools, ...(externalTools.tools || [])] };
  }

  return await mcpServerManager.listTools(serverId);
}

/**
 * 调用工具
 */
export async function mcpCallTool(ctx, payload) {
  const p = payload || {};
  const serverId = p.serverId !== undefined && p.serverId !== null 
    ? String(p.serverId || '').trim() 
    : 'builtin';
  const toolName = String(p.toolName || '').trim();
  const arguments_ = p.arguments || p.args || {};
  const streamId = p.streamId ? String(p.streamId).trim() : null;

  if (!toolName) {
    throw invalidParamsError('toolName is required');
  }

  if (serverId === 'builtin' || serverId === '') {
    const executor = getToolExecutor();
    try {
      const result = await executor.callTool(toolName, arguments_);
      return { ok: true, result };
    } catch (err) {
      throw internalError(`Tool execution failed: ${err.message}`);
    }
  }

  return await mcpServerManager.callTool(serverId, toolName, arguments_, streamId);
}

/**
 * 注册内置工具
 */
export async function mcpRegisterBuiltin(ctx, payload) {
  const p = payload || {};
  const name = String(p.name || '').trim();
  const description = String(p.description || '').trim();
  const inputSchema = p.inputSchema || { type: 'object', properties: {} };
  const handler = p.handler || null;

  if (!name) {
    throw invalidParamsError('name is required');
  }

  const executor = getToolExecutor();
  executor.registerTool(name, description, inputSchema, handler);
  return { ok: true, name };
}

/**
 * 获取 MCP 服务器状态
 */
export async function mcpGetStatus(ctx, payload) {
  const p = payload || {};
  const serverId = String(p.serverId || '').trim();

  if (serverId === 'builtin') {
    const executor = getToolExecutor();
    return {
      serverId: 'builtin',
      connected: true,
      toolCount: executor.listTools().length,
      tools: executor.listTools()
    };
  }

  return mcpServerManager.getStatus(serverId);
}

/**
 * 列出所有已连接服务器
 */
export async function mcpListServers(ctx, payload) {
  const executor = getToolExecutor();
  const externalServers = mcpServerManager.listServers();
  return {
    servers: [
      {
        serverId: 'builtin',
        type: 'builtin',
        connected: true,
        toolCount: executor.listTools().length
      },
      ...externalServers.servers
    ]
  };
}
