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
import { ToolImageProcessor } from './ToolImageProcessor.mjs';
import { getProviderById } from '../providers/index.mjs';
import { ProviderEventType } from '../providers/ILLMProvider.mjs';
import logger from '../../../core/logger.mjs';

const DEFAULT_MAX_TOOL_CALLS = 35;

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
    const parsedMaxToolCalls = (p.maxToolCalls !== undefined && p.maxToolCalls !== null)
      ? Number(p.maxToolCalls)
      : DEFAULT_MAX_TOOL_CALLS;
    const maxToolCalls = (!isNaN(parsedMaxToolCalls) && parsedMaxToolCalls > 0)
      ? parsedMaxToolCalls
      : DEFAULT_MAX_TOOL_CALLS;
    const enableToolCallWarning = p.enableToolCallWarning !== false;
    const providedTools = Array.isArray(p.tools) ? p.tools : [];
    const customSystemPrompt = typeof p.systemPrompt === 'string' ? p.systemPrompt.trim() : '';
    const useCustomSystemPromptOnly = customSystemPrompt && providedTools.length > 0;

    const providerId = backend;
    logger.info(`AgentRuntime: using backend=${providerId}, model=${model}, apiSource=${apiSource}, customSystemPrompt=${useCustomSystemPromptOnly ? 'yes' : 'no'}`);
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
        const sess = await provider.createSession({ model, cwd: p.cwd });
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

    const toolImageProcessor = new ToolImageProcessor(this.ctx);
    let sessionImages = [];

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

      const toolPromptText = (!provider.supportsNativeToolCalls && !provider.executesOwnTools)
        ? this.toolRegistry.toCliToolPrompt(tools)
        : null;

      let systemPrompt;
      let currentMessages;
      if (useCustomSystemPromptOnly) {
        const needCliToolPrompt = !provider.supportsNativeToolCalls && !provider.executesOwnTools;
        const cliToolInstructions = needCliToolPrompt
          ? '\n\n' + this.toolRegistry.toCliToolPrompt(tools)
          : '';
        systemPrompt = customSystemPrompt + cliToolInstructions;
        logger.info(`AgentRuntime: BLENDER MODE - using custom system prompt only (no blueprint context), cliToolInstructions appended: ${needCliToolPrompt}, executesOwnTools: ${provider.executesOwnTools}`);
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
        const rawMessages = [
          { role: 'system', content: systemPrompt },
          ...history.filter(m => m.role === 'user' || m.role === 'assistant'),
          { role: 'user', content: userContent }
        ];
        const budget = ContextBuilder.getContextBudget(model);
        const initialTokens = ContextBuilder.estimateMessagesTokens(rawMessages);
        const TRUNCATION_THRESHOLD = 0.8;
        let truncResult = { messages: rawMessages, tokenCount: initialTokens, truncated: false };
        if (initialTokens > budget * TRUNCATION_THRESHOLD) {
          truncResult = ContextBuilder.truncateMessagesInLoop(rawMessages, budget * TRUNCATION_THRESHOLD);
          logger.info(`AgentRuntime: BLENDER MODE - initial truncation: ${initialTokens} -> ${truncResult.tokenCount} tokens (budget=${budget}), truncated=${truncResult.truncated}`);
        }
        currentMessages = truncResult.messages;
        yield {
          type: 'context_usage',
          tokenCount: truncResult.tokenCount,
          budget: budget,
          usage: Math.min(100, Math.round((truncResult.tokenCount / budget) * 100)),
          truncated: truncResult.truncated,
        };
      } else {
        const baseSystemPrompt = this.contextBuilder.buildSystemPrompt(context, {
          includeToolInstructions: !provider.supportsNativeToolCalls && !provider.executesOwnTools && !customSystemPrompt,
          toolPromptText,
        });
        systemPrompt = customSystemPrompt
          ? customSystemPrompt + '\n\n' + baseSystemPrompt
          : baseSystemPrompt;

        const buildResult = this.contextBuilder.buildMessagesWithTruncation(
          content,
          attachments,
          history,
          model
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
        apiSource: apiSource,
      };

      const openaiTools = provider.supportsNativeToolCalls
        ? tools
        : undefined;

      let toolCallCount = 0;
      let finalContent = '';
      let reasoningContent = '';
      const toolResultCache = new Map();
      const UNCACHEABLE_TOOLS = new Set([
        'blender_get_screenshot_of_area_as_image',
        'blender_get_screenshot_of_window_as_image',
      ]);
      while (toolCallCount < maxToolCalls) {
        if (abortController.signal.aborted) {
          yield { type: 'error', message: '请求已取消' };
          return;
        }

        const stream = provider.streamGenerate(sessionId, {
          messages: currentMessages,
          model: model,
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

        if (provider.executesOwnTools) {
          toolCallsToExecute = [];
        }

        if (toolCallsToExecute.length === 0) {
          break;
        }

        const assistantToolCalls = [];
        let roundImages = [];

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

          let rawResult;
          let toolError = null;
          let sanitizedResult;
          let resultImages = [];

          const cacheKey = `${tc.name}:${JSON.stringify(args)}`;
          const isCacheable = !UNCACHEABLE_TOOLS.has(tc.name);
          if (isCacheable && toolResultCache.has(cacheKey) && toolCallCount > 1) {
            const cached = toolResultCache.get(cacheKey);
            rawResult = cached.rawResult;
            sanitizedResult = cached.sanitizedResult;
            resultImages = cached.images || [];
            const cachedImagesForFrontend = [];
            for (const img of resultImages) {
              try {
                const dataUrl = await toolImageProcessor.readAsDataUrl(img.localPath);
                if (dataUrl) {
                  cachedImagesForFrontend.push({
                    mimeType: img.mimeType,
                    dataUrl,
                    fileName: img.fileName,
                  });
                }
              } catch {}
            }
            yield {
              type: 'tool_call_end',
              toolCallId: tcId,
              tool: tc.name,
              output: sanitizedResult,
              images: cachedImagesForFrontend,
            };
          } else {
            try {
              rawResult = await this.toolRegistry.callTool(tc.name, args, tcId);
              const processed = toolImageProcessor.processToolResult(rawResult);
              sanitizedResult = processed.sanitizedResult;
              resultImages = processed.images;
              roundImages.push(...resultImages);
              const imagesForFrontend = [];
              for (const img of resultImages) {
                try {
                  const dataUrl = await toolImageProcessor.readAsDataUrl(img.localPath);
                  if (dataUrl) {
                    imagesForFrontend.push({
                      mimeType: img.mimeType,
                      dataUrl,
                      fileName: img.fileName,
                    });
                  }
                } catch {}
              }
              if (isCacheable) {
                toolResultCache.set(cacheKey, { rawResult, sanitizedResult, images: resultImages });
              }
              yield {
                type: 'tool_call_end',
                toolCallId: tcId,
                tool: tc.name,
                output: sanitizedResult,
                images: imagesForFrontend,
              };
            } catch (err) {
              toolError = err.message;
              rawResult = { error: err.message };
              sanitizedResult = rawResult;
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
            result: rawResult,
            sanitizedResult,
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
              content: JSON.stringify(atc.error ? { error: atc.error } : atc.sanitizedResult),
            });
          }

          if (roundImages.length > 0) {
            sessionImages.push(...roundImages);
            const screenshotMsgText = '以下是操作后的最新截图（screenshot_id: ' + Date.now() + '），请仔细查看截图验证当前Blender画面状态并继续：';
            const imageParts = [{
              type: 'text',
              text: screenshotMsgText
            }];
            for (const img of roundImages) {
              const imageUrl = img.dataUrl || img.fileUrl;
              imageParts.push({
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'auto' }
              });
              logger.info(`AgentRuntime: Adding screenshot to vision context: ${img.fileName}, using ${img.dataUrl ? 'dataUrl' : 'fileUrl'}`);
            }
            for (let i = currentMessages.length - 1; i >= 0; i--) {
              const msg = currentMessages[i];
              if (msg.role === 'user' && Array.isArray(msg.content)) {
                const hasText = msg.content.some(p => p.type === 'text' && typeof p.text === 'string' && p.text.includes('screenshot_id:'));
                const hasImage = msg.content.some(p => p.type === 'image_url');
                if (hasText && hasImage) {
                  currentMessages.splice(i, 1);
                  logger.info(`AgentRuntime: Removed previous screenshot message to save tokens (index: ${i})`);
                  break;
                }
              }
            }
            currentMessages.push({ role: 'user', content: imageParts });
            logger.info(`AgentRuntime: Added ${roundImages.length} screenshot(s) as vision context, total this session: ${sessionImages.length}`);
          }

          const budget = ContextBuilder.getContextBudget(model);
          const currentTokens = ContextBuilder.estimateMessagesTokens(currentMessages);
          const LOOP_THRESHOLD = 0.85;
          if (currentTokens > budget * LOOP_THRESHOLD) {
            const beforeCount = currentTokens;
            const compressResult = ContextBuilder.truncateMessagesInLoop(currentMessages, budget * LOOP_THRESHOLD);
            currentMessages = compressResult.messages;
            logger.info(`AgentRuntime: Dynamic context compression in tool loop: ${beforeCount} -> ${compressResult.tokenCount} tokens (truncated=${compressResult.truncated})`);
          }
          const newTokens = ContextBuilder.estimateMessagesTokens(currentMessages);
          yield {
            type: 'context_usage',
            tokenCount: newTokens,
            budget: budget,
            usage: Math.min(100, Math.round((newTokens / budget) * 100)),
            truncated: newTokens < currentTokens,
          };
        } else {
          currentMessages.push({ role: 'assistant', content: accumulatedText });
          const resultParts = [];
          for (const atc of assistantToolCalls) {
            resultParts.push(`<|FunctionResult|>`);
            resultParts.push(`工具: ${atc.name}`);
            resultParts.push(`结果: ${JSON.stringify(atc.error ? { error: atc.error } : atc.sanitizedResult, null, 2)}`);
            if (atc.error) {
              resultParts.push(`错误: ${atc.error}`);
            }
            resultParts.push(`<|FunctionCallEnd|>`);
          }
          resultParts.push('请根据工具执行结果继续回答用户问题。如需调用更多工具，请使用相同的 <|FunctionCallBegin|> 格式。');
          currentMessages.push({ role: 'user', content: resultParts.join('\n') });

          const budgetCli = ContextBuilder.getContextBudget(model);
          const tokensCli = ContextBuilder.estimateMessagesTokens(currentMessages);
          yield {
            type: 'context_usage',
            tokenCount: tokensCli,
            budget: budgetCli,
            usage: Math.min(100, Math.round((tokensCli / budgetCli) * 100)),
            truncated: false,
          };
        }
      }

      if (toolCallCount >= maxToolCalls) {
        if (enableToolCallWarning) {
          const limitMsg = `\n\n⚠️ 已达到最大工具调用次数（${maxToolCalls}次），当前轮次暂停。您可以继续发送消息让我基于已有结果继续完成任务。`;
          finalContent += limitMsg;
          yield { type: 'text_delta', content: limitMsg };
        }
        logger.warn(`AgentRuntime: Max tool call iterations (${maxToolCalls}) reached, enableToolCallWarning=${enableToolCallWarning}`);
      }

      yield {
        type: 'done',
        content: finalContent,
        reasoning: reasoningContent,
      };
    } finally {
      this._abortControllers.delete(sessionId);
      try {
        toolImageProcessor.cleanupSessionFiles();
      } catch (cleanupErr) {
        logger.warn(`AgentRuntime: Failed to cleanup session screenshot files: ${cleanupErr.message}`);
      }
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
