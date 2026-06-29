/**
 * MCP Client 管理器
 * 
 * 管理 MCP Server 连接，支持 STDIO 和 HTTP 两种连接方式，
 * 并提供内置 DVStudio 工具注册功能。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { internalError, invalidParamsError } from '../../core/errors.mjs';
import logger from '../../core/logger.mjs';

const MAX_TOOL_CALLS = 10; // 工具调用循环保护

/**
 * MCP Server 管理器
 */
class MCPServerManager {
  constructor() {
    /** @type {Map<string, { client: Client, config: object, transport: object }>} */
    this.servers = new Map();
    
    /** @type {Map<string, { name: string, description: string, inputSchema: object, handler: Function }>} */
    this.builtinTools = new Map();
    
    /** @type {Map<string, AbortController>} */
    this.activeStreams = new Map();
  }

  /**
   * 连接 STDIO MCP Server
   * @param {string} serverId - 服务器 ID
   * @param {string} command - 可执行命令
   * @param {string[]} args - 命令参数
   * @param {object} env - 环境变量
   * @param {string} [cwd] - 工作目录
   */
  async connectStdio(serverId, command, args = [], env = {}, cwd = process.cwd()) {
    if (this.servers.has(serverId)) {
      logger.warn(`MCP Server ${serverId} already connected, disconnecting first`);
      await this.disconnect(serverId);
    }

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env },
      cwd
    });

    const client = new Client({
      name: `dvstudio-${serverId}`,
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    try {
      await client.connect(transport);
      this.servers.set(serverId, { client, config: { type: 'stdio', command, args, env, cwd }, transport });
      logger.info(`MCP Server ${serverId} connected via STDIO`);
      return { ok: true, serverId };
    } catch (err) {
      logger.error(`Failed to connect MCP Server ${serverId}: ${err.message}`);
      throw internalError(`Failed to connect MCP Server: ${err.message}`);
    }
  }

  /**
   * 连接 HTTP MCP Server
   * @param {string} serverId - 服务器 ID
   * @param {string} url - 服务器 URL
   * @param {object} [headers] - 请求头
   */
  async connectHttp(serverId, url, headers = {}) {
    if (this.servers.has(serverId)) {
      logger.warn(`MCP Server ${serverId} already connected, disconnecting first`);
      await this.disconnect(serverId);
    }

    const transport = new SSEClientTransport(new URL(url), { headers });

    const client = new Client({
      name: `dvstudio-${serverId}`,
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    try {
      await client.connect(transport);
      this.servers.set(serverId, { client, config: { type: 'http', url, headers }, transport });
      logger.info(`MCP Server ${serverId} connected via HTTP: ${url}`);
      return { ok: true, serverId };
    } catch (err) {
      logger.error(`Failed to connect MCP Server ${serverId}: ${err.message}`);
      throw internalError(`Failed to connect MCP Server: ${err.message}`);
    }
  }

  /**
   * 注册内置工具
   * @param {string} name - 工具名称
   * @param {string} description - 工具描述
   * @param {object} inputSchema - 输入参数 schema
   * @param {Function} handler - 处理函数
   */
  registerBuiltinTool(name, description, inputSchema, handler) {
    this.builtinTools.set(name, {
      name,
      description,
      inputSchema,
      handler
    });
    logger.debug(`Registered builtin tool: ${name}`);
    return { ok: true, name };
  }

  /**
   * 列出指定服务器或所有内置工具
   * @param {string|null} [serverId] - 服务器 ID，null 时列出内置工具
   */
  async listTools(serverId = null) {
    const tools = [];

    // 内置工具
    if (serverId === null) {
      for (const [name, tool] of this.builtinTools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          source: 'builtin'
        });
      }
    }

    // MCP Server 工具
    if (serverId && this.servers.has(serverId)) {
      const { client } = this.servers.get(serverId);
      try {
        const response = await client.listTools();
        const serverTools = response.tools || [];
        for (const tool of serverTools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            source: serverId
          });
        }
      } catch (err) {
        logger.error(`Failed to list tools from ${serverId}: ${err.message}`);
      }
    }

    return { tools };
  }

  /**
   * 调用工具
   * @param {string|null} serverId - 服务器 ID，null 时调用内置工具
   * @param {string} toolName - 工具名称
   * @param {object} arguments_ - 工具参数
   * @param {string} [streamId] - 流 ID，用于追踪
   */
  async callTool(serverId, toolName, arguments_, streamId = null) {
    // 内置工具
    if (serverId === null || serverId === 'builtin') {
      const tool = this.builtinTools.get(toolName);
      if (!tool) {
        throw notFoundError(`Tool not found: ${toolName}`);
      }
      try {
        const result = await tool.handler(arguments_, { streamId });
        return result;
      } catch (err) {
        logger.error(`Builtin tool ${toolName} failed: ${err.message}`);
        throw internalError(`Tool execution failed: ${err.message}`);
      }
    }

    // MCP Server 工具
    if (!this.servers.has(serverId)) {
      throw notFoundError(`MCP Server not found: ${serverId}`);
    }

    const { client } = this.servers.get(serverId);
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: arguments_
      });
      return result;
    } catch (err) {
      logger.error(`MCP tool ${toolName} failed: ${err.message}`);
      throw internalError(`Tool execution failed: ${err.message}`);
    }
  }

  /**
   * 断开连接
   * @param {string} serverId - 服务器 ID
   */
  async disconnect(serverId) {
    if (!this.servers.has(serverId)) {
      return { ok: true, serverId };
    }

    const { client, transport } = this.servers.get(serverId);
    
    try {
      if (transport && typeof transport.close === 'function') {
        await transport.close();
      }
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    } catch (err) {
      logger.warn(`Error closing MCP Server ${serverId}: ${err.message}`);
    }

    this.servers.delete(serverId);
    logger.info(`MCP Server ${serverId} disconnected`);
    return { ok: true, serverId };
  }

  /**
   * 获取服务器状态
   * @param {string} serverId - 服务器 ID
   */
  getStatus(serverId) {
    if (!this.servers.has(serverId)) {
      return { connected: false, serverId };
    }
    const { config } = this.servers.get(serverId);
    return { connected: true, serverId, config };
  }

  /**
   * 列出所有已连接服务器
   */
  listServers() {
    const servers = [];
    for (const [serverId, { config }] of this.servers) {
      servers.push({ serverId, config });
    }
    return { servers };
  }
}

// 导出单例
export const mcpServerManager = new MCPServerManager();

// 辅助函数
function notFoundError(message) {
  const err = new Error(message);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  return err;
}
