import type { TimelineState } from '../timeline'
import type { VideoSceneState } from '../scene'
import type { VideoStudioState } from '../studio'

export type EditorSnapshot = {
	videoScene: VideoSceneState
	videoStudio: VideoStudioState
	timeline: TimelineState
}

export type EditorSavePayload = {
	savedAt: number
	snapshot: EditorSnapshot
	json: string
}
