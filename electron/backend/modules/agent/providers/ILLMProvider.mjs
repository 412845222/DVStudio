/**
 * LLM Provider 统一接口定义
 *
 * 所有 LLM Provider（API类、CLI类）必须实现此接口。
 */

export const ProviderEventType = {
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  TOOL_CALL: 'tool_call',
  DONE: 'done',
  ERROR: 'error',
};

export class ILLMProvider {
  /**
   * Provider 标识
   * @type {string}
   */
  get id() { throw new Error('id must be implemented by subclass'); }

  /**
   * 显示名称
   * @type {string}
   */
  get displayName() { throw new Error('displayName must be implemented by subclass'); }

  /**
   * 是否支持原生 function calling
   * - true (API类): 直接使用 OpenAI tools 参数，模型原生返回 tool_calls
   * - false (CLI类): Runtime 通过 prompt 注入工具描述，并解析模型输出中的工具调用
   * @type {boolean}
   */
  get supportsNativeToolCalls() { throw new Error('supportsNativeToolCalls must be implemented by subclass'); }

  /**
   * 检查 Provider 是否可用
   * @param {object} config
   * @returns {Promise<{available: boolean, error?: string}>}
   */
  async checkAvailable(config = {}) { throw new Error('checkAvailable must be implemented by subclass'); }

  /**
   * 列出可用模型
   * @param {object} config
   * @returns {Promise<{models: Array<{id: string, label: string, vendor?: string, capabilities?: string[], recommended?: boolean}>}>}
   */
  async listModels(config = {}) { throw new Error('listModels must be implemented by subclass'); }

  /**
   * 创建会话（有状态 Provider 使用，如 CLI 会话）
   * @param {object} options
   * @returns {Promise<{sessionId: string}>}
   */
  async createSession(options = {}) { throw new Error('createSession must be implemented by subclass'); }

  /**
   * 流式生成（单轮）
   *
   * 对于 native function calling Provider：
   *   input.tools 是 OpenAI 格式的工具定义数组
   *   输出事件中包含 { type: 'tool_call', id, name, arguments }
   *
   * 对于非 native Provider：
   *   input.tools 由 Runtime 转换为 prompt 片段注入 system message
   *   输出中不会有 tool_call，由 Runtime.parseToolCallsFromText 解析
   *
   * @param {string} sessionId
   * @param {object} input
   * @param {Array} input.messages - 消息列表（OpenAI chat format）
   * @param {string} input.model - 模型 ID
   * @param {Array} [input.tools] - 工具定义（OpenAI function format）
   * @param {object} [input.config] - 其他配置（thinkingEffort/apiKeys 等）
   * @yields {{ type: string, [key: string]: any }}
   */
  // eslint-disable-next-line require-yield
  async *streamGenerate(sessionId, input) { throw new Error('streamGenerate must be implemented by subclass'); }

  /**
   * 从输出文本中解析工具调用（仅 supportsNativeToolCalls=false 时需要实现）
   * @param {string} text
   * @returns {Array<{id: string, name: string, arguments: object}>}
   */
  parseToolCallsFromText(text) { return []; }

  /**
   * 中断会话
   * @param {string} sessionId
   */
  async abort(sessionId) { throw new Error('abort must be implemented by subclass'); }

  /**
   * 销毁会话
   * @param {string} sessionId
   */
  async destroySession(sessionId) { throw new Error('destroySession must be implemented by subclass'); }
}
