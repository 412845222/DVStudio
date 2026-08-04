/**
 * CLI 适配器模块 IPC 处理器
 */

import { cliAdapterManager } from './manager.mjs'
import { cliAdapterRegistry } from './base.mjs'
import { invalidParamsError, internalError } from '../../core/errors.mjs'

/**
 * 检查 CLI 可用性
 */
export async function cliCheckAvailability(ctx, payload) {
	const p = payload || {}
	const name = String(p.name || 'all').trim()
	const config = p.config || {}

	if (name === 'all') {
		return await cliAdapterManager.listAvailable(config)
	}

	return await cliAdapterManager.checkAvailability(name, config)
}

/**
 * 列出所有已注册的适配器
 */
export async function cliListAdapters(ctx, payload) {
	const adapters = []
	for (const [name] of cliAdapterRegistry) {
		adapters.push({ name })
	}
	return { adapters }
}

/**
 * 开始 CLI 会话
 */
export async function cliStartSession(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()
	const options = p.options || {}
	const config = p.config || {}

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	try {
		const sessionId = await cliAdapterManager.startSession(adapterName, options, config)
		return { ok: true, sessionId, adapter: adapterName }
	} catch (err) {
		throw internalError(`Failed to start session: ${err.message}`)
	}
}

/**
 * 结束 CLI 会话
 */
export async function cliStopSession(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()

	if (!sessionId) {
		throw invalidParamsError('sessionId is required')
	}

	return await cliAdapterManager.stopSession(sessionId)
}

/**
 * 发送消息（流式）
 */
export async function cliSendMessage(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	const content = String(p.content || p.message || '').trim()
	const options = {
		model: p.model,
		...(p.options || {})
	}

	if (!sessionId) {
		throw invalidParamsError('sessionId is required')
	}
	if (!content) {
		throw invalidParamsError('content is required')
	}

	return cliAdapterManager.sendMessage(sessionId, content, options)
}

/**
 * 取消请求
 */
export async function cliCancel(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()

	if (!sessionId) {
		throw invalidParamsError('sessionId is required')
	}

	cliAdapterManager.cancel(sessionId)
	return { ok: true }
}

/**
 * 获取会话信息
 */
export async function cliGetSession(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()

	if (!sessionId) {
		throw invalidParamsError('sessionId is required')
	}

	const info = cliAdapterManager.getSessionInfo(sessionId)
	if (!info) {
		return { found: false, sessionId }
	}

	return { found: true, ...info }
}

/**
 * 列出所有会话
 */
export async function cliListSessions(ctx, payload) {
	return { sessions: cliAdapterManager.listSessions() }
}

/**
 * 执行完整环境检查
 */
export async function cliCheckEnvironment(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()
	const options = p.options || {}

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	try {
		return await cliAdapterManager.checkEnvironment(adapterName, options)
	} catch (err) {
		throw internalError(`Environment check failed: ${err.message}`)
	}
}

/**
 * 获取适配器模型列表
 */
export async function cliListModels(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()
	const forceRefresh = Boolean(p.forceRefresh)

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	try {
		const models = await cliAdapterManager.listModels(adapterName, { forceRefresh })
		return { adapter: adapterName, models }
	} catch (err) {
		throw internalError(`Failed to list models: ${err.message}`)
	}
}

/**
 * 获取适配器持久化配置
 */
export async function cliGetConfig(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	const config = await cliAdapterManager.getAdapterConfig(adapterName)
	return { adapter: adapterName, config }
}

/**
 * 保存适配器配置
 */
export async function cliSaveConfig(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()
	const config = JSON.parse(JSON.stringify(p.config || {}))

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	try {
		const saved = await cliAdapterManager.saveAdapterConfig(adapterName, config)
		return { ok: true, adapter: adapterName, config: JSON.parse(JSON.stringify(saved)) }
	} catch (err) {
		throw internalError(`Failed to save config: ${err.message}`)
	}
}

/**
 * 重置适配器配置（清除缓存和登录状态）
 */
export async function cliResetConfig(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	try {
		const result = await cliAdapterManager.resetAdapterConfig(adapterName)
		return { ok: true, adapter: adapterName, ...result }
	} catch (err) {
		throw internalError(`Failed to reset config: ${err.message}`)
	}
}

/**
 * 执行环境检查修复操作
 */
export async function cliRunFix(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()
	const checkKey = String(p.checkKey || '').trim()

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}
	if (!checkKey) {
		throw invalidParamsError('checkKey is required')
	}

	const adapter = cliAdapterManager.getAdapter(adapterName)
	if (!adapter) {
		throw invalidParamsError(`Adapter not found: ${adapterName}`)
	}

	if (typeof adapter.runFixAction !== 'function') {
		throw internalError(`Adapter "${adapterName}" does not support fix actions`)
	}

	try {
		const result = await adapter.runFixAction(checkKey)
		return { ok: true, adapter: adapterName, checkKey, ...result }
	} catch (err) {
		throw internalError(`Fix action failed: ${err.message}`)
	}
}

/**
 * 启动认证流程（流式）
 */
export async function cliStartAuth(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	return cliAdapterManager.startAuthFlow(adapterName)
}

/**
 * 取消认证流程
 */
export async function cliCancelAuth(ctx, payload) {
	const p = payload || {}
	const adapterName = String(p.adapter || '').trim()

	if (!adapterName) {
		throw invalidParamsError('adapter is required')
	}

	cliAdapterManager.cancelAuth(adapterName)
	return { ok: true }
}
