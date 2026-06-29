/**
 * CLI 适配器模块 IPC 处理器
 */

import { cliAdapterManager } from './manager.mjs';
import { cliAdapterRegistry } from './base.mjs';
import { invalidParamsError, internalError } from '../../core/errors.mjs';

/**
 * 检查 CLI 可用性
 */
export async function cliCheckAvailability(ctx, payload) {
  const p = payload || {};
  const name = String(p.name || 'all').trim();
  const config = p.config || {};

  if (name === 'all') {
    return await cliAdapterManager.listAvailable(config);
  }

  return await cliAdapterManager.checkAvailability(name, config);
}

/**
 * 列出所有已注册的适配器
 */
export async function cliListAdapters(ctx, payload) {
  const adapters = [];
  for (const [name] of cliAdapterRegistry) {
    adapters.push({ name });
  }
  return { adapters };
}

/**
 * 开始 CLI 会话
 */
export async function cliStartSession(ctx, payload) {
  const p = payload || {};
  const adapterName = String(p.adapter || '').trim();
  const options = p.options || {};
  const config = p.config || {};

  if (!adapterName) {
    throw invalidParamsError('adapter is required');
  }

  try {
    const sessionId = await cliAdapterManager.startSession(adapterName, options, config);
    return { ok: true, sessionId, adapter: adapterName };
  } catch (err) {
    throw internalError(`Failed to start session: ${err.message}`);
  }
}

/**
 * 结束 CLI 会话
 */
export async function cliStopSession(ctx, payload) {
  const p = payload || {};
  const sessionId = String(p.sessionId || '').trim();

  if (!sessionId) {
    throw invalidParamsError('sessionId is required');
  }

  return await cliAdapterManager.stopSession(sessionId);
}

/**
 * 发送消息（流式）
 */
export async function cliSendMessage(ctx, payload) {
  const p = payload || {};
  const sessionId = String(p.sessionId || '').trim();
  const content = String(p.content || '').trim();
  const options = p.options || {};

  if (!sessionId) {
    throw invalidParamsError('sessionId is required');
  }
  if (!content) {
    throw invalidParamsError('content is required');
  }

  return cliAdapterManager.sendMessage(sessionId, content, options);
}

/**
 * 取消请求
 */
export async function cliCancel(ctx, payload) {
  const p = payload || {};
  const sessionId = String(p.sessionId || '').trim();

  if (!sessionId) {
    throw invalidParamsError('sessionId is required');
  }

  cliAdapterManager.cancel(sessionId);
  return { ok: true };
}

/**
 * 获取会话信息
 */
export async function cliGetSession(ctx, payload) {
  const p = payload || {};
  const sessionId = String(p.sessionId || '').trim();

  if (!sessionId) {
    throw invalidParamsError('sessionId is required');
  }

  const info = cliAdapterManager.getSessionInfo(sessionId);
  if (!info) {
    return { found: false, sessionId };
  }

  return { found: true, ...info };
}

/**
 * 列出所有会话
 */
export async function cliListSessions(ctx, payload) {
  return { sessions: cliAdapterManager.listSessions() };
}
