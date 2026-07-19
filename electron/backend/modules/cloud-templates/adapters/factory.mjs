import { createSteamCloudAdapter } from './steam.mjs'
import { createLocalCloudAdapter } from './local.mjs'
import { CloudAdapter } from './base.mjs'

const ADAPTER_MAP = {
	steam: createSteamCloudAdapter,
	local: createLocalCloudAdapter,
	mock: createLocalCloudAdapter,
}

/**
 * 根据平台ID创建对应的云存储适配器
 * @param {string} platformId - 平台标识
 * @param {Object} options - 适配器选项
 * @returns {CloudAdapter}
 */
export function createCloudAdapter(platformId, options = {}) {
	const creator = ADAPTER_MAP[platformId]
	if (creator) {
		const adapter = creator(options)
		if (adapter.isAvailable()) {
			return adapter
		}
	}
	return createLocalCloudAdapter(options)
}

/**
 * 获取当前活跃平台的云存储适配器
 * @param {Object} platformManager - 平台管理器
 * @param {Object} options - 适配器选项
 * @returns {CloudAdapter}
 */
export function getActiveCloudAdapter(platformManager, options = {}) {
	const activeProvider = platformManager.getActiveProvider()
	const platformId = activeProvider?.id || 'local'
	return createCloudAdapter(platformId, { ...options, provider: activeProvider })
}
