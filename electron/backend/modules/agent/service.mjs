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

const MAX_TOOL_CALLS = 10;

// 各模型的上下文预算（输入 token 上限）
const MODEL_CONTEXT_BUDGETS = {
  'doubao-seed-1-6': 224000,
  'doubao-seed-1-6-flash': 224000,
  'doubao-seed-1-6-thinking': 224000,
  'doubao-seed-1-6-vision': 224000,
  'doubao-seed-2-0': 224000,
  'doubao-seed-2-1': 224000,
  'doubao-seed-evolving': 224000,
  'deepseek-v3': 96000,
  'deepseek-v3-1': 96000,
  'deepseek-v3-2': 96000,
  'deepseek-v4': 96000,
  'deepseek-r1': 256000,
  'deepseek-r3': 256000,
  'kimi-k2': 256000,
  'glm-4': 128000,
  'glm-4-5': 128000,
  'qwen2': 128000,
  'qwen3': 128000,
};

// 默认上下文预算
const DEFAULT_CONTEXT_BUDGET = 96000;

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
 * 估算文本的 token 数量
 * 中文/日文/韩文等 CJK 字符约 1.3 tokens，英文约 0.75 tokens
 */
function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  // CJK 字符
  const cjkChars = str.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
  // 其他字符
  const otherChars = str.length - cjkChars.length;
  // 粗略估算：CJK 字符约 1.3 tokens，其他约 0.75 tokens
  return Math.ceil(cjkChars.length * 1.3 + otherChars * 0.75);
}

/**
 * 根据模型 ID 获取上下文预算
 */
function getContextBudget(modelId) {
  const id = String(modelId || '').toLowerCase();
  for (const [pattern, budget] of Object.entries(MODEL_CONTEXT_BUDGETS)) {
    if (id.includes(pattern)) {
      return budget;
    }
  }
  return DEFAULT_CONTEXT_BUDGET;
}

/**
 * 构建消息列表（支持多模态和对话历史）
 */
function buildMessages(content, attachments = [], context = null, history = [], modelId = '') {
  const messages = [];

  // 添加上下文（system prompt）
  if (context) {
    const contextPrompt = buildContextPrompt(context);
    if (contextPrompt) {
      messages.push({ role: 'system', content: contextPrompt });
    }
  }

  // 添加对话历史（过滤掉 system 消息，因为系统提示已经在上面添加了）
  if (Array.isArray(history) && history.length > 0) {
    const filteredHistory = history.filter((m) => m.role !== 'system');
    messages.push(...filteredHistory);
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

  // 估算 tokens
  const tokenCount = messages.reduce((sum, msg) => {
    const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + estimateTokens(msgContent);
  }, 0);

  const budget = getContextBudget(modelId);

  return {
    messages,
    tokenCount,
    budget,
    usage: Math.min(100, Math.round((tokenCount / budget) * 100))
  };
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
 * @param {string} payload.thinkingEffort - 思考深度配置 (disabled/low/medium/high)
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
  const thinkingEffort = String(p.thinkingEffort || 'medium').toLowerCase();

  // 检测是否为 CLI 模式
  const cliMode = p.cliMode === true || ['codex', 'copilot'].includes(apiSource);

  if (!content) {
    yield { type: 'error', message: 'content is required' };
    return;
  }

  // CLI 模式
  if (cliMode) {
    yield* streamViaCLI(ctx, { ...p, content, context });
    return;
  }

  // API 模式（原逻辑）
  yield* streamViaAPI(ctx, { ...p, content, modelId, apiSource, context, tools, apiKeys, thinkingEffort });
}

/**
 * CLI 模式流式对话
 */
async function* streamViaCLI(ctx, payload) {
  const p = payload || {};
  const cliAdapter = String(p.cliAdapter || p.apiSource || 'codex').toLowerCase();
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
      yield { 
        type: 'error', 
        message: `${availability.status}: ${cliAdapter} is not available - ${availability.error || ''}` 
      };
      return;
    }

    // 开始会话
    sessionId = await cliAdapterManager.startSession(cliAdapter, {
      cwd: cliConfig.cwd || process.cwd(),
    }, cliConfig);

    yield { type: 'session_start', sessionId, adapter: cliAdapter };

    // 发送消息
    let accumulatedContent = '';

    for await (const event of cliAdapterManager.sendMessage(sessionId, prompt, {})) {
      // 事件可能是字符串（JSON）或对象
      let parsedEvent = event;
      if (typeof event === 'string') {
        try {
          parsedEvent = JSON.parse(event);
        } catch {
          accumulatedContent += event;
          yield { type: 'text', content: event };
          continue;
        }
      }
      
      if (parsedEvent && typeof parsedEvent === 'object') {
        if (parsedEvent.type === 'text_delta') {
          accumulatedContent += parsedEvent.content || '';
          yield { type: 'text', content: parsedEvent.content || '' };
        } else if (parsedEvent.type === 'thinking_delta') {
          yield { type: 'thinking_delta', content: parsedEvent.content || '' };
        } else if (parsedEvent.type === 'tool_call_start') {
          yield {
            type: 'tool_call_start',
            toolCallId: parsedEvent.id || parsedEvent.toolCallId || '',
            tool: parsedEvent.name || parsedEvent.tool || '',
            input: parsedEvent.arguments || parsedEvent.input
          };
        } else if (parsedEvent.type === 'tool_call_end') {
          yield {
            type: 'tool_call_end',
            toolCallId: parsedEvent.id || parsedEvent.toolCallId || '',
            tool: parsedEvent.name || parsedEvent.tool || '',
            output: parsedEvent.result || parsedEvent.output
          };
        } else if (parsedEvent.type === 'tool_call_error') {
          yield {
            type: 'tool_call_error',
            toolCallId: parsedEvent.id || parsedEvent.toolCallId || '',
            tool: parsedEvent.name || parsedEvent.tool || '',
            error: parsedEvent.error || parsedEvent.message || 'Unknown tool call error'
          };
        } else if (parsedEvent.type === 'error') {
          yield { type: 'error', message: parsedEvent.error || parsedEvent.message || 'Unknown error' };
        } else if (parsedEvent.type === 'session_start' || parsedEvent.type === 'session_end') {
          // 内部事件，不转发给前端
        } else if (parsedEvent.type === 'done') {
          // skip, we'll send our own done
        } else {
          // pass through other events
          yield parsedEvent;
        }
      }
    }

    yield { type: 'done', content: accumulatedContent };

  } catch (err) {
    logger.error(`Agent CLI stream error: ${err.message}`);
    yield { type: 'error', message: err.message };
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
 * 尝试从多个 provider key 名称中获取 API Key
 */
function tryGetApiKey(ctx, ...names) {
  const keyRepo = ctx.localdb?.apiKeys;
  if (!keyRepo || typeof keyRepo.getPlaintext !== 'function') return '';
  for (const name of names) {
    try {
      const r = keyRepo.getPlaintext(name);
      if (r && r.ok && r.plaintext && String(r.plaintext).trim()) {
        return String(r.plaintext).trim();
      }
    } catch {}
  }
  return '';
}

/**
 * 根据 apiSource 解析对应的 API Key（支持多个别名）
 */
function resolveApiKey(ctx, apiSource) {
  switch (apiSource) {
    case 'bytedance':
      return tryGetApiKey(ctx, 'bytedance_ark', 'bytedance_text', 'bytedance', 'doubao', 'ark', 'volcengine');
    case 'deepseek':
      return tryGetApiKey(ctx, 'deepseek', 'deepseek_api', 'deepseek-chat');
    case 'gemini':
      return tryGetApiKey(ctx, 'gemini', 'google_gemini', 'gemini_api');
    case 'openai':
      return tryGetApiKey(ctx, 'openai', 'openai_api');
    default:
      return tryGetApiKey(ctx, apiSource);
  }
}

// 各 apiSource 对应的 baseUrl
const BASE_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
};

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
  const thinkingEffort = String(p.thinkingEffort || 'medium').toLowerCase();
  const history = Array.isArray(p.history) ? p.history : [];

  // 获取 API 配置
  let baseUrl, apiKey;

  baseUrl = BASE_URLS[apiSource] || BASE_URLS.deepseek;

  // 优先使用前端传入的 API Key
  if (apiKeys && apiKeys[apiSource]) {
    apiKey = apiKeys[apiSource];
  } else {
    // 从本地数据库获取（支持多个别名）
    apiKey = resolveApiKey(ctx, apiSource);
  }

  if (!apiKey) {
    const vendorLabels = {
      deepseek: 'DeepSeek',
      bytedance: '火山方舟',
      gemini: 'Gemini',
      openai: 'OpenAI'
    };
    const vendorLabel = vendorLabels[apiSource] || apiSource;
    yield { type: 'error', message: `未检测到 ${vendorLabel} 的 API Key，请先在设置中配置` };
    return;
  }

  // 获取适配器
  const adapter = getAdapter(apiSource, { baseUrl, apiKey });

  // 获取可用工具列表（如果未提供，从 MCP 获取）
  let availableTools = tools;
  if (availableTools.length === 0) {
    try {
      const toolsResult = await mcpServerManager.listTools(null);
      availableTools = toolsResult.tools || [];
    } catch (mcpErr) {
      logger.warn(`Failed to list MCP tools, proceeding without tools: ${mcpErr.message}`);
      availableTools = [];
    }
  }

  // 工具调用循环
  let toolCallCount = 0;
  let finalContent = '';
  let reasoningContent = '';

  try {
    // 构建消息列表（包含历史）
    let buildResult = buildMessages(content, attachments, context, history, modelId);
    let currentMessages = [...buildResult.messages];

    // 如果 token 数量超过预算的 80%，进行截断
    const budget = buildResult.budget;
    const TRUNCATION_THRESHOLD = 0.8;

    while (buildResult.tokenCount > budget * TRUNCATION_THRESHOLD) {
      if (history.length <= 0) break;

      const removedPair = history.splice(0, 2);
      buildResult = buildMessages(content, attachments, context, history, modelId);
      currentMessages = [...buildResult.messages];
    }

    // 发送上下文使用率事件
    yield {
      type: 'context_usage',
      tokenCount: buildResult.tokenCount,
      budget: buildResult.budget,
      usage: buildResult.usage,
      truncated: history.length < p.history?.length
    };

    while (toolCallCount < MAX_TOOL_CALLS) {
      const stream = adapter.streamWithTools(modelId, currentMessages, availableTools, {
        httpClient: ctx.httpClient,
        thinkingEffort
      });

      let accumulatedContent = '';
      let hasToolCall = false;

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          accumulatedContent += event.delta;
          finalContent += event.delta;
          yield { type: 'text', content: event.delta };
        } else if (event.type === 'thinking_delta') {
          reasoningContent += event.delta;
          yield { type: 'thinking_delta', content: event.delta };
        } else if (event.type === 'tool_call') {
          hasToolCall = true;
          toolCallCount++;

          yield {
            type: 'tool_call_start',
            toolCallId: event.id,
            tool: event.name,
            input: event.arguments
          };

          // 执行工具调用
          try {
            const args = parseToolArguments(event.arguments);
            const result = await mcpServerManager.callTool(null, event.name, args, event.id);

            yield {
              type: 'tool_call_end',
              toolCallId: event.id,
              tool: event.name,
              output: result
            };

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
            yield {
              type: 'tool_call_error',
              toolCallId: event.id,
              tool: event.name,
              error: toolErr.message
            };
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
      yield {
        type: 'error',
        message: `Max tool call iterations (${MAX_TOOL_CALLS}) reached`
      };
    }

    yield { type: 'done', content: finalContent, reasoning: reasoningContent };

  } catch (err) {
    logger.error(`Agent stream error: ${err.message}`);
    yield { type: 'error', message: err.message };
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

/**
 * 获取 Agent 会话列表
 */
export function listAgentConversations(ctx, payload) {
  const projectPath = String(payload?.projectPath || '').trim();
  const repo = ctx.localdb?.chatConversations;
  if (!repo || typeof repo.list !== 'function') {
    return { ok: false, error: 'chatConversations repo not available' };
  }
  try {
    const conversations = repo.list({ projectPath });
    return { ok: true, conversations };
  } catch (err) {
    logger.error(`List agent conversations error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 创建 Agent 会话
 */
export function createAgentConversation(ctx, payload) {
  const title = String(payload?.title || '').trim() || '新对话';
  const model = String(payload?.model || '').trim();
  const projectPath = String(payload?.projectPath || '').trim();
  const repo = ctx.localdb?.chatConversations;
  if (!repo || typeof repo.create !== 'function') {
    return { ok: false, error: 'chatConversations repo not available' };
  }
  try {
    const result = repo.create({ title, model, projectPath });
    if (!result.ok) {
      return result;
    }
    return { ok: true, conversation: result.conversation };
  } catch (err) {
    logger.error(`Create agent conversation error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 删除 Agent 会话
 */
export function deleteAgentConversation(ctx, payload) {
  const id = String(payload?.id || '').trim();
  if (!id) {
    return { ok: false, error: 'id is required' };
  }
  const repo = ctx.localdb?.chatConversations;
  if (!repo || typeof repo.remove !== 'function') {
    return { ok: false, error: 'chatConversations repo not available' };
  }
  try {
    const result = repo.remove(id);
    return result;
  } catch (err) {
    logger.error(`Delete agent conversation error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 获取 Agent 会话消息
 */
export function getAgentConversationMessages(ctx, payload) {
  const conversationId = String(payload?.conversationId || '').trim();
  if (!conversationId) {
    return { ok: false, error: 'conversationId is required' };
  }
  const repo = ctx.localdb?.chatConversations;
  if (!repo || typeof repo.getMessages !== 'function') {
    return { ok: false, error: 'chatConversations repo not available' };
  }
  try {
    const messages = repo.getMessages(conversationId);
    return { ok: true, messages };
  } catch (err) {
    logger.error(`Get agent conversation messages error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 添加 Agent 会话消息
 */
export function addAgentConversationMessage(ctx, payload) {
  const conversationId = String(payload?.conversationId || '').trim();
  const role = String(payload?.role || 'user').trim() || 'user';
  const content = String(payload?.content || '');
  const model = String(payload?.model || '').trim();
  if (!conversationId) {
    return { ok: false, error: 'conversationId is required' };
  }
  const repo = ctx.localdb?.chatConversations;
  if (!repo || typeof repo.addMessage !== 'function') {
    return { ok: false, error: 'chatConversations repo not available' };
  }
  try {
    const result = repo.addMessage({ conversationId, role, content, model });
    return result;
  } catch (err) {
    logger.error(`Add agent conversation message error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
