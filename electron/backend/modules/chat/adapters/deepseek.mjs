/**
 * DeepSeek API 适配器
 * 
 * 支持 DeepSeek Chat、DeepSeek V3、DeepSeek R1 等模型。
 */

import { BaseAdapter } from './base.mjs';
import { upstreamError } from '../../../core/errors.mjs';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * DeepSeek 适配器
 */
export class DeepSeekAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || DEEPSEEK_BASE_URL;
    this.apiKey = config.apiKey || '';
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getApiKey() {
    return this.apiKey;
  }

  supportsTools(modelId) {
    // DeepSeek Chat 和 V3 支持工具调用
    // DeepSeek R1 主要用于推理，但也可以配置工具
    const toolCallingModels = ['deepseek-chat', 'deepseek-v3'];
    return toolCallingModels.some(m => modelId.toLowerCase().includes(m));
  }

  supportsVision(modelId) {
    // DeepSeek 目前不支持视觉
    return false;
  }

  parseThinking(response) {
    // DeepSeek R1 返回 reasoning_content 字段
    return response.reasoning_content || null;
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

    // 构建请求体
    const body = {
      model: modelId,
      messages: this._buildMessages(messages),
      stream: true
    };

    if (streamTools) {
      body.tools = this._buildToolsSchema(tools);
    }

    // 如果模型支持思考过程，启用它
    if (modelId.toLowerCase().includes('r1')) {
      body.reasoning = true;
    }

    let accumulatedContent = '';
    let toolCalls = [];
    let thinking = '';

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

            // 思考过程 (reasoning_content)
            if (delta.reasoning_content) {
              thinking += delta.reasoning_content;
              yield { type: 'thinking_delta', delta: delta.reasoning_content };
            }

            // 工具调用
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

      // 如果有工具调用，先返回工具调用事件
      for (const tc of parsedToolCalls) {
        yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments };
      }

      yield { type: 'done', content: accumulatedContent, thinking };

    } catch (err) {
      throw upstreamError(`DeepSeek API error: ${err.message}`);
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

    if (modelId.toLowerCase().includes('r1')) {
      body.reasoning = true;
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
        throw upstreamError(`DeepSeek API error: ${errMsg}`);
      }

      const choice = res.body?.choices?.[0];
      const content = choice?.message?.content || '';
      const reasoning = this.parseThinking(res.body) || '';

      return { content, reasoning, raw: res.body };

    } catch (err) {
      throw upstreamError(`DeepSeek API error: ${err.message}`);
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
