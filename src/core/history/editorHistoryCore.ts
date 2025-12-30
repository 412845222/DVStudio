import type { EditorSavePayload, EditorSnapshot } from '../editor/types'
import type { TimeoutId } from '../shared/time'
import { exportSnapshotToProjectPackageV1String } from '../project/package'

export type EditorSaveHandler = (payload: EditorSavePayload) => void | Promise<void>

export type HistoryTimers = {
	setTimeout: (handler: () => void, timeoutMs: number) => TimeoutId
	clearTimeout: (id: TimeoutId) => void
}

export const createEditorHistoryCore = (args: {
	captureSnapshot: () => EditorSnapshot
	applySnapshot: (snap: EditorSnapshot) => void
	onStateRestored?: (reason: 'replace' | 'undo' | 'redo') => void
	onSaved?: (payload: EditorSavePayload) => void
	onChanged?: () => void
	maxHistory?: number
	debounceMs?: number
	now?: () => number
	timers?: HistoryTimers
}) => {
	const maxHistory = Number(args.maxHistory ?? 12)
	const debounceMs = Number(args.debounceMs ?? 200)
	const now = args.now ?? (() => Date.now())
	const timers: HistoryTimers = args.timers ?? {
		setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
		clearTimeout: (id) => clearTimeout(id),
	}

	const past: EditorSnapshot[] = []
	const future: EditorSnapshot[] = []
	let current: EditorSnapshot = args.captureSnapshot()

	let isRestoring = false
	let captureTimer: TimeoutId | null = null

	let lastSavedAt: number | null = null
	let saveHandler: EditorSaveHandler | null = null

	const bump = () => {
		args.onChanged?.()
	}

	const commitCaptureNow = () => {
		if (isRestoring) return
		past.push(current)
		if (past.length > maxHistory) past.splice(0, past.length - maxHistory)
		current = args.captureSnapshot()
		future.length = 0
		bump()
	}

	const scheduleCapture = () => {
		if (isRestoring) return
		if (captureTimer != null) return
		captureTimer = timers.setTimeout(() => {
			captureTimer = null
			commitCaptureNow()
		}, debounceMs)
	}

	const flushPendingCapture = () => {
		if (captureTimer == null) return
		timers.clearTimeout(captureTimer)
		captureTimer = null
		commitCaptureNow()
	}

	const applyAndNotify = (snap: EditorSnapshot, reason: 'replace' | 'undo' | 'redo') => {
		args.applySnapshot(snap)
		args.onStateRestored?.(reason)
	}

	const undo = () => {
		flushPendingCapture()
		if (past.length === 0) return
		isRestoring = true
		try {
			future.push(current)
			current = past.pop()!
			applyAndNotify(current, 'undo')
			bump()
		} finally {
			isRestoring = false
		}
	}

	const redo = () => {
		flushPendingCapture()
		if (future.length === 0) return
		isRestoring = true
		try {
			past.push(current)
			if (past.length > maxHistory) past.splice(0, past.length - maxHistory)
			current = future.pop()!
			applyAndNotify(current, 'redo')
			bump()
		} finally {
			isRestoring = false
		}
	}

	const save = async () => {
		flushPendingCapture()

		const savedAt = now()
		const snapshot = args.captureSnapshot()
		const json = JSON.stringify(snapshot)
		const payload: EditorSavePayload = {
			savedAt,
			snapshot,
			json,
			projectPackageJson: exportSnapshotToProjectPackageV1String(snapshot),
		}

		args.onSaved?.(payload)
		if (saveHandler) await saveHandler(payload)
		lastSavedAt = savedAt
		bump()
	}

	const setEditorSaveHandler = (handler: EditorSaveHandler | null) => {
		saveHandler = handler
	}

	const replaceCurrent = (next: EditorSnapshot) => {
		isRestoring = true
		try {
			current = next
			past.length = 0
			future.length = 0
			applyAndNotify(current, 'replace')
			bump()
		} finally {
			isRestoring = false
		}
	}

	return {
		canUndo: () => past.length > 0,
		canRedo: () => future.length > 0,
		getLastSavedAt: () => lastSavedAt,
		undo,
		redo,
		save,
		scheduleCapture,
		flushPendingCapture,
		commitCaptureNow,
		replaceCurrent,
		setEditorSaveHandler,
	}
}
