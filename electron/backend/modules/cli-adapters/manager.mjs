/**
 * CLI 适配器管理器
 * 
 * 管理多个 CLI 适配器，提供统一的接口。
 */

import { CodexCliAdapter } from './codexCli.mjs';
import { CopilotCliAdapter } from './copilotCli.mjs';
import { registerCLIAdapter, cliAdapterRegistry } from './base.mjs';
import { cliConfigStore } from './cliConfigStore.mjs';
import logger from '../../core/logger.mjs';

registerCLIAdapter('codex', CodexCliAdapter);
registerCLIAdapter('copilot', CopilotCliAdapter);

class CLIAdapterManager {
  constructor() {
    this.adapters = new Map();
    this.sessions = new Map();
  }

  getAdapter(name, config = {}) {
    if (!this.adapters.has(name)) {
      const AdapterClass = cliAdapterRegistry.get(name);
      if (!AdapterClass) {
        throw new Error(`CLI adapter not found: ${name}`);
      }
      const mergedConfig = { ...this.getStoredConfig(name), ...config };
      this.adapters.set(name, { adapter: new AdapterClass(mergedConfig), config: mergedConfig });
    }
    return this.adapters.get(name).adapter;
  }

  getStoredConfig(name) {
    try {
      const stored = cliConfigStore.getAdapterConfig(name);
      if (stored) {
        return {
          enabled: stored.enabled,
          models: stored.models
        };
      }
    } catch (err) {
      logger.debug(`Failed to get stored config for ${name}: ${err.message}`);
    }
    return {};
  }

  getAdapterRuntimeConfig(name) {
    const entry = this.adapters.get(name);
    return entry ? entry.config : {};
  }

  async checkAvailability(name, config = {}) {
    const adapter = this.getAdapter(name, config);
    return await adapter.checkAvailable();
  }

  async checkEnvironment(adapterName, options = {}) {
    const adapter = this.getAdapter(adapterName);
    if (typeof adapter.checkEnvironment !== 'function') {
      throw new Error(`Adapter ${adapterName} does not support environment check`);
    }

    const result = await adapter.checkEnvironment(options);

    if (result.allPassed) {
      await cliConfigStore.updateAdapterConfig(adapterName, {
        lastCheckedAt: result.checkedAt,
        version: result.version,
        models: result.models
      });
    }

    return result;
  }

  async listModels(adapterName, options = {}) {
    const { forceRefresh = false } = options;

    if (!forceRefresh) {
      const config = await cliConfigStore.getAdapterConfig(adapterName);
      if (config?.models && config.lastCheckedAt) {
        const cacheAge = Date.now() - new Date(config.lastCheckedAt).getTime();
        if (cacheAge < 60 * 60 * 1000) {
          return config.models;
        }
      }
    }

    const adapter = this.getAdapter(adapterName);
    if (typeof adapter.listModels !== 'function') {
      throw new Error(`Adapter ${adapterName} does not support listModels`);
    }

    const models = await adapter.listModels();

    await cliConfigStore.updateAdapterConfig(adapterName, { models });

    return models;
  }

  async getAdapterConfig(adapterName) {
    return await cliConfigStore.getAdapterConfig(adapterName);
  }

  async saveAdapterConfig(adapterName, config) {
    return await cliConfigStore.updateAdapterConfig(adapterName, {
      ...config,
      configuredAt: new Date().toISOString()
    });
  }

  async resetAdapterConfig(adapterName) {
    const adapter = this.adapters.get(adapterName);
    if (adapter?.adapter?.dispose) {
      try {
        for (const [sessionId, name] of this.sessions) {
          if (name === adapterName) {
            adapter.adapter.cancel(sessionId);
            this.sessions.delete(sessionId);
          }
        }
      } catch (err) {
        logger.warn(`Failed to clean up sessions for ${adapterName}: ${err.message}`);
      }
    }
    this.adapters.delete(adapterName);
    cliConfigStore.resetAdapterConfig(adapterName);
    return { ok: true };
  }

  isAdapterEnabled(adapterName) {
    return cliConfigStore.isAdapterEnabled(adapterName);
  }

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

  async startSession(adapterName, options = {}, config = {}) {
    const adapter = this.getAdapter(adapterName, config);
    const sessionId = await adapter.startSession(options);
    this.sessions.set(sessionId, adapterName);
    return sessionId;
  }

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

  async *sendMessage(sessionId, content, options = {}) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) {
      yield { type: 'error', error: 'Session not found' };
      return;
    }

    const adapter = this.getAdapter(adapterName);
    yield* adapter.sendMessage(sessionId, content, options);
  }

  cancel(sessionId) {
    const adapterName = this.sessions.get(sessionId);
    if (!adapterName) return;

    const adapter = this.getAdapter(adapterName);
    adapter.cancel(sessionId);
    this.sessions.delete(sessionId);
  }

  async *startAuthFlow(adapterName) {
    const adapter = this.getAdapter(adapterName);
    if (typeof adapter.startAuthFlow !== 'function') {
      yield { type: 'error', message: `Adapter ${adapterName} does not support auth flow` };
      return;
    }
    yield* adapter.startAuthFlow();
  }

  cancelAuth(adapterName) {
    const adapter = this.getAdapter(adapterName);
    if (typeof adapter.cancelAuth === 'function') {
      adapter.cancelAuth();
    }
  }

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

  listSessions() {
    const sessions = [];
    for (const [sessionId, adapterName] of this.sessions) {
      sessions.push({ sessionId, adapterName });
    }
    return sessions;
  }

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

export const cliAdapterManager = new CLIAdapterManager();
