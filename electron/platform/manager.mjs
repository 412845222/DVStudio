import { EventEmitter } from 'node:events'
import { webContents } from 'electron'
import { createMockProvider } from './providers/mock.mjs'
import { createSteamProvider } from './providers/steam.mjs'
import { getSteamConfig } from './config.mjs'
import { platformEvents } from './events.mjs'

const PLATFORM_PRIORITY = ['steam', 'epic', 'wegame', 'mock']

class PlatformManager extends EventEmitter {
	constructor() {
		super()
		this._providers = new Map()
		this._activeId = 'mock'
		this._callbackTimer = null
		this._mainWindow = null
		this._lastStatus = null
	}

	setMainWindow(window) {
		this._mainWindow = window
	}

	registerProvider(provider) {
		this._providers.set(provider.id, provider)
		provider.on?.('disconnected', (data) => {
			platformEvents.emit('disconnected', data)
			this._handleProviderDisconnected(provider.id)
		})
		provider.on?.('connected', (data) => {
			platformEvents.emit('connected', data)
			this._handleProviderConnected(provider.id)
		})
		provider.on?.('user-changed', (data) => {
			platformEvents.emit('user-changed', data)
			this._broadcastStatus()
		})
		provider.on?.('overlay-activated', (data) => {
			platformEvents.emit('overlay-activated', data)
			this._broadcastStatus()
			if (this._mainWindow && !this._mainWindow.isDestroyed()) {
				this._mainWindow.setIgnoreMouseEvents(false)
			}
		})
		provider.on?.('overlay-deactivated', (data) => {
			platformEvents.emit('overlay-deactivated', data)
			this._broadcastStatus()
		})
	}

	_handleProviderDisconnected(providerId) {
		console.log(`[platform] provider ${providerId} disconnected, reselecting active platform...`)
		const oldActive = this._activeId
		this._selectActive()
		if (oldActive !== this._activeId) {
			console.log(`[platform] active platform changed: ${oldActive} -> ${this._activeId}`)
		}
		this._broadcastStatus()
	}

	_handleProviderConnected(providerId) {
		console.log(`[platform] provider ${providerId} connected, reselecting active platform...`)
		const oldActive = this._activeId
		this._selectActive()
		if (oldActive !== this._activeId) {
			console.log(`[platform] active platform changed: ${oldActive} -> ${this._activeId}`)
		}
		this._broadcastStatus()
	}

	_broadcastStatus() {
		const status = this.getStatus()
		const statusJson = JSON.stringify(status)
		if (this._lastStatus === statusJson) return
		this._lastStatus = statusJson

		try {
			this.emit('status-changed', status)
		} catch (err) {
			console.warn('[platform] emit status-changed error:', err.message)
		}

		try {
			const allContents = webContents.getAllWebContents()
			for (const contents of allContents) {
				if (!contents.isDestroyed()) {
					contents.send('platform:event', { event: 'status-changed', data: status })
				}
			}
		} catch (err) {
			console.warn('[platform] broadcastStatus error:', err.message)
		}
	}

	discover() {
		console.log('[platform] === discover: registering platforms ===')
		const mock = createMockProvider()
		this.registerProvider(mock)
		console.log('[platform] Mock provider registered')

		const steamConfig = getSteamConfig()
		console.log('[platform] Steam config obtained:', JSON.stringify(steamConfig))
		const steam = createSteamProvider(steamConfig)
		if (steam) {
			this.registerProvider(steam)
			console.log('[platform] Steam provider registered successfully')
		} else {
			console.warn('[platform] Steam provider creation returned null - Steam will not be available')
		}
		console.log(
			'[platform] === discover: registered providers:',
			Array.from(this._providers.keys())
		)
	}

	preflightAll() {
		for (const provider of this._providers.values()) {
			try {
				const result = provider.preflightCheck()
				if (result === 'restart') {
					return 'restart'
				}
			} catch (err) {
				console.warn(`[platform:${provider.id}] preflight error:`, err.message)
			}
		}
		return null
	}

	async initializeAll() {
		console.log('[platform] === initializeAll: initializing all providers ===')
		const results = []
		for (const provider of this._providers.values()) {
			console.log(`[platform] Initializing provider: ${provider.id}`)
			try {
				const result = await provider.init()
				results.push({ id: provider.id, ...result })
				if (result.ok) {
					console.log(`[platform:${provider.id}] init succeeded`)
				} else {
					console.warn(`[platform:${provider.id}] init failed:`, result.errMsg)
				}
			} catch (err) {
				console.error(`[platform:${provider.id}] init exception:`, err.message)
				console.error(`[platform:${provider.id}] init exception stack:`, err.stack)
				results.push({ id: provider.id, ok: false, errMsg: err.message })
			}
		}
		console.log('[platform] All providers initialized, selecting active platform...')
		this._selectActive()
		console.log('[platform] Active platform after init:', this._activeId)
		this._broadcastStatus()
		return results
	}

	_selectActive() {
		let availableNonMock = null

		for (const id of PLATFORM_PRIORITY) {
			const p = this._providers.get(id)
			if (!p) continue

			const isAvail = p.isAvailable()
			const isInit = p.isInitialized()
			const isLogged = p.isLoggedIn()

			console.log(
				`[platform] Checking ${id}: available=${isAvail}, initialized=${isInit}, loggedIn=${isLogged}`
			)

			if (id !== 'mock' && isAvail) {
				availableNonMock = p
				if (isInit && isLogged) {
					this._activeId = id
					console.log(`[platform] Selected active platform: ${id} (initialized and logged in)`)
					return
				}
			} else if (id === 'mock' && isAvail && isInit && isLogged) {
				console.log(`[platform] Mock is available and logged in`)
			}
		}

		if (availableNonMock) {
			this._activeId = availableNonMock.id
			console.log(
				`[platform] Selected active platform: ${availableNonMock.id} (available, waiting for login)`
			)
			return
		}

		this._activeId = 'mock'
		console.log(`[platform] Selected active platform: mock (no real platform available)`)
	}

	getActiveProvider() {
		return this._providers.get(this._activeId) || this._providers.get('mock')
	}

	getStatus() {
		const active = this.getActiveProvider()
		const allPlatforms = []
		for (const p of this._providers.values()) {
			allPlatforms.push({
				id: p.id,
				displayName: p.displayName,
				available: p.isAvailable(),
				initialized: p.isInitialized()
			})
		}
		let installedDlcs = []
		try {
			installedDlcs = active?.getInstalledDlcs?.() || []
		} catch {}
		let avatarUrl = null
		try {
			avatarUrl = active?.getUserAvatarUrl?.() || null
		} catch {}
		const user = active?.getUserInfo() || null
		if (user && avatarUrl) {
			user.avatarUrl = avatarUrl
		}
		return {
			activePlatform: active?.id || 'mock',
			activeDisplayName: active?.displayName || 'Mock',
			available: active?.id !== 'mock',
			initialized: active?.isInitialized() || false,
			loggedIn: active?.isLoggedIn() || false,
			user,
			overlayEnabled: active?.isOverlayEnabled?.() || false,
			overlayActive: active?.isOverlayActive?.() || false,
			installedDlcs,
			allPlatforms
		}
	}

	getCurrentUser() {
		const active = this.getActiveProvider()
		const user = active?.getUserInfo() || null
		if (user) {
			try {
				user.avatarUrl = active?.getUserAvatarUrl?.() || null
			} catch {}
		}
		return user
	}

	overlayOpenUrl(url) {
		const active = this.getActiveProvider()
		try {
			return active?.overlayOpenUrl?.(url) || { ok: false, errMsg: 'Not supported' }
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	overlayActivateGameOverlay(dialog) {
		const active = this.getActiveProvider()
		try {
			return active?.overlayActivateGameOverlay?.(dialog) || { ok: false, errMsg: 'Not supported' }
		} catch (err) {
			return { ok: false, errMsg: err.message }
		}
	}

	isDlcInstalled(dlcAppId) {
		const active = this.getActiveProvider()
		try {
			return active?.isDlcInstalled?.(dlcAppId) || false
		} catch {
			return false
		}
	}

	getInstalledDlcs() {
		const active = this.getActiveProvider()
		try {
			return active?.getInstalledDlcs?.() || []
		} catch {
			return []
		}
	}

	startCallbackPump(intervalMs = Math.floor(1000 / 15)) {
		this.stopCallbackPump()
		this._callbackTimer = setInterval(() => {
			for (const p of this._providers.values()) {
				try {
					p.runCallbacks()
				} catch {}
			}
		}, intervalMs)
		if (this._callbackTimer.unref) this._callbackTimer.unref()
	}

	stopCallbackPump() {
		if (this._callbackTimer) {
			clearInterval(this._callbackTimer)
			this._callbackTimer = null
		}
	}

	shutdownAll() {
		this.stopCallbackPump()
		for (const p of this._providers.values()) {
			try {
				p.shutdown()
			} catch {}
		}
	}
}

let _manager = null

export function getManager() {
	if (!_manager) _manager = new PlatformManager()
	return _manager
}
