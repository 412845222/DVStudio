import { ref } from 'vue'
import { createEditorHistoryCore } from '../core/history'
import { cloneJsonSafe } from '../core/shared/cloneJsonSafe'
import type {
	WorkflowDirectorCameraTrack,
	WorkflowDirectorCharacter,
	WorkflowDirectorLightRig
} from '../aiworkflow/types'

export type DirectorConsoleSnapshot = {
	cameraTracks?: WorkflowDirectorCameraTrack[]
	activeCameraTrackId?: string
	lightRig?: WorkflowDirectorLightRig
	characters?: WorkflowDirectorCharacter[]
	cameraParentId?: string | null
	fps?: number
	totalFrames?: number
}

export function createDirectorConsoleHistory(opts: {
	captureSnapshot: () => DirectorConsoleSnapshot
	applySnapshot: (snap: DirectorConsoleSnapshot) => void
	onChanged?: () => void
	maxHistory?: number
	debounceMs?: number
}) {
	const historyVersion = ref(0)

	const historyCore = createEditorHistoryCore<DirectorConsoleSnapshot>({
		captureSnapshot: opts.captureSnapshot,
		applySnapshot: opts.applySnapshot,
		onChanged: () => {
			historyVersion.value++
			opts.onChanged?.()
		},
		maxHistory: opts.maxHistory ?? 20,
		debounceMs: opts.debounceMs ?? 300
	})

	const canUndo = () => {
		void historyVersion.value
		return historyCore.canUndo()
	}

	const canRedo = () => {
		void historyVersion.value
		return historyCore.canRedo()
	}

	return {
		canUndo,
		canRedo,
		undo: historyCore.undo,
		redo: historyCore.redo,
		scheduleCapture: historyCore.scheduleCapture,
		flushPendingCapture: historyCore.flushPendingCapture,
		commitCaptureNow: historyCore.commitCaptureNow,
		replaceCurrent: (snap: DirectorConsoleSnapshot) =>
			historyCore.replaceCurrent(cloneJsonSafe(snap)),
		historyVersion
	}
}
