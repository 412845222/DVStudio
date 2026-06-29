/**
 * MCP 模块 IPC 处理器
 */

import { mcpServerManager } from './client.mjs';
import { invalidParamsError, internalError } from '../../core/errors.mjs';

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
 * 列出可用工具
 */
export async function mcpListTools(ctx, payload) {
  const p = payload || {};
  const serverId = p.serverId !== undefined ? String(p.serverId || '').trim() : null;

  return await mcpServerManager.listTools(serverId);
}

/**
 * 调用工具
 */
export async function mcpCallTool(ctx, payload) {
  const p = payload || {};
  const serverId = p.serverId !== undefined && p.serverId !== null 
    ? String(p.serverId || '').trim() 
    : null;
  const toolName = String(p.toolName || '').trim();
  const arguments_ = p.arguments || {};
  const streamId = p.streamId ? String(p.streamId).trim() : null;

  if (!toolName) {
    throw invalidParamsError('toolName is required');
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

  if (!name) {
    throw invalidParamsError('name is required');
  }

  // 内置工具的处理器 - 这里注册一个简单的 echo 工具作为示例
  const handler = async (args, ctx) => {
    // 默认处理器，实际工具逻辑由上层注册
    return { result: 'ok', name, args };
  };

  return mcpServerManager.registerBuiltinTool(name, description, inputSchema, handler);
}

/**
 * 获取 MCP 服务器状态
 */
export async function mcpGetStatus(ctx, payload) {
  const p = payload || {};
  const serverId = String(p.serverId || '').trim();

  if (!serverId) {
    throw invalidParamsError('serverId is required');
  }

  return mcpServerManager.getStatus(serverId);
}

/**
 * 列出所有已连接服务器
 */
export async function mcpListServers(ctx, payload) {
  return mcpServerManager.listServers();
}
