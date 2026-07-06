/**
 * API 类 LLM Provider 基类
 *
 * 封装 OpenAI 兼容 API 的通用逻辑：API Key 解析、BaseURL 选择、适配器创建、流式调用。
 * 支持通过 config.apiSource 动态选择 API 来源（deepseek/bytedance/gemini/openai）。
 */

import { ILLMProvider, ProviderEventType } from './ILLMProvider.mjs';
import { DeepSeekAdapter } from '../../chat/adapters/deepseek.mjs';
import { BytedanceAdapter } from '../../chat/adapters/bytedance.mjs';
import { GeminiAdapter } from '../../chat/adapters/gemini.mjs';
import logger from '../../../core/logger.mjs';

const BASE_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

const VENDOR_LABELS = {
  deepseek: 'DeepSeek',
  bytedance: '火山方舟',
  gemini: 'Gemini',
  openai: 'OpenAI',
};

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

function getAdapterClass(apiSource) {
  switch (apiSource) {
    case 'deepseek':
    case 'openai':
      return DeepSeekAdapter;
    case 'bytedance':
      return BytedanceAdapter;
    case 'gemini':
      return GeminiAdapter;
    default:
      return DeepSeekAdapter;
  }
}

export class ApiLLMProvider extends ILLMProvider {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  get supportsNativeToolCalls() {
    return true;
  }

  getDefaultApiSource() {
    return 'deepseek';
  }

  getBaseUrl(apiSource) {
    return BASE_URLS[apiSource] || BASE_URLS.deepseek;
  }

  getVendorLabel(apiSource) {
    return VENDOR_LABELS[apiSource] || apiSource;
  }

  resolveApiKey(apiSource, apiKeysFromInput = {}) {
    if (apiKeysFromInput && apiKeysFromInput[apiSource]) {
      return apiKeysFromInput[apiSource];
    }
    return resolveApiKey(this.ctx, apiSource);
  }

  async checkAvailable(config = {}) {
    try {
      const apiSource = config.apiSource || this.getDefaultApiSource();
      const apiKey = this.resolveApiKey(apiSource, config.apiKeys);
      return { available: !!apiKey };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  async listModels(config = {}) {
    return { models: [] };
  }

  async createSession(options = {}) {
    return { sessionId: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }

  async *streamGenerate(sessionId, input) {
    const { messages, model, tools = [], config = {} } = input;
    const apiSource = config.apiSource || this.getDefaultApiSource();
    const apiKey = this.resolveApiKey(apiSource, config.apiKeys);

    if (!apiKey) {
      yield { type: ProviderEventType.ERROR, message: `未检测到 ${this.getVendorLabel(apiSource)} 的 API Key，请先在设置中配置` };
      return;
    }

    const baseUrl = this.getBaseUrl(apiSource);
    const AdapterClass = getAdapterClass(apiSource);
    const adapter = new AdapterClass({ baseUrl, apiKey });

    const toolsForAdapter = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      inputSchema: t.function.parameters,
    }));

    try {
      const stream = adapter.streamWithTools(model, messages, toolsForAdapter, {
        httpClient: this.ctx.httpClient,
        thinkingEffort: config.thinkingEffort,
      });

      let accumulatedText = '';
      let accumulatedThinking = '';

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          accumulatedText += event.delta;
          yield { type: ProviderEventType.TEXT_DELTA, content: event.delta };
        } else if (event.type === 'thinking_delta') {
          accumulatedThinking += event.delta;
          yield { type: ProviderEventType.THINKING_DELTA, content: event.delta };
        } else if (event.type === 'tool_call') {
          yield {
            type: ProviderEventType.TOOL_CALL,
            id: event.id,
            name: event.name,
            arguments: event.arguments,
          };
        } else if (event.type === 'done') {
          if (event.thinking) {
            accumulatedThinking = event.thinking;
          }
        }
      }

      yield {
        type: ProviderEventType.DONE,
        content: accumulatedText,
        thinking: accumulatedThinking,
      };
    } catch (err) {
      logger.error(`ApiLLMProvider stream error (source=${apiSource}): ${err.message}`);
      yield { type: ProviderEventType.ERROR, message: err.message };
    }
  }

  async abort(sessionId) {}

  async destroySession(sessionId) {}
}
