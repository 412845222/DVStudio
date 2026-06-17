import { onBeforeUnmount, ref } from 'vue'
import type { ToastItem } from '../../../../ui/UIComponent/ToastStack.vue'

export const useAIWorkflowToastState = (options?: { durationMs?: number }) => {
  const toasts = ref<ToastItem[]>([])
  const toastHovering = ref(false)
  const toastTimers = new Map<string, number>()
  const toastDeadlines = new Map<string, number>()
  const toastRemaining = new Map<string, number>()

  const durationMs = Number.isFinite(Number(options?.durationMs))
    ? Math.max(0, Number(options?.durationMs))
    : 2600

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
    const timer = toastTimers.get(id)
    if (timer) {
      window.clearTimeout(timer)
      toastTimers.delete(id)
    }
    toastDeadlines.delete(id)
    toastRemaining.delete(id)
  }

  const scheduleToastDismiss = (id: string, ms: number) => {
    const oldTimer = toastTimers.get(id)
    if (oldTimer) window.clearTimeout(oldTimer)
    const timeoutMs = Math.max(0, ms)
    toastDeadlines.set(id, performance.now() + timeoutMs)
    const timer = window.setTimeout(() => removeToast(id), timeoutMs)
    toastTimers.set(id, timer)
  }

  const pauseToastTimers = () => {
    const now = performance.now()
    for (const toast of toasts.value) {
      const id = toast.id
      const timer = toastTimers.get(id)
      if (!timer) continue
      window.clearTimeout(timer)
      toastTimers.delete(id)
      const deadline = toastDeadlines.get(id)
      const remaining = typeof deadline === 'number' ? Math.max(0, deadline - now) : 0
      toastRemaining.set(id, remaining)
    }
  }

  const resumeToastTimers = () => {
    for (const toast of toasts.value) {
      const id = toast.id
      if (toastTimers.has(id)) continue
      const remaining = toastRemaining.get(id)
      if (typeof remaining === 'number') {
        toastRemaining.delete(id)
        if (remaining <= 0) {
          removeToast(id)
          continue
        }
        scheduleToastDismiss(id, remaining)
        continue
      }
      scheduleToastDismiss(id, durationMs)
    }
  }

  const setToastHovering = (hovering: boolean) => {
    const next = !!hovering
    if (toastHovering.value === next) return
    toastHovering.value = next
    if (next) pauseToastTimers()
    else resumeToastTimers()
  }

  const pushToast = (message: string, tone: ToastItem['tone'] = 'warn') => {
    if (tone === 'error') {
      console.error('[AIWorkflow Toast]', message)
    }
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    toasts.value = [...toasts.value, { id, message, tone }]
    if (toastHovering.value) {
      toastRemaining.set(id, durationMs)
      return
    }
    scheduleToastDismiss(id, durationMs)
  }

  onBeforeUnmount(() => {
    for (const timer of toastTimers.values()) {
      window.clearTimeout(timer)
    }
    toastTimers.clear()
    toastDeadlines.clear()
    toastRemaining.clear()
  })

  return {
    toasts,
    toastHovering,
    pushToast,
    removeToast,
    setToastHovering,
  }
}
