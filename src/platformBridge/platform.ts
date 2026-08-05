import type {
	DwebPlatformStatus,
	DwebPlatformUser,
	DwebPlatformDlcInfo,
	PlatformId,
	PlatformEventPayload,
	PlatformEventName,
	PlatformEventListener,
	PlatformEventMap
} from './types'

const w = window as unknown as Record<string, unknown>

let statusCache: DwebPlatformStatus | null = null
const eventListeners = new Map<number, (payload: PlatformEventPayload) => void>()
let eventSeed = 0
let globalListenerId: number | null = null

interface DwebPlatformApi {
	onEvent?: (listener: (payload: PlatformEventPayload) => void) => number
	offEvent?: (listenerId: number) => void
	getStatus?: () => Promise<DwebPlatformStatus>
	getActive?: () => Promise<{ id: PlatformId; displayName: string }>
	getUser?: () => Promise<DwebPlatformUser | null>
	isAvailable?: () => Promise<boolean>
	overlayIsEnabled?: () => Promise<boolean>
	overlayIsActive?: () => Promise<boolean>
	overlayOpenUrl?: (url: string) => Promise<{ ok: boolean; errMsg?: string }>
	overlayActivate?: (dialog?: string) => Promise<{ ok: boolean; errMsg?: string }>
	dlcIsInstalled?: (dlcAppId: number) => Promise<boolean>
	dlcGetInstalled?: () => Promise<DwebPlatformDlcInfo[]>
}

function getPlatformApi() {
	const dweb = w.dweb as { platform?: DwebPlatformApi } | undefined
	return dweb?.platform || null
}

function dispatchEventToListeners(payload: PlatformEventPayload) {
	if (payload.event === 'status-changed' && payload.data) {
		statusCache = payload.data as DwebPlatformStatus
	}
	for (const listener of eventListeners.values()) {
		try {
			listener(payload)
		} catch {
			/* ignore */
		}
	}
}

function ensureGlobalListener() {
	if (globalListenerId !== null) return
	const api = getPlatformApi()
	if (!api?.onEvent) return
	globalListenerId = api.onEvent(dispatchEventToListeners)
}

function getDefaultStatus(): DwebPlatformStatus {
	return {
		activePlatform: 'mock',
		activeDisplayName: 'Mock',
		available: false,
		initialized: true,
		loggedIn: true,
		user: { platformId: 'mock-0', displayName: 'Developer' },
		overlayEnabled: false,
		overlayActive: false,
		installedDlcs: [],
		allPlatforms: [{ id: 'mock', displayName: 'Mock', available: true, initialized: true }]
	}
}

export function isPlatformAvailable(): boolean {
	return !!getPlatformApi()
}

export async function getPlatformStatus(): Promise<DwebPlatformStatus> {
	const api = getPlatformApi()
	if (!api?.getStatus) {
		return getDefaultStatus()
	}
	try {
		const status = await api.getStatus()
		statusCache = status
		return status
	} catch {
		return statusCache || getDefaultStatus()
	}
}

export async function getActivePlatform(): Promise<{ id: PlatformId; displayName: string }> {
	const api = getPlatformApi()
	if (!api?.getActive) return { id: 'mock', displayName: 'Mock' }
	try {
		return await api.getActive()
	} catch {
		return { id: 'mock', displayName: 'Mock' }
	}
}

export async function getPlatformUser(): Promise<DwebPlatformUser | null> {
	const api = getPlatformApi()
	if (!api?.getUser) return null
	try {
		return await api.getUser()
	} catch {
		return null
	}
}

export async function isPlatformReal(): Promise<boolean> {
	const api = getPlatformApi()
	if (!api?.isAvailable) return false
	try {
		return await api.isAvailable()
	} catch {
		return false
	}
}

export async function overlayIsEnabled(): Promise<boolean> {
	const api = getPlatformApi()
	if (!api?.overlayIsEnabled) return false
	try {
		return await api.overlayIsEnabled()
	} catch {
		return false
	}
}

export async function overlayIsActive(): Promise<boolean> {
	const api = getPlatformApi()
	if (!api?.overlayIsActive) return false
	try {
		return await api.overlayIsActive()
	} catch {
		return false
	}
}

export async function overlayOpenUrl(url: string): Promise<{ ok: boolean; errMsg?: string }> {
	const api = getPlatformApi()
	if (!api?.overlayOpenUrl) return { ok: false, errMsg: 'Platform API not available' }
	try {
		return await api.overlayOpenUrl(url)
	} catch (err: unknown) {
		return { ok: false, errMsg: (err as Error)?.message || 'Unknown error' }
	}
}

export async function overlayActivate(dialog?: string): Promise<{ ok: boolean; errMsg?: string }> {
	const api = getPlatformApi()
	if (!api?.overlayActivate) return { ok: false, errMsg: 'Platform API not available' }
	try {
		return await api.overlayActivate(dialog)
	} catch (err: unknown) {
		return { ok: false, errMsg: (err as Error)?.message || 'Unknown error' }
	}
}

export async function dlcIsInstalled(dlcAppId: number): Promise<boolean> {
	const api = getPlatformApi()
	if (!api?.dlcIsInstalled) return false
	try {
		return await api.dlcIsInstalled(dlcAppId)
	} catch {
		return false
	}
}

export async function dlcGetInstalled(): Promise<DwebPlatformDlcInfo[]> {
	const api = getPlatformApi()
	if (!api?.dlcGetInstalled) return []
	try {
		return await api.dlcGetInstalled()
	} catch {
		return []
	}
}

export function getCachedPlatformStatus(): DwebPlatformStatus | null {
	return statusCache
}

export function onPlatformEvent<T extends PlatformEventName>(
	event: T | '*',
	listener: PlatformEventListener<T>
): number {
	ensureGlobalListener()
	const id = ++eventSeed
	const wrapped = (payload: PlatformEventPayload) => {
		if (event === '*' || payload.event === event) {
			listener(payload.data as unknown as Parameters<PlatformEventListener<T>>[0])
		}
	}
	eventListeners.set(id, wrapped)
	return id
}

export function offPlatformEvent(listenerId: number): { ok: boolean } {
	const removed = eventListeners.delete(listenerId)
	if (removed && eventListeners.size === 0 && globalListenerId !== null) {
		const api = getPlatformApi()
		if (api?.offEvent) {
			api.offEvent(globalListenerId)
		}
		globalListenerId = null
	}
	return { ok: removed }
}
