/**
 * API 适配器基类
 * 
 * 定义统一接口，各 API 来源适配器继承实现。
 */

export class BaseAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * 流式文本输出（带 Tool Calling）
   * @param {string} modelId - 模型 ID
   * @param {Array} messages - 消息列表
   * @param {Array} tools - 工具列表
   * @param {object} options - 额外选项
   * @returns {AsyncGenerator} 事件生成器
   */
  async *streamWithTools(modelId, messages, tools = [], options = {}) {
    throw new Error('streamWithTools must be implemented by subclass');
  }

  /**
   * 流式文本输出（不带 Tool Calling）
   * @param {string} modelId - 模型 ID
   * @param {Array} messages - 消息列表
   * @param {object} options - 额外选项
   * @returns {AsyncGenerator} 事件生成器
   */
  async *streamText(modelId, messages, options = {}) {
    throw new Error('streamText must be implemented by subclass');
  }

  /**
   * 非流式文本输出（带 Tool Calling）
   * @param {string} modelId - 模型 ID
   * @param {Array} messages - 消息列表
   * @param {Array} tools - 工具列表
   * @param {object} options - 额外选项
   * @returns {Promise<object>} 响应结果
   */
  async sendWithTools(modelId, messages, tools = [], options = {}) {
    throw new Error('sendWithTools must be implemented by subclass');
  }

  /**
   * 解析思考内容（部分模型支持）
   * @param {object} response - API 响应
   * @returns {string|null} 思考内容
   */
  parseThinking(response) {
    return null;
  }

  /**
   * 检查是否支持视觉（图片输入）
   * @param {string} modelId - 模型 ID
   * @returns {boolean}
   */
  supportsVision(modelId) {
    return false;
  }

  /**
   * 检查是否支持工具调用
   * @param {string} modelId - 模型 ID
   * @returns {boolean}
   */
  supportsTools(modelId) {
    return false;
  }

  /**
   * 获取 API 基础 URL
   * @returns {string}
   */
  getBaseUrl() {
    throw new Error('getBaseUrl must be implemented by subclass');
  }

  /**
   * 获取 API Key
   * @returns {string}
   */
  getApiKey() {
    throw new Error('getApiKey must be implemented by subclass');
  }
}

/**
 * 适配器注册表
 */
export const adapterRegistry = new Map();

/**
 * 注册适配器
 * @param {string} name - 适配器名称
 * @param {class} adapterClass - 适配器类
 */
export function registerAdapter(name, adapterClass) {
  adapterRegistry.set(name, adapterClass);
}

/**
 * 获取适配器
 * @param {string} name - 适配器名称
 * @returns {class|null}
 */
export function getAdapterClass(name) {
  return adapterRegistry.get(name) || null;
}
