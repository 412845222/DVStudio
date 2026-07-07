import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'
export type ModalTone = 'info' | 'success' | 'warn' | 'error'

export interface ToastAction {
	label: string
	onClick?: () => void
}

export interface ToastItem {
	id: string
	message: string
	tone?: ToastTone
	duration?: number
	persistent?: boolean
	showClose?: boolean
	actions?: ToastAction[]
}

export interface ModalOptions {
	title: string
	message?: string
	tone?: ModalTone
	confirmText?: string
	cancelText?: string
	showCancel?: boolean
}

const toasts = ref<ToastItem[]>([])
const activeModal = ref<(ModalOptions & { resolve?: (value: boolean) => void }) | null>(null)
const isHovering = ref(false)
const toastTimers = new Map<string, number>()
const toastRemaining = new Map<string, number>()

function generateId(): string {
	return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function pauseTimers() {
	toastTimers.forEach((timerId, id) => {
		window.clearTimeout(timerId)
		const startTime = (toastTimers as any)._startTimes?.get(id) || Date.now()
		const remaining = ((toastTimers as any)._durations?.get(id) || 2600) - (Date.now() - startTime)
		toastRemaining.set(id, Math.max(remaining, 300))
	})
	toastTimers.clear()
	;(toastTimers as any)._startTimes = new Map()
	;(toastTimers as any)._durations = new Map()
}

function resumeTimers() {
	toasts.value.forEach((toast) => {
		if (toast.persistent) return
		const remaining = toastRemaining.get(toast.id) || toast.duration || 2600
		scheduleToastRemoval(toast.id, remaining)
	})
	toastRemaining.clear()
}

function scheduleToastRemoval(id: string, duration: number) {
	if (!(toastTimers as any)._startTimes) {
		;(toastTimers as any)._startTimes = new Map()
		;(toastTimers as any)._durations = new Map()
	}
	;(toastTimers as any)._startTimes.set(id, Date.now())
	;(toastTimers as any)._durations.set(id, duration)
	const timerId = window.setTimeout(() => {
		removeToast(id)
	}, duration)
	toastTimers.set(id, timerId)
}

export function pushToast(message: string, tone: ToastTone = 'info', options?: Partial<Omit<ToastItem, 'id' | 'message' | 'tone'>>) {
	const id = generateId()
	const toast: ToastItem = {
		id,
		message,
		tone,
		duration: options?.persistent ? undefined : (options?.duration || 2600),
		persistent: options?.persistent || false,
		showClose: options?.showClose !== false,
		actions: options?.actions,
	}
	toasts.value.push(toast)
	if (!toast.persistent) {
		scheduleToastRemoval(id, toast.duration || 2600)
	}
	return id
}

export function removeToast(id: string) {
	const timerId = toastTimers.get(id)
	if (timerId) {
		window.clearTimeout(timerId)
		toastTimers.delete(id)
	}
	toastRemaining.delete(id)
	if ((toastTimers as any)._startTimes) {
		;(toastTimers as any)._startTimes.delete(id)
		;(toastTimers as any)._durations.delete(id)
	}
	const idx = toasts.value.findIndex(t => t.id === id)
	if (idx >= 0) {
		toasts.value.splice(idx, 1)
	}
}

export function handleAction(toastId: string, action: ToastAction) {
	action.onClick?.()
	removeToast(toastId)
}

export function setToastHovering(hovering: boolean) {
	isHovering.value = hovering
	if (hovering) {
		pauseTimers()
	} else {
		resumeTimers()
	}
}

export function showConfirm(options: ModalOptions): Promise<boolean> {
	return new Promise((resolve) => {
		if (activeModal.value?.resolve) {
			activeModal.value.resolve(false)
		}
		activeModal.value = {
			...options,
			resolve,
		}
	})
}

export function confirmModal() {
	if (activeModal.value?.resolve) {
		activeModal.value.resolve(true)
	}
	activeModal.value = null
}

export function cancelModal() {
	if (activeModal.value?.resolve) {
		activeModal.value.resolve(false)
	}
	activeModal.value = null
}

export function toastSuccess(message: string, duration?: number) {
	return pushToast(message, 'success', { duration })
}

export function toastError(message: string, options?: Partial<Omit<ToastItem, 'id' | 'message' | 'tone'>>) {
	return pushToast(message, 'error', { persistent: true, ...options })
}

export function toastWarn(message: string, duration?: number) {
	return pushToast(message, 'warn', { duration: duration || 3500 })
}

export function toastInfo(message: string, duration?: number) {
	return pushToast(message, 'info', { duration })
}

export async function confirmDelete(title: string, message?: string, options?: { confirmText?: string; cancelText?: string }): Promise<boolean> {
	return showConfirm({
		title,
		message,
		tone: 'warn',
		confirmText: options?.confirmText || 'Delete',
		cancelText: options?.cancelText || 'Cancel',
	})
}

export function useGlobalFeedback() {
	return {
		toasts,
		activeModal,
		isHovering,
		pushToast,
		removeToast,
		handleAction,
		setToastHovering,
		showConfirm,
		confirmModal,
		cancelModal,
		toastSuccess,
		toastError,
		toastWarn,
		toastInfo,
		confirmDelete,
	}
}
