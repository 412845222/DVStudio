/**
 * Gemini API 适配器
 * 
 * 支持 Gemini Flash Image 等图片生成模型。
 */

import { BaseAdapter } from './base.mjs';
import { upstreamError } from '../../../core/errors.mjs';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// 支持视觉的模型
const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview'
];

/**
 * Gemini 适配器
 */
export class GeminiAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || GEMINI_BASE_URL;
    this.apiKey = config.apiKey || '';
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getApiKey() {
    return this.apiKey;
  }

  supportsTools(modelId) {
    // Gemini 模型工具调用支持
    return false; // 暂时不支持，后续根据实际情况开启
  }

  supportsVision(modelId) {
    return GEMINI_VISION_MODELS.some(m => modelId.toLowerCase().includes(m.replace('.', '-')));
  }

  /**
   * 流式文本输出
   * Gemini 使用不同的 API 格式
   */
  async *streamText(modelId, messages, options = {}) {
    const client = options.httpClient;
    if (!client) {
      throw new Error('HTTP client not provided');
    }

    // Gemini API 格式转换
    const contents = this._convertToGeminiFormat(messages);
    const url = `${this.baseUrl}/models/${modelId}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    try {
      const stream = await client.post(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature || 0.9,
            topP: options.topP || 0.95,
            topK: options.topK || 40,
            maxOutputTokens: options.maxOutputTokens || 2048
          }
        }),
        timeout: options.timeout || 120000
      });

      let accumulatedContent = '';

      for await (const rawLine of stream) {
        const line = String(rawLine || '').trim();
        if (!line || !line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);

          // Gemini 流式响应格式
          if (parsed.candidates) {
            for (const candidate of parsed.candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    accumulatedContent += part.text;
                    yield { type: 'text_delta', delta: part.text };
                  }
                }
              }
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      yield { type: 'done', content: accumulatedContent };

    } catch (err) {
      throw upstreamError(`Gemini API error: ${err.message}`);
    }
  }

  /**
   * 流式文本输出（带 Tool Calling）- 暂不支持
   */
  async *streamWithTools(modelId, messages, tools = [], options = {}) {
    // Gemini 目前不支持此格式，直接使用 streamText
    yield* this.streamText(modelId, messages, options);
  }

  /**
   * 非流式文本输出
   */
  async sendWithTools(modelId, messages, tools = [], options = {}) {
    const client = options.httpClient;
    if (!client) {
      throw new Error('HTTP client not provided');
    }

    const contents = this._convertToGeminiFormat(messages);

    try {
      const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;

      const res = await client.post(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature || 0.9,
            topP: options.topP || 0.95,
            topK: options.topK || 40,
            maxOutputTokens: options.maxOutputTokens || 2048
          }
        }),
        timeout: options.timeout || 120000
      });

      if (!res.ok) {
        const errMsg = res.body?.error?.message || `HTTP ${res.status}`;
        throw upstreamError(`Gemini API error: ${errMsg}`);
      }

      let content = '';
      if (res.body?.candidates) {
        for (const candidate of res.body.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                content += part.text;
              }
            }
          }
        }
      }

      return { content, raw: res.body };

    } catch (err) {
      throw upstreamError(`Gemini API error: ${err.message}`);
    }
  }

  /**
   * 转换消息格式为 Gemini 格式
   */
  _convertToGeminiFormat(messages) {
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemini 使用 systemInstruction
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            // 处理图片
            parts.push({
              inlineData: {
                mimeType: part.image_url?.mime_type || 'image/jpeg',
                data: part.image_url.url.replace(/^data:[^;]+;base64,/, '')
              }
            });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }
}
