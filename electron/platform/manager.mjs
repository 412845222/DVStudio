import { webContents } from 'electron'
import { createMockProvider } from './providers/mock.mjs'
import { createSteamProvider } from './providers/steam.mjs'
import { getSteamConfig } from './config.mjs'
import { platformEvents } from './events.mjs'

const PLATFORM_PRIORITY = ['steam', 'epic', 'wegame', 'mock']

class PlatformManager {
	constructor() {
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
		const mock = createMockProvider()
		this.registerProvider(mock)

		const steamConfig = getSteamConfig()
		const steam = createSteamProvider(steamConfig)
		if (steam) this.registerProvider(steam)
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
		const results = []
		for (const provider of this._providers.values()) {
			try {
				const result = await provider.init()
				results.push({ id: provider.id, ...result })
				if (!result.ok) {
					console.warn(`[platform:${provider.id}] init failed:`, result.errMsg)
				}
			} catch (err) {
				results.push({ id: provider.id, ok: false, errMsg: err.message })
			}
		}
		this._selectActive()
		this._broadcastStatus()
		return results
	}

	_selectActive() {
		for (const id of PLATFORM_PRIORITY) {
			const p = this._providers.get(id)
			if (p && p.isInitialized() && p.isLoggedIn()) {
				this._activeId = id
				return
			}
		}
		this._activeId = 'mock'
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
				initialized: p.isInitialized(),
			})
		}
		let installedDlcs = []
		try { installedDlcs = active?.getInstalledDlcs?.() || [] } catch {}
		let avatarUrl = null
		try { avatarUrl = active?.getUserAvatarUrl?.() || null } catch {}
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
			allPlatforms,
		}
	}

	getCurrentUser() {
		const active = this.getActiveProvider()
		const user = active?.getUserInfo() || null
		if (user) {
			try { user.avatarUrl = active?.getUserAvatarUrl?.() || null } catch {}
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
				try { p.runCallbacks() } catch {}
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
			try { p.shutdown() } catch {}
		}
	}
}

let _manager = null

export function getManager() {
	if (!_manager) _manager = new PlatformManager()
	return _manager
}
