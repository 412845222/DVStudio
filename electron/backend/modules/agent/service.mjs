/**
 * Agent 执行器
 *
 * 新架构：统一通过 AgentRuntime + Provider 编排层处理所有后端（dvsagent/copilot/codex）。
 * Runtime 负责：工具调用循环、上下文构建、历史管理、流式事件输出。
 * 各 Provider（ApiLLMProvider/CliLLMProvider 子类）负责：与具体 LLM 后端的通信。
 */

import { internalError } from '../../core/errors.mjs';
import logger from '../../core/logger.mjs';

// 新架构：Agent Runtime + Provider
import { AgentRuntime } from './runtime/AgentRuntime.mjs';
import { getProviderById } from './providers/index.mjs';

let runtimeInstance = null;

function getRuntime(ctx) {
  if (!runtimeInstance) {
    runtimeInstance = new AgentRuntime(ctx);
  }
  return runtimeInstance;
}

/**
 * Agent 流式对话（统一入口）
 *
 * @param {object} ctx - 上下文
 * @param {object} payload - 负载
 * @param {string} payload.content - 文本内容
 * @param {Array} payload.attachments - 附件列表
 * @param {string} payload.model - 模型 ID
 * @param {string} payload.backend - 后端标识 (dvsagent/copilot/codex)
 * @param {string} payload.apiSource - API 来源（仅 dvsagent 使用）
 * @param {object} payload.context - 工作流上下文
 * @param {Array} payload.history - 对话历史
 * @param {object} payload.apiKeys - API Key 配置
 * @param {string} payload.thinkingEffort - 思考深度配置
 */
export async function* streamAgentMessage(ctx, payload) {
  const p = payload || {};
  const content = String(p.content ?? p.prompt ?? '').trim();

  let backend = p.backend ? String(p.backend).toLowerCase() : null;
  if (!backend) {
    const apiSource = String(p.apiSource || 'bytedance').toLowerCase();
    const cliMode = p.cliMode === true || ['codex', 'copilot'].includes(apiSource);
    backend = cliMode ? apiSource : 'dvsagent';
  }

  if (!content) {
    yield { type: 'error', message: 'content is required' };
    return;
  }

  const ProviderClass = getProviderById(backend);
  if (!ProviderClass) {
    yield { type: 'error', message: `Unknown backend: ${backend}` };
    return;
  }

  try {
    const runtime = getRuntime(ctx);
    yield* runtime.streamMessage({
      ...p,
      content,
      model: String(p.model || p.modelId || 'doubao-seed-evolving').trim(),
      backend,
      apiSource: String(p.apiSource || 'bytedance').toLowerCase(),
      context: p.context || null,
      apiKeys: p.apiKeys || {},
      thinkingEffort: String(p.thinkingEffort || 'medium').toLowerCase(),
      history: Array.isArray(p.history) ? p.history : [],
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      tools: Array.isArray(p.tools) ? p.tools : [],
    });
  } catch (err) {
    logger.error(`Runtime stream failed for backend=${backend}: ${err.message}`);
    yield { type: 'error', message: err.message };
  }
}

/**
 * 中止当前 Agent 对话
 */
export function abortAgent(ctx, payload) {
  const sessionId = String(payload?.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'sessionId is required' };
  }
  try {
    const runtime = getRuntime(ctx);
    return runtime.abortSession(sessionId);
  } catch (err) {
    logger.error(`Abort agent session failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 获取当前 Agent 上下文
 */
export function getAgentContext(ctx, payload) {
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
