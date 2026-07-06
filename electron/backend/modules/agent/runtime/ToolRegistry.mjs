/**
 * 统一工具注册表
 *
 * 聚合 MCP 内置工具和外部 MCP 服务器工具，统一转换为 OpenAI function calling 格式，
 * 为 Agent Runtime 提供一致的工具列表获取、格式化、执行接口。
 */

import { mcpServerManager } from '../../mcp/client.mjs';
import logger from '../../../core/logger.mjs';

export class ToolRegistry {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * 获取所有可用工具（统一为 OpenAI function 格式）
   * @returns {Promise<Array<object>>}
   */
  async listTools() {
    const allTools = [];

    try {
      const builtinResult = await mcpServerManager.listTools(null);
      for (const tool of builtinResult.tools || []) {
        allTools.push(this.toOpenAITool(tool, 'builtin'));
      }
    } catch (err) {
      logger.warn(`ToolRegistry: failed to list builtin tools: ${err.message}`);
    }

    try {
      const servers = mcpServerManager.listServers();
      for (const { serverId } of servers.servers || []) {
        try {
          const serverResult = await mcpServerManager.listTools(serverId);
          for (const tool of serverResult.tools || []) {
            allTools.push(this.toOpenAITool(tool, serverId));
          }
        } catch (err) {
          logger.warn(`ToolRegistry: failed to list tools from ${serverId}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`ToolRegistry: failed to list MCP servers: ${err.message}`);
    }

    return allTools;
  }

  /**
   * 执行工具调用
   * @param {string} toolName - 工具名
   * @param {object} args - 工具参数
   * @param {string} requestId - 请求 ID
   * @returns {Promise<object>}
   */
  async callTool(toolName, args, requestId) {
    const tools = await this.listTools();
    const tool = tools.find(t => t.function.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    const source = tool._meta.source;
    const serverId = source === 'builtin' ? null : source;
    return await mcpServerManager.callTool(serverId, toolName, args, requestId);
  }

  /**
   * 将内部工具描述转换为 OpenAI function format
   */
  toOpenAITool(tool, source) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: this.normalizeInputSchema(tool.inputSchema),
      },
      _meta: {
        source,
        toolId: `${source}:${tool.name}`,
      },
    };
  }

  /**
   * 规范化 inputSchema 为合法的 JSON Schema（确保 type/ properties 存在）
   */
  normalizeInputSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object', properties: {} };
    }
    return {
      type: 'object',
      ...schema,
      properties: schema.properties || {},
    };
  }

  /**
   * 将工具列表转换为 OpenAI tools 参数（native function calling 用）
   */
  toOpenAITools(tools) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }

  /**
   * 将工具列表转换为 CLI prompt 文本描述（CLI Provider 用）
   */
  toCliToolPrompt(tools) {
    const lines = [];
    lines.push('# 可用工具');
    lines.push('');
    lines.push('你可以使用以下工具来操作DVStudio工作流蓝图。当你需要执行操作时，请严格按照以下XML格式输出工具调用，输出后停止生成，等待工具执行结果：');
    lines.push('');
    lines.push('<|FunctionCallBegin|>');
    lines.push('[{"name": "工具名", "parameters": {"参数名": "参数值"}}]');
    lines.push('<|FunctionCallEnd|>');
    lines.push('');
    lines.push('每次只能调用一个工具。工具执行结果返回后，你可以根据结果继续回答或调用下一个工具。');
    lines.push('');
    lines.push('## 工具列表');
    lines.push('');

    for (const tool of tools) {
      const fn = tool.function;
      lines.push(`### ${fn.name}`);
      lines.push(fn.description || '');
      const params = fn.parameters?.properties || {};
      const required = fn.parameters?.required || [];
      const paramNames = Object.keys(params);
      if (paramNames.length > 0) {
        lines.push('参数：');
        for (const [pName, pSchema] of Object.entries(params)) {
          const req = required.includes(pName) ? '必填' : '可选';
          const desc = pSchema.description || '';
          lines.push(`- ${pName} (${pSchema.type || 'string'}, ${req}): ${desc}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
