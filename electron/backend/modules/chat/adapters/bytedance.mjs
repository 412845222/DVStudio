/**
 * 火山方舟 API 适配器
 * 
 * 支持豆包 Seed 系列、GLM、Kimi、Qwen 等模型。
 */

import { BaseAdapter } from './base.mjs';
import { upstreamError } from '../../../core/errors.mjs';

// 支持视觉的模型列表
const BYTEDANCE_VISION_MODELS = [
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'doubao-seed-1-8-251228',
  'doubao-seed-1-6-flash-250828',
  'doubao-seed-1-6-vision-250815',
  'doubao-seedream-4-5-251128',
  'doubao-seedream-3-0-t2i-250415',
  'doubao-seedream-4-0-250828',
  'doubao-seedream-5-0-260128',
  'jimeng-image-3.0',
  'jimeng-image-4.0'
];

// 支持工具调用的模型
const BYTEDANCE_TOOL_MODELS = [
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'doubao-seed-2-0-code-preview-260215',
  'glm-4-7-251222',
  'glm-4-5-air',
  'deepseek-v3-2-251201',
  'deepseek-v3-1-terminus',
  'deepseek-v3-1-250821',
  'deepseek-v3-250324',
  'deepseek-r1-250528',
  'kimi-k2-250905',
  'qwen3-32b',
  'qwen3-14b',
  'qwen3-8b',
  'qwen3-0-6b',
  'qwen2-5-72b'
];

/**
 * 火山方舟适配器
 */
export class BytedanceAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3';
    this.apiKey = config.apiKey || '';
    this.endpointId = config.endpointId || '';
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getApiKey() {
    return this.apiKey;
  }

  supportsTools(modelId) {
    return BYTEDANCE_TOOL_MODELS.includes(modelId);
  }

  supportsVision(modelId) {
    return BYTEDANCE_VISION_MODELS.includes(modelId);
  }

  /**
   * 流式文本输出（带 Tool Calling）
   */
  async *streamWithTools(modelId, messages, tools = [], options = {}) {
    const client = options.httpClient;
    if (!client) {
      throw new Error('HTTP client not provided');
    }

    const streamTools = tools.length > 0 && this.supportsTools(modelId);

    // 火山方舟使用不同的 API 格式
    const body = {
      model: this.endpointId || modelId,
      messages: this._buildMessages(messages),
      stream: true
    };

    if (streamTools) {
      body.tools = this._buildToolsSchema(tools);
    }

    let accumulatedContent = '';
    let toolCalls = [];

    try {
      const stream = await client.post(`${this.baseUrl}/chat/completions`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        timeout: options.timeout || 120000
      });

      for await (const rawLine of stream) {
        const line = String(rawLine || '').trim();
        if (!line || !line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta;

          if (delta) {
            // 文本增量
            if (delta.content) {
              accumulatedContent += delta.content;
              yield { type: 'text_delta', delta: delta.content };
            }

            // 工具调用 (火山方舟格式)
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index || 0;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: tc.id || `tool_${Date.now()}_${index}`,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || ''
                  };
                } else {
                  toolCalls[index].arguments += tc.function?.arguments || '';
                }
              }
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      // 解析完整的工具调用参数
      const parsedToolCalls = toolCalls
        .filter(tc => tc && tc.name)
        .map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: this._parseArguments(tc.arguments)
        }));

      for (const tc of parsedToolCalls) {
        yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments };
      }

      yield { type: 'done', content: accumulatedContent };

    } catch (err) {
      throw upstreamError(`Bytedance API error: ${err.message}`);
    }
  }

  /**
   * 流式文本输出（不带 Tool Calling）
   */
  async *streamText(modelId, messages, options = {}) {
    yield* this.streamWithTools(modelId, messages, [], options);
  }

  /**
   * 非流式文本输出
   */
  async sendWithTools(modelId, messages, tools = [], options = {}) {
    const client = options.httpClient;
    if (!client) {
      throw new Error('HTTP client not provided');
    }

    const streamTools = tools.length > 0 && this.supportsTools(modelId);

    const body = {
      model: this.endpointId || modelId,
      messages: this._buildMessages(messages),
      stream: false
    };

    if (streamTools) {
      body.tools = this._buildToolsSchema(tools);
    }

    try {
      const res = await client.post(`${this.baseUrl}/chat/completions`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        timeout: options.timeout || 120000
      });

      if (!res.ok) {
        const errMsg = res.body?.error?.message || `HTTP ${res.status}`;
        throw upstreamError(`Bytedance API error: ${errMsg}`);
      }

      const choice = res.body?.choices?.[0];
      const content = choice?.message?.content || '';

      return { content, raw: res.body };

    } catch (err) {
      throw upstreamError(`Bytedance API error: ${err.message}`);
    }
  }

  _buildMessages(messages) {
    return messages.map(m => {
      const msg = { role: m.role, content: m.content };
      if (m.name) msg.name = m.name;
      if (m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      return msg;
    });
  }

  _buildToolsSchema(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    }));
  }

  _parseArguments(argsStr) {
    if (!argsStr) return {};
    try {
      return JSON.parse(argsStr);
    } catch {
      return { _raw: argsStr };
    }
  }
}
