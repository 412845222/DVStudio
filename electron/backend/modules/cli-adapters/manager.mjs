/**
 * CLI 适配器管理器
 * 
 * 管理多个 CLI 适配器，提供统一的接口。
 */

import { ClaudeCliAdapter } from './claudeCli.mjs';
import { CodexCliAdapter } from './codexCli.mjs';
import { CopilotCliAdapter } from './copilotCli.mjs';
import { registerCLIAdapter, cliAdapterRegistry } from './base.mjs';
import logger from '../../core/logger.mjs';

// 注册默认适配器
registerCLIAdapter('claude', ClaudeCliAdapter);
registerCLIAdapter('codex', CodexCliAdapter);
registerCLIAdapter('copilot', CopilotCliAdapter);

/**
 * CLI 适配器管理器
 */
class CLIAdapterManager {
  constructor() {
    /** @type {Map<string, {adapter: BaseCLIAdapter, config: object}>} */
    this.adapters = new Map();
    
    /** @type {Map<string, string>} sessionId -> adapterName */
    this.sessions = new Map();
  }

  /**
   * 获取或创建适配器
   * @param {string} name 
   * @param {object} config 
   */
  getAdapter(name, config = {}) {
    if (!this.adapters.has(name)) {
      const AdapterClass = cliAdapterRegistry.get(name);
      if (!AdapterClass) {
        throw new Error(`CLI adapter not found: ${name}`);
      }
      this.adapters.set(name, new AdapterClass(config));
    }
    return this.adapters.get(name).adapter;
  }

  /**
   * 获取适配器配置
   * @param {string} name 
   */
  getAdapterConfig(name) {
    const entry = this.adapters.get(name);
    return entry ? entry.config : {};
  }

  /**
   * 检查 CLI 可用性
   * @param {string} name 
   * @param {object} config 
   */
  async checkAvailability(name, config = {}) {
    const adapter = this.getAdapter(name, config);
    return await adapter.checkAvailable();
  }

  /**
   * 列出所有可用的 CLI
   * @param {object} configs 
   */
  async listAvailable(configs = {}) {
    const results = [];
    
    for (const [name] of cliAdapterRegistry) {
      const config = configs[name] || {};
      try {
        const status = await this.checkAvailability(name, config);
        results.push({ name, ...status });
      } catch (err) {
        results.push({ name, available: false, status: 'unknown', error: err.message });
      }
    }
    
    return results;
  }

  /**
   * 开始会话
   * @param {string} adapterName 
   * @param {object} options 
   * @param {object} config 
   */
  async startSession(adapterName, options = {}, config = {}) {
    const adapter = this.getAdapter(adapterName, config);
    const sessionId = await adapter.startSession(options);
    this.sessions.set(sessionId, adapterName);
    return sessionId;
  }

  /**
   * 结束会话
   * @param {string} sessionId 
   */
  async stopSession(sessionId) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) {
      return { ok: true, error: 'Session not found' };
    }

    const adapter = this.getAdapter(adapterName);
    await adapter.stopSession(sessionId);
    this.sessions.delete(sessionId);
    return { ok: true };
  }

  /**
   * 发送消息
   * @param {string} sessionId 
   * @param {string} content 
   * @param {object} options 
   */
  async *sendMessage(sessionId, content, options = {}) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) {
      yield JSON.stringify({ type: 'error', error: 'Session not found' });
      return;
    }

    const adapter = this.getAdapter(adapterName);
    yield* adapter.sendMessage(sessionId, content, options);
  }

  /**
   * 取消请求
   * @param {string} sessionId 
   */
  cancel(sessionId) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) return;

    const adapter = this.getAdapter(adapterName);
    adapter.cancel(sessionId);
    this.sessions.delete(sessionId);
  }

  /**
   * 获取会话信息
   * @param {string} sessionId 
   */
  getSessionInfo(sessionId) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) {
      return null;
    }
    return {
      sessionId,
      adapterName,
      isRunning: true,
    };
  }

  /**
   * 列出所有会话
   */
  listSessions() {
    const sessions = [];
    for (const [sessionId, adapterName] of this.sessions) {
      sessions.push({ sessionId, adapterName });
    }
    return sessions;
  }

  /**
   * 清理所有会话
   */
  dispose() {
    for (const [sessionId] of this.sessions) {
      this.cancel(sessionId);
    }
    
    for (const [name, { adapter }] of this.adapters) {
      try {
        adapter.dispose();
      } catch (err) {
        logger.warn(`Failed to dispose adapter ${name}: ${err.message}`);
      }
    }
    
    this.adapters.clear();
    this.sessions.clear();
  }
}

// 导出单例
export const cliAdapterManager = new CLIAdapterManager();
