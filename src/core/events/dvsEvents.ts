import type { EditorSavePayload } from '../editor/types'

export const DVS_EVENTS = {
	TimelineNav: 'dvs:timeline/nav',
	EditorStateRestored: 'dvs:editor/state-restored',
	EditorSaved: 'dvs:editor/saved',
} as const

export type DvsTimelineNavDetail = {
	dir: -1 | 1
	direction: 'back' | 'forward'
	reason?: 'browser' | 'keyboard' | 'ui' | 'program'
}

export type DvsEditorStateRestoredDetail = {
	at: number
	reason?: 'undo' | 'redo' | 'load' | 'replace'
}

export type DvsEditorSavedDetail = EditorSavePayload
