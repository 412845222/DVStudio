import { computed, reactive, readonly } from 'vue'
import type {
	StartupProgressState,
	StartupProgressStep
} from '../ui/UIComponent/StartupProgressBar.vue'
import { getErrorMessage } from '../types/utils'

type InternalStep = {
	key: string
	label: string
	status: 'idle' | 'running' | 'ok' | 'warn' | 'error'
	detail: string
}

type InternalState = {
	visible: boolean
	title: string
	steps: InternalStep[]
	autoHideMs: number | null
}

const state = reactive<InternalState>({
	visible: false,
	title: '',
	steps: [],
	autoHideMs: 3000
})

function toStepList(internal: InternalStep[]): StartupProgressStep[] {
	return internal.map((s) => ({
		key: s.key,
		label: s.label,
		status: s.status,
		detail: s.detail || undefined
	}))
}

function findIndexOrAppend(steps: InternalStep[], key: string): number {
	const existingIdx = steps.findIndex((s) => s.key === key)
	if (existingIdx >= 0) return existingIdx
	return steps.length
}

export const useStartupProgress = () => {
	const publicState = computed<StartupProgressState>(() => ({
		visible: state.visible,
		title: state.title,
		steps: toStepList(state.steps),
		autoHideMs: state.autoHideMs
	}))

	const show = (title: string, autoHideMs: number | null = 3000) => {
		state.title = title
		state.visible = true
		state.autoHideMs = autoHideMs
	}

	const hide = () => {
		state.visible = false
	}

	const reset = (title?: string) => {
		state.steps = []
		state.title = title || state.title || ''
		state.visible = true
	}

	const setTitle = (title: string) => {
		state.title = title
	}

	const beginStep = (key: string, label: string, index?: number) => {
		const idx = typeof index === 'number' ? index : findIndexOrAppend(state.steps, key)
		const step: InternalStep = { key, label, status: 'running', detail: '' }
		if (idx >= state.steps.length) state.steps.push(step)
		else state.steps.splice(idx, 0, step)
	}

	const updateStep = (
		key: string,
		payload: {
			label?: string
			status?: 'idle' | 'running' | 'ok' | 'warn' | 'error'
			detail?: string
		}
	) => {
		const step = state.steps.find((s) => s.key === key)
		if (!step) return
		if (typeof payload.label === 'string') step.label = payload.label
		if (typeof payload.status !== 'undefined') step.status = payload.status
		if (typeof payload.detail !== 'undefined') step.detail = payload.detail
	}

	const markStepOk = (key: string, detail?: string) => {
		updateStep(key, { status: 'ok', detail })
	}

	const markStepWarn = (key: string, detail?: string) => {
		updateStep(key, { status: 'warn', detail })
	}

	const markStepError = (key: string, detail?: string) => {
		updateStep(key, { status: 'error', detail })
	}

	const removeStep = (key: string) => {
		const idx = state.steps.findIndex((s) => s.key === key)
		if (idx >= 0) state.steps.splice(idx, 1)
	}

	const runStep = async <T>(
		key: string,
		label: string,
		fn: () => T | Promise<T>,
		opts?: { index?: number; errorDetailOnFailure?: boolean }
	): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
		beginStep(key, label, opts?.index)
		try {
			const value = await fn()
			markStepOk(key)
			return { ok: true, value }
		} catch (e: unknown) {
			const detail = opts?.errorDetailOnFailure !== false ? getErrorMessage(e) : ''
			markStepError(key, detail)
			return { ok: false, error: e }
		}
	}

	return {
		state: publicState,
		raw: readonly(state),
		show,
		hide,
		reset,
		setTitle,
		beginStep,
		updateStep,
		markStepOk,
		markStepWarn,
		markStepError,
		removeStep,
		runStep
	}
}
