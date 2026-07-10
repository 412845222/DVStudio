/**
 * OpenAI 兼容 API 适配器
 * 
 * 通用 OpenAI 兼容格式适配器，可用于任何遵循 OpenAI Chat Completions API 格式的服务。
 */

import { BaseAdapter } from './base.mjs';
import { upstreamError } from '../../../core/errors.mjs';

/**
 * OpenAI 兼容适配器
 */
export class OpenAICompatibleAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey || '';
    if (!this.baseUrl) {
      throw new Error('baseUrl is required for OpenAICompatibleAdapter');
    }
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getApiKey() {
    return this.apiKey;
  }

  supportsTools(/* modelId */) {
    return false;
  }

  supportsVision(/* modelId */) {
    return false;
  }

  parseThinking(/* response */) {
    return null;
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

    const body = {
      model: modelId,
      messages: this._buildMessages(messages),
      stream: true
    };

    if (streamTools) {
      body.tools = this._buildToolsSchema(tools);
    }

    let accumulatedContent = '';
    let toolCalls = [];
    let thinking = '';

    try {
      const stream = client.postStream(`${this.baseUrl}/chat/completions`, {
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
            if (delta.content) {
              accumulatedContent += delta.content;
              yield { type: 'text_delta', delta: delta.content };
            }

            if (delta.reasoning_content) {
              thinking += delta.reasoning_content;
              yield { type: 'thinking_delta', delta: delta.reasoning_content };
            }

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
          // ignore parse errors
        }
      }

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

      yield { type: 'done', content: accumulatedContent, thinking };

    } catch (err) {
      throw upstreamError(`OpenAI compatible API error: ${err.message}`);
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
      model: modelId,
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
        throw upstreamError(`OpenAI compatible API error: ${errMsg}`);
      }

      const choice = res.body?.choices?.[0];
      const content = choice?.message?.content || '';
      const reasoning = this.parseThinking(res.body) || '';

      return { content, reasoning, raw: res.body };

    } catch (err) {
      throw upstreamError(`OpenAI compatible API error: ${err.message}`);
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
