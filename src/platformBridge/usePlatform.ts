import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getPlatformStatus, onPlatformEvent, offPlatformEvent, overlayIsActive as checkOverlayActive, overlayOpenUrl, overlayActivate } from './platform'
import type { DwebPlatformStatus, DwebPlatformUser, DwebPlatformDlcInfo } from './types'

let initCount = 0

export function usePlatform() {
	const status = ref<DwebPlatformStatus | null>(null)
	const loading = ref(true)
	const overlayActiveState = ref(false)

	async function refresh() {
		loading.value = true
		try {
			status.value = await getPlatformStatus()
			overlayActiveState.value = status.value?.overlayActive ?? false
		} catch {
			// keep existing status
		} finally {
			loading.value = false
		}
	}

	let intervalId: ReturnType<typeof setInterval> | null = null
	let statusChangedListenerId: number | null = null
	let disconnectedListenerId: number | null = null
	let overlayActivatedListenerId: number | null = null
	let overlayDeactivatedListenerId: number | null = null

	const onDisconnectedCallbacks: Array<() => void> = []
	const onUserChangedCallbacks: Array<(user: DwebPlatformUser | null) => void> = []
	const onOverlayActivatedCallbacks: Array<() => void> = []
	const onOverlayDeactivatedCallbacks: Array<() => void> = []

	function onDisconnected(cb: () => void) {
		onDisconnectedCallbacks.push(cb)
	}

	function onUserChanged(cb: (user: DwebPlatformUser | null) => void) {
		onUserChangedCallbacks.push(cb)
	}

	function onOverlayActivated(cb: () => void) {
		onOverlayActivatedCallbacks.push(cb)
	}

	function onOverlayDeactivated(cb: () => void) {
		onOverlayDeactivatedCallbacks.push(cb)
	}

	initCount++
	const isFirstInit = initCount === 1

	onMounted(async () => {
		await refresh()

		statusChangedListenerId = onPlatformEvent('status-changed', (newStatus) => {
			status.value = newStatus
			overlayActiveState.value = newStatus?.overlayActive ?? false
			loading.value = false
		})

		disconnectedListenerId = onPlatformEvent('disconnected', (data) => {
			if (isFirstInit) {
				console.log('[usePlatform] platform disconnected:', data)
			}
			for (const cb of onDisconnectedCallbacks) {
				try { cb() } catch {}
			}
			refresh()
		})

		onPlatformEvent('user-changed', (data) => {
			for (const cb of onUserChangedCallbacks) {
				try { cb(data?.user || null) } catch {}
			}
			refresh()
		})

		overlayActivatedListenerId = onPlatformEvent('overlay-activated', () => {
			overlayActiveState.value = true
			for (const cb of onOverlayActivatedCallbacks) {
				try { cb() } catch {}
			}
		})

		overlayDeactivatedListenerId = onPlatformEvent('overlay-deactivated', () => {
			overlayActiveState.value = false
			for (const cb of onOverlayDeactivatedCallbacks) {
				try { cb() } catch {}
			}
		})

		checkOverlayActive().then((active) => {
			overlayActiveState.value = active
		}).catch(() => {})

		if (isFirstInit) {
			intervalId = setInterval(refresh, 15000)
		}
	})

	onUnmounted(() => {
		if (intervalId) {
			clearInterval(intervalId)
			intervalId = null
		}
		if (statusChangedListenerId !== null) {
			offPlatformEvent(statusChangedListenerId)
			statusChangedListenerId = null
		}
		if (disconnectedListenerId !== null) {
			offPlatformEvent(disconnectedListenerId)
			disconnectedListenerId = null
		}
		if (overlayActivatedListenerId !== null) {
			offPlatformEvent(overlayActivatedListenerId)
			overlayActivatedListenerId = null
		}
		if (overlayDeactivatedListenerId !== null) {
			offPlatformEvent(overlayDeactivatedListenerId)
			overlayDeactivatedListenerId = null
		}
		initCount--
	})

	return {
		status,
		loading,
		refresh,
		isSteam: computed(() => status.value?.activePlatform === 'steam'),
		isMock: computed(() => status.value?.activePlatform === 'mock'),
		isRealPlatform: computed(() => status.value?.available ?? false),
		user: computed<DwebPlatformUser | null>(() => status.value?.user ?? null),
		isLoggedIn: computed(() => status.value?.loggedIn ?? false),
		displayName: computed(() => status.value?.activeDisplayName ?? 'Mock'),
		overlayEnabled: computed(() => status.value?.overlayEnabled ?? false),
		overlayActive: computed(() => overlayActiveState.value),
		installedDlcs: computed<DwebPlatformDlcInfo[]>(() => status.value?.installedDlcs ?? []),
		overlayOpenUrl,
		overlayActivate,
		onDisconnected,
		onUserChanged,
		onOverlayActivated,
		onOverlayDeactivated,
	}
}
