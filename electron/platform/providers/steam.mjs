import { EventEmitter } from 'node:events'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'module'
import { app } from 'electron'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getNativeWin32Dir() {
    const devPath = path.resolve(__dirname, '..', 'native', 'win32')
    if (!app.isPackaged) {
        return devPath
    }
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'platform', 'native', 'win32')
    if (fs.existsSync(unpackedPath)) {
        return unpackedPath
    }
    console.warn('[platform:steam] Native module directory not found at asarUnpacked path:', unpackedPath)
    console.warn('[platform:steam] Falling back to:', devPath)
    return devPath
}

const nativeWin32Dir = getNativeWin32Dir()

function ensureDllPath() {
    const dllPath = path.join(nativeWin32Dir, 'steam_api64.dll')
    if (fs.existsSync(dllPath)) {
        const currentPath = process.env.PATH || ''
        if (!currentPath.includes(nativeWin32Dir)) {
            process.env.PATH = nativeWin32Dir + path.delimiter + currentPath
        }
        console.log('[platform:steam] DLL directory added to PATH:', nativeWin32Dir)
        return true
    }
    return false
}

ensureDllPath()

function ensureSteamAppIdTxt(appId) {
    if (process.env.SteamAppId && process.env.SteamGameId) {
        return
    }
    if (!appId) return
    try {
        const cwdPath = path.join(process.cwd(), 'steam_appid.txt')
        if (!fs.existsSync(cwdPath)) {
            fs.writeFileSync(cwdPath, String(appId), 'utf8')
            console.log('[platform:steam] Created steam_appid.txt in cwd for dev mode:', process.cwd())
        }
    } catch {
    }
}

function loadDirectNative() {
    const nodePath = path.join(nativeWin32Dir, 'dweb_steamjs.node')
    if (!fs.existsSync(nodePath)) {
        console.log('[platform:steam] Direct native module not found at:', nodePath)
        return null
    }

    try {
        ensureDllPath()
        const native = require(nodePath)
        console.log('[platform:steam] Loaded native module directly from:', nodePath)
        return wrapNativeModule(native)
    } catch (err) {
        console.error('[platform:steam] Failed to load direct native module:', err.message)
        return null
    }
}

function loadDwebSteamJs() {
    try {
        const module = require('dweb-steamjs')
        if (module && typeof module.createClient === 'function') {
            console.log('[platform:steam] Loaded dweb-steamjs via npm/link')
            return module
        }
        console.warn('[platform:steam] dweb-steamjs loaded but createClient is not a function')
        return null
    } catch (err) {
        console.log('[platform:steam] dweb-steamjs not available:', err.code || err.message)
        return null
    }
}

function rgbaToBmpDataUrl(rgbaBuffer, width, height) {
    if (!rgbaBuffer || width <= 0 || height <= 0) return null

    const rowSize = Math.floor((24 * width + 31) / 32) * 4
    const pixelDataSize = rowSize * height
    const fileSize = 54 + pixelDataSize

    const buffer = Buffer.alloc(fileSize)

    buffer.write('BM', 0, 'ascii')
    buffer.writeUInt32LE(fileSize, 2)
    buffer.writeUInt32LE(0, 6)
    buffer.writeUInt32LE(54, 10)

    buffer.writeUInt32LE(40, 14)
    buffer.writeInt32LE(width, 18)
    buffer.writeInt32LE(height, 22)
    buffer.writeUInt16LE(1, 26)
    buffer.writeUInt16LE(24, 28)
    buffer.writeUInt32LE(0, 30)
    buffer.writeUInt32LE(pixelDataSize, 34)
    buffer.writeInt32LE(2835, 38)
    buffer.writeInt32LE(2835, 42)
    buffer.writeUInt32LE(0, 46)
    buffer.writeUInt32LE(0, 50)

    for (let y = 0; y < height; y++) {
        const srcY = height - 1 - y
        for (let x = 0; x < width; x++) {
            const srcIdx = (srcY * width + x) * 4
            const dstIdx = 54 + y * rowSize + x * 3
            buffer[dstIdx] = rgbaBuffer[srcIdx + 2]
            buffer[dstIdx + 1] = rgbaBuffer[srcIdx + 1]
            buffer[dstIdx + 2] = rgbaBuffer[srcIdx]
        }
    }

    return 'data:image/bmp;base64,' + buffer.toString('base64')
}

function wrapNativeModule(native) {
    return {
        isAvailable: function () { return native !== null },
        createClient: function (options) {
            const opts = options || {}
            const appId = opts.appId || 2475710
            const nativeClient = new native.SteamClient({ appId })

            const emitter = new EventEmitter()
            let wasLoggedOn = false
            let cachedAvatarUrl = null

            const client = {
                on: (event, handler) => emitter.on(event, handler),
                emit: (event, ...args) => emitter.emit(event, ...args),
                removeAllListeners: (event) => emitter.removeAllListeners(event),
            }

            client.init = function (id) {
                try {
                    const result = nativeClient.init(id || appId)
                    return result
                } catch (err) {
                    return { ok: false, errMsg: err.message }
                }
            }

            client.shutdown = function () {
                try {
                    emitter.removeAllListeners()
                    cachedAvatarUrl = null
                    nativeClient.shutdown()
                } catch {}
            }

            client.runCallbacks = function () {
                try {
                    nativeClient.runCallbacks()
                    const isLogged = nativeClient.isLoggedOn()
                    if (wasLoggedOn && !isLogged) {
                        emitter.emit('disconnected', { reason: 'logged-off' })
                    }
                    wasLoggedOn = isLogged
                } catch {}
            }

            client.isSteamRunning = () => { try { return nativeClient.isSteamRunning() } catch { return false } }
            client.restartAppIfNecessary = (id) => { try { return nativeClient.restartAppIfNecessary(id || appId) } catch { return false } }
            client.isLoggedOn = () => { try { return nativeClient.isLoggedOn() } catch { return false } }
            client.getSteamId = () => { try { return nativeClient.getSteamId() } catch { return 0 } }
            client.getPersonaName = () => { try { return nativeClient.getPersonaName() } catch { return '' } }
            client.isOverlayEnabled = () => { try { return nativeClient.isOverlayEnabled() } catch { return false } }
            client.isOverlayActive = () => { try { return nativeClient.isOverlayActive() } catch { return false } }
            client.activateGameOverlay = (dialog) => { try { return nativeClient.activateGameOverlay(dialog || 'Friends') } catch (err) { return { ok: false, errMsg: err.message } } }
            client.activateGameOverlayToWebPage = (url, mode) => { try { return nativeClient.activateGameOverlayToWebPage(url, mode) } catch (err) { return { ok: false, errMsg: err.message } } }
            client.getSmallFriendAvatar = (steamId) => { try { return nativeClient.getSmallFriendAvatar(steamId) } catch { return 0 } }
            client.getMediumFriendAvatar = (steamId) => { try { return nativeClient.getMediumFriendAvatar(steamId) } catch { return 0 } }
            client.getLargeFriendAvatar = (steamId) => { try { return nativeClient.getLargeFriendAvatar(steamId) } catch { return 0 } }
            client.getImageSize = (handle) => { try { return nativeClient.getImageSize(handle) } catch { return null } }
            client.getImageRGBA = (handle) => { try { return nativeClient.getImageRGBA(handle) } catch { return null } }
            client.getDLCCount = () => { try { return nativeClient.getDLCCount() } catch { return 0 } }
            client.isDlcInstalled = (dlcAppId) => { try { return nativeClient.isDlcInstalled(dlcAppId) } catch { return false } }
            client.getDlcData = (index) => { try { return nativeClient.getDlcData(index) } catch { return null } }

            client.getInstalledDlcs = function () {
                try {
                    const count = nativeClient.getDLCCount()
                    const dlcs = []
                    for (let i = 0; i < count; i++) {
                        const data = nativeClient.getDlcData(i)
                        if (data && data.ok && data.available) {
                            dlcs.push({ appId: data.appId, name: data.name })
                        }
                    }
                    return dlcs
                } catch { return [] }
            }

            client.getPersonaAvatarUrl = function () {
                if (cachedAvatarUrl !== null) return cachedAvatarUrl

                try {
                    const steamId = nativeClient.getSteamId()
                    if (!steamId) return null

                    const imageHandle = nativeClient.getMediumFriendAvatar(steamId)
                    if (imageHandle === 0 || imageHandle === -1) return null

                    const sizeResult = nativeClient.getImageSize(imageHandle)
                    if (!sizeResult || !sizeResult.ok) return null

                    const { width, height } = sizeResult
                    if (width <= 0 || height <= 0) return null

                    const rgbaResult = nativeClient.getImageRGBA(imageHandle)
                    if (!rgbaResult || !rgbaResult.ok || !rgbaResult.data) return null

                    cachedAvatarUrl = rgbaToBmpDataUrl(rgbaResult.data, width, height)
                    return cachedAvatarUrl
                } catch (err) {
                    console.warn('[platform:steam] getPersonaAvatarUrl error:', err.message)
                    return null
                }
            }

            client.isSubscribedApp = function (id) {
                try { return nativeClient.isDlcInstalled(id) } catch { return false }
            }

            return client
        }
    }
}

function loadSteamModule() {
    console.log('[platform:steam] Loading Steam module...')
    console.log('[platform:steam] Native dir:', nativeWin32Dir)
    console.log('[platform:steam] Working directory:', process.cwd())

    ensureDllPath()

    let module = loadDirectNative()
    if (module) return module

    module = loadDwebSteamJs()
    if (module) return module

    console.log('[platform:steam] No Steam module available, will use Mock')
    return null
}

class SteamPlatformProvider extends EventEmitter {
    constructor(steamModule, config) {
        super()
        this._steam = steamModule
        this._config = config
        this._client = null
        this._initialized = false
        this._wasLoggedIn = false
        this._wasOverlayActive = false
        this._overlayActive = false
        this._wasSteamRunning = false
        this._initRetries = 0
        this._isDev = !!process.env.ELECTRON_DEV
    }

    get id() { return 'steam' }
    get displayName() { return 'Steam' }

    preflightCheck() {
        try {
            ensureSteamAppIdTxt(this._config.appId)

            if (!this._client) {
                this._client = this._steam.createClient({ appId: this._config.appId })
            }
            if (!this._client) {
                console.warn('[platform:steam] failed to create client in preflight')
                return false
            }
            const isRunning = this._client.isSteamRunning()
            if (!isRunning) {
                return false
            }

            const isDev = !!process.env.ELECTRON_DEV
            if (!isDev) {
                const shouldRestart = this._client.restartAppIfNecessary(this._config.appId)
                if (shouldRestart) {
                    console.log('[platform:steam] RestartAppIfNecessary returned true - app should be launched through Steam')
                    return 'restart'
                }
            } else {
                console.log('[platform:steam] Dev mode detected, skipping RestartAppIfNecessary check')
            }
            return true
        } catch (err) {
            console.warn('[platform:steam] preflightCheck error:', err.message)
            return false
        }
    }

    async init() {
        try {
            if (this._initialized) {
                return { ok: true }
            }
            if (!this._client) {
                this._client = this._steam.createClient({ appId: this._config.appId })
            }
            if (!this._client) {
                return { ok: false, errMsg: 'Failed to create Steam client' }
            }

            console.log('[platform:steam] Initializing Steam with AppID:', this._config.appId)

            if (typeof this._client.on === 'function') {
                this._client.on('disconnected', (data) => {
                    console.log('[platform:steam] disconnected event received')
                    this._wasLoggedIn = false
                    this.emit('disconnected', { platformId: 'steam', reason: data?.reason || 'Steam disconnected' })
                })
            }

            if (typeof this._client.init !== 'function') {
                return { ok: false, errMsg: 'Steam client init method not available' }
            }

            const isSteamRunning = this._client.isSteamRunning()
            console.log('[platform:steam] Steam client running:', isSteamRunning)

            const result = this._client.init(this._config.appId)
            if (result.ok) {
                this._initialized = true
                this._wasLoggedIn = this.isLoggedIn()
                this._wasOverlayActive = false
                this._overlayActive = false
                const userInfo = this.getUserInfo()
                console.log('[platform:steam] initialized successfully.', userInfo?.displayName || '(user info pending)')
            } else {
                console.warn('[platform:steam] init failed:', result.errMsg)
            }
            return result
        } catch (err) {
            console.error('[platform:steam] init exception:', err.message)
            console.error('[platform:steam] init exception stack:', err.stack)
            return { ok: false, errMsg: err.message }
        }
    }

    shutdown() {
        if (this._client) {
            try {
                if (typeof this._client.removeAllListeners === 'function') {
                    this._client.removeAllListeners()
                }
                if (typeof this._client.shutdown === 'function') {
                    this._client.shutdown()
                }
            } catch (err) {
                console.warn('[platform:steam] shutdown error:', err.message)
            }
            this._client = null
        }
        this._initialized = false
        this._wasLoggedIn = false
        this._wasSteamRunning = false
        this._overlayActive = false
        this._wasOverlayActive = false
    }

    runCallbacks() {
        try {
            if (!this._client) {
                this._client = this._steam.createClient({ appId: this._config.appId })
            }

            if (!this._initialized && this._client) {
                const isSteamRunning = this._client.isSteamRunning()
                if (isSteamRunning && !this._wasSteamRunning) {
                    console.log('[platform:steam] Steam is now running, attempting initialization...')
                    this._initRetries++
                    this.init().then((result) => {
                        if (result.ok) {
                            console.log('[platform:steam] Dev mode auto-init succeeded')
                            this.emit('connected', { platformId: 'steam' })
                            this._wasLoggedIn = this.isLoggedIn()
                        }
                    })
                }
                this._wasSteamRunning = isSteamRunning
                return
            }

            if (this._client && this._initialized) {
                if (typeof this._client.runCallbacks === 'function') {
                    this._client.runCallbacks()
                }
                const isLogged = this.isLoggedIn()
                if (this._wasLoggedIn && !isLogged) {
                    console.log('[platform:steam] user logged out')
                    this.emit('disconnected', { platformId: 'steam', reason: 'logged-off' })
                } else if (!this._wasLoggedIn && isLogged) {
                    console.log('[platform:steam] user logged in')
                    this.emit('connected', { platformId: 'steam' })
                }
                this._wasLoggedIn = isLogged

                const isOverlayActive = this.isOverlayActive()
                if (!this._wasOverlayActive && isOverlayActive) {
                    console.log('[platform:steam] overlay activated')
                    this._overlayActive = true
                    this.emit('overlay-activated', { platformId: 'steam' })
                } else if (this._wasOverlayActive && !isOverlayActive) {
                    console.log('[platform:steam] overlay deactivated')
                    this._overlayActive = false
                    this.emit('overlay-deactivated', { platformId: 'steam' })
                }
                this._wasOverlayActive = isOverlayActive

                if (!this._client.isSteamRunning()) {
                    console.log('[platform:steam] Steam client stopped running')
                    this._wasSteamRunning = false
                }
            }
        } catch (err) {
            console.warn('[platform:steam] runCallbacks error:', err.message)
        }
    }

    isAvailable() {
        try {
            return this._steam.isAvailable()
        } catch {
            return false
        }
    }

    isInitialized() {
        return this._initialized
    }

    isLoggedIn() {
        if (!this._initialized || !this._client) return false
        try {
            if (typeof this._client.isLoggedOn !== 'function') return false
            return this._client.isLoggedOn()
        } catch {
            return false
        }
    }

    isOwned(appId) {
        if (!this._initialized || !this._client) return false
        try {
            if (typeof this._client.isSubscribedApp !== 'function') return false
            return this._client.isSubscribedApp(appId || this._config.appId)
        } catch {
            return false
        }
    }

    getUserInfo() {
        if (!this._initialized || !this._client) return null
        try {
            if (typeof this._client.getSteamId !== 'function' || typeof this._client.getPersonaName !== 'function') {
                return null
            }
            const steamId = this._client.getSteamId()
            const personaName = this._client.getPersonaName()
            if (!steamId || !personaName) return null
            return {
                platformId: String(steamId),
                displayName: personaName,
                avatarUrl: this.getUserAvatarUrl(),
                steamId: String(steamId),
            }
        } catch (err) {
            console.warn('[platform:steam] getUserInfo error:', err.message)
            return null
        }
    }

    getUserAvatarUrl() {
        if (!this._initialized || !this._client) return null
        try {
            if (typeof this._client.getPersonaAvatarUrl === 'function') {
                return this._client.getPersonaAvatarUrl() || null
            }
            return null
        } catch (err) {
            console.warn('[platform:steam] getUserAvatarUrl error:', err.message)
            return null
        }
    }

    isOverlayEnabled() {
        if (!this._initialized || !this._client) return false
        try {
            if (typeof this._client.isOverlayEnabled === 'function') {
                return this._client.isOverlayEnabled()
            }
            return false
        } catch {
            return false
        }
    }

    isOverlayActive() {
        if (!this._initialized || !this._client) return false
        try {
            if (typeof this._client.isOverlayActive === 'function') {
                return this._client.isOverlayActive()
            }
            return false
        } catch {
            return false
        }
    }

    overlayOpenUrl(url) {
        if (!this._initialized || !this._client) return { ok: false, errMsg: 'Not initialized' }
        try {
            if (typeof this._client.activateGameOverlayToWebPage === 'function') {
                return this._client.activateGameOverlayToWebPage(url, 'Steam')
            }
            return { ok: false, errMsg: 'Overlay web page not supported' }
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    }

    overlayActivateGameOverlay(dialog) {
        if (!this._initialized || !this._client) return { ok: false, errMsg: 'Not initialized' }
        try {
            if (typeof this._client.activateGameOverlay === 'function') {
                const result = this._client.activateGameOverlay(dialog || 'Friends')
                console.log('[platform:steam] activateGameOverlay result:', result)
                return result
            }
            return { ok: false, errMsg: 'Overlay not available' }
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    }

    isDlcInstalled(dlcAppId) {
        if (!this._initialized || !this._client) return false
        try {
            if (typeof this._client.isDlcInstalled === 'function') {
                return this._client.isDlcInstalled(dlcAppId)
            }
            return false
        } catch {
            return false
        }
    }

    getInstalledDlcs() {
        if (!this._initialized || !this._client) return []
        try {
            if (typeof this._client.getInstalledDlcs === 'function') {
                return this._client.getInstalledDlcs() || []
            }
            return []
        } catch {
            return []
        }
    }
}

export function createSteamProvider(config) {
    ensureDllPath()
    const steamModule = loadSteamModule()
    if (!steamModule) return null
    return new SteamPlatformProvider(steamModule, config)
}
