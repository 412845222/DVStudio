import { computed, ref } from 'vue'
import { TimelineStore } from '../../store/timeline'
import { VideoSceneStore } from '../../store/videoscene'
import { VideoStudioStore } from '../../store/videostudio'
import { cloneJsonSafe } from './clone'

export type EditorSnapshot = {
	videoScene: any
	videoStudio: any
	timeline: any
}

export type EditorSavePayload = {
	savedAt: number
	snapshot: EditorSnapshot
	json: string
}

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
	window.dispatchEvent(new CustomEvent('dweb:editor-state-restored'))
}

// 默认：网页端 12 步即可
const MAX_HISTORY = 12

const past: EditorSnapshot[] = []
const future: EditorSnapshot[] = []
let current: EditorSnapshot = captureSnapshot()

const historyVersion = ref(0)

let isRestoring = false
let captureTimer: number | null = null

const commitCaptureNow = () => {
	if (isRestoring) return
	// 将“当前”推进 past，再把“最新状态”设为 current
	past.push(current)
	if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY)
	current = captureSnapshot()
	future.length = 0
	historyVersion.value++
}

const scheduleCapture = () => {
	if (isRestoring) return
	if (captureTimer != null) return
	captureTimer = window.setTimeout(() => {
		captureTimer = null
		commitCaptureNow()
	}, 200)
}

// 关键：undo/redo 前先把防抖快照落盘，否则 past 可能为空导致“撤销无效”
const flushPendingCapture = () => {
	if (captureTimer == null) return
	clearTimeout(captureTimer)
	captureTimer = null
	commitCaptureNow()
}

// 初始化订阅：任何 mutation 都会进入历史（做了 200ms 合并）
VideoSceneStore.subscribe(() => scheduleCapture())
VideoStudioStore.subscribe(() => scheduleCapture())
TimelineStore.subscribe(() => scheduleCapture())

const lastSavedAt = ref<number | null>(null)
let saveHandler: EditorSaveHandler | null = null

const save = async () => {
	// 保存前也 flush 一次，确保 json 与“当前编辑态”一致
	flushPendingCapture()

	const savedAt = Date.now()
	const snapshot = captureSnapshot()
	const json = JSON.stringify(snapshot)
	const payload: EditorSavePayload = { savedAt, snapshot, json }

	window.dispatchEvent(new CustomEvent('dweb:save', { detail: payload }))

	if (saveHandler) await saveHandler(payload)
	lastSavedAt.value = savedAt
}

const undo = () => {
	flushPendingCapture()
	if (past.length === 0) return
	isRestoring = true
	try {
		future.push(current)
		current = past.pop()!
		applySnapshot(current)
		historyVersion.value++
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
		if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY)
		current = future.pop()!
		applySnapshot(current)
		historyVersion.value++
	} finally {
		isRestoring = false
	}
}

export const setEditorSaveHandler = (handler: EditorSaveHandler | null) => {
	saveHandler = handler
}

export const editorHistory = {
	lastSavedAt,
	canUndo: computed(() => {
		void historyVersion.value
		return past.length > 0
	}),
	canRedo: computed(() => {
		void historyVersion.value
		return future.length > 0
	}),
	undo,
	redo,
	save,
}
