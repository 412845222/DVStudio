import type { Ref } from 'vue'
import { useSteamHotkeys } from './useSteamHotkeys'

export function useSteamPanel(enabled?: Ref<boolean>) {
	const { isOpen, isAnimating, open, close, toggle } = useSteamHotkeys(enabled)

	return {
		isOpen,
		isAnimating,
		open,
		close,
		toggle
	}
}
