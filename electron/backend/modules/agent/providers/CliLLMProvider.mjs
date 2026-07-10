/**
 * CLI 类 LLM Provider 基类
 *
 * 封装 CLI 子进程适配器（Copilot/Codex 等）的通用逻辑：
 * - 会话管理（startSession/sendMessage/stopSession 委托给 cliAdapterManager）
 * - 多轮消息列表 → 单次 CLI prompt 的拼接
 * - 工具输出文本解析
 *
 * 子类只需设置 id / displayName / adapterName。
 */

import { ILLMProvider, ProviderEventType } from './ILLMProvider.mjs';
import { CLIEventType } from '../../cli-adapters/base.mjs';
import { parseToolCallsFromText } from './toolOutputParser.mjs';
import { cliAdapterManager } from '../../cli-adapters/manager.mjs';
import logger from '../../../core/logger.mjs';

export class CliLLMProvider extends ILLMProvider {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  /**
   * 子类实现：返回 CLI 适配器名称，如 'copilot' / 'codex'
   */
  get adapterName() {
    throw new Error('adapterName must be implemented by subclass');
  }

  get supportsNativeToolCalls() {
    return false;
  }

  get executesOwnTools() {
    return true;
  }

  async checkAvailable(config = {}) {
    try {
      const result = await cliAdapterManager.checkAvailability(this.adapterName, config);
      return { available: !!result.available, error: result.error };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  async listModels(config = {}) {
    try {
      const models = await cliAdapterManager.listModels(this.adapterName);
      return { models: models || [] };
    } catch (err) {
      logger.warn(`CliLLMProvider (${this.id}) listModels failed: ${err.message}`);
      return { models: [] };
    }
  }

  async createSession(options = {}) {
    const cwd = options.cwd || process.cwd();
    const sessionId = await cliAdapterManager.startSession(this.adapterName, { cwd }, options.config || {});
    return { sessionId };
  }

  /**
   * 将多轮 OpenAI 格式消息列表拼接为单次 CLI prompt
   */
  formatMessagesToPrompt(messages) {
    const parts = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(typeof msg.content === 'string' ? msg.content : this.extractTextFromParts(msg.content));
        parts.push('');
      } else if (msg.role === 'user') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : this.extractTextFromParts(msg.content);
        parts.push(`\n\nHuman: ${text}`);
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : '';
        parts.push(`\n\nAssistant: ${content}`);
      } else if (msg.role === 'tool') {
        parts.push(`\n\n[Tool Result]: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`);
      }
    }
    parts.push('\n\nAssistant:');
    return parts.join('');
  }

  extractTextFromParts(content) {
    if (!content || typeof content !== 'object') return String(content || '');
    if (Array.isArray(content)) {
      return content
        .filter(p => p && typeof p === 'object' && p.type === 'text')
        .map(p => p.text || '')
        .join('');
    }
    return JSON.stringify(content);
  }

  async *streamGenerate(sessionId, input) {
    const { messages, model, config = {} } = input;
    const prompt = this.formatMessagesToPrompt(messages);

    // 确保会话存在
    let sessInfo = cliAdapterManager.getSessionInfo(sessionId);
    if (!sessInfo) {
      try {
        sessionId = await cliAdapterManager.startSession(this.adapterName, { cwd: config.cwd || process.cwd() }, config.cliConfig || {});
      } catch (err) {
        yield { type: ProviderEventType.ERROR, message: `Failed to start ${this.displayName} session: ${err.message}` };
        return;
      }
    }

    let accumulatedText = '';
    let accumulatedThinking = '';

    try {
      const availability = await cliAdapterManager.checkAvailability(this.adapterName, config.cliConfig || {});
      if (!availability.available) {
        yield {
          type: ProviderEventType.ERROR,
          message: `${this.displayName} 不可用: ${availability.error || availability.status || 'unknown'}`,
        };
        return;
      }

      const stream = cliAdapterManager.sendMessage(sessionId, prompt, { model });

      for await (const event of stream) {
        let parsedEvent = event;
        if (typeof event === 'string') {
          try {
            parsedEvent = JSON.parse(event);
          } catch {
            accumulatedText += event;
            yield { type: ProviderEventType.TEXT_DELTA, content: event };
            continue;
          }
        }

        if (parsedEvent && typeof parsedEvent === 'object') {
          const eventType = parsedEvent.type;

          if (eventType === CLIEventType.TEXT_DELTA || eventType === 'text_delta') {
            const content = parsedEvent.content || '';
            accumulatedText += content;
            yield { type: ProviderEventType.TEXT_DELTA, content };
          } else if (eventType === CLIEventType.THINKING_DELTA || eventType === 'thinking_delta' || eventType === CLIEventType.THINKING) {
            const content = parsedEvent.content || '';
            accumulatedThinking += content;
            yield { type: ProviderEventType.THINKING_DELTA, content };
          } else if (eventType === CLIEventType.TOOL_CALL_START || eventType === 'tool_call_start') {
            yield {
              type: ProviderEventType.TOOL_CALL,
              id: parsedEvent.toolCallId,
              name: parsedEvent.tool,
              arguments: parsedEvent.input || {},
            };
          } else if (eventType === CLIEventType.TOOL_CALL_END || eventType === 'tool_call_end') {
            yield {
              type: ProviderEventType.TOOL_RESULT,
              id: parsedEvent.toolCallId,
              name: parsedEvent.tool,
              result: parsedEvent.output || parsedEvent.result || {},
              isError: false,
            };
          } else if (eventType === CLIEventType.TOOL_CALL_ERROR || eventType === 'tool_call_error') {
            yield {
              type: ProviderEventType.TOOL_RESULT,
              id: parsedEvent.toolCallId,
              name: parsedEvent.tool,
              result: { error: parsedEvent.error || parsedEvent.message || 'Tool error' },
              isError: true,
            };
          } else if (eventType === CLIEventType.ERROR || eventType === 'error') {
            yield { type: ProviderEventType.ERROR, message: parsedEvent.error || parsedEvent.message || 'Unknown CLI error' };
            return;
          } else if (eventType === CLIEventType.DONE || eventType === 'done') {
            if (parsedEvent.content) {
              accumulatedText = parsedEvent.content;
            }
            if (parsedEvent.thinking) {
              accumulatedThinking = parsedEvent.thinking;
            }
          }
        }
      }

      yield {
        type: ProviderEventType.DONE,
        content: accumulatedText,
        thinking: accumulatedThinking,
      };
    } catch (err) {
      logger.error(`CliLLMProvider (${this.id}) stream error: ${err.message}`);
      yield { type: ProviderEventType.ERROR, message: err.message };
    }
  }

  parseToolCallsFromText(text) {
    return parseToolCallsFromText(text);
  }

  async abort(sessionId) {
    try {
      cliAdapterManager.cancel(sessionId);
    } catch (err) {
      logger.warn(`CliLLMProvider abort failed: ${err.message}`);
    }
  }

  async destroySession(sessionId) {
    try {
      await cliAdapterManager.stopSession(sessionId);
    } catch (err) {
      logger.debug(`CliLLMProvider destroySession: ${err.message}`);
    }
  }
}
