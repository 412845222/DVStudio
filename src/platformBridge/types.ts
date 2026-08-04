export type PlatformId = 'steam' | 'epic' | 'mock' | 'wegame' | 'none'

export interface DwebPlatformUser {
	platformId: string
	displayName: string
	avatarUrl?: string
	steamId?: string
}

export interface DwebPlatformDlcInfo {
	appId: number
	name: string
	installed: boolean
}

export interface DwebPlatformProviderInfo {
	id: string
	displayName: string
	available: boolean
	initialized: boolean
}

export interface DwebPlatformStatus {
	activePlatform: PlatformId
	activeDisplayName: string
	available: boolean
	initialized: boolean
	loggedIn: boolean
	user: DwebPlatformUser | null
	overlayEnabled: boolean
	overlayActive: boolean
	installedDlcs: DwebPlatformDlcInfo[]
	allPlatforms: DwebPlatformProviderInfo[]
}

export type PlatformEventName =
	| 'disconnected'
	| 'user-changed'
	| 'overlay-activated'
	| 'overlay-deactivated'
	| 'status-changed'

export interface PlatformEventPayload {
	event: PlatformEventName
	data: unknown
}

export type PlatformEventMap = {
	'overlay-activated': { platformId: PlatformId }
	'overlay-deactivated': { platformId: PlatformId }
	disconnected: { platformId: PlatformId; reason: string }
	'user-changed': { user: DwebPlatformUser | null }
	'status-changed': DwebPlatformStatus
}

export type PlatformEventListener<T extends PlatformEventName> = (
	payload: T extends keyof PlatformEventMap ? PlatformEventMap[T] : unknown
) => void
