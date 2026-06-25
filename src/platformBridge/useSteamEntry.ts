import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePlatform } from './usePlatform'

const ENTRY_SHOWN_KEY = 'dweb-steam-entry-shown'
const AUTO_DISMISS_DELAY = 3500
const INITIAL_CONNECT_TIMEOUT = 8000

export function useSteamEntry() {
	const { isSteam, isMock, isLoggedIn, user, isRealPlatform } = usePlatform()

	const showOverlay = ref(false)
	const isConnecting = ref(false)
	const hasCheckedOnce = ref(false)
	const connectionStarted = ref(false)
	const error = ref<string | null>(null)
	let autoDismissTimer: ReturnType<typeof setTimeout> | null = null
	let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null

	const isConnected = computed(() => {
		return isSteam.value && isLoggedIn.value && !!user.value
	})

	const shouldShowEntry = computed(() => {
		if (!isRealPlatform.value) return false
		if (isMock.value) return false
		if (!showOverlay.value) return false
		return true
	})

	function clearTimers() {
		if (autoDismissTimer) {
			clearTimeout(autoDismissTimer)
			autoDismissTimer = null
		}
		if (connectTimeoutTimer) {
			clearTimeout(connectTimeoutTimer)
			connectTimeoutTimer = null
		}
	}

	function startConnecting() {
		if (connectionStarted.value) return
		connectionStarted.value = true
		isConnecting.value = true
		error.value = null
		showOverlay.value = true

		connectTimeoutTimer = setTimeout(() => {
			if (!isConnected.value) {
				console.log('[useSteamEntry] Connection timeout, hiding entry overlay')
				hideOverlay()
			}
		}, INITIAL_CONNECT_TIMEOUT)
	}

	function hideOverlay() {
		clearTimers()
		showOverlay.value = false
		isConnecting.value = false
		hasCheckedOnce.value = true
	}

	watch(isConnected, (connected) => {
		if (connected && connectionStarted.value) {
			isConnecting.value = false
			error.value = null
			clearTimers()

			autoDismissTimer = setTimeout(() => {
				hideOverlay()
			}, AUTO_DISMISS_DELAY)
		}
	})

	watch([isRealPlatform, isSteam, isLoggedIn], ([real, steam, loggedIn], [oldReal, oldSteam, oldLoggedIn]) => {
		if (!hasCheckedOnce.value && real && steam) {
			if (!connectionStarted.value) {
				startConnecting()
			}
		}
	}, { immediate: true })

	onMounted(() => {
		setTimeout(() => {
			if (isRealPlatform.value && isSteam.value && !connectionStarted.value) {
				startConnecting()
			} else if (!isRealPlatform.value || isMock.value) {
				hasCheckedOnce.value = true
			}
		}, 500)
	})

	onUnmounted(() => {
		clearTimers()
	})

	return {
		showOverlay: shouldShowEntry,
		isConnecting,
		isConnected,
		user,
		error,
		hideOverlay,
		isSteam,
	}
}
