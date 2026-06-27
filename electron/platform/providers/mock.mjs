import { EventEmitter } from 'node:events'

class MockPlatformProvider extends EventEmitter {
	constructor() {
		super()
		this._initialized = false
		this._overlayActive = false
		this._user = {
			platformId: 'mock-0',
			displayName: 'Developer',
			avatarUrl: null,
		}
		this._dlcs = [
			{ appId: 481, name: 'Mock DLC 1', installed: true },
			{ appId: 482, name: 'Mock DLC 2', installed: false },
		]
	}

	get id() { return 'mock' }
	get displayName() { return 'Mock' }

	preflightCheck() { return false }

	async init() {
		this._initialized = true
		return { ok: true }
	}

	shutdown() {
		this._initialized = false
		this._overlayActive = false
	}

	runCallbacks() {}

	isAvailable() { return true }
	isInitialized() { return this._initialized }
	isLoggedIn() { return true }
	isOwned() { return true }
	getUserInfo() { return { ...this._user } }

	getUserAvatarUrl() {
		return null
	}

	isOverlayEnabled() {
		return false
	}

	isOverlayActive() {
		return this._overlayActive
	}

	overlayOpenUrl(url) {
		console.log(`[platform:mock] overlayOpenUrl called with: ${url}`)
		return { ok: true }
	}

	overlayActivateGameOverlay(dialog) {
		console.log(`[platform:mock] overlayActivateGameOverlay called with dialog: ${dialog || 'default'}`)
		this._overlayActive = true
		this.emit('overlay-activated', { platformId: 'mock' })
		setTimeout(() => {
			this._overlayActive = false
			this.emit('overlay-deactivated', { platformId: 'mock' })
		}, 100)
		return { ok: true }
	}

	isDlcInstalled(dlcAppId) {
		const dlc = this._dlcs.find(d => d.appId === dlcAppId)
		return dlc?.installed || false
	}

	getInstalledDlcs() {
		return this._dlcs.filter(d => d.installed).map(d => ({ ...d }))
	}
}

export function createMockProvider() {
	return new MockPlatformProvider()
}
