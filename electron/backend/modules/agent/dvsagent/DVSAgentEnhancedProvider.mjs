/**
 * DVSAgent 增强版 Provider
 *
 * 第一阶段（MVP）：
 * - 使用专用 DVSAgentLLMClient，完整支持原生 function calling
 * - 正确解析API Key，支持多模型源（bytedance/openai/gemini）
 * - 保持与 AgentRuntime 的兼容接口
 *
 * 后续阶段将添加：
 * - ToolCallEnhancer 参数验证/错误恢复
 * - SkillManager 技能系统
 * - Planner 任务规划
 * - MemoryManager 记忆管理
 */

import { ILLMProvider, ProviderEventType } from '../providers/ILLMProvider.mjs';
import { DVSAgentLLMClient } from './LLMClient.mjs';
import logger from '../../../core/logger.mjs';

const BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

const KEY_NAMES = {
  bytedance: ['bytedance_ark', 'bytedance_text', 'bytedance', 'doubao', 'ark', 'volcengine'],
  openai: ['openai', 'openai_api'],
  gemini: ['gemini', 'google_gemini', 'gemini_api'],
};

function resolveApiKey(ctx, apiSource, apiKeysFromInput = {}) {
  if (apiKeysFromInput && apiKeysFromInput[apiSource]) {
    return apiKeysFromInput[apiSource];
  }
  const keyRepo = ctx.localdb?.apiKeys;
  if (!keyRepo || typeof keyRepo.getPlaintext !== 'function') return '';

  const names = KEY_NAMES[apiSource] || [apiSource];
  for (const name of names) {
    try {
      const r = keyRepo.getPlaintext(name);
      if (r?.ok && r.plaintext) return String(r.plaintext).trim();
    } catch {}
  }
  return '';
}

export class DVSAgentEnhancedProvider extends ILLMProvider {
  constructor(ctx, toolRegistry = null) {
    super();
    this.ctx = ctx;
    this.toolRegistry = toolRegistry;
    this.clients = new Map();
  }

  get id() { return 'dvsagent'; }
  get displayName() { return 'DVS Agent'; }
  get supportsNativeToolCalls() { return true; }
  get executesOwnTools() { return false; }

  async checkAvailable(config = {}) {
    try {
      const apiSource = config.apiSource || 'bytedance';
      const apiKey = resolveApiKey(this.ctx, apiSource, config.apiKeys);
      return { available: !!apiKey };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  async listModels(config = {}) {
    return { models: [] };
  }

  async createSession(options = {}) {
    const sessionId = `dvs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { sessionId };
  }

  async *streamGenerate(sessionId, input) {
    const { messages, model, tools = [], config = {} } = input;
    const apiSource = config.apiSource || 'bytedance';
    const apiKey = resolveApiKey(this.ctx, apiSource, config.apiKeys);

    if (!apiKey) {
      yield {
        type: ProviderEventType.ERROR,
        message: `未检测到 ${apiSource === 'bytedance' ? '火山方舟' : apiSource} 的 API Key，请先在设置中配置`,
      };
      return;
    }

    const client = this.createClient(apiSource, apiKey, config);

    try {
      const stream = client.streamChat({
        messages,
        model,
        tools: tools || [],
        config,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            yield { type: ProviderEventType.TEXT_DELTA, content: event.content };
            break;

          case 'thinking_delta':
            yield { type: ProviderEventType.THINKING_DELTA, content: event.content };
            break;

          case 'tool_call':
            yield {
              type: ProviderEventType.TOOL_CALL,
              id: event.id,
              name: event.name,
              arguments: event.arguments,
            };
            break;

          case 'error':
            yield { type: ProviderEventType.ERROR, message: event.message };
            break;

          case 'done':
            yield {
              type: ProviderEventType.DONE,
              content: event.content,
              thinking: event.thinking,
            };
            break;
        }
      }
    } catch (err) {
      logger.error(`DVSAgentEnhancedProvider stream error: ${err.message}`);
      yield { type: ProviderEventType.ERROR, message: err.message };
    }
  }

  createClient(apiSource, apiKey, config = {}) {
    return new DVSAgentLLMClient({
      apiKey,
      baseUrl: BASE_URLS[apiSource] || BASE_URLS.bytedance,
      httpClient: this.ctx.httpClient,
      apiSource,
      endpointId: config.endpointId || '',
    });
  }

  async abort(sessionId) {}

  async destroySession(sessionId) {
    this.clients.delete(sessionId);
  }
}
