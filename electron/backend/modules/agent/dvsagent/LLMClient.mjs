/**
 * DVSAgent 专用 LLM 客户端
 * 直接处理 OpenAI Chat Completions API，原生支持 function calling
 * 严格对齐 BytedanceAdapter 的经过验证的实现逻辑
 */

function parseArguments(argsStr) {
  if (!argsStr) return {};
  if (typeof argsStr === 'object') return argsStr;
  try {
    return JSON.parse(argsStr);
  } catch {
    return { _raw: argsStr };
  }
}

const NO_TOOL_PATTERNS = [
  'seedream', 'seedance', 'seed-translation', 'seed-code',
  'seed-character', 'jimeng',
];

const TOOL_MODEL_PREFIXES = [
  'doubao-seed-', 'deepseek-v', 'deepseek-r', 'glm-', 'kimi-', 'qwen',
];

const THINKING_MODEL_PREFIXES = [
  'doubao-seed-evolving', 'doubao-seed-2-1-', 'doubao-seed-1-6-',
];

const NO_THINKING_PATTERNS = [
  'seedream', 'seedance', 'seed-translation', 'seed-code',
  'seed-character', 'jimeng-image', 'jimeng-video',
];

function modelSupportsTools(modelId) {
  const id = String(modelId || '').toLowerCase();
  for (const p of NO_TOOL_PATTERNS) {
    if (id.includes(p)) return false;
  }
  for (const prefix of TOOL_MODEL_PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

function modelSupportsThinking(modelId) {
  const id = String(modelId || '').toLowerCase();
  for (const p of NO_THINKING_PATTERNS) {
    if (id.includes(p)) return false;
  }
  for (const prefix of THINKING_MODEL_PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

export class DVSAgentLLMClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.httpClient = config.httpClient;
    this.apiSource = config.apiSource || 'bytedance';
    this.endpointId = config.endpointId || '';
  }

  async *streamChat(params) {
    const { messages, model, tools = [], config = {} } = params;
    const client = this.httpClient;
    if (!client) {
      yield { type: 'error', message: 'HTTP client not provided' };
      return;
    }

    const thinkingEffort = config.thinkingEffort || 'medium';
    const canUseTools = tools.length > 0 && (this.apiSource !== 'bytedance' || modelSupportsTools(model));

    const body = {
      model: this.endpointId || model,
      messages: this.buildMessages(messages),
      stream: true,
    };

    if (this.apiSource === 'bytedance' && thinkingEffort !== 'disabled' && modelSupportsThinking(model)) {
      body.extra_body = {
        thinking: {
          type: 'enabled',
          reasoning_effort: thinkingEffort,
        },
      };
    }

    if (canUseTools) {
      body.tools = this.buildToolsSchema(tools);
    }

    let accumulatedContent = '';
    let accumulatedThinking = '';
    const toolCalls = [];

    try {
      const stream = client.postStream(`${this.baseUrl}/chat/completions`, {
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        timeout: config.timeout || 120000,
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
            if (delta.thinking) {
              accumulatedThinking += delta.thinking;
              yield { type: 'thinking_delta', content: delta.thinking };
            } else if (delta.reasoning_content) {
              accumulatedThinking += delta.reasoning_content;
              yield { type: 'thinking_delta', content: delta.reasoning_content };
            }

            if (delta.content) {
              accumulatedContent += delta.content;
              yield { type: 'text_delta', content: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index || 0;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: tc.id || `tool_${Date.now()}_${index}`,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
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
          arguments: parseArguments(tc.arguments),
        }));

      for (const tc of parsedToolCalls) {
        yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments };
      }

      yield {
        type: 'done',
        content: accumulatedContent,
        thinking: accumulatedThinking,
        toolCalls: parsedToolCalls,
      };
    } catch (err) {
      yield { type: 'error', message: err.message || String(err) };
    }
  }

  buildMessages(messages) {
    return messages.map(m => {
      const msg = { role: m.role };

      if (m.role === 'tool') {
        msg.tool_call_id = m.tool_call_id;
        msg.content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      } else if (m.tool_calls) {
        msg.content = m.content || null;
        msg.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
          },
        }));
      } else {
        msg.content = m.content;
      }

      if (m.name) msg.name = m.name;
      return msg;
    });
  }

  buildToolsSchema(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description || '',
        parameters: tool.function?.parameters || tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  buildHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
