import { ref, watch, nextTick, type Ref } from 'vue'

const isPanelOpen = ref(false)
const isAnimating = ref(false)
let listenerBound = false
let boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null
let previousBodyOverflow = ''
let lastFocusedElement: HTMLElement | null = null
let enabledRef: Ref<boolean> | null = null

function isEditableTarget(target: EventTarget | null): boolean {
	if (!target) return false
	const el = target as HTMLElement
	if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
	if (el.isContentEditable) return true
	if (el.closest('[contenteditable="true"]')) return true
	return false
}

function lockBodyScroll() {
	if (typeof document === 'undefined') return
	previousBodyOverflow = document.body.style.overflow
	document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
	if (typeof document === 'undefined') return
	document.body.style.overflow = previousBodyOverflow
}

function saveFocus() {
	if (typeof document === 'undefined') return
	lastFocusedElement = document.activeElement as HTMLElement | null
}

function restoreFocus() {
	if (typeof document === 'undefined' || !lastFocusedElement) return
	try {
		lastFocusedElement.focus()
	} catch {
	}
	lastFocusedElement = null
}

function moveFocusToPanel() {
	nextTick(() => {
		if (typeof document === 'undefined') return
		const panelCloseButton = document.querySelector('.steam-panel .panel-close-btn') as HTMLElement | null
		if (panelCloseButton) {
			panelCloseButton.focus()
		}
	})
}

function getPanelFocusableElements(): HTMLElement[] {
	if (typeof document === 'undefined') return []
	const panel = document.querySelector('.steam-panel') as HTMLElement | null
	if (!panel) return []
	const focusableSelectors = [
		'button:not([disabled])',
		'[href]',
		'input:not([disabled])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])',
	]
	const elements = panel.querySelectorAll(focusableSelectors.join(','))
	return Array.from(elements).filter(el => {
		const htmlEl = el as HTMLElement
		return htmlEl.offsetParent !== null && !htmlEl.hasAttribute('disabled')
	}) as HTMLElement[]
}

function isEnabled(): boolean {
	return !enabledRef || enabledRef.value
}

function openPanel() {
	if (!isEnabled() || isAnimating.value) return
	isPanelOpen.value = true
}

function closePanel() {
	if (isAnimating.value) return
	isPanelOpen.value = false
}

function togglePanel() {
	if (!isEnabled() || isAnimating.value) return
	isPanelOpen.value = !isPanelOpen.value
}

function handleKeydown(e: KeyboardEvent) {
	if (!isEnabled()) return

	if (e.shiftKey && e.key === 'Tab') {
		if (isEditableTarget(e.target)) return
		if (isPanelOpen.value) {
			const focusable = getPanelFocusableElements()
			if (focusable.length > 0) {
				const first = focusable[0]
				if (document.activeElement === first) {
					e.preventDefault()
					e.stopPropagation()
					e.stopImmediatePropagation()
					const last = focusable[focusable.length - 1]
					last.focus()
					return
				}
			}
			return
		}
		e.preventDefault()
		e.stopPropagation()
		e.stopImmediatePropagation()
		openPanel()
		return
	}
	if (e.key === 'Escape' && isPanelOpen.value) {
		if (isEditableTarget(e.target)) return
		e.preventDefault()
		e.stopPropagation()
		e.stopImmediatePropagation()
		closePanel()
		return
	}
	if (isPanelOpen.value && e.key === 'Tab' && !e.shiftKey) {
		const focusable = getPanelFocusableElements()
		if (focusable.length > 0) {
			const last = focusable[focusable.length - 1]
			if (document.activeElement === last) {
				e.preventDefault()
				e.stopPropagation()
				e.stopImmediatePropagation()
				const first = focusable[0]
				first.focus()
			}
		}
	}
}

function ensureListener() {
	if (listenerBound) return
	if (typeof document === 'undefined') return

	boundKeydownHandler = handleKeydown

	document.addEventListener('keydown', boundKeydownHandler, {
		capture: true,
		passive: false,
	})

	listenerBound = true
}

watch(isPanelOpen, (open) => {
	isAnimating.value = true
	if (open) {
		saveFocus()
		lockBodyScroll()
		moveFocusToPanel()
	} else {
		unlockBodyScroll()
		restoreFocus()
	}
	setTimeout(() => {
		isAnimating.value = false
	}, 320)
})

if (enabledRef) {
	watch(enabledRef, (enabled) => {
		if (!enabled && isPanelOpen.value) {
			isPanelOpen.value = false
		}
	})
}

export function useSteamHotkeys(enabled?: Ref<boolean>) {
	enabledRef = enabled ?? null
	ensureListener()

	return {
		isOpen: isPanelOpen,
		isAnimating,
		open: openPanel,
		close: closePanel,
		toggle: togglePanel,
	}
}
