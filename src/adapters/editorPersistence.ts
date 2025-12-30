import { computed, ref } from 'vue'
import { TimelineStore } from '../store/timeline'
import { VideoSceneStore } from '../store/videoscene'
import { VideoStudioStore } from '../store/videostudio'
import type { EditorSavePayload, EditorSnapshot } from '../core/editor/types'
import { cloneJsonSafe } from '../core/shared/cloneJsonSafe'
import { createEditorHistoryCore } from '../core/history'
import { dispatchDvsEditorSaved, dispatchDvsEditorStateRestored } from './windowEventBridge'

export type { EditorSavePayload, EditorSnapshot } from '../core/editor/types'

export type EditorSaveHandler = (payload: EditorSavePayload) => void | Promise<void>

const captureSnapshot = (): EditorSnapshot => {
	return {
		videoScene: cloneJsonSafe(VideoSceneStore.state),
		videoStudio: cloneJsonSafe(VideoStudioStore.state),
		timeline: cloneJsonSafe(TimelineStore.state),
	}
}

const applySnapshot = (snap: EditorSnapshot) => {
	VideoSceneStore.replaceState(cloneJsonSafe(snap.videoScene))
	VideoStudioStore.replaceState(cloneJsonSafe(snap.videoStudio))
	TimelineStore.replaceState(cloneJsonSafe(snap.timeline))
}

const historyVersion = ref(0)

const historyCore = createEditorHistoryCore({
	captureSnapshot,
	applySnapshot,
	onStateRestored: (reason) => {
		dispatchDvsEditorStateRestored(reason)
	},
	onSaved: (payload) => {
		dispatchDvsEditorSaved(payload)
	},
	onChanged: () => {
		historyVersion.value++
	},
})

// 初始化订阅：任何 mutation 都会进入历史（做了 200ms 合并）
VideoSceneStore.subscribe(() => historyCore.scheduleCapture())
VideoStudioStore.subscribe(() => historyCore.scheduleCapture())
TimelineStore.subscribe(() => historyCore.scheduleCapture())

const lastSavedAt = ref<number | null>(null)
let saveHandler: EditorSaveHandler | null = null

const save = async () => {
	historyCore.setEditorSaveHandler(saveHandler)
	await historyCore.save()
	lastSavedAt.value = historyCore.getLastSavedAt()
}

const getSnapshot = (): EditorSnapshot => {
	return captureSnapshot()
}

const replace = (snapshot: EditorSnapshot) => {
	historyCore.replaceCurrent(cloneJsonSafe(snapshot))
	lastSavedAt.value = null
}

const undo = () => {
	historyCore.undo()
}

const redo = () => {
	historyCore.redo()
}

export const setEditorSaveHandler = (handler: EditorSaveHandler | null) => {
	saveHandler = handler
}

export const editorPersistence = {
	lastSavedAt,
	getSnapshot,
	replace,
	canUndo: computed(() => {
		void historyVersion.value
		return historyCore.canUndo()
	}),
	canRedo: computed(() => {
		void historyVersion.value
		return historyCore.canRedo()
	}),
	undo,
	redo,
	save,
}
