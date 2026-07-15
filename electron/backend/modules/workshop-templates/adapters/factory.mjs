import { createSteamUgcAdapter } from './steam.mjs'
import { createMockUgcAdapter } from './mock.mjs'

const ADAPTER_MAP = {
	steam: createSteamUgcAdapter,
	mock: createMockUgcAdapter,
}

export function createUgcAdapter(platformId, options = {}) {
	const creator = ADAPTER_MAP[platformId]
	if (creator) {
		const adapter = creator(options)
		if (adapter.isAvailable()) {
			return adapter
		}
	}
	return createMockUgcAdapter(options)
}

export function getActiveUgcAdapter(platformManager, options = {}) {
	const activeProvider = platformManager.getActiveProvider()
	
	let targetProvider = activeProvider
	let platformId = activeProvider?.id || 'mock'
	
	if (activeProvider?.id === 'mock') {
		const steamProvider = platformManager._providers?.get('steam')
		if (steamProvider && steamProvider.isAvailable()) {
			targetProvider = steamProvider
			platformId = 'steam'
		}
	}
	
	const adapter = createUgcAdapter(platformId, { ...options, provider: targetProvider })
	
	if (adapter.isAvailable()) {
		return adapter
	}
	
	console.log('[workshop-templates] Platform', platformId, 'does not support UGC, falling back to Mock')
	return createMockUgcAdapter(options)
}