import { useSteamHotkeys } from './useSteamHotkeys'

export function useSteamPanel() {
	const { isOpen, isAnimating, open, close, toggle } = useSteamHotkeys()

	return {
		isOpen,
		isAnimating,
		open,
		close,
		toggle,
	}
}
