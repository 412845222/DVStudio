/**
 * Agent 执行器
 * 
 * 核心 Agent 执行逻辑，支持工具调用循环、上下文注入、多模态路由。
 */

import { mcpServerManager } from '../mcp/client.mjs';
import { cliAdapterManager } from '../cli-adapters/manager.mjs';
import { internalError, invalidParamsError, upstreamError } from '../../core/errors.mjs';
import logger from '../../core/logger.mjs';

// 工具调用相关
import { DeepSeekAdapter } from '../chat/adapters/deepseek.mjs';
import { BytedanceAdapter } from '../chat/adapters/bytedance.mjs';
import { GeminiAdapter } from '../chat/adapters/gemini.mjs';

const MAX_TOOL_CALLS = 10; // 工具调用循环保护

/**
 * 获取 API 适配器
 */
function getAdapter(apiSource, config = {}) {
  switch (apiSource) {
    case 'deepseek':
      return new DeepSeekAdapter(config);
    case 'bytedance':
      return new BytedanceAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'openai':
      return new DeepSeekAdapter({ ...config, baseUrl: 'https://api.openai.com/v1' });
    default:
      return new DeepSeekAdapter(config);
  }
}

/**
 * 构建消息列表（支持多模态）
 */
function buildMessages(content, attachments = [], context = null) {
  const messages = [];

  // 添加上下文（system prompt）
  if (context) {
    const contextPrompt = buildContextPrompt(context);
    if (contextPrompt) {
      messages.push({ role: 'system', content: contextPrompt });
    }
  }

  // 添加用户消息（支持多模态）
  if (attachments && attachments.length > 0) {
    const parts = [{ type: 'text', text: content }];
    for (const att of attachments) {
      if (att.type === 'image_url' || att.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: att.data || att.url,
            detail: 'auto'
          }
        });
      }
    }
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content });
  }

  return messages;
}

/**
 * 构建上下文提示
 */
function buildContextPrompt(context) {
  if (!context) return null;

  const parts = ['# DVStudio 工作流上下文\n'];
  parts.push('你是 DVStudio AI 工作流中的智能助手，可以理解当前工作状态并协助操作工作流蓝图。\n');

  // 项目上下文
  if (context.project) {
    parts.push('\n## 当前项目\n');
    if (context.project.name) parts.push(`- 项目名称: ${context.project.name}\n`);
    if (context.project.id !== undefined && context.project.id !== null) {
      parts.push(`- 项目 ID: ${context.project.id}\n`);
    }
    if (context.project.path) parts.push(`- 项目路径: ${context.project.path}\n`);
  }

  // 蓝图上下文
  if (context.blueprint) {
    parts.push('\n## 工作流蓝图\n');
    const bp = context.blueprint;

    if (bp.nodeCount !== undefined) {
      parts.push(`- 节点总数: ${bp.nodeCount}\n`);
    }
    if (bp.edgeCount !== undefined) {
      parts.push(`- 连接总数: ${bp.edgeCount}\n`);
    }

    // 节点类型统计
    if (bp.nodeTypeStats && typeof bp.nodeTypeStats === 'object') {
      const stats = Object.entries(bp.nodeTypeStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      if (stats) {
        parts.push(`- 节点类型分布: ${stats}\n`);
      }
    }

    // 当前选中节点
    if (bp.selectedNode && typeof bp.selectedNode === 'object') {
      parts.push('\n### 当前选中节点\n');
      parts.push(`- 节点 ID: ${bp.selectedNode.id || '未知'}\n`);
      parts.push(`- 节点类型: ${bp.selectedNode.type || '未知'}\n`);
      if (bp.selectedNode.label) {
        parts.push(`- 节点名称: ${bp.selectedNode.label}\n`);
      }
      if (bp.selectedNode.config && typeof bp.selectedNode.config === 'object') {
        const configKeys = Object.keys(bp.selectedNode.config).slice(0, 10);
        if (configKeys.length > 0) {
          parts.push(`- 配置字段: ${configKeys.join(', ')}\n`);
        }
      }
    }

    // 节点列表（摘要化，避免过大）
    if (Array.isArray(bp.nodes) && bp.nodes.length > 0) {
      const totalNodes = bp.nodeCount || bp.nodes.length;
      if (totalNodes <= 30) {
        parts.push('\n### 节点列表\n');
        for (const node of bp.nodes) {
          const label = node.label || node.type || 'unknown';
          parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`);
        }
      } else {
        parts.push(`\n### 节点列表（共 ${totalNodes} 个，仅展示前 ${bp.nodes.length} 个）\n`);
        for (const node of bp.nodes.slice(0, 30)) {
          const label = node.label || node.type || 'unknown';
          parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`);
        }
        if (bp.nodes.length > 30) {
          parts.push(`- ... 还有 ${bp.nodes.length - 30} 个节点未展示\n`);
        }
      }
    }
  }

  // 可用操作
  if (Array.isArray(context.availableActions) && context.availableActions.length > 0) {
    parts.push('\n## 可用工具操作\n');
    parts.push('你可以通过工具调用执行以下操作：\n');
    for (const action of context.availableActions) {
      parts.push(`- ${action}\n`);
    }
  }

  // 边界规则
  if (context.restrictions && typeof context.restrictions === 'object') {
    parts.push('\n## 边界规则\n');
    const r = context.restrictions;
    if (r.maxNodes) parts.push(`- 最大节点数限制: ${r.maxNodes}\n`);
    if (r.disallowDeleteSystemNodes) parts.push('- 禁止删除系统节点\n');
    if (r.allowedImageFormats?.length) {
      parts.push(`- 支持的图片格式: ${r.allowedImageFormats.join(', ')}\n`);
    }
    if (r.allowedVideoFormats?.length) {
      parts.push(`- 支持的视频格式: ${r.allowedVideoFormats.join(', ')}\n`);
    }
    if (r.maxConcurrentTasks) {
      parts.push(`- 最大并发任务数: ${r.maxConcurrentTasks}\n`);
    }
  }

  parts.push('\n请根据以上上下文回答用户问题。如需操作工作流蓝图，请使用工具调用。\n');

  return parts.join('');
}

/**
 * 解析工具调用参数
 */
function parseToolArguments(args) {
  if (typeof args === 'object' && args !== null) return args;
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { _raw: args };
    }
  }
  return {};
}

/**
 * Agent 流式对话
 * 
 * @param {object} ctx - 上下文
 * @param {object} payload - 负载
 * @param {string} payload.content - 文本内容
 * @param {Array} payload.attachments - 附件列表
 * @param {string} payload.modelId - 模型 ID
 * @param {string} payload.apiSource - API 来源
 * @param {object} payload.context - 工作流上下文
 * @param {Array} payload.tools - 可用工具列表
 * @param {object} payload.apiKeys - API Key 配置
 */
export async function* streamAgentMessage(ctx, payload) {
  const p = payload || {};
  const content = String(p.content || p.prompt || '').trim();
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  const modelId = String(p.modelId || p.model || 'deepseek-chat').trim();
  const apiSource = String(p.apiSource || 'deepseek').toLowerCase();
  const context = p.context || null;
  const tools = Array.isArray(p.tools) ? p.tools : [];
  const apiKeys = p.apiKeys || {};

  // 检测是否为 CLI 模式
  const cliMode = p.cliMode === true || ['claude', 'codex', 'copilot'].includes(apiSource);

  if (!content) {
    yield JSON.stringify({ type: 'error', error: 'content is required' });
    return;
  }

  // CLI 模式
  if (cliMode) {
    yield* streamViaCLI(ctx, { ...p, content, context });
    return;
  }

  // API 模式（原逻辑）
  yield* streamViaAPI(ctx, { ...p, content, modelId, apiSource, context, tools, apiKeys });
}

/**
 * CLI 模式流式对话
 */
async function* streamViaCLI(ctx, payload) {
  const p = payload || {};
  const cliAdapter = String(p.cliAdapter || p.apiSource || 'claude').toLowerCase();
  const content = p.content || '';
  const context = p.context || null;
  const cliConfig = p.cliConfig || {};

  // 构建带上下文的 prompt
  let prompt = content;
  if (context) {
    const contextPrompt = buildContextPrompt(context);
    if (contextPrompt) {
      prompt = `${contextPrompt}\n\n用户问题: ${content}`;
    }
  }

  let sessionId = null;

  try {
    // 检查 CLI 可用性
    const availability = await cliAdapterManager.checkAvailability(cliAdapter, cliConfig);
    if (!availability.available) {
      yield JSON.stringify({ 
        type: 'error', 
        error: `${availability.status}: ${cliAdapter} is not available - ${availability.error || ''}` 
      });
      return;
    }

    // 开始会话
    sessionId = await cliAdapterManager.startSession(cliAdapter, {
      cwd: cliConfig.cwd || process.cwd(),
    }, cliConfig);

    yield JSON.stringify({ type: 'session_start', sessionId, adapter: cliAdapter });

    // 发送消息
    let accumulatedContent = '';

    for await (const event of cliAdapterManager.sendMessage(sessionId, prompt, {})) {
      // 事件可能是字符串（JSON）或对象
      if (typeof event === 'string') {
        try {
          const parsed = JSON.parse(event);
          if (parsed.type === 'text_delta') {
            accumulatedContent += parsed.content;
            yield event;
          } else if (parsed.type === 'tool_call_start') {
            yield event;
          } else if (parsed.type === 'tool_call_end') {
            yield event;
          } else if (parsed.type === 'error') {
            yield event;
          } else if (parsed.type === 'done') {
            yield event;
          }
        } catch {
          // 如果不是 JSON，当作文本处理
          accumulatedContent += event;
          yield JSON.stringify({ type: 'text_delta', content: event });
        }
      } else if (event && typeof event === 'object') {
        if (event.type === 'text_delta') {
          accumulatedContent += event.content;
        }
        yield JSON.stringify(event);
      }
    }

    yield JSON.stringify({ type: 'done', content: accumulatedContent });

  } catch (err) {
    logger.error(`Agent CLI stream error: ${err.message}`);
    yield JSON.stringify({ type: 'error', error: err.message });
  } finally {
    // 结束会话
    if (sessionId) {
      try {
        await cliAdapterManager.stopSession(sessionId);
      } catch {}
    }
  }
}

/**
 * API 模式流式对话（原逻辑）
 */
async function* streamViaAPI(ctx, payload) {
  const p = payload || {};
  const content = String(p.content || '').trim();
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  const modelId = String(p.modelId || 'deepseek-chat').trim();
  const apiSource = String(p.apiSource || 'deepseek').toLowerCase();
  const context = p.context || null;
  const tools = Array.isArray(p.tools) ? p.tools : [];
  const apiKeys = p.apiKeys || {};

  // 构建消息列表
  const messages = buildMessages(content, attachments, context);

  // 获取 API 配置
  let baseUrl, apiKey;
  
  // 优先使用提供的 API Key
  if (apiKeys[apiSource]) {
    apiKey = apiKeys[apiSource];
    baseUrl = apiSource === 'deepseek' 
      ? 'https://api.deepseek.com/v1'
      : apiSource === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://ark.cn-beijing.volces.com/api/v3';
  } else {
    // 从上下文获取 API Key
    const keyRepo = ctx.localdb?.apiKeys;
    if (keyRepo) {
      if (apiSource === 'deepseek' || apiSource === 'openai') {
        const result = keyRepo.getPlaintext(apiSource === 'openai' ? 'openai' : 'deepseek');
        apiKey = result.ok ? result.plaintext : '';
      }
    }
    baseUrl = apiSource === 'deepseek' || apiSource === 'openai'
      ? 'https://api.deepseek.com/v1'
      : 'https://ark.cn-beijing.volces.com/api/v3';
  }

  if (!apiKey) {
    yield JSON.stringify({ type: 'error', error: `${apiSource} API key is not configured` });
    return;
  }

  // 获取适配器
  const adapter = getAdapter(apiSource, { baseUrl, apiKey });

  // 获取可用工具列表（如果未提供，从 MCP 获取）
  let availableTools = tools;
  if (availableTools.length === 0) {
    const toolsResult = await mcpServerManager.listTools(null);
    availableTools = toolsResult.tools || [];
  }

  // 工具调用循环
  let toolCallCount = 0;
  let finalContent = '';
  let reasoningContent = '';

  try {
    // 第一轮：发送消息给模型
    let currentMessages = [...messages];

    while (toolCallCount < MAX_TOOL_CALLS) {
      const stream = adapter.streamWithTools(modelId, currentMessages, availableTools, {
        httpClient: ctx.httpClient
      });

      let accumulatedContent = '';
      let hasToolCall = false;

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          accumulatedContent += event.delta;
          finalContent += event.delta;
          yield JSON.stringify({ type: 'text_delta', content: event.delta });
        } else if (event.type === 'thinking_delta') {
          reasoningContent += event.delta;
          yield JSON.stringify({ type: 'thinking_delta', content: event.delta });
        } else if (event.type === 'tool_call') {
          hasToolCall = true;
          toolCallCount++;

          yield JSON.stringify({
            type: 'tool_call_start',
            id: event.id,
            name: event.name,
            arguments: event.arguments
          });

          // 执行工具调用
          try {
            const args = parseToolArguments(event.arguments);
            const result = await mcpServerManager.callTool(null, event.name, args, event.id);

            yield JSON.stringify({
              type: 'tool_call_end',
              id: event.id,
              result
            });

            // 将工具结果添加回消息列表
            currentMessages.push({
              role: 'assistant',
              content: accumulatedContent,
              tool_calls: [{
                id: event.id,
                type: 'function',
                function: {
                  name: event.name,
                  arguments: typeof event.arguments === 'string' 
                    ? event.arguments 
                    : JSON.stringify(event.arguments)
                }
              }]
            });
            currentMessages.push({
              role: 'tool',
              tool_call_id: event.id,
              content: JSON.stringify(result)
            });

          } catch (toolErr) {
            yield JSON.stringify({
              type: 'tool_call_error',
              id: event.id,
              error: toolErr.message
            });
          }
        } else if (event.type === 'done') {
          if (event.content) {
            accumulatedContent = event.content;
          }
          if (event.thinking) {
            reasoningContent = event.thinking;
          }
        }
      }

      // 如果没有工具调用，说明对话结束
      if (!hasToolCall) {
        if (accumulatedContent) {
          currentMessages.push({ role: 'assistant', content: accumulatedContent });
        }
        break;
      }
    }

    if (toolCallCount >= MAX_TOOL_CALLS) {
      yield JSON.stringify({
        type: 'error',
        error: `Max tool call iterations (${MAX_TOOL_CALLS}) reached`
      });
    }

    yield JSON.stringify({ type: 'done', content: finalContent, reasoning: reasoningContent });

  } catch (err) {
    logger.error(`Agent stream error: ${err.message}`);
    yield JSON.stringify({ type: 'error', error: err.message });
  }
}

/**
 * 获取当前 Agent 上下文
 */
export function getAgentContext(ctx, payload) {
  // 这里应该从项目状态和蓝图状态获取上下文
  // 暂时返回空结构，由前端或上层调用者填充
  return {
    blueprint: {
      currentNode: null,
      nodeCount: 0,
      nodeTypes: [],
      connections: []
    },
    project: {
      path: '',
      name: '',
      resources: []
    },
    availableActions: [],
    restrictions: {}
  };
}

/**
 * 中止当前 Agent 对话
 */
export function abortAgent(ctx, payload) {
  // 暂时没有需要清理的状态
  // 后续如果要管理流式 AbortController，在这里处理
  return { ok: true };
}
