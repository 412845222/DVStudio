/**
 * Agent Runtime 编排层
 *
 * 核心职责：
 * - 管理 LLM Provider 实例
 * - 统一工具调用循环（支持 native function calling 和 CLI 文本解析两种模式）
 * - 统一上下文构建、消息列表管理
 * - 输出与前端现有 ChatStreamEvent 格式兼容的事件
 */

import { ToolRegistry } from './ToolRegistry.mjs';
import { ContextBuilder } from './ContextBuilder.mjs';
import { getProviderById } from '../providers/index.mjs';
import { ProviderEventType } from '../providers/ILLMProvider.mjs';
import logger from '../../../core/logger.mjs';

const MAX_TOOL_CALLS = 35;

export class AgentRuntime {
  constructor(ctx) {
    this.ctx = ctx;
    this.toolRegistry = new ToolRegistry(ctx);
    this.contextBuilder = new ContextBuilder();
    this.providers = new Map();
    this.sessions = new Map();
    this._abortControllers = new Map();
  }

  getProvider(providerId) {
    if (!this.providers.has(providerId)) {
      const ProviderClass = getProviderById(providerId);
      if (!ProviderClass) {
        throw new Error(`Unknown provider: ${providerId}`);
      }
      if (providerId === 'dvsagent') {
        this.providers.set(providerId, new ProviderClass(this.ctx, this.toolRegistry));
      } else {
        this.providers.set(providerId, new ProviderClass(this.ctx));
      }
    }
    return this.providers.get(providerId);
  }

  parseToolArguments(args) {
    if (!args) return {};
    if (typeof args === 'object') return args;
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return { _raw: args };
      }
    }
    return {};
  }

  async *streamMessage(payload) {
    const p = payload || {};

    const content = String(p.content ?? p.prompt ?? '').trim();
    const attachments = Array.isArray(p.attachments) ? p.attachments : [];
    const model = String(p.model || p.modelId || 'doubao-seed-evolving').trim();
    const backend = String(p.backend || 'dvsagent').toLowerCase();
    const context = p.context || null;
    const history = Array.isArray(p.history) ? p.history.filter(m => m.role !== 'system') : [];
    const apiKeys = p.apiKeys || {};
    const apiSource = String(p.apiSource || 'bytedance').toLowerCase();
    const thinkingEffort = String(p.thinkingEffort || 'medium').toLowerCase();
    const providedTools = Array.isArray(p.tools) ? p.tools : [];
    const customSystemPrompt = typeof p.systemPrompt === 'string' ? p.systemPrompt.trim() : '';
    const useCustomSystemPromptOnly = customSystemPrompt && providedTools.length > 0;

    const providerId = (backend === 'dvsagent' || useCustomSystemPromptOnly) ? 'dvsagent' : backend;
    const forcedDvsAgentForTools = useCustomSystemPromptOnly && backend !== 'dvsagent';
    if (forcedDvsAgentForTools) {
      logger.info(`AgentRuntime: BLENDER MODE - forcing dvsagent provider (native tool calls required), requested backend was: ${backend}, model was: ${model}`);
    }
    const effectiveModel = forcedDvsAgentForTools
      ? 'doubao-seed-evolving'
      : model;
    const effectiveApiSource = forcedDvsAgentForTools
      ? 'bytedance'
      : apiSource;
    let provider;
    try {
      provider = this.getProvider(providerId);
    } catch (err) {
      yield { type: 'error', message: err.message };
      return;
    }

    let sessionId = p.sessionId;
    if (!sessionId) {
      try {
        const sess = await provider.createSession({ model: effectiveModel, cwd: p.cwd });
        sessionId = sess.sessionId;
      } catch (err) {
        yield { type: 'error', message: `Failed to create session: ${err.message}` };
        return;
      }
      this.sessions.set(sessionId, { providerId, createdAt: Date.now() });
      yield { type: 'session_start', sessionId, backend: providerId };
    }

    const abortController = new AbortController();
    this._abortControllers.set(sessionId, abortController);

    try {
      let tools;
      if (providedTools.length > 0) {
        const allTools = await this.toolRegistry.listTools();
        const allowedNames = new Set(providedTools.map(t => String(t)));
        tools = allTools.filter(t => allowedNames.has(t.function.name));
        logger.info(`AgentRuntime: BLENDER MODE - requested tools: ${Array.from(allowedNames).join(', ')}`);
        logger.info(`AgentRuntime: BLENDER MODE - found ${allTools.length} total tools, ${tools.length} matched: ${tools.map(t => t.function.name).join(', ')}`);
        if (tools.length === 0) {
          const allNames = allTools.map(t => t.function.name).join(', ');
          logger.warn(`AgentRuntime: BLENDER MODE - no matching tools found! Available tool names: ${allNames}`);
          yield { type: 'error', message: `Blender工具不可用：找不到 ${Array.from(allowedNames).join(', ')}。请确认Blender已连接。当前可用工具：${allNames}` };
          return;
        }
      } else {
        tools = await this.toolRegistry.listTools();
        logger.info(`AgentRuntime: ${tools.length} tools available: ${tools.map(t => t.function.name).join(', ')}`);
      }

      const toolPromptText = provider.supportsNativeToolCalls
        ? null
        : this.toolRegistry.toCliToolPrompt(tools);

      let systemPrompt;
      let currentMessages;
      if (useCustomSystemPromptOnly) {
        const cliToolInstructions = !provider.supportsNativeToolCalls
          ? '\n\n' + this.toolRegistry.toCliToolPrompt(tools)
          : '';
        systemPrompt = customSystemPrompt + cliToolInstructions;
        logger.info(`AgentRuntime: BLENDER MODE - using custom system prompt only (no blueprint context), cliToolInstructions appended: ${!provider.supportsNativeToolCalls}`);
        const userContent = attachments.length > 0
          ? (() => {
              const parts = [{ type: 'text', text: content }];
              for (const att of attachments) {
                if (att.type === 'image_url' || String(att.name || '').match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                  parts.push({
                    type: 'image_url',
                    image_url: { url: att.data || att.url, detail: 'auto' },
                  });
                }
              }
              return parts;
            })()
          : content;
        currentMessages = [
          { role: 'system', content: systemPrompt },
          ...history.filter(m => m.role === 'user' || m.role === 'assistant'),
          { role: 'user', content: userContent }
        ];
        yield {
          type: 'context_usage',
          tokenCount: 0,
          budget: 0,
          usage: 0,
          truncated: false,
        };
      } else {
        const baseSystemPrompt = this.contextBuilder.buildSystemPrompt(context, {
          includeToolInstructions: !provider.supportsNativeToolCalls && !customSystemPrompt,
          toolPromptText,
        });
        systemPrompt = customSystemPrompt
          ? customSystemPrompt + '\n\n' + baseSystemPrompt
          : baseSystemPrompt;

        const buildResult = this.contextBuilder.buildMessagesWithTruncation(
          content,
          attachments,
          history,
          effectiveModel
        );

        currentMessages = [
          { role: 'system', content: systemPrompt },
          ...buildResult.messages,
        ];

        yield {
          type: 'context_usage',
          tokenCount: buildResult.tokenCount,
          budget: buildResult.budget,
          usage: buildResult.usage,
          truncated: buildResult.truncated,
        };
      }

      const providerConfig = {
        thinkingEffort,
        apiKeys,
        apiSource: effectiveApiSource,
      };

      const openaiTools = provider.supportsNativeToolCalls
        ? tools
        : undefined;

      let toolCallCount = 0;
      let finalContent = '';
      let reasoningContent = '';
      const toolResultCache = new Map();

      while (toolCallCount < MAX_TOOL_CALLS) {
        if (abortController.signal.aborted) {
          yield { type: 'error', message: '请求已取消' };
          return;
        }

        const stream = provider.streamGenerate(sessionId, {
          messages: currentMessages,
          model: effectiveModel,
          tools: openaiTools,
          config: providerConfig,
        });

        let accumulatedText = '';
        let accumulatedThinking = '';
        const nativeToolCalls = [];

        try {
          for await (const event of stream) {
            if (abortController.signal.aborted) break;

            switch (event.type) {
              case ProviderEventType.TEXT_DELTA:
                accumulatedText += event.content;
                finalContent += event.content;
                yield { type: 'text_delta', content: event.content };
                break;

              case ProviderEventType.THINKING_DELTA:
                accumulatedThinking += event.content;
                reasoningContent += event.content;
                yield { type: 'thinking_delta', content: event.content };
                break;

              case ProviderEventType.TOOL_CALL:
                if (provider.executesOwnTools) {
                  yield {
                    type: 'tool_call_start',
                    toolCallId: event.id || `tool_${Date.now()}`,
                    tool: event.name,
                    input: event.arguments,
                  };
                } else {
                  nativeToolCalls.push({
                    id: event.id || `call_${Date.now()}_${nativeToolCalls.length}`,
                    name: event.name,
                    arguments: event.arguments,
                  });
                }
                break;

              case ProviderEventType.TOOL_RESULT:
                if (provider.executesOwnTools) {
                  if (event.isError) {
                    yield {
                      type: 'tool_call_error',
                      toolCallId: event.id,
                      tool: event.name,
                      error: (event.result && event.result.error) || 'Tool error',
                    };
                  } else {
                    yield {
                      type: 'tool_call_end',
                      toolCallId: event.id,
                      tool: event.name,
                      output: event.result,
                    };
                  }
                }
                break;

              case ProviderEventType.ERROR:
                yield { type: 'error', message: event.message };
                return;

              case ProviderEventType.DONE:
                if (event.content) {
                  accumulatedText = event.content;
                }
                if (event.thinking) {
                  accumulatedThinking = event.thinking;
                }
                break;
            }
          }
        } catch (err) {
          logger.error(`Provider stream error: ${err.message}`);
          yield { type: 'error', message: err.message };
          return;
        }

        let toolCallsToExecute = nativeToolCalls;

        if (!provider.supportsNativeToolCalls && nativeToolCalls.length === 0) {
          toolCallsToExecute = provider.parseToolCallsFromText(accumulatedText);
        }

        if (provider.executesOwnTools && !useCustomSystemPromptOnly) {
          toolCallsToExecute = [];
        }

        if (toolCallsToExecute.length === 0) {
          break;
        }

        const assistantToolCalls = [];

        for (const tc of toolCallsToExecute) {
          if (abortController.signal.aborted) break;
          toolCallCount++;
          const tcId = tc.id;
          const args = this.parseToolArguments(tc.arguments);

          yield {
            type: 'tool_call_start',
            toolCallId: tcId,
            tool: tc.name,
            input: args,
          };

          let toolResult;
          let toolError = null;

          const cacheKey = `${tc.name}:${JSON.stringify(args)}`;
          if (toolResultCache.has(cacheKey) && toolCallCount > 1) {
            toolResult = toolResultCache.get(cacheKey);
            yield {
              type: 'tool_call_end',
              toolCallId: tcId,
              tool: tc.name,
              output: toolResult,
            };
          } else {
            try {
              toolResult = await this.toolRegistry.callTool(tc.name, args, tcId);
              toolResultCache.set(cacheKey, toolResult);
              yield {
                type: 'tool_call_end',
                toolCallId: tcId,
                tool: tc.name,
                output: toolResult,
              };
            } catch (err) {
              toolError = err.message;
              toolResult = { error: err.message };
              yield {
                type: 'tool_call_error',
                toolCallId: tcId,
                tool: tc.name,
                error: err.message,
              };
            }
          }

          assistantToolCalls.push({
            id: tcId,
            name: tc.name,
            arguments: args,
            result: toolResult,
            error: toolError,
          });
        }

        if (provider.supportsNativeToolCalls) {
          const assistantMsg = {
            role: 'assistant',
            content: accumulatedText || null,
            tool_calls: assistantToolCalls.map(atc => ({
              id: atc.id,
              type: 'function',
              function: {
                name: atc.name,
                arguments: typeof atc.arguments === 'string' ? atc.arguments : JSON.stringify(atc.arguments),
              },
            })),
          };
          currentMessages.push(assistantMsg);

          for (const atc of assistantToolCalls) {
            currentMessages.push({
              role: 'tool',
              tool_call_id: atc.id,
              content: JSON.stringify(atc.error ? { error: atc.error } : atc.result),
            });
          }
        } else {
          currentMessages.push({ role: 'assistant', content: accumulatedText });
          const resultParts = [];
          for (const atc of assistantToolCalls) {
            resultParts.push(`<|FunctionResult|>`);
            resultParts.push(`工具: ${atc.name}`);
            resultParts.push(`结果: ${JSON.stringify(atc.result, null, 2)}`);
            if (atc.error) {
              resultParts.push(`错误: ${atc.error}`);
            }
            resultParts.push(`<|FunctionCallEnd|>`);
          }
          resultParts.push('请根据工具执行结果继续回答用户问题。如需调用更多工具，请使用相同的 <|FunctionCallBegin|> 格式。');
          currentMessages.push({ role: 'user', content: resultParts.join('\n') });
        }
      }

      if (toolCallCount >= MAX_TOOL_CALLS) {
        const limitMsg = `\n\n⚠️ 已达到最大工具调用次数（${MAX_TOOL_CALLS}次），当前轮次暂停。您可以继续发送消息让我基于已有结果继续完成任务。`;
        finalContent += limitMsg;
        yield { type: 'text_delta', content: limitMsg };
        logger.warn(`AgentRuntime: Max tool call iterations (${MAX_TOOL_CALLS}) reached, yielding warning and completing`);
      }

      yield {
        type: 'done',
        content: finalContent,
        reasoning: reasoningContent,
      };
    } finally {
      this._abortControllers.delete(sessionId);
    }
  }

  abortSession(sessionId) {
    const ac = this._abortControllers.get(sessionId);
    if (ac) {
      ac.abort();
      this._abortControllers.delete(sessionId);
    }
    return { ok: true };
  }

  destroySession(sessionId) {
    this.abortSession(sessionId);
    this.sessions.delete(sessionId);
    return { ok: true };
  }
}
